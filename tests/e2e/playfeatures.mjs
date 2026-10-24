// Hosting extras: who's answering on stream, the built-in sound cues (and switching one off in 🔊 Sounds), the chroma-key
// stage background, the scores-only window for OBS and the ? list closed from the audience window. (Buzzer mode is phone buzzers: remotebuzz.mjs, buzzerlive.mjs.)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, editorReady, exportHtml, openGameFile, playWithPlayers } from './helpers.mjs';

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
  assert((await rows.count()) === 21, '🔊 Sounds lists every sound cue (the RPG’s six and the partner clue’s too)');
  assert((await rows.filter({ hasText: 'Built-in' }).count()) === 19, 'all but the think music and the partner clue’s play a built-in sound to begin with (a partner clue plays the tile-open sound)');
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
  assert((await page.getByLabel('Wrong volume').getAttribute('aria-valuetext')) === '40%', 'a screen reader hears its volume as the page shows it (40%, not 0.4)');
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
  // So the lines around the tiles and the background gradient don't show: both say so, as Used tiles does.
  const notShown = await page.locator('[data-k="boardGap"], [data-k="bgGradient"]').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  assert(
    notShown.length === 2 && notShown.every((t) => t.includes('(not shown: Stage background is Chroma green)')),
    `Lines around tiles and Background gradient say they don't show on a green key (${notShown.join(' / ')})`,
  );
  // Theme colors close to the key: the page names them.
  const keyNote = page.getByRole('status').filter({ hasText: 'OBS would make these see-through' });
  await page.locator('.preset', { hasText: 'Brainrot Neon' }).click();
  await keyNote.waitFor();
  const neonNote = await keyNote.innerText();
  assert(neonNote.includes(': Values, Category names.') && !neonNote.includes('magenta key'), `Brainrot Neon on a green key: the Theme page names its green values and cyan names, and doesn't offer magenta, where its glow goes (${neonNote})`);
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await keyNote.waitFor({ state: 'detached' });
  assert(true, 'Classic on a green key: no note');
  await page.getByLabel('Values', { exact: true }).fill('#39ff14');
  await keyNote.waitFor();
  assert((await keyNote.innerText()).includes(': Values.'), 'green values on Classic: the note names them');

  // ---------- Play: players on the pre-game screen; Start places a Daily Double the board wants but hasn't got ----------
  await page.locator('nav button.round-tab').first().click();
  await page.getByLabel('How many Daily Doubles').fill('1');
  await page.getByLabel('How many Daily Doubles').press('Tab');
  await playWithPlayers(page, 3);
  const themeKeyNote = page.locator('[data-warn="chroma-theme"]');
  await themeKeyNote.waitFor();
  assert((await themeKeyNote.innerText()).includes('see-through on stream (values)'), 'and so does the pre-game screen');
  // Player 3's palette yellow: partly see-through on a green key, by OBS's own sums.
  const playerKeyNote = page.locator('[data-warn="chroma"]');
  await playerKeyNote.waitFor();
  const yellowNote = await playerKeyNote.innerText();
  assert(yellowNote.startsWith('⚠ Player 3’s color is close to the chroma key'), `a yellow player gets a note on a green key (${yellowNote})`);
  await page.getByLabel('Color for Player 3').fill('#4f7cff');
  await playerKeyNote.waitFor({ state: 'detached' });
  // A green player: neither note offers the magenta key, where Classic's blue tiles would go see-through.
  const p1Color = page.getByLabel('Color for Player 1');
  const p1Was = await p1Color.inputValue();
  await p1Color.fill('#00c000');
  await playerKeyNote.waitFor();
  const playerNote = await playerKeyNote.innerText();
  assert(playerNote.includes('OBS would key it out on stream. Pick another color.') && !(await themeKeyNote.innerText()).includes('magenta'), `a green player gets a note, and neither note offers the magenta key the tiles would go on (${playerNote})`);
  await p1Color.fill(p1Was);
  await playerKeyNote.waitFor({ state: 'detached' });
  const ddNote = page.locator('.actions', { hasText: '⭐ 1 Daily Double not placed' });
  assert((await ddNote.count()) === 1, 'the pre-game screen says, next to Start game, that a Daily Double isn’t placed yet');
  // (Its random pick is the last tile it could take, so the first tile clicked below is an ordinary clue.)
  await page.evaluate(() => {
    window.__random = Math.random;
    Math.random = () => 0.9999;
  });
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.evaluate(() => (Math.random = window.__random));
  await page.locator('.toast', { hasText: '⭐ Placed 1 Daily Double at random in Jeopardy!' }).waitFor();
  assert(true, 'Start game places it at random and says so');
  await page.locator('.stage-box .title-card').waitFor();
  assert((await played(page, 'roundIntro')) === 1, 'the round intro plays its built-in sound with the title card');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // A double-click on a tile opens it, and nothing more (its second click doesn't reveal the answer).
  const status = () => page.locator('.panel .status').innerText();
  // (Where a tile is on the stage, as a part of its width and height: a double-click there later lands on it.)
  const stageBox = () => page.locator('.stage-box .stage').boundingBox();
  const spot = await (async (s, t) => [(t.x + t.width / 2 - s.x) / s.width, (t.y + t.height / 2 - s.y) / s.height])(await stageBox(), await page.locator('.stage-box .board .tile').nth(8).boundingBox());
  // (One window: the board is on stream, so it marks no tile.)
  assert((await page.locator('.stage-box .board .tile.host-mark').count()) === 0, 'one window: the board marks no Daily Double');
  await page.locator('.stage-box .board .tile').first().dblclick();
  await page.waitForTimeout(300);
  assert((await status()).includes('Answer hidden'), `a double-click on a tile opens it, the answer stays hidden (${await status()})`);
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
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
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
  // A double-click on the answer goes back to the board, and doesn't open the tile then under the pointer.
  await page.locator('.stage-box .full[data-slide="answer"]').waitFor();
  const sb = await stageBox();
  await page.mouse.dblclick(sb.x + spot[0] * sb.width, sb.y + spot[1] * sb.height);
  assert((await status()).includes('Pick a tile'), `a double-click on the answer goes back to the board, no other tile opens (${await status()})`);
  // With the audience window open, the host's own board marks the Daily Double Start placed at random; viewers' doesn't.
  const marked = page.locator('.stage-box .board .tile.host-mark');
  await aud.locator('.board .tile').first().waitFor();
  assert(
    (await marked.count()) === 1 &&
      (await marked.getAttribute('data-mark')) === '⭐' &&
      (await marked.getAttribute('aria-label')).endsWith(', Daily Double') &&
      (await aud.locator('.board .tile.host-mark, .board .tile[data-mark]').count()) === 0,
    `two windows: the host's board marks its Daily Double (${await marked.getAttribute('aria-label')}), the audience window's doesn't`,
  );
  await page.keyboard.press('d');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#dice')));
  assert(true, 'rolling dice rattles in the audience window');
  await page.keyboard.press('Escape');
  // A wheel ticks as its slices pass the pointer, then lands.
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  await page.getByRole('button', { name: '🎯 Pick a player' }).click();
  await page.waitForTimeout(100);
  assert(
    await page.evaluate(() => document.activeElement?.matches('.panel [data-next]') && document.activeElement.textContent?.trim().startsWith('Spin!')),
    'a wheel picked from the 🎡 menu puts the focus on its Spin! (the panel’s main button)',
  );
  await page.keyboard.press('w');
  await aud.waitForFunction(() => window.__plays.filter((s) => s.endsWith('#wheelTick')).length >= 3);
  assert((await played(aud, 'wheelLand')) === 0, 'a spinning wheel ticks in the audience window');
  await page.keyboard.press('d');
  await page.getByText('Still spinning: wait for it to land').waitFor({ timeout: 2000 });
  assert(await page.evaluate(() => !!document.querySelector('[data-tool-controls]')?.textContent?.includes('Pick a player')), 'D while the wheel spins waits for it (and says why)');
  await aud.waitForFunction(() => window.__plays.some((s) => s.endsWith('#wheelLand')), null, { timeout: 10000 });
  assert((await played(page, 'wheelTick')) === 0, '…and lands with a ding (none of it in the host’s window)');
  // S puts the scores up over it; S again, or Esc, brings the wheel back with its result (not lost).
  const tools = page.locator('[data-tool-controls]');
  const landedOn = await tools.locator('.result').innerText();
  await page.keyboard.press('s');
  await aud.locator('.ov .sb').waitFor();
  await page.keyboard.press('s');
  await aud.locator('.ov .sb').waitFor({ state: 'detached' });
  assert((await aud.locator('.ov svg.wheel').count()) === 1 && (await tools.locator('.result').innerText()) === landedOn, `S over the wheel shows the scores, and S again brings the wheel back (${landedOn})`);
  await page.keyboard.press('s');
  await aud.locator('.ov .sb').waitFor();
  await page.keyboard.press('Escape');
  await aud.locator('.ov .sb').waitFor({ state: 'detached' });
  assert((await aud.locator('.ov svg.wheel').count()) === 1 && (await tools.locator('.result').innerText()) === landedOn, 'Esc on those scores goes back to the wheel too');
  await page.keyboard.press('Escape');
  // A ready-made wheel spins as it is, on the audience's screen.
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  await page.getByLabel('Spin a ready-made wheel').selectOption({ label: '🪙 Coin flip' });
  assert(await page.evaluate(() => !!document.querySelector('[data-tool-controls]')?.textContent?.includes('Coin flip')), '🎡 Wheel › Spin a ready-made wheel… opens it (🪙 Coin flip)');
  await page.keyboard.press('Escape');
  // 🗂 Pick a category: a slice for each category with clues left.
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  await page.getByRole('button', { name: '🗂 Pick a category', exact: true }).click();
  const catSlices = await page.evaluate(() => document.querySelectorAll('.stage .wheel path[data-slice], .stage svg path[data-slice]').length);
  assert(await page.evaluate(() => !!document.querySelector('[data-tool-controls]')?.textContent?.includes('Pick a category')), `🎡 Wheel › 🗂 Pick a category opens a wheel of the board's categories (${catSlices} slices)`);
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
  // On the key, colors OBS keeps: a wager's ✔ in blue, not the green, and the countdown's box solid black (see-through
  // over the key it would come out dark green, and go too).
  const [tick, clockBg] = [await scores.locator('.strip').evaluate((e) => getComputedStyle(e).getPropertyValue('--right').trim()), await scores.locator('.clock .timer').evaluate((e) => getComputedStyle(e).backgroundColor)];
  assert(tick === '#1f6fd1' && clockBg === 'rgb(0, 0, 0)', `on chroma green, the scores window's ✔ is blue and its countdown box solid (${tick}, ${clockBg})`);
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

  // ---------- A game with no Jeopardy board: the pre-game note names only the colors it shows ----------
  const slidesContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const slidesPage = watch(await slidesContext.newPage(), 'slides game');
  await slidesPage.goto(pathToFileURL(file).href);
  const slidesGame = {
    id: 'g_slides', version: 2, title: 'Slides only',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8 },
    players: [], rounds: [{ id: 'r_slides', name: 'Show', mode: 'slides', questionSlide: { background: { color: '#223344' }, elements: [] } }],
    media: [], audio: {}, wheels: [], dice: [], theme: {},
  };
  await openGameFile(slidesPage, { name: 'Slides only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(slidesGame)) });
  await slidesPage.getByText(/^Opened “/).waitFor();
  await editorReady(slidesPage);
  await slidesPage.getByRole('button', { name: '🎨 Theme' }).click();
  await slidesPage.getByLabel('Stage background (OBS)').selectOption('magenta');
  await slidesPage.locator('.preset', { hasText: 'Brainrot Neon' }).click();
  const slidesKeyNote = slidesPage.getByRole('status').filter({ hasText: 'OBS would make these see-through' });
  await slidesKeyNote.waitFor();
  assert((await slidesKeyNote.innerText()).includes(': Tiles & slide background, Tile glow.'), 'Brainrot Neon on a magenta key: the Theme page names its tiles and its glow (for every round)');
  await slidesPage.getByRole('button', { name: '▶ Play' }).click();
  const slidesPregame = slidesPage.locator('[data-warn="chroma-theme"]');
  await slidesPregame.waitFor();
  const slidesNote = await slidesPregame.innerText();
  assert(slidesNote.includes('see-through on stream (tiles & slide background).'), `with no Jeopardy board, the pre-game screen leaves out the glow only a board has (${slidesNote})`);
  // Exported, the file has no 🎨 Theme or ⚙ Settings: the note and Reduce motion's tooltip don't send the host there.
  await slidesPage.getByRole('button', { name: '◀ Back to editor' }).click();
  const slidesHtml = await exportHtml(slidesPage);
  mkdirSync(resolve('test-results'), { recursive: true });
  const slidesFile = resolve('test-results/playfeatures-slides.html');
  await slidesHtml.saveAs(slidesFile);
  const slidesPlayer = watch(await slidesContext.newPage(), 'slides game file');
  await slidesPlayer.goto(pathToFileURL(slidesFile).href);
  await slidesPlayer.getByRole('button', { name: '▶ Play' }).click({ timeout: 20000 });
  const fileNote = await slidesPlayer.locator('[data-warn="chroma-theme"]').innerText();
  const motionTip = await slidesPlayer.locator('label.check', { hasText: 'Reduce motion on stream' }).getAttribute('title');
  assert(
    fileNote.includes('chroma key (magenta):') && fileNote.endsWith('Ask whoever made it for a copy with other colors.') && !fileNote.includes('🎨') && motionTip === 'Kept on this computer',
    `in the exported file the note asks for other colors instead of 🎨 Theme, and Reduce motion's tooltip names no ⚙ Settings (${fileNote} · ${motionTip})`,
  );
  await slidesContext.close();

  // ---------- The Daily Double splash and PARTNER UP! keep clear of the key; a board game's own colors ----------
  const words = (t) => ({ background: {}, elements: [{ id: `t_${t}`, kind: 'text', text: t, x: 120, y: 90, w: 1680, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true }] });
  const partner = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
  const splashGame = (stageBg) => ({
    ...slidesGame, id: 'g_splash', title: 'Splashes',
    players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#56b4e9', '#d55e00'][i] })),
    rounds: [{ id: 'r_board', name: 'Round 1', mode: 'board', values: [200, 400], dailyDoubleCount: 1, categories: [{ id: 'cat0', title: 'Movies', clues: [
      { id: 'q_dd', value: null, type: 'dailyDouble', questionSlide: words('A clue'), answerSlide: words('An answer') },
      { id: 'q_pt', value: null, type: 'partner', partner, timerSeconds: 45, questionSlide: words('Describe it'), answerSlide: words('Shrek') },
    ] }] }, {
      // As ＋ Add round makes it (its backdrop green), with a magenta space.
      id: 'r_bg', name: 'Board game', mode: 'boardgame', slide: { background: { color: '#1d5e3a' }, elements: [] }, mover: { kind: 'dice', dice: 'd6' }, zones: [],
      spaces: [['Start', '#ffcc00'], ['Space 2', '#f032e6'], ['Space 3', '#f58231']].map(([name, color], i) => ({ id: `s${i}`, name, x: 400 + i * 550, y: 540, color, next: [`s${(i + 1) % 3}`] })),
    }],
    theme: { stageBg },
  });
  // (rgb(61, 255, 176): PARTNER UP!'s green; rgb(255, 61, 203): the Daily Double's pink.)
  for (const [key, want] of [['magenta', 'rgb(61, 255, 176)'], ['green', 'rgb(255, 61, 203)']]) {
    const splashContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const sp = watch(await splashContext.newPage(), `${key} splashes`);
    await sp.goto(pathToFileURL(file).href);
    await openGameFile(sp, { name: 'Splashes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(splashGame(key))) });
    await sp.getByText(/^Opened “/).waitFor();
    await editorReady(sp);
    await sp.getByRole('button', { name: '▶ Play' }).click();
    // The pre-game screen names the board game's colors the key takes out, and offers no key that takes them out:
    // magenta takes its magenta space (and Classic's blue tiles), green its backdrop.
    const roundsNote = sp.locator('[data-warn="chroma-rounds"]');
    await roundsNote.waitFor();
    const notes = await sp.locator('[data-warn^="chroma"]').allInnerTexts();
    const named = key === 'magenta' ? '(board spaces)' : '(the board game’s backdrop)';
    assert(
      (await roundsNote.innerText()).includes(`OBS would make them see-through on stream ${named}. Pick others in their round’s editor.`) && !notes.some((n) => n.includes(' key.')),
      `on a ${key} key, the pre-game screen names ${named} and no note offers the other key (${notes.join(' | ')})`,
    );
    await sp.getByRole('button', { name: 'Start game ▶' }).click();
    const look = (sel) => sp.locator(`.stage-box ${sel}`).evaluate((e) => getComputedStyle(e).backgroundImage);
    await sp.locator('.stage-box .tile[data-clue="q_dd"]').click();
    await sp.locator('.stage-box .dd-text').waitFor();
    const ddLook = await look('.full.dd');
    await sp.locator('.stage-box .dd-text').click();
    await sp.keyboard.press('Escape');
    await sp.locator('.stage-box .tile[data-clue="q_pt"]').click();
    await sp.locator('.stage-box [data-partner-up]').waitFor();
    const ptLook = await look('[data-partner-up]');
    assert(ddLook.includes(want) && ptLook.includes(want), `on a ${key} key, the Daily Double splash and PARTNER UP! both take the colors it leaves alone (${ddLook} · ${ptLook})`);
    await splashContext.close();
  }

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('playfeatures e2e passed');
} finally {
  await browser.close();
}
