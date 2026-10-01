/**
 * The phone page: room code → tap your name → one big buzzer. Talks to the room over one WebSocket (see
 * src/lib/buzzproto.ts); keeps its seat token in localStorage so a reload or a dropped connection gets the seat back.
 *
 * Fair timing: the page notes when it shows BUZZ! for an arm and sends the time from then to the press (reactMs) with
 * the buzz; it answers every pong with a sync at once, so the room can time this phone's round trip itself.
 *
 * Dead sockets: a phone back from the background (or a buzz the room doesn't answer) checks the connection with a ping
 * and starts again if no pong comes back in a couple of seconds, so a press is never silently lost.
 */
import { isRoomCode, ROOM_ALPHABET, type DenyReason, type PhoneView, type RoomToPhone } from '../../src/lib/buzzproto';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['s-code', 's-wait', 's-seats', 's-new', 's-msg', 's-buzz'] as const;
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
/** The last state cue (BUZZ! lit, you won) played, so each plays once. */
let cued = '';

// ---- saved seat (per room code) and this browser's id ----

const key = () => `brainrot-buzzer:${code}`;
function loadSeat(): { seatId: string; token: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(key()) ?? 'null');
    return v && typeof v.seatId === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
}
function saveSeat(s: { seatId: string; token: string } | null): void {
  try {
    if (s) localStorage.setItem(key(), JSON.stringify(s));
    else localStorage.removeItem(key());
  } catch {
    // private mode: the seat just won't survive a reload
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

function connect(): void {
  clearTimeout(retryTimer);
  const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
  ws = s;
  s.onopen = () => {
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
    if (typeof e.data !== 'string') return;
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
    }
  }, PROBE_MS);
}

/** The socket is gone: try again with backoff (unless the game is over). `wait`: try again after this long instead. */
function dropped(s: WebSocket, wait?: number): void {
  if (ws !== s) return;
  s.onopen = s.onmessage = s.onclose = null;
  try {
    s.close();
  } catch {
    // already closed
  }
  ws = null;
  connected = false;
  rejoining = false;
  clearInterval(pingTimer);
  clearTimeout(probeTimer);
  probeTimer = 0;
  stopSending();
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
    }
    connect();
  }, delay);
}

function ended(): void {
  saveSeat(null);
  notice = { title: 'The game is over', text: 'Thanks for playing!', final: true };
  ws?.close();
  render();
}

