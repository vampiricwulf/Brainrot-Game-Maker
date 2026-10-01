// Hosting extras: who's answering on stream, buzzer mode (with buzz-in keys in the audience window), the built-in sound
// cues (and switching one off in Setup), the chroma-key stage background and the scores-only window for OBS.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// Every sound a window starts, by its file (a built-in sound's link ends in #its-name).
await context.addInitScript(() => {
  window.__plays = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__plays.push(this.src);
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

  // ---------- Setup: players, buzzer mode with keys, the sound list ----------
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByLabel(/Buzzer mode/).check();
  await page.getByLabel(/Buzz-in keys/).fill('qp!');
  assert((await page.getByLabel(/Buzz-in keys/).inputValue()) === 'QP', 'buzz-in keys are letters and digits, shown in capitals');
  const rows = page.locator('.sound');
  assert((await rows.count()) === 14, 'Setup lists every sound cue');
  assert((await rows.filter({ hasText: 'Built-in' }).count()) === 13, 'all but the think music play a built-in sound to begin with');
  const tileRow = rows.filter({ hasText: 'Tile opens' });
  await tileRow.getByRole('checkbox').uncheck();
  assert((await tileRow.innerText()).includes('Off'), 'a cue can be switched off');
  await page.keyboard.press('Control+z');
  assert((await tileRow.getByRole('checkbox').isChecked()) && (await tileRow.innerText()).includes('Built-in'), 'Ctrl+Z switches it back on');
  await page.keyboard.press('Control+y');
  assert(!(await tileRow.getByRole('checkbox').isChecked()), 'Ctrl+Y off again');
  assert((await tileRow.getByRole('button', { name: /^Preview/ }).count()) === 0, 'a cue switched off has nothing to preview');
  await page.getByRole('button', { name: 'Preview Right' }).click();
  await page.waitForFunction(() => window.__plays.some((s) => s.endsWith('#right')));
  assert(true, '▶ previews the built-in sound');
  await shot('pf-0-setup');

  // ---------- Theme: a chroma-key stage background ----------
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.getByLabel('Stage background (OBS)').selectOption('green');
  const bg = await page.locator('.preview .board-bg').evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(bg === 'rgb(0, 255, 0)', `the board's background is chroma green (${bg})`);

  // ---------- Play ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.stage-box .title-card').waitFor();
  assert((await played(page, 'roundIntro')) === 1, 'the round intro plays its built-in sound with the title card');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.stage-box .board .tile').first().click();
  await page.waitForTimeout(300);
  assert((await played(page, 'tileOpen')) === 0, 'the tile-open sound is off, so nothing plays');

  // Buzzer mode: 2 buzzes in first; 1 is locked out; 0 opens the buzzers again.
  await page.keyboard.press('2');
  await page.locator('.stage-box .plate').waitFor();
  assert((await page.locator('.stage-box .plate').innerText()).includes('Player 2') && (await page.locator('.stage-box .plate').innerText()).includes('is answering'), 'the stage says who is answering');
  await page.keyboard.press('1');
  const pressed = () => page.locator('.panel .p .sel[aria-pressed="true"]').allInnerTexts();
  const sel = await pressed();
  assert(sel.length === 1 && sel[0].includes('Player 2'), 'a later buzz is locked out (only the first is selected)');
  await page.waitForFunction(() => window.__plays.filter((s) => s.endsWith('#buzz')).length === 1);
  assert(true, 'the first buzz plays the buzz sound, the locked-out one doesn’t');
  assert((await page.getByRole('button', { name: '🔔 Open the buzzers' }).count()) === 1, 'the host panel offers to open the buzzers again');
  await shot('pf-1-answering');
  await page.keyboard.press('0');
  await page.locator('.stage-box .plate').waitFor({ state: 'detached' });
  assert((await pressed()).length === 0, '0 opens the buzzers again (nobody selected, the plate goes)');
  await page.keyboard.press('3');
  await page.keyboard.press('Shift+Enter');
  await page.waitForFunction(() => window.__plays.some((s) => s.endsWith('#wrong')));
  assert((await pressed()).length === 0, 'a wrong answer plays the wrong sound and opens the buzzers for the others');

  // ---------- The audience window: buzz-in keys, the plate, sounds there, the chroma background ----------
  const hostBuzzes = await played(page, 'buzz');
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
  watch(aud, 'audience');
  await aud.locator('.stage .full').waitFor();
  const audBg = await aud.locator('.aud').evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(audBg === 'rgb(0, 255, 0)', 'the audience window is chroma green around the stage');
  await aud.keyboard.press('p');
  await aud.locator('.plate').waitFor();
  assert((await aud.locator('.plate').innerText()).includes('Player 2'), 'P (the second buzz-in key) in the audience window buzzes player 2 in');
  await aud.keyboard.press('q');
  await page.waitForTimeout(300);
  assert((await aud.locator('.plate').innerText()).includes('Player 2'), 'Q then is locked out');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#buzz')));
  assert((await played(page, 'buzz')) === hostBuzzes, 'the buzz plays in the audience window, not the host’s');
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
  await page.keyboard.press('w');
  await aud.waitForFunction(() => window.__plays.filter((s) => s.endsWith('#wheelTick')).length >= 3);
  assert((await played(aud, 'wheelLand')) === 0, 'a spinning wheel ticks in the audience window');
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

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('playfeatures e2e passed');
} finally {
  await browser.close();
}
