// Versions of the app (Semantic Versioning). Every push to main is released as a version (.github/workflows/build.yml):
//
//   node scripts/version.mjs next [notes.md]   The version this commit is released as, worked out from the last
//                                              release tag (vX.Y.Z) and the CHANGELOG.md lines added since: only
//                                              Fixed lines → a patch step, anything else → a minor step, a line marked
//                                              **Breaking** → a major step. package.json's version is a floor (the
//                                              first release; raise it by hand for a deliberate step). Prints it (and
//                                              sets the `version` output on GitHub Actions); writes those changelog
//                                              lines as release notes to notes.md.
//   node scripts/version.mjs set X.Y.Z         Stamp a version into every file that carries it (package.json and its
//                                              lock file, the desktop app's tauri.conf.json, Cargo.toml, Cargo.lock).
//   node scripts/version.mjs check             Fail when those files don't all carry the same version.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { addedEntries, nextVersion, parseVersion, releaseNotes } from '../src/lib/semver.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const write = (path, text) => writeFileSync(new URL(path, root), text);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const CARGO_NAME = 'brainrot-game-maker';

/** Every file that carries the version, with how to read it and how to set it. */
const FILES = {
  'package.json': {
    get: (t) => JSON.parse(t).version,
    set: (t, v) => t.replace(/("version":\s*")[^"]*(")/, `$1${v}$2`),
  },
  'package-lock.json': {
    get: (t) => JSON.parse(t).version,
    // The lock file has the version twice: at the top and for the root package ("packages" → "").
    set: (t, v) => {
      const lock = JSON.parse(t);
      lock.version = v;
      if (lock.packages?.['']) lock.packages[''].version = v;
      return JSON.stringify(lock, null, 2) + '\n';
    },
  },
  'src-tauri/tauri.conf.json': {
    get: (t) => JSON.parse(t).version,
    set: (t, v) => t.replace(/("version":\s*")[^"]*(")/, `$1${v}$2`),
  },
  'src-tauri/Cargo.toml': {
    get: (t) => /^\[package\][^[]*?^version\s*=\s*"([^"]*)"/ms.exec(t)?.[1],
    set: (t, v) => t.replace(/^(\[package\][^[]*?^version\s*=\s*")[^"]*(")/ms, `$1${v}$2`),
  },
  'src-tauri/Cargo.lock': {
    // (\r?: a Windows checkout has Windows line ends.)
    get: (t) => new RegExp(`name = "${CARGO_NAME}"\\r?\\nversion = "([^"]*)"`).exec(t)?.[1],
    set: (t, v) => t.replace(new RegExp(`(name = "${CARGO_NAME}"\\r?\\nversion = ")[^"]*(")`), `$1${v}$2`),
  },
};

const releaseTags = (...args) =>
  git('tag', '--list', 'v*', '--sort=-v:refname', ...args)
    .split('\n')
    .filter((t) => parseVersion(t) && !parseVersion(t).pre);

/** The newest release before this commit (a tag on this very commit is its own release, not an earlier one). */
function lastReleaseTag(own) {
  return releaseTags('--merged', 'HEAD').find((t) => t !== own) ?? null;
}

/** The (1-based) numbers of the lines `git diff` adds to the file since `from`. */
function addedLines(from, file) {
  const diff = git('diff', '--unified=0', '--no-color', from, 'HEAD', '--', file);
  const added = new Set();
  for (const m of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = +m[1];
    const count = m[2] === undefined ? 1 : +m[2];
    for (let i = 0; i < count; i++) added.add(start + i);
  }
  return added;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'next') {
  const base = FILES['package.json'].get(read('package.json'));
  // A run again on a commit that was released already: the same version (its notes worked out the same way).
  const own = releaseTags('--points-at', 'HEAD')[0] ?? null;
  const last = lastReleaseTag(own);
  const lines = read('CHANGELOG.md').split('\n');
  // The first release: everything in the changelog so far is what it brings (the notes say so briefly instead).
  // (An entry the last release had, only edited since, isn't new: see addedEntries.)
  const entries = last ? addedEntries(lines, addedLines(last, 'CHANGELOG.md'), git('show', `${last}:CHANGELOG.md`).split('\n')) : [];
  const version = own ? own.replace(/^v/, '') : nextVersion(last, base, entries);
  if (arg) {
    const notes = last ? releaseNotes(entries) || '_Behind-the-scenes changes only._' : 'The first numbered release. See CHANGELOG.md for everything so far.';
    write(arg, notes + '\n');
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  console.log(version);
} else if (cmd === 'set') {
  if (!parseVersion(arg ?? '')) throw new Error(`Not a version: ${arg}`);
  const version = arg.replace(/^v/, '');
  for (const [path, f] of Object.entries(FILES)) {
    const before = read(path);
    const after = f.set(before, version);
    if (f.get(after) !== version) throw new Error(`Couldn't set the version in ${path}`);
    if (after !== before) write(path, after);
  }
  console.log(version);
} else if (cmd === 'check') {
  const found = Object.entries(FILES).map(([path, f]) => [path, f.get(read(path))]);
  const versions = new Set(found.map(([, v]) => v));
  if (versions.size !== 1) {
    console.error('The version differs between files:\n' + found.map(([p, v]) => `  ${p}: ${v}`).join('\n'));
    process.exit(1);
  }
  console.log(`${[...versions][0]} everywhere`);
} else {
  console.error('Usage: node scripts/version.mjs next [notes.md] | set X.Y.Z | check');
  process.exit(2);
}
