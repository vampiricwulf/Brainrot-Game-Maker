// ✎ Edit video and sound (card-files spec §4.11, stage 6b.3), end to end in the test Chromium, with files made here
// (a few hundred KB each; the test Chromium makes and plays VP8, VP9 and Opus only, so the MP4 here holds VP9 and
// Opus, and H.264 / AAC are checked by hand).
// 1. An MP4 used by two slide items (1.5–3.5 and 0.2–0.8), trimmed to 1.2–3.0 in 🖼 Media: nothing re-encoded, the
//    dialog names the item the trim leaves out, the file lasts 1.8 s and starts on the source's 1.2 s frame, item 1
//    plays from 0.3 to the end and item 2 plays it all; History says “Trimmed a video to 0:01–0:03”; Ctrl+Z, Ctrl+Y.
// 2. A WebM trimmed 1.3–2.5: Exact (re-encoded) by default, 1.2 s; or Quick from the key frame at 1.0, 1.5 s, and an
//    item playing 1.5–2.0 plays 0.5–1.0.
// 3. An 854×480 WebM cropped 1:1 at 360p (50% typed in the % box says 240×240 first): 360×360, and a box of its old
//    shape is square now (a 4:3 one isn't).
// 4. A 20 s 720p WebM cropped: Stop midway changes nothing; Keep working closes the window, the header's pill shows
//    it, and a toast says when it's done.
// 6. Save as a new file: “clip (edited).webm” beside it, its uses unchanged.
// 7. From a slide item whose file another item uses: Only this item moves that item alone.
// 8. A WAV trimmed to 1–3: a 2 s WAV, which 🔊 Sounds' Round intro plays.
// 9. The handles are sliders saying their time, I and O set the trim at the playhead, Esc asks before throwing edits
//    away.
// 10. A 🤫 card's file with a 🗜 copy for phones: the copy goes with the edit, and a new one is made after.
// 11. Over the clue editor (from the Inspector), the window keeps the keys: after Remove crop the focus is on ✂ Crop;
//     with the focus lost to the page, arrows and Delete leave the item under it alone, and an Esc from outside both
//     doesn't close the clue; Ctrl+Enter in the End box applies the time just typed; while it's open after Apply, the
//     editor under it stays inert, the focus is on Close, and Esc closes the window only.
// Then: no toast, History row or pill names a file. 5. ▶ Play (and New) while an edit is saved asks first: Keep working
// stays, Stop it and play starts the game with the file unchanged.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, openGameFile, packGame, recordSeen, stored } from './helpers.mjs';
import { clip, fixturePage, hueAt, readBack, wav } from './mediafixtures.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const near = (a, b, d) => typeof a === 'number' && Math.abs(a - b) <= d;

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser;
const errors = [];

