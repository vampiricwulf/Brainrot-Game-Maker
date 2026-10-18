// Desktop app, with the native side stood in for (window.__TAURI_INTERNALS__): Save replaces the game's own last save
// (keeping a backup) but never another game's of the same name, Open… lists and opens an exported .html, a game file
// the app is opened with (at start or by a second launch) opens, and closing the window writes the last edits first;
// closing while a 🗜 copy for phones is made, Wait closes once it's done, with the copy written. Also in a browser:
// Open… takes an exported .html.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, clickExportHtml, editorReady, packGame } from './helpers.mjs';
import { gif, noise } from './mediafixtures.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/** The native side: BrainrotSaves in memory, the commands the page uses, and events (window.__emit). */
function fakeDesktop() {
  window.__JB_AUDIO_FIX = true;
  const saves = (window.__saves = new Map());
  window.__calls = [];
  window.__opened = null;
  const callbacks = new Map();
  const listeners = {};
  let next = 1;
  const entry = (name) => ({ name, size: saves.get(name).bytes.length, modified: saves.get(name).modified, place: 'app' });
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    transformCallback(cb) {
      callbacks.set(next, cb);
      return next++;
    },
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (p) => p,
    async invoke(cmd, args, options) {
      window.__calls.push(cmd === 'save_file' ? `${cmd} ${decodeURIComponent(options.headers['x-name'])} ${options.headers['x-mode']}` : cmd);
      switch (cmd) {
        case 'plugin:event|listen':
          (listeners[args.event] ??= []).push(args.handler);
          return args.handler;
        case 'save_file': {
          // A big save takes a while (window.__saveDelay ms).
          if (window.__saveDelay) await new Promise((r) => setTimeout(r, window.__saveDelay));
          let name = decodeURIComponent(options.headers['x-name']);
          const mode = options.headers['x-mode'];
          if (mode === 'new' && saves.has(name)) {
            const [, base, ext] = name.match(/^(.*?)(?: \(\d+\))?(\.[^.]+)$/);
            for (let n = 2; saves.has(name); n++) name = `${base} (${n})${ext}`;
          }
          if (mode === 'backup' && saves.has(name)) saves.set(`${name}.bak`, saves.get(name));
          saves.set(name, { bytes: new Uint8Array(args), modified: Date.now() });
          return { path: `C:\\Games\\BrainrotSaves\\${name}`, fallback: false };
        }
        case 'list_saves':
          return [...saves.keys()].filter((n) => /\.(brainrot|jbr|json|html)$/i.test(n)).map(entry).sort((a, b) => b.modified - a.modified);
        case 'read_save':
          return saves.get(args.name).bytes.buffer;
        case 'opened_file':
          return window.__opened?.name ?? null;
        case 'take_opened_file': {
          const f = window.__opened;
          window.__opened = null;
          return f.bytes.buffer;
        }
        case 'close_app':
          window.__closed = true;
          // The files in the draft stored as the app closes (a read started now sees every write started before it).
          window.__draftAtClose = new Promise((ok) => {
            const req = indexedDB.open('keyval-store');
            req.onsuccess = () => {
              const get = req.result.transaction('keyval').objectStore('keyval').get('editorDraft');
              get.onsuccess = () => ok(get.result?.media?.map((m) => m.name) ?? null);
              get.onerror = () => ok(null);
            };
            req.onerror = () => ok(null);
          });
          return null;
        default:
          return null;
      }
    },
  };
  window.__emit = (event, payload) => (listeners[event] ?? []).forEach((id) => callbacks.get(id)?.({ event, id, payload }));
}

/** A game with two GIFs over 2 MB: a short one, whose copy is quick, and a long one (noise, made here). */
async function copiesGame() {
  const dance = gif(320, 240, Array.from({ length: 24 }, () => ({ px: noise(320 * 240), delay: 10 })));
  const long = gif(1024, 720, [
    ...Array.from({ length: 2 }, () => ({ px: noise(1024 * 720), delay: 2 })),
    ...Array.from({ length: 1998 }, (_, i) => ({ x: (i * 16) % 1008, y: (Math.floor(i / 63) * 16) % 704, w: 16, h: 16, px: noise(256), delay: 2 })),
  ]);
  const box = (id, y) => ({ id, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
  const text = { ...box('e0', 40), kind: 'text', text: 'Q', font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true };
  const game = {
    id: 'g_copies',
    version: 2,
    title: 'Copies',
    settings: { allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true } },
    players: [],
    rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values: [200], dailyDoubleCount: 0, categories: [{ id: 'c0', title: 'Memes', clues: [{ id: 'q1', value: null, type: 'standard', questionSlide: { background: {}, elements: [text] }, answerSlide: { background: {}, elements: [] } }] }] }],
    media: [
      { id: 'dance', name: 'dance.gif', mime: 'image/gif', size: dance.length, kind: 'image' },
      { id: 'long', name: 'long.gif', mime: 'image/gif', size: long.length, kind: 'image' },
    ],
    audio: {}, wheels: [], dice: [], theme: {},
    cards: [{ id: 'sc_tip', name: 'Tip', background: {}, elements: [{ ...box('e1', 300), kind: 'image', media: 'dance', fit: 'contain' }] }],
  };
  return packGame(game, { dance, long });
}

