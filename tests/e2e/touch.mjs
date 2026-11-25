// @ts-check
// The editor on a phone or a tablet: a phone gets a note that it's made for a computer (players join from their phones
// with the host's code), closed for good with its ✕. A touch screen with no mouse shows no keys on buttons and in menus,
// and no "or drop it here", but the keys window still lists the keys. A computer shows all of it, and no note.
// A phone hosting with the buzzer room up (local, under wrangler dev): the 📱 card's rows fit the screen (📱 and ⛔
// only, their words for screen readers and in their tooltips), nothing scrolls sideways, and Start game ▶ takes a tap.
// A board game hosted on a touch screen: its status line and its turn box name the buttons (🎲 Roll, ▶ Move, ◀ Previous
// turn), never a key (D, Enter, Shift+N, N); with a mouse they keep their keys.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  appFile,
  addPlayers,
  failureShots,
  startBuzzer,
  startRoomOn,
  assert,
  assertEq,
  launchChromium,
  openGameFile,
  roundTabsIn,
  section,
  statusLineIn,
  stepButton,
  toastsIn,
} from './helpers.mjs';

const file = appFile();
const url = pathToFileURL(file).href;
const buzzer = await startBuzzer('buzzer-touch-');
const browser = await launchChromium();
const errors = [];
async function open(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  return { ctx, page };
}
const note = (page) => page.locator('.data-notice', { hasText: 'Made for a computer.' });
const shows = (loc) => loc.evaluate((e) => getComputedStyle(e).display !== 'none');
/** ✨ Try a sample game, then 📂 Open… while its toast is up: on a narrow screen the toast over the window wraps to a
 * few lines rather than being cut mid-sentence, and stays in the room above the window, clear of it and its buttons. */
