// 🗜 in play (card-files spec §4.9), end to end in Chromium (WebM here, MP4 in CI's): a buzzer server of our own (buzzer/
// under `wrangler dev`, local) that takes card files up to 1 MB, so both 🤫 cards' GIFs are too big for it. Before the
// game, in one window, the checklist's line about one has 🗜 Make smaller: its window lists the file by its kind and
// size only, warns the stream may stutter, makes the copy, and the line goes; Ctrl+Z takes the copy back and Ctrl+Y
// puts it back ("↶ Undid Made a smaller copy of a GIF for phones"). In the game, with the audience window open, the
// host column's item has 🗜 Make smaller, whose window names the file (the host's window isn't on stream then); in one
// window, a tile's card sent to Ann's phone, too big, gets 🗜 Make smaller on its panel line: its window names no file,
// shows no preview, and the copy goes up to the phone, which shows it looping. Nothing in play names a file, the
// editor's game keeps both copies, and the audience window's game never lists one. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, forgetSeen, openGameFile, packGame, recordSeen, seenWhere, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';
import { gif, noise } from './mediafixtures.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Waits (up to `ms`: a slow machine takes its time) until pred() holds. */
const until = async (pred, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
  return !!(await pred());
};
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// ---------- Two GIFs of noise, made here: big for what they show (2.4 MB and 1.6 MB), each too big for 1 MB ----------

const dance = gif(320, 240, Array.from({ length: 24 }, () => ({ px: noise(320 * 240), delay: 10 })));
const twirl = gif(320, 240, Array.from({ length: 16 }, () => ({ px: noise(320 * 240), delay: 10 })));
if (twirl.length <= 1024 ** 2) throw new Error(`The GIF fixture came out ${twirl.length} bytes: it has to be over 1 MB`);

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const slide = (...elements) => ({ background: {}, elements });
// (Every file's name carries "zfnqj": nothing in play may show one in one window.)
const NAMES = ['zfnqj'];
const game = {
  id: 'g_play_copies',
  version: 2,
  title: 'Copies in play',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i] })),
  rounds: [
    {
      id: 'r1', name: 'Round 1', mode: 'board', values: [200], dailyDoubleCount: 0,
      categories: [
        {
          id: 'cat0', title: 'Memes',
          clues: [{ id: 'q1', value: null, type: 'standard', questionSlide: slide(text('Q')), answerSlide: slide(text('A')), cards: [{ id: 't1', to: 'picker', ...slide(text('Spin'), image('twirl', 300)) }] }],
        },
      ],
    },
  ],
  media: [
    { id: 'dance', name: 'dance-zfnqj.gif', mime: 'image/gif', size: dance.length, kind: 'image' },
    { id: 'twirl', name: 'twirl-zfnqj.gif', mime: 'image/gif', size: twirl.length, kind: 'image' },
  ],
  audio: {}, wheels: [], dice: [], theme: {},
  cards: [{ id: 'sc_tip', name: 'Tip', ...slide(text('Do this'), image('dance', 300)) }],
};
const packPath = resolve('test-results/play-copies.brainrot');
writeFileSync(packPath, await packGame(game, { dance, twirl }));

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-playcopies-', { vars: { FILE_MB: 1, ROOM_FILES_MB: 8, FILES_MB_PER_DAY: 40 } });
const { base } = buzzer;
let browser;
const errors = [];

