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
| ⚙ **Setup & Players** | Default players (name + unique color), rules (negative scores, quick "wrong" buttons, points symbol), timers, round intro, and game **sounds** (round intro, Daily Double, time's up, Final think music, winner). |
| **Rounds** (one tab each; **＋ Add round**) | 1–10 categories × 1–10 questions, any values per row (×2 / ÷2 helpers), per-clue value overrides, **⭐ Daily Doubles** (by hand, or 🎲 Randomize, weighted toward the bottom rows). Click a tile to edit it. **Images**: 🖼 on a category (or drop an image on it) shows a picture instead of its name (Fit/Fill, optionally with the name on top); drop an image on a tile to show it instead of the value. Drop several files to fill the next categories or tiles. **🖼 Board images** places logos, stickers or GIFs anywhere on the round's board (see below). |
| 🎨 **Theme** | Classic / Dark / Brainrot Neon / Pastel presets, plus any colors, fonts, tile glow, a board background image, a **banner image above the board** (height and fit), and score bar position (bottom/top/hidden). |
| 🎡 **Wheels & Dice** | Saved wheels (weighted slices) and dice (any sides, custom faces, total ranges). Each slice or face is an **outcome**: a label plus optional details, image/GIF/video/audio, a countdown and, only if you want, a score effect (+/− points, × dice total, double, bankrupt, steal, swap). |
| 🖼 **Media** | Every file in the game, with usage counts, "remove unused" and a list of online links. |
| **Final round** | Its on-screen **name** (e.g. "Final Brainrot"), category, question/answer slides and think time. There's also an optional **tiebreaker clue**. |

**Clue editor.** Each clue has a type (Standard, ⭐ Daily Double, 🎡 Wheel, 🎲 Dice), an optional countdown, an optional **tile
face** (custom text or an image instead of the value), host notes, and two slides: **Question** and **Answer**.

**Slide editor** (16:9, freeform):
- Add **text boxes**: bundled fonts or your own uploaded font, size / shrink-to-fit, bold/italic/underline/caps, alignment,
  line height, letter spacing, outline, drop shadow, glow, background box.
- Add **images**, **video**, **audio**, **shapes**, and **🌐 links** (YouTube or direct media URLs; these need internet during
  the game).
- Drag to move (with snapping guides), pull the handles to resize, and use the round handle to rotate (Shift snaps to 15°).
- **Entrance animations**: fade, pop, slide, typewriter, shake, spin. Click **▶ Preview** to watch them.
- Drop files onto the slide, or paste images. Ctrl+C / Ctrl+V copies items between slides, and **Copy slide / Paste slide**
  copies whole slides. Ctrl+Z / Ctrl+Y undo and redo.
- **Use this style elsewhere** copies a text look to every question and/or answer in the round or the whole game.
- Video/audio options: autoplay, loop, start muted, start/stop times, volume.
- **🎨 Edit image…** (or double-click an image): crop (free, 16:9, 4:3, 1:1, 9:16), rotate, flip, resize, brightness /
  contrast / saturation / hue / blur / grayscale / sepia / invert, meme text, emoji stickers, and a brush with an eraser.
  The original file is always kept; **Use original** undoes everything.

**Board images** (per round, **🖼 Board images** on the round's tab): drop or add images onto a live preview of the board, then
drag, resize, rotate or edit them like slide items. Each image has an **opacity**, can sit **behind the tiles** (it peeks
through the gaps) or on top of them, and can be **click-through** so the host can still click the tiles under it (a solid image
blocks the tiles it covers). The **Layers** list shows everything top-first: click to select, drag or ▲▼ to restack, 👁 to hide
an image while editing, 🔒 to lock it. **Copy to other rounds** puts the same images on every board.

The **Checklist** in the sidebar flags missing questions and answers, blank categories, wheel tiles with no wheel, missing or
unplayable media, and online links. Click an item to jump to the tab that fixes it.

### Saving and sharing

- Work **autosaves** in the browser. If the browser blocks storage for files opened from disk, the header warns you to use
  Save.
- **Save** downloads a **`.jbr` game pack** (a zip with the game plus all its media). **Open…** loads `.jbr` or `.json`.
- **⬇ Export HTML** makes a **single player-only HTML file** with everything inside. Send it to anyone; they double-click it
  and press ▶ Play. You're warned above ~100 MB. For big games, share the `.jbr` instead.
- **Export JSON** is a text-only copy, handy for hand-editing or writing clues with an AI.

## Hosting a game (Play)

1. Press **▶ Play**, then confirm the players (names, colors, starting scores) and pick a display mode:
   - **Single window**: viewers see this window. `H` hides the host controls.
   - **📺 Separate audience window**: a clean popup to capture in OBS (Window Capture). Double-click it or press `F` for
     full-screen, and **click it once** so it's allowed to play sound. The host window shows the answer, notes, standings and
     all controls. Allow popups for the file if the browser asks.
2. The round intro plays: title card → tiles fill in → press `N` to reveal each category (or **Skip intro**).
3. Click a tile. The question zooms in, and the answer is never on screen until you reveal it: **click the slide**, press
   `R`, or use **👁 Reveal answer**. Showed it by accident? Press `R` again or **🙈 Hide answer**. Click the answer
   slide to go back to the board.

   **Click the stage to drive the show**: click the intro to advance it, click the question to reveal it, click the
   wheel to spin it (and again to close it), click dice to roll them, and click to step through the final round. This
   works in the host's window only; the audience window never reacts to clicks.
4. **Scoring**: toggle any players (`1`–`9`; zero, one or many), set any amount (prefilled with the clue value), then
   **Award** (`Enter`) or **Deduct** (`Shift+Enter`). The per-player **✘ −value** buttons handle quick wrong answers. Click a
   score to type an exact value. Every change is logged and undoable (`Ctrl+Z`, 📜 Log).
5. **Back to board** (`Esc`) marks the tile used. Right after a correct answer, that player becomes the picker (★).

**Daily Double**: a splash plays, then you pick the player and enter the wager (capped TV-style at their score or the round's
top value; **Ignore the limit** overrides). The wager is prefilled for scoring.

**Timers**: they start automatically when a clue has one, or any time with `T`. At zero you get a TIME'S UP banner and your
optional sound. Nothing is scored automatically.

**Media**: the host panel has play/pause, seek, ±5 s, time, volume, mute, loop and restart for the slide's video/audio/YouTube
(`Space`, `←`/`→`, `M`). If **YouTube won't embed** (common for files opened from disk), the host gets **▶ Open on YouTube**,
which opens the real page in a popup window you can capture on stream (`Y`).

**Tools, any time**: **🎲 Dice** (d4–d100, 2d6, or anything like `3d37`, plus saved dice), **🎡 Wheel** (saved wheels, or a
quick wheel from a list), **🏁 Who goes first** (everyone rolls in their color, tied leaders re-roll, and the winner becomes
the picker), **📊 Scores** overlay. These show full-screen on the audience view. Results can be tagged with a player for the
**roll log**. Score effects only apply when you press **Confirm**.

**Final round** (renameable): category → private wagers (players at $0 or less sit out unless allowed) → question with think timer and
music → answer → **reveal each player one by one** (spotlight, show wager, ✔/✘) → winner screen with confetti. **Ties** offer
a roll-off, the tiebreaker clue, or co-winners.

If the browser closes mid-game, reopen the file and press **Resume game**. Scores, used tiles and logs are autosaved after
every change.

### Host keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`9` | Select/deselect player N for scoring |
| `Enter` / `Shift+Enter` | Award / deduct the amount |
| `R` | Reveal the answer (press again to hide it) |
| `Esc` / `B` | Close the tool overlay, or go back to the board |
| `N` | Next step (round intro, Final Jeopardy) |
| `T` | Start/pause the countdown |
| `P`, then `1`–`9` | Make player N the current picker |
| `D` / `W` / `O` / `S` | Roll dice again / spin the wheel / roll-off / scoreboard |
| `Space` / `←` `→` / `M` | Play/pause, seek ±5 s, mute the slide's media |
| `Y` | Open YouTube/online media in its own window |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo the last score change |
| `L` | Score & roll log |
| `A` | Open/close the audience window |
| `H` / `F` / `?` | Hide host controls / full-screen / show all shortcuts |

## Desktop app (experimental)

The same app can be wrapped as a native Windows program with [Tauri](https://tauri.app) (`src-tauri/`):

- Grab it from the [Latest release](../../releases/latest), or run the **Desktop (Windows .exe)** workflow by hand from
  the Actions tab.
- Or locally: install Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/), then run
  `npm run desktop:build` (or `npm run desktop:dev`).

Every push to `main` builds the `.exe` in CI and attaches it to the **Latest** release. In the desktop app,
**📺 Audience window** opens a second app window (capture it in OBS; `F` or a double-click makes it full-screen on its
monitor), the "Open on YouTube" fallback opens its own window, and closing the host window quits the app.

## Development

```sh
npm install
npm run dev        # dev server with hot reload
npm run build      # → dist/index.html (single self-contained file)
npm run check      # type-check (svelte-check)
npm test           # unit tests (scoring, undo, Daily Double, Final, dice, wheel, roll-off)
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
| `src/lib/media.svelte.ts`, `mediactl.svelte.ts` | Media store (blobs + IndexedDB) and playback control / YouTube helpers |
| `src/lib/pack.ts`, `export.ts` | `.jbr` packs and standalone HTML export |
| `src/lib/imageedit.ts`, `theme.ts` | Image-editor canvas pipeline; theme presets |
| `src/editor/` | Editor UI (rounds, clue & slide editor, image editor, wheels & dice, theme, media) |
| `src/play/` | Play UI (audience view, board, host panel, tools) |
| `src/audience/` | The audience window app |
