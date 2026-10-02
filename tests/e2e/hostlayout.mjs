// The host panel's layout holds in every state: the fixed bar (↶ Undo, 📜 Log, 🚪 Exit) stays put from the board to a
// clue, a Daily Double, the Final, an RPG and a board-game round and the end screen; there's never more than one main
// (.primary) button, and one where the moment has a next step; a confirmation is one strip above the fixed bar (the
// panel grows by that strip, nothing overlaps); and beside the stage (RPG and board-game rounds on a wide window) the
// fixed bar is a grid with 🚪 Exit in its bottom-right cell.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, mainButton, mainLabel, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// A game with every kind of round: a board (a Daily Double on its first Speedruns tile), an RPG round, a board game and
// a Final.
const text = (id, t) => ({ id, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 72, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
let n = 0;
const clue = (q, a, more = {}) => ({ id: `c${++n}`, value: null, type: 'standard', questionSlide: slide(`q${n}`, q), answerSlide: slide(`a${n}`, a), ...more });
const cats = ['Memes', 'Skibidi Lore', 'Minecraft', 'Rizz', 'Speedruns'];
const board = {
  id: 'r_board', name: 'Jeopardy!', mode: 'board', values: [200, 400, 600, 800, 1000], dailyDoubleCount: 1,
  categories: cats.map((c, ci) => ({
    id: `cat${ci}`,
    title: c,
    clues: [0, 1, 2, 3, 4].map((ri) => (ci === 4 && ri === 0 ? clue('A Daily Double', 'Its answer', { type: 'dailyDouble' }) : clue(`${c} ${ri}`, `Answer ${ci}.${ri}`))),
  })),
};
const screens = [0, 1].map((c) => ({ id: `sc_${c}`, name: `Field ${c}`, col: c, row: 0, slide: { background: { color: '#553322' }, elements: [] } }));
const sp = (id, name, x, y, next) => ({ id, name, x, y, color: '#4363d8', next });
const game = {
  id: 'g_layout', version: 2, title: 'Layout Night',
  settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 15, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8 },
  players: ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 500 })),
  rounds: [
    board,
    { id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' },
    { id: 'r_bg', name: 'Board game', mode: 'boardgame', slide: { background: { color: '#1d5e3a' }, elements: [] }, spaces: [sp('b0', 'Start', 300, 300, ['b1']), sp('b1', 'Middle', 900, 300, ['b2']), sp('b2', 'Finish', 1500, 300, [])], mover: { kind: 'dice', dice: 'dp1' }, zones: [] },
    { id: 'r_final', name: 'Final Jeopardy!', mode: 'final', category: 'Internet History', questionSlide: slide('fq', 'The first video'), answerSlide: slide('fa', 'Me at the zoo'), timerSeconds: 30, allowNonPositive: true },
  ],
  media: [], audio: {}, theme: {}, wheels: [],
  dice: [{ id: 'dp1', name: 'Move die', dice: [{ id: 'd1', sides: 6, count: 1 }], showTotal: true }],
  statFields: [], items: [],
  worlds: [{ id: 'w1', name: 'World', maps: [{ id: 'm1', name: 'Overworld', cols: 2, rows: 1, screens, visibility: 'discovered', showExits: true, revealNeighbors: true, diagonals: true, wrap: false, transition: 'cut' }] }],
};
mkdirSync(resolve('test-results'), { recursive: true });
const gameFile = resolve('test-results/hostlayout.json');
writeFileSync(gameFile, JSON.stringify(game));

