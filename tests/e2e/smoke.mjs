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
page.on('dialog', (d) => {
  if (d.type() === 'prompt') return; // answered by the step that triggers it
  if (d.type() === 'alert') console.log('  [alert] ' + d.message());
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
await page.getByRole('button', { name: '🎨 Edit image…' }).click();
assert((await ie.locator('#ie-text').count()) === 0 && (await ie.getByRole('button', { name: 'Use original' }).count()) === 1, 'edits reopen non-destructively (original kept)');
await ie.getByRole('button', { name: 'Cancel' }).click();
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
