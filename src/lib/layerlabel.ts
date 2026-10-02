// How the layers list, the right-click menu, the editors' notices and the undo history name slide items.
import { embedName } from './links';
import type { Game, SlideElement } from './model';
import { classIcon } from './rpg';

/** Where Align puts items: at the slide's edges or centred across (hcenter) or down (vcenter) it (several: lined up with each other), or spaced evenly (distribute). */
export type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdistribute' | 'vdistribute';

/**
 * What the right-click menu (and its shortcuts) can do: to the selection, or on an empty spot (paste there, select
 * all, and in the slide editor a whole slide, a text box there and the background).
 */
export type LayerAction =
  | 'front' | 'forward' | 'backward' | 'back' | 'duplicate' | 'lock' | 'unlock' | 'hide' | 'delete'
  | 'cut' | 'copy' | 'paste' | 'edit-image' | `align-${Align}`
  | 'select-all' | 'paste-slide' | 'add-text' | 'background';

/** The one notice for an action that left locked items alone (delete, cut, align, nudge). */
export function lockedNote(n: number, noun = 'item'): string {
  return `🔒 Skipped ${n} locked ${noun}${n === 1 ? '' : 's'}: unlock ${n === 1 ? 'it' : 'them'} first.`;
}

export const LAYER_ICON: Record<SlideElement['kind'], string> = { text: '🅣', image: '🖼', video: '🎬', audio: '🔊', shape: '◼', embed: '🌐' };
/** A layer's icon: what an RPG object is (🧙 a character, 📦 an item…), else what kind of item it is. */
export function layerIcon(el: SlideElement): string {
  return classIcon(el.role?.class) ?? LAYER_ICON[el.kind];
}
const SHAPES = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', path: 'Drawing' };

/** Text as a label shows it: its first line, 40 characters at most. */
export const short = (s: string) => {
  const line = s.trim().split('\n')[0];
  return line.length > 40 ? `${line.slice(0, 39).trimEnd()}…` : line;
};

const NOUNS: Record<SlideElement['kind'], [string, string]> = {
  text: ['text box', 'text boxes'],
  image: ['image', 'images'],
  video: ['video', 'videos'],
  audio: ['audio clip', 'audio clips'],
  shape: ['shape', 'shapes'],
  embed: ['link', 'links'],
};

/**
 * Items as the History names a step done to them: shape “Ellipse”, 3 shapes, or 3 items when they're of different
 * kinds (named from the changes alone, a paste of a text box and two shapes was "Added 3 text boxes").
 */
export function itemsNamed(els: SlideElement[], game: Game): string {
  if (els.length === 1) return `${NOUNS[els[0].kind][0]} “${short(layerLabel(els[0], game))}”`;
  return `${els.length} ${new Set(els.map((e) => e.kind)).size === 1 ? NOUNS[els[0].kind][1] : 'items'}`;
}

export function layerLabel(el: SlideElement, game: Game): string {
  if (el.name?.trim()) return el.name.trim();
  switch (el.kind) {
    case 'text':
      return el.text.trim().split('\n')[0].slice(0, 60) || 'Empty text';
    case 'image':
    case 'video':
    case 'audio':
      return game.media.find((m) => m.id === el.media)?.name ?? (el.kind === 'image' ? 'Image' : el.kind === 'video' ? 'Video' : 'Audio');
    case 'shape':
      return el.hotspot ? 'Hotspot' : SHAPES[el.shape];
    case 'embed':
      return embedName(el.embedKind, el.url);
  }
}
