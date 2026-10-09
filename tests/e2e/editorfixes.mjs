// Editor polish at 1280×720: the first screen, the sidebar and its checklist, board values, category names and tools,
// Daily Doubles, standard dice tiles, wheels and dice made where they're picked, stat presets, RPG doorways and
// characters, the world's menu, one set of ↶ ↷, and the theme's clue text and preview. Also: Enter in a category's
// name, the last clue's Ctrl+Enter, Import clues keeping what was pasted, slice weights, ＋ buttons that put the
// focus on what they add, and a board's six columns fitting a narrower window.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerReplace, clickExportHtml, openRules } from './helpers.mjs';

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
const note = page.locator('.history-notice');
const toastText = async () => ((await page.locator('.toast').count()) ? await page.locator('.toast').innerText() : '');
/** The focused text box: its label, value, and whether all of it is selected (ready to type over). */
const typingIn = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return { label: a?.getAttribute('aria-label'), value: a?.value, all: !!a?.value && a.selectionStart === 0 && a.selectionEnd === a.value.length };
  });

async function addRound(mode) {
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: mode }).click();
}

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();

  // ---------- First screen ----------
  const cards = await page.locator('.first-round .mode').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  assert(cards.length === 5 && cards[0] === cards[1] && cards[1] === cards[2] && cards[3] === cards[4] && cards[2] < cards[3], `the five mode cards sit three, then two (${cards})`);
  assert((await page.locator('main').count()) === 1, 'one main landmark');
  // A game with no rounds isn't exported: the file couldn't be played (and has no ＋ Add round).
  await clickExportHtml(page);
  await page.locator('.toast', { hasText: 'Add a round first' }).waitFor();
  assert((await page.getByRole('dialog', { name: 'Name your game' }).count()) === 0, 'Export HTML with no rounds says to add one, and exports nothing');

  // ---------- Board values and focus ----------
  assert((await page.locator('.first-round .mode', { hasText: 'Jeopardy board' }).innerText()).includes('📥 Import clues'), 'the Jeopardy board card mentions 📥 Import clues…');
  await page.locator('.first-round .mode', { hasText: 'Jeopardy board' }).click();
  // The board's 💡 Tips are open the first time it's seen (and closed after that).
  assert(await page.locator('details.tips').first().evaluate((d) => d.open), "the board's 💡 Tips open the first time");
  assert((await page.evaluate(() => localStorage.getItem('jb.tips.board'))) === 'closed', '…and closed from then on');
  assert((await page.locator('.cat textarea').first().getAttribute('placeholder')) === 'Type a name, or paste a column of clues', 'an empty category name says a column of clues can be pasted');
  await addRound(/Jeopardy board/);
  assert(
    await page.evaluate(() => { const a = document.activeElement; return a?.hasAttribute('data-round-name') && a.value === 'Double Jeopardy!' && a.selectionEnd - a.selectionStart === a.value.length; }),
    "＋ Add round puts the focus in the new round's name, selected",
  );
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
  assert(at(/^Game$/i) > at(/Add round/) && at(/Sounds/) > at(/^Game$/i) && at(/Theme/) > at(/^Game$/i), 'the game-wide tabs have a Game group of their own');
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
  // A narrower window (a 1024 laptop, half a 1920 screen): the six columns narrow to fit, none runs past the edge.
  for (const w of [1024, 960]) {
    await page.setViewportSize({ width: w, height: 720 });
    await page.waitForFunction(() => document.querySelector('.grid-wrap').scrollWidth - document.querySelector('.grid-wrap').clientWidth <= 1, null, { timeout: 3000 }).catch(() => {});
    const over = await page.locator('.grid-wrap').evaluate((g) => g.scrollWidth - g.clientWidth);
    assert(over <= 1, `six categories fit across a ${w}px window (${over}px over)`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  assert((await page.getByText('Rows (questions per category)').count()) === 1, 'the rows field says rows');
  // Enter in a category's name goes to its top tile (Shift+Enter is a new line); a new line left at its end goes.
  const cat3 = page.locator('[data-cat-name="2"]');
  await cat3.fill('Memes');
  await cat3.press('Enter');
  assert((await page.evaluate(() => document.activeElement?.getAttribute('data-tile'))) === '2,0' && (await cat3.inputValue()) === 'Memes', 'Enter in a category name goes to its top tile, adding no new line');
  await cat3.fill('Memes\n');
  await page.locator('[data-tile="2,1"]').focus();
  assert((await cat3.inputValue()) === 'Memes', 'a new line left at the end of a name goes when the box is left');
  await cat3.focus();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('2');
  assert((await cat3.inputValue()) === 'Memes\n2', 'Shift+Enter starts a second line');
  await cat3.fill('Memes');
  // Ctrl+Enter on the last clue: a note says so (not nothing at all).
  await page.locator('[data-tile="5,4"]').click();
  await page.keyboard.press('Control+Enter');
  assert((await toastText()).includes('last clue'), `Ctrl+Enter on the last clue says it's the last (${await toastText()})`);
  assert(
    (await page.getByRole('button', { name: 'Next ▶' }).count()) === 0 && (await page.getByRole('dialog', { name: 'Edit clue' }).getByRole('button', { name: 'Done' }).innerText()).includes('✓'),
    'on the last clue, Next ▶ becomes Done ✓ (one Done, which closes it)',
  );
  await page.getByRole('button', { name: 'Done' }).click();

  // ---------- Import clues keeps what was pasted ----------
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  const imp = page.getByRole('dialog', { name: 'Import clues' });
  await imp.getByLabel('Clues to import').fill('Science\t200\tH2O is this\tWater\nScience\t400\tCO2 is this\tCarbon dioxide');
  await page.mouse.click(4, 4);
  assert(await imp.isVisible(), 'a click outside Import clues doesn’t close it (nor lose what was pasted)');
  await page.keyboard.press('Escape');
  await imp.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  assert((await imp.getByLabel('Clues to import').inputValue()).startsWith('Science\t200'), 'closed with Esc and opened again, what was pasted is still there');
  await imp.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  assert((await imp.getByLabel('Clues to import').inputValue()).startsWith('Science\t200'), 'and after Cancel');
  await imp.getByRole('button', { name: /^Import \d+ clue/ }).click();
  await note.waitFor();
  const imported = await note.innerText();
  assert(/Imported \d+ clues? into Jeopardy!/.test(imported) && !imported.includes('Row values') && !(await toastText()).includes('Imported'), `importing says so once, at the board (${imported.replace(/\n/g, ' ')})`);
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  assert((await imp.getByLabel('Clues to import').inputValue()) === '', 'once imported, the box starts empty');
  await page.keyboard.press('Escape');

  // ---------- Row values and Daily Doubles ----------
  const row1 = page.getByLabel('Row 1 value');
  await row1.fill('');
  await row1.press('Tab');
  assert((await row1.inputValue()) === '200' && (await page.locator('.tile .val').first().innerText()).startsWith('$200'), 'a row value left blank keeps its value');
  // Whole points, 0 or more (like a clue's own value).
  await row1.fill('-100');
  await row1.press('Tab');
  const neg = await page.locator('.tile .val').first().innerText();
  assert(neg.startsWith('$0') && (await row1.inputValue()) === '0', `a row value can't be negative (${neg})`);
  await row1.fill('250.6');
  await row1.press('Tab');
  assert((await row1.inputValue()) === '251', 'a row value is whole points');
  await row1.fill('200');
  await row1.press('Tab');
  const dd = page.getByLabel('How many Daily Doubles');
  await dd.fill('50');
  await page.getByRole('button', { name: '🔀 Randomize' }).click();
  const placed = await page.locator('.tile .dd', { hasText: 'DD' }).count();
  assert(placed === 6 && (await dd.inputValue()) === '6', `Daily Doubles are clamped and the box says how many were placed (${placed}, ${await dd.inputValue()})`);

  // ---------- Standard dice and new wheels from a tile ----------
  await page.locator('.tile').nth(2).click();
  await page.getByLabel('Type').selectOption('dice');
  const diceOpts = await page.getByLabel('Which dice').locator('option').allInnerTexts();
  assert(diceOpts.some((o) => o.includes('2d6')) && diceOpts.some((o) => o.includes('Add dice')), `a dice tile can use standard dice (${diceOpts.join(', ')})`);
  await page.getByLabel('Which dice').selectOption({ label: '🎲 2d6' });
  await page.getByLabel('Type').selectOption('wheel');
  await page.getByLabel('Which wheel').selectOption({ label: '＋ Add wheel…' });
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
  // ＋ Add dice… undone, and redone, stays on the clue it was made from (not the Wheels & Dice tab).
  const clueBox = page.getByRole('dialog', { name: 'Edit clue' });
  const whichDice = page.getByLabel('Which dice');
  const diceShows = (t) => whichDice.locator('option:checked', { hasText: t }).waitFor({ state: 'attached', timeout: 3000 }).then(() => true, () => false);
  const diceWas = await whichDice.evaluate((s) => s.selectedOptions[0].text);
  await whichDice.selectOption({ label: '＋ Add dice…' });
  const newDice = page.getByRole('dialog', { name: 'Dice' });
  await newDice.waitFor();
  await page.keyboard.press('Escape');
  await newDice.waitFor({ state: 'detached' });
  const diceMade = await whichDice.evaluate((s) => s.selectedOptions[0].text);
  await clueBox.locator('header .value').click();
  await page.keyboard.press('Control+z');
  assert((await diceShows(diceWas)) && (await clueBox.isVisible()), `Ctrl+Z of ＋ Add dice… keeps the clue open (back on ${diceWas})`);
  await page.keyboard.press('Control+y');
  assert((await diceShows(diceMade)) && (await clueBox.isVisible()), `and so does Ctrl+Y (on ${diceMade} again)`);
  // (Undone again: the board game's ＋ Add dice… below makes the game's first dice.)
  await page.keyboard.press('Control+z');
  await diceShows(diceWas);
  await whichDice.selectOption({ label: '🎲 2d6' });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(800);
  assert(!(await page.locator('nav .problem').allInnerTexts()).some((l) => l.includes('wheel/dice')), 'a tile with standard dice is not a problem');
  // The board's tiles say what the clue editor and the checklist do: a dice tile with its dice warns of nothing (its
  // question is optional), a wheel tile with no wheel says so, and a tile's name says its type and what its badges show.
  const diceTile = page.locator('.tile').nth(2);
  const tileLabel = (t) => t.getAttribute('aria-label');
  assert((await diceTile.locator('.missing').count()) === 0 && /, dice tile: no question$/.test(await tileLabel(diceTile)), `a dice tile with its dice warns of nothing (${await tileLabel(diceTile)})`);
  const wheelTile = page.locator('.tile').nth(3);
  await wheelTile.click();
  await page.getByLabel('Type').selectOption('wheel');
  await page.getByPlaceholder('Type the question…').fill('Spin it');
  await page.getByRole('button', { name: 'Done' }).click();
  assert(
    (await wheelTile.locator('.missing').allInnerTexts()).join() === 'No wheel chosen' && /, wheel tile: Spin it, no wheel chosen$/.test(await tileLabel(wheelTile)),
    `a wheel tile with no wheel says so (${await tileLabel(wheelTile)})`,
  );
  const everyoneTile = page.locator('.tile').nth(4);
  await everyoneTile.click();
  await page.getByLabel('Type').selectOption('standard');
  await page.getByLabel(/Everyone answers/).check();
  await page.getByLabel('Tile shows').fill('MYSTERY');
  await page.getByRole('button', { name: 'Done' }).click();
  assert(
    (await everyoneTile.locator('.dd', { hasText: '✍' }).count()) === 1 && (await everyoneTile.innerText()).includes('“MYSTERY”') && (await tileLabel(everyoneTile)).includes(', everyone answers, tile shows “MYSTERY”: '),
    `a ✍ Everyone answers tile shows ✍ and what the tile shows (${await tileLabel(everyoneTile)})`,
  );
  const ddTile = page.locator('.tile', { has: page.locator('.dd', { hasText: 'DD' }) }).first();
  assert((await tileLabel(ddTile)).includes(', Daily Double: '), `a Daily Double's name says so (${await tileLabel(ddTile)})`);
  await page.getByRole('button', { name: '🎡 Wheels & Dice' }).click();
  assert(await page.getByRole('button', { name: 'Spicy Wheel' }).isVisible(), 'and the wheel made there is in Wheels & Dice');
  // A slice's weight: named after its slice, and never 0 or less (the slice would drop off the wheel).
  await page.getByRole('button', { name: 'Spicy Wheel' }).click();
  const weight = page.getByLabel('Option 1 weight');
  await weight.fill('0');
  await weight.press('Tab');
  assert((await weight.inputValue()) === '0.1', `a weight of 0 is the least a slice can have (${await weight.inputValue()})`);
  await weight.fill('');
  await weight.press('Tab');
  assert((await weight.inputValue()) === '1', 'a blank weight is 1');
  await weight.fill('-3');
  await weight.press('Tab');
  assert((await weight.inputValue()) === '0.1', 'and a negative one the least');
  assert((await page.locator('main main').count()) === 0 && (await page.locator('main').count()) === 1, 'no main inside main');

  // ---------- Board game: Move by a new dice ----------
  await addRound(/Board game/);
  await page.getByLabel('Move by').selectOption({ label: '＋ Add dice…' });
  const dpop = page.getByRole('dialog', { name: 'Dice' });
  await dpop.waitFor();
  await dpop.getByRole('button', { name: 'Done' }).click();
  assert((await page.getByLabel('Dice', { exact: true }).inputValue()) === 'Dice 1', 'Move by ＋ Add dice… makes dice and moves by them');
  assert((await page.locator('.bge').getByRole('button', { name: 'Undo (Ctrl+Z)' }).count()) === 0, 'the board game has no ↶ of its own (the header has it)');
  await page.getByRole('button', { name: /Board backdrop/ }).click();
  assert((await page.locator('.se').getByRole('button', { name: 'Undo (Ctrl+Z)' }).count()) === 0, 'nor its backdrop editor');

  // ---------- Stat presets ----------
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  assert(await page.getByRole('button', { name: /HP \(bar/ }).isDisabled(), 'a stat preset can only be added once');
  const hp = await typingIn();
  assert(hp.label === 'Stat name' && hp.value === 'HP' && hp.all, `a stat preset puts the typing in its name (${JSON.stringify(hp)})`);

  // ---------- RPG: doorways and characters ----------
  await addRound(/RPG/);
  // (The world's settings wait under ⋯ Advanced.)
  await page.locator('summary', { hasText: 'Advanced: carry this adventure into another round' }).click();
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
  // 📦 Item ▾ with no items yet: make one here, or go to 📊 Stats & Items.
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  const itemMenu = await page.getByRole('menu').getByRole('menuitem').allInnerTexts();
  assert(itemMenu.some((t) => t.includes('Add new item here')) && itemMenu.some((t) => t.includes('Stats & Items')), `📦 Item ▾ with no items offers to make one (${itemMenu.join(', ')})`);
  await page.getByRole('menu').getByRole('menuitem', { name: /Add new item here/ }).click();
  assert(
    (await page.getByLabel('Object class').inputValue()) === 'item' && (await page.getByLabel('Item', { exact: true }).evaluate((s) => s.selectedOptions[0].text)) === 'Item 1',
    'which puts a new catalog item on the screen',
  );
  await page.getByRole('button', { name: '🧙 Character' }).click();
  assert((await page.getByLabel('Object class').inputValue()) === 'npc', 'the 🧙 Character button places a character');
  const npcName = await typingIn();
  assert(npcName.value === 'Character' && npcName.all, `with its name ready to type over (${JSON.stringify(npcName)})`);
  await page.getByRole('button', { name: '＋ Add stat (power, HP…)' }).click();
  const npcStat = await typingIn();
  assert(npcStat.label === 'Stat name' && npcStat.all, 'its ＋ Stat puts the typing in the stat’s name');
  await page.getByRole('button', { name: 'Delete stat', exact: true }).click();
  assert((await note.innerText()).includes('Deleted stat “Power” of “Character”'), 'deleting its stat says so, with Undo');
  await page.getByRole('button', { name: '＋ Add dialogue slide' }).click();
  await page.getByRole('dialog', { name: /Dialogue slide/ }).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Delete dialogue' }).click();
  assert((await note.innerText()).includes('Deleted the dialogue slide of “Character”'), 'and so does deleting its dialogue slide');
  await note.getByRole('button', { name: '↶ Undo' }).click();
  assert((await page.getByRole('button', { name: 'Edit dialogue slide…' }).count()) === 1, 'whose Undo brings it back');
  await page.getByRole('button', { name: '◀ Back to the map' }).click();

  // ---------- ＋ Add item and ＋ Add shop put the typing in the new one's name ----------
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: '＋ Add item' }).click();
  const item = await typingIn();
  assert(item.label === 'Item name' && item.value === 'Item 2' && item.all, `＋ Add item puts the typing in its name (${JSON.stringify(item)})`);
  await page.getByRole('button', { name: '＋ Add shop' }).click();
  const shop = await typingIn();
  assert(shop.label === 'Shop name' && shop.value === 'Shop 1' && shop.all, `＋ Add shop too (${JSON.stringify(shop)})`);

  // ---------- Pre-game: 📋 Game rules ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  const rules = await openRules(page);
  const boxes = await rules.locator('.check input[type=checkbox]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  assert(boxes.length > 3 && new Set(boxes).size === 1, `every checkbox in 📋 Game rules is the same size (${boxes})`);
  await page.getByRole('button', { name: '◀ Back to editor' }).click();

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
  // Its text box deleted, then the question typed again in the Question box: the new text box is on top of the rest (it
  // went under them), in the clue text font (it came back in a new text box's).
  const se = page.locator('.modal .se');
  await se.getByRole('button', { name: /◼ Shape/ }).click();
  await page.getByRole('button', { name: '▭ Rectangle' }).click();
  await se.locator('.layers-box .row').filter({ hasNotText: 'Rectangle' }).locator('.name').click();
  await page.keyboard.press('Delete');
  await page.locator('.modal [data-field="q"]').fill('Back on top');
  const items = await se.locator('.canvas .slide .el').evaluateAll((els) =>
    els.map((e) => ({ text: !!e.querySelector('.text'), z: Number(e.style.zIndex), font: e.querySelector('.text') ? getComputedStyle(e.querySelector('.text')).fontFamily : '' })),
  );
  const retyped = items.find((e) => e.text);
  const shape = items.find((e) => !e.text);
  assert(items.length === 2 && retyped.z > shape.z && retyped.font.includes('Bangers'), `the question typed again goes on top, in the clue text font (${JSON.stringify(items)})`);
  await page.getByRole('button', { name: 'Done' }).click();

  // ---------- A copy of a copy is "(copy 2)", not "(copy) (copy)" ----------
  await tabs.nth(0).focus();
  await page.keyboard.press('Control+d');
  await page.waitForFunction(() => document.activeElement?.matches('nav > button.round-tab') && document.activeElement.textContent.includes('(copy)'));
  await page.keyboard.press('Control+d');
  const roundNames = (await tabs.allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());
  assert(roundNames.some((n) => n.endsWith('(copy 2)')) && !roundNames.some((n) => n.includes('(copy) (copy)')), `duplicating a copy numbers it on (${roundNames.join(', ')})`);

  // ---------- A game with only a title and a theme counts: New asks, and keeps it in Recent games ----------
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await page.locator('.data-notice').waitFor();
  const title = header.getByLabel('Game title');
  await title.fill('Only a title and a theme');
  await title.press('Enter');
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.locator('input[type=color]').first().evaluate((el) => {
    el.value = '#123456';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await page.locator('.data-notice', { hasText: '“Only a title and a theme” was replaced.' }).waitFor();
  assert(true, 'New asks before replacing a game with only a title and theme changes, and keeps it in Recent games');

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('editorfixes: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'editorfixes-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
