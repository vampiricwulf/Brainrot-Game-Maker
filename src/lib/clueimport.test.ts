import { describe, expect, it } from 'vitest';
import { applyPlan, cluesFromTable, parseTable, parseValue, pasteColumn, planImport } from './clueimport';
import { newRound, setSlideText, slideText } from './model';

const q = (r: ReturnType<typeof newRound>, c: number, row: number) => slideText(r.categories[c].clues[row].questionSlide);
const a = (r: ReturnType<typeof newRound>, c: number, row: number) => slideText(r.categories[c].clues[row].answerSlide);

describe('clue import: reading tables', () => {
  it('reads CSV with quotes and a header in any order', () => {
    const rows = parseTable('Answer,Question,Category,Value\n"Paris","Capital of France, obviously",Geo,$200\n"He said ""hi""",Greeting?,Words,400\n');
    expect(rows[1]).toEqual(['Paris', 'Capital of France, obviously', 'Geo', '$200']);
    const clues = cluesFromTable(rows);
    expect(clues).toEqual([
      { category: 'Geo', value: 200, question: 'Capital of France, obviously', answer: 'Paris' },
      { category: 'Words', value: 400, question: 'Greeting?', answer: 'He said "hi"' },
    ]);
  });

  it('reads a block pasted from a spreadsheet (tabs, no header)', () => {
    const clues = cluesFromTable(parseTable('Memes\t100\tDoge breed?\tShiba Inu\nMemes\t200\tRick?\tAstley\r\n'));
    expect(clues.map((c) => [c.category, c.value, c.question, c.answer])).toEqual([
      ['Memes', 100, 'Doge breed?', 'Shiba Inu'],
      ['Memes', 200, 'Rick?', 'Astley'],
    ]);
  });

  it('reads values written with symbols and separators', () => {
    expect([parseValue('$1,000'), parseValue('400 pts'), parseValue('−200'), parseValue('abc'), parseValue('')]).toEqual([1000, 400, -200, null, null]);
  });
});

describe('clue import: onto a board', () => {
  const table = 'category,value,question,answer\nGeo,200,G1,g1\nGeo,400,G2,g2\nFood,200,F1,f1';

  it('fills empty tiles, by category name, keeping what is there', () => {
    const round = newRound('R', 3);
    round.categories[1].title = 'Food';
    setSlideText(round.categories[1].clues[0].questionSlide, 'Mine');
    const plan = planImport(round, cluesFromTable(parseTable(table)), 'fill');
    expect(q(round, 0, 0)).toBe('');
    applyPlan(round, plan);
    expect([round.categories[0].title, q(round, 0, 0), a(round, 0, 1)]).toEqual(['Geo', 'G1', 'g2']);
    // Food's first tile was taken: the clue goes on the next empty one.
    expect([q(round, 1, 0), q(round, 1, 1)]).toEqual(['Mine', 'F1']);
    // A value that's the row's own isn't stored on the clue; one that differs is.
    expect(round.categories[0].clues[0].value).toBeNull();
    expect(round.categories[1].clues[1].value).toBe(200);
    expect([plan.placed, plan.left]).toEqual([3, 0]);
  });

  it('replaces the board with the imported categories and rows', () => {
    const round = newRound('R', 6);
    const id = round.categories[0].id;
    const plan = planImport(round, cluesFromTable(parseTable(table)), 'replace');
    applyPlan(round, plan);
    expect(round.categories.map((c) => c.title)).toEqual(['Geo', 'Food']);
    expect(round.categories[0].id).toBe(id);
    expect(round.values).toEqual([200, 400]);
    expect([q(round, 1, 0), q(round, 1, 1)]).toEqual(['F1', '']);
  });

  it('adds categories up to 10 and counts what found no room', () => {
    const round = newRound('R', 1, [100]);
    const rows = Array.from({ length: 12 }, (_, i) => `C${i},100,Q${i},A${i}`).join('\n');
    const plan = planImport(round, cluesFromTable(parseTable(rows)), 'fill');
    expect(plan.round.categories).toHaveLength(10);
    expect([plan.placed, plan.left]).toEqual([10, 2]);
  });

  it('fills a column from lines pasted on its name (a first line alone is the name)', () => {
    const round = newRound('R', 2);
    expect(pasteColumn(round, 1, 'Just a name')).toBeNull();
    const r = pasteColumn(round, 1, 'Cats\nQ1\tA1\nQ2\tA2\n');
    expect(r).toEqual({ placed: 2, left: 0 });
    expect([round.categories[1].title, q(round, 1, 0), a(round, 1, 1)]).toEqual(['Cats', 'Q1', 'A2']);
    const many = Array.from({ length: 7 }, (_, i) => `${(i + 1) * 100}\tQ${i}\tA${i}`).join('\n');
    expect(pasteColumn(round, 0, many)).toEqual({ placed: 5, left: 2 });
    expect(round.categories[0].clues[0].value).toBe(100);
  });
});
