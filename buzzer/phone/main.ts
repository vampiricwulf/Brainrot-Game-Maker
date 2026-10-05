/**
 * The phone page: room code → tap your name → one big buzzer. Talks to the room over one WebSocket (see
 * src/lib/buzzproto.ts); keeps its seat token in localStorage so a reload or a dropped connection gets the seat back.
 *
 * Fair timing: the page notes when it shows BUZZ! for an arm and sends the time from then to the press (reactMs) with
 * the buzz; it echoes every probe from the room at once, so the room can time this phone's round trip itself.
 *
 * Dead sockets: a phone back from the background (or a buzz the room doesn't answer) checks the connection with a ping
 * ("Checking connection…") and starts again if no pong comes back in a couple of seconds. A press the room hasn't
 * answered is kept and sent again once back in the seat, if the buzzers are still open for that arm; otherwise the
 * phone says it didn't get through. One socket at a time: a new one replaces the old, whose events are ignored.
 *
 * Wagers: while the host takes them (a Daily Double, a Final), the player's own box replaces the buzzer; what they send
 * goes to the host only. Their view says what's in (and once locked, what was locked in).
 */
import { isRoomCode, ROOM_ALPHABET, type DenyReason, type PhoneView, type PhoneWager, type RoomToPhone } from '../../src/lib/buzzproto';
import { PLAYER_COLOR_NAMES, PLAYER_PALETTE } from '../../src/lib/colors';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['s-code', 's-wait', 's-seats', 's-new', 's-team', 's-msg', 's-buzz'] as const;
type ScreenId = (typeof screens)[number];

type SeatsMsg = Extract<RoomToPhone, { t: 'seats' }>;
type ResultMsg = Extract<RoomToPhone, { t: 'result' }>;
/** A full-screen message (game over, kicked, no such room…), with an optional button. */
interface Notice {
  title: string;
  text: string;
  button?: { label: string; run: () => void };
  /** No reconnecting after this one. */
  final?: boolean;
  /** The room was full: it goes away once the room lets this phone in. */
  full?: boolean;
}

/** No pong this long after a ping sent to check the connection: it's dead, start again. */
const PROBE_MS = 2500;
/** No answer to a buzz this long: the connection is dead (the buzz is lost), start again. */
const BUZZ_ANSWER_MS = 3000;
/** Buzzes sent this close together at most. */
const BUZZ_GAP_MS = 150;

let code = '';
let ws: WebSocket | null = null;
let connected = false;
let everConnected = false;
let attempts = 0;
let retryTimer = 0;
let pingTimer = 0;
let probeTimer = 0;
let lastPong = 0;
/** Server time minus local time, from pongs. */
let offset = 0;
/** Turned away as full this many times in a row (the wait before trying again grows). */
let fullTries = 0;

let seats: SeatsMsg | null = null;
let seatId: string | null = null;
let view: PhoneView | null = null;
/** Waiting for the answer to a join with a saved token: don't flash the seat list. */
let rejoining = false;
/** The name this phone asked to join as, while waiting for the host (asked again after a dropped connection). */
let pendingName: string | null = null;
let newForm = false;
/** Teams: the team tapped, while this phone gives its name (and until the room answers). */
let teamPick: SeatsMsg['seats'][number] | null = null;
/** Teams: a join sent for teamPick that the room hasn't answered yet. */
let teamAsked = false;
let notice: Notice | null = null;
let seatsNote = '';
let result: ResultMsg | null = null;
/** Server time this seat's early-buzz lock ends. */
let lockedUntil = 0;
let tick = 0;
/** When (performance.now()) this phone first showed BUZZ! for armId litArm. */
let litArm = -1;
let litAt = 0;
/** The arm of a buzz sent that the room hasn't answered yet (-1: none). */
let sendingArm = -1;
let sendingTimer = 0;
/** When the last press buzzed (performance.now()), so a click right after a pointerdown doesn't buzz twice. */
let lastPress = -1000;
/** When the last buzz went to the room (performance.now()). */
let lastSent = -1000;
/** A press the room hasn't answered yet, and the socket it went out on (null: not sent yet). */
let held: { armId: number; reactMs?: number; on: WebSocket | null } | null = null;
/** A held press couldn't be sent again (its arm was over): "didn't get through" shows while the arm is this one. */
let lostArm = -1;
/** The last state cue (BUZZ! lit, you won) played, so each plays once. */
let cued = '';
/** Why the room didn't take the last wager sent ('' when it did, or none was sent). */
let wagerErr = '';
/** The wager round the box was last filled for, and the amount it showed then (a new one from the host fills it again). */
let wagerFor = '';
/** A wager sent that the room hasn't answered yet. */
let wagerSending = false;
/** A ✍ clue's answer: on its way, the last refusal, what's in the box for (so a new view doesn't wipe what's typed). */
let answerSending = false;
let answerErr = '';
let answerFor = '';
let wasAnsUp = false;
/** What the seat list was last drawn with (see renderSeats). */
let seatsKey = '';
/** The colour picker is open; the colours it was last drawn with (redrawn only when they change, so focus stays). */
let colorsOpen = false;
let colorsKey = '';

// ---- saved seat (per room code) and this browser's id ----

const key = () => `brainrot-buzzer:${code}`;
/** The seat kept in memory too: where storage is blocked, a dropped connection (not a reload) still gets it back. */
let seatHere: { seatId: string; token: string } | null = null;
function loadSeat(): { seatId: string; token: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(key()) ?? 'null');
    return v && typeof v.seatId === 'string' && typeof v.token === 'string' ? v : seatHere;
  } catch {
    return seatHere;
  }
}
function saveSeat(s: { seatId: string; token: string } | null): void {
  seatHere = s;
  try {
    if (s) localStorage.setItem(key(), JSON.stringify(s));
    else localStorage.removeItem(key());
  } catch {
    // private mode: the seat just won't survive a reload
  }
}

/** Teams: the name this browser last joined a team as (filled in next time). */
const NAME_KEY = 'brainrot-buzzer:name';
function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // fine
  }
}

/** A random id for this browser, sent with joins: a kick keeps it off that seat for a while. */
const device = (() => {
  const k = 'brainrot-buzzer:device';
  try {
    const v = localStorage.getItem(k);
    if (v && /^[\w-]{8,64}$/.test(v)) return v;
  } catch {
    // no storage: a new id each time
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(k, id);
  } catch {
    // fine
  }
  return id;
})();

