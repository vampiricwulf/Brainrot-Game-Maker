// Wagers from phones, end to end: the built app hosts a game against the real buzzer room (buzzer/ under `wrangler dev`,
// local), with the audience window open, and players send their wagers from the real phone page. A Daily Double: its
// player's phone sends the wager (refused over the max once the host turns the limit on), the host's box fills in
// marked 📱, the others see who is wagering, and it locks when the question shows. A Final: two phones wager, change
// their minds, one reloads, the host changes one, and Show question locks them; the audience window never has an
// amount on it. Then a team: anyone on it sends the team's wager, and the host sees who. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, mainButton, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const dir = resolve('buzzer');
if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await freePort();
const inspector = await freePort();
const persist = mkdtempSync(join(tmpdir(), 'buzzer-wagers-'));
const base = `http://127.0.0.1:${port}`;
let log = '';
const wrangler = spawn(
  join(dir, 'node_modules/.bin/wrangler'),
  ['dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', persist, '--log-level', 'warn'],
  { cwd: dir, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } },
);
wrangler.stdout.on('data', (d) => (log += d));
wrangler.stderr.on('data', (d) => (log += d));
const stopWrangler = () => {
  try {
    process.kill(-wrangler.pid, 'SIGTERM');
  } catch {
    // already gone
  }
};
process.on('exit', stopWrangler);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

let browser;
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
};
const shot = async (name, p) => shots && (await p.screenshot({ path: `${shots}/${name}.png` }));

/** A host window with the buzzer server set, on a new game with a Jeopardy board and a Final. */
async function newHost(viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await ctx.newPage(), 'host');
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  return host;
}

