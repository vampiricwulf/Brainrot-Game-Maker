// One undo history for everything in the editor's game. The game watcher (watch.svelte.ts) says when the game
// changed; a step is everything changed between two boundaries (a press, a key in another field, focus moving on, a
// pause, or an editor's own step()), kept as the ops that undo and redo it (historyops.ts). Undo applies them to the
// live game in place, so editors keep changing the game as they always have. A step's name and where it happened
// come from its ops (historylabel.ts), unless the editor names it.
import { toast } from './app.svelte';
import { applyOps, diff, mergeOps, opsSize, PathGone, type Op } from './historyops';
import { describe, type Place } from './historylabel';
import { newId, type Game } from './model';
import { isTextField } from './undokeys';
import type { GameWatch } from './watch.svelte';

export interface HistoryEntry {
  id: string;
  /** When the step's first change happened, and its last. */
  ts: number;
  end: number;
  ops: Op[];
  /** 'Renamed category “Memes”' */
  label: string;
  icon: string;
  /** 'Round 1 › Memes' */
  where: string;
  /** Where the change shows once the step is applied. */
  place: Place | null;
  /** Where it shows once undone (a deleted screen comes back on its map…). */
  undoPlace: Place | null;
  /** Named by an editor with step() / begin() / nameStep(): never merged with another step. */
  explicit: boolean;
  /** Closed to merging (undone or redone, marked, or an editor's own step). */
  sealed: boolean;
  /** Made from the host screen (Keep in game, a wheel saved while hosting…). */
  during?: 'play';
  /** Bytes its ops take. */
  size: number;
  /** For merging typing across pauses: the element focused when the step began, and its focus session. */
  target?: Element | null;
  focusSession?: number;
}

export interface Mark {
  kind: 'opened' | 'new' | 'saved' | 'exported' | 'played' | 'autosaved';
  ts: number;
  label: string;
  /** Where it sits in the timeline: after entries[at - 1]. */
  at: number;
}

/** What the history starts from (undoing everything goes back to it). */
export interface Origin {
  kind: Mark['kind'] | 'reopened' | 'older' | 'restarted' | 'cleared';
  label: string;
  ts: number;
}

export interface StepOptions {
  /** Where to show the step when its ops alone can't say (a restyle across 12 slides). */
  place?: Place;
  during?: 'play';
  /** Show "‹label› · Undo" once it's made (for editors without a notice of their own). */
  notify?: boolean;
}

/** How an undo or redo was asked for: a key, a button, or a click in the History list. */
export type Via = 'key' | 'button' | 'list';

export const MAX_STEPS = 500;
export const MAX_BYTES = 32 * 1024 * 1024;
/** Kept whatever their size. */
const KEEP_NEWEST = 20;
const MAX_MARKS = 50;
/** A pause this long ends a step. */
const IDLE_MS = 700;
/** After a press ends or focus moves on (the click, or a Tab's own change, still belongs to the step). */
const SETTLE_MS = 250;
/** Changes to the same values this soon after a step join it (arrow-key nudges, a slider nudged twice)… */
const MERGE_MS = 1500;
/** …and typing on in the same field does, until the step is this old. */
const SEAL_MS = 60_000;

class HistoryState {
  /** Oldest first. entries[0 .. index) are applied, the rest were undone. */
  entries = $state.raw<HistoryEntry[]>([]);
  index = $state(0);
  origin = $state.raw<Origin>({ kind: 'new', label: 'New game', ts: Date.now() });
  marks = $state.raw<Mark[]>([]);
  /** Steps dropped from the start to keep the history within its limits. */
  trimmed = $state(0);
  /** Something changed that isn't a step yet. */
  pending = $state(false);
  canUndo = $derived(this.pending || this.index > 0);
  canRedo = $derived(!this.pending && this.index < this.entries.length);
  /** What Undo would take back, and what Redo would bring back. */
  undoLabel = $derived(this.pending ? 'your latest changes' : (this.entries[this.index - 1]?.label ?? null));
  redoLabel = $derived(this.pending ? null : (this.entries[this.index]?.label ?? null));
}

