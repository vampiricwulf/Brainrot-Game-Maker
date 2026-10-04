// Font choices for slide text: bundled fonts, safe system fonts, and fonts uploaded with the game.
import { getBlob } from './media.svelte';
import type { Game } from './model';

export interface FontChoice {
  label: string;
  css: string;
}

export const BUNDLED_FONTS: FontChoice[] = [
  { label: 'Classic clue (serif)', css: "'Libre Baskerville', Georgia, serif" },
  { label: 'Oswald (board)', css: "'Oswald', 'Arial Narrow', sans-serif" },
  { label: 'Anton', css: "'Anton', Impact, sans-serif" },
  { label: 'Bebas Neue', css: "'Bebas Neue', Impact, sans-serif" },
  { label: 'Inter', css: "'Inter', system-ui, sans-serif" },
  { label: 'Bangers (comic)', css: "'Bangers', 'Comic Sans MS', cursive" },
  { label: 'Comic Neue', css: "'Comic Neue', 'Comic Sans MS', cursive" },
  { label: 'Permanent Marker', css: "'Permanent Marker', cursive" },
  { label: 'Press Start 2P (pixel)', css: "'Press Start 2P', monospace" },
  { label: 'Impact (meme)', css: "Impact, 'Anton', sans-serif" },
  { label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { label: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  { label: 'Courier', css: "'Courier New', Courier, monospace" },
];

export const DEFAULT_CLUE_FONT = BUNDLED_FONTS[0].css;

/** Family name used for an uploaded font file. */
export function uploadedFamily(mediaId: string): string {
  return `jb-${mediaId.slice(0, 8)}`;
}

export function fontChoices(game: Game): FontChoice[] {
  const uploaded = game.media
    .filter((m) => m.kind === 'font')
    .map((m) => ({ label: `${m.name.replace(/\.\w+$/, '')} (uploaded)`, css: `'${uploadedFamily(m.id)}', sans-serif` }));
  return [...BUNDLED_FONTS, ...uploaded];
}

/** The fonts each document has, by media id, with the file they came from (a file replaced is loaded again). */
const registered = new WeakMap<Document, Map<string, { blob: Blob; face: FontFace }>>();

/** Register the game's uploaded fonts with the document (host and audience windows both call this). */
export async function registerGameFonts(game: Game, doc: Document = document): Promise<void> {
  let had = registered.get(doc);
  if (!had) registered.set(doc, (had = new Map()));
  for (const m of game.media) {
    if (m.kind !== 'font') continue;
    const blob = getBlob(m.id);
    if (!blob || had.get(m.id)?.blob === blob) continue;
    try {
      const face = new FontFace(uploadedFamily(m.id), await blob.arrayBuffer());
      await face.load();
      // Replaced (🔗 Replace file…, or its Undo): the old face goes, so the new one is drawn.
      const old = had.get(m.id);
      if (old) doc.fonts.delete(old.face);
      doc.fonts.add(face);
      had.set(m.id, { blob, face });
    } catch (err) {
      console.warn(`Couldn't load font ${m.name}`, err);
    }
  }
}
