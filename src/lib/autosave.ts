// Desktop app: autosaves of the game in the editor into BrainrotSaves, every few minutes (⚙ Settings), as
// "Game (autosave 1).brainrot" … up to the number kept, replacing the oldest.
import { listSaves, saveToSaves, type SaveEntry } from './desktop.svelte';
import { safeFilename } from './fileio';
import type { Game } from './model';
import { buildPack } from './pack';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Which autosave slot to use next: the first one not written yet, else the oldest. */
export function nextSlot(title: string, saves: SaveEntry[], keep: number): number {
  const re = new RegExp(`^${escape(safeFilename(title))} \\(autosave (\\d+)\\)\\.brainrot$`);
  const slots = new Map<number, number>();
  for (const s of saves) {
    const n = Number(s.name.match(re)?.[1]);
    if (s.place === 'app' && n >= 1 && n <= keep) slots.set(n, s.modified);
  }
  for (let n = 1; n <= keep; n++) if (!slots.has(n)) return n;
  return [...slots].sort((a, b) => a[1] - b[1])[0][0];
}

export function autosaveName(title: string, slot: number): string {
  return `${safeFilename(title)} (autosave ${slot}).brainrot`;
}

/** Write one autosave. Returns where it went. */
export async function autosave(game: Game, keep: number): Promise<string> {
  const slot = nextSlot(game.title, await listSaves(), keep);
  const { blob } = await buildPack(game);
  return (await saveToSaves(autosaveName(game.title, slot), blob, 'overwrite')).path;
}
