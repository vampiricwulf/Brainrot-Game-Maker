// Hosting extras: who's answering on stream, the built-in sound cues (and switching one off in 🔊 Sounds), the chroma-key
// stage background, the scores-only window for OBS and the ? list closed from the audience window. (Buzzer mode is phone buzzers: remotebuzz.mjs, buzzerlive.mjs.)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// Every sound a window starts, by its file (a built-in sound's link ends in #its-name), and how loud.
await context.addInitScript(() => {
  window.__plays = [];
  window.__volumes = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__plays.push(this.src);
    window.__volumes.push([this.src, this.volume]);
    return play.call(this);
  };
});
const page = await context.newPage();
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
};
watch(page, 'host');
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** The built-in cues a window has played so far (["roundIntro", "tileOpen", …]). */
const cues = (p) => p.evaluate(() => window.__plays.filter((s) => s.startsWith('blob:') && s.includes('#')).map((s) => s.split('#').pop()));
const played = async (p, cue) => (await cues(p)).filter((c) => c === cue).length;
const shot = async (name, p = page) => shots && (await p.screenshot({ path: `${shots}/${name}.png` }));

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- 🔊 Sounds: the sound list ----------
  await page.getByRole('button', { name: '🔊 Sounds' }).click();
  assert((await page.getByLabel(/Buzzer mode/).count()) === 0 && (await page.getByLabel(/Buzz-in keys/).count()) === 0, 'the editor has no buzzer options (they are on the pre-game screen)');
  const rows = page.locator('.sound');
  assert((await rows.count()) === 20, '🔊 Sounds lists every sound cue (the RPG’s six too)');
  assert((await rows.filter({ hasText: 'Built-in' }).count()) === 19, 'all but the think music play a built-in sound to begin with');
  const tileRow = rows.filter({ hasText: 'Tile opens' });
  await tileRow.getByRole('checkbox').uncheck();
  assert((await tileRow.innerText()).includes('Off'), 'a cue can be switched off');
  await page.keyboard.press('Control+z');
  assert((await tileRow.getByRole('checkbox').isChecked()) && (await tileRow.innerText()).includes('Built-in'), 'Ctrl+Z switches it back on');
  await page.keyboard.press('Control+y');
  assert(!(await tileRow.getByRole('checkbox').isChecked()), 'Ctrl+Y off again');
  assert((await tileRow.getByRole('button', { name: /^Preview/ }).count()) === 0, 'a cue switched off has nothing to preview');
  const previewRight = page.getByRole('button', { name: 'Preview Right' });
  await previewRight.click();
  await page.waitForFunction(() => window.__plays.some((s) => s.endsWith('#right')));
  assert((await previewRight.getAttribute('aria-pressed')) === 'true' && (await previewRight.innerText()) === '■', '▶ previews the built-in sound, and turns into ■ while it plays');
  await previewRight.click();
  const previewPaused = () => page.evaluate(() => document.querySelector('.sounds').previousElementSibling.paused);
  assert((await previewRight.getAttribute('aria-pressed')) === 'false' && (await previewPaused()), '■ stops the preview');
  // Each sound has its own volume: the preview and the game play it that loud.
  const wrongRow = rows.filter({ has: page.getByRole('button', { name: 'Preview Wrong' }) });
  await page.getByLabel('Wrong volume').fill('0.4');
  assert((await wrongRow.innerText()).includes('40%'), 'a sound’s volume can be turned down (40%)');
  await page.getByRole('button', { name: 'Preview Wrong' }).click();
  await page.waitForFunction(() => window.__volumes.some(([s, v]) => s.endsWith('#wrong') && Math.abs(v - 0.4) < 0.01));
  assert(true, 'its preview plays at that volume');
  await page.getByRole('button', { name: 'Preview Wrong' }).click();
  assert((await page.getByRole('button', { name: /^Choose file for Right$/ }).count()) === 1, 'each Choose file… button names its sound');
  await shot('pf-0-setup');

  // ---------- Theme: a chroma-key stage background ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByLabel('Stage background (OBS)').selectOption('green');
  const bg = await page.locator('.preview .board-bg').evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(bg === 'rgb(0, 255, 0)', `the board's background is chroma green (${bg})`);

  // ---------- Play: players on the pre-game screen ----------
  await playWithPlayers(page, 3);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.stage-box .title-card').waitFor();
  assert((await played(page, 'roundIntro')) === 1, 'the round intro plays its built-in sound with the title card');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.stage-box .board .tile').first().click();
  await page.waitForTimeout(300);
  assert((await played(page, 'tileOpen')) === 0, 'the tile-open sound is off, so nothing plays');

  // Who's answering: the one player picked during a clue.
  await page.keyboard.press('2');
  await page.locator('.stage-box .plate').waitFor();
  assert((await page.locator('.stage-box .plate').innerText()).includes('Player 2') && (await page.locator('.stage-box .plate').innerText()).includes('is answering'), 'the stage says who is answering');
  const pressed = () => page.locator('.panel .p .sel[aria-pressed="true"]').allInnerTexts();
  assert((await page.getByRole('button', { name: '↺ Reset buzzers' }).count()) === 0, 'no buzzer controls outside buzzer mode');
  await shot('pf-1-answering');
  await page.keyboard.press('1');
  await page.locator('.stage-box .plate').waitFor({ state: 'detached' });
  assert((await pressed()).length === 2, 'two picked: nobody in particular is answering, the plate goes');
  await page.keyboard.press('1');
  await page.keyboard.press('Shift+Enter');
  await page.waitForFunction(() => window.__volumes.filter(([s, v]) => s.endsWith('#wrong') && Math.abs(v - 0.4) < 0.01).length > 1);
  assert((await pressed()).length === 0, 'a wrong answer plays the wrong sound (at its volume)');

  // ---------- The audience window: the plate, sounds there, the chroma background ----------
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
  watch(aud, 'audience');
  await aud.locator('.stage .full').waitFor();
  const audBg = await aud.locator('.aud').evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(audBg === 'rgb(0, 255, 0)', 'the audience window is chroma green around the stage');
  await aud.keyboard.press('3');
  await aud.locator('.plate').waitFor();
  assert((await aud.locator('.plate').innerText()).includes('Player 3'), 'a number key pressed in the audience window picks that player (viewers see who is answering)');
  await shot('pf-2-audience-answering', aud);
  await page.keyboard.press('Enter');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#right')));
  assert((await aud.locator('.plate').count()) === 0, 'the right answer plays there, and the plate goes once the points are given');
  await page.keyboard.press('r');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#reveal')));
  assert(true, 'revealing the answer plays the reveal sound');
  await page.keyboard.press('d');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#dice')));
  assert(true, 'rolling dice rattles in the audience window');
  await page.keyboard.press('Escape');
  // A wheel ticks as its slices pass the pointer, then lands.
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  await page.getByRole('button', { name: '🎯 Pick a player' }).click();
  await page.waitForTimeout(100);
  assert((await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Spin!', 'a wheel picked from the 🎡 menu puts the focus on its Spin!');
  await page.keyboard.press('w');
  await aud.waitForFunction(() => window.__plays.filter((s) => s.endsWith('#wheelTick')).length >= 3);
  assert((await played(aud, 'wheelLand')) === 0, 'a spinning wheel ticks in the audience window');
  await page.keyboard.press('d');
  await page.getByText('Still spinning: wait for it to land').waitFor({ timeout: 2000 });
  assert(await page.evaluate(() => !!document.querySelector('[data-tool-controls]')?.textContent?.includes('Pick a player')), 'D while the wheel spins waits for it (and says why)');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#wheelLand')), null, { timeout: 10000 });
  assert((await played(page, 'wheelTick')) === 0, '…and lands with a ding (none of it in the host’s window)');
  await page.keyboard.press('Escape');

  // ---------- The scores-only window ----------
  const [scores] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Shift+A')]);
  watch(scores, 'scores');
  await scores.locator('.strip .plate').first().waitFor();
  assert((await scores.locator('.strip .plate').count()) === 3, 'Shift+A opens the scores window: one plate per player');
  assert((await scores.title()).endsWith('· Scores'), `it has its own title for OBS (${await scores.title()})`);
  assert((await scores.locator('.frame').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(0, 255, 0)', 'it is chroma green around the plates');
  assert((await scores.locator('.strip .plate').nth(1).innerText()).includes('$200'), `the scores are there (${await scores.locator('.strip .plate').nth(1).innerText()})`);
  await page.keyboard.press('t');
  await scores.locator('.clock .timer').waitFor();
  assert(true, 'the countdown shows there too');
  assert(await page.locator('.panel button[aria-label="Close the scores window"]').isVisible(), 'the host panel’s ▭ button says it closes it');
  await shot('pf-3-scores', scores);
  await shot('pf-4-host');
  assert((await scores.evaluate(() => window.__plays.length)) === 0, 'the scores window never plays a sound');
  await Promise.all([scores.waitForEvent('close'), page.locator('.panel button[aria-label="Close the scores window"]').click()]);
  assert(true, 'and the ▭ button closes it');

  // ---------- The ? list closes on Esc or ? pressed in the audience window too ----------
  await page.keyboard.press('?');
  const keyList = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await keyList.waitFor();
  await aud.keyboard.press('Escape');
  await keyList.waitFor({ state: 'detached', timeout: 2000 });
  assert(true, 'Esc in the audience window closes the ? list');
  await aud.keyboard.press('?');
  await keyList.waitFor();
  await aud.keyboard.press('?');
  await keyList.waitFor({ state: 'detached', timeout: 2000 });
  assert(true, '? there opens it and closes it again');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('playfeatures e2e passed');
} finally {
  await browser.close();
}
