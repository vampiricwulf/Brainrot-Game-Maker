# Brainrot Games Maker: Product & Technical Spec (Jeopardy modes)

Status: **v1.5 (M1–M7 implemented)** · Last updated: 2026-09-29

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
| `brainrot-game-maker.html` | Single self-contained file (editor + player). Built with Vite + `vite-plugin-singlefile`. | **P0** |
| Game pack `*.brainrot` (zip) | Main save format: `game.json` plus a `media/` folder. | **P0** |
| Standalone game `*.html` | Export: player-only HTML with the game and media base64-embedded. Expected games are small (< 100 MB of mostly images + short clips), so this is a first-class sharing option. Soft warning at 100 MB, strong warning at 250 MB. | **P1** |
| Desktop `.exe` / `.app` | Tauri wrapper around the same build. Adds native file dialogs and large-file handling. | **P2** |

**Browser targets:** latest Chrome, Edge, and Firefox. Safari is best-effort.
Everything must work from a `file://` URL with no server. The app itself makes no network requests (fonts and libraries are
bundled). The only exception is **online media** (YouTube, Google Drive, file links, §5.5) that the author chooses to use:
the editor fetches a pasted link once to save a copy in the game, and whatever it couldn't save plays from the internet.

---

## 3. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| UI framework | **Svelte 5 + TypeScript** | Small bundle, simple reactivity |
| Build | **Vite** + `vite-plugin-singlefile` | Outputs one `.html` |
| Slide canvas / element editing | **Plain DOM + `moveable`** | Decided: native text/video/CSS effects. Drag, resize, and rotate handles come from moveable. |
| Image editor | Canvas 2D API + **Cropper.js** for crop | Filters via canvas `filter`; brush/annotate on an overlay canvas |
| Zip packs | **JSZip** | Read and write `.brainrot` |
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
  media: MediaRef[],                // index of files in media/ (MediaRef { id, name, mime, size, kind,
                                    //   url? — plays live from this link, no file; source? — the link it was added from;
                                    //   expiresAt? — when that link stops working })
  fonts: FontRef[],
  tiebreaker?: Tiebreaker,
}

GameSettings {
  rollOffDie: number                // sides of the die used for "who goes first" roll-offs; default 20
  allowNegativeScores: boolean      // default true
  deductOnWrong: boolean            // default true (enables quick "-value" buttons)
  defaultTimerSeconds?: number      // null = no timer
  finalTimerSeconds: number         // default 30
  roundIntro: { titleCard: boolean, tileFill: boolean, categoryReveal: 'click' | 'auto' | 'off' }  // all on/'click' by default
  timesUpAudio?: MediaRef           // optional user sound when a timer hits 0
  maxPlayers: 8
  currencySymbol: string            // "$", "", "pts", "🧠", ...
}

PlayerTemplate { id, name, color /* hex, unique */ }   // no avatars: name + color only

Round {
  id, name,
  dailyDoubleCount?: number,        // used by the "Randomize Daily Doubles" button                         // "Jeopardy!", "Double Jeopardy", "Brainrot Round"
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
  tileFace?: { text?: RichText, image?: MediaRef },  // optional custom tile face instead of the value ("???", emoji, meme)
  empty?: boolean                   // blank tile (not playable)
}

FinalRound { category: RichText, categorySlide: Slide, questionSlide: Slide, answerSlide: Slide, timerSeconds, music?: MediaRef }
Tiebreaker { questionSlide: Slide, answerSlide: Slide, hostNotes? }   // optional, stored as Game.tiebreaker?

Slide {
  background: { color?, gradient?, image?: MediaRef, fit: 'cover'|'contain' },
  elements: SlideElement[]          // z-ordered
}

SlideElement = TextEl | ImageEl | VideoEl | AudioEl | ShapeEl | EmbedEl
  common: { id, x, y, w, h, rotation, opacity, zIndex, entrance?: Animation, locked? }
  // coordinates are in a fixed 1920x1080 logical space, scaled to fit

TextEl  { text: RichText, font, size, weight, italic, underline, color, align, vAlign,
          lineHeight, letterSpacing, stroke?:{color,width}, shadow?:{color,x,y,blur},
          glow?:{color,blur}, background?:{color,padding,radius}, autoFit: boolean }
