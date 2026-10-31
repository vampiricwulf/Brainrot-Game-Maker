import { describe, expect, it } from 'vitest';
import { newFinalRound, newGame, newRound, type Game } from '../lib/model';
import { applyScore, newSession, undo } from '../lib/session';
import { keptProgress, keptRound, keptScores, savedWhen } from './keptgame';

function kept(rounds = 1) {
  const game: Game = newGame();
  game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: 'abc'[i], name, color: '#e6194b', startScore: 0 }));
  game.rounds = [...Array.from({ length: rounds - 1 }, (_, i) => newRound(`Round ${i + 1}`)), newFinalRound()];
  if (rounds === 1) game.rounds = [newRound('Jeopardy!')];
  const session = newSession(game);
  session.players = game.players.map((p) => ({ ...p, startScore: 0 }));
  return { game, session };
}

describe('the game kept to resume', () => {
  it('a game only started loses nothing: Start replaces it without asking', () => {
    const { session } = kept();
    expect(keptProgress(session)).toBe(false);
  });

  it('points given, a tile played or open, a spin or a roll, or a later round: Start asks first', () => {
    const { game, session } = kept(3);
    applyScore(session, game, ['a'], 200, 'Award');
    expect(keptProgress(session)).toBe(true);
    // (Points taken back by an Undo are no progress.)
    undo(session);
    expect(keptProgress(session)).toBe(false);
    expect(keptProgress({ ...session, used: { c1: true } })).toBe(true);
    expect(keptProgress({ ...session, currentClue: { round: 0, category: 0, row: 0 } as never })).toBe(true);
    expect(keptProgress({ ...session, currentRound: 1 })).toBe(true);
    expect(keptProgress({ ...session, phase: 'tiebreaker' })).toBe(true);
    expect(keptProgress({ ...session, rollLog: [{ id: 'x', ts: 0, kind: 'dice', label: 'd6', result: '4' }] as never })).toBe(true);
  });

  it('names where it is: the round, "round 2 of 3" (not with one round), or the tiebreaker', () => {
    const { game, session } = kept(3);
    expect(keptRound(game, session)).toEqual({ name: 'Round 1', at: 'round 1 of 3' });
    expect(keptRound(game, { ...session, currentRound: 2 })).toEqual({ name: 'Final Jeopardy!', at: 'round 3 of 3' });
    expect(keptRound(game, { ...session, phase: 'tiebreaker' })).toEqual({ name: 'the tiebreaker', at: '' });
    const one = kept();
    expect(keptRound(one.game, one.session)).toEqual({ name: 'Jeopardy!', at: '' });
  });

  it('its scores, highest first, the first few then how many more; nothing while all are 0', () => {
    const { game, session } = kept();
    expect(keptScores(game, session)).toBe('');
    applyScore(session, game, ['b'], 400, 'Award');
    applyScore(session, game, ['a'], 200, 'Award');
    expect(keptScores(game, session)).toBe('Bob $400, Ann $200, Cat $0');
    expect(keptScores(game, session, 2)).toBe('Bob $400, Ann $200 +1 more');
    session.players[2].name = ' ';
    applyScore(session, game, ['c'], 600, 'Award');
    expect(keptScores(game, session, 1)).toBe('Player 3 $600 +2 more');
  });

  it('when it was saved: the time today, the day too before today', () => {
    const now = new Date(2026, 9, 31, 14, 0).getTime();
    const today = new Date(2026, 9, 31, 2, 41).getTime();
    expect(savedWhen(today, now)).toBe(new Date(today).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const before = new Date(2026, 9, 30, 2, 41).getTime();
    expect(savedWhen(before, now)).not.toBe(savedWhen(today, now));
    expect(savedWhen(before, now)).toContain(new Date(before).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  });
});
