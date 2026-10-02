// The host panel's layout holds in every state: the fixed bar (↶ Undo, 📜 Log, 🚪 Exit) stays put from the board to a
// clue, a Daily Double, the Final, an RPG and a board-game round and the end screen; there's never more than one main
// (.primary) button, and one where the moment has a next step; a confirmation is one strip above the fixed bar (the
// panel grows by that strip, nothing overlaps); and beside the stage (RPG and board-game rounds on a wide window) the
// fixed bar is a grid with 🚪 Exit in its bottom-right cell. A Daily Double with three question slides keeps Next slide ▶
// the main button until its last slide (viewers see where it is: ● ● ○), a board game's own roll doesn't take the main
// button from the round, a confirmation leaves one main button (its own), ✔ / ✘ hand the focus to the main button, and
// on a narrow window the fixed bar stays on one line (🚪 Exit at the right).
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
    clues: [0, 1, 2, 3, 4].map((ri) => (ci === 4 && ri === 0 ? clue('A Daily Double', 'Its answer', { type: 'dailyDouble', extraSlides: [2, 3].map((k) => ({ id: `dx${k}`, ...slide(`dxs${k}`, `Daily Double slide ${k}`) })) }) : clue(`${c} ${ri}`, `Answer ${ci}.${ri}`))),
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
  // (Its categories are revealed with a click: the status line says where that's at, not "Pick a tile". Skip it.)
  await page.getByRole('button', { name: 'Skip intro' }).waitFor();
  const introStatus = await page.locator('.panel .status').innerText();
  assert(/Revealing the categories: \d+ of \d+/.test(introStatus) && !introStatus.includes('Pick a tile'), `during the category reveal the status line says so (${introStatus.replace(/\s+/g, ' ')})`);
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // 🙈 Hide in one window: the first time, a note says how to get the controls back.
  await page.getByRole('button', { name: '🙈 Hide', exact: true }).click();
  await page.locator('.toast', { hasText: 'Press H to bring the controls back' }).waitFor();
  await page.keyboard.press('h');
  await page.getByRole('button', { name: '🙈 Hide', exact: true }).waitFor();
  assert(true, '🙈 Hide says “Press H to bring the controls back” the first time, and H does');

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
  // ✔ greys out once pressed: the focus goes on to the main button, not lost to the page.
  await page.getByRole('button', { name: /^Right: Ann/ }).click();
  await page.waitForTimeout(100);
  assert(await mainButton(page).evaluate((b) => b === document.activeElement), '✔ pressed (it greys out): the focus goes to the main button');
  await page.keyboard.press('Control+z');
  // (Undone: the scores are tied again, as the end of this test wants.)
  await page.waitForFunction(() => document.querySelector('.panel .fixed button')?.title === 'Nothing to undo');
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
  assert((await page.locator('.panel .status').innerText()).includes('Daily Double: who found it, and their wager'), 'the status line says what the Daily Double screen wants (no lone “·”)');
  assert((await mainLabel(page)) === 'Show question ▶' && (await mainButton(page).isDisabled()), 'the Daily Double’s main button is Show question ▶, off until there’s a wager');
  await page.locator('.dd .chip', { hasText: 'Bob' }).click();
  // (The picked chip is filled with the player's color: their score on it reads like their name.)
  const ddScore = await page.locator('.dd .chip[aria-pressed="true"] .score').evaluate((el) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [x, y] = [lum(getComputedStyle(el).color), lum(getComputedStyle(el.closest('.chip')).backgroundColor)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  });
  assert(ddScore >= 4.5, `the Daily Double's picked player chip shows their score at ${ddScore.toFixed(2)}:1`);
  await page.locator('.dd input[type=number]').fill('100');
  await mainButton(page).click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
  assert((await page.getByRole('button', { name: /^− Deduct Bob/ }).count()) === 1, '− Deduct names the player, like ＋ Award (− Deduct Bob)');
  states.ddQuestion = await look();
  // Its player is picked (＋ Award Bob is ready), but there are slides still to show: Next slide ▶ is the main button.
  assert(
    (await mainLabel(page)) === 'Next slide ▶' && (await mainButton(page).evaluate((b) => b.classList.contains('primary'))),
    'a Daily Double with three slides: Next slide ▶ is the main button, its player picked or not',
  );
  const pips = page.locator('.stage-box [data-slide-pips]');
  assert((await pips.getAttribute('aria-label')) === 'Slide 1 of 3', 'viewers see where the clue is (Slide 1 of 3, as dots)');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Slide 3 of 3'));
  assert((await pips.getAttribute('aria-label')) === 'Slide 3 of 3', 'the dots follow the slides');
  assert((await page.locator('.panel .award button.primary').innerText()).includes('Award Bob'), 'on its last slide ＋ Award is the main button');
  await page.keyboard.press('r');
  await pips.waitFor({ state: 'detached' });
  assert(true, 'the dots go when the answer shows');
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
  assert((await mainLabel(page)) === '🎲 Roll', `a board-game turn’s main button is 🎲 Roll first (${await mainLabel(page)})`);
  // Its own roll (D) is the round's: ▶ Move (Enter) is next, so its dice don't take the main button with a Close.
  await page.keyboard.press('d');
  await page.locator('.panel [data-tool-controls]').waitFor();
  await page.waitForTimeout(1500);
  assert(/^▶ Move -?\d+$/.test(await mainLabel(page)), `the round’s own roll makes ▶ Move the main button, not the dice’s Close (${await mainLabel(page)})`);
  await page.keyboard.press('Escape');
  // Leaving an RPG or board-game round always asks (nothing to count there), quietly.
  await page.waitForTimeout(450);
  const leave = page.locator('.rn button', { hasText: '▶' });
  assert(!(await leave.evaluate((b) => b.classList.contains('primary'))), 'its Next round ▶ is a quiet button');
  await leave.click();
  assert((await confirmStrip(page).innerText()).includes('Leave Board game?'), 'and leaving it asks first (“Leave Board game?”)');
  assert(
    (await page.locator('.panel button.primary:visible').count()) === 1 && (await confirmStrip(page).locator('button.primary').count()) === 1,
    'while it asks, its answer is the one main button (the round’s goes quiet)',
  );
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
  // A narrow, short window (1024×600): the fixed bar on one line, 🚪 Exit at its right, on the board and in a clue.
  console.log('A narrow window:');
  const narrow = await browser.newContext({ viewport: { width: 1024, height: 600 } });
  const p3 = await narrow.newPage();
  p3.on('pageerror', (e) => errors.push(e.message));
  await p3.goto(pathToFileURL(file).href);
  await openGameFile(p3, gameFile);
  await p3.getByText(/^Opened “/).waitFor();
  await p3.getByRole('button', { name: '▶ Play' }).click();
  await p3.getByRole('button', { name: 'Start game ▶' }).click();
  await p3.locator('.panel').waitFor();
  if (await p3.getByRole('button', { name: 'Skip intro' }).count()) await p3.getByRole('button', { name: 'Skip intro' }).click();
  const oneLine = async (where) => {
    const bar = p3.locator('.panel .fixed');
    const u = await bar.getByRole('button', { name: '↶ Undo' }).boundingBox();
    const e = await bar.getByRole('button', { name: '🚪 Exit' }).boundingBox();
    const f = await bar.boundingBox();
    assert(Math.abs(u.y - e.y) < 2 && f.x + f.width - (e.x + e.width) < 2, `${where}: ↶ Undo and 🚪 Exit on one line, Exit at the right`);
  };
  await oneLine('on the board');
  // Several wheels, edited: one edit box at a time, and a tall one scrolls in the panel, never up over the stage.
  await p3.getByRole('button', { name: '🎡 Wheel' }).click();
  await p3.getByRole('button', { name: '🎯 Pick a player', exact: true }).click();
  for (let i = 0; i < 2; i++) await p3.getByLabel('Spin another wheel too').selectOption({ label: '🎯 Pick a player' });
  await p3.getByRole('button', { name: /✎ Edit wheel/ }).click();
  await p3.getByRole('button', { name: 'Edit Pick a player for this spin' }).first().click();
  assert((await p3.getByRole('button', { name: 'Even chances' }).count()) === 1, 'one wheel’s edit box open at a time');
  // A short window: the panel has less room than the edit box needs.
  await p3.setViewportSize({ width: 1024, height: 480 });
  await p3.waitForTimeout(300);
  const stage = await p3.locator('.stage-area').boundingBox();
  const action = await p3.locator('.panel .act > .action').boundingBox();
  assert(action.y >= stage.y + stage.height - 1, `the edit box stays under the stage (it starts at ${Math.round(action.y)}, the stage ends at ${Math.round(stage.y + stage.height)})`);
  assert(await p3.locator('.panel .act > .action').evaluate((a) => [a, ...a.querySelectorAll('.mode-host')].some((e) => e.scrollHeight > e.clientHeight + 4)), 'and scrolls inside the panel');
  const exitBox = await p3.getByRole('button', { name: '🚪 Exit' }).boundingBox();
  assert(exitBox.y + exitBox.height <= 480, 'the fixed bar stays in the window');
  await p3.setViewportSize({ width: 1024, height: 600 });
  await p3.locator('[data-tool-controls]').getByRole('button', { name: '✕ Close' }).click();
  await p3.locator('[data-tool-controls]').waitFor({ state: 'detached' });
  await p3.locator('.stage-box .board .tile').first().click();
  await p3.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  await oneLine('in a clue');
  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Host layout e2e passed');
} finally {
  await browser.close();
}
