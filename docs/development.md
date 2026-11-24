# Development

[← Back to the README](../README.md)

The app is built with Svelte 5, TypeScript and Vite, bundled into a single HTML file. The desktop app uses
[Tauri](https://tauri.app) (`src-tauri/`).

## Setup

You need Node 22.18 or newer (`scripts/version.mjs` imports a `.ts` file, which Node runs as is from 22.18; CI uses
Node 22). Then, from the repo root:

```sh
npm ci                 # the app's packages
(cd buzzer && npm ci)  # the buzzer server's packages (the phone e2e tests run it)
npx playwright-core install --only-shell chromium   # the e2e tests' browser (add --with-deps on Linux for its libraries)
```

Instead of installing a browser you can point the tests at a Chromium or Chrome you have, with `CHROMIUM_PATH` (below).
The desktop app also needs Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

## Commands

Run these from the repo root. The times are rough.

```sh
npm run dev            # dev server
npm run build          # → dist/index.html (one self-contained file), about 8 s
npm run check          # type-check (svelte-check), about 25 s
npm test               # unit tests (Vitest: src/ and buzzer/), about 30 s
(cd buzzer && npm run check)   # type-check the buzzer Worker and phone page (CI runs it; the root check doesn't)
npm run test:quick     # the quick end-to-end test (tests/e2e/smoke.mjs), about 100 s; CI waits for it before releasing
node tests/e2e/goon.mjs        # one end-to-end file (build first)
node scripts/e2e-shard.mjs 3   # one CI shard (1–5 or rest; scripts/e2e-shard.mjs lists them), 6–8 min each
npm run test:e2e       # the whole end-to-end suite, one file after another, going on past a failure: about 35 min
                       # (CI runs it in six shards alongside the release)
npm run test:buzzer    # only the phone-buzzer end-to-end files (they start a local buzzer server)
npm run screenshots    # regenerate docs/screenshots (build first)
npm run desktop:dev    # the desktop app around the dev server (it starts npm run dev; needs Rust + Tauri prerequisites)
npm run desktop:build  # Windows app (needs Rust + Tauri prerequisites)
(cd src-tauri && cargo test)   # the desktop app's Rust tests; no build needed (CI runs them too; needs Rust + Tauri prerequisites)
```

### End-to-end tests

Each `tests/e2e/*.mjs` file is a plain Node script that drives the built app, `dist/index.html`, in headless Chromium
(through `playwright-core`), opened from disk as a user would. Build first: a file refuses to run against a
`dist/index.html` older than the sources it's built from, so it never quietly tests an old build (set `APP_FILE` to
test another file). Shared steps are in `tests/e2e/helpers.mjs`, including `startBuzzer()`, which runs the buzzer
server locally under `wrangler dev` for the phone tests. No test may reach the real buzzer server or GitHub.