const h = new HistoryState();
/** The history, for showing it (change it only through the functions below). */
export const history: Readonly<HistoryState> = h;

let game: Game | null = null;
let watch: GameWatch | null = null;
let stopWatching = () => {};
/** The watcher's copy of the game as of the last step. */
let base: Game | null = null;
/** The pending change: when it began, and the element focused then (and its focus session). */
let since = 0;
let pendingTarget: Element | null = null;
let pendingSession = 0;
/** Goes up each time focus moves. */
let session = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
let pointerHeld = false;
/** Open begin()s, and the name of the step they make. */
let groups = 0;
/** Goes up with each game, so a group still open from the last game ends nothing in this one. */
let generation = 0;
let group: { label: string | null; opts: StepOptions } = { label: null, opts: {} };
/** A name for the next step (nameStep). */
let named: { label: string; opts: StepOptions } | null = null;
/** Where the next game that arrives comes from (New, Open…). */
let next: Omit<Origin, 'ts'> | null = null;

const appliedFns = new Set<(e: HistoryEntry, dir: 1 | -1, via: Via) => void>();
const notifyFns = new Set<(e: HistoryEntry) => void>();

const focused = (): Element | null => (typeof document === 'undefined' ? null : document.activeElement);

/** The next game to arrive (New, Open…) starts its history from this. */
export function arriving(origin: Omit<Origin, 'ts'>): void {
  next = origin;
}

/** Start the history over a game that arrived (the draft at the start, New, Open…), watched by `w`. */
export function startHistory(g: Game, w: GameWatch): void {
  stopWatching();
  clearTimeout(idle);
  game = g;
  watch = w;
  base = w.value();
  restart(next ?? { kind: 'reopened', label: 'Reopened this game' });
  next = null;
  groups = 0;
  generation++;
  named = null;
  stopWatching = w.subscribe(changed);
}

function restart(origin: Omit<Origin, 'ts'>): void {
  h.entries = [];
  h.index = 0;
  h.marks = [];
  h.trimmed = 0;
  h.pending = false;
  h.origin = { ...origin, ts: Date.now() };
}

/** The watcher saw a change. */
function changed(): void {
  if (!watch || watch.value() === base) return;
  if (!h.pending) {
    h.pending = true;
    since = Date.now();
    pendingTarget = focused();
    pendingSession = session;
  }
  wait(IDLE_MS);
}

function wait(ms: number): void {
  clearTimeout(idle);
  idle = setTimeout(() => !pointerHeld && commit(), ms);
}

/** Make what changed since the last step a step now (inside begin() … end(), it waits for the end). */
export function commit(): void {
  if (!groups) finish(null);
}

function finish(explicit: { label: string | null; opts: StepOptions } | null): void {
  clearTimeout(idle);
  if (!watch || !base) return;
  const before = base;
  const after = watch.value();
  const wasPending = h.pending;
  const label = explicit?.label ?? named?.label ?? null;
  const opts: StepOptions = { ...named?.opts, ...explicit?.opts };
  const isExplicit = !!(explicit || named);
  named = null;
  h.pending = false;
  if (after === before) return;
  base = after;
  // A checkbox shown for the first time fills in an option the game doesn't have yet as false (Svelte's binding
  // does): the game was like that already, so it isn't a step.
  const ops = diff(before, after).filter((o) => !(o.t === 'set' && o.b === undefined && o.a === false));
  if (!ops.length) return;
  const d = describe(ops, before, after, label);
  const entry: HistoryEntry = {
    id: newId(),
    ts: wasPending ? since : Date.now(),
    end: Date.now(),
    ops,
    ...d,
    place: opts.place ?? d.place,
    undoPlace: opts.place ?? d.undoPlace,
    explicit: isExplicit,
    sealed: isExplicit,
    size: opsSize(ops),
    target: wasPending ? pendingTarget : focused(),
    focusSession: wasPending ? pendingSession : session,
  };
  if (opts.during) entry.during = opts.during;
  if (!merge(entry, before, after)) add(entry);
  if (opts.notify) for (const fn of notifyFns) fn(entry);
}

