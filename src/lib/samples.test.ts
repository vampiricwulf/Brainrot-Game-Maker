import { describe, expect, it } from 'vitest';
import { addSampleGame, TEMPLATES } from './samples';
import { isBoardGame, isRpg, newGame } from './model';
import { validate } from './validate';
import { goToRound, newSession } from './session';
import { movePlayer, nameShown, spaceKindOf, startSpace, walk } from './boardgame';
import { runAction } from './actions';
import { newLive } from './live';
import { statNumber } from './toolset';
import { presetStat } from './rpgpresets';

describe('the sample game', () => {
  it('is a complete game of every mode, with nothing to fix', () => {
    const game = newGame();
    expect(addSampleGame(game)).toBe(0);
    expect(game.rounds.map((r) => r.mode)).toEqual(['slides', 'board', 'rpg', 'boardgame', 'final']);
    expect(game.players).toHaveLength(3);
    expect(game.title).toBe('Sample game');
    expect(validate(game).filter((p) => p.level === 'warn')).toEqual([]);
    // Every round starts.
    const session = newSession(game);
    for (let i = 0; i < game.rounds.length; i++) goToRound(session, game, i);
    expect(session.boardgames && Object.keys(session.boardgames)).toHaveLength(1);
  });

  it('keeps the players and title already there', () => {
    const game = newGame();
    game.title = 'My show';
    game.players = [{ id: 'a', name: 'Zed', color: '#000000' }];
    addSampleGame(game);
    expect([game.title, game.players.length]).toEqual(['My show', 1]);
  });
});

describe('the sample game’s looks', () => {
  it('its board game’s special spaces show their names and an emoji, and their kind', () => {
    const game = newGame();
    addSampleGame(game);
    const bg = game.rounds.find(isBoardGame)!;
    const specials = bg.spaces.filter((s) => s.onLand?.length);
    expect(specials.map((s) => s.name)).toEqual(['Bonus', 'Go back', 'Nap time', 'Roll again']);
    expect(specials.every(nameShown)).toBe(true);
    expect(specials.every((s) => !!s.mark)).toBe(true);
    expect(specials.map(spaceKindOf)).toEqual(['star', 'back', 'skip', null]);
    // Plain spaces keep their names off the board.
    expect(bg.spaces.filter((s) => !s.onLand?.length && s !== bg.spaces[0]).some(nameShown)).toBe(false);
  });

  it('its players’ colors are far apart in hue (no two blues)', () => {
    const game = newGame();
    addSampleGame(game);
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const hs = game.players.map((p) => hue(p.color));
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) {
        const gap = Math.abs(hs[i] - hs[j]);
        expect(Math.min(gap, 360 - gap)).toBeGreaterThan(60);
      }
  });
});

describe('round templates', () => {
  it('each makes a round of its mode (the RPG and board games with nothing to fix: boards start blank)', () => {
    for (const t of TEMPLATES) {
      const game = newGame();
      const r = t.make(game);
      expect(r.mode).toBe(t.mode);
      game.rounds.push(r);
      if (t.mode !== 'board') expect(validate(game).filter((p) => p.level === 'warn'), t.label).toEqual([]);
      if (isRpg(r)) expect(game.worlds?.find((w) => w.id === r.world)?.maps[0].screens).toHaveLength(t.label === 'Mini quest' ? 3 : 9);
    }
  });

  it('the Mini quest’s Sword, used, beats the boss (as its lair’s note says): without it, nobody can', () => {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    const r = TEMPLATES.find((t) => t.label === 'Mini quest')!.make(game);
    if (!isRpg(r)) throw new Error('not an RPG');
    game.rounds.push(r);
    const power = game.statFields!.find((f) => f.name === 'Power')!;
    const lair = game.worlds![0].maps[0].screens[2];
    const boss = lair.slide.elements.find((e) => e.name === 'Boss')!.role!.stats!.find((x) => x.name === 'Power')!.value as number;
    const session = newSession(game);
    expect(statNumber(game, session, 'a', power)).toBeLessThan(boss);
    // What its owner's sheet › Use does: it acts on them.
    const sword = game.items!.find((x) => x.name === 'Sword')!;
    for (const a of sword.onUse!) runAction({ game, session, live: newLive(), selected: [], chosen: ['a'] }, a);
    expect(statNumber(game, session, 'a', power)).toBeGreaterThan(boss);
    expect(lair.hostNotes).toMatch(/Sword\? Use it first .*Use: Power \+4\)/);
  });

  it('the Mini quest keeps a Sword the game already had, and its note only promises what that Sword’s Use does', () => {
    const plain = newGame();
    plain.items = [{ id: 'own', name: 'Sword', stackable: false, description: 'Just for show.' }];
    const r = TEMPLATES.find((t) => t.label === 'Mini quest')!.make(plain);
    if (!isRpg(r)) throw new Error('not an RPG');
    expect(plain.items.filter((x) => x.name === 'Sword')).toEqual([{ id: 'own', name: 'Sword', stackable: false, description: 'Just for show.' }]);
    expect(plain.shops![0].stock.some((s) => s.item === 'own')).toBe(true);
    // No Use button on its sheet: no Sword tip in the lair's note.
    expect(plain.worlds![0].maps[0].screens[2].hostNotes).not.toMatch(/Sword/);
    // One that does something: the note says what.
    const healing = newGame();
    presetStat(healing, 'HP');
    const hp = healing.statFields!.find((f) => f.name === 'HP')!;
    healing.items = [{ id: 'own', name: 'Sword', stackable: false, onUse: [{ id: 'u', do: 'stat', field: hp.id, op: 'add', amount: 2, who: 'ask' }] }];
    TEMPLATES.find((t) => t.label === 'Mini quest')!.make(healing);
    expect(healing.worlds![0].maps[0].screens[2].hostNotes).toMatch(/Use: HP \+2\)/);
  });

  it('the 20-space loop goes round, and its “back 3” spaces send players back', () => {
    const r = TEMPLATES.find((t) => t.label === '20-space loop')!.make(newGame());
    if (!isBoardGame(r)) throw new Error('not a board game');
    expect(r.spaces).toHaveLength(20);
    const start = startSpace(r)!;
    expect(walk(r, start.id, 20).path.at(-1)).toBe(start.id);
    const back = r.spaces.find((s) => s.onLand?.[0]?.do === 'steps')!;
    const bs = { positions: { a: { space: back.id } }, order: ['a'], turn: 0 };
    movePlayer(r, bs, 'a', -3);
    expect(r.spaces.indexOf(r.spaces.find((s) => s.id === bs.positions.a.space)!)).toBe(r.spaces.indexOf(back) - 3);
  });
});
