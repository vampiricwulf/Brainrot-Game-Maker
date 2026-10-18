// 🤫 Card files as big as the buzzer server takes (card-files spec §2.3, §3), end to end: a buzzer server of our own
// (buzzer/ under `wrangler dev`, local) set to 24 MB a file, 60 MB a room and 400 MB in any 24 hours. The editor
// asks it (/api/health) before any room is open, so the 📱 preview and the checklist go by its number; a room's
// welcome says it too, so with /api/health out of reach the editor goes by the defaults until a room is open, then
// by the room's. A server that says nothing (an older one) is taken as 16 MB a file, and ⚙ Settings › Test says so;
// its rooms show a GIF's 🗜 copy as a plain video, so the 📱 preview says phones get a small GIF as itself there. An
// address typed in ⚙ Settings is asked once it's done, never each half-typed one.
// A file over 16 MB that the server takes is a note, not a refusal: the 📱 preview and the editor's checklist say
// phones on mobile data may wait for it (the pre-game list doesn't), and in one window the host panel counts it,
// never naming it. Its upload (slowed down here) says how far it got, and a phone how much has come; ✖ Take back
// stops one partway (the room never lists it); and a file the room holds already isn't uploaded again. Needs
// `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, forgetSeen, openGameFile, packGame, recordSeen, roomKeys, shownOf, startBuzzer, startRoomOn } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const MB = 1024 * 1024;
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

// ---------- The game: a 🤫 Card with a 25 MB video and a 20 MB one, and two with a 17 MB one each (the same bytes in
// two files of the game). Padded: the app goes by size and type. ----------

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const video = (media, y) => ({ ...box(y), kind: 'video', media, fit: 'contain', autoplay: false, loop: false, muted: false, volume: 1 });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const files = { big: Buffer.alloc(25 * MB), mid: Buffer.alloc(20 * MB, 1), slow: Buffer.alloc(17 * MB, 2) };
files.twin = files.slow;
// A small GIF with a 🗜 copy for phones (a looping video: padded too).
files.pic = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
files.piccopy = Buffer.alloc(2048, 3);
/** A card file's id in the room: its SHA-256. */
const fileId = (b) => createHash('sha256').update(b).digest('hex');
// (Every file's name carries "zfnqj": none may show in the host panel in one window.)
const NAMES = ['zfnqj'];
const game = {
  id: 'g_card_limits',
  version: 2,
  title: 'Card limits',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i] })),
  rounds: [
    {
      id: 'r1', name: 'Round 1', mode: 'board', values: [200], dailyDoubleCount: 0,
      categories: [{ id: 'cat0', title: 'Movies', clues: [{ id: 'q1', value: null, type: 'standard', questionSlide: { background: {}, elements: [text('Q')] }, answerSlide: { background: {}, elements: [text('A')] } }] }],
    },
  ],
  media: [
    { id: 'big', name: 'big-zfnqj.mp4', mime: 'video/mp4', size: files.big.length, kind: 'video' },
    { id: 'mid', name: 'mid-zfnqj.mp4', mime: 'video/mp4', size: files.mid.length, kind: 'video' },
    { id: 'slow', name: 'slow-zfnqj.mp4', mime: 'video/mp4', size: files.slow.length, kind: 'video' },
    { id: 'twin', name: 'twin-zfnqj.mp4', mime: 'video/mp4', size: files.twin.length, kind: 'video' },
    { id: 'pic', name: 'pic-zfnqj.gif', mime: 'image/gif', size: files.pic.length, kind: 'image' },
    { id: 'piccopy', name: 'pic-zfnqj (phones).webm', mime: 'video/webm', size: files.piccopy.length, kind: 'video', phoneCopy: { of: 'pic', width: 320, height: 240 } },
  ],
  audio: {}, wheels: [], dice: [], theme: {},
  cards: [
    { id: 'sc_tip', name: 'Tip', background: {}, elements: [text('Look'), video('big', 300), video('mid', 500)] },
    { id: 'sc_slow', name: 'Slow', background: {}, elements: [text('Watch'), video('slow', 300)] },
    { id: 'sc_twin', name: 'Twin', background: {}, elements: [text('Again'), video('twin', 300)] },
    { id: 'sc_gif', name: 'Gif', background: {}, elements: [text('Dance'), image('pic', 300)] },
  ],
};
const packPath = resolve('test-results/card-limits.brainrot');
writeFileSync(packPath, await packGame(game, files));

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-cardlimits-', { vars: { FILE_MB: 24, ROOM_FILES_MB: 60, FILES_MB_PER_DAY: 400 } });
const { base, persist } = buzzer;
// A server that answers /api/health as an older buzzer server did (nothing about card files).
const older = createServer((req, res) => {
  res.writeHead(req.url === '/api/health' ? 200 : 404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(req.url === '/api/health' ? JSON.stringify({ ok: true, protocol: 1 }) : '{}');
});
await new Promise((ok) => older.listen(0, '127.0.0.1', ok));
const olderBase = `http://127.0.0.1:${older.address().port}`;
let browser;
const errors = [];

/** A new window of the app using the buzzer server at `server`, the game open in its editor. */
async function open(server, { noHealth = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(recordSeen);
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, server);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (errors.push(`dialog: ${d.message()}`), d.accept()));
  const asked = [];
  const answered = [];
  page.on('request', (r) => new URL(r.url()).pathname === '/api/health' && asked.push(r.url()));
  page.on('requestfinished', (r) => new URL(r.url()).pathname === '/api/health' && answered.push(r.url()));
  if (noHealth) await page.route('**/api/health', (r) => r.abort());
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, packPath);
  await page.getByText(/^Opened “/).waitFor();
  await editorReady(page);
  return { ctx, page, asked, answered };
}

