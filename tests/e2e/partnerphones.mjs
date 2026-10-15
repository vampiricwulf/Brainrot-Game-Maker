// 🤝 A partner clue with phone buzzers, end to end (docs/PARTNER-CLUES-SPEC.md §8.2, §19.4): the built app hosts a game
// against the real buzzer room (buzzer/ under `wrangler dev`, local). Nobody buzzes: the phones look like the lobby, with
// who plays which part under each name (the picker's and the describer's say what's theirs), and never get the
// question's words or a card's. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

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
const persist = mkdtempSync(join(tmpdir(), 'buzzer-partner-'));
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
const big = (p) => p.locator('#buzz-big');
const small = (p) => p.locator('#buzz-small');
/** The phone's small line comes to say `text`. */
const says = (p, text) => p.waitForFunction((t) => document.getElementById('buzz-small')?.textContent === t, text, { timeout: 8000 }).then(() => true, () => false);

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

  // ---------- The host: Category 1 $400 a partner clue with a card, 3 players, a room ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await ctx.newPage(), 'host');
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  await host.locator('[data-tile="0,1"]').click();
  const dialog = host.getByRole('dialog', { name: 'Edit clue' });
  await dialog.locator('select').first().selectOption('partner');
  await dialog.locator('[data-field="q"]').fill('Describe this movie quietly-qq');
  await dialog.locator('[data-field="a"]').fill('Shrek');
  await dialog.locator('[data-field="card"]').fill('Card-only-zz words');
  await host.getByRole('button', { name: 'Done' }).click();
  await playWithPlayers(host, 3);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  const join = async (name, seat) => {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx2.newPage(), name);
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat }).click();
    await p.locator('#me').getByText(seat).waitFor();
    return p;
  };
  const ann = await join('ann', 'Player 1');
  const bob = await join('bob', 'Player 2');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.keyboard.press('p');
  await host.keyboard.press('1');

  // ---------- PARTNER UP! ----------
  await host.locator('.stage-box .tile[aria-label^="Category 1 for $400"]').click();
  await host.locator('.stage-box [data-partner-up]').waitFor();
  assert(await says(ann, '🤝 Your partner clue! Spinning for your partner…'), 'the picker’s phone: “🤝 Your partner clue! Spinning for your partner…”');
  assert(await says(bob, '🤝 Partner clue: Player 1 needs a partner…'), 'the others: “🤝 Partner clue: Player 1 needs a partner…”');
  assert((await big(ann).innerText()) === 'Player 1' && (await big(bob).innerText()) === 'Player 2', 'each phone shows its player’s name as the big line, as in the lobby');
  assert((await host.locator('.stage-box .join-badge').count()) === 0, 'no join code over PARTNER UP! (nobody buzzes)');
  await host.keyboard.press('2');
  assert(await says(ann, '🤝 You two play this one!') && (await says(bob, '🤝 You two play this one!')), 'paired: both phones say “🤝 You two play this one!”');

  // ---------- The question ----------
  await host.keyboard.press('Enter');
  await host.locator('.stage-box [data-partner-badge]').waitFor();
  assert(await says(bob, '🗣 You’re describing!'), 'the describer’s phone: “🗣 You’re describing!”');
  assert(await says(ann, '🤝 Player 2 describes → Player 1 guesses'), 'the guesser’s: who plays which part');
  // A tap does nothing: nobody buzzes on a partner clue.
  await ann.locator('#buzz').tap();
  await sleep(600);
  assert((await host.locator('.panel .status').innerText()).includes('hand out the cards') && (await host.locator('.stage-box .bell').count()) === 0, 'a tap on a phone does nothing (nobody is answering)');
  for (const [p, name] of [[ann, 'the guesser'], [bob, 'the describer']]) {
    const words = await p.locator('body').innerText();
    assert(!words.includes('quietly-qq') && !words.includes('Card-only-zz'), `${name}’s phone gets no question words and no card`);
  }
  // ⏱ Start the clock, then ✔ Got it (Enter, each a moment after the step before): every phone says how it went.
  await sleep(1100);
  await host.keyboard.press('Enter');
  await host.locator('.stage-box .timer').waitFor();
  await sleep(1100);
  await host.keyboard.press('Enter');
  assert(
    (await says(ann, '✔ Got it! Player 2 +$400 · Player 1 +$200')) && (await says(bob, '✔ Got it! Player 2 +$400 · Player 1 +$200')),
    'judged: every phone says “✔ Got it! Player 2 +$400 · Player 1 +$200”',
  );
  await host.keyboard.press('r');
  assert(await says(bob, '🤝 Player 2 described → Player 1 guessed'), 'the answer up: “🤝 Player 2 described → Player 1 guessed”');
  await host.keyboard.press('Escape');
  assert(await says(ann, 'Your pick! Tell the host which clue'), 'back on the board, the phones are as before');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner clue phones E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
