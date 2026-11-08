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
import { addClassicRounds, checkItem, goOnCheck, openBuzzerOptions, openRules, playWithPlayers, quick, startRoomOn, tap, tieThem } from './helpers.mjs';

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
  // (The options are folded under ▸ Buzzer options.)
  await openBuzzerOptions(card);
  await card.getByLabel('Open the buzzers').selectOption('host');
  // No negative scores: a wrong answer from a player on $0 takes nothing, but still locks them out (below).
  const neg = (await openRules(host)).getByLabel('Allow negative scores');
  await neg.uncheck();
  const code = await startRoomOn(card);
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

  // ---------- A phone picks its own colour (another player's is greyed out) ----------
  await p1.getByRole('button', { name: '🎨 Change your color' }).click();
  const colours = p1.getByRole('group', { name: 'Pick your color' });
  assert(
    (await colours.getByRole('button', { name: 'sky blue (another player has it)' }).isDisabled()) &&
      (await colours.locator('[aria-pressed="true"]').count()) === 1,
    'the phone shows the colours: its own ticked, Player 2’s greyed out',
  );
  await colours.getByRole('button', { name: 'yellow', exact: true }).click();
  await p1.waitForFunction(() => getComputedStyle(document.getElementById('buzz')).getPropertyValue('--seat').trim() === '#f0e442');
  assert(await colours.isHidden(), 'picking one shuts the picker, and the phone’s buzzer turns that colour');

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
  const plate1 = host.locator('.stage-box .plate', { hasText: 'Player 1' });

  // ---------- Any other colour, from the page's own picker: on the phone's buzzer as it moves, to the host with OK ----------
  const plateColour = () => plate1.locator('.name').evaluate((e) => getComputedStyle(e).backgroundColor);
  const seatOf = (p) => p.evaluate(() => getComputedStyle(document.getElementById('buzz')).getPropertyValue('--seat').trim());
  const plateIs = (rgb) => host.waitForFunction((rgb) => [...document.querySelectorAll('.stage-box .plate')].some((p) => p.textContent.includes('Player 1') && getComputedStyle(p.querySelector('.name')).backgroundColor === rgb), rgb);
  const picker = p1.getByRole('dialog', { name: 'Pick any color' });
  const hexBox = picker.getByLabel('Hex');
  const okBtn = picker.getByRole('button', { name: 'OK' });
  const openAny = async () => {
    await p1.getByRole('button', { name: '🎨 Change your color' }).click();
    await colours.getByRole('button', { name: /^Pick any color/ }).click();
    await picker.waitFor();
  };
  assert((await plateColour()) === 'rgb(240, 228, 66)', 'Player 1’s plate on the stream is the yellow the phone picked');
  await openAny();
  assert(
    (await hexBox.inputValue()) === '#f0e442' && (await p1.evaluate(() => document.activeElement?.id)) === 'any-sq',
    '＋ Pick any color opens the page’s own picker on the player’s colour, the keys on its square',
  );
  // A drag on the square (a finger or the mouse): the buzzer follows as it moves, nothing sent.
  const sq = picker.getByRole('slider', { name: 'Color and brightness' });
  const box = await sq.boundingBox();
  await p1.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await p1.mouse.down();
  await p1.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
  const midDrag = await seatOf(p1);
  await p1.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 4 });
  await p1.mouse.up();
  const afterDrag = await seatOf(p1);
  assert(
    midDrag !== '#f0e442' && afterDrag !== midDrag && (await hexBox.inputValue()) === afterDrag && Math.abs(Number(/^Color (\d+)%/.exec(await sq.getAttribute('aria-valuetext'))?.[1]) - 80) <= 1,
    `dragging the square shows on the phone’s buzzer as it moves (${midDrag}, then ${afterDrag}), and in the Hex box`,
  );
  if (process.env.SCREENSHOTS) {
    // A phone's size, then on its side.
    await p1.setViewportSize({ width: 390, height: 844 });
    await p1.screenshot({ path: `${process.env.SCREENSHOTS}/buzzer-any-color.png` });
    await p1.setViewportSize({ width: 844, height: 390 });
    await p1.screenshot({ path: `${process.env.SCREENSHOTS}/buzzer-any-color-landscape.png` });
    await p1.setViewportSize({ width: 390, height: 760 });
  }
  // The arrow keys on the hue strip.
  const hue = picker.getByRole('slider', { name: 'Hue' });
  const h0 = Number(await hue.getAttribute('aria-valuenow'));
  await hue.focus();
  await p1.keyboard.press('Shift+ArrowRight');
  await p1.keyboard.press('ArrowRight');
  assert(Number(await hue.getAttribute('aria-valuenow')) === Math.min(360, h0 + 11) && (await seatOf(p1)) !== afterDrag, 'the arrow keys move the hue strip (Shift: ten at a time), the buzzer with it');
  await sleep(400);
  assert((await plateColour()) === 'rgb(240, 228, 66)', 'nothing is sent while it moves: the plate on the stream is still yellow');
  // Cancel: the colour they had, the palette still open.
  await picker.getByRole('button', { name: 'Cancel' }).click();
  await picker.waitFor({ state: 'hidden' });
  assert(
    (await seatOf(p1)) === '#f0e442' && (await colours.isVisible()) && (await p1.evaluate(() => document.activeElement?.dataset.own)) === '',
    'Cancel puts the yellow back on the buzzer, the palette still open and the keys back on ＋',
  );
  await p1.getByRole('button', { name: '🎨 Change your color' }).click();
  // Another player's colour can't be had: OK is off, says why; a tap off it just shuts.
  await openAny();
  await hexBox.fill('#56B4E9');
  await picker.getByText('Another player has this color').waitFor();
  assert((await okBtn.isDisabled()) && (await seatOf(p1)) === '#56b4e9', 'Player 2’s sky blue typed in: shown on the buzzer, but OK is off: "Another player has this color"');
  await p1.touchscreen.tap(195, 40);
  await picker.waitFor({ state: 'hidden' });
  await sleep(400);
  assert((await seatOf(p1)) === '#f0e442' && (await plateColour()) === 'rgb(240, 228, 66)', 'a tap off it just shuts it: still yellow, on the phone and the stream');
  // A tap off it keeps a free colour, as the browser's own picker did.
  await openAny();
  await hexBox.fill('abcdef');
  assert((await seatOf(p1)) === '#abcdef', 'six digits typed show at once');
  await p1.touchscreen.tap(195, 40);
  await picker.waitFor({ state: 'hidden' });
  await plateIs('rgb(171, 205, 239)');
  assert(await colours.isHidden(), 'a tap off it keeps the colour: the host has #abcdef, and the palette shuts');
  // OK: on the phone at once, on the stream only once it's pressed.
  await openAny();
  await hexBox.fill('#123456');
  await sleep(400);
  assert((await seatOf(p1)) === '#123456' && (await plateColour()) === 'rgb(171, 205, 239)', '#123456 typed: on the phone’s buzzer, not yet on the stream');
  await okBtn.click();
  await picker.waitFor({ state: 'hidden' });
  await plateIs('rgb(18, 52, 86)');
  assert((await seatOf(p1)) === '#123456', 'OK: the host has the colour the phone picked: Player 1’s plate on the stream is their own #123456');
  await p1.getByRole('button', { name: '🎨 Change your color' }).click();
  assert((await colours.locator('button.own[aria-pressed="true"]').count()) === 1, 'a colour of their own: the palette ticks Pick any color');
  await p1.getByRole('button', { name: '🎨 Change your color' }).click();
  assert((await host.locator('.stage-box .plate .phone').count()) === 2, 'both plates show 📱: their phones are connected');
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
  assert((await big(p1).innerText()) === 'You can still buzz' && (await small(p1).innerText()).includes('next in line'), 'the other phone is told it can still buzz to be next in line');
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 2')));
  assert((await selected()).length === 1, 'the first phone in is picked in the host panel; the other phone sees who is answering');
  await press(p1);
  await big(p1).getByText("You're 2nd").waitFor();
  assert(/^\d\.\d\d s behind Player 2$/.test(await small(p1).innerText()), `a second buzz still counts: "You're 2nd — ${await small(p1).innerText()}"`);
  const queue = host.getByRole('list', { name: 'Buzz order' });
  await queue.locator('li', { hasText: 'Player 1' }).waitFor();
  assert((await queue.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ \+.*$/, '')).join() === '1. Player 2,2. Player 1', 'the host panel lists both, fastest first');
  // The host picks Player 1 too (to give both points): that's not letting Player 2 go, so the buzzers stay shut.
  await host.keyboard.press('1');
  await host.waitForFunction(() => document.querySelectorAll('.panel .p .sel[aria-pressed="true"]').length === 2);
  await host.waitForTimeout(600);
  assert((await big(p2).innerText()) === "You're answering!" && !(await big(p1).innerText()).includes('BUZZ'), 'picking a second player while one answers doesn’t open the buzzers again');
  await host.keyboard.press('1');
  await host.waitForFunction(() => document.querySelectorAll('.panel .p .sel[aria-pressed="true"]').length === 1);

  // Wrong: Player 2 is locked out, and Player 1, next in the buzz order, answers at once (no new opening that a later
  // buzz could jump).
  await host.keyboard.press('Shift+Enter');
  await small(p2).getByText('Player 1 is answering').waitFor();
  await big(p2).getByText('Wait').waitFor();
  await big(p1).getByText("You're answering!").waitFor();
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 1')));
  assert(true, 'a wrong answer (on $0, nothing to take) locks Player 2 out, and Player 1, next in the buzz order, answers without buzzing again');
  // Undone, redone, undone, and wrong again: the buzz order stays, and Player 1 answers again (the buzzers don't open).
  const order = () => queue.locator('li').evaluateAll((ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').replace(/ \+.*$/, '').trim() + (l.classList.contains('now') ? '*' : '')).join());
  const answering = async (p, other) => {
    await big(p).getByText("You're answering!").waitFor();
    await big(other).getByText(/You're 2nd|Wait/).waitFor();
  };
  await host.keyboard.press('Control+z');
  await answering(p2, p1);
  await host.waitForFunction(() => document.querySelector('.buzz-queue li.now')?.textContent.includes('Player 2'));
  assert((await order()) === '1. Player 2*,2. Player 1', `Ctrl+Z: Player 2 answers again, the buzz order kept (${await order()})`);
  await host.keyboard.press('Control+y');
  await answering(p1, p2);
  await host.waitForFunction(() => document.querySelector('.buzz-queue li.now')?.textContent.includes('Player 1'));
  assert((await order()) === '1. Player 2,2. Player 1*', 'Ctrl+Y: Player 1 answers, the buzz order kept');
  await host.keyboard.press('Control+z');
  await answering(p2, p1);
  await host.keyboard.press('Shift+Enter');
  await p1.waitForFunction(() => /answering|BUZZ/.test(document.getElementById('buzz-big').textContent));
  assert((await big(p1).innerText()) === "You're answering!", 'wrong again after Ctrl+Z: Player 1, next in the buzz order, answers (the buzzers stay shut)');
  await host.waitForFunction(() => document.querySelector('.buzz-queue li.now')?.textContent.includes('Player 1'));
  assert((await order()) === '1. Player 2,2. Player 1*', 'and the buzz order is still there');
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
  await small(p1).getByText('You’ve had your go on this one').waitFor();
  await small(p2).getByText('You’ve had your go on this one').waitFor();
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
  await host.locator('.panel .tie', { hasText: /^Tie: Player [12] & Player [12]$/ }).waitFor();
  await big(p1).getByText('Tie!').waitFor();
  assert((await small(p2).innerText()) === 'The host decides who goes first', 'the same reaction time is a tie: the host panel says so, both phones say "Tie! The host decides who goes first"');
  // N (👁 Reveal answer) in a tie asks first: 🎲 Roll for it O ⏎, or who answers by their number; Enter rolls for it.
  await host.keyboard.press('n');
  await checkItem(host, 'tie').waitFor();
  assert((await quick(host, '🎲 Roll for it').innerText()).includes('⏎'), 'N in a tie asks first, 🎲 Roll for it (O, ⏎) its first fix');
  await goOnCheck(host, { ready: true }).waitFor();
  await host.keyboard.press('Enter');
  await goOnCheck(host).waitFor({ state: 'detached' });
  const won = await Promise.race([p1, p2].map((p, i) => big(p).getByText("You're answering!").waitFor({ timeout: 30_000 }).then(() => i)));
  const [rollWin, rollSecond] = won === 0 ? [p1, p2] : [p2, p1];
  await small(rollWin).getByText('You won the roll').waitFor();
  await small(rollSecond).getByText('Tie — you rolled 2nd').waitFor();
  assert((await big(rollSecond).innerText()) === "You're 2nd", `the roll sets the order: Player ${won + 1} answers, the other "You're 2nd — Tie — you rolled 2nd"`);
  await queue.getByText('🎲 2nd').waitFor();
  assert(true, 'the host panel queue shows the roll order (🎲 1st, 🎲 2nd)');
  await host.keyboard.press('Escape');

  // ---------- The answer shown with the buzzers open: they close ----------
  for (let i = 0; i < 3 && !(await host.locator('.stage-box .board .tile').count()); i++) {
    await host.keyboard.press('Escape');
    await host.waitForTimeout(300);
  }
  await host.locator('.stage-box .board .tile').nth(3).click();
  await big(p1).getByText('Get ready…').waitFor();
  await host.keyboard.press('u');
  await big(p1).getByText('BUZZ!').waitFor();
  await host.keyboard.press('r');
  await big(p1).getByText('Clue over').waitFor();
  await press(p1);
  await host.waitForTimeout(800);
  assert(
    (await big(p1).innerText()) === 'Clue over' && (await host.locator('.panel .p .sel[aria-pressed="true"]').count()) === 0,
    'showing the answer closes the buzzers: the phones say "Clue over", and a press then picks nobody',
  );
  await host.keyboard.press('u');
  await host.getByText('The answer is showing: the buzzers stay closed').waitFor();
  assert(true, 'and U says why they stay closed');
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

  // ---------- Exit › Keep & leave keeps the room; ⏹ Close the room… ends it ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await small(p1).getByText('The host is setting up — hang on').waitFor();
  assert((await fetch(`${base}/api/rooms/${code}`)).status !== 404 && (await p1.locator('main').getByText('The game is over').count()) === 0, 'Keep & leave keeps the room: phones say the host is setting up (not that the game is over)');
  // A phone that comes in now and waits on the seat list never saw the game start: when the room closes it's told so.
  const late = watch(await (await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true })).newPage(), 'late phone');
  await late.goto(`${base}/${code}`);
  await late.getByRole('heading', { name: 'Tap your name' }).waitFor();
  // Player 2's phone is asleep (its connection gone) when the room closes: it misses being told.
  const p2Tap = taps.get(p2);
  p2Tap.blocked = true;
  p2Tap.drop();
  // The host's line died a moment ago without a word (the Wi-Fi dropped: nothing has noticed yet) as ⏹ Close the room… is
  // pressed, so the close goes out, and nowhere; and it stays down a while. The room closes once it's back (not hours
  // later). (A line known to be down is unit-tested: remote.test.ts.)
  hostTap.blocked = true;
  hostTap.stall();
  await host.locator('.room-bar').getByRole('button', { name: '⏹ Close the room…' }).click();
  // Phones are in it: the bar asks first, as the 📱 card does, the safe answer first (with the keys).
  const closeAsk = host.locator('.status-bar').getByRole('alertdialog', { name: 'Close the room?' });
  await closeAsk.waitFor();
  assert(
    (await closeAsk.getByRole('button').allInnerTexts()).join(' | ') === 'Keep it open | Close the room' &&
      (await closeAsk.getByRole('button', { name: 'Keep it open' }).evaluate((el) => el === document.activeElement)) &&
      /2 phones are in the room: closing it sends them out, and they’d join again with a new code/.test(await closeAsk.innerText()),
    `⏹ Close the room… in the bar over the editor asks first with a phone in the room, Keep it open first (${(await closeAsk.innerText()).replace(/\s+/g, ' ')})`,
  );
  await closeAsk.getByRole('button', { name: 'Close the room' }).click();
  await host.locator('.room-bar').waitFor({ state: 'detached' });
  assert((await fetch(`${base}/api/rooms/${code}`)).status !== 404, 'pressed while the host’s line is dead: the room can’t be told yet');
  hostTap.blocked = false;
  await p1.locator('main').getByText('The game is over').waitFor({ timeout: 30_000 });
  assert((await fetch(`${base}/api/rooms/${code}`)).status === 404, '⏹ Close the room… closes it once the host’s line is back: phones say the game is over');
  await late.locator('main').getByText('The host closed this room').waitFor();
  assert(
    (await late.locator('main').innerText()).includes('If the game is still on, ask for the new code') && (await late.locator('main').getByText('The game is over').count()) === 0,
    'a phone that never saw the game start is told the host closed the room (ask for the new code), not that the game is over',
  );
  // Woken up, it finds the room gone at once: "The game is over", not "Reconnecting…" over and over.
  const p2Routes = p2Tap.routes.length;
  p2Tap.blocked = false;
  await p2.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p2.locator('main').getByText('The game is over').waitFor();
  // (Told by the room it's gone, 4004, on the connection it makes: not from the check a phone makes after a few tries.
  // Two at most: a retry starting just as it wakes is replaced.)
  const woke = p2Tap.routes.slice(p2Routes);
  assert(
    woke.length >= 1 && woke.length <= 2 && woke.some((r) => r.closed === 4004) && (await p2.locator('#overlay').isHidden()),
    `a phone asleep when the room closed says the game is over when it wakes (${woke.length} connection, closed with ${woke.map((r) => r.closed).join()}; no retrying)`,
  );

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Buzzer live E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
