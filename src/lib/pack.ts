// .brainrot game packs (called .jbr before the rename; same format): a zip holding game.json + media/<id>.<ext> (spec §8).
import JSZip from 'jszip';
import { extOf, getBlob, loadGameMedia, mimeFor, putMedia, registerLinks } from './media.svelte';
import { migrateGame, type Game } from './model';
import { parseGame, safeFilename, saveFile, savedWhere } from './fileio';
import { buildZip, type ZipEntry } from './zipwrite';
import { packInHtml, unpackEmbedded } from './export';

function mediaPath(ref: { id: string; name: string }): string {
  const ext = extOf(ref.name);
  return `media/${ref.id}${ext ? '.' + ext : ''}`;
}

/** Progress while a pack is built: bytes of media checked so far, of the total. */
export type PackProgress = (done: number, total: number) => void;

/**
 * Build the .brainrot zip. Media that isn't stored, or that the browser can no longer read, is left out
 * and listed in `missing` rather than failing the whole save.
 */
export async function buildPack(game: Game, onProgress?: PackProgress): Promise<{ blob: Blob; missing: string[] }> {
  await loadGameMedia(game);
  const entries: ZipEntry[] = [{ name: 'game.json', data: new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }) }];
  const missing: string[] = [];
  const byPath = new Map<string, string>();
  for (const ref of game.media) {
    // A live link has no file to pack: game.json keeps its link.
    if (ref.url) continue;
    const b = getBlob(ref.id);
    if (!b) {
      missing.push(ref.name);
      continue;
    }
    const path = mediaPath(ref);
    byPath.set(path, ref.name);
    entries.push({ name: path, data: b });
  }
  const { blob, failed } = await buildZip(entries, onProgress);
  for (const path of failed) missing.push(byPath.get(path) ?? path);
  return { blob, missing };
}

/** Save the game as a .brainrot pack. Returns the media that couldn't be included and where it was saved. */
export async function savePack(game: Game, onProgress?: PackProgress): Promise<{ missing: string[]; where: string }> {
  const { blob, missing } = await buildPack(game, onProgress);
  const name = `${safeFilename(game.title)}.brainrot`;
  return { missing, where: savedWhere(await saveFile(name, blob, game.id), name) };
}

/** Said when a game file (or an exported one) didn't arrive whole. */
export const CUT_OFF = "This file is incomplete: it probably didn't finish downloading or uploading. Ask for it again.";

/** Open a .brainrot pack; `onProgress` hears how many of its files are unpacked so far (a big game has hundreds). */
export async function openPack(file: Blob, onProgress?: (done: number, total: number) => void): Promise<Game> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    // A zip starts with "PK": one that won't open is cut off (or damaged), not some other kind of file.
    const zipStart = new TextDecoder().decode(await file.slice(0, 2).arrayBuffer()) === 'PK';
    throw new Error(zipStart ? CUT_OFF : 'This file is not a Brainrot Games Maker game pack (.brainrot, or .jbr from Jeopardy Builder).');
  }
  const json = zip.file('game.json');
  if (!json) throw new Error('This pack has no game.json inside.');
  const game = migrateGame(parseGame(await json.async('text')));
  const files = game.media.filter((ref) => !ref.url);
  for (const [i, ref] of files.entries()) {
    onProgress?.(i, files.length);
    const entry = zip.file(mediaPath(ref));
    if (!entry) continue;
    const data = await entry.async('blob');
    await putMedia(ref.id, new Blob([data], { type: mimeFor(ref.name, ref.mime) }));
  }
  registerLinks(game);
  return game;
}

/**
 * Open a .brainrot pack (or a .jbr from before the rename: same format), a plain .json game, the game in an exported
 * .html, or a backup the desktop app kept of one of those ("Game.brainrot.bak").
 */
export async function openGameFile(file: File): Promise<Game> {
  // A pack is a zip, which starts with "PK": one saved or renamed as .json still opens.
  const zip = new TextDecoder().decode(await file.slice(0, 2).arrayBuffer()) === 'PK';
  const name = file.name.replace(/\.bak\d*$/i, '');
  if (!zip && (/\.html?$/i.test(name) || file.type === 'text/html')) {
    const pack = packInHtml(await file.text());
    if (!pack) throw new Error('This page has no game inside (only games exported from Brainrot Games Maker do).');
    return openPack(await unpackEmbedded(pack));
  }
  if (!zip && (/\.json$/i.test(name) || file.type === 'application/json')) {
    const game = migrateGame(parseGame(await file.text()));
    registerLinks(game);
    return game;
  }
  return openPack(file);
}
