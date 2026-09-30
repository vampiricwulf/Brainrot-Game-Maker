import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newLive, overlayDoneAt } from './live';
import { PLAYER_WHEEL, type BoardRound, type Game } from './model';

const board = (g: Game, i: number = 0) => g.rounds[i] as BoardRound;
import { addWheel, editWheel, openPlayerWheel, removeWheel, openWheel, resetWheelEdits, spinWheel, startRollOff, wheelPool } from './overlay';
import { newWheel, parseQuickWheel } from './tools';
import { newSession } from './session';
import { validate } from './validate';

function withPlayers() {
  const game = jeopardyGame();
  game.players = [
    { id: 'a', name: 'Ann', color: '#ff0000' },
    { id: 'b', name: 'Bob', color: '#00ff00' },
    { id: 'c', name: 'Cat', color: '#0000ff' },
  ];
  return { game, session: newSession(game), live: newLive() };
}

describe('Pick a player wheel', () => {
  it('has a slice per player, in their colors', () => {
    const { session, live } = withPlayers();
    openPlayerWheel(live, session);
    const o = live.overlay!;
    expect(o.kind === 'wheel' && o.players).toBe(true);
    if (o.kind !== 'wheel') return;
    expect(o.segments.map((s) => [s.id, s.label, s.color])).toEqual([
      ['a', 'Ann', '#ff0000'],
      ['b', 'Bob', '#00ff00'],
      ['c', 'Cat', '#0000ff'],
    ]);
  });

  it('lands on a current player (players changed after it opened) and logs who it was', () => {
    const { game, session, live } = withPlayers();
    openPlayerWheel(live, session);
    session.players = session.players.filter((p) => p.id !== 'a');
    session.players[0].name = 'Bobby';
    for (let i = 0; i < 20; i++) {
      spinWheel(live, session, game);
      const o = live.overlay!;
      if (o.kind !== 'wheel' || o.result === null) throw new Error('no result');
      const seg = o.segments[o.result];
      expect(['b', 'c']).toContain(seg.id);
      expect(o.tagged).toEqual([seg.id]);
      const log = session.rollLog!.at(-1)!;
      expect([log.name, log.result, log.playerIds]).toEqual(['Pick a player', seg.label, [seg.id]]);
    }
    expect(session.rollLog!.some((e) => e.result === 'Bobby')).toBe(true);
  });

  it('counts as a chosen wheel for a wheel tile', () => {
    const { game } = withPlayers();
    const clue = board(game, 0).categories[0].clues[0];
    clue.type = 'wheel';
    const warn = () => validate(game).some((m) => m.text.includes('wheel/dice tile'));
    expect(warn()).toBe(true);
    clue.wheelId = PLAYER_WHEEL;
    expect(warn()).toBe(false);
  });
});

describe('editing a wheel for one spin', () => {
  it('reads weights from quick wheel lines', () => {
    expect(parseQuickWheel('Sing a song\nPush-ups x3\n  Skip ×0.5 \n\nTop 10\nNope *0')).toEqual([
      { label: 'Sing a song', weight: 1 },
      { label: 'Push-ups', weight: 3 },
      { label: 'Skip', weight: 0.5 },
      { label: 'Top 10', weight: 1 },
    ]);
  });

  it('leaves players out and changes chances, only for this run', () => {
    const { game, session, live } = withPlayers();
    openPlayerWheel(live, session);
    const o = live.overlay!;
    if (o.kind !== 'wheel') throw new Error('no wheel');
    const pool = wheelPool(o, session, game);
    pool[0].off = true; // Ann sits this one out
    pool[1].weight = 3;
    editWheel(o, pool);
    expect(o.segments.map((s) => [s.label, s.weight])).toEqual([['Bob', 3], ['Cat', 1]]);
    // A player who joins later gets a normal chance; Ann stays out.
    session.players.push({ id: 'd', name: 'Dee', color: '#ffffff', startScore: 0 });
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      spinWheel(live, session, game);
      seen.add(o.segments[o.result!].id);
    }
    expect(o.segments.map((s) => s.id)).toEqual(['b', 'c', 'd']);
    expect(seen.has('a')).toBe(false);
    // The edit box shows everyone, Ann switched off.
    expect(wheelPool(o, session, game).map((s) => [s.id, !!s.off])).toEqual([['a', true], ['b', false], ['c', false], ['d', false]]);
    resetWheelEdits(o, session, game);
    expect(o.pool).toBeUndefined();
    expect(o.segments.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it("never changes the saved wheel", () => {
    const { game, session, live } = withPlayers();
    const w = newWheel('Dares', ['A', 'B', 'C']);
    game.wheels.push(w);
    openWheel(live, session, w);
    const o = live.overlay!;
    if (o.kind !== 'wheel') throw new Error('no wheel');
    const pool = wheelPool(o, session, game);
    pool[2].off = true;
    pool[0].weight = 5;
    pool[1].label = 'B!';
    editWheel(o, pool);
    for (let i = 0; i < 20; i++) {
      spinWheel(live, session, game);
      expect(['A', 'B!']).toContain(o.segments[o.result!].label);
    }
    expect(w.segments.map((s) => [s.label, s.weight])).toEqual([['A', 1], ['B', 1], ['C', 1]]);
  });
});

describe('several wheels at once', () => {
  it('spins every wheel together, each landing on its own slice, and logs each result', () => {
    const { game, session, live } = withPlayers();
    const good = newWheel('Good Wheel');
    const bad = newWheel('Bad Wheel');
    game.wheels = [good, bad];
    openWheel(live, session, good);
    addWheel(live, session, game, bad.id);
    addWheel(live, session, game, PLAYER_WHEEL);
    const o = live.overlay!;
    if (o.kind !== 'wheel') throw new Error('no wheel');
    expect(o.extra?.map((w) => w.name)).toEqual(['Bad Wheel', 'Pick a player']);
    spinWheel(live, session, game);
    expect(o.result).not.toBeNull();
    expect(o.extra!.every((w) => w.result !== null && w.spin)).toBe(true);
    expect(o.extra![1].segments[o.extra![1].result!].id).toMatch(/^[abc]$/);
    expect(session.rollLog?.map((r) => r.name)).toEqual(['Good Wheel', 'Bad Wheel', 'Pick a player']);
    // The overlay is done when the last wheel stops.
    expect(overlayDoneAt(o)).toBe(Math.max(o.spin!.startedAt + o.spin!.duration, ...o.extra!.map((w) => w.spin!.startedAt + w.spin!.duration)));
    removeWheel(live, o.extra![0].key);
    removeWheel(live, o.extra![0].key);
    expect(o.extra).toBeUndefined();
  });
});

describe('roll-off die', () => {
  it('rolls a d20 for a blank die box and at least a d2, so it never ties forever', () => {
    const { session, live } = withPlayers();
    for (const [sides, want] of [[null, 20], [0, 20], [1, 2], [6.7, 6], [5000, 1000]] as const) {
      startRollOff(live, session, ['a', 'b', 'c'], sides as unknown as number);
      const o = live.overlay!;
      if (o.kind !== 'rolloff') throw new Error('no roll-off');
      expect(o.sides).toBe(want);
      expect(session.rollLog!.at(-1)!.name).toBe(`Roll-off (d${want})`);
    }
  });
});
