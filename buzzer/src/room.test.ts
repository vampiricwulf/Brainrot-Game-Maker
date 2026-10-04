import { describe, expect, it } from 'vitest';
import type { HostState, RoomToHost, RoomToPhone } from '../../src/lib/buzzproto';
import { clip, cleanName } from '../../src/lib/buzzproto';
import {
  cleanState,
  FLOOD_BLOCK_MS,
  FLOOD_BURST,
  GRACE_MS,
  IDLE_MS,
  JOIN_RATE,
  KICK_BLOCK_MS,
  lowRtt,
  MAX_GRACE_MS,
  MAX_MEMBERS,
  MAX_PHONES,
  MAX_RTT_MS,
  MAX_SOCKETS,
  MIN_REACT_MS,
  NET_TOLERANCE_MS,
  PHONE_BYTES,
  PHONE_RATE,
  PROBE_GAP_MS,
  rankKey,
  WAGER_RATE,
  WAGER_WINDOW_MS,
  Room,
  TOO_BIG,
  type PhoneSaved,
  type RoomSaved,
} from './room';

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
  const dropped: string[] = [];
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
      dropPhone: (c) => dropped.push(c),
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
  const phone = (conn: string, ip?: string) => {
    room.phoneOpen(conn, ip);
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
  return { t, tick, timers: () => timers.length, room, host, hostLast, hostAll, send, phone, phoneOf, phoneSaves, dropped, saves: () => saves };
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
    expect(g.host[0]).toEqual({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: 10_000, features: ['teams', 'wagers', 'free'] });
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

  it('a phone coming back to its seat mid-clue hears where its buzz stands ("You\'re 2nd…")', () => {
    const g = game();
    g.arm(1);
    g.t.now += 300;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 250 });
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 280 });
    const token = g.pb.last('joined')!.token;
    // Bob reloads mid-window: still counted ('pending')…
    const again = g.phone('pb2');
    again.send({ t: 'join', seatId: 'b', token });
    expect(again.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'pending' });
    g.tick(MAX_GRACE_MS);
    expect(again.last('result')).toMatchObject({ outcome: 'late', rank: 2, afterMs: 30, behind: 'Ann' });
    // …and once more after the race: his place again, though it hasn't changed.
    const third = g.phone('pb3');
    third.send({ t: 'join', seatId: 'b', token });
    expect(third.last('result')).toMatchObject({ outcome: 'late', rank: 2, afterMs: 30, behind: 'Ann' });
    expect(third.last('probe')).toBeDefined(); // and the room times its round trip at once
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
    expect(info?.pendingName).toBe('A very long name that g…');
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

  it('idle phones without a seat make way: 24 open pages never lock out a real player', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    for (let i = 0; i < MAX_PHONES; i++) {
      expect(g.room.phoneOpen('v' + i)).toBe(true);
      g.t.now += 10;
    }
    // All still fresh: a newcomer gets in, but only to come back to a seat with its token.
    const late = g.phone('late');
    late.send({ t: 'join', seatId: 'a' });
    expect(late.last('denied')?.reason).toBe('full');
    expect(g.dropped).toEqual(['late']);
    expect(g.hostLast('full')).toEqual({ t: 'full' });
    // Once they've sat idle a while, the oldest one makes way for a real player.
    g.t.now += IDLE_MS + 1;
    const ann = g.phone('ann');
    ann.send({ t: 'join', seatId: 'a' });
    expect(ann.last('joined')?.seatId).toBe('a');
    expect(g.dropped).toEqual(['late', 'v0']);
    expect(g.phoneOf('v0').last('denied')?.reason).toBe('full');
    expect(g.room.phoneCount).toBe(MAX_PHONES);
  });

  it('a phone with its seat token always gets back in, even when the room is full', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state({ allowNew: true }) });
    const ann = g.phone('ann');
    ann.send({ t: 'join', seatId: 'a' });
    const token = ann.last('joined')!.token;
    for (let i = 1; i < MAX_PHONES; i++) g.phone('v' + i).send({ t: 'join', seatId: 'zzz' }); // busy, not idle
    const back = g.phone('ann-again');
    back.send({ t: 'join', seatId: 'a', token });
    expect(back.last('joined')?.seatId).toBe('a');
    const other = g.phone('other');
    other.send({ t: 'new', name: 'Dee' });
    expect(other.last('denied')?.reason).toBe('full');
    // Seated phones and those waiting on the host are never turned away to make room.
    g.t.now += IDLE_MS * 3;
    const wait = g.phone('w');
    wait.send({ t: 'new', name: 'Eve' });
    expect(wait.last('waiting')).toBeDefined();
    g.t.now += IDLE_MS * 3;
    for (let i = 0; i < 30; i++) g.room.phoneOpen('more' + i);
    expect(g.dropped).toContain('v1');
    expect(g.dropped).not.toContain('ann-again');
    expect(g.dropped).not.toContain('w');
  });

  it('never holds more than MAX_SOCKETS sockets', () => {
    const g = setup();
    for (let i = 0; i < MAX_SOCKETS; i++) {
      expect(g.room.phoneOpen('p' + i)).toBe(true);
      g.room.phoneMessage('p' + i, JSON.stringify({ t: 'leave' })); // busy
    }
    expect(g.room.phoneOpen('one-too-many')).toBe(false);
    g.room.phoneClose('p0');
    expect(g.room.phoneOpen('now-fits')).toBe(true);
  });

  it('a kicked phone cannot take the same seat again for a while (it can take another); other phones can', () => {
    const g = game();
    g.pb.send({ t: 'join', seatId: 'b', device: 'dev-b' }); // already there: only tells the room its device
    g.send({ t: 'kick', seatId: 'b' });
    g.pb.send({ t: 'join', seatId: 'b' });
    expect(g.pb.last('denied')?.reason).toBe('blocked');
    // Reloaded (a new socket), same browser: still blocked.
    const again = g.phone('pb2');
    again.send({ t: 'join', seatId: 'b', device: 'dev-b' });
    expect(again.last('denied')?.reason).toBe('blocked');
    g.send({ t: 'state', state: state({ seats: [...seats, { id: 'd', name: 'Dee', color: '#123456' }] }) });
    again.send({ t: 'join', seatId: 'd', device: 'dev-b' });
    expect(again.last('joined')?.seatId).toBe('d');
    const someone = g.phone('x');
    someone.send({ t: 'join', seatId: 'b', device: 'dev-x' });
    expect(someone.last('joined')?.seatId).toBe('b');
    // Two minutes on, the block is over.
    g.send({ t: 'kick', seatId: 'b' });
    g.t.now += KICK_BLOCK_MS + 1;
    g.pb.send({ t: 'join', seatId: 'b' });
    expect(g.pb.last('joined')?.seatId).toBe('b');
  });

  it('a phone kicked while it is away (asleep, its tab closed) is still kept off that seat when it comes back', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    const troll = g.phone('t1', '203.0.113.5');
    troll.send({ t: 'join', seatId: 'a', device: 'dev-1' });
    g.room.phoneClose('t1');
    g.send({ t: 'kick', seatId: 'a' });
    const back = g.phone('t2', '203.0.113.5');
    back.send({ t: 'join', seatId: 'a', device: 'dev-1' });
    expect(back.last('denied')?.reason).toBe('blocked');
  });

  it('a kick keeps the address off that seat too: a new device id doesn\'t get round it', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    const troll = g.phone('t1', '203.0.113.5');
    troll.send({ t: 'join', seatId: 'a', device: 'dev-1' });
    g.send({ t: 'kick', seatId: 'a' });
    // Cleared storage (a new device id) and reconnected, same address: still blocked.
    const back = g.phone('t2', '203.0.113.5');
    back.send({ t: 'join', seatId: 'a', device: 'dev-2' });
    expect(back.last('denied')?.reason).toBe('blocked');
    // Ann, elsewhere, takes her seat.
    const ann = g.phone('ann', '198.51.100.9');
    ann.send({ t: 'join', seatId: 'a', device: 'dev-ann' });
    expect(ann.last('joined')?.seatId).toBe('a');
  });

  it('a kick spares the other phones already in the room on the same Wi-Fi: Bob takes his own seat', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    const bob = g.phone('bob', '203.0.113.5');
    // Bob is in the room, on the seat list (his browser told it its device id with a join).
    bob.send({ t: 'join', seatId: 'a', device: 'dev-bob' });
    bob.send({ t: 'leave' });
    const ann = g.phone('ann', '203.0.113.5');
    ann.send({ t: 'join', seatId: 'b', device: 'dev-ann' }); // Ann taps Bob's name by mistake
    g.send({ t: 'kick', seatId: 'b' });
    bob.send({ t: 'join', seatId: 'b', device: 'dev-bob' });
    expect(bob.last('joined')?.seatId).toBe('b');
    // Bob's phone reloads (a new socket, same browser): still spared.
    bob.send({ t: 'leave' });
    const bob2 = g.phone('bob2', '203.0.113.5');
    bob2.send({ t: 'join', seatId: 'b', device: 'dev-bob' });
    expect(bob2.last('joined')?.seatId).toBe('b');
    // Ann (or a new device id at that address, after the kick) is still kept off it.
    bob2.send({ t: 'leave' });
    const fresh = g.phone('fresh', '203.0.113.5');
    fresh.send({ t: 'join', seatId: 'b', device: 'dev-new' });
    expect(fresh.last('denied')?.reason).toBe('blocked');
    const ann2 = g.phone('ann2', '198.51.100.9');
    ann2.send({ t: 'join', seatId: 'b', device: 'dev-ann' });
    expect(ann2.last('denied')?.reason).toBe('blocked');
  });

  it('freeing a seat (block: false) blocks nobody: the player takes it from a new phone on the same Wi-Fi', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state() });
    const old = g.phone('old', '203.0.113.5');
    old.send({ t: 'join', seatId: 'a', device: 'dev-old' });
    // Her old phone's socket is gone: the seat is taken but away, for the host and for other phones.
    g.room.phoneClose('old');
    expect(g.hostLast('phones')?.phones).toContainEqual({ conn: 'old', seatId: 'a', connected: false });
    const fresh = g.phone('new', '203.0.113.5');
    expect(fresh.last('seats')?.seats.find((x) => x.id === 'a')).toMatchObject({ taken: true, away: true });
    expect(fresh.last('seats')?.seats.find((x) => x.id === 'b')).toEqual({ ...seats[1], taken: false });
    fresh.send({ t: 'join', seatId: 'a', device: 'dev-new' });
    expect(fresh.last('denied')?.reason).toBe('taken');
    g.send({ t: 'kick', seatId: 'a', block: false });
    expect(g.room.saved.blocks?.a).toBeUndefined();
    expect(fresh.last('seats')?.seats.find((x) => x.id === 'a')).toEqual({ ...seats[0], taken: false });
    fresh.send({ t: 'join', seatId: 'a', device: 'dev-new' });
    expect(fresh.last('joined')?.seatId).toBe('a');
    expect(fresh.last('seats')?.seats.find((x) => x.id === 'a')?.away).toBeUndefined();
    // Even the old phone itself could take it back (nobody is blocked).
    g.send({ t: 'kick', seatId: 'a', block: false });
    expect(fresh.last('kicked')).toEqual({ t: 'kicked', freed: true });
    const back = g.phone('old2', '203.0.113.5');
    back.send({ t: 'join', seatId: 'a', device: 'dev-old' });
    expect(back.last('joined')?.seatId).toBe('a');
    // A kick (block left out) still blocks that address.
    g.send({ t: 'kick', seatId: 'a' });
    expect(back.last('kicked')).toEqual({ t: 'kicked' });
    const again = g.phone('old3', '203.0.113.5');
    again.send({ t: 'join', seatId: 'a', device: 'dev-old3' });
    expect(again.last('denied')?.reason).toBe('blocked');
  });

  it('teams: freeing one member blocks nobody', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state({ teams: true }) });
    const zoe = g.phone('z', '203.0.113.5');
    zoe.send({ t: 'join', seatId: 'a', name: 'Zoe', device: 'dz' });
    const id = Object.keys(g.room.saved.members ?? {})[0];
    g.send({ t: 'kick', seatId: 'a', member: id, block: false });
    expect(zoe.last('kicked')).toEqual({ t: 'kicked', freed: true });
    expect(g.room.saved.blocks?.a).toBeUndefined();
    zoe.send({ t: 'join', seatId: 'a', name: 'Zoe', device: 'dz' });
    expect(zoe.last('joined')?.name).toBe('Zoe');
  });

  it('game over: each phone hears where its seat came', () => {
    const g = game({ scores: { a: 300, b: 700, c: 300 }, over: true });
    expect(g.room.saved.state?.over).toBe(true);
    expect(g.pb.last('view')?.view.final).toEqual({ place: 1 });
    expect(g.pa.last('view')?.view.final).toEqual({ place: 2, tied: true });
    expect(g.pc.last('view')?.view.final).toEqual({ place: 2, tied: true });
    g.send({ t: 'state', state: state({ scores: { a: 300, b: 700, c: 300 } }) });
    expect(g.pb.last('view')?.view.final).toBeUndefined();
  });

  it('🔒 locked seats: only a seat token gets a seat; nobody new can ask', () => {
    const g = game({ allowNew: true });
    const token = g.pa.last('joined')!.token;
    g.send({ t: 'state', state: state({ allowNew: true, locked: true }) });
    const p = g.phone('p');
    expect(p.last('seats')?.locked).toBe(true);
    g.send({ t: 'kick', seatId: 'c' });
    p.send({ t: 'join', seatId: 'c' });
    expect(p.last('denied')?.reason).toBe('locked');
    p.send({ t: 'new', name: 'Dee' });
    expect(p.last('denied')?.reason).toBe('locked');
    const back = g.phone('pa2');
    back.send({ t: 'join', seatId: 'a', token });
    expect(back.last('joined')?.seatId).toBe('a');
  });

  it("names typed on phones are cleaned, and an existing player's name is refused", () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state({ allowNew: true }) });
    const p = g.phone('p');
    p.send({ t: 'new', name: '\u202eann\u200b' });
    expect(p.last('denied')?.reason).toBe('name-taken');
    p.send({ t: 'new', name: ' D\u200bee\u0007  \u{1F468}\u200d\u{1F469}\u200d\u{1F467} ' });
    expect(g.hostLast('phones')?.phones.find((x) => x.conn === 'p')?.pendingName).toBe('Dee \u{1F468}\u200d\u{1F469}\u200d\u{1F467}');
  });

  it('a request to join is always answered: a name of only invisible characters, or too many tries in a minute', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state({ allowNew: true }) });
    const p = g.phone('p');
    p.send({ t: 'new', name: '\u200b\u200d ' });
    expect(p.last('denied')?.reason).toBe('need-name');
    for (let i = 0; i < JOIN_RATE; i++) p.send({ t: 'join', seatId: 'nope' });
    p.clear();
    p.send({ t: 'new', name: 'Zed' });
    expect(p.last('denied')?.reason).toBe('slow-down');
    p.send({ t: 'join', seatId: 'a' });
    expect(p.last('denied')?.reason).toBe('slow-down');
    expect(p.last('joined')).toBeUndefined();
  });

  it('names keep whole characters: a family emoji counts as one and is never cut apart, and flags keep their tags', () => {
    const family = '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}';
    const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
    expect(cleanName(`Go ${england}!`, 24)).toBe(`Go ${england}!`);
    // Tag characters anywhere else are invisible junk.
    expect(cleanName('A\u{E0041}nn', 24)).toBe('Ann');
    expect(clip(family.repeat(5), 5)).toBe(family.repeat(5));
    expect(clip(`Al${family}${family}`, 3)).toBe(`Al…`);
    expect(clip(`A${family}${family}`, 3)).toBe(`A${family}${family}`);
    expect(clip(`A${family}${family}x`, 3)).toBe(`A${family}…`);
    expect(clip(`${england}${england}${england}`, 2)).toBe(`${england}…`);
    // Piled-up accents can't make one "character" huge.
    expect(clip(`a${'\u0301'.repeat(500)}`, 4).length).toBeLessThanOrEqual(64);
  });
});

