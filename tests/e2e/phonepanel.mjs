// @ts-check
// A phone held upright, hosting the sample game in one window (320×568, 360×640, 390×667, 360×740 and 390×844, a touch
// screen): the stage is the screen's width, 16:9, one size and place all game, and the host panel under it takes the
// rest of the screen (no black above and under the stage), its fixed bar (↶ Undo … 🚪 Exit) on screen. Each moment's
// own box has room: at least 60px (or all of it, when it's shorter), on a slide, a board round's title card and its
// categories coming up, a clue, a clue with a player picked, a Daily Double's wager, after a 🎲 roll from the tools
// row, the RPG and board-game rounds, the Final's title card, wagers and reveals, and the end's tie. The buttons a
// phone needs are in sight and take a real tap: Skip intro (a board round's title card and categories, the Final's
// title card), ↩ Put back on a clue and a Daily Double, the roll's own button, 🎲 Roll then ▶ Move in a board game,
// Finish now… and its Finish. Up to 700px tall the tools row (with the round's ◀ / ▶) folds behind ⋯ Tools, out again
// with a tap, and the status line's how-to keeps to one line (whole in its tooltip, at every moment); with the row
// kept out (📊 Scoreboard on, at 320×568) the moment's box still has room and the panel scrolls. A phone on its side, a
// tablet, a laptop (1280×720, 1920×1080) and a phone with an audience window keep the panel's height as it was, and so
// does a window held upright that's too short for the stage and more (320×454, 360×380, 600×600): its panel ends at the
// window's foot, the fixed bar in reach.
import { pathToFileURL } from 'node:url';
import {
  appFile,
  assert,
  boardIn,
  boardTilesIn,
  confirmStrip,
  failureShots,
  flowButton,
  goOnCheck,
  hostPanelIn,
  launchChromium,
  leaveAnswer,
  roundNavIn,
  section,
  sleep,
  stageBoxIn,
  statusLineIn,
  stepButton,
  toolsRowIn,
  until,
} from './helpers.mjs';

const url = pathToFileURL(appFile()).href;
const browser = await launchChromium();
/** @type {string[]} */
const errors = [];

/** @typedef {import('playwright-core').Page} Page */
/** @typedef {import('playwright-core').Locator} Locator */

/**
 * The sample game, started in one window in a fresh `opts` context (Start game ▶ tapped on a touch screen).
 * @param {import('playwright-core').BrowserContextOptions} opts
 * @param {boolean} [dual] with an audience window
 */
async function sample(opts, dual = false) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: /Try a sample game/ }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  if (dual) await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  const start = page.getByRole('button', { name: 'Start game ▶' });
  await (opts.hasTouch ? start.tap() : start.click());
  await hostPanelIn(page).waitFor();
  await sleep(500);
  return { ctx, page };
}

/**
 * The layout now: the stage's rect, the panel's, its fixed bar's foot, and each of the moment's boxes in the panel
 * (the action part, a round's or a tool's .mode-host) with its height and its content's.
 * @param {Page} page
 */
