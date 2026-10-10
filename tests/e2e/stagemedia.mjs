// Media on the stage in play: clicking a video, or a sound's speaker icon, plays or pauses it instead of
// revealing the answer — in one window, and from the host's copy in dual-window mode (the audience plays it). A sound
// the host paused stays paused where it was when the audience window is reloaded, or closed and opened again.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** 8 kHz mono WAV with a tone. */
function wav(seconds) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((i / rate) * 2 * Math.PI * 440));
  return b;
}
/** A three-second WebM clip, recorded in the page (node has no video encoder). */
async function webm() {
  const b64 = await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `hsl(${i * 4} 80% 50%)`;
      g.fillRect(0, 0, 160, 90);
      await new Promise((r) => setTimeout(r, 33));
    }
    rec.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  });
  return Buffer.from(b64, 'base64');
}
const paused = (p, sel) => p.locator(sel).evaluate((m) => m.paused);
const waitPaused = (p, sel, v) => p.waitForFunction(([s, want]) => document.querySelector(s)?.paused === want, [sel, v], { timeout: 5000 });
const answer = (p) => p.getByText('The answer text').count();
const guard = () => page.waitForTimeout(500); // past the stage's double-click guard
// 4×4 white PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8AARLgBAAC0BAP/HpJ+EwAAAABJRU5ErkJggg==';

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  const clip = await webm();

  // A clue with a video and a sound (with its speaker icon on), both started by hand.
  await page.locator('.tile').first().click();
  await page.getByRole('button', { name: '🎬 Video' }).click();
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload video file…' }).click()]);
  await fc.setFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: clip });
  await page.locator('.insp').getByLabel('Autoplay when the slide appears').uncheck();
  await page.getByRole('button', { name: '🔊 Audio' }).click();
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload audio file…' }).click()]);
  await fc.setFiles({ name: 'beep.wav', mimeType: 'audio/wav', buffer: wav(4) });
  await page.locator('.insp').getByLabel('Autoplay when the slide appears').uncheck();
  await page.locator('.insp').getByLabel('Show a speaker icon on the slide').check();
  await page.getByRole('tab', { name: /Answer/ }).click();
  await page.getByRole('button', { name: /Text/ }).first().click();
  await page.keyboard.type('The answer text');
  // And a picture whose file then goes missing from this computer (gone from the browser's storage, then a reload),
  // in the slide's corner, away from the video.
  await page.getByRole('tab', { name: /Question/ }).click();
  await page.getByRole('button', { name: '🖼 Image' }).click();
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload image file…' }).click()]);
  await fc.setFiles({ name: 'gone.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  const position = page.locator('.insp section', { hasText: 'Position' });
  await position.getByLabel('X', { exact: true }).fill('0');
  await position.getByLabel('Y', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Done' }).click();
  // A second clue whose sound plays by itself when it opens (8 s: still going when the audience window reloads).
  await page.locator('.tile').nth(1).click();
  await page.getByRole('button', { name: '🔊 Audio' }).click();
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload audio file…' }).click()]);
  await fc.setFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: wav(8) });
  assert(await page.locator('.insp').getByLabel('Autoplay when the slide appears').isChecked(), 'a sound plays by itself when its slide appears, unless told not to');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(900);
  await page.evaluate(
    () =>
      new Promise((done, fail) => {
        const open = indexedDB.open('keyval-store');
        open.onsuccess = () => {
          const tx = open.result.transaction('keyval', 'readwrite');
          const cursor = tx.objectStore('keyval').openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            if (String(c.key).startsWith('media:') && c.value?.type === 'image/png') c.delete();
            c.continue();
          };
          tx.oncomplete = done;
          tx.onerror = fail;
        };
        open.onerror = fail;
      }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(600);

  await playWithPlayers(page, 1);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().click();
  const video = '.stage-box .full video';
  const audio = '.stage-box .full audio';
  const icon = page.locator('.stage-box .full button.icon');
  await page.locator(video).waitFor();
  const stopped = { video: await paused(page, video), sound: await paused(page, audio) };
  assert(stopped.video && stopped.sound, `the clue opens with its video and sound stopped (${JSON.stringify(stopped)})`);
  assert((await page.locator('.stage-box .full .missing').count()) === 0, 'one window (what the stream shows): no "Missing image" box for the missing picture');

  // One window.
  await page.locator(video).click();
  await waitPaused(page, video, false);
  assert((await answer(page)) === 0, 'clicking the video plays it, without revealing the answer');
  await guard();
  await page.locator(video).click();
  await waitPaused(page, video, true);
  assert((await answer(page)) === 0, 'clicking it again pauses it');
  await guard();
  await icon.click();
  await waitPaused(page, audio, false);
  assert((await answer(page)) === 0, "clicking the sound's speaker icon plays it, without revealing the answer");
  await guard();
  await icon.click();
  await waitPaused(page, audio, true);
  assert((await answer(page)) === 0, 'clicking the icon again pauses it');

  // Dual-window mode: the host clicks its (silent) copy, the audience window plays.
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
  aud.on('pageerror', (e) => errors.push('[audience] ' + e.message));
  const audVideo = '.full video';
  const audAudio = '.full audio';
  await aud.locator(audVideo).waitFor();
  assert(
    (await page.locator('.stage-box .full .missing').count()) === 1 && (await aud.locator('.full .missing').count()) === 0,
    "dual mode: the host's copy says the picture is missing; viewers just don't see it",
  );
  await guard();
  await page.locator(video).click();
  await waitPaused(aud, audVideo, false);
  assert((await answer(page)) === 0 && (await answer(aud)) === 0, 'dual mode: clicking the video on the host plays it in the audience window, answer still hidden');
  assert(await page.locator(video).evaluate((m) => m.muted), "the host's copy stays silent");
  await guard();
  await icon.click();
  await waitPaused(aud, audAudio, false);
  await page.waitForFunction(() => document.querySelector('.stage-box .full button.icon')?.textContent === '⏸');
  assert(true, "dual mode: the speaker icon plays the sound in the audience window, and shows ⏸ to the host");
  assert((await aud.locator('.full button.icon').count()) === 0 && (await aud.locator('.full .icon').innerText()) === '🔊', 'the audience sees the plain speaker icon');
  await guard();
  await icon.click();
  await waitPaused(aud, audAudio, true);
  await guard();
  await page.locator(video).click();
  await waitPaused(aud, audVideo, true);
  assert((await answer(aud)) === 0, 'and both pause again from the host');

  // Revealing still works: a click on the slide away from the media.
  await guard();
  await page.locator('.stage-box .full').click({ position: { x: 10, y: 10 } });
  await aud.getByText('The answer text').waitFor();
  assert(true, 'clicking elsewhere on the slide still reveals the answer');

  // The sound that plays by itself, paused by the host: the audience window reloaded (OBS, F5) or closed and opened
  // again keeps it paused where it was, rather than playing it again from 0:00 with sound.
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();
  await page.locator('.stage-box .board .tile').nth(1).click();
  const song = '.full audio';
  await aud.waitForFunction((s) => (document.querySelector(s)?.currentTime ?? 0) > 1.5, song);
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).click();
  await waitPaused(aud, song, true);
  const at = await aud.locator(song).evaluate((a) => a.currentTime);
  const heldAt = (p) =>
    p.waitForFunction(([s, t]) => {
      const a = document.querySelector(s);
      return !!a && a.paused && a.readyState >= 1 && Math.abs(a.currentTime - t) < 0.3;
    }, [song, at]);
  await aud.reload();
  await heldAt(aud);
  // (Past the moment its autoplay could start it again.)
  await aud.waitForTimeout(1700);
  let now = await aud.locator(song).evaluate((a) => ({ paused: a.paused, t: a.currentTime }));
  assert(now.paused && Math.abs(now.t - at) < 0.3, `a reloaded audience window keeps the paused sound where it was (${at.toFixed(1)} s → ${now.t.toFixed(1)} s, paused)`);
  await page.locator('.mc').getByRole('button', { name: 'Play' }).waitFor();
  assert(true, "and the host's media row still says it's paused");
  await aud.close();
  await page.locator('[data-audience-lost]').waitFor();
  const [aud2] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Reopen (A)' }).click()]);
  aud2.on('pageerror', (e) => errors.push('[audience 2] ' + e.message));
  await heldAt(aud2);
  await aud2.waitForTimeout(1700);
  now = await aud2.locator(song).evaluate((a) => ({ paused: a.paused, t: a.currentTime }));
  assert(now.paused && Math.abs(now.t - at) < 0.3, `closed and opened again, it's still paused where it was (${now.t.toFixed(1)} s)`);

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nStage media E2E passed.');
} finally {
  await browser.close();
}
