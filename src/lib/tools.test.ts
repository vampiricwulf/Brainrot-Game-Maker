import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newId } from './model';
import { applyScore, newSession, score } from './session';
import {
  actionDeltas, activeSegments, applyAction, diceCount, initials, newWheel, parseDice, planRollOff, rollPreset, rollResult, segmentAngles, sliceAt,
  sliceLabel, spinSeconds, spinTarget, uniqueLabels, weightedIndex, wheelUsedUp, isRespin, MIN_WEIGHT, sliceWeight,
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

  it('full: players level further down roll again among themselves, so every place is settled', () => {
    // Round 1 → A=6, B=3, C=3, D=1; B and C roll again for 2nd → B=2, C=5.
    const seq = [6, 3, 3, 1, 2, 5].map((v) => (v - 1) / 6 + 0.01);
    let i = 0;
    const plan = planRollOff(['A', 'B', 'C', 'D'], 6, () => seq[i++], true);
    expect(plan.rounds.map((r) => r.players)).toEqual([['A', 'B', 'C', 'D'], ['B', 'C']]);
    expect(plan.ranking).toEqual(['A', 'C', 'B', 'D']);
    expect(plan.winner).toBe('A');
    // Without full, B and C stay level (in the order given).
    i = 0;
    expect(planRollOff(['A', 'B', 'C', 'D'], 6, () => seq[i++]).ranking).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('score actions', () => {
  function setup() {
    const game = jeopardyGame();
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

  it('shares a steal among the players it is for, never the victim, in whole points that add up to what was taken', () => {
    const { session } = setup();
    // The victim tagged as one it's for too: the others share all of it.
    expect(actionDeltas(session, { kind: 'steal', amount: 'all' }, ['p0', 'p1', 'p2'], 'p1')).toEqual({ p0: 150, p2: 150, p1: -300 });
    // 5 between two: 3 and 2, not 3 and 3 (more than the victim had).
    expect(actionDeltas(session, { kind: 'steal', amount: 5 }, ['p1', 'p2'], 'p0')).toEqual({ p1: 3, p2: 2, p0: -5 });
    const d = actionDeltas(session, { kind: 'steal', amount: 1000 }, ['p0', 'p1'], 'p2');
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(0);
    // Only the victim: nothing happens.
    expect(actionDeltas(session, { kind: 'steal', amount: 200 }, ['p0'], 'p0')).toEqual({});
  });

  it('swaps with one player', () => {
    const { session } = setup();
    expect(actionDeltas(session, { kind: 'swapScores' }, ['p0', 'p1'], 'p0')).toEqual({ p1: 700, p0: -700 });
  });

  it('knows a Spin again slice: marked, or named so unless marked otherwise', () => {
    for (const label of ['Spin again', 'spin again!', 'Respin', 'Re-spin', '↻ Spin Again']) expect(isRespin({ label })).toBe(true);
    for (const label of ['Spin the bottle', 'Again', 'Respinning plates later', '']) expect(isRespin({ label }), label).toBe(false);
    expect(isRespin({ label: 'Bonus', respin: true })).toBe(true);
    expect(isRespin({ label: 'Spin again', respin: false })).toBe(false);
  });

  it('a land-once wheel with only Spin again slices left is used up (they never land for good)', () => {
    const { session } = setup();
    const w = newWheel('w', ['a', 'b', 'Spin again']);
    w.removeAfterLanding = true;
    session.removedSegments = { [w.id]: [w.segments[0].id] };
    expect(wheelUsedUp(session, w)).toBe(false);
    session.removedSegments[w.id].push(w.segments[1].id);
    expect(wheelUsedUp(session, w)).toBe(true);
  });

  it("says when a land-once wheel's every slice has landed", () => {
    const { session } = setup();
    const w = newWheel('w', ['a', 'b']);
    session.removedSegments = { [w.id]: w.segments.map((s) => s.id) };
    expect(wheelUsedUp(session, w)).toBe(false); // (not a land-once wheel)
    w.removeAfterLanding = true;
    expect(wheelUsedUp(session, w)).toBe(true);
    session.removedSegments[w.id].pop();
    expect(wheelUsedUp(session, w)).toBe(false);
    // Only the slices this run spins with count.
    expect(wheelUsedUp(session, w, [w.segments[0].id])).toBe(true);
  });

  it('respects removed wheel slices', () => {
    const { session } = setup();
    const w = newWheel('w', ['a', 'b', 'c']);
    w.removeAfterLanding = true;
    session.removedSegments = { [w.id]: [w.segments[0].id] };
    expect(activeSegments(session, w).map((s) => s.label)).toEqual(['b', 'c']);
    // No longer "land once": the slice that landed is back.
    w.removeAfterLanding = false;
    expect(activeSegments(session, w).map((s) => s.label)).toEqual(['a', 'b', 'c']);
  });
});

describe('a slice weight typed in the wheel editor', () => {
  it('is at least 0.1: blank is 1, 0 or less the least (a slice never drops off without a word)', () => {
    expect(sliceWeight('3')).toBe(3);
    expect(sliceWeight('0.5')).toBe(0.5);
    expect(sliceWeight('')).toBe(1);
    expect(sliceWeight('abc')).toBe(1);
    expect(sliceWeight('0')).toBe(MIN_WEIGHT);
    expect(sliceWeight('-3')).toBe(MIN_WEIGHT);
    expect(sliceWeight('0.123')).toBe(0.12);
  });
});

describe('numbers typed in the wheel and dice editors', () => {
  it('keeps a spin to 1–30 s; a blank box keeps the last', () => {
    expect(spinSeconds('999', 5)).toBe(30);
    expect(spinSeconds('0', 5)).toBe(1);
    expect(spinSeconds('0.2', 5)).toBe(1);
    expect(spinSeconds('7.5', 5)).toBe(7.5);
    expect(spinSeconds('', 8)).toBe(8);
  });

  it('keeps a dice count to a whole 1–20; a blank box keeps the last', () => {
    expect(diceCount('500', 2)).toBe(20);
    expect(diceCount('0', 2)).toBe(1);
    expect(diceCount('-3', 2)).toBe(1);
    expect(diceCount('2.6', 2)).toBe(3);
    expect(diceCount('', 4)).toBe(4);
  });
});

describe('what a result is called', () => {
  it('names a blank slice by its number', () => {
    expect(sliceLabel({ id: 'x', label: '  ', color: '#fff', weight: 1 }, 2)).toBe('Slice 3');
    expect(sliceLabel({ id: 'x', label: 'Sing', color: '#fff', weight: 1 }, 2)).toBe('Sing');
  });

  it("shortens players' names to initials that keep their number, and never alike", () => {
    expect(initials('Bartholomew The Magnificent 1/3')).toBe('BTM1/3');
    expect(initials('Bartholomew The Magnificent 2/3')).toBe('BTM2/3');
    expect(initials('TheRealMcCoy Bartholomew')).toBe('TB');
    expect(initials('Supercalifragilistic')).toBe('Super…');
    expect(initials('Al')).toBe('Al');
    expect(initials('Sally')).toBe('Sally');
    expect(uniqueLabels(['TB', 'Ann', 'TB', 'TB'])).toEqual(['TB', 'Ann', 'TB 2', 'TB 3']);
  });

  it('puts the total of many dice first', () => {
    const roll = { dice: [3, 5, 6].map((value) => ({ sides: 6, value })), total: 14 };
    expect(rollResult(roll)).toBe('14 (3 + 5 + 6)');
    expect(rollResult({ ...roll, totalOutcome: { label: 'Sip' } })).toBe('14 → Sip (3 + 5 + 6)');
    expect(rollResult({ dice: [{ sides: 20, value: 7 }], total: 7 })).toBe('7');
  });
});

describe('what a roll comes to', () => {
  it('the total’s outcome, else the first die whose face has more than a label; the other dice with effects too', async () => {
    const { rollOutcome } = await import('./tools');
    const truth = { label: 'Truth', details: 'Tell us a secret' };
    const minus = { label: '-200', scoreAction: { kind: 'add' as const, amount: -200 } };
    const plain = { label: 'Blank' };
    const r = { dice: [{ sides: 6, value: 1, face: plain }, { sides: 6, value: 2, face: truth }, { sides: 6, value: 3, face: minus }], total: 6 };
    expect(rollOutcome(r)).toEqual({ main: truth, others: [{ i: 2, face: minus }] });
    expect(rollOutcome({ ...r, totalOutcome: plain })).toEqual({ main: plain, others: [] });
  });
});
