// Board games in play: the main button goes 🎲 Roll → ▶ Move → Next turn ▶, with ◀ Previous turn right beside it (under
// the stage and in the side column), and ✎ Edit board changes the board while the game runs: add, move, connect,
// disconnect and delete spaces (players on a deleted space move to the one before it), each an undo step; the audience
// window follows; 💾 Keep in game writes the board back into the game in the editor, and without it the editor's game
// stays as it was.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mainButton, mainLabel, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const shots = process.env.SHOTS;

const sp = (id, name, x, y, next) => ({ id, name, x, y, color: '#4363d8', next });
const board = {
  id: 'r_bg',
  name: 'Board game',
  mode: 'boardgame',
  slide: { background: { color: '#1d5e3a' }, elements: [] },
  spaces: [
    sp('b1', 'Start', 300, 300, ['b2']),
    sp('b2', 'Space 2', 650, 300, ['b3']),
    sp('b3', 'Space 3', 1000, 300, ['b4']),
    sp('b4', 'Nap time', 1400, 300, ['b5']),
    sp('b5', 'Space 5', 1400, 700, ['b6']),
    sp('b6', 'Space 6', 650, 700, ['b1']),
  ],
  mover: { kind: 'dice', dice: 'd6' },
  zones: [],
};
const game = {
  id: 'g_boardedit_e2e',
  version: 2,
  title: 'Board edit check',
  settings: {
    allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20,
    pickerFollowsAward: true, timerAutoStart: true, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8,
  },
  players: [{ id: 'p1', name: 'Ann', color: '#e6194b' }, { id: 'p2', name: 'Bob', color: '#3cb44b' }],
  rounds: [board], media: [], audio: {}, dice: [], theme: {}, wheels: [],
};
mkdirSync(resolve('test-results'), { recursive: true });
const gameFile = resolve('test-results/boardedit.json');
writeFileSync(gameFile, JSON.stringify(game));

