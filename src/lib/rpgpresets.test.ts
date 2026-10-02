import { describe, expect, it } from 'vitest';
import { newGame, newTextEl, type BoardSpace, type Game } from './model';
import { addFork, applySpaceKind, nameShown, newBoardGameRound, SPACE_KINDS, spaceKindOf, spaceNumber } from './boardgame';
import { enemyObject, enemyRole, newShop, numberStat, presetStat } from './rpgpresets';
import { classIcon, classLabel } from './rpg';
import { layerIcon } from './layerlabel';
import { STAT_PRESETS } from './toolset';
import { miniQuestRound, TEMPLATES } from './samples';
import { validate } from './validate';
import { isBoardGame } from './model';

function withCatalog(): Game {
  const game = newGame();
  game.statFields = [STAT_PRESETS[1].make()];
  game.items = [
    { id: 'i1', name: 'Potion', stackable: true, price: 5 },
    { id: 'i2', name: 'Sword', stackable: false, price: 8 },
  ];
  return game;
}

describe('shops made where they’re used', () => {
  it('a new shop sells the whole catalog for the first currency, with a name no shop has', () => {
    const game = withCatalog();
    const a = newShop(game);
    expect(a.name).toBe('Shop 1');
    expect(a.currency).toBe(game.statFields![0].id);
    expect(a.stock).toEqual([
      { item: 'i1', qty: null },
      { item: 'i2', qty: null },
    ]);
    expect(newShop(game, 'Old Man’s shop').name).toBe('Old Man’s shop');
    expect(newShop(game, 'Old Man’s shop').name).toBe('Old Man’s shop 2');
    expect(game.shops).toHaveLength(3);
  });
});

describe('stat presets', () => {
  it('Gold starts at 10, so a shop can be tried at once', () => {
    expect(STAT_PRESETS.find((p) => p.label.includes('Gold'))!.make().start).toBe(10);
  });

  it('presetStat adds a stat once, and finds one of the same name', () => {
    const game = newGame();
    const hp = presetStat(game, 'HP');
    expect(presetStat(game, 'HP')).toBe(hp);
    expect(numberStat(game, 'hp')).toBe(hp);
    expect(game.statFields).toHaveLength(1);
  });
});

describe('enemies', () => {
  it('is a character with its own HP and Power that viewers see, and a roll to fight', () => {
    const r = enemyRole(newGame());
    expect(r.class).toBe('npc');
    expect(r.stats).toEqual([
      { name: 'HP', value: 5 },
      { name: 'Power', value: 2 },
    ]);
    expect(r.statsShown).toBe(true);
    expect(r.actions?.map((a) => a.do)).toEqual(['dice']);
  });

  it('takes 1 HP from the player who fought when the game has HP', () => {
    const game = newGame();
    const hp = presetStat(game, 'HP');
    const el = enemyObject(game, 'Dragon', '🐉', 9, 4);
    expect(el.name).toBe('Dragon');
    expect(el.hostNotes).toMatch(/Compare/);
    expect(el.role?.stats?.map((s) => s.value)).toEqual([9, 4]);
    expect(el.role?.actions?.[1]).toMatchObject({ do: 'stat', field: hp.id, amount: -1, who: 'ask' });
  });
});

describe('what objects are called', () => {
  it('a class reads as a word, never its code', () => {
    expect(classLabel('npc')).toBe('Character');
    expect(classLabel('spawn')).toBe('Arrival point');
    expect(classIcon('npc')).toBe('🧙');
    expect(classIcon(undefined)).toBeUndefined();
  });

  it('the Layers icon says what an object is', () => {
    const el = newTextEl('🧙');
    expect(layerIcon(el)).toBe('🅣');
    el.role = { class: 'npc' };
    expect(layerIcon(el)).toBe('🧙');
    el.role = { class: 'item' };
    expect(layerIcon(el)).toBe('📦');
  });
});

