# Changelog

What changed in Brainrot Games Maker, newest first. Every push to `main` builds the **Latest** release, so entries
are grouped by day rather than by version. Each entry names the commits it covers, so it also serves as the
readable record where a commit title says little (see [Notes on the history](#notes-on-the-history)).

How to add to it: put a line under **Unreleased** in the same commit as the change (or the merge that brings it in),
under Added / Changed / Fixed / Removed, in plain words for the people who make and host games. When a day's work is
done, the Unreleased lines move under that day's heading.

## Unreleased

### Changed
- Keep in game and Resume with my edits follow screens moved in the editor; a party on a screen that no longer exists
  goes to the start. (4eef0fe)
- A Final round has its own **"Players with a score of 0 or less can play it"** option (on for a new Final). It used to
  be one game-wide setting in ⚙ Setup; older games keep their choice on each of their Finals. (288972f)
- A **Daily Double's wager stays off the stream** until the host presses **Show wager**, as a Final's wagers do.
  (288972f) In single-window mode viewers still see the wager box while the host types in it.
- The play history says who bought or sold in a shop ("Ann buys Potion") and which party moved once there are several
  ("Party 2 west"). ＋ Text in an RPG round opens the new text's card. The in-play keys list mentions `R` hiding the
  answer again, `Ctrl+Y`, and `Esc` closing a card. (1d763ac)

### Added
- This changelog.
- **Jeopardy board editor**: drag round tabs to reorder them (`Alt`+`↑`/`↓`, `Delete`, `F2`, `Ctrl+D` on a tab); drag a
  tile onto another to swap the clues (`Ctrl`-drag copies); drag category headers and right-click them to insert,
  duplicate, clear or delete; arrow keys move around the board, `Enter` opens a clue, `Delete` clears it, `Ctrl+C` /
  `Ctrl+V` copy a whole clue (across rounds and games); insert, move or delete rows anywhere; `Alt`+arrows in the clue
  editor go to the clue above, below or beside; the Final and Tiebreaker get quick Question / Answer fields. (84d5e19)
- **Board game editor**: select several spaces (`Shift`-click or a box) and move, colour or delete them together;
  arrow keys nudge, `Tab` steps through spaces, `Ctrl+D` duplicates; `Alt`-drag (or ⊕) links two spaces, and a link's
  right-click menu makes it two-way, reverses or removes it; zones reorder and have ↶ ↷. (83427b3)
- **Lists everywhere** (wheel slices, wheels & dice, stats, items, shops and their stock, action buttons, players):
  drag ⋮⋮ or `Alt`+`↑`/`↓` to reorder, ⧉ / `Ctrl+D` to duplicate, a right-click menu (not yet on shop stock, zones
  or players), and deletes with Undo. `Enter`
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
- Map tabs take `Alt`+`←`/`→`, `Ctrl+D`, `Delete` and `F2`, like round tabs. Wheel slices and action buttons have a
  right-click menu. Right-click menus show their keyboard shortcuts, and the shortcuts sheet lists the board, round
  tab and map tab keys. (84ad8f2, 7180280, 86f9f05, f3405d5)
- ⚙ Settings: **how many changes undo remembers** (300 by default, 20–2000). Lowering it forgets the oldest at once,
  never a redo.

### Fixed
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
