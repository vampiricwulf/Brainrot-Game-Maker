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
 * goes to the host only. Their view says what's in (and once locked, what was locked in). The same for a ✍ clue's
 * answer box, or its multiple choices (a button each, sent as soon as one is tapped).
 *
 * Private cards (cardpanel.ts): a card the host sent to this phone takes the buzzer's place while nobody buzzes (a
 * partner clue greys every phone's button, status.off), behind "Tap to see". The page tells the room once it was seen.
 *
 * On a computer (a mouse and a keyboard, `fine`): Space or Enter buzzes from anywhere on the buzz screen but a box to type
 * in or another button Tab took the keys to, the number keys pick a seat, Esc goes back, and the page shows those keys
 * (and says when another window has them). A phone works as it always has.
 */
import { isRoomCode, MAX_PHONES, ROOM_ALPHABET, type DenyReason, type PhoneView, type PhoneWager, type RoomToPhone } from '../../src/lib/buzzproto';
import { PLAYER_COLOR_NAMES, PLAYER_PALETTE, textOn } from '../../src/lib/colors';
import { cardFocus, clearCards, coverCards, drawCards, initCards, retapCards, retryCardFiles } from './cardpanel';
import { cardsLine, lateLine } from './cards';

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

/** A mouse (or trackpad) and a screen to hover: a desktop or laptop. The keys get hints there, and "tap" says "click". */
const fine = matchMedia('(hover: hover) and (pointer: fine)');
/** "Tap" on a touch screen, "Click" with a mouse. */
const tap = (s: string): string => (fine.matches ? s.replace(/\bTap\b/g, 'Click').replace(/\btap\b/g, 'click') : s);

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
/** Teams: that join was turned away, the room full (the name form says so when it's back). */
let fullJoin = false;
let notice: Notice | null = null;
let seatsNote = '';
/** Empties the assertive alert once it has been said, so a screen reader browsing later doesn't find a stale "BUZZ!". */
let alertTimer = 0;
/** What had focus on the page when the reconnecting overlay covered it (an answer box, say): it gets it back after. */
let awayFocus: HTMLElement | null = null;
/** Another tab or phone took this seat back (the token is kept, so a tap takes it back here): a reconnect doesn't. */
let seatMoved = false;
/** The seat (a team) the host took this phone out of, and whether a later list has it back: the note says which. */
let outOf: { id: string; back: boolean } | null = null;
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
/** The wager round and the amount the box last saw (a new one from the host or a teammate fills it again). */
let wagerFor = '';
/** A wager sent that the room hasn't answered yet. */
let wagerSending = false;
/** A ✍ clue's answer: on its way, the last refusal, what's in the box for (so a new view doesn't wipe what's typed). */
let answerSending = false;
let answerErr = '';
let answerFor = '';
/** A ✍ clue's choice just tapped (its id): shown picked until the room's view has it (or turns it down). */
let answerTap = '';
/** The room took it ('answered'): the next view has it. */
let answerTapTaken = false;
/** The choices drawn (their ids and words), so they're drawn again only when they change (the keys stay put). */
let choicesKey = '';
let wasAnsUp = false;
/** The question the answer box last said to a screen reader (said once, see renderAnswer). */
let saidAsked = '';
/** What the seat list was last drawn with (see renderSeats). */
let seatsKey = '';
/** The colour picker is open; the colours it was last drawn with (redrawn only when they change, so focus stays). */
let colorsOpen = false;
let colorsKey = '';
/** What the last press on the page was made with (a PointerEvent's pointerType: 'mouse', 'touch', 'pen'). */
let pointerKind = '';
/** A press on the buzzer that began with a pointerdown (it buzzed then): the click that ends it doesn't, however long it was held. */
let pointerPress = false;
/** Cards were up in the buzzer's place when last drawn (the keys move with them). */
let wasCardsUp = false;
/** What a screen reader hears about cards this phone missed (with the screen's other words: a box's too). */
let cardsSaid = '';
/** Where the Space key last went down: a card's button takes only a Space press that began on it. */
let spaceFrom: EventTarget | null = null;

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
    lastPong = Date.now();
    // (A card file that wouldn't come while the connection was down is tried again.)
    retryCardFiles();
    const saved = seatMoved ? null : loadSeat();
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
    // The room talked: it's there (a socket it turns away opens too, then closes at once).
    attempts = 0;
    try {
      onMessage(JSON.parse(e.data) as RoomToPhone);
    } catch {
      // not ours
    }
  };
  s.onclose = (e) => dropped(s, undefined, e.code);
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

/**
 * The socket is gone: try again with backoff (unless the game is over). `wait`: try again after this long instead.
 * `closeCode`: what it closed with.
 */
function dropped(s: WebSocket, wait?: number, closeCode?: number): void {
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
  // 4004: the room is gone (closed, or ended after hours, while this phone was away): no point trying again.
  if (closeCode === 4004) return ended();
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
  outOf = null;
  view = null;
  notice = { title: came ? `${came.big} ${came.small}` : 'The game is over', text: 'Thanks for playing!', final: true, button: { label: 'Join another game', run: () => location.assign('/') } };
  ws?.close();
  render();
}

/** The host took this phone's player (its team) out of the game, or put them back. */
function outNote(teams: boolean, back: boolean): string {
  if (back) return teams ? 'Your team is back in the game. Tap it to rejoin.' : 'The host put you back in the game. Tap your name.';
  return teams ? 'Your team left the game. Pick another one.' : 'The host took you out of the game.';
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
        const out = !m.seats.some((x) => x.id === seatId);
        outOf = out ? { id: seatId, back: false } : null;
        seatsNote = tap(
          out
            ? outNote(wasTeams, false)
            : !!m.teams !== wasTeams
              ? m.teams
                ? 'The host switched to teams. Pick your team.'
                : 'The host turned teams off. Tap your name.'
              : m.teams
              ? 'Your place on the team moved to another tab or phone. Tap your team to take it back here.'
              : 'Your seat moved to another tab or phone. Tap your name to take it back here.',
        );
        const kept = m.seats.some((x) => x.id === seatId) && !!m.teams === wasTeams;
        if (!kept) saveSeat(null);
        seatMoved = kept;
        seatId = null;
        view = null;
      } else if (outOf && !seatId && m.seats.some((x) => x.id === outOf!.id) !== outOf.back) {
        // Put back (the host's Ctrl+Z, ↩ Restore), or out again.
        outOf.back = !outOf.back;
        seatsNote = tap(outNote(!!m.teams, outOf.back));
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
      seatMoved = false;
      outOf = null;
      seatId = m.seatId;
      saveSeat({ seatId: m.seatId, token: m.token });
      if (m.name) saveName(m.name);
      teamPick = null;
      teamAsked = fullJoin = false;
      rejoining = newForm = false;
      pendingName = null;
      seatsNote = '';
      notice = null;
      fullTries = 0;
      break;
    case 'view':
      view = m.view;
      if (answerTapTaken) answerTap = '';
      answerTapTaken = false;
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
    case 'answered': {
      answerSending = false;
      const picked = !!answerTap;
      if (m.ok) answerTapTaken = picked;
      else answerTap = '';
      answerErr = m.ok
        ? ''
        : ({ closed: 'Answers are closed now.', bad: picked ? "That answer wasn't taken. Try again." : 'Type an answer first.', slow: 'Too many tries: wait a few seconds.' }[m.reason ?? 'bad'] ??
          "That didn't work. Try again.");
      if (m.ok) vibrate(40);
      break;
    }
    case 'kicked': {
      seatMoved = false;
      const team = !!view?.teams;
      seatId = null;
      view = null;
      saveSeat(null);
      // Freed: the host gave the seat to the player's other phone (no block: this one can still take it back).
      const [title, text] = m.freed
        ? ['The host freed your seat', team ? 'So you can join from another phone. If that’s this one, pick your team again.' : tap('So you can take it on another phone. If that’s this one, tap your name again.')]
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
    // Not for good: the room makes way when phones without a seat sit idle. Try again in a while. (In a team game
    // everyone holds a place, so it may stay full: the name form says so.)
    if (teamPick && teamAsked) fullJoin = true;
    teamAsked = false;
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
    $('team-err').textContent = reason === 'name-taken' ? 'A team or someone in the game already has that name: add a letter, or pick another.' : 'Type your name first.';
    return;
  }
  seatsNote = tap(
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
    }[reason] ?? "That didn't work. Try again.",
  );
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
  b.title = fine.matches
    ? soundOn
      ? 'Sound is on: click to mute the buzzer sounds'
      : 'Sound is off: click to hear the buzzer sounds'
    : soundOn
      ? 'Sound is on: tap to mute this phone'
      : 'Sound is off: tap to hear the buzzer sounds on this phone';
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
  // (Every drawing of the buzz screen ends here, before it's painted: the question fits what's around it.)
  if (id === 's-buzz') fitClue();
}

