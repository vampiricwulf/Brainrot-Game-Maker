// Slide editor fixes: number fields that can't save "nothing", a box drawn beside a text box's words (and Alt+drag),
// snapping while resizing, lining up and spacing several items, items dropped at the edge, the BG swatch's colour,
// Esc on an Inspector checkbox, room for text effects, the typewriter, one copy of a file dropped twice, 🎨 Apply
// keeping a turned picture in its box, Replace redoing edits, and the History's names for these.
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

const canvas = page.locator('.canvas');
const insp = page.locator('.insp');
const toast = page.locator('.toast');
/** Viewport point for a stage (1920×1080) point. */
async function at(x, y) {
  const r = await canvas.locator('.stage').boundingBox();
  return { x: r.x + (x * r.width) / 1920, y: r.y + (y * r.height) / 1080 };
}
async function drag(from, to, opts = {}) {
  const a = await at(...from);
  const b = await at(...to);
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
}
async function click(x, y) {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y);
}
/** Every item on the slide as drawn: [left, top, width, height] in stage px, with its id. */
const drawn = () =>
  canvas.locator('.slide .el').evaluateAll((els) =>
    els.map((e) => ({ id: e.dataset.el, img: !!e.querySelector('img'), x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height) })),
  );
const position = insp.locator('section', { hasText: 'Position' });
const posField = (name) => position.getByLabel(name, { exact: true });
/** Type into an Inspector number field and leave it (Tab), as a person would. */
async function setNumber(locator, value) {
  await locator.fill(String(value));
  await locator.press('Tab');
}
async function addRect(x, y, w, h) {
  await page.getByRole('button', { name: /◼ Shape/ }).click();
  await page.getByRole('button', { name: '▭ Rectangle' }).click();
  await setNumber(posField('W'), w);
  await setNumber(posField('H'), h);
  await setNumber(posField('X'), x);
  await setNumber(posField('Y'), y);
}
/** A picture made in the page (PNG of w×h, filled with `color`), as a DataTransfer of one file. */
const picture = (name, w, h, color) =>
  page.evaluateHandle(
    async ([name, w, h, color]) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      const blob = await c.convertToBlob({ type: 'image/png' });
      const d = new DataTransfer();
      d.items.add(new File([blob], name, { type: 'image/png' }));
      return d;
    },
    [name, w, h, color],
  );
