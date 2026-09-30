import { describe, expect, it } from 'vitest';
import { applyOps, diff, mediaIdsIn, mergeOps, opPath, opsSize, PathGone, same, type Json, type Op } from './historyops';

type Obj = { [k: string]: Json };
const clone = <T>(v: T): T => structuredClone(v);

/** Diff, then undo on a copy of `after` and redo again: both ways must land exactly on each side. */
function roundTrip(before: Obj, after: Obj): Op[] {
  const ops = diff(before, after);
  const live = clone(after);
  applyOps(live, ops, -1);
  expect(live).toStrictEqual(before);
  applyOps(live, ops, 1);
  expect(live).toStrictEqual(after);
  return ops;
}

const el = (id: string, text = id) => ({ id, kind: 'text', text, x: 0 });

describe('diff and applyOps', () => {
  it('finds nothing between equal games, shared or copied', () => {
    const g = { title: 'A', rounds: [{ id: 'r', name: 'R', values: [1, 2] }] };
    expect(diff(g, g)).toEqual([]);
    expect(diff(g, clone(g))).toEqual([]);
  });

  it('sets, adds and removes keys (undefined counts as absent)', () => {
    const ops = roundTrip({ title: 'A', n: 1, gone: 'x', deep: { a: { b: 1 } } }, { title: 'B', n: 1, added: true, deep: { a: { b: 2 } } });
    expect(ops).toEqual([
      { t: 'set', p: [], k: 'title', b: 'A', a: 'B' },
      { t: 'set', p: [], k: 'gone', b: 'x' },
      { t: 'set', p: ['deep', 'a'], k: 'b', b: 1, a: 2 },
      { t: 'set', p: [], k: 'added', a: true },
    ]);
    expect(diff({ a: 1, b: undefined } as never, { a: 1 })).toEqual([]);
  });

  it('replaces a value that changes type', () => {
    roundTrip({ a: { x: 1 }, b: 2, c: [1], d: { y: 1 } }, { a: 3, b: { x: 1 }, c: { z: [1] }, d: [{ y: 1 }] });
    const ops = diff({ a: { x: 1 } }, { a: null });
    expect(ops).toEqual([{ t: 'set', p: [], k: 'a', b: { x: 1 }, a: null }]);
  });

  it('inserts, deletes and moves elements of id-arrays by id', () => {
    const before = { els: [el('a'), el('b'), el('c'), el('d')] };
    expect(roundTrip(before, { els: [el('a'), el('x'), el('b'), el('c'), el('d')] })).toEqual([
      { t: 'ins', p: ['els'], i: 1, id: 'x', v: el('x') },
    ]);
    expect(roundTrip(before, { els: [el('a'), el('c'), el('d')] })).toEqual([{ t: 'del', p: ['els'], i: 1, id: 'b', v: el('b') }]);
    expect(roundTrip(before, { els: [el('b'), el('c'), el('a'), el('d')] })).toEqual([
      { t: 'ord', p: ['els'], b: ['a', 'b', 'c', 'd'], a: ['b', 'c', 'a', 'd'] },
    ]);
    // Moved and edited: the edit is addressed by id, wherever the element is.
    expect(roundTrip(before, { els: [el('d', 'D!'), el('a'), el('b'), el('c')] })).toEqual([
      { t: 'ord', p: ['els'], b: ['a', 'b', 'c', 'd'], a: ['d', 'a', 'b', 'c'] },
      { t: 'set', p: ['els', 'd'], k: 'text', b: 'd', a: 'D!' },
    ]);
    // A different element in the same place: one out, one in.
    expect(roundTrip(before, { els: [el('a'), el('y'), el('c'), el('d')] }).map((o) => o.t)).toEqual(['del', 'ins']);
    // Several of everything at once.
    roundTrip(before, { els: [el('y'), el('d'), el('z'), el('b', 'B'), el('w')] });
  });

  it('handles empty arrays either side', () => {
    expect(roundTrip({ els: [] }, { els: [el('a'), el('b')] }).map((o) => o.t)).toEqual(['ins', 'ins']);
    expect(roundTrip({ els: [el('a'), el('b')] }, { els: [] }).map((o) => o.t)).toEqual(['del', 'del']);
    expect(roundTrip({ n: [] }, { n: [1, 2] })).toEqual([{ t: 'set', p: [], k: 'n', b: [], a: [1, 2] }]);
    expect(diff({ n: [] }, { n: [] })).toEqual([]);
  });

  it('treats arrays with missing or repeated ids as plain arrays', () => {
    const dup = roundTrip({ els: [el('a'), el('b')] }, { els: [el('a'), el('a'), el('b')] });
    expect(dup).toEqual([{ t: 'set', p: [], k: 'els', b: [el('a'), el('b')], a: [el('a'), el('a'), el('b')] }]);
    const noId = roundTrip({ els: [{ x: 1 }, { x: 2 }] }, { els: [{ x: 1 }, { x: 3 }] });
    expect(noId).toEqual([{ t: 'set', p: ['els', 1], k: 'x', b: 2, a: 3 }]);
  });

  it('sets plain arrays index by index, or whole when their length changes or many indices do', () => {
    expect(roundTrip({ v: [200, 400, 600] }, { v: [200, 800, 600] })).toEqual([{ t: 'set', p: ['v'], k: 1, b: 400, a: 800 }]);
    expect(roundTrip({ v: [1, 2] }, { v: [1, 2, 3] })).toEqual([{ t: 'set', p: [], k: 'v', b: [1, 2], a: [1, 2, 3] }]);
    const many = roundTrip({ v: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, { v: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] });
    expect(many).toHaveLength(1);
    expect(many[0]).toMatchObject({ t: 'set', p: [], k: 'v' });
  });

  it('replaces arrays of arrays (a drawing) whole, and only when they changed', () => {
    const before = { points: [[0, 0], [1, 1]] };
    expect(roundTrip(before, { points: [[0, 0], [1, 2]] })).toEqual([{ t: 'set', p: [], k: 'points', b: before.points, a: [[0, 0], [1, 2]] }]);
    expect(diff(before, clone(before))).toEqual([]);
  });

  it('keeps the objects a change did not touch, and moves the existing ones', () => {
    const before = { rounds: [{ id: 'r1', cats: [el('c1')] }, { id: 'r2', cats: [el('c2')] }, { id: 'r3', cats: [] }] };
    const after = clone(before);
    after.rounds.reverse();
    after.rounds[0].cats.push(el('c3'));
    const live = clone(after);
    const [r3, r2, r1] = live.rounds;
    const c2 = r2.cats[0];
    applyOps(live, diff(before, after), -1);
    expect(live).toStrictEqual(before);
    expect(live.rounds[0]).toBe(r1);
    expect(live.rounds[1]).toBe(r2);
    expect(live.rounds[2]).toBe(r3);
    expect(live.rounds[1].cats[0]).toBe(c2);
  });

  it('gives the game its own copies of what the ops hold', () => {
    const before = { els: [el('a')], o: { deep: { n: 1 } } };
    const after = { els: [], o: { deep: { n: 1 } } } as Obj;
    const ops = diff(before, after);
    const live = clone(after);
    applyOps(live, ops, -1);
    (live.els as Obj[])[0].text = 'changed';
    expect(ops[0]).toMatchObject({ t: 'del', v: el('a') });
  });

  it('throws PathGone when the game lacks what an op changes', () => {
    const ops = diff({ els: [el('a')] }, { els: [el('a', 'A')] });
    expect(() => applyOps({ els: [el('b')] }, ops, -1)).toThrow(PathGone);
    expect(() => applyOps({ els: [] }, [{ t: 'del', p: ['els'], i: 0, id: 'a', v: el('a') }], 1)).toThrow(PathGone);
    expect(() => applyOps({ els: [el('a')] }, [{ t: 'ins', p: ['els'], i: 0, id: 'a', v: el('a') }], 1)).toThrow(PathGone);
    expect(() => applyOps({}, [{ t: 'ord', p: ['els'], b: ['a'], a: ['a'] }], 1)).toThrow(PathGone);
  });
});

