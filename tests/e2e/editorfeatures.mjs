// Editor features: the sample game and round templates, Import clues (and a column pasted on a category), Find
// (Ctrl+F), Copy / Paste round, Most players, my theme (and its contrast warning), what the Wheels & Dice number boxes
// keep, the Media and shortcuts filters, and the board-game spaces that move players back, skip a turn or roll again
// (played, with undo).
import { chromium } from 'playwright-core';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openRules } from './helpers.mjs';

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
  await page.waitForTimeout(100);
  assert(
    await page.evaluate(() => document.activeElement?.closest('nav')?.querySelector('[data-place^="round:"]') === document.activeElement && !document.activeElement.hasAttribute('data-round-name')),
    'Try a sample game puts the focus on its first round’s tab (its name isn’t selected to type over)',
  );
  // Its toast stays in the editor: it would cover ▶ Play's Start game.
  assert((await page.locator('.toast').count()) === 1, 'the sample game says what it added');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: /Start game/ }).waitFor();
  assert((await page.locator('.toast').count()) === 0, 'and its toast doesn’t follow into ▶ Play');
  await page.getByRole('button', { name: '◀ Back to editor' }).click();
  let t = await tabs();
  assert(t.length === 5 && t[0].includes('Introduction') && t[1].includes('Jeopardy!') && t[4].includes('Final'), `the sample game has an introduction, a board, an adventure, a board game and a Final (${t.join(' | ')})`);
  await page.locator('.problems.ok').waitFor({ timeout: 3000 });
  assert(true, 'and nothing on the checklist');
  await page.keyboard.press('Control+z');
  assert((await page.locator('nav > button.round-tab').count()) === 0, 'Ctrl+Z takes the whole sample back');
  await page.keyboard.press('Control+y');
  assert((await page.locator('nav > button.round-tab').count()) === 5, 'and Ctrl+Y brings it back');
  // Its board game's special spaces show their names on the board, and their card knows their kind.
  await page.locator('nav > button.round-tab', { hasText: 'Board game' }).click();
  const named = await page.locator('.canvas .label:not([data-name-hidden])').allInnerTexts();
  assert(['Bonus', 'Go back', 'Nap time', 'Roll again'].every((n) => named.includes(n)) && !named.some((n) => /^Space \d/.test(n)), `the sample board game shows its special spaces’ names, not the plain ones’ (${named.join(', ')})`);
  await page.locator('.canvas').getByRole('button', { name: 'Bonus', exact: true }).click();
  const kind = await page.locator('.side [data-space-kind] option:checked').innerText();
  assert(kind === '⭐ Star (bonus points)', `its Bonus space’s Make it a… box says ⭐ Star, from its +100 button (${kind})`);
  // In its Final, "…in this round" is the Final's own slides, not every board question. It starts on "Questions +
  // answers in this round" (its answer): with one question slide, "Questions in this round" is none.
  await page.locator('nav > button.round-tab', { hasText: 'Final' }).click();
  await page.locator('.canvas .hit').first().click();
  const applyStyle = page.locator('.insp').getByRole('button', { name: 'Apply', exact: true });
  const scope = page.getByRole('combobox', { name: 'Which slides get this style' });
  assert((await scope.inputValue()) === 'round-qa', `in the Final, Use this style elsewhere starts on "Questions + answers in this round" (${await scope.inputValue()})`);
  await applyStyle.click();
  assert((await page.locator('.notice').innerText()).includes('Style applied to 1 slide'), 'which restyles its answer');
  await scope.selectOption('round-q');
  await applyStyle.click();
  assert((await page.locator('.notice').innerText()).includes('There are no other slides in that group yet'), '"Questions in this round" restyles none of the board’s questions (it has one question slide)');
  await page.locator('nav > button.round-tab', { hasText: 'Jeopardy!' }).first().click();

  // ---------- Import clues ----------
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
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
  const find = page.getByRole('combobox', { name: 'Find' });
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
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Space name', null, { timeout: 3000 });
  assert(true, 'Go there to a space puts the focus on its name');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+f');
  await find.fill('nachos');
  assert((await page.getByRole('option').first().getAttribute('tabindex')) === '-1', 'Find’s results are not Tab stops');
  assert((await find.getAttribute('aria-activedescendant')) === (await page.getByRole('option').first().getAttribute('id')), 'the box points at the picked result');
  await find.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-field') === 'a', null, { timeout: 3000 });
  assert(true, 'an Answer found by Find has the focus in the Answer field');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+f');
  await find.fill('snacks');
  await page.getByRole('option', { name: /Category/ }).first().click();
  await page.waitForFunction(() => document.activeElement?.closest('[data-place^="category:"]'), null, { timeout: 3000 });
  assert(true, 'and a category its name');
  // A character's line: its screen opens, with the character picked (its Layers row has the focus).
  await page.keyboard.press('Control+f');
  await find.fill('cave is yours');
  await find.press('Enter');
  await page.waitForFunction(() => document.activeElement?.closest('[data-place^="el:"]')?.textContent?.includes('Riddle cat'), null, { timeout: 3000 });
  assert(true, 'a character’s line found by Find opens its screen with the character picked');
  await page.getByRole('button', { name: /Back to the map/ }).click();
  // A list drawn under a pointer resting there keeps the top result picked (moving the pointer picks one).
  const found = page.getByRole('listbox', { name: 'Found' }).getByRole('option');
  await page.keyboard.press('Control+f');
  await find.fill('space');
  const fourth = await found.nth(3).boundingBox();
  await page.keyboard.press('Escape');
  await page.mouse.move(fourth.x + 40, fourth.y + fourth.height / 2);
  await page.keyboard.press('Control+f');
  await found.nth(3).waitFor();
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  assert((await found.and(page.locator('[aria-selected="true"]')).getAttribute('id')) === 'find-hit-0', 'Find opened again over a resting pointer keeps its top result picked');
  await page.mouse.move(fourth.x + 60, fourth.y + fourth.height / 2);
  await page.locator('#find-hit-3[aria-selected="true"]').waitFor();
  assert(true, 'and moving the pointer over a result picks it');
  await page.keyboard.press('Escape');
  // A world no round plays (its round deleted, no RPG round left): Find says how to add one to see it, and the focus,
  // lost when Find closed, goes to the editor's page. Not when it's been put somewhere while Find waited for the screen.
  const adventure = page.locator('nav > button.round-tab', { hasText: 'Adventure' });
  await adventure.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete round/ }).click();
  await adventure.waitFor({ state: 'detached' });
  await page.keyboard.press('Control+f');
  await find.fill('cave');
  const worldHit = page.getByRole('option', { name: /Sample world/ }).first();
  await worldHit.click();
  await page.locator('.toast', { hasText: "isn't played by any round" }).waitFor();
  assert((await toast()).includes('add an RPG round (＋ Add round › 🗺 RPG) and pick it there'), `with no RPG round left, Find’s toast for a world no round plays says to add one (${await toast()})`);
  await page.waitForFunction(() => document.activeElement?.closest('main'), null, { timeout: 10000 });
  assert(true, 'and the focus, lost, goes to the editor’s page');
  await page.keyboard.press('Control+f');
  await find.fill('cave');
  // (In the page, frame by frame: the Board game's tab takes the focus a frame after the click, then Find gives up
  // waiting for the screen after 30.)
  const kept = await worldHit.evaluate(async (hit) => {
    const frame = () => new Promise((ok) => requestAnimationFrame(ok));
    hit.click();
    await frame();
    const tab = [...document.querySelectorAll('nav > button.round-tab')].find((t) => t.textContent.includes('Board game'));
    tab.focus();
    for (let i = 0; i < 40; i++) await frame();
    return document.activeElement === tab;
  });
  assert(kept, 'but focus put somewhere meanwhile stays there');
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await adventure.waitFor();

  // ---------- Templates, Copy / Paste round ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.keyboard.press('End');
  assert((await page.evaluate(() => document.activeElement?.textContent)).includes('Import round'), 'End in a menu goes to its last item (Paste round is greyed out)');
  await page.keyboard.press('Home');
  assert((await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'menuitem' && (await page.evaluate(() => document.activeElement?.parentElement?.querySelector('button:not(:disabled)') === document.activeElement)), 'Home to its first');
  await page.getByRole('menuitem', { name: /20-space loop/ }).click();
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-round-name')), 'a template round has the focus on its name');
  assert((await page.locator('.canvas [data-space]').count()) === 20, 'the 20-space loop template has 20 spaces');
  t = await tabs();
  assert(t.at(-1).includes('Final'), 'a template round goes before the Final');
  await page.locator('nav > button.round-tab', { hasText: 'Jeopardy!' }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '📋 Copy round' }).click();
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Paste round “Jeopardy!”/ }).click();
  t = await tabs();
  assert(t.some((x) => x.includes('Jeopardy! (copy)')), `Paste round adds a copy (${t.join(' | ')})`);
  assert((await page.locator('[data-cat-name="1"]').inputValue()) === 'Snacks', 'with its clues');
  const undoTitle = () => page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert((await undoTitle()) === 'Undo: Pasted round “Jeopardy! (copy)” (Ctrl+Z)', `its step is named after the round it added (${await undoTitle()})`);
  // From a round's menu, after it: the copy's name has the focus too.
  await page.locator('nav > button.round-tab', { hasText: 'Jeopardy!' }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Paste round “Jeopardy!” after it/ }).click();
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-round-name') && document.activeElement.value === 'Jeopardy! (copy 2)', null, { timeout: 3000 });
  assert((await undoTitle()) === 'Undo: Pasted round “Jeopardy! (copy 2)” (Ctrl+Z)', 'Paste round after it (a tab’s menu) puts the focus on the copy’s name, and its step names it');
  // The sample game added to a game that has rounds: its rounds of the same names are told apart ("Board game (2)" is
  // the template's), and taken back after.
  const rounds = (await tabs()).length;
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /The sample game/ }).click();
  await page.waitForFunction((n) => document.querySelectorAll('nav > button.round-tab').length === n + 4, rounds);
  const added = (await tabs()).slice(rounds).map((x) => x.replace(/^\S+\s/, '').trim());
  assert(added.join('|') === 'Jeopardy! (2)|Adventure (2)|Board game (3)|Final Jeopardy! (2)', `the sample game added to a game with rounds names its rounds apart (${added.join(', ')})`);
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('nav > button.round-tab').length === n, rounds);
  // (And the second paste: the sample's board game is played below, 3 rounds in.)
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await page.waitForFunction((n) => document.querySelectorAll('nav > button.round-tab').length === n - 1, rounds);

  // ---------- Board-game space buttons in the editor ----------
  await page.locator('nav > button.round-tab', { hasText: 'Board game' }).first().click();
  await page.locator('.canvas').getByRole('button', { name: 'Space 2', exact: true }).click();
  await page.getByRole('button', { name: '＋ Add button' }).last().click();
  assert((await page.getByRole('menuitem', { name: '⏭ Skip next turn' }).count()) === 1, 'a space offers ⏭ Skip next turn');
  assert((await page.getByRole('menuitem', { name: '↔ Move ±N spaces' }).count()) === 1, '↔ Move ±N spaces');
  assert((await page.getByRole('menuitem', { name: '🔁 Roll again' }).count()) === 1, 'and 🔁 Roll again');
  // ↔ Move ±N: a negative number turns it round, and the box shows what's kept.
  await page.getByRole('menuitem', { name: '↔ Move ±N spaces' }).click();
  const spaces = page.getByLabel('Spaces').last();
  await spaces.fill('-4');
  await spaces.press('Tab');
  const way = await page.getByLabel('Which way').last().inputValue();
  assert(way === 'on' && (await spaces.inputValue()) === '4', `↔ Move: typing -4 on Back 3 turns it round, Forward 4 (${way} ${await spaces.inputValue()})`);
  await page.getByRole('button', { name: '＋ Add button' }).last().click();
  await page.getByRole('menuitem', { name: '⏭ Skip next turn' }).click();
  assert((await page.getByText('turn(s)').count()) === 0 && (await page.getByText(/^turn$/).count()) >= 1, '“Miss 1 turn”, not “turn(s)”');

  // ---------- Theme: my theme ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByRole('button', { name: 'Brainrot Neon', exact: true }).click();
  await page.getByRole('button', { name: '💾 Save as new theme…' }).click();
  const naming = page.getByRole('dialog', { name: '💾 Save as new theme' });
  await naming.getByLabel('Theme name').fill('Neon nights');
  await naming.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /^Classic/ }).click();
  const mine = page.locator('.mine .card', { hasText: 'Neon nights' }).locator('.use');
  await mine.click();
  assert(await mine.evaluate((b) => b.getAttribute('aria-pressed') === 'true'), 'using my saved theme puts it back (it is the theme chosen)');
  assert(await page.getByRole('button', { name: 'Brainrot Neon', exact: true }).evaluate((b) => !b.classList.contains('on')), 'not the preset it was saved from');
  await mine.click();
  await page.getByText('This game already looks like “Neon nights”').waitFor({ timeout: 3000 });
  assert(true, 'using it again says nothing changed');
  // Values the colour of the tiles can't be read: a warning says so (and goes once they're apart again).
  const values = page.getByLabel('Values', { exact: true });
  const ownValue = await values.inputValue();
  await values.fill(await page.getByLabel('Tiles & slide background').inputValue());
  assert((await page.getByText(/The values are hard to read on the tiles/).count()) >= 1, 'values the colour of the tiles warn that they are hard to read');
  await values.fill(ownValue);
  assert((await page.getByText(/The values are hard to read on the tiles/).count()) === 0, '…and the warning goes once they’re apart');
  assert((await page.getByLabel('Tile glow color').count()) === 1, 'the tile glow colour box has a name');

  // ---------- Wheels & Dice: what the number boxes keep ----------
  await page.getByRole('button', { name: '🎡 Wheels & Dice' }).click();
  await page.getByRole('button', { name: '＋ Add wheel' }).click();
  const spin = page.getByLabel('Spin (s)');
  for (const [typed, kept] of [['999', '30'], ['0.2', '1'], ['7', '7']]) {
    await spin.fill(typed);
    await spin.press('Tab');
    assert((await spin.inputValue()) === kept, `a spin of ${typed} s is kept as ${kept} s, and the box says so`);
  }
  await page.locator('.seg input.label').first().fill('');
  assert((await page.getByText('No label on slice 1: it lands as “Slice 1”.').count()) === 1, 'a slice left without a label is pointed out');
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: '＋ Add dice' }).click();
  const count = page.getByLabel('Count');
  await count.fill('500');
  await count.press('Tab');
  assert((await count.inputValue()) === '20', 'a dice count of 500 is kept as 20');
  const sides = page.getByLabel('Sides d');
  await sides.fill('0');
  await sides.press('Tab');
  await sides.fill('1');
  await sides.press('Tab');
  assert((await sides.inputValue()) === '2', 'sides typed 0 then 1 show the d2 it is');

  // ---------- Shortcuts filter ----------
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  await page.getByLabel('Filter shortcuts').fill('ctrl+f');
  const rows = await page.locator('[role="dialog"] tr').allInnerTexts();
  assert(rows.length >= 1 && rows.every((r) => /ctrl\+f/i.test(r)), `the shortcuts filter keeps the matching keys (${rows.length})`);
  await page.getByLabel('Filter shortcuts').press('Escape');
  assert((await page.getByRole('dialog', { name: 'Editor keyboard shortcuts' }).count()) === 1, 'Esc in the filter clears it first');
  await page.keyboard.press('Escape');

  // ---------- Rounds and a theme from another game ----------
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^More:/ }).click().then(() => page.getByRole('menuitem', { name: /Export JSON/ }).click())]);
  // (Saved under its own name: the file's name says it's a game.)
  const other = join(tmpdir(), `editorfeatures-${Date.now()}.json`);
  copyFileSync(await download.path(), other);
  const before = (await tabs()).length;
  await page.getByRole('button', { name: '＋ Add round' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '📂 Import rounds…' }).click()]);
  await chooser.setFiles(other);
  const pick = page.getByRole('dialog', { name: 'Import rounds' });
  await pick.getByLabel(/Adventure/).check();
  await pick.getByLabel(/Final Jeopardy!/).check();
  await pick.getByRole('button', { name: 'Import 2 rounds' }).click();
  t = await tabs();
  assert(t.length === before + 2 && t.at(-1).includes('Final Jeopardy! (copy)'), `Import round brings in the rounds picked (${t.join(' | ')})`);
  await page.keyboard.press('Control+z');
  assert((await tabs()).length === before, 'as one step');
  // Another copy of this game whose Adventure world was changed since: its world comes in as a copy, this one's stays.
  const json = JSON.parse(readFileSync(other, 'utf8'));
  const rpgWorld = json.worlds.find((w) => w.id === json.rounds.find((r) => r.mode === 'rpg').world);
  const ownName = rpgWorld.name;
  rpgWorld.name = `${ownName} v2`;
  const changed = join(tmpdir(), `editorfeatures-changed-${Date.now()}.json`);
  writeFileSync(changed, JSON.stringify(json));
  await page.getByRole('button', { name: '＋ Add round' }).click();
  const [chooser3] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '📂 Import rounds…' }).click()]);
  await chooser3.setFiles(changed);
  const pick2 = page.getByRole('dialog', { name: 'Import rounds' });
  await pick2.getByLabel(/Adventure/).check();
  await pick2.getByRole('button', { name: 'Import 1 round' }).click();
  await page.getByText(`Brought the file’s “${ownName} v2” world as a copy`).waitFor({ timeout: 3000 });
  assert(true, 'a world changed in the file comes in as a copy, and the toast says so');
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByRole('button', { name: 'Pastel', exact: true }).click();
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Use a theme from another game/ }).click()]);
  await chooser2.setFiles(other);
  await page.waitForTimeout(300);
  // (That game's theme came from “Neon nights”, saved on this computer: that card is the one chosen, as it was there.)
  assert(await page.locator('.mine .card', { hasText: 'Neon nights' }).locator('.use').evaluate((b) => b.getAttribute('aria-pressed') === 'true'), 'Use a theme from another game takes its theme');
  assert((await page.getByRole('button', { name: 'Pastel', exact: true }).getAttribute('aria-pressed')) === 'false', 'and Pastel is no longer chosen');

  // ---------- Pre-game: ⚖ Game rules › Most players ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  await openRules(page);
  await page.getByLabel('Most players').fill('12');
  await page.getByLabel('Most players').press('Tab');
  assert((await page.locator('.pregame .players').innerText()).includes('3/12 players'), 'Most players raises the cap');
  assert((await page.getByText('only the first 9 players').count()) === 1, 'with a note on the 1–9 keys');
  await page.getByLabel('Most players').fill('');
  await page.getByLabel('Most players').press('Tab');
  assert((await page.getByLabel('Most players').inputValue()) === '12', 'emptied, it keeps its last value (12), not the players listed');
  await page.getByLabel('Most players').fill('1');
  await page.getByLabel('Most players').press('Tab');
  assert((await page.getByLabel('Most players').inputValue()) === '3', 'never fewer than the players listed');

  // ---------- Playing the sample's board game ----------
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
  // The round opens on its title card (N would go on from it, not to the next turn).
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.title-card .round-name').waitFor({ state: 'detached' });
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
