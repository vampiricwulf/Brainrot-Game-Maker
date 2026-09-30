import { describe, expect, it } from 'vitest';
import { newGame, newId, type Game, type Session, type Shop } from './model';
import { newSession, score, setScore } from './session';
import {
  addStat,
  buy,
  countItem,
  giveItem,
  inventory,
  logged,
  newStatField,
  redoAction,
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
    undoAction(session);
    expect([score(session, 'a'), countItem(session, 'a', 'sword')]).toEqual([500, 0]);
    // No currency stat in the game: points.
    game.statFields = [];
    expect(shopCurrency(game, { ...shop, currency: undefined })).toBe('score');
  });
});

