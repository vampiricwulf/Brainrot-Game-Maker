// Desktop app: autosaves of the game in the editor into BrainrotSaves, every few minutes (⚙ Settings), as
// "Game (autosave 1, 1a2b3c).brainrot" … up to the number kept, replacing the oldest. The letters after the slot are
// the start of the game's id, so two games with the same title ("Untitled Game") each keep their own autosaves, and a
// game keeps its slots when its title changes.
import { deleteSave, listSaves, saveToSaves, type SaveEntry } from './desktop.svelte';
import { safeFilename } from './fileio';
import type { Game } from './model';
import { buildPack, MAX_PACK_READ } from './pack';

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
 * then: slots past the number kept (it was lowered), and the slot's copy under an older title. `big`: the pack is too
 * big to be opened again (see MAX_PACK_READ), so it goes in a slot already holding one of those when there is one.
 */
export function planAutosave(game: Pick<Game, 'title' | 'id'>, saves: SaveEntry[], keep: number, big = false): { name: string; drop: SaveEntry[] } {
  const tag = autosaveTag(game.id);
  const mine = saves.map((s) => ({ s, n: slotOf(s.name, tag) })).filter((x) => x.n > 0);
  // Both folders count: autosaves go to Documents when the app's folder can't be written. The newest copy of a slot wins.
  const slots = new Map<number, number>();
  for (const { s, n } of mine) if (n <= keep) slots.set(n, Math.max(slots.get(n) ?? 0, s.modified));
  let slot = 1;
  while (slot <= keep && slots.has(slot)) slot++;
  if (slot > keep) slot = [...slots].sort((a, b) => a[1] - b[1])[0][0];
  // (Rotating would replace, one by one, the older autosaves that still open with ones that don't.)
  const over = big ? mine.filter((x) => x.n <= keep && x.s.modified === slots.get(x.n) && x.s.size >= MAX_PACK_READ) : [];
  if (over.length) slot = over.sort((a, b) => b.s.modified - a.s.modified)[0].n;
  const name = autosaveName(game, slot);
  // (Windows file names ignore case: "my quiz (…)" after a retitle to "My Quiz" is the file just written, not an old one.)
  const same = (a: string) => a.toLowerCase() === name.toLowerCase();
  return { name, drop: mine.filter((x) => x.n > keep || (x.n === slot && !same(x.s.name))).map((x) => x.s) };
}

/** Write one autosave. Returns where it went, and how big it is (see MAX_PACK_READ). */
export async function autosave(game: Game, keep: number): Promise<{ path: string; bytes: number }> {
  // (The setting's box left empty or at 0 while typing: at least one is kept.)
  keep = Math.max(1, Math.floor(keep) || 3);
  const { blob } = await buildPack(game);
  const big = blob.size >= MAX_PACK_READ;
  const { name, drop } = planAutosave(game, await listSaves(), keep, big);
  const { path } = await saveToSaves(name, blob, 'overwrite');
  // (One too big to open again deletes nothing: the older autosaves may be the only ones that still open.)
  if (!big) for (const s of drop) await deleteSave(s).catch((err) => console.warn(`Could not delete the old autosave ${s.name}`, err));
  return { path, bytes: blob.size };
}
