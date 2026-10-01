// Keeping games safe in the browser: a full storage that recovers, New / Open… keeping the game they replace, the
// first Save asking for a name, hand-edited games, and exported player files that never touch the builder's files.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { answerReplace, nameGame, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
// Storage fills up while window.__full is set (as when the disk or the browser's quota is full).
await context.addInitScript(() => {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) {
    if (window.__full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return put.apply(this, a);
  };
});
const page = await context.newPage();
const errors = [];
const dialogs = [];
page.on('pageerror', (e) => errors.push(e.message));
// (The step that closes the tab answers its beforeunload itself.)
page.on('dialog', (d) => d.type() !== 'beforeunload' && (dialogs.push(`${d.type()}: ${d.message()}`), d.accept()));
mkdirSync('test-results', { recursive: true });
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const shot = async (name) => process.env.SHOTS && (await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }));

/** A plain-colored PNG. */
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
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const header = page.locator('header');
const autosaved = header.getByText('✓ Autosaved');
const historyCount = async () => Number((await page.getByRole('button', { name: /🕘 History/ }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
const mediaWidth = () =>
  page.locator('.card img').first().evaluate((i) => new Promise((r) => (i.complete && i.naturalWidth ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));
const storedKeys = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const k = req.result.transaction('keyval').objectStore('keyval').getAllKeys();
          k.onsuccess = () => res(k.result.map(String));
        };
      }),
  );