async function newPage(context, name) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(600);
  return page;
}

const calls = (page) => page.evaluate(() => window.__calls.splice(0));
const saveNames = (page) => page.evaluate(() => [...window.__saves.keys()].sort());

try {
  // ---------- In a browser: Open… takes an exported .html ----------
  const web = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const w = await newPage(web, 'browser');
  await addClassicRounds(w);
  await w.locator('input.title').fill('Exported Quiz');
  const [download] = await Promise.all([w.waitForEvent('download'), clickExportHtml(w)]);
  const htmlPath = resolve('test-results/desktop-export.html');
  await download.saveAs(htmlPath);
  // (An export isn't a Save: New asks first.)
  await w.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(w, 'Discard');
  await w.locator('nav > button.round-tab').first().waitFor({ state: 'detached' });
  await w.locator('input.title').fill('Something else');
  // Open… lists Recent games first (New kept the exported game there); Browse… picks a file.
  const chooser = w.waitForEvent('filechooser');
  await w.getByRole('button', { name: 'Open…' }).click();
  await w.getByRole('dialog', { name: 'Open a game' }).getByRole('button', { name: 'Browse…' }).click();
  assert((await (await chooser).element().getAttribute('accept')).includes('.html'), 'Open… offers .html files');
  await (await chooser).setFiles(htmlPath);
  // (A game with a title of its own counts as work: Open… asks before replacing it.)
  await answerReplace(w, 'Discard');
  await w.locator('nav > button.round-tab').first().waitFor();
  assert((await w.locator('input.title').inputValue()) === 'Exported Quiz', 'an exported .html opens in the editor');
  await web.close();

  // ---------- Desktop app ----------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await desk.addInitScript(fakeDesktop);
  // Started by "Open with" on a game file: it opens.
  await desk.addInitScript(
    ([name, text]) => {
      if (!sessionStorage.getItem('opened-once')) {
        sessionStorage.setItem('opened-once', '1');
        window.__opened = { name, bytes: new TextEncoder().encode(text) };
      }
    },
    ['Started.html', readFileSync(htmlPath, 'utf8')],
  );
  const d = await newPage(desk, 'desktop');
  await d.locator('nav > button.round-tab').first().waitFor();
  assert((await d.locator('input.title').inputValue()) === 'Exported Quiz', 'the game file the app was started with opens');

  // Save twice: the same file, the older copy kept as .bak.
  await d.locator('input.title').fill('Quiz');
  await d.waitForTimeout(300);
  await calls(d);
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.waitForFunction(() => window.__saves.has('Quiz.brainrot'));
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.waitForFunction(() => window.__saves.has('Quiz.brainrot.bak'));
  assert((await calls(d)).filter((c) => c.startsWith('save_file')).every((c) => c === 'save_file Quiz.brainrot backup'), 'Save replaces the game’s own save, keeping a backup');

  // Another game with the same title gets its own file.
  await d.getByRole('button', { name: 'New', exact: true }).click();
  // New replaces the game once the old one is kept in Recent games: wait for it to go, or the title typed next lands in it.
  await d.locator('nav > button.round-tab').first().waitFor({ state: 'detached' });
  await addClassicRounds(d);
  await d.locator('input.title').fill('Quiz');
  await d.waitForTimeout(300);
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.waitForFunction(() => window.__saves.has('Quiz (2).brainrot'));
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.waitForFunction(() => window.__saves.has('Quiz (2).brainrot.bak'));
  await d.locator('nav').getByRole('button', { name: /🕘 History/ }).click();
  assert((await d.locator('.mark', { hasText: 'Saved “Quiz (2).brainrot”' }).count()) > 0, 'the history says the file the save was written as');
  assert(
    JSON.stringify(await saveNames(d)) === JSON.stringify(['Quiz (2).brainrot', 'Quiz (2).brainrot.bak', 'Quiz.brainrot', 'Quiz.brainrot.bak']),
    'another game with the same title never replaces it: it saves as "Quiz (2)" and keeps saving there',
  );

  // Open… lists the saves and the exported game, but not the backups.
  await d.evaluate((text) => window.__saves.set('Exported Quiz.html', { bytes: new TextEncoder().encode(text), modified: 1 }), readFileSync(htmlPath, 'utf8'));
  // Open… shows Recent games first (New kept the first Quiz there): BrainrotSaves… lists the saves.
  await d.getByRole('button', { name: 'Open…' }).click();
  const list = d.getByRole('dialog', { name: 'Open a game' });
  await list.getByRole('button', { name: 'BrainrotSaves…' }).click();
  await list.locator('button.save').first().waitFor();
  const listed = await list.locator('button.save b').allInnerTexts();
  assert(listed.includes('Exported Quiz.html') && !listed.some((n) => n.endsWith('.bak')), `Open… lists the exported game, not the backups (${listed.join(', ')})`);
  await d.screenshot({ path: 'test-results/desktop-open.png' });
  await list.getByRole('button', { name: /Exported Quiz\.html/ }).click();
  await d.waitForFunction(() => document.querySelector('input.title')?.value === 'Exported Quiz');
  assert(true, 'an exported game in the list opens');

  // A second launch given a game file: the running app opens it.
  // (Opening finishes a moment after the title shows: a title typed sooner can end up beside the opened one.)
  await d.waitForTimeout(500);
  await d.locator('input.title').fill('From a second launch');
  await d.waitForFunction(() => document.querySelector('input.title')?.value === 'From a second launch');
  // (The game just opened: let the title settle before exporting under it.)
  await d.waitForTimeout(300);
  await d.getByRole('button', { name: /^More:/ }).click();
  await d.getByRole('menuitem', { name: /Export JSON/ }).click();
  await d.waitForFunction(() => window.__saves.has('From-a-second-launch.json'), null, { polling: 100 }).catch(async (e) => {
    throw new Error(`Export JSON wrote no From-a-second-launch.json (saved: ${await d.evaluate(() => [...window.__saves.keys()].join(', '))}; title: ${await d.locator('input.title').inputValue()})\n${e.message}`);
  });
  await d.locator('input.title').fill('Before');
  await d.evaluate(() => {
    window.__opened = { name: 'From-a-second-launch.json', bytes: window.__saves.get('From-a-second-launch.json').bytes };
    window.__emit('open-file');
  });
  // "Before" isn't saved: it asks first, and Save first saves it, then opens the file.
  await answerReplace(d, 'Save first');
  await d.waitForFunction(() => document.querySelector('input.title')?.value === 'From a second launch');
  assert(await d.evaluate(() => window.__saves.has('Before.brainrot')), 'a file given to the app asks first about unsaved changes (Save first saves them)');
  assert(await d.evaluate(() => window.__opened === null), 'a game file given to a second launch opens in the running app');

  // A change made while Save is still writing the file isn't in it: it counts as unsaved.
  await d.evaluate(() => (window.__saveDelay = 1500));
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.getByRole('button', { name: /Saving…/ }).waitFor();
  await d.locator('input.title').fill('Typed while saving');
  await d.getByRole('button', { name: 'Save', exact: true }).waitFor();
  await d.waitForTimeout(800);
  await d.getByRole('button', { name: 'New', exact: true }).click();
  const unsavedAsk = d.getByRole('dialog', { name: 'Start a new game?' });
  await unsavedAsk.waitFor();
  assert(true, 'a change typed while Save was writing the file is unsaved: New asks about it');
  await unsavedAsk.getByRole('button', { name: 'Cancel' }).click();
  await d.locator('nav').getByRole('button', { name: /🕘 History/ }).click();
  await d.locator('.list > .mark').first().waitFor();
  // (Newest first.)
  const rows = await d.locator('.list > .mark, .list > .hr').allInnerTexts();
  const savedAt = rows.findIndex((t) => t.includes('Saved “From-a-second-launch.brainrot”'));
  const typedAt = rows.findIndex((t) => t.includes('Typed while saving'));
  assert(typedAt >= 0 && savedAt === typedAt + 1, 'the history shows the save where the game was when it started, with the change typed meanwhile after it');
  await d.locator('nav > button.round-tab').first().click();

  // Closing the window while a save is being written asks first: Wait closes once it's done.
  await d.evaluate(() => (window.__saveDelay = 2500));
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.getByRole('button', { name: /Saving…/ }).waitFor();
  await calls(d);
  await d.evaluate(() => window.__emit('close-requested'));
  const closeAsk = d.getByRole('alertdialog').filter({ hasText: 'A save is in progress' });
  await closeAsk.waitFor();
  assert((await calls(d)).includes('hold_close'), 'closing while a save is being written keeps the window open and asks: Wait / Close anyway');
  // ✕ again while it asks: the window is still held open.
  await d.evaluate(() => window.__emit('close-requested'));
  assert(!(await d.evaluate(() => window.__closed)), 'it doesn’t close while the save is written');
  await closeAsk.getByRole('button', { name: 'Wait' }).click();
  await d.waitForFunction(() => window.__closed === true, null, { timeout: 8000 });
  assert(await d.evaluate(() => window.__saves.has('Typed-while-saving.brainrot')), 'Wait: the app closes by itself once the save is written');
  await d.evaluate(() => {
    window.__closed = false;
    window.__saveDelay = 0;
  });

  // Closing the window: the last edits are written before it closes.
  await d.locator('input.title').fill('Typed just before closing');
  await d.evaluate(() => window.__emit('close-requested'));
  await d.waitForFunction(() => window.__closed === true);
  const flushed = await d.evaluate(
    () =>
      new Promise((ok) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const get = req.result.transaction('keyval').objectStore('keyval').get('editorDraft');
          get.onsuccess = () => ok(get.result?.title);
        };
      }),
  );
  assert(flushed === 'Typed just before closing', 'closing the window writes the last edits first, then closes');

  // Closing while a 🗜 copy for phones is made: Wait, and once it's done the app writes it, then closes.
  console.log('Closing while a copy for phones is made:');
  await d.evaluate(() => (window.__closed = false));
  await d.evaluate(
    ([name, b64]) => {
      window.__opened = { name, bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) };
      window.__emit('open-file');
    },
    ['Copies.brainrot', (await copiesGame()).toString('base64')],
  );
  await answerReplace(d, 'Discard');
  await d.waitForFunction(() => document.querySelector('input.title')?.value === 'Copies');
  await editorReady(d);
  await d.locator('nav > button', { hasText: '🖼 Media' }).click();
  const shrink = d.getByRole('dialog', { name: '🗜 Make a smaller copy for phones' });
  const progress = shrink.locator('[data-shrink-progress]');
  // (The page's work slowed down 4 times: the long one is still being made after the clicks below.)
  const cdp = await desk.newCDPSession(d);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // The long one first (stopped below, its copy wouldn't be much smaller), the GIF's copy waiting behind it.
  for (const [id, waits] of [
    ['long', /Making it… \d+%/],
    ['dance', 'Waiting for the other file to finish…'],
  ]) {
    await d.locator(`[data-place="media:${id}"]`).getByRole('button', { name: '🗜 Make smaller…' }).click();
    await shrink.getByText(/^A small looping video/).waitFor();
    await shrink.getByRole('button', { name: 'Make it', exact: true }).click();
    await progress.filter({ hasText: waits }).waitFor({ timeout: 60_000 });
    await shrink.locator('.modal-x').click();
    await shrink.waitFor({ state: 'detached' });
  }
  await d.evaluate(() => window.__emit('close-requested'));
  const jobAsk = d.getByRole('alertdialog').filter({ hasText: '🗜 A smaller copy for phones is still being made' });
  await jobAsk.waitFor();
  assert((await jobAsk.innerText()).includes('Closing now stops it (nothing is changed).'), 'closing while a 🗜 copy is made asks first');
  await jobAsk.getByRole('button', { name: 'Wait' }).click();
  await jobAsk.waitFor({ state: 'detached' });
  await d.locator('[data-job-pill]').getByRole('button', { name: 'Stop' }).click();
  await d.waitForFunction(() => window.__closed === true, null, { timeout: 60_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const atClose = await d.evaluate(() => window.__draftAtClose);
  assert(atClose?.includes('dance (phones).webm'), `Wait: the app closes once the copy is made, with it written (${atClose?.join(', ')})`);

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nDesktop E2E passed.');
} finally {
  await browser.close();
}
