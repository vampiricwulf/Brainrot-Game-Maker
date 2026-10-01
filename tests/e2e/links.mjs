// End-to-end test of online media links (spec §5.5), on the built file opened from disk. Every web
// request is answered by a mock below (nothing reaches the internet), shaped like the real hosts:
// - litter.catbox.moe sends Access-Control-Allow-Origin, so the game downloads a copy;
// - files.catbox.moe doesn't, so the file plays from its link ("live link");
// - Google Drive refuses its files to web pages (403), shows pictures through lh3.googleusercontent.com,
//   and plays video in its /preview player;
// - files.catbox.moe/flaky* goes down during the show, to prove viewers never see the host's error messages.
// Usage: npm run build && node tests/e2e/links.mjs   (SCREENSHOTS=dir to save screenshots)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { addClassicRounds, nameGame } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/** An RGB PNG (a gradient), made in memory. */
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round((x / w) * 255);
      raw[o + 1] = 120;
      raw[o + 2] = Math.round((y / h) * 255);
    }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** A short 8-bit mono WAV beep (plays in headless Chromium). */
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

const DRIVE_IMG = '1ImageImageImageImageImageImage12345';
const DRIVE_VID = '1VideoVideoVideoVideoVideoVideo67890';

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
// Hermetic: any web request fails unless a mock answers it (routes registered later take precedence).
await context.route(/^https?:\/\//, (r) => r.abort());
const litterPic = png(320, 180);
// Sound-only files in containers that also hold video (only their first bytes matter here).
const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(200)]);
const weba = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(200)]);
// A host that allows downloads. It calls pictures application/octet-stream, like many hosts do.
await context.route('https://litter.catbox.moe/**', (r) => {
  const u = r.request().url();
  const [type, body] = u.endsWith('.m4a') ? ['audio/mp4', m4a] : u.endsWith('.weba') ? ['audio/webm', weba] : ['application/octet-stream', litterPic];
  return r.fulfill({ status: 200, headers: { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }, body });
});
// A host that doesn't: the page can show or play its files but not read them. (Playwright adds an
// Access-Control-Allow-Origin to mocked answers that have none, so this one allows only the host's own site,
// which the browser refuses for our page exactly as it refuses a missing header.)
const onlyItself = { 'Access-Control-Allow-Origin': 'https://catbox.moe' };
await context.route('https://files.catbox.moe/**', (r) => {
  const u = r.request().url();
  if (u.endsWith('.wav')) return r.fulfill({ status: 200, contentType: 'audio/wav', headers: onlyItself, body: wav(2) });
  return r.fulfill({ status: 200, contentType: 'image/png', headers: onlyItself, body: png(200, 120) });
});
// The same host, for files that go missing during the show (the "host is down" checks), never cached.
let catboxDown = false;
await context.route('https://files.catbox.moe/flaky*', (r) => {
  const headers = { ...onlyItself, 'Cache-Control': 'no-store' };
  if (catboxDown) return r.fulfill({ status: 404, contentType: 'text/plain', headers, body: 'Not found' });
  const sound = r.request().url().endsWith('.wav');
  return r.fulfill({ status: 200, contentType: sound ? 'audio/wav' : 'image/png', headers, body: sound ? wav(2) : png(200, 120) });
});
// A slow host (for Cancel): it answers after a few seconds.
await context.route('https://slow.test/**', (r) =>
  setTimeout(() => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: png(10, 10) }).catch(() => {}), 4000),
);
// A web page, not a file (this site allows reading it, so the game can tell it's a page).
await context.route('https://example.test/**', (r) =>
  r.fulfill({ status: 200, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }, body: '<!DOCTYPE html><html><body>An article</body></html>' }),
);
// Google Drive: pictures through lh3, video in Drive's player page, and the file itself refused (403) to pages.
await context.route('https://lh3.googleusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(400, 300) }));
await context.route('https://drive.google.com/file/d/*/preview*', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><title>Fake Drive player</title><body style="background:#222;color:#fff">Drive player</body>' }),
);
const usercontent = { fromPage: 0, visits: [] };
await context.route('https://drive.usercontent.google.com/**', (r) => {
  if (r.request().isNavigationRequest()) usercontent.visits.push(r.request().url());
  else usercontent.fromPage++;
  return r.fulfill({ status: 403, contentType: 'text/html', body: "<!DOCTYPE html><html><body>403. That's an error.</body></html>" });
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => {
  if (d.type() === 'alert') errors.push('alert: ' + d.message());
  d.accept();
});
async function onFailure(e) {
  console.error(e);
  try {
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/links-failure.png', fullPage: true });
  } catch {
    /* best effort */
  }
  process.exit(1);
}
process.on('uncaughtException', onFailure);
process.on('unhandledRejection', onFailure);
const shot = (name, p = page) => shots && p.screenshot({ path: `${shots}/${name}.png` });
const toast = () => page.locator('.toast').innerText();

await page.goto(url);
await addClassicRounds(page);
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
await page.locator('.cat textarea').first().fill('Links');

// ---------- A host that allows downloads: the file is saved in the game ----------
await page.locator('.tile').nth(0).click();
await page.locator('.quick textarea').first().fill('Saved and live media');
await page.getByRole('button', { name: '🖼 Image' }).click();
await page.locator('.picker').getByText('Direct file link, e.g. https://files.catbox.moe/abc123.png').waitFor();
await page.locator('.picker').getByLabel('Paste a link').fill('https://litter.catbox.moe/frog1.png');
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.canvas img').waitFor();
assert(
  (await toast()).includes('Saved a copy in your game. It works offline now (the link itself expires within 3 days).'),
  'a litter.catbox.moe picture is downloaded into the game, with a note that the link expires',
);
assert((await page.locator('.canvas img').getAttribute('src')).startsWith('blob:'), 'the slide shows the saved copy, not the link');

// ---------- A host that doesn't: a live link that plays from the internet ----------
await page.getByRole('button', { name: '🔊 Audio' }).click();
await page.locator('.picker').getByLabel('Paste a link').fill('https://files.catbox.moe/beep1.wav');
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.insp').getByText('Autoplay when the slide appears').waitFor();
assert(
  (await toast()).includes("This site doesn't let the game save a copy, so it will play from files.catbox.moe during the show. You'll need internet. The desktop app can save a copy."),
  'a files.catbox.moe sound becomes a live link, and the toast says so',
);
assert((await page.locator('.insp').getByText('🌐 Plays from files.catbox.moe during the show').count()) === 1, 'the inspector marks the item as playing from the internet');
await shot('links-1-editor');
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Links that can't work explain why; Drive video goes in Drive's player ----------
await page.locator('.tile').nth(1).click();
await page.locator('.quick textarea').first().fill('Drive video');
await page.getByRole('button', { name: '🌐 Link' }).click();
const box = page.locator('.linkbox');
const linkInput = box.getByLabel('Paste a link');
await linkInput.fill('https://example.test/article');
await linkInput.press('Enter');
await box.locator('.error').waitFor();
assert((await box.locator('.error').innerText()).includes('That link opens a web page, not a picture, video or sound file.'), 'a web page link says it is a page, not a file');
await linkInput.fill('https://cdn.discordapp.com/attachments/111/222/clip.mp4');
await linkInput.press('Enter');
await box.getByText('This Discord link is incomplete.', { exact: false }).waitFor();
assert(true, 'a Discord link without its signature asks for the whole link');
await linkInput.fill(`https://drive.google.com/file/d/${DRIVE_VID}/view?usp=sharing`);
await linkInput.press('Enter');
await box.getByText('Is this Google Drive file a picture, or a video or sound?').waitFor();
await box.getByRole('button', { name: '🎬 Video or sound' }).click();
await shot('links-0-drive-choice');
assert((await box.getByText('In Google Drive: Share → General access → Anyone with the link → Copy link.').count()) === 1, 'Drive shows how to share the file');
await box.getByRole('button', { name: "▶ Use Google Drive's player" }).click();
await page.locator('.canvas .card', { hasText: "Google Drive player · click ▶ inside it on the viewers' screen" }).waitFor();
assert((await page.locator('.canvas iframe').count()) === 0, "the editor shows a card for Drive's player, not the player itself");
assert((await page.locator('.insp h4', { hasText: 'Google Drive player' }).count()) === 1, 'the inspector names it');
await page.getByRole('button', { name: 'Done' }).click();

// ---------- A picture that plays from its link: the image editor asks for a copy first ----------
await page.locator('.tile').nth(2).click();
await page.getByRole('button', { name: '🖼 Image' }).click();
await page.locator('.picker').getByLabel('Paste a link').fill('https://files.catbox.moe/pic3.png');
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.canvas img').waitFor();
assert((await page.locator('.canvas img').getAttribute('src')) === 'https://files.catbox.moe/pic3.png', 'a live-link picture shows on the slide from its link');
await page.getByRole('button', { name: '🎨 Edit image…' }).click();
await page.locator('.gate').getByText('🌐 This picture plays from files.catbox.moe. The image editor works on a copy saved in your game.').waitFor();
assert(await page.locator('.gate').getByRole('button', { name: '💾 Save a copy first' }).isVisible(), 'the image editor offers to save a copy first');
await page.locator('.gate').getByRole('button', { name: 'Cancel' }).click();
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Drive picture (a category image): shown through Google's picture link ----------
await page.locator('.cat').nth(2).getByTitle('Use an image for this category (or drop one here)').click();
await page.locator('.picker').getByLabel('Paste a link').fill(`https://drive.google.com/file/d/${DRIVE_IMG}/view?usp=drive_link`);
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.cat').nth(2).locator('.cat-img img').waitFor();
assert(
  (await page.locator('.cat').nth(2).locator('.cat-img img').getAttribute('src')) === `https://lh3.googleusercontent.com/d/${DRIVE_IMG}=w1920`,
  'a Google Drive picture shows through lh3.googleusercontent.com',
);

// ---------- Drive video for a game sound (not a slide): a clear message and "Download from Drive" ----------
await page.getByRole('button', { name: '🔊 Sounds' }).click();
await page.getByRole('button', { name: 'Choose file…' }).first().click();
await page.locator('.picker').getByLabel('Paste a link').fill(`https://drive.google.com/open?id=${DRIVE_VID}`);
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.picker').getByText("Drive videos and sounds can't play inside the browser version. Download the file and add it, or use the desktop app.").waitFor();
await shot('links-0-picker');
assert(true, 'a Drive sound outside a slide explains the browser limit');
const [dl] = await Promise.all([context.waitForEvent('page'), page.locator('.picker').getByRole('button', { name: '⬇ Download from Drive' }).click()]);
await dl.waitForLoadState('domcontentloaded').catch(() => {});
assert(
  usercontent.visits.some((v) => v.startsWith(`https://drive.usercontent.google.com/download?id=${DRIVE_VID}&export=download`)),
  '"Download from Drive" opens Google\'s download in a new tab (a visit, which Google allows)',
);
await dl.close();
assert(await page.locator('.picker').getByRole('button', { name: '⬆ Add the downloaded file…' }).isVisible(), 'then offers to add the downloaded file');
await page.keyboard.press('Escape');
assert(usercontent.fromPage === 0, 'the page never loads the Drive file itself (Google refuses it with 403)');

// ---------- Media tab ----------
await page.getByRole('button', { name: /Media \(/ }).click();
const card = (name) => page.locator('.grid .card', { hasText: name });
assert(/\d+(\.\d+)? KB/.test(await card('frog1.png').locator('.meta').first().innerText()), 'the saved copy shows its size');
assert((await card('frog1.png').getByText('Saved from litter.catbox.moe').count()) === 1, 'and where it came from');
assert((await card('beep1.wav').getByText('🌐 files.catbox.moe').count()) === 1, 'the live link shows its site instead of a size');
assert((await card('Google Drive picture').getByText('🌐 lh3.googleusercontent.com').count()) === 1, 'so does the Drive picture');
assert((await page.getByText(/Files stored with this game: 1 ·/).count()) === 1 && (await page.getByText(/3 more play from the internet/).count()) === 1, 'the total counts stored files only');
await card('beep1.wav').getByRole('button', { name: 'Check link' }).click();
await card('beep1.wav').getByText('✓ The link works').waitFor();
assert(true, 'Check link plays the link to see that it works');
await card('beep1.wav').getByRole('button', { name: '💾 Save a copy' }).click();
await page.locator('.toast', { hasText: "files.catbox.moe doesn't let the game save a copy." }).waitFor();
assert((await card('beep1.wav').getByText('🌐 files.catbox.moe').count()) === 1, "Save a copy explains when the site refuses, and the link keeps working");
assert((await page.locator('.problems').getByText('4 items play from the internet').count()) === 1, 'the checklist counts what plays from the internet (3 links + 1 Drive player)');
await shot('links-2-media');
// Save a copy works once the site allows it (here the host starts sending Access-Control-Allow-Origin).
await context.route('https://files.catbox.moe/pic3.png', (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: png(200, 120) }),
);
await card('pic3.png').getByRole('button', { name: '💾 Save a copy' }).click();
await card('pic3.png').getByText('Saved from files.catbox.moe').waitFor();
assert(/\d+(\.\d+)? KB/.test(await card('pic3.png').locator('.meta').first().innerText()) && (await card('pic3.png').locator('.badge').count()) === 0, 'Save a copy downloads a live link into the game (same file, now stored)');
assert((await page.getByText(/Files stored with this game: 2 ·/).count()) === 1, 'and it counts as stored');

// ---------- Sounds in MP4 and WebM files (a container that can also hold video) ----------
await page.getByRole('button', { name: '🔊 Sounds' }).click();
for (const [row, name] of [['Winner', 'isom-voice.m4a'], ['Final round think music', 'voice.weba']]) {
  await page.locator('.sound', { hasText: row }).getByRole('button', { name: 'Choose file…' }).click();
  await page.locator('.picker').getByLabel('Paste a link').fill(`https://litter.catbox.moe/${name}`);
  await page.locator('.picker').getByLabel('Paste a link').press('Enter');
  await page.locator('.sound', { hasText: row }).locator('.file', { hasText: name }).waitFor();
  assert((await page.locator('.toast', { hasText: 'Saved a copy in your game.' }).count()) >= 1, `a sound picker takes ${name} (sent as ${name.endsWith('.m4a') ? 'audio/mp4' : 'audio/webm'}) as a sound`);
}

// ---------- A clue whose host will go down during the show, and a player link that isn't valid ----------
await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
await page.locator('.tile').nth(3).click();
await page.locator('.quick textarea').first().fill('Flaky host');
await page.getByRole('button', { name: '🖼 Image' }).click();
// Cancel while it's still working: the cursor goes back to the field, so Esc still closes only the picker.
await page.locator('.picker').getByLabel('Paste a link').fill('https://slow.test/big.png');
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.picker progress[aria-label="Download progress"]').waitFor();
await page.locator('.picker').getByRole('button', { name: 'Cancel' }).click();
await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Paste a link');
assert(true, 'after Cancel the cursor is back in the link field');
await page.keyboard.press('Escape');
await page.locator('.picker').waitFor({ state: 'detached' });
assert((await page.locator('.quick textarea').count()) > 0, 'and Esc then closes only the picker, not the clue');
await page.getByRole('button', { name: '🖼 Image' }).click();
await page.locator('.picker').getByLabel('Paste a link').fill('https://files.catbox.moe/flaky5.png');
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.canvas img[src="https://files.catbox.moe/flaky5.png"]').waitFor();
await page.getByRole('button', { name: '🔊 Audio' }).click();
await page.locator('.picker').getByLabel('Paste a link').fill('https://files.catbox.moe/flaky5.wav');
await page.locator('.picker').getByLabel('Paste a link').press('Enter');
await page.locator('.insp').getByText('🌐 Plays from files.catbox.moe during the show').waitFor();
await page.getByRole('button', { name: '🌐 Link' }).click();
await page.locator('.linkbox').getByLabel('Paste a link').fill(`https://drive.google.com/file/d/${DRIVE_VID}/view`);
await page.locator('.linkbox').getByLabel('Paste a link').press('Enter');
await page.locator('.linkbox').getByRole('button', { name: '🎬 Video or sound' }).click();
await page.locator('.linkbox').getByRole('button', { name: "▶ Use Google Drive's player" }).click();
await page.locator('.insp').getByLabel('Link', { exact: true }).fill('https://example.test/not-a-drive-file');
await page.locator('.canvas .card', { hasText: 'Not a valid link for the Google Drive player' }).waitFor();
assert(true, 'the editor says when a Drive player link is not valid');
await page.getByRole('button', { name: 'Done' }).click();

// ---------- Save: live links stay links in the pack ----------
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click().then(() => nameGame(page))]);
const zip = await JSZip.loadAsync(readFileSync(await download.path()));
const packed = JSON.parse(await zip.file('game.json').async('text'));
const beep = packed.media.find((m) => m.name === 'beep1.wav');
const frog = packed.media.find((m) => m.name === 'frog1.png');
assert(beep?.url === 'https://files.catbox.moe/beep1.wav' && !zip.file(new RegExp(`media/${beep.id}`)).length, 'the pack keeps the live link as a link (no file)');
assert(frog?.source === 'https://litter.catbox.moe/frog1.png' && zip.file(new RegExp(`media/${frog.id}`)).length === 1, 'the saved copy is packed as a file, with its source');

