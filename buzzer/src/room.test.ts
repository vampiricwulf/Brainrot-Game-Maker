import { describe, expect, it } from 'vitest';
import type { HostState, RoomToHost, RoomToPhone } from '../../src/lib/buzzproto';
import { cleanState, GRACE_MS, MAX_PHONES, median, MIN_REACT_MS, rankKey, Room, type PhoneSaved, type RoomSaved } from './room';

const seats = [
  { id: 'a', name: 'Ann', color: '#ff0000' },
  { id: 'b', name: 'Bob', color: '#00ff00' },
  { id: 'c', name: 'Cat', color: '#0000ff' },
];

function state(over: Partial<HostState> = {}): HostState {
  return { title: 'Quiz night', seats, allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 1000, scores: { a: 100 }, ...over };
}

/** A room with a clock and timers the test runs (tick), counting tokens and inboxes for the host and each phone. */
function setup(saved?: RoomSaved, phonesSaved: PhoneSaved[] = []) {
  const t = { now: 10_000 };
  let n = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let timerId = 0;
  /** Moves the clock on, running timers as they come due. */
  const tick = (ms: number) => {
    const until = t.now + ms;
    for (;;) {
      const due = timers.filter((x) => x.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((x) => x !== due);
      t.now = Math.max(t.now, due.at);
      due.fn();
    }
    t.now = until;
  };
  const host: RoomToHost[] = [];
  const inbox = new Map<string, RoomToPhone[]>();
  const phoneSaves = new Map<string, PhoneSaved>();
  let saves = 0;
  const room = new Room(
    'BCDF',
    {
      now: () => t.now,
      token: () => `token-${++n}`,
      toHost: (m) => host.push(m),
      toPhone: (c, m) => (inbox.get(c) ?? inbox.set(c, []).get(c)!).push(m),
      saveRoom: () => saves++,
      savePhone: (p) => phoneSaves.set(p.conn, p),
      schedule: (ms, fn) => {
        timers.push({ at: t.now + ms, fn, id: ++timerId });
        return timerId;
      },
      cancel: (id) => (timers = timers.filter((x) => x.id !== id)),
    },
    saved,
    phonesSaved,
  );
  const send = (m: unknown) => room.hostMessage(JSON.stringify(m));
  const phone = (conn: string) => {
    room.phoneOpen(conn);
    return phoneOf(conn);
  };
  const phoneOf = (conn: string) => ({
    conn,
    send: (m: unknown) => room.phoneMessage(conn, JSON.stringify(m)),
    msgs: () => inbox.get(conn) ?? [],
    last: <T extends RoomToPhone['t']>(type: T) => (inbox.get(conn) ?? []).filter((m) => m.t === type).at(-1) as Extract<RoomToPhone, { t: T }> | undefined,
    clear: () => inbox.set(conn, []),
  });
  const hostLast = <T extends RoomToHost['t']>(type: T) => host.filter((m) => m.t === type).at(-1) as Extract<RoomToHost, { t: T }> | undefined;
  const hostAll = <T extends RoomToHost['t']>(type: T) => host.filter((m) => m.t === type) as Extract<RoomToHost, { t: T }>[];
  return { t, tick, timers: () => timers.length, room, host, hostLast, hostAll, send, phone, phoneOf, phoneSaves, saves: () => saves };
}

/** Host connected and sent a state; phones a, b, c seated on seats a, b, c. */
function game(over: Partial<HostState> = {}) {
  const g = setup();
  g.room.hostOpen();
  g.send({ t: 'state', state: state(over) });
  const [pa, pb, pc] = ['pa', 'pb', 'pc'].map((c, i) => {
    const p = g.phone(c);
    p.send({ t: 'join', seatId: seats[i].id });
    return p;
  });
  const arm = (armId: number, extra: Partial<HostState> = {}) => g.send({ t: 'state', state: state({ phase: 'armed', armId, clue: { text: 'Q?' }, ...over, ...extra }) });
  return { ...g, pa, pb, pc, arm };
}

describe('host', () => {
  it('is welcomed and keeps the latest state', () => {
    const g = setup();
    g.room.hostOpen();
    expect(g.host[0]).toEqual({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: 10_000 });
    g.send({ t: 'state', state: state({ title: 'New' }) });
    expect(g.room.saved.state?.title).toBe('New');
    g.send({ t: 'ping', at: 5 });
    expect(g.hostLast('pong')).toEqual({ t: 'pong', at: 5, serverNow: 10_000 });
  });

  it('close tells phones and asks the caller to close', () => {
    const g = game();
    expect(g.send({ t: 'close' })).toBe('close');
    expect(g.pa.last('closed')).toEqual({ t: 'closed' });
  });
});

describe('seats', () => {
  it('phones see the seats; claiming a free one gives a token and a view', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    const p = g.phone('p1');
    expect(p.last('seats')?.seats.map((s) => s.taken)).toEqual([false, false, false]);
    expect(p.last('seats')?.hostHere).toBe(true);
    p.send({ t: 'join', seatId: 'a' });
    expect(p.last('joined')).toEqual({ t: 'joined', seatId: 'a', token: 'token-1' });
    expect(p.last('view')?.view.you).toMatchObject({ id: 'a', name: 'Ann', score: 100 });
    const q = g.phone('p2');
    expect(q.last('seats')?.seats.map((s) => s.taken)).toEqual([true, false, false]);
    expect(g.hostLast('phones')?.phones).toEqual([
      { conn: 'p1', seatId: 'a', connected: true },
      { conn: 'p2', seatId: null, connected: true },
    ]);
  });

  it('a taken seat is denied without its token, and unknown seats are denied', () => {
    const g = game();
    const p = g.phone('p4');
    p.send({ t: 'join', seatId: 'a' });
    expect(p.last('denied')?.reason).toBe('taken');
    p.send({ t: 'join', seatId: 'a', token: 'wrong' });
    expect(p.last('denied')?.reason).toBe('taken');
    p.send({ t: 'join', seatId: 'zz' });
    expect(p.last('denied')?.reason).toBe('unknown-seat');
  });

  it('the token takes the seat back after a reload; the old socket is detached', () => {
    const g = game();
    const token = g.pa.last('joined')!.token;
    g.pa.clear();
    const p = g.phone('pa2');
    p.send({ t: 'join', seatId: 'a', token });
    expect(p.last('joined')).toEqual({ t: 'joined', seatId: 'a', token });
    expect(p.last('view')?.view.you?.id).toBe('a');
    expect(g.pa.last('seats')).toBeTruthy(); // back to the seat list
    expect(g.pa.last('kicked')).toBeUndefined();
    expect(g.phoneSaves.get('pa')?.seatId).toBeNull();
  });

  it('a seat stays taken while its phone is away, shown to the host as not connected', () => {
    const g = game();
    g.room.phoneClose('pa');
    expect(g.room.saved.tokens.a).toBeTruthy();
    expect(g.hostLast('phones')?.phones).toContainEqual({ conn: 'pa', seatId: 'a', connected: false });
    const p = g.phone('x');
    expect(p.last('seats')?.seats[0].taken).toBe(true);
  });

  it('kick tells the phone, revokes the token and frees the seat', () => {
    const g = game();
    const token = g.pa.last('joined')!.token;
    g.send({ t: 'kick', seatId: 'a' });
    expect(g.pa.last('kicked')).toEqual({ t: 'kicked' });
    expect(g.pa.last('seats')?.seats[0].taken).toBe(false);
    expect(g.room.saved.tokens.a).toBeUndefined();
    const p = g.phone('pa2');
    p.send({ t: 'join', seatId: 'a', token });
    expect(p.last('denied')?.reason).toBe('bad-token');
    p.send({ t: 'join', seatId: 'a' });
    expect(p.last('joined')?.token).not.toBe(token);
  });

  it('leave frees the seat', () => {
    const g = game();
    g.pa.send({ t: 'leave' });
    expect(g.room.saved.tokens.a).toBeUndefined();
    expect(g.pa.last('seats')?.seats[0].taken).toBe(false);
  });

  it('seats removed from the game free their phones', () => {
    const g = game();
    g.pb.clear();
    g.send({ t: 'state', state: state({ seats: [seats[0], seats[2]] }) });
    expect(g.room.saved.tokens.b).toBeUndefined();
    expect(g.pb.last('seats')?.seats.map((s) => s.id)).toEqual(['a', 'c']);
    expect(g.pb.last('view')).toBeUndefined();
    expect(g.phoneSaves.get('pb')?.seatId).toBeNull();
  });

  it('new players wait for the host, who accepts or rejects them', () => {
    const g = game();
    const p = g.phone('n1');
    p.send({ t: 'new', name: 'Dee' });
    expect(p.last('denied')?.reason).toBe('no-new');
    g.send({ t: 'state', state: state({ allowNew: true }) });
    expect(p.last('seats')?.allowNew).toBe(true);
    p.send({ t: 'new', name: '   A very long name that goes on and on   ' });
    expect(p.last('waiting')).toEqual({ t: 'waiting' });
    const info = g.hostLast('phones')?.phones.find((x) => x.conn === 'n1');
    expect(info?.pendingName).toBe('A very long name that go');
    expect(info?.pendingName?.length).toBeLessThanOrEqual(24);
    // Accept: the host adds the seat to its state first.
    const d = { id: 'd', name: 'A very long', color: '#123456' };
    g.send({ t: 'state', state: state({ allowNew: true, seats: [...seats, d] }) });
    g.send({ t: 'accept', conn: 'n1', seatId: 'd' });
    expect(p.last('joined')?.seatId).toBe('d');
    expect(p.last('view')?.view.you?.id).toBe('d');
    // Reject.
    const q = g.phone('n2');
    q.send({ t: 'new', name: 'Eve' });
    g.send({ t: 'reject', conn: 'n2' });
    expect(q.last('denied')?.reason).toBe('rejected');
    expect(g.hostLast('phones')?.phones.find((x) => x.conn === 'n2')?.pendingName).toBeUndefined();
    // Turning allowNew off turns away those still waiting.
    const r = g.phone('n3');
    r.send({ t: 'new', name: 'Fay' });
    g.send({ t: 'state', state: state({ allowNew: false, seats: [...seats, d] }) });
    expect(r.last('denied')?.reason).toBe('no-new');
  });

  it('accepting onto a taken seat is denied', () => {
    const g = game({ allowNew: true });
    const p = g.phone('n1');
    p.send({ t: 'new', name: 'Dee' });
    g.send({ t: 'accept', conn: 'n1', seatId: 'a' });
    expect(p.last('denied')?.reason).toBe('taken');
  });

  it('caps the room at 24 phones', () => {
    const g = setup();
    for (let i = 0; i < MAX_PHONES; i++) expect(g.room.phoneOpen('p' + i)).toBe(true);
    expect(g.room.phoneOpen('one-too-many')).toBe(false);
    g.room.phoneClose('p0');
    expect(g.room.phoneOpen('now-fits')).toBe(true);
  });
});

