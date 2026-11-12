// The board editor by hand and by keyboard: round tabs drag, move, rename, copy and delete; clue tiles drag onto
// each other to swap (Ctrl: copy), the arrows walk the board and a clue copies, pastes and clears; categories and
// rows go in, out and around anywhere; the clue editor's Alt+arrows match the board; and the Final and the
// Tiebreaker have the quick Question / Answer fields. Every gesture is one named step, and nothing asks first.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, dragBy } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const dialogs = [];
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

const notice = page.locator('.history-notice');
const header = page.locator('.editor > header');
const undoTitle = () => header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
const tile = (cat, row) => page.locator(`[data-tile="${cat},${row}"]`);
const tileText = (cat, row) => tile(cat, row).innerText();
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-tile') ?? document.activeElement?.getAttribute('aria-label'));
/** The focus comes to this tile ("cat,row") within a few seconds. */
const focusComes = (t) => page.waitForFunction((t) => document.activeElement?.getAttribute('data-tile') === t, t, { timeout: 3000 }).then(() => true, () => false);
const catNames = () => page.locator('.cat textarea').evaluateAll((els) => els.map((e) => e.value));
const tabs = page.locator('nav > button.round-tab');
const roundNames = async () => (await tabs.allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());
const key = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(200);
};
/** The slide editor shows this text (its text boxes may be in capitals). */
const slideShows = async (t) => (await page.locator('.se').first().innerText()).toLowerCase().includes(t.toLowerCase());
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

