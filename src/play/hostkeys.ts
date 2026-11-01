// The host's keys on the game screen, by where they apply (a key can mean another thing in another round, like N or
// D): the keys window's During the game part (spec §6.8; the editor's are in editor/editorkeys.ts).
import type { KeyGroup } from '../lib/keylist';
import type { Session } from '../lib/model';
import { CHECK } from './host/verbs';

/** The pre-game screen's group: listed only there, first. */
export const BEFORE = 'Before the game';

/** The blue button's and the check's group (right after Everywhere). */
export const BLUE = 'The blue button and the check';

/** A kind of item the check was told not to ask about again this game ("Don't ask about … again this game"). */
export type Silenced = NonNullable<Session['goonQuiet']>[number];

/**
 * What the check doesn't ask about this game, for the keys window's list with Ask again: each kind once, in the words
 * of its tick ("landings", "rolling"), with Ask again's name for screen readers.
 */
export function silencedRows(kinds: readonly Silenced[] | undefined): { kind: Silenced; words: string; again: string }[] {
  return [...new Set(kinds ?? [])].map((kind) => ({ kind, words: CHECK.quiet[kind], again: `Ask again: ${CHECK.quiet[kind]}` }));
}

/** The group the list starts with in each kind of round (a Jeopardy board's come right after Everywhere and Tools). */
export const KEYS_FIRST: Partial<Record<string, string>> = { rpg: 'RPG', boardgame: 'Board game', final: 'Final', tiebreaker: 'Tiebreaker clue', slides: 'Slides round' };