// ---- connection ----

function send(m: object): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

async function start(c: string): Promise<void> {
  code = c;
  $('code').textContent = code;
  history.replaceState(null, '', `/${code}`);
  notice = null;
  render();
  try {
    const r = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
    if (r.status === 404) return noRoom();
  } catch {
    // offline for a moment: the socket retries
  }
  connect();
}

function noRoom(): void {
  notice = {
    title: `No game ${code}`,
    text: 'Check the code on the stream (it may have ended).',
    final: true,
    button: { label: 'Enter another code', run: () => location.assign('/') },
  };
  render();
}

/** Lets go of a socket: none of its events count any more. */
function detach(s: WebSocket): void {
  s.onopen = s.onmessage = s.onclose = null;
  try {
    s.close();
  } catch {
    // already closed
  }
}

function connect(): void {
  clearTimeout(retryTimer);
  // Never two sockets: a second one would find its own seat taken by the first.
  if (ws) detach(ws);
  const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
  ws = s;
  s.onopen = () => {
    if (ws !== s) return;
    connected = everConnected = true;
    attempts = 0;
    lastPong = Date.now();
    const saved = loadSeat();
    rejoining = !!saved;
    if (saved) send({ t: 'join', seatId: saved.seatId, token: saved.token, device });
    // Still waiting for the host to let us in: the room forgot the request when the connection dropped, so ask again.
    else if (pendingName) send({ t: 'new', name: pendingName, device });
    // A few quick pings first, so the room has this phone's round trip before the first buzz.
    ping();
    for (const ms of [300, 600]) setTimeout(() => ws === s && ping(), ms);
    clearInterval(pingTimer);
    pingTimer = window.setInterval(() => {
      // No pong for a while: the connection is dead even if the browser hasn't noticed.
      if (Date.now() - lastPong > 25_000) return dropped(s);
      ping();
    }, 10_000);
    render();
  };
  s.onmessage = (e) => {
    if (ws !== s || typeof e.data !== 'string') return;
    try {
      onMessage(JSON.parse(e.data) as RoomToPhone);
    } catch {
      // not ours
    }
  };
  s.onclose = () => dropped(s);
}

function ping(): void {
  send({ t: 'ping', at: Date.now() });
}

/** Is the connection still alive? Ping, and start again if no pong comes back soon (a socket asleep in the background). */
function probe(): void {
  const s = ws;
  if (!s || s.readyState !== WebSocket.OPEN || probeTimer) return;
  const asked = Date.now();
  ping();
  probeTimer = window.setTimeout(() => {
    probeTimer = 0;
    if (ws === s && lastPong < asked) {
      attempts = 0;
      dropped(s, 0);
    } else render();
  }, PROBE_MS);
  render();
}

/** The socket is gone: try again with backoff (unless the game is over). `wait`: try again after this long instead. */
function dropped(s: WebSocket, wait?: number): void {
  if (ws !== s) return;
  detach(s);
  ws = null;
  connected = false;
  rejoining = false;
  clearInterval(pingTimer);
  clearTimeout(probeTimer);
  probeTimer = 0;
  stopSending();
  // A wager on its way may not have got there: say so, rather than "Sending…" for good.
  if (wagerSending) {
    wagerSending = false;
    wagerErr = 'The connection dropped. If it doesn’t say ✔ Sent once it’s back, send it again.';
  }
  if (answerSending) {
    answerSending = false;
    answerErr = 'The connection dropped. If it doesn’t say ✔ Sent once it’s back, send it again.';
  }
  render();
  if (notice?.final) return;
  const full = notice?.full ? Math.min(30_000, 3000 * 2 ** Math.max(0, fullTries - 1)) : undefined;
  const delay = wait ?? full ?? Math.min(8000, 500 * 2 ** attempts) * (0.75 + Math.random() * 0.5);
  attempts++;
  retryTimer = window.setTimeout(async () => {
    if (attempts > 3) {
      // Long gone: maybe the room ended while we were away.
      try {
        const r = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
        if (r.status === 404) return ended();
      } catch {
        // still offline
      }
      // Back to the tab meanwhile (it connected), or the game ended.
      if (ws || notice?.final) return;
    }
    connect();
  }, delay);
}

function ended(): void {
  // The game's end was on screen: where you came stays up ("You came 1st with $700 🎉").
  const came = view?.final && view.you ? placeLine(view) : null;
  saveSeat(null);
  seatId = null;
  view = null;
  notice = { title: came ? `${came.big} ${came.small}` : 'The game is over', text: 'Thanks for playing!', final: true, button: { label: 'Join another game', run: () => location.assign('/') } };
  ws?.close();
  render();
}

