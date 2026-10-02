// Phone buzzers, both halves together: the built app hosts a game against the real buzzer room (buzzer/ under
// `wrangler dev`, local, no Cloudflare account) and two phones play on the real phone page: the queue, a wrong answer,
// → Next in line, ↺ Reset buzzers, and a tie settled with 🎲 Roll for it. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, openRules, playWithPlayers, tap, tieThem } from './helpers.mjs';

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

  // ---------- The host: buzzer mode (on the pre-game card), opened by the host ----------
  const hostCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await hostCtx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await hostCtx.newPage(), 'host');
  // The host's line to the room, passed through Playwright so the test can cut it.
  const hostTap = await tap(host);
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  await playWithPlayers(host, 2);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel('Open the buzzers').selectOption('host');
  // No negative scores: a wrong answer from a player on $0 takes nothing, but still locks them out (below).
  const neg = (await openRules(host)).getByLabel('Allow negative scores');
  await neg.uncheck();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  assert(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(code), `the app made a real room (${code})`);
  assert((await card.getByRole('link').innerText()) === `${base}/${code}`, 'the join link points at the room server');

  // ---------- Two phones join ----------
  const taps = new Map();
  const phone = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    taps.set(p, await tap(p));
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

  // ---------- The pre-game screen's room survives a reload, and going back to the editor ----------
  await small(p1).getByText('The game starts soon').waitFor();
  await host.reload();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await card.locator(`[aria-label="Room code ${code}"]`).waitFor();
  await card.getByText('2 of 2 players joined').waitFor();
  assert(true, 'a reload on the pre-game screen comes back to it, in the same room, the phones still joined');
  assert(
    (await card.getByLabel('Open the buzzers').inputValue()) === 'host' && !(await (await openRules(host)).getByLabel('Allow negative scores').isChecked()),
    'with the settings changed just before it (the buzzers open when the host says, no negative scores)',
  );
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  const bar = host.locator('.room-bar');
  await bar.waitFor();
  assert((await bar.innerText()).includes(code), `◀ Back to editor keeps the room open (the editor says "The buzzer room ${code} is still open")`);
  await small(p1).getByText('The host is setting up — hang on').waitFor();
  assert((await big(p1).innerText()) === 'Player 1', 'the phones stay in their seats: "The host is setting up — hang on"');
  await host.getByRole('button', { name: '▶ Play' }).click();
  await card.locator(`[aria-label="Room code ${code}"]`).waitFor();
  await card.getByText('2 of 2 players joined').waitFor();
  await small(p2).getByText('The game starts soon').waitFor();
  assert(true, '▶ Play goes back into the same room: same code, both phones still joined');

  // ---------- A clue: closed, then opened with U ----------
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  // The join code, small, in a corner of the stream: on the board, at the end of the score bar, never over a tile.
  const badge = host.locator('.stage-box .join-badge');
  await badge.waitFor();
  const clash = await host.evaluate(() => {
    const b = document.querySelector('.stage-box .join-badge').getBoundingClientRect();
    const hit = (el) => {
      const r = el.getBoundingClientRect();
      return r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
    };
    return [...document.querySelectorAll('.stage-box .board .tile, .stage-box .plate')].filter(hit).length;
  });
  if (process.env.SCREENSHOTS) await host.screenshot({ path: `${process.env.SCREENSHOTS}/buzzer-live-board.png` });
  assert((await badge.innerText()).includes(code) && clash === 0, 'the join code shows in a corner of the stream during the game, over no tile or score plate');
  await host.keyboard.press('k');
  await host.locator('.stage-box .cover-join').getByText(code).waitFor();
  await host.keyboard.press('k');
  assert(true, 'and on the cover card (K)');
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
  await big(p1).getByText("You're 2nd").waitFor();
  assert(/^\d\.\d\d s behind Player 2$/.test(await small(p1).innerText()), `a second buzz still counts: "You're 2nd — ${await small(p1).innerText()}"`);
  const queue = host.getByRole('list', { name: 'Buzz order' });
  await queue.locator('li', { hasText: 'Player 1' }).waitFor();
  assert((await queue.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ \+.*$/, '')).join() === '1. Player 2,2. Player 1', 'the host panel lists both, fastest first');

  // Wrong: Player 2 is locked out, and Player 1, next in the buzz order, answers at once (no new opening that a later
  // buzz could jump).
  await host.keyboard.press('Shift+Enter');
  await small(p2).getByText('Player 1 is answering').waitFor();
  await big(p2).getByText('Wait').waitFor();
  await big(p1).getByText("You're answering!").waitFor();
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 1')));
  assert(true, 'a wrong answer (on $0, nothing to take) locks Player 2 out, and Player 1, next in the buzz order, answers without buzzing again');
  // A reload mid-clue: the game comes back with Player 1 answering and Player 2 still locked out (not opened afresh).
  await host.waitForTimeout(800); // the game is saved (debounced)
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 1')));
  // (Back in the room: the phones heard the host's state again.)
  await p1.locator('#host-note').waitFor({ state: 'hidden' });
  await host.waitForTimeout(1500);
  assert(
    (await big(p1).innerText()) === "You're answering!" && (await small(p2).innerText()) === 'Player 1 is answering',
    'a host reload mid-clue keeps who is answering (the buzzers are not opened afresh)',
  );
  // Wrong too: everyone has missed it, the buzzers stay closed. ↺ Reset buzzers lets them both buzz again.
  await host.keyboard.press('Shift+Enter');
  await small(p1).getByText('You already answered this one').waitFor();
  await small(p2).getByText('You already answered this one').waitFor();
  assert((await big(p2).innerText()) !== 'BUZZ!', 'and who already missed it: Player 2 (wrong before the reload) is still locked out');
  await host.getByRole('button', { name: '↺ Reset buzzers' }).click();
  await big(p2).getByText('BUZZ!').waitFor();
  await big(p1).getByText('BUZZ!').waitFor();
  assert(true, '↺ Reset buzzers: the locked-out phones can buzz again');
  // ⏭ Skip: Player 1 (first in) passes with no points taken, and Player 2, next in the order, answers.
  const p1Score = await p1.locator('#me').innerText();
  await press(p1);
  await big(p1).getByText("You're answering!").waitFor();
  await press(p2);
  await big(p2).getByText("You're 2nd").waitFor();
  await host.getByRole('button', { name: '⏭ Skip Player 1' }).click();
  await big(p2).getByText("You're answering!").waitFor();
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 2')));
  assert((await p1.locator('#me').innerText()) === p1Score && (await small(p1).innerText()) === 'Player 2 is answering', '⏭ Skip: the one answering passes with no points taken, and the next in the buzz order answers');
  await host.keyboard.press('Enter');
  await p2.locator('#me').getByText(/^Player 2 · \$[1-9]/).waitFor();
  assert(true, 'Player 2 (locked out before the reset) buzzes in, is awarded, and their phone shows the new score');
  await big(p2).getByText('You got it!').waitFor();
  await big(p1).getByText('Player 2 got it').waitFor();
  assert((await small(p1).innerText()) === 'Wait for the next clue', 'right: "Player 2 got it" on the other phone, "You got it!" on theirs (not "Get ready…")');

  // ---------- A tie: 🎲 Roll for it sets who answers first ----------
  await host.keyboard.press('Escape');
  await host.locator('.stage-box .board .tile').nth(1).click();
  await big(p1).getByText('Get ready…').waitFor();
  await host.keyboard.press('u');
  await big(p1).getByText('BUZZ!').waitFor();
  await big(p2).getByText('BUZZ!').waitFor();
  tieThem([taps.get(p1), taps.get(p2)]);
  await press(p1);
  await press(p2);
  // The tied names come in the order their buzzes reached the room, which varies.
  await host.locator('.panel .tie', { hasText: /^Tie: Player [12] & Player [12] ·/ }).waitFor();
  await big(p1).getByText('Tie!').waitFor();
  assert((await small(p2).innerText()) === 'The host decides who goes first', 'the same reaction time is a tie: the host panel says so, both phones say "Tie! The host decides who goes first"');
  await host.getByRole('button', { name: '🎲 Roll for it' }).click();
  const won = await Promise.race([p1, p2].map((p, i) => big(p).getByText("You're answering!").waitFor({ timeout: 30_000 }).then(() => i)));
  const [rollWin, rollSecond] = won === 0 ? [p1, p2] : [p2, p1];
  await small(rollWin).getByText('You won the roll').waitFor();
  await small(rollSecond).getByText('Tie — you rolled 2nd').waitFor();
  assert((await big(rollSecond).innerText()) === "You're 2nd", `the roll sets the order: Player ${won + 1} answers, the other "You're 2nd — Tie — you rolled 2nd"`);
  await queue.getByText('🎲 2nd').waitFor();
  assert(true, 'the host panel queue shows the roll order (🎲 1st, 🎲 2nd)');
  await host.keyboard.press('Escape');

  // ---------- The host's connection drops with the buzzers open ----------
  // (Esc again, back to the board, if the first one only closed the roll.)
  for (let i = 0; i < 3 && !(await host.locator('.stage-box .board .tile').count()); i++) {
    await host.keyboard.press('Escape');
    await host.waitForTimeout(300);
  }
  await host.locator('.stage-box .board .tile').nth(2).click();
  await big(p1).getByText('Get ready…').waitFor();
  await host.keyboard.press('u');
  await big(p1).getByText('BUZZ!').waitFor();
  await big(p2).getByText('BUZZ!').waitFor();
  hostTap.blocked = true;
  hostTap.drop();
  await p1.locator('#host-note').waitFor();
  await host.locator('.phones-down').getByText('Phones not connected').waitFor();
  await host.getByRole('button', { name: '📱 ⚠ Phones not connected' }).waitFor();
  assert(true, "the host's line drops: phones are told, and the host panel says phones can't buzz (no stale \"Buzzers open\" or 2/2)");
  await press(p1);
  await big(p1).getByText("You're answering!").waitFor();
  hostTap.blocked = false;
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 1')), null, { timeout: 30_000 });
  await small(p2).getByText('Player 1 is answering').waitFor();
  await p1.locator('#host-note').waitFor({ state: 'hidden' });
  assert(true, 'back online, the host picks the player who buzzed while it was away');
  await host.keyboard.press('Escape');

  // ---------- Exit › Keep & leave keeps the room; ✕ Close the room ends it ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await small(p1).getByText('The host is setting up — hang on').waitFor();
  assert((await fetch(`${base}/api/rooms/${code}`)).status !== 404 && (await p1.locator('main').getByText('The game is over').count()) === 0, 'Keep & leave keeps the room: phones say the host is setting up (not that the game is over)');
  await host.locator('.room-bar').getByRole('button', { name: '✕ Close the room' }).click();
  await p1.locator('main').getByText('The game is over').waitFor();
  assert((await fetch(`${base}/api/rooms/${code}`)).status === 404, '✕ Close the room closes it: phones say the game is over');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Buzzer live E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
