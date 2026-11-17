// The editor on a phone or a tablet: a phone gets a note that it's made for a computer (players join from their phones
// with the host's code), closed for good with its ✕. A touch screen with no mouse shows no keys on buttons and in menus,
// and no "or drop it here", but the keys window still lists the keys. A computer shows all of it, and no note.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addPlayers } from './helpers.mjs';

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
async function open(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  return { ctx, page };
}
const note = (page) => page.locator('.data-notice', { hasText: 'Made for a computer.' });
const shows = (loc) => loc.evaluate((e) => getComputedStyle(e).display !== 'none');

try {
  // ---------- A phone ----------
  {
    const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await note(page).waitFor();
    assert((await note(page).innerText()).includes("Players join from their phones with the host's code."), 'a phone says the editor is made for a computer, and that players join from their phones');
    // (One note, its ✕ beside its words.)
    const [words, x] = await Promise.all([note(page).locator('span').first().boundingBox(), note(page).getByRole('button', { name: 'Got it' }).boundingBox()]);
    assert(x.y < words.y + words.height && x.x > words.x + words.width - 1, 'its ✕ sits beside its words');
    // Nothing to drop with a finger, nor keys to press.
    assert(!(await shows(page.locator('.first-round .open-line .not-touch'))) && (await page.locator('.first-round .open-line').innerText()).includes('Have a game file?'), '“or drop it here” isn’t shown on a touch screen');
    // (Nor in 📂 Open a game's foot.)
    await page.locator('.first-round .open-line').getByRole('button', { name: /Open a game/ }).click();
    await page.locator('.hint.drop').waitFor({ state: 'attached' });
    assert(!(await shows(page.locator('.hint.drop'))), '📂 Open a game doesn’t say “or drop a game file” on a touch screen');
    await page.keyboard.press('Escape');
    await page.locator('.hint.drop').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Help:/ }).click();
    const menuKey = page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).locator('kbd');
    assert((await menuKey.count()) === 1 && !(await shows(menuKey)), 'a menu shows no keys on a touch screen');
    await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
    const keys = page.getByRole('dialog', { name: 'Editor keyboard shortcuts' });
    await keys.waitFor();
    assert(await shows(keys.locator('td > kbd').first()), 'the keys window still lists the keys (a keyboard can be plugged in)');
    await page.keyboard.press('Escape');
    await keys.waitFor({ state: 'detached' });
    // Its ✕ puts it away for good on this phone.
    await note(page).getByRole('button', { name: 'Got it' }).click();
    assert((await note(page).count()) === 0, 'its ✕ closes it');
    await page.reload();
    await page.getByRole('button', { name: 'Open…' }).waitFor();
    await page.waitForTimeout(300);
    assert((await note(page).count()) === 0, 'and it stays closed');
    // The ▶ Play screen's Start game ▶ has no Ctrl+⏎ on it.
    await page.getByRole('button', { name: /Try a sample game/ }).click();
    await page.locator('nav > button.round-tab').first().waitFor();
    // The sidebar's list, at most 30% of the height, scrolls: its foot fades to say there's more (🕘 History, cut).
    const nav = page.locator('nav[aria-label="Editor"]');
    await page.waitForFunction(() => {
      const n = document.querySelector('nav[aria-label="Editor"]');
      return n && n.scrollHeight > n.clientHeight + 1;
    });
    await page.waitForTimeout(100);
    assert((await nav.evaluate((n) => getComputedStyle(n).maskImage)).includes('gradient'), 'the sidebar’s list scrolls on a phone, and its foot fades to say so');
    await nav.evaluate((n) => n.scrollTo(0, n.scrollHeight));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('nav[aria-label="Editor"]')).maskImage === 'none');
    assert(true, 'scrolled to its end, it doesn’t fade');
    await page.getByRole('button', { name: '▶ Play' }).click();
    await page.getByRole('button', { name: /Start game ▶/ }).waitFor();
    await addPlayers(page, 2);
    const startKey = page.locator('kbd.start-key');
    assert((await startKey.count()) === 1 && !(await shows(startKey)), 'Start game ▶ shows no Ctrl+⏎ on a touch screen');
    await ctx.close();
  }

  // ---------- A tablet ----------
  {
    // The line saying what the app is wraps: a finger can't open the tooltip a cut line keeps the rest in.
    const { ctx, page } = await open({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
    const words = page.locator('.first-round .what > .words');
    assert(
      (await words.evaluate((w) => w.scrollWidth <= w.clientWidth)) && (await page.locator('.first-round .what').innerText()).includes('Nothing to install.'),
      'a tablet shows the whole line saying what the app is, not cut short',
    );
    await ctx.close();
  }

  // ---------- A computer: a narrow window, and a touch laptop ----------
  for (const [what, opts] of [
    ['a narrow window on a computer', { viewport: { width: 390, height: 844 } }],
    ['a touch laptop', { viewport: { width: 1280, height: 800 }, hasTouch: true }],
  ]) {
    const { ctx, page } = await open(opts);
    await page.waitForTimeout(300);
    assert((await note(page).count()) === 0, `${what} gets no “Made for a computer” note`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } });
    assert(await shows(page.locator('.first-round .open-line .not-touch')), 'with a mouse, the first screen says “or drop it here”');
    const what = await page.locator('.first-round .what').boundingBox();
    assert(what.height < 30, 'and its line saying what the app is stays on one line');
    await page.locator('.first-round .open-line').getByRole('button', { name: /Open a game/ }).click();
    await page.locator('.hint.drop').waitFor();
    assert(await shows(page.locator('.hint.drop')), 'and 📂 Open a game says “or drop a game file on the editor”');
    await page.keyboard.press('Escape');
    await page.locator('.hint.drop').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Help:/ }).click();
    assert(await shows(page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).locator('kbd')), 'and its menus show their keys');
    await ctx.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Touch E2E passed.');
} finally {
  await browser.close();
}
