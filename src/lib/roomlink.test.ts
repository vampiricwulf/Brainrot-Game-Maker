import { describe, expect, it } from 'vitest';
import { BUZZ_PROTOCOL, type HostState } from './buzzproto';
import { closedText, parseNewRoom, parseRoomMsg, retryDelay, RoomLink, PING_MS, SILENT_MS, STATE_MS, type LinkDeps, type SocketLike } from './roomlink';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
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
  // The room's side.
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  say(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(code = 1006, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}
let sockets: FakeSocket[] = [];

/** Timers that run when the test says. */
function fakeDeps(fetchReply: unknown = { code: 'BCDF', hostToken: 'tok' }, ok = true) {
  let now = 1000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let n = 0;
  const posts: string[] = [];
  const deps: LinkDeps = {
    WebSocket: FakeSocket,
    fetch: async (url) => {
      posts.push(url);
      return { ok, status: ok ? 200 : 500, json: async () => fetchReply };
    },
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
  return { deps, advance, posts, pending: () => timers.length };
}

const state = (over: Partial<HostState> = {}): HostState => ({
  title: 'T',
  seats: [{ id: 'a', name: 'Ann', color: '#ff0000' }],
  allowNew: false,
  phase: 'lobby',
  armId: 0,
  clue: null,
  answering: null,
  lockedOut: [],
  earlyLockMs: 1000,
  scores: { a: 0 },
  ...over,
});
const welcome = { t: 'welcome', code: 'BCDF', protocol: BUZZ_PROTOCOL, serverNow: 1 };

describe('parseRoomMsg', () => {
  it('takes the messages the protocol has', () => {
    expect(parseRoomMsg(JSON.stringify(welcome))).toEqual(welcome);
    expect(parseRoomMsg('{"t":"buzz","armId":3,"seatId":"a","rank":1,"afterMs":120}')).toEqual({ t: 'buzz', armId: 3, seatId: 'a', rank: 1, afterMs: 120 });
    expect(parseRoomMsg('{"t":"phones","phones":[{"conn":"c1","seatId":null,"pendingName":"Zed","connected":true},{"conn":"c2","seatId":"a","connected":false}]}')).toEqual({
      t: 'phones',
      phones: [
        { conn: 'c1', seatId: null, pendingName: 'Zed', connected: true },
        { conn: 'c2', seatId: 'a', connected: false },
      ],
    });
    expect(parseRoomMsg('{"t":"pong","at":1,"serverNow":2}')).toEqual({ t: 'pong', at: 1, serverNow: 2 });
    expect(parseRoomMsg('{"t":"error","message":"nope"}')).toEqual({ t: 'error', message: 'nope' });
    expect(parseRoomMsg('{"t":"queue","armId":2,"queue":[{"seatId":"a","afterMs":0,"rolled":1},{"seatId":"b","afterMs":0,"rolled":2}],"tie":["a","b"]}')).toEqual({
      t: 'queue',
      armId: 2,
      queue: [
        { seatId: 'a', afterMs: 0, rolled: 1 },
        { seatId: 'b', afterMs: 0, rolled: 2 },
      ],
      tie: ['a', 'b'],
    });
  });

  it("takes a phone's wager (added later), checked: a whole number, 0 or more, and its count", () => {
    expect(parseRoomMsg('{"t":"wager","id":"final:r1","seatId":"a","amount":500,"n":1}')).toEqual({ t: 'wager', id: 'final:r1', seatId: 'a', amount: 500, n: 1 });
    expect(parseRoomMsg('{"t":"wager","id":"final:r1","seatId":"a","amount":0,"n":2,"by":"Al"}')).toEqual({ t: 'wager', id: 'final:r1', seatId: 'a', amount: 0, n: 2, by: 'Al' });
    for (const bad of ['{"amount":-1,"n":1}', '{"amount":1.5,"n":1}', '{"amount":"5","n":1}', '{"amount":5,"n":0}', '{"amount":5}'])
      expect(parseRoomMsg(JSON.stringify({ t: 'wager', id: 'x', seatId: 'a', ...JSON.parse(bad) }))).toBeNull();
    expect(parseRoomMsg('{"t":"wager","id":"","seatId":"a","amount":5,"n":1}')).toBeNull();
  });

  it('takes the teams fields (added later): what the room can do, who on a team buzzed, who is on which phone', () => {
    expect(parseRoomMsg(JSON.stringify({ ...welcome, features: ['teams', 7, 'x'.repeat(50)] }))).toEqual({ ...welcome, features: ['teams'] });
    expect(parseRoomMsg('{"t":"buzz","armId":3,"seatId":"a","rank":1,"afterMs":0,"by":"Ann"}')).toMatchObject({ seatId: 'a', by: 'Ann' });
    expect(parseRoomMsg('{"t":"buzz","armId":3,"seatId":"a","rank":1,"afterMs":0,"by":5}')).not.toHaveProperty('by');
    expect(parseRoomMsg('{"t":"queue","armId":2,"queue":[{"seatId":"a","afterMs":0,"by":"Ann"},{"seatId":"b","afterMs":9}]}')).toEqual({
      t: 'queue',
      armId: 2,
      queue: [
        { seatId: 'a', afterMs: 0, by: 'Ann' },
        { seatId: 'b', afterMs: 9 },
      ],
    });
    expect(parseRoomMsg('{"t":"phones","phones":[{"conn":"c1","seatId":"a","connected":true,"member":"m1","name":"Ann"},{"conn":"c2","seatId":"a","connected":true,"member":"m2"}]}')).toEqual({
      t: 'phones',
      phones: [
        { conn: 'c1', seatId: 'a', connected: true, member: 'm1', name: 'Ann' },
        { conn: 'c2', seatId: 'a', connected: true },
      ],
    });
  });

  it('drops anything else, and strips unknown fields', () => {
    for (const bad of [
      'not json',
      '[]',
      'null',
      '{"t":"state"}',
      '{"t":"welcome","code":"AEIO","protocol":1,"serverNow":1}',
      '{"t":"buzz","armId":"3","seatId":"a","rank":1,"afterMs":0}',
      '{"t":"buzz","armId":3,"seatId":"a","rank":0,"afterMs":0}',
      '{"t":"phones","phones":[{"conn":"c1","seatId":5,"connected":true}]}',
      '{"t":"phones","phones":"x"}',
      '{"t":"error"}',
      '{"t":"queue","armId":2,"queue":[{"seatId":"a"}]}',
      '{"t":"queue","armId":2,"queue":[],"tie":"a"}',
      '{"t":"queue","armId":2,"queue":[{"seatId":"a","afterMs":0,"rolled":0}]}',
    ])
      expect(parseRoomMsg(bad), bad).toBeNull();
    expect(parseRoomMsg({ t: 'pong', at: 1, serverNow: 2 })).toBeNull();
    expect(parseRoomMsg('{"t":"buzz","armId":3,"seatId":"a","rank":1,"afterMs":0,"evil":"<script>"}')).toEqual({ t: 'buzz', armId: 3, seatId: 'a', rank: 1, afterMs: 0 });
    expect(parseNewRoom({ code: 'BCDF', hostToken: 'x' })).toEqual({ code: 'BCDF', hostToken: 'x' });
    expect(parseNewRoom({ code: 'bcdf', hostToken: 'x' })).toBeNull();
    expect(parseNewRoom({ code: 'BCDF', hostToken: '' })).toBeNull();
  });
});

describe('RoomLink', () => {
  it('makes a room, connects as the host and goes online on welcome, then sends the state', async () => {
    sockets = [];
    const t = fakeDeps();
    const changes: string[] = [];
    const link = new RoomLink('https://buzz.test', { onChange: () => changes.push(link.status) }, t.deps);
    const room = await link.create();
    expect(room).toEqual({ code: 'BCDF', hostToken: 'tok' });
    expect(t.posts).toEqual(['https://buzz.test/api/rooms']);
    expect(sockets[0].url).toBe('wss://buzz.test/ws/BCDF?host=tok');
    expect(link.status).toBe('connecting');
    link.setState(state());
    sockets[0].open();
    t.advance(STATE_MS);
    expect(sockets[0].sent).toEqual([]);
    sockets[0].say(welcome);
    expect(link.status).toBe('online');
    expect(sockets[0].sent).toEqual([{ t: 'state', state: state() }]);
    expect(changes).toContain('online');
  });

  it('debounces state sends, sends arming at once, and skips unchanged states', async () => {
    sockets = [];
    const t = fakeDeps();
    const link = new RoomLink('https://buzz.test', {}, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    const ws = sockets[0];
    ws.sent = [];
    link.setState(state({ title: 'A' }));
    link.setState(state({ title: 'B' }));
    expect(ws.sent).toEqual([]);
    t.advance(STATE_MS);
    expect(ws.sent).toEqual([{ t: 'state', state: state({ title: 'B' }) }]);
    link.setState(state({ title: 'B' }));
    t.advance(STATE_MS);
    expect(ws.sent.length).toBe(1);
    link.setState(state({ title: 'B', phase: 'armed', armId: 1 }), true);
    expect(ws.sent.length).toBe(2);
    link.resend();
    expect(ws.sent.length).toBe(3);
  });

  it('passes buzzes and the phones list on', async () => {
    sockets = [];
    const t = fakeDeps();
    const buzzes: unknown[] = [];
    const link = new RoomLink('https://buzz.test', { onBuzz: (b) => buzzes.push(b) }, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    sockets[0].say({ t: 'buzz', armId: 1, seatId: 'a', rank: 1, afterMs: 50 });
    sockets[0].say({ t: 'buzz', armId: 1, seatId: 'a', rank: 'x' });
    sockets[0].say({ t: 'phones', phones: [{ conn: 'c', seatId: 'a', connected: true }] });
    expect(buzzes).toEqual([{ t: 'buzz', armId: 1, seatId: 'a', rank: 1, afterMs: 50 }]);
    expect(link.phones).toEqual([{ conn: 'c', seatId: 'a', connected: true }]);
    expect(link.send({ t: 'kick', seatId: 'a' })).toBe(true);
    expect(sockets[0].sent.at(-1)).toEqual({ t: 'kick', seatId: 'a' });
  });

  it('reconnects with the same code and token after a drop, backing off, and sends the state again', async () => {
    sockets = [];
    const t = fakeDeps();
    const link = new RoomLink('https://buzz.test', {}, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    link.setState(state(), true);
    sockets[0].drop();
    expect(link.status).toBe('reconnecting');
    expect(link.send({ t: 'kick', seatId: 'a' })).toBe(false);
    t.advance(retryDelay(0) - 1);
    expect(sockets.length).toBe(1);
    t.advance(1);
    expect(sockets.length).toBe(2);
    expect(sockets[1].url).toBe('wss://buzz.test/ws/BCDF?host=tok');
    // That one fails too: the next wait is longer.
    sockets[1].drop();
    t.advance(retryDelay(1) - 1);
    expect(sockets.length).toBe(2);
    t.advance(1);
    expect(sockets.length).toBe(3);
    sockets[2].open();
    sockets[2].say(welcome);
    expect(link.status).toBe('online');
    expect(link.attempts).toBe(0);
    expect(sockets[2].sent).toEqual([{ t: 'state', state: state() }]);
    expect(retryDelay(20)).toBe(15_000);
  });

  it('pings every 15 s, and starts again when the room goes quiet', async () => {
    sockets = [];
    const t = fakeDeps();
    const link = new RoomLink('https://buzz.test', {}, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    t.advance(PING_MS);
    expect(sockets[0].sent.at(-1)).toMatchObject({ t: 'ping' });
    sockets[0].say({ t: 'pong', at: 1, serverNow: 2 });
    t.advance(SILENT_MS + PING_MS);
    expect(link.status).toBe('reconnecting');
    expect(sockets[0].closed).toBe(true);
    t.advance(retryDelay(0));
    expect(sockets.length).toBe(2);
  });

  it('a room that turns the host away (4xxx) is an error, not a retry', async () => {
    sockets = [];
    const t = fakeDeps();
    const link = new RoomLink('https://buzz.test', {}, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    sockets[0].say({ t: 'phones', phones: [{ conn: 'c1', seatId: 'a', connected: true }] });
    expect(link.phones.length).toBe(1);
    sockets[0].drop(4404, 'No such room');
    expect(link.status).toBe('error');
    expect(link.error).toBe('No such room');
    // Which code (the app forgets a room kept open that ended, not one another window took), and no stale phones.
    expect(link.closedCode).toBe(4404);
    expect(link.phones).toEqual([]);
    t.advance(60_000);
    expect(sockets.length).toBe(1);
    link.connect({ code: 'BCDF', hostToken: 'tok' });
    expect(link.closedCode).toBe(0);
  });

  it('says why the room turned the host away in plain words, not the server\'s', async () => {
    expect(closedText(4004, 'no such room')).toMatch(/^This buzzer room has ended/);
    expect(closedText(4000, 'replaced')).toMatch(/open in another window/);
    expect(closedText(4003, 'wrong host token')).toMatch(/start a new one$/);
    expect(closedText(4999, 'weird')).toBe('The buzzer room is closed: start a new one');
    sockets = [];
    const t = fakeDeps();
    const link = new RoomLink('https://buzz.test', {}, t.deps);
    await link.create();
    sockets[0].drop(4004, 'no such room');
    expect(link.error).toMatch(/^This buzzer room has ended/);
  });

  it('passes "room full" on; end() closes a room it was never in', async () => {
    expect(parseRoomMsg(JSON.stringify({ t: 'full', extra: 1 }))).toEqual({ t: 'full' });
    sockets = [];
    const t = fakeDeps();
    let full = 0;
    const link = new RoomLink('https://buzz.test', { onFull: () => full++ }, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    sockets[0].say({ t: 'full' });
    expect(full).toBe(1);
    const old = new RoomLink('https://buzz.test', {}, t.deps);
    old.end({ code: 'GHJK', hostToken: 'old' });
    sockets[1].open();
    sockets[1].say({ ...welcome, code: 'GHJK' });
    expect(sockets[1].sent).toEqual([{ t: 'close' }]);
    expect(old.status).toBe('off');
  });

  it('close() tells the room and stops; nothing reconnects after', async () => {
    sockets = [];
    const t = fakeDeps();
    const link = new RoomLink('https://buzz.test', {}, t.deps);
    await link.create();
    sockets[0].open();
    sockets[0].say(welcome);
    link.close();
    expect(sockets[0].sent.at(-1)).toEqual({ t: 'close' });
    expect(sockets[0].closed).toBe(true);
    expect(link.status).toBe('off');
    t.advance(60_000);
    expect(sockets.length).toBe(1);
    expect(t.pending()).toBe(0);
  });

  it('a server that can’t make a room is an error; another protocol version too', async () => {
    sockets = [];
    const bad = fakeDeps({ nope: 1 }, false);
    const link = new RoomLink('https://buzz.test', {}, bad.deps);
    await expect(link.create()).rejects.toThrow();
    expect(link.status).toBe('error');
    expect(link.error).toMatch(/said no/);
    // A limit the server explains: its words, as they are.
    const busy = new RoomLink('https://buzz.test', {}, fakeDeps({ error: 'Too many new rooms — wait a minute' }, false).deps);
    await expect(busy.create()).rejects.toThrow();
    expect(busy.error).toBe('Too many new rooms — wait a minute');
    const t = fakeDeps();
    const l2 = new RoomLink('https://buzz.test', {}, t.deps);
    await l2.create();
    sockets.at(-1)!.open();
    sockets.at(-1)!.say({ ...welcome, protocol: BUZZ_PROTOCOL + 1 });
    expect(l2.status).toBe('error');
    expect(l2.error).toMatch(/version/);
  });
});
