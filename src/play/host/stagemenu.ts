/**
 * The stage's right-click menu during play (also Shift+F10 on the main button or the stage, and a long press): the
 * moment's own menu. The play screen makes it from the steps its keys do, so it works with the controls hidden; while
 * the host panel is up, its boxes add their own items (✎ Edit wheel, ⇄ Swap…), and a box's item for one of those steps
 * takes that step's place (it knows its box: its words, its greyed state). One order everywhere:
 *   the heading ("🤝 Partner clue · Movies $400"), a box's leading items (who found a Daily Double), the moment's steps in
 *   the main button's order, the boxes' other items, the ways out (✕ Close, ▦ Done ▶ board, ↩ Cancel (keep tile)), then
 *   the standing ones (↶ Undo, ⏸ Cover the screen).
 * Within one moment the items keep their places: one that can't be used now is greyed, not left out.
 */
import type { MenuEntry } from '../../lib/menustate.svelte';
import type { NextAction } from './slots.svelte';

export type MenuItem = Extract<MenuEntry, { label: string }>;

/**
 * An item of the stage's menu. `id`: the step it does (a box's item with the same id, or the same words, takes its
 * place); `lead`: a box's item that comes before the moment's steps.
 */
export type StageItem = MenuItem & { id?: string; lead?: boolean };

/** A moment's own part of the menu, from the steps its keys do. */
export type Moment = {
  heading?: string;
  /** The moment's steps, in the main button's order. */
  steps: StageItem[];
  /** The ways out of it (✕ Close, ▦ Done ▶ board, ↩ Cancel (keep tile)). */
  exits?: StageItem[];
};

/** A key cap as the main button shows it (⏎, ⇧N, Esc) in the words a menu shows ("Enter", "Shift+N", "Esc"). */
export function menuKeys(cap: string | undefined): string | undefined {
  if (!cap) return undefined;
  const shift = cap.startsWith('⇧');
  const key = (shift ? cap.slice(1) : cap).replace('⏎', 'Enter');
  return shift ? `Shift+${key}` : key;
}

/** A step (the main button's, a box's step button's) as an item of the menu. */
export function stepItem(n: NextAction, id?: string): StageItem {
  return {
    ...(id ? { id } : {}),
    label: n.label,
    onclick: n.run,
    ...(n.disabled ? { disabled: true } : {}),
    ...(n.title ? { hint: n.title } : {}),
    ...(n.key ? { keys: menuKeys(n.key) } : {}),
  };
}

/** The same step: the same id, or (with none) the same words. */
const same = (a: StageItem, b: StageItem): boolean => (a.id && b.id ? a.id === b.id : a.label === b.label);

/** Groups of items with a line between each two (empty ones left out). */
function joined(groups: MenuEntry[][]): MenuEntry[] {
  return groups.filter((g) => g.length).flatMap((g, i) => (i ? [{ sep: true } as const, ...g] : g));
}

/**
 * The menu for a moment (`m`), the items the boxes on screen add (`boxes`, in the panel's order), and the standing
 * ones. A box's item for a step or a way out takes its place (keeping the step's key if it has none of its own);
 * the rest come after the steps, or before them when they lead.
 */
export function stageMenuOf(m: Moment, boxes: StageItem[], standing: StageItem[]): MenuEntry[] {
  const own = [...m.steps, ...(m.exits ?? [])];
  const over = (it: StageItem): StageItem => {
    const b = boxes.find((x) => same(x, it));
    return b ? { ...b, keys: b.keys ?? it.keys } : it;
  };
  // (Once each: two boxes may offer the same.)
  const extra = boxes.filter((b, i) => !own.some((it) => same(b, it)) && boxes.findIndex((x) => same(x, b)) === i);
  return [
    ...(m.heading ? [{ heading: m.heading }] : []),
    ...joined([extra.filter((b) => b.lead), m.steps.map(over), extra.filter((b) => !b.lead), (m.exits ?? []).map(over), standing]),
  ];
}
