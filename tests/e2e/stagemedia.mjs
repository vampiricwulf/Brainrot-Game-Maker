// Media on the stage in play: clicking a video, or a sound's speaker icon, plays or pauses it instead of
// revealing the answer — in one window, and from the host's copy in dual-window mode (the audience plays it).
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
  await page.getByRole('button', { name: 'Done' }).click();

  await playWithPlayers(page, 1);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().click();
  const video = '.stage-box .full video';
  const audio = '.stage-box .full audio';
  const icon = page.locator('.stage-box .full button.icon');
  await page.locator(video).waitFor();
  assert((await paused(page, video)) && (await paused(page, audio)), 'the clue opens with its video and sound stopped');

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
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
  aud.on('pageerror', (e) => errors.push('[audience] ' + e.message));
  const audVideo = '.full video';
  const audAudio = '.full audio';
  await aud.locator(audVideo).waitFor();
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

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nStage media E2E passed.');
} finally {
  await browser.close();
}
