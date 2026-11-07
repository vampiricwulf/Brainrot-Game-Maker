# Saving and updating

[← Back to the README](../README.md)

- **Save** (`Ctrl+S`) writes a `.brainrot` pack: the game plus all its media. It reads **💾 Save •** while the game has
  changes no file has yet (“not saved as a file” beside it where the header has room), and its tooltip says when it was
  last saved as a file. The editor keeps your game as you go anyway: in a browser the header says **✓ Kept in this
  browser** (💾 Save makes a file), in the desktop app **✓ Autosaved** (with the time of its last autosave file).
  - In the desktop app, saves go in a **BrainrotSaves** folder next to the `.exe` (in Documents\BrainrotSaves when the
    app may not write there, e.g. in Program Files). Closing the window while a save is being written asks whether to
    wait for it. While autosave can't write (a full disk), closing the window asks first too, as a browser tab does.
  - In a browser, they're downloads. A file over 100 MB asks where to save it instead (Chrome, Edge), so a big download
    can't fail unnoticed.
  - Changes made while a save is being written aren't in it, so they still count as unsaved.
- **Open…** (`Ctrl+O`) is one window: your **Recent games** and, in the desktop app, **Your saves (BrainrotSaves)**
  newest first with their date and size (📂 Saves folder shows the folder), then **Browse for a game file…** at its foot.
  `↑` / `↓` go from game to game and `Enter` opens one; `Delete` takes a recent game off the list (it asks first), and a
  right-click or `Shift+F10` gives a game's menu (▶ Open, 📁 Show in folder, 🗑 Delete from Recent games…). Browse also
  opens `.json` games, exported HTML files and the desktop app's `.bak` backups. Dropping a game file (`.brainrot`, `.zip`, `.json`, `.html`) on the
  editor opens it (a `.brainrot-theme` file opens on the 🎨 Theme page), and the desktop app opens a game, a `.bak` or
  a theme file you open it with ("Open with", or dropped on the `.exe`). One given during a game opens when you're
  back in the editor.
  - **Recent games** keeps the last 8 games New or Open… replaced (about 1 GB of files at most), with their undo
    history. When one has to go to make room, the app says which. Two versions of one game are both kept. A game with
    only a title isn't kept. **🗑 Delete** asks first: it deletes the kept copy and its files.
  - Opening an older copy of a game never changes the pictures and sounds of the game you have open: a file that
    differs is opened as a file of its own.
- New and Open… ask **Cancel / Open anyway / Save first** (or **Start new anyway**) when the game has unsaved changes
  (Open… checks the file is a game first); going on anyway keeps the old game in Open… → Recent games. The sample game
  as it came asks nothing (it's kept in Recent games too, and ↶ Reopen previous game brings it back); once changed, it asks. Only one browser tab edits at a time: another tab waits, paused, and offers **Edit here** once the
  editing tab closes.
- **⋯ → Save a copy as: ⬇ Export as a web page… (play-only)** (Export HTML) makes a **play-only web page**: a single file
  to play the game from, without this app, with everything inside. It shows the answers, so keep it to yourself. (**{ }
  Export JSON**, under it, is the game as text only, without its pictures, for editing by hand.) Every file in 🖼 Media goes in, used or not: a big file's size question says how much of it is
  files nothing in the game uses (**🗑 Delete unused** leaves them out). A game over about 375 MB is too big for one
  HTML file (browsers can't read it back): save a `.brainrot` instead.
- Add pictures, videos, sounds and fonts on the **🖼 Media** page: drop them there, or use **＋ Add files…**. A video or
  sound this browser can't play is offered a fix as soon as it's added (🔄 Convert: repackaged in seconds with nothing
  lost when only its file type is the problem, as with an MKV, or an .mts whose sound plays here; a camcorder's .mts
  usually loses its Dolby Digital sound), and Ctrl+Z puts the old file back. Each file's card has its buttons in the
  same places: its name with ⋯ (its menu) and 🗑 at the right end, then at its foot ✎ Edit… (a video or sound),
  **Replace everywhere…** (every place it's used follows, on stream too) and the one fix that applies (🔄 Convert…, ↻
  Make it a…, 🗜 Make smaller…). **used 3× ▾** lists where it's used (slides, the theme, 🔊 Sounds, tile and category
  pictures, wheels, RPG and board-game things), and a click on one goes there and flashes it. A right-click on a card
  (or Shift+F10, or a long press) gives its menu: ✎ Edit…, Replace everywhere…, the fix, ✎ Rename (F2), 🔍 Show where
  it's used ▸, 🌐 Check it still loads (a link's), 🗑 Delete file; with several selected, 🗜 Phone copies for N… and 🗑
  Delete N files.
- **⚙ Settings** (in the header's ⋯ menu, with Export as a web page, Export JSON, ⌨ Keyboard shortcuts, 📖 How to host
  (this guide) and ℹ About) has these options:
  - **Reduce motion on stream** (the editor, the host controls and your own copy of the stage beside the audience
    window also follow your computer's reduce-motion setting).
  - **Undo**: how many changes Ctrl+Z and the 🕘 History tab remember (300 by default).
  - **Autosave** every few minutes (desktop app). The default is every 5 minutes, keeping the last 3.
  - **Save replaces the game's last save** and keeps the two before it as `.bak` / `.bak2` (desktop app, on by
    default); off makes `Game (2)`, `Game (3)`… instead. Autosaves are kept per game.
  - **Buzzer server**: where phone buzzer rooms are made, with a **Test** button (the release builds come with one).
    An exported HTML file keeps the server it was exported with. Its **How to set up your own** link opens
    [Set up your own buzzer server](buzzer-server.md).
  - **Back to the defaults…**, at the window's foot, asks first ("Put every setting here back? The buzzer server goes
    back to the built-in one."), with Cancel first and **Put them back**: it can't be undone.


## Updating


**Updating.** When a newer version is out, the editor says so (it asks GitHub each time it starts;
⚙ Settings can turn that off, and ℹ About checks any time):

- The desktop app updates itself: **⬆ Update to …** downloads the new `.exe`, checks it's signed with the project's
  key, saves your game and restarts into it, in the same place. (A copy built without the key offers the download.)
  It asks first while a ✎ / 🗜 / 🔄 job runs, and once a game has started it doesn't restart by itself: **⟳ Restart
  into …** in the editor finishes it (if it failed, the editor says why).
- The HTML file offers the new file: save it in place of the old one (same name and folder) and open it. Your games
  carry over: they're kept in the browser, not in the file. Once **⬇ Download** has opened it in a new tab, the editor's
  notice and ℹ About say these steps on the page.

The notice's **✕** at its right end is Not now: it hides the notice until a newer version is out. Every notice under the
editor's header ends the same way, with a ✕ whose tooltip says what it does.

ℹ About shows which version you have.

Old Jeopardy Builder games (`.jbr` packs and exported HTML files) still open.
