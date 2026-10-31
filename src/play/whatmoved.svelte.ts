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
    'The tiebreaker clue: Who won? 🏆 Ann 🏆 Bob (the tied players only) settles it in one click; the Amount row is behind ± Also give points… (a number, then Enter, still picks the winner).',
    'A player’s menu starts with this moment’s verbs for them (✔ Right / ✘ Wrong in a clue, ★ Ann picked it and 🤝 Make Ann the partner on PARTNER UP!, ⭐ Ann found it, the Final’s), then a line and Select, ★ Make the picker, ✎ Set the score… (they were first); with the buzzer room up 📱 Free seat and ↩ Let back, then ⛔ Kick from phone and 🗑 Delete player, red and last.',
    '🎭 Deal…: its button says how the deal stands (“🎭 Spy night · sent”, “· on screen” while Who was who is up), orange when a phone missed its card. Inside, by purpose: On phones (↻ Send again, ↩ Take the cards back), On stream (🎭 Show who was who), and apart, This deal (🎭 Deal a new one, 🗑 End this deal).',
    'The wheel edit’s and a shop’s questions: Cancel first, the answer last (💾 Save, Replace, Sell anyway, Set). The wheel edit’s Overwrite is 💾 Replace “…”….',
    'An RPG round’s box: the movement pad and the minimap come right after the selection line at every height, with a tool’s box (a shop, a wheel, a question) and an object’s card beside them (the tool’s box was at the top of the panel). ✎ Edit screen, ＋ Screen…, the looks, ＋ Text, ✏ Draw and 💾 Keep in game are under ▸ ✎ Improvise after them (open until you fold it).',
    'An RPG object’s right-click menu starts with its card’s buttons (✋ picks up, 🚪 Go through, 💬 Talk, 🛒 Shop, its actions, ▶ Run all), then 🗂 Open its card, ✎ Edit, Hide and 🗑 Remove. A right-click on a ware in the shop on the stage: 🛒 Buy for each player, 📦 Change the stock….',
    'A board game’s box starts with the turn: the turn box (🎲 Roll then ▶ Move, Steps, ◀ Back, 📍 Send … to…, which was at the right of the row), the round’s own dice under it (they were on top), then the landing box. Beside the stage that part is at the column’s foot, by Next turn ▶. The turn order is one line under it, ✎ Change opening its chips and 🔀 Shuffle (it was the first row), and ✎ Edit board (E), 🗂 Spaces…, 📺 The board and 🛒 Shop… are on the line after that.',
  ],
  editor: [
    'Every right-click and ⋯ menu goes in one order: ✎ Edit (what a click does), what it can do or be made (Make it a…), ✎ Rename · ⧉ Duplicate · 📋 Copy · 📋 Paste, ▲ ▼ / ◀ ▶ and ＋ Insert, its own extras, its row’s or column’s own group, then ⌫ Clear and 🗑 Delete last, with each item’s key.',
    'A tile’s row items are under “Row 2 · $400” (▲ Move up, ▼ Move down, ＋ Insert above, ＋ Insert below, 🗑 Delete row 2), and ⌫ Clear clue is last. A category’s menu starts with 🖼 Image…. An RPG screen’s column and row have groups of their own.',
    'Lists: a row’s ⧉ and ▲ ▼ are in its ⋯ now (Ctrl+D and Alt+↑/↓ still work), with 🗑 apart at the row’s end. A wheel slice’s ↻ Spin again is in its ⋯ too, and a slice that spins again says “↻ again” after its label. ▶ Play’s players keep their ▲ ▼.',
    '▶ Play: a player’s menu starts with 🎨 Color…, 🖼 Picture… and ± Start score…, then ✎ Rename.',
    'The slide editor: the selected item’s 🔒 Lock, ⧉ Duplicate and 🗑 Delete moved from the foot of its panel to a bar pinned at the panel’s top, with its name, its edit (✎ Edit image…, ✎ Edit video…, Test link ↗…, which were in the panel) and ⋯ for its menu; a ⋯ by the selection on the slide opens the same menu.',
    'Slide tabs: right after them, the open slide’s group, always there: ＋ Add slide, ⧉ Duplicate slide, 📋 Copy slide, 📋 Paste slide (as a new slide; its ▾: over this one), ◀ ▶, 🗑 Delete slide apart. 📋 Copy slide and 📋 Paste slide left the slide’s toolbar (◀ Earlier and Later ▶ are ◀ ▶), and a 🤫 card’s 🗑 Delete card is in that group now. A right-click on a tab gives its menu; Ctrl+C / Ctrl+V on a tab copy and paste the slide.',
    'The slide editor’s Shape ▾ is in sections: Shapes, then Draw (✏ Draw a line is ✏ Freehand line…, and its line is called “Freehand line”, not “Drawing”; 🖌 Drawpad…), with ⬚ Hotspot on an RPG screen only. Background ▾ shows the picture with Change… and ⌫ Clear picture (🖼 Picture… is 🖼 Add a picture…).',
    'The slide editor’s right-click menu goes in that order too, headed by the item’s name: ✎ Edit, 🔁 Use another picture… (video…, sound…), ✎ Rename, ⧉ Duplicate, ✂ Cut, 📋 Copy, 📋 Paste, the restacks, Align ▸, 🔒 Lock, 👁 Hide while editing, 🗑 Delete. Beside a full-slide question’s words it’s the slide’s own menu (＋ Text here, 📋 Paste here, 📋 Copy slide, 📋 Paste over this slide, 🎨 Background…, Select all), and a Layers row has the item’s menu too (right-click, or Shift+F10).',
    '✎ Edit image, 🖌 Drawpad and ✎ Edit video go alike along the top: ↶ Undo, ↷ Redo, Reset apart (it was Reset all; the Drawpad’s ↶ ↷ and Clear were in its tools), then Cancel, Apply or Insert drawing (Ctrl+Enter), ✕. A video’s Cancel is only at its foot. ✂ Crop pressed reads ✓ Done cropping (that was a button of its own); in ✎ Edit image, C, D, T and S pick ✂ Crop, 🖌 Draw, 🅣 Text and 😂 Sticker.',
    '🖼 Media: a card’s 🗑 is at the right end of its name row, by ⋯ (its menu; a right-click on the card too); its foot is ✎ Edit…, Replace everywhere… (it was Replace…) and the one fix. “used 3× ▾” lists where the file is used and goes there.',
    'A video’s or sound’s panel: Start at (s) and Stop at (s) are one row, “Plays from [0:00.0] to [the end]” (83, 1:23 or 1:23.5; ↑ ↓ 0.1 s), with ▶ Try it; Autoplay, Loop, Start muted and Volume are under When it plays, and Fit and the speaker icon above them.',
    'New names: 🏁 Make it Start → 🏁 Make it the start · − Remove from shop → 🗑 Remove from shop · My themes’ ✏ Rename… and 🗑 Delete… → ✎ Rename and 🗑 Delete theme… · 🔊 Sounds’ ↺ and − → ↺ Built-in and ⌫ Clear file · a die’s Count and Sides d → How many and Sides · the slide editor’s 🔊 Audio → 🔊 Sound · a slide item’s Replace… → 🔁 Use another picture… (video…, sound…) · 🖼 Media’s Replace… → Replace everywhere…, Check link → 🌐 Check it still loads, Check ↗ → Test link ↗ · ✎ Edit image’s Reset all → Reset, the Drawpad’s Clear → Reset.',
  ],
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
