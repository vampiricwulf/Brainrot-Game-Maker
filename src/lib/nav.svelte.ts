// Going to a place in the editor: where an undone or redone step shows, and the History tab's Go there. goTo() makes
// a request; each part of the editor that owns what's on screen there (the tab, the open clue, the selected screen…)
// takes it in an effect, and the thing itself flashes (it carries a data-place attribute, see placeKey()).
import { tick } from 'svelte';
import { app } from './app.svelte';
import type { Place, RoundPart, Side } from './historylabel';
import type { Game, Slide } from './model';

export type { Place, RoundPart, Side };

export interface NavRequest {
  place: Place;
  /** The slide items (or board images) the step changed: the place's own one and the others changed with it. */
  items: string[];
  seq: number;
  at: number;
}

/** A part of the editor that shows up because of a request (a clue editor opening) still takes it this long after. */
const FRESH_MS = 1500;
const FLASH_MS = 1200;

class Nav {
  request = $state.raw<NavRequest | null>(null);
}
export const nav = new Nav();
let seq = 0;

/**
 * Show a place: the tab, what's open in it and the thing itself, flashed (with `items`, the slide items changed with
 * it, selected together). What was deleted since is left out: returns the place it went to (`place` itself when all
 * of it is there), or null when nothing of it is.
 */
export function goTo(place: Place, items: string[] = []): Place | null {
  const found = resolve(app.game, place);
  if (!found) return null;
  nav.request = { place: found, items, seq: ++seq, at: Date.now() };
  endOnNextInput();
  const key = placeKey(found);
  if (key) flash(key);
  return found;
}

/**
 * A request is over as soon as the user does something else: a tab opened by a click right after an undo must not
 * still go to the undone step's place (it used to, for the rest of FRESH_MS).
 */
function endOnNextInput(): void {
  if (typeof window === 'undefined') return;
  const end = () => {
    nav.request = null;
    window.removeEventListener('pointerdown', end, true);
    window.removeEventListener('keydown', end, true);
  };
  // After this tick: the key or click that asked for the undo is still being handled.
  setTimeout(() => {
    window.addEventListener('pointerdown', end, true);
    window.addEventListener('keydown', end, true);
  });
}

/**
 * The request for one part of the editor (`handled` is its own): each request once, and only while it's fresh (a
 * part that mounts much later isn't sent anywhere). Call it in an $effect.
 */
export function take(handled: { seq: number }): Place | null {
  const r = nav.request;
  if (!r || r.seq <= handled.seq || Date.now() - r.at > FRESH_MS) return null;
  handled.seq = r.seq;
  return r.place;
}

/** The items of `list` a request for its item `id` selects: those the step changed with it, else just that one. */
export function itemsFor(id: string, list: readonly { id: string }[]): string[] {
  const items = nav.request?.items ?? [];
  return items.includes(id) ? items.filter((x) => list.some((e) => e.id === x)) : [id];
}

/** The slide item a place picks, if any. */
export function placeElement(p: Place): string | undefined {
  if (p.tab === 'round') return p.part && 'element' in p.part ? p.part.element : undefined;
  return p.tab === 'tiebreaker' || p.tab === 'world' ? p.element : undefined;
}

/** The data-place key of what flashes there ('category:<id>', 'screen:<id>'…), or null for nothing in particular. */
export function placeKey(p: Place): string | null {
  const el = placeElement(p);
  if (el) return `el:${el}`;
  switch (p.tab) {
    case 'title':
      return 'title';
    case 'setup':
      return p.player ? `player:${p.player}` : null;
    case 'tools':
      return p.wheel ? `wheel:${p.wheel}` : p.dice ? `dice:${p.dice}` : null;
    case 'stats':
      return p.stat ? `stat:${p.stat}` : p.item ? `item:${p.item}` : p.shop ? `shop:${p.shop}` : null;
    case 'media':
      return p.media ? `media:${p.media}` : null;
    case 'round': {
      const part = p.part;
      if (!part) return `round:${p.round}`;
      if (part.kind === 'category') return `category:${part.category}`;
      if (part.kind === 'clue') return `clue:${part.clue}`;
      if (part.kind === 'space') return `space:${part.space}`;
      if (part.kind === 'zone') return `zone:${part.zone}`;
      return part.kind === 'values' ? `values:${p.round}` : null;
    }
    case 'world':
      return p.screen ? `screen:${p.screen}` : p.map ? `map:${p.map}` : null;
    default:
      return null;
  }
}

