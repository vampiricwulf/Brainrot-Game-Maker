// End-to-end smoke test of the built single-file app, opened from disk (file://) like a user would.
// Usage: npm run build && npm run test:e2e   (SCREENSHOTS=dir to save screenshots)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// Keep the run hermetic: no third-party network (CI has internet, the dev sandbox doesn't).
await context.route(/(youtube(-nocookie)?\.com|ytimg\.com|googlevideo\.com|google\.com)/, (r) => r.abort());
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();

// On any failure, save a screenshot + Playwright trace to test-results/ (uploaded by CI).
let failing = false;
async function onFailure(e) {
  if (failing) return;
  failing = true;
  console.error(e);
  try {
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/failure.png', fullPage: true });
    await context.tracing.stop({ path: 'test-results/trace.zip' });
  } catch {
    /* best effort */
  }
  process.exit(1);
}
process.on('uncaughtException', onFailure);
process.on('unhandledRejection', onFailure);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
/** Set by answerDialog(): the step answers (and checks) the next dialog itself. */
let nextDialog = null;
/** Messages of the confirm() dialogs seen so far (all accepted, except those answerDialog() answers). */
const confirms = [];
page.on('dialog', (d) => {
  if (nextDialog) {
    const answer = nextDialog;
    nextDialog = null;
    return answer(d);
  }
  if (d.type() === 'prompt') return; // answered by the step that triggers it
  if (d.type() === 'alert') console.log('  [alert] ' + d.message());
  if (d.type() === 'confirm') confirms.push(d.message());
  d.accept();
});
/** Runs `action`, answers the confirm it raises (OK or Cancel) and returns its message ('' if none came). */
async function answerDialog(action, accept) {
  let message = null;
  nextDialog = (d) => {
    message = d.message();
    return accept ? d.accept() : d.dismiss();
  };
  await action();
  for (let i = 0; i < 20 && message === null; i++) await page.waitForTimeout(50);
  nextDialog = null;
  return message ?? '';
}

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
// Test media generated in memory.
import { deflateSync } from 'node:zlib';
/** Solid-ish RGB PNG of the given size (a horizontal gradient). */
function bigPng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round((x / w) * 255);
      raw[o + 1] = 80;
      raw[o + 2] = Math.round((y / h) * 255);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function png() {
  // 2×2 red PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
    'base64',
  );
}
function wav(seconds) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((i / rate) * 2 * Math.PI * 440));
  return b;
}
/** A one-second WebM clip, recorded in the page (node has no video encoder). */
async function webm() {
  const b64 = await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `hsl(${i * 12} 80% 50%)`;
      g.fillRect(0, 0, 160, 90);
      await new Promise((r) => setTimeout(r, 33));
    }
    rec.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  });
  return Buffer.from(b64, 'base64');
}
const shot = (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const scoreOf = (i) => page.locator('.panel .p').nth(i).locator('.score').innerText();
const tile = (i) => page.locator('.stage-box .board .tile').nth(i);
// Used tiles stay enabled in the host's view (so they can be right-clicked back), but are marked used.
const isUsed = (i) => tile(i).evaluate((e) => e.classList.contains('used') && e.getAttribute('aria-disabled') === 'true');

await page.goto(url);
// ℹ About: version, build and links; in a browser it explains the data stays in this browser (no folders).
await page.getByRole('button', { name: 'ℹ About' }).click();
const about = page.getByRole('dialog', { name: 'About Jeopardy Builder' });
const aboutText = await about.innerText();
assert(/Version\s+\d+\.\d+\.\d+ \(single HTML file\)/.test(aboutText) && /Build\s+(\w{7}, )?\d{4}-\d\d-\d\d/.test(aboutText), 'About shows the version and build');
assert(
  aboutText.includes("kept in this browser's storage") && (await about.getByRole('button', { name: '📂 Open folder' }).count()) === 0 && (await page.getByRole('status').filter({ hasText: 'folder on this PC' }).count()) === 0,
  'in a browser, About says the data stays in the browser (no folders, no desktop notice)',
);
await page.keyboard.press('Escape');
await about.waitFor({ state: 'detached' });
await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '＋ Add player' }).click();
assert((await page.locator('.player').count()) === 3, 'added 3 players');
const colors = await page.locator('.player input[type=color]').evaluateAll((els) => els.map((e) => e.value));
assert(new Set(colors).size === 3, 'players got unique colors');

await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
await page.locator('.cat textarea').first().fill('Memes');
await page.locator('.tile').first().click();
// Select the slide's main text box on the canvas, then type in the inspector.
async function typeOnSlide(text) {
  await page.locator('.canvas .hit').first().click();
  await page.locator('.insp textarea').fill(text);
}
await typeOnSlide('This frog became a meme');

// Resize with the right-middle handle: width grows, left edge stays put.
const posBox = page.locator('.insp section:has(h4:text("Position"))');
const num = (label) => posBox.getByLabel(label, { exact: true }).inputValue().then(Number);
const [x0, w0] = [await num('X'), await num('W')];
const h = page.locator('.frame .handle').nth(4).boundingBox();
const hb = await h;
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x - 100, hb.y + hb.height / 2, { steps: 5 });
await page.mouse.up();
const [x1, w1] = [await num('X'), await num('W')];
assert(x1 === x0 && w1 < w0, `resize handle shrinks width and keeps the left edge (w ${w0}→${w1}, x ${x0}→${x1})`);
// Rotated 90°: dragging the bottom-middle handle downward on screen should still be a sane resize.
await posBox.getByLabel('W', { exact: true }).fill('400');
await posBox.getByLabel('H', { exact: true }).fill('200');
await posBox.getByLabel('Rotation°').fill('90');
const wR = await num('W');
const cx0 = (await num('X')) + (await num('W')) / 2;
const hb2 = await page.locator('.frame .handle').nth(4).boundingBox();
await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
await page.mouse.down();
await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + 60, { steps: 5 });
await page.mouse.up();
const w2 = await num('W');
const cx1 = (await num('X')) + w2 / 2;
assert(w2 > wR && Math.abs(cx1 - cx0) < 2, `rotated resize grows along the element's own axis (w ${wR}→${w2}, center x steady)`);
await posBox.getByLabel('Rotation°').fill('0');
await posBox.getByLabel('W', { exact: true }).fill(String(w0));
await posBox.getByLabel('H', { exact: true }).fill('900');
await posBox.getByLabel('X', { exact: true }).fill(String(x0));
await posBox.getByLabel('Y', { exact: true }).fill('90');

// Media: upload an image and a short audio clip onto the question slide.
await page.getByRole('button', { name: '🖼 Image' }).click();
let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload image file…' }).click()]);
await fc.setFiles({ name: 'pepe.png', mimeType: 'image/png', buffer: bigPng(200, 100) });
await page.locator('.canvas img').waitFor();
assert(true, 'image added to the slide');

