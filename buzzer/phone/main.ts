/**
 * The phone page: room code → tap your name → one big buzzer. Talks to the room over one WebSocket (see
 * src/lib/buzzproto.ts); keeps its seat token in localStorage so a reload or a dropped connection gets the seat back.
 *
 * Fair timing: the page notes when it shows BUZZ! for an arm and sends the time from then to the press (reactMs) with
 * the buzz; it answers every pong with a sync at once, so the room can time this phone's round trip itself.
 */
import { isRoomCode, type PhoneView, type RoomToPhone } from '../../src/lib/buzzproto';

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
}

let code = '';
let ws: WebSocket | null = null;
let connected = false;
let everConnected = false;
let attempts = 0;
let retryTimer = 0;
let pingTimer = 0;
let lastPong = 0;
/** Server time minus local time, from pongs. */
let offset = 0;

let seats: SeatsMsg | null = null;
let seatId: string | null = null;
let view: PhoneView | null = null;
/** Waiting for the answer to a join with a saved token: don't flash the seat list. */
let rejoining = false;
let pending = false;
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

// ---- saved seat (per room code) ----

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
    if (saved) send({ t: 'join', seatId: saved.seatId, token: saved.token });
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

/** The socket is gone: try again with backoff (unless the game is over). */
function dropped(s: WebSocket): void {
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
  render();
  if (notice?.final) return;
  const delay = Math.min(8000, 500 * 2 ** attempts) * (0.75 + Math.random() * 0.5);
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
    case 'seats':
      seats = m;
      // A seated phone only gets the list when it lost its seat (another tab took it back, or it was removed).
      if (!rejoining && seatId) {
        seatId = null;
        view = null;
      }
      break;
    case 'joined':
      seatId = m.seatId;
      saveSeat({ seatId: m.seatId, token: m.token });
      rejoining = pending = newForm = false;
      seatsNote = '';
      notice = null;
      break;
    case 'view':
      view = m.view;
      if (result && result.armId !== view.armId) result = null;
      break;
    case 'waiting':
      pending = true;
      newForm = false;
      break;
    case 'denied':
      denied(m.reason);
      break;
    case 'result':
      result = m;
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

function denied(reason: Extract<RoomToPhone, { t: 'denied' }>['reason']): void {
  const wasRejoin = rejoining;
  rejoining = false;
  if (reason === 'full') {
    notice = { title: 'This game is full', text: 'Too many phones are connected. Ask the host.', final: true };
    ws?.close();
    return;
  }
  if (wasRejoin || reason === 'bad-token') saveSeat(null);
  pending = false;
  seatsNote = {
    taken: wasRejoin ? 'Your seat was given to someone else. Tap your name again.' : 'Someone already has that seat.',
    'unknown-seat': "That player isn't in the game any more.",
    rejected: "The host didn't let you in.",
    'no-new': "The host isn't taking new players.",
    'bad-token': 'Your seat was given back. Tap your name again.',
  }[reason];
}

// ---- buzzing ----

const serverNow = () => Date.now() + offset;

/** at: when the press happened (an event's timeStamp, same clock as performance.now()). */
function buzz(at = performance.now()): void {
  if (!view || !connected || view.phase === 'lobby') return;
  const reactMs = litArm === view.armId && view.phase === 'armed' ? Math.max(0, Math.round(at - litAt)) : undefined;
  send({ t: 'buzz', armId: view.armId, ...(reactMs !== undefined ? { reactMs } : {}) });
  vibrate(30);
  const b = $('buzz');
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
}

function vibrate(p: number | number[]): void {
  try {
    navigator.vibrate?.(p);
  } catch {
    // not on this phone
  }
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

function render(): void {
  $('overlay').hidden = connected || !everConnected || !!notice?.final || !code;
  if (!code) return show('s-code');
  if (notice) {
    $('msg-title').textContent = notice.title;
    $('msg-text').textContent = notice.text;
    const btn = $('msg-btn');
    btn.hidden = !notice.button;
    btn.textContent = notice.button?.label ?? '';
    return show('s-msg');
  }
  if (seatId && view?.you) return renderBuzz(view);
  if (pending) {
    $('wait-text').textContent = 'Waiting for the host to let you in…';
    return show('s-wait');
  }
  if (newForm) return show('s-new');
  if (seats && !rejoining) return renderSeats(seats);
  $('wait-text').textContent = 'Connecting…';
  show('s-wait');
}

function renderSeats(s: SeatsMsg): void {
  if (s.title) $('title').textContent = s.title;
  const list = $('seat-list');
  list.replaceChildren(
    ...s.seats.map((x) => {
      const b = document.createElement('button');
      b.className = 'seat';
      b.disabled = x.taken;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = x.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = x.name;
      b.append(dot, name);
      if (x.taken) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'taken';
        b.append(tag);
      }
      b.addEventListener('click', () => {
        seatsNote = '';
        send({ t: 'join', seatId: x.id });
      });
      return b;
    }),
  );
  if (!s.seats.length) list.innerHTML = '<p class="note">No players yet. Wait for the host to add them.</p>';
  $('new-btn').hidden = !s.allowNew;
  $('host-away').hidden = s.hostHere;
  $('seats-note').textContent = seatsNote;
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
    small = 'Wait for the next clue';
  } else if (v.phase === 'answering' && v.answering?.you) {
    const how = mine?.rolled === 1 ? 'You won the roll' : mine?.byMs !== undefined ? `You were first by ${secs(mine.byMs)}` : 'Say your answer';
    [cls, big, small] = ['first', "You're answering!", how];
  } else if (v.phase === 'answering') {
    const who = v.answering ? `${v.answering.name} is answering` : 'Tie! The host is rolling for it';
    if (mine?.outcome === 'tie') [cls, big, small] = ['off', 'Tie!', 'The host is rolling for it'];
    else if (mine?.outcome === 'late' && mine.rank) {
      const how = mine.rolled ? `Tie — you rolled ${ordinal(mine.rolled)}` : mine.afterMs !== undefined && mine.behind ? `${secs(mine.afterMs)} behind ${mine.behind}` : who;
      [cls, big, small] = ['off', `You're ${ordinal(mine.rank)}`, how];
    } else [cls, big, small] = ['off', mine?.outcome === 'late' ? 'Too late' : 'Wait', who];
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
  // The moment BUZZ! first shows for this arm: reaction times count from here.
  if (cls === 'armed' && litArm !== v.armId) {
    litArm = v.armId;
    litAt = performance.now();
  }
  b.className = cls;
  $('buzz-big').textContent = big;
  $('buzz-small').textContent = small;
  b.setAttribute('aria-label', `${big} ${small}`);
  $('me').textContent = `${you.name} · ${you.score.toLocaleString()}`;
  const live = `${big}. ${small}`;
  if ($('live').textContent !== live) $('live').textContent = live;
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
  buzz(e.timeStamp);
});
$('buzz').addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !$('s-buzz').hidden) {
    e.preventDefault();
    buzz(e.timeStamp);
  }
});
document.addEventListener('pointerdown', () => void (wakeWanted || wake()), { capture: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (wakeWanted) void wake();
  // Phones drop sockets in the background: come back at once.
  if (code && !ws && !notice?.final) {
    attempts = 0;
    connect();
  }
});

$('code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = $<HTMLInputElement>('code-in').value.trim().toUpperCase();
  if (isRoomCode(c)) void start(c);
  else $('code-err').textContent = 'A room code is 4 letters, like on the stream.';
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
  if (name) send({ t: 'new', name });
});
$('msg-btn').addEventListener('click', () => notice?.button?.run());

const fromPath = location.pathname.replace(/^\/+|\/+$/g, '').toUpperCase();
if (isRoomCode(fromPath)) void start(fromPath);
else {
  if (fromPath) history.replaceState(null, '', '/');
  render();
  $('code-in').focus();
}
