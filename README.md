<div align="center">

# Brainrot Games Maker

**Make and host game shows for your livestream.**

[![Latest release](https://img.shields.io/github/v/release/vampiricwulf/Brainrot-Game-Maker)](../../releases/latest)
[![Build](https://github.com/vampiricwulf/Brainrot-Game-Maker/actions/workflows/build.yml/badge.svg)](../../actions/workflows/build.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Download](../../releases/latest) · [Making games](docs/making-games.md) · [Hosting](docs/hosting.md)

![A Jeopardy board in play](docs/screenshots/play-board.png)

</div>

## Thanks

This app was made with AI coding tools, and it stands entirely on the work of people who wrote real, careful software
and made it free for everyone. Thank you to:

- [Svelte](https://svelte.dev) by Rich Harris and the Svelte team, which the whole app is built with
- [Vite](https://vite.dev) by Evan You and the Vite team, and [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) by Richard Tallent, which turn it into one HTML file
- [Tauri](https://tauri.app) by the Tauri Programme, which makes the Windows desktop app
- [Mediabunny](https://github.com/Vanilagy/mediabunny) by Vanilagy, which reads, converts and edits videos and sounds
- [omggif](https://github.com/deanm/omggif) by Dean McNamee, which reads GIFs
- [JSZip](https://github.com/Stuk/jszip) by Stuart Knightley, which packs games into files
- [idb-keyval](https://github.com/jakearchibald/idb-keyval) by Jake Archibald, which stores games in the browser
- [QR Code Generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase, which makes the join codes for phones
- [Cloudflare Workers](https://workers.cloudflare.com) and [Wrangler](https://github.com/cloudflare/workers-sdk), which run the phone buzzer server
- [Playwright](https://playwright.dev) by Microsoft and [Vitest](https://vitest.dev) by the Vitest team, which test it
- [TypeScript](https://www.typescriptlang.org) by Microsoft
- The fonts, through [Fontsource](https://fontsource.org): [Inter](https://rsms.me/inter/) by Rasmus Andersson, Anton, Bangers and Oswald by Vernon Adams, Bebas Neue by Ryoichi Tsunekawa, Comic Neue by Craig Rozynski, Libre Baskerville by Impallari Type, Permanent Marker by Font Diner and Press Start 2P by CodeMan38

See [third-party code](docs/third-party.md) for licenses.

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
- [Hosting a game](docs/hosting.md): the host screen, phones and secret cards
- [Keyboard shortcuts](docs/keyboard-shortcuts.md)
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