/** The keys (a player-only file keeps no undo history before the game: `playerOnly` leaves its Ctrl+Z out). */
export const hostKeys = (playerOnly: boolean): KeyGroup[] => [
  {
    title: BEFORE,
    keys: [
      ['Ctrl+Enter', 'Start the game (from anywhere on this screen). With a game in progress it would throw away, it asks first: Ctrl+Enter again a moment later answers Start new game'],
      // (A player-only file keeps no undo history here.)
      ...(playerOnly ? [] : [['Ctrl+Z / Ctrl+Y', 'Undo / redo the changes made here (players, rules, buzzers, On stream)'] as [string, string]]),
      ['Enter in a player’s name', 'Add the next player (as ＋ Add player does), typing in their name'],
      ['F2 in a player’s row', 'Rename them: the keys go to their name, ready to type over (on their 📱 Phone buzzers row too)'],
      ['Shift+F10 in a player’s row', 'Their menu, as a right-click on the row: 🎨 Color…, 🖼 Picture…, ± Start score…, ✎ Rename, ▲ ▼ Move, 🗑 Delete'],
      ['F2 on the game’s title', 'Rename the game, as ✎ Rename or a double-click on it does (its name shows on stream)'],
      ['A', 'Open the audience window, or bring it to the front (never closes it), as in the game'],
      ['Shift+A', 'Open ▭ Scores window (the score plates only, for a lower third in OBS), as in the game'],
    ],
  },
  {
    title: 'Everywhere',
    keys: [
      ['1 – 9', 'Select / deselect player N (for scoring)'],
      ['0', 'Select everyone, or no one (buzzer mode, during a clue: reset the buzzers)'],
      ['Enter / Shift+Enter', 'Award / deduct the amount to the selected players'],
      ['P then 1 – 9', 'Make player N the current picker'],
      ['Esc', 'Close the log, a tool, Who was who or a card; on a clue: back to the board (the tile is used up); else clear the selection'],
      ['K or B', 'Cover: viewers see only a “Be right back” card, and the countdown and the clue’s video wait (again: uncover)'],
      ['T', 'Start / pause the countdown (the seconds typed in the ⏱ box, if any)'],
      ['Shift+T', '10 more seconds on the countdown (none up: start one, as T)'],
      ['Ctrl+Z', 'Undo the last change: a score, a move, a stat or item, a tile, the picker, the turn order, Players or the Final'],
      ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
      ['Right-click a player', 'Their menu: on the stage (avatar, token, strip, score plate) or in the host panel (their score chip, their button in any box). This moment’s verbs for them first (✔ Right / ✘ Wrong in a clue, ★ picked it, ⭐ found it…), then Select, ★ Make the picker, ✎ Set the score…; ⛔ Kick from phone and 🗑 Remove player… last. Shift+F10 on their button, or a long press, opens it too'],
      ['Right-click the stage', 'The moment’s menu: first the blue button’s step (N, asking first as N does), then the moment’s own actions with their keys, what its box adds, the way out, Undo and Cover. Shift+F10 on the blue button (or a long press) opens it too'],
      ['L', 'Log: the history (go back to any point), scores and rolls; right-click a row of its 🕘 History: ↶ Back to here, ↶ Reopen tile, undo or restore just that score'],
      ['A', 'Open / focus the audience window (never closes it)'],
      ['Shift+A', 'Open / focus ▭ Scores window: only the score plates and the countdown, for a lower third in OBS'],
      ['H', 'Hide / show the host controls'],
      ['F', 'Full-screen'],
      ['?', 'This list (❔ Help at the bar’s end opens it too). Esc, ? or Enter closes it, and Enter closes 🔊 Sound help and ⚖ Rules too (not from a box or a button in them)'],
    ],
  },
  {
    title: BLUE,
    keys: [
      [
        'N',
        'The blue button (bottom right): Next or Reveal, the show’s next step (Show board ▶, Next slide ▶, 👁 Reveal answer, ▦ Done ▶ board, Show question ▶, Next turn ▶…). It never spins, rolls, sends cards, opens the buzzers, gives points or judges: those are in their boxes. With something left it asks first (the check); N again goes on anyway, except into an answer (R does that)',
      ],
      ['Shift+N', 'One step back: the slide before, the turn before, the player before (never asks)'],
      ['Shift+click on the blue button', 'Its step at once, without asking (what must be done first still asks: who picked a partner clue, the partner, the spotlit Final player’s verdict)'],
      [
        'Click the stage',
        'The blue button’s step, asking first as N does (PARTNER UP!, a Daily Double’s splash, the spotlit Final player’s card too), or what the stage shows: a title card, a wheel spins, dice roll (a board game’s landed dice move the token), a pop-up’s answer, a partner clue’s clock with no card for a phone. Where it can’t, the status line says what to do: the Final’s wagers, a card to copy first, and the last slide or finishing the Final take a second click',
      ],
      [
        'Enter',
        'Next only on a round’s title card and categories, in a slides round (with the keys on the blue button), on PARTNER UP! before the question, and in a Daily Double’s or the Final’s wager box. Elsewhere it does its box’s job: ＋ Award, ✔ Got it, 📤 Send and start, ✔ Judge all, ▶ Move',
      ],
      ['Enter in the check', 'The fix that shows ⏎ (never “… anyway”, nor Not yet); with nothing left, the step, or with players selected where Enter awards, ＋ Award as outside (2 then Enter gives Bob the points)'],
      ['Shift+Enter in the check', 'The fix that shows ⇧⏎ (− Deduct, ✘ Missed)'],
      ['N in the check', '“… anyway”, except into an answer (R there); with nothing left, the step'],
      ['R in the check', 'Before an answer: 👁 Reveal anyway'],
      ['Esc in the check', 'Not yet: back as it was (a second Esc right after does nothing, so a bounced Esc never closes the clue)'],
      ['W, D, U, O, C, X, T in the check', 'The fix that shows that key (W spins, U opens the buzzers, O rolls for a tie, C / X judge…)'],
      ['1 – 9, K, B, M, Space, ← / →, F in the check', 'As outside (who’s picked, the cover, the media): the check stays open. A number a fix shows (a tie’s “Ann answers 1”, a steal’s) presses that fix'],
      ['?, L, A, H, Ctrl+Z in the check', 'Not yet, then as outside'],
      ['A double press', 'Never skips the check: for a moment after it opens it takes no key or click (Esc aside), and what the press would do lights up'],
      [
        'Don’t ask about … again this game',
        `The check’s tick, for ${Object.values(CHECK.quiet).join(', ')}: that kind isn’t asked about again in this game. This window lists what’s ticked, with Ask again`,
      ],
    ],
  },
  {
    title: 'Tools and media',
    keys: [
      ['D', '🎲 Roll! (then ↻ Roll again): the dice on screen, or the last dice again (board games: the round’s own dice)'],
      ['W', '🎡 Spin! (then ↻ Spin again): the wheel on screen, or open the first saved wheel (none saved: 🎡 Wheel makes a quick one)'],
      [
        'N with a tool on screen',
        'Its blue button: on a wheel or dice tile, Show question ▶ (▦ Done ▶ board with no question; not spun yet, it asks first: W spins); a question pop-up, 👁 Reveal answer, then Next ▶; any other tool, the scores or a sheet, Next ▶ puts it away. A score effect not given asks first',
      ],
      ['O', 'Roll-off: who goes first (on a tie for first at the end: the tied players roll for the win; in a buzzer tie: 🎲 Roll for it)'],
      ['S', '📊 Scoreboard on screen, or off it again'],
      ['Space', 'Play / pause the slide’s video or audio'],
      ['← / →', 'Seek the media back / forward 5 s'],
      ['M', 'Mute / unmute the media'],
      ['Shift+M', 'Stop the game’s sounds on stream (a round intro’s music that goes on, say)'],
      ['Y', 'Open YouTube / online media in its own window'],
    ],
  },
  {
    title: 'Jeopardy board',
    keys: [
      ['N', 'Round intro: the next step (the title card, then the tiles and categories)'],
      ['N during a clue', 'The blue button (bottom right): the next slide, reveal the answer, then back to the board. With something left (no points given, the buzzers never opened, answers still coming, a card not sent) it asks first: N again goes on (into an answer, R does), Enter does the first fix, Esc is Not yet'],
      ['Shift+N during a clue', 'A clue with several slides: the slide before'],
      ['R', 'Reveal the answer (again: hide it); the countdown stops. On a wheel or dice tile while its wheel or dice is up, the first R says to spin, roll or close it first'],
      ['← ↑ → ↓ on a tile', 'Move across the board (Enter or Space opens the tile); after a clue the keys go on from its tile'],
      ['1 – 9, then Enter on a tile', 'The keys go to the Amount box: type the points, then Enter gives them'],
      ['Shift+Esc', '↩ Put back (keep tile): back to the board, the tile stays playable (not once points were given)'],
      ['Enter in the Daily Double wager', 'Show question ▶, as N (its player answers it). Who found it or the wager still missing: the keys stay in the box, and the status line says what'],
      ['Esc on a Daily Double splash', 'Back to the board: the tile stays playable (no wager was taken)'],
      ['Enter on a ✍ multiple-choice clue', 'With nobody selected, once the answers are locked: ✔ Judge all, by the choice marked right (one Ctrl+Z takes it back). With players selected, Enter awards them'],
      ['W on a partner clue', '🎡 Spin for a partner (1–9: choose one yourself). With nobody marked as its picker yet, the status line asks who picked it: their number first'],
      ['Enter on a partner clue', 'Show the question, send the cards to their phones and start the clock (📤 Send and start; copy them to anyone without a phone), then ✔ Got it (Shift+Enter: ✘ Missed)'],
      ['T while a partner clue’s cards are handed out', 'Start the clock: with no card waiting for a phone the clue goes live (the first Enter after it only says so); with cards to send, Enter still sends them'],
      ['Esc on a partner clue before the question', 'Back to the board: the tile stays playable'],
      ['1–9, then Enter, in a partner clue’s steal', 'After ✘ Missed with steals on: who steals it, then right (Shift+Enter: wrong), as on any clue'],
      ['Right-click a tile', '▶ Open it, ✓ Mark as played (skip it) without opening it, or ↶ Reopen this tile once it’s used'],
    ],
  },
  {
    title: 'Slides round',
    keys: [
      ['N (or click the stage)', 'The next slide; after the last one, N goes on to the next round (a click on the stage there takes a second click)'],
      ['Shift+N', 'The slide before'],
    ],
  },
  {
    title: 'Buzzer mode (phone buzzers, set on the pre-game screen)',
    keys: [
      ['1 – 9', 'During a clue: player N answers, picked by hand (over a phone’s buzz). With someone answering it picks N as well (to judge both); press the one answering’s number to let them go'],
      ['0', 'During a clue: reset the buzzers (↺): nobody is locked out any more, and they open for everyone'],
      ['U', 'Open the buzzers (🔔 in the buzzers’ row: when they open on your key, after reading the clue; after a right answer, for the rest)'],
      ['O in a buzzer tie', '🎲 Roll for it (in the buzzers’ row): the tied players roll, and the order they roll in is the order they answer in'],
      ['Shift+Enter on the one answering', 'Wrong: they’re locked out of this clue and the next one who buzzed answers at once (⏭ Skip: the same, with no points taken); once nobody who buzzed is left, the buzzers open for the rest'],
    ],
  },
  {
    title: 'Final',
    keys: [
      ['N', 'The blue button: start the round, Show question (a wager still missing: the keys go to its box), the answer, then in the reveals their typed answer (or their wager) and the next player. The spotlit one not judged yet, it asks first: C or X judges them, then N goes on. Everyone judged: N twice finishes'],
      ['Enter in a wager box', 'The next wager still to type in; with every wager in, show the question'],
      ['Shift+N', 'Reveals: back to the player before'],
      ['R', 'The question: reveal the answer (again: hide it); the countdown stops'],
      ['1 – 9', 'Reveals: spotlight player N (as numbered in the player list)'],
      ['C / X', 'Reveals: the spotlit player is right / wrong (or right-click their score plate)'],
      ['Alt+↑ / ↓ on a name', 'Reveals: move them up / down the order (or drag the row)'],
    ],
  },
  {
    title: 'Tiebreaker clue',
    keys: [
      ['N', 'The blue button: the next question slide, the answer, then back to the results (nobody its winner yet: it asks first, 🏆 who won)'],
      ['Shift+N', 'The question slide before'],
      ['R', 'Reveal the answer (again: hide it)'],
      ['1 – 9, then Enter', 'The winner, as their 🏆 in the Who won? row does (no points; ± Also give points… gives some too)'],
    ],
  },
  {
    title: 'RPG',
    keys: [
      ['N', 'Title card: start the round'],
      ['← ↑ → ↓', 'Move the party one screen that way (not while a video or sound is on screen: ← / → seek it then, so use the numpad or Alt+arrows)'],
      ['Numpad 1–9 (not 5)', 'Move the party one screen that way (numpad 5 regroups)'],
      ['Alt+Q W E A D Z X C / Alt+arrows', 'Move the party (laptop keys)'],
      ['J', 'The full map: jump the party (or some players) to any screen'],
      ['G', 'Regroup everyone here'],
      ['V', 'Show / hide the map on screen'],
      ['I', 'The selected player’s sheet on screen (again: the next selected, then close)'],
      ['Drag on an empty spot', 'A box: the players, and the things they can pick up or use, inside it are selected. Drag any one of them to move them all (one undo step)'],
      ['Shift / Ctrl / ⌘ + drag or click', 'Add to what’s selected (on a touch screen a box adds too). A click on an empty spot clears it: ↩ Select them again brings it back for 5 s'],
      ['Alt+drag', 'A box even from a player or an object (doors, zones, shops, hazards, scenery and 🔒 locked things stay out of a box: Shift+click adds one). On some Linux desktops Alt+drag moves the window: use the stage menu’s ▭ Select in a box instead'],
      ['Esc', 'Close the object’s card, then clear the selection, players and objects at once. While drawing a box: no box, the selection as it was'],
      ['Delete / Backspace', 'Take the object whose card is open off the screen (Ctrl+Z brings it back)'],
      ['Shift+F10 on the stage', 'Tab to the stage first: the selected player’s menu, else the selected object’s, else the round’s'],
    ],
  },
  {
    title: 'Board game',
    keys: [
      ['D', 'Roll the round’s dice (or spin its wheel): the result fills in the steps'],
      ['Enter', 'With nobody selected: move the steps (on a one-space board, the only way on)'],
      ['N / Shift+N', 'Title card: start the round (N); then Next turn ▶ (asking first while the turn isn’t played: N again goes on) / the previous player’s turn'],
      ['I', 'The selected player’s sheet on screen'],
      ['Alt+← / → on a name', 'Move them earlier / later in the turn order (✎ Change opens it; or drag the chip)'],
      ['← ↑ → ↓ on the board', 'Tab to the board, then go from space to space; Enter or Space opens its card, Shift+F10 its menu (a click on the board lets the space go: Enter moves the steps again)'],
      ['E', '✎ Edit board: add, move, delete and connect spaces while you play (E or Esc again: back to playing)'],
      ['Delete / F2 while editing', 'Delete the picked space or link / rename the picked space'],
    ],
  },
];
