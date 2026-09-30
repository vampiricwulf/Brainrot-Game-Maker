import { describe, expect, it } from 'vitest';
import { newGame, newId, newTextEl, type Game, type Session, type Shop } from './model';
import { applyScore, newSession, redo, score, setScore, stepOf, toggleEvent, toggleStep, undo } from './session';
import { addScreenBeside, newWorld } from './rpg';
import {
  addStat,
  buy,
  clampStat,
  lastAction,
  startStep,
  countItem,
  giveItem,
  inventory,
  logged,
  newStatField,
  redoAction,
  redoFrom,
  type Undone,
  wornItems,
  wornPlace,
  SLOT_PLACE,
  SCORE_CURRENCY,
  shopCurrency,
  sell,
  setStat,
  statValue,
  stockLeft,
  takeItem,
  transferEntry,
  undoAction,
} from './toolset';

function setup(): { game: Game; session: Session } {
  const game = newGame();
  game.players = [
    { id: 'a', name: 'Ann', color: '#e6194b', stats: {} },
    { id: 'b', name: 'Bob', color: '#3cb44b' },
  ];
  const hp = { ...newStatField('HP'), id: 'hp', start: 10, min: 0, max: 10, display: 'bar' as const };
  const gold = { ...newStatField('Gold'), id: 'gold', start: 5, min: 0, currency: true, symbol: '🪙' };
  game.statFields = [hp, gold];
  game.players[0].stats = { gold: 20 }; // "Ann starts rich"
  game.items = [
    { id: 'potion', name: 'Potion', stackable: true, price: 4 },
    { id: 'sword', name: 'Sword', stackable: false, price: 12, wearable: { slot: 'hand' } },
  ];
  return { game, session: newSession(game) };
}

describe('stats', () => {
  it('start from the field, or the player’s own starting value, and stay within min and max', () => {
    const { game, session } = setup();
    const [hp, gold] = game.statFields!;
    expect([statValue(game, session, 'a', gold), statValue(game, session, 'b', gold)]).toEqual([20, 5]);
    expect(addStat(game, session, 'b', hp, -15)).toBe(-10);
    expect(statValue(game, session, 'b', hp)).toBe(0);
    setStat(session, 'b', hp, 99);
    expect(statValue(game, session, 'b', hp)).toBe(10);
    // What a typed value becomes, so the log and the box can say so.
    expect([clampStat(hp, 25), clampStat(gold, -5), clampStat(hp, 'x')]).toEqual([10, 0, 0]);
  });
});

describe('inventory', () => {
  it('stacks stackable items, keeps others separate, and takes and transfers them', () => {
    const { game, session } = setup();
    giveItem(game, session, 'a', 'potion', 2);
    giveItem(game, session, 'a', 'potion', 1);
    giveItem(game, session, 'a', 'sword', 2);
    giveItem(game, session, 'a', null, 1, 'A very suspicious rock');
    expect(inventory(session, 'a').map((e) => [e.item ?? e.name, e.qty])).toEqual([
      ['potion', 3],
      ['sword', 1],
      ['sword', 1],
      ['A very suspicious rock', 1],
    ]);
    expect(takeItem(session, 'a', 'potion', 5)).toBe(3);
    expect(countItem(session, 'a', 'potion')).toBe(0);
    const rock = inventory(session, 'a').find((e) => !e.item)!;
    transferEntry(session, 'a', 'b', rock.id);
    expect(inventory(session, 'b').map((e) => e.name)).toEqual(['A very suspicious rock']);
    expect(inventory(session, 'a').some((e) => !e.item)).toBe(false);
  });
});

