# Jeopardy Builder "Brainrot"

Build and host custom Jeopardy-style games for livestreams. It all lives in one HTML file: open it in a browser and play,
with no install or server.

The full product spec is in [`docs/SPEC.md`](docs/SPEC.md).

## Using it

1. Build it (see below), or grab a built `jeopardy-builder.html`.
2. Double-click the file to open it in Chrome, Edge or Firefox.
3. **Editor**: set up players (unique colors), rounds (any number, 1–10 categories × 1–10 questions, any values),
   and clues (question + answer + optional host notes). Work is autosaved in the browser. **Save** downloads a `.jbr`
   game pack (the game plus all its media) that you can **Open** later. **Export JSON** gives a text-only copy.
4. **▶ Play**: confirm the players, pick a display mode, then start.
   - **Single window**: the top of the window is what viewers see. The host controls sit below it (`H` hides them).
   - **📺 Separate audience window**: a clean popup to capture in OBS (double-click it or press `F` for full-screen).
     The host window shows the answer, notes and standings, for your eyes only. Allow popups for the file if the browser asks.

### Host controls

| Key | Action |
|---|---|
| `1`–`9` | Select/deselect player N for scoring (any number of players, or none) |
| `Enter` / `Shift+Enter` | Award / deduct the amount (prefilled with the clue value, editable to anything) |
| `R` | Reveal the answer |
| `Esc` / `B` | Back to the board (marks the tile used) |
| `P`, then `1`–`9` | Make player N the current picker (or click their name plate) |
| `N` | Next step in Final Jeopardy |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo the last score change |
| `L` | Score log (undo/restore any single change) |
| `A` | Open/close the audience window |
| `H` | Hide/show host controls |
| `F` | Full-screen |

Other controls: click a score in the host panel to type an exact value, use the per-player **✘ −value** buttons for
wrong answers, and use **👥 Players** to add, remove or recolor players mid-game. If the browser closes mid-game, reopen the file
and press **Resume game**.

## Development

```sh
npm install
npm run dev        # dev server with hot reload
npm run build      # → dist/index.html (single self-contained file)
npm run check      # type-check
npm test           # unit tests (scoring, undo, round flow)
npm run test:e2e   # drives the built file from file:// in Chromium
```

Stack: Svelte 5 + TypeScript + Vite, bundled into one file by `vite-plugin-singlefile`. Autosave uses IndexedDB (`idb-keyval`).

## Status

Milestone **M1 (core game)** is done: editor, rounds, values, text clues, single-window play, flexible scoring, score log +
undo, autosave/resume, and a basic Final Jeopardy (no wagers yet). See the milestones in `docs/SPEC.md` §11 for what's next
(dual host/audience windows, `.jbr` packs with media, freeform slides, Daily Doubles, dice, wheel, image editor, themes).