ImageEl { media: MediaRef, edits: ImageEdits /* non-destructive */ , fit }
VideoEl { media: MediaRef, autoplay, loop, muted, startAt?, endAt?, volume, showControls }
EmbedEl { url: string, kind: 'youtube' | 'drive' | 'streamable' | 'remoteVideo' | 'remoteAudio' | 'remoteImage',
          autoplay, loop, muted, startAt?, endAt?, volume }   // a site's own player; needs internet at game time
                                                              // (remote* = older games' direct links)
AudioEl { media: MediaRef, autoplay, loop, startAt?, endAt?, volume, visible /* icon on slide or hidden */ }
ShapeEl { shape: 'rect'|'ellipse'|'line'|'arrow', fill, stroke }

// Wheels and dice are general-purpose randomizers. Most results are NOT points-related
// (punishments, dares, "pick the next category", "who goes first", drink counts...).
// A result is a label plus an optional reveal card. A score action is a rare, optional extra.
Outcome {
  label: string,                    // short text on the slice / die face: "Sing a song", "3", "Skip"
  details?: RichText,               // optional longer text shown big on reveal ("Do your best
                                    //   impression of the player to your left for 30s")
  media?: MediaRef,                 // optional image/GIF/video/audio played on reveal
  revealSlide?: Slide,              // optional fully custom reveal slide (overrides details/media)
  timerSeconds?: number,            // optional countdown on reveal (e.g. a 30s punishment)
  scoreAction?: ScoreAction         // optional; most outcomes have none
}

WheelPreset { id, name, segments: (Outcome & { color, weight /* proportion */ })[],
              spinDurationMs, removeAfterLanding: boolean }
DicePreset  { id, name, dice: { sides: number /* 2..1000 */, count: number,
              customFaces?: Outcome[] /* length = sides; else faces are 1..sides */ }[],
              showTotal: boolean,
              totalOutcomes?: { min: number, max: number, outcome: Outcome }[] } // optional: map a
                                    // total range to an outcome ("2–4: take a sip", "12: pick a victim")

// Optional score effect on an Outcome. Never applied automatically:
// the host sees a proposed change and clicks Confirm (or Skip).
ScoreAction =
  | { kind: 'addPoints',   amount: number }            // + / − to selected player(s)
  | { kind: 'addRollTimes', multiplier: number }       // dice total × multiplier
  | { kind: 'multiplyScore', factor: number }          // e.g. double, halve
  | { kind: 'setScore',    amount: number }            // e.g. bankrupt → 0
  | { kind: 'steal',       amount: number | 'all' }    // from a chosen player to selected player(s)
  | { kind: 'swapScores' }                             // between two chosen players
  | { kind: 'setClueValue', amount: number }           // changes the current clue's prefilled value

// Runtime (not part of the authored game)
Session {
  gameId, players: Player[] /* {id,name,color,score} */,
  used: Record<clueId, true>, currentRound, scoreLog: ScoreEvent[],
  currentPickerId?: string,         // who picks the next clue (set by roll-off or by the host)
  finalWagers?: Record<playerId, number>
}
ScoreEvent { id, ts, playerId, delta, reason: string /* "Round 1 · Memes $400" */, clueId? , undone? }
RollEvent  { id, ts, source: 'wheel' | 'dice', presetName?, result: string /* label(s) or numbers */,
             playerIds?: string[] /* optional "who this was for" tag, e.g. who got the punishment */ }
