// Editor media and keys: files dropped on media slots and into an open picker (and pasted into it), the Media page
// (rename, drop to replace, select several to remove), the slide's right-click menus, renaming layers, board images
// on the slides' clipboard, and the ⌨ Shortcuts sheet.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
const dialogs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const shot = (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
// 4×4 white PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8AARLgBAAC0BAP/HpJ+EwAAAABJRU5ErkJggg==';

/** A DataTransfer holding files ([name, type]; pictures are the PNG, anything else a few bytes). */
const files = (list) =>
  page.evaluateHandle(
    ([fs, b64]) => {
      const d = new DataTransfer();
      for (const [name, type] of fs) d.items.add(new File([type === 'image/png' ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : 'x'], name, { type }));
      return d;
    },
    [list, PNG],
  );
/** Drag files over an element and drop them there, the way files from the desktop arrive. */
async function drop(locator, list) {
  const dt = await files(list);
  await locator.dispatchEvent('dragenter', { dataTransfer: dt });
  await locator.dispatchEvent('dragover', { dataTransfer: dt });
  await locator.dispatchEvent('drop', { dataTransfer: dt });
  await page.waitForTimeout(250);
}
const mediaCount = async () => Number((await page.getByRole('button', { name: /^🖼 Media \(\d+\)$/ }).innerText()).match(/\d+/)[0]);
const toast = page.locator('.toast');
const notice = page.locator('.history-notice');

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- Drop a picture on a Choose… button: stored and used there, as one undo step ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  const bgRow = page.locator('.row.pop', { hasText: 'Background image' });
  await drop(bgRow.getByRole('button', { name: 'Choose…' }), [['wall.png', 'image/png']]);
  assert((await bgRow.locator('img').count()) === 1 && (await mediaCount()) === 1, 'a picture dropped on Background image → Choose… is the background');
  await page.keyboard.press('Control+z');
  assert((await bgRow.locator('img').count()) === 0 && (await mediaCount()) === 0, 'one Ctrl+Z takes back the file and its use together');
  await page.keyboard.press('Control+y');
  assert((await bgRow.locator('img').count()) === 1, 'Ctrl+Y puts both back');
  // The wrong kind is refused, with a toast, and isn't added.
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  const soundBtn = page.getByRole('button', { name: 'Choose…' }).first();
  await drop(soundBtn, [['cat.png', 'image/png']]);
  assert((await toast.innerText()).includes('"cat.png" isn\'t a sound') && (await mediaCount()) === 1, 'a picture dropped on a sound slot is refused with a toast');

  // ---------- An open picker takes a dropped file, and a pasted one ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  const banner = page.locator('.row.pop', { hasText: 'Banner above the board' });
  await banner.getByRole('button', { name: 'Choose…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose image' });
  await picker.waitFor();
  await shot('em-1-picker');
  await drop(picker, [['logo.png', 'image/png']]);
  assert((await picker.count()) === 0 && (await banner.locator('img').count()) === 1, 'a file dropped on an open picker is picked at once');
  await banner.getByRole('button', { name: 'Change…' }).click();
  await picker.waitFor();
  await page.evaluate(
    ([b64]) => {
      const d = new DataTransfer();
      d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'pasted.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true }));
    },
    [PNG],
  );
  await page.waitForTimeout(250);
  assert((await picker.count()) === 0 && (await mediaCount()) === 3, 'Ctrl+V of a copied picture file in an open picker picks it');

  // ---------- Media page: rename, drop to replace, select several to remove ----------
  await page.getByRole('button', { name: /^🖼 Media/ }).click();
  const cards = page.locator('.card');
  const names = () => cards.locator('.nm').allInnerTexts();
  await cards.nth(1).locator('button.nm').dblclick();
  const nameBox = page.getByRole('textbox', { name: 'File name' });
  await nameBox.fill('Show logo.png');
  await nameBox.press('Enter');
  assert((await names())[1] === 'Show logo.png', 'double-click a name to rename the file');
  await cards.nth(2).locator('button.nm').focus();
  await page.keyboard.press('F2');
  await nameBox.fill('show LOGO.png');
  await nameBox.press('Enter');
  const clash = (await names())[2];
  assert(/^show LOGO-[a-z0-9]{6}\.png$/.test(clash), `F2 renames too, and a name that's taken gets made unique (${clash})`);
  await page.keyboard.press('Control+z');
  assert((await names())[2] === 'pasted.png', 'Ctrl+Z undoes the rename');
  // Esc leaves the name as it was.
  await cards.nth(2).locator('button.nm').dblclick();
  await nameBox.fill('nope');
  await nameBox.press('Escape');
  assert((await names())[2] === 'pasted.png', 'Esc cancels a rename');

  await drop(cards.nth(0), [['song.mp3', 'audio/mpeg']]);
  assert((await toast.innerText()).includes('song.mp3') && (await names())[0] === 'wall.png', 'a sound dropped on a picture card is refused with a toast');
  await drop(cards.nth(0), [['wall2.png', 'image/png']]);
  assert((await names())[0] === 'wall2.png' && (await cards.count()) === 3, 'a picture dropped on a picture card replaces it (no new file)');
  await page.keyboard.press('Control+z');
  assert((await names())[0] === 'wall.png', 'Ctrl+Z puts the old file back');

  await cards.nth(0).locator('.meta').click();
  await cards.nth(2).locator('.meta').click({ modifiers: ['Shift'] });
  assert((await page.locator('.card.picked').count()) === 3, 'click, then Shift+click selects the run');
  await cards.nth(1).locator('.meta').click({ modifiers: ['Control'] });
  assert((await page.locator('.card.picked').count()) === 2, 'Ctrl+click takes one away');
  await shot('em-2-media');
  await page.getByRole('button', { name: 'Remove selected (2)' }).click();
  assert(
    (await cards.count()) === 1 && (await notice.innerText()).startsWith('Removed 2 files (2 in use)') && !dialogs.length,
    'Remove selected removes them at once (no confirm), with a note',
  );
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  assert((await cards.count()) === 3 && (await page.locator('.card img').count()) === 3, 'Undo brings them back, pictures and all');
  await cards.nth(2).locator('.meta').click();
  await page.keyboard.press('Delete');
  assert((await cards.count()) === 2, 'Delete removes the selected file');
  await page.keyboard.press('Control+z');

  // ---------- Slide right-click menus ----------
  await page.locator('nav > button.round-tab').first().click();
  await page.locator('.grid .tile').first().click();
  const canvas = page.locator('.canvas');
  const stageBox = () => canvas.locator('.stage').boundingBox();
  const at = async (x, y) => {
    const r = await stageBox();
    return { x: r.x + (x * r.width) / 1920, y: r.y + (y * r.height) / 1080 };
  };
  const rightClick = async (x, y) => {
    const p = await at(x, y);
    await page.mouse.click(p.x, p.y, { button: 'right' });
  };
  const menu = page.locator('[aria-label="Slide item menu"]');
  const layers = page.locator('.layers-box .row');
  const pos = page.locator('.insp section:has(h4:text("Position"))');
  // Shrink the main text so the slide has empty spots.
  await page.locator('.canvas .hit').first().click();
  await page.locator('.insp textarea').fill('Main text');
  for (const [k, v] of [['X', 600], ['Y', 400], ['W', 600], ['H', 200]]) await pos.getByLabel(k, { exact: true }).fill(String(v));
  await page.keyboard.press('Escape');
  await rightClick(200, 900);
  await menu.waitFor();
  assert((await menu.getByRole('menuitem', { name: /Paste here/ }).isDisabled()) && !(await menu.getByText('Nothing here').count()), 'an empty spot has a menu (Paste here is off: nothing copied)');
  await shot('em-3-empty-menu');
  await menu.getByRole('menuitem', { name: '＋ Text here' }).click();
  assert((await layers.count()) === 2 && (await page.locator('.insp textarea').count()) === 1, '＋ Text here adds a text box');
  await page.locator('.insp textarea').fill('Second');
  const x2 = Number(await pos.getByLabel('X', { exact: true }).inputValue());
  const w2 = Number(await pos.getByLabel('W', { exact: true }).inputValue());
  assert(Math.abs(x2 + w2 / 2 - 200) < 5, 'there, where the menu was opened');
  await page.keyboard.press('Escape');

  // Items: Copy, then Paste on an empty spot puts it there.
  await rightClick(1300 / 2 + 250, 500);
  await menu.waitFor();
  assert((await menu.getByRole('menuitem', { name: /Copy/ }).count()) === 1 && (await menu.getByRole('menuitem', { name: /Cut/ }).count()) === 1, 'an item has Cut and Copy');
  await shot('em-4-item-menu');
  await menu.getByRole('menuitem', { name: /Copy/ }).click();
  await rightClick(1700, 150);
  await menu.getByRole('menuitem', { name: /Paste here/ }).click();
  assert((await layers.count()) === 3, 'Paste here pastes the copy');
  const px = Number(await pos.getByLabel('X', { exact: true }).inputValue());
  const pw = Number(await pos.getByLabel('W', { exact: true }).inputValue());
  assert(Math.abs(px + pw / 2 - 1700) < 5, `centred where the menu was opened (${px}+${pw}/2)`);
  // Align ▸ Left.
  await rightClick(1700, 150);
  await menu.getByRole('menuitem', { name: /^Align/ }).click();
  await menu.getByRole('menuitem', { name: 'Left', exact: true }).click();
  assert((await pos.getByLabel('X', { exact: true }).inputValue()) === '0', 'Align ▸ Left moves it to the left edge');
  await page.keyboard.press('Control+z');
  assert(Number(await pos.getByLabel('X', { exact: true }).inputValue()) === px, 'one Ctrl+Z undoes it');
  // Cut from the menu: one step, with the notice.
  await rightClick(1700, 150);
  await menu.getByRole('menuitem', { name: /Cut/ }).click();
  assert((await layers.count()) === 2 && (await page.locator('.notice').innerText()).includes('Cut text box'), 'Cut from the menu takes it off, with a note');
  // Select all from an empty spot.
  await rightClick(1800, 1000);
  await menu.getByRole('menuitem', { name: /Select all/ }).click();
  assert((await page.getByText('2 items selected.').count()) === 1, 'Select all selects everything');
  await page.keyboard.press('Escape');

  // ---------- Layers: double-click or F2 renames ----------
  const second = layers.filter({ hasText: 'Second' });
  await second.locator('.name').dblclick();
  const layerName = page.getByRole('textbox', { name: 'Layer name' });
  await layerName.fill('Subtitle');
  await layerName.press('Enter');
  assert((await layers.filter({ hasText: 'Subtitle' }).count()) === 1, 'double-click a layer to rename it');
  await page.keyboard.press('Control+z');
  assert((await second.count()) === 1, 'Ctrl+Z undoes the rename');
  await page.keyboard.press('Control+y');
  await layers.filter({ hasText: 'Subtitle' }).locator('.name').focus();
  await page.keyboard.press('F2');
  await layerName.fill('');
  await layerName.press('Enter');
  assert((await second.count()) === 1, 'F2, then an empty name goes back to the automatic label');
  await second.locator('.name').dblclick();
  await layerName.fill('Not this');
  await layerName.press('Escape');
  assert((await second.count()) === 1 && (await page.getByRole('dialog', { name: 'Edit clue' }).count()) === 1, 'Esc cancels (and leaves the clue open)');

  // ---------- A picture copied on a slide pastes onto the board images ----------
  await page.getByRole('button', { name: '🖼 Image' }).click();
  await drop(page.getByRole('dialog', { name: 'Choose image' }), [['sticker.png', 'image/png']]);
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await layers.filter({ hasText: 'sticker.png' }).locator('.name').click();
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /Board images/ }).click();
  const decor = page.locator('[aria-label="Board images"]');
  await decor.waitFor();
  await page.keyboard.press('Control+v');
  assert((await decor.locator('.layers-box .row, .row[data-layer]').count()) >= 1 && (await decor.getByText('sticker.png').count()) >= 1, 'Ctrl+V pastes the slide picture onto the board');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+x');
  assert((await decor.getByText('sticker.png').count()) === 0, 'Ctrl+X cuts it off the board');
  await page.keyboard.press('Control+v');
  assert((await decor.getByText('sticker.png').count()) >= 1, 'and Ctrl+V puts it back');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---------- Board game: a picture dropped on a space is its icon, on the empty board its background ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Board game/ }).click();
  const space3 = page.getByRole('button', { name: 'Space Space 3' });
  await drop(space3, [['coin.png', 'image/png']]);
  assert((await space3.locator('img').count()) === 1 && (await page.locator('.side img.ic').count()) === 1, 'a picture dropped on a space is its icon (and selects it)');
  const board = page.locator('.canvas-box .canvas');
  await drop(board.locator('.backdrop'), [['grass.png', 'image/png']]);
  assert((await board.locator('.backdrop img, .backdrop [style*="background-image"]').count()) >= 1, 'on the empty board, it is the background');
  await page.keyboard.press('Control+z');
  assert((await board.locator('.backdrop img, .backdrop [style*="background-image"]').count()) === 0, 'one Ctrl+Z takes it back');

  // ---------- ⌨ Shortcuts ----------
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Editor keyboard shortcuts' });
  await sheet.waitFor();
  for (const area of ['Clue', 'Slide', 'Map (RPG)', 'Board game', 'Lists']) assert((await sheet.getByRole('heading', { name: area, exact: true }).count()) === 1, `the sheet has ${area}`);
  await shot('em-5-shortcuts');
  await page.keyboard.press('Escape');
  assert((await sheet.count()) === 0, 'Esc closes it');
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Shift+Slash');
  assert((await sheet.count()) === 1, '? opens it');
  await page.keyboard.press('Shift+Slash');
  assert((await sheet.count()) === 0, 'and ? closes it again');

  assert(!errors.length, `no page errors (${errors.join(' | ')})`);
  console.log('\nEditor media E2E passed.');
} catch (e) {
  await shot('em-fail');
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
