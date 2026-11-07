# Development

[← Back to the README](../README.md)

The app is built with Svelte 5, TypeScript and Vite, bundled into a single HTML file. The desktop app uses
[Tauri](https://tauri.app) (`src-tauri/`).

## Commands

```sh
npm install
npm run dev            # dev server
npm run build          # → dist/index.html (one self-contained file)
npm run check          # type-check
npm test               # unit tests
(cd buzzer && npm ci)  # once: the buzzer server's packages (its e2e tests run it)
npm run test:quick     # the quick end-to-end test (about a minute; CI waits for it before releasing)
npm run test:e2e       # the full end-to-end suite, going on past a failure (CI runs it in six shards alongside the release)
node scripts/e2e-shard.mjs 3   # one CI shard (1–5 or rest; scripts/e2e-shard.mjs lists them)
npm run test:buzzer    # only the phone-buzzer end-to-end files (they start a local buzzer server)
npm run screenshots    # regenerate docs/screenshots (build first)
npm run desktop:build  # Windows app (needs Rust + Tauri prerequisites)
```

## Where things are

| Path | What's there |
|---|---|
| `src/lib/` | Model, game flow and scoring, tools, media, saving, RPG (`rpg.ts`) and board game (`boardgame.ts`) logic |
| `src/editor/` | The editor |
| `src/play/` | Hosting: the stage, host panel, RPG and board game play |
| `src/audience/` | The audience window |
| `src-tauri/` | The desktop app |
| `tests/e2e/`, `scripts/` | Browser tests, the screenshot script and the version script |

The specs are in [`SPEC.md`](SPEC.md) and [`GAMES-MAKER-SPEC.md`](GAMES-MAKER-SPEC.md).

## Versions and releases

Versions follow [Semantic Versioning](https://semver.org). CI releases every push to `main` as `vX.Y.Z`
(`.github/workflows/build.yml`). `scripts/version.mjs` picks the number from the last release and the `CHANGELOG.md`
lines the push adds:

| Changelog lines added | Version step |
|---|---|
| Only under **Fixed** | patch (1.4.2 → 1.4.3) |
| Anything under **Added**, **Changed** or **Removed** | minor (1.4.2 → 1.5.0) |
| A line marked **Breaking** (for example, saves older versions can't open) | major (1.4.2 → 2.0.0) |

The release notes are the changelog lines added since the last release.

- `package.json`'s version is a floor. To make a deliberate jump, set it by hand: `node scripts/version.mjs set 2.0.0`.
- `node scripts/version.mjs check` makes sure `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
  `Cargo.toml` and `Cargo.lock` agree.

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
