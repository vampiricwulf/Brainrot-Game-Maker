// .jbr game packs: a zip holding game.json + media/<id>.<ext> (spec §8).
import JSZip from 'jszip';
import { extOf, getBlob, loadGameMedia, mimeFor, putMedia } from './media.svelte';
import { migrateGame, type Game } from './model';
import { downloadBlob, parseGame, safeFilename } from './fileio';

function mediaPath(ref: { id: string; name: string }): string {
  const ext = extOf(ref.name);
  return `media/${ref.id}${ext ? '.' + ext : ''}`;
}

export async function buildPack(game: Game): Promise<{ blob: Blob; missing: string[] }> {
  await loadGameMedia(game);
  const zip = new JSZip();
  zip.file('game.json', JSON.stringify(game, null, 2));
  const missing: string[] = [];
  for (const ref of game.media) {
    const b = getBlob(ref.id);
    if (b) zip.file(mediaPath(ref), b);
    else missing.push(ref.name);
  }
  // Media is already compressed; only deflate the JSON.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  return { blob, missing };
}

export async function savePack(game: Game): Promise<string[]> {
  const { blob, missing } = await buildPack(game);
  downloadBlob(`${safeFilename(game.title)}.jbr`, blob);
  return missing;
}

export async function openPack(file: Blob): Promise<Game> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a Jeopardy Builder game pack (.jbr).');
  }
  const json = zip.file('game.json');
  if (!json) throw new Error('This pack has no game.json inside.');
  const game = migrateGame(parseGame(await json.async('text')));
  for (const ref of game.media) {
    const entry = zip.file(mediaPath(ref));
    if (!entry) continue;
    const data = await entry.async('blob');
    await putMedia(ref.id, new Blob([data], { type: mimeFor(ref.name, ref.mime) }));
  }
  return game;
}

/** Open either a .jbr pack or a plain .json game. */
export async function openGameFile(file: File): Promise<Game> {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') return migrateGame(parseGame(await file.text()));
  return openPack(file);
}
