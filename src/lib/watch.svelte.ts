// Watches the game in the editor for changes, cheaply. The game is split into chunks (its own fields, each round,
// each category, each world, map and screen, and a few big lists), each watched by its own effect, so a keystroke
// re-reads only the chunk it changed instead of the whole game. The watcher keeps a plain copy of the game whose
// unchanged parts keep their identity from one change to the next: the autosave writes it, and the undo history
// diffs two of them (historyops.ts) in the time it takes to look at what changed.
import { flushSync } from 'svelte';
import type { Game } from './model';

/** How the game is split: a key's value is watched 'whole', or (an array of objects with ids) one chunk per element. */
export type ChunkSpec = { readonly [key: string]: 'whole' | { readonly each: ChunkSpec } };

export const GAME_CHUNKS: ChunkSpec = {
  rounds: {
    each: {
      categories: { each: {} },
      decor: 'whole',
      spaces: 'whole',
      zones: 'whole',
      slide: 'whole',
      questionSlide: 'whole',
      answerSlide: 'whole',
    },
  },
  worlds: { each: { maps: { each: { screens: { each: {} } } } } },
  media: 'whole',
  wheels: 'whole',
  dice: 'whole',
  items: 'whole',
  shops: 'whole',
  statFields: 'whole',
  players: 'whole',
  theme: 'whole',
  tiebreaker: 'whole',
};

export interface GameWatch {
  /** The game as plain JSON. Unchanged parts keep their identity between calls. Never mutate it. */
  value(): Game;
  /** Goes up on every change seen. */
  readonly rev: number;
  /** Called (outside any effect, a moment after) when the game changes. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** See every change made so far now. Never call it from inside an effect. */
  sync(): void;
  destroy(): void;
}

type Obj = Record<string, unknown>;

// Chunks are never created inside a running effect (Svelte would make them children of it, and a chunk added after
// that effect ran again could be left out). The effects queue that work instead, and it runs here, outside any effect:
// in a microtask, or at once when someone needs the copy.
const queue: (() => void)[] = [];
let queued = false;
function later(fn: () => void): void {
  queue.push(fn);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    run();
  });
}

function run(): void {
  for (let guard = 0; guard < 100; guard++) {
    flushSync();
    if (!queue.length) return;
    for (const fn of queue.splice(0)) fn();
  }
}

function outside(): void {
  if (import.meta.env.DEV && $effect.tracking()) throw new Error('The game watcher was read inside an effect');
}

/** Every element an object with its own string id, no two the same. */
function hasIds(list: unknown[]): list is Obj[] {
  const ids = new Set<unknown>();
  for (const x of list) {
    if (typeof x !== 'object' || x === null || typeof (x as Obj).id !== 'string' || ids.has((x as Obj).id)) return false;
    ids.add((x as Obj).id);
  }
  return true;
}

/** A key watched whole: its JSON, parsed once per change. */
class Whole {
  json = '';
  plain: unknown = null;
  readonly stop: () => void;
  constructor(obj: Obj, key: string, changed: () => void) {
    this.stop = $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(obj[key]) ?? 'null';
        if (json === this.json) return;
        this.json = json;
        this.plain = JSON.parse(json);
        changed();
      });
    });
  }
}

type Lists = [key: string, items: Obj[], spec: ChunkSpec][];

/** One object of the game: its own fields, plus a Whole per 'whole' key and a Chunk per element of an 'each' list. */
class Chunk {
  /** The object's fields as JSON, with placeholders for its wholes and the ids of its lists' elements. */
  private json = '';
  private shell: Obj = {};
  /** The keys whose ids stand for child chunks. */
  private lists: string[] = [];
  /** The assembled copy, and each list's copy, until something in it changes. */
  private plain: Obj | undefined;
  private readonly copies = new Map<string, unknown[]>();
  private readonly wholes = new Map<string, Whole>();
  private readonly children = new Map<string, Map<string, { obj: Obj; chunk: Chunk }>>();
  private readonly stop: () => void;
  private stopped = false;

  constructor(
    private readonly obj: Obj,
    private readonly spec: ChunkSpec,
    private readonly changed: () => void,
  ) {
    this.stop = $effect.root(() => {
      $effect(() => this.read());
    });
  }

