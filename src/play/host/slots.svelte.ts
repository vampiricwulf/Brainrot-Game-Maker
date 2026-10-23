/**
 * The host panel's two shared places, filled by the parts inside it:
 * - NEXT: the one main button of the moment (Show question ▶, Spin!, Next turn ▶…), always in the same cell at the
 *   right of the action row, with its key. A part offers it; the panel shows the first one by priority.
 * - The confirmation strip: a question (Leave this game? Next round with clues left?) as one full-width strip above the
 *   panel's fixed bar, never squeezed into a row of buttons.
 */
import { getContext, onDestroy, setContext, untrack } from 'svelte';
import { ask as askDialog } from '../../lib/ask.svelte';

/** The main button: what it says, its key (shown as a small key cap), and what it does. */
export type NextAction = {
  label: string;
  run: () => void;
  key?: string;
  title?: string;
  disabled?: boolean;
  /** Quiet buttons right beside it, on its left, in the same cell (◀ Previous turn beside Next turn ▶). */
  also?: NextAction[];
};

/** A question for the confirmation strip (as InlineAsk takes it). */
export type HostAsk = {
  text: string;
  ok: string;
  cancel?: string;
  danger?: boolean;
  /** A second answer (InlineAsk's alt). */
  alt?: string;
  onalt?: () => void;
  onok: () => void;
  oncancel: () => void;
};

/** Who offers the main button: the first one with something to offer wins, in this order. */
export type NextFrom = 'tool' | 'dd' | 'partner' | 'final' | 'end' | 'turn' | 'board';
const ORDER: NextFrom[] = ['tool', 'dd', 'partner', 'final', 'end', 'turn', 'board'];

type Slots = {
  offers: Partial<Record<NextFrom, () => NextAction | null>>;
  ask: HostAsk | null;
};

const KEY = Symbol('host-slots');

/** The host panel: make the places (its parts find them). */
export function hostSlots(): Slots & { next: () => NextAction | null } {
  const s = $state<Slots>({ offers: {}, ask: null });
  setContext(KEY, s);
  return Object.assign(s, {
    next: () => {
      for (const k of ORDER) {
        const a = s.offers[k]?.();
        if (a) return a;
      }
      return null;
    },
  });
}

/** A part's main button (what `get` returns, null for none), offered while the part is on screen. */
export function offerNext(from: NextFrom, get: () => NextAction | null): void {
  const s = getContext<Slots | undefined>(KEY);
  if (!s) return;
  $effect(() => {
    untrack(() => (s.offers[from] = get));
    return () => untrack(() => s.offers[from] === get && delete s.offers[from]);
  });
}

/** The confirmation strip, from a part inside the panel (null puts it away). Outside a panel it does nothing. */
export function hostAsk(): (ask: HostAsk | null) => void {
  const s = getContext<Slots | undefined>(KEY);
  return (ask) => {
    if (s) s.ask = ask;
  };
}

/**
 * A yes-or-no question in the confirmation strip, from a part inside the panel: true for the answer button. A new one
 * replaces it (that one answers no), and so does the part going. Outside a panel, the app's own question box asks.
 */
export function hostConfirm(): (text: string, opts: { ok: string; cancel?: string; danger?: boolean }) => Promise<boolean> {
  const s = getContext<Slots | undefined>(KEY);
  let open: { ask: HostAsk | null; done: (yes: boolean) => void } | null = null;
  const end = (yes: boolean) => {
    if (!open) return;
    const { ask, done } = open;
    open = null;
    if (s && s.ask === ask) s.ask = null;
    done(yes);
  };
  onDestroy(() => end(false));
  return (text, opts) => {
    if (!s) return askDialog(text, opts);
    end(false);
    return new Promise((done) => {
      open = { ask: null, done };
      s.ask = { text, ...opts, onok: () => end(true), oncancel: () => end(false) };
      // (The strip's own copy, to know it's still this one.)
      open.ask = s.ask;
    });
  };
}
