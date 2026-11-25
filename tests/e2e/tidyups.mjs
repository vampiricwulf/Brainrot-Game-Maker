// @ts-check
// Small editor and host tidy-ups at 1280×720: a tall window keeps its title and ✕ in sight as it scrolls, and 🖼️ Media
// offers 🗑 Delete unused only while some file is unused. Icons that are text by default ask for the colour emoji.
// ⚙ Settings › Undo says when it snaps a number into range and how many changes a lower one forgot. A wheel tile's
// Which wheel offers the ready-made wheels.
import { pathToFileURL } from 'node:url';
import { addClassicRounds, appFile, failureShots, launchChromium, png, assert, until, roundTabsIn, toastsIn } from './helpers.mjs';

const file = appFile();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
  // On a phone the foot takes two lines: a box Tab goes to lower down comes into view above it, not under it.
  await page.setViewportSize({ width: 390, height: 844 });
  settings = await openSettings();
  await settings.evaluate((d) => (d.scrollTop = 0));
  await settings.getByLabel('Buzzer server').focus();
  await page.waitForTimeout(100);
  assert(await onTop(settings, 'input[aria-label="Buzzer server"]'), 'on a phone, the buzzer server box comes into view above the two-line foot');
  await settings.getByRole('button', { name: 'Done' }).click();
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------- 🖼️ Media offers 🗑 Delete unused only while something is unused ----------
  await page.getByRole('button', { name: /^🖼️ Media \(\d+\)$/ }).click();
  const unusedBtn = page.getByRole('main').getByRole('button', { name: /^🗑 Delete unused/ });
  await page.getByRole('button', { name: '＋ Add files…' }).waitFor();
  assert((await unusedBtn.count()) === 0, 'an empty 🖼️ Media has no 🗑 Delete unused (0)');
  // (Its empty page's 🖼 asks for the colour emoji too, U+FE0F after it, like the sidebar's 🖼 Media.)
  const emptyIcon = await page.getByRole('main').locator('.empty .ic').innerText();
  assert(emptyIcon.trim() === '🖼️', `an empty 🖼 Media's picture asks for the colour emoji (${JSON.stringify(emptyIcon)})`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '＋ Add files…' }).click()]);
  await chooser.setFiles([{ name: 'spare.png', mimeType: 'image/png', buffer: png(200, 40, 40) }]);
  await page.locator('[data-place^="media:"]').first().waitFor();
  assert((await unusedBtn.innerText()).trim() === '🗑 Delete unused (1)', 'a file nothing uses brings 🗑 Delete unused (1)');
  // 🗑 last, a little apart from the button before it (the link box's ＋ Add), as 🗑 sits on every page.
  const apart = await unusedBtn.evaluate((b) => {
    const prev = b.previousElementSibling?.getBoundingClientRect();
    return prev ? Math.round(b.getBoundingClientRect().left - prev.right) : null;
  });
  assert(apart !== null && apart >= 16, `🗑 Delete unused sits a little apart from the button before it (${apart}px)`);
  await unusedBtn.click();
  await page.locator('[data-place^="media:"]').waitFor({ state: 'detached' });
  assert((await unusedBtn.count()) === 0, 'and once it is deleted, the button goes again');
  const kept = await page
    .waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 3000 })
    .then(
      () => true,
      () => false,
    );
  assert(kept, 'the keys stay on the page, not lost with the button');

  // ---------- Icons that are text by default ask for the colour emoji (U+FE0F), so none is a grey outline ----------
  const VS = '️';
  /** The menu's lines, each with whether its icon asks for the colour emoji. */
  const menuIcons = async () => (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim().split('\n')[0]);
  await page.getByRole('button', { name: '＋ Add round' }).click();
  const rounds = await menuIcons();
  await page.keyboard.press('Escape');
  for (const [icon, name] of [
    ['🗺', 'RPG'],
    ['♟', 'Board game'],
    ['🖼', 'Slides'],
  ])
    assert(
      rounds.some((t) => t.startsWith(`${icon}${VS} ${name}`)),
      `＋ Add round: ${icon} ${name} asks for the colour emoji`,
    );
  await page.getByRole('button', { name: '🎡 Wheels, Dice & Deals' }).click();
  await page.getByRole('button', { name: '📋 Ready-made wheel…' }).click();
  const ready = await menuIcons();
  await page.keyboard.press('Escape');
  for (const [icon, name] of [
    ['😈', 'Punishments'],
    ['🃏', 'Truth or dare'],
    ['⏱', 'Time limit'],
    ['🗺', 'Locations'],
  ])
    assert(
      ready.some((t) => t.startsWith(`${icon}${VS} ${name}`)),
      `📋 Ready-made wheel…: ${icon} ${name} too`,
    );
  await page.getByRole('button', { name: '📋 Ready-made deal…' }).click();
  const deals = await menuIcons();
  await page.keyboard.press('Escape');
  assert(
    deals.some((t) => t.startsWith(`🕵${VS} Odd one out`)),
    '📋 Ready-made deal…: 🕵️ Odd one out too',
  );
  // (The sidebar lists 🖼️ Media under the rounds, beside 🖼️ Slides ones.)
  const mediaTab = (await page.locator('nav > button', { hasText: 'Media (' }).innerText()).trim();
  assert(mediaTab.startsWith(`🖼${VS} Media (`), `the sidebar: 🖼️ Media too (${mediaTab})`);

  // ---------- ⚙ Settings › Undo says what it did: snapped into range, and the changes it forgot ----------
  await roundTabsIn(page).first().click();
  for (let i = 0; i < 15; i++) {
    await page.getByRole('button', { name: '×2', exact: true }).click();
    await page.getByRole('button', { name: '÷2', exact: true }).click();
  }
  const historyTab = page.locator('nav').getByRole('button', { name: /🕘 History/ });
  const steps = async () => Number((await historyTab.innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
  const before = await steps();
  assert(before > 30, `30 changes are in 🕘 History (${before})`);
  settings = await openSettings();
  const undoBox = settings.getByLabel('Undo steps to remember');
  const said = settings.locator('[data-undo-said]');
  await undoBox.fill('5');
  await undoBox.press('Tab');
  await said.waitFor();
  const forgot = before - 20;
  assert(
    (await undoBox.inputValue()) === '20' && (await said.innerText()) === `Set to 20, the lowest it goes. Forgot the ${forgot} oldest changes in 🕘 History.`,
    `5 snaps to 20 and the window says so, and what it forgot (“${await said.innerText()}”)`,
  );
  await undoBox.fill('300');
  await undoBox.press('Tab');
  await said.waitFor({ state: 'detached' });
  assert(true, 'raising it again says nothing (nothing snapped, nothing forgotten)');
  await undoBox.fill('99999');
  await undoBox.press('Tab');
  assert((await undoBox.inputValue()) === '2000' && (await said.innerText()) === 'Set to 2000, the highest it goes.', '99999 snaps to 2000, said the same way');
  await undoBox.fill('20');
  await undoBox.press('Tab');
  assert(!(await said.count()), '20 with only 20 kept: nothing to say');
  await undoBox.fill('0');
  await undoBox.press('Tab');
  assert(
    (await undoBox.inputValue()) === '300' && (await said.innerText()) === 'Set to 300, the default (20 is the lowest it goes).',
    `0 is the default, said so (“${await said.innerText()}”)`,
  );
  // Typed, then Done straight away: the window goes, and a toast says what the box did.
  await undoBox.fill('20');
  await undoBox.press('Tab');
  await undoBox.fill('2500');
  await settings.getByRole('button', { name: 'Done' }).click();
  await settings.waitFor({ state: 'detached' });
  const doneToast = toastsIn(page, { hasText: 'Undo:' });
  await doneToast.waitFor();
  assert((await doneToast.innerText()) === 'Undo: set to 2000, the highest it goes.', `typed, then Done: a toast says it (“${await doneToast.innerText()}”)`);
  settings = await openSettings();
  await undoBox.fill('300');
  await undoBox.press('Tab');
  // Esc with the box still focused (no change yet): the window goes, and a toast says what was forgotten.
  await settings.getByRole('button', { name: 'Done' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '×2', exact: true }).click();
  settings = await openSettings();
  await undoBox.fill('2');
  await page.keyboard.press('Escape');
  await settings.waitFor({ state: 'detached' });
  const toast = toastsIn(page);
  await toast.waitFor();
  assert(
    (await toast.innerText()) === 'Undo: set to 20, the lowest it goes. Forgot the 3 oldest changes in 🕘 History.',
    `closed with Esc, a toast says it (“${await toast.innerText()}”)`,
  );
  assert((await steps()) === 20, '🕘 History keeps 20');
  // A note read under the box is never said again as the window goes: not after another number and Esc, nor on Done.
  const stale = toastsIn(page).filter({ hasText: /^Undo: set to 20, the lowest it goes\.$/ });
  settings = await openSettings();
  await undoBox.fill('5');
  await undoBox.press('Tab');
  await said.waitFor();
  await undoBox.fill('300');
  await page.keyboard.press('Escape');
  await settings.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert(!(await stale.count()), '5, Tab, then 300 and Esc: no toast with the old note (300 needs no word)');
  settings = await openSettings();
  await undoBox.fill('5');
  await undoBox.press('Tab');
  await said.waitFor();
  await settings.getByRole('button', { name: 'Done' }).click();
  await settings.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert(!(await stale.count()), '5, Tab (its note shows), then Done: the note isn’t said again in a toast');

  // ---------- A wheel tile's Which wheel offers the ready-made wheels, and picking one adds it to the game ----------
  await roundTabsIn(page).first().click();
  await page.locator('[data-tile="1,2"]').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🎡 Wheel tile…' }).click();
  const clueBox = page.getByRole('dialog', { name: 'Edit clue' });
  await clueBox.waitFor();
  const which = clueBox.getByLabel('Which wheel');
  const groups = await which.evaluate((sel) =>
    [...sel.querySelectorAll('optgroup')].map((g) => `${g.label}: ${[...g.children].map((o) => o.textContent).join(', ')}`),
  );
  const readyGroup = groups.find((g) => g.startsWith('Ready-made (adds a copy to the game): ')) ?? '';
  assert(
    readyGroup.includes('🎰 Point wheel') && readyGroup.includes('💰 Double or nothing'),
    `Which wheel has a “Ready-made (adds a copy to the game)” group (${readyGroup.slice(0, 80)}…)`,
  );
  await which.selectOption({ label: '🎰 Point wheel' });
  const pickedWheel = () => which.evaluate((sel) => /** @type {HTMLSelectElement} */ (sel).selectedOptions[0]?.textContent ?? '');
  await until(async () => (await pickedWheel()) === 'Point wheel', { timeout: 5_000, every: 100 });
  const undoTitle = await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(
    (await pickedWheel()) === 'Point wheel' && undoTitle.startsWith('Undo: Added wheel “Point wheel”'),
    `picking 🎰 Point wheel adds it to the game and the tile uses it, one step (${undoTitle})`,
  );
  assert((await clueBox.getByRole('button', { name: '✎ Edit wheel' }).count()) === 1, 'and ✎ Edit wheel can change it');
  await page.keyboard.press('Control+z');
  await until(async () => !(await pickedWheel()).includes('Point wheel'), { timeout: 5_000, every: 100 });
  const left = await which.evaluate((sel) => [.../** @type {HTMLSelectElement} */ (sel).options].map((o) => o.textContent));
  assert(
    (await pickedWheel()) === 'Choose a wheel…' && !left.includes('Point wheel'),
    `one Ctrl+Z takes the wheel off the tile and out of the game (${await pickedWheel()})`,
  );
  await page.keyboard.press('Escape');
  await clueBox.waitFor({ state: 'detached' });

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('tidyups: all passed');
} catch (e) {
  console.error(e);
  await failureShots('tidyups', page);
  process.exitCode = 1;
} finally {
  await browser.close();
}
