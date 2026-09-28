# Jeopardy Builder "Brainrot": Product & Technical Spec

Status: **Draft v1** · Last updated: 2026-09-28

A tool for building and hosting custom Jeopardy-style games that are livestreamed to friends.
Players buzz in by voice on the stream, so the app handles no buzzers. The host runs the board,
decides who gets points, and controls media.

---

## 1. Goals & Non-Goals

### Goals
- **Zero-install usage.** Double-click an `.html` file (or, later, an `.exe`) and it works offline.
- **One app, two modes.** An **Editor** builds the game and **Play** mode runs it.
- **Built for streaming.** A clean audience view with no answer leaks, plus a separate host control view.
- **Flexible scoring.** Award or deduct any amount, to any number of players (including none).
- **Rich content.** Freeform slides with text, images (with basic editing), video, and audio.
- **Fun tools.** Dice, wheels, Daily Doubles, timers, and Final Jeopardy.

### Non-Goals (v1)
- Buzzers, networked multiplayer, or player-side devices.
- Online hosting, accounts, or a cloud sync backend.
- Built-in sound-effect library. Users can attach their own audio anywhere (see §9).
- Mobile-optimized editing. Play mode should still render acceptably on tablets.

---

## 2. Delivery & Distribution

| Artifact | Description | Priority |
|---|---|---|
| `jeopardy-builder.html` | Single self-contained file (editor + player). Built with Vite + `vite-plugin-singlefile`. | **P0** |
| Game pack `*.jbr` (zip) | Main save format: `game.json` plus a `media/` folder. | **P0** |
| Standalone game `*.html` | Export: player-only HTML with the game and media base64-embedded. Warn when it is over ~50 MB. | **P1** |
| Desktop `.exe` / `.app` | Tauri wrapper around the same build. Adds native file dialogs and large-file handling. | **P2** |

**Browser targets:** latest Chrome, Edge, and Firefox. Safari is best-effort.
Everything must work from a `file://` URL: no server, and no network requests at runtime (fonts and libraries are bundled).

---

## 3. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| UI framework | **Svelte 5 + TypeScript** | Small bundle, simple reactivity |
| Build | **Vite** + `vite-plugin-singlefile` | Outputs one `.html` |
| Slide canvas / element editing | **Konva.js** (via `svelte-konva`) or plain DOM with `moveable` | Drag, resize, rotate handles. Decide in the spike (§14). |
| Image editor | Canvas 2D API + **Cropper.js** for crop | Filters via canvas `filter`; brush/annotate on an overlay canvas |
| Zip packs | **JSZip** | Read and write `.jbr` |
| Local persistence | **IndexedDB** via `idb-keyval` | Autosave, crash recovery, media blobs |
| Two-window sync | `window.open()` + `postMessage` (primary), `BroadcastChannel` (fallback) | `postMessage` to an opened window is reliable on `file://` |
| Fonts | Bundled subset (e.g. Inter, Oswald, Bebas Neue, Comic Neue, Press Start 2P, Anton) + user-uploaded `.ttf/.otf/.woff2` | Uploaded fonts are stored in the pack |
| Desktop wrapper | **Tauri 2** (P2) | Small binaries |
| Tests | Vitest (logic), Playwright (E2E against the built HTML) | |

**Why not fork an existing Jeopardy project?** Existing open-source ones (JeopardyLabs clones,
jeopardy-js, and similar) are simple category grids with none of the freeform slides, media,
wheel/dice, or two-window support. Their data models would be rewritten anyway. We reuse
well-developed *libraries* instead of a base app.

---

## 4. Core Concepts & Data Model