// ---- a long question, fitted to the room left ----

/** What the question was last fitted for (see fitClue): the same again does nothing. */
let fitKey = '';
/** The question (and what's on) last fitted: a new one starts at its top. */
let fitFor = '';
let fitting = false;

/** The part of the screen in sight: above the on-screen keyboard (not a pinch-zoom's, which isn't the page's room). */
function seenHeight(): number {
  const vv = window.visualViewport;
  return vv && Math.abs(vv.scale - 1) < 0.01 ? vv.height : innerHeight;
}

/** The on-screen keyboard is up over the answer box. */
function keyboardUp(): boolean {
  return document.activeElement === $('answer-in') && seenHeight() < innerHeight - 150;
}

/** Where an element is on screen; null when it isn't drawn. */
const rectOf = (el: Element): DOMRect | null => (el.getClientRects().length ? el.getBoundingClientRect() : null);

/** The answer box's last line: Send, or "✔ Sent: …" / "Type an answer first." under it. */
const answerLast = (): HTMLElement =>
  ['answer-state', 'answer-err']
    .map((id) => $(id))
    .filter((el) => el.textContent?.trim())
    .reduce((last, el) => ((rectOf(el)?.bottom ?? 0) > (rectOf(last)?.bottom ?? 0) ? el : last), $('answer-send'));

/**
 * The room the question has (px), from what's around it as it's drawn now: the screen in sight, less the header and
 * what must stay in sight with it (what's on, above it; BUZZ!, the key hint, the name and score, or the open box's
 * Send, or its last choice). One above the other, 🎨 and "Not you?" may go one scroll down. With the keyboard up over
 * the answer box: that box, from the question to its last line.
 */
function clueRoom(sec: HTMLElement, kbd: boolean): number {
  const c = $('clue').getBoundingClientRect();
  const side = $('clue').parentElement!.getBoundingClientRect();
  const H = seenHeight();
  const grid = getComputedStyle(sec).display === 'grid';
  if (kbd) {
    // (Side by side, the box is beside the question: its column gets the screen in sight.)
    if (grid) return H - 16 - (side.height - c.height);
    return H - 16 - (c.top - (rectOf($('clue-cap')) ?? c).top) - (answerLast().getBoundingClientRect().bottom - c.bottom);
  }
  const s = getComputedStyle(sec);
  const header = document.querySelector('header')!.getBoundingClientRect().bottom + scrollY;
  const free = H - header - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - parseFloat(getComputedStyle(document.body).paddingBottom);
  if (grid) {
    // Side by side: the question's column, top to bottom, all of it (BUZZ! or the box on the right is in the middle of
    // the column's height: a column running off the screen would take them down with it).
    const gap = parseFloat(s.rowGap) || 0;
    const foot = document.querySelector('.side.foot')!.getBoundingClientRect().height;
    // (A card under the question keeps room for its Tap to see, as the CSS does; the note about missed cards, its own.)
    const cards = $('cards');
    const under = sec.classList.contains('cards-aside') && rectOf(cards) ? gap + (cards.querySelector('.card') ? Math.min(150, 0.4 * innerHeight) : cards.scrollHeight) : 0;
    return free - (side.height - c.height) - gap - foot - under;
  }
  // One above the other: what's above and below it moves with it, so its own height doesn't change theirs. (On a touch
  // screen, cards under BUZZ! come between it and the name: there BUZZ! is the last that must stay.)
  const keep = [
    $('buzz'),
    $('wager-send'),
    $('answer-send'),
    // (Multiple choice: the last choice, in Send's place.)
    ...($('answer-choices').lastElementChild ? [$('answer-choices').lastElementChild!] : []),
    ...(sec.classList.contains('cards-under') && !fine.matches ? [] : [$('keys'), $('me')]),
  ];
  // (Multiple choice: the lines under the buttons, "Sending…", "✔ Sent: B" or why a tap wasn't taken, count as the room
  // kept for them (their min-height) whatever they say now, so a tap never fits the question again and moves the buttons.)
  const extra =
    !$('answer-choices').hidden && keep.includes($('me'))
      ? ['answer-state', 'answer-err'].reduce((n, id) => n + Math.max(0, $(id).getBoundingClientRect().height - parseFloat(getComputedStyle($(id)).minHeight)), 0)
      : 0;
  const below = Math.max(c.bottom, ...keep.map((el) => rectOf(el)?.bottom ?? c.bottom)) - c.bottom - extra;
  return free - (c.top - side.top) - below;
}

/**
 * Fits the question to the room it has (clueRoom): its words smaller as needed, down to 15px on a touch screen and 16px
 * with a mouse; past that it scrolls, its bottom edge faded until the end, with ▼ More (▲ Top at the end). Runs as the
 * buzz screen is drawn and when the screen, or what's around the question, changes size, but works again only when
 * something it goes by has changed: a player keeps their place, and BUZZ! lighting, a keystroke or a score cost
 * nothing. During a clue it goes by the question and the screen only, so a card coming under BUZZ! or a score never
 * moves it.
 */
function fitClue(): void {
  const sec = $('s-buzz');
  if (fitting || sec.hidden) return;
  fitting = true;
  try {
    refitClue(sec);
  } finally {
    fitting = false;
  }
}

