# Changelog

What changed in Brainrot Games Maker, newest first. Every push to `main` is released as a numbered version
(`vX.Y.Z`, from 1.0.0 on: see "Versions and releases" in README.md), whose release notes are the lines it adds here;
entries are grouped by the day they were pushed (Pacific time, PST/PDT). Each entry names the commits
it covers, so it also serves as the readable record where a commit title says little (see
[Notes on the history](#notes-on-the-history)).

How to add to it: put a line in the same commit as the change (or the merge that brings it in), under the heading for
the day it's pushed (Pacific time; start the heading on the day's first push) and Added / Changed / Fixed / Removed,
in plain words for the people who make and host games. Anything committed but not pushed yet goes under
**Unreleased** at the top, and moves under its day when it's pushed.

## 2026-10-09

### Added
- Play: a 🔇 Stop sounds button in the host panel (and Shift+M) while a round intro's music may still be playing; it works in RPG, board-game and slides rounds, which have no tile to stop it. (29aadf5)
- 🔊 Sounds: a missing sound file can be picked again from its own row with 🔗 Find file… (it used to add a renamed copy, and the checklist warning stayed); a sound whose online link has expired says so and offers the same button. (2e64d01, 29aadf5)

### Changed
- Score plates: when they're too narrow for the points symbol, every plate on the bar drops it together ("1.2K | 800 | 2K", not "$1K | 800 | $2K"). (a75568f)
- The 'Try a sample game' card and 'The sample game' menu item say what they add; the editor's key list says ? doesn't work while a window like the clue editor is open. (c94bbf1)
- RPG action buttons and the log say where and what: "Go to Lake", "Reveal Hidden chest (Road)", "Hide …" (they said only Go there, Reveal, Hide). (3ba3958)
- '↶ Reopen a tile…' is a menu: the arrow keys look through it and Enter picks (↓ on it put a tile back at once); ↓ in 'Go to round' asks before leaving the round. (4bcc729)

### Fixed
- A game sound whose online link stopped working plays its built-in sound on stream instead of nothing (round cues, dice, wheel, board moves, RPG and shop sounds), and ▶ on 🔊 Sounds says when a sound won't play. (2e64d01, 29aadf5)
- A long Round intro track stops when the first tile opens (it played under the clues to its end); a new round's intro or the Final's think music replaces one still playing. (2e64d01, 29aadf5)
- 🖼 Media: a file hidden by the filter no longer stays selected (Delete selected removed files you couldn't see); dropping an exported .html game, a .zip, a .bak or a .brainrot-theme there opens it as elsewhere; files added scroll into view and flash; pasting a link to a file already in the game says it was reused, not stored. (2e64d01)
- Tools: S (📊 Scores) over a wheel, dice, roll-off or pop-up no longer throws it away (S again, Esc or Close brings it back with its result and score card), and in a board-game round D, Enter and Move wait for the round's dice still going under the scores. (ff4f097, c4e4452)
- Wheels: a "land once" wheel edited for the spin keeps its landed slices (Restore brings them back, and Overwrite no longer deletes them); with two wheels spinning together a long name stays on one line, so the result stays on screen; "+ dice total × N" is offered only for dice. (ff4f097)
- Dice: a result with a picture or details fills the stage once the dice settle (it ran off the bottom over the dice and total); a blank custom face (a picture-only one) shows and logs its number, so the host gets the result and its score card. (ff4f097)
- After a slice's "Ask the question" or "Show slide", the keys go back to the main button (R, Esc and N work); Ctrl+Z of a confirmed wheel or dice score brings its score card back; the host's roll-off result says "goes first" like the stream; removing a player whose sheet is under the scores removes the sheet too. (ff4f097, c4e4452)
- Clearing the undo history no longer makes a game that was never saved count as saved (New and Open… asked nothing, and with autosave down the tab closed without a warning). (336da69)
- 🔍 Find: the result under a resting mouse no longer takes the highlight, so Enter opens the top result; a match on an RPG screen opens that screen's look with the object selected; tiebreaker and 'How to win' matches put the cursor in their box; a result in a world no round plays says to add an RPG round. (336da69, c2ffc3e)
- Checklist: a Final's missing question or answer opens that side, and a Slides round's empty slide opens that slide, with the cursor in its text. (336da69)
- Rounds: the sample game added to a game with rounds names its rounds apart ('Jeopardy! (2)'); Paste round names the copy in History and Undo and puts the cursor in its name; the 'Welcome and rules' template, or a pasted slides round, says when it went to the start of the game. (336da69)
- Single window: the stage no longer shrinks when a clue opens or a player is picked (a long name on ＋ Award / − Deduct is cut short with …, and windows up to 1280px wide leave out the key hints, still in the tooltips); 🔊 Sound opened during a game shows in the host panel instead of covering the stage viewers see. (a7006d3, 747c5d4)
- The board editor's columns narrow to fit the window, so all six categories show on a 1024px laptop; on a short window every Final wager box fits without scrolling. (a7006d3)
- Scores on the stage plates (and the scores-only window beside its countdown) no longer get cut off mid-number with many players: they get shorter instead ("$1K", "1,200"); hover a plate for the full score. (a679621, a75568f)
- ✎ Set the score… understands "1,000", "$500", "−$200", a dash pasted from chat and "500 pts"; if what's typed isn't a number it stays open and says so (it closed as if set). (a679621, a75568f)
- Restoring an old score change in 📜 Log › Scores no longer gives that player the board when someone else has answered since; a $0 clue can be marked right or wrong (it said "Enter an amount first"). (a679621)
- Start scores are rounded to whole points and capped at the most points allowed ("$250.5" showed on stream), and so are Final wagers; with the limits off, a Final wager box's tooltip shows the real score of a player below zero (it said $0); a Daily Double wager below 0 says so instead of "over the max". (a679621, a75568f)
- Board games: dice or a wheel that land while the scores (S) are up still fill in the Steps box, so Enter moves (it asked for a roll, and D rolled again); the score box in the host panel reads "$500", "1,000" or "500 pts" like ✎ Set the score…; with a symbol of two or more characters ("R$") a bar of many plates drops it on every plate, not some.
- Stream: an audience window left on the "Starting soon" card while you're in the editor follows every change (theme, banner, title…), and a picture, sound or font replaced in Media (or put back with Undo) changes there too, without reopening it. (b9abd3a)
- Pastel and other light themes: the room code on stream, wagers, places and the Scores overlay's title are white on their dark boxes (purple was hard to read), and a category name over its picture gets an outline that suits its colour. (b9abd3a, 00bf68f)
- 🎨 Theme: Undo and Redo of Clue text or a whole theme stay on the Theme page and name it (they opened the first clue); the page warns when the Clue text colour is hard to read on the tiles; an SVG banner or background comes in with an imported theme file; a wide banner's thumbnail keeps its buttons in the settings column. (b9abd3a, 00bf68f)
- ✍ Everyone answers in a single window no longer shows the players' answers on stream: the host panel shows who has answered until the answer is up, then the words for judging; marking one answer right no longer stops the countdown for players still typing. (26266eb, 660f904)
- Wheel and dice tiles with a question: the buzzers and phones wait until the tile's wheel or dice is closed; dice or a wheel over the question no longer hides it, restarts its countdown or clears who missed, and closing one over a revealed answer starts no countdown. (26266eb, 660f904)
- Under the cover (K), a countdown started meanwhile waits, paused, until you uncover, and automatic category reveals wait too; Undo of a right answer brings back the countdown it stopped; in buzzer mode, once everyone has missed, the main button is 👁 Reveal answer (🔔 Open the buzzers did nothing). (26266eb)
- Single window: the stage keeps its size when a clue opens with a long host note, in buzzer mode, and on a Daily Double's question. (26266eb, 660f904)
- Phones: one asleep when the buzzer room closed says "The game is over" when it wakes (it said "Reconnecting…" for ever), while one that only lost Wi-Fi for a moment keeps trying; a tab whose seat moved to another tab no longer takes it back by itself; one kicked while asleep is told so. (9edcace, d87a803)
- Buzzer room: discarding a kept game, or starting a fresh one instead, closes its room (phones waited for hours); a room left open in the editor that has ended is forgotten, with a note, and the pre-game screen offers a new one. (9edcace)
- While the buzzer room can't be reached, the phones list says so and greys out Add, turn away, Free seat, Kick and Move (a phone could be stuck waiting), and the Start bar and Going live? checklist stop showing an old joined count; Free seat with 🔒 seats locked says to untick the lock so the player can tap their name. (9edcace, d87a803)
- Help: in an RPG round the ? list and the host panel say the arrow keys move the party (← and → seek a video or sound on screen instead); in a board-game round the 🎲 Dice tooltip says D rolls the round's own dice; a repeated row about the board's arrow keys is gone. (c94bbf1, aae7945)
- The sample game's Final and Daily Double clues are right (Twitch's Just Chatting, and the 'only in Ohio' meme); rounds added from a template or the sample game use 🎨 Theme › Clue text like a blank round; the Mini quest's boss can be beaten (the shop's Sword gives +4 Power when used, and the lair's note says so). (c94bbf1, aae7945)
- Saving: the undo history no longer disappears after a reload or a reopen from Recent games once a theme preset was put on a game with its own clue font, board picture, banner or green-screen background; Replace… on a file a Recent game also uses changes it in this game only; older packs with two files of the same extension-less name open with both. (a3660dd)
- During a game: if storage fills up, the message says the game in progress isn't being saved (not "use Save"), the host panel keeps showing "⚠ Not saving" and closing the tab asks first; reloading right after awarding points or using a tile no longer loses that action; a damaged copy of the game in progress no longer leaves the builder stuck on Loading. (a3660dd, 45fbb82)
- Big files: a game pack over about 2 GB says it's too big to open (it blamed an incomplete download), Save and desktop autosave warn when they write one that big, and opening a big game shows "Opening …" in the header while the editor waits. (a3660dd, 45fbb82)
- After storage filled up during a game, discarding or ending that game no longer leaves "Autosave unavailable here: use Save" up until the next edit: a small write checks at once whether there's room again.
- Audience window: a clue's sound or video the host paused or muted stays where it was when the window is reloaded, or closed and opened again (it played again from the start with sound); RPG music the browser blocked there says so and starts on the click; TIME'S UP isn't slammed in again by a reload or by opening the scores window. (6793d3e, 0643a46)
- Board editor: a picture on a tile no longer covers its value or badges; tiles show ✍ for everyone-answers clues and their "Tile shows" text, and screen readers hear a tile's type; wheel and dice tiles say "No wheel chosen" or "No dice chosen" instead of asking for a question and answer they don't need; after Delete row, Move row or a tile drag the keys stay on the board. (dbefb23, 0577b3b)
- Clue editor: Undo of ＋ Add wheel… or ＋ Add dice… stays on the clue (it jumped to Wheels & Dice); Undo and Redo of a question slide added, moved or deleted open the slide it changed; Ctrl+D on an only question slide duplicates it (it opened the browser's bookmark dialog); History names ✍ Everyone answers being ticked or unticked. (dbefb23, 0577b3b)
- RPG rounds: wearing two copies of the same item no longer freezes the play screen and stops autosave; a question pop-up shows its answer to the host before it's revealed; an item that would change nothing (a Potion at full HP, a set value already there, damage at the lowest) is kept and says so instead of being used up; the pad and maps don't move the party under the title card. (3ba3958, 9dfe2a6)
- RPG rounds: arrival points, no-go areas and hotspots no longer offer a Reveal that did nothing; a pile's pick-up button names a player with room, and 'can't carry any more' keeps the card open; dragging a screen's dots on a map moves every party standing there. (3ba3958, 9dfe2a6)
- Keyboard: Enter and Space press the button the keys come back to after a window closes, a row moves or a strip's Cancel, but not a button you clicked with the mouse, nor a nearby one after ＋ Award or 🎲 Roll while points are being given; ▲/▼ and Keep, Remove and ↩ Restore in 👥 Players keep the keys in the list; Stay or Cancel on the panel's question strip gives them back to the button that asked; starting, changing round and leaving a game put them on the board, the main button or ▶ Play. (4bcc729, 837c156)
- Screen readers hear the Final's reveals (spotlight, wagers, judgments, 'press N again to finish'), who is selected, dice, wheel and roll-off results, RPG party moves and board-game turns, without the timer's ⏱ or stray marks read out; the hint after N with a player picked says Shift+Enter marks wrong (it said X); with the audience window open, 📜 Log opens beside the host's view instead of over the panel's buttons. (4bcc729, 837c156)

## 2026-10-08

### Added
- Slide editor: Ctrl+B, Ctrl+I and Ctrl+U work in a text box's Text field too (Ctrl+Z takes back the style first, then the typing); on a theme with dark slide text, "↺ Theme colour" beside a text box's Color puts it back to the theme's text colour. (56551cb, d213ca8)

### Changed
- Turning Teams on or off while phones are in the room asks first (every phone has to pick again), and the phones then say which way it went. (af3bdf8, 79e4ba2)
- The phone's name box says everyone sees the name (it shows on stream); with teams, the wager and answer boxes say your team sees them too. (af3bdf8)

### Fixed
- Phones on a team show the team's wager or ✍ answer as soon as a teammate (or the host) sends it, instead of an empty box; anything typed and not sent yet is kept. (af3bdf8)
- During a Daily Double, the other phones say "… is answering" once the question is up (they said "is wagering…" until the clue closed). (af3bdf8)
- After a roll-off or tiebreaker clue settles a tie for first, the winner's phone says "You came 1st" and the others "You came 2nd", like the end screen (they all said "You tied for 1st"); this needs the updated buzzer server. (af3bdf8)
- Teams: someone who changes team in the middle of a clue (moved by the host, or on their own phone) can't buzz again for the new team on that clue; they can after ↺ Reset or on the next clue. (af3bdf8, 79e4ba2)
- Teams: the host panel's 👥 Teams window (named so mid-game) adds "Team 3" rather than "Player 3", shows who is on each team, and removing a team says its people go back to picking a team on their phone; with nobody added yet, the pre-game screen says to add teams and its sample adds Team 1–3. (d911075, 625aa04)
- End of game: Ctrl+Z on the results screen, or on the tiebreaker clue before a winner is picked, goes back to the Final's reveals when it undoes a judgment there (it changed the winner out of sight or did nothing); during the tiebreaker clue the panel says who won it, and picking the other tied player changes the winner; declared co-winners count only for the tie they were declared for; the scores-only window no longer highlights the last picker on the results or during the tiebreaker. (c9c219b, 625aa04)
- After ▶ Next game… (or Keep & leave after a game), the phones say the host is setting up instead of still showing their place from the last game. (c9c219b)
- Player files: the players and rules set up before the game are kept on ◀ Back and ▶ Play again; the pre-game "things to check" no longer point to screens only the builder has (missing files and expired links say to ask whoever made the game for a new copy). (ed16d2a, 625aa04)
- Clue editor: a picture or copied slide items pasted (Ctrl+V) in the Question or Answer box go on that slide when it's the one open (items went in as the words "1 slide item", and pictures did nothing); in the other box it says to open that slide first. Words still paste as words. (56551cb, d213ca8)
- Clue editor: a question or answer typed again after its text box was deleted comes back on top of the pictures, in the theme's clue font and colour; a 🌐 Link download that stops because its box closed says so; on a theme with dark slide text, a text box's Color shows the colour the words are drawn in, and white can be picked; "Move to the slide's…" on a locked item says it skipped it. (56551cb)
- In the Final and the tiebreaker, "Use this style elsewhere … in this round" styles only their own slides (it restyled every board clue). (56551cb, d213ca8)
- Image editor: a caption font just picked shows once it loads (Apply waits for it); Ctrl+Z and Ctrl+Y work while a slider, colour or list has the focus; Remove crop and Reset all set the crop shape back to Free. (56551cb)
- Player files: a drawing or file added during play comes back after a reload or Resume game; the same file open in a second tab waits, paused, with Play here instead (both tabs overwrote the saved game); resuming in one window no longer closes another page's audience window; the start screen shows the audience window's line and warns when it's closed by accident; ⬇ Download as .brainrot shows its progress and ignores extra clicks; the buzzer-room line names the button that goes back into the room. (3ace03b, 4b3d8c8)
- In a browser that blocks site data, the builder opens its editor (it said the game was open in another tab, with no way out), and player files still play there, saying they can't save progress. (4b3d8c8)
- Stream: the join code shows on clues, in a corner the words leave free (a text box's whole frame counted as taken, so it was hidden on almost every clue). (78d7354)
- RPG rounds: a currency pile with no currency set stays put when picked up (it vanished and gave nothing), and the checklist warns about it; the shop's "Short by" row follows the buyer's money (Undo, Redo and score changes update or clear it); "Sell anyway" after "Other price…" charges the price typed; undoing a Regroup brings split view back. (78d7354, 739919e)
- Board games: deleting a space during play no longer says "? moved to Start". (78d7354)

## 2026-10-05

### Fixed
- RPG rounds: the plain arrow keys move the party (as the sample's note says), unless a video or sound on screen takes them; a question from a card's action fills in its value as the amount; Compare on a card starts on a stat both sides have other than HP (a fight's Power); G or Numpad 5 with one party says everyone is already together; taking out a player whose sheet is on stage takes the sheet off too (viewers saw a dimmed, empty stage).
- Board games: "Who goes first" makes it the winner's turn (it only named them); Next turn says when it skips a player or gives someone another roll; Enter with nothing to move says to roll first (or N once moved) instead of asking for a player.

## 2026-10-04

### Added
- The sample game opens with an Introduction (a slides round), and ＋ Add round › Start from a template has 🖼 Welcome and rules (a welcome slide, then how it plays) and 🎁 The sample game, so it can be added to a game that already has rounds.
- Phone buzzers: before the room starts, its card says it runs online (this computer and the phones need the internet, on any network), and warns when this computer seems to be offline.
- Phone buzzers: players can change their colour on their phone (🎨 Change your colour, under the buzzer), from the colours no other player has. It's on by default; turn it off with "Players can pick their colour on their phone" on the Phone buzzers card. It isn't offered with teams, where the host picks each team's colour.
- Phone buzzers: the audience sees who has a phone connected, with 📱 on the "Starting soon" lineup and on each player's score plate. It goes away when that phone disconnects.
- Phone buzzers: while someone else is answering, a phone that hasn't buzzed yet says "You can still buzz" (to get in line in case they miss) instead of "Wait".
- ✍ Everyone answers: a clue can have every player answer in secret on their phone. Tick "✍ Everyone answers" in the clue editor. When it opens, nobody buzzes: each phone shows the clue and an answer box, and the answers go to the host only. The host panel lists them with ✔ / ✘ for each player (the clue's value, as Award / Deduct). The stream shows "✍ Everyone answers" with a dot per player that fills in once their answer is in, never the words. Showing the answer locks them, and each phone keeps its own answer in sight. It needs phone buzzers; without them the clue plays as usual.
- A new kind of round, Slides: slides shown one after another, for an introduction, the rules or a break, all in one round. Add one with ＋ Add round › Slides; the first goes at the start of the game as the Introduction. Type each slide's text in the box or on the canvas, and use ＋ Add slide for more. In play, N (or a click on the stage) shows the next slide and Shift+N the one before; on the last slide the main button is Next round ▶.
- Wheels: a slice can mean "Spin again". Mark it with ↻ in the wheel editor, or add one with ＋ ↻ Spin again slice; a slice named "Spin again" or "Respin" counts too. When the wheel lands on one, the host's main button is ↻ Spin again (W), and on a "land once" wheel it never gets used up.

### Fixed
- Stream: the game's title on the Starting soon card is big again (it always shrank to its smallest size); "🔔 Buzz now!" no longer covers the clue's first line, and the pill stays solid while the stage's glow pulses; a long Final category no longer runs under "Make your wagers…" and the scores; the Final's spotlight card keeps its size when "✔ CORRECT / ✘ WRONG" comes in; one pop for several players with long names says how many ("4 players +$200") instead of cutting the names off. (1c26f90, 5050c71)
- Start game puts a Daily Double still to place on a clue with something on it (it could land on a blank one in a half-built game being tried out); the board's "placed" note says when Start will place the rest at random.
- Board editor: Backspace just after Enter in a category's name goes back to fix the name (it wiped the top clue); fewer rows or categories says how many written clues it removed.
- Ctrl+S saves from the clue editor too (it said to close it first).
- The pre-game bar has a "⚠ … things to check" button that brings the folded list into view (it could be below the fold); the Final's editor note says how wagers can be held to a player's score ("Ignore the limits").
- Phones: an answer edited and not sent says "Not sent yet" (it kept saying ✔ Sent), and a sent one shows what the host has; "Reconnecting…" covers the buzzer fully and, after a while, says to check the Wi-Fi with a Try again now button; tapping your name says "Joining as …" at once; Ask to join with no name says to type one; "Too early" says you buzzed before it lit up; a wager's error shows right under its box.
- Phones: the buzzer fits a landscape screen without scrolling; on small phones the colour picker scrolls into view; 🎨 Change your colour is hidden while the host is away (the pick was dropped) and once the game is over.
- Daily Double: with nobody picked yet, 1–9 pick who found it (they typed into the wager box), and the player buttons show their numbers.
- N on a clue with a player picked and no points given says so first (Enter awards, X marks wrong, N again closes), instead of closing the clue and losing their points.
- Final reveals: in a short window (1280×720) the how-to starts folded, so every player's row is in view.
- Wording: the "Starting soon" countdown says it shows in the audience window; the no-room question's button is "Not yet" (not a second "Back"); Settings' buzzer server note and the ⌨ list's W say what they really do; the Final's and RPG title cards mention N.
- Final: a second Final straight after another starts with "Ignore the limits" ticked again (it kept the last Final's choice); Redo back onto the Final question starts its countdown and think music again.
- ✍ Everyone answers: reopening a clue players already answered shows each phone its own answer again (phones had lost theirs, and could send a new one over it).
- Board games: Undo of a move puts its count back in the Steps box, so Enter moves it again (the roll was lost).
- ⚙ Settings: a number or buzzer server typed in and then closed with Esc is saved (it used to last only until the app restarted).
- Open…: deleting a Recent game keeps the keys in the list instead of dropping them on the page; deleting the last one shows your BrainrotSaves saves (when there are any) instead of closing; the BrainrotSaves list starts on its first save.
- Checklist: a "Go to a screen" button on an item, wheel slice or die face whose screen was deleted, a "Reveal / Hide an object" button whose object was deleted, and a Shop object with no shop chosen are listed as pointing nowhere (they weren't).
- Board games: Move by dice the app can't read ("2d6+1") says it rolls a d6, in the editor and on the checklist; saved dice are found by their name in any case; "Make it a…" offers Undo when it replaces landing buttons.
- RPG editor: shrinking a map or deleting a row or column says when the party now starts elsewhere and which doorways now lead nowhere (as deleting a screen does); "Go to a screen" works when the main map has no screens but another does (it said to add an RPG round); a screen picker shows what a side really leads to when a choice isn't taken.
- Items › Import CSV: a file with a header but no "name" column doesn't import its header as an item, and the note counts the items imported (not blank rows).
- An exported game file too big for the browser says to ask for the .brainrot (not the exporter's "Save a .brainrot instead"); exported files no longer carry the editor page's last screen-reader message; ⬇ Download as .brainrot in a player-only file says where it went and which files weren't in it, and says nothing when its save picker is closed.
- Desktop: autosave no longer fails while the "Autosaves to keep" box is empty or 0.
- Closing the audience window mid-game no longer plays the last few sounds all at once on the host (they could go out on stream).
- A wheel slice's or die face's video or sound pauses under the cover (K), as the other media do (viewers kept hearing it).
- A countdown shows over a pop-up, wheel, dice or shop on screen (it ran hidden under them, only its time's-up sound heard), and on the results screen too.
- "🔔 Ann is answering" no longer shows over the answer once it's revealed (picking who gets the points isn't someone answering).
- A board round left without a name gets "Round N" on its title card, not a blank one.
- The timer's seconds box: 0, a negative or a huge number starts the default countdown (it was an instant "TIME'S UP!").
- Phone buzzers: phones don't get question text viewers can't see yet (see-through, or coming in seconds later, like a hint); the seat list isn't redrawn when nothing on it changed (a tap mid-redraw was lost, and a screen reader's place in it); "This game is full, trying again" isn't hidden behind "Reconnecting…"; the keyboard no longer covers the ✍ answer box.
- Desktop app: an audience window that lost its host (the host page reloaded) finds it again, instead of staying frozen while a second one opens.
- Media: a file deleted while still used on slides is named on the checklist ("1 deleted file still used (3 places): not saved with the game. Undo the delete, or take it off those slides"), instead of a "media file missing" that the Media page couldn't find.
- A column of clues pasted on a category's name without tabs (a plain list) takes each line as one whole question: commas inside it no longer split it into a question and an answer.
- Import clues › Replace the board: a category that gets another name loses the old one's picture (its new name shows), and every tile is a plain clue again (not the wheel, dice, ✍ or countdown of the clue that was there); imported clues take the theme's clue text; a first row with an answer of just "A" (or a "$") is a clue, not a header; more than 10 categories says which were left out.
- Board editor: emptying the Categories or Rows box and clicking away changes nothing (it removed all but one).
- Clue editor: after Ctrl+Enter or Alt+arrows to another clue, Ctrl+Z undoes as it should, and typing in two clues is two undo steps.
- Final wagers: undoing a wager the host typed no longer wipes other players' wagers that came in from phones meanwhile (nor does a long step, like the Players dialog's, take back a step logged while it was open).
- Final wagers: once the question has been on screen, phones can't send wagers any more, even after a Ctrl+Z back to the wagers (the panel says so).
- Final: N on the question reveals the answer as the button does (with its sound; it only stopped the music); in the reveals, 1–9 spotlight player N as numbered everywhere else (it was the Nth in the reveal order); the "press N again" note says "go on" for a Final in the middle of the game; the reveal rows' buttons say whose they are to screen readers; with the limits off, a player's score shows as "their score $X (no limit now)", not "max"; N in a wager box with wagers missing says who's missing.
- Final: taking a player out after a Final was played no longer changes its reveals, and bringing them back doesn't put them in a later Final.
- Daily Double: a wager fixed in the Amount box after the question showed is the wager for the quick ✔/✘ and for Show wager too; Enter in the wager box with no player or over the max says why; True Daily Double gives the keys back to the wager box; the player picked taken out meanwhile is unpicked.
- Rematch: a ✍ clue's answers and the wagers taken from phones in the last game don't carry over.
- Phone buzzers: ✕ Close the room and turning Buzzer mode off ask first when phones are in the room (they'd all have to join again).
- The Final round editor's "Players with a score of 0 or less can play it" box shows what the game does for older games (off).
- Board games: with a movement wheel, D after the move no longer spins again (Enter would have moved the player twice); D at a fork says to pick the way first; a slice saying "Back 2" (or "← 2") moves back; being sent back past Start doesn't offer its "when passed" bonus; ▶ Run all on a space with a roll, spin or question in it (a fight) runs just that one, now ▶ Start, and the host presses the outcome (it ran the win and the loss together); a removed player's last move's buttons go with them.
- Board games and RPG rounds: D, Enter and the move keys don't act unseen under the round's title card (it says to start the round first).
- Resuming a game with the editor's changes: Undo no longer puts back the boards, screens and maps from before the changes, and a party left on a screen deleted since goes to one that's there.
- Rematch starts from the game as saved, not from the copy just played with its live changes (✎ Edit board, improvised screens, items left lying), which were for that game only unless kept with 💾 Keep in game.
- RPG and board games: a secret item worn by a player no longer shows on their avatar on stream; the ± on a stat past its limit (after Buy anyway) says where it is.
- Slides rounds: on the last slide, a click on the stage goes on to the next round, as N does (it did nothing).
- Slide editor: after a right-click menu (Cut, Select all…), the keys stay on the slide. In the clue editor, Esc with items selected deselects them first, wherever the keys are; the next Esc closes the clue. Before, it sometimes closed the clue at once.
- ✍ Everyone answers: a ✍ clue plays as usual (with buzzing) when no buzzer room is running, or the room's server can't take answers; before, nobody could buzz or answer.
- ✍ Everyone answers: hiding the answer again doesn't let phones change theirs; an answer sent just before the answer showed still reaches the host; the first right answer picks next (not whoever was ticked last); random Daily Doubles never land on a ✍ clue; a line break typed on a phone is a space ("George Washington", not "GeorgeWashington"); a phone that hasn't sent one shows "waiting…".
- Slides rounds: ◀ Slide shows in the host panel (only Shift+N went back); a countdown started on one shows on stream; with something busy on top (a wheel spinning), N doesn't skip to the next round; the theme's clue text and "Use this style elsewhere" include their slides ("this round" is the round's own slides); the player-only home lists them; adding the first one says it went to the start of the game.
- Phone buzzers: a colour picked on a phone mid-game is no longer an undo step (Ctrl+Z stays with what the host did).
- A player-only game file uses the buzzer server it was made with, even when this browser has another one saved (from another file or the app).
- Phone buzzers: showing the answer closes the buzzers. Phones say "Clue over", a press then counts for nothing (nor gets in line), a wrong answer after it doesn't open them for the rest, and U says why they stay closed.
- Phone buzzers: the join code on the stream no longer covers anything on a slide. It moves to a corner with nothing under it, shrinks to just the code if that's all that fits, and stays off a slide with something in every corner.
- Slide editor: a click that wobbles a pixel no longer nudges the item (or snaps it to a guide) when the slide is drawn small, as in the clue editor.
- Slide editor: clicking one item of several selected now selects just that one (dragging still moves them all).
- Slide editor: lining up items with a locked one selected lines them up with it (it stays put) instead of ignoring it; Space evenly shows only when three or more unlocked items are selected.
- Slide editor: Duplicate makes unlocked copies of locked items, so a copied background on top can be clicked and moved.
- Drawing pad: Clear can be undone (↶ or Ctrl+Z), and Insert says so when everything drawn was erased instead of doing nothing.
- Editing a screen live during play: dropping several files at once is one undo step again (it was one per file).
- Cover (K): Google Drive and Streamable videos stop under it too (they kept playing, and could be heard); they start again from the beginning after it.
- After the host page reloads and reconnects to the audience window, the host's media controls (and Space, M and the arrow keys) find a paused video or a Drive/Streamable player there again.
- A scores window left open when the host page reloads reconnects by itself: it shows the scores again once the game's back, Exit closes it, and keys pressed in it work. Its "host left" note no longer says to reopen the audience window.
- Audience window: a long game title on the Starting soon card shrinks to fit, and the banner gives way, so the phones' QR code is never cut off. Long player names stay on one line ("…") on the end screen, the Final spotlight and the Daily Double card instead of running off the stage. A long clue caption stops short of the join code in the corner.
- Phone buzzers: undoing a wrong answer after the buzzers had reopened (and someone buzzed) no longer makes the next clue start with that old buzz "answering" on every phone; the Buzz order list starts afresh too.
- Phone buzzers: a quick ✔ or ✘ on a player who isn't the one answering (a blurted answer) no longer reopens the buzzers and takes the turn from the one answering.
- Keys list (?): the buzzer-mode number keys now say that, with someone answering, they pick player N as well (to judge both), and how to let the one answering go.
- Phone page: "Not you? Change player" asks first, and warns when the host has locked the seats (you couldn't get back in).
- Pre-game: "Daily Doubles not placed yet" no longer stays up when the board has no room for more (one a category, on a standard tile); 🎲 Place now says so instead of "Placed 0 Daily Doubles".
- Editor: emptying the ⭐ Daily Doubles box to type a new number no longer sets it to 0; it keeps its number until you type one.
- Teams: a team whose name was left blank is called "Team 2" on stream (as its box suggested), not "Player 2".
- Final round: the Think time box keeps its number when emptied, and is at least 5 seconds (blank or 0 played a 30-second countdown it didn't show).
- ＋ Add player (or team) picks a number no one has yet, so it doesn't make a second "Player 3".
- Pre-game: Ctrl+Z bringing back a deleted player gives back their start score too, and sample players keep their place in the list (they moved to the bottom).
- Board games: a "Move ±N" for one player no longer drops another player's fork waiting for a way (and its steps left), nor takes over the last move (the main button went back to 🎲 Roll for a player who had moved).
- Board games: at a fork the main button says 🔀 Pick a way, and N says to pick first instead of quietly dropping the steps left (Next turn ▶ beside it still does, on purpose).
- Board games: D (or 🎲 Roll) after the player has moved this turn says so instead of rolling, so Enter can't move them twice; type a number for an extra move.
- Board games: 🔀 Shuffle keeps the turn with whoever had it; giving someone the turn by their name drops a pending Roll again and the last player's landing buttons.
- Board games: ◀ Previous turn (Shift+N) goes back to the turn before as it was: a skip or Roll again that the Next turn used up is owed again, and that turn's move and landing buttons come back (it gave the turn to a player who was meant to miss it, and offered 🎲 Roll again).
- Board games: a move back that stops at a fork no longer offers the space it just stepped back from.
- RPG: an item's "party" actions (a group heal, a teleport) work on the party of the player using it, not the party viewers follow; and an item whose actions did nothing ("Pick who it's for first") is no longer used up.
- RPG: undoing (or redoing) a merge or join of parties puts viewers and the movement keys back on the party they followed before it.
- RPG: Alt+Q/W/E/A/D/Z/X/C move the party on a Mac too (Option+letter types other characters there).
- Shops: "Other price…" for someone short of it says so (with Sell anyway) instead of taking their gold below zero.
- RPG: picking up a pile of currency past the player's max takes only what fits and leaves the rest on the screen (it all vanished); with no room at all it says so.
- RPG: players arriving on a screen are never placed in a ⛔ No-go area (they could land on the lava it marked); they stand along the edge beside it, or a little further in.
- Board editor: pasting a two-line category name (copied from another category) into a category's name pastes the name, instead of writing its two lines over that category's top two clues.
- Clue editor: with the 🖼 Tile image picker open, Ctrl+Enter and Alt+arrows no longer move to another clue (the picture then went on that one).
- Board editor: ×2 and ÷2 also change tiles that have a value of their own (imported clues keep theirs), and ⧉ Duplicate category gives the copy's slides their own items (as a copied clue has) and no longer names an unnamed category " (copy)".
- Find: empty tiles are no longer listed, and a match in a tile's "Tile shows" text goes to that box.
- Board editor: the "🖼 A picture on …: where does it go?" bar stays with the tile it was dropped on while the board changes (an Undo, a category moved); it put the picture on whatever tile was then in that spot. If that tile goes away, the bar goes too.
- 📁 Media: files used only on tiles left empty for now count as used, so 🗑 Delete unused no longer deletes them (making the tile playable again showed a missing file); where a file is used says "(empty tile)".
- Picking a file of another kind in a file picker (the dialog's "All files"): it's added to 📁 Media but not used there, as a dropped one isn't (a video as the theme's background showed nothing, a picture as a sound played nothing).
- Uploaded fonts: a font replaced with 🔗 Replace file… shows at once (it kept the old one until a reload), and one whose file arrived after the game opened (reopened from Recent games, found again) is used without a reload.
- 🎨 Theme: a warning when clues, answers and scores are hard to read on the tile color, and the Clue text color box shows the color clues are actually drawn in (it showed white).
- 📁 Media: a file you renamed keeps your name when you 🔗 Replace it (it took the new file's name), and Find missing files finds it by its own file name too (renamed files stayed missing).
- Shops: switching what a row sells no longer keeps the old item's price on it (a Sword sold for the Potion's 5). Prices and stock can't go below 0, stock is whole, and "Buys back at 0%" means it doesn't buy things back (it took them for nothing).
- Wheel slices and dice faces: the Steal amount keeps its number when emptied to retype (it saved Steal 0) and can't be negative, and a Timer below 0 means no timer (it offered "Start -5s").
- Dice with custom faces have at most 100 sides (the faces past 100 rolled with no label or effect), and lowering the sides says which faces went (Ctrl+Z brings them back).
- Wheels: unticking "Each slice can only land once" mid-game puts the slices that landed back on the wheel, and the Restore count no longer counts slices deleted since.
- Shops sharing a stock pool really share it from the start: the stock begins at the number any of them has, wherever the first sale is (a shop left at ∞ sold the pool's item without end, and each shop counted down from its own number).
- Screen readers: the host panel's status line no longer reads the countdown out every second (it says "Time's up" once), nor the 📱 phones list when it opens.
- Keyboard: hiding the timer (✕) leaves the keys on its Start button, and closing the 📱 phones list (✕ or Esc) puts them back on the 📱 chip (they were lost to the page).
- RPG and board-game host panels say who is selected, which party is followed and whose turn it is to screen readers (it was shown by color only), and the ⏭/🔁 marks are named. An object on the RPG stage opens its card with Space too, not just Enter.
- Keyboard: on the play screen, when the button that has the keys goes away or turns off (Stay after 🚪 Exit, ± Adjust score's Done, a score typed in a chip, ↶ Back to here in the log, the timer's buttons at Time's up), the keys go to the nearest button still there instead of being lost.
- 📜 Log in one window: it takes the keys when it opens, the host panel under it can't be tabbed into meanwhile, and closing it gives the keys back to what opened it.
- Keyboard in the editor: when the button that has the keys goes away (🗑 deleting a round, a stat, an item, a shop, a wheel slice, a die, a file, a space; a clue's last extra slide; the 🌐 Link box closing), the keys go to the nearest button still there instead of being lost.
- Screen readers in the editor: the wheel or dice open in 🎡 Wheels & Dice is announced, the score-effect boxes on slices and faces have names, the "Add many at once" box has one, 🌐 Link says whether its box is open, and the board-game editor's Spaces / Board backdrop / Off-board zones switch is announced as buttons that say which is shown (it claimed to be tabs with arrow keys).
- "Reduce motion on stream": viewers see "🔔 Buzz now!" and TIME'S UP again (they vanished at once); they show for their moment and then go, without moving.
- Reduced motion: the host's own copies of the stage (the mirror of the audience window in two-window play, and the 🎨 Theme and board-images previews) follow the computer's reduce-motion setting like the rest of the host's screen; the audience window follows only "Reduce motion on stream" (the buzz-now light stopped glowing on stream when the host's computer asked for less motion).
- Desktop: a save whose old file another program had open (antivirus, OneDrive or Dropbox syncing it) or that's read-only no longer goes quietly to Documents as if the app's folder couldn't be written (leaving two versions); it says what happened and to save again.
- Desktop: an autosave and a Save of the same game at once no longer share a temporary file (which could put half of one in place), and a save in progress no longer has its backup cleaned up as if left over from a crash.
- Desktop update: the new version is on the disk before it takes the program's name (a power cut right after could leave half a program), a failed swap that can't be undone says where both files are, a connection that goes quiet ends the download with a message instead of leaving "Updating…" for good, the download stops as soon as it's too big, its errors are in plain words (no long links), and in a folder that needs administrator rights (Program Files) it says so.
- Desktop: files opened from Explorer one right after another each open under their own name (one could get another's name, or be dropped), restarting from Sound help waits for a save or export being written, and a few errors read plainly (no "os error" codes).
- Exported games: one that's whole but too big for the browser opening it says so (try Chrome or Edge on a computer, or ask for the .brainrot), instead of "this file is incomplete, ask for it again", which only got the same file again. One opened in a preview that can't run it (an email or phone preview) says, after a while, to save it and open it in a browser. Its first screen says it can't change the game and that your own games in the builder aren't touched, and one made without phone buzzers says it has none instead of promising they can be set up.
- First run in a browser: the "Add your first round" screen says the game is kept in this browser as you work, and that 💾 Save gives you it as a file to keep.
- Phone buzzers, for screen readers and small phones: when a wager box opens the keys go into it (and back to the buzzer after), with what it's for said first; errors are said once, not twice; BUZZ! and "You're answering!" are said at once instead of after whatever was being read; the sound button is named by what it says ("Sound on" / "Muted") and is bigger; a taken seat's "ask the host to free it" is readable; long names wrap; the small line inside the buzzer stops at three lines; and on short screens a long clue takes less room so the buzzer stays in view.

## 2026-10-03

### Added
- **A Final round's question can have several slides**, like the tiebreaker's and a board clue's: ＋ Add slide in the
  Final's editor (◀ Earlier, Later ▶, ⧉ Duplicate, 🗑 Delete slide). In play, after the wagers, N (or Next slide ▶, or a
  click on the slide) shows the next one and Shift+N the one before, viewers see where it is (● ○), and the host's notes
  show the slide on screen and the next one; then Reveal answer ▶ as before.
- **The tiebreaker clue can have several question slides**, like a board clue: ＋ Add slide in its editor (with ◀ Earlier,
  Later ▶, ⧉ Duplicate and 🗑 Delete slide, and the same keys on the tabs). In play, N (or the main button, or a click on
  the slide) shows the next one and Shift+N the one before, viewers see where it is (● ○), and the host's notes show
  the slide on screen and the next one; then 👁 Reveal answer.

### Fixed
- Desktop: pressing Save while a big HTML export was still writing could make the next Save write "Game (2).brainrot" instead of replacing the game's own file. Both saves now keep their notes.
- Desktop: closing the app while an export asked "Export anyway?" no longer says a save is in progress (nothing is written while it asks).
- Desktop: opening several game files at once from Explorer could show one file's name with another's contents, or a stray "No file to open." message.
- 🔊 Sounds: a preview kept playing, with no way to stop it, when its sound was switched off or its file removed; it now stops. Clicking ▶ on two sounds quickly no longer leaves the second playing with a ▶ on its button.
- In two-window play, a cue whose chosen file the audience window hadn't loaded was silent; it now plays the built-in sound there, as the Sounds tab says.
- Update check: a failed Check for updates no longer hides the notice and Update button for a newer version already found. A failed check at start-up now says so in ℹ About instead of leaving the line empty, and Firefox's and Safari's offline errors read "Couldn't reach GitHub (offline?)" too.
- Desktop update: if the new version was put in place but the app didn't restart, the button now reads Restart into the new version instead of downloading it again.
- **Clue editor: unticking Empty tile on a Daily Double raises the ⭐ Daily Doubles count**, as the board's own menu does.
- **Clue editor: Alt+arrows leave dropdowns (Alt+↓ opens them on Windows) and, on a Mac, text boxes (Option+arrows move
  the cursor) alone**, instead of jumping to another clue.
- **Round tabs on a narrow window (in a row): dragging one drops it before or after by left or right**, not top or bottom.
- **Buttons (on spaces, items, objects): an emptied number box keeps its number**: a "set HP to" left blank no longer
  set HP to 0 in play, and an emptied Seconds no longer started a broken countdown.
- **Stats & Items: a stat's Start, Min and Max can be typed over** (a minus sign isn't lost, and an emptied Start doesn't
  jump to 0); an emptied Min or Max means no limit once you leave it.
- **Stats & Items: emptying a player's own starting text** gives them the stat's start again, not a blank.
- **A shop charging a stat that's no longer a number** charges the first currency (or points) instead, and the
  checklist says so, instead of every purchase failing with "Short by …".
- **RPG: with the main map left empty (its screens moved or deleted), the party starts on the first map that has
  screens**, instead of the round having nowhere to start.
- **RPG world editor: moving the start screen (when none was chosen) to another map says where the party starts now.**
- **RPG world editor: deleting a map says what now leads nowhere** (doorways, side exits, Go to buttons, the start),
  as deleting screens does.
- **RPG world editor: "Make it the main look" keeps doorways arriving at an object there** (at its match in the new
  picture), instead of showing "⚠ Deleted object".
- **RPG: ＋ a screen beside one during play stays within the 16 × 16 grid**, so the map can still be edited after.
- **Board editor: text dragged out of a category's name drops as text**, instead of moving the category.
- **Board editor: copying, pasting or reusing a Daily Double raises the ⭐ Daily Doubles count** (Ctrl/Alt-drag, Paste
  clue, Duplicate category, Use this tile again), so the checklist doesn't warn and 🔀 Randomize doesn't take it off.
- **After a right-click (or Shift+F10) menu, the focus goes back to the tile, card or field it was opened on**, so the
  arrow keys, Delete and Ctrl+V go on working there; so does closing the "where does the dropped picture go?" question.
- **Phone buzzers (buzzer server: publish it again to get these): after a wrong answer, places count without the one
  who missed** (Carol is told she's next behind Bob, not "3rd"); **a clue opened with the buzzers closed no longer
  brings back the last clue's buzz order** ("You're 2nd" on a clue nobody buzzed on); **kicking a phone that's asleep or
  closed keeps it off that seat** when it comes back.
- **Phone buzzers: a phone whose browser can't save anything keeps its seat through a dropped connection**, instead of
  being told to tap its name on a seat that shows as taken.
- **Undoing an award gives the picker back**: with "the last correct player picks next" on, Ctrl+Z took the points
  back but left the star (and the phones' "picks next") on that player.
- **Phone buzzers: undoing an award puts the buzzers back as they were** (the player marked wrong by mistake can answer
  again, a right answer undone reopens the clue), and Redo as they were after.
- **Phone buzzers: deducting from several players at once locks them all out**, so none of them is handed the clue next.
- **Board games: the Steps box fills once the dice (or the movement wheel) have landed on stream**, so ▶ Move can't end
  the roll early; a move pressed while it's still rolling waits ("Still rolling…").
- **Board games moving one space at a time: while someone is at a fork, the turn's way buttons step aside** for the
  fork's own (which go on with its steps left), instead of moving the fork's player 1 space and dropping the rest.
- **Board games: "Move ±N spaces" for several players keeps the first fork to pick and the mover's own landing
  buttons**, instead of the last player moved taking them over.
- **RPG: dragging a selected avatar takes along only the selected players on the same screen** (and, to another screen,
  the same party), not ones elsewhere or out of their own party.
- **Wheels & Dice in play: a score card follows "This was for"**: tagging a player after the spin lands makes its
  Confirm score them (it kept scoring the picker), until you pick on the card itself.
- **Custom dice: the host's card acts on the face viewers see**, and every other die whose face has an effect gets its
  own buttons and score card (two dice with score effects no longer drop the second one).
- **A 🎯 Pick a player wheel spun with others keeps the player it picked** when the spin is tagged for someone else.
- **Under the cover (K/B), a video or sound that starts on its own waits too** (an answer revealed meanwhile whose slide
  autoplays a song), and plays when the cover comes off, like the ones already playing.
- **An audience window opening or coming back shows the cover (or Starting soon) at once**, never the stage under it
  for a moment.
- **The scores-only window hides the plates under the cover**, so judging the Final behind it doesn't show on stream.
- **The cover card says "📱 Players' buzzers" when the room takes no new players**, not "Buzz from your phone".
- **Countdown: ↺ Restart goes back to the time it was started with**, not that time plus the +10s added since.
- **Countdown: −10 taking the last seconds off a paused countdown runs it out** (Time's up on the host panel and its
  sound), instead of the stream saying TIME'S UP! while the panel waited at 0s.
- **Final: T and the panel's Start button start the Final's own think time**, not the board's default.
- **A stat a shop took past its min or max isn't pulled back by the next change**: gold at −2 after "Buy anyway" went to
  0 on the next − (the log said −1), and gold over its max after a sale lost the extra on the next +. Now a change
  moves it by that much (never further past the limit).
- **The Log's Scores tab no longer undoes points spent or earned in a shop on their own** (the item and the stock
  stayed): those say "in a step", and 🕘 History undoes the whole purchase or sale.
- **Taking an item takes a copy that isn't being worn first** (the worn sword stays on the avatar).
- **A player card's emptied stat box keeps the stat** instead of setting it to 0 as a step.
- **Settings: emptying a number box to type another keeps its number**: an emptied "Keep N autosaves" no longer saved
  1 (and the next autosave deleted the game's older ones), and an emptied "every N minutes" no longer turned autosave off.
- **Phone buzzers: emptying "A phone that buzzes too early waits" keeps the wait** instead of setting it to 0.
- **Players: the "Deleted … ↶ Undo" note goes once Ctrl+Z has brought the player back**, so it can't add them twice.
- **Settings: "Back to the defaults" clears the buzzer server's old Test result.**
- **Final: a 0 filled in for a player with nothing to wager goes when they have points to wager again** (given in the
  round before, after going back), so they can wager them instead of the question showing with their 0.
- **Final (teams): "sent by" stays on a phone's wager after leaving the wager screen and coming back.**
- **End screen: "Co-winners declared" and "… won the tiebreaker roll-off" only show while there's still a tie**, not
  after a re-judged reveal left one player first.
- **A pasted or imported round brings everything its buttons lead to**: a wheel, dice, item, shop or stat that only an
  item's Use button, a wheel slice or a dice face points at comes along too, instead of being left pointing nowhere.
- **Wheels, dice, items, shops and stats that come in as copies are named apart** ("Potion (copy)") from this game's
  own, like worlds already were.
- **A round with no name keeps the name it showed when copied or imported** ("Round 2", not "Round") in the Paste
  menus and the History step.
- **"Use this style elsewhere › Everything in the whole game" includes the tiebreaker clue.**
- **Theme: using a whole theme (one of My themes, a theme file or code, another game's) restyles the clue text** as
  its Clue text font and color say, like ↺ Reset to… does, instead of changing only clues added later.
- **Theme: "Use in this game" says so when the theme's pictures and fonts can't be stored** (storage full or blocked),
  instead of closing with nothing changed.
- **A theme or rounds from another game keep their uploaded fonts** when this game has a different file under the
  same id (one replaced since): the text shows the incoming font, not this game's or a fallback.
- **Image editor: ↺ Reset all (or undoing past a crop) leaves the Crop tool**, so clicks on the picture work again.
- **Media: Shift+click with a filter on picks only the cards on show**, so "Delete selected" no longer takes hidden
  files with it.
- **Media: an uploaded font used as the theme's Clue text font counts as used**, so "Delete unused" keeps it.
- **On stream, a long clue caption stops short of the slide dots** instead of running under them.
- **Importing clues no longer hides them on wheel and dice tiles**: filling a board leaves its 🎡/🎲 tiles as they
  are (they already have something on them), and replacing a board or pasting a column makes a wheel or dice tile it
  writes into a question tile. Before, the clue went on the tile but play spun the wheel or rolled the dice instead.
- **A checklist line clicked right after moving or deleting a round opens the right round** (or nothing, if it was
  deleted), instead of the round now in its old place or an empty editor.
- **The checklist warns about item, wheel and dice buttons that point nowhere**: an item's Use button whose shop,
  stat, item or wheel was deleted (or with nothing chosen), and the same on a wheel's slices and on dice. Clicking the
  line opens that item, wheel or dice. Before, it said ✓ Ready to play, and the button only failed in the game.
- **Release numbers: a changelog line that only uses the word "breaking" no longer makes a major release.** v2.0.0
  was one of those (a slide-editor fix): nothing in it changed saves, and every older save still opens.
- **Final: a player put back in during the reveals can still have their wager typed** once their spot comes up, instead
  of "wager undefined" with no box and no way to judge them.
- **Wheels & Dice: after a 🎡 Test spin or 🎲 Test roll, the preview follows your edits** (slices, names, colors, sides,
  faces) instead of staying on the test, and clicking a slice finds the right row.
- **Wheels & Dice: an emptied score or range box keeps its number**: a blank "Multiply score ×" no longer set the score to
  0 in play, and a blank From/To no longer caught every total (or none).
- **Wheels & Dice: Custom faces can be turned off on a die with more than 100 sides.**
- **Wheels & Dice: new and copied wheels and dice get names nobody has** (no second "Wheel 3", "Wheel 1 (copy 2)"
  instead of a second "(copy)").
- **Phone buzzers: "Edit here instead" in another tab keeps the buzzer room** for that tab to pick up, instead of
  forgetting it (the phones were left in a room nobody came back to).
- **Phone buzzers: resuming a game without buzzers from the pre-game screen forgets the pre-game room it closed**: a
  reload mid-game no longer sends the host back to the pre-game screen.
- **Phone buzzers: picking a second player while one is answering** (to give both points) no longer opens the buzzers
  again on every phone.
- **Phone buzzers: undoing Buzzer mode on the pre-game screen closes its room for good**: a reload no longer brings back
  the closed room with Buzzer mode on again.
- **Desktop app: ⬇ Export theme works** (the app refused to save a .brainrot-theme file: "That isn't a file name the
  app can save").
- **Desktop app: a game saved as a new file is remembered as that game's**, so a later Save of another game with the same
  title (with "replace the last save" back on) never replaces it.
- **On stream, a clue slide's pictures stay under the join code, the "Buzz now!" frame, captions, pops and tools**: a
  picture stacked high in the editor could cover them (until a countdown started).
- **The Starting soon countdown no longer flashes a wrong time** (the time since the audience window opened) as it starts.
- **Board games: deleting a space in the middle of a both-ways path joins the path up** (A ⇄ B ⇄ C leaves A ⇄ C), in
  the editor and in ✎ Edit board, instead of leaving two dead ends.
- **Board games: Duplicate and "＋ Add a space after it" on a both-ways path keep it both ways**, instead of a fork whose
  other way jumps back.
- **RPG: changing an object's class drops the old class's settings**: a character turned into a doorway no longer keeps
  💬 Talk and 🛒 Shop on its card in play.
- **RPG world editor: deleting the screen "🎯 Pick on the map" started from stops picking**, instead of leaving clicks on
  the map doing nothing with no note saying why.
- **Slide editor: Duplicate and Paste keep how the items are stacked** (a caption over a picture sent to the back stays
  over the copied picture, instead of going under it).
- **Slide editor: Esc closes the Background ▾ box** first, instead of closing the clue or only deselecting.
- **Slide editor: a file uploaded through the wrong button** (an .mp4 through 🖼 Image) goes on the slide as what it is,
  not as a broken picture; Replace… with another kind of file says so instead of breaking the item.
- **RPG: ＋ New look… starts its objects as they are by now**: a key already picked up stays picked up (it can't be
  picked up twice), a moved chest stays where it was moved.
- **RPG: ✎ Edit screen keeps objects dropped in play on every look**, not only the one on screen while editing (a
  dropped sword no longer vanishes when the host switches back to the original look).
- **RPG: a tag typed twice** ("poisoned, poisoned") is kept once, so the stats strip draws it once and doesn't break.
- **Phone buzzers: a phone whose seat was freed while it slept** shows the seat list when it reconnects ("Your seat was
  given…"), not its old buzzer that no longer did anything.
- **Phone buzzers: "Tap your name to take it back here" works**: the seat another tab or phone took back is tappable
  on this one ("Yours, on another tab or phone"), and takes it back with no name to give again (teams too).
- **Importing an items CSV keeps the worn look** (picture and place on the avatar) of items already in the game; only
  the slot comes from the file.
- **Changing a stat's type resets its start** (and the players' own starts) to the new type's default: Gold starting at
  10, turned into a Yes/no, no longer starts every player ticked.
- **A shop buys back at 100% at most**: a typed 150% let players sell an item for more than they paid.
- **⚙ Settings' "Back to the defaults" leaves how games are shown alone** (the audience window, the Going live?
  checklist), which the dialog doesn't show.
- **Esc closes the clue from its Type, Value, Countdown and Tile shows fields**, as from the quick fields.
- **A double-click on ◀ Prev round goes back one round**, not two (its second click landed on the new round's ◀ Prev
  round).
- **A Daily Double wager is whole points** (150.5 becomes 151), like the Amount box and Final wagers.
- **A spent "land once" extra wheel has no result on the next spin**: its last slice's score card no longer comes back
  to be confirmed twice, and tagging who the spin was for no longer re-tags an older 📜 Log line.
- **A pasted theme code followed by words on the next line** ("have fun") reads, instead of "damaged or cut off".
- **An extra "land once" wheel whose slices have all landed stays put** when the wheels spin, instead of starting over
  on slices that already landed.
- **Short names on a crowded player wheel stay whole** ("Al", not "Al…").
- **A tiebreaker winner who's no longer first shares their place again**: after a later score fix put someone else on
  top, the winner and the player they'd beaten showed as 2nd and 3rd instead of both 2nd.
- **RPG: giving a single stackable item** joins it to the other player's stack (one "Potion × 2"), instead of a second
  row of one.
- **A copied board-game round gets its own zones**: renaming a zone in the copy renames it on that round's Send to
  buttons and in the log, not just in the editor.

## 2026-10-02

### Added
- **A guide to setting up your own buzzer server** (free, on Cloudflare, about 10 minutes) in the README's new "Set up
  your own buzzer server" section: install, log in, publish, paste the address into ⚙ Settings › Buzzer server and
  Test; updating it, publishing from a GitHub fork, and what to do when something's wrong. ⚙ Settings › Buzzer server
  links to it (**How to set up your own ↗**), so does the ▶ Play screen's ⚙ Set up phone buzzers… (it opens there).
- **🗂 Pick a category wheel**, built in: on a Jeopardy board, a slice for each category that still has clues to play.
  Spin it from the host's 🎡 Wheel menu (its ✎ leaves categories out or changes their chances); it's listed in the
  editor's 🎡 Wheels & Dice too.
- **Ready-made wheels**: 🪙 Coin flip, 👍 Yes or no, 🎱 Yes, no or maybe, 🔢 1 to 10, 🎰 Point wheel (points, a Double and a
  Bankrupt that change the score), 💰 Double or nothing, 🌀 Chaos (steal, swap, double, halve), 🎁 Rewards, 😈 Punishments,
  🃏 Truth or dare, 🔤 A to Z and ⏱ Time limit (its countdown starts when it lands). Add one to the game from
  **📋 Ready-made wheel…** in the editor's 🎡 Wheels & Dice (then change anything), or spin one as it is from the host's
  🎡 Wheel menu (**📋 Spin a ready-made wheel…**; ✎ Edit wheel's Save as keeps it).
- **The built-in 🎯 Pick a player wheel is listed in 🎡 Wheels & Dice**, with what it does and where to spin it.
- **The "Starting soon" card on stream lists who's playing**: each player (team) in their color, with a team's members
  who joined from their phones under its name. With the phones' join code on the card too, the banner and the names
  are smaller, so it all fits.
- **Board games: "Make it a…" kinds of space**: 🛒 Shop, 👹 Boss / fight, ❓ Question / clue, ⏭ Skip a turn, ↩ Back 3
  spaces and ⭐ Star (bonus points), in the space's card, its right-click menu and ✎ Edit board during play. Each fills
  in what landing on it does (replacing its landing buttons), a color and an emoji drawn in the circle; a space still
  called "Space N" takes the kind's name. A Shop space opens the game's first shop, or makes one; a Boss fight rolls,
  scores 200 for a win, and for a loss takes 1 HP (when the game has HP) and sends them back 2. One undo step each.
- **Board games: ⑂ Add a fork here** on a picked space (its card, or right-click it): a new space beside the way on,
  as a second way, that meets the first again a space later.
- **RPG: 👹 Enemy** on a screen's tools: a character with its own HP and Power (viewers see them), a 🎲 roll button and,
  when the game has HP, an HP −1 button for whoever fought; its host notes say how to fight it with Compare on its card.
- **RPG: ＋ New shop… in a character's (or a shop object's) Shop box and an "Open a shop" button's**: it makes a shop
  selling the whole catalog and picks it, and a line under the box says shops are set up in 📊 Stats & Items, with a link
  there. The box used to offer only "—" when the game had no shop.
- **＋ Add round → Mini quest**: a 3-screen adventure with a village shop (a Potion and a Sword), gold to find in the
  forest and a boss guarding a hidden treasure, with the HP, Gold and Power stats it uses.

### Changed
- **The Final's wager step says it once**: under "Category on screen · taking wagers (only you see them)" the panel now
  just says "Tick who plays and enter each wager."
- **Board games: landing on a space counts as passing it** — the host gets its "when passed" buttons too ("Landed on
  Start (counts as passing): +$100"), so landing on Start still pays. The editor says so beside "When passed" ("landing on it counts too").
- **Board games: no numbers in the spaces' circles** (a space called "Space 4" no longer shows a 4); a space shows its
  kind's emoji, its picture, or nothing, and its name under it when ticked.
- **Phones, wagers**: the wager box is headed "Your wager" under the Final's name or "Daily Double — you're up!" (it
  said "Final Jeopardy!: time to wager" and then "Final: your wager"), and a wager sent says it can change "until the question shows" (there's
  no separate lock step any more).
- **Try a sample game no longer selects its first round's name**: the focus goes to the round's tab, so a key
  pressed next doesn't type over "Jeopardy!".
- **Host panel: ⌨ (keyboard shortcuts) sits beside 🚪 Exit**, and with the controls beside the stage the bottom bar is
  three tidy rows: ↶ and ↷ (their tooltips say what they'd undo) with 🔊 Sound, Log, Players and Rules on one line.
- **RPG: the host's 🗺 Map button is now "🗺 Map on stream"** (it shows the map to viewers), so it isn't mistaken
  for ⤢ Full map.
- **Slides: Ctrl+arrows resize the selected items** from the keyboard (Ctrl+Shift+arrows: 10 pixels at a time):
  → and ↓ make them bigger, ← and ↑ smaller; pictures and videos keep their shape. Listed in ⌨ Shortcuts and the slide editor's Tips.
- The image editor's hint beside **Stickers** is no longer in shouted capitals.
- **Phone buzzers: a player back on a new phone gets their seat back without a 2-minute block.** In the phones list, a
  seat taken by a phone now has **Free seat** (for someone who moved to another phone or browser: it blocks nobody)
  next to **✕ Kick** (which still keeps that phone, and others on the same Wi-Fi, off the seat for 2 minutes). On
  the phone, a taken seat says "Taken · is this you on a new phone? Ask the host to free it", and says when the phone
  that has it is away. Free seat needs the updated buzzer server; with an older one only ✕ Kick shows.
- **With Teams on, the ▶ Play screen's list is 👥 Teams**: "＋ Add team", "each row is a team; people join it from
  their phone", and who joined each team from their phone under its row.
- **Phone, joining a team: the name box says "Your name (your team sees it)"** (e.g. Zoe), so it doesn't read like a
  name for the team.
- **Phones say where you came when the game ends**: "You came 1st" with "with $700 🎉" (or "tied for 2nd", "Your team
  came 1st"), and it stays up when the host closes the room. Needs the updated buzzer server.
- **Board games: making a space a kind (Shop, Boss, Star…) shows its name on the board**, and the space's card shows
  which kind it is (worked out from its landing buttons, also for spaces made before). The sample game's and the
  templates' special spaces (Bonus, Go back, Nap time, Roll again) show their names and an emoji, so viewers can tell
  them apart.
- **The sample game's players are red, green and yellow** (two of them were blues that looked alike on the blue theme).
- **Small laptop screens**: a round's buttons at the top are shorter (▲, ▼, ⧉ Duplicate, 🗑 Delete) so its name stays
  on one line; an adventure's host notes sit beside its name, and a board game's tips above the board take one line,
  so the map and the board start higher up. In play on a short window, an adventure's movement pad and map come right
  under the parties, ahead of the improvising tools.
- **N does the main thing on a clue too**: whatever the host panel's main button shows (the next slide, 🔔 Open the
  buzzers, 👁 Reveal answer, ▦ Done ▶ board). R and Esc work as before. When the board comes up its first open tile
  has the focus, and the status line says "Pick a tile on the board (arrows + Enter)".
- **Start game ▶ shows its key** (Ctrl+⏎) on the button, not only in its tooltip.
- **Phone buzzers: a dropped phone shows**: 📵 on that player's name in the host panel, and "📵 phone offline 0:12" in
  the 📱 phones list.
- **Phone buzzers: "🔔 Buzz now!" on stream** when the host opens the buzzers ("When I press U"): a light around the
  clue while they're open, and the words for a moment.
- **Phone buzzers: the stage's "📱 Buzz in" badge** says "📱 Players' buzzers" when nobody new can join (seats locked,
  or every seat taken and phones can't add players), and otherwise, on a clue, also says the site to go to.
- **The Final's wager screen says "max $400 (their score)"** instead of "TV max $400", and the host info's Wagers list
  follows the players' order while wagers come in, with "waiting…" for the ones still to come.
- **The buzzer room lasts the whole stream, not one game**: Exit › Keep & leave keeps the room open (phones say "The
  host is setting up", as after ◀ Back to editor) and Resume goes back into it, same code, nobody joins again; only
  Discard & leave, leaving the results or ✕ Close the room closes it. Opening another game and pressing ▶ Play asks
  "Keep buzzer room XVGZ and its 5 players?" (Enter keeps it): the players and their phones carry over, Buzzer mode on.
  The bar over the editor says ▶ Play asks to keep it once another game is open.
- **The audience window stays up between games**: ◀ Back to editor and Exit no longer close it, so OBS keeps its capture
  source; in the editor it shows the game's "Starting soon" card (with the room code when a room is open). The bar over
  the editor has a ✕ to close it (asked first).
- **Game over has ▶ Next game…** beside 🔁 Rematch: it opens Open… / Recent games for the stream's next game, keeping
  the room, its players and the audience window, and the results stay viewable from the editor.
- **Resume asks "How is it shown?" with the display you used last picked**, so Enter resumes in it.
- **The audience window's "Click to enable sound" is a small chip in its corner** instead of a big orange box over a
  dimmed stage (which was on stream), and a window already clicked isn't asked again after it reloads.
- **One status bar over the editor**: the room left open, the game kept to resume (or a finished one) and the audience
  window share one compact line that stays in sight; the page itself no longer scrolls under it.
- **A rematch's card on stream says "Rematch! Starting soon…"**.
- **Opening a game over unsaved changes says what really happens**: the button is **Open anyway** (or **Reopen anyway**,
  **Start new anyway**), not "Discard", and the note says the game you leave is kept in this browser, where Open… →
  Recent games brings it back. With the browser's storage full it says going on loses it.
- **⬇ Export HTML moved into the header's ⋯ menu as "⬇ Export as a web page…"**, which says what it's for (one file that
  plays the game in any browser, without this app). Beside Save it read like the way to host the game. While it
  exports, the header says "Exporting the web page…".
- **Open… lists Recent games and Saved files apart**: Recent games are the games New and Open… replaced (kept in this
  browser), and **Saved files: Browse…** opens a game file you saved or were sent.
- **🎨 Theme: an empty My themes points to 📂 Import theme… and 📂 Use a theme from another game…**, and saving a theme
  says it's kept in this browser (⬇ Export theme takes it to another one).
- **The sidebar's Tiebreaker shows as "＋ Tiebreaker (optional)"**, muted and dashed, until it's turned on (it looked
  like a round of every new game).
- **📊 Stats & Items is in the sidebar once there's an RPG or board game round** (or stats, items or shops in the game):
  a game of Jeopardy rounds doesn't use them.
- **Clue editor: on the last clue, Next ▶ becomes Done ✓**, which closes it (it used to just grey out).
- **💡 Tips are open the first time you see each editor page** (the board, the slide editor, board images, the RPG map,
  the board game), and closed after that unless you open them.
- **An empty category name says "Type a name, or paste a column of clues"**, and the Jeopardy board card under "Add your
  first round" mentions 📥 Import clues… for clues already in a spreadsheet.
- **Host panel: − Deduct names the player and amount like ＋ Award** ("− Deduct Bob −$200").
- **The 4th default player color is a brighter blue** (it was navy, which vanished on the Classic theme's blue tiles and
  dark score bar). Games keep the colors they were saved with.
- **Avatars with initials read at small sizes**: under 48 px they use the plain UI font, not the condensed display font
  that made two letters a blob.
- **Phones: the 🔔 button in the header says "Sound on" or "Muted"**, with a tooltip saying what a tap does.
- **RPG rounds: the top of the round is plainer**: "Players start on" (was "Party starts at"), a line on how to add
  and draw screens, and the world settings (World, World name, ＋ New world, ⋯) tucked under **⋯ Advanced: carry this
  adventure into another round** (open when the game has more than one world or the world is shared). Map settings
  say what's in them, Ways out says what it is, the screen tools say 🚩 Arrival point, and a screen's own look is
  "Normal look".
- **RPG: the editor comes back to the screen you were editing** after another tab (📊 Stats & Items…) or a test play,
  not the map grid.
- **RPG in play: an object's card says what it is in words** ("Character", "Doorway"), as does the list of objects
  here ("Old Man · Character"), never codes like "npc".
- **RPG in play: an object's card no longer scrolls the pad and the minimap away** on a short window: they stay
  pinned at the top of the panel while it scrolls to the card's foot.
- **Layers list: RPG objects show what they are** (🧙 a character, 📦 an item, 🚪 a doorway…) instead of 🅣.
- **Board games: a space's two ＋ Add button say which they are**: "＋ Add button (when passed)" and "＋ Add button (when
  landed on)".
- **The 🪙 Gold stat preset starts at 10** (it was 0, so a shop couldn't be tried at once); games made before keep theirs.
  The 20-space loop template gives 2 of the game's gold for passing Start when it has gold, and the sample game's board
  game gives 2 Gold for passing Start.
- **▶ Test this round** in the editor (at the top of a round, and in a round tab's right-click menu): plays just that
  round straight away, with the game's players (or three sample players), marked 🧪 Testing this round. Nothing is
  kept: the game you left to resume stays as it was, and a buzzer room left open stays open. 🚪 Exit goes back to the
  editor on that round.
- **A short "✅ Going live?" checklist on the ▶ Play screen**: how the game is shown, whether the buzzer room is open
  and how many phones joined, whether the audience window was clicked so it can play sound, and a link to test the
  sound for Discord / OBS. Each line gets a ✓ as it's done; ✕ hides the list (🖥 Display shows it again).
- **The game's name can be changed on the ▶ Play screen** (✎ Rename beside the title, which shows on stream), and a
  game still called "Untitled Game" says so there and in the editor's checklist (a click there goes to the title box).
- **⚙ Set up phone buzzers… on the ▶ Play screen's 📱 card**, when phone buzzers aren't set up yet: it opens ⚙
  Settings right there, at the buzzer server's box, instead of sending you back to the editor. The card says it in
  plain words.
- **The ▶ Play screen remembers how you show the game** (🖥 Single window or 📺 Separate audience window, kept on
  this computer). With the audience window picked and not open yet, Start says **📺 Open audience window & start** and
  opens it, so OBS has the right window to capture from the first second.
- **Start game with Buzzer mode on but no buzzer room asks first**, in the bar at the foot of the screen: 📱 Start the
  room first, Start without phones, or Back. It used to start a game no phone could join.
- **Starting the buzzer room scrolls its card into view**, and the bar beside Start shows the room code and how many
  have joined (at 1280×720 the code and the QR code were below the fold, under that bar).
- **Leaving a game asks once: keep it to resume later, or discard it** (🚪 Exit › Keep & leave / Discard & leave).
  A game kept is one line over the editor (Resume game, Resume with my edits, Discard, and ✕ to put the line away),
  and ▶ Play no longer asks "Start a new game anyway?": the ▶ Play screen offers **▶ Resume it** (or Resume with my
  edits) at the top, and Start game replaces it.
- **The audience window says "🔊 Click to enable sound" over the picture until it's clicked** (browsers keep a new
  window quiet until then), so it's seen in the window and in the OBS preview; the host's "Going live?" gets a ✓ once
  it's clicked. It used to be a small note shown only while the mouse moved over the window.
- **The host panel's "📱 Phones off" chip says "No buzzer room: click to start one"** when hovered (it said "who has
  joined").
- **Board games: space names are hidden from viewers unless you tick "Show name on the board"** for that space, in
  the editor's space card or in ✎ Edit board during play (or right-click a space: 👁 Show name / ⊘ Hide name). This
  applies to games made before too, so their names disappear from the stage until you show them; **Names on the board:
  Show all / Hide all** over the editor's board (and in ✎ Edit board) does them all at once. While you edit, you still
  see every name, with the hidden ones dimmed and marked ⊘. The circles' numbers and icons stay as they were, and the
  board doesn't move. Each change is an undo step ("Showed the name of “Bonus”").
- **Slide editor: several items selected get the same tools as one**: ⤒ Front / ↑ / ↓ / ⤓ Back and a **Lock** box
  (ticked when they're all locked) beside ⧉ Duplicate and 🗑 Delete, laid out as the Inspector's Position is for one
  item.
- **Slide editor: "Move to the slide's…" Left / Center / Right / Top / Middle / Bottom sits under X, Y, W and H** in the
  Inspector's Position, instead of below Lock and Delete at the very bottom.
- **Slide editor: a turn within 3° of level settles on level** (0°, 90°, 180°), so a slightly tilted item is easy to
  straighten; Alt turns freely, Shift still steps by 15°.
- **Multi-slide clues: the slide tools say ◀ Earlier / Later ▶** (not bare arrows that read like "previous / next
  slide"), and a later question slide's empty text says "Click to type what this slide adds", as its field above does.
- **🖼 Media: a card's Replace… and 🗑 Delete sit side by side** (they were stacked on two lines), and **"used 3×" says
  where** when you point at it: the slides, the theme's background or banner, 🔊 Sounds, category and tile pictures,
  board images.
- **Slide editor: tooltips on 🖼 Image, 🎬 Video, 🔊 Audio, 📋 Copy slide and 📋 Paste slide** (a greyed-out Paste slide
  says to copy a slide first).
- **Desktop app: save and open errors in plain words**: no more "(os error 32)" at the end, and a file another
  program has open or a full disk says what to do ("Close it in the other program and try again", "Free some space on
  the drive and try again"). The same for a failed ⬆ Update ("Download it and put it in place of this .exe yourself").
- **⌨ Keyboard shortcuts lists the pre-game screen's keys** (`Ctrl+Enter` starts the game, `Ctrl+Z` / `Ctrl+Y`,
  `Enter` in a player's name), `Home` / `End` on a clue's slide tabs, and `Shift+F10` for the slide's right-click menu.
- **README and the spec brought up to date**: My themes and theme sharing, ✎ Edit board in play, dragging RPG players
  and objects together, the host panel's layout, the simplified Final, the in-game keys (`Shift+N`, `E`, `?`), and
  where the desktop app keeps what.

### Fixed
- **Going back to a Final whose reveals had started (◀ Back from a later round) opens the reveals**, not the wager
  screen, where a player the Final took to $0 was over their cap and dropped from the Final on the next visit.
- **Opening a layer's rename and leaving it as it was changes nothing**: no undo step, and the layer keeps following its
  text or file name (it used to be pinned to the label it had then).
- **Desktop app on Windows: retitling a game only in case** ("my quiz" → "My Quiz") no longer deletes the autosave just
  written (Windows sees the old and new names as one file).
- **Recent games no longer loses newer entries after storage was full**: a game that couldn't be kept isn't written
  again later over the newer list, and keeping one is no longer reported as failed because another save is still
  waiting (so "Reopen previous game" shows when it should).
- **A buzzer room that couldn't be reached no longer pulls a reload back into the pre-game screen** after ◀ Back to
  editor (or takes the room back from the window that hosts it now).
- **A phone asking to join always gets an answer**: a name of only invisible characters asks for a real one, and too
  many tries in a minute says to wait, instead of "Waiting for the host…" with nothing on the host's side.
- **Emptying 📋 Most players keeps its last value**, instead of dropping it to the players listed (which turned new
  players and phone join requests away as a full game).
- **⏸ Cover keeps the stream quiet**: the party's steps, pick-ups, coins, damage, a roll or a spin the host makes under
  the cover no longer play on stream (viewers see only the cover card).
- **Board games: a space's own "Roll 2d6"** no longer fills the Steps box when the board moves with the same dice; only
  the movement roll does (Roll again on it too).
- **Desktop app: a second click on ✕ while a save is being written** no longer closes the window when the first click's
  wait runs out; it closes once the save is written, as the first click asked.
- **Saving a very big game in Chrome or Edge** downloads it when the pack took too long to build for the browser to
  open its "Save as" window, instead of saying "Save failed" and saving nothing.
- **Turning Buzzer mode off in the editor (with an undo) closes the buzzer room waiting for ▶ Play**, as turning it off
  on the Play screen does; ▶ Play no longer goes back into the room with Buzzer mode on again.
- **Phone buzzers on one Wi-Fi no longer suffer for one phone's kick or flood**: a kick keeps the kicked phone off that
  seat but not the other players already in the room from the same house; after a phone floods the room, a seated
  player on the same network who reconnects gets their seat back at once (new joins from there still wait 30 seconds).
- **A game file whose category has fewer clues than the board has rows** opens with empty tiles in the gap, as meant,
  not blank clues that showed on the board, held the round open until played, and could be picked for a Daily Double.
- **Release notes no longer repeat an older change** when only its changelog line was edited (its commit hashes added),
  and such an edit no longer makes a fixes-only release a bigger version step.
- **A double-click on the host's main button can't put the answer on stream**: its second click no longer lands on the
  👁 Reveal answer the button just turned into (after "Show question ▶" on a Daily Double, or 🔔 Open the buzzers).
- **Questions that quote a name with a dot in it** ("Forget “St. Patrick’s Day”?") keep the name whole in their title.
- **The clue editor opens another clue at its first question slide** (from Find or an undo), not at the slide number
  the last clue was on.
- **The Final's wager screen: Enter and the first focus go down the rows in the order they're shown**, also after a
  player is unticked and ticked back in (they followed the reveal order, jumping around).
- **Phone wagers: a wager the host took from a phone and then cleared** (an emptied box, an undo) no longer still says
  "✔ Sent: $500" on the phone; the player can send one again. Needs the updated buzzer server.
- **Phone wagers with teams: someone who joins a team after the wagers began** no longer sees a teammate's wager
  changed after they joined (only one they send themselves). Needs the updated buzzer server.
- **Board games: Esc while ✎ Edit board is on** closes the 📜 Log or a dice or wheel first, as anywhere, instead of ending
  the edit.
- **Board games with one player (or after 🔁 Roll again)**: the next turn offers 🎲 Roll again, instead of staying on
  Next turn ▶ for good.
- **History names an RPG round's start in its own words** ("Changed where the party starts in round “Adventure”"),
  not as a board game's ("Made “?” Start").
- **🕘 History's filter can always be cleared**: with a filter typed, its box and ✕ Show all stay even when only one
  step is left (it went on hiding steps with no way to clear it).
- **Board games: two quick Ctrl+clicks add two spaces**, not three (the double-click added one more), in the editor and
  in ✎ Edit board during play.
- **▶ Test this round's end screen has no 🔁 Rematch either** (it kept the test as the game to resume, too).
- **The ▶ Play screen's ▶ Resume it opens the audience window** when that's the display picked, as Start does (the
  game resumed in a single window, answers and host notes on stream).
- **▶ Test this round's end screen no longer offers ▶ Next game…**: it kept the throwaway test as the game to resume,
  in place of your real one (🚪 Exit goes back to the tested round, as before).
- **Phones list: "📵 offline" times stay right on the ▶ Play screen** before a game and after a rematch (they only
  counted during a game, so a phone back since could still say "offline 3:12").
- **Ctrl+arrows on a picture keep its shape exactly**, however many presses (its shape slowly drifted).
- **Board games: a space landed on after going round a loop** shows its passing buttons once, not twice (once as
  "Passed", once as "Landed on"), so they can't be pressed twice by mistake.
- **📊 Stats & Items on a small laptop**: an item's row stays on one line (its name box gives way a little), instead of
  its 🗑 dropping onto a line of its own.
- **RPG host panel: the minimap is no taller than its map**, so a small world no longer leaves an empty band under it;
  and the objects here don't repeat a kind their name already says ("Arrival point", not "Arrival point · Arrival
  point").
- **The host's notes during a Daily Double's wager** say the question is "(not shown yet)" (they said "(on screen)" while
  viewers still see the Daily Double splash).
- **↺ Reset in a wheel's ✎ edit box** brings back the slices switched off on a quick, ready-made or category wheel
  (it used to keep only the ones left on).
- **RPG minimap: a party of three or more on one screen** stays in that screen's cell (their dots overlap), instead of
  spilling down over the screens below as if some were there.
- **Adding a second adventure (the Mini quest template) opened ⋯ Advanced with its world settings.** It stays shut
  now, with one line: "Its own world (separate from Adventure)".
- **Buzzer mode: after a right answer the main button reopened the buzzers**: once someone gets the clue right, the
  main button is 👁 Reveal answer (then ▦ Done ▶ board), 🔔 Open the buzzers is only a quiet button beside it, and
  "→ Next in line" no longer offers the clue to someone else. The same with teams and after a reload.
- **The Final's reveals went round and round**: N went Show wager → Next player → Show wager… without anyone being
  judged, so "3 still to judge" never ended. Now once a wager is up the main button is ✔ *Name* right (C), with
  ✘ Wrong (X) beside it, N waits for the judging, goes only to players still to judge, and ends at Finish game.
- **The Final's wager screen kept the keys in a wager box**: with phones sending the wagers no box takes the focus, and
  N in a wager box (or Enter in the last one) shows the question once every wager is in.
- **The Final's back button named the wrong round** after jumping to the Final with the round list ("◀ Back to Board
  game" from Jeopardy!): it's now "◀ Previous round (*name*)", which is where it goes.
- **A negative score was hard to read on stream** (red on the blue plate at 720p): it's now white on a dark red band.
  RPG and board-game name tags under the avatars are bigger (they were 8–12 px tall at 720p).
- **"Added a sample game…" and other editor messages stayed up after going to play** (and back): a message goes when
  you go somewhere else.
- **Closing the audience window by accident went unnoticed** (the stage just grew): the host panel now says
  "📺 Audience window closed: viewers see nothing" with a Reopen (A) button until it's back.
- **After a reload, Resume warned "Click the audience window once…"** for an audience window that never reloaded and
  had been clicked: the window is asked whether it may play sound instead.
- **"Resume with my edits" showed when nothing had been edited** (after a reload too): it shows only when the game in
  the editor differs from the one kept.
- **Randomize Daily Doubles' tooltip gave the wrong way to set one by hand**: it said to click a tile (that opens the
  clue); it now says right-click a tile → ⭐ Make it a Daily Double.
- **Host panel: the status line during the category reveal said "Round intro"** with no progress; it now says
  "Revealing the categories: 2 of 6" and how to go on. On a cleared board it says "Round complete!" without "Pick a
  tile on the board", and the ↶ Reopen controls wait until the intro is over.
- **Daily Double: the picked player's score was hard to read** on their colored chip; it's in the chip's own text color
  now.
- **Single window: 🙈 Hide left no hint of how to get the controls back**; the first time, a short note says "Press H to
  bring the controls back".
- **Board games: arrowheads hidden under a space's name show again**: a link coming into a space from below (11 → 12
  and 12 → Start on a new board) ended under the name, so it had no arrowhead; it now stops just past the name.
- **Slide editor: Undo and the 🕘 History name what was done to the items**: a paste of a text box and two shapes was
  "Added 3 text boxes", a duplicate "Added shape", Cut "Deleted…", lining up "Moved shape" (just the one that moved),
  locking several "4 changes" and a restack "Restacked items". Now: "Pasted 3 items", "Duplicated shape “Star”", "Cut 2
  shapes", "Lined up the top edges of 4 shapes", "Spaced 3 items evenly across", "Moved image “cat.png” to the slide's
  left edge", "Locked 4 shapes", "Sent shape “Star” to the back", and ▲ ▼ in the Layers list "Brought image “cat.png”
  forward".
- **ℹ About no longer says to delete your saves when removing the desktop app**: "Delete these folders too" took in
  BrainrotSaves, where your saved games are. It now says to delete the app's two data folders and keep BrainrotSaves,
  and says the timed autosaves go there too.
- **Desktop app: Exit closes the scores-only window (`Shift+A`) too**, also after the host page was reloaded (only the
  audience window closed then).
- **Desktop app: opening a `.bak` backup or a `.brainrot-theme` file with the app** ("Open with", or dropped on the
  `.exe`) opens it, as Open… and dropping it on the editor do. It did nothing.
- **⌨ Keyboard shortcuts said a picture dropped on a tile always becomes the tile's face**: it asks (in the question,
  or the tile's face), as the 💡 Tips under the board say.

## 2026-10-01

### Added
- **🎨 Theme: Save changes to a saved theme**: when the game's theme came from one of My themes and you've changed it,
  **💾 Save changes to “Name”** puts the changes in that saved theme (it asks "Overwrite “Name” with this look?" first).
  **💾 Save as new theme…** is always there. Built-in themes are never overwritten: from one of them only Save as new
  theme… is offered (or **Save a copy as my theme…** from its menu).
- **🎨 Theme: right-click menus**: on a built-in theme (use it, save a copy as my theme, export it, copy its code), on
  one of My themes (use, save changes to it, rename, duplicate, export, copy its code, delete), and on the settings: a
  color, a slider or a whole section can go back to the theme it came from ("↺ Reset to Party night", "↺ Reset Colors
  to Classic"), and colors copy and paste between settings. **Shift+F10** or the menu key opens the same menu on the
  card or setting in focus; the **⋯** buttons stay for touch.
- **Board games: ✎ Edit board while you play** (the button above the round's controls, or `E`). Add a space (＋ Space
  then a click, or Ctrl+click or double-click the board), drag spaces to move them, Shift+click a space to connect the
  picked one to it (or 🔗 Connect to…), click a link and press `Delete` to disconnect it (or make it both ways, or
  reverse it), and delete a space with `Delete` or 🗑: players on it go to the space before it, and the path closes up
  over it (the host is told who moved where). The picked space's name, color, Secret, Start and its buttons (⚙
  Buttons…, the editor's own fields) can be changed there too, and right-clicking the stage has the same edits. Each
  change is one undo step with a name ("Added space “Space 13”", "Connected Space 5 → Bonus", "Deleted space “Nap
  time” (Ann moved to Space 7)"). The changes are made to this game only; **💾 Keep in game** copies the board into the
  game in the editor, as the RPG's does. The audience window follows as you edit, without the dashed marks the host
  sees (in a single window, viewers see them: the panel says so). Rolling and moving wait while editing; `Esc` or ✓ Done
  editing goes back to playing.
- **My themes**: on the 🎨 Theme page, **💾 Save as my theme…** keeps the game's look on this computer under a name
  (as many as you like; the one "my theme" saved before shows there as "My theme"). They sit under the presets, marked
  ★, and a click puts one on the game (one step: Ctrl+Z takes it back). Each one's **⋯** menu renames it, updates it
  from the game's theme, shares it, or deletes it (it asks first). A saved theme keeps the colors, fonts and layout, not
  the pictures: they stay with their game (pictures would soon fill this small storage).
- **Share a theme as a file or a code**: **⬇ Export theme** writes a small `.brainrot-theme` file, with the background
  picture, banner and uploaded fonts the theme uses (up to 8 MB; it says which were left out). **📋 Copy theme code**
  puts a short code (`BRT1:…`) on the clipboard to paste in a chat: colors, fonts and layout, no pictures or fonts'
  files. **📂 Import theme…** and **⌨ Paste theme code…** show the theme on your board first, then **Use in this game**
  or **Save to my themes**. A damaged or unknown file or code is refused with a message saying why, and the game stays
  as it was.
- **More theme looks**, in folding sections on the 🎨 Theme page (each one is off until you set it, so games look as
  they always did): **Tiles**: alternating colors (checkerboard, by row or by column, with a second color), a
  gradient and its direction, border color and width, rounded corners, glow size, a drop shadow, the values' shadow
  (hard, soft or none) and how played tiles look (used-tile color, dimmed, or hidden). **Categories**: their own color,
  alternating colors, a gradient, and the line under them (any color, or none). **Score plates**: rounded, square or
  pill corners, and a glow on the player in the lead. **Board**: a background gradient and the space between tiles.
  They show the same on the stage, in the audience window, the scores window and an exported HTML game; a preset takes
  them off, and ↺ Plain tiles / ↺ Plain categories do too.
- **💡 Tips**: the long help on the board, a slide, Board images, the RPG map and the board game page folds into a
  Tips line under one short hint. Open it once and it stays open (on this computer) until you close it.
- **An empty Tiebreaker page explains itself**: with no tiebreaker, the page says what one is for, with the switch to
  add it.
- **Clues with several question slides**: lead in with a clue, show more on the next slide, then reveal the answer. In
  the clue editor, **＋ Add slide** adds a question slide after the one open (in its look, empty); the tabs then read
  Question 1 · Question 2 · … · Answer slide, and the open slide can be moved earlier or later (◀ ▶), duplicated (⧉) or
  deleted (🗑), each one a step in 🕘 History. The board tile shows how many it has (▤ 3). When the clue is played, the
  host's main button goes **Next slide ▶** (`N`) through them, then 👁 Reveal answer as before; **◀ Slide**
  (`Shift+N`) goes back one, clicking the slide goes on to the next, and the status line says "Slide 2 of 3". The
  audience window and the phones show the slide the host is on, and the buzzers stay as they are between slides (you
  open them when you want). Daily Doubles play their slides after the wager. Games made before open and play exactly
  as they did (a clue there has its one question slide). Final rounds and the tiebreaker keep one question slide.
- **Team buzzers**: tick **Teams: people join a team, anyone on it can buzz for it** on the pre-game screen's 📱 Phone
  buzzers card (saved with the game). Each player is then a team: on their phone people pick their team (they see who's
  on it) and type their own name, and anyone on the team can buzz. Whoever on it buzzes first answers for the team, and
  the team scores; a teammate's later buzz doesn't take another place in the buzz order, and a wrong answer locks out
  the whole team ("Your team already answered this one"). An early buzz only makes the one who pressed wait. The host
  panel's buzz order says who buzzed ("Ann (Red team)", and "🔔 Ann (Red team) buzzed"), viewers see "Red team is
  answering · Ann", and teammates' phones say "Ann is answering for your team". The 📱 list shows who's on each team:
  **Move to…** puts someone on another team, ✕ takes one person off (or everyone, on the team's own ✕). Without Teams
  nothing changes. The buzzer server has to be updated for it (the 📱 card says so when it isn't); buzzers on keys
  were already gone, so teams are phones only.
- **Wagers from phones**: players with a phone buzzer send their wager from it, and only the host sees how much. On a
  Daily Double, once the host picks who found it, that player's phone shows a wager box with their score and max (held
  to only if the host unticks "Ignore the limit"; then a wager over it is refused on the phone, saying the max); the
  host's wager box fills in as they send, marked 📱 from phone, and the host can still type over it. The other phones
  say "Ann is wagering…". On a Final's wager screen every player ticked in with a phone gets the box (those ticked out
  see "You sit this one out"); the host's row says 📱 waiting… or 📱 $500 from phone ✔, each one sent is a step in 🕘
  History ("Ann’s wager (from their phone): $500"), and players can change theirs until the host shows the question,
  when their phone says "Wager locked: $500". A wager the host changes is the host's, and the phone shows the host's
  amount. With Teams, anyone on a team sends the team's one wager, every member sees it, and the host sees who sent it
  ("sent by Al"). Viewers never see the amounts: the audience window only gets a ✔ that a wager is in (and now gets no
  wager amount at all until it's shown, typed or sent). A phone that reloads shows its own wager again. The buzzer
  server has to be updated for it; with an older one the host types the wagers, and the wager screen says so.
- **Version numbers and updates**: the app has a version (1.0.0 to start; every push to `main` is released as the
  next one, `MAJOR.MINOR.PATCH`), shown in ℹ About. When a newer version is out, the editor says so: the desktop app
  updates itself in place (⬆ Update: it downloads the new `.exe`, checks it's signed with the project's key, saves your
  game and restarts into it), the HTML file offers the new file to download. ℹ About can check any time, and ⚙
  Settings can turn the check at start-up off.
- **Start game places a board's missing Daily Doubles**: a new board says ⭐ Daily Doubles 1 but has none placed, and
  used to play without one. Now Start puts any that aren't placed on the board at random (each board a step in 🕘
  History, as 🎲 Place now is) and says so in a toast. The pre-game screen says how many aren't placed yet next to
  Start game, not only in the folded checks.
- **A player's chip shows how they were marked on the open clue** ("✘ −$400", "✔ +$400"), and pressing the same ✔ or
  ✘ again on that clue does nothing (it's greyed out), so a second ✘ no longer takes the points twice. ＋ Award and
  − Deduct still give or take more on purpose.
- **The host's status line says when ⏸ Cover is on**: "⏸ Viewers see the cover (K to uncover)".
- **⏭ Skip** in the host panel, for the player answering on a phone buzz: they pass with no points taken (they can't
  buzz again on that clue), and the next in the buzz order answers.
- **A volume for each sound** in 🔊 Sounds (0–100%, full volume to begin with): the game plays it that loud, and
  its ▶ preview too. Games made before keep every sound at full volume.
- **An exported HTML file keeps your buzzer server**: the server set in ⚙ Settings › Buzzer server goes into the file,
  so phone buzzers work when it's played on another computer (that computer's own setting still comes first, if it
  has one). Before, the file said "Phone buzzers aren't set up in this copy" with no way to fix it there.
- **Screen readers hear the game**: the host panel's status line, awards and score changes ("Ann +$200, now $1,200"),
  the phone buzz order, a tie, who is answering, toasts and the undo notes are read out from one polite live region
  that's always on the page. A burst of changes is said once, together. (8bb6edc, c34ccb7, 8b514bd, 65c0fb7)
- **A warning before a chroma-key game** when a player's color is close to the key (a green player on a green key): OBS
  would key them out. It suggests another color or the other key. (8bb6edc)
- **The editor's checklist says when a category name is too long** to read on its board. (8bb6edc, 2c772e8)
- **Windows High Contrast**: selected players, pressed buttons and the chosen theme preset are outlined, as box shadows
  and tints disappear there. (8bb6edc)
- **📋 Game rules mid-game**: a small **📋** next to 👥 Players in the host panel opens the same rules as before the
  game. Changes count at once and are kept with the game in the editor (undoable there). When the game is full,
  👥 Players offers **Raise Most players to …** next to the greyed-out ＋ Add player. (1d355db)
- **`Ctrl+Z` / `Ctrl+Y` on the pre-game screen** undo and redo the changes made there (players, rules, buzzers, on
  stream, Daily Doubles placed), the same steps as the editor's 🕘 History, and the list and rules show it at once.
  In a name you've just typed in, `Ctrl+Z` first undoes the typing there, as in the editor. The browser's own undo no
  longer changes a field behind your back. (1d355db)
- **History's Go there for players and rules**: a step in Play › Players, Game rules, Phone buzzers or On stream now
  has **Go there**, which opens the ▶ Play screen at that part. (An undo in the editor never starts a game.) (1d355db)
- **Phone buzzers keep the room through the pre-game screen**: reloading the app on the pre-game screen comes back to
  it in the same room, with the same players, and the phones stay joined. **◀ Back to editor** keeps the room open too
  (phones say "The host is setting up — hang on", and the editor shows which room is still open, with ✕ Close the
  room); ▶ Play goes back into it. The room only closes with Exit / the end of the game, ✕ Close the room on the 📱
  card, or turning Buzzer mode off. (9c17132, 885fe51, 5272947)
- **🔒 Lock seats** (📱 card and chip): no new phone can take a seat or ask to join; players already in still come
  back after a reload. A player whose seat the host takes back (✕) can't tap the same name again for 2 minutes (they
  can take another free one). (9c17132, 885fe51, 5272947)
- **The join code on stream during the game**: small, at the end of the score bar on the board and in a corner of clue
  screens (never over the tiles), and on the cover card (K). On by default while a room is open; the pre-game screen's
  On stream options can turn it off. (5272947)
- **Phones say more**: who got the clue right ("Ann got it" / "You got it!") instead of "Get ready", what's going on
  when there's nothing to buzz ("Daily Double: Ann", and "Daily Double — you're up!" on Ann's phone; who picks next;
  the Final; an RPG or board game round; "The game starts soon"), the points symbol with the score ("Ann · −$200"),
  and "The host's connection dropped" while the host is away. (9c17132, 885fe51, 5272947)
- **Phones**: a short beep and a flash when BUZZ! lights up and when you're answering (iPhones have no vibration;
  🔔 in the corner mutes it; no flash with reduced motion), and **Not you? Change player** under the buzzer to let go
  of a seat tapped by mistake. (885fe51)
- Someone asking to join from their phone pops up a note for the host (and a soft chime when the stream is in the
  separate audience window), not only a number on the 📱 chip. (5272947)
- **Slide editor: line up several items and space them evenly.** With more than one item selected, Left / Center /
  Right / Top / Middle / Bottom line them up with each other (not all at the slide's edge, on top of each other), and
  **↔ / ↕ Space evenly** (also in the right-click menu's Align ▸) spreads three or more. Turned items count as drawn.
  (1461bb1)
- **Snapping while resizing**: the edges you pull snap to the slide and to other items, with guides, as moving does.
  Snapping reaches the same few pixels on screen however big the slide is shown, and uses turned items' real outline.
  `Alt` turns it off. (1461bb1)
- **🖼 Board images › Preview with N players**: the preview's score bar has as many players as the game can have
  (📋 Most players), or the number picked, and a warning says when an image covers a player's score. (9748fcf)
- **Online pictures** (from older games) have Fit and Rounded corners like the game's own pictures. (9748fcf)
- **RPG sound cues**: the party stepping to the next screen, a blocked way, going through a doorway, picking
  something up, coins (buying or selling in a shop) and damage (a button taking HP or another stat down) each have a
  quiet, short built-in sound. Each has its own line in 🔊 Sounds: on by default, previewable, replaceable with your
  own file, or switched off. (0ff069a)
- **Board game editor: copy and paste spaces.** `Ctrl+C` / `Ctrl+V` (and the right-click menus) copy spaces with their
  buttons and the links between them, onto the same board, another board or another game (with the wheels, dice and
  pictures their buttons use). Right-click the board to paste them where you clicked. (d61f2e5)
- **Board game editor: several spaces at once.** `Ctrl+D` and the right-click menu duplicate several spaces (the links
  between them too), and the menu also copies them, makes them secret or deletes them. `F2` (or ✎ Rename) renames a
  space. (d61f2e5)
- **The checklist goes to the screen or space.** An RPG line names the screen ("the doorway on “Cave” leads nowhere")
  and a click goes there; a board game's line goes to the space. The checklist also says when a board has fewer Daily
  Doubles than it asks for (as the ▶ Play screen did), and when a board game's movement dice were deleted. (8e0766c)
- **📦 Item ▾ with no items yet** offers ＋ New item here (made in the catalog and put on the screen) and 📊 Go to Stats &
  Items, instead of a dead end. (ad6b92d)
- **Board game: any space's card from the keyboard**: a **🗂 Spaces…** list in the host panel opens a space's card
  (its landing actions, 📍 Put … here, 👁 Reveal), as a click on the space does, with the focus in it.
- **The slide's right-click menu from the keyboard**: Shift+F10 (or the menu key) on the slide opens it for the
  selected items; ↑/↓, Home and End move through it, and Esc or Tab closes it. Tab through the items on the slide
  now tells screen readers which one it picked ("Rectangle, 2 of 5, locked").
- **🎨 Edit image without the mouse**: **＋ Add text in the middle** (🅣 Text) and **＋ Put 😂 in the middle**
  (😂 Sticker). The caption box, its font and the brush colour have names for screen readers.
- **The Layers list flags an item that's off the slide** ("⚠ off the slide"), where players can't see it.
- **Phone buzzers: a press on a connection that turned out dead still counts.** Back from the background, the phone
  says "Checking connection…" until the room answers; a press made then (or one the room never answered) is kept and
  sent again once the phone is back in its seat, if the buzzers are still open for that clue. If they aren't, it says
  "Your buzz didn't get through — press again" instead of nothing.
- **Phone buzzers: a buzz that reacted faster but reached the room after the race was decided** says so ("faster, but
  arrived late" in the host panel's buzz order and on that phone) instead of "0.00 s behind".

### Changed
- **Board-game editor: the same gestures as ✎ Edit board in play.** Double-click the empty board to add a space (after
  the space that was selected), double-click a space to rename it, and click a link to pick it: its card beside the
  board makes it both ways or one way, reverses it, or ✂ disconnects it (so does `Delete`; `Esc` lets go). Linking is
  called connecting everywhere, as in play: 🔗 Connect to…, ✂ Disconnect, and undo steps named "Connected Space 3 →
  Space 7", "Disconnected …", "Made “Lava pit” Start", "Added space “Space 13” after “Space 9”".
- **Board-game editor: a space's card shows the ways into it too** ("From: ← Space 5 ✂"), and has a **→ Connect to a
  space…** list beside 🔗 Connect to… for connecting without the mouse. The right-click menu lists Connect to… before
  Make it Start (as in play), the ⌨ shortcuts list says the new gestures, and the card is a little wider so 🏁 Make it
  Start, ⧉ Duplicate and 🗑 Delete space sit on one line.
- **🕘 History: a filter box** over the steps ("space", "Memes $400"): only the steps whose names or places have those
  words show, with how many ("3 of 40 steps"); ↓ goes to the first one, `Esc` shows them all again.
- **🔍 Find looks in a board-game space's buttons too** (a slide it shows, a question it asks, a host note), and a space
  or zone found by its notes says which one it is ("Board game › Space “Lava pit”").
- **▶ Play's pre-game screen: two columns on a laptop too** (from 1200 px wide, so 1280×720 and 1366×768): the
  players and phone buzzers on the left, ⚖ Game rules, 🖥 Display and 📺 On stream on the right, so the display choice
  is in view without scrolling. Single window has its 🖥 icon like the audience window's 📺, and the Players card's
  note is shorter.
- **Ctrl+Enter starts the game** from anywhere on the pre-game screen (a name being typed in keeps its typing); Start
  game ▶'s tooltip says so.
- **Players sharing a name are pointed out** under the player list (before and during the game), as viewers can't tell
  them apart on the scores. A name left blank shows "Player 2" (what it plays as) in its box.
- **A board's Daily Doubles not placed yet are a note, not a warning**: Start game places them at random, so a new
  board's checklist line says only "Jeopardy!: 30 clues to finish" (not "…, 1 more to fix"), and the note reads
  "1 Daily Double not placed yet (Start game puts it on the board at random)". The pre-game ⚠ checks still list it,
  with 🎲 Place now.
- **⚙ Settings in a browser**: one line on how saving works there, instead of a Saving and an Autosave section that
  each only said "this is a desktop app setting".
- **RPG rounds: the host panel's list of objects shows which are selected** (outlined in yellow, with "2 selected: they
  drag with the selected players · Clear" over it), and Shift+click (or Ctrl+click) there selects or unselects one, as
  on the stage; a plain click still opens its card. In a single window, where the stage doesn't ring them (viewers see
  it), this is where the selection shows.
- **RPG rounds: in split view, the selected players and objects drag together across the panes**: dragging one moves
  the selected ones on the other party's screen too, by as much, as one undo step (before, only the ones on the dragged
  one's screen moved).
- **RPG rounds: more feedback in the host panel.** ✂ Split off selected says who the new party is and that the pad moves
  them now ("Cy & Dee are Party 2 now: the pad moves them"); ▦ Split view with everyone on one screen says it shows each
  party's screen once they're apart; an object's card opening below the fold of a short host panel scrolls into sight.
- **RPG rounds: a look's undo step says so**: "Village: look “On fire”", "Village: original look", "Village: new look
  “On fire”" (before: "Village: On fire", "Village: the original look"). The look menu's last choice is ＋ New look…
  (its tooltip and question say it starts as a copy), and in a narrow host panel "or drop a picture on the stage" moves
  into ✏ Draw's tooltip, so the movement pad and minimap sit a line higher.
- **What viewers see, polished**: the 📱 join code on stage is in the board's fonts (the code in the value color, as
  on the Starting soon card), like the clue caption across from it; a clue's slide dots are bigger, to count on a
  scaled-down stream, and level with the caption; the end screen sits in the middle of the stage (a game of two no
  longer leaves the bottom half empty) and, with 7 or more players, shrinks only as much as the last place needs; the
  Final's category is in the game's clue font and color (🎨 Theme → Clue text) like its question and answer.
- **RPG rounds: selected players and objects drag together** on the stage. Shift+click (or Ctrl+click) an object to
  select it (a plain click still opens its card; Esc takes the selected objects off, then the players); click avatars to
  select them as before. Dragging any one of the selection moves all of it on that screen by the same amount, keeping
  their places, and stops where the first of them would leave the screen (avatars stay clear of the stats strip), so
  the group keeps its shape. One drag is one undo step ("Move Ann, Bob & Chest"), and the viewers' screen follows. Dropped
  on another screen, a party or a way out, the selected players go there as before (objects stay on their screen).
  Dragging something that isn't selected moves just it, and it becomes the selection. A dragged object now stays wholly
  on its screen, as avatars do. With someone selected, picking a screen on the minimap no longer makes the map jump
  (both clicks of a double-click land on the same screen again).
- **🎨 Theme page, tidied**: a bar at the top (it stays in view as you scroll the settings) says which theme the game
  uses and holds the save buttons; the cards are headed **Built-in themes** and **My themes**, each with a **⋯** menu;
  an empty My themes says how to fill it; the share buttons sit in two labelled rows (This theme / Bring one in); the
  Board section's pictures line up and both have the same ✕ to remove them, with no gaps between its settings; and the
  long notes are shorter. **💾 Save as my theme…** is now **💾 Save as new theme…**, and the saved theme becomes the
  game's theme.
- **Board games: the host panel's main button follows the turn**: 🎲 Roll (`D`), then ▶ Move (`Enter`), then Next
  turn ▶ (`N`). **◀ Previous turn** (`Shift+N`) is right beside it in the same place, no longer up in the corner under
  the timer, both under the stage and in the column beside it. The round's own Roll and Move buttons are quiet ones now.
- **Host panel, buzzer mode**: the buzzers' own things (how they stand, "🔔 Al (Red team) buzzed", ⏭ Skip, → Next in
  line, the buzz order and ↺ Reset buzzers) have a row of their own above the Amount row, always the same height. The
  panel (and, in a single window, the stage viewers see) no longer changes size as people buzz, miss or tie, or as the
  host steps through a clue's slides.
- **A Daily Double with several question slides**: **Next slide ▶** stays the main button until its last slide, even
  though its player is already picked (＋ Award was lit from the first slide). Then ＋ Award is, as before.
- **Viewers see where a clue with several slides is**: small dots at the foot of the stage (● ● ○), until the answer
  shows.
- **The Daily Double wager screen keeps still**: "Ignore the limit" sits next to the wager box, and the phones' line
  (📱 waiting…, 📱 from phone · sent by Al) is there from the start, so nothing moves or grows as a player is picked or
  a phone sends the wager. True Daily Double is greyed out until a player is picked (it said "$0" before), and the
  status line says "Daily Double: who found it, and their wager" (it ended in a lone "·").
- **One main button while the panel asks**: with "Leave this round?" (or Exit's question) up, its answer is the only
  lit button; the main button beside it goes quiet.
- **Board games**: rolling the round's own dice (D) no longer turns the main button into the dice's Close: moving (▶ Move,
  Enter) is next, and the main button stays the round's.
- **Beside the stage** (RPG and board-game rounds): the round's how-to goes under its name and the 📱 / ⏱ chips (one
  line less), and Amount, ＋ Award and − Deduct fit on one line.
- **On a narrow window** (about 1180 pixels or less) the fixed bar's and the action row's buttons are a little smaller,
  so 🚪 Exit stays at the right of the bar instead of wrapping under ↶ Undo.
- **The Final's wager screen says why someone sits out** when it's their score ("sits out: no points to wager (tick to
  let them play)").
- **⌨ Keyboard shortcuts** lists Enter in the Daily Double's wager box (show the question) and in the Final's wager
  boxes (the next wager to type, then show the question).
- A board game's history says "Ann’s turn" with the same apostrophe as everywhere else.
- **Phones, polished**: a long player name wraps onto two lines in the list instead of being cut off; the team name
  form says who is on the team already ("On it: Ann, Al"); a phone waiting for the host to let it in has a **Cancel**;
  "The game is over" offers **Join another game**; a locked wager says "Your wager: $1,300" (or "None sent: the host
  decides"); the max that isn't held to says "(the host may allow more)" instead of "(not enforced)"; and the line
  above the wager box says what's on screen ("Daily Double — you're up!", the Final and its category).
- **The phones say the Final's category** ("Final Jeopardy! · US Presidents") from its wager screen on, as the
  screen does.
- **The 📱 list says how many phones are still on the join screen** (not a player, or not on a team, yet), and with
  Teams the 📱 chip reads "3 people · 2/2 teams" instead of "3 on 2/2".
- **Theme page tidied**: in the folding sections a tick or a color box now lines up with the box or slider beside
  it, the controls column is a little wider, Score plates has its own **↺ Plain score plates**, the banner height
  slider shows its number, and the glow size hint says what to do ("turn on Tile glow (in Colors) first"). The history
  says "Theme: alternating tiles checkerboard" instead of "Alternating tiles: checker".
- **A warning when the category names are hard to read**, like the one for the values: a category color, the
  alternate one or a gradient too close to the names' color says so (under Colors and Categories). The values' warning
  now counts the tiles' gradient too, and shows under Tiles as well.
- **Clues with many slides keep their tabs on one line**: past four question slides the tabs read Q1, Q2… (a screen
  reader still says "Question 1"), and with more than one the answer's tab reads just "Answer". Find and the history
  call the first slide "Question 1" when there are more.
- **The slide tabs work from the keyboard**: they're one Tab stop; ←/→ (Home/End) go along them, and on a question
  slide's tab Alt+←/→ move it, Ctrl+D duplicates it and Delete deletes it (a note says so; Ctrl+Z brings it back).
  🗑 Delete slide is red like the other delete buttons.
- **A theme preview fills its window on a short screen**: Import theme… and Paste theme code… show the board 16:9,
  without black bars beside it.
- **The Final goes straight to its wagers**: there's no "Lock category, take wagers" step any more. When the Final
  starts, its category is on screen ("Make your wagers…") and the host panel shows one wager screen: a row for each
  player with a tick for whether they play (players at $0 or less are ticked out when the round says so) and their
  wager box beside it. Ticking someone out takes their box away; ticked back in, their wager is still there. With
  nobody ticked in, the main button goes on to the next round. The wagers stay secret in the audience window as before,
  and in a single window the warning that viewers can see them stays.
- **Wagers aren't held to the max unless you want them to be**: "Ignore the limits" on the Final's wager screen and
  "Ignore the limit" on a Daily Double are now ticked to begin with, so a wager over the player's score (or the round's
  top value on a Daily Double) goes through. Untick it to hold wagers to the TV max. Players at $0 still get a $0
  wager filled in for the Final, which you can change.
- **A Final wager can still be changed after it's typed**: on the wager screen, and in the reveals until that
  player's wager is shown (or they're judged), each row's wager is a box you can fix. Each change is a step in 🕘
  History that says from what to what ("Ann’s wager: $500 → $300"); after the reveal, fix the score as usual. The
  wager now remembers whether it came from the host or from the player's phone, ready for phones to send their own
  wager later (a 📱 next to it then).
- **The host panel has one layout in every round**: what's going on at the top (with the 📱 and ⏱ chips and ↩ Cancel
  (keep tile) on the right), the players, the row of what this moment needs, then the tools with the round navigation
  at their right, and a fixed bar at the foot that never moves: ↶ Undo ↷ Redo 🔊 Sound ⌨ · 📜 Log 👥 Players ⚖ Rules ·
  ⏸ Cover 🙈 Hide · 📺 Audience ▭ · 🚪 Exit. Undo, Log and Exit are in the same place on the board, in a clue, a Daily
  Double, the Final, RPG and board-game rounds and the end screen.
- **One main button at a time, always in the same place**: the next step is the one blue button, at the right of the
  action row, with its key on it (👁 Reveal answer `R`, ▦ Done ▶ board `Esc`, Show question ▶ `⏎`, Spin! `W`, Roll!
  `D`, Next turn ▶ `N`, the Final's steps `N`, ❓ Tiebreaker clue on a tied end screen). In a clue it goes 🎲 Roll for
  it (a buzzer tie) › 🔔 Open the buzzers › 👁 Reveal answer › ▦ Done ▶ board; while someone is answering, the green
  ＋ Award is the main one. ＋ Award and − Deduct show their keys (`⏎`, `⇧⏎`) too.
- **Questions that ask first are one strip above the fixed bar**: Exit, closing the audience window, leaving a round,
  🔁 Rematch and finishing the Final with players unjudged. Cancel is on the left with the focus on it, the answer on
  the right (red when it can't easily be taken back, as Leave, Close it and Rematch). The same order everywhere a
  question is asked in the app.
- **Leaving a round is a quiet button that always asks**, also from an RPG or board-game round ("Leave Adventure?"),
  where Next round ▶ used to be blue and went at once. A played-out board's Next round ▶ is the main button instead.
- **The Final keeps the panel under the stage** on a wide window (it fits); only RPG and board-game rounds put it
  beside the stage, where the fixed bar is a two-column grid with 🚪 Exit in its bottom-right corner.
- **Buzzers**: 🔔 Open the buzzers is the main button while they're closed; ⏭ Skip, → Next in line and the buzz order
  come after a divider, and ↺ Reset buzzers is last, a quiet button after another one. A tie says it once: "Tie: Ann &
  Bob · 🎲 Roll for it, or pick one" (not "Buzzers open" as well), with 🎲 Roll for it as the main button.
- **On the board the Amount row is folded** behind **± Adjust score** until a player is selected (pressing their number
  opens it too).
- **Labels**: 📺 Audience (📺 Audience ● while the window is open; closing it still asks), 🙈 Hide (for Hide controls),
  and ⏸ Cover turns into a filled orange **▶ Uncover** while viewers see the cover. ⌨ moved to the fixed bar.
- **A wheel or dice tile with nothing to ask** has one way out, the tool's **Close ▶ board** (`Esc`); it no longer shows
  ▦ Done ▶ board, ✔ / ✘ or "Pick who answered" with nothing to judge.
- **The end screen**: on a tie, settling it (❓ Tiebreaker clue, or 🎲 Tiebreaker roll-off when there's no tiebreaker
  clue) is the main button; ◀ Back is quiet on the left and 🔁 Rematch at the far right, away from 📋 Copy standings.
- **Show controls** (with the controls hidden) waits in the top-right corner, off the score plates.
- **The editor and its windows look and work the same everywhere**:
  - Every window's buttons go the same way: **Cancel** on the left, the main answer on the right (💾 Name your game:
    Cancel · Save; Start a new game?: Cancel · Discard · Save first; Import clues, Import rounds, Edit image, Drawpad
    too). Questions the app asks now have a title (the question itself), with the details under it.
  - Windows share one look: the same title, padding and corners; **Browse…** in Open… moved to the bottom, by Cancel.
  - Every page starts the same way: its title, one line about it, and its buttons on the right. A round's page is
    titled with the round's name, its mode beside it ("🟦 Jeopardy board"), and Move up / Move down / ⧉ Duplicate round /
    🗑 Delete round at the same size as other page buttons. Pages of settings and lists stop at a readable width on a
    wide screen; boards and maps still fill it.
  - Deleting looks the same everywhere: a red **🗑 Delete …** button (undoable, or it asks). A filled red button is
    only ever the answer that confirms a delete.
  - Buttons in a row are one size, and a button next to a field is as tall as the field (＋ Add next to Paste a link…,
    ⚙ Settings › Test, ＋ Add world, ×2 / ÷2, 🔀 Randomize, ▶ Start countdown).
  - A focus ring shows only when you use the keyboard, the same accent ring everywhere (fields too). Buttons change
    their background under the mouse (filled ones darken), which never looks like a selected one. Fields and outline
    buttons have edges you can see.
  - Labels sit above their fields: the clue editor's Type, Value, ⏱ Countdown and Tile shows; a board's Row values
    and ⭐ Daily Doubles; a stat's Start / Min / Max; a shop's Charges and Buys back at (%). A shop's stock has column
    headings, and the pre-game player list has one **Start score** heading instead of one per player.
  - The slide toolbar is one height, and the slide's background is one **Background ▾** button (color, 🖼 Picture…,
    ↺ Reset background) instead of BG / 🖼 BG / ↺ BG.
- **Toasts never cover a window's buttons**: while a window is open they show on one line at the top, above it. How
  long a toast stays depends on how long it is (2.5 s, up to 8 s for a long one). The "Deleted … · Undo" note looks
  like a toast, and stays under open windows: an undo or redo made in a window says so in a toast instead. Only its
  buttons take the mouse, so a drag or a click just beside them reaches the page underneath.
- **Icons mean one thing each**: Final Jeopardy rounds are 🏆 (⭐ is a Daily Double), board game rounds are ♟ (🎲 is
  dice), ⭐ Daily Doubles' **🔀 Randomize**, **📥 Import clues…**, **✎ Edit image…**, the board game's
  **🖼 Board backdrop** tab, **🎨 Use my theme**, ⚖ for Game rules in 🕘 History.
- **Same words for the same things**: "＋ Add …" for everything that adds to a list (＋ Add wheel, ＋ Add dice,
  ＋ Add item, ＋ Add shop, ＋ Add map, ＋ Add world, ＋ Add zone, ＋ Add look (a copy)…); **Delete** for what's
  gone (a 🖼 Media file, unused files, a kept game in Open… › Recent games), **Remove** for taking something out of a
  slot; **Discard** for dropping unsaved edits (the drawpad's "Throw away" too); 🕘 History's **🗑 Clear history…**;
  **💾 Store in game** for keeping a copy of a linked file (was "Save a copy"); "Color" spelled the same everywhere;
  every host notes box is **Host notes (never shown on stream)**; the Tiebreaker's tabs are **Question slide /
  Answer slide**; **▶ Move right** like ◀ Move left; ⌫ Clear its clues like ⌫ Clear clue; 🔊 Sounds' link to the Play
  screen is **▶ Play**.
- **The pre-game screen's parts look alike**: 👥 Players, 📱 Phone buzzers, ⚖ Game rules, 🖥 Display and 📺 On stream
  are cards with the same heading. A player's picture has its ✕ on its corner (no gap in rows without one).
- **The sidebar's checklist is grey** when it only has notes (orange when something needs fixing), and a new game
  shows 🤝 Tiebreaker only once it has a round.
- **A points symbol that's a word goes after the number**: "200 pts" and "−300 pts" instead of "pts200", with a
  space; $, €, £, R$ or an emoji still go in front ("$200"). The same everywhere, the phones too.
- **Scores too long for their plate are shortened** on the score bar ("$999.9M", "−1.2B pts"), never cut off in the
  middle ("$999,999,…"), and never rounded up. The host panel shows the whole number.
- **Row values are whole points, 0 or more** (like a clue's own value), and the host panel's Amount and a score typed
  in are whole points too (2.5 becomes 3), within a trillion either way.
- **A Jeopardy Builder game with Final Jeopardy switched off keeps it** when something is written in it (a category,
  a question, an answer or a picture): it's the last round, and the checklist says so, so you can delete it. An empty
  one is still dropped.
- **A player left with no name** (blank, only spaces or invisible characters) is called "Player 1", "Player 2"… when
  the game starts, instead of an empty plate.
- **A picture added to a clue's question no longer lands on its text**: with only the question on the slide, the
  picture goes in the upper part and the question's text box moves into a band under it (one undo step). With more on
  the slide, it goes beside, above or below the text where it fits best. (A picture dropped at a spot still goes there.)
- **Dropping a picture on a tile in the round editor asks where it goes**: "Put it in the question" (the default,
  Enter) or "Use as the tile's face" (shown on the board instead of the value until it's picked). Before, it always
  became the tile's face. The tip under the board says so.
- **Go to round asks first when clues are left**, like Next round ▶ does ("12 clues left · go to Double Jeopardy!?");
  Cancel puts the list back on the round being played.
- **The Final's player reveals**: the main button is the next step (Show wager ▶, then Next player ▶, as N does) until
  everyone is judged, and only then Finish game ▶; finishing early is still there as a smaller button (and still asks).
  The how-to above the players is open the first time on a computer, folded after that.
- **🔁 Rematch asks first** ("Start a rematch? Scores go back to 0."), as 🚪 Exit does.
- **After a wheel lands or the dice come up, Close is the main button**, and Spin again / Roll again a plain one.
- **The host panel's own buttons stay in one place**: 📜 Log, 👥 Players, Rules, ⏸ Cover, 🙈 Hide controls, 📺 Audience
  window, the scores window and 🚪 Exit sit together at the bottom right in every state, so they no longer jump to
  another row on a Daily Double or as the window narrows.
- **📋 means Copy standings everywhere**: the end screen's "📋 Copy results" is now "📋 Copy standings", as in 📊 Scores,
  and the host panel's rules button is "⚖ Rules" (Game rules is ⚖ on the pre-game screen too).
- **The same words for the same things**: the round intro and every title card say "click the screen or press N to
  go on"; the Final's name field is "Round name", as on a board.
- **"Show the screen's name in RPG rounds"** on the pre-game screen only shows in a game that has an RPG round.
- **A wrong answer goes to the next in the buzz order**: with phone buzzers, the next player who buzzed (and hasn't
  missed the clue) answers at once, instead of the buzzers opening again for a later buzz to jump the queue. The
  buzzers only open again for the rest once everyone in the order has had their go. A phone that's out of the clue
  says who's answering instead of its old place in the order.
- **Daily Doubles placed by hand raise the ⭐ Daily Doubles count**: making a fourth tile a Daily Double (from the
  tile's menu or the clue's Type) sets the box to 4, so it never says fewer than the board has. When it's lowered
  below what's placed, the checklist says so (they all still play).
- **A game with only a title, a theme, rules or sounds changed counts as work**: New and Open… ask first, as for any
  game with unsaved changes, and keep it in Open… → Recent games. Before, it was replaced without a word.
- **A new row gets the board's usual step**: Insert row and the Rows box now add the same value (the step most rows
  go up by), where they used to add different ones on a board with uneven values.
- **Insert category left or right names it "New category"** instead of a number that doesn't match where it went
  ("Category 8" in first place). Added at the end, it's still the next number.
- **🕘 History is one Tab stop**: Tab goes to the step the game is at, and ↑/↓ move between steps, instead of Tab
  stopping on each of up to 300 steps. **Go there** (or **G**) also puts the focus where it went.
- **Clearer step names in 🕘 History**: "Made Memes $400 a Daily Double" and "Left Memes $400 empty" name the tile,
  "Changed Memes $400 to $750" names the clue by the value it had, a category's picture taken off is "Removed the
  image of category …", and duplicating a round that's already a copy gives "(copy 2)", not "(copy) (copy)".
- **Media's file count** counts only the files this browser has, and says how many more are missing ("3 · 1 MB (2
  more missing)").
- **Category names on a crowded board** (8 to 10 categories) are a little smaller and break between words, not in
  the middle of one; **×2** and **÷2** stay together when the row values wrap.
- **The sound preview in 🔊 Sounds can be stopped**: ▶ turns into ■ while it plays.
- **A sound whose file is missing plays its built-in sound** instead of nothing, and 🔊 Sounds says so on its row
  ("… is missing: plays the built-in sound"). The checklist lists it on its own ("1 sound file missing: see 🔊
  Sounds"), and clicking it opens 🔊 Sounds.
- **Nobody playing the Final**: when every player is sat out, the host panel says "Nobody is playing this Final"
  and its button goes straight on to the next round (or finishes the game), skipping the wagers and reveals.
- **Each Ctrl+Z in the Final goes back one step**: from the player reveals to the answer, then to the question,
  then to the wagers (it used to jump straight back to the wagers). Showing or hiding the Final's answer (R) is a
  step too.
- **The Final's ✔ Right / ✘ Wrong buttons not chosen yet are outlined** instead of dimmed, so they're easier to
  read.
- **A countdown on the board sits at the end of the score bar** (the score plates and the phone buzzers' join code
  make room for it), so it no longer covers the right-most category or the last score plate. With the score bar
  hidden, the board moves down under it while it shows.
- **The audience window opens at 1280×720** (it was 1280×760), so a window capture in OBS or Discord has no black
  bars above and below the stage. So does the window "Open on YouTube" opens.
- **"Host window closed" in the audience window only shows while the mouse is over it**, like the "click once" hint,
  so viewers don't see a red bar across the stream.
- **The ? key list** says Shift+T starts a countdown when none is up, that R reveals (and hides) the Final's answer,
  and that Esc on a Daily Double splash keeps the tile playable.
- **Smaller game files, quicker to open**: Save and Export HTML pack the game's text compressed (pictures and sounds as
  before). A big text-only game's exported HTML went from 7.4 MB to 1.9 MB and opens in about a quarter of the time.
  Older `.brainrot` packs and exported files open as before.
- **Export HTML needs a round**: with no rounds yet it says to add one (＋ Add round) instead of making a file that
  can't be played.
- **Recent games keeps the last 8 games** New and Open… replaced (was 3), as long as their files fit in about 1 GB
  together. When one has to go to make room, the note says so ("Removed the oldest kept game: Quiz"). A game with only
  a title isn't kept (and New doesn't ask about it). Two versions of the same game are both kept, each marked with when
  it was kept ("earlier version · kept …"). (08a9602, 6119c64)
- **Forget** in Open… → Recent games asks first: it deletes the game, its files and its undo history for good. (08a9602, 6119c64)
- **Open… checks the file first**: a file that isn't a game says so without asking "Save first / Discard" about the
  game you have open. (08a9602, 6119c64)
- **Export HTML of an untitled game asks for its name**, like Save does. File names keep words and numbers apart
  ("Part 1/2" saves as `Part-1-2`, not `Part-12`). (08a9602, 6119c64)
- **Big downloads in a browser**: Save and Export HTML of a file over 100 MB ask where to put it and write it straight
  there (Chrome, Edge), so a download that fails can't go unnoticed. Elsewhere the message says "Download started"
  rather than claiming it's done. (08a9602, 6119c64)
- **Desktop app: the window title shows the game's name**, as the browser tab does. (08a9602, 6119c64)
- **Desktop app: closing the window while a save, export or autosave is being written asks** "Wait" (the app closes by
  itself once it's done) or "Close anyway", instead of cutting the file off after 3 seconds. (08a9602, 6119c64)
- **Desktop app: saving and opening big files no longer freezes the window** ("Not responding") while the file is
  written or read. (08a9602, 6119c64)
- Dropping a `.zip` game pack on the editor opens it, as Browse… already did; Open… says it takes `.json` and `.bak`
  files too. (08a9602, 6119c64)
- **Easier to read on a scaled-down stream** (Discord or OBS at 720p/480p):
  - Scores shrink to fit their plates instead of being cut off ("$1,60"), on the board, in the Final and in the ▭
    scores window; long player names stay on one line and end in "…", every plate's name row the same height.
  - A board's values share one size that fits its columns (10 categories of "$1,000" no longer run into each other).
  - Category names stay at 30 stage pixels or more (about 13 px tall at 480p); a word too long for its column is
    hyphenated rather than broken anywhere. Only a name too long for its cell even then goes smaller.
  - The countdown, "🔔 Ann is answering" and the Daily Double badge no longer cover a long clue's first line: the
    question moves down under them while they're up.
  - Score pops stay on the stage (a long name ends in "…", the points always show) and go above the clue caption.
  - The clue caption and the "📱 Buzz in" badge are bigger.
  - Light themes (Pastel): no hard black shadow behind dark words, the score bar no longer fades to black, the Daily
    Double splash has white words on its purple, and the Final's spotlight card and the end screen's rows are dark
    enough for their white words.
  - "Who goes first": players out of the running are dimmed less, and the tiny "d20" on each die is gone.
  - The Pick a player wheel shows initials for a name too long to read on its slice.
  (8bb6edc, 2c772e8)
- **The stats strip never covers the play** (RPG and board-game rounds): the screen or board is scaled into the room
  above (or below) the strip, so no space, avatar or line of text is hidden; past 6 players the strip is one row of
  compact cards (past 9 without the avatar). The board-game checklist no longer warns about spaces under the strip.
  The map on stream is solid, with bigger names; players' dots on the maps carry their initials. RPG nameplates stay on
  one line ("…"), so a crowd of avatars no longer overlaps. (8bb6edc, 8b514bd, 65c0fb7, 253d436, 8ce0d87)
- **New default player colors** that stay apart for colour-blind viewers (deuteranopia and protanopia) for the first 8
  players: red, sky blue, yellow, navy, orange, white, green, pink. Games keep the colors they were saved with. (8bb6edc)
- **The winner's confetti** is a short burst (about 4.5 s) of fewer, bigger pieces either side of the standings,
  never over them; with Reduce motion on stream there's none (it used to stay frozen on screen). (8bb6edc, 2c772e8)
- **The host's board is one Tab stop**: the arrow keys go from tile to tile (it used to be one stop per tile). (8bb6edc)
- **Pre-game player rows line up**: every row wraps at the same place, whatever the name's length. (8bb6edc)
- The editor's header wraps onto a second line at 200% zoom instead of running off the side. (8bb6edc)
- **Slide editor: dragging beside a text box's words draws a selection box** instead of moving the text box (a
  full-slide question used to slide off when you meant to select). Pressing its words, or dragging it once it's
  selected, still moves it; a click beside them still selects it. `Alt`+drag always draws a box (`Alt`+click still
  walks down the stack). (1461bb1)
- **Typewriter is a real typewriter**: the text appears letter by letter over the animation's duration (all at once
  with reduced motion), and picking it suggests a duration that suits the text's length. On a picture or another
  item it's called **Wipe in** (what it does there). Games keep their setting. (08ffde2)
- **The same file added again is stored once**: dropping a picture that's already in the game (on another clue, say)
  uses the one in 🖼 Media, and a toast says so. 25 clues with the same 4 MB picture take 4 MB, not 100. (0fae6a2)
- **The Layers list shows whenever a slide has an item**, so every item can be reached from the keyboard, and its 👁 🔒
  ▲ ▼ buttons say which item they're for ("Lock: cover.png"). (48fd21d)
- **History names**: the slide background's colour and picture ("Slide background color #333333"), a text box's
  outline, drop shadow and glow ("Added an outline to text box …", "Changed outline width of …"), and theme colours and
  fonts by their names ("Theme: tile color, category name color"). Changing one field and then another (a colour
  picker, say) are two steps, not "2 changes". (1461bb1)
- **Hosting a Jeopardy game, smoother on stream** (0c822f7, 35ed3c9):
  - **A group award shows one pop**: "Everyone +$200" or "Ann, Bo & Cy +$200" instead of a pop per player over the
    clue. On the board, one player's pop sits over their own score plate, above the score, on one line.
  - **⏸ Cover pauses what's under it**: the countdown, the clue's video or sound and the sound cues wait while viewers
    see "Be right back", and go on when you uncover.
  - **Resume game asks how the game is shown**: Single window or 📺 Separate audience window, the same choice as
    before the game. A game left with the screen covered comes back covered.
  - **Short sounds overlap**: a right-answer sound isn't cut off by the reveal's (three at most at once).
  - **The board works from the keyboard**: after a clue the focus goes back to its tile, the arrow keys move across the
    board, and played tiles are out of the Tab order (their right-click menu still works). Tiles say "$1,000" and
    screen readers hear "Category 1 for $200, played".
  - **`O` on a tie for first** at the end rolls off the tied players for the win (not "Who goes first?"), and a
    re-roll in a roll-off says "Re-roll!".
  - **The tiebreaker clue's Amount starts at 0**: select the winner and ＋ Award settles the tie without adding
    points (you can still type an amount).
  - **A Daily Double wagered at $0 can be scored**: right or wrong is logged as a 0 result. With no picker set,
    "Who found it?" starts with nobody selected (it no longer quietly picks Player 1).
  - **Single window: 📜 Log (`L`) opens inside the host panel**, never over the stage viewers see (it brings hidden
    controls back).
  - The award row is gone during a Final (its wagers and reveals do the scoring there), and the Final's wagers step can
    be undone: `Ctrl+Z` after the question is up goes back to the wagers, all of them kept.
- **The pre-game screen's Start game ▶ and ◀ Back to editor stay at the foot of the window** however long the page
  gets (an open 📋 Game rules fold put Start game far below the fold). On wide screens (1400 px and up) the page is two
  columns: players and 📱 buzzers on the left; rules, display and on stream on the right. (1d355db, 0ab9a9f)
- **⚙ Game rules is now 📋 Game rules**, so it isn't mixed up with the app's ⚙ Settings next to it. Its fold is a
  heading of its own (screen readers no longer file the rules under 📱 Phone buzzers). (1d355db)
- **🔊 Sounds says at the top where the players and rules went**, with a button to the ▶ Play screen (it was a small
  line at the bottom). (1d355db, 0ab9a9f)
- Adding players by typing a name and pressing `Enter`: each player added and named is one step in 🕘 History,
  called by the name typed ("Added player “Bo”"), and undoing it no longer takes back the name typed before it. (1d355db)
- **Reduce motion on stream** is also on the pre-game screen's On stream section (the same setting as ⚙ Settings), so
  an exported game file can use it too.
- **The movement wheel spins on the first press** of 🎡 Spin to move (or `D`) in a board game, instead of opening it
  first. (0ff069a)
- **Big RPG worlds**: the viewers' map (`V`) shows only the screens they know about, with one cell around them, so
  the cells stay big enough to read; on a map hidden from viewers it says "This map is hidden from viewers" instead of
  showing another map. The host's minimap shows the 7 × 5 screens around the party on a big map (⤢ Full map has the
  rest), and is one Tab stop: the arrow keys go from screen to screen. (0ff069a, 607c435)
- **Hearts on the stats strip** show as "♥ 7/10" once there are more than 5 of them (10 with up to three players),
  so a long row of hearts no longer pushes the gold under the next card. (0ff069a)
- **✂ Split off selected** won't put everyone, or players standing in different places, into one party: it says to
  🤝 Regroup, or to split off players standing together. (79dbf8e)
- **Enter in a board game**: at a fork it says to pick the way first; with a player selected and no amount typed, it
  moves (as it does with nobody selected). (0ff069a)
- The turn order's ◀ ▶ buttons say whose they are ("Ann later in the turn order") to screen readers. (0ff069a)
- **Board game editor keys work like the RPG map's.** The arrow keys go to the nearest space that way (they used to move
  the spaces); `Alt`+arrows move the selected spaces (`Shift`+`Alt` further). `Tab` no longer walks the spaces: the board
  is one `Tab` stop, and `Enter` opens the space's settings. While linking, the arrows and `Enter` pick the space to
  link to. (d61f2e5)
- **The board game's movement dice are linked to the dice themselves**, not their name: renaming them in 🎡 Wheels &
  Dice keeps them. Games saved before link up by name when opened. (8e0766c, d61f2e5)
- **Enter in a category's name** goes to its top tile (`Shift+Enter` starts a second line), and a new line left at the
  end of a name is dropped. (d61f2e5)
- **＋ buttons put the typing in what they add**: ＋ Item, ＋ Shop, the stat presets and ＋ Custom stat, ＋ Zone, a
  character's ＋ Stat and 🧙 Character (its name), and ＋ Add button (its first setting). (d61f2e5, ad6b92d)
- **`Alt`+drag on the RPG map draws a selection box from anywhere**, on a map full of screens too (as in the slide
  editor). A plain drag still moves or swaps screens. (ad6b92d)
- **Import clues… keeps what you pasted** when it's closed (Esc, ✕ or Cancel) until the next time it's opened on that
  board, and a click outside no longer closes it. Importing says so once, with Undo, at the board. (d61f2e5)
- **Clearer step names in 🕘 History**: switches say what they did ("Locked “Doorway”", "Made “Space 3” secret",
  "Showed how to win on the board of “Race”", "Set round “Jeopardy!” to 2 Daily Doubles") instead of field names, and a
  round from a template is named after the round ("Added round “Jeopardy!” (Classic board, 6 × 5)"). (8e0766c,
  d61f2e5)
- **Checklist wording**: "1 doorway(s) lead nowhere" is "the doorway on “Cave” leads nowhere", and so on. A board
  game's single end (a race's Finish) is no longer listed as a path that ends; two or more ends are. (8e0766c)
- **A wheel slice's weight** is named after its slice for screen readers ("Option 1 weight") and is never 0 or less
  (blank is 1): a slice no longer silently drops off the wheel. (8e0766c)
- **Big RPG maps show screen names**: a narrow cell shows a default name as its cell ("B3") and wraps other names onto
  two lines, instead of "Scr…". (ad6b92d)
- **A crowd on one board space stands in rows**: more than 8 players on a space stand in rows of smaller tokens over
  it, and tokens at the board's edges move in, so none goes off the side, onto the next space or under the turn
  banner.
- **Score → currency converts only what fits** under the currency's Max: the rest stays as score, and a note says so.
  Before, the points over the Max were taken and lost.
- **The last player can't be removed mid-game**: its − in 👥 Players is greyed out (a board game showed "?"'s turn
  with nobody left). Before the game, the list still needs one to start.
- **🎨 Edit image › Apply keeps the picture about the same size**: the new shape with the same area, centred where it
  was (a quarter turn just swaps its width and height). It used to shrink into the old box, a little more with every
  Apply. **Use original** goes back to the size it had before it was first edited.
- **🎨 Edit image: captions, stickers and drawing stay on the picture** through a crop, ⟲ / ⟳ 90° or a flip (they
  used to stay put on the frame, over another part of the picture), and show while cropping. Pictures edited before
  look just as they did.
- **🎨 Edit image: ⟲ / ⟳ 90° turns the crop with the picture** instead of dropping it.
- **🎨 Edit image: the chosen tool's options come first** in the side panel (🖌 Draw's brush and the stickers were
  out of sight on a 720p screen), and Adjust's eight sliders are folded until opened.
- **A box dragged on the question text selects what's on it**, not the full-slide text box as well (a box reaching
  past the text's edge still takes it).
- **Delete and Backspace remove the selected items only from the slide, the page or the Layers list**: with the focus
  on a side-panel button they do nothing.
- **Nudging with the arrow keys and Duplicate keep some of the item on the slide.**
- **Right-to-left text** (Arabic, Hebrew) lines up the right way in text boxes, the slide text field and the clue's
  Question and Answer boxes.
- **Phone buzzers are harder to cheat**: the room now times each phone's connection itself with its own probes and
  counts a low sample, a slow connection counts as 350 ms at most (was 1 s) and the slack for jitter is 70 ms (was
  150 ms). A phone that lies about its reaction time can now gain at most about 0.4 s (it was over 1 s). The price: a
  player whose connection really takes over 0.4 s there and back loses the part beyond that.
- **Phone buzzers wait as long as the slowest phone needs**: after the first buzz, the room waits for buzzes still on
  their way as long as the slowest connected player's connection takes (a quarter second to 0.8 s), instead of always a
  quarter second, so a faster reaction on a slow network isn't lost.
- **Phone buzzers: a buzz whose connection was slower than expected** counts a little later by just that much, instead
  of jumping back to its arrival time (a 0.15–0.9 s penalty before).

### Fixed
- **Jeopardy board: clicking a category's made-up name ("Category 3", "New category") selects it**, so typing replaces
  it instead of making "Category 3Memes". Names of your own keep the caret where you click.
- **🕘 History: changing a board game's Start or a space's links from the editor's boxes** is named for what it did
  ("Made “Space 4” Start", "Connected Space 3 → Space 7") instead of "Changed start of round" or "Changed links of …".
- **Start game ▶ stays at the right end of the pre-game bar**: with a note beside it (no players yet, a Daily Double
  not placed), it dropped onto a line of its own under ◀ Back at 1280 px. The notes wrap in their own room now.
- **RPG rounds: hovering an object on the stage no longer covers it with a dark box** (the buttons' hover colour): it's
  only outlined, so viewers watching a single window don't see objects vanish under the host's pointer.
- **RPG editor: a screen's default name on the map shows its space again** ("Screen B1", not "ScreenB1").
- **Viewers no longer see the join code where nobody can buzz**: it's gone over a Daily Double (only who found it
  plays) and under a wheel, dice or roll-off on screen (it showed through their backdrop); the score plates keep their
  place meanwhile.
- **The Final's ✔ marks no longer cover the scores**: with many players a "wager in" ✔ sat on the score's digits; it
  now sits over the top edge of the plate.
- **The end screen no longer pushes places off the bottom**: a long heading (a tie of two long names) took three lines
  and the last place went off screen; it shrinks to fit two lines at most now.
- **A roll-off for many players stays on the stage**: "Who goes first" with 12 players ran off the top and bottom of
  the stream; the dice and names get smaller (a long name ends in "…"), and the result line's room is kept from the
  start, so the dice no longer jump up when it comes.
- **Slanted fonts' last letters are no longer cut** on the score plates and in "… is answering · Ann" (Brainrot
  Neon's "CAT" read "CA1").
- **Edits made just after New or Open… are no longer lost**: while the old game was being kept in Recent games (a
  moment on a slow disk), the editor still showed it and took edits, which then vanished when the new game arrived.
  The editor waits for the new game now.
- **Editing several wheels at once no longer pushes the host panel up over the stage**: with a wheel added beside the
  first (＋ Spin another wheel too), both edit boxes could be open together, and the panel's lower part grew upward
  past the stage where it couldn't be scrolled (the window had to be made taller to get out). One wheel's edit box is
  open at a time now, and a panel that runs out of room scrolls in its place, under the stage.
- **A wheel or dice can be closed before it's spun or rolled**: a quiet ✕ Close in its row (Esc didn't work while
  typing in its edit box).
- **🎨 Theme: a saved theme put on a game is the one marked**, not the built-in theme it was first made from: editing
  it no longer shows "Classic (edited)" as the chosen card. The game remembers which theme it came from (a built-in one
  or one of My themes) and the page marks exactly that card, with "· edited" once you change it. A built-in theme you
  changed is outlined dashed as where it started, not shown as chosen. Older games are matched as before (a theme that
  looks exactly like a built-in or a saved one shows as that one).
- **The check for a newer version at start-up now really asks each time**: it went by what GitHub had said in the last
  six hours, and with a new version out every push, a start soon after a check (while that was the newest) never
  heard of the ones after it. Every start asks now (one small request), going by the last answer only when GitHub
  can't be reached, and ℹ About says when it last checked. It also starts before the game finishes loading, so nothing
  slow there holds it up.
- **✔ / ✘ on a player chip** no longer drop the keyboard focus (the button greys out once pressed): it goes on to the
  main button.
- **＋ Award and − Deduct, greyed out, say why** in their tooltip ("Pick who answered first (1–3)", "Type an amount
  first").
- "Who found it?Pick a player." on the Daily Double screen has its space back.
- **A wager stays secret from someone who joins late**: with the room's code, anyone could tap a free seat, or join a
  rival team under another name, during a Daily Double or a Final and read the wager the host or the team had in. A
  phone that takes its seat (or joins its team) after the wagers began is now only told that one is in, and sees just
  what it sends itself. (The buzzer server has to be updated for it.)
- **Teams: someone moved to another team after buzzing** can't buzz again for their new team on the same clue.
- **"You were first by 0.00 s"** no longer shows on the phone of a player answering because a faster one missed or
  passed; it says "Say your answer".
- **Phones with the keyboard up**: on a small phone, opening the wager box's keyboard could switch the page to its
  landscape layout and squeeze the name and score into a sliver; the box now stays in sight above the keyboard. In
  landscape, the wager box fits beside the name and score, and a long clue's category line is no longer cut off.
- **A wager sent as the phone lost its connection** no longer says "Sending…" for good: the phone says to send it again
  if it doesn't show ✔ Sent once it's back.
- A phone told it was taken off a seat no longer keeps that note when the host turns Teams on (and the other way).
- **A .brainrot-theme file opened with Open… or dropped on the editor** did nothing (or said it wasn't a game): it now
  opens 🎨 Theme and shows the theme first, as 📂 Import theme… does.
- **Color boxes showed black for a theme color written another way** (rgb(), a color name or #abc, as a theme code or
  file can have): they show the color itself.
- **Pill score plates cut long names** at their round ends: the name and score stay clear of the corners.
- **Pop-ups are always whole on screen and on top**: the 📱 phones list could run off the top or the bottom of the
  window, or be cut off by the host panel as if hidden under the stage (when the window was resized, or the panel
  scrolled), and beside the stage (RPG and board-game rounds) it hung over the stage viewers see. It now drops from its
  chip inside the host panel in a single window (scrolling if the list is long), over the stage's preview only with an
  audience window, and follows the chip as the window or the panel changes.
- **The same for every other pop-up**: 🎲 Dice / 🎡 Wheel / 🏁 Who goes first in the host panel; in the slide editor
  ◼ Shape ▾, Background ▾, 🌐 Link and the 🖼 Image / 🎬 Video / 🔊 Audio pickers (and every other "choose a
  picture / sound" picker in the editor and on the pre-game screen); and the ⋯ More, ＋ Add and right-click menus.
  Near the window's edge they move in, flip above their button when there's more room there, and scroll inside on a
  short window, instead of running off screen or behind the panels.
- **Exit and closing the audience window no longer squash the host panel**: their question pushed the panel's
  buttons over each other; it's now a strip of its own.
- **📱 The phones list opens in sight in a single window**: it opened upward, hidden behind the stage. It opens
  downward over the host panel now (which makes room for it), never over what viewers see.
- **📜 Log in a single window**: the 🎲 Dice / 🎡 Wheel / 🏁 buttons no longer show through it.
- **A double-click on Start game ▶ no longer opens the audience window**: the fixed bar ignores clicks for a moment
  after the screen changes.
- **Score chips keep their width** when a player is marked ✔ / ✘ on a clue, so the buttons beside them don't move.
- **The Daily Double's splash names the player you pick** at once (it kept showing the picker until Show question).
- Links in the editor (ℹ About) are a readable blue, and 15 px / 18 px text is gone from the editor (one type
  scale).
- **A game with a category short of clues opens**: a hand-edited game where a category had fewer clues than rows
  (or none) broke the editor after half-opening. The missing tiles are added empty (a longer category gets rows added),
  and a game the app still can't show is refused before it replaces yours.
- **A damaged `.brainrot` says so**: a pack whose game can't be read whole says it's incomplete (it said "Bug :
  uncompressed data size mismatch"), and a damaged picture, video or sound in it is left out, so the game opens with
  that file listed as missing in the checklist instead of a broken one.
- **Game files open whatever their name says**: a game saved as `.brainrot`, a pack named `.json` or an exported page
  renamed opens by what it is. An exported page cut off before its game says it's incomplete (it said "no game
  inside").
- **Playing in one window on a small or zoomed screen keeps the stage in sight**: the page no longer scrolls (the
  board went up out of the window with 12 players, and opening a clue scrolled it further). The host panel scrolls
  itself instead, the player list first, so its buttons stay in reach.
- **Right-to-left names** (Arabic, Hebrew) keep their first word when they're shortened on the score bar, the host
  panel, the player list and the phones.
- **Very long names and titles fit**: an 80-letter name ends in "…" in the host panel instead of widening it past the
  window, and a long one-word title wraps on the pre-game screen instead of scrolling it sideways.
- **The start score box is wide enough** for a 7-digit score (12400 showed as "1240").
- **A countdown saved below 1 second** in a hand-edited game ("Start -5s") is 1 second; a hand-edited list of rounds
  with a blank in it opens instead of showing an error.
- **📜 Log › Scores and 🕘 History rows no longer overlap** when a long entry wraps onto a second line.
- **New, then Open… or New again straight away, asks before replacing the game**: a title typed into a new game in
  the moment before its undo history started wasn't counted as a change, so it could be replaced without asking.
- **Exit closes the audience window** (and the scores window), also after the host page was reloaded (it no longer
  had a handle on the window) and in the desktop app, where closing it from the page doesn't always work.
- **Reopening a recent game keeps the files its undo history needs**: ↶ Reopen previous game (or Open… → Recent
  games) could delete a file that had been removed, so undoing that Remove brought it back as "missing". Forgetting a
  game in Open… no longer deletes files the open game's own undo history can bring back either.
- **🔗 Find missing files… is one undo step**, "Reconnected 2 files": Undo makes them missing again. Each file keeps
  its own name (it was renamed after the file picked, as a "Renamed file" step), and a file found under exactly its own
  name is a step too.
- **💾 Save a copy is one undo step**, "Saved a copy of “…”": Undo makes it the online link again and shows the
  picture from the link (it used to keep showing the saved copy, and called the step "Changed size of file").
- **Closing the clue editor goes back to the tile it ended on** (after Ctrl+Enter or ◀ Prev / Next ▶), not the tile
  it was opened from.
- **A clue's ⏱ countdown is whole seconds**: a negative number or a fraction no longer gives the host "Start -5s";
  blank still uses the game's default and 0 means no countdown. **A clue's Value can't be negative** any more.
- **Delete and Esc on the Media page work with the focus on a card's Select checkbox.**
- **The note after replacing a game** has a space between "…Recent games." and "Removed the oldest kept game…".
- **A reload (or a closed tab) right after a change no longer loses it**: the autosave started as the page goes away
  didn't always finish, so a round added a moment before a reload could be gone even though the header said
  "✓ Autosaved". A copy is now written instantly as the page closes, with its undo history, and comes back on the
  next start (3400acf). A reload within a second of typing no longer leaves a change in the game that undo then redo
  would lose, or wipes the undo history.
- **Two tabs no longer both play the same game**: when another tab takes over ("Edit here instead") while a game
  is being played, the first tab saves it and stops, showing "This game is open in another tab"; the phones stay in
  the buzzer room. Resume game in the other tab carries on from where it was left, not from an older copy.
- **A wager typed in during the Final's reveals keeps to the max** (unless "Ignore the limits" is ticked), and its
  box shows the max. Final wagers are whole numbers: a fraction is refused, in the reveals and in the wager boxes.
- **Coming back to a Final keeps the players you sat out** (and any you ticked in at $0): only players you didn't
  choose are checked again by their score, so someone new to it still joins.
- **A player ticked back into the Final goes back to their place** in the reveal order (lowest score first), not
  to the end.
- **The desktop app keeps the save before a replaced one**: if the app stopped right after a Save, before the
  older save became the `.bak`, it's now made the `.bak` later instead of being cleaned up as an unfinished save.
- **Screen readers**: each sound's Choose file… / Change… button names its sound; a switched-off sound's name is
  muted but still readable (it was too faint); Stats & Items has no empty lists; the editor, the pre-game screen and
  the game screen each have a main part under a heading with the game's title; the phone buzzer's Buzz and waiting
  screens have a heading.
- **Controls hidden with H hide again after a list**: ?, L, 👥 Players or 📋 Rules brings them back and
  closing it hides them again, instead of leaving the host panel on stream. A Daily Double's wager and the Final's
  wagers bring them back too (typed digits used to select players behind the hidden wager box), and they hide again
  once the wagers are in.
- **The Final's wagers start in the first wager box** still to fill, as a Daily Double's does, so a wager typed at
  once can't land in the ⏱ seconds box (where Enter started a long countdown). N with wagers missing or over the max
  now says whose ("Waiting on: …") and goes to that box, instead of doing nothing.
- **Esc or ? pressed in the audience window closes the ? key list** on the host's screen.
- **Changing round from the keyboard keeps your place**: after Next / Prev round (or ◀ Back from the Final) the
  keys go on from the new board's tile, not the top of the page, and "N clues left · go on?" stays up while the
  focus is in it instead of vanishing after 4 seconds.
- **Steal points shares fairly**: the points go to the players it's for, never back to the one robbed (their chip
  under "For:" is greyed out once they're picked to steal from), in whole points that add up to exactly what was
  taken. Stealing all of a $5 score for two players gives $3 and $2, no longer $3 each from a player who had $5.
- **Swap scores is with one player**: picking a second player under "For:" replaces the first, instead of the second
  being quietly left out.
- **"Show the total" off** in a saved dice set now hides the total on screen.
- **Number boxes in Wheels & Dice keep what they show**: a dice count is 1–20 (500 becomes 20, 0 becomes 1), a spin
  is 1–30 seconds (999 no longer locks the wheel for minutes; 0.2 shows 1), and a die's sides box always shows the
  die it is (typing 0 then 1 shows d2).
- **A "land once" wheel with every slice used** doesn't start over by itself any more: Spin is greyed out with
  "Every slice has landed: Restore to spin again" (W and a click on the wheel say so too). A board game's movement
  wheel says the same.
- **A slice with no label** shows as "Slice 3" when it lands (on screen, in the Result line and in the roll log)
  instead of nothing, and the wheel editor points out slices left blank.
- **Picking from the 🎲 Dice, 🎡 Wheel or 🏁 Who goes first menu** puts the keyboard back on the menu's button (or on
  the wheel's Spin!), instead of losing it.
- **D, W and O wait while dice, a wheel or a roll-off are still going**, with a note why, instead of replacing them
  (their result was already logged and a land-once slice used).
- **Players' initials on the Pick a player wheel stay different**: "Bartholomew The Magnificent 1/3" and "… 2/3" are
  "BTM1/3" and "BTM2/3", and names that would still read the same get a number.
- **A d4 with its own faces** is drawn square, so the face's word isn't cut off by the triangle (and no "d4" under it).
- **The Result line for many dice** puts the total first ("47 (5 + 6 + …)"), so a long roll cuts off the dice, not
  the total; the whole line shows on hover.
- **Outcomes by total**: a range typed the wrong way round (From 9, To 4) is turned round to 4–9.
- **Theme**: a warning when the Values colour is too close to the Tiles colour to read; the tile glow colour box has a
  name for screen readers; the Board settings no longer spill out of their column.
- **Wheel editor on a 1280-wide window**: the preview gives way so each slice's row fits on one line.
- **Screen readers** hear which player chips are picked ("This was for", a score effect's "For:" and "Steal from:").
- The quick dice box's hint says what it takes: "1–20 dice of 2–1000 sides".
- **Big games are quicker in play**: ▶ Play and every change to the game mid-game (ticking a rule in 📋 Game rules) no
  longer copy the whole game each time for the audience window: it gets the copy already kept for saving, and only
  while it's open. On a slow PC a big game's ▶ Play takes half as long, and a rule ticked no longer freezes the host
  window for about a second. Going back to a big board from a clue reuses the board's text sizes worked out before
  (the fitting took 170–250 ms there, now about 30 ms).
- **Typing in a big game's editor is quicker**: the sidebar checklist is worked out a moment after you stop typing,
  not on every key.
- **Player rows on the pre-game screen stay on one line** on wide windows (1400 px and up): ▲ ▼ 🗑 no longer drop
  under the name; the name box narrows a little instead.
- **A wrong answer with negative scores off counts even from a player on $0**: nothing is taken, but it's logged as
  wrong (✘), the wrong sound plays, and with phone buzzers that player is locked out of the clue and the buzzers open
  for the rest. Before, it did nothing at all, so the player could keep buzzing.
- **A reload right after changing a setting on the pre-game screen keeps it** (with a buzzer room open): the room
  remembers the screen's settings (the buzzers, 📋 Game rules), so the editor's copy not being written yet loses
  nothing.
- **Phone buzzers**: reloading on the ▶ Play screen right after turning Buzzer mode on no longer closes the room (the
  reload could come back before the setting was written, and the room was closed for it), and ◀ Back to editor then
  ▶ Play still goes back into that room.
- **Opening an older copy of a game no longer changes the pictures and sounds of the game you have open** (or of a
  game kept in Recent games). Its files were stored over the newer ones with the same name inside before the game was
  even opened, and stayed changed when you then said Keep it or the file turned out to be broken. Now a file is stored
  only once the game is really opened, and a file that differs from the one you have gets a name of its own. The same
  goes for Import rounds…. (08a9602, 6119c64)
- **Discarded work no longer disappears from Recent games** when the same game is opened again and then replaced: an
  edited version and the saved one are both kept. (08a9602, 6119c64)
- **An exported HTML file too big for the browser no longer opens as the editor** (showing another game, answers and
  all). It says "Too big for one HTML file — Save a .brainrot instead", and Export HTML refuses to make one that big
  (over about 375 MB of game) with the same message. Open… of such a file says so too instead of "Invalid string
  length". (08a9602, 6119c64)
- **A change made while Save (or an autosave) is still writing counts as unsaved**: New and Open… ask about it, and the
  🕘 History shows the save where the game was when it started. (08a9602, 6119c64)
- **Desktop app: a full disk or a file in use no longer sends saves to Documents** with a wrong reason ("the app's
  folder can't be written"): the real problem is shown. Only a folder the app may not write in sends saves to
  Documents, and Save then replaces only that game's own save there. (08a9602, 6119c64)
- **Desktop app: a save that fails leaves its backups as they were** (it used to lose the oldest `.bak2`). (08a9602, 6119c64)
- The Open… list of BrainrotSaves closes with Esc only when nothing is open over it. (08a9602, 6119c64)
- Accessibility checks: ＋ Map sits beside the map tabs (not in their tab list), ＋ Add player beside the player list,
  History's "Go there ›" and the phone page's name under BUZZ! read at 4.5:1, and the Theme tab's headings go in
  order. (8bb6edc)
- **An emptied number field in the slide Inspector** (Size, X/Y/W/H, line height, outline width, shadow, entrance
  times…) no longer saves "nothing" into the slide (which drew the text at 14 px after a reload): leaving the field
  keeps the last value, and a number out of range is pulled into it. Games saved that way open with the usual values.
  (aa4b904)
- **Text outlines, shadows and glows aren't cut off** with a hard edge at the text box's border: the box keeps room for
  them inside, and shrink-to-fit allows for it. (08ffde2)
- **🎨 Edit image › Apply after a crop or a turn** keeps the picture inside its old box (as big as fits, centred where
  it was, on the slide), instead of keeping the width and pushing it off the slide. In the image editor, Remove crop
  can be undone, clicking a caption or sticker without moving it is no longer an undo step, and a caption is picked
  anywhere on its words (not in a circle sized by its length). (f627dca)
- **🖼 Media › Replace on a picture with edited copies on slides**: the slides show the new file with their edits
  (crop, captions, stickers) done again on it; before, they kept the old edited copy while the toast said everything
  showed the new file. (0fae6a2)
- **Viewers never see the striped "Missing image / video / audio" box** for a file missing on this computer (only the
  host's view shows it, and the checklist warns about missing files before ▶ Play). (9748fcf)
- **Esc on a checkbox in the slide Inspector** (Outline, Lock…) leaves the field, as in its other fields, instead of
  closing the whole clue. (48fd21d)
- **The slide's BG colour swatch** shows the theme's tile colour when the slide has no colour of its own (it always
  showed the Classic blue). (1461bb1)
- **Items dropped near the slide's edge stay on the slide** (they were centred on the pointer, partly off it), on
  slides and board images. (1461bb1)
- **🖼 Board images**: a file that isn't a picture is refused before it's added to 🖼 Media (it used to be stored
  unused). (0fae6a2)
- **Jeopardy hosting fixes** (0c822f7, 35ed3c9):
  - `Enter` in the Daily Double wager box no longer reveals the answer on stream straight away.
  - The countdown stops after a right answer and when the answer is revealed: no more "TIME'S UP!" and buzzer over the
    answer.
  - The winner fanfare no longer plays on a tied end ("Tie for first"); it plays once the tie is settled by a
    roll-off, the tiebreaker clue or co-winners.
  - The Final's ✔ Right / ✘ Wrong buttons play their sounds, like `C` / `X`.
  - `Ctrl+Z` after the Final question was up no longer erases a locked-in wager, and a missing wager is never counted
    as $0: the reveal asks for it in that player's row before they can be judged.
  - Hiding the answer again no longer restarts the question's video from the start and unmuted: it goes on where it
    was. A video muted with `M` also stays muted when it's paused or played.
  - Wide windows: the Final's Finish button stays in sight with 8 players, messages show at the top of the side panel
    (not over 👥 Players and Exit), the host info's "Wagers" heading stays with its list, and the scores window no
    longer lights the last picker's plate through a Final.
- **A rematch keeps the players' pictures**, and changing the players before it no longer deletes their pictures from
  the saved game (a picture now only goes when you take it off with −🖼). (1d355db)
- **A game saved with Buzzer mode on plays without it in a copy that has no buzzer server**: no more "📱 Phones off",
  "🔔 Buzzers open" or ↺ Reset buzzers that can't do anything. The 📱 card says Buzzer mode is off here and you pick
  who answers; the setting stays with the game. (1d355db)
- An exported player-only file no longer tells players to look in the editor's ⚙ Settings for a buzzer server. (1d355db)
- 📋 Game rules: the default clue countdown is whole seconds, at least 1 (−5 used to show "Start −5s"); blank or 0 is
  none. A game whose Most players was below its player count (an older or hand-edited file: "6/4 players") opens with
  Most players raised to fit. The Round intro row lines up. (1d355db)
- The players' ▲/▼ buttons say whose they are ("Move Bo up"), and 🔊 Sounds' ↺ says "Back to the built-in … sound". (1d355db)
- **Phone buzzers**: a buzz won while the host's connection had dropped is picked up as soon as it's back (it used to
  be lost: the phone said "You're answering!" while the host still showed the buzzers open). While the room can't be
  reached, the host panel says phones can't buzz instead of "Buzzers open", and the 📱 chip says "Phones not
  connected" instead of a stale count. (9c17132, 885fe51, 5272947)
- **Phone buzzers**: open pages that just sit there (viewers, extra tabs) no longer fill the room and lock real
  players out with "This game is full": the longest idle one makes way, a player coming back to their seat always
  gets in, a phone turned away tries again by itself, and the host's 📱 list says "Room full". (9c17132, 885fe51, 5272947)
- **Phones**: a request to join survives a dropped connection (it used to wait forever); asking when the host isn't
  taking new players says so and leaves the name form; phones held sideways fit the screen without breaking words in
  the middle; a phone back from the background checks its connection at once, and a buzz shows "Sending…" until the
  room answers (it reconnects if it doesn't); losing a seat says why (removed, or taken back on another tab or phone);
  screen readers hear every change and can press the buzzer; a room code with vowels says codes have none.
  (885fe51)
- **Phone buzzers**: names typed on phones lose invisible and direction-changing characters, and someone can't ask to
  join under a player's name (the host also never adds a second "Ann": it's "Ann 2"). Long names end in "…" instead
  of being cut mid-word. A game too big for the room says so instead of the phones going quiet. The host sees plain
  reasons when it loses the room ("This buzzer room has ended", "open in another window") instead of "no such room" or
  "replaced". The buzzer server limits how fast one address can look up rooms or connect, so nobody can try every code
  to find live games. (9c17132, 885fe51, 5272947)
- **Import round / Paste round from another copy of the same game** no longer silently uses this game's own world,
  wheels, dice, stats, items, shops or files where the other copy's differ: the other version comes in as a copy (the
  toast says "Brought the file's “Adventure” world as a copy"), and this game's stays as it was. The same thing with the
  same content is still shared. Opening another game to take rounds or a theme from no longer overwrites this game's
  file of the same id in the browser's storage.
- Pasting a round twice names them "Adventure (copy)" and "Adventure (copy 2)", and a template added twice is
  "Jeopardy! (2)".
- **↔ Move ±N spaces**: typing a negative number turns the move round ("-4" going forward is back 4) instead of
  quietly saving 1 while the box kept showing "-4"; the box always shows what's kept. "Miss 1 turn" no longer says
  "turn(s)".
- A board game's movement dice (or a wheel) no longer stays on stream over the next round's title card.
- With this browser's storage full, the Save first / Discard question says Discard loses the game (it can't be kept
  in Recent games), and doesn't ask a second time.
- The Export HTML button's tip no longer says to share the file with players: it's the host's copy and shows the
  answers.
- The "Starting soon" countdown shows the host its time left ("Starting in 4:32 · ■ Stop").
- A toast from the editor ("Added a sample game…") no longer follows into ▶ Play over the Start game button.
- A tab paused because the game was open in another tab notices when that tab closes: it says "The other tab was
  closed" and offers **Edit here**.
- Keyboard and screen reader: Try a sample game, a template, a pasted or an imported round put the focus on the new
  round's name; Find's Go there puts it in the field that has the words (a category's name, a Final's category,
  question or answer, a space's name, a round's name) instead of losing it, and an Answer found opens with the focus
  in the Answer field. Find's results are one Tab stop (↑/↓ pick, and the box says which). Menus take `Home` and `End`.
  In-app questions are marked as modal.
- Find says "› Category" for board categories as for Finals, and board spaces have their own ⬤ icon (dice keep 🎲).
- 🕘 History names are clearer: a space's, an object's, an item's or a wheel slice's button is named as the editor
  shows it ("Added button “Back 3 spaces”"); the On stream captions say on or off and the cards' words what they say
  now; a theme change says its new value ("Theme: stage background chroma green"); and "Added the sample game" is
  placed at its rounds, not at Play › Players (its Undo / Redo note too).
- A Final's title card no longer shows the host "Category is on screen" and Lock category under "Title card…"; RPG
  and board-game rounds say "Title card · press N to start the round" too.
- 🎨 **Save as my theme** says when the theme's uploaded fonts stay with this game, and **Use my theme** in a game
  without those fonts keeps that game's font for that text (instead of a fallback font) and says so. Use my theme
  says "This game already looks like my theme" when nothing changes.
- **Import clues** reads CSV files that use semicolons (as Excel saves them where the decimal mark is a comma).
- 🔊 Sounds: switching off a sound that has your own file no longer forgets the file: it says "Off (keeps
  intro.wav)", and ticking it again plays that file, not the built-in sound. (Games saved before keep working; a sound
  they had switched off simply stays off.)
- Small wording: ＋ Add round's "📂 Import rounds…" is no longer cut off; the space card's Delete space has its 🗑;
  the "Opened “…”" toast uses curly quotes; the sample game's Final answer is "Just chatting", like its board answers.
- **Board game: a space's buttons act on the player they're for.** "Landing on it (Bob)" on a space's card, the
  landed and passed buttons and the stage's "Run its landing actions" now move, skip or charge that player, not
  whoever's turn it is. (79dbf8e)
- **RPG: an object's "the party" buttons act on the party standing there**, not the one viewers follow (a trap on the
  Village hurts the players at the Village, even in split view). (79dbf8e)
- **Board game: moving back where two ways meet goes back the way the player came**, not down the other way; and
  after moving back onto a fork, the next move asks which way again instead of taking the other way. (79dbf8e)
- **The minimap and the full map (`J`) of a big world (20 × 20)** fit their boxes: the minimap's rows no longer
  shrink to slivers, and the full map stays inside the window with its ✕ and Move buttons in reach. (0ff069a)
- **The viewers' map stays quick on a big world**: moving with a full 20 × 20 map on screen no longer slows the
  audience window down. (0ff069a)
- **Only the board game's own dice or movement wheel fill in the Steps box**: a Pick-a-player wheel landing on
  "Player 3", the 🎲 tool or a space's "Roll d20" no longer do. (0ff069a)
- **Selling sells the very item picked**: with two Swords, selling the one not worn no longer takes the worn one. Sell
  buttons mark the worn one, and a shop no longer offers to buy secret items or ones with no price. (79dbf8e)
- **Arriving players stand clear of the stats strip** (walking in from the south their names were behind it) and of
  the split-view caption, and side by side when they come in at a corner (two used to land on top of each other).
  (79dbf8e)
- **Picking something up with several players picked** gives it to the first one, and the button names just them
  ("✋ Bob & Cy picks up" gave it to Bob only). (79dbf8e)
- **Board spaces only draw a number when they're named "Space N"**: "Move +3" no longer shows a big 3. Tokens stay
  above the stats strip. (79dbf8e)
- **Ctrl+C on a board tile, an RPG screen or board spaces** copies it right after adding a round: the round's name,
  still selected from when it was added, no longer takes the copy. (ad6b92d)
- **The board game editor no longer traps the keyboard**: `Tab` from the round's settings reaches the board and goes on
  to the space's settings (it used to keep cycling the spaces with the focus lost), so every space setting can be
  reached from the keyboard. Spaces read as their names ("Space 3", not "Space Space 3"). (d61f2e5)
- **Adding an RPG screen with `Enter` or a click** keeps the focus on the map, on the new screen. (ad6b92d)
- **Move by › ＋ New dice…** no longer leaves the box saying "＋ New dice…". (d61f2e5)
- **Deleting board spaces** shows the app's usual "Deleted … · Undo" note (and History link) instead of a note of its
  own; so does deleting a character's stat or dialogue slide (which had none). (d61f2e5, ad6b92d)
- **`Ctrl+Enter` on the last clue** says it's the last one (Esc when done) instead of doing nothing. (d61f2e5)
- **Moving several RPG screens** names the step after the screens moved ("Moved 11 screens", not 22 counting the ones
  swapped out of the way). (ad6b92d)
- **A typo in a board game's Steps** no longer freezes the app: 100000 locked it up, and 500 took minutes to walk.
  Steps are whole numbers up to 99 either way (2.5 moves 3), and a move longer than 20 spaces jumps straight to where
  it ends on screen. Spaces passed more than once in a move offer their buttons once.
- **Enter in Steps at a fork** says to pick the way first, instead of replacing the steps the move has left.
- **Resume with my edits after deleting a board space (or zone)**: players who were on it go back to Start, instead of
  vanishing from the board with "Nowhere to go from here".
- **No keyboard trap in the slide and screen editors**: Tab picks the slide's items only with the focus on the canvas
  (a Tab stop now; clicking an item puts the focus there too), and past the last item it moves on to the next
  control. Enter on an RPG screen opens it with the focus on its canvas, and adding an object from a menu leaves the
  focus there, not on the page.
- **Shift+Tab from a section heading in a window** (the slide editor's Layers) goes back one control, no longer to the
  window's last one.
- **Items that don’t stack** are given 99 at most at once (their "How many" boxes stop at 99 too): 20000 swords took
  10 s to show.
- **Clearing a map's Columns or Rows** to type a new number no longer shrinks the map to 1 and deletes its screens:
  the box shows the size again.
- **Deleting a currency stat** names the shops that charged it; their Charges box says "⚠ Deleted stat — pick
  another" and the checklist lists them. They used to switch to points without a word.
- **A stat's Min above its Max, or a Start outside them**, is flagged next to the stat and on the checklist.
- **🎨 Edit image on a huge picture turned at an angle** (12000×12000 at 45°) saved a blank picture and said it had
  worked. It's now drawn at the size it's saved at, and if a browser still can't draw it, it says so and saves nothing.
- **Pasting from Word, PowerPoint or Excel** put a picture of the text on the slide: it pastes the text.
- **Ctrl+V of slide items copied in another tab or before a reload** put the words "1 slide item" on the slide: it now
  asks to copy them again.
- **A looping video with Stop at not after Start at** froze at its start: that Stop at is ignored (the Inspector says
  so), and Start at can't go below 0.
- **🎨 Edit image undo**: slider changes made with the keyboard, and a caption's text, font, size, colours and turn,
  can be undone (one step per burst of changes), and placing a sticker and resizing it are separate steps.
- **Typing into a slide with pages of text** is quicker: shrink-to-fit gives up at once when even the smallest size
  can't fit.
- **A host reload in the middle of a clue keeps the buzzers as they were**: who is answering and who already missed it
  (they stay locked out), instead of opening the buzzers afresh for everyone.
- **A phone coming back to its seat mid-clue** (a reload, a new connection) shows its place again ("You're answering!",
  "You're 2nd…") instead of losing it.
- **A phone page could end up with two connections** and see its own seat as "taken" after coming back to the tab
  while it was reconnecting; it now keeps one connection only.
- **A long player name with no spaces** no longer runs off the big BUZZ button or makes the phone page scroll sideways
  (it breaks onto the next line; on 320 px wide phones and sideways too).
- **A phone that floods the buzzer room with messages** is cut off (and kept out for 30 seconds) instead of slowing the
  room down for everyone.
- **A kicked phone can't take its seat straight back by clearing its browser data**: for the 2 minutes the kick lasts,
  that seat is closed to its address too.
- **Names with emoji are never cut in half**: a family emoji or a flag counts as one character in the 24 and 40
  character limits, and flags like England's and Scotland's keep their tag characters instead of turning into a plain
  black flag. A new player asking to join from their phone gets the same 40-character cut as everywhere else.
- **Phone page for screen readers**: the sound button is "Sound" (on or off as a toggle) instead of a label that also
  changed, the room code is read as "Room code …", the buzzer's words no longer end in "….", and the early-buzz
  countdown is said once instead of every second.

### Removed
- The "Recommended" tag on the pre-game screen's 📺 Separate audience window (Single window is the default).

## 2026-09-30

### Added
- **Remote buzzers, the server half**: a small buzzer room (`buzzer/`, a free Cloudflare Worker) and its phone page.
  Players open the link on their phone, tap their name and get one big BUZZ button in their colour; the room decides
  who buzzed first, says "Too early" (with a short lock-out) or "Too late — Ann is answering", and gives a player
  their seat back after a reload. Deploys from `main` once the Cloudflare secrets are set (see `buzzer/README.md`).
  (1c5bfc0, 5f8bc06, b525be7)
- **Phone buzzers are fair on a slow connection**: each phone times how fast its player reacted to the BUZZ! light,
  and the fastest reaction wins, not the first buzz to reach the server. The server checks each phone's timing
  against that phone's own connection speed, so a phone can't fake much of a head start.
  (bde9ae8, 9920218)
- **Every phone buzz counts, fastest first**: the host panel lists everyone who buzzed on the clue in order ("2. Bo
  +0.12 s"), and phones show their place ("You're 2nd — 0.12 s behind Ann"). After a wrong answer the buzzers still
  open again for the rest (as before), and **→ Next in line: Bo** gives the answer straight to the next one who buzzed.
  (bde9ae8, 9920218)
- **Ties**: buzzes within 0.01 s of each other are a tie and nobody is picked. The host panel says "Tie: Ann & Bo" with
  **🎲 Roll for it**: the tied players roll, and the roll sets who answers first, second… ("🎲 1st"). The host can
  also just pick one. Tied phones say "Tie! The host decides who goes first", then "Tie — you rolled 2nd".
  (bde9ae8, 9920218)
- **↺ Reset buzzers** in the host panel (or `0`): nobody is locked out of the clue any more and the buzzers open for
  everyone. (9920218)
- If the buzzer server turns down a new room, the pre-game card shows its reason in plain words. (9920218)
- **The buzzer server limits new rooms**: 6 a minute from one address ("Too many new rooms — wait a minute") and 1000
  a day in all ("The buzzer server is busy today — try again tomorrow"), so nobody can use up its free daily quota.
  (bde9ae8)
- **Phone buzzers** (the pre-game screen's 📱 Phone buzzers card): before the game, ▶ Start the room shows a
  room code, a join link (📋 Copy link for the Discord chat) and a QR code, also on the viewers' Starting soon card.
  Players open it on their phone, tap their name and get a big BUZZ button; the first one in answers, and the host
  panel shows who came next ("Bo +0.12 s"). The 📱 3/4 chip in the host panel lists the phones (✕ takes a seat back)
  and warns while reconnecting. With **Let new players join from their phone**, people can ask to join and the host
  adds them (✔ Add), mid-game too. A phone that buzzes too early waits a moment (1 s by default). A reload gets back
  into the same room; Exit closes it. ⚙ Settings › **Buzzer server** sets where rooms are made, with a Test button.
  (ea18c23, 65cd85e, f8cbaf8)
- Dice tiles can use standard dice (d4–d100, 2d6). "＋ New wheel…" / "＋ New dice…" right in the clue editor and in a
  board game's Move by. 🚪 Doorway and 🧙 Character buttons on RPG screens. A game-wide clue text font and colour in
  🎨 Theme, whose preview can show any round or a clue. (46f2a13)
- This changelog.
- README: fresh screenshots (the new host column in RPG and board game rounds) and one of the 🕘 History tab.
- **Jeopardy board editor**: drag round tabs to reorder them (`Alt`+`↑`/`↓`, `Delete`, `F2`, `Ctrl+D` on a tab); drag a
  tile onto another to swap the clues (`Ctrl`-drag copies); drag category headers and right-click them to insert,
  duplicate, clear or delete; arrow keys move around the board, `Enter` opens a clue, `Delete` clears it, `Ctrl+C` /
  `Ctrl+V` copy a whole clue (across rounds and games); insert, move or delete rows anywhere; `Alt`+arrows in the clue
  editor go to the clue above, below or beside; the Final and Tiebreaker get quick Question / Answer fields. (84d5e19)
- **Board game editor**: select several spaces (`Shift`-click or a box) and move, colour or delete them together;
  arrow keys nudge, `Tab` steps through spaces, `Ctrl+D` duplicates; `Alt`-drag (or ⊕) links two spaces, and a link's
  right-click menu makes it two-way, reverses or removes it; zones reorder and have ↶ ↷. (83427b3)
- **Lists everywhere** (wheel slices, wheels & dice, stats, items, shops and their stock, action buttons, players):
  drag ⋮⋮ or `Alt`+`↑`/`↓` to reorder, ⧉ / `Ctrl+D` to duplicate, a right-click menu, and deletes with Undo. `Enter`
  in a slice or player name adds the next one; dice faces fill from a list; "＋ Something to sell ▾" lists your items
  (or drag an item's 📦 onto a shop); action buttons copy and paste between objects and games. (83427b3)
- **Drop files where they go**: item icons, avatars, space icons, worn looks, theme background and banner, music,
  sounds, outcome media, the tile image, and any open picker (which also takes a pasted image). (0e2b57e)
- **⌨ Editor shortcuts sheet** (the ⌨ button next to ℹ About, or `?`). (0e2b57e)
- 🖼 Media page: rename a file (double-click or `F2`), drop a file on a card to replace it everywhere, select several
  and remove them with an Undo. (0e2b57e)
- Slide right-click menus: paste here, paste slide, select all, text here and background on an empty spot; cut, copy,
  paste, edit image and align on items. Layers can be renamed (`F2`). Board images use the same clipboard as slides.
  (0e2b57e)
- **RPG map editor**: drag a screen to move it or swap it with another; `Delete` deletes the selected screens with an
  Undo notice instead of asking; the grid works from the keyboard (arrows, `Enter`, `Alt`+arrows, `Ctrl+D`, `F2`,
  `Esc`); select several with `Shift`/`Ctrl`-click or a box; copy/paste screens; move or copy a screen to another map;
  insert or delete rows and columns; rename, reorder and duplicate maps from their tabs; switch looks and neighbouring
  screens from the screen editor; click ⛔ between screens to block a way; drop pictures on the map to make screens;
  a menu for each look (duplicate, make main, reorder). (4eef0fe)
- Right-click menus on what a shop sells, on zones (also ⧉ / `Ctrl+D` to duplicate a zone) and on players (now on the pre-game screen).
  (5b23a55)
- Map tabs take `Alt`+`←`/`→`, `Ctrl+D`, `Delete` and `F2`, like round tabs. Wheel slices and action buttons have a
  right-click menu. Right-click menus show their keyboard shortcuts, and the shortcuts sheet lists the board, round
  tab and map tab keys. (84ad8f2, 7180280, 86f9f05, f3405d5)
- ⚙ Settings: **how many changes undo remembers** (300 by default, 20–2000). Lowering it forgets the oldest at once,
  never a redo.
- **Buzzer mode** (now on the pre-game screen's 📱 Phone buzzers card): during a clue the first player number
  pressed answers and the others are locked out with a buzz; `0` opens the buzzers again. Players can buzz from the audience window with their own keys. Viewers see
  "🔔 Ann is answering" while one player is picked. (3a6c269)
- RPG, board game and Final rounds open on a **title card**, like boards. **Built-in sounds**, on by default (round
  intro, tile, Daily Double, buzz, right, wrong, reveal, time's up, dice, wheel, board move, winner); each can be
  previewed, replaced or switched off. (3a6c269)
- **For OBS**: a chroma green or magenta stage background, and a scores-only window (▭ or `Shift+A`) for a
  lower-third. Editable "Starting soon" and cover cards with a countdown; optional category/value and screen-name
  captions; the Final shows scores while wagers come in; 📋 Copy standings in 📊 Scores. (737022c, 3a6c269)
- **Try a sample game**, starter templates in ＋ Add round, Import round from a .brainrot, and Copy / Paste round.
  **Find** (`Ctrl+F` or 🔍) searches clues, screens, spaces, items, wheels, players and files. **Import clues…** pastes
  a board from Google Sheets, Excel or a CSV. Save as my theme. A "Most players" rule. Board game spaces can move a
  player ±N, skip a turn or roll again. (a80620f, 90b9fce)
- Desktop app: opens a game file it's opened with, lists exported HTML games in Open…, and opens `.bak` backups.
  Open… in the browser opens exported HTML games too. (769dbf8, 13b208f)
- ℹ About shows whether the browser keeps the game's storage. ⚙ Settings › **Reduce motion on stream**; the editor
  and host controls follow the computer's reduce-motion setting. (64eba3f, 4729d75)
- Keyboard and screen reader: every window keeps focus inside and returns it on close; focus stays put after adding,
  duplicating or deleting rounds and categories; icon buttons, board tiles, sidebar tabs and toggles have names. (4729d75)
- **One undo history for the whole editor**: every change, in every tab, is a step. `Ctrl+Z` / `Ctrl+Y` (and ↶ ↷ in
  the header) go to where the change was and say what was undone. Deleting no longer asks first; a
  "Deleted … · Undo" notice appears instead. Removed or replaced files come back with undo. (b950f08, 33bcb36,
  b4a0a1b, 264edcb, c66bce4, 09c5647)
- **🕘 History tab**: every step of the game, newest first, with a click to go back (or forward) to any point and
  "Go there" to see it. The history survives a reload. Changes made while hosting (Keep in game, a wheel saved in
  play…) are steps too. (c8e90c3, a09c328, 6bff90f)
- **Play timeline** in the 📜 Log: scores, RPG and board-game steps and rolls in one list, with "Back to here" /
  "Redo to here". The host's own choices (a tile marked played, the picker, co-winners, Final players and order,
  Players-dialog edits) can be undone too. (d2c21f8, 5f079cc; merged as bbb1495)
- **Drag, drop and right-click in play**: drag avatars to another screen, tokens onto spaces, items between player
  cards; reorder players, the turn order and the Final reveal order by dragging; a player menu wherever a player
  appears; Delete takes the open RPG object off the screen. (9259349, b3b9948, 6f94306, 265d715)
- **⚙ Settings**: autosaves every few minutes (desktop app, keeping the last 3 by default) and whether Save replaces
  the last save or makes Game (2), Game (3)… (e48427b)
- **Right-click menus** across the editor and play; board game editor: `Ctrl+click` adds a space, `Delete` removes
  one. (e48427b)
- **Ctrl+S** saves; dropping a `.brainrot` on the editor opens it; files can be dropped on the 🖼 Media page.
  (57fc050)
- **Copy and paste between games**: slide items and whole slides keep their pictures and sounds. (01f121a)
- Board game editor and board images have undo; the RPG map marks the start screen and can delete a world.
  (28dc502, b7e1509)
- README rewritten, shorter, with screenshots (`npm run screenshots` retakes them). (519bf7d)

### Changed
- **The editor's ⚙ Setup tab is now 🔊 Sounds**, and holds only the sounds. **Players are added on the ▶ Play
  screen** (before the game): add, rename, recolor, pick a picture, reorder and delete them there, and they're kept
  with the game for next time (undoable in the editor's 🕘 History). The rules, timers and round intro moved there
  too, in a **📋 Game rules** fold that remembers whether you left it open (the buzzer options are on the 📱 Phone
  buzzers card above it); they're still saved with the game. A game with no players can still go to ▶ Play ("Add
  players to start"); the checklist's "No players yet" line takes you there. Find no longer lists players.
  (e2032fc, 64b7501, c63c83e)
- **Buzzer mode moved to the pre-game screen**: the 📱 Phone buzzers card turns it on and sets its options (when the
  buzzers open, new players from their phone, the early-buzz wait); they are saved with the game and are no longer
  among the rules. Mid-game, the 📱 chip's list can change when the buzzers open. In buzzer mode the number keys simply
  pick who answers, by hand (over a phone's buzz); `0` resets the buzzers. The 🕘 History places these changes in
  Play › Phone buzzers. (4306034)
- **Buzzer mode: a wrong answer locks that player out of the clue** and opens the buzzers again for the others (a
  rebound); `0` still opens them for everyone, a right answer closes them, and a new tile starts afresh. New option
  (now on the 📱 Phone buzzers card): **Open the buzzers when the clue opens, or when I press `U`** (after reading it;
  the host panel's 🔔 Open the buzzers does the same). Number keys still pick a player while the buzzers are closed. (8daeb88)
- The editor sidebar groups the rounds (Tiebreaker right after them) and the game-wide tabs; the checklist is one line
  per round and a click jumps to the first unfinished tile. Categories show ⋯ for their menu and many-category boards
  fit the screen. Delete world is in a ⋯ menu. Only the header has ↶ ↷ (except windows that cover it). The first
  screen shows the mode cards two by two; "Rows (questions per category)". (46f2a13)
- **RPG and board game rounds on a widescreen window put the host controls in a column beside the stage**, so the
  stage (the stream in single-window mode) gets most of the window: 860×484 at 1280×720 instead of as little as
  487×274. (b0fbaab)
- Lists of player names read "A, B & C" everywhere (ties, the Final's waiting list, group awards). The history says
  whose turn it is ("Ann's turn") and names a regrouped party. A Final player who can only wager $0 gets it filled in.
  The 📜 Log's row buttons have their own column, so they never cover the text. (726fa84, df6ee8b)
- Editor wording: action lists say **button** throughout ("＋ Add button"); **Delete** means it's gone and **Remove**
  means it's taken off but stays in the game (a file, a wheel from a button, an item from a shop). Wheels & Dice use ⧉
  and 🗑 like the round bar, and round moves say ▲ / ▼. (62c8851)
- **＋ Add player** puts the cursor in the new name. Undoing a round's duplicate shows the original round, with focus
  on its tab. The RPG editor's help sits beside the map on wide screens. (5b23a55, 12ee23c)
- Keep in game and Resume with my edits follow screens moved in the editor; a party on a screen that no longer exists
  goes to the start. (4eef0fe)
- A Final round has its own **"Players with a score of 0 or less can play it"** option (on for a new Final). It used to
  be one game-wide rule; older games keep their choice on each of their Finals. (288972f)
- A **Daily Double's wager stays off the stream** until the host presses **Show wager**, as a Final's wagers do.
  (288972f) In single-window mode viewers still see the wager box while the host types in it.
- **＋ Add round** puts the cursor in the new round's name, selected, ready to type over (it went to the round's tab).
- The play history says who bought or sold in a shop ("Ann buys Potion") and which party moved once there are several
  ("Party 2 west"). ＋ Text in an RPG round opens the new text's card. The in-play keys list mentions `R` hiding the
  answer again, `Ctrl+Y`, and `Esc` closing a card. (1d763ac)
- **Single-window mode says plainly that viewers see everything on screen**: wagers as they're typed, answers, host
  notes and hidden objects. The display choice before the game recommends the audience window when that matters.
  (737022c)
- The stage keeps one size between the board and a clue, and through every Final step. `B` covers the stage in every
  round (it was also Esc on a clue); `V` shows the RPG map and `M` always mutes. Score pops clear on the next clue and
  sit over the scores; wheel labels are never upside down; long names fit on score plates; the stats strip is bigger.
  Closing the audience window asks in the page, next to Exit. (737022c)
- **Desktop Save replaces the game's last save** and keeps the two before it as `.bak` / `.bak2` (it used to make a
  new "Game (2)" every time). Autosaves are kept per game, and slots past the number kept are deleted. (769dbf8)
- Big RPG maps open several times faster in the editor, and host actions on big games are much quicker. (769dbf8)
- **New and Open… ask Save first / Discard / Cancel**, and the game they replace stays in **Recent games** with its
  undo history ("↶ Reopen previous game"). The first Save of an untitled game asks for its name. Only one browser tab
  edits at a time; another opens paused with "Edit here instead". (64eba3f, 3b61fc0)
- Exported player files say they're the host's copy, count RPG and board game rounds, keep their files in memory
  (an older export no longer changes the builder's pictures) and keep a game in progress per export. (64eba3f, 708fd3b)
- The editor header's Export JSON, ⚙ Settings, ⌨ shortcuts and ℹ About moved into a **⋯** menu, so the header fits at
  125% and 150% zoom. Questions and errors appear in the page instead of the browser's pop-ups. 🗑 deletes, − removes
  and ✕ closes everywhere, and every window has the same ✕ and Done / Cancel. (4729d75)
- **Readable colours**: text on player colours picks black or white by contrast, the Pastel theme's stage text is
  dark, and filled buttons are darker. (4729d75)
- Downloads are `brainrot-game-maker.html` and `brainrot-game-maker-portable.exe`; the desktop app saves into a
  **BrainrotSaves** folder next to the `.exe` and lists those saves in Open…. (b1a4b99)
- Nothing pops up over the stage mid-show: questions for the host appear in the host panel. (4c416ec, 17fa216,
  01f121a)
- Viewers see a "Starting soon…" card until Start; a tie for first isn't announced as a win until it's settled;
  rankings share places. (cf00c51)

### Fixed
- Later boards no longer keep doubling their values; long category names aren't cut off; the Daily Double count is
  capped at the playable tiles; a blank row value keeps its old value and negatives read −$100; a stat preset can't be
  added twice; focus goes to the new round after ＋ Add round; the rules' checkboxes don't shrink. (46f2a13)
- Opening a tab right after an undo or redo no longer jumps back to the undone place (a clue editor could reopen over
  the board). This was also why about half the CI builds failed. (a58527b)
- A wheel or dice clue, screen, set of buttons, slide item or slide pasted into another game brings its wheels and
  dice along instead of showing "⚠ Deleted wheel". (84ad8f2, f3405d5)
- `Delete`, arrows and `Ctrl+D` on a round tab or header button no longer also act on the selected slide items, board
  spaces, map screens or files. `Esc` leaves a slide's text field, then deselects, then closes the clue (it used to get
  stuck in the field). A toast no longer covers the "Deleted … · Undo" note; `Backspace` deletes a wheel or dice in
  the list too. (84ad8f2, f3405d5)
- The Daily Double badge on stream read "Daily Double· $500". Picking who found a Daily Double puts the cursor back in
  the wager box, so typed numbers no longer select players. Redo names a multi-player award's players in the same order
  as Undo. A shop, a player's sheet or an object's pop-up no longer stays on stream into the next round, and a card left
  open no longer swallows the first `Esc` in a later clue. `P` then `0` no longer leaves `P` waiting. (cca172e, 8318135)
- When storage was full, added files and undo history could be lost while the header said ✓ Autosaved. Failed
  writes are now tried again and the warning stays until everything is stored; closing the tab asks first. (64eba3f)
- Hand-edited games are repaired where it's obvious, and Open… names what it can't use. A cut-off export says it's
  incomplete. (64eba3f, 13b208f)
- Desktop saves are synced to disk before they replace the old file, and closing the window keeps the last edits.
  (769dbf8)
- **Typing no longer lags in big games** (was up to about half a second per keystroke). (80872b7)
- A polish pass of 122 audit findings plus two review rounds (about 50 more): keys going to the thing behind an open
  window, deletes without undo, layout at 1280×720, undo interactions between scores and RPG moves, save names with
  non-English letters, and many more. (28dc502 … c2ed8f1)
- The Windows build failed on a file-name clash that only matters on Windows. (1b53e98)

### Removed
- **Buzzing in from this computer's keys**: buzzers are phones only, since games are played online. The "Players buzz
  from" choice and the audience window's buzz-in keys are gone (older games drop them quietly; one with Buzzer mode on
  keeps it, now meaning phone buzzers). (4306034)

## 2026-09-29

### Added
- Items can have their own picture or drawing when worn, previewed on an avatar; the in-game drawpad shows the
  players. (4bf48f2)
- **Drawpad**: draw a whole object before inserting it. (306f6f9)
- Shops: click a ware to buy it, 🚪 Leave shop, prices in points, and the buyer is whoever opened the shop; give or
  drop part of a stack. (1cbdad0)
- Tiebreaker roll-off decides the winner; extra wheels can be edited; text and pictures added in play can be moved
  and edited; board games get two-way links and a one-space-per-turn mode. (d9605ac)
- RPG: a full map to jump the party anywhere; several wheels can spin at once. (90ed0ee)
- **Board game mode**: spaces, turns, spin or roll to move, zones. (914ba70)
- **RPG mode**: worlds of screens, stats, items, shops, NPCs, doorways and live improvising. (f075f05, d3e0912)
- **Round modes**: every round picks a mode (Jeopardy board, Final Jeopardy, RPG, board game); Final Jeopardy is a
  round that can go anywhere. (2769d32)
- **Online media links** (catbox, Google Drive…): save a copy, or play them live. (cedb00a, e2789c4, c81b01e)
- **Streaming sound**: Test sound, blocked-sound warnings, an output picker, and the desktop app's Discord audio fix
  (on by default, with fallbacks and an escape hatch). (b14eb91, 51754dc, 1c2e484, 556f466, a543384)
- Built-in **"Pick a player"** wheel; edit a wheel for one spin with Save as / Overwrite. (474fb0a, d2ca193)
- **ℹ About** with the version, links and where data is saved. (a3b48ef)

### Changed
- **Renamed** from Jeopardy Builder to **Brainrot Games Maker**; old `.jbr` packs and exports still open, and the
  desktop app moves its data folders on first start. (77b10ad)
- New games start with no rounds. (f6dc059)
- The desktop app ships as a portable `.exe` plus the HTML file (no installer). (93caf2f)

### Fixed
- Saving: no freezes, no lost media, and a way to fix missing files. (6206c66)

## 2026-09-28

### Added
- **Board images**: category images, a banner, tile images and freely placed images. (0585ff6)
- Slide editor **layers list** and easy selection of stacked items. (87d6f74)
- Renameable final round, click-to-act stage, hide the answer again, rolling release. (a492413)
- The milestones that built the app: core editor and play (M1), audience window and game packs (M2), slide editor
  (M3), Daily Doubles, timers, Final wagers and ties (M4), dice, wheels and roll-off (M5), image editor and themes
  (M6), HTML export and checklist (M7), the desktop app (M8). (32f5702 … 23b7fd9)
- Product and technical spec (`docs/SPEC.md`). (77db1e0)

### Changed
- Safer hosting: Exit keeps the game, guarded navigation, reopen tiles. (b84166d, edc75a4)

### Fixed
- Many slide, clue and image editor fixes (undo, handles, crop, paste, previews). (ed5d6d5, 973db30, 657ec01, …)
## Notes on the history

Commits whose titles don't say what they contain:

| Commit | Title | What it is |
|---|---|---|
| bbb1495 | Merge 2 | Merge of the play timeline and undo for the host's choices (d2c21f8, 5f079cc) |
| d83cd7b | Revert "Undo covers tiles…" | Takes back fb07abe (Ctrl+Z reopening a closed tile). Tiles can still be put back with ↶ Reopen or a right-click, and closing a tile is an undoable step since d2c21f8. |
| 65ee428 | Merge branch 'worktree-agent-afc90569301405f5c' | Merge of the big-game speed-ups, the buzzer server carried into exports, no-rounds export blocked, compressed packs, one-line pre-game player rows and README fixes (33a9ac2) |
| ba3aa69 | Merge branch 'worktree-agent-a450ef6c094eea9ef' | Merge of the board game and RPG audit fixes: capped steps, the screen editor's keyboard trap, deleted spaces on resume, crowded spaces, currency and item limits (feff655) |
| b89ef5e | Merge branch 'worktree-agent-a79a8c7fd1e1f5e45' | Merge of the slide and image editor audit fixes: huge turned pictures, picture box size, overlays through crops and turns, Office pastes, drag-select, the keyboard item menu (68dbd74) |
| 6ab3b87 | Merge branch 'worktree-agent-a3d1719b6e922652d' | Merge of the editor audit fixes: recent-game files kept for undo, one-step reconnect and Save a copy, clue countdown and value fields, History focus, step labels (5f8ef83) |
| 2727ec2 | Merge branch 'worktree-agent-aa0013621a7fbcb03' | Merge of the phone buzzer stress fixes: room-measured round trips and a capped cheat window, flood closing, the phone page's one-socket reconnects and kept presses, host reload keeping the buzz state, emoji-safe names (2da8525) |
| ea568ac | Merge branch 'worktree-agent-a0b03486466f9e331' | Merge of the robustness fixes: short categories, damaged packs, files opened by content, one-window play on small screens, points symbols (9c8e5c6) |
| 6addcfa | Merge branch 'worktree-agent-a137613afaaae8d2c' | Merge of the first-time host usability fixes: pictures clear of the question, drop-on-tile asks, Daily Doubles placed on Start, steadier host panel (c8dc0f8) |
| 8b0f1cd | Merge remote-tracking branch 'origin/main' | Brings in 60b4e38 (.gitignore: the signing key's folder) |
| 749aea4 | Merge branch 'worktree-agent-aca595146e0e3416f' | Brings in 3dde2ea (editor look and feel: one style for windows, pages, buttons, toasts and the pre-game screen) |
| d5bbca3 | Merge branch 'worktree-agent-a65acfb86fee270b1' | Brings in 6d19748 (clues with several question slides) |
| e8b6e1d | Merge branch 'worktree-agent-a60d194b8ff51af6d' | Brings in 42faaad (team buzzers: people join a team from their phone, anyone on it can buzz for it) |
| a859105 | Merge branch 'worktree-agent-a35ba9cd7caa2c1b4' | Brings in a7234a0 (the Final goes from the category straight to one wager screen; wager limits off by default; wagers editable until shown) |
| f812b22 | Merge branch 'worktree-agent-a2cd6615ecb607e42' | Brings in 0adc6d6 (pop-ups always whole on screen and on top: the phones list, tool menus, slide editor menus, pickers, context menus) |
| 96c8298 | Merge branch 'worktree-agent-a50aeabb1a0a1fdf0' | Brings in 589918c (players send their Daily Double or Final wager secretly from their phone) |
| 2c6f65d | Merge branch 'worktree-agent-a21cda5a4267ff0d5' | Brings in 529b391 (saved themes shared as a file or a code, and more theme controls: alternating colors, gradients, borders, played-tile looks, plate styles) |
| 8c51705 | Merge branch 'worktree-agent-a8528ec06fe65151f' | Brings in 46aec31 (phones, teams and phone wagers polish: a late joiner can't see a seat's wager, phone layouts, wording) |
| 440a563 | Merge branch 'worktree-agent-a1c3e9d5c76149d53' | Brings in 0f345d5 (editor and themes polish: theme page layout, readability warnings, theme files open from Open… or a drop, multi-slide tab keys) |
| 2b0c71c | Merge branch 'worktree-agent-aab086842683332f6' | Brings in d5815e5 (RPG: selected players and objects drag together) |
| 7294085 | Merge branch 'worktree-agent-a51eab17137bfd25d' | Brings in 2b00fce (theme settings: a game's theme knows the theme it came from, Save changes to a saved theme, right-click menus, polish) |
| de0cc94 | Merge branch 'worktree-agent-a0507afcdb7b51df0' | Brings in 3baa022 (board game: edit the board during play; Roll, Move and Next turn as the main button with Previous turn beside it) |
| efe84a3 | Merge branch 'worktree-agent-a505055b32929844f' | Brings in 9ffa095 (pre-game polish: two columns on laptops, Start level with Back, Ctrl+Enter starts, same-name note) |
| 4acb133 | Merge branch 'worktree-agent-a2d07801aba305344' | Brings in bbc34aa (RPG polish: group drag across split view, the selection shown in the object list, no dark box over a hovered object) |
| c085ec1 | Merge branch 'worktree-agent-a7d43523363a340a3' | Brings in 38373de (viewer polish: no join code where nobody buzzes, Final ✔ clear of scores, end screen and roll-off fit, Final category in the theme's clue font) |
| fe18f30 | Merge branch 'worktree-agent-aaf8c5a3577eb5b92' | Brings in 3415a8e (slide editor and media polish: undo names for items, tools for several items, Move to sits under Position, used-where on media) |
| 34e1bb0 | Merge branch 'worktree-agent-ab6d5fd96a6ae417f' | Brings in 2d50bcd (RPG and board-game building: New shop in place, Enemy preset, space kinds, forks, Mini quest, plainer RPG round top) |
| 068bece | Merge branch 'worktree-agent-af8c8c9e9235d3a87' | Brings in ff9dff4 (going live: remembered display choice, Open audience window & start, room-first question, Going live checklist, keep-or-discard on Exit, ▶ Test this round) |
| 96b02e9 | Merge branch 'worktree-agent-a7ec9b00d4299f66c' | Brings in 74bc3f7 (host flow: Reveal after a right answer, Final reveals judge before moving on, N does the main thing, phone-offline badge, Buzz now cue) |
| 379150e | Merge branch 'worktree-agent-a446c6c80be823102' | Brings in 2721dee (stream session: Keep & leave keeps the room, rooms carry to the next game, the audience window stays open, Next game…) |