// ---------- The litterbox host goes away: the saved copy still shows ----------
await context.unroute('https://litter.catbox.moe/**');

// ---------- Play, with the audience window ----------
await page.getByRole('button', { name: '▶ Play' }).click();
await page.getByRole('button', { name: '＋ Add 3 sample players' }).click();
await page.getByRole('button', { name: 'Start game ▶' }).click();
await page.getByRole('button', { name: 'Skip intro' }).click();
await page.locator('.board .tile').first().waitFor();
const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
await aud.locator('.board').waitFor();
await aud.mouse.click(20, 20); // lets the audience window play sound
const natural = (loc) => loc.evaluate((i) => new Promise((res) => (i.complete ? res(i.naturalWidth) : (i.onload = () => res(i.naturalWidth)))));
const catImg = aud.locator('.board img.cat-img');
await catImg.waitFor();
assert((await catImg.getAttribute('src')).startsWith('https://lh3.googleusercontent.com/d/') && (await natural(catImg)) > 0, 'the audience window shows the Drive picture from its link');

await page.locator('.board .tile').nth(0).click();
const audImg = aud.locator('.full img');
await audImg.waitFor();
assert((await audImg.getAttribute('src')).startsWith('blob:') && (await natural(audImg)) > 0, 'the saved copy shows in the audience window with its host gone (it was sent as a file)');
const audAudio = aud.locator('.full audio');
await audAudio.waitFor({ state: 'attached' });
assert((await audAudio.getAttribute('src')) === 'https://files.catbox.moe/beep1.wav', 'the audience window plays the live link straight from the internet');
await aud.waitForFunction(() => {
  const a = document.querySelector('.full audio');
  return !!a && a.currentTime > 0;
}, null, { timeout: 10000 });
assert(true, 'and it plays');
await page.locator('.mc .item').waitFor();
assert((await page.locator('.mc .item').innerText()).includes('0:'), 'the host controls it like any other sound');
await shot('links-3-audience', aud);
await page.keyboard.press('Escape');
await aud.locator('.board').waitFor();

