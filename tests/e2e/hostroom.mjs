// @ts-check
// The one-window host panel's room on a laptop, four players (Annabelle, Bob, Cat, Dmitri), in the built app:
// 1. at 1280×720 (and 1024×768), a clue whose tile has a box of its own (its 🤫 cards, a wheel or dice tile's tool, up
//    and landed) keeps every player's chip whole: each chip inside the chips' box, its ✔ hit at its centre; the tile's
//    box scrolls instead, saying so ("▾ more" on the flow row while it goes on, gone at its end). The stage keeps its
//    size;
// 2. the blue button keeps one place under the stage: a plain clue, a 🤫 card tile, a dice tile, a wheel tile (up,
//    landed, and its question), a board-game turn (before and after its roll) and the Final's steps up to its reveals;
// 3. a 🤝 partner clue's 📤 Hand out the cards, at 1280×720 and 1024×768: its first line reads whole
//    ("Next: 📋 Copy, then ⏱️ Start", the whole sentence in its tooltip), and the foot says "▾ more" while the card rows
//    go on under it (gone at the box's end);
// 4. an RPG round (and a board game) folds its Amount row behind ± Adjust score, in the tools row: the pad's 9 buttons
//    and the minimap's first row in sight at the box's top, the same with a player picked on the stage (which leaves the
//    row folded); a player's number opens it, ✕ Close folds it (players picked or not), ± Adjust score opens it;
// 5. a laptop at 200% zoom (640×360, three players, a clue): the chips' box, one chip in sight, says there are more
//    (data-more, its foot faded), and stops saying it scrolled to its end;
// 6. a phone on its side (844×390): a wheel or dice tile's box keeps its room over the flow row (the chips give way);
// 7. a phone held upright (390×844): a 🤫 cards tile's rows fade under the flow row with no "▾ more" tab over ＋ Award;
//    an RPG round's selection line keeps a row of its own, Clear selection in words;
// 8. a tablet held upright (768×1024): the RPG selection line on the top row keeps room for who's picked and Clear
//    selection in words (the party buttons go on to the row's second line), the pad whole.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  answerAsk,
  appFile,
  assert,
  assertEq,
  awardRowIn,
  failureShots,
  goOnCheck,
  hostPanelIn,
  launchChromium,
  leaveAnswer,
  mainButton,
  mainLabel,
  openGameFile,
  playerRowsIn,
  resultsPath,
  roundNavIn,
  section,
  sleep,
  stageBoxIn,
  statusLineIn,
  stepButton,
  toolsRowIn,
  until,
} from './helpers.mjs';

const file = appFile();
const browser = await launchChromium();
/** @type {string[]} */
const errors = [];

