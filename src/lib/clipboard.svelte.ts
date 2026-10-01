// In-app clipboard for slide elements, whole slides, board clues, RPG screens, sets of buttons and whole rounds (works
// across slides, clues, maps and games).
// The board images editor shares the slide items, so pictures copy between boards and slides both ways.
import { uniqueMediaName } from './medianame';
import {
  newId,
  type Action,
  type Clue,
  type DicePreset,
  type Game,
  type ItemDef,
  type MediaRef,
  type Round,
  type Screen,
  type Shop,
  type Slide,
  type SlideElement,
  type StatField,
  type WheelPreset,
  type World,
} from './model';

/**
 * A round with what it needs from its game (its RPG world, the wheels, dice, stats, items and shops it uses, its
 * files), so it goes into another game whole (roundcopy.ts).
 */
export interface RoundBundle {
  round: Round;
  /** The game it came from, for messages. */
  from: string;
  worlds: World[];
  wheels: WheelPreset[];
  dice: DicePreset[];
  statFields: StatField[];
  items: ItemDef[];
  shops: Shop[];
  media: MediaRef[];
}

/** A deep copy (ops.ts's clone: importing ops here would lead back round to media.svelte.ts, which imports this). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const clipboard = $state<{
  elements: SlideElement[];
  slide: Slide | null;
  /** An RPG screen, with its looks, music and notes. */
  screen: Screen | null;
  /** A board clue: both slides and its settings. */
  clue: Clue | null;
  /** Buttons (actions) of an object, item, space or wheel slice. */
  actions: Action[];
  /** A whole round, with what it uses (its files are in `media` too, so they're kept while it's copied). */
  round: RoundBundle | null;
  /** The files the copied items, slide, clue, screen and buttons show, so they paste into another game with them (see pruneMedia). */
  media: MediaRef[];
  /** The wheels and dice the copied clue, screen and buttons use (a wheel or dice clue, a Spin button…), for the same. */
  wheels: WheelPreset[];
  dice: DicePreset[];
  /** Written to the system clipboard with a copy, so a paste can tell whether something newer was copied since. */
  token: string;
  /** The readable text/plain part of that copy. */
  text: string;
}>({ elements: [], slide: null, screen: null, clue: null, actions: [], round: null, media: [], wheels: [], dice: [], token: '', text: '' });

/** Custom clipboard type marking our own copies (the text/plain part is readable anywhere). */
const CLIP_TYPE = 'application/x-brainrot-slide-items';
/** What copies made before the rename (Jeopardy Builder) put on the clipboard. */
const OLD_CLIP_TYPE = 'application/x-jeopardy-slide-items';

/** Each id once (the first one wins). */
const once = <T extends { id: string }>(list: T[]): T[] => list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i);

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
  // (A screen copied on the map, a clue on the board, or a set of buttons, keeps its files too.)
  const all = [...refs, ...mediaShownBy([clipboard.screen, clipboard.clue, clipboard.actions, clipboard.wheels, clipboard.dice, clipboard.round], clipboard.media)];
  clipboard.media = clone(once(all));
}

/**
 * Copying a clue, a screen or buttons (`x`): keep the wheels and dice of this game it uses, and the files it and they
 * show, so it pastes into another game with them.
 */
export function holdUsedBy(game: Game, x: unknown): void {
  const json = JSON.stringify(x ?? null);
  clipboard.wheels = clone(once([...game.wheels.filter((w) => json.includes(w.id)), ...clipboard.wheels]));
  clipboard.dice = clone(once([...game.dice.filter((d) => json.includes(d.id)), ...clipboard.dice]));
  clipboard.media = clone(once([...clipboard.media, ...mediaShownBy([x, clipboard.wheels, clipboard.dice], game.media)]));
}

/** A wheel or dice id the pasted thing can use here: this game's, or one that comes along with it (adoptUsedBy). */
export const toolHere = (game: Game, id: string | undefined): boolean =>
  !!id && [...game.wheels, ...game.dice, ...clipboard.wheels, ...clipboard.dice].some((t) => t.id === id);

/** Pasting `x` (held with holdUsedBy) in another game: add the wheels, dice and files it uses that this game doesn't have. */
export function adoptUsedBy(game: Game, x: unknown): void {
  const json = JSON.stringify(x ?? null);
  const wheels = clipboard.wheels.filter((w) => json.includes(w.id) && !game.wheels.some((y) => y.id === w.id));
  const dice = clipboard.dice.filter((d) => json.includes(d.id) && !game.dice.some((y) => y.id === d.id));
  game.wheels.push(...clone(wheels));
  game.dice.push(...clone(dice));
  for (const m of mediaShownBy([x, wheels, dice], clipboard.media))
    if (!game.media.some((y) => y.id === m.id)) game.media.push({ ...clone(m), name: uniqueMediaName(game.media.map((y) => y.name), m.name) });
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
  // (An RPG object's Spin button keeps its wheel.)
  holdUsedBy(game, items);
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