Fonts: some layout checks measure rows and buttons, and assume CI's fonts, which have no Inter. `tests/e2e/helpers.mjs`,
which every file imports, points Chromium at `tests/e2e/fonts.conf` (this machine's fonts minus Inter) unless
`FONTCONFIG_FILE` is already set.

### Environment variables

| Variable | Read by | What it does |
|---|---|---|
| `CHROMIUM_PATH` | e2e tests, `scripts/screenshots.mjs` | The browser to run. Unset: `/opt/pw-browsers/chromium` if it exists, else the one `npx playwright-core install` put in place. |
| `APP_FILE` | e2e tests | The app file to test, instead of `dist/index.html`. |
| `SCREENSHOTS` | e2e tests | A folder for the pictures some files take as they go (`smoke.mjs`: one per step). CI sets it to `test-results/screenshots`; a failing run leaves its pictures and traces in `test-results/`, which CI keeps. |
| `SHOTS`, `PASS_SHOTS` | other e2e files | The same, for the files that read these names instead (`PASS_SHOTS`: `pass.mjs`). |
| `FONTCONFIG_FILE` | Chromium | The fonts the tests use; unset, `tests/e2e/fonts.conf`. |
| `VITE_BUZZER_URL` | `npm run build` | The buzzer server built in for phone buzzers (blank: none built in). For a local one, `http://localhost:8787` from `cd buzzer && npx wrangler dev`. CI builds the release with the `BUZZER_URL` repository variable. |
| `BRAINROT_RELEASE` | `npm run build` | `1`: a published release, which checks for newer versions when it starts. Only CI's release build sets it. |
| `GITHUB_SHA` | `npm run build` | The commit shown in ℹ About (unset: the checkout's own). |
| `BRAINROT_UPDATE_PUBKEY` | `npm run desktop:build` (compiled into the Rust app) | The public key desktop updates must be signed with (see below). Unset: the app offers the download instead of updating itself. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | the buzzer deploy, `buzzer/measure-files.mjs` | See [`buzzer/README.md`](../buzzer/README.md). |

## Where things are

| Path | What's there |
|---|---|
| `src/App.svelte`, `src/main.ts` | The app's start: the first screen, then the editor or play |
| `src/PlayerHome.svelte` | The start screen of an exported, play-only game file |
| `src/lib/` | Model (`model.ts`), game flow and scoring (`session.ts`), tools, media, saving, partner clues and cards (`partner.ts`), RPG (`rpg.ts`) and board game (`boardgame.ts`) logic, and the phone protocol (`buzzproto.ts`) |
| `src/lib/shrink/` | 🗜 Smaller copies of files for phones, and 🔄 Convert |
| `src/lib/slide/`, `src/lib/rpg/`, `src/lib/boardgame/` | Components the editor and play share (media players, avatars, board spaces) |
| `src/editor/` | The editor: `slide/` the slide editor, `tools/` the wheel, dice and deal editors, `rpg/` and `boardgame/` those rounds' editors |
| `src/play/` | Hosting: `Play.svelte` (play state and keys), `HostPanel.svelte` (the panel's layout), the stage and the audience view |
| `src/play/host/` | The host panel's boxes, `goon.ts` (the blue button and the check before going on), `verbs.ts` (every host button's words and keys) |
| `src/play/tools/`, `src/play/rpg/`, `src/play/boardgame/` | The wheel, dice and roll-off on screen; RPG and board game play |
| `src/audience/` | The audience and scores windows, and the 🪟 card window |
| `src/test/` | Vitest's environment for `*.svelte.test.ts` files |
| `src-tauri/` | The desktop app |
| `buzzer/` | The buzzer server: a Cloudflare Worker (`src/`) and the phone page (`phone/`), with its own packages. [`buzzer/README.md`](../buzzer/README.md#local-development) says how to run one locally |
| `tests/e2e/` | Browser tests (`helpers.mjs`: the shared steps) |
| `scripts/` | The e2e shard list and runner, the screenshot script and the version script |

Unit tests sit next to the code they test (`*.test.ts`).

The specs:

- [`SPEC.md`](SPEC.md): the Jeopardy modes, the editor, play, the host panel's rules and the audience view. Current.
- [`GAMES-MAKER-SPEC.md`](GAMES-MAKER-SPEC.md): round modes, the RPG and the board game. Built; kept for how and why.
- [`PARTNER-CLUES-SPEC.md`](PARTNER-CLUES-SPEC.md): 🤝 partner clues, 🤫 cards on phones and 🎭 Deal. Built; its
  line references are historical, and SPEC.md wins where they differ.

## Versions and releases

Versions follow [Semantic Versioning](https://semver.org). CI releases every push to `main` as `vX.Y.Z`
(`.github/workflows/build.yml`). `scripts/version.mjs` picks the number from the last release and the `CHANGELOG.md`
lines the push adds:

| Changelog lines added | Version step |
|---|---|
| Only under **Fixed** | patch (1.4.2 → 1.4.3) |
| Anything under **Added**, **Changed** or **Removed** | minor (1.4.2 → 1.5.0) |
| A line marked **Breaking** (for example, saves older versions can't open) | major (1.4.2 → 2.0.0) |

A push that adds no changelog lines is still released, as a patch whose notes say "Behind-the-scenes changes only", so
a missing line means the wrong version and empty release notes.

The release notes are the changelog lines added since the last release. The same push also puts the release file up as the GitHub Pages site
(https://vampiricwulf.github.io/Brainrot-Game-Maker/, the `pages` job); Pages must be on in the repository's
Settings, Pages, with Source "GitHub Actions".

- `package.json`'s version is a floor. To make a deliberate jump, set it by hand: `node scripts/version.mjs set 2.0.0`.
- `node scripts/version.mjs check` makes sure `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
  `Cargo.toml` and `Cargo.lock` agree.
- `node scripts/version.mjs stamp` moves the lines under **Unreleased** in `CHANGELOG.md` under today's heading in
  Pacific time (it works the date out, whatever the computer's clock zone is), merging them into that day's sections if
  it has a heading already. It does nothing when Unreleased is empty. `stamp 2026-11-22` uses that date instead.

### Writing changelog lines

Every change people who make or host games would notice gets a line in `CHANGELOG.md`, in the same commit as the change
(or the merge that brings it in):

- under **Unreleased** at the top until it's pushed, then under the heading for the day it's pushed (Pacific time,
  PST/PDT; start the heading on the day's first push);
- in **Added**, **Changed**, **Fixed** or **Removed**, which also picks the version step above (only Fixed: a patch);
- in plain words, with the commit hashes when known.

When a commit or merge lands with a title that doesn't say what it is, add it to the changelog's "Notes on the history"
table instead of rewriting pushed history. The same rule is in `CLAUDE.md` and at the top of `CHANGELOG.md`.

### Signing the desktop app's updates

The desktop app only installs updates signed with the project's key. To set this up once:

1. Generate a key (from any folder) and pick a password:

   ```sh
   npx @tauri-apps/cli signer generate -w ~/.tauri/brainrot-update.key
   ```

   Keep the key file private and backed up. Without it, installed copies can't update themselves any more.
2. In the repository's **Settings › Secrets and variables › Actions**, add:
   - secret `UPDATE_SIGNING_KEY`: the key file's contents
   - secret `UPDATE_SIGNING_KEY_PASSWORD`: its password
   - variable `UPDATE_PUBKEY`: the public key it printed (also in `brainrot-update.key.pub`)

Without them, CI still releases, but unsigned, and the desktop app offers the download instead of updating itself.
