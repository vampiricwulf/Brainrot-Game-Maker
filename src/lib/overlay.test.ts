import { describe, expect, it } from 'vitest';
import { newLive } from './live';
import { newGame, PLAYER_WHEEL } from './model';
import { openPlayerWheel, spinWheel } from './overlay';
import { newSession } from './session';
import { validate } from './validate';

function withPlayers() {
  const game = newGame();
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
    const clue = game.rounds[0].categories[0].clues[0];
    clue.type = 'wheel';
    const warn = () => validate(game).some((m) => m.text.includes('wheel/dice tile'));
    expect(warn()).toBe(true);
    clue.wheelId = PLAYER_WHEEL;
    expect(warn()).toBe(false);
  });
});
