// Takes the README's screenshots (docs/screenshots/*.png) by building a small sample game in the built app.
// Run: npm run build && node scripts/screenshots.mjs
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { playWithPlayers } from '../tests/e2e/helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const out = resolve('docs/screenshots');
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('  📸', name);
};
const addRound = async (mode) => {
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: mode }).click();
};
const nextRound = async () => {
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: /▶$/ }).filter({ hasText: /Next round|Adventure|Board game|Final/ }).last().click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
};

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.getByLabel('Game title').fill('Brainrot Night');
  await shot('first-round');

  // A Jeopardy board with named categories, and a Final.
  await page.locator('.first-round').getByRole('button', { name: /Jeopardy board/ }).click();
  const cats = ['Memes', 'Skibidi Lore', 'Minecraft', 'Rizz', 'Speedruns', 'Anime'];
  for (const [i, c] of cats.entries()) await page.locator('.cat textarea').nth(i).fill(c);
  // The Memes column's clues, typed the keyboard way (Tab to the answer, Ctrl+Enter to the next clue).
  const clues = [
    ['This frog says “feels good man”', 'Who is Pepe?'],
    ['The dance a certain toilet is famous for', 'What is the Skibidi?'],
    ['“Is this a ___?” (a butterfly)', 'What is a pigeon?'],
    ['The dog on a Shiba coin', 'Who is Doge?'],
    ['Rick Astley never will', 'What is give you up?'],
  ];
  await page.locator('.tile').first().click();
  for (const [i, [q, a]] of clues.entries()) {
    await page.keyboard.type(q);
    await page.keyboard.press('Tab');
    await page.keyboard.type(a);
    if (i < clues.length - 1) await page.keyboard.press('Control+Enter');
  }
  await page.getByRole('button', { name: 'Done' }).click();
  await addRound(/Final Jeopardy/);
  await page.locator('nav > button.round-tab').first().click();
  await shot('editor');

  // Stats and an item, for the RPG and board game.
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  await page.getByRole('button', { name: /Gold \(currency/ }).click();
  await page.getByRole('button', { name: '＋ Item', exact: true }).click();
  await page.getByLabel('Item name').fill('Potion');

  // An RPG world: a few screens on the map.
  await addRound(/RPG/);
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  await page.getByRole('button', { name: 'Add a screen at column 2, row 2' }).click();
  await page.getByRole('button', { name: 'Add a screen at column 3, row 2' }).click();
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await shot('rpg-editor');

  // A board game.
  await addRound(/Board game/);
  await page.getByRole('button', { name: 'Space Start' }).click();
  await shot('boardgame-editor');

  // Every change so far, in the History tab.
  await page.getByRole('button', { name: /History/ }).first().click();
  await shot('history');

  // Play with three players.
  await playWithPlayers(page, 3);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // Some points, and a used tile.
  for (const [i, v] of [
    [0, '1200'],
    [1, '800'],
    [2, '400'],
  ]) {
    await page.locator('.panel .p').nth(i).locator('.score').click();
    await page.locator('.panel .p').nth(i).locator('input').fill(v);
    await page.keyboard.press('Enter');
  }
  await shot('play-board');
  // Memes, $600.
  await page.locator('.stage .tile').nth(12).click();
  await page.waitForTimeout(600);
  await shot('play-clue');
  await page.keyboard.press('Escape');

  // Two wheels at once.
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  await page.getByRole('button', { name: '🎯 Pick a player', exact: true }).click();
  await page.getByLabel('Spin another wheel too').selectOption({ label: '🎯 Pick a player' });
  await page.locator('.tc').getByRole('button', { name: 'Spin!' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.stage .many .chip').length === 2, null, { timeout: 15000 });
  await shot('wheels');
  await page.keyboard.press('Escape');

  // The RPG round.
  await nextRound();
  await page.locator('.rh').waitFor();
  await page.getByRole('button', { name: 'Go East', exact: true }).click();
  await page.waitForTimeout(700);
  await shot('play-rpg');

  // The board game.
  await nextRound();
  await page.locator('.bh').waitFor();
  await page.getByLabel('Steps').fill('3');
  await page.getByRole('button', { name: /^▶ Move/ }).click();
  await page.waitForTimeout(1600);
  await shot('play-boardgame');
  console.log('screenshots: done');
} catch (e) {
  await page.screenshot({ path: `${out}/_failure.png` }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
