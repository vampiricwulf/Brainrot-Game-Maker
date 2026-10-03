import { describe, expect, it } from 'vitest';
import { applyPlan, cluesFromTable, parseTable, parseValue, pasteColumn, planImport, tableSeparator } from './clueimport';
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

  it('reads a CSV with semicolons (Excel where the decimal mark is a comma)', () => {
    const text = 'Category;Value;Question;Answer\nGeo;1,000;"Capital of France; obviously";Paris\nWords;400;Greeting?;Hi, you\n';
    expect(tableSeparator(text)).toBe(';');
    expect(cluesFromTable(parseTable(text))).toEqual([
      { category: 'Geo', value: 1000, question: 'Capital of France; obviously', answer: 'Paris' },
      { category: 'Words', value: 400, question: 'Greeting?', answer: 'Hi, you' },
    ]);
    // Commas still win where there are more of them, and tabs over both.
    expect(tableSeparator('a,b;c,d\n')).toBe(',');
    expect(tableSeparator('"x;y;z",b,c\n')).toBe(',');
    expect(tableSeparator('a;b;c\td\n')).toBe('\t');
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

  it('leaves wheel and dice tiles alone when filling, and makes a replaced one a question tile', () => {
    const round = newRound('R', 3);
    round.categories[0].title = 'Geo';
    Object.assign(round.categories[0].clues[0], { type: 'wheel', wheelId: 'w1' });
    const plan = planImport(round, cluesFromTable(parseTable(table)), 'fill');
    const geo = plan.round.categories[0].clues;
    expect([geo[0].type, slideText(geo[0].questionSlide), slideText(geo[1].questionSlide), plan.placed]).toEqual(['wheel', '', 'G2', 3]);
    const replaced = planImport(round, cluesFromTable(parseTable(table)), 'replace').round.categories[0].clues[0];
    expect([replaced.type, replaced.wheelId, slideText(replaced.questionSlide)]).toEqual(['standard', undefined, 'G1']);
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

  it('puts a clue on the row of its value', () => {
    const round = newRound('R', 2, [200, 400, 600]);
    const clues = cluesFromTable(parseTable('Memes,600,Late,l\nMemes,,First free,f'));
    applyPlan(round, planImport(round, clues, 'fill'));
    expect([q(round, 0, 0), q(round, 0, 1), q(round, 0, 2)]).toEqual(['First free', '', 'Late']);
    // Replacing: the rows are the values given (every clue has one).
    const r2 = newRound('R', 2);
    applyPlan(r2, planImport(r2, cluesFromTable(parseTable('A,100,a1,x\nA,300,a3,x\nB,200,b2,x')), 'replace'));
    expect(r2.values).toEqual([100, 200, 300]);
    expect([q(r2, 0, 2), q(r2, 1, 1), q(r2, 1, 0)]).toEqual(['a3', 'b2', '']);
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
