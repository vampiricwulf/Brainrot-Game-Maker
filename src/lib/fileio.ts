// File download/upload helpers and plain-JSON game export (text only, no media).
import { GAME_VERSION, type Game } from './model';
import { inTauri } from './platform';
import { dataFolders, listSaves, saveToSaves, type SavedFile } from './desktop.svelte';
import { prefs } from './prefs.svelte';

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The browser reads the file from the link while it downloads: a big one takes a while, and taking the link away
  // before it's done cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), Math.max(10_000, (blob.size / (1024 * 1024)) * 1000));
}

/** From this size, a browser that can (Chrome, Edge) asks where to save the file and writes it there, bit by bit. */
export const BIG_FILE = 100 * 1024 ** 2;

/** Save `size` bytes through the browser's save picker? (Only a big file: a small one downloads, with no question.) */
export const usePicker = (size: number, canPick: boolean): boolean => canPick && size >= BIG_FILE;

/** The save picker was closed without saving (the save is called off, with nothing to say). */
export const isCancel = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

type SavePicker = (opts: { suggestedName: string }) => Promise<{ name: string; createWritable(): Promise<WritableStream<Uint8Array> & { abort?(): Promise<void> }> }>;

/**
 * A big file, through the browser's save picker (where there is one), written to disk as it's read: a download of
 * hundreds of MB can fail with the page none the wiser. Null: no picker here. Throws an AbortError when it's closed.
 */
async function pickAndWrite(filename: string, blob: Blob): Promise<SavedFile | null> {
  const pick = (globalThis as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!pick || !usePicker(blob.size, true)) return null;
  const handle = await pick({ suggestedName: filename });
  const out = await handle.createWritable();
  try {
    await blob.stream().pipeTo(out);
  } catch (e) {
    await out.abort?.().catch(() => {});
    throw e;
  }
  return { path: handle.name, fallback: false, picked: true };
}

/**
 * Save a file the user keeps (a game pack, a JSON game, an exported HTML): in the desktop app into the BrainrotSaves
 * folder next to the exe, in a browser as a download (a big one where the host picks, when the browser can). Returns
 * where it went (null: a download was started). `gameId`: the game it is, so Save replaces only that game's own last
 * save (see saveTarget).
 */
export async function saveFile(filename: string, blob: Blob, gameId?: string): Promise<SavedFile | null> {
  if (!inTauri()) {
    const picked = await pickAndWrite(filename, blob);
    if (picked) return picked;
    downloadBlob(filename, blob);
    return null;
  }
  // ⚙ Settings: replace the game's last save (keeping it as .bak), or keep it and make "Game (2).brainrot".
  if (!prefs.overwriteSave) return saveToSaves(filename, blob, 'new');
  const owners = readOwners();
  const [saves, folders] = await Promise.all([listSaves(), dataFolders()]);
  const names = (place: string) => saves.filter((s) => s.place === place).map((s) => s.name);
  // Where it goes next to the app, and in Documents if that folder can't be written.
  const beside = saveTarget(filename, gameId, owners, names('app'), folders?.saves?.path ?? undefined, true);
  const docs = saveTarget(filename, gameId, owners, names('documents'), folders?.savesDocuments?.path ?? undefined);
  const saved = await saveToSaves(beside.name, blob, beside.mode, docs);
  if (gameId) writeOwners({ ...owners, [saved.path]: gameId });
  return saved;
}

/**
 * Which game each file Save wrote is (where it is → game id), so two games called "Untitled Game" never replace each
 * other's saves, nor a game's save in one folder (Documents) one of the same name in another. (Older ones have only names.)
 */
const OWNERS_KEY = 'jb.saveOwners';

