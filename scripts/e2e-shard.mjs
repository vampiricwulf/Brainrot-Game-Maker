// Which end-to-end files each CI e2e job runs (.github/workflows/build.yml), and the runner for them.
//
//   node scripts/e2e-shard.mjs <shard>   run the shard's files one after another (1–5, or rest)
//   node scripts/e2e-shard.mjs all       run every file (npm run test:e2e)
//   node scripts/e2e-shard.mjs buzzer    run the files that start a local buzzer server (npm run test:buzzer)
//   node scripts/e2e-shard.mjs hostlayout smoke   run the files named (hostlayout, hostlayout.mjs or
//                                        tests/e2e/hostlayout.mjs), with --quiet and --jobs as for a shard
//   node scripts/e2e-shard.mjs --check   prove the layout below is sound (the build job runs it)
//
//   --jobs N   run up to N files at once (default 1, one after another). Each file's output is then held back and
//              printed whole when it ends (with --quiet too), so files never mix their lines; the results still come in
//              the list's order.
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
// these shards, and every file uses appFile() and failureShots() from helpers.mjs, and helpers.mjs's assert, sleep,
// until, section, launchChromium(), startBuzzer() and resultsPath() rather than a copy of its own.
//
// Before a run it checks that dist/index.html is newer than the source (unless APP_FILE is set). Just before each file
// runs, its own failure pictures and trace from an earlier run (<name>-failure.png, <name>-<page>-failure.png,
// <name>-trace.zip in failureDir()) are deleted, so a picture there is always from the latest run of its file; exports
// and other files' pictures are left. Each file's Chromium
// gets tests/e2e/fonts.conf (CI's fonts, no Inter) unless FONTCONFIG_FILE is set: helpers.mjs sets it.
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { appFile, failureDir } from '../tests/e2e/helpers.mjs';
import { leftoversOf, parseTargets } from './e2e-targets.mjs';

const SHARDS = {
  1: 'phonecopies cardrounds partnerplay cardsend history playfeatures buzzerlive convert slidesround dealcaptain rpg touchsize',
  2: 'hostlayout boardgame remotebuzz partnersend boardedit partnerteams partnerrandom deal editorfixes multislide autosend hostroom',
  3: 'smoke audio save videoedit buzzerfiles themes goon editormedia lists everyone links phonepanel',
  4: 'stream editorfeatures hosting partnerjudge pregame board finalcards datasafety dealwheel playcopies update boardimages',
  5: 'buzzerroom desktop fullshow layers cardlimits phonewager phonecards savedcards partnerphones channel rounds pass',
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
  // A run deletes `<name>-…-failure.png` before it runs <name>.mjs: a hyphen in a name could take another file's.
  for (const f of all) if (f.includes('-')) bad.push(`${f}.mjs has a hyphen in its name: a run of it could delete another file's failure pictures`);
  // Every file opens the app through appFile() (which refuses a stale build) and leaves failure pictures through
  // failureShots() (where CI uploads them), so a file copied from an old one can't bring the old ways back.
  for (const f of all) {
    const src = readFileSync(new URL(`tests/e2e/${f}.mjs`, root), 'utf8');
    if (/process\.env\.APP_FILE|dist\/index\.html/.test(src)) bad.push(`${f}.mjs reads APP_FILE or dist/index.html itself: use appFile()`);
    if (/newPage\(/.test(src) && !/failureShots\(/.test(src)) bad.push(`${f}.mjs opens pages but never calls failureShots()`);
    if (/process\.env\.SHOTS\b[^\n]*failure/.test(src)) bad.push(`${f}.mjs takes its failure picture only when SHOTS is set: use failureShots()`);
    // The small shared steps too, so a fix to one (what a failure prints, how Chromium starts) reaches every file.
    if (/^\s*(?:async\s+)?function (assert|assertEq|sleep|section)\b|^\s*const (assert|assertEq|sleep|section) = /m.test(src))
      bad.push(`${f}.mjs has its own ${RegExp.$1 || RegExp.$2}(): use the one in helpers.mjs`);
    if (/^\s*(?:async\s+)?function until\b|^\s*const until = async\b/m.test(src))
      bad.push(`${f}.mjs has its own until() loop: use until() or untilWith() from helpers.mjs`);
    if (/CHROMIUM_PATH|chromium\.launch\(/.test(src)) bad.push(`${f}.mjs launches Chromium itself: use launchChromium()`);
    if (/node_modules\/\.bin\/wrangler/.test(src)) bad.push(`${f}.mjs starts the buzzer server itself: use startBuzzer()`);
    // A path like 'test-results/x.json' is relative to wherever the file is run from: resultsPath() is the repo's.
    if (/['"`]test-results\b/.test(src)) bad.push(`${f}.mjs names test-results/ itself: use resultsPath() from helpers.mjs`);
    // (Not checked, on purpose: a raw class such as '.panel .status' where a hook helper such as statusLineIn() would
    // do. Tests move onto the helpers as they're touched; see "Writing an e2e file" in docs/development.md.)
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
function runFile(f, held, children, logs) {
  return new Promise((done) => {
    const t0 = Date.now();
    if (!held) console.log(`\n▶ ${f}.mjs`);
    const shots = failureDir();
    for (const n of leftoversOf(f, readdirSync(shots))) rmSync(join(shots, n), { force: true });
    const log = held && join(mkdtempSync(join(tmpdir(), 'e2e-out-')), `${f}.log`);
    if (held) logs.add(dirname(log));
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
        logs.delete(dirname(log));
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
  const logs = new Set();
  // Stopped (Ctrl+C, or a kill): the files running now are stopped too, so none is left behind with its browser or
  // buzzer server, and their held output is deleted.
  for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => {
      for (const c of children) c.kill(sig);
      for (const d of logs) rmSync(d, { recursive: true, force: true });
      process.exit(1);
    });
  const results = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const r = await runFile(files[i], held, children, logs);
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
    const head = `### E2E ${name}: ${failed.length ? `${failed.length} of ${results.length} failed` : `all ${results.length} passed`} (${total}s)`;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [head, '', '| File | Result | Seconds |', '| --- | --- | ---: |', ...rows, ''].join('\n') + '\n');
    for (const r of failed)
      console.log(
        `::error file=tests/e2e/${r.f}.mjs,title=e2e ${r.f}.mjs failed::${r.f}.mjs failed in e2e ${name}: see its log, and the ${name.startsWith('shard ') ? `e2e-debug-${name.slice(6)}` : 'e2e-debug'} artifact for any screenshot or trace it saved`,
      );
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
const want = parseTargets(args, { all, shards: Object.keys(SHARDS), notTests: NOT_TESTS });
if ('check' in want) check();
else if ('files' in want) run(want.files, want.files.join(', '), { jobs, quiet });
else if ('target' in want) {
  const t = want.target;
  run(t === 'all' ? all : t === 'buzzer' ? buzzerFiles() : shardFiles(t), `shard ${t}`, { jobs, quiet });
} else {
  if (want.error) console.error(want.error);
  console.error('Usage: node scripts/e2e-shard.mjs <1–5 | rest | all | buzzer | file… | --check> [--jobs N] [--quiet]');
  process.exit(2);
}