/** The phone pings, then echoes the pong rttMs later: the room times a round trip. */
function timeRtt(g: ReturnType<typeof setup>, p: ReturnType<ReturnType<typeof setup>['phoneOf']>, rttMs: number) {
  p.send({ t: 'ping', at: 1 });
  const serverNow = p.last('pong')!.serverNow;
  g.t.now += rttMs;
  p.send({ t: 'sync', serverNow });
}

describe('the race', () => {
  it('the first buzz wins once the grace window ends: the room moves to answering and tells everyone', () => {
    const g = game();
    g.arm(1);
    g.t.now += 300;
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'pending' });
    expect(g.hostLast('buzz')).toBeUndefined();
    expect(g.room.saved.state?.phase).toBe('armed');
    g.tick(GRACE_MS);
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0 });
    expect(g.hostLast('buzz')).toEqual({ t: 'buzz', armId: 1, seatId: 'b', rank: 1, afterMs: 0 });
    expect(g.hostLast('queue')).toEqual({ t: 'queue', armId: 1, queue: [{ seatId: 'b', afterMs: 0 }] });
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'b' });
    expect(g.pa.last('view')?.view.answering).toEqual({ name: 'Bob', color: '#00ff00', you: false });
    expect(g.pb.last('view')?.view.answering?.you).toBe(true);
  });

  it('a phone on a slower network that reacted faster wins', () => {
    const g = game();
    timeRtt(g, g.pa, 40);
    timeRtt(g, g.pb, 400);
    expect(g.room.rtt('pa')).toBe(40);
    expect(g.room.rtt('pb')).toBe(400);
    g.arm(1);
    // Ann's light came on at once and she pressed after 260 ms: here at 300. Bob's came on 200 ms late (slow network),
    // he pressed after 200 ms, and his buzz took another 200 ms: here at 450, after Ann's.
    g.t.now += 300;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 260 });
    g.t.now += 150;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.tick(GRACE_MS);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'b' });
    expect(g.hostAll('buzz')).toEqual([
      { t: 'buzz', armId: 1, seatId: 'b', rank: 1, afterMs: 0 },
      { t: 'buzz', armId: 1, seatId: 'a', rank: 2, afterMs: 60 },
    ]);
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0, byMs: 60 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 60, behind: 'Bob' });
  });

  it('rankKey: plausible reactMs counts; impossible or missing falls back to arrival minus the round trip', () => {
    expect(rankKey(300, 250, 100)).toBe(250);
    expect(rankKey(300, 250, null)).toBe(250); // unknown round trip: 300 ms + tolerance assumed
    expect(rankKey(300, 10, 40)).toBe(260); // 290 ms "on the network" with a 40 ms round trip: no
    expect(rankKey(300, 400, 40)).toBe(260); // reacted before the buzzers opened
    expect(rankKey(300, -5, 40)).toBe(260);
    expect(rankKey(300, Number.NaN, 40)).toBe(260);
    expect(rankKey(300, undefined, 40)).toBe(260);
    expect(rankKey(300, undefined, null)).toBe(300);
    expect(rankKey(20, undefined, null)).toBe(MIN_REACT_MS);
    expect(rankKey(500, 3, 300)).toBe(200); // 497 ms on a 300 ms round trip? no: fallback
    expect(rankKey(200, 3, 300)).toBe(MIN_REACT_MS); // plausible, but nobody reacts in 3 ms
  });

  it('a forged reactMs gains at most about a round trip', () => {
    const g = game();
    timeRtt(g, g.pa, 40);
    timeRtt(g, g.pb, 40);
    g.arm(1);
    g.t.now += 250;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 200 }); // honest
    g.t.now += 50;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 0 }); // "I pressed the moment the light came on"
    g.tick(GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('b');
    expect(g.hostLast('queue')?.queue).toEqual([
      { seatId: 'b', afterMs: 0 },
      { seatId: 'a', afterMs: 60 },
    ]);
  });

  it('phones without reactMs (old pages) are ranked by arrival', () => {
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pc.send({ t: 'buzz', armId: 1 });
    g.t.now += 40;
    g.pa.send({ t: 'buzz', armId: 1 });
    g.t.now += 25;
    g.pb.send({ t: 'buzz', armId: 1 });
    g.tick(GRACE_MS);
    expect(g.hostAll('buzz').map((m) => [m.seatId, m.rank, m.afterMs])).toEqual([
      ['c', 1, 0],
      ['a', 2, 40],
      ['b', 3, 65],
    ]);
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 40, behind: 'Cat' });
    expect(g.pc.last('result')?.byMs).toBe(40);
  });

  it('every buzz counts: later ones join the queue by reaction, never ahead of the one answering', () => {
    const dee = { id: 'd', name: 'Dee', color: '#123456' };
    const g = game({ seats: [...seats, dee] });
    const pd = g.phone('pd');
    pd.send({ t: 'join', seatId: 'd' });
    timeRtt(g, pd, 1000); // a very slow network
    g.arm(1);
    g.t.now += 200;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 150 });
    g.tick(GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('a');
    g.t.now += 300;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 600 });
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 450, behind: 'Ann' });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0, byMs: 450 });
    // Cat's buzz came very late with no reaction time (fallback: 950 − 0): behind Bob.
    g.t.now += 200;
    g.pc.send({ t: 'buzz', armId: 1 });
    expect(g.hostLast('queue')?.queue.map((q) => q.seatId)).toEqual(['a', 'b', 'c']);
    // Dee reacted faster than Ann, but the window is long over: second, never first.
    g.t.now += 100;
    pd.send({ t: 'buzz', armId: 1, reactMs: 100 });
    expect(g.hostLast('queue')?.queue.map((q) => q.seatId)).toEqual(['a', 'd', 'b', 'c']);
    expect(g.hostLast('queue')?.queue[1].afterMs).toBe(0);
    expect(pd.last('result')).toMatchObject({ outcome: 'late', rank: 2 });
    expect(g.pb.last('result')).toMatchObject({ outcome: 'late', rank: 3 });
    expect(g.pc.last('result')).toMatchObject({ outcome: 'late', rank: 4 });
    expect(g.hostLast('buzz')).toMatchObject({ seatId: 'd', rank: 2 });
    expect(g.room.saved.state?.answering).toBe('a');
  });

  it('buzzes within TIE_MS tie: nobody answers until the host picks (by hand: the rest of the tie keep arrival order)', () => {
    const g = game();
    g.arm(1);
    g.t.now += 300;
    g.pc.send({ t: 'buzz', armId: 1, reactMs: 205 });
    g.t.now += 10;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.t.now += 10;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 280 });
    g.tick(GRACE_MS);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: null });
    expect(g.hostLast('queue')).toEqual({
      t: 'queue',
      armId: 1,
      queue: [
        { seatId: 'b', afterMs: 0 },
        { seatId: 'c', afterMs: 5 },
        { seatId: 'a', afterMs: 80 },
      ],
      tie: ['b', 'c'],
    });
    expect(g.hostLast('buzz')).toBeUndefined();
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'tie', rank: 1 });
    expect(g.pc.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'tie', rank: 2 });
    expect(g.pa.last('result')).toMatchObject({ outcome: 'late', rank: 3 });
    expect(g.pa.last('view')?.view).toMatchObject({ phase: 'answering', answering: null });
    // The host (not having seen it yet) sends armed again: the tie stands.
    g.arm(1);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: null });
    // The host picks Bob... no, Cat, by hand: Cat answers; Bob (who came first of the tie) is next.
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'c', clue: { text: 'Q?' } }) });
    expect(g.hostLast('queue')).toEqual({
      t: 'queue',
      armId: 1,
      queue: [
        { seatId: 'c', afterMs: 0 },
        { seatId: 'b', afterMs: 0 },
        { seatId: 'a', afterMs: 75 },
      ],
    });
    expect(g.pc.last('result')).toMatchObject({ outcome: 'first', rank: 1 });
    expect(g.pb.last('result')).toMatchObject({ outcome: 'late', rank: 2, behind: 'Cat' });
  });

  it('a tie the host rolled for: the tied seats go first in roll order', () => {
    const g = game();
    g.arm(1);
    g.t.now += 300;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 204 });
    g.pc.send({ t: 'buzz', armId: 1, reactMs: 207 });
    g.tick(GRACE_MS);
    expect(g.hostLast('queue')?.tie).toEqual(['a', 'b', 'c']);
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'c', rollOrder: ['c', 'a', 'b'], clue: { text: 'Q?' } }) });
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'c' });
    expect(g.room.saved.state).not.toHaveProperty('rollOrder');
    expect(g.hostLast('queue')?.queue).toEqual([
      { seatId: 'c', afterMs: 0, rolled: 1 },
      { seatId: 'a', afterMs: 0, rolled: 2 },
      { seatId: 'b', afterMs: 0, rolled: 3 },
    ]);
    expect(g.pc.last('result')).toMatchObject({ outcome: 'first', rolled: 1 });
    expect(g.pa.last('result')).toMatchObject({ outcome: 'late', rank: 2, rolled: 2 });
    expect(g.pb.last('result')).toMatchObject({ outcome: 'late', rank: 3, rolled: 3 });
    // Cat was wrong and the host gives the next in line (Ann) the answer, in the same arm.
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'a', lockedOut: ['c'], clue: { text: 'Q?' } }) });
    expect(g.room.saved.state?.answering).toBe('a');
    expect(g.pa.last('result')).toMatchObject({ outcome: 'first', rank: 1 });
  });

  it('counts one buzz per seat per arm', () => {
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1 });
    g.pa.clear();
    g.pa.send({ t: 'buzz', armId: 1 });
    g.t.now += 30;
    g.pb.send({ t: 'buzz', armId: 1 });
    g.pb.send({ t: 'buzz', armId: 1 });
    g.tick(GRACE_MS);
    g.pa.send({ t: 'buzz', armId: 1 });
    expect(g.pa.msgs().filter((m) => m.t === 'result')).toEqual([{ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0, byMs: 30 }]);
    expect(g.hostAll('buzz')).toHaveLength(2);
  });

  it('the host wins mid-window: picking a player, closing the clue or re-arming', () => {
    // Picks Cat (a number key) while Ann's buzz waits: Cat answers, Ann is queued behind her.
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1 });
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'c', clue: { text: 'Q?' } }) });
    expect(g.timers()).toBe(0);
    g.tick(GRACE_MS);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'c' });
    expect(g.hostLast('buzz')).toBeUndefined();
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, behind: 'Cat' });
    // Closes the clue.
    const h = game();
    h.arm(1);
    h.t.now += 100;
    h.pa.send({ t: 'buzz', armId: 1 });
    h.send({ t: 'state', state: state({ phase: 'closed', armId: 1, clue: { text: 'Q?' } }) });
    h.tick(GRACE_MS);
    expect(h.room.saved.state?.phase).toBe('closed');
    expect(h.hostLast('buzz')).toBeUndefined();
    // Re-arms: the waiting buzz is dropped, Bob wins the new arm.
    const k = game();
    k.arm(1);
    k.t.now += 100;
    k.pa.send({ t: 'buzz', armId: 1 });
    k.arm(2);
    expect(k.timers()).toBe(0);
    k.t.now += 100;
    k.pb.send({ t: 'buzz', armId: 2 });
    k.tick(GRACE_MS);
    expect(k.hostAll('buzz')).toEqual([{ t: 'buzz', armId: 2, seatId: 'b', rank: 1, afterMs: 0 }]);
  });

  it('a room that slept or restarted mid-window decides it on time, or on the next message', () => {
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1 });
    const saved = structuredClone(g.room.saved);
    const phones = [...g.phoneSaves.values()];
    // Restarted with the timer gone: a new room sets its own.
    const h = setup(structuredClone(saved), phones);
    h.room.hostOpen();
    expect(h.timers()).toBe(1);
    h.tick(saved.race!.graceUntil! - h.t.now);
    expect(h.room.saved.state).toMatchObject({ phase: 'answering', answering: 'a' });
    expect(h.hostLast('buzz')).toMatchObject({ seatId: 'a', rank: 1 });
    // Its timer never ran (still asleep at the time): the next message settles it first.
    const k = setup(structuredClone(saved), phones);
    k.room.hostOpen();
    k.t.now += GRACE_MS + 1000;
    k.phoneOf('pb').send({ t: 'buzz', armId: 1 });
    expect(k.room.saved.state?.answering).toBe('a');
    expect(k.hostAll('queue').at(-1)?.queue.map((q) => q.seatId)).toEqual(['a', 'b']);
  });

  it('a buzz for an old arm is late and never counts', () => {
    const g = game();
    g.arm(2);
    g.pa.send({ t: 'buzz', armId: 1 });
    expect(g.pa.last('result')?.outcome).toBe('late');
    g.tick(GRACE_MS);
    expect(g.hostLast('buzz')).toBeUndefined();
    expect(g.room.saved.state?.phase).toBe('armed');
  });

  it('a buzz in the lobby is ignored', () => {
    const g = game();
    g.pa.clear();
    g.pa.send({ t: 'buzz', armId: 0 });
    expect(g.pa.msgs()).toEqual([]);
    expect(g.hostLast('buzz')).toBeUndefined();
  });

  it('a phone without a seat cannot buzz', () => {
    const g = game();
    g.arm(1);
    const p = g.phone('x');
    p.send({ t: 'buzz', armId: 1 });
    expect(p.last('result')).toBeUndefined();
    expect(g.timers()).toBe(0);
  });

  it('the winner stands when the host re-sends armed with the same armId; bumping armId reopens', () => {
    const g = game();
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.tick(GRACE_MS);
    g.arm(1, { scores: { a: 5 } }); // the host hadn't seen the buzz yet
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'a', scores: { a: 5 } });
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')).toMatchObject({ outcome: 'late', rank: 2 });
    // Ann was wrong: the host re-arms with a new armId and locks her out.
    g.arm(2, { lockedOut: ['a'] });
    expect(g.room.saved.state?.phase).toBe('armed');
    g.pa.send({ t: 'buzz', armId: 2 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 2, outcome: 'locked' });
    expect(g.pa.last('view')?.view.you?.lockedOut).toBe(true);
    g.pb.send({ t: 'buzz', armId: 2 });
    g.tick(GRACE_MS);
    expect(g.pb.last('result')?.outcome).toBe('first');
    expect(g.hostLast('buzz')).toMatchObject({ armId: 2, seatId: 'b', rank: 1 });
  });

  it('the host may take the answer back to closed or the lobby; buzzes then are early or ignored', () => {
    const g = game();
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.tick(GRACE_MS);
    g.send({ t: 'state', state: state({ phase: 'closed', armId: 1, clue: { text: 'Q?' } }) });
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')?.outcome).toBe('early');
  });

  it('times each phone round trip itself: pong → sync, median of the last five, only for pongs it sent', () => {
    const g = game();
    expect(g.room.rtt('pa')).toBeNull();
    for (const ms of [100, 30, 500, 60, 80, 90]) timeRtt(g, g.pa, ms);
    expect(median([30, 500, 60, 80, 90])).toBe(80);
    expect(g.room.rtt('pa')).toBe(80);
    expect(g.phoneSaves.get('pa')?.rtts).toEqual([30, 500, 60, 80, 90]);
    // A made-up or repeated serverNow is ignored (a phone can't pick its own round trip).
    g.pa.send({ t: 'sync', serverNow: 1 });
    g.pa.send({ t: 'ping', at: 2 });
    const pong = g.pa.last('pong')!.serverNow;
    g.t.now += 5;
    g.pa.send({ t: 'sync', serverNow: pong });
    g.pa.send({ t: 'sync', serverNow: pong });
    expect(g.phoneSaves.get('pa')?.rtts).toEqual([500, 60, 80, 90, 5]);
    // A stalled echo counts as MAX_RTT_MS at most.
    for (let i = 0; i < 5; i++) timeRtt(g, g.pb, 5000);
    expect(g.room.rtt('pb')).toBe(1000);
    // The samples live on the socket, so a room woken from hibernation still has them.
    const h = setup(structuredClone(g.room.saved), [...g.phoneSaves.values()]);
    expect(h.room.rtt('pa')).toBe(80);
  });
});