describe('shops', () => {
  const shop = (id: string, pool?: string): Shop => ({ id, name: id, currency: 'gold', pool, stock: [{ item: 'sword', qty: 1 }, { item: 'potion', price: 3, qty: null }] });

  it('charges the currency, hands over the item and lowers the stock', () => {
    const { game, session } = setup();
    const s = shop('village');
    const r = buy(game, session, s, 'a', 'sword');
    expect(r).toEqual({ ok: true, text: 'Ann bought Sword for 🪙12' });
    expect(statValue(game, session, 'a', game.statFields![1])).toBe(8);
    expect(countItem(session, 'a', 'sword')).toBe(1);
    expect(stockLeft(session, s, 'sword')).toBe(0);
    expect(buy(game, session, s, 'a', 'sword')).toEqual({ ok: false, error: 'Sold out' });
    // Unlimited stock, and the shop's own price.
    buy(game, session, s, 'a', 'potion');
    expect(stockLeft(session, s, 'potion')).toBeNull();
    expect(statValue(game, session, 'a', game.statFields![1])).toBe(5);
  });

  it('says when a player is short, and lets the host sell anyway (going negative) or haggle', () => {
    const { game, session } = setup();
    const s = shop('village');
    expect(buy(game, session, s, 'b', 'sword')).toEqual({ ok: false, error: 'Short by 🪙7' });
    expect(buy(game, session, s, 'b', 'sword', { allowShort: true }).ok).toBe(true);
    expect(statValue(game, session, 'b', game.statFields![1])).toBe(-7);
    buy(game, session, shop('other'), 'a', 'sword', { price: 1 });
    expect(statValue(game, session, 'a', game.statFields![1])).toBe(19);
  });

  it('shares stock between shops in the same pool (the Village and the Shadow Realm)', () => {
    const { game, session } = setup();
    const village = shop('village', 'shared');
    const realm = shop('realm', 'shared');
    buy(game, session, village, 'a', 'sword');
    expect(stockLeft(session, realm, 'sword')).toBe(0);
    expect(buy(game, session, realm, 'a', 'sword')).toEqual({ ok: false, error: 'Sold out' });
  });

  it('buys things back for a share of the price, and restocks them', () => {
    const { game, session } = setup();
    const s = { ...shop('village'), buysBack: { rate: 0.5 } };
    buy(game, session, s, 'a', 'sword');
    const sword = inventory(session, 'a').find((e) => e.item === 'sword')!;
    expect(sell(game, session, s, 'a', sword.id)).toEqual({ ok: true, text: 'Ann sold Sword for 🪙6' });
    expect(statValue(game, session, 'a', game.statFields![1])).toBe(14);
    expect(countItem(session, 'a', 'sword')).toBe(0);
    expect(stockLeft(session, s, 'sword')).toBe(1);
    giveItem(game, session, 'a', 'potion', 1);
    const potion = inventory(session, 'a')[0];
    expect(sell(game, session, shop('other'), 'a', potion.id)).toEqual({ ok: false, error: 'other doesn’t buy things back' });
  });
});