```ts
Game {
  id, title, version: 1,
  theme: Theme,
  settings: GameSettings,
  players: PlayerTemplate[],        // default roster; editable at game start / mid-game
  rounds: Round[],                  // 1..N
  final?: FinalRound,               // optional
  wheels: WheelPreset[],
  dicePresets: DicePreset[],
  media: MediaRef[],                // index of files in media/
  fonts: FontRef[],
}

GameSettings {
  allowNegativeScores: boolean      // default true
  deductOnWrong: boolean            // default true (enables quick "-value" buttons)
  defaultTimerSeconds?: number      // null = no timer
  finalTimerSeconds: number         // default 30
  displayMode: 'dual' | 'single'    // default for this game; toggleable live
  currencySymbol: string            // "$", "", "pts", "🧠", ...
}

PlayerTemplate { id, name, color /* hex, unique */, avatar?: MediaRef }

Round {
  id, name,                         // "Jeopardy!", "Double Jeopardy", "Brainrot Round"
  categories: Category[],           // columns: 1..10
  rowCount: number,                 // questions per category: 1..10
  values: number[],                 // default value per row, e.g. [200,400,600,800,1000]
  valueMultiplier?: number          // optional helper, e.g. 2 for Double
}

Category { id, title: RichText, headerSlide?: Slide, clues: Clue[] /* length = rowCount */ }

Clue {
  id,
  value: number | null,             // override of round.values[row]; null = inherit
  type: 'standard' | 'dailyDouble' | 'wheel' | 'dice',
  wheelPresetId?, dicePresetId?,    // for wheel/dice clue types
  questionSlide: Slide,             // the "clue" shown to players
  answerSlide: Slide,               // the "response" (hidden from audience until revealed)
  hostNotes?: string,               // shown only in host view
  timerSeconds?: number | null,     // override
  empty?: boolean                   // blank tile (not playable)
}

FinalRound { category: RichText, categorySlide: Slide, questionSlide: Slide, answerSlide: Slide, timerSeconds, music?: MediaRef }

Slide {
  background: { color?, gradient?, image?: MediaRef, fit: 'cover'|'contain' },
  elements: SlideElement[]          // z-ordered
}

SlideElement = TextEl | ImageEl | VideoEl | AudioEl | ShapeEl
  common: { id, x, y, w, h, rotation, opacity, zIndex, entrance?: Animation, locked? }
  // coordinates are in a fixed 1920x1080 logical space, scaled to fit

TextEl  { text: RichText, font, size, weight, italic, underline, color, align, vAlign,
          lineHeight, letterSpacing, stroke?:{color,width}, shadow?:{color,x,y,blur},
          glow?:{color,blur}, background?:{color,padding,radius}, autoFit: boolean }
ImageEl { media: MediaRef, edits: ImageEdits /* non-destructive */ , fit }
VideoEl { media: MediaRef, autoplay, loop, muted, startAt?, endAt?, volume, showControls }
AudioEl { media: MediaRef, autoplay, loop, startAt?, endAt?, volume, visible /* icon on slide or hidden */ }
ShapeEl { shape: 'rect'|'ellipse'|'line'|'arrow', fill, stroke }

WheelPreset { id, name, segments: { label, color, weight /* proportion */, media?: MediaRef }[],
              spinDurationMs, removeAfterLanding: boolean }
DicePreset  { id, name, dice: { sides: number /* 2..1000 */, count: number, customFaces?: string[] }[] }

// Runtime (not part of the authored game)
Session {
  gameId, players: Player[] /* {id,name,color,score} */,
  used: Record<clueId, true>, currentRound, scoreLog: ScoreEvent[],
  finalWagers?: Record<playerId, number>
}
ScoreEvent { id, ts, playerId, delta, reason: string /* "Round 1 · Memes $400" */, clueId? , undone? }
```

---

## 5. Editor Mode (Builder)

### 5.1 Game setup
- New game wizard: title, theme preset, number of rounds, and for each round the number of categories, rows, and default values.
- **Values**: edit per round (row defaults), with per-clue overrides. A "×2 for this round" helper. Any integer is allowed, including negatives and 0.
- **Players (default roster)**: add/remove, name, unique color. The color picker prevents duplicates and suggests a distinct palette. Optional avatar image.
- Toggles: Final Jeopardy on/off, negative scores, deduct-on-wrong, default timer.

### 5.2 Board editor
- A grid view of the round that mirrors the play board. Click a category header or tile to edit it.
- Add/remove/reorder categories and rows (drag and drop). Duplicate a category. Mark a tile **empty**.
- Tile badges show the clue type (DD, wheel, dice), whether media is attached, and whether the answer is missing.
- Validation panel: empty clues, missing answers, broken media, and duplicate player colors.

