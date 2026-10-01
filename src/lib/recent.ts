// Recent games: a game that New, Open… or a reopened game replaces in the editor is kept here, with its undo history,
// so it can be reopened (Open… → Recent games, or "↶ Reopen previous game" just after). The browser has one autosave
// slot, so without this the game it held was gone for good.
import { del, get, set } from 'idb-keyval';
import type { SavedHistory, StoredStep } from './history.svelte';
import { newGame, newId, type Game } from './model';
import { write } from './persist';

const LIST_KEY = 'recentGames';
const gameKey = (key: string) => `recentGame:${key}`;
/** How many replaced games are kept. */
export const MAX_RECENT = 8;
/** The most the kept games' files may take together (a file two of them share counts once); the newest is kept anyway. */
export const MAX_RECENT_BYTES = 1024 ** 3;

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
  /** When it was replaced (kept). */
  closedAt: number;
  /** The files it uses, and the ones its undo history can bring back: never cleaned up while it's kept. */
  media: string[];
  /** What the game is, in short (the same for the very same game), so an identical copy kept again replaces it. */
  sig?: string;
  /** The size of each of its files, by id (for MAX_RECENT_BYTES). */
  sizes?: Record<string, number>;
}

/** What to do with a game with unsaved changes that another game is about to replace. */
export type ReplaceChoice = 'save' | 'discard' | 'cancel';

export interface RecentGame {
  draft: Game;
  history?: { saved: SavedHistory; steps: StoredStep[] };
}

/**
 * Something in the game worth keeping: a round, a player, a file, a wheel, the Stats & Items catalog, a title, a theme,
 * a rule or a sound changed from a new game's… A game just as New makes it is a scratch game: New and Open… replace it
 * without asking, and it isn't kept in Recent games.
 */
export function hasWork(game: Game): boolean {
  const kit = game.statFields?.length || game.items?.length || game.shops?.length || game.worlds?.length;
  if (game.rounds.length || game.players.length || game.media.length || game.wheels.length || game.dice.length || kit || game.tiebreaker) return true;
  const fresh = newGame();
  const title = game.title.trim();
  if (title && title !== fresh.title) return true;
  return (
    differs(game.theme, fresh.theme) ||
    differs(game.settings, fresh.settings) ||
    differs(game.audio, fresh.audio) ||
    differs(game.soundsOff, undefined) ||
    differs(game.soundVolume, undefined)
  );
}

/** Two settings differ (a part left out is the same as one that's off: a checkbox shown fills it in as false). */
function differs(a: unknown, b: unknown): boolean {
  const off = (x: unknown) => x === undefined || x === null || x === false;
  if (off(a) && off(b)) return false;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a !== b;
  const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].some((k) => differs(x[k], y[k]));
}

/** A short fingerprint of a game (FNV-1a of its JSON, two ways): the same for the very same game. */
export function signature(game: Game): string {
  const text = JSON.stringify(game);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return `${text.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

export async function listRecent(): Promise<RecentEntry[]> {
  try {
    return ((await get<RecentEntry[]>(LIST_KEY)) ?? []).filter((e) => e?.key);
  } catch {
    return [];
  }
}

/**
 * The list once `entry` (the game just replaced) is added to `old`, newest first, and the entries that leave it. A kept
 * copy of the very same game gives way to it (another version of it stays: both are listed, by when they were kept). Beyond
 * MAX_RECENT games, or MAX_RECENT_BYTES of files, the oldest go, except `spare` (the one about to be reopened).
 */
export function planRecent(old: readonly RecentEntry[], entry: RecentEntry, spare?: string): { list: RecentEntry[]; gone: RecentEntry[] } {
  const others = old.filter((e) => e.key === spare || !(e.gameId === entry.gameId && !!e.sig && e.sig === entry.sig));
  const sizes = new Map<string, number>();
  const kept: RecentEntry[] = [];
  for (const e of [entry, ...others.filter((e) => e.key !== spare)]) {
    const files = Object.entries(e.sizes ?? {}).filter(([id]) => !sizes.has(id));
    const bytes = [...sizes.values(), ...files.map(([, n]) => n)].reduce((a, n) => a + n, 0);
    if (kept.length && (kept.length >= MAX_RECENT || bytes > MAX_RECENT_BYTES)) continue;
    for (const [id, n] of files) sizes.set(id, n);
    kept.push(e);
  }
  const list = [...kept, ...others.filter((e) => e.key === spare)];
  return { list, gone: old.filter((e) => !list.includes(e)) };
}

/**
 * Keep a game that's being replaced (see planRecent). Its key and the titles of the kept games that made room for it, or
 * null when it couldn't be stored.
 */
export async function keepRecent(draft: Game, history: RecentGame['history'], spare?: string): Promise<{ key: string; dropped: string[] } | null> {
  const entry: RecentEntry = {
    key: newId(),
    gameId: draft.id,
    title: draft.title.trim() || 'Untitled Game',
    rounds: draft.rounds.length,
    closedAt: Date.now(),
    media: [...new Set([...draft.media.map((m) => m.id), ...held(history?.steps ?? [])])],
    sig: signature(draft),
    sizes: Object.fromEntries(draft.media.filter((m) => !m.url).map((m) => [m.id, m.size || 0])),
  };
  const old = await listRecent();
  const { list, gone } = planRecent(old, entry, spare);
  // The game first, then the list that points at it: a failure leaves the list as it was.
  const ok = await write(gameKey(entry.key), async () => {
    await set(gameKey(entry.key), { draft, history } satisfies RecentGame);
    await set(LIST_KEY, list);
    for (const e of gone) await del(gameKey(e.key));
  });
  // (A copy of the same game that gave way isn't gone: this one is it.)
  const dropped = gone.filter((e) => !(e.gameId === entry.gameId && e.sig === entry.sig)).map((e) => e.title);
  return ok ? { key: entry.key, dropped } : null;
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

