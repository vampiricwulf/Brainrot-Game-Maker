import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newRound, setSlideText, slideText, type TextEl, type BoardRound, type Game } from './model';

const board = (g: Game, i: number = 0) => g.rounds[i] as BoardRound;
import { categoryHasContent, clearClue, clueHasContent, copyClue, deleteRow, insertRow, moveRow, neighbourClue, restyle, stepClue, swapClues, textStyleTargets } from './ops';

const mainText = (s: { elements: { kind: string }[] }) => s.elements.find((e) => e.kind === 'text') as TextEl;

describe('use this style elsewhere', () => {
  it('finds the main text of the chosen slides, never the source itself', () => {
    const game = jeopardyGame();
    game.rounds.push(newRound('Double', 2, [400, 800]));
    const round = board(game, 0);
    const from = mainText(round.categories[0].clues[0].questionSlide);
    expect(textStyleTargets(game, round, from, 'round-q')).toHaveLength(6 * 5 - 1);
    expect(textStyleTargets(game, round, from, 'round-qa')).toHaveLength(6 * 5 * 2 - 1);
    // Whole game: both rounds plus the final.
    expect(textStyleTargets(game, round, from, 'game-a')).toHaveLength(30 + 4 + 1);
    expect(textStyleTargets(game, null, from, 'game-q')).toHaveLength(30 + 4 + 1 - 1);
    // This category: its 5 clues (another category's clues are left alone).
    const cat = round.categories[0];
    expect(textStyleTargets(game, round, from, 'cat-q', cat)).toHaveLength(5 - 1);
    expect(textStyleTargets(game, round, from, 'cat-a', cat)).toHaveLength(5);
    const both = textStyleTargets(game, round, from, 'cat-qa', cat);
    expect(both).toHaveLength(5 * 2 - 1);
    expect(both).not.toContain(mainText(round.categories[1].clues[0].questionSlide));
    expect(textStyleTargets(game, round, from, 'cat-q', null)).toHaveLength(0);
  });

  it('restyles the targets and can put their old styles back, keeping the words', () => {
    const game = jeopardyGame();
    const round = board(game, 0);
    const from = mainText(round.categories[0].clues[0].questionSlide);
    from.color = '#ff00ff';
    from.size = 64;
    const target = mainText(round.categories[1].clues[0].questionSlide);
    target.text = 'Keep me';
    const undo = restyle(from, [target]);
    expect([target.color, target.size, target.text]).toEqual(['#ff00ff', 64, 'Keep me']);
    undo();
    expect([target.color, target.size, target.text]).toEqual(['#ffffff', 110, 'Keep me']);
  });
});

describe('the clue editor walk (Prev / Next, Ctrl+Enter)', () => {
  it('goes down a category, then on to the next one, and stops at either end', () => {
    const round = newRound('R', 2, [100, 200]);
    expect(stepClue(round, { cat: 0, row: 0 }, 1)).toEqual({ cat: 0, row: 1 });
    expect(stepClue(round, { cat: 0, row: 1 }, 1)).toEqual({ cat: 1, row: 0 });
    expect(stepClue(round, { cat: 1, row: 0 }, -1)).toEqual({ cat: 0, row: 1 });
    expect(stepClue(round, { cat: 0, row: 0 }, -1)).toBeNull();
    expect(stepClue(round, { cat: 1, row: 1 }, 1)).toBeNull();
  });

  it('skips empty tiles, and has nowhere to go when only empty tiles are left that way', () => {
    const round = newRound('R', 2, [100, 200]);
    round.categories[0].clues[1].empty = true;
    expect(stepClue(round, { cat: 0, row: 0 }, 1)).toEqual({ cat: 1, row: 0 });
    expect(stepClue(round, { cat: 1, row: 0 }, -1)).toEqual({ cat: 0, row: 0 });
    round.categories[1].clues[0].empty = true;
    round.categories[1].clues[1].empty = true;
    expect(stepClue(round, { cat: 0, row: 0 }, 1)).toBeNull();
  });
});

describe("the clue editor's Alt+arrows", () => {
  it('go up and down a category and across a row, like the board, skipping empty tiles', () => {
    const round = newRound('R', 3, [100, 200, 300]);
    expect(neighbourClue(round, { cat: 0, row: 0 }, 0, 1)).toEqual({ cat: 0, row: 1 });
    expect(neighbourClue(round, { cat: 0, row: 0 }, 0, -1)).toBeNull();
    expect(neighbourClue(round, { cat: 0, row: 2 }, 1, 0)).toEqual({ cat: 1, row: 2 });
    round.categories[1].clues[2].empty = true;
    expect(neighbourClue(round, { cat: 0, row: 2 }, 1, 0)).toEqual({ cat: 2, row: 2 });
    expect(neighbourClue(round, { cat: 2, row: 2 }, 1, 0)).toBeNull();
    round.categories[2].clues[1].empty = true;
    expect(neighbourClue(round, { cat: 2, row: 0 }, 0, 1)).toEqual({ cat: 2, row: 2 });
  });
});