describe('early buzzes', () => {
  it('lock the seat for earlyLockMs, even once armed', () => {
    const g = game({ earlyLockMs: 1000 });
    g.send({ t: 'state', state: state({ phase: 'closed', armId: 0, clue: { text: 'Q?' }, earlyLockMs: 1000 }) });
    expect(g.pa.last('view')?.view.clue).toEqual({ text: 'Q?' });
    g.pa.send({ t: 'buzz', armId: 0 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 0, outcome: 'early', lockedUntil: 11_000 });
    g.t.now += 200;
    g.arm(1, { earlyLockMs: 1000 });
    g.pa.send({ t: 'buzz', armId: 1 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'locked', lockedUntil: 11_000 });
    expect(g.room.saved.state?.phase).toBe('armed');
    g.t.now += 800;
    g.pa.send({ t: 'buzz', armId: 1 });
    g.tick(GRACE_MS);
    expect(g.pa.last('result')?.outcome).toBe('first');
  });

  it('a reload does not clear the lock', () => {
    const g = game();
    g.send({ t: 'state', state: state({ phase: 'closed', clue: { text: 'Q?' } }) });
    g.pa.send({ t: 'buzz', armId: 0 });
    const token = g.pa.last('joined')!.token;
    const p = g.phone('pa2');
    p.send({ t: 'join', seatId: 'a', token });
    g.arm(1);
    p.send({ t: 'buzz', armId: 1 });
    expect(p.last('result')?.outcome).toBe('locked');
  });

  it('no penalty when earlyLockMs is 0', () => {
    const g = game({ earlyLockMs: 0 });
    g.send({ t: 'state', state: state({ phase: 'closed', clue: { text: 'Q?' }, earlyLockMs: 0 }) });
    g.pa.send({ t: 'buzz', armId: 0 });
    expect(g.pa.last('result')?.outcome).toBe('early');
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.tick(GRACE_MS);
    expect(g.pa.last('result')?.outcome).toBe('first');
  });
});

