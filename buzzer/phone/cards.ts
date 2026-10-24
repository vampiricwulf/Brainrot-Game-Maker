/**
 * A private card on the phone (partner-clues spec §12.3, §14.6, §16): its lines, and what each picture, video, sound or
 * embed on it becomes. No page here (cardpanel.ts draws it), so it's unit-tested (cards.test.ts).
 */
import { bigWords, cardLink, isFileId, type CardMedia, type PhoneCard } from '../../src/lib/buzzproto';
import { playerFor, youtubeId, youtubePlayerUrl, youtubeStart } from '../../src/lib/links';

/** (Shared with the editor's 📱 preview, so it makes the same words huge.) */
export { bigWords };

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
  if ('gif' in m && m.gif === true) return true;
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
export const mediaName = (m: CardMedia): string => ('name' in m && m.name?.trim()) || upper(mediaWord(shownKind(m)));
/** What an item is to the player: a GIF sent as a video ('gifs') is a picture, as it shows like one. */
export const shownKind = (m: CardMedia): CardMedia['kind'] => ('gif' in m && m.gif === true ? 'image' : m.kind);

/** A file on its way: "🖼 Picture coming…". */
export const comingLine = (kind: CardMedia['kind']): string => `${icon(kind)} ${upper(mediaWord(kind))} coming…`;
/** A file whose download says how far it got over this (its Content-Length) shows how much has come. */
export const SHOW_PCT_BYTES = 4 * 1024 * 1024;
/** How much of a big file has come, in whole percents (null: not one that says it). */
export const pctOf = (got: number, total: number): number | null => (total > SHOW_PCT_BYTES ? Math.min(100, Math.floor((got / total) * 100)) : null);
/** A file on its way, and for a big one how much has come: "🎞 Video coming… 40%". */
export function waitLine(kind: CardMedia['kind'], got = 0, total = 0): string {
  const pct = pctOf(got, total);
  return pct === null ? comingLine(kind) : `${comingLine(kind)} ${pct}%`;
}
/** A file that won't come (too big, the server takes none, the upload failed): the host shows it another way. */
export const missingLine = (kind: CardMedia['kind']): string => `${icon(kind)} The host will show you this ${mediaWord(kind)}`;
/** One this phone couldn't load (a link that didn't work, a download that failed): the host doesn't know, so ask. */
export const brokenLine = (kind: CardMedia['kind']): string => `${icon(kind)} This ${mediaWord(kind)} didn’t load. Ask the host to show you.`;
/** Said (to a screen reader) when a file that was coming arrives in a card that's open. */
export const arrivedLine = (kind: CardMedia['kind']): string => `Your ${mediaWord(kind)} is here`;

/**
 * The card's top line: who can see it (a card sent to a team shows on every phone on it; a shared one went to others
 * too, never named).
 */
export const cardHead = (c: Pick<PhoneCard, 'team' | 'shared'>): string =>
  `🤫 Only ${c.team ? 'your team' : 'you'}${c.shared ? ' and the others the host chose' : ''} can see this`;
/** Its part, as a line: "You’re the Describer". */
export const roleLine = (role: string): string => `You’re the ${role}`;

/**
 * What a card's cover and words are built from: under the same id, it's drawn again only when this changes (the lines
 * over the cover, who can see it, its part and its hint, change in place, so an open player isn't reset).
 */
export const cardBuild = (c: PhoneCard): string => JSON.stringify([c.title, c.text, c.tap]);
/** All a card shows, its pictures and players too: the same card back under a new id (↻ Send again) stays open. */
export const cardSame = (c: PhoneCard): string => JSON.stringify([c.role, c.hint, c.title, c.text, c.team, c.shared, c.tap, c.media ?? []]);

/**
 * Said once as cards arrive: "A card only you can see" ("A card the host sent to you and others" when one is shared).
 * "Your team" only when every new card went to the whole team: on a team, a card can go to one person.
 */
export function cardsLine(fresh: Pick<PhoneCard, 'team' | 'shared'>[]): string {
  const n = fresh.length;
  if (!n) return '';
  const who = fresh.every((c) => c.team) ? 'your team' : 'you';
  if (fresh.some((c) => c.shared)) return n === 1 ? `A card the host sent to ${who} and others` : `${n} cards the host sent to ${who} and others`;
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

/**
 * The card files these cards use (each once): what the phone keeps fetched, and lets go of the rest. Only real file
 * ids: one goes into a request's address, with this phone's token beside it.
 */
export const filesIn = (cards: readonly PhoneCard[]): Set<string> =>
  new Set(cards.flatMap((c) => (c.media ?? []).flatMap((m) => ('file' in m && isFileId(m.file) ? [m.file] : []))));

/**
 * A card file's body, read to its end (onBytes hears how much has come, and its Content-Length, 0 when it has none).
 * Throws when it broke off: an error, or fewer bytes than its Content-Length (a body cut short can look like its end).
 */
export async function readCardFile(r: Response, onBytes?: (got: number, total: number) => void): Promise<Blob> {
  const length = Number(r.headers.get('Content-Length'));
  // (A compressed body's length isn't the file's.)
  const total = !r.headers.get('Content-Encoding') && Number.isSafeInteger(length) && length > 0 ? length : 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let got = 0;
  const reader = r.body?.getReader();
  for (;;) {
    const next = await reader?.read();
    if (!next || next.done) break;
    chunks.push(next.value);
    got += next.value.byteLength;
    onBytes?.(got, total);
  }
  if (total && got !== total) throw new Error(`card file broke off: ${got} of ${total} bytes`);
  return new Blob(chunks, { type: r.headers.get('Content-Type') ?? '' });
}

/** A download worth trying again (and how many tries in all): a moment's 404 (the room catching up), too many, a server error, no network (or a body that broke off). */
export function retryAfter(status: number | null, tries: number): number | null {
  const max = status === 404 ? 2 : 4;
  if (tries >= max) return null;
  if (status !== null && status !== 404 && status !== 429 && status < 500) return null;
  return [1500, 4000, 10_000][tries - 1] ?? 10_000;
}
