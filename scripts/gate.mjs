// CI's checks in one command (npm run gate): what the build job checks before a release, then the end-to-end files the
// e2e job runs. Not run here: the desktop app's builds and its Rust tests (cargo test in src-tauri, needs Rust).
//
//   node scripts/gate.mjs                 every step below, then every end-to-end file, three at a time
//   node scripts/gate.mjs --jobs 4        the end-to-end files four at a time
//   node scripts/gate.mjs --e2e 3         only e2e shard 3 at the end (any e2e-shard.mjs target: 1–5, rest, buzzer,
//                                         all); --e2e none skips the end-to-end files
//
// It stops at the first step that fails, then prints each step's result and time and exits 1. The end-to-end files run
// through scripts/e2e-shard.mjs --quiet: one line per passing file, the last lines of a failing one, and they all run
// (a failing file doesn't stop the others). The steps before them take about a minute; three at a time, the end-to-end
// files take about a third of their time one after another (shard 5: 1m48s against 5m11s; the 26 buzzer files: 4m13s).
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const jobs = opt('--jobs', '3');
const e2e = opt('--e2e', 'all');
// The e2e target is checked now, not after the minute of steps before it.
if (args.length || !/^[1-9]\d*$/.test(jobs) || !/^([1-5]|rest|buzzer|all|none)$/.test(e2e ?? '')) {
  console.error('Usage: node scripts/gate.mjs [--jobs N] [--e2e <1–5 | rest | buzzer | all | none>]');
  process.exit(2);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = [
  ['Version numbers match', 'node', ['scripts/version.mjs', 'check']],
  // The npm scripts CI runs, so the gate can't drift from them.
  ['Type check (npm run check: svelte-check, warnings fail it)', npm, ['run', 'check']],
  ['Unit tests (npm test: Vitest, src/ and buzzer/)', npm, ['test']],
  ['Buzzer room type check (buzzer/)', npm, ['--prefix', 'buzzer', 'run', 'check']],
  ['Every e2e file is in one shard', 'node', ['scripts/e2e-shard.mjs', '--check']],
  ['Build (dist/index.html)', npm, ['run', 'build']],
];
if (e2e !== 'none') steps.push([`End-to-end tests (${e2e}, ${jobs} at a time)`, 'node', ['scripts/e2e-shard.mjs', e2e, '--jobs', jobs, '--quiet']]);

const root = new URL('../', import.meta.url);
const done = [];
const t00 = Date.now();
for (const [name, cmd, argv] of steps) {
  console.log(`\n=== ${name}: ${[cmd, ...argv].join(' ')}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, argv, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  done.push({ name, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) });
  if (r.status !== 0) break;
}

const time = (s) => (s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`);
console.log('\nGate:');
for (const d of done) console.log(`  ${d.ok ? 'ok  ' : 'FAIL'} ${time(d.s).padStart(6)}  ${d.name}`);
for (const [name] of steps.slice(done.length)) console.log(`  --   ${''.padStart(6)}  ${name} (not run)`);
const failed = done.find((d) => !d.ok);
console.log(
  failed
    ? `\nFailed at: ${failed.name} (${time(Math.round((Date.now() - t00) / 1000))} in all)`
    : `\nAll ${done.length} steps passed in ${time(Math.round((Date.now() - t00) / 1000))}`,
);
process.exit(failed ? 1 : 0);
