import { describe, expect, it } from 'vitest';
import type { HostState, RoomToHost, RoomToPhone } from '../../src/lib/buzzproto';
import { cleanState, MAX_PHONES, Room, type PhoneSaved, type RoomSaved } from './room';

const seats = [
  { id: 'a', name: 'Ann', color: '#ff0000' },
  { id: 'b', name: 'Bob', color: '#00ff00' },
  { id: 'c', name: 'Cat', color: '#0000ff' },
];

function state(over: Partial<HostState> = {}): HostState {
  return { title: 'Quiz night', seats, allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 1000, scores: { a: 100 }, ...over };
}

/** A room with a clock, counting tokens and inboxes for the host and each phone. */
function setup(saved?: RoomSaved, phonesSaved: PhoneSaved[] = []) {
  const t = { now: 10_000 };
  let n = 0;
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
  return { t, room, host, hostLast, send, phone, phoneOf, phoneSaves, saves: () => saves };
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

describe('the race', () => {
  it('the first buzz wins: the room moves to answering and tells everyone', () => {
    const g = game();
    g.arm(1);
    g.t.now += 300;
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'first', rank: 1, afterMs: 0 });
    expect(g.hostLast('buzz')).toEqual({ t: 'buzz', armId: 1, seatId: 'b', rank: 1, afterMs: 0 });
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'b' });
    expect(g.pa.last('view')?.view.answering).toEqual({ name: 'Bob', color: '#00ff00', you: false });
    expect(g.pb.last('view')?.view.answering?.you).toBe(true);
  });

  it('later buzzes in the same arm are ranked for the host and late for the phone', () => {
    const g = game();
    g.arm(1);
    g.pb.send({ t: 'buzz', armId: 1 });
    g.t.now += 40;
    g.pa.send({ t: 'buzz', armId: 1 });
    g.t.now += 25;
    g.pc.send({ t: 'buzz', armId: 1 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 2, afterMs: 40 });
    expect(g.pc.last('result')).toEqual({ t: 'result', armId: 1, outcome: 'late', rank: 3, afterMs: 65 });
    expect(g.host.filter((m) => m.t === 'buzz').map((m) => (m as { seatId: string }).seatId)).toEqual(['b', 'a', 'c']);
    expect(g.room.saved.state?.answering).toBe('b');
  });

  it('counts one buzz per seat per arm', () => {
    const g = game();
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.pa.clear();
    g.pa.send({ t: 'buzz', armId: 1 });
    g.pb.send({ t: 'buzz', armId: 1 });
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pa.msgs()).toEqual([]);
    expect(g.host.filter((m) => m.t === 'buzz')).toHaveLength(2);
  });

  it('a buzz for an old arm is late and never counts', () => {
    const g = game();
    g.arm(2);
    g.pa.send({ t: 'buzz', armId: 1 });
    expect(g.pa.last('result')?.outcome).toBe('late');
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
    expect(g.room.saved.state?.phase).toBe('armed');
  });

  it('the winner stands when the host re-sends armed with the same armId; bumping armId reopens', () => {
    const g = game();
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.arm(1, { scores: { a: 5 } }); // the host hadn't seen the buzz yet
    expect(g.room.saved.state).toMatchObject({ phase: 'answering', answering: 'a', scores: { a: 5 } });
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')?.outcome).toBe('late');
    // Ann was wrong: the host re-arms with a new armId and locks her out.
    g.arm(2, { lockedOut: ['a'] });
    expect(g.room.saved.state?.phase).toBe('armed');
    g.pa.send({ t: 'buzz', armId: 2 });
    expect(g.pa.last('result')).toEqual({ t: 'result', armId: 2, outcome: 'locked' });
    expect(g.pa.last('view')?.view.you?.lockedOut).toBe(true);
    g.pb.send({ t: 'buzz', armId: 2 });
    expect(g.pb.last('result')?.outcome).toBe('first');
    expect(g.hostLast('buzz')).toMatchObject({ armId: 2, seatId: 'b', rank: 1 });
  });

  it('the host may take the answer back to closed or the lobby; buzzes then are early or ignored', () => {
    const g = game();
    g.arm(1);
    g.pa.send({ t: 'buzz', armId: 1 });
    g.send({ t: 'state', state: state({ phase: 'closed', armId: 1, clue: { text: 'Q?' } }) });
    g.pb.send({ t: 'buzz', armId: 1 });
    expect(g.pb.last('result')?.outcome).toBe('early');
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
