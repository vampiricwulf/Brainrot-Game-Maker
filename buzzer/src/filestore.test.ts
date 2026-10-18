import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FileLimits, HostCard, HostState, RoomToHost } from '../../src/lib/buzzproto';
import { FILE_PART_BYTES, FileStore, SENDS_AT_ONCE, UPLOADS_AT_ONCE, type FileRoom, type PieceSource, type Took } from './filestore';
import { FILE_MAKE_ROOM_MS } from './limits';
import { Room, type RoomFile } from './room';

const MB = 1024 * 1024;
/** Small limits, so the files here stay small: 4 MB a file, 10 MB a room. */
const LIMITS: FileLimits = { fileBytes: 4 * MB, roomBytes: 10 * MB, roomFiles: 32 };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const tick = () => new Promise((r) => setTimeout(r, 0));

function later<T = void>() {
  let ok!: (v: T) => void;
  const p = new Promise<T>((r) => (ok = r));
  return { p, ok };
}

/**
 * An upload's body: `bytes` in whole pieces. pauseAt: it waits before giving piece n until go() (atPause says it got
 * there); breakAt: it breaks off before piece n. Counts the pieces it gave out.
 */
function body(bytes: Uint8Array, o: { pauseAt?: number; breakAt?: number } = {}) {
  let given = 0;
  let cancelled = false;
  const pause = later();
  const reached = later();
  const src: PieceSource & { given: () => number; cancelled: () => boolean; go: () => void; atPause: Promise<void> } = {
    given: () => given,
    cancelled: () => cancelled,
    go: () => pause.ok(),
    atPause: reached.p,
    async next() {
      if (cancelled) throw new Error('cancelled');
      if (o.pauseAt === given) {
        reached.ok();
        await pause.p;
        if (cancelled) throw new Error('cancelled');
      }
      if (o.breakAt === given) throw new Error('broke off');
      const at = given * FILE_PART_BYTES;
      if (at >= bytes.length) return null;
      given++;
      return bytes.slice(at, at + FILE_PART_BYTES);
    },
    cancel: () => void (cancelled = true),
  };
  return src;
}

const seats = [{ id: 'a', name: 'Ann', color: '#ff0000' }];
const state = (cards?: HostCard[]): HostState => ({ title: 'Q', seats, allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 0, scores: {}, ...(cards ? { cards } : {}) });
const cardWith = (file: string): HostCard => ({ id: 'pc:c1:1:1', to: [{ seat: 'a' }], open: true, text: 'SHREK', media: [{ kind: 'image', file, mime: 'image/png' }] });

/**
 * A FileStore over fake storage (counting the bytes it holds at any moment, and the pieces given out and not yet
 * stored) and a real room, with a daily budget that can be held up or refuse.
 */
