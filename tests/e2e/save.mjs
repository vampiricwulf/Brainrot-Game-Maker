// Saving: Save / Export HTML keep working and keep every file, and a second copy of the app (another
// tab or window, which shares the browser's storage) never overwrites this copy's game or deletes its media.
import { statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import {
  appFile,
  addClassicRounds,
  answerReplace,
  editorReady,
  exportHtml,
  openGameFile,
  playWithPlayers,
  png,
  failureShots,
  assert,
  sleep,
  launchChromium,
  boardIn,
  hostPanelIn,
  playerRowsIn,
  roundTabsIn,
  statusBarIn,
  toastsIn,
  until,
} from './helpers.mjs';

const file = appFile();
const url = pathToFileURL(file).href;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const errors = [];
const dialogs = [];
/** `editing`: true, the copy that edits; false, one paused; 'playing', one paused while the other plays a game. */
async function open(name, editing = true, ctx = context) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await page.goto(url);
  await page.getByRole('button', { name: editing === 'playing' ? 'Stop that game and edit here…' : editing ? 'Open…' : 'Edit here instead' }).waitFor();
  await page.waitForTimeout(800); // startup, including its storage cleanup
  return page;
}
// A 4×4 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8AARLgBAAC0BAP/HpJ+EwAAAABJRU5ErkJggg==', 'base64');

