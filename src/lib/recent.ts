// Recent games: a game that New, Open… or a reopened game replaces in the editor is kept here, with its undo history,
// so it can be reopened (Open… → Recent games, or "↶ Reopen previous game" just after). The browser has one autosave
// slot, so without this the game it held was gone for good.
import { del, get, set } from 'idb-keyval';
import type { SavedHistory, StoredStep } from './history.svelte';
import { newId, type Game } from './model';
import { write } from './persist';

const LIST_KEY = 'recentGames';
const gameKey = (key: string) => `recentGame:${key}`;
/** How many replaced games are kept. */
export const MAX_RECENT = 3;

/** Files (and stashed copies) the steps can bring back (as heldMedia in history.svelte.ts). */
function held(steps: readonly StoredStep[]): string[] {
  return steps.flatMap((e) => [...(e.media ?? []), ...(e.blobs ?? []).flatMap((s) => [s.before, s.after])]).filter((id): id is string => !!id);
}

/** A kept game as Open… lists it (the game itself is stored apart, so listing them reads little). */
export interface RecentEntry {
  key: string;
  gameId: string;
  title: string;
  rounds: number;
  /** When it was replaced. */
  closedAt: number;
  /** The files it uses, and the ones its undo history can bring back: never cleaned up while it's kept. */
  media: string[];
}

/** What to do with a game with unsaved changes that another game is about to replace. */
export type ReplaceChoice = 'save' | 'discard' | 'cancel';

export interface RecentGame {
  draft: Game;
  history?: { saved: SavedHistory; steps: StoredStep[] };
}

/** Something in the game worth keeping: a round, a player, a file, a wheel, the Stats & Items catalog, a title… */
export function hasWork(game: Game): boolean {
  const kit = game.statFields?.length || game.items?.length || game.shops?.length || game.worlds?.length;
  const titled = !!game.title.trim() && game.title.trim() !== 'Untitled Game';
  return !!(game.rounds.length || game.players.length || game.media.length || game.wheels.length || game.dice.length || kit || game.tiebreaker || titled);
}

export async function listRecent(): Promise<RecentEntry[]> {
  try {
    return ((await get<RecentEntry[]>(LIST_KEY)) ?? []).filter((e) => e?.key);
  } catch {
    return [];
  }
}

/**
 * Keep a game that's being replaced (newest first; an older copy of the same game gives way, and the oldest beyond
 * MAX_RECENT are dropped, except `spare`: the one about to be reopened). Its key, or null when it couldn't be stored.
 */
export async function keepRecent(draft: Game, history: RecentGame['history'], spare?: string): Promise<string | null> {
  const entry: RecentEntry = {
    key: newId(),
    gameId: draft.id,
    title: draft.title.trim() || 'Untitled Game',
    rounds: draft.rounds.length,
    closedAt: Date.now(),
    media: [...new Set([...draft.media.map((m) => m.id), ...held(history?.steps ?? [])])],
  };
  const old = await listRecent();
  const others = old.filter((e) => e.gameId !== draft.id || e.key === spare);
  const kept = [entry, ...others.filter((e) => e.key !== spare)].slice(0, MAX_RECENT);
  const list = [...kept, ...others.filter((e) => e.key === spare)];
  const gone = old.filter((e) => !list.includes(e));
  // The game first, then the list that points at it: a failure leaves the list as it was.
  const ok = await write(gameKey(entry.key), async () => {
    await set(gameKey(entry.key), { draft, history } satisfies RecentGame);
    await set(LIST_KEY, list);
    for (const e of gone) await del(gameKey(e.key));
  });
  return ok ? entry.key : null;
}

/** A kept game, read back to reopen it (null: it's gone). */
export async function readRecent(key: string): Promise<RecentGame | null> {
  try {
    const g = await get<RecentGame>(gameKey(key));
    return g?.draft ? g : null;
  } catch {
    return null;
  }
}

/** Stop keeping a game (it was reopened, or forgotten from the list). */
export async function forgetRecent(key: string): Promise<void> {
  try {
    await set(LIST_KEY, (await listRecent()).filter((e) => e.key !== key));
    await del(gameKey(key));
  } catch {
    /* it stays listed: reopening it again is harmless */
  }
}

/** Every file a kept game uses or can bring back (see pruneMedia). */
export async function recentMedia(): Promise<string[]> {
  return (await listRecent()).flatMap((e) => e.media ?? []);
}

