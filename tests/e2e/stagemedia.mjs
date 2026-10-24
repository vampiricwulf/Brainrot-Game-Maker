// Media on the stage in play: clicking a video, or a sound's speaker icon, plays or pauses it instead of
// revealing the answer — in one window, and from the host's copy in dual-window mode (the audience plays it). A sound
// the host paused stays paused where it was when the audience window is reloaded, or closed and opened again. The
// audience window closed or opened mid-clue: the host's controls reach the copy with the sound, and only one has sound.
// A game left mid-clue: the editor's ▶ Preview and ↻ Replay of that clue play its sound from the start, and Resume game
// still has it where the game left it. A video (and a YouTube video) that comes in after the slide starts playing as it
// shows, even if its slide comes back, or the audience window reloads, before it does. Space and M go to a sound before
// a looping, muted video (a GIF), and ▶ plays a sound stopped at its Stop at again from its start.
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
/** The slide editor's panel shows the sound just added (its speaker icon box is a sound's only). */
const soundPanel = () => page.locator('.insp').getByLabel('Show a speaker icon on the slide').waitFor();
// A stand-in YouTube player (tests have no internet): it answers the app, and notes how it was asked to start.
const YT = `<!doctype html><script>
  const auto = new URLSearchParams(location.search).get('autoplay');
  window.__yt = { auto, plays: [] };
  const say = (m) => parent.postMessage(JSON.stringify(m), '*');
  addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.event === 'listening') {
      const info = { playerState: auto === '1' ? 1 : 5, currentTime: 0, duration: 10 };
      say({ event: 'initialDelivery', info });
      say({ event: 'onReady' });
      say({ event: 'infoDelivery', info });
    }
    if (d.event === 'command' && d.func === 'playVideo') {
      window.__yt.plays.push(performance.timeOrigin + performance.now());
      say({ event: 'infoDelivery', info: { playerState: 1 } });
    }
  });
</script>`;
await context.route('https://www.youtube.com/embed/**', (r) => r.fulfill({ body: YT, contentType: 'text/html' }));
await context.route(/ytimg\.com/, (r) => r.fulfill({ status: 404, body: '' }));
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
  // (The sound's own panel first: until the file is in, the video's is up, and the box there is the video's.)
  await soundPanel();
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
  // A third clue with a video and a YouTube video that play by themselves, coming in 3 s after the slide.
  await page.locator('.tile').nth(2).click();
  await page.getByRole('button', { name: '🎬 Video' }).click();
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload video file…' }).click()]);
  await fc.setFiles({ name: 'later.webm', mimeType: 'video/webm', buffer: clip });
  const comesIn = async () => {
    await page.locator('.insp').getByLabel('Entrance animation').selectOption('fade');
    await page.locator('.insp').getByLabel('Delay (s)').fill('3');
    await page.locator('.insp').getByLabel('Delay (s)').press('Tab');
  };
  await comesIn();
  await page.getByRole('button', { name: '🌐 Link' }).click();
  await page.locator('.linkbox').getByLabel('Paste a link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.locator('.linkbox').getByLabel('Paste a link').press('Enter');
  await page.locator('.canvas .card').waitFor();
  await comesIn();
  await page.getByRole('tab', { name: /Answer/ }).click();
  await page.getByRole('button', { name: /Text/ }).first().click();
  await page.keyboard.type('The later answer');
  await page.getByRole('button', { name: 'Done' }).click();
  // A fourth clue with a looping, muted video (as a GIF becomes) under a sound that's started by hand and cut at 1.5 s.
  await page.locator('.tile').nth(3).click();
  await page.getByRole('button', { name: '🎬 Video' }).click();
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload video file…' }).click()]);
  await fc.setFiles({ name: 'gif.webm', mimeType: 'video/webm', buffer: clip });
  await page.locator('.insp').getByLabel('Loop', { exact: true }).check();
  await page.locator('.insp').getByLabel('Start muted').check();
  await page.getByRole('button', { name: '🔊 Audio' }).click();
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload audio file…' }).click()]);
  await fc.setFiles({ name: 'cut.wav', mimeType: 'audio/wav', buffer: wav(4) });
  await soundPanel();
  await page.locator('.insp').getByLabel('Autoplay when the slide appears').uncheck();
  await page.locator('.insp').getByLabel('Stop at (s)').fill('1.5');
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

  // The clue whose video and YouTube video come in 3 s after the slide: each starts as it shows, not while it's hidden
  // (viewers heard it before seeing anything, and missed its start). It may start a frame early: on a loaded machine
  // that's a while, hence a second's leeway.
  await page.evaluate(() => {
    // When an item with an entrance delay shows (its delay is over), on the clock every window shares.
    window.__showsAt = (box) => {
      const a = box.getAnimations()[0];
      return a && a.startTime !== null ? performance.timeOrigin + a.startTime + parseFloat(getComputedStyle(box).animationDelay) * 1000 : null;
    };
    document.addEventListener('play', (e) => {
      if (window.__later || !e.target.matches('.stage-box .full video')) return;
      window.__later = { at: performance.timeOrigin + performance.now(), shows: window.__showsAt(e.target.closest('.el')) };
    }, true);
  });
  await page.locator('.board .tile').nth(2).click();
  await page.waitForFunction(() => !!window.__later);
  const later = await page.evaluate(() => window.__later);
  assert(later.shows !== null && later.at >= later.shows - 1000, `a video that comes in later starts as it shows (${later.shows === null ? 'before its entrance began' : `${Math.round(later.at - later.shows)} ms from it`})`);
  const yt = await (await page.locator('.stage-box .full iframe').elementHandle()).contentFrame();
  await yt.waitForFunction(() => !!window.__yt);
  assert((await yt.evaluate(() => window.__yt.auto)) === '0', "a YouTube video that comes in later isn't started by its link");
  await yt.waitForFunction(() => window.__yt.plays.length > 0);
  const ytAt = (await yt.evaluate(() => window.__yt.plays))[0];
  const ytShows = await page.locator('.stage-box .full iframe').evaluate((f) => window.__showsAt(f.closest('.el')));
  assert(ytShows !== null && ytAt >= ytShows - 1000, `it's started as it shows (${ytShows === null ? 'before its entrance began' : `${Math.round(ytAt - ytShows)} ms from it`})`);
  await page.keyboard.press('Shift+Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();
  // Its answer shown and hidden again before they come in: they still start by themselves (they came back paused at 0:00).
  const laterVideo = '.stage-box .full video';
  await page.locator('.board .tile').nth(2).click();
  await page.waitForFunction((s) => (document.querySelector(s)?.readyState ?? 0) >= 1, laterVideo);
  await page.locator('.mc .time', { hasText: '/ 0:10' }).waitFor(); // (the YouTube video's length, from its player)
  const laterAnswer = page.locator('.stage-box').getByText('The later answer');
  await page.keyboard.press('r');
  await laterAnswer.waitFor();
  await page.keyboard.press('r');
  await laterAnswer.waitFor({ state: 'detached' });
  let ran = await page.waitForFunction((s) => (document.querySelector(s)?.currentTime ?? 0) > 0.3, laterVideo, { timeout: 15000 }).then(() => true, () => false);
  assert(ran, 'the answer shown and hidden before the video comes in: it still starts by itself');
  const ytBack = await (await page.locator('.stage-box .full iframe').elementHandle()).contentFrame();
  ran = await ytBack.waitForFunction(() => window.__yt?.plays.length > 0, null, { timeout: 15000 }).then(() => true, () => false);
  assert(ran, 'and so does the YouTube video');
  await page.keyboard.press('Shift+Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();

  // The clue with a looping, muted video (a GIF) under its sound: Space and M are for the sound, and the GIF keeps
  // looping, silent. The sound cut at its Stop at plays again from its start with ▶, not on past the cut.
  const gif = '.stage-box .full video';
  const cut = '.stage-box .full audio';
  await page.locator('.board .tile').nth(3).click();
  await waitPaused(page, gif, false);
  await page.locator('.mc .item').nth(1).waitFor();
  await page.locator(cut).evaluate((a) => a.addEventListener('play', () => (window.__cutPlayed = true), { once: true }));
  await page.keyboard.press(' ');
  const heard = await page.waitForFunction(() => window.__cutPlayed, null, { timeout: 5000 }).then(() => true, () => false);
  assert(heard && !(await paused(page, gif)), 'Space plays the sound, not the GIF over it (it keeps looping)');
  const soundRow = page.locator('.mc .item', { has: page.locator('.ic', { hasText: '🔊' }) });
  await page.waitForFunction((s) => { const a = document.querySelector(s); return a.paused && a.currentTime >= 1.4; }, cut);
  await soundRow.getByRole('button', { name: 'Play' }).waitFor();
  await page.locator(cut).evaluate((a) => a.addEventListener('play', () => (window.__cutFrom = a.currentTime), { once: true }));
  await soundRow.getByRole('button', { name: 'Play' }).click();
  await page.waitForFunction(() => window.__cutFrom !== undefined);
  const cutFrom = await page.evaluate(() => window.__cutFrom);
  assert(cutFrom < 0.5, `▶ on a sound stopped at its Stop at plays it again from its start (from ${cutFrom.toFixed(2)} s)`);
  await page.keyboard.press('m');
  const hushed = await page.waitForFunction((s) => document.querySelector(s).muted, cut, { timeout: 5000 }).then(() => true, () => false);
  assert(hushed && (await page.locator(gif).evaluate((v) => v.muted)), 'M mutes the sound, and the GIF stays silent');
  // Turned down to 20% and set to 🔁 Loop: the answer shown and hidden again (R, R), it comes back so (not at 100%, once).
  await soundRow.getByRole('slider', { name: 'Volume' }).fill('0.2');
  await page.waitForFunction((s) => Math.abs(document.querySelector(s).volume - 0.2) < 0.01, cut);
  await soundRow.getByRole('button', { name: 'Loop' }).click();
  await soundRow.getByRole('button', { name: 'Loop', pressed: true }).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('r');
  await page.locator(cut).waitFor({ state: 'detached' });
  await page.keyboard.press('r');
  await page.locator(cut).waitFor({ state: 'attached' });
  await page.waitForFunction((s) => document.querySelector(s).readyState >= 1, cut);
  const back = { volume: await page.locator(cut).evaluate((a) => a.volume), loop: await soundRow.getByRole('button', { name: 'Loop' }).getAttribute('aria-pressed') };
  assert(Math.abs(back.volume - 0.2) < 0.01 && back.loop === 'true', `the answer shown and hidden again: the sound comes back at its volume, looping (${JSON.stringify(back)})`);
  await page.keyboard.press('Shift+Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();

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

  // The clue whose video and YouTube video come in later, the audience window reloaded (OBS, F5) before they show: they
  // still start by themselves there (they were held at 0:00, paused).
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();
  await page.locator('.stage-box .board .tile').nth(2).click();
  await aud.waitForFunction(() => (document.querySelector('.full video')?.readyState ?? 0) >= 1);
  await page.locator('.mc .time', { hasText: '/ 0:10' }).waitFor();
  await aud.reload();
  ran = await aud.waitForFunction(() => (document.querySelector('.full video')?.currentTime ?? 0) > 0.3, null, { timeout: 15000 }).then(() => true, () => false);
  assert(ran, 'the audience window reloaded before the video comes in: it still starts by itself there');
  const ytAud = await (await aud.locator('.full iframe').elementHandle()).contentFrame();
  ran = await ytAud.waitForFunction(() => window.__yt?.plays.length > 0, null, { timeout: 15000 }).then(() => true, () => false);
  assert(ran, 'and so does the YouTube video');

  // The sound that plays by itself, paused by the host: the audience window reloaded (OBS, F5) or closed and opened
  // again keeps it paused where it was, rather than playing it again from 0:00 with sound.
  await page.keyboard.press('Shift+Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();
  await page.locator('.stage-box .board .tile').nth(1).click();
  const song = '.full audio';
  await aud.waitForFunction((s) => (document.querySelector(s)?.currentTime ?? 0) > 1.5, song);
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).click();
  await waitPaused(aud, song, true);
  // (Turned down to 40% too.)
  await page.locator('.mc').getByRole('slider', { name: 'Volume' }).fill('0.4');
  await aud.waitForFunction((s) => Math.abs(document.querySelector(s).volume - 0.4) < 0.01, song);
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
  let now = await aud.locator(song).evaluate((a) => ({ paused: a.paused, t: a.currentTime, volume: a.volume }));
  assert(now.paused && Math.abs(now.t - at) < 0.3, `a reloaded audience window keeps the paused sound where it was (${at.toFixed(1)} s → ${now.t.toFixed(1)} s, paused)`);
  assert(Math.abs(now.volume - 0.4) < 0.01, `and at the volume the host left it at (${now.volume})`);
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

  // The audience window closed with the clue up: the host's copy is the one with sound now, so it keeps its media row,
  // and Space reaches it.
  const hostSong = '.stage-box .full audio';
  await aud2.close();
  await page.locator('[data-audience-lost]').waitFor();
  await page.waitForFunction((s) => document.querySelector(s)?.muted === false, hostSong);
  const row = await page.locator('.mc .item').waitFor({ timeout: 5000 }).then(() => true, () => false);
  assert(row, "the audience window closed mid-clue: the host's copy has sound again, and keeps its media row");
  await page.keyboard.press(' ');
  await waitPaused(page, hostSong, false);
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).waitFor();
  await page.keyboard.press(' ');
  await waitPaused(page, hostSong, true);
  await page.locator('.mc').getByRole('button', { name: 'Play' }).waitFor();
  assert(true, 'and Space plays and pauses it');
  // The clue opened again in one window (its sound playing by itself), muted (M) and turned down to 30% there, a second
  // in; then the audience window opened: its copy takes the sound over from there (muted, at 30%, at the host's time,
  // not from 0:00 at full volume), and the host's copy goes silent, staying so when the host unmutes and mutes it.
  await page.keyboard.press('Shift+Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();
  await page.locator('.stage-box .board .tile').nth(1).click();
  await waitPaused(page, hostSong, false);
  await page.waitForFunction((s) => document.querySelector(s).currentTime > 1, hostSong);
  await page.keyboard.press('m');
  await page.waitForFunction((s) => document.querySelector(s).muted, hostSong);
  await page.locator('.mc').getByRole('slider', { name: 'Volume' }).fill('0.3');
  await page.waitForFunction((s) => Math.abs(document.querySelector(s).volume - 0.3) < 0.01, hostSong);
  await page.evaluate(() => document.activeElement?.blur());
  const [aud3] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Reopen (A)' }).click()]);
  aud3.on('pageerror', (e) => errors.push('[audience 3] ' + e.message));
  await aud3.waitForLoadState('domcontentloaded');
  await aud3.waitForFunction((s) => (document.querySelector(s)?.readyState ?? 0) >= 1, song);
  const tookOver = await aud3
    .waitForFunction((s) => { const a = document.querySelector(s); return a.muted && Math.abs(a.volume - 0.3) < 0.01 && a.currentTime > 1; }, song, { timeout: 10000 })
    .then(() => true, () => false);
  const [hostT, audT] = await Promise.all([page.locator(hostSong).evaluate((a) => a.currentTime), aud3.locator(song).evaluate((a) => a.currentTime)]);
  const audWas = await aud3.locator(song).evaluate((a) => ({ muted: a.muted, volume: a.volume }));
  assert(tookOver && Math.abs(hostT - audT) < 1, `the audience window opened mid-clue picks the sound up where the host had it: muted, at 30%, at its time (host ${hostT.toFixed(1)} s, audience ${audT.toFixed(1)} s, ${JSON.stringify(audWas)})`);
  await page.waitForFunction((s) => document.querySelector(s)?.muted === true, hostSong);
  const mute = page.locator('.mc').getByRole('button', { name: 'Mute' });
  await page.waitForFunction(() => document.querySelector('.mc [aria-label="Mute"]')?.getAttribute('aria-pressed') === 'true');
  await mute.click();
  await page.waitForFunction(() => document.querySelector('.mc [aria-label="Mute"]')?.getAttribute('aria-pressed') === 'false');
  await aud3.waitForFunction((s) => document.querySelector(s)?.muted === false, song);
  assert(await page.locator(hostSong).evaluate((a) => a.muted), "unmuted, the sound comes back in the audience window only (the host's copy stays silent)");
  await mute.click();
  await aud3.waitForFunction((s) => document.querySelector(s)?.muted === true, song);

  // Left mid-clue in one window (Keep & leave), the sound paused: the editor's ▶ Preview of that clue plays it from the
  // start, and so does ↻ Replay, rather than going on from where it was. Resume game still has it paused where it was.
  // (The audience window closed with the sound muted there: the host's copy takes it over muted.)
  await aud3.close();
  await page.locator('[data-audience-lost]').waitFor();
  await page.locator('.mc .item').waitFor();
  assert(await page.locator(hostSong).evaluate((a) => a.muted), "the audience window closed with the sound muted there: the host's copy stays muted");
  await page.waitForFunction((s) => (document.querySelector(s)?.currentTime ?? 0) > 4, hostSong);
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).click();
  await waitPaused(page, hostSong, true);
  const left = await page.locator(hostSong).evaluate((a) => a.currentTime);
  await page.getByRole('button', { name: '🚪 Exit' }).click();
  await page.waitForTimeout(450); // (a click right away is ignored: a double-click guard)
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await page.getByRole('button', { name: 'Resume game' }).waitFor();
  await page.locator('.tile').nth(1).click();
  await page.getByRole('button', { name: '▶ Preview' }).click();
  const previewSong = '.canvas.previewing audio:not([data-old])';
  const started = () => page.waitForFunction((s) => { const a = document.querySelector(s); return !!a && !a.paused && a.currentTime > 0; }, previewSong).then(() => page.locator(previewSong).evaluate((a) => a.currentTime));
  let from = await started();
  assert(from < 2, `the preview plays it from the start, not from where the game left it (${from.toFixed(1)} s)`);
  await page.waitForFunction((s) => (document.querySelector(s)?.currentTime ?? 0) > 3, previewSong);
  await page.locator(previewSong).evaluate((a) => (a.dataset.old = '1'));
  await page.getByRole('button', { name: '↻ Replay' }).click();
  from = await started();
  assert(from < 2, `↻ Replay plays it again from the start (${from.toFixed(1)} s)`);
  await page.keyboard.press('Escape');
  await page.locator('.canvas.previewing').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Done' }).click();
  // 🎨 Theme and 🖼 Board images show the board on a stage of their own: they leave the game's clip where it was too.
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.locator('.preview .board').waitFor();
  await page.locator('nav button.round-tab').first().click();
  await page.getByRole('button', { name: /Board images/ }).click();
  const decor = page.locator('[aria-label="Board images"]');
  await decor.locator('.board').first().waitFor();
  await decor.getByRole('button', { name: 'Done' }).click();
  await decor.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Resume game' }).click();
  await page.getByRole('button', { name: /Single window/ }).click();
  await page.waitForFunction(([s, t]) => {
    const a = document.querySelector(s);
    return !!a && a.paused && a.readyState >= 1 && Math.abs(a.currentTime - t) < 0.3;
  }, [hostSong, left]);
  // (Past the moment its autoplay could start it again.)
  await page.waitForTimeout(1700);
  now = await page.locator(hostSong).evaluate((a) => ({ paused: a.paused, t: a.currentTime }));
  assert(now.paused && Math.abs(now.t - left) < 0.3, `and after the previews, 🎨 Theme and 🖼 Board images, Resume game has it paused where the game left it (${left.toFixed(1)} s → ${now.t.toFixed(1)} s, paused)`);

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nStage media E2E passed.');
} finally {
  await browser.close();
}