/** Join the step to the one before it when it goes on changing the same values (typing on in one field). */
function merge(e: HistoryEntry, before: Game, after: Game): boolean {
  const top = h.index === h.entries.length ? h.entries[h.index - 1] : undefined;
  if (!top || e.explicit || top.sealed || e.ts - top.end >= SEAL_MS) return false;
  const typing = isTextField(e.target) && e.target === top.target && e.focusSession === top.focusSession;
  if (!typing && e.ts - top.end >= MERGE_MS) return false;
  const ops = mergeOps(top.ops, e.ops);
  if (!ops) return false;
  const rest = h.entries.slice(0, -1);
  if (!ops.length) {
    // Back to how it was: no step at all.
    h.entries = rest;
    h.index = rest.length;
    return true;
  }
  h.entries = [...rest, { ...top, ...describe(ops, before, after, null), end: e.end, ops, size: opsSize(ops) }];
  return true;
}

function add(e: HistoryEntry): void {
  // A new step drops the undone ones (and the marks among them).
  let entries = [...h.entries.slice(0, h.index), e];
  let marks = h.index < h.entries.length ? h.marks.filter((m) => m.at <= h.index) : h.marks;
  let bytes = entries.reduce((n, x) => n + x.size, 0);
  let drop = 0;
  while (entries.length - drop > MAX_STEPS || (bytes > MAX_BYTES && entries.length - drop > KEEP_NEWEST)) bytes -= entries[drop++].size;
  if (drop) {
    h.origin = { kind: 'older', label: "Older steps weren't kept", ts: entries[drop - 1].end };
    h.trimmed += drop;
    entries = entries.slice(drop);
    marks = marks.map((m) => ({ ...m, at: m.at - drop })).filter((m) => m.at >= 0);
  }
  h.marks = marks;
  h.entries = entries;
  h.index = entries.length;
}

/** Apply steps to the game (backward to undo). False when one couldn't be: the history starts again from here. */
function apply(list: HistoryEntry[], dir: 1 | -1): boolean {
  let gone = false;
  try {
    for (const e of list) applyOps(game!, e.ops, dir);
  } catch (err) {
    if (!(err instanceof PathGone)) throw err;
    console.warn('Undo history:', err);
    gone = true;
  } finally {
    // What the steps changed is the new starting point (not a change of its own).
    base = watch!.value();
    clearTimeout(idle);
    h.pending = false;
  }
  if (gone) {
    restart({ kind: 'restarted', label: "History restarted: a step couldn't be undone" });
    toast("A step couldn't be undone, so the undo history starts again from here", 6000);
  }
  return !gone;
}

function ready(): boolean {
  return !!watch && !pointerHeld && !groups;
}

/** Take back the latest step. Returns it, or null when there's nothing to undo (or a drag is going on). */
export function undo(via: Via = 'button'): HistoryEntry | null {
  if (!ready()) return null;
  commit();
  const e = h.entries[h.index - 1];
  if (!e || !apply([e], -1)) return null;
  h.index--;
  e.sealed = true;
  for (const fn of appliedFns) fn(e, -1, via);
  return e;
}

/** Bring back the step undone last. */
export function redo(via: Via = 'button'): HistoryEntry | null {
  if (!ready()) return null;
  commit();
  const e = h.entries[h.index];
  if (!e || !apply([e], 1)) return null;
  h.index++;
  e.sealed = true;
  for (const fn of appliedFns) fn(e, 1, via);
  return e;
}