// Image editor: rotate 90°, flip, brighten, crop 1:1, meme text, sticker, brush → Apply.
await page.getByRole('button', { name: '🎨 Edit image…' }).click();
const ie = page.locator('[aria-label="Edit image"]');
await ie.locator('.canvas-host canvas').waitFor();
await ie.getByRole('button', { name: '⟳ 90°' }).click();
await ie.getByRole('button', { name: '⇋ Flip H' }).click();
await ie.locator('.slider', { hasText: 'Brightness' }).locator('input').fill('140');
await ie.getByRole('button', { name: '✂ Crop' }).click();
await ie.getByRole('button', { name: '1:1' }).click();
await ie.getByRole('button', { name: 'Done cropping' }).click();
// The preview re-renders in requestAnimationFrame: wait for the square (cropped) canvas, then
// measure positions at action time so clicks never use a stale layout.
await page.waitForFunction(() => {
  const c = document.querySelector('[aria-label="Edit image"] .canvas-host canvas');
  return !!c && c.width === c.height;
});
const imgbox = ie.locator('.imgbox');
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const at = async (fx, fy) => {
  await frames();
  const b = await imgbox.boundingBox();
  return { x: b.width * fx, y: b.height * fy };
};
await ie.getByRole('button', { name: '🅣 Text' }).click();
await imgbox.click({ position: await at(0.5, 0.2) });
await ie.locator('#ie-text').fill('WHEN THE FROG');
await ie.getByRole('button', { name: '😂 Sticker' }).click();
await imgbox.click({ position: await at(0.8, 0.8) });
assert((await ie.getByRole('button', { name: 'Delete sticker' }).count()) === 1, 'sticker placed on the image');
await ie.getByRole('button', { name: '🖌 Draw' }).click();
await imgbox.hover({ position: await at(0.03, 0.97) });
await page.mouse.down();
{
  const b = await imgbox.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
}
await page.mouse.up();
assert(await ie.getByRole('button', { name: 'Undo stroke' }).isEnabled(), 'brush stroke drawn');
await shot('1a-image-editor');
assert((await ie.locator('.muted.small').first().innerText()).includes('100×100'), 'image editor output is 100×100 after rotate + 1:1 crop');
await ie.getByRole('button', { name: 'Apply' }).click();
await ie.waitFor({ state: 'detached' });
const dims = await page.locator('.canvas img').first().evaluate((i) => new Promise((res) => (i.complete ? res([i.naturalWidth, i.naturalHeight]) : (i.onload = () => res([i.naturalWidth, i.naturalHeight])))));
assert(dims[0] === 100 && dims[1] === 100, `edited image replaces the original on the slide (${dims.join('×')})`);
// Double-clicking the image on the slide reopens the image editor.
const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];
await page.mouse.dblclick(...center(await page.locator('.canvas img').first().boundingBox()));
await ie.locator('.canvas-host canvas').waitFor();
assert((await ie.locator('#ie-text').count()) === 0 && (await ie.getByRole('button', { name: 'Use original' }).count()) === 1, 'double-click reopens the edits non-destructively (original kept)');
// Esc inside the caption field only leaves the field; the edits are still there.
await ie.getByRole('button', { name: '🅣 Text' }).click();
await imgbox.click({ position: await at(0.3, 0.92) });
await ie.locator('#ie-text').fill('BOTTOM TEXT');
await ie.locator('#ie-text').press('Escape');
assert((await ie.count()) === 1 && (await ie.locator('#ie-text').inputValue()) === 'BOTTOM TEXT', 'Esc in the caption field keeps the image editor open');
// Aspect-locked crop: the top edge handle works and every drag keeps the box square.
await ie.getByRole('button', { name: '✂ Crop' }).click();
await ie.getByRole('button', { name: '1:1' }).click();
const cropBox = () => ie.locator('.crop').boundingBox();
const c0 = await cropBox();
await page.mouse.move(...center(await ie.locator('.ch.n').boundingBox()));
await page.mouse.down();
await page.mouse.move(c0.x + c0.width / 2, c0.y + c0.height * 0.3, { steps: 4 });
await page.mouse.up();
const c1 = await cropBox();
assert(c1.height < c0.height - 10 && Math.abs(c1.width / c1.height - 1) < 0.03, `1:1 crop: dragging the top edge shrinks the box and keeps it square (${Math.round(c1.width)}×${Math.round(c1.height)})`);
await page.mouse.move(...center(await ie.locator('.ch.se').boundingBox()));
await page.mouse.down();
await page.mouse.move(c1.x + c1.width + 900, c1.y + c1.height + 40, { steps: 4 });
await page.mouse.up();
const c2 = await cropBox();
assert(Math.abs(c2.width / c2.height - 1) < 0.03, `1:1 crop stays square when dragged past the image edge (${Math.round(c2.width)}×${Math.round(c2.height)})`);
const seAt = center(await ie.locator('.ch.se').boundingBox());
await page.mouse.move(...seAt);
await page.mouse.down();
await page.mouse.move(seAt[0] - 80, seAt[1], { steps: 4 });
await page.mouse.up();
const c3 = await cropBox();
assert(
  c3.width < c2.width - 40 && Math.abs(c3.width / c3.height - 1) < 0.03 && Math.abs(c3.x - c2.x) < 2 && Math.abs(c3.y - c2.y) < 2,
  `1:1 crop: a corner dragged straight in shrinks the box, square, from the opposite corner (${Math.round(c2.width)} → ${Math.round(c3.width)}×${Math.round(c3.height)})`,
);
// Cancel asks before throwing the edits away, and the slide keeps the earlier result.
await ie.getByRole('button', { name: 'Cancel' }).click();
await ie.waitFor({ state: 'detached' });
assert(confirms.at(-1) === 'Discard your image edits?', 'Cancel with unsaved edits asks first');
const dims2 = await page.locator('.canvas img').first().evaluate((i) => [i.naturalWidth, i.naturalHeight]);
assert(dims2.join('×') === '100×100', 'cancelled edits leave the slide image as it was');
await page.getByRole('button', { name: '🔊 Audio' }).click();
[fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload audio file…' }).click()]);
await fc.setFiles({ name: 'beep.wav', mimeType: 'audio/wav', buffer: wav(3) });
await page.locator('.insp').getByText('Autoplay when the slide appears').waitFor();
await page.locator('.insp').getByLabel('Autoplay when the slide appears').uncheck();
assert(true, 'audio added with autoplay off');
await page.locator('.insp').getByLabel('Show a speaker icon on the slide').check();
await page.getByRole('tab', { name: /Answer/ }).click();
await typeOnSlide('Who is Pepe?');
await shot('1-clue-editor');
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Slide editor ergonomics, on a scratch clue (category 4, $400) ----------
await page.locator('.tile').nth(9).click();
const hits = () => page.locator('.canvas .hit').count();
const insp = page.locator('.insp');
const rect = (loc) => loc.evaluate((e) => e.getBoundingClientRect().toJSON());
// Laptop screens: the slide fits beside the inspector, fully on screen, never over the fields above it.
for (const [w, h] of [[1280, 720], [1366, 768], [1536, 864]]) {
  await page.setViewportSize({ width: w, height: h });
  await frames();
  const cv = await rect(page.locator('.canvas'));
  const notes = await rect(page.locator('.quick textarea').nth(2));
  const onTop = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.quick') !== null, [notes.x + notes.width / 2, notes.y + notes.height / 2]);
  assert(cv.bottom <= h && cv.top >= notes.bottom && onTop, `${w}×${h}: the slide canvas fits on screen and covers nothing (canvas ${Math.round(cv.top)}–${Math.round(cv.bottom)})`);
}
await page.setViewportSize({ width: 1400, height: 900 });
await frames();
// Double-click a text box: the cursor lands in its text field. Typing with the box selected goes there too.
await page.mouse.dblclick(...center(await page.locator('.canvas .hit').first().boundingBox()));
assert(await page.evaluate(() => document.activeElement === document.querySelector('.insp textarea')), 'double-clicking a text box puts the cursor in its text field');
await page.locator('.canvas .hit').first().click();
await page.keyboard.type('Typed');
assert((await insp.locator('textarea').inputValue()) === 'Typed', 'typing with a text box selected edits its text');
await page.locator('.canvas .hit').first().click();
const bold = insp.getByRole('button', { name: 'Bold' });
const boldWas = await bold.getAttribute('aria-pressed');
await page.keyboard.press('Control+b');
assert((await bold.getAttribute('aria-pressed')) !== boldWas, 'Ctrl+B toggles bold on the selected text');
await page.keyboard.press('Control+b');
const names = [...(await page.locator('.se').ariaSnapshot()).matchAll(/- button "([^"]*)"/g)].map((m) => m[1].trim());
const glyphs = names.filter((n) => [...new Intl.Segmenter().segment(n)].length <= 1);
assert(names.length > 20 && glyphs.length === 0, `slide editor buttons all have real names${glyphs.length ? ` (not: ${glyphs.join(' ')})` : ''}`);
// Shrink-to-fit follows new text at once, and shrinks a long word rather than breaking it.
const mainFit = () =>
  page.evaluate(() => {
    const t = document.querySelector('.canvas .text');
    const i = t.firstElementChild;
    return { fits: i.scrollHeight <= t.clientHeight, lines: Math.round(i.scrollHeight / parseFloat(getComputedStyle(i).lineHeight)), size: parseFloat(t.style.fontSize) };
  });
await page.locator('.quick textarea').first().fill('Which famous frog meme started life in a 2005 comic by Matt Furie, became a symbol of everything online, and then got its own documentary film about who owns a meme? Name it.');
let fit = await mainFit();
assert(fit.fits && fit.size < 110, `a 180-character question shrinks to fit straight away (${fit.size}px)`);
await page.locator('.canvas .hit').first().click();
assert(/showing \d+/.test(await insp.locator('.fitted').innerText()), 'the inspector shows the size the text is drawn at');
await page.locator('.quick textarea').first().fill('SUPERCALIFRAGILISTICEXPIALIDOCIOUS');
fit = await mainFit();
assert(fit.lines === 1, `a long word stays on one line (${fit.size}px)`);
await page.locator('.quick textarea').first().fill('Typed');

// Undo: pressed at once, it never skips the latest change, and it survives switching slides.
await page.getByRole('button', { name: '🅣 Text' }).click();
assert((await hits()) === 2, 'added a second text box');
// Shift pressed during a drag keeps the move on one axis. Held from the press, it only takes that
// item out of the selection: the rest of the selection doesn't move.
const secondBox = page.locator('.canvas .hit').last();
const [sx0, sy0] = [await num('X'), await num('Y')];
let from = center(await secondBox.boundingBox());
await page.mouse.move(...from);
await page.mouse.down();
await page.mouse.move(from[0] + 30, from[1] + 5, { steps: 2 });
await page.keyboard.down('Shift');
await page.mouse.move(from[0] + 90, from[1] + 25, { steps: 3 });
await page.mouse.up();
await page.keyboard.up('Shift');
assert((await num('X')) > sx0 + 20 && (await num('Y')) === sy0, 'Shift pressed during a drag keeps the move on one axis');
await page.keyboard.down('Shift');
await page.locator('.canvas .hit').first().click({ position: { x: 20, y: 20 } });
from = center(await secondBox.boundingBox());
await page.mouse.move(...from);
await page.mouse.down();
await page.mouse.move(from[0] + 80, from[1] + 40, { steps: 3 });
await page.mouse.up();
await page.keyboard.up('Shift');
assert(
  (await page.locator('.canvas .layer > .frame').count()) === 1 && (await num('X')) === 120 && (await num('Y')) === 90,
  'Shift+press on a selected item deselects it without dragging the rest',
);
await page.locator('.canvas .hit').last().click();
await page.keyboard.press('Delete');
await page.keyboard.press('Control+z');
assert((await hits()) === 2, 'Delete then an immediate Ctrl+Z brings the text box back');
await page.locator('.canvas .hit').last().click();
await page.keyboard.press('Delete');
assert((await page.locator('.notice').innerText()).includes('Deleted text box'), 'deleting says what was deleted');
await page.getByRole('tab', { name: /Answer/ }).click();
await page.getByRole('tab', { name: /Question/ }).click();
await page.keyboard.press('Control+z');
assert((await hits()) === 2, 'undo history survives switching to the answer slide and back');
await page.locator('.canvas .hit').last().click();
await page.keyboard.press('Delete');
await page.locator('.notice').getByRole('button', { name: 'Undo' }).click();
assert((await hits()) === 2, 'the Deleted notice has a working Undo button');
// Preview is look-only: keys don't edit the (hidden) selection.
await page.locator('.canvas .hit').last().click();
await page.getByRole('button', { name: '▶ Preview' }).click();
await page.keyboard.press('Backspace');
assert((await insp.count()) === 0, 'the inspector hides while previewing');
await page.keyboard.press('Escape');
assert((await page.getByRole('button', { name: '▶ Preview' }).count()) === 1 && (await hits()) === 2, 'Esc stops the preview, and Backspace during it deleted nothing');

// Preview plays sound: the audio clip and the video play unmuted, and stop with the preview.
await page.getByRole('button', { name: '🔊 Audio' }).click();
await page.locator('.picker .item', { hasText: 'beep.wav' }).click();
await page.getByRole('button', { name: '🎬 Video' }).click();
[fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload video file…' }).click()]);
await fc.setFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: await webm() });
await page.locator('.canvas video').waitFor();
const media = () => page.locator('.canvas audio, .canvas video');
await page.getByRole('button', { name: '▶ Preview' }).click();
await page.waitForFunction(() => [...document.querySelectorAll('.canvas audio, .canvas video')].every((m) => !m.paused && m.currentTime > 0));
assert((await media().evaluateAll((els) => els.map((m) => m.muted).join())) === 'false,false', 'preview plays the audio and the video with sound');
await page.getByRole('button', { name: '■ Stop preview' }).click();
assert(await media().evaluateAll((els) => els.every((m) => m.paused)), 'stopping the preview stops them');
await page.getByRole('button', { name: 'Preview sound is on' }).click();
await page.getByRole('button', { name: '▶ Preview' }).click();
assert((await media().evaluateAll((els) => els.map((m) => m.muted).join())) === 'true,true', 'the preview sound toggle mutes them');
await page.getByRole('button', { name: '■ Stop preview' }).click();
await page.getByRole('button', { name: 'Preview sound is off' }).click();
for (let i = 0; i < 2; i++) {
  await page.locator('.canvas .hit').last().click();
  await page.keyboard.press('Delete');
}
assert((await hits()) === 2, 'removed the audio and the video again');

