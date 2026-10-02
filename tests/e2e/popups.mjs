// Pop-ups are always whole in the window and on top of everything (see src/lib/anchored.ts): the host panel's 📱 phones
// list (a single window, under the stage and beside it, and with an audience window; at 1280×600 and 1920×1080, after
// the window shrinks and with the panel scrolled), its 🎲 Dice menu and its Go to round list; the editor's ⋯ More menu;
// a slide editor's Background ▾, ◼ Shape ▾, 🌐 Link and 🖼 Image pop-ups by the window's right edge; and the pre-game
// screen's player picture picker. In a single window the phones list stays off the stage viewers see.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// A game with a board, an RPG round (the host panel beside the stage on a wide window) and a Final; eight players.
const text = (id, t) => ({ id, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 72, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
let n = 0;
const clue = (q, a) => ({ id: `c${++n}`, value: null, type: 'standard', questionSlide: slide(`q${n}`, q), answerSlide: slide(`a${n}`, a) });
const cats = ['Memes', 'Lore', 'Blocks', 'Rizz', 'Speedruns'];
const screens = [0, 1].map((c) => ({ id: `sc_${c}`, name: `Field ${c}`, col: c, row: 0, slide: { background: { color: '#553322' }, elements: [] } }));
const game = {
  id: 'g_popups', version: 2, title: 'Popup Night',
  settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 15, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8, buzzer: true },
  players: Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i % 4], startScore: 0 })),
  rounds: [
    { id: 'r_board', name: 'Jeopardy!', mode: 'board', values: [200, 400, 600, 800, 1000], dailyDoubleCount: 0, categories: cats.map((c, ci) => ({ id: `cat${ci}`, title: c, clues: [0, 1, 2, 3, 4].map((ri) => clue(`${c} ${ri}`, `Answer ${ci}.${ri}`)) })) },
    { id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' },
    { id: 'r_final', name: 'Final Jeopardy!', mode: 'final', category: 'History', questionSlide: slide('fq', 'The first video'), answerSlide: slide('fa', 'Me at the zoo'), timerSeconds: 30, allowNonPositive: true },
  ],
  media: [], audio: {}, theme: {}, wheels: [], dice: [], statFields: [], items: [],
  worlds: [{ id: 'w1', name: 'World', maps: [{ id: 'm1', name: 'Overworld', cols: 2, rows: 1, screens, visibility: 'discovered', showExits: true, revealNeighbors: true, diagonals: true, wrap: false, transition: 'cut' }] }],
};
mkdirSync(resolve('test-results'), { recursive: true });
const gameFile = resolve('test-results/popups.json');
writeFileSync(gameFile, JSON.stringify(game));

// A fake buzzer room (as in remotebuzz.mjs): Start the room works, and the test can say which phones joined.
function fakeRoom() {
  try {
    const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
    if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: 'https://buzz.test' }));
  } catch {}
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url) === 'https://buzz.test/api/rooms' && init?.method === 'POST')
      return new Response(JSON.stringify({ code: 'BCDF', hostToken: 'secret' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return realFetch(url, init);
  };
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.onopen?.({});
        this.onmessage?.({ data: JSON.stringify({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: Date.now() }) });
      }, 20);
    }
    send() {}
    close() {
      this.readyState = 3;
    }
  }
  window.WebSocket = FakeSocket;
  window.__say = (m) => sockets.at(-1)?.onmessage?.({ data: JSON.stringify(m) });
}

/** Where a pop-up is, and what's on top at its middle and just inside its corners. */
const where = (loc) =>
  loc.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const top = (x, y) => {
      const h = document.elementFromPoint(x, y);
      return h && (el.contains(h) ? true : `${h.tagName.toLowerCase()}.${String(h.className).split(' ')[0]}`);
    };
    return {
      x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: b.right, bottom: b.bottom,
      vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
      middle: top(b.left + b.width / 2, b.top + b.height / 2), first: top(b.left + 6, b.top + 6), last: top(b.right - 6, b.bottom - 6),
    };
  });