/** Once what a request opens is on screen, scroll the [data-place] thing into view and flash it. */
export function flash(key: string): void {
  void settled().then(() => {
    const els = document.querySelectorAll<HTMLElement>(`[data-place="${CSS.escape(key)}"]`);
    els[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    for (const el of els) {
      el.classList.remove('flash');
      // (Restarts the animation when it's still going.)
      void el.offsetWidth;
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), FLASH_MS);
    }
  });
}

async function settled(): Promise<void> {
  await tick();
  await tick();
  await new Promise((r) => requestAnimationFrame(r));
}

const has = <T extends { id: string }>(list: readonly T[] | undefined, id: string | undefined): T | undefined =>
  id === undefined ? undefined : list?.find((x) => x.id === id);
const inSlide = (s: Slide | undefined, id: string | undefined) => !!has(s?.elements, id);

/** The part of `place` that's still in `game` (the same object when all of it is), or null when none is. */
export function resolve(game: Game, place: Place): Place | null {
  switch (place.tab) {
    case 'setup':
      return !place.player || has(game.players, place.player) ? place : { tab: 'setup' };
    case 'tools':
      return (place.wheel ? has(game.wheels, place.wheel) : !place.dice || has(game.dice, place.dice)) ? place : { tab: 'tools' };
    case 'stats': {
      const there = place.stat ? has(game.statFields, place.stat) : place.item ? has(game.items, place.item) : !place.shop || has(game.shops, place.shop);
      return there ? place : { tab: 'stats' };
    }
    case 'media':
      return !place.media || has(game.media, place.media) ? place : { tab: 'media' };
    case 'tiebreaker': {
      const tb = game.tiebreaker;
      if (!place.side) return place;
      if (!tb) return { tab: 'tiebreaker' };
      return !place.element || inSlide(place.side === 'q' ? tb.questionSlide : tb.answerSlide, place.element) ? place : { tab: 'tiebreaker', side: place.side };
    }
    case 'round': {
      const r = has(game.rounds, place.round);
      if (!r) return null;
      const part = place.part;
      if (!part) return place;
      const round: Place = { tab: 'round', round: r.id };
      const at = (p: RoundPart): Place => ({ tab: 'round', round: r.id, part: p });
      switch (part.kind) {
        case 'category':
        case 'clue': {
          const cat = r.mode === 'board' ? has(r.categories, part.category) : undefined;
          if (!cat) return round;
          if (part.kind === 'category') return place;
          const clue = has(cat.clues, part.clue);
          if (!clue) return at({ kind: 'category', category: cat.id });
          if (!part.element || inSlide(part.side === 'a' ? clue.answerSlide : clue.questionSlide, part.element)) return place;
          return at({ kind: 'clue', category: cat.id, clue: clue.id, side: part.side });
        }
        case 'values':
          return r.mode === 'board' ? place : round;
        case 'decor':
          if (r.mode !== 'board') return round;
          return !part.element || has(r.decor, part.element) ? place : at({ kind: 'decor' });
        case 'final':
          if (r.mode !== 'final') return round;
          return !part.element || inSlide(part.side === 'a' ? r.answerSlide : r.questionSlide, part.element) ? place : at({ kind: 'final', side: part.side });
        case 'space':
          return r.mode === 'boardgame' && has(r.spaces, part.space) ? place : round;
        case 'backdrop':
          if (r.mode !== 'boardgame') return round;
          return !part.element || inSlide(r.slide, part.element) ? place : at({ kind: 'backdrop' });
        case 'zone': {
          const z = r.mode === 'boardgame' ? has(r.zones, part.zone) : undefined;
          if (!z) return round;
          return !part.element || inSlide(z.slide, part.element) ? place : at({ kind: 'zone', zone: z.id, inSlide: part.inSlide });
        }
      }
      return place;
    }
    case 'world': {
      const w = has(game.worlds, place.world);
      if (!w) return null;
      if (!place.map) return place;
      const m = has(w.maps, place.map);
      if (!m) return { tab: 'world', world: w.id };
      if (!place.screen) return place;
      const s = has(m.screens, place.screen);
      if (!s) return { tab: 'world', world: w.id, map: m.id };
      const look = has(s.variants, place.look);
      if (place.look && !look) return { tab: 'world', world: w.id, map: m.id, screen: s.id };
      if (!place.element || inSlide(look ? look.slide : s.slide, place.element)) return place;
      return { tab: 'world', world: w.id, map: m.id, screen: s.id, look: look?.id, inSlide: place.inSlide };
    }
    default:
      return place;
  }
}
