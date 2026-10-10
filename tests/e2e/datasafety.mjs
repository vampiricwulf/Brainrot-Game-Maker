// Keeping games safe in the browser: a full storage that recovers, New / Open… keeping the game they replace, the
// first Save asking for a name, hand-edited games, and exported player files that never touch the builder's files.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { answerReplace, exportHtml, nameGame, noDailyDoubles, openGameFile, png } from './helpers.mjs';

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

const header = page.locator('header');
const autosaved = header.getByText('✓ Autosaved');
const historyCount = async () => Number((await page.getByRole('button', { name: /🕘 History/ }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
const mediaWidth = () =>
  page.locator('.card img').first().evaluate((i) => new Promise((r) => (i.complete && i.naturalWidth ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));
/** How wide the picture stored for file `id` is (0: none stored). */
const storedWidth = (id) =>
  page.evaluate(
    (id) =>
      new Promise((res) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const g = req.result.transaction('keyval').objectStore('keyval').get(`media:${id}`);
          g.onsuccess = () => (g.result ? createImageBitmap(g.result).then((b) => res(b.width)) : res(0));
        };
      }),
    id,
  );
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
  const [add] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '＋ Add files…' }).click()]);
  await add.setFiles([{ name: 'red.png', mimeType: 'image/png', buffer: png(255, 0, 0) }]);
  await page.locator('.card img').waitFor();
  await header.getByText('⚠ Autosave unavailable here: use Save').waitFor();
  assert(true, 'a full storage switches the header to "use Save"');
  await shot('datasafety-full');
  // New while full: the question says going on loses the game (it can't be kept in Recent games).
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const fullAsk = page.getByRole('dialog', { name: /^Start a new game/ });
  await fullAsk.getByText(/storage is full.*Start new anyway loses it/).waitFor();
  assert((await fullAsk.getByText('Recent games brings it back').count()) === 0, 'with storage full, the question says Start new anyway loses the game');
  await answerReplace(page, 'Cancel');
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
  assert((await openDialog.getByRole('button', { name: /^Safe Game/ }).count()) === 1, 'Open… lists the recent games');
  assert(
    (await openDialog.getByRole('heading', { name: 'Recent games' }).count()) === 1 &&
      (await openDialog.getByRole('group', { name: 'Saved files' }).getByRole('button', { name: 'Browse…' }).count()) === 1,
    'Open… keeps Recent games (kept in this browser) apart from Saved files: Browse…',
  );
  await shot('datasafety-open');
  await openDialog.getByRole('button', { name: /^Safe Game/ }).click();
  // Going on without saving keeps the game (in Recent games): the question says so, and its button isn't "Discard".
  const reopenAsk = page.getByRole('dialog', { name: /^Reopen “Safe Game”/ });
  await reopenAsk.waitFor();
  assert(
    (await reopenAsk.getByRole('button', { name: 'Reopen anyway' }).count()) === 1 &&
      (await reopenAsk.getByRole('button', { name: 'Discard' }).count()) === 0 &&
      (await reopenAsk.innerText()).includes('Reopen anyway keeps it in this browser'),
    'reopening a recent game over unsaved changes offers Reopen anyway, which says it keeps the game in Recent games',
  );
  await answerReplace(page, 'Discard');
  await page.getByText('Reopened “Safe Game”').waitFor();
  assert((await page.locator('.cat textarea').first().inputValue()) === 'Unsaved', 'a recent game reopens from Open…');
  await page.getByRole('button', { name: 'Open…' }).click();
  await openDialog.waitFor();
  assert((await openDialog.getByRole('button', { name: /^Untitled Game/ }).count()) === 1, 'and the game it replaced (Reopen anyway) is kept there in turn');
  // 🗑 Delete deletes the kept game and its files for good: it asks first.
  await openDialog.getByRole('button', { name: /^Delete “Untitled Game”/ }).click();
  const forgetAsk = page.getByRole('alertdialog').filter({ hasText: 'Delete “Untitled Game” from Recent games?' });
  await forgetAsk.waitFor();
  await forgetAsk.getByRole('button', { name: 'Cancel' }).click();
  assert((await openDialog.getByRole('button', { name: /^Untitled Game/ }).count()) === 1, '🗑 Delete asks first: Cancel keeps the game listed');
  await openDialog.getByRole('button', { name: /^Delete “Untitled Game”/ }).click();
  await forgetAsk.getByRole('button', { name: 'Delete', exact: true }).click();
  await openDialog.waitFor({ state: 'detached' });
  assert(true, '🗑 Delete takes a game off the list');

  // ---------- Open… checks the file before asking about this game ----------
  await page.locator('.cat textarea').first().fill('Not saved yet');
  await page.waitForTimeout(700);
  // (What the editor shows while the file is read: a big pack takes a while.)
  await page.evaluate(() => {
    window.__opening = [];
    const editor = document.querySelector('.editor');
    new MutationObserver(() => window.__opening.push({ text: editor.querySelector('header').textContent, inert: editor.querySelector(':scope > .body').inert })).observe(editor, {
      subtree: true,
      childList: true,
      characterData: true,
      attributeFilter: ['inert'],
    });
  });
  await openGameFile(page, { name: 'Holiday photos.brainrot', mimeType: 'application/octet-stream', buffer: Buffer.from('not a game at all') });
  const notGame = page.getByRole('alertdialog').filter({ hasText: 'not a Brainrot Games Maker game pack' });
  await notGame.waitFor();
  assert(
    (await page.evaluate(() => window.__opening)).some((s) => s.text.includes('📂 Opening “Holiday photos.brainrot”…') && s.inert),
    'while a game file is read, the header says it is opening it, and the game can’t be changed meanwhile',
  );
  assert((await page.getByRole('dialog', { name: /^Open “/ }).count()) === 0, 'a file that isn’t a game says so, without asking Save first / Discard about the game open');
  await notGame.getByRole('button', { name: 'OK' }).click();
  assert((await page.locator('.cat textarea').first().inputValue()) === 'Not saved yet', 'and the game open stays as it was');

  // ---------- A game pack dropped as .zip opens ----------
  const zipped = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'Safe Game.zip', { type: 'application/zip' }));
    return dt;
  }, readFileSync(packPath).toString('base64'));
  await page.locator('.body').dispatchEvent('drop', { dataTransfer: zipped });
  await answerReplace(page, 'Discard');
  await page.getByText('Opened “Safe Game”').waitFor();
  assert((await page.locator('input.title').inputValue()) === 'Safe Game', 'a game pack dropped on the editor as .zip opens, as Browse… takes it');
  // On a tile of the board (where a picture dropped goes on the clue), a game file opens too.
  const packCat = await page.locator('.cat textarea').first().inputValue();
  await page.locator('.cat textarea').first().fill('Changed');
  await page.locator('.cat textarea').nth(1).click();
  const onTile = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'Safe Game.brainrot', { type: 'application/octet-stream' }));
    return dt;
  }, readFileSync(packPath).toString('base64'));
  await page.locator('.tile').first().dispatchEvent('drop', { dataTransfer: onTile });
  await answerReplace(page, 'Discard');
  await page.waitForFunction((v) => document.querySelector('.cat textarea')?.value === v, packCat);
  assert((await page.getByRole('dialog', { name: /Where the dropped picture goes/ }).count()) === 0, 'a game file dropped on a board tile opens, and isn’t taken for a picture');

  // ---------- Hand-edited games ----------
  const game = JSON.parse(await (await import('jszip')).default.loadAsync(readFileSync(packPath)).then((z) => z.file('game.json').async('text')));
  delete game.rounds[0].values;
  delete game.rounds[0].categories[0].clues[0].answerSlide;
  game.rounds[0].categories[0].clues[1].questionSlide.elements[0].text = null;
  game.players = [{ name: 'No color' }];
  writeFileSync(resolve('test-results/datasafety-hand.json'), JSON.stringify(game));
  // (The game open was saved with Save first, as its history remembers: nothing to ask.)
  await openGameFile(page, resolve('test-results/datasafety-hand.json'));
  await page.getByText(/^Opened “/).waitFor();
  await page.locator('nav button.round-tab').first().click();
  assert((await page.locator('.tile').count()) === 30, 'a hand-edited game missing its row values, a slide and a color opens with them filled in');
  // A category short of clues (or with none) gets empty tiles: the board opens whole, no broken page.
  game.rounds[0].categories[0].clues = game.rounds[0].categories[0].clues.slice(0, 2);
  game.rounds[0].categories[1].clues = null;
  game.title = 'Short clues';
  writeFileSync(resolve('test-results/datasafety-short.json'), JSON.stringify(game));
  await openGameFile(page, resolve('test-results/datasafety-short.json'));
  await page.getByText('Opened “Short clues”').waitFor();
  await page.locator('nav button.round-tab').first().click();
  assert((await page.locator('.tile').count()) === 30 && !errors.length, 'a category short of clues opens with empty tiles in their place');
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
  const html = await exportHtml(page);
  const exported = resolve('test-results/datasafety-export.html');
  await html.saveAs(exported);
  const cardId = () => page.locator('.card [data-media-name]').getAttribute('data-media-name');
  const red = await cardId();
  const [replace] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.card').getByRole('button', { name: 'Replace…' }).click()]);
  await replace.setFiles([{ name: 'blue.png', mimeType: 'image/png', buffer: png(0, 0, 255, 80, 40) }]);
  // The games kept in Recent games have this file too (the same pack, opened again): they keep the old picture.
  await page.waitForFunction((id) => document.querySelector('.card [data-media-name]')?.getAttribute('data-media-name') !== id, red);
  assert((await storedWidth(red)) === 40 && (await storedWidth(await cardId())) === 80, 'Replace… on a file games in Recent games share gives this game the new one as a file of its own: theirs is unchanged');
  await page.waitForTimeout(800);
  const player = await context.newPage();
  player.on('pageerror', (e) => errors.push(`[player] ${e.message}`));
  await player.goto(pathToFileURL(exported).href);
  await player.getByRole('button', { name: '▶ Play' }).waitFor();
  const home = await player.locator('.home').innerText();
  assert(home.includes("host's copy") && home.includes('1 board · 22 clues') && !home.includes('editor'), 'the player file says it is the host’s copy, and counts its rounds (22 clues: the short categories’ empty tiles aren’t clues)');
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
  // A pack too big for the browser to read out of the page (it reads as empty): never the editor.
  writeFileSync(
    resolve('test-results/datasafety-toobig.html'),
    html1.slice(0, html1.indexOf('>', packAt) + 1).replace(/data-size="\d+"/, 'data-size="600000000"') + html1.slice(packEnd),
  );
  const big = await context.newPage();
  big.on('pageerror', (e) => errors.push(`[too big] ${e.message}`));
  await big.goto(pathToFileURL(resolve('test-results/datasafety-toobig.html')).href);
  await big.getByText('This game is too big for this browser to open').waitFor();
  assert((await big.getByRole('button', { name: 'Open…' }).count()) === 0, 'an exported file whose game is too big to read says so, instead of opening the editor');
  await big.close();

  // ---------- Storage full during a game: the game in progress isn't saved, so closing the tab asks first ----------
  // (The game itself saved to a file first, wanting no Daily Doubles, which Start would place in it: only the game in
  // progress is left to lose.)
  await page.locator('nav button.round-tab').first().click();
  await noDailyDoubles(page);
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().waitFor();
  await page.evaluate(() => (window.__full = true));
  await page.locator('.board .tile').first().click();
  await page.getByText("Storage is full, so autosave stopped: the game in progress isn't being saved").waitFor();
  assert((await page.locator('.panel .unsaved').innerText()) === '⚠ Not saving', 'storage full during a game: it says the game in progress isn’t being saved (not "use Save"), and the host panel keeps saying so');
  const leaveGame = new Promise((r) => (page.once('dialog', (d) => (r(d.type()), d.dismiss())), page.once('close', () => r('closed'))));
  await page.close({ runBeforeUnload: true });
  assert((await leaveGame) === 'beforeunload' && !page.isClosed(), 'closing the tab then asks first, though the game itself was saved');
  // Discarded while still full: nothing is left to lose (its failed write goes with it).
  await page.getByRole('button', { name: /Exit/ }).click();
  const discard = page.getByRole('button', { name: 'Discard & leave', exact: true });
  await discard.waitFor();
  // (The ask ignores clicks for 400 ms after it shows: the second half of a double-click on Exit.)
  await page.waitForTimeout(450);
  await discard.click();
  await page.locator('.toast', { hasText: 'Game discarded' }).waitFor();
  const leaveEditor = new Promise((r) => (page.once('dialog', (d) => (r(d.type()), d.dismiss())), page.once('close', () => r('closed'))));
  await page.close({ runBeforeUnload: true });
  assert((await leaveEditor) === 'closed', 'so closing the tab asks nothing once the game in progress is discarded');

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
