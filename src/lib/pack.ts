// .brainrot game packs (called .jbr before the rename; same format): a zip holding game.json + media/<id>.<ext> (spec §8).
import JSZip from 'jszip';
import { extOf, getBlob, loadGameMedia, mimeFor, putMedia, registerLinks, storedBlob } from './media.svelte';
import { settleFiles } from './roundcopy';
import { migrateGame, type Game } from './model';
import { parseGame, safeFilename, saveFile, savedName, savedWhere } from './fileio';
import { buildZip, crc32, type ZipEntry } from './zipwrite';
import { looksLikeHtml } from './sniff';
import { MAX_HTML_CHARS, packInHtml, TOO_BIG_TO_OPEN, unpackEmbedded } from './export';

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
  // game.json is compact and deflated (a big game's text shrinks to a tenth); older packs have it stored and indented,
  // and open the same.
  const entries: ZipEntry[] = [{ name: 'game.json', data: new Blob([JSON.stringify(game)], { type: 'application/json' }), deflate: true }];
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
export async function savePack(game: Game, onProgress?: PackProgress): Promise<{ missing: string[]; where: string; file: string }> {
  const { blob, missing } = await buildPack(game, onProgress);
  const name = `${safeFilename(game.title)}.brainrot`;
  const saved = await saveFile(name, blob, game.id);
  return { missing, where: savedWhere(saved, name), file: savedName(saved, name) };
}

/** Said when a game file (or an exported one) didn't arrive whole. */
export const CUT_OFF = "This file is incomplete: it probably didn't finish downloading or uploading. Ask for it again.";

/** What's done with each file of a pack as it's read: stored (by default). */
export type PutMedia = (id: string, blob: Blob) => Promise<void>;

/** Open a .brainrot pack; `onProgress` hears how many of its files are unpacked so far (a big game has hundreds). */
export async function openPack(file: Blob, onProgress?: (done: number, total: number) => void, put: PutMedia = putMedia): Promise<Game> {
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
  // A damaged game.json is a damaged file: nothing in it can be trusted.
  const text = await intact(json);
  if (!text) throw new Error(CUT_OFF);
  const game = migrateGame(parseGame(new TextDecoder().decode(text)));
  const files = game.media.filter((ref) => !ref.url);
  for (const [i, ref] of files.entries()) {
    onProgress?.(i, files.length);
    const entry = zip.file(mediaPath(ref));
    if (!entry) continue;
    // A damaged media file is left out, so the game opens with it listed as missing (the checklist says so), not broken.
    const data = await intact(entry);
    if (!data) {
      console.warn(`Damaged in the pack, left out: ${ref.name}`);
      continue;
    }
    await put(ref.id, new Blob([data], { type: mimeFor(ref.name, ref.mime) }));
  }
  registerLinks(game);
  return game;
}

/**
 * A file of a pack, unpacked and checked against the CRC-32 the zip has for it (JSZip's own checkCRC32 fails the whole
 * pack over one damaged file), or null when it's damaged: it won't unpack, or its bytes aren't the ones packed.
 */
async function intact(entry: JSZip.JSZipObject): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const data = (await entry.async('uint8array')) as Uint8Array<ArrayBuffer>;
    // (The CRC the zip lists: JSZip keeps it with the still-packed data.)
    const want = (entry as unknown as { _data?: { crc32?: number } })._data?.crc32;
    return typeof want === 'number' && crc32(data) !== want >>> 0 ? null : data;
  } catch {
    return null;
  }
}

/** What a file is from its first bytes, whatever its name says: a zip (a pack), a JSON game, a web page, or unknown. */
async function sniffGameFile(file: Blob): Promise<'zip' | 'json' | 'html' | null> {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  if (looksLikeHtml(head)) return 'html';
  return /^\s*\{/.test(new TextDecoder().decode(head).replace(/^﻿/, '')) ? 'json' : null;
}

/** Is this page Brainrot Games Maker's (or Jeopardy Builder's) own, cut off before its end? */
const cutAppPage = (html: string) => /<title>[^<]*(Brainrot Games Maker|Jeopardy Builder)<\/title>/.test(html) && !/<\/html>\s*$/i.test(html);

/**
 * Open a .brainrot pack (or a .jbr from before the rename: same format), a plain .json game, the game in an exported
 * .html, or a backup the desktop app kept of one of those ("Game.brainrot.bak").
 */
export async function openGameFile(file: File, put: PutMedia = putMedia): Promise<Game> {
  // What the file is goes by its first bytes (a pack starts with "PK", a game with "{", a page with "<!doctype html"…),
  // so one renamed or saved with the wrong ending still opens; its name only decides what it's taken for otherwise.
  const kind = await sniffGameFile(file);
  const name = file.name.replace(/\.bak\d*$/i, '');
  if (kind === 'html' || (!kind && (/\.html?$/i.test(name) || file.type === 'text/html'))) {
    // (A browser can't read a file this long as text.)
    if (file.size > MAX_HTML_CHARS) throw new Error(TOO_BIG_TO_OPEN);
    const html = await file.text();
    const inside = packInHtml(html);
    // This app's page, cut off before its game (the game comes last): it didn't arrive whole.
    if (!inside && cutAppPage(html)) throw new Error(CUT_OFF);
    if (!inside) throw new Error('This page has no game inside (only games exported from Brainrot Games Maker do).');
    return openPack(await unpackEmbedded(inside.pack, inside.cut), undefined, put);
  }
  if (kind === 'json' || (!kind && (/\.json$/i.test(name) || file.type === 'application/json'))) {
    const game = migrateGame(parseGame(await file.text()));
    registerLinks(game);
    return game;
  }
  return openPack(file, undefined, put);
}

/** A game read from a file, its files held apart until `storeFiles` (see readGameFile). */
export interface ReadGame {
  game: Game;
  /** Its files to store, by id. */
  files: [string, Blob][];
  /** Ids given to its files that had the id of another file here (see settleFiles). */
  copies: Set<string>;
}

/**
 * Read a game file without storing anything: its files are held until `storeFiles`, once the game is really taken (it
 * replaced the game in the editor). A file with the id of one this browser holds but other bytes (an older copy of the same
 * game) gets a new id in the game read, so opening it never changes the files of the game in the editor, or of a recent game.
 */
export async function readGameFile(file: File): Promise<ReadGame> {
  const held = new Map<string, Blob>();
  const read = await openGameFile(file, async (id, blob) => void held.set(id, blob));
  const { game, store, copies } = await settleFiles(read, held, storedBlob);
  return { game, files: store, copies };
}

/** Store the files of a game read by readGameFile, and load the ones it shares with what's stored already. */
export async function storeFiles(read: Pick<ReadGame, 'game' | 'files'>): Promise<void> {
  for (const [id, blob] of read.files) await putMedia(id, blob);
  await loadGameMedia(read.game);
}
