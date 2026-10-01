// Editor polish at 1280×720: the first screen, the sidebar and its checklist, board values, category names and tools,
// Daily Doubles, standard dice tiles, wheels and dice made where they're picked, stat presets, RPG doorways and
// characters, the world's menu, one set of ↶ ↷, and the theme's clue text and preview.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dialogs = [];
page.on('dialog', (d) => {
  dialogs.push(d.message());
  return d.accept();
});
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const header = page.locator('.editor > header');
const tabs = page.locator('nav > button.round-tab');
const values = (loc) => loc.evaluateAll((els) => els.map((e) => e.value));
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-place') ?? document.activeElement?.tagName);

async function addRound(mode) {
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: mode }).click();
}

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();

  // ---------- First screen ----------
  const cards = await page.locator('.first-round .mode').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  assert(cards.length === 4 && cards[0] === cards[1] && cards[2] === cards[3] && cards[1] < cards[2], `the four mode cards sit two by two (${cards})`);
  assert((await page.locator('main').count()) === 1, 'one main landmark');

  // ---------- Board values and focus ----------
  await page.locator('.first-round .mode', { hasText: 'Jeopardy board' }).click();
  await addRound(/Jeopardy board/);
  assert((await focused()) === (await tabs.nth(1).getAttribute('data-place')), "＋ Add round puts the focus on the new round's tab");
  await addRound(/Jeopardy board/);
  const vals = () => values(page.locator('.values input[aria-label^="Row"]'));
  assert((await vals()).join() === '400,800,1200,1600,2000', `a third board keeps the second's values (${await vals()})`);
  await tabs.nth(1).click();
  assert((await vals()).join() === '400,800,1200,1600,2000', 'the second board doubles the first');
  await tabs.nth(0).click();

  // ---------- Sidebar ----------
  const order = await page.locator('nav > button, nav > .navlabel').allInnerTexts();
  const at = (re) => order.findIndex((t) => re.test(t));
  assert(at(/Tiebreaker/) === at(/Round 3/) + 1 && at(/Add round/) === at(/Tiebreaker/) + 1, `the Tiebreaker comes right after the rounds (${order.join(' | ')})`);
  assert(at(/^Game$/i) > at(/Add round/) && at(/Setup/) > at(/^Game$/i) && at(/Theme/) > at(/^Game$/i), 'the game-wide tabs have a Game group of their own');
  await page.locator('nav .problem', { hasText: 'Round 3:' }).waitFor();
  const lines = await page.locator('nav .problem').allInnerTexts();
  assert(lines.filter((l) => /^⚠ Jeopardy!:/.test(l)).length === 1 && lines.some((l) => /^⚠ Jeopardy!: 30 clues to finish/.test(l)), `the checklist has one line a round (${lines.join(' | ')})`);
  const navScroll = await page.locator('nav').evaluate((n) => n.scrollHeight <= n.clientHeight);
  assert(navScroll, 'with three boards the sidebar still fits at 720p');

  // Write the first clue, then the checklist goes to the second one (the first unfinished tile).
  await page.locator('.tile').first().click();
  await page.getByPlaceholder('Type the question…').fill('Q1');
  await page.getByPlaceholder('Type the answer…').fill('A1');
  await page.getByRole('button', { name: 'Done' }).click();
  await tabs.nth(2).click();
  await page.locator('nav .problem', { hasText: /^⚠ Jeopardy!:/ }).click();
  await page.waitForTimeout(300);
  const tile = await page.evaluate(() => document.activeElement?.getAttribute('data-tile'));
  assert((await tabs.nth(0).getAttribute('class')).includes('active') && tile === '0,1', `a checklist line opens its round at the first unfinished tile (${tile})`);

  // ---------- Categories ----------
  const name = page.locator('.cat textarea').first();
  await name.fill('Famous Memes Of The Early Twenty Tens Internet Era');
  const hidden = await name.evaluate((t) => t.scrollHeight - t.clientHeight);
  assert(hidden <= 1, `a long category name grows its box instead of hiding lines (${hidden}px hidden)`);
  const fits = await page.locator('.cat').evaluateAll((cats) => cats.every((c) => c.querySelector('.cat-tools').scrollWidth <= c.clientWidth));
  assert(fits, "each category's tools fit its column at 1280");
  await page.getByRole('button', { name: 'More for category 2' }).click();
  assert(await page.getByRole('menuitem', { name: /Delete category/ }).isVisible(), 'the ⋯ button opens the category menu');
  await page.keyboard.press('Escape');
  await page.getByLabel('Categories').fill('10');
  await page.getByLabel('Categories').press('Tab');
  const sideways = await page.locator('.grid-wrap').evaluate((w) => w.scrollWidth - w.clientWidth);
  assert(sideways <= 1, `ten categories fit across at 1280 (${sideways}px over)`);
  await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  assert((await page.locator('.cat').count()) === 6, 'back to six');
  assert((await page.getByText('Rows (questions per category)').count()) === 1, 'the rows field says rows');

  // ---------- Row values and Daily Doubles ----------
  const row1 = page.getByLabel('Row 1 value');
  await row1.fill('');
  await row1.press('Tab');
  assert((await row1.inputValue()) === '200' && (await page.locator('.tile .val').first().innerText()).startsWith('$200'), 'a row value left blank keeps its value');
  await row1.fill('-100');
  await row1.press('Tab');
  const neg = await page.locator('.tile .val').first().innerText();
  assert(neg.startsWith('−$100'), `a negative value reads like the score bar (${neg})`);
  await row1.fill('200');
  await row1.press('Tab');
  const dd = page.getByLabel('How many Daily Doubles');
  await dd.fill('50');
  await page.getByRole('button', { name: '🎲 Randomize' }).click();
  const placed = await page.locator('.tile .dd', { hasText: 'DD' }).count();
  assert(placed === 6 && (await dd.inputValue()) === '6', `Daily Doubles are clamped and the box says how many were placed (${placed}, ${await dd.inputValue()})`);

  // ---------- Standard dice and new wheels from a tile ----------
  await page.locator('.tile').nth(2).click();
  await page.getByLabel('Type').selectOption('dice');
  const diceOpts = await page.getByLabel('Which dice').locator('option').allInnerTexts();
  assert(diceOpts.some((o) => o.includes('2d6')) && diceOpts.some((o) => o.includes('New dice')), `a dice tile can use standard dice (${diceOpts.join(', ')})`);
  await page.getByLabel('Which dice').selectOption({ label: '🎲 2d6' });
  await page.getByLabel('Type').selectOption('wheel');
  await page.getByLabel('Which wheel').selectOption({ label: '＋ New wheel…' });
  const pop = page.getByRole('dialog', { name: 'Wheel' });
  await pop.waitFor();
  await pop.getByLabel('Wheel name').fill('Spicy Wheel');
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });
  assert(await page.getByRole('dialog', { name: 'Edit clue' }).isVisible(), 'Esc closes the new wheel and leaves the clue open');
  const picked = await page.getByLabel('Which wheel').evaluate((s) => s.selectedOptions[0].text);
  assert(picked === 'Spicy Wheel', `the new wheel is the tile's wheel (${picked})`);
  await page.getByRole('button', { name: '✎ Edit wheel' }).click();
  await pop.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Type').selectOption('dice');
  await page.getByLabel('Which dice').selectOption({ label: '🎲 2d6' });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(800);
  assert(!(await page.locator('nav .problem').allInnerTexts()).some((l) => l.includes('wheel/dice')), 'a tile with standard dice is not a problem');
  await page.getByRole('button', { name: '🎡 Wheels & Dice' }).click();
  assert(await page.getByRole('button', { name: 'Spicy Wheel' }).isVisible(), 'and the wheel made there is in Wheels & Dice');
  assert((await page.locator('main main').count()) === 0 && (await page.locator('main').count()) === 1, 'no main inside main');

  // ---------- Board game: Move by a new dice ----------
  await addRound(/Board game/);
  await page.getByLabel('Move by').selectOption({ label: '＋ New dice…' });
  const dpop = page.getByRole('dialog', { name: 'Dice' });
  await dpop.waitFor();
  await dpop.getByRole('button', { name: 'Done' }).click();
  assert((await page.getByLabel('Dice', { exact: true }).inputValue()) === 'Dice 1', 'Move by ＋ New dice… makes dice and moves by them');
  assert((await page.locator('.bge').getByRole('button', { name: 'Undo (Ctrl+Z)' }).count()) === 0, 'the board game has no ↶ of its own (the header has it)');
  await page.getByRole('tab', { name: /Board backdrop/ }).click();
  assert((await page.locator('.se').getByRole('button', { name: 'Undo (Ctrl+Z)' }).count()) === 0, 'nor its backdrop editor');

  // ---------- Stat presets ----------
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  assert(await page.getByRole('button', { name: /HP \(bar/ }).isDisabled(), 'a stat preset can only be added once');

  // ---------- RPG: doorways and characters ----------
  await addRound(/RPG/);
  await page.getByRole('button', { name: 'More for this world' }).click();
  assert(await page.getByRole('menuitem', { name: /Delete world/ }).isVisible(), 'Delete world is in the world\'s ⋯ menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  await page.getByRole('button', { name: '🚪 Doorway' }).click();
  assert((await page.getByLabel('Object class').inputValue()) === 'doorway', 'the 🚪 Doorway button places a doorway');
  assert(await page.getByLabel('Leads to: screen').evaluate((s) => s === document.activeElement), 'and its screen list has the focus');
  await page.getByLabel('Leads to: screen').selectOption({ label: 'Screen B1' });
  await page.getByRole('button', { name: '🧙 Character' }).click();
  assert((await page.getByLabel('Object class').inputValue()) === 'npc', 'the 🧙 Character button places a character');
  await page.getByRole('button', { name: '◀ Back to the map' }).click();

  // ---------- Setup ----------
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  const boxes = await page.locator('section .check input[type=checkbox]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  assert(new Set(boxes).size === 1, `every checkbox in Setup is the same size (${boxes})`);

  // ---------- Theme: clue text and preview ----------
  await tabs.nth(0).click();
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  const prev = await page.getByLabel('Preview', { exact: true }).evaluate((s) => s.selectedOptions[0].text);
  assert(prev.includes('Jeopardy!'), `the preview starts on the round last open (${prev})`);
  await page.getByLabel('Preview', { exact: true }).selectOption({ label: '❓ A clue' });
  await page.getByLabel('Clue text font').selectOption({ label: 'Bangers (comic)' });
  await page.locator('nav > button.round-tab').first().click();
  await page.locator('.tile').first().click();
  const editorFont = await page.locator('.modal .se .canvas').evaluate((c) => [...c.querySelectorAll('*')].map((e) => getComputedStyle(e).fontFamily).find((f) => f.includes('Bangers')) ?? '');
  assert(editorFont.includes('Bangers'), `the clue text font changes the clues' text (${editorFont})`);
  await page.getByRole('button', { name: 'Done' }).click();

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('editorfixes: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'editorfixes-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
