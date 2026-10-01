// The undo history's patches: what changed between two plain copies of the game, as a list of ops, and applying
// them either way to the live game in place (so everything the change didn't touch keeps its objects, and the
// components showing them stay as they are). Pure: no DOM or Svelte state, all of it unit-tested (historyops.test.ts).

/** A value as saved games hold it. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
/** Object key, index into a plain array, or (inside an id-array) an element id. */
export type Seg = string | number;
export type Op =
  /** Set or remove a key of an object, or an index of a plain array. Absent `b`/`a` = the key isn't there. */
  | { t: 'set'; p: Seg[]; k: Seg; b?: Json; a?: Json }
  /** An element inserted into an id-array, at index `i` of the array after. */
  | { t: 'ins'; p: Seg[]; i: number; id: string; v: Json }
  /** An element removed from an id-array, from index `i` of the array before. */
  | { t: 'del'; p: Seg[]; i: number; id: string; v: Json }
  /** The elements both sides have, in their order before (`b`) and after (`a`). */
  | { t: 'ord'; p: Seg[]; b: string[]; a: string[] };

/** An op couldn't be applied: the game doesn't have what it changes (it was changed some other way). */
export class PathGone extends Error {
  constructor(readonly path: Seg[]) {
    super(`Nothing at ${path.join(' › ') || 'the top'}`);
  }
}

type Obj = { [k: string]: Json };
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Plain-array changes that touch more indices than this replace the whole array instead (a smaller op). */
const MAX_INDEX_OPS = 8;

/**
 * What changed from `before` to `after` (both objects). Parts both sides share are skipped at once, so on the game
 * watcher's copies (where unchanged parts keep their identity) this only looks at what changed.
 */
export function diff(before: object, after: object): Op[] {
  const out: Op[] = [];
  objects(before as Obj, after as Obj, [], out);
  return out;
}

function objects(a: Obj, b: Obj, p: Seg[], out: Op[]): void {
  if (a === b) return;
  for (const k of Object.keys(a)) {
    const av = a[k];
    if (av === undefined) continue;
    const bv = b[k];
    if (bv === undefined) out.push({ t: 'set', p, k, b: av });
    else values(av, bv, p, k, out);
  }
  for (const k of Object.keys(b)) if (b[k] !== undefined && a[k] === undefined) out.push({ t: 'set', p, k, a: b[k] });
}

function values(av: Json, bv: Json, p: Seg[], k: Seg, out: Op[]): void {
  if (av === bv) return;
  if (isObj(av) && isObj(bv)) objects(av, bv, [...p, k], out);
  else if (Array.isArray(av) && Array.isArray(bv)) arrays(av, bv, p, k, out);
  else out.push({ t: 'set', p, k, b: av, a: bv });
}

/** The ids of an array whose elements all have their own string `id` (an id-array), else null. */
function idsOf(arr: Json[]): string[] | null {
  const ids: string[] = [];
  for (const x of arr) {
    if (!isObj(x) || typeof x.id !== 'string') return null;
    ids.push(x.id);
  }
  return new Set(ids).size === ids.length ? ids : null;
}

