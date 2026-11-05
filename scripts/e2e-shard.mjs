// Which end-to-end files each CI e2e job runs (.github/workflows/build.yml), and the runner for them.
//
//   node scripts/e2e-shard.mjs <shard>   run the shard's files one after another (1–5, or rest)
//   node scripts/e2e-shard.mjs all       run every file (npm run test:e2e)
//   node scripts/e2e-shard.mjs --check   prove the layout below is sound (the build job runs it)
//
// A run goes on past a failing file, prints each file's result and time, and exits 1 if any failed. The named shards
// hold about six minutes of tests each (from a full run's times); rest is every tests/e2e/*.mjs file they don't list,
// so a new file always runs somewhere. When a shard grows past about eight minutes, move a file to another one here.
// --check fails unless every named file exists, no file is in two shards, and build.yml's e2e matrix runs exactly
// these shards.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

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
  if (bad.length) {
    console.error(bad.join('\n'));
    process.exit(1);
  }
  console.log(`e2e shards: ${want.map((s) => `${s} (${shardFiles(s).length})`).join(', ')}; ${all.length} files, each once`);
}

function run(files) {
  const results = [];
  for (const f of files) {
    const t0 = Date.now();
    console.log(`\n▶ ${f}.mjs`);
    const r = spawnSync(process.execPath, [`tests/e2e/${f}.mjs`], { cwd: root, stdio: 'inherit' });
    results.push({ f, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) });
  }
  console.log('\nE2E results:');
  for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.f}.mjs ${r.s}s`);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `${failed.length} of ${results.length} failed` : `all ${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

const arg = process.argv[2];
if (arg === '--check') check();
else if (arg === 'all') run(all);
else if (arg === 'rest' || named[arg]) run(shardFiles(arg));
else {
  console.error('Usage: node scripts/e2e-shard.mjs <1–5 | rest | all | --check>');
  process.exit(2);
}