let n = 0;
/** @param {string} t */
const text = (t) => ({
  id: `t${n++}`,
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
  size: 80,
  weight: 700,
  italic: false,
  underline: false,
  uppercase: false,
  color: '#ffffff',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.2,
  letterSpacing: 0,
  autoFit: true,
});
/** @param {string} t */
const slide = (t) => ({ background: { color: '#0a1a6b' }, elements: [text(t)] });
/** @param {string} id @param {object} [more] */
const clue = (id, more = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(`Question ${id}`), answerSlide: slide(`Answer ${id}`), ...more });
const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
const NAMES = ['Annabelle', 'Bob', 'Cat', 'Dmitri'];
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231'];
const screens = [0, 1].map((c) => ({ id: `sc_${c}`, name: `Field ${c}`, col: c, row: 0, slide: { background: { color: '#553322' }, elements: [] } }));
/** @param {number} count */
const gameWith = (count) => ({
  id: 'g_room',
  version: 2,
  title: 'Room show',
  settings: {
    allowNegativeScores: true,
    deductOnWrong: true,
    defaultTimerSeconds: null,
    finalTimerSeconds: 30,
    currencySymbol: '$',
    rollOffDie: 20,
    pickerFollowsAward: true,
    timerAutoStart: true,
    roundIntro: { titleCard: true, tileFill: false, categoryReveal: 'click' },
    maxPlayers: 8,
    stream: { clueCaption: true },
  },
  players: NAMES.slice(0, count).map((name, i) => ({ id: `p${i + 1}`, name, color: COLORS[i], startScore: 0 })),
  rounds: [
    {
      id: 'r1',
      name: 'Jeopardy!',
      mode: 'board',
      values: [200, 400, 600],
      dailyDoubleCount: 0,
      categories: [
        { id: 'cat0', title: 'Memes', clues: [clue('q_std'), clue('q_two'), clue('q_wheel', { type: 'wheel', wheelId: 'w1' })] },
        {
          id: 'cat1',
          title: 'Movies',
          clues: [
            clue('q_pc', { type: 'partner', partner: { ...rules }, timerSeconds: 45, cards: [{ id: 'card1', to: 'giver', ...slide('Shrek') }] }),
            clue('q_pn', { type: 'partner', partner: { ...rules }, timerSeconds: 45 }),
            clue('q_dice', { type: 'dice', diceId: 'dp1' }),
          ],
        },
        {
          id: 'cat2',
          title: 'Skibidi Lore',
          clues: [clue('q_a'), clue('q_b', { cards: [{ id: 'cardx', to: 'playing', ...slide('A hint card') }] }), clue('q_c')],
        },
      ],
    },
    { id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' },
    {
      id: 'r3',
      name: 'Board game',
      mode: 'boardgame',
      slide: { background: { color: '#1d5e3a' }, elements: [] },
      spaces: ['Start', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Finish'].map((name, i, all) => ({
        id: `b${i}`,
        name,
        x: 150 + i * 200,
        y: 500,
        color: '#4363d8',
        next: i < all.length - 1 ? [`b${i + 1}`] : [],
      })),
      mover: { kind: 'dice', dice: 'dp1' },
      zones: [],
    },
    {
      id: 'r4',
      name: 'Final Jeopardy!',
      mode: 'final',
      category: 'Movies',
      questionSlide: slide('The final question'),
      answerSlide: slide('The final answer'),
      timerSeconds: 30,
      allowNonPositive: true,
    },
  ],
  media: [],
  audio: {},
  theme: {},
  dice: [{ id: 'dp1', name: 'Move die', dice: [{ id: 'd1', sides: 6, count: 1 }], showTotal: true }],
  statFields: [],
  items: [],
  wheels: [
    {
      id: 'w1',
      name: 'Bonus wheel',
      spinDurationMs: 1000,
      removeAfterLanding: false,
      segments: ['Red', 'Blue', 'Gold'].map((label, i) => ({ id: `s${i}`, label, color: ['#cc0000', '#0000cc', '#cccc00'][i], weight: 1 })),
    },
  ],
  tiebreaker: { questionSlide: slide('The tiebreaker question'), answerSlide: slide('The tiebreaker answer') },
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
});

/**
 * A fresh window on the game, started, the board up (one window).
 * @param {number} w @param {number} h @param {{ players?: number, scale?: number }} [o]
 */
async function startAt(w, h, o = {}) {
  const gameFile = resultsPath(`hostroom-${o.players ?? 4}.json`);
  writeFileSync(gameFile, JSON.stringify(gameWith(o.players ?? 4)));
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.scale ?? 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await hostPanelIn(page).waitFor();
  const skip = page.getByRole('button', { name: 'Skip intro' });
  if (await until(async () => (await skip.count()) > 0, { timeout: 3000 })) await skip.click();
  await stageBoxIn(page).locator('.tile[aria-label^="Memes for $200"]').waitFor();
  return { ctx, page };
}
/** @param {import('playwright-core').Page} page @param {string} name */
const tile = (page, name) => stageBoxIn(page).locator(`.tile[aria-label^="${name}"]`);
/** @param {import('playwright-core').Page} page */
const stageSize = async (page) => {
  const b = await stageBoxIn(page).boundingBox();
  return b ? `${Math.round(b.width)}×${Math.round(b.height)}` : 'none';
};
/** @param {import('playwright-core').Page} page */
const mainY = async (page) => Math.round((await mainButton(page).boundingBox())?.y ?? -1);
/** @param {import('playwright-core').Page} page */
const action = (page) => hostPanelIn(page).locator('[data-host-action]');