/** Buzzer mode on (Teams too with `teams`), the room started: its code. */
async function startRoom(host, teams = false) {
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel('Open the buzzers').selectOption('host');
  if (teams) await card.getByLabel(/Teams: people join a team/).check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  return (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
}

async function phonePage(code, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
  const p = watch(await ctx.newPage(), name);
  await p.goto(`${base}/${code}`);
  return p;
}

const big = (p) => p.locator('#buzz-big');
const small = (p) => p.locator('#buzz-small');
const form = (p) => p.locator('#wager-form');
/** Type a wager on a phone and send it. */
async function sendWager(p, amount) {
  await p.locator('#wager-in').fill(String(amount));
  await p.locator('#wager-send').click();
}
const text = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
/** Every amount in `amounts` is missing from the page's text (in any of the ways it could be written). */
async function noneOf(p, amounts) {
  const t = await text(p);
  return amounts.every((n) => !t.includes(String(n)) && !t.includes(n.toLocaleString('en-US')));
}

try {
  for (let i = 0; ; i++) {
    if (wrangler.exitCode !== null) throw new Error('wrangler dev exited:\n' + log);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 120) throw new Error('wrangler dev never came up:\n' + log);
    await sleep(500);
  }
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await chromium.launch({ executablePath });

  // ---------- The host: a Daily Double on the board, 3 players, the audience window ----------
  const host = await newHost();
  await host.locator('.tile').nth(3).click();
  await host.getByRole('combobox', { name: /^Type/ }).selectOption('dailyDouble');
  await host.getByRole('button', { name: 'Done' }).click();
  await playWithPlayers(host, 3);
  const code = await startRoom(host);
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  watch(aud, 'audience');

  // Ann and Bo join from their phones (Player 3 has none).
  const join = async (name, seat) => {
    const p = await phonePage(code, name);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat }).click();
    await p.locator('#me').getByText(seat).waitFor();
    return p;
  };
  const ann = await join('ann', 'Player 1');
  const bo = await join('bo', 'Player 2');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();

  // ---------- A Daily Double ----------
  await host.locator('.stage-box .board .tile').nth(3).click();
  const dd = host.locator('.panel .dd', { hasText: 'Who found it?' });
  await dd.waitFor();
  assert((await form(ann).isHidden()) && (await form(bo).isHidden()), 'nobody picked for the Daily Double yet: no phone has a wager box');
  assert((await dd.innerText()).includes('Who found it? Pick a player.'), 'the host is asked “Who found it? Pick a player.”');
  assert(await dd.getByRole('button', { name: 'True Daily Double' }).isDisabled(), 'True Daily Double is off (with no amount) until a player is picked');
  assert((await dd.locator('[data-dd-phones]').innerText()).includes('Once you pick them'), 'the phones’ line is there from the start (the box doesn’t grow as a wager comes in)');
  const ddBox = async () => Math.round((await dd.boundingBox()).height);
  const ddH = await ddBox();
  await dd.locator('.chip', { hasText: 'Player 1' }).click();
  await form(ann).waitFor();
  assert((await ann.locator('#wager-head').innerText()) === 'Daily Double: your wager', 'the player who found it gets a wager box on their phone');
  assert((await ann.locator('#wager-info').innerText()).includes('Max $1,000 (not enforced)'), `with their score and the max, not enforced while the host ignores the limit (${await ann.locator('#wager-info').innerText()})`);
  await big(bo).getByText('Player 1 is wagering…').waitFor();
  assert(true, 'the other phones see "Player 1 is wagering…"');
  await dd.getByText('📱 waiting…').waitFor();
  assert(true, 'the host sees the phone can send it ("📱 waiting…")');

  // The host turns the limit on: over the max is refused, with a clear message, and nothing reaches the host.
  await dd.getByLabel('Ignore the limit').uncheck();
  await ann.waitForFunction(() => document.getElementById('wager-info').textContent === 'Score $0 · Max $1,000');
  await sendWager(ann, 5000);
  await ann.locator('#wager-err').getByText('over your max of $1,000').waitFor();
  assert((await dd.locator('input[type=number]').inputValue()) === '', 'the limit on: a wager over the max is refused on the phone ("That’s over your max of $1,000")');
  // Within it: the host's box fills in, marked 📱.
  await sendWager(ann, 777);
  await ann.locator('#wager-state').getByText('✔ Sent: $777').waitFor();
  await host.waitForFunction(() => document.querySelector('.dd input[type=number]')?.value === '777');
  await dd.getByText('📱 from phone').waitFor();
  assert(true, 'sent from the phone: the host’s wager box fills in (777) marked “📱 from phone”, and the phone says “✔ Sent: $777”');
  assert((await ddBox()) === ddH, `the Daily Double box keeps its height from the pick to the phone’s wager (${ddH}px)`);
  await shot('pw-1-dd-host', host);
  await shot('pw-2-dd-phone', ann);
  assert(await noneOf(aud, [777]), 'the audience window has no sign of the amount');
  assert(await noneOf(bo, [777]), 'nor does the other phone');
  // The host types over it: it's the host's.
  await dd.locator('input[type=number]').fill('600');
  await dd.getByText('📱 from phone').waitFor({ state: 'detached' });
  await ann.locator('#wager-state').getByText('The host has your wager as $600').waitFor();
  assert(true, 'the host types over it: the 📱 mark goes, and the phone shows the host’s amount');
  await sendWager(ann, 700);
  await host.waitForFunction(() => document.querySelector('.dd input[type=number]')?.value === '700');
  await mainButton(host).click();
  await big(ann).getByText('Wager locked').waitFor();
  assert((await small(ann).innerText()) === '$700', 'Show question locks it: the phone says “Wager locked $700”');
  assert(await noneOf(aud, [700, 777]), 'the audience window still has no amount (until the host shows the wager)');
  // Right: Player 1 has 700 to wager in the Final.
  await host.getByRole('button', { name: 'Right: Player 1 +$700' }).click();
  await ann.locator('#me').getByText('Player 1 · $700').waitFor();
  await host.keyboard.press('Escape');

  // ---------- The Final: both phones wager ----------
  await host.waitForTimeout(450);
  await host.locator('.rn > button').last().click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Yes', exact: true }).click();
  await host.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await host.locator('.panel .status').innerText()).includes('Title card')) await host.keyboard.press('n');
  const rows = host.locator('.fj .wagers');
  await rows.waitFor();
  const row = (name) => rows.locator('.wrow', { hasText: name });
  const box = (name) => row(name).locator('input[data-wager]');
  await form(ann).waitFor();
  await form(bo).waitFor();
  assert((await ann.locator('#wager-head').innerText()) === 'Final: your wager', 'the Final’s wager screen: every phone in it gets its wager box');
  await row('Player 1').getByText('📱 waiting…').waitFor();
  assert(
    (await row('Player 2').getByText('📱 can still send').count()) === 1 && (await row('Player 3').getByText('📱').count()) === 0,
    'the host sees whose phone can send one (“📱 waiting…”, or “📱 can still send” over the 0 filled in for nothing to wager); a player without a phone has no 📱',
  );

  // Ticked out: their phone says so; back in, the box is back.
  await row('Player 2').locator('input[data-plays]').uncheck();
  await big(bo).getByText('You sit this one out').waitFor();
  await row('Player 2').locator('input[data-plays]').check();
  await form(bo).waitFor();
  assert(true, 'a player ticked out sees “You sit this one out” on their phone (ticked back in, the box is back)');
  await sendWager(ann, 1234);
  await row('Player 1').getByText('📱 $1,234 from phone ✔').waitFor();
  assert((await box('Player 1').inputValue()) === '1234', 'Player 1’s wager comes in from their phone: “📱 $1,234 from phone ✔”, in their box');
  await sendWager(bo, 2222);
  await row('Player 2').getByText('📱 $2,222 from phone ✔').waitFor();
  await host.waitForTimeout(300);
  assert(await noneOf(aud, [1234, 2222]), 'the audience window never has the amounts (only the ✔ that a wager is in)');
  assert((await noneOf(ann, [2222])) && (await noneOf(bo, [1234])), 'each phone has its own amount only');
  await shot('pw-3-final-host', host);
  await shot('pw-4-final-audience', aud);

  // A change of mind before the host locks: the host's box follows, as a named step.
  await sendWager(ann, 1300);
  await row('Player 1').getByText('📱 $1,300 from phone ✔').waitFor();
  const undo = await host.getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  assert(undo.startsWith('Undo: Player 1’s wager (from their phone): $1,234 → $1,300'), `a late change before the lock: the host's box follows, one step (${undo})`);
  // A phone reload shows its own wager again.
  await ann.reload();
  await ann.locator('#wager-state').getByText('✔ Sent: $1,300').waitFor();
  assert((await ann.locator('#wager-in').inputValue()) === '1300', 'a phone reload comes back to its own wager');
  // The host changes Player 2's: it's the host's now (the phone says so).
  await box('Player 2').fill('2000');
  await box('Player 3').fill('5');
  await box('Player 3').press('Tab');
  assert(
    (await row('Player 2').getByText('from phone').count()) === 0 && (await row('Player 2').getByText('📱 can still send').count()) === 1,
    'the host changes a wager a phone sent: it’s the host’s now (no “from phone”)',
  );
  await bo.locator('#wager-state').getByText('The host has your wager as $2,000').waitFor();
  assert(true, 'and that phone shows the host’s amount');
  await shot('pw-5-final-phone', ann);

  // Show question: locked.
  await mainButton(host).click();
  await big(ann).getByText('Wager locked').waitFor();
  assert((await small(ann).innerText()) === '$1,300' && (await form(ann).isHidden()), 'Show question locks the wagers: “Wager locked $1,300”, no box to change it');
  await big(bo).getByText('Wager locked').waitFor();
  assert((await small(bo).innerText()) === '$2,000', 'the host’s change is what was locked in');
  assert(await noneOf(aud, [1234, 1300, 2000, 2222]), 'the audience window still has no amount once the question is up');
  await shot('pw-6-locked-phone', ann);

  // ---------- Teams: one wager per team, anyone on it sends it ----------
  const host2 = await newHost();
  await playWithPlayers(host2, 2);
  const code2 = await startRoom(host2, true);
  const member = async (name, team) => {
    const p = await phonePage(code2, name);
    await p.getByRole('heading', { name: 'Pick your team' }).waitFor();
    await p.getByRole('button', { name: team }).click();
    await p.getByRole('textbox', { name: 'Name for your team' }).fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(`${name} · ${team}`).waitFor();
    return p;
  };
  const al = await member('Al', 'Player 1');
  const amy = await member('Amy', 'Player 1');
  const cy = await member('Cy', 'Player 2');
  await host2.getByRole('button', { name: 'Start game ▶' }).click();
  await host2.getByRole('button', { name: 'Skip intro' }).click();
  await host2.waitForTimeout(450);
  await host2.locator('.rn > button').last().click();
  await host2.waitForTimeout(450);
  await host2.getByRole('button', { name: 'Yes', exact: true }).click();
  await host2.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await host2.locator('.panel .status').innerText()).includes('Title card')) await host2.keyboard.press('n');
  const rows2 = host2.locator('.fj .wagers');
  await rows2.waitFor();
  await form(al).waitFor();
  assert((await al.locator('#wager-head').innerText()) === 'Final: your team’s wager', 'teams: every member’s phone gets the team’s wager box');
  await sendWager(al, 300);
  await rows2.locator('.wrow', { hasText: 'Player 1' }).getByText('📱 $300 from phone ✔ · sent by Al').waitFor();
  await amy.locator('#wager-state').getByText('✔ Al sent $300 for your team').waitFor();
  assert(await noneOf(cy, [300]), 'Al sends the team’s wager: the host sees “sent by Al”, his teammate sees it, the other team doesn’t');
  await sendWager(amy, 450);
  await rows2.locator('.wrow', { hasText: 'Player 1' }).getByText('📱 $450 from phone ✔ · sent by Amy').waitFor();
  await al.locator('#wager-state').getByText('✔ Amy sent $450 for your team').waitFor();
  assert((await al.locator('#wager-in').inputValue()) === '450', 'a teammate changes it: still one wager for the team, and every member sees the new one');
  await shot('pw-7-team-phone', al);
  await shot('pw-8-team-host', host2);

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Phone wagers E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