// ---------- Seeded random edits ----------

/** Deterministic random numbers (mulberry32). */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generator(r: () => number) {
  let n = 0;
  const id = () => `id${++n}`;
  const int = (k: number) => Math.floor(r() * k);
  const pick = <T>(list: T[]): T => list[int(list.length)];
  const times = <T>(k: number, fn: () => T): T[] => Array.from({ length: k }, fn);
  const word = () => pick(['Memes', 'Cave', 'Town', 'Pepe', '', 'Who is?', 'Potion']);
  const element = (): Obj =>
    r() < 0.3
      ? { id: id(), kind: 'shape', shape: 'path', x: int(1920), y: int(1080), points: times(1 + int(4), () => [r(), r()]) }
      : { id: id(), kind: 'text', x: int(1920), y: int(1080), text: word(), bold: r() < 0.5 };
  const slide = (): Obj => ({ background: { color: '#000' }, elements: times(int(4), element) });
  const clue = (): Obj => ({ id: id(), value: r() < 0.5 ? null : 200, type: 'standard', questionSlide: slide(), answerSlide: slide() });
  const game = (): Obj => ({
    id: 'game',
    title: word(),
    settings: { allowNegativeScores: true, maxPlayers: 8, roundIntro: { titleCard: true } },
    rounds: times(1 + int(3), () => ({
      id: id(),
      name: word(),
      mode: 'board',
      values: [200, 400, 600],
      categories: times(1 + int(3), () => ({ id: id(), title: word(), clues: times(3, clue) })),
    })),
    worlds: [{ id: id(), name: word(), maps: times(1 + int(2), () => ({ id: id(), name: word(), cols: 3, rows: 3, screens: times(int(4), () => ({ id: id(), name: word(), col: int(3), row: int(3), slide: slide() })) })) }],
    media: times(int(4), () => ({ id: id(), name: `${word()}.png`, kind: 'image', size: int(1000) })),
    theme: { preset: 'classic', colors: { board: '#060ce9', text: '#fff' } },
  });
  return { id, int, pick, word, element, game, r };
}