function refitClue(sec: HTMLElement): void {
  const clue = $('clue');
  const cap = $('clue-cap');
  const asked = `${cap.hidden ? '' : cap.textContent}\n${clue.textContent}`;
  const kbd = keyboardUp();
  // (Multiple choice: which ones, as their buttons take the room a box would.)
  const box = ['wager-form', 'answer-form'].find((id) => !$(id).hidden) ?? '';
  const up = box === 'answer-form' && !$('answer-choices').hidden ? `choices ${choicesKey}` : box;
  let key = JSON.stringify([asked, innerWidth, innerHeight, Math.round(seenHeight()), fine.matches, kbd, up, $('buzz').hidden]);
  if (!clue.textContent?.trim()) {
    if (key === fitKey) return;
    fitKey = key;
    fitFor = '';
    clue.style.removeProperty('font-size');
    clue.style.removeProperty('--clue-room');
    clue.classList.remove('long');
    cap.classList.remove('long');
    return noMore();
  }
  // Between clues, what's around the question counts too (a card opening, a box's notes growing).
  const lobby = view?.phase === 'lobby';
  let room = lobby ? Math.floor(clueRoom(sec, kbd)) : 0;
  if (lobby) key += ` ${room}`;
  const fits = () => clue.scrollHeight <= clue.clientHeight;
  if (key === fitKey) {
    // (The same fit, but its words no longer fit: its column got narrower, as a page scrollbar coming with a card
    // makes it on a computer. It says it scrolls, moving nothing: it's at its full height already.)
    if (!clue.classList.contains('scrolls') && !fits()) scrolls();
    return;
  }
  fitKey = key;
  if (!lobby) room = Math.floor(clueRoom(sec, kbd));
  // The place: as far down (or at the end) as it was, unless it's a new question.
  const same = asked === fitFor;
  fitFor = asked;
  const atEnd = clue.classList.contains('scrolls') && clue.scrollTop + clue.clientHeight >= clue.scrollHeight - 2;
  const share = clue.scrollHeight ? clue.scrollTop / clue.scrollHeight : 0;
  // The room (never under 2.6 lines, so two and ▼ More show, nor under 3 at the smallest size, so a question of three
  // lines always shows whole), and the biggest size that fits it, a quarter pixel at a time, from the page's own size
  // down to the smallest (never above the page's: a short laptop window starts lower).
  clue.classList.remove('scrolls', 'more');
  clue.style.removeProperty('font-size');
  const start = parseFloat(getComputedStyle(clue).fontSize);
  const smallest = Math.min(start, fine.matches ? 16 : 15);
  const floor = Math.ceil(Math.max(start * 2.6, smallest * 3) * 1.3);
  clue.style.setProperty('--clue-room', `${Math.max(floor, room)}px`);
  // (Measured with no scrollbar: where one takes room, one left from a size that didn't fit would make every size
  // after it look too big.)
  clue.style.overflow = 'hidden';
  let size = start;
  if (!fits()) {
    let [lo, hi] = [smallest, start];
    clue.style.fontSize = `${lo}px`;
    const mid = () => Math.round(((lo + hi) / 2) * 4) / 4;
    if (fits())
      for (let m = mid(); m > lo && m < hi; m = mid()) {
        clue.style.fontSize = `${m}px`;
        if (fits()) lo = m;
        else hi = m;
      }
    size = lo;
    clue.style.fontSize = `${size}px`;
  }
  clue.style.removeProperty('overflow');
  // Past three lines: left-aligned (ragged centred lines are hard to follow), what's on with it.
  const long = clue.scrollHeight / (size * 1.3) > 3.5;
  clue.classList.toggle('long', long);
  cap.classList.toggle('long', long);
  if (fits()) {
    noMore();
    clue.scrollTop = 0;
  } else {
    // Still more than fits: it scrolls (the arrow keys too, once Tab is on it), with ▼ More, which never goes while it
    // does (the keys on it would fall to the page, where Space buzzes).
    scrolls();
    clue.scrollTop = !same ? 0 : atEnd ? clue.scrollHeight : Math.round(share * clue.scrollHeight);
    drawMore();
  }
  // The keyboard up over the answer box: the question's top just under the top of what's in sight, the box under it;
  // with no room for both (a card between them, a small phone), or the box beside it, the box's last line just above
  // the keyboard, the question one scroll up. (8px from the edge: their scroll-margin. This scrolls what's in sight
  // too, where the page itself can't scroll that far.)
  if (kbd) {
    if (room >= floor && getComputedStyle(sec).display !== 'grid') (cap.hidden ? clue : cap).scrollIntoView({ block: 'start' });
    else answerLast().scrollIntoView({ block: 'end' });
  }
}

/** The question scrolls: room under its last line, the arrow keys (once Tab is on it), and ▼ More. */
function scrolls(): void {
  const clue = $('clue');
  clue.classList.add('scrolls');
  clue.tabIndex = 0;
  $('clue-more').hidden = false;
  drawMore();
}

/** ▼ More while there's more of the question below (its bottom edge faded); ▲ Top at its end. */
function drawMore(): void {
  const clue = $('clue');
  if (!clue.classList.contains('scrolls')) return;
  const end = clue.scrollTop + clue.clientHeight >= clue.scrollHeight - 2;
  clue.classList.toggle('more', !end);
  const pill = $('clue-more');
  const text = end ? '▲ Top' : '▼ More';
  if (pill.textContent === text) return;
  pill.textContent = text;
  pill.setAttribute('aria-label', end ? 'Back to the top of the question' : 'Show more of the question');
}

