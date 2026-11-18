// Where the editor is in this tab: the page or round open, and a board's clue open in the clue editor. A reload mid-edit
// (or the page coming back after the browser dropped it) opens there again, not on the first round with the clue
// closed. Kept per tab in sessionStorage, for one game: another tab, or another game, starts where it always did.
// (Storage can be blocked, or full: then it's simply not remembered.)

const KEY = 'brainrot.editorAt';

export interface EditorAt {
  /** The game's id. */
  game: string;
  /** A round's id, or a named page ('theme', 'media'…). */
  page: string;
  /** The board clue open in the clue editor, by its category's id and its own. */
  clue?: { category: string; clue: string };
}

function read(): EditorAt | null {
  try {
    const at = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as EditorAt | null;
    return at && typeof at.game === 'string' && typeof at.page === 'string' ? at : null;
  } catch {
    return null;
  }
}

function write(at: EditorAt): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(at));
  } catch {
    // (Not remembered: a reload opens on the first round, as it did before.)
  }
}

let taken = false;
/** The clue to open again, until its round's page takes it (takeClue). */
let clueAgain: { round: string; category: string; clue: string } | null = null;

/**
 * Where this tab's editor was before the page loaded, if that was this game: once a page load (the editor opening again
 * after ▶ Play goes back where Play was pressed instead).
 */
export function takeEditorAt(game: string): EditorAt | null {
  if (taken) return null;
  taken = true;
  const at = read();
  if (at?.game !== game) return null;
  if (at.clue) clueAgain = { round: at.page, ...at.clue };
  return at;
}

/** The clue that was open on this round's page before the reload, once (a later visit to the page opens none). */
export function takeClue(round: string): { category: string; clue: string } | null {
  const c = clueAgain;
  clueAgain = null;
  return c?.round === round ? { category: c.category, clue: c.clue } : null;
}

/** The page open now (a clue still open on it stays remembered). */
export function rememberPage(game: string, page: string): void {
  const at = read();
  write({ game, page, ...(at?.game === game && at.page === page && at.clue ? { clue: at.clue } : {}) });
}

/** The clue open in a board round's clue editor now (null: it closed). */
export function rememberClue(game: string, round: string, clue: { category: string; clue: string } | null): void {
  write({ game, page: round, ...(clue ? { clue: { category: clue.category, clue: clue.clue } } : {}) });
}