try {
  // Copy A: a game with a picture and a 3 MB sound.
  const a = await open('A');
  await a.getByRole('button', { name: /Media \(/ }).click();
  const [chooser] = await Promise.all([a.waitForEvent('filechooser'), a.getByRole('button', { name: '＋ Add files…' }).click()]);
  await chooser.setFiles([
    { name: 'pic.png', mimeType: 'image/png', buffer: PNG },
    { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(3 * 1024 * 1024, 1) },
  ]);
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  await a.waitForTimeout(800); // autosave

  // Copy B opens alongside: one tab edits at a time, so B waits, paused, until told to take over.
  const b = await open('B', false);
  assert(
    (await b.getByRole('heading', { name: 'This game is open in another tab' }).count()) === 1,
    'a second tab opens paused (it never overwrites the first one’s draft)',
  );
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
  await a
    .getByRole('dialog', { name: 'Open a game' })
    .getByRole('button', { name: /^Untitled Game/ })
    .click();
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  assert(true, 'Open… → Recent games reopens the game the other tab replaced');
  await editorReady(a);
  await a.locator('input.title').fill('Two tabs');
  await a.waitForTimeout(1000);
  await a.reload();
  await a.getByRole('button', { name: 'Media (2)' }).click();
  const loaded = await a
    .locator('.card img')
    .first()
    .evaluate((i) => new Promise((r) => (i.complete ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));
  assert(loaded === 4, "another tab's New doesn't delete this tab's stored media");

  // Save: every file goes in the pack, nothing reported missing, the pack opens.
  dialogs.length = 0;
  const [pack] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Save', exact: true }).click()]);
  const zip = await JSZip.loadAsync(readFileSync(await pack.path()), { checkCRC32: true });
  const names = Object.keys(zip.files);
  assert(
    names.includes('game.json') && names.filter((n) => n.startsWith('media/')).length === 2,
    `the pack has game.json and both files (${names.join(', ')})`,
  );
  assert(
    (await zip.file(names.find((n) => n.endsWith('.mp3'))).async('uint8array')).length === 3 * 1024 * 1024,
    'the sound is complete in the pack (checksums verified)',
  );
  assert(!dialogs.some((d) => /missing/i.test(d)), 'nothing reported missing');
  await a.getByRole('button', { name: 'Save', exact: true }).waitFor();
  assert(await a.getByRole('button', { name: 'Save', exact: true }).isEnabled(), 'the Save button is back when done');
  // Ctrl+S saves the game too (not the browser's "Save page as").
  const [again] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('Control+s')]);
  assert(again.suggestedFilename() === 'Two-tabs.brainrot', 'Ctrl+S saves the game pack');

  // Export HTML: a playable file that includes the pack (a game needs a round to be exported).
  await a.getByRole('button', { name: '＋ Add round' }).click();
  await a.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  // Ctrl+S in the clue editor saves too (it used to say to close it first), and the clue stays open.
  await a.locator('[data-tile="0,0"]').click();
  await a.keyboard.press('Enter');
  const clueBox = a.getByRole('dialog', { name: 'Edit clue' });
  await clueBox.waitFor();
  const [fromClue] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('Control+s')]);
  assert(
    fromClue.suggestedFilename() === 'Two-tabs.brainrot' && (await clueBox.isVisible()),
    'Ctrl+S in the clue editor saves the game, the clue editor stays open',
  );
  await a.keyboard.press('Escape');
  await clueBox.waitFor({ state: 'hidden' });
  // (Unsaved changes again, for Open… to ask about below.)
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
  // ⬇ Download as .brainrot: a second click while the pack is built starts no second download.
  let packs = 0;
  player.on('download', () => packs++);
  const firstPack = player.waitForEvent('download');
  await player.getByRole('button', { name: /Download as \.brainrot/ }).dblclick();
  await firstPack;
  await player.waitForTimeout(1000);
  assert(packs === 1, `a double click on ⬇ Download as .brainrot downloads the game pack once (${packs})`);
  await toastsIn(player, { hasText: '. To edit it, open it in Brainrot Games Maker.' }).waitFor();
  const getIt = await player.getByRole('link', { name: 'Get Brainrot Games Maker' }).getAttribute('href');
  assert(
    getIt.endsWith('/Brainrot-Game-Maker/releases/latest'),
    'it says to open the pack in Brainrot Games Maker, and the start screen links to where to get it',
  );
  // Ctrl+S out of habit: not the browser's own Save page (a copy of the app, not the game).
  await player.keyboard.press('Control+s');
  await toastsIn(player, { hasText: 'This game keeps its progress in this browser by itself' }).waitFor();
  assert(true, 'Ctrl+S on its start screen says the file keeps its progress by itself');
  // Ctrl+O there: never the browser's own Open (what's picked would take the tab).
  const ctrlO = async (p) => {
    await p.evaluate(() => {
      window.__ctrlO = undefined;
      window.addEventListener('keydown', (e) => e.key.toLowerCase() === 'o' && (window.__ctrlO = e.defaultPrevented));
    });
    await p.keyboard.press('Control+o');
    return p.evaluate(() => window.__ctrlO);
  };
  assert((await ctrlO(player)) === true, 'Ctrl+O in the player file is not the browser’s Open');
  await toastsIn(player, { hasText: 'This file plays its own game: open others in Brainrot Games Maker' }).waitFor();

  // The builder's audience window (OBS's capture) stays up while the player file, opened from disk beside it, resumes
  // its game in one window: that closes only the player file's own audience window.
  await a.getByRole('button', { name: '▶ Play' }).click();
  const [audA] = await Promise.all([a.waitForEvent('popup'), a.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  await a.keyboard.press('Control+s');
  await toastsIn(a, { hasText: 'The game saves itself as you play (💾 Save is in the editor)' }).waitFor();
  assert(true, 'Ctrl+S on the pre-game screen says the game saves itself (Save is in the editor)');
  assert((await ctrlO(a)) === true, 'Ctrl+O on the pre-game screen is not the browser’s Open');
  await toastsIn(a, { hasText: 'Open… is in the editor, not on the game screen' }).waitFor();
  await a.getByRole('button', { name: '◀ Back to editor' }).click();
  await audA.locator('.soon-text').waitFor();
  await playWithPlayers(player, 2);
  await player.locator('.mode', { hasText: 'Single window' }).click();
  await player.getByRole('button', { name: 'Start game ▶' }).click();
  await player.getByRole('button', { name: 'Skip intro' }).click();
  const keepAndLeave = async () => {
    await player.getByRole('button', { name: '🚪 Exit' }).click();
    await player.waitForTimeout(450); // (a click right away is ignored: a double-click guard)
    await player.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  };
  await keepAndLeave();
  const resumeFocused = await player
    .waitForFunction(() => document.activeElement?.textContent?.trim() === 'Resume game', null, { timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  assert(resumeFocused, 'Keep & leave in the player file: the keys go on from Resume game');
  await player.getByRole('button', { name: 'Resume game' }).click();
  await player.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await hostPanelIn(player).waitFor();
  await player.waitForTimeout(1000);
  assert(!audA.isClosed(), "resuming in one window in the player file leaves the builder's audience window up");
  await statusBarIn(a).locator('[data-audience-open]').getByRole('button', { name: 'Close the audience window' }).click();
  await a.getByRole('alertdialog').getByRole('button', { name: 'Close it' }).click();
  if (!audA.isClosed()) await audA.waitForEvent('close', { timeout: 3000 });
  // The player file's start screen between games: its audience window's line, as over the builder's editor.
  await player.bringToFront();
  const [audP] = await Promise.all([player.waitForEvent('popup'), player.keyboard.press('a')]);
  await boardIn(audP).waitFor();
  await keepAndLeave();
  await audP.locator('.soon-text').waitFor();
  await player.locator('.home').waitFor();
  await statusBarIn(player).locator('[data-audience-open]').waitFor();
  assert(true, 'the player file’s start screen says its audience window is up (on “Starting soon”), with its ✕');
  const page = await player.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
  assert(page[0] <= page[1], `and the line sits over the start screen without making the page scroll (${page.join(' / ')})`);
  await audP.close();
  await statusBarIn(player).locator('[data-audience-lost]').waitFor();
  assert(true, 'and warns when it is closed by accident (viewers see nothing), with Reopen');

  // The same file opened twice: one tab plays and saves its game at a time (they'd overwrite each other's), as in the
  // builder.
  const player2 = await context.newPage();
  player2.on('pageerror', (e) => errors.push(`[player 2] ${e.message}`));
  await player2.goto(pathToFileURL(saved).href);
  await player2.getByRole('heading', { name: 'This game is open in another tab' }).waitFor({ timeout: 20000 });
  assert((await player2.getByRole('button', { name: 'Resume game' }).count()) === 0, 'the same player file opened again waits, paused');
  await player2.getByRole('button', { name: 'Play here instead' }).click();
  await player2.getByRole('button', { name: 'Resume game' }).waitFor({ timeout: 20000 });
  await player.getByRole('button', { name: 'Play here instead' }).waitFor();
  assert(true, 'Play here instead: the first tab pauses, the second one has the game in progress');
  await player.close();
  await player2.close();

  // Where the browser refuses the page's Web Locks (it blocks site data, or, here, a sandboxed frame), it refuses its
  // storage too: the player file still plays, saying it can't keep progress, and the builder still edits, rather than
  // waiting on another tab that isn't there.
  const sandboxed = await context.newPage();
  sandboxed.on('pageerror', (e) => errors.push(`[sandboxed] ${e.message}`));
  const frameHost = resolve('test-results/save-sandboxed.html');
  const inFrame = async (src) => {
    writeFileSync(
      frameHost,
      `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" src="${src}" style="border:0;width:100vw;height:100vh"></iframe>`,
    );
    await sandboxed.goto(pathToFileURL(frameHost).href);
    return sandboxed.frameLocator('iframe');
  };
  const sp = await inFrame(pathToFileURL(saved).href);
  await sp.getByRole('button', { name: '▶ Play' }).waitFor({ timeout: 20000 });
  const refused = await sandboxed.frames()[1].evaluate(() =>
    navigator.locks
      .request('probe', () => {})
      .then(
        () => 'granted',
        (e) => e.name,
      ),
  );
  assert(
    refused === 'SecurityError' &&
      (await sp.getByText("This browser isn't saving progress here").count()) === 1 &&
      (await sp.getByRole('heading', { name: 'This game is open in another tab' }).count()) === 0,
    `with Web Locks refused (${refused}) the player file opens on ▶ Play, saying it isn’t saving progress (not “open in another tab”)`,
  );
  const sb = await inFrame(url);
  await sb.getByRole('button', { name: 'Open…' }).waitFor({ timeout: 20000 });
  assert(true, 'and the builder opens its editor');
  await sandboxed.close();

  // Reopening the saved pack restores the game and its files. The game being edited has a round now, so Open… asks first.
  dialogs.length = 0;
  await openGameFile(a, await pack.path());
  await answerReplace(a, 'Discard');
  // (Both round tabs go: .first() waits for that whatever the open's timing, where two still up failed the wait.)
  await roundTabsIn(a).first().waitFor({ state: 'detached' });
  assert(dialogs.length === 0, 'Open… asks before replacing a game with unsaved changes (in the page, not a browser dialog)');
  await a.getByRole('button', { name: 'Media (2)' }).waitFor();
  assert((await a.locator('input.title').inputValue()) === 'Two tabs', 'the saved pack opens again with its files');

  // ---------- Opening an older copy of the game never changes this one's files ----------
  // The picture is replaced by a bigger one after the save; then the saved (older) copy is opened.
  const picWidth = async (page = a) => {
    await page.getByRole('button', { name: /Media \(/ }).click();
    return page
      .locator('.card img')
      .first()
      .evaluate((i) => new Promise((r) => (i.complete && i.naturalWidth ? r(i.naturalWidth) : (i.onload = () => r(i.naturalWidth)))));
  };
  await a.getByRole('button', { name: /Media \(/ }).click();
  const [swap] = await Promise.all([
    a.waitForEvent('filechooser'),
    a
      .locator('.card', { has: a.locator('img') })
      .getByRole('button', { name: 'Replace everywhere…' })
      .click(),
  ]);
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
  await a
    .getByRole('dialog', { name: 'Open a game' })
    .getByRole('button', { name: /Two tabs/ })
    .first()
    .click();
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
  const versions = recentList.locator('button.pick', { hasText: 'Two tabs' });
  await versions.first().waitFor();
  const labels = await versions.allInnerTexts();
  assert(labels.length >= 2 && labels.slice(1).every((t) => t.includes('earlier version')), `both versions are kept, the older ones marked (${labels.length})`);
  // The second one is the newer version replaced by the saved copy: its picture is the replaced one.
  await versions.nth(1).click();
  await a.getByText('Reopened “Two tabs”').waitFor();
  assert((await picWidth()) === 8, 'the version with unsaved changes reopens with them');
  await roundTabsIn(a)
    .first()
    .waitFor({ state: 'detached' })
    .catch(() => {});

  // A .json export has no media: opened in another browser, the Media tab offers to put the files back.
  const [json] = await Promise.all([
    a.waitForEvent('download'),
    a
      .getByRole('button', { name: /^More:/ })
      .click()
      .then(() => a.getByRole('menuitem', { name: /Export JSON/ }).click()),
  ]);
  const jsonPath = resolve('test-results/save-export.json');
  await json.saveAs(jsonPath);
  const fresh = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const c = await fresh.newPage();
  c.on('pageerror', (e) => errors.push(`[fresh] ${e.message}`));
  c.on('dialog', (d) => d.accept());
  await c.goto(url);
  await openGameFile(c, jsonPath);
  await c.getByRole('button', { name: 'Media (2)' }).click();
  await c.getByText('2 files are missing from this browser').waitFor();
  assert((await c.getByRole('button', { name: '🔗 Replace file…' }).count()) === 2, 'each missing file offers 🔗 Replace file…');
  // Find missing files: matched by name (the sound only, for now).
  const [pickMany] = await Promise.all([c.waitForEvent('filechooser'), c.getByRole('button', { name: '🔗 Find missing files…' }).click()]);
  await pickMany.setFiles([
    { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(1000, 2) },
    { name: 'other.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(10, 3) },
  ]);
  await c.getByText(/Reconnected 1 file\. Still missing: pic\.png/).waitFor();
  assert(
    (await c.getByText('1 file is missing from this browser').count()) === 1,
    'Find missing files reconnects files by name and says what is still missing',
  );
  assert(
    (await c.getByText('Files stored with this game: 1 · 1000 B (1 more missing).').count()) === 1,
    'the stored-files count leaves out the missing one, and says it',
  );
  // One step, named for what it did: Undo takes the file out again, Redo puts it back.
  await c.waitForFunction(() =>
    document.querySelector('.editor > header button[title^="Undo:"]')?.getAttribute('title')?.startsWith('Undo: Reconnected 1 file '),
  );
  await c.evaluate(() => document.activeElement?.blur?.());
  await c.keyboard.press('Control+z');
  await c.getByText('2 files are missing from this browser').waitFor();
  await c.keyboard.press('Control+y');
  await c.getByText('1 file is missing from this browser').waitFor();
  assert(
    (await c.locator('.card', { hasText: 'song.mp3' }).count()) === 1,
    'reconnecting is one step "Reconnected 1 file" that Undo takes back (the file keeps its name)',
  );
  // 💾 Save from the keyboard with a file missing: the message about it takes the focus, and OK gives it back to Save.
  const missingSave = c.getByRole('button', { name: 'Save', exact: true });
  await missingSave.focus();
  await c.keyboard.press('Enter');
  const saveTold = c.getByRole('alertdialog');
  await saveTold.waitFor();
  assert(/missing and weren't included:\s*pic\.png/.test(await saveTold.innerText()), 'saved with a file missing, a message says which');
  await c.keyboard.press('Enter');
  await saveTold.waitFor({ state: 'detached' });
  assert(
    await until(() => missingSave.evaluate((b) => document.activeElement === b)),
    `and its OK gives the focus back to 💾 Save (${await c.evaluate(() => document.activeElement?.tagName + ' ' + document.activeElement?.textContent?.trim().slice(0, 20))})`,
  );
  // ⬇ Export as a web page with a file still missing: one message says where the file went and what it plays without
  // (a toast under the missing files' window was cut to one line).
  // (A file to play needs a round.)
  await c.getByRole('button', { name: '＋ Add round' }).click();
  await c.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  const missingHtml = await exportHtml(c);
  const exportTold = c.getByRole('alertdialog');
  await exportTold.waitFor();
  const exportSaid = await exportTold.innerText();
  assert(
    exportSaid.includes('Exported a play-only web page') &&
      /missing and weren't included, so the game plays without them:\s*pic\.png/.test(exportSaid) &&
      !(await toastsIn(c, { hasText: 'Exported a play-only' }).count()),
    `exported with a file missing: one message says where it went and which file it plays without (${exportSaid.replace(/\s+/g, ' ')})`,
  );
  await exportTold.getByRole('button', { name: 'OK' }).click();
  const missingCopy = resolve('test-results/save-missing.html');
  await missingHtml.saveAs(missingCopy);
  const short = await fresh.newPage();
  short.on('pageerror', (e) => errors.push(`[short copy] ${e.message}`));
  await short.goto(pathToFileURL(missingCopy).href);
  const shortPack = short.waitForEvent('download');
  await short.getByRole('button', { name: /Download as \.brainrot/ }).click({ timeout: 20000 });
  await shortPack;
  await toastsIn(short, { hasText: '(1 file wasn’t in this copy, so it isn’t in the pack)' }).waitFor();
  assert(true, 'its ⬇ Download as .brainrot says 1 file wasn’t in this copy');
  await short.close();
  await c.getByRole('button', { name: 'Media (2)' }).click();
  // Replace file… checks the kind, then fixes the picture everywhere it's used.
  const pic = c.locator('.card', { hasText: 'pic.png' });
  const [wrong] = await Promise.all([c.waitForEvent('filechooser'), pic.getByRole('button', { name: '🔗 Replace file…' }).click()]);
  await wrong.setFiles([{ name: 'oops.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(10, 1) }]);
  await c.getByText(/"oops\.mp3" is a sound, but "pic\.png" is a picture/).waitFor();
  assert(true, 'replacing a picture with a sound is refused with a clear message');
  const [right] = await Promise.all([c.waitForEvent('filechooser'), pic.getByRole('button', { name: '🔗 Replace file…' }).click()]);
  await right.setFiles([{ name: 'pic.png', mimeType: 'image/png', buffer: PNG }]);
  await c.locator('.missing-box').waitFor({ state: 'detached' });
  assert(
    (await c.locator('.card img').count()) === 1 && (await c.getByRole('button', { name: '🔗 Replace file…' }).count()) === 0,
    'after Replace file… nothing is missing and the picture shows',
  );
  await fresh.close();

  // 💾 Save from the keyboard keeps the focus on it (it's disabled while it writes, which used to drop the focus to the
  // page, so the next Tab started at the top), after naming the game first and on a later save.
  const keyed = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const k = await open('keyboard save', true, keyed);
  await editorReady(k);
  const saveBtn = k.getByRole('button', { name: 'Save', exact: true });
  const focusedIsSave = () => saveBtn.evaluate((b) => document.activeElement === b);
  const focusedName = () => k.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.trim().slice(0, 20)}`);
  await saveBtn.focus();
  const firstKeyed = k.waitForEvent('download');
  await k.keyboard.press('Enter');
  const keyedName = k.getByRole('dialog', { name: 'Name your game' });
  await keyedName.waitFor();
  await keyedName.getByRole('textbox').fill('Keyed');
  await k.keyboard.press('Enter');
  await firstKeyed;
  await until(() => saveBtn.isEnabled(), 'Save is back');
  await k.waitForTimeout(200);
  assert(await focusedIsSave(), `💾 Save's first save (Name your game, then Enter) gives the focus back to Save (${await focusedName()})`);
  const secondKeyed = k.waitForEvent('download');
  await k.keyboard.press('Enter');
  await secondKeyed;
  await until(() => saveBtn.isEnabled(), 'Save is back');
  await k.waitForTimeout(200);
  assert(await focusedIsSave(), `and a later save (no window) keeps it on Save too (${await focusedName()})`);
  await keyed.close();

  // A game being played in a tab that another tab takes over: it's saved and left there (only one tab plays and saves
  // it), and Resume in the other tab carries on from where it was.
  const played = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p1 = await open('playing', true, played);
  await addClassicRounds(p1);
  await playWithPlayers(p1, 2);
  await p1.getByRole('button', { name: 'Start game ▶' }).click();
  await p1.getByRole('button', { name: 'Skip intro' }).click();
  await playerRowsIn(p1).first().locator('.score').click();
  await hostPanelIn(p1).locator('.score-edit').fill('300');
  await p1.keyboard.press('Enter');
  // The tab opened alongside says a game is being played there, and taking over is asked first.
  const p2 = await open('taking over', 'playing', played);
  const takeOver = p2.getByRole('button', { name: 'Stop that game and edit here…' });
  assert(
    (await p2.getByRole('heading', { name: 'A game is being played in the other tab' }).count()) === 1 &&
      (await p2.getByText('Close this tab to leave that one as it is.').count()) === 1 &&
      (await p2.getByText('Editing here stops the game being played there (it’s kept: Resume game carries on here).').count()) === 1 &&
      !(await p2.getByRole('button', { name: 'Edit here instead' }).count()),
    'a tab opened while another plays a game says so, and what taking over does: close it to leave that one as it is',
  );
  const asked = p2.getByRole('alertdialog', { name: 'Stop the game in the other tab?' });
  await takeOver.click();
  await asked.getByRole('button', { name: 'Leave it as it is' }).click();
  await asked.waitFor({ state: 'detached' });
  await p2.waitForTimeout(500);
  assert(
    (await takeOver.count()) === 1 && (await hostPanelIn(p1).count()) > 0,
    'Stop that game and edit here asks first: Leave it as it is leaves the game playing',
  );
  await takeOver.click();
  await asked.getByRole('button', { name: 'Edit here', exact: true }).click();
  await p2.getByRole('button', { name: 'Open…' }).waitFor();
  await p1.getByRole('heading', { name: 'This game is open in another tab' }).waitFor();
  assert((await hostPanelIn(p1).count()) === 0, 'a tab playing the game pauses when another tab takes over (it stops playing it)');
  await p2.getByRole('button', { name: 'Resume game' }).click();
  await p2.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await playerRowsIn(p2).first().waitFor();
  const scores = await playerRowsIn(p2).locator('.score').allInnerTexts();
  assert(scores[0].includes('300'), `the other tab resumes it as it was left (${scores.join(', ')})`);
  await played.close();

  // A drawing not inserted yet (or image edits, a trim not applied) in a tab another one takes over: it's in no draft,
  // so the tab opened alongside says taking over throws it away, and asks first. Once it's put in, or cancelled, the
  // warning goes.
  const drawn = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const d1 = await open('drawing', true, drawn);
  await d1.getByRole('button', { name: '＋ Add round' }).click();
  await d1.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  await d1.locator('[data-tile="0,0"]').click();
  await d1.keyboard.press('Enter');
  await d1.getByRole('dialog', { name: 'Edit clue' }).waitFor();
  const draw = async () => {
    await d1.getByRole('button', { name: /◼ Shape/ }).click();
    await d1.getByRole('button', { name: '🖌 Drawpad…' }).click();
    const area = await d1.getByRole('dialog', { name: 'Drawpad' }).getByLabel('Drawing area').boundingBox();
    await d1.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.5);
    await d1.mouse.down();
    await d1.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.4, { steps: 6 });
    await d1.mouse.up();
  };
  await draw();
  const d2 = await drawn.newPage();
  d2.on('pageerror', (e) => errors.push(`[taking over a drawing] ${e.message}`));
  await d2.goto(url);
  const lose = d2.getByRole('button', { name: 'Throw it away and edit here…' });
  await lose.waitFor({ timeout: 8000 });
  if (process.env.SHOTS) await d2.screenshot({ path: `${process.env.SHOTS}/save-drawing-elsewhere.png` });
  assert(
    (await d2.getByRole('heading', { name: 'The other tab has a drawing or an edit not put in yet' }).count()) === 1 &&
      (await d2.getByText('Editing here throws away a drawing or an edit there that isn’t in the game yet.').count()) === 1 &&
      !(await d2.getByRole('button', { name: 'Edit here instead' }).count()),
    'a tab opened beside one with a drawing not inserted says taking over throws it away',
  );
  // Cancelled (Discard), the drawing is gone anyway: the tab offers Edit here instead again.
  const pad = d1.getByRole('dialog', { name: 'Drawpad' });
  await pad.getByRole('button', { name: 'Cancel' }).click();
  await pad.locator('[data-ask][data-ready]').waitFor();
  await pad.getByRole('button', { name: 'Discard', exact: true }).click();
  await pad.waitFor({ state: 'detached' });
  await d2.getByRole('button', { name: 'Edit here instead' }).waitFor({ timeout: 5000 });
  assert((await lose.count()) === 0, 'once it’s cancelled, the warning goes');
  // Drawn again, then taken over: asked first, and Edit here takes over.
  await draw();
  await lose.waitFor({ timeout: 5000 });
  await lose.click();
  const throwAsk = d2.getByRole('alertdialog', { name: 'Throw away the drawing or edit in the other tab?' });
  await throwAsk.getByRole('button', { name: 'Edit here', exact: true }).click();
  await d2.getByRole('button', { name: 'Open…' }).waitFor();
  await d1.getByRole('heading', { name: 'This game is open in another tab' }).waitFor();
  assert(true, 'taking over is asked first (“Throw away the drawing or edit in the other tab?”), and Edit here takes over');
  await drawn.close();

  // A reload a moment after a change: the autosave started as the page went away may not finish, so a copy written at
  // once comes back instead (it lost the change every time before), with its undo history.
  const quick = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const q = await open('quick reload', true, quick);
  const rounds = () => roundTabsIn(q).count();
  for (const mode of [/Jeopardy board/, /Final Jeopardy/]) {
    await q.getByRole('button', { name: '＋ Add round' }).click();
    await q.getByRole('menuitem', { name: mode }).click();
  }
  await q.waitForTimeout(1500);
  const cat = (i) => q.locator('.cat textarea').nth(i);
  await roundTabsIn(q).first().click();
  await cat(0).fill('Alpha');
  await cat(0).press('Tab');
  await q.waitForTimeout(1500);
  await cat(1).fill('Bravo');
  await cat(1).press('Tab');
  await q.waitForTimeout(50);
  await q.reload();
  await q.getByRole('button', { name: 'Open…' }).waitFor();
  await roundTabsIn(q).first().click();
  await cat(1).waitFor();
  assert((await cat(1).inputValue()) === 'Bravo' && (await rounds()) === 2, 'a reload right after a change keeps it');
  await q.locator('body').click({ position: { x: 5, y: 5 } });
  await q.keyboard.press('Control+z');
  await q.waitForTimeout(300);
  const undone = [await cat(0).inputValue(), await cat(1).inputValue()].join();
  await q.keyboard.press('Control+y');
  await q.waitForTimeout(300);
  const redone = await cat(1).inputValue();
  assert(
    undone === 'Alpha,Category 2' && redone === 'Bravo',
    `and its undo history: Ctrl+Z takes back just the last change (${undone}), Ctrl+Y redoes it (${redone})`,
  );
  await q.waitForTimeout(1500); // the autosave catches up
  await q.reload();
  await q.getByRole('button', { name: 'Open…' }).waitFor();
  await q.waitForTimeout(800);
  await q.keyboard.press('Control+z');
  await q.waitForTimeout(300);
  await roundTabsIn(q).first().click();
  assert(
    (await cat(1).inputValue()) === 'Category 2' && (await cat(0).inputValue()) === 'Alpha',
    'and after the next ordinary reload the history is still whole',
  );
  await quick.close();

  // openGameFile() where Open… can't be clicked fails on that click, saying so, well before the file chooser's own wait
  // runs out, and leaves no unhandled rejection behind (that would end the run before its catch and failure screenshots).
  const bare = await context.newPage();
  await bare.setContent('<p>No Open… button here</p>');
  const t0 = Date.now();
  const failed = await openGameFile(bare, []).then(
    () => null,
    (e) => /** @type {Error} */ (e),
  );
  const took = Date.now() - t0;
  assert(failed && /Open…/.test(failed.message) && !/filechooser/.test(failed.message), `openGameFile names the button it couldn't click: ${failed?.message}`);
  assert(took < 20000, `and says so within 20 s (${took} ms)`);
  await bare.close(); // (its chooser wait ends now too, handled)
  await sleep(200);

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nSave E2E passed.');
} catch (e) {
  await failureShots('save', browser);
  throw e;
} finally {
  await browser.close();
}
