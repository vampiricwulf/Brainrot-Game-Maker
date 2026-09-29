# Jeopardy Builder "Brainrot"

Build and host custom Jeopardy-style games for livestreams. The whole app is **one HTML file**: double-click it to open it in a
browser, with no install, server or internet needed. Players buzz in by voice on the stream; the host runs the board and decides who
gets points.

The full product spec is in [`docs/SPEC.md`](docs/SPEC.md).

## Getting the app

- **Download from the [Latest release](../../releases/latest)**. It's rebuilt automatically on every push to `main`:
  - `jeopardy-builder.html`: the whole app in one file. Double-click it to open it in **Chrome, Edge or Firefox**.
    Everything works from a file opened from disk.
  - `jeopardy-builder-portable.exe`: the Windows desktop app, no install needed.
  - `jeopardy-builder-setup.exe`: an installer for the Windows desktop app.
- Or build it yourself (see [Development](#development)). It lands in `dist/index.html`.

## Building a game (Editor)

| Tab | What it's for |
|---|---|
| ⚙ **Setup & Players** | Default players (name + unique color), rules (negative scores, quick ✔/✘ buttons, points symbol), timers, round intro, and game **sounds** (round intro, Daily Double, time's up, Final think music, winner). |
| **Rounds** (one tab each; **＋ Add round**) | 1–10 categories × 1–10 questions, any values per row (×2 / ÷2 helpers), per-clue value overrides, **⭐ Daily Doubles** (by hand, or 🎲 Randomize, weighted toward the bottom rows). Click a tile to edit it. **Images**: 🖼 on a category (or drop an image on it) shows a picture instead of its name (Fit/Fill, optionally with the name on top); drop an image on a tile to show it instead of the value. Drop several files to fill the next categories or tiles. **🖼 Board images** places logos, stickers or GIFs anywhere on the round's board (see below). |
| 🎨 **Theme** | Classic / Dark / Brainrot Neon / Pastel presets, plus any colors, fonts, tile glow, a board background image, a **banner image above the board** (height and fit), and score bar position (bottom/top/hidden). |
| 🎡 **Wheels & Dice** | Saved wheels (weighted slices) and dice (any sides, custom faces, total ranges). Each slice or face is an **outcome**: a label plus optional details, image/GIF/video/audio, a countdown and, only if you want, a score effect (+/− points, × dice total, double, bankrupt, steal, swap). |
| 🖼 **Media** | Every file in the game, with usage counts and "remove unused". Files that play from the internet show 🌐 and their site, with **Save a copy** and **Check link**. Also **Paste a link** to add one, and a list of online players (YouTube, Google Drive's player). |
| **Final round** | Its on-screen **name** (e.g. "Final Brainrot"), category, question/answer slides and think time. There's also an optional **tiebreaker clue**. |

**Clue editor.** Each clue has a type (Standard, ⭐ Daily Double, 🎡 Wheel, 🎲 Dice), an optional countdown, an optional **tile
face** (custom text or an image instead of the value), host notes, and two slides: **Question** and **Answer**.
Plain clues never need the canvas: type into the **Question** and **Answer** fields above the slides. The Question field has
focus when a clue opens and Tab moves on, so you can type, Tab, type, then press **Ctrl+Enter** for the next clue
(**Shift+Ctrl+Enter** or Alt+← goes back). Each slide keeps its own undo history from the moment the clue opens, so an
answer typed while the question slide is showing can still be undone on the answer slide.

**Slide editor** (16:9, freeform):
- Add **text boxes**: bundled fonts or your own uploaded font, size / shrink-to-fit, bold/italic/underline/caps, alignment,
  line height, letter spacing, outline, drop shadow, glow, background box.
- Add **images**, **video**, **audio**, **shapes**, and **🌐 links**: YouTube, Google Drive, Streamable, or a link to a picture,
  video or sound file online (see [Online links](#online-links-catbox-google-drive-)).
- Click an item to select it (Shift/Ctrl+click adds or removes one). **Double-click** to edit it: text goes straight to its
  text field, and images open the image editor. With a text box selected you can also just start typing.
- Drag to move (with snapping guides; press Shift while dragging to keep to one axis, or Alt to skip snapping), pull the
  handles to resize, and use the round handle to rotate (Shift snaps to 15°). The handles stay reachable for items at the
  slide's edges or covering the whole slide.
- **Layers**: the **Layers** list shows every item top-first. Click to select (Shift/Ctrl adds), drag or ▲▼ to restack,
  👁 to hide an item while editing (it still shows in the game), and 🔒 to lock it. Locked items can't be dragged, resized,
  nudged, cut or deleted (Ctrl+A leaves them out, and Delete, Ctrl+X and the "Move to the slide's…" buttons skip them with a
  note saying so), and clicks go through them, so a full-slide background never gets in the way. The list still shows when
  a locked item is the only one on the slide, so you can always unlock it.
- **Stacked items**: **right-click** the slide to pick from everything under the pointer (plus restack, lock, hide,
  duplicate and delete). **Alt+click** walks down everything under the pointer, locked items too: the first click picks
  the top item, each further click the next one down, and after the bottom one it wraps back to the top. **Tab** /
  **Shift+Tab** steps through items. Drag a box on an empty spot to select several.
  `Ctrl+]` / `Ctrl+[` bring forward / send backward, and add **Shift** for front / back.
- **Entrance animations**: fade, pop, slide, typewriter, shake, spin. Click **▶ Preview** to watch them and hear the slide's
  video, audio and YouTube (🔈 mutes the preview). The preview is look-only; press Esc or click the slide to go back to
  editing. A YouTube embed keeps its own clicks there.
- Drop files or links onto the slide, or paste images, text and links. A YouTube link becomes a YouTube player, a link to
  a picture, video or sound (or a share link from a site like Google Drive or Dropbox) goes through 🌐 Link, and other
  text fills the empty main text box or makes a new one.
- Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste items between slides (a copy pasted onto the same slide lands offset), and
  **Copy slide / Paste slide** copies whole slides. Ctrl+D duplicates, Ctrl+B / Ctrl+I / Ctrl+U style the selected text,
  and the arrow keys nudge (Shift for 10 px). In the Layers list, ↑/↓ move through the list and Alt+↑/↓ restack instead.
- Ctrl+Z / Ctrl+Y undo and redo. Each slide keeps its history when you switch between Question and Answer, move to
  another clue or reopen one, and deleting shows a notice with an **Undo** button. Restacking, locking, duplicating and
  deleting are one step each, whether from the Layers list, the inspector, the right-click menu or a shortcut; hiding an
  item while editing isn't a change to the slide, so undo leaves it alone. On the Final tab, which shows two slides,
  shortcuts, copy and paste go to the slide you last clicked (or whose Question/Answer tab you switched).
- Shrink-to-fit text gets smaller as you type and keeps long words whole. The inspector shows the size it's drawn at,
  and a ⚠ badge in the editor flags text that can't fit its box.
- **Use this style elsewhere** copies a text look to every question and/or answer in the round or the whole game.
- Video/audio options: autoplay, loop, start muted, start/stop times, volume.
- **🎨 Edit image…** (or double-click an image): crop (free, 16:9, 4:3, 1:1, 9:16), rotate, flip, resize, brightness /
  contrast / saturation / hue / blur / grayscale / sepia / invert, meme text, emoji stickers, and a brush with an eraser.
  The original file is always kept; **Use original** undoes everything. Inside it, Ctrl+Z / Ctrl+Y undo and redo, and
  Ctrl+Enter applies. Esc or **Cancel** asks before throwing away unapplied edits (Esc in a text field just leaves it).
  With an aspect ratio picked, the crop box keeps that shape from any handle.

**Board images** (per round, **🖼 Board images** on the round's tab): drop or add images onto a live preview of the board, then
drag, resize, rotate or edit them like slide items. Each image has an **opacity**, can sit **behind the tiles** (it peeks
through the gaps) or on top of them, and can be **click-through** so the host can still click the tiles under it (a solid image
blocks the tiles it covers). The **Layers** list shows everything top-first: click to select, drag or ▲▼ to restack, 👁 to hide
an image while editing, 🔒 to lock it. **Copy to other rounds** puts the same images on every board.

The **Checklist** in the sidebar flags missing questions and answers, blank categories, wheel tiles with no wheel, missing or
unplayable media, what plays from the internet, and links that expire. Click an item to jump to the tab that fixes it.

### Online links (catbox, Google Drive, …)

Every place that takes a file (slide pictures, video and sound, tile and category images, the board image and banner, board
images, game sounds, wheel and dice outcomes) has **Or paste a link** in its file picker, e.g.
`https://files.catbox.moe/abc123.mp3`. On a slide, use **🌐 Link**, or paste or drop the link on the slide. While it works,
you see the progress and a **Cancel** button; a message then says what happened:

- **Saved a copy in your game**: the file was downloaded into the game. It works offline, goes into `.jbr` packs and
  exports, and keeps working if the link expires. Files over 150 MB ask first; files over 1 GB are never saved. A sound
  in an MP4 or WebM file (`.m4a`, `.weba`…) counts as a sound.
- **Plays from the internet** (🌐): the site doesn't let the game save a copy (or you said no to a big file, or it's over
  1 GB), so the file plays from the link during the show. It needs internet, in the host and audience windows alike.
  **Save a copy** in the Media tab (or the item's settings) tries again later; the image editor asks for a copy first.
  If a link stops working during the show, viewers just see an empty spot: only the host's copy of the stage and the
  host's media controls say what failed (with **Open link ↗**).

| Link | Browser (the `.html` file) | Desktop app (`.exe`) |
|---|---|---|
| Sites that allow it: `litter.catbox.moe`, GitHub, Dropbox, Discord, many image hosts | Saved copy | Saved copy |
| `files.catbox.moe` and other sites that don't | Plays from the internet | Saved copy |
| Google Drive picture | Plays from the internet (Google's picture link) | Saved copy |
| Google Drive video or sound | On a slide: **Google Drive's player**, or **⬇ Download from Drive** and add the file. Elsewhere: download and add the file. | Saved copy |
| YouTube, Streamable | On a slide only, in the site's own player | Same |

- **Share links** are understood: Dropbox, GitHub file pages, Imgur pages and `.gifv`, GIPHY (a silent looping clip),
  Pixeldrain, tmpfiles, SharePoint. Links that can't work say why and what to copy instead: Catbox and Imgur albums, Tenor
  pages, folders, OneDrive personal, Box's viewer, MEGA, and Discord links missing their `ex=…&is=…&hm=…` ending.
- **Temporary links** (Discord ~1 day, uguu ~3 hours, litterbox up to 3 days, tmpfiles ~1 hour): a saved copy is fine; a link
  that plays from the internet gets a warning, and the checklist flags it (and any that expired).
- **Google Drive**: share the file first. **In Google Drive: Share → General access → Anyone with the link → Copy link.**
  Google refuses Drive files to web pages, so the browser version shows Drive pictures through Google's picture link and
  can't play Drive video or sound itself. On a slide it can use **Google Drive's player** instead: it shows only on the
  screen viewers watch (the audience window, or the stage in single-window mode), and you click ▶ inside it there. The host
  gets **⟲ Restart**, **■ Stop** and **Open player window ↗**, but can't pause, seek or mute it (the host window and the
  editor show a card, so the sound never plays twice; ▶ Preview with sound on shows the player). The desktop app downloads
  Drive files like any other link, and explains Drive's own messages (not shared publicly, too many downloads, downloads
  turned off by the owner).
- catbox.moe is blocked in the UK and Ireland and by some internet providers (a VPN usually fixes it); Imgur isn't available
  in the UK.

### Saving and sharing

- Work **autosaves** in the browser. If the browser blocks storage for files opened from disk, the header warns you to use
  Save.
- Every file in a game has its own name: adding a file whose name is already taken (every pasted screenshot is
  `image.png`) gives it a random suffix, like `image-k3f9x2.png`, so files are easy to tell apart.
- **Save** downloads a **`.jbr` game pack** (a zip with the game plus all its media). **Open…** loads `.jbr` or `.json`.
- **⬇ Export HTML** makes a **single player-only HTML file** with everything inside. Send it to anyone; they double-click it
  and press ▶ Play. You're warned above ~100 MB. For big games, share the `.jbr` instead.
- **Export JSON** is a text-only copy, handy for hand-editing or writing clues with an AI.

## Hosting a game (Play)

1. Press **▶ Play**, then confirm the players (names, colors, starting scores; **＋ Add 3 sample players** if you have
   none) and pick a display mode:
   - **Single window**: viewers see this window. `H` hides the host controls.
   - **📺 Separate audience window**: a clean popup to capture in OBS (Window Capture). Double-click it or press `F` for
     full-screen, and **click it once** so it's allowed to play sound. The host window shows the answer, notes, standings and
     all controls. Allow popups for the file if the browser asks.

   **🔊 Sound for Discord / OBS…** has a **Test sound** button and the steps to get the game's sound onto your stream
   (see [Streaming the sound](#streaming-the-sound-discord-obs)).

   The pre-game screen also lists **things to check** (blank clues, a missing Daily Double with **🎲 Place now**, which
   adds only the missing ones, missing media…). They're only warnings: **Start game** works as soon as there's a player.
2. The round intro plays: title card → tiles fill in → press `N` to reveal each category (or **Skip intro**).
3. Click a tile. The question zooms in, and the answer is never on screen until you reveal it: **click the slide**, press
   `R`, or use **👁 Reveal answer**. Showed it by accident? Press `R` again or **🙈 Hide answer**. Click the answer
   slide to go back to the board.

   **Click the stage to drive the show**: click the intro to advance it, click the question to reveal it, click the
   wheel to spin it (and again to close it), click dice to roll them, and click to step through the final round. This
   works in the host's window only; the audience window never reacts to clicks.
4. **Scoring**: toggle any players (`1`–`9`; zero, one or many), set any amount (prefilled with the clue value), then
   **Award** (`Enter`) or **Deduct** (`Shift+Enter`). The per-player **✔ +value** / **✘ −value** buttons score one player
   in one click. Click a score to type an exact value (`Esc` cancels). Every change is logged and undoable (`Ctrl+Z`, 📜 Log);
   undo takes back a whole award at once (all the players it touched), and the toast says what it undid (**↷ Redo** or
   `Ctrl+Shift+Z` puts it back).
5. **▦ Done ▶ board** (`Esc`) marks the tile used. Right after a correct answer, that player becomes the picker (★).
   Opened the wrong tile? **↩ Cancel (keep tile)** (`Shift+Esc`) goes back without using it up (so does `Esc` on the Daily
   Double splash); once points were given for the clue, undo them first. A used tile of the current round can be put back
   with **right-click** on the host's board, **↶ Reopen** in the host panel, or **Reopen tile** in the 📜 Log.
6. **Next round ▶** / **Final Jeopardy! ▶** / **End game ▶** sit on the right of the host panel. With tiles left they ask inline first
   ("12 clues left · go on? Yes"). **◀ Prev round**, or going back to a round later, never replays its intro.

**Daily Double**: a splash plays, then you pick the player and enter the wager (capped TV-style at their score or the round's
top value; **Ignore the limit** overrides). The wager is prefilled for scoring.

**Timers**: they start automatically when a clue has one, or any time with `T`. At zero you get a TIME'S UP banner and your
optional sound. Nothing is scored automatically.

**Media**: the host panel has play/pause, seek, ±5 s, time, volume, mute, loop and restart for the slide's video/audio/YouTube
(`Space`, `←`/`→`, `M`). If **YouTube won't embed** (common for files opened from disk), the host gets **▶ Open on YouTube**,
which opens the real page in a popup window you can capture on stream (`Y`). **Google Drive's player** can only be restarted,
stopped (taken off the screen) or opened in its own window (`Y`); press ▶ inside it in the audience window.

**Tools, any time**: **🎲 Dice** (d4–d100, 2d6, or anything like `3d37`, plus saved dice), **🎡 Wheel** (saved wheels, or a
quick wheel from a list), **🏁 Who goes first** (everyone rolls in their color, tied leaders re-roll, and the winner becomes
the picker), **📊 Scores** overlay. These show full-screen on the audience view. Results can be tagged with a player for the
**roll log**. Score effects only apply when you press **Confirm**.

**Final round** (renameable): category → private wagers (players at $0 or less sit out unless allowed) → question with think timer and
music → answer → **reveal each player one by one** (spotlight, show wager, ✔/✘) → winner screen with confetti. In the
reveals, `N` shows the spotlit player's wager and then moves to the next player, `C` / `X` mark them right / wrong, and once
everyone is judged a second `N` finishes (finishing earlier asks first). **◀ Back to <last round>** leaves the final round
during the category and wager steps (wagers are kept). **Ties** offer a roll-off, the tiebreaker clue, or co-winners.

**Game over**: fix any score by clicking it, go **◀ Back to final reveals** to change a judgment, **📋 Copy results** (one line
for chat; tied players share a medal), or **🔁 Rematch** with the same players at 0 (until it starts, the editor still offers
**View results** for the finished game).

**Players mid-game**: 👥 Players can add, rename or recolor players. Removing one asks first, and they can be restored
with their score (and their Final wager) from the same dialog.

**Leaving and resuming**: **Exit** keeps the game. The editor then shows **Resume game** (also after a reload or a
crash), plus **Resume with my edits** to carry on with the editor's current version of the game (fixed typos, new
slides, even deleted or reordered rounds). Starting a new game while one is saved asks first. Scores, used tiles and logs are autosaved after every change.

### Host keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`9` | Select/deselect player N for scoring |
| `Enter` / `Shift+Enter` | Award / deduct the amount |
| `R` | Reveal the answer (press again to hide it) |
| `Esc` / `B` | Close the tool overlay, or go back to the board (the tile is used) |
| `Shift+Esc` | Cancel the clue: back to the board, the tile stays playable (not once points were given for it) |
| Right-click a used tile | Put it back on the board |
| `N` | Next step (round intro, Final Jeopardy; in the reveals: show the wager, then the next player) |
| `C` / `X` | Final reveals: mark the spotlit player right / wrong |
| `T` | Start/pause the countdown |
| `P`, then `1`–`9` | Make player N the current picker |
| `D` / `W` / `O` / `S` | Roll dice again / spin the wheel / roll-off / scoreboard |
| `Space` / `←` `→` / `M` | Play/pause, seek ±5 s, mute the slide's media |
| `Y` | Open YouTube/online media in its own window |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo the last score change (a whole multi-player award at once) |
| `L` | Score & roll log |
| `A` | Open / focus the audience window (it never closes it; the 📺 button does, after asking) |
| `H` / `F` / `?` | Hide host controls / full-screen / show all shortcuts |

## Streaming the sound (Discord, OBS)

In dual mode all game sound plays in the **audience window** and the host window stays silent; in single-window mode the
host window plays it. **🔊 Sound** in the host panel (or **🔊 Sound for Discord / OBS…** before the game) opens the sound
help:

- **▶ Test sound** plays a short chime in the window that plays the sound and says what happened: "Sound played in the
  audience window", or "Blocked: click the audience window once" (browsers only let a window play sound after it was
  clicked once). While the audience window can't play sound, or a game sound was blocked there, the host panel says so,
  whatever is on screen.
- **Game audio output** sends the game's sound to another device, e.g. a virtual cable (VB-CABLE) that OBS captures with
  an *Audio Output Capture*. In Chrome, Edge and the desktop app, **List my speakers** asks for microphone access only so
  the browser shows the speakers' names (nothing is recorded); Firefox uses its own **Choose speaker…** picker. The choice
  is remembered on this computer and covers game sounds, slide video/audio, wheel/dice media and the test chime.
  YouTube, Google Drive's and Streamable's players and "Open link" pop-ups can't be moved: they always play on the default
  device. If the chosen device is unplugged, the sound falls back to the default device and the host is told. Hidden in
  browsers that can't do this.
- Step-by-step help for **Discord on Windows**, **OBS**, **Mac** and **Linux**. The short version for Discord: use the
  Discord desktop app, **Share Your Screen › Applications**, pick the audience window ("*game name* · Audience", or the
  browser window showing it) with **Sound** on, then press Test sound and ask a viewer. Still silent: in Discord's
  **Voice & Video › Screen Share**, flip "Use an experimental method to capture audio from applications" and restart
  Discord, or share the whole screen with sound.

**In the desktop app** the game's sound is played by Microsoft Edge WebView2's helper processes, not by the app's own
`.exe`, and Discord and OBS capture sound per program. So:

- Start it normally: running it **as administrator** or with a **compatibility setting** makes WebView2 start its
  processes outside the app, where Discord and OBS can't find them. The host window then shows a red warning.
- Opening it a second time just brings the running app to the front.
- The audience window may play sound right away (no "click once" needed).
- **Discord audio fix** (on by default; switch it off in the 🔊 Sound help) starts WebView2 with its audio inside its
  main process, a direct child of the app, which is what lets Discord's per-program capture hear the game (tested on
  Windows with Discord). Turning it off or on needs a restart (**↻ Restart now**). Switching it off is saved as the empty
  file `discord-audio-fix-off` in `%APPDATA%\com.jeopardybuilder.brainrot\` (delete it to turn the fix back on).
- The fix never keeps the app from starting. Right after a restart, WebView2 can refuse a changed setting for a few
  seconds while the previous copy's WebView2 processes close, so the app keeps trying for about 4 seconds, then starts
  with the other setting for that run:
  - fix on but started without it: the host panel and the Sound help say so, and **↻ Restart now** tries again. If it
    keeps happening, share your whole screen with sound, or run the show in Chrome or Edge;
  - fix switched off but started with it: the Sound help offers the restart that turns it off.

  If WebView2 won't start either way, a message box says so.
- If WebView2 crashes with the fix on (both windows go blank: with the fix, the sound and any audio software that hooks
  into it run inside WebView2's main process), the app restarts without the fix. The host panel and the Sound help say "The
  Discord audio fix was turned off for this run because WebView2 crashed with it", and it stays off until you press
  **↻ Try it again**. Your setting itself isn't changed.

**Trying the audio fix on an older build** (before it was built in): close Jeopardy Builder, open a Command Prompt
and run the two lines below; for the second one, drag the `.exe` into the Command Prompt window to paste its path, then
press Enter. WebView2 adds this variable to the app's own switches and only keeps the last `--disable-features`, so it
must repeat the full list:

```bat
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,AudioServiceOutOfProcess --autoplay-policy=no-user-gesture-required
"C:\Users\you\Downloads\jeopardy-builder-portable.exe"
```

It works if Task Manager (Details tab, with the "Command line" column) no longer shows an `msedgewebview2.exe` whose
command line contains `--utility-sub-type=audio.mojom.AudioService`. Then go live in Discord on the audience window (it's
listed as "*game name* · Audience") with Sound on and check that a viewer hears Test sound.

### If the app won't open or its window stays blank

Turn the Discord audio fix off from outside the app, in either of these ways, then open Jeopardy Builder normally:

- **Command Prompt**: press Win+R, type `cmd` and press Enter, then paste this line and press Enter. It creates the
  settings folder (if it isn't there yet) with the empty `discord-audio-fix-off` file in it:

  ```bat
  mkdir "%APPDATA%\com.jeopardybuilder.brainrot" 2>nul & type nul > "%APPDATA%\com.jeopardybuilder.brainrot\discord-audio-fix-off"
  ```

  A `discord-audio-fix-off.txt` made with Explorer's **New › Text Document** in that folder works too.
- **Shortcut**: right-click the `.exe` › **Create shortcut** (on Windows 11, under **Show more options**), then
  right-click the shortcut › **Properties** and add ` --no-audio-fix` at the very end of **Target**, after the closing
  quote if there is one, e.g. `"C:\Users\you\Downloads\jeopardy-builder-portable.exe" --no-audio-fix`. Open Jeopardy
  Builder once with this shortcut: it saves the fix as off, and if a blank copy is still open, restarts that copy
  without the fix. A Command Prompt works the same way: `"C:\path\to\jeopardy-builder-portable.exe" --no-audio-fix`.

To turn the fix back on later, tick it in the 🔊 Sound help (or delete the file).

## Desktop app (experimental)

The same app can be wrapped as a native Windows program with [Tauri](https://tauri.app) (`src-tauri/`):

- Grab it from the [Latest release](../../releases/latest), or run the **Desktop (Windows .exe)** workflow by hand from
  the Actions tab.
- Or locally: install Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/), then run
  `npm run desktop:build` (or `npm run desktop:dev`).

Every push to `main` builds the `.exe` in CI and attaches it to the **Latest** release. In the desktop app,
**📺 Audience window** opens a second app window (capture it in OBS; `F` or a double-click makes it full-screen on its
monitor), the "Open on YouTube" fallback opens its own window, and closing the host window quits the app. Opening
the app again brings the running one to the front. For Discord/OBS sound, see
[Streaming the sound](#streaming-the-sound-discord-obs). Pasted links are downloaded natively, so every site (Google Drive
and `files.catbox.moe` included) gives a saved copy. The host window may download from any web address except
`localhost`, `127.0.0.1`, `[::1]` and `0.0.0.0` (`src-tauri/capabilities/http.json`; the list compares addresses as
written, so other local or network addresses aren't blocked).

## Development

```sh
npm install
npm run dev        # dev server with hot reload
npm run build      # → dist/index.html (single self-contained file)
npm run check      # type-check (svelte-check)
npm test           # unit tests (scoring, undo, Daily Double, Final, dice, wheel, roll-off, sound helpers, online links)
npm run test:e2e   # drives the built file from file:// in Chromium (build first)
```

Stack: Svelte 5 + TypeScript + Vite, bundled into one file by `vite-plugin-singlefile`. Autosave and media use IndexedDB
(`idb-keyval`), `.jbr` packs use JSZip, and the fonts are bundled from `@fontsource` (SIL Open Font License).

### Code map

| Path | What's there |
|---|---|
| `src/lib/model.ts` | Data model (game, slides, clues, wheels, dice, session) and factories |
| `src/lib/session.ts` | Game flow and scoring: score log, undo/redo, Daily Double, Final, round intro, ties |
| `src/lib/tools.ts`, `overlay.ts` | Dice, weighted wheel, roll-off, score effects; the full-screen tool overlays |
| `src/lib/live.ts`, `sync.svelte.ts` | On-screen transient state (pops, timer, sounds, overlays) and host ⇄ audience window sync |
| `src/lib/media.svelte.ts`, `mediactl.svelte.ts` | Media store (blobs + IndexedDB, live links, `addMediaLink`) and playback control / YouTube helpers |
| `src/lib/links.ts`, `download.ts`, `sniff.ts` | Online links: every host's URL rules and messages; downloading (browser or native) and trying a link live; file-type sniffing and Google Drive's pages |
| `src/lib/audio.ts`, `audioout.svelte.ts` | Game sound: test chime (a generated WAV), blocked-sound reports, Game audio output (`setSinkId`) |
| `src/lib/desktop.svelte.ts` | Desktop app only: the Discord audio fix setting, restart, the "running as administrator" check |
| `src/lib/pack.ts`, `export.ts` | `.jbr` packs and standalone HTML export |
| `src/lib/imageedit.ts`, `theme.ts` | Image-editor canvas pipeline; theme presets |
| `src/lib/editing.ts`, `autofit.ts` | Slide and image editor helpers (undo history, placement, crop geometry); shrink-to-fit text |
| `src/lib/layers.ts` | Layers: hit testing (what's under the pointer, what a drag-to-select box touches), Alt+click stepping, restacking |
| `src/editor/` | Editor UI (rounds, clue & slide editor, image editor, wheels & dice, theme, media, `LinkField` for pasted links) |
| `src/play/` | Play UI (audience view, board, host panel, tools) |
| `src/audience/` | The audience window app |
| `src-tauri/` | The desktop app (window handling, single instance, native link downloads, the Discord audio fix: its WebView2 switches, start fallback, crash recovery and off switches) |
