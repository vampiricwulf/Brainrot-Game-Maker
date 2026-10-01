// Importing board clues from a table: a CSV or TSV file, or a block copied from Google Sheets or Excel (which paste
// as tab-separated rows). Columns: category, value, question, answer (a header row can name them in any order).
import { clueValue, newCategory, newClue, setSlideText, slideText, type BoardRound, type Clue } from './model';
import { clearClue, clone, clueHasContent } from './ops';

export interface ImportedClue {
  category: string;
  /** null: the row's value. */
  value: number | null;
  question: string;
  answer: string;
}

/** Most categories and rows a board can have. */
const MAX = 10;

/**
 * Split a table into rows of cells. Tabs (a spreadsheet's copy, or a .tsv) win over commas; quoted cells may hold
 * the separator, quotes ("") and line breaks.
 */
export function parseTable(text: string, sep?: ',' | '\t'): string[][] {
  text = text.replace(/^﻿/, '');
  sep ??= text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) quoted = true;
    else if (ch === sep) row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

/** "$1,000", "400 pts", "-200" → a number; anything else → null. */
export function parseValue(cell: string | undefined): number | null {
  const m = /^([-−]?)[^\p{L}\d\-−]{0,3}([-−]?)(\d+(?:\.\d+)?)(?:pts?|points?)?$/iu.exec((cell ?? '').replace(/[\s,]/g, ''));
  return m ? (m[1] || m[2] ? -1 : 1) * Number(m[3]) : null;
}

type Col = 'category' | 'value' | 'question' | 'answer';
const NAMES: Record<Col, RegExp> = {
  category: /^(category|categories|cat|topic|column)$/i,
  value: /^(value|values|points|pts|price|amount|\$|worth)$/i,
  question: /^(question|questions|clue|clues|prompt|q)$/i,
  answer: /^(answer|answers|response|solution|a)$/i,
};

/** Which column is which, from a header row (null: it isn't one). */
function headerOf(row: string[]): Partial<Record<Col, number>> | null {
  const cols: Partial<Record<Col, number>> = {};
  row.forEach((c, i) => {
    for (const k of Object.keys(NAMES) as Col[]) if (cols[k] === undefined && NAMES[k].test(c)) cols[k] = i;
  });
  return cols.question !== undefined || (cols.category !== undefined && cols.answer !== undefined) ? cols : null;
}

/** Without a header: category, value, question, answer, or fewer of them from the left (a number is the value). */
function guessColumns(cells: string[]): Partial<Record<Col, number>> {
  const n = cells.length;
  if (n >= 4) return { category: 0, value: 1, question: 2, answer: 3 };
  if (n === 3) return parseValue(cells[0]) !== null ? { value: 0, question: 1, answer: 2 } : parseValue(cells[1]) !== null ? { category: 0, value: 1, question: 2 } : { category: 0, question: 1, answer: 2 };
  if (n === 2) return parseValue(cells[0]) !== null ? { value: 0, question: 1 } : { question: 0, answer: 1 };
  return { question: 0 };
}

/** The clues in a table (rows without a question or an answer are left out). */
export function cluesFromTable(rows: string[][], fallbackCategory = ''): ImportedClue[] {
  const head = rows[0] ? headerOf(rows[0]) : null;
  const out: ImportedClue[] = [];
  for (const r of head ? rows.slice(1) : rows) {
    const cols = head ?? guessColumns(r);
    const at = (k: Col) => (cols[k] === undefined ? '' : (r[cols[k]!] ?? ''));
    const clue = { category: at('category') || fallbackCategory, value: parseValue(at('value')), question: at('question'), answer: at('answer') };
    if (clue.question || clue.answer) out.push(clue);
  }
  return out;
}

/** The imported clues by category, in the order they first appear (names match whatever their case). */
export function groupByCategory(clues: ImportedClue[]): { name: string; clues: ImportedClue[] }[] {
  const groups: { name: string; clues: ImportedClue[] }[] = [];
  for (const c of clues) {
    const g = groups.find((x) => x.name.toLowerCase() === c.category.toLowerCase());
    if (g) g.clues.push(c);
    else groups.push({ name: c.category, clues: [c] });
  }
  return groups;
}

/** Write an imported clue onto a tile. */
function write(round: BoardRound, row: number, clue: Clue, c: ImportedClue): void {
  clearClue(clue);
  clue.empty = undefined;
  setSlideText(clue.questionSlide, c.question);
  setSlideText(clue.answerSlide, c.answer);
  // Its own value only when it differs from the row's.
  clue.value = c.value !== null && c.value !== round.values[row] ? c.value : null;
}

