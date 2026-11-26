// @ts-check
// One window: the stage viewers see is one box the whole game. At 1280×720, 1366×768 and 1920×1080 it keeps one size
// and place (the 16:9 stage, measured on screen) from the board to a clue and its answer, a Daily Double's splash and
// question, a 🤝 partner clue (PARTNER UP!, its wheel, the cards handed out, ✔ Got it), an RPG round, a board-game
// round, the Final's wagers, question and reveals, the results and the tiebreaker clue: the host panel under it is one
// height all along (its rows scroll), and the RPG and board-game rounds keep it under the stage too. 👥 Players,
// ⚖ Rules and the keys (?) open in that panel: their title and Done stay in sight as the middle scrolls, and the rows
// fade over Done while there's more below (gone at the foot). ⚖ Rules and 🔊 Test the sound take the panel's width
// there, and 🎭 Deal… is 600px wide, two parts side by side, still off the stage.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  appFile,
  confirmStrip,
  leaveAnswer,
  mainButton,
  openGameFile,
  returningHost,
  revealAnyway,
  failureShots,
  assert,
  launchChromium,
  section,
  boardIn,
  finalControlsIn,
  hostPanelIn,
  playerRowsIn,
  roundNavIn,
  stageBoxIn,
  statusLineIn,
  toolsRowIn,
  resultsPath,
} from './helpers.mjs';

const file = appFile();
const browser = await launchChromium();
const errors = [];

// Every kind of round: a board (a Daily Double, a partner clue), an RPG round, a board game and a Final, three players
// at 500 (the Final at 0 wagers, all right: a tie for first, and the tiebreaker).
const text = (id, t) => ({
  id,
  kind: 'text',
  text: t,
  x: 160,
  y: 340,
  w: 1600,
  h: 400,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  font: 'Arial',
  size: 72,
  weight: 700,
  italic: false,
  underline: false,
  uppercase: false,
  color: '#fff',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.2,
  letterSpacing: 0,
  autoFit: true,
});
const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
let n = 0;
const clue = (q, a, more = {}) => ({ id: `c${++n}`, value: null, type: 'standard', questionSlide: slide(`q${n}`, q), answerSlide: slide(`a${n}`, a), ...more });
const partner = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
const partnerCards = ['giver', 'guesser'].map((to, k) => ({ id: `pc${k}`, to, ...slide(`pcs${k}`, `Card ${k + 1}`) }));
const cats = ['Memes', 'Skibidi Lore', 'Minecraft', 'Rizz', 'Speedruns'];
const board = {
  id: 'r_board',
  name: 'Jeopardy!',
  mode: 'board',
  values: [200, 400, 600, 800, 1000],
  dailyDoubleCount: 1,
  categories: cats.map((c, ci) => ({
    id: `cat${ci}`,
    title: c,
    clues: [0, 1, 2, 3, 4].map((ri) =>
      ci === 4 && ri === 0
        ? clue('A Daily Double', 'Its answer', { type: 'dailyDouble' })
        : ci === 0 && ri === 1
          ? clue('Describe it', 'The partner answer', { id: 'c_partner', type: 'partner', partner, timerSeconds: 45, cards: partnerCards })
          : clue(`${c} ${ri}`, `Answer ${ci}.${ri}`),
    ),
  })),
};
const screens = [0, 1].map((c) => ({ id: `sc_${c}`, name: `Field ${c}`, col: c, row: 0, slide: { background: { color: '#553322' }, elements: [] } }));
const sp = (id, name, x, y, next) => ({ id, name, x, y, color: '#4363d8', next });
const game = {
  id: 'g_onestage',
  version: 2,
  title: 'One Stage Night',
  settings: {
    allowNegativeScores: true,
    deductOnWrong: true,
    defaultTimerSeconds: 15,
    finalTimerSeconds: 30,
    currencySymbol: '$',
    rollOffDie: 20,
    pickerFollowsAward: true,
    timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' },
    maxPlayers: 8,
  },
  players: ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 500 })),
  rounds: [
    board,
    { id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' },
    {
      id: 'r_bg',
      name: 'Board game',
      mode: 'boardgame',
      slide: { background: { color: '#1d5e3a' }, elements: [] },
      spaces: [sp('b0', 'Start', 300, 300, ['b1']), sp('b1', 'Middle', 900, 300, ['b2']), sp('b2', 'Finish', 1500, 300, [])],
      mover: { kind: 'dice', dice: 'dp1' },
      zones: [],
    },
    {
      id: 'r_final',
      name: 'Final Jeopardy!',
      mode: 'final',
      category: 'Internet History',
      questionSlide: slide('fq', 'The first video'),
      answerSlide: slide('fa', 'Me at the zoo'),
      timerSeconds: 30,
      allowNonPositive: true,
    },
  ],
  media: [],
  audio: {},
  theme: {},
  wheels: [],
  dice: [{ id: 'dp1', name: 'Move die', dice: [{ id: 'd1', sides: 6, count: 1 }], showTotal: true }],
  statFields: [],
  items: [],
  tiebreaker: { questionSlide: slide('tq', 'Tiebreaker question'), answerSlide: slide('ta', 'Tiebreaker answer') },
  worlds: [
    {
      id: 'w1',
      name: 'World',
      maps: [
        {
          id: 'm1',
          name: 'Overworld',
          cols: 2,
          rows: 1,
          screens,
          visibility: 'discovered',
          showExits: true,
          revealNeighbors: true,
          diagonals: true,
          wrap: false,
          transition: 'cut',
        },
      ],
    },
  ],
};
const gameFile = resultsPath('onestage.json');
writeFileSync(gameFile, JSON.stringify(game));

