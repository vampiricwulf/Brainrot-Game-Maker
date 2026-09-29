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
/** Messages of the confirm() dialogs seen so far (all accepted). */
const confirms = [];
page.on('dialog', (d) => {
  if (d.type() === 'prompt') return; // answered by the step that triggers it
  if (d.type() === 'alert') console.log('  [alert] ' + d.message());
  if (d.type() === 'confirm') confirms.push(d.message());
  d.accept();
});

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
const shot = (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const scoreOf = (i) => page.locator('.panel .p').nth(i).locator('.score').innerText();

await page.goto(url);
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

// Preview plays sound: the audio clip plays unmuted, and stops with the preview.
await page.getByRole('button', { name: '🔊 Audio' }).click();
await page.locator('.picker .item', { hasText: 'beep.wav' }).click();
await page.getByRole('button', { name: '▶ Preview' }).click();
await page.waitForFunction(() => { const a = document.querySelector('.canvas audio'); return a && !a.paused && a.currentTime > 0; });
assert(await page.locator('.canvas audio').evaluate((a) => !a.muted), 'preview plays audio with sound');
await page.getByRole('button', { name: '■ Stop preview' }).click();
assert(await page.locator('.canvas audio').evaluateAll((els) => els.every((a) => a.paused)), 'stopping the preview stops the audio');
await page.getByRole('button', { name: 'Preview sound is on' }).click();
await page.getByRole('button', { name: '▶ Preview' }).click();
assert(await page.locator('.canvas audio').evaluate((a) => a.muted), 'the preview sound toggle mutes it');
await page.getByRole('button', { name: '■ Stop preview' }).click();
await page.getByRole('button', { name: 'Preview sound is off' }).click();
await page.locator('.canvas .hit').last().click();
await page.keyboard.press('Delete');

// A full-bleed image: its rotate handle stays on screen; locked, it can't be deleted; Alt+click reaches what's under it.
await page.getByRole('button', { name: '🖼 Image' }).click();
await page.locator('.picker .item', { hasText: 'pepe.png' }).click();
for (const [k, v] of [['X', 0], ['Y', 0], ['W', 1920], ['H', 1080]]) await posBox.getByLabel(k, { exact: true }).fill(String(v));
const cvBox = await rect(page.locator('.canvas'));
const rot = await rect(page.locator('.frame .rot'));
assert(rot.top >= cvBox.top && rot.bottom <= cvBox.bottom && rot.left >= cvBox.left && rot.right <= cvBox.right, 'a full-bleed image keeps its rotate handle inside the canvas');
await posBox.getByLabel('Lock').check();
await page.locator('.canvas .hit').last().click();
await page.keyboard.press('Delete');
assert((await hits()) === 3 && (await insp.getByText('Locked — unlock to delete').count()) === 1, 'a locked image survives Delete');
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
assert((await hits()) === 1, 'Ctrl+A then Delete skips the locked image');
await page.keyboard.press('Control+z');
assert((await hits()) === 3, 'and Ctrl+Z brings the text boxes back');
await page.keyboard.down('Alt');
await page.mouse.click(...center(await page.locator('.canvas .stage').boundingBox()));
await page.keyboard.up('Alt');
assert((await insp.getByLabel('Text', { exact: true }).count()) === 1, 'Alt+click selects the text box under the image');
// "Use this style elsewhere" asks first and can be undone.
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
assert((await hits()) === 3, 'Ctrl+X cuts the selected item');
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
await page.locator('.canvas').evaluate((c) => {
  const dt = new DataTransfer();
  dt.setData('text/uri-list', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: r.x + 100, clientY: r.y + 100, bubbles: true, cancelable: true }));
});
assert((await hits()) === 6, 'a link dropped from another tab adds online media');
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Keyboard-first clue entry: type, Tab, type, Ctrl+Enter (category 6) ----------
await page.locator('.tile').nth(5).click();
for (const n of [1, 2, 3]) {
  assert(await page.evaluate(() => document.activeElement?.getAttribute('placeholder') === 'Type the question…'), `clue ${n}: the Question field has focus`);
  await page.keyboard.type(`Q${n} question`);
  await page.keyboard.press('Tab');
  await page.keyboard.type(`A${n} answer`);
  if (n === 3) break;
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
page.once('dialog', (d) => d.accept('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'));
await page.getByRole('button', { name: '🌐 Link' }).click();
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
assert((await page.getByText('Who is Pepe?').count()) === 0, 'answer is not in the page before reveal');

await page.keyboard.press('1');
await page.keyboard.press('2');
await page.locator('.award input').fill('350');
await page.locator('.award input').press('Enter');
assert((await scoreOf(0)) === '$350' && (await scoreOf(1)) === '$350', 'custom amount awarded to two players');
assert((await scoreOf(2)) === '$0', 'third player untouched');
await page.locator('.panel .p').nth(2).locator('.wrong').click();
assert((await scoreOf(2)) === '−$200', 'quick wrong deducts the clue value');
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
assert(await page.locator('.board .tile').first().isDisabled(), 'tile marked used after returning to board');

// YouTube tile: either it embeds, or the host gets the "Open on YouTube" fallback.
await page.locator('.board .tile').nth(1).click();
await page.locator('.mc .item').waitFor();
await page.waitForFunction(() => /Open on YouTube|↗/.test(document.querySelector('.mc')?.textContent ?? ''), null, { timeout: 15000 });
assert(true, 'YouTube clue offers the Open-on-YouTube button to the host');
await shot('5b-youtube');
await page.keyboard.press('Escape');
await page.locator('.board').waitFor();

await page.keyboard.press('Control+z');
assert((await scoreOf(2)) === '$0', 'Ctrl+Z undoes the last score change');
await shot('5-board-after');

// Crash recovery: reload and resume.
await page.waitForTimeout(300);
await page.reload();
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
await page.getByRole('button', { name: 'Resume game' }).click();
await page.locator('.board').waitFor();
assert((await scoreOf(0)) === '$350', 'scores survive a reload');
assert(await page.locator('.board .tile').first().isDisabled(), 'used tiles survive a reload');

// Dual-window mode: the audience window never shows the answer before reveal.
const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
await aud.locator('.board').waitFor();
assert(true, 'audience window opened and synced the board');
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
await page.getByRole('button', { name: '📺 Close audience window' }).click();
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
await page.keyboard.press('Escape');

// Final Jeopardy: eligible players, private wagers, one-by-one reveal.
await page.getByRole('button', { name: 'Final Brainrot ▶' }).click();
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
await rows.nth(1).getByRole('button', { name: '✘ Wrong' }).click();
await shot('8-final-reveal');
assert((await page.locator('.spot-result').innerText()).includes('WRONG'), 'reveal shows the result');
await page.getByRole('button', { name: 'Finish game ▶' }).click();
await page.locator('.end h1').waitFor();
// P1 550+300 = 850 ties P2 850-0 = 850.
assert(await page.getByText('Tie for first:').isVisible(), 'tie for first is detected');
await page.getByRole('button', { name: '🤝 Declare co-winners' }).click();
await page.waitForFunction(() => document.querySelector('.end h1')?.textContent?.includes("It's a tie"));
assert(true, 'co-winners declared on the winner screen');
await shot('9-winner');

// Tools work any time: wheel from the launcher with a confirmed score effect (undoable).
await page.getByRole('button', { name: '🎡 Wheel' }).click();
await page.getByRole('button', { name: 'Punishment Wheel' }).click();
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

// Roll-off: everyone rolls; the winner becomes the current picker.
await page.keyboard.press('o');
await page.getByText(/goes first!/).waitFor({ timeout: 20000 });
const winnerName = (await page.locator('.win span').innerText()).trim();
await page.keyboard.press('Escape');
await page.getByRole('button', { name: '📜 Log' }).click();
await page.getByRole('button', { name: /Rolls \(/ }).click();
const rollsText = await page.locator('aside .list').innerText();
assert(rollsText.includes('goes first') && rollsText.includes('Punishment Wheel') && rollsText.includes('2d6'), 'roll log lists the wheel, dice and roll-off');
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

// .jbr round trip: save the pack, start a new game, open the pack again.
await page.getByRole('button', { name: 'Exit' }).click();
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
assert(dl.suggestedFilename().endsWith('.jbr'), 'Save downloads a .jbr pack');
const packPath = await dl.path();
await page.getByRole('button', { name: 'New' }).click();
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).first().click();
assert((await page.locator('.cat textarea').first().inputValue()) !== 'Memes', 'new game is blank');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open…' }).click()]);
await chooser.setFiles({ name: 'game.jbr', mimeType: 'application/zip', buffer: (await import('node:fs')).readFileSync(packPath) });
await page.locator('.cat textarea').first().waitFor();
await page.waitForFunction(() => document.querySelector('.cat textarea')?.value === 'Memes');
assert(true, 'reopened .jbr restores the game');
assert((await page.getByRole('button', { name: /Media \(3\)/ }).count()) === 1, 'reopened .jbr includes its media files');
await page.getByRole('button', { name: /Media \(3\)/ }).click();
await page.locator('.card img').first().waitFor();
assert((await page.locator('.card .missing').count()) === 0, 'media from the pack is loaded (no missing files)');

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
