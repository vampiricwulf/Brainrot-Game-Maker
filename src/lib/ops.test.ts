import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newRound, type TextEl, type BoardRound, type Game } from './model';

const board = (g: Game, i: number = 0) => g.rounds[i] as BoardRound;
import { categoryHasContent, clueHasContent, restyle, stepClue, textStyleTargets } from './ops';

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
