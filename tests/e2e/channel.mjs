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
  // The notice shows only while the mouse is over the window (it would cover the stream otherwise).
  const notice = aud.getByText('Host window closed');
  for (let i = 0; i < 40 && !(await notice.count()); i++) {
    await aud.mouse.move(100 + (i % 2) * 20, 100);
    await aud.waitForTimeout(200);
  }
  assert((await notice.count()) === 1, 'audience notices when the host window closes (the mouse over it)');
  await notice.waitFor({ state: 'detached', timeout: 3000 });
  assert(true, 'and the notice goes once the mouse is still, off the stream');

  // A host page that opened its audience window, then reloaded: Resume preselects the display used last, finds that
  // window again (no new one) and asks it whether it may play sound, instead of asking for a click again.
  const host2 = await context.newPage();
  host2.on('pageerror', (e) => errors.push('[host2] ' + e.message));
  await host2.goto(base);
  await host2.getByRole('button', { name: 'Resume game' }).click();
  const [aud2] = await Promise.all([host2.waitForEvent('popup'), host2.locator('.mode-ask .mode', { hasText: 'Separate audience window' }).click()]);
  aud2.on('pageerror', (e) => errors.push('[audience 2] ' + e.message));
  await aud2.locator('.board').waitFor();
  const clickOnce = host2.getByText('Click the audience window once');
  // (On a busy machine the window can say it may play sound before the ask shows: then there's nothing to click.)
  const asked = await clickOnce.waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (asked) await aud2.mouse.click(400, 300);
  await clickOnce.waitFor({ state: 'detached' });
  await aud2.locator('.activate').waitFor({ state: 'detached' });
  assert(true, 'the host clicks the audience window once: it may play sound');
  await host2.reload();
  await host2.getByRole('button', { name: 'Resume game' }).click();
  const picked = host2.locator('.mode-ask .mode.on');
  await picked.waitFor();
  assert((await picked.innerText()).includes('Separate audience window'), 'after a reload, Resume preselects the display used last (the audience window)');
  await host2.waitForFunction(() => document.activeElement?.classList.contains('on'));
  assert(true, 'with the focus on it');
  let popups = 0;
  host2.on('popup', () => popups++);
  await host2.keyboard.press('Enter');
  await host2.locator('.panel').waitFor();
  await host2.waitForTimeout(1200);
  assert(popups === 0 && !aud2.isClosed(), 'Enter resumes in it: the audience window from before the reload is found again (no second window)');
  assert((await aud2.locator('.board').count()) === 1, 'and shows the game');
  assert((await clickOnce.count()) === 0, 'it says it may play sound: no false "Click the audience window once"');

  // Leaving the game keeps the audience window (OBS's capture source) up, on the "Starting soon" card.
  await host2.getByRole('button', { name: '🚪 Exit' }).click();
  await host2.waitForTimeout(450); // (a click right away is ignored: a double-click guard)
  await host2.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await aud2.locator('.soon-text').waitFor();
  assert(!aud2.isClosed() && (await aud2.locator('.board').count()) === 0, 'Keep & leave: the audience window stays up, on the Starting soon card');
  const audItem = host2.locator('.status-bar [data-audience-open]');
  await audItem.waitFor();
  assert(true, 'the bar over the editor says the audience window is up');
  // ▶ Play and ◀ Back to editor: still there.
  await host2.getByRole('button', { name: '▶ Play' }).click();
  await host2.getByRole('button', { name: '◀ Back to editor' }).click();
  await audItem.waitFor();
  await host2.waitForTimeout(300);
  assert(!aud2.isClosed() && (await aud2.locator('.soon-text').count()) === 1, '◀ Back to editor keeps it too');
  // Its ✕ (asked first) closes it.
  await audItem.getByRole('button', { name: 'Close the audience window' }).click();
  await host2.getByRole('alertdialog').getByRole('button', { name: 'Close it' }).click();
  if (!aud2.isClosed()) await aud2.waitForEvent('close', { timeout: 3000 });
  assert(aud2.isClosed(), 'and the bar’s ✕ closes it');
  await host2.waitForTimeout(900);
  assert((await host2.locator('.status-bar [data-audience-lost]').count()) === 0, 'closed by the host: no "Audience window closed" warning');
  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Channel sync test passed');
} finally {
  await browser.close();
  server.close();
}
