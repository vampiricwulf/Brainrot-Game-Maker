// Desktop app, with the native side stood in for (window.__TAURI_INTERNALS__): Save replaces the game's own last save
// (keeping a backup) but never another game's of the same name, Open… lists and opens an exported .html (a save that
// can't be read says why), a game file the app is opened with (at start or by a second launch) opens, and closing the
// window writes the last edits first; closing while a 🗜 copy for phones is made, Wait closes once it's done, with the
// copy written; closing while autosave can't write (or read) asks first. ⬆ Update: a failure stays until it's read
// (one during a game waits for the editor), and one that finishes once a game has started waits for ⟳ Restart. The 💧
// beside a color box (a theme color, a slide's text color, a caption's in the image editor) puts the color picked on the
// screen in it, one undo step, and Esc there changes nothing; a player's color another player has is turned down. Also
// in a browser: Open… takes an exported .html.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, addPlayers, answerReplace, clickExportHtml, editorReady, packGame } from './helpers.mjs';
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
  // Storage fills up while window.__full is set (as when the disk is full), and can't be read either while
  // window.__unreadable is (as when it's blocked).
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) {
    if (window.__full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return put.apply(this, a);
  };
  const idbGet = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (...a) {
    if (window.__unreadable) throw new DOMException('Internal error', 'UnknownError');
    return idbGet.apply(this, a);
  };
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
          // (The app's own message, as a string: a save moved since the list was made, or locked by another program.)
          if (window.__readFail?.[args.name]) throw window.__readFail[args.name];
          return saves.get(args.name).bytes.buffer;
        case 'pick_screen_color':
          // (The color the host picks on the screen: window.__pick, or null for Esc.)
          return window.__pick ?? null;
        case 'can_self_update':
          return true;
        case 'install_update':
          // (Done when the test says: window.__installGo.)
          await window.__installGo;
          if (window.__installFail) throw window.__installFail;
          return null;
        case 'data_folders': {
          const at = (path) => ({ path, exists: true });
          return { data: at('C:\\Data'), settings: at('C:\\Settings'), saves: at('C:\\Games\\BrainrotSaves'), savesDocuments: at('C:\\Docs\\BrainrotSaves'), oldData: at('C:\\Old') };
        }
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
              const get = idbGet.call(req.result.transaction('keyval').objectStore('keyval'), 'editorDraft');
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
  // GitHub's latest release (ℹ About › Check for updates), with the .exe and its signature: ⬆ Update offers it.
  const DL = 'https://github.com/vampiricwulf/Brainrot-Game-Maker/releases/download/v99.0.0';
  const latest = {
    tag_name: 'v99.0.0',
    html_url: 'https://github.com/vampiricwulf/Brainrot-Game-Maker/releases/tag/v99.0.0',
    body: '',
    draft: false,
    prerelease: false,
    assets: ['brainrot-game-maker-portable.exe', 'brainrot-game-maker-portable.exe.sig'].map((name) => ({ name, browser_download_url: `${DL}/${name}` })),
  };
  await desk.route('https://api.github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(latest) }),
  );
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

  // Open… lists the saves and the exported game, but not the backups. An autosave too (its name is long), whose file
  // can't be read now.
  await d.evaluate((text) => window.__saves.set('Exported Quiz.html', { bytes: new TextEncoder().encode(text), modified: 1 }), readFileSync(htmlPath, 'utf8'));
  const LOCKED = "Couldn't open My-Big-Quiz-Night (autosave 1, g1a2b3).brainrot: another program is using it. Close it in the other program and try again.";
  await d.evaluate((why) => {
    const name = 'My-Big-Quiz-Night (autosave 1, g1a2b3).brainrot';
    window.__saves.set(name, { ...window.__saves.get('Quiz.brainrot'), modified: new Date(2026, 9, 23, 11, 33, 12).getTime() });
    window.__readFail = { [name]: why };
  }, LOCKED);
  // Open… shows Recent games first (New kept the first Quiz there): BrainrotSaves… lists the saves.
  await d.getByRole('button', { name: 'Open…' }).click();
  const list = d.getByRole('dialog', { name: 'Open a game' });
  await list.getByRole('button', { name: 'BrainrotSaves…' }).waitFor();
  assert((await list.innerText()).includes('kept on this PC only'), 'Recent games say they’re kept on this PC (not “in this browser”)');
  await list.getByRole('button', { name: 'BrainrotSaves…' }).click();
  await list.locator('button.save').first().waitFor();
  const listed = await list.locator('button.save b').allInnerTexts();
  assert(listed.includes('Exported Quiz.html') && !listed.some((n) => n.endsWith('.bak')), `Open… lists the exported game, not the backups (${listed.join(', ')})`);
  await d.screenshot({ path: 'test-results/desktop-open.png' });
  // Each save's date and size stay inside its row (they go under a long name instead), the date as Recent games says it.
  const rowHints = await list.locator('button.save').evaluateAll((bs) =>
    bs.map((b) => {
      const [row, hint, css] = [b.getBoundingClientRect(), b.querySelector('.hint'), getComputedStyle(b)];
      const right = row.right - parseFloat(css.paddingRight) - parseFloat(css.borderRightWidth);
      return { inside: hint.getBoundingClientRect().right <= right + 0.5, text: hint.textContent };
    }),
  );
  assert(
    rowHints.every((r) => r.inside && !/\d:\d\d:\d\d/.test(r.text)),
    `every save's date and size show in full, without seconds (${rowHints.map((r) => `${r.text}${r.inside ? '' : ' (cut off)'}`).join(' | ')})`,
  );
  // A save that can't be read says why (the app's own words).
  await list.getByRole('button', { name: /autosave 1/ }).click();
  const locked = d.getByRole('alertdialog').filter({ hasText: 'another program is using it' });
  await locked.waitFor();
  assert(true, 'a save that can’t be read says why');
  await locked.getByRole('button', { name: 'OK' }).click();
  await d.getByRole('button', { name: 'Open…' }).click();
  await list.getByRole('button', { name: 'BrainrotSaves…' }).click();
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
  assert((await unsavedAsk.innerText()).includes('keeps it on this PC'), '…and says Recent games keep it on this PC');
  await unsavedAsk.getByRole('button', { name: 'Cancel' }).click();
  await d.locator('nav').getByRole('button', { name: /🕘 History/ }).click();
  await d.locator('.list > .mark').first().waitFor();
  // (Newest first.)
  const rows = await d.locator('.list > .mark, .list > .hr').allInnerTexts();
  const savedAt = rows.findIndex((t) => t.includes('Saved “From-a-second-launch.brainrot”'));
  const typedAt = rows.findIndex((t) => t.includes('Typed while saving'));
  assert(typedAt >= 0 && savedAt === typedAt + 1, 'the history shows the save where the game was when it started, with the change typed meanwhile after it');
  await d.locator('nav > button.round-tab').first().click();

  // ---------- 💧 beside color boxes: a color picked on the screen (the color popup's own eyedropper does nothing in
  // the app on some PCs) ----------
  console.log('💧 Pick a color from the screen:');
  const undoTitle = () => d.evaluate(() => document.querySelector('.editor > header button[aria-label="Undo (Ctrl+Z)"]').title);
  /** Press 💧 (the host picks window.__pick on the screen) and wait for the keys to come back to it. */
  const pickWith = async (drop, color) => {
    await drop.evaluate((b, c) => {
      window.__pick = c;
      // (Off it first: the page puts the keys back on it once the picker is closed.)
      b.blur();
      b.click();
    }, color);
    await d.waitForFunction((b) => document.activeElement === b, await drop.elementHandle(), { timeout: 5000 }).catch(() => {
      throw new Error(`Assertion failed: after a pick, the keys come back to the 💧 (${color})`);
    });
  };
  await d.getByRole('button', { name: '🎨 Theme' }).click();
  const valuesBox = d.locator('[data-k="value"] input[type=color]');
  const valuesDrop = d.locator('[data-k="value"]').getByRole('button', { name: 'Pick a color from the screen' });
  await valuesDrop.waitFor();
  // (The box is still named by its label, not "Pick a color from the screen Values".)
  const ax = await desk.newCDPSession(d);
  const { root } = await ax.send('DOM.getDocument');
  const { nodeId } = await ax.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-k="value"] input[type=color]' });
  const { nodes } = await ax.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  await ax.detach();
  assert(nodes[0]?.name?.value === 'Values', `a theme color has a 💧 beside it, and the box keeps its own name (${nodes[0]?.name?.value})`);
  await d.locator('label[data-k="value"]').click({ button: 'right', position: { x: 5, y: 5 } });
  const settingMenu = d.getByRole('menu');
  await settingMenu.waitFor();
  assert((await settingMenu.innerText()).startsWith('Values\n'), 'its right-click menu is still called Values');
  await d.keyboard.press('Escape');
  await settingMenu.waitFor({ state: 'detached' });
  const valueBefore = await valuesBox.inputValue();
  const stepBefore = await undoTitle();
  await calls(d);
  await pickWith(valuesDrop, null);
  assert(
    (await calls(d)).includes('pick_screen_color') && (await valuesBox.inputValue()) === valueBefore && (await undoTitle()) === stepBefore,
    'Esc in the picker changes nothing (no step either), and the keys are back on the 💧',
  );
  await pickWith(valuesDrop, '#12ab34');
  assert((await valuesBox.inputValue()) === '#12ab34', 'a color picked on the screen goes in the box');
  await d.waitForFunction((before) => {
    const title = document.querySelector('.editor > header button[aria-label="Undo (Ctrl+Z)"]').title;
    return title !== before && !title.includes('your latest changes');
  }, stepBefore);
  const picked = await undoTitle();
  await d.keyboard.press('Control+z');
  await d.waitForFunction((v) => document.querySelector('[data-k="value"] input[type=color]').value === v, valueBefore);
  assert((await undoTitle()) === stepBefore, `…as one step (${picked}), which Ctrl+Z takes back`);
  // A slide's text color.
  await d.locator('nav > button.round-tab').first().click();
  await d.locator('.grid .tile').first().click();
  const clueDlg = d.getByRole('dialog', { name: 'Edit clue' });
  await clueDlg.waitFor();
  const canvasBox = await d.locator('.canvas').first().boundingBox();
  await d.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  const textColor = d.locator('.insp .color input[type=color]');
  const textDrop = d.locator('.insp .color').getByRole('button', { name: 'Pick a color from the screen' });
  await textDrop.waitFor();
  const textBefore = await textColor.inputValue();
  const clueUndo = clueDlg.getByRole('button', { name: 'Undo (Ctrl+Z)' });
  const clueStep = await clueUndo.getAttribute('title');
  await pickWith(textDrop, '#12ab34');
  assert((await textColor.inputValue()) === '#12ab34', `💧 by a slide's text color puts the color picked in it (it was ${textBefore})`);
  await d.waitForFunction(([b, before]) => b.title !== before && !b.title.includes('your latest changes'), [await clueUndo.elementHandle(), clueStep]);
  await d.keyboard.press('Control+z');
  await d.waitForFunction((v) => document.querySelector('.insp .color input[type=color]').value === v, textBefore);
  assert((await clueUndo.getAttribute('title')) === clueStep, '…as one step, which Ctrl+Z takes back');
  // The image editor's own undo: a caption's Fill picked with 💧 is one ↶ Undo (it took back the step before it).
  const dropped = await d.evaluateHandle(async () => {
    const c = new OffscreenCanvas(160, 90);
    const g = c.getContext('2d');
    g.fillStyle = '#3366cc';
    g.fillRect(0, 0, 160, 90);
    const dt = new DataTransfer();
    dt.items.add(new File([await c.convertToBlob({ type: 'image/png' })], 'blue.png', { type: 'image/png' }));
    return dt;
  });
  const stage = await d.locator('.canvas .stage').first().boundingBox();
  await d.locator('.canvas').first().dispatchEvent('drop', { dataTransfer: dropped, clientX: stage.x + stage.width * 0.15, clientY: stage.y + stage.height * 0.2 });
  const pic = d.locator('.canvas .slide .el img').first();
  await pic.waitFor();
  const picBox = await pic.boundingBox();
  await d.mouse.click(picBox.x + picBox.width / 2, picBox.y + picBox.height / 2);
  await d.locator('.insp').getByRole('button', { name: '✎ Edit image…' }).click();
  const ie = d.getByRole('dialog', { name: 'Edit image' });
  await ie.getByRole('button', { name: '🅣 Text' }).click();
  await ie.getByRole('button', { name: '＋ Add text in the middle' }).click();
  const fill = ie.getByLabel('Fill', { exact: true });
  await fill.waitFor();
  const fillBefore = await fill.inputValue();
  await d.evaluate(() => (window.__pick = '#12ab34'));
  // (Pressed as a host does: the press is where the editor's undo step starts.)
  await ie.locator('label', { hasText: 'Fill' }).getByRole('button', { name: 'Pick a color from the screen' }).click();
  await d.waitForFunction(() => document.querySelector('[aria-label="Edit image"] input[aria-label="Fill"]')?.value === '#12ab34');
  await ie.getByRole('button', { name: '↶ Undo' }).click();
  assert(
    (await ie.getByLabel('Caption text').count()) === 1 && (await fill.inputValue()) === fillBefore,
    `in the image editor, one ↶ Undo takes back just a caption's Fill picked with 💧 (${await fill.count() ? await fill.inputValue() : 'the caption went'})`,
  );
  // (The next one takes back the caption: with nothing left to throw away, Cancel closes without asking.)
  await ie.getByRole('button', { name: '↶ Undo' }).click();
  await ie.getByLabel('Caption text').waitFor({ state: 'detached' });
  await ie.getByRole('button', { name: 'Cancel', exact: true }).click();
  await ie.waitFor({ state: 'detached' });
  await clueDlg.getByRole('button', { name: 'Done' }).click();
  await clueDlg.waitFor({ state: 'detached' });
  // A player's color another player has is turned down: the box shows the player's own again.
  await d.getByRole('button', { name: '▶ Play' }).click();
  await d.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await addPlayers(d, 2);
  const taken = await d.getByLabel('Color for Player 1', { exact: true }).inputValue();
  const second = d.getByLabel('Color for Player 2', { exact: true });
  const own = await second.inputValue();
  await pickWith(d.getByRole('button', { name: 'Pick the color for Player 2 from the screen' }), taken);
  await d.locator('.toast', { hasText: 'Another player already has that color' }).waitFor();
  const shows = await second.inputValue();
  assert(shows === own, `💧 by a player's color: one another player has is turned down, and the box keeps theirs (${own}; it shows ${shows})`);
  await d.getByRole('button', { name: '◀ Back to editor' }).click();
  await editorReady(d);

  // ---------- ℹ About's folders; ⬆ Update ----------
  console.log('ℹ About and ⬆ Update:');
  await d.getByRole('button', { name: /^More:/ }).click();
  await d.getByRole('menuitem', { name: /About/ }).click();
  const aboutDlg = d.getByRole('dialog', { name: 'About Brainrot Games Maker' });
  await aboutDlg.getByRole('button', { name: /^Open folder:/ }).first().waitFor();
  const folderNames = await aboutDlg.getByRole('button', { name: /^Open folder:/ }).evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  assert(folderNames.length === 5 && new Set(folderNames).size === 5, `ℹ About's 📂 buttons each say which folder they open (${folderNames.join(' | ')})`);
  // A failed update says why until it's read.
  await d.evaluate(() => (window.__installFail = "Couldn't put the new version in place of this one (Access is denied)."));
  await aboutDlg.getByRole('button', { name: 'Check for updates' }).click();
  const updateBtn = aboutDlg.getByRole('button', { name: '⬆ Update to 99.0.0' });
  await updateBtn.click();
  const failed = d.getByRole('alertdialog').filter({ hasText: 'Access is denied' });
  await failed.waitFor();
  assert(true, 'a failed ⬆ Update says why, until OK');
  await failed.getByRole('button', { name: 'OK' }).click();
  // Pressed again, then a game started while it downloads: when it fails, nothing pops up over the game.
  await d.evaluate(() => {
    window.__installGo = new Promise((go) => (window.__installDone = go));
  });
  await updateBtn.click();
  await aboutDlg.getByRole('button', { name: 'Updating…' }).waitFor();
  await d.keyboard.press('Escape');
  await aboutDlg.waitFor({ state: 'detached' });
  await d.getByRole('button', { name: '▶ Play' }).click();
  await d.getByRole('button', { name: 'Start game ▶' }).waitFor();
  // A game file given meanwhile (Explorer's Open with) waits for the editor, and says so.
  await d.evaluate(() => {
    window.__opened = { name: 'Next-show.json', bytes: new TextEncoder().encode('{}') };
    window.__emit('open-file');
  });
  await d.locator('.toast', { hasText: 'That game file opens when you go back to the editor.' }).waitFor();
  assert(true, 'a game file given during a game says it opens back in the editor');
  await d.evaluate(() => (window.__opened = null));
  await d.evaluate(() => window.__installDone());
  await d.locator('.toast', { hasText: "Version 99.0.0 didn't install: the editor says why when you go back." }).waitFor();
  assert((await d.getByRole('alertdialog').count()) === 0, 'an update that fails once a game has started pops nothing up over it: a toast says the editor says why');
  await d.getByRole('button', { name: '◀ Back to editor' }).click();
  await failed.waitFor();
  assert(true, '…and back in the editor, it does');
  await failed.getByRole('button', { name: 'OK' }).click();
  // Once more (the editor's notice), then a game started: when it works, it doesn't restart by itself.
  await d.evaluate(() => {
    window.__installFail = null;
    window.__installGo = new Promise((go) => (window.__installDone = go));
  });
  await calls(d);
  const notice = d.locator('.data-notice', { hasText: '99.0.0 is out' });
  await notice.getByRole('button', { name: '⬆ Update to 99.0.0' }).click();
  await notice.getByRole('button', { name: 'Updating…' }).waitFor();
  await d.getByRole('button', { name: '▶ Play' }).click();
  await d.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await d.evaluate(() => window.__installDone());
  await d.locator('.toast', { hasText: 'Version 99.0.0 is ready' }).waitFor();
  assert(!(await calls(d)).includes('restart_app'), 'an update that finishes once a game has started doesn’t restart the app');
  await d.getByRole('button', { name: '◀ Back to editor' }).click();
  await notice.getByRole('button', { name: '⟳ Restart into 99.0.0' }).waitFor();
  assert(true, 'back in the editor, ⟳ Restart into 99.0.0 is offered');
  await notice.getByRole('button', { name: 'Not now' }).click();

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

  // Storage full: closing asks first (the changes aren't stored anywhere), Stay keeps the window open.
  await d.evaluate(() => {
    window.__closed = false;
    window.__full = true;
  });
  await d.locator('input.title').fill('Not stored anywhere');
  await d.getByText('⚠ Autosave unavailable here').waitFor();
  await calls(d);
  await d.evaluate(() => window.__emit('close-requested'));
  const lostAsk = d.getByRole('alertdialog').filter({ hasText: "Autosave isn't working, so closing now loses your changes since the last Save." });
  await lostAsk.getByRole('button', { name: 'Stay' }).click();
  await lostAsk.waitFor({ state: 'detached' });
  const stayed = await calls(d);
  assert(stayed.includes('hold_close') && !stayed.includes('close_app'), `storage full: closing asks first, and Stay keeps the window open (${stayed.join(', ')})`);
  // (Storage that can't be read either asks the same.)
  await d.evaluate(() => {
    window.__unreadable = true;
    window.__emit('close-requested');
  });
  await lostAsk.getByRole('button', { name: 'Close anyway' }).click();
  await d.waitForFunction(() => window.__closed === true);
  assert(true, '…the next ✕ asks again (storage that can’t be read either too), and Close anyway closes');
  await d.evaluate(() => (window.__full = window.__unreadable = false));

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
  // (An MP4 where the browser makes H.264, as CI's does; a WebM in the test Chromium here.)
  assert(atClose?.some((n) => /^dance \(phones\)\.(mp4|webm)$/.test(n)), `Wait: the app closes once the copy is made, with it written (${atClose?.join(', ')})`);

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nDesktop E2E passed.');
} finally {
  await browser.close();
}