describe('kinds of board space', () => {
  it('fills in a space’s landing buttons, color and emoji, and names a numbered space', () => {
    const round = newBoardGameRound();
    const s = round.spaces[3];
    expect(spaceNumber(s.name)).toBe('4');
    applySpaceKind(s, 'skip');
    expect([s.name, s.mark, s.color]).toEqual(['Skip a turn', '⏭', '#911eb4']);
    // Its name shows on the board: viewers can tell a special space from the rest.
    expect(nameShown(s)).toBe(true);
    expect(s.onLand?.map((a) => a.do)).toEqual(['skip']);
    // A space with a name of its own keeps it.
    s.name = 'Nap';
    applySpaceKind(s, 'back');
    expect(s.name).toBe('Nap');
    expect(s.onLand).toMatchObject([{ do: 'steps', steps: -3, who: 'party' }]);
  });

  it('a shop space opens the shop given; a boss fight takes HP when the game has it', () => {
    const s: BoardSpace = { id: 'x', name: 'Space 2', x: 0, y: 0, color: '#000', next: [] };
    applySpaceKind(s, 'shop', { shop: 'sh1' });
    expect(s.onLand).toMatchObject([{ do: 'shop', shop: 'sh1' }]);
    applySpaceKind(s, 'boss', {});
    expect(s.onLand?.map((a) => a.do)).toEqual(['dice', 'score', 'steps']);
    applySpaceKind(s, 'boss', { hp: 'f_hp' });
    expect(s.onLand?.map((a) => a.do)).toEqual(['dice', 'score', 'stat', 'steps']);
    expect(new Set(s.onLand?.map((a) => a.id)).size).toBe(4);
  });

  it('tells a space’s kind from its landing buttons (each kind, and ones made by hand)', () => {
    const round = newBoardGameRound();
    for (const k of SPACE_KINDS) {
      const s = round.spaces[1];
      applySpaceKind(s, k.kind, { shop: 'sh1', hp: 'f_hp' });
      expect(spaceKindOf(s)).toBe(k.kind);
    }
    const s = round.spaces[2];
    expect(spaceKindOf(s)).toBeNull();
    s.onLand = [{ id: 'a', do: 'score', amount: 100, who: 'party' }];
    expect(spaceKindOf(s)).toBe('star');
    s.onLand = [{ id: 'a', do: 'again', who: 'party' }];
    expect(spaceKindOf(s)).toBeNull();
    s.onLand = [{ id: 'a', do: 'steps', steps: -2, who: 'party' }];
    expect(spaceKindOf(s)).toBe('back');
    s.onLand = [{ id: 'a', do: 'score', amount: -100, who: 'party' }];
    expect(spaceKindOf(s)).toBeNull();
  });

  it('every kind makes a round with nothing to fix', () => {
    const game = withCatalog();
    const shop = newShop(game);
    const round = newBoardGameRound();
    SPACE_KINDS.forEach((k, i) => applySpaceKind(round.spaces[i + 1], k.kind, { shop: shop.id }));
    game.rounds.push(round);
    expect(validate(game).filter((p) => p.level === 'warn')).toEqual([]);
  });
});

describe('⑂ Add a fork here', () => {
  it('adds a second way on, beside the first, that meets it again a space later', () => {
    const round = newBoardGameRound();
    const [a, b, c] = round.spaces;
    const f = addFork(round, a);
    expect(a.next).toEqual([b.id, f.id]);
    expect(f.next).toEqual([c.id]);
    expect(round.spaces).toHaveLength(13);
    // Inside the loop (toward the board's middle), off the line between a and c.
    expect(f.y).toBeGreaterThan(b.y);
  });

  it('at the end of a path, it leads nowhere yet', () => {
    const round = newBoardGameRound();
    const end = round.spaces[11];
    end.next = [];
    const f = addFork(round, end);
    expect(end.next).toEqual([f.id]);
    expect(f.next).toEqual([]);
  });
});

describe('templates with shops and fights', () => {
  it('Mini quest: a village shop, gold to find and a boss guarding a hidden treasure, with nothing to fix', () => {
    const game = newGame();
    const r = miniQuestRound(game);
    game.rounds.push(r);
    expect(validate(game).filter((p) => p.level === 'warn')).toEqual([]);
    expect(game.statFields?.map((f) => [f.name, f.start])).toEqual([
      ['HP', 10],
      ['Gold', 10],
      ['Power', 1],
    ]);
    expect(game.shops?.[0]).toMatchObject({ name: 'Village shop', currency: game.statFields?.[1].id });
    const els = game.worlds![0].maps[0].screens.flatMap((s) => s.slide.elements);
    const keeper = els.find((e) => e.name === 'Shopkeeper')!;
    expect(keeper.role).toMatchObject({ class: 'npc', shop: game.shops![0].id });
    const boss = els.find((e) => e.name === 'Boss')!;
    const chest = els.find((e) => e.name === 'Treasure')!;
    expect(chest.secret).toBe(true);
    expect(boss.role?.actions?.map((a) => a.do)).toEqual(['dice', 'stat', 'reveal', 'score']);
    expect(boss.role?.actions?.find((a) => a.do === 'reveal')).toMatchObject({ object: chest.id });
    // Every price is one the starting gold can pay.
    const cheapest = Math.min(...game.items!.map((i) => i.price ?? 0));
    expect(cheapest).toBeLessThanOrEqual(10);
  });

  it('the 20-space loop gives 2 gold for passing Start when the game has gold', () => {
    const loop = TEMPLATES.find((t) => t.label === '20-space loop')!;
    const plain = loop.make(newGame());
    if (!isBoardGame(plain)) throw new Error('not a board game');
    expect(plain.spaces[0].onPass?.map((a) => a.do)).toEqual(['score']);
    const game = withCatalog();
    const r = loop.make(game);
    if (!isBoardGame(r)) throw new Error('not a board game');
    expect(r.spaces[0].onPass?.[1]).toMatchObject({ do: 'stat', field: game.statFields![0].id, op: 'add', amount: 2 });
  });
});
