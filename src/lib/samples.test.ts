import { describe, expect, it } from 'vitest';
import { addSampleGame, TEMPLATES } from './samples';
import { isBoardGame, isRpg, newGame } from './model';
import { validate } from './validate';
import { goToRound, newSession } from './session';
import { movePlayer, startSpace, walk } from './boardgame';

describe('the sample game', () => {
  it('is a complete game of every mode, with nothing to fix', () => {
    const game = newGame();
    expect(addSampleGame(game)).toBe(0);
    expect(game.rounds.map((r) => r.mode)).toEqual(['board', 'rpg', 'boardgame', 'final']);
    expect(game.players).toHaveLength(3);
    expect(game.title).toBe('Sample game');
    expect(validate(game).filter((p) => p.level === 'warn')).toEqual([]);
    // Every round starts.
    const session = newSession(game);
    for (let i = 0; i < game.rounds.length; i++) goToRound(session, game, i);
    expect(session.boardgames && Object.keys(session.boardgames)).toHaveLength(1);
  });

  it('keeps the players and title already there', () => {
    const game = newGame();
    game.title = 'My show';
    game.players = [{ id: 'a', name: 'Zed', color: '#000000' }];
    addSampleGame(game);
    expect([game.title, game.players.length]).toEqual(['My show', 1]);
  });
});

describe('round templates', () => {
  it('each makes a round of its mode (the RPG and board games with nothing to fix: boards start blank)', () => {
    for (const t of TEMPLATES) {
      const game = newGame();
      const r = t.make(game);
      expect(r.mode).toBe(t.mode);
      game.rounds.push(r);
      if (t.mode !== 'board') expect(validate(game).filter((p) => p.level === 'warn'), t.label).toEqual([]);
      if (isRpg(r)) expect(game.worlds?.find((w) => w.id === r.world)?.maps[0].screens).toHaveLength(9);
    }
  });

  it('the 20-space loop goes round, and its “back 3” spaces send players back', () => {
    const r = TEMPLATES.find((t) => t.label === '20-space loop')!.make(newGame());
    if (!isBoardGame(r)) throw new Error('not a board game');
    expect(r.spaces).toHaveLength(20);
    const start = startSpace(r)!;
    expect(walk(r, start.id, 20).path.at(-1)).toBe(start.id);
    const back = r.spaces.find((s) => s.onLand?.[0]?.do === 'steps')!;
    const bs = { positions: { a: { space: back.id } }, order: ['a'], turn: 0 };
    movePlayer(r, bs, 'a', -3);
    expect(r.spaces.indexOf(r.spaces.find((s) => s.id === bs.positions.a.space)!)).toBe(r.spaces.indexOf(back) - 3);
  });
});
