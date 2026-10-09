// What viewers see in single-window mode, and around the game: the honest "viewers can see this" warnings, the stage
// keeping its size (a clue opening, the Final's steps), the in-panel key list, score pops, the stream cards (Starting
// soon with a countdown, the cover), the clue caption, the Final's scores and wager ticks, and 📋 Copy standings; a
// crowded 720p game; 12 players with phone buzzers (the join code only where people can buzz, a roll-off for 12,
// the ✔ marks, a long tie heading on the end screen); and wheel and dice tiles in buzzer mode (the question, the buzzers
// and the countdown wait for the tile's own tool, and only for it), a countdown started under the cover, Undo bringing
// back a countdown, everyone missing, and the stage's size with a long host note, the buzzers' row and a Daily Double.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, mainLabel, openGameFile, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
const dialogs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const stageSize = async () => {
  await page.waitForTimeout(400);
  const b = await page.locator('.stage-box .stage').boundingBox();
  return `${Math.round(b.width)}x${Math.round(b.height)}`;
};
const nextRound = async () => {
  await page.waitForTimeout(450);
  await page.locator('.rn button').last().click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
};

/**
 * A crowded game on a 720p stream: 12 players with long names and big scores, a board of 10 categories with long
 * names. Nothing viewers need is cut off, shrunk past reading, or covered.
 */
