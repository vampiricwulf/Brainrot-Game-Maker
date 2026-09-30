# Brainrot Games Maker

Build and host game shows for livestreams: Jeopardy boards, Final Jeopardy, RPG adventures and board games. The host
runs everything and players answer by voice on the stream.

The whole app is **one HTML file**. Open it in a browser with no install, server or internet. There's also a Windows
desktop app.

![A Jeopardy board in play](docs/screenshots/play-board.png)

## Download

Get it from the **[Latest release](../../releases/latest)**, which is rebuilt on every push to `main`:

- **`brainrot-game-maker.html`**: double-click it to open it in Chrome, Edge or Firefox.
- **`brainrot-game-maker-portable.exe`**: the Windows desktop app. No install needed.

Old Jeopardy Builder games (`.jbr` packs and exported HTML files) still open.

## Quick start

1. **＋ Add round** and pick a mode.
2. Fill it in. For example, click a tile to type the clue, then **Tab** to the answer and **Ctrl+Enter** for the next
   clue.
3. Add players under **⚙ Setup & Players**.
4. Press **▶ Play**.

![The editor](docs/screenshots/editor.png)

## Round modes

A game is a list of rounds, and each round has a mode. You can reorder, duplicate or delete any round.

| Mode | What it is |
|---|---|
| 🟦 **Jeopardy board** | 1–10 categories × 1–10 clues. Supports custom values, Daily Doubles, and images on categories and tiles. |
| ⭐ **Final Jeopardy** | Private wagers, think music, then a one-by-one reveal and a winner screen. |
| 🗺 **RPG** | Players explore a map of screens. It has stats, items, shops, NPCs and doorways. |
| 🎲 **Board game** | A path of spaces with forks and zones. Players move by dice, a wheel, or one space per turn. |

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

Other editor tabs:

- 🎨 **Theme**: presets, colors, fonts and background images.
- 🎡 **Wheels & Dice**: weighted wheels and custom dice. Each outcome can carry a score effect or action buttons.
- 📊 **Stats & Items**: HP bars, currencies, items, wearable gear and shops.

**Right-click** almost anything for a quick menu. This works on rounds, tiles, map screens, spaces, avatars and items.

**Undo** (`Ctrl+Z`, `Ctrl+Shift+Z` to redo) works in slides, board images and the board game editor. Removing categories or
rows that have clues in them asks first.

## Hosting

Press **▶ Play**, confirm the players, then pick one of two modes. Viewers see a "Starting soon…" card until you press
**Start game**.

- **Single window**: viewers see this window. Press `H` to hide the host controls.
- **📺 Separate audience window**: a clean window to capture in OBS or Discord. The host window keeps the answers,
  notes and controls.

Click a tile to open its clue, then reveal the answer with `R` or a click. Select players and **Award** or **Deduct**.
Every change can be undone with `Ctrl+Z`, including RPG and board game moves, items and live edits.

![A clue on screen](docs/screenshots/play-clue.png)

**Tools, any time:**

- 🎲 Dice
- 🎡 Wheels, including a built-in **Pick a player** wheel. Several wheels can spin at once.
- 🏁 Who goes first
- 📊 Scores

![Two wheels spinning together](docs/screenshots/wheels.png)

**RPG rounds** have these controls:

- A movement pad, and a minimap that expands to the full map so you can jump the party anywhere.
- Split and regroup parties.
- Player cards with stats and inventory.
- Shops.
- Live improvising: edit the screen, add text, or draw objects on a drawpad.

**Board game rounds** have these controls:

- Roll and move, picking the way at each fork.
- Send players to any space.
- Each space's actions.

<table>
<tr>
<td><img src="docs/screenshots/play-rpg.png" alt="An RPG round"></td>
<td><img src="docs/screenshots/play-boardgame.png" alt="A board game round"></td>
</tr>
</table>

**Ties** for first aren't called a win on stream until they're settled, in one of three ways:

- A roll-off, whose winner wins the game.
- A tiebreaker clue.
- Co-winners.

**Exit** keeps the game in progress, and **Resume game** picks it up later, even after a crash.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`9` | Select player N |
| `Enter` / `Shift+Enter` | Award / deduct |
| `R` | Reveal / hide the answer |
| `Esc` / `Shift+Esc` | Back to the board / cancel the clue (the tile stays playable) |
| `N` | Next step (intro, Final, next turn) |
| `C` / `X` | Final reveal: right / wrong |
| `T` | Start/pause the timer |
| `D` / `W` / `O` / `S` | Dice / wheel / roll-off / scoreboard |
| `Space` / `←` `→` / `M` | Play/pause, seek, mute media |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `J` (RPG) | Full map |
| `I` / `B` (RPG, board game) | Player sheet / "Be right back" cover |
| Numpad or `Alt`+arrows (RPG) | Move the party |

## Saving

- **Save** (`Ctrl+S`) writes a `.brainrot` pack: the game plus all its media.
  - In the desktop app, saves go in a **BrainrotSaves** folder next to the `.exe`.
  - In a browser, they're downloads.
- **Open…** lists your saves. Dropping a `.brainrot` file on the editor opens it too.
- **⬇ Export HTML** makes a single, play-only file to share.
- Add pictures, videos, sounds and fonts on the **🖼 Media** page: drop them there, or use **⬆ Add files…**.
- **⚙ Settings** (desktop app, next to ℹ About) has these options:
  - **Autosave** every few minutes. The default is every 5 minutes, keeping the last 3.
  - **Replace the last save** instead of making `Game (2)`, `Game (3)`…

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
npm run test:e2e       # end-to-end tests on the built file
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
| `tests/e2e/`, `scripts/` | Browser tests and the screenshot script |
