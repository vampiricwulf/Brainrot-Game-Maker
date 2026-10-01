// Editor features: the sample game and round templates, Import clues (and a column pasted on a category), Find
// (Ctrl+F), Copy / Paste round, Most players, my theme, the Media and shortcuts filters, and the board-game spaces
// that move players back, skip a turn or roll again (played, with undo).
import { chromium } from 'playwright-core';
import { copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
const tabs = () => page.locator('nav > button.round-tab').allInnerTexts();
const toast = () => page.locator('.toast').last().innerText();

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();

  // ---------- The sample game ----------
  await page.getByRole('button', { name: /Try a sample game/ }).click();
  let t = await tabs();
  assert(t.length === 4 && t[0].includes('Jeopardy!') && t[3].includes('Final'), `the sample game has a board, an adventure, a board game and a Final (${t.join(' | ')})`);
  await page.locator('.problems.ok').waitFor({ timeout: 3000 });
  assert(true, 'and nothing on the checklist');
  await page.keyboard.press('Control+z');
  assert((await page.locator('nav > button.round-tab').count()) === 0, 'Ctrl+Z takes the whole sample back');
  await page.keyboard.press('Control+y');
  assert((await page.locator('nav > button.round-tab').count()) === 4, 'and Ctrl+Y brings it back');
  await page.locator('nav > button.round-tab').first().click();

  // ---------- Import clues ----------
  await page.getByRole('button', { name: 'Import clues…' }).click();
  await page.getByLabel('Clues to import').fill('category\tvalue\tquestion\tanswer\nScience\t200\tH2O is this\tWater\nScience\t600\tCO2 is this\tCarbon dioxide');
  assert((await page.getByRole('dialog', { name: 'Import clues' }).innerText()).includes('2 clues found'), 'a pasted block shows how many clues it has');
  await page.getByLabel('Replace the board').check();
  await page.getByRole('button', { name: 'Import 2 clues' }).click();
  const cats = await page.locator('.cat textarea').evaluateAll((els) => els.map((e) => e.value));
  assert(cats.length === 1 && cats[0] === 'Science', `replacing makes the board the imported categories (${cats})`);
  assert((await page.locator('.values input[aria-label^="Row"]').evaluateAll((els) => els.map((e) => e.value))).join() === '200,600', 'with the imported values as its rows');
  await page.keyboard.press('Control+z');
  assert((await page.locator('.cat textarea').count()) === 4, 'one Ctrl+Z puts the board back');

  // A column pasted on a category's name fills it.
  await page.locator('[data-cat-name="1"]').focus();
  await page.evaluate(() => {
    const el = document.querySelector('[data-cat-name="1"]');
    const data = new DataTransfer();
    data.setData('text/plain', 'Snacks\nCrunchy potato slices\tChips\nCheesy triangles\tNachos\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert((await page.locator('[data-cat-name="1"]').inputValue()) === 'Snacks', 'a column pasted on a category’s name names it');
  assert((await page.locator('[data-tile="1,1"]').innerText()).includes('Cheesy triangles'), 'and fills its tiles top down');

  // ---------- Find ----------
  await page.locator('nav > button.round-tab').nth(2).click();
  await page.keyboard.press('Control+f');
  const find = page.getByRole('searchbox', { name: 'Find' });
  await find.fill('cheesy');
  const opts = await page.getByRole('listbox', { name: 'Found' }).getByRole('option').allInnerTexts();
  assert(opts.length === 1, `Ctrl+F finds a clue by its words (${opts.join(' | ')})`);
  await find.press('Enter');
  await page.locator('.clue-editor, [aria-label*="Clue"]').first().waitFor({ timeout: 3000 }).catch(() => {});
  assert((await page.locator('nav > button.round-tab.active').innerText()).includes('Jeopardy!'), 'Enter goes to its round');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+f');
  await find.fill('nap time');
  await find.press('Enter');
  assert((await page.locator('nav > button.round-tab.active').innerText()).includes('Board game'), 'and finds board-game spaces');

  // ---------- Templates, Copy / Paste round ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /20-space loop/ }).click();
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 20, 'the 20-space loop template has 20 spaces');
  t = await tabs();
  assert(t.at(-1).includes('Final'), 'a template round goes before the Final');
  await page.locator('nav > button.round-tab').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '📋 Copy round' }).click();
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Paste round “Jeopardy!”/ }).click();
  t = await tabs();
  assert(t.some((x) => x.includes('Jeopardy! (copy)')), `Paste round adds a copy (${t.join(' | ')})`);
  assert((await page.locator('[data-cat-name="1"]').inputValue()) === 'Snacks', 'with its clues');

  // ---------- Board-game space buttons in the editor ----------
  await page.locator('nav > button.round-tab', { hasText: 'Board game' }).first().click();
  await page.getByRole('button', { name: 'Space Space 2' }).click();
  await page.getByRole('button', { name: '＋ Add button' }).last().click();
  assert((await page.getByRole('menuitem', { name: '⏭ Skip next turn' }).count()) === 1, 'a space offers ⏭ Skip next turn');
  assert((await page.getByRole('menuitem', { name: '↔ Move ±N spaces' }).count()) === 1, '↔ Move ±N spaces');
  assert((await page.getByRole('menuitem', { name: '🔁 Roll again' }).count()) === 1, 'and 🔁 Roll again');
  await page.keyboard.press('Escape');

  // ---------- Setup: Most players ----------
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByLabel('Most players').fill('12');
  await page.getByLabel('Most players').press('Tab');
  assert((await page.locator('section').first().innerText()).includes('3/12 players'), 'Most players raises the cap');
  assert((await page.getByText('only the first 9 players').count()) === 1, 'with a note on the 1–9 keys');
  await page.getByLabel('Most players').fill('1');
  await page.getByLabel('Most players').press('Tab');
  assert((await page.getByLabel('Most players').inputValue()) === '3', 'never fewer than the players listed');

  // ---------- Theme: my theme ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByRole('button', { name: /Brainrot Neon/ }).click();
  await page.getByRole('button', { name: '💾 Save as my theme' }).click();
  await page.getByRole('button', { name: /Classic/ }).click();
  await page.getByRole('button', { name: '⭐ Use my theme' }).click();
  assert(await page.getByRole('button', { name: /Brainrot Neon/ }).evaluate((b) => b.classList.contains('on')), 'Use my theme puts the saved theme back');

  // ---------- Shortcuts filter ----------
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.getByLabel('Filter shortcuts').fill('ctrl+f');
  const rows = await page.locator('[role="dialog"] tr').allInnerTexts();
  assert(rows.length >= 1 && rows.every((r) => /ctrl\+f/i.test(r)), `the shortcuts filter keeps the matching keys (${rows.length})`);
  await page.getByLabel('Filter shortcuts').press('Escape');
  assert((await page.getByRole('dialog', { name: 'Editor keyboard shortcuts' }).count()) === 1, 'Esc in the filter clears it first');
  await page.keyboard.press('Escape');

  // ---------- Rounds and a theme from another game ----------
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  // (Saved under its own name: the file's name says it's a game.)
  const other = join(tmpdir(), `editorfeatures-${Date.now()}.json`);
  copyFileSync(await download.path(), other);
  const before = (await tabs()).length;
  await page.getByRole('button', { name: '＋ Add round' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Import round from a \.brainrot/ }).click()]);
  await chooser.setFiles(other);
  const pick = page.getByRole('dialog', { name: 'Import rounds' });
  await pick.getByLabel(/Adventure/).check();
  await pick.getByLabel(/Final Jeopardy!/).check();
  await pick.getByRole('button', { name: 'Import 2 rounds' }).click();
  t = await tabs();
  assert(t.length === before + 2 && t.at(-1).includes('Final Jeopardy! (copy)'), `Import round brings in the rounds picked (${t.join(' | ')})`);
  await page.keyboard.press('Control+z');
  assert((await tabs()).length === before, 'as one step');
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByRole('button', { name: /Pastel/ }).click();
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Use a theme from another game/ }).click()]);
  await chooser2.setFiles(other);
  await page.waitForTimeout(300);
  assert(await page.getByRole('button', { name: /Brainrot Neon/ }).evaluate((b) => b.classList.contains('on')), 'Use a theme from another game takes its theme');

  // ---------- Playing the sample's board game ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click().catch(() => {});
  for (let i = 0; i < 3 && !(await page.locator('.bh').count()); i++) {
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: 'Next round ▶' }).click();
    await page.waitForTimeout(450);
    const yes = page.getByRole('button', { name: 'Yes', exact: true });
    if (await yes.isVisible()) await yes.click();
  }
  await page.locator('.bh').waitFor();
  // Ann: Start + 5 lands on Go back (3 back: Space 3).
  await page.getByLabel('Steps').fill('5');
  await page.getByRole('button', { name: /^▶ Move Ann/ }).click();
  assert((await toast()).includes('Landed on Go back'), 'Ann lands on Go back');
  await page.locator('.bh .acts').getByRole('button', { name: 'Back 3 spaces' }).click();
  assert((await toast()).includes('Landed on Space 3'), 'its button moves her 3 spaces back');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert((await page.locator('.bh .acts').innerText()).includes('Landed on Go back'), 'Ctrl+Z undoes the move back');
  // Bob: Start + 8 is Nap time: he misses his next turn.
  await page.keyboard.press('n');
  await page.getByLabel('Steps').fill('8');
  await page.getByRole('button', { name: /^▶ Move Bob/ }).click();
  await page.locator('.bh .acts').getByRole('button', { name: 'Skip next turn' }).click();
  assert((await page.locator('.bh .ord', { hasText: 'Bob' }).innerText()).includes('⏭'), 'the turn order shows Bob skips');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-skip.png` });
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Cat'), 'Next turn passes over Bob (Ann → Cat)');
  // Cat: Start + 10 is Roll again.
  await page.getByLabel('Steps').fill('10');
  await page.getByRole('button', { name: /^▶ Move Cat/ }).click();
  await page.locator('.bh .acts').getByRole('button', { name: 'Roll again' }).click();
  await page.keyboard.press('n');
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Cat'), 'Roll again: Next turn stays with Cat');

  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log('editor features: all passed');
} finally {
  await browser.close();
}
