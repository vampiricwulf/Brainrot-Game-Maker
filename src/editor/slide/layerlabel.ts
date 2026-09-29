// How the layers list, the right-click menu and the editors' notices name slide items.
import { embedName } from '../../lib/links';
import type { Game, SlideElement } from '../../lib/model';

/** What the right-click menu (and its shortcuts) can do to the selection. */
export type LayerAction = 'front' | 'forward' | 'backward' | 'back' | 'duplicate' | 'lock' | 'unlock' | 'hide' | 'delete';

/** The one notice for an action that left locked items alone (delete, cut, align, nudge). */
export function lockedNote(n: number, noun = 'item'): string {
  return `🔒 Skipped ${n} locked ${noun}${n === 1 ? '' : 's'}: unlock ${n === 1 ? 'it' : 'them'} first.`;
}

export const LAYER_ICON: Record<SlideElement['kind'], string> = { text: '🅣', image: '🖼', video: '🎬', audio: '🔊', shape: '◼', embed: '🌐' };
const SHAPES = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow' };

export function layerLabel(el: SlideElement, game: Game): string {
  switch (el.kind) {
    case 'text':
      return el.text.trim().split('\n')[0].slice(0, 60) || 'Empty text';
    case 'image':
    case 'video':
    case 'audio':
      return game.media.find((m) => m.id === el.media)?.name ?? (el.kind === 'image' ? 'Image' : el.kind === 'video' ? 'Video' : 'Audio');
    case 'shape':
      return SHAPES[el.shape];
    case 'embed':
      return embedName(el.embedKind, el.url);
  }
}