type Gen = ReturnType<typeof generator>;

/** Every object and array in a value. */
function containers(v: Json, out: (Obj | Json[])[] = []): (Obj | Json[])[] {
  if (typeof v !== 'object' || v === null) return out;
  out.push(v);
  for (const x of Array.isArray(v) ? v : Object.values(v)) containers(x, out);
  return out;
}

const hasIds = (a: Json[]) => a.length > 0 && a.every((x) => typeof x === 'object' && x !== null && !Array.isArray(x) && typeof x.id === 'string');

/** One random edit somewhere in the game. */
function edit(g: Obj, gen: Gen): void {
  const { int, pick, r } = gen;
  const target = pick(containers(g));
  if (!Array.isArray(target)) {
    const keys = Object.keys(target).filter((k) => k !== 'id');
    const k = keys.length ? pick(keys) : 'extra';
    const roll = r();
    if (roll < 0.45) target[k] = typeof target[k] === 'number' ? int(100) : typeof target[k] === 'boolean' ? !target[k] : gen.word() + int(9);
    else if (roll < 0.6) target[`k${int(5)}`] = r() < 0.5 ? int(10) : { nested: gen.word() };
    else if (roll < 0.75) delete target[k];
    else target[k] = pick([3, 'text', null, { x: 1 }, [1, 2], [{ id: gen.id(), n: 1 }]]);
    return;
  }
  const roll = r();
  if (hasIds(target)) {
    const i = int(target.length);
    if (roll < 0.25) target.splice(int(target.length + 1), 0, r() < 0.5 ? gen.element() : { ...clone(target[i] as Obj), id: gen.id() });
    else if (roll < 0.45) target.splice(i, 1);
    else if (roll < 0.65) target.splice(int(target.length), 0, ...target.splice(i, 1));
    else if (roll < 0.75) [target[0], target[target.length - 1]] = [target[target.length - 1], target[0]];
    else if (roll < 0.9) target[i] = { ...clone(target[i] as Obj), changed: int(10) };
    else if (roll < 0.95) target.push(clone(target[i]));
    else target.push({ noId: true });
  } else if (target.length && Array.isArray(target[0])) {
    const pt = pick(target) as number[];
    if (roll < 0.5) pt[0] = r();
    else target.push([r(), r()]);
  } else if (roll < 0.4) target.push(int(1000));
  else if (roll < 0.6) target.pop();
  else if (target.length) target[int(target.length)] = r() < 0.8 ? int(1000) : { x: int(9) };
}

/** The objects of id-array elements, by their path of keys and ids (plain arrays aren't followed). */
function byIdPath(v: Json, path = '', out = new Map<string, Obj>()): Map<string, Obj> {
  if (Array.isArray(v)) {
    const ids = hasIds(v) && new Set(v.map((x) => (x as Obj).id)).size === v.length;
    if (ids) for (const x of v as Obj[]) byIdPath(x, `${path}/${x.id}`, out.set(`${path}/${x.id}`, x));
  } else if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) byIdPath(x, `${path}.${k}`, out);
  return out;
}

