import { describe, expect, it } from 'vitest';
import { newGame, newId } from './model';
import { applyScore, newSession, score } from './session';
import {
  actionDeltas, activeSegments, applyAction, newWheel, parseDice, planRollOff, rollPreset, segmentAngles, sliceAt,
  spinTarget, weightedIndex,
} from './tools';

function seeded(seed = 42) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

describe('wheel', () => {
  it('lands on heavy slices proportionally (1/1/8 → ~80%)', () => {
    const rand = seeded(7);
    let heavy = 0;
    for (let i = 0; i < 1000; i++) if (weightedIndex([1, 1, 8], rand) === 2) heavy++;
    expect(heavy).toBeGreaterThan(740);
    expect(heavy).toBeLessThan(860);
  });

  it('sizes slices by weight', () => {
    const a = segmentAngles([{ weight: 1 }, { weight: 3 }]);
    expect(a).toEqual([{ start: 0, end: 90 }, { start: 90, end: 360 }]);
  });

  it('plans a spin that stops on the chosen slice, always moving forward', () => {
    const segs = [{ weight: 1 }, { weight: 2 }, { weight: 1 }, { weight: 5 }];
    const rand = seeded(3);
    let from = 0;
    for (let i = 0; i < 200; i++) {
      const target = i % segs.length;
      const to = spinTarget(segs, target, from, rand);
      expect(to).toBeGreaterThan(from + 360 * 5);
      expect(sliceAt(segs, to)).toBe(target);
      from = to;
    }
  });
});

describe('dice', () => {
  it('parses dice notation', () => {
    expect(parseDice('2d6')).toEqual({ sides: 6, count: 2 });
    expect(parseDice('d37')).toEqual({ sides: 37, count: 1 });
    expect(parseDice('d1')).toBeNull();
    expect(parseDice('abc')).toBeNull();
  });

  it('rolls custom faces and maps totals to outcomes', () => {
    const faces = ['Truth', 'Dare', 'Drink', 'Skip', 'Pick', 'Again'].map((label) => ({ label }));
    const p = {
      id: newId(),
      name: 't',
      showTotal: true,
      dice: [{ id: newId(), sides: 6, count: 2, customFaces: faces }],
      totalOutcomes: [{ id: newId(), min: 2, max: 12, outcome: { label: 'in range' } }],
    };
    const r = rollPreset(p, seeded(9));
    expect(r.dice).toHaveLength(2);
    for (const d of r.dice) expect(d.face?.label).toBe(faces[d.value - 1].label);
    expect(r.totalOutcome?.label).toBe('in range');
  });
});

describe('roll-off', () => {
  it('re-rolls only the tied leaders until there is one winner', () => {
    // Force: round 1 → A=5, B=5, C=2 (tie A/B); round 2 → A=1, B=4.
    const seq = [5, 5, 2, 1, 4].map((v) => (v - 1) / 6 + 0.01);
    let i = 0;
    const plan = planRollOff(['A', 'B', 'C'], 6, () => seq[i++]);
    expect(plan.rounds.map((r) => r.players)).toEqual([['A', 'B', 'C'], ['A', 'B']]);
    expect(plan.winner).toBe('B');
    expect(plan.ranking).toEqual(['B', 'A', 'C']);
  });
});

describe('score actions', () => {
  function setup() {
    const game = newGame();
    for (let i = 0; i < 3; i++) game.players.push({ id: `p${i}`, name: `P${i}`, color: `#00000${i}` });
    const session = newSession(game);
    applyScore(session, game, ['p0'], 1000, 'x');
    applyScore(session, game, ['p1'], 300, 'x');
    return { game, session };
  }

  it('computes bankrupt, double, steal and swap', () => {
    const { session } = setup();
    expect(actionDeltas(session, { kind: 'setScore', amount: 0 }, ['p0'], undefined)).toEqual({ p0: -1000 });
    expect(actionDeltas(session, { kind: 'multiplyScore', factor: 2 }, ['p1'], undefined)).toEqual({ p1: 300 });
    expect(actionDeltas(session, { kind: 'steal', amount: 200 }, ['p1'], 'p0')).toEqual({ p1: 200, p0: -200 });
    expect(actionDeltas(session, { kind: 'steal', amount: 'all' }, ['p2'], 'p0')).toEqual({ p2: 1000, p0: -1000 });
    expect(actionDeltas(session, { kind: 'swapScores' }, ['p1'], 'p0')).toEqual({ p1: 700, p0: -700 });
    expect(actionDeltas(session, { kind: 'addRollTimes', multiplier: 100 }, ['p2'], undefined, 7)).toEqual({ p2: 700 });
  });

  it('applies an action as undoable log entries, even below zero', () => {
    const { game, session } = setup();
    game.settings.allowNegativeScores = false;
    applyAction(session, game, { kind: 'addPoints', amount: -500 }, ['p1'], undefined, 'Wheel');
    expect(score(session, 'p1')).toBe(-200);
    expect(session.scoreLog.at(-1)?.reason).toBe('Wheel');
  });

  it('respects removed wheel slices', () => {
    const { session } = setup();
    const w = newWheel('w', ['a', 'b', 'c']);
    session.removedSegments = { [w.id]: [w.segments[0].id] };
    expect(activeSegments(session, w).map((s) => s.label)).toEqual(['b', 'c']);
  });
});
