// Saving: Save / Export HTML keep working and keep every file, and a second copy of the app (another
// tab or window, which shares the browser's storage) never overwrites this copy's game or deletes its media.
import { chromium } from 'playwright-core';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { answerReplace, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const errors = [];
const dialogs = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
async function open(name, editing = true) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await page.goto(url);
  await page.getByRole('button', { name: editing ? 'Open…' : 'Edit here instead' }).waitFor();
  await page.waitForTimeout(800); // startup, including its storage cleanup
  return page;
}
// A 4×4 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8AARLgBAAC0BAP/HpJ+EwAAAABJRU5ErkJggg==', 'base64');

try {
  // Copy A: a game with a picture and a 3 MB sound.
  const a = await open('A');
  await a.getByRole('button', { name: /Media \(/ }).click();
  const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.getByRole('button', { name: '⬆ Add files…' }).click()]);
  await chooser.setFiles([
    { name: 'pic.png', mimeType: 'image/png', buffer: PNG },
    { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(3 * 1024 * 1024, 1) },
  ]);
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  await a.waitForTimeout(800); // autosave

  // Copy B opens alongside: one tab edits at a time, so B waits, paused, until told to take over.
  const b = await open('B', false);
  assert((await b.getByRole('heading', { name: 'This game is open in another tab' }).count()) === 1, 'a second tab opens paused (it never overwrites the first one’s draft)');
  await b.getByRole('button', { name: 'Edit here instead' }).click();
  await b.getByRole('button', { name: 'Media (2)' }).waitFor();
  await a.getByRole('button', { name: 'Edit here instead' }).waitFor();
  assert(true, 'Edit here instead: the first tab saves and pauses, the second one opens the game with its files');
  // B starts a new game: A's game is kept in Recent games, and its media stays in the shared storage.
  await b.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(b, 'Discard');
  await b.getByRole('button', { name: 'Media (0)' }).waitFor();
  await b.waitForTimeout(800);
  await b.close();
  // A takes over again and reopens its game from Open… → Recent games: its files must still be there.
  await a.getByRole('button', { name: 'Edit here instead' }).click();
  await a.getByRole('button', { name: 'Open…' }).click();
  await a.getByRole('dialog', { name: 'Open a game' }).getByRole('button', { name: /Untitled Game/ }).click();
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  assert(true, 'Open… → Recent games reopens the game the other tab replaced');
  await a.locator('input.title').fill('Two tabs');
  await a.waitForTimeout(1000);
  await a.reload();
  await a.getByRole('button', { name: 'Media (2)' }).click();
  const loaded = await a.locator('.card img').first().evaluate((i) => new Promise((r) => (i.complete ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));
  assert(loaded === 4, "another tab's New doesn't delete this tab's stored media");

  // Save: every file goes in the pack, nothing reported missing, the pack opens.
  dialogs.length = 0;
  const [pack] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Save', exact: true }).click()]);
  const zip = await JSZip.loadAsync(readFileSync(await pack.path()), { checkCRC32: true });
  const names = Object.keys(zip.files);
  assert(names.includes('game.json') && names.filter((n) => n.startsWith('media/')).length === 2, `the pack has game.json and both files (${names.join(', ')})`);
  assert((await zip.file(names.find((n) => n.endsWith('.mp3'))).async('uint8array')).length === 3 * 1024 * 1024, 'the sound is complete in the pack (checksums verified)');
  assert(!dialogs.some((d) => /missing/i.test(d)), 'nothing reported missing');
  await a.getByRole('button', { name: 'Save', exact: true }).waitFor();
  assert(await a.getByRole('button', { name: 'Save', exact: true }).isEnabled(), 'the Save button is back when done');
  // Ctrl+S saves the game too (not the browser's "Save page as").
  const [again] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('Control+s')]);
  assert(again.suggestedFilename() === 'Two-tabs.brainrot', 'Ctrl+S saves the game pack');

  // Export HTML: a playable file that includes the pack.
  const [html] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Export HTML' }).click()]);
  assert(statSync(await html.path()).size > 3 * 1024 * 1024, 'the exported HTML includes the media');
  const player = await context.newPage();
  player.on('pageerror', (e) => errors.push(`[player] ${e.message}`));
  // Downloads are stored without an extension; the browser needs .html to open it as a page.
  const saved = resolve('test-results/save-export.html');
  await html.saveAs(saved);
  await player.goto(pathToFileURL(saved).href);
  await player.getByRole('button', { name: '▶ Play' }).waitFor({ timeout: 20000 });
  assert(true, 'the exported HTML opens as a player');

  // Reopening the saved pack restores the game and its files. The game being edited has a round now, so Open… asks first.
  await a.getByRole('button', { name: '＋ Add round' }).click();
  await a.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  dialogs.length = 0;
  await openGameFile(a, await pack.path());
  await answerReplace(a, 'Discard');
  await a.locator('nav > button.round-tab').waitFor({ state: 'detached' });
  assert(dialogs.length === 0, 'Open… asks before replacing a game with unsaved changes (in the page, not a browser dialog)');
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  assert((await a.locator('input.title').inputValue()) === 'Two tabs', 'the saved pack opens again with its files');

  // A .json export has no media: opened in another browser, the Media tab offers to put the files back.
  const [json] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: /^More:/ }).click().then(() => a.getByRole('menuitem', { name: /Export JSON/ }).click())]);
  const jsonPath = resolve('test-results/save-export.json');
  await json.saveAs(jsonPath);
  const fresh = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const c = await fresh.newPage();
  c.on('pageerror', (e) => errors.push(`[fresh] ${e.message}`));
  c.on('dialog', (d) => d.accept());
  await c.goto(url);
  const [pickJson] = await Promise.all([c.waitForEvent('filechooser'), c.getByRole('button', { name: 'Open…' }).click()]);
  await pickJson.setFiles(jsonPath);
  await c.getByRole('button', { name: 'Media (2)' }).click();
  await c.getByText('2 files are missing from this browser').waitFor();
  assert((await c.getByRole('button', { name: '🔗 Replace file…' }).count()) === 2, 'each missing file offers 🔗 Replace file…');
  // Find missing files: matched by name (the sound only, for now).
  const [pickMany] = await Promise.all([c.waitForEvent('filechooser'), c.getByRole('button', { name: '🔗 Find missing files…' }).click()]);
  await pickMany.setFiles([{ name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1000, 2) }, { name: 'other.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(10, 3) }]);
  await c.getByText(/Reconnected 1 file\. Still missing: pic\.png/).waitFor();
  assert((await c.getByText('1 file is missing from this browser').count()) === 1, 'Find missing files reconnects files by name and says what is still missing');
  // Replace file… checks the kind, then fixes the picture everywhere it's used.
  const pic = c.locator('.card', { hasText: 'pic.png' });
  const [wrong] = await Promise.all([c.waitForEvent('filechooser'), pic.getByRole('button', { name: '🔗 Replace file…' }).click()]);
  await wrong.setFiles([{ name: 'oops.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(10, 1) }]);
  await c.getByText(/"oops\.mp3" is a sound, but "pic\.png" is a picture/).waitFor();
  assert(true, 'replacing a picture with a sound is refused with a clear message');
  const [right] = await Promise.all([c.waitForEvent('filechooser'), pic.getByRole('button', { name: '🔗 Replace file…' }).click()]);
  await right.setFiles([{ name: 'pic.png', mimeType: 'image/png', buffer: PNG }]);
  await c.locator('.missing-box').waitFor({ state: 'detached' });
  assert((await c.locator('.card img').count()) === 1 && (await c.getByRole('button', { name: '🔗 Replace file…' }).count()) === 0, 'after Replace file… nothing is missing and the picture shows');
  await fresh.close();

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nSave E2E passed.');
} finally {
  await browser.close();
}