  private dirty = (): void => {
    this.plain = undefined;
    this.changed();
  };

  /** The effect: reads the object's own fields (the chunks below read theirs). */
  private read(): void {
    const shell: Obj = {};
    const wholes: string[] = [];
    const lists: Lists = [];
    for (const k of Object.keys(this.obj)) {
      const v = this.obj[k];
      if (v === undefined) continue;
      const s = this.spec[k];
      if (s === 'whole') {
        shell[k] = null;
        wholes.push(k);
      } else if (s && Array.isArray(v) && hasIds(v)) {
        shell[k] = v.map((x) => x.id);
        lists.push([k, v.slice(), s.each]);
      } else shell[k] = v;
    }
    // (A list that has an element without an id, or two with one id, is copied as a field until it's fixed.)
    const json = JSON.stringify(shell);
    const keys = lists.map(([k]) => k);
    if (json !== this.json || keys.join() !== this.lists.join()) {
      this.json = json;
      this.shell = JSON.parse(json);
      this.lists = keys;
      this.copies.clear();
      this.dirty();
    }
    later(() => this.reconcile(wholes, lists));
  }

  /** Start and stop the chunks below to match the object (an element replaced by a new object gets a new chunk). */
  private reconcile(wholes: string[], lists: Lists): void {
    if (this.stopped) return;
    let changed = false;
    for (const k of wholes) if (!this.wholes.has(k)) this.wholes.set(k, new Whole(this.obj, k, this.dirty));
    for (const [k, w] of this.wholes)
      if (!wholes.includes(k)) {
        w.stop();
        this.wholes.delete(k);
        changed = true;
      }
    for (const [k, kids] of this.children)
      if (!lists.some(([key]) => key === k)) {
        for (const c of kids.values()) c.chunk.destroy();
        this.children.delete(k);
        changed = true;
      }
    for (const [k, items, spec] of lists) {
      let kids = this.children.get(k);
      if (!kids) this.children.set(k, (kids = new Map()));
      const seen = new Set<string>();
      const listChanged = () => {
        this.copies.delete(k);
        this.dirty();
      };
      for (const x of items) {
        const id = x.id as string;
        seen.add(id);
        const had = kids.get(id);
        if (had?.obj === x) continue;
        had?.chunk.destroy();
        kids.set(id, { obj: x, chunk: new Chunk(x, spec, listChanged) });
        this.copies.delete(k);
        changed = true;
      }
      for (const [id, c] of kids)
        if (!seen.has(id)) {
          c.chunk.destroy();
          kids.delete(id);
          this.copies.delete(k);
          changed = true;
        }
    }
    if (changed) this.dirty();
  }

  value(): Obj {
    if (this.plain) return this.plain;
    const out: Obj = { ...this.shell };
    for (const [k, w] of this.wholes) if (k in out) out[k] = w.plain;
    for (const k of this.lists) {
      let copy = this.copies.get(k);
      if (!copy) {
        const kids = this.children.get(k)!;
        this.copies.set(k, (copy = (out[k] as string[]).map((id) => kids.get(id)!.chunk.value())));
      }
      out[k] = copy;
    }
    return (this.plain = out);
  }

  destroy(): void {
    this.stopped = true;
    this.stop();
    for (const w of this.wholes.values()) w.stop();
    for (const kids of this.children.values()) for (const c of kids.values()) c.chunk.destroy();
  }
}

/** Watch `game` (a $state game) until destroy(). Its first reading takes a moment on a big game: start it once shown. */
export function watchGame(game: Game, spec: ChunkSpec = GAME_CHUNKS): GameWatch {
  const subs = new Set<() => void>();
  let rev = 0;
  let told = false;
  let live = true;
  const tell = () => {
    told = false;
    if (!live) return;
    run();
    for (const fn of [...subs]) fn();
  };
  const root = new Chunk(game as unknown as Obj, spec, () => {
    rev++;
    if (told) return;
    told = true;
    queueMicrotask(tell);
  });
  run();
  return {
    value() {
      outside();
      run();
      return root.value() as unknown as Game;
    },
    get rev() {
      return rev;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    sync() {
      outside();
      run();
    },
    destroy() {
      live = false;
      subs.clear();
      root.destroy();
    },
  };
}
