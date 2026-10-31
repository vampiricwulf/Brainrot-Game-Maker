import { describe, expect, it } from 'vitest';
import { newGame, newId, type Game, type Session } from '../../lib/model';
import { newSession } from '../../lib/session';
import { inventory, newStatField } from '../../lib/toolset';
import type { MenuEntry } from '../../lib/menustate.svelte';
import { wareMenu } from './shopops';

function setup(): { game: Game; session: Session } {
  const game = newGame();
  game.players = [
    { id: 'a', name: 'Ann', color: '#e6194b', stats: { gold: 20 } },
    { id: 'b', name: 'Bob', color: '#3cb44b', stats: { gold: 20 } },
  ];
  game.statFields = [{ ...newStatField('Gold'), id: 'gold', start: 5, min: 0, currency: true, symbol: '🪙' }];
  game.items = [
    { id: 'potion', name: 'Potion', stackable: true, price: 4 },
    { id: 'sword', name: 'Sword', stackable: false, price: 12 },
  ];
  game.shops = [{ id: 'village', name: 'Village', currency: 'gold', stock: [{ item: 'sword', qty: 1 }, { item: 'potion', price: 3, qty: null }] }];
  return { game, session: newSession(game) };
}

const lines = (items: MenuEntry[]) => items.map((i) => ('label' in i ? `${i.label}${i.disabled ? ' (greyed)' : ''}` : 'heading' in i ? i.heading : '—'));

describe('a ware’s menu in the shop on the stage', () => {
  it('buys it for each player (the shop’s buyer changes to them), then changes its stock', () => {
    const { game, session } = setup();
    const o = { kind: 'shop' as const, nonce: newId(), shopId: 'village', buyer: 'a' };
    let asked = 0;
    const menu = wareMenu(game, session, o, [], 'sword', { stock: () => asked++ });
    expect(lines(menu)).toEqual(['Sword · 🪙12 · 1 left', '🛒 Buy for Ann', '🛒 Buy for Bob', '—', '📦 Change the stock…']);
    (menu[2] as { onclick: () => void }).onclick();
    expect([o.buyer, inventory(session, 'b').map((e) => e.item)]).toEqual(['b', ['sword']]);
    // Sold out now: the buys are greyed; unlimited stock says nothing of it.
    expect(lines(wareMenu(game, session, o, [], 'sword', { stock: () => {} })).slice(0, 2)).toEqual(['Sword · 🪙12 · sold out', '🛒 Buy for Ann (greyed)']);
    expect(lines(wareMenu(game, session, o, [], 'potion', { stock: () => {} }))[0]).toBe('Potion · 🪙3');
    (menu.at(-1) as { onclick: () => void }).onclick();
    expect(asked).toBe(1);
    expect(wareMenu(game, session, o, [], 'gone', { stock: () => {} })).toEqual([]);
  });
});
