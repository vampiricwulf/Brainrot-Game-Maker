// Which end-to-end files each CI e2e job runs (.github/workflows/build.yml), and the runner for them.
//
//   node scripts/e2e-shard.mjs <shard>   run the shard's files one after another (1–5, or rest)
//   node scripts/e2e-shard.mjs all       run every file (npm run test:e2e)
//   node scripts/e2e-shard.mjs buzzer    run the files that start a local buzzer server (npm run test:buzzer)
//   node scripts/e2e-shard.mjs --check   prove the layout below is sound (the build job runs it)
//
//   --jobs N   run up to N files at once (default 1, one after another). Each file's output is then held back and
//              printed whole when it ends, so files never mix their lines; the results still come in the list's order.
//              Files can run side by side: each takes its own ports (freePort() in helpers.mjs) and temp folders.
//   --quiet    (or E2E_QUIET=1) a file that passes prints one line with its time; one that fails prints its last 80
//              lines (stdout and stderr together, each cut at 400 characters), where its failure is.
//
// A run goes on past a failing file, prints each file's result and time, and exits 1 if any failed. In GitHub Actions
// (GITHUB_STEP_SUMMARY set) it also writes that table to the run's summary page and marks each failed file with an
// error annotation, so the run page says which file failed without opening the log. The named shards
// hold about six minutes of tests each (from a full run's times); rest is every tests/e2e/*.mjs file they don't list,
// so a new file always runs somewhere. buzzer is worked out from the files' source (startBuzzer, startRoomOn or
// buzzer/'s wrangler), so it never needs a list. When a shard grows past about eight minutes, move a file to another one here.
// --check fails unless every named file exists, no file is in two shards, build.yml's e2e matrix runs exactly
// these shards, and every file uses appFile() and failureShots() from helpers.mjs.
//
// Before a run it checks that dist/index.html is newer than the source (unless APP_FILE is set). Each file's Chromium
// gets tests/e2e/fonts.conf (CI's fonts, no Inter) unless FONTCONFIG_FILE is set: helpers.mjs sets it.
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { appFile } from '../tests/e2e/helpers.mjs';

const SHARDS = {
  1: 'phonecopies cardrounds partnerplay cardsend history playfeatures buzzerlive convert slidesround dealcaptain',
  2: 'hostlayout boardgame remotebuzz partnersend boardedit partnerteams partnerrandom deal editorfixes multislide',
  3: 'smoke audio save videoedit buzzerfiles themes goon editormedia lists everyone links',
  4: 'stream editorfeatures hosting partnerjudge pregame board finalcards datasafety dealwheel playcopies update boardimages',
  5: 'buzzerroom desktop fullshow layers cardlimits phonewager phonecards savedcards partnerphones channel rounds',
};
const NOT_TESTS = new Set(['helpers', 'mediafixtures']);

const root = new URL('../', import.meta.url);
const all = readdirSync(new URL('tests/e2e/', root))
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.slice(0, -4))
  .filter((f) => !NOT_TESTS.has(f))
  .sort();
const named = Object.fromEntries(Object.entries(SHARDS).map(([k, v]) => [k, v.split(/\s+/)]));
const listed = Object.values(named).flat();
const shardFiles = (s) => (s === 'rest' ? all.filter((f) => !listed.includes(f)) : named[s]);
const buzzerFiles = () =>
  all.filter((f) => /startBuzzer|startRoomOn|node_modules\/\.bin\/wrangler/.test(readFileSync(new URL(`tests/e2e/${f}.mjs`, root), 'utf8')));

