// .brainrot game packs (called .jbr before the rename; same format): a zip holding game.json + media/<id>.<ext> (spec §8).
import JSZip from 'jszip';
import { extOf, getBlob, loadGameMedia, mimeFor, putMedia, registerLinks } from './media.svelte';
import { migrateGame, type Game } from './model';
import { downloadBlob, parseGame, safeFilename } from './fileio';
import { buildZip, type ZipEntry } from './zipwrite';

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

export async function savePack(game: Game, onProgress?: PackProgress): Promise<string[]> {
  const { blob, missing } = await buildPack(game, onProgress);
  downloadBlob(`${safeFilename(game.title)}.brainrot`, blob);
  return missing;
}

export async function openPack(file: Blob): Promise<Game> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a Brainrot Games Maker game pack (.brainrot, or .jbr from Jeopardy Builder).');
  }
  const json = zip.file('game.json');
  if (!json) throw new Error('This pack has no game.json inside.');
  const game = migrateGame(parseGame(await json.async('text')));
  for (const ref of game.media) {
    if (ref.url) continue;
    const entry = zip.file(mediaPath(ref));
    if (!entry) continue;
    const data = await entry.async('blob');
    await putMedia(ref.id, new Blob([data], { type: mimeFor(ref.name, ref.mime) }));
  }
  registerLinks(game);
  return game;
}

/** Open a .brainrot pack (or a .jbr from before the rename: same format) or a plain .json game. */
export async function openGameFile(file: File): Promise<Game> {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    const game = migrateGame(parseGame(await file.text()));
    registerLinks(game);
    return game;
  }
  return openPack(file);
}
