// 🤫 Card files as big as the buzzer server takes (card-files spec §2.3), end to end: a buzzer server of our own
// (buzzer/ under `wrangler dev`, local) set to 24 MB a file and 60 MB a room. The editor asks it (/api/health) before any room is open,
// so the 📱 preview and the checklist go by its number; a room's welcome says it too, so with /api/health out of reach
// the editor goes by the defaults until a room is open, then by the room's. A server that says nothing (an older one)
// is taken as 16 MB a file, and ⚙ Settings › Test says so. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, openGameFile, packGame, startBuzzer } from './helpers.mjs';

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

// ---------- The game: a 🤫 Card with a 25 MB video and a 20 MB one (padded: the app goes by size and type) ----------

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const video = (media, y) => ({ ...box(y), kind: 'video', media, fit: 'contain', autoplay: false, loop: false, muted: false, volume: 1 });
const files = { big: Buffer.alloc(25 * MB), mid: Buffer.alloc(20 * MB) };
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
    { id: 'big', name: 'big-clip.mp4', mime: 'video/mp4', size: files.big.length, kind: 'video' },
    { id: 'mid', name: 'mid-clip.mp4', mime: 'video/mp4', size: files.mid.length, kind: 'video' },
  ],
  audio: {}, wheels: [], dice: [], theme: {},
  cards: [{ id: 'sc_tip', name: 'Tip', background: {}, elements: [text('Look'), video('big', 300), video('mid', 500)] }],
};
const packPath = resolve('test-results/card-limits.brainrot');
writeFileSync(packPath, await packGame(game, files));

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-cardlimits-', { vars: { FILE_MB: 24, ROOM_FILES_MB: 60 } });
const { base } = buzzer;
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

/** The 🤫 Card's 📱 preview, open: its notes about what won't reach a phone. */
async function preview(page) {
  await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
  await page.locator('[data-card-editor]').waitFor();
  const phone = page.getByRole('complementary', { name: 'Card on their phone' });
  if (!(await phone.count())) await page.getByRole('button', { name: '📱 On their phone' }).click();
  await phone.waitFor();
  return phone.locator('.notes li.warn');
}
const bigNote = (name, size, max) => `🎞 ${name} is ${size}: phones get files up to ${max}. Add it from a link (YouTube, Drive…) instead.`;
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
    await notesAre(page, notes, [bigNote('big-clip.mp4', '25.0 MB', '24.0 MB')], 'the 📱 preview goes by the server’s 24 MB: the 25 MB video is too big, the 20 MB one goes');
    assert(asked.length === 1, `asked once, before any room was open (${asked.length})`);
    // (The checklist is worked out a moment after a change: it says so once it has.)
    await page.locator('nav .problem', { hasText: '🤫 Card “Tip” has a video too big for phones (25.0 MB; phones get files up to 24.0 MB)' }).waitFor();
    const lines = await page.locator('nav .problem', { hasText: 'too big for phones' }).allInnerTexts();
    assert(lines.length === 1, `and so does the checklist, for the 25 MB one only (${lines.join(' | ')})`);
    await ctx.close();
  }

  // ---------- A room's welcome says it too ----------
  console.log('Its /api/health out of reach, then a room open:');
  {
    const { ctx, page } = await open(base, { noHealth: true });
    const notes = await preview(page);
    await notesAre(page, notes, [bigNote('big-clip.mp4', '25.0 MB', '16.0 MB'), bigNote('mid-clip.mp4', '20.0 MB', '16.0 MB')], 'nothing heard from the server: the 📱 preview goes by the defaults (16 MB)');
    await page.getByRole('button', { name: '▶ Play' }).click();
    const roomCard = page.getByRole('region', { name: 'Phone buzzers' });
    await roomCard.getByRole('button', { name: '▶ Start the room' }).click();
    await roomCard.locator('[aria-label^="Room code "]').waitFor();
    await page.getByRole('button', { name: '◀ Back to editor' }).click();
    await page.locator('.room-bar').waitFor();
    await editorReady(page);
    const again = await preview(page);
    await notesAre(page, again, [bigNote('big-clip.mp4', '25.0 MB', '24.0 MB')], 'with a room open, the 📱 preview goes by what its welcome said (24 MB)');
    await ctx.close();
  }

  // ---------- An older server ----------
  console.log('A server that doesn’t say:');
  {
    const { ctx, page, asked, answered } = await open(olderBase);
    const notes = await preview(page);
    assert(await until(() => answered.length === 1), `the editor asks it too, and it answers (${asked.length})`);
    await notesAre(page, notes, [bigNote('big-clip.mp4', '25.0 MB', '16.0 MB'), bigNote('mid-clip.mp4', '20.0 MB', '16.0 MB')], 'one that says nothing is an older server: 16 MB a file');
    await page.getByRole('button', { name: /^More:/ }).click();
    await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Test' }).click();
    const said = settings.getByRole('status');
    await said.waitFor();
    assert((await said.innerText()).trim() === '✔ The buzzer server is answering (an older one: card files up to 16 MB)', `⚙ Settings › Test says so (${await said.innerText()})`);
    await settings.getByLabel('Buzzer server').fill(base);
    await settings.getByLabel('Buzzer server').press('Tab');
    await settings.getByRole('button', { name: 'Test' }).click();
    await settings.getByText('✔ The buzzer server is answering: card files up to 24 MB each, 60 MB a room').waitFor();
    assert(true, 'and of ours: “✔ The buzzer server is answering: card files up to 24 MB each, 60 MB a room”');
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