function arrays(a: Json[], b: Json[], parent: Seg[], key: Seg, out: Op[]): void {
  if (!a.length && !b.length) return;
  const p = [...parent, key];
  const ia = idsOf(a);
  const ib = idsOf(b);
  if (ia && ib) {
    // Deleted (from the end, so each index is still right), moved, inserted (from the start), then changed.
    const inA = new Set(ia);
    const inB = new Set(ib);
    for (let i = a.length - 1; i >= 0; i--) if (!inB.has(ia[i])) out.push({ t: 'del', p, i, id: ia[i], v: a[i] });
    const ca = ia.filter((id) => inB.has(id));
    const cb = ib.filter((id) => inA.has(id));
    if (ca.some((id, i) => id !== cb[i])) out.push({ t: 'ord', p, b: ca, a: cb });
    ib.forEach((id, i) => inA.has(id) || out.push({ t: 'ins', p, i, id, v: b[i] }));
    const at = new Map(ia.map((id, i) => [id, i]));
    ib.forEach((id, i) => {
      const j = at.get(id);
      if (j !== undefined) objects(a[j] as Obj, b[i] as Obj, [...p, id], out);
    });
    return;
  }
  // Plain arrays of the same length: index by index, unless that's many ops (a list of numbers redone).
  if (a.length === b.length && !a.some(Array.isArray) && !b.some(Array.isArray)) {
    const start = out.length;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (isObj(a[i]) && isObj(b[i])) objects(a[i] as Obj, b[i] as Obj, [...p, i], out);
      else out.push({ t: 'set', p, k: i, b: a[i], a: b[i] });
    }
    if (out.length - start <= MAX_INDEX_OPS) return;
    out.length = start;
  } else if (same(a, b)) return;
  // A new length, or arrays of arrays (a drawing's points): the whole array.
  out.push({ t: 'set', p: parent, k: key, b: a, a: b });
}