/** Type a clue's question and answer in the clue editor, then close it. */
async function writeClue(cat, row, q, a) {
  await tile(cat, row).click();
  await page.keyboard.type(q);
  await page.keyboard.press('Tab');
  await page.keyboard.type(a);
  await key('Escape');
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.waitForTimeout(300);

  // ---------- ED-18: the board is one tab stop, the arrows walk it ----------
  await writeClue(0, 0, 'Who is Pepe?', 'A frog');
  await writeClue(1, 0, 'What is skibidi?', 'A toilet');
  assert((await focused()) === '1,0', 'closing the clue editor goes back to its tile');
  assert((await page.locator('.tile[tabindex="0"]').count()) === 1, 'the board is one tab stop');
  await key('ArrowLeft');
  await key('ArrowRight');
  await key('ArrowDown');
  assert((await focused()) === '1,1', 'the arrows move between tiles');
  await key('ArrowUp');
  await key('ArrowUp');
  assert((await focused()) === 'Category 2 name', '↑ from the top row goes to the category name');
  await key('End');
  await key('ArrowDown');
  assert((await focused()) === '1,0', 'and ↓ at the end of the name comes back down');
  await key('Enter');
  assert(await page.locator('.clue-editor, [role="dialog"]').first().isVisible(), 'Enter opens the clue');
  // ED-19: Alt+arrows go like the board.
  await key('Alt+ArrowLeft');
  assert((await page.getByPlaceholder('Type the question…').inputValue()) === 'Who is Pepe?', 'Alt+← goes to the same row of the category to the left');
  await key('Alt+ArrowDown');
  assert((await page.getByPlaceholder('Type the question…').inputValue()) === '', 'Alt+↓ goes to the clue below');
  await key('Alt+ArrowRight');
  await key('Alt+ArrowUp');
  assert((await page.getByPlaceholder('Type the question…').inputValue()) === 'What is skibidi?', 'Alt+→ and Alt+↑ go across and up');
  await page.waitForFunction(() => /Category 2 \$200\.$/.test(document.getElementById('live-region')?.dataset.said ?? ''));
  assert(true, 'a screen reader is told which tile the clue editor moved to');
  await key('Escape');
  assert((await focused()) === '1,0', 'Done goes back to the tile it ended on');
  // Opened on one tile and moved on with Ctrl+Enter: closing it goes to the tile it ended on, not the one it opened from.
  await key('Enter');
  await key('Control+Enter');
  await key('Control+Enter');
  await key('Escape');
  assert((await focused()) === '1,2', `closing the clue editor goes to the tile it ended on (${await focused()})`);
  await key('ArrowUp');
  await key('ArrowUp');

  // Copy, paste, clear.
  await key('ArrowLeft');
  await key('Control+c');
  await key('ArrowRight');
  await key('ArrowRight');
  await key('ArrowDown');
  await key('Control+v');
  assert((await tileText(2, 1)).includes('Who is Pepe?'), 'Ctrl+C / Ctrl+V copy a whole clue to another tile');
  assert((await undoTitle()).startsWith('Undo: Pasted a clue on Category 3 $400'), `pasting is one named step (${await undoTitle()})`);
  await key('Delete');
  assert(!(await tileText(2, 1)).includes('Who is Pepe?') && (await notice.innerText()).startsWith('Cleared Category 3 $400'), 'Delete clears the clue, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForTimeout(200);
  assert((await tileText(2, 1)).includes('Who is Pepe?'), "and the note's Undo puts it back");
  await tile(2, 1).click({ button: 'right' });
  const menu = page.getByRole('menu');
  const items = await menu.getByRole('menuitem').allInnerTexts();
  assert(['Copy clue', 'Paste clue here', 'Clear clue', 'Insert above', 'Delete row 2'].every((x) => items.some((i) => i.includes(x))), 'the tile menu copies, pastes, clears and does rows');
  {
    // The menus' one order: Edit, Make it a…, Copy / Paste, the row's own group (headed, its delete at its end), Clear last.
    const at = (x) => items.findIndex((i) => i.includes(x));
    const order = ['Edit clue', 'Standard', 'Copy clue', 'Paste clue here', 'Move up', 'Insert above', 'Delete row 2', 'Clear clue'].map(at);
    const heads = await menu.locator('.heading').allInnerTexts();
    assert(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])) && items.at(-1).includes('Clear clue') && heads.includes('Row 2 · $400'), `the tile menu goes in the one order (${items.join(' | ')})`);
  }
  await menu.getByRole('menuitem', { name: /Clear clue/ }).click();
  assert(!(await tileText(2, 1)).includes('Who is Pepe?'), 'Clear clue from the menu');
  assert(await tile(2, 1).evaluate((el) => el === document.activeElement), 'the focus goes back to the tile after its menu (its keys go on working)');
  await shot('board-1280');

  // ---------- ED-16: drag a tile onto another ----------
  await dragBy(page, tile(0, 0), tile(3, 2));
  assert((await tileText(3, 2)).includes('Who is Pepe?') && (await tileText(0, 0)).includes('No question yet'), 'dragging a tile onto another swaps them');
  assert((await undoTitle()).startsWith('Undo: Swapped Category 1 $200 and Category 4 $600'), `one named step (${await undoTitle()})`);
  assert(await focusComes('3,2'), `the focus goes with the tile dragged (${await focused()})`);
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await key('Control+z');
  assert((await tileText(0, 0)).includes('Who is Pepe?') && !(await tileText(3, 2)).includes('Who is Pepe?'), 'Ctrl+Z swaps them back');
  {
    // (Ctrl pressed once the drag is under way, as the browser's drag needs.)
    await tile(4, 4).scrollIntoViewIfNeeded();
    const [a, b] = [await tile(1, 0).boundingBox(), await tile(4, 4).boundingBox()];
    await page.mouse.move(a.x + 20, a.y + 20);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + 40, { steps: 3 });
    await page.keyboard.down('Control');
    await page.mouse.move(b.x + 20, b.y + 20, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
  }
  assert((await tileText(4, 4)).includes('What is skibidi?') && (await tileText(1, 0)).includes('What is skibidi?'), 'Ctrl-dragging copies instead');
  assert((await undoTitle()).startsWith('Undo: Copied Category 2 $200 to Category 5 $1,000'), `copying is a named step too (${await undoTitle()})`);

  // ---------- ED-17: categories ----------
  await page.locator('.cat').nth(1).locator('.grip').click({ button: 'right' });
  const catItems = await menu.getByRole('menuitem').allInnerTexts();
  assert(['Move left', 'Insert category left', 'Insert category right', 'Duplicate', 'Image', 'Clear its clues', 'Delete category'].every((x) => catItems.some((i) => i.includes(x))), 'right-clicking a category offers its menu');
  await menu.getByRole('menuitem', { name: /Insert category left/ }).click();
  await page.waitForTimeout(200);
  assert((await catNames()).length === 7 && (await catNames())[1] === 'New category', `Insert puts a new category there, named "New category" (${(await catNames()).join(', ')})`);
  assert((await focused()) === 'Category 2 name', 'with its name ready to type');
  await page.locator('.cat').nth(1).locator('.grip').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Delete category/ }).click();
  assert((await catNames()).length === 6 && (await notice.innerText()).startsWith('Deleted category “New category”'), 'Delete is done at once, with a note');
  await page.locator('.cat').nth(0).locator('.grip').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Clear its clues/ }).click();
  assert((await tileText(0, 0)).includes('No question yet') && (await notice.innerText()).startsWith('Cleared the clues of “Category 1”'), 'Clear its clues, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForTimeout(200);
  const grip = page.locator('.cat').nth(0).locator('.grip');
  const third = await page.locator('.cat').nth(2).boundingBox();
  await dragBy(page, grip, { x: third.x + third.width * 0.75, y: third.y + 20 });
  assert((await catNames()).slice(0, 3).join('|') === 'Category 2|Category 3|Category 1', `a category drags to a new place (${(await catNames()).join(', ')})`);
  assert((await tileText(2, 0)).includes('Who is Pepe?'), 'with its clues');
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await key('Control+z');
  assert((await catNames()).slice(0, 3).join('|') === 'Category 1|Category 2|Category 3', 'Ctrl+Z moves it back');
  // A made-up name ("Category 3") is selected by a click in it, to type over; a name of your own isn't.
  await page.getByLabel('Category 3 name').click();
  await page.keyboard.type('Snacks');
  assert((await catNames())[2] === 'Snacks', `a click in a made-up category name selects it, so typing replaces it (${(await catNames())[2]})`);
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await page.getByLabel('Category 3 name').click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  assert((await catNames())[2] === 'Snacks!', 'a name of your own keeps the caret where it’s clicked');
  await page.getByLabel('Category 3 name').fill('Category 3');
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  // A right-click on a made-up name (which the app selects as the keys go in) opens the category menu, not the browser's.
  await page.getByLabel('Category 3 name').click({ button: 'right' });
  const catMenuShown = await menu.getByRole('menuitem', { name: /Delete category/ }).waitFor({ timeout: 3000 }).then(() => true, () => false);
  assert(catMenuShown, 'right-clicking a made-up category name opens the category menu');
  await page.keyboard.press('Escape');
  // Typing in the name: a right-click there is the browser's cut, copy and paste (no menu of ours); Shift+F10 is still the category's.
  await page.getByLabel('Category 3 name').click();
  await page.keyboard.press('End');
  await page.getByLabel('Category 3 name').click({ button: 'right' });
  assert((await menu.count()) === 0, 'a right-click in a category name being typed in leaves it to the browser’s Cut / Copy / Paste');
  await page.keyboard.press('Shift+F10');
  assert(await menu.getByRole('menuitem', { name: /Delete category/ }).waitFor({ timeout: 3000 }).then(() => true, () => false), 'Shift+F10 in the name still opens the category menu');
  await page.keyboard.press('Escape');
  await page.locator('main').click({ position: { x: 4, y: 4 } });

  // ---------- ED-20: rows anywhere ----------
  await page.getByLabel('Row 1 value').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Insert above/ }).click();
  await page.waitForTimeout(200);
  const values = () => page.locator('.values input[aria-label^="Row"]').evaluateAll((els) => els.map((e) => e.value).join(','));
  assert((await values()) === '200,400,600,800,1000,1200' && (await tileText(0, 1)).includes('Who is Pepe?'), `Insert above: the clues move down, the values stay (${await values()})`);
  await page.getByLabel('Row 2 value').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Move up/ }).click();
  assert((await tileText(0, 0)).includes('Who is Pepe?') && (await undoTitle()).startsWith('Undo: Moved row 2 up'), '▲ Move up in the row’s menu moves its clues, one step');
  await tile(0, 1).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Delete row 2/ }).click();
  assert((await values()) === '200,400,600,800,1000' && (await notice.innerText()).startsWith('Deleted row 2'), 'Delete row, with a note');
  // From a tile's menu, the keys stay on the board: on the tile now in its place, and on the tile moved with its row.
  assert(await focusComes('0,1'), `after Delete row from a tile's menu, the focus is on the tile now in its place (${await focused()})`);
  // The last row's tiles go with it: the focus goes to the tile above.
  await tile(0, 4).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Delete row 5/ }).click();
  assert((await values()) === '200,400,600,800' && (await focusComes('0,3')), `after Delete row on the last row, the focus is on the tile above (${await focused()})`);
  await key('ArrowUp');
  assert((await focused()) === '0,2', 'and the arrows go on from there');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.getByLabel('Row 5 value', { exact: true }).waitFor({ timeout: 3000 });
  assert((await values()) === '200,400,600,800,1000', 'Undo brings the last row back');
  await tile(0, 0).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Move down/ }).click();
  assert((await focusComes('0,1')) && (await tileText(0, 1)).includes('Who is Pepe?'), `after ▼ Move down from a tile's menu, the focus goes with the tile (${await focused()})`);
  await key('ArrowUp');
  assert((await focused()) === '0,0', 'and the arrows go on from there');
  // Alt+arrows on a tile move its row or its category, and on a category's name the category; the keys go with them.
  await key('ArrowDown');
  await key('Alt+ArrowUp');
  assert((await focusComes('0,0')) && (await tileText(0, 0)).includes('Who is Pepe?') && (await undoTitle()).startsWith('Undo: Moved row 2 up'), `Alt+↑ on a tile moves its row, the keys going with it (${await focused()})`);
  await key('Alt+ArrowRight');
  assert((await focusComes('1,0')) && (await catNames()).slice(0, 2).join('|') === 'Category 2|Category 1' && (await tileText(1, 0)).includes('Who is Pepe?'), `Alt+→ on a tile moves its category (${await focused()})`);
  await key('ArrowUp');
  await key('Alt+ArrowLeft');
  assert((await catNames()).slice(0, 2).join('|') === 'Category 1|Category 2' && (await focused()) === 'Category 1 name', `Alt+← in a category's name moves it back, the keys staying in its name (${await focused()})`);
  // The tile menu's Make it a…: the kind it is ticked; 🎡 Wheel tile… makes it one and opens the clue at Which wheel.
  await tile(2, 3).click({ button: 'right' });
  const kinds = (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]);
  assert(
    ['✓ Standard', '⭐ Daily Double', '🤝 Partner clue', '🎡 Wheel tile…', '🎲 Dice tile…', '✍ Everyone answers', '⬚ Empty tile'].every((x) => kinds.includes(x)) && (await menu.getByText('Make it a…').count()) === 1,
    `a tile's menu has Make it a…, the kind it is ticked (${kinds.join(' | ')})`,
  );
  await menu.getByRole('menuitem', { name: '🎡 Wheel tile…' }).click();
  await page.getByRole('dialog', { name: 'Edit clue' }).waitFor();
  const atPicker = await page.waitForFunction(() => document.activeElement?.closest('label')?.textContent?.includes('Which wheel'), null, { timeout: 3000 }).then(() => true, () => false);
  assert(atPicker && (await undoTitle()).startsWith('Undo: Made Category 3 $800 a wheel tile'), '🎡 Wheel tile… makes it one (one step) and opens the clue with the keys in Which wheel');
  await key('Escape');
  await key('Control+z');
  assert(!(await tileText(2, 3)).includes('🎡'), 'Ctrl+Z makes it a standard tile again');
  assert(!dialogs.length, 'nothing asked first');

  // ---------- ED-15: round tabs ----------
  await addRound(/Jeopardy board/);
  assert((await roundNames()).join('|') === 'Jeopardy!|Double Jeopardy!|Final Jeopardy!', 'three rounds');
  await tabs.nth(0).focus();
  await key('Alt+ArrowDown');
  assert((await roundNames()).join('|') === 'Double Jeopardy!|Jeopardy!|Final Jeopardy!', 'Alt+↓ on a tab moves its round later');
  assert((await page.evaluate(() => document.activeElement?.textContent?.trim())).endsWith('Jeopardy!') && (await page.locator('.round-tab:focus').innerText()).includes(' Jeopardy!'), 'and the tab keeps the focus');
  await key('Alt+ArrowUp');
  assert((await roundNames()).join('|') === 'Jeopardy!|Double Jeopardy!|Final Jeopardy!', 'Alt+↑ moves it back');
  await key('F2');
  await page.keyboard.type('Memes');
  await key('Enter');
  assert((await roundNames())[0] === 'Memes' && (await undoTitle()).startsWith('Undo: Renamed round'), 'F2 renames it in place');
  await tabs.nth(1).dblclick();
  await page.keyboard.type('Brainrot');
  await key('Enter');
  assert((await roundNames())[1] === 'Brainrot', 'and so does a double-click');
  await key('Control+d');
  assert((await roundNames()).join('|') === 'Memes|Brainrot|Brainrot (copy)|Final Jeopardy!' && (await page.locator('.round-tab:focus').innerText()).includes('(copy)'), 'Ctrl+D duplicates it, focus on the copy');
  await key('Delete');
  assert((await roundNames()).join('|') === 'Memes|Brainrot|Final Jeopardy!' && (await notice.innerText()).startsWith('Deleted round “Brainrot (copy)”'), 'Delete deletes it at once, with a note');
  await dragBy(page, tabs.nth(0), { x: (await tabs.nth(1).boundingBox()).x + 20, y: (await tabs.nth(1).boundingBox()).y + (await tabs.nth(1).boundingBox()).height - 3 });
  assert((await roundNames()).join('|') === 'Brainrot|Memes|Final Jeopardy!' && (await undoTitle()).startsWith('Undo: Moved round “Memes” later'), 'a tab drags to a new place, one step');
  await tabs.nth(0).click({ button: 'right' });
  assert((await menu.getByRole('menuitem').allInnerTexts()).some((i) => i.includes('Rename')), 'the tab menu can rename');
  await page.keyboard.press('Escape');
  assert(!dialogs.length, 'and nothing asked first');

  // ---------- ED-37: the Final's and the Tiebreaker's quick fields ----------
  await tabs.nth(2).click();
  await page.getByPlaceholder('Type the final question…').pressSequentially('Best meme of 2020?');
  await page.getByPlaceholder('Type the answer…').pressSequentially('Doge');
  assert(await slideShows('Best meme of 2020?'), "the Final's quick Question field writes on its slide");
  await page.getByRole('tab', { name: /Answer slide/ }).click();
  assert(await slideShows('Doge'), 'and Answer on the answer slide');
  await page.getByRole('tab', { name: /Question slide/ }).click();
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(800);
  await key('Control+z');
  assert((await page.getByPlaceholder('Type the answer…').inputValue()) === '' && (await page.getByRole('tab', { name: /Answer slide/ }).getAttribute('aria-selected')) === 'true', 'undoing the answer shows the answer slide');
  await shot('final-1280');
  // The Final can have more question slides too: ＋ Add slide, typed on with the quick field, then deleted.
  await page.getByRole('tab', { name: /Question slide/ }).click();
  await page.getByRole('button', { name: '＋ Add slide' }).click();
  await page.getByRole('tab', { name: 'Question 2' }).waitFor();
  assert((await undoTitle()).startsWith('Undo: Added question slide 2 to “Final Jeopardy!”'), `＋ Add slide on the Final is one named step (${await undoTitle()})`);
  // At 1280 and 1366 beside the sidebar, the slide's row fits: the group drops under the tabs rather than run off the
  // right edge, so 🗑 Delete slide is whole and the page doesn't scroll sideways.
  const rowFits = () =>
    page.evaluate(() => {
      const del = [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === '🗑 Delete slide');
      let sideways = false;
      for (let el = del.parentElement; el; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'hidden') sideways = true;
      return { right: del.getBoundingClientRect().right, width: innerWidth, sideways };
    });
  for (const width of [1280, 1366]) {
    await page.setViewportSize({ width, height: 720 });
    const fit = await rowFits();
    assert(fit.right <= fit.width && !fit.sideways, `at ${width}, the Final's slide row fits: 🗑 Delete slide whole (right edge ${Math.round(fit.right)}), no sideways scroll`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByPlaceholder('Type the final question…').fill('Then the real question');
  assert(await slideShows('Then the real question'), "the Final's quick field writes on its second question slide");
  // Moved and then undone, the slide that moved back shows (not the first one), as on a clue.
  await page.getByRole('button', { name: 'Move slide earlier' }).click();
  await page.getByRole('tab', { name: 'Question 1', selected: true }).waitFor({ timeout: 3000 });
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await key('Control+z');
  const movedBack = await page.getByRole('tab', { name: 'Question 2', selected: true }).waitFor({ timeout: 3000 }).then(() => true, () => false);
  assert(movedBack && (await page.getByPlaceholder('Type the final question…').inputValue()) === 'Then the real question', 'Ctrl+Z puts the Final’s moved slide back, and shows it there');
  await page.getByRole('button', { name: '🗑 Delete slide' }).click();
  await page.getByRole('tab', { name: 'Question slide' }).waitFor();
  assert(await slideShows('Best meme of 2020?'), '🗑 Delete slide leaves the first question slide as it was');
  // Ctrl+D on its only question slide's tab duplicates it too, as on a clue's.
  await page.getByRole('tab', { name: 'Question slide' }).click();
  await page.keyboard.press('Control+d');
  await page.getByRole('tab', { name: 'Question 2' }).waitFor({ timeout: 3000 });
  assert((await undoTitle()).startsWith('Undo: Duplicated question slide 1 of “Final Jeopardy!”'), `Ctrl+D on the Final's only question slide's tab duplicates it (${await undoTitle()})`);
  await page.keyboard.press('Control+z');
  await page.getByRole('tab', { name: 'Question slide' }).waitFor({ timeout: 3000 });
  // A key on a round's tab is the tab's alone, even with a slide item selected.
  await page.getByRole('tab', { name: /Question slide/ }).click();
  await page.locator('.canvas .hit').first().click();
  const slideItems = await page.locator('.canvas .hit').count();
  await tabs.nth(0).focus();
  await key('ArrowDown');
  await key('Delete');
  assert((await roundNames()).length === 2 && (await page.locator('.canvas .hit').count()) === slideItems && (await undoTitle()).startsWith('Undo: Deleted round'), 'Delete on a round tab deletes the round, not the selected slide item too');
  await key('Control+z');
  // Off, the tiebreaker's menu starts with what a click on it does: ＋ Add tiebreaker (no ❓ Open it, no Turn it off).
  const tbMenu = async () => {
    await page.locator('nav').getByRole('button', { name: /tiebreaker/i }).click({ button: 'right' });
    const items = await page.getByRole('menu').getByRole('menuitem').evaluateAll((els) => els.map((e) => `${e.innerText.split('\n')[0]}${e.classList.contains('danger') ? ' (red)' : ''}`));
    await page.keyboard.press('Escape');
    return items;
  };
  const tbOff = await tbMenu();
  assert(tbOff.join('|') === '＋ Add tiebreaker', `off, the tiebreaker's menu is ＋ Add tiebreaker, as a click (${tbOff.join(' · ')})`);
  // ＋ Add tiebreaker (optional) turns it on in one named step, with the keys in its question box.
  await page.getByRole('button', { name: 'Add tiebreaker (optional)' }).click();
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="q"]'), null, { timeout: 3000 });
  assert((await page.getByLabel('Include a tiebreaker clue').isChecked()) && (await undoTitle()).startsWith('Undo: Tiebreaker on'), `＋ Add tiebreaker turns it on, one step (${await undoTitle()})`);
  // On, it opens it, and 🗑 Turn it off (it takes the clue away) is last and red.
  const tbOn = await tbMenu();
  assert(tbOn.join('|') === '❓ Open it|🗑 Turn it off (red)', `on, its menu is ❓ Open it, then 🗑 Turn it off last in red (${tbOn.join(' · ')})`);
  // Its tick box turns it off again: the empty page.
  await page.getByLabel('Include a tiebreaker clue').uncheck();
  assert((await page.locator('.empty .ic').innerText()) === '❓', 'the tiebreaker’s empty page shows ❓, as in play (🤝 is a partner clue)');
  // Ticking it puts the keys in its question box, ready to type.
  await page.getByLabel('Include a tiebreaker clue').focus();
  await page.keyboard.press('Space');
  const tbTab = (await page.getByRole('button', { name: /^Tiebreaker/ }).innerText()).trim();
  assert(tbTab === '❓ Tiebreaker', `and so does its button in the round list once it’s on (${tbTab})`);
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="q"]'), null, { timeout: 3000 }).catch(() => {});
  await page.keyboard.type('How many rizz?');
  assert((await page.getByPlaceholder('Type the tiebreaker question…').inputValue()) === 'How many rizz?', 'ticking Include a tiebreaker clue puts the keys in its question box');
  assert(await slideShows('How many rizz?'), "the Tiebreaker's quick field writes on its slide");
  // Like a clue, the tiebreaker can have more question slides: ＋ Add slide opens a second one, its quick field types on it.
  await page.getByRole('button', { name: '＋ Add slide' }).click();
  await page.getByRole('tab', { name: 'Question 2' }).waitFor();
  assert((await undoTitle()).startsWith('Undo: Added question slide 2 to the tiebreaker'), `＋ Add slide on the tiebreaker is one named step (${await undoTitle()})`);
  await page.getByPlaceholder('Type the tiebreaker question…').fill('Second clue line');
  assert(await slideShows('Second clue line'), "the quick field writes on the open (second) question slide");
  await page.getByRole('tab', { name: 'Question 1' }).click();
  assert(await slideShows('How many rizz?'), 'its first question slide keeps its words');
  await page.getByRole('tab', { name: 'Question 2' }).click();
  await page.getByRole('button', { name: '🗑 Delete slide' }).click();
  assert((await page.getByRole('tab', { name: 'Question slide' }).count()) === 1, '🗑 Delete slide takes it out (back to one question slide)');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await tabs.nth(0).click();
  await shot('board-1920');

  assert(!dialogs.length, 'no browser dialogs');

  // A wheel tile pasted into another game brings its wheel along (not "⚠ Deleted wheel").
  await page.getByRole('button', { name: /Wheels, Dice & Deals/ }).click();
  await page.getByRole('button', { name: '＋ Add wheel' }).click();
  await tabs.nth(0).click();
  await tile(2, 2).click();
  await page.locator('select').first().selectOption('wheel');
  await page.locator('select').nth(1).selectOption({ label: 'Wheel 1' });
  await key('Escape');
  await key('Control+c');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await addRound(/Jeopardy board/);
  await tile(0, 0).focus();
  await key('Control+v');
  await tile(0, 0).click();
  const wheelShown = await page.locator('select').nth(1).evaluate((s) => s.options[s.selectedIndex].text);
  await key('Escape');
  await page.getByRole('button', { name: /Wheels, Dice & Deals/ }).click();
  assert(wheelShown === 'Wheel 1' && (await page.locator('[data-tool]').allInnerTexts()).join() === 'Wheel 1', 'a wheel tile pasted in another game brings its wheel');

  // Right after a round is added (its name selected, ready to type), Ctrl+C on a tile copies the tile, not the name.
  await addRound(/Jeopardy board/);
  const nameSelected = await page.evaluate(() => {
    const a = document.activeElement;
    return a?.hasAttribute('data-round-name') && a.selectionEnd - a.selectionStart === a.value.length;
  });
  await tile(0, 1).focus();
  await key('Control+c');
  const copied = await page.locator('.toast').innerText();
  assert(nameSelected && /^Copied Category 1 \$\d+/.test(copied), `Ctrl+C on a tile right after adding a round copies the tile (${copied})`);

  // Esc leaves a new text box's text field, then deselects it, then closes the clue.
  await tabs.nth(0).click();
  await tile(1, 1).click();
  await page.getByRole('button', { name: '🅣 Text' }).click();
  await key('Escape');
  await key('Escape');
  const clueOpen = await page.getByRole('dialog', { name: 'Edit clue' }).count();
  await key('Escape');
  assert(clueOpen === 1 && (await page.getByRole('dialog', { name: 'Edit clue' }).count()) === 0, 'Esc steps out of a text field, the selection, then the clue');

  // Daily Doubles placed from the menu: a step that names the tile, and the ⭐ count goes up with them.
  const ddBox = page.getByLabel('How many Daily Doubles');
  for (const [c, r] of [[4, 3], [5, 3]]) {
    await tile(c, r).click({ button: 'right' });
    await menu.waitFor();
    await menu.getByRole('menuitem', { name: '⭐ Daily Double', exact: true }).click();
  }
  assert((await undoTitle()).startsWith('Undo: Made Category 6 $800 a Daily Double'), `making a Daily Double names the tile (${await undoTitle()})`);
  assert((await ddBox.inputValue()) === '2' && (await page.getByText('2 on the board · all placed').count()) === 1, 'placing more Daily Doubles than ⭐ says raises the count');
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await key('Control+z');
  await key('Control+z');
  assert((await ddBox.inputValue()) === '1' && (await page.getByText('0 on the board · Start places 1 at random').count()) === 1, 'Ctrl+Z takes both back, count and all');
  // A clue's own countdown is whole seconds (0: none), its own value never below 0.
  await tile(2, 2).click();
  const clueDlg = page.getByRole('dialog', { name: 'Edit clue' });
  const secs = clueDlg.locator('input.secs');
  const typed = async (field, text) => {
    await field.fill(text);
    await field.press('Tab');
    return field.inputValue();
  };
  assert((await typed(secs, '-5')) === '1' && (await typed(secs, '2.4')) === '2' && (await typed(secs, '0')) === '0', "a clue's countdown can't be negative or a fraction (0 stays: no countdown)");
  assert((await typed(clueDlg.getByLabel('Value'), '-300')) === '0' && (await clueDlg.locator('header .value').innerText()) === '$0', "a clue's value can't be negative");
  // Those fields save as they're typed in: Esc in one closes the clue, as from the quick fields.
  await clueDlg.getByLabel('Value').focus();
  await key('Escape');
  assert((await clueDlg.count()) === 0, 'Esc in the Value box closes the clue');

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join(' | ')}` : ''));
  console.log('Board editor E2E passed.');
} finally {
  await browser.close();
}

async function addRound(mode) {
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: mode }).click();
  await page.waitForTimeout(200);
}
