import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUZZ_PROTOCOL, OLD_FILE_LIMITS, UPLOADS_BUSY } from './buzzproto';
import { buzzerBase, closeRoom, rejectPhone, rejoinRoom, remote, roomStillOpen, setRemoteDeps, UPLOAD_STALL_MS, uploadCardFile } from './remote.svelte';
import { prefs } from './prefs.svelte';
import { fileLimitsNow, forgetServerFiles } from './serverlimits.svelte';
import { retryDelay, type LinkDeps, type SocketLike } from './roomlink';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: { t: string }[] = [];
  closed = false;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  constructor(readonly url: string) {
    sockets.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // The room's side: it lets the host in (welcome), or the connection drops.
  welcome(more: object = {}) {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({ data: JSON.stringify({ t: 'welcome', code: 'BCDF', protocol: BUZZ_PROTOCOL, serverNow: 1, ...more }) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
  // A room that's gone (closed already) turns the host away.
  refuse() {
    this.readyState = 3;
    this.onclose?.({ code: 4004 });
  }
}
let sockets: FakeSocket[] = [];

/** Timers that run when the test says. */
function fakeDeps() {
  let now = 1000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let n = 0;
  const deps: LinkDeps = {
    WebSocket: FakeSocket,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    setTimeout: (fn, ms) => {
      timers.push({ at: now + ms, fn, id: ++n });
      return n;
    },
    clearTimeout: (id) => (timers = timers.filter((t) => t.id !== id)),
    now: () => now,
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = until;
  };
  return { deps, advance };
}

const room = { code: 'BCDF', hostToken: 'tok', base: 'https://buzz.test' };

afterEach(() => setRemoteDeps(undefined));

describe('closeRoom', () => {
  it('tells the phones at once when the room is in reach', () => {
    sockets = [];
    const t = fakeDeps();
    setRemoteDeps(t.deps);
    rejoinRoom(room);
    sockets[0].welcome();
    expect(remote.status).toBe('online');
    expect(closeRoom()).toBe(true);
    expect(sockets[0].sent.at(-1)).toEqual({ t: 'close' });
    expect(remote.status).toBe('off');
    // A link of its own makes sure it got there: the room, closed now, turns it away, and that's the end of it.
    expect(sockets.length).toBe(2);
    sockets[1].refuse();
    t.advance(120_000);
    expect(sockets.length).toBe(2);
    expect(sockets[1].sent).toEqual([]);
  });

  it('a close that went into a line that died without a word still closes the room once it answers', () => {
    sockets = [];
    const t = fakeDeps();
    setRemoteDeps(t.deps);
    rejoinRoom(room);
    sockets[0].welcome();
    // The Wi-Fi dropped a moment ago: the socket still takes what's sent (it goes nowhere), and no pong comes back.
    t.advance(25_000);
    expect(remote.status).toBe('online');
    expect(closeRoom()).toBe(false);
    expect(sockets[0].sent.at(-1)).toEqual({ t: 'close' });
    sockets[1].drop();
    t.advance(retryDelay(0));
    expect(sockets.length).toBe(3);
    sockets[2].welcome();
    expect(sockets[2].sent).toEqual([{ t: 'close' }]);
    expect(sockets[2].closed).toBe(true);
    t.advance(120_000);
    expect(sockets.length).toBe(3);
  });

  it('out of reach for a moment: says so, and closes the room once it gets back in', () => {
    sockets = [];
    const t = fakeDeps();
    setRemoteDeps(t.deps);
    rejoinRoom(room);
    sockets[0].welcome();
    sockets[0].drop();
    expect(remote.status).toBe('reconnecting');
    expect(closeRoom()).toBe(false);
    expect(remote.status).toBe('off');
    // A link of its own goes back into the same room (the game's own one stops trying)…
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toBe('wss://buzz.test/ws/BCDF?host=tok');
    sockets[1].drop();
    t.advance(retryDelay(0));
    sockets[2].drop();
    t.advance(retryDelay(1));
    expect(sockets.length).toBe(4);
    // …and once it's let in, the phones are told the game is over, and nothing tries again after.
    sockets[3].welcome();
    expect(sockets[3].sent).toEqual([{ t: 'close' }]);
    expect(sockets[3].closed).toBe(true);
    t.advance(120_000);
    expect(sockets.length).toBe(4);
    expect(remote.status).toBe('off');
  });
});

describe('phones asking to join', () => {
  it('a phone turned away that asks again is listed again', () => {
    sockets = [];
    setRemoteDeps(fakeDeps().deps);
    rejoinRoom(room);
    sockets[0].welcome();
    const list = (phones: object[]) => sockets[0].onmessage?.({ data: JSON.stringify({ t: 'phones', phones }) });
    const asking = (name: string) => ({ conn: 'c1', seatId: null, pendingName: name, connected: true });
    try {
      list([asking('Smaa')]);
      expect(rejectPhone('c1')).toBe(true);
      // (Hidden at once: a list the room sent before it took the ✕ still has the request.)
      list([asking('Smaa')]);
      expect(remote.answered).toEqual(['c1']);
      // The room took it: the phone is back on the seats…
      list([{ conn: 'c1', seatId: null, connected: true }]);
      expect(remote.answered).toEqual([]);
      // …and asks again, as “Sam”: the host sees it.
      list([asking('Sam')]);
      expect(remote.answered).toEqual([]);
    } finally {
      closeRoom();
    }
  });
});

describe('roomStillOpen', () => {
  it('asks for the room as a phone does: 404 is ended, no answer is not known', async () => {
    const asked: string[] = [];
    const answer = (status: number | null) =>
      setRemoteDeps({
        ...fakeDeps().deps,
        fetch: async (url) => {
          asked.push(url);
          if (status === null) throw new Error('offline');
          return { ok: status === 200, status, json: async () => ({}) };
        },
      });
    answer(200);
    expect(await roomStillOpen({ code: 'BCDF', base: 'https://buzz.test/' })).toBe(true);
    expect(asked).toEqual(['https://buzz.test/api/rooms/BCDF']);
    answer(404);
    expect(await roomStillOpen(room)).toBe(false);
    answer(429);
    expect(await roomStillOpen(room)).toBeNull();
    answer(null);
    expect(await roomStillOpen(room)).toBeNull();
  });
});

describe('the server’s card file limits', () => {
  it('a welcome with files says them, for this room and for the editor once it’s closed; one that doesn’t is an older server', () => {
    sockets = [];
    forgetServerFiles();
    const t = fakeDeps();
    setRemoteDeps(t.deps);
    const was = prefs.buzzerServer;
    prefs.buzzerServer = room.base;
    const limits = { fileBytes: 4 << 20, roomBytes: 12 << 20, roomFiles: 32 };
    rejoinRoom(room);
    sockets[0].welcome({ features: ['cards', 'files', 'gifs'], limits });
    expect(remote.limits).toEqual(limits);
    expect(fileLimitsNow()).toEqual({ limits, known: true, off: false, old: false, gifs: true });
    closeRoom();
    expect(remote.limits).toBeNull();
    // (What the server said stays known.)
    expect(fileLimitsNow()).toEqual({ limits, known: true, off: false, old: false, gifs: true });
    rejoinRoom(room);
    sockets.at(-1)!.welcome({ features: ['cards', 'files'] });
    expect(remote.limits).toBeNull();
    // (An older room: no "gifs" either.)
    expect(fileLimitsNow()).toMatchObject({ limits: OLD_FILE_LIMITS, old: true, gifs: false });
    closeRoom();
    expect(fileLimitsNow().limits).toEqual(OLD_FILE_LIMITS);
    prefs.buzzerServer = was;
    forgetServerFiles();
  });
});

describe('buzzerBase', () => {
  it('an address saved without https:// (before Settings added it) is used with it', () => {
    const was = prefs.buzzerServer;
    prefs.buzzerServer = 'buzz.example.workers.dev';
    expect(buzzerBase()).toBe('https://buzz.example.workers.dev');
    prefs.buzzerServer = was;
  });
});

/** An XMLHttpRequest the test answers: how much went up, the room's answer, or a dropped connection. */
class FakeXhr {
  static made: FakeXhr[] = [];
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  constructor() {
    FakeXhr.made.push(this);
  }
  open(method: string, url: string) {
    Object.assign(this, { method, url });
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  went(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  answer(status: number, body: unknown) {
    Object.assign(this, { status, responseText: JSON.stringify(body) });
    this.onload?.();
  }
}

describe('uploadCardFile', () => {
  const ID = 'c'.repeat(64);
  function inRoom() {
    sockets = [];
    FakeXhr.made = [];
    setRemoteDeps(fakeDeps().deps);
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    rejoinRoom(room);
    sockets[0].welcome({ features: ['cards', 'files'] });
  }
  afterEach(() => {
    closeRoom();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts the file with the host token in a header, says how much went up, and gives the room’s id', async () => {
    inRoom();
    const said: number[] = [];
    const blob = new Blob(['hello'], { type: 'image/png' });
    const up = uploadCardFile(blob, 'image/png', { onProgress: (p) => said.push(p) });
    const x = FakeXhr.made[0];
    expect([x.method, x.url, x.headers, x.body]).toEqual(['POST', 'https://buzz.test/api/rooms/BCDF/files', { Authorization: 'Bearer tok', 'Content-Type': 'image/png' }, blob]);
    x.went(2, 5);
    x.went(5, 5);
    x.answer(200, { id: ID });
    expect(await up).toEqual({ id: ID });
    expect(said).toEqual([0.4, 1]);
  });

  it('a refusal says why in the room’s words; a dropped connection, that it didn’t reach the server', async () => {
    inRoom();
    const full = uploadCardFile(new Blob(['x']), 'image/png');
    FakeXhr.made[0].answer(409, { error: 'This room holds all the card files it can' });
    expect(await full).toEqual({ refused: 'full', error: 'This room holds all the card files it can' });
    const big = uploadCardFile(new Blob(['x']), 'image/png');
    FakeXhr.made[1].answer(413, {});
    expect(await big).toEqual({ refused: 'big', error: 'The buzzer server said no (413)' });
    const lost = uploadCardFile(new Blob(['x']), 'image/png');
    FakeXhr.made[2].onerror?.();
    expect(await lost).toEqual({ refused: 'error', error: 'Couldn’t reach the buzzer server' });
    // (Over 100,000,000 bytes, Cloudflare turns it away first, and the page only sees the connection drop.)
    const huge = uploadCardFile({ size: 100_000_001 } as Blob, 'video/mp4');
    FakeXhr.made[3].onerror?.();
    expect(await huge).toEqual({ refused: 'error', error: 'Couldn’t reach the buzzer server (Cloudflare may turn files this big away before they reach it)' });
  });

  it('the room taking 2 files already is tried again (as a blip); the budget used up is not', async () => {
    inRoom();
    const taking = uploadCardFile(new Blob(['x']), 'image/png');
    FakeXhr.made[0].answer(429, { error: UPLOADS_BUSY });
    expect(await taking).toEqual({ refused: 'error', error: 'The buzzer room is taking another file: try again in a moment' });
    const budget = uploadCardFile(new Blob(['x']), 'image/png');
    FakeXhr.made[1].answer(429, { error: 'The buzzer server has taken all the card files it can for now — try again in about 5 hours' });
    expect(await budget).toMatchObject({ refused: 'busy' });
    const minute = uploadCardFile(new Blob(['x']), 'image/png');
    FakeXhr.made[2].answer(429, { error: 'Too many files — wait a minute' });
    expect(await minute).toMatchObject({ refused: 'busy' });
  });

  it('stops when told (✖ Take back), and when nothing has moved for a minute (then as a dropped connection)', async () => {
    inRoom();
    const stop = new AbortController();
    const up = uploadCardFile(new Blob(['x']), 'image/png', { signal: stop.signal });
    stop.abort();
    expect(await up).toEqual({ refused: 'error', error: 'Stopped', aborted: true });
    // (Already stopped: nothing goes.)
    expect(await uploadCardFile(new Blob(['x']), 'image/png', { signal: stop.signal })).toMatchObject({ aborted: true });
    expect(FakeXhr.made).toHaveLength(1);
    vi.useFakeTimers();
    const stuck = uploadCardFile(new Blob(['x']), 'image/png');
    const x = FakeXhr.made[1];
    let done = false;
    void stuck.then(() => (done = true));
    vi.advanceTimersByTime(UPLOAD_STALL_MS - 1000);
    // (Each bit that goes up puts it off.)
    x.went(1, 2);
    vi.advanceTimersByTime(UPLOAD_STALL_MS - 1000);
    await Promise.resolve();
    expect(done).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(await stuck).toEqual({ refused: 'error', error: 'Couldn’t reach the buzzer server' });
  });
});
