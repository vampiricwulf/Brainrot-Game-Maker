// 🗜 Smaller copies for phones (card-files spec §4), end to end in the test Chromium, which makes WebM (VP9) only: a
// 🤫 card's GIF made into a small looping video from 🖼 Media, which plays; Ctrl+Z and Ctrl+Y; Stop partway leaves
// nothing; one waiting behind another, the header's pill, and the toast at the end, none naming the file; ▶ Play asks
// first while one is made. Then in play, with a buzzer server of our own (buzzer/ under `wrangler dev`, local): the
// card goes up as the copy, the phone shows it looping, silent and without controls, and the audience window's copy of
// the game never lists it. The MP4 (H.264) path needs a browser that makes H.264: checked by hand. Needs `npm ci` in
// buzzer/.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, forgetSeen, openGameFile, packGame, recordSeen, startBuzzer, startRoomOn } from './helpers.mjs';

const { GifWriter } = createRequire(import.meta.url)('omggif');
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

// ---------- Two GIFs, made here: noise, so they're big for what they show (about 2.5 MB each) ----------

let x = 2463534242;
const noise = (n) =>
  Uint8Array.from({ length: n }, () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x & 255;
  });
const palette = Array.from({ length: 256 }, (_, i) => (((i * 37) & 255) << 16) | (((i * 91) & 255) << 8) | ((i * 53) & 255));
function gif(w, h, frames) {
  const buf = new Uint8Array(w * h * 2 * frames.length + 100_000);
  const g = new GifWriter(buf, w, h, { palette, loop: 0 });
  for (const f of frames) g.addFrame(f.x ?? 0, f.y ?? 0, f.w ?? w, f.h ?? h, f.px, { delay: f.delay, disposal: 1 });
  return Buffer.from(buf.slice(0, g.end()));
}
// 2.4 s of it, on a 🤫 card.
const dance = gif(320, 240, Array.from({ length: 24 }, () => ({ px: noise(320 * 240), delay: 10 })));
// 2,000 frames (as many as 🗜 takes) of small changes over a big picture: long enough to stop partway, or to wait
// behind, while the page's work is slowed down too (below).
const long = gif(1024, 720, [
  ...Array.from({ length: 2 }, () => ({ px: noise(1024 * 720), delay: 2 })),
  ...Array.from({ length: 1998 }, (_, i) => ({ x: (i * 16) % 1008, y: (Math.floor(i / 63) * 16) % 704, w: 16, h: 16, px: noise(256), delay: 2 })),
]);

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
// (Every file's name carries "zfnqj": no toast, History row, pill or question may show one.)
const game = {
  id: 'g_phone_copies',
  version: 2,
  title: 'Phone copies',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i] })),
  rounds: [
    {
      id: 'r1', name: 'Round 1', mode: 'board', values: [200], dailyDoubleCount: 0,
      categories: [{ id: 'cat0', title: 'Memes', clues: [{ id: 'q1', value: null, type: 'standard', questionSlide: { background: {}, elements: [text('Q')] }, answerSlide: { background: {}, elements: [text('A')] } }] }],
    },
  ],
  media: [
    { id: 'dance', name: 'dance-zfnqj.gif', mime: 'image/gif', size: dance.length, kind: 'image' },
    { id: 'long', name: 'long-zfnqj.gif', mime: 'image/gif', size: long.length, kind: 'image' },
  ],
  audio: {}, wheels: [], dice: [], theme: {},
  cards: [{ id: 'sc_tip', name: 'Tip', background: {}, elements: [text('Do this'), image('dance', 300)] }],
};
const packPath = resolve('test-results/phone-copies.brainrot');
writeFileSync(packPath, await packGame(game, { dance, long }));
const MB = (n) => `${(n / 1024 ** 2).toFixed(1)} MB`;

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-phonecopies-', { vars: { FILE_MB: 4, ROOM_FILES_MB: 12, FILES_MB_PER_DAY: 50 } });
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
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, packPath);
  await page.getByText(/^Opened “/).waitFor();
  await editorReady(page);

  const dialog = page.getByRole('dialog', { name: '🗜 Make a smaller copy for phones' });
  const card = (id) => page.locator(`[data-place="media:${id}"]`);
  const copyLine = (id) => card(id).locator('[data-phone-copy]');
  const historyCount = async () => Number((await page.locator('nav > button', { hasText: '🕘 History' }).innerText()).match(/\((\d+)\)/)?.[1] ?? 0);
  const media = async () => {
    await page.locator('nav > button', { hasText: '🖼 Media' }).click();
    await card('dance').waitFor();
  };
  /** 🗜 on a file's card, its dialog open, once it says what it will make. */
  const openShrink = async (id, button = '🗜 Make smaller…') => {
    await card(id).getByRole('button', { name: button }).click();
    await dialog.waitFor();
    await dialog.getByText(/^A small looping video, \d+×\d+: about /).waitFor();
  };
  /** The copy the card's ▶ plays: its type, size, and whether a video element opens it, looping (by its blob). */
  const copyOf = async (id) => {
    await copyLine(id).getByRole('button', { name: 'Watch its copy for phones' }).click();
    const v = card(id).getByLabel('Its smaller copy for phones');
    await v.waitFor();
    const r = await v.evaluate(async (v) => {
      const blob = await (await fetch(v.src)).blob();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const meta = await new Promise((ok) => {
        const t = document.createElement('video');
        t.muted = true;
        t.onloadedmetadata = () => ok({ w: t.videoWidth, h: t.videoHeight, seconds: t.duration });
        t.onerror = () => ok(null);
        t.src = URL.createObjectURL(blob);
      });
      return { type: blob.type, size: blob.size, hash, meta, loop: v.loop };
    });
    await copyLine(id).getByRole('button', { name: 'Stop watching its copy for phones' }).click();
    return r;
  };

  // ---------- 🗜 on 🖼 Media ----------
  console.log('🗜 Make smaller… on a GIF in 🖼 Media:');
  await media();
  assert((await card('dance').getByRole('button', { name: '🗜 Make smaller…' }).count()) === 1, `a GIF over 2 MB gets 🗜 Make smaller… (${MB(dance.length)})`);
  await openShrink('dance');
  const says = (await dialog.innerText()).replace(/\s+/g, ' ');
  assert(says.includes('dance-zfnqj.gif') && says.includes('2.4 s') && says.includes('320×240'), `its dialog names the file, its length and size (the editor isn't on stream): ${says.slice(0, 160)}`);
  assert(says.includes('Phones get the copy; the show keeps this file as it is.'), 'and says the show keeps the file');
  assert(says.includes('Made as a WebM (VP9). This browser makes WebM videos: some iPhones may not play them.'), 'this browser makes WebM, and it says some iPhones may not play it');
  const before = await historyCount();
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await dialog.locator('[data-shrink-done]').waitFor({ timeout: 60_000 });
  const done = await dialog.locator('[data-shrink-done]').innerText();
  assert(/^\d+(\.\d)? (KB|MB) \(was 2\.\d MB\)\. Phones get this copy \(Ctrl\+Z takes it back\)\.$/.test(done), `it says how big it came out (${done})`);
  await dialog.getByRole('button', { name: '▶ Watch it' }).click();
  await dialog.getByLabel('The copy for phones').waitFor();
  await close();
  const first = await copyOf('dance');
  assert(first.type === 'video/webm' && first.size < dance.length / 5, `the copy is a WebM under a fifth of the GIF (${first.size} bytes of ${dance.length})`);
  assert(first.meta?.w === 320 && first.meta.h === 240 && Math.abs(first.meta.seconds - 2.4) < 0.3, `and it plays: ${JSON.stringify(first.meta)}`);
  const line = (await copyLine('dance').innerText()).replace(/\s+/g, ' ');
  assert(/^📱 Phone copy · \d+ KB · 320×240 WebM/.test(line), `the GIF's card says phones get a copy (${line})`);
  const header = (await page.locator('.library .page-header').innerText()).replace(/\s+/g, ' ');
  assert(header.includes('(1 phone copy)'), `the header counts it (${header.slice(0, 90)})`);
  assert((await page.locator('.library .card').count()) === 2, 'and it has no card of its own');
  assert((await historyCount()) === before + 1, 'one step in History');

  // ---------- Ctrl+Z, Ctrl+Y ----------
  console.log('Ctrl+Z and Ctrl+Y:');
  const notice = page.locator('.history-notice');
  await page.keyboard.press('Control+z');
  await copyLine('dance').waitFor({ state: 'detached' });
  assert((await notice.innerText()).replace(/\s+/g, ' ').includes('↶ Undid Made a smaller copy of a GIF for phones'), `Ctrl+Z takes it out, saying so (${(await notice.innerText()).replace(/\s+/g, ' ')})`);
  assert(!(await notice.innerText()).includes('zfnqj'), 'naming no file');
  await page.keyboard.press('Control+y');
  await copyLine('dance').waitFor();
  assert((await copyOf('dance')).hash === first.hash, 'Ctrl+Y puts the same copy back');

  // ---------- Stop partway ----------
  console.log('Stop partway:');
  // (The page's work slowed down 4 times, so the long one is still being made while the clicks below are.)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await openShrink('long');
  const steps = await historyCount();
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  const progress = dialog.locator('[data-shrink-progress]');
  await progress.filter({ hasText: /Making it… \d+%/ }).waitFor({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Stop', exact: true }).click();
  await dialog.locator('[data-shrink-stopped]', { hasText: 'Stopped: nothing was changed.' }).waitFor();
  await close();
  assert((await copyLine('long').count()) === 0 && (await historyCount()) === steps, 'Stop leaves nothing: no copy, no step');

  // ---------- One waiting behind another; the pill; the toast ----------
  console.log('One waiting behind another:');
  await forgetSeen(page);
  await openShrink('long');
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await progress.filter({ hasText: /Making it… \d+%/ }).waitFor({ timeout: 60_000 });
  await close();
  const pill = page.locator('[data-job-pill]');
  await pill.getByText('🗜 Making a smaller copy for phones…').waitFor();
  assert(true, 'closed while it works, it carries on: the header’s pill says so');
  await openShrink('dance', '🗜 Again');
  await dialog.getByRole('button', { name: 'Make it again' }).click();
  await progress.filter({ hasText: 'Waiting for the other file to finish…' }).waitFor();
  await close();
  await pill.filter({ hasText: '(+1 waiting)' }).waitFor();
  assert(true, 'the second waits its turn: “(+1 waiting)”');
  await pill.getByRole('button', { name: 'Stop' }).click();
  const toast = page.locator('.toast', { hasText: '🗜 Phones get the smaller copy now' });
  await toast.waitFor({ timeout: 60_000 });
  const said = await toast.innerText();
  assert(/^🗜 Phones get the smaller copy now: \d+ KB instead of 2\.\d MB \(Ctrl\+Z takes it back\)$/.test(said), `the pill’s Stop stops the first; the second is made, and says so in a toast (${said})`);
  const toasts = await page.evaluate(() => (window.__seen ?? []).filter((t) => /^(🗜|Stopped)/.test(t)));
  const named = toasts.filter((t) => t.includes('zfnqj'));
  assert(toasts.length >= 2 && !named.length, `no toast or pill names a file (${toasts.length} said${named.length ? `: ${named.join(' | ')}` : ''})`);
  await page.locator('nav > button', { hasText: '🕘 History' }).click();
  const rows = (await page.locator('main').innerText()).split('\n').filter((t) => t.includes('smaller copy'));
  assert(rows.length >= 2 && !rows.some((t) => t.includes('zfnqj')), `nor does History (${rows.join(' | ')})`);
  await media();
  const copy = await copyOf('dance');
  assert(copy.type === 'video/webm' && copy.hash, 'the GIF has its copy (made again)');

  // ---------- ▶ Play while one is made ----------
  console.log('▶ Play while a copy is made:');
  await openShrink('long');
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await progress.filter({ hasText: /Making it… \d+%/ }).waitFor({ timeout: 60_000 });
  await close();
  const ask = page.getByRole('alertdialog');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await ask.waitFor();
  // (Its question is the window's title.)
  const q = (await ask.innerText()).replace(/\s+/g, ' ');
  assert(
    q.startsWith('Stop it and start the game? ') && /🗜 A smaller copy for phones is still being made \(\d+%\)\. Nothing is changed by stopping, and it can be done again afterwards\./.test(q),
    `▶ Play asks first (${q.slice(0, 170)})`,
  );
  await ask.getByRole('button', { name: 'Keep working' }).click();
  await ask.waitFor({ state: 'detached' });
  assert((await pill.count()) === 1 && (await page.locator('.editor').count()) === 1, 'Keep working: still in the editor, still working');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await ask.getByRole('button', { name: 'Stop it and play' }).click();
  const roomCard = page.getByRole('region', { name: 'Phone buzzers' });
  await roomCard.waitFor();
  assert(true, 'Stop it and play: the game starts');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // ---------- In play: the phone gets the copy ----------
  console.log('In play:');
  const states = [];
  const posts = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(f.payload);
        if (m.t === 'state') states.push(m.state);
      } catch {}
    }),
  );
  page.on('request', (r) => r.method() === 'POST' && /\/files$/.test(new URL(r.url()).pathname) && posts.push(r.url()));
  const code = await startRoomOn(roomCard);
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
  const bob = await phoneCtx.newPage();
  bob.on('pageerror', (e) => errors.push(`[bob] ${e.message}`));
  await bob.goto(`${base}/${code}`);
  await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
  await bob.getByRole('button', { name: 'Bob', exact: true }).click();
  await bob.locator('#me').getByText('Bob').waitFor();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.stage-box .tile').first().waitFor();
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('a')]);
  await aud.waitForLoadState('domcontentloaded');
  aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
  await aud.waitForFunction(() => window.__games.length > 0);

  const tools = page.locator('.panel .toolsrow');
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  const send = page.getByRole('dialog', { name: 'Send a card' });
  await send.waitFor();
  await send.getByRole('radio', { name: 'One made in the editor' }).check();
  await send.getByRole('combobox', { name: 'The card to send' }).selectOption('saved:sc_tip');
  await send.getByRole('button', { name: 'Bob', exact: true }).click();
  await send.getByRole('button', { name: '📤 Send' }).click();
  await send.locator('[data-card-said]').getByText('Card 1 sent to Bob').waitFor();
  await page.keyboard.press('Escape');
  const sentMedia = () => states.at(-1)?.cards?.[0]?.media;
  assert(await until(() => sentMedia()?.[0]?.file === copy.hash, 60_000), `the card goes up as the copy (${JSON.stringify(sentMedia())})`);
  assert(JSON.stringify(sentMedia()) === JSON.stringify([{ kind: 'video', file: copy.hash, mime: 'video/webm', gif: true }]), 'marked as a GIF sent as a video');
  assert(posts.length === 1, `one file is uploaded, the copy (${posts.length})`);
  await bob.getByRole('button', { name: 'Tap to see' }).tap();
  const v = bob.locator('.card .card-item video');
  await v.waitFor({ timeout: 60_000 });
  const shown = await v.evaluate(
    (v) =>
      new Promise((ok) => {
        const tell = () => ok({ loop: v.loop, controls: v.controls, muted: v.muted, playing: !v.paused, w: v.videoWidth, label: v.getAttribute('aria-label') });
        if (v.readyState >= 1 && !v.paused) tell();
        else v.addEventListener('playing', tell, { once: true });
        setTimeout(tell, 10_000);
      }),
  );
  assert(shown.loop && !shown.controls && shown.muted && shown.playing && shown.w === 320, `Bob’s phone shows it like a GIF: looping, silent, playing, no controls (${JSON.stringify(shown)})`);
  assert((await bob.getByRole('button', { name: '🔊 Tap for sound' }).count()) === 0 && shown.label === 'Picture', `with no 🔊 button, and named a picture (“${shown.label}”)`);
  const audGames = await aud.evaluate(() => window.__games);
  assert(audGames.length > 0 && audGames.every((names) => names.length === 2 && !names.some((n) => n.includes('(phones)'))), `the audience window’s copy of the game never lists the copy (${audGames.at(-1)?.join(', ')})`);
  await phoneCtx.close();

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Phone copies E2E passed.');

  /** Its ✕ (while it works, the work carries on). */
  async function close() {
    await dialog.locator('.modal-x').click();
    await dialog.waitFor({ state: 'detached' });
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