### 5.3 Slide editor (question / answer / category header / Final)
- 16:9 canvas with snapping guides, grid, and alignment tools (left/center/right, distribute).
- Insert: Text, Image, Video, Audio, Shape. Drag-drop files onto the canvas.
- Transform: move, resize, rotate, z-order, lock, duplicate, delete, multi-select, and copy/paste between slides.
- **Text controls**: font (bundled + uploaded), size, auto-fit, weight/italic/underline, color, alignment
  (horizontal + vertical), line height, letter spacing, outline/stroke, drop shadow, glow, background
  box, and inline rich text (per-word color and bold).
- **Effects / animations** (entrance, per element): none, fade, pop/zoom, slide from edge, typewriter
  (text), shake, and spin. Optional delay. Plays when the slide is shown.
- "Apply style to all clues in round/game" and "Save as slide template."
- Default template: centered, auto-fit clue text in the classic style.

### 5.4 Image editor (modal; non-destructive; original kept)
- Crop (free / 16:9 / 1:1 / 4:3), rotate 90° and free, flip H/V, and resize.
- Filters: brightness, contrast, saturation, hue, blur, grayscale, sepia, and invert.
- Text overlays (meme style: Impact-like font, stroke) and **stickers/emoji**.
- Brush / annotate: color, size, eraser, and undo.
- Output: edits are stored as parameters and baked into a rendered PNG/WebP cached with the pack. "Reset to original" is always available.

### 5.5 Media
- Accepted: **Images** png, jpg/jpeg, gif (animated), webp, svg, avif · **Video** mp4 (H.264/AAC), webm, mov*, mkv*, ogv · **Audio** mp3, wav, ogg, m4a/aac, flac, opus.
  `*` Playback depends on the browser's codec support. The editor tests-decodes on import and warns
  if the file won't play (e.g. HEVC `.mov`).
- A media library panel lists everything in the game with its size and usage count. "Remove unused" is available.
- Per-element playback settings: autoplay, loop, muted, start/end trim, and volume.

### 5.6 Wheel & dice preset editor
- **Wheel**: segments with label, color, and **weight** (the slice size and landing probability are proportional
  to the weight). A live preview shows the percentages. Optional image per segment. Spin duration. "Remove segment after it lands" option.
- **Dice**: any number of dice with any number of sides (d2–d1000), and custom face labels (e.g. `["Steal","Double","Nothing",...]`).
  Default quick presets: d4, d6, d8, d10, d12, d20, d100, 2d6.
- Presets are saved with the game. Clue types `wheel` and `dice` link to a preset.

### 5.7 Theme
- Presets: **Classic** (blue board, gold values), **Dark**, **Brainrot Neon**, and **Pastel**.
- Overrides: board background (color/gradient/image/video), tile color, tile font/color, category header style,
  value text style, used-tile look, score bar style, and player-color accent usage.

### 5.8 Save / load / export
- **Save** → download `.jbr` (zip). **Open** → file picker or drag-drop.
- **Export standalone HTML** (player only, embedded media) with a size warning.
- **Autosave** of the editing session to IndexedDB every few seconds. On launch: "Restore unsaved game?"
- Import/export of plain `game.json` without media, for easy hand-editing or AI-assisted question writing.

---

## 6. Play Mode

### 6.1 Launch
1. Open a game (`.jbr` or the embedded game in a standalone HTML).
2. **Pre-game screen**: confirm or edit players (names, colors, starting scores), choose **Dual** or **Single**
   display mode, and choose "Resume previous session" if a saved session exists.
3. Start. The board is shown.

### 6.2 Display modes (toggleable live)
- **Dual window (default for streaming)**
  - *Host window*: board, host-only info (answer preview, host notes, clue value, and type indicator,
    including Daily Doubles before they are revealed), scoring panel, media controls, timer controls, and tools.
  - *Audience window*: opened with a button. Clean, full-screen friendly, no controls, and never shows answers until the
    host reveals them. Meant to be captured in OBS (window capture). It mirrors state via `postMessage`.
  - Media plays in the **audience window** so that OBS picks up its audio. The host window shows controls and a muted mirror/progress.
- **Single window**
  - One view with the controls in a collapsible bottom drawer or on hover. Nothing answer-revealing is
    rendered until the host clicks Reveal. A "hide all controls" key is available.

