// A YouTube video set to Sound only: the slide editor shows it so (its picture dimmed, a "🔊 Sound only" badge, what
// players will see), and Ctrl+Z / Ctrl+Y take the choice back and forth. In play the player still loads and plays, but
// unseen, in one window and in the audience window; the host's media row plays, pauses and turns it up or down through
// it as for any YouTube video. Players see the chosen stand-in: a time bar that runs over the part it plays ("0:12 /
// 0:30", once its length is known), or nothing at all. A player that fails shows no card to viewers (the host's own
// copy still offers it). Before YouTube says how long a video is, players see just the speaker. On a 🤫 card Sound only
// isn't offered (a phone plays it in YouTube's own player).
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
const guard = () => page.waitForTimeout(500); // past the stage's double-click guard
/** Back to the board (the keys away from the media row's slider first). */
async function back() {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Escape');
  await page.locator('.stage-box .board').waitFor();
  await guard();
}

// A stand-in YouTube player (tests have no internet): a 100 s video. As YouTube's own, it says everything it knows
// (the video's length too) only in its first message, initialDelivery; each infoDelivery after holds only what changed.
// It keeps the commands it was sent, and plays from 0:42 when told to. The video "failfail123" refuses to play
// (onError); "nolength123" doesn't know its length until it plays.
const YT = `<!doctype html><body style="margin:0;background:#c00"><script>
  const q = new URLSearchParams(location.search);
  const fails = location.pathname.endsWith('/failfail123');
  const late = location.pathname.endsWith('/nolength123');
  window.__yt = { cmds: [] };
  const say = (m) => parent.postMessage(JSON.stringify(m), '*');
  addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.event === 'listening') {
      if (fails) return say({ event: 'onError', info: 153 });
      say({ event: 'initialDelivery', info: { playerState: -1, currentTime: Number(q.get('start') || 0), duration: late ? 0 : 100, volume: 100, muted: false } });
      say({ event: 'onReady' });
      say({ event: 'infoDelivery', info: { playerState: 5 } });
    }
    if (d.event !== 'command' || d.func === 'addEventListener') return;
    window.__yt.cmds.push([d.func, ...(d.args || [])]);
    if (d.func === 'playVideo') say({ event: 'infoDelivery', info: { playerState: 1, currentTime: 42, ...(late ? { duration: 100 } : {}) } });
    if (d.func === 'pauseVideo') say({ event: 'infoDelivery', info: { playerState: 2 } });
    if (d.func === 'setVolume') say({ event: 'infoDelivery', info: { volume: d.args[0] } });
  });
</script>`;
await context.route('https://www.youtube.com/embed/**', (r) => r.fulfill({ body: YT, contentType: 'text/html' }));
await context.route(/ytimg\.com/, (r) => r.fulfill({ status: 404, body: '' }));

/** The stand-in player inside a stage, and the commands it got. */
const player = async (p, stage) => (await p.locator(`${stage} iframe`).elementHandle()).contentFrame();
const cmds = async (p, stage) => (await player(p, stage)).evaluate(() => window.__yt.cmds.map((c) => c[0]));
const hasCmd = async (p, stage, name, arg) =>
  (await player(p, stage)).waitForFunction(([n, a]) => window.__yt?.cmds.some((c) => c[0] === n && (a === undefined || c[1] === a)), [name, arg], { timeout: 5000 }).then(() => true, () => false);
/** The player is on the page, playing size, yet nothing of it is seen. */
const unseen = (p, stage) =>
  p.locator(`${stage} iframe`).evaluate((f) => {
    const r = f.getBoundingClientRect();
    const cs = getComputedStyle(f);
    return r.width > 50 && r.height > 50 && cs.opacity === '0' && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents === 'none';
  });