/** The question fits: no ▼ More, and keys that were on it (or on the question) go to BUZZ!, or to the box that's up. */
function noMore(): void {
  const clue = $('clue');
  const pill = $('clue-more');
  const at = document.activeElement;
  if (at === pill || at === clue) {
    const box = !$('answer-form').hidden ? choiceFocus() ?? $('answer-in') : !$('wager-form').hidden ? $('wager-in') : null;
    // (On a touch screen, not into a box: that would open the keyboard.)
    const to = !$('buzz').hidden ? $('buzz') : fine.matches ? box : null;
    if (to) to.focus({ preventScroll: true });
    else (at as HTMLElement).blur();
  }
  clue.classList.remove('scrolls', 'more');
  clue.removeAttribute('tabindex');
  pill.hidden = true;
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

/** What the reconnecting overlay says ("Reconnecting…", or what to check after a while): screens say it first. */
const awayText = (): string => $('overlay-text').textContent || 'Reconnecting…';

function render(): void {
  const away = !connected && everConnected && !notice?.final && !notice?.full && !!code;
  $('overlay').hidden = !away;
  // Long gone: say what to check, and offer a try now (it keeps trying on its own too).
  const long = away && attempts > 3;
  $('overlay-text').textContent = long ? `Still trying to reconnect… check your ${fine.matches ? 'internet connection' : 'Wi-Fi or mobile data'}` : 'Reconnecting…';
  $('overlay-retry').hidden = !long;
  // The page behind the overlay can't be reached (a screen reader or Tab would land on a buzzer that does nothing).
  // That drops focus, so a half-typed answer gets it back (and the phone keyboard) once reconnected.
  const main = document.querySelector('main')!;
  if (main.inert !== away) {
    const had = document.activeElement;
    if (away) awayFocus = had instanceof HTMLElement && main.contains(had) ? had : null;
    main.inert = away;
    const back = away ? null : awayFocus;
    if (!away) awayFocus = null;
    // After the rest of render(), when the screen it's on may have changed: only if it still shows and nothing
    // else took focus meanwhile.
    if (back)
      queueMicrotask(() => {
        const now = document.activeElement;
        if (back.isConnected && back.getClientRects().length && (!now || now === document.body || $('overlay').contains(now))) back.focus({ preventScroll: true });
      });
  }
  $('sound').hidden = !(seatId && view?.you);
  // Cards go with the seat (and the game): only the buzz screen has them.
  if (notice || !(seatId && view?.you)) dropCards();
  if (!code) return show('s-code');
  if (notice) {
    const fresh = $('s-msg').hidden;
    $('msg-title').textContent = notice.title;
    $('msg-text').textContent = notice.text;
    const btn = $('msg-btn');
    btn.hidden = !notice.button;
    btn.textContent = notice.button?.label ?? '';
    say(`${notice.title}. ${notice.text}`);
    show('s-msg');
    // Desktop: the keys go to the notice as it comes up (its title, read first), not to its button: Space, pressed a
    // moment ago to buzz, would take it before it's read ("Join another game" leaves the result). Enter takes it.
    if (fresh && fine.matches) $('msg-title').focus({ preventScroll: true });
    return;
  }
  if (away) say(awayText());
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
  if (fullJoin) {
    fullJoin = false;
    $('team-err').textContent = `The game is full (${MAX_PHONES} phones at most): try again when someone leaves.`;
  }
  // (The error has its own alert.)
  say(sentences([`Join ${t.name}`, t.members?.length ? `On it: ${t.members.join(', ')}` : '', 'Type your name']));
  show('s-team');
  if (wasHidden) inp.focus();
}

function renderSeats(s: SeatsMsg): void {
  if (s.title) $('title').textContent = s.title;
  const teams = !!s.teams;
  $('seats-title').textContent = teams ? 'Pick your team' : tap('Tap your name');
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
    ...s.seats.map((x, i) => {
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
        hint.textContent = tap('Yours, on another tab or phone · tap to take it back here');
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
      // Desktop: the number key that takes it (1–9), on its right. (Not part of its name: a screen reader hears the
      // shortcut as such.)
      if (i < 9) {
        const k = document.createElement('kbd');
        k.className = 'key desk';
        k.setAttribute('aria-hidden', 'true');
        k.textContent = String(i + 1);
        b.append(k);
        if (fine.matches) b.setAttribute('aria-keyshortcuts', String(i + 1));
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
          teamAsked = fullJoin = false;
          return render();
        }
        send({ t: 'join', seatId: x.id, device });
        // Something at once: the room's answer can take a moment on a slow network.
        seatsNote = `Joining as ${x.name}…`;
        renderSeatsRest(s);
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
  say([teams ? 'Pick your team.' : tap('Tap your name.'), seatsNote, s.locked ? 'The host has locked the seats.' : s.note ?? '', s.hostHere ? '' : "The host isn't connected right now."].filter(Boolean).join(' '));
  show('s-seats');
}

/** Takes every card off this phone (its players stopped, its files let go). */
function dropCards(): void {
  wasCardsUp = false;
  cardsSaid = '';
  if ($('cards').hidden && !$('card-list').childElementCount) return;
  clearCards($('card-list'));
  $('cards').hidden = true;
  $('s-buzz').classList.remove('cards-up', 'cards-aside', 'cards-under');
}

function renderBuzz(v: PhoneView): void {
  const you = v.you!;
  $('title').textContent = v.title || 'Brainrot Buzzer';
  const b = $('buzz');
  b.style.setProperty('--seat', you.color);
  b.style.setProperty('--seat-ink', textOn(you.color));
  const sym = v.currency ?? '';
  // Wagers: the player's own box instead of the buzzer (or what's locked in; someone else wagering; sitting out).
  const wager = v.phase === 'lobby' && v.wager ? v.wager : null;
  const boxUp = !!wager?.mine && wager.open;
  // The question while its clue is on (or answers are asked for it), what's on over it ("Science · $800"); above the
  // wager box, what's on screen ("Final Jeopardy! · US Presidents", "Daily Double — you're up!"). Written only when
  // they change, so a player keeps their place in a long question.
  const q = v.clue && (v.phase !== 'lobby' || v.answer) ? v.clue : null;
  const words = q?.text ?? (boxUp ? (v.status ?? '') : '');
  if ($('clue').textContent !== words) $('clue').textContent = words;
  const cap = $('clue-cap');
  if (cap.textContent !== (q?.caption ?? '')) cap.textContent = q?.caption ?? '';
  cap.hidden = !q?.caption;
  $('wager-form').hidden = !boxUp;
  // A ✍ clue: the answer box instead of the buzzer while answers are open.
  const ans = !boxUp && v.answer?.mine ? v.answer : null;
  const ansUp = !!ans?.open;
  $('answer-form').hidden = !ansUp;
  // Teams: you is your team; member is the name this phone joined it as.
  const team = !!v.teams;
  // Private cards: in the buzzer's place while nobody buzzes, the status line above them; above a box when one is up.
  const cards = v.cards?.list ?? [];
  const late = v.cards?.late ?? 0;
  const cardsUp = !!cards.length && v.phase === 'lobby' && !boxUp && !ansUp;
  b.hidden = boxUp || ansUp || cardsUp;
  const fresh = drawCards($('card-list'), cards);
  // A card new to this page: a short buzz, and said once ("A card only you can see"; Tap to see is where the keys go).
  if (fresh.length) {
    vibrate([70, 50, 70]);
    news(cardsLine(fresh.length, team, cards.some((c) => c.shared && fresh.includes(c.id))));
  }
  $('cards').hidden = !cards.length && !late;
  $('cards-late').hidden = !late;
  $('cards-late').textContent = lateLine(late, team);
  // (The line over cards in the buzzer's place is filled in below, once what the buzzer would say is known.)
  if (!cardsUp) $('card-status').hidden = true;
  $('s-buzz').classList.toggle('cards-up', cardsUp);
  $('s-buzz').classList.toggle('cards-aside', !!(cards.length || late) && !cardsUp);
  // A buzzer that's up stays where the finger is: cards beside it go under it, not over (a box keeps its cards over it).
  $('s-buzz').classList.toggle('cards-under', !!cards.length && !b.hidden);
  cardsSaid = lateLine(late, team);
  // Desktop: the key that buzzes, under the buzzer (to a screen reader too: its shortcut and description). Not with a
  // box up (Space types there); nor under what isn't a buzzer between clues (below).
  keyHint(fine.matches && !b.hidden);
  const at = document.activeElement;
  // Desktop: keys the player left on a button under the buzzer (🎨, a colour, Not you?) or on the sound go into a box as
  // it opens too: typing a wager or an answer is what's wanted then, and Space or Enter there would press that button.
  const parked = fine.matches && at instanceof HTMLButtonElement && !!at.closest('.foot, header');
  // (Keys on a long question or its ▼ More, from Tab or a click on the question, move on as if they were on BUZZ!.)
  const onClue = at === $('clue') || at === $('clue-more');
  // (Keys in a box as it goes, the Final's wager box as its answer box opens, say; or on a card's Tap to see, where they
  // wait between clues: Enter there would open the card, when it's meant for the box.)
  const inBox = $('answer-form').contains(at) || $('wager-form').contains(at);
  const covered = at instanceof HTMLElement && at.classList.contains('card-cover');
  /** The buzzer, while it's drawn (cards in its place take the keys then: below). */
  const buzzer = () => (b.hidden ? null : b);
  if (ansUp !== wasAnsUp) {
    const lost = !at || at === document.body || inBox || at === b || onClue || covered || (ansUp && parked);
    wasAnsUp = ansUp;
    // (Multiple choice: the one picked, or the first.)
    if (lost) queueMicrotask(() => (ansUp ? (choiceFocus() ?? $('answer-in')) : buzzer())?.focus());
  }
  // The keys (and a screen reader) follow: into the box as it opens, back to the buzzer as it goes.
  if (boxUp !== wasBoxUp) {
    const lost = !at || at === document.body || inBox || at === b || onClue || covered || (boxUp && parked);
    wasBoxUp = boxUp;
    if (lost) queueMicrotask(() => (boxUp ? $('wager-in') : buzzer())?.focus());
  }
  // A card coming in the buzzer's place takes the keys (and a screen reader) to its Tap to see, unless they're busy
  // elsewhere (reading another card, say); they go back to the buzzer as the cards go. (A Space press that began
  // before the move doesn't open it: see the keyup listener.)
  const newest = cardsUp ? (fresh[0] ?? (wasCardsUp ? null : cards[cards.length - 1].id)) : null;
  if (cardsUp !== wasCardsUp || newest) {
    // Cards making way for the buzzer close (a neighbour or a webcam would see an open one beside it, and it would push
    // the clue off the screen). One opened while the buzzer is up stays open.
    if (wasCardsUp && !cardsUp && !b.hidden) coverCards();
    const lost = !at || at === document.body || at === b || onClue || inBox || (cardsUp && parked) || (!cardsUp && $('cards').contains(at));
    wasCardsUp = cardsUp;
    // (Not to the buzzer while a box takes its place: the box has the keys.)
    const to = newest ? cardFocus(newest) : !cardsUp && !b.hidden ? b : null;
    if (lost && to) queueMicrotask(() => to.focus());
  }
  // (The answer box says its question as it opens: again if it opens again.)
  if (!ansUp) saidAsked = '';
  if (boxUp) return renderWager(v, wager!, sym);
  if (ansUp) return renderAnswer(v, ans!, sym);
  if (!ans) ((answerFor = ''), (answerErr = ''));
  answerTap = '';
  wagerFor = '';
  wagerErr = '';
  const left = Math.ceil((lockedUntil - serverNow()) / 1000);
  const mine = result && result.armId === v.armId ? result : null;
  let cls = '';
  let big = '';
  let small = '';
  /** What a screen reader hears instead of `small` (the early lock's countdown is said once, not every second). */
  let spoken: string | null = null;
  /** Nobody buzzes now (a partner clue): the button is greyed and does nothing, to a screen reader too. */
  let greyed = false;
  /** Between clues with nothing of this seat's to say: cards in the buzzer's place have the host's status line over them. */
  let plain = false;
  /** The two lines are one sentence ("You came 1st" "with $700 🎉"), said as one. */
  let whole = false;
  /** Teams: a teammate's buzz holds your team's place (not yours). */
  const mate = team && !!mine?.by && !mine.byYou ? mine.by : null;
  if (ans && !ans.open && v.statusOff && v.status) {
    // A partner clue's guess, locked (judged, or the answer is up): how it went, over what this seat sent.
    greyed = v.phase === 'lobby';
    [cls, big, small] = ['off', v.status, ans.text ? `${team ? 'Your team’s guess' : 'Your guess'}: “${ans.text}”` : (v.statusSub ?? '')];
  } else if (ans && !ans.open) {
    // A ✍ clue whose answer is on screen: what this seat sent stays in sight (or that one is in, as for wagers). In the
    // Final, the wager locked in first: the line shows 3 lines at most, so a long answer is what gets cut.
    const staked = wager?.kind === 'final' && wager.mine && wager.amount !== undefined ? `${team ? 'Your team’s wager' : 'Your wager'}: ${money(wager.amount, sym)} · ` : '';
    const picked = pickLine(ans);
    [cls, big, small] = [
      'off',
      'Answers locked',
      staked + (ans.text ? `${team ? 'Your team’s' : 'Yours'}: ${picked ?? `“${ans.text}”`}` : ans.hidden ? 'The host has it (not shown on this phone)' : 'None sent'),
    ];
  } else if (wager?.mine) {
    // Locked: the question is up.
    const yours = team ? 'Your team’s wager' : 'Your wager';
    [cls, big, small] = [
      'off',
      'Wager locked',
      wager.amount !== undefined ? `${yours}: ${money(wager.amount, sym)}` : wager.hidden ? 'The host has it (not shown on this phone)' : 'None sent: the host decides',
    ];
  } else if (wager?.kind === 'dd') {
    // Locked: the question is up, and they're answering it.
    const who = wager.who || 'Someone';
    [cls, big, small] = ['off', wager.open ? `${who} is wagering…` : `${who} is answering`, 'Daily Double'];
  } else if (wager) {
    [cls, big, small] = ['off', 'You sit this one out', v.status || (team ? 'Your team isn’t in this one' : 'You’re not in this one')];
  } else if (v.phase === 'lobby' && v.final) {
    ({ big, small } = placeLine(v));
    cls = 'off';
    whole = true;
  } else if (v.phase === 'lobby' && v.statusOff && v.status) {
    // Nobody buzzes (a partner clue): greyed, with who plays which part as the big line and what's going on under it.
    [cls, big, small] = ['off', v.status, v.statusSub ?? ''];
    greyed = true;
  } else if (v.phase === 'lobby') {
    big = you.name;
    small = v.status || 'Wait for the next clue';
    plain = true;
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
    // (Out: on another team for this clue; the one they're on now hasn't answered.)
    [cls, big, small] = ['off', 'Wait', you.out ? 'You were on another team for this one' : team ? 'Your team already answered this one' : 'You already answered this one'];
  } else if (left > 0) {
    [cls, big, small] = ['locked', 'Too early', `You buzzed before it lit up · wait ${left}s`];
    spoken = 'Wait a moment before buzzing again';
  } else if (v.phase === 'armed') {
    [cls, big, small] = ['armed', 'BUZZ!', team && you.member ? `${you.member} for ${you.name}` : you.name];
  } else {
    [cls, big, small] = ['ready', 'Get ready…', "Don't buzz yet"];
  }
  // Between clues nothing buzzes: no Space hint under what the button says instead ("Wager locked", "Ann is answering ·
  // Daily Double", "Answers locked", "You sit this one out", where you came). (During a clue it stays, even under
  // "Wait": coming and going, it would move BUZZ!.)
  if (v.phase === 'lobby' && cls === 'off') keyHint(false);
  // Cards in the buzzer's place: what it would say over them ("Answers locked", "Wager locked", where you came), or the
  // host's status line between clues (none: no line).
  const [cardBig, cardSmall] = !cardsUp ? ['', ''] : plain ? [v.status ?? '', v.statusSub ?? ''] : [big, small];
  $('card-status').hidden = !cardBig;
  $('card-status-big').textContent = cardBig;
  $('card-status-small').textContent = cardSmall;
  if (sendingArm === v.armId && !mine && v.phase !== 'lobby') small = 'Sending…';
  if (lostArm === v.armId && !mine && cls !== 'first' && cls !== 'locked') small = 'Your buzz didn’t get through — press again';
  // Back from the background: until the room answers the ping, a press may be on a dead connection (it's kept).
  if (probeTimer && cls !== 'first') small = 'Checking connection…';
  // BUZZ! shows for this arm for the first time: reaction times count from when it's drawn (taken after show() below,
  // so fitting the question to the screen never counts against a player).
  const lit = cls === 'armed' && litArm !== v.armId;
  if (lit) litArm = v.armId;
  // A beep and a flash when BUZZ! lights up and when you're answering (each once).
  const cue = cls === 'armed' ? `armed ${v.armId}` : cls === 'first' ? `first ${v.armId}` : '';
  if (cue && cue !== cued) {
    beep(cls === 'armed' ? [880] : [660, 990]);
    flash();
    // Said at once, not after whatever a screen reader is still reading: a buzz is a race.
    const alert = $('alert');
    alert.textContent = '';
    clearTimeout(alertTimer);
    queueMicrotask(() => {
      alert.textContent = big;
      alertTimer = window.setTimeout(() => (alert.textContent = ''), 2000);
    });
  }
  cued = cue || cued;
  b.className = cls;
  // A name may be one long word: it breaks anywhere rather than push the page sideways (status words stay whole).
  const names = [you.name, you.member, v.answering?.name, v.answering?.by, v.done?.by?.name, mine?.behind, mate, wager?.who].filter((x): x is string => !!x);
  for (const [id, text] of [['buzz-big', big], ['buzz-small', small]] as const) {
    $(id).textContent = text;
    $(id).classList.toggle('name', names.some((n) => text.includes(n)));
  }
  const heard = whole ? [`${big} ${small}`] : [big, spoken ?? small];
  b.setAttribute('aria-label', sentences(heard));
  if (greyed) b.setAttribute('aria-disabled', 'true');
  else b.removeAttribute('aria-disabled');
  const hostGone = renderFoot(v, sym);
  // (Cards up: the line over them is what's said, not the hidden buzzer's.)
  const said = cardsUp && plain ? [cardBig, cardSmall] : heard;
  say(sentences([connected ? '' : awayText(), ...said, cardsSaid, hostGone ? ($('host-note').textContent ?? '') : '']));
  show('s-buzz');
  if (lit) litAt = performance.now();
  // Count the early lock down.
  clearTimeout(tick);
  if (left > 0) tick = window.setTimeout(render, 200);
}

/** Desktop: "Press Space to buzz" under the buzzer, and the same to a screen reader (its shortcut and description). */
function keyHint(on: boolean): void {
  const b = $('buzz');
  $('keys').hidden = !on;
  for (const [attr, value] of [
    ['aria-keyshortcuts', 'Space'],
    ['aria-describedby', 'keys'],
  ] as const)
    if (on) b.setAttribute(attr, value);
    else b.removeAttribute(attr);
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

/** 🎨 Change your color (when the host allows it): the palette, with other players' colours greyed out. */
function renderColors(v: PhoneView): void {
  // (Not while the host is away: it would be dropped. Nor once the game is over.)
  const pick = v.hostHere !== false && !(v.phase === 'lobby' && v.final) ? v.colorPick : undefined;
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
      b.style.color = textOn(c);
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
  $('wager-label').textContent = team ? 'Wager (only the host and your team see it)' : 'Wager (only the host sees it)';
  const inp = $<HTMLInputElement>('wager-in');
  // Filled with what's in when the box comes up, and again when what's in changes (a teammate, the host), unless the
  // box holds an edit not sent yet (something other than what was in before). The box has the focus as it opens, so
  // that alone doesn't mean someone is typing.
  const key = `${w.id} ${w.amount ?? ''}`;
  if (key !== wagerFor) {
    const was = wagerFor.startsWith(`${w.id} `) ? wagerFor.slice(w.id.length + 1) : null;
    if (was === null || document.activeElement !== inp || inp.value.trim() === was) inp.value = w.amount !== undefined ? String(w.amount) : '';
    wagerFor = key;
  }
  inp.max = w.limit && w.max !== undefined ? String(w.max) : '';
  // (Not held to a max: the host takes any amount, so none is shown; a score of 0 or less would read "Max $0".)
  const max = !w.limit ? 'No limit' : w.max !== undefined ? `Max ${money(w.max, sym)}` : '';
  $('wager-info').textContent = [`Score ${money(you.score, sym)}`, max].filter(Boolean).join(' · ');
  const state = wagerState(w, team, sym);
  drawState('wager-state', state, wagerSending);
  // Green for what's in and shown; plain for "not shown here".
  $('wager-state').classList.toggle('plain-note', !!w.hidden && w.amount === undefined);
  $('wager-err').textContent = wagerErr;
  $<HTMLButtonElement>('wager-send').textContent = w.amount !== undefined && !w.host ? 'Change wager' : 'Send wager';
  const hostGone = renderFoot(v, sym);
  // (What it's for first: "Final Jeopardy! · US Presidents". The error has its own alert, so it isn't said twice.)
  say(sentences([connected ? '' : awayText(), $('clue').textContent ?? '', $('wager-head').textContent ?? '', $('wager-info').textContent ?? '', state, cardsSaid, hostGone ? ($('host-note').textContent ?? '') : '']));
  show('s-buzz');
}

/** What's in with the host, or that the box holds an amount not sent yet (one not sent would read as sent). */
function wagerState(w: PhoneWager, team: boolean, sym: string): string {
  // Seated after the wagers began: one is in, but this phone isn't shown it.
  if (w.amount === undefined)
    return w.hidden ? `${team ? 'Your team’s' : 'Your'} wager is in with the host (not shown on a phone that joined after the wagers began). Sending one replaces it.` : '';
  const amt = money(w.amount, sym);
  // (As numbers: "00" typed after the 0 the host put in for a player with nothing to wager is the same wager.)
  const typed = $<HTMLInputElement>('wager-in').value.trim();
  if (typed && Number(typed) !== w.amount) return `${tap(`Not sent yet: tap ${w.host ? 'Send' : 'Change'} wager to send it.`)} What the host has: ${amt}`;
  const what = w.host ? `The host has your wager as ${amt}` : team && w.by ? `✔ ${w.byYou ? 'You' : w.by} sent ${amt} for your team` : w.sent ? `✔ Sent: ${amt}` : '';
  return `${what}. You can change it until the question shows.`;
}

/** A box's state line: "Sending…", what's in (green), or an edit not sent yet (amber: it isn't in). */
function drawState(id: 'answer-state' | 'wager-state', state: string, sending: boolean): void {
  $(id).textContent = sending ? 'Sending…' : state;
  $(id).classList.toggle('unsent', !sending && state.startsWith('Not sent yet'));
}

/** What's in with the host, or that the box holds something not sent yet (an edit not sent would read as sent). */
function answerState(a: NonNullable<PhoneView['answer']>, team: boolean): string {
  const choices = !!a.choices?.length;
  // Seated after the answers began: one is in, but this phone isn't shown it (as for wagers).
  if (!a.text)
    return a.hidden
      ? `${team ? 'Your team’s' : 'Your'} answer is in with the host (not shown on a phone that joined after the answers began). ${choices ? tap('Tapping one replaces it.') : 'Sending one replaces it.'}`
      : '';
  const typed = $<HTMLTextAreaElement>('answer-in').value.replace(/\s+/g, ' ').trim();
  if (!choices && typed && typed !== a.text) return `${tap('Not sent yet: tap Change answer to send it.')} What the host has: “${a.text}”`;
  // (A partner clue's guess, nobody buzzing, is locked once the host judges it too.)
  const until = view?.statusOff ? 'judges it or shows the answer' : 'shows the answer';
  // Multiple choice: by its letter alone ("✔ Sent: B", "✔ Ann picked B for your team"): the lit button has its words,
  // and two lines keep to the room the buttons leave them (a longer one would move them as it comes).
  const at = a.pick ? (a.choices ?? []).findIndex((c) => c.id === a.pick) : -1;
  if (at >= 0 && team && a.by) return `✔ ${a.byYou ? 'You' : a.by} picked ${letter(at)} for your team. You can change it until the host ${until}.`;
  if (at >= 0) return `✔ Sent: ${letter(at)}. You can change it until the host ${until}.`;
  return `${team && a.by ? `✔ ${a.byYou ? 'You' : a.by} sent it for your team` : '✔ Sent'}: “${a.text}”. You can change it until the host ${until}.`;
}

/** The letter of the choice at place `i`: A, B, C… */
const letter = (i: number): string => String.fromCharCode(65 + i);

/** A pick as its letter and words ("B · Paris"), while it's one of the choices shown; else undefined. */
function pickLine(a: NonNullable<PhoneView['answer']>): string | undefined {
  const i = a.pick ? (a.choices ?? []).findIndex((c) => c.id === a.pick) : -1;
  return i < 0 ? undefined : `${letter(i)} · ${a.choices![i].text}`;
}

/** The choice buttons (each drawn once, so the keys stay on one as its pick changes): the one picked is pressed. */
function drawChoices(a: NonNullable<PhoneView['answer']>): void {
  const box = $('answer-choices');
  const list = a.choices ?? [];
  const key = JSON.stringify(list.map((c) => [c.id, c.text]));
  if (key !== choicesKey) {
    choicesKey = key;
    box.replaceChildren(
      ...list.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.dataset.choice = c.id;
        const l = document.createElement('span');
        l.className = 'letter';
        l.textContent = letter(i);
        const w = document.createElement('span');
        w.className = 'words';
        w.dir = 'auto';
        w.textContent = c.text;
        b.append(l, w);
        return b;
      }),
    );
  }
  const on = answerTap || a.pick;
  for (const b of box.querySelectorAll<HTMLButtonElement>('button.choice')) b.setAttribute('aria-pressed', String(b.dataset.choice === on));
}

/** Where the keys go in a ✍ clue's choices: the one picked, or the first (null without choices up). */
function choiceFocus(): HTMLButtonElement | null {
  const box = $('answer-choices');
  if (box.hidden) return null;
  return box.querySelector<HTMLButtonElement>('button.choice[aria-pressed="true"]') ?? box.querySelector<HTMLButtonElement>('button.choice');
}

/** A ✍ clue: this seat's answer box (what's in, who sent it, why the last one wasn't taken). */
function renderAnswer(v: PhoneView, a: NonNullable<PhoneView['answer']>, sym: string): void {
  const team = !!v.teams;
  // A partner clue's guesser types their guess: their lines over the box ("🎯 You're guessing!", who's describing).
  const guess = !!v.statusOff;
  // The Final: the wager locked in, over the box (as it showed over the question before).
  const w = v.wager;
  const staked = !guess && w?.kind === 'final' && w.mine && w.amount !== undefined ? `${team ? 'Your team’s wager' : 'Your wager'}: ${money(w.amount, sym)} (locked)` : '';
  const sub = guess ? (v.statusSub ?? '') : staked;
  $('answer-head').hidden = !guess || !v.status;
  $('answer-head').textContent = guess ? (v.status ?? '') : '';
  $('answer-sub').hidden = !sub;
  $('answer-sub').textContent = sub;
  // Multiple choice: a button each in place of the box to type in (and its Send), a tap sends it.
  const choices = !guess && !!a.choices?.length;
  $('answer-choices').hidden = !choices;
  $('answer-form').classList.toggle('picking', choices);
  // (The label names the group only while it's up: the box to type in has it otherwise.)
  if (choices) $('answer-choices').setAttribute('aria-labelledby', 'answer-label');
  else $('answer-choices').removeAttribute('aria-labelledby');
  $('answer-in').hidden = choices;
  $('answer-send').hidden = choices;
  if (choices) drawChoices(a);
  else if (choicesKey) ((choicesKey = ''), $('answer-choices').replaceChildren());
  if (!choices) answerTap = '';
  $('answer-keys').textContent = choices ? `Press A–${letter(a.choices!.length - 1)} to pick` : 'Enter sends · Shift+Enter for a new line';
  $('answer-label').textContent = choices
    ? team
      ? 'Your team’s answer: pick one (only the host and your team see it)'
      : 'Pick your answer (only the host sees it)'
    : team
      ? 'Your team’s answer (only the host and your team see it)'
      : 'Your answer (only the host sees it)';
  const inp = $<HTMLTextAreaElement>('answer-in');
  // Filled with what's in when the box comes up, and again when what's in changes (a teammate), unless the box holds
  // an edit not sent yet (as for the wager box).
  const key = `${a.id} ${a.text ?? ''}`;
  if (key !== answerFor) {
    const was = answerFor.startsWith(`${a.id} `) ? answerFor.slice(a.id.length + 1) : null;
    if (was === null || document.activeElement !== inp || inp.value.replace(/\s+/g, ' ').trim() === was) inp.value = a.text ?? '';
    answerFor = key;
  }
  const state = answerState(a, team);
  drawState('answer-state', state, answerSending);
  // Green for what's in and shown; plain for "not shown here".
  $('answer-state').classList.toggle('plain-note', !!a.hidden && !a.text);
  $('answer-err').textContent = answerErr;
  $<HTMLButtonElement>('answer-send').textContent = a.text ? 'Change answer' : 'Send answer';
  const hostGone = renderFoot(v, sym);
  // The question (and what's on), said once as it comes: not again before each "Sending…" or "✔ Sent" (it can be 1,000
  // characters long). It stays on the page to read again.
  const asked = sentences([$('clue-cap').hidden ? '' : ($('clue-cap').textContent ?? ''), $('clue').textContent ?? '']);
  if (asked !== saidAsked) {
    saidAsked = asked;
    if (asked) news(asked);
  }
  // (Multiple choice: how many to pick from, never each choice on every change: the group is there to read. In the
  // Final, after it the wager locked in.)
  const what = guess
    ? [v.status ?? '', v.statusSub ?? '']
    : choices
      ? [`Pick one of ${a.choices!.length}`, staked]
      : w?.kind === 'final'
        ? ['Type your answer', staked]
        : ['Everyone answers'];
  say(sentences([connected ? '' : awayText(), ...what, state, cardsSaid, hostGone ? ($('host-note').textContent ?? '') : '']));
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

// ---- private cards ----

let newsTimer = 0;
/** Lines for news() not said yet: two at once (a question and a card coming with it) are said together. */
let newsLines: string[] = [];
/**
 * Says a line to a screen reader once (a card arriving, its picture arriving, the answer box's question), leaving the
 * screen's own words (#live) alone.
 */
function news(text: string): void {
  const n = $('news');
  if (!newsLines.length) {
    n.textContent = '';
    clearTimeout(newsTimer);
    queueMicrotask(() => {
      n.textContent = newsLines.join(' ');
      newsLines = [];
      newsTimer = window.setTimeout(() => (n.textContent = ''), 3000);
    });
  }
  newsLines.push(text);
}

initCards({
  code: () => code,
  // The token of the seat (or team place) this phone holds now: the room gives a card's files to no one else.
  token: () => {
    const s = loadSeat();
    return s && seatId && s.seatId === seatId ? s.token : null;
  },
  seen: (id) => {
    if (!connected || ws?.readyState !== WebSocket.OPEN) return false;
    send({ t: 'cardSeen', id });
    return true;
  },
  tap,
  news,
  redraw: render,
});

// ---- wiring ----

$('buzz').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointerPress = true;
  unlockAudio();
  buzz(e.timeStamp);
});
// (A press that turns into a scroll, or is taken by the system: no click comes.)
$('buzz').addEventListener('pointercancel', () => (pointerPress = false));
// A screen reader (or a switch) presses with a click and no pointerdown: that buzzes too, once. The click that ends a
// press which buzzed on pointerdown doesn't, however long the button was held (a long one would buzz again, and before
// the buzzers open that starts the early lock-out over).
$('buzz').addEventListener('click', (e) => {
  if (pointerPress) return void (pointerPress = false);
  if (performance.now() - lastPress < 600) return;
  buzz(e.timeStamp);
});
$('buzz').addEventListener('contextmenu', (e) => e.preventDefault());
// A mouse press on 🎨, a colour, Not you? or the sound leaves the keys where they were, not on that button: Space and
// Enter stay the buzzer's, and a wager or answer box that opens still takes them. (A touch screen's taps as before. A
// ✍ clue's choice takes them: nothing buzzes then, and ↑ / ↓ go on from the one picked.)
for (const el of [$('s-buzz'), document.querySelector('header')!])
  el.addEventListener('mousedown', (e) => {
    if (pointerKind !== 'touch' && (e.target as Element).closest('button:not(#buzz):not(.choice)')) e.preventDefault();
  });

/** Keys there are for typing (a name, a wager, an answer): never the buzzer's, nor a shortcut's. */
const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * Space and Enter buzz from anywhere on the buzz screen (the buzzer up, nothing over it), unless the keys are in a box
 * to type in or on another button that Tab took them to (🎨, a colour, Not you?, the sound): that one takes both, as
 * any button does. (A click on one of those leaves the keys where they were, so they stay the buzzer's.)
 */
function buzzKey(e: KeyboardEvent): boolean {
  if ((e.key !== ' ' && e.key !== 'Enter') || $('s-buzz').hidden || $('buzz').hidden || !$('overlay').hidden || typing(e.target)) return false;
  // The keys on a card (its words, a video, a player): they're the card's, never a buzz.
  if (e.target instanceof Node && $('cards').contains(e.target)) return false;
  const t = e.target;
  return !(t instanceof HTMLButtonElement && t !== $('buzz') && t.getClientRects().length > 0);
}

/** Moves the keys to the next (dir 1) or the previous (-1) of these buttons that can be pressed; from none of them, to the first (or the last). */
function stepFocus(e: KeyboardEvent, buttons: Iterable<HTMLButtonElement>, dir: 1 | -1): void {
  const on = [...buttons].filter((b) => !b.disabled && b.getClientRects().length > 0);
  if (!on.length) return;
  e.preventDefault();
  const at = on.indexOf(document.activeElement as HTMLButtonElement);
  on[at < 0 ? (dir > 0 ? 0 : on.length - 1) : Math.max(0, Math.min(on.length - 1, at + dir))].focus();
}

/**
 * Esc: shuts the colour picker, or goes back from a name form or a request to join. (Shut from a colour, the keys go on
 * to the buzzer, not back to 🎨: Space there would open it again, not buzz.)
 */
function escape(e: KeyboardEvent): void {
  if (colorsOpen && !$('s-buzz').hidden) {
    const inside = $('colors').contains(document.activeElement);
    colorsOpen = false;
    if (view?.you) renderColors(view);
    if (inside) $('buzz').focus();
  } else if (!$('s-new').hidden) $('new-back').click();
  else if (!$('s-team').hidden) $('team-back').click();
  else if (!$('s-wait').hidden && !$('wait-cancel').hidden) $('wait-cancel').click();
  else return;
  e.preventDefault();
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) spaceFrom = e.target;
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (!e.repeat) escape(e);
    return;
  }
  // A notice: Enter takes its button (Pick a seat, Join another game) from anywhere on it; Space doesn't. (A button Tab
  // took the keys to takes Enter itself.)
  if (e.key === 'Enter' && !$('s-msg').hidden && !$('msg-btn').hidden && $('overlay').hidden && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    if (!e.repeat) $('msg-btn').click();
    return;
  }
  if (buzzKey(e)) {
    // Repeats too: a held key never scrolls the page, nor presses the button again.
    e.preventDefault();
    if (e.repeat) return;
    // (A key press lets the page play sound, as a tap does: a keyboard player hears BUZZ! too.)
    unlockAudio();
    if (!wakeWanted) void wake();
    buzz(e.timeStamp);
    return;
  }
  if (typing(e.target)) return;
  if (!$('s-seats').hidden) {
    // The seat list: 1–9 takes that seat (or team), as a click on it would; ↑ and ↓ move the keys along the list.
    if (/^[1-9]$/.test(e.key)) {
      const seat = $('seat-list').querySelectorAll<HTMLButtonElement>('button.seat')[Number(e.key) - 1];
      if (!seat || seat.disabled) return;
      e.preventDefault();
      if (!e.repeat) seat.click();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') stepFocus(e, $('s-seats').querySelectorAll<HTMLButtonElement>('button.seat'), e.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  // A ✍ clue's choices: A–F pick one, as a click would; ↑ and ↓ move the keys along them (from one of them, or from
  // nowhere: on a long question they scroll it).
  if (!$('s-buzz').hidden && !$('answer-form').hidden && !$('answer-choices').hidden && $('overlay').hidden) {
    const buttons = $('answer-choices').querySelectorAll<HTMLButtonElement>('button.choice');
    if (/^[a-f]$/i.test(e.key)) {
      const b = buttons[e.key.toLowerCase().charCodeAt(0) - 97];
      if (!b) return;
      e.preventDefault();
      if (e.repeat) return;
      b.focus();
      b.click();
      return;
    }
    const at = document.activeElement;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (!at || at === document.body || $('answer-choices').contains(at)))
      return stepFocus(e, buttons, e.key === 'ArrowDown' ? 1 : -1);
  }
  // The colour picker: the arrow keys go from colour to colour.
  if (colorsOpen && $('colors').contains(document.activeElement) && /^Arrow(Left|Right|Up|Down)$/.test(e.key))
    stepFocus(e, $('colors').querySelectorAll<HTMLButtonElement>('button.swatch'), e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
});
// (Space presses a focused button as it comes back up: the buzz was on the way down. A card's Tap to see, Hide or play
// button the keys moved to while Space was down, a card arriving, isn't pressed by it.)
document.addEventListener('keyup', (e) => {
  if (e.key !== ' ') return;
  const from = spaceFrom;
  spaceFrom = null;
  if (buzzKey(e)) e.preventDefault();
  else if (e.target instanceof HTMLButtonElement && $('cards').contains(e.target) && from !== e.target) e.preventDefault();
});

/** Desktop: the key that buzzes, or (another window has the keyboard: the stream, say) that a click here gets it back. */
function drawKeys(away = !document.hasFocus()): void {
  const k = $('keys');
  k.classList.toggle('away', away);
  if (away) return void (k.textContent = 'Space goes to another window: click here first');
  const cap = document.createElement('kbd');
  cap.textContent = 'Space';
  k.replaceChildren('Press ', cap, ' to buzz');
}
addEventListener('focus', () => drawKeys(false));
addEventListener('blur', () => drawKeys(true));
drawKeys();

/**
 * Desktop: the answer box says its keys to a screen reader too (the hints on screen are desktop only). The buzzer's
 * are drawn with it (renderBuzz).
 */
function drawDesk(): void {
  for (const id of ['answer-in', 'answer-choices'])
    if (fine.matches) $(id).setAttribute('aria-describedby', 'answer-keys');
    else $(id).removeAttribute('aria-describedby');
}
drawDesk();
// A tablet that gets a mouse, a laptop folded into a tablet: the words and hints follow.
fine.addEventListener?.('change', () => {
  drawDesk();
  drawSound();
  retapCards($('card-list'));
  seatsKey = '';
  render();
});

document.addEventListener(
  'pointerdown',
  (e) => {
    pointerKind = e.pointerType;
    // (Before the buzzer's own: a press that began on it and ended off it, with no click, is over.)
    pointerPress = false;
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
$('overlay-retry').addEventListener('click', () => {
  clearTimeout(retryTimer);
  attempts = 0;
  connect();
  render();
  // The button hides under focus: keep a keyboard or screen reader on the overlay rather than lost on the page.
  if ($('overlay-retry').hidden && !$('overlay').hidden) $('overlay-text').focus();
});
$('color-btn').addEventListener('click', () => {
  colorsOpen = !colorsOpen;
  colorsKey = '';
  if (view?.you) renderColors(view);
  // On a small phone it opens below the screen's edge.
  if (colorsOpen) $('colors').scrollIntoView({ block: 'nearest' });
});
$('colors').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.swatch');
  if (!b || b.disabled || !b.dataset.color) return;
  if (b.getAttribute('aria-pressed') !== 'true') send({ t: 'color', color: b.dataset.color });
  // Shut; the buzzer turns the new colour when the host has it. Picked with the keys on a computer, they go on to the
  // buzzer (Space buzzes, rather than open the picker again from 🎨); on a phone, back to the button that opened it.
  // (Picked with the mouse, the keys stay where they were: Space buzzes.)
  colorsOpen = false;
  if (e.detail === 0 && fine.matches) $('buzz').focus();
  else if (e.detail === 0 || pointerKind === 'touch') $('color-btn').focus();
  if (view?.you) renderColors(view);
});
$('wait-cancel').addEventListener('click', (e) => {
  // Not waiting for the host any more: back to the list (the keys onto ＋ I'm new, when they pressed it). Not the name
  // form, even before the room has said it's waiting (which shuts that).
  send({ t: 'leave' });
  pendingName = null;
  newForm = false;
  render();
  if (e.detail === 0) $('new-btn').focus();
});
// A long question: ▼ More scrolls it most of the way down what's in sight; ▲ Top, at the end, back to its start.
$('clue-more').addEventListener('click', () => {
  const clue = $('clue');
  const end = clue.scrollTop + clue.clientHeight >= clue.scrollHeight - 2;
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  clue.scrollTo({ top: end ? 0 : clue.scrollTop + clue.clientHeight * 0.8, behavior });
});
$('clue').addEventListener('scroll', drawMore, { passive: true });
// The screen turning or resized, and what's around the question changing size (a card opening, a box's notes): see
// whether it still fits as it is (fitClue).
addEventListener('resize', () => fitClue());
const aroundClue = new ResizeObserver(() => fitClue());
for (const el of [$('cards'), $('wager-form'), $('answer-form'), document.querySelector('.side.foot')!]) aroundClue.observe(el);
// The on-screen keyboard opening (or the phone turning): the answer box and its question fit what's in sight above it
// (fitClue). Another box in use (a wager has no question above it) stays in the middle of it.
window.visualViewport?.addEventListener('resize', () => {
  fitClue();
  const el = document.activeElement;
  if (el === $('answer-in')) {
    // (A browser that makes the whole page shorter for the keyboard: no keyboard as fitClue sees it, so just in sight.)
    if (!keyboardUp()) el.scrollIntoView({ block: 'nearest' });
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.scrollIntoView({ block: 'center' });
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
  if (!a?.mine || !a.open || a.choices?.length) return;
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
// Multiple choice: a tap sends that choice at once (it can be changed until the host shows the answer).
$('answer-choices').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.choice');
  const a = view?.answer;
  const pick = b?.dataset.choice;
  if (!pick || !a?.mine || !a.open || !a.choices?.some((c) => c.id === pick)) return;
  // (Already the one in: nothing to send.)
  if (pick === a.pick && !answerTap) return;
  answerErr = '';
  answerTap = pick;
  answerTapTaken = false;
  answerSending = connected;
  if (!connected) ((answerErr = 'Not connected: try again in a moment.'), (answerTap = ''));
  send({ t: 'answer', id: a.id, pick });
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
  // (Joined with the keys alone: the page may play sound from now on.)
  unlockAudio();
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
  $('new-err').textContent = '';
  render();
  $('new-in').focus();
});
$('new-back').addEventListener('click', (e) => {
  newForm = false;
  $('new-err').textContent = '';
  render();
  // (Back with the keys, or Esc: they go back onto ＋ I'm new.)
  if (e.detail === 0) $('new-btn').focus();
});
// What's in, or "Not sent yet", as the box changes (only that line: the rest, and what a screen reader hears, stay).
$('answer-in').addEventListener('input', () => {
  const a = view?.answer;
  if (a && !answerSending) drawState('answer-state', answerState(a, !!view?.teams), false);
});
$('wager-in').addEventListener('input', () => {
  const w = view?.wager;
  if (w?.mine && !wagerSending) drawState('wager-state', wagerState(w, !!view?.teams, view?.currency ?? ''), false);
});
$('new-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('new-in').value.trim();
  if (!name) {
    $('new-err').textContent = 'Type your name first.';
    return void $('new-in').focus();
  }
  $('new-err').textContent = '';
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
$('team-back').addEventListener('click', (e) => {
  const was = teamPick?.id;
  teamPick = null;
  teamAsked = fullJoin = false;
  render();
  // (Back with the keys, or Esc: they go back onto that team.)
  if (e.detail === 0 && was) $('seat-list').querySelector<HTMLElement>(`[data-seat="${CSS.escape(was)}"]`)?.focus();
});
$('msg-btn').addEventListener('click', () => notice?.button?.run());

const fromPath = location.pathname.replace(/^\/+|\/+$/g, '').toUpperCase();
if (isRoomCode(fromPath)) void start(fromPath);
else {
  if (fromPath) history.replaceState(null, '', '/');
  render();
  $('code-in').focus();
}