### 6.3 Game flow
1. **Board**: category headers + value tiles. Used tiles are dimmed or blank. The score bar shows each player's name, color, and score.
2. Host clicks a tile. It zoom-transitions to the **Question slide**.
   - *Daily Double*: DD splash, then a wager input for the chosen player (limited to max(score, highest round value) by default; the host can override), then the question.
   - *Wheel clue*: the wheel appears and the host spins. The result is shown and optionally logged. Then the question slide, if any.
   - *Dice clue*: the dice roll animation, then the result.
3. Optional timer starts automatically or manually. Time's-up visual (no built-in SFX; a user audio file can be attached).
4. **Scoring panel** (always available while a clue is open):
   - One toggle per player (colored chip). **Select zero, one, or many.**
   - Amount field, prefilled with the clue value (or the DD wager). Editable to any number.
   - Buttons: **Award +**, **Deduct −**, and quick "Wrong (−value)" per player when deduct-on-wrong is on.
   - Awarding does not auto-close the clue, so multiple awards/deductions per clue are possible.
5. **Reveal answer**: shows the answer slide in the audience view.
6. **Back to board**: marks the tile used. "Unmark" is available by right-clicking the tile.
7. When all tiles in a round are used (or the host clicks "Next round"), move to the next round, then Final.

### 6.4 Final Jeopardy (optional)
1. Category slide.
2. Wager entry: the host enters each player's wager in the host view only. It is validated from 0 to max(score, 0) with an override. Players
   with ≤ 0 can be excluded or allowed (setting).
3. Question slide + timer (default 30 s) + optional music file.
4. Answer reveal.
5. **Per-player reveal**, one at a time in an order the host chooses: show the wager, then mark ✔ / ✘, and the score animates.
6. Winner screen: final standings with player colors. Confetti.

### 6.5 Scores & players
- Edit any player's score directly at any time (click the score, then type).
- Add, remove, rename, and recolor players mid-game.
- **Score log**: chronological list of every change (player, delta, reason/clue, time). Each entry can be **undone** or redone.
  Global **Undo (Ctrl+Z)** reverts the last score change.
- Session state (scores, used tiles, round, log) is autosaved to IndexedDB after every change for **crash recovery**.

### 6.6 Global tools (available anytime from the toolbar)
- **Dice roller**: quick d4–d100, a custom "NdS", or any saved preset. The result animates on the audience view.
- **Wheel**: any saved preset, or a quick ad-hoc wheel from a text list. Weighted random.
  Uses `crypto.getRandomValues`, and the spin animation lands on the pre-selected result.
- **Timer**: start, pause, reset, and set a custom duration.
- **Scoreboard overlay**: toggle a large standings view on the audience window.

### 6.7 Media playback controls
- Play/pause, seek bar, current time/duration, volume, mute, restart, loop toggle, and full-screen element.
- Autoplay respects the per-element setting. **Browser autoplay policy**: autoplay is allowed after
  the host's first click, so "Start game" counts as that click.
- Keyboard: `Space` play/pause, `←/→` seek ±5 s, `M` mute.

### 6.8 Host keyboard shortcuts (defaults; rebindable later)
| Key | Action |
|---|---|
| `1`–`9` | Toggle player N in the scoring panel |
| `Enter` | Award selected players the current amount |
| `Shift+Enter` | Deduct from selected players |
| `R` | Reveal answer |
| `Esc` / `B` | Back to board (marks tile used) |
| `T` | Start/pause timer |
| `D` | Dice roller · `W` wheel · `S` scoreboard overlay |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo score change |
| `H` | Hide host controls (single-window mode) |
| `F` | Full-screen |

---

## 7. Audience View Requirements
- Always renders at 16:9, letterboxed to fit any window size. Designed for a 1920×1080 capture.
- Never renders answer slides, host notes, DD locations, or wagers until they are explicitly revealed.
- Smooth transitions: tile zoom, slide fade, score tick animations, and a board-fill animation at round start.
- Score bar position is configurable: bottom (default), top, or hidden.
- Can be opened, closed, and reopened without losing sync. On reopen, the full state is resent.

---

## 8. Persistence & File Formats

**`.jbr` pack (zip)**
```
game.json          # Game (schema above), media referenced by id
media/<id>.<ext>   # original files
media/<id>.edited.webp  # baked image edits (optional cache)
fonts/<id>.<ext>
thumbnail.png      # board preview
```
- `game.json` includes `version` for future migrations.
- Standalone HTML export: player bundle + `<script type="application/json" id="game">` + media as data URIs
  (or a base64 zip blob that is unpacked at load time).
