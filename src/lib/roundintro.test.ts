import { describe, expect, it } from 'vitest';
import { newBoardGameRound } from './boardgame';
import { newFinalRound, newGame, newId, newRound, type Game } from './model';
import { newRpgRound } from './rpg';
import { goToRound, introNext, newSession } from './session';

/** A board round, then an RPG round, a board-game round and a Final. */
function setup(): { game: Game; session: ReturnType<typeof newSession> } {
  const game = newGame();
  game.players.push({ id: newId(), name: 'Ann', color: '#ff0000' });
  game.rounds.push(newRound('Jeopardy!', 2), newRpgRound(game, 'Dungeon'), newBoardGameRound('Race'), newFinalRound());
  return { game, session: newSession(game) };
}

describe('round intros for every kind of round', () => {
  it('an RPG, board-game or Final round opens on its title card, and N (introNext) goes on to the round', () => {
    const { game, session } = setup();
    for (const [i, phase] of [[1, 'rpg'], [2, 'boardgame'], [3, 'final']] as const) {
      goToRound(session, game, i);
      expect(session.phase).toBe(phase);
      expect(session.intro).toEqual({ stage: 'title', revealed: 0 });
      introNext(session, game);
      expect(session.intro).toBeNull();
    }
  });

  it('only the first visit shows it, and not when going back to it', () => {
    const { game, session } = setup();
    goToRound(session, game, 1);
    goToRound(session, game, 2);
    goToRound(session, game, 1);
    expect(session.intro).toBeNull();
    goToRound(session, game, 2);
    expect(session.intro).toBeNull();
    // Jumping back to a round never visited is its first visit: viewers haven't seen it (as for board rounds).
    goToRound(session, game, 3);
    goToRound(session, game, 0);
    expect(session.phase).toBe('board');
    expect(session.intro).toEqual({ stage: 'title', revealed: 0 });
    // A game saved before the rounds shown were kept: going back counts as seen, as it used to.
    goToRound(session, game, 3);
    delete session.introducedRounds;
    goToRound(session, game, 1);
    expect(session.intro).toBeNull();
  });

  it('follows the "title card" setting', () => {
    const { game, session } = setup();
    game.settings.roundIntro.titleCard = false;
    goToRound(session, game, 1);
    expect(session.intro).toBeNull();
  });

  it('a game that opens with an RPG round shows its title card too', () => {
    const { game, session } = setup();
    game.rounds.shift();
    goToRound(session, game, 0);
    expect(session.phase).toBe('rpg');
    expect(session.intro?.stage).toBe('title');
  });
});