// Drive's player: only in the audience window; the host gets a card and restart/stop/open buttons.
await page.locator('.board .tile').nth(1).click();
const frame = aud.locator(`iframe[src="https://drive.google.com/file/d/${DRIVE_VID}/preview"]`);
await frame.waitFor();
assert(true, "the audience window shows Google Drive's player");
assert((await page.locator('.stage-box iframe').count()) === 0, "the host window doesn't (the sound would play twice)");
assert((await page.locator('.stage-box .card', { hasText: 'Google Drive player' }).count()) === 1, 'the host sees a card in its place');
await page.locator('.mc').getByText('click ▶ inside it in the audience window').waitFor();
assert((await page.locator('.mc').getByText("It can't be paused or sought from here.").count()) === 1, 'the host controls say it cannot be controlled remotely');
await page.locator('.mc').getByRole('button', { name: '■ Stop' }).click();
await frame.waitFor({ state: 'detached' });
assert(true, 'Stop takes the player off the audience screen');
await page.locator('.mc').getByRole('button', { name: '▶ Show player' }).click();
await frame.waitFor();
assert(true, 'Show player puts it back');
const [pop] = await Promise.all([context.waitForEvent('page'), page.locator('.mc').getByRole('button', { name: 'Open player window ↗' }).click()]);
assert(pop.url() === `https://drive.google.com/file/d/${DRIVE_VID}/preview`, "Open player window opens Drive's player in its own window");
await pop.close();
await shot('links-4-host');
await page.keyboard.press('Escape');

