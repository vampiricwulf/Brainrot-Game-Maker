// 🤝 Partner clues in the editor (docs/PARTNER-CLUES-SPEC.md §5): a tile made a partner clue gets its rules (game, who
// describes, the points and what they come to on the tile) and a 🤫 Card 1 tab; ⧉ Same as the answer copies the answer
// onto a card once; ＋ Card and 🗑 Delete card are undo steps; the tabs go Question · Cards · Answer by the arrow keys;
// Find finds a card's words and opens its tab; the board shows a 🤝 badge; the tile menu turns it off and on again,
// keeping the cards; and a reload keeps it all.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
mkdirSync(resolve('test-results'), { recursive: true });

const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.locator('.cat textarea').first().fill('Movies');

  // ---------- Making a tile a partner clue ----------
  await page.locator('[data-tile="0,1"]').click();
  const dialog = page.getByRole('dialog', { name: 'Edit clue' });
  await dialog.waitFor();
  const tabs = dialog.getByRole('tablist', { name: 'Slides' });
  const tabNames = () => tabs.getByRole('tab').allInnerTexts();
  const opens = (name) => tabs.locator('[role="tab"][aria-selected="true"]', { hasText: name }).waitFor({ timeout: 3000 }).then(() => true, () => false);
  const away = () => dialog.locator('header .value').click();
  const undo = () => page.keyboard.press('Control+z');
  const redo = () => page.keyboard.press('Control+y');
  const card = dialog.locator('[data-field="card"]');
  const settings = dialog.getByRole('group', { name: 'Partner clue' });
  const summary = () => settings.locator('p.hint').first().innerText();

  assert((await dialog.getByRole('option', { name: '🤝 Partner clue' }).count()) === 1, 'the Type box offers 🤝 Partner clue');
  await dialog.locator('select').first().selectOption('partner');
  await settings.waitFor();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', 'Answer']), `a partner clue's tabs: Question · 🤫 Card 1 · Answer (${await tabNames()})`);
  assert((await settings.locator('select').first().inputValue()) === 'describe', 'it starts as 🗣 Describe it');
  assert((await dialog.getByLabel('⏱ Countdown (s)').inputValue()) === '45', 'with a 45 s countdown');
  assert((await summary()) === 'On this $400 tile: got → describer +$400, guesser +$200 · missed → guesser −$200', `the points in money on this tile (${await summary()})`);
  await dialog.locator('[data-field="q"]').fill('Describe this movie without saying its name!');
  await dialog.locator('[data-field="a"]').fill('Shrek');

  // ---------- The card ----------
  await tabs.getByRole('tab', { name: '🤫 Card 1' }).click();
  assert((await dialog.getByText('🤫 CARD 1 · ONLY WHO YOU SEND IT TO SEES IT').count()) === 1, 'Card 1 opens with its badge');
  assert((await dialog.getByLabel('Goes to').inputValue()) === 'giver', 'Card 1 goes to the describer');
  assert((await dialog.getByRole('option', { name: 'the describer (the partner)' }).count()) === 1, 'in the game’s words, saying who that is');
  await away();
  await dialog.getByRole('button', { name: '⧉ Same as the answer' }).click();
  assert((await card.inputValue()) === 'Shrek', '⧉ Same as the answer copies the answer onto the card');
  assert((await dialog.getByText('This card shows the answer: whoever you send it to sees it').count()) === 1, 'and the tab says the card shows the answer');
  assert((await dialog.getByRole('button', { name: '⧉ Same as the answer' }).count()) === 0, '⧉ is only offered on an empty card');
  await undo();
  await page.waitForFunction(() => document.querySelector('[data-field="card"]')?.value === '', null, { timeout: 3000 });
  assert(await opens('Card 1'), 'Ctrl+Z takes the copy back, on the card’s tab');
  await redo();
  await page.waitForFunction(() => document.querySelector('[data-field="card"]')?.value === 'Shrek', null, { timeout: 3000 });
  // A copy, not a link: the answer changed afterwards leaves the card.
  await dialog.locator('[data-field="a"]').fill('Shrek 2');
  assert((await card.inputValue()) === 'Shrek', 'changing the answer afterwards doesn’t change the card');
  assert((await dialog.getByText('This card shows the answer').count()) === 0, 'and the card no longer says it shows the answer');
  await dialog.locator('[data-field="a"]').fill('Shrek');
  await dialog.getByLabel('Goes to').selectOption('both');
  assert((await dialog.getByLabel('Goes to').inputValue()) === 'both', 'Goes to can be both of them');

  // ---------- ＋ Card, the tabs' keys, 🗑 Delete card ----------
  await away();
  await dialog.getByRole('button', { name: '＋ Card' }).click();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', '🤫 Card 2', 'Answer']), '＋ Card adds Card 2 before the answer');
  assert(await opens('Card 2'), 'and opens it');
  assert(await card.evaluate((e) => e === document.activeElement), 'its words box has the focus, ready to type');
  await page.keyboard.type('Ogres are like onions');
  assert((await dialog.locator('label.field', { has: page.locator('[data-field="card"]') }).innerText()).includes('Card 2 words'), 'the quick box is the open card’s');
  await tabs.getByRole('tab', { name: 'Question slide' }).click();
  await tabs.getByRole('tab', { name: 'Question slide' }).focus();
  const keyTo = async (key, name) => (await page.keyboard.press(key), opens(name));
  assert((await keyTo('ArrowRight', 'Card 1')) && (await keyTo('ArrowRight', 'Card 2')) && (await keyTo('ArrowRight', 'Answer')), '→ goes Question · Card 1 · Card 2 · Answer');
  assert((await keyTo('Home', 'Question slide')) && (await keyTo('End', 'Answer')) && (await keyTo('ArrowLeft', 'Card 2')), 'Home, End and ← too');
  // Delete on a card's tab does nothing (as on the Answer's): 🗑 Delete card does it.
  await page.keyboard.press('Delete');
  assert((await tabs.getByRole('tab').count()) === 4, 'Delete on a card’s tab deletes nothing');
  await dialog.getByRole('button', { name: '🗑 Delete card' }).click();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', 'Answer']), '🗑 Delete card takes it out');
  await away();
  await undo();
  assert((await opens('Card 2')) && (await card.inputValue()) === 'Ogres are like onions', 'Ctrl+Z brings it back, open');

  // ---------- Points ----------
  const points = settings.getByRole('combobox', { name: /^Points/ });
  await points.selectOption('none');
  assert((await summary()).endsWith('missed → nobody loses points'), `Points “No penalty”: a miss costs nobody (${await summary()})`);
  await settings.getByLabel(/^Guesser’s share if it’s missed/).fill('-75');
  assert((await points.inputValue()) === 'custom', 'typing a share makes the Points Custom');
  assert((await summary()).endsWith('missed → guesser −$300'), `and the money follows (${await summary()})`);
  await points.selectOption('game');
  await settings.getByRole('radio', { name: 'the picker' }).check();
  assert((await summary()) === 'On this $400 tile: got → describer +$400, guesser +$200 · missed → nobody loses points', `the picker describing: the partner guesses, and never loses points (${await summary()})`);
  await settings.getByRole('checkbox', { name: 'The partner never loses points' }).uncheck();
  assert((await summary()).endsWith('missed → guesser −$200'), 'unticked, a miss costs the partner too');
  await settings.getByRole('checkbox', { name: 'The partner never loses points' }).check();
  await settings.getByRole('radio', { name: 'the partner' }).check();
  await settings.getByRole('combobox', { name: /^Game/ }).selectOption('help');
  assert((await summary()) === 'On this $400 tile: got → helper +$200, answerer +$400 · missed → answerer −$200', `🙋 Help a friend: its own words and points (${await summary()})`);
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', '🤫 Card 2', 'Answer']), 'a game chosen keeps the cards the clue has');
  await settings.getByRole('combobox', { name: /^Game/ }).selectOption('describe');
  await page.screenshot({ path: 'test-results/partner-editor.png' });

  // ---------- The board, Find and the history ----------
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  const tile = page.locator('[data-tile="0,1"]');
  assert((await tile.locator('.dd[title^="Partner clue"]').count()) === 1, 'the board shows the tile’s 🤝 badge');
  assert((await tile.getAttribute('aria-label')).includes(', partner clue:'), 'and its name says so');
  await page.keyboard.press('Control+f');
  const find = page.getByRole('combobox', { name: 'Find' });
  await find.fill('onions');
  const found = await page.getByRole('listbox', { name: 'Found' }).getByRole('option').allInnerTexts();
  assert(found.length === 1 && found[0].includes('Movies › $400 › Card 2'), `Find finds a card’s words, and says which card (${found.join(' | ')})`);
  await find.press('Enter');
  await dialog.waitFor();
  assert(await opens('Card 2'), 'and opens its tab');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-field') === 'card', null, { timeout: 3000 });
  assert((await card.inputValue()) === 'Ogres are like onions', 'with the focus in its words box');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.locator('nav button', { hasText: 'History' }).first().click();
  const history = await page.locator('main').innerText();
  for (const label of ['Made Movies $400 a partner clue', 'Copied the answer onto card 1 of Movies $400', 'Edited card 2 “Ogres are like onions”', 'Card 1 of Movies $400 goes to both of them', 'Made Movies $400 a Help a friend partner clue'])
    assert(history.includes(label), `the history says “${label}”`);
  await page.locator('nav > button.round-tab').first().click();

  // ---------- Off and on again, and a reload ----------
  await tile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '🤝 Not a partner clue' }).click();
  assert((await tile.locator('.dd[title^="Partner clue"]').count()) === 0, 'the tile menu makes it a plain clue again');
  await tile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '🤝 Make it a partner clue' }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await tile.click();
  await dialog.waitFor();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', '🤫 Card 2', 'Answer']), 'made one again, and after a reload, it has its cards back');
  await tabs.getByRole('tab', { name: '🤫 Card 1' }).click();
  assert((await card.inputValue()) === 'Shrek' && (await dialog.getByLabel('Goes to').inputValue()) === 'both', 'with their words and who they go to');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner clue editor tests passed');
} catch (e) {
  await page.screenshot({ path: 'test-results/partner-failure.png' }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