describe('random edits (seeded)', () => {
  it('undo restores the exact game, redo returns, untouched objects stay', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const gen = generator(rng(seed));
      const before = gen.game();
      const after = clone(before);
      const edits = 1 + gen.int(20);
      for (let i = 0; i < edits; i++) edit(after, gen);
      const ops = diff(before, after);
      if (same(before, after)) expect(ops, `seed ${seed}`).toEqual([]);

      const live = clone(after);
      const kept = byIdPath(live);
      const [inBefore, inAfter] = [byIdPath(before), byIdPath(after)];
      applyOps(live, ops, -1);
      expect(live, `seed ${seed}: undo`).toStrictEqual(before);
      const now = byIdPath(live);
      for (const [path, obj] of kept)
        if (inBefore.has(path) && same(inBefore.get(path)!, inAfter.get(path)!)) expect(now.get(path), `seed ${seed}: ${path} kept`).toBe(obj);

      applyOps(live, ops, 1);
      expect(live, `seed ${seed}: redo`).toStrictEqual(after);
      // Nothing in the game is shared with the ops.
      const held = new Set(ops.flatMap((o) => containers(o as unknown as Json)));
      expect(containers(live).some((c) => held.has(c)), `seed ${seed}: shared`).toBe(false);
    }
  });
});

describe('mergeOps', () => {
  const set = (k: string, b: Json | undefined, a: Json | undefined, p = ['rounds', 'r1']): Op => {
    const op: Op = { t: 'set', p, k };
    if (b !== undefined) op.b = b;
    if (a !== undefined) op.a = a;
    return op;
  };

  it('joins typing on in the same field into one step', () => {
    expect(mergeOps([set('name', 'Mem', 'Meme')], [set('name', 'Meme', 'Memes')])).toEqual([set('name', 'Mem', 'Memes')]);
    // A field that wasn't there, then typed in.
    expect(mergeOps([set('notes', undefined, 'a')], [set('notes', 'a', 'ab')])).toEqual([set('notes', undefined, 'ab')]);
    // Several values changed again (a nudge moving three items).
    const xy = [set('x', 1, 2), set('y', 1, 2)];
    expect(mergeOps(xy, [set('y', 2, 3), set('x', 2, 3)])).toEqual([set('x', 1, 3), set('y', 1, 3)]);
  });

  it('cancels out when the second change undoes the first', () => {
    expect(mergeOps([set('name', 'A', 'AB')], [set('name', 'AB', 'A')])).toEqual([]);
    expect(mergeOps([set('notes', undefined, 'a')], [set('notes', 'a', undefined)])).toEqual([]);
  });

  it('refuses other paths, non-primitive values, structure and gaps', () => {
    expect(mergeOps([set('name', 'A', 'B')], [set('title', 'B', 'C')])).toBeNull();
    expect(mergeOps([set('name', 'A', 'B')], [set('name', 'B', 'C', ['rounds', 'r2'])])).toBeNull();
    expect(mergeOps([set('x', 1, 2), set('y', 1, 2)], [set('x', 2, 3)])).toBeNull();
    expect(mergeOps([set('s', { a: 1 }, { a: 2 })], [set('s', { a: 2 }, { a: 3 })])).toBeNull();
    expect(mergeOps([set('name', 'A', 'B')], [set('name', 'X', 'C')])).toBeNull();
    expect(mergeOps([{ t: 'ins', p: ['els'], i: 0, id: 'a', v: el('a') }], [set('name', 'A', 'B')])).toBeNull();
    expect(mergeOps([], [])).toBeNull();
  });
});

describe('op helpers', () => {
  it('names the path each op changes', () => {
    expect(opPath({ t: 'set', p: ['rounds', 'r1'], k: 'name', a: 'X' })).toEqual(['rounds', 'r1', 'name']);
    expect(opPath({ t: 'ins', p: ['rounds'], i: 0, id: 'r2', v: {} })).toEqual(['rounds', 'r2']);
    expect(opPath({ t: 'ord', p: ['rounds'], b: [], a: [] })).toEqual(['rounds']);
  });

  it('measures ops by their JSON', () => {
    const ops: Op[] = [{ t: 'set', p: [], k: 'title', b: 'A', a: 'B' }];
    expect(opsSize(ops)).toBe(JSON.stringify(ops).length);
  });

  it('lists the media files ops add, remove or change', () => {
    const m = (id: string) => ({ id, name: `${id}.png`, kind: 'image' });
    const before = { media: [m('a'), m('b'), m('c')], rounds: [{ id: 'r', image: 'a' }] };
    const after = { media: [m('b'), { ...m('c'), name: 'renamed.png' }, m('d')], rounds: [{ id: 'r', image: 'd' }] };
    expect(mediaIdsIn(diff(before, after)).sort()).toEqual(['a', 'c', 'd']);
    expect(mediaIdsIn(diff({ media: [m('a')] }, { media: [m('a'), m('a')] })).sort()).toEqual(['a']);
    expect(mediaIdsIn([{ t: 'set', p: [], k: 'media', b: [m('x')], a: [] }])).toEqual(['x']);
    expect(mediaIdsIn(diff({ media: [m('a'), m('b')] }, { media: [m('b'), m('a')] }))).toEqual([]);
  });
});
