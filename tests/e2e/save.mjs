// Saving: Save / Export HTML keep working and keep every file, and a second copy of the app (another
// tab or window, which shares the browser's storage) never overwrites this copy's game or deletes its media.
import { chromium } from 'playwright-core';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { addClassicRounds, answerReplace, exportHtml, openGameFile, playWithPlayers, png } from './helpers.mjs';

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
async function open(name, editing = true, ctx = context) {
  const page = await ctx.newPage();
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
  // A sees by itself that the other tab closed, takes over again and reopens its game from Open… → Recent games: its
  // files must still be there.
  await a.getByRole('heading', { name: 'The other tab was closed' }).waitFor({ timeout: 5000 });
  assert(true, 'a paused tab says when the other tab has closed');
  await a.getByRole('button', { name: 'Edit here', exact: true }).click();
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

  // Export HTML: a playable file that includes the pack (a game needs a round to be exported).
  await a.getByRole('button', { name: '＋ Add round' }).click();
  await a.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  const html = await exportHtml(a);
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
  dialogs.length = 0;
  await openGameFile(a, await pack.path());
  await answerReplace(a, 'Discard');
  await a.locator('nav > button.round-tab').waitFor({ state: 'detached' });
  assert(dialogs.length === 0, 'Open… asks before replacing a game with unsaved changes (in the page, not a browser dialog)');
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  assert((await a.locator('input.title').inputValue()) === 'Two tabs', 'the saved pack opens again with its files');

  // ---------- Opening an older copy of the game never changes this one's files ----------
  // The picture is replaced by a bigger one after the save; then the saved (older) copy is opened.
  const picWidth = async (page = a) => {
    await page.getByRole('button', { name: /Media \(/ }).click();
    return page.locator('.card img').first().evaluate((i) => new Promise((r) => (i.complete && i.naturalWidth ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));
  };
  await a.getByRole('button', { name: /Media \(/ }).click();
  const [swap] = await Promise.all([a.waitForEvent('filechooser'), a.locator('.card', { has: a.locator('img') }).getByRole('button', { name: 'Replace…' }).click()]);
  await swap.setFiles([{ name: 'pic.png', mimeType: 'image/png', buffer: png(0, 0, 255, 8, 8) }]);
  await a.waitForTimeout(800);
  assert((await picWidth()) === 8, 'the picture is replaced after the save');
  // Cancel at the question: nothing changes, then or after a reload.
  await openGameFile(a, await pack.path());
  await answerReplace(a, 'Cancel');
  await a.waitForTimeout(500);
  await a.reload();
  assert((await picWidth()) === 8, 'opening an older copy and cancelling leaves the picture alone (after a reload too)');
  // Discard: the older copy shows its own picture…
  await openGameFile(a, await pack.path());
  await answerReplace(a, 'Discard');
  await a.getByText('Opened “Two tabs”').waitFor();
  assert((await picWidth()) === 4, 'the older copy opens with its own picture');
  // …and the newer game, reopened from Recent games, still has its own.
  await a.getByRole('button', { name: 'Open…' }).click();
  await a.getByRole('dialog', { name: 'Open a game' }).getByRole('button', { name: /Two tabs/ }).first().click();
  await a.getByText('Reopened “Two tabs”').waitFor();
  assert((await picWidth()) === 8, 'the newer game reopened from Recent games keeps its replaced picture');
  await a.waitForTimeout(800);
  await a.reload();
  assert((await picWidth()) === 8, 'and after a reload');

  // ---------- Recent games keeps both versions of a game ----------
  // The newer version (unsaved: its picture changed after the save) is replaced by the saved copy, which New replaces in
  // turn without asking (it's saved): both are kept.
  await openGameFile(a, await pack.path());
  await answerReplace(a, 'Discard');
  await a.getByText('Opened “Two tabs”').waitFor();
  await a.getByRole('button', { name: 'New', exact: true }).click();
  await a.getByRole('button', { name: 'Media (0)' }).waitFor();
  await a.getByRole('button', { name: 'Open…' }).click();
  const recentList = a.getByRole('dialog', { name: 'Open a game' });
  const versions = recentList.getByRole('button', { name: /Two tabs/ });
  await versions.first().waitFor();
  const labels = await versions.allInnerTexts();
  assert(labels.length >= 2 && labels.slice(1).every((t) => t.includes('earlier version')), `both versions are kept, the older ones marked (${labels.length})`);
  // The second one is the newer version replaced by the saved copy: its picture is the replaced one.
  await versions.nth(1).click();
  await a.getByText('Reopened “Two tabs”').waitFor();
  assert((await picWidth()) === 8, 'the version with unsaved changes reopens with them');
  await a.locator('nav > button.round-tab').first().waitFor({ state: 'detached' }).catch(() => {});

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

  // A game being played in a tab that another tab takes over: it's saved and left there (only one tab plays and saves
  // it), and Resume in the other tab carries on from where it was.
  const played = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p1 = await open('playing', true, played);
  await addClassicRounds(p1);
  await playWithPlayers(p1, 2);
  await p1.getByRole('button', { name: 'Start game ▶' }).click();
  await p1.getByRole('button', { name: 'Skip intro' }).click();
  await p1.locator('.panel .p').first().locator('.score').click();
  await p1.locator('.panel .score-edit').fill('300');
  await p1.keyboard.press('Enter');
  const p2 = await open('taking over', false, played);
  await p2.getByRole('button', { name: 'Edit here instead' }).click();
  await p2.getByRole('button', { name: 'Open…' }).waitFor();
  await p1.getByRole('heading', { name: 'This game is open in another tab' }).waitFor();
  assert((await p1.locator('.panel').count()) === 0, 'a tab playing the game pauses when another tab takes over (it stops playing it)');
  await p2.getByRole('button', { name: 'Resume game' }).click();
  await p2.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await p2.locator('.panel .p').first().waitFor();
  const scores = await p2.locator('.panel .p .score').allInnerTexts();
  assert(scores[0].includes('300'), `the other tab resumes it as it was left (${scores.join(', ')})`);
  await played.close();

  // A reload a moment after a change: the autosave started as the page went away may not finish, so a copy written at
  // once comes back instead (it lost the change every time before).
  const quick = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const q = await open('quick reload', true, quick);
  await q.getByRole('button', { name: '＋ Add round' }).click();
  await q.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  await q.locator('nav > button.round-tab').first().waitFor();
  await q.reload();
  await q.getByRole('button', { name: 'Open…' }).waitFor();
  await q.locator('nav > button.round-tab').first().waitFor({ timeout: 5000 });
  assert(await q.getByText('Your last changes before the page closed are back').isVisible(), 'a reload right after adding a round keeps it, and says so');
  await q.waitForTimeout(1500); // the autosave catches up
  await q.reload();
  await q.getByRole('button', { name: 'Open…' }).waitFor();
  await q.waitForTimeout(800);
  assert((await q.locator('nav > button.round-tab').count()) === 1 && !(await q.getByText('Your last changes before').count()), 'and once saved normally, the next reload is an ordinary one');
  await quick.close();

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nSave E2E passed.');
} finally {
  await browser.close();
}
