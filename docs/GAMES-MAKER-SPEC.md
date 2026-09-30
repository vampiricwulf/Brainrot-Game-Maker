# Brainrot Games Maker: specification

Status: draft 2 (2026-09-30), with every draft-1 question answered. This extends [`SPEC.md`](SPEC.md), which stays the reference for everything the
Jeopardy modes do today. Nothing is removed: the Jeopardy board, Final Jeopardy, slides, media, wheels, dice, timers,
sounds, the audience window, the desktop app and every file format keep working.

## Contents

1. [Goals](#1-goals)
2. [Decisions so far](#2-decisions-so-far)
3. [Research summary](#3-research-summary)
4. [The rename](#4-the-rename)
5. [Architecture: a toolset plus round modes](#5-architecture-a-toolset-plus-round-modes)
6. [Round modes: Jeopardy board and Final Jeopardy](#6-round-modes-jeopardy-board-and-final-jeopardy)
7. [Round mode: RPG (the map game)](#7-round-mode-rpg-the-map-game)
8. [Editor changes](#8-editor-changes)
9. [Host controls in play](#9-host-controls-in-play)
10. [What the audience sees](#10-what-the-audience-sees)
11. [Files, saving and migration](#11-files-saving-and-migration)
12. [Milestones](#12-milestones)
13. [Testing](#13-testing)
14. [Open questions](#14-open-questions)
15. [Sources](#15-sources)

---

## 1. Goals

- **One program for many game shows.** "Jeopardy Builder" becomes **Brainrot Games Maker**. A game is a list of
  rounds, and each round picks a **mode**: *Jeopardy board*, *Final Jeopardy*, or the new *RPG* mode. More modes
  can be added later without touching the others.
- **The existing features become a shared toolset** that every mode uses: players and scores, slides and the slide
  editor, media, wheels, dice, the roll-off, timers, sounds, pop-up overlays, the score log with undo, the audience
  window and the theme.
- **RPG mode** hosts the kind of improvised RPG that Magic The Noah runs:
  - The host builds a world of **screens**, like Legend of Zelda's flip-screens, arranged on **maps**. There is one
    primary map of connected screens, plus any number of maps that aren't connected to it (dungeons, shops,
    interiors, a "Shadow Realm").
  - Screens are slides with objects that have a **class**: doorway, item, currency, NPC, shop, hazard, and so on.
  - Players have **avatars** that the host moves around.
  - The game can use host-defined **character sheets**, **inventories**, **currency** and **shops**. All of these are
    optional, because the game is mostly roleplay.
- **The rule of funny.** Nothing happens without the host, and the host can override anything at any time: teleport
  anyone anywhere, edit any number, invent an item, add an object mid-show, rewrite a price, or undo.
- **The host is the only operator.** Players talk over voice or chat. There are two windows, as today: host controls,
  and the audience view that OBS or Discord captures. A player-facing view is out of scope.

## 2. Decisions so far

These are the answers to the questions asked while writing this spec.

| Topic | Decision |
|---|---|
| Party | Players **can split up** across screens. By default the host moves the whole party together. |
| Character sheet | **Host-defined fields** per game (e.g. HP, Gold, Mana, "Vibes", free text). Numbers can show as bars or counters. No rules are enforced. |
| Map for the audience | **The host chooses per map**: fully visible, or only discovered screens. The map can also **show which directions are open without revealing where they lead**. |
| Score and currency | **Separate.** Jeopardy points stay the game score and currency is its own stat, but the host can convert between them at any time. |
| Object triggers | Objects can trigger **wheels and dice**, **question/clue slides**, **sounds, videos and pop-up slides**, and **stat and inventory changes**. |
| Avatars | An **image per player**, a **fallback token** (colored circle with initials), and **equipment shown on the avatar**. |
| Operators | **Host only**, with two windows. |
| Rename | **Keep everything working**: old `.jbr` packs and exported HTML files still open; the desktop app carries its autosave, media and settings over from the old folders. New packs use **`.brainrot`**. |
| Mode name | The map-based mode is called **RPG** (`mode: 'rpg'`). |
| Next mode | A **Board game** mode (Magic The Noah's spin-to-move loop) comes **next after RPG** (§7.13). |
| Old games with Final Jeopardy switched off | **Dropped** on upgrade. |
| Player info on stream | **A stats strip always, plus a full player sheet the host pops up on demand.** |
| Big shows | Past 12 players, the strip shows **only the focused party**. The scoreboard overlay shows everyone. |
| Music | Map and screen music **cross-fades**. The same track carries on without restarting. |
| Player view | **Out of scope.** Host-only for good, so nothing is designed for a player-facing view. |
| Logo | **New icon and wordmark made for the rename**, in the app's current colors (it can be swapped later). |

## 3. Research summary

The full notes and links are in §15. What shaped this spec:

**Magic The Noah.** Sources: fan wikis, TV Tropes and social posts. They were read through search snippets only,
because video pages couldn't be opened from the research environment.

- **He builds his games in Google Slides**, and sometimes Canva, not Google Sheets. Each space, zone or screen is a
  slide. He drags player pieces around and jumps between slides. That is the model this spec follows: a screen is a
  slide.
- He is a former Magic: The Gathering YouTuber who has run game shows since October 2022. His first show was a
  Jeopardy-style trivia game, the same starting point as this program.
- Guests are usually 3 YouTubers on Discord voice. One show had 32 players and ran for 3 h 44 min, so the player list
  and the HUD must scale.
- **Randomness is almost all wheels:** a d20 wheel, a Good Wheel, a Bad Wheel, a Shadow Wheel, and wheels for
  particular zones ("Unfortunately, you get to spin the Bad Wheel now"). The existing wheels, with per-spin editing and
  the player wheel, already cover most of this.
- **Gold is the currency.** Starting gold can depend on a player's character (e.g. "all mammals start with 4 gold").
  Board spaces give or take gold, or send you to a wheel. **Shops** sell items (e.g. Flamingos at 12g, needed to win).
- **The Shadow Realm** is a recurring zone that isn't on the main board. It is hard to escape and has its own shop,
  **which shares its stock with the main shop**. This is the "disconnected map" case, and shops need shared stock.
- **Combat** compares a "power" number (Goblin 1, Wolf 2, Slime 3 and +2 each time it wins, Dragon 100) against the
  player plus a spin. Monsters need editable stats that can change mid-game.
- **Hidden rules and a host who lies.** Win conditions are often secret, and rules are discovered by trial and error.
  The host needs host-only notes and hidden objects, and must be able to change anything live.
- **Other formats he runs** could become modes later (§14): board-game loops, a memory game, a drawing game, and
  games where players add the rules.

**Virtual tabletops (VTTs), Zelda-style editors, and live-show tooling.** Patterns worth borrowing:

- **Owlbear Rodeo.** An object's type decides its stacking layer and who can interact with it. The host never manages
  layers. This is our "class" idea. Owlbear also shows that simple beats powerful for improvised play.
- **Roll20.** A "Players" ribbon moves the whole party to a page. "Regroup" pulls everyone back. Individual players
  can be dragged to other pages. Its GM layer is shown to the GM only. Explorer mode shows visited areas in grey.
- **Foundry VTT.** A GM can preview a scene before switching players to it. "Pull to scene." The Monk's Active Tiles
  module fires actions when a token steps on a tile. The Item Piles module adds shops with stock and prices. Foundry is
  also the warning: rules engines and compendiums are too much for an improv show.
- **NES Zelda.** The overworld is a 16×8 grid of screens addressed by (column, row). Caves and stairs warp to separate
  interiors. Dungeon maps have three knowledge states: unknown, known-but-unvisited, and visited. The "Map" item
  reveals everything.
- **ZQuest Classic, RPG Maker, Bitsy, LDtk and Tiled:**
  - Neighbors come from grid position, and only warps and doorways are stored.
  - Exits can be one-way or two-way, with transitions (fade, wipe) and lock conditions.
  - Bitsy treats an item as a simple counter.
  - A world view shows every screen as a thumbnail laid out on the grid.
- **Live-show practice:**
  - Keep the host's preview separate from what's on air, as in OBS Studio Mode.
  - Have a panic "cover" key.
  - Keep hidden things hidden in every audience rendering path.
  - Make hotkeys Stream Deck friendly.
  - Undo everything.
  - Never fire a trigger without the host.

## 4. The rename

### 4.1 Names

| Thing | Today | New |
|---|---|---|
| Product name (window titles, About, README, player home) | Jeopardy Builder | **Brainrot Games Maker** |
| GitHub repo | `vampiricwulf/Jeopardy-Builder-Brainrot` | `vampiricwulf/Brainrot-Game-Maker` (rename in GitHub settings; GitHub redirects the old URLs) |
| npm package | `jeopardy-builder-brainrot` | `brainrot-games-maker` |
| Single-file app download | `jeopardy-builder.html` | `brainrot-games-maker.html` |
| Desktop exe | `jeopardy-builder-portable.exe` | `brainrot-games-maker-portable.exe` |
| Tauri `productName` / crate name | Jeopardy Builder / `jeopardy-builder` | Brainrot Games Maker / `brainrot-games-maker` |
| Tauri identifier (sets the data folders) | `com.jeopardybuilder.brainrot` | `com.brainrotgames.maker` (see §4.3) |
| Game pack extension | `.jbr` | **`.brainrot`**, with `.jbr` still opened forever |
| Clipboard type for slide items | `application/x-jeopardy-slide-items` | `application/x-brainrot-slide-items`; the old one is still read |
| Default round names | "Jeopardy!", "Double Jeopardy!", "Final Jeopardy!" | Unchanged: they name the Jeopardy modes, not the program |
| App icon | "Jeopardy" artwork | A new icon and wordmark in the app's current colors |

The Jeopardy modes keep their Jeopardy wording. Only the program's own name changes.

### 4.2 Things that are *not* renamed, because they are inside users' data

- **The uploaded-font prefix `jb-`.** Games store family names like `'jb-1a2b3c4d', sans-serif` in their text boxes.
  The prefix stays, and a comment explains why.
- **IndexedDB keys** (`editorDraft`, `playSession`, `playSession:player:<id>`, `media:<id>`) and the idb-keyval
  database name. They aren't Jeopardy-named, so they stay.
- **localStorage keys** `jb.audioOutput` and `jb.dataNoticeSeen` stay. They are internal names.
- **The embedded-pack element id `jb-pack`** in exported HTML stays, so a newer build can still read old exports and
  old exports keep working.

Safe to rename, because they only exist while the app runs:

- the sync channel name;
- the Web Lock name;
- the window names `jb-audience` and `jb-media`.

The one exception is the Web Lock. For one release, the lock is also taken under its old name, so an old copy open
at the same time can't prune the new copy's media.

### 4.3 Moving the desktop app's data folders

Changing the Tauri identifier changes both folders the app writes to:

- `%LOCALAPPDATA%\<identifier>`: WebView2's data, which holds the autosave, games in progress and media;
- `%APPDATA%\<identifier>`: the Discord audio fix's files.

The app origin (`http://tauri.localhost`) doesn't depend on the identifier, so copying the WebView2 folder carries
all stored data across. On startup, before any window is created:

1. If the new data folder doesn't exist and the old one does, **move** the old folder to the new path. A rename works
   on the same drive. If it fails, copy the folder and then delete the old one. Do the same for the settings folder.
2. A `migrated-from` note is written into the new folder, so the move is never repeated or reversed.
3. If the old folder can't be removed (for example, an old copy is still running), the app remembers it and retries
   on later starts. This keeps the "no residual folders" promise from the About dialog.
4. The About dialog lists the new folders. If a leftover old folder still exists, it shows it with an **Open folder**
   button and a note that it can be deleted.
5. The first start after the move shows a one-time notice: "Brainrot Games Maker moved your data from the old
   Jeopardy Builder folder."

The browser single-file app has no folders:

- In Chromium, every `file://` page shares one origin, so renaming the downloaded HTML file keeps the autosave.
- Firefox may scope `file://` storage more narrowly. This needs checking before release; if it does, the release notes
  should say to open a saved pack.

### 4.4 Code and repo

- **Repo rename:** done by the owner in GitHub → Settings → General → Repository name. GitHub redirects old links
  and git remotes. The app's `REPO_URL`, the README links and the desktop `open_link` allow-list all switch to the
  new URL, and the allow-list also accepts the old one.
- **CI:** artifact and release names change as in §4.1. The Latest release notes say once that the program was
  renamed.
- **In-app text:** every "Jeopardy Builder" string becomes "Brainrot Games Maker". The `PlayerHome` logo "JEOPARDY!"
  becomes the game's own title, with a Brainrot Games Maker footer.

## 5. Architecture: a toolset plus round modes

### 5.1 The toolset (shared by every mode)

Already mode-agnostic today:

- **Players:** name, color, and now an avatar (§7.6). Add, remove and restore mid-game.
- **Score:** `scoreLog`, batched undo/redo, manual edits, clamping, the currency symbol.
- **Slides:** `SlideView`, `SlideEditor`, layers, the image editor, entrance animations, media playback, embeds.
- **Media:** library, links, packs, pruning.
- **Wheels, dice and roll-off:** presets, the player wheel, per-spin edits, the roll log.
- **Live state:** timer, score pops, sound cues, tool overlays, the scoreboard overlay.
- **Windows:** audience window, sync, audio output, the Discord audio fix.
- **Screens:** the theme's score bar and fonts, the end screen, ties and rematch.

New tools that every mode can use (built for RPG mode, but not tied to it):

- **Stats:** host-defined player fields (§7.7). A Jeopardy game can use them too (e.g. "lives").
- **Items and inventory** (§7.8).
- **Pop-up slide:** show any slide full-screen over whatever is on air, then close it and return. This is how a sign,
  an NPC's dialogue or a surprise is shown.
- **Action runner:** runs a list of actions (§7.10), always shown to the host first. Wheel and dice score effects
  become actions too.
- **Global action log:** one undo/redo history for everything the host does in play (§9.5).
- **Cover:** a panic key that puts a cover card over the audience view (§9.6).

### 5.2 Round modes

```ts
type RoundMode = 'board' | 'final' | 'rpg' | 'boardgame';   // boardgame: §7.13

interface RoundBase {
  id: Id;
  name: string;               // e.g. "Jeopardy!", "The Swamp"
  mode: RoundMode;
  intro?: RoundIntro;          // title card (all modes); board-only steps live on the board round
  hostNotes?: string;
}
type Round = BoardRound | FinalRound | RpgRound;
```

Each mode is a module that registers the same set of parts. The rest of the app never branches on the mode itself.

```ts
interface ModeModule<R extends Round, S> {
  mode: RoundMode;
  label: string;                                   // "Jeopardy board", "Final Jeopardy", "RPG"
  newRound(game: Game): R;
  newState(game: Game, round: R, session: Session): S;   // runtime state, kept per round in the session
  // Editor
  Editor: Component<{ round: R }>;
  validate(game: Game, round: R): Problem[];
  slides(round: R): Slide[];                       // for media usage, "Use this style elsewhere", search
  mediaRefs(round: R): Id[];                       // media not inside slides (tile images, avatars, map icons…)
  // Play
  AudienceView: Component<{ game; session; round: R; state: S; live; role }>;
  HostPanel: Component<{ game; session; round: R; state: S }>;
  HostInfo?: Component;                           // host-only preview in dual mode (e.g. the answer)
  onKey?(e: KeyboardEvent, ctx): boolean;          // mode keys; true = handled
  stageAct?(action: StageAction, ctx): void;       // clicks on the stage
  scoreReason?(ctx): string;                       // "Memes $400", "Shop: Flamingo"
  onEnter?(ctx): void; onLeave?(ctx): void;        // round intro, music, etc.
  rebase?(state: S, round: R): S;                  // re-point saved state after the game was edited
}
```

`AudienceView.svelte` keeps the shared layers: tool overlays, timer, score pops, sound cue, confetti, the cover, and
the pop-up slide. Underneath them it renders the current round's mode view. `HostPanel.svelte` works the same way:
the shared rows (players, award, undo, tools, media, nav) wrap the current mode's panel.

### 5.3 Session

```ts
interface Session {
  gameId: Id;
  players: Player[]; removedPlayers?: ...;         // unchanged
  scoreLog: ScoreEvent[]; redoStack: Id[];         // unchanged (score only)
  actionLog?: ActionEvent[]; actionRedo?: Id[];    // everything else the host does (§9.5)
  rollLog?: RollEvent[]; removedSegments?: ...;    // unchanged
  currentRound: number;                            // index into game.rounds
  phase: 'round' | 'end';                          // mode sub-states move into modeState
  introducedRounds?: number[];
  rounds: Record<Id, unknown>;                     // modeState per round id (board: used tiles, open clue, DD…)
  worlds?: Record<Id, WorldState>;                 // RPG state per world, shared by every round that uses it
  stats?: Record<Id /*player*/, Record<Id /*field*/, StatValue>>;
  inventories?: Record<Id /*player*/, InventoryEntry[]>;
  currentPickerId?: Id;
  tiebreaker?: { revealed: boolean } | null;       // end-screen tiebreaker (§6.3)
  coWinners?: boolean;
}
```

- A **ScoreEvent** gains an optional `source: {round: Id; ref?: string}` in place of `clueId`. The old `clueId`
  still loads.
- **Stats and inventories live at game level,** not per round. A Jeopardy round in the middle of an adventure
  doesn't reset anyone's HP.

### 5.4 Round order and navigation

- The editor's nav lists rounds in play order with a mode icon: 🟦 board, ⭐ final, 🗺 RPG. Rounds can be
  reordered, duplicated, and have their mode chosen when created (§8.1).
- In play, **RoundNav** moves to the previous or next round. The **round picker** lets the host jump to any round,
  because the rule of funny allows playing out of order. Leaving a round keeps its state, so coming back resumes it.
- The end screen comes after the last round. It still offers "Back to <last round>".

## 6. Round modes: Jeopardy board and Final Jeopardy

### 6.1 Board ("Jeopardy board")

- This is today's `Round`, unchanged: categories, clues, values, Daily Doubles, decor, round intro steps, wheel/dice
  tiles, tile faces.
- Its runtime state moves from `Session` into `session.rounds[roundId]`: `used`, `lastClosed`, `currentClue`,
  `revealed`, `dd`, the intro stage, and the open clue.
- A `ClueRef` holds the clue id plus indices, so edits between sessions still resolve.
- Everything in `SPEC.md` §6.1–6.3 and §6.5 still applies.

### 6.2 Final ("Final Jeopardy")

- Today's `game.final` becomes a round with `mode: 'final'`: name, category, question and answer slides, think time,
  and "players with $0 or less can play".
- It can go **anywhere in the round list and appear more than once**, e.g. a mid-game wager round.
- Its state (wagers, order, shown, results, step) moves into `session.rounds[roundId]`.
- Its host controls, keys (N, C/X) and audience screens are today's, unchanged.
- The "Final is off" toggle disappears. To skip it, the round is removed or not added.

### 6.3 Tiebreaker

The tiebreaker stays an **end-screen tool**: an optional question and answer at game level (`game.tiebreaker`).
Ties only matter at the end.

## 7. Round mode: RPG (the map game)

### 7.1 Concepts

| Term | Meaning |
|---|---|
| **World** | A self-contained adventure: maps, screens, items, shops, stat fields. Stored at game level (`game.worlds`), so several rounds can share one world. Example: an RPG round, then a Jeopardy break, then back to the adventure, with everything where it was left. |
| **RPG round** | A round in `rpg` mode. It points at a world and says where the party starts (or continues from). |
| **Map** | A grid of screens. Each world has one **primary map** and any number of **other maps** (dungeons, shops, interiors, the Shadow Realm). They are usually unconnected, and doorways link them. A map can be one screen (a shop interior). |
| **Screen** | One cell of a map: a slide (background plus elements) with classes on its objects. It is what the audience sees when the party is there. |
| **Object** | A slide element with an optional **class** (doorway, item, NPC…) and class data. Plain elements are scenery. |
| **Avatar** | A player's token on a screen: image or fallback token, nameplate, equipment. |
| **Party** | Players who move together. By default that is everyone. The host can split and regroup at any time. |
| **Focus** | The screen the audience is shown. |

### 7.2 Worlds, maps and screens

```ts
interface World {
  id: Id; name: string;
  maps: WorldMap[];                  // maps[0] is the primary map
  items: ItemDef[];                  // the world's item catalog (§7.8)
  shops: Shop[];                     // §7.9
  stockPools: StockPool[];           // shared stock between shops (Shadow Realm case)
  statFields?: StatField[];          // overrides/extends the game's fields (§7.7)
  settings: WorldSettings;
}
interface WorldMap {
  id: Id; name: string;              // "Overworld", "Goblin Cave", "Shadow Realm"
  kind: 'primary' | 'area';
  cols: number; rows: number;        // grid size; screens can leave cells empty
  screens: Screen[];
  audience: {
    visibility: 'full' | 'discovered' | 'hidden';   // per-map choice (decision in §2)
    showExits: 'none' | 'arrows' | 'arrows+unknown'; // open directions without revealing destinations
    style: 'thumbnails' | 'tiles';   // screen snapshots, or colored tiles with names and icons
  };
  transition: 'slide' | 'fade' | 'cut';   // default screen-to-screen transition on this map
  music?: Id;                        // optional looping background sound; cross-fades when it changes
}
interface Screen {
  id: Id; name: string;              // shown to the host; to the audience only if chosen
  col: number; row: number;
  slide: Slide;                      // background + elements (objects)
  exits?: Partial<Record<Dir8, ExitRule>>; // overrides of the grid-derived neighbors
  hostNotes?: string;
  tint?: string; icon?: Id;          // how the screen looks on a 'tiles' map
  music?: Id;                        // overrides the map's music
}
type Dir8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type ExitRule =
  | { kind: 'open' }                                  // the grid neighbor (the default when one exists)
  | { kind: 'blocked'; note?: string }                // e.g. a wall; the button shows as blocked
  | { kind: 'warp'; to: ScreenRef; arrive?: Dir8 | 'spawn'; oneWay?: boolean; transition?: Transition };
interface ScreenRef { map: Id; screen: Id }
```

- **Neighbors come from the grid.** The screen at (col+1, row) is east, (col+1, row+1) is south-east, and so on.
  Only the exceptions are stored: a blocked side, or a side that leads somewhere else (a Side Warp).
- **Diagonals:** each map chooses whether diagonal moves are available: always, only where set, or never. The default
  is "only where both sides aren't blocked".
- **Wrapping edges** (for a Lost Woods effect) are a per-map option.

### 7.3 Object classes

Every slide element gains two optional fields:

```ts
interface ElementBase {
  // ...existing fields...
  name?: string;              // "Old Man", "Locked door" (also improves the Layers panel)
  role?: ObjectRole;          // class + class data; absent = scenery
  hidden?: boolean;           // hidden from the audience until revealed (host sees it ghosted)
  hostNotes?: string;         // never shown on air
}
type ObjectRole =
  | { class: 'doorway'; to: ScreenRef; arrive?: 'spawn' | Id /*object id*/ | Dir8; oneWay?: boolean;
      locked?: { note?: string; needsItem?: Id }; transition?: Transition; actions?: Action[] }
  | { class: 'item'; item: Id; qty: number; actions?: Action[] }            // pick-up
  | { class: 'currency'; field: Id; amount: number; actions?: Action[] }    // e.g. a pile of 10 gold
  | { class: 'npc'; stats?: StatValues; dialogue?: Id /*popup slide*/; shop?: Id; actions?: Action[] }
  | { class: 'shop'; shop: Id; actions?: Action[] }                         // counter, sign or shopkeeper
  | { class: 'hazard'; actions: Action[] }                                  // trap, pit, Bad Wheel space
  | { class: 'interactable'; label?: string; actions: Action[] }            // anything the host wants a button on
  | { class: 'spawn'; label?: string }                                      // where arriving players stand (invisible in play)
  | { class: 'blocker' };                                                   // marks areas avatars shouldn't be dropped on
```

- **The class decides behavior, not layering.** The host still stacks objects freely. Each class has a default
  stacking band: scenery lowest, then objects, then avatars, then pop-ups.
- **What a class does in play:** clicking an object in the host view opens its **action card**: a short list of
  buttons made from its class and its `actions`. Examples:
  - a doorway: "Go through (party)", "Go through (selected)", "Peek";
  - an item: "Give to…";
  - an NPC: "Talk", "Shop", "Edit stats".
  - Nothing runs until a button is pressed (§7.10).
- **Hotspots:** a new invisible element kind, `region`, is a rectangle or polygon with a class. It turns part of a
  background picture into a doorway or shop without drawing anything. The host sees it outlined. The audience never
  sees it.
- **Drawn objects:** a new `path` element kind (freehand pen and polygon, with fill and stroke) is added to the slide
  editor's toolbar. It reuses the image editor's stroke code. The host can draw a quick monster, arrow or wall and
  give it a class.
- **Runtime changes never touch the authored slide.** "Taken", "opened", "hidden", "moved" and "text changed" are
  stored in the world state as per-object overrides (§7.5). Reset screen, or starting a new game, puts everything
  back.

### 7.4 Round setup

```ts
interface RpgRound extends RoundBase {
  mode: 'rpg';
  world: Id;
  start: 'continue' | { at: ScreenRef; spawn?: Id };   // continue = wherever players were in this world
  showMapOnStart?: boolean;
  intro?: RoundIntro;                                  // title card, then the first screen
}
```

### 7.5 World state in play

```ts
interface WorldState {
  positions: Record<Id /*player*/, { at: ScreenRef; x: number; y: number; hidden?: boolean }>;
  parties: { id: Id; name: string; members: Id[]; color?: string }[];   // default: one party with everyone
  focus: { kind: 'screen'; at: ScreenRef } | { kind: 'party'; party: Id } | { kind: 'split'; views: ScreenRef[] };
  preview?: ScreenRef;                                // host-only preview (§9.2)
  knowledge: Record<Id /*screen*/, 'unknown' | 'discovered' | 'visited'>;
  objects: Record<Id /*element*/, ObjectOverride>;     // taken, hidden/revealed, moved, relabeled, stats, locked…
  added: Record<Id /*screen*/, SlideElement[]>;       // objects the host dropped in live (improvised)
  stock: Record<Id /*shop or pool*/, Record<Id /*item*/, number | 'infinite'>>;
  mapShown: boolean;                                  // map overlay on the audience view
}
```

**Moving:**

- **8-way pad:** the host panel has an arrow pad (↖ ↑ ↗ ← → ↙ ↓ ↘). Each button reads its exit:
  - an **open** exit lights up and shows the destination name to the host;
  - a **blocked** exit is dimmed, with its note on hover;
  - a **warp** shows its target.
- **Keyboard:** numpad 1–9, or Q W E / A D / Z X C. The keys work while the pad has focus, or at any time with a
  modifier (§9.4).
- **Map click:** click any screen on the host's map to move the selected party there. **Teleport** is allowed
  anywhere, including unconnected maps and screens with no path to them.
- **Doorway:** "Go through" on a doorway's action card.
- **Who moves:** the selected party (the default is everyone). Select avatars (click or Shift+click on the stage, or
  the party chips) and press "Split" to form a new party. **Regroup** (key G) brings everyone to the focused screen.

**Arriving:**

- **Side move:** avatars enter from the opposite edge, keeping their relative spacing.
- **Doorway:** avatars arrive at the named spawn or object, else at the screen's first spawn point, else in the
  middle.
- Avatars are fanned out so they don't overlap, and they avoid `blocker` regions.
- The screen becomes **visited**. Its open neighbors become **discovered** if the map is set to reveal adjacent
  screens.

**Placing:** in the host view, avatars can be dragged anywhere on the screen. The audience follows live. There is no
grid snapping: the rule of funny.

**Transitions:**

- **Slide:** a flip-screen scroll in the direction of travel.
- **Fade**, or a straight **cut**.
- Pop-ups, wheels and the timer stay on top during a transition.

**Focus:**

- The audience normally follows the **active party**.
- With a split party, the host switches focus with the party chips, or chooses **split view**, which shows 2–4
  screens side by side, each labeled with its party.

### 7.6 Avatars

```ts
interface PlayerTemplate {                 // existing: id, name, color
  avatar?: { image?: Id; scale?: number; flip?: boolean };
}
interface Avatar {                         // how the token is drawn in play
  image: Id | null;                        // null = fallback token: a colored circle with initials
  nameplate: 'always' | 'hover-host' | 'never';
  equipment: EquipSlotView[];              // items marked wearable show on the avatar (§7.8)
}
```

- Avatars are set in **Setup & Players**: an image or GIF per player, with the player color as the nameplate and
  ring.
- **Fallback token:** a colored circle with the player's initials in a readable text color.
- **Equipment:** a wearable item has a slot (head, hand, body, back, or "badge") and an optional image. It shows on
  the avatar at that slot's anchor. If the item has no image, it shows as a small badge next to the avatar.
- **The host can:**
  - resize or flip an avatar;
  - set its status: normal, "down" (grey, rotated) or hidden;
  - give it a temporary label ("🐸 cursed").
- **Also on avatars:**
  - Score pops and stat changes float up from the avatar.
  - The **player wheel** and the **roll-off** also work in RPG rounds.

### 7.7 Character sheets (stats)

```ts
interface StatField {
  id: Id; name: string;                    // "HP", "Gold", "Vibes", "Class"
  type: 'number' | 'text' | 'checkbox' | 'tags';
  // numbers:
  min?: number; max?: number | Id /*max from another field*/; start?: number;
  display?: 'counter' | 'bar' | 'hearts' | 'pips';
  currency?: { symbol: string; icon?: Id };  // a currency field: used by shops and currency objects
  // all:
  audience: 'hud' | 'sheet' | 'hidden';    // HUD strip, only on the full sheet, or host-only
  color?: string;
}
```

- **Fields are defined per game** in a Stats tab. Worlds can add their own fields. There are no built-in stats:
  "Gold" and "HP" are presets offered when creating the first fields.
- **Starting values** are set per field, and can be set per player, like "all mammals start with 4 gold".
- **In play:**
  - Every stat is editable inline on the player's card, with −/+ buttons (Shift for ×10) or typing.
  - Bars and hearts animate.
  - Changes go in the action log with a reason and can be undone.
- **Score vs currency:** the score stays the score. **Convert** (on the player card or the Stats menu) moves an amount
  between the score and a currency field at a rate chosen at conversion time. Example: "Jeopardy winnings → gold at
  100:1". It is logged as one undoable step.
- **Tags** hold status effects ("poisoned", "is a frog"). They show as chips on the HUD and the avatar.

### 7.8 Items and inventory

```ts
interface ItemDef {
  id: Id; name: string; icon?: Id;         // picture shown in inventory, on the ground and in shops
  description?: string;                    // shown on the item's card
  price?: number; currency?: Id;           // default price
  stackable: boolean;                      // Bitsy-style counter, or individual entries
  wearable?: { slot: 'head' | 'hand' | 'body' | 'back' | 'badge'; image?: Id };
  tags?: string[];                         // "weapon", "key", "quest"
  hostNotes?: string;                      // what it *really* does
  onUse?: Action[];                        // optional: shown as a "Use" button on the host's inventory row
}
interface InventoryEntry { id: Id; item: Id | null; name?: string; qty: number; equipped?: boolean; notes?: string }
```

- **Item catalog:** a list per world, with import and export as CSV (name, price, description, tags) for bulk prep.
- **Improvised items:** an entry can have `item: null` and just a name, created mid-show in one step ("a very
  suspicious rock"). "Save to catalog" keeps it for later.
- **Inventory actions** (on a player card, by dragging items between cards, or on an item object's card):
  - give, take, transfer, drop onto the current screen (it becomes an item object there), pick up;
  - use (runs `onUse` after confirmation), equip/unequip;
  - edit quantity or notes, rename.
- **The audience** sees inventories on the **player sheet overlay**, which the host pops up for one player at a time
  (key I, or the card's 📺 button): a big card with the avatar, all non-hidden stats and the inventory. Items can also
  show as icons on the HUD. Individual items can be marked "secret" so only the host sees them.

### 7.9 Shops

```ts
interface Shop {
  id: Id; name: string;
  currency: Id;                            // which currency field it charges
  stock: { item: Id; price?: number; qty: number | 'infinite' }[];
  pool?: Id;                               // shares quantities with other shops in the pool
  buysBack?: { rate: number };             // optional: players can sell items for rate × price
  display?: Id;                            // optional custom slide as the shop's backdrop
}
```

- **Open shop:** available from a shop or NPC object, or from the Shop menu at any time. The audience sees a shop
  overlay: item icons, names, prices and "sold out", in the theme's style. The host sees the same list with buy
  buttons.
- **Buying:**
  1. The host picks the player (or the player wheel picks one) and the item.
  2. The action card previews it: "Failboat: 15g → 3g, gets Flamingo".
  3. **Confirm** deducts the currency, adds the item and lowers the stock.
  4. If they can't afford it, the host sees "short by 9g" with **Buy anyway (go negative)**, **Free** and **Change
     price** buttons.
- **Haggling:** the price can be edited on the card before confirming. A one-off price doesn't change the shop.
- **Shared stock:** shops in the same pool (e.g. the Village shop and the Shadow Realm shop) draw on the same
  quantities.
- **Live edits:** restock, add an item, and change prices, all from the shop overlay and all undoable.

### 7.10 Actions (triggers)

The action runner is part of the toolset (§5.1), used by object classes, item `onUse`, and pop-ups.

```ts
type Action =
  | { do: 'move'; to: ScreenRef; who: 'party' | 'selected' | 'picker'; arrive?: ... }
  | { do: 'wheel'; wheel: Id | typeof PLAYER_WHEEL; edit?: boolean }
  | { do: 'dice'; dice: Id | string /*"2d6"*/ }
  | { do: 'popup'; slide: Slide | Id; closeAfter?: number }          // sign, dialogue, jump-scare
  | { do: 'question'; question: Slide; answer: Slide; value?: number; timer?: number }  // a Jeopardy-style clue
  | { do: 'sound' | 'video'; media: Id }
  | { do: 'stat'; field: Id; op: 'add' | 'set'; amount: number; who: Who }
  | { do: 'item'; item: Id; qty: number; op: 'give' | 'take'; who: Who }
  | { do: 'score'; amount: number; who: Who }
  | { do: 'reveal' | 'hide'; target: { object: Id } | { screen: ScreenRef } | { map: Id } }
  | { do: 'timer'; seconds: number }
  | { do: 'shop'; shop: Id }
  | { do: 'note'; text: string };                                   // host-only reminder, e.g. "roll for trap"
type Who = 'party' | 'selected' | 'picker' | 'ask' | Id;           // 'ask' = the host picks when it runs
```

- **The host always confirms.** An object's card lists its actions as buttons: each one runs on its own, or "Run all"
  runs them in order. The host can edit a step's numbers right there before it runs ("take 3 HP" → 5). An action
  never fires by itself because an avatar was dragged somewhere. This is a deliberate difference from Foundry's
  auto-triggers.
- **A question action** shows the clue slide full-screen with the usual reveal (R), timer and award/deduct keys.
  This is how a door guardian asks a trivia question.
- **Wheel outcomes can hold actions** (not just `scoreAction`). For example, a Bad Wheel slice "Go to the Shadow
  Realm" carries a move action, shown as a button when it lands.
- **Every run is logged** in the action log and can be undone (§9.5).

### 7.11 Monsters and NPC stats

- An NPC object can hold its own stat values (e.g. Power 3, HP 10). They show as a small bar or number over it.
  Whether the audience sees them is set per field.
- Stats can change live ("the slime wins, +2 power") and are kept per object in the world state.
- **There is no combat engine.** Fights are roleplay, plus wheels or dice, plus the host's judgment. An optional
  **Compare** helper shows "Player power 7 vs Goblin 1" using fields the host picks, and nothing more.

### 7.12 Map overlay

- **Audience map:** the host shows or hides it with the Map button or key M. It appears as a corner minimap or full
  screen, set per map.
- **What it shows:**
  - Each map's screens as thumbnails or tiles, according to its visibility setting:
    - **full:** every screen;
    - **discovered:** visited and discovered screens only (discovered ones dimmed);
    - **hidden:** the map is never shown.
  - Where players are: small avatar dots in their colors.
  - **Open exits without destinations:** arrows at the edges of known screens pointing toward unknown ones, or a "?"
    cell. The next screen can be shown as a blank "?" tile, which is optional.
- **Other maps** appear as extra panels only after the host reveals them.
- **Host map:** always shows everything, with:
  - discovered and visited states;
  - player dots;
  - screen names and host notes;
  - doorway links drawn as lines between screens and maps.
- **Map editing in play:** the host can reveal or hide screens one at a time (click → Reveal/Hide), reveal the whole
  map (the Zelda "Map item"), or reset knowledge.

### 7.13 Board game mode

This is Magic The Noah's other big format (built in milestone M9; see the README for how it plays). It reuses the
RPG toolset: avatars, stats, items, shops, actions, wheels and the host-confirmed action card.

- **Board:** a slide with **spaces** placed on it. Each space is a classed object with an index, and the spaces are
  linked in a loop or a path. Paths can fork, and forks ask the host which way to go.
- **Turns:** a turn order (roll-off or set by hand). On a turn, the active player spins a movement wheel or rolls
  dice, and their avatar steps along the spaces. The move animates, and the host confirms or edits the count first.
- **Spaces:** each carries actions. Examples: Start gives +2 gold when passed, a Goblin space costs 1 gold or a Bad
  Wheel spin, and a Shop space opens a shop. "When passed" and "when landed on" are separate action lists.
- **Off-board zones:** a Shadow Realm-style area where players are sent and stuck until they escape. It can be another
  board, or an RPG screen.
- **Win conditions:** secret or public, set by the host. They are notes plus an optional "check" the host runs by hand.

## 8. Editor changes

### 8.1 Nav and rounds

- The **Rounds** list shows the mode icon next to each round's name.
- **＋ Add round** asks for the mode: 🟦 Jeopardy board, ⭐ Final Jeopardy, 🗺 RPG. Rounds can be dragged to
  reorder, duplicated, or have their mode changed (only while empty).
- New nav entries appear only when they're used:
  - **🌍 Worlds:** shows once there is an RPG round or a world.
  - **📊 Stats & Items:** the stat fields; the item catalog also lives per world.
- **Setup & Players** gains avatars (§7.6) and starting stats.
- The checklist gains RPG checks:
  - a doorway with no target;
  - a screen unreachable from the start, shown as info only, because it may be intentional (e.g. the Shadow Realm);
  - shops with no stock;
  - items used but not in the catalog;
  - missing avatar images;
  - an RPG round with no world or start.

### 8.2 World editor

**Map view** (the default for a world) works like LDtk's GridVania world view:

- The world's maps are tabs: the primary map first, then the other maps, then **＋ Map**.
- Each map shows its grid with a thumbnail of every screen and "＋" in empty cells. Click "＋" to add a screen,
  double-click a screen to edit it, drag to move it, and use the right-click menu to duplicate, delete or copy a
  screen to another map.
- **Exit editing** happens right on the grid: each edge between screens has a small toggle for open or blocked, and
  diagonal corners have their own toggles. Shift-clicking an edge sets a warp to any screen (pick it on any map).
- **Doorway links** are drawn as arrows. Links to other maps end in a labeled stub; clicking the stub jumps to that
  map.
- Map settings: grid size, audience visibility, "show exits", style, transition, music, diagonals and wrapping.

**Screen editor:** the existing `SlideEditor`, opened on the screen's slide, with these additions:

- **A Class section in the Inspector:** choose a class, fill in its data (pick doorway targets on a mini map, pick
  items and shops), and add actions with a small action-list editor.
- **Toolbar:** ⬚ Region (hotspot), ✏ Draw (path), 🚩 Spawn point, and an Items palette to drag catalog items onto
  the screen as item objects.
- **Neighbor edges:** thumbnails of the neighboring screens are shown faintly around the canvas edges, so paths and
  scenery can line up across the screen boundary. This is the Zelda flip-screen feel.
- **Preview avatars:** the players' avatars can be shown on the canvas to check sizes.
- Host notes for the screen.
- **Layers panel:** class icons next to layer names, and a filter by class.

**Other editors:**

- **Items:** a table (icon, name, price, stackable, wearable slot, tags) with CSV import/export.
- **Shops:** stock tables, pools, and a preview of the shop overlay.
- **World test:** "▶ Play from here" on any screen starts a quick test game at that screen.

## 9. Host controls in play

### 9.1 RPG host panel

It is laid out around the stage the host already has:

- **Stage (host copy):**
  - Click an object to open its action card.
  - Drag avatars to move them.
  - Right-click the empty stage for "Drop item here", "Add object…", "Paste image", "Pop-up text".
  - Hidden objects appear ghosted.
- **Movement:** the 8-way pad, Regroup, Split, the party chips (click to focus, drag players between them), and a
  focus switcher.
- **Map panel:** the host map (§7.12), with click to move the selected party, click to preview (§9.2), and
  Reveal/Hide.
- **Player cards:** a compact row with avatar, score, pinned stats and inventory count. Clicking a card expands the
  full sheet: all stats, inventory, give/take, convert, and notes.
- **Shared tools:** wheels, dice, roll-off, scoreboard, timer, media controls, sound, log, and a pop-up slide picker.

### 9.2 Preview vs on air

Following OBS Studio Mode and Foundry's GM-only scenes:

- The host can **preview** any screen from the map, and even edit its objects. The audience stays where it is.
- **Take it live** moves the focus, or moves the party there.
- The host panel always marks which screen is on air with a red "ON AIR" label, so nothing is changed on air by
  accident.

### 9.3 Improvising

Everything the host can do without prep:

- Drop an image or file onto the stage to add it as an object. It starts **hidden** until the host reveals it
  (a setting can change this).
- Type text onto the stage.
- Add a new screen next to the current one ("＋ screen east"). The editor opens in a side panel, and the game keeps
  running.
- Rename anything, edit any number, and change any price.
- Teleport anyone anywhere.
- Create an improvised item or NPC.
- **Duplicate a screen as a variant** (e.g. "the village, on fire").
- Everything improvised belongs to the game in progress. **"Keep in game"** copies improvised objects or screens into
  the authored world, so they are saved for next time.

### 9.4 Keys (RPG rounds)

| Key | Action |
|---|---|
| Numpad 1–9 / Q W E A D Z X C (with the pad focused, or holding Alt) | Move the party in 8 directions |
| G | Regroup everyone to the focused screen |
| M | Show/hide the audience map |
| Tab / Shift+Tab | Next/previous party (focus) |
| I | Open the selected player's sheet |
| O | Open the shop for the current screen (roll-off moves to Shift+O in RPG rounds) |
| P then 1–9 | Make player N the picker (as today) |
| 1–9 | Select players (as today) |
| Enter / Shift+Enter | Award/deduct score (as today) |
| W / D / T / S / L / H / F / A / Space / Ctrl+Z | As today (wheel, dice, timer, scoreboard, log, hide controls, full screen, audience, media, undo) |
| B (hold) | Cover: blackout or cover card (§9.6) |
| ? | Keyboard shortcuts |

Every action also has a button, so a Stream Deck or other hotkey device can send the same keys.

### 9.5 One undo for everything

- The score log (today) stays as is.
- A new **action log** records everything else: moves, reveals, stat changes, inventory changes, purchases, shop
  edits, object overrides and improvised additions.
- **Ctrl+Z undoes the latest step of either kind,** in time order. The log lists both kinds, with per-step undo as in
  today's score log.
- Each log entry holds the reverse change, not a copy of the world, so undo stays fast in long shows.

### 9.6 Spoiler safety

- The audience view renders only what is on air, from the same state the host has, filtered through one function:
  `audienceProjection(state)`.
- **Hidden objects, regions, spawn points, host notes, undiscovered screens, secret items and hidden stats are never
  drawn** in the audience window or the host's mirror of it. Tests check each of these (§13).
- **Cover:** hold B, or toggle it, to put the theme's cover card over the audience view instantly, for fixing
  something mid-show.
- Map thumbnails of undiscovered screens are never made for the audience, so no snapshot can leak them.

## 10. What the audience sees

In an RPG round, from back to front:

1. **The focused screen:** the slide, with no hidden objects, regions or spawn points. In split view, 2–4 screens,
   each with its party's label.
2. **Avatars** with nameplates, equipment, status and floating pops.
3. **The HUD:** a strip at the bottom or top, following the theme's score-bar setting. It shows each player's avatar,
   name, score (if the game uses score) and their "HUD" stats as counters, bars or hearts. Status tags appear as
   chips. It scales down for many players. With more than 12 players the HUD shows only the focused party, and the
   scoreboard overlay shows everyone.
4. **Map overlay** when shown (§7.12).
5. **Shop overlay, player sheet overlay, pop-up slides and question slides.**
6. **Shared overlays:** wheels, dice, roll-off, scoreboard, timer, score pops and confetti.
7. **The cover card**, which covers everything.

## 11. Files, saving and migration

### 11.1 Game format version 2

- `Game.version` becomes `2`.
- `parseGame` accepts 1 and 2. `migrateGame` gets real versioned steps: `migrate[1] → 2`.
- **v1 → v2 steps:**
  1. Every round gets `mode: 'board'`.
  2. If `final.enabled`, a `mode: 'final'` round is appended with the same name, category, slides and time. If it
     isn't enabled, the final data is dropped (decided in §2).
  3. `tiebreaker` stays where it is.
  4. `settings.finalTimerSeconds` and `settings.finalAllowNonPositive` move onto the final round.
- **Saved games in progress** (`playSession`) are migrated too:
  - `phase: 'final'` becomes `currentRound` pointing at the new final round, with its state moved into
    `session.rounds`;
  - board state moves into `session.rounds[roundId]`.
  - A session that can't be migrated is kept as a read-only "results" record rather than lost.
- **New programs, old files:** v2 files opened in an older build get today's clear "not a Jeopardy Builder game"
  message. The message is updated to say "made with a newer version".

### 11.2 Packs and exports

- Packs keep their layout (`game.json` plus `media/`) with the new extension (`.brainrot`). **Open…** accepts
  `.brainrot`, `.jbr`, `.zip` and `.json`.
- The desktop app registers no file associations. It is a portable exe with no installer, so there is nothing to register them.
- **Exported HTML** works the same. Player-only mode supports every mode, including RPG rounds (the host still needs
  the host view, which the export includes).
- **Media in RPG rounds** (screens, avatars, item icons, map icons, shop backdrops) is counted by each mode's
  `mediaRefs` and `slides`, so it is packed, pruned and reported missing like everything else.

### 11.3 Size and performance

- Worlds can hold hundreds of screens, and Magic The Noah-style maps are small.
- Map thumbnails are generated lazily from the slide and cached by content hash. In the editor they live in memory
  and are rebuilt on change.
- The audience window gets the whole game once. After that, only session changes are sent, as today.

## 12. Milestones

Each milestone is shippable on its own and keeps every existing test green.

| # | Milestone | Contents |
|---|---|---|
| M1 | **Rename** | Names (§4.1); desktop data-folder move (§4.3); new pack extension with `.jbr` still opened; clipboard, lock and channel names read old and new; About, README, CI, release names. The repo is renamed by the owner. |
| M2 | **Round modes (no behavior change)** | The `ModeModule` interface; board rounds move behind it; session state per round; round picker; v2 format and migration with tests. |
| M3 | **Final as a round** | The final becomes a `final`-mode round that can be placed anywhere; FinalEditor becomes a round editor; the old "Final" nav item goes; saves and sessions are migrated. |
| M4 | **Toolset additions** | Stat fields (Stats tab, player cards, HUD); items and inventory; pop-up slide; action runner with confirmation; the global action log with undo; cover card; element names, classes, `hidden` and host notes. |
| M5 | **RPG: build** | Worlds, maps, screens; world map editor with exits and warps; screen editor with the Class section, Region, Draw (path) and Spawn tools; item catalog with CSV; avatars in Setup. |
| M6 | **RPG: play** | Positions, parties, 8-way movement, doorways, transitions, focus and split view, preview/on air, drag avatars, the object action card, knowledge states, map overlay (full/discovered/hidden, exit arrows), keys. |
| M7 | **Shops and economy** | Shops, pools, shop overlay, buy/sell/haggle, score↔currency convert, currency objects, equipment on avatars. |
| M8 | **Improvising and polish** | Drop-to-add objects, add screen live, "Keep in game", screen variants, NPC stats and Compare, wheel outcomes with actions, map and screen music with cross-fades, performance with many screens and players. |
| M9 | **Board game mode** | The spin-to-move mode in §7.13, reusing the RPG mode's avatars, stats, items, shops and actions. |

## 13. Testing

- **Unit tests (vitest):**
  - v1 → v2 migration of games and sessions, using real old files: today's test fixtures, plus a user game;
  - neighbor derivation for all 8 directions, blocked edges, warps, wrapping and diagonal rules;
  - knowledge updates;
  - arrival placement (edges, spawn points, blockers);
  - party split and regroup;
  - stat math (min, max, max-from-field, convert);
  - inventory (stack, split, transfer, drop and pick up);
  - shop purchases (stock, shared pools, afford, go negative, free, haggle);
  - the action runner, including undo of every action kind;
  - `audienceProjection` never leaks hidden things.
- **End-to-end tests (Playwright, as today):**
  - build a small world (3×2 primary map plus a one-screen shop map) and play it:
    - move with the pad and keys;
    - a doorway to the shop, buying an item;
    - split and regroup;
    - map overlay modes;
  - dual-window checks:
    - the audience window never shows hidden objects, regions, host notes, undiscovered screens or secret items;
    - preview never changes the audience;
  - a Jeopardy → RPG → Jeopardy → final game with state kept across rounds;
  - opening old `.jbr` packs and old exported HTML;
  - the desktop data-folder move, with a stand-in native side as today, plus Rust unit tests for the move itself.
- **Every existing test stays green** at every milestone. The renames update test strings in M1 only.

## 14. Open questions

All of draft 1's questions are answered and recorded in §2. New questions will be added here as work starts.

## 15. Sources

Magic The Noah (read via search snippets; page fetches were blocked):

- Fan wiki: [Noah](https://magic-the-noah.fandom.com/wiki/Noah) ·
  [List of gameshows](https://magic-the-noah.fandom.com/wiki/List_of_gameshows) ·
  [Shadow Realm](https://magic-the-noah.fandom.com/wiki/Shadow_Realm) ·
  [Dragon](https://magic-the-noah.fandom.com/wiki/Dragon) ·
  [Game Show Where I Didn't Tell Players How To Win](https://magic-the-noah.fandom.com/wiki/Game_Show_Where_I_Didn't_Tell_Players_How_To_Win) ·
  [Youtubers Play A Game They Made](https://magic-the-noah.fandom.com/wiki/Youtubers_Play_A_Game_They_Made) ·
  [I Made An Impossible Memory Game](https://magic-the-noah.fandom.com/wiki/I_Made_An_Impossible_Memory_Game)
- [Wheels and Items (fan blog)](https://joke-battles.fandom.com/wiki/User_blog:Diamond_Drone/Magic_The_Noah:_Wheels_and_Items)
- [YouTube Crossover wiki](https://youtube-crossover.fandom.com/wiki/Magic_The_Noah) ·
  [Party Crashers wiki](https://partycrashers.miraheze.org/wiki/Magic_The_Noah)
- TV Tropes: [web video](https://tvtropes.org/pmwiki/pmwiki.php/WebVideo/MagicTheNoah) ·
  [characters](https://tvtropes.org/pmwiki/pmwiki.php/Characters/MagicTheNoah)
- [32-player show post](https://x.com/MagicTheNoah/status/1840045110655955211) ·
  ["I Made An RPG, But Its Extremely Scuffed"](https://www.youtube.com/watch?v=JW0gSZP9Bc4) ·
  [fan tutorial](https://www.youtube.com/watch?v=_mksnuCSKa8) ·
  [fan Tabletop Simulator port "Scuffed RPG"](https://steamcommunity.com/sharedfiles/filedetails/?id=2998307778)

Tabletop and editor prior art:

- Owlbear Rodeo: [scenes](https://docs.owlbear.rodeo/docs/scenes/) ·
  [v1→v2 (image types)](https://docs.owlbear.rodeo/docs/migration/migrate-from-1-to-2/) ·
  [dynamic fog](https://blog.owlbear.rodeo/owlbear-rodeo-2-3-release-week-day-3/)
- Roll20: [page toolbar](https://help.roll20.net/hc/articles/360039675413) ·
  [party toolbox](https://blog.roll20.net/posts/introducing-page-folders-the-party-toolbox/) ·
  [layers](https://help.roll20.net/hc/articles/29257673557015) ·
  [dynamic lighting](https://pages.roll20.net/dynamic-lighting)
- Foundry VTT: [scenes](https://foundryvtt.com/article/scenes/) · [items](https://foundryvtt.com/article/items/) ·
  [Monk's Active Tiles](https://foundryvtt.com/packages/monks-active-tiles) ·
  [merchant presets](https://foundryvtt.com/packages/merchant-presets) ·
  [Material Deck](https://foundryvtt.com/packages/MaterialDeck)
- [Tabletop Simulator fog/hidden zones](https://tabletopsimulator.com/news/patch-notes/update-v11-0-0) ·
  [EN World on lightweight VTTs](https://www.enworld.org/threads/lightweight-simple-vtts.709359/)
- Zelda: [NES map data](https://inventwithpython.com/blog/8-bit-nes-legend-of-zelda-map-data.html) ·
  [Dungeon Map](https://zeldawiki.wiki/wiki/Dungeon_Map) · [Compass](https://zeldawiki.wiki/wiki/Compass) ·
  [ZQuest format](https://battleofthebits.com/lyceum/View/zquest%20(format))
- [RPG Maker Transfer Player](https://rpgmakerofficial.com/product/MZ_help-en/01_10_06.html) ·
  Bitsy [exits](https://make.bitsy.org/docs/tools/exitsandendings) and
  [inventory](https://make.bitsy.org/docs/tools/inventory/) ·
  [LDtk world layout](https://ldtk.io/docs/game-dev/json-overview/world-layout/) ·
  [Tiled worlds](https://doc.mapeditor.org/en/stable/manual/worlds/)
- [Google Sheets API limits](https://developers.google.com/sheets/api/limits) ·
  [OBS Studio Mode discussion](https://obsproject.com/forum/threads/in-studio-mode-preview-is-automatically-updating-program-without-letting-me-transition-within-a-scene.163388)