describe('action log', () => {
  it('undoes and redoes stat, item and stock changes as single steps', () => {
    const { game, session } = setup();
    const gold = game.statFields![1];
    logged(session, 'Ann finds treasure', () => {
      addStat(game, session, 'a', gold, 100);
      giveItem(game, session, 'a', 'potion', 2);
    });
    expect(session.actionLog).toHaveLength(1);
    logged(session, 'Nothing happens', () => {});
    expect(session.actionLog).toHaveLength(1); // no change, no step
    expect(undoAction(session)?.text).toBe('Ann finds treasure');
    expect(statValue(game, session, 'a', gold)).toBe(20);
    expect(countItem(session, 'a', 'potion')).toBe(0);
    expect(redoAction(session)?.text).toBe('Ann finds treasure');
    expect(statValue(game, session, 'a', gold)).toBe(120);
    expect(countItem(session, 'a', 'potion')).toBe(2);
    logged(session, 'x', () => addStat(game, session, 'b', gold, 1));
    expect(session.actionRedo).toEqual([]); // a new step clears redo
    expect(newId()).not.toBe(newId());
  });

  it('keeps only what a step changed, and remembers its round', () => {
    const { game, session } = setup();
    session.currentRound = 2;
    logged(session, 'Bob hurt', () => addStat(game, session, 'b', game.statFields![0], -3));
    expect(Object.keys(JSON.parse(session.actionLog![0].before))).toEqual(['stats']);
    expect(lastAction(session, 2)?.text).toBe('Bob hurt');
    expect(lastAction(session, 3)).toBeUndefined(); // "Last:" in another round shows nothing
    expect(lastAction(session)?.text).toBe('Bob hurt'); // but Ctrl+Z still reaches it
  });

  it('stays small in a long show: never a copy of the score log', () => {
    const { game, session } = setup();
    for (let i = 0; i < 150; i++) applyScore(session, game, ['a'], 100, `Clue ${i}`);
    for (let i = 0; i < 300; i++) logged(session, `Bob finds gold ${i}`, () => addStat(game, session, 'b', game.statFields![1], 1));
    expect(JSON.stringify(session.actionLog).length).toBeLessThan(100_000);
  });

  it('makes a step inside a step part of it: one undo takes back the lot', () => {
    const { game, session } = setup();
    const hp = game.statFields![0];
    setStat(session, 'b', hp, 5);
    giveItem(game, session, 'b', 'potion', 2);
    // An item's "Use": its actions log themselves, then it's used up.
    logged(session, 'Bob uses Potion', () => {
      logged(session, 'HP +3', () => addStat(game, session, 'b', hp, 3));
      applyScore(session, game, ['b'], 100, 'Potion');
      logged(session, 'used Potion', () => takeItem(session, 'b', 'potion', 1));
    });
    expect(session.actionLog).toHaveLength(1);
    expect([statValue(game, session, 'b', hp), countItem(session, 'b', 'potion'), score(session, 'b')]).toEqual([8, 1, 100]);
    undoAction(session);
    expect([statValue(game, session, 'b', hp), countItem(session, 'b', 'potion'), score(session, 'b')]).toEqual([5, 2, 0]);
    redoAction(session);
    expect([statValue(game, session, 'b', hp), countItem(session, 'b', 'potion'), score(session, 'b')]).toEqual([8, 1, 100]);
  });

  it('never touches score changes made after a step (undo, or redo after a new award)', () => {
    const { game, session } = setup();
    const hp = game.statFields![0];
    applyScore(session, game, ['a'], 400, 'Clue');
    logged(session, 'Ann hurt', () => addStat(game, session, 'a', hp, -1));
    // The host takes the award back in the score log, then undoes the step.
    toggleStep(session, session.scoreLog[0].batchId!);
    undoAction(session);
    expect([score(session, 'a'), statValue(game, session, 'a', hp)]).toEqual([0, 10]);
    // Undo a step, award points: the award stays, and there's nothing left to redo.
    logged(session, 'Ann hurt', () => addStat(game, session, 'a', hp, -1));
    undoAction(session);
    applyScore(session, game, ['a'], 400, 'Clue');
    expect(redoAction(session)).toBeNull();
    expect([score(session, 'a'), statValue(game, session, 'a', hp)]).toEqual([400, 10]);
    // A score log fix-up after an undo is kept when the step is redone.
    logged(session, 'Ann hurt', () => addStat(game, session, 'a', hp, -1));
    undoAction(session);
    toggleStep(session, session.scoreLog.at(-1)!.batchId!);
    redoAction(session);
    expect([score(session, 'a'), statValue(game, session, 'a', hp)]).toEqual([0, 9]);
  });

  it('puts back older saves’ steps without their copy of the score log', () => {
    const { game, session } = setup();
    setScore(session, 'a', 300);
    const old = { stats: {}, inventories: {}, worlds: {}, boardgames: {}, stock: {}, scoreLog: [], redoStack: [] };
    session.actionLog = [{ id: 'x', ts: 1, text: 'Old step', before: JSON.stringify(old) }];
    setStat(session, 'a', game.statFields![0], 3);
    undoAction(session);
    expect([score(session, 'a'), statValue(game, session, 'a', game.statFields![0])]).toEqual([300, 10]);
  });

  it('undoes improvising on the game being played: a new screen, a renamed object, a live edit', () => {
    const { game, session } = setup();
    const world = newWorld('W');
    game.worlds = [world];
    const map = world.maps[0];
    map.cols = 1; // the new screen grows the map
    const start = map.screens[0];
    start.slide.elements.push({ ...newTextEl('Goblin'), name: 'Goblin' });
    logged(session, 'Add a screen', () => addScreenBeside(map, start, 'e', 'Beach'), game);
    expect(map.screens.map((s) => s.name)).toEqual(['Start', 'Beach']);
    logged(session, 'Rename Goblin', () => (start.slide.elements[0].name = 'Goblin King'), game);
    // The live editor: one step for everything done while it's open.
    const done = startStep(session, game);
    start.slide.elements.push(newTextEl('Tree'));
    done('Edit Start');
    expect(session.actionLog!.map((e) => e.text)).toEqual(['Add a screen', 'Rename Goblin', 'Edit Start']);
    undoAction(session, game);
    expect(map.screens[0].slide.elements.map((e) => e.name)).toEqual(['Goblin King']);
    undoAction(session, game);
    expect(map.screens[0].slide.elements[0].name).toBe('Goblin');
    undoAction(session, game);
    expect([map.screens.map((s) => s.name), map.cols]).toEqual([['Start'], 1]);
    redoAction(session, game);
    expect(map.screens.map((s) => s.name)).toEqual(['Start', 'Beach']);
  });
});

