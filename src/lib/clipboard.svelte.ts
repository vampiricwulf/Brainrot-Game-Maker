// In-app clipboard for slide elements, whole slides, board clues and RPG screens (works across slides, clues, maps
// and games).
// The board images editor shares the slide items, so pictures copy between boards and slides both ways.
import { uniqueMediaName } from './medianame';
import { newId, type Clue, type Game, type MediaRef, type Screen, type Slide, type SlideElement } from './model';

/** A deep copy (ops.ts's clone: importing ops here would lead back round to media.svelte.ts, which imports this). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const clipboard = $state<{
  elements: SlideElement[];
  slide: Slide | null;
  /** An RPG screen, with its looks, music and notes. */
  screen: Screen | null;
  /** A board clue: both slides and its settings. */
  clue: Clue | null;
  /** The files the copied items, slide, clue and screen show, so they paste into another game with them (see pruneMedia). */
  media: MediaRef[];
  /** Written to the system clipboard with a copy, so a paste can tell whether something newer was copied since. */
  token: string;
  /** The readable text/plain part of that copy. */
  text: string;
}>({ elements: [], slide: null, screen: null, clue: null, media: [], token: '', text: '' });

/** Custom clipboard type marking our own copies (the text/plain part is readable anywhere). */
const CLIP_TYPE = 'application/x-brainrot-slide-items';
/** What copies made before the rename (Jeopardy Builder) put on the clipboard. */
const OLD_CLIP_TYPE = 'application/x-jeopardy-slide-items';

/** The files of `refs` that something copied shows (pictures, sounds, music, fonts: anywhere in it). */
export function mediaShownBy(x: unknown, refs: readonly MediaRef[]): MediaRef[] {
  const json = JSON.stringify(x ?? null);
  return refs.filter((m, i) => json.includes(m.id) && refs.findIndex((r) => r.id === m.id) === i);
}

/** The media files items show (and a slide's background picture). */
export function elementMediaIds(els: SlideElement[], background?: Slide['background']): string[] {
  const ids = els.flatMap((x) => (x.kind === 'image' ? [x.media, x.editedMedia] : x.kind === 'video' || x.kind === 'audio' ? [x.media] : []));
  return [...ids, background?.image].filter((id): id is string => !!id);
}

/** Keep the files of what's copied with it (from this game, or an earlier copy's), so it pastes into another game. */
export function holdMedia(game: Game): void {
  const s = clipboard.slide;
  const ids = new Set([...elementMediaIds(clipboard.elements), ...(s ? elementMediaIds(s.elements, s.background) : [])]);
  const refs = [...game.media, ...clipboard.media].filter((m) => ids.has(m.id));
  // (A screen copied on the map, or a clue on the board, keeps its files too.)
  const all = [...refs, ...mediaShownBy([clipboard.screen, clipboard.clue], clipboard.media)];
  clipboard.media = clone(all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i));
}

/** Pasting what was copied in another game: add the files it shows that this game doesn't have. */
export function adoptMedia(game: Game, ids: string[]): void {
  for (const m of clipboard.media)
    if (ids.includes(m.id) && !game.media.some((x) => x.id === m.id)) game.media.push({ ...clone(m), name: uniqueMediaName(game.media.map((x) => x.name), m.name) });
}

/** Copy items to the in-app clipboard, and mark the system clipboard (`data`, when there is one) as ours. */
export function copyElements(game: Game, from: SlideElement[], data: DataTransfer | null): number {
  const items = clone(from);
  const words = items.flatMap((x) => (x.kind === 'text' && x.text.trim() ? [x.text] : [])).join('\n');
  clipboard.elements = items;
  holdMedia(game);
  clipboard.token = newId();
  clipboard.text = words || `${items.length} slide item${items.length === 1 ? '' : 's'}`;
  data?.setData('text/plain', clipboard.text);
  data?.setData(CLIP_TYPE, clipboard.token);
  return items.length;
}

/** A paste is of our own copied items, unless something newer (a link, some text) was copied since. */
export function pastingOurs(data: DataTransfer | null): boolean {
  const text = data?.getData('text/plain') ?? '';
  const token = data?.getData(CLIP_TYPE) || data?.getData(OLD_CLIP_TYPE) || '';
  return !!clipboard.elements.length && (token ? token === clipboard.token : text === clipboard.text);
}

/**
 * Copy from a right-click menu: `copy` runs inside a copy event when the browser allows one (so the system clipboard
 * is marked as ours, and Ctrl+V pastes it back), else with no clipboard data.
 */
export function copyFromMenu(copy: (data: DataTransfer | null) => void): void {
  let done = false;
  const grab = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    done = true;
    copy(e.clipboardData);
  };
  window.addEventListener('copy', grab, true);
  try {
    document.execCommand('copy');
  } catch {
    // No copy event: the in-app clipboard still has it.
  } finally {
    window.removeEventListener('copy', grab, true);
  }
  if (!done) copy(null);
}