async function crowd() {
  console.log('A crowded game at 1280×720:');
  const NAMES = ['xXx_DarkLord_Skibidi_420_xXx', 'TheRealMcCoy Bartholomew', 'Cat', 'Mrs. Featherstonehaugh', 'EveEveEveEveEveEve', 'Fay', 'Gustavo Fring Fan Club', 'Hal', 'Ivy-Rose Montgomery', 'JJ', 'Kimberly Kardashian', 'Louis the Fourteenth'];
  const SCORES = [12400, -3200, 800, 0, 25600, 1000000, -400, 600, 200, 1600, 3000, 99999];
  const COLORS = ['#e6194b', '#56b4e9', '#f0e442', '#1f3a93', '#d55e00', '#f2f2f2', '#009e73', '#cc79a7', '#911eb4', '#9a6324', '#bfef45', '#f032e6'];
  const CATS = ['Famous Internet Personalities of the 2010s', 'Skibidi Lore', 'Minecraft Speedrunning Strategies', 'Rizz', 'Things That Happened Only in Ohio', 'Anime Openings', 'Supercalifragilisticexpialidocious Words', 'Gen Alpha Slang Dictionary', 'Twitch Streamers', 'Memes'];
  const LONG = 'This streamer once spent forty-eight consecutive hours playing the same level of a notoriously difficult platformer while chat voted on every single jump he made';
  const text = (t) => ({ id: `t${Math.random().toString(36).slice(2)}`, kind: 'text', text: t, x: 120, y: 90, w: 1680, h: 900, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 110, weight: 700, italic: false, underline: false, uppercase: true, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, shadow: { color: '#000000', x: 6, y: 6, blur: 0 }, autoFit: true });
  const values = [200, 400, 600, 800, 1000];
  const game = {
    id: 'g_crowd', version: 2, title: 'Crowded',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 12, stream: { clueCaption: true } },
    players: NAMES.map((name, i) => ({ id: `p${i + 1}`, name, color: COLORS[i], startScore: SCORES[i] })),
    rounds: [{
      id: 'r_big', name: 'Big board', mode: 'board', values, dailyDoubleCount: 0,
      categories: CATS.map((title, c) => ({ id: `c${c}`, title, clues: values.map((v, r) => ({ id: `q${c}_${r}`, value: null, type: 'standard', questionSlide: { background: {}, elements: [text(c + r ? `Clue ${c}-${r}` : LONG)] }, answerSlide: { background: {}, elements: [text(`Answer ${c}-${r}`)] } })) })),
    }],
    media: [], audio: {}, wheels: [], dice: [], theme: {},
  };
  mkdirSync(resolve('test-results'), { recursive: true });
  const gameFile = resolve('test-results/stream-crowd.json');
  writeFileSync(gameFile, JSON.stringify(game));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await ctx.newPage();
  host.on('pageerror', (e) => errors.push(`[crowd] ${e.message}`));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.locator('nav .problem', { hasText: 'Big board' }).waitFor();
  const line = host.locator('nav .problem', { hasText: 'Big board' });
  assert(((await line.getAttribute('title')) ?? (await line.innerText())).includes('too long to read on the board'), 'the editor’s checklist says which category names are too long for the board');
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  aud.on('pageerror', (e) => errors.push(`[crowd audience] ${e.message}`));
  await aud.setViewportSize({ width: 1280, height: 720 });
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await aud.locator('.board .header .title').first().waitFor();
  await aud.waitForTimeout(800);

  // Every score whole on its plate (none cut to "$1,60"), and every name on one line ("…" if it must).
  const clipped = (loc) =>
    loc.evaluateAll((els) =>
      els.filter((e) => {
        const box = e.closest('.plate').getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return e.scrollWidth > e.clientWidth + 1 || r.left < box.left - 1 || r.right > box.right + 1;
      }).length,
    );
  assert((await aud.locator('.plate').count()) === 12 && (await clipped(aud.locator('.plate .score .nm'))) === 0, '12 players at 1280: no score is cut off');
  const nameRows = await aud.locator('.plate .name').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
  assert(nameRows.length === 1, `every name row is the same height (${nameRows.join(', ')})`);
  const nameSizes = await aud.locator('.plate .name .fit').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  assert(Math.min(...nameSizes) >= 28, `names stay readable (${Math.min(...nameSizes)}px at the smallest, in stage pixels)`);

  // Ten columns of values: all whole, one size for the board, not shrunk to nothing.
  const vals = await aud.locator('.board .tile .face').evaluateAll((els) =>
    els.map((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), over: e.firstElementChild.scrollWidth > e.clientWidth + 1 })),
  );
  assert(vals.length === 50 && !vals.some((v) => v.over), '10 categories: every value fits its tile');
  assert(new Set(vals.map((v) => v.size)).size === 1 && vals[0].size >= 40, `one size for every value on the board (${vals[0].size}px)`);
  const cats = await aud.locator('.board .header .title').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  // (Two of them are too long for a 10-column board: the editor's checklist said so, and they alone go smaller.)
  const small = cats.filter((n) => n < 30);
  assert(cats.length === 10 && small.length <= 2 && Math.min(...cats) >= 20, `category names stay at 30 stage px or more (${cats.join(', ')})`);
  const catsOver = await aud.locator('.board .header .title').evaluateAll((els) =>
    els.filter((e) => e.firstElementChild.scrollHeight > e.clientHeight + 1).map((e) => `${e.textContent} ${e.firstElementChild.scrollHeight}/${e.clientHeight} ${e.style.fontSize} ${e.style.hyphens}`),
  );
  assert(catsOver.length === 0, `and they all fit their cells ${catsOver.join(' | ')}`);

  // The ▭ scores window (a lower third): no score cut off there either, the countdown beside them.
  const [sc] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('Shift+A')]);
  await sc.setViewportSize({ width: 1280, height: 240 });
  await sc.locator('.plate').first().waitFor();
  await sc.waitForTimeout(500);
  assert((await clipped(sc.locator('.plate .score .nm'))) === 0, 'the ▭ scores window cuts no score off');

  // A countdown on the board sits at the end of the score bar: over no category, tile or score plate.
  await host.bringToFront();
  await host.keyboard.press('t');
  await aud.locator('.timer').waitFor();
  await aud.waitForTimeout(400);
  const covered = await aud.evaluate(() => {
    const t = document.querySelector('.timer').getBoundingClientRect();
    const over = (b) => b.right > t.left && b.left < t.right && b.bottom > t.top && b.top < t.bottom;
    return [...document.querySelectorAll('.board .header, .board .tile, .plate')].filter((e) => over(e.getBoundingClientRect())).map((e) => e.textContent.trim().slice(0, 30));
  });
  assert(!covered.length, `a countdown on the board covers no category, tile or plate (${covered.join(' | ')})`);

  // A long clue with the countdown up: the slide moves down under it, so the countdown never covers its first line.
  await host.locator('.stage-box .board .tile').first().click();
  await aud.locator('.slide-area').waitFor();
  await host.keyboard.press('t');
  await aud.locator('.timer').waitFor();
  await aud.waitForTimeout(600);
  const timer = await aud.locator('.timer').boundingBox();
  const words = await aud.locator('.slide-area .inner').boundingBox();
  assert(words.y >= timer.y + timer.height, `the countdown doesn’t cover the clue’s first line (timer ends at ${Math.round(timer.y + timer.height)}, the words start at ${Math.round(words.y)})`);
  assert((await sc.locator('.clock .timer').count()) === 1, 'the scores window shows the countdown too');
  const caption = await aud.locator('.caption').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  assert(caption >= 44, `the clue caption is big enough to read on a scaled-down stream (${caption}px)`);
  await host.keyboard.press('t');

  // A pop for the last player (a long name): it stays on the stage, above the caption, and its points always show.
  await host.locator('.panel .p').nth(11).locator('.sel').click();
  await host.keyboard.press('Enter');
  await aud.locator('.pop').waitFor();
  // (Once it has flown in.)
  await aud.waitForTimeout(400);
  const pop = await aud.locator('.pop').boundingBox();
  const cap = await aud.locator('.caption').boundingBox();
  assert(pop.x >= 0 && pop.x + pop.width <= 1280 && pop.y + pop.height <= cap.y, `the score pop stays on the stage, above the caption (${JSON.stringify(pop)})`);
  assert((await aud.locator('.pop .amt').innerText()).includes('$200'), 'with its points shown in full');
  await host.keyboard.press('Escape');
  await aud.locator('.board .tile').first().waitFor();
  await aud.waitForTimeout(300);
  const onBar = await aud.locator('.pop').boundingBox();
  assert(onBar.x >= 0 && onBar.x + onBar.width <= 1280.5, `back on the board, the pop over the last plate stays on the stage (${JSON.stringify(onBar)})`);
  if (process.env.SHOTS) await aud.screenshot({ path: `${process.env.SHOTS}/stream-crowd.png` });
  await ctx.close();
}

/**
 * A 12-player game with phone buzzers, the way viewers see it: the join code gone where nobody can buzz (a Daily
 * Double, a roll-off), a roll-off for 12 that stays on the stage, the Final's category in the theme's clue font and its
 * ✔ marks clear of the scores, and an end screen whose tie heading (two long names) keeps every place on screen.
 */