function onMessage(m: RoomToPhone): void {
  switch (m.t) {
    case 'seats': {
      // Teams on or off while picking: a note about the old list (a seat, a team) no longer fits.
      if (seats && !!seats.teams !== !!m.teams && !seatId) seatsNote = '';
      // A seated phone only gets the list when it lost its seat: another tab or phone took it back, or the host
      // removed the player.
      if (!rejoining && seatId) {
        const wasTeams = !!view?.teams;
        seatsNote = !m.seats.some((x) => x.id === seatId)
          ? wasTeams
            ? 'Your team left the game. Pick another one.'
            : 'The host took you out of the game.'
          : !!m.teams !== wasTeams
            ? 'You’re not on a team on this phone any more. Pick your team.'
            : m.teams
            ? 'Your place on the team moved to another tab or phone. Tap your team to take it back here.'
            : 'Your seat moved to another tab or phone. Tap your name to take it back here.';
        if (!m.seats.some((x) => x.id === seatId) || !!m.teams !== wasTeams) saveSeat(null);
        seatId = null;
        view = null;
      }
      // Teams turned off while this phone was giving its name, or its team left the game.
      if (teamPick && (!m.teams || !m.seats.some((x) => x.id === teamPick!.id))) teamPick = null;
      if (teamPick) teamPick = m.seats.find((x) => x.id === teamPick!.id) ?? null;
      if (notice?.full) {
        notice = null;
        fullTries = 0;
      }
      // The host stopped taking new players while this phone was typing a name.
      if (newForm && (!m.allowNew || m.locked)) {
        newForm = false;
        seatsNote = m.locked ? 'The host has locked the seats.' : "The host isn't taking new players right now.";
      }
      seats = m;
      break;
    }
    case 'joined':
      seatId = m.seatId;
      saveSeat({ seatId: m.seatId, token: m.token });
      if (m.name) saveName(m.name);
      teamPick = null;
      teamAsked = false;
      rejoining = newForm = false;
      pendingName = null;
      seatsNote = '';
      notice = null;
      fullTries = 0;
      break;
    case 'view':
      view = m.view;
      if (result && result.armId !== view.armId) result = null;
      if (sendingArm >= 0 && (view.armId !== sendingArm || view.phase === 'lobby')) stopSending();
      if (lostArm >= 0 && view.armId !== lostArm) lostArm = -1;
      resendHeld(view);
      break;
    case 'waiting':
      newForm = false;
      break;
    case 'denied':
      denied(m.reason);
      break;
    case 'result':
      result = m;
      if (m.armId === sendingArm) stopSending();
      if (m.armId === held?.armId) held = null;
      if (m.lockedUntil) lockedUntil = m.lockedUntil;
      if (m.outcome === 'first' && m.byYou !== false) vibrate([80, 50, 80]);
      else if (m.outcome === 'early') vibrate(250);
      break;
    case 'wagered': {
      wagerSending = false;
      const sym = view?.currency ?? '';
      wagerErr = m.ok
        ? ''
        : ({
            closed: 'Wagers are closed right now.',
            over: `That's over your max${m.max !== undefined ? ` of ${money(m.max, sym)}` : ''}.`,
            bad: 'Type a whole number, 0 or more.',
            slow: 'Too many tries: wait a few seconds.',
          }[m.reason ?? 'bad'] ?? "That didn't work. Try again.");
      if (m.ok) vibrate(40);
      break;
    }
    case 'answered':
      answerSending = false;
      answerErr = m.ok
        ? ''
        : ({ closed: 'Answers are closed now.', bad: 'Type an answer first.', slow: 'Too many tries: wait a few seconds.' }[m.reason ?? 'bad'] ?? "That didn't work. Try again.");
      if (m.ok) vibrate(40);
      break;
    case 'kicked': {
      const team = !!view?.teams;
      seatId = null;
      view = null;
      saveSeat(null);
      // Freed: the host gave the seat to the player's other phone (no block: this one can still take it back).
      const [title, text] = m.freed
        ? ['The host freed your seat', team ? 'So you can join from another phone. If that’s this one, pick your team again.' : 'So you can take it on another phone. If that’s this one, tap your name again.']
        : [team ? 'The host took you off the team' : 'The host took your seat back', team ? 'You can pick a team again.' : 'You can pick a seat again.'];
      notice = { title, text, button: { label: team ? 'Pick a team' : 'Pick a seat', run: () => ((notice = null), render()) } };
      break;
    }
    case 'closed':
      ended();
      return;
    case 'probe':
      // Straight back, before anything else: the room times the round trip from its probe to this.
      send({ t: 'echo', id: m.id });
      return;
    case 'pong':
      lastPong = Date.now();
      offset = m.serverNow - (m.at + Date.now()) / 2;
      // A connection check answered: it's alive.
      if (!probeTimer) return;
      clearTimeout(probeTimer);
      probeTimer = 0;
      break;
  }
  render();
}

function denied(reason: DenyReason): void {
  const wasRejoin = rejoining;
  rejoining = false;
  if (reason === 'full') {
    // Not for good: the room makes way when phones without a seat sit idle. Try again in a while.
    fullTries++;
    notice = { title: 'This game is full', text: 'Too many phones are connected right now. Trying again in a moment…', full: true };
    if (ws) dropped(ws);
    return;
  }
  if (reason === 'slow-down') {
    // Not a no: the seat this phone holds (if any) stays saved for the next try.
    pendingName = null;
    newForm = false;
    teamAsked = false;
    seatsNote = 'Too many tries: wait a minute, then try again.';
    return;
  }
  if (wasRejoin || reason === 'bad-token') {
    saveSeat(null);
    // Its old buzzer goes too: the seat list (sent while it was rejoining) is what's on screen now.
    seatId = null;
    view = null;
    result = null;
  }
  pendingName = null;
  newForm = false;
  // Teams: a name someone else has, or a missing one, keeps the name form up to try again.
  const keepForm = teamPick && teamAsked && (reason === 'name-taken' || reason === 'need-name');
  teamAsked = false;
  if (teamPick && !keepForm) teamPick = null;
  if (keepForm) {
    $('team-err').textContent = reason === 'name-taken' ? 'Someone in the game already has that name: add a letter, or pick another.' : 'Type your name first.';
    return;
  }
  seatsNote =
    {
      taken: wasRejoin ? 'Your seat was given to someone else. Tap your name again.' : 'Someone already has that seat. If it’s you on a new phone, ask the host to free it.',
      'unknown-seat': "That player isn't in the game any more.",
      rejected: "The host didn't let you in.",
      'no-new': "The host isn't taking new players.",
      'bad-token': seats?.teams ? 'You’re not on a team any more. Pick your team again.' : 'Your seat was given back. Tap your name again.',
      locked: 'The host has locked the seats.',
      blocked: seats?.teams ? 'The host took you off that team. Pick another one, or ask the host.' : 'The host took you off that seat. Pick another one, or ask the host.',
      'name-taken': 'A player already has that name. If it’s you, tap it; if not, pick another name.',
      'need-name': seats?.teams ? 'Pick your team, then type your name.' : 'Type a name with letters in it.',
    }[reason] ?? "That didn't work. Try again.";
}

/** "Not you?": let go of this seat and pick again (it asks first: the link is right under the buzz button). */
function leaveSeat(): void {
  const what = seats?.teams ? 'this team' : 'this player';
  const ask = seats?.locked
    ? `Give up ${what}? The host has locked the seats: you can't get back in until they unlock them.`
    : `Give up ${what} and pick again?`;
  if (!confirm(ask)) return;
  send({ t: 'leave' });
  saveSeat(null);
  seatId = null;
  view = null;
  result = null;
  seatsNote = '';
  render();
}

// ---- buzzing ----

const serverNow = () => Date.now() + offset;

