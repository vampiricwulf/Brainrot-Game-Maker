// A slides round: an introduction of several slides, in one round. The host makes it in the editor (it goes first, a
// template one too, which says so; the checklist goes to an empty slide, and to a Final's missing answer), then plays
// through it with N (Shift+N back) and goes on to the board after the last slide.
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
  // A slides template goes first too, and says so (taken back after).
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Welcome and rules/ }).click();
  await page.locator('.toast', { hasText: 'at the start of the game: drag its tab to move it' }).waitFor();
  assert((await roundNames())[0] === 'Introduction', 'the 🖼 Welcome and rules template goes first, and says so');
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await page.waitForFunction(() => document.querySelectorAll('nav > button.round-tab').length === 2);
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Slides/ }).click();
  assert((await roundNames()).join('|') === 'Introduction|Jeopardy!|Final Jeopardy!', `the first slides round is the introduction: it goes first (${(await roundNames()).join(', ')})`);
  const text = page.locator('main [data-field="q"]');
  await text.fill('Welcome to the show');
  await page.getByRole('button', { name: '＋ Add slide' }).click();
  await page.getByRole('tab', { name: 'Slide 2' }).waitFor();
  assert((await page.getByRole('tab', { name: /Answer/ }).count()) === 0, 'its tabs are Slide 1, Slide 2 (no Answer)');
  // The checklist's line for an empty slide opens that slide, with the focus in its text.
  await page.getByRole('tab', { name: 'Slide 1' }).click();
  await page.locator('nav .problem', { hasText: 'Introduction: slide 2 is empty' }).click();
  await page.locator('label.quick', { hasText: 'Text (slide 2 of 2)' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="q"]'), null, { timeout: 3000 });
  assert(true, 'the checklist line for an empty slide opens that slide, with the focus in its text');
  await text.fill('Rules: be nice');
  await page.getByRole('tab', { name: 'Slide 1' }).click();
  assert((await text.inputValue()) === 'Welcome to the show', 'each slide keeps its own text');
  // A Final's line goes to the side with nothing on it (here its answer), from another round.
  await page.locator('nav > button.round-tab', { hasText: 'Final' }).click();
  await page.locator('main [data-field="q"]').fill('The final question');
  await page.locator('nav > button.round-tab', { hasText: 'Introduction' }).click();
  await page.locator('nav .problem', { hasText: 'Final Jeopardy! has no answer' }).click();
  await page.getByRole('tab', { name: /^Answer slide/, selected: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="a"]'), null, { timeout: 3000 });
  assert(true, "a Final's line for its missing answer opens its Answer side, with the focus in the Answer box");

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
  await page.getByRole('button', { name: '◀ Slide' }).click();
  await stage.locator('[data-slide="1"]').waitFor();
  await stage.locator('[data-slide="1"]').click();
  await stage.locator('[data-slide="2"]').waitFor();
  assert(true, 'and with the mouse: ◀ Slide, and a click on the stage for the next');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/slides-host.png` });
  await page.getByRole('button', { name: 'Next round ▶' }).first().waitFor();
  assert(true, 'on the last slide the main button is Next round ▶');
  // (Not in the first moments of a round: a double-click's second half doesn't jump ahead.)
  await page.waitForTimeout(500);
  // A click on the stage does what it says too.
  await stage.locator('[data-slide="2"]').click();
  await stage.locator('.board, .round-name').first().waitFor();
  assert(true, 'and then (a click on the stage, as N) goes on to the board');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Slides round E2E passed.');
} finally {
  await browser.close();
}
