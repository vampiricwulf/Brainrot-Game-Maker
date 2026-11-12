# Making games

[← Back to the README](../README.md)

A game is a list of rounds, and each round has a mode. Every clue or screen is a **slide**: text, images, GIFs,
video, audio or YouTube, arranged freely.

## Round types

| Mode | What it is |
|---|---|
| **Jeopardy board** | 1–10 categories × 1–10 clues. Custom values, Daily Doubles, partner clues, private cards, and images on categories and tiles. |
| **Final Jeopardy** | Private wagers, think music, then a one-by-one reveal and a winner screen. With phone buzzers, players type their answers on their phones. |
| **RPG** | Players explore a map of screens, with stats, items, shops, characters and doorways. |
| **Board game** | A path of spaces with forks and zones. Players move by dice, a wheel, or one space per turn. |
| **Slides** | A few slides in a row: a welcome, the rules, a break. `N` goes to the next one. |

<table>
<tr>
<td><img src="screenshots/rpg-editor.png" alt="RPG world editor"></td>
<td><img src="screenshots/boardgame-editor.png" alt="Board game editor"></td>
</tr>
<tr>
<td align="center">RPG world editor</td>
<td align="center">Board game editor</td>
</tr>
</table>

## Working with rounds

- Drag round tabs to reorder them. Right-click a tab for its menu, including **Copy round**.
- `Ctrl+C` on a tab copies the round; `Ctrl+V` pastes after it.
- **📂 Import rounds…** brings rounds in from a `.brainrot` file or from a game exported as a web page. The worlds,
  wheels, dice, stats, items, shops and files a round uses come along with it. If something with the same name
  already exists but differs, it comes in as a copy (for example "Potion (copy)").
- **＋ Add tiebreaker (optional)**, at the end of the round list, adds a tiebreaker clue.
- The **Checklist** at the foot of the list on the left says what's left to do before ▶ Play (⚠, counted in its
  heading) and notes worth a look (ℹ). It stays in view however many rounds there are; click a line to go and fix it.

## Jeopardy boards

- Drag tiles, categories and rows to move them, or use `Alt`+arrows: `Alt`+`←`/`→` moves a category, `Alt`+`↑`/`↓`
  moves a row.
- A category's menu (right-click it, or its ⋯) has **📋 Copy category** and **📋 Paste category here**, to reuse a
  whole category (name, picture and clues) in another round or game; `Ctrl+C` / `Ctrl+V` on its ⋯ do the same.
- A tile's right-click menu has **Make it a…**: Standard, Daily Double, Partner clue, Wheel tile, Dice tile, Everyone
  answers, or Empty tile.
- With phone buzzers, players can **Pass** on an ordinary buzz-in clue. Tick **Everyone must play (no Pass)** in the
  clue editor for a clue everyone has to try. On clues everyone answers, Daily Doubles, partner clues and the Final the
  tick is shown already on, and can't be changed: they never offer Pass.
- **Partner clues** are for two players without buzzers, with an optional steal on a miss. Place them by hand or at
  random. Their less common settings are under **▸ More rules**.
- **Wagers** (Daily Doubles and the Final) go up to the player's score, or up to $2,000 if they have less. Change the
  $2,000 to suit your point values in **⚖ Game rules** on the play screen: “Wagers go up to their score, or at least”.

## The slide editor

- A selected item's buttons are pinned at the top of the side panel.
- Double-click an item, or press `Enter`, to open its editor.
- Drag a box on an empty spot to select several items. `Alt`+drag always draws a box.
- Items snap into place; hold `Alt` to turn that off.
- With several selected, line them up (Left, Center, Right, Top, Middle, Bottom) or **Space evenly**.
- The **Layers** list reaches every item from the keyboard.
- The buttons after the slide tabs add, duplicate, copy, paste and delete slides.
- **Background ▾** sets the slide's color and picture.
- **Shape ▾** adds shapes and drawings.

### Pictures, video and sound

- **✎ Edit image** crops, straightens and resizes, and adds drawings, captions and stickers.
- **✎ Edit video… / sound…** trims a file, and crops and resizes a video. The change applies everywhere the file is
  used, unless you save it as a new file or pick **Only this item**.
- **Plays from … to …** sets the part this one item plays. Type times like `83`, `1:23` or `1:23.5`, and press
  **▶ Try it** to hear it.