describe('Undo and Redo in play (the score log and the action log together)', () => {
  /** Ctrl+Z as Play does it: the newest of the two logs, noting which. */
  function undoLast(session: Session, undone: Undone[]): void {
    const a = lastAction(session);
    const s = session.scoreLog.filter((e) => !e.undone).at(-1);
    if (a && (!s || a.ts >= s.ts)) undone.push({ log: 'action', id: undoAction(session)!.id });
    else undone.push({ log: 'score', id: stepOf(undo(session)[0]) });
  }

  it('redoes back the way the Undos went', () => {
    const { game, session } = setup();
    const hp = game.statFields![0];
    const undone: Undone[] = [];
    applyScore(session, game, ['a'], 100, 'Clue 1');
    logged(session, 'Ann hurt', () => addStat(game, session, 'a', hp, -1));
    session.actionLog!.at(-1)!.ts++; // (steps a millisecond apart, as they are in play)
    // The step goes first, then the award: Redo brings back the award, then the step.
    for (let i = 0; i < 2; i++) undoLast(session, undone);
    expect(redoFrom(session, undone)).toBe('score');
    redo(session);
    expect(redoFrom(session, undone)).toBe('action');
    redoAction(session);
    expect(redoFrom(session, undone)).toBeUndefined();
  });

  it('skips what a change since has made stale', () => {
    const { game, session } = setup();
    const hp = game.statFields![0];
    const undone: Undone[] = [];
    const [first] = applyScore(session, game, ['a'], 100, 'Clue 1');
    logged(session, 'Ann hurt', () => addStat(game, session, 'a', hp, -1));
    session.actionLog!.at(-1)!.ts++;
    applyScore(session, game, ['b'], 200, 'Clue 2');
    session.scoreLog.at(-1)!.ts += 2;
    for (let i = 0; i < 3; i++) undoLast(session, undone);
    // The score log's Restore brings Clue 1 back: next come the step, then Clue 2 (not Clue 1 twice, or Clue 2 first).
    toggleEvent(session, first.id);
    expect(redoFrom(session, undone)).toBe('action');
    redoAction(session);
    expect(redoFrom(session, undone)).toBe('score');
    redo(session);
    expect([score(session, 'a'), score(session, 'b'), statValue(game, session, 'a', hp)]).toEqual([100, 200, 9]);
    // Undo both, then a new step: the undone step can't come back, only the score change.
    undoLast(session, undone);
    undoLast(session, undone);
    logged(session, 'Bob hurt', () => addStat(game, session, 'b', hp, -1));
    expect(redoFrom(session, undone)).toBe('score');
    expect(undone).toEqual([]);
    // A new score change: nothing at all.
    undoLast(session, undone);
    applyScore(session, game, ['a'], 5, 'Oops');
    expect([redoFrom(session, undone), undone.length]).toEqual([undefined, 0]);
  });

  it('with nothing to go by (after a reload), redoes the action log first', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a'], 100, 'Clue 1');
    logged(session, 'Ann hurt', () => addStat(game, session, 'a', game.statFields![0], -1));
    undoAction(session);
    undo(session);
    expect(redoFrom(session, [])).toBe('action');
  });
});

describe('shops that charge points', () => {
  it('charge the score when set to, or when the game has no currency stat, and undo gives both back', () => {
    const { game, session } = setup();
    const shop: Shop = { id: 's', name: 'Market', currency: SCORE_CURRENCY, stock: [{ item: 'sword', price: 300, qty: null }] };
    setScore(session, 'a', 500);
    logged(session, 'buy', () => buy(game, session, shop, 'a', 'sword'));
    expect(score(session, 'a')).toBe(200);
    expect(countItem(session, 'a', 'sword')).toBe(1);
    expect(buy(game, session, shop, 'a', 'sword')).toEqual({ ok: false, error: 'Short by $100' });
    // An award after the purchase stays when the purchase is undone and redone.
    applyScore(session, game, ['b'], 50, 'Clue');
    undoAction(session);
    expect([score(session, 'a'), countItem(session, 'a', 'sword'), score(session, 'b')]).toEqual([500, 0, 50]);
    expect(session.scoreLog.some((e) => e.reason.startsWith('Bought'))).toBe(false);
    redoAction(session);
    expect([score(session, 'a'), countItem(session, 'a', 'sword'), score(session, 'b')]).toEqual([200, 1, 50]);
    // No currency stat in the game: points.
    game.statFields = [];
    expect(shopCurrency(game, { ...shop, currency: undefined })).toBe('score');
  });
});

describe('worn items', () => {
  it('sit where their slot puts them unless placed, and only equipped ones are worn', () => {
    const { game, session } = setup();
    const sword = game.items!.find((i) => i.id === 'sword')!;
    expect(wornPlace(sword.wearable!)).toEqual({ ...SLOT_PLACE.hand, rotate: 0, behind: false });
    sword.wearable = { slot: 'hand', x: 0.1, w: 1.2, rotate: 45, behind: true };
    expect(wornPlace(sword.wearable)).toEqual({ x: 0.1, y: SLOT_PLACE.hand.y, w: 1.2, rotate: 45, behind: true });
    giveItem(game, session, 'a', 'sword', 1);
    giveItem(game, session, 'a', 'potion', 1);
    expect(wornItems(game, session, 'a')).toEqual([]);
    inventory(session, 'a').find((e) => e.item === 'sword')!.equipped = true;
    expect(wornItems(game, session, 'a').map((d) => d.id)).toEqual(['sword']);
  });
});

