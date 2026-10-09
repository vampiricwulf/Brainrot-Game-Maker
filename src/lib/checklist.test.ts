import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newRound, PLAYER_WHEEL, setSlideText, type BoardRound } from './model';
import { validate } from './validate';
import { checklistLines, toolChosen } from './checklist';
import { newRpgRound, newScreen } from './rpg';
import { raceRound } from './samples';
import { STD_DICE, tileDice } from './tools';
import { FACTORY_FONT, followClueText, setClueText, setTheme } from './cluetext';

const fill = (r: BoardRound) => r.categories.forEach((c) => c.clues.forEach((cl) => (setSlideText(cl.questionSlide, 'Q?'), setSlideText(cl.answerSlide, 'A'))));

describe('the checklist in the sidebar', () => {
  it('says one line a round, and goes to its first unfinished tile', () => {
    const game = jeopardyGame();
    game.rounds.push(newRound('Double Jeopardy!'));
    const lines = () => checklistLines(game, validate(game));
    const board = game.rounds[0] as BoardRound;
    // A new board's Daily Double, not placed yet, isn't one more thing to fix: Start game places it.
    board.dailyDoubleCount = 1;
    board.categories.forEach((c) => c.clues.forEach((cl) => (cl.type = 'standard')));
    expect(lines().filter((l) => l.tab === 0).map((l) => l.text)).toEqual(['Jeopardy!: 30 clues to finish']);
    // (Daily Doubles: below.)
    board.dailyDoubleCount = 0;
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

describe('the checklist: Daily Doubles, RPG screens and board-game spaces', () => {
  it('says when a board has fewer Daily Doubles than it wants, as the pre-game screen does', () => {
    const game = jeopardyGame();
    const board = game.rounds[0] as BoardRound;
    fill(board);
    board.categories.forEach((c) => c.clues.forEach((cl) => (cl.type = 'standard')));
    board.dailyDoubleCount = 2;
    board.categories[1].clues[4].type = 'dailyDouble';
    expect(checklistLines(game, validate(game)).filter((l) => l.tab === 0).map((l) => l.text)).toEqual([
      'Jeopardy!: 1 Daily Double not placed yet (Start game puts it on the board at random)',
    ]);
    // A note, not a warning.
    expect(checklistLines(game, validate(game)).find((l) => l.tab === 0)?.level).toBe('info');
    board.categories[3].clues[2].type = 'dailyDouble';
    expect(checklistLines(game, validate(game)).filter((l) => l.tab === 0)).toEqual([]);
    // No more than the board has tiles for.
    board.dailyDoubleCount = 99;
    board.categories.forEach((c) => c.clues.forEach((cl) => (cl.type = 'dailyDouble')));
    expect(validate(game).some((p) => p.text.includes('Daily Double'))).toBe(false);
  });

  it('goes to the screen or the space a problem is on', () => {
    const game = jeopardyGame();
    game.rounds = [];
    const rpg = newRpgRound(game, 'Quest');
    game.rounds.push(rpg);
    const world = game.worlds![0];
    const map = world.maps[0];
    const cave = newScreen(1, 0, 'Cave');
    map.screens.push(cave);
    cave.exits = { e: { kind: 'warp', to: { map: map.id, screen: 'gone' } } };
    const race = raceRound();
    game.rounds.push(race);
    race.spaces[3].onLand = [{ id: 'g', do: 'goto', space: 'gone', who: 'ask' }];
    const lines = checklistLines(game, validate(game));
    expect(lines.find((l) => l.tab === 0)).toMatchObject({ text: 'Quest: a way out of “Cave” leads nowhere', place: { tab: 'world', world: world.id, map: map.id, screen: cave.id } });
    // (The Race's Finish is where the path is meant to end: nothing to say about it.)
    expect(lines.find((l) => l.tab === 1)).toMatchObject({ text: 'Race: a button on “Space 4” points nowhere', place: { tab: 'round', round: race.id, part: { kind: 'space', space: race.spaces[3].id } } });
    race.spaces[3].onLand = undefined;
    expect(lines.length - checklistLines(game, validate(game)).length).toBe(1);
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

  it('a wheel or dice tile is done with its wheel or dice, whatever its question (the board editor says so on the tile too)', () => {
    const game = jeopardyGame();
    const board = game.rounds[0] as BoardRound;
    const clue = board.categories[0].clues[0];
    expect(toolChosen(game, clue)).toBe(true);
    clue.type = 'wheel';
    expect(toolChosen(game, clue)).toBe(false);
    clue.wheelId = PLAYER_WHEEL;
    expect(toolChosen(game, clue)).toBe(true);
    // A wheel deleted from Wheels & Dice: none chosen.
    clue.wheelId = 'gone';
    expect(toolChosen(game, clue)).toBe(false);
    clue.type = 'dice';
    clue.diceId = `${STD_DICE}2d6`;
    expect(toolChosen(game, clue)).toBe(true);
    const lines = checklistLines(game, validate(game));
    expect(lines.find((l) => l.tab === 0)?.text).toBe('Jeopardy!: 29 clues to finish');
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

  it('a whole theme used in the game restyles the clue text as the Clue text box would', () => {
    const game = jeopardyGame();
    const board = game.rounds[0] as BoardRound;
    const main = () => board.categories[0].clues[0].questionSlide.elements[0] as { font: string; color: string };
    setTheme(game, { ...game.theme, clueFont: "'Oswald', sans-serif", clueColor: '#ffcc00', value: '#123456' });
    expect([main().font, main().color, game.theme.value, game.theme.clueFont]).toEqual(["'Oswald', sans-serif", '#ffcc00', '#123456', "'Oswald', sans-serif"]);
    // One with each clue's own look: the clues go back to a new text box's look.
    setTheme(game, { ...game.theme, clueFont: undefined, clueColor: undefined });
    expect(main().font).toBe(FACTORY_FONT);
    expect(game.theme.clueColor).toBeUndefined();
  });
});
