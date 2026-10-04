// A slides round: an introduction of several slides, in one round. The host makes it in the editor (it goes first),
// then plays through it with N (Shift+N back) and goes on to the board after the last slide.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

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
const roundNames = async () => (await page.locator('nav > button.round-tab').allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Slides/ }).click();
  assert((await roundNames()).join('|') === 'Introduction|Jeopardy!|Final Jeopardy!', `the first slides round is the introduction: it goes first (${(await roundNames()).join(', ')})`);
  const text = page.locator('main [data-field="q"]');
  await text.fill('Welcome to the show');
  await page.getByRole('button', { name: '＋ Add slide' }).click();
  await page.getByRole('tab', { name: 'Slide 2' }).waitFor();
  assert((await page.getByRole('tab', { name: /Answer/ }).count()) === 0, 'its tabs are Slide 1, Slide 2 (no Answer)');
  await text.fill('Rules: be nice');
  await page.getByRole('tab', { name: 'Slide 1' }).click();
  assert((await text.inputValue()) === 'Welcome to the show', 'each slide keeps its own text');

  // ---------- Playing it ----------
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  const stage = page.locator('.stage-box');
  await stage.locator('[data-slide="1"]').getByText('Welcome to the show').waitFor();
  await page.locator('[data-slidepos]').getByText('Slide 1 of 2').waitFor();
  assert(true, 'the game starts on its first slide (no title card), and the panel says "Slide 1 of 2"');
  await page.getByRole('button', { name: 'Next slide ▶' }).waitFor();
  await page.keyboard.press('n');
  await stage.locator('[data-slide="2"]').getByText('Rules: be nice').waitFor();
  assert((await page.locator('[data-slide-pips]').getAttribute('aria-label')) === 'Slide 2 of 2', 'N shows the next slide (the dots say where it is)');
  await page.keyboard.press('Shift+N');
  await stage.locator('[data-slide="1"]').waitFor();
  await page.keyboard.press('n');
  await stage.locator('[data-slide="2"]').waitFor();
  assert(true, 'Shift+N the one before');
  await page.getByRole('button', { name: 'Next round ▶' }).first().waitFor();
  assert(true, 'on the last slide the main button is Next round ▶');
  // (Not in the first moments of a round: a double-click's second half doesn't jump ahead.)
  await page.waitForTimeout(500);
  await page.keyboard.press('n');
  await stage.locator('.board, .round-name').first().waitFor();
  assert(true, 'and N then goes on to the board');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Slides round E2E passed.');
} finally {
  await browser.close();
}