/** at: when the press happened (an event's timeStamp, same clock as performance.now()). */
function buzz(at = performance.now()): void {
  if (!view || view.phase === 'lobby') return;
  lastPress = performance.now();
  lostArm = -1;
  const reactMs = litArm === view.armId && view.phase === 'armed' ? Math.max(0, Math.round(at - litAt)) : undefined;
  vibrate(30);
  const b = $('buzz');
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
  // Kept until the room answers: a connection that turns out dead sends it again once back (see resendHeld).
  const answered = !!result && result.armId === view.armId;
  // (The first press of the arm: the one whose reaction time counts.)
  if (!answered && held?.armId !== view.armId) held = { armId: view.armId, ...(reactMs !== undefined ? { reactMs } : {}), on: null };
  if (!connected) return render();
  // Someone mashing the button: one buzz goes every BUZZ_GAP_MS at most (the room counts one per arm anyway, and a
  // stream of them would look like a flood).
  if (performance.now() - lastSent < BUZZ_GAP_MS) return;
  lastSent = performance.now();
  sendBuzz(view.armId, reactMs);
  if (!answered) awaitAnswer(view.armId);
}

function sendBuzz(armId: number, reactMs?: number): void {
  send({ t: 'buzz', armId, ...(reactMs !== undefined ? { reactMs } : {}) });
  if (held?.armId === armId) held.on = ws;
}

/** Shows the buzz is on its way until the room answers; no answer means the connection is dead (start again at once). */
function awaitAnswer(armId: number): void {
  const s = ws;
  sendingArm = armId;
  clearTimeout(sendingTimer);
  sendingTimer = window.setTimeout(() => {
    if (ws === s && s && sendingArm >= 0) {
      sendingArm = -1;
      attempts = 0;
      dropped(s, 0);
    }
  }, BUZZ_ANSWER_MS);
  render();
}

/**
 * Back in the seat on a new connection with a press the room never answered: it goes again if the buzzers are still
 * open (or someone is answering: it joins the queue) for that arm; otherwise "Your buzz didn't get through".
 */
function resendHeld(v: PhoneView): void {
  if (!held || held.on === ws || !connected) return;
  const h = held;
  if (v.armId === h.armId && (v.phase === 'armed' || v.phase === 'answering')) {
    sendBuzz(h.armId, h.reactMs);
    awaitAnswer(h.armId);
  } else {
    held = null;
    // Pressing again counts while the buzzers are open (or joins the queue while someone answers); not once closed.
    if (v.phase === 'armed' || v.phase === 'answering') lostArm = v.armId;
  }
}

function stopSending(): void {
  sendingArm = -1;
  clearTimeout(sendingTimer);
}

function vibrate(p: number | number[]): void {
  try {
    navigator.vibrate?.(p);
  } catch {
    // not on this phone
  }
}

// ---- sound and flash (iPhones have no vibration) ----

const SOUND_KEY = 'brainrot-buzzer:sound';
let soundOn = (() => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
})();
let audio: AudioContext | null = null;

/** Made (or woken) on a tap: phones only let a page play sound after one. */
function unlockAudio(): void {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** A short beep: one note for BUZZ!, two going up for "you're answering". */
function beep(notes: number[]): void {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const t0 = audio.currentTime;
  notes.forEach((hz, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = hz;
    const at = t0 + i * 0.11;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    o.connect(g).connect(audio!.destination);
    o.start(at);
    o.stop(at + 0.12);
  });
}

function flash(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const f = $('flash');
  f.classList.remove('on');
  void f.offsetWidth; // restart the animation
  f.classList.add('on');
}

function drawSound(): void {
  const b = $('sound');
  // The bell and a word for its state (a bare bell didn't say what it was), and a tooltip saying what a tap does.
  const word = document.createElement('small');
  word.textContent = soundOn ? 'Sound on' : 'Muted';
  b.replaceChildren(soundOn ? '🔔 ' : '🔕 ', word);
  b.title = soundOn ? 'Sound is on: tap to mute this phone' : 'Sound is off: tap to hear the buzzer sounds on this phone';
  // Its name is the words on it ("Sound on" / "Muted"), so "tap Muted" works by voice too.
  b.removeAttribute('aria-label');
  b.removeAttribute('aria-pressed');
}

let wakeWanted = false;
async function wake(): Promise<void> {
  wakeWanted = true;
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    // not allowed right now (battery saver, no https): the screen may sleep
  }
}

// ---- drawing ----

/** The wager box was up when last drawn (the keys move with it). */
let wasBoxUp = false;

function show(id: ScreenId): void {
  for (const s of screens) $(s).hidden = s !== id;
}

/** What a screen reader hears: the screen's main words, said again whenever they change. */
function say(text: string): void {
  const live = $('live');
  if (live.textContent !== text) live.textContent = text;
}

/** Bits of text as sentences: a full stop only where one isn't already ("Get ready…", not "Get ready….""). */
const sentences = (parts: string[]): string =>
  parts
    .filter(Boolean)
    .map((x) => (/[.!?…]$/.test(x) ? x : `${x}.`))
    .join(' ');

function render(): void {
  const away = !connected && everConnected && !notice?.final && !notice?.full && !!code;
  $('overlay').hidden = !away;
  $('sound').hidden = !(seatId && view?.you);
  if (!code) return show('s-code');
  if (notice) {
    $('msg-title').textContent = notice.title;
    $('msg-text').textContent = notice.text;
    const btn = $('msg-btn');
    btn.hidden = !notice.button;
    btn.textContent = notice.button?.label ?? '';
    say(`${notice.title}. ${notice.text}`);
    return show('s-msg');
  }
  if (away) say('Reconnecting…');
  if (seatId && view?.you) return renderBuzz(view);
  if (pendingName) return wait('Waiting for the host to let you in…', true);
  if (newForm) {
    show('s-new');
    return;
  }
  if (teamPick && seats?.teams && !rejoining) return renderTeam(teamPick);
  if (seats && !rejoining) return renderSeats(seats);
  wait('Connecting…');
}

/** `cancel`: the phone is asking to join, and can take it back. */
function wait(text: string, cancel = false): void {
  $('wait-text').textContent = text;
  $('wait-cancel').hidden = !cancel;
  if (connected) say(text);
  show('s-wait');
}

/** Teams: the name form for the team tapped. */
function renderTeam(t: SeatsMsg['seats'][number]): void {
  const wasHidden = $('s-team').hidden;
  $('team-title').textContent = `Join ${t.name}`;
  $('team-dot').style.background = t.color;
  $('team-on').textContent = t.members?.length ? `On it: ${t.members.join(', ')}` : 'Nobody on it yet';
  const inp = $<HTMLInputElement>('team-in');
  if (wasHidden) {
    if (!inp.value) inp.value = loadName();
    $('team-err').textContent = '';
  }
  // (The error has its own alert.)
  say(sentences([`Join ${t.name}`, t.members?.length ? `On it: ${t.members.join(', ')}` : '', 'Type your name']));
  show('s-team');
  if (wasHidden) inp.focus();
}

