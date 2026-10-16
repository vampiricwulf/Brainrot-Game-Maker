/**
 * A private card on the phone (partner-clues spec §12.3, §14.6, §16): its lines, and what each picture, video, sound or
 * embed on it becomes. No page here (cardpanel.ts draws it), so it's unit-tested (cards.test.ts).
 */
import { cardLink, type CardMedia, type PhoneCard } from '../../src/lib/buzzproto';
import { playerFor, youtubeId, youtubePlayerUrl, youtubeStart } from '../../src/lib/links';

/**
 * The sites a card's embed may frame. The page's content policy (index.html, frame-src) lets in exactly these, so a
 * frame the phone makes for anything else wouldn't load.
 */
export const FRAME_ORIGINS = ['https://www.youtube-nocookie.com', 'https://drive.google.com', 'https://streamable.com'] as const;

type Embed = Extract<CardMedia, { kind: 'embed' }>;
export type MediaKind = 'image' | 'video' | 'audio';

/**
 * An embed's player, as the app frames it on a slide (links.ts youtubeId and playerFor), started by the tap that makes
 * it: YouTube's no-cookie player, Drive's preview and Streamable's player. Null when the link isn't one of those, or
 * the address it makes isn't on FRAME_ORIGINS.
 */
export function playerSrc(m: Embed): { src: string; title: string } | null {
  const url = cardLink(m.url);
  if (!url) return null;
  let p: { src: string; title: string } | null = null;
  try {
    if (m.site === 'youtube') {
      const id = youtubeId(url);
      if (id) p = { src: youtubePlayerUrl(id, { autoplay: true, start: m.start ?? youtubeStart(url), end: m.end }), title: 'YouTube video' };
    } else {
      const found = playerFor(m.site, url);
      if (found) p = { src: found.src, title: m.site === 'drive' ? 'Google Drive video' : 'Streamable video' };
    }
  } catch {
    // (A phone's browser too old for the link rules: the card says the video didn't load, and the rest still shows.)
    return null;
  }
  return p && FRAME_ORIGINS.some((o) => p!.src.startsWith(`${o}/`)) ? p : null;
}

/** A picture that moves: a GIF file, or a link to one (by its name: a link without one can't be told). */
export function isGif(m: CardMedia): boolean {
  if ('mime' in m) return m.mime === 'image/gif';
  if (!('url' in m) || m.kind !== 'image') return false;
  try {
    return /\.gif$/i.test(new URL(m.url).pathname);
  } catch {
    return false;
  }
}

/** What a picture, video or sound is called on the card ("Picture"; an embed is a video). */
export const mediaWord = (kind: CardMedia['kind']): string => (kind === 'image' ? 'picture' : kind === 'audio' ? 'sound' : 'video');
const icon = (kind: CardMedia['kind']) => (kind === 'image' ? '🖼' : kind === 'audio' ? '🔊' : '🎞');
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A text alternative: the slide item's own name, else "Picture" (or "Video", "Sound"). */
export const mediaName = (m: CardMedia): string => ('name' in m && m.name?.trim()) || upper(mediaWord(m.kind));

/** A file on its way: "🖼 Picture coming…". */
export const comingLine = (kind: CardMedia['kind']): string => `${icon(kind)} ${upper(mediaWord(kind))} coming…`;
/** A file that won't come (too big, the server takes none, the upload failed): the host shows it another way. */
export const missingLine = (kind: CardMedia['kind']): string => `${icon(kind)} The host will show you this ${mediaWord(kind)}`;
/** One this phone couldn't load (a link that didn't work, a download that failed): the host doesn't know, so ask. */
export const brokenLine = (kind: CardMedia['kind']): string => `${icon(kind)} This ${mediaWord(kind)} didn’t load. Ask the host to show you.`;
/** Said (to a screen reader) when a file that was coming arrives in a card that's open. */
export const arrivedLine = (kind: CardMedia['kind']): string => `Your ${mediaWord(kind)} is here`;

/** The card's top line: who can see it (a card sent to a team shows on every phone on it). */
export const cardHead = (c: Pick<PhoneCard, 'team'>): string => (c.team ? '🤫 Only your team can see this' : '🤫 Only you can see this');
/** Its part, as a line: "You’re the Describer". */
export const roleLine = (role: string): string => `You’re the ${role}`;

/** Up to three short words show huge, so a secret word can be read at arm's length. */
export function bigWords(s: string): boolean {
  const t = s.trim();
  return !!t && t.length <= 30 && !/\n/.test(t) && t.split(/\s+/).length <= 3;
}

/** Said once as cards arrive: "A card only you can see". */
export function cardsLine(n: number, team: boolean): string {
  if (!n) return '';
  const who = team ? 'your team' : 'you';
  return n === 1 ? `A card only ${who} can see` : `${n} cards only ${who} can see`;
}

/** Cards sent to this seat before this phone took it (or joined the team, or was moved onto it): it isn't shown them. */
export function lateLine(n: number, team: boolean): string {
  if (!n) return '';
  const where = team ? 'your team' : 'your seat';
  return n === 1
    ? `A card went to ${where} before this phone joined. Ask the host to send it again.`
    : `${n} cards went to ${where} before this phone joined. Ask the host to send them again.`;
}

/** The card files these cards use (each once): what the phone keeps fetched, and lets go of the rest. */
export const filesIn = (cards: readonly PhoneCard[]): Set<string> => new Set(cards.flatMap((c) => (c.media ?? []).flatMap((m) => ('file' in m ? [m.file] : []))));

/** A download worth trying again (and how many tries in all): a moment's 404 (the room catching up), too many, a server error, no network. */
export function retryAfter(status: number | null, tries: number): number | null {
  const max = status === 404 ? 2 : 4;
  if (tries >= max) return null;
  if (status !== null && status !== 404 && status !== 429 && status < 500) return null;
  return [1500, 4000, 10_000][tries - 1] ?? 10_000;
}
