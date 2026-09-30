// Structural edits to a Game that must keep rounds/categories/clues consistent.
import { boardRounds, isBoard, isBoardGame, isFinal, newCategory, newClue, newId, newTextEl, type Category, type Clue, type Game, type BoardRound, type Round, type Slide, type TextEl } from './model';
import { slideHasContent } from './usage';

/** Something was written or added to this clue (a new clue has none of it). */
export function clueHasContent(clue: Clue): boolean {
  return slideHasContent(clue.questionSlide) || slideHasContent(clue.answerSlide) || !!clue.hostNotes?.trim() || !!clue.tileFace?.text || !!clue.tileFace?.image;
}

/** A category with clues, an image or its own name (not the "Category 3" it started with). */
export function categoryHasContent(cat: Category): boolean {
  return !!cat.image || (!!cat.title.trim() && !/^Category \d+$/.test(cat.title.trim())) || cat.clues.some(clueHasContent);
}

/**
 * The next clue `d` steps along the clue editor's walk (down a category, then on to the next one), skipping
 * empty tiles, or null past either end.
 */
export function stepClue(round: BoardRound, pos: { cat: number; row: number }, d: 1 | -1): { cat: number; row: number } | null {
  const rows = round.values.length;
  for (let idx = pos.cat * rows + pos.row + d; idx >= 0 && idx < round.categories.length * rows; idx += d) {
    const at = { cat: Math.floor(idx / rows), row: idx % rows };
    if (!round.categories[at.cat].clues[at.row]?.empty) return at;
  }
  return null;
}

/**
 * The clue next to `pos` on the board, `dc` categories across or `dr` rows down (the clue editor's Alt+arrows),
 * skipping empty tiles, or null past the edge.
 */
export function neighbourClue(round: BoardRound, pos: { cat: number; row: number }, dc: number, dr: number): { cat: number; row: number } | null {
  for (let cat = pos.cat + dc, row = pos.row + dr; cat >= 0 && cat < round.categories.length && row >= 0 && row < round.values.length; cat += dc, row += dr)
    if (!round.categories[cat].clues[row]?.empty) return { cat, row };
  return null;
}

/** A tile on the board. */
export interface TilePos {
  cat: number;
  row: number;
}

/**
 * Swap the clues of two tiles: slides, type, value, face, timer, notes and whether it's empty all go with the clue.
 * The row values stay put (they belong to the row).
 */
export function swapClues(round: BoardRound, a: TilePos, b: TilePos): void {
  const ca = round.categories[a.cat].clues;
  const cb = round.categories[b.cat].clues;
  const x = ca[a.row];
  ca[a.row] = cb[b.row];
  cb[b.row] = x;
}

/** A copy of a clue with fresh ids (its own, and its slides' items). */
export function copyClue(clue: Clue): Clue {
  const copy = clone(clue);
  copy.id = newId();
  for (const e of [...copy.questionSlide.elements, ...copy.answerSlide.elements]) e.id = newId();
  return copy;
}

/** A slide with nothing on it, keeping the look of its main text (so a restyled board stays restyled). */
function clearSlide(slide: Slide): void {
  const main = slide.elements.find((e): e is TextEl => e.kind === 'text');
  if (main) main.text = '';
  slide.elements = [main ?? newTextEl()];
  slide.background = {};
}

/** Take out what was written or added to a clue (both slides, host notes, tile face). Its type and value stay. */
export function clearClue(clue: Clue): void {
  clearSlide(clue.questionSlide);
  clearSlide(clue.answerSlide);
  delete clue.hostNotes;
  delete clue.tileFace;
}

/**
 * A new row of clues at `at` (0: the top). The row values stay where they are (they belong to the positions), and
 * the board gets one more at the bottom, like adding a row with the count. At most 10 rows.
 */
export function insertRow(round: BoardRound, at: number): boolean {
  if (round.values.length >= 10) return false;
  const n = round.values.length;
  const step = n > 1 ? round.values[n - 1] - round.values[n - 2] : round.values[0] || 100;
  round.values.push((round.values[n - 1] ?? 0) + step);
  for (const cat of round.categories) cat.clues.splice(at, 0, newClue());
  return true;
}

/** Delete a row of clues: the ones below move up, and the bottom row value goes. At least 1 row stays. */
export function deleteRow(round: BoardRound, at: number): boolean {
  if (round.values.length <= 1 || at < 0 || at >= round.values.length) return false;
  round.values.pop();
  for (const cat of round.categories) cat.clues.splice(at, 1);
  return true;
}

/** Move a row of clues (every category's) to another row; the row values stay by position. */
export function moveRow(round: BoardRound, from: number, to: number): boolean {
  const n = round.values.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return false;
  for (const cat of round.categories) {
    const [c] = cat.clues.splice(from, 1);
    cat.clues.splice(to, 0, c);
  }
  return true;
}

export function setRowCount(round: BoardRound, rows: number): void {
  rows = Math.max(1, Math.min(10, Math.floor(rows)));
  const cur = round.values.length;
  if (rows > cur) {
    const step = round.values[1] !== undefined ? round.values[1] - round.values[0] : round.values[0] || 100;
    for (let i = cur; i < rows; i++) round.values.push((round.values[i - 1] ?? 0) + step);
  } else {
    round.values.length = rows;
  }
  for (const cat of round.categories) {
    while (cat.clues.length < rows) cat.clues.push(newClue());
    cat.clues.length = rows;
  }
}