function renderSeats(s: SeatsMsg): void {
  if (s.title) $('title').textContent = s.title;
  const teams = !!s.teams;
  $('seats-title').textContent = teams ? 'Pick your team' : 'Tap your name';
  const list = $('seat-list');
  // The seat this phone still holds a claim to (another tab or phone took it back): tapping it takes it back here.
  const saved = loadSeat();
  // Redrawn only when what it shows changed (a tap on a name mid-redraw would be lost, and the keys' place too); the
  // name the keys were on keeps them.
  const key = JSON.stringify([s.seats, s.teams, s.locked, saved?.seatId ?? null]);
  if (key === seatsKey && list.childElementCount) return renderSeatsRest(s);
  seatsKey = key;
  const had = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.dataset.seat : undefined;
  list.replaceChildren(
    ...s.seats.map((x) => {
      const mine = saved?.seatId === x.id;
      const b = document.createElement('button');
      b.className = 'seat';
      b.dataset.seat = x.id;
      b.disabled = !mine && (x.taken || !!s.locked);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = x.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = x.name;
      if (teams) {
        // Who is on it already, under the team's name.
        const who = document.createElement('span');
        who.className = 'who';
        const on = document.createElement('span');
        on.className = 'members';
        on.textContent = x.members?.length ? x.members.join(', ') : 'Nobody yet';
        who.append(name, on);
        b.append(dot, who);
        b.setAttribute('aria-label', `${x.name}${x.members?.length ? `: ${x.members.join(', ')}` : ''}`);
      } else if (x.taken && mine) {
        const who = document.createElement('span');
        who.className = 'who';
        const hint = document.createElement('span');
        hint.className = 'members hint';
        hint.textContent = 'Yours, on another tab or phone · tap to take it back here';
        who.append(name, hint);
        b.append(dot, who);
        b.setAttribute('aria-label', `${x.name}: ${hint.textContent}`);
      } else if (x.taken) {
        // Taken: maybe by this player's old phone (a new phone, another browser). The host can free it.
        const who = document.createElement('span');
        who.className = 'who';
        const hint = document.createElement('span');
        hint.className = 'members hint';
        hint.textContent = `${x.away ? 'Taken (its phone is away)' : 'Taken'} · is this you on a new phone? Ask the host to free it`;
        who.append(name, hint);
        b.append(dot, who);
        b.setAttribute('aria-label', `${x.name}: ${hint.textContent}`);
      } else b.append(dot, name);
      if (s.locked && !x.taken) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = '🔒';
        b.append(tag);
      }
      b.addEventListener('click', () => {
        seatsNote = '';
        unlockAudio();
        // Its own seat (or team place) back, with the token it holds: no name to give again.
        if (mine && saved) {
          rejoining = true;
          send({ t: 'join', seatId: saved.seatId, token: saved.token, device });
          return render();
        }
        // Teams: then your name (the room needs it to put you on the team).
        if (teams) {
          teamPick = x;
          teamAsked = false;
          return render();
        }
        send({ t: 'join', seatId: x.id, device });
      });
      return b;
    }),
  );
  if (!s.seats.length) list.innerHTML = `<p class="note">${teams ? 'No teams yet' : 'No players yet'}. Wait for the host to add them.</p>`;
  if (had) list.querySelector<HTMLElement>(`[data-seat="${CSS.escape(had)}"]`)?.focus();
  renderSeatsRest(s);
}

/** The seats screen's other parts (redrawn every time). */
function renderSeatsRest(s: SeatsMsg): void {
  const teams = !!s.teams;
  $('new-btn').hidden = !s.allowNew || !!s.locked;
  $('host-away').hidden = s.hostHere;
  $('seats-status').textContent = s.locked ? '🔒 The host has locked the seats.' : (s.note ?? '');
  $('seats-note').textContent = seatsNote;
  say([teams ? 'Pick your team.' : 'Tap your name.', seatsNote, s.locked ? 'The host has locked the seats.' : s.note ?? '', s.hostHere ? '' : "The host isn't connected right now."].filter(Boolean).join(' '));
  show('s-seats');
}