async function toastOverWindow(page, what) {
  await page.getByRole('button', { name: /Try a sample game/ }).click();
  await toastsIn(page, { hasText: 'Added a sample game' }).waitFor();
  await page.getByRole('button', { name: 'Open…' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  const t = await toastsIn(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    // (Room at the top of every window for three lines, a tall window's title and ✕ too: its backdrop's padding.)
    const room = parseFloat(getComputedStyle(document.querySelector('.modal-backdrop')).paddingTop);
    return {
      cut: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
      wide: r.width >= innerWidth - 33,
      lines: Math.round((el.clientHeight - 16) / lh),
      roomy: r.top + (r.height - el.clientHeight) + 16 + 3 * lh <= room,
      top: r.top,
      bottom: r.bottom,
      text: el.textContent,
    };
  });
  const box = await dlg.boundingBox();
  const hit = await dlg
    .locator('button:visible')
    .evaluateAll((bs, b) => bs.filter((x) => x.getBoundingClientRect().top < b).map((x) => x.textContent.trim() || x.getAttribute('aria-label')), t.bottom);
  assert(
    !t.cut && t.wide && t.lines >= 2 && t.lines <= 3 && t.roomy && t.top >= 0 && t.bottom <= box.y && hit.length === 0,
    `${what}: a toast over a window wraps to ${t.lines} lines the screen's width, not cut, above the window (with room for three) and clear of its buttons (${t.text})`,
  );
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
}

/** A board game for two moved by `mover` (a d6, a movement wheel, or a space at a time), as a game file. */
function boardFile(/** @type {'dice' | 'wheel' | 'step'} */ kind) {
  const sp = (/** @type {number} */ i, /** @type {string} */ name, /** @type {boolean} */ end) => ({
    id: `b${i}`,
    name,
    x: 200 + (i % 4) * 450,
    y: i < 4 ? 300 : 700,
    color: '#4363d8',
    next: end ? [] : [`b${i + 1}`],
  });
  const names = ['Start', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Finish'];
  const game = {
    id: `g_touch_board_${kind}`,
    version: 2,
    title: 'Touch board',
    settings: {
      allowNegativeScores: true,
      deductOnWrong: true,
      defaultTimerSeconds: null,
      finalTimerSeconds: 30,
      currencySymbol: '$',
      rollOffDie: 20,
      pickerFollowsAward: true,
      timerAutoStart: true,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' },
      maxPlayers: 8,
    },
    players: [
      { id: 'p1', name: 'Ann', color: '#e6194b' },
      { id: 'p2', name: 'Bob', color: '#3cb44b' },
    ],
    rounds: [
      {
        id: 'r_bg',
        name: 'Board game',
        mode: 'boardgame',
        slide: { background: { color: '#1d5e3a' }, elements: [] },
        spaces: names.map((n, i) => sp(i, n, i === names.length - 1)),
        mover: kind === 'dice' ? { kind, dice: 'd6' } : kind === 'wheel' ? { kind, wheel: 'w_move' } : { kind },
        zones: [],
      },
    ],
    media: [],
    audio: {},
    dice: [],
    theme: {},
    wheels: [
      {
        id: 'w_move',
        name: 'Move wheel',
        segments: ['1', '2', '3'].map((label, i) => ({ id: `s${i}`, label, color: ['#f00', '#0f0', '#00f'][i], weight: 1 })),
        spinDurationMs: 800,
        removeAfterLanding: false,
      },
    ],
  };
  mkdirSync(resolve('test-results'), { recursive: true });
  const f = resolve(`test-results/touch-board-${kind}.json`);
  writeFileSync(f, JSON.stringify(game));
  return f;
}
/** Keys a touch screen's words must not name: D, Enter, Shift+N, (N), a click. */
const KEYS = /Shift|Enter|Ctrl|\((N|D|W|Enter)\)|\bD rolls|\bclick/;
/**
 * A board game's status line and turn box in `opts`'s window, moved by `kind`: what they say before the first move,
 * and with `play` (a d6), once 🎲 Roll then ▶ Move have played the turn.
 */
async function boardWords(
  /** @type {import('playwright-core').BrowserContextOptions} */ opts,
  /** @type {'dice' | 'wheel' | 'step'} */ kind = 'dice',
  play = false,
) {
  const { ctx, page } = await open(opts);
  await openGameFile(page, boardFile(kind));
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  const fresh = page.getByRole('alertdialog').getByRole('button', { name: 'Start a new game' });
  await fresh
    .or(page.getByRole('button', { name: 'Start game ▶' }))
    .first()
    .waitFor();
  if (await fresh.isVisible()) await fresh.click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.bh').waitFor();
  const how = statusLineIn(page).locator('.hint').first();
  const first = page.locator('.bh [data-turn-next]');
  /** @type {{ touch: boolean, how: string, first: string, firstTitle: string | null, sw: number, iw: number, played?: string, playedTitle?: string | null }} */
  const out = {
    touch: await page.evaluate(() => matchMedia('(hover: none)').matches),
    how: (await how.innerText()).trim(),
    first: (await first.innerText()).trim(),
    firstTitle: await first.getAttribute('title'),
    sw: await page.evaluate(() => document.documentElement.scrollWidth),
    iw: await page.evaluate(() => innerWidth),
  };
  if (play) {
    // 🎲 Roll, then ▶ Move: the turn is played. (A tap, or a click with a mouse. On a phone the panel's pinned rows
    // cover the turn box where a finger would reach it, so there it's pressed in the page: this checks the words.)
    const phone = (opts.viewport?.width ?? 0) < 600;
    /** @param {import('playwright-core').Locator} b */
    const press = (b) => (phone ? b.evaluate((e) => /** @type {HTMLElement} */ (e).click()) : opts.hasTouch ? b.tap() : b.click());
    await press(stepButton(page).first());
    const move = stepButton(page).filter({ hasText: '▶ Move' });
    await move.waitFor({ timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('.bh [data-step]')?.hasAttribute('disabled'));
    await press(move);
    await first.filter({ hasText: 'turn is played' }).waitFor({ timeout: 10000 });
    out.played = (await first.innerText()).trim();
    out.playedTitle = await first.getAttribute('title');
  }
  await ctx.close();
  return out;
}

try {
  // ---------- A board game hosted on a touch screen, and with a mouse ----------
  section('A board game: buttons on a touch screen, keys with a mouse');
  const tail = ' · tap a token to select them, drag it to send them';
  for (const [what, opts] of /** @type {[string, import('playwright-core').BrowserContextOptions][]} */ ([
    ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
    ['a tablet', { viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: true }],
  ])) {
    const w = await boardWords(opts, 'dice', true);
    assert(w.touch, `${what} is a touch screen with no mouse (hover: none)`);
    assertEq(w.how, `🎲 Roll, then ▶ Move · ◀ Previous turn to go back${tail}`, `${what}: the board game's status line names its buttons`);
    assert(!KEYS.test(w.how), `${what}: and no keys (${w.how})`);
    assertEq(w.first, 'Ann’s turn: 🎲 Roll, then ▶ Move (or tap the dice).', `${what}: the turn box's first line says tap`);
    assertEq(w.played, 'Ann’s turn is played: Next turn ▶.', `${what}: once moved, Next turn ▶ with no (N)`);
    assert(![w.first, w.firstTitle, w.played, w.playedTitle].some((t) => KEYS.test(t ?? '')), `${what}: the turn box names no keys, nor does its tooltip`);
    assert(w.sw === w.iw, `${what}: nothing scrolls sideways (${w.sw} wide in ${w.iw})`);
  }
  const tablet = { viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: true };
  const wheel = await boardWords(tablet, 'wheel');
  assertEq(wheel.how, `🎡 Spin to move, then ▶ Move · ◀ Previous turn to go back${tail}`, 'a tablet, a movement wheel: 🎡 Spin to move, then ▶ Move');
  assertEq(wheel.first, 'Ann’s turn: 🎡 Spin to move, then ▶ Move (or tap the wheel).', 'and its turn box says tap the wheel');
  const step = await boardWords(tablet, 'step');
  assertEq(step.how, `Pick the way (→ buttons, or tap the space) · ◀ Previous turn to go back${tail}`, 'a tablet, a space at a time: no Enter');
  assertEq(step.first, 'Ann’s turn: → the way on (or tap the space on the stage).', 'and its turn box says tap the space');
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    const what = `a computer at ${viewport.width}×${viewport.height}`;
    const w = await boardWords({ viewport }, 'dice', true);
    assert(!w.touch, `${what} has a mouse (hover: hover)`);
    assertEq(
      w.how,
      'D rolls or spins, then ▶ Move (Enter) · Shift+N turn back · click a token to select them, drag it to send them',
      `${what}: the board game's status line keeps its keys`,
    );
    assertEq(w.first, 'Ann’s turn: 🎲 Roll, then ▶ Move (or click the dice).', `${what}: the turn box's first line says click`);
    assertEq(w.played, 'Ann’s turn is played: Next turn ▶ (N).', `${what}: once moved, Next turn ▶ (N)`);
  }
  const mouse = { viewport: { width: 1280, height: 720 } };
  assertEq((await boardWords(mouse, 'wheel')).first, 'Ann’s turn: 🎡 Spin to move, then ▶ Move (or click the wheel).', 'with a mouse, a wheel: click');
  const mouseStep = await boardWords(mouse, 'step');
  assertEq(
    mouseStep.how,
    'Pick the way (→ buttons, the space, or Enter when there’s one) · Shift+N turn back · click a token to select them, drag it to send them',
    'with a mouse, a space at a time: its keys as before',
  );
  assertEq(mouseStep.first, 'Ann’s turn: → the way on (Enter, or click the space on the stage).', 'and its turn box says Enter');

  // ---------- A phone ----------
  {
    const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await note(page).waitFor();
    assert(
      (await note(page).innerText()).includes("Players join from their phones with the host's code."),
      'a phone says the editor is made for a computer, and that players join from their phones',
    );
    // (One note, its ✕ beside its words.)
    const [words, x] = await Promise.all([note(page).locator('span').first().boundingBox(), note(page).getByRole('button', { name: 'Got it' }).boundingBox()]);
    assert(x.y < words.y + words.height && x.x > words.x + words.width - 1, 'its ✕ sits beside its words');
    // Nothing to drop with a finger, nor keys to press.
    assert(
      !(await shows(page.locator('.first-round .open-line .not-touch'))) &&
        (await page.locator('.first-round .open-line').innerText()).includes('Have a game file?'),
      '“or drop it here” isn’t shown on a touch screen',
    );
    // (Nor in 📂 Open a game's foot.)
    await page
      .locator('.first-round .open-line')
      .getByRole('button', { name: /Open a game/ })
      .click();
    await page.locator('.hint.drop').waitFor({ state: 'attached' });
    assert(!(await shows(page.locator('.hint.drop'))), '📂 Open a game doesn’t say “or drop a game file” on a touch screen');
    await page.keyboard.press('Escape');
    await page.locator('.hint.drop').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Help:/ }).click();
    const menuKey = page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).locator('kbd');
    assert((await menuKey.count()) === 1 && !(await shows(menuKey)), 'a menu shows no keys on a touch screen');
    await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
    const keys = page.getByRole('dialog', { name: 'Editor keyboard shortcuts' });
    await keys.waitFor();
    assert(await shows(keys.locator('td > kbd').first()), 'the keys window still lists the keys (a keyboard can be plugged in)');
    await page.keyboard.press('Escape');
    await keys.waitFor({ state: 'detached' });
    // Its ✕ puts it away for good on this phone.
    await note(page).getByRole('button', { name: 'Got it' }).click();
    assert((await note(page).count()) === 0, 'its ✕ closes it');
    await page.reload();
    await page.getByRole('button', { name: 'Open…' }).waitFor();
    await page.waitForTimeout(300);
    assert((await note(page).count()) === 0, 'and it stays closed');
    // The ▶ Play screen's Start game ▶ has no Ctrl+⏎ on it.
    await toastOverWindow(page, 'a phone');
    // A window as tall as the screen (the clue editor): its toast (📋 Copy slide's) still sits above it, not on its
    // title and ✕.
    await roundTabsIn(page, { hasText: 'Jeopardy!' }).first().click();
    await page.locator('.grid .tile').first().click();
    const clueDlg = page.getByRole('dialog', { name: 'Edit clue' });
    await clueDlg.waitFor();
    await clueDlg.getByRole('button', { name: /Copy slide/ }).click();
    const [tb, cb] = [await toastsIn(page).boundingBox(), await clueDlg.boundingBox()];
    assert(
      tb.y + tb.height <= cb.y && cb.y + cb.height >= 844 - 17,
      `a toast over the clue editor, as tall as the phone's screen, stays above its top (${Math.round(tb.y + tb.height)} ≤ ${Math.round(cb.y)})`,
    );
    await page.keyboard.press('Escape');
    await clueDlg.waitFor({ state: 'detached' });
    await roundTabsIn(page).first().waitFor();
    // The sidebar's list, at most 30% of the height, scrolls: its foot fades to say there's more (🕘 History, cut).
    const nav = page.locator('nav[aria-label="Editor"]');
    await page.waitForFunction(() => {
      const n = document.querySelector('nav[aria-label="Editor"]');
      return n && n.scrollHeight > n.clientHeight + 1;
    });
    await page.waitForTimeout(100);
    assert(
      (await nav.evaluate((n) => getComputedStyle(n).maskImage)).includes('gradient'),
      'the sidebar’s list scrolls on a phone, and its foot fades to say so',
    );
    await nav.evaluate((n) => n.scrollTo(0, n.scrollHeight));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('nav[aria-label="Editor"]')).maskImage === 'none');
    assert(true, 'scrolled to its end, it doesn’t fade');
    await page.getByRole('button', { name: '▶ Play' }).click();
    await page.getByRole('button', { name: /Start game ▶/ }).waitFor();
    await addPlayers(page, 2);
    const startKey = page.locator('kbd.start-key');
    assert((await startKey.count()) === 1 && !(await shows(startKey)), 'Start game ▶ shows no Ctrl+⏎ on a touch screen');
    await ctx.close();
  }

  // ---------- A phone hosting, the buzzer room up ----------
  {
    const opts = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript((s) => {
      try {
        const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
        if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: s }));
      } catch {}
    }, buzzer.base);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole('button', { name: /Try a sample game/ }).click();
    await page.getByRole('button', { name: '▶ Play' }).click();
    await page.getByRole('button', { name: /Start game ▶/ }).waitFor();
    await addPlayers(page, 3);
    const card = page.getByRole('region', { name: 'Phone buzzers' });
    await card.getByLabel(/Buzzer mode/).check();
    const code = await startRoomOn(card);
    const seats = await card.locator('ul.phones > li .name').allInnerTexts();
    for (const seat of seats.slice(0, 2)) {
      const pc = await browser.newContext(opts);
      const p = await pc.newPage();
      p.on('pageerror', (e) => errors.push(`[phone] ${e.message}`));
      await p.goto(`${buzzer.base}/${code}`);
      await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
      await p.getByRole('button', { name: seat, exact: true }).tap();
      await p.locator('#me').getByText(seat).waitFor();
    }
    await page.waitForFunction(() => document.querySelectorAll('ul.phones button.kick').length === 2);
    const fit = await page.evaluate(() => {
      // (A phone widens the page to fit what sticks out, so innerWidth would grow with it: the screen's 390 it is.)
      const wide = [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > 390.5)
        .map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30));
      const rows = [...document.querySelectorAll('ul.phones > li')].map((li) => Math.round(li.getBoundingClientRect().height));
      return {
        sw: document.documentElement.scrollWidth,
        iw: innerWidth,
        wide,
        rows,
        list: Math.round(document.querySelector('ul.phones').getBoundingClientRect().width),
      };
    });
    assert(
      fit.sw === 390 && fit.iw === 390 && fit.wide.length === 0 && fit.rows.every((h) => h < 40),
      `a phone hosting, two phones in: the 📱 card's rows fit the screen, one line each, nothing scrolls sideways (${JSON.stringify(fit)})`,
    );
    const kick = card.getByRole('button', { name: /^Kick .*: take their seat back from their phone$/ }).first();
    const free = card.getByRole('button', { name: /^Free seat: .*’s \(moved phone\)$/ }).first();
    assert(
      (await kick.innerText()).trim() === '⛔' &&
        (await free.innerText()).trim() === '📱' &&
        (await kick.getAttribute('title')).startsWith('Kick') &&
        (await free.getAttribute('title')).includes('free the seat'),
      `there, ⛔ Kick and 📱 Free seat show only their icons, their words in their names and tooltips (“${(await kick.innerText()).trim()}”, “${(await free.innerText()).trim()}”)`,
    );
    // (A wider phone, 412: room for their words, still one line each, without the “(new phone)”.)
    await page.setViewportSize({ width: 412, height: 915 });
    const fit412 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      rows: [...document.querySelectorAll('ul.phones > li')].map((li) => Math.round(li.getBoundingClientRect().height)),
    }));
    assert(
      fit412.sw === 412 &&
        fit412.rows.every((h) => h < 40) &&
        (await kick.innerText()).trim() === '⛔ Kick' &&
        (await free.innerText()).trim() === '📱 Free seat',
      `a 412-wide phone: ⛔ Kick and 📱 Free seat with their words, rows still one line, nothing sideways (${JSON.stringify(fit412)})`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Start game ▶/ }).tap({ timeout: 5000 });
    await page.locator('main.play').waitFor();
    assert(true, 'and Start game ▶ takes a tap');
    await ctx.close();
  }

  // ---------- A tablet ----------
  {
    // The line saying what the app is wraps: a finger can't open the tooltip a cut line keeps the rest in.
    const { ctx, page } = await open({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
    const words = page.locator('.first-round .what > .words');
    assert(
      (await words.evaluate((w) => w.scrollWidth <= w.clientWidth)) && (await page.locator('.first-round .what').innerText()).includes('Nothing to install.'),
      'a tablet shows the whole line saying what the app is, not cut short',
    );
    await ctx.close();
  }

  // ---------- A computer: a narrow window, and a touch laptop ----------
  for (const [what, opts] of /** @type {[string, import('playwright-core').BrowserContextOptions][]} */ ([
    ['a narrow window on a computer', { viewport: { width: 390, height: 844 } }],
    ['a touch laptop', { viewport: { width: 1280, height: 800 }, hasTouch: true }],
  ])) {
    const { ctx, page } = await open(opts);
    await page.waitForTimeout(300);
    assert((await note(page).count()) === 0, `${what} gets no “Made for a computer” note`);
    if (opts.viewport.width < 600) await toastOverWindow(page, what);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } });
    assert(await shows(page.locator('.first-round .open-line .not-touch')), 'with a mouse, the first screen says “or drop it here”');
    const what = await page.locator('.first-round .what').boundingBox();
    assert(what.height < 30, 'and its line saying what the app is stays on one line');
    await page
      .locator('.first-round .open-line')
      .getByRole('button', { name: /Open a game/ })
      .click();
    await page.locator('.hint.drop').waitFor();
    assert(await shows(page.locator('.hint.drop')), 'and 📂 Open a game says “or drop a game file on the editor”');
    await page.keyboard.press('Escape');
    await page.locator('.hint.drop').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Help:/ }).click();
    assert(await shows(page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).locator('kbd')), 'and its menus show their keys');
    await ctx.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Touch E2E passed.');
} catch (e) {
  await failureShots('touch', browser);
  throw e;
} finally {
  await browser.close();
  buzzer.stop();
}
