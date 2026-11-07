<div align="center">

# Brainrot Games Maker

**Make and host game shows for your livestream.**

[![Latest release](https://img.shields.io/github/v/release/vampiricwulf/Brainrot-Game-Maker)](../../releases/latest)
[![Build](https://github.com/vampiricwulf/Brainrot-Game-Maker/actions/workflows/build.yml/badge.svg)](../../actions/workflows/build.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Download](../../releases/latest) · [Making games](docs/making-games.md) · [Hosting](docs/hosting.md)

![A Jeopardy board in play](docs/screenshots/play-board.png)

</div>

## Features

- **Jeopardy boards** with Daily Doubles, partner clues, wheels and dice
- **Final Jeopardy** with secret wagers and a one-by-one reveal
- **RPG adventures** with a map, stats, items and shops
- **Board games** with dice, forks and special spaces
- **Phones as buzzers**: players join by scanning a code, then buzz, type answers and get secret cards
- **Made for streaming**: a separate audience window for OBS or Discord, so your controls stay private
- **Any media**: text, pictures, GIFs, video, sound and YouTube on every clue
- **One file**: runs in your browser with no install, account or internet

## Download

Get the latest version from the [Releases page](../../releases/latest):

| File | What it is |
|---|---|
| `brainrot-game-maker.html` | Opens in Chrome, Edge or Firefox |
| `brainrot-game-maker-portable.exe` | Windows app, no install, updates itself |

## Quick start

1. Click **Add round** and pick a kind of round, or open the sample game.
2. Click a tile to type its clue and answer.
3. Press **Play**, add your players and start the show.

![The editor](docs/screenshots/editor.png)

## Hosting

One big button moves the show along. If something's left to do, like giving out points, it checks with you first.
You can also click the board itself to pick tiles.

![A clue on screen](docs/screenshots/play-clue.png)

<table>
<tr>
<td><img src="docs/screenshots/play-rpg.png" alt="An RPG round in play"></td>
<td><img src="docs/screenshots/play-boardgame.png" alt="A board game round in play"></td>
</tr>
</table>

## Documentation

- [Making games](docs/making-games.md): rounds, slides and the editor
- [Hosting a game](docs/hosting.md): the host screen, phones, secret cards and keyboard shortcuts
- [Saving and updating](docs/saving.md)
- [Set up your own buzzer server](docs/buzzer-server.md)
- [Streaming the sound to Discord or OBS](docs/streaming-sound.md)

## Development

```sh
npm install
npm run dev
```

See [Development](docs/development.md) for building, testing and releases, and [third-party code](docs/third-party.md)
for credits.

## License

[MIT](LICENSE)
