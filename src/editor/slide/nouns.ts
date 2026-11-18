// The words the slide editor uses for what's on it and for the page itself. The same editor edits a slide (items on a
// slide), an RPG screen (objects on a screen: an RPG's “item” is something in the catalog, and its 📦 Item ▾ button
// sits right beside the canvas) and a board game's backdrop (pictures on the board), so it says what its host says.
import { getContext, setContext } from 'svelte';

export type SlideNouns = { thing: string; things: string; page: string };

export const SLIDE_NOUNS: SlideNouns = { thing: 'item', things: 'items', page: 'slide' };
export const SCREEN_NOUNS: SlideNouns = { thing: 'object', things: 'objects', page: 'screen' };
export const BACKDROP_NOUNS: SlideNouns = { thing: 'picture', things: 'pictures', page: 'board' };

const KEY = Symbol('slide nouns');

/** The slide editor's words, for the parts inside it (Inspector, ItemBar, LayerMenu, LayersPanel). */
export function setSlideNouns(get: () => SlideNouns): void {
  setContext(KEY, get);
}

/** The words of the slide editor this is in (a slide's, outside one: the board images editor). */
export function slideNouns(): () => SlideNouns {
  return getContext<(() => SlideNouns) | undefined>(KEY) ?? (() => SLIDE_NOUNS);
}

/** “3 items”, “1 object”. */
export const countOf = (n: number, w: SlideNouns): string => `${n} ${n === 1 ? w.thing : w.things}`;

/** “Slide”, “Screen”: the page's word to start a sentence with. */
export const Page = (w: SlideNouns): string => w.page[0].toUpperCase() + w.page.slice(1);

/** “an item”, “a picture”. */
export const aThing = (w: SlideNouns): string => `${/^[aeiou]/.test(w.thing) ? 'an' : 'a'} ${w.thing}`;