// Session also keeps rollLog: RollEvent[] (separate from the score log; no score impact)
```

---

## 5. Editor Mode (Builder)

### 5.1 Game setup
- New game wizard: title, theme preset, number of rounds, and for each round the number of categories, rows, and default values.
- **Values**: edit per round (row defaults), with per-clue overrides. A "×2 for this round" helper. Any integer is allowed, including negatives and 0.
- **Players (default roster)**: add/remove (1–8 players), name, unique color. The color picker prevents duplicates and suggests a distinct palette. No avatars; the score bar shows name plates in each player's color.
- Toggles: Final Jeopardy on/off, negative scores, deduct-on-wrong, default timer.

### 5.2 Board editor
- A grid view of the round that mirrors the play board. Click a category header or tile to edit it.
- Add/remove/reorder categories and rows (drag and drop). Duplicate a category. Mark a tile **empty**.
- Tile badges show the clue type (DD, wheel, dice), whether media is attached, and whether the answer is missing.
- **Daily Doubles**: toggle any tile as a DD by hand, or press **Randomize Daily Doubles** to place `dailyDoubleCount`
  of them at random. Placement is weighted toward the lower (higher-value) rows like on TV, and it never picks empty or wheel/dice tiles.
  Pressing it again re-rolls the placement. The DD positions are visible only in the editor and the host view.
- **Tile face**: by default a tile shows its value. Optionally, show custom text or an image instead ("???", an emoji,
  a meme face). The value still drives the prefilled score.
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
- **Online links (optional)**: every file picker (except fonts) has *Paste a link*, and the slide editor has *🌐 Link* (and
  takes pasted or dropped links). One parser (`links.ts`) turns share pages into file addresses (Dropbox, GitHub, Imgur,
  GIPHY, Discord, Pixeldrain, tmpfiles, SharePoint, Google Drive) and explains links that can't work (albums, folders,
  OneDrive personal, Box viewer, MEGA, Tenor pages, unsigned or expired Discord links).
  - The editor first tries to **download a copy into the game** (the browser can only when the site sends
    `Access-Control-Allow-Origin`; the desktop app downloads natively from any site). The bytes decide the type (magic
    numbers), except that MP4, WebM and Matroska look the same with or without pictures: an audio Content-Type or file
    name (`.m4a`, `.weba`, `.opus`, `.mka`), or a sound spot when nothing says video, makes one a sound. A web page is
    refused, files over 150 MB ask first and over 1 GB are never saved (a "no" or an oversize file falls back to a live
    link, and the message says why). The copy is ordinary game media (offline, packed, editable) that remembers its
    `source`.
  - Otherwise, if the link plays in a plain `<img>`/`<video>` (no permission needed), it's added as a **live link**
    (`MediaRef.url`): it plays from the internet during the show, from both windows. The Media tab marks it 🌐 with the site,
    *Save a copy* (downloads it later under the same id) and *Check link*; the checklist counts what plays from the internet
    and warns about temporary or expired links. Pages send no referrer (`<meta name="referrer" content="no-referrer">`,
    YouTube and site players ask for theirs explicitly).
  - **Google Drive** refuses its files to web pages (403 for any other site, `file://` and the desktop webview included).
    The desktop app downloads them natively, following the virus-scan form of big files and explaining sign-in, quota and
    "downloads turned off" pages. In the browser, pictures show through Google's image link (`lh3`, thumbnail fallback);
    video and sound can go on a slide as **Google Drive's player** (`EmbedEl` kind `drive`): an iframe of `/preview` only on
    the screen viewers watch (audience window, or the stage in single-window mode), a card for the host and the editor. The
    host can restart it, stop it or open it in a window, but not pause or seek it, and nothing swaps to it automatically.
    *⬇ Download from Drive* (a top-level visit, which Google allows) is always offered, followed by adding the file.