describe('sending', () => {
  it('sends a view only when it changed', () => {
    const g = game();
    const views = () => g.pa.msgs().filter((m) => m.t === 'view').length;
    const before = views();
    g.send({ t: 'state', state: state() });
    expect(views()).toBe(before);
    g.send({ t: 'state', state: state({ scores: { a: 300 } }) });
    expect(views()).toBe(before + 1);
    expect(g.pa.last('view')?.view.you?.score).toBe(300);
  });

  it('views never carry other seats or tokens', () => {
    const g = game();
    g.arm(1);
    const v = JSON.stringify(g.pa.last('view'));
    expect(v).not.toContain('token');
    expect(v).not.toContain('Bob');
  });

  it('phones see when the host leaves', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    const p = g.phone('p');
    g.room.hostClose();
    expect(p.last('seats')?.hostHere).toBe(false);
  });

  it('a room restored from storage (after hibernation) carries on', () => {
    const g = game();
    g.arm(1);
    const saved = structuredClone(g.room.saved);
    const phones = [...g.phoneSaves.values()];
    const h = setup(saved, phones);
    h.room.hostOpen();
    h.phoneOf('pc').send({ t: 'buzz', armId: 1 });
    h.tick(GRACE_MS);
    expect(h.hostLast('buzz')).toMatchObject({ seatId: 'c', rank: 1 });
    expect(h.phoneOf('pa').last('view')?.view.answering?.name).toBe('Cat');
  });
});