const layout = (page) =>
  page.evaluate(async () => {
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const panel = /** @type {HTMLElement} */ (document.querySelector('[data-host-panel]'));
    const r = (/** @type {Element} */ e) => {
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const boxes = [...panel.querySelectorAll(':scope > .act > .action, .mode-host')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none')
      .map((e) => ({
        what: [...e.classList].filter((c) => !c.startsWith('svelte-')).join('.'),
        h: e.clientHeight,
        need: e.scrollHeight,
      }));
    const stage = /** @type {Element} */ (document.querySelector('[data-stage-box] .stage'));
    const fixed = /** @type {Element} */ (panel.querySelector(':scope > .fixed'));
    // The status line's how-to, wherever it's cut short (…): its tooltip has it whole.
    const untitled = [...panel.querySelectorAll(':scope > .status > :is(.hint, .how, .muted:has(> .hint))')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 && !(e.getAttribute('title') ?? '').trim())
      .map((e) => (e.textContent ?? '').trim());
    return {
      untitled,
      stage: r(stage),
      panel: r(panel),
      fixedFoot: Math.round(fixed.getBoundingClientRect().bottom),
      boxes,
      iw: innerWidth,
      ih: innerHeight,
      sideways: document.documentElement.scrollWidth - innerWidth,
    };
  });

/**
 * At this moment, every box of the moment's has room (60px, or all it needs if that's less), the fixed bar is on
 * screen, nothing scrolls sideways, and the stage is the one it was (the screen's width, 16:9).
 * @param {Page} page
 * @param {string} where
 * @param {string} moment
 * @param {{ x: number, y: number, w: number, h: number } | null} stage0
 * @param {boolean} [scrolls] the panel may scroll (the tools row kept out on a small phone): the fixed bar below
 */
async function roomy(page, where, moment, stage0, scrolls = false) {
  const l = await layout(page);
  const tight = l.boxes.filter((b) => b.need > 0 && b.h < Math.min(60, b.need) - 1);
  assert(tight.length === 0, `${where}, ${moment}: each box has room (${l.boxes.map((b) => `${b.what} ${b.h} of ${b.need}`).join(', ') || 'none'})`);
  assert(l.untitled.length === 0, `${where}, ${moment}: the status line's how-to, cut short, is whole in its tooltip (${l.untitled.join(' | ')})`);
  if (scrolls) assert(l.sideways <= 0, `${where}, ${moment}: nothing scrolls sideways`);
  else
    assert(
      l.fixedFoot <= l.ih + 1 && l.sideways <= 0,
      `${where}, ${moment}: the fixed bar is on screen (its foot at ${l.fixedFoot} of ${l.ih}), nothing sideways`,
    );
  if (stage0)
    assert(JSON.stringify(l.stage) === JSON.stringify(stage0), `${where}, ${moment}: the stage keeps its size and place (${JSON.stringify(l.stage)})`);
  return l;
}

/**
 * The button is in sight where a finger would tap it (what's at its middle is it), then takes a real tap (unless `tap`
 * is false).
 * @param {Locator} b
 * @param {string} what
 */
async function tapIt(b, what, tap = true) {
  await b.waitFor();
  await b.scrollIntoViewIfNeeded();
  const hit = await b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { ok: !!at && el.contains(at), at: at ? `${at.tagName.toLowerCase()}.${[...at.classList].join('.')}` : 'nothing', h: Math.round(r.height) };
  });
  assert(hit.ok, `${what} is in sight, where a tap reaches it (${hit.ok ? `${hit.h}px tall` : `${hit.at} is there`})`);
  if (tap) await b.tap();
}

/**
 * The tools row out, if it's folded behind ⋯ Tools (a small phone).
 * @param {Page} page
 */
async function toolsOut(page) {
  const fold = hostPanelIn(page).getByRole('button', { name: '⋯ Tools' });
  if ((await fold.isVisible()) && (await fold.getAttribute('aria-expanded')) !== 'true') {
    await fold.tap();
    await toolsRowIn(page).waitFor();
  }
}

/**
 * On to the next round by the round's ▶ (the tools row out first), its question answered with a tap.
 * @param {Page} page
 */
async function nextRound(page) {
  await toolsOut(page);
  await roundNavIn(page).locator('button', { hasText: '▶' }).last().tap();
  await leaveAnswer(page).waitFor();
  await sleep(450);
  await leaveAnswer(page).tap();
  await confirmStrip(page).waitFor({ state: 'detached' });
  await sleep(600);
}

/**
 * @param {Page} page
 * @param {string | RegExp} text
 */
const statusSays = (page, text) => statusLineIn(page).filter({ hasText: text }).waitFor();