// ---------- The host goes down during the show: viewers never see the host's error messages ----------
catboxDown = true;
await page.locator('.board .tile').nth(3).click();
await aud.locator('.full', { hasText: 'Flaky host' }).waitFor();
await page.locator('.mc').getByText("Couldn't load this media.").waitFor();
assert((await page.locator('.mc').getByRole('button', { name: '▶ Open link ↗' }).count()) === 1, 'the host controls say the live sound failed and offer its link');
await page.locator('.stage-box').getByText("Couldn't load the picture from files.catbox.moe").waitFor();
assert(true, "the host's copy of the stage says the live picture couldn't load");
assert((await page.locator('.stage-box .card', { hasText: 'Not a valid link for the Google Drive player' }).count()) === 1, "and that the Drive player's link isn't valid");
await aud.waitForFunction(() => !document.querySelector('.full img'));
const audText = await aud.locator('.full').innerText();
assert(!/couldn.t load|open the link|not a valid link|files\.catbox\.moe/i.test(audText), `the audience window shows none of it (it says: ${JSON.stringify(audText.trim())})`);
assert((await aud.locator('.full .fallback, .full .missing, .full .card').count()) === 0, 'no error boxes on the audience screen either');
await shot('links-5-host-down', aud);
await shot('links-5-host-down-host');
await page.keyboard.press('Escape');
await aud.locator('.board').waitFor();
catboxDown = false;