let shotN = 0;
/** The pop-up is whole in the window and nothing covers it. */
async function wholeAndOnTop(page, loc, what) {
  await loc.waitFor();
  await page.waitForTimeout(120);
  const r = await where(loc);
  if (shots) await page.screenshot({ path: `${shots}/popups-${String(++shotN).padStart(2, '0')}.png` });
  assert(r.x >= 0 && r.y >= 0 && r.right <= r.vw + 0.5 && r.bottom <= r.vh + 0.5 && r.w > 20 && r.h > 16, `${what}: whole in the ${r.vw}×${r.vh} window (${r.w}×${r.h} at ${r.x},${r.y})`);
  assert(r.middle === true && r.first === true && r.last === true, `${what}: on top (its middle and corners are it${r.middle === true && r.first === true && r.last === true ? '' : `, not ${[r.middle, r.first, r.last].join(' / ')}`})`);
  return r;
}

async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(fakeRoom);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  return page;
}

/** ▶ Play, start the buzzer room (2 phones joined, Zed asking), optionally an audience window, and start the game. */
async function playWithPhones(page, dual) {
  await page.getByRole('button', { name: '▶ Play' }).click();
  const card = page.getByRole('region', { name: 'Phone buzzers' });
  await card.waitFor();
  const on = card.getByLabel(/Buzzer mode/);
  if (!(await on.isChecked())) await on.check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await card.getByLabel('Room code BCDF').waitFor();
  if (dual) await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  await page.evaluate(() =>
    window.__say({ t: 'phones', phones: [{ conn: 'c1', seatId: 'p1', connected: true }, { conn: 'c2', seatId: 'p2', connected: true }, { conn: 'c9', seatId: null, pendingName: 'Zed', connected: true }] }),
  );
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.panel').waitFor();
  if (await page.getByRole('button', { name: 'Skip intro' }).count()) await page.getByRole('button', { name: 'Skip intro' }).click();
}

const chip = (page) => page.locator('.panel button.chip', { hasText: '📱' });
const phones = (page) => page.locator('#phone-pop');

/** Open the 📱 phones list, check it, close it. In a single window it's off the stage. */
async function checkPhones(page, what, dual) {
  await chip(page).click();
  const r = await wholeAndOnTop(page, phones(page), `the 📱 phones list (${what})`);
  if (!dual) {
    const stage = await page.locator('.stage-box').boundingBox();
    const side = await page.locator('.play.side').count();
    assert(
      side ? r.x >= stage.x + stage.width - 1 : r.y >= stage.y + stage.height - 1,
      `and it doesn’t cover the stage viewers see (${side ? 'beside' : 'under'} it)`,
    );
  }
  return r;
}
const closePhones = async (page) => {
  await page.getByRole('button', { name: 'Close the phones list' }).click();
  await phones(page).waitFor({ state: 'detached' });
};

async function nextRound(page) {
  await page.waitForTimeout(450);
  await page.locator('.rn button', { hasText: '▶' }).click();
  await page.locator('.panel .confirm').waitFor();
  await page.waitForTimeout(450);
  await page.locator('.panel .confirm').getByRole('button', { name: 'Yes', exact: true }).click();
  await page.waitForTimeout(450);
  if (await page.getByRole('button', { name: 'Skip intro' }).count()) await page.getByRole('button', { name: 'Skip intro' }).click();
}