export function addCategory(round: BoardRound, at = round.categories.length): void {
  if (round.categories.length >= 10) return;
  round.categories.splice(at, 0, newCategory(round.values.length, `Category ${round.categories.length + 1}`));
}

export function removeCategory(round: BoardRound, index: number): void {
  if (round.categories.length <= 1) return;
  round.categories.splice(index, 1);
}

export function moveCategory(round: BoardRound, from: number, to: number): void {
  if (to < 0 || to >= round.categories.length) return;
  const [c] = round.categories.splice(from, 1);
  round.categories.splice(to, 0, c);
}

export function duplicateCategory(round: BoardRound, index: number): void {
  if (round.categories.length >= 10) return;
  const copy = clone(round.categories[index]);
  copy.id = newId();
  for (const c of copy.clues) c.id = newId();
  copy.title += ' (copy)';
  round.categories.splice(index + 1, 0, copy);
}

/** Multiply all row values of a round (e.g. ×2 for Double Jeopardy). */
export function scaleValues(round: BoardRound, factor: number): void {
  round.values = round.values.map((v) => Math.round(v * factor));
}

/** Deep copy of plain game data (works on Svelte state proxies, unlike structuredClone). */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------- Slide text styles ----------

const STYLE_KEYS = [
  'font', 'size', 'weight', 'italic', 'underline', 'uppercase', 'color', 'align', 'vAlign', 'lineHeight',
  'letterSpacing', 'stroke', 'shadow', 'glow', 'background', 'autoFit',
] as const;

export function copyTextStyle(from: TextEl, to: TextEl): void {
  // Optional effects (outline, glow, background box) are undefined when off; clone() can't copy that.
  for (const k of STYLE_KEYS) (to as unknown as Record<string, unknown>)[k] = from[k] === undefined ? undefined : clone(from[k]);
}

/**
 * The main text elements that "Use this style elsewhere" would restyle (never `from` itself).
 * scope: `${'cat' | 'round' | 'game'}-${'q' | 'a' | 'qa'}`; 'cat' needs the category (or finds nothing).
 */
export function textStyleTargets(game: Game, round: BoardRound | null, from: TextEl, scope: string, category?: Category | null): TextEl[] {
  const [where, which] = scope.split('-');
  const cats =
    where === 'cat' ? (category ? [category] : []) : (where === 'game' || !round ? boardRounds(game) : [round]).flatMap((r) => r.categories);
  const slides: Slide[] = [];
  for (const c of cats)
    for (const cl of c.clues) {
      if (which.includes('q')) slides.push(cl.questionSlide);
      if (which.includes('a')) slides.push(cl.answerSlide);
    }
  if (where === 'game')
    for (const r of game.rounds.filter(isFinal)) {
      if (which.includes('q')) slides.push(r.questionSlide);
      if (which.includes('a')) slides.push(r.answerSlide);
    }
  const out: TextEl[] = [];
  for (const s of slides) {
    const t = s.elements.find((e): e is TextEl => e.kind === 'text');
    if (t && t !== from) out.push(t);
  }
  return out;
}

/** Copy `from`'s style onto `targets`. Returns a function that puts their previous styles back. */
export function restyle(from: TextEl, targets: TextEl[]): () => void {
  const before = targets.map((t) => clone(t));
  for (const t of targets) copyTextStyle(from, t);
  return () => targets.forEach((t, i) => copyTextStyle(before[i], t));
}

/** Copy a text element's style to the main text of other slides. Returns how many slides changed. */
export function applyTextStyle(game: Game, round: BoardRound | null, from: TextEl, scope: string): number {
  const targets = textStyleTargets(game, round, from, scope);
  for (const t of targets) copyTextStyle(from, t);
  return targets.length;
}

/** Fresh ids for a copied round and everything in it (categories, clues, slide elements, decor). */
export function reidRound<R extends Round>(round: R): R {
  const reSlide = (s: Slide) => s.elements.forEach((e) => (e.id = newId()));
  round.id = newId();
  if (isBoard(round)) {
    for (const c of round.categories) {
      c.id = newId();
      for (const cl of c.clues) {
        cl.id = newId();
        reSlide(cl.questionSlide);
        reSlide(cl.answerSlide);
      }
    }
    for (const d of round.decor ?? []) d.id = newId();
  } else if (isFinal(round)) {
    reSlide(round.questionSlide);
    reSlide(round.answerSlide);
  } else if (isBoardGame(round)) {
    // A copy gets its own spaces (and its own board state in play); links follow the new ids.
    const ids = new Map(round.spaces.map((sp) => [sp.id, newId()]));
    for (const sp of round.spaces) {
      sp.id = ids.get(sp.id)!;
      sp.next = sp.next.map((n) => ids.get(n) ?? n);
      for (const a of [...(sp.onPass ?? []), ...(sp.onLand ?? [])]) {
        a.id = newId();
        if (a.do === 'goto' && a.space) a.space = ids.get(a.space) ?? a.space;
      }
    }
    if (round.start) round.start = ids.get(round.start) ?? round.start;
    reSlide(round.slide);
    for (const z of round.zones) reSlide(z.slide);
  }
  return round;
}
