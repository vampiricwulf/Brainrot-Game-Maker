// Whether a video or sound really plays in this browser, and 🔄 Convert for one that doesn't (card-files spec §4.12,
// stages 6b.1 and 6b.2), end to end in the test Chromium, with files made here.
// Part 1: an MKV with VP9 and Opus (which plays though its type says it may not), one whose sound is AC-3 (which the
// test Chromium doesn't play), an AC-3 sound alone and bytes no app can read (named .mov), added in 🖼 Media. Each card says what
// was found once the file is checked: nothing, "plays without its sound here", "won't play here" (its title says why),
// or today's "may not play" and toast, word for word, for the one the app can't read. So does the checklist, counting
// and naming nothing. A reload checks the files again.
// Part 2: a camcorder-like .mts (an MP3 sound in MPEG-TS, which the test Chromium doesn't open) added in 🖼 Media gets the note at
// the top, and 🔄 repackages it as an MP4 in its place (Ctrl+Z and Ctrl+Y); the AC-3 MKV dropped on a slide becomes a
// WebM without its sound, on that item; the AC-3 sound alone gets only OK; two .mts at once go through 🔄 Convert's
// window, one step each; the VP9 MKV on a 🤫 card gets ↻ from the 📱 preview. No toast, History row or pill names a
// file. (H.264, AAC, HEVC and AC-3 don't play in the test Chromium, so what plays in Chrome or Edge on Windows or Mac,
// and converting to MP4 (H.264) or M4A (AAC), are checked by hand.)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, editorReady, recordSeen, stored } from './helpers.mjs';
import { clip, fixturePage, noise, readBack, ts } from './mediafixtures.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser;
const errors = [];

