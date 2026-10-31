// What 💾 Save says about the game: whether it changed since its last save as a file (its dot), and its tooltip. And
// the untouched sample, which New and Open… replace without asking (it's kept in Recent games, to reopen).

/** The step ✨ Try a sample game makes (roundtools.ts). */
export const SAMPLE_STEP = 'Added the sample game';

/** The undo history, as far as these need it (history.svelte.ts). */
export interface HistoryFacts {
  pending: boolean;
  origin: { kind: string };
  entries: readonly { label: string }[];
  index: number;
}

/** The game is the sample just as it came: added to a new game, nothing changed since (playing it changes nothing). */
export const untouchedSample = (h: HistoryFacts): boolean =>
  !h.pending && h.origin.kind === 'new' && h.entries.length === 1 && h.index === 1 && h.entries[0].label === SAMPLE_STEP;

/** When the game was last saved as a file: its newest Save or autosave-file mark's time (an export doesn't count). */
export function lastFileSave(marks: readonly { kind: string; ts: number }[]): number | undefined {
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i].kind === 'saved' || marks[i].kind === 'autosaved') return marks[i].ts;
  return undefined;
}

export interface SaveFacts {
  /** The game has anything in it worth keeping (recent.ts hasWork). */
  work: boolean;
  /** Saved as a file since its last change, or nothing changed since it arrived (history.svelte.ts savedSinceChange). */
  saved: boolean;
  /** Only the sample, as it came. */
  sample: boolean;
  /** When it was last saved as a file (Save, or the desktop app's autosave file), if ever. */
  lastAt?: number;
}

/**
 * `changed`: 💾 Save gets its dot (there's work a file doesn't have yet). `said`: the tooltip's first part, how the
 * file stands ('' when there's nothing to say: a new game, or one opened and not changed). `at` writes a time.
 */
export function saveState(f: SaveFacts, at: (ms: number) => string): { changed: boolean; said: string } {
  const changed = f.work && !f.saved && !f.sample;
  const last = f.lastAt ? `Last saved as a file at ${at(f.lastAt)}` : '';
  if (!changed) return { changed, said: last };
  return { changed, said: last ? `${last}, changed since` : 'Not saved as a file yet' };
}