function onMessage(m: RoomToPhone): void {
  switch (m.t) {
    case 'seats': {
      // A seated phone only gets the list when it lost its seat: another tab or phone took it back, or the host
      // removed the player.
      if (!rejoining && seatId) {
        seatsNote = m.seats.some((x) => x.id === seatId)
          ? 'Your seat moved to another tab or phone. Tap your name to take it back here.'
          : 'The host took you out of the game.';
        if (!m.seats.some((x) => x.id === seatId)) saveSeat(null);
        seatId = null;
        view = null;
      }
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
      if (m.lockedUntil) lockedUntil = m.lockedUntil;
      if (m.outcome === 'first') vibrate([80, 50, 80]);
      else if (m.outcome === 'early') vibrate(250);
      break;
    case 'kicked':
      seatId = null;
      view = null;
      saveSeat(null);
      notice = {
        title: 'The host took your seat back',
        text: 'You can pick a seat again.',
        button: { label: 'Pick a seat', run: () => ((notice = null), render()) },
      };
      break;
    case 'closed':
      ended();
      return;
    case 'pong':
      // Straight back, before anything else: the room times the round trip from its pong to this.
      send({ t: 'sync', serverNow: m.serverNow });
      lastPong = Date.now();
      offset = m.serverNow - (m.at + Date.now()) / 2;
      return;
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
  if (wasRejoin || reason === 'bad-token') saveSeat(null);
  pendingName = null;
  newForm = false;
  seatsNote =
    {
      taken: wasRejoin ? 'Your seat was given to someone else. Tap your name again.' : 'Someone already has that seat.',
      'unknown-seat': "That player isn't in the game any more.",
      rejected: "The host didn't let you in.",
      'no-new': "The host isn't taking new players.",
      'bad-token': 'Your seat was given back. Tap your name again.',
      locked: 'The host has locked the seats.',
      blocked: 'The host took you off that seat. Pick another one, or ask the host.',
      'name-taken': 'A player already has that name. If it’s you, tap it; if not, pick another name.',
    }[reason] ?? "That didn't work. Try again.";
}

/** "Not you?": let go of this seat and pick again. */
function leaveSeat(): void {
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
  if (!connected) return;
  const reactMs = litArm === view.armId && view.phase === 'armed' ? Math.max(0, Math.round(at - litAt)) : undefined;
  send({ t: 'buzz', armId: view.armId, ...(reactMs !== undefined ? { reactMs } : {}) });
  vibrate(30);
  const b = $('buzz');
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
  // Show it's on its way until the room answers; no answer means the connection is dead (start again at once).
  if (!(result && result.armId === view.armId)) {
    const s = ws;
    sendingArm = view.armId;
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
  b.textContent = soundOn ? '🔔' : '🔕';
  b.setAttribute('aria-label', soundOn ? 'Sound on: tap to mute' : 'Sound off: tap to turn it on');
  b.setAttribute('aria-pressed', String(!soundOn));
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

function show(id: ScreenId): void {
  for (const s of screens) $(s).hidden = s !== id;
}

/** What a screen reader hears: the screen's main words, said again whenever they change. */
function say(text: string): void {
  const live = $('live');
  if (live.textContent !== text) live.textContent = text;
}

function render(): void {
  const away = !connected && everConnected && !notice?.final && !!code;
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
  if (pendingName) return wait('Waiting for the host to let you in…');
  if (newForm) {
    show('s-new');
    return;
  }
  if (seats && !rejoining) return renderSeats(seats);
  wait('Connecting…');
}

function wait(text: string): void {
  $('wait-text').textContent = text;
  if (connected) say(text);
  show('s-wait');
}

function renderSeats(s: SeatsMsg): void {
  if (s.title) $('title').textContent = s.title;
  const list = $('seat-list');
  list.replaceChildren(
    ...s.seats.map((x) => {
      const b = document.createElement('button');
      b.className = 'seat';
      b.disabled = x.taken || !!s.locked;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = x.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = x.name;
      b.append(dot, name);
      if (x.taken || s.locked) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = x.taken ? 'taken' : '🔒';
        b.append(tag);
      }
      b.addEventListener('click', () => {
        seatsNote = '';
        unlockAudio();
        send({ t: 'join', seatId: x.id, device });
      });
      return b;
    }),
  );
  if (!s.seats.length) list.innerHTML = '<p class="note">No players yet. Wait for the host to add them.</p>';
  $('new-btn').hidden = !s.allowNew || !!s.locked;
  $('host-away').hidden = s.hostHere;
  $('seats-status').textContent = s.locked ? '🔒 The host has locked the seats.' : (s.note ?? '');
  $('seats-note').textContent = seatsNote;
  say(['Tap your name.', seatsNote, s.locked ? 'The host has locked the seats.' : s.note ?? '', s.hostHere ? '' : "The host isn't connected right now."].filter(Boolean).join(' '));
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
  if (v.phase !== 'lobby' && v.clue) {
    clue.append(v.clue.text);
    if (v.clue.caption) {
      const c = document.createElement('small');
      c.textContent = v.clue.caption;
      clue.append(c);
    }
  }
  const left = Math.ceil((lockedUntil - serverNow()) / 1000);
  const mine = result && result.armId === v.armId ? result : null;
  let cls = '';
  let big = '';
  let small = '';
  if (v.phase === 'lobby') {
    big = you.name;
    small = v.status || 'Wait for the next clue';
  } else if (v.phase === 'answering' && v.answering?.you) {
    const how = mine?.rolled === 1 ? 'You won the roll' : mine?.byMs !== undefined ? `You were first by ${secs(mine.byMs)}` : 'Say your answer';
    [cls, big, small] = ['first', "You're answering!", how];
  } else if (v.phase === 'answering') {
    const who = v.answering ? `${v.answering.name} is answering` : 'Tie! The host decides';
    if (mine?.outcome === 'tie') [cls, big, small] = ['off', 'Tie!', 'The host decides who goes first'];
    else if (mine?.outcome === 'late' && mine.rank) {
      const how = mine.rolled ? `Tie — you rolled ${ordinal(mine.rolled)}` : mine.afterMs !== undefined && mine.behind ? `${secs(mine.afterMs)} behind ${mine.behind}` : who;
      [cls, big, small] = ['off', `You're ${ordinal(mine.rank)}`, how];
    } else [cls, big, small] = ['off', mine?.outcome === 'late' ? 'Too late' : 'Wait', who];
  } else if (v.phase === 'closed' && v.done) {
    const by = v.done.by;
    [cls, big, small] = ['off', by ? (by.you ? 'You got it!' : `${by.name} got it`) : 'Clue over', 'Wait for the next clue'];
  } else if (mine?.outcome === 'pending' && v.phase === 'armed') {
    [cls, big, small] = ['off', '…', 'Buzzed! Checking who was first'];
  } else if (you.lockedOut) {
    [cls, big, small] = ['off', 'Wait', 'You already answered this one'];
  } else if (left > 0) {
    [cls, big, small] = ['locked', 'Too early', `wait ${left}s`];
  } else if (v.phase === 'armed') {
    [cls, big, small] = ['armed', 'BUZZ!', you.name];
  } else {
    [cls, big, small] = ['ready', 'Get ready…', "Don't buzz yet"];
  }
  if (sendingArm === v.armId && !mine && v.phase !== 'lobby') small = 'Sending…';
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
  }
  cued = cue || cued;
  b.className = cls;
  $('buzz-big').textContent = big;
  $('buzz-small').textContent = small;
  b.setAttribute('aria-label', `${big} ${small}`);
  const sym = v.currency ?? '';
  $('me').textContent = `${you.name} · ${you.score < 0 ? '−' : ''}${sym}${Math.abs(you.score).toLocaleString()}`;
  const hostGone = v.hostHere === false;
  $('host-note').hidden = !hostGone;
  say([connected ? '' : 'Reconnecting…', `${big}. ${small}`, hostGone ? $('host-note').textContent : ''].filter(Boolean).join(' '));
  show('s-buzz');
  // Count the early lock down.
  clearTimeout(tick);
  if (left > 0) tick = window.setTimeout(render, 200);
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
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !$('s-buzz').hidden && !(e.target instanceof HTMLButtonElement && e.target !== $('buzz'))) {
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
  // Phones drop sockets in the background: come back at once. One that still looks open may be dead: check it.
  if (!ws) {
    attempts = 0;
    connect();
  } else probe();
});
$('leave').addEventListener('click', leaveSeat);
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
$('msg-btn').addEventListener('click', () => notice?.button?.run());

const fromPath = location.pathname.replace(/^\/+|\/+$/g, '').toUpperCase();
if (isRoomCode(fromPath)) void start(fromPath);
else {
  if (fromPath) history.replaceState(null, '', '/');
  render();
  $('code-in').focus();
}
