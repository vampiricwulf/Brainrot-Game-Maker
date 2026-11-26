// @ts-check
// Hosting on a touch screen with no mouse (a phone held upright, a tablet either way up): the host panel's fixed bar
// (↶ Undo … 🚪 Exit) and ⋯ Tools are at least 32px to tap, and so is every button in the Final's reveal rows (▲ ▼, the
// name, ½ Halve, 0 Nullify, Show wager, ✔ Right, ✘ Wrong), whose ✔ Right / ✘ Wrong stay clear of ½ Halve, 0 Nullify
// and Show wager where a row wraps; the RPG's and the board game's menus (＋ Screen…, 📍 Send to…, 🗂 Spaces…) at least
// 28px. A touch screen shows no tooltips, so the bar keeps the words a sign can't say (▭ Scores window, 📺 Audience,
// 🙈 Hide) at every width, and all of its words where they fit on one line (1100px wide and up); on a phone its buttons
// wrap one by one (three rows from 320 to 390px wide), on a tablet held upright (768, 820) it's one line. The tools
// row keeps 🤫 Send a card…, 🎭 Deal… and 📊 Scoreboard in words. The stage is the same size as with a mouse, and the
// fixed bar on screen. With a mouse, nothing changes: the bar's words go to signs at 940–1340px as before, and the
// tools row's at 1040–1240px.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  appFile,
  assert,
  failureShots,
  finalControlsIn,
  hostPanelIn,
  launchChromium,
  leaveAnswer,
  openGameFile,
  resultsPath,
  section,
  sleep,
  stageBoxIn,
  statusLineIn,
  toolsRowIn,
} from './helpers.mjs';

/** @typedef {import('playwright-core').Page} Page */
/** @typedef {import('playwright-core').BrowserContextOptions} Opts */

const url = pathToFileURL(appFile()).href;
const browser = await launchChromium();
/** @type {string[]} */
const errors = [];

const touch = (/** @type {number} */ width, /** @type {number} */ height) => ({ viewport: { width, height }, hasTouch: true, isMobile: width < 600 });
const mouse = (/** @type {number} */ width, /** @type {number} */ height) => ({ viewport: { width, height } });
const say = (/** @type {Opts} */ o) => `${o.hasTouch ? 'touch' : 'mouse'} ${o.viewport?.width}×${o.viewport?.height}`;

/** @param {Opts} opts */
async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  return { ctx, page };
}

/** @param {Page} page */
const settle = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