assert(usercontent.fromPage === 0, 'Drive files were never loaded by the page');

// ---------- Reopen the saved .jbr: live links are still links ----------
await page.getByRole('button', { name: 'Exit' }).click();
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Leave', exact: true }).click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open…' }).click()]);
await chooser.setFiles({ name: 'links.jbr', mimeType: 'application/zip', buffer: readFileSync(await download.path()) });
// (The game open is the one saved, so it isn't asked about; the same game opens in its place.)
await page.getByText(/^Opened "/).waitFor();
await page.waitForFunction(() => document.querySelector('.cat textarea')?.value === 'Links');
await page.locator('.tile').nth(3).click();
await page.locator('.canvas img').waitFor();
assert((await page.locator('.canvas img').getAttribute('src')) === 'https://files.catbox.moe/flaky5.png', 'a reopened .jbr shows the live picture from its link');
await page.getByRole('button', { name: 'Done' }).click();
assert(
  (await page.locator('.cat').nth(2).locator('.cat-img img').getAttribute('src')) === `https://lh3.googleusercontent.com/d/${DRIVE_IMG}=w1920`,
  'and the Drive picture from its link',
);

// ---------- The exported HTML plays live links too ----------
const [html] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export HTML' }).click()]);
mkdirSync('test-results', { recursive: true });
const exported = resolve('test-results/links-exported.html');
await html.saveAs(exported);
const player = await context.newPage();
player.on('pageerror', (e) => errors.push('[exported] ' + e.message));
await player.goto(pathToFileURL(exported).href);
await player.getByRole('button', { name: '▶ Play' }).waitFor();
// Used live links (beep1, the Drive picture, flaky5.png/.wav) and the two Drive players.
assert((await player.getByText('🌐 6 items in this game play from the internet').count()) === 1, 'the exported game says what plays from the internet');
await player.getByRole('button', { name: '▶ Play' }).click();
const samples = player.getByRole('button', { name: '＋ Add 3 sample players' });
if (await samples.count()) await samples.click();
await player.getByRole('button', { name: 'Start game ▶' }).click();
await player.getByRole('button', { name: 'Skip intro' }).click();
await player.locator('.board .tile').nth(3).click();
const liveImg = player.locator('.full img');
await liveImg.waitFor();
assert((await liveImg.getAttribute('src')) === 'https://files.catbox.moe/flaky5.png' && (await natural(liveImg)) > 0, 'the exported game shows the live picture from its link');
assert((await player.locator('.full .card').count()) === 0, "the single-window stage doesn't show the invalid Drive link's message");
await player.close();
assert(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log('\nLinks E2E passed.');
