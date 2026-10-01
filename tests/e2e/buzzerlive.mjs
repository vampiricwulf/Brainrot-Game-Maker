// Phone buzzers, both halves together: the built app hosts a game against the real buzzer room (buzzer/ under
// `wrangler dev`, local, no Cloudflare account) and two phones play on the real phone page. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const dir = resolve('buzzer');
if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');

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
const persist = mkdtempSync(join(tmpdir(), 'buzzer-live-'));
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

  // ---------- The host: buzzer mode, opened by the host, phones ----------
  const hostCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await hostCtx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await hostCtx.newPage(), 'host');
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  await host.getByRole('button', { name: '⚙ Setup & Players' }).click();
  for (let i = 0; i < 2; i++) await host.getByRole('button', { name: '＋ Add player' }).click();
  await host.getByLabel(/Buzzer mode/).check();
  await host.getByLabel('Open the buzzers').selectOption('host');
  await host.getByLabel('Players buzz from').selectOption('phones');
  await host.getByRole('button', { name: '▶ Play' }).click();
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  assert(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(code), `the app made a real room (${code})`);
  assert((await card.getByRole('link').innerText()) === `${base}/${code}`, 'the join link points at the room server');

  // ---------- Two phones join ----------
  const phone = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name }).click();
    await p.locator('#me').getByText(name).waitFor();
    return p;
  };
  const p1 = await phone('Player 1');
  const p2 = await phone('Player 2');
  await card.getByText('2 of 2 players joined').waitFor();
  assert(true, 'both phones took their seats and the host sees them joined');

  const big = (p) => p.locator('#buzz-big');
  const small = (p) => p.locator('#buzz-small');
  const press = (p) => p.locator('#buzz').dispatchEvent('pointerdown');
  const selected = () => host.locator('.panel .p .sel[aria-pressed="true"]').allInnerTexts();

  // ---------- A clue: closed, then opened with U ----------
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.locator('.stage-box .board .tile').first().click();
  await big(p1).getByText('Get ready…').waitFor();
  assert(true, 'opening a clue tells the phones to get ready (buzzers still closed)');
  await host.keyboard.press('u');
  await big(p1).getByText('BUZZ!').waitFor();
  await big(p2).getByText('BUZZ!').waitFor();
  assert(true, 'U opens the buzzers on both phones');

  // Player 2 buzzes first.
  await press(p2);
  await big(p2).getByText("You're answering!").waitFor();
  await small(p1).getByText('Player 2 is answering').waitFor();
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 2')));
  assert((await selected()).length === 1, 'the first phone in is picked in the host panel; the other phone sees who is answering');
  await press(p1);
  await big(p1).getByText('Too late').waitFor();
  assert(true, 'a second buzz is too late');

  // Wrong: Player 2 is locked out, the buzzers open again for Player 1.
  await host.keyboard.press('Shift+Enter');
  await small(p2).getByText('You already answered this one').waitFor();
  await big(p1).getByText('BUZZ!').waitFor();
  assert(true, 'a wrong answer locks Player 2 out and reopens the buzzers for Player 1');
  await press(p1);
  await big(p1).getByText("You're answering!").waitFor();
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 1')));
  await host.keyboard.press('Enter');
  await p1.locator('#me').getByText('200').waitFor();
  assert(true, 'Player 1 buzzes in, is awarded, and their phone shows the new score');

  // ---------- Exit ends the room ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Leave', exact: true }).click();
  await p1.getByText('The game is over').waitFor();
  assert((await fetch(`${base}/api/rooms/${code}`)).status === 404, 'Exit closes the room: phones say the game is over');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Buzzer live E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
