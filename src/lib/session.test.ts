import { describe, expect, it } from 'vitest';
import { newGame, newId, newRound } from './model';
import { setRowCount, addCategory, removeCategory } from './ops';
import {
  applyScore, backToBoard, ddCap, finalJudge, finalNext, finalWagerCap, goToRound, introNext, randomizeDailyDoubles, tiedLeaders, newSession, openClue, redo, roundComplete, score, setScore, toggleEvent, undo,
} from './session';

function setup(players = 3) {
  const game = newGame();
  for (let i = 0; i < players; i++) game.players.push({ id: newId(), name: `P${i + 1}`, color: `#00000${i}` });
  const session = newSession(game);
  const [a, b, c] = session.players.map((p) => p.id);
  return { game, session, a, b, c };
}

describe('scoring', () => {
  it('awards and deducts custom amounts to any subset of players', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b], 350, 'x');
    applyScore(session, game, [c], -125, 'x');
    applyScore(session, game, [], 400, 'nobody');
    expect([score(session, a), score(session, b), score(session, c)]).toEqual([350, 350, -125]);
  });

  it('clamps deductions at 0 when negative scores are off', () => {
    const { game, session, a } = setup();
    game.settings.allowNegativeScores = false;
    applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [a], -400, 'x');
    expect(score(session, a)).toBe(0);
    expect(applyScore(session, game, [a], -400, 'x')).toHaveLength(0);
  });

  it('undoes and redoes in order, and a new change clears redo', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [a], 200, 'x');
    undo(session);
    expect(score(session, a)).toBe(100);
    undo(session);
    expect(score(session, a)).toBe(0);
    redo(session);
    expect(score(session, a)).toBe(100);
    applyScore(session, game, [a], 5, 'x');
    expect(redo(session)).toBeNull();
    expect(score(session, a)).toBe(105);
  });

  it('can toggle one specific log entry', () => {
    const { game, session, a, b } = setup();
    const [ea] = applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [b], 300, 'x');
    toggleEvent(session, ea.id);
    expect(score(session, a)).toBe(0);
    expect(score(session, b)).toBe(300);
    toggleEvent(session, ea.id);
    expect(score(session, a)).toBe(100);
  });

  it('manual score edits are logged and undoable', () => {
    const { session, a } = setup();
    setScore(session, a, 1234);
    expect(score(session, a)).toBe(1234);
    undo(session);
    expect(score(session, a)).toBe(0);
  });
});

describe('flow', () => {
  it('marks clues used and detects round completion', () => {
    const { game, session } = setup();
    const round = game.rounds[0];
    setRowCount(round, 1);
    while (round.categories.length > 2) removeCategory(round, 0);
    round.categories[1].clues[0].empty = true;
    expect(roundComplete(session, game)).toBe(false);
    openClue(session, { round: 0, cat: 0, row: 0 });
    backToBoard(session, game);
    expect(roundComplete(session, game)).toBe(true);
    game.final.enabled = false;
    goToRound(session, game, 1);
    expect(session.phase).toBe('end');
  });

  it('goes through Final Jeopardy with wagers and a per-player reveal', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], 400, 'x');
    goToRound(session, game, 1);
    expect([session.phase, session.finalStep]).toEqual(['final', 'category']);
    // c has $0 and sits out; reveal order is lowest score first.
    expect(session.final!.players).toEqual([a, b]);
    expect(session.final!.order).toEqual([b, a]);
    expect(finalWagerCap(session, b)).toBe(400);
    finalNext(session); // wagers
    session.final!.wagers[a] = 600;
    session.final!.wagers[b] = 400;
    finalNext(session); // question
    finalNext(session); // answer
    finalNext(session); // reveal
    expect(session.final!.current).toBe(b);
    finalJudge(session, game, b, true);
    finalJudge(session, game, a, false);
    expect([score(session, a), score(session, b)]).toEqual([400, 800]);
    // Re-judging replaces the earlier result instead of stacking.
    finalJudge(session, game, a, true);
    expect(score(session, a)).toBe(1600);
    expect(score(session, c)).toBe(0);
    finalNext(session);
    expect(session.phase).toBe('end');
  });

  it('caps Daily Double wagers TV-style', () => {
    const { game, session, a } = setup();
    expect(ddCap(session, game, a)).toBe(1000);
    applyScore(session, game, [a], 2500, 'x');
    expect(ddCap(session, game, a)).toBe(2500);
  });

  it('places Daily Doubles at most one per category, skipping empty tiles', () => {
    const { game } = setup();
    const round = game.rounds[0];
    round.categories[0].clues.forEach((c) => (c.empty = true));
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(randomizeDailyDoubles(round, 3, rand)).toBe(3);
    const dds = round.categories.map((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').length);
    expect(dds[0]).toBe(0);
    expect(dds.every((n) => n <= 1)).toBe(true);
    expect(dds.reduce((x, y) => x + y)).toBe(3);
  });

  it('runs the round intro steps and detects tied leaders', () => {
    const { game, session, a, b } = setup();
    goToRound(session, game, 0);
    session.phase = 'clue';
    goToRound(session, game, 0);
    expect(session.intro?.stage).toBe('title');
    introNext(session, game);
    expect(session.intro?.stage).toBe('fill');
    introNext(session, game);
    for (let i = 0; i < game.rounds[0].categories.length; i++) introNext(session, game);
    expect(session.intro).toBeNull();
    applyScore(session, game, [a, b], 500, 'x');
    expect(tiedLeaders(session).map((p) => p.id)).toEqual([a, b]);
  });
});

describe('multi-round games', () => {
  it('plays through 3 rounds of different sizes, then Final', () => {
    const game = newGame();
    game.players.push({ id: 'a', name: 'A', color: '#111111' });
    const sizes: [number, number][] = [[6, 5], [4, 3], [8, 7]];
    game.rounds = sizes.map(([cats, rows], i) => {
      const r = newRound(`R${i + 1}`, cats, Array.from({ length: rows }, (_, k) => (k + 1) * 100));
      return r;
    });
    const session = newSession(game);
    sizes.forEach(([cats, rows], i) => {
      expect(game.rounds[i].categories).toHaveLength(cats);
      expect(game.rounds[i].categories.every((c) => c.clues.length === rows)).toBe(true);
      game.rounds[i].categories.forEach((c, ci) =>
        c.clues.forEach((_, row) => {
          openClue(session, { round: i, cat: ci, row }, game);
          applyScore(session, game, ['a'], 1, 'x');
          backToBoard(session, game);
        }),
      );
      expect(roundComplete(session, game, i)).toBe(true);
      goToRound(session, game, i + 1);
    });
    expect(session.phase).toBe('final');
    expect(score(session, 'a')).toBe(6 * 5 + 4 * 3 + 8 * 7);
  });
});

describe('ops', () => {
  it('keeps clue counts in sync with row count', () => {
    const game = newGame();
    const round = game.rounds[0];
    setRowCount(round, 7);
    addCategory(round);
    expect(round.values).toEqual([200, 400, 600, 800, 1000, 1200, 1400]);
    expect(round.categories.every((c) => c.clues.length === 7)).toBe(true);
    setRowCount(round, 3);
    expect(round.categories.every((c) => c.clues.length === 3)).toBe(true);
  });
});
