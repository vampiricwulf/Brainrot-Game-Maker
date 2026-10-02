# Brainrot Games Maker

Build and host game shows for livestreams: Jeopardy boards, Final Jeopardy, RPG adventures and board games. The host
runs everything and players answer by voice on the stream.

The whole app is **one HTML file**. Open it in a browser with no install, server or internet. There's also a Windows
desktop app.

![A Jeopardy board in play](docs/screenshots/play-board.png)

## Download

Get it from the **[Latest release](../../releases/latest)** (every push to `main` is released, numbered
`MAJOR.MINOR.PATCH`):

- **`brainrot-game-maker.html`**: double-click it to open it in Chrome, Edge or Firefox.
- **`brainrot-game-maker-portable.exe`**: the Windows desktop app. No install needed.

**Updating.** When a newer version is out, the editor says so (it asks GitHub when it starts, at most every few hours;
⚙ Settings can turn that off, and ℹ About checks any time):

- The desktop app updates itself: **⬆ Update to …** downloads the new `.exe`, checks it's signed with the project's
  key, saves your game and restarts into it, in the same place. (A copy built without the key offers the download.)
- The HTML file offers the new file: save it in place of the old one (same name and folder) and open it. Your games
  carry over: they're kept in the browser, not in the file.

ℹ About shows which version you have.

Old Jeopardy Builder games (`.jbr` packs and exported HTML files) still open.

## Quick start

1. **＋ Add round** and pick a mode.
2. Fill it in. For example, click a tile to type the clue, then **Tab** to the answer and **Ctrl+Enter** for the next
   clue.
3. Press **▶ Play**, then add the players (and set the game rules) on the pre-game screen.

New here? **Try a sample game** on the first screen, or start from a template in **＋ Add round**. **📥 Import clues…**
on a board takes a sheet pasted from Google Sheets or Excel, and **Find** (`Ctrl+F`) searches the whole game.

![The editor](docs/screenshots/editor.png)

## Round modes

