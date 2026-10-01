# Changelog

What changed in Brainrot Games Maker, newest first. Every push to `main` builds the **Latest** release, so entries
are grouped by day rather than by version. Each entry names the commits it covers, so it also serves as the
readable record where a commit title says little (see [Notes on the history](#notes-on-the-history)).

How to add to it: put a line under **Unreleased** in the same commit as the change (or the merge that brings it in),
under Added / Changed / Fixed / Removed, in plain words for the people who make and host games. When a day's work is
done, the Unreleased lines move under that day's heading.

## Unreleased

### Added
- **Screen readers hear the game**: the host panel's status line, awards and score changes ("Ann +$200, now $1,200"),
  the phone buzz order, a tie, who is answering, toasts and the undo notes are read out from one polite live region
  that's always on the page. A burst of changes is said once, together. (8bb6edc, c34ccb7, 8b514bd)
- **A warning before a chroma-key game** when a player's color is close to the key (a green player on a green key): OBS
  would key them out. It suggests another color or the other key. (8bb6edc)
- **The editor's checklist says when a category name is too long** to read on its board. (8bb6edc, 2c772e8)
- **Windows High Contrast**: selected players, pressed buttons and the chosen theme preset are outlined, as box shadows
  and tints disappear there. (8bb6edc)
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
- **📋 Game rules mid-game**: a small **📋** next to 👥 Players in the host panel opens the same rules as before the
  game. Changes count at once and are kept with the game in the editor (undoable there). When the game is full,
  👥 Players offers **Raise Most players to …** next to the greyed-out ＋ Add player. (1d355db)
- **`Ctrl+Z` / `Ctrl+Y` on the pre-game screen** undo and redo the changes made there (players, rules, buzzers, on
  stream, Daily Doubles placed), the same steps as the editor's 🕘 History, and the list and rules show it at once.
  In a name you've just typed in, `Ctrl+Z` first undoes the typing there, as in the editor. The browser's own undo no
  longer changes a field behind your back. (1d355db)
- **History's Go there for players and rules**: a step in Play › Players, Game rules, Phone buzzers or On stream now
  has **Go there**, which opens the ▶ Play screen at that part. (An undo in the editor never starts a game.) (1d355db)
- **The buzzer server limits new rooms**: 6 a minute from one address ("Too many new rooms — wait a minute") and 1000
  a day in all ("The buzzer server is busy today — try again tomorrow"), so nobody can use up its free daily quota.
  (bde9ae8)
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

### Changed
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
  one line ("…"), so a crowd of avatars no longer overlaps. (8bb6edc, 8b514bd)
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
  above the stats strip, and the editor's checklist warns about spaces under it. (79dbf8e)

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
