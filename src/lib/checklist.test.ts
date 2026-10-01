import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newRound, setSlideText, type BoardRound } from './model';
import { validate } from './validate';
import { checklistLines } from './checklist';
import { STD_DICE, tileDice } from './tools';
import { FACTORY_FONT, followClueText, setClueText } from './cluetext';

const fill = (r: BoardRound) => r.categories.forEach((c) => c.clues.forEach((cl) => (setSlideText(cl.questionSlide, 'Q?'), setSlideText(cl.answerSlide, 'A'))));

describe('the checklist in the sidebar', () => {
  it('says one line a round, and goes to its first unfinished tile', () => {
    const game = jeopardyGame();
    game.rounds.push(newRound('Double Jeopardy!'));
    const lines = () => checklistLines(game, validate(game));
    const board = game.rounds[0] as BoardRound;
    expect(lines().filter((l) => l.tab === 0).map((l) => l.text)).toEqual(['Jeopardy!: 30 clues to finish']);
    expect(lines().filter((l) => l.tab === 2)).toHaveLength(1);
    fill(board);
    board.categories[2].clues[3].answerSlide.elements = [];
    board.categories[4].title = '';
    const line = lines().find((l) => l.tab === 0)!;
    expect(line.text).toBe('Jeopardy!: 1 clue to finish, 1 more to fix');
    expect(line.details).toHaveLength(2);
    expect(line.place).toEqual({ tab: 'round', round: board.id, part: { kind: 'clue', category: board.categories[2].id, clue: board.categories[2].clues[3].id, onBoard: true } });
    // Only a nameless category left: that problem as it is, going to the category.
    setSlideText(board.categories[2].clues[3].answerSlide, 'A');
    const only = lines().find((l) => l.tab === 0)!;
    expect(only.text).toBe('Jeopardy!: 1 category with no name');
    expect(only.place).toEqual({ tab: 'round', round: board.id, part: { kind: 'category', category: board.categories[4].id } });
  });
});

describe('dice tiles', () => {
  it('roll standard dice without a preset', () => {
    const game = jeopardyGame();
    const board = game.rounds[0] as BoardRound;
    fill(board);
    const clue = board.categories[0].clues[0];
    clue.type = 'dice';
    expect(validate(game).some((p) => p.text.includes('wheel/dice tile'))).toBe(true);
    clue.diceId = `${STD_DICE}2d6`;
    expect(validate(game).some((p) => p.text.includes('wheel/dice tile'))).toBe(false);
    expect(tileDice(game, clue.diceId)).toMatchObject({ name: '2d6', showTotal: true, dice: [{ sides: 6, count: 2 }] });
    expect(tileDice(game, `${STD_DICE}nonsense`)).toBeUndefined();
  });
});

describe('the clue text default', () => {
  it('restyles the clues that have no look of their own, and new ones follow', () => {
    const game = jeopardyGame();
    const board = game.rounds[0] as BoardRound;
    const main = (i: number) => board.categories[i].clues[0].questionSlide.elements[0] as { font: string; color: string };
    main(1).font = "'Bangers', cursive";
    expect(setClueText(game, 'font', "'Inter', sans-serif")).toBe(30 * 2 - 1 + 2);
    expect(main(0).font).toBe("'Inter', sans-serif");
    expect(main(1).font).toBe("'Bangers', cursive");
    // Changed again: the ones with the old default change with it.
    setClueText(game, 'font', "'Oswald', sans-serif");
    expect(main(0).font).toBe("'Oswald', sans-serif");
    setClueText(game, 'color', '#ffcc00');
    expect(main(0).color).toBe('#ffcc00');
    const fresh = newRound('More');
    followClueText(game, [fresh.categories[0].clues[0].questionSlide]);
    expect(fresh.categories[0].clues[0].questionSlide.elements[0]).toMatchObject({ font: "'Oswald', sans-serif", color: '#ffcc00' });
    setClueText(game, 'font', undefined);
    expect(main(0).font).toBe(FACTORY_FONT);
    expect(game.theme.clueFont).toBeUndefined();
  });
});