A game is a list of rounds, and each round has a mode. You can reorder, duplicate or delete any round. **Copy round**
(a round tab's right-click menu) and **📋 Paste round**, or **📂 Import rounds…** (from a .brainrot file), bring a round from
another game with the worlds, wheels, dice, stats, items, shops and files it uses. Where this game already has one of
those from another copy of the same game but it differs, the other version comes in as a copy and this game's stays.

| Mode | What it is |
|---|---|
| 🟦 **Jeopardy board** | 1–10 categories × 1–10 clues. Supports custom values, Daily Doubles, and images on categories and tiles. |
| 🏆 **Final Jeopardy** | Private wagers, think music, then a one-by-one reveal and a winner screen. |
| 🗺 **RPG** | Players explore a map of screens. It has stats, items, shops, characters and doorways. |
| ♟ **Board game** | A path of spaces with forks and zones. Players move by dice, a wheel, or one space per turn. |

Every clue or screen is a **slide**: text, images, GIFs, video, audio or YouTube, arranged freely.

<table>
<tr>
<td><img src="docs/screenshots/rpg-editor.png" alt="RPG world editor"></td>
<td><img src="docs/screenshots/boardgame-editor.png" alt="Board game editor"></td>
</tr>
<tr>
<td align="center">RPG world editor</td>
<td align="center">Board game editor</td>
</tr>
</table>

**Keyboard and drag:** round tabs, clue tiles, categories, rows, list items and map screens can be dragged and have
right-click menus; `Delete`, `F2`, `Ctrl+D` and `Ctrl+C` / `Ctrl+V` work on what's selected. Files drop onto the slot
they belong in. Press `?` (or ⌨ next to ℹ About) for every editor shortcut.

**Slide editor:** drag a box on an empty spot to select several items. Beside a text box's words counts as empty (until
it's selected), so a full-slide question doesn't move when you meant to select; `Alt`+drag always draws a box. Items
snap to the slide and to each other while moving and resizing (`Alt` turns it off). With several selected, Left /
Center / Right / Top / Middle / Bottom line them up with each other, and **Space evenly** spreads three or more. The
**Layers** list shows whenever the slide has an item, so every item can be reached from the keyboard. Text outlines,
shadows and glows get room inside their box, so they're never cut off at its edge, and **Typewriter (letter by
letter)** types the text out (all at once with reduced motion). The same file added twice is stored once (a toast says
it's already in 🖼 Media). Replacing a file in 🖼 Media redoes the ✎ edits of pictures made from it on the new file.

**RPG map editor:** drag a screen to move it or swap it with another (dropping past the edge grows the map, dropping
on a map tab moves it there), `Delete` deletes the selected screens, arrows / `Enter` / `Alt`+arrows / `Ctrl+D` /
`Ctrl+C` `Ctrl+V` / `F2` work on the grid, `Shift`-click or a box selects several (`Alt`+drag draws a box from
anywhere, on a full map too), and pictures dropped on the map become screens. Click ⛔ between two screens to block
the way.

**Board game editor:** the board keys the same way. It's one `Tab` stop: the arrows go to the nearest space that way
(`Shift` adds it to the selection), `Enter` opens its settings and `Tab` goes on to them. `Alt`+arrows move the selected
spaces (`Shift`+`Alt` further), `F2` renames, `Ctrl+D` duplicates, `Ctrl+C` / `Ctrl+V` copy and paste spaces with their
buttons (onto any board, in any game), `Delete` deletes. `Ctrl`+click adds a space, `Alt`+drag links two. The
movement dice are kept by the dice themselves, so renaming them in 🎡 Wheels & Dice keeps them.

Other editor tabs:

- 🔊 **Sounds**: the sounds played on stream (right, wrong, dice, wheel, buzz…): preview, replace or switch each off.
- 🎨 **Theme**: presets, colors, fonts and background images.
- 🎡 **Wheels & Dice**: weighted wheels and custom dice. Each outcome can carry a score effect or action buttons.
- 📊 **Stats & Items**: HP bars, currencies, items, wearable gear and shops.

**Copy and paste** slide items or whole slides between clues, rounds and even games; their pictures and sounds come
along.

**Right-click** almost anything for a quick menu. This works on rounds, tiles, map screens, spaces, avatars and items.

**Undo** (`Ctrl+Z`, `Ctrl+Y` to redo) covers every change in the editor and takes you to where it happened. Deleting
doesn't ask first: a "Deleted … · Undo" note brings it back. The **🕘 History** tab lists every change and jumps back to
any point; it survives a reload (⚙ Settings sets how many changes it keeps, 300 by default).

![The History tab](docs/screenshots/history.png)

## Hosting

Press **▶ Play** to get to the pre-game screen. Add the players there (rename, recolor, pick a picture, drag ⋮⋮ or
`Alt`+arrows to reorder; type a name and press `Enter` for the next one; they're kept with the game for next time),
open **⚖ Game rules** for scoring, the most players, timers and the round intro, and turn on phone buzzers on the
**📱 Phone buzzers** card (all saved with the game too). `Ctrl+Z` / `Ctrl+Y` undo and redo the changes made there (the
same steps as the editor's 🕘 History, where **Go there** brings you back to this screen). Then pick one of two modes.
Viewers see a "Starting soon…" card until you press **Start game**, which stays at the foot of the window however long
the page gets (on a wide screen the page is two columns). A **🔁 Rematch** keeps the players, their colors and pictures.

- **Single window**: viewers see this window. Press `H` (or **🙈 Hide**) to hide the host controls; **Show controls**
  waits, out of sight, in the top-right corner until the mouse moves.
- **📺 Separate audience window**: a clean window to capture in OBS or Discord. The host window keeps the answers,
  notes and controls.

Click a tile to open its clue, then reveal the answer with `R` or a click. A clue can have several question slides (a
lead-in, then more: **＋ Add slide** in the clue editor): the main button goes **Next slide ▶** (`N`, `Shift+N` back)
through them first, and the audience window shows the slide you're on. Select players and **＋ Award** (`Enter`) or
**− Deduct** (`Shift+Enter`); on the board the Amount row stays folded behind **± Adjust score** until a player is
selected.

The host panel keeps one layout in every round: the status line (with the 📱 phones and ⏱ timer chips and **↩ Cancel
(keep tile)** on the right), the players' score chips, the row of what this moment needs, and at its right the one
main button with its key (**👁 Reveal answer** `R`, **▦ Done ▶ board** `Esc`, **Show question ▶**, **Spin!** `W`,
**Next turn ▶** `N`, the Final's next step `N`…). Under it come the tools (🎲 Dice, 🎡 Wheel, 🏁 Who goes first, 📊
Scores) with the round navigation (◀ Prev round, the round list, Next round ▶) at the right, then a fixed bar that
never moves: **↶ Undo ↷ Redo 🔊 Sound ⌨ · 📜 Log 👥 Players ⚖ Rules · ⏸ Cover 🙈 Hide · 📺 Audience ▭ · 🚪 Exit**.
Anything that asks first (Exit, closing the audience window, leaving a round, 🔁 Rematch) asks in one strip right
above that bar: Cancel on the left, the answer on the right. Leaving a round always asks, unless a board is played out
(then **Next round ▶** is the main button). In RPG and board-game rounds on a wide window the panel is a column beside
the stage, with the same parts and 🚪 Exit in the bottom-right corner.
The rules can change mid-game too: **⚖ Rules** next to 👥 Players in the host panel opens ⚖ Game rules (they count at once
and are kept with the game), and at the most players 👥 Players offers **Raise Most players**.
Every change can be undone with `Ctrl+Z`, including RPG and board game moves, items and live edits.
Nothing pops up over the stage: questions for the host (a locked door, naming a new screen…) appear in the host panel.
Screen readers hear what's going on: the host panel's status line, awards and scores, the buzz order and who is
answering, and the app's notes are announced (politely, a burst of changes said once). The host's board is one Tab
stop: the arrow keys go from tile to tile. In Windows High Contrast, the selected players and pressed buttons are
outlined.

![A clue on screen](docs/screenshots/play-clue.png)

**Tools, any time:**

- 🎲 Dice
- 🎡 Wheels, including a built-in **Pick a player** wheel. Several wheels can spin at once.
- 🏁 Who goes first
- 📊 Scores (with 📋 Copy standings for chat)

**Phone buzzers** (Buzzer mode, on the pre-game screen's 📱 Phone buzzers card, saved with the game): start the room
and share the code, link or QR code (it's on the viewers' Starting soon card too). Players open the link on their
phone, tap their name and get a big BUZZ button, Jackbox-style; new players can ask to join from their phone if you
allow it. With **Teams** on, each player is a team: people pick their team on their phone and type their own name, and
whoever on it buzzes first answers for the team ("Ann (Red team)" in the buzz order); a wrong answer locks out the
whole team. The buzzers open when the clue does, or when you press `U` after reading it. The fastest reaction wins, timed
on each player's own phone, so a slow connection doesn't cost anyone the buzz. Every buzz is listed in the host panel,
fastest first: a wrong answer locks that player out and opens the buzzers for the rest, **→ Next in line** gives the
answer to the next one who buzzed, and **↺ Reset buzzers** (`0`) lets everyone buzz again. Buzzes within 0.01 s are a
tie: **🎲 Roll for it** sets who answers first, or pick one yourself (`1`–`9` or a click always picks by hand). Viewers
see "🔔 Ann is answering" whenever one player is picked during a clue. Phones also say who got a clue right and what's
on (a Daily Double's player sees "you're up"), beep and flash when BUZZ! lights up (🔔 mutes), and **Not you?** lets a
player change seats. The room stays open through the pre-game screen, a reload of it and **◀ Back to editor**; it closes
with Exit, at the end of the game or with **✕ Close the room**. The join code shows small in a corner of the stream
during the game (at the end of the score bar on the board) and on the cover card; the On stream options can hide it.
**🔒 Lock seats** keeps new phones out, and a player whose seat you take back (✕) can't take it again for 2 minutes.
The rooms run on a small buzzer server
(`buzzer/`, a Cloudflare Worker); the release builds come with one, and ⚙ Settings › Buzzer server can point at your
own. Copies built without one say "Phone buzzers aren't set up in this copy", and play a game saved with Buzzer mode
on without it (you pick who answers); the setting stays with the game for a copy that has a server.

**Sounds** are built in and on by default (right, wrong, dice, wheel, buzz, reveal, and an RPG's quiet steps,
doorways, pick-ups, coins and damage…): preview, replace or switch each
off in the editor's 🔊 Sounds tab (↺ goes back to the built-in sound; a sound switched off keeps the file chosen for it).
The players and rules aren't there: the tab says so at the top, with a button to the ▶ Play screen.

**For OBS:** Theme › Stage background can be chroma green or magenta for keying (the pre-game screen warns when a
player's color is close to the key, which would key it out), and **▭** (or `Shift+A`) opens a
scores-only window for a lower-third capture. The "Starting soon" and cover cards can be edited, with a countdown
(the host sees its time left). **Reduce motion on stream** is in the pre-game screen's On stream section too.

**Made to read on a scaled-down stream** (720p or 480p in Discord): scores shrink to fit their plates and long names
end in "…" instead of being cut off, a board's values share one size that fits its columns, category names never get
smaller than about 30 stage pixels (very long words are hyphenated; the editor's checklist says when a name is too long
for the board), the countdown and "🔔 Ann is answering" move the question down instead of covering its first line,
and score pops stay on screen. New players get colors that stay apart for color-blind viewers (the first 8); a game
keeps the colors it was saved with. The winner's confetti is a short burst beside the standings (none with Reduce
motion on stream).

**Single-window mode shows viewers everything on screen**, including wagers as you type them, answers, host notes and
hidden objects. Use the separate audience window when that matters.

![Two wheels spinning together](docs/screenshots/wheels.png)

**RPG rounds** have these controls:

- The stats strip along the bottom never covers the screen: the screen is scaled into the room above it (past 6
  players the strip is one row of compact cards). The map on stream is solid, and the players' dots on it carry their
  initials.
- A movement pad, and a minimap that expands to the full map so you can jump the party anywhere. On a big world the
  minimap shows the screens around the party; the arrow keys go from screen to screen on it.
- The map on stream (`V`) shows only what viewers know, with a cell around it, and says when the party is on a map
  hidden from them.
- Split and regroup parties. An object's "the party" buttons act on the party standing at that object.
- Player cards with stats and inventory.
- Shops.
- Live improvising: edit the screen, add text, or draw objects on a drawpad.

**Board game rounds** have these controls (as in RPG rounds, the board is scaled into the room above the stats
strip, so no space is ever under it):

- Roll (or spin the movement wheel) and move, picking the way at each fork. Moving back goes back the way the player
  came.
- Send players to any space.
- Each space's actions, for the player they're for (the one who landed there, or the ones picked on its card).

<table>
<tr>
<td><img src="docs/screenshots/play-rpg.png" alt="An RPG round"></td>
<td><img src="docs/screenshots/play-boardgame.png" alt="A board game round"></td>
</tr>
</table>

**Ties** for first aren't called a win on stream until they're settled, in one of three ways:

- A roll-off, whose winner wins the game (`O` on the results screen).
- A tiebreaker clue: select the winner and ＋ Award. Its Amount starts at 0, so settling the tie adds no points.
- Co-winners.

The winner fanfare plays once the tie is settled.

**Exit** keeps the game in progress, and **Resume game** picks it up later, even after a crash. Resume asks how the
game is shown, **Single window** or **📺 Separate audience window** (the same choice as before the game), and a game
left with the screen covered comes back covered.

### Keyboard shortcuts

The main ones (press `?` during the game for all of them):

| Key | Action |
|---|---|
| `1`–`9` | Select player N |
| `P` then `1`–`9` | Make player N the current picker |
| `Enter` / `Shift+Enter` | Award / deduct |
| `R` | Reveal / hide the answer (the countdown stops) |
| `←` `↑` `→` `↓` on a tile | Move across the board (`Enter` opens the tile; after a clue the keys go on from its tile) |
| `Esc` / `Shift+Esc` | Back to the board / cancel the clue (the tile stays playable) |
| `N` | Next step (intro, a clue's next slide, Final, next turn) |
| `C` / `X` | Final reveal: right / wrong |
| `T` / `Shift+T` | Start/pause the timer / 10 more seconds |
| `D` / `W` / `O` / `S` | Roll the last dice again (a board game's own dice) / wheel / roll-off (on a tie for first: the tied players) / scoreboard |
| `K` or `B` | "Be right back" cover (every round): the countdown and the clue's video wait under it |
| `0` | Select everyone or no one (in buzzer mode: reset the buzzers) |
| `U` | Buzzer mode: open the buzzers (when they open on your key) |
| `A` / `Shift+A` | Open (or focus) the audience window / the scores-only window |
| `L` | Log: the history (go back to any point), scores and rolls |
| `H` | Hide / show the host controls |
| `F` | Full-screen |
| `Space` / `←` `→` / `M` | Play/pause, seek, mute media |
| `Y` | Open YouTube / online media in its own window |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `J` / `V` / `G` (RPG) | Full map / map on screen / regroup everyone here |
| `I` (RPG, board game) | Player sheet |
| Numpad or `Alt`+arrows (RPG) | Move the party |

## Saving

- **Save** (`Ctrl+S`) writes a `.brainrot` pack: the game plus all its media.
  - In the desktop app, saves go in a **BrainrotSaves** folder next to the `.exe` (in Documents\BrainrotSaves when the
    app may not write there, e.g. in Program Files). Closing the window while a save is being written asks whether to
    wait for it.
  - In a browser, they're downloads. A file over 100 MB asks where to save it instead (Chrome, Edge), so a big download
    can't fail unnoticed.
  - Changes made while a save is being written aren't in it, so they still count as unsaved.
- **Open…** lists your **Recent games** and, in the desktop app, BrainrotSaves. It also opens `.json` games, exported
  HTML files and the desktop app's `.bak` backups. Dropping a game file (`.brainrot`, `.zip`, `.json`, `.html`) on the
  editor opens it, and the desktop app opens a game file you open it with.
  - **Recent games** keeps the last 8 games New or Open… replaced (about 1 GB of files at most), with their undo
    history. When one has to go to make room, the app says which. Two versions of one game are both kept. A game with
    only a title isn't kept. **🗑 Delete** asks first: it deletes the kept copy and its files.
  - Opening an older copy of a game never changes the pictures and sounds of the game you have open: a file that
    differs is opened as a file of its own.
- New and Open… ask **Cancel / Discard / Save first** when the game has unsaved changes (Open… checks the file is a
  game first). Only one browser tab edits at a time: another tab waits, paused, and offers **Edit here** once the
  editing tab closes.
- **⬇ Export HTML** makes a single file to host the game from, with everything inside. It shows the answers, so keep
  it to yourself. A game over about 375 MB is too big for one HTML file (browsers can't read it back): save a
  `.brainrot` instead.
- Add pictures, videos, sounds and fonts on the **🖼 Media** page: drop them there, or use **＋ Add files…**.
- **⚙ Settings** (in the header's ⋯ menu, with Export JSON, ⌨ Keyboard shortcuts and ℹ About) has these options:
  - **Reduce motion on stream** (the editor and host controls also follow your computer's reduce-motion setting).
  - **Undo**: how many changes Ctrl+Z and the 🕘 History tab remember (300 by default).
  - **Autosave** every few minutes (desktop app). The default is every 5 minutes, keeping the last 3.
  - **Save replaces the game's last save** and keeps the two before it as `.bak` / `.bak2` (desktop app, on by
    default); off makes `Game (2)`, `Game (3)`… instead. Autosaves are kept per game.
  - **Buzzer server**: where phone buzzer rooms are made, with a **Test** button (the release builds come with one).
    An exported HTML file keeps the server it was exported with.

## Streaming the sound (Discord, OBS)

In dual-window mode, the sound plays from the **audience window**. **🔊 Sound** in the host panel has a **Test sound**
button, a speaker picker (e.g. for a virtual cable into OBS), and step-by-step help.

**Discord:**

1. **Share Your Screen › Applications**.
2. Pick the audience window, with **Sound** on.
3. If viewers hear nothing, turn on Discord's *experimental method to capture audio* (**Voice & Video › Screen Share**)
   and restart Discord.

**Desktop app:**

- Don't run it as administrator or with compatibility settings. Discord and OBS can't hear it then.
- The **Discord audio fix** is on by default. Switch it off in the 🔊 Sound help.
- If the window stays blank, turn the fix off in either of these ways, then reopen the app:
  - Start the app with `--no-audio-fix`.
  - Create an empty file named `discord-audio-fix-off` in `%APPDATA%\com.brainrotgames.maker\`.

  ```bat
  mkdir "%APPDATA%\com.brainrotgames.maker" 2>nul & type nul > "%APPDATA%\com.brainrotgames.maker\discord-audio-fix-off"
  ```

The desktop app keeps its data in `%LOCALAPPDATA%\com.brainrotgames.maker`: the game in progress and media. Settings go
in `%APPDATA%\com.brainrotgames.maker`. **ℹ About** opens both folders. To uninstall, delete the `.exe` and those
folders.

## Development

```sh
npm install
npm run dev            # dev server
npm run build          # → dist/index.html (one self-contained file)
npm run check          # type-check
npm test               # unit tests
(cd buzzer && npm ci)  # once: the buzzer server's packages (its e2e tests run it)
npm run test:quick     # the quick end-to-end test (about a minute; CI waits for it before releasing)
npm run test:e2e       # the full end-to-end suite (about 10 minutes; CI runs it alongside the release)
npm run screenshots    # regenerate docs/screenshots (build first)
npm run desktop:build  # Windows app (needs Rust + Tauri prerequisites)
```

The stack is Svelte 5, TypeScript and Vite, bundled into a single file. The desktop app is [Tauri](https://tauri.app)
(`src-tauri/`). Specs are in [`docs/SPEC.md`](docs/SPEC.md) and
[`docs/GAMES-MAKER-SPEC.md`](docs/GAMES-MAKER-SPEC.md).

| Path | What's there |
|---|---|
| `src/lib/` | Model, game flow and scoring, tools, media, saving, RPG (`rpg.ts`) and board game (`boardgame.ts`) logic |
| `src/editor/` | The editor |
| `src/play/` | Hosting: the stage, host panel, RPG and board game play |
| `src/audience/` | The audience window |
| `src-tauri/` | The desktop app |
| `tests/e2e/`, `scripts/` | Browser tests, the screenshot script and the version script |

### Versions and releases

Versions follow [Semantic Versioning](https://semver.org). Every push to `main` is released by CI as `vX.Y.Z`
(`.github/workflows/build.yml`), numbered by `scripts/version.mjs` from the last release and the `CHANGELOG.md`
lines the push adds:

- only lines under **Fixed** → a patch (1.4.2 → 1.4.3);
- anything under **Added**, **Changed** or **Removed** → a minor (1.4.2 → 1.5.0);
- a line marked **Breaking** (e.g. saves older versions can't open) → a major (1.4.2 → 2.0.0).

`package.json`'s version is a floor: raise it by hand (`node scripts/version.mjs set 2.0.0`) for a deliberate step.
`node scripts/version.mjs check` makes sure `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
`Cargo.toml` and `Cargo.lock` agree. The release notes are the changelog lines added since the last release.

**Signing the desktop app's updates** (once): the desktop app only installs an update signed with the project's key.

1. `npx @tauri-apps/cli signer generate -w ~/.tauri/brainrot-update.key` (works from any folder; pick a password;
   keep the key file private and backed up: without it, installed copies can't update themselves any more).
2. In the repository's Settings › Secrets and variables › Actions: secret **`UPDATE_SIGNING_KEY`** = the key file's
   contents, secret **`UPDATE_SIGNING_KEY_PASSWORD`** = its password, variable **`UPDATE_PUBKEY`** = the public key
   it printed (also in `brainrot-update.key.pub`).

Without them CI still releases, unsigned, and the desktop app offers the download instead of updating itself.
