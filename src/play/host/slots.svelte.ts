/**
 * The host panel's shared places, filled by the parts inside it:
 * - NEXT: the one main button of the moment, always in the same cell at the right of the action row, with its key: the
 *   blue button, the show's next step from Play (goon.ts: Show board ▶, 👁 Reveal answer, ▦ Done ▶ board…). While the
 *   parts move over to it, a part not moved yet still offers its own main button (offerNext, a stop-gap): a tool on
 *   screen first, then the blue button's step, then the parts' offers by priority.
 * - The confirmation strip: a question (Leave this game? Next round with clues left?) as one full-width strip above the
 *   panel's fixed bar, never squeezed into a row of buttons.
 * - The status line's "⚠ Viewers see this" chip, in one window: what each box on screen says viewers can read of it.
 * - The stage's menu: what each box on screen adds to it (see stagemenu.ts), in the main button's order.
 */
import { getContext, onDestroy, setContext, untrack } from 'svelte';
import { ask as askDialog } from '../../lib/ask.svelte';
import { clickGuard, type ClickGuard } from './guard';
import type { StageItem } from './stagemenu';
import type { Verb } from './verbs';

/**
 * The fixed places in a clue's row of buttons (its data-flow mark): the slides' pager (◀ Slide, Next slide ▶), 👁 Reveal
 * answer / 🙈 Hide answer, ↩ Put back (keep tile), and ▦ Done ▶ board (the tiebreaker's 🏁 Back to results).
 */
export type FlowPlace = 'pager' | 'reveal' | 'putback' | 'done';

/** The main button: what it says, its key (shown as a small key cap), and what it does. */
export type NextAction = {
  label: string;
  run: () => void;
  key?: string;
  title?: string;
  disabled?: boolean;
  /** Quiet buttons right beside it, on its left, in the same cell (◀ Previous turn beside Next turn ▶). */
  also?: NextAction[];
  /** It does the step of this place in the row (Next slide ▶, 👁 Reveal answer…): it carries the same mark. */
  flow?: FlowPlace;
  /**
   * A step that can't be undone (cards sent to phones): a click within a second of the step before it waits, on the main
   * button and the box's alike, and this says why ("The question just went up: click again to send the cards").
   */
  final?: string;
  /**
   * A verdict is due (the Final's spotlit player): this is ✔, and `pair` the ✘ right after it, always in that order, an
   * equal pair, neither blue, so clicking the main button over and over never judges anyone.
   */
  pair?: NextAction;
  /** The likely verdict of a pair (a multiple-choice pick that is, or isn't, the right one): ringed, never moved. */
  ring?: boolean;
  /** Nothing is blue: a verdict is due in the moment's box (a live 🤝 partner clue's ✔ Got it / ✘ Missed). */
  quiet?: boolean;
  /** It's the blue button's step (goon.ts): a click goes through the check before going on, Shift+click past it. */
  goes?: boolean;
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
/** Who adds to the stage's menu: the boxes, and the panel's own row (its flow: the clue's buttons), in the main button's order. */
export type MenuFrom = NextFrom | 'flow';
const MENU_ORDER: MenuFrom[] = ['tool', 'flow', 'dd', 'partner', 'final', 'end', 'turn', 'board'];

type Slots = {
  offers: Partial<Record<NextFrom, () => NextAction | null>>;
  /** What each box adds to the stage's menu (see offerMenu). */
  menus: Partial<Record<MenuFrom, () => StageItem[]>>;
  ask: HostAsk | null;
  /** What the boxes on screen say viewers can read of them (see offerExposed). */
  exposed: (() => string | null)[];
};

const KEY = Symbol('host-slots');
const GUARD = Symbol('host-guard');

/**
 * The host panel: make the places (its parts find them), and its one click guard (see guard.ts: panelGuard), for the
 * main button, the boxes' step buttons and their player buttons.
 */
export function hostSlots(): Slots & { next: () => NextAction | null; viewersSee: () => string[]; menu: () => StageItem[] } {
  const s = $state<Slots>({ offers: {}, menus: {}, ask: null, exposed: [] });
  setContext(KEY, s);
  setContext(GUARD, clickGuard());
  return Object.assign(s, {
    /** What the boxes on screen say viewers can read of them, once each. */
    viewersSee: () => [...new Set(s.exposed.map((get) => get()).filter((x): x is string => !!x))],
    /** What the boxes on screen add to the stage's menu, in the main button's order. */
    menu: () => MENU_ORDER.flatMap((k) => s.menus[k]?.() ?? []),
    next: () => {
      for (const k of ORDER) {
        const a = s.offers[k]?.();
        if (a) return a;
      }
      return null;
    },
  });
}

/**
 * A step: its words (VERBS), what it does, and what's particular to it now (greyed, a tooltip, its place in the row),
 * the same for the main button and the box's own step button.
 */
export function step(v: Verb, run: () => void, more: Partial<NextAction> = {}): NextAction {
  return { label: v.label, ...(v.key ? { key: v.key } : {}), ...(v.title ? { title: v.title } : {}), run, ...more };
}

/** The host panel's click guard, for the panel and its parts (outside a panel, one of its own). */
export function panelGuard(): ClickGuard {
  return getContext<ClickGuard | undefined>(GUARD) ?? clickGuard();
}

/**
 * A part's main button (what `get` returns, null for none), offered while the part is on screen: a stop-gap for the
 * moments whose part hasn't moved to the blue button's step yet (goon.ts mainStep), which comes first.
 */
export function offerNext(from: NextFrom, get: () => NextAction | null): void {
  const s = getContext<Slots | undefined>(KEY);
  if (!s) return;
  $effect(() => {
    untrack(() => (s.offers[from] = get));
    return () => untrack(() => s.offers[from] === get && delete s.offers[from]);
  });
}

/**
 * A box's own items for the stage's menu (✎ Edit wheel, ⇄ Swap, its steps as they are in the box), offered while the
 * box is on screen (see stagemenu.ts). They show only what the box shows: in one window, never a card's words, a part,
 * a wager or a typed answer.
 */
export function offerMenu(from: MenuFrom, get: () => StageItem[]): void {
  const s = getContext<Slots | undefined>(KEY);
  if (!s) return;
  $effect(() => {
    untrack(() => (s.menus[from] = get));
    return () => untrack(() => s.menus[from] === get && delete s.menus[from]);
  });
}

/**
 * One window: what a box says viewers can read of it while it's on screen ("⚠ Viewers can see this window: they can
 * read a card's name here, never what's on it."), null for nothing. The status line shows one "⚠ Viewers see this"
 * chip for all of them, always in view, their sentences in its tooltip and for screen readers.
 */
export function offerExposed(get: () => string | null): void {
  const s = getContext<Slots | undefined>(KEY);
  if (!s) return;
  $effect(() => {
    untrack(() => s.exposed.push(get));
    return () =>
      untrack(() => {
        const i = s.exposed.indexOf(get);
        if (i >= 0) s.exposed.splice(i, 1);
      });
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
