// Whether a video or sound really plays in this browser (card-files spec §4.12, stage 6b.1), end to end in the test
// Chromium: files made here (an MKV with VP9 and Opus, which plays though its type says it may not; one whose sound is
// AC-3, which no browser plays; an AC-3 sound alone; bytes no app can read, named .mov), added in 🖼 Media. Each card
// says what was found once the file is checked: nothing, "plays without its sound here", "won't play here" (its
// title says why), or today's "may not play" and toast, word for word, for the one the app can't read. So does the
// checklist, counting and naming nothing. A reload checks the files again. (H.264, AAC, HEVC and AC-3 don't play in
// the test Chromium, so what plays in Chrome or Edge on Windows or Mac is checked by hand.)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, recordSeen, stored } from './helpers.mjs';
import { clip, fixturePage, noise } from './mediafixtures.mjs';

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
  await fx.close();
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
  const want = ['1 video/audio file won’t play in this browser: 🖼 Media says why', '1 video plays without its sound in this browser (🖼 Media says why)', '1 video/audio file this browser may not play'];
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

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Convert E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