/** The sample game, started in one window, past its intro. @param {Opts} opts */
async function sample(opts) {
  const { ctx, page } = await newPage(opts);
  await page.getByRole('button', { name: /Try a sample game/ }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await hostPanelIn(page).waitFor();
  for (let i = 0; i < 4; i++) {
    const skip = page.getByRole('button', { name: /Skip intro/ });
    if (await skip.count()) await skip.first().click();
    await sleep(300);
  }
  await settle(page);
  return { ctx, page };
}

/** @param {Page} page */
const stageOf = async (page) => {
  const b = await stageBoxIn(page).boundingBox();
  return b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}` : 'none';
};

/**
 * The fixed bar now: each button's size and whether its word shows, how many rows it takes, its foot; ⋯ Tools' size;
 * the tools row's buttons and whether their words show.
 * @param {Page} page
 */
const bar = (page) =>
  hostPanelIn(page).evaluate((panel) => {
    const fixed = /** @type {HTMLElement} */ (panel.querySelector(':scope > .fixed'));
    const seen = (/** @type {Element} */ e) => e.getClientRects().length > 0;
    const word = (/** @type {Element} */ b) => {
      const w = b.querySelector('.word, .txt, .name');
      return !!w && w.getBoundingClientRect().width > 2;
    };
    const rows = (/** @type {Element[]} */ els) => {
      const tops = els.map((e) => e.getBoundingClientRect().top).sort((a, b) => a - b);
      return tops.filter((t, i) => i === 0 || t - tops[i - 1] > 10).length;
    };
    const name = (/** @type {Element} */ b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ');
    const bs = [...fixed.querySelectorAll('button')].filter(seen);
    const fold = panel.querySelector('.toolsfold');
    const tools = [...(panel.querySelector('[data-tools-row]')?.querySelectorAll('button') ?? [])].filter(seen);
    return {
      buttons: bs.map((b) => {
        const r = b.getBoundingClientRect();
        return { name: name(b), w: Math.round(r.width), h: Math.round(r.height), word: word(b) };
      }),
      rows: rows(bs),
      foot: Math.round(fixed.getBoundingClientRect().bottom),
      fold: fold && seen(fold) ? { w: Math.round(fold.getBoundingClientRect().width), h: Math.round(fold.getBoundingClientRect().height) } : null,
      tools: tools.map((b) => ({ name: name(b), word: word(b) })),
    };
  });

/**
 * The moment's boxes in the panel (the action part, a round's or a tool's box) with less than 60px of room, or less
 * than all they need where that's less, as phonepanel.mjs measures them.
 * @param {Page} page
 */
const roomless = (page) =>
  hostPanelIn(page).evaluate((panel) =>
    [...panel.querySelectorAll(':scope > .act > .action, .mode-host')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none')
      .filter((e) => e.scrollHeight > 0 && e.clientHeight < Math.min(60, e.scrollHeight) - 1)
      .map((e) => `${[...e.classList].filter((c) => !c.startsWith('svelte-')).join('.')} ${e.clientHeight} of ${e.scrollHeight}`),
  );
/** @param {Awaited<ReturnType<typeof bar>>} b @param {RegExp} re */
const wordOf = (b, re) => b.buttons.find((x) => re.test(x.name))?.word;
/** @param {Awaited<ReturnType<typeof bar>>} b @param {RegExp} re */
const toolWord = (b, re) => b.tools.find((x) => re.test(x.name))?.word;

try {
  section('The fixed bar and ⋯ Tools on a touch screen: 32px to tap, the words a sign can’t say');
  /** Rows the bar took before (all signs but ⏸ Cover and 🚪 Exit), at most one more now. */
  const before = { 320: 3, 360: 2, 390: 2 };
  for (const [w, h] of [
    [320, 568],
    [360, 740],
    [390, 844],
    [768, 1024],
    [820, 1180],
    [1024, 768],
    [1280, 800],
  ]) {
    const t = touch(w, h);
    const { ctx, page } = await sample(t);
    const b = await bar(page);
    const small = b.buttons.filter((x) => x.w < 32 || x.h < 32);
    assert(
      small.length === 0,
      `${say(t)}: every fixed-bar button at least 32×32 (${small.length ? small.map((x) => `${x.name} ${x.w}×${x.h}`).join(', ') : b.buttons.map((x) => x.h).join('/')})`,
    );
    if (h <= 700) {
      assert(!!b.fold && b.fold.w >= 32 && b.fold.h >= 32, `${say(t)}: ⋯ Tools at least 32×32 (${b.fold ? `${b.fold.w}×${b.fold.h}` : 'none'})`);
      // (It grows into the room above and under the status line: a tap 2px inside its top or foot still lands on it.)
      const edges = await hostPanelIn(page)
        .locator('.toolsfold')
        .evaluate((f) => {
          const r = f.getBoundingClientRect();
          const x = r.left + r.width / 2;
          return [r.top + 2, r.bottom - 2].map((y) => f.contains(document.elementFromPoint(x, y)));
        });
      assert(edges.every(Boolean), `${say(t)}: a tap at ⋯ Tools' top or foot reaches it (${edges})`);
    }
    assert(b.foot <= h, `${say(t)}: the fixed bar on screen (its foot at ${b.foot} of ${h})`);
    const three = [/^Scores window/, /^📺/, /^🙈/].map((re) => wordOf(b, re));
    assert(three.every(Boolean), `${say(t)}: ▭ Scores window, 📺 Audience and 🙈 Hide keep their words (${three})`);
    const rest = [/^↶/, /^↷/, /^📜/, /^👥/, /^⚖/, /^🔊/, /^❔/].map((re) => wordOf(b, re));
    if (w >= 1100) assert(rest.every(Boolean) && b.rows === 1, `${say(t)}: every word shows, on one line (${b.rows} rows)`);
    else
      assert(
        rest.every((x) => x === false),
        `${say(t)}: ↶ ↷ 📜 👥 ⚖ 🔊 ❔ as their signs (${rest})`,
      );
    if (w in before) {
      const was = before[/** @type {320 | 360 | 390} */ (w)];
      assert(b.rows <= was + 1 && b.rows <= 3, `${say(t)}: the bar takes ${b.rows} rows, at most one more than its ${was}`);
    } else assert(b.rows === 1, `${say(t)}: the bar on one line (${b.rows} rows)`);
    // (Up to 700px tall the row is folded behind ⋯ Tools. On a phone up to 800px tall the words would take it a line
    // more, out of the moment's room: signs there.)
    if (h > 700) {
      const tw = [/^🤫 Send a card/, /^🎭 Deal/, /^📊/].map((re) => toolWord(b, re));
      if (w > 560 || h > 800) assert(tw.every(Boolean), `${say(t)}: the tools row keeps 🤫 Send a card…, 🎭 Deal… and 📊 Scoreboard in words (${tw})`);
      else
        assert(
          tw.every((x) => x === false),
          `${say(t)}: the tools row's 🤫 🎭 📊 as their signs, a line less (${tw})`,
        );
    }
    const tight = await roomless(page);
    assert(tight.length === 0, `${say(t)}: the moment's box has room (60px, or all it needs)${tight.length ? ` (not: ${tight.join(', ')})` : ''}`);
    // The stage as with a mouse at the same size: the bigger buttons and the words come out of the panel.
    const stage = await stageOf(page);
    await ctx.close();
    const m = await sample(mouse(w, h));
    const mStage = await stageOf(m.page);
    assert(stage === mStage, `${say(t)}: the stage as with a mouse (${stage}, ${mStage})`);
    await m.ctx.close();
  }

  section('With a mouse the bar and the tools row are as they were');
  for (const [w, h] of [
    [900, 800],
    [1024, 768],
    [1280, 800],
  ]) {
    const o = mouse(w, h);
    const { ctx, page } = await sample(o);
    const b = await bar(page);
    const sw = wordOf(b, /^Scores window/);
    const undo = wordOf(b, /^↶/);
    const help = wordOf(b, /^❔/);
    const want = { sw: false, undo: w > 940, help: w > 1040 };
    assert(
      sw === want.sw && undo === want.undo && help === want.help,
      `${say(o)}: ▭ ${sw ? 'with' : 'without'} its word, ↶ Undo ${undo ? 'with' : 'without'}, ❔ Help ${help ? 'with' : 'without'}`,
    );
    assert(b.rows === 1, `${say(o)}: the bar on one line (${b.rows} rows)`);
    const send = toolWord(b, /^🤫 Send a card/);
    const score = toolWord(b, /^📊/);
    assert(
      send === w > 1240 && score === w > 1040,
      `${say(o)}: 🤫 Send a card… ${send ? 'with' : 'without'} its word, 📊 Scoreboard ${score ? 'with' : 'without'}`,
    );
    const small = b.buttons.filter((x) => x.h >= 32);
    assert(small.length === 0, `${say(o)}: its buttons keep their size (${b.buttons.map((x) => x.h).join('/')})`);
    await ctx.close();
  }

  section('The Final’s reveal rows on a touch screen: 32px to tap, ✔ Right and ✘ Wrong clear of the wager’s tools');
  const finalFile = resultsPath('touchsize-final.json');
  writeFileSync(finalFile, JSON.stringify(finalGame()));
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [1024, 768],
  ]) {
    const t = touch(w, h);
    const { ctx, page } = await finalReveals(t, finalFile);
    const rows = await finalControlsIn(page)
      .locator('.order .pl')
      .evaluateAll((pls) =>
        pls.map((pl) => {
          const r = (/** @type {Element | null} */ e) => {
            const b = e?.getBoundingClientRect();
            return b && b.width
              ? { name: (e?.getAttribute('aria-label') ?? e?.textContent ?? '').split(':')[0].trim(), l: b.left, r: b.right, t: b.top, b: b.bottom }
              : null;
          };
          const by = (/** @type {string} */ re) => [...pl.querySelectorAll('button')].find((b) => new RegExp(re).test(b.getAttribute('aria-label') ?? ''));
          const small = [...pl.querySelectorAll('button')]
            .filter((b) => b.getClientRects().length)
            .map((b) => ({ name: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim(), ...r(b) }))
            .filter((b) => b.r - b.l < 32 || b.b - b.t < 32)
            .map((b) => `${b.name} ${Math.round(b.r - b.l)}×${Math.round(b.b - b.t)}`);
          const tools = ['^Halve', '^Nullify', '^Show wager'].map((x) => r(by(x) ?? null)).filter((x) => !!x);
          const verdicts = ['^✔ Right', '^✘ Wrong'].map((x) => r(by(x) ?? null)).filter((x) => !!x);
          // (Each pair clear: 8px down where one is under the other (a wrapped row), or 6px across, as the columns are.)
          const near = [];
          for (const a of tools)
            for (const v of verdicts) {
              const dx = Math.round(Math.max(a.l, v.l) - Math.min(a.r, v.r));
              const dy = Math.round(Math.max(a.t, v.t) - Math.min(a.b, v.b));
              if (dy < 8 && dx < 6) near.push(`${a.name} / ${v.name}: ${dx}px across, ${dy}px down`);
            }
          return { small, near, halve: !!by('^Halve') };
        }),
      );
    assert(rows.length === 3 && rows.every((r) => r.halve), `${say(t)}: three reveal rows, each with ½ Halve (${rows.map((r) => r.halve)})`);
    const small = rows.flatMap((r) => r.small);
    assert(small.length === 0, `${say(t)}: every button in the reveal rows at least 32×32${small.length ? ` (not: ${small.join(', ')})` : ''}`);
    const near = rows.flatMap((r) => r.near);
    assert(
      near.length === 0,
      `${say(t)}: ✔ Right and ✘ Wrong clear of ½ Halve, 0 Nullify and Show wager (8px under them or 6px beside)${near.length ? ` (not: ${near.join('; ')})` : ''}`,
    );
    const b = await bar(page);
    assert(b.foot <= h, `${say(t)}: the fixed bar on screen in the reveals (its foot at ${b.foot} of ${h})`);
    const tight = await roomless(page);
    assert(tight.length === 0, `${say(t)}: the reveals' box has room (60px, or all it needs)${tight.length ? ` (not: ${tight.join(', ')})` : ''}`);
    const stage = await stageOf(page);
    await ctx.close();
    const m = await finalReveals(mouse(w, h), finalFile);
    const mStage = await stageOf(m.page);
    assert(stage === mStage, `${say(t)}: the stage in the reveals as with a mouse (${stage}, ${mStage})`);
    await m.ctx.close();
  }

  section('The RPG’s and the board game’s menus on a touch screen: 28px to tap');
  const roundsFile = resultsPath('touchsize-rounds.json');
  writeFileSync(roundsFile, JSON.stringify(roundsGame()));
  for (const o of [touch(1024, 768), mouse(1024, 768)]) {
    const { ctx, page } = await newPage(o);
    await openGameFile(page, roundsFile);
    await page.getByText(/^Opened “/).waitFor();
    await page.getByRole('button', { name: '▶ Play' }).click();
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await hostPanelIn(page).waitFor();
    for (const [round, names] of [
      ['RPG', ['Add a screen']],
      ['board game', ['Send to', "Open a space's card"]],
    ]) {
      if (round === 'board game') {
        // (Next round ▶ and its answer each ignore a click in their first moment.)
        await sleep(450);
        await toolsRowIn(page).getByRole('button', { name: 'Next round ▶' }).click();
        await sleep(450);
        const yes = leaveAnswer(page);
        if (await yes.isVisible()) await yes.click();
      }
      const start = hostPanelIn(page).getByRole('button', { name: /^Start the round ▶/ });
      if (await start.count()) await start.click();
      for (const n of names) {
        const sel = hostPanelIn(page).getByRole('combobox', { name: n, exact: true });
        await sel.waitFor();
        const b = await sel.boundingBox();
        const hh = Math.round(b?.height ?? 0);
        if (o.hasTouch) assert(hh >= 28, `${say(o)}: the ${round}’s “${n}” menu at least 28px tall (${hh}px)`);
        else assert(hh < 28, `${say(o)}: the ${round}’s “${n}” menu as it was (${hh}px)`);
      }
    }
    await ctx.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Touch sizes E2E passed.');
} catch (e) {
  await failureShots('touchsize', browser);
  throw e;
} finally {
  await browser.close();
}

