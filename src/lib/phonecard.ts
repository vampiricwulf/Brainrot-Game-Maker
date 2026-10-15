// A 🤫 card as the players it goes to get it (partner-clues spec §12.3): its words, top to bottom, then its pictures,
// GIFs, videos, sounds and embeds in the order they sit on the slide (by y, then x). For now the two-window host column
// lists them, the partner panel counts them and 📋 Copy words and Copy picture hand them out; a phone's card builds on
// the same order later. Model types and links.ts only, so the phone page can share it.
import { embedName, nameFromUrl } from './links';
import type { Game, Id, MediaRef, Slide, SlideElement } from './model';

/** One picture, GIF, video, sound or embed on a card. */
export interface CardItem {
  el: Id;
  kind: 'picture' | 'gif' | 'video' | 'sound' | 'embed';
  /** The item's name ("shrek.png"): for the editor and the two-window host column only, never the partner panel. */
  name: string;
  /** Its file in the game (a picture's edited copy, if it was edited). */
  media?: Id;
  /** The online link it plays from (an embed, a link item, or a file added as a link that wasn't saved). */
  url?: string;
}

/** By where they sit on the slide: top to bottom, then left to right. */
const byPlace = (a: SlideElement, b: SlideElement) => a.y - b.y || a.x - b.x;

const isGif = (name: string, mime = '') => mime === 'image/gif' || /\.gif$/i.test(name);

/** A card's pictures, GIFs, videos, sounds and embeds in the order a phone shows them (text boxes and shapes aren't items). */
export function cardItems(game: Pick<Game, 'media'>, slide: Slide): CardItem[] {
  const refOf = (id: Id | undefined): MediaRef | undefined => (id ? game.media.find((m) => m.id === id) : undefined);
  const out: CardItem[] = [];
  for (const e of [...slide.elements].sort(byPlace)) {
    const own = e.name?.trim();
    if (e.kind === 'image' || e.kind === 'video' || e.kind === 'audio') {
      const media = e.kind === 'image' ? (e.editedMedia ?? e.media) : e.media;
      // (An edited picture's copy is named after the picture it was made from.)
      const ref = refOf(media) ?? refOf(e.media);
      const name = own || ref?.name || (e.kind === 'image' ? 'Picture' : e.kind === 'video' ? 'Video' : 'Sound');
      const kind = e.kind === 'image' ? (isGif(ref?.name ?? '', ref?.mime) ? 'gif' : 'picture') : e.kind === 'video' ? 'video' : 'sound';
      out.push({ el: e.id, kind, name, media, ...(ref?.url ? { url: ref.url } : {}) });
    } else if (e.kind === 'embed') {
      const file = e.embedKind === 'remoteImage' || e.embedKind === 'remoteVideo' || e.embedKind === 'remoteAudio';
      const name = own || (file ? nameFromUrl(e.url) : embedName(e.embedKind, e.url));
      const kind =
        e.embedKind === 'remoteImage'
          ? isGif(name) || isGif(e.url.split(/[?#]/)[0]) ? 'gif' : 'picture'
          : e.embedKind === 'remoteVideo'
            ? 'video'
            : e.embedKind === 'remoteAudio'
              ? 'sound'
              : 'embed';
      out.push({ el: e.id, kind, name, url: e.url });
    }
  }
  return out;
}

/** A card's words: every text box with something in it, top to bottom (a box hidden from viewers too: a card is private). */
export function cardWords(slide: Slide): string {
  return slide.elements
    .filter((e) => e.kind === 'text' && !!e.text.trim())
    .sort(byPlace)
    .map((e) => (e.kind === 'text' ? e.text.trim() : ''))
    .join('\n');
}

/** The online links on a card (its embeds, and items that play from a link), each once: 📋 Copy words adds them. */
export function cardLinks(game: Pick<Game, 'media'>, slide: Slide): string[] {
  return [...new Set(cardItems(game, slide).flatMap((i) => (i.url ? [i.url] : [])))];
}
