# Working on this repo

Brainrot Games Maker: Svelte 5 and TypeScript, built by Vite into one self-contained file, `dist/index.html`.

- `src/editor/` the editor; `src/play/` hosting (the host panel and the stage); `src/audience/` the audience window;
  `src/lib/` the model, game flow and logic, with unit tests beside the code (`*.test.ts`).
- `buzzer/` the phone buzzer server (a Cloudflare Worker, with its own packages); `src-tauri/` the desktop app.
- `tests/e2e/` browser tests (`helpers.mjs`: the shared steps); `scripts/` the e2e shard runner, the gate, the
  version and changelog script.
- Specs: `docs/SPEC.md` (current), `docs/GAMES-MAKER-SPEC.md`. More in `docs/development.md`.

## Setup (once)

Node 22.18 or newer (`.nvmrc`). `npm ci && (cd buzzer && npm ci)`. A browser for the e2e tests:
`npx playwright-core install --only-shell chromium` (add `--with-deps` on Linux), or set `CHROMIUM_PATH` to a
Chromium you have.

## Checks, fastest first (rough times)

- `npm run build`, 8 s. Every e2e file drives `dist/index.html` and refuses to run if it's older than `src/`, so
  rebuild after any change there (or set `APP_FILE` to test another file).
- `npm run check`, 25 s (svelte-check over `src/`). `npm test`, 30 s (Vitest: unit, runes, `buzzer/` rules and `scripts/`).
  `(cd buzzer && npm run check)`, 3 s.
- `node scripts/e2e-shard.mjs --check`, `node scripts/version.mjs check`: a second each. `npm run check:e2e`, 6 s:
  type-checks the e2e files marked `// @ts-check` (in CI and the gate; keep it clean).
- One e2e file or a few: `node scripts/e2e-shard.mjs <name> [<name>…] --quiet` (one line for a pass, the last 80
  lines for a fail), or `node tests/e2e/<name>.mjs` for every check's line; 5 s to about 3 min each (hostlayout is the
  slowest): give it a 5-minute command timeout, or run it in the background. `npm run test:quick` builds and runs
  `smoke.mjs`, about 100 s; the release waits only for this.
- Code is formatted with Prettier: run `npm run format` before committing (`npm run format:check` is in CI and the
  gate: 25–55 s the first time, about 3 s after, as it keeps Prettier's cache; CI checks without one; Markdown is left
  alone). Now and then a long call chain needs a second `npm run format`.
- `npm run gate`: the checks in order (version check, format check, svelte-check, e2e type check, unit tests, buzzer
  check, shard check, build, then every e2e file, 3 at a time with quiet output), ending with a summary of what failed. It takes
  over 10 minutes: run it in the background.
- More e2e at once: `node scripts/e2e-shard.mjs <1–5|rest|buzzer|all> --jobs N --quiet`. A CI shard is 6–8 min; the
  whole suite is about 35 min one file after another. Never run all of it in the foreground.
- Fonts are handled: `helpers.mjs` points Chromium at `tests/e2e/fonts.conf` (CI's fonts, no Inter) unless
  `FONTCONFIG_FILE` is set, so layout checks measure the same here as on CI.

## Decided: don't change these

- No test contacts the real buzzer server, a live room or GitHub. Phone tests start a local `wrangler dev` with
  `startBuzzer()` from `tests/e2e/helpers.mjs`; test builds have no `VITE_BUZZER_URL`. GitHub's API is routed to a
  fake (see `tests/e2e/update.mjs`). An e2e file uses `helpers.mjs`'s `appFile()`, `failureShots()`, `launchChromium()`,
  `assert()`/`assertEq()`, `until()`, `sleep()` and `section()`, never copies of its own (the shard check enforces it;
  "Writing an e2e file" in `docs/development.md`).
- E2E: find big parts (stage, host panel, board, toasts…) with `helpers.mjs`'s hook helpers, not classes (not enforced).
- One window (no audience window, so the panel is on stream): the host panel never shows secrets, such as card words,
  file names, typed answers, picks, wagers and secret names (`docs/SPEC.md` §6.2, "Single window" and "The host
  panel's rules").
- The stage keeps its size. Boxes go over the tools row or beside the stage, never shrinking it (same section).
- Commits go straight to `main`, and every push is a release. Don't bump versions: `package.json`'s version is a floor
  and CI stamps the real one (`scripts/version.mjs`, "Versions and releases" in `docs/development.md`).

## Commits and CHANGELOG.md

- Commit titles: `Area: what changed, in plain words`, e.g. `Final: N shows the answer once the clock has run out`.
- Keep `CHANGELOG.md` up to date: every change that users would notice gets a line in plain words, under Added /
  Changed / Fixed / Removed, under the day it's pushed (Pacific time, PST/PDT). In practice:
  1. Commit the change (or the merge that brings it in) with its line under a heading written exactly `## Unreleased` at the top
     (add it if missing: the stamp removes it), then `### Fixed` (or Added / Changed / Removed).
  2. A commit can't hold its own hash, so once the hashes are known, add them to the line, e.g. `(abc1234)`.
  3. When you push, first run `node scripts/version.mjs stamp`. It moves the Unreleased lines under today's Pacific
     date, merging them into that day's sections if it has a heading already. Commit the hashes and the move together
     as `Changelog: …`, and push it with the rest.

  If a commit or merge lands with a title that doesn't say what it is, add it to the changelog's "Notes on the history"
  table instead of rewriting pushed history.
- `/gate` and `/changelog` (`.claude/commands/`) walk through the checks and the changelog steps.