try {
  // ---------- The host panel's pop-ups, in each layout ----------
  for (const [w, h] of [
    [1280, 600],
    [1920, 1080],
  ]) {
    for (const dual of [false, true]) {
      const how = `${w}×${h}, ${dual ? 'with an audience window' : 'single window'}`;
      console.log(`Host panel, ${how}:`);
      const page = await newPage(w, h);
      await playWithPhones(page, dual);
      await checkPhones(page, `board, ${how}`, dual);
      await closePhones(page);
      // A clue open: the panel's rows change, the list still fits.
      await page.locator('.stage-box .board .tile').first().click();
      await page.waitForTimeout(300);
      await checkPhones(page, `a clue, ${how}`, dual);
      await closePhones(page);
      await page.keyboard.press('Shift+Escape');
      await page.locator('.stage-box .board').waitFor();

      // 🎲 Dice: up from its button, whole and on top.
      await page.getByRole('button', { name: '🎲 Dice' }).click();
      const dice = await wholeAndOnTop(page, page.getByRole('dialog', { name: 'Dice' }), `the 🎲 Dice menu (${how})`);
      if (!dual) {
        const stage = await page.locator('.stage-box').boundingBox();
        assert(dice.y >= stage.y + stage.height - 1, 'and it stays off the stage');
      }
      await page.keyboard.press('Escape');

      // Go to round: a list the browser draws; its box is in the window and not covered.
      await wholeAndOnTop(page, page.locator('.panel select[aria-label="Go to round"]'), `the Go to round list (${how})`);

      // The RPG round: beside the stage on a wide window.
      await nextRound(page);
      await page.locator('.panel .status', { hasText: 'Adventure' }).waitFor();
      await checkPhones(page, `RPG round, ${how}`, dual);
      await closePhones(page);
      await page.close();
    }
  }

  // ---------- The phones list follows the window and the panel ----------
  console.log('The phones list as the window shrinks and the panel scrolls:');
  {
    const page = await newPage(1920, 1080);
    await playWithPhones(page, false);
    await chip(page).click();
    await wholeAndOnTop(page, phones(page), 'open at 1920×1080');
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.waitForTimeout(200);
    const r = await wholeAndOnTop(page, phones(page), 'the window shrunk to 1280×600: it moved and shrank to fit (it scrolls inside)');
    const scrolls = await phones(page).evaluate((el) => el.scrollHeight > el.clientHeight);
    assert(scrolls || r.h > 200, 'its rows scroll inside it when they’re taller than the room');
    // Shorter still: the panel scrolls; the list stays whole in the window.
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.locator('.panel').evaluate((p) => (p.scrollTop = p.scrollHeight));
    await page.waitForTimeout(200);
    await wholeAndOnTop(page, phones(page), 'a 1280×480 window, the panel scrolled');
    await page.close();
  }

  // ---------- The editor: ⋯ More, a slide editor's pop-ups by the right edge ----------
  console.log('The editor:');
  {
    const page = await newPage(1280, 600);
    await page.getByRole('button', { name: /^More:/ }).click();
    await wholeAndOnTop(page, page.getByRole('menu'), 'the ⋯ More menu');
    await page.keyboard.press('Escape');
    // A narrow, short window: the slide editor's toolbar runs to the right edge.
    await page.setViewportSize({ width: 640, height: 560 });
    await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
    await page.locator('.grid .tile').first().click();
    const clueBox = page.getByRole('dialog', { name: 'Edit clue' });
    await clueBox.waitFor();
    const bg = clueBox.getByRole('button', { name: /Background ▾/ }).first();
    const bgBox = await bg.boundingBox();
    await bg.click();
    await wholeAndOnTop(page, page.getByRole('group', { name: 'Background' }), `Background ▾ (its button at x ${Math.round(bgBox.x)} of 640)`);
    // (A click elsewhere closes it.)
    await page.locator('.se .backdrop').click({ position: { x: 4, y: 4 } });
    await page.getByRole('group', { name: 'Background' }).waitFor({ state: 'detached' });
    await clueBox.getByRole('button', { name: /◼ Shape/ }).first().click();
    await wholeAndOnTop(page, page.locator('.se .menu'), '◼ Shape ▾');
    await page.keyboard.press('Escape');
    await clueBox.getByRole('button', { name: /🌐 Link/ }).first().click();
    await wholeAndOnTop(page, page.getByRole('dialog', { name: 'Add from a link' }), '🌐 Link');
    await page.getByRole('dialog', { name: 'Add from a link' }).getByRole('button', { name: 'Close' }).click();
    await clueBox.getByRole('button', { name: '🖼 Image' }).first().click();
    await wholeAndOnTop(page, page.getByRole('dialog', { name: 'Choose image' }), '🖼 Image');
    await page.keyboard.press('Escape');
    await page.close();
  }

  // ---------- The pre-game screen: a player's picture ----------
  console.log('The pre-game screen:');
  {
    const page = await newPage(1280, 600);
    await page.getByRole('button', { name: '▶ Play' }).click();
    const pic = page.getByRole('button', { name: 'Picture for Player 8' });
    await pic.scrollIntoViewIfNeeded();
    await pic.click();
    await wholeAndOnTop(page, page.getByRole('dialog', { name: 'Choose image' }), 'the picture picker of the last player');
    await page.keyboard.press('Escape');
    await page.close();
  }

  assert(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log('\nAll popup checks passed.');
} catch (e) {
  console.error(e);
  if (errors.length) console.error('Page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
