import { afterEach, describe, expect, it } from 'vitest';
import { BUZZ_PROTOCOL, OLD_FILE_LIMITS } from './buzzproto';
import { buzzerBase, closeRoom, rejoinRoom, remote, setRemoteDeps } from './remote.svelte';
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
    sockets[0].welcome({ features: ['cards', 'files'], limits });
    expect(remote.limits).toEqual(limits);
    expect(fileLimitsNow()).toEqual({ limits, known: true, off: false });
    closeRoom();
    expect(remote.limits).toBeNull();
    // (What the server said stays known.)
    expect(fileLimitsNow()).toEqual({ limits, known: true, off: false });
    rejoinRoom(room);
    sockets.at(-1)!.welcome({ features: ['cards', 'files'] });
    expect(remote.limits).toBeNull();
    expect(fileLimitsNow().limits).toEqual(OLD_FILE_LIMITS);
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