- **YouTube fallback (required)**: the IFrame player may refuse to play from a `file://` page (YouTube requires a referrer).
  The embed is treated as best-effort:
  - Failure is detected by a player `onError` (e.g. codes 2/5/100/101/150/153), or by no `onReady` within ~6 s.
  - On failure, the element shows a clear **"▶ Open on YouTube"** card in place of the player (the video thumbnail if it loads,
    the title/URL otherwise).
  - Clicking it (host view, or the `Y` shortcut) opens the **actual YouTube watch page** (`youtube.com/watch?v=…&t=<startAt>`)
    in a **popup window** sized 1280×720, so it can be window-captured in OBS or dragged onto the stream.
  - An "Open on YouTube" button is **always** available in the host's media controls, even when the embed works.
  - Live links (and older games' direct media URLs) that fail to load get the same "Open link" popup fallback, in the
    host's media controls and the host's copy of the stage. The screen viewers watch (audience window, single-window
    stage) never shows host-facing messages: a failed picture, sound or video, or an invalid player link, leaves an empty
    spot there.
- YouTube embeds use the IFrame Player API so the standard controls (play/pause, seek, volume, start/end) work the same as for local media.
  Standalone HTML export keeps them (and live links) as links, and says the file needs internet.

### 5.6 Wheel & dice preset editor
- **Wheel**: segments with label, color, and **weight** (the slice size and landing probability are proportional
  to the weight). A live preview shows the percentages. Optional image per segment. Spin duration. "Remove segment after it lands" option.
- **Dice**: any number of dice with any number of sides (d2–d1000). Faces show plain numbers by default,
  or custom face labels (e.g. `["Truth","Dare","Drink","Skip","Pick someone","Roll again"]`).
  Optional mapping of total ranges to outcomes. Default quick presets: d4, d6, d8, d10, d12, d20, d100, 2d6.
- **Outcomes are free-form, not points.** Each segment/face is an `Outcome` (§4): a label, plus optional
  details text, media, custom reveal slide, and countdown timer. Examples: punishments ("Talk in an accent until
  your next correct answer"), dares, "Host picks the next category", "Everyone else votes", or plain numbers.
- **Optional score action**: a small subset of outcomes may also carry a `ScoreAction` ("+500", "Bankrupt",
  "Steal 300", "Swap scores"). This is off by default and is hidden under an "Affects score" toggle so it doesn't clutter
  the common case.
- Presets are saved with the game. Clue types `wheel` and `dice` link to a preset.

### 5.7 Theme
- Presets: **Classic** (blue board, gold values), **Dark**, **Brainrot Neon**, and **Pastel**.
- Overrides: board background (color/gradient/image/video), tile color, tile font/color, category header style,
  value text style, used-tile look, score bar style, and player-color accent usage.
- **Board images** (added on request):
  - Category headers can show an image instead of the name (fit or fill, optionally with the name on top). The name is
    still used by the host (notes, log).
  - A **banner** image can sit above the board (theme setting: height, fit).
  - Each round can have **free-placed images** anywhere on its board screen. Every image has an opacity, sits on top of
    or behind the tiles, and can be click-through (host clicks reach the tiles under it) or solid (it blocks them). They
    are edited over a live board preview with a layers list, and can be copied to every round.
  - Images can be dropped straight onto categories and tiles in the round grid. Several files fill the next ones.

### 5.8 Save / load / export
- **Save** → download `.brainrot` (zip). **Open** → file picker or drag-drop.
- **Export standalone HTML** (player only, embedded media) with a size warning.
- **Autosave** of the editing session to IndexedDB every few seconds. On launch: "Restore unsaved game?"
- Import/export of plain `game.json` without media, for easy hand-editing or AI-assisted question writing.

---

## 6. Play Mode

### 6.1 Launch
1. Open a game (`.brainrot` or the embedded game in a standalone HTML).
2. **Pre-game screen**: confirm or edit players (names, colors, starting scores), choose **Dual** or **Single**
   display mode, and choose "Resume previous session" if a saved session exists.
3. Start. The board is shown. The host can immediately run a **roll-off** (§6.6) to decide who picks first, or
   set the current picker by hand.

### 6.2 Display modes (toggleable live)
The mode isn't saved with the game: it's dual while the audience window is open.

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
0. **Round intro** (each step can be turned off in settings): the round title card ("DOUBLE JEOPARDY!") → tiles fill in
   randomly with a cascading animation → categories are revealed one at a time on each host click (or automatically).
1. **Board**: category headers + tiles (value or custom face). Used tiles are dimmed or blank. The score bar shows each
   player's name, color, and score (up to 8 players, one row).
2. Host clicks a tile. It zoom-transitions to the **Question slide**.
   - *Daily Double*: DD splash, then a wager input for the chosen player (not limited by default; the host can turn on the max(score, highest round value) limit), then the question.
   - *Wheel clue*: the wheel appears and the host spins, then the outcome is revealed. The question slide is optional,
     so a tile can be purely "spin the punishment wheel" with no question at all.
   - *Dice clue*: the dice roll animation, then the outcome. The question slide is optional too.
   - For wheel/dice tiles with no question, the scoring panel stays available but is collapsed by default.
3. Optional timer starts automatically or manually. At 0: flash/shake + "TIME'S UP" banner, plus the optional user
   audio `timesUpAudio`. Nothing else happens automatically: no auto-reveal and no auto-scoring.
4. **Scoring panel** (always available while a clue is open):
   - One toggle per player (colored chip). **Select zero, one, or many.**
   - Amount field, prefilled with the clue value (or the DD wager). Editable to any number.
   - Buttons: **Award +**, **Deduct −**, and quick "Wrong (−value)" per player when deduct-on-wrong is on.
   - Awarding does not auto-close the clue, so multiple awards/deductions per clue are possible.
5. **Reveal answer**: shows the answer slide in the audience view.
6. **Back to board**: marks the tile used. "Unmark" is available by right-clicking the tile.
7. When all tiles in a round are used (or the host clicks "Next round"), move to the next round, then Final.

### 6.4 Final Jeopardy (optional)
1. Category slide and wager entry together: on one screen the host ticks who plays (players with ≤ 0 can be excluded or
   allowed, a setting of the round) and enters each player's wager in the host view only. Wagers are whole numbers,
   0 or more; the max(score, 0) limit is off by default and the host can turn it on. A wager stays editable until it's
   revealed, and remembers whether the host or the player's phone entered it.
3. Question slide + timer (default 30 s) + optional music file.
4. Answer reveal.
5. **Per-player reveal**, one at a time in an order the host chooses: show the wager, then mark ✔ / ✘, and the score animates.
6. **Tie check**: if two or more players are tied for first, the host is offered:
   - **Tiebreaker roll-off** between only the tied players (§6.6), or
   - **Tiebreaker clue** (the pre-written `Game.tiebreaker`, if authored). Scored with the normal scoring panel, or
   - **Declare co-winners**.
   The same tie check runs at the end of the game when Final Jeopardy is off.
7. Winner screen: final standings with player colors. Confetti.

### 6.5 Scores & players
- Edit any player's score directly at any time (click the score, then type).
- Add, remove, rename, and recolor players mid-game.
- **Score log**: chronological list of every change (player, delta, reason/clue, time). Each entry can be **undone** or redone.
  Global **Undo (Ctrl+Z)** reverts the last score change.
- Session state (scores, used tiles, round, log) is autosaved to IndexedDB after every change for **crash recovery**.

### 6.6 Global tools (available anytime from the toolbar)
- **Dice roller**: quick d4–d100, a custom "NdS", or any saved preset. The result animates on the audience view.
  It is usable anytime, for anything (who goes first, how many seconds, punishment severity...).
- **Roll-off ("who goes first")**: one click rolls one die per player, each die in that player's color, all
  animating together on the full-screen overlay. The result is a ranked list. If players tie for the top spot, only
  the tied players re-roll automatically until there is a single winner. The die size comes from
  `settings.rollOffDie` (d20 default) and can be changed in the dialog. The host can include or exclude players
  before rolling (e.g. only the tied players at Final, or a tiebreaker between two). The roll-off is written to the roll log.
  - **Result**: the winner becomes the **current picker**.
- **Current picker marker**: the score bar highlights the player who picks the next clue (a glowing outline or arrow in
  their color). The host can move it anytime by clicking a player's name plate, or with `P` then the player's number. Optional
  setting: after an award, move the marker automatically to the player who was awarded (TV-style control of the board).
  The marker is display-only and never blocks the host from picking any tile.
- **Wheel**: any saved preset, or a quick ad-hoc wheel from a text list. Weighted random.
  Uses `crypto.getRandomValues`, and the spin animation lands on the pre-selected result.
- **Placement**: the wheel and dice always appear as a **full-screen overlay** on the audience view while spinning
  or rolling, then show the result. Dismissing the overlay returns to whatever was underneath (board or clue).
- **Reveal**: the outcome is shown on the audience view (label, plus details/media/custom slide if set), with an
  optional countdown. The host can dismiss it, re-spin/re-roll, or tag it with a player
  ("this punishment is for Alex"). Every spin/roll goes into the **roll log** (separate from the score log, no score impact).
- **Removing slices**: with "remove after landing" on, a landed segment is removed for the rest of the session (e.g. each
  punishment only once). The host can restore removed segments.
- **Score actions (optional)**: only if the landed outcome has a `ScoreAction`, the host view shows an action card
  ("Bankrupt → set score to 0"). The host picks the target player(s) (and a source player for steal/swap), previews the
  score change, then clicks **Confirm** or **Skip**. Confirmed actions are written to the score log with a reason
  ("Wheel: Punishment Wheel → Bankrupt"), so they can be undone like any other score change.
- **Timer**: start, pause, reset, and set a custom duration.
- **Scoreboard overlay**: toggle a large standings view on the audience window.

### 6.7 Media playback controls
- Play/pause, seek bar, current time/duration, volume, mute, restart, loop toggle, and full-screen element.
- Autoplay respects the per-element setting. **Browser autoplay policy**: autoplay is allowed after
  the host's first click, so "Start game" counts as that click.
- Keyboard: `Space` play/pause, `←/→` seek ±5 s, `M` mute.
- On the stage, clicking a video or a sound's speaker icon plays or pauses it (in dual mode, in the audience window)
  instead of revealing the answer. The host sees ⏸ on a playing sound's icon; the audience sees the plain icon.

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
| `O` | Roll-off (who goes first) |
| `P`, then `1`–`9` | Set current picker to player N |
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

**`.brainrot` pack (zip)**
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
- **Performance**: board interactions < 100 ms. Slide transitions at 60 fps on a mid-range laptop. The target game size is
  < 100 MB of media (mostly images + short clips). Such a game loads in under 5 s from a `.brainrot` or standalone HTML.
  Larger games must still work (media loaded lazily as blob URLs) but aren't optimized for.
- **Reliability**: no data loss on crash (autosave). Undo for scores.
- **Offline**: no runtime network calls, except online media the author opted into. A game with no players or live links
  works fully offline (links saved as copies are ordinary files).
- **Accessibility**: keyboard-operable host controls, adequate contrast in default themes, and player colors
  paired with names (never color alone).
- **Security**: all content is local. Uploaded SVG is sanitized, and rich text is escaped/sanitized.

---

## 11. Milestones

| # | Milestone | Scope | Status |
|---|---|---|---|
| M1 | Core game | Data model, basic editor (rounds/categories/values/text clues), play mode single-window, scoring panel (multi/none/custom), used tiles, score log + undo, autosave. | ✅ Done |
| M2 | Streaming | Dual-window mode, audience view, reveal gating, keyboard shortcuts, `.brainrot` save/load. | ✅ Done |
| M3 | Rich slides | Freeform slide editor, text styling/effects/animations, image/video/audio elements, online embeds (YouTube/URL), playback controls, fonts, custom tile faces. | ✅ Done |
| M4 | Game mechanics | Daily Double (manual + randomize), round intro animations, timers, Final Jeopardy with wagers + per-player reveal, tie handling (roll-off / tiebreaker clue / co-winners), winner screen, mid-game player edits. | ✅ Done |
| M5 | Tools | Dice (custom sides, custom faces, presets), weighted wheel, wheel/dice clue types, roll-off + current picker, roll log, global toolbar. | ✅ Done |
| M6 | Image editor & themes | Crop/rotate/flip/resize, filters, overlays, stickers, brush. Theme presets + overrides. | ✅ Done |
| M7 | Export & polish | Standalone HTML export, validation panel, JSON import/export, E2E tests, docs. | ✅ Done |
| M8 | Desktop (optional) | Tauri `.exe` packaging. | ✅ Builds in CI on every push to main (portable .exe in the Latest release; no installer); hand-tested on Windows: Discord's screen share gets the game's sound with the Discord audio fix, which is on by default |

### Implementation notes (differences from the original plan)
- **Slide templates** became *Copy slide / Paste slide* plus *Use this style elsewhere* (copies a text look to every question
  and/or answer in a category, a round or the game; a clue starts on its own category).
- **Wheel/dice outcomes** support a label, details text, media (image/GIF/video/audio), a countdown and an optional score
  effect. A fully custom reveal *slide* per outcome (`revealSlide`) is not implemented.
- **Category header slides** (`Category.headerSlide`) are not implemented. Category names are styled by the theme.
- **Two-window sync** uses `window.open` + `postMessage` only (no BroadcastChannel). The audience window must be opened from
  the host's button. Media blobs are sent across with the state.
- **YouTube** is driven through the IFrame player's postMessage protocol (no external API script). Failure is detected by
  `onError` or by no reply within 7 s, and the host always has *Open on YouTube*.
- **Standalone HTML export** embeds the `.brainrot` zip as base64 in the app's own HTML and starts in a player-only mode with
  its own autosave slot.
- **Image edits** are stored as parameters, and the result is saved as a separate media file (PNG if transparency is
  possible, otherwise JPEG), so the original is always kept.

---

## 12. Acceptance Criteria (highlights)
Legend: **E2E** = checked by `tests/e2e/smoke.mjs` against the built file opened from `file://` in Chromium; **unit** =
checked by Vitest; **manual** = not automated yet.

- [x] Opening `brainrot-game-maker.html` from disk (no server) loads the editor. **E2E (Chromium)**. Edge is Chromium-based;
      Firefox is **manual**.
- [x] A game with 3 rounds of different sizes plus Final can be built and played through. **unit** (round sizes, flow),
      **E2E** (save → reopen of a `.brainrot`).
- [x] Each player's color is unique and enforced. **E2E**. Players can be added mid-game via 👥 Players. **manual**
- [x] During a clue, the host can award +X to two players, −Y to one, and nothing to others, with X/Y ≠ the clue value. **E2E + unit**
- [x] Every score change appears in the log and can be undone. **E2E + unit**
- [x] The audience window never shows the answer before Reveal. **E2E**
- [x] Media plays with full controls, and autoplay works when enabled. **E2E** (WAV via host controls). Other formats rely on
      the browser's codecs, and the editor warns on import.
- [x] A wheel with weights 1/1/8 lands on the heavy segment ~80% of the time over 1,000 simulated spins. **unit**
- [x] A d37 and a custom-face die can be rolled. **unit** (d37 notation, custom faces). Saving them in the editor is **manual**.
- [x] A roll-off with a forced tie re-rolls only the tied players, then sets the winner as the current picker. **unit + E2E**
- [x] A wheel spin reveals its outcome on the audience view, can be tagged with a player, and appears in the roll log. **E2E**
- [x] A die with custom text faces and a total-range mapping reveals the correct outcome. **unit**
- [x] A wheel segment with a "Bankrupt" score action applies only after Confirm and can be undone. **E2E + unit**
- [x] Refreshing the browser mid-game offers to resume, with scores and used tiles intact. **E2E**
- [x] Exported standalone HTML plays the game without the editor. **E2E**

---

## 13. Future Ideas (post-v1)
- Built-in SFX pack; OBS browser-source mode via a local WebSocket; spreadsheet (CSV) import of clues (not needed for v1);
  AI-assisted clue generation; a player "buzz order" helper where the host clicks names in the order heard;
  a statistics screen; game templates gallery.

---

## 14. Decisions Log
| Topic | Decision |
|---|---|
| Delivery | Single HTML first, Tauri `.exe` later |
| Save format | `.brainrot` zip + standalone HTML export |
| Display | Dual-window and single-window, toggleable live |
| Rounds | Any number of rounds + optional Final |
| Mechanics | Daily Doubles, negative scores/deductions, Final wagers, timers |
| Daily Double cap | TV rules (max(score, highest board value)), host can override |
| Wheel/dice results | General-purpose outcomes (punishments, dares, prompts, numbers) with optional details/media/timer. Score actions are a rare, optional extra, always host-confirmed. |
| Who goes first | One-click roll-off (a die per player, in their color; ties re-roll). The winner becomes the current picker. |
| Punishment tracking | Roll log only (optional player tag). No on-stream tally or active-effect badges. |
| Wheel/dice placement | Full-screen overlay on the audience view |
| Score bar | Name + color only (no avatars) |
| Slides | Freeform 16:9 elements |
| Image editing | Crop/rotate/flip/resize, filters, text/sticker overlays, brush |
| Theming | Presets + full override |
| Extras | Score undo + log, autosave/resume, host keyboard shortcuts. No built-in SFX. |
| Players | Editable mid-game |
| Stack | Svelte 5 + Vite, built to a single-file HTML |
| Expected size | Small (< 100 MB media) |
| Online media | Allowed (YouTube / URLs) as an opt-in, flagged "needs internet". Local files remain the default. |
| Online links | Download a copy into the game whenever possible; play live from the link only when the site won't allow it. Google Drive video in the browser: Drive's own player on a slide (opt-in), never swapped in automatically. |
| YouTube failure | Detect the failure → "Open on YouTube" popup window with the real page. The button is always available to the host. |
| Spike | Skipped. Go straight to building; the risks are covered by fallbacks. |
| Slide engine | DOM + moveable |
| Daily Double placement | Manual toggle + "Randomize" button (weighted to lower rows) |
| Bulk clue entry | Not needed for v1 (editor + JSON import only) |
| End-game ties | Offer a tiebreaker roll-off, a tiebreaker clue, or co-winners |
| Max players | 8 (single-row score bar) |
| Round intro | TV-style: title card, tile fill, click-to-reveal categories. Each step can be turned off. |
| Tile face | Value by default; optional custom text/image |
| Timer end | Visual + optional user sound. No auto-reveal. |

## 15. Open Questions
None at the moment. Risks are handled in the design: the YouTube popup fallback, and codec warnings on media import.
Firefox and Safari still need a manual pass, especially for the `file://` storage and popup behaviour.