describe('moving clues around the board', () => {
  it('swaps two tiles with everything on them, and the row values stay', () => {
    const round = newRound('R', 2, [100, 200]);
    const a = round.categories[0].clues[0];
    const b = round.categories[1].clues[1];
    setSlideText(a.questionSlide, 'Who is Pepe?');
    a.type = 'dailyDouble';
    b.empty = true;
    swapClues(round, { cat: 0, row: 0 }, { cat: 1, row: 1 });
    expect(round.categories[1].clues[1]).toBe(a);
    expect(round.categories[0].clues[0]).toBe(b);
    expect(round.values).toEqual([100, 200]);
  });

  it('copies a clue with fresh ids, leaving the original alone', () => {
    const round = newRound('R', 2, [100, 200]);
    const a = round.categories[0].clues[0];
    setSlideText(a.answerSlide, 'Pepe');
    a.hostNotes = 'frog';
    const copy = copyClue(a);
    expect(copy.id).not.toBe(a.id);
    expect(copy.answerSlide.elements[0].id).not.toBe(a.answerSlide.elements[0].id);
    expect([slideText(copy.answerSlide), copy.hostNotes]).toEqual(['Pepe', 'frog']);
    copy.hostNotes = 'toad';
    expect(a.hostNotes).toBe('frog');
  });

  it('clears what was written on a clue, keeping its main text style, type and value', () => {
    const round = newRound('R', 1, [100]);
    const c = round.categories[0].clues[0];
    setSlideText(c.questionSlide, 'Q');
    const main = c.questionSlide.elements[0] as TextEl;
    main.color = '#ff0000';
    c.questionSlide.elements.push({ ...main, id: 'x', text: 'extra' });
    c.questionSlide.background = { color: '#123456' };
    setSlideText(c.answerSlide, 'A');
    c.hostNotes = 'n';
    c.tileFace = { text: 'face' };
    c.type = 'dailyDouble';
    c.value = 999;
    clearClue(c);
    expect(clueHasContent(c)).toBe(false);
    expect(c.questionSlide.elements).toHaveLength(1);
    expect((c.questionSlide.elements[0] as TextEl).color).toBe('#ff0000');
    expect([c.type, c.value, c.hostNotes, c.tileFace]).toEqual(['dailyDouble', 999, undefined, undefined]);
  });
});

describe('rows anywhere', () => {
  const names = (round: BoardRound) => round.categories.map((cat) => cat.clues.map((c) => slideText(c.questionSlide) || '-').join(''));
  const board3 = () => {
    const round = newRound('R', 2, [100, 200, 300]);
    round.categories.forEach((cat, ci) => cat.clues.forEach((c, r) => setSlideText(c.questionSlide, String.fromCharCode(97 + ci * 3 + r))));
    return round;
  };

  it('inserts a row: the clues below move down, and the values stay by position with one more at the bottom', () => {
    const round = board3();
    expect(insertRow(round, 1)).toBe(true);
    expect(names(round)).toEqual(['a-bc', 'd-ef']);
    expect(round.values).toEqual([100, 200, 300, 400]);
    while (round.values.length < 10) insertRow(round, 0);
    expect(insertRow(round, 0)).toBe(false);
  });

  it('deletes a row: the clues below move up, and the bottom value goes', () => {
    const round = board3();
    expect(deleteRow(round, 0)).toBe(true);
    expect(names(round)).toEqual(['bc', 'ef']);
    expect(round.values).toEqual([100, 200]);
    deleteRow(round, 0);
    expect(deleteRow(round, 0)).toBe(false);
  });

  it('moves a row of clues, the values stay', () => {
    const round = board3();
    expect(moveRow(round, 2, 0)).toBe(true);
    expect(names(round)).toEqual(['cab', 'fde']);
    expect(round.values).toEqual([100, 200, 300]);
    expect(moveRow(round, 0, 3)).toBe(false);
  });
});

describe('what shrinking a board would lose', () => {
  it('counts written clues, notes, tile faces, images and names of your own, not a fresh category', () => {
    const round = newRound('R', 2, [100, 200]);
    const [a, b] = round.categories;
    expect(categoryHasContent(a)).toBe(false);
    expect(clueHasContent(a.clues[0])).toBe(false);
    mainText(a.clues[1].answerSlide).text = 'An answer';
    expect(clueHasContent(a.clues[1])).toBe(true);
    expect(categoryHasContent(a)).toBe(true);
    b.clues[0].hostNotes = 'say it slowly';
    expect(clueHasContent(b.clues[0])).toBe(true);
    b.clues[0].hostNotes = undefined;
    b.clues[0].tileFace = { image: 'img1' };
    expect(clueHasContent(b.clues[0])).toBe(true);
    b.clues[0].tileFace = undefined;
    expect(categoryHasContent(b)).toBe(false);
    b.title = 'Movies';
    expect(categoryHasContent(b)).toBe(true);
    b.title = '';
    b.image = 'img2';
    expect(categoryHasContent(b)).toBe(true);
  });
});