export interface ImportPlan {
  /** The board as it will be (a copy: the round itself is untouched). */
  round: BoardRound;
  /** Tiles written, and clues that found no room. */
  placed: number;
  left: number;
  /** Tile ids written (for the preview). */
  filled: Set<string>;
}

/**
 * The board after importing: `fill` keeps what's there, putting each category's clues on its empty tiles (a category
 * of the same name, else an unused one, else a new one); `replace` makes the board exactly the imported categories,
 * with as many rows as the longest one (row values from the imported ones).
 */
export function planImport(source: BoardRound, clues: ImportedClue[], mode: 'fill' | 'replace'): ImportPlan {
  const round = clone(source);
  const groups = groupByCategory(clues);
  const filled = new Set<string>();
  let placed = 0;
  if (mode === 'replace' && groups.length) {
    const rows = Math.max(1, Math.min(MAX, Math.max(...groups.map((g) => g.clues.length))));
    // Row values: the imported ones where a row has one, else the board's (more rows go on in the same steps).
    const values: number[] = [];
    for (let i = 0; i < rows; i++) {
      const step = i > 1 ? values[i - 1] - values[i - 2] : 200;
      values.push(groups.find((g) => g.clues[i]?.value != null)?.clues[i].value ?? source.values[i] ?? (values[i - 1] ?? 0) + step);
    }
    round.values = values;
    const cats = groups.slice(0, MAX).map((g, i) => {
      // Existing categories keep their ids (and their images): the board changes in place.
      const cat = round.categories[i] ?? newCategory(rows);
      cat.title = g.name;
      while (cat.clues.length < rows) cat.clues.push(newClue());
      cat.clues.length = rows;
      cat.clues.forEach((clue, row) => {
        const c = g.clues[row];
        if (c) {
          write(round, row, clue, c);
          filled.add(clue.id);
          placed++;
        } else {
          clearClue(clue);
          clue.value = null;
        }
      });
      return cat;
    });
    round.categories = cats;
  } else if (mode === 'fill') {
    const used = new Set<string>();
    for (const g of groups) {
      const name = g.name.trim();
      let cat = name ? round.categories.find((c) => !used.has(c.id) && c.title.trim().toLowerCase() === name.toLowerCase()) : undefined;
      // An unused category (no clues, its starting name or none) takes the name.
      cat ??= round.categories.find((c) => !used.has(c.id) && !c.image && !c.clues.some(clueHasContent) && (!c.title.trim() || /^Category \d+$/.test(c.title.trim()) || !name));
      if (!cat && round.categories.length < MAX) {
        cat = newCategory(round.values.length);
        round.categories.push(cat);
      }
      if (!cat) continue;
      used.add(cat.id);
      if (name) cat.title = name;
      const queue = [...g.clues];
      cat.clues.forEach((clue, row) => {
        if (!queue.length || clue.empty || clueHasContent(clue)) return;
        write(round, row, clue, queue.shift()!);
        filled.add(clue.id);
        placed++;
      });
    }
  }
  return { round, placed, left: clues.length - placed, filled };
}

/** Put a plan's board in place (keeping the round's own object, its name and its board images). */
export function applyPlan(round: BoardRound, plan: ImportPlan): void {
  round.values = plan.round.values;
  round.categories = plan.round.categories;
}

/**
 * Text pasted on a category's name with several lines: the clues of its column, top down (overwriting what's there).
 * A first line on its own (no answer, more lines after it with one) is the category's name. Returns the clues placed,
 * and how many didn't fit, or null when it isn't a block of clues (a name with a line break is just typed).
 */
export function pasteColumn(round: BoardRound, ci: number, text: string): { placed: number; left: number } | null {
  const rows = parseTable(text.trim(), text.includes('\t') ? '\t' : ',');
  const cat = round.categories[ci];
  if (!cat || rows.length < 2) return null;
  const first = rows[0];
  const named = first.length === 1 && rows.slice(1).some((r) => r.length > 1) && !headerOf(first);
  const clues = cluesFromTable(named ? rows.slice(1) : rows, cat.title);
  if (!clues.length) return null;
  if (named) cat.title = first[0];
  else if (clues[0].category && clues.every((c) => c.category === clues[0].category) && clues[0].category !== cat.title) cat.title = clues[0].category;
  let placed = 0;
  cat.clues.forEach((clue, row) => {
    const c = clues[row];
    if (!c) return;
    write(round, row, clue, c);
    placed++;
  });
  return { placed, left: clues.length - placed };
}

/** A tile's text for the preview: its question, else its value. */
export function previewText(round: BoardRound, ci: number, row: number): string {
  const clue = round.categories[ci].clues[row];
  return slideText(clue.questionSlide).trim() || String(clueValue(round, row, clue));
}