/**
 * The Final's reveals in a fresh `opts` context: three players' wagers in, the question and answer shown, the first
 * player spotlit with their wager on screen.
 * @param {Opts} opts
 * @param {string} file
 */
async function finalReveals(opts, file) {
  const { ctx, page } = await newPage(opts);
  await openGameFile(page, file);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await finalControlsIn(page).locator('.wagers').waitFor();
  const boxes = finalControlsIn(page).locator('.wagers input[data-wager]');
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).fill('1000');
  for (const step of ['Question on screen', 'Answer on screen', 'Player reveals']) {
    await page.keyboard.press(step === 'Answer on screen' ? 'r' : 'n');
    await statusLineIn(page, { hasText: step }).waitFor();
  }
  await page.keyboard.press('n');
  await finalControlsIn(page).locator('.pl.cur', { hasText: 'wager $1,000' }).waitFor();
  await settle(page);
  return { ctx, page };
}

function text(/** @type {string} */ id, /** @type {string} */ t) {
  return {
    id,
    type: 'text',
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
  };
}
function slide(/** @type {string} */ id, /** @type {string} */ t) {
  return { background: { color: '#0a1a6b' }, elements: [text(id, t)] };
}
/** @param {string} id @param {any[]} rounds @param {object} [more] */
function base(id, rounds, more = {}) {
  return {
    id,
    version: 2,
    title: 'Touch Night',
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
    players: ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 5000 })),
    rounds,
    media: [],
    audio: {},
    theme: {},
    wheels: [],
    dice: [],
    statFields: [],
    items: [],
    worlds: [],
    ...more,
  };
}
function finalGame() {
  return base('g_touch_final', [
    {
      id: 'r_final',
      name: 'Final Jeopardy!',
      mode: 'final',
      category: 'Internet History',
      questionSlide: slide('fq', 'The first video'),
      extraSlides: [],
      answerSlide: slide('fa', 'Me at the zoo'),
      timerSeconds: 30,
      allowNonPositive: true,
      cards: [],
    },
  ]);
}
function roundsGame() {
  const sp = (/** @type {string} */ id, /** @type {string} */ name, /** @type {number} */ x, /** @type {string[]} */ next) => ({
    id,
    name,
    x,
    y: 300,
    color: '#4363d8',
    next,
  });
  const screens = [0, 1].map((c) => ({ id: `sc_${c}`, name: `Field ${c}`, col: c, row: 0, slide: { background: { color: '#553322' }, elements: [] } }));
  return base(
    'g_touch_rounds',
    [
      { id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' },
      {
        id: 'r_bg',
        name: 'Board game',
        mode: 'boardgame',
        slide: { background: { color: '#1d5e3a' }, elements: [] },
        spaces: [sp('b0', 'Start', 300, ['b1']), sp('b1', 'Middle', 900, ['b2']), sp('b2', 'Finish', 1500, [])],
        mover: { kind: 'dice', dice: 'dp1' },
        zones: [],
      },
    ],
    {
      dice: [{ id: 'dp1', name: 'Move die', dice: [{ id: 'd1', sides: 6, count: 1 }], showTotal: true }],
      worlds: [
        {
          id: 'w1',
          name: 'World',
          maps: [
            {
              id: 'm1',
              name: 'Overworld',
              cols: 3,
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
    },
  );
}