/** The 16:9 stage on screen (what a capture crops), rounded. */
const stageBox = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.stage-box [data-stage]').getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round).join(',');
  });

/**
 * A window in the host panel (👥 Players, ⚖ Rules, the keys): inside the panel, off the stage; its title and Done in
 * sight (what's at their middle is them) at the top and as it scrolls to the foot; faded over Done while there's more
 * below, and not at the foot.
 */
async function panelWindow(page, w, h, name, open, wide = false) {
  await open();
  const dialog = page.getByRole('dialog', { name });
  await dialog.waitFor();
  await page.waitForTimeout(200);
  if (wide) {
    // (⚖ Rules and 🔊 Test the sound take the panel's width, up to 1180px: more of them shows in the band.)
    const fit = await dialog.evaluate((d) => {
      const panel = document.querySelector('.play > .panel').getBoundingClientRect();
      return { w: Math.round(d.getBoundingClientRect().width), want: Math.round(Math.min(1180, panel.width - 16)), shown: d.clientHeight, all: d.scrollHeight };
    });
    assert(fit.w >= fit.want - 2, `${w}×${h}, ${name}: as wide as the panel (up to 1180px) (${JSON.stringify(fit)})`);
  }
  const look = () =>
    dialog.evaluate((d) => {
      const inSight = (el) => {
        const r = el.getBoundingClientRect();
        return !!el && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      };
      const panel = document.querySelector('.play > .panel').getBoundingClientRect();
      const stage = document.querySelector('.stage-box').getBoundingClientRect();
      const r = d.getBoundingClientRect();
      const done = [...d.querySelectorAll('.modal-foot button')].find((b) => b.textContent.trim() === 'Done');
      return {
        inPanel: r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1 && r.top >= stage.bottom - 1,
        scrolls: d.scrollHeight > d.clientHeight + 1,
        title: inSight(d.querySelector('.modal-title')),
        done: inSight(done),
        fade: d.hasAttribute('data-more') && getComputedStyle(d.querySelector('.modal-foot'), '::before').content !== 'none',
      };
    });
  const top = await look();
  assert(top.inPanel && top.title && top.done, `${w}×${h}, ${name}: in the host panel, off the stage, its title and Done in sight (${JSON.stringify(top)})`);
  if (top.scrolls) {
    assert(top.fade, `${w}×${h}, ${name}: it scrolls, and the rows fade over Done while there's more below`);
    await dialog.evaluate((d) => (d.scrollTop = d.scrollHeight));
    await page.waitForTimeout(150);
    const foot = await look();
    assert(
      foot.title && foot.done && !foot.fade,
      `${w}×${h}, ${name}: scrolled to its foot, the title and Done are still in sight, and no fade (${JSON.stringify(foot)})`,
    );
  }
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}

