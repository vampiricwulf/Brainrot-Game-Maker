import { describe, expect, it } from 'vitest';
import { adoptUsedBy, clipboard, copyElements, holdMedia, holdUsedBy, pastingGone, toolHere } from './clipboard.svelte';
import { newClue, newGame, newId, newTextEl, type Game, type ItemDef, type Shop } from './model';
import { newScreen } from './rpg';
import { newStatField } from './toolset';
import { newDice, newWheel } from './tools';

/** A game with a wheel whose slice shows a picture, and a dice preset. */
function withTools(): Game {
  const g = newGame();
  const w = newWheel('Punishments');
  w.segments[0].media = 'm1';
  g.wheels.push(w);
  g.dice.push(newDice('Two dice'));
  g.media.push({ id: 'm1', name: 'a.png', mime: 'image/png', size: 10, kind: 'image' });
  return g;
}

describe('copying a wheel or dice clue into another game', () => {
  it('brings the wheel, its files and the dice along, once', () => {
    const a = withTools();
    const wheelClue = { ...newClue(), type: 'wheel' as const, wheelId: a.wheels[0].id };
    const diceClue = { ...newClue(), type: 'dice' as const, diceId: a.dice[0].id };
    clipboard.wheels = [];
    clipboard.dice = [];
    clipboard.media = [];
    holdUsedBy(a, wheelClue);
    holdUsedBy(a, diceClue);
    const b = newGame();
    expect(toolHere(b, wheelClue.wheelId)).toBe(true);
    adoptUsedBy(b, wheelClue);
    adoptUsedBy(b, wheelClue);
    expect(b.wheels.map((w) => w.id)).toEqual([a.wheels[0].id]);
    expect(b.media.map((m) => m.id)).toEqual(['m1']);
    expect(b.dice).toEqual([]);
    adoptUsedBy(b, diceClue);
    expect(b.dice.map((d) => d.id)).toEqual([a.dice[0].id]);
  });

  it('an RPG object copied as a slide item keeps the wheel its Spin button uses', () => {
    const a = withTools();
    const obj = newTextEl('Wizard');
    obj.role = { class: 'npc', actions: [{ id: 'x', do: 'wheel', wheel: a.wheels[0].id }] };
    clipboard.wheels = [];
    copyElements(a, [obj], null);
    const b = newGame();
    adoptUsedBy(b, clipboard.elements);
    expect(b.wheels.map((w) => w.name)).toEqual(['Punishments']);
  });

  it('adds nothing for a clue that uses no wheel', () => {
    const b = newGame();
    adoptUsedBy(b, newClue());
    expect(b.wheels).toEqual([]);
    expect(toolHere(b, 'nope')).toBe(false);
  });
});

describe('copying an RPG screen into another game', () => {
  it('brings the items, shops and stats its objects use, and the ones those use, once', () => {
    const a = newGame();
    const hp = newStatField('HP');
    const gold = { ...newStatField('Gold'), currency: true };
    const potion: ItemDef = { id: newId(), name: 'Potion', icon: 'm2', stackable: true, onUse: [{ id: newId(), do: 'stat', field: hp.id, op: 'add', amount: 3 }] };
    const shop: Shop = { id: newId(), name: 'Shop', currency: gold.id, stock: [{ item: potion.id, qty: null }] };
    a.statFields = [newStatField('Unused'), hp, gold];
    a.items = [{ id: newId(), name: 'Sword', stackable: false }, potion];
    a.shops = [shop];
    a.media.push({ id: 'm2', name: 'potion.png', mime: 'image/png', size: 10, kind: 'image' });
    const screen = newScreen(0, 0, 'Forest');
    const npc = newTextEl('Shopkeeper');
    npc.role = { class: 'npc', actions: [{ id: newId(), do: 'shop', shop: shop.id }] };
    screen.slide.elements.push(npc);
    clipboard.items = [];
    clipboard.shops = [];
    clipboard.statFields = [];
    clipboard.media = [];
    holdUsedBy(a, screen);
    // (Something else copied since keeps them, and the files they show.)
    holdMedia(a);
    expect(clipboard.media.map((m) => m.id)).toEqual(['m2']);
    const b = newGame();
    adoptUsedBy(b, screen);
    adoptUsedBy(b, screen);
    expect(b.shops?.map((x) => x.name)).toEqual(['Shop']);
    expect(b.items?.map((x) => x.name)).toEqual(['Potion']);
    expect(b.statFields?.map((x) => x.name).sort()).toEqual(['Gold', 'HP']);
    expect(b.media.map((m) => m.id)).toEqual(['m2']);
  });
});

describe('pasting items copied in another tab or before a reload', () => {
  /** A stand-in for the paste's clipboard data. */
  const data = (types: Record<string, string>) => ({ getData: (t: string) => types[t] ?? '' }) as unknown as DataTransfer;
  it('is caught (instead of pasting "2 slide items" as text) when this page has nothing copied', () => {
    clipboard.elements = [];
    clipboard.token = '';
    expect(pastingGone(data({ 'text/plain': '2 slide items', 'application/x-brainrot-slide-items': 'old-token' }))).toBe(true);
    expect(pastingGone(data({ 'text/plain': '1 slide item' }))).toBe(true);
  });
  it('is caught when this page copied something else since', () => {
    copyElements(newGame(), [newTextEl('hello')], null);
    expect(pastingGone(data({ 'text/plain': '1 slide item', 'application/x-brainrot-slide-items': 'from-another-tab' }))).toBe(true);
  });
  it('leaves our own copies, and real words, alone', () => {
    copyElements(newGame(), [newTextEl('')], null);
    expect(pastingGone(data({ 'text/plain': clipboard.text, 'application/x-brainrot-slide-items': clipboard.token }))).toBe(false);
    expect(pastingGone(data({ 'text/plain': 'WHEN THE FROG', 'application/x-brainrot-slide-items': 'from-another-tab' }))).toBe(false);
    expect(pastingGone(null)).toBe(false);
  });
});