function renderBuzz(v: PhoneView): void {
  const you = v.you!;
  $('title').textContent = v.title || 'Brainrot Buzzer';
  const b = $('buzz');
  b.style.setProperty('--seat', you.color);
  b.style.setProperty('--seat-ink', ink(you.color));
  const clue = $('clue');
  clue.replaceChildren();
  if (v.clue && (v.phase !== 'lobby' || v.answer)) {
    clue.append(v.clue.text);
    if (v.clue.caption) {
      const c = document.createElement('small');
      c.textContent = v.clue.caption;
      clue.append(c);
    }
  }
  const sym = v.currency ?? '';
  // Wagers: the player's own box instead of the buzzer (or what's locked in; someone else wagering; sitting out).
  const wager = v.phase === 'lobby' && v.wager ? v.wager : null;
  const boxUp = !!wager?.mine && wager.open;
  // Above the box: what's on screen ("Final Jeopardy! · US Presidents", "Daily Double — you're up!").
  if (boxUp && !clue.childNodes.length && v.status) clue.append(v.status);
  $('wager-form').hidden = !boxUp;
  // A ✍ clue: the answer box instead of the buzzer while answers are open.
  const ans = !boxUp && v.answer?.mine ? v.answer : null;
  const ansUp = !!ans?.open;
  $('answer-form').hidden = !ansUp;
  b.hidden = boxUp || ansUp;
  if (ansUp !== wasAnsUp) {
    const lost = !document.activeElement || document.activeElement === document.body || !!$('answer-form').contains(document.activeElement) || document.activeElement === b;
    wasAnsUp = ansUp;
    if (lost) queueMicrotask(() => (ansUp ? $('answer-in') : b).focus());
  }
  // The keys (and a screen reader) follow: into the box as it opens, back to the buzzer as it goes.
  if (boxUp !== wasBoxUp) {
    const lost = !document.activeElement || document.activeElement === document.body || !!$('wager-form').contains(document.activeElement) || document.activeElement === b;
    wasBoxUp = boxUp;
    if (lost) queueMicrotask(() => (boxUp ? $('wager-in') : b).focus());
  }
  if (boxUp) return renderWager(v, wager!, sym);
  if (ansUp) return renderAnswer(v, ans!, sym);
  if (!ans) ((answerFor = ''), (answerErr = ''));
  wagerFor = '';
  wagerErr = '';
  const left = Math.ceil((lockedUntil - serverNow()) / 1000);
  const mine = result && result.armId === v.armId ? result : null;
  let cls = '';
  let big = '';
  let small = '';
  /** What a screen reader hears instead of `small` (the early lock's countdown is said once, not every second). */
  let spoken: string | null = null;
  // Teams: you is your team; member is the name this phone joined it as.
  const team = !!v.teams;
  /** Teams: a teammate's buzz holds your team's place (not yours). */
  const mate = team && !!mine?.by && !mine.byYou ? mine.by : null;
  if (ans && !ans.open) {
    // A ✍ clue whose answer is on screen: what this seat sent stays in sight.
    [cls, big, small] = ['off', 'Answers locked', ans.text ? `${team ? 'Your team’s' : 'Yours'}: “${ans.text}”` : 'None sent'];
  } else if (wager?.mine) {
    // Locked: the question is up.
    const yours = team ? 'Your team’s wager' : 'Your wager';
    [cls, big, small] = [
      'off',
      'Wager locked',
      wager.amount !== undefined ? `${yours}: ${money(wager.amount, sym)}` : wager.hidden ? 'The host has it (not shown on this phone)' : 'None sent: the host decides',
    ];
  } else if (wager?.kind === 'dd') {
    [cls, big, small] = ['off', `${wager.who || 'Someone'} is wagering…`, 'Daily Double'];
  } else if (wager) {
    [cls, big, small] = ['off', 'You sit this one out', v.status || (team ? 'Your team isn’t in this one' : 'You’re not in this one')];
  } else if (v.phase === 'lobby' && v.final) {
    ({ big, small } = placeLine(v));
    cls = 'off';
  } else if (v.phase === 'lobby') {
    big = you.name;
    small = v.status || 'Wait for the next clue';
  } else if (v.phase === 'answering' && v.answering?.you && team && !v.answering.byYou) {
    // Your team is answering: a teammate buzzed (or the host picked the team).
    const by = v.answering.by;
    [cls, big, small] = by ? ['team', `${by} is answering`, 'for your team'] : ['first', 'Your team is answering!', 'Say your answer'];
  } else if (v.phase === 'answering' && v.answering?.you) {
    const how = mine?.rolled === 1 ? 'You won the roll' : mine?.byMs !== undefined ? `You were first by ${secs(mine.byMs)}` : 'Say your answer';
    [cls, big, small] = ['first', "You're answering!", how];
  } else if (v.phase === 'answering') {
    const who = v.answering ? `${v.answering.name} is answering${v.answering.by ? ` (${v.answering.by})` : ''}` : 'Tie! The host decides';
    // Out of this clue (wrong, or skipped): no place in the order to show any more.
    if (you.lockedOut) [cls, big, small] = ['off', 'Wait', who];
    else if (mine?.outcome === 'tie') [cls, big, small] = ['off', 'Tie!', 'The host decides who goes first'];
    else if (mine?.outcome === 'late' && mine.rank) {
      const how = mine.rolled ? `Tie — you rolled ${ordinal(mine.rolled)}` : mine.afterMs !== undefined && mine.behind ? `${secs(mine.afterMs)} behind ${mine.behind}` : who;
      [cls, big, small] = ['off', team ? `Your team is ${ordinal(mine.rank)}` : `You're ${ordinal(mine.rank)}`, mate ? `${mate} buzzed for your team · ${how}` : how];
    } else if (v.canQueue && !mine) [cls, big, small] = ['queue', 'You can still buzz', `${who}. Buzz to be next in line if they miss`];
    else [cls, big, small] = ['off', mine?.outcome === 'late' ? 'Too late' : 'Wait', who];
  } else if (v.phase === 'closed' && v.done) {
    const by = v.done.by;
    [cls, big, small] = ['off', by ? (by.you ? (team ? 'Your team got it!' : 'You got it!') : `${by.name} got it`) : 'Clue over', 'Wait for the next clue'];
  } else if (mine?.outcome === 'pending' && v.phase === 'armed') {
    [cls, big, small] = ['off', '…', 'Buzzed! Checking who was first'];
  } else if (you.lockedOut) {
    [cls, big, small] = ['off', 'Wait', team ? 'Your team already answered this one' : 'You already answered this one'];
  } else if (left > 0) {
    [cls, big, small] = ['locked', 'Too early', `wait ${left}s`];
    spoken = 'Wait a moment before buzzing again';
  } else if (v.phase === 'armed') {
    [cls, big, small] = ['armed', 'BUZZ!', team && you.member ? `${you.member} for ${you.name}` : you.name];
  } else {
    [cls, big, small] = ['ready', 'Get ready…', "Don't buzz yet"];
  }
  if (sendingArm === v.armId && !mine && v.phase !== 'lobby') small = 'Sending…';
  if (lostArm === v.armId && !mine && cls !== 'first' && cls !== 'locked') small = 'Your buzz didn’t get through — press again';
  // Back from the background: until the room answers the ping, a press may be on a dead connection (it's kept).
  if (probeTimer && cls !== 'first') small = 'Checking connection…';
  // The moment BUZZ! first shows for this arm: reaction times count from here.
  if (cls === 'armed' && litArm !== v.armId) {
    litArm = v.armId;
    litAt = performance.now();
  }
  // A beep and a flash when BUZZ! lights up and when you're answering (each once).
  const cue = cls === 'armed' ? `armed ${v.armId}` : cls === 'first' ? `first ${v.armId}` : '';
  if (cue && cue !== cued) {
    beep(cls === 'armed' ? [880] : [660, 990]);
    flash();
    // Said at once, not after whatever a screen reader is still reading: a buzz is a race.
    const alert = $('alert');
    alert.textContent = '';
    queueMicrotask(() => (alert.textContent = big));
  }
  cued = cue || cued;
  b.className = cls;
  // A name may be one long word: it breaks anywhere rather than push the page sideways (status words stay whole).
  const names = [you.name, you.member, v.answering?.name, v.answering?.by, v.done?.by?.name, mine?.behind, mate, wager?.who].filter((x): x is string => !!x);
  for (const [id, text] of [['buzz-big', big], ['buzz-small', small]] as const) {
    $(id).textContent = text;
    $(id).classList.toggle('name', names.some((n) => text.includes(n)));
  }
  b.setAttribute('aria-label', sentences([big, spoken ?? small]));
  const hostGone = renderFoot(v, sym);
  say(sentences([connected ? '' : 'Reconnecting…', big, spoken ?? small, hostGone ? ($('host-note').textContent ?? '') : '']));
  show('s-buzz');
  // Count the early lock down.
  clearTimeout(tick);
  if (left > 0) tick = window.setTimeout(render, 200);
}

