// One undo history for everything in the editor's game. The game watcher (watch.svelte.ts) says when the game
// changed; a step is everything changed between two boundaries (a press, a key in another field, focus moving on, a
// pause, or an editor's own step()), kept as the ops that undo and redo it (historyops.ts). Undo applies them to the
// live game in place, so editors keep changing the game as they always have. A step's name and where it happened
// come from its ops (historylabel.ts), unless the editor names it.
import { app, toast } from './app.svelte';
import { applyOps, diff, mediaIdsIn, mergeOps, opsSize, PathGone, type Op } from './historyops';
import { loadGameMedia, pruneMedia, registerLinks, restoreStash } from './media.svelte';
import { describe, type Place } from './historylabel';
import { newId, type Game } from './model';
import { prefs } from './prefs.svelte';
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
  /** Media files whose stored bytes this step can bring back (kept when unused files are cleaned up). */
  media?: string[];
  /** Stored bytes it swaps (Replace file…). */
  blobs?: BlobSwap[];
  /** Bytes its ops take. */
  size: number;
  /** For merging typing across pauses: the element focused when the step began, and its focus session. */
  target?: Element | null;
  focusSession?: number;
}

/** A file's bytes swapped under the same id: stashed copies of them before and after (null: it had none). */
export interface BlobSwap {
  id: string;
  before: string | null;
  after: string | null;
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

/** A step as it's stored with the draft (without what only means something on this page). */
export type StoredStep = Omit<HistoryEntry, 'target' | 'focusSession'>;

/** The rest of the history, stored with the draft (persist.ts): which steps, where it is, its marks. */
export interface SavedHistory {
  v: 1;
  gameId: string;
  /** The draft it was written with. */
  rev: string;
  origin: Origin;
  ids: string[];
  index: number;
  trimmed: number;
  marks: Mark[];
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

/** How many steps are kept: ⚙ Settings (300 unless changed). */
export const maxSteps = (): number => prefs.undoSteps;
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
  /** Tooltips for ↶ and ↷ ("Undo: Renamed category “Memes” (Ctrl+Z)"). */
  undoTitle = $derived(this.canUndo ? `Undo: ${this.undoLabel} (Ctrl+Z)` : 'Nothing to undo');
  redoTitle = $derived(this.canRedo ? `Redo: ${this.redoLabel} (Ctrl+Y)` : 'Nothing to redo');
  /** The newest step's id (a notice's Undo only works while it's still the newest). */
  top = $derived(this.entries[this.index - 1]?.id ?? null);
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
/** Where the next game that arrives comes from (New, Open…), and its history when it was saved with it. */
let next: { origin: Omit<Origin, 'ts'>; saved?: { saved: SavedHistory; steps: StoredStep[] }; store?: boolean } | null = null;
/** Steps new or changed since the history was last saved, and the ids of the ones gone since. */
const unsaved = new Set<string>();
const goneIds = new Set<string>();
/** Files' bytes swapped in the step being made (attachBlobSwap). */
let swaps: BlobSwap[] = [];
/** Unused files that only dropped steps held are cleaned up a little later. */
let pruning: ReturnType<typeof setTimeout> | undefined;
const PRUNE_MS = 5000;

const applyingFns = new Set<() => void>();
const appliedFns = new Set<(e: HistoryEntry, dir: 1 | -1, via: Via) => void>();
const notifyFns = new Set<(e: HistoryEntry) => void>();

const focused = (): Element | null => (typeof document === 'undefined' ? null : document.activeElement);

/**
 * The next game to arrive (New, Open…) starts its history from this, or goes on with the history saved with it.
 * `store`: its steps aren't stored with the draft yet (a recent game reopened), so the next save writes them all.
 */
export function arriving(origin: Omit<Origin, 'ts'>, saved?: { saved: SavedHistory; steps: StoredStep[] }, store = false): void {
  next = { origin, saved, store };
}

/** Start the history over a game that arrived (the draft at the start, New, Open…), watched by `w`. */
export function startHistory(g: Game, w: GameWatch): void {
  stopWatching();
  clearTimeout(idle);
  game = g;
  watch = w;
  base = w.value();
  restart(next?.origin ?? { kind: 'reopened', label: 'Reopened this game' });
  const saved = next?.saved;
  if (saved) {
    // Steps from before the reload are closed to typing on.
    h.entries = saved.steps.map((e) => ({ ...e, sealed: true }));
    h.index = Math.min(saved.saved.index, h.entries.length);
    h.origin = saved.saved.origin;
    h.marks = saved.saved.marks;
    h.trimmed = saved.saved.trimmed;
    // A recent game reopened: its steps are written with the draft (they were kept with the game).
    if (next?.store)
      for (const e of h.entries) {
        unsaved.add(e.id);
        goneIds.delete(e.id);
      }
  }
  next = null;
  groups = 0;
  generation++;
  named = null;
  stopWatching = w.subscribe(changed);
}

function restart(origin: Omit<Origin, 'ts'>): void {
  left(h.entries);
  swaps = [];
  h.entries = [];
  h.index = 0;
  h.marks = [];
  h.trimmed = 0;
  h.pending = false;
  h.origin = { ...origin, ts: Date.now() };
}

/**
 * A checkbox shown for the first time fills in an option the game doesn't have yet as false (Svelte's binding does):
 * the game was like that already, so it isn't a change.
 */
const fillIn = (o: Op) => o.t === 'set' && o.b === undefined && o.a === false;

/** The watcher saw a change. */
function changed(): void {
  if (!watch || !base) return;
  const now = watch.value();
  if (now === base) return;
  if (!h.pending) {
    // Only options filled in as something opened (a clue, a space): nothing to undo, and nothing going on either (an
    // undo's note stays up while it shows where the step was).
    if (diff(base, now).every(fillIn)) return void (base = now);
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
  const blobs = swaps;
  named = null;
  swaps = [];
  h.pending = false;
  if (after === before && !blobs.length) return;
  base = after;
  // (Options filled in as they're shown aren't part of it, see fillIn.)
  const ops = diff(before, after).filter((o) => !fillIn(o));
  if (!ops.length && !blobs.length) return;
  // (A file replaced by one with the same name and size changes only its bytes.)
  const file: Place = { tab: 'media', media: blobs[0]?.id };
  const d = ops.length ? describe(ops, before, after, label) : { label: label ?? 'Replaced a file', icon: '🖼', where: 'Media', place: file, undoPlace: file };
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
  const media = mediaIdsIn(ops);
  if (media.length) entry.media = media;
  if (blobs.length) entry.blobs = blobs;
  if (!merge(entry, before, after)) add(entry);
  if (opts.notify) for (const fn of notifyFns) fn(entry);
}

/** Join the step to the one before it when it goes on changing the same values (typing on in one field). */
function merge(e: HistoryEntry, before: Game, after: Game): boolean {
  const top = h.index === h.entries.length ? h.entries[h.index - 1] : undefined;
  if (!top || e.explicit || e.blobs || top.sealed || e.ts - top.end >= SEAL_MS) return false;
  const typing = isTextField(e.target) && e.target === top.target && e.focusSession === top.focusSession;
  if (!typing && e.ts - top.end >= MERGE_MS) return false;
  const ops = mergeOps(top.ops, e.ops);
  if (!ops) return false;
  const rest = h.entries.slice(0, -1);
  if (!ops.length) {
    // Back to how it was: no step at all.
    left([top]);
    h.entries = rest;
    h.index = rest.length;
    return true;
  }
  const media = mediaIdsIn(ops);
  h.entries = [...rest, { ...top, ...describe(ops, before, after, null), end: e.end, ops, size: opsSize(ops), media: media.length ? media : undefined }];
  unsaved.add(top.id);
  return true;
}

function add(e: HistoryEntry): void {
  // A new step drops the undone ones (and the marks among them).
  left(h.entries.slice(h.index));
  unsaved.add(e.id);
  h.marks = h.index < h.entries.length ? h.marks.filter((m) => m.at <= h.index) : h.marks;
  h.entries = [...h.entries.slice(0, h.index), e];
  h.index = h.entries.length;
  keepLimits();
}

/**
 * Forget the oldest steps beyond the limits (the step count from ⚙ Settings, and the size). Only steps that are
 * done can go, so lowering the setting never takes away a redo. ⚙ Settings calls this when the count changes.
 */
export function keepLimits(): void {
  const { entries } = h;
  let bytes = entries.reduce((n, x) => n + x.size, 0);
  let drop = 0;
  while (drop < h.index && (entries.length - drop > maxSteps() || (bytes > MAX_BYTES && entries.length - drop > KEEP_NEWEST))) bytes -= entries[drop++].size;
  if (!drop) return;
  left(entries.slice(0, drop));
  h.origin = { kind: 'older', label: "Older steps weren't kept", ts: entries[drop - 1].end };
  h.trimmed += drop;
  h.marks = h.marks.map((m) => ({ ...m, at: m.at - drop })).filter((m) => m.at >= 0);
  h.entries = entries.slice(drop);
  h.index -= drop;
}

/** Apply steps to the game (backward to undo). False when one couldn't be: the history starts again from here. */
function apply(list: HistoryEntry[], dir: 1 | -1): boolean {
  for (const fn of applyingFns) fn();
  let gone = false;
  try {
    for (const e of list) {
      applyOps(game!, e.ops, dir);
      // Replaced files' bytes go back too (at once when they're in memory).
      for (const s of dir < 0 ? [...(e.blobs ?? [])].reverse() : (e.blobs ?? [])) void restoreStash(s.id, dir < 0 ? s.before : s.after);
    }
    // A file that's a link again plays from its link; files brought back show again (after a reload, their bytes
    // are read from storage).
    if (list.some((e) => e.blobs)) registerLinks(game!);
    else if (list.some((e) => e.media)) void loadGameMedia(game!);
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

/**
 * The change being made goes on in this text field, focused now: typing in it joins that
 * step instead of making one of its own. A player added with Enter or ＋ Add player and then named in its new box is one
 * step, "Added player “Bo”", named as the player is called once the typing is done.
 */
export function joinTyping(el: Element): void {
  // (Not seen yet: it takes the field focused when it is.)
  if (!h.pending) return;
  pendingTarget = el;
  pendingSession = session;
}

/** Saved, played, exported…: shown in the timeline between the steps, and the step before it stays as it is. */
export function mark(kind: Mark['kind'], label: string): void {
  if (!watch) return;
  commit();
  const top = h.entries[h.index - 1];
  if (top) top.sealed = true;
  h.marks = [...h.marks, { kind, ts: Date.now(), label, at: h.index }].slice(-MAX_MARKS);
}

/** A file's bytes were swapped under the same id (Replace file…): the step being made swaps them back when undone. */
export function attachBlobSwap(swap: BlobSwap): void {
  swaps.push(swap);
}

/** Media files (and stashed copies) that some step can bring back: cleaning up unused files keeps them. */
export function heldMedia(entries: readonly Pick<HistoryEntry, 'media' | 'blobs'>[] = h.entries): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) {
    for (const id of e.media ?? []) ids.add(id);
    for (const s of e.blobs ?? []) for (const id of [s.before, s.after]) if (id) ids.add(id);
  }
  return ids;
}

/**
 * Steps left the history: they're deleted from storage with the next save, and files only they held are cleaned up a
 * little later (unless a step holds them again).
 */
function left(steps: readonly HistoryEntry[]): void {
  for (const e of steps) {
    unsaved.delete(e.id);
    goneIds.add(e.id);
  }
  if (!steps.some((e) => e.media || e.blobs)) return;
  clearTimeout(pruning);
  pruning = setTimeout(() => pruneMedia([app.game, app.playGame, app.resumable?.game], heldMedia()), PRUNE_MS);
}

/**
 * What to store of the history with the draft written now (`rev` marks that draft): the steps new or changed since
 * the last time, and the ones gone since. When that write fails, `failed()` makes them wait for the next one.
 */
export function toSave(rev: string): { history: SavedHistory; steps: StoredStep[]; dropped: string[]; failed: () => void } {
  const steps = h.entries.filter((e) => unsaved.has(e.id)).map(stored);
  const dropped = [...goneIds];
  unsaved.clear();
  goneIds.clear();
  const failed = () => {
    const now = new Set(h.entries.map((e) => e.id));
    for (const s of steps) if (now.has(s.id)) unsaved.add(s.id);
    for (const id of dropped) if (!now.has(id)) goneIds.add(id);
  };
  return { history: savedIndex(rev), steps, dropped, failed };
}

const stored = ({ target: _t, focusSession: _f, ...e }: HistoryEntry): StoredStep => e;

function savedIndex(rev: string): SavedHistory {
  return {
    v: 1,
    gameId: game?.id ?? '',
    rev,
    origin: h.origin,
    ids: h.entries.map((e) => e.id),
    index: h.index,
    trimmed: h.trimmed,
    marks: h.marks,
  };
}

/** The whole history as it stands (every step), to keep with the game when another game replaces it (recent.ts). */
export function wholeHistory(): { saved: SavedHistory; steps: StoredStep[] } {
  commit();
  return { saved: savedIndex(''), steps: h.entries.map(stored) };
}

/**
 * The game was saved to a file since its last change (Save, or the desktop app's autosave file), or nothing has changed
 * since it arrived. (An export doesn't count: Export JSON leaves the files out.)
 */
export function savedSinceChange(): boolean {
  if (h.pending) return false;
  return !h.entries.length || h.marks.some((m) => m.at === h.index && (m.kind === 'saved' || m.kind === 'autosaved'));
}

/** Forget every step. */
export function clear(): void {
  commit();
  restart({ kind: 'cleared', label: 'History cleared' });
}

/**
 * Called just before an undo, redo or jump is applied, while the page still shows the game as it was (applying one
 * updates the page at once). Returns the unsubscribe.
 */
export function onApplying(fn: () => void): () => void {
  applyingFns.add(fn);
  return () => applyingFns.delete(fn);
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
  // A change from another field than the last one that changed (a colour picker moved on to the next colour, a number
  // typed in the next box without a key or click the page sees) starts a step of its own: it isn't "2 changes" of one.
  // (Captured before the field's own handler changes the game.) A slider dragged on stays the same field.
  let lastInput: EventTarget | null = null;
  const input = (e: Event) => {
    if (h.pending && lastInput && e.target !== lastInput) commit();
    lastInput = e.target;
  };
  const on: [string, (e: Event) => void][] = [
    ['pointerdown', down],
    ['pointerup', up],
    ['pointercancel', up],
    ['keydown', key],
    ['focusin', focus],
    ['input', input],
    ['change', input],
  ];
  for (const [type, fn] of on) target.addEventListener(type, fn, true);
  return () => {
    for (const [type, fn] of on) target.removeEventListener(type, fn, true);
  };
}