/** Go to the game as it was just after entries[n - 1] (0: the origin). Returns the steps moved (negative: undone). */
export function jumpTo(n: number): number {
  if (!ready()) return 0;
  commit();
  n = Math.max(0, Math.min(h.entries.length, n));
  const moved = n - h.index;
  if (!moved) return 0;
  const list = moved < 0 ? h.entries.slice(n, h.index).reverse() : h.entries.slice(h.index, n);
  if (!apply(list, moved < 0 ? -1 : 1)) return 0;
  for (const e of list) e.sealed = true;
  h.index = n;
  for (const fn of appliedFns) fn(list[list.length - 1], moved < 0 ? -1 : 1, 'list');
  return moved;
}

/**
 * Open a group of changes that stays one step until the returned end() (nested groups count; the outermost name
 * wins, `null`: named from what changed). Always call end(), even when the changes fail.
 */
export function begin(label: string | null = null, opts: StepOptions = {}): () => void {
  if (!groups) {
    commit();
    group = { label, opts };
  } else if (!group.label && label) group = { label, opts: { ...group.opts, ...opts } };
  groups++;
  const gen = generation;
  let open = true;
  return () => {
    if (!open || gen !== generation) return;
    open = false;
    if (--groups) return;
    finish(group);
  };
}

/** Run `fn` as one step. `label: null` = named from what changed. Never call it inside an $effect. */
export function step<T>(label: string | null, fn: () => T, opts?: StepOptions): T {
  const end = begin(label, opts);
  try {
    return fn();
  } finally {
    end();
  }
}

/** step() for work that waits (a file stored, then used). */
export async function stepAsync<T>(label: string | null, fn: () => Promise<T>, opts?: StepOptions): Promise<T> {
  const end = begin(label, opts);
  try {
    return await fn();
  } finally {
    end();
  }
}

/** Name the step being made (the change made just now, or the next one), e.g. from a field's onchange. */
export function nameStep(label: string, opts: StepOptions = {}): void {
  named = { label, opts };
}

/** Saved, played, exported…: shown in the timeline between the steps, and the step before it stays as it is. */
export function mark(kind: Mark['kind'], label: string): void {
  if (!watch) return;
  commit();
  const top = h.entries[h.index - 1];
  if (top) top.sealed = true;
  h.marks = [...h.marks, { kind, ts: Date.now(), label, at: h.index }].slice(-MAX_MARKS);
}

/** Forget every step. */
export function clear(): void {
  commit();
  restart({ kind: 'cleared', label: 'History cleared' });
}

/** Called after an undo, redo or jump is applied. Returns the unsubscribe. */
export function onApplied(fn: (e: HistoryEntry, dir: 1 | -1, via: Via) => void): () => void {
  appliedFns.add(fn);
  return () => appliedFns.delete(fn);
}

/** Called when a step made with `notify: true` is made. */
export function onNotify(fn: (e: HistoryEntry) => void): () => void {
  notifyFns.add(fn);
  return () => notifyFns.delete(fn);
}

/**
 * Where steps start and end: every press starts a new one (a drag or a slider is one step until the pointer is up),
 * as does a key in another field than the one being typed in, and focus moving on.
 */
export function listen(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const down = () => {
    commit();
    pointerHeld = true;
  };
  const up = () => {
    pointerHeld = false;
    if (h.pending) wait(SETTLE_MS);
  };
  const key = (e: Event) => {
    if (h.pending && e.target !== pendingTarget) commit();
  };
  const focus = (e: Event) => {
    session++;
    if (h.pending && e.target !== pendingTarget) wait(SETTLE_MS);
  };
  const on: [string, (e: Event) => void][] = [
    ['pointerdown', down],
    ['pointerup', up],
    ['pointercancel', up],
    ['keydown', key],
    ['focusin', focus],
  ];
  for (const [type, fn] of on) target.addEventListener(type, fn, true);
  return () => {
    for (const [type, fn] of on) target.removeEventListener(type, fn, true);
  };
}
