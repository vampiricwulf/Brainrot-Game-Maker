// "What moved in this version", for a host who knows the old places: what changed place or name, in the ⌨ Keyboard
// shortcuts window's words, at the top of its part (During the game; the editor's once something moves there), with
// the renames (keylist's RENAMED). ❔ Help on the game screen shows a dot until its part's list was shown on this
// computer. Each change that moves something adds its line here, for the version it goes out in.
import { RENAMED } from '../lib/keylist';

export type MovedPart = 'game' | 'editor';

/** The version these lines are since: a new list (a later version's) shows the dot again. */
export const MOVED_SINCE = '2.38.0';

/** What moved, by the keys window's part, one line each. */
export const WHAT_MOVED: Record<MovedPart, readonly string[]> = {
  game: [
    'The blue button is only Next or Reveal now (Show question ▶, 👁 Reveal answer, ▦ Done ▶ board, Next turn ▶…): it never spins, rolls, sends cards, opens the buzzers, gives points or judges.',
    'Those are in their boxes, once each, ringed when they’re due: 🎡 Spin for a partner (W) in front of the players, 📤 Send and start or ⏱ Start the clock (Enter) at the 🤝 box’s foot, 🎡 Spin! or 🎲 Roll! (W, D) in the tool’s box, 🎲 Roll then ▶ Move (D, Enter) in one place in a board game’s turn box, 🔔 Open the buzzers (U) and 🎲 Roll for it (O) in the buzzers’ row, ✔ Right and ✘ Wrong (C, X) in the Final’s rows, ❓ Tiebreaker clue in the tie box.',
    'The check: the blue button with something left asks first, “First:” (a box’s step not done) or “Before you go on” (points, answers or a tie would be lost), with a button for each fix, Not yet (Esc) and a quiet “… anyway” (N again; R at an answer).',
    'Shift+click on the blue button goes on without asking. “Don’t ask about … again this game” turns one kind off: this window lists them, with Ask again.',
    'O rolls for a buzzer tie (🎲 Roll for it). ＋ Award is green, never blue.',
    'A tool’s box has no ✕ Close: the blue button (Show question ▶, ▦ Done ▶ board, Next ▶) or Esc puts it away. A question pop-up keeps ✕ Close until its answer is up.',
    'A Daily Double’s Show question ▶ is the blue button only (Enter in the Wager box too). The partner wheel: Next ▶ puts it away and shows the pair.',
    'The stage’s right-click menu starts with the blue button’s step (N), then the moment’s own actions.',
    'In one window, the quiet 👁 Reveal answer and ▦ Done ▶ board over a partner clue’s blue button are gone: the blue button is that step, always in view.',
    'A click on the stage does the moment’s safe step (PARTNER UP!, a Daily Double’s splash, the Final’s spotlit card, a partner clue’s clock), or says what to do in the status line at the panel’s top.',
    '▶ Play: Start game ▶ asks before throwing away a game in progress.',
    '▶ Play: the 📱 Phone buzzers card goes in the order you use it (▶ Start the room right under Phone buzzers on), its options under ▸ Buzzer options.',
    '▶ Play: one ✅ Before you start card in the players’ column (the stream’s tips, then the game’s checks, each with Fix ›). 📺 On stream folds into one line that says what’s set; the start scores are behind ± Start scores.',
    '↩ Put back (keep tile) (Shift+Esc) is at the far left of the clue’s row beside the blue button (it was in the status line), ▦ Done ▶ board a quiet skip at that row’s right end, and 🙈 Hide answer in its place once the answer is up.',
    'The bar: 🔊 Sound is beside 📺 Audience now, with ▭ Scores window (↶ Undo ↷ Redo · 📜 Log 👥 Players ⚖ Rules · ⏸ Cover 🙈 Hide · 🔊 Sound 📺 Audience ▭ Scores window · ❔ Help 🚪 Exit).',
    'The Final: finishing early is Finish now… at the left of the box’s foot, beside “2 still to judge” (it was a second Finish game ▶ at the right, by the verdicts). The reveal rows are in straight columns, ✔ Right and ✘ Wrong at the right end; the wager screen’s first line says whose wager it waits on.',
    'The results screen: ▶ Next game… and 🔁 Rematch are on the left now, after 📋 Copy standings (they were at the far right), 🔁 Rematch last and set apart.',
  ],
  editor: [],
};

/** The renames, as "old → new" (the keys window's filter finds each by its old name). */
export const renames = (renamed: readonly [string, string][] = RENAMED): string[] => renamed.map(([now, was]) => `${was} → ${now}`);

const key = (part: MovedPart) => `jb.whatMovedSeen.${part}`;
function read(part: MovedPart): string | null {
  try {
    return localStorage.getItem(key(part));
  } catch {
    return null;
  }
}

/** The list each part was last shown on this computer (its MOVED_SINCE), null for never. */
export const movedSeen = $state<Record<MovedPart, string | null>>({ game: read('game'), editor: read('editor') });

/** This part has lines not shown on this computer yet (❔ Help's dot, and the list open at first). */
export const movedNew = (part: MovedPart, seen: string | null = movedSeen[part], lines: readonly string[] = WHAT_MOVED[part], since = MOVED_SINCE): boolean =>
  lines.length > 0 && seen !== since;

/** The part's list was shown (the keys window opened on it). */
export function markMovedSeen(part: MovedPart): void {
  if (movedSeen[part] === MOVED_SINCE) return;
  movedSeen[part] = MOVED_SINCE;
  try {
    localStorage.setItem(key(part), MOVED_SINCE);
  } catch {
    // Storage is off (private mode): the dot shows again next time.
  }
}
