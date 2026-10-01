// Accessibility and consistency: windows keep the focus (Tab stays inside, the rest is inert, the focus goes back on
// close), the app asks in its own windows, the header fits at 150% zoom, readable colors, reduced motion, names.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dialogs = [];
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** The focused element's accessible-ish name (aria-label or text). */
const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  return el && el !== document.body ? (el.getAttribute('aria-label') || el.textContent || '').trim() : 'BODY';
});
const focusInside = (sel) => page.evaluate((s) => !!document.querySelector(s)?.contains(document.activeElement), sel);
/** WCAG contrast of an element's text on its background color. */
const contrastOf = (loc) =>
  loc.evaluate((el) => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(el);
    const [a, b] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- A window keeps the focus ----------
  const more = page.getByRole('button', { name: /^More:/ });
  await more.click();
  await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.waitFor();
  assert(await focusInside('[role="dialog"]'), 'opening ⚙ Settings puts the focus in it');
  let escaped = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await focusInside('[role="dialog"]'))) escaped++;
  }
  assert(escaped === 0, 'Tab ×30 never leaves it');
  await page.keyboard.press('Shift+Tab');
  assert(await focusInside('[role="dialog"]'), 'nor does Shift+Tab');
  assert(await page.locator('.editor nav').evaluate((n) => !!n.closest('[inert]')), 'the page behind it is inert');
  assert((await settings.getAttribute('aria-modal')) === 'true', 'it says it is modal');
  await settings.getByRole('button', { name: 'Close' }).click();
  assert(await more.evaluate((b) => b === document.activeElement), 'closing it gives the focus back to ⋯');
  assert(!(await page.locator('[inert]').count()), 'and nothing stays inert');

  await more.click();
  await page.getByRole('menuitem', { name: 'ℹ About' }).click();
  await page.getByRole('dialog', { name: 'About Brainrot Games Maker' }).waitFor();
  await page.keyboard.press('Escape');
  assert((await page.getByRole('dialog').count()) === 0 && (await more.evaluate((b) => b === document.activeElement)), 'Esc on ℹ About gives the focus back too');

  // Every window has the same ✕ named Close.
  await more.click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Editor keyboard shortcuts' });
  assert((await sheet.getByRole('button', { name: 'Close' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Done' }).count()) === 1, '⌨ Keyboard shortcuts: a ✕ named Close and a Done');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // ---------- Board editor: names and focus ----------
  const firstTile = page.locator('.tile').first();
  assert(/^Category 1, \$200: no question yet, no answer$/.test(await firstTile.getAttribute('aria-label')), `a tile is named by category, value and question (${await firstTile.getAttribute('aria-label')})`);
  await page.locator('.cat textarea').first().fill('Memes');
  // Its moves and Delete are in its ⋯ menu (named after the category).
  await page.getByRole('button', { name: 'More for category 1: Memes' }).click();
  await page.getByRole('menuitem', { name: /Delete category/ }).click();
  assert(/^More for category 1/.test(await focused()), `after deleting a category the focus goes to the next one’s ⋯ (${await focused()})`);
  await page.keyboard.press('Control+z');
  assert((await page.locator('nav [aria-current="page"]').count()) === 1, 'the sidebar marks the tab on screen (aria-current)');

  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  assert(await page.evaluate(() => document.activeElement?.matches('main [data-round-name]')), 'a new round puts the focus in its name field');

  // ---------- Readable colors ----------
  const play = page.getByRole('button', { name: '▶ Play' });
  assert((await contrastOf(play)) >= 4.5, `▶ Play (white on the accent) reads at ${(await contrastOf(play)).toFixed(2)}:1`);
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  const pastel = page.getByRole('button', { name: 'Pastel', exact: true });
  assert((await pastel.getAttribute('aria-pressed')) === 'false', 'theme presets are named by their label and say which is on');
  await pastel.click();
  assert((await pastel.getAttribute('aria-pressed')) === 'true', 'Pastel is pressed once chosen');
  const plate = page.locator('.preview .plate .score').first();
  assert((await plate.evaluate((e) => getComputedStyle(e).color)) === 'rgb(74, 59, 92)', 'Pastel scores are dark text on the pale tiles');

  // ---------- In-app questions ----------
  // A game in progress, then ▶ Play again: the app asks in its own window, with the focus on the safe answer.
  await play.click();
  assert(await page.locator('.pregame h1').evaluate((h) => h === document.activeElement), '▶ Play puts the focus at the top of the pre-game page');

  // Pre-game (where players are added): deleting a player offers Undo.
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  const names = page.locator('.pregame input.name');
  const before = await names.count();
  await page.getByRole('button', { name: /^Delete Player 2$/ }).click();
  const undoNote = page.locator('.undo-note');
  assert((await names.count()) === before - 1 && (await undoNote.innerText()).includes('Deleted Player 2'), 'deleting a player before the game says so');
  await undoNote.getByRole('button', { name: '↶ Undo' }).click();
  assert((await names.count()) === before, 'and its Undo brings them back');

  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().click();
  assert((await focused()).includes('Reveal answer'), 'opening a clue puts the focus on 👁 Reveal answer');
  // Screen readers hear an award from the page's polite live region (on the page all along, not mounted with its words).
  const region = page.locator('#live-region');
  assert((await region.getAttribute('aria-live')) === 'polite', 'the page has a polite live region');
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Player 1 \+\$200, now \$200/.test(document.getElementById('live-region')?.textContent ?? ''), null, { timeout: 3000 });
  assert(true, `the live region announces the award (“${await region.textContent()}”)`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '👥 Players' }).click();
  const playersDlg = page.getByRole('dialog', { name: 'Players' });
  await playersDlg.getByRole('button', { name: /^Remove / }).first().click();
  assert((await focused()) === 'Keep', 'removing a player mid-game asks with the focus on Keep');
  await playersDlg.getByRole('button', { name: 'Keep' }).click();
  await playersDlg.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Exit/ }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('button', { name: 'Resume game' }).waitFor();
  await play.click();
  const ask = page.getByRole('alertdialog');
  await ask.waitFor();
  assert((await ask.getAttribute('aria-modal')) === 'true', 'an in-app question is aria-modal');
  assert((await ask.innerText()).includes('can still be resumed') && (await focused()) === 'Keep it', 'Play over a saved game asks in the app, the focus on “Keep it”');
  await page.keyboard.press('Escape');
  assert((await ask.count()) === 0 && (await page.getByRole('button', { name: 'Resume game' }).isVisible()), 'Esc keeps the saved game');
  assert(dialogs.length === 0, `no browser dialog anywhere (${dialogs.join(' | ')})`);

  // ---------- Reduce motion on stream ----------
  await more.click();
  await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByText('Reduce motion on stream').click();
  assert(await page.evaluate(() => document.documentElement.classList.contains('reduce-stream')), '“Reduce motion on stream” calms the stage');
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();
  const motion = await page.evaluate(() => JSON.parse(localStorage.getItem('jb.prefs')).reduceMotion);
  assert(motion === true, 'and is remembered');

  // ---------- The header at 150% zoom ----------
  await page.setViewportSize({ width: 853, height: 480 });
  await page.waitForTimeout(100);
  const fit = await page.evaluate(() => {
    const h = document.querySelector('header');
    const p = [...h.querySelectorAll('button')].find((b) => b.textContent.includes('Play')).getBoundingClientRect();
    return { over: h.scrollWidth - h.clientWidth, right: p.right };
  });
  assert(fit.over <= 0 && fit.right <= 853, `at 150% zoom (853px) the header fits and ▶ Play shows (${JSON.stringify(fit)})`);

  // ---------- 200% zoom on a laptop (720 CSS px): the header wraps, nothing runs off the side ----------
  await page.setViewportSize({ width: 720, height: 450 });
  await page.waitForTimeout(150);
  const fit720 = await page.evaluate(() => {
    const h = document.querySelector('header');
    const right = Math.max(...[...h.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().right));
    const play = [...h.querySelectorAll('button')].find((b) => b.textContent.includes('Play')).getBoundingClientRect();
    return { over: h.scrollWidth - h.clientWidth, right, page: document.documentElement.scrollWidth, playRight: play.right };
  });
  assert(fit720.over <= 0 && fit720.right <= 720 && fit720.page <= 720 && fit720.playRight <= 720, `at 200% zoom (720px) every header button is on screen and the page doesn’t scroll sideways (${JSON.stringify(fit720)})`);
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------- Windows High Contrast (forced colors): the selected and pressed states still show ----------
  const fc = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active' });
  const hc = await fc.newPage();
  hc.on('pageerror', (e) => errors.push(`[forced colors] ${e.message}`));
  await hc.goto(pathToFileURL(file).href);
  await addClassicRounds(hc);
  await hc.getByRole('button', { name: '🎨 Theme' }).click();
  const outlined = (loc) => loc.evaluate((e) => { const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });
  const chosen = hc.locator('.preset[aria-pressed="true"]');
  const other = hc.locator('.preset[aria-pressed="false"]').first();
  assert((await outlined(chosen)) && !(await outlined(other)), 'with forced colors, the chosen theme preset is outlined (the others aren’t)');
  await hc.getByRole('button', { name: '▶ Play' }).click();
  await hc.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await hc.getByRole('button', { name: '＋ Add player' }).click();
  await hc.getByRole('button', { name: '＋ Add player' }).click();
  await hc.getByRole('button', { name: 'Start game ▶' }).click();
  await hc.getByRole('button', { name: 'Skip intro' }).click();
  await hc.keyboard.press('1');
  const sel = hc.locator('.panel .p.on');
  assert((await sel.count()) === 1 && (await outlined(sel)) && !(await outlined(hc.locator('.panel .p:not(.on)').first())), 'and a selected player in the host panel is outlined');
  await fc.close();

  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log('a11y: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'a11y-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
