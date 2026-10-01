// Slide editor layers: reaching items stacked under a bigger one (right-click menu, Alt+click, Tab,
// the Layers list), restacking, locking (clicks go through), hiding while editing, drag-to-select.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const shot = (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
// 4×4 white PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8AARLgBAAC0BAP/HpJ+EwAAAABJRU5ErkJggg==';

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  await page.locator('.grid .tile').first().click();
  const canvas = page.locator('.canvas');
  const stageBox = () => canvas.locator('.stage').boundingBox();
  /** Viewport point for a stage (1920×1080) point. */
  const at = async (x, y) => {
    const r = await stageBox();
    return { x: r.x + (x * r.width) / 1920, y: r.y + (y * r.height) / 1080 };
  };
  /** Click a stage point; `alt` holds Alt (page.mouse.click has no modifiers option). */
  const clickAt = async (x, y, alt = false) => {
    const p = await at(x, y);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.click(p.x, p.y);
    if (alt) await page.keyboard.up('Alt');
  };
  const inspectorKind = async () =>
    (await page.locator('.insp textarea').count()) ? 'text' : (await page.locator('.insp h4', { hasText: 'Image' }).count()) ? 'image' : 'none';

  // The Reset background button is always in the toolbar (disabled until there's a background): it used to
  // appear on the first colour change, and that shift closed the browser's colour picker mid-typing.
  const resetBg = page.getByRole('button', { name: '↺ BG' });
  assert((await resetBg.count()) === 1 && (await resetBg.isDisabled()), 'the ↺ BG button is already there (disabled) before any background is set');

  // Write the question, then cover the whole slide with a picture.
  await page.locator('.canvas .hit').first().click();
  await page.locator('.insp textarea').fill('Under the picture');
  const dt = await page.evaluateHandle((b64) => {
    const d = new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'cover.png', { type: 'image/png' }));
    return d;
  }, PNG);
  await canvas.dispatchEvent('drop', { dataTransfer: dt });
  await page.locator('.insp h4', { hasText: 'Image' }).waitFor();
  const pos = page.locator('.insp section:has(h4:text("Position"))');
  for (const [k, v] of [['X', 0], ['Y', 0], ['W', 1920], ['H', 1080]]) await pos.getByLabel(k, { exact: true }).fill(String(v));
  await page.keyboard.press('Escape');
  await page.locator('.canvas img').first().click({ trial: true }).catch(() => {});

  const layers = page.locator('.layers-box .row');
  assert((await layers.count()) === 2, 'the Layers list shows both items');
  assert((await layers.first().innerText()).includes('cover.png'), 'top-most first');

  // A plain click lands on the picture on top.
  await clickAt(960, 540);
  assert((await inspectorKind()) === 'image', 'a click selects the top item');

  // Right-click lists everything under the pointer.
  const p = await at(960, 540);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  const menu = page.locator('[aria-label="Slide item menu"]');
  await menu.waitFor();
  assert((await menu.locator('.pick').count()) === 2, 'right-click lists both stacked items');
  await shot('layers-1-menu');
  await menu.locator('.pick', { hasText: 'Under the picture' }).click();
  assert((await inspectorKind()) === 'text', 'picking from the menu selects the hidden text');
  assert((await menu.count()) === 0, 'the menu closes');

  // Alt+click walks down the stack and wraps around.
  await clickAt(960, 540);
  await clickAt(960, 540, true);
  assert((await inspectorKind()) === 'text', 'Alt+click reaches the item underneath');
  await clickAt(960, 540, true);
  assert((await inspectorKind()) === 'image', 'Alt+click again wraps back to the top');

  // Tab steps through items.
  await page.locator('body').focus();
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press('Tab');
  assert((await inspectorKind()) === 'text', 'Tab selects the next item down');

  // Restack from the keyboard: Ctrl+Shift+] brings the text to the front.
  await page.keyboard.press('Control+Shift+BracketRight');
  assert((await layers.first().innerText()).includes('Under the picture'), 'Ctrl+Shift+] brings it to the front');
  await clickAt(960, 540);
  assert((await inspectorKind()) === 'text', 'now a plain click reaches it');
  // …and the menu sends it back.
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await menu.getByRole('menuitem', { name: /Send to back/ }).click();
  assert((await layers.first().innerText()).includes('cover.png'), 'Send to back from the menu');
  // Each restack is one undo step, from the menu or the keyboard.
  await page.keyboard.press('Control+z');
  assert((await layers.first().innerText()).includes('Under the picture'), 'Ctrl+Z undoes Send to back');
  await page.keyboard.press('Control+z');
  assert((await layers.first().innerText()).includes('cover.png'), 'a second Ctrl+Z undoes the Ctrl+Shift+] restack');
  await layers.filter({ hasText: 'cover.png' }).locator('.name').click();
  assert((await pos.getByLabel('W', { exact: true }).inputValue()) === '1920', '…on its own: the picture keeps the size set before it');
  await page.keyboard.press('Control+y');
  assert((await layers.first().innerText()).includes('Under the picture'), 'Ctrl+Y redoes the Ctrl+Shift+] restack');
  await page.keyboard.press('Control+y');
  assert((await layers.first().innerText()).includes('cover.png'), 'a second Ctrl+Y redoes Send to back');

  // Lock the picture: clicks go through it, and Delete leaves it alone.
  await layers.filter({ hasText: 'cover.png' }).getByRole('button', { name: 'Lock' }).click();
  await clickAt(960, 540);
  assert((await inspectorKind()) === 'text', 'clicks go through a locked item to the one underneath');
  await clickAt(60, 1000);
  assert((await inspectorKind()) === 'none', 'clicking a spot with only the locked picture selects nothing');
  await layers.filter({ hasText: 'cover.png' }).locator('.name').click();
  await page.keyboard.press('Delete');
  assert((await layers.count()) === 2, 'Delete keeps a locked item');
  assert((await page.locator('.notice').innerText()).includes('Skipped 1 locked item'), 'and says it skipped it');
  // Ctrl+X leaves it too, and doesn't copy it, so a paste can't make a second one.
  await page.keyboard.press('Control+x');
  assert((await layers.count()) === 2, 'Ctrl+X keeps a locked item');
  await page.keyboard.press('Control+v');
  assert((await layers.count()) === 2, 'and Ctrl+V after it pastes nothing');
  await layers.filter({ hasText: 'Under the picture' }).locator('.name').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+x');
  const cutNote = await page.locator('.notice').innerText();
  assert(
    (await layers.count()) === 1 && cutNote.includes('Cut text box') && cutNote.includes('Skipped 1 locked item'),
    'Ctrl+X on the text and the locked picture cuts only the text (and says so); the Layers list stays for the locked picture',
  );
  await page.keyboard.press('Control+v');
  assert((await layers.count()) === 2 && (await layers.filter({ hasText: 'cover.png' }).count()) === 1, 'Ctrl+V brings back just the text');
  // Undo the paste and the cut, so the steps below line up.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  assert((await layers.count()) === 2 && (await layers.first().innerText()).includes('cover.png'), 'Ctrl+Z twice undoes the paste and the cut');

  // Hide while editing.
  await layers.filter({ hasText: 'cover.png' }).getByRole('button', { name: 'Hide while editing' }).click();
  assert((await page.locator('.canvas .slide img').count()) === 0, 'hide-while-editing takes it off the canvas');
  // Hiding is editor-only, so undo skips it: Ctrl+Z undoes the lock from the Layers list before it.
  const coverRow = layers.filter({ hasText: 'cover.png' });
  await page.keyboard.press('Control+z');
  assert(
    (await coverRow.getByRole('button', { name: 'Lock: cover.png', exact: true }).count()) === 1 && (await page.locator('.canvas .slide img').count()) === 0,
    'Ctrl+Z undoes the lock and leaves the picture hidden',
  );
  await page.keyboard.press('Control+y');
  assert((await coverRow.getByRole('button', { name: 'Unlock: cover.png', exact: true }).count()) === 1, 'Ctrl+Y locks it again');
  await layers.filter({ hasText: 'cover.png' }).getByRole('button', { name: 'Show while editing' }).click();
  assert((await page.locator('.canvas .slide img').count()) === 1, 'and shows it again');

  // Drag-to-select: two shapes in the top-left corner (over the locked picture), clear of the text.
  await layers.filter({ hasText: 'Under the picture' }).locator('.name').click();
  for (const [k, v] of [['X', 400], ['Y', 500], ['W', 1100], ['H', 300]]) await pos.getByLabel(k, { exact: true }).fill(String(v));
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '◼ Shape ▾' }).click();
    await page.getByRole('button', { name: '▭ Rectangle' }).click();
    for (const [k, v] of [['X', 40 + i * 260], ['Y', 40], ['W', 200], ['H', 150]]) await pos.getByLabel(k, { exact: true }).fill(String(v));
  }
  const a = await at(10, 10);
  const b = await at(560, 260);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await shot('layers-2-marquee');
  await page.mouse.up();
  assert((await page.getByText('2 items selected.').count()) === 1, 'dragging a box selects the two shapes (not the locked picture)');

  // The Layers list keeps the keyboard: arrow keys move through it (they never nudge the item), and
  // Alt+↑/↓ or ▲▼ restack the row and keep focus on it, so they can be pressed again.
  const topId = await layers.first().getAttribute('data-layer');
  const topRow = page.locator(`.layers-box .row[data-layer="${topId}"]`);
  const rowIndex = () => layers.evaluateAll((rows, id) => rows.findIndex((r) => r.dataset.layer === id), topId);
  const focusedRow = () => page.evaluate(() => document.activeElement?.closest('[data-layer]')?.getAttribute('data-layer'));
  const xy = async () => `${await pos.getByLabel('X', { exact: true }).inputValue()},${await pos.getByLabel('Y', { exact: true }).inputValue()}`;
  await topRow.locator('.name').click();
  const xy0 = await xy();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  assert((await xy()) === xy0, "←/→ in the Layers list don't nudge the selected item");
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  assert((await rowIndex()) === 2 && (await focusedRow()) === topId, 'Alt+↓ twice moves the row down two places, keeping focus on it');
  await page.keyboard.press('ArrowRight');
  assert((await xy()) === xy0, 'so an arrow key after a restack still leaves the item where it is');
  await topRow.getByRole('button', { name: 'Bring forward' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert((await rowIndex()) === 0 && (await focusedRow()) === topId, 'Enter on ▲ twice brings it back to the top, keeping focus on the row');

  // The inspector's Lock box is one undo step each time, like the list's 🔒.
  const lockBox = page.locator('.insp').getByLabel('Lock', { exact: true });
  await lockBox.check();
  await lockBox.uncheck();
  await topRow.locator('.name').focus();
  await page.keyboard.press('Control+z');
  assert(await lockBox.isChecked(), 'Ctrl+Z undoes unticking Lock in the inspector');
  await page.keyboard.press('Control+z');
  assert(!(await lockBox.isChecked()) && (await rowIndex()) === 0, 'a second Ctrl+Z undoes ticking it (and nothing before it)');

  // "Use this style elsewhere" copies the text look to the other questions in the category, the default
  // (it used to crash on text without an outline or glow).
  await layers.filter({ hasText: 'Under the picture' }).locator('.name').click();
  await page.locator('.insp input[type=color]').first().fill('#ff00aa');
  await page.locator('.insp').getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByText(/Style applied to 4 slides/).waitFor();
  assert(true, '"Use this style elsewhere" restyles the other 4 questions in the category');
  await page.getByRole('button', { name: 'Next ▶' }).click();
  await page.locator('.canvas .hit').first().click();
  assert((await page.locator('.insp input[type=color]').first().inputValue()) === '#ff00aa', 'the next clue (down the category) got the new text color');

  // Resize a picture, then drag it straight away. The resize used to leave a text selection on the page,
  // and the next press started the browser's own drag of it: a 'no' cursor and the move stopped early.
  {
    const dt2 = await page.evaluateHandle((b64) => {
      const d = new DataTransfer();
      d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'resize.png', { type: 'image/png' }));
      return d;
    }, PNG);
    await canvas.dispatchEvent('drop', { dataTransfer: dt2 });
    await page.locator('.insp h4', { hasText: 'Image' }).waitFor();
    for (const [k, v] of [['X', 300], ['Y', 200], ['W', 600], ['H', 400]]) await pos.getByLabel(k, { exact: true }).fill(String(v));
    await page.evaluate(() => {
      window.__nativeDrag = [];
      for (const t of ['dragstart', 'pointercancel']) document.addEventListener(t, () => window.__nativeDrag.push(t), true);
    });
    const corner = await at(900, 600); // bottom-right handle
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x + 60, corner.y + 40, { steps: 8 });
    await page.mouse.up();
    const w = Number(await pos.getByLabel('W', { exact: true }).inputValue());
    assert(w > 600, `the corner handle resizes the picture (W ${w})`);
    assert((await page.evaluate(() => String(getSelection()))) === '', 'resizing leaves no text selected on the page');
    const x0 = Number(await pos.getByLabel('X', { exact: true }).inputValue());
    const mid = await at(600, 400);
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + 150, mid.y + 10, { steps: 12 });
    await page.mouse.up();
    const x1 = Number(await pos.getByLabel('X', { exact: true }).inputValue());
    const moved = await at(0, 0).then(async (o) => ((mid.x + 150 - o.x) - (mid.x - o.x)) / ((await at(1920, 0)).x - o.x) * 1920);
    assert(Math.abs(x1 - x0 - moved) < 20, `right after resizing, dragging moves the picture the whole way (${x0} → ${x1}, expected about +${Math.round(moved)})`);
    assert((await page.evaluate(() => window.__nativeDrag)).length === 0, "no browser drag-and-drop takes over (no 'no' cursor)");
    await page.keyboard.press('Delete'); // leave the slide as the next checks expect: just its text, selected
    await page.locator('.canvas .hit').first().click();
  }

  // A slide with one item lists it too (the keyboard way to it), and a locked one (clicks go through it) unlocks there.
  assert((await layers.count()) === 1, 'a slide with one item has the Layers list');
  const only = layers.first();
  const label = (await only.locator('.txt').innerText()).trim();
  assert(
    (await only.getByRole('button', { name: `Lock: ${label}`, exact: true }).count()) === 1 &&
      (await only.getByRole('button', { name: `Hide while editing: ${label}`, exact: true }).count()) === 1 &&
      (await only.getByRole('button', { name: `Bring forward: ${label}`, exact: true }).count()) === 1,
    `its buttons say which item they're for ("Lock: ${label}")`,
  );
  await page.locator('.insp').getByLabel('Lock', { exact: true }).check();
  assert((await layers.count()) === 1, 'it stays listed once that item is locked');
  await layers.first().getByRole('button', { name: /^Unlock: / }).click();
  assert(!(await page.locator('.insp').getByLabel('Lock', { exact: true }).isChecked()), 'and unlocks it from there');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nLayers E2E passed.');
} finally {
  await browser.close();
}
