// A 🤫 card as the players it goes to get it (partner-clues spec §12.3): its words, top to bottom, then its pictures,
// GIFs, videos, sounds and embeds in the order they sit on the slide (by y, then x). cardItems lists them (the two-window
// host column, the partner panel's counts, 📋 Copy words and Copy picture); phoneCard builds the stack a phone gets from
// it, so the editor's 📱 preview, the host column and what goes to the buzzer room are the same card. Model types,
// links.ts and buzzproto.ts only, so the phone page can share it.
import { cardLink, CARD_MEDIA_MAX, CARD_TEXT_MAX, CARD_TITLE_MAX, clip, FILE_MAX_BYTES, fileType, type CardMedia } from './buzzproto';
import { embedName, isLinkProblem, linkLifetime, nameFromUrl, parseMediaLink, playerFor, youtubeId } from './links';
import type { EmbedEl, Game, Id, MediaRef, Playback, Slide, SlideElement, TextEl } from './model';

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

// ---------- What a phone gets (partner-clues spec §12.3, §13.4, §13.5) ----------

/**
 * Why an item won't reach a phone: a file over FILE_MAX_BYTES ('big'), an online link that stopped working
 * ('expired'), a kind of file or link phones don't take ('kind'), a file from this computer while the buzzer server
 * takes none ('nofiles'), an upload the server turned down or that broke off ('failed'), a file no longer in the game's
 * media ('lost'), or more than CARD_MEDIA_MAX on one card ('many').
 */
export type LeftOut = 'big' | 'expired' | 'kind' | 'nofiles' | 'failed' | 'lost' | 'many';

/** One item as a phone gets it: by its link, as a file from this computer (`file`: its media id is `media`), or not at all. */
export interface PhoneItem extends CardItem {
  /** What goes on the card for it ({ missing } when it won't come; left out with 'many'). */
  goes: CardMedia;
  /** It goes up from this computer (the room's file, or on its way). */
  file?: boolean;
  why?: LeftOut;
}

export interface PhoneCardContent {
  /** The card's largest short line, when it has other words too. */
  title?: string;
  /** Its words (the title's line left out), top to bottom, at most CARD_TEXT_MAX characters. */
  text?: string;
  /** Its pictures, GIFs, videos, sounds and embeds, in order (at most CARD_MEDIA_MAX). */
  media: CardMedia[];
  /** Each item and how it goes, in order. */
  items: PhoneItem[];
  /** What a phone won't get, and why: named in the editor's preview and the two-window host column; the panel only counts them. */
  left: { item: string; kind: CardItem['kind']; why: LeftOut }[];
}

/**
 * What the phones can get: `files`, the room's ids for the files already up (by media id), or null when the buzzer
 * server takes no files (they go as { missing }). `failed`: files whose upload didn't work, and why.
 */
export interface PhoneCan {
  files: Record<Id, string> | null;
  failed?: Record<Id, LeftOut>;
}

/** A link a phone may load: https, CARD_LINK_MAX characters at most, no user name or password (the room checks it again). */
export const phoneLink = (s: string | undefined): string | null => cardLink(s);

/** Words cut to `max` characters, with "…" when cut. */
export const clipWords = (s: string, max = CARD_TEXT_MAX): string => clip(s, max);

const MEDIA_KIND = { picture: 'image', gif: 'image', video: 'video', sound: 'audio' } as const;

/** A picture goes as itself (a GIF: it moves) or shrunk on this computer first (any other picture, see cardfiles). */
export const shrinks = (item: Pick<CardItem, 'kind'>): boolean => item.kind === 'picture';

/** Where a video, sound or embed starts and ends (seconds), for the phone's player. */
function times(e: SlideElement): { start?: number; end?: number } {
  if (e.kind !== 'video' && e.kind !== 'audio' && e.kind !== 'embed') return {};
  const p: Playback = e;
  const ok = (n: number | undefined) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return { ...(ok(p.startAt) ? { start: p.startAt } : {}), ...(ok(p.endAt) ? { end: p.endAt } : {}) };
}

/** An embed in its site's player: YouTube, Google Drive or Streamable, when the link is one. */
function embedSite(e: EmbedEl): 'youtube' | 'drive' | 'streamable' | null {
  if (e.embedKind === 'youtube') return youtubeId(e.url) ? 'youtube' : null;
  if (e.embedKind === 'drive' || e.embedKind === 'streamable') return playerFor(e.embedKind, e.url) ? e.embedKind : null;
  return null;
}

/**
 * A stored file's lasting online address (partner-clues spec §13.4): the link it was added from, when that link plays
 * for good (not a temporary or expired one, not a site that blocks playing its files elsewhere) and the picture wasn't
 * edited. Null: it goes as a file.
 */