- **When it plays** holds Autoplay, Loop, Start muted and Volume.
- A YouTube video can be **Sound only (hide the video)**: players hear it but never see it. **Players see** picks what
  goes in its place: nothing, a 🔊 speaker, or the speaker with a time bar that shows how long it plays. In the editor
  it shows dimmed, with a **🔊 Sound only** badge. It's for slides only: on a 🤫 card a YouTube video plays in YouTube's
  own player, so the player sees it.
- **🔁 Use another picture…** (or video, sound) swaps the file for this item only. To replace a file everywhere, use
  Replace everywhere… in **🖼 Media**.
- In these editors, `Ctrl+Enter` applies and `Esc` asks before throwing changes away.

Slide items and whole slides copy and paste between clues, rounds and games, with their pictures and sounds.

## The RPG map

- Click a ＋ to add a screen. The ＋ column past the map's right edge and the ＋ row under it grow the map (up to 16×16).
- Drag a screen to move or swap it; dropping past the edge grows the map.
- Pictures dropped on the map become screens.
- `Shift`-click or drag a box to select several screens.
- Click ⛔ between two screens to block the way.
- A screen's **Ways out** shows where each side leads. **▸ Change…** lets you edit it.

## The board game

- `Ctrl`+click adds a space, and `Alt`+drag links two spaces. **＋ Add space** adds one after the selected space.
- Arrow keys move between spaces; `Enter` opens a space's settings.
- A space's own buttons sit under its name: **🏁 Make it the start**, add a space after it, duplicate, and delete.

## Other editor tabs

| Tab | What it's for |
|---|---|
| **👥 Players & rules ▶** | Opens the play screen to set players, game rules and phone buzzers. Nothing starts until **Start game ▶**. |
| **🔊 Sounds** | The sounds played on stream: preview, replace or switch off each one. |
| **🎨 Theme** | Presets, colors, fonts (including your own font file) and background images. Click something in the preview to jump to its setting. |
| **🎡 Wheels, Dice & Deals** | Weighted wheels, custom dice and deals (a secret part for everyone). Outcomes can change scores or add buttons. |
| **🤫 Cards** | Private cards made ahead of time. During the show, **🤫 Send a card…** sends one to chosen players' phones. |
| **📊 Stats & Items** | HP bars, currencies, items, wearable gear and shops for RPG and board game rounds. |

### Themes

**💾 Save as new theme…** keeps a look in My themes for any game. Under **▸ Share or bring in a theme**, use
**⬇ Export theme** (a `.brainrot-theme` file) or **📋 Copy theme code** to share it, or **📂 Import theme…** /
**⌨ Paste theme code…** to try someone else's.

### Private cards

A card can hold words, pictures, GIFs, videos, sounds or a link. Only the players you send it to see it. If you host
from a single window, viewers can read a card's name in the send dialog (never what's on it), so keep the secret on the
card itself.

## Menus, lists and shortcuts

- **Right-click** almost anything for a menu: rounds, tiles, categories, list rows, map screens, spaces, avatars and
  items. `Shift+F10`, the menu key, or a row's **⋯** opens it too.
- Common keys work on whatever is selected: `Delete`, `F2` (rename), `Ctrl+D` (duplicate), `Ctrl+C` / `Ctrl+V`.
- **List** rows (stats, items, wheel slices…) have a ⋮⋮ drag handle, a **⋯** menu and a 🗑 to delete.
- Press `?` (or **❔ Help › ⌨ Keyboard shortcuts**) to see every shortcut, for the editor and for hosting.

## Colors

Click a color box to open the picker. Drag in the square, or type a **Hex** (`#ff00e6`) or **RGB** value.
**💧 Pick from the screen** grabs a color from anywhere on screen. `Enter` or **✓ Done** keeps the color; `Esc` puts
back the old one.

## Undo and history

- `Ctrl+Z` undoes and `Ctrl+Y` redoes any change in the editor, and takes you to where it happened.
- Deleting doesn't ask first; the "Deleted … · Undo" note brings it back.
- The **🕘 History** tab lists every change and lets you jump back to any point. It survives a reload. **⚙ Settings**
  sets how many changes it keeps (300 by default).

![The History tab](screenshots/history.png)
