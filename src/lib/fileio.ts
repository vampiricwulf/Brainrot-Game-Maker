// File download/upload helpers and plain-JSON game export (text only, no media).
import { GAME_VERSION, type Game } from './model';
import { inTauri } from './platform';
import { saveToSaves, type SavedFile } from './desktop.svelte';

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
 */
export async function saveFile(filename: string, blob: Blob): Promise<SavedFile | null> {
  if (!inTauri()) {
    downloadBlob(filename, blob);
    return null;
  }
  return saveToSaves(filename, blob);
}

/** "Saved to …\\BrainrotSaves\\Game.brainrot" (or "Downloaded Game.brainrot"), for the toast. */
export function savedWhere(saved: SavedFile | null, filename: string): string {
  if (!saved) return `Downloaded ${filename}`;
  return `Saved to ${saved.path}${saved.fallback ? ' (the app’s folder can’t be written, so in Documents)' : ''}`;
}

export function safeFilename(title: string): string {
  return (title.trim() || 'game').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'game';
}

export async function saveGameJson(game: Game): Promise<string> {
  const name = `${safeFilename(game.title)}.json`;
  return savedWhere(await saveFile(name, new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' })), name);
}

export function parseGame(text: string): Game {
  const data = JSON.parse(text);
  if (!data || typeof data.version !== 'number' || !Array.isArray(data.rounds) || !Array.isArray(data.players)) {
    throw new Error('This file is not a Brainrot Games Maker game.');
  }
  if (data.version > GAME_VERSION) throw new Error('This game was made with a newer version of Brainrot Games Maker: update the app to open it.');
  if (data.version < 1) throw new Error('This file is not a Brainrot Games Maker game.');
  return data as Game;
}

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
