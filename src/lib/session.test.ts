import { describe, expect, it } from 'vitest';
import { newGame, newId } from './model';
import { setRowCount, addCategory, removeCategory } from './ops';
import {
  applyScore, backToBoard, finalNext, goToRound, newSession, openClue, redo, roundComplete, score, setScore, toggleEvent, undo,
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

  it('goes through Final Jeopardy when enabled', () => {
    const { game, session } = setup();
    goToRound(session, game, 1);
    expect([session.phase, session.finalStep]).toEqual(['final', 'category']);
    finalNext(session);
    finalNext(session);
    expect(session.finalStep).toBe('answer');
    finalNext(session);
    expect(session.phase).toBe('end');
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