try {
  for (const [w, h] of [
    [320, 568],
    [360, 640],
    [390, 667],
    [360, 740],
    [390, 844],
  ]) {
    const where = `${w}×${h}, one window`;
    section(`A phone upright, ${where}`);
    const { ctx, page } = await sample({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const tiny = h <= 700;

    // The slides: the stage the screen's width, 16:9, right at the top; the panel the rest of the screen.
    const first = await roomy(page, where, 'a slide', null);
    const stage0 = first.stage;
    assert(
      stage0.x === 0 && stage0.y <= 1 && stage0.w === w && Math.abs(stage0.h - (w * 9) / 16) <= 1,
      `${where}: the stage is the screen's width, 16:9, at the top (${JSON.stringify(stage0)})`,
    );
    assert(
      first.panel.y - (stage0.y + stage0.h) <= 2 && first.panel.y + first.panel.h >= h - 1,
      `${where}: the panel takes the rest of the screen, right under the stage (${JSON.stringify(first.panel)})`,
    );
    const fold = hostPanelIn(page).getByRole('button', { name: '⋯ Tools' });
    if (tiny) {
      assert((await fold.count()) === 1 && !(await toolsRowIn(page).isVisible()), `${where}: the tools row is folded behind ⋯ Tools`);
      const lines = await statusLineIn(page).evaluate((s) => {
        const hint = /** @type {HTMLElement} */ (s.querySelector(':scope > .hint'));
        return {
          lines: Math.round(hint.getBoundingClientRect().height / (1.25 * parseFloat(getComputedStyle(hint).fontSize))),
          cut: hint.scrollWidth > hint.clientWidth,
          title: hint.title,
        };
      });
      assert(
        lines.lines === 1 && lines.cut && lines.title.length > 20,
        `${where}: the status line's how-to is one line, cut short, whole in its tooltip (${JSON.stringify(lines)})`,
      );
      await fold.tap();
      assert(await until(() => toolsRowIn(page).isVisible(), 3000), `${where}: ⋯ Tools takes a tap and brings the tools row out`);
      await fold.tap();
      assert(await until(async () => !(await toolsRowIn(page).isVisible()), 3000), `${where}: and folds it away again`);
    } else assert((await fold.count()) === 0 && (await toolsRowIn(page).isVisible()), `${where}: the tools row is out, no ⋯ Tools`);

    // The board round: its title card, then its categories coming up, Skip intro in sight and tapped.
    await nextRound(page);
    await statusSays(page, 'Round intro');
    await roomy(page, where, "the board's title card", stage0);
    const skip = page.getByRole('button', { name: 'Skip intro' });
    await tapIt(skip, `${where}: Skip intro, on the board's title card,`, false);
    await stageBoxIn(page).tap();
    await statusSays(page, 'Revealing the categories');
    await roomy(page, where, 'the categories coming up', stage0);
    await tapIt(skip, `${where}: Skip intro, while the categories come up,`);
    await statusSays(page, 'Pick a tile');

    // A clue, then a player picked (its flow row: ↩ Put back, ＋ Award, − Deduct), put back.
    const tiles = boardTilesIn(boardIn(stageBoxIn(page)));
    await tiles.nth(0).tap();
    await statusSays(page, 'Answer hidden');
    await roomy(page, where, 'a clue', stage0);
    await page.keyboard.press('1');
    await sleep(300);
    await roomy(page, where, 'a clue with a player picked', stage0);
    await tapIt(flowButton(page, 'putback'), `${where}: ↩ Put back`);
    await statusSays(page, 'Pick a tile');

    // The Daily Double's wager box, put back.
    await tiles.nth(11).tap();
    await statusSays(page, 'Daily Double');
    await sleep(500);
    await roomy(page, where, "a Daily Double's wager", stage0);
    await tapIt(flowButton(page, 'putback'), `${where}: the Daily Double's ↩ Put back`);
    await statusSays(page, 'Pick a tile');

    // 🎲 Dice from the tools row, rolled: its box under the stage, its buttons in sight.
    await toolsOut(page);
    await toolsRowIn(page)
      .getByRole('button', { name: /🎲 Dice/ })
      .first()
      .tap();
    const dice = page.getByRole('dialog', { name: 'Dice' });
    await dice.getByRole('button').first().tap();
    await hostPanelIn(page).locator('.mode-host.tools').waitFor();
    await sleep(2000);
    await roomy(page, where, 'after a 🎲 roll', stage0);
    await tapIt(hostPanelIn(page).locator('.mode-host.tools').getByRole('button').first(), `${where}: the roll's first button`);
    await sleep(300);

    // The RPG round.
    await nextRound(page);
    if (await skip.count()) await tapIt(skip, `${where}: the RPG round's Skip intro`);
    await hostPanelIn(page).locator('.mode-host').first().waitFor();
    await sleep(400);
    await roomy(page, where, 'the RPG round', stage0);

    // The board game: 🎲 Roll, then ▶ Move, tapped.
    await nextRound(page);
    if (await skip.count()) await tapIt(skip, `${where}: the board game's Skip intro`);
    await page.locator('.bh').waitFor();
    await sleep(400);
    await roomy(page, where, 'the board game', stage0);
    await tapIt(stepButton(page).first(), `${where}: 🎲 Roll`);
    const move = stepButton(page).filter({ hasText: '▶ Move' });
    await move.waitFor({ timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('.bh [data-step]')?.hasAttribute('disabled'));
    await roomy(page, where, 'the board game, rolled', stage0);
    await tapIt(move, `${where}: ▶ Move`);
    assert(await until(async () => (await move.count()) === 0, 10000), `${where}: ▶ Move took the tap: the token moved`);

    // The Final's title card: Skip intro in sight and tapped.
    await nextRound(page);
    await statusSays(page, 'Title card');
    await roomy(page, where, "the Final's title card", stage0);
    await tapIt(skip, `${where}: the Final's Skip intro`);
    await statusSays(page, 'taking wagers');

    // The wagers (0 each), the question, the answer, then the reveals, finished with nobody judged: the end, everyone
    // on the same score, the tie box.
    await roomy(page, where, "the Final's wagers", stage0);
    for (const inp of await hostPanelIn(page).locator('input[data-wager]').all()) await inp.fill('0');
    await page.keyboard.press('Escape');
    for (const step of ['Question on screen', 'Answer on screen', /reveals/]) {
      await page.keyboard.press('n');
      // (The check before going on, if it asks: the clock still running or run out. Gone on anyway.)
      await until(async () => {
        if (await statusLineIn(page).filter({ hasText: step }).count()) return true;
        const go = goOnCheck(page, { ready: true }).locator('[data-quick], [data-anyway]');
        if (await go.count()) await go.last().click();
        return false;
      }, `the Final's ${step}`);
      await sleep(500);
    }
    await roomy(page, where, "the Final's reveals", stage0);
    await tapIt(hostPanelIn(page).getByRole('button', { name: 'Finish now…' }), `${where}: the Final's Finish now…`);
    await sleep(450);
    await tapIt(confirmStrip(page).getByRole('button', { name: 'Finish', exact: true }), `${where}: its Finish`);
    await statusSays(page, 'Game over');
    await sleep(400);
    await roomy(page, where, "the end's tie", stage0);
    await ctx.close();
  }

  // The tools row kept out on a small phone (📊 Scoreboard on: no ⋯ Tools to fold it): each moment's box still has
  // room, the panel scrolling if it must.
  section('A small phone, 320×568, with 📊 Scoreboard on');
  {
    const where = '320×568 with 📊 Scoreboard on';
    const { ctx, page } = await sample({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    const stage0 = (await layout(page)).stage;
    await toolsOut(page);
    await toolsRowIn(page).getByRole('button', { name: /📊/ }).tap();
    await toolsRowIn(page).locator('[aria-pressed="true"]').filter({ hasText: '📊' }).waitFor();
    await sleep(400);
    assert(!(await hostPanelIn(page).getByRole('button', { name: '⋯ Tools' }).isVisible()), `${where}: the tools row stays out, no ⋯ Tools`);
    await roomy(page, where, 'a slide', stage0, true);
    await nextRound(page);
    await statusSays(page, 'Round intro');
    await roomy(page, where, "the board's title card", stage0, true);
    const skip = page.getByRole('button', { name: 'Skip intro' });
    await tapIt(skip, `${where}: Skip intro`);
    await ctx.close();
  }

  // A window held upright but too short for the whole stage and the panel (a small phone with its browser's bars
  // showing, a small square window): the stage gives way as before, and the panel ends at the window's foot, its fixed
  // bar in reach (never pushed out of the window, where no scrolling reaches it).
  section('Upright but short: the panel inside the window');
  for (const [w, h, touch] of /** @type {[number, number, boolean][]} */ ([
    [320, 454, true],
    [360, 380, true],
    [600, 600, false],
  ])) {
    const where = `${w}×${h}`;
    const { ctx, page } = await sample({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
    const l = await layout(page);
    const was = Math.min(Math.max(280, Math.min(0.44 * h, 440)), 0.62 * h);
    assert(
      l.panel.y + l.panel.h <= h + 1 && Math.abs(l.panel.h - was) <= 1 && l.stage.y + l.stage.h <= l.panel.y + 1,
      `${where}: the panel is ${Math.round(was)}px tall as before, under the stage and inside the window (${JSON.stringify({ stage: l.stage, panel: l.panel })})`,
    );
    const exit = hostPanelIn(page).locator(':scope > .fixed button').last();
    await tapIt(exit, `${where}: the fixed bar's last button (${(await exit.innerText()).trim()})`, false);
    await ctx.close();
  }

  // Elsewhere the panel is as tall as it was: min(clamp(280px, 44vh, 440px), 62vh).
  section('A phone on its side, a tablet, a laptop, two windows: the panel as it was');
  for (const [what, opts, dual] of /** @type {[string, import('playwright-core').BrowserContextOptions, boolean][]} */ ([
    ['a phone on its side, 844×390', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, false],
    ['a tablet upright, 768×1024', { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true }, false],
    ['a laptop, 1280×720', { viewport: { width: 1280, height: 720 } }, false],
    ['a big screen, 1920×1080', { viewport: { width: 1920, height: 1080 } }, false],
  ])) {
    const { ctx, page } = await sample(opts, dual);
    const l = await layout(page);
    const vh = l.ih / 100;
    const was = Math.min(Math.max(280, Math.min(44 * vh, 440)), 62 * vh);
    assert(
      Math.abs(l.panel.h - was) <= 1 && !(await hostPanelIn(page).getByRole('button', { name: '⋯ Tools' }).count()),
      `${what}: the panel is ${Math.round(was)}px tall as before (${l.panel.h}), no ⋯ Tools`,
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await sample({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);
    const l = await layout(page);
    assert(
      l.panel.y + l.panel.h <= l.ih + 1 && !(await hostPanelIn(page).getByRole('button', { name: '⋯ Tools' }).count()) && l.stage.h < 300,
      `a phone with an audience window: the stage preview and the panel as before (${JSON.stringify({ stage: l.stage, panel: l.panel })})`,
    );
    await ctx.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Phone panel e2e passed');
} catch (e) {
  await failureShots('phonepanel', browser);
  throw e;
} finally {
  await browser.close();
}