// A full-bleed image: its rotate handle stays on screen; locked, it can't be deleted; Alt+click reaches what's under it.
await page.getByRole('button', { name: '🖼 Image' }).click();
await page.locator('.picker .item', { hasText: 'pepe.png' }).click();
for (const [k, v] of [['X', 0], ['Y', 0], ['W', 1920], ['H', 1080]]) await posBox.getByLabel(k, { exact: true }).fill(String(v));
const cvBox = await rect(page.locator('.canvas'));
const rot = await rect(page.locator('.frame .rot'));
assert(rot.top >= cvBox.top && rot.bottom <= cvBox.bottom && rot.left >= cvBox.left && rot.right <= cvBox.right, 'a full-bleed image keeps its rotate handle inside the canvas');
// The handles are drawn above the image's own hit box, so each one (the knob inside the image, the
// inner half of a resize handle) is what the pointer gets, even just off the slide on the pasteboard.
const onTopAt = (sel, dx, dy) =>
  page.locator(sel).evaluateAll(
    (els, [ox, oy]) =>
      els.every((el) => {
        const b = el.getBoundingClientRect();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const layer = el.closest('.layer').getBoundingClientRect();
        // Towards the element's centre by (dx, dy), or away from it when negative.
        const x = cx + Math.sign(layer.x + layer.width / 2 - cx) * ox;
        const y = cy + Math.sign(layer.y + layer.height / 2 - cy) * oy;
        return document.elementFromPoint(x, y) === el;
      }),
    [dx, dy],
  );
assert(await onTopAt('.frame .rot', 0, 0), "the rotate handle inside a full-bleed image isn't covered by the image");
assert(await onTopAt('.frame .handle', 4, 4), 'every resize handle can be grabbed on its inner half');
assert(await onTopAt('.frame .handle', -2, -2), 'and just off the slide (handles spill onto the pasteboard)');
const knobAt = center(await page.locator('.frame .rot').boundingBox());
await page.mouse.move(...knobAt);
await page.mouse.down();
await page.mouse.move(knobAt[0] + 150, knobAt[1] + 60, { steps: 5 });
await page.mouse.up();
assert((await num('Rotation°')) !== 0 && (await num('X')) === 0 && (await num('Y')) === 0, `dragging that handle rotates the image in place (${await num('Rotation°')}°)`);
await posBox.getByLabel('Rotation°').fill('0');
await posBox.getByLabel('Lock').check();
// Clicks on the slide go through a locked item, so select it in the Layers list (its top row).
await page.locator('.layers-box .row').first().locator('.name').click();
await page.keyboard.press('Delete');
assert((await hits()) === 3 && (await insp.getByText('Locked — unlock to delete').count()) === 1, 'a locked image survives Delete');
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
assert((await hits()) === 1, 'Ctrl+A then Delete skips the locked image');
await page.keyboard.press('Control+z');
assert((await hits()) === 3, 'and Ctrl+Z brings the text boxes back');
// Alt+click walks down everything under the pointer from the top, locked items included: first the
// locked image, then the text box under it.
const mid = center(await page.locator('.canvas .stage').boundingBox());
await page.keyboard.down('Alt');
await page.mouse.click(...mid);
assert((await insp.getByText('Locked — unlock to delete').count()) === 1, 'Alt+click reaches the locked image on top');
await page.mouse.click(...mid);
await page.keyboard.up('Alt');
assert((await insp.getByLabel('Text', { exact: true }).count()) === 1, 'Alt+click selects the text box under the image');
// "Use this style elsewhere" asks first and can be undone. A clue offers its category first (5 clues each).
const scopeBox = page.getByRole('combobox', { name: 'Which slides get this style' });
assert((await scopeBox.inputValue()) === 'cat-q', 'Use this style elsewhere starts on "Questions in this category"');
await scopeBox.selectOption('cat-qa');
await insp.getByRole('button', { name: 'Apply' }).click();
assert(/^Restyle the main text on (9|10) slides\?/.test(confirms.at(-1)), `"Questions + answers in this category" restyles that category's slides (${confirms.at(-1)})`);
await page.locator('.notice').getByRole('button', { name: 'Undo' }).click();
await page.getByRole('combobox', { name: 'Which slides get this style' }).selectOption('round-q');
await insp.getByRole('button', { name: 'Apply' }).click();
assert(/^Restyle the main text on \d+ slides\?/.test(confirms.at(-1)) && (await page.locator('.notice').innerText()).includes('Style applied'), 'Use this style elsewhere confirms, then offers Undo');
await page.locator('.notice').getByRole('button', { name: 'Undo' }).click();