function readOwners(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OWNERS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function writeOwners(owners: Record<string, string>): void {
  try {
    localStorage.setItem(OWNERS_KEY, JSON.stringify(owners));
  } catch {
    // Storage may be off: the next Save of this game makes a new file instead of replacing it.
  }
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
/** The folder of a path ('' for a bare name). */
const dirName = (path: string) => path.slice(0, Math.max(0, path.length - baseName(path).length - 1));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where Save puts `filename` in `folder` when it replaces the last save: the file this game last saved there under that
 * name ("Game.brainrot", or "Game (2).brainrot" if another game had the name first), replaced with a backup; or, when
 * another game's save (or a file the app doesn't know) already has the name (`existing`: the files in that folder), a new
 * file next to it ("Game (2).brainrot"). `owners` from before they said the folder count for the app's own one (`main`).
 * Without `folder`, any folder's count.
 */
export function saveTarget(
  filename: string,
  gameId: string | undefined,
  owners: Record<string, string>,
  existing: string[],
  folder?: string,
  main = false,
): { name: string; mode: 'new' | 'backup' } {
  if (!gameId) return { name: filename, mode: 'backup' };
  const dot = filename.lastIndexOf('.');
  const same = new RegExp(`^${escapeRe(filename.slice(0, dot))}( \\(\\d+\\))?${escapeRe(filename.slice(dot))}$`, 'i');
  const here = (key: string) => {
    const dir = dirName(key);
    return folder === undefined || (dir ? dir.toLowerCase() === folder.toLowerCase() : main);
  };
  const mine = Object.keys(owners).find((k) => owners[k] === gameId && here(k) && same.test(baseName(k)));
  if (mine) return { name: baseName(mine), mode: 'backup' };
  const taken = existing.some((n) => n.toLowerCase() === filename.toLowerCase());
  return { name: filename, mode: taken ? 'new' : 'backup' };
}

/** The name a save was written under: the desktop app may have picked another ("Game (2).brainrot"). */
export function savedName(saved: SavedFile | null, filename: string): string {
  return saved ? baseName(saved.path) : filename;
}

/**
 * "Saved to …\\BrainrotSaves\\Game.brainrot", "Saved Game.brainrot" (through the browser's save picker), or "Download
 * started: Game.brainrot" (whether the download worked, only the browser's downloads list can tell), for the toast.
 */
export function savedWhere(saved: SavedFile | null, filename: string): string {
  if (!saved) return `Download started: ${filename}`;
  if (saved.picked) return `Saved ${saved.path}`;
  return `Saved to ${saved.path}${saved.fallback ? ' (the app’s folder can’t be written, so in Documents)' : ''}`;
}

/**
 * A file name from a game's title: letters of any language, digits, "-" and "_" (spaces become "-"), 60 at most. A name
 * Windows keeps for a device ("Con", "LPT1"…) gets a "_" in front, as the desktop app does.
 */
export function safeFilename(title: string): string {
  // Quotes go; anything else that can't be in a file name parts words ("Part 1/2" → "Part-1-2", not "Part-12").
  const name = title
    .normalize('NFC')
    .replace(/['’‘"“”`]+/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\-_ ]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-');
  // Cut by characters, not UTF-16 units, so a letter outside the basic range is never split in half.
  const cut = Array.from(name).slice(0, 60).join('').replace(/^-+|-+$/g, '') || 'game';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cut) ? `_${cut}` : cut;
}

export async function saveGameJson(game: Game): Promise<string> {
  const name = `${safeFilename(game.title)}.json`;
  return savedWhere(await saveFile(name, new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }), game.id), name);
}

export function parseGame(text: string): Game {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a readable game (.json). It may be cut off or damaged.");
  }
  if (!data || typeof data.version !== 'number' || !Array.isArray(data.rounds) || !Array.isArray(data.players)) {
    throw new Error('This file is not a Brainrot Games Maker game.');
  }
  if (data.version > GAME_VERSION) throw new Error('This game was made with a newer version of Brainrot Games Maker: update the app to open it.');
  if (data.version < 1) throw new Error('This file is not a Brainrot Games Maker game.');
  return data as Game;
}

/** What Open… takes: game packs (.jbr before the rename), plain JSON games, exported .html games, and the desktop app's backups. */
export const GAME_FILES = '.brainrot,.jbr,.zip,.json,.html,.bak,.bak2,application/json,application/zip,text/html';
export const isGameFile = (name: string) => /\.(brainrot|jbr|zip|json|html?)(\.bak\d*)?$/i.test(name);

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