function setup(limits: FileLimits = LIMITS) {
  const t = { now: 1_000_000 };
  const stored = new Map<string, Uint8Array>();
  const s = { bytes: 0, most: 0, puts: [] as string[], drops: [] as { prefix: string; parts: number }[], putFails: false, missing: new Set<string>() };
  const drop = (prefix: string, parts: number) => {
    s.drops.push({ prefix, parts });
    for (let i = 0; i < parts; i++) {
      const v = stored.get(`${prefix}:${i}`);
      if (v) s.bytes -= v.byteLength;
      stored.delete(`${prefix}:${i}`);
    }
  };
  const host: RoomToHost[] = [];
  let n = 0;
  const makeRoom = () =>
    new Room('BCDF', {
      now: () => t.now,
      token: () => `token-${++n}`,
      toHost: (m) => host.push(m),
      toPhone: () => {},
      saveRoom: () => {},
      savePhone: () => {},
      dropPhone: () => {},
      schedule: () => 0,
      cancel: () => {},
      dropFiles: (files) => files.forEach((f) => drop(f.prefix, f.parts)),
      cleanupAt: () => {},
      limits,
    });
  const r = { room: makeRoom(), epoch: 0 };
  r.room.hostOpen(true);
  r.room.hostMessage(JSON.stringify({ t: 'state', state: state() }));
  const budget = { used: 0, took: [] as number[], refunds: [] as { n: number; ticket: unknown }[], refuse: null as Took | null, hold: null as Promise<void> | null, asked: later() };
  let prefixes = 0;
  const store = new FileStore({
    limits: () => limits,
    put: async (key, piece) => {
      await tick();
      if (s.putFails) throw new Error('storage');
      s.puts.push(key);
      stored.set(key, piece);
      s.bytes += piece.byteLength;
      s.most = Math.max(s.most, s.bytes);
    },
    get: async (key) => {
      await tick();
      const v = stored.get(key);
      return v && !s.missing.has(key) ? new Uint8Array(v) : undefined;
    },
    drop,
    prefix: () => `p:u${++prefixes}`,
    hasher: () => {
      const h = createHash('sha256');
      return { write: async (b) => void h.update(b), hex: async () => h.digest('hex') };
    },
    take: async (_who, bytes) => {
      budget.asked.ok();
      if (budget.hold) await budget.hold;
      if (budget.refuse) return budget.refuse;
      budget.used += bytes;
      budget.took.push(bytes);
      return { ok: true, ticket: 'today' };
    },
    refund: async (_who, bytes, ticket) => {
      budget.used -= bytes;
      budget.refunds.push({ n: bytes, ticket });
    },
    busyText: (took) => `busy: ${took}`,
  });
  /** The room as BuzzRoom passes it: null once it ended, or a new room took its code. */
  const roomNow = (epoch = r.epoch) => (): FileRoom | null => (r.epoch === epoch ? r.room : null);
  const upload = (b: PieceSource, size: number | null, mime = 'video/mp4') => store.upload({ mime, size, who: '198.51.100.1', body: b, room: roomNow() });
  return { t, stored, s, host, r, budget, store, upload, roomNow, makeRoom, files: () => r.room.saved.files ?? {} };
}