/** The phone pings; the room answers with a probe, which the phone echoes rttMs later: the room times a round trip. */
function timeRtt(g: ReturnType<typeof setup>, p: ReturnType<ReturnType<typeof setup>['phoneOf']>, rttMs: number) {
  g.t.now += PROBE_GAP_MS; // (at most one probe so often)
  p.send({ t: 'ping', at: 1 });
  const id = p.last('probe')!.id;
  g.t.now += rttMs;
  p.send({ t: 'echo', id });
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
    g.tick(MAX_GRACE_MS);
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
    expect(g.room.rtt('pb')).toBe(MAX_RTT_MS); // 350: a longer one counts as that
    g.arm(1);
    // Ann's light came on at once and she pressed after 260 ms: here at 300. Bob's came on 200 ms late (slow network),
    // he pressed after 200 ms, and his buzz took another 200 ms: here at 450, after Ann's.
    g.t.now += 300;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 260 });
    g.t.now += 150;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'b' });
    expect(g.hostAll('buzz')).toEqual([
      { t: 'buzz', armId: 1, seatId: 'b', rank: 1, afterMs: 0 },
      { t: 'buzz', armId: 1, seatId: 'a', rank: 2, afterMs: 60 },
    ]);
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0, byMs: 60 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 60, behind: 'Bob' });
  });

  it('after a wrong answer, places count without the one who missed (the next in line hears it is next)', () => {
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 100 });
    g.t.now += 50;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 150 });
    g.t.now += 50;
    g.pc.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.tick(MAX_GRACE_MS);
    // Ann missed: Bob answers (same opening), Carol is next.
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'b', lockedOut: ['a'], clue: { text: 'Q?' } }) });
    expect(g.pc.last('result')).toMatchObject({ outcome: 'late', rank: 2, behind: 'Bob', afterMs: 50 });
  });

  it('a new clue opened with the buzzers closed doesn’t bring back the last clue’s buzzes', () => {
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 100 });
    g.t.now += 50;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 150 });
    g.tick(MAX_GRACE_MS);
    // Back to the board, then a new clue with the buzzers closed: the host picks Carol.
    g.send({ t: 'state', state: state({ phase: 'lobby', armId: 1 }) });
    const before = g.pb.msgs().filter((m) => m.t === 'result').length;
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'c', clue: { text: 'Q2?' } }) });
    expect(g.pb.msgs().filter((m) => m.t === 'result').length).toBe(before);
  });

  it('rankKey: reactMs counts, raised (never more than that) to leave the network at most the round trip + tolerance', () => {
    expect(NET_TOLERANCE_MS).toBe(70);
    expect(rankKey(300, 250, 100)).toBe(250);
    expect(rankKey(300, 250, null)).toBe(250); // unknown round trip: 250 ms + tolerance assumed
    // 290 ms "on the network" with a 40 ms round trip: no; it may leave 110 ms, so it counts as 190.
    expect(rankKey(300, 10, 40)).toBe(190);
    // No jump at the edge: one ms more claimed reaction is one ms more key.
    expect(rankKey(300, 189, 40)).toBe(190);
    expect(rankKey(300, 191, 40)).toBe(191);
    expect(rankKey(500, 3, 300)).toBe(130);
    expect(rankKey(200, 3, 300)).toBe(MIN_REACT_MS); // fits, but nobody reacts in 3 ms
    // Impossible or missing: the time since arming minus the round trip.
    expect(rankKey(300, 400, 40)).toBe(260); // reacted before the buzzers opened
    expect(rankKey(300, -5, 40)).toBe(260);
    expect(rankKey(300, Number.NaN, 40)).toBe(260);
    expect(rankKey(300, undefined, 40)).toBe(260);
    expect(rankKey(300, undefined, null)).toBe(300);
    expect(rankKey(20, undefined, null)).toBe(MIN_REACT_MS);
  });

  it('a forged reactMs gains at most the round trip + tolerance', () => {
    const g = game();
    timeRtt(g, g.pa, 40);
    timeRtt(g, g.pb, 40);
    g.arm(1);
    g.t.now += 250;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 200 }); // honest
    g.t.now += 130;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 0 }); // "I pressed the moment the light came on" (really ~340 ms)
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('b');
    expect(g.hostLast('queue')?.queue).toEqual([
      { seatId: 'b', afterMs: 0 },
      { seatId: 'a', afterMs: 70 },
    ]);
  });

  it('holding its echoes buys a phone at most MAX_RTT_MS of slack', () => {
    const g = game();
    timeRtt(g, g.pa, 20);
    for (let i = 0; i < 5; i++) timeRtt(g, g.pb, 900); // a cheat holding every echo for 900 ms
    expect(g.room.rtt('pb')).toBe(MAX_RTT_MS);
    g.arm(1);
    // Ann reacts in 300 ms. Bob (a fast network really) presses 760 ms in and claims 50: his buzz counts as
    // 760 − 350 − 70 = 340, so pressing 440 ms after Ann (more than the 420 ms it can buy him) loses. (With the old
    // 1 s cap and 150 ms tolerance it could buy 1150 ms.)
    g.t.now += 320;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 300 });
    g.t.now += 440;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 50 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('a');
    expect(g.hostLast('queue')?.queue).toEqual([
      { seatId: 'a', afterMs: 0 },
      { seatId: 'b', afterMs: 40 },
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
    g.tick(MAX_GRACE_MS);
    expect(g.hostAll('buzz').map((m) => [m.seatId, m.rank, m.afterMs])).toEqual([
      ['c', 1, 0],
      ['a', 2, 40],
      ['b', 3, 65],
    ]);
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 40, behind: 'Cat' });
    expect(g.pc.last('result')?.byMs).toBe(40);
    // Cat missed: Ann answers next. She wasn't first, so her phone doesn't say "first by 0.00 s".
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, clue: { text: 'Q?' }, answering: 'a', lockedOut: ['c'] }) });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0 });
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
    // The window waits for Dee: a reaction as fast as Ann's would get here 150 + 350 + 70 ms after arming.
    expect(g.room.saved.race?.graceUntil).toBe(g.room.saved.race!.armedAt + 570);
    g.tick(400);
    expect(g.room.saved.state?.answering).toBe('a');
    g.t.now += 300;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 600 });
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 450, behind: 'Ann' });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0, byMs: 450 });
    // Cat's buzz came very late with no reaction time (fallback: 1100 − 0): behind Bob.
    g.t.now += 200;
    g.pc.send({ t: 'buzz', armId: 1 });
    expect(g.hostLast('queue')?.queue.map((q) => q.seatId)).toEqual(['a', 'b', 'c']);
    // Dee says she reacted in 100 ms, but her buzz took 1.2 s: it counts as 1200 − 420 = 780 (behind Bob, ahead of Cat).
    g.t.now += 100;
    pd.send({ t: 'buzz', armId: 1, reactMs: 100 });
    expect(g.hostLast('queue')?.queue.map((q) => q.seatId)).toEqual(['a', 'b', 'd', 'c']);
    expect(g.hostLast('queue')?.queue[2].afterMs).toBe(630);
    expect(pd.last('result')).toMatchObject({ outcome: 'late', rank: 3 });
    expect(g.pb.last('result')).toMatchObject({ outcome: 'late', rank: 2 });
    expect(g.pc.last('result')).toMatchObject({ outcome: 'late', rank: 4 });
    expect(g.hostLast('buzz')).toMatchObject({ seatId: 'd', rank: 3 });
    expect(g.room.saved.state?.answering).toBe('a');
  });

  it('the grace window lasts as long as the slowest seated phone that could still buzz needs (GRACE_MS to MAX_GRACE_MS)', () => {
    const g = game();
    for (const p of [g.pa, g.pb, g.pc]) timeRtt(g, p, 10);
    g.arm(1);
    g.t.now += 200;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 180 });
    // Everyone on a fast network: the shortest window.
    expect(g.room.saved.race?.graceUntil).toBe(g.t.now + GRACE_MS);
    // Bob on a slow one (300 ms): a reaction as fast as Ann's would get here 180 + 300 + 70 ms after arming.
    const h = game();
    timeRtt(h, h.pa, 10);
    timeRtt(h, h.pb, 300);
    timeRtt(h, h.pc, 10);
    h.arm(1);
    const armed = h.t.now;
    h.t.now += 200;
    h.pa.send({ t: 'buzz', armId: 1, reactMs: 180 });
    expect(h.room.saved.race?.graceUntil).toBe(armed + 550);
    // Bob reacted faster (150 ms) but his buzz takes 300 ms: it still makes the window and wins.
    h.t.now = armed + 450;
    h.pb.send({ t: 'buzz', armId: 1, reactMs: 150 });
    h.tick(GRACE_MS);
    expect(h.room.saved.state?.answering).toBe('b');
    // Locked-out seats don't hold the window open.
    const k = game();
    timeRtt(k, k.pa, 10);
    timeRtt(k, k.pb, 300);
    timeRtt(k, k.pc, 10);
    k.arm(1, { lockedOut: ['b'] });
    k.t.now += 200;
    k.pa.send({ t: 'buzz', armId: 1, reactMs: 180 });
    expect(k.room.saved.race?.graceUntil).toBe(k.t.now + GRACE_MS);
  });

  it('a buzz that reacted faster but got here after the race was decided says so (not "0.00 s behind")', () => {
    const g = game();
    g.arm(1);
    g.t.now += 350;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 300 });
    // The host takes Ann's buzz at once (a number key), mid-window.
    g.send({ t: 'state', state: state({ phase: 'answering', armId: 1, answering: 'a', clue: { text: 'Q?' } }) });
    g.t.now += 50;
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 250 });
    expect(g.hostLast('queue')?.queue).toEqual([
      { seatId: 'a', afterMs: 0 },
      { seatId: 'b', afterMs: 0, arrivedLate: true },
    ]);
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 0, behind: 'Ann', arrivedLate: true });
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
    g.tick(MAX_GRACE_MS);
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
    g.tick(MAX_GRACE_MS);
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
    g.tick(MAX_GRACE_MS);
    g.pa.send({ t: 'buzz', armId: 1 });
    // Sent again (a phone that lost its connection), it is answered with where it stands, and counted once.
    const first = { t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0, byMs: 30 };
    expect(g.pa.msgs().filter((m) => m.t === 'result')).toEqual([{ t: 'result', armId: 1, outcome: 'pending' }, first, first]);
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
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'c' });
    expect(g.hostLast('buzz')).toBeUndefined();
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, behind: 'Cat' });
    // Closes the clue.
    const h = game();
    h.arm(1);
    h.t.now += 100;
    h.pa.send({ t: 'buzz', armId: 1 });
    h.send({ t: 'state', state: state({ phase: 'closed', armId: 1, clue: { text: 'Q?' } }) });
    h.tick(MAX_GRACE_MS);
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
    k.tick(MAX_GRACE_MS);
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
    g.tick(MAX_GRACE_MS);
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
    g.tick(MAX_GRACE_MS);
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
    g.tick(MAX_GRACE_MS);
    expect(g.pb.last('result')?.outcome).toBe('first');
    expect(g.hostLast('buzz')).toMatchObject({ armId: 2, seatId: 'b', rank: 1 });
  });

  it('the host may take the answer back to closed or the lobby; buzzes then are early or ignored', () => {
    const g = game();
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.tick(MAX_GRACE_MS);
    g.send({ t: 'state', state: state({ phase: 'closed', armId: 1, clue: { text: 'Q?' } }) });
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')?.outcome).toBe('early');
  });

  it('times each phone round trip itself: probe → echo, a low one of the last five, only for probes it sent', () => {
    const g = game();
    // Taking a seat sent a probe already; a phone that never echoes stays untimed.
    expect(g.pa.last('probe')).toBeDefined();
    expect(g.room.rtt('pa')).toBeNull();
    for (const ms of [100, 30, 500, 60, 80, 90]) timeRtt(g, g.pa, ms);
    expect(lowRtt([30, 500, 60, 80, 90])).toBe(60);
    expect(lowRtt([90, 30])).toBe(30);
    expect(g.room.rtt('pa')).toBe(60);
    expect(g.phoneSaves.get('pa')?.rtts).toEqual([30, 500, 60, 80, 90]);
    // A phone pinging fast gets a probe at most every PROBE_GAP_MS.
    g.pa.clear();
    for (let i = 0; i < 10; i++) {
      g.pa.send({ t: 'ping', at: i });
      g.t.now += 50;
    }
    expect(g.pa.msgs().filter((m) => m.t === 'probe')).toHaveLength(2);
    // A made-up or repeated id is ignored (a phone can't pick its own round trip), and so is the old pong → sync.
    g.pa.send({ t: 'echo', id: 9999 });
    g.t.now += PROBE_GAP_MS;
    g.pa.send({ t: 'ping', at: 2 });
    const id = g.pa.last('probe')!.id;
    g.pa.send({ t: 'sync', serverNow: g.pa.last('pong')!.serverNow });
    g.t.now += 5;
    g.pa.send({ t: 'echo', id });
    g.pa.send({ t: 'echo', id });
    expect(g.phoneSaves.get('pa')?.rtts).toEqual([500, 60, 80, 90, 5]);
    // Echoes held back count as MAX_RTT_MS at most.
    for (let i = 0; i < 5; i++) timeRtt(g, g.pb, 5000);
    expect(g.room.rtt('pb')).toBe(MAX_RTT_MS);
    // The samples live on the socket, so a room woken from hibernation still has them.
    const h = setup(structuredClone(g.room.saved), [...g.phoneSaves.values()]);
    expect(h.room.rtt('pa')).toBe(60);
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
    g.tick(MAX_GRACE_MS);
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
    g.tick(MAX_GRACE_MS);
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

  it('seated phones see when the host is gone and back', () => {
    const g = game();
    expect(g.pa.last('view')?.view.hostHere).toBe(true);
    g.room.hostClose();
    expect(g.pa.last('view')?.view.hostHere).toBe(false);
    g.room.hostOpen();
    expect(g.pa.last('view')?.view.hostHere).toBe(true);
  });

  it('a clue answered right: phones say who got it, and a buzz now is no early buzz', () => {
    const g = game();
    g.arm(1);
    g.send({ t: 'state', state: state({ phase: 'closed', armId: 1, clue: { text: 'Q?' }, done: { by: 'b' } }) });
    expect(g.pa.last('view')?.view.done).toEqual({ by: { name: 'Bob', color: '#00ff00', you: false } });
    expect(g.pb.last('view')?.view.done?.by?.you).toBe(true);
    g.pa.send({ t: 'buzz', armId: 1 });
    expect(g.pa.last('result')?.outcome).toBe('late');
    expect(g.room.saved.earlyLocks).toEqual({});
    // Not with another phase (an older host never sends it).
    g.send({ t: 'state', state: state({ phase: 'lobby', done: { by: 'b' } }) });
    expect(g.pa.last('view')?.view.done).toBeUndefined();
  });

  it('a status line: its seats see their own words (the Daily Double player), the rest and the seat list the line', () => {
    const g = game();
    const p = g.phone('viewer');
    g.send({ t: 'state', state: state({ status: { text: 'Daily Double: Ann', seats: ['a'], seatsText: "Daily Double — you're up!" }, currency: '€' }) });
    expect(g.pa.last('view')?.view.status).toBe("Daily Double — you're up!");
    expect(g.pb.last('view')?.view.status).toBe('Daily Double: Ann');
    expect(g.pb.last('view')?.view.currency).toBe('€');
    expect(p.last('seats')?.note).toBe('Daily Double: Ann');
    g.send({ t: 'state', state: state() });
    expect(g.pb.last('view')?.view.status).toBeUndefined();
  });

  it('a host that dropped mid-race hears who won when it comes back', () => {
    const g = game();
    g.arm(1);
    g.room.hostClose();
    g.pb.send({ t: 'buzz', armId: 1, reactMs: 300 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('b');
    const before = g.host.length;
    g.room.hostOpen();
    // It still says "armed" (it never heard): the winner stands, and the buzz comes again.
    g.arm(1);
    expect(g.host.slice(before)).toContainEqual({ t: 'buzz', armId: 1, seatId: 'b', rank: 1, afterMs: 0 });
    expect(g.room.saved.state?.phase).toBe('answering');
    // Back mid-window (the room slept): the window is decided as the host comes back.
    g.arm(2);
    g.room.hostClose();
    g.pc.send({ t: 'buzz', armId: 2, reactMs: 300 });
    g.t.now += MAX_GRACE_MS + 50; // the timer never ran
    g.room.hostOpen();
    expect(g.hostLast('buzz')).toMatchObject({ armId: 2, seatId: 'c', rank: 1 });
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
    h.tick(MAX_GRACE_MS);
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
    g.room.hostMessage(JSON.stringify({ t: 'state', state: state({ title: 'x'.repeat(40_000) }) }));
    expect(g.pa.msgs()).toEqual([]);
    // The oversized phone ping above was dropped but the same ping is fine for the host (under 32 KB); a state too big
    // to take is refused out loud (the host shows it), not dropped in silence.
    expect(g.host.slice(hostBefore)).toEqual([{ t: 'pong', at: 1, serverNow: 10_000 }, { t: 'error', message: TOO_BIG }]);
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

  it('cleanState cuts long names with "…" (never mid-emoji) and checks the later fields', () => {
    const long = 'Bartholomew-Maximilian-the-Magnificent🎉🎉🎉';
    const s = cleanState({
      ...state(),
      seats: [{ id: 'a', name: long, color: '#ff0000' }],
      title: 'T'.repeat(300),
      done: { by: 'nobody' },
      status: { text: '  Final Jeopardy  ', seats: ['a', 'zz', 3], seatsText: 'Wager!' },
      currency: '$$$$$$$$$$$$',
      locked: 'yes',
    })!;
    expect(Array.from(s.seats[0].name)).toHaveLength(40);
    expect(s.seats[0].name.endsWith('🎉…')).toBe(true);
    expect(s.title).toHaveLength(200);
    expect(s.done).toEqual({ by: null });
    expect(s.status).toEqual({ text: 'Final Jeopardy', seats: ['a'], seatsText: 'Wager!' });
    expect(s.currency).toHaveLength(8);
    expect(s.locked).toBeUndefined();
    const plain = cleanState(state())!;
    expect('done' in plain || 'status' in plain || 'currency' in plain || 'locked' in plain).toBe(false);
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

  it('a phone that keeps flooding is closed and its address kept out a while; one burst only drops messages', () => {
    const g = game();
    const p = g.phone('flood', '203.0.113.66');
    // One second over the limit: the extra messages are dropped, the socket stays.
    g.t.now += 1000;
    for (let i = 0; i < 30; i++) expect(p.send({ t: 'ping', at: i })).toBeUndefined();
    expect(p.msgs().filter((m) => m.t === 'pong')).toHaveLength(PHONE_RATE);
    // A quiet second, then over the limit three seconds in a row: closed.
    g.t.now += 1000;
    p.send({ t: 'ping', at: 1 });
    const answers: unknown[] = [];
    for (let sec = 0; sec < 3; sec++) {
      g.t.now += 1000;
      for (let i = 0; i <= PHONE_RATE; i++) answers.push(p.send({ t: 'ping', at: i }));
    }
    expect(answers.at(-1)).toBe('close');
    expect(answers.filter((x) => x === 'close')).toHaveLength(1);
    expect(g.room.phoneCount).toBe(4 - 1);
    expect(g.room.floodBlocked('203.0.113.66')).toBe(true);
    expect(g.room.floodBlocked('198.51.100.1')).toBe(false);
    expect(g.room.floodBlocked(undefined)).toBe(false);
    g.t.now += FLOOD_BLOCK_MS;
    expect(g.room.floodBlocked('203.0.113.66')).toBe(false);    // A burst far over the limit is closed at once.
    const burst = g.phone('burst');
    const got: unknown[] = [];
    for (let i = 0; i <= FLOOD_BURST; i++) got.push(burst.send({ t: 'ping', at: i }));
    expect(got.indexOf('close')).toBe(FLOOD_BURST);
  });

  it('after a flood, a seated player on the same Wi-Fi reconnects to their seat; new joins and the flooder stay out', () => {
    const g = setup();
    g.room.hostOpen();
    g.send({ t: 'state', state: state({ allowNew: true }) });
    const ip = '203.0.113.7';
    const bob = g.phone('bob', ip);
    bob.send({ t: 'join', seatId: 'a', device: 'dev-bob' });
    const bobToken = bob.last('joined')!.token;
    const troll = g.phone('troll', ip);
    troll.send({ t: 'join', seatId: 'b', device: 'dev-troll' });
    const trollToken = troll.last('joined')!.token;
    const got: unknown[] = [];
    for (let i = 0; i <= FLOOD_BURST; i++) got.push(troll.send({ t: 'ping', at: i }));
    expect(got).toContain('close');
    // Bob's phone drops (it went to the background) and comes back: its seat, as before.
    g.room.phoneClose('bob');
    const bobBack = g.phone('bob-back', ip);
    expect(bobBack.send({ t: 'join', seatId: 'a', token: bobToken, device: 'dev-bob' })).toBeUndefined();
    expect(bobBack.last('joined')?.seatId).toBe('a');
    g.t.now += 1000;
    expect(bobBack.send({ t: 'ping', at: 1 })).toBeUndefined();
    expect(bobBack.last('pong')).toBeTruthy();
    // The flooder with its own token, a new join and a join with no token: closed.
    expect(g.phone('troll-back', ip).send({ t: 'join', seatId: 'b', token: trollToken, device: 'dev-troll' })).toBe('close');
    expect(g.phone('new', ip).send({ t: 'new', name: 'Zed', device: 'dev-z' })).toBe('close');
    expect(g.phone('tap', ip).send({ t: 'join', seatId: 'c', device: 'dev-t' })).toBe('close');
    // Elsewhere, or once the block is over: in as usual.
    const elsewhere = g.phone('far', '198.51.100.2');
    elsewhere.send({ t: 'join', seatId: 'c', device: 'dev-far' });
    expect(elsewhere.last('joined')?.seatId).toBe('c');
    g.t.now += FLOOD_BLOCK_MS;
    const later = g.phone('later', ip);
    expect(later.send({ t: 'new', name: 'Zed', device: 'dev-z' })).toBeUndefined();
  });

  it('too many bytes in a second closes a phone at once, before any of it is read', () => {
    const g = game();
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1 });
    const p = g.phone('big');
    g.t.now += MAX_GRACE_MS; // the window is due, but its timer hasn't run
    // Oversized messages are dropped unread: they don't even settle the race.
    expect(g.room.phoneMessage('big', 'x'.repeat(4000))).toBeUndefined();
    expect(g.room.saved.state?.phase).toBe('armed');
    let r: unknown;
    for (let i = 0; i < 10 && !r; i++) r = g.room.phoneMessage('big', 'x'.repeat(4000));
    expect(r).toBe('close');
    expect(4000 * 5).toBeGreaterThan(PHONE_BYTES);
    expect(p.msgs().some((m) => m.t === 'pong')).toBe(false);
    // The room still works for everyone else.
    g.pb.send({ t: 'ping', at: 1 });
    expect(g.room.saved.state?.answering).toBe('a');
  });

  it('rate-limits join attempts', () => {
    const g = game();
    const p = g.phone('guesser');
    for (let i = 0; i < 15; i++) {
      g.t.now += 100;
      p.send({ t: 'join', seatId: 'a', token: 'guess' + i });
    }
    // Ten tries are looked at; the rest are only told to slow down (no token is checked).
    const denied = p.msgs().flatMap((m) => (m.t === 'denied' ? [m.reason] : []));
    expect(denied.filter((r) => r !== 'slow-down')).toHaveLength(10);
    expect(denied.filter((r) => r === 'slow-down')).toHaveLength(5);
  });
});

describe('teams', () => {
  /** Teams on: Ann and Al on team a (Red), Bea on team b (Blue). */
  function teams(over: Partial<HostState> = {}) {
    const g = setup();
    g.room.hostOpen();
    const st = (x: Partial<HostState> = {}) =>
      state({ teams: true, seats: [{ id: 'a', name: 'Red', color: '#ff0000' }, { id: 'b', name: 'Blue', color: '#0000ff' }], ...over, ...x });
    g.send({ t: 'state', state: st() });
    const join = (conn: string, seatId: string, name: string) => {
      const p = g.phone(conn);
      p.send({ t: 'join', seatId, name, device: `dev-${conn}` });
      return p;
    };
    const ann = join('ann', 'a', 'Ann');
    const al = join('al', 'a', 'Al');
    const bea = join('bea', 'b', 'Bea');
    const arm = (armId: number, x: Partial<HostState> = {}) => g.send({ t: 'state', state: st({ phase: 'armed', armId, clue: { text: 'Q?' }, ...x }) });
    const memberOf = (conn: string) => g.hostLast('phones')!.phones.find((p) => p.conn === conn)?.member;
    return { ...g, st, join, ann, al, bea, arm, memberOf };
  }

  it('the room says it knows teams, and the host state keeps teams on', () => {
    const g = teams();
    expect(g.host[0]).toMatchObject({ t: 'welcome', features: ['teams', 'wagers', 'free'] });
    expect(g.room.saved.state?.teams).toBe(true);
    expect(cleanState({ ...state(), teams: 'yes' })?.teams).toBeUndefined();
  });

  it('several phones join one team, each with their own name and token', () => {
    const g = teams();
    expect(g.ann.last('joined')).toEqual({ t: 'joined', seatId: 'a', token: expect.any(String), name: 'Ann' });
    expect(g.al.last('joined')).toMatchObject({ seatId: 'a', name: 'Al' });
    expect(g.ann.last('joined')!.token).not.toBe(g.al.last('joined')!.token);
    expect(g.al.last('view')?.view).toMatchObject({ teams: true, you: { id: 'a', name: 'Red', member: 'Al' } });
    // The host sees who is on which team.
    const phones = g.hostLast('phones')!.phones;
    expect(phones.filter((p) => p.seatId === 'a').map((p) => p.name)).toEqual(['Ann', 'Al']);
    expect(phones.find((p) => p.conn === 'bea')).toMatchObject({ seatId: 'b', name: 'Bea', connected: true, member: expect.any(String) });
    // A newcomer sees the teams (never taken) and who is on them.
    const n = g.phone('new');
    expect(n.last('seats')).toMatchObject({
      teams: true,
      allowNew: false,
      seats: [
        { id: 'a', taken: false, members: ['Ann', 'Al'] },
        { id: 'b', taken: false, members: ['Bea'] },
      ],
    });
  });

  it('checks a team join: the team must exist, a name is needed (cleaned and cut), names are unique', () => {
    const g = teams();
    const p = g.phone('x');
    p.send({ t: 'join', seatId: 'zz', name: 'Zed' });
    expect(p.last('denied')?.reason).toBe('unknown-seat');
    p.send({ t: 'join', seatId: 'a' });
    expect(p.last('denied')?.reason).toBe('need-name');
    p.send({ t: 'join', seatId: 'a', name: ' ​‮ ' });
    expect(p.last('denied')?.reason).toBe('need-name');
    p.send({ t: 'join', seatId: 'a', name: 42 });
    expect(p.last('joined')).toBeUndefined();
    p.send({ t: 'join', seatId: 'b', name: ' ann ' });
    expect(p.last('denied')?.reason).toBe('name-taken');
    p.send({ t: 'join', seatId: 'b', name: 'A'.repeat(100) });
    expect(Array.from(p.last('joined')!.name!)).toHaveLength(24);
    // No "I'm new" in teams: people join a team.
    const q = g.phone('y');
    q.send({ t: 'new', name: 'Newbie' });
    expect(q.last('denied')?.reason).toBe('no-new');
  });

  it('a name whose phone is gone can be taken over (the same person, their token lost)', () => {
    const g = teams();
    g.room.phoneClose('al');
    expect(g.hostLast('phones')!.phones.find((p) => p.name === 'Al')).toMatchObject({ connected: false, seatId: 'a' });
    const p = g.phone('al2');
    p.send({ t: 'join', seatId: 'b', name: 'Al' });
    expect(p.last('joined')).toMatchObject({ seatId: 'b', name: 'Al' });
    expect(g.hostLast('phones')!.phones.filter((x) => x.name === 'Al')).toHaveLength(1);
  });

  it('a team is in the queue once: its first buzz counts, and says who it was', () => {
    const g = teams();
    g.arm(1);
    g.t.now += 100;
    g.al.send({ t: 'buzz', armId: 1, reactMs: 90 });
    g.t.now += 20;
    g.ann.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.t.now += 10;
    g.bea.send({ t: 'buzz', armId: 1, reactMs: 120 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'a' });
    expect(g.hostLast('queue')!.queue.map((q) => [q.seatId, q.by])).toEqual([
      ['a', 'Al'],
      ['b', 'Bea'],
    ]);
    expect(g.hostAll('buzz')[0]).toMatchObject({ seatId: 'a', rank: 1, by: 'Al' });
    // Al answers; Ann hears her team is answering, by Al.
    expect(g.al.last('result')).toMatchObject({ outcome: 'first', by: 'Al', byYou: true });
    expect(g.ann.last('result')).toMatchObject({ outcome: 'first', by: 'Al', byYou: false });
    expect(g.al.last('view')!.view.answering).toEqual({ name: 'Red', color: '#ff0000', you: true, by: 'Al', byYou: true });
    expect(g.ann.last('view')!.view.answering).toMatchObject({ you: true, by: 'Al', byYou: false });
    expect(g.bea.last('view')!.view.answering).toMatchObject({ name: 'Red', you: false, by: 'Al', byYou: false });
    // A teammate buzzing once it's decided doesn't add a place.
    g.ann.clear();
    g.t.now += 300;
    g.ann.send({ t: 'buzz', armId: 1, reactMs: 100 });
    expect(g.room.saved.race!.queue).toHaveLength(2);
    expect(g.ann.last('result')).toMatchObject({ outcome: 'first', by: 'Al', byYou: false });
  });

  it('while the room is still collecting, a teammate who reacted faster is the team’s time', () => {
    const g = teams();
    g.arm(1);
    g.t.now += 300;
    g.ann.send({ t: 'buzz', armId: 1, reactMs: 280 });
    g.t.now += 10;
    g.bea.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.t.now += 10;
    g.al.send({ t: 'buzz', armId: 1, reactMs: 150 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('a');
    expect(g.hostLast('queue')!.queue.map((q) => [q.seatId, q.by])).toEqual([
      ['a', 'Al'],
      ['b', 'Bea'],
    ]);
  });

  it('a wrong answer locks the whole team out; an early buzz only the one who jumped', () => {
    const g = teams();
    g.send({ t: 'state', state: g.st({ phase: 'closed', armId: 1, clue: { text: 'Q?' } }) });
    g.ann.send({ t: 'buzz', armId: 1 });
    expect(g.ann.last('result')).toMatchObject({ outcome: 'early' });
    g.arm(2);
    g.t.now += 100;
    g.ann.send({ t: 'buzz', armId: 2, reactMs: 60 });
    expect(g.ann.last('result')).toMatchObject({ outcome: 'locked' });
    // Al wasn't early: he buzzes for the team.
    g.al.send({ t: 'buzz', armId: 2, reactMs: 80 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('a');
    // Wrong: team a is out; the buzzers open again for the rest.
    g.arm(3, { lockedOut: ['a'] });
    g.t.now += 1000;
    g.ann.send({ t: 'buzz', armId: 3, reactMs: 60 });
    expect(g.ann.last('result')).toMatchObject({ outcome: 'locked' });
    expect(g.ann.last('view')!.view.you?.lockedOut).toBe(true);
    g.bea.send({ t: 'buzz', armId: 3, reactMs: 80 });
    g.tick(MAX_GRACE_MS);
    expect(g.room.saved.state?.answering).toBe('b');
  });

  it('a member comes back with their token, on the team the host moved them to', () => {
    const g = teams();
    const token = g.al.last('joined')!.token;
    const id = g.memberOf('al')!;
    g.send({ t: 'move', member: id, seatId: 'b' });
    expect(g.al.last('joined')).toEqual({ t: 'joined', seatId: 'b', token, name: 'Al' });
    expect(g.al.last('view')!.view.you).toMatchObject({ id: 'b', name: 'Blue', member: 'Al' });
    // Unknown members or teams are ignored.
    g.send({ t: 'move', member: id, seatId: 'nope' });
    g.send({ t: 'move', member: 'nobody', seatId: 'a' });
    expect(g.room.saved.members![id].seatId).toBe('b');
    // A reload: the token (with the team it had saved) brings Al back on Blue.
    g.room.phoneClose('al');
    const back = g.phone('al-again');
    back.send({ t: 'join', seatId: 'a', token });
    expect(back.last('joined')).toMatchObject({ seatId: 'b', name: 'Al', token });
    const other = g.phone('guess');
    other.send({ t: 'join', seatId: 'a', token: 'made-up' });
    expect(other.last('denied')?.reason).toBe('bad-token');
  });

  it('someone moved after buzzing gets no second place for their new team on that clue', () => {
    const g = teams();
    g.arm(1);
    g.al.send({ t: 'buzz', armId: 1, reactMs: 200 });
    g.tick(MAX_GRACE_MS);
    g.send({ t: 'move', member: g.memberOf('al')!, seatId: 'b' });
    g.al.send({ t: 'buzz', armId: 1, reactMs: 300 });
    expect(g.al.last('result')?.outcome).toBe('late');
    expect(g.room.saved.race!.queue.map((b) => b.seatId)).toEqual(['a']);
    // Bea, on Blue all along, still can.
    g.bea.send({ t: 'buzz', armId: 1, reactMs: 300 });
    expect(g.room.saved.race!.queue.map((b) => b.seatId)).toEqual(['a', 'b']);
  });

  it('the host kicks one member (kept off that team a while) or a whole team', () => {
    const g = teams();
    const id = g.memberOf('al')!;
    g.send({ t: 'kick', seatId: 'a', member: id });
    expect(g.al.last('kicked')).toBeDefined();
    expect(g.ann.last('kicked')).toBeUndefined();
    expect(g.room.saved.members![id]).toBeUndefined();
    g.al.send({ t: 'join', seatId: 'a', name: 'Al', device: 'dev-al' });
    expect(g.al.last('denied')?.reason).toBe('blocked');
    g.al.send({ t: 'join', seatId: 'b', name: 'Al', device: 'dev-al' });
    expect(g.al.last('joined')).toMatchObject({ seatId: 'b' });
    // A member id that isn't on that team does nothing.
    g.send({ t: 'kick', seatId: 'a', member: g.memberOf('bea') });
    expect(g.bea.last('kicked')).toBeUndefined();
    // The whole team.
    g.send({ t: 'kick', seatId: 'a' });
    expect(g.ann.last('kicked')).toBeDefined();
    expect(Object.values(g.room.saved.members!).map((m) => m.name)).toEqual(['Bea', 'Al']);
    g.t.now += KICK_BLOCK_MS + 1;
    g.ann.send({ t: 'join', seatId: 'a', name: 'Ann', device: 'dev-ann' });
    expect(g.ann.last('joined')).toMatchObject({ seatId: 'a' });
  });

  it('leaving, a team removed from the game, and teams turned off let members go', () => {
    const g = teams();
    g.bea.send({ t: 'leave' });
    expect(Object.values(g.room.saved.members!).map((m) => m.name)).toEqual(['Ann', 'Al']);
    expect(g.bea.last('seats')).toBeDefined();
    // Team a leaves the game: its members are back to the list.
    g.send({ t: 'state', state: g.st({ seats: [{ id: 'b', name: 'Blue', color: '#0000ff' }] }) });
    expect(g.room.saved.members).toEqual({});
    expect(g.ann.last('seats')?.seats.map((s) => s.id)).toEqual(['b']);
    // Teams off: phones pick a player again (no names, a seat each).
    g.ann.send({ t: 'join', seatId: 'b', name: 'Ann' });
    g.send({ t: 'state', state: state() });
    expect(g.room.saved.members).toEqual({});
    expect(g.ann.last('seats')).toMatchObject({ seats: [{ id: 'a', taken: false }, { id: 'b' }, { id: 'c' }] });
    expect(g.ann.last('seats')?.teams).toBeUndefined();
    g.ann.send({ t: 'join', seatId: 'a' });
    expect(g.ann.last('joined')).toMatchObject({ seatId: 'a' });
    expect(g.ann.last('joined')?.name).toBeUndefined();
  });

  it('solo seats are untouched when teams are off (no names, one phone a seat)', () => {
    const g = game();
    expect(g.pa.last('joined')).toEqual({ t: 'joined', seatId: 'a', token: expect.any(String) });
    const p = g.phone('x');
    p.send({ t: 'join', seatId: 'a', name: 'Ann' });
    expect(p.last('denied')?.reason).toBe('taken');
    g.arm(1);
    g.t.now += 100;
    g.pa.send({ t: 'buzz', armId: 1, reactMs: 80 });
    g.tick(MAX_GRACE_MS);
    expect(g.hostLast('queue')!.queue[0]).toEqual({ seatId: 'a', afterMs: 0 });
    expect(g.pa.last('result')?.by).toBeUndefined();
    expect(g.pa.last('view')!.view.teams).toBeUndefined();
  });

  it('keeps at most MAX_MEMBERS members: the ones gone longest make room', () => {
    const g = teams();
    g.room.phoneClose('ann');
    for (let i = 0; i < MAX_MEMBERS; i++) {
      g.t.now += 1;
      const p = g.join(`m${i}`, 'b', `M${i}`);
      g.room.phoneClose(p.conn);
    }
    const names = Object.values(g.room.saved.members!).map((m) => m.name);
    expect(names).toHaveLength(MAX_MEMBERS);
    expect(names).not.toContain('Ann');
    expect(names).toContain('Bea');
  });
});

describe('wagers', () => {
  const final = (x: Partial<NonNullable<HostState['wager']>> = {}): HostState['wager'] => ({
    id: 'final:r9',
    kind: 'final',
    open: true,
    seats: [
      { id: 'a', max: 100 },
      { id: 'b', max: 50 },
    ],
    ...x,
  });
  /** Everything a phone or the host was sent, as text (to look for amounts that mustn't be there). */
  const said = (msgs: unknown[]) => JSON.stringify(msgs);

  it('a phone in the round sends its wager: the host hears it, that phone sees it, nobody else hears the amount', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    expect(g.pa.last('view')!.view.wager).toEqual({ id: 'final:r9', kind: 'final', open: true, mine: true, max: 100 });
    // Cat isn't in this Final: she sits it out.
    expect(g.pc.last('view')!.view.wager).toEqual({ id: 'final:r9', kind: 'final', open: true, mine: false });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 7321 });
    expect(g.pa.last('wagered')).toEqual({ t: 'wagered', id: 'final:r9', ok: true, amount: 7321 });
    expect(g.hostLast('wager')).toEqual({ t: 'wager', id: 'final:r9', seatId: 'a', amount: 7321, n: 1 });
    expect(g.pa.last('view')!.view.wager).toMatchObject({ mine: true, amount: 7321, sent: true });
    // The other phones (and anyone not seated) never get it.
    const viewer = g.phone('viewer');
    for (const p of [g.pb, g.pc, viewer]) expect(said(p.msgs())).not.toContain('7321');
    expect(said(g.hostAll('phones'))).not.toContain('7321');
    // Changed before the host locks it: the host hears the new one (n counts up).
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 50 });
    expect(g.hostLast('wager')).toMatchObject({ seatId: 'a', amount: 50, n: 2 });
  });

  it('refuses a wager when none is asked, for another round, from a seat not in it, or once locked', () => {
    const g = game();
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 10 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: false, reason: 'closed' });
    g.send({ t: 'state', state: state({ wager: final() }) });
    g.pa.send({ t: 'wager', id: 'final:other', amount: 10 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: false, reason: 'closed' });
    g.pc.send({ t: 'wager', id: 'final:r9', amount: 10 });
    expect(g.pc.last('wagered')).toMatchObject({ ok: false, reason: 'closed' });
    const viewer = g.phone('viewer');
    viewer.send({ t: 'wager', id: 'final:r9', amount: 10 });
    expect(viewer.last('wagered')).toMatchObject({ ok: false, reason: 'closed' });
    expect(g.hostAll('wager')).toHaveLength(0);
    // Sent, then the host shows the question: locked. The phone still sees what was locked in.
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 40 });
    g.send({ t: 'state', state: state({ wager: final({ open: false, seats: [{ id: 'a', max: 100, amount: 40, got: 1 }, { id: 'b', max: 50 }] }) }) });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 90 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: false, reason: 'closed' });
    expect(g.pa.last('view')!.view.wager).toMatchObject({ open: false, mine: true, amount: 40, sent: true });
    expect(g.hostAll('wager')).toHaveLength(1);
  });

  it('checks the amount: a whole number from 0 to WAGER_MAX; over the max only when the host holds to it', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    for (const amount of [-1, 1.5, 'lots', null, 1e10, Number.MAX_SAFE_INTEGER]) {
      g.pa.send({ t: 'wager', id: 'final:r9', amount });
      expect(g.pa.last('wagered')).toMatchObject({ ok: false, reason: 'bad' });
    }
    // Over the max of 100: fine while the limit is off (the max is only shown)…
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 500 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: true, amount: 500 });
    // …refused with it on, saying the max.
    g.send({ t: 'state', state: state({ wager: final({ limit: true }) }) });
    expect(g.pa.last('view')!.view.wager).toMatchObject({ max: 100, limit: true });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 101 });
    expect(g.pa.last('wagered')).toEqual({ t: 'wagered', id: 'final:r9', ok: false, reason: 'over', max: 100 });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 0 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: true, amount: 0 });
  });

  it('limits how often a phone sends one', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    for (let i = 0; i < WAGER_RATE; i++) g.pa.send({ t: 'wager', id: 'final:r9', amount: i });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 99 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: false, reason: 'slow' });
    g.t.now += WAGER_WINDOW_MS;
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 99 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: true });
  });

  it('a phone wager the host took, then cleared (an emptied box, an undo), no longer shows on the phone', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 500 });
    g.send({ t: 'state', state: state({ wager: final({ seats: [{ id: 'a', max: 1000, amount: 500, got: 1 }, { id: 'b', max: 50 }] }) }) });
    expect(g.pa.last('view')!.view.wager).toMatchObject({ amount: 500, sent: true });
    g.send({ t: 'state', state: state({ wager: final({ seats: [{ id: 'a', max: 1000, got: 1 }, { id: 'b', max: 50 }] }) }) });
    const w = g.pa.last('view')!.view.wager!;
    expect(w.amount).toBeUndefined();
    expect(w.sent).toBeUndefined();
    // Sending one again counts.
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 300 });
    expect(g.pa.last('view')!.view.wager).toMatchObject({ amount: 300, sent: true });
  });

  it("the host's own amount wins on the phone once the host changed it; a new round forgets what was sent", () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 80 });
    g.send({ t: 'state', state: state({ wager: final({ seats: [{ id: 'a', max: 100, amount: 30, fromHost: true, got: 1 }, { id: 'b', max: 50 }] }) }) });
    expect(g.pa.last('view')!.view.wager).toEqual({ id: 'final:r9', kind: 'final', open: true, mine: true, max: 100, amount: 30, host: true });
    // Sent again: theirs again (n goes on from what the host took).
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 70 });
    expect(g.hostLast('wager')).toMatchObject({ amount: 70, n: 2 });
    // The host takes Ann out of the round: what she sent goes.
    g.send({ t: 'state', state: state({ wager: final({ seats: [{ id: 'b', max: 50 }] }) }) });
    expect(g.room.saved.wagers?.seats.a).toBeUndefined();
    g.send({ t: 'state', state: state({ wager: final() }) });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 5 });
    g.send({ t: 'state', state: state({ wager: { id: 'dd:x', kind: 'dd', open: true, seats: [{ id: 'b', max: 1000 }] } }) });
    expect(g.room.saved.wagers).toMatchObject({ id: 'dd:x', seats: {} });
    g.send({ t: 'state', state: state() });
    expect(g.room.saved.wagers).toBeUndefined();
    expect(g.pa.last('view')!.view.wager).toBeUndefined();
  });

  it('a Daily Double: its player wagers; the other phones see who is wagering, not the amount', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: { id: 'dd:c1:b', kind: 'dd', open: true, seats: [{ id: 'b', max: 1000 }] } }) });
    expect(g.pa.last('view')!.view.wager).toEqual({ id: 'dd:c1:b', kind: 'dd', open: true, mine: false, who: 'Bob' });
    g.pb.send({ t: 'wager', id: 'dd:c1:b', amount: 4242 });
    expect(g.hostLast('wager')).toMatchObject({ id: 'dd:c1:b', seatId: 'b', amount: 4242 });
    expect(said(g.pa.msgs())).not.toContain('4242');
    g.pa.send({ t: 'wager', id: 'dd:c1:b', amount: 1 });
    expect(g.pa.last('wagered')).toMatchObject({ ok: false, reason: 'closed' });
  });

  it('a wager sent while the host is away reaches it when it is back, unless it took it already', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    g.room.hostClose();
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 60 });
    expect(g.hostAll('wager')).toHaveLength(0);
    g.room.hostOpen();
    expect(g.hostLast('wager')).toMatchObject({ seatId: 'a', amount: 60, n: 1 });
    // The host took it (got 1): back again, it isn't sent twice.
    g.send({ t: 'state', state: state({ wager: final({ seats: [{ id: 'a', max: 100, amount: 60, got: 1 }, { id: 'b', max: 50 }] }) }) });
    g.room.hostClose();
    g.room.hostOpen();
    expect(g.hostAll('wager')).toHaveLength(1);
  });

  it('a phone back after a reload sees its own wager again', () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final() }) });
    g.pa.send({ t: 'wager', id: 'final:r9', amount: 25 });
    const token = g.pa.last('joined')!.token;
    g.room.phoneClose('pa');
    const again = g.phone('pa2');
    again.send({ t: 'join', seatId: 'a', token });
    expect(again.last('view')!.view.wager).toMatchObject({ mine: true, amount: 25, sent: true });
  });

  it('teams: one wager per team, any member sends it, every member sees it and who sent it', () => {
    const g = setup();
    g.room.hostOpen();
    const st = (x: Partial<HostState> = {}) => state({ teams: true, seats: [{ id: 'a', name: 'Red', color: '#ff0000' }, { id: 'b', name: 'Blue', color: '#0000ff' }], ...x });
    g.send({ t: 'state', state: st() });
    const join = (conn: string, seatId: string, name: string) => {
      const p = g.phone(conn);
      p.send({ t: 'join', seatId, name });
      return p;
    };
    const ann = join('ann', 'a', 'Ann');
    const al = join('al', 'a', 'Al');
    const bea = join('bea', 'b', 'Bea');
    g.send({ t: 'state', state: st({ wager: final() }) });
    al.send({ t: 'wager', id: 'final:r9', amount: 3131 });
    expect(g.hostLast('wager')).toEqual({ t: 'wager', id: 'final:r9', seatId: 'a', amount: 3131, n: 1, by: 'Al' });
    expect(ann.last('view')!.view.wager).toMatchObject({ amount: 3131, sent: true, by: 'Al', byYou: false });
    expect(al.last('view')!.view.wager).toMatchObject({ amount: 3131, by: 'Al', byYou: true });
    expect(said(bea.msgs())).not.toContain('3131');
    // A teammate changes it: still one wager for the team.
    ann.send({ t: 'wager', id: 'final:r9', amount: 10 });
    expect(g.hostLast('wager')).toMatchObject({ seatId: 'a', amount: 10, n: 2, by: 'Ann' });
    expect(al.last('view')!.view.wager).toMatchObject({ amount: 10, by: 'Ann', byYou: false });
    expect(Object.keys(g.room.saved.wagers!.seats)).toEqual(['a']);
  });

  it('teams: someone who joins a team after the wagers began is told one is in, not how much', () => {
    const g = setup();
    g.room.hostOpen();
    const st = (x: Partial<HostState> = {}) => state({ teams: true, seats: [{ id: 'a', name: 'Red', color: '#ff0000' }, { id: 'b', name: 'Blue', color: '#0000ff' }], ...x });
    g.send({ t: 'state', state: st() });
    const join = (conn: string, seatId: string, name: string) => {
      const p = g.phone(conn);
      p.send({ t: 'join', seatId, name });
      return p;
    };
    const ann = join('ann', 'a', 'Ann');
    g.send({ t: 'state', state: st({ wager: final() }) });
    ann.send({ t: 'wager', id: 'final:r9', amount: 4747 });
    // The host takes it.
    g.send({ t: 'state', state: st({ wager: final({ seats: [{ id: 'a', max: 100, amount: 4747, got: 1 }, { id: 'b', max: 50 }] }) }) });
    g.t.now += 1000;
    // Bea from Blue changes her name and joins Red to read their wager: she sees one is in, never the amount.
    const spy = join('spy', 'a', 'Bea');
    expect(spy.last('view')!.view.wager).toMatchObject({ mine: true, hidden: true });
    expect(said(spy.msgs())).not.toContain('4747');
    // Nor what Ann sends after Bea joined (it's still a teammate's, not hers).
    g.t.now += 1000;
    ann.send({ t: 'wager', id: 'final:r9', amount: 999 });
    expect(ann.last('view')!.view.wager).toMatchObject({ amount: 999 });
    expect(spy.last('view')!.view.wager).toMatchObject({ mine: true, hidden: true });
    expect(said(spy.msgs())).not.toContain('999');
    // Ann (on it before) still sees it; what the newcomer sends herself, she sees.
    spy.send({ t: 'wager', id: 'final:r9', amount: 12 });
    expect(spy.last('view')!.view.wager).toMatchObject({ amount: 12, byYou: true });
    expect(ann.last('view')!.view.wager).toMatchObject({ amount: 12, by: 'Bea' });
    // A reload (with her token) doesn't make her an old member; a new round counts her in.
    g.send({ t: 'state', state: st({ wager: final({ id: 'final:r10' }) }) });
    expect(spy.last('view')!.view.wager).toEqual({ id: 'final:r10', kind: 'final', open: true, mine: true, max: 100 });
  });

  it("a seat taken after the wagers began doesn't show the host's amount for it", () => {
    const g = game();
    g.send({ t: 'state', state: state({ wager: final({ seats: [{ id: 'a', max: 100, amount: 6565, fromHost: true }] }) }) });
    expect(g.pa.last('view')!.view.wager).toMatchObject({ amount: 6565, host: true });
    g.pa.send({ t: 'leave' });
    g.t.now += 1000;
    const other = g.phone('other');
    other.send({ t: 'join', seatId: 'a' });
    expect(other.last('view')!.view.wager).toMatchObject({ mine: true, hidden: true });
    expect(said(other.msgs())).not.toContain('6565');
    // Coming back with the seat's token (a reload) is the same claim: nothing changes.
    const token = other.last('joined')!.token;
    const again = g.phone('again');
    again.send({ t: 'join', seatId: 'a', token });
    expect(again.last('view')!.view.wager).toMatchObject({ hidden: true });
  });

  it('cleans the wager round in the host state', () => {
    const w = cleanState({
      ...state(),
      wager: {
        id: 'final:r9',
        kind: 'final',
        open: 1,
        limit: true,
        seats: [{ id: 'a', max: 1e12, amount: -5, fromHost: 'yes', got: 2 }, { id: 'zzz', max: 1 }, { id: 'a', max: 3 }, 'x', { id: 'b', max: 'x', amount: 7, fromHost: true }],
      },
    })?.wager;
    expect(w).toEqual({ id: 'final:r9', kind: 'final', open: false, limit: true, seats: [{ id: 'a', max: 1e9, got: 2 }, { id: 'b', max: 0, amount: 7, fromHost: true }] });
    expect(cleanState({ ...state(), wager: { id: 'x', kind: 'other', open: true, seats: [] } })?.wager).toBeUndefined();
    expect(cleanState({ ...state(), wager: { id: 'x'.repeat(101), kind: 'dd', open: true, seats: [] } })?.wager).toBeUndefined();
  });
});
