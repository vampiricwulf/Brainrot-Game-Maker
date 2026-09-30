// Undo for the slide editor. In the editor it's the game's one history (history.svelte.ts): a discrete change is a
// step of its own, a drag is one step, and Ctrl+Z / Ctrl+Y are the editor's. While a screen is edited live during
// play, the game being played isn't in that history, so the slide keeps a history of its own while it's open (and the
// whole edit is one step of the game in progress once it closes, see LiveScreenEditor).
import { untrack } from 'svelte';
import { SnapshotHistory } from './editing';
import { begin, history, redo, step, stepAsync, undo, type StepOptions } from './history.svelte';
import type { Slide } from './model';

export interface SlideUndo {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Tooltips for ↶ and ↷. */
  readonly undoTitle: string;
  readonly redoTitle: string;
  /** The newest step, and whether a change isn't a step yet: a notice's Undo means that step while both stay put. */
  readonly top: unknown;
  readonly pending: boolean;
  /** Ctrl+Z and Ctrl+Y are the slide editor's own to handle (in the editor, the editor's keys go through the history). */
  readonly keys: boolean;
  /** A discrete change (add, delete, paste…) as a step of its own. `label: null`: named from what changed. */
  step(label: string | null, fn: () => void, opts?: StepOptions): void;
  stepAsync(label: string | null, fn: () => Promise<void>): Promise<void>;
  /** A drag: one step until the returned end(). */
  begin(): () => void;
  undo(): void;
  redo(): void;
}

/** The game's history, for slides in the editor. */
export const gameUndo: SlideUndo = {
  get canUndo() {
    return history.canUndo;
  },
  get canRedo() {
    return history.canRedo;
  },
  get undoTitle() {
    return history.undoTitle;
  },
  get redoTitle() {
    return history.redoTitle;
  },
  get top() {
    return history.top;
  },
  get pending() {
    return history.pending;
  },
  keys: false,
  step: (label, fn, opts) => step(label, fn, opts),
  stepAsync: (label, fn) => stepAsync(label, fn),
  begin: () => begin(),
  undo: () => void undo('button'),
  redo: () => void redo('button'),
};

// Per slide, so it survives switching looks and reopening the screen during the game. Keyed by the slide itself.
const histories = new WeakMap<Slide, SnapshotHistory>();
function historyFor(slide: Slide): SnapshotHistory {
  const now = JSON.stringify(slide);
  const h = histories.get(slide);
  if (!h) {
    const fresh = new SnapshotHistory(now);
    histories.set(slide, fresh);
    return fresh;
  }
  // Changed while no editor showed it: that's one undo step.
  h.commit(now);
  return h;
}

/**
 * A history of the slide's own (a screen edited live during play). Typing and sliders are grouped into one step after
 * a pause. Call it while the slide editor starts (it runs an effect).
 */
export function slideHistory(slide: Slide): SlideUndo {
  const hist = untrack(() => historyFor(slide));
  let hv = $state(0);
  let pending = $state(false);
  let dragging = false;
  $effect(() => {
    const now = JSON.stringify(slide);
    pending = now !== hist.last;
    if (!pending) return;
    const t = setTimeout(() => !dragging && commit(), 400);
    return () => clearTimeout(t);
  });
  const canUndo = $derived(hv >= 0 && (pending || hist.undoStack.length > 0));
  const canRedo = $derived(hv >= 0 && !pending && hist.redoStack.length > 0);

  function commit(): void {
    if (hist.commit(JSON.stringify(slide))) hv++;
    pending = false;
  }
  function restore(s: string | null): void {
    hv++;
    if (s === null) return;
    const d = JSON.parse(s) as Slide;
    slide.background = d.background;
    slide.elements = d.elements;
    pending = false;
  }
  return {
    get canUndo() {
      return canUndo;
    },
    get canRedo() {
      return canRedo;
    },
    undoTitle: 'Undo (Ctrl+Z)',
    redoTitle: 'Redo (Ctrl+Y)',
    get top() {
      return hv;
    },
    get pending() {
      return pending;
    },
    keys: true,
    step(_label, fn) {
      commit();
      fn();
      commit();
    },
    async stepAsync(_label, fn) {
      commit();
      await fn();
      commit();
    },
    begin() {
      commit();
      dragging = true;
      return () => {
        dragging = false;
        commit();
      };
    },
    undo: () => restore(hist.undo(JSON.stringify(slide))),
    redo: () => restore(hist.redo(JSON.stringify(slide))),
  };
}
