// npm run format / npm run format:check: Prettier over the repository (`--write` or `--check`, and any other
// arguments passed on). A check uses Prettier's cache, so one after an earlier one only looks at the files that changed
// (about 3 s instead of 25). A --write doesn't: Prettier marks each file it writes as done, so a file it lays out
// differently on a second pass (a long call chain, now and then) would then pass a cached check and fail CI's. Without
// the cache the check after a --write looks at every file it wrote, and says when one needs a second npm run format.
//
// Prettier's own cache key covers its version, Node's and the options (.prettierrc), but not the plugins' versions: after
// prettier-plugin-svelte (or the svelte it parses with) is updated, a cached check would pass files that the new
// version lays out differently, and CI, which checks without a cache, would fail. So the cache file is named after
// those versions (and this checkout's folder, so worktrees that share node_modules don't write over each other's), and
// a change in any of them starts a new one (an old one is small, and goes with node_modules at the next npm ci).
// CI checks without the cache (npx prettier --check . in .github/workflows/build.yml). --cache-strategy content: a file is checked again when its content
// changes, not just its time, so a git checkout or stash that touches files without changing them costs nothing.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const version = (pkg) => JSON.parse(readFileSync(require.resolve(`${pkg}/package.json`), 'utf8')).version;
const key = ['prettier', 'prettier-plugin-svelte', 'svelte'].map((p) => `${p}@${version(p)}`).join(' ') + ` ${root}`;
const dir = join(root, 'node_modules', '.cache', 'prettier');
const name = `format-${createHash('sha256').update(key).digest('hex').slice(0, 16)}.json`;
mkdirSync(dir, { recursive: true });

const args = process.argv.slice(2);
const cache = args.includes('--check') ? ['--cache', '--cache-strategy', 'content', '--cache-location', join(dir, name)] : [];
const r = spawnSync(process.execPath, [require.resolve('prettier/bin/prettier.cjs'), '.', ...args, ...cache], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
