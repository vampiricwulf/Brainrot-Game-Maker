// Slide editor layers: reaching items stacked under a bigger one (right-click menu, Alt+click, Tab,
// the Layers list), restacking, locking (clicks go through), hiding while editing, drag-to-select.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

  // Lock the picture: clicks go through it, and Delete leaves it alone.
  await layers.filter({ hasText: 'cover.png' }).getByRole('button', { name: 'Lock' }).click();
  await clickAt(960, 540);
  assert((await inspectorKind()) === 'text', 'clicks go through a locked item to the one underneath');
  await clickAt(60, 1000);
  assert((await inspectorKind()) === 'none', 'clicking a spot with only the locked picture selects nothing');
  await layers.filter({ hasText: 'cover.png' }).locator('.name').click();
  await page.keyboard.press('Delete');
  assert((await layers.count()) === 2, 'Delete keeps a locked item');

  // Hide while editing.
  await layers.filter({ hasText: 'cover.png' }).getByRole('button', { name: 'Hide while editing' }).click();
  assert((await page.locator('.canvas .slide img').count()) === 0, 'hide-while-editing takes it off the canvas');
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

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nLayers E2E passed.');
} finally {
  await browser.close();
}