/** A 🤫 Card's 📱 preview (the first, or card `id`), open: its notes about what won't reach a phone. */
async function preview(page, id) {
  await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
  await page.locator('[data-card-editor]').waitFor();
  if (id) await page.locator(`[data-saved-card="${id}"]`).click();
  const phone = page.getByRole('complementary', { name: 'Card on their phone' });
  if (!(await phone.count())) await page.getByRole('button', { name: '📱 On their phone' }).click();
  await phone.waitFor();
  return phone.locator('.notes li.warn');
}
// (A video stored in the game: 🗜 can make a smaller copy of it here, so the note says so, with its button.)
const bigNote = (name, size, max, older = false) =>
  `🎞 ${name} is ${size}: this buzzer server${older ? ' (an older one)' : ''} takes files up to ${max}. 🗜 Make a smaller copy for phones, or add it from a link (YouTube, Drive…) instead. 🗜 Make a smaller copy for phones`;
/** Waits until the preview's warnings are just these. */
async function notesAre(page, notes, want, what) {
  await page.waitForFunction(
    ({ want }) => JSON.stringify([...document.querySelectorAll('.phone-preview .notes li.warn')].map((li) => li.textContent.trim())) === JSON.stringify(want),
    { want },
    { timeout: 20_000 },
  ).catch(() => {});
  const got = (await notes.allInnerTexts()).map((t) => t.trim());
  assert(JSON.stringify(got) === JSON.stringify(want), `${what} (${JSON.stringify(got)})`);
}