function lastingLink(ref: MediaRef, kind: 'image' | 'video' | 'audio', edited: boolean): string | null {
  if (edited || !ref.source || linkLifetime(ref)) return null;
  const p = parseMediaLink(ref.source, kind);
  if (!p || isLinkProblem(p) || p.temporary || p.noLive) return null;
  return phoneLink(p.playUrls[0]);
}

/**
 * A card as the phones get it (partner-clues spec §12.3): a title (its largest short line, when it has other words
 * too), its words, then each item in order. An online item goes as its link; a file from this computer goes as the
 * room's file once it's up (`can.files`), else { pending }; one that won't come is { missing }, with why in `left`. The
 * editor's 📱 preview, the host column and what the room gets all come from here.
 */
export function phoneCard(game: Pick<Game, 'media'>, slide: Slide, can: PhoneCan): PhoneCardContent {
  const texts = slide.elements.filter((e): e is TextEl => e.kind === 'text' && !!e.text.trim()).sort(byPlace);
  const short = texts.filter((t) => t.text.trim().length <= CARD_TITLE_MAX && !t.text.trim().includes('\n'));
  const head = texts.length > 1 && short.length ? short.reduce((a, b) => (b.size > a.size ? b : a)) : undefined;
  const words = texts
    .filter((t) => t !== head)
    .map((t) => t.text.trim())
    .join('\n');
  const refOf = (id: Id | undefined) => (id ? game.media.find((m) => m.id === id) : undefined);
  const items: PhoneItem[] = [];
  for (const item of cardItems(game, slide)) {
    const e = slide.elements.find((x) => x.id === item.el)!;
    const name = e.name?.trim() ? { name: clip(e.name.trim(), 100) } : {};
    const missing = (why: LeftOut): PhoneItem => ({ ...item, goes: { kind: item.kind === 'embed' ? 'video' : MEDIA_KIND[item.kind], missing: true }, why });
    if (items.length >= CARD_MEDIA_MAX) {
      items.push(missing('many'));
      continue;
    }
    if (e.kind === 'embed') {
      const url = phoneLink(e.url);
      const site = embedSite(e);
      if (site) items.push(url ? { ...item, goes: { kind: 'embed', site, url, ...times(e) } } : missing('kind'));
      else if (item.kind === 'embed') items.push(missing('kind'));
      else if (linkLifetime({ url: e.url }) === 'expired') items.push(missing('expired'));
      else items.push(url ? { ...item, goes: { kind: MEDIA_KIND[item.kind], url, ...times(e), ...name } } : missing('kind'));
      continue;
    }
    if (item.kind === 'embed') continue;
    const kind = MEDIA_KIND[item.kind];
    const ref = refOf(item.media);
    if (!ref) {
      items.push(missing('lost'));
      continue;
    }
    // A link that plays live (no copy stored): the phone plays it from there too.
    if (ref.url) {
      const url = phoneLink(ref.url);
      items.push(linkLifetime(ref) === 'expired' ? missing('expired') : url ? { ...item, goes: { kind, url, ...times(e), ...name } } : missing('kind'));
      continue;
    }
    const link = lastingLink(ref, kind, e.kind === 'image' && !!e.editedMedia);
    if (link) {
      items.push({ ...item, goes: { kind, url: link, ...times(e), ...name } });
      continue;
    }
    // A file from this computer. A picture is shrunk first (any size, any type a browser draws); a GIF, a video or a
    // sound goes as it is.
    const type = fileType(ref.mime);
    const why: LeftOut | null =
      can.files === null
        ? 'nofiles'
        : !shrinks(item) && (!type || !type.startsWith(`${kind}/`))
          ? 'kind'
          : !shrinks(item) && ref.size > FILE_MAX_BYTES
            ? 'big'
            : (can.failed?.[ref.id] ?? null);
    if (why) {
      items.push({ ...missing(why), file: why !== 'nofiles' });
      continue;
    }
    const id = can.files?.[ref.id];
    items.push({ ...item, file: true, goes: id ? { kind, file: id, mime: ref.mime, ...times(e), ...name } : { kind, pending: true } });
  }
  const media = items.filter((i) => i.why !== 'many').map((i) => i.goes);
  return {
    ...(head ? { title: head.text.trim() } : {}),
    ...(words ? { text: clipWords(words) } : {}),
    media,
    items,
    left: items.flatMap((i) => (i.why ? [{ item: i.name, kind: i.kind, why: i.why }] : [])),
  };
}

/** The files a card needs uploaded (media ids, each once): its items from this computer that aren't up or left out. */
export function filesToSend(content: Pick<PhoneCardContent, 'items'>): Id[] {
  return [...new Set(content.items.flatMap((i) => (i.file && !i.why && 'pending' in i.goes && i.media ? [i.media] : [])))];
}