/**
 * Every chip whole in the chips' box, and its ✔ hit at its centre (who it is, for the message).
 * @param {import('playwright-core').Page} page
 */
const chipsWhole = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-host-players]');
    if (!box) return 'no chips';
    const b = box.getBoundingClientRect();
    const out = [];
    for (const row of document.querySelectorAll('[data-host-players] [data-player-row]')) {
      const r = row.getBoundingClientRect();
      const name = row.getAttribute('aria-label');
      if (r.top < b.top - 1 || r.bottom > b.bottom + 1)
        out.push(`${name} cut (${Math.round(r.top)}–${Math.round(r.bottom)} in ${Math.round(b.top)}–${Math.round(b.bottom)})`);
      const tick = [...row.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith('✔'));
      if (!tick) {
        out.push(`${name} has no ✔`);
        continue;
      }
      const t = tick.getBoundingClientRect();
      const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
      if (!hit || !tick.contains(hit)) out.push(`${name}'s ✔ under ${hit?.className || hit?.tagName}`);
    }
    return out.length ? out.join('; ') : '';
  });
/** The "▾ more" the flow row (or a partner clue's foot) says, '' for none. @param {import('playwright-core').Locator} foot */
const moreSaid = (foot) =>
  foot.evaluate((e) =>
    getComputedStyle(e, '::before')
      .content.replace(/^"|"$/g, '')
      .replace(/^none$/, ''),
  );
/** Scroll the action part (or the chips' box) to its end. @param {import('playwright-core').Locator} box */
const toEnd = (box) => box.evaluate((e) => (e.scrollTop = e.scrollHeight));