try {
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(recordSeen);
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
    // The files in each copy of the game this window was sent (by name): the audience window's.
    window.__games = [];
    window.addEventListener('message', (e) => {
      if (e.source !== window && e.data?.type === 'game') window.__games.push((e.data.game?.media ?? []).map((m) => m.name));
    });
  }, base);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (errors.push(`dialog: ${d.message()}`), d.accept()));
  const states = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(f.payload);
        if (m.t === 'state') states.push(m.state);
      } catch {}
    }),
  );
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, packPath);
  await page.getByText(/^Opened “/).waitFor();
  await editorReady(page);

  const dialog = page.getByRole('dialog', { name: '🗜 Make a smaller copy for phones' });
  const row = (id) => dialog.locator(`[data-shrink-row="${id}"]`);
  /** Nothing on the page names a file, nor did since forgetSeen (it says where, when one did). */
  const namesNone = async (when) => {
    const found = await shownOf(page, NAMES);
    assert(!found.length, `${when}: nothing names a file${found.length ? `\n    ${(await seenWhere(page, NAMES)).join('\n    ')}` : ''}`);
  };
  /** The window's one row, made: its copy, once it says it's done. */
  const makeIt = async (id) => {
    await dialog.getByRole('button', { name: 'Make a copy', exact: true }).click();
    await row(id).getByText(/^✓ /).waitFor({ timeout: 60_000 });
    await dialog.locator('.modal-foot').getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  };

  // ---------- Before the game: the checklist ----------
  console.log('The pre-game checklist:');
  await page.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = page.getByRole('region', { name: 'Phone buzzers' });
  await roomCard.waitFor();
  // (The editor named the files: from here on, in one window, nothing may.)
  await forgetSeen(page);
  const checks = page.locator('details.checks');
  const tipLine = checks.locator('li', { hasText: '🤫 Card “Tip” has a GIF too big to send to phones' });
  await tipLine.waitFor({ state: 'attached' });
  if (!(await checks.evaluate((d) => d.open))) await checks.locator('summary').click();
  const said = (await tipLine.innerText()).replace(/\s+/g, ' ');
  assert(
    /^🤫 Card “Tip” has a GIF too big to send to phones \(2\.\d MB; this buzzer server takes files up to 1\.0 MB\): make a smaller copy for phones \(🗜\) or add it from a link 🗜 Make smaller$/.test(said),
    `its line offers 🗜 Make smaller (${said})`,
  );
  const tipButton = tipLine.getByRole('button', { name: '🗜 Make smaller' });
  assert((await tipButton.getAttribute('title')) === 'Make smaller copies of these files for phones', 'titled for what it does, naming no file');
  await tipButton.click();
  await dialog.waitFor();
  await row('dance').getByText(/^→ about /).waitFor();
  const rowSays = (await row('dance').innerText()).replace(/\s+/g, ' ');
  assert(/^🖼 a GIF · 2\.\d MB → about \d+ KB \(a looping video\)$/.test(rowSays), `one window: its row is the file’s kind and size, and its copy’s (${rowSays})`);
  assert((await dialog.locator('img, video, audio, canvas').count()) === 0, 'no preview, no thumbnail');
  const warns = (await dialog.locator('[data-shrink-stutter]').innerText()).trim();
  assert(warns === 'This works your computer hard for a minute or two; your stream may stutter. Best done in the editor before the show.', `it warns the stream may stutter (${warns})`);
  assert((await dialog.innerText()).includes('Ctrl+Z takes it back.'), 'and says Ctrl+Z takes it back');
  await namesNone('its window open');
  await makeIt('dance');
  assert(await until(async () => !(await tipLine.count())), 'made: the line about it goes');
  await namesNone('the copy made');

  console.log('Ctrl+Z and Ctrl+Y before the game:');
  /** A toast (or anything) the page said, by now. */
  const saidSoon = (t) => page.waitForFunction((t) => window.__seen.some((s) => s.includes(t)), t);
  await page.keyboard.press('Control+z');
  await saidSoon('↶ Undid Made a smaller copy of a GIF for phones');
  assert(true, 'Ctrl+Z: “↶ Undid Made a smaller copy of a GIF for phones”');
  await tipLine.waitFor({ state: 'attached' });
  assert(true, 'the game here follows: the line is back');
  await page.keyboard.press('Control+y');
  await saidSoon('↷ Redid Made a smaller copy of a GIF for phones');
  assert(await until(async () => !(await tipLine.count())), 'Ctrl+Y: the copy is back, and the line gone again');
  // (An MP4 where this browser makes H.264, as CI's does; a WebM in the test Chromium here.)
  let ext = '';
  const copyName = async () => ((await stored(page, 'editorDraft'))?.media ?? []).map((m) => m.name).find((n) => n.startsWith('dance-zfnqj (phones).'));
  assert(await until(async () => ['mp4', 'webm'].includes((ext = (await copyName())?.split('.').pop() ?? ''))), `the editor’s game has the copy (${await copyName()})`);

  // ---------- In the game ----------
  console.log('In the game:');
  const code = await startRoomOn(roomCard);
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
  const ann = await phoneCtx.newPage();
  ann.on('pageerror', (e) => errors.push(`[ann] ${e.message}`));
  await ann.goto(`${base}/${code}`);
  await ann.getByRole('heading', { name: 'Tap your name' }).waitFor();
  await ann.getByRole('button', { name: 'Ann', exact: true }).click();
  await ann.locator('#me').getByText('Ann').waitFor();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.stage-box .tile').first().waitFor();
  await page.locator('.stage-box .tile[aria-label^="Memes for $200"]').click();
  const tilePart = page.locator('.panel [data-tile-cards]');
  await tilePart.waitFor();

  // Two windows: the host column names the file, and so does its 🗜 window.
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('a')]);
  await aud.waitForLoadState('domcontentloaded');
  aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
  const item = page.locator('[data-partner-cards-info] .item', { hasText: 'twirl-zfnqj.gif' });
  await item.waitFor();
  const itemSays = (await item.innerText()).replace(/\s+/g, ' ');
  assert(/· 📋 copy it: too big for the buzzer server \(1 MB at most\) 🗜 Make smaller$/.test(itemSays), `two windows: the host column’s item has 🗜 Make smaller (${itemSays})`);
  await item.getByRole('button', { name: '🗜 Make smaller' }).click();
  await dialog.waitFor();
  await row('twirl').getByText(/^→ about /).waitFor();
  assert((await row('twirl').innerText()).includes('twirl-zfnqj.gif'), 'its window names the file (this window isn’t on stream)');
  assert((await dialog.locator('[data-shrink-stutter]').count()) === 1, 'and still warns the stream may stutter');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  await aud.waitForFunction(() => window.__games.length > 0);
  const audGames = await aud.evaluate(() => window.__games);
  assert(audGames.every((names) => names.length === 2 && !names.some((n) => n.includes('(phones)'))), `the audience window’s game never lists the copy made before the game (${audGames.at(-1)?.join(', ')})`);
  await aud.close();
  await page.locator('[data-partner-cards-info]').waitFor({ state: 'detached' });

  // One window again: the panel's line.
  await forgetSeen(page);
  const tileRow = tilePart.locator('[data-tile-card="1"]');
  await tileRow.getByRole('button', { name: 'Card 1 to Ann' }).click();
  await tileRow.getByRole('button', { name: 'Send card 1' }).click();
  const spin = () => states.at(-1)?.cards?.find((c) => c.text === 'Spin');
  assert(await until(() => !!spin()), `sent to Ann, its GIF left off (${JSON.stringify(spin()?.media)})`);
  const left = tilePart.locator('[data-card-left="1"]');
  await left.waitFor();
  assert((await left.innerText()) === '🖼 1 GIF won’t reach the phones (too big for the buzzer server)', `one window: its panel line counts it, never naming it (${await left.innerText()})`);
  const panelButton = left.locator('..').getByRole('button', { name: '🗜 Make smaller' });
  assert((await panelButton.getAttribute('title')) === 'Make smaller copies of these files for phones', 'and has 🗜 Make smaller, titled for what it does');
  await panelButton.click();
  await dialog.waitFor();
  const placed = await dialog.evaluate((d) => {
    const [b, p] = [d.parentElement.getBoundingClientRect(), document.querySelector('.play > .panel').getBoundingClientRect()];
    const box = (r) => [r.top, r.bottom, r.left, r.right].map(Math.round).join();
    return { inside: b.top >= p.top - 1 && b.bottom <= p.bottom + 1 && b.left >= p.left - 1 && b.right <= p.right + 1, backdrop: box(b), panel: box(p) };
  });
  assert(placed.inside, `one window, mid-game: its window opens in the host panel, never over the stage viewers see (${JSON.stringify(placed)})`);
  await row('twirl').getByText(/^→ about /).waitFor();
  const panelRow = (await row('twirl').innerText()).replace(/\s+/g, ' ');
  assert(/^🖼 a GIF · 1\.\d MB → about \d+ KB \(a looping video\)$/.test(panelRow), `its window names no file: the kind and size only (${panelRow})`);
  assert((await dialog.locator('img, video, audio, canvas').count()) === 0, 'and shows no preview');
  assert(!(await dialog.innerText()).includes('Ctrl+Z'), 'nor offers a Ctrl+Z that does nothing here');
  await namesNone('one window, its window open');
  await makeIt('twirl');
  assert(
    await until(() => spin()?.media?.[0]?.file && JSON.stringify(spin().media[0]) === JSON.stringify({ kind: 'video', file: spin().media[0].file, mime: `video/${ext}`, gif: true }), 60_000),
    `the card already out switches over: its copy goes up, as a GIF sent as a video (${JSON.stringify(spin()?.media)})`,
  );
  assert(await until(async () => !(await left.count())), 'and the panel line goes');
  await ann.getByRole('button', { name: 'Tap to see' }).tap();
  const v = ann.locator('.card .card-item video');
  await v.waitFor({ timeout: 60_000 });
  const shown = await v.evaluate(
    (v) =>
      new Promise((ok) => {
        const tell = () => ok({ loop: v.loop, controls: v.controls, muted: v.muted, w: v.videoWidth });
        if (v.readyState >= 1) tell();
        else v.addEventListener('loadedmetadata', tell, { once: true });
        setTimeout(tell, 10_000);
      }),
  );
  assert(shown.loop && !shown.controls && shown.muted && shown.w === 320, `Ann’s phone shows it like a GIF (${JSON.stringify(shown)})`);
  await namesNone('one window, the copy made and sent');

  // Kept: the game being played has both copies, and so does the editor's.
  const names = (g) => (g?.media ?? []).map((m) => m.name).sort();
  const want = [`dance-zfnqj (phones).${ext}`, 'dance-zfnqj.gif', `twirl-zfnqj (phones).${ext}`, 'twirl-zfnqj.gif'];
  assert(await until(async () => JSON.stringify(names((await stored(page, 'playSession'))?.game)) === JSON.stringify(want)), 'the game being played keeps both copies');
  assert(await until(async () => JSON.stringify(names(await stored(page, 'editorDraft'))) === JSON.stringify(want)), 'and so does the editor’s');
  const [aud2] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('a')]);
  await aud2.waitForLoadState('domcontentloaded');
  await aud2.waitForFunction(() => window.__games.length > 0);
  const audLater = await aud2.evaluate(() => window.__games);
  assert(audLater.every((names) => names.length === 2 && !names.some((n) => n.includes('(phones)'))), `the audience window’s game never lists one (${audLater.at(-1)?.join(', ')})`);
  await phoneCtx.close();

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Copies in play E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
