// The editor's one undo history: Ctrl+Z / Ctrl+Y go where each change is (and say so), a text box's own undo comes
// first, the 🕘 History tab jumps anywhere (asking first when it's far), deleting needs no confirm, removed and
// replaced files come back, the history survives a reload, a game opened starts afresh, and changes made while
// hosting are steps too.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { addClassicRounds, answerReplace, dragBy, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
/** Browser dialogs (none should show: deleting offers Undo instead of asking). */
const dialogs = [];
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/** A small solid-color PNG. */
function png(r, g, b, w = 40, h = 24) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const notice = page.locator('.history-notice');
const historyTab = page.locator('nav').getByRole('button', { name: /🕘 History/ });
const header = page.locator('.editor > header');
const catName = (i) => page.locator('.cat textarea').nth(i);
/** Somewhere that isn't a field, so Ctrl+Z goes to the history. */
const clickAway = () => page.locator('main').click({ position: { x: 4, y: 4 } });
const key = async (k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(250);
};
const reload = async () => {
  // The autosave (draft and history) is written a moment after the last change.
  await page.waitForTimeout(900);
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(600);
};
const imageWidth = () =>
  page.locator('.card img').evaluate((i) => new Promise((r) => (i.complete && i.naturalWidth ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.waitForTimeout(400);

  // ---------- Undo and redo go where each change is ----------
  await catName(0).fill('Memes');
  await clickAway();
  // Memes, $400 (tiles run across the board, a row at a time).
  const memes400 = page.locator('.tile').nth(6);
  await memes400.click();
  const clue = page.getByRole('dialog', { name: 'Edit clue' });
  await page.getByPlaceholder('Type the question…').fill('Who is Pepe?');
  await clue.getByRole('button', { name: '🅣 Text' }).click();
  await clue.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Round name').fill('Round of memes');
  await page.getByRole('button', { name: '🔊 Sounds' }).click();
  await page.waitForTimeout(300);
  assert((await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title')) === 'Undo: Renamed round “Round of memes” (Ctrl+Z)', '↶ names the step it undoes');

  await key('Control+z');
  assert((await page.locator('nav button.round-tab.active').innerText()).includes('Jeopardy!'), 'undoing the round name goes back to the round');
  assert((await notice.innerText()).startsWith('↶ Undid Renamed round “Round of memes”'), `and says what it undid (${await notice.innerText()})`);
  await key('Control+z');
  assert(await clue.isVisible(), 'undoing the text box opens its clue');
  assert(
    (await clue.locator('header').innerText()).includes('Memes') &&
      (await clue.locator('.value').innerText()) === '$400' &&
      (await clue.getByRole('tab', { name: 'Question slide' }).getAttribute('aria-selected')) === 'true',
    'the right clue, on its question side',
  );
  assert((await clue.locator('.layers .row').count()) === 1, 'with the text box gone (only the question is left)');
  assert((await page.locator('.toast').innerText()).includes('↶ Undid Added text box'), 'and a toast over the window names it (the note would be under it)');
  await key('Control+z');
  assert((await page.getByPlaceholder('Type the question…').inputValue()) === '', 'the next Ctrl+Z takes the question back');
  await page.keyboard.press('Control+z');
  await page.locator('.cat.flash').waitFor({ timeout: 2000 });
  assert(!(await clue.isVisible()) && (await catName(0).inputValue()) === 'Category 1', 'undoing the category name closes the clue and flashes the category');
  for (let i = 0; i < 4; i++) await key('Control+y');
  assert(
    (await catName(0).inputValue()) === 'Memes' && (await page.getByLabel('Round name').inputValue()) === 'Round of memes',
    'Ctrl+Y four times redoes it all',
  );
  await memes400.click();
  assert((await clue.locator('.layers-box .row').count()) === 2 && (await page.getByPlaceholder('Type the question…').inputValue()) === 'Who is Pepe?', 'question and text box are back');
  await clue.getByRole('button', { name: 'Done' }).click();

  // ---------- A text box's own undo first, then the history ----------
  await catName(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' abc def', { delay: 20 });
  await page.keyboard.press('Control+z');
  const partly = await catName(1).inputValue();
  assert(partly !== 'Category 2 abc def' && partly.startsWith('Category 2'), `Ctrl+Z in a box with typing of its own is the box's own (${partly})`);
  for (let i = 0; i < 8 && (await catName(1).inputValue()) !== 'Category 2'; i++) await page.keyboard.press('Control+z');
  assert((await catName(1).inputValue()) === 'Category 2', 'until the box is back as it was');
  await key('Control+z');
  assert((await page.getByLabel('Round name').inputValue()) === 'Jeopardy!', 'then Ctrl+Z goes on through the history');
  await key('Control+y');

  // ---------- Deleting needs no confirm ----------
  await page.locator('.cat').nth(3).getByRole('button', { name: 'More for category 4' }).click();
  await page.getByRole('menuitem', { name: '🗑 Delete category' }).click();
  await page.waitForTimeout(200);
  assert((await page.locator('.cat').count()) === 5 && (await notice.innerText()).startsWith('Deleted category “Category 4”'), 'deleting a category is done at once, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForTimeout(250);
  assert((await page.locator('.cat').count()) === 6 && (await page.locator('.cat textarea').nth(3).inputValue()) === 'Category 4', 'and its ↶ Undo puts it back in place');

  // ---------- The History tab ----------
  await historyTab.click();
  const rows = page.locator('.hist .hr');
  assert((await page.locator('.hist .head').count()) >= 1, 'steps are grouped under the minute they were made');
  assert(
    (await rows.first().innerText()).includes('Deleted category “Category 4”') && (await page.locator('.hist .hr.undone').count()) === 1,
    'the step just undone is on top, dimmed',
  );
  assert((await page.locator('.hist .hr.current').innerText()).includes('Renamed round “Round of memes”'), 'below ● Now, the latest step, marked Now');
  await page.locator('.hist .hr.origin .pick').click();
  await page.waitForTimeout(250);
  assert((await page.locator('nav button.round-tab').count()) === 0, 'the first row undoes everything, back to the new game');
  assert((await page.locator('.hist .hr.undone').count()) === (await rows.count()) - 1, 'every step shows as undone, above ● Now');
  await rows.nth(1).locator('.pick').click();
  await page.waitForTimeout(250);
  assert((await page.locator('nav button.round-tab').count()) === 2 && (await page.locator('.hist .hr.undone').count()) === 1, 'a row redoes everything up to it');
  // The filter shows only the steps whose names (or places) have its words.
  const allSteps = await page.locator('.hist .hr:not(.origin)').count();
  const filter = page.getByLabel('Filter the steps');
  await filter.fill('category');
  const shownSteps = await page.locator('.hist .hr:not(.origin) .lb').allInnerTexts();
  assert(
    shownSteps.length > 0 && shownSteps.length < allSteps && shownSteps.every((t) => /category/i.test(t)),
    `the filter shows only the matching steps (${shownSteps.length} of ${allSteps})`,
  );
  assert((await page.locator('.hist .filter [role="status"]').innerText()) === `${shownSteps.length} of ${allSteps} steps`, 'and says how many');
  await filter.press('ArrowDown');
  assert(await page.locator('.hist .hr:not(.origin) .pick').first().evaluate((el) => el === document.activeElement), '↓ from the filter goes to the first step shown');
  await filter.fill('no such step anywhere');
  assert((await page.locator('.hist .filter [role="status"]').innerText()) === 'No steps match', 'a filter that matches nothing says so');
  await filter.press('Escape');
  assert((await filter.inputValue()) === '' && (await page.locator('.hist .hr:not(.origin)').count()) === allSteps, 'Esc clears it: every step is back');
  // The list is one Tab stop (the step the game is at), however many steps it has: ↑/↓ move between them.
  assert(
    (await page.locator('.hist .pick[tabindex="0"]').count()) === 1 && (await rows.nth(1).locator('.pick').getAttribute('tabindex')) === '0',
    'the list is one Tab stop, on the step the game is at',
  );
  await rows.nth(1).locator('.pick').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  assert(await rows.nth(1).locator('.pick').evaluate((el) => el === document.activeElement), '↑/↓ move between the steps');
  // G (Go there) shows the place, and the focus goes there too, not to the page.
  await page.keyboard.press('g');
  await page.waitForTimeout(400);
  assert(!(await page.locator('.hist').count()) && (await page.locator('nav button.round-tab.active').count()) === 1, 'Go there shows the round it changed');
  await page
    .waitForFunction(() => !!document.activeElement && document.activeElement !== document.body && !!document.activeElement.closest('main, nav'), null, { timeout: 3000 })
    .catch(() => {});
  assert(await page.evaluate(() => !!document.activeElement && document.activeElement !== document.body && !!document.activeElement.closest('main, nav')), 'and the focus is there, not on the page');

  // ---------- RPG screens ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /RPG/ }).click();
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  await page.getByRole('button', { name: 'Add a screen at column 3, row 1' }).click();
  await page.getByRole('button', { name: 'Move down', exact: true }).click();
  // (A click's changes are a step after a pause.)
  await page.waitForTimeout(900);
  const moved = await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(moved.startsWith('Undo: Moved screen “Screen C1” to C2'), `moving a screen names where it went (${moved})`);
  await page.getByRole('button', { name: '🗑 Delete', exact: true }).click();
  await page.waitForTimeout(200);
  assert((await notice.innerText()).startsWith('Deleted screen “Screen C1”') && !(await page.locator('.cell.screen.sel').count()), 'deleting a screen is done at once, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForTimeout(250);
  assert((await page.locator('.cell.screen.sel').getAttribute('aria-label')) === 'Screen Screen C1', 'its ↶ Undo brings it back, selected');
  // Screens drag on the grid: to an empty cell, or onto another screen to swap them (the 🏁 goes with its screen).
  const screenAt = (c, r) => page.locator(`.grid-map [data-cell="${c},${r}"]`).getAttribute('aria-label');
  const undoTitle = () => header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  await dragBy(page, page.getByRole('button', { name: 'Screen Screen C1' }), page.getByRole('button', { name: 'Add a screen at column 4, row 1' }));
  assert((await screenAt(3, 0)) === 'Screen Screen C1' && (await undoTitle()).startsWith('Undo: Moved screen “Screen C1” to D1'), 'a screen dragged to an empty cell moves there, one step');
  await dragBy(page, page.getByRole('button', { name: 'Screen Start' }), page.getByRole('button', { name: 'Screen Screen B1' }));
  const swapped = (await screenAt(1, 0)) === 'Screen Start' && (await screenAt(0, 0)) === 'Screen Screen B1';
  assert(swapped && (await page.locator('[data-cell="1,0"] .start').count()) === 1, 'a screen dropped on another swaps them, and the start goes with it');
  assert((await undoTitle()).startsWith('Undo: Swapped screens “Start” and “Screen B1”'), `a swap is one step (${await undoTitle()})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  assert((await screenAt(0, 0)) === 'Screen Start' && (await notice.innerText()).startsWith('↶ Undid Swapped screens'), 'Ctrl+Z swaps them back');
  // Delete deletes the selected screen (no question asked), and Ctrl+Z brings it back selected.
  await page.getByRole('button', { name: 'Screen Screen C1' }).click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  assert(
    !(await page.getByRole('button', { name: 'Screen Screen C1' }).count()) && (await notice.innerText()).startsWith('Deleted screen “Screen C1”') && !dialogs.length,
    'the Delete key deletes the selected screen, with a note',
  );
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  assert((await page.locator('.cell.screen.sel').getAttribute('aria-label')) === 'Screen Screen C1', 'Ctrl+Z brings it back, selected');

  // A map's tab has the round tabs' keys, and they never reach the selected screen.
  const mapTabs = page.getByRole('tablist', { name: 'Maps' }).getByRole('tab');
  const mapNames = async () => (await mapTabs.allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim()).join('|');
  const screens = await page.locator('.cell.screen').count();
  await page.getByRole('button', { name: '＋ Add map' }).click();
  await mapTabs.first().click();
  await page.getByRole('button', { name: 'Screen Screen C1' }).click();
  await mapTabs.first().focus();
  await key('Control+d');
  assert((await mapNames()) === 'Overworld|Overworld (copy)|Area 1', `Ctrl+D on a map's tab duplicates the map (${await mapNames()})`);
  await mapTabs.nth(1).focus();
  await key('Alt+ArrowRight');
  assert((await mapNames()) === 'Overworld|Area 1|Overworld (copy)', "Alt+→ moves it later");
  await mapTabs.nth(2).focus();
  await key('Delete');
  assert((await mapNames()) === 'Overworld|Area 1' && (await notice.innerText()).startsWith('Deleted map “Overworld (copy)”'), 'Delete deletes the map, with a note');
  await mapTabs.first().click();
  assert((await page.locator('.cell.screen').count()) === screens, 'and none of those keys touched the screens');

  // ---------- Removed and replaced files ----------
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '＋ Add files…' }).click()]);
  await chooser.setFiles([{ name: 'tiny.png', mimeType: 'image/png', buffer: png(255, 0, 0) }]);
  await page.locator('.card img').waitFor();
  await page.locator('nav button.round-tab').first().click();
  await page.locator('.cat').first().getByTitle(/Use an image/).click();
  await page.getByRole('button', { name: /tiny\.png/ }).first().click();
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  await page.locator('.card').getByRole('button', { name: /^Delete / }).click();
  await page.waitForTimeout(200);
  assert((await page.locator('.card').count()) === 0 && (await notice.innerText()).startsWith('Deleted file “tiny.png” (used 1×)'), 'removing a used file is done at once, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForTimeout(300);
  assert((await imageWidth()) === 40, 'its ↶ Undo brings the file back, showing');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.card').getByRole('button', { name: 'Replace…' }).click()]);
  await picker.setFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: png(0, 0, 255, 80, 40) }]);
  await page.waitForTimeout(400);
  assert((await imageWidth()) === 80, 'Replace… puts the new picture in');
  await clickAway();
  await key('Control+z');
  assert((await imageWidth()) === 40 && (await page.locator('.card .nm').innerText()) === 'tiny.png', 'Ctrl+Z puts the old picture back');
  await key('Control+y');
  assert((await imageWidth()) === 80, 'Ctrl+Y the new one again');

  // ---------- The history survives a reload (and so do the files it can bring back) ----------
  await page.locator('.card').getByRole('button', { name: /^Delete / }).click();
  const steps = await historyTab.innerText();
  await reload();
  assert((await historyTab.innerText()) === steps, `the steps are still there after a reload (${steps})`);
  await historyTab.click();
  assert((await rows.first().innerText()).includes('Deleted file “wide.png”'), 'the History tab lists them');
  await reload();
  await key('Control+z');
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  await page.waitForTimeout(300);
  assert((await imageWidth()) === 80, 'Ctrl+Z after two reloads brings the removed file back, showing');

  // ---------- Changes made while hosting are steps too ----------
  // (The board wants a Daily Double again: addClassicRounds asked for none.)
  await page.locator('nav button.round-tab').first().click();
  await page.getByLabel('How many Daily Doubles').fill('1');
  await page.getByLabel('How many Daily Doubles').press('Tab');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.locator('.checks summary').click();
  await page.getByRole('button', { name: '🎲 Place now' }).first().click();
  await page.getByRole('button', { name: '◀ Back to editor' }).click();
  await historyTab.click();
  const played = rows.first();
  assert((await played.innerText()).includes('Placed 1 Daily Double in Round of memes') && (await played.locator('.play').count()) === 1, 'Daily Doubles placed before a game are a step, with a ▶');
  assert((await page.locator('.hist .mark').first().innerText()).includes('Played'), 'and pressing ▶ Play is marked');
  await key('Control+z');
  await page.locator('nav button.round-tab').first().click();
  assert(!(await page.locator('.tile .dd').count()), 'Ctrl+Z takes the Daily Double back off the board');

  // ---------- A game opened starts afresh ----------
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^More:/ }).click().then(() => page.getByRole('menuitem', { name: /Export JSON/ }).click())]);
  const saved = resolve('test-results/history-save.json');
  await json.saveAs(saved);
  await openGameFile(page, saved);
  await answerReplace(page, 'Discard');
  await page.getByText(/^Opened “/).waitFor();
  await historyTab.click();
  assert((await rows.count()) === 1 && (await rows.first().innerText()).includes('📂 Opened “Untitled Game”'), 'a game opened has only where it was opened in its history');
  await key('Control+z');
  assert((await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).isDisabled()) && (await rows.count()) === 1, 'and nothing to undo');

  // ---------- A long jump asks first, right under the step clicked ----------
  await page.locator('nav button.round-tab').first().click();
  for (let i = 0; i < 11; i++) {
    await page.getByTitle('Double every row value').click();
    await page.getByTitle('Halve every row value').click();
  }
  await historyTab.click();
  await page.locator('.hist .hr.origin .pick').click();
  const ask = page.locator('.hist .hr.origin + .ask');
  assert((await ask.innerText()).startsWith('Go back 22 steps'), 'going back more than 20 steps asks first, under the step clicked');
  await page.waitForTimeout(450);
  await ask.getByRole('button', { name: 'Go back 22 steps' }).click();
  await page.waitForTimeout(250);
  assert((await page.locator('.hist .hr.undone').count()) === 22 && !(await ask.count()), 'and goes back once asked');

  // ---------- Files dropped and where they go: one step ----------
  await page.locator('nav button.round-tab').first().click();
  const dt = await page.evaluateHandle((files) => {
    const d = new DataTransfer();
    for (const [name, bytes] of files) d.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
    return d;
  }, [['red.png', [...png(255, 0, 0)]], ['blue.png', [...png(0, 0, 255)]]]);
  await page.locator('.cat').first().dispatchEvent('dragover', { dataTransfer: dt });
  await page.locator('.cat').first().dispatchEvent('drop', { dataTransfer: dt });
  await page.locator('.cat .cat-img img').nth(1).waitFor();
  const dropped = await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(dropped === 'Undo: Set 2 category images (Ctrl+Z)', `two images dropped on the categories are one step (${dropped})`);
  await clickAway();
  await key('Control+z');
  // (The first category shows the picture it had before: wide.png.)
  const images = await page.locator('.cat .cat-img img').count();
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  const names = await page.locator('.card .nm').allInnerTexts();
  assert(images === 1 && !names.some((n) => /red|blue/.test(n)), `and one Ctrl+Z takes the images and their files back (${names})`);

  assert(dialogs.length === 0, `no browser dialogs (Open… asks in the page) (${dialogs.join(' | ')})`);
  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('History E2E passed.');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/history-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