try {
  for (const [w, h] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
  ]) {
    section(`${w}×${h}`);
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await returningHost(context);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));
    await page.goto(pathToFileURL(file).href);
    await openGameFile(page, gameFile);
    await page.getByText(/^Opened “/).waitFor();
    await page.getByRole('button', { name: '▶ Play' }).click();
    // A double-click on Start game ▶ in one window: its second click lands on the host panel (❔ Help, 📺 Audience
    // nearby) and does nothing there: no audience window, no question asked.
    await page.getByRole('button', { name: 'Start game ▶' }).dblclick();
    await hostPanelIn(page).waitFor();
    await page.waitForTimeout(500);
    assert(
      context.pages().length === 1 && (await confirmStrip(page).count()) === 0 && (await page.locator('[role=dialog]').count()) === 0,
      `${w}×${h}: a double-click on Start game ▶ in one window opens no audience window and asks nothing (${context.pages().length} pages)`,
    );
    await page.getByRole('button', { name: 'Skip intro' }).click();
    await boardIn(stageBoxIn(page)).locator('.tile:not([disabled])').first().waitFor();

    const sizes = {};
    const measure = async (k) => {
      await page.waitForTimeout(250);
      sizes[k] = await stageBox(page);
    };
    const toBoard = async () => {
      await page.keyboard.press('Escape');
      await boardIn(stageBoxIn(page)).waitFor();
    };
    const nextRound = async (status) => {
      await page.waitForTimeout(450);
      await roundNavIn(page).locator('button', { hasText: '▶' }).click();
      await confirmStrip(page).waitFor();
      await page.waitForTimeout(450);
      await leaveAnswer(page).click();
      if (status) await statusLineIn(page, { hasText: status }).waitFor();
    };
    const tile = (cat, row) => boardIn(stageBoxIn(page)).locator(`.tile[data-cat="${cat}"][data-row="${row}"]`);

    await measure('board');
    // The windows in the panel (on the board, the panel as it is all game).
    await panelWindow(page, w, h, 'Players', () => hostPanelIn(page).locator('.fixed').getByRole('button', { name: '👥 Players' }).click());
    await panelWindow(page, w, h, 'Game rules', () => hostPanelIn(page).locator('.fixed').getByRole('button', { name: '⚖ Rules' }).click(), true);
    await measure('⚖ Rules open');
    // 🔊 Test the sound: as wide as the panel, its parts side by side (testing it | streaming it), in the panel.
    await hostPanelIn(page).getByRole('button', { name: '🔊 Sound' }).click();
    const sound = page.getByRole('dialog', { name: 'Test the sound' });
    await sound.waitFor();
    await page.waitForTimeout(200);
    await measure('🔊 Test the sound open');
    const soundBox = await sound.evaluate((d) => {
      const panel = document.querySelector('.play > .panel').getBoundingClientRect();
      const stage = document.querySelector('.stage-box').getBoundingClientRect();
      const r = d.getBoundingClientRect();
      const cols = [...d.querySelectorAll('.cols > .col')].map((c) => Math.round(c.getBoundingClientRect().top));
      return {
        w: Math.round(r.width),
        want: Math.round(Math.min(1180, panel.width - 16)),
        inPanel: r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1 && r.top >= stage.bottom - 1,
        sideBySide: cols.length === 2 && cols[0] === cols[1],
      };
    });
    assert(
      soundBox.w >= soundBox.want - 2 && soundBox.inPanel && soundBox.sideBySide,
      `${w}×${h}: 🔊 Test the sound is as wide as the panel (up to 1180px), in it, off the stage, its parts side by side (${JSON.stringify(soundBox)})`,
    );
    await sound.getByRole('button', { name: 'Done', exact: true }).click();
    await sound.waitFor({ state: 'detached' });
    // 🎭 Deal…: wider in one window (the ready-made deal's name whole, two parts side by side), still in the panel.
    await toolsRowIn(page).getByRole('button', { name: /🎭/ }).click();
    const deal = page.getByRole('dialog', { name: 'Deal' });
    await deal.waitFor();
    await page.waitForTimeout(200);
    await measure('🎭 Deal… open');
    const dealBox = await deal.evaluate((d) => {
      const panel = document.querySelector('.play > .panel').getBoundingClientRect();
      const stage = document.querySelector('.stage-box').getBoundingClientRect();
      const r = d.getBoundingClientRect();
      const parts = [...d.querySelectorAll('[data-deal-part]')].map((p) => Math.round(p.getBoundingClientRect().top));
      // (Each part's card words, "Card: 1 line of words": one line, never squeezed beside its wheel's choice.)
      const cards = [...d.querySelectorAll('[data-deal-part] .cardrow > span')].map((e) =>
        Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).fontSize)),
      );
      return {
        w: Math.round(r.width),
        inPanel: r.left >= panel.left - 1 && r.right <= panel.right + 1 && r.top >= stage.bottom - 1,
        sideBySide: parts.length >= 2 && parts[0] === parts[1],
        cards,
      };
    });
    assert(
      dealBox.w >= 590 && dealBox.inPanel && dealBox.sideBySide && dealBox.cards.length >= 2 && dealBox.cards.every((n) => n < 2),
      `${w}×${h}: 🎭 Deal… is 600px wide in the panel, off the stage, two parts side by side, each one's card words on one line (${JSON.stringify(dealBox)})`,
    );
    await page.keyboard.press('Escape');
    await deal.waitFor({ state: 'detached' });
    await panelWindow(page, w, h, 'Keyboard shortcuts', async () => {
      await statusLineIn(page).click();
      await page.keyboard.press('?');
    });

    await tile(1, 0).click();
    await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
    await measure('clue');
    await page.keyboard.press('r');
    await stageBoxIn(page).locator('[data-slide="answer"]').waitFor();
    await measure('answer');
    await toBoard();

    await tile(4, 0).click();
    await stageBoxIn(page).locator('.dd-text').waitFor();
    await measure('Daily Double splash');
    await hostPanelIn(page).locator('.dd .chip', { hasText: 'Ann' }).click();
    await hostPanelIn(page).locator('.dd input[type=number]').fill('100');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
    await measure('Daily Double question');
    await toBoard();

    const box = hostPanelIn(page).locator('[data-partner-panel]');
    await tile(0, 1).click();
    await stageBoxIn(page).locator('[data-partner-up]').waitFor();
    await measure('PARTNER UP!');
    await page.keyboard.press('1');
    await box.getByText('Ann picked it.').waitFor();
    await page.keyboard.press('w');
    await stageBoxIn(page).locator('.wheel').waitFor();
    await box.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 10000 });
    await measure('partner wheel');
    await page.keyboard.press('Escape');
    await stageBoxIn(page).locator('.wheel').waitFor({ state: 'detached' });
    await page.keyboard.press('Enter');
    await stageBoxIn(page).locator('[data-partner-badge]').waitFor();
    await measure('partner cards out');
    await box.getByRole('button', { name: /✔ Got it/ }).click();
    await box.locator('[data-judged]').waitFor();
    await measure('partner judged');
    await page.keyboard.press('r');
    await stageBoxIn(page).locator('[data-slide="answer"]').waitFor();
    await toBoard();
    // (The scores now, as they go into the Final: Ann, Bob, Cy.)
    const pts = (await playerRowsIn(page).locator('.score').allInnerTexts()).map((t) => Number(t.replace('−', '-').replace(/[^\d-]/g, '')));
    const top = Math.max(...pts);

    await nextRound('Adventure');
    await measure('RPG round');
    assert(
      !(await page.locator('.play').evaluate((p) => p.classList.contains('side'))),
      `${w}×${h}: the RPG round's controls are under the stage, as every round's`,
    );
    await nextRound('Board game');
    await measure('board-game round');

    await nextRound();
    await finalControlsIn(page).locator('.wagers input[data-wager]').first().waitFor();
    await measure('Final wagers');
    // (Wagers that bring everyone level when all are right: a tie for first, for the tiebreaker.)
    for (const [i, id] of ['p1', 'p2', 'p3'].entries())
      await finalControlsIn(page)
        .locator(`.wagers input[data-wager="${id}"]`)
        .fill(String(top - pts[i]));
    for (const label of ['Show question ▶', '👁 Reveal answer', 'Start player reveals ▶']) {
      await page.waitForFunction((l) => document.querySelector('.panel [data-next]')?.textContent?.startsWith(l), label);
      if (label === '👁 Reveal answer') await measure('Final question');
      await mainButton(page).click();
      // (Its think clock still running: it asks first.)
      if (label === '👁 Reveal answer') await revealAnyway(page);
    }
    await finalControlsIn(page).locator('.pl').first().waitFor();
    await measure('Final reveals');
    for (let i = 0; i < 3; i++) await finalControlsIn(page).locator('.pl').nth(i).getByRole('button', { name: '✔ Right' }).click();
    await mainButton(page).click();
    await statusLineIn(page, { hasText: 'Game over' }).waitFor();
    await measure('results');
    await hostPanelIn(page).locator('[data-tie]').getByRole('button', { name: '❓ Tiebreaker clue' }).click();
    await stageBoxIn(page, { hasText: 'Tiebreaker question' }).waitFor();
    await measure('tiebreaker');

    const all = Object.entries(sizes);
    const [, first] = all[0];
    console.log(`    (the stage at ${first}: x, y, width, height)`);
    assert(
      all.every(([, s]) => s === first),
      `${w}×${h}: the stage keeps one size and place in every round and moment (${all.map(([k, s]) => `${k} ${s}`).join(' · ')})`,
    );
    await context.close();
  }
  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log('onestage: all passed');
} catch (e) {
  await failureShots('onestage', browser);
  throw e;
} finally {
  await browser.close();
}
