// End-to-end smoke test of the built single-file app, opened from disk (file://) like a user would.
// Usage: npm run build && npm run test:e2e   (SCREENSHOTS=dir to save screenshots)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = resolve('dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
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
// Tiny test media generated in memory.
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

await page.getByRole('button', { name: 'Jeopardy!' }).click();
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
await fc.setFiles({ name: 'pepe.png', mimeType: 'image/png', buffer: png() });
await page.locator('.canvas img').waitFor();
assert(true, 'image added to the slide');
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
await page.getByRole('button', { name: 'Jeopardy!' }).first().click();
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
assert((await page.locator('.round-name').innerText()) === 'Jeopardy!', 'round intro title card shows');
await page.keyboard.press('n');
await page.locator('.board .tile').first().waitFor();
await page.getByRole('button', { name: /Reveal category 1 of/ }).waitFor();
assert((await page.locator('.board .header .title').count()) === 0, 'categories hidden until revealed');
await page.keyboard.press('n');
await page.locator('.board .header .title').first().waitFor();
assert((await page.locator('.board .header .title').count()) === 1, 'N reveals one category at a time');
await page.getByRole('button', { name: 'Skip intro' }).click();
assert((await page.locator('.board .header .title').count()) === 6, 'skip intro shows the full board');
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

await page.keyboard.press('r');
await page.getByText('Who is Pepe?').waitFor();
assert(true, 'answer revealed with R');
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
await page.getByRole('button', { name: 'Jeopardy!' }).first().click();
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
assert(await aud.locator('.board .tile').nth(2).isDisabled(), 'audience board shows the used tile');
if (shots) await aud.screenshot({ path: `${shots}/6-audience.png` });
if (shots) await page.screenshot({ path: `${shots}/7-host-dual.png` });
await page.getByRole('button', { name: '📺 Close audience window' }).click();
assert(aud.isClosed(), 'audience window closes from the host');

// Wheel tile: the wheel opens full-screen; spin lands on the heavy slice; its score effect can be skipped.
await page.locator('.board .tile').nth(4).click();
await page.locator('.ov .wheel').waitFor();
assert(true, 'wheel tile opens the wheel overlay');
await page.getByRole('button', { name: 'Spin!' }).click();
await page.locator('.tc .result').waitFor({ timeout: 8000 });
assert((await page.locator('.tc .result').innerText()).includes('Bankrupt'), 'weighted spin lands on the heavy slice');
await page.locator('.ov .card').waitFor();
assert((await page.locator('.ov .card .label').innerText()) === 'Bankrupt', 'result card revealed on screen');
await page.locator('.tc .chip', { hasText: 'Player 3' }).first().click();
await page.locator('.ac').waitFor();
await page.locator('.ac').getByRole('button', { name: 'Skip' }).click();
assert((await scoreOf(0)) === '$550', 'skipping the score effect changes nothing');
await shot('10-wheel');
await page.keyboard.press('Escape');
await page.locator('.ov').waitFor({ state: 'detached' });
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
await page.getByRole('button', { name: 'Final Jeopardy ▶' }).click();
await page.locator('.final-label').waitFor();
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
await page.getByRole('button', { name: 'Jeopardy!' }).first().click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
assert(dl.suggestedFilename().endsWith('.jbr'), 'Save downloads a .jbr pack');
const packPath = await dl.path();
await page.getByRole('button', { name: 'New' }).click();
await page.getByRole('button', { name: 'Jeopardy!' }).first().click();
assert((await page.locator('.cat textarea').first().inputValue()) !== 'Memes', 'new game is blank');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open…' }).click()]);
await chooser.setFiles({ name: 'game.jbr', mimeType: 'application/zip', buffer: (await import('node:fs')).readFileSync(packPath) });
await page.locator('.cat textarea').first().waitFor();
await page.waitForFunction(() => document.querySelector('.cat textarea')?.value === 'Memes');
assert(true, 'reopened .jbr restores the game');
assert((await page.getByRole('button', { name: /Media \(2\)/ }).count()) === 1, 'reopened .jbr includes its media files');
await page.getByRole('button', { name: /Media \(2\)/ }).click();
await page.locator('.card img').first().waitFor();
assert((await page.locator('.card .missing').count()) === 0, 'media from the pack is loaded (no missing files)');

assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
await browser.close();
console.log('E2E smoke passed');
