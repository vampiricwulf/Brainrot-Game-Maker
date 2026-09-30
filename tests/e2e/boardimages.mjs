// Board images: category header images, tile images, free-placed board images (layers, opacity,
// behind the tiles, click-through), the banner above the board, and how they show up in a game.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
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

/** A small solid-color PNG, base64. */
function png(r, g, b, w = 40, h = 24) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
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
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

/** Drop image files (name → base64 PNG) onto an element, the way a file dragged from the desktop arrives. */
async function drop(locator, files) {
  const dt = await page.evaluateHandle((fs) => {
    const d = new DataTransfer();
    for (const [name, b64] of fs) d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/png' }));
    return d;
  }, files);
  await locator.dispatchEvent('dragover', { dataTransfer: dt });
  await locator.dispatchEvent('drop', { dataTransfer: dt });
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();

  // ---------- Category images: two files dropped on the first header fill the first two ----------
  await drop(page.locator('.cat').first(), [
    ['cat-a.png', png(255, 0, 0)],
    ['cat-b.png', png(0, 200, 0)],
  ]);
  await page.locator('.cat .cat-img img').nth(1).waitFor();
  assert((await page.locator('.cat .cat-img img').count()) === 2, 'two images dropped on a header fill the first two categories');
  await page.locator('.cat textarea').first().fill('Memes');
  await page.locator('.cat').first().getByLabel('Name', { exact: true }).check();
  await page.locator('.cat').first().locator('.cap', { hasText: 'Memes' }).waitFor();
  assert(true, 'the name can be shown on top of the image');
  await page.locator('.cat').nth(1).getByRole('combobox').selectOption('cover');

  // ---------- Tile images: three files dropped on a tile fill it and the next tiles down the column ----------
  const cols = await page.locator('.cat').count();
  const editorTile = (ci, row) => page.locator('.grid .tile').nth(row * cols + ci);
  await drop(editorTile(2, 3), [
    ['t1.png', png(255, 255, 0)],
    ['t2.png', png(0, 255, 255)],
    ['t3.png', png(255, 0, 255)],
  ]);
  await editorTile(3, 0).locator('img.face').waitFor();
  assert(
    (await editorTile(2, 3).locator('img.face').count()) === 1 && (await editorTile(2, 4).locator('img.face').count()) === 1,
    'dropped tile images fill down the column',
  );
  assert(true, '…and carry on at the top of the next column');
  await shot('bi-1-round');

  // ---------- Board images ----------
  await page.getByRole('button', { name: /Board images/ }).click();
  const modal = page.locator('[aria-label="Board images"]');
  await drop(modal.locator('.canvas'), [
    ['blocker.png', png(250, 250, 250)],
    ['through.png', png(30, 30, 30)],
    ['behind.png', png(255, 128, 0)],
  ]);
  const rows = modal.locator('.layers .row');
  await rows.nth(2).waitFor();
  const order = async () => (await rows.locator('.txt').allInnerTexts()).join(',');
  assert((await order()) === 'behind.png,through.png,blocker.png', `layers list the top-most first (${await order()})`);

  const pos = modal.locator('.insp section:has(h4:text("Position"))');
  async function place(name, x, y, w, h) {
    await rows.filter({ hasText: name }).locator('.name').click();
    await pos.getByLabel('X', { exact: true }).fill(String(x));
    await pos.getByLabel('Y', { exact: true }).fill(String(y));
    await pos.getByLabel('W', { exact: true }).fill(String(w));
    await pos.getByLabel('H', { exact: true }).fill(String(h));
  }
  // Column 1 (x 10–318) gets a solid image that blocks clicks, column 2 (x 328–636) a click-through one.
  await place('blocker.png', 0, 0, 320, 1080);
  await modal.locator('.board-opts input[type=range]').fill('0.5');
  await modal.getByLabel(/Click-through/).uncheck();
  await place('through.png', 335, 0, 290, 1080);
  await place('behind.png', 0, 0, 1920, 1080);
  await modal.getByLabel(/Behind the tiles/).check();
  assert((await modal.locator('.canvas .layer.behind img').count()) === 1, 'an image can go behind the tiles');
  assert((await modal.locator('.canvas .layer.above img').count()) === 2, 'the others sit on top of the board');

  // Restack from the layers list: ▲ brings the bottom one forward.
  await rows.filter({ hasText: 'blocker.png' }).getByRole('button', { name: 'Bring forward' }).click();
  assert((await order()) === 'behind.png,blocker.png,through.png', 'Bring forward restacks it');
  // Drag in the list to restack.
  await rows.filter({ hasText: 'through.png' }).dragTo(rows.filter({ hasText: 'behind.png' }), { targetPosition: { x: 20, y: 2 } });
  assert((await order()) === 'through.png,behind.png,blocker.png', `dragging restacks (${await order()})`);
  // Hide while editing: the preview drops it, the game keeps it.
  await rows.filter({ hasText: 'through.png' }).getByRole('button', { name: 'Hide while editing' }).click();
  assert((await modal.locator('.canvas .layer.above img').count()) === 1, 'hide-while-editing hides it in the preview');
  await rows.filter({ hasText: 'through.png' }).getByRole('button', { name: 'Show while editing' }).click();
  await shot('bi-2-decor-editor');

  await modal.getByRole('button', { name: /Copy all to other rounds/ }).click();
  await modal.getByRole('button', { name: 'Done' }).click();
  assert((await page.getByRole('button', { name: /Board images \(3\)/ }).count()) === 1, 'the Board images button counts them');
  await page.getByRole('button', { name: 'Double Jeopardy!', exact: true }).click();
  assert((await page.getByRole('button', { name: /Board images \(3\)/ }).count()) === 1, 'Copy to other rounds put them on Double Jeopardy');

  // ---------- Banner above the board ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.locator('.row:has-text("Banner above the board")').getByRole('button', { name: 'Choose…' }).click();
  await page.locator('.picker .item').first().click();
  await page.locator('.preview .banner img').waitFor();
  const boardTop = await page.locator('.preview .board-area').evaluate((e) => e.style.top);
  assert(boardTop === '170px', `the board moves down under the banner (${boardTop})`);

  // Nothing new is "unused".
  await page.getByRole('button', { name: '🖼 Media' }).click();
  assert(/\(0\)/.test(await page.getByRole('button', { name: /Remove unused/ }).innerText()), 'category, tile, board and banner images all count as used');

  // Two different files with the same name (like pasted screenshots, all "image.png") get distinct names.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Add files…' }).click()]);
  await chooser.setFiles([
    { name: 'pasted.png', mimeType: 'image/png', buffer: Buffer.from(png(1, 2, 3), 'base64') },
    { name: 'pasted.png', mimeType: 'image/png', buffer: Buffer.from(png(4, 5, 6), 'base64') },
  ]);
  await page.locator('.card .nm', { hasText: /^pasted-[a-z0-9]{6}\.png$/ }).waitFor();
  const pasted = await page.locator('.card .nm', { hasText: /^pasted/ }).allInnerTexts();
  assert(pasted.length === 2 && pasted.includes('pasted.png'), `a second file named pasted.png gets a randomized name (${pasted})`);

  // ---------- In the game ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().waitFor();
  assert((await page.locator('.board .header .title.has-image img').count()) === 2, 'category headers show their images');
  assert((await page.locator('.board .header .caption').innerText()).trim().toLowerCase() === 'memes', 'the name shows over the image');
  assert((await page.locator('.board .tile img').count()) === 3, 'tiles show their images');
  assert((await page.locator('.board-screen .banner img').count()) === 1, 'the banner shows above the board');
  const op = await page.locator('.layer.above .el').evaluateAll((els) => els.map((e) => e.style.opacity));
  assert(op.includes('0.5'), `board image opacity carries into the game (${op})`);

  const tiles = page.locator('.board .tile');
  const topAt = async (i) =>
    tiles.nth(i).evaluate((t) => {
      const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit?.closest('.tile') === t ? 'tile' : hit?.className ?? 'nothing';
    });
  assert((await topAt(0)).includes('block'), 'a solid board image covers the tile under it');
  await tiles.nth(0).click({ force: true });
  await page.waitForTimeout(300);
  assert((await page.locator('.board').count()) === 1, 'clicking a solid board image does not open the tile under it');
  assert((await topAt(1)) === 'tile', 'a click-through board image lets the tile under it be clicked');
  await shot('bi-3-board');
  await tiles.nth(1).click();
  await page.locator('.full').waitFor();
  assert(true, 'clicking through the image opens the clue');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nBoard images E2E passed.');
} finally {
  await browser.close();
}
