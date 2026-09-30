import { describe, expect, it } from 'vitest';
import { parseGame } from './fileio';
import { FINAL_V1_ROUND_ID, isBoard, isFinal, migrateGame, newGame, textSlide, type Game } from './model';
import { applyScore, finalJudge, finalTag, migrateSession, newSession, score } from './session';

/** A game as Jeopardy Builder saved it (format version 1). */
function v1Game(finalEnabled = true) {
  const g = newGame() as unknown as Record<string, unknown>;
  const rounds = (g.rounds as { mode?: string }[]).filter((r) => r.mode === 'board').map(({ mode: _m, ...r }) => r);
  return {
    ...g,
    version: 1,
    rounds,
    final: { enabled: finalEnabled, name: 'Final Brainrot', category: 'Memes', questionSlide: textSlide('Q?'), answerSlide: textSlide('A!'), timerSeconds: 45 },
  } as unknown as Game;
}

describe('games from before round modes (version 1)', () => {
  it('become version 2: rounds get a mode and an enabled Final becomes the last round', () => {
    const g = migrateGame(parseGame(JSON.stringify(v1Game())));
    expect(g.version).toBe(2);
    expect(g.rounds.map((r) => r.mode)).toEqual(['board', 'final']);
    const f = g.rounds[1];
    expect(isFinal(f) && [f.id, f.name, f.category, f.timerSeconds]).toEqual([FINAL_V1_ROUND_ID, 'Final Brainrot', 'Memes', 45]);
    expect('final' in g).toBe(false);
  });

  it('drops a Final that was switched off', () => {
    const g = migrateGame(v1Game(false));
    expect(g.rounds.every(isBoard)).toBe(true);
  });

  it('leaves version 2 games alone (a second pass changes nothing)', () => {
    const once = migrateGame(v1Game());
    expect(migrateGame(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('refuses games from a newer version with a clear message', () => {
    expect(() => parseGame(JSON.stringify({ ...newGame(), version: 99 }))).toThrow(/newer version/);
  });

  it('carries a saved game in the middle of the Final over to its new round', () => {
    const old = v1Game();
    const game = migrateGame(old);
    const session = newSession(game);
    session.players = [{ id: 'a', name: 'A', color: '#111111', startScore: 0 }];
    applyScore(session, game, ['a'], 500, 'x');
    // What the old version saved: in the Final, on the last board round's index, events tagged 'final'.
    session.phase = 'final';
    session.finalStep = 'reveal';
    session.currentRound = 0;
    session.final = { players: ['a'], wagers: { a: 200 }, order: ['a'], shown: {}, results: { a: 'right' } };
    session.scoreLog.push({ id: 'e1', ts: 1, playerId: 'a', delta: 200, reason: 'Final', clueId: 'final' });
    migrateSession(session, game);
    expect(session.currentRound).toBe(1);
    expect(session.final.roundId).toBe(FINAL_V1_ROUND_ID);
    expect(score(session, 'a')).toBe(700);
    // Re-judging finds the old event under its new tag and replaces it.
    finalJudge(session, game, 'a', false);
    expect(score(session, 'a')).toBe(300);
    expect(session.scoreLog.find((e) => e.id === 'e1')?.clueId).toBe(finalTag(FINAL_V1_ROUND_ID));
  });
});
