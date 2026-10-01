# Changelog

What changed in Brainrot Games Maker, newest first. Every push to `main` builds the **Latest** release, so entries
are grouped by day rather than by version. Each entry names the commits it covers, so it also serves as the
readable record where a commit title says little (see [Notes on the history](#notes-on-the-history)).

How to add to it: put a line under **Unreleased** in the same commit as the change (or the merge that brings it in),
under Added / Changed / Fixed / Removed, in plain words for the people who make and host games. When a day's work is
done, the Unreleased lines move under that day's heading.

## Unreleased

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
  also just pick one. Tied phones say "Tie! The host is rolling for it", then "Tie — you rolled 2nd".
  (bde9ae8, 9920218)
- **↺ Reset buzzers** in the host panel (or `0`): nobody is locked out of the clue any more and the buzzers open for
  everyone. (9920218)
- If the buzzer server turns down a new room, the pre-game card shows its reason in plain words. (9920218)
- **The buzzer server limits new rooms**: 6 a minute from one address ("Too many new rooms — wait a minute") and 1000
  a day in all ("The buzzer server is busy today — try again tomorrow"), so nobody can use up its free daily quota.
  (bde9ae8)

### Changed
- **The editor's ⚙ Setup tab is now 🔊 Sounds**, and holds only the sounds. **Players are added on the ▶ Play
  screen** (before the game): add, rename, recolor, pick a picture, reorder and delete them there, and they're kept
  with the game for next time (undoable in the editor's 🕘 History). The rules, timers and round intro moved there
  too, in a **⚙ Game rules** fold that remembers whether you left it open (the buzzer options are on the 📱 Phone
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

### Added
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
- **Import round / Paste round from another copy of the same game** no longer silently uses this game's own world,
  wheels, dice, stats, items, shops or files where the other copy's differ: the other version comes in as a copy (the
  toast says "Brought the file's “Adventure” world as a copy"), and this game's stays as it was. The same thing with the
  same content is still shared. Opening another game to take rounds or a theme from no longer overwrites this game's
  file of the same id in the browser's storage.
- Pasting a round twice names them "Adventure (copy)" and "Adventure (copy 2)", and a template added twice is
  "Jeopardy! (2)".

### Removed
- **Buzzing in from this computer's keys**: buzzers are phones only, since games are played online. The "Players buzz
  from" choice and the audience window's buzz-in keys are gone (older games drop them quietly; one with Buzzer mode on
  keeps it, now meaning phone buzzers). (4306034)

## 2026-09-30

### Added
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
- README rewritten, shorter, with screenshots (`npm run screenshots` retakes them). (519bf7d)

### Changed
- **Renamed** from Jeopardy Builder to **Brainrot Games Maker**; old `.jbr` packs and exports still open, and the
  desktop app moves its data folders on first start. (77b10ad)
- Downloads are `brainrot-game-maker.html` and `brainrot-game-maker-portable.exe`; the desktop app saves into a
  **BrainrotSaves** folder next to the `.exe` and lists those saves in Open…. (b1a4b99)
- New games start with no rounds. (f6dc059)
- Nothing pops up over the stage mid-show: questions for the host appear in the host panel. (4c416ec, 17fa216,
  01f121a)
- Viewers see a "Starting soon…" card until Start; a tie for first isn't announced as a win until it's settled;
  rankings share places. (cf00c51)

### Fixed
- **Typing no longer lags in big games** (was up to about half a second per keystroke). (80872b7)
- A polish pass of 122 audit findings plus two review rounds (about 50 more): keys going to the thing behind an open
  window, deletes without undo, layout at 1280×720, undo interactions between scores and RPG moves, save names with
  non-English letters, and many more. (28dc502 … c2ed8f1)
- The Windows build failed on a file-name clash that only matters on Windows. (1b53e98)

## 2026-09-29

### Added
- **Online media links** (catbox, Google Drive…): save a copy, or play them live. (cedb00a, e2789c4, c81b01e)
- **Streaming sound**: Test sound, blocked-sound warnings, an output picker, and the desktop app's Discord audio fix
  (on by default, with fallbacks and an escape hatch). (b14eb91, 51754dc, 1c2e484, 556f466, a543384)
- **Board images**: category images, a banner, tile images and freely placed images. (0585ff6)
- Slide editor **layers list** and easy selection of stacked items. (87d6f74)
- Built-in **"Pick a player"** wheel; edit a wheel for one spin with Save as / Overwrite. (474fb0a, d2ca193)
- **ℹ About** with the version, links and where data is saved. (a3b48ef)
- Renameable final round, click-to-act stage, hide the answer again, rolling release. (a492413)
- The milestones that built the app: core editor and play (M1), audience window and game packs (M2), slide editor
  (M3), Daily Doubles, timers, Final wagers and ties (M4), dice, wheels and roll-off (M5), image editor and themes
  (M6), HTML export and checklist (M7), the desktop app (M8). (32f5702 … 23b7fd9)

### Changed
- The desktop app ships as a portable `.exe` plus the HTML file (no installer). (93caf2f)
- Safer hosting: Exit keeps the game, guarded navigation, reopen tiles. (b84166d, edc75a4)

### Fixed
- Saving: no freezes, no lost media, and a way to fix missing files. (6206c66)
- Many slide, clue and image editor fixes (undo, handles, crop, paste, previews). (ed5d6d5, 973db30, 657ec01, …)

## 2026-09-28

### Added
- Product and technical spec (`docs/SPEC.md`). (77db1e0)

## Notes on the history

Commits whose titles don't say what they contain:

| Commit | Title | What it is |
|---|---|---|
| bbb1495 | Merge 2 | Merge of the play timeline and undo for the host's choices (d2c21f8, 5f079cc) |
| d83cd7b | Revert "Undo covers tiles…" | Takes back fb07abe (Ctrl+Z reopening a closed tile). Tiles can still be put back with ↶ Reopen or a right-click, and closing a tile is an undoable step since d2c21f8. |
