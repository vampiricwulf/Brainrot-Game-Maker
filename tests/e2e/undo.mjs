// Host undo covers tiles: after scoring a clue and going back to the board, Ctrl+Z first puts the tile
// back on the board, then takes the points back; Ctrl+Shift+Z redoes both in order.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();

  const tile = page.locator('.board .tile').first();
  const used = () => tile.evaluate((e) => e.classList.contains('used'));
  const scoreOf = (i) => page.locator('.panel .p').nth(i).locator('.score').innerText();

  await tile.click();
  await page.locator('.full').waitFor();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.panel .p .score')?.textContent?.includes('200'));
  await page.keyboard.press('Escape');
  await page.locator('.board').waitFor();
  assert((await used()) && (await scoreOf(0)) === '$200', 'scored the clue and closed the tile');

  await page.keyboard.press('Control+z');
  await page.locator('.toast', { hasText: 'is back on the board' }).waitFor();
  assert(!(await used()) && (await scoreOf(0)) === '$200', 'the first Ctrl+Z puts the tile back on the board (points kept)');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.panel .p .score')?.textContent?.trim() === '$0');
  assert(!(await used()), 'the second Ctrl+Z takes the points back');

  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(() => document.querySelector('.panel .p .score')?.textContent?.includes('200'));
  assert(!(await used()), 'redo gives the points back first');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(() => document.querySelector('.board .tile')?.classList.contains('used'));
  assert(true, 'then closes the tile again');

  // Reopening by hand (right-click on the host's board) is undoable too.
  await tile.click({ button: 'right', force: true }); // played tiles are aria-disabled
  await page.waitForFunction(() => !document.querySelector('.board .tile')?.classList.contains('used'));
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForFunction(() => document.querySelector('.board .tile')?.classList.contains('used'));
  assert(true, 'a tile reopened by right-click can be closed again with ↶ Undo');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nUndo E2E passed.');
} finally {
  await browser.close();
}
