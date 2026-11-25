// @ts-check
// The host's screens on a narrow window (a phone, 320 to 390px wide) and after a resize, in the built app:
// 1. the pre-game Start bar fits 320px, with touch and with a mouse: "◀ Back" (still named "◀ Back to editor") and
//    Start game ▶ without its Ctrl+⏎, nothing past the window's edge;
// 2. on a clue with a player picked, at 320 and 360px, in one window and with an audience window, each player's chip
//    stays inside the panel (its mark and ✔ / ✘ fold under the name and score together where it's too wide): every
//    button in it in sight and hit at its centre, the chips' box never scrolling sideways, and a chip one width before
//    and after ✔ (a long name, Bartholomew, too);
// 3. the round nav's last button ("Final Jeopardy! ▶") at 320px stays inside the panel, its ▶ whole (the round picker
//    gets narrower), nothing scrolling sideways, in both window modes;
// 4. a tap's note on a wrapped status line (390px, the Final's wagers not typed) covers the line's first line only:
//    ⏱️ Start and the seconds box under it are still hit at their centres;
// 5. the check before going on (the Final's clock running), opened at 1280×720 then the window made 1920×1080, in one
//    window and with an audience window: its lines keep their room and its buttons in sight (scrolled to), nothing past the window's
//    edge, and the blue button's spot follows the blue button.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  appFile,
  assert,
  assertEq,
  failureShots,
  goOnCheck,
  hostPanelIn,
  launchChromium,
  leaveAnswer,
  openGameFile,
  playerRowsIn,
  roundNavIn,
  section,
  sleep,
  statusLineIn,
  boardIn,
  boardTilesIn,
  stageBoxIn,
} from './helpers.mjs';

const file = appFile();
const browser = await launchChromium();
/** @type {string[]} */
const errors = [];

