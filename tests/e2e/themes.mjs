// Themes: more looks (alternating tiles and category colors…) on the board, in the audience window and in an exported
// HTML file; my themes saved on this computer (kept after a reload, used in another game, renamed, deleted); a theme
// exported as a .brainrot-theme file and imported again; a theme code copied and pasted; and bad files and codes refused.
// Which card is chosen (the saved theme put on, not the preset it was made from), Save changes to a saved theme (never
// to a preset), and the right-click menus (and Shift+F10) on the cards and the settings. A color box opens the app's own
// color picker (by a click, Enter or its label; never Chromium's): Hex first and RGB beside it (kept after a reload),
// the box changing live, a hex typed then Enter as one undo step, a bad one turned down, and Esc leaving no step.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, exportHtml, openGameFile, playWithPlayers, png } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// (CI sets SCREENSHOTS: a failure leaves its picture in the run's e2e-debug files.)
const shots = process.env.SHOTS || process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const shot = (name, p = page) => shots && p.screenshot({ path: `${shots}/${name}.png` });
const RED = 'rgb(255, 0, 0)';
const CLASSIC_TILE = 'rgb(6, 12, 233)';
/** A board's tile background (row, column) in `where` (the Theme page's preview, the stage…). */
const bg = (where, row, cat) => where.locator(`.board .tile[data-row="${row}"][data-cat="${cat}"]`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
const headerBg = (where, cat) => where.locator('.board .header').nth(cat).evaluate((e) => getComputedStyle(e).backgroundColor);
const preview = page.locator('.preview');
const themePage = () => page.getByRole('button', { name: '🎨 Theme' }).click();
const card = (name) => page.locator('.mine .card', { hasText: name });
const lastToast = () => page.locator('.toast').last().innerText();
const savebar = page.locator('.savebar');
const menu = page.getByRole('menu');
/** The Values color box (its value as #rrggbb). */
const valuesBox = () => page.getByLabel('Values', { exact: true });
/** Past the round's intro, to the board. */
async function skipIntro(p) {
  await p.getByRole('button', { name: 'Skip intro' }).click();
  await p.locator('.board .tile').first().waitFor();
}
async function openSection(name) {
  const d = page.locator('details.sec', { has: page.locator('summary', { hasText: name }) });
  if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click();
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  // A Daily Double placed: the preview shows the board as viewers see it, without the host's ⭐ in its corner.
  await page.locator('.grid .tile').nth(2 * (await page.locator('.cat').count())).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: /Make it a Daily Double/ }).click();
  await themePage();
  await preview.locator('.board .tile').first().waitFor();
  assert((await preview.locator('.board .tile.host-mark').count()) === 0, 'the Theme page’s preview has no host-only tile badges (a Daily Double is placed)');

  // ---------- The app's own color picker (never Chromium's): Hex or RGB, live, one undo step, Esc ----------
  const values = valuesBox();
  const picker = page.getByRole('dialog', { name: 'Color picker: Values' });
  const formats = picker.getByRole('group', { name: 'Type it as' }).getByRole('button');
  const hexBox = picker.getByLabel('Hex color');
  const undoTitle = () => page.locator('.editor > header button[aria-label="Undo (Ctrl+Z)"]').getAttribute('title');
  const chromiums = () => values.evaluate((e) => e.matches(':open'));
  const onValues = () => values.evaluate((e) => document.activeElement === e);
  const valueBefore = await values.inputValue();
  const stepBefore = await undoTitle();
  await values.click();
  await picker.waitFor();
  assert(!(await chromiums()), "a click on a color box opens the app's picker, not Chromium's");
  assert(
    (await picker.locator('h3').innerText()) === 'Values' && (await formats.allInnerTexts()).join('|') === 'Hex|RGB' && (await formats.first().getAttribute('aria-pressed')) === 'true',
    'it is headed with the box’s name, and shows Hex and RGB side by side, Hex chosen',
  );
  const square = await picker.getByRole('slider', { name: 'Saturation and brightness' }).boundingBox();
  await page.mouse.move(square.x + square.width * 0.5, square.y + square.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(square.x + square.width * 0.9, square.y + square.height * 0.1, { steps: 4 });
  const dragged = await values.inputValue();
  assert(dragged !== valueBefore && (await hexBox.inputValue()) === dragged, `dragging the square changes the box as it goes (${dragged})`);
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  assert((await values.inputValue()) === valueBefore && (await undoTitle()) === stepBefore && (await onValues()), 'Esc puts back the color it had, with no undo step, and the keys are on the box again');
  await page.keyboard.press('Enter');
  await picker.waitFor();
  assert(!(await chromiums()) && (await hexBox.evaluate((e) => document.activeElement === e)), 'Enter on the box opens it too (not Chromium’s), with the keys in its Hex box');
  await page.keyboard.type('12AB3G');
  await page.keyboard.press('Enter');
  assert((await hexBox.getAttribute('aria-invalid')) === 'true' && (await picker.isVisible()) && (await values.inputValue()) === valueBefore, 'a hex that isn’t one is shown as such, and isn’t used (Enter keeps the picker open)');
  await hexBox.fill('12AB34');
  await page.keyboard.press('Enter');
  await picker.waitFor({ state: 'detached' });
  await page.waitForFunction((before) => {
    const title = document.querySelector('.editor > header button[aria-label="Undo (Ctrl+Z)"]').title;
    return title !== before && !title.includes('your latest changes');
  }, stepBefore);
  assert((await values.inputValue()) === '#12ab34', `a hex typed without # in capitals, then Enter: the box takes it (${await undoTitle()})`);
  await page.keyboard.press('Control+z');
  await page.waitForFunction((v) => document.querySelector('[data-k="value"] input[type=color]').value === v, valueBefore);
  assert((await undoTitle()) === stepBefore, '…as one undo step, which Ctrl+Z takes back');
  // Opened by a click (the keys on its square): a click in the Hex box selects the color there, and one pasted takes its
  // place wherever the cursor is.
  await values.click();
  await picker.waitFor();
  await hexBox.click();
  assert((await hexBox.evaluate((e) => e.selectionEnd - e.selectionStart)) === 7, 'opened by a click, a click in its Hex box selects the color there');
  await hexBox.click({ position: { x: 30, y: 10 } });
  await page.evaluate(() => navigator.clipboard.writeText('#00FF00'));
  await page.keyboard.press('Control+v');
  assert((await values.inputValue()) === '#00ff00' && (await hexBox.inputValue()) === '#00ff00', 'a color pasted there takes the old one’s place, wherever the cursor was');
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  // A right-click on its box closes it (keeping the color): the box's menu shows over the page, not under the picker.
  await values.click();
  await picker.waitFor();
  await values.click({ button: 'right' });
  await menu.waitFor();
  const firstItem = await menu.getByRole('menuitem').first().evaluate((e) => {
    const r = e.getBoundingClientRect();
    return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  assert((await picker.count()) === 0 && firstItem, 'a right-click on its box closes it, and the box’s menu can be used');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  // Ctrl+S with it open is the app's save (not the browser's Save page as…).
  await values.click();
  await picker.waitFor();
  await page.keyboard.press('Control+s');
  const nameGame = page.getByRole('dialog', { name: /Name your game/ });
  await nameGame.waitFor();
  assert((await picker.count()) === 0 && (await values.inputValue()) === valueBefore, 'Ctrl+S with it open closes it and saves the game (it asks for a name)');
  await page.keyboard.press('Escape');
  await nameGame.waitFor({ state: 'detached' });
  // Its box scrolled out of sight closes it (keeping the color), rather than leaving it over the page. (A short window,
  // with room to scroll it away.)
  await page.setViewportSize({ width: 1500, height: 600 });
  await values.click();
  await picker.waitFor();
  await values.evaluate((e) => {
    let p = e.parentElement;
    while (p && !/auto|scroll/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
    p.scrollTop += 3000;
  });
  await picker.waitFor({ state: 'detached' });
  assert((await values.inputValue()) === valueBefore, 'scrolling its box out of sight closes it');
  await page.setViewportSize({ width: 1500, height: 1000 });
  // (A click on the words of its label opens it too.)
  await page.locator('label[data-k="value"]').click({ position: { x: 60, y: 12 } });
  await picker.waitFor();
  await formats.last().click();
  const rgbBoxes = picker.getByRole('spinbutton');
  assert(
    (await formats.last().getAttribute('aria-pressed')) === 'true' && (await rgbBoxes.evaluateAll((bs) => bs.map((b) => `${b.ariaLabel} ${b.value}`).join(', '))) === 'Red 255, Green 204, Blue 0',
    'a click on its label opens it; RGB shows the color’s three numbers',
  );
  await rgbBoxes.nth(2).fill('255');
  assert((await values.inputValue()) === '#ffccff', 'a number typed there changes the box');
  await picker.getByRole('button', { name: 'Put back the color it was, #ffcc00' }).click();
  await picker.getByRole('button', { name: '✓ Done' }).click();
  await picker.waitFor({ state: 'detached' });
  assert(
    (await values.inputValue()) === valueBefore && (await undoTitle()) === stepBefore && JSON.parse(await page.evaluate(() => localStorage.getItem('jb.prefs'))).colorFormat === 'rgb',
    '↺ puts back the color it was (✓ Done then makes no step), and RGB is remembered',
  );

  // ---------- A plain game looks as it always did ----------
  // (Row 1: the preview plays every other category's first tile.)
  assert((await bg(preview, 1, 0)) === CLASSIC_TILE && (await bg(preview, 1, 1)) === CLASSIC_TILE, 'a game without the new looks: every tile the tile color');
  const plainShadow = await preview.locator('.board .tile').first().evaluate((e) => getComputedStyle(e).boxShadow);
  assert(plainShadow.includes('rgba(0, 0, 0, 0.35)') && plainShadow.includes('3px'), `and the same dark 3px edge inside each tile (${plainShadow})`);

  // ---------- Clue text: Undo stays on the Theme page; a kept color too close to new tiles is pointed out ----------
  const clueFont = page.getByRole('combobox', { name: 'Clue text font' });
  // (What an undo or redo did: the note under the page, or a toast over a window opened on top of it.)
  const said = (text) => page.locator('.history-notice, .toast', { hasText: text }).first().waitFor();
  const onThemePage = async () => (await page.getByRole('button', { name: '🎨 Theme' }).getAttribute('aria-current')) === 'page' && (await page.getByRole('dialog', { name: 'Edit clue' }).count()) === 0;
  await clueFont.selectOption({ label: 'Anton' });
  await page.keyboard.press('Control+z');
  await said('Undid Clue text font');
  assert((await onThemePage()) && (await clueFont.inputValue()) === '', 'Ctrl+Z of a Clue text font (it restyles every clue) stays on the Theme page, no clue editor opens');
  const undidNote = await page.locator('.history-notice, .toast', { hasText: 'Undid Clue text font' }).first().innerText();
  assert(/· Theme\b/.test(undidNote) && !undidNote.includes('Question'), `and its note says it was on the Theme page, not at a clue (${undidNote})`);
  await page.keyboard.press('Control+y');
  await said('Redid Clue text font');
  assert((await onThemePage()) && (await clueFont.inputValue()).includes('Anton'), 'and so does Ctrl+Y');
  await page.keyboard.press('Control+z');
  await said('Undid Clue text font');
  const clueWarn = page.getByRole('status').filter({ hasText: 'clue text color is hard to read' });
  await page.getByLabel('Clue text color').fill('#ffcc00');
  assert((await clueWarn.count()) === 0, 'yellow clue text on the blue tiles: no note');
  await page.locator('.preset', { hasText: 'Pastel' }).click();
  await clueWarn.waitFor();
  assert(true, 'Pastel keeps the yellow clue text, on its pink tiles: a note says it’s hard to read');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await clueWarn.waitFor({ state: 'detached' });
  assert((await bg(preview, 1, 0)) === CLASSIC_TILE && (await page.getByLabel('Clue text color').inputValue()) === '#ffffff', 'Ctrl+Z twice: Classic and the clues’ own color again');

  // ---------- Fonts: your own font file ----------
  const namesFont = page.getByRole('combobox', { name: 'Category names' });
  const oswald = await namesFont.inputValue();
  await page.getByRole('button', { name: '＋ Category names…' }).click();
  const fontPicker = page.getByRole('dialog', { name: 'Choose font' });
  const [fontChooser] = await Promise.all([page.waitForEvent('filechooser'), fontPicker.getByRole('button', { name: '⬆ Upload font file…' }).click()]);
  await fontChooser.setFiles({ name: 'Channel Font.woff2', mimeType: 'font/woff2', buffer: readFileSync(resolve('node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2')) });
  await fontPicker.waitFor({ state: 'detached' });
  await page.waitForFunction(() => /^'jb-\w+', sans-serif$/.test(document.querySelector('label[data-k="boardFont"] select').value));
  const ownFont = await namesFont.inputValue();
  assert((await namesFont.locator('option:checked').innerText()) === 'Channel Font (uploaded)', `＋ Category names… (Your own font file) uploads a font file and puts it on the category names (${ownFont})`);
  const previewFont = await preview.locator('.board .header').first().evaluate((e) => getComputedStyle(e).fontFamily);
  assert(previewFont.includes(ownFont.split(',')[0].replace(/'/g, '')), `the preview's category names are in it (${previewFont})`);
  const listed = (name) => page.getByRole('combobox', { name }).locator('option', { hasText: 'Channel Font (uploaded)' }).count();
  assert((await listed('Values & scores')) === 1 && (await listed('Clue text font')) === 1, 'and it is listed for the values and the clue text too');
  await page.keyboard.press('Control+z');
  await page.waitForFunction((was) => document.querySelector('label[data-k="boardFont"] select').value === was, oswald);
  assert((await listed('Values & scores')) === 0, 'Ctrl+Z takes the file and its use back in one step');

  // ---------- Alternating tiles and categories ----------
  await openSection('Tiles');
  await page.getByRole('combobox', { name: 'Alternating tiles' }).selectOption('checker');
  await page.getByLabel('Second tile color').fill('#ff0000');
  assert((await bg(preview, 1, 0)) === RED && (await bg(preview, 1, 1)) === CLASSIC_TILE, 'checkerboard: two tiles side by side take the two colors');
  assert((await bg(preview, 2, 0)) === CLASSIC_TILE && (await bg(preview, 2, 1)) === RED, 'and the next row the other way round');
  await page.getByRole('combobox', { name: 'Alternating tiles' }).selectOption('columns');
  assert((await bg(preview, 1, 1)) === RED && (await bg(preview, 2, 1)) === RED && (await bg(preview, 2, 0)) === CLASSIC_TILE, 'by column: every other column');
  await page.getByRole('combobox', { name: 'Alternating tiles' }).selectOption('checker');
  await page.getByRole('combobox', { name: 'Played tiles' }).selectOption('hidden');
  const played = await preview.locator('.board .tile.used').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(played === 'rgba(0, 0, 0, 0)', `played tiles can be hidden (${played})`);
  const usedColor = page.locator('label[data-k="tileUsed"]');
  await usedColor.getByText('(not shown: Played tiles is Hidden)').waitFor();
  assert(await usedColor.locator('input[type=color]').isEnabled(), 'then Colors › Used tiles says it isn’t shown (its color can still be set)');
  await usedColor.click({ button: 'right', position: { x: 5, y: 5 } });
  await menu.waitFor();
  assert((await menu.innerText()).startsWith('Used tiles\n'), 'and its right-click menu is still called Used tiles');
  await page.keyboard.press('Escape');
  await page.getByLabel('Rounded corners (0)').fill('20');
  assert((await preview.locator('.board .tile').first().evaluate((e) => getComputedStyle(e).borderRadius)) === '20px', 'rounded tile corners');
  await openSection('Categories');
  await page.getByLabel('Alternate colors').check();
  await page.getByLabel('Second category color').fill('#00ff00');
  assert((await headerBg(preview, 0)) === CLASSIC_TILE && (await headerBg(preview, 1)) === 'rgb(0, 255, 0)', 'alternating category colors');
  // White names on bright green: a note says they're hard to read (under Categories, and under Colors).
  assert((await page.getByRole('status').filter({ hasText: 'category names are hard to read' }).count()) === 2, 'category names too close to an alternate color: a note says so');
  // A look switched off for a moment and on again keeps the color picked for it.
  await page.getByLabel('Line under the categories color').fill('#ff0000');
  await page.getByLabel('Line under them').uncheck();
  await page.getByLabel('Line under them').check();
  assert((await page.getByLabel('Line under the categories color').inputValue()) === '#ff0000', 'Line under them unticked and ticked again keeps its red');
  // Back to its default black line (↺ Reset to Classic), then off and on again: black, not the red from before.
  await page.locator('label[data-k="headerLine"]').click({ button: 'right', position: { x: 5, y: 5 } });
  await menu.getByRole('menuitem', { name: '↺ Reset to Classic' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Line under the categories color"]')?.value === '#000000');
  await page.getByLabel('Line under them').uncheck();
  await page.getByLabel('Line under them').check();
  assert((await page.getByLabel('Line under the categories color').inputValue()) === '#000000', 'one back to its default black, unticked and ticked again, is black');
  await page.getByLabel('Tile glow', { exact: true }).check();
  await page.getByLabel('Tile glow color').fill('#ffd700');
  await page.getByLabel('Tile glow', { exact: true }).uncheck();
  await page.getByLabel('Tile glow', { exact: true }).check();
  assert((await page.getByLabel('Tile glow color').inputValue()) === '#ffd700', 'so does Tile glow, its gold');
  await page.getByLabel('Tile glow', { exact: true }).uncheck();
  await openSection('Score plates');
  await page.getByRole('combobox', { name: 'Plate corners' }).selectOption('pill');
  // A pill's round ends don't cut the names.
  // (The name strip's padding and the name's own, which leaves a slanted font's last letter room.)
  const namePad = await preview.locator('.plate .name').first().evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft) + parseFloat(getComputedStyle(e.querySelector('.nm')).paddingLeft));
  assert(namePad >= 28, `pill plates keep the names clear of their round ends (${namePad}px)`);
  await page.getByRole('button', { name: '↺ Plain score plates' }).click();
  assert((await page.getByRole('combobox', { name: 'Plate corners' }).inputValue()) === '', '↺ Plain score plates takes them back');
  await page.getByLabel('Glow on the leader').check();
  assert((await page.locator('summary', { hasText: 'Tiles' }).innerText()).includes('changed'), 'a section with looks of its own says it’s changed');
  const classic = page.locator('.preset', { hasText: 'Classic' });
  assert((await classic.innerText()).includes('· edited') && (await classic.getAttribute('aria-pressed')) === 'false', 'the preset it started from says “edited”, and isn’t shown as chosen');
  assert((await savebar.innerText()).includes('Classic') && (await savebar.innerText()).includes('edited'), 'the bar says which theme it started from, edited');
  assert((await savebar.getByRole('button', { name: /Save changes/ }).count()) === 0, 'from a built-in theme only Save as new theme… is offered (a preset is never overwritten)');
  await shot('1-theme-page');

  // ---------- 💾 Save as new theme… ----------
  await page.getByRole('button', { name: '💾 Save as new theme…' }).click();
  const naming = page.getByRole('dialog', { name: '💾 Save as new theme' });
  assert((await naming.innerText()).includes('Kept in this browser, for any game'), 'the name window says where it’s kept: in this browser (it said “on this computer”)');
  // (A name as long as names go: the bar's button cuts it short with …, inside the bar.)
  await naming.getByLabel('Theme name').fill('Checker party with a really long name that keeps going on and on');
  await naming.getByRole('button', { name: 'Save', exact: true }).click();
  await card('Checker party').waitFor();
  const barFit = await savebar.evaluate((bar) => {
    const right = bar.getBoundingClientRect().right;
    return [...bar.querySelectorAll('button')].map((b) => Math.round(right - b.getBoundingClientRect().right));
  });
  assert(barFit.length === 2 && barFit.every((gap) => gap >= 0), `a long theme name's Save changes button stays inside the bar (room left: ${barFit.join(', ')} px)`);
  assert(await card('Checker party').locator('.use').evaluate((b) => b.getAttribute('aria-pressed') === 'true'), 'a saved theme shows in My themes, marked as the one this game looks like');
  assert((await card('Checker party').locator('.tag').innerText()) === '★', 'marked as yours');
  assert((await classic.getAttribute('aria-pressed')) === 'false' && !(await classic.innerText()).includes('edited'), 'and the game’s theme is that one now, not an edited Classic');

  // ---------- Kept after a reload, used in another game ----------
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard').catch(() => {});
  // (The new game, with no rounds, has arrived: until then the old one's round tabs are still there, and
  // addClassicRounds would take them for this game's and add none.)
  await page.locator('nav > button.round-tab').first().waitFor({ state: 'detached' });
  await addClassicRounds(page);
  await themePage();
  await card('Checker party').waitFor();
  assert(true, 'the saved theme is still there after a reload, in a new game');
  assert((await bg(preview, 1, 0)) === CLASSIC_TILE, 'the new game starts plain');
  await values.click();
  await picker.waitFor();
  assert((await formats.last().getAttribute('aria-pressed')) === 'true' && (await rgbBoxes.count()) === 3, 'the color picker opens with RGB after a reload, as it was last left');
  await formats.first().click();
  await page.keyboard.press('Escape');
  await picker.waitFor({ state: 'detached' });
  await card('Checker party').locator('.use').click();
  assert((await bg(preview, 1, 0)) === RED && (await headerBg(preview, 1)) === 'rgb(0, 255, 0)', 'using it puts its alternating tiles and categories on this game');
  await page.keyboard.press('Control+z');
  assert((await bg(preview, 1, 0)) === CLASSIC_TILE, 'Ctrl+Z takes it back in one step');
  await page.keyboard.press('Control+y');
  assert((await bg(preview, 1, 0)) === RED, 'Ctrl+Y puts it back');

  // ---------- Rename ----------
  await card('Checker party').getByRole('button', { name: /More for/ }).click();
  await page.getByRole('menuitem', { name: '✏ Rename…' }).click();
  const renaming = page.getByRole('dialog', { name: '✏ Rename theme' });
  await renaming.getByLabel('Theme name').fill('Checkers');
  await renaming.getByRole('button', { name: 'Rename' }).click();
  await card('Checkers').waitFor();
  assert((await page.locator('.mine .card').count()) === 1, 'rename keeps one theme, with its new name');

  // ---------- The saved theme put on is the one chosen; Save changes ----------
  const checkers = card('Checkers').locator('.use');
  assert((await checkers.getAttribute('aria-pressed')) === 'true', 'a saved theme put on a game is the card chosen');
  assert((await page.locator('.preset[aria-pressed="true"]').count()) === 0 && (await page.locator('.card.based').count()) === 0, 'not the preset it was made from');
  const saveChanges = savebar.getByRole('button', { name: '💾 Save changes to “Checkers”' });
  assert(await saveChanges.isDisabled(), 'Save changes waits for a change');
  await valuesBox().fill('#00ffff');
  assert((await savebar.innerText()).includes('edited') && (await card('Checkers').innerText()).includes('· edited'), 'changed: the bar and the card say “edited”');
  assert((await checkers.getAttribute('aria-pressed')) === 'true', 'and it is still the theme chosen');
  await saveChanges.click();
  const overwrite = page.getByRole('alertdialog').filter({ hasText: 'Overwrite “Checkers” with this look?' });
  await overwrite.waitFor();
  await overwrite.getByRole('button', { name: 'Cancel' }).click();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('brainrot.myThemes')).map((m) => ({ name: m.name, value: m.theme.value })));
  assert((await stored())[0].value === '#ffcc00', 'Save changes asks first (Cancel keeps the saved theme as it was)');
  await saveChanges.click();
  await overwrite.getByRole('button', { name: 'Overwrite' }).click();
  await page.waitForFunction(() => !document.querySelector('.savebar')?.textContent?.includes('edited'));
  const after = await stored();
  assert(after.length === 1 && after[0].name === 'Checkers' && after[0].value === '#00ffff', 'Overwrite saves the changes into the same saved theme');
  assert(await saveChanges.isDisabled(), 'and there is nothing left to save');
  // A preset is never overwritten: put Classic on, change it, and only Save as new theme… is there.
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  assert((await valuesBox().inputValue()) === '#ffcc00', 'Classic is still Classic');
  assert((await savebar.getByRole('button').allInnerTexts()).join('|') === '💾 Save as new theme…', 'from a preset, only Save as new theme…');
  await valuesBox().fill('#123456');
  assert((await page.locator('.card.based').count()) === 1 && (await savebar.getByRole('button', { name: /Save changes/ }).count()) === 0, 'changed: Classic is marked as where it started (dashed), still only Save as new theme…');
  await page.keyboard.press('Control+z');
  await checkers.click();

  // ---------- Right-click menus ----------
  await page.locator('.preset', { hasText: 'Dark' }).click({ button: 'right' });
  await menu.waitFor();
  const presetMenu = (await menu.innerText()).split('\n').map((l) => l.trim());
  assert(presetMenu.includes('🎨 Use in this game') && presetMenu.includes('💾 Save a copy as my theme…') && presetMenu.includes('📋 Copy theme code'), `right-click on a built-in theme: use, save a copy, share (${presetMenu.join(' / ')})`);
  assert(!presetMenu.some((l) => /Overwrite|Save changes|Delete|Rename/.test(l)), 'and no way to overwrite, rename or delete it');
  await page.keyboard.press('Escape');
  await checkers.click({ button: 'right' });
  await menu.waitFor();
  const mineMenu = (await menu.innerText()).split('\n').map((l) => l.trim());
  assert(['🎨 Use in this game', '💾 Save changes to it…', '✏ Rename…', '⧉ Duplicate', '⬇ Export theme file', '🗑 Delete…'].every((l) => mineMenu.includes(l)), `right-click on one of My themes: its ⋯ menu (${mineMenu.join(' / ')})`);
  assert(await menu.getByRole('menuitem', { name: '💾 Save changes to it…' }).isDisabled(), 'Save changes to it… waits for a change there too');
  await page.keyboard.press('Escape');
  // Shift+F10 on a focused card opens the same menu, and Esc gives the card the focus back.
  await page.locator('.preset', { hasText: 'Pastel' }).focus();
  await page.keyboard.press('Shift+F10');
  await menu.waitFor();
  assert((await menu.innerText()).includes('Pastel (built-in)') && (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'menuitem', 'Shift+F10 on a focused card opens its menu, focus on the first item');
  await page.keyboard.press('Escape');
  assert(await page.locator('.preset', { hasText: 'Pastel' }).evaluate((e) => e === document.activeElement), 'Esc closes it, the focus back on the card');
  await checkers.focus();
  await page.keyboard.press('Shift+F10');
  assert((await menu.innerText()).includes('★ Checkers'), 'and on one of My themes');
  await page.keyboard.press('Escape');
  // A color: reset to the theme it came from, copy and paste.
  await valuesBox().fill('#00ff00');
  await page.locator('label[data-k="value"]').click({ button: 'right' });
  await menu.waitFor();
  assert((await menu.innerText()).startsWith('Values'), 'right-click on a color: its menu, named');
  await menu.getByRole('menuitem', { name: '↺ Reset to Checkers' }).click();
  assert((await valuesBox().inputValue()) === '#00ffff', 'Reset to Checkers puts that color back as in the saved theme');
  await page.locator('label[data-k="value"]').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '📋 Copy color' }).click();
  await page.locator('label[data-k="boardText"]').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '📋 Paste color #00ffff' }).click();
  assert((await page.getByLabel('Category names', { exact: true }).inputValue()) === '#00ffff', 'Copy color and Paste color');
  // A section: reset it all.
  await page.locator('details.sec[data-sec="colors"] > summary').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '↺ Reset Colors to Checkers' }).click();
  assert((await page.getByLabel('Category names', { exact: true }).inputValue()) === '#ffffff' && !(await savebar.innerText()).includes('edited'), 'right-click a section: Reset Colors to Checkers');
  // Shift+F10 on a setting.
  await openSection('Score plates');
  await page.getByRole('combobox', { name: 'Plate corners' }).focus();
  await page.keyboard.press('Shift+F10');
  await menu.waitFor();
  assert((await menu.innerText()).includes('Plate corners') && (await menu.innerText()).includes('Reset Score plates to Checkers'), 'Shift+F10 on a setting opens its menu');
  await page.keyboard.press('Escape');
  await shot('1b-menus');

  // ---------- ⬇ Export theme / 📂 Import theme… ----------
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ Export theme' }).click()]);
  assert(download.suggestedFilename() === 'Checkers.brainrot-theme', `Export theme writes a .brainrot-theme file named after the theme (${download.suggestedFilename()})`);
  const themePath = resolve('test-results/themes-checkers.brainrot-theme');
  mkdirSync(resolve('test-results'), { recursive: true });
  await download.saveAs(themePath);
  const data = JSON.parse(readFileSync(themePath, 'utf8'));
  assert(data.format === 'brainrot-theme' && data.version === 1 && data.theme.tilePattern === 'checker' && data.theme.tile2 === '#ff0000', 'the file is JSON with its format, version and the looks');
  await page.getByRole('button', { name: /^Classic/ }).click();
  assert((await bg(preview, 1, 0)) === CLASSIC_TILE, 'a preset takes the extra looks off');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '📂 Import theme…' }).click()]);
  await chooser.setFiles(themePath);
  const imported = page.getByRole('dialog', { name: /Theme “Checkers”/ });
  await imported.waitFor();
  assert((await bg(imported, 1, 0)) === RED, 'importing a theme file previews it on this game’s board first');
  assert(
    await imported.locator('.preview').evaluate((e) => e.getAttribute('aria-hidden') === 'true' && e.inert),
    'its preview is a picture only: screen readers skip its made-up tiles and players',
  );
  await shot('2-import-preview');
  await imported.getByRole('button', { name: '🎨 Use in this game' }).click();
  assert((await bg(preview, 1, 0)) === RED, 'Use in this game puts it on the game');
  // A bad file is refused with a message, and the game is untouched.
  const [bad] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '📂 Import theme…' }).click()]);
  await bad.setFiles({ name: 'broken.brainrot-theme', mimeType: 'application/json', buffer: Buffer.from('{"format":"brainrot-theme","theme":{"tile":"url(evil)"}}') });
  const refused = page.getByRole('alertdialog').filter({ hasText: 'can’t be used as a theme' });
  await refused.waitFor();
  assert((await refused.innerText()).includes('no colors'), 'a bad theme file is refused, saying why');
  await refused.getByRole('button', { name: 'OK' }).click();
  assert((await bg(preview, 1, 0)) === RED, 'and the game keeps its look');
  // A theme file dropped on the editor, or picked with Open…, shows on the Theme page first, like Import theme….
  await page.locator('nav > button.round-tab').first().click();
  const themeText = readFileSync(themePath, 'utf8');
  const dt = await page.evaluateHandle((text) => {
    const d = new DataTransfer();
    d.items.add(new File([text], 'Checkers.brainrot-theme', { type: '' }));
    return d;
  }, themeText);
  await page.locator('nav').dispatchEvent('drop', { dataTransfer: dt });
  await imported.waitFor();
  assert((await page.getByRole('button', { name: '🎨 Theme' }).getAttribute('aria-current')) === 'page', 'a theme file dropped on the editor opens the Theme page');
  assert((await bg(imported, 1, 0)) === RED, 'and previews the theme first');
  await imported.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('nav > button.round-tab').first().click();
  await openGameFile(page, themePath);
  await imported.waitFor();
  assert((await page.getByRole('button', { name: '🎨 Theme' }).getAttribute('aria-current')) === 'page', 'Open… with a theme file does the same (no “not a game” error)');
  await imported.getByRole('button', { name: 'Cancel' }).click();
  // ...and one whose name ends in .json (renamed, or saved so by a browser): it's still a theme, not a broken game.
  await page.locator('nav > button.round-tab').first().click();
  const asJson = await page.evaluateHandle((text) => {
    const d = new DataTransfer();
    d.items.add(new File([text], 'Checkers.brainrot-theme.json', { type: 'application/json' }));
    return d;
  }, themeText);
  await page.locator('nav').dispatchEvent('drop', { dataTransfer: asJson });
  await imported.waitFor();
  assert((await page.getByRole('button', { name: '🎨 Theme' }).getAttribute('aria-current')) === 'page', 'a theme file named .json opens on the Theme page too');
  await imported.getByRole('button', { name: 'Cancel' }).click();

  // ---------- 📋 Copy theme code / ⌨ Paste theme code… ----------
  await page.getByRole('button', { name: '📋 Copy theme code' }).click();
  await page.waitForTimeout(200);
  const code = await page.evaluate(() => navigator.clipboard.readText());
  assert(/^BRT1:[A-Za-z0-9_-]+$/.test(code) && code.length < 800, `Copy theme code puts a short code on the clipboard (${code.length} characters)`);
  assert((await lastToast()).includes('Theme code copied'), 'and says so');
  await page.getByRole('button', { name: '⌨ Paste theme code…' }).click();
  const paste = page.getByRole('dialog', { name: '⌨ Paste a theme code' });
  await paste.getByLabel(/Theme code/).fill('BRT1:not-a-real-code');
  await paste.getByRole('button', { name: 'Preview' }).click();
  await paste.getByRole('alert').waitFor();
  assert((await paste.getByRole('alert').innerText()).includes('damaged'), 'a bad code says it can’t be read');
  await paste.getByLabel(/Theme code/).fill(`Try my theme! ${code}`);
  await paste.getByRole('button', { name: 'Preview' }).click();
  const pasted = page.getByRole('dialog', { name: /Theme “Checkers”/ });
  await pasted.waitFor();
  assert((await bg(pasted, 1, 0)) === RED, 'a pasted code (with words around it) previews the theme');
  await pasted.getByRole('button', { name: '💾 Save to my themes' }).click();
  await card('Checkers 2').waitFor();
  assert((await page.locator('.mine .card').count()) === 2, 'Save to my themes adds it under a name of its own');

  // ---------- Delete ----------
  await card('Checkers 2').getByRole('button', { name: /More for/ }).click();
  await page.getByRole('menuitem', { name: '🗑 Delete…' }).click();
  const ask = page.getByRole('alertdialog').filter({ hasText: 'Delete “Checkers 2”' });
  await ask.getByRole('button', { name: 'Delete' }).click();
  await card('Checkers 2').waitFor({ state: 'detached' });
  assert((await page.locator('.mine .card').count()) === 1, 'Delete… asks, then takes it off the list');
  // A file with a picture, saved to My themes: the note says how to bring the picture in (using the saved theme doesn't).
  const withBanner = { ...JSON.parse(themeText), name: 'Banner show' };
  withBanner.media = [{ id: 'm_banner1', name: 'banner.png', mime: 'image/png', kind: 'image', data: png(255, 140, 0, 160, 16).toString('base64') }];
  withBanner.theme = { ...withBanner.theme, banner: 'm_banner1' };
  const bannerPath = resolve('test-results/themes-banner.brainrot-theme');
  writeFileSync(bannerPath, JSON.stringify(withBanner));
  const [bannerChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '📂 Import theme…' }).click()]);
  await bannerChooser.setFiles(bannerPath);
  await page.getByRole('dialog', { name: /Theme “Banner show”/ }).getByRole('button', { name: '💾 Save to my themes' }).click();
  await card('Banner show').waitFor();
  const bannerSaved = await page.locator('.toast', { hasText: 'Saved “Banner show”' }).innerText();
  assert(bannerSaved.includes('📂 Import the file again and 🎨 Use in this game'), `saving a theme file with a picture says how to bring it in (${bannerSaved})`);

  // ---------- An exported HTML file ----------
  // (Its values in a font file of its own: the file's first screen shows its logo in it from the start.)
  await openSection('Fonts');
  await page.getByRole('button', { name: '＋ Values & scores…' }).click();
  const valuePicker = page.getByRole('dialog', { name: 'Choose font' });
  const [valueChooser] = await Promise.all([page.waitForEvent('filechooser'), valuePicker.getByRole('button', { name: '⬆ Upload font file…' }).click()]);
  await valueChooser.setFiles({ name: 'Score Font.woff2', mimeType: 'font/woff2', buffer: readFileSync(resolve('node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2')) });
  await valuePicker.waitFor({ state: 'detached' });
  await page.waitForFunction(() => /^'jb-\w+', sans-serif$/.test(document.querySelector('label[data-k="valueFont"] select').value));
  const html = await exportHtml(page, 'Theme test');
  const saved = resolve('test-results/themes-export.html');
  await html.saveAs(saved);
  const player = await context.newPage();
  player.on('pageerror', (e) => errors.push(`[player] ${e.message}`));
  await player.goto(pathToFileURL(saved).href);
  await player.getByRole('button', { name: '▶ Play' }).waitFor({ timeout: 20000 });
  const logoFont = await player
    .waitForFunction(() => {
      const fam = getComputedStyle(document.querySelector('.home .logo')).fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      return [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === fam && f.status === 'loaded') && fam;
    }, null, { timeout: 5000 })
    .then((h) => h.jsonValue(), () => '');
  assert(logoFont.startsWith('jb-'), `the exported file's first screen shows its logo in the game's own values font from the start (${logoFont || 'not loaded'})`);
  await player.getByRole('button', { name: '▶ Play' }).click();
  await player.getByRole('button', { name: '＋ Add player' }).click();
  await player.getByRole('button', { name: 'Start game ▶' }).click();
  await skipIntro(player);
  assert((await bg(player, 0, 0)) === CLASSIC_TILE && (await bg(player, 0, 1)) === RED, 'an exported HTML game shows the same alternating tiles');
  await player.close();

  // ---------- The audience window ----------
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await skipIntro(page);
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
  await aud.locator('.board .tile').first().waitFor();
  await aud.waitForTimeout(300);
  assert((await bg(aud, 0, 0)) === CLASSIC_TILE && (await bg(aud, 0, 1)) === RED, 'the audience window shows the alternating tiles');
  assert((await headerBg(aud, 1)) === 'rgb(0, 255, 0)', 'and the alternating categories');
  assert((await aud.locator('.board .tile').first().evaluate((e) => getComputedStyle(e).borderRadius)) === '20px', 'and the rounded corners');
  await shot('3-audience', aud);
  await aud.close();

  // ---------- An audience window left on the Starting soon card follows the editor ----------
  // (In a copy of its own: this one's display and game stay as they are.)
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await ctx2.newPage();
  host.on('pageerror', (e) => errors.push(`[soon] ${e.message}`));
  host.on('dialog', (d) => d.accept());
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  const [soon] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  soon.on('pageerror', (e) => errors.push(`[soon audience] ${e.message}`));
  const soonTitle = soon.locator('.soon .round-name');
  await soonTitle.waitFor();
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  await host.getByRole('button', { name: '🎨 Theme' }).click();
  // Share's buttons that wrap (a 1280-wide window) go on under the first one, not under the row's label.
  const share = await host.locator('.share .row', { hasText: 'Bring one in' }).evaluate((row) => {
    const b = [...row.querySelectorAll('button')].map((x) => x.getBoundingClientRect());
    return { wraps: b.some((r) => r.top > b[0].top + 4), under: b.every((r) => r.left >= b[0].left - 1) };
  });
  assert(share.wraps && share.under, `Theme › Share: a button that wraps lines up under the first one, not under “Bring one in” (${JSON.stringify(share)})`);
  await host.locator('.preset', { hasText: 'Pastel' }).click();
  // (Pastel's purple values.)
  const PASTEL_VALUE = 'rgb(122, 76, 255)';
  await soon.waitForFunction((c) => getComputedStyle(document.querySelector('.soon .round-name')).color === c, PASTEL_VALUE, { timeout: 10000 }).catch(() => {});
  const soonColor = await soonTitle.evaluate((e) => getComputedStyle(e).color);
  assert(soonColor === PASTEL_VALUE, `a theme put on in the editor shows on the audience window’s Starting soon card (${soonColor})`);
  // Pastel's dark words on the card get its light shadow (a hard black one doubled them), and a score below zero (Jordan's,
  // in the Theme page's preview) a black one on its dark red band (it had a pale copy of itself).
  const soonShadow = await soon.locator('.soon-text').evaluate((e) => getComputedStyle(e).textShadow);
  const negShadow = await host.locator('.preview .score.neg').first().evaluate((e) => getComputedStyle(e).textShadow);
  assert(soonShadow.startsWith('rgba(255, 255, 255, 0.75)') && negShadow.startsWith('rgb(0, 0, 0)'), `on Pastel: the Starting soon words' shadow is light (${soonShadow}), a score below zero's black (${negShadow})`);
  // A wide banner: on the card too, and its thumbnail leaves Change… and ✕ in the settings column (not under the preview).
  const bannerRow = host.locator('.row.pop', { hasText: 'Banner above the board' });
  const wide = await host.evaluateHandle((b64) => {
    const d = new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'logo.png', { type: 'image/png' }));
    return d;
  }, png(255, 140, 0, 160, 16).toString('base64'));
  for (const type of ['dragenter', 'dragover', 'drop']) await bannerRow.getByRole('button', { name: 'Choose a banner above the board' }).dispatchEvent(type, { dataTransfer: wide });
  const cardImg = soon.locator('.soon .card-img');
  await cardImg.waitFor();
  assert(true, 'a banner put on in the editor shows on the Starting soon card');
  const column = await host.locator('.controls').evaluate((e) => e.getBoundingClientRect().right);
  const thumb = await bannerRow.locator('img').boundingBox();
  const change = await bannerRow.getByRole('button', { name: 'Change the banner above the board' }).boundingBox();
  const remove = await bannerRow.getByRole('button', { name: 'Remove banner' }).boundingBox();
  assert(thumb.x + thumb.width <= change.x && remove.x + remove.width <= column + 0.5, `a wide banner's thumbnail shrinks: Change… and ✕ stay in the settings column (✕ ends at ${Math.round(remove.x + remove.width)}, the column at ${Math.round(column)})`);
  // Its file replaced in 🖼 Media (the same id, new bytes): the card shows the new picture.
  const firstSrc = await cardImg.getAttribute('src');
  await host.getByRole('button', { name: /^🖼 Media/ }).click();
  const [replacing] = await Promise.all([host.waitForEvent('filechooser'), host.locator('.card').first().getByRole('button', { name: 'Replace…' }).click()]);
  await replacing.setFiles({ name: 'logo2.png', mimeType: 'image/png', buffer: png(0, 0, 255, 160, 16) });
  await soon.waitForFunction((was) => document.querySelector('.soon .card-img')?.getAttribute('src') !== was, firstSrc, { timeout: 10000 }).catch(() => {});
  const pixel = await cardImg.evaluate(async (img) => {
    await img.decode().catch(() => {});
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 4, 4);
    return [...g.getImageData(1, 1, 1, 1).data].slice(0, 3).join(',');
  });
  assert(pixel === '0,0,255', `a file replaced in 🖼 Media reaches the open audience window (its banner is ${pixel})`);
  await ctx2.close();

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('themes: all passed');
} catch (e) {
  await shot('themes-failure');
  // What the page shows at the failure (CI keeps no browser): the editor paused for another window, its "can't be shown"
  // card, a window left open, or the page's text in short.
  const state = await page
    .evaluate(() => ({
      url: location.href.slice(-40),
      nav: document.querySelectorAll('nav .round-tab').length,
      header: !!document.querySelector('header'),
      dialogs: [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].map((d) => d.textContent?.trim().slice(0, 160)),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
    }))
    .catch((err) => `(couldn't read the page: ${err.message})`);
  console.log('Page at the failure:', JSON.stringify(state, null, 2));
  console.log('Page errors so far:', errors.join(' | ') || 'none');
  throw e;
} finally {
  await browser.close();
}
