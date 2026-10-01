// Host ⇄ audience sync over the BroadcastChannel fallback: the audience page is opened on its own
// (no window.opener), the way the desktop app's fallback window is. Served over http like the
// desktop app (http://tauri.localhost), not file://.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const html = readFileSync(file);
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
try {
  const host = await context.newPage();
  host.on('pageerror', (e) => errors.push('[host] ' + e.message));
  host.on('dialog', (d) => d.accept());
  await host.goto(base);
  await addClassicRounds(host);
  await host.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  await host.locator('.cat textarea').first().fill('Channel Test');
  await playWithPlayers(host, 2);
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.locator('.board .tile').first().waitFor();

  // An audience page with no opener (like a window the desktop app creates itself).
  const aud = await context.newPage();
  aud.on('pageerror', (e) => errors.push('[audience] ' + e.message));
  await aud.goto(base + '#audience');
  assert(await aud.evaluate(() => window.opener === null), 'audience page has no opener');
  await aud.locator('.board .header .title', { hasText: 'Channel Test' }).waitFor({ timeout: 8000 });
  assert(true, 'audience connects over the BroadcastChannel and shows the board');
  // A only opens or focuses: with an audience already connected over the channel, it opens no second window.
  let extraPages = 0;
  context.on('page', () => extraPages++);
  await host.bringToFront();
  await host.keyboard.press('a');
  await host.waitForTimeout(500);
  assert(extraPages === 0, 'A opens no second audience window while one is connected over the channel');

  await host.locator('.board .tile').first().click();
  await aud.locator('.full').waitFor();
  assert(true, 'audience follows the host into a clue');
  await host.keyboard.press('1');
  await host.keyboard.press('Enter');
  await aud.getByText('+$200').waitFor();
  assert(true, 'score pops reach the audience over the channel');
  await host.keyboard.press('Escape');
  await aud.locator('.board .tile.used').first().waitFor();
  assert(true, 'used tile shows in the audience window');
  // A file dropped on the audience window is ignored: the browser would open it in place of the stream.
  const dropIgnored = await aud.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'cat.png', { type: 'image/png' }));
    const events = ['dragover', 'drop'].map((type) => new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    for (const e of events) document.querySelector('.aud').dispatchEvent(e);
    return events.every((e) => e.defaultPrevented);
  });
  assert(dropIgnored, 'a file dropped on the audience window is ignored');

  await host.close({ runBeforeUnload: true });
  await aud.getByText('Host window closed').waitFor({ timeout: 8000 });
  assert(true, 'audience notices when the host window closes');
  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Channel sync test passed');
} finally {
  await browser.close();
  server.close();
}
