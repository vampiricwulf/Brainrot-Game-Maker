// Desktop app: autosaves of the game in the editor into BrainrotSaves, every few minutes (⚙ Settings), as
// "Game (autosave 1, 1a2b3c).brainrot" … up to the number kept, replacing the oldest. The letters after the slot are
// the start of the game's id, so two games with the same title ("Untitled Game") each keep their own autosaves, and a
// game keeps its slots when its title changes.
import { deleteSave, listSaves, saveToSaves, type SaveEntry } from './desktop.svelte';
import { safeFilename } from './fileio';
import type { Game } from './model';
import { buildPack } from './pack';

/** The short tag of a game's id that its autosaves carry. */
export function autosaveTag(gameId: string): string {
  return gameId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6) || 'game';
}

export function autosaveName(game: Pick<Game, 'title' | 'id'>, slot: number): string {
  return `${safeFilename(game.title)} (autosave ${slot}, ${autosaveTag(game.id)}).brainrot`;
}

/** The slot of one of this game's autosaves (0: not one). */
function slotOf(name: string, tag: string): number {
  const m = name.match(/ \(autosave (\d+), ([a-z0-9]+)\)\.brainrot$/);
  return m && m[2] === tag ? Number(m[1]) : 0;
}

/**
 * Where the next autosave goes: the first slot not written yet, else the oldest; and this game's autosaves to delete
 * then: slots past the number kept (it was lowered), and the slot's copy under an older title.
 */
export function planAutosave(game: Pick<Game, 'title' | 'id'>, saves: SaveEntry[], keep: number): { name: string; drop: SaveEntry[] } {
  const tag = autosaveTag(game.id);
  const mine = saves.map((s) => ({ s, n: slotOf(s.name, tag) })).filter((x) => x.n > 0);
  // Both folders count: autosaves go to Documents when the app's folder can't be written. The newest copy of a slot wins.
  const slots = new Map<number, number>();
  for (const { s, n } of mine) if (n <= keep) slots.set(n, Math.max(slots.get(n) ?? 0, s.modified));
  let slot = 1;
  while (slot <= keep && slots.has(slot)) slot++;
  if (slot > keep) slot = [...slots].sort((a, b) => a[1] - b[1])[0][0];
  const name = autosaveName(game, slot);
  return { name, drop: mine.filter((x) => x.n > keep || (x.n === slot && x.s.name !== name)).map((x) => x.s) };
}

/** Write one autosave. Returns where it went. */
export async function autosave(game: Game, keep: number): Promise<string> {
  const { name, drop } = planAutosave(game, await listSaves(), keep);
  const { blob } = await buildPack(game);
  const { path } = await saveToSaves(name, blob, 'overwrite');
  for (const s of drop) await deleteSave(s).catch((err) => console.warn(`Could not delete the old autosave ${s.name}`, err));
  return path;
}