try {
  // 1280×900: not wide for its height, so the panel stays under the stage in every round.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.panel').waitFor();
  // (Its categories are revealed with a click: skip that.)
  if (await page.getByRole('button', { name: 'Skip intro' }).count()) await page.getByRole('button', { name: 'Skip intro' }).click();

  const btn =(name) => page.locator('.panel .fixed').getByRole('button', { name, exact: true });
  const box = async (l) => {
    const b = await l.boundingBox();
    return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  /** Where the fixed bar's buttons are, and how many main buttons the panel shows. */
  async function look() {
    await page.waitForTimeout(450);
    return {
      exit: await box(btn('🚪 Exit')),
      undo: await box(btn('↶ Undo')),
      log: await box(btn('📜 Log')),
      primaries: await page.locator('.panel button.primary:visible').count(),
    };
  }
  const states = {};
  const nextRound = async () => {
    await page.waitForTimeout(450);
    await page.locator('.rn button', { hasText: '▶' }).click();
    await confirmStrip(page).waitFor();
    await page.waitForTimeout(450);
    await confirmStrip(page).getByRole('button', { name: 'Yes', exact: true }).click();
  };

  console.log('The fixed bar stays put, one main button at most:');
  states.board = await look();
  await page.locator('.stage-box .board .tile').first().click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  states.clue = await look();
  assert((await mainLabel(page)) === '👁 Reveal answer', 'in a clue the main button is 👁 Reveal answer');
  await page.keyboard.press('1');
  states.answering = await look();
  assert((await page.locator('.panel .award button.primary').innerText()).includes('Award Ann'), 'someone answering: ＋ Award is the main button (the NEXT cell goes quiet)');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();
  // The Daily Double: its wager, then its question.
  await page.locator('.stage-box .board .tile').nth(4).click();
  await page.locator('.dd input[type=number]').waitFor();
  states.ddWager = await look();
  assert((await mainLabel(page)) === 'Show question ▶' && (await mainButton(page).isDisabled()), 'the Daily Double’s main button is Show question ▶, off until there’s a wager');
  await page.locator('.dd .chip', { hasText: 'Bob' }).click();
  await page.locator('.dd input[type=number]').fill('100');
  await mainButton(page).click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
  states.ddQuestion = await look();
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();

  // A confirmation is one strip above the fixed bar: the panel grows by that strip only, and nothing overlaps.
  const panelH = (await box(page.locator('.panel'))).h;
  await page.waitForTimeout(450);
  await btn('🚪 Exit').click();
  await confirmStrip(page).waitFor();
  const strip = await box(confirmStrip(page));
  const grown = (await box(page.locator('.panel'))).h - panelH;
  assert(grown <= strip.h + 12, `Exit asks in one strip: the panel grows by that strip only (${grown}px, the strip ${strip.h}px)`);
  const fixedBar = await box(page.locator('.panel .fixed'));
  assert(strip.y + strip.h <= fixedBar.y && strip.w > fixedBar.w * 0.9, 'the strip spans the panel, right above the fixed bar (no button under it)');
  const exitAsked = await box(btn('🚪 Exit'));
  assert(exitAsked.x === states.board.exit.x, '🚪 Exit keeps its place while it asks');
  await confirmStrip(page).getByRole('button', { name: 'Stay' }).click();
  await confirmStrip(page).waitFor({ state: 'detached' });

  await nextRound();
  await page.locator('.panel .status', { hasText: 'Adventure' }).waitFor();
  states.rpg = await look();
  await nextRound();
  await page.locator('.panel .status', { hasText: 'Board game' }).waitFor();
  states.boardgame = await look();
  assert((await mainLabel(page)) === 'Next turn ▶', 'a board-game round’s main button is Next turn ▶');
  // Leaving an RPG or board-game round always asks (nothing to count there), quietly.
  await page.waitForTimeout(450);
  const leave = page.locator('.rn button', { hasText: '▶' });
  assert(!(await leave.evaluate((b) => b.classList.contains('primary'))), 'its Next round ▶ is a quiet button');
  await leave.click();
  assert((await confirmStrip(page).innerText()).includes('Leave Board game?'), 'and leaving it asks first (“Leave Board game?”)');
  await page.waitForTimeout(450);
  await confirmStrip(page).getByRole('button', { name: 'Yes', exact: true }).click();
  await page.locator('.fj').waitFor();
  await page.locator('.fj .wagers input[data-wager]').first().waitFor();
  states.wagers = await look();
  assert((await mainLabel(page)) === 'Show question ▶', `the Final opens on its wager screen, Show question its main button (${await mainLabel(page)})`);
  const wagers = page.locator('.fj .wagers input[data-wager]');
  for (let i = 0; i < (await wagers.count()); i++) await wagers.nth(i).fill('0');
  for (const label of ['Show question ▶', 'Reveal answer ▶', 'Start player reveals ▶']) {
    await page.waitForFunction((l) => document.querySelector('.panel [data-next]')?.textContent?.startsWith(l), label);
    await mainButton(page).click();
  }
  await page.locator('.fj .pl').first().waitFor();
  states.reveals = await look();
  for (let i = 0; i < 3; i++) await page.locator('.fj .pl').nth(i).getByRole('button', { name: '✔ Right' }).click();
  await mainButton(page).click();
  await page.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  states.end = await look();
  assert((await mainLabel(page)) === '❓ Tiebreaker clue' || (await mainLabel(page)) === '🎲 Tiebreaker roll-off', `a tie for first: settling it is the main button (${await mainLabel(page)})`);

  for (const what of ['exit', 'undo', 'log']) {
    const at = Object.entries(states).map(([k, v]) => `${k} ${v[what].x},${v[what].y}`);
    const same = Object.values(states).every((v) => v[what].x === states.board[what].x && v[what].y === states.board[what].y);
    assert(same, `${what === 'exit' ? '🚪 Exit' : what === 'undo' ? '↶ Undo' : '📜 Log'} is in the same place in every state (${at.join(' · ')})`);
  }
  const counts = Object.fromEntries(Object.entries(states).map(([k, v]) => [k, v.primaries]));
  assert(Object.values(counts).every((c) => c <= 1), `never more than one main button (${JSON.stringify(counts)})`);
  assert(['clue', 'answering', 'ddWager', 'ddQuestion', 'boardgame', 'wagers', 'reveals', 'end'].every((k) => counts[k] === 1), 'and exactly one where there’s a next step');

  // Beside the stage (a wide window, RPG and board-game rounds): 🚪 Exit in the fixed bar's bottom-right cell, in both.
  console.log('Beside the stage:');
  const wide = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await wide.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(pathToFileURL(file).href);
  await openGameFile(p2, gameFile);
  await p2.getByText(/^Opened “/).waitFor();
  await p2.getByRole('button', { name: '▶ Play' }).click();
  // A double-click on Start game ▶: its second click lands on the host panel's fixed bar, and does nothing there.
  await p2.getByRole('button', { name: 'Start game ▶' }).dblclick();
  await p2.locator('.panel').waitFor();
  await p2.waitForTimeout(500);
  assert(wide.pages().length === 1 && (await p2.locator('.panel .confirm').count()) === 0, 'a double-click on Start game ▶ opens no audience window and asks nothing');
  const exitIn = async () => {
    await p2.waitForTimeout(450);
    const e = await p2.locator('.panel .fixed').getByRole('button', { name: '🚪 Exit' }).boundingBox();
    const f = await p2.locator('.panel .fixed').boundingBox();
    return { x: Math.round(e.x + e.width), y: Math.round(e.y + e.height), right: Math.round(f.x + f.width), bottom: Math.round(f.y + f.height) };
  };
  const p2Next = async (name) => {
    await p2.waitForTimeout(450);
    await p2.locator('.rn button', { hasText: '▶' }).click();
    await p2.waitForTimeout(450);
    await p2.locator('.panel .confirm').getByRole('button', { name: 'Yes', exact: true }).click();
    await p2.locator('.panel .status', { hasText: name }).waitFor();
  };
  await p2Next('Adventure');
  assert(await p2.locator('.play.side').count(), 'an RPG round on a wide window puts the panel beside the stage');
  const inRpg = await exitIn();
  await p2Next('Board game');
  const inBg = await exitIn();
  assert(inRpg.x === inBg.x && inRpg.y === inBg.y, `🚪 Exit is in the same place in RPG and board-game rounds (${inRpg.x},${inRpg.y})`);
  assert(inBg.right - inBg.x < 4 && inBg.bottom - inBg.y < 4, 'in the fixed bar’s bottom-right cell');
  await p2Next('Final');
  assert((await p2.locator('.play.side').count()) === 0, 'the Final uses the panel under the stage');
  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Host layout e2e passed');
} finally {
  await browser.close();
}
