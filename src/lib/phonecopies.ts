// 🗜 Smaller copies for phones (card-files spec §4.3): a copy is a file in game.media with `phoneCopy`, which phones get
// instead of its file (phonecard.ts). It isn't one of the game's files to a person: no list or picker shows it, it goes
// with its file when that's deleted, and the viewers' windows never get it (sync.svelte.ts).
import type { Game, Id, MediaRef } from './model';
import { playTimes } from './phonecard';
import { allCardSlides } from './usage';

/** The files a person sees and picks from (🖼 Media, the pickers, Find): every one but the 🗜 copies for phones. */
export const libraryMedia = (game: Pick<Game, 'media'>): MediaRef[] => game.media.filter((m) => !m.phoneCopy);

/** These files and their 🗜 copies for phones (deleting a file takes its copy with it). */
export function withCopies(game: Pick<Game, 'media'>, ids: readonly Id[]): Id[] {
  const set = new Set(ids);
  return [...ids, ...game.media.filter((m) => m.phoneCopy && set.has(m.phoneCopy.of) && !set.has(m.id)).map((m) => m.id)];
}

/** Where each of a file's videos and sounds on 🤫 cards starts and stops playing (its Start at and Stop at, seconds). */
export function cardUses(game: Game, id: Id): { start?: number; end?: number }[] {
  return allCardSlides(game).flatMap(({ slide }) => slide.elements.flatMap((e) => ((e.kind === 'video' || e.kind === 'audio') && e.media === id ? [playTimes(e)] : [])));
}
