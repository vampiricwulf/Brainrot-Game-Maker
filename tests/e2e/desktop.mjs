// Desktop app, with the native side stood in for (window.__TAURI_INTERNALS__): Save replaces the game's own last save
// (keeping a backup) but never another game's of the same name, Open… lists and opens an exported .html, a game file
// the app is opened with (at start or by a second launch) opens, and closing the window writes the last edits first.
// Also in a browser: Open… takes an exported .html.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

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
          return null;
        default:
          return null;
      }
    },
  };
  window.__emit = (event, payload) => (listeners[event] ?? []).forEach((id) => callbacks.get(id)?.({ event, id, payload }));
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
  const [download] = await Promise.all([w.waitForEvent('download'), w.getByRole('button', { name: '⬇ Export HTML' }).click()]);
  const htmlPath = resolve('test-results/desktop-export.html');
  await download.saveAs(htmlPath);
  await w.getByRole('button', { name: 'New', exact: true }).click();
  await w.locator('input.title').fill('Something else');
  const [chooser] = await Promise.all([w.waitForEvent('filechooser'), w.getByRole('button', { name: 'Open…' }).click()]);
  assert((await chooser.element().getAttribute('accept')).includes('.html'), 'Open… offers .html files');
  await chooser.setFiles(htmlPath);
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
  await addClassicRounds(d);
  await d.locator('input.title').fill('Quiz');
  await d.waitForTimeout(300);
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.waitForFunction(() => window.__saves.has('Quiz (2).brainrot'));
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await d.waitForFunction(() => window.__saves.has('Quiz (2).brainrot.bak'));
  assert(
    JSON.stringify(await saveNames(d)) === JSON.stringify(['Quiz (2).brainrot', 'Quiz (2).brainrot.bak', 'Quiz.brainrot', 'Quiz.brainrot.bak']),
    'another game with the same title never replaces it: it saves as "Quiz (2)" and keeps saving there',
  );

  // Open… lists the saves and the exported game, but not the backups.
  await d.evaluate((text) => window.__saves.set('Exported Quiz.html', { bytes: new TextEncoder().encode(text), modified: 1 }), readFileSync(htmlPath, 'utf8'));
  await d.getByRole('button', { name: 'Open…' }).click();
  const list = d.getByRole('dialog', { name: 'Open a game' });
  await list.waitFor();
  const listed = await list.locator('button.save b').allInnerTexts();
  assert(listed.includes('Exported Quiz.html') && !listed.some((n) => n.endsWith('.bak')), `Open… lists the exported game, not the backups (${listed.join(', ')})`);
  await d.screenshot({ path: 'test-results/desktop-open.png' });
  await list.getByRole('button', { name: /Exported Quiz\.html/ }).click();
  await d.waitForFunction(() => document.querySelector('input.title')?.value === 'Exported Quiz');
  assert(true, 'an exported game in the list opens');

  // A second launch given a game file: the running app opens it.
  await d.locator('input.title').fill('From a second launch');
  await d.getByRole('button', { name: 'Export JSON' }).click();
  await d.waitForFunction(() => window.__saves.has('From-a-second-launch.json'));
  await d.locator('input.title').fill('Before');
  await d.evaluate(() => {
    window.__opened = { name: 'From-a-second-launch.json', bytes: window.__saves.get('From-a-second-launch.json').bytes };
    window.__emit('open-file');
  });
  await d.waitForFunction(() => document.querySelector('input.title')?.value === 'From a second launch');
  assert(await d.evaluate(() => window.__opened === null), 'a game file given to a second launch opens in the running app');

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

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nDesktop E2E passed.');
} finally {
  await browser.close();
}