async function viewers() {
  console.log('What viewers see, 12 players with phone buzzers:');
  const NAMES = ['xXx_DarkLord_Skibidi_420_xXx', 'TheRealMcCoy Bartholomew', 'Cat', 'Mrs. Featherstonehaugh', 'EveEveEveEveEveEve', 'Fay', 'Gustavo Fring Fan Club', 'Hal', 'Ivy-Rose Montgomery', 'JJ', 'Kimberly Kardashian', 'Louis the Fourteenth'];
  const SCORES = [5000, 5000, 0, 800, 2600, 100, -400, 600, 200, 1600, 3000, 4000];
  const COLORS = ['#e6194b', '#56b4e9', '#f0e442', '#1f3a93', '#d55e00', '#f2f2f2', '#009e73', '#cc79a7', '#911eb4', '#9a6324', '#bfef45', '#f032e6'];
  const slide = (t) => ({ background: {}, elements: [{ id: `t${Math.random().toString(36).slice(2)}`, kind: 'text', text: t, x: 120, y: 90, w: 1680, h: 900, rotation: 0, opacity: 1, zIndex: 1, font: "'Libre Baskerville', Georgia, serif", size: 110, weight: 700, italic: false, underline: false, uppercase: true, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, shadow: { color: '#000000', x: 6, y: 6, blur: 0 }, autoFit: true }] });
  const values = [200, 400, 600, 800, 1000];
  const game = {
    id: 'g_viewers', version: 2, title: 'Viewers',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 12, stream: {} },
    players: NAMES.map((name, i) => ({ id: `p${i + 1}`, name, color: COLORS[i] })),
    rounds: [
      {
        id: 'r_b', name: 'Board', mode: 'board', values, dailyDoubleCount: 1,
        categories: ['One', 'Two', 'Three'].map((title, c) => ({ id: `c${c}`, title, clues: values.map((v, r) => ({ id: `q${c}_${r}`, value: null, type: c + r ? 'standard' : 'dailyDouble', questionSlide: slide(`Clue ${c}-${r}`), answerSlide: slide(`Answer ${c}-${r}`) })) })),
      },
      { id: 'r_f', name: 'Final Round', mode: 'final', category: 'Famous Brainrot', questionSlide: slide('The final clue'), answerSlide: slide('The final answer'), timerSeconds: 30, allowNonPositive: true },
    ],
    media: [], audio: {}, wheels: [], dice: [],
    // (🎨 Theme → Clue text: Anton.)
    theme: { clueFont: "'Anton', Impact, sans-serif" },
  };
  const gameFile = resolve('test-results/stream-viewers.json');
  writeFileSync(gameFile, JSON.stringify(game));
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // A fake buzzer room (as in remotebuzz.mjs): room BCDF.
  await ctx.addInitScript(() => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: 'https://buzz.test' }));
    } catch {}
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, init) =>
      String(url) === 'https://buzz.test/api/rooms' && init?.method === 'POST'
        ? new Response(JSON.stringify({ code: 'BCDF', hostToken: 'secret-token' }), { status: 200, headers: { 'content-type': 'application/json' } })
        : realFetch(url, init);
    window.WebSocket = class {
      static OPEN = 1;
      constructor() {
        this.readyState = 0;
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.({});
          this.onmessage?.({ data: JSON.stringify({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: Date.now() }) });
        }, 20);
      }
      send() {}
      close() {
        this.readyState = 3;
      }
    };
  });
  const host = await ctx.newPage();
  host.on('pageerror', (e) => errors.push(`[viewers] ${e.message}`));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await card.getByLabel('Room code BCDF').waitFor();
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  aud.on('pageerror', (e) => errors.push(`[viewers audience] ${e.message}`));
  await aud.setViewportSize({ width: 1280, height: 720 });
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  const skip = host.getByRole('button', { name: 'Skip intro' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await aud.locator('.board .tile').first().waitFor();
  for (let i = 0; i < 12; i++) {
    await host.locator('.panel .p').nth(i).locator('button.score').click();
    await host.locator('.panel .p .score-edit').fill(String(SCORES[i]));
    await host.locator('.panel .p .score-edit').press('Enter');
  }
  const badge = aud.locator('.join-badge');
  await badge.waitFor();
  assert(true, 'on the board the join code is at the end of the score bar');
  const plates = () => aud.locator('.plate').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)).join());
  const before = await plates();

  // 🏁 Who goes first for 12: everything on the stage, the result line's room kept from the start.
  await host.getByRole('button', { name: '🏁 Who goes first' }).click();
  await host.getByRole('button', { name: /^Roll for 12/ }).click();
  await aud.locator('.ov .title').waitFor();
  await aud.waitForTimeout(300);
  assert((await badge.count()) === 0, 'a roll-off on screen hides the join code (it showed through)');
  const footAt = await aud.locator('.ov .foot').boundingBox();
  await aud.locator('.ov .win').waitFor({ timeout: 15000 });
  await aud.waitForTimeout(500);
  const outside = await aud.evaluate(() =>
    [...document.querySelectorAll('.ov .title, .ov .pl, .ov .win')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth;
    }).length,
  );
  assert(outside === 0, 'a roll-off for 12 players stays on the stage: the title, every die and name, the result');
  const footAfter = await aud.locator('.ov .foot').boundingBox();
  assert(Math.abs(footAfter.height - footAt.height) < 2, `the result line's room is there from the start: the dice don't jump up when it comes (${Math.round(footAt.height)}, then ${Math.round(footAfter.height)} px)`);
  await host.keyboard.press('Escape');
  await aud.locator('.ov').waitFor({ state: 'detached' });
  await badge.waitFor();
  assert((await plates()) === before, 'the code is back after it, and the score plates never moved');

  // A Daily Double: only who found it plays, so no join code.
  await host.locator('.board .tile').first().click();
  await host.locator('.dd .chip').nth(2).click();
  await host.locator('.dd input[type=number]').fill('0');
  await host.locator('.dd input[type=number]').press('Enter');
  await aud.locator('.dd-badge').waitFor();
  assert((await badge.count()) === 0, 'no join code over a Daily Double’s question (nobody buzzes)');
  await host.keyboard.press('r');
  await aud.waitForTimeout(300);
  assert((await badge.count()) === 0, 'nor its answer');
  await host.keyboard.press('Escape');
  await aud.locator('.board .tile').first().waitFor();
  await badge.waitFor();
  // A clue in the usual text box (its frame nearly the whole slide): the code goes in a corner its words leave free.
  await host.locator('.board .tile').nth(1).click();
  await aud.locator('.slide-area').waitFor();
  await badge.waitFor();
  const clueCorner = await badge.getAttribute('data-corner');
  assert(clueCorner === 'br' && (await badge.locator('.jb-link').count()) === 1, `on a clue the whole join badge goes in the corner its words leave free (${clueCorner})`);
  await host.keyboard.press('Escape');
  await aud.locator('.board .tile').first().waitFor();
  await badge.waitFor();

  // The Final: its category in the theme's clue font; each ✔ above its plate, never over the score.
  await nextRoundOf(host);
  const start = host.getByRole('button', { name: 'Start the round ▶' });
  if (await start.isVisible().catch(() => false)) await start.click();
  await aud.locator('.final-sub').waitFor();
  const catFont = await aud.locator('.slide [style*="font-family"]', { hasText: 'Famous Brainrot' }).first().evaluate((e) => e.style.fontFamily);
  assert(/Anton/.test(catFont), `the Final's category is in the theme's clue font (${catFont})`);
  const boxes = host.locator('.fj .wagers input[data-wager]');
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).fill('0');
  await host.locator('.fj').click({ position: { x: 2, y: 2 } });
  await aud.locator('.tick').nth(11).waitFor();
  const overScore = await aud.locator('.plate').evaluateAll((els) =>
    els.filter((p) => {
      const t = p.querySelector('.tick')?.getBoundingClientRect();
      const s = p.querySelector('.score .nm')?.getBoundingClientRect();
      return !t || !s || (t.bottom > s.top && t.top < s.bottom && t.right > s.left && t.left < s.right);
    }).length,
  );
  assert(overScore === 0, 'with 12 players, every ✔ (wager in) is clear of its plate’s score');
  await host.getByRole('button', { name: 'Show question ▶' }).click();
  await host.getByRole('button', { name: 'Reveal answer ▶' }).click();
  await host.getByRole('button', { name: 'Start player reveals ▶' }).click();
  const wrongs = await host.getByRole('button', { name: '✘ Wrong' }).count();
  for (let k = 0; k < wrongs; k++) {
    const main = host.locator('.panel [data-next]');
    if (/Show wager/.test(await main.innerText())) await main.click();
    await host.getByRole('button', { name: '✘ Wrong' }).nth(k).click();
    if (/Next player/.test(await main.innerText())) await main.click();
  }
  await host.getByRole('button', { name: /Finish game/ }).first().click();
  const yes = host.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible().catch(() => false)) await yes.click();

  // The end: a tie of two long names, 12 places: the heading shrinks to fit, every place stays on the stage.
  await aud.locator('.end h1').waitFor();
  // (Once the last place has flown in.)
  await aud.waitForTimeout(300 + 12 * 250 + 700);
  const head = await aud.locator('.end h1').innerText();
  assert(head.startsWith('Tie for first: xXx_DarkLord'), `the end screen says who tied (${head.replace(/\s+/g, ' ')})`);
  const last = await aud.locator('.end li').last().boundingBox();
  assert(last.y + last.height <= 720, `with a long tie heading and 12 players the last place is on screen (it ends at ${Math.round(last.y + last.height)} of 720)`);
  const h1 = await aud.locator('.end h1 span').evaluate((e) => ({ over: e.scrollHeight > e.parentElement.clientHeight + 1, size: parseFloat(getComputedStyle(e.parentElement).fontSize) }));
  assert(!h1.over && h1.size >= 28, `and the heading fits its room (${h1.size} stage px)`);
  if (process.env.SHOTS) await aud.screenshot({ path: `${process.env.SHOTS}/stream-viewers-end.png` });
  await ctx.close();
}