function check() {
  const bad = [];
  for (const f of listed) if (!all.includes(f)) bad.push(`${f}.mjs is listed but isn't in tests/e2e`);
  for (const f of new Set(listed)) if (listed.filter((g) => g === f).length > 1) bad.push(`${f}.mjs is in two shards`);
  const want = [...Object.keys(SHARDS), 'rest'];
  const yml = readFileSync(new URL('.github/workflows/build.yml', root), 'utf8');
  const m = yml.match(/^\s*shard: \[([^\]]*)\]/m);
  const got = m ? m[1].split(',').map((s) => s.trim()) : [];
  if (got.join() !== want.join()) bad.push(`build.yml's e2e matrix is [${got}], not [${want}]`);
  if (!shardFiles('rest').length) bad.push('rest is empty');
  // Every file opens the app through appFile() (which refuses a stale build) and leaves failure pictures through
  // failureShots() (where CI uploads them), so a file copied from an old one can't bring the old ways back.
  for (const f of all) {
    const src = readFileSync(new URL(`tests/e2e/${f}.mjs`, root), 'utf8');
    if (/process\.env\.APP_FILE|dist\/index\.html/.test(src)) bad.push(`${f}.mjs reads APP_FILE or dist/index.html itself: use appFile()`);
    if (/newPage\(/.test(src) && !/failureShots\(/.test(src)) bad.push(`${f}.mjs opens pages but never calls failureShots()`);
    if (/process\.env\.SHOTS\b[^\n]*failure/.test(src)) bad.push(`${f}.mjs takes its failure picture only when SHOTS is set: use failureShots()`);
  }
  if (bad.length) {
    console.error(bad.join('\n'));
    process.exit(1);
  }
  console.log(`e2e shards: ${want.map((s) => `${s} (${shardFiles(s).length})`).join(', ')}; ${all.length} files, each once`);
}

// One file in its own Node: its result, its time, and (when `held`) everything it printed, stdout and stderr together
// in the order it printed them. Held output goes to a file, not a pipe: a test that ends with process.exit() right after
// printing its failure would lose the end of what it wrote down a pipe.
function runFile(f, held, children) {
  return new Promise((done) => {
    const t0 = Date.now();
    if (!held) console.log(`\n▶ ${f}.mjs`);
    const log = held && join(mkdtempSync(join(tmpdir(), 'e2e-out-')), `${f}.log`);
    const fd = held && openSync(log, 'w');
    const child = spawn(process.execPath, [`tests/e2e/${f}.mjs`], { cwd: root, stdio: held ? ['ignore', fd, fd] : 'inherit' });
    if (held) closeSync(fd);
    children.add(child);
    let failed = '';
    child.on('error', (e) => (failed = String(e.stack || e) + '\n'));
    child.on('close', (code) => {
      children.delete(child);
      let out = '';
      if (held) {
        out = readFileSync(log, 'utf8') + failed;
        rmSync(dirname(log), { recursive: true, force: true });
      }
      done({ f, ok: code === 0, s: Math.round((Date.now() - t0) / 1000), out });
    });
  });
}

// The end of a failed file's output: its last `n` lines, each cut short, so a line listing a whole page stays readable.
function tail(out, n = 80) {
  const lines = out.replace(/\n+$/, '').split('\n');
  const cut = lines.slice(-n).map((l) => (l.length > 400 ? l.slice(0, 400) + ` … (${l.length} characters)` : l));
  return (lines.length > n ? `  … (${lines.length - n} lines before)\n` : '') + cut.join('\n') + '\n';
}

async function run(files, name, { jobs, quiet }) {
  try {
    appFile();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const held = jobs > 1 || quiet;
  const children = new Set();
  // Stopped (Ctrl+C, or a kill): the files running now are stopped too, so none is left behind with its browser or
  // buzzer server.
  for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => {
      for (const c of children) c.kill(sig);
      process.exit(1);
    });
  const results = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const r = await runFile(files[i], held, children);
      results[i] = r;
      if (quiet) process.stdout.write(`${r.ok ? 'ok  ' : 'FAIL'} ${r.f}.mjs ${r.s}s\n${r.ok ? '' : tail(r.out)}`);
      else if (held) process.stdout.write(`\n▶ ${r.f}.mjs (${r.ok ? 'ok' : 'FAIL'}, ${r.s}s)\n${r.out}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
  console.log('\nE2E results:');
  for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.f}.mjs ${r.s}s`);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `${failed.length} of ${results.length} failed` : `all ${results.length} passed`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const total = results.reduce((n, r) => n + r.s, 0);
    const rows = results.map((r) => `| ${r.f}.mjs | ${r.ok ? 'ok' : '**FAIL**'} | ${r.s} |`);
    const head = `### E2E shard ${name}: ${failed.length ? `${failed.length} of ${results.length} failed` : `all ${results.length} passed`} (${total}s)`;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [head, '', '| File | Result | Seconds |', '| --- | --- | ---: |', ...rows, ''].join('\n') + '\n');
    for (const r of failed)
      console.log(`::error file=tests/e2e/${r.f}.mjs,title=e2e ${r.f}.mjs failed::${r.f}.mjs failed in e2e shard ${name}: see its log, and the e2e-debug-${name} artifact for any screenshot or trace it saved`);
  }
  process.exit(failed.length ? 1 : 0);
}

const args = process.argv.slice(2);
let jobs = 1;
const jobsAt = args.indexOf('--jobs');
if (jobsAt >= 0) {
  jobs = Number(args[jobsAt + 1]);
  args.splice(jobsAt, 2);
  if (!Number.isInteger(jobs) || jobs < 1) {
    console.error('--jobs wants a whole number, 1 or more');
    process.exit(2);
  }
}
const quietAt = args.indexOf('--quiet');
if (quietAt >= 0) args.splice(quietAt, 1);
const quiet = quietAt >= 0 || process.env.E2E_QUIET === '1';
const arg = args.length === 1 ? args[0] : undefined;
if (arg === '--check') check();
else if (arg === 'all') run(all, 'all', { jobs, quiet });
else if (arg === 'buzzer') run(buzzerFiles(), 'buzzer', { jobs, quiet });
else if (arg === 'rest' || named[arg]) run(shardFiles(arg), arg, { jobs, quiet });
else {
  console.error('Usage: node scripts/e2e-shard.mjs <1–5 | rest | all | buzzer | --check> [--jobs N] [--quiet]');
  process.exit(2);
}
