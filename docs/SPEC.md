# Brainrot Games Maker: Product & Technical Spec (Jeopardy modes)

Status: **v1.5 (M1–M7 implemented)** · Last updated: 2026-10-02

A tool for building and hosting custom Jeopardy-style games that are livestreamed to friends.
Players answer by voice on the stream, or buzz in and answer on their phones (phone buzzers, optional: §6). The host
runs the board, decides who gets points, and controls media.

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
- Buzzers, networked multiplayer, or player-side devices (v1's; optional phone buzzers came later: §6).
- Online hosting, accounts, or a cloud sync backend.
- Built-in sound-effect library. Users can attach their own audio anywhere (see §9).
- Mobile-optimized editing. Play mode should still render acceptably on tablets.

---

## 2. Delivery & Distribution

| Artifact | Description | Priority |
|---|---|---|
| `brainrot-game-maker.html` | Single self-contained file (editor + player). Built with Vite + `vite-plugin-singlefile`. | **P0** |
| Game pack `*.brainrot` (zip) | Main save format: `game.json` plus a `media/` folder. | **P0** |
| Standalone game `*.html` | Export: player-only HTML with the game and media base64-embedded. Expected games are small (< 100 MB of mostly images + short clips), so this is a first-class sharing option. Soft warning at 100 MB, strong warning at 250 MB; each says how much is files nothing in the game uses (over 10 MB of them). | **P1** |
| Desktop `.exe` / `.app` | Tauri wrapper around the same build. Saves into a `BrainrotSaves` folder next to the exe (Open… lists it), writes big files natively, opens a game it's opened with, and updates itself in place from signed releases. The color picker's 💧 Pick from the screen is the app's own there (Windows), since WebView2's eyedropper doesn't work on some PCs: a still picture of every screen with a magnifier; a click or `Enter` picks, the arrow keys move one pixel (ten with `Shift`), `Esc`, a right-click or switching away cancels. | **P2** |

**Browser targets:** latest Chrome, Edge, and Firefox. Safari is best-effort.
Everything must work from a `file://` URL with no server. Fonts and libraries are bundled; the app goes online only for
**online media** (YouTube, Google Drive, file links, §5.5) that the author chooses to use (the editor fetches a pasted link
once to save a copy in the game, and whatever it couldn't save plays from the internet), the update check (the newest
GitHub release, at start unless ⚙ Settings turns it off, and in ℹ About) and, with phone buzzers, the buzzer server (§6).

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
  deals?: DealPreset[],             // 🎭 secret parts for everyone (PARTNER-CLUES-SPEC.md §11)
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

PlayerTemplate { id, name, color /* hex, unique */, avatar? /* a picture: the RPG avatar and player sheet */ }

Round {
  id, name,
  dailyDoubleCount?: number,        // used by the "Randomize Daily Doubles" button                         // "Jeopardy!", "Double Jeopardy", "Brainrot Round"
  partnerCount?: number,            // 🤝 partner clues in all (🔀 Randomize, Start game places the rest); left out: none
  partnerGame?: PartnerGame, partnerCardFrom?: 'answer' | 'empty',  // what one placed at random plays, and its first card
  categories: Category[],           // columns: 1..10
  rowCount: number,                 // questions per category: 1..10
  values: number[],                 // default value per row, e.g. [200,400,600,800,1000]
  valueMultiplier?: number          // optional helper, e.g. 2 for Double
}

Category { id, title: RichText, headerSlide?: Slide, clues: Clue[] /* length = rowCount */ }

Clue {
  id,
  value: number | null,             // override of round.values[row]; null = inherit
  type: 'standard' | 'dailyDouble' | 'wheel' | 'dice' | 'partner',
  wheelPresetId?, dicePresetId?,    // for wheel/dice clue types
  partner?: PartnerRules, cards?: ClueCard[],  // a tile's 🤫 cards: a partner clue hands them out (PARTNER-CLUES-SPEC.md §18); any other tile offers them in its panel (§12.2)
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
- **Values**: edit per round (row defaults), with per-clue overrides. A "×2 for this round" helper. Any integer is allowed, including negatives and 0.
- **Players**: set on the ▶ Play pre-game screen (§6.1; the editor's Game list starts with 👥 Players & rules ▶, which
  opens it at the players), kept with the game: add/remove (1–20 players; 8 at most by
  default, ⚖ Game rules › Most players), name, unique color, a picture (an RPG round's avatar and player sheet). The
  color picker prevents duplicates and suggests a distinct palette. The score bar shows name plates in each player's
  color.
- Toggles: Final Jeopardy on/off, negative scores, deduct-on-wrong, default timer.

### 5.2 Board editor
- A grid view of the round that mirrors the play board. Click a category header or tile to edit it.
- Add/remove/reorder categories and rows (drag and drop). Duplicate a category. Mark a tile **empty**.
- Tile badges show the clue type (DD, wheel, dice), whether media is attached, and whether the answer is missing.
- **Daily Doubles**: toggle any tile as a DD by hand, or press **Randomize Daily Doubles** to place `dailyDoubleCount`
  of them at random, one a category (asked for more, it places what fits, says “Placed 6 of 8 Daily Doubles: one a
  category”, and the box then says 6; at 0 it's greyed). Placement is weighted toward the lower (higher-value) rows like
  on TV, and it never picks empty or wheel/dice tiles. The hint beside it says how many are on the board and how many
  Start game places, by the checklist's rule. Pressing it again re-rolls the placement. The DD positions are visible only in the editor and the host view.
- **🤝 Partner clues** (PARTNER-CLUES-SPEC.md §21, P4): make any tile one by hand, or set how many next to ⭐ Daily
  Doubles and press **🔀 Randomize** to place `partnerCount` of them at random, spread over the categories, only on
  tiles with a written question and answer and never on a Daily Double. A tile that was a partner clue keeps its own
  rules and cards; any other plays the round's game (`partnerGame`, Describe it by default) with a first 🤫 card that
  copies the tile's answer (or an empty one, `partnerCardFrom`). Start game places the ones still missing. One made or
  pasted by hand raises the box to the number on the board, as a Daily Double does, and the Plays and 🤫 Card choices
  show once any partner clue is on the board. Both hints read alike: "2 on the board · Start places 1 at random", or
  "· all placed".
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
- Output: edits are stored as parameters and baked into a rendered PNG (JPEG for a photo with no see-through parts) cached with the pack; a moving GIF stays a moving GIF, every frame edited, each with its own colours (`src/lib/gifedit.ts`, `gifwrite.ts`). "Reset to original" is always available.

### 5.5 Media
- Accepted: **Images** png, jpg/jpeg, gif (animated), webp, svg, avif · **Video** mp4 (H.264/AAC), webm, mov*, mkv*, mts/m2ts* (a camcorder's MPEG-TS), ogv · **Audio** mp3, wav, ogg, m4a/aac, flac, opus.
  `*` Playback depends on the browser's codec support. In the editor, each stored video and sound is read for what's
  inside it (its file type by its content, and each track's codec, asked of the browser with the track's own codec
  string); for an MKV, MOV or MPEG-TS, an HEVC or AV1 picture, or uncompressed sound outside a WAV, a hidden, muted
  page element also plays a moment of it, to see whether it opens, decodes frames and decodes sound. 🖼 Media then
  says "won't play here" or "plays without its sound here" (its title says why: an HEVC picture, Dolby Digital
  sound…), and the checklist counts them. A file the app can't read keeps the type-based warning ("may not play"),
  as does one not checked yet.
- **🔄 Convert** (editor only): a video or sound added in the editor that won't play here (or plays without its sound)
  gets a note at the top of the editor and a toast (naming nothing; added in the clue editor, which covers that
  note, the toast points to the item's own panel and its 🔄 Convert…; added in a window with no such panel, a wheel
  slice's say, to the note once the windows are closed). The fix puts a file that plays in its place,
  everywhere it's used (on stream too), as one undo step: its tracks copied into a type this browser opens when only
  the file type is the trouble (quick, nothing lost: an MKV into a WebM or an MP4, an .mts's MP3 sound into an MP4), a
  track made again in this browser's own codecs otherwise (🔄 Convert's window says what it costs first), or a sound
  this browser can't read (Dolby Digital or DTS, in most browsers) left out when the picture gains a type phones and
  Safari open. A fix whose result wouldn't play here isn't offered; the words say why and what to do instead. The new
  bytes get a new id (the name's extension follows the type), the 🗜 copy for phones goes, and Ctrl+Z puts the old file
  back. 🖼 Media's cards, a slide item's panel and the checklist offer it too, and **↻** repackages a 🤫 card's file that
  plays here but phones can't open (an MKV, a MOV) into a type they take, for everyone. Nothing is checked or converted
  in play.
- **✎ Edit** (editor only): a stored video or sound that plays here can be trimmed (a bar with two handles, Start and
  End boxes, I / O at the playhead), and a video cropped (Free, 16:9, 4:3, 1:1, 9:16) and made smaller (1080p, 720p,
  480p, 360p by its short side, or a percent of it typed in, for a picture of any shape; never bigger), from its 🖼 Media
  card, its slide item's panel or right-click menu. The window shows the size it will come out at (in pixels, under the
  size row) and what it's saved as, and undoes its own changes with Ctrl+Z (once the edit is in, Ctrl+Z closes it and
  puts the old file back, as in 🗜's and 🔄's windows; with nothing changed, Esc just closes it, ✂ Crop pressed or not).
  Nothing is re-encoded where that can be helped: an MP4's trim is exact (an edit list), a sound's is copied
  (uncompressed sound made again as it was, so it's cut to the sample), a WebM's is exact when it starts at a key frame,
  else its picture is made again or, with Quick trim, it starts at the key frame before. A crop or a size makes the
  picture again (H.264 in an MP4 where the browser can, else VP9). Applying puts the new bytes under a new id everywhere
  the file is used (on stream too), as one undo step: items' Start at / Stop at move with the trim (one whose part was
  cut out plays the whole file, and one the trim cuts short plays what's left of its part: the window says which
  first, and the toast counts them), a video box that had the picture's old shape takes its new one, and the 🗜 copy
  for phones goes (it can be made again at once). Save as a new file keeps both; Only this item (from a slide item
  whose file is used elsewhere) gives that item an edited copy of its own. Toasts and History name no file. Nothing is
  edited in play.
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
  - Images can be dropped straight onto categories and tiles in the round grid. On a tile it asks where they go: in the
    question (the default) or as the tile's face. Several files fill the next ones.

- **My themes and sharing**: a theme can be saved in this browser (on this computer in the desktop app) under a name
  (colors, fonts and layout; not the pictures) and put on any game, exported as a small `.brainrot-theme` file (with its pictures and uploaded fonts) or
  copied as a short text code (`BRT1:…`). An imported theme is shown on the game's own board before it's used or kept.

### 5.8 Save / load / export
- **The first screen** (a game with no rounds): ✨ Try a sample game, then a card a mode (a blank round) with at most two
  templates in it to start from (＋ Add round has them all), the arrow keys moving between the cards, and a line for a
  game file, "Have a game file? 📂 Open a game… or drop it here", with the three newest Recent games as buttons on it
  (title · rounds · when). ▶ Play isn't greyed there: a click says "Add a round first" and puts the keys on the sample.
- **Save** → download `.brainrot` (zip); in the desktop app, into `BrainrotSaves` next to the exe (Documents when that
  can't be written), replacing the game's last save and keeping two `.bak` backups. **Open** → Recent games (the last 8
  games replaced, kept in the browser), the desktop app's BrainrotSaves, a file picker, or drag-drop.
- **Export standalone HTML** (player only, embedded media) with a size warning: ⋯ › *Save a copy as* › ⬇ Export as a web
  page… (play-only), "Plays without this app. Shows the answers: keep it to yourself." It has one name everywhere, the
  **play-only web page**: the export's message, 🕘 History, the desktop app's list of saves and the header while it's made.
  An untitled game's first export asks ⬇ Name your game, with Export.
- **Autosave** of the editing session to IndexedDB after every change: the next launch opens where you left off (a game
  in progress offers Resume game). The desktop app can also write timed autosaves into BrainrotSaves (⚙ Settings).
- Import/export of plain `game.json` without media, for easy hand-editing or AI-assisted question writing. A slip with
  an obvious fill is repaired as the file opens (a repeated id gets a new one, in a board game's spaces, an RPG world's
  screens and objects, the stats and items too; a text item with just its words gets a new text box's looks; a theme
  color or font that isn't one gets the preset's; a clue type the app doesn't know is a plain clue, or a Daily Double
  for one named so; a number written as text is that number; no players list is none yet, and no version this one);
  one the app can't use says where it's wrong.

---

## 6. Play Mode

### 6.1 Launch
1. Open a game (`.brainrot` or the embedded game in a standalone HTML).
2. **Pre-game screen**: confirm or edit players (names, colors, pictures, starting scores; a row's menu, from a
   right-click or Shift+F10 on it or on the player's 📱 row: ✎ Rename F2 · 🎨 Color… · 🖼 Picture… · ± Start score… ·
   ▲ Move up · ▼ Move down · 🗑 Delete player), ⚖ Game rules, 📱 Phone
   buzzers (with Teams) and On stream options, all saved with the game, and choose **Single window** or **📺 Separate
   audience window** (with 📺 picked, a line under the cards: "not open yet" [📺 Open it now], or "open ✓" [Bring it
   forward] … [Close it], which asks first; `A` / `Shift+A` open the audience and scores windows here too). A game in
   progress is picked up from the editor with **Resume game**. While the buzzer room is
   up, each 👥 row says how its phone is in words where the name's chip was (📱 in, 📱 waiting, 📵 lost 0:12, ⛔ kicked
   1:40, 🔒 locked out), and the sticky Start bar has the room's live line, one line high: who's asking to join with ✔ Add / ✕ No (two or
   more: how many, and Show ↓ to the 📱 card's list), else the code, who's in and who it's waiting for, plain until
   everyone is in, then green.
3. Start. The board is shown. The host can immediately run a **roll-off** (§6.6) to decide who picks first, or
   set the current picker by hand.

### 6.2 Display modes (toggleable live)
The mode isn't saved with the game: it's dual while the audience window is open.

- **Dual window** (📺 Separate audience window)
  - *Host window*: board, host-only info (answer preview, host notes, clue value, and type indicator,
    including Daily Doubles before they are revealed: the host's board marks a Daily Double, 🤝 partner or ✍ tile still
    to play with ⭐, 🤝 or ✍ in its corner, never in one window nor in the editor's previews of the board), scoring
    panel, media controls, timer controls, and tools.
  - *Audience window*: opened with a button. Clean, full-screen friendly, no controls, and never shows answers until the
    host reveals them. Meant to be captured in OBS (window capture). It mirrors state via `postMessage`.
  - Media plays in the **audience window** so that OBS picks up its audio. The host window shows controls and a muted mirror/progress.
- **Single window** (the default)
  - One view: the stage, with the host panel under it (beside it in RPG and board-game rounds on a wide window).
    Nothing answer-revealing is rendered until the host clicks Reveal. `H` (🙈 Hide) hides the host controls (then
    nothing on the stage shows a focus ring until the host moves the keys: Tab, or the board's arrow keys; Show
    controls shows when the mouse moves, or on a touch screen at a first tap, which does nothing else). The
    panel's status line shows the 📝 host notes of the clue, the slides round, the tiebreaker or the Final (once its
    answer is up), with a title saying viewers can see them; with the audience window open they're in the host column
    instead. The editor's notes fields say so ("off stream, except in a single window"); a secret board-game space's
    notes wait for 👁 Reveal space, as its name does (its card says “?” until then too, and so does ✎ Edit board: its
    menu, hints and undo steps say “? (secret)”, a step taken with the audience window open too once it closes (each step
    keeps a quiet text for one window), its Name box behind 👁 Show while it stays picked, and its ⚙ Buttons… window's
    buttons and notes behind 👁 Show its buttons). While a box viewers can read is up (a 🤝 partner clue's, a tile's or
    the Final's 🤫 cards, a Daily Double's wager, a ✍ clue's answers), the status line carries one ⚠ Viewers see this
    chip, always in view, saying in its tooltip (and to screen readers) what they can read there; the line keeps one
    line, a clue's or the Final's words cut short (…) on a narrow window, the whole of them in their tooltip. In a
    partner clue's question the blue button is 👁 Reveal answer, then ▦ Done ▶ board, in view while the 🤝 box scrolls
    (on a laptop it fills the action part); the clue row's quiet ▦ Done (a skip) and 🙈 Hide may scroll out of sight
    there (`Esc`, `R` and the stage's menu do them). Windows opened mid-game (?,
    📜 Log, 👥 Players, ⚖ Rules, 🔊 Sound, the RPG's ⤢ Full map, ✎ Edit board's ⚙ Buttons…) open over the host panel,
    never the stage (the full map's screen card beside the map where the panel is wide enough); the RPG's ✎
    Edit screen is too big for it and says viewers see it (📺 Audience edits off stream). The stage keeps one size
    from the board through a clue's steps (a Daily Double's splash, its question slides, a clue's media controls:
    room for as many as the round's busiest slide has, in a slides round too), so viewers don't see it zoom down and
    up: each score chip keeps room for the mark and the score a clue of the round can give it, counted from its score
    before the clue's marks (the ★ of who picks next takes none). A 🤝
    partner clue, a wheel or dice tile (its tool, then its question), the Final with the results, a roll-off and the
    tiebreaker clue, and a board-game round under the stage hold the panel at one height instead: the stage changes
    size only as they start and end. What scrolls in there comes into view as it comes (a board-game move's landing
    row, a tool's outcome), and at the end and in the tiebreaker clue the score chips stay whole while the part under
    them scrolls.
- **The host panel's rules** (everything below follows them):
  1. **Each action has one place: its situation's box**, beside the manual choices it's an alternative to (🤝 a partner
     clue, ⭐ a Daily Double, 🎡 / 🎲 a wheel or dice, the Final's wagers and reveals, a tie at the end, the buzzers' row,
     a board-game turn). 🎡 Spin for a partner comes in front of the players; a run of actions uses one slot (🎲 Roll,
     then ▶ Move; Spin!, then ↻ Spin again), greyed while it plays out. The box's first line says what to do next, and
     names the blue button when the next thing is the show's step. The action due now wears a ring (`.ring`, one at a
     time). No action shows twice: not in the main cell, not beside it, not in the clue's row, not in the stage's menu.
  2. **The main button is the show's next step: Next or Reveal.** One blue button, always in the same cell at the right,
     `N` its key, in FLOW's words only (goon.ts `mainStep`). It never spins, rolls, sends cards, starts the clock, opens
     the buzzers, gives points or judges; it's never greyed for something the host can do (pressed with something left,
     it opens the check), only while a wheel turns or dice roll. With no next step the cell is empty (a board with tiles
     left, an RPG round, the end screen, ✎ Edit board), except for **Next ▶** while something is over the stage. Nothing
     else in the panel is blue but a pop-up the host opened (🎲 Dice…, 🤫 Send a card…, 🎭 Deal…) and a question asked
     in the strip.
  3. **A click on the stage does the moment's safe step.** Where that's the blue button's step it goes through the check
     (`goOn('stage')`), so a click never loses anything; where it's what the stage itself shows, the click does it (a
     wheel spins, landed dice move the token). While the check is open a click on the stage only flashes it.
- **The host panel** has one layout in every round: the status line (📱 phones and ⏱ timer chips), the players' score
  chips, the row of what this moment needs with the one main button (and its key) at its right, the tools with the
  round navigation, then a fixed bar (Undo, Redo, Sound · Log, Players, Rules · Cover, Hide · Audience, ▭ · ❔ Help,
  Exit; ❔ Help as its sign only up to 1040 px wide, and under about 940 px the first eight too, so it stays one line). On a short window the round's own
  box keeps a few rows in sight (the panel scrolls), a roll's box above it too. The main button is blue only for the
  show's next step, in FLOW's words (`src/play/host/verbs.ts`: the round's intro steps, Next slide ▶, 👁 Reveal answer,
  ▦ Done ▶ board, Next round ▶, a 🤝 partner clue's Show question ▶ on PARTNER UP! and Next ▶ while its wheel is up, a
  Daily Double's Show question ▶, never greyed; over a wheel or dice tile's own tool, Show question ▶ (▦ Done ▶ board on
  a tile with no question), over a question pop-up 👁 Reveal answer then Next ▶, over any other tool, the scores, a sheet
  or a roll-off Next ▶, which only puts it away; the Final's Show question ▶, Reveal answer ▶, Start player reveals ▶,
  Show answer ▶ / Show wager ▶ / Next player ▶ and Finish game ▶ (or the next round's name), never greyed; the
  tiebreaker clue's slides, 👁 Reveal answer and 🏁 Back to results; a board game's Next turn ▶, ◀ Previous turn quiet
  beside it, none while ✎ Edit board is open (its ✓ Done editing `Esc` is in the edit panel); greyed only while a wheel turns or dice roll), `N`
  its key in every round (`Enter` too where it's Next: an intro, a slides round, PARTNER UP!, a Daily Double's Wager box,
  the Final's wager boxes); a played-out board's Next round ▶ goes on only from a click. The end screen has none: a tie
  for first is settled in its tie box (❓ Tiebreaker clue, 🎲 Tiebreaker roll-off `O`, 🤝 Declare co-winners), and `N`
  there says so and flashes it. ＋ Award is green, never blue; 🔔 Open the buzzers (`U`) and a tie's
  🎲 Roll for it (`O`) are in the buzzers' row, a partner clue's 🎡 Spin for a partner (`W`) and 📤 Send and start
  (`Enter`) in its 🤝 box, a wheel's Spin! (`W`) or dice's Roll! (`D`) in the tool's box, and a board game's roll and move
  in its turn box: one slot, 🎲 Roll (`D`), then ▶ Move Ann: 3 (`Enter`) in the same place once there's a count (greyed
  while the dice roll and at a fork), the Steps box and ◀ Back beside it, under a first line saying what to do (“Ann's
  turn: 🎲 Roll (D), then ▶ Move (Enter, or click the dice once they land)”); a click on the landed dice (or movement
  wheel) moves the token, with `Enter`'s checks. **The check before going on** (`src/play/host/goon.ts`,
  `GoOnCheck.svelte`): the blue button pressed (a click, `N`, `Enter` where it's Next, a click on the stage, the clue
  row's ▦ Done) with something left opens a card in the panel instead, anchored at its bottom right over the panel's
  buttons (never the stage, the status line or the fixed bar), with a button-free spot over the blue button. Its
  heading is “First:” (a step to take first: phone buzzers never opened, a buzzer tie, ✍ answers still coming in, a
  tile's 🤫 card not sent; a 🤝 partner clue's who picked it, the partner, who describes or nobody to partner with on
  PARTNER UP!, all musts with no “anyway”, then at the reveal its cards not handed out or the clock not started, the pair
  still playing, a steal open; a wheel or dice tile's own tool not spun or rolled, or landed on “Spin again”; the
  Final's own 🤫 card not sent at Show question ▶, its typed answers still coming at Reveal answer ▶, and the spotlit
  player not judged yet at Next player ▶ or Finish game ▶, a must whose ✔ Right `C` / ✘ Wrong `X` close the check, so
  the verdict lands on stream before `N` goes on, with no `Enter` and the likely one ringed; a board game's turn at Next
  turn ▶, where one check walks it: its roll (🎲 Roll `D`, `Enter`), “Rolling…” while the dice go, its move (▶ Move
  `Enter`, or at a fork its ways, with no key: the numbers still pick players), “Moving…” while the token goes, then its
  landing's actions not run: all instant (points, a stat, an item, a sound, a skip, a roll again, with nobody to choose)
  **▶ Run Lucky's actions ▶ next turn**; a roll, spin or question deciding the rest, **▶ Start Lucky**; anything that
  puts something up or asks who, **▶ Run Lucky's actions**, which closes the check to let it play out; each line ticked
  as it's done (“✓ Ann rolled 4”), ending on “✓ Ann's turn is played” with Next turn ▶ (`N` or `Enter`); nothing for a
  turn that ends without a move: off the board or in a zone, a slice naming no number, nowhere to go. The landing's run
  is marked (`BoardGameState.last.ran`) by one helper whichever way it runs (its landing row, its space's card and ▶ Run
  all / ▶ Start, the stage's menu, the check: bgops `runLanding`), and an Undo of what ran it takes the mark back) or “Before you go on” (a
  loss: a player picked or a Daily Double's player with no points, ✍ answers not judged, a partner clue not judged, at ▦
  Done; a wheel's or dice's score effect not given, before it goes; a question pop-up's player picked with no points, at
  its Next ▶; the tiebreaker clue with nobody its winner while they're still tied, at 🏁 Back to results or its row's
  skip: 🏆 Ann won ▶ results for each tied player, `Enter` on the one picked; a board game's question worth points that
  came up this turn with nobody given any, at Next turn ▶: ＋ Award Ann $200 ▶ next turn). A tool from the tools row never asks
  whether it spun. A Daily Double's who found it and wager, and the Final's wagers, are typed, so they never open it:
  `N`, `Enter` in the wager box or a click on Show question ▶ with one missing (or over the max) keeps the keys in the
  box (the Final's: the first to fill; in its reveals, Show wager ▶ with none in goes to that player's row), flashes the
  names or the box and says what's missing in the status line (“Waiting on Bob's phone & Cat: type their wagers, or Sits
  out”; never a phone's wager in one window). Each item has its quick buttons (＋ Award Ann $200 ▶ board `Enter`, − Deduct
  `Shift+Enter`, 🔔 Open the buzzers `U`, 🎲 Roll for it `O`, ⏱ Start the countdown `T`, ✔ Judge all ▶ board, ✍ Judge
  them, ✘ The rest are wrong, 📤 Send it; a partner clue's 🎡 Spin for a partner `W`, the players by number, Solo, ↩ Put
  back `Shift+Esc`, 📤 Send and start `Enter` (never within a second of the question), ⏱ Start the clock, 📋 Copy, ✔ Got
  it ▶ reveal `Enter` / ✘ Missed `Shift+Enter`, who steals it; a tile's Spin! `W` / Roll! `D` / ↻ Spin again `W`, ✔ Give
  Ann +$100 ▶ question, or Choose in the box for a steal, a swap or nobody chosen (who a score effect is for is the game
  screen's, `Live.scoreDrafts`, given by `applyScoreCard` there and in its box alike), ＋ Award Ann $200 and close it),
  then the foot's Not yet (`Esc`) and a quiet “… anyway” (▦ Done anyway: no
  points, `N`; 👁 Reveal anyway, `R`: `N` at a reveal only says so). It takes no key or click for 600 ms (`Esc`
  excepted), lighting up what the press would have done; an `Esc` within 600 ms of Not yet does nothing; digits keep
  their meaning (an item done meanwhile stays in its place, ticked, and “✓ Nothing left” then offers the step); `K`,
  `B`, `M`, `Space`, `←`/`→` and `F` pass through. Shift+click on the blue button goes on asking only what must be done;
  the keys go back to what opened it. What's left also rings its own button in the panel (one ring at a time), and
  “Don't ask about … again this game” silences a kind (`session.goonQuiet`). With the controls hidden in one window a
  loss that can wait goes on (a tile's tool not spun, a board game's turn not rolled, too), and a reveal, a must, a score
  effect left or a fork's way to pick is held (nothing changes on stream, the stage keeps its
  size, the Show controls pill pulses, `H` shows the panel with it open); in two windows the controls come back while
  it's open and hide again after, and a click on the stage that opened it says “See the panel ↘ first” there. Its
  words never carry what players typed, picked or wagered, nor a 🤫 card's words. The stage (and the editor's previews)
  keeps the game's colors under a Windows contrast theme; the host's controls take the contrast colors.
  Questions for the host (Exit, leaving a round, a locked door…) appear in one strip above that bar, never over the
  stage. Leaving a round says what it does and its answers name it (“7 clues are left in Jeopardy!. Go to Double
  Jeopardy!?” Keep playing / Go to Double Jeopardy! ▶; “End the game now? 7 clues are left.” Keep playing / End game ▶;
  an RPG or board-game round: “Leave Adventure for Board game?”); it goes after a few seconds, but not while the
  pointer is on it or the keys are in it.
- **Nothing selects by accident**, in every window and on the phone page: a click, a double-click, a drag or `Ctrl+A`
  turns no words blue (in a single window they'd be on stream). Text selects only in fields, links, the room code (one
  click takes it whole), error lines, ℹ About's version, build and folders and 🔊 Sound help's switch and folder; with
  the audience window open, the host column, typed answers (✍, the Final's, a partner's guess) and the 📜 Log's rows
  too, to copy into chat, let go of when the window closes. `Ctrl+A` on the host screen selects nothing outside a field (the live screen editor keeps its
  select-all). Pictures and videos don't drag off as files: a drag on one moves what it's in.
- **Windows only for reading** (ℹ About, the keys window, 🔊 Sound help, ⚖ Rules in play) close on `Enter` too, as their
  Done does (modal.ts `enter`): `Enter` on the window or its words, never from a field, a list, a link or a button in it,
  which keep their own `Enter`; a held `Enter` doesn't close one. Settings and 👥 Players, with fields, don't.
- **No browser menu**: in every window (the editor and host screen, the audience and scores windows, a 🪟 card window) a
  right-click the app has no menu for shows nothing, so the browser's menu (Back, Reload, Print) never shows on stream.
  Fields, links and selected copyable words keep it (cut, copy, paste, open link).
- **A player's menu wherever they show** (playermenu.ts): a right-click on a player anywhere on the host screen (their
  avatar or token, their plate or card on the stats strip, their score chip, their chip in the turn order, and their
  button in every box: who picked a 🤝 partner clue and the people on a team, who found a Daily Double, who gets a 🤫
  card or a 🎭 part and who's dealt in, the Final's wager and reveal rows, ✍ answers' rows, a wheel's "This was for", a
  score card's players, a shop's buyer) opens the same menu (`data-player-id`), headed by the name only (never a card's
  or a part's). `Shift+F10` or the menu key on the button opens it under it, and `Esc` gives the button the keys back;
  a long press on a touch screen opens it too, and the tap that ends the press is dropped (longpress.ts). In a box over
  the panel (🤫 Send a card…, 🎭 Deal…) the menu opens over the box, which stays open. A box to type in keeps the
  browser's menu. Its items show their keys (Select `2`, ★ Make the picker `P, 2`, the Final's ✔ Right `C`).
- **The stage's menu** (host/stagemenu.ts): a right-click on the host's stage (not on a player, a tile or a board-game
  space, which have their own), `Shift+F10` or the menu key on the main button (or a box's step button, or with nothing
  focused), and a long press open the moment's menu: a heading naming the moment ("🤝 Partner clue · Movies $400"), the
  blue button's step on its own (goon.ts `mainStep`, key `N`, through `goOn('menu')`: it asks first when something's
  left, as the blue button does; none where there's no blue button), the moment's own actions with their keys, the
  box's own items, the ways out (▦ Done ▶ board before the answer, a skip that asks first as the clue row's does; ↩ Put
  back (keep tile); a question pop-up's ✕ Close before its answer; a shop's 🚪 Leave shop), then ↶ Undo `Ctrl+Z` and ⏸
  Cover the screen `K`. Each step shows once: an item with the blue button's words is that step, and is left out
  (stagemenu.ts `stageMenuOf`), so 👁 Reveal answer `R` shows only while the blue button is still on a slide, and no
  box offers the blue button's step (Show question ▶, Next ▶, a tool's Close). The play screen builds it from the steps
  its keys do (dKey, wKey, clockKey, partnerSpin…), so it works with the controls hidden; while the panel is up, each
  box adds its own actions (offerMenu, in this order: the tool, the clue's row, the Daily Double, the 🤝 box, the Final,
  the end screen, the board game's turn, the round's ◀ / ▶, its Next round ▶ only while going on early asks), and a
  box's item for one of the moment's actions takes its place (its words and greyed state are the box's). Within a
  moment an item that can't be used is greyed, never left out. Moments: a round's intro (Skip intro); the board (its
  Next round ▶ once played out, the blue button's); a clue (◀ Slide, 👁 Reveal answer `R`, 🔔 Open the buzzers, ⏱ the
  countdown; a buzzer tie's 🎲 Roll for it first); a Daily Double (who found it); a 🤝 partner clue (who picked it; the
  wheel, each partner by their number, ⇄ Swap; then the cards' step, ✔ Got it / ✘ Missed and the clue's); a wheel,
  dice, pop-up, the scores or a shop (the spin or roll, ✎ Edit wheel, ＋ Spin another wheel too…); the Final (its slide
  before, Reveal answer ▶ `R`, the reveals' player before, ✔ Right `C` / ✘ Wrong `X`, finishing early); the tiebreaker;
  a tie at the end (❓ Tiebreaker clue, 🎲 Tiebreaker roll-off `O`, 🤝 Declare co-winners, then the end screen's
  buttons); a board game's turn (🎲 Roll `D`, ▶ Move `Enter`, ◀ Previous turn, ✎ Edit board `E`); an RPG round (▭ Select
  in a box `Alt+drag`, Select everything here, ＋ Text here…, 🗺 Full map `J`, the map for viewers `V`, 🤝 Regroup `G`). While the check is open, a right-click on the stage
  doesn't open it: the check flashes, as a click does. In one window (on stream) it shows only words the panel shows:
  names and steps, never a card's words, a part, a wager or a typed answer, and ↶ Undo without its step's name. A
  tile's menu shows its keys too (▶ Open `Enter`, ⏸ Cover the screen `K`).
- **The board-game and RPG stage by keyboard**: the host's board-game board is one Tab stop (a roving tabindex: the space
  the keys were last on, else the turn player's, else Start), the arrows go to the nearest space that way (spaceToward,
  as in the editor), `Enter` or `Space` opens its card (the controls come back for it) and `Shift+F10` its menu. A space
  never takes the keys from a click (its mousedown keeps them where they were), and a press of the pointer anywhere lets
  a space with the keys go, so `Enter` acts on the board only after `Tab` or the arrows: `D`, a click, then `Enter` still
  moves the token. In one window a secret space not revealed yet is named "? (secret)" there too. The host's RPG stage
  is a Tab stop as well: `Shift+F10` there opens the first selected player's menu, else the selected object's, else the
  round's own. `Shift+F10` on a name in the turn order or a player button in the RPG panel opens their menu.
- **An RPG stage's box select** (RpgStage, `caughtBy` in layers.ts): a left-button press that moves 4 px (a finger 10,
  `STILL_PX`, which also stops the long press's menu) draws a box: on an empty part of a screen, on a 🔒 locked object or
  one as big as its screen (a click there still opens its card), anywhere with `Alt` (its keyup kept in the page, for
  Firefox's menu bar), or after the stage menu's ▭ Select in a box (`Esc` puts that away). Never on the stats strip, the
  map on stream, a tool or the title card (they're over the screens), under ⏸ Cover, nor with ✎ Edit screen or a window
  open. It catches the drawn targets (`.avatar` tokens, `.hit` click targets) whose middle is inside it: players, and
  objects of class item, currency, npc or interactable, unless bigger than the box all round; never doorways, shops,
  zones, hazards, role-less scenery, anything locked or `neverShown` (in two windows too), and in one window nothing
  viewers don't see (it has no target). A box replaces the selection (`selected` and the objects), live as it's drawn;
  `Shift`, `Ctrl`, `⌘` or a touch adds to what was selected when the press began; `Esc` or `pointercancel` puts that
  back (before the game screen's own `Esc`). A click on an empty spot (not with those keys) clears it, as an empty box
  does; after a clear or a replace (a click, a box, `Esc`, the line's ✕, a drag of one not selected), ↩ Select them
  again brings it back for 5 s. Locked and screen-sized objects stay put when their group is dragged. Two windows: the
  host's copy draws a yellow dashed box with a faint fill and lights the rings live. One window: a thin dashed box and
  dashed outlines while it's held and 1.5 s after, and on the whole group while one of it is pressed; nothing at rest.
  The RPG box has one selection line near its top, always there (one height), with one ✕ for players and objects (the
  award row has no Clear selection of its own in an RPG round), and one `Esc` clears both, after an open card. In one
  window it counts a secret object ("1 hidden object"), Objects here numbers them ("🙈 Hidden object 1": its card keeps
  the name and buttons behind 👁 Show; what the host added during the show keeps its name), and steps that move or
  remove one carry a quiet label ("Move Ann & a hidden object"). No step is recorded for a move that moves nothing;
  long labels read "Move Ann, Bob, Cy & 5 more". A big object (a quarter of its screen) dragged alone says once a game
  how to lock it or box over it. To another screen only players go (an avatar dropped on a pane, an edge or a party,
  the minimap's Only selected, the full map): the toast says what stays ("Ann & Bob → Meadow · Sword stays on Start").
- **A double-click counts once** on a button that changes the screen (the first screen's cards and ✨ Try a sample game,
  ▶ Play, Start game ▶ and ▶ Resume it, the exported file's ▶ Play, Resume game and View results, the status bar's Resume
  game and View results, Open…'s Recent games, a tile opening its clue editor): the rest of that press (its second
  click, a triple-click's third), wherever it lands, is dropped (oneshot.ts), never a fresh click. A score plate's second
  click doesn't take the picker away again. The host panel's guard (the main button, the boxes, the round buttons, the
  fixed bar) is the same test with its own timings; after a click on who picked a 🤝 partner clue, a click on that same
  spot within a second is dropped too (a slow double-click, landing on 🎡 Spin for a partner). On ▶ Play the game's
  title renames on a double-click or `F2`.

### 6.3 Game flow
0. **Round intro** (each step can be turned off in settings): the round title card ("DOUBLE JEOPARDY!") → tiles fill in
   randomly with a cascading animation → categories are revealed one at a time on each host click (or automatically).
1. **Board**: category headers + tiles (value or custom face). Used tiles are dimmed or blank. The score bar shows each
   player's name, color, and score (one row, up to 20 players).
2. Host clicks a tile. It zoom-transitions to the **Question slide**. A clue can have several question slides (a
   lead-in, then more): `N` / **Next slide ▶** goes through them before the answer, and viewers see small dots for
   where they are.
   - *Daily Double*: DD splash, then a wager input for the chosen player (not limited by default; the host can turn on the max(score, highest round value) limit), then the question.
     The ⭐ box's first row is “Daily Double! Who found it?” and the players; its Wager row holds the Wager box, Ignore the
     limit and True Daily Double, then the max's words, cut short where the row is narrow. **Show question ▶** is the
     blue button's (`N`, or `Enter` in the Wager box), never greyed: with who found it or the wager missing, below 0 or
     over the max, it keeps the keys in the Wager box and says what to do (“Type a wager (Ann can wager up to $1,000), or
     True Daily Double”; “Waiting on Ann's phone: type their wager here if it doesn't come”). It opens at its top, the
     keys in the Wager box: in one window on a laptop the heading, the players and the Wager row are in view while the
     panel keeps the board's height.
   - *Partner clue* (🤝, PARTNER-CLUES-SPEC.md §6): a PARTNER UP! splash with the picker, a wheel of the other players
     (`W`) or the host's choice (`1–9`) for their partner, then the question with who describes and who guesses, the
     📤 list of who gets each 🤫 card (copied to them with 📋), ⏱ Start the clock, and ✔ Got it / ✘ Missed, which
     scores both in one step with the clue's points (the guesser picks next). The 🤝 box holds each of its actions, once,
     beside the choices it's an alternative to: its first line says what's next ("Next: 🎡 Spin for a partner, or choose
     one"; the pair set, "Pair set: Show question ▶ (the blue button, or N) puts the question up"), **🎡 Spin for a
     partner** (`W`) comes first in the partner row, in front of the players to choose from by hand (**↻ Spin again** in
     its place after; a team's **🎡 Spin for the describer** likewise, in front of its people; while the team plays it
     the partner row has none, so one ↻ Spin again shows), PARTNER UP!'s cards fold into one quiet line ("🤫 2
     cards · 📋 you'll copy them": who each goes to, how they reach them and their files open on a click, this computer
     remembering it; it opens by itself, and stays open for the clue, when there's something to see first: a player a
     card goes to with no phone here, an older buzzer server, files that won't reach the phones), and its foot, in view
     as the rest scrolls, has ✔ Got it / ✘ Missed, quiet until the clock runs, and while the cards are handed out, at its
     right end, a 📋 for each card copied by hand and **📤 Send and start** (or ⏱ Start the clock, `Enter`); when that
     goes nothing moves into its place. The action due now (🎡 Spin for a partner or for the describer, 📤 Send and
     start or ⏱ Start the clock) wears the ring. The blue button is the show's next step only: **Show question ▶** on
     PARTNER UP! (`N`, `Enter`; **Next ▶** while the partner wheel is up, greyed while it turns, which puts it away and
     shows the pair: a click on the landed wheel does the same), then 👁 Reveal answer and ▦ Done ▶ board, asking first
     with something left (the check above: who picked it, the partner, who describes or nobody to partner with on
     PARTNER UP!; the cards not handed out, the pair still playing or a steal open at the reveal, where `N` never takes
     “anyway”; not judged at ▦ Done). PARTNER UP!'s ↩ Put back (keep tile) shows `⇧Esc`. A click on a box's button
     leaves the keys where they were; the rest of a double-click that redrew the box is dropped, and 📤 Send and start
     (or ⏱ Start the clock), in the box or in the check, waits a second after the question, as Enter does. Once the
     clock runs a verdict is due: ✔ Got it / ✘ Missed are an equal pair (neither blue), the blue 👁 Reveal answer asks
     first, and the first line says "Did they get it? ✔ Got it (Enter) or ✘ Missed
     (Shift+Enter)" ("Time's up: did they get it?" once it runs out). ⏱ Start the clock says what it counts down from
     ("⏱ Start the clock (45 s)"). `T` or the status line's ⏱ Start while the cards are handed out: with no card waiting
     for a phone (copied by hand, or all sent) it goes live as ⏱ Start the clock does, sending nothing, and the first
     Enter after it only says "Clock is running: Enter again for ✔ Got it"; with phone cards still to send it starts
     the clock only, the 🤝 box's foot reads **📤 Send the cards (clock running)** and the status line "Clock running:
     Enter sends the 2 cards", and Enter sends them (a card goes to a phone only by Enter on that step or a 📤 press).
     Under the box the Amount row folds behind **± Other points…** (✔ Got it / ✘ Missed give the points): it opens by
     itself once a player is picked (`1–9`, then Enter awards them as on any clue) or points were given by hand on the
     clue, and stays open for it; a steal's row is the Amount row, open. Nobody buzzes. With **steal on a miss**
     (⚖ Game rules' `partnerSteal`, or the clue's own `PartnerRules.steal`), ✘ Missed lets everyone else answer it as
     any clue for the tile's value: the buzzers open for them with the two locked out, or the host picks who steals
     (`1–9`), then Enter / Shift+Enter. Each steal is its own undo step, and undoing the miss closes the steal. A click
     on the stage never shows its answer before the pair has had their go: while the cards are handed out, or until the
     clock runs out or it's judged, it opens the check instead, as the blue button would (`R` shows it any time, and in
     the check `R` or a click on 👁 Reveal anyway); while a steal is open (until it's stolen or missed by everyone) it
     says how the steal goes on, as Enter does.
   - *✍ Everyone answers* (a standard tile with the box ticked, with phone buzzers): nobody buzzes; every player types
     an answer on their phone (a team: anyone on it) until the answer is shown, or until the host judges theirs (then
     it's locked on their phone; undoing the mark opens it again, and once they change it, redo doesn't bring that mark
     back); only the host sees them (in one window, not until the answer is up: till then each player's row says whether
     theirs is in, in the room the words then take, long ones scrolling in it, so the stage keeps its size); the stream shows ✍ and who has answered
     while answers are open; the host marks each ✔ / ✘ for the tile's value. With **multiple choice** (2–6 choices
     under ✍ in the editor, one marked ✔ Right), players tap one instead, and ✔ Judge all marks everyone by the right
     choice in one step (`Enter` too, with nobody selected; its button shows ⏎ then). The stream shows the choices under the question (the slide drawn smaller over them, the right
     one lit with the answer). Without phone buzzers it plays as a normal clue, the choices still on stream.
   - *Any tile with 🤫 cards* (PARTNER-CLUES-SPEC.md §12.2): its panel lists them for whoever picked it (a Daily
     Double's player; a right answer moving the picker on doesn't change it) with 📤 Send (or 📋 to copy them, or 🪟 to show one in the card window); they go when the tile closes, and
     the stream says "Ann has a private question" on a standard tile.
   - *Wheel clue*: the wheel appears and the host spins, then the outcome is revealed. The question slide is optional,
     so a tile can be purely "spin the punishment wheel" with no question at all.
   - *Dice clue*: the dice roll animation, then the outcome. The question slide is optional too.
   - For wheel/dice tiles with no question, the scoring panel stays available but is collapsed by default.
3. Optional timer starts automatically or manually. At 0: flash/shake + "TIME'S UP" banner, plus the optional user
   audio `timesUpAudio`. Nothing else happens automatically: no auto-reveal and no auto-scoring. A right answer or the
   answer going up stops it; a wrong one doesn't (someone else may answer), except from a Daily Double's player.
4. **Scoring panel** (always available while a clue is open):
   - One toggle per player (colored chip). **Select zero, one, or many.**
   - Amount field, prefilled with the clue value (or the DD wager). Editable to any number.
   - Buttons: **Award +**, **Deduct −**, and quick "Wrong (−value)" per player when deduct-on-wrong is on.
   - Awarding does not auto-close the clue, so multiple awards/deductions per clue are possible.
5. **Reveal answer**: shows the answer slide in the audience view (by the blue button, `N` or a click: with the buzzers
   never opened, ✍ answers still coming in or a 🤫 card not sent, it asks first; `R` shows it at once).
6. **Back to board**: marks the tile used. "Unmark" is available by right-clicking the tile. By the blue button, `N` or
   a click, with points not given it asks first (＋ Award … ▶ board, or ▦ Done anyway); `Esc` goes at once.
7. When all tiles in a round are used (or the host clicks "Next round"), move to the next round, then Final.

### 6.4 Final Jeopardy (optional)
1. Category slide and wager entry together: on one screen the host ticks who plays (players with ≤ 0 can be excluded or
   allowed, a setting of the round) and enters each player's wager in the host view only. Wagers are whole numbers,
   0 or more; the max(score, 0) limit is off by default and the host can turn it on. A wager stays editable until it's
   revealed, and remembers whether the host or the player's phone entered it. With phone buzzers, each player in it (a
   team: anyone on it) can send their wager from their phone until the question is shown; the amount goes to the host
   only (never to the audience window or other phones), and the host can still change it. A Daily Double's player can
   do the same before its question shows.
2. Question slide + timer (default 30 s) + optional music file. With phone buzzers (and ✍ Players type their answers on
   their phones, on unless the host unticks it in the round's editor), each player in it types their answer on their
   phone (a team: anyone on it) from the question until the answer shows; only the host sees them (in one window, not
   until each is revealed), and the stream shows ✍ and who has answered, never what. With multiple choice (under the
   switch in its editor, as a ✍ clue's) they tap one instead, the choices show on stream under the question (the right
   one lit with the answer), and each reveal says whether a pick is the one marked ✔ Right.
3. Answer reveal.
4. **Per-player reveal**, one at a time in an order the host chooses: a typed answer first (show it, then mark ✔ / ✘,
   and the wager goes up with the mark; judging first puts it up too), otherwise show the wager, then mark ✔ / ✘; the
   score animates. The blue button (`N`) does Show answer ▶, Show wager ▶ and Next player ▶ (Finish game ▶ after the
   last one); the spotlit row's own Show answer or Show wager is left empty meanwhile (the other rows keep theirs, to
   show a player out of turn). The verdicts are only in the rows, **✔ Right** (`C`) then **✘ Wrong** (`X`), neither
   blue; with multiple choice and one marked ✔ Right, the verdict their pick points to is ringed there (in one window
   once their answer is on screen). With the spotlit player not judged yet, Next player ▶ (or Finish game ▶) asks for
   the verdict first, in the check: ✔ Right / ✘ Wrong there judge them and close it (`N`, `C`, `N`, as before).
   Finishing early is a quiet Finish game ▶ at the box's foot, asking first in the strip; it isn't there while the blue
   button is Finish game ▶ itself. With everyone judged, `N` twice finishes. `1`–`9` spotlight a player by their number
   (in the players' order), shown on each row.
5. **Tie check**: if two or more players are tied for first, the results screen's tie box offers every way to settle it
   (it has no blue button; `N` says to settle the tie there):
   - **Tiebreaker clue** (the pre-written `Game.tiebreaker`, if authored; greyed with why otherwise). Scored with the
     normal scoring panel (the winner and ＋ Award with 0), or 🏆 their name when its 🏁 Back to results asks, or
   - **Tiebreaker roll-off** between only the tied players (§6.6, `O`), or
   - **Declare co-winners**.
   The same tie check runs at the end of the game when Final Jeopardy is off.
6. Winner screen: final standings with player colors. Confetti.

### 6.5 Scores & players
- Edit any player's score directly at any time (click the score, then type).
- Add, remove, rename, and recolor players mid-game. Each is an undo step: undoing a removal mid-clue gives the player
  back their part in it (a Daily Double's player, a partner clue's picker or partner, with the countdown the removal
  stopped and the time it had left; a redo stops it again).
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
  or rolling, then show the result. Dismissing the overlay returns to whatever was underneath (board or clue); not
  while it's still spinning or rolling (it lands first, as `W` and `D` wait). A wheel or dice tile with no question
  closed before it spun or rolled stays on the board. A wheel or dice tile's own tool goes with the tile (▦ Done ▶
  board, ↩ Put back (keep tile) or `Shift+Esc`) and is still its tile's after a reload. The points it gives (its score
  effect, a slice's points) are its tile's (`toolTile` on their score events, not `clueId`: no award on the clue), so
  ↩ Put back waits for an Undo of them, as after an award, even once the tool is closed. A wheel or dice tile with a
  question offers 👁 Reveal answer only once its tool is closed and the question up: before that, `R` says to spin or
  roll first (`W` / `D`), or once it has landed to close it (`Esc`), and `R` again shows the answer anyway (a wheel that
  won't spin, one only for show). With the controls hidden, `N` there does what a click on the tool does: spin or roll
  it, then close it (through the check, as a click does).
- **The tool's box** in the host panel keeps its places in every state: on its first row the tool's name, its spin or
  roll in one slot (**Spin!** `W`, greyed while it turns, then **Spin again**; ↻ Spin again on a "Spin again" slice;
  **Roll!** `D`, then **Roll again**; ringed while it's what's left first, a tile's own tool not spun yet), ✎ Edit wheel
  and ＋ Spin another wheel too…, and the result. It has no Close: putting it away is the blue button's step (a wheel or
  dice tile's own: Show question ▶, or ▦ Done ▶ board with no question; anything else: Next ▶), or `Esc`. A question
  pop-up keeps **✕ Close** `Esc` until its answer is up (it puts the question away unseen; the blue button reveals
  it); a shop keeps 🚪 Leave shop. A click on the box's slot gives the keys back to the blue button. The partner wheel
  and a board game's own roll leave spinning again to their own box (the 🤝 box's ↻ Spin again, the turn's 🎲 Roll), and
  a board game's own roll goes in the roll log as the turn player's (no "This was for" to tick). `Esc` with a score
  effect not given says so first (`Esc` again closes without it); the blue button and a click on the stage ask in the
  check. While an outcome's score
  card waits, it's what's in view there; the first row comes back once it's confirmed or skipped. A box's step button
  (a tool's, a 🤝 partner clue's, a Daily Double's) drops the rest of its own double-click wherever it lands, so the
  second click never acts on what took the box's place.
- **Reveal**: the outcome is shown on the audience view (label, plus details/media/custom slide if set), with an
  optional countdown. The host can dismiss it, re-spin/re-roll, or tag it with a player
  ("this punishment is for Alex"). Every spin/roll goes into the **roll log** (separate from the score log, no score impact),
  which says "… spinning" or "… rolling" until it has landed on stream (the log can be on stream in one window).
- **Removing slices**: with "remove after landing" on, a landed segment is removed for the rest of the session (e.g. each
  punishment only once). The host can restore removed segments.
- **Score actions (optional)**: only if the landed outcome has a `ScoreAction`, the host view shows an action card
  ("Bankrupt → set score to 0"). The host picks the target player(s) (and a source player for steal/swap), previews the
  score change, then clicks **Confirm** or **Skip**. Confirmed actions are written to the score log with a reason
  ("Wheel: Punishment Wheel → Bankrupt"), so they can be undone like any other score change. Closing the wheel or dice
  with a card neither confirmed nor skipped says so first; closing again goes on without it.
- **Timer**: start, pause, reset, and set a custom duration.
- **Scoreboard overlay**: toggle a large standings view on the audience window.
- **🤫 Send a card…** (PARTNER-CLUES-SPEC.md §12): a private card for chosen players' phones, in any round (a tile's
  card made in the editor, a quick one, or the slide on screen), lasting until the round ends or until taken back;
  `🤫 N cards out` lists them by number ("Card 2 → Ann"), never what's on them, with ↻ Send again and ✖ Take back. At
  most 8 are out at once. A 🪟 card window shows one player's cards, for a player with no phone. A player taken out
  keeps their place on the cards (a ↻ Send again meanwhile too), left out of the list while they're out; once they're back (Ctrl+Z, ↩ Restore)
  ↻ Send again sends theirs.
- **🎭 Deal…** (PARTNER-CLUES-SPEC.md §11): secret parts for everyone (a spy, a wolf, a captain, a prompt each), from a
  deal saved with the game (the 🎡 Wheels, Dice & Deals tab) or a ready-made one. Each player gets one part at random (or the host's pick,
  with the audience window open), and a part's card can show a slice of a saved wheel (each their own, or one shared
  by everyone but the odd one out). Nothing goes until 📤 Send, which sends each player's card on its own; ↻ Send again
  and ✖ Take back work on the whole deal. A player taken out keeps their part, their card off the phones: the counts stay
  as dealt, the deal stays out (↻ Send again, and ✖ Take back, which takes theirs too) even when theirs was its only
  card, and once they're back (Ctrl+Z, ↩ Restore) ↻ Send again sends their card. Only the two-window host column says who got which: one window lists everyone
  dealt in alike, a part or not (with the phones getting the cards, only those with no phone here, 📵, to copy theirs),
  and counts the phones that came late. **🎭 Who was who** puts the names and parts on stream when the host presses it,
  as an undoable step; a click on it, Esc, opening a tile or the tiebreaker, going to another round, or the Final going
  on takes it off.

### 6.7 Media playback controls
- Play/pause, seek bar, current time/duration, volume, mute, restart, loop toggle, and full-screen element.
- Autoplay respects the per-element setting. **Browser autoplay policy**: autoplay is allowed after
  the host's first click, so "Start game" counts as that click.
- Keyboard: `Space` play/pause, `←/→` seek ±5 s, `M` mute.
- On the stage, clicking a video or a sound's speaker icon plays or pauses it (in dual mode, in the audience window)
  instead of revealing the answer. The host sees ⏸ on a playing sound's icon; the audience sees the plain icon.

### 6.8 Host keyboard shortcuts
The full list, by round, is the keys window (`src/play/KeysHelp.svelte`; the lists are `src/play/hostkeys.ts` and
`src/editor/editorkeys.ts`): one window for the editor's keys and the host's, a switch at its top, **[ Editor | During
the game ]**, and a filter for both (a key looked up in the other part is a click away; a renamed button is found by its
old name too, for a release or two: `RENAMED` in `src/lib/keylist.ts`). `?` in the editor opens it on Editor (so does ❔ Help ›
⌨ Keyboard shortcuts in the editor's header; its 🎮 Keys during the game opens it on During the game); `?` and
❔ Help on the game screen on During the game, the round being played's keys first (on the pre-game screen its own keys
first), over the host panel in a single window. In its filter `?` types; `Esc` clears the filter, then closes it. Its
foot has 📖 How to host ↗ and 💡 Show all tips again (the editor's 💡 Tips open again the next time, and the game
screen's first-time notes show again). The main keys:

| Key | Action |
|---|---|
| `1`–`9` | Toggle player N in the scoring panel (buzzer mode, during a clue: player N answers) |
| `0` | Everyone or no one (buzzer mode, during a clue: reset the buzzers) |
| `Enter` / `Shift+Enter` | Award / deduct the current amount to the selected players (a ✍ multiple-choice clue, its answers locked, nobody selected: `Enter` is ✔ Judge all, one undo step) |
| `R` | Reveal (or hide) the answer |
| `N` / `Shift+N` | The blue button, Next or Reveal: the round intro, a clue's next slide, 👁 Reveal answer, ▦ Done ▶ board, the Final's steps, Next turn ▶; with something left it asks first (the check), `N` again goes on anyway, except into an answer (`R`) / one step back, never asking |
| `Shift`+click on the blue button | Its step without asking (must items still ask) |
| `Esc` / `Shift+Esc` | Back to board (marks the tile used) / cancel the clue (the tile stays playable) |
| `K` or `B` | "Be right back" cover |
| `T` / `Shift+T` | Start/pause the countdown / 10 more seconds |
| `D` dice · `W` wheel · `O` roll-off (a buzzer tie: 🎲 Roll for it, never asking) · `S` scoreboard overlay | Tools |
| `U` | Buzzer mode: open the buzzers |
| `P`, then `1`–`9` | Set current picker to player N |
| `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y`) | Undo / redo (scores, moves, tiles, the Final…) |
| `A` / `Shift+A` | Open or focus the audience window / the scores-only window |
| `L` · `H` · `F` · `?` | Log · hide host controls · full-screen · the key list |

The keys window's During the game part has a group for the blue button and the check (`BLUE` in hostkeys.ts) right
after Everywhere: `N`, `Shift+N`, `Shift`+click, where `Enter` is Next (a round's title card and categories, a slides
round with the keys on the blue button, PARTNER UP! before the question, a Daily Double's or the Final's wager box) and
what it does elsewhere, and the check's keys (`inside()` in goon.ts: `Enter` the ⏎ fix, never "anyway" or Not yet;
`Shift+Enter` the ⇧⏎ fix; `N` "anyway" but never into an answer; `R` reveal anyway; `Esc` Not yet, its bounce ignored;
the fixes' own keys; the keys that pass through or close it first; the 600 ms guard). Above the groups it lists what
`session.goonQuiet` holds (`silencedRows`), each with **Ask again**, which takes that kind off the list for the game.

A held key counts once: only the arrows (and the numpad in an RPG round) repeat. A button the app put the keys on
(the one that had them went away, or at the start) doesn't take `Enter` or `Space` for itself until it's chosen (with
`Tab`, or as the next row of the list the keys were in): the keys keep their shortcuts. Even then only a plain `Enter`
or `Space` presses it: `Shift+Enter` is always ✘ Missed or − Deduct, never a press of the button or tile the keys are on
(✔ Got it, ＋ Award, ▦ Done ▶ board; a tile opens with `Enter` or `Space`, not `Shift+Enter`). `Enter` on the main button in
a slides round, on a round's title card or its category reveals, does what the button says, as `N`; on a 🤝 partner
clue's PARTNER UP! `Enter` is the blue button wherever the keys are, then the 🤝 box's 📤 Send and start (or ⏱ Start the
clock), then ✔ Got it; in the Final's
steps it says which key (or click) goes on (with the spotlit player's verdict due, “C: right · X: wrong”; in its wager
boxes `Enter` is the next box to fill, then Show question ▶), and on a wheel or dice tile not spun or rolled yet
the key that does it (“Spin the wheel first: W”). `Enter` in a Daily Double's Wager box is its Show question ▶. With players
selected on the board, `Enter` on a tile takes the keys to the Amount box (type the points, then `Enter`, and they're
back on the tile) instead of opening it; while the keys are there, number keys type and the chips hide theirs.

---

## 7. Audience View Requirements
- Always renders at 16:9, letterboxed to fit any window size. Designed for a 1920×1080 capture.
- Never renders answer slides, host notes, DD locations, or wagers until they are explicitly revealed.
- Smooth transitions: tile zoom (a clue's question the first time it shows; its next slides, its answer and its question
  again come in quietly), slide fade, score tick animations, and a board-fill animation at round start. Each step
  arrives as one picture (the session and what's over it in one message), as on the host's own copy.
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
  and/or answer in a category, a round or the game; a clue starts on its own category, and a slides round offers its
  other slides).
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
- **Color boxes** open the app's own color picker, not the browser's (whose way of typing a color can't be set): a
  saturation/brightness square and a hue bar (dragged, or the arrow keys, ten times as far with `Shift`), **Hex | RGB**
  side by side to type the color in (Hex at first, then whichever was used last on this computer), 💧 Pick from the
  screen (the desktop app's own picker; a browser's eyedropper where it has one, none in the others), and the color it
  was beside the new one. Under its box or over it, kept in the window and over windows; in a single window, in the host
  panel or a window over it (beside its box when neither has room), off the stage. It closes, keeping the color, on a
  press elsewhere (a right-click on its box too, whose menu then shows), once its box scrolls out of sight, and on
  `Ctrl+S`, `Ctrl+F` and the like, which then do what they always do. The box gets an input event as the color changes
  and one change event when the picker closes with another color: a picker's changes are one undo step, and `Esc` puts
  everything back as it was, with no step.

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
| Score bar | Name + color only (a player's picture is their RPG avatar, not on the plate) |
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