/** @param {string} id @param {string} t */
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
/** @param {string} id @param {string} t */
const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
let n = 0;
/** @param {string} q @param {string} a */
const clue = (q, a) => ({ id: `c${++n}`, value: null, type: 'standard', questionSlide: slide(`q${n}`, q), answerSlide: slide(`a${n}`, a) });
const cats = ['Memes', 'Lore', 'Minecraft', 'Rizz', 'Speedruns'];
const spaces = ['Start', 'Two', 'Three', 'Finish'].map((name, i, all) => ({
  id: `b${i}`,
  name,
  x: 200 + i * 450,
  y: 400,
  color: '#4363d8',
  next: i === all.length - 1 ? [] : [`b${i + 1}`],
}));
const game = {
  id: 'g_host_narrow',
  version: 2,
  title: 'Narrow host',
  settings: {
    allowNegativeScores: true,
    deductOnWrong: true,
    defaultTimerSeconds: 15,
    finalTimerSeconds: 30,
    currencySymbol: '$',
    rollOffDie: 20,
    pickerFollowsAward: true,
    timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' },
    maxPlayers: 8,
  },
  players: [
    { id: 'p1', name: 'Ann', color: '#e6194b' },
    { id: 'p2', name: 'Bartholomew', color: '#3cb44b' },
    { id: 'p3', name: 'Cy', color: '#4363d8' },
  ],
  rounds: [
    {
      id: 'r_board',
      name: 'Jeopardy!',
      mode: 'board',
      values: [200, 400, 600, 800, 1000],
      dailyDoubleCount: 0,
      categories: cats.map((c, ci) => ({ id: `cat${ci}`, title: c, clues: [0, 1, 2, 3, 4].map((ri) => clue(`${c} ${ri}`, `Answer ${ci}.${ri}`)) })),
    },
    {
      id: 'r_bg',
      name: 'Board game',
      mode: 'boardgame',
      slide: { background: { color: '#1d5e3a' }, elements: [] },
      spaces,
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
  statFields: [],
  items: [],
  worlds: [],
  dice: [{ id: 'dp1', name: 'Move die', dice: [{ id: 'd1', sides: 6, count: 1 }], showTotal: true }],
};
mkdirSync(resolve('test-results'), { recursive: true });
const gamePath = resolve('test-results/hostnarrow.json');
writeFileSync(gamePath, JSON.stringify(game));

/**
 * A new page on the game's pre-game screen.
 * @param {{ width: number, height: number }} viewport
 * @param {{ touch?: boolean, dual?: boolean }} [opts]
 */
async function pregame(viewport, { touch = false, dual = false } = {}) {
  const ctx = await browser.newContext({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gamePath);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  if (dual) await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  return { ctx, page };
}
/** @param {import('playwright-core').Page} page */
async function start(page) {
  // (Pressed by a script: on a narrow window before the fix it lay part past the edge.)
  await page.getByRole('button', { name: 'Start game ▶' }).evaluate((e) => /** @type {HTMLElement} */ (e).click());
  await hostPanelIn(page).waitFor();
  await sleep(500);
}
/** To the next round, by the round nav's ▶ and the leave question. @param {import('playwright-core').Page} page */
async function nextRound(page) {
  await roundNavIn(page)
    .locator('button', { hasText: '▶' })
    .last()
    .evaluate((e) => /** @type {HTMLElement} */ (e).click());
  await leaveAnswer(page).waitFor();
  await sleep(450);
  await leaveAnswer(page).evaluate((e) => /** @type {HTMLElement} */ (e).click());
  await leaveAnswer(page).waitFor({ state: 'detached' });
  await sleep(600);
}

try {
  section('The pre-game Start bar at 320px');
  for (const touch of [true, false]) {
    const how = touch ? 'with touch' : 'with a mouse';
    const { ctx, page } = await pregame({ width: 320, height: 844 }, { touch });
    await sleep(300);
    const bar = await page.evaluate(() => {
      const startB = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Start game ▶'));
      return {
        sideways: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        right: Math.round(startB?.getBoundingClientRect().right ?? 1e9),
        vw: innerWidth,
      };
    });
    assert(
      bar.sideways <= 0 && bar.right <= bar.vw - 16,
      `320px ${how}: the Start bar fits the window, Start game ▶ inside its padding, nothing scrolls sideways (${JSON.stringify(bar)})`,
    );
    assertEq(await page.getByRole('button', { name: '◀ Back to editor', exact: true }).count(), 1, `320px ${how}: ◀ Back is still named “◀ Back to editor”`);
    await ctx.close();
  }

  section('A clue’s player chips at 320 and 360px');
  for (const [width, height, dual] of /** @type {const} */ ([
    [320, 844, false],
    [320, 568, false],
    [360, 844, false],
    [320, 844, true],
    [360, 844, true],
  ])) {
    const where = `${width}×${height} ${dual ? 'with an audience window' : 'in one window'}`;
    const { ctx, page } = await pregame({ width, height }, { touch: true, dual });
    await start(page);
    const stageAt = async () => JSON.stringify(await stageBoxIn(page).boundingBox());
    const onBoard = await stageAt();
    await boardTilesIn(boardIn(stageBoxIn(page)))
      .first()
      .evaluate((e) => /** @type {HTMLElement} */ (e).click());
    await sleep(500);
    const inClue = await stageAt();
    await page.keyboard.press('2');
    await playerRowsIn(page).nth(1).locator('button[aria-label^="Right"]').waitFor();
    await sleep(300);
    const picked = await stageAt();
    if (!dual)
      assert(
        onBoard === inClue && inClue === picked,
        `${where}: the stage keeps its size from the board to a clue to a player picked (${onBoard} → ${inClue} → ${picked})`,
      );
    // Each chip scrolled into the chips' box in turn (under the stage it shows one row at least): every button in it in
    // sight, hit at its centre, inside the window; the box never scrolls sideways; the blue button in sight.
    const chips = () =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-player-row]')];
        const box = /** @type {HTMLElement} */ (rows[0].parentElement);
        /** @param {Element} b */
        const hits = (b) => {
          const r = b.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.left >= 0 && r.right <= innerWidth && !!hit && (hit === b || b.contains(hit));
        };
        const bad = [];
        for (const row of rows) {
          row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          for (const b of row.querySelectorAll('button')) {
            const r = b.getBoundingClientRect();
            if (!r.width || b.closest('[inert]')) continue;
            if (!hits(b))
              bad.push(
                `${row.getAttribute('aria-label')}: “${b.textContent?.trim()}” at ${Math.round(r.left)}–${Math.round(r.right)}, ${Math.round(r.top)}–${Math.round(r.bottom)}`,
              );
          }
        }
        box.scrollTop = 0;
        const next = document.querySelector('[data-next]');
        return {
          bad,
          scroll: box.scrollWidth - box.clientWidth,
          next: !!next && hits(next),
          widths: rows.map((r) => Math.round(r.getBoundingClientRect().width)),
        };
      });
    const before = await chips();
    assert(
      before.bad.length === 0 && before.scroll <= 0 && before.next,
      `${where}: every button in the chips is in sight and hit at its centre, the chips never scroll sideways, the blue button in sight (${JSON.stringify(before)})`,
    );
    await playerRowsIn(page)
      .nth(1)
      .locator('button[aria-label^="Right"]')
      .evaluate((e) => /** @type {HTMLElement} */ (e).click());
    await playerRowsIn(page).nth(1).locator('.mark.right').waitFor();
    await sleep(300);
    const after = await chips();
    assert(
      JSON.stringify(after.widths) === JSON.stringify(before.widths) && after.bad.length === 0 && after.scroll <= 0,
      `${where}: after ✔ the chips keep their widths, all in sight (${JSON.stringify(before.widths)} → ${JSON.stringify(after)})`,
    );
    if (!dual) assert((await stageAt()) === onBoard, `${where}: after ✔ the stage still keeps its size`);
    await ctx.close();
  }

  section('The round nav at 320px');
  for (const dual of [false, true]) {
    const where = dual ? 'with an audience window' : 'in one window';
    const { ctx, page } = await pregame({ width: 320, height: 568 }, { touch: true, dual });
    await start(page);
    await nextRound(page);
    await roundNavIn(page).locator('button', { hasText: 'Final Jeopardy!' }).waitFor();
    const nav = await page.evaluate(() => {
      const panel = /** @type {HTMLElement} */ (document.querySelector('[data-host-panel]'));
      const cs = getComputedStyle(panel);
      const edge = panel.getBoundingClientRect().right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0);
      const last = [...(document.querySelector('[data-round-nav]')?.querySelectorAll('button') ?? [])].at(-1);
      const r = last?.getBoundingClientRect();
      return {
        text: last?.textContent?.trim(),
        right: Math.round(r?.right ?? 1e9),
        edge: Math.round(edge),
        panel: panel.scrollWidth - panel.clientWidth,
        sideways: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      };
    });
    assert(
      nav.right <= nav.edge + 0.5 && nav.panel <= 0 && nav.sideways <= 0,
      `320px ${where}: the round nav's “${nav.text}” ends inside the panel, nothing scrolls sideways (${JSON.stringify(nav)})`,
    );
    await ctx.close();
  }

  section('A tap’s note on a wrapped status line, 390px');
  {
    const { ctx, page } = await pregame({ width: 390, height: 844 }, { touch: true });
    await start(page);
    await nextRound(page);
    await nextRound(page);
    await page.keyboard.press('n');
    await sleep(600);
    await page.keyboard.press('n');
    const note = statusLineIn(page).locator('[data-click-note]');
    await note.waitFor();
    await sleep(200);
    const seen = await page.evaluate(() => {
      const st = /** @type {HTMLElement} */ (document.querySelector('[data-host-status]'));
      const startB = [...st.querySelectorAll('button')].find((b) => /Start/.test(b.textContent ?? ''));
      const box = st.querySelector('input:not([disabled])');
      /** @param {Element | null | undefined} e */
      const hit = (e) => {
        if (!e) return 'missing';
        const r = e.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return t === e || e.contains(t) ? 'hit' : `covered by ${t?.closest('[data-click-note]') ? 'the note' : t?.tagName}`;
      };
      const noteR = st.querySelector('[data-click-note]')?.getBoundingClientRect();
      return {
        lines: Math.round(st.getBoundingClientRect().height),
        note: Math.round(noteR?.height ?? 0),
        start: hit(startB),
        seconds: hit(box),
      };
    });
    assert(seen.lines > 40, `390px: the status line wraps here, on the Final's wagers (${seen.lines}px tall)`);
    assert(
      seen.start === 'hit' && seen.seconds === 'hit' && seen.note > 0 && seen.note < seen.lines,
      `390px: the note covers the status line's first line only, ⏱️ Start and the seconds box still hit (${JSON.stringify(seen)})`,
    );
    await ctx.close();
  }

  section('The check before going on, the window made bigger');
  for (const dual of [false, true]) {
    const where = dual ? 'with an audience window' : 'in one window';
    const { ctx, page } = await pregame({ width: 1280, height: 720 }, { dual });
    await start(page);
    await nextRound(page);
    await nextRound(page);
    for (const box of await hostPanelIn(page).locator('input[data-wager]').all()) await box.fill('100');
    await page.keyboard.press('Escape');
    await page.keyboard.press('n');
    await sleep(800);
    await page.keyboard.press('n');
    await goOnCheck(page).waitFor();
    await sleep(500);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(600);
    const probe = await goOnCheck(page).evaluate((card) => {
      const cr = card.getBoundingClientRect();
      const scroll = /** @type {HTMLElement} */ (card.querySelector('.scroll'));
      const sr = scroll.getBoundingClientRect();
      const spot = card.querySelector('.spot')?.getBoundingClientRect();
      const next = document.querySelector('[data-next]')?.getBoundingClientRect();
      const hidden = [...scroll.querySelectorAll('[data-quick]')]
        .filter((b) => {
          // (Its lines scroll where the panel is short: each scrolled to first.)
          b.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const r = b.getBoundingClientRect();
          const box = scroll.getBoundingClientRect();
          return !(r.width > 0 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5);
        })
        .map((b) => b.textContent?.trim());
      return {
        sideways: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        scrollOut: Math.round(sr.right - cr.right),
        pad: parseFloat(getComputedStyle(card).getPropertyValue('--pad-right')) || 0,
        card: Math.round(cr.width),
        // (Over it: its edges within 4px of the button's, or out past them. At the card's edge it can't reach past.)
        spotOnNext:
          !!spot && !!next && spot.left <= next.left + 4 && spot.right >= next.right - 4 && spot.top <= next.top + 4 && spot.bottom >= next.bottom - 4,
        spot: spot && [spot.left, spot.right, spot.top, spot.bottom].map(Math.round),
        next: next && [next.left, next.right, next.top, next.bottom].map(Math.round),
        hidden,
      };
    });
    assert(
      probe.sideways <= 0 && probe.scrollOut <= 0 && probe.pad < probe.card / 4 && probe.spotOnNext && probe.hidden.length === 0,
      `1280×720 → 1920×1080 ${where}: the check's lines keep their room, its buttons in sight (scrolled to), nothing past the window's edge, its spot on the blue button (${JSON.stringify(probe)})`,
    );
    await ctx.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Host narrow e2e passed');
} catch (e) {
  await failureShots('hostnarrow', browser);
  throw e;
} finally {
  await browser.close();
}
