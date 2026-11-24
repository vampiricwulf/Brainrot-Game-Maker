// The editor on a phone or a tablet: a phone gets a note that it's made for a computer (players join from their phones
// with the host's code), closed for good with its ✕. A touch screen with no mouse shows no keys on buttons and in menus,
// and no "or drop it here", but the keys window still lists the keys. A computer shows all of it, and no note.
// A phone hosting with the buzzer room up (local, under wrangler dev): the 📱 card's rows fit the screen (📱 and ⛔
// only, their words for screen readers and in their tooltips), nothing scrolls sideways, and Start game ▶ takes a tap.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { appFile, addPlayers, failureShots, startBuzzer, startRoomOn } from './helpers.mjs';

const file = appFile();
const url = pathToFileURL(file).href;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-touch-');
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
/** ✨ Try a sample game, then 📂 Open… while its toast is up: on a narrow screen the toast over the window wraps to a
 * few lines rather than being cut mid-sentence, and stays in the room above the window, clear of it and its buttons. */
async function toastOverWindow(page, what) {
  await page.getByRole('button', { name: /Try a sample game/ }).click();
  await page.locator('.toast', { hasText: 'Added a sample game' }).waitFor();
  await page.getByRole('button', { name: 'Open…' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  const t = await page.locator('.toast').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    // (Room at the top of every window for three lines, a tall window's title and ✕ too: its backdrop's padding.)
    const room = parseFloat(getComputedStyle(document.querySelector('.modal-backdrop')).paddingTop);
    return {
      cut: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
      wide: r.width >= innerWidth - 33,
      lines: Math.round((el.clientHeight - 16) / lh),
      roomy: r.top + (r.height - el.clientHeight) + 16 + 3 * lh <= room,
      top: r.top,
      bottom: r.bottom,
      text: el.textContent,
    };
  });
  const box = await dlg.boundingBox();
  const hit = await dlg.locator('button:visible').evaluateAll((bs, b) => bs.filter((x) => x.getBoundingClientRect().top < b).map((x) => x.textContent.trim() || x.getAttribute('aria-label')), t.bottom);
  assert(
    !t.cut && t.wide && t.lines >= 2 && t.lines <= 3 && t.roomy && t.top >= 0 && t.bottom <= box.y && hit.length === 0,
    `${what}: a toast over a window wraps to ${t.lines} lines the screen's width, not cut, above the window (with room for three) and clear of its buttons (${t.text})`,
  );
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
}

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
    await toastOverWindow(page, 'a phone');
    // A window as tall as the screen (the clue editor): its toast (📋 Copy slide's) still sits above it, not on its
    // title and ✕.
    await page.locator('nav > button.round-tab', { hasText: 'Jeopardy!' }).first().click();
    await page.locator('.grid .tile').first().click();
    const clueDlg = page.getByRole('dialog', { name: 'Edit clue' });
    await clueDlg.waitFor();
    await clueDlg.getByRole('button', { name: /Copy slide/ }).click();
    const [tb, cb] = [await page.locator('.toast').boundingBox(), await clueDlg.boundingBox()];
    assert(tb.y + tb.height <= cb.y && cb.y + cb.height >= 844 - 17, `a toast over the clue editor, as tall as the phone's screen, stays above its top (${Math.round(tb.y + tb.height)} ≤ ${Math.round(cb.y)})`);
    await page.keyboard.press('Escape');
    await clueDlg.waitFor({ state: 'detached' });
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

  // ---------- A phone hosting, the buzzer room up ----------
  {
    const opts = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript((s) => {
      try {
        const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
        if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: s }));
      } catch {}
    }, buzzer.base);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole('button', { name: /Try a sample game/ }).click();
    await page.getByRole('button', { name: '▶ Play' }).click();
    await page.getByRole('button', { name: /Start game ▶/ }).waitFor();
    await addPlayers(page, 3);
    const card = page.getByRole('region', { name: 'Phone buzzers' });
    await card.getByLabel(/Buzzer mode/).check();
    const code = await startRoomOn(card);
    const seats = await card.locator('ul.phones > li .name').allInnerTexts();
    for (const seat of seats.slice(0, 2)) {
      const pc = await browser.newContext(opts);
      const p = await pc.newPage();
      p.on('pageerror', (e) => errors.push(`[phone] ${e.message}`));
      await p.goto(`${buzzer.base}/${code}`);
      await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
      await p.getByRole('button', { name: seat, exact: true }).tap();
      await p.locator('#me').getByText(seat).waitFor();
    }
    await page.waitForFunction(() => document.querySelectorAll('ul.phones button.kick').length === 2);
    const fit = await page.evaluate(() => {
      // (A phone widens the page to fit what sticks out, so innerWidth would grow with it: the screen's 390 it is.)
      const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > 390.5).map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30));
      const rows = [...document.querySelectorAll('ul.phones > li')].map((li) => Math.round(li.getBoundingClientRect().height));
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, wide, rows, list: Math.round(document.querySelector('ul.phones').getBoundingClientRect().width) };
    });
    assert(
      fit.sw === 390 && fit.iw === 390 && fit.wide.length === 0 && fit.rows.every((h) => h < 40),
      `a phone hosting, two phones in: the 📱 card's rows fit the screen, one line each, nothing scrolls sideways (${JSON.stringify(fit)})`,
    );
    const kick = card.getByRole('button', { name: /^Kick .*: take their seat back from their phone$/ }).first();
    const free = card.getByRole('button', { name: /^Free seat: .*’s \(moved phone\)$/ }).first();
    assert(
      (await kick.innerText()).trim() === '⛔' && (await free.innerText()).trim() === '📱' && (await kick.getAttribute('title')).startsWith('Kick') && (await free.getAttribute('title')).includes('free the seat'),
      `there, ⛔ Kick and 📱 Free seat show only their icons, their words in their names and tooltips (“${(await kick.innerText()).trim()}”, “${(await free.innerText()).trim()}”)`,
    );
    // (A wider phone, 412: room for their words, still one line each, without the “(new phone)”.)
    await page.setViewportSize({ width: 412, height: 915 });
    const fit412 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      rows: [...document.querySelectorAll('ul.phones > li')].map((li) => Math.round(li.getBoundingClientRect().height)),
    }));
    assert(
      fit412.sw === 412 && fit412.rows.every((h) => h < 40) && (await kick.innerText()).trim() === '⛔ Kick' && (await free.innerText()).trim() === '📱 Free seat',
      `a 412-wide phone: ⛔ Kick and 📱 Free seat with their words, rows still one line, nothing sideways (${JSON.stringify(fit412)})`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Start game ▶/ }).tap({ timeout: 5000 });
    await page.locator('main.play').waitFor();
    assert(true, 'and Start game ▶ takes a tap');
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
    if (opts.viewport.width < 600) await toastOverWindow(page, what);
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
} catch (e) {
  await failureShots('touch', browser);
  throw e;
} finally {
  await browser.close();
  buzzer.stop();
}
