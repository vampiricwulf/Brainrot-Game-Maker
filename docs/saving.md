# Saving and updating

[← Back to the README](../README.md)

## Saving

**💾 Save** (`Ctrl+S`) writes a `.brainrot` file: the game plus all its pictures, videos and sounds. A dot after the
name (**💾 Save •**) means the game has changes that aren't in a file yet.

The editor also keeps your game as you go:

- **In a browser**, the header says **✓ Kept in this browser**. Saving makes a download.
- **In the desktop app**, the header says **✓ Autosaved**. Saves go in a **BrainrotSaves** folder next to the `.exe`
  (or in `Documents\BrainrotSaves` if the app can't write there, for example in Program Files).

## Opening a game

**📂 Open…** (`Ctrl+O`) shows:

- **Recent games**: the last 8 games you replaced with New or Open…, with their undo history.
- **Your saves (BrainrotSaves)** in the desktop app, newest first. **📂 Saves folder** shows the folder.
- **Browse for a game file…** at the bottom. It opens `.brainrot`, `.json` and exported HTML files, and the desktop
  app's `.bak` backups.

Use `↑` / `↓` and `Enter` to pick a game. Right-click a game (or press `Shift+F10`) for its menu: **▶ Open**,
**📁 Show in folder** and **🗑 Delete from Recent games…**.

You can also drop a game file on the editor to open it. A `.brainrot-theme` file opens on the 🎨 Theme page.

If the game you have open has unsaved changes, New and Open… ask first: **Cancel**, **Open anyway** (or **Start new
anyway**) or **Save first**. Going on anyway keeps the old game in Recent games, so it isn't lost. A note under the header
offers **↶ Reopen previous game** until you change the new game.

Only one browser tab can edit at a time. Another tab waits and offers **Edit here** once the first one closes.

Old Jeopardy Builder games (`.jbr` packs and exported HTML files) still open.

## Sharing a play-only copy

**⋯ → ⬇ Export as a web page… (play-only)** makes a single HTML file that plays the game without this app, with
everything inside. It shows the answers, so keep it to yourself.

- Every file on the 🖼 Media page goes in, used or not. **🗑 Delete unused** leaves out the ones nothing uses.
- A game over about 375 MB is too big for one HTML file. Save a `.brainrot` instead.
- **{ } Export JSON** saves the game as text only, without its media, for editing by hand.

## Pictures, videos and sounds

Add files on the **🖼 Media** page: drop them there, or use **＋ Add files…**.

- If this browser can't play a video or sound, the app offers **🔄 Convert** right away. `Ctrl+Z` puts the old file
  back.
- **Replace everywhere…** on a file's card swaps it in every place it's used.
- **used 3× ▾** lists where a file is used. Click one to go there.
- Right-click a card (or long-press it) for more: rename, delete, make smaller and so on.

## Settings

**⋯ → ⚙ Settings** has these options:

| Setting | What it does |
|---|---|
| **Save replaces the game's last save** | Keeps the two saves before it as `.bak` / `.bak2`. Off makes `Game (2)`, `Game (3)`… instead. Desktop app; on by default. |
| **Autosave** | Saves every few minutes. Default: every 5 minutes, keeping the last 3. Desktop app. |
| **Undo** | How many changes `Ctrl+Z` and the 🕘 History tab remember (300 by default). |
| **Reduce motion on stream** | Viewers get no pop-ins, fly-ins or confetti: things just appear. |
| **Check for a newer version when the app starts** | See [Updating](#updating). |
| **Buzzer server** | Where phone buzzer rooms are made. Press **Test** to check it. See [Set up your own buzzer server](buzzer-server.md). |

**Back to the defaults…**, at the bottom, asks first, then puts every setting back, including the buzzer server. It
can't be undone.

## Updating

When a newer version is out, the editor says so. It checks GitHub each time it starts, and **ℹ About** can check any
time. ℹ About also shows which version you have.

- **Desktop app:** click **⬆ Update to …**. It downloads the new version, saves your game and restarts. If a game is
  being played, it waits: click **⟳ Restart into …** when you're ready.
- **HTML file:** download the new file and save it in place of the old one (same name and folder), then open it. Your
  games carry over, because they're kept in the browser, not in the file.

The notice's **✕** hides it until the next version comes out.
