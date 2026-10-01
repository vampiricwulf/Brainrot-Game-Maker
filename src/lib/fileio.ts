// File download/upload helpers and plain-JSON game export (text only, no media).
import { GAME_VERSION, type Game } from './model';
import { inTauri } from './platform';
import { listSaves, saveToSaves, type SavedFile } from './desktop.svelte';
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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Save a file the user keeps (a game pack, a JSON game, an exported HTML): in the desktop app into the BrainrotSaves
 * folder next to the exe, in a browser as a download. Returns where it went in the desktop app (null: downloaded).
 * `gameId`: the game it is, so Save replaces only that game's own last save (see saveTarget).
 */
export async function saveFile(filename: string, blob: Blob, gameId?: string): Promise<SavedFile | null> {
  if (!inTauri()) {
    downloadBlob(filename, blob);
    return null;
  }
  // ⚙ Settings: replace the game's last save (keeping it as .bak), or keep it and make "Game (2).brainrot".
  if (!prefs.overwriteSave) return saveToSaves(filename, blob, 'new');
  const owners = readOwners();
  const { name, mode } = saveTarget(filename, gameId, owners, (await listSaves()).map((s) => s.name));
  const saved = await saveToSaves(name, blob, mode);
  if (gameId) writeOwners({ ...owners, [baseName(saved.path)]: gameId });
  return saved;
}

/** Which game each file Save wrote is (file name → game id), so two games called "Untitled Game" never replace each other's saves. */
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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where Save puts `filename` when it replaces the last save: the file this game last saved under that name ("Game.brainrot",
 * or "Game (2).brainrot" if another game had the name first), replaced with a backup; or, when another game's save (or
 * a file the app doesn't know) already has the name, a new file next to it ("Game (2).brainrot").
 */
export function saveTarget(
  filename: string,
  gameId: string | undefined,
  owners: Record<string, string>,
  existing: string[],
): { name: string; mode: 'new' | 'backup' } {
  if (!gameId) return { name: filename, mode: 'backup' };
  const dot = filename.lastIndexOf('.');
  const same = new RegExp(`^${escapeRe(filename.slice(0, dot))}( \\(\\d+\\))?${escapeRe(filename.slice(dot))}$`, 'i');
  const mine = Object.keys(owners).find((n) => owners[n] === gameId && same.test(n));
  if (mine) return { name: mine, mode: 'backup' };
  const taken = existing.some((n) => n.toLowerCase() === filename.toLowerCase());
  return { name: filename, mode: taken ? 'new' : 'backup' };
}

/** "Saved to …\\BrainrotSaves\\Game.brainrot" (or "Downloaded Game.brainrot"), for the toast. */
export function savedWhere(saved: SavedFile | null, filename: string): string {
  if (!saved) return `Downloaded ${filename}`;
  return `Saved to ${saved.path}${saved.fallback ? ' (the app’s folder can’t be written, so in Documents)' : ''}`;
}

/**
 * A file name from a game's title: letters of any language, digits, "-" and "_" (spaces become "-"), 60 at most. A name
 * Windows keeps for a device ("Con", "LPT1"…) gets a "_" in front, as the desktop app does.
 */
export function safeFilename(title: string): string {
  const name = title.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\-_ ]+/gu, '').trim().replace(/\s+/g, '-');
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
export const isGameFile = (name: string) => /\.(brainrot|jbr|json|html?)(\.bak\d*)?$/i.test(name);

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