/**
 * Wheel and dice tiles with questions, in a single window with buzzer mode on (a fake room that keeps what it's sent):
 * while the tile's own wheel is up nobody can buzz and the phones get no question; dice rolled over a dice tile's question
 * leave it on stream and its countdown going; a wheel closed over the answer starts no countdown; once dice replace a
 * wheel tile's wheel, a wheel opened later isn't taken for it. Also: the stage keeps its size with a long host note and
 * the buzzers' row, and on a Daily Double's question; Undo of a right answer brings back its countdown, everyone missing
 * makes 👁 Reveal answer the main button, and a tile opened under the cover keeps its countdown paused.
 */
async function tileTools() {
  console.log('Wheel and dice tiles, the countdown and the buzzers (single window, buzzer mode):');
  const slide = (t) => ({ background: {}, elements: [{ id: `t${Math.random().toString(36).slice(2)}`, kind: 'text', text: t, x: 120, y: 90, w: 1680, h: 900, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 110, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true }] });
  const NOTE = 'Accept Shiba or Shiba Inu. If they say Akita, ask them to be more specific; if they say Corgi, it is wrong. The picture on the next slide is of the same dog, taken in 2010 by its owner in Japan.';
  const clue = (id, type, q, extra = {}) => ({ id, value: null, type, questionSlide: slide(q), answerSlide: slide(`${q}: the answer`), ...extra });
  const game = {
    id: 'g_tools', version: 2, title: 'Tile tools',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 20, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: true, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 12, stream: {} },
    players: [['Ann', '#e6194b'], ['Bob', '#3cb44b'], ['Cy', '#4363d8']].map(([name, color], i) => ({ id: `p${i + 1}`, name, color })),
    rounds: [
      {
        id: 'r_t', name: 'Tools', mode: 'board', values: [200, 400, 600], dailyDoubleCount: 1,
        categories: [
          { id: 'c0', title: 'Spin', clues: [clue('qw', 'wheel', 'Wheel question', { wheelId: 'w1' }), clue('qd', 'dice', 'Dice question', { diceId: 'std:d6' }), clue('qc', 'standard', 'Covered question')] },
          { id: 'c1', title: 'Plain', clues: [clue('qn', 'standard', 'Noted question', { hostNotes: NOTE }), clue('qp', 'standard', 'Plain question'), clue('qe', 'standard', 'Spare question')] },
          { id: 'c2', title: 'More', clues: [clue('qx', 'wheel', 'Second wheel question', { wheelId: 'w1' }), clue('qdd', 'dailyDouble', 'Double question'), { ...clue('qo', 'wheel', '', { wheelId: 'w1' }), questionSlide: { background: {}, elements: [] }, answerSlide: { background: {}, elements: [] } }] },
        ],
      },
    ],
    media: [], audio: {}, dice: [], theme: {},
    wheels: [{ id: 'w1', name: 'Spinner', spinDurationMs: 500, removeAfterLanding: false, segments: [{ id: 's1', label: 'Go', color: '#e6194b', weight: 1 }, { id: 's2', label: 'Stop', color: '#3cb44b', weight: 1 }] }],
  };
  const gameFile = resolve('test-results/stream-tools.json');
  writeFileSync(gameFile, JSON.stringify(game));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // A fake buzzer room (as in remotebuzz.mjs): room BCDF, keeping every state the host sends it.
  await ctx.addInitScript(() => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: 'https://buzz.test' }));
    } catch {}
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, init) =>
      String(url) === 'https://buzz.test/api/rooms' && init?.method === 'POST'
        ? new Response(JSON.stringify({ code: 'BCDF', hostToken: 'secret-token' }), { status: 200, headers: { 'content-type': 'application/json' } })
        : realFetch(url, init);
    window.__states = [];
    window.WebSocket = class {
      static OPEN = 1;
      constructor() {
        this.readyState = 0;
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.({});
          this.onmessage?.({ data: JSON.stringify({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: Date.now() }) });
        }, 20);
      }
      send(d) {
        const m = JSON.parse(d);
        if (m.t === 'state') window.__states.push(m.state);
      }
      close() {
        this.readyState = 3;
      }
    };
  });
  const host = await ctx.newPage();
  host.on('pageerror', (e) => errors.push(`[tools] ${e.message}`));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await card.getByLabel('Room code BCDF').waitFor();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  const skip = host.getByRole('button', { name: 'Skip intro' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const stage = (sel) => host.locator(`.stage-box ${sel}`);
  const tileOf = (id) => stage(`.board .tile[data-clue="${id}"]`);
  const clueOpen = () => host.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  const timerNum = async () => +(await stage('.timer .num').innerText());
  /** Until the countdown on stage is at `n` seconds or less. */
  const timerAtMost = (n) => host.waitForFunction((n) => +(document.querySelector('.stage-box .timer .num')?.textContent ?? 99) <= n, n);
  const stageH = async () => {
    await host.waitForTimeout(400);
    return Math.round((await stage('.stage').boundingBox()).height);
  };
  await tileOf('qn').waitFor();

  // A long host note, and the buzzers' row: the stage keeps its size when the clue opens.
  const onBoard = await stageH();
  await tileOf('qn').click();
  await clueOpen();
  const noted = await stageH();
  assert(
    noted === onBoard && (await host.locator('.panel .status .notes').getAttribute('title')).includes(NOTE),
    `single window in buzzer mode, a clue with a long host note keeps the stage's size (${onBoard} / ${noted} px; the note on one line, all of it in its tooltip)`,
  );
  // Undo of a right answer: its countdown comes back with the time it had left.
  await timerAtMost(18);
  const left = await timerNum();
  await host.keyboard.press('1');
  await host.keyboard.press('Enter');
  await stage('.timer').waitFor({ state: 'detached' });
  await host.keyboard.press('Control+z');
  await stage('.timer .num').waitFor();
  const back = await timerNum();
  assert(back > 0 && back <= left, `Ctrl+Z on a right answer brings back the countdown it stopped, with the time it had left (${left} → ${back})`);
  await host.keyboard.press('Escape');
  await tileOf('qp').waitFor();

  // Everyone misses: the answer is next (not a 🔔 Open the buzzers that does nothing).
  await tileOf('qp').click();
  await clueOpen();
  for (const [key, missed] of [['1', 'Ann'], ['2', 'Ann, Bob'], ['3', 'Ann, Bob, Cy']]) {
    await host.keyboard.press(key);
    await host.keyboard.press('Shift+Enter');
    await host.locator('.panel [data-buzzrow]', { hasText: `Missed: ${missed}` }).waitFor();
  }
  assert(
    (await mainLabel(host)) === '👁 Reveal answer' && (await host.locator('.panel button', { hasText: '🔔 Open the buzzers' }).count()) === 0,
    `everyone missed: the main button is 👁 Reveal answer, with no 🔔 Open the buzzers (${await mainLabel(host)})`,
  );
  await host.keyboard.press('Escape');
  await tileOf('qw').waitFor();

  // A wheel tile: its question, the buzzers and the countdown wait for the wheel.
  const sentBefore = await host.evaluate(() => window.__states.length);
  await tileOf('qw').click();
  await stage('.ov .wheel').waitFor();
  await host.locator('.panel [data-buzzrow]', { hasText: 'The buzzers wait for the question (after the wheel)' }).waitFor();
  await host.keyboard.press('w');
  await host.locator('.tc .result').waitFor();
  assert(
    (await stage('.slide-area').count()) === 0 && (await host.evaluate((n) => window.__states.slice(n).filter((s) => s.clue || s.phase !== 'lobby').length, sentBefore)) === 0,
    'a wheel tile: while its wheel is up nobody can buzz and the phones get no question (the host panel says they wait for it)',
  );
  await host.keyboard.press('Escape');
  await stage('.slide-area').waitFor();
  await host.waitForFunction(() => {
    const s = window.__states.at(-1);
    return s?.phase === 'armed' && s.clue?.text === 'Wheel question';
  });
  await stage('.timer').waitFor();
  assert(true, 'closed, its question comes up with its countdown, and the buzzers open (the phones get the words then)');
  await host.keyboard.press('r');
  await stage('[data-slide="answer"]').waitFor();
  await stage('.timer').waitFor({ state: 'detached' });
  // The saved wheel (W), over the answer: closing it starts no countdown over the answer.
  await host.keyboard.press('w');
  await stage('.ov .wheel').waitFor();
  await host.keyboard.press('Escape');
  await stage('.ov').waitFor({ state: 'detached' });
  assert((await stage('.timer').count()) === 0 && (await stage('[data-slide="answer"]').count()) === 1, 'a wheel opened over the answer and closed starts no countdown over it');
  await host.keyboard.press('Escape');
  await tileOf('qd').waitFor();

  // Dice rolled over a wheel tile's wheel (D after the spin), then closed: the question is up. A wheel opened later (W)
  // isn't the tile's own: the question stays on stream, the buzzers stay as they are, and closing it starts no countdown.
  await tileOf('qx').click();
  await stage('.ov .wheel').waitFor();
  await host.keyboard.press('w');
  await host.locator('.tc .result').waitFor();
  await host.keyboard.press('d');
  await host.locator('.tc').getByRole('button', { name: 'Roll again' }).waitFor();
  await host.keyboard.press('Escape');
  await stage('.ov').waitFor({ state: 'detached' });
  await stage('.slide-area').waitFor();
  await host.keyboard.press('1');
  await host.keyboard.press('Shift+Enter');
  const missedAnn = host.locator('.panel [data-buzzrow]', { hasText: 'Missed: Ann' });
  await missedAnn.waitFor();
  await host.keyboard.press('w');
  await stage('.ov .wheel').waitFor();
  assert(
    (await stage('.slide-area').count()) === 1 &&
      (await missedAnn.count()) === 1 &&
      (await host.locator('.panel [data-buzzrow]', { hasText: 'The buzzers wait' }).count()) === 0 &&
      (await host.evaluate(() => window.__states.at(-1)?.phase)) !== 'lobby',
    'dice rolled over a wheel tile’s wheel: a wheel opened later isn’t the tile’s own (the question stays on stream, Ann stays missed)',
  );
  await host.keyboard.press('Escape');
  await stage('.ov').waitFor({ state: 'detached' });
  assert((await stage('.timer').count()) === 0 && (await missedAnn.count()) === 1, 'closing that wheel starts no countdown (nor clears who missed)');
  await host.keyboard.press('Escape');
  await tileOf('qd').waitFor();

  // A Daily Double's question has no buzzers: their row keeps its room, so the stage keeps the board's size there too.
  const boardH = await stageH();
  await tileOf('qdd').click();
  const wager = host.locator('.dd input[type=number]');
  await wager.waitFor();
  await host.locator('.dd .chip', { hasText: 'Ann' }).click();
  await wager.fill('100');
  await wager.press('Enter');
  await clueOpen();
  const ddH = await stageH();
  assert(ddH === boardH, `single window in buzzer mode, a Daily Double's question keeps the stage's size too (${boardH} / ${ddH} px)`);
  await host.keyboard.press('Escape');
  await tileOf('qd').waitFor();

  // A wheel tile with nothing to ask: no question to wait for while its wheel is up.
  await tileOf('qo').click();
  await stage('.ov .wheel').waitFor();
  await host.locator('.panel [data-buzzrow]', { hasText: 'Nothing to buzz on: this tile is just its wheel' }).waitFor();
  assert((await host.locator('.panel button', { hasText: '↺ Reset buzzers' }).count()) === 0, 'a wheel tile with nothing to ask: the buzzers’ row says there’s nothing to buzz on, with no ↺ Reset buzzers');
  await host.keyboard.press('Escape');
  await tileOf('qd').waitFor();

  // A dice tile: dice rolled over its question (D) leave it on stream, and its countdown going.
  await tileOf('qd').click();
  await stage('.ov').waitFor();
  await host.keyboard.press('d');
  await host.locator('.tc .result').waitFor();
  await host.keyboard.press('Escape');
  await stage('.timer .num').waitFor();
  await timerAtMost(18);
  await host.keyboard.press('d');
  await host.locator('.tc .result').waitFor();
  assert((await stage('.slide-area').count()) === 1, 'dice rolled over a dice tile’s question leave the question on stream');
  await host.keyboard.press('Escape');
  await stage('.ov').waitFor({ state: 'detached' });
  const after = await timerNum();
  assert(after <= 18, `closing them leaves its countdown going, not started again (${after} s left)`);
  await host.keyboard.press('Escape');
  await tileOf('qc').waitFor();

  // Under the cover (K): a tile opened meanwhile keeps its countdown paused until the cover comes off.
  await host.keyboard.press('k');
  await stage('.cover').waitFor();
  await tileOf('qc').dispatchEvent('click');
  await stage('.timer.paused').waitFor();
  await host.waitForTimeout(1300);
  assert((await timerNum()) === 20 && (await stage('.timer.paused').count()) === 1, 'a tile opened under the cover: its countdown waits, paused at 20');
  await host.keyboard.press('k');
  await stage('.cover').waitFor({ state: 'detached' });
  await timerAtMost(19);
  assert(true, 'uncovered, it runs');
  await ctx.close();
}

/** The next round, from a host page. */
async function nextRoundOf(p) {
  await p.waitForTimeout(450);
  await p.locator('.rn button').last().click();
  await p.waitForTimeout(450);
  const yes = p.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await playWithPlayers(page, 3);

  // Pre-game: single window says what viewers see, and the audience window is recommended.
  const warn = await page.locator('.pregame .exposed').innerText();
  assert(warn.includes('viewers see everything on screen') && warn.includes('wagers as you type them'), 'single-window mode warns that viewers see everything');
  assert(!(await page.locator('.modes').innerText()).includes('Recommended'), 'neither display mode is tagged “Recommended” (single window is the default)');

  // The stream cards' words, the caption, and a countdown on the Starting soon card (in the audience window).
  await page.getByPlaceholder('Starting soon…').fill('Back in a sec, chat');
  await page.getByPlaceholder('Starting soon…').press('Tab');
  await page.getByPlaceholder('Be right back').fill('Snack break');
  await page.getByPlaceholder('Be right back').press('Tab');
  await page.getByLabel(/Show the category and value on clue screens/).check();
  await page.getByLabel('Countdown minutes').fill('2');
  await page.getByRole('button', { name: '▶ Start countdown' }).click();
  assert(/^Starting in [12]:\d\d$/.test(await page.getByRole('timer').innerText()), 'the host sees the countdown’s time left');
  assert((await page.getByRole('button', { name: 'Stop countdown' }).count()) === 1, 'next to ■ Stop');
  // Reduce motion on stream is here too (the same setting as ⚙ Settings).
  await page.getByLabel(/Reduce motion on stream/).check();
  assert(await page.evaluate(() => document.documentElement.classList.contains('reduce-stream')), 'the pre-game screen has Reduce motion on stream');
  await page.getByLabel(/Reduce motion on stream/).uncheck();
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  await aud.locator('.soon-text').waitFor();
  assert((await aud.locator('.soon-text').innerText()) === 'Back in a sec, chat', 'the Starting soon card says what the host typed');
  const titlePx = await aud.locator('.soon .round-name').evaluate((e) => parseFloat(e.style.fontSize));
  assert(titlePx >= 100, `a short game title on the Starting soon card is big, not shrunk to the smallest size (${titlePx}px)`);
  assert(/^[12]:\d\d$/.test(await aud.locator('.soon-count').innerText()), 'and counts down to the start');
  assert(!(await page.locator('.pregame .exposed').count()), 'with the audience window open, no single-window warning');
  await page.locator('.mode', { hasText: 'Single window' }).click();
  if (!aud.isClosed()) await aud.waitForEvent('close', { timeout: 3000 });

  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();

  // A clue opening keeps the stage's size (the ✔ / ✘ buttons don't wrap the player row).
  const board = await stageSize();
  await page.locator('.stage-box .board .tile').nth(0).click();
  assert((await stageSize()) === board, `opening a clue keeps the stage at ${board}`);
  assert((await page.locator('.stage .caption').innerText()).includes('$200'), 'the clue screen has its category and value caption');
  await page.keyboard.press('1');
  assert((await stageSize()) === board, 'selecting a player keeps it too');

  // Score pops: over the score bar once back on the board, gone when the next clue opens.
  await page.keyboard.press('Enter');
  await page.locator('.stage .pop').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pop = await page.locator('.stage .pop').boundingBox();
  const bar = await page.locator('.stage .board-screen .score-area').boundingBox();
  const plate = await page.locator('.stage .plate').first().boundingBox();
  const num = await page.locator('.stage .plate').first().locator('.score').boundingBox();
  assert(
    pop && pop.x + pop.width / 2 > plate.x && pop.x + pop.width / 2 < plate.x + plate.width && pop.y + pop.height > bar.y && pop.y + pop.height <= num.y + 1,
    'back on the board, the score pop sits on its player’s plate, above the score',
  );
  await page.locator('.stage-box .board .tile').nth(1).click();
  // (Well before the pop's own 2.2 s, after its fade-out.)
  await page.waitForTimeout(700);
  assert(!(await page.locator('.stage .pop').count()), 'a new clue clears the score pops');

  // B covers (as K does) in a Jeopardy round too, instead of leaving the clue; the card says what the host typed.
  await page.keyboard.press('b');
  await page.locator('.stage .cover-card').waitFor();
  assert((await page.locator('.stage .cover-card').innerText()).includes('Snack break'), 'B covers the screen with the cover text');
  assert((await page.locator('.panel .status').innerText()).includes('Category 2'), 'B does not leave the clue');
  await page.keyboard.press('b');
  await page.keyboard.press('Escape');

  // The key list stays over the host panel in single-window mode: the stage is not covered. (With the controls hidden
  // by H, they come back for it, and go again after.)
  await page.keyboard.press('h');
  await page.locator('.play > .panel').waitFor({ state: 'detached' });
  await page.keyboard.press('?');
  // (It moves there once the host panel's box is measured, a frame after it opens.)
  await page.locator('.backdrop.in-panel [role="dialog"]').waitFor({ timeout: 3000 }).catch(() => {});
  const keys = await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).boundingBox();
  const stage = await page.locator('.stage-box').boundingBox();
  assert(keys.y >= stage.y + stage.height - 1, 'the keyboard shortcuts show under the stage, not over it');
  assert((await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).innerText()).includes('RPG'), 'the shortcuts are grouped by round');
  await page.keyboard.press('Escape');
  await page.locator('.play > .panel').waitFor({ state: 'detached' });
  assert(true, 'H had hidden the controls: closing the list hides them again');
  await page.keyboard.press('h');

  // 📊 Scores: copy the standings.
  await page.getByRole('button', { name: '📊 Scores' }).click();
  await page.getByRole('button', { name: '📋 Copy standings' }).click();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert(clip.includes('🥇') && clip.includes('Player 1'), `Copy standings puts the standings on the clipboard (${clip})`);
  await page.keyboard.press('Escape');

  // The Final: the stage keeps one size through its steps; the wager boxes say viewers can see them.
  await nextRound();
  // Its title card comes first: the stage already has the Final's size, and the status line says what's on screen.
  await page.locator('.title-card .round-name').waitFor();
  const finalSize = await stageSize();
  const status = await page.locator('.panel .status').innerText();
  assert(status.includes('Title card') && !status.includes('Category on screen'), `the status line says the title card is up (${status})`);
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.title-card .round-name').waitFor({ state: 'detached' });
  assert((await stageSize()) === finalSize, `starting the Final keeps the stage at ${finalSize}`);
  assert((await page.locator('.panel .status').innerText()).includes('Category on screen'), 'then the category is on screen');
  assert(!(await page.locator('.stage .final-label').count()), 'a Final without a category shows its name once');
  assert((await stageSize()) === finalSize, `taking wagers keeps the stage at ${finalSize}`);
  assert((await page.locator('.fj .exposed').innerText()).includes('Viewers can see this'), 'the wager boxes say viewers can see them');
  assert((await page.locator('.panel .status').innerText()).includes('viewers can see them'), 'so does the status line');
  assert((await page.locator('.stage .score-area .plate').count()) === 3, 'the scores stay on screen while wagers are taken');
  const ticks = await page.locator('.stage .score-area .tick').count();
  const boxes = page.locator('.fj .wagers input[data-wager]');
  for (let i = 0; i < 3; i++) await boxes.nth(i).fill('0');
  await page.locator('.fj').click({ position: { x: 2, y: 2 } });
  await page.waitForTimeout(200);
  assert((await page.locator('.stage .score-area .tick').count()) === 3 && ticks < 3, 'a ✔ shows on each plate once that wager is in');
  await page.getByRole('button', { name: 'Show question ▶' }).click();
  assert((await stageSize()) === finalSize, 'the question keeps it');
  await page.getByRole('button', { name: 'Reveal answer ▶' }).click();
  await page.getByRole('button', { name: 'Start player reveals ▶' }).click();
  assert((await stageSize()) === finalSize, 'and so do the reveals');
  const spot = await page.locator('.stage .spot-name').innerText();
  assert((await page.locator('.stage .score-area .plate.picker').innerText()).includes(spot), 'the score bar lights up the spotlit player');

  await crowd();
  await viewers();
  await tileTools();

  assert(!dialogs.length, 'no browser dialogs' + (dialogs.length ? ': ' + dialogs.join(' | ') : ''));
  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Stream E2E passed.');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stream-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
