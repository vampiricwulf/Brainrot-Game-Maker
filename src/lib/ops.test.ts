import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newRound, setSlideText, slideText, textSlide, type FinalRound, type TextEl, type BoardRound, type Game } from './model';
import { followClueText } from './cluetext';

const board = (g: Game, i: number = 0) => g.rounds[i] as BoardRound;
import {
  addCategory,
  categoryHasContent,
  clearClue,
  clueHasContent,
  copyClue,
  deleteRow,
  insertRow,
  moveRow,
  neighbourClue,
  ownTextTargets,
  restyle,
  rowStep,
  setClueType,
  followDailyDoubles,
  setRowCount,
  stepClue,
  swapClues,
  textStyleTargets,
} from './ops';

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

  it("in a Final round or the tiebreaker, “this round” is its own slides, not every board clue", () => {
    const game = jeopardyGame();
    const final = game.rounds.find((r): r is FinalRound => r.mode === 'final')!;
    final.extraSlides = [{ ...textSlide('More'), id: 'x1' }];
    const from = mainText(final.questionSlide);
    expect(ownTextTargets(final, from, 'round-q')).toEqual([mainText(final.extraSlides[0])]);
    expect(ownTextTargets(final, from, 'round-a')).toEqual([mainText(final.answerSlide)]);
    expect(ownTextTargets(final, from, 'round-qa')).toHaveLength(2);
    final.extraSlides = undefined;
    expect(ownTextTargets(final, from, 'round-q')).toHaveLength(0);
  });
});

describe('the quick Question / Answer boxes', () => {
  it('bring a deleted text box back on top of the rest, in the clue text font and colour', () => {
    const game = jeopardyGame();
    game.theme.clueFont = "'Anton', Impact, sans-serif";
    game.theme.clueColor = '#ffcc00';
    const slide = board(game).categories[0].clues[0].questionSlide;
    const pic = newImageEl('m1');
    pic.zIndex = 3;
    slide.elements = [pic];
    const made = setSlideText(slide, 'Who painted the Mona Lisa?');
    expect(made?.zIndex).toBe(4);
    if (made) followClueText(game, [slide]);
    expect([made?.font, made?.color]).toEqual(["'Anton', Impact, sans-serif", '#ffcc00']);
    // Typing on in it changes its words only (a look given to it stays).
    made!.font = 'Arial, Helvetica, sans-serif';
    expect(setSlideText(slide, 'Who painted it?')).toBeUndefined();
    expect([slideText(slide), made!.font, slide.elements.length]).toEqual(['Who painted it?', 'Arial, Helvetica, sans-serif', 2]);
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

describe('new rows and categories', () => {
  it("a new row adds the board's most common step, whether inserted or from the Rows box", () => {
    expect(rowStep([200, 400, 600, 800, 1000])).toBe(200);
    // One odd gap doesn't decide it, at either end.
    expect(rowStep([100, 300, 400, 500])).toBe(100);
    expect(rowStep([100, 200, 300, 500])).toBe(100);
    expect(rowStep([300])).toBe(300);
    expect(rowStep([])).toBe(100);
    const a = newRound('R', 2, [100, 300, 400, 500]);
    const b = newRound('R', 2, [100, 300, 400, 500]);
    insertRow(a, 0);
    setRowCount(b, 5);
    expect(a.values).toEqual([100, 300, 400, 500, 600]);
    expect(b.values).toEqual(a.values);
  });

  it('names a new category by where it goes: the next number at the end, "New category" between others', () => {
    const round = newRound('R', 6);
    addCategory(round);
    expect(round.categories[6].title).toBe('Category 7');
    addCategory(round, 0);
    expect(round.categories[0].title).toBe('New category');
    addCategory(round, 3);
    expect(round.categories[3].title).toBe('New category 2');
    round.categories[8].title = 'Category 10';
    addCategory(round);
    expect(round.categories.map((c) => c.title).slice(-2)).toEqual(['Category 10', 'Category 11']);
  });

  it('a Daily Double placed by hand raises the ⭐ count when the board has more than it says', () => {
    const round = newRound('R', 3);
    setClueType(round, round.categories[0].clues[0], 'dailyDouble');
    expect(round.dailyDoubleCount ?? 1).toBe(1);
    setClueType(round, round.categories[1].clues[0], 'dailyDouble');
    expect(round.dailyDoubleCount).toBe(2);
    // Taking one off leaves the count as it is.
    setClueType(round, round.categories[1].clues[0], 'standard');
    expect(round.dailyDoubleCount).toBe(2);
  });

  it('a Daily Double copied or pasted onto another tile raises the ⭐ count too', () => {
    const round = newRound('R', 3);
    setClueType(round, round.categories[0].clues[0], 'dailyDouble');
    round.categories[2].clues[1] = copyClue(round.categories[0].clues[0]);
    followDailyDoubles(round);
    expect(round.dailyDoubleCount).toBe(2);
  });
});
