// What viewers see in single-window mode, and around the game: the honest "viewers can see this" warnings, the stage
// keeping its size (a clue opening, the Final's steps), the in-panel key list, score pops, the stream cards (Starting
// soon with a countdown, the cover), the clue caption, the Final's scores and wager ticks, and 📋 Copy standings.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
const dialogs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const stageSize = async () => {
  await page.waitForTimeout(400);
  const b = await page.locator('.stage-box .stage').boundingBox();
  return `${Math.round(b.width)}x${Math.round(b.height)}`;
};
const nextRound = async () => {
  await page.waitForTimeout(450);
  await page.locator('.rn button').last().click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
};

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();

  // Pre-game: single window says what viewers see, and the audience window is recommended.
  const warn = await page.locator('.pregame .exposed').innerText();
  assert(warn.includes('viewers see everything on screen') && warn.includes('wagers as you type them'), 'single-window mode warns that viewers see everything');
  assert((await page.locator('.mode', { hasText: 'Separate audience window' }).innerText()).includes('Recommended'), 'the audience window is the recommended mode');

  // The stream cards' words, the caption, and a countdown on the Starting soon card (in the audience window).
  await page.getByPlaceholder('Starting soon…').fill('Back in a sec, chat');
  await page.getByPlaceholder('Starting soon…').press('Tab');
  await page.getByPlaceholder('Be right back').fill('Snack break');
  await page.getByPlaceholder('Be right back').press('Tab');
  await page.getByLabel(/Show the category and value on clue screens/).check();
  await page.getByLabel('Countdown minutes').fill('2');
  await page.getByRole('button', { name: '▶ Start countdown' }).click();
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  await aud.locator('.soon-text').waitFor();
  assert((await aud.locator('.soon-text').innerText()) === 'Back in a sec, chat', 'the Starting soon card says what the host typed');
  assert(/^[12]:\d\d$/.test(await aud.locator('.soon-count').innerText()), 'and counts down to the start');
  assert(!(await page.locator('.pregame .exposed').count()), 'with the audience window open, no single-window warning');
  await page.locator('.mode', { hasText: 'Single window' }).click();
  if (!aud.isClosed()) await aud.waitForEvent('close', { timeout: 3000 });

  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();

  // A clue opening keeps the stage's size (the ✔ / ✘ buttons don't wrap the player row).
  const board = await stageSize();
  await page.locator('.stage-box .board .tile').nth(0).click();
  assert((await stageSize()) === board, `opening a clue keeps the stage at ${board}`);
  assert((await page.locator('.stage .caption').innerText()).includes('$200'), 'the clue screen has its category and value caption');
  await page.keyboard.press('1');
  assert((await stageSize()) === board, 'selecting a player keeps it too');

  // Score pops: over the score bar once back on the board, gone when the next clue opens.
  await page.keyboard.press('Enter');
  await page.locator('.stage .pop').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pop = await page.locator('.stage .pop').boundingBox();
  const bar = await page.locator('.stage .board-screen .score-area').boundingBox();
  assert(pop && pop.y + pop.height / 2 > bar.y && pop.y + pop.height / 2 < bar.y + bar.height, 'back on the board, the score pop sits over the score bar');
  await page.locator('.stage-box .board .tile').nth(1).click();
  // (Well before the pop's own 2.2 s, after its fade-out.)
  await page.waitForTimeout(700);
  assert(!(await page.locator('.stage .pop').count()), 'a new clue clears the score pops');

  // B covers (as K does) in a Jeopardy round too, instead of leaving the clue; the card says what the host typed.
  await page.keyboard.press('b');
  await page.locator('.stage .cover-card').waitFor();
  assert((await page.locator('.stage .cover-card').innerText()).includes('Snack break'), 'B covers the screen with the cover text');
  assert((await page.locator('.panel .status').innerText()).includes('Category 2'), 'B does not leave the clue');
  await page.keyboard.press('b');
  await page.keyboard.press('Escape');

  // The key list stays over the host panel in single-window mode: the stage is not covered.
  await page.keyboard.press('?');
  // (It moves there once the host panel's box is measured, a frame after it opens.)
  await page.locator('.backdrop.in-panel [role="dialog"]').waitFor({ timeout: 3000 }).catch(() => {});
  const keys = await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).boundingBox();
  const stage = await page.locator('.stage-box').boundingBox();
  assert(keys.y >= stage.y + stage.height - 1, 'the keyboard shortcuts show under the stage, not over it');
  assert((await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).innerText()).includes('RPG'), 'the shortcuts are grouped by round');
  await page.keyboard.press('Escape');

  // 📊 Scores: copy the standings.
  await page.getByRole('button', { name: '📊 Scores' }).click();
  await page.getByRole('button', { name: '📋 Copy standings' }).click();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert(clip.includes('🥇') && clip.includes('Player 1'), `Copy standings puts the standings on the clipboard (${clip})`);
  await page.keyboard.press('Escape');

  // The Final: the stage keeps one size through its steps; the wager boxes say viewers can see them.
  await nextRound();
  // Its title card comes first: the stage already has the Final's size, and the status line says what's on screen.
  await page.locator('.title-card .round-name').waitFor();
  const finalSize = await stageSize();
  const status = await page.locator('.panel .status').innerText();
  assert(status.includes('Title card') && !status.includes('Category on screen'), `the status line says the title card is up (${status})`);
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.title-card .round-name').waitFor({ state: 'detached' });
  assert((await stageSize()) === finalSize, `starting the Final keeps the stage at ${finalSize}`);
  assert((await page.locator('.panel .status').innerText()).includes('Category on screen'), 'then the category is on screen');
  assert(!(await page.locator('.stage .final-label').count()), 'a Final without a category shows its name once');
  await page.getByRole('button', { name: /take wagers/ }).click();
  assert((await stageSize()) === finalSize, `taking wagers keeps the stage at ${finalSize}`);
  assert((await page.locator('.fj .exposed').innerText()).includes('Viewers can see this'), 'the wager boxes say viewers can see them');
  assert((await page.locator('.panel .status').innerText()).includes('viewers can see them'), 'so does the status line');
  assert((await page.locator('.stage .score-area .plate').count()) === 3, 'the scores stay on screen while wagers are taken');
  const ticks = await page.locator('.stage .score-area .tick').count();
  const boxes = page.locator('.fj .wagers input');
  for (let i = 0; i < 3; i++) await boxes.nth(i).fill('0');
  await page.locator('.fj').click({ position: { x: 2, y: 2 } });
  await page.waitForTimeout(200);
  assert((await page.locator('.stage .score-area .tick').count()) === 3 && ticks < 3, 'a ✔ shows on each plate once that wager is in');
  await page.getByRole('button', { name: 'Show question ▶' }).click();
  assert((await stageSize()) === finalSize, 'the question keeps it');
  await page.getByRole('button', { name: 'Reveal answer ▶' }).click();
  await page.getByRole('button', { name: 'Start player reveals ▶' }).click();
  assert((await stageSize()) === finalSize, 'and so do the reveals');
  const spot = await page.locator('.stage .spot-name').innerText();
  assert((await page.locator('.stage .score-area .plate.picker').innerText()).includes(spot), 'the score bar lights up the spotlit player');

  assert(!dialogs.length, 'no browser dialogs' + (dialogs.length ? ': ' + dialogs.join(' | ') : ''));
  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Stream E2E passed.');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stream-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
