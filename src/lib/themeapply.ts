// A shared theme (a file or a code) used in the game: the pictures and uploaded fonts a file carries are stored first,
// then the theme and its files go into the game in one undo step (ThemeShare).
import { uploadedFamily } from './fonts';
import { fileDigest, putMedia, sanitizeSvg, storedBlob } from './media.svelte';
import { newId, type Game, type MediaRef } from './model';
import { missingFonts, themeFiles, withMyTheme } from './mytheme';
import type { Theme } from './theme';
import type { SharedTheme } from './themefile';

/**
 * Store a shared theme's files. Each keeps its id, unless this browser already has another file under it (another
 * version of the same picture): that one comes in under a new id. Returns the refs to add to the game, and the ids changed.
 * An SVG is cleaned first, as an uploaded one is (its scripts, foreignObjects, handlers and javascript: links).
 */
export async function storeThemeFiles(shared: SharedTheme): Promise<{ refs: MediaRef[]; ids: Map<string, string> }> {
  const refs: MediaRef[] = [];
  const ids = new Map<string, string>();
  for (const f of shared.media) {
    const blob = f.ref.mime === 'image/svg+xml' ? new Blob([sanitizeSvg(await f.blob.text())], { type: f.ref.mime }) : f.blob;
    const stored = await storedBlob(f.ref.id);
    const same = stored && (await fileDigest(stored)) === (await fileDigest(blob));
    const id = !stored || same ? f.ref.id : newId();
    if (id !== f.ref.id) ids.set(f.ref.id, id);
    await putMedia(id, blob);
    refs.push({ ...f.ref, id, size: blob.size });
  }
  return { refs, ids };
}

/** A theme with its files' ids changed (its pictures, and the uploaded fonts' names in its font lists). */
export function renameThemeFiles(t: Theme, ids: ReadonlyMap<string, string>): Theme {
  if (!ids.size) return t;
  const out = { ...t };
  if (out.boardImage && ids.has(out.boardImage)) out.boardImage = ids.get(out.boardImage);
  if (out.banner && ids.has(out.banner)) out.banner = ids.get(out.banner);
  for (const k of ['boardFont', 'valueFont', 'clueFont'] as const) {
    let f = out[k];
    if (!f) continue;
    for (const [from, to] of ids) f = f.split(uploadedFamily(from)).join(uploadedFamily(to));
    out[k] = f;
  }
  return out;
}

/**
 * The game's theme with a shared one on it: its look (as a saved theme's, see withMyTheme) and the pictures it carries
 * (`media`: the game's files once the theme's are in). Pictures it doesn't carry stay the game's own.
 */
export function withShared(current: Theme, shared: Theme, media: readonly MediaRef[]): Theme {
  const t = withMyTheme(current, shared, media);
  const has = themeFiles(shared, media);
  if (shared.boardImage && has.some((m) => m.id === shared.boardImage)) t.boardImage = shared.boardImage;
  if (shared.banner && has.some((m) => m.id === shared.banner)) t.banner = shared.banner;
  return t;
}

/** The uploaded fonts a theme uses that aren't in the game (their text keeps the game's font): how many. */
export const fontsMissing = (t: Theme, game: Game): number => missingFonts(t, game.media).length;
