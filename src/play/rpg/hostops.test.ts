import { describe, expect, it } from 'vitest';
import { newGame, type Game, type Session, type SlideElement, type WorldState } from '../../lib/model';
import { addScreenBeside, ensureWorld, newRpgRound } from '../../lib/rpg';
import { goToRound, newSession } from '../../lib/session';
import { addLive, centredOn, droppedObject, liveText } from './hostops';

/** An RPG round with three players standing on its start screen. */
function setup(): { game: Game; session: Session; st: WorldState } {
  const game = newGame();
  game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i}`, name, color: '#e6194b' }));
  const round = newRpgRound(game);
  game.rounds = [round];
  const session = newSession(game);
  goToRound(session, game, 0);
  const st = ensureWorld(session, game, round)!;
  return { game, session, st };
}

/** The avatars' boxes (token and nameplate) on a screen. */
const avatars = (st: WorldState) => Object.values(st.positions).map((p) => ({ x: p.x - 60, y: p.y - 60, w: 120, h: 150 }));
const covers = (el: SlideElement, b: { x: number; y: number; w: number; h: number }) => el.x < b.x + b.w && b.x < el.x + el.w && el.y < b.y + b.h && b.y < el.y + el.h;

describe('improvising on the RPG stage', () => {
  it('puts typed text where no avatar stands', () => {
    const { game, session, st } = setup();
    const text = liveText(game, session, 'Toll situation');
    expect(avatars(st).some((b) => covers(text, b))).toBe(false);
    // The party near the top: the text goes lower down.
    for (const p of Object.values(st.positions)) p.y = 150;
    const low = liveText(game, session, 'Toll situation');
    expect(low.y).toBeGreaterThan(text.y);
    expect(avatars(st).some((b) => covers(low, b))).toBe(false);
  });

  it('drops an item next to the player, clear of everyone’s avatar', () => {
    const { game, st } = setup();
    const bob = st.positions.p1;
    const el = droppedObject(game, { id: 'e', item: null, name: 'Sword of a Thousand Truths', qty: 1 }, st, bob);
    expect(avatars(st).some((b) => covers(el, b))).toBe(false);
    expect(Math.abs(el.x + el.w / 2 - bob.x)).toBeLessThan(10);
    // Standing in a column (they came in from the side): not onto the player below either.
    Object.values(st.positions).forEach((p, i) => Object.assign(p, { x: 150, y: 370 + i * 170 }));
    const side = droppedObject(game, { id: 'e', item: null, name: 'Rock', qty: 1 }, st, st.positions.p1);
    expect(avatars(st).some((b) => covers(side, b))).toBe(false);
    expect(side.x + side.w <= 1920 && side.y + side.h <= 1080 && side.x >= 0).toBe(true);
  });

  it('keeps what is put where the host clicked on the stage, on the screen clicked (split view has several)', () => {
    const { game, session, st } = setup();
    expect(centredOn({ x: 960, y: 540 }, 1200, 200)).toEqual({ x: 360, y: 440 });
    expect(centredOn({ x: 154, y: 1060 }, 1200, 200)).toEqual({ x: 0, y: 880 });
    const map = game.worlds![0].maps[0];
    const beach = addScreenBeside(map, map.screens[0], 'e', 'Beach')!;
    const text = liveText(game, session, 'Beware of the goose');
    expect(addLive(game, session, text, 'Text', { map: map.id, screen: beach.id })).toBe(true);
    expect(st.added[beach.id]).toEqual([text]);
    // By default: the screen the audience follows.
    const other = liveText(game, session, 'Hello');
    addLive(game, session, other, 'Text');
    expect(st.added[map.screens[0].id]).toEqual([other]);
  });
});
