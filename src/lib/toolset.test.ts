import { describe, expect, it } from 'vitest';
import { newGame, newId, newTextEl, type BoardRound, type Game, type Session, type Shop } from './model';
import { applyScore, backToBoard, finalJudge, finalNext, finalSetWager, goToRound, wagerFromPhone, wagerSentBy, newSession, openClue, redo, removePlayer, restorePlayer, score, setScore, stepOf, toggleEvent, toggleStep, toggleUsed, undo } from './session';
import { jeopardyGame } from './testgame';
import { addScreenBeside, newWorld } from './rpg';
import {
  addStat,
  buy,
  clampStat,
  lastAction,
  startStep,
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
  sellPrice,
  setPicker,
  setStat,
  statValue,
  stockLeft,
  takeItem,
  transferEntry,
  undoAction,
  itemQty,
  MAX_UNSTACKED,
  shopCurrencyGone,
  statRangeProblem,
  statRoom,
  statsProblems,
} from './toolset';

/** How many of catalog item `item` a player holds (all stacks). */
const countItem = (session: Session, playerId: string, item: string) =>
  inventory(session, playerId)
    .filter((e) => e.item === item)
    .reduce((n, e) => n + e.qty, 0);

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

  it('one already past its min or max moves by a change, never back into range in one jump nor further out', () => {
    const { game, session } = setup();
    const gold = game.statFields![1];
    // "Buy anyway" took Ann's gold below its min (0).
    session.stats = { a: { gold: -2 } };
    expect(addStat(game, session, 'a', gold, -1)).toBe(0);
    expect(statValue(game, session, 'a', gold)).toBe(-2);
    expect(addStat(game, session, 'a', gold, 1)).toBe(1);
    expect(statValue(game, session, 'a', gold)).toBe(-1);
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
    // Taking a sword takes one not being worn.
    inventory(session, 'a').filter((e) => e.item === 'sword')[1].equipped = true;
    expect(takeItem(session, 'a', 'sword', 1)).toBe(1);
    expect(inventory(session, 'a').filter((e) => e.item === 'sword').map((e) => !!e.equipped)).toEqual([true]);
    giveItem(game, session, 'a', 'sword', 1);
    inventory(session, 'a').splice(1, 0, inventory(session, 'a').pop()!);
    expect(takeItem(session, 'a', 'potion', 5)).toBe(3);
    expect(countItem(session, 'a', 'potion')).toBe(0);
    const rock = inventory(session, 'a').find((e) => !e.item)!;
    transferEntry(session, 'a', 'b', rock.id);
    expect(inventory(session, 'b').map((e) => e.name)).toEqual(['A very suspicious rock']);
    expect(inventory(session, 'a').some((e) => !e.item)).toBe(false);
    // A single stackable item joins the other player's stack of one; a non-stackable one stays its own row.
    giveItem(game, session, 'a', 'potion', 1);
    giveItem(game, session, 'b', 'potion', 1);
    transferEntry(session, 'a', 'b', inventory(session, 'a').find((e) => e.item === 'potion')!.id, undefined, game);
    expect(inventory(session, 'b').filter((e) => e.item === 'potion').map((e) => e.qty)).toEqual([2]);
    giveItem(game, session, 'b', 'sword', 1);
    transferEntry(session, 'a', 'b', inventory(session, 'a').find((e) => e.item === 'sword')!.id, undefined, game);
    expect(inventory(session, 'b').filter((e) => e.item === 'sword').map((e) => e.qty)).toEqual([1, 1]);
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

  it('a pool starts from the stock any of its shops has, even where the shop visited has it unlimited', () => {
    const { game, session } = setup();
    const village = shop('village', 'shared');
    const realm = { ...shop('realm', 'shared'), stock: shop('realm', 'shared').stock.map((e) => ({ ...e, qty: null })) };
    game.shops = [village, realm];
    expect(stockLeft(session, realm, 'sword', game)).toBe(1);
    buy(game, session, realm, 'a', 'sword');
    expect(stockLeft(session, village, 'sword', game)).toBe(0);
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

  it('leaves what viewers are shown (the map, split view, a zone) as it is', () => {
    const { game, session } = setup();
    const parties = [
      { id: 'p1', name: 'Party 1', members: ['a'] },
      { id: 'p2', name: 'Party 2', members: ['b'] },
    ];
    const st = { positions: { a: { map: 'm', screen: 's1', x: 0, y: 0 }, b: { map: 'm', screen: 's1', x: 0, y: 0 } }, parties, active: 'p1', knowledge: {}, objects: {}, added: {}, mapShown: false };
    const bs = { positions: {}, order: ['a', 'b'], turn: 0 };
    session.worlds = { w: st };
    session.boardgames = { r: bs };
    logged(session, 'Party east', () => {
      session.worlds!.w.positions.a.screen = 's2';
      session.boardgames!.r.turn = 1;
    });
    // Switched between steps: the map on screen, split view, a zone on screen.
    Object.assign(session.worlds!.w, { mapShown: true, split: true });
    session.boardgames!.r.zoneShown = 'z';
    const shown = () => [session.worlds!.w.mapShown, session.worlds!.w.split, session.boardgames!.r.zoneShown];
    undoAction(session, game);
    expect([session.worlds!.w.positions.a.screen, session.boardgames!.r.turn, ...shown()]).toEqual(['s1', 0, true, true, 'z']);
    redoAction(session, game);
    expect([session.worlds!.w.positions.a.screen, session.boardgames!.r.turn, ...shown()]).toEqual(['s2', 1, true, true, 'z']);
  });

  it('keeps viewers on the party they follow, and turns split view off when one party is left', () => {
    const { game, session } = setup();
    const pos = (screen: string) => ({ map: 'm', screen, x: 0, y: 0 });
    const party = { id: 'p1', name: 'Party', members: ['a', 'b'] };
    session.worlds = { w: { positions: { a: pos('s1'), b: pos('s1') }, parties: [party], active: 'p1', knowledge: {}, objects: {}, added: {}, mapShown: false } };
    const w = () => session.worlds!.w;
    logged(session, 'Split off Bob', () => {
      w().parties = [{ ...party, members: ['a'] }, { id: 'p2', name: 'Party 2', members: ['b'] }];
      w().active = 'p2';
    });
    logged(session, 'Party east', () => (w().positions.b.screen = 's2'));
    // Between steps the host has viewers follow Party 1, and turns split view on.
    Object.assign(w(), { active: 'p1', split: true });
    undoAction(session, game);
    expect([w().positions.b.screen, w().active, w().split]).toEqual(['s1', 'p1', true]);
    undoAction(session, game);
    expect([w().parties.length, w().active, w().split]).toEqual([1, 'p1', false]);
  });

  it('puts split view back on when undoing a Regroup that turned it off', () => {
    const { game, session } = setup();
    const pos = (screen: string) => ({ map: 'm', screen, x: 0, y: 0 });
    const p1 = { id: 'p1', name: 'Party 1', members: ['a'] };
    const p2 = { id: 'p2', name: 'Party 2', members: ['b'] };
    session.worlds = { w: { positions: { a: pos('s1'), b: pos('s2') }, parties: [p1, p2], active: 'p1', knowledge: {}, objects: {}, added: {}, mapShown: false, split: true } };
    const w = () => session.worlds!.w;
    logged(session, 'Regroup', () => {
      w().parties = [{ ...p1, members: ['a', 'b'] }];
      w().split = false;
    });
    undoAction(session, game);
    expect([w().parties.length, w().split]).toEqual([2, true]);
    redoAction(session, game);
    expect([w().parties.length, w().split]).toEqual([1, false]);
  });

  it('keeps the host’s split view when undoing a step that added a party, with two parties left', () => {
    const { game, session } = setup();
    const pos = (screen: string) => ({ map: 'm', screen, x: 0, y: 0 });
    const p1 = { id: 'p1', name: 'Party 1', members: ['a'] };
    const p2 = { id: 'p2', name: 'Party 2', members: ['b', 'c'] };
    session.worlds = { w: { positions: { a: pos('s1'), b: pos('s2'), c: pos('s2') }, parties: [p1, p2], active: 'p1', knowledge: {}, objects: {}, added: {}, mapShown: false, split: false } };
    const w = () => session.worlds!.w;
    logged(session, 'Split off Cat', () => (w().parties = [p1, { ...p2, members: ['b'] }, { id: 'p3', name: 'Party 3', members: ['c'] }]));
    // Between steps the host turns split view on, and after Redo off again.
    w().split = true;
    undoAction(session, game);
    expect([w().parties.length, w().split]).toEqual([2, true]);
    redoAction(session, game);
    expect([w().parties.length, w().split]).toEqual([3, true]);
    w().split = false;
    undoAction(session, game);
    expect([w().parties.length, w().split]).toEqual([2, false]);
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

describe('the host’s own choices', () => {
  function show() {
    const game = jeopardyGame();
    game.players = [
      { id: 'a', name: 'Ann', color: '#e6194b' },
      { id: 'b', name: 'Bob', color: '#3cb44b' },
    ];
    return { game, session: newSession(game) };
  }

  it('puts a tile marked played back, and leaves the tiles closed since alone', () => {
    const { game, session } = show();
    const tile = (cat: number) => (game.rounds[0] as BoardRound).categories[cat].clues[0].id;
    logged(session, 'Memes $200 marked as played', () => toggleUsed(session, tile(0)));
    // Played the usual way: back to the board marks it used, no step.
    openClue(session, { round: 0, cat: 1, row: 0 }, game);
    backToBoard(session, game);
    expect(Object.keys(session.used).sort()).toEqual([tile(0), tile(1)].sort());
    undoAction(session);
    expect(Object.keys(session.used)).toEqual([tile(1)]);
    redoAction(session);
    expect(session.used[tile(0)]).toBe(true);
    // Reopening the tile just closed, then undoing that, closes it again.
    logged(session, 'back on the board', () => toggleUsed(session, tile(1)));
    expect([session.used[tile(1)], session.lastClosed]).toEqual([undefined, null]);
    undoAction(session);
    expect(session.used[tile(1)]).toBe(true);
  });

  it('puts back the picker, co-winners and the roll-off’s winner', () => {
    const { session } = show();
    setPicker(session, 'b', ' (roll-off)');
    setPicker(session, 'b'); // no change, no step
    setPicker(session, undefined);
    logged(session, 'Co-winners declared', () => (session.coWinners = true));
    logged(session, 'Ann won the roll-off', () => (session.rollOffWinner = 'a'));
    expect(session.actionLog!.map((e) => e.text)).toEqual(['Bob picks next (roll-off)', 'No picker', 'Co-winners declared', 'Ann won the roll-off']);
    undoAction(session);
    undoAction(session);
    expect([session.rollOffWinner, session.coWinners, session.currentPickerId]).toEqual([undefined, undefined, undefined]);
    undoAction(session);
    expect(session.currentPickerId).toBe('b');
    undoAction(session);
    expect(session.currentPickerId).toBeUndefined();
  });

  it('puts back who plays a Final, its reveal order and wagers, never its results', () => {
    const { game, session } = show();
    applyScore(session, game, ['a'], 300, 'x');
    applyScore(session, game, ['b'], 200, 'x');
    goToRound(session, game, 1);
    const f = session.final!;
    logged(session, 'Bob sits out', () => ((f.players = ['a']), (f.order = ['a'])));
    logged(session, 'Bob plays', () => ((f.players = ['a', 'b']), (f.order = ['a', 'b'])));
    logged(session, 'Reveal order', () => (f.order = ['b', 'a']));
    const wager = startStep(session);
    f.wagers.a = 3;
    f.wagers.a = 30;
    wager('Ann’s wager: $30');
    for (let i = 0; i < 3; i++) finalNext(session, game);
    finalJudge(session, game, 'a', true);
    // Undo of the wager (taken straight from the action log here) leaves the judgment and its points alone.
    undoAction(session);
    expect([f.wagers.a, f.results.a, score(session, 'a')]).toEqual([undefined, 'right', 330]);
    undoAction(session);
    undoAction(session);
    expect([f.players, f.order]).toEqual([['a'], ['a']]);
    // After the game moved on, a step still finds its Final.
    goToRound(session, game, 2);
    undoAction(session);
    expect(session.final!.players).toEqual(['a', 'b']);
  });

  it('a step under way never takes back one logged meanwhile (a phone wager while a dialog is open)', () => {
    const { game, session } = show();
    applyScore(session, game, ['a', 'b'], 300, 'x');
    goToRound(session, game, 1);
    const f = session.final!;
    const long = startStep(session);
    logged(session, 'Bob’s wager (from their phone)', () => (f.wagers.b = 500));
    f.wagers.a = 300;
    long('Ann’s wager: $300');
    undoAction(session);
    expect([f.wagers.a, f.wagers.b]).toEqual([undefined, 500]);
  });

  it('puts back where a Final wager came from: a phone’s, then the host’s change', () => {
    const { game, session } = show();
    applyScore(session, game, ['a', 'b'], 300, 'x');
    goToRound(session, game, 1);
    const f = session.final!;
    logged(session, 'Ann’s wager (from Al’s phone): $200', () => finalSetWager(session, 'a', 200, 'phone', 'Al'));
    logged(session, 'Ann’s wager (from their phone): $200 → $100', () => finalSetWager(session, 'a', 100));
    expect([f.wagers.a, wagerFromPhone(f, 'a'), wagerSentBy(f, 'a')]).toEqual([100, false, '']);
    undoAction(session);
    expect([f.wagers.a, wagerFromPhone(f, 'a'), wagerSentBy(f, 'a')]).toEqual([200, true, 'Al']);
    undoAction(session);
    expect([f.wagers.a, wagerFromPhone(f, 'a')]).toEqual([undefined, false]);
  });

  it('puts back the players: a rename, a new player, one removed and restored', () => {
    const { game, session } = show();
    applyScore(session, game, ['a'], 300, 'x');
    const step = (text: string, change: () => void) => logged(session, text, change);
    step('Renamed Ann to Alice', () => (session.players[0].name = 'Alice'));
    step('Added Cat', () => session.players.push({ id: 'c', name: 'Cat', color: '#00f', startScore: 0 }));
    step('Removed Bob', () => removePlayer(session, 'b'));
    step('Restored Bob', () => restorePlayer(session, 'b'));
    expect(session.players.map((p) => p.name)).toEqual(['Alice', 'Cat', 'Bob']);
    undoAction(session);
    expect([session.players.map((p) => p.name), session.removedPlayers?.map((p) => p.name)]).toEqual([['Alice', 'Cat'], ['Bob']]);
    undoAction(session);
    undoAction(session);
    undoAction(session);
    expect([session.players.map((p) => p.name), session.removedPlayers ?? []]).toEqual([['Ann', 'Bob'], []]);
    expect(score(session, 'a')).toBe(300);
    redoAction(session);
    expect(session.players[0].name).toBe('Alice');
  });
});

describe('selling', () => {
  it('sells the very entry picked (not another of the same item they wear)', () => {
    const { game, session } = setup();
    const s: Shop = { id: 'v', name: 'Village', currency: 'gold', stock: [], buysBack: { rate: 0.5 } };
    giveItem(game, session, 'a', 'sword', 2);
    const [first, second] = inventory(session, 'a');
    second.equipped = true;
    expect(sell(game, session, s, 'a', first.id)).toEqual({ ok: true, text: 'Ann sold Sword for 🪙6' });
    expect(inventory(session, 'a')).toEqual([second]);
    expect(inventory(session, 'a')[0].equipped).toBe(true);
  });

  it('doesn’t buy secret items or ones with no price', () => {
    const { game, session } = setup();
    game.items!.push({ id: 'key', name: 'Secret Key', stackable: false, secret: true, price: 10 }, { id: 'rock', name: 'Rock', stackable: false });
    const s: Shop = { id: 'v', name: 'Village', currency: 'gold', stock: [], buysBack: { rate: 0.5 } };
    expect(sellPrice(game, s, 'key')).toBeNull();
    expect(sellPrice(game, s, 'rock')).toBeNull();
    expect(sellPrice(game, s, 'potion')).toBe(2);
    giveItem(game, session, 'a', 'key', 1);
    expect(sell(game, session, s, 'a', inventory(session, 'a')[0].id)).toEqual({ ok: false, error: 'Village doesn’t buy Secret Key' });
  });
});

describe('limits the editor and the host can trip over', () => {
  it('gives at most MAX_UNSTACKED of an item that doesn’t stack at once (each is its own entry), as many as asked of one that does', () => {
    const { game, session } = setup();
    giveItem(game, session, 'a', 'sword', 20000);
    expect(countItem(session, 'a', 'sword')).toBe(MAX_UNSTACKED);
    giveItem(game, session, 'a', 'potion', 20000);
    expect(countItem(session, 'a', 'potion')).toBe(20000);
    expect([itemQty(game, 'sword', 500), itemQty(game, 'sword', 2.4), itemQty(game, 'potion', 500), itemQty(game, 'potion', 0)]).toEqual([MAX_UNSTACKED, 2, 500, 1]);
  });

  it('knows how much a stat can still go up (converting score to a currency only converts that much)', () => {
    const { game, session } = setup();
    const [hp, gold] = game.statFields!;
    addStat(game, session, 'b', hp, -4);
    expect([statRoom(game, session, 'b', hp), statRoom(game, session, 'b', gold)]).toEqual([4, Infinity]);
    setStat(session, 'b', hp, 10);
    expect(statRoom(game, session, 'b', hp)).toBe(0);
  });

  it('says when a stat’s Start, Min and Max don’t add up, on the checklist too', () => {
    const { game } = setup();
    const [hp, gold] = game.statFields!;
    expect(statRangeProblem(hp)).toBeNull();
    hp.min = 12;
    expect(statRangeProblem(hp)).toBe('Min (12) is more than Max (10)');
    hp.min = 0;
    hp.start = 15;
    expect(statRangeProblem(hp)).toMatch(/^Start \(15\) is above Max \(10\)/);
    gold.start = -1;
    expect(statRangeProblem(gold)).toMatch(/^Start \(-1\) is below Min \(0\)/);
    expect(statsProblems(game).map((p) => [p.text.split(':')[0], p.tab, p.level])).toEqual([
      ['Stat “HP”', 'stats', 'warn'],
      ['Stat “Gold”', 'stats', 'warn'],
    ]);
  });

  it('says when a shop charges a stat that was deleted (it charges points, or the first other currency, until one is picked)', () => {
    const { game } = setup();
    const shop: Shop = { id: 's', name: 'Village', currency: 'gold', stock: [] };
    game.shops = [shop];
    expect(shopCurrencyGone(game, shop)).toBe(false);
    game.statFields = game.statFields!.filter((f) => f.id !== 'gold');
    expect(shopCurrencyGone(game, shop)).toBe(true);
    expect(shopCurrency(game, shop)).toBe('score');
    expect(statsProblems(game).map((p) => p.text)).toEqual(['Shop “Village” charged a deleted stat (it charges points now): pick what it charges']);
    // A stat that's no longer a number can't be charged either.
    const gold = { ...newStatField('Coins'), id: 'coins', type: 'text' as const };
    game.statFields = [...(game.statFields ?? []), gold];
    game.shops![0].currency = 'coins';
    expect(shopCurrencyGone(game, game.shops![0])).toBe(true);
    expect(statsProblems(game).map((p) => p.text)).toContain('Shop “Village” charged “Coins”, which isn\'t a number now (it charges points now): pick what it charges');
    shop.currency = SCORE_CURRENCY;
    expect(shopCurrencyGone(game, shop)).toBe(false);
  });
});