try {
  section('A tile with a box of its own keeps the chips whole, 1280×720');
  {
    const { ctx, page } = await startAt(1280, 720);
    const board = await stageSize(page);
    const flow = action(page).locator(':scope > [data-flowrow]');

    await tile(page, 'Memes for $200').click();
    await mainButton(page).waitFor();
    const plain = await mainY(page);
    assertEq(await chipsWhole(page), '', 'a plain clue: every chip whole, every ✔ hit');
    await hostPanelIn(page)
      .getByRole('button', { name: /Put back/ })
      .click();

    await tile(page, 'Skibidi Lore for $400').click();
    await hostPanelIn(page).locator('[data-tile-cards]').waitFor();
    await sleep(300);
    assertEq(await chipsWhole(page), '', 'a 🤫 cards tile: every chip whole, Dmitri’s ✔ hit (the cards’ box gives way)');
    assertEq(await mainY(page), plain, 'the blue button where it is on a plain clue');
    assertEq(await stageSize(page), board, 'the stage keeps its size');
    assert(
      (await action(page).getAttribute('data-more')) !== null && (await moreSaid(flow)) === '▾ more',
      `the cards’ box scrolls on under the flow row, which says “▾ more” (${await moreSaid(flow)})`,
    );
    await toEnd(action(page));
    assert(
      await until(async () => (await action(page).getAttribute('data-more')) === null && (await moreSaid(flow)) === ''),
      'scrolled to its end: no “▾ more”',
    );
    await hostPanelIn(page)
      .getByRole('button', { name: /Put back/ })
      .click();

    for (const [name, what, tool] of [
      ['Movies for $600', 'a dice tile', /Roll/],
      ['Memes for $600', 'a wheel tile', /Spin!/],
    ]) {
      await tile(page, String(name)).click();
      await mainButton(page).waitFor();
      await sleep(300);
      assertEq(await chipsWhole(page), '', `${what}, its tool up: every chip whole, every ✔ hit`);
      assertEq(await mainY(page), plain, `${what}: the blue button where it is on a plain clue`);
      await hostPanelIn(page).getByRole('button', { name: tool }).first().click();
      await sleep(2500);
      assertEq(await chipsWhole(page), '', `${what}, landed (its box at its tallest): every chip whole, every ✔ hit`);
      assertEq(await mainY(page), plain, `${what}, landed: the blue button in the same place`);
      assertEq(await stageSize(page), board, `${what}: the stage keeps its size`);
      if (what === 'a wheel tile') {
        await mainButton(page).click();
        assert(await until(async () => /Reveal answer/.test(await mainButton(page).innerText())), 'the wheel’s question up');
        assertEq(await mainY(page), plain, 'the wheel’s question: the blue button in the same place');
      } else {
        await page.keyboard.press('Shift+Escape');
        await until(async () => (await goOnCheck(page).count()) === 0 && (await tile(page, 'Memes for $600').count()) > 0, { what: 'back on the board' });
      }
    }
    await ctx.close();
  }

  section('A 🤫 cards tile at 1024×768');
  {
    const { ctx, page } = await startAt(1024, 768);
    await tile(page, 'Skibidi Lore for $400').click();
    await hostPanelIn(page).locator('[data-tile-cards]').waitFor();
    await sleep(300);
    assertEq(await chipsWhole(page), '', 'every chip whole, Dmitri’s ✔ hit');
    await ctx.close();
  }

  section('The blue button’s place: a board-game turn, the Final');
  {
    const { ctx, page } = await startAt(1280, 720);
    await tile(page, 'Memes for $200').click();
    await mainButton(page).waitFor();
    const plain = await mainY(page);
    await hostPanelIn(page)
      .getByRole('button', { name: /Put back/ })
      .click();
    /** @param {string} round */
    const goTo = async (round) => {
      const opts = await roundNavIn(page).locator('option').allInnerTexts();
      await roundNavIn(page)
        .locator('select')
        .selectOption({ label: opts.find((o) => o.includes(round)) });
      if (await until(async () => (await leaveAnswer(page).count()) > 0, { timeout: 2000 })) await answerAsk(leaveAnswer(page));
      const skip = page.getByRole('button', { name: 'Skip intro' });
      for (let i = 0; i < 3 && (await until(async () => (await skip.count()) > 0, { timeout: 1500 })); i++) await skip.click();
    };
    await goTo('Board game');
    await mainButton(page).waitFor();
    assertEq(await mainY(page), plain, 'a board-game turn: the blue button where it is on a clue');
    await stepButton(hostPanelIn(page)).first().click();
    const move = stepButton(hostPanelIn(page)).filter({ hasText: '▶ Move' });
    await move.waitFor();
    assertEq(await mainY(page), plain, 'rolled ("Landed on …" up): the blue button in the same place');
    await page.waitForFunction(() => !document.querySelector('.bh [data-step]')?.hasAttribute('disabled'));
    await move.click();
    await sleep(1500);
    assertEq(await mainY(page), plain, 'moved: the blue button in the same place');

    await goTo('Final');
    await statusLineIn(page, { hasText: 'taking wagers' }).waitFor();
    assertEq(await mainY(page), plain, 'the Final’s wagers: the blue button in the same place');
    for (const inp of await hostPanelIn(page).locator('input[data-wager]').all()) await inp.fill('0');
    await page.keyboard.press('Escape');
    for (const step of ['Question on screen', 'Answer on screen']) {
      await page.keyboard.press('n');
      await until(
        async () => {
          if (await statusLineIn(page).filter({ hasText: step }).count()) return true;
          const go = goOnCheck(page, { ready: true }).locator('[data-anyway]');
          if (await go.count()) await go.click();
          return false;
        },
        { what: `the Final's ${step}` },
      );
      await sleep(300);
      assertEq(await mainY(page), plain, `the Final, ${step}: the blue button in the same place`);
    }
    // The reveals fold the tools row away (⋯ Tools): the blue button goes down onto the fixed bar once, then keeps that
    // place through Show wager, each ✘, Next player and Finish game.
    await page.keyboard.press('n');
    await statusLineIn(page, { hasText: 'Player reveals' }).waitFor();
    await sleep(300);
    const reveals = await mainY(page);
    /** @type {string[]} */
    const moved = [];
    /** @type {string[]} */
    const seen = [];
    for (let i = 0; i < 12 && !seen.includes('Finish game ▶'); i++) {
      for (const key of ['x', 'n']) {
        if (key === 'n' && seen.at(-1) === 'Finish game ▶') break;
        await page.keyboard.press(key);
        await sleep(400);
        const label = await mainLabel(page);
        seen.push(label);
        const y = await mainY(page);
        if (y !== reveals) moved.push(`${label} at ${y}`);
      }
    }
    assert(
      seen.includes('Show wager ▶') && seen.includes('Next player ▶') && seen.includes('Finish game ▶') && moved.length === 0,
      `the Final's reveals: the blue button keeps one place (${reveals}; ${moved.join(', ') || 'none moved'}) through ${[...new Set(seen)].join(', ')}`,
    );
    await ctx.close();
  }

  section('A 🤝 partner clue’s hand-out on a laptop');
  for (const [w, h] of [
    [1280, 720],
    [1024, 768],
  ]) {
    const where = `${w}×${h}`;
    const { ctx, page } = await startAt(w, h);
    const box = hostPanelIn(page).locator('[data-partner-panel]');
    await tile(page, 'Movies for $200').click();
    await box
      .getByRole('button', { name: /Annabelle/ })
      .first()
      .click();
    await box.getByRole('button', { name: /Spin for a partner/ }).click();
    // Landed: Next ▶ puts the wheel away, then Show question ▶ (the cards to hand out).
    for (const step of [/^Next ▶/, /^Show question/]) {
      await until(async () => step.test(await mainButton(page).innerText()) && !(await mainButton(page).isDisabled()), { what: `the blue button: ${step}` });
      await sleep(600);
      await mainButton(page).click();
    }
    const next = box.locator('[data-partner-next]');
    await next.filter({ hasText: 'Copy' }).waitFor();
    const line = await next.evaluate((e) => ({ text: e.textContent, title: e.getAttribute('title'), cut: e.scrollWidth > e.clientWidth }));
    assert(
      line.text === 'Next: 📋 Copy, then ⏱️ Start' && line.title === 'Next: 📋 copy each card to its player, then ⏱️ Start the clock' && !line.cut,
      `${where}: the first line reads whole, the whole sentence in its tooltip (${JSON.stringify(line)})`,
    );
    const foot = box.locator('[data-partner-foot]');
    assert(
      (await action(page).getAttribute('data-more')) !== null && (await moreSaid(foot)) === '▾ more',
      `${where}: the card rows go on under the ✔ Got it row, which says “▾ more” (${await moreSaid(foot)})`,
    );
    await toEnd(action(page));
    assert(await until(async () => (await moreSaid(foot)) === ''), `${where}: scrolled to the box’s end, no “▾ more”`);
    await ctx.close();
  }

  section('An RPG round and a board game fold the Amount row, 1280×720');
  {
    const { ctx, page } = await startAt(1280, 720);
    // (Points left in the board's Amount box don't come along into the round: it starts folded.)
    await hostPanelIn(page).getByRole('button', { name: '± Adjust score' }).click();
    await awardRowIn(page).getByLabel('Amount').fill('100');
    const opts = await roundNavIn(page).locator('option').allInnerTexts();
    await roundNavIn(page)
      .locator('select')
      .selectOption({ label: opts.find((o) => o.includes('Adventure')) });
    if (await until(async () => (await leaveAnswer(page).count()) > 0, { timeout: 2000 })) await answerAsk(leaveAnswer(page));
    const skip = page.getByRole('button', { name: 'Skip intro' });
    for (let i = 0; i < 3 && (await until(async () => (await skip.count()) > 0, { timeout: 1500 })); i++) await skip.click();
    await hostPanelIn(page).locator('.rh .pad').waitFor();
    await sleep(400);
    const adjust = toolsRowIn(page).getByRole('button', { name: '± Adjust score' });
    /** The pad's buttons in sight at the box's top, the minimap's first row too, and where the pad is. */
    const pad = () =>
      page.evaluate(() => {
        const box = document.querySelector('[data-host-panel] .mode-host');
        if (!box) return { inSight: -1, of: -1, map: false, y: -1, top: -1 };
        const b = box.getBoundingClientRect();
        const btns = [...box.querySelectorAll('.pad button')];
        const cell = box.querySelector('.mapbox')?.getBoundingClientRect();
        return {
          inSight: btns.filter((x) => x.getBoundingClientRect().bottom <= b.bottom + 0.5).length,
          of: btns.length,
          map: !!cell && cell.top < b.bottom,
          y: Math.round(btns[0]?.getBoundingClientRect().top ?? -1),
          top: box.scrollTop,
        };
      });
    const before = await pad();
    assert(
      (await awardRowIn(page).count()) === 0 && (await adjust.count()) === 1,
      'the Amount row folded, its ± Adjust score in the tools row (no row of its own)',
    );
    assert(
      before.inSight === 9 && before.of === 9 && before.map && before.top === 0,
      `the pad’s 9 buttons and the minimap in sight (${JSON.stringify(before)})`,
    );

    // A player picked on the stage (to move them): the row stays folded, the pad where it was.
    await stageBoxIn(page).locator('.rpg .avatar[data-player-id="p2"]').click();
    await page.locator('.rh [data-rpg-sel]', { hasText: 'Selected: Bob' }).waitFor();
    const picked = await pad();
    assert(
      (await awardRowIn(page).count()) === 0 && picked.inSight === 9 && picked.y === before.y,
      `Bob picked on the stage: the row stays folded, the pad whole and where it was (${JSON.stringify(picked)})`,
    );
    // ✕ Close folds it back with a player picked too.
    await page.keyboard.press('1');
    await awardRowIn(page).waitFor();
    assert((await adjust.count()) === 0, 'Annabelle’s number opens the Amount row (± Adjust score goes)');
    await awardRowIn(page).getByRole('button', { name: '✕ Close' }).click();
    assert(await until(async () => (await awardRowIn(page).count()) === 0), '✕ Close folds it, players picked');
    await page.keyboard.press('Escape');
    await adjust.click();
    await awardRowIn(page).waitFor();
    assert(
      await until(async () => await page.evaluate(() => document.activeElement?.closest('[data-award-row]') !== null)),
      '± Adjust score opens it, the keys in the Amount box',
    );
    await awardRowIn(page).getByRole('button', { name: '✕ Close' }).click();
    assert(await until(async () => (await awardRowIn(page).count()) === 0), '✕ Close folds it, nobody picked');

    await roundNavIn(page)
      .getByRole('button', { name: /Next round/ })
      .click();
    if (await until(async () => (await leaveAnswer(page).count()) > 0, { timeout: 2000 })) await answerAsk(leaveAnswer(page));
    for (let i = 0; i < 3 && (await until(async () => (await skip.count()) > 0, { timeout: 1500 })); i++) await skip.click();
    await page.locator('.bh').waitFor();
    await sleep(300);
    assert((await awardRowIn(page).count()) === 0 && (await adjust.count()) === 1, 'a board game: the Amount row folded too, ± Adjust score in the tools row');
    await ctx.close();
  }

  section('A phone held upright: the fade alone, and the RPG selection line on a row of its own');
  {
    // (The top row is full there, the screen's name and the party buttons: who's picked reads whole on a line of its
    // own, as with an audience window. Wider, it's on the top row: see above.)
    const { ctx, page } = await startAt(390, 844);
    // (First a 🤫 cards tile: its rows going on under the flow row fade out there, with no "▾ more" tab, which would lie
    // over the wrapped row's ＋ Award.)
    await tile(page, 'Skibidi Lore for $400').click();
    await mainButton(page).waitFor();
    const flow = action(page).locator(':scope > [data-flowrow]');
    await toEnd(action(page)).then(() => action(page).evaluate((e) => (e.scrollTop = 0)));
    assert(
      await until(async () => (await action(page).getAttribute('data-more')) !== null),
      '390×844, a 🤫 cards tile: the action part goes on under the flow row',
    );
    const cue = await flow.evaluate((e) => ({ tab: getComputedStyle(e, '::before').content, fade: getComputedStyle(e, '::after').content }));
    assert(cue.tab === 'none' && cue.fade !== 'none', `390×844: the fade over the flow row, no "▾ more" tab (${JSON.stringify(cue)})`);
    await hostPanelIn(page)
      .getByRole('button', { name: /Put back/ })
      .click();
    const opts = await roundNavIn(page).locator('option').allInnerTexts();
    await roundNavIn(page)
      .locator('select')
      .selectOption({ label: opts.find((o) => o.includes('Adventure')) }, { force: true });
    if (await until(async () => (await leaveAnswer(page).count()) > 0, { timeout: 2000 })) await answerAsk(leaveAnswer(page));
    const skip = page.getByRole('button', { name: 'Skip intro' });
    for (let i = 0; i < 3 && (await until(async () => (await skip.count()) > 0, { timeout: 1500 })); i++) await skip.click();
    await hostPanelIn(page).locator('.rh .pad').waitFor();
    await stageBoxIn(page).locator('.rpg .avatar[data-player-id="p2"]').click();
    const sel = page.locator('.rh [data-rpg-sel]', { hasText: 'Selected: Bob' });
    await sel.waitFor();
    const line = await sel.evaluate((e) => ({ onTop: !!e.closest('.top'), width: Math.round(e.getBoundingClientRect().width) }));
    assert(!line.onTop && line.width >= 300, `390×844: the selection line is a row of its own, the box's width (${JSON.stringify(line)})`);
    await sel.getByRole('button', { name: 'Clear selection' }).waitFor();
    assertEq(await sel.getByRole('button', { name: 'Clear selection' }).innerText(), 'Clear selection', 'Clear selection in words there');
    await ctx.close();
  }

  section('A tablet held upright: the RPG selection line keeps room for who’s picked');
  {
    // (768 wide, the top row takes two lines anyway: the party buttons go on to the second, and the selection line keeps
    // room for the names and Clear selection in words, the pad as whole as before.)
    const { ctx, page } = await startAt(768, 1024);
    const opts = await roundNavIn(page).locator('option').allInnerTexts();
    await roundNavIn(page)
      .locator('select')
      .selectOption({ label: opts.find((o) => o.includes('Adventure')) }, { force: true });
    if (await until(async () => (await leaveAnswer(page).count()) > 0, { timeout: 2000 })) await answerAsk(leaveAnswer(page));
    const skip = page.getByRole('button', { name: 'Skip intro' });
    for (let i = 0; i < 3 && (await until(async () => (await skip.count()) > 0, { timeout: 1500 })); i++) await skip.click();
    await hostPanelIn(page).locator('.rh .pad').waitFor();
    await stageBoxIn(page).locator('.rpg .avatar[data-player-id="p2"]').click();
    await stageBoxIn(page)
      .locator('.rpg .avatar[data-player-id="p3"]')
      .click({ modifiers: ['Shift'] });
    const sel = page.locator('.rh [data-rpg-sel]', { hasText: 'Selected: Bob, Cat' });
    await sel.waitFor();
    await sleep(300);
    const line = await sel.evaluate((e) => {
      const box = /** @type {HTMLElement} */ (e.closest('.mode-host'));
      const b = box.getBoundingClientRect();
      const top = /** @type {HTMLElement} */ (e.closest('.top'));
      return {
        onTop: !!top,
        width: Math.round(e.getBoundingClientRect().width),
        lines: top ? Math.round(top.getBoundingClientRect().height / 30) : 0,
        pad: [...box.querySelectorAll('.pad button')].filter((x) => x.getBoundingClientRect().bottom <= b.bottom + 0.5).length,
      };
    });
    assert(
      line.onTop && line.width >= 200 && line.lines <= 2 && line.pad === 9,
      `768×1024: the selection line on the top row with room for who’s picked, the row two lines at most, the pad whole (${JSON.stringify(line)})`,
    );
    assertEq(await sel.getByRole('button', { name: 'Clear selection' }).innerText(), 'Clear selection', '768×1024: Clear selection in words');
    await ctx.close();
  }

  section('A laptop at 200% zoom: the chips say there are more');
  {
    const { ctx, page } = await startAt(640, 360, { players: 3, scale: 2 });
    await tile(page, 'Memes for $200').click();
    await mainButton(page).waitFor();
    const chips = hostPanelIn(page).locator('[data-host-players]');
    const shown = await chips.evaluate((e) => ({
      client: e.clientHeight,
      full: e.scrollHeight,
      more: e.hasAttribute('data-more'),
      mask: getComputedStyle(e).maskImage,
    }));
    assert(
      shown.full > shown.client && shown.more && shown.mask !== 'none',
      `one chip in sight of three: the box says there are more, its foot faded (${JSON.stringify(shown)})`,
    );
    assertEq(await playerRowsIn(chips).count(), 3, 'three chips in it');
    await toEnd(chips);
    assert(await until(async () => !(await chips.evaluate((e) => e.hasAttribute('data-more')))), 'scrolled to its end: no more to say, the last chip whole');
    await ctx.close();
  }

  section('A phone on its side: a wheel or dice tile keeps its room, the chips give way');
  {
    // (Under 500px tall the chips give way first, as on any clue: the tool's box keeps the room over the flow row it
    // had (its first line peeks out above it, the rest scrolls), and the chips' box says there are more.)
    const { ctx, page } = await startAt(844, 390);
    for (const [name, label] of [
      ['Memes for $600', 'Spin!'],
      ['Movies for $600', 'Roll!'],
    ]) {
      await tile(page, name).click();
      await action(page)
        .getByRole('button', { name: new RegExp(label) })
        .waitFor();
      await sleep(300);
      const above = await action(page).evaluate((box) => {
        const flow = box.querySelector(':scope > [data-flowrow]')?.getBoundingClientRect();
        const tool = box.querySelector(':scope > .tools')?.getBoundingClientRect();
        return flow && tool ? Math.round(flow.top - Math.max(box.getBoundingClientRect().top, tool.top)) : -1;
      });
      assert(above >= 10, `844×390, ${name}: the tool's box shows above the flow row, not all under it (${above}px)`);
      assert(
        await hostPanelIn(page)
          .locator('[data-host-players]')
          .evaluate((e) => e.hasAttribute('data-more')),
        `844×390, ${name}: the chips' box says there are more below`,
      );
      await hostPanelIn(page)
        .getByRole('button', { name: /Put back/ })
        .click();
      await sleep(300);
    }
    await ctx.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Host room e2e passed');
} catch (e) {
  await failureShots('hostroom', browser);
  throw e;
} finally {
  await browser.close();
}