// ---------- The game: a board round whose tiles play the files, a 🤫 Card, 🔊 Sounds' Round intro ----------
let ids = 0;
const box = (o = {}) => ({ id: `e${ids++}`, x: 100, y: 300, w: 800, h: 450, rotation: 0, opacity: 1, zIndex: 1, ...o });
const text = (t) => ({ ...box({ y: 40, h: 160 }), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const video = (media, o = {}) => ({ ...box(), kind: 'video', media, fit: 'contain', autoplay: false, loop: false, muted: false, volume: 1, ...o });
const tile = (id, ...els) => ({ id, value: null, type: 'standard', questionSlide: { background: {}, elements: [text(id), ...els] }, answerSlide: { background: {}, elements: [text('A')] } });
// (Every file's name is one of these: none may show in a toast, a History row or the header's pill.)
const NAMES = ['clip', 'wide', 'long', 'pair', 'card', 'tone'];

try {
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const fx = await fixturePage(ctx);
  // A colour a frame (its hue says when in the clip it is), a key frame every second.
  const hued = { w: 320, h: 180, seconds: 4, codec: 'vp9', bitrate: 300_000, hue: true, audio: 'opus', keyEvery: 1 };
  const files = {
    clip: await clip(fx, { ...hued, box: 'mp4' }),
    cw: await clip(fx, hued),
    wide: await clip(fx, { ...hued, w: 854, h: 480, seconds: 2, audio: false }),
    long: await clip(fx, { ...hued, w: 1280, h: 720, seconds: 20, fps: 15, codec: 'vp8', audio: false }),
    pair: await clip(fx, { ...hued, seconds: 3 }),
    // (Noise: big enough that 🗜 makes a copy of it worth having.)
    card: await clip(fx, { w: 320, h: 240, seconds: 3, codec: 'vp9', bitrate: 3_000_000, audio: 'opus' }),
    cardcopy: Buffer.alloc(4096, 7),
    tone: wav(4, { rate: 22_050, channels: 1 }),
  };
  console.log(`  (fixtures: ${Object.entries(files).map(([k, b]) => `${k} ${Math.round(b.length / 1024)} KB`).join(', ')})`);
  const items = {
    c1: video('clip', { startAt: 1.5, endAt: 3.5 }),
    c2: video('clip', { startAt: 0.2, endAt: 0.8 }),
    w1: video('cw', { startAt: 1.5, endAt: 2 }),
    wide169: video('wide', { x: 160, y: 90, w: 1600, h: 900 }),
    wide43: video('wide', { x: 100, y: 100, w: 800, h: 600 }),
    p1: video('pair', { startAt: 0.5, endAt: 2 }),
    p2: video('pair'),
    card: video('card', { y: 300, w: 640, h: 480 }),
  };
  const game = {
    id: 'g_video_edit',
    version: 2,
    title: 'Video edit',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i] })),
    rounds: [
      {
        id: 'r1', name: 'Round 1', mode: 'board', values: [100, 200, 300, 400, 500], dailyDoubleCount: 0,
        categories: [
          { id: 'cat0', title: 'Memes', clues: [tile('Q1', items.c1), tile('Q2', items.c2), tile('Q3', items.w1), tile('Q4', items.wide169, items.wide43), tile('Q5', items.p1)] },
        ],
      },
    ],
    media: [
      { id: 'clip', name: 'clip.mp4', mime: 'video/mp4', size: files.clip.length, kind: 'video' },
      { id: 'cw', name: 'clip.webm', mime: 'video/webm', size: files.cw.length, kind: 'video' },
      { id: 'wide', name: 'wide.webm', mime: 'video/webm', size: files.wide.length, kind: 'video' },
      { id: 'long', name: 'long.webm', mime: 'video/webm', size: files.long.length, kind: 'video' },
      { id: 'pair', name: 'pair.webm', mime: 'video/webm', size: files.pair.length, kind: 'video' },
      { id: 'card', name: 'card.webm', mime: 'video/webm', size: files.card.length, kind: 'video' },
      { id: 'cardcopy', name: 'card (phones).webm', mime: 'video/webm', size: files.cardcopy.length, kind: 'video', phoneCopy: { of: 'card', width: 320, height: 240 } },
      { id: 'tone', name: 'tone.wav', mime: 'audio/wav', size: files.tone.length, kind: 'audio' },
    ],
    audio: { roundIntro: 'tone' }, wheels: [], dice: [], theme: {},
    cards: [{ id: 'sc_tip', name: 'Tip', background: {}, elements: [text('Look'), items.card, items.p2] }],
  };
  const packPath = resolve('test-results/video-edit.brainrot');
  writeFileSync(packPath, await packGame(game, files));

  await ctx.addInitScript(recordSeen);
  // What plays (🔊 Sounds' preview): its address.
  await ctx.addInitScript(() => {
    window.__plays = [];
    const real = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__plays.push(this.src);
      return real.call(this);
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (errors.push(`dialog: ${d.message()}`), d.accept()));
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, packPath);
  await page.getByText(/^Opened “/).waitFor();
  await editorReady(page);

  const media = () => page.locator('nav > button', { hasText: '🖼 Media' }).click();
  const card = (name) => page.locator('.card', { has: page.locator('button.nm', { hasText: new RegExp(`^${name.replace(/[.()]/g, '\\$&')}$`) }) });
  const dialog = page.locator('[data-media-edit]');
  const clueEditor = page.getByRole('dialog', { name: 'Edit clue' });
  /** ✎ Edit… on a file's card in 🖼 Media: its window, once it has read the file. */
  const editFromMedia = async (name) => {
    await media();
    await card(name).locator('[data-edit-media]').click();
    await dialog.waitFor();
    await dialog.locator('[data-trimbar]').waitFor({ timeout: 30_000 });
  };
  /** The trim typed in its Start and End boxes. */
  const trimTo = async (start, end) => {
    for (const [sel, v] of [['[data-trim-start]', start], ['[data-trim-end]', end]]) {
      if (v === undefined) continue;
      await dialog.locator(sel).fill(String(v));
      await dialog.locator(sel).press('Enter');
    }
  };
  const foot = () => dialog.locator('.modal-foot');
  /** Apply (or another of the footer's buttons), then its done line. */
  const applyAnd = async (button = 'Apply') => {
    await foot().getByRole('button', { name: button, exact: true }).click();
    await dialog.locator('[data-edit-done], [data-edit-failed]').waitFor({ timeout: 90_000 });
    const failed = await dialog.locator('[data-edit-failed]').count();
    if (failed) throw new Error(`The edit failed: ${await dialog.locator('[data-edit-failed]').innerText()}`);
    return (await dialog.locator('[data-edit-done]').innerText()).trim();
  };
  const closeDialog = async () => {
    await foot().getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  };
  /** The editor's game as autosave last stored it, once `ok(game)` holds. */
  const draftWhen = async (ok, what) => {
    for (let i = 0; i < 300; i++) {
      const g = await stored(page, 'editorDraft');
      if (g && ok(g)) return g;
      await page.waitForTimeout(100);
    }
    throw new Error(`The stored game never got to: ${what}`);
  };
  const refNamed = (g, name) => g.media.find((m) => m.name === name);
  /** The file `name` is in the game, and isn't file `id` any more (edited, a new one in its place). */
  const changed = (g, name, id) => !!refNamed(g, name) && refNamed(g, name).id !== id;
  /** What the open edit saves as, by the window's "Saved as …" line: 'mp4' or 'webm'. */
  const madeAs = async () => {
    const line = dialog.locator('[data-edit-format]');
    await line.filter({ hasText: /^Saved as (MP4|WebM)/ }).waitFor();
    return (await line.innerText()).startsWith('Saved as MP4') ? 'mp4' : 'webm';
  };
  /** Every slide item in a game, by id (they're found anywhere). */
  const itemsOf = (g) => {
    const out = {};
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if ((o.kind === 'video' || o.kind === 'audio') && typeof o.media === 'string' && o.id) out[o.id] = o;
      for (const v of Object.values(o)) walk(v);
    };
    walk(g.rounds);
    walk(g.cards);
    return out;
  };
  /** A stored file's bytes (from its card in 🖼 Media). */
  const bytesOf = async (id) => {
    await media();
    const b64 = await page.locator(`[data-place="media:${id}"]`).evaluate(async (el) => {
      const m = el.querySelector('video, audio');
      const b = new Uint8Array(await (await fetch(m.src)).arrayBuffer());
      let bin = '';
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(bin);
    });
    return Buffer.from(b64, 'base64');
  };
  const undoKey = async (key) => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.press(key);
  };
  const historyRows = async () => {
    await page.locator('nav > button', { hasText: '🕘 History' }).click();
    await page.locator('main .list .hr').first().waitFor();
    const rows = (await page.locator('main').innerText()).split('\n').map((t) => t.trim());
    await media();
    return rows;
  };
  /** The toasts shown so far (the app's .toast). */
  const toastsSeen = () => page.evaluate(() => (window.__seen ?? []).filter((_, i) => window.__seenWhere?.[i]?.el.includes('class="toast')));
  const toasted = (want) =>
    page
      .waitForFunction((want) => (window.__seen ?? []).some((t, i) => t.startsWith(want) && window.__seenWhere?.[i]?.el.includes('class="toast')), want, { timeout: 90_000 })
      .catch(async (e) => {
        throw new Error(`No toast “${want}”; the toasts were: ${(await toastsSeen()).join(' | ')} (${e.message})`);
      });

  // ---------- 1. clip.mp4, used by two items, trimmed to 1.2–3.0 ----------
  console.log('1. An MP4 trimmed, nothing re-encoded:');
  const hue12 = (await hueAt(fx, files.clip, 1.2)).hue;
  await editFromMedia('clip.mp4');
  assert((await dialog.locator('.modal-title').innerText()) === '✎ Edit video', 'the window: ✎ Edit video');
  const hint = await dialog.locator('[data-edit-hint]').innerText();
  assert(/^clip\.mp4 · 4 s · 320×180 · \d+ KB$/.test(hint), `its header names the file, its length, size and bytes (${hint})`);
  assert(
    (await dialog.locator('[data-edit-reach]').innerText()) === 'Changes the file everywhere it’s used (2 places), on stream too. Ctrl+Z puts the old one back.',
    'and says it changes the file everywhere (2 places)',
  );
  assert(await foot().getByRole('button', { name: 'Apply', exact: true }).isDisabled(), 'Apply waits for a change');
  await trimTo(1.2, 3);
  await dialog.locator('[data-edit-estimate]', { hasText: 'quick: nothing is re-encoded' }).waitFor();
  assert(/^About \d+ KB \(now \d+ KB\) · quick: nothing is re-encoded$/.test((await dialog.locator('[data-edit-estimate]').innerText()).trim()), 'the estimate: quick, nothing re-encoded');
  assert((await dialog.locator('[data-edit-format]').innerText()) === 'Saved as MP4 (VP9, Opus)', 'saved as MP4 (VP9, Opus)');
  const leftOut = await dialog.locator('[data-edit-left-out]').allInnerTexts();
  assert(
    leftOut.length === 1 && leftOut[0].startsWith('⚠ Round 1 · Memes #2 (question) plays 0:00.2–0:00.8, which this trim leaves out'),
    `it names the item the trim leaves out (${leftOut.join(' | ')})`,
  );
  assert(
    (await dialog.locator('[data-edit-timed]').innerText()) === '2 slide items play parts of it: their Start at and Stop at move with the trim, so they play the same moments.',
    'and says the items’ times move with the trim',
  );
  const done1 = await applyAnd();
  assert(/^✓ 1\.8 s · \d+ KB \(was \d+ KB\)\. Ctrl\+Z puts the old one back\.$/.test(done1), `done: ${done1}`);
  // Ctrl+Z with the window still open does what it says: the window closes, and the old file is back.
  await page.keyboard.press('Control+z');
  await dialog.waitFor({ state: 'detached' });
  await draftWhen((g) => !!g.media.find((m) => m.id === 'clip'), 'clip.mp4 back, from the window');
  assert(true, 'Ctrl+Z in the finished window: it closes, and the old file is back');
  await undoKey('Control+y');
  const g1 = await draftWhen((g) => refNamed(g, 'clip.mp4')?.id !== 'clip', 'clip.mp4 edited');
  const clipNew = refNamed(g1, 'clip.mp4');
  const it1 = itemsOf(g1);
  assert(clipNew.mime === 'video/mp4' && it1[items.c1.id].media === clipNew.id && it1[items.c2.id].media === clipNew.id, `a new id for clip.mp4, every item on it (${clipNew.id})`);
  assert(it1[items.c1.id].startAt === 0.3 && it1[items.c1.id].endAt === undefined, `item 1 plays from 0.3 to the end (${JSON.stringify([it1[items.c1.id].startAt, it1[items.c1.id].endAt])})`);
  assert(it1[items.c2.id].startAt === undefined && it1[items.c2.id].endAt === undefined, 'item 2 (its part cut out) plays it all');
  const made1 = await bytesOf(clipNew.id);
  const read1 = await readBack(fx, made1);
  const first = await hueAt(fx, made1, 0);
  assert(read1.format === 'MP4' && read1.video === 'vp9' && read1.audio === 'opus' && near(read1.seconds, 1.8, 0.1), `the file: ${JSON.stringify(read1)}`);
  assert(near(first.hue, hue12, 8), `its first frame is the source’s at 1.2 s (hue ${Math.round(first.hue)}°, the source’s ${Math.round(hue12)}°)`);
  assert((await historyRows()).includes('Trimmed a video to 0:01–0:03'), 'History: “Trimmed a video to 0:01–0:03”');
  await undoKey('Control+z');
  const back1 = itemsOf(await draftWhen((g) => !!g.media.find((m) => m.id === 'clip'), 'clip.mp4 back'));
  assert(
    back1[items.c1.id].media === 'clip' && back1[items.c1.id].startAt === 1.5 && back1[items.c1.id].endAt === 3.5 && back1[items.c2.id].startAt === 0.2 && back1[items.c2.id].endAt === 0.8,
    'Ctrl+Z: the old file, both items’ times back',
  );
  await undoKey('Control+y');
  assert(itemsOf(await draftWhen((g) => !!g.media.find((m) => m.id === clipNew.id), 'the edit again'))[items.c1.id].startAt === 0.3, 'Ctrl+Y: the edit again');

  // ---------- 2. clip.webm, 1.3–2.5: Exact, then Quick ----------
  console.log('2. A WebM: exact or quick:');
  // (On a laptop's screen, 1366×768 less the browser's bars.)
  await page.setViewportSize({ width: 1366, height: 657 });
  await editFromMedia('clip.webm');
  await trimTo(1.3, 2.5);
  const choice = dialog.locator('[data-trim-choice]');
  await choice.waitFor({ timeout: 30_000 });
  const laptop = await dialog.evaluate((d) => ({
    parts: Math.round(Math.max(...['.controls', 'aside'].map((s) => d.querySelector(s).getBoundingClientRect().bottom))),
    foot: Math.round(d.querySelector('.modal-foot').getBoundingClientRect().top),
  }));
  assert(laptop.parts <= laptop.foot, `a laptop’s screen (1366×657): the trim and its “How it’s cut” end above the window’s buttons, never under them (${JSON.stringify(laptop)})`);
  await page.setViewportSize({ width: 1400, height: 950 });
  const choiceText = (await choice.innerText()).replace(/\s+/g, ' ');
  assert(choiceText.includes('Quick trim, nothing re-encoded: it starts at 0:01.0, the nearest point before 0:01.3'), `the quick choice says where it starts (${choiceText})`);
  assert(await choice.getByRole('radio').first().isChecked(), 'Exact is the default');
  await dialog.locator('[data-edit-estimate]', { hasText: 're-encodes the video' }).waitFor();
  assert(true, 'and it says it re-encodes the video');
  await applyAnd();
  await closeDialog();
  const g2 = await draftWhen((g) => refNamed(g, 'clip.webm')?.id !== 'cw', 'clip.webm trimmed');
  const exact = await readBack(fx, await bytesOf(refNamed(g2, 'clip.webm').id));
  assert(exact.format === 'WebM' && near(exact.seconds, 1.2, 0.1), `Exact: ${exact.seconds} s`);
  assert(itemsOf(g2)[items.w1.id].startAt === 0.2 && itemsOf(g2)[items.w1.id].endAt === 0.7, `its item (1.5–2.0) plays 0.2–0.7 (${JSON.stringify(itemsOf(g2)[items.w1.id])})`);
  // (Undone, a change to one item shows where it is: its clue, open.)
  await undoKey('Control+z');
  await draftWhen((g) => !!g.media.find((m) => m.id === 'cw'), 'clip.webm back');
  await clueEditor.waitFor();
  await page.keyboard.press('Escape');
  await clueEditor.waitFor({ state: 'detached' });
  await editFromMedia('clip.webm');
  await trimTo(1.3, 2.5);
  await choice.waitFor({ timeout: 30_000 });
  await choice.getByRole('radio').nth(1).check();
  await dialog.locator('[data-edit-estimate]', { hasText: 'quick: nothing is re-encoded' }).waitFor();
  await applyAnd();
  await closeDialog();
  const g2b = await draftWhen((g) => refNamed(g, 'clip.webm')?.id !== 'cw', 'clip.webm quick-trimmed');
  const quick = await readBack(fx, await bytesOf(refNamed(g2b, 'clip.webm').id));
  const w1 = itemsOf(g2b)[items.w1.id];
  assert(near(quick.seconds, 1.5, 0.1), `Quick: from the key frame at 1.0, ${quick.seconds} s`);
  assert(w1.startAt === 0.5 && w1.endAt === 1, `its item (1.5–2.0) plays 0.5–1.0 (${JSON.stringify([w1.startAt, w1.endAt])})`);

  // ---------- 3. wide.webm (854×480), 1:1 crop + 360p ----------
  console.log('3. Crop and size:');
  await editFromMedia('wide.webm');
  await dialog.getByRole('button', { name: '✂ Crop' }).click();
  await dialog.getByRole('button', { name: '1:1', exact: true }).click();
  assert((await dialog.locator('[data-crop-size]').innerText()) === 'crop 480×480', 'a square crop: 480×480');
  assert(await dialog.locator('[data-crop-box]').count(), 'the crop box lies over the picture');
  await dialog.getByRole('button', { name: '360p', exact: true }).click();
  assert((await dialog.getByRole('button', { name: '360p', exact: true }).getAttribute('title')) === '360×360', '360p is 360×360');
  // A size in percent instead (a picture may be any shape): the window says what it comes out at, whichever is picked.
  const sizeOut = () => dialog.locator('[data-size-out]').innerText();
  const pct = dialog.getByLabel('Size, percent of the picture');
  assert((await sizeOut()) === 'Comes out at 360×360 (cropped and sized).' && (await pct.inputValue()) === '75', `360p: it comes out at 360×360, which the % box says is 75% (${await sizeOut()} ${await pct.inputValue()}%)`);
  await pct.fill('50');
  await pct.press('Tab');
  await dialog.locator('[data-size-out]', { hasText: 'Comes out at 240×240' }).waitFor();
  assert((await dialog.getByRole('button', { name: '360p', exact: true }).getAttribute('aria-pressed')) === 'false', '50% typed: it comes out at 240×240, and 360p is no longer picked');
  await dialog.getByRole('button', { name: '360p', exact: true }).click();
  await dialog.locator('[data-size-out]', { hasText: 'Comes out at 360×360' }).waitFor();
  assert((await pct.inputValue()) === '75', '360p again: 360×360, and the % box back at 75');
  // (Made again with no sound: an MP4 (H.264) where this browser makes H.264, as CI's does, named for it; else a WebM.)
  const wideExt = await madeAs();
  await applyAnd();
  await closeDialog();
  const g3 = await draftWhen((g) => changed(g, `wide.${wideExt}`, 'wide'), 'wide cropped');
  const wideBytes = await bytesOf(refNamed(g3, `wide.${wideExt}`).id);
  const wideRead = await hueAt(fx, wideBytes, 0.5);
  assert(
    refNamed(g3, `wide.${wideExt}`).mime === `video/${wideExt}` && wideRead.width === 360 && wideRead.height === 360,
    `the file: 360×360 video/${wideExt} (${wideRead.width}×${wideRead.height})`,
  );
  const [b169, b43] = [itemsOf(g3)[items.wide169.id], itemsOf(g3)[items.wide43.id]];
  assert(b169.w === b169.h && b169.w > 0, `the 16:9 box is square now (${b169.w}×${b169.h})`);
  assert(b43.w === 800 && b43.h === 600, 'the 4:3 box is as it was');

  // ---------- 4. long.webm (20 s, 720p), cropped: Stop, then Keep working ----------
  console.log('4. Stop, and Keep working:');
  const rowsBefore = (await historyRows()).filter((t) => t.startsWith('Edited a video')).length;
  await editFromMedia('long.webm');
  await dialog.getByRole('button', { name: '✂ Crop' }).click();
  await dialog.getByRole('button', { name: '4:3', exact: true }).click();
  const longExt = await madeAs();
  // (The page's work slowed down 4 times: the edit is still being made when Stop is pressed.)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await foot().getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => /\d+%/.test(document.querySelector('[data-media-edit] [data-job-progress]')?.textContent ?? ''), null, { timeout: 60_000 });
  await foot().getByRole('button', { name: 'Stop', exact: true }).click();
  await dialog.locator('[data-edit-stopped]').waitFor({ timeout: 30_000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  assert((await dialog.locator('[data-edit-stopped]').innerText()) === 'Stopped: nothing was changed.', 'Stop at a percentage: “Stopped: nothing was changed.”');
  const g4 = await stored(page, 'editorDraft');
  assert(refNamed(g4, 'long.webm').id === 'long', 'the same file');
  await foot().getByRole('button', { name: 'Apply', exact: true }).click();
  await foot().getByRole('button', { name: 'Keep working' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.locator('[data-job-pill]').waitFor();
  assert((await page.locator('[data-job-pill] [role="status"]').innerText()) === '✂ Saving a video’s edit…', 'Keep working: the window closes, and the header’s pill says “✂ Saving a video’s edit…”');
  await toasted('✂ Video edited: ');
  const said4 = (await toastsSeen()).find((t) => t.startsWith('✂ Video edited: '));
  assert(/^✂ Video edited: 20 s, 960×720, [\d.]+ [KM]B \(was [\d.]+ [KM]B\)\. Ctrl\+Z puts the old one back\.$/.test(said4), `then a toast: “${said4}”`);
  const g4b = await draftWhen((g) => changed(g, `long.${longExt}`, 'long'), 'long cropped');
  assert((await historyRows()).filter((t) => t.startsWith('Edited a video')).length === rowsBefore + 1, 'one History row: the stopped one made none');
  const longId = refNamed(g4b, `long.${longExt}`).id;

  // ---------- 6. Save as a new file ----------
  console.log('6. Save as a new file:');
  const cwId = refNamed(g2b, 'clip.webm').id;
  await editFromMedia('clip.webm');
  await trimTo(undefined, 1);
  const done6 = await applyAnd('Save as a new file');
  assert(done6 === '✓ Saved as “clip (edited).webm”: the original is unchanged.', `done: ${done6}`);
  await closeDialog();
  await card('clip (edited).webm').waitFor();
  const g6 = await draftWhen((g) => !!refNamed(g, 'clip (edited).webm'), 'clip (edited).webm');
  assert(refNamed(g6, 'clip.webm').id === cwId && itemsOf(g6)[items.w1.id].media === cwId, 'a second card, “clip (edited).webm”; clip.webm and its item as they were');

  // ---------- 7. Only this item, from a slide item's panel ----------
  console.log('7. Only this item:');
  await page.getByRole('button', { name: 'Round 1', exact: true }).click();
  await page.locator('.grid .tile').nth(4).click();
  await clueEditor.waitFor();
  // (The slide editor's layer over the items takes the click: in the middle of the video.)
  const at7 = await clueEditor.locator(`.slide .el[data-el="${items.p1.id}"]`).boundingBox();
  await page.mouse.click(at7.x + at7.width / 2, at7.y + at7.height / 2, { button: 'right' });
  await page.getByRole('menu', { name: 'Slide item menu' }).getByRole('menuitem', { name: '✎ Edit video…' }).click();
  await dialog.locator('[data-trimbar]').waitFor({ timeout: 30_000 });
  assert(true, 'the item’s right-click menu has ✎ Edit video…');
  await foot().getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.mouse.click(at7.x + at7.width / 2, at7.y + at7.height / 2);
  await clueEditor.locator('.insp [data-edit-media]').click();
  await dialog.waitFor();
  await dialog.locator('[data-trimbar]').waitFor({ timeout: 30_000 });
  assert((await foot().getByRole('button').allInnerTexts()).join(' | ') === 'Cancel | Only this item | Apply to all 2', 'its panel’s ✎ Edit video…, from an item whose file another item uses: Cancel, Only this item, Apply to all 2');
  await dialog.getByRole('button', { name: '✂ Keep just what this item plays (0:00.5–0:02)' }).click();
  assert(
    (await dialog.getByRole('slider', { name: 'Start of the trim' }).getAttribute('aria-valuetext')) === '0:00.5' && (await dialog.getByRole('slider', { name: 'End of the trim' }).getAttribute('aria-valuetext')) === '0:02.0',
    '✂ Keep just what this item plays: 0:00.5 to 0:02.0',
  );
  const done7 = await applyAnd('Only this item');
  assert(done7 === '✓ This item plays its own edited copy now.', `done: ${done7}`);
  await closeDialog();
  await clueEditor.getByRole('button', { name: 'Close' }).last().click();
  await clueEditor.waitFor({ state: 'detached' });
  const g7 = await draftWhen((g) => !!refNamed(g, 'pair (edited).webm'), 'pair (edited).webm');
  const pairNew = refNamed(g7, 'pair (edited).webm');
  const [p1, p2] = [itemsOf(g7)[items.p1.id], itemsOf(g7)[items.p2.id]];
  assert(p1.media === pairNew.id && p2.media === 'pair', 'only that item plays the edited copy; the other keeps pair.webm');
  assert(p1.startAt === undefined && p1.endAt === undefined, 'and it plays all of its own copy (its part was what was kept)');

  // ---------- 8. tone.wav trimmed to 1–3 ----------
  console.log('8. A sound:');
  await editFromMedia('tone.wav');
  assert((await dialog.locator('.modal-title').innerText()) === '✎ Edit sound', 'the window: ✎ Edit sound');
  await trimTo(1, 3);
  await applyAnd();
  await closeDialog();
  const g8 = await draftWhen((g) => refNamed(g, 'tone.wav')?.id !== 'tone', 'tone.wav trimmed');
  const tone = refNamed(g8, 'tone.wav');
  const toneRead = await readBack(fx, await bytesOf(tone.id));
  assert(tone.mime === 'audio/wav' && toneRead.format === 'WAVE' && near(toneRead.seconds, 2, 0.1), `a 2 s WAV (${JSON.stringify(toneRead)})`);
  assert(g8.audio.roundIntro === tone.id, '🔊 Sounds’ Round intro is the trimmed file');
  const toneUrl = await page.locator(`[data-place="media:${tone.id}"] audio`).getAttribute('src');
  await page.locator('nav > button', { hasText: '🔊 Sounds' }).click();
  await page.evaluate(() => (window.__plays = []));
  await page.getByRole('button', { name: 'Preview Round intro' }).click();
  await page.waitForFunction((u) => window.__plays.includes(u), toneUrl, { timeout: 10_000 });
  assert(true, 'and its preview plays it');

  // ---------- 9. The handles, I and O, Esc ----------
  console.log('9. Keys:');
  await editFromMedia('pair.webm');
  const startHandle = dialog.getByRole('slider', { name: 'Start of the trim' });
  const endHandle = dialog.getByRole('slider', { name: 'End of the trim' });
  assert((await startHandle.getAttribute('aria-valuetext')) === '0:00.0' && (await endHandle.getAttribute('aria-valuetext')) === '0:03.0', 'the handles are sliders saying their time (0:00.0, 0:03.0)');
  await startHandle.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  assert((await startHandle.getAttribute('aria-valuetext')) === '0:01.3', `→ three times and Shift+→: 0:01.3 (${await startHandle.getAttribute('aria-valuetext')})`);
  const bar = await dialog.locator('[data-trimbar]').boundingBox();
  await page.mouse.click(bar.x + bar.width * (2 / 3), bar.y + 5);
  await page.keyboard.press('o');
  assert(near(Number((await endHandle.getAttribute('aria-valuenow')) ?? NaN), 2, 0.15), `a click on the bar, then O: the end there (${await endHandle.getAttribute('aria-valuetext')})`);
  await page.keyboard.press('Escape');
  const ask = dialog.getByText('Discard your edits to this video?');
  await ask.waitFor();
  assert(true, 'Esc after a change asks “Discard your edits to this video?”');
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  assert(await dialog.isVisible(), 'Keep editing: still open');
  await page.keyboard.press('Escape');
  await ask.waitFor();
  // (A click right after the question shows is taken for the end of what asked it, as the image editor's.)
  await page.waitForTimeout(450);
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert(refNamed(await stored(page, 'editorDraft'), 'pair.webm').id === 'pair', 'Discard: closed, the file as it was');
  // ✂ Crop pressed (and put away) changes nothing, as Result says: Esc just closes.
  await editFromMedia('pair.webm');
  await dialog.getByRole('button', { name: '✂ Crop' }).click();
  await dialog.getByRole('button', { name: '✂ Crop' }).click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  assert(true, '✂ Crop alone, then Esc: the window closes without asking about edits');

  // ---------- 10. A 🤫 card's file with a copy for phones ----------
  console.log('10. Its copy for phones:');
  await editFromMedia('card.webm');
  const remake = dialog.locator('[data-edit-remake]');
  await remake.waitFor();
  assert(!(await remake.isChecked()), 'a small file of a type phones take: “📱 Make its smaller copy for phones again” starts unticked');
  // (Its end trimmed: copied as it is, still big enough that 🗜's copy is worth having.)
  await trimTo(undefined, 2.5);
  await remake.check();
  await applyAnd();
  await closeDialog();
  const g10 = await draftWhen((g) => refNamed(g, 'card.webm')?.id !== 'card', 'card.webm trimmed');
  const cardNew = refNamed(g10, 'card.webm');
  assert(!g10.media.some((m) => m.phoneCopy?.of === 'card' || m.id === 'cardcopy'), 'its old copy for phones is gone');
  await toasted('🗜 Phones get the smaller copy now');
  const g10b = await draftWhen((g) => g.media.some((m) => m.phoneCopy?.of === cardNew.id), 'a new copy');
  assert(g10b.media.some((m) => m.phoneCopy?.of === cardNew.id), 'and a 🗜 job made a new one, of the edited file');

  // ---------- 11. Over the clue editor, the window keeps the keys ----------
  console.log('11. Keys stay in the window over the clue editor:');
  await page.getByRole('button', { name: 'Round 1', exact: true }).click();
  await page.locator('.grid .tile').nth(4).click();
  await clueEditor.waitFor();
  const at11 = await clueEditor.locator(`.slide .el[data-el="${items.p1.id}"]`).boundingBox();
  await page.mouse.click(at11.x + at11.width / 2, at11.y + at11.height / 2);
  await clueEditor.locator('.insp [data-edit-media]').click();
  await dialog.locator('[data-trimbar]').waitFor({ timeout: 30_000 });
  const focused = () => page.evaluate(() => (document.activeElement === document.body ? 'the page' : (document.activeElement?.textContent?.trim().slice(0, 40) ?? 'nothing')));
  await dialog.getByRole('button', { name: '✂ Crop' }).click();
  await dialog.getByRole('button', { name: 'Remove crop' }).click();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === '✂ Crop', null, { timeout: 5000 }).catch(async () => {
    throw new Error(`After Remove crop the focus is on “${await focused()}”, not ✂ Crop`);
  });
  assert(true, 'Remove crop: the focus goes to ✂ Crop');
  const rectOf = () => page.evaluate((id) => {
    const r = document.querySelector(`.slide .el[data-el="${id}"]`)?.getBoundingClientRect();
    return r ? `${Math.round(r.x)},${Math.round(r.y)}` : 'gone';
  }, items.p1.id);
  const was11 = await rectOf();
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Delete');
  // (A key from outside both, as from a toast's button: the clue under the window stays open.)
  await page.evaluate(() => document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  // The trim typed: 0.3 in Start (Enter), then 1.2 in End and Ctrl+Enter there, without leaving it.
  await dialog.locator('[data-trim-start]').fill('0.3');
  await dialog.locator('[data-trim-start]').press('Enter');
  await dialog.locator('[data-trim-end]').fill('1.2');
  await dialog.locator('[data-trim-end]').press('Control+Enter');
  await dialog.locator('[data-edit-done], [data-edit-failed]').waitFor({ timeout: 90_000 });
  const done11 = (await dialog.locator('[data-edit-done], [data-edit-failed]').innerText()).trim();
  assert(done11.startsWith('✓ 0.9 s'), `Ctrl+Enter in End: the trim with the end just typed, 0.3–1.2 (${done11})`);
  assert((await rectOf()) === was11, `arrows and Delete with the focus lost left the item under the window where it was (${was11} → ${await rectOf()})`);
  assert(await clueEditor.isVisible(), 'and an Esc from outside both left the clue open');
  assert(await page.evaluate(() => document.querySelector('.editor > .body')?.inert === true), 'after Apply, the editor under the window is still inert');
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Close' && !!document.activeElement.closest('[data-media-edit]'), null, { timeout: 5000 }).catch(async () => {
    throw new Error(`Once done the focus is on “${await focused()}”, not Close`);
  });
  assert(true, 'once done the focus is on Close');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert(await clueEditor.isVisible(), 'Esc closes the window, not the clue under it');
  await clueEditor.getByRole('button', { name: 'Close' }).last().click();
  await clueEditor.waitFor({ state: 'detached' });
  const g11 = await draftWhen((g) => itemsOf(g)[items.p1.id]?.media !== pairNew.id, 'the item on its trimmed file');
  const p11 = itemsOf(g11)[items.p1.id];
  assert(p11 && p11.x === items.p1.x && p11.y === items.p1.y, `the stored item is where it was (${p11?.x}, ${p11?.y})`);
  const read11 = await readBack(fx, await bytesOf(p11.media));
  assert(near(read11.seconds, 0.9, 0.12), `the file lasts 0.9 s (${read11.seconds})`);

  // ---------- No toast, History row or pill named a file ----------
  const named = (list) => list.filter((t) => NAMES.some((n) => t.includes(n)));
  const ours = (await toastsSeen()).filter((t) => /^(✂|🗜|Stopped)/.test(t));
  assert(ours.length >= 2 && !named(ours).length, `no toast of ✎’s names a file (${ours.join(' | ')})`);
  const rows = (await historyRows()).filter((t) => /^(Trimmed|Edited|Saved an edited)/.test(t));
  assert(rows.length >= 6 && !named(rows).length, `nor any History row (${rows.join(' | ')})`);
  const pills = await page.evaluate(() => (window.__seen ?? []).filter((_, i) => window.__seenWhere?.[i]?.path.includes('.pill')));
  assert(pills.length && !named(pills).length, `nor the header’s pill (${[...new Set(pills)].join(' | ')})`);

  // ---------- 5. ▶ Play while an edit is being saved ----------
  console.log('5. ▶ Play asks first:');
  await editFromMedia(`long.${longExt}`);
  await dialog.getByRole('button', { name: '✂ Crop' }).click();
  await dialog.getByRole('button', { name: '1:1', exact: true }).click();
  // (The page's work slowed down 4 times again: the edit is still being made after the clicks below.)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await foot().getByRole('button', { name: 'Apply', exact: true }).click();
  await foot().getByRole('button', { name: 'Keep working' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.locator('[data-job-pill]', { hasText: /\d+%/ }).waitFor({ timeout: 60_000 });
  const play = page.getByRole('button', { name: '▶ Play' });
  await play.click();
  const playAsk = page.getByRole('alertdialog').filter({ hasText: 'still being saved' });
  await playAsk.waitFor();
  assert((await playAsk.innerText()).includes('✂ A video’s edit is still being saved'), 'the ask: “✂ A video’s edit is still being saved (…%).”');
  await playAsk.getByRole('button', { name: 'Keep working' }).click();
  await playAsk.waitFor({ state: 'detached' });
  assert(await page.locator('[data-job-pill]').isVisible(), 'Keep working: still in the editor, the edit going on');
  // New asks the same first (another game would stop it), and Keep working keeps this game and the edit.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const newAsk = page.getByRole('alertdialog').filter({ hasText: 'Stop it and leave this game?' });
  await newAsk.waitFor();
  assert((await newAsk.innerText()).includes('✂ A video’s edit is still being saved'), 'New while it’s saved asks first: “✂ A video’s edit is still being saved (…%). Stop it and leave this game?”');
  await newAsk.getByRole('button', { name: 'Keep working' }).click();
  await newAsk.waitFor({ state: 'detached' });
  assert(
    (await page.locator('[data-job-pill]').isVisible()) && !!refNamed(await stored(page, 'editorDraft'), `long.${longExt}`),
    'Keep working: the same game, the edit going on',
  );
  // A narrower window (a laptop's, or half a screen): the pill's words shorten, and its Stop stays in sight.
  await page.setViewportSize({ width: 1024, height: 950 });
  const stopShown = await page.locator('[data-job-pill]').evaluate((p) => {
    const [b, r] = [p.querySelector('button').getBoundingClientRect(), p.getBoundingClientRect()];
    return { inside: b.left >= r.left && b.right <= r.right + 0.5 && b.right <= innerWidth, stop: Math.round(b.width), pill: Math.round(r.width) };
  });
  assert(stopShown.inside && stopShown.stop >= 30, `at 1024 px wide the pill’s Stop is whole and in sight (${JSON.stringify(stopShown)})`);
  await page.setViewportSize({ width: 1400, height: 950 });
  await play.click();
  await playAsk.waitFor();
  await playAsk.getByRole('button', { name: 'Stop it and play' }).click();
  await page.locator('.editor').waitFor({ state: 'detached' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  assert(true, 'Stop it and play: the game starts');
  const g5 = await draftWhen((g) => !!refNamed(g, `long.${longExt}`), 'the editor’s game');
  assert(refNamed(g5, `long.${longExt}`).id === longId, 'with the file unchanged');

  await fx.close();
  if (errors.length) throw new Error('Page errors: ' + errors.join(' | '));
  console.log('videoedit: all passed');
} finally {
  await browser?.close();
}
