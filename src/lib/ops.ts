// Structural edits to a Game that must keep rounds/categories/clues consistent.
import { newCategory, newClue, newId, type Round } from './model';

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
