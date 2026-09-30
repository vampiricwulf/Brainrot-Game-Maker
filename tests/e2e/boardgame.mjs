// Board game rounds: build a board (a loop with a fork, a Start bonus, an off-board zone), then play it: roll, move,
// pick the way at the fork, pass Start, take turns, send someone to the Shadow Realm, undo.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const toast = () => page.locator('.toast').innerText();
const tokenOn = async (name) =>
  page.evaluate((n) => {
    const t = document.querySelector(`.stage .on-board[data-player="${n}"]`);
    return t ? { x: parseFloat(t.style.left), y: parseFloat(t.style.top) } : null;
  }, name);

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Board game/ }).click();
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 12, 'a new board has a loop of 12 spaces');
  // A fork: Space 3 can also go straight to Space 7.
  await page.getByRole('button', { name: 'Space Space 3' }).click();
  await page.getByRole('button', { name: '🔗 Link to…' }).click();
  await page.getByRole('button', { name: 'Space Space 7' }).click();
  assert((await page.locator('.side').innerText()).includes('A fork'), 'linking a second way makes a fork');
  // Start gives points when passed.
  await page.getByRole('button', { name: 'Space Start' }).click();
  await page.locator('.side .actions').first().getByRole('button', { name: '＋ Add action' }).click();
  await page.getByRole('menuitem', { name: /Change the score/ }).click();
  await page.locator('.side .actions').first().getByLabel('Points').fill('100');
  await page.locator('.side .actions').first().getByLabel('Who').selectOption('party');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-editor.png` });
  // A zone.
  await page.getByRole('tab', { name: /Off-board zones/ }).click();
  await page.getByRole('button', { name: '＋ Zone' }).click();
  assert((await page.getByLabel('Zone name').inputValue()) === 'Shadow Realm', 'the first zone is the Shadow Realm');

  // Play with two players, straight to the board game.
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
  await page.locator('.bh').waitFor();
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Player 1'), 'Player 1 goes first');
  assert((await page.locator('.stage .on-board').count()) === 2, 'both tokens are on the board');

  // Roll with D: the result fills in the steps.
  await page.keyboard.press('d');
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 8000 });
  assert(true, 'D rolls the dice and fills in the steps');
  await page.keyboard.press('Escape');

  await page.getByLabel('Steps').fill('2');
  await page.getByRole('button', { name: /^▶ Move Player 1/ }).click();
  assert((await toast()).includes('Landed on Space 3'), 'moving 2 from Start lands on Space 3');
  await page.waitForTimeout(1200);
  const s3 = await tokenOn('Player 1');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-board.png` });
  assert(s3 && s3.x > 900 && s3.x < 1000, `the token walked to Space 3 (${JSON.stringify(s3)})`);

  await page.keyboard.press('n');
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Player 2'), 'N passes the turn to Player 2');
  await page.getByLabel('Steps').fill('5');
  await page.getByRole('button', { name: /^▶ Move Player 2/ }).click();
  await page.locator('.fork').waitFor();
  assert((await page.locator('.fork').innerText()).includes('at Space 3: which way? (3 to go)'), 'a move stops at the fork and asks');
  await page.locator('.fork').getByRole('button', { name: '→ Space 7' }).click();
  assert((await toast()).includes('Landed on Space 9'), 'taking the shortcut lands on Space 9');

  // Passing Start offers its action.
  await page.getByLabel('Send to').selectOption({ label: 'Space 12' });
  await page.getByLabel('Steps').fill('2');
  await page.getByRole('button', { name: /^▶ Move Player 2/ }).click();
  await page.locator('.acts').getByRole('button', { name: '+$100' }).click();
  assert((await page.locator('.bh .pc').nth(1).innerText()).includes('$100'), 'passing Start and pressing its button gives the points');

  // Ctrl+Z undoes the last move.
  await page.keyboard.press('Control+z'); // the points
  await page.keyboard.press('Control+z'); // the move
  await page.waitForTimeout(300);
  assert((await page.locator('.last').innerText()).includes('Player 2 →'), 'undo steps back through the log');

  // The Shadow Realm.
  await page.getByLabel('Send to').selectOption({ label: '🌀 Shadow Realm' });
  await page.locator('.stage .zones').waitFor();
  assert((await page.locator('.stage .zones').innerText()).includes('Shadow Realm: Player 2'), 'the board lists who is in the Shadow Realm');
  await page.getByLabel('On screen').selectOption({ label: '📺 Shadow Realm' });
  await page.locator('.stage .zone-players').waitFor();
  assert((await page.locator('.stage .zone-players').innerText()).includes('Player 2'), 'the zone can be put on screen, with its players');

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame.png` });
  console.log('boardgame: all passed');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