describe('uploads', () => {
  it('a file with its size: its pieces under one prefix of its own, listed once with it, today’s budget taken for it', async () => {
    const g = setup();
    const bytes = randomBytes(2.5 * MB);
    const b = body(bytes);
    expect(await g.upload(b, bytes.length)).toEqual({ status: 200, id: sha(bytes) });
    expect(g.s.puts).toEqual(['p:u1:0', 'p:u1:1', 'p:u1:2']);
    expect(g.files()[sha(bytes)]).toMatchObject({ mime: 'video/mp4', bytes: bytes.length, parts: 3, key: 'p:u1' });
    expect(g.r.room.saved.uploads).toBeUndefined();
    expect(g.budget.took).toEqual([bytes.length]);
    expect(g.budget.refunds).toEqual([]);
    expect(g.host.filter((m) => m.t === 'files' && m.ids.includes(sha(bytes)))).toHaveLength(1);
    expect(Buffer.concat([0, 1, 2].map((i) => g.stored.get(`p:u1:${i}`)!)).equals(bytes)).toBe(true);
  });

  it('one that doesn’t say its size keeps room for a whole file limit, and gives back what it didn’t use', async () => {
    const g = setup();
    const bytes = randomBytes(1.5 * MB);
    expect(await g.upload(body(bytes), null)).toEqual({ status: 200, id: sha(bytes) });
    expect(g.budget.took).toEqual([LIMITS.fileBytes]);
    expect(g.budget.refunds).toEqual([{ n: LIMITS.fileBytes - bytes.length, ticket: 'today' }]);
    expect(g.budget.used).toBe(bytes.length);
  });

  it('too big: refused at once when it says so; past the limit without a size, or past its size, its pieces go and the budget comes back', async () => {
    const g = setup();
    const big = body(randomBytes(LIMITS.fileBytes + 1));
    expect(await g.upload(big, LIMITS.fileBytes + 1)).toEqual({ status: 413, error: 'Too big for phones (4 MB at most)' });
    expect(big.cancelled()).toBe(true);
    expect(g.budget.took).toEqual([]);
    expect(await g.upload(body(randomBytes(LIMITS.fileBytes + 1)), null)).toEqual({ status: 413, error: 'Too big for phones (4 MB at most)' });
    expect(await g.upload(body(randomBytes(2 * MB + 1)), 2 * MB)).toEqual({ status: 400, error: 'The upload was longer than it said' });
    expect(g.stored.size).toBe(0);
    expect(g.budget.used).toBe(0);
    expect(g.r.room.saved.uploads).toBeUndefined();
    expect(g.files()).toEqual({});
  });

  it('nothing at all: 400', async () => {
    const g = setup();
    expect(await g.upload(body(new Uint8Array(0)), 0)).toEqual({ status: 400, error: 'empty file' });
    expect(await g.upload(body(new Uint8Array(0)), null)).toEqual({ status: 400, error: 'empty file' });
    expect(g.budget.used).toBe(0);
    expect(g.r.room.saved.uploads).toBeUndefined();
  });

  it('a body that breaks off, or ends short of its size: its pieces go and the budget comes back', async () => {
    const g = setup();
    expect(await g.upload(body(randomBytes(3 * MB), { breakAt: 2 }), 3 * MB)).toEqual({ status: 400, error: 'The upload broke off' });
    expect(g.s.puts).toHaveLength(2);
    expect(g.s.drops).toEqual([{ prefix: 'p:u1', parts: 2 }]);
    expect(await g.upload(body(randomBytes(2 * MB)), 3 * MB)).toEqual({ status: 400, error: 'The upload broke off' });
    expect(g.stored.size).toBe(0);
    expect(g.budget.used).toBe(0);
    expect(g.r.room.saved.uploads).toBeUndefined();
  });

  it('storage failing: 500, and what it wrote goes', async () => {
    const g = setup();
    g.s.putFails = true;
    expect(await g.upload(body(randomBytes(2 * MB)), 2 * MB)).toEqual({ status: 500, error: "The buzzer room couldn't store it" });
    expect(g.s.drops).toEqual([{ prefix: 'p:u1', parts: 1 }]);
    expect(g.budget.used).toBe(0);
    expect(g.r.room.saved.uploads).toBeUndefined();
  });

  it('today’s budget refused: nothing is written (the rest is read and thrown away, so the answer gets there), and the idle files that would have made room stay', async () => {
    const g = setup();
    const old = randomBytes(4 * MB);
    await g.upload(body(old), old.length);
    await g.upload(body(randomBytes(4 * MB)), 4 * MB);
    g.t.now += FILE_MAKE_ROOM_MS;
    const puts = g.s.puts.length;
    for (const [took, answer] of [
      ['busy', { status: 429, error: 'busy: busy' }],
      ['address', { status: 429, error: 'busy: address' }],
      ['off', { status: 503, error: "This buzzer server doesn't take files" }],
    ] as const) {
      g.budget.refuse = took;
      const b = body(randomBytes(4 * MB));
      expect(await g.upload(b, 4 * MB)).toEqual(answer);
      expect(b.given()).toBe(4);
    }
    expect(g.s.puts.length).toBe(puts);
    expect(Object.keys(g.files())).toHaveLength(2);
    expect(g.files()[sha(old)]).toBeDefined();
  });

  it('a full room: 409 before anything is taken or written', async () => {
    const g = setup();
    for (let i = 0; i < 2; i++) await g.upload(body(randomBytes(4 * MB)), 4 * MB);
    g.r.room.hostMessage(JSON.stringify({ t: 'state', state: state(Object.keys(g.files()).map((id, i) => ({ ...cardWith(id), id: `pc:c${i}:1:1` }))) }));
    g.t.now += FILE_MAKE_ROOM_MS;
    const b = body(randomBytes(4 * MB));
    expect(await g.upload(b, 4 * MB)).toEqual({ status: 409, error: 'This room holds all the card files it can: send fewer pictures and videos at once' });
    expect(b.given()).toBe(4);
    expect(g.s.puts).toHaveLength(8);
    expect(g.budget.took).toEqual([4 * MB, 4 * MB]);
    // (Read and thrown away up to a file's limit at most.)
    const endless: PieceSource = { next: async () => new Uint8Array(FILE_PART_BYTES), cancel: () => void (stopped = true) };
    let stopped = false;
    expect(await g.upload(endless, null)).toMatchObject({ status: 409 });
    expect(stopped).toBe(true);
  });

  it('idle files make room before the first piece is written: the room never holds more than its cap', async () => {
    const g = setup();
    const a = randomBytes(4 * MB);
    const b = randomBytes(4 * MB);
    await g.upload(body(a), a.length);
    await g.upload(body(b), b.length);
    g.t.now += FILE_MAKE_ROOM_MS;
    const c = randomBytes(4 * MB);
    expect(await g.upload(body(c), c.length)).toEqual({ status: 200, id: sha(c) });
    expect(Object.keys(g.files())).toEqual([sha(b), sha(c)]);
    expect(g.s.most).toBeLessThanOrEqual(LIMITS.roomBytes);
  });

  it('a file put on a card again while the budget is asked for isn’t deleted, and then the new one doesn’t fit: 409', async () => {
    const g = setup();
    const a = randomBytes(4 * MB);
    const b = randomBytes(4 * MB);
    await g.upload(body(a), a.length);
    await g.upload(body(b), b.length);
    // b is on a card; a isn't, so it's to make room.
    const onCard = (id: string) => ({ ...cardWith(id), id: `pc:${id.slice(0, 8)}:1:1` });
    g.r.room.hostMessage(JSON.stringify({ t: 'state', state: state([onCard(sha(b))]) }));
    g.t.now += FILE_MAKE_ROOM_MS;
    const hold = later();
    g.budget.hold = hold.p;
    g.budget.asked = later();
    const going = g.upload(body(randomBytes(4 * MB)), 4 * MB);
    await g.budget.asked.p;
    g.r.room.hostMessage(JSON.stringify({ t: 'state', state: state([onCard(sha(b)), onCard(sha(a))]) }));
    hold.ok();
    expect(await going).toEqual({ status: 409, error: 'This room holds all the card files it can: send fewer pictures and videos at once' });
    expect(Object.keys(g.files())).toEqual([sha(a), sha(b)]);
    expect(g.budget.used).toBe(8 * MB);
    expect(g.s.puts).toHaveLength(8);
  });

  it('the same file twice at once: stored once, the other’s pieces deleted and its budget given back, both told its id', async () => {
    const g = setup();
    const bytes = randomBytes(2 * MB);
    const both = await Promise.all([g.upload(body(bytes), bytes.length), g.upload(body(bytes), bytes.length)]);
    expect(both).toEqual([
      { status: 200, id: sha(bytes) },
      { status: 200, id: sha(bytes) },
    ]);
    expect(Object.keys(g.files())).toEqual([sha(bytes)]);
    expect(g.stored.size).toBe(2);
    expect(g.budget.used).toBe(bytes.length);
    expect(g.r.room.saved.uploads).toBeUndefined();
    // Again later: already here, nothing new kept.
    expect(await g.upload(body(bytes), bytes.length)).toEqual({ status: 200, id: sha(bytes) });
    expect(g.stored.size).toBe(2);
    expect(g.budget.used).toBe(bytes.length);
  });

  it('the room ending mid-upload: no piece written after, the budget given back, the room left alone (its wipe takes the rest)', async () => {
    const g = setup();
    const b = body(randomBytes(3 * MB), { pauseAt: 2 });
    const going = g.upload(b, 3 * MB);
    await b.atPause;
    const marked = { ...g.r.room.saved.uploads };
    g.r.epoch++;
    b.go();
    expect(await going).toEqual({ status: 401, error: 'wrong host token' });
    expect(g.s.puts).toEqual(['p:u1:0', 'p:u1:1']);
    expect(g.s.drops).toEqual([]);
    expect(g.r.room.saved.uploads).toEqual(marked);
    expect(g.budget.used).toBe(0);
  });

  it('abortAll (the room’s wipe) stops every upload reading', async () => {
    const g = setup();
    const b = body(randomBytes(3 * MB), { pauseAt: 1 });
    const going = g.upload(b, 3 * MB);
    await b.atPause;
    g.r.epoch++;
    g.store.abortAll();
    expect(b.cancelled()).toBe(true);
    b.go();
    expect(await going).toMatchObject({ status: 401 });
    expect(g.budget.used).toBe(0);
    // A new upload isn't held back by it.
    g.r.room = g.makeRoom();
    expect(await g.upload(body(randomBytes(MB)), MB)).toMatchObject({ status: 200 });
  });

  it('a new room under the same code never gets a file an upload began in the last one', async () => {
    const g = setup();
    const b = body(randomBytes(3 * MB), { pauseAt: 2 });
    const going = g.upload(b, 3 * MB);
    await b.atPause;
    g.r.room = g.makeRoom();
    g.r.epoch++;
    b.go();
    expect(await going).toMatchObject({ status: 401 });
    expect(g.r.room.saved.files).toBeUndefined();
    expect(g.r.room.saved.uploads).toBeUndefined();
  });

  it('two at once per room: a third gets 429', async () => {
    const g = setup();
    const held = [body(randomBytes(MB), { pauseAt: 0 }), body(randomBytes(MB), { pauseAt: 0 })];
    const going = held.map((b) => g.upload(b, MB));
    await Promise.all(held.map((b) => b.atPause));
    expect(UPLOADS_AT_ONCE).toBe(2);
    const third = body(randomBytes(MB));
    expect(await g.upload(third, MB)).toEqual({ status: 429, error: 'The buzzer room is taking another file: try again in a moment' });
    expect(third.given()).toBe(1);
    held.forEach((b) => b.go());
    expect((await Promise.all(going)).map((r) => r.status)).toEqual([200, 200]);
    expect(await g.upload(body(randomBytes(MB)), MB)).toMatchObject({ status: 200 });
  });

  it('two at once count against the room’s caps together', async () => {
    const g = setup();
    const first = body(randomBytes(4 * MB), { pauseAt: 1 });
    const going = g.upload(first, 4 * MB);
    await first.atPause;
    await g.upload(body(randomBytes(4 * MB)), 4 * MB);
    // 4 + 4 here, 4 on its way: no room for 3 more.
    expect(await g.upload(body(randomBytes(3 * MB)), 3 * MB)).toMatchObject({ status: 409 });
    first.go();
    expect(await going).toMatchObject({ status: 200 });
  });

  it('a file of any size holds at most 2 pieces in memory: one being read, one being stored', async () => {
    const g = setup({ ...LIMITS, fileBytes: 10 * MB });
    const bytes = randomBytes(10 * MB);
    const b = body(bytes);
    let most = 0;
    const counted: PieceSource = {
      next: () => {
        // (Asked for the next piece: the ones given out and not stored yet, plus the one being read.)
        most = Math.max(most, b.given() - g.s.puts.length + 1);
        return b.next();
      },
      cancel: () => b.cancel(),
    };
    expect(await g.upload(counted, bytes.length)).toMatchObject({ status: 200 });
    expect(g.s.puts).toHaveLength(10);
    expect(most).toBeLessThanOrEqual(2);
  });
});