async function dropAt(dt, x, y) {
  const p = await at(x, y);
  await canvas.dispatchEvent('drop', { dataTransfer: dt, clientX: p.x, clientY: p.y });
  await page.waitForTimeout(400);
}
const mediaCount = async () => Number((await page.getByRole('button', { name: /^🖼 Media \(\d+\)$/ }).innerText()).match(/\d+/)[0]);

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- The BG swatch shows the theme's tile colour ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByRole('button', { name: /^Pastel/ }).click();
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  await page.locator('.grid .tile').first().click();
  const clue = page.getByRole('dialog', { name: 'Edit clue' });
  await clue.waitFor();
  assert((await page.getByLabel('Slide background color').inputValue()) === '#ffd6e7', "the BG swatch shows the Pastel theme's tile colour, not the Classic blue");

  // ---------- The main text box ----------
  await click(960, 540);
  await insp.locator('textarea').fill('Hi');
  const size = insp.locator('label.field', { hasText: 'Max size' }).locator('input');
  await size.fill('');
  await size.press('Tab');
  assert((await size.inputValue()) === '110', 'an emptied Max size keeps its value (110) when left');
  await setNumber(size, 3);
  assert((await size.inputValue()) === '8', 'a size below the smallest is pulled up to 8');
  await setNumber(size, 110);
  await setNumber(posField('W'), '');
  assert((await posField('W').inputValue()) === '1680', 'an emptied W keeps the width');

  // Esc on an Inspector checkbox leaves it, it doesn't close the clue.
  const lock = insp.getByLabel('Lock', { exact: true });
  await lock.check();
  await lock.press('Escape');
  await page.waitForTimeout(100);
  assert(await clue.isVisible(), 'Esc on the Inspector’s Lock checkbox leaves the clue open');
  await lock.uncheck();

  // ---------- A box drawn beside the text's words, and Alt+drag ----------
  await addRect(1400, 700, 300, 200);
  await page.keyboard.press('Escape');
  const text0 = (await drawn())[0];
  await drag([200, 150], [1500, 800]);
  const afterBox = await drawn();
  assert(afterBox[0].x === text0.x && afterBox[0].y === text0.y, 'dragging beside the words doesn’t move the full-slide text box');
  assert((await page.locator('.side').innerText()).includes('2 items selected'), 'it draws a box that selects what it touches');
  await page.keyboard.press('Escape');
  await click(200, 150);
  assert((await insp.locator('h4', { hasText: 'Text box' }).count()) === 1, 'a click beside the words still selects the text box');
  await page.keyboard.press('Escape');
  await drag([1450, 750], [1800, 1000], { alt: true });
  const rect = (await drawn()).find((e) => e.w === 300);
  assert(rect.x === 1400 && rect.y === 700, 'Alt+drag starting on the rectangle draws a box instead of moving it');
  assert((await page.locator('.side').innerText()).includes('2 items selected'), 'and selects what the box touches (the rectangle and the text box)');

  // ---------- Snapping while resizing ----------
  await addRect(100, 100, 200, 100);
  await addRect(500, 300, 100, 300);
  // Pull the tall one's left edge to just right of the first one's right edge (x 300): it snaps there.
  await drag([500, 450], [306, 450]);
  assert(Number(await posField('X').inputValue()) === 300 && Number(await posField('W').inputValue()) === 300, 'a pulled edge snaps to another item’s edge (x 300)');
  await setNumber(posField('X'), 500);
  await setNumber(posField('W'), 100);

  // ---------- Line up several items, and space them evenly ----------
  await addRect(1000, 50, 300, 50);
  // The text box is locked, so Ctrl+A takes the four rectangles.
  await click(960, 540);
  await lock.check();
  // (The first Esc leaves the checkbox, the second deselects.)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  const side = await page.locator('.side').innerText();
  assert(side.includes('4 items selected'), 'Ctrl+A selects the four rectangles' + (side.includes('4 items') ? '' : ` (${side.slice(0, 80)})`));
  const rects = async () => (await drawn()).filter((e) => e.id !== text0.id);
  await page.getByRole('button', { name: 'Line up their top edges' }).click();
  assert(new Set((await rects()).map((e) => e.y)).size === 1 && (await rects())[0].y === 50, 'Top lines them up with the highest one (y 50), not the slide’s edge');
  await page.getByRole('button', { name: '↔ Space evenly' }).click();
  const xs = (await rects()).sort((a, b) => a.x - b.x);
  const gaps = xs.slice(1).map((e, i) => e.x - (xs[i].x + xs[i].w));
  assert(Math.max(...gaps) - Math.min(...gaps) <= 1 && xs[0].x === 100 && xs[3].x + xs[3].w === 1700, `Space evenly leaves equal gaps between them (${gaps.join(', ')})`);
  await page.keyboard.press('Delete');
  // (Clicks go through the locked text box: the Layers list unlocks it.)
  await page.locator('.layers .row').first().getByRole('button', { name: /^Unlock: / }).click();
  await shot('slideeditor-aligned');

  // ---------- Room for text effects ----------
  await click(960, 540);
  await insp.getByLabel('Outline').check();
  await setNumber(insp.locator('label.field', { hasText: 'Width' }).first().locator('input'), 40);
  const padding = await canvas.locator(`.slide .el[data-el="${text0.id}"] .text`).evaluate((e) => getComputedStyle(e).paddingLeft);
  assert(padding === '20px', `the box keeps room for a 40 px outline inside its edge (padding ${padding})`);

  // ---------- Typewriter ----------
  await insp.locator('textarea').fill('Hello world');
  await insp.getByLabel('Entrance animation').selectOption('typewriter');
  assert((await insp.getByLabel('Entrance animation').locator('option:checked').innerText()) === 'Typewriter (letter by letter)', 'a text box’s typewriter is called Typewriter (letter by letter)');
  const duration = insp.locator('label.field', { hasText: 'Duration (s)' }).locator('input');
  await setNumber(duration, 1.5);
  await page.getByRole('button', { name: '▶ Preview' }).click();
  const letters = canvas.locator('.tw');
  await letters.first().waitFor();
  const n = await letters.count();
  const early = await letters.last().evaluate((e) => getComputedStyle(e).opacity);
  assert(n === 11 && early === '0', `the preview types the 11 letters one by one (the last one isn't there yet)`);
  assert((await letters.last().evaluate((e) => e.style.animationDelay)) === '1.5s', 'the last letter comes as the duration ends');
  await page.waitForTimeout(1800);
  assert((await letters.last().evaluate((e) => getComputedStyle(e).opacity)) === '1', 'and is there after it');
  await page.keyboard.press('Escape');

  // ---------- Dropped at the edge, and the same file dropped again ----------
  const before = await mediaCount();
  await dropAt(await picture('big.png', 800, 600, '#ff0000'), 1900, 1070);
  const pic = (await drawn()).find((e) => e.img);
  assert(pic && pic.x + pic.w <= 1920 && pic.y + pic.h <= 1080 && pic.x >= 0 && pic.y >= 0, `a picture dropped at the corner stays on the slide (${pic?.x}, ${pic?.y})`);
  assert((await mediaCount()) === before + 1, 'it is in 🖼 Media');
  await dropAt(await picture('big copy.png', 800, 600, '#ff0000'), 600, 400);
  assert((await mediaCount()) === before + 1 && (await toast.innerText()).includes('already in 🖼 Media'), 'the same picture dropped again isn’t stored twice (the toast says it’s already in 🖼 Media)');
  await page.keyboard.press('Delete');

  // ---------- 🎨 Edit image › Apply after a turn keeps the picture in its box ----------
  const editPic = (await drawn()).find((e) => e.img);
  await click(editPic.x + editPic.w / 2, editPic.y + editPic.h / 2);
  await insp.getByRole('button', { name: '🎨 Edit image…' }).click();
  await page.getByRole('button', { name: '⟳ 90°' }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForTimeout(500);
  const turned = (await drawn()).find((e) => e.id === editPic.id);
  assert(
    turned.h === editPic.h && turned.w < editPic.w && Math.abs(turned.x + turned.w / 2 - (editPic.x + editPic.w / 2)) <= 1,
    `the turned picture fits inside its old box, centred where it was (${turned.w}×${turned.h})`,
  );

  // ---------- The History names these ----------
  await page.getByLabel('Slide background color').evaluate((i) => {
    i.value = '#333333';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  await clue.getByRole('button', { name: 'Close' }).click();

  // ---------- 🖼 Media › Replace redoes the edited picture's edits on the new file ----------
  await page.getByRole('button', { name: /^🖼 Media/ }).click();
  const card = page.locator('.card', { hasText: 'big.png' }).first();
  const chooser = page.waitForEvent('filechooser');
  await card.getByRole('button', { name: 'Replace…' }).click();
  const blue = await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 300);
    const g = c.getContext('2d');
    g.fillStyle = '#0000ff';
    g.fillRect(0, 0, 400, 300);
    return Array.from(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
  });
  await (await chooser).setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(blue) });
  await page.waitForTimeout(800);
  assert((await toast.innerText()).includes('edits of 1 edited picture done again'), 'Replace says the edited picture got its edits again');
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  await page.locator('.grid .tile').first().click();
  const shown = await canvas.locator(`.slide .el[data-el="${editPic.id}"] img`).evaluate(async (img) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return { w: img.naturalWidth, h: img.naturalHeight, px: Array.from(g.getImageData(1, 1, 1, 1).data.slice(0, 3)) };
  });
  assert(shown.w === 300 && shown.h === 400 && shown.px[2] > 200 && shown.px[0] < 50, `the slide shows the new (blue) file, turned as edited (${shown.w}×${shown.h})`);
  await clue.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /🕘 History/ }).click();
  const labels = (await page.locator('.hist .hr').allInnerTexts()).join('\n');
  assert(labels.includes('Slide background color #333333'), 'History: “Slide background color #333333”');
  assert(labels.includes('Added an outline to text box'), 'History: “Added an outline to text box …”');
  assert(!/\b\d+ changes\b/.test(labels), 'no “N changes” steps');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nSlide editor E2E passed.');
} finally {
  await browser.close();
}
