// 🗜 Smaller copies for phones (card-files spec §4), end to end in Chromium: the test Chromium here makes WebM (VP9) and
// Opus only, CI's makes MP4 (H.264) too, and the test follows what the dialog says it makes: a 🤫 card's GIF made into a
// small looping video from 🖼 Media, which plays; Ctrl+Z and Ctrl+Y; Stop partway leaves nothing; one waiting behind
// another, the header's pill, and the toast at the end, none naming the file. Then videos and sounds (stage 6): 🖼
// Media's "2 files are big for phones" makes both copies at once; a 4 s 720p WebM made at 480p, which plays and seeks,
// then only the part its card plays (1 to 3 s); a WAV made an OGG (Opus), or an M4A (AAC) where the browser makes AAC;
// a video phones can't play (a .mov with a WebM inside) repackaged as a WebM from the 📱 preview (↻, stage 6b.2), and a
// FLAC (which nothing repackages) given a copy they can play from it (🗜), each clearing the checklist's line. One made
// while a drag on a slide is held waits for it: a step of its own, after the drag's. ▶ Play asks first while one is
// made. Then in play, with a buzzer server of our own (buzzer/ under `wrangler dev`, local): the card goes up as the
// copy, the phone shows it looping, silent and without controls (with reduced motion, or on a phone that won't start
// it by itself, still with "▶ Play"), and the audience window's copy of the game never lists it. Needs `npm ci` in
// buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, forgetSeen, openGameFile, packGame, recordSeen, startBuzzer, startRoomOn } from './helpers.mjs';
import { clip, fixturePage, flac, gif, noise, wav } from './mediafixtures.mjs';

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

// 2.4 s of it, on a 🤫 card.
const dance = gif(320, 240, Array.from({ length: 24 }, () => ({ px: noise(320 * 240), delay: 10 })));
// 2,000 frames (as many as 🗜 takes) of small changes over a big picture: long enough to stop partway, or to wait
// behind, while the page's work is slowed down too (below).
const long = gif(1024, 720, [
  ...Array.from({ length: 2 }, () => ({ px: noise(1024 * 720), delay: 2 })),
  ...Array.from({ length: 1998 }, (_, i) => ({ x: (i * 16) % 1008, y: (Math.floor(i / 63) * 16) % 704, w: 16, h: 16, px: noise(256), delay: 2 })),
]);

// 20 s of a tone, 3.5 MB: big for the buzzer server below (3 MB a file).
const song = wav(20);
// 2 s of a tone in a FLAC (32 KB): phones take no FLAC, and nothing repackages one.
const tone = flac(4);

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const plays = { autoplay: false, loop: false, muted: false, volume: 1 };
const videoEl = (media, y, more = {}) => ({ ...box(y), kind: 'video', media, fit: 'contain', ...plays, ...more });
const soundEl = (media, y) => ({ ...box(y), kind: 'audio', media, visible: true, ...plays });
// (Every file's name carries "zfnqj": no toast, History row, pill or question may show one.)
const gameWith = (movie, mov) => ({
  id: 'g_phone_copies',
  version: 2,
  title: 'Phone copies',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
  rounds: [
    {
      id: 'r1', name: 'Round 1', mode: 'board', values: [200], dailyDoubleCount: 0,
      categories: [{ id: 'cat0', title: 'Memes', clues: [{ id: 'q1', value: null, type: 'standard', questionSlide: { background: {}, elements: [text('Q')] }, answerSlide: { background: {}, elements: [text('A')] } }] }],
    },
  ],
  media: [
    { id: 'dance', name: 'dance-zfnqj.gif', mime: 'image/gif', size: dance.length, kind: 'image' },
    { id: 'long', name: 'long-zfnqj.gif', mime: 'image/gif', size: long.length, kind: 'image' },
    { id: 'movie', name: 'movie-zfnqj.webm', mime: 'video/webm', size: movie.length, kind: 'video' },
    { id: 'song', name: 'song-zfnqj.wav', mime: 'audio/wav', size: song.length, kind: 'audio' },
    // (A WebM inside, as phones can't tell: a .mov is a kind they don't take.)
    { id: 'mov', name: 'clip-zfnqj.mov', mime: 'video/quicktime', size: mov.length, kind: 'video' },
    { id: 'tone', name: 'tone-zfnqj.flac', mime: 'audio/flac', size: tone.length, kind: 'audio' },
  ],
  audio: {}, wheels: [], dice: [], theme: {},
  cards: [
    { id: 'sc_tip', name: 'Tip', background: {}, elements: [text('Do this'), image('dance', 300)] },
    // Its card plays 1 to 3 s of it.
    { id: 'sc_movie', name: 'Movie', background: {}, elements: [text('Watch'), videoEl('movie', 300, { startAt: 1, endAt: 3 })] },
    { id: 'sc_song', name: 'Song', background: {}, elements: [text('Hum'), soundEl('song', 300)] },
    { id: 'sc_mov', name: 'Mov', background: {}, elements: [text('Look'), videoEl('mov', 300)] },
    { id: 'sc_tone', name: 'Tone', background: {}, elements: [text('Sing'), soundEl('tone', 300)] },
  ],
});
const packPath = resolve('test-results/phone-copies.brainrot');
const MB = (n) => `${(n / 1024 ** 2).toFixed(1)} MB`;

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// (3 MB a file: the 4 MB video and the 3.5 MB sound are big for it, the GIFs aren't.)
const buzzer = await startBuzzer('buzzer-phonecopies-', { vars: { FILE_MB: 3, ROOM_FILES_MB: 12, FILES_MB_PER_DAY: 50 } });
const { base } = buzzer;
let browser;
const errors = [];