/** Open the game and play it (with an audience window when `dual`). */
async function start(page, dual = false) {
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  const fresh = page.getByRole('alertdialog').getByRole('button', { name: 'Start a new game' });
  await fresh.or(page.getByRole('button', { name: 'Start game ▶' })).first().waitFor();
  if (await fresh.isVisible()) await fresh.click();
  let aud = null;
  if (dual) [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.bh').waitFor();
  return aud;
}

const box = (l) => l.boundingBox();
/** ◀ Previous turn and the main cell's buttons: on one row, side by side, as tall as each other. */
async function besideMain(page, what) {
  const prev = page.locator('.panel [data-next-also]', { hasText: 'Previous turn' });
  const cell = page.locator('.panel .next button');
  const boxes = await cell.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
  const p = await box(prev);
  const m = await box(mainButton(page));
  const sameRow = boxes.every((b) => Math.abs(b.y - m.y) < 2 && Math.abs(b.h - m.height) < 2);
  const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].w));
  assert(sameRow && gaps.every((g) => g >= 0 && g < 14), `${what}: the main cell is one row (${boxes.map((b) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}`).join(' · ')})`);
  assert(p.x < m.x, `${what}: ◀ Previous turn is just left of the main button`);
  return { p, m };
}

const last = (page) => page.locator('.bh .last').innerText();
const stageSpaces = (page) => page.locator('.stage-box [data-space]');

try {
  // ---------- One window, the panel under the stage ----------
  console.log('Under the stage:');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const toast = () => page.locator('.toast').innerText();
  const turn = () => page.locator('.stage .turn-banner').innerText();
  assert(!(await page.locator('.bh').getByRole('button', { name: '◀ Previous turn' }).count()), 'Previous turn is no longer up in the round’s box');
  assert((await mainLabel(page)) === '🎲 Roll', `a turn starts with 🎲 Roll as the main button (${await mainLabel(page)})`);
  assert((await page.locator('.panel [data-next-also]').allInnerTexts()).map((t) => t.split(' ')[0] + ' ' + t.split(' ')[1]).join() === '◀ Previous,Next turn', 'with ◀ Previous turn and Next turn ▶ beside it');
  await besideMain(page, 'rolling');
  await page.getByLabel('Steps').fill('2');
  await page.getByLabel('Steps').blur();
  assert((await mainLabel(page)) === '▶ Move 2', `steps typed: ▶ Move is the main button (${await mainLabel(page)})`);
  await mainButton(page).click();
  assert((await toast()).includes('Landed on Space 3'), 'it moves');
  assert((await mainLabel(page)) === 'Next turn ▶', `moved: Next turn ▶ is the main button (${await mainLabel(page)})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert((await mainLabel(page)) === '▶ Move 2', `Ctrl+Z: the move is undone and its count is back (${await mainLabel(page)})`);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(200);
  assert((await mainLabel(page)) === 'Next turn ▶', `Ctrl+Shift+Z: moved again (${await mainLabel(page)})`);
  const { p, m } = await besideMain(page, 'next turn');
  assert(m.x - (p.x + p.width) < 14, 'Previous turn sits right beside Next turn');
  if (shots) await page.screenshot({ path: `${shots}/under-stage-next-turn.png` });
  await page.keyboard.press('n');
  assert((await turn()).includes('Bob'), 'N: Bob’s turn');
  await page.keyboard.press('Shift+N');
  assert((await turn()).includes('Ann'), 'Shift+N: back to Ann');
  assert((await mainLabel(page)) === 'Next turn ▶', `her turn as it was: her move is made (${await mainLabel(page)})`);
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  assert((await toast()).includes('Ann already moved this turn'), `D doesn't roll a second move for her (${await toast()})`);
  // Round to a fresh turn of hers.
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  assert((await turn()).includes('Ann') && (await mainLabel(page)) === '🎲 Roll', 'N, N: Ann’s next turn starts with 🎲 Roll');
  await page.keyboard.press('d');
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  assert(/^▶ Move \d$/.test(await mainLabel(page)), `D rolls, and the main button moves that many (${await mainLabel(page)})`);
  await page.keyboard.press('Escape');
  await page.getByLabel('Steps').fill('');
  await page.getByLabel('Send to').selectOption({ label: 'Nap time' });

  // ---------- ✎ Edit board ----------
  await page.getByLabel('Steps').blur();
  const names = (pg) => pg.locator('.stage-box .space .label:not([data-name-hidden])').allInnerTexts();
  assert((await page.locator('.stage-box .space .label').count()) === 0, 'one window: space names are hidden on the stage by default');
  await page.keyboard.press('e');
  await page.locator('[data-board-editing]').waitFor();
  assert((await page.locator('.stage-box .space .label[data-name-hidden]').count()) === 6, 'editing: the host sees every name, the hidden ones dimmed');
  assert((await mainLabel(page)) === '✓ Done editing', 'E edits the board: ✓ Done editing is the main button');
  assert((await page.locator('[data-board-editing]').innerText()).includes('Viewers see this'), 'one window: the panel says viewers see it');
  assert((await page.locator('[data-board-editing]').innerText()).includes('this game only'), 'and that the changes last for this game only');
  await page.waitForTimeout(800);
  const ovBefore = await page.locator('.stage-box .ov').evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 80)).join());
  await page.keyboard.press('d');
  await page.waitForTimeout(300);
  const ovAfter = await page.locator('.stage-box .ov').evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 80)).join());
  assert((await toast()).includes('Editing the board') && ovAfter === ovBefore, `the round’s moves wait while editing (D rolls nothing: ${ovAfter || 'no overlay'})`);
  const layer = page.locator('.stage-box [data-board-edit]');
  const at = async (x, y) => {
    const b = await box(layer);
    return { x: b.x + (x * b.width) / 1920, y: b.y + (y * b.height) / 1080 };
  };
  const n0 = await stageSpaces(page).count();
  // Add: ＋ Space, then a click on the board.
  await page.locator('[data-board-editing]').getByRole('button', { name: '＋ Space' }).click();
  let pt = await at(1000, 560);
  await page.mouse.click(pt.x, pt.y);
  assert((await stageSpaces(page).count()) === n0 + 1 && (await last(page)).includes('Added space “Space 7”'), `＋ Space then a click adds a space (${await last(page)})`);
  // Move: drag it.
  const added = page.locator('.stage-box .space', { hasText: 'Space 7' });
  const x0 = parseFloat(await added.evaluate((e) => e.style.left));
  pt = await at(1000, 560);
  const pt2 = await at(1000 - 250, 560);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(pt.x + ((pt2.x - pt.x) * i) / 6, pt.y);
  await page.mouse.up();
  const x1 = parseFloat(await added.evaluate((e) => e.style.left));
  assert(Math.abs(x1 - (x0 - 250)) < 20 && (await last(page)).includes('Moved space “Space 7”'), `a space dragged moves (${x0} → ${x1}), one step`);
  // Connect: Space 7 picked, Shift+click Space 3.
  const s3 = await at(1000, 300);
  await page.keyboard.down('Shift');
  await page.mouse.click(s3.x, s3.y);
  await page.keyboard.up('Shift');
  assert((await last(page)).includes('Connected Space 7 → Space 3'), `Shift+click connects the picked space to another (${await last(page)})`);
  if (shots) await page.screenshot({ path: `${shots}/editing-connected.png` });
  // Disconnect: click the link, Delete.
  const mid = await at((750 + 1000) / 2, (560 + 300) / 2);
  await page.mouse.click(mid.x, mid.y);
  await page.locator('[data-picked-link]').waitFor();
  await page.keyboard.press('Delete');
  assert((await last(page)).includes('Disconnected Space 7 → Space 3'), `a link clicked and Delete: disconnected (${await last(page)})`);
  // The panel's Connect to… list does it too.
  pt = await at(750, 560);
  await page.mouse.click(pt.x, pt.y);
  await page.getByLabel('Connect Space 7 to').selectOption({ label: 'Space 5' });
  assert((await last(page)).includes('Connected Space 7 → Space 5'), 'or the picked space’s “Connect to a space…” list');
  // Delete a space with Ann on it: she goes to the space before it, and the path closes up over it.
  const nap = await at(1400, 300);
  await page.mouse.click(nap.x, nap.y);
  await page.keyboard.press('Delete');
  assert((await toast()).includes('Deleted space “Nap time” (Ann moved to Space 3)'), `Delete: the space goes, Ann moves to the space before it (${await toast()})`);
  assert((await last(page)).includes('Deleted space “Nap time” (Ann moved to Space 3)'), 'and the undo step says so');
  await page.waitForTimeout(500);
  const ann = await page.locator('.stage .on-board[data-player="Ann"]').evaluate((e) => parseFloat(e.style.left));
  assert(Math.abs(ann - 1000) < 160, `Ann’s token is at Space 3 (${ann})`);
  // Space 3 leads on to Space 5 now (the gap closed): picked, its panel says so.
  await page.mouse.click(s3.x, s3.y);
  assert((await page.locator('[data-board-editing]').innerText()).includes('→ Space 5'), 'the path closes up over the deleted space (Space 3 → Space 5)');
  // Rename from the panel.
  await page.getByLabel('Space name').fill('Lava');
  await page.getByLabel('Space name').press('Enter');
  assert((await last(page)).includes('Renamed space “Space 3” to “Lava”') && (await stageSpaces(page).allInnerTexts()).some((t) => t.includes('Lava')), 'renaming a space is a step');
  if (shots) await page.screenshot({ path: `${shots}/editing-under-stage.png` });
  // Undo goes back step by step: the name, then the deleted space (and Ann on it).
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  assert((await stageSpaces(page).allInnerTexts()).some((t) => t.includes('Nap time')), 'Ctrl+Z brings the deleted space back');
  const annBack = await page.locator('.stage .on-board[data-player="Ann"]').evaluate((e) => parseFloat(e.style.left));
  assert(Math.abs(annBack - 1400) < 160, `and Ann on it (${annBack})`);
  // Show one space's name: the box in the panel, one named step.
  await page.mouse.click(nap.x, nap.y);
  await page.locator('[data-board-editing] [data-show-name]').check();
  assert((await last(page)).includes('Showed the name of “Nap time”') && (await names(page)).join() === 'Nap time', `ticking “Show name on the board” shows its name (${await last(page)})`);
  if (shots) await page.screenshot({ path: `${shots}/names-editing.png` });
  // Make it a… here too: one step, undone by Ctrl+Z (a shop needs a shop in the game: there's none).
  const kinds = page.locator('[data-board-editing] [data-space-kind]');
  assert(await kinds.locator('option[value="shop"]').isDisabled(), 'Make it a… 🛒 Shop waits for a shop in the game');
  await kinds.selectOption('star');
  assert((await last(page)).includes('Made “Nap time” a Star (bonus points) space'), `Make it a… ⭐ Star in ✎ Edit board is a step (${await last(page)})`);
  assert((await stageSpaces(page).allInnerTexts()).some((t) => t.includes('⭐')), 'the star shows in its circle on the stage');
  await kinds.blur();
  await page.keyboard.press('Control+z');
  assert(!(await stageSpaces(page).allInnerTexts()).some((t) => t.includes('⭐')), 'and Ctrl+Z takes it back');
  await page.locator('[data-board-editing] [data-show-name]').blur();
  // Esc lets go of what's picked, then ends editing.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('[data-board-editing]').waitFor({ state: 'detached' });
  assert(!(await layer.count()) && (await mainLabel(page)) !== '✓ Done editing', 'Esc (again) ends editing');
  assert((await page.locator('.stage-box .space .label').allInnerTexts()).join() === 'Nap time', 'playing: the stage shows only the name ticked to show');
  if (shots) await page.screenshot({ path: `${shots}/names-playing.png` });
  await page.keyboard.press('Control+z');
  assert((await page.locator('.stage-box .space .label').count()) === 0, 'Ctrl+Z hides it again');
  // No Keep in game: the editor's game is as it was.
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await page.locator('nav > button.round-tab', { hasText: 'Board game' }).click();
  const edSpaces = page.locator('.canvas [data-space]');
  await edSpaces.first().waitFor();
  assert((await edSpaces.count()) === 6 && !(await edSpaces.allInnerTexts()).some((t) => t.includes('Space 7')), 'without 💾 Keep in game, the game in the editor is unchanged');
  await ctx.close();

  // ---------- A wide window with an audience window: the side column ----------
  console.log('Beside the stage, with an audience window:');
  const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await ctx2.newPage();
  host.on('pageerror', (e) => errors.push(`[side] ${e.message}`));
  const aud = await start(host, true);
  aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
  await host.locator('.panel.side').waitFor();
  await host.getByLabel('Steps').fill('1');
  await host.getByLabel('Steps').press('Enter');
  assert((await mainLabel(host)) === 'Next turn ▶', 'side column: moved, Next turn ▶');
  await besideMain(host, 'side column');
  if (shots) await host.screenshot({ path: `${shots}/side-next-turn.png` });
  await aud.locator('[data-space]').first().waitFor();
  const audN = await aud.locator('[data-space]').count();
  await host.getByRole('button', { name: /Edit board/ }).click();
  await host.locator('[data-board-editing]').waitFor();
  assert((await host.locator('[data-board-editing]').innerText()).includes('not the dashed marks'), 'with an audience window: viewers see the changes, not the marks');
  const hl = host.locator('.stage-box [data-board-edit]');
  const b = await box(hl);
  await host.keyboard.down('Control');
  await host.mouse.click(b.x + (1000 * b.width) / 1920, b.y + (560 * b.height) / 1080);
  await host.keyboard.up('Control');
  assert((await stageSpaces(host).count()) === audN + 1, 'Ctrl+click adds a space');
  await aud.waitForFunction((n) => document.querySelectorAll('[data-space]').length === n + 1, audN);
  assert(true, 'the audience window follows');
  assert(!(await aud.locator('[data-board-edit], [data-picked-space]').count()), 'the audience window shows none of the editing marks');
  // Names: hidden in the audience window; the host, editing, sees them dimmed.
  assert((await aud.locator('.space .label').count()) === 0, 'the audience window shows no space names by default');
  assert((await host.locator('.stage-box .space .label[data-name-hidden]').count()) === audN + 1, 'the host, editing, sees them all dimmed');
  await host.mouse.click(b.x + (300 * b.width) / 1920, b.y + (300 * b.height) / 1080, { button: 'right' });
  await host.getByRole('menu').getByRole('menuitem', { name: '👁 Show name' }).click();
  await aud.waitForFunction(() => document.querySelectorAll('.space .label').length === 1);
  assert((await aud.locator('.space .label').allInnerTexts()).join() === 'Start' && (await names(host)).join() === 'Start', 'right-click ▸ Show name: the audience sees that one name');
  await host.locator('[data-board-editing] [data-names-all="show"]').click();
  await aud.waitForFunction((n) => document.querySelectorAll('.space .label').length === n, audN + 1);
  assert((await last(host)).includes('Showed all space names'), 'Names: Show all shows every name, one step');
  await host.keyboard.press('Control+z');
  await aud.waitForFunction(() => document.querySelectorAll('.space .label').length === 1);
  assert(true, 'Ctrl+Z takes it back');
  if (shots) {
    await host.screenshot({ path: `${shots}/side-editing.png` });
    await aud.screenshot({ path: `${shots}/audience-follows.png` });
  }
  // 💾 Keep in game: the editor's game gets the new space.
  await host.locator('[data-board-editing]').getByRole('button', { name: '💾 Keep in game' }).click();
  assert((await host.locator('.toast').innerText()).includes('Kept the board'), '💾 Keep in game keeps the board');
  await host.keyboard.press('e');
  await host.locator('[data-board-editing]').waitFor({ state: 'detached' });
  assert(true, 'E ends editing too');
  assert((await host.locator('.stage-box .space .label').allInnerTexts()).join() === 'Start', 'not editing, the host’s copy shows the names as the audience sees them');
  if (shots) {
    await host.screenshot({ path: `${shots}/names-host-dual.png` });
    await aud.screenshot({ path: `${shots}/names-audience.png` });
  }
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await host.locator('nav > button.round-tab', { hasText: 'Board game' }).click();
  const ed2 = host.locator('.canvas [data-space]');
  await ed2.first().waitFor();
  assert((await ed2.count()) === 7 && (await ed2.allInnerTexts()).some((t) => t.includes('Space 7')), 'and the game in the editor has the new space');
  assert((await host.locator('.canvas .label:not([data-name-hidden])').allInnerTexts()).join() === 'Start', 'and Start’s name shown');
  if (shots) await host.screenshot({ path: `${shots}/names-editor.png` });
  await ctx2.close();

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('boardedit: all passed');
} catch (e) {
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
