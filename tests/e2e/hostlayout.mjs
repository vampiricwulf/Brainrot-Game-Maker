// The host panel's layout holds in every state: the fixed bar (↶ Undo, 📜 Log, 🚪 Exit) stays put from the board to a
// clue, a Daily Double, the Final, an RPG and a board-game round and the end screen; there's never more than one main
// (.primary) button, and one where the moment has a next step; a confirmation is one strip above the fixed bar (the
// panel grows by that strip, nothing overlaps); and beside the stage (RPG and board-game rounds on a wide window) the
// fixed bar is a grid with 🚪 Exit in its bottom-right cell, ↶ Undo and ↷ Redo in words and each group on one line (🔊
// Sound with 📺 Audience and ▭ Scores window ●, at 1280×720 and 1093×526). A Daily Double with three question slides keeps Next slide ▶
// the main button until its last slide (viewers see where it is: ● ● ○) and its flow row keeps its places (↩ Put back
// (keep tile) first, ▦ Done ▶ board last, 🙈 Hide answer in Done's place once the answer is up), a board game's own
// roll makes its turn box's slot ▶ Move while the blue button stays Next turn ▶ (the turn first in the box under the
// stage; beside it the slot within 96 px of it, where the dice's box goes under the turn box; its check sits in the
// panel), a box
// drawn on the RPG stage in one window leaves the stage its size, a confirmation leaves one main button (its own), ✔ / ✘
// hand the focus to the main button, and
// on a narrow window the fixed bar stays on one line (🚪 Exit at the right; ❔ Help as its sign up to 1040px, its word
// above, which opens the keys on During the game, where 💡 Show all tips again brings 🙈 Hide's note back). With six
// players in a single window (at
// 1366×768, 1200×720, 1024×768 and 960×900, and a long Final name) the stage keeps one size from the board to a clue and
// with a player picked (on a $1,000 clue too: a long name is cut short on ＋ Award and − Deduct, never the amount), and
// through a 🤝 partner clue from PARTNER UP! (the wheel, 📤 Hand out the cards) to ✔ Got it, its ✔ / ✘ in sight (the wheel's own
// bar too, and the players' chips where they fit), up to 1240px wide 🤫 Send a card… and 🎭 Deal… show as 🤫 and 🎭
// (named in full), 🔊 Sound opens in the host panel, and every Final wager box is in sight (the Final's own 🤫 cards
// under them: below the panel's foot, 🤫 1 card ↓ in the step's sticky row goes to them). A three-round game keeps the
// stage one size from the board to a clue with 🔇 Stop sounds (the round intro's music), a card out, both or neither on
// the board's tools row, in both its board rounds (the second's ▶ is a long Final name, cut short and named in full),
// from 960 to 1366px wide; at 1920 they keep their words. At 1366 and 1024px wide the crowded game's stage keeps the
// board's size through a Daily Double's splash and slides, a clue with two sounds on its slide and one with two slides,
// and at 1110 and 1184px through the two-slide clue (◀ Slide and ▦ Done ▶ board in words, its hint cut short). With 4
// and 8 players at 1280×720 and 1366×768, a 🤝 partner clue's box holds its actions once each, in sight (🎡 Spin for a
// partner, ⏱ Start the clock, ✔ Got it, its foot), the blue button (Show question ▶, then 👁 Reveal answer) in sight and
// within reach of the foot, nothing above it, the stage one size from PARTNER UP! to ✔ Got it; at 1280×720 a Daily
// Double's box opens at its top, its Wager row one line ending with True Daily Double, the blue Show question ▶ never
// greyed (a double-click on it shows the question once); with 8, a 🎯 Pick a player wheel's bar is one row and in sight,
// Spin! first and no Close (the blue button is Next ▶), landed too, and a wheel tile's bar the same with the blue Show
// question ▶ within 96 px of its Spin! (↩ Put back in sight, as on PARTNER UP! and a Daily Double's splash, where it
// leads the Wager row). At 1280×720 with long team names, the Final's reveal rows keep straight columns, one line each,
// Finish now… at the left of their box's foot.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { boxHasAction, confirmStrip, flowIs, goOnCheck, mainButton, mainLabel, noSelection, notYet, openGameFile, packGame, selectedWords, stepButton, leaveAnswer } from './helpers.mjs';

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
// a Final (with a 🤫 card of its own).
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
    { id: 'r_final', name: 'Final Jeopardy!', mode: 'final', category: 'Internet History', questionSlide: slide('fq', 'The first video'), extraSlides: [{ id: 'fx2', ...slide('fq2', 'Uploaded in 2005') }], answerSlide: slide('fa', 'Me at the zoo'), timerSeconds: 30, allowNonPositive: true, cards: [{ id: 'fcard', name: 'Leader hint', to: 'playing', ...slide('fc', 'A hint') }] },
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
  // ❔ Help at the bar's end: the keys window, on During the game, its foot with the guide and 💡 Show all tips again
  // (🙈 Hide's note shows again: its once-only mark is gone, and set again by the next 🙈 Hide).
  // (Its dot: what moved in this version, not shown on this computer yet. The keys window opens on it, and it goes.)
  const movedDot = page.locator('.panel .fixed [data-moved-dot]');
  assert((await movedDot.count()) === 1, '❔ Help has a dot while what moved in this version is new here');
  await page.locator('.panel .fixed').getByRole('button', { name: '❔ Help' }).click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await help.waitFor();
  assert(
    (await help.getByRole('button', { name: 'During the game', exact: true }).getAttribute('aria-pressed')) === 'true' && (await help.getByRole('button', { name: '📖 How to host ↗' }).count()) === 1,
    '❔ Help opens the keys window on During the game, 📖 How to host ↗ at its foot',
  );
  const moved = help.locator('[data-what-moved]');
  assert(
    (await moved.evaluate((d) => d.open)) && (await moved.innerText()).includes('↩ Put back (keep tile)') && (await moved.innerText()).includes('📊 Scores → 📊 Scoreboard') && (await movedDot.count()) === 0,
    '“What moved in this version” is open at the top (↩ Put back, the renames), and ❔ Help’s dot is gone',
  );
  // (Its blue button's group says N and the check's keys; nothing is turned off yet, so no "Not asked about" list.)
  assert(
    (await help.locator('section', { hasText: 'The blue button and the check' }).locator('tr td:first-child').first().innerText()) === 'N' && (await help.locator('[data-quiet]').count()) === 0,
    '❔ Help: the blue button’s keys (N first), and no list of kinds not asked about while none is',
  );
  const hideSeen = () => page.evaluate(() => localStorage.getItem('jb.hideHintSeen'));
  const seenBefore = await hideSeen();
  await help.getByRole('button', { name: '💡 Show all tips again' }).click();
  await help.getByRole('button', { name: '✓ Tips will show again' }).waitFor();
  const seenAfter = await hideSeen();
  await help.getByRole('button', { name: 'Done' }).click();
  await help.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '🙈 Hide', exact: true }).click();
  await page.keyboard.press('h');
  await page.getByRole('button', { name: '🙈 Hide', exact: true }).waitFor();
  assert(seenBefore === '1' && seenAfter === null && (await hideSeen()) === '1', '💡 Show all tips again: the next 🙈 Hide says how to get the controls back again');

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
    await leaveAnswer(page).click();
  };

  console.log('The fixed bar stays put, one main button at most:');
  states.board = await look();
  // A right-click on a gap in the host panel shows nothing: never the browser's menu (on stream, with its Reload). A box
  // to type in keeps it (cut, copy, paste).
  const rightClick = async (x, y) => {
    await page.evaluate(() => window.addEventListener('contextmenu', (e) => (window.__menuTaken = e.defaultPrevented), { once: true }));
    await page.mouse.click(x, y, { button: 'right' });
    return page.evaluate(() => window.__menuTaken);
  };
  const gap = await page.evaluate(() => {
    const r = document.querySelector('.panel .fixed').getBoundingClientRect();
    for (let x = r.left + 2; x < r.right; x += 3) {
      const hit = document.elementFromPoint(x, r.top + r.height / 2);
      if (hit?.closest('.panel') && !hit.closest('button, a, input, select, textarea, [data-player-id]')) return { x, y: r.top + r.height / 2 };
    }
  });
  assert(gap && (await rightClick(gap.x, gap.y)) === true, 'a right-click on a gap in the host panel gets no browser menu');
  const timerBox = await page.getByLabel('Timer seconds').boundingBox();
  assert((await rightClick(timerBox.x + 8, timerBox.y + timerBox.height / 2)) === false, 'a box to type in keeps the browser’s menu (cut, copy, paste)');
  // A double-click on the tile in the stage's middle: it opens, and its second click, on the question's words now, turns
  // nothing blue on stream (nor does Ctrl+A).
  const stageMid = await page.locator('.stage-box .stage').boundingBox().then((s) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 }));
  await page.mouse.dblclick(stageMid.x, stageMid.y);
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  await page.keyboard.press('Control+a');
  assert(await noSelection(page), `a double-click on a tile, the second click on the question, and Ctrl+A select nothing (${await selectedWords(page)})`);
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
  // (＋ Award names who: on the button the player's name is apart, to be cut short on a crowded row. Green, never blue.)
  assert(
    (await page.locator('.panel .award button.good', { hasText: 'Ann' }).count()) === 1 && (await page.locator('.panel .award button.primary').count()) === 0 && (await flowIs(page, '👁 Reveal answer')),
    'someone answering: ＋ Award Ann is green, never blue; the blue button is still 👁 Reveal answer',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();
  // The Daily Double: its wager, then its question.
  await page.locator('.stage-box .board .tile').nth(4).click();
  await page.locator('.dd input[type=number]').waitFor();
  states.ddWager = await look();
  assert((await page.locator('.panel .status').innerText()).includes('Daily Double: who found it, and their wager'), 'the status line says what the Daily Double screen wants (no lone “·”)');
  assert((await flowIs(page, 'Show question ▶')) && (await mainButton(page).isEnabled()), 'the Daily Double’s blue button is Show question ▶, never greyed (with no wager it keeps the keys in the box)');
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
  // A clue's buttons keep their places: ↩ Put back (keep tile) at the far left of the flow row (not in the status line),
  // the row's other places at its right end, ▦ Done ▶ board last and quiet, the row's width away from Put back. As the
  // clue goes on (its last slide, then its answer) nothing in the row moves: 👁 Reveal answer leaves its place empty once
  // it's the blue button's, and 🙈 Hide answer takes ▦ Done ▶ board's.
  const flowAt = () =>
    page.evaluate(() => {
      const r = (el) => el?.getBoundingClientRect();
      const row = document.querySelector('.panel [data-flowrow]');
      const pb = r(row?.querySelector('[data-flow="putback"]'));
      const places = [...(row?.querySelectorAll('[data-flow-slots] [data-flow]') ?? [])];
      const end = places.at(-1);
      return {
        pbFirst: !!row && row.querySelector('button') === row.querySelector('[data-flow="putback"]'),
        inStatus: !!document.querySelector('.panel .status [data-flow="putback"]'),
        pbX: Math.round(pb?.x ?? -1),
        pbRight: Math.round(pb ? pb.x + pb.width : -1),
        amountX: Math.round(r(row?.querySelector('input[type=number]'))?.x ?? -1),
        pagerX: Math.round(r(row?.querySelector('[data-flow="pager"]'))?.x ?? -1),
        endLeft: Math.round(r(end)?.x ?? -1),
        endRight: Math.round(end ? r(end).x + r(end).width : -1),
        endGhost: !!end?.classList.contains('ghost'),
        rowH: Math.round(r(row)?.height ?? 0),
        nextLeft: Math.round(r(document.querySelector('.panel [data-next]')).x),
        places: places.map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      };
    });
  const f1 = await flowAt();
  assert(
    f1.pbFirst && !f1.inStatus && f1.pbRight <= f1.amountX && f1.places.join() === '◀ Slide,👁 Reveal answer,▦ Done ▶ board' && f1.endGhost && f1.endRight <= f1.nextLeft && f1.endLeft - f1.pbRight > 200,
    `a clue's flow row: ↩ Put back (keep tile) first, before the Amount box, none in the status line; ◀ Slide, 👁 Reveal answer and a quiet ▦ Done ▶ board at its right end, before the blue button, far from Put back (${JSON.stringify(f1)})`,
  );
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
  assert((await page.locator('.panel .award button.primary').count()) === 0 && (await flowIs(page, '👁 Reveal answer')), 'on its last slide the blue button is 👁 Reveal answer (＋ Award Bob is green)');
  const f2 = await flowAt();
  assert(
    f2.places.join() === '◀ Slide,▦ Done ▶ board' && f2.pbX === f1.pbX && f2.pagerX === f1.pagerX && f2.endRight === f1.endRight && f2.rowH === f1.rowH,
    `on its last slide 👁 Reveal answer's place in the row stays empty (the blue button reveals) and nothing else moves (${JSON.stringify(f2)})`,
  );
  await page.keyboard.press('r');
  await pips.waitFor({ state: 'detached' });
  assert(true, 'the dots go when the answer shows');
  await page.locator('.panel [data-flowrow] [data-flow="reveal"]', { hasText: 'Hide answer' }).waitFor();
  const f3 = await flowAt();
  assert(
    f3.places.join() === '🙈 Hide answer' && (await flowIs(page, '▦ Done ▶ board')) && f3.pbX === f1.pbX && f3.endRight === f1.endRight && f3.rowH === f1.rowH,
    `the answer up: 🙈 Hide answer in ▦ Done ▶ board's place (the blue button is ▦ Done ▶ board), ◀ Slide's place kept, ↩ Put back where it was (${JSON.stringify(f3)})`,
  );
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
  // One window: the stage keeps its size while a box is drawn on the RPG stage, when it's let go (the RPG box's one
  // selection line says who) and after a click on an empty spot clears it (↩ Select them again in that line).
  {
    const stageH = async () => Math.round((await page.locator('.stage-box').boundingBox()).height);
    const before = await stageH();
    const pane = await page.locator('.stage-box .rpg .pane').first().boundingBox();
    const [a, b] = [[0.04, 0.05], [0.96, 0.9]].map(([fx, fy]) => ({ x: pane.x + pane.width * fx, y: pane.y + pane.height * fy }));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.locator('.stage-box .rpg .band').waitFor();
    const held = await stageH();
    await page.mouse.up();
    await page.locator('.rh [data-rpg-sel]', { hasText: 'Selected: Ann, Bob, Cy' }).waitFor();
    const letGo = await stageH();
    await page.mouse.click(a.x, a.y);
    await page.locator('.rh [data-rpg-sel]').getByRole('button', { name: '↩ Select them again' }).waitFor();
    const cleared = await stageH();
    assert(
      held === before && letGo === before && cleared === before,
      `one window: the RPG stage keeps its size while a box is drawn, let go and cleared (${before}, ${held}, ${letGo}, ${cleared})`,
    );
  }
  await nextRound();
  await page.locator('.panel .status', { hasText: 'Board game' }).waitFor();
  states.boardgame = await look();
  const turnSlot = page.locator('.bh [data-step]');
  const slotSays = () => turnSlot.evaluate((b) => [...b.childNodes].filter((n) => n.nodeName !== 'KBD').map((n) => n.textContent).join('').trim());
  assert(
    (await mainLabel(page)) === 'Next turn ▶' && (await slotSays()).startsWith('🎲 Roll') && (await turnSlot.evaluate((b) => b.classList.contains('ring'))),
    `a board-game turn: the blue button is Next turn ▶, the turn box's one slot 🎲 Roll, ringed (${await mainLabel(page)} · ${await slotSays()})`,
  );
  // The turn first in the round's box, its slot within reach of the blue button (from the slot's foot to the blue
  // button's top: 96 px at most), as the 🤝 foot's and a wheel tile's are: beside the stage, where the turn's part sits at
  // the column's foot (at 1280×720, below). Under the stage the box starts with the turn (the turn order, ✎ Edit board's
  // line and, on a window 900 px tall or more, the players' cards after it), its slot in sight where a click reaches it;
  // its distance to the blue button is logged.
  const turnReach = (p) =>
    p.evaluate(() => {
      const slot = document.querySelector('.bh [data-step]').getBoundingClientRect();
      const main = document.querySelector('.panel [data-next]').getBoundingClientRect();
      return Math.round(main.top - slot.bottom);
    });
  const reachUnder = await turnReach(page);
  console.log(`    (under the stage at 1280×900: the turn box's slot is ${reachUnder} px above the blue button)`);
  const underParts = await page.locator('.bh').evaluate((b) =>
    [...b.children].flatMap((c) => ('turnPart' in c.dataset ? ['turn'] : 'turnOrder' in c.dataset ? ['order'] : c.classList.contains('more') ? ['more'] : c.classList.contains('cards') ? ['cards'] : [])),
  );
  const slotInSight = await turnSlot.evaluate((b) => {
    const r = b.getBoundingClientRect();
    return r.bottom <= innerHeight && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  assert(
    underParts.join() === 'turn,order,more,cards' && slotInSight,
    `under the stage the round's box starts with the turn, its slot in sight, the players' cards after ✎ Edit board's line (${underParts.join()})`,
  );
  // Its own roll (D) is the round's: the slot reads ▶ Move (Enter) in its place, and the blue button stays Next turn ▶.
  // (The rings that say what's next are on buttons: a player's avatar on their card has a ring of their color.)
  await page.keyboard.press('d');
  await page.locator('.panel [data-tool-controls]').waitFor();
  await page.waitForFunction(() => document.querySelector('.bh [data-step]')?.textContent?.trim().startsWith('▶ Move'), null, { timeout: 8000 });
  assert(
    /^▶ Move .+: \d+$/.test(await slotSays()) && (await mainLabel(page)) === 'Next turn ▶' && (await page.locator('.panel button.ring:visible').count()) === 1,
    `the round’s own roll makes the slot ▶ Move (ringed, the one ring), the blue button still Next turn ▶ (${await slotSays()})`,
  );
  // N with the move not made (the dice put away, the count kept): the check walks the turn, in the panel, the stage its
  // size, none of its buttons on the blue button's spot.
  await page.keyboard.press('Escape');
  await page.locator('.panel [data-tool-controls]').waitFor({ state: 'detached' });
  const bgStage = Math.round((await page.locator('.stage-box').boundingBox()).height);
  const bgMain = await mainButton(page).boundingBox();
  await page.keyboard.press('n');
  await goOnCheck(page).locator('[data-goon-item="move"]').waitFor();
  const bgCheck = await page.evaluate((m) => {
    const rect = (el) => el.getBoundingClientRect();
    const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const card = rect(document.querySelector('.panel [data-goon]'));
    const mr = { left: m.x, right: m.x + m.width, top: m.y, bottom: m.y + m.height };
    return {
      offStage: !meets(card, rect(document.querySelector('.stage-box'))),
      offBar: !meets(card, rect(document.querySelector('.panel .fixed'))),
      onMain: [...document.querySelectorAll('.panel [data-goon] :is(button, input, label)')].filter((b) => meets(rect(b), mr)).length,
      rings: [...document.querySelectorAll('.panel button.ring')].filter((b) => b.checkVisibility()).length,
    };
  }, bgMain);
  assert(
    bgCheck.offStage && bgCheck.offBar && !bgCheck.onMain && bgCheck.rings === 1 && Math.round((await page.locator('.stage-box').boundingBox()).height) === bgStage,
    `a board-game turn's check: off the stage and the fixed bar, nothing of it on the blue button's spot, one ring (its ▶ Move), the stage its size (${JSON.stringify(bgCheck)})`,
  );
  await page.keyboard.press('Escape');
  await goOnCheck(page).waitFor({ state: 'detached' });
  // Leaving an RPG or board-game round always asks (nothing to count there), quietly.
  await page.waitForTimeout(450);
  const leave = page.locator('.rn button', { hasText: '▶' });
  assert(!(await leave.evaluate((b) => b.classList.contains('primary'))), 'its Next round ▶ is a quiet button');
  await leave.click();
  assert((await confirmStrip(page).innerText()).includes('Leave Board game for Final Jeopardy!?'), 'and leaving it asks first (“Leave Board game for Final Jeopardy!?”)');
  assert(
    (await page.locator('.panel button.primary:visible').count()) === 1 && (await confirmStrip(page).locator('button.primary').count()) === 1,
    'while it asks, its answer is the one main button (the round’s goes quiet)',
  );
  await page.waitForTimeout(450);
  await leaveAnswer(page).click();
  await page.locator('.fj').waitFor();
  await page.locator('.fj .wagers input[data-wager]').first().waitFor();
  states.wagers = await look();
  assert((await mainLabel(page)) === 'Show question ▶', `the Final opens on its wager screen, Show question its main button (${await mainLabel(page)})`);
  const wagers = page.locator('.fj .wagers input[data-wager]');
  for (let i = 0; i < (await wagers.count()); i++) await wagers.nth(i).fill('0');
  // (Its question has two slides: Next slide ▶ first, viewers see where it is.)
  for (const label of ['Show question ▶', 'Next slide ▶', '👁 Reveal answer', 'Start player reveals ▶']) {
    await page.waitForFunction((l) => document.querySelector('.panel [data-next]')?.textContent?.startsWith(l), label);
    if (label === 'Next slide ▶')
      assert(
        (await page.locator('.stage-box [data-slide-pips]').getAttribute('aria-label')) === 'Slide 1 of 2' && (await page.locator('.stage-box').innerText()).includes('The first video'),
        "a Final with two question slides shows its first, Next slide ▶ the main button (● ○ on stream)",
      );
    if (label === '👁 Reveal answer') assert((await page.locator('.stage-box').innerText()).includes('Uploaded in 2005'), 'then its second slide, then 👁 Reveal answer');
    await mainButton(page).click();
  }
  await page.locator('.fj .pl').first().waitFor();
  states.reveals = await look();
  // Finished early with nobody judged, Ctrl+Z on the results goes back into the Final: its answer, then its question.
  await page.locator('.fj button.ghost', { hasText: 'Finish now…' }).click();
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
  // The first one's wager up (N): their verdict is due, in their row only (✔ Right then ✘ Wrong); the blue button is
  // Next player ▶, the one blue, nothing in the main cell ✔ or ✘.
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Next player ▶'));
  states.verdict = await look();
  assert(
    !/[✔✘]/.test(await mainLabel(page)) && (await page.locator('.panel [data-next-pair]').count()) === 0 && (await page.locator('.fj .pl.cur').getByRole('button', { name: /^✔ Right/ }).isVisible()),
    'the Final’s verdict due: ✔ Right / ✘ Wrong in the spotlit row only, the blue button Next player ▶',
  );
  for (let i = 0; i < 3; i++) await page.locator('.fj .pl').nth(i).getByRole('button', { name: '✔ Right' }).click();
  await mainButton(page).click();
  await page.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  states.end = await look();
  const tbClue = page.locator('.panel [data-tie]').getByRole('button', { name: '❓ Tiebreaker clue' });
  assert((await mainButton(page).count()) === 0 && (await tbClue.isEnabled()), 'a tie for first: no blue button, ❓ Tiebreaker clue in the tie box');
  // The keys on the tie box's first way; N there (mashed after the Final) starts nothing on stream: it says to settle
  // the tie in the box (or O), which flashes.
  await page.waitForFunction(() => document.activeElement?.closest('.panel [data-tie]'));
  await page.keyboard.press('n');
  await page.locator('.toast', { hasText: 'Tie for first: settle it in the tie box (O: a roll-off)' }).waitFor();
  assert((await page.locator('.panel .status').innerText()).includes('Game over'), 'the keys go on from the tie box, and N says to settle the tie there (or O for a roll-off) without starting anything');
  // The tiebreaker's question slides come one at a time (N), as on a clue, then the answer.
  await tbClue.click();
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
  // The winner selected and Enter (＋ Award at Amount 0, its Amount row folded): the panel says who won. The other tied
  // player's 🏆 in the Who won? row changes it.
  const pts = (await page.locator('.panel .p .score').allInnerTexts()).map((t) => Number(t.replace('−', '-').replace(/[^\d-]/g, '')));
  const tiedAt = pts.flatMap((v, i) => (v === Math.max(...pts) ? [i] : []));
  const chipName = async (i) => (await page.locator('.panel .p .sel').nth(i).innerText()).replace(/^\d+\s*/, '').trim();
  const [first, other] = [await chipName(tiedAt[0]), await chipName(tiedAt[1])];
  await page.locator('.panel .status').click();
  await page.keyboard.press(String(tiedAt[0] + 1));
  await page.keyboard.press('Enter');
  await page.locator('.panel .status', { hasText: `🏆 ${first} won · 🏁 Back to results (N)` }).waitFor();
  assert(true, `once ${first} is picked (a number, then Enter), the panel says so and to go back to the results`);
  const tbWho = page.locator('.panel [data-tb-who]');
  await tbWho.getByRole('button', { name: `🏆 ${other}` }).click();
  await page.locator('.panel .status', { hasText: `🏆 ${other} won` }).waitFor();
  assert(
    !(await page.locator('.toast').allInnerTexts()).some((t) => t.includes('isn’t tied for first')) && (await tbWho.locator('button[aria-pressed="true"]').innerText()) === `🏆 ${other}`,
    `${other}'s 🏆 (tied too) changes the winner, pressed in the Who won? row (not "isn’t tied for first")`,
  );
  // Ctrl+Z on the tiebreaker clue: its picks undo there, one at a time. Then the last Final judgment goes back to the
  // reveals (not out of sight), that player unjudged, the tiebreaker's countdown stopped.
  await page.keyboard.press('t');
  await page.locator('.stage-box .timer').waitFor();
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: `🏆 ${first} won` }).waitFor();
  await page.keyboard.press('Control+z');
  await page.locator('.panel .status', { hasText: 'Who won the tiebreaker?' }).waitFor();
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
  assert(
    ['clue', 'answering', 'ddWager', 'ddQuestion', 'boardgame', 'wagers', 'reveals', 'verdict'].every((k) => counts[k] === 1),
    'and exactly one where there’s a next step (a verdict due too: the Final’s blue button is Next player ▶, its ✔ / ✘ in the row)',
  );
  // (The moment with none: the end screen, a tie settled in its tie box.)
  assert(['end'].every((k) => counts[k] === 0), 'and none on the end screen (a tie for first is settled in its box)');

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
    await leaveAnswer(p2).click();
    await p2.locator('.panel .status', { hasText: name }).waitFor();
  };
  await p2Next('Adventure');
  assert(await p2.locator('.play.side').count(), 'an RPG round on a wide window puts the panel beside the stage');
  const inRpg = await exitIn();
  await p2Next('Board game');
  const inBg = await exitIn();
  // Beside the stage the turn's part sits at the column's foot, by the blue button.
  const reachSide = await turnReach(p2);
  console.log(`    (beside the stage at 1280×720: the turn box's slot is ${reachSide} px above the blue button)`);
  assert(reachSide <= 96 && reachSide >= -40, `beside the stage at 1280×720, the turn box's slot is within 96 px of the blue button, above it (${reachSide} px)`);
  assert(inRpg.x === inBg.x && inRpg.y === inBg.y, `🚪 Exit is in the same place in RPG and board-game rounds (${inRpg.x},${inRpg.y})`);
  assert(inBg.right - inBg.x < 4 && inBg.bottom - inBg.y < 4, 'in the fixed bar’s bottom-right cell');
  // The bar beside the stage, the scores window open (its ●), at 1280×720 and 1093×526: ↶ Undo and ↷ Redo keep their
  // words, each group is one line, and the stream's (🔊 Sound, 📺 Audience, ▭ Scores window ●) go together.
  const [scoresWin] = await Promise.all([p2.waitForEvent('popup'), p2.keyboard.press('Shift+A')]);
  await scoresWin.waitForLoadState('domcontentloaded');
  await p2.locator('.panel .fixed .sw', { hasText: '●' }).waitFor();
  for (const [w, h] of [
    [1280, 720],
    [1093, 526],
  ]) {
    await p2.setViewportSize({ width: w, height: h });
    await p2.waitForTimeout(100);
    const bar = await p2.locator('.panel .fixed').evaluate((f) => {
      const words = (b) => b.textContent.replace(/\s+/g, ' ').trim();
      const groups = [...f.querySelectorAll(':scope > .group')].map((g) => {
        const tops = [...g.querySelectorAll(':scope > button')].map((b) => Math.round(b.getBoundingClientRect().top));
        return Math.max(...tops) - Math.min(...tops) <= 2;
      });
      return {
        oneLine: groups.every(Boolean),
        undoWords: [...f.querySelectorAll('.g-edit .word')].every((x) => x.getBoundingClientRect().width > 15),
        stream: [...f.querySelectorAll('.g-windows > button')].map(words),
      };
    });
    assert(
      bar.oneLine && bar.undoWords && bar.stream.join() === '🔊 Sound,📺 Audience,▭ Scores window ●',
      `${w}×${h} beside the stage: ↶ Undo and ↷ Redo in words, each of the bar's groups on one line, 🔊 Sound with 📺 Audience and ▭ Scores window (${JSON.stringify(bar)})`,
    );
  }
  await p2.setViewportSize({ width: 1280, height: 720 });
  await Promise.all([scoresWin.waitForEvent('close'), p2.locator('.panel button[aria-label="Close the scores window"]').click()]);
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
  // A double-click on ◀ Previous round goes back one round, not two (its second click lands on the new one).
  await p2.waitForTimeout(450);
  await p2.getByRole('button', { name: '◀ Previous round' }).dblclick();
  await p2.locator('.panel .status', { hasText: 'Adventure' }).waitFor();
  await p2.waitForTimeout(500);
  assert((await p2.locator('.panel .status', { hasText: 'Adventure' }).count()) === 1, 'a double-click on ◀ Previous round goes back one round (Adventure), not two');
  await p2Next('Board game');
  // A roll on a short window (1366×768 at 125% zoom: the panel still beside the stage): the dice's box goes under the
  // turn box, at the column's foot, and the slot (▶ Move) stays in sight, where a click reaches it (the rest scrolls).
  await p2.setViewportSize({ width: 1093, height: 526 });
  await p2.keyboard.press('d');
  await p2.locator('.panel .bh [data-turn-part] [data-tool-controls] .result').waitFor();
  const slotSeen = await p2.locator('.bh [data-step]').evaluate((b) => {
    const r = b.getBoundingClientRect();
    return r.bottom <= innerHeight && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  assert(slotSeen, 'at 1093×526 a roll puts the dice’s box under the turn box, the slot still in sight where a click reaches it');
  await p2.keyboard.press('Escape');
  await p2.setViewportSize({ width: 1280, height: 720 });
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
  // ❔ Help has its word above 1040px wide, and is its sign only up to there, so the bar keeps one line where it had one.
  const helpW = async () => Math.round((await p3.locator('.panel .fixed').getByRole('button', { name: '❔ Help' }).boundingBox()).width);
  const at1024 = await helpW();
  await p3.setViewportSize({ width: 1041, height: 600 });
  await oneLine('at 1041px wide, on the board');
  const at1041 = await helpW();
  assert(at1024 < 45 && at1041 > 55, `❔ Help is its sign only at 1024px wide (${at1024}px), with its word at 1041px (${at1041}px)`);
  await p3.setViewportSize({ width: 1024, height: 600 });
  // Narrower (a 1366×768 or 1280×720 laptop at 150% zoom): the bar's buttons as their signs, still one line.
  for (const width of [911, 853]) {
    await p3.setViewportSize({ width, height: 600 });
    await oneLine(`at ${width}px wide, on the board`);
  }
  await p3.setViewportSize({ width: 1024, height: 600 });
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
  // (No Close in its box: the blue button, Next ▶, puts it away.)
  await mainButton(p3, 'Next ▶').click();
  await p3.locator('[data-tool-controls]').waitFor({ state: 'detached' });
  await p3.locator('.stage-box .board .tile').first().click();
  await p3.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  await oneLine('in a clue');
  // 200% zoom on a laptop (683×384), a player picked: ＋ Award and the main button keep their row, clear of the
  // players' chips (what's at the middle of each is it). The rest of the row (− Deduct, in a wider font) scrolls under.
  await p3.setViewportSize({ width: 683, height: 384 });
  await p3.keyboard.press('1');
  await p3.locator('.panel .award button.good').waitFor();
  const covered = await p3.evaluate(async () => {
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const out = [...document.querySelectorAll('.panel .award button.named.good, .panel [data-next]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })
      .map((el) => el.textContent.trim().slice(0, 20));
    const chips = document.querySelector('.panel > .players').getBoundingClientRect();
    if (document.querySelector('.panel [data-next]').getBoundingClientRect().top < chips.bottom - 1) out.push('the main button is over the chips');
    return out;
  });
  assert(covered.length === 0, `at 683×384 (200% zoom) ＋ Award and the main button are each in sight, under the chips${covered.length ? ` (not: ${covered.join(', ')})` : ''}`);

  // A crowded single window (six players, longer names): the stage keeps one size from the board to a clue and with a
  // player picked (a $200 clue, then a $1,000 one), and through a 🤝 partner clue from PARTNER UP! (the wheel, the
  // question and its 📤 Hand out the cards list) to ✔ Got it, with the wheel's bar (✎ Edit wheel…), ✔ Got it / ✘ Missed, the
  // main button and the players' chips in sight; 🔊 Sound opens in the host panel (not over the stage), and every Final
  // wager box is in sight. (A long Final name, so the board's tools row holds a wide ▶ beside 🤫 Send a card… and
  // 🎭 Deal…: it still fits on one line, as in a clue.)
  console.log('A crowded single window:');
  /** A second of tone, as a WAV file. */
  const tone = () => {
    const w = Buffer.alloc(44 + 8000, 128);
    w.write('RIFF', 0); w.writeUInt32LE(36 + 8000, 4); w.write('WAVE', 8); w.write('fmt ', 12);
    w.writeUInt32LE(16, 16); w.writeUInt16LE(1, 20); w.writeUInt16LE(1, 22); w.writeUInt32LE(8000, 24);
    w.writeUInt32LE(8000, 28); w.writeUInt16LE(1, 32); w.writeUInt16LE(8, 34); w.write('data', 36); w.writeUInt32LE(8000, 40);
    for (let i = 0; i < 8000; i++) w[44 + i] = 128 + Math.round(40 * Math.sin((i / 8000) * 2 * Math.PI * 440));
    return w;
  };
  const crowdFile = resolve('test-results/hostlayout-crowd.brainrot');
  const crowd = ['Annabelle', 'Bobby Tables', 'Cyrus', 'Deedee', 'Eleanor', 'Frankie'];
  const crowdColors = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'];
  // (Its Memes $400 is a partner clue, with a card for each part.)
  const partnerRules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
  const partnerCards = ['giver', 'guesser'].map((to, k) => ({ id: `pc${k}`, to, ...slide(`pcs${k}`, `Card ${k + 1}`) }));
  // (And its Minecraft $200 has two sounds on its question slide, a media row each; its Rizz $200, two question slides.)
  const sound = { id: 'snd', kind: 'audio', media: 'm_tone', visible: true, x: 860, y: 800, w: 200, h: 200, rotation: 0, opacity: 1, zIndex: 2, autoplay: false, loop: false, muted: false, volume: 1 };
  const sound2 = { ...sound, id: 'snd2', x: 1160 };
  const crowdBoard = {
    ...board,
    categories: board.categories.map((c, ci) => ({
      ...c,
      clues: c.clues.map((q, ri) =>
        ri ? (ci ? q : ri === 1 ? { ...q, id: 'c_partner', type: 'partner', partner: partnerRules, timerSeconds: 45, cards: partnerCards } : q)
        : ci === 2 ? { ...q, id: 'c_sound', questionSlide: { ...q.questionSlide, elements: [...q.questionSlide.elements, sound, sound2] } }
        : ci === 3 ? { ...q, id: 'c_two', extraSlides: [{ id: 'c_two2', ...slide('c_two2s', 'Rizz, the question') }] }
        : q,
      ),
    })),
  };
  const toneWav = tone();
  writeFileSync(
    crowdFile,
    await packGame(
      {
        ...game,
        id: 'g_layout_crowd',
        players: crowd.map((name, i) => ({ id: `p${i + 1}`, name, color: crowdColors[i], startScore: 500 })),
        rounds: [crowdBoard, { ...game.rounds[3], name: 'Final Jeopardy: Internet Legends' }],
        media: [{ id: 'm_tone', name: 'tone.wav', mime: 'audio/wav', size: toneWav.length, kind: 'audio' }],
      },
      { m_tone: toneWav },
    ),
  );
  for (const [w, h] of [
    [1366, 768],
    [1200, 720],
    [1024, 768],
    [960, 900],
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
    const boardStatus = Math.round((await p4.locator('.panel .status').boundingBox()).height);
    assert((await p4.locator('.panel .p button.quick:visible').count()) === 0, `${w}×${h}: on the board the chips keep ✔ / ✘'s place, unseen`);
    if (w <= 1240) {
      const widths = await Promise.all(['🤫 Send a card…', '🎭 Deal…'].map(async (name) => Math.round((await p4.locator('.panel').getByRole('button', { name, exact: true }).boundingBox()).width)));
      assert(widths.every((x) => x < 60), `${w}×${h}: 🤫 Send a card… and 🎭 Deal… show as 🤫 and 🎭, still named in full (${widths.join(' / ')}px wide)`);
    }
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
      if (value === '$1,000') {
        // Three marked ✘ and one ✔ (the ★ goes to them): each chip keeps its width, mark and score, so the row never
        // wraps anew and the stage keeps its size. (Eleanor at $8,500 first: her ✔ takes her score to five digits.)
        const widths = () => p4.locator('.panel .players .p').evaluateAll((ps) => ps.map((p) => Math.round(p.getBoundingClientRect().width)).join());
        const scores = () => p4.locator('.panel .players .p .score').evaluateAll((bs) => bs.map((b) => b.textContent.trim()).join());
        const scoresWere = await scores();
        const eleanor = p4.locator('.panel .players .p', { hasText: 'Eleanor' });
        await eleanor.locator('button.score').click();
        await eleanor.locator('input.score-edit').fill('8500');
        await eleanor.locator('input.score-edit').press('Enter');
        await eleanor.locator('button.score', { hasText: '$8,500' }).waitFor();
        const before = await widths();
        for (const name of ['Annabelle', 'Cyrus', 'Deedee']) await p4.getByRole('button', { name: new RegExp(`^Wrong: ${name}`) }).click();
        await p4.getByRole('button', { name: /^Right: Eleanor/ }).click();
        await p4.locator('.panel .p.picker', { hasText: 'Eleanor' }).waitFor();
        const after = await widths();
        assert(before === after && (await stageH()) === onBoard, `${w}×${h}, a $1,000 clue: marking three ✘ and one ✔ keeps every chip's width and the stage's size (${before} / ${after}; ${onBoard} / ${await stageH()})`);
        // (The marks, the pick and Eleanor's score taken back, for what follows: the scores as they were.)
        for (let i = 0; i < 5; i++) await p4.keyboard.press('Control+z');
        await p4.waitForFunction((was) => [...document.querySelectorAll('.panel .players .p .score')].map((b) => b.textContent.trim()).join() === was, scoresWere);
        await p4.locator('.panel .p.picker', { hasText: 'Eleanor' }).waitFor({ state: 'detached' });
      }
      await p4.keyboard.press('Escape');
      await p4.keyboard.press('Escape');
      await p4.locator('.stage-box .board').waitFor();
    }
    // The partner clue: one stage size from PARTNER UP! to ✔ Got it (its rows scroll in the panel instead).
    const partner = p4.locator('.panel [data-partner-panel]');
    // (In sight: what's at the middle of each is it, not clipped by the panel's scrolling parts.)
    const outOfSight = (sel) =>
      p4.evaluate(
        (sel) =>
          [...document.querySelectorAll(sel)]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            })
            .map((el) => el.textContent.trim()),
        sel,
      );
    await p4.locator('.stage-box .tile[data-clue="c_partner"]').click();
    await p4.locator('.stage-box [data-partner-up]').waitFor();
    const partnerSizes = [await stageH()];
    await p4.keyboard.press('1');
    await partner.getByText('Annabelle picked it.').waitFor();
    await p4.keyboard.press('w');
    await p4.locator('.stage-box .wheel').waitFor();
    partnerSizes.push(await stageH());
    await partner.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 10000 });
    partnerSizes.push(await stageH());
    // (The wheel's own bar keeps its height above the partner box: ✎ Edit wheel and ＋ Spin another wheel too…; the blue
    // button's Next ▶ closes it.)
    const wheelOut = await outOfSight('.panel .mode-host.tools :is(button, select)');
    assert(wheelOut.length === 0, `${w}×${h}, a partner clue's wheel landed: its bar's buttons are in sight${wheelOut.length ? ` (not: ${wheelOut.join(', ')})` : ''}`);
    await p4.keyboard.press('Escape');
    await p4.locator('.stage-box .wheel').waitFor({ state: 'detached' });
    partnerSizes.push(await stageH());
    await p4.keyboard.press('Enter');
    await p4.locator('.stage-box [data-partner-badge]').waitFor();
    await partner.locator('[data-card="2"]').waitFor();
    partnerSizes.push(await stageH());
    // (The clue row's quiet ▦ Done ▶ board, a skip, may scroll out of sight here: Esc and the stage's menu do it.)
    const judgeOut = await outOfSight('.panel [data-partner-judge] button, .panel [data-next]');
    assert(
      judgeOut.length === 0 && (await p4.locator('.panel [data-flow="reveal"]').count()) === 1 && (await p4.locator('.panel [data-flow="done"]').count()) === 1 && (await p4.locator('.panel .flowbeside').count()) === 0,
      `${w}×${h}, a partner clue's 📤 Hand out the cards: ✔ Got it, ✘ Missed and the blue 👁 Reveal answer are in sight (one 👁 Reveal answer, one ▦ Done ▶ board, nothing above the blue button)${judgeOut.length ? ` (not: ${judgeOut.join(', ')})` : ''}`,
    );
    // (The status line's ⚠ Viewers see this chip keeps it one line: as tall as on the board.)
    const statusH = Math.round((await p4.locator('.panel .status').boundingBox()).height);
    assert((await p4.locator('.panel .status [data-viewers]').count()) === 1 && statusH === boardStatus, `${w}×${h}, a partner clue: the status line's ⚠ Viewers see this chip keeps it one line (${boardStatus} / ${statusH}px)`);
    // (The players' chips above it keep their rows, scores and quick buttons and all; at 1024×768 their three rows don't
    // fit with it, and the last scrolls.)
    if (w !== 1024) {
      const chipsOut = await outOfSight('.panel .players .p');
      assert(chipsOut.length === 0, `${w}×${h}, a partner clue's 📤 Hand out the cards: every player's chip is in sight above it${chipsOut.length ? ` (not: ${chipsOut.join(', ')})` : ''}`);
    }
    await partner.getByRole('button', { name: /✔ Got it/ }).click();
    await partner.locator('[data-judged]').waitFor();
    partnerSizes.push(await stageH());
    assert(partnerSizes.every((x) => x === partnerSizes[0]), `${w}×${h}, a partner clue: the stage keeps one size from PARTNER UP! (the wheel spinning, landed and closed, the question) to ✔ Got it (${partnerSizes.join(' / ')})`);
    await p4.keyboard.press('r');
    await p4.locator('.stage-box [data-slide="answer"]').waitFor();
    await p4.keyboard.press('Escape');
    await p4.locator('.stage-box .board').waitFor();
    // One stage size on through the round: a Daily Double's splash (its chips and Wager box in sight) and question
    // slides, a clue with two sounds on its slide (the media controls' room for both is kept from the board on), and a
    // clue with two question slides (◀ Slide on its row: up to 1100px wide, ◀ and ▦ alone, and no "Pick who answered"
    // hint).
    if (w === 1366 || w === 1024) {
      const tileAt = (cat) => p4.locator(`.stage-box .board .tile[data-cat="${cat}"][data-row="0"]`);
      const sizes = [];
      await tileAt(4).click();
      await p4.locator('.stage-box .dd-text').waitFor();
      sizes.push(await stageH());
      const ddOut = await outOfSight('.panel .dd .chip, .panel .dd input[type=number]');
      assert(ddOut.length === 0, `${w}×${h}, a Daily Double's splash: its chips and Wager box are in sight${ddOut.length ? ` (not: ${ddOut.join(', ')})` : ''}`);
      await p4.locator('.panel .dd .chip', { hasText: 'Bobby Tables' }).click();
      await p4.locator('.panel .dd input[type=number]').fill('100');
      await p4.keyboard.press('Enter');
      await p4.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
      sizes.push(await stageH());
      await p4.keyboard.press('n');
      await p4.locator('.panel [data-slidepos]', { hasText: 'Slide 2 of 3' }).waitFor();
      sizes.push(await stageH());
      await p4.keyboard.press('Escape');
      await p4.locator('.stage-box .board').waitFor();
      await tileAt(2).click();
      await p4.locator('.panel .mc:not(.held) .item').nth(1).waitFor();
      sizes.push(await stageH());
      await p4.keyboard.press('r');
      await p4.locator('.stage-box [data-slide="answer"]').waitFor();
      sizes.push(await stageH());
      await p4.keyboard.press('Escape');
      await p4.locator('.stage-box .board').waitFor();
      await tileAt(3).click();
      await p4.locator('.panel [data-slidepos]', { hasText: 'Slide 1 of 2' }).waitFor();
      sizes.push(await stageH());
      await p4.keyboard.press('n');
      await p4.locator('.panel [data-slidepos]', { hasText: 'Slide 2 of 2' }).waitFor();
      sizes.push(await stageH());
      await p4.keyboard.press('Escape');
      await p4.locator('.stage-box .board').waitFor();
      sizes.push(await stageH());
      assert(
        sizes.every((x) => x === onBoard),
        `${w}×${h}: the stage keeps the board's size through a Daily Double (splash, question, slide 2), a clue with two sounds (question, answer) and one with two slides (${onBoard} / ${sizes.join(' / ')})`,
      );
    }
    if (w === 1366) {
      await p4.locator('.panel').getByRole('button', { name: '🔊 Sound' }).click();
      const help = p4.getByRole('dialog', { name: 'Streaming the sound' });
      await help.waitFor();
      const hb = await help.boundingBox();
      const sb = await p4.locator('.stage-box').boundingBox();
      assert(hb.y >= sb.y + sb.height - 1, `🔊 Sound mid-game opens its help in the host panel, not over the stage (it starts at ${Math.round(hb.y)}, the stage ends at ${Math.round(sb.y + sb.height)})`);
      // (A window only for reading: Enter closes it, as its Done does.)
      await p4.keyboard.press('Enter');
      await help.waitFor({ state: 'detached' });
    } else if (w === 1200) {
      // 👥 Players opens in the host panel: a toast said meanwhile stays off the stage too (at the panel's foot).
      await p4.locator('.panel').getByRole('button', { name: '👥 Players' }).click();
      const roster = p4.getByRole('dialog', { name: 'Players' });
      await roster.waitFor();
      // (It moves into the panel once the panel is measured, a frame later: a slow machine is still before that.)
      await p4.locator('.in-panel [aria-modal="true"]').first().waitFor();
      // A player's color picker stays in the host panel too, off the stage.
      const colorPicker = p4.locator('[data-color-picker]');
      await roster.getByLabel('Color for Cyrus').click();
      await colorPicker.waitFor();
      const pb = await colorPicker.boundingBox();
      const stageAt = await p4.locator('.stage-box').boundingBox();
      assert(pb.y >= stageAt.y + stageAt.height - 1, `${w}×${h}: a player's color picker in 👥 Players stays in the host panel, not over the stage (it starts at ${Math.round(pb.y)}, the stage ends at ${Math.round(stageAt.y + stageAt.height)})`);
      await p4.keyboard.press('Escape');
      await colorPicker.waitFor({ state: 'detached' });
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
      await leaveAnswer(p4).click();
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
      // The Final's own 🤫 cards come after every wager row; gone to, they're in sight, the step's sticky row too.
      const finalCards = p4.locator('[data-final-cards]');
      const lastRow = await p4.locator('.fj .wagers .wrow').last().boundingBox();
      const cardsAt = await finalCards.boundingBox();
      assert(cardsAt && cardsAt.y >= lastRow.y + lastRow.height - 1, `${w}×${h}: the Final's 🤫 cards are under the last wager row (they start at ${Math.round(cardsAt?.y)}, the row ends at ${Math.round(lastRow.y + lastRow.height)})`);
      // (Six players: the box's heading is behind the step's sticky row or below it, and that row says the box is there.)
      const head = await p4.locator('[data-final-cards] > .row').first().boundingBox();
      const sticky = await p4.locator('.fj > .row:last-child').boundingBox();
      assert(head.y + head.height > sticky.y, `${w}×${h}: with six players the box's heading isn't all in sight (it ends at ${Math.round(head.y + head.height)}, the step's row starts at ${Math.round(sticky.y)})`);
      const down = p4.locator('.fj > .row:last-child [data-cards-down]');
      await down.waitFor();
      assert((await down.innerText()).trim() === '🤫 1 card ↓', `the step's row offers 🤫 1 card ↓ (${(await down.innerText()).trim()})`);
      const wagersOut = await outOfSight('.fj input[data-wager], .fj input[data-limits]');
      assert(wagersOut.length === 0, `${w}×${h}: with it there, every wager box is still in sight${wagersOut.length ? ` (not: ${wagersOut.join(', ')})` : ''}`);
      await down.click();
      await p4.waitForFunction(() => !!document.activeElement?.closest('[data-final-cards]'));
      await down.waitFor({ state: 'detached' });
      assert(true, 'pressed: the keys are on the box’s first button, and the chip goes once the box is in sight');
      const notInSight = await outOfSight('[data-final-cards] > .row, .fj > .row:last-child');
      assert(notInSight.length === 0, `${w}×${h}: gone to, the Final's 🤫 cards and the step's sticky row are in sight${notInSight.length ? ` (not: ${notInSight.join(', ')})` : ''}`);
    }
    await ctx.close();
  }
  // The 🤝 box on a laptop, one window, with 4 and 8 players, at 1280×720 and 1366×768: each of its actions is in the box,
  // once on the page and in sight there (🎡 Spin for a partner in front of the names, ⏱ Start the clock, ✔ Got it), the
  // box's foot (✔ Got it / ✘ Missed, each card's 📋) and the blue button (Show question ▶, then 👁 Reveal answer) stay in
  // sight, the foot's action within 96 px of the blue button at 1280×720, nothing above the blue button, and the stage
  // keeps one size from PARTNER UP! to ✔ Got it. (With 8 at 1280×720, the wheel spun from the box's own button and put
  // away by the blue Next ▶.)
  // The 4 have short names and no − Deduct on their scores (one row of them), the 8 long names.
  console.log('The 🤝 box on a laptop, 4 and 8 players:');
  for (const count of [4, 8]) {
    const boxFile = resolve(`test-results/hostlayout-box${count}.json`);
    const names = count === 4 ? ['Ann', 'Bob', 'Cat', 'Dan'] : [...crowd, 'Gwendolyn', 'Hal'];
    // (Its Memes and Skibidi Lore $400 are partner clues, a card for each part.)
    const boxClue = (q, k) => ({ ...q, id: `c_box${k}`, type: 'partner', partner: partnerRules, timerSeconds: 45, cards: ['giver', 'guesser'].map((to, j) => ({ id: `pb${k}${j}`, to, ...slide(`pbs${k}${j}`, `Card ${j + 1}`) })) });
    // (And its last Speedruns tile a wheel tile, with a question after the wheel.)
    const boxBoard = {
      ...board,
      id: 'r_box',
      categories: board.categories.map((c, ci) => ({ ...c, clues: c.clues.map((q, ri) => (ri === 1 && ci < 2 ? boxClue(q, ci) : ci === 4 && ri === 4 ? { ...q, type: 'wheel', wheelId: 'w_box' } : q)) })),
    };
    const settings = count === 4 ? { ...game.settings, deductOnWrong: false } : game.settings;
    const wheels = [{ id: 'w_box', name: 'Bonus wheel', spinDurationMs: 300, removeAfterLanding: false, segments: ['Red', 'Blue'].map((label, i) => ({ id: `ws${i}`, label, color: ['#cc0000', '#0000cc'][i], weight: 1 })) }];
    writeFileSync(boxFile, JSON.stringify({ ...game, id: `g_layout_box${count}`, settings, wheels, players: names.map((name, i) => ({ id: `p${i + 1}`, name, color: [...crowdColors, '#bfef45', '#f032e6'][i], startScore: 0 })), rounds: [boxBoard] }));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pb = await ctx.newPage();
    pb.on('pageerror', (e) => errors.push(e.message));
    await pb.goto(pathToFileURL(file).href);
    await openGameFile(pb, boxFile);
    await pb.getByText(/^Opened “/).waitFor();
    await pb.getByRole('button', { name: '▶ Play' }).click();
    await pb.getByRole('button', { name: 'Start game ▶' }).click();
    await pb.getByRole('button', { name: 'Skip intro' }).click();
    const box = pb.locator('.panel [data-partner-panel]');
    const stageH = async () => Math.round((await pb.locator('.stage-box').boundingBox()).height);
    const hidden = (sel) =>
      pb.evaluate(
        (sel) =>
          [...document.querySelectorAll(sel)]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            })
            .map((el) => el.textContent.trim()),
        sel,
      );
    // At 1280×720 the Daily Double's box opens at its top, the keys in its Wager box: its heading and names in sight (with
    // 4, its Wager row too), the Wager row on one line ending with True Daily Double, the blue Show question ▶ in sight and
    // never greyed, and the stage the board's size. A double-click on the blue Show question ▶ shows the question once: its
    // second click, on what the button became, does nothing (no slide skipped, no answer, the tile still open).
    {
      const at = `${count} players at 1280×720`;
      const onBoard = await stageH();
      await pb.locator('.stage-box .board .tile[data-cat="4"][data-row="0"]').click();
      await pb.locator('.stage-box .dd-text').waitFor();
      const dd = pb.locator('.panel .dd');
      const ddOut = await hidden(`.panel .dd > .row:first-child > span:first-child, .panel .dd .chip${count === 4 ? ', .panel .dd .wager > :not(.spacer), .panel .dd .wager [data-flow="putback"]' : ''}`);
      const wagerRow = await dd.locator('.wager').evaluate((r) => {
        const mids = [...r.children].map((c) => c.getBoundingClientRect()).map((b) => b.top + b.height / 2);
        return {
          line: Math.max(...mids) - Math.min(...mids) <= 4,
          last: [...r.querySelectorAll('button')].at(-1)?.textContent.trim() ?? '',
          steps: r.querySelectorAll('[data-step]').length,
          // (↩ Put back (keep tile) leads it: the box is the whole flow row while it's up.)
          putBack: r.querySelector('button')?.matches('[data-flow="putback"]') && document.querySelectorAll('.panel [data-flow="putback"]').length === 1,
        };
      });
      const ddSeen = await mainButton(pb, 'Show question ▶').evaluate((b) => {
        const r = b.getBoundingClientRect();
        return !b.disabled && b.classList.contains('primary') && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      const keys = await pb.evaluate(() => document.activeElement?.matches('.panel .dd input[type=number]'));
      const ddH = await stageH();
      assert(
        ddOut.length === 0 && wagerRow.line && wagerRow.last.startsWith('True Daily Double') && wagerRow.putBack && !wagerRow.steps && ddSeen && keys && ddH === onBoard,
        `${at}: a Daily Double's box opens at its top (heading, names${count === 4 ? ', Wager row' : ''} in sight), the keys in its Wager box, its Wager row one line from ↩ Put back (keep tile) to True Daily Double, the blue Show question ▶ in sight and not greyed, the stage the board's size (${JSON.stringify({ ddOut, wagerRow, ddSeen, keys, ddH, onBoard })})`,
      );
      // A click on the splash with no wager typed: the status line says so over its own start (nothing in the line moves),
      // the stage keeps its size, and the keys stay in the Wager box. (Past the double-click guard of the tile's click.)
      const lineH = async () => Math.round((await pb.locator('.panel .status').boundingBox()).height);
      const lineWas = await lineH();
      await pb.waitForTimeout(500);
      await pb.locator('.stage-box .dd-text').click();
      const note = pb.locator('.panel .status [data-click-note]');
      await note.waitFor();
      const noteIn = await note.evaluate((n) => {
        const [r, s] = [n.getBoundingClientRect(), n.parentElement.getBoundingClientRect()];
        return r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && r.left >= s.left - 1 && r.right <= s.right + 1;
      });
      assert(
        (await stageH()) === onBoard && (await lineH()) === lineWas && noteIn && (await pb.evaluate(() => document.activeElement?.matches('.panel .dd input[type=number]'))),
        `${at}: a click on the Daily Double's splash says what's missing in the status line, inside it, its height and the stage's size kept, the keys still in the Wager box (${await note.innerText()})`,
      );
      await pb.keyboard.type('100');
      await mainButton(pb, 'Show question ▶').dblclick();
      await pb.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
      await pb.waitForTimeout(700);
      assert(
        (await pb.locator('.panel [data-slidepos]').innerText()) === 'Slide 1 of 3' && (await pb.locator('.stage-box [data-slide="answer"]').count()) === 0 && (await pb.locator('.stage-box .board').count()) === 0,
        `${at}: a double-click on the blue Show question ▶ shows the question once (slide 1 of 3, no answer, the tile still open)`,
      );
      await pb.keyboard.press('Escape');
      await pb.locator('.stage-box .board').waitFor();
    }
    // The check before going on (one window): ▦ Done ▶ board with a player picked and no points (with 8, a second one
    // picked too: two lines) opens it inside the panel, over its buttons: never over the stage, the status line or the
    // fixed bar, no button of it where the blue button was (what's there is its text), the stage its size, one blue, at
    // most one ring, its foot in view (it scrolls inside). At 1280×720 and, with 4, at 1920×1080 too.
    for (const [w, h] of count === 4 ? [[1280, 720], [1920, 1080]] : [[1280, 720]]) {
      const at = `${count} players at ${w}×${h}, the check`;
      await pb.setViewportSize({ width: w, height: h });
      // (A played tile isn't disabled while it has a menu: it's marked .used.)
      await pb.locator('.stage-box .board .tile[data-cat="2"]:not(.used)').first().click();
      await pb.locator('.panel .status', { hasText: 'Answer hidden' }).waitFor();
      await pb.keyboard.press('1');
      if (count === 8) await pb.keyboard.press('2');
      await pb.keyboard.press('r');
      await pb.locator('.stage-box [data-slide="answer"]').waitFor();
      const stageWas = await stageH();
      const mainWas = await mainButton(pb).evaluate((b) => {
        const r = b.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      await pb.keyboard.press('n');
      await goOnCheck(pb).waitFor();
      const c = await pb.evaluate((m) => {
        const rect = (el) => el.getBoundingClientRect();
        const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const card = rect(document.querySelector('.panel [data-goon]'));
        const panel = rect(document.querySelector('.play > .panel'));
        const foot = rect(document.querySelector('.panel [data-goon] .foot'));
        const mid = document.elementFromPoint((m.left + m.right) / 2, (m.top + m.bottom) / 2);
        return {
          inside: card.left >= panel.left - 1 && card.right <= panel.right + 1 && card.top >= panel.top - 1 && card.bottom <= panel.bottom + 1,
          offStage: !meets(card, rect(document.querySelector('.stage-box'))),
          offBar: !meets(card, rect(document.querySelector('.panel .fixed'))),
          offStatus: !meets(card, rect(document.querySelector('.panel .status'))),
          onMain: [...document.querySelectorAll('.panel [data-goon] :is(button, input, label)')].filter((b) => meets(rect(b), m)).map((b) => b.textContent.trim()),
          midText: !!mid?.closest('[data-goon]') && !mid.closest('button, input, label'),
          footSeen: foot.top >= card.top - 1 && foot.bottom <= card.bottom + 1,
          lines: document.querySelectorAll('.panel [data-goon] [data-quick]').length,
          checkBlue: document.querySelectorAll('.panel [data-goon] button.primary').length,
          blue: [...document.querySelectorAll('.panel button.primary')].length,
          rings: [...document.querySelectorAll('.play button.ring')].filter((b) => b.offsetParent).length,
        };
      }, mainWas);
      assert(
        c.inside && c.offStage && c.offBar && c.offStatus && !c.onMain.length && c.midText && c.footSeen && c.checkBlue === 0 && c.blue === 1 && c.rings <= 1 && (await stageH()) === stageWas,
        `${at}: inside the panel, off the stage, the status line and the fixed bar, nothing of it on the blue button's spot, its foot in view, one blue, at most one ring, the stage its size (${JSON.stringify({ ...c, stageWas, stage: await stageH() })})`,
      );
      if (count === 8) assert(c.lines === 4, `${at}: two picked, a line each (＋ / − for each: ${c.lines} buttons)`);
      await notYet(pb).click();
      await goOnCheck(pb).waitFor({ state: 'detached' });
      // (Esc closes at once, as before: the expert's way.)
      await pb.waitForTimeout(700); // past Not yet's bounce guard: an Esc right after it does nothing
      await pb.keyboard.press('Escape');
      await pb.locator('.stage-box .board').waitFor();
    }
    await pb.setViewportSize({ width: 1280, height: 720 });
    // With the controls hidden in one window (kept apart from the above): N at ▦ Done ▶ board with points not given goes on,
    // as a click on the stage does (↶ Reopen brings it back), the stage its size, the panel still hidden.
    if (count === 4) {
      await pb.locator('.stage-box .board .tile[data-cat="3"]:not([disabled])').first().click();
      await pb.locator('.panel .status', { hasText: 'Answer hidden' }).waitFor();
      await pb.keyboard.press('1');
      await pb.keyboard.press('r');
      await pb.locator('.stage-box [data-slide="answer"]').waitFor();
      await pb.keyboard.press('h');
      await pb.locator('.play > .panel').waitFor({ state: 'detached' });
      const hiddenH = await stageH();
      await pb.keyboard.press('n');
      await pb.locator('.stage-box .board').waitFor();
      assert((await pb.locator('.play > .panel').count()) === 0 && (await stageH()) === hiddenH, `${count} players, the controls hidden: N with no points given goes on to the board, the panel still hidden, the stage its size`);
      await pb.keyboard.press('h');
      await pb.locator('.play > .panel').waitFor();
    }
    // With 8 at 1280×720, a 🎯 Pick a player wheel from the board's 🎡 Wheel: its bar is one row and in sight, Spin! first
    // and no Close in it (the blue button is Next ▶, which only puts it away), then landed (★ Make … the picker under it)
    // Spin again in its place. Then a wheel tile's: the same bar, Spin! ringed, the blue Show question ▶ within 96 px.
    if (count === 8) {
      const tools = pb.locator('.panel [data-tool-controls]');
      const bar = () =>
        tools.locator('> .row').first().evaluate((r) => {
          const kids = [...r.children].filter((c) => c.getBoundingClientRect().width);
          const mids = kids.map((c) => c.getBoundingClientRect()).map((b) => b.top + b.height / 2);
          const words = [...r.querySelectorAll('button')].map((b) => [...b.childNodes].filter((n) => n.nodeName !== 'KBD').map((n) => n.textContent).join('').trim());
          return { line: Math.max(...mids) - Math.min(...mids) <= 4, first: words[0], close: words.filter((w) => w.includes('Close')) };
        });
      const blueInSight = (label) =>
        mainButton(pb, label).evaluate((b) => {
          const r = b.getBoundingClientRect();
          return b.classList.contains('primary') && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
      await pb.getByRole('button', { name: '🎡 Wheel' }).click();
      await pb.getByRole('button', { name: '🎯 Pick a player', exact: true }).click();
      await stepButton(tools, '🎡 Spin!').waitFor();
      let b = await bar();
      assert(
        b.line && b.first === '🎡 Spin!' && !b.close.length && (await blueInSight('Next ▶')) && (await boxHasAction(tools, '🎡 Spin!')) === '',
        `8 players at 1280×720: a tools-row wheel's bar is one row, 🎡 Spin! first (in sight, once), no Close; the blue button is Next ▶ (${JSON.stringify(b)})`,
      );
      await stepButton(tools, '🎡 Spin!').click();
      await tools.getByRole('button', { name: /^★ Make .+ the picker$/ }).waitFor({ timeout: 10000 });
      b = await bar();
      const out = await hidden('.panel [data-tool-controls] > .row:first-child :is(button, select)');
      assert(
        b.line && b.first === '↻ Spin again' && !b.close.length && out.length === 0 && (await blueInSight('Next ▶')),
        `8 players at 1280×720: landed, the bar is still one row and in sight, ↻ Spin again first, no Close, ★ Make … the picker under it, the blue Next ▶ in sight (${JSON.stringify(b)}${out.length ? `; not in sight: ${out.join(', ')}` : ''})`,
      );
      await mainButton(pb, 'Next ▶').click();
      await tools.waitFor({ state: 'detached' });
      // A wheel tile: Spin! first and ringed, no Close; the blue button is Show question ▶, within reach of Spin!.
      await pb.locator('.stage-box .board .tile[data-cat="4"][data-row="4"]').click();
      await stepButton(tools, '🎡 Spin!').waitFor();
      b = await bar();
      const reach = await pb.evaluate(() => {
        const slot = document.querySelector('.panel [data-tool-controls] [data-step]').getBoundingClientRect();
        return Math.round(document.querySelector('.panel [data-next]').getBoundingClientRect().top - slot.bottom);
      });
      console.log(`    (8 players at 1280×720: a wheel tile's Spin! is ${reach} px above the blue button)`);
      const putBackOut = await hidden('.panel [data-flow="putback"]');
      assert(
        b.line && b.first === '🎡 Spin!' && !b.close.length && (await stepButton(tools, '🎡 Spin!').evaluate((x) => x.classList.contains('ring'))) && (await blueInSight('Show question ▶')) && reach <= 96 && !putBackOut.length,
        `8 players at 1280×720: a wheel tile's bar is one row, 🎡 Spin! first and ringed, no Close; the blue Show question ▶ in sight, within 96 px of 🎡 Spin!; ↩ Put back (keep tile) in sight at the flow row's start (${JSON.stringify({ ...b, reach, putBackOut })})`,
      );
      await pb.keyboard.press('w');
      await stepButton(tools, '↻ Spin again').waitFor({ timeout: 10000 });
      await pb.locator('.panel [data-next]:not(:disabled)').waitFor();
      await pb.keyboard.press('n');
      await tools.waitFor({ state: 'detached' });
      await pb.locator('.panel .status', { hasText: 'Answer hidden' }).waitFor();
      assert(await flowIs(pb, '👁 Reveal answer'), '8 players: landed, N (the blue Show question ▶) puts the wheel away and its question is up');
      await pb.keyboard.press('Escape');
      await pb.locator('.stage-box .board').waitFor();
    }
    for (const [w, h, id] of [
      [1280, 720, 'c_box0'],
      [1366, 768, 'c_box1'],
    ]) {
      const at = `${count} players at ${w}×${h}`;
      await pb.setViewportSize({ width: w, height: h });
      await pb.locator(`.stage-box .tile[data-clue="${id}"]`).click();
      await pb.locator('.stage-box [data-partner-up]').waitFor();
      await pb.keyboard.press('1');
      await box.getByText(`${names[0]} picked it.`).waitFor();
      const sizes = [await stageH()];
      const blueSeen = async () => (await hidden('.panel [data-next]')).length === 0;
      assert(
        (await boxHasAction(box, '🎡 Spin for a partner')) === '' && (await flowIs(pb, 'Show question ▶')) && (await blueSeen()) && !(await hidden('.panel [data-flowrow] [data-flow="putback"]')).length,
        `${at}: PARTNER UP!'s 🎡 Spin for a partner is in the box, once and in sight, the blue Show question ▶ in sight, ↩ Put back (keep tile) in sight in the flow row under the box (${await boxHasAction(box, '🎡 Spin for a partner')})`,
      );
      if (count === 8 && w === 1280) {
        await stepButton(box, '🎡 Spin for a partner').click();
        await box.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 10000 });
        assert((await flowIs(pb, 'Next ▶')) && (await blueSeen()), `${at}: the wheel landed, the blue button is Next ▶, in sight`);
        await mainButton(pb).click();
        await pb.locator('.stage-box .wheel').waitFor({ state: 'detached' });
      } else await pb.keyboard.press('2');
      await box.locator('[data-partner-next]', { hasText: 'Pair set' }).waitFor();
      sizes.push(await stageH());
      assert((await flowIs(pb, 'Show question ▶')) && (await blueSeen()) && (await box.getByRole('button', { name: /Show question/ }).count()) === 0, `${at}: paired, Show question ▶ is the blue button only, in sight`);
      await pb.keyboard.press('Enter');
      await pb.locator('.stage-box [data-partner-badge]').waitFor();
      await box.locator('[data-card="2"]').waitFor();
      sizes.push(await stageH());
      const out = await hidden('.panel [data-partner-foot] button, .panel [data-next], .panel [data-partner-next]');
      const has = [await boxHasAction(box, '⏱ Start the clock (45 s)'), await boxHasAction(box, '✔ Got it')].filter(Boolean);
      assert(
        !has.length && (await flowIs(pb, '👁 Reveal answer')) && out.length === 0 && (await box.locator('[data-partner-foot]').getByRole('button', { name: /^Copy Card \d’s words$/ }).count()) === 2,
        `${at}: handing out the cards, ⏱ Start the clock and each card's 📋 Copy words, ✔ Got it and ✘ Missed (the box's foot, once each), its first line and the blue 👁 Reveal answer are in sight${out.length || has.length ? ` (not: ${[...out, ...has].join(', ')})` : ''}`,
      );
      // The foot's action is within reach of the blue button (from its bottom to the blue button's top).
      const reach = await pb.evaluate(() => {
        const slot = document.querySelector('.panel [data-partner-foot] [data-step]').getBoundingClientRect();
        return Math.round(document.querySelector('.panel [data-next]').getBoundingClientRect().top - slot.bottom);
      });
      console.log(`    (${at}: the 🤝 foot's ⏱ Start the clock is ${reach} px above the blue button)`);
      if (w === 1280) assert(reach <= 96, `${at}: the 🤝 foot's ⏱ Start the clock is within 96 px of the blue button (${reach} px)`);
      // (On a laptop with 4 players, Card 1's row too, as before the box had its foot: its first line stays one line.)
      if (count === 4 && w === 1280) {
        const row = await hidden('.panel [data-card="1"] button, .panel [data-partner-panel] [aria-haspopup="menu"]');
        assert(row.length === 0, `${at}: Card 1's row (who gets it, 📋 Copy words) and Another partner ▾ are in sight too${row.length ? ` (not: ${row.join(', ')})` : ''}`);
      }
      // No copies above the blue button: it is 👁 Reveal answer itself (the clue row's quiet ▦ Done ▶ board may scroll away).
      assert((await pb.locator('.panel .flowbeside').count()) === 0 && (await pb.locator('.panel [data-flow="reveal"]').count()) === 1, `${at}: one 👁 Reveal answer (the blue button), no pair above it`);
      const startAt = await stepButton(box, '⏱ Start the clock (45 s)').boundingBox();
      const gotAt = async () => (await box.getByRole('button', { name: /✔ Got it/ }).boundingBox()).x;
      const got0 = await gotAt();
      await pb.waitForTimeout(1100);
      await pb.keyboard.press('Enter');
      await pb.locator('.stage-box .timer').waitFor();
      sizes.push(await stageH());
      const live = await hidden('.panel [data-partner-foot] button, .panel [data-next]');
      assert(live.length === 0, `${at}: the clock running, ✔ Got it, ✘ Missed and the blue 👁 Reveal answer are in sight${live.length ? ` (not: ${live.join(', ')})` : ''}`);
      // (A verdict due in the box: ✔ / ✘ an equal pair, the one blue button 👁 Reveal answer, which asks first.)
      assert((await pb.locator('.panel button.primary:visible').count()) === 1 && (await flowIs(pb, '👁 Reveal answer')), `${at}: the clock running, a verdict is due: one blue button, 👁 Reveal answer`);
      const there = await pb.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent.trim() ?? '', [startAt.x + startAt.width / 2, startAt.y + startAt.height / 2]);
      assert((await gotAt()) === got0 && there === '', `${at}: the clock running, ✔ Got it keeps its place, and no button took the box's ⏱ Start the clock's (${there})`);
      await box.getByRole('button', { name: /✔ Got it/ }).click();
      await box.locator('[data-judged]').waitFor();
      sizes.push(await stageH());
      assert(sizes.every((x) => x === sizes[0]), `${at}: the stage keeps one size from PARTNER UP! to ✔ Got it (${sizes.join(' / ')})`);
      await pb.keyboard.press('r');
      await pb.locator('.stage-box [data-slide="answer"]').waitFor();
      await pb.keyboard.press('Escape');
      await pb.locator('.stage-box .board').waitFor();
    }
    await ctx.close();
  }
  // Seven players tied at the end (one window, 1024×768): the results and the tiebreaker clue keep the Final's panel
  // height, and every chip's score stays in sight there (the part under them gives up its room first).
  console.log('Seven tied at the end:');
  const tieFile = resolve('test-results/hostlayout-tie.json');
  const seven = ['Annabelle', 'Bob', 'Cyrus', 'Deedee', 'Eleanor', 'Fay', 'Gus'];
  const tieBoard = { ...board, id: 'r_tie', values: [200], dailyDoubleCount: 0, categories: [{ ...board.categories[0], clues: [board.categories[0].clues[0]] }] };
  writeFileSync(tieFile, JSON.stringify({ ...game, id: 'g_layout_tie', players: seven.map((name, i) => ({ id: `t${i + 1}`, name, color: crowdColors[i % 6], startScore: 0 })), rounds: [tieBoard] }));
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const p7 = await ctx.newPage();
    p7.on('pageerror', (e) => errors.push(e.message));
    await p7.goto(pathToFileURL(file).href);
    await openGameFile(p7, tieFile);
    await p7.getByText(/^Opened “/).waitFor();
    await p7.getByRole('button', { name: '▶ Play' }).click();
    await p7.getByRole('button', { name: 'Start game ▶' }).click();
    await p7.getByRole('button', { name: 'Skip intro' }).click();
    await p7.locator('.stage-box .board .tile:not([disabled])').first().click();
    await p7.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
    await p7.keyboard.press('Escape');
    await p7.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.includes('End game'));
    // (A click in its first 400 ms is taken for the end of a double-click, and ignored.)
    await p7.waitForTimeout(450);
    await mainButton(p7).click();
    await p7.locator('.panel .status', { hasText: 'Game over' }).waitFor();
    /** The players whose score isn't all in sight in the chips' box. */
    const scoresOut = () =>
      p7.locator('.panel > .players').evaluate((box) => {
        const b = box.getBoundingClientRect();
        return [...box.querySelectorAll('.p')]
          .filter((p) => {
            const r = p.querySelector('.score').getBoundingClientRect();
            return r.top < b.top - 1 || r.bottom > b.bottom + 1;
          })
          .map((p) => p.getAttribute('aria-label'));
      });
    const endOut = await scoresOut();
    assert(endOut.length === 0, `1024×768, seven tied: every score is in sight on the results${endOut.length ? ` (not: ${endOut.join(', ')})` : ''}`);
    // (No blue button on the results: the tiebreaker clue is the tie box's.)
    await p7.locator('.panel [data-tie]').getByRole('button', { name: '❓ Tiebreaker clue' }).click();
    await p7.locator('.panel .status', { hasText: 'Tiebreaker' }).waitFor();
    const clueOut = await scoresOut();
    const whoWon = await p7.locator('.panel [data-tb-who] button').count();
    assert(clueOut.length === 0 && whoWon === 7, `and in the tiebreaker clue, where the winner is picked from them (a 🏆 each: ${whoWon})${clueOut.length ? ` (not: ${clueOut.join(', ')})` : ''}`);
    await ctx.close();
  }
  // The Final's reveal rows at 1280×720 in one window, long team names: straight columns (✔ Right, ✘ Wrong and Show
  // wager at one place on every row, its wager shown or still in a box), each row one line, a long name cut short (whole
  // in its tooltip), and Finish now… at the left of the box's foot, beside how many are still to judge.
  console.log('The Final’s reveal rows, long names:');
  const longFile = resolve('test-results/hostlayout-long.json');
  const longNames = ['The Unbelievably Long-Named Team of Champions', 'Bo', 'Cyrus Who Never Stops Talking About Speedruns', 'Dee'];
  writeFileSync(
    longFile,
    JSON.stringify({ ...game, id: 'g_layout_long', players: longNames.map((name, i) => ({ id: `l${i + 1}`, name, color: crowdColors[i], startScore: 0 })), rounds: [{ ...game.rounds[3], extraSlides: [], cards: [] }] }),
  );
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pl = await ctx.newPage();
    pl.on('pageerror', (e) => errors.push(e.message));
    await pl.goto(pathToFileURL(file).href);
    await openGameFile(pl, longFile);
    await pl.getByText(/^Opened “/).waitFor();
    await pl.getByRole('button', { name: '▶ Play' }).click();
    await pl.getByRole('button', { name: 'Start game ▶' }).click();
    await pl.locator('.fj .wagers').waitFor();
    // (Everyone on $0 plays, their $0 wagers in: N shows the question, the answer, the reveals, then the first one's wager.)
    for (const step of ['Question on screen', 'Answer on screen', 'Player reveals']) {
      await pl.keyboard.press('n');
      await pl.locator('.panel .status', { hasText: step }).waitFor();
    }
    await pl.keyboard.press('n');
    await pl.locator('.fj .pl.cur', { hasText: 'wager $0' }).waitFor();
    const rows = await pl.locator('.fj .pl').evaluateAll((els) =>
      els.map((r) => {
        const box = (sel) => r.querySelector(sel).getBoundingClientRect();
        const [name, right] = [box('.name'), box('button.good')];
        const n = r.querySelector('.name');
        return {
          at: [box('button.good').left, box('button.bad').left, box('button[aria-label^="Show wager"]').left].map(Math.round).join(),
          h: Math.round(r.getBoundingClientRect().height),
          oneLine: Math.abs(name.top + name.height / 2 - (right.top + right.height / 2)) <= 3,
          cut: n.scrollWidth > n.clientWidth,
          title: n.title,
        };
      }),
    );
    const one = (k) => new Set(rows.map((r) => r[k])).size === 1;
    const long = rows.filter((r) => longNames.slice(0, 3).some((x) => x.length > 20 && r.title.startsWith(x)));
    assert(
      rows.length === 4 && one('at') && one('h') && rows.every((r) => r.oneLine) && long.length === 2 && long.every((r) => r.cut),
      `1280×720, long team names: the reveal rows' ✔ Right, ✘ Wrong and Show wager line up on every row (the first one's wager shown, the others' in a box), each row one line, a long name cut short and whole in its tooltip (${JSON.stringify(rows.map(({ at, h, cut }) => ({ at, h, cut })))})`,
    );
    const spotRight = await pl.locator('.fj .pl.cur button.good').evaluate((b) => {
      const r = b.getBoundingClientRect();
      return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    const foot = await pl.locator('.fj > .row:last-child > *').evaluateAll((els) => els.map((e) => e.textContent.trim()).filter(Boolean).slice(0, 2));
    const [early, verdict] = await Promise.all([pl.locator('.fj [data-finish-early]').boundingBox(), pl.locator('.fj .pl button.good').first().boundingBox()]);
    assert(
      spotRight && foot.join() === 'Finish now…,4 still to judge' && early.x + early.width < verdict.x,
      `and the spotlit row's ✔ Right in sight; Finish now… at the left of the box's foot beside “4 still to judge”, away from the verdicts (${foot.join(' | ')})`,
    );
    await ctx.close();
  }

  // Just over 1100px and just over 1180px wide (◀ Slide and ▦ Done ▶ board in words, the buttons a size bigger): the
  // "Pick who answered" hint takes only the room left, so a two-slide clue's row stays one line, in either font.
  for (const w of [1110, 1184]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 768 } });
    const p5 = await ctx.newPage();
    p5.on('pageerror', (e) => errors.push(e.message));
    await p5.goto(pathToFileURL(file).href);
    await openGameFile(p5, crowdFile);
    await p5.getByText(/^Opened “/).waitFor();
    await p5.getByRole('button', { name: '▶ Play' }).click();
    await p5.getByRole('button', { name: 'Start game ▶' }).click();
    await p5.getByRole('button', { name: 'Skip intro' }).click();
    const two = p5.locator('.stage-box .board .tile[data-clue="c_two"]');
    await two.waitFor();
    const stageH = async () => Math.round((await p5.locator('.stage-box').boundingBox()).height);
    const sizes = [await stageH()];
    await two.click();
    await p5.locator('.panel [data-slidepos]', { hasText: 'Slide 1 of 2' }).waitFor();
    sizes.push(await stageH());
    await p5.keyboard.press('n');
    await p5.locator('.panel [data-slidepos]', { hasText: 'Slide 2 of 2' }).waitFor();
    sizes.push(await stageH());
    // (Its words in sight, not only read out: the flow row's places show their signs only when the row runs out of room.)
    const words = await p5.locator('.panel .award .done-board .word').evaluate((w) => Math.round(w.getBoundingClientRect().width));
    const putBack = await p5.locator('.panel .award [data-flow="putback"]').evaluate((b) => [...b.querySelectorAll('.w1, .w2')].every((w) => w.getBoundingClientRect().width > 8));
    assert(
      sizes.every((x) => x === sizes[0]) && words > 40 && putBack,
      `${w}×768, a clue with two slides: the stage keeps the board's size, ▦ Done ▶ board and ↩ Put back (keep tile) in words (${sizes.join(' / ')}; Done's ${words}px)`,
    );
    await ctx.close();
  }

  // 🔇 Stop sounds (the round intro's music goes on over the board until a tile opens) and the cards out come and go on
  // the board's tools row: with either, both or neither there, a three-round game (Go to round, a long Final name in its
  // list and on the second round's ▶) keeps the stage one size from the board to a clue, all still named in full.
  console.log('🔇 Stop sounds and cards out on the board:');
  // (A second of tone: the intro's own file, so 🔇 Stop sounds shows.)
  const intro = tone();
  const board2 = { id: 'r_board2', name: 'Double Jeopardy!', mode: 'board', values: [400, 800, 1200, 1600, 2000], dailyDoubleCount: 0, categories: cats.map((c, ci) => ({ id: `cat2${ci}`, title: c, clues: [0, 1, 2, 3, 4].map((ri) => clue(`${c} again ${ri}`, `Answer 2.${ci}.${ri}`)) })) };
  const introFile = resolve('test-results/hostlayout-intro.brainrot');
  writeFileSync(
    introFile,
    await packGame(
      {
        ...game,
        id: 'g_layout_intro',
        settings: { ...game.settings, roundIntro: { titleCard: true, tileFill: false, categoryReveal: 'off' } },
        players: crowd.map((name, i) => ({ id: `p${i + 1}`, name, color: crowdColors[i], startScore: 500 })),
        rounds: [board, board2, { ...game.rounds[3], name: 'Final Jeopardy: Internet Legends' }],
        media: [{ id: 'm_intro', name: 'intro.wav', mime: 'audio/wav', size: intro.length, kind: 'audio' }],
        audio: { roundIntro: 'm_intro' },
      },
      { m_intro: intro },
    ),
  );
  let cardMenuSeen = false;
  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
    [1340, 768],
    [1320, 768],
    [1290, 768],
    [1260, 768],
    [1024, 768],
    [960, 900],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p5 = await ctx.newPage();
    p5.on('pageerror', (e) => errors.push(e.message));
    await p5.goto(pathToFileURL(file).href);
    await openGameFile(p5, introFile);
    await p5.getByText(/^Opened “/).waitFor();
    await p5.getByRole('button', { name: '▶ Play' }).click();
    await p5.getByRole('button', { name: 'Start game ▶' }).click();
    await p5.getByRole('button', { name: 'Skip intro' }).click();
    await p5.locator('.stage-box .board .tile:not([disabled])').first().waitFor();
    const tools = p5.locator('.panel .toolsrow');
    const stop = tools.getByRole('button', { name: '🔇 Stop sounds', exact: true });
    const cardsOut = tools.locator('[data-cards-out-count]');
    const stageH = async () => Math.round((await p5.locator('.stage-box').boundingBox()).height);
    // Jeopardy!, then Double Jeopardy!, whose ▶ is the Final's long name (cut short on the button, in full in its
    // tooltip and read out in full).
    for (const [round, next] of [
      ['Jeopardy!', 'Next round ▶'],
      ['Double Jeopardy!', 'Final Jeopardy: Internet Legends ▶'],
    ]) {
      const at = `${w}×${h}, ${round}`;
      await stop.waitFor();
      const onBoard = { '🔇': await stageH() };
      // A card out: no phones here, so to Annabelle's 🪟 card window (from 🤫 Send a card…), then that window closed.
      await tools.getByRole('button', { name: '🤫 Send a card…', exact: true }).click();
      const send = p5.getByRole('dialog', { name: 'Send a card' });
      const [cardWin] = await Promise.all([p5.waitForEvent('popup'), send.getByRole('button', { name: 'Card window for Annabelle' }).click()]);
      await send.getByRole('button', { name: 'Annabelle', exact: true }).click();
      await send.getByRole('textbox', { name: 'The card’s words' }).fill('A secret');
      await send.getByRole('button', { name: '🪟 Show Annabelle' }).click();
      if (!cardMenuSeen) {
        // The card window gets no browser menu either.
        await cardWin.waitForLoadState('domcontentloaded');
        const words = cardWin.getByText('A secret');
        await words.waitFor();
        await cardWin.evaluate(() => window.addEventListener('contextmenu', (e) => (window.__menuTaken = e.defaultPrevented), { once: true }));
        await words.click({ button: 'right' });
        assert((await cardWin.evaluate(() => window.__menuTaken)) === true, 'a right-click in the 🪟 card window gets no browser menu');
        cardMenuSeen = true;
      }
      await tools.locator('[data-cards-out-count="1"]').waitFor();
      await p5.keyboard.press('Escape');
      await send.waitFor({ state: 'detached' });
      await tools.getByRole('button', { name: '🪟 Cards: Annabelle' }).click();
      await p5.getByRole('dialog', { name: 'Card window' }).getByRole('button', { name: '✕ Close the card window' }).click();
      await tools.locator('[data-card-window-warn]').waitFor({ state: 'detached' });
      onBoard['🔇 and 🤫 1'] = await stageH();
      const named = await Promise.all(['🔇 Stop sounds', '🤫 1 card out', '◀ Previous round', '📊 Scoreboard', next].map((name) => tools.getByRole('button', { name, exact: true }).count()));
      assert(named.every((c) => c === 1), `${at}: with both there, 🔇 Stop sounds, the cards out, ◀ Previous round, 📊 Scoreboard and ${next} are still named in full`);
      if (round === 'Double Jeopardy!') {
        const tip = await tools.getByRole('button', { name: next, exact: true }).getAttribute('title');
        assert(tip.startsWith('Final Jeopardy: Internet Legends · '), `${at}: ${next}'s tooltip names the Final in full (${tip})`);
      }
      if (w > 1520) {
        // A wide window has room for their words, both there or not.
        const widths = await Promise.all(['🔇 Stop sounds', '🤫 1 card out', '◀ Previous round'].map(async (name) => Math.round((await tools.getByRole('button', { name, exact: true }).boundingBox()).width)));
        assert(widths.every((x) => x > 80), `${at}: with both there, 🔇 Stop sounds, the cards out and ◀ Previous round keep their words (${widths.join(' / ')}px wide)`);
      }
      await stop.click();
      await stop.waitFor({ state: 'detached' });
      onBoard['🤫 1'] = await stageH();
      // The card taken back: neither on the row.
      await cardsOut.click();
      await p5.getByRole('dialog', { name: 'Cards out' }).getByRole('button', { name: /^Take .+ back$/ }).click();
      await tools.locator('[data-cards-out-count="0"]').waitFor();
      await p5.keyboard.press('Escape');
      await cardsOut.waitFor({ state: 'detached' });
      onBoard['neither'] = await stageH();
      await p5.locator('.stage-box .board .tile:not([disabled])').first().click();
      await p5.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
      const inClue = await stageH();
      assert(
        Object.values(onBoard).every((x) => x === inClue),
        `${at}: the stage keeps one size from the board, with ${Object.keys(onBoard).join(' / ')} on its tools row, to a clue (${Object.values(onBoard).join(' / ')} / ${inClue})`,
      );
      if (round === 'Jeopardy!') {
        // Back to the board, then Go to round → Double Jeopardy!: its intro's music again, so 🔇 Stop sounds is back.
        await p5.keyboard.press('Escape');
        const picker = p5.getByRole('combobox', { name: 'Go to round' });
        await picker.waitFor();
        await picker.selectOption({ label: '🟦 Double Jeopardy!' });
        const ask = confirmStrip(p5);
        await ask.waitFor();
        // (Its answer ignores a click in its first moment: the second half of a double-click.)
        for (let i = 0; await ask.count(); i++) {
          if (i === 10) throw new Error('Assertion failed: Go to Double Jeopardy! ▶ on “… Go to Double Jeopardy!?” goes there');
          await ask.getByRole('button', { name: 'Go to Double Jeopardy! ▶', exact: true }).click();
          await ask.waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
        }
        await p5.getByRole('button', { name: 'Skip intro' }).click();
        await p5.locator('.stage-box .board .tile:not([disabled])').first().waitFor();
      }
    }
    await ctx.close();
  }
  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Host layout e2e passed');
} finally {
  await browser.close();
}
