# Development

[← Back to the README](../README.md)

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
| `tests/e2e/`, `scripts/` | Browser tests, the screenshot script and the version script |

## Versions and releases

Versions follow [Semantic Versioning](https://semver.org). Every push to `main` is released by CI as `vX.Y.Z`
(`.github/workflows/build.yml`), numbered by `scripts/version.mjs` from the last release and the `CHANGELOG.md`
lines the push adds:

- only lines under **Fixed** → a patch (1.4.2 → 1.4.3);
- anything under **Added**, **Changed** or **Removed** → a minor (1.4.2 → 1.5.0);
- a line marked **Breaking** (e.g. saves older versions can't open) → a major (1.4.2 → 2.0.0).

`package.json`'s version is a floor: raise it by hand (`node scripts/version.mjs set 2.0.0`) for a deliberate step.
`node scripts/version.mjs check` makes sure `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
`Cargo.toml` and `Cargo.lock` agree. The release notes are the changelog lines added since the last release.

**Signing the desktop app's updates** (once): the desktop app only installs an update signed with the project's key.

1. `npx @tauri-apps/cli signer generate -w ~/.tauri/brainrot-update.key` (works from any folder; pick a password;
   keep the key file private and backed up: without it, installed copies can't update themselves any more).
2. In the repository's Settings › Secrets and variables › Actions: secret **`UPDATE_SIGNING_KEY`** = the key file's
   contents, secret **`UPDATE_SIGNING_KEY_PASSWORD`** = its password, variable **`UPDATE_PUBKEY`** = the public key
   it printed (also in `brainrot-update.key.pub`).

Without them CI still releases, unsigned, and the desktop app offers the download instead of updating itself.