/** Anything showing the video's picture or YouTube's card. */
const cards = (p, stage) => p.locator(`${stage} .card, ${stage} [style*="ytimg"]`).count();

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  const insp = page.locator('.insp');
  const addYouTube = async (url) => {
    await page.getByRole('button', { name: '🌐 Link' }).click();
    await page.locator('.linkbox').getByLabel('Paste a link').fill(url);
    await page.locator('.linkbox').getByLabel('Paste a link').press('Enter');
    await page.locator('.canvas .card').waitFor();
    await insp.getByLabel('Autoplay when the slide appears').uncheck();
  };

  // Clue 1: a YouTube video's 0:30 to 1:00, for its sound only, with a time bar.
  await page.locator('.tile').first().click();
  await addYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await insp.getByLabel('Plays from').fill('0:30');
  await insp.getByLabel('Plays from').press('Enter');
  await insp.getByLabel('Plays to').fill('1:00');
  await insp.getByLabel('Plays to').press('Enter');
  assert((await insp.getByLabel('Players see').count()) === 0, 'Players see is offered only with Sound only on');
  const soundOnly = insp.getByLabel('Sound only (hide the video)');
  await soundOnly.check();
  await page.locator('.canvas .card.dim').waitFor();
  // Ctrl+Z / Ctrl+Y take it back and forth, as any choice.
  await page.keyboard.press('Control+z');
  await page.locator('.canvas .card.dim').waitFor({ state: 'detached' });
  assert(!(await soundOnly.isChecked()), 'Ctrl+Z takes Sound only back');
  await page.keyboard.press('Control+y');
  await page.locator('.canvas .card.dim').waitFor();
  assert(await soundOnly.isChecked(), 'and Ctrl+Y puts it back');
  assert((await insp.getByLabel('Players see').inputValue()) === 'speaker', 'players see a speaker unless told otherwise');
  await insp.getByLabel('Players see').selectOption('time');
  const canvasCard = page.locator('.canvas .card.dim');
  await canvasCard.locator('.badge', { hasText: '🔊 Sound only' }).waitFor();
  assert((await canvasCard.locator('.bar .t').innerText()) === '0:00 / 0:30', 'the editor shows it dimmed, badged Sound only, with the time bar players will see (the part it plays: 0:30)');
  assert((await page.locator('.layers').getByText('YouTube (sound only)').count()) >= 1 || (await page.getByText('YouTube (sound only)').count()) >= 1, 'its layer says sound only');
  // (A copy of it, for a 🤫 card below.)
  {
    const r = await canvasCard.boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  }
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Done' }).click();

  // Clue 2: sound only, and players see nothing.
  await page.locator('.tile').nth(1).click();
  await addYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await insp.getByLabel('Sound only (hide the video)').check();
  await insp.getByLabel('Players see').selectOption('nothing');
  await page.locator('.canvas .card.dim').getByText('Players see nothing').waitFor();
  await page.getByRole('button', { name: 'Done' }).click();

  // Clue 3: sound only, from a video YouTube won't play here.
  await page.locator('.tile').nth(2).click();
  await addYouTube('https://www.youtube.com/watch?v=failfail123');
  await insp.getByLabel('Sound only (hide the video)').check();
  await page.getByRole('button', { name: 'Done' }).click();

  // Clue 4: sound only with a time bar, the whole of a video whose length YouTube says only once it plays.
  await page.locator('.tile').nth(3).click();
  await addYouTube('https://www.youtube.com/watch?v=nolength123');
  await insp.getByLabel('Sound only (hide the video)').check();
  await insp.getByLabel('Players see').selectOption('time');
  assert((await page.locator('.canvas .card.dim .bar .t').innerText()) === '0:00 / –:––', 'the editor: a time bar with no Plays to shows its length unknown yet');
  await page.getByRole('button', { name: 'Done' }).click();

  // A 🤫 card: Sound only is for slides (a phone plays a card's YouTube video in YouTube's own player), so it isn't
  // offered there, and a sound only item pasted onto one shows as the video it is there.
  await page.locator('.tile').nth(4).click();
  const clueDialog = page.getByRole('dialog', { name: 'Edit clue' });
  await clueDialog.locator('select').first().selectOption('partner');
  await clueDialog.getByRole('tab', { name: '🤫 Card 1' }).click();
  await clueDialog.getByText('🤫 CARD 1 · ONLY WHO YOU SEND IT TO SEES IT').waitFor();
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+v');
  await page.locator('.canvas .card').waitFor();
  assert((await page.locator('.canvas .card.dim, .canvas .badge').count()) === 0, 'a card: a sound only item pasted on it shows no Sound only badge');
  assert((await insp.getByLabel('Sound only (hide the video)').count()) === 0 && (await insp.getByLabel('Players see').count()) === 0, 'its Inspector offers no Sound only');
  assert((await insp.getByText('On a 🤫 card it plays in YouTube’s own player').count()) === 1, 'and says a card’s YouTube video plays in YouTube’s own player');
  assert((await page.getByText('YouTube (sound only)').count()) === 0, 'and its layer and the item bar call it just YouTube');
  await clueDialog.locator('select').first().selectOption('standard');
  await page.getByRole('button', { name: 'Done' }).click();

  await playWithPlayers(page, 1);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();

  // One window (the stage is what the stream shows).
  const one = '.stage-box .full';
  await page.locator('.board .tile').first().click();
  await page.locator(`${one} iframe`).waitFor({ state: 'attached' });
  await page.locator('.mc .time', { hasText: '/ 1:40' }).waitFor();
  assert(await unseen(page, one), 'one window: the player is on the stage, full size, but unseen');
  assert((await cards(page, one)) === 0, 'and the stage shows no picture of the video');
  await page.locator(`${one} .bar .t`, { hasText: '0:00 / 0:30' }).waitFor();
  assert(true, 'players see the time bar over the part it plays (0:00 / 0:30)');
  await page.locator('.mc').getByRole('button', { name: 'Play' }).click();
  assert(await hasCmd(page, one, 'playVideo'), "the host's ▶ plays it");
  await page.locator(`${one} .bar .t`, { hasText: '0:12 / 0:30' }).waitFor();
  const fill = await page.locator(`${one} .bar .fill`).evaluate((f) => parseFloat(f.style.width));
  assert(Math.abs(fill - 40) < 0.5, `and the bar fills as it plays (0:12 of 0:30: ${fill}%)`);
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).click();
  assert(await hasCmd(page, one, 'pauseVideo'), 'and ⏸ pauses it');
  await page.locator('.mc').getByRole('slider', { name: 'Volume' }).fill('0.4');
  assert(await hasCmd(page, one, 'setVolume', 40), 'and the volume slider turns it down');
  await back();

  // The failing one: no card on the stage viewers see; the host's media row offers it on YouTube.
  await page.locator('.board .tile').nth(2).click();
  await page.locator('.mc .item.failed').waitFor();
  assert((await cards(page, one)) === 0 && (await page.locator(`${one} iframe`).count()) === 0, "one window: a player that fails shows no card on the stage");
  assert((await page.locator('.mc').getByRole('button', { name: /Open on YouTube/ }).count()) === 1, "the host's media row offers it on YouTube");
  await back();

  // Its length not known yet: players see just the speaker (never "0:00 / 0:00"); once it plays, the bar.
  await page.locator('.board .tile').nth(3).click();
  await page.locator(`${one} iframe`).waitFor({ state: 'attached' });
  await page.locator(`${one} .spk`).waitFor();
  await page.waitForTimeout(300);
  assert(
    (await page.locator(`${one} .bar`).count()) === 0 && !(await page.locator(one).innerText()).includes('0:00'),
    'its length not known yet: players see just the speaker, no time bar',
  );
  await page.locator('.mc').getByRole('button', { name: 'Play' }).click();
  await page.locator(`${one} .bar .t`, { hasText: '0:42 / 1:40' }).waitFor();
  assert(true, 'once YouTube says how long it is, the time bar (0:42 / 1:40)');
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).click();
  await back();

  // Dual-window mode: the audience window plays it unseen; the host's copy is silent.
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
  aud.on('pageerror', (e) => errors.push('[audience] ' + e.message));
  const full = '.full';
  await aud.locator('.board, .full').first().waitFor();
  await page.locator('.board .tile').first().click();
  await aud.locator(`${full} iframe`).waitFor({ state: 'attached' });
  await page.locator('.mc .time', { hasText: '/ 1:40' }).waitFor();
  assert(await unseen(aud, full), 'the audience window: the player is there, full size, but unseen');
  assert((await cards(aud, full)) === 0, 'and no picture of the video');
  await aud.locator(`${full} .bar .t`, { hasText: '0:00 / 0:30' }).waitFor();
  assert((await aud.locator(`${full} button`).count()) === 0, 'viewers get the time bar (not a button)');
  await page.locator('.mc').getByRole('button', { name: 'Play' }).click();
  assert(await hasCmd(aud, full, 'playVideo'), "the host's ▶ plays it in the audience window");
  await aud.locator(`${full} .bar .t`, { hasText: '0:12 / 0:30' }).waitFor();
  await page.locator('.mc').getByRole('slider', { name: 'Volume' }).fill('0.25');
  assert(await hasCmd(aud, full, 'setVolume', 25), 'and its volume slider turns it down there');
  await page.locator('.mc').getByRole('button', { name: 'Pause' }).click();
  assert(await hasCmd(aud, full, 'pauseVideo'), 'and ⏸ pauses it there');
  assert(!(await cmds(page, one)).includes('unMute'), "the host's copy stays silent");
  // The host's copy: its speaker bar plays and pauses it too (as a sound's speaker does).
  await guard();
  const before = (await cmds(aud, full)).filter((c) => c === 'playVideo').length;
  await page.locator(`${one} button.bar`).click();
  assert(
    await (await player(aud, full)).waitForFunction((n) => window.__yt.cmds.filter((c) => c[0] === 'playVideo').length > n, before, { timeout: 5000 }).then(() => true, () => false),
    "clicking the time bar on the host's stage plays it in the audience window",
  );
  await back();

  // Players see nothing: the audience window has no speaker nor bar; the host's copy shows a faint speaker.
  await page.locator('.stage-box .board .tile').nth(1).click();
  await aud.locator(`${full} iframe`).waitFor({ state: 'attached' });
  await page.locator('.mc .time', { hasText: '/ 1:40' }).waitFor();
  assert(await unseen(aud, full), 'set to show nothing: the player is unseen');
  assert((await aud.locator(`${full} .spk, ${full} .bar`).count()) === 0 && (await cards(aud, full)) === 0, 'and viewers see nothing at all in its place');
  assert((await page.locator(`${one} .spk.ghost`).count()) === 1, "the host's copy shows a faint speaker where it is");
  await page.locator('.mc').getByRole('button', { name: 'Play' }).click();
  assert(await hasCmd(aud, full, 'playVideo'), 'and the host still plays it');
  await back();

  // The failing one: viewers get no card; the host's own copy does (to open it on YouTube).
  await page.locator('.stage-box .board .tile').nth(2).click();
  await page.locator('.mc .item.failed').waitFor();
  await page.locator(`${one} .card`).waitFor();
  await aud.waitForTimeout(500);
  assert((await cards(aud, full)) === 0 && (await aud.locator(`${full} .spk`).count()) === 0, "a player that fails shows viewers nothing (no picture, no card)");
  assert(true, "and the host's copy shows the Open on YouTube card");

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nSound only E2E passed.');
} finally {
  await browser.close();
}