/** Deep equality of two JSON values (key order doesn't matter). */
export function same(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

/** The container a path leads to in the live game. */
function resolve(root: object, p: readonly Seg[]): Obj | Json[] {
  let cur: unknown = root;
  for (const s of p) {
    if (Array.isArray(cur)) cur = typeof s === 'string' ? cur.find((x) => isObj(x) && x.id === s) : cur[s];
    else if (isObj(cur)) cur = cur[s];
    else cur = undefined;
    if (typeof cur !== 'object' || cur === null) throw new PathGone([...p]);
  }
  return cur as Obj | Json[];
}

/** Op values are shared with the history: the game gets its own copy of each. */
const copy = (v: Json): Json => (typeof v === 'object' && v !== null ? structuredClone(v) : v);

function indexOfId(arr: Json[], id: string): number {
  return arr.findIndex((x) => isObj(x) && x.id === id);
}

/**
 * Apply `ops` to the live game in place: forward (dir 1: before → after) or backward (-1: undo). Moved elements are
 * the same objects in their new places. Throws PathGone when the game doesn't have what an op changes (the ops
 * before it stay applied).
 */
export function applyOps(root: object, ops: readonly Op[], dir: 1 | -1): void {
  const list = dir === 1 ? ops : [...ops].reverse();
  for (const op of list) {
    const c = resolve(root, op.p);
    if (op.t === 'set') {
      const v = dir === 1 ? op.a : op.b;
      if (Array.isArray(c)) c[op.k as number] = v === undefined ? null : copy(v);
      else if (v === undefined) delete c[op.k];
      else c[op.k] = copy(v);
      continue;
    }
    if (!Array.isArray(c)) throw new PathGone([...op.p]);
    if (op.t === 'ord') {
      const want = dir === 1 ? op.a : op.b;
      const byId = new Map(c.map((x) => [isObj(x) ? x.id : undefined, x]));
      if (want.some((id) => !byId.has(id))) throw new PathGone([...op.p]);
      // The elements both sides have take the wanted order in the places they're in; only moved places are assigned.
      const wanted = new Set(want);
      let j = 0;
      const next = c.map((x) => (isObj(x) && wanted.has(x.id as string) ? byId.get(want[j++])! : x));
      next.forEach((x, i) => c[i] !== x && (c[i] = x));
    } else if ((op.t === 'ins') === (dir === 1)) {
      if (indexOfId(c, op.id) >= 0) throw new PathGone([...op.p, op.id]);
      c.splice(Math.min(op.i, c.length), 0, copy(op.v));
    } else {
      const i = indexOfId(c, op.id);
      if (i < 0) throw new PathGone([...op.p, op.id]);
      c.splice(i, 1);
    }
  }
}

const primitive = (v: Json | undefined) => typeof v !== 'object' || v === null;
const pathKey = (op: Op) => JSON.stringify(opPath(op));

/**
 * `newer` continuing `older` (typing on in the same field, a slider nudged again): the one step both make, or null
 * when they aren't the same few values changed again. [] = the second undid the first.
 */
export function mergeOps(older: readonly Op[], newer: readonly Op[]): Op[] | null {
  if (older.length === 1 && older[0].t === 'ins') return intoInsert(older[0], newer);
  if (!older.length || older.length !== newer.length) return null;
  const ends = new Map<string, Op & { t: 'set' }>();
  for (const op of newer) {
    if (op.t !== 'set' || !primitive(op.b) || !primitive(op.a)) return null;
    ends.set(pathKey(op), op);
  }
  const out: Op[] = [];
  for (const op of older) {
    const end = op.t === 'set' && primitive(op.b) && primitive(op.a) ? ends.get(pathKey(op)) : undefined;
    if (!end || op.t !== 'set' || end.b !== op.a) return null;
    ends.delete(pathKey(op));
    if (op.b === end.a) continue;
    const merged: Op = { t: 'set', p: op.p, k: op.k };
    if (op.b !== undefined) merged.b = op.b;
    if (end.a !== undefined) merged.a = end.a;
    out.push(merged);
  }
  return ends.size ? null : out;
}

/**
 * Something just added, then typed on in its own box (a player added with Enter, then named): the one insert, of what
 * it is now. Only its own plain fields; anything else isn't the same step.
 */
function intoInsert(ins: Op & { t: 'ins' }, newer: readonly Op[]): Op[] | null {
  if (!newer.length || !isObj(ins.v)) return null;
  const at = JSON.stringify([...ins.p, ins.id]);
  const v: Obj = { ...ins.v };
  for (const op of newer) {
    if (op.t !== 'set' || !primitive(op.b) || !primitive(op.a) || typeof op.k !== 'string' || JSON.stringify(op.p) !== at || v[op.k] !== op.b) return null;
    if (op.a === undefined) delete v[op.k];
    else v[op.k] = op.a;
  }
  return [{ ...ins, v }];
}

/** About how many bytes the ops take (for the history's memory budget). */
export function opsSize(ops: readonly Op[]): number {
  return JSON.stringify(ops).length;
}

/** The full path of what an op changes (the key set, the element inserted or removed, the array reordered). */
export function opPath(op: Op): Seg[] {
  if (op.t === 'set') return [...op.p, op.k];
  if (op.t === 'ord') return [...op.p];
  return [...op.p, op.id];
}

/** Ids of the media files (game.media) that ops add, remove or change: undo or redo can bring those back. */
export function mediaIdsIn(ops: readonly Op[]): string[] {
  const ids = new Set<string>();
  const refs = (list: Json | undefined) => {
    if (Array.isArray(list)) for (const m of list) if (isObj(m) && typeof m.id === 'string') ids.add(m.id);
  };
  for (const op of ops) {
    if (op.t === 'set' && !op.p.length && op.k === 'media') {
      refs(op.b);
      refs(op.a);
    } else if (op.p[0] !== 'media') continue;
    else if (op.t === 'ins' || op.t === 'del') ids.add(op.id);
    else if (typeof op.p[1] === 'string') ids.add(op.p[1]);
    else if (op.t === 'set' && op.p.length === 1) {
      // A media list that isn't an id-array (a broken file): the refs set by index.
      refs([op.b ?? null, op.a ?? null]);
    }
  }
  return [...ids];
}

/**
 * Ids of the slide items (and board images) that ops add, remove or change, in the order they first come. Not the
 * ones only restacked: moving one item up or down the stack renumbers the items around it.
 */
export function itemIdsIn(ops: readonly Op[]): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.t === 'set' && op.k === 'zIndex') continue;
    const path = opPath(op);
    for (let i = 1; i < path.length; i++) {
      const id = path[i];
      if ((path[i - 1] === 'elements' || path[i - 1] === 'decor') && typeof id === 'string') ids.add(id);
    }
  }
  return [...ids];
}