try {
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  // The files, made in a blank page of their own: 2 s each, small (a few tens of KB).
  const fx = await fixturePage(ctx);
  const small = { w: 160, h: 90, seconds: 2, bitrate: 200_000, codec: 'vp9', box: 'mkv' };
  const files = [
    { name: 'clip.mkv', mimeType: 'video/x-matroska', buffer: await clip(fx, { ...small, audio: 'opus' }) },
    { name: 'talk.mkv', mimeType: 'video/x-matroska', buffer: await clip(fx, { ...small, audio: 'ac3' }) },
    { name: 'ac3.mka', mimeType: 'audio/x-matroska', buffer: await clip(fx, { ...small, codec: null, audio: 'ac3' }) },
    { name: 'fake.mov', mimeType: 'video/quicktime', buffer: Buffer.from(noise(4096)) },
  ];
  // (MPEG-TS with an MP3 sound: tens of KB each.)
  const party = await ts(fx, { seconds: 3 });
  const twoA = await ts(fx, { seconds: 2 });
  const twoB = await ts(fx, { seconds: 2.5 });
  await ctx.addInitScript(recordSeen);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (errors.push(`dialog: ${d.message()}`), d.accept()));
  await page.goto(pathToFileURL(file).href);
  await editorReady(page);

  await page.locator('nav > button', { hasText: '🖼 Media' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '＋ Add files…' }).click()]);
  await chooser.setFiles(files);
  const card = (name) => page.locator('.card', { has: page.locator('button.nm', { hasText: name }) });
  const meta = (name) => card(name).locator('[data-verdict]');
  /** The card's verdict once its file is checked ('plays', 'silent', 'fails', 'unknown'), and what its line says. */
  const checked = async (name) => {
    const m = meta(name);
    await page.waitForFunction((el) => !['', 'checking'].includes(el.dataset.verdict ?? ''), await m.elementHandle(), { timeout: 60_000 });
    const warn = m.locator('.warn');
    return { verdict: await m.getAttribute('data-verdict'), text: (await m.innerText()).replace(/\s+/g, ' '), title: (await warn.count()) ? ((await warn.getAttribute('title')) ?? '') : '' };
  };

  // An MKV this browser plays: no "may not play" (its type alone said it may not), and phones' 🤫 cards would want a WebM.
  const clipMkv = await checked('clip.mkv');
  assert(clipMkv.verdict === 'plays' && !clipMkv.text.includes('play'), `clip.mkv (VP9, Opus) plays: its card says nothing of it once checked (“${clipMkv.text}”)`);

  // Its sound is AC-3: the picture plays, silent.
  const talk = await checked('talk.mkv');
  assert(talk.verdict === 'silent' && talk.text.endsWith('· ⚠ plays without its sound here'), `talk.mkv (VP9, AC-3): “${talk.text}”`);
  assert(
    talk.title === 'Its sound is AC-3 (Dolby Digital), which this browser can’t play or convert. To keep its sound, convert it with a video app first (HandBrake is free).',
    `its title says why, and what to do (${talk.title})`,
  );

  // A sound alone in AC-3: it won't play at all.
  const mka = await checked('ac3.mka');
  assert(mka.verdict === 'fails' && mka.text.endsWith('· ⚠ won’t play here'), `ac3.mka: “${mka.text}”`);
  assert(mka.title === 'It’s AC-3 (Dolby Digital), which this browser can’t play or convert. Convert it to MP3 or M4A with an audio or video app first.', `its title says why (${mka.title})`);

  // Bytes the app can't read: as before, its type alone says.
  const fake = await checked('fake.mov');
  assert(fake.verdict === 'unknown' && fake.text.endsWith('· may not play') && fake.title === 'video/quicktime', `fake.mov: still “${fake.text}”`);
  const toasts = await page.evaluate(() => window.__seen.filter((t) => t.startsWith('⚠ This browser may not play')));
  assert(toasts.includes('⚠ This browser may not play "fake.mov" (video/quicktime). Try converting it to MP4 (H.264) or MP3.'), `and today’s toast, word for word (${toasts.join(' | ')})`);

  // The checklist counts them, naming none.
  const lines = async () => (await page.locator('nav .problem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const want = [
    '1 video/audio file won’t play in this browser, and it can’t convert it: 🖼 Media says why',
    '1 video plays without its sound in this browser (🖼 Media says why)',
    '1 video/audio file this browser may not play',
  ];
  await page.waitForFunction((want) => want.every((w) => [...document.querySelectorAll('nav .problem')].some((b) => b.textContent.replace(/\s+/g, ' ').includes(w))), want, { timeout: 20_000 });
  const got = (await lines()).filter((t) => /browser/.test(t));
  assert(got.length === 3 && want.every((w) => got.some((t) => t.includes(w))), `the checklist: ${got.join(' | ')}`);
  assert(!got.some((t) => /clip|talk|ac3|fake/.test(t)), 'and names no file');

  // Files already in the game are checked again after a reload (their bytes come back from storage), with no toast.
  for (let i = 0; i < 100 && ((await stored(page, 'editorDraft'))?.media?.length ?? 0) < 4; i++) await page.waitForTimeout(100);
  assert(((await stored(page, 'editorDraft'))?.media?.length ?? 0) === 4, 'the four files are stored');
  await page.reload();
  await editorReady(page);
  await page.locator('nav > button', { hasText: '🖼 Media' }).click();
  const again = await Promise.all(['clip.mkv', 'talk.mkv', 'ac3.mka', 'fake.mov'].map(async (n) => (await checked(n)).verdict));
  assert(again.join() === 'plays,silent,fails,unknown', `after a reload, each is checked again: ${again.join(', ')}`);
  const after = await page.evaluate(() => window.__seen.filter((t) => t.startsWith('⚠ This browser')));
  assert(!after.length, `with no toast (${after.join(' | ')})`);
  assert(!(await page.locator('[data-convert-notice]').count()), 'nor any note at the top: those are for files just added');

  // ---------- Part 2: 🔄 Convert on add ----------
  console.log('🔄 Convert on add:');
  const NAMES = ['party', 'talk', 'ac3', 'clip', 'two-a', 'two-b'];
  const notice = page.locator('[data-convert-notice]');
  const noticeText = async () => (await notice.locator('span').first().innerText()).replace(/\s+/g, ' ').trim();
  /** The toasts shown so far (the app's .toast), in order. */
  const toastsSeen = () => page.evaluate(() => (window.__seen ?? []).filter((_, i) => window.__seenWhere?.[i]?.el.includes('class="toast')));
  const toasted = (want) =>
    page
      .waitForFunction((want) => (window.__seen ?? []).some((t, i) => t.startsWith(want) && window.__seenWhere?.[i]?.el.includes('class="toast')), want, { timeout: 30_000 })
      .catch(async (e) => {
        throw new Error(`No toast “${want}”; the toasts were: ${(await toastsSeen()).join(' | ')} (${e.message})`);
      });
  /** The editor's game as autosave last stored it, once `ok(game)` holds. */
  const draftWhen = async (ok, what) => {
    for (let i = 0; i < 150; i++) {
      const g = await stored(page, 'editorDraft');
      if (g && ok(g)) return g;
      await page.waitForTimeout(100);
    }
    throw new Error(`The stored game never got to: ${what}`);
  };
  const refNamed = (g, name) => g.media.find((m) => m.name === name);
  /** Files dropped on 🖼 Media (as the page's ＋ Add files…). */
  const dropOnMedia = async (list) => {
    const dt = await page.evaluateHandle((list) => {
      const d = new DataTransfer();
      for (const f of list) d.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
      return d;
    }, list.map((f) => ({ name: f.name, type: f.type, b64: Buffer.from(f.buffer).toString('base64') })));
    await page.locator('.library').dispatchEvent('drop', { dataTransfer: dt });
  };
  const undoKey = async (key) => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.press(key);
  };
  const historyRows = async () => {
    await page.locator('nav > button', { hasText: '🕘 History' }).click();
    await page.locator('main .list .hr').first().waitFor();
    const rows = (await page.locator('main').innerText()).split('\n').map((t) => t.trim());
    await page.locator('nav > button', { hasText: '🖼 Media' }).click();
    return rows;
  };
  const lineOf = (text) => page.locator('nav .problem', { hasText: text });

  // 1. party.mts dropped on 🖼 Media: the note says why, and 🔄 repackages it as an MP4 in its place.
  await dropOnMedia([{ name: 'party.mts', type: 'video/mp2t', buffer: party }]);
  await notice.waitFor({ timeout: 60_000 });
  assert(
    (await noticeText()) === '⚠ “party.mts” won’t play in this browser: this browser can’t open MPEG-TS files, but its sound (MP3) is fine.',
    `the note at the top says why (${await noticeText()})`,
  );
  await toasted('⚠ A video you just added won’t play in this browser: see the note at the top.');
  assert(true, 'and a toast points at it, naming nothing');
  const partyId = (await card('party.mts').getAttribute('data-place')).slice('media:'.length);
  await lineOf('1 video/audio file won’t play in this browser: 🔄 Convert it in 🖼 Media').waitFor();
  assert(true, 'the checklist says 🔄 can convert it');
  await notice.getByRole('button', { name: '🔄 Convert it (quick, nothing lost)' }).click();
  await toasted('🔄 It plays here now: MP4, ');
  const said = (await toastsSeen()).find((t) => t.startsWith('🔄 It plays here now'));
  assert(/^🔄 It plays here now: MP4, \d+ KB \(was \d+ KB\)\. Ctrl\+Z puts the old one back\.$/.test(said), `🔄 Convert it: “${said}”`);
  await card('party.mp4').waitFor();
  const conv = refNamed(await draftWhen((g) => !!refNamed(g, 'party.mp4'), 'party.mp4'), 'party.mp4');
  assert(conv.mime === 'video/mp4' && conv.id !== partyId && !refNamed(await stored(page, 'editorDraft'), 'party.mts'), `it’s party.mp4 now, video/mp4, a new id, in party.mts’s place (${JSON.stringify(conv)})`);
  const plays = await card('party.mp4').locator('video').evaluate(
    (v) =>
      new Promise((ok) => {
        if (v.readyState >= 1) return ok(v.duration);
        v.onloadedmetadata = () => ok(v.duration);
        v.onerror = () => ok(null);
        v.load();
      }),
  );
  assert(Math.abs(plays - 3) < 0.2, `and it plays here (${plays} s)`);
  await notice.waitFor({ state: 'detached' });
  await lineOf('won’t play in this browser: 🔄').waitFor({ state: 'detached' });
  assert(true, 'the note and the checklist’s line are gone');
  assert((await historyRows()).includes('Repackaged a video as MP4 (nothing lost)'), 'History: “Repackaged a video as MP4 (nothing lost)”');
  await undoKey('Control+z');
  await card('party.mts').waitFor();
  const back = refNamed(await draftWhen((g) => !!refNamed(g, 'party.mts'), 'party.mts back'), 'party.mts');
  assert(back.id === partyId && back.mime === 'video/mp2t', `Ctrl+Z: party.mts is back, its own id and type (${JSON.stringify(back)})`);
  await undoKey('Control+y');
  await card('party.mp4').waitFor();
  assert(refNamed(await draftWhen((g) => !!refNamed(g, 'party.mp4'), 'party.mp4 again'), 'party.mp4').id === conv.id, 'Ctrl+Y: party.mp4 again');

  // 2. talk.mkv (its sound AC-3) dropped on a slide: a WebM without its sound, on that item.
  await addClassicRounds(page);
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  await page.locator('.grid .tile').first().click();
  const clueEditor = page.getByRole('dialog', { name: 'Edit clue' });
  await clueEditor.waitFor();
  const talkFile = files.find((f) => f.name === 'talk.mkv');
  const talkDrop = await page.evaluateHandle((b64) => {
    const d = new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'talk.mkv', { type: 'video/x-matroska' }));
    return d;
  }, talkFile.buffer.toString('base64'));
  await clueEditor.locator('.canvas').dispatchEvent('drop', { dataTransfer: talkDrop });
  await page.locator('.insp h4', { hasText: 'Video' }).waitFor();
  // Once its check lands, the item's panel says so, with 🔄.
  const playsNote = page.locator('.insp [data-plays-note]');
  await playsNote.waitFor({ timeout: 60_000 });
  const noteSays = (await playsNote.innerText()).replace(/\s+/g, ' ').trim();
  assert(noteSays === '⚠ It plays without its sound here (AC-3 (Dolby Digital)). 🔄 Convert…', `the item’s panel: “${noteSays}”`);
  const itemMedia = (g) => g.rounds?.[0]?.categories?.[0]?.clues?.[0]?.questionSlide?.elements.find((e) => e.kind === 'video')?.media;
  const talkId = refNamed(await draftWhen((g) => !!itemMedia(g), 'the video item'), 'talk.mkv').id;
  await page.keyboard.press('Escape');
  await clueEditor.waitFor({ state: 'detached' });
  await notice.waitFor();
  assert((await noticeText()).startsWith('⚠ “talk.mkv” plays without its sound in this browser: its sound is AC-3 (Dolby Digital)'), `the note: ${await noticeText()}`);
  // From the keys: the focus stays on what takes the button's place (Stop), and goes to the editor's tab once the
  // note goes, never to the page.
  await notice.getByRole('button', { name: '🔄 Convert it without its sound (quick)' }).focus();
  await page.evaluate(() => {
    window.__lostFocus = 0;
    const look = () => setTimeout(() => document.activeElement === document.body && window.__lostFocus++, 50);
    window.__noticeWatch = new MutationObserver(look);
    window.__noticeWatch.observe(document.querySelector('[data-convert-notice]').parentElement, { childList: true, subtree: true });
  });
  await page.keyboard.press('Enter');
  await notice.waitFor({ state: 'detached' });
  await page
    .waitForFunction(() => document.activeElement?.matches('.editor nav [aria-current="page"]'), null, { timeout: 10_000 })
    .catch(async () => {
      throw new Error(`Once the note went the focus was on ${await page.evaluate(() => (document.activeElement === document.body ? 'the page' : document.activeElement?.outerHTML.slice(0, 80)))}`);
    });
  const lost = await page.evaluate(() => (window.__noticeWatch.disconnect(), window.__lostFocus));
  assert(lost === 0, `🔄 from the keys: the focus never fell to the page (${lost}), and is on the editor’s tab once the note goes`);
  const silentGame = await draftWhen((g) => !!refNamed(g, 'talk.webm'), 'talk.webm');
  const webm = refNamed(silentGame, 'talk.webm');
  assert(webm.mime === 'video/webm' && webm.id !== talkId && itemMedia(silentGame) === webm.id, `the item is on the new file, talk.webm, video/webm (${JSON.stringify(webm)})`);
  await page.locator('nav > button', { hasText: '🖼 Media' }).click();
  const webmBytes = await card('talk.webm').locator('video').evaluate(async (v) => {
    const b = new Uint8Array(await (await fetch(v.src)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  const read = await readBack(fx, Buffer.from(webmBytes, 'base64'));
  assert(read.video === 'vp9' && read.audio === null && read.format === 'WebM', `with its picture and no sound track (${JSON.stringify(read)})`);
  assert((await historyRows()).includes('Repackaged a video as WebM without its sound'), 'History: “Repackaged a video as WebM without its sound”');
  await undoKey('Control+z');
  assert(itemMedia(await draftWhen((g) => itemMedia(g) === talkId, 'the MKV on the item')) === talkId, 'Ctrl+Z: the MKV is on the item again');
  await undoKey('Control+z');
  await draftWhen((g) => !itemMedia(g), 'no video item');
  assert(true, 'Ctrl+Z again: the item is gone');
  // (Undoing the drop shows where it was: the clue's slide.)
  await clueEditor.waitFor();
  await page.keyboard.press('Escape');
  await clueEditor.waitFor({ state: 'detached' });
  await page.locator('nav > button', { hasText: '🖼 Media' }).click();

  // 3. ac3.mka (an AC-3 sound alone): nothing can fix it here, so only OK, and no 🔄 on its card.
  await dropOnMedia([{ name: 'ac3.mka', type: 'audio/x-matroska', buffer: files.find((f) => f.name === 'ac3.mka').buffer }]);
  await notice.waitFor();
  assert(
    (await noticeText()) === '⚠ “ac3.mka” won’t play in this browser: it’s AC-3 (Dolby Digital), which this browser can’t play or convert. Convert it to MP3 or M4A with an audio or video app first.',
    `the note says why and what to do (${await noticeText()})`,
  );
  assert((await notice.getByRole('button').allInnerTexts()).join() === 'OK', 'with only OK');
  assert(!(await card('ac3.mka').locator('[data-convert]').count()), 'and its card has no 🔄');
  await notice.getByRole('button', { name: 'OK' }).click();
  await notice.waitFor({ state: 'detached' });

  // 4. Two .mts at once: one note, then 🔄 Convert's window, a row each, one step each.
  const stepsBefore = (await historyRows()).filter((t) => t === 'Repackaged a video as MP4 (nothing lost)').length;
  await dropOnMedia([
    { name: 'two-a.mts', type: 'video/mp2t', buffer: twoA },
    { name: 'two-b.mts', type: 'video/mp2t', buffer: twoB },
  ]);
  await notice.filter({ hasText: '⚠ 2 files you just added won’t play in this browser.' }).waitFor({ timeout: 60_000 });
  assert(true, 'the note: “⚠ 2 files you just added won’t play in this browser.”');
  await toasted('⚠ 2 files you just added won’t play in this browser: see the note at the top.');
  assert(true, 'and one toast for both');
  await notice.getByRole('button', { name: '🔄 Convert them…' }).click();
  const win = page.getByRole('dialog', { name: '🔄 Convert 2 files' });
  await win.waitFor();
  const rows = win.locator('[data-convert-row]');
  await win.getByText(/^About \d+ KB · MP4 \(MP3\)$/).nth(1).waitFor({ timeout: 30_000 });
  const rowTexts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert(
    rowTexts.length === 2 &&
      rowTexts.every((t) => t.includes('This browser can’t open MPEG-TS files, but its sound (MP3) is fine: it can be repackaged as an MP4 in seconds, with nothing lost.')) &&
      /^🎬 two-a\.mts · 2 s · \d+ KB/.test(rowTexts[0]),
    `a row each: ${rowTexts.join(' | ')}`,
  );
  await win.getByRole('button', { name: 'Repackage 2 files' }).click();
  await win.getByText(/^✓ MP4 · \d+ KB$/).nth(1).waitFor({ timeout: 60_000 });
  const waited = await page.evaluate(() => (window.__seen ?? []).some((t) => t.includes('(+1 waiting)')));
  assert(waited, 'the header’s pill said “(+1 waiting)” while the first was made');
  await toasted('🔄 2 files converted. Ctrl+Z puts the old ones back, one at a time.');
  assert(true, 'one toast for both: “🔄 2 files converted. Ctrl+Z puts the old ones back, one at a time.”');
  await win.locator('.modal-foot').getByRole('button', { name: 'Close' }).click();
  await card('two-a.mp4').waitFor();
  await card('two-b.mp4').waitFor();
  const stepsAfter = (await historyRows()).filter((t) => t === 'Repackaged a video as MP4 (nothing lost)').length;
  assert(stepsAfter === stepsBefore + 2, `two History steps (${stepsBefore} → ${stepsAfter})`);

  // 5. clip.mkv (VP9, Opus) plays here; on no 🤫 card it offers nothing, and on one, the 📱 preview's ↻ makes it a WebM.
  assert(!(await card('clip.mkv').locator('[data-repack]').count()), 'clip.mkv on no 🤫 card: no ↻ on its card');
  await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
  await page.getByRole('button', { name: '＋ Add card' }).click();
  const clipDrop = await page.evaluateHandle((b64) => {
    const d = new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'clip.mkv', { type: 'video/x-matroska' }));
    return d;
  }, files.find((f) => f.name === 'clip.mkv').buffer.toString('base64'));
  await page.locator('main .canvas').dispatchEvent('drop', { dataTransfer: clipDrop });
  await page.locator('.insp h4', { hasText: 'Video' }).waitFor();
  await page.getByRole('button', { name: '📱 On their phone' }).click();
  const phone = page.getByRole('complementary', { name: 'Card on their phone' });
  const kindNote = phone.locator('.notes li.warn', { hasText: 'phones can’t play this kind of video' });
  const repack = kindNote.getByRole('button', { name: '↻ Repackage as WebM (for everyone, nothing lost)' });
  await repack.waitFor({ timeout: 30_000 });
  await lineOf('has a video phones can\'t open: repackage it as a WebM (↻, nothing lost)').waitFor();
  assert(true, 'the checklist’s line says ↻ too');
  // Before the game there's no ↻: its line there offers 🗜, a copy phones can play.
  await page.getByRole('button', { name: '▶ Play' }).click();
  const preChecks = page.locator('details.checks');
  const kindLine = preChecks.locator('li', { hasText: 'has a video phones can\'t play: make a copy they can play (🗜)' });
  await kindLine.waitFor({ state: 'attached', timeout: 30_000 });
  if (!(await preChecks.evaluate((d) => d.open))) await preChecks.locator('summary').click();
  assert(
    (await kindLine.getByRole('button', { name: '🗜 Make smaller' }).count()) === 1 && !(await preChecks.innerText()).includes('↻'),
    `before the game: “${(await kindLine.innerText()).replace(/\s+/g, ' ').trim()}”, and no ↻`,
  );
  await page.getByRole('button', { name: '◀ Back to editor', exact: true }).click();
  await editorReady(page);
  if (!(await phone.isVisible())) {
    await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
    await page.getByRole('button', { name: '📱 On their phone' }).click();
  }
  await repack.waitFor({ timeout: 30_000 });
  await repack.click();
  await kindNote.waitFor({ state: 'detached' });
  await toasted('↻ Repackaged as WebM: nothing lost, and phones can open it now. Ctrl+Z puts the old one back.');
  const clipGame = await draftWhen((g) => !!refNamed(g, 'clip.webm'), 'clip.webm');
  assert(refNamed(clipGame, 'clip.webm').mime === 'video/webm' && !refNamed(clipGame, 'clip.mkv'), '↻: clip.webm in its place, and the 📱 note is gone');
  await lineOf('phones can\'t open').waitFor({ state: 'detached' });
  assert(true, 'and the checklist’s line');

  // 6. No toast, History row or pill named a file.
  const named = (list) => list.filter((t) => NAMES.some((n) => t.includes(n)));
  const allToasts = await toastsSeen();
  // (Today's toasts may name one: “talk.mkv” is already in 🖼 Media, the file added again.)
  const ours = allToasts.filter((t) => /^(⚠ A |⚠ \d+ files|🔄|↻|Stopped)/.test(t));
  assert(ours.length >= 6 && !named(ours).length, `no toast of 🔄’s names a file (${ours.join(' | ')}; others: ${named(allToasts).join(' | ')})`);
  const rows6 = (await historyRows()).filter((t) => /^(Repackaged|Converted)/.test(t));
  assert(rows6.length >= 4 && !named(rows6).length, `nor any History row (${rows6.join(' | ')})`);
  const pills = await page.evaluate(() => (window.__seen ?? []).filter((_, i) => window.__seenWhere?.[i]?.path.includes('.pill')));
  assert(pills.length && !named(pills).length, `nor the header’s pill (${[...new Set(pills)].join(' | ')})`);
  await fx.close();

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Convert E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