/** The name and score line under the buzzer (and the wager box), and whether the host is gone. */
function renderFoot(v: PhoneView, sym: string): boolean {
  const you = v.you!;
  const team = !!v.teams;
  $('me').textContent = `${team && you.member ? `${you.member} · ` : ''}${you.name} · ${money(you.score, sym)}`;
  $('leave').textContent = team ? 'Change team or name' : 'Not you? Change player';
  renderColors(v);
  const hostGone = v.hostHere === false;
  $('host-note').hidden = !hostGone;
  return hostGone;
}

/** 🎨 Change your colour (when the host allows it): the palette, with other players' colours greyed out. */
function renderColors(v: PhoneView): void {
  const pick = v.colorPick;
  const btn = $<HTMLButtonElement>('color-btn');
  btn.hidden = !pick;
  if (!pick) colorsOpen = false;
  btn.setAttribute('aria-expanded', String(colorsOpen));
  const box = $('colors');
  box.hidden = !colorsOpen;
  if (!pick || !colorsOpen) return;
  const mine = v.you!.color.toLowerCase();
  const key = `${mine} ${pick.taken.join(',')}`;
  if (key === colorsKey && box.childElementCount) return;
  colorsKey = key;
  const had = document.activeElement instanceof HTMLElement && box.contains(document.activeElement) ? document.activeElement.dataset.color : undefined;
  box.replaceChildren(
    ...PLAYER_PALETTE.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = c;
      b.style.background = c;
      const taken = pick.taken.includes(c);
      b.disabled = taken;
      b.setAttribute('aria-pressed', String(c === mine));
      b.setAttribute('aria-label', `${PLAYER_COLOR_NAMES[i] ?? c}${taken ? ' (another player has it)' : ''}`);
      b.title = b.getAttribute('aria-label')!;
      if (c === mine) b.textContent = '✔';
      b.style.color = ink(c);
      return b;
    }),
  );
  if (had) box.querySelector<HTMLElement>(`[data-color="${had}"]`)?.focus();
}

/** The player's wager box: their score and max, what's in, and why the last one wasn't taken. */
function renderWager(v: PhoneView, w: PhoneWager, sym: string): void {
  const you = v.you!;
  const team = !!v.teams;
  // (The line above already says it's a Daily Double or names the Final.)
  $('wager-head').textContent = team ? 'Your team’s wager' : 'Your wager';
  $('wager-label').textContent = `Wager (only the host sees it)`;
  const inp = $<HTMLInputElement>('wager-in');
  // Filled with what's in when the box comes up, or when what's in changes (a teammate, the host) while not typing.
  const key = `${w.id} ${w.amount ?? ''}`;
  if (key !== wagerFor && (document.activeElement !== inp || !wagerFor.startsWith(`${w.id} `))) {
    inp.value = w.amount !== undefined ? String(w.amount) : '';
    wagerFor = key;
  }
  inp.max = w.limit && w.max !== undefined ? String(w.max) : '';
  const max = w.max !== undefined ? `Max ${money(w.max, sym)}${w.limit ? '' : ' (the host may allow more)'}` : '';
  $('wager-info').textContent = [`Score ${money(you.score, sym)}`, max].filter(Boolean).join(' · ');
  let state = '';
  if (w.amount !== undefined) {
    const amt = money(w.amount, sym);
    if (w.host) state = `The host has your wager as ${amt}`;
    else if (team && w.by) state = `✔ ${w.byYou ? 'You' : w.by} sent ${amt} for your team`;
    else if (w.sent) state = `✔ Sent: ${amt}`;
    state += '. You can change it until the question shows.';
  } else if (w.hidden) {
    // Seated after the wagers began: one is in, but this phone isn't shown it.
    state = `${team ? 'Your team’s' : 'Your'} wager is in with the host (not shown on a phone that joined after the wagers began). Sending one replaces it.`;
  }
  $('wager-state').textContent = wagerSending ? 'Sending…' : state;
  // Green for what's in and shown; plain for "not shown here".
  $('wager-state').classList.toggle('plain-note', !!w.hidden && w.amount === undefined);
  $('wager-err').textContent = wagerErr;
  $<HTMLButtonElement>('wager-send').textContent = w.amount !== undefined && !w.host ? 'Change wager' : 'Send wager';
  const hostGone = renderFoot(v, sym);
  // (What it's for first: "Final Jeopardy! · US Presidents". The error has its own alert, so it isn't said twice.)
  say(sentences([connected ? '' : 'Reconnecting…', $('clue').textContent ?? '', $('wager-head').textContent ?? '', $('wager-info').textContent ?? '', state, hostGone ? ($('host-note').textContent ?? '') : '']));
  show('s-buzz');
}

/** A ✍ clue: this seat's answer box (what's in, who sent it, why the last one wasn't taken). */
function renderAnswer(v: PhoneView, a: NonNullable<PhoneView['answer']>, sym: string): void {
  const team = !!v.teams;
  $('answer-label').textContent = `${team ? 'Your team’s answer' : 'Your answer'} (only the host sees it)`;
  const inp = $<HTMLTextAreaElement>('answer-in');
  // Filled with what's in when the box comes up, or when what's in changes (a teammate) while not typing.
  const key = `${a.id} ${a.text ?? ''}`;
  if (key !== answerFor && (document.activeElement !== inp || !answerFor.startsWith(`${a.id} `))) {
    inp.value = a.text ?? '';
    answerFor = key;
  }
  let state = '';
  if (a.text) state = `${team && a.by ? `✔ ${a.byYou ? 'You' : a.by} sent it for your team` : '✔ Sent'}. You can change it until the host shows the answer.`;
  $('answer-state').textContent = answerSending ? 'Sending…' : state;
  $('answer-err').textContent = answerErr;
  $<HTMLButtonElement>('answer-send').textContent = a.text ? 'Change answer' : 'Send answer';
  const hostGone = renderFoot(v, sym);
  say(sentences([connected ? '' : 'Reconnecting…', $('clue').textContent ?? '', 'Everyone answers', state, hostGone ? ($('host-note').textContent ?? '') : '']));
  show('s-buzz');
}

