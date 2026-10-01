// Reordering and copying rows of the editor's lists: stats, items, shops and what they sell, wheel slices, buttons
// (action lists), dice faces, a board game's zones. Pure: the editors wrap each change in a history step.
import { clampToBoard, nextSpaceName } from './boardgame';
import { newId, type Action, type BoardGameRound, type BoardSpace, type BoardZone, type ItemDef, type Shop, type Slide, type StatField, type WheelSegment } from './model';
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

/** A copy of a board game's zone, its screen too (players sent to the original stay there). */
export function copyZone(z: BoardZone, taken: readonly string[]): BoardZone {
  const copy = { ...clone(z), id: newId(), name: copyName(z.name, taken) };
  reSlide(copy.slide);
  return copy;
}

/**
 * Copies of board spaces for `round` (pasted, or several duplicated at once), moved by (dx, dy) as far as keeps them
 * all on the board, in shape. They get fresh ids and copies of their buttons; the links between them are kept and
 * links to spaces left behind dropped. One named like a space of the round gets the next free "Space N". A Send to
 * button that sent players to one of them sends them to its copy; one sending them to a space or zone this board
 * hasn't got has nothing chosen (the checklist says so).
 */
export function copySpaces(round: BoardGameRound, src: readonly BoardSpace[], dx: number, dy: number): BoardSpace[] {
  if (!src.length) return [];
  const lo = clampToBoard(-Infinity, -Infinity);
  const hi = clampToBoard(Infinity, Infinity);
  const xs = src.map((s) => s.x);
  const ys = src.map((s) => s.y);
  dx = Math.round(Math.max(lo.x - Math.min(...xs), Math.min(hi.x - Math.max(...xs), dx)));
  dy = Math.round(Math.max(lo.y - Math.min(...ys), Math.min(hi.y - Math.max(...ys), dy)));
  const ids = new Map(src.map((s) => [s.id, newId()]));
  const out: BoardSpace[] = [];
  for (const s of src) {
    const c: BoardSpace = { ...clone(s), id: ids.get(s.id)!, x: s.x + dx, y: s.y + dy, next: s.next.filter((n) => ids.has(n)).map((n) => ids.get(n)!) };
    const all = [...round.spaces, ...out];
    if (all.some((x) => x.name === c.name)) c.name = nextSpaceName({ ...round, spaces: all });
    for (const k of ['onPass', 'onLand'] as const) {
      const list = s[k];
      if (!list) continue;
      c[k] = copyActions(list).map((a) => {
        if (a.do !== 'goto') return a;
        if (a.space && ids.has(a.space)) a.space = ids.get(a.space);
        else if (a.space && !round.spaces.some((x) => x.id === a.space)) a.space = undefined;
        if (a.zone && !round.zones.some((z) => z.id === a.zone)) a.zone = undefined;
        return a;
      });
    }
    out.push(c);
  }
  return out;
}

/**
 * How far to move copies of spaces so they don't sit exactly on a space (the originals, or earlier copies): the
 * first of `step`, 2×`step`… that's clear, diagonally down and right.
 */
export function clearOffset(round: BoardGameRound, src: readonly BoardSpace[], step = 40): number {
  for (let k = 1; k < 20; k++) {
    const d = k * step;
    if (!src.some((s) => round.spaces.some((x) => Math.abs(x.x - (s.x + d)) < 12 && Math.abs(x.y - (s.y + d)) < 12))) return d;
  }
  return step;
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
