import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemsFor, nav, placeElement, placeKey, resolve, take, type Place } from './nav.svelte';
import { newTextEl, type BoardRound, type Game } from './model';
import { jeopardyGame } from './testgame';
import { newRpgRound, newScreen, newVariant } from './rpg';
import { newWheel } from './tools';

function sample(): Game {
  const g = jeopardyGame();
  g.rounds.push(newRpgRound(g));
  const screens = g.worlds![0].maps[0].screens;
  screens.push(newScreen(1, 0, 'Town'));
  screens[1].slide.elements.push(newTextEl('Welcome'));
  screens[1].variants = [newVariant(undefined, screens[1], 'On fire')];
  g.wheels.push(newWheel('Punishments'));
  return g;
}

const board = (g: Game) => g.rounds[0] as BoardRound;

describe('places', () => {
  it('names what flashes there', () => {
    expect(placeKey({ tab: 'title' })).toBe('title');
    expect(placeKey({ tab: 'setup' })).toBeNull();
    expect(placeKey({ tab: 'setup', player: 'p1' })).toBe('player:p1');
    expect(placeKey({ tab: 'tools', dice: 'd1' })).toBe('dice:d1');
    expect(placeKey({ tab: 'stats', shop: 's1' })).toBe('shop:s1');
    expect(placeKey({ tab: 'media', media: 'm1' })).toBe('media:m1');
    expect(placeKey({ tab: 'round', round: 'r1' })).toBe('round:r1');
    expect(placeKey({ tab: 'round', round: 'r1', part: { kind: 'values' } })).toBe('values:r1');
    expect(placeKey({ tab: 'round', round: 'r1', part: { kind: 'category', category: 'c1' } })).toBe('category:c1');
    expect(placeKey({ tab: 'round', round: 'r1', part: { kind: 'clue', category: 'c1', clue: 'k1', side: 'q' } })).toBe('clue:k1');
    // An item on a slide: its row in the Layers list.
    expect(placeKey({ tab: 'round', round: 'r1', part: { kind: 'clue', category: 'c1', clue: 'k1', side: 'q', element: 'e1' } })).toBe('el:e1');
    expect(placeKey({ tab: 'world', world: 'w1', map: 'm1', screen: 's1' })).toBe('screen:s1');
    expect(placeKey({ tab: 'world', world: 'w1', map: 'm1' })).toBe('map:m1');
    expect(placeKey({ tab: 'world', world: 'w1', map: 'm1', screen: 's1', inSlide: true, element: 'e1' })).toBe('el:e1');
    expect(placeKey({ tab: 'history' })).toBeNull();
  });

  it('knows the slide item a place picks', () => {
    expect(placeElement({ tab: 'tiebreaker', side: 'a', element: 'e1' })).toBe('e1');
    expect(placeElement({ tab: 'round', round: 'r1', part: { kind: 'decor', element: 'e2' } })).toBe('e2');
    expect(placeElement({ tab: 'round', round: 'r1', part: { kind: 'space', space: 's1' } })).toBeUndefined();
    expect(placeElement({ tab: 'media', media: 'm1' })).toBeUndefined();
  });

  it('keeps a place that is all there as it is', () => {
    const g = sample();
    const cat = board(g).categories[1];
    const clue = cat.clues[2];
    const places: Place[] = [
      { tab: 'title' },
      { tab: 'round', round: g.rounds[0].id, part: { kind: 'clue', category: cat.id, clue: clue.id, side: 'q', element: clue.questionSlide.elements[0].id } },
      { tab: 'tools', wheel: g.wheels[0].id },
      { tab: 'world', world: g.worlds![0].id, map: g.worlds![0].maps[0].id, screen: g.worlds![0].maps[0].screens[1].id },
    ];
    for (const p of places) expect(resolve(g, p)).toBe(p);
  });

  it('leaves out what was deleted since, down to the nearest thing still there', () => {
    const g = sample();
    const r = board(g);
    const cat = r.categories[1];
    const clue = cat.clues[2];
    const el = clue.questionSlide.elements[0].id;
    const place: Place = { tab: 'round', round: r.id, part: { kind: 'clue', category: cat.id, clue: clue.id, side: 'q', element: el } };
    clue.questionSlide.elements = [];
    expect(resolve(g, place)).toEqual({ tab: 'round', round: r.id, part: { kind: 'clue', category: cat.id, clue: clue.id, side: 'q' } });
    cat.clues.splice(2, 1);
    expect(resolve(g, place)).toEqual({ tab: 'round', round: r.id, part: { kind: 'category', category: cat.id } });
    r.categories.splice(1, 1);
    expect(resolve(g, place)).toEqual({ tab: 'round', round: r.id });
    g.rounds.splice(0, 1);
    expect(resolve(g, place)).toBeNull();

    const w = g.worlds![0];
    const town = w.maps[0].screens[1];
    const look = town.variants![0];
    const inLook: Place = { tab: 'world', world: w.id, map: w.maps[0].id, screen: town.id, look: look.id, inSlide: true, element: look.slide.elements[0].id };
    expect(resolve(g, inLook)).toBe(inLook);
    town.variants = [];
    expect(resolve(g, inLook)).toEqual({ tab: 'world', world: w.id, map: w.maps[0].id, screen: town.id });
    w.maps[0].screens.splice(1, 1);
    expect(resolve(g, inLook)).toEqual({ tab: 'world', world: w.id, map: w.maps[0].id });
    expect(resolve(g, { tab: 'tools', wheel: 'gone' })).toEqual({ tab: 'tools' });
    expect(resolve(g, { tab: 'setup', player: 'gone' })).toEqual({ tab: 'setup' });
  });
});

describe('requests', () => {
  afterEach(() => vi.useRealTimers());

  it('go to each part of the editor once, while fresh', () => {
    vi.useFakeTimers();
    const mine = { seq: 0 };
    const other = { seq: 0 };
    nav.request = { place: { tab: 'theme' }, items: [], seq: 7, at: Date.now() };
    expect(take(mine)).toEqual({ tab: 'theme' });
    expect(take(mine)).toBeNull();
    // Another part (a clue editor opening because of it) gets it too.
    expect(take(other)).toEqual({ tab: 'theme' });
    nav.request = { place: { tab: 'media' }, items: [], seq: 8, at: Date.now() };
    vi.advanceTimersByTime(1600);
    // A part that shows up much later isn't sent anywhere.
    expect(take({ seq: 0 })).toBeNull();
  });

  it('select the items changed together (that are on this slide)', () => {
    nav.request = { place: { tab: 'tiebreaker', side: 'q', element: 'a' }, items: ['a', 'b', 'gone'], seq: 9, at: Date.now() };
    const slide = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(itemsFor('a', slide)).toEqual(['a', 'b']);
    expect(itemsFor('c', slide)).toEqual(['c']);
  });
});