- IndexedDB stores: `editorDraft`, `sessions/<gameId>`, and `mediaBlobs`.

---

## 9. Audio (user-supplied)
There is no built-in SFX library in v1, but audio can be attached anywhere:
- Slide audio elements (question/answer).
- Optional game-level hooks: board-open music, Daily Double sting, time's-up, Final think music, and winner music.
  Each hook is an optional user file and plays in the audience window.

---

## 10. Non-Functional Requirements
- **Performance**: board interactions < 100 ms. Slide transitions at 60 fps on a mid-range laptop. Games with
  ~500 MB of media should load in under 10 s from a `.jbr` (media loaded lazily as blob URLs).
- **Reliability**: no data loss on crash (autosave). Undo for scores.
- **Offline**: no runtime network calls.
- **Accessibility**: keyboard-operable host controls, adequate contrast in default themes, and player colors
  paired with names (never color alone).
- **Security**: all content is local. Uploaded SVG is sanitized, and rich text is escaped/sanitized.

---

## 11. Milestones

| # | Milestone | Scope |
|---|---|---|
| M0 | Spike | Vite + Svelte single-file build. Verify on `file://` that the two-window `postMessage`, IndexedDB, and video autoplay work in Chrome, Edge, and Firefox. Pick Konva vs DOM for slides. |
| M1 | Core game | Data model, basic editor (rounds/categories/values/text clues), play mode single-window, scoring panel (multi/none/custom), used tiles, score log + undo, autosave. |
| M2 | Streaming | Dual-window mode, audience view, reveal gating, keyboard shortcuts, `.jbr` save/load. |
| M3 | Rich slides | Freeform slide editor, text styling/effects/animations, image/video/audio elements, playback controls, fonts. |
| M4 | Game mechanics | Daily Double, timers, Final Jeopardy with wagers + per-player reveal, winner screen, mid-game player edits. |
| M5 | Tools | Dice (custom sides, custom faces, presets), weighted wheel, wheel/dice clue types, global toolbar. |
| M6 | Image editor & themes | Crop/rotate/flip/resize, filters, overlays, stickers, brush. Theme presets + overrides. |
| M7 | Export & polish | Standalone HTML export, validation panel, JSON import/export, E2E tests, docs. |
| M8 | Desktop (optional) | Tauri `.exe` packaging. |

---

## 12. Acceptance Criteria (highlights)
- [ ] Opening `jeopardy-builder.html` from disk (no server) loads the editor in Chrome, Edge, and Firefox.
- [ ] A game with 3 rounds of different sizes (e.g. 6×5, 4×3, 8×7) plus Final can be built, saved, reopened, and played.
- [ ] Each player's color is unique and enforced. Players can be added mid-game.
- [ ] During a clue, the host can award +X to two players, −Y to one, and nothing to others, with X/Y ≠ the clue value.
- [ ] Every score change appears in the log and can be undone.
- [ ] The audience window never shows the answer before Reveal (verified by E2E test).
- [ ] mp4/webm/mp3/wav/ogg files play with full controls. Autoplay works when enabled.
- [ ] A wheel with weights 1/1/8 lands on the heavy segment ~80% of the time over 1,000 simulated spins.
- [ ] A d37 and a custom-face die can be created, saved, and rolled.
- [ ] Refreshing the browser mid-game offers to resume, with scores and used tiles intact.
- [ ] Exported standalone HTML plays the game without the editor.

---

## 13. Future Ideas (post-v1)
- Built-in SFX pack; OBS browser-source mode via a local WebSocket; spreadsheet (CSV) import of clues;
  AI-assisted clue generation; a player "buzz order" helper where the host clicks names in the order heard;
  a statistics screen; game templates gallery.

---

## 14. Open Questions
1. **Slide rendering engine**: Konva (canvas; easy transforms, harder rich text/video) or DOM + `moveable`
   (native text/video, CSS effects). Leaning **DOM + moveable**. Decide in M0.
2. Daily Double wager cap rules: use the TV default or always free-form?
3. Should wheel landings be able to *apply* effects automatically (e.g. "+500 to selected player"), or only display them?
4. Max realistic game size / video lengths, to size the standalone-HTML export warning.
5. Do players need avatars or photos on the score bar, or just names and colors?