try {
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  // The videos, made in a blank page of their own: 4 s of 720p noise at 8 Mbps (about 4 MB) with an Opus tone, and a
  // second of a small one.
  const fx = await fixturePage(ctx);
  const movie = await clip(fx, { w: 1280, h: 720, seconds: 4, bitrate: 8_000_000 });
  const mov = await clip(fx, { w: 320, h: 240, seconds: 1, bitrate: 600_000, audio: false });
  await fx.close();
  if (movie.length <= 3 * 1024 ** 2) throw new Error(`The video fixture came out ${movie.length} bytes: it has to be over 3 MB`);
  writeFileSync(packPath, await packGame(gameWith(movie, mov), { dance, long, movie, song, mov, tone }));
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
  // What screen readers are told (the page's live region keeps its last words in data-said).
  await page.evaluate(() => {
    window.__said = [];
    const host = document.getElementById('live-region');
    new MutationObserver(() => host.dataset.said && window.__said.push(host.dataset.said)).observe(host, { attributes: true, attributeFilter: ['data-said'] });
  });
  /** The words of the focused element ('' for the page itself: the focus was lost). */
  const focused = () => page.evaluate(() => (document.activeElement === document.body ? '' : (document.activeElement?.textContent?.trim() ?? '')));

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
  /**
   * The copy the card's ▶ plays: its type, size, and whether a video (or sound) element opens it, how long and big it
   * is, looping or not (by its blob), and where it got to when sent to `seek` seconds.
   */
  const copyOf = async (id, seek) => {
    await copyLine(id).getByRole('button', { name: 'Watch its copy for phones' }).click();
    const v = card(id).getByLabel('Its smaller copy for phones');
    await v.waitFor();
    const r = await v.evaluate(async (v, seek) => {
      const blob = await (await fetch(v.src)).blob();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const t = document.createElement(v.tagName.toLowerCase());
      t.muted = true;
      const meta = await new Promise((ok) => {
        t.onloadedmetadata = () => ok({ w: t.videoWidth ?? 0, h: t.videoHeight ?? 0, seconds: t.duration });
        t.onerror = () => ok(null);
        t.src = URL.createObjectURL(blob);
      });
      if (meta && seek !== undefined)
        meta.at = await new Promise((ok) => {
          t.onseeked = () => ok(t.currentTime);
          setTimeout(() => ok(null), 10_000);
          t.currentTime = seek;
        });
      return { type: blob.type, size: blob.size, hash, meta, loop: v.loop };
    }, seek);
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
  // What this browser makes, as the dialog says (from what it can encode): an MP4 (H.264) where it can (CI's Chromium),
  // else a WebM (the test Chromium here). What follows goes by it, so each is checked somewhere.
  const avc = says.includes('Made as an MP4 (H.264), which every phone plays.');
  const gifBox = avc ? { mime: 'video/mp4', word: 'MP4' } : { mime: 'video/webm', word: 'WebM' };
  assert(
    avc || says.includes('Made as a WebM (VP9). This browser makes WebM videos: some iPhones may not play them.'),
    avc ? 'this browser makes MP4 (H.264), and it says every phone plays it' : 'this browser makes WebM, and it says some iPhones may not play it',
  );
  const before = await historyCount();
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await dialog.locator('[data-shrink-done]').waitFor({ timeout: 60_000 });
  const done = await dialog.locator('[data-shrink-done]').innerText();
  assert(/^\d+(\.\d)? (KB|MB) \(was 2\.\d MB\)\. Phones get this copy \(Ctrl\+Z takes it back\)\.$/.test(done), `it says how big it came out (${done})`);
  // (Make it, then Stop, went as they were pressed: the focus is on Close, not lost to the page.)
  assert((await focused()) === 'Close', `the focus moves on with the window’s buttons: on Close now (“${await focused()}”)`);
  const told = () => page.evaluate(() => window.__said.join(' | '));
  await page.waitForFunction(() => window.__said.some((t) => t.includes('🗜 Phones get the smaller copy now:')), null, { timeout: 10_000 }).catch(() => {});
  assert(
    (await told()).includes('🗜 Making a smaller copy for phones…') && (await told()).includes('🗜 Phones get the smaller copy now:') && !(await page.locator('.toast', { hasText: 'Phones get' }).count()),
    `a screen reader is told it started and how it ended, though the window shows it (no toast): ${await told()}`,
  );
  await dialog.getByRole('button', { name: '▶ Watch it' }).click();
  await dialog.getByLabel('The copy for phones').waitFor();
  await close();
  const first = await copyOf('dance');
  // (A WebM of it comes out under a fifth. CI's H.264 encoder (OpenH264, in software) goes far over its bitrate on this
  // noise: there, under half, the app's own bar for keeping a copy.)
  const share = avc ? 'half' : 'fifth';
  assert(first.type === gifBox.mime && first.size < dance.length / (avc ? 2 : 5), `the copy is an ${gifBox.word} under a ${share} of the GIF (${first.size} bytes of ${dance.length})`);
  assert(first.meta?.w === 320 && first.meta.h === 240 && Math.abs(first.meta.seconds - 2.4) < 0.3, `and it plays: ${JSON.stringify(first.meta)}`);
  const line = (await copyLine('dance').innerText()).replace(/\s+/g, ' ');
  assert(line.startsWith('📱 Phone copy · ') && line.includes(` KB · 320×240 ${gifBox.word}`), `the GIF's card says phones get a copy (${line})`);
  const header = (await page.locator('.library .page-header').innerText()).replace(/\s+/g, ' ');
  assert(header.includes('(1 phone copy)'), `the header counts it (${header.slice(0, 90)})`);
  assert((await page.locator('.library .card').count()) === 6, 'and it has no card of its own');
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
  assert((await focused()) === 'Stop', `Make it goes as it’s pressed: the focus is on Stop (“${await focused()}”)`);
  await dialog.getByRole('button', { name: 'Stop', exact: true }).click();
  await dialog.locator('[data-shrink-stopped]', { hasText: 'Stopped: nothing was changed.' }).waitFor();
  assert((await focused()) === 'Make it', `then on Make it (not “again”: nothing was made) (“${await focused()}”)`);
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
  let copy = await copyOf('dance');
  assert(copy.type === gifBox.mime && copy.hash, 'the GIF has its copy (made again)');

  // ---------- Done while a drag is held ----------
  console.log('Done while a drag on a slide is held:');
  // (The GIF's waits behind the long one, and starts once that's stopped, from the keyboard: the mouse holds a drag.)
  await openShrink('long');
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await progress.filter({ hasText: /Making it… \d+%/ }).waitFor({ timeout: 60_000 });
  await close();
  await openShrink('dance', '🗜 Again');
  await dialog.getByRole('button', { name: 'Make it again' }).click();
  await progress.filter({ hasText: 'Waiting for the other file to finish…' }).waitFor();
  await close();
  const atDrag = await historyCount();
  // (On a 🤫 card's slide, in the page: a window such as the clue's would leave the header's pill out of reach.)
  await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
  await page.locator('[data-card-editor]').waitFor();
  await page.locator('[data-saved-card="sc_tip"]').click();
  const words = page.locator('[data-card-editor] .slide .el[data-el="e2"]').first();
  await words.waitFor();
  const b0 = await words.boundingBox();
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b0.x + b0.width / 2 + i * 4, b0.y + b0.height / 2 + i * 3);
  const mark = await page.evaluate(() => window.__seen.length);
  await pill.getByRole('button', { name: 'Stop' }).focus();
  await page.keyboard.press('Enter');
  // The GIF's made (its pill said 100%), then checked: the pill says how far it got no more. A moment longer, held.
  await page.waitForFunction((mark) => window.__seen.slice(mark).includes('100%'), mark, { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('[data-job-pill] span[aria-hidden="true"]')?.textContent?.trim() === '', null, { timeout: 60_000 });
  await sleep(1500);
  const putIn = () => page.evaluate((mark) => window.__seen.slice(mark).some((t) => t.startsWith('🗜 Phones get the smaller copy now')), mark);
  assert((await pill.count()) === 1 && (await historyCount()) === atDrag && !(await putIn()), 'a copy made while a drag is held waits for it: not put in yet');
  await page.mouse.up();
  await page.locator('.toast', { hasText: '🗜 Phones get the smaller copy now' }).waitFor({ timeout: 60_000 });
  const b1 = await words.boundingBox();
  const undoTitle = () => page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(Math.round(b1.x - b0.x) === 40 && Math.round(b1.y - b0.y) === 30, `the drag moved the words (${Math.round(b1.x - b0.x)}, ${Math.round(b1.y - b0.y)})`);
  assert(
    (await historyCount()) === atDrag + 2 && (await undoTitle()) === 'Undo: Made a smaller copy of a GIF for phones (Ctrl+Z)',
    `once it’s let go, the copy goes in as a step of its own, after the drag’s (${(await historyCount()) - atDrag} steps; ${await undoTitle()})`,
  );
  // (Ctrl+Z puts the GIF's copy from before back.)
  await page.keyboard.press('Control+z');
  await notice.filter({ hasText: '↶ Undid Made a smaller copy of a GIF for phones' }).waitFor();
  const moveTitle = await undoTitle();
  assert(/^Undo: Moved /.test(moveTitle), `Ctrl+Z takes out that copy only: the drag is the next step back (${moveTitle})`);
  await media();
  assert((await copyOf('dance')).hash === copy.hash, 'and the GIF has the copy it had before');
  // (Ctrl+Y: the one just made, again; nothing left to redo.)
  await page.keyboard.press('Control+y');
  await notice.filter({ hasText: '↷ Redid Made a smaller copy of a GIF for phones' }).waitFor();
  copy = await copyOf('dance');

  // ---------- Videos and sounds ----------
  console.log('A video’s and a sound’s copies (stage 6):');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await forgetSeen(page);
  // (Each thing the dialog says while it works, as it shows: it can be quick.)
  await page.evaluate(() => {
    window.__progress = [];
    new MutationObserver(() => {
      const t = document.querySelector('[data-shrink-progress]')?.textContent?.replace(/\s+/g, ' ').trim();
      if (t && window.__progress.at(-1) !== t) window.__progress.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const bigButton = page.locator('[data-shrink-big]');
  await bigButton.waitFor();
  assert((await bigButton.innerText()) === '🗜 2 files are big for phones: make smaller copies…', `🖼 Media says 2 of the cards’ files are big for phones (${await bigButton.innerText()})`);
  const at6 = await historyCount();
  await bigButton.click();
  const several = page.getByRole('dialog', { name: '🗜 Make smaller copies for phones' });
  const row = (id) => several.locator(`[data-shrink-row="${id}"]`);
  await row('movie').getByText(/^→ about /).waitFor({ timeout: 60_000 });
  await row('song').getByText(/^→ about /).waitFor({ timeout: 60_000 });
  const listed = (await several.locator('[data-shrink-row]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert(
    listed.length === 2 && /^🎬 movie-zfnqj\.webm · 4\.0 MB → about [\d.]+ (KB|MB) \(1280×720, 0:01–0:03 only\)$/.test(listed[0]) && /^🔊 song-zfnqj\.wav · 3\.4 MB → about \d+ KB \((OGG|M4A)\)$/.test(listed[1]),
    `a row each, with the copy it gets: the video only the part its card plays (${listed.join(' | ')})`,
  );
  // (A browser that makes AAC sound makes an M4A of the sound, and an MP4 of the video, its Opus sound made AAC.)
  const aac = listed[1].endsWith('(M4A)');
  const movieBox = avc && aac ? { mime: 'video/mp4', word: 'MP4' } : { mime: 'video/webm', word: 'WebM' };
  await several.getByRole('button', { name: 'Make 2 copies' }).click();
  await row('movie').getByText(/^✓ /).waitFor({ timeout: 120_000 });
  await row('song').getByText(/^✓ /).waitFor({ timeout: 120_000 });
  assert((await historyCount()) === at6 + 2 && (await bigButton.count()) === 0, 'both are made: one step each, and 🖼 Media no longer says they’re big');
  // Ctrl+Z with the window still open does what it says: the window closes, and the last copy goes.
  await page.keyboard.press('Control+z');
  await several.waitFor({ state: 'detached' });
  await copyLine('song').waitFor({ state: 'detached' });
  assert((await copyLine('movie').innerText()).replace(/\s+/g, ' ').includes(`· 1280×720 ${movieBox.word} · 0:01–0:03`), `the video’s card says its copy holds 0:01–0:03 (${(await copyLine('movie').innerText()).replace(/\s+/g, ' ')})`);
  await page.keyboard.press('Control+z');
  await copyLine('movie').waitFor({ state: 'detached' });
  await bigButton.waitFor();
  assert(true, 'Ctrl+Z twice takes both back, one at a time (the first with the window still open, which closes)');

  // A copy of the whole video, at 360p. (The fixture is noise, which encoders can't squeeze to their estimate: CI's
  // makes it about 3.0 MB at 480p, over this server's 3 MB, and that copy would be refused as still too big.)
  await card('movie').getByRole('button', { name: '🗜 Make smaller…' }).click();
  await dialog.waitFor();
  await dialog.getByRole('radio').first().waitFor({ timeout: 60_000 });
  const plan = (await dialog.innerText()).replace(/\s+/g, ' ');
  assert(plan.includes('movie-zfnqj.webm · 4.0 MB · 4 s · 1280×720'), `its dialog names the video, its length and size (${plan.slice(0, 120)})`);
  const radios = (await dialog.getByRole('radio').evaluateAll((rs) => rs.map((r) => `${r.checked ? '◉' : '○'} ${r.parentElement.textContent.trim()}`))).join(' | ');
  assert(/^◉ Phones · 1280×720 · about [\d.]+ (KB|MB) \| ○ Small · 854×480 · about [\d.]+ (KB|MB) \| ○ Tiny · 640×360 · about [\d.]+ (KB|MB)$/.test(radios), `720p, 480p and 360p, with their sizes; 720p picked (${radios})`);
  const trim = dialog.getByRole('checkbox', { name: /^Only the part the cards play: 0:01 → 0:03 \(2 s\)/ });
  assert(await trim.isChecked(), 'only the part its card plays (1 to 3 s of 4) is ticked');
  assert(
    plan.includes(avc && aac ? 'Made as an MP4 (H.264, AAC), which every phone plays.' : 'Made as a WebM (VP9, Opus). This browser makes WebM videos: some iPhones may not play them.'),
    `this browser makes ${movieBox.word}, with its ${aac ? 'AAC' : 'Opus'} sound, and it says so`,
  );
  await trim.uncheck();
  await dialog.getByRole('radio', { name: /^Tiny · 640×360/ }).check();
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await dialog.locator('[data-shrink-done]').waitFor({ timeout: 120_000 });
  const said6 = await page.evaluate(() => window.__progress);
  assert(said6.some((t) => /^Making it… \d+%/.test(t)), `it says how far it got (${said6.join(' | ')})`);
  assert(!said6.some((t) => /^(Checking|Storing)/.test(t) && /%/.test(t)) && !said6.some((t) => /100% \(about/.test(t)), 'with no percent or time left once it’s made, nor while it’s checked and stored');
  const done6 = await dialog.locator('[data-shrink-done]').innerText();
  assert(/^[\d.]+ (KB|MB) \(was 4\.0 MB\)\. Phones get this copy \(Ctrl\+Z takes it back\)\.$/.test(done6), `and how big it came out (${done6})`);
  await close();
  const whole = await copyOf('movie', 1);
  assert(whole.type === movieBox.mime && whole.size < 0.9 * movie.length, `the copy is a smaller ${movieBox.word} (${whole.size} bytes of ${movie.length})`);
  assert(whole.meta?.w === 640 && whole.meta.h === 360 && Math.abs(whole.meta.seconds - 4) < 0.3, `360p, all 4 s of it: ${JSON.stringify(whole.meta)}`);
  assert(Math.abs(whole.meta.at - 1) < 0.1, `and it plays from 1 s when sent there (${whole.meta.at})`);

  // Only the part its card plays.
  await openShrinkAgain('movie');
  await dialog.getByRole('radio').first().waitFor({ timeout: 60_000 });
  assert(await trim.isChecked(), 'made again: the part its card plays is ticked');
  await dialog.getByRole('button', { name: 'Make it again' }).click();
  await dialog.locator('[data-shrink-done]').waitFor({ timeout: 120_000 });
  await close();
  const part = await copyOf('movie');
  assert(part.meta?.w === 1280 && Math.abs(part.meta.seconds - 2) < 0.3, `the copy holds 1 to 3 s only: ${JSON.stringify(part.meta)}`);
  const phone = await cardPreview('sc_movie');
  const note = (await phone.locator('[data-copy-note]').innerText()).replace(/\s+/g, ' ');
  assert(
    new RegExp(`^📱 Phones get its smaller copy instead \\([\\d.]+ (KB|MB), 1280×720 ${movieBox.word}\\)\\. ▶ Watch it 🗜 Make it again ✕ Remove it$`).test(note),
    `the card’s 📱 preview says its phones get the copy (${note})`,
  );
  await phone.getByRole('button', { name: '▶ Watch it' }).click();
  await phone.getByLabel('The copy phones get').waitFor();
  assert(true, 'and plays it (▶ Watch it)');
  await media();

  // A WAV: an M4A (AAC) where this browser makes AAC, else an OGG (Opus).
  await card('song').getByRole('button', { name: '🗜 Make smaller…' }).click();
  await dialog.getByText(/^A sound for phones: about \d+ KB\.$/).waitFor({ timeout: 60_000 });
  const ogg = (await dialog.innerText()).replace(/\s+/g, ' ');
  assert(
    ogg.includes('song-zfnqj.wav · 3.4 MB · 20 s') && ogg.includes(aac ? 'Made as an M4A (AAC), which every phone plays.' : 'Made as an OGG (Opus). Its sound is Opus: some iPhones may not play it.'),
    `a sound: it says what it makes (${ogg.slice(0, 260)})`,
  );
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await dialog.locator('[data-shrink-done]').waitFor({ timeout: 120_000 });
  // Ctrl+Z with the window still open does what its line says: it closes, and the copy goes (Ctrl+Y: back).
  await page.keyboard.press('Control+z');
  await dialog.waitFor({ state: 'detached' });
  await copyLine('song').waitFor({ state: 'detached' });
  await page.keyboard.press('Control+y');
  await copyLine('song').waitFor();
  assert(true, 'Ctrl+Z in the finished window: it closes, and the copy goes; Ctrl+Y puts it back');
  const sound = await copyOf('song');
  assert(
    sound.type === (aac ? 'audio/mp4' : 'audio/ogg') && sound.size < song.length / 5 && Math.abs(sound.meta?.seconds - 20) < 0.5,
    `the copy is an ${aac ? 'M4A' : 'OGG'}, under a fifth of the WAV, that plays: ${sound.size} bytes, ${JSON.stringify(sound.meta)}`,
  );

  // A .mov phones can't play: a WebM inside, so ↻ puts the same video in a WebM, for everyone, in its place (one file,
  // no copy).
  const movLine = page.locator('nav .problem', { hasText: '🤫 Card “Mov” has a video phones can\'t open: repackage it as a WebM (↻, nothing lost)' });
  await movLine.waitFor({ timeout: 60_000 });
  const movPhone = await cardPreview('sc_mov');
  const kindNote = movPhone.locator('.notes li.warn', { hasText: 'phones can’t play this kind of video' });
  await kindNote.getByRole('button', { name: '↻ Repackage as WebM (for everyone, nothing lost)' }).click();
  await kindNote.waitFor({ state: 'detached' });
  await movLine.waitFor({ state: 'detached' });
  assert(!(await movPhone.locator('[data-copy-note]').count()), '↻ Repackage as WebM: the 📱 preview’s note and the checklist’s line are gone, and no copy is made');
  await media();
  const movRef = page.locator('.card', { has: page.locator('button.nm', { hasText: 'clip-zfnqj.webm' }) });
  await movRef.waitFor();
  assert(!(await movRef.locator('[data-phone-copy]').count()), 'the file itself is clip-zfnqj.webm now');

  // A FLAC phones can't play, which nothing repackages: 🗜 makes a copy they can, from the 📱 preview.
  const toneLine = page.locator('nav .problem', { hasText: '🤫 Card “Tone” has a sound phones can\'t play: make a copy they can play (🗜)' });
  await toneLine.waitFor({ timeout: 60_000 });
  const tonePhone = await cardPreview('sc_tone');
  const toneNote = tonePhone.locator('.notes li.warn', { hasText: 'phones can’t play this kind of sound' });
  await toneNote.getByRole('button', { name: '🗜 Make a copy phones can play' }).click();
  await dialog.getByText('Phones can’t play this kind of file as it is: the copy is one they can.').waitFor({ timeout: 60_000 });
  assert(true, 'its window says phones can’t play this kind of file, and the copy is one they can');
  await dialog.getByText(/^A sound for phones: about \d+ KB\.$/).waitFor({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Make it', exact: true }).click();
  await dialog.locator('[data-shrink-done]').waitFor({ timeout: 120_000 });
  await close();
  await toneNote.waitFor({ state: 'detached' });
  await toneLine.waitFor({ state: 'detached' });
  const toneCopy = (await tonePhone.locator('[data-copy-note]').innerText()).replace(/\s+/g, ' ');
  assert(toneCopy.startsWith('📱 Phones get a copy they can play instead (') && toneCopy.includes(aac ? 'M4A' : 'OGG'), `🗜 Make a copy phones can play: the 📱 preview’s note and the checklist’s line are gone, a copy goes instead (${toneCopy})`);
  await media();
  const toasts6 = await page.evaluate(() => (window.__seen ?? []).filter((t) => /^(🗜|↻|Stopped)/.test(t)));
  assert(toasts6.length >= 4 && !toasts6.some((t) => t.includes('zfnqj')), `no toast names a file (${toasts6.join(' | ')})`);
  await page.locator('nav > button', { hasText: '🕘 History' }).click();
  const rows6 = (await page.locator('main').innerText()).split('\n').filter((t) => /copy of a (video|sound)|^Repackaged/.test(t));
  assert(
    rows6.length >= 5 && !rows6.some((t) => t.includes('zfnqj')) && rows6.some((t) => t.includes('Repackaged a video as WebM (nothing lost)')) && rows6.some((t) => t.includes('Made a copy of a sound that phones can play')),
    `nor does History (${rows6.join(' | ')})`,
  );
  await media();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

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
  /** A phone in a window of its own, in the room as `name`. */
  const joinAs = async (name, opts = {}, init) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, ...opts });
    if (init) await c.addInitScript(init);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name, exact: true }).click();
    await p.locator('#me').getByText(name).waitFor();
    return { c, p };
  };
  const { c: phoneCtx, p: bob } = await joinAs('Bob');
  // Ann's phone asks for reduced motion; Cy's won't start a video no one tapped for (an iPhone in Low Power Mode).
  const ann = await joinAs('Ann', { reducedMotion: 'reduce' });
  const cy = await joinAs('Cy', {}, () => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('The request is not allowed by the user agent', 'NotAllowedError'));
  });
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
  for (const name of ['Bob', 'Ann', 'Cy']) await send.getByRole('button', { name, exact: true }).click();
  await send.getByRole('button', { name: '📤 Send' }).click();
  await send.locator('[data-card-said]').getByText('Card 1 sent to Ann, Bob, Cy').waitFor();
  await page.keyboard.press('Escape');
  const sentMedia = () => states.at(-1)?.cards?.[0]?.media;
  assert(await until(() => sentMedia()?.[0]?.file === copy.hash, 60_000), `the card goes up as the copy (${JSON.stringify(sentMedia())})`);
  assert(JSON.stringify(sentMedia()) === JSON.stringify([{ kind: 'video', file: copy.hash, mime: gifBox.mime, gif: true }]), 'marked as a GIF sent as a video');
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
  /** Whether the card's video on phone `p` is paused. */
  const paused = (p) => p.locator('.card .card-item video').evaluate((v) => v.paused);
  await ann.p.getByRole('button', { name: 'Tap to see' }).tap();
  const annPlay = ann.p.getByRole('button', { name: '▶ Play Picture' });
  await annPlay.waitFor({ timeout: 60_000 });
  assert(await paused(ann.p), 'with reduced motion, it waits on its first frame for “▶ Play”');
  await annPlay.tap();
  await ann.p.waitForFunction(() => document.querySelector('.card .card-item video')?.paused === false);
  assert(true, 'which plays it');
  await cy.p.getByRole('button', { name: 'Tap to see' }).tap();
  await cy.p.getByRole('button', { name: '▶ Play Picture' }).waitFor({ timeout: 60_000 });
  assert(await paused(cy.p), 'a phone that won’t start it by itself gets “▶ Play” too, not a picture that never moves');
  await ann.c.close();
  await cy.c.close();
  const audGames = await aud.evaluate(() => window.__games);
  assert(audGames.length > 0 && audGames.every((names) => names.length === 6 && !names.some((n) => n.includes('(phones)'))), `the audience window’s copy of the game never lists the copies (${audGames.at(-1)?.join(', ')})`);
  await phoneCtx.close();

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Phone copies E2E passed.');

  /** 🗜 Again on a file's card with a copy, its dialog open. */
  async function openShrinkAgain(id) {
    await copyLine(id).getByRole('button', { name: '🗜 Again' }).click();
    await dialog.waitFor();
  }
  /** A 🤫 Card's 📱 preview, open. */
  async function cardPreview(id) {
    await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
    await page.locator('[data-card-editor]').waitFor();
    await page.locator(`[data-saved-card="${id}"]`).click();
    const phone = page.getByRole('complementary', { name: 'Card on their phone' });
    if (!(await phone.count())) await page.getByRole('button', { name: '📱 On their phone' }).click();
    await phone.waitFor();
    return phone;
  }
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