describe('untrusted input', () => {
  it('drops bad, unknown and oversized messages', () => {
    const g = game();
    g.pa.clear();
    const hostBefore = g.host.length;
    for (const raw of ['nope', '[]', 'null', '{"t":1}', '{"t":"dance"}', JSON.stringify({ t: 'ping', at: 1, pad: 'x'.repeat(1100) })]) {
      g.room.phoneMessage('pa', raw);
      g.room.hostMessage(raw);
    }
    g.room.phoneMessage('pa', new ArrayBuffer(4));
    g.room.phoneMessage('pa', JSON.stringify({ t: 'join', seatId: 5 }));
    g.room.phoneMessage('pa', JSON.stringify({ t: 'buzz', armId: '1' }));
    g.room.phoneMessage('unknown-conn', JSON.stringify({ t: 'ping', at: 1 }));
    g.room.hostMessage(JSON.stringify({ t: 'state', state: state({ title: 'x'.repeat(9000) }) }));
    expect(g.pa.msgs()).toEqual([]);
    // The oversized phone ping above was dropped but the same ping is fine for the host (under 8 KB).
    expect(g.host.slice(hostBefore).map((m) => m.t)).toEqual(['pong']);
    expect(g.room.saved.state?.title).toBe('Quiz night');
  });

  it('a state of the wrong shape is refused with an error', () => {
    const g = game();
    g.send({ t: 'state', state: { ...state(), phase: 'party' } });
    expect(g.hostLast('error')).toEqual({ t: 'error', message: 'bad state' });
    expect(g.room.saved.state?.phase).toBe('lobby');
  });

  it('cleanState trims and filters', () => {
    const s = cleanState({
      ...state(),
      seats: [...seats, { id: 'a', name: 'dup', color: '#000000' }, { id: 'z', name: '  Zed  ', color: 'red' }],
      lockedOut: ['a', 'nobody', 7],
      scores: { a: 1, nobody: 2, b: 'x' },
      answering: 'nobody',
      earlyLockMs: 99_999,
      clue: { text: 'Q', caption: '' },
    })!;
    expect(s.seats.map((x) => x.id)).toEqual(['a', 'b', 'c', 'z']);
    expect(s.seats[3]).toEqual({ id: 'z', name: 'Zed', color: '#4f7cff' });
    expect(s.lockedOut).toEqual(['a']);
    expect(s.scores).toEqual({ a: 1 });
    expect(s.answering).toBeNull();
    expect(s.earlyLockMs).toBe(10_000);
    expect(s.clue).toEqual({ text: 'Q' });
    expect(cleanState({ ...state(), armId: -1 })).toBeNull();
    expect(cleanState({ ...state(), seats: [{ id: '', name: 'x' }] })).toBeNull();
  });

  it('rate-limits each socket', () => {
    const g = game();
    g.pa.clear();
    g.t.now += 1000; // a fresh window
    for (let i = 0; i < 30; i++) g.pa.send({ t: 'ping', at: i });
    expect(g.pa.msgs().filter((m) => m.t === 'pong')).toHaveLength(20);
    g.t.now += 1000;
    g.pa.send({ t: 'ping', at: 99 });
    expect(g.pa.last('pong')?.at).toBe(99);
  });

  it('rate-limits join attempts', () => {
    const g = game();
    const p = g.phone('guesser');
    for (let i = 0; i < 15; i++) {
      g.t.now += 100;
      p.send({ t: 'join', seatId: 'a', token: 'guess' + i });
    }
    expect(p.msgs().filter((m) => m.t === 'denied')).toHaveLength(10);
  });
});
