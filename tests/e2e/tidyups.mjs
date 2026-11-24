// Small editor and host tidy-ups at 1280×720: a tall window keeps its title and ✕ in sight as it scrolls, and 🖼 Media
// offers 🗑 Delete unused only while some file is unused.
import { pathToFileURL } from 'node:url';
import { addClassicRounds, appFile, failureShots, launchChromium, png } from './helpers.mjs';

const file = appFile();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const more = page.getByRole('button', { name: /^More:/ });
async function openSettings() {
  await more.click();
  await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
  const dlg = page.getByRole('dialog', { name: 'Settings' });
  await dlg.waitFor();
  return dlg;
}
/** Whether what's at the middle of `sel` in the window is that element (nothing scrolled over it). */
const onTop = (dlg, sel) =>
  dlg.evaluate((d, sel) => {
    const el = d.querySelector(sel);
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && (at === el || el.contains(at)) && r.top >= d.getBoundingClientRect().top;
  }, sel);

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- A tall window scrolls only between its head and its foot ----------
  let settings = await openSettings();
  // (Short enough that ⚙ Settings has more to show than fits, whatever the fonts.)
  await page.setViewportSize({ width: 1280, height: 560 });
  const room = await settings.evaluate((d) => d.scrollHeight - d.clientHeight);
  assert(room > 50, `⚙ Settings is taller than the window here (${room}px more)`);
  await settings.evaluate((d) => (d.scrollTop = d.scrollHeight));
  await page.waitForTimeout(100);
  assert(
    (await onTop(settings, '.modal-x')) && (await onTop(settings, '.modal-title')) && (await onTop(settings, '.modal-foot .primary')),
    'scrolled to its end, ⚙ Settings still shows its title and ✕ at the top, and Done at the bottom',
  );
  // Something scrolled into view (Tab to it) stops below the head, not under it.
  await settings.evaluate((d) => (d.scrollTop = d.scrollHeight));
  await settings.getByLabel('Undo steps to remember').focus();
  await page.waitForTimeout(100);
  assert(await onTop(settings, 'input[aria-label="Undo steps to remember"]'), 'a box Tab goes to higher up comes into view below the head');
  await settings.getByRole('button', { name: 'Done' }).click();
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------- 🖼 Media offers 🗑 Delete unused only while something is unused ----------
  await page.getByRole('button', { name: /^🖼 Media \(\d+\)$/ }).click();
  const unusedBtn = page.getByRole('main').getByRole('button', { name: /^🗑 Delete unused/ });
  await page.getByRole('button', { name: '＋ Add files…' }).waitFor();
  assert((await unusedBtn.count()) === 0, 'an empty 🖼 Media has no 🗑 Delete unused (0)');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '＋ Add files…' }).click()]);
  await chooser.setFiles([{ name: 'spare.png', mimeType: 'image/png', buffer: png(200, 40, 40) }]);
  await page.locator('[data-place^="media:"]').first().waitFor();
  assert((await unusedBtn.innerText()).trim() === '🗑 Delete unused (1)', 'a file nothing uses brings 🗑 Delete unused (1)');
  await unusedBtn.click();
  await page.locator('[data-place^="media:"]').waitFor({ state: 'detached' });
  assert((await unusedBtn.count()) === 0, 'and once it is deleted, the button goes again');
  const kept = await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 3000 }).then(
    () => true,
    () => false,
  );
  assert(kept, 'the keys stay on the page, not lost with the button');

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('tidyups: all passed');
} catch (e) {
  console.error(e);
  await failureShots('tidyups', page);
  process.exitCode = 1;
} finally {
  await browser.close();
}