try {
  browser = await chromium.launch({ executablePath });

  // ---------- No room open: the editor asks the server ----------
  console.log('The editor, no room open:');
  {
    const { ctx, page, asked } = await open(base);
    const notes = await preview(page);
    await notesAre(page, notes, [bigNote('big-zfnqj.mp4', '25.0 MB', '24.0 MB')], 'the 📱 preview goes by the server’s 24 MB: the 25 MB video is too big, the 20 MB one goes');
    assert(asked.length === 1, `asked once, before any room was open (${asked.length})`);
    // (The checklist is worked out a moment after a change: it says so once it has.)
    await page.locator('nav .problem', { hasText: '🤫 Card “Tip” has a video too big to send to phones (25.0 MB; this buzzer server takes files up to 24.0 MB): make a smaller copy for phones (🗜) or add it from a link' }).waitFor();
    const lines = await page.locator('nav .problem', { hasText: 'too big to send to phones' }).allInnerTexts();
    assert(lines.length === 1, `and so does the checklist, for the 25 MB one only (${lines.join(' | ')})`);
    // A GIF with a copy: phones get it as a small looping video, which they show like the GIF.
    await preview(page, 'sc_gif');
    await page.locator('.phone-preview .notes li', { hasText: /^📱 Phones get it as a small looping video \(2 KB\)\./ }).waitFor();
    assert(true, 'a GIF with a 🗜 copy: “📱 Phones get it as a small looping video”');
    await ctx.close();
  }

  // ---------- A room's welcome says it too ----------
  console.log('Its /api/health out of reach, then a room open:');
  {
    const { ctx, page } = await open(base, { noHealth: true });
    const notes = await preview(page);
    // Nothing heard from the server: the defaults, 90 MB a file. Both go, each with the note for a big file (once those
    // show, so would a warning).
    const slow = page.locator('.phone-preview .notes li.slow');
    for (const [name, size] of [['big-zfnqj.mp4', '25.0 MB'], ['mid-zfnqj.mp4', '20.0 MB']])
      await slow.filter({ hasText: `🎞 ${name} is ${size}: on WiFi or a computer it comes in seconds, but phones on mobile data may wait a while for it` }).waitFor();
    await notesAre(page, notes, [], 'nothing heard from the server: the 📱 preview goes by the defaults (90 MB), so both videos go, each with its note');
    await page.getByRole('button', { name: '▶ Play' }).click();
    const roomCard = page.getByRole('region', { name: 'Phone buzzers' });
    await startRoomOn(roomCard);
    await page.getByRole('button', { name: '◀ Back to editor' }).click();
    await page.locator('.room-bar').waitFor();
    await editorReady(page);
    const again = await preview(page);
    await notesAre(page, again, [bigNote('big-zfnqj.mp4', '25.0 MB', '24.0 MB')], 'with a room open, the 📱 preview goes by what its welcome said (24 MB)');
    await ctx.close();
  }

  // ---------- An older server ----------
  console.log('A server that doesn’t say:');
  {
    const { ctx, page, asked, answered } = await open(olderBase);
    const notes = await preview(page);
    assert(await until(() => answered.length === 1), `the editor asks it too, and it answers (${asked.length})`);
    await notesAre(page, notes, [bigNote('big-zfnqj.mp4', '25.0 MB', '16.0 MB', true), bigNote('mid-zfnqj.mp4', '20.0 MB', '16.0 MB', true)], 'one that says nothing is an older server: 16 MB a file, said so');
    // (Its rooms show a GIF's video copy as a plain video: phones get a GIF this small as itself.)
    await preview(page, 'sc_gif');
    await page.locator('.phone-preview .notes li', { hasText: '📱 This buzzer server is older: phones get the GIF itself, not its smaller video.' }).waitFor();
    assert(true, 'and it says phones get the GIF itself, not its copy');
    await page.getByRole('button', { name: /^More:/ }).click();
    await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Test' }).click();
    const said = settings.getByRole('status');
    await said.waitFor();
    assert((await said.innerText()).trim() === '✔ The buzzer server is answering (an older one: card files up to 16 MB)', `⚙ Settings › Test says so (${await said.innerText()})`);
    // Our own server's address typed a key at a time: only the whole address is asked, once it's done (Tab), never
    // each half-typed one (https://h, https://ht…). (Any other address isn't let out.)
    await page.route((u) => u.pathname === '/api/health' && u.origin !== base && u.origin !== olderBase, (r) => r.abort());
    await settings.getByLabel('Buzzer server').fill('');
    await settings.getByLabel('Buzzer server').pressSequentially(base);
    await settings.getByLabel('Buzzer server').press('Tab');
    assert(await until(() => asked.includes(`${base}/api/health`)), 'the address typed is asked once it’s done');
    await settings.getByRole('button', { name: 'Test' }).click();
    await settings.getByText('✔ The buzzer server is answering: card files up to 24 MB each, 60 MB a room').waitFor();
    assert(true, 'and of ours: “✔ The buzzer server is answering: card files up to 24 MB each, 60 MB a room”');
    const others = asked.filter((u) => u !== `${base}/api/health` && u !== `${olderBase}/api/health`);
    assert(!others.length, `no half-typed address is asked (${others.length}: ${others.slice(0, 3).join(', ')})`);
    await ctx.close();
  }

  // ---------- A 17 MB video on a server that takes 24 MB: a note, not a refusal; its upload ----------
  console.log('A 17 MB video, which the server takes:');
  {
    const { ctx, page } = await open(base);
    const slowNote = '🎞 slow-zfnqj.mp4 is 17.0 MB: on WiFi or a computer it comes in seconds, but phones on mobile data may wait a while for it (and use up their data).';
    const notes = await preview(page, 'sc_slow');
    await page.locator('.phone-preview .notes li.slow', { hasText: slowNote }).waitFor();
    await notesAre(page, notes, [], 'the 📱 preview: a note that phones on mobile data may wait for it, and no warning');
    const info = '🤫 Card “Slow” has a video of 17.0 MB: phones on mobile data may wait a while for it (WiFi is fine)';
    const line = page.locator('nav .problem.info', { hasText: info });
    await line.waitFor();
    assert((await line.count()) === 1, `the checklist: a note (ℹ), not a warning: “${info}”`);

    // Everything the host tells the room and hears from it, and every upload.
    const states = [];
    const listed = [];
    const posts = [];
    const stopped = [];
    const isUpload = (r) => r.method() === 'POST' && /\/api\/rooms\/[^/]+\/files$/.test(new URL(r.url()).pathname);
    page.on('websocket', (ws) => {
      ws.on('framesent', (f) => {
        try {
          const m = JSON.parse(f.payload);
          if (m.t === 'state') states.push(m.state);
        } catch {}
      });
      ws.on('framereceived', (f) => {
        try {
          const m = JSON.parse(f.payload);
          if (m.t === 'files') listed.push(m.ids);
        } catch {}
      });
    });
    page.on('request', (r) => isUpload(r) && posts.push(r.url()));
    page.on('requestfailed', (r) => isUpload(r) && stopped.push(r.failure()?.errorText ?? ''));
    const cards = () => states.at(-1)?.cards ?? [];

    await page.getByRole('button', { name: '▶ Play' }).click();
    const roomCard = page.getByRole('region', { name: 'Phone buzzers' });
    const code = await startRoomOn(roomCard);
    // The pre-game list keeps the warnings only: the 25 MB video, never the 17 MB one's note.
    const checks = page.locator('details.checks');
    await checks.locator('li', { hasText: '🤫 Card “Tip” has a video too big to send to phones' }).waitFor({ state: 'attached' });
    const pregame = (await checks.locator('li').allTextContents()).filter((t) => t.includes('🤫 Card “'));
    assert(pregame.length === 1 && pregame[0].includes('“Tip”') && !pregame.some((t) => t.includes('may wait')), `the pre-game list: the one too big, not the note (${pregame.join(' | ')})`);

    // Bob's phone, its downloads slowed down (2 MB/s), so a big file says how much has come.
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const bob = await phoneCtx.newPage();
    bob.on('pageerror', (e) => errors.push(`[bob] ${e.message}`));
    await bob.goto(`${base}/${code}`);
    await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await bob.getByRole('button', { name: 'Bob', exact: true }).click();
    await bob.locator('#me').getByText('Bob').waitFor();
    await (await phoneCtx.newCDPSession(bob)).send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 2 * MB, uploadThroughput: -1 });
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await page.locator('.stage-box .tile').first().waitFor();
    // (The editor named the files: from here on, in play, nothing may.)
    await forgetSeen(page);
    // The host's uploads slowed down too (3 MB/s): 17 MB takes a few seconds.
    await (await ctx.newCDPSession(page)).send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 3 * MB });

    const tools = page.locator('.panel .toolsrow');
    /** 🤫 Send a card… with the editor's 🤫 Card `id` to Bob: the dialog's line about its big file, then 📤 Send. */
    const send = async (id, label) => {
      await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Send a card' });
      await dialog.waitFor();
      await dialog.getByRole('radio', { name: 'One made in the editor' }).check();
      await dialog.getByRole('combobox', { name: 'The card to send' }).selectOption(`saved:${id}`);
      const slow = await dialog.locator('[data-card-slow]').innerText();
      await dialog.getByRole('button', { name: 'Bob', exact: true }).click();
      await dialog.getByRole('button', { name: '📤 Send' }).click();
      await dialog.locator('[data-card-said]').getByText(`${label} sent to Bob`).waitFor();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      return slow;
    };
    const SLOW = '📶 1 video is big: phones on mobile data may wait for it (WiFi is fine)';
    assert((await send('sc_slow', 'Card 1')) === SLOW, `one window: 🤫 Send a card… counts it, never naming it: “${SLOW}”`);
    const list = page.locator('[data-cards-out]');
    /** The list of cards out, open (🤫 Send a card… closes it). */
    const openList = async () => {
      if (!(await list.isVisible())) await tools.locator('[data-cards-out-count]').click();
      await list.waitFor();
    };
    await openList();
    assert((await list.locator('[data-card-slow="Card 1"]').innerText()) === SLOW, 'and so does its row in the cards out');
    // (Its row's words as they went by, since `from`: the percent changes faster than a look at it.)
    const sawUpload = (from = 0) => page.evaluate((from) => new Set((window.__seen ?? []).slice(from).flatMap((t) => t.match(/uploading 1 of 1 \((\d+)%\)…/)?.[1] ?? [])).size, from);
    assert(await until(async () => (await sawUpload()) >= 3, 30_000), `its upload says how far it got (“uploading 1 of 1 (…%)…”, ${await sawUpload()} percents)`);
    // Bob opens it while it comes: "🎞 Video coming…", then how much has come.
    await bob.getByRole('button', { name: 'Tap to see' }).tap();
    assert(await until(() => cards()[0]?.media?.[0]?.file === fileId(files.slow), 60_000), 'it goes up, and the card names the room’s file');
    const coming = () => bob.locator('.card .card-wait').textContent({ timeout: 1000 }).catch(() => '');
    assert(await until(async () => /^🎞 Video coming… [1-9]\d*%$/.test((await coming()) ?? ''), 30_000), `Bob’s phone says how much of it has come (“${await coming()}”)`);
    const upAfterOne = posts.length;
    assert(upAfterOne === 1, `one upload (${upAfterOne})`);

    // The same bytes again (another file of the game): the room holds it, so nothing goes up.
    await send('sc_twin', 'Card 2');
    assert(await until(() => cards().find((c) => c.text === 'Again')?.media?.[0]?.file === fileId(files.slow)), 'Card 2’s file is the one the room holds');
    assert(posts.length === upAfterOne, `nothing was uploaded for it (${posts.length - upAfterOne} uploads)`);

    // ✖ Take back while its file goes up: the upload stops, and the room never lists that file.
    const mark = await page.evaluate(() => window.__seen.length);
    await send('sc_tip', 'Card 3');
    await openList();
    assert(await until(async () => (await sawUpload(mark)) >= 2, 30_000), 'Card 3’s 20 MB video starts going up');
    await list.getByRole('button', { name: 'Take Card 3 back' }).click();
    assert(await until(() => stopped.length === 1), `✖ Take back stops its upload (${stopped.join()})`);
    const keys = async () => (await roomKeys(persist)).filter((k) => k.startsWith('p:')).length;
    assert(await until(async () => (await keys()) === 17), `the room keeps only the 17 MB file’s pieces (${await keys()} pieces)`);
    // (Past the 5 s a stopped upload would wait before it went again: there's no state to wait for, as nothing should go.)
    await sleep(6000);
    assert(posts.length === upAfterOne + 1 && !listed.flat().includes(fileId(files.mid)), `it doesn’t go again, and the room never listed it (${posts.length - upAfterOne} uploads)`);
    const found = await shownOf(page, NAMES);
    assert(!found.length, `one window: the host page never showed a file’s name (${found.join(', ')})`);
    await phoneCtx.close();
    await ctx.close();
  }

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Card limits E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  older.close();
  buzzer.stop();
}
