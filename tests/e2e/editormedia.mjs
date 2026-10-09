// Editor media and keys: files dropped on media slots and into an open picker (and pasted into it), the Media page
// (rename, drop to replace, select several to remove), the slide's right-click menus, renaming layers, board images
// on the slides' clipboard, and the ⌨ Shortcuts sheet.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, openGameFile } from './helpers.mjs';

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
      // (Each file's own bytes: the same bytes added twice are one file in the game. A PNG ignores what follows its end.)
      for (const [name, type] of fs) d.items.add(new File([type === 'image/png' ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : 'x', name], name, { type }));
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
  await page.getByRole('button', { name: '🔊 Sounds' }).click();
  const soundBtn = page.getByRole('button', { name: /^Choose file for/ }).first();
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
  // (The file is read first: a busy machine takes a moment.)
  await picker.waitFor({ state: 'detached' });
  await banner.locator('img').waitFor();
  assert((await banner.locator('img').count()) === 1, 'a file dropped on an open picker is picked at once');
  await banner.getByRole('button', { name: 'Change…' }).click();
  await picker.waitFor();
  await page.evaluate(
    ([b64]) => {
      const d = new DataTransfer();
      d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), 'pasted.png'], 'pasted.png', { type: 'image/png' }));
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
  // A card's buttons sit on one line, and its "used 1×" says where.
  const [replaceBox, deleteBox] = [await cards.nth(0).getByRole('button', { name: 'Replace…' }).boundingBox(), await cards.nth(0).getByRole('button', { name: /^Delete / }).boundingBox()];
  assert(Math.abs(replaceBox.y - deleteBox.y) < 2, "a card's Replace… and 🗑 Delete sit side by side");
  const where = (await cards.nth(0).locator('.meta .where').getAttribute('title')) ?? '';
  assert(where.includes('Theme: background picture'), `its "used 1×" tooltip says where (${where.replace(/\n/g, ' / ')})`);

  await drop(cards.nth(0), [['song.mp3', 'audio/mpeg']]);
  assert((await toast.innerText()).includes('song.mp3') && (await names())[0] === 'wall.png', 'a sound dropped on a picture card is refused with a toast');
  await drop(cards.nth(0), [['wall2.png', 'image/png']]);
  assert((await names())[0] === 'wall2.png' && (await cards.count()) === 3, 'a picture dropped on a picture card replaces it (no new file)');
  await page.keyboard.press('Control+z');
  assert((await names())[0] === 'wall.png', 'Ctrl+Z puts the old file back');

  await cards.nth(0).locator('.meta').click();
  await cards.nth(2).locator('.meta').click({ modifiers: ['Shift'] });
  assert((await page.locator('.card.picked').count()) === 3, 'click, then Shift+click selects the run');
  // A filter's hidden cards are never taken into a Shift+click run.
  await cards.nth(0).locator('.meta').click();
  await page.getByRole('searchbox', { name: 'Filter files' }).fill('pasted');
  await cards.nth(0).locator('.meta').click({ modifiers: ['Shift'] });
  await page.getByRole('searchbox', { name: 'Filter files' }).fill('');
  assert((await page.locator('.card.picked').count()) === 1, 'a Shift+click with a filter on picks no hidden card');
  // A filter that hides a selected card takes it out of the selection: Delete selected never takes a file not on show.
  await cards.nth(0).locator('.meta').click();
  await page.getByRole('searchbox', { name: 'Filter files' }).fill('pasted');
  await cards.nth(0).getByRole('checkbox').check();
  await page.getByRole('button', { name: '🗑 Delete selected (1)' }).waitFor();
  await page.getByRole('searchbox', { name: 'Filter files' }).fill('');
  assert(
    (await page.locator('.card.picked').count()) === 1 && (await page.locator('.card.picked .nm').innerText()) === 'pasted.png',
    'a card hidden by the filter leaves the selection (only the one ticked with the filter on stays selected)',
  );
  await cards.nth(0).locator('.meta').click();
  await cards.nth(2).locator('.meta').click({ modifiers: ['Shift'] });
  await cards.nth(1).locator('.meta').click({ modifiers: ['Control'] });
  assert((await page.locator('.card.picked').count()) === 2, 'Ctrl+click takes one away');
  await shot('em-2-media');
  await page.getByRole('button', { name: '🗑 Delete selected (2)' }).click();
  assert(
    (await cards.count()) === 1 && (await notice.innerText()).startsWith('Deleted 2 files (2 in use)') && !dialogs.length,
    'Remove selected removes them at once (no confirm), with a note',
  );
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  assert((await cards.count()) === 3 && (await page.locator('.card img').count()) === 3, 'Undo brings them back, pictures and all');
  await cards.nth(2).locator('.meta').click();
  await page.keyboard.press('Delete');
  assert((await cards.count()) === 2, 'Delete removes the selected file');
  await page.keyboard.press('Control+z');
  // With the focus on a card's Select checkbox, Delete still removes (and Esc unselects).
  const tick = cards.nth(2).getByRole('checkbox');
  await tick.check();
  await tick.focus();
  await page.keyboard.press('Escape');
  assert((await page.locator('.card.picked').count()) === 0, 'Esc on a Select checkbox unselects');
  await tick.check();
  await page.keyboard.press('Delete');
  assert((await cards.count()) === 2, 'Delete on a Select checkbox removes the selected file');
  await page.keyboard.press('Control+z');
  // A file added here scrolls into view and flashes (on a full page it landed below the fold, with no sign).
  await page.evaluate(() => {
    window.__flashed = [];
    new MutationObserver((rs) => rs.forEach((r) => r.target.classList.contains('flash') && window.__flashed.push(r.target.dataset.place))).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
  });
  await drop(page.locator('.library'), [['added.png', 'image/png']]);
  const addedPlace = await cards.filter({ hasText: 'added.png' }).getAttribute('data-place');
  const flashed = await page.waitForFunction((p) => window.__flashed.includes(p), addedPlace, { timeout: 5000 }).then(() => true, () => false);
  assert(flashed, 'a file added on the Media page flashes its new card');
  await page.keyboard.press('Control+z');
  await cards.filter({ hasText: 'added.png' }).waitFor({ state: 'detached' });
  // A game or theme file dropped on the page (or on a card) isn't media: the editor opens it.
  const okAsk = async (text) => {
    const ask = page.getByRole('alertdialog').filter({ hasText: text });
    await ask.waitFor();
    await ask.getByRole('button', { name: 'OK' }).click();
  };
  await drop(page.locator('.library'), [['Neon.brainrot-theme', 'application/octet-stream']]);
  await okAsk('can’t be used as a theme');
  await drop(cards.nth(1), [['Trivia Night.html', 'text/html']]);
  await okAsk('no game inside');
  assert(
    (await cards.count()) === 3 && (await names())[1] === 'Show logo.png' && !(await toast.allInnerTexts()).some((t) => t.includes('isn\'t a supported')),
    'a theme file or an exported .html game dropped on the Media page goes to the editor, which opens it (not refused as media)',
  );

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
  await layers.filter({ hasText: 'Second' }).waitFor();
  const x2 = Number(await pos.getByLabel('X', { exact: true }).inputValue());
  const w2 = Number(await pos.getByLabel('W', { exact: true }).inputValue());
  // (Centred on that spot as far as the slide allows: a box that would stick out past the edge is moved onto it.)
  assert(x2 === 0 && x2 + w2 >= 200, 'there, where the menu was opened, kept on the slide');
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
  // (Should this ever not be there, say what the layers are.)
  await second.waitFor({ timeout: 5000 }).catch(async () => {
    throw new Error(`no "Second" layer: ${JSON.stringify(await layers.allInnerTexts())}`);
  });
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
  const lastStep = () => page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  const stepBefore = await lastStep();
  await second.locator('.name').dblclick();
  await layerName.press('Enter');
  assert((await second.count()) === 1 && (await lastStep()) === stepBefore, 'opening the rename and pressing Enter changes nothing: no step, and it keeps its automatic label');

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
  const space3 = page.locator('.canvas').getByRole('button', { name: 'Space 3', exact: true });
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

  // ---------- Files only the undo history holds survive New, ↶ Reopen previous game and 🗑 Delete in Open… ----------
  const media = page.getByRole('button', { name: /^🖼 Media/ });
  const undoTitle = () => page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  const card = (name) => page.locator('.library .card', { hasText: name });
  /** Add a picture on the Media page, then Remove it: only the step can bring it back. */
  async function addAndRemove(name) {
    await media.click();
    await drop(page.locator('.library'), [[name, 'image/png']]);
    await card(name).locator('img').waitFor();
    await card(name).getByRole('button', { name: /^Delete / }).click();
    await page.waitForFunction((n) => document.querySelector('.editor > header button[title^="Undo:"]')?.getAttribute('title')?.includes(`Deleted file “${n}”`), name);
  }
  const blurAll = () => page.evaluate(() => document.activeElement?.blur?.());
  await addAndRemove('keep.png');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await page.getByRole('button', { name: '↶ Reopen previous game' }).click();
  await page.waitForFunction(() => document.querySelector('.editor > header button[title^="Undo:"]')?.getAttribute('title')?.includes('Deleted file “keep.png”'));
  // (Any cleanup of files runs a little after a game is replaced.)
  await page.waitForTimeout(800);
  await blurAll();
  await page.keyboard.press('Control+z');
  await media.click();
  await card('keep.png').locator('img').waitFor();
  assert((await page.locator('.missing-box').count()) === 0, 'a reopened game’s undo history still has its files (Undo of a removed file shows it)');
  // Delete another kept game from Recent games: this game's own history keeps its files.
  await card('keep.png').getByRole('button', { name: /^Delete / }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await addAndRemove('other.png');
  await page.getByRole('button', { name: 'Open…' }).click();
  const openDlg = page.getByRole('dialog', { name: 'Open a game' });
  await openDlg.waitFor();
  await openDlg.getByRole('button', { name: /^Delete “/ }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(800);
  if (await openDlg.count()) await page.keyboard.press('Escape');
  await blurAll();
  await page.keyboard.press('Control+z');
  await media.click();
  await card('other.png').locator('img').waitFor();
  assert((await page.locator('.missing-box').count()) === 0 && !!(await undoTitle()), '🗑 Delete in Open… keeps the files this game’s undo history can bring back');

  // ---------- 🔊 Sounds: a sound whose file is missing (a .json export has none) is picked again on its own row ----------
  {
    const first = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const a = await first.newPage();
    a.on('pageerror', (e) => errors.push(`[export] ${e.message}`));
    await a.goto(pathToFileURL(file).href);
    await addClassicRounds(a);
    await a.getByRole('button', { name: '🔊 Sounds' }).click();
    await a.getByRole('button', { name: 'Choose file for Round intro' }).click();
    const [fc] = await Promise.all([a.waitForEvent('filechooser'), a.getByRole('button', { name: '⬆ Upload audio file…' }).click()]);
    await fc.setFiles({ name: 'intro-music.wav', mimeType: 'audio/wav', buffer: Buffer.from('intro') });
    await a.getByText('🔊 intro-music.wav').waitFor();
    const [json] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: /^More:/ }).click().then(() => a.getByRole('menuitem', { name: /Export JSON/ }).click())]);
    const fresh = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const b = await fresh.newPage();
    b.on('pageerror', (e) => errors.push(`[fresh] ${e.message}`));
    await b.goto(pathToFileURL(file).href);
    await openGameFile(b, await json.path());
    await first.close();
    await b.locator('.problems').getByText('1 sound file missing: see 🔊 Sounds').click();
    const row = b.locator('.sound', { hasText: 'Round intro' });
    await row.getByText('⚠ intro-music.wav is missing: plays the built-in sound').waitFor();
    const [pick] = await Promise.all([b.waitForEvent('filechooser'), row.getByRole('button', { name: '🔗 Find file…' }).click()]);
    await pick.setFiles({ name: 'intro-music.wav', mimeType: 'audio/wav', buffer: Buffer.from('intro') });
    await row.locator('.file', { hasText: '🔊 intro-music.wav' }).waitFor();
    // (The checklist is worked out again a moment later.)
    const nothingMissing = await b
      .waitForFunction(() => ![...document.querySelectorAll('.problems .problem')].some((p) => p.textContent.includes('missing')), null, { timeout: 5000 })
      .then(() => true, () => false);
    assert(
      (await b.getByRole('button', { name: '🖼 Media (1)' }).count()) === 1 && nothingMissing,
      '🔗 Find file… on a missing sound’s row puts that file back (same name, no second copy) and the checklist stops saying a file is missing',
    );
    await fresh.close();
  }

  assert(!errors.length, `no page errors (${errors.join(' | ')})`);
  console.log('\nEditor media E2E passed.');
} catch (e) {
  await shot('em-fail');
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
