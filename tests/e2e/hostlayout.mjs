// The host panel's layout holds in every state: the fixed bar (↶ Undo, 📜 Log, 🚪 Exit) stays put from the board to a
// clue, a Daily Double, the Final, an RPG and a board-game round and the end screen; there's never more than one main
// (.primary) button, and one where the moment has a next step; a confirmation is one strip above the fixed bar (the
// panel grows by that strip, nothing overlaps); and beside the stage (RPG and board-game rounds on a wide window) the
// fixed bar is a grid with 🚪 Exit in its bottom-right cell. A Daily Double with three question slides keeps Next slide ▶
// the main button until its last slide (viewers see where it is: ● ● ○), a board game's own roll doesn't take the main
// button from the round, a confirmation leaves one main button (its own), ✔ / ✘ hand the focus to the main button, and
// on a narrow window the fixed bar stays on one line (🚪 Exit at the right). With six players in a single window (at
// 1366×768, 1200×720 and 1024×768) the stage keeps one size from the board to a clue and with a player picked (on a
// $1,000 clue too: a long name is cut short on ＋ Award and − Deduct, never the amount), 🔊 Sound opens in the host
// panel, and every Final wager box is in sight.
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
  settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 15, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8, stream: { clueCaption: true } },
  players: ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 500 })),
  rounds: [
    board,
    { id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' },
    { id: 'r_bg', name: 'Board game', mode: 'boardgame', slide: { background: { color: '#1d5e3a' }, elements: [] }, spaces: [sp('b0', 'Start', 300, 300, ['b1']), sp('b1', 'Middle', 900, 300, ['b2']), sp('b2', 'Finish', 1500, 300, [])], mover: { kind: 'dice', dice: 'dp1' }, zones: [] },
    { id: 'r_final', name: 'Final Jeopardy!', mode: 'final', category: 'Internet History', questionSlide: slide('fq', 'The first video'), extraSlides: [{ id: 'fx2', ...slide('fq2', 'Uploaded in 2005') }], answerSlide: slide('fa', 'Me at the zoo'), timerSeconds: 30, allowNonPositive: true },
  ],
  media: [], audio: {}, theme: {}, wheels: [],
  dice: [{ id: 'dp1', name: 'Move die', dice: [{ id: 'd1', sides: 6, count: 1 }], showTotal: true }],
  statFields: [], items: [],
  // A tiebreaker with two question slides (a lead-in, then the question).
  tiebreaker: { questionSlide: slide('tq1', 'Tiebreaker lead-in'), extraSlides: [{ id: 'tx2', ...slide('tq2', 'Tiebreaker question') }], answerSlide: slide('ta', 'Tiebreaker answer') },
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
  // (Its whole label is its name: on the button the player's name is apart, to be cut short on a crowded row.)
  assert((await page.locator('.panel .award button.primary').getAttribute('aria-label')).includes('Award Ann'), 'someone answering: ＋ Award is the main button (the NEXT cell goes quiet)');
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
  // A double-click on Show question ▶: its second click doesn't land on what the button turns into (Next slide ▶ here,
  // 👁 Reveal answer on a one-slide clue).
  await mainButton(page).dblclick();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
  await page.waitForTimeout(200);
  assert(
    /Next slide/.test(await mainLabel(page)) && (await page.locator('.panel .status').innerText()).includes('Answer hidden'),
    `a double-click on Show question ▶ only shows the question: no slide skipped, no answer shown (main button: ${await mainLabel(page)})`,
  );
  assert((await page.getByRole('button', { name: /^− Deduct Bob/ }).count()) === 1, '− Deduct names the player, like ＋ Award (− Deduct Bob)');
  states.ddQuestion = await look();
  // Its player is picked (＋ Award Bob is ready), but there are slides still to show: Next slide ▶ is the main button.
  assert(
    (await mainLabel(page)) === 'Next slide ▶' && (await mainButton(page).evaluate((b) => b.classList.contains('primary'))),
    'a Daily Double with three slides: Next slide ▶ is the main button, its player picked or not',
  );
  const pips = page.locator('.stage-box [data-slide-pips]');
  assert((await pips.getAttribute('aria-label')) === 'Slide 1 of 3', 'viewers see where the clue is (Slide 1 of 3, as dots)');
  // A long clue caption stops short of the dots instead of running under them.
  const capGap = await page.evaluate(() => {
    const cap = document.querySelector('.stage-box .caption');
    if (!cap) return null;
    cap.textContent = 'A VERY LONG CATEGORY NAME FOR THE CAPTION · '.repeat(4);
    return document.querySelector('.stage-box [data-slide-pips]').getBoundingClientRect().left - cap.getBoundingClientRect().right;
  });
  assert(capGap !== null && capGap > 0, `a long clue caption ends before the slide dots (gap ${capGap}px)`);
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Slide 3 of 3'));
  assert((await pips.getAttribute('aria-label')) === 'Slide 3 of 3', 'the dots follow the slides');
  assert((await page.locator('.panel .award button.primary').getAttribute('aria-label')).includes('Award Bob'), 'on its last slide ＋ Award is the main button');
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
  // The keys go back to what asked, not to the panel's first button (↶ Reopen …, which would change the game).
  await page.waitForFunction(() => document.activeElement?.matches('.panel .fixed button') && document.activeElement.textContent?.includes('🚪 Exit'));
  assert(true, 'Stay gives the keys back to 🚪 Exit');

  await nextRound();
  await page.locator('.panel .status', { hasText: 'Adventure' }).waitFor();
  // A round with no tile to pick (nor a title card here): the keys go on from its own controls, not the timer's Start.
  await page.waitForFunction(() => document.activeElement?.matches('.panel .mode-host button'));
  assert(true, `Yes into an Adventure round puts the keys on its own controls (${await page.evaluate(() => document.activeElement?.textContent?.trim())})`);
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
  // (Its question has two slides: Next slide ▶ first, viewers see where it is.)
  for (const label of ['Show question ▶', 'Next slide ▶', 'Reveal answer ▶', 'Start player reveals ▶']) {
    await page.waitForFunction((l) => document.querySelector('.panel [data-next]')?.textContent?.startsWith(l), label);
    if (label === 'Next slide ▶')
      assert(
        (await page.locator('.stage-box [data-slide-pips]').getAttribute('aria-label')) === 'Slide 1 of 2' && (await page.locator('.stage-box').innerText()).includes('The first video'),
        "a Final with two question slides shows its first, Next slide ▶ the main button (● ○ on stream)",
      );
    if (label === 'Reveal answer ▶') assert((await page.locator('.stage-box').innerText()).includes('Uploaded in 2005'), 'then its second slide, then Reveal answer ▶');
    await mainButton(page).click();
  }
  await page.locator('.fj .pl').first().waitFor();
  states.reveals = await look();
  // Finished early with nobody judged, Ctrl+Z on the results goes back into the Final: its answer, then its question.
  await page.locator('.fj button.ghost', { hasText: 'Finish game ▶' }).click();
  await page.waitForTimeout(450);
  await confirmStrip(page).getByRole('button', { name: 'Finish', exact: true }).click();
  await page.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  await page.locator('.panel .status').click();
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: 'Answer on screen' }).waitFor();
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: 'Question on screen' }).waitFor();
  assert(true, 'finished early with nobody judged, Ctrl+Z on the results goes back to the Final’s answer, then its question');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await page.locator('.panel .status', { hasText: 'Player reveals' }).waitFor();
  for (let i = 0; i < 3; i++) await page.locator('.fj .pl').nth(i).getByRole('button', { name: '✔ Right' }).click();
  await mainButton(page).click();
  await page.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  states.end = await look();
  assert((await mainLabel(page)) === '❓ Tiebreaker clue', `a tie for first: settling it is the main button (${await mainLabel(page)})`);
  // The tiebreaker's question slides come one at a time (N), as on a clue, then the answer.
  await mainButton(page).click();
  const tbPips = page.locator('.stage-box [data-slide-pips]');
  await tbPips.waitFor();
  assert(
    (await tbPips.getAttribute('aria-label')) === 'Slide 1 of 2' && (await page.locator('.stage-box').innerText()).includes('Tiebreaker lead-in') && (await mainLabel(page)) === 'Next slide ▶',
    'a tiebreaker with two question slides opens on its first, Next slide ▶ the main button (viewers see ● ○)',
  );
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.stage-box [data-slide-pips]')?.getAttribute('aria-label') === 'Slide 2 of 2');
  assert((await page.locator('.stage-box').innerText()).includes('Tiebreaker question') && (await mainLabel(page)) === '👁 Reveal answer', 'N shows its second slide, then 👁 Reveal answer is the main button');
  await page.keyboard.press('Shift+N');
  await page.waitForFunction(() => document.querySelector('.stage-box [data-slide-pips]')?.getAttribute('aria-label') === 'Slide 1 of 2');
  assert(true, 'Shift+N goes back a slide');
  await page.keyboard.press('n');
  await page.keyboard.press('r');
  await tbPips.waitFor({ state: 'detached' });
  assert((await page.locator('.stage-box').innerText()).includes('Tiebreaker answer'), 'R reveals its answer (the dots go)');
  // The winner selected and ＋ Award at Amount 0: the panel says who won. Selecting the other tied player instead changes it.
  const pts = (await page.locator('.panel .p .score').allInnerTexts()).map((t) => Number(t.replace('−', '-').replace(/[^\d-]/g, '')));
  const tiedAt = pts.flatMap((v, i) => (v === Math.max(...pts) ? [i] : []));
  const chipName = async (i) => (await page.locator('.panel .p .sel').nth(i).innerText()).replace(/^\d+\s*/, '').trim();
  const [first, other] = [await chipName(tiedAt[0]), await chipName(tiedAt[1])];
  await page.locator('.panel .status').click();
  await page.keyboard.press(String(tiedAt[0] + 1));
  await page.keyboard.press('Enter');
  await page.locator('.panel .status', { hasText: `${first} won the tiebreaker: 🏁 Back to results` }).waitFor();
  assert(true, `once ${first} is picked (Amount 0), the panel says so and to go back to the results`);
  await page.keyboard.press(String(tiedAt[1] + 1));
  await page.keyboard.press('Enter');
  await page.locator('.panel .status', { hasText: `${other} won the tiebreaker` }).waitFor();
  assert(!(await page.locator('.toast').allInnerTexts()).some((t) => t.includes('isn’t tied for first')), `selecting ${other} (tied too) and ＋ Award changes the winner (not "isn’t tied for first")`);
  // Ctrl+Z on the tiebreaker clue: its picks undo there, one at a time. Then the last Final judgment goes back to the
  // reveals (not out of sight), that player unjudged, the tiebreaker's countdown stopped.
  await page.keyboard.press('t');
  await page.locator('.stage-box .timer').waitFor();
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: `${first} won the tiebreaker` }).waitFor();
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: 'Select the winner' }).waitFor();
  assert((await page.locator('.panel .status').innerText()).includes('Tiebreaker'), 'Ctrl+Z on the tiebreaker clue takes its picks back there, one at a time');
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: 'Player reveals' }).waitFor();
  assert(
    (await page.locator('.fj .pl').nth(2).getByRole('button', { name: '✔ Right' }).getAttribute('aria-pressed')) === 'false' && (await page.locator('.stage-box .timer').count()) === 0,
    'then Ctrl+Z goes back to the Final’s reveals, the last player unjudged there (the countdown stopped)',
  );

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
  assert((await p2.getByRole('button', { name: 'Start game ▶' }).locator('kbd').innerText()) === 'Ctrl+⏎', 'Start game ▶ shows its key (Ctrl+⏎) on it');
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
  // A toast beside the stage shows under the status line (its 📱 chip and ⏱ countdown stay in sight), over the panel.
  await p2.keyboard.press('Enter');
  const bgToast = p2.locator('.toast', { hasText: 'Roll first (D), or type the steps' });
  await bgToast.waitFor();
  const tb = await bgToast.boundingBox();
  const sideStatus = await p2.locator('.play > .panel > .status').boundingBox();
  const sidePanel = await p2.locator('.play > .panel').boundingBox();
  assert(
    tb.y >= sideStatus.y + sideStatus.height - 1 && tb.x >= sidePanel.x - 1,
    `beside the stage a toast shows under the status line, over the panel (it starts at ${Math.round(tb.y)}, the status line ends at ${Math.round(sideStatus.y + sideStatus.height)})`,
  );
  // A double-click on ◀ Prev round goes back one round, not two (its second click lands on the new ◀ Prev round).
  await p2.waitForTimeout(450);
  await p2.getByRole('button', { name: '◀ Prev round' }).dblclick();
  await p2.locator('.panel .status', { hasText: 'Adventure' }).waitFor();
  await p2.waitForTimeout(500);
  assert((await p2.locator('.panel .status', { hasText: 'Adventure' }).count()) === 1, 'a double-click on ◀ Prev round goes back one round (Adventure), not two');
  await p2Next('Board game');
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

  // A crowded single window (six players, longer names): the stage keeps one size from the board to a clue and with a
  // player picked (a $200 clue, then a $1,000 one), 🔊 Sound opens in the host panel (not over the stage), and every
  // Final wager box is in sight.
  console.log('A crowded single window:');
  const crowdFile = resolve('test-results/hostlayout-crowd.json');
  const crowd = ['Annabelle', 'Bobby Tables', 'Cyrus', 'Deedee', 'Eleanor', 'Frankie'];
  const crowdColors = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'];
  writeFileSync(
    crowdFile,
    JSON.stringify({ ...game, id: 'g_layout_crowd', players: crowd.map((name, i) => ({ id: `p${i + 1}`, name, color: crowdColors[i], startScore: 500 })), rounds: [board, game.rounds[3]] }),
  );
  for (const [w, h] of [
    [1366, 768],
    [1200, 720],
    [1024, 768],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p4 = await ctx.newPage();
    p4.on('pageerror', (e) => errors.push(e.message));
    await p4.goto(pathToFileURL(file).href);
    await openGameFile(p4, crowdFile);
    await p4.getByText(/^Opened “/).waitFor();
    await p4.getByRole('button', { name: '▶ Play' }).click();
    await p4.getByRole('button', { name: 'Start game ▶' }).click();
    await p4.getByRole('button', { name: 'Skip intro' }).click();
    await p4.locator('.stage-box .board .tile:not([disabled])').first().waitFor();
    const stageH = async () => Math.round((await p4.locator('.stage-box').boundingBox()).height);
    const onBoard = await stageH();
    assert((await p4.locator('.panel .p button.quick:visible').count()) === 0, `${w}×${h}: on the board the chips keep ✔ / ✘'s place, unseen`);
    for (const value of ['$200', '$1,000']) {
      await p4.locator('.stage-box .board .tile:not([disabled])', { hasText: value }).first().click();
      await p4.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
      const inClue = await stageH();
      await p4.keyboard.press('2');
      const award = p4.locator('.panel .award button.good', { hasText: 'Bobby Tables' });
      await award.waitFor();
      const picked = await stageH();
      assert(onBoard === inClue && inClue === picked, `${w}×${h}, a ${value} clue: the stage keeps one size from the board to a clue and with a player picked (${onBoard} / ${inClue} / ${picked})`);
      // (Only the name may be cut short: nothing runs past ＋ Award's or − Deduct's edge, so the amount shows whole.)
      const whole = await p4.locator('.panel .award button.named').evaluateAll((bs) => bs.length === 2 && bs.every((b) => b.scrollWidth <= b.clientWidth));
      assert(whole && (await award.textContent()).includes(`+${value}`), `${w}×${h}, a ${value} clue: ＋ Award and − Deduct show the whole amount`);
      await p4.keyboard.press('Escape');
      await p4.keyboard.press('Escape');
      await p4.locator('.stage-box .board').waitFor();
    }
    if (w === 1366) {
      await p4.locator('.panel').getByRole('button', { name: '🔊 Sound' }).click();
      const help = p4.getByRole('dialog', { name: 'Streaming the sound' });
      await help.waitFor();
      const hb = await help.boundingBox();
      const sb = await p4.locator('.stage-box').boundingBox();
      assert(hb.y >= sb.y + sb.height - 1, `🔊 Sound mid-game opens its help in the host panel, not over the stage (it starts at ${Math.round(hb.y)}, the stage ends at ${Math.round(sb.y + sb.height)})`);
      await p4.keyboard.press('Escape');
      await help.waitFor({ state: 'detached' });
    } else if (w === 1200) {
      // 👥 Players opens in the host panel: a toast said meanwhile stays off the stage too (at the panel's foot).
      await p4.locator('.panel').getByRole('button', { name: '👥 Players' }).click();
      const roster = p4.getByRole('dialog', { name: 'Players' });
      await roster.waitFor();
      await roster.getByLabel('Color for Cyrus').fill(crowdColors[1]);
      const clash = p4.locator('.toast', { hasText: 'Another player already has that color' });
      await clash.waitFor();
      const cb = await clash.boundingBox();
      const sb = await p4.locator('.stage-box').boundingBox();
      assert(cb.y >= sb.y + sb.height - 1, `${w}×${h}: with 👥 Players open in the host panel, a toast shows under the stage, not over it (it starts at ${Math.round(cb.y)}, the stage ends at ${Math.round(sb.y + sb.height)})`);
      await roster.getByRole('button', { name: 'Close', exact: true }).click();
      await roster.waitFor({ state: 'detached' });
    } else if (w === 1024) {
      await p4.waitForTimeout(450);
      await p4.locator('.rn button', { hasText: '▶' }).click();
      await confirmStrip(p4).waitFor();
      await p4.waitForTimeout(450);
      await confirmStrip(p4).getByRole('button', { name: 'Yes', exact: true }).click();
      await p4.locator('.fj .wagers input[data-wager]').first().waitFor();
      // (In sight: what's at the middle of each box is the box, not clipped by the panel's scrolling part.)
      const hidden = await p4.evaluate(() =>
        [...document.querySelectorAll('.fj input[data-wager], .fj input[data-limits]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== el;
          })
          .map((el) => el.getAttribute('aria-label') ?? 'Ignore the limits'),
      );
      assert(hidden.length === 0, `${w}×${h}: every wager box and “Ignore the limits” are in sight on the Final's wager screen${hidden.length ? ` (not: ${hidden.join(', ')})` : ''}`);
      assert((await p4.locator('.fj input[data-wager]').first().getAttribute('title')).startsWith('No limit now'), 'with the limits ignored, a wager box says so in its tooltip');
    }
    await ctx.close();
  }
  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Host layout e2e passed');
} finally {
  await browser.close();
}
