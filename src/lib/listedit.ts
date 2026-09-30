// Reordering and copying rows of the editor's lists: stats, items, shops and what they sell, wheel slices, buttons
// (action lists), dice faces. Pure: the editors wrap each change in a history step.
import { newId, type Action, type ItemDef, type Shop, type Slide, type StatField, type WheelSegment } from './model';
import { clone } from './ops';

/** Move the entry at `from` to `to` (the others close up). False when that's no move. */
export function moveTo<T>(list: T[], from: number, to: number): boolean {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
  return true;
}

const reSlide = (s: Slide) => s.elements.forEach((e) => (e.id = newId()));

/** Copies of buttons with fresh ids, their pop-up and question slides too (so editing one leaves the other). */
export function copyActions(list: readonly Action[]): Action[] {
  return clone(list).map((a) => {
    a.id = newId();
    if (a.do === 'popup') reSlide(a.slide);
    else if (a.do === 'question') {
      reSlide(a.question);
      reSlide(a.answer);
    }
    return a;
  });
}

/** 'Potion (copy)', or 'Potion (copy 2)' when that's taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const base = `${name} (copy`;
  if (!taken.includes(`${base})`)) return `${base})`;
  let n = 2;
  while (taken.includes(`${base} ${n})`)) n++;
  return `${base} ${n})`;
}

/** A copy of an item: its Use buttons, look and description, under a new id (players' inventories stay as they are). */
export function copyItem(it: ItemDef, taken: readonly string[]): ItemDef {
  const copy = clone(it);
  copy.id = newId();
  copy.name = copyName(it.name, taken);
  if (it.onUse) copy.onUse = copyActions(it.onUse);
  return copy;
}

/** A copy of a shop with the same stock. */
export function copyShop(s: Shop, taken: readonly string[]): Shop {
  return { ...clone(s), id: newId(), name: copyName(s.name, taken) };
}

/** A copy of a stat's settings (players' own starting values are for the original). */
export function copyStat(f: StatField, taken: readonly string[]): StatField {
  return { ...clone(f), id: newId(), name: copyName(f.name, taken) };
}

/** A copy of a wheel slice, its details and buttons too. */
export function copySegment(seg: WheelSegment): WheelSegment {
  const copy = clone(seg);
  copy.id = newId();
  if (seg.actions) copy.actions = copyActions(seg.actions);
  return copy;
}

/** A pasted list of face labels: one a line, blank lines left out, at most 100. */
export function faceLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 100);
}