try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(600);
  assert(!(await storedKeys()).includes('__probe'), 'the storage check leaves nothing behind');

  // ---------- Storage full: files and steps are written once it works again ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => (window.__full = true));
  await page.locator('.cat textarea').first().fill('While full');
  await page.locator('.cat textarea').nth(1).click();
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  const [add] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Add files…' }).click()]);
  await add.setFiles([{ name: 'red.png', mimeType: 'image/png', buffer: png(255, 0, 0) }]);
  await page.locator('.card img').waitFor();
  await header.getByText('⚠ Autosave unavailable here: use Save').waitFor();
  assert(true, 'a full storage switches the header to "use Save"');
  await shot('datasafety-full');
  // Closing the tab now would lose the changes: the browser asks first.
  const leave = new Promise((r) => page.once('dialog', (d) => (r(d.type()), d.dismiss())));
  await page.close({ runBeforeUnload: true });
  assert((await leave) === 'beforeunload', 'closing the tab while nothing can be autosaved asks first');
  assert(!page.isClosed(), 'and staying keeps the page');
  // Room again: the next change writes what failed too, and only then says ✓ Autosaved.
  await page.evaluate(() => (window.__full = false));
  await page.locator('nav button.round-tab').first().click();
  await page.locator('.cat textarea').nth(2).fill('After');
  await page.locator('.cat textarea').nth(3).click();
  await autosaved.waitFor();
  await page.getByText('Autosave works again: everything is saved').waitFor();
  assert(true, 'once storage works again, the header says ✓ Autosaved (with a note)');
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(600);
  // (The round, its rename and the file, made while it was full, and the change after.)
  assert((await historyCount()) === 4, `the steps made while storage was full are kept (${await historyCount()} steps)`);
  await page.getByRole('button', { name: /🖼 Media \(1\)/ }).click();
  assert((await mediaWidth()) === 40, 'and the file added while it was full is there after a reload');

  // ---------- ℹ About says whether the browser keeps the storage ----------
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: 'ℹ About' }).click();
  await page.getByRole('dialog', { name: 'About Brainrot Games Maker' }).getByText(/^Storage: (kept|may be cleared)/).waitFor();
  assert(true, 'ℹ About says whether the storage is kept for good');
  await page.keyboard.press('Escape');

  // ---------- The first Save asks for a name ----------
  const [pack] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click().then(() => nameGame(page, 'Safe Game'))]);
  assert(pack.suggestedFilename() === 'Safe-Game.brainrot' && (await page.locator('input.title').inputValue()) === 'Safe Game', 'the first Save of an untitled game asks for its name, and names the file after it');
  const packPath = resolve('test-results/datasafety.brainrot');
  await pack.saveAs(packPath);

  // ---------- New keeps the game it replaces ----------
  // Just saved: New asks nothing.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const reopenBtn = page.getByRole('button', { name: '↶ Reopen previous game' });
  await reopenBtn.waitFor();
  assert((await page.locator('nav button.round-tab').count()) === 0, 'New after a Save asks nothing, and offers ↶ Reopen previous game');
  await shot('datasafety-reopen');
  // An empty game is replaced without a word, and isn't kept.
  await reopenBtn.click();
  await page.getByText('Reopened “Safe Game”').waitFor();
  assert((await page.locator('.cat textarea').first().inputValue()) === 'While full' && (await historyCount()) === 5, '↶ Reopen previous game brings it back with its undo history');
  await page.keyboard.press('Control+z');
  assert((await page.locator('input.title').inputValue()) === 'Untitled Game', 'and Ctrl+Z goes on through it (the name given at Save)');
  await page.keyboard.press('Control+y');
  // A change not saved to a file: New asks, and Cancel keeps the game.
  await page.locator('.cat textarea').first().fill('Unsaved');
  await page.locator('.cat textarea').nth(1).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog', { name: 'Start a new game?' }).waitFor();
  await shot('datasafety-ask');
  await answerReplace(page, 'Cancel');
  assert((await page.locator('.cat textarea').first().inputValue()) === 'Unsaved', 'New with unsaved changes asks: Cancel keeps the game');
  const [first] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'New', exact: true }).click().then(() => answerReplace(page, 'Save first'))]);
  await reopenBtn.waitFor();
  assert(first.suggestedFilename() === 'Safe-Game.brainrot' && (await page.locator('nav button.round-tab').count()) === 0, 'Save first saves, then starts the new game');

  // ---------- Open… lists recent games ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Final Jeopardy/ }).click();
  await page.getByRole('button', { name: 'Open…' }).click();
  const openDialog = page.getByRole('dialog', { name: 'Open a game' });
  await openDialog.waitFor();
  assert((await openDialog.getByRole('button', { name: /Safe Game/ }).count()) === 1, 'Open… lists the recent games');
  await shot('datasafety-open');
  await openDialog.getByRole('button', { name: /Safe Game/ }).click();
  await answerReplace(page, 'Discard');
  await page.getByText('Reopened “Safe Game”').waitFor();
  assert((await page.locator('.cat textarea').first().inputValue()) === 'Unsaved', 'a recent game reopens from Open…');
  await page.getByRole('button', { name: 'Open…' }).click();
  await openDialog.waitFor();
  assert((await openDialog.getByRole('button', { name: /Untitled Game/ }).count()) === 1, 'and the game it replaced (Discard) is kept there in turn');
  await openDialog.getByRole('button', { name: 'Forget' }).click();
  await openDialog.waitFor({ state: 'detached' });
  assert(true, 'Forget takes a game off the list');

  // ---------- Hand-edited games ----------
  const game = JSON.parse(await (await import('jszip')).default.loadAsync(readFileSync(packPath)).then((z) => z.file('game.json').async('text')));
  delete game.rounds[0].values;
  delete game.rounds[0].categories[0].clues[0].answerSlide;
  game.rounds[0].categories[0].clues[1].questionSlide.elements[0].text = null;
  game.players = [{ name: 'No color' }];
  writeFileSync(resolve('test-results/datasafety-hand.json'), JSON.stringify(game));
  // (The game open was saved with Save first, as its history remembers: nothing to ask.)
  await openGameFile(page, resolve('test-results/datasafety-hand.json'));
  await page.getByText(/^Opened "/).waitFor();
  await page.locator('nav button.round-tab').first().click();
  assert((await page.locator('.tile').count()) === 30, 'a hand-edited game missing its row values, a slide and a color opens with them filled in');
  game.rounds[0].mode = 'quiz';
  writeFileSync(resolve('test-results/datasafety-bad.json'), JSON.stringify(game));
  dialogs.length = 0;
  await openGameFile(page, resolve('test-results/datasafety-bad.json'));
  // Said in the app's own message window (not a browser alert).
  const told = page.getByRole('alertdialog');
  await told.waitFor();
  const msg = await told.innerText();
  assert(!dialogs.length && msg.includes('rounds[0].mode') && msg.includes('edited by hand'), `one it can't use says where it's wrong (${msg})`);
  await told.getByRole('button', { name: 'OK' }).click();

  // ---------- Exported player files never touch the builder's files ----------
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  const [html] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export HTML' }).click()]);
  const exported = resolve('test-results/datasafety-export.html');
  await html.saveAs(exported);
  const [replace] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.card').getByRole('button', { name: 'Replace…' }).click()]);
  await replace.setFiles([{ name: 'blue.png', mimeType: 'image/png', buffer: png(0, 0, 255, 80, 40) }]);
  await page.waitForTimeout(800);
  const player = await context.newPage();
  player.on('pageerror', (e) => errors.push(`[player] ${e.message}`));
  await player.goto(pathToFileURL(exported).href);
  await player.getByRole('button', { name: '▶ Play' }).waitFor();
  const home = await player.locator('.home').innerText();
  assert(home.includes("host's copy") && home.includes('1 board · 30 clues') && !home.includes('editor'), 'the player file says it is the host’s copy, and counts its rounds');
  if (process.env.SHOTS) await player.screenshot({ path: `${process.env.SHOTS}/datasafety-player.png` });
  await player.close();
  await page.reload();
  await page.getByRole('button', { name: /🖼 Media/ }).click();
  assert((await mediaWidth()) === 80, 'opening an older export leaves the builder’s replaced file alone');
  const html1 = readFileSync(exported, 'utf8');
  assert(html1.includes('Loading the game…') && /data-size="\d+"/.test(html1), 'an exported file says it is loading while it is read, and how long its pack is');
  // Cut off halfway (an unfinished download): it says so.
  const packAt = html1.indexOf('id="jb-pack"');
  const packEnd = html1.indexOf('</script>', packAt);
  writeFileSync(resolve('test-results/datasafety-cut.html'), html1.slice(0, Math.floor((packAt + packEnd) / 2)));
  const cut = await context.newPage();
  await cut.goto(pathToFileURL(resolve('test-results/datasafety-cut.html')).href);
  await cut.getByText('This file is incomplete').waitFor();
  assert(true, 'a cut-off exported file says it is incomplete');
  await cut.close();

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('Data safety E2E passed.');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/datasafety-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