describe('downloads', () => {
  const file = (bytes: number, parts: number, key?: string): RoomFile => ({ mime: 'image/png', bytes, parts, at: 0, ...(key ? { key } : {}) });

  it('sent a piece at a time, with its size, ending after exactly its bytes; one stored by older code too', async () => {
    const g = setup();
    const bytes = randomBytes(2.5 * MB);
    const { id } = await g.upload(body(bytes), bytes.length);
    const res = await g.store.send(id!, () => g.files()[id!], () => true);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('X-File-Bytes')).toBe(String(bytes.length));
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    // file:<id>:<n>
    const old = randomBytes(MB + 10);
    g.stored.set(`file:${sha(old)}:0`, old.subarray(0, MB));
    g.stored.set(`file:${sha(old)}:1`, old.subarray(MB));
    const back = await g.store.send(sha(old), () => file(old.length, 2), () => true);
    expect(Buffer.from(await back.arrayBuffer()).equals(old)).toBe(true);
  });

  it('404 when the room says no, it ended, or its first piece is missing', async () => {
    const g = setup();
    const { id } = await g.upload(body(randomBytes(MB)), MB);
    expect((await g.store.send(id!, () => null, () => true)).status).toBe(404);
    expect((await g.store.send(id!, () => g.files()[id!], () => false)).status).toBe(404);
    g.s.missing.add('p:u1:0');
    expect((await g.store.send(id!, () => g.files()[id!], () => true)).status).toBe(404);
  });

  it('a piece gone partway (the file deleted, or the room ended): the body ends in an error', async () => {
    const g = setup();
    const { id } = await g.upload(body(randomBytes(3 * MB)), 3 * MB);
    const f = g.files()[id!];
    g.s.missing.add('p:u1:2');
    const cut = await g.store.send(id!, () => f, () => true);
    await expect(cut.arrayBuffer()).rejects.toThrow();
    g.s.missing.clear();
    let live = true;
    const ended = await g.store.send(id!, () => f, () => live);
    const reader = ended.body!.getReader();
    expect((await reader.read()).value!.byteLength).toBe(MB);
    live = false;
    await expect(reader.read()).rejects.toThrow();
    // A size that doesn't add up is an error too, never a short or long body.
    const wrong = await g.store.send(id!, () => ({ ...f, bytes: f.bytes + 1 }), () => true);
    await expect(wrong.arrayBuffer()).rejects.toThrow();
  });

  it(`${SENDS_AT_ONCE} at once per room: the next waits its turn until one ends`, async () => {
    const g = setup();
    const bytes = randomBytes(2 * MB);
    const { id } = await g.upload(body(bytes), bytes.length);
    const f = () => g.files()[id!];
    const open = await Promise.all(Array.from({ length: SENDS_AT_ONCE }, () => g.store.send(id!, f, () => true)));
    let next: Response | null = null;
    const waiting = g.store.send(id!, f, () => true).then((r) => (next = r));
    for (let i = 0; i < 5; i++) await tick();
    expect(next).toBeNull();
    // One read to its end frees a place.
    await open[0].arrayBuffer();
    await waiting;
    expect(next!.status).toBe(200);
    // So does one stopped partway (the phone let go).
    let after: Response | null = null;
    const last = g.store.send(id!, f, () => true).then((r) => (after = r));
    for (let i = 0; i < 5; i++) await tick();
    expect(after).toBeNull();
    await open[1].body!.cancel();
    await last;
    expect(Buffer.from(await after!.arrayBuffer()).equals(bytes)).toBe(true);
    // And a 404 never keeps one: with every place free again, more of them in a row than there are places.
    await Promise.all([...open.slice(2), next!].map((r) => r.body!.cancel()));
    for (let i = 0; i < SENDS_AT_ONCE + 2; i++) expect((await g.store.send(id!, () => null, () => true)).status).toBe(404);
    expect((await g.store.send(id!, f, () => true)).status).toBe(200);
  });
});
