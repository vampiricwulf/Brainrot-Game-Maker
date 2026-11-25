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
// window's foot, the fixed bar in reach. On these phones ⋯ Tools, the clock's buttons and the 🎲 Dice menu's are at
// least 32px to tap, a clue's player chips are one line each (a 320px phone too), and the panel's words name taps,
// never a click or keys (a clue, the RPG, the board game, game over).
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
    // ...and it, not the line's empty spacer, has the line's room.
    const cut = [...panel.querySelectorAll(':scope > .status > :is(.hint, .how, .muted:has(> .hint))')].some((e) => e.scrollWidth > e.clientWidth + 1);
    const spacer = panel.querySelector(':scope > .status > .spacer');
    return {
      untitled,
      spacerW: cut && spacer ? spacer.getBoundingClientRect().width : 0,
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
  assert(l.spacerW <= 1, `${where}, ${moment}: the how-to, cut short, has the line's room, not its spacer (${l.spacerW}px)`);
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

/** What a touch screen's panel never says: a click, or keys (1–N, number keys, a key to press, Esc). */
const KEYS = /\bclick|\(1–\d|number keys|press \d|\bEsc\b/i;
/**
 * The host panel's words, as shown (tooltips aside), name taps, not a click or keys: a touch screen has neither.
 * @param {Page} page
 * @param {string} where
 * @param {string} moment
 */
async function noKeys(page, where, moment) {
  // (Not the 📝 host notes: the game's author wrote them.)
  const lines = (await hostPanelIn(page).innerText()).split('\n').filter((l) => KEYS.test(l) && !l.trim().startsWith('📝'));
  assert(lines.length === 0, `${where}, ${moment}: the panel's words name no click and no keys (${lines.join(' | ')})`);
}

/**
 * Every one of `loc`'s buttons and boxes in sight is at least 32px tall to tap (a touch screen's floor, as the tools
 * row's): ⋯ Tools, the clock's, the 🎲 Dice menu's.
 * @param {Locator} loc
 * @param {string} what
 */
async function tappable(loc, what) {
  const sizes = await loc.evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length)
      .map((e) => ({ name: (e.textContent || e.getAttribute('aria-label') || '').trim(), h: Math.round(e.getBoundingClientRect().height) })),
  );
  const small = sizes.filter((x) => x.h < 32);
  assert(sizes.length > 0 && small.length === 0, `${what}: at least 32px tall to tap (${JSON.stringify(small.length ? small : sizes.slice(0, 3))})`);
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
    await noKeys(page, where, 'a clue');
    // ⏱️ Start and its seconds box, and (on a small phone) ⋯ Tools, at least 32px to tap.
    await tappable(statusLineIn(page).locator('.tc :is(button, input)'), `${where}, a clue: the clock's Start and seconds box`);
    if (tiny) await tappable(hostPanelIn(page).getByRole('button', { name: '⋯ Tools' }), `${where}: ⋯ Tools`);
    // The players' chips on one line each, the sample's short names and scores (a 320px phone too): not folded in two,
    // twice as tall, with only the first chip in reach. The first two chips' ✔ take a tap where they are, and ✔ / ✘
    // keep their size.
    const chips = await hostPanelIn(page).evaluate((panel) => {
      const rows = [...panel.querySelectorAll('[data-player-row]')];
      return {
        tall: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
        reach: rows.slice(0, 2).map((r) => {
          const b = /** @type {Element} */ (r.querySelector('.quick')).getBoundingClientRect();
          const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return !!at && r.contains(at) && !!at.closest('.quick');
        }),
        small: [...panel.querySelectorAll('[data-player-row] .quick')].filter((q) => {
          const b = q.getBoundingClientRect();
          return b.width < 36 || b.height < 32;
        }).length,
      };
    });
    assert(
      chips.tall.length === 3 && chips.tall.every((t) => t < 50) && chips.reach.every(Boolean) && chips.small === 0,
      `${where}, a clue: each player's chip is one line, the first two's ✔ in reach, ✔ / ✘ at least 36×32 (${JSON.stringify(chips)})`,
    );
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
    await tappable(dice.locator(':is(button, input)'), `${where}: the 🎲 Dice menu's d4…2d6, its box and Roll`);
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
    await noKeys(page, where, 'the RPG round');

    // The board game: 🎲 Roll, then ▶ Move, tapped.
    await nextRound(page);
    if (await skip.count()) await tapIt(skip, `${where}: the board game's Skip intro`);
    await page.locator('.bh').waitFor();
    await sleep(400);
    await roomy(page, where, 'the board game', stage0);
    await noKeys(page, where, 'the board game');
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
      // The Final's clock running on its question: ⏸, −10, +10, ↺ and ✕ at least 32px to tap.
      if (step === 'Question on screen') {
        await statusLineIn(page).getByRole('button', { name: 'Hide timer' }).waitFor();
        await tappable(statusLineIn(page).locator('.tc :is(button, input)'), `${where}, the Final's question: the clock's buttons`);
      }
    }
    await roomy(page, where, "the Final's reveals", stage0);
    await tapIt(hostPanelIn(page).getByRole('button', { name: 'Finish now…' }), `${where}: the Final's Finish now…`);
    await sleep(450);
    await tapIt(confirmStrip(page).getByRole('button', { name: 'Finish', exact: true }), `${where}: its Finish`);
    await statusSays(page, 'Game over');
    await sleep(400);
    await roomy(page, where, "the end's tie", stage0);
    await noKeys(page, where, 'game over');
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