/** The game is over: "You came 1st" / "with $700 🎉" (teams: your team; a tie says so). */
function placeLine(v: PhoneView): { big: string; small: string } {
  const f = v.final!;
  const who = v.teams ? 'Your team' : 'You';
  const big = f.tied ? `${who} tied for ${ordinal(f.place)}` : `${who} came ${ordinal(f.place)}`;
  return { big, small: `with ${money(v.you!.score, v.currency ?? '')}${f.place === 1 ? ' 🎉' : ''}` };
}

/** Points as the game shows them: a word like "pts" goes after the number, $ or 🧠 in front. */
function money(n: number, sym: string): string {
  const pts = Math.abs(n).toLocaleString();
  return `${n < 0 ? '−' : ''}${/^\p{L}+\.?$/u.test(sym.trim()) ? `${pts} ${sym.trim()}` : sym + pts}`;
}

/** 0.04 s */
const secs = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;
/** 1st, 2nd, 3rd, 4th… */
const ordinal = (n: number): string => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

/** Black or white text, whichever reads on this colour. */
function ink(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.18 ? '#111' : '#fff';
}

// ---- wiring ----

$('buzz').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlockAudio();
  buzz(e.timeStamp);
});
// A screen reader (or a switch) presses with a click and no pointerdown: that buzzes too, once.
$('buzz').addEventListener('click', (e) => {
  if (performance.now() - lastPress < 600) return;
  buzz(e.timeStamp);
});
$('buzz').addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (
    (e.key === ' ' || e.key === 'Enter') &&
    !e.repeat &&
    !$('s-buzz').hidden &&
    !(e.target instanceof HTMLButtonElement && e.target !== $('buzz')) &&
    !(e.target instanceof HTMLInputElement) &&
    !(e.target instanceof HTMLTextAreaElement)
  ) {
    e.preventDefault();
    buzz(e.timeStamp);
  }
});
document.addEventListener(
  'pointerdown',
  () => {
    unlockAudio();
    if (!wakeWanted) void wake();
  },
  { capture: true },
);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (wakeWanted) void wake();
  if (!code || notice?.final) return;
  // Phones drop sockets in the background: come back at once (connect() replaces any socket still starting). One
  // that still looks open may be dead: check it.
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    attempts = 0;
    connect();
  } else probe();
});
$('leave').addEventListener('click', leaveSeat);
$('color-btn').addEventListener('click', () => {
  colorsOpen = !colorsOpen;
  colorsKey = '';
  if (view?.you) renderColors(view);
});
$('colors').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.swatch');
  if (!b || b.disabled || !b.dataset.color) return;
  if (b.getAttribute('aria-pressed') !== 'true') send({ t: 'color', color: b.dataset.color });
  // Shut, keys back on the button that opened it; the buzzer turns the new colour when the host has it.
  colorsOpen = false;
  $('color-btn').focus();
  if (view?.you) renderColors(view);
});
$('wait-cancel').addEventListener('click', () => {
  // Not waiting for the host any more: back to the list.
  send({ t: 'leave' });
  pendingName = null;
  render();
});
// The on-screen keyboard opening (or the phone turning) with the wager box in use: keep the box in sight.
window.visualViewport?.addEventListener('resize', () => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.scrollIntoView({ block: 'center' });
});
$('wager-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const w = view?.wager;
  if (!w?.mine || !w.open) return;
  const raw = $<HTMLInputElement>('wager-in').value.trim();
  const amount = Number(raw);
  if (!raw || !Number.isSafeInteger(amount) || amount < 0) {
    wagerErr = 'Type a whole number, 0 or more.';
    return render();
  }
  if (w.limit && w.max !== undefined && amount > w.max) {
    wagerErr = `That's over your max of ${money(w.max, view?.currency ?? '')}.`;
    return render();
  }
  wagerErr = '';
  wagerSending = connected;
  if (!connected) wagerErr = 'Not connected: try again in a moment.';
  send({ t: 'wager', id: w.id, amount });
  render();
});
$('answer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const a = view?.answer;
  if (!a?.mine || !a.open) return;
  const text = $<HTMLTextAreaElement>('answer-in').value.trim();
  if (!text) {
    answerErr = 'Type an answer first.';
    return render();
  }
  answerErr = '';
  answerSending = connected;
  if (!connected) answerErr = 'Not connected: try again in a moment.';
  send({ t: 'answer', id: a.id, text });
  render();
});
// Enter sends (Shift+Enter: a new line).
$('answer-in').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $<HTMLFormElement>('answer-form').requestSubmit();
  }
});
$('sound').addEventListener('click', () => {
  soundOn = !soundOn;
  try {
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
  } catch {
    // just for now then
  }
  if (soundOn) unlockAudio();
  drawSound();
});
drawSound();

$('code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = $<HTMLInputElement>('code-in').value.trim().toUpperCase();
  if (isRoomCode(c)) void start(c);
  else
    $('code-err').textContent = /^[A-Z]{4}$/.test(c)
      ? `Room codes have no vowels (${[...c].filter((x) => !ROOM_ALPHABET.includes(x)).join(', ')}): check the code on the stream.`
      : 'A room code is 4 letters (no vowels), like on the stream.';
});
$('new-btn').addEventListener('click', () => {
  newForm = true;
  seatsNote = '';
  render();
  $('new-in').focus();
});
$('new-back').addEventListener('click', () => {
  newForm = false;
  render();
});
$('new-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('new-in').value.trim();
  if (!name) return;
  unlockAudio();
  pendingName = name;
  send({ t: 'new', name, device });
  render();
});
$('team-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('team-in').value.trim();
  if (!teamPick) return;
  if (!name) {
    $('team-err').textContent = 'Type your name first.';
    return render();
  }
  unlockAudio();
  $('team-err').textContent = '';
  teamAsked = true;
  send({ t: 'join', seatId: teamPick.id, name, device });
  render();
});
$('team-back').addEventListener('click', () => {
  teamPick = null;
  teamAsked = false;
  render();
});
$('msg-btn').addEventListener('click', () => notice?.button?.run());

const fromPath = location.pathname.replace(/^\/+|\/+$/g, '').toUpperCase();
if (isRoomCode(fromPath)) void start(fromPath);
else {
  if (fromPath) history.replaceState(null, '', '/');
  render();
  $('code-in').focus();
}
