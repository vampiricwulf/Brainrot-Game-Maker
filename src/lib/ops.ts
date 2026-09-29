// Structural edits to a Game that must keep rounds/categories/clues consistent.
import { newCategory, newClue, newId, type Game, type Round, type Slide, type TextEl } from './model';

export function setRowCount(round: Round, rows: number): void {
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

export function addCategory(round: Round, at = round.categories.length): void {
  if (round.categories.length >= 10) return;
  round.categories.splice(at, 0, newCategory(round.values.length, `Category ${round.categories.length + 1}`));
}

export function removeCategory(round: Round, index: number): void {
  if (round.categories.length <= 1) return;
  round.categories.splice(index, 1);
}

export function moveCategory(round: Round, from: number, to: number): void {
  if (to < 0 || to >= round.categories.length) return;
  const [c] = round.categories.splice(from, 1);
  round.categories.splice(to, 0, c);
}

export function duplicateCategory(round: Round, index: number): void {
  if (round.categories.length >= 10) return;
  const copy = clone(round.categories[index]);
  copy.id = newId();
  for (const c of copy.clues) c.id = newId();
  copy.title += ' (copy)';
  round.categories.splice(index + 1, 0, copy);
}

/** Multiply all row values of a round (e.g. ×2 for Double Jeopardy). */
export function scaleValues(round: Round, factor: number): void {
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
  for (const k of STYLE_KEYS) (to as unknown as Record<string, unknown>)[k] = clone(from[k]);
}

/**
 * Copy a text element's style to the main text of other slides.
 * scope: `${'round' | 'game'}-${'q' | 'a' | 'qa'}`. Returns how many slides changed.
 */
export function applyTextStyle(game: Game, round: Round | null, from: TextEl, scope: string): number {
  const [where, which] = scope.split('-');
  const rounds = where === 'game' || !round ? game.rounds : [round];
  const slides: Slide[] = [];
  for (const r of rounds)
    for (const c of r.categories)
      for (const cl of c.clues) {
        if (which.includes('q')) slides.push(cl.questionSlide);
        if (which.includes('a')) slides.push(cl.answerSlide);
      }
  if (where === 'game') {
    if (which.includes('q')) slides.push(game.final.questionSlide);
    if (which.includes('a')) slides.push(game.final.answerSlide);
  }
  let n = 0;
  for (const s of slides) {
    const t = s.elements.find((e): e is TextEl => e.kind === 'text');
    if (t && t !== from) {
      copyTextStyle(from, t);
      n++;
    }
  }
  return n;
}