// Copy/paste: the copy lands offset, Ctrl+X cuts, newer text or a link on the clipboard wins.
const xNow = () => posBox.getByLabel('X', { exact: true }).inputValue().then(Number);
const xCopied = await xNow();
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
assert((await hits()) === 4 && (await xNow()) === xCopied + 30, 'a pasted copy lands 30px down-right of the original');
await page.keyboard.press('Control+x');
assert((await hits()) === 3 && (await page.locator('.notice').innerText()).startsWith('Cut '), 'Ctrl+X cuts the selected item (and says so)');
const pasteText = (text, type = 'text/plain') =>
  page.evaluate(([t, ty]) => {
    const dt = new DataTransfer();
    dt.setData(ty, t);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, [text, type]);
await pasteText('Some newer words');
assert((await hits()) === 4 && (await insp.locator('textarea').inputValue()) === 'Some newer words', 'text copied elsewhere since pastes as that text, not the old items');
await pasteText('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
await page.locator('.canvas .card').waitFor();
assert((await hits()) === 5, 'a pasted YouTube link becomes a YouTube element');
// A picture dragged from another tab: a (mocked) file host that allows downloads, so a copy is saved in the game.
await context.route('https://media.example.test/**', (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: bigPng(160, 90) }),
);
await page.locator('.canvas').evaluate((c) => {
  const dt = new DataTransfer();
  dt.setData('text/uri-list', 'https://media.example.test/dropped.png');
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: r.x + 100, clientY: r.y + 100, bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => document.querySelectorAll('.canvas .hit').length === 6);
assert((await page.locator('.linkbox').count()) === 0, 'a link dropped from another tab adds its picture to the slide');
// Preview is look-only (the add buttons are off), a YouTube embed keeps its own clicks, and a click
// anywhere else on the slide goes back to editing.
await page.getByRole('button', { name: '▶ Preview' }).click();
assert(await page.getByRole('button', { name: '🅣 Text' }).isDisabled(), "the toolbar can't add items while previewing");
const ytFrame = await rect(page.locator('.canvas iframe'));
const ytHit = await page.evaluate(([x, y]) => {
  const e = document.elementFromPoint(x, y);
  return e ? `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}` : 'nothing';
}, [ytFrame.x + ytFrame.width * 0.75, ytFrame.y + ytFrame.height * 0.75]); // clear of the dropped image
assert(ytHit.startsWith('iframe'), `the YouTube embed can be clicked in the preview (${ytHit})`);
const cvNow = await rect(page.locator('.canvas'));
await page.mouse.click(cvNow.right - 4, cvNow.bottom - 4);
assert((await page.getByRole('button', { name: '▶ Preview' }).count()) === 1 && (await hits()) === 6, 'a click on the slide stops the preview');
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Keyboard-first clue entry: type, Tab, type, Ctrl+Enter (category 6) ----------
await page.locator('.tile').nth(5).click();
for (const n of [1, 2, 3]) {
  assert(await page.evaluate(() => document.activeElement?.getAttribute('placeholder') === 'Type the question…'), `clue ${n}: the Question field has focus`);
  await page.keyboard.type(`Q${n} question`);
  await page.keyboard.press('Tab');
  await page.keyboard.type(`A${n} answer`);
  if (n === 3) {
    // Clue 3's answer slide was never opened, yet the answer typed for it is an undo step there.
    await page.getByRole('tab', { name: /Answer/ }).click();
    const answerField = page.locator('.quick textarea').nth(1);
    await page.keyboard.press('Control+z');
    assert((await answerField.inputValue()) === '', 'Ctrl+Z on the answer slide undoes the answer typed while it was hidden');
    await page.keyboard.press('Control+y');
    assert((await answerField.inputValue()) === 'A3 answer', 'and Ctrl+Y puts it back');
    break;
  }
  await page.getByRole('tab', { name: /Answer/ }).click();
  await page.keyboard.press('Control+Enter');
  assert((await page.getByRole('tab', { name: /Question/ }).getAttribute('aria-selected')) === 'true', `Ctrl+Enter moves to the next clue on its Question slide`);
}
assert((await page.getByText('Click to type the question').count()) === 0, 'the empty-slide placeholder is gone once there is text');
await page.getByRole('button', { name: 'Done' }).click();
const col6 = await Promise.all([5, 11, 17].map((i) => page.locator('.tile').nth(i).innerText()));
assert(col6.every((t, i) => t.includes(`Q${i + 1} question`) && !t.includes('No answer')), 'three clues written from the keyboard show on the board with their answers');

// A second clue with a YouTube link (should fall back to "Open on YouTube" if it can't embed).
await page.locator('.tile').nth(1).click();
await page.getByRole('button', { name: '🌐 Link' }).click();
await page.locator('.linkbox').getByLabel('Paste a link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
await page.locator('.linkbox').getByLabel('Paste a link').press('Enter');
await page.locator('.canvas .card').waitFor();
assert(true, 'YouTube link added (editor shows a thumbnail card)');
await page.getByRole('button', { name: 'Done' }).click();

// The final round can be renamed.
await page.getByRole('button', { name: 'Final Jeopardy!', exact: true }).click();
await page.getByLabel('Name (shown on screen)').fill('Final Brainrot');
assert((await page.getByRole('button', { name: 'Final Brainrot', exact: true }).count()) === 1, 'final round renamed (editor nav follows)');

// The Final tab shows two slide editors: shortcuts, copy and paste reach only the one last clicked.
await page.getByLabel('Include a tiebreaker clue').check();
const finSe = page.locator('.se').nth(0);
const tbSe = page.locator('.se').nth(1);
const counts = async () => [await finSe.locator('.canvas .hit').count(), await tbSe.locator('.canvas .hit').count()].join(',');
await finSe.locator('.canvas .hit').first().click();
await finSe.locator('.insp textarea').fill('FINAL QUESTION TEXT');
await tbSe.locator('.canvas .hit').first().click();
await tbSe.locator('.insp textarea').fill('TIEBREAKER TEXT');
await finSe.locator('.canvas .hit').first().click();
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
assert((await counts()) === '2,1', 'Ctrl+C / Ctrl+V on the Final slide leave the tiebreaker alone');
await tbSe.locator('.canvas .hit').first().click();
await finSe.getByRole('button', { name: '🅣 Text' }).click();
await finSe.locator('.canvas .hit').last().click();
await page.keyboard.press('Delete');
assert((await counts()) === '2,1', "deleting on the Final slide doesn't delete the tiebreaker's earlier selection");
await finSe.getByRole('button', { name: '🖼 Image' }).click();
await page.locator('.picker .item', { hasText: 'pepe.png' }).click();
await page.mouse.dblclick(...center(await finSe.locator('.canvas img').boundingBox()));
await ie.getByRole('button', { name: '😂 Sticker' }).click();
await imgbox.click({ position: await at(0.5, 0.5) });
await page.keyboard.press('Delete');
assert((await ie.getByRole('button', { name: 'Delete sticker' }).count()) === 0 && (await counts()) === '3,1', 'Delete in an image editor opened from the Final only removes the sticker');
await ie.getByRole('button', { name: 'Cancel' }).click();
await ie.waitFor({ state: 'detached' });
// Working on the tiebreaker, then switching the Final's Question/Answer tab: the shortcuts follow to the Final.
await tbSe.locator('.canvas .hit').first().click();
await page.getByRole('tab', { name: 'Answer', exact: true }).click();
await page.keyboard.press('Control+a');
const picked = async (se) => se.locator('.layer > .frame').count();
assert((await picked(finSe)) === 1 && (await picked(tbSe)) === 0, "after switching the Final's tab, Ctrl+A selects on the Final, not the tiebreaker");
await page.getByRole('tab', { name: 'Question', exact: true }).click();
await page.getByLabel('Include a tiebreaker clue').uncheck();

// Theme: Brainrot Neon with the score bar on top.
await page.getByRole('button', { name: '🎨 Theme' }).click();
await page.getByRole('button', { name: /Brainrot Neon/ }).click();
await page.getByRole('combobox', { name: 'Score bar' }).selectOption('top');
await page.locator('.preview .board').waitFor();
const previewTile = await page.locator('.preview .board .tile').nth(1).evaluate((e) => getComputedStyle(e).backgroundColor);
assert(previewTile === 'rgb(22, 0, 46)', `theme preview uses the neon tile color (${previewTile})`);
await shot('2a-theme');

// A weighted "Punishment Wheel" (Bankrupt is ~certain) with a score effect, used by the 5th tile.
await page.getByRole('button', { name: '🎡 Wheels & Dice' }).click();
await page.getByRole('button', { name: '＋ New wheel' }).click();
await page.getByLabel('Wheel name').fill('Punishment Wheel');
await page.getByLabel('Spin (s)').fill('1');
const segs = page.locator('.seg');
await segs.nth(3).locator('button').last().click();
await segs.nth(2).locator('button').last().click();
await segs.nth(0).locator('input.label').fill('Bankrupt');
await segs.nth(0).locator('.w input').fill('100000');
await segs.nth(0).getByRole('button', { name: /More/ }).click();
await segs.nth(0).getByLabel(/Affects score/).check();
await segs.nth(0).locator('.more select').selectOption('setScore');
await segs.nth(1).locator('input.label').fill('Sing a song');
assert((await segs.count()) === 2, 'wheel editor: slices added/removed, weights and score effect set');
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
await page.locator('.tile').nth(4).click();
await page.getByLabel('Type').selectOption('wheel');
await page.getByLabel('Which wheel').selectOption({ label: 'Punishment Wheel' });
await page.getByRole('button', { name: 'Done' }).click();
assert((await page.locator('.tile').nth(4).innerText()).includes('🎡'), 'tile marked as a wheel tile');

// A Daily Double on the 4th tile.
await page.locator('.tile').nth(3).click();
await page.getByLabel('Type').selectOption('dailyDouble');
await page.getByRole('button', { name: 'Done' }).click();
assert((await page.locator('.tile').nth(3).innerText()).includes('DD'), 'tile marked as Daily Double in the editor');
await shot('2-round-editor');

await page.getByRole('button', { name: '▶ Play' }).click();
await page.getByRole('button', { name: 'Start game ▶' }).click();
// Round intro: title card → tiles fill in → categories revealed on N.
await page.locator('.round-name').waitFor();
assert((await page.locator('.round-name').evaluate((e) => getComputedStyle(e).color)) === 'rgb(57, 255, 20)', 'theme applies in play (neon values)');
assert((await page.locator('.round-name').innerText()) === 'Jeopardy!', 'round intro title card shows');
await page.locator('.title-card').click();
await page.locator('.board .tile').first().waitFor();
await page.getByRole('button', { name: /Reveal category 1 of/ }).waitFor();
assert(true, 'clicking the title card advances the intro');
assert((await page.locator('.board .header .title').count()) === 0, 'categories hidden until revealed');
await page.keyboard.press('n');
await page.locator('.board .header .title').first().waitFor();
assert((await page.locator('.board .header .title').count()) === 1, 'N reveals one category at a time');
await page.getByRole('button', { name: 'Skip intro' }).click();
assert((await page.locator('.board .header .title').count()) === 6, 'skip intro shows the full board');
assert((await page.locator('.score-area.bar-top').count()) === 1, 'score bar sits on top per the theme');
await shot('3-board');

await page.locator('.board .tile').first().click();
await page.locator('.full').waitFor();
assert(await page.getByText('This frog became a meme').isVisible(), 'question shown');
assert(await page.locator('.full img').isVisible(), 'question image shown');
await page.locator('.mc .item').waitFor();
assert(true, 'host media controls list the audio clip');
await page.locator('.mc .item button').first().click();
await page.waitForFunction(() => document.querySelector('.mc .item button')?.textContent?.includes('⏸'));
assert(true, 'audio plays from the host controls');
await page.locator('.mc .item button').first().click();
await page.waitForFunction(() => document.querySelector('.mc .item button')?.textContent?.includes('▶'));
// The sound's icon on the slide plays and pauses it; it doesn't reveal the answer.
const soundIcon = page.locator('.stage-box .full button.icon');
await soundIcon.click();
await page.waitForFunction(() => document.querySelector('.mc .item button')?.textContent?.includes('⏸'));
assert((await page.getByText('Who is Pepe?').count()) === 0, "clicking the slide's sound icon plays it, without revealing the answer");
await page.waitForTimeout(500); // past the double-click guard
await soundIcon.click();
await page.waitForFunction(() => document.querySelector('.mc .item button')?.textContent?.includes('▶'));
assert((await page.getByText('Who is Pepe?').count()) === 0, 'clicking it again pauses it');
assert((await page.getByText('Who is Pepe?').count()) === 0, 'answer is not in the page before reveal');

await page.keyboard.press('1');
await page.keyboard.press('2');
await page.locator('.award input').fill('350');
await page.locator('.award input').press('Enter');
assert((await scoreOf(0)) === '$350' && (await scoreOf(1)) === '$350', 'custom amount awarded to two players');
assert((await scoreOf(2)) === '$0', 'third player untouched');
// Enter in the Amount box hands the keys back: the next number selects a player instead of typing "3502".
await page.keyboard.press('2');
assert((await page.locator('.award input').inputValue()) === '350', 'Amount keeps 350 after Enter (the box lets go of the keys)');
assert((await page.locator('.panel .p').nth(1).locator('.sel').getAttribute('aria-pressed')) === 'true', 'the next number key selects player 2');
await page.keyboard.press('2');
assert(await page.getByText('Pick who answered').isVisible(), 'with nobody selected the panel explains how to score');
await page.keyboard.press('Enter');
await page.getByText('Select a player first').waitFor();
assert(true, 'Enter with nobody selected says why nothing happened');
await page.locator('.panel .p').nth(2).locator('.wrong').click();
assert((await scoreOf(2)) === '−$200', 'quick wrong deducts the clue value');
// One-click correct: awards the value and makes that player the picker.
await page.locator('.panel .p').nth(1).locator('.right').click();
assert((await scoreOf(1)) === '$550', 'quick ✔ awards the clue value to one player');
assert(await page.locator('.panel .p').nth(1).evaluate((e) => e.classList.contains('picker')), 'the player marked right becomes the picker (★)');
await page.keyboard.press('Control+z');
assert((await scoreOf(1)) === '$350', 'Ctrl+Z takes the quick ✔ back');
assert((await page.locator('.toast').innerText()).includes('Undid +$200 (Player 2)'), 'the undo toast says what was undone');
assert(
  (await page.locator('.toast button').count()) === 0 && (await page.locator('.toast').evaluate((e) => getComputedStyle(e).pointerEvents)) === 'none',
  'the toast has no buttons and lets clicks through to the host nav row under it',
);
// Points were given for this clue, so it can't be cancelled back onto the board (it could be scored twice).
assert(await page.getByRole('button', { name: '↩ Cancel (keep tile)' }).isDisabled(), 'Cancel (keep tile) is off once points were given');
await page.keyboard.press('Shift+Escape');
await page.getByText('Points were given for this clue').waitFor();
assert((await page.locator('.stage-box .full').count()) === 1, 'Shift+Esc keeps a scored clue open and says why');
await shot('4-clue-scored');

await page.locator('.stage-box .full').click();
await page.getByText('Who is Pepe?').waitFor();
assert(true, 'clicking the question slide reveals the answer');
await page.waitForTimeout(500); // past the double-click guard
await page.keyboard.press('r');
await page.getByText('This frog became a meme').waitFor();
assert((await page.getByText('Who is Pepe?').count()) === 0, 'R hides an accidentally revealed answer again');
await page.getByRole('button', { name: '👁 Reveal answer' }).click();
await page.getByText('Who is Pepe?').waitFor();
assert(await page.getByRole('button', { name: '🙈 Hide answer' }).isVisible(), 'reveal button turns into Hide answer');
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();
assert(await isUsed(0), 'tile marked used after returning to board');
// A used tile can be put back: right-click it on the host's board (no browser menu), then play it again.
await tile(0).click({ button: 'right', force: true });
assert(!(await isUsed(0)), 'right-clicking a used tile puts it back on the board');
assert((await page.locator('.toast').innerText()).includes('Memes $200 is back on the board'), 'reopening says which tile came back');
await tile(0).click();
await page.locator('.full').waitFor();
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();
assert(await isUsed(0), 'the reopened tile is used again after playing it');
await tile(0).click({ force: true });
assert((await page.locator('.full').count()) === 0, 'clicking a used tile does nothing');

// YouTube tile: either it embeds, or the host gets the "Open on YouTube" fallback.
await page.locator('.board .tile').nth(1).click();
await page.locator('.mc .item').waitFor();
await page.waitForFunction(() => /Open on YouTube|↗/.test(document.querySelector('.mc')?.textContent ?? ''), null, { timeout: 15000 });
assert(true, 'YouTube clue offers the Open-on-YouTube button to the host');
await shot('5b-youtube');
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();
// A misclicked tile can be cancelled without using it up (Shift+Esc or the Cancel button).
await tile(2).click();
await page.locator('.full').waitFor();
await page.keyboard.press('Shift+Escape');
await page.locator('.board').waitFor();
assert(!(await isUsed(2)), 'Shift+Esc cancels a clue and keeps its tile playable');
await page.getByRole('button', { name: /↶ Reopen Category 2/ }).waitFor();
assert(true, 'the host panel offers to reopen the last tile closed');
// Picking from "Reopen a tile…" gives the keys back: shortcuts work, and arrow keys don't reopen another tile.
const reopenSel = page.locator('select[aria-label="Reopen a used tile"]');
await reopenSel.focus();
await page.keyboard.press('ArrowDown');
await page.waitForFunction(() => !document.querySelectorAll('.stage-box .board .tile')[0].classList.contains('used'));
assert(await page.evaluate(() => document.activeElement?.tagName !== 'SELECT'), 'picking a tile to reopen takes focus off the list');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
assert(await isUsed(1), 'a later arrow key reopens nothing else');
await page.keyboard.press('1');
assert((await page.locator('.panel .p').nth(0).locator('.sel').getAttribute('aria-pressed')) === 'true', 'number keys work right after reopening from the list');
await page.keyboard.press('1');
await tile(0).click();
await page.locator('.full').waitFor();
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();

await page.keyboard.press('Control+z');
assert((await scoreOf(2)) === '$0', 'Ctrl+Z undoes the last score change');
// Esc while editing a score cancels the edit.
await page.locator('.panel .p').nth(2).locator('.score').click();
await page.keyboard.type('777');
await page.keyboard.press('Escape');
assert((await scoreOf(2)) === '$0', 'Esc while editing a score leaves it unchanged');
await shot('5-board-after');

// Crash recovery: reload and resume.
await page.waitForTimeout(300);
await page.reload();
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
await page.getByRole('button', { name: 'Resume game' }).click();
await page.locator('.board').waitFor();
assert((await scoreOf(0)) === '$350', 'scores survive a reload');
assert(await isUsed(0), 'used tiles survive a reload');

// Dual-window mode: the audience window never shows the answer before reveal.
const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
await aud.locator('.board').waitFor();
assert(true, 'audience window opened and synced the board');
await page.keyboard.press('a');
await page.waitForTimeout(300);
assert(!aud.isClosed(), 'A never closes the audience window (it only opens or focuses it)');
await page.locator('.board .tile').nth(2).click();
await page.locator('.info .a').waitFor();
assert((await page.locator('.info .a').innerText()) === '—', 'host info panel shows the answer slot');
await aud.locator('.full').waitFor();
assert((await page.getByText(/Click to type/).count()) + (await aud.getByText(/Click to type/).count()) === 0, "an empty slide shows no editor placeholder in play");
await page.keyboard.press('1');
await page.keyboard.press('Enter');
await aud.getByText('+$200').waitFor();
assert(true, 'score pop shows in the audience window');
await page.keyboard.press('Escape');
await aud.locator('.board').waitFor();
await aud.locator('.board .tile.used').nth(1).waitFor();
assert(await aud.locator('.board .tile').nth(2).evaluate((e) => e.classList.contains('used')), 'audience board shows the used tile');
if (shots) await aud.screenshot({ path: `${shots}/6-audience.png` });
if (shots) await page.screenshot({ path: `${shots}/7-host-dual.png` });
const closeMsg = await answerDialog(() => page.getByRole('button', { name: '📺 Close audience window' }).click(), true);
assert(closeMsg.includes('stream capture will go black'), 'closing the audience window asks first');
if (!aud.isClosed()) await aud.waitForEvent('close', { timeout: 3000 });
assert(aud.isClosed(), 'audience window closes from the host');

// Wheel tile: the wheel opens full-screen; spin lands on the heavy slice; its score effect can be skipped.
await page.locator('.board .tile').nth(4).click();
await page.locator('.ov .wheel').waitFor();
assert(true, 'wheel tile opens the wheel overlay');
await page.locator('.stage-box .ov').click();
await page.locator('.tc .result').waitFor({ timeout: 8000 });
assert((await page.locator('.tc .result').innerText()).includes('Bankrupt'), 'weighted spin lands on the heavy slice');
await page.locator('.ov .card').waitFor();
assert((await page.locator('.ov .card .label').innerText()) === 'Bankrupt', 'result card revealed on screen');
await page.locator('.tc .chip', { hasText: 'Player 3' }).first().click();
await page.locator('.ac').waitFor();
await page.locator('.ac').getByRole('button', { name: 'Skip' }).click();
assert((await scoreOf(0)) === '$550', 'skipping the score effect changes nothing');
await shot('10-wheel');
await page.waitForTimeout(500);
await page.locator('.stage-box .ov').click();
await page.locator('.ov').waitFor({ state: 'detached' });
assert(true, 'clicking the landed wheel closes it');
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();

// Daily Double: splash, wager (TV cap), then the question with the wager prefilled.
await page.locator('.board .tile').nth(3).click();
await page.locator('.dd-text').waitFor();
assert(true, 'Daily Double splash shows');
// Esc on the splash backs out without burning the Daily Double (the question never showed).
await page.locator('.stage-box .dd-text').click();
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();
assert(!(await isUsed(3)), 'Esc on the Daily Double splash keeps the tile');
await tile(3).click();
await page.locator('.dd-text').waitFor();
await page.locator('.dd .chip', { hasText: 'Player 2' }).click();
await page.locator('.dd input[type=number]').fill('99999');
assert(await page.getByRole('button', { name: 'Show question ▶' }).isDisabled(), 'wager over the cap is blocked');
await page.locator('.dd input[type=number]').fill('500');
await page.getByRole('button', { name: 'Show question ▶' }).click();
await page.locator('.dd-badge').waitFor();
assert((await page.locator('.award input').inputValue()) === '500', 'wager prefilled as the amount');
await page.keyboard.press('Enter');
assert((await scoreOf(1)) === '$850', 'Daily Double wager awarded to the chosen player');

// Timer: start a 1-second countdown and see TIME'S UP.
await page.locator('.tc input').fill('1');
await page.locator('.tc button', { hasText: 'Start 1s' }).click();
await page.locator('.timer').waitFor();
await page.getByText("TIME'S UP!").waitFor({ timeout: 5000 });
assert(true, "countdown runs out and shows TIME'S UP");
// A double-click on "Done ▶ board" never reaches the round navigation (it sits elsewhere, and is guarded).
await page.getByRole('button', { name: '▦ Done ▶ board' }).dblclick();
await page.locator('.board').waitFor();
await page.waitForTimeout(300);
assert((await page.locator('.final-label').count()) === 0 && (await page.locator('.round-name').count()) === 0, 'double-clicking Done stays on this round');
if (await page.locator('.nav > .backdrop').count()) await page.locator('.nav > .backdrop').click();

// Moving on with tiles left takes an inline second click.
await page.waitForTimeout(450); // round buttons ignore clicks right after they appear
await page.getByRole('button', { name: 'Final Brainrot ▶' }).click();
await page.getByText('25 clues left · go on?').waitFor();
assert((await page.locator('.final-label').count()) === 0, 'Final Brainrot ▶ with tiles left asks before moving on');
assert((await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel', 'keyboard focus moves to Cancel while it asks');
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.getByRole('button', { name: 'Final Brainrot ▶' }).click();
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Yes', exact: true }).click();
await page.locator('.final-label').waitFor();
// …and it can be undone: back to the board without a second round intro.
await page.getByRole('button', { name: '◀ Back to Jeopardy!' }).click();
await page.locator('.board').waitFor();
assert((await page.locator('.round-name').count()) === 0 && (await page.locator('.board .header .title').count()) === 6, 'back from Final shows the board again, no intro');
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Final Brainrot ▶' }).click();
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Yes', exact: true }).click();

// Final Jeopardy: eligible players, private wagers, one-by-one reveal.
await page.locator('.final-label').waitFor();
assert((await page.locator('.final-label').innerText()) === 'FINAL BRAINROT', 'renamed final round shows on screen');
const eligible = await page.locator('.fj input[type=checkbox]:checked').count();
assert(eligible === 2, 'players with $0 sit out of Final by default');
await page.getByRole('button', { name: /take wagers/ }).click();
await page.getByText('Make your wagers…').waitFor();
const wagers = page.locator('.fj .wagers input');
await wagers.nth(0).fill('300');
await wagers.nth(1).fill('0');
await page.getByRole('button', { name: 'Show question ▶' }).click();
await page.locator('.timer').waitFor();
assert(true, 'Final question starts the think timer');
await page.getByRole('button', { name: 'Reveal answer ▶' }).click();
await page.locator('.fj').getByRole('button', { name: '🙈 Hide answer' }).click();
await page.getByRole('button', { name: 'Reveal answer ▶' }).waitFor();
assert(true, 'final answer can be hidden again');
await page.waitForTimeout(500);
await page.locator('.stage-box .full').click();
await page.getByRole('button', { name: 'Start player reveals ▶' }).waitFor();
assert(true, 'clicking the final question reveals its answer');
await page.getByRole('button', { name: 'Start player reveals ▶' }).click();
await page.locator('.spot').waitFor();
assert((await page.locator('.spot-wager').innerText()).includes('???'), 'wager hidden until shown');
const rows = page.locator('.fj .pl');
await rows.nth(0).getByRole('button', { name: '✔ Right' }).click();
// N moves the spotlight on; it never ends the game while players are unjudged.
await page.keyboard.press('n');
await page.waitForFunction(() => document.querySelector('.spot-name')?.textContent === 'Player 2');
assert((await page.locator('.end h1').count()) === 0, 'N in the reveals spotlights the next player instead of ending the game');
const finishMsg = await answerDialog(async () => {
  await page.getByRole('button', { name: 'Finish game ▶' }).click();
  await page.getByText('1 player not judged yet · finish anyway?').waitFor();
}, false);
assert(finishMsg === '' && (await page.locator('.end h1').count()) === 0, 'Finish with a player unjudged asks first, inline (no browser dialog on stream)');
await page.getByRole('button', { name: 'Keep judging' }).click();
assert((await page.locator('.spot').count()) === 1 && (await page.getByRole('button', { name: 'Finish game ▶' }).isVisible()), 'Keep judging keeps the reveals going');
await page.keyboard.press('n');
await page.waitForFunction(() => document.querySelector('.spot-wager')?.textContent?.includes('Wagered'));
assert(true, 'N shows the spotlit player’s wager');
await page.keyboard.press('x');
await shot('8-final-reveal');
assert((await page.locator('.spot-result').innerText()).includes('WRONG'), 'X marks the spotlit player wrong');
await page.keyboard.press('n');
await page.locator('.fj .armed').waitFor();
assert((await page.locator('.end h1').count()) === 0, 'with everyone judged, the first N only arms finishing');
await page.keyboard.press('n');
await page.locator('.end h1').waitFor();
assert(true, 'a second N finishes the game');
// A judgment can still be fixed from the end screen.
await page.getByRole('button', { name: '◀ Back to final reveals' }).click();
await page.locator('.spot').waitFor();
assert(await page.getByRole('button', { name: 'Finish game ▶' }).isVisible(), 'the end screen goes back to the final reveals');
await page.getByRole('button', { name: 'Finish game ▶' }).click();
await page.locator('.end h1').waitFor();
assert((await page.locator('.panel .p').count()) === 3, 'score chips stay on the end screen so scores can be fixed');
// P1 550+300 = 850 ties P2 850-0 = 850.
assert(await page.getByText('Tie for first:').isVisible(), 'tie for first is detected');
await page.getByRole('button', { name: '🤝 Declare co-winners' }).click();
await page.waitForFunction(() => document.querySelector('.end h1')?.textContent?.includes("It's a tie"));
assert(true, 'co-winners declared on the winner screen');
await shot('9-winner');

// Tools work any time: wheel from the launcher with a confirmed score effect (undoable).
await page.getByRole('button', { name: '🎡 Wheel' }).click();
// A '?' typed into a text box is just a question mark, not the shortcuts list.
await page.locator('.tl textarea').click();
await page.keyboard.type('Who is next?');
assert((await page.locator('[aria-label="Keyboard shortcuts"]').count()) === 0, "typing '?' in the quick-wheel box doesn't open the shortcuts");
await page.locator('.tl textarea').fill('');
await page.getByRole('button', { name: 'Punishment Wheel', exact: true }).click();
await page.getByRole('button', { name: 'Spin!' }).click();
await page.locator('.ac').waitFor({ timeout: 8000 });
const deltaText = await page.locator('.ac .delta').first().innerText();
await page.locator('.ac').getByRole('button', { name: 'Confirm' }).click();
assert(/−\$850/.test(deltaText), `bankrupt previews the change (${deltaText}) and applies on Confirm`);
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
assert(await page.getByText('$850').first().isVisible(), 'score effect is undoable like any score change');

// Dice: quick 2d6 shows a total.
await page.getByRole('button', { name: '🎲 Dice' }).click();
await page.getByRole('button', { name: '2d6' }).click();
await page.getByText(/^Total: \d+$/).waitFor({ timeout: 5000 });
assert(true, 'quick 2d6 roll shows the total');
await page.keyboard.press('Escape');

// The built-in player wheel: a slice per player; the host can make the winner the picker.
await page.getByRole('button', { name: '🎡 Wheel' }).click();
await page.getByRole('button', { name: '🎯 Pick a player' }).click();
const slices = await page.locator('.stage-box svg text').allTextContents();
assert(slices.join() === 'Player 1,Player 2,Player 3', `the player wheel has a slice per player (${slices.join(', ')})`);
await page.getByRole('button', { name: 'Spin!' }).click();
const makePicker = page.getByRole('button', { name: /^★ Make .+ the picker$/ });
const pickedWheel = page.getByText(/^★ .+ picks the next clue\.$/);
await makePicker.or(pickedWheel).waitFor({ timeout: 10000 });
const wheelPick = (await page.locator('.tc .result b').innerText()).trim();
if (await makePicker.count()) await makePicker.click();
await page.getByText(`★ ${wheelPick} picks the next clue.`).waitFor();
const pickerIdx = await page.locator('.panel .p').evaluateAll((els) => els.findIndex((e) => e.classList.contains('picker')));
assert(pickerIdx >= 0 && (await page.locator('.panel .p').nth(pickerIdx).innerText()).includes(wheelPick), `the wheel landed on ${wheelPick}, who is now the picker`);
await page.keyboard.press('Escape');

// ✎ Edit a wheel for one spin: leave players out, and the saved wheels stay as they are unless saved.
const sliceTexts = () => page.locator('.stage-box svg text').allTextContents();
const wheelMenu = async () => {
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  return page.locator('.tl .menu');
};
await (await wheelMenu()).getByRole('button', { name: 'Edit Pick a player, then spin' }).click();
const editBox = page.getByRole('group', { name: 'Edit this wheel' });
await editBox.getByLabel('Include Player 1').uncheck();
await editBox.getByLabel('Include Player 3').uncheck();
assert((await sliceTexts()).join() === 'Player 2' && (await editBox.locator('.pct').allInnerTexts()).join() === '—,100%,—', 'unticking players takes them off the wheel, and the chances follow');
await page.getByRole('button', { name: 'Spin!' }).click();
await page.getByText('★ Player 2 picks the next clue.').or(page.getByRole('button', { name: '★ Make Player 2 the picker' })).waitFor({ timeout: 10000 });
assert(true, 'the edited player wheel can only land on the players left on it');
await page.keyboard.press('Escape');
await (await wheelMenu()).getByRole('button', { name: '🎯 Pick a player' }).click();
assert((await sliceTexts()).length === 3, 'the edits were for that spin only: the player wheel has everyone again');
await page.keyboard.press('Escape');
// A saved wheel: change it for one spin, then Save as a new wheel; the original is untouched.
await (await wheelMenu()).getByRole('button', { name: 'Punishment Wheel', exact: true }).click();
const punishment = await sliceTexts();
await page.keyboard.press('Escape');
await (await wheelMenu()).getByRole('button', { name: 'Edit Punishment Wheel, then spin' }).click();
await editBox.getByLabel(`Include ${punishment[0]}`).uncheck();
assert((await sliceTexts()).length === punishment.length - 1, 'a saved wheel can lose a slice for this spin');
nextDialog = (d) => d.accept('Punishment lite');
await editBox.getByRole('button', { name: '💾 Save as new wheel…' }).click();
await page.getByRole('button', { name: 'Overwrite "Punishment lite"' }).waitFor();
assert(true, 'Save as new wheel makes a saved wheel (and the one on screen becomes it)');
await page.keyboard.press('Escape');
await (await wheelMenu()).getByRole('button', { name: 'Punishment Wheel', exact: true }).click();
assert((await sliceTexts()).join() === punishment.join(), 'the original wheel is unchanged');
await page.keyboard.press('Escape');
// Overwrite: the saved copy gets a new slice for good.
await (await wheelMenu()).getByRole('button', { name: 'Edit Punishment lite, then spin' }).click();
await editBox.getByRole('button', { name: '＋ Add slice' }).click();
await editBox.getByLabel('Slice 2 label').fill('Dance');
await editBox.getByLabel('Slice 2 label').press('Enter');
await answerDialog(() => editBox.getByRole('button', { name: 'Overwrite "Punishment lite"' }).click(), true);
await page.keyboard.press('Escape');
await (await wheelMenu()).getByRole('button', { name: 'Punishment lite', exact: true }).click();
assert((await sliceTexts()).join() === [...punishment.slice(1), 'Dance'].join(), 'Overwrite keeps the edits in that saved wheel');
await page.keyboard.press('Escape');
// Quick wheel lines can carry a weight.
const menuNow = await wheelMenu();
await menuNow.getByLabel('Quick wheel options').fill('Rare\nCommon x3');
await menuNow.getByRole('button', { name: '✎ Open & edit' }).click();
assert((await editBox.locator('.pct').allInnerTexts()).join() === '25%,75%', '"x3" on a quick wheel line makes it three times as likely');
await page.keyboard.press('Escape');

// Roll-off: everyone rolls; the winner becomes the current picker.
await page.keyboard.press('o');
await page.getByText(/goes first!/).waitFor({ timeout: 20000 });
const winnerName = (await page.locator('.win span').innerText()).trim();
await page.keyboard.press('Escape');
await page.getByRole('button', { name: '📜 Log' }).click();
await page.getByRole('button', { name: /Rolls \(/ }).click();
const rollsText = await page.locator('aside .list').innerText();
assert(rollsText.includes('goes first') && rollsText.includes('Punishment Wheel') && rollsText.includes('2d6') && rollsText.includes('Pick a player'), 'roll log lists the wheels, dice and roll-off');
assert(rollsText.includes('For: Player 3'), 'roll log keeps the "who it was for" tag');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: '📊 Scores' }).click();
await page.locator('.ov .sb').waitFor();
assert(true, 'scoreboard overlay toggles on');
await page.getByRole('button', { name: '📊 Scores' }).click();
await page.waitForTimeout(300);
const pickerName = await page.evaluate(
  () =>
    new Promise((res) => {
      const q = indexedDB.open('keyval-store');
      q.onsuccess = () => {
        const g = q.result.transaction('keyval').objectStore('keyval').get('playSession');
        g.onsuccess = () => {
          const s = g.result.session;
          res(s.players.find((p) => p.id === s.currentPickerId)?.name);
        };
      };
    }),
);
assert(pickerName === winnerName, `roll-off winner (${winnerName}) is the current picker (${pickerName})`);

// Game over: share the standings, then a rematch with the same players.
await page.evaluate(() =>
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => void (window.__copied = t) } }),
);
await page.getByRole('button', { name: '📋 Copy results' }).click();
const copied = await page.evaluate(() => window.__copied);
assert(
  copied?.startsWith('🏆 Untitled Game (co-winners): 🥇 Player') && copied.match(/🥇 Player \d \$850/g)?.length === 2,
  `Copy results puts the standings on the clipboard, co-winners sharing 🥇 (${copied})`,
);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
assert((await page.getByText('Select a player first').count()) === 0, 'Enter on the end screen (no award row) does nothing');
// Rematch, then back out: the finished game can still be viewed from the editor.
await page.getByRole('button', { name: '🔁 Rematch' }).click();
await page.getByRole('button', { name: '◀ Back to editor' }).click();
await page.getByRole('button', { name: 'View results' }).click();
await page.locator('.end h1').waitFor();
assert(true, 'after Rematch → Back to editor, View results brings the finished game back');
await page.getByRole('button', { name: '🔁 Rematch' }).click();
await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
const rematchNames = await page.locator('.pregame .player input.name').evaluateAll((els) => els.map((e) => e.value));
const rematchStarts = await page.locator('.pregame .player .score input').evaluateAll((els) => els.map((e) => e.value));
assert(rematchNames.join() === 'Player 1,Player 2,Player 3' && rematchStarts.every((v) => v === '0'), 'Rematch goes to pre-game with the same players at 0');
await page.getByRole('button', { name: 'Start game ▶' }).click();
await page.getByRole('button', { name: 'Skip intro' }).click();

// Removing a player mid-game asks first and can be undone.
await page.getByRole('button', { name: '👥 Players' }).click();
await page.getByRole('button', { name: 'Remove Player 3' }).click();
const removeAsk = page.locator('.modal .ask');
await removeAsk.waitFor();
assert((await removeAsk.innerText()).startsWith('Remove Player 3 ($0)?') && (await page.locator('.panel .p').count()) === 3, 'removing a player mid-game asks first (inline)');
await removeAsk.getByRole('button', { name: 'Remove', exact: true }).click();
assert((await page.locator('.panel .p').count()) === 2, 'the removed player leaves the host panel');
await page.getByRole('button', { name: '↩ Restore' }).click();
assert((await page.locator('.panel .p').count()) === 3, 'a removed player can be restored');
await page.getByRole('button', { name: 'Done', exact: true }).click();

// Leaving a game keeps it, and the next game starts clean (no leftover overlay or countdown).
await page.keyboard.press('s');
await page.keyboard.press('t');
await page.locator('.ov .sb').waitFor();
await page.locator('.timer').waitFor();
const exitMsg = await answerDialog(() => page.getByRole('button', { name: 'Exit' }).click(), true);
assert(exitMsg.includes('You can resume it'), 'Exit says the game can be resumed');
await page.getByRole('button', { name: 'Resume game' }).waitFor();
assert(true, 'after Exit the editor offers to resume the game');
const replaceMsg = await answerDialog(() => page.getByRole('button', { name: '▶ Play' }).click(), true);
assert(replaceMsg.includes('can still be resumed'), 'Play with a saved game in progress asks first');
await page.getByText('Starting replaces the saved game in progress').waitFor();
await page.getByRole('button', { name: 'Start game ▶' }).click();
await page.getByRole('button', { name: 'Skip intro' }).click();
await page.locator('.board').waitFor();
assert((await page.locator('.ov').count()) === 0 && (await page.locator('.timer').count()) === 0, "a new game doesn't inherit the last game's overlay or timer");
await tile(0).click();
await page.locator('.full').waitFor();
await page.keyboard.press('1');
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();
await answerDialog(() => page.getByRole('button', { name: 'Exit' }).click(), true);
await page.getByRole('button', { name: 'Resume game' }).waitFor();
const keepMsg = await answerDialog(() => page.getByRole('button', { name: '▶ Play' }).click(), false);
assert(keepMsg.includes('can still be resumed') && (await page.getByRole('button', { name: 'Resume game' }).isVisible()), 'cancelling Play keeps the saved game');
await page.waitForTimeout(300);
await page.reload();
await page.getByRole('button', { name: 'Resume game' }).click();
await page.locator('.board').waitFor();
assert((await scoreOf(0)) === '$200' && (await isUsed(0)), 'Exit, reload, Resume: scores and used tiles are kept');
await answerDialog(() => page.getByRole('button', { name: 'Exit' }).click(), true);

// .jbr round trip: save the pack, start a new game, open the pack again.
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
assert(dl.suggestedFilename().endsWith('.jbr'), 'Save downloads a .jbr pack');
const packPath = await dl.path();
await page.getByRole('button', { name: 'New' }).click();
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
assert((await page.locator('.cat textarea').first().inputValue()) !== 'Memes', 'new game is blank');

// Pre-game preflight on the blank game: warnings listed, Start needs a player.
await answerDialog(() => page.getByRole('button', { name: '▶ Play' }).click(), true);
await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
assert(await page.getByRole('button', { name: 'Start game ▶' }).isDisabled(), 'Start is disabled with no players');
assert(await page.locator('.checks summary').getByText(/things to check/).isVisible(), 'pre-game lists what is unfinished');
await page.locator('.checks summary').click();
assert((await page.locator('.checks li', { hasText: 'Daily Double wanted, 0 placed' }).count()) === 1, 'pre-game flags the missing Daily Double');
await page.locator('.checks li', { hasText: 'Daily Double wanted' }).getByRole('button', { name: '🎲 Place now' }).click();
await page.getByText('Placed 1 Daily Double in Jeopardy!').waitFor();
assert((await page.locator('.checks li', { hasText: 'Daily Double wanted' }).count()) === 0, '🎲 Place now places the missing Daily Double');
await page.getByRole('button', { name: '＋ Add 3 sample players' }).click();
assert(await page.getByRole('button', { name: 'Start game ▶' }).isEnabled(), 'Start is enabled once there are players');
await page.getByRole('button', { name: '◀ Back to editor' }).click();

// The saved game kept its media through "New": resume it and the image still shows.
await page.getByRole('button', { name: 'Resume game' }).click();
await tile(0).click({ button: 'right', force: true });
await tile(0).click();
await page.locator('.full img').waitFor();
assert((await page.locator('.full .missing').count()) === 0, 'New keeps the media of the game waiting to be resumed');
await page.keyboard.press('Escape');
await answerDialog(() => page.getByRole('button', { name: 'Exit' }).click(), true);

const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open…' }).click()]);
await chooser.setFiles({ name: 'game.jbr', mimeType: 'application/zip', buffer: (await import('node:fs')).readFileSync(packPath) });
await page.locator('.cat textarea').first().waitFor();
await page.waitForFunction(() => document.querySelector('.cat textarea')?.value === 'Memes');
assert(true, 'reopened .jbr restores the game');
// pepe.png, its edited copy, beep.wav, clip.webm and the picture saved from a dropped link (unused files stay
// in the library until removed).
assert((await page.getByRole('button', { name: /Media \(5\)/ }).count()) === 1, 'reopened .jbr includes its media files');
await page.getByRole('button', { name: /Media \(5\)/ }).click();
await page.locator('.card img').first().waitFor();
assert((await page.locator('.card .missing').count()) === 0, 'media from the pack is loaded (no missing files)');
const discardMsg = await answerDialog(() => page.getByRole('button', { name: 'Discard' }).click(), true);
assert(discardMsg.includes('Discard the saved game'), 'Discard asks before deleting the saved game');
await page.getByRole('button', { name: 'Resume game' }).waitFor({ state: 'detached' });

// Standalone player-only HTML export: opens straight into a Play screen with everything embedded.
const [html] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ Export HTML' }).click()]);
assert(html.suggestedFilename().endsWith('.html'), 'Export HTML downloads a .html file');
mkdirSync('test-results', { recursive: true });
const exported = resolve('test-results/exported-game.html');
await html.saveAs(exported);
const player = await context.newPage();
player.on('pageerror', (e) => errors.push('[exported] ' + e.message));
player.on('dialog', (d) => d.accept());
await player.goto(pathToFileURL(exported).href);
await player.getByRole('button', { name: '▶ Play' }).waitFor();
assert((await player.locator('.home h1').innerText()) === 'Untitled Game', 'exported file shows the player-only start screen');
assert((await player.getByRole('button', { name: /Export HTML|Save/ }).count()) === 0, 'exported file has no editor');
await player.getByRole('button', { name: '▶ Play' }).click();
await player.getByRole('button', { name: 'Start game ▶' }).click();
await player.getByRole('button', { name: 'Skip intro' }).click();
await player.locator('.board .tile').first().click();
await player.locator('.full img').waitFor();
const imgOk = await player.locator('.full img').first().evaluate((i) => new Promise((res) => (i.complete ? res(i.naturalWidth > 0) : (i.onload = () => res(true)))));
assert(imgOk, 'exported game plays with its embedded (edited) image');
await player.close();

assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
await context.tracing.stop();
await browser.close();
console.log('E2E smoke passed');
