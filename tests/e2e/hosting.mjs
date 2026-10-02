// Hosting a Jeopardy-style game from the keyboard and on stream: the Daily Double's Enter, the countdown stopping, the
// cover pausing what's under it, the 📜 Log in the host panel, score pops, the board's arrow keys, the Final's wagers
// step and its ✔/✘ sounds, a tie for first, and Resume asking how the game is shown.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, confirmStrip, mainButton, mainLabel, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// Every sound a window starts (a built-in cue's link ends in #its-name).
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
const cues = (p, cue) => p.evaluate((c) => window.__plays.filter((s) => s.startsWith('blob:') && s.endsWith('#' + c)).length, cue);
const shot = async (name, p = page) => shots && (await p.screenshot({ path: `${shots}/${name}.png` }));
const stage = (sel, opts) => page.locator(`.stage-box ${sel}`, opts);
const tile = (i) => stage('.board .tile').nth(i);
const status = () => page.locator('.panel .status').innerText();
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);
const video = () => stage('.full video').first().evaluate((m) => ({ paused: m.paused, t: m.currentTime, muted: m.muted }));
const timerNum = () => stage('.timer .num').innerText();

/** A short video (a canvas recorded in the page). */
async function webm(seconds = 6) {
  const b64 = await page.evaluate(async (s) => {
    const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    for (let i = 0; i < s * 30; i++) {
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
  }, seconds);
  return Buffer.from(b64, 'base64');
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- The game: a video clue, a Daily Double ----------
  const clip = await webm();
  await page.locator('.tile').first().click();
  await page.getByRole('button', { name: '🎬 Video' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload video file…' }).click()]);
  await fc.setFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: clip });
  await page.getByRole('tab', { name: /Answer/ }).click();
  await page.getByRole('button', { name: /Text/ }).first().click();
  await page.keyboard.type('The answer text');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('.tile').nth(3).click();
  await page.getByRole('combobox', { name: /^Type/ }).selectOption('dailyDouble');
  await page.getByRole('button', { name: 'Done' }).click();

  await playWithPlayers(page, 3);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await tile(1).waitFor();

  // ---------- Board: tiles say their value and whether they're played ----------
  assert((await tile(0).getAttribute('aria-label')) === 'Category 1 for $200', `a tile's label says its value (${await tile(0).getAttribute('aria-label')})`);
  const top = await stage('.board .tile').last().innerText();
  assert(top.trim() === '$1,000', `the board's values have thousands separators ($1,000, not $1000: ${top})`);

  // ---------- The countdown stops for a right answer ----------
  await tile(1).click();
  await page.keyboard.press('t');
  await stage('.timer').waitFor();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await stage('.timer').waitFor({ state: 'detached' });
  assert(true, 'a right answer stops the countdown (no "Time\'s up" over the answer)');
  // …and for the answer going up.
  await page.keyboard.press('t');
  await stage('.timer').waitFor();
  await page.keyboard.press('r');
  await stage('.timer').waitFor({ state: 'detached' });
  assert((await stage('.timesup').count()) === 0, 'revealing the answer stops the countdown');

  // ---------- Keyboard: back on the tile that was open, then the arrow keys ----------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert((await focused()) === 'Category 2 for $200, played', `after the clue, the keys go on from its tile (${await focused()})`);
  assert((await stage('.board .tile:not([tabindex="-1"])').count()) === 1, 'the board is one Tab stop (a roving tabindex)');
  await page.keyboard.press('ArrowDown');
  assert((await focused()) === 'Category 2 for $400', `↓ moves down the board (${await focused()})`);
  await page.keyboard.press('ArrowLeft');
  assert((await focused()) === 'Category 1 for $400', `← moves across (${await focused()})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  assert((await status()).includes('Category 1'), 'Enter on a tile reached with the arrow keys opens it');
  // Everyone right: ONE pop for the group.
  await page.keyboard.press('0');
  await page.keyboard.press('Enter');
  // The answer at once: the reveal's sound doesn't cut off the right answer's.
  await page.keyboard.press('r');
  const sounds = await page.evaluate(() => [...document.querySelectorAll('.stage-box audio')].map((a) => a.src.split('#').pop()));
  assert(sounds.includes('right') && sounds.includes('reveal'), `short sounds overlap (${sounds.join(', ')})`);
  await stage('.pop', { hasText: '$400' }).first().waitFor();
  // (The earlier award's pop may still be fading.)
  const pops = (await stage('.pop').allInnerTexts()).filter((t) => t.includes('$400'));
  assert(pops.length === 1 && pops[0] === 'Everyone +$400', `a group award shows one pop (${pops.join(' | ')})`);
  await page.keyboard.press('Escape');
  // On the board, one player's pop sits over their plate.
  await page.keyboard.press('2');
  await page.locator('.panel .award input').fill('100');
  await page.locator('.panel .award').getByRole('button', { name: /Award/ }).click();
  const pop = stage('.pop.anchored');
  await pop.waitFor();
  // (Once it has flown in.)
  await page.waitForTimeout(400);
  const plate = await stage('.plate').nth(1).boundingBox();
  const pb = await pop.boundingBox();
  const mid = pb.x + pb.width / 2;
  assert(mid > plate.x && mid < plate.x + plate.width, 'a single pop sits over that player’s plate');
  const score = await stage('.plate').nth(1).locator('.score').boundingBox();
  assert(pb.y + pb.height <= score.y + 2, 'without covering their score');
  await shot('host-1-pop');

  // ---------- Daily Double: Enter in the wager box shows the question, not the answer ----------
  await page.waitForTimeout(500);
  await tile(3).click();
  await page.locator('.dd input[type=number]').waitFor();
  await page.locator('.dd input[type=number]').fill('100');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('DD'));
  await page.waitForTimeout(400);
  assert((await status()).includes('Answer hidden') && (await page.getByRole('button', { name: '👁 Reveal answer' }).count()) === 1, 'Enter in the Daily Double wager box shows the question, the answer stays hidden');
  await page.keyboard.press('Escape');

  // ---------- ✔ / ✘ on a player's chip: shown there, and the same one isn't taken twice; the nav buttons stay put ----------
  const exitAt = () => page.getByRole('button', { name: '🚪 Exit' }).boundingBox();
  const onBoard = await exitAt();
  await tile(7).click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
  const inClue = await exitAt();
  assert(Math.abs(onBoard.x - inClue.x) < 1 && Math.abs(onBoard.y - inClue.y) < 1, `🚪 Exit stays in the same place on the board and in a clue (${onBoard.x},${onBoard.y} → ${inClue.x},${inClue.y})`);
  const chip = page.locator('.panel .p').first();
  await chip.getByRole('button', { name: /^Wrong:/ }).click();
  await chip.locator('.mark').waitFor();
  assert(
    (await chip.locator('.mark').innerText()).startsWith('✘ −$400') &&
      (await chip.getByRole('button', { name: /^Wrong:/ }).isDisabled()) &&
      (await chip.getByRole('button', { name: /^Right:/ }).isEnabled()),
    'a player marked ✘ shows it on their chip (✘ −$400), and ✘ is off for them on this clue (✔ still on)',
  );
  await page.keyboard.press('Escape');

  // ---------- ⏸ Cover pauses the clue's video and the countdown, and they go on after ----------
  await tile(0).click();
  await stage('.full video').waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector('.stage-box .full video');
    return v && !v.paused && v.currentTime > 0.5;
  });
  await page.keyboard.press('t');
  await stage('.timer').waitFor();
  await page.keyboard.press('k');
  await stage('.cover').waitFor();
  assert((await status()).includes('⏸ Viewers see the cover'), 'the host’s status line says viewers see the cover');
  await page.waitForTimeout(300);
  const held = await video();
  const n1 = await timerNum();
  await page.waitForTimeout(1300);
  assert(held.paused && (await video()).t === held.t, 'the cover pauses the clue’s video');
  assert((await timerNum()) === n1 && (await stage('.timer.paused').count()) === 1, 'and the countdown');
  await page.keyboard.press('k');
  await stage('.cover').waitFor({ state: 'detached' });
  await page.waitForTimeout(1300);
  assert(!(await video()).paused && (await timerNum()) !== n1, 'uncovered, both go on');
  // Hiding the answer again: the video goes on from where it was, still muted.
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  const before = await video();
  await page.keyboard.press('r');
  await stage('.full video').waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  await page.keyboard.press('r');
  await stage('.full video').waitFor();
  await page.waitForFunction(() => (document.querySelector('.stage-box .full video')?.currentTime ?? 0) > 0.3);
  const after = await video();
  assert(after.muted && after.t >= before.t - 0.6, `hiding the answer again keeps the video’s place and mute (${before.t.toFixed(1)} → ${after.t.toFixed(1)}, muted ${before.muted} → ${after.muted})`);
  await page.keyboard.press('Escape');

  // ---------- 📜 Log in the host panel (single window) ----------
  await page.keyboard.press('h');
  await page.locator('.panel').waitFor({ state: 'detached' });
  await page.keyboard.press('l');
  const log = page.locator('aside.in-panel');
  await log.waitFor();
  const lb = await log.boundingBox();
  const sb = await page.locator('.stage-box').boundingBox();
  assert(lb.y >= sb.y + sb.height - 1, 'single window: L opens the log in the host panel, never over the stage (controls back)');
  await shot('host-2-log');
  await page.keyboard.press('Escape');
  await log.waitFor({ state: 'detached' });
  await page.locator('.panel').waitFor({ state: 'detached' });
  assert(true, 'closing the log hides the controls again (H had hidden them)');
  // A Daily Double with the controls hidden: they come back for its wager (typed digits would pick players), and go again.
  // (The stage grows back to full size as the controls go: the tile is clicked once it has stopped moving.)
  await page.waitForFunction(
    (sel) => {
      const r = document.querySelectorAll(sel)[3]?.getBoundingClientRect();
      const key = r && `${r.x},${r.y},${r.width}`;
      const same = key === window.__tileAt;
      window.__tileAt = key;
      return same;
    },
    '.stage-box .board .tile',
    { polling: 100 },
  );
  await tile(3).click({ button: 'right', force: true });
  await page.getByRole('menuitem', { name: /Put it back on the board/ }).click();
  await tile(3).click();
  await page.locator('.dd input[type=number]').waitFor();
  await page.waitForTimeout(100);
  assert(await page.locator('.dd input[type=number]').evaluate((e) => e === document.activeElement), 'controls hidden: a Daily Double brings them back, the wager box focused');
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await page.locator('.panel').waitFor({ state: 'detached' });
  assert(true, 'and they hide again once the wager is in');
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');

  // ---------- Next round from the keyboard: the "go on?" stays while the focus is in it ----------
  await page.waitForTimeout(450);
  const nextBtn = page.locator('.rn > button').last();
  await nextBtn.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  // It asks in the strip above the fixed bar, the focus on its Cancel (Yes is to its right).
  const goOn = confirmStrip(page);
  await goOn.waitFor();
  assert((await goOn.innerText()).includes('clues left · go on?'), 'Next round with clues left asks in the confirmation strip');
  await page.waitForTimeout(4400);
  assert(await goOn.isVisible(), '“N clues left · go on?” stays up while the keyboard focus is in it');
  await page.waitForTimeout(450);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  // ---------- The Final: wagers, Ctrl+Z back to them, ✔/✘ with their sounds ----------
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await status()).includes('Title card')) await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Category on screen · taking wagers'));
  assert((await page.locator('.panel .award').count()) === 0, 'no award row during the Final (it has its own scoring)');
  // No step between the category and the wagers: the wager screen is up at once, with who plays on it.
  assert((await page.getByRole('button', { name: /Lock category|take wagers/ }).count()) === 0, 'no “Lock category, take wagers” step: the wagers are taken while the category is up');
  await page.waitForFunction(() => document.activeElement?.matches('.fj .wagers input[data-wager]'));
  assert(await page.evaluate(() => document.activeElement.value === ''), 'the Final comes up with the focus in the first wager box still to fill');
  // ◀ Back to the round before, from the keyboard: the keys go on from its board (the button is gone).
  const backBtn = page.locator('.fj button', { hasText: '◀ Back to' });
  await backBtn.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.matches('.stage-box .board .tile'));
  assert(true, '◀ Back to the round before puts the focus on its board');
  await page.waitForTimeout(450);
  await page.locator('.rn > button').last().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await status()).includes('Title card')) await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Category on screen · taking wagers'));
  // Everyone sat out: the panel says so, and its button goes on (no wagers to take). Ticked back in (last first),
  // the players keep the reveal order lowest score first (checked at the reveals).
  const ticks = page.locator('.fj .wagers input[data-plays]');
  const playing = [];
  for (let i = 0; i < (await ticks.count()); i++) if (await ticks.nth(i).isChecked()) playing.push(i);
  for (const i of playing) await ticks.nth(i).uncheck();
  await page.locator('.fj .nobody', { hasText: 'Nobody is playing this Final' }).waitFor();
  assert((await mainLabel(page)).includes('Finish game'), 'nobody playing the Final: it says so, and offers to go on (Finish game)');
  for (const i of [...playing].reverse()) await ticks.nth(i).check();
  assert((await page.locator('.fj .nobody').count()) === 0, 'and ticked back in, the Final is played as usual');
  const boxes = page.locator('.fj .wagers input[data-wager]');
  assert((await boxes.count()) === playing.length, 'each player ticked in has their wager box on the same screen');
  await page.locator('.panel .status').click();
  await page.keyboard.press('n');
  await page.locator('.toast', { hasText: 'Waiting on:' }).waitFor();
  assert(
    await page.evaluate(() => document.activeElement?.matches('.fj .wagers input[data-wager]') && document.activeElement.value === ''),
    'N with a wager missing says whose (a toast) and goes to that box',
  );
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).fill(String(100 + i));
  await page.locator('.panel .status').click();
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Question on screen'));
  await page.keyboard.press('Control+z');
  await boxes.first().waitFor();
  const kept = await boxes.evaluateAll((els) => els.map((e) => e.value));
  assert(kept.every((v, i) => v === String(100 + i)), `Ctrl+Z after the question goes back to the wagers, all kept (${kept.join(', ')})`);
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Question on screen'));
  await page.keyboard.press('r');
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Player reveals'));
  // Each Ctrl+Z goes back one step: to the answer, then the question (not straight back to the wagers).
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer on screen'));
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Question on screen'));
  assert(true, 'Ctrl+Z in the Final goes back one step at a time (reveals → answer → question)');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Player reveals'));
  const revealScores = (await page.locator('.fj .pl .pscore').allInnerTexts()).map((t) => Number(t.replace('−', '-').replace(/[^\d-]/g, '')));
  assert(revealScores.every((v, i) => !i || v >= revealScores[i - 1]), `players ticked back in keep the reveal order lowest score first (${revealScores.join(', ')})`);
  // The main button is N's next step until everyone is judged (finishing early is the smaller one), and the how-to is
  // open the first time.
  const revealMain = () => mainLabel(page);
  assert(
    /^(Show wager|Next player) ▶$/.test(await revealMain()) && (await page.locator('.fj button.ghost', { hasText: 'Finish game ▶' }).count()) === 1,
    `in the reveals the main button is the next step (${await revealMain()}), Finish game a smaller one`,
  );
  assert(await page.locator('.fj details.how').evaluate((d) => d.open), 'the reveals’ how-to is open the first time');
  // Not chosen yet: outlined at full strength (dimmed, they read too faintly).
  const unchosen = await page.locator('.fj .pl').first().getByRole('button', { name: '✘ Wrong' }).evaluate((b) => [getComputedStyle(b).opacity, getComputedStyle(b).backgroundColor]);
  assert(unchosen[0] === '1' && unchosen[1] === 'rgba(0, 0, 0, 0)', `an unchosen ✘ Wrong is outlined, not dimmed (${unchosen.join(', ')})`);
  const right = await cues(page, 'right');
  const wrong = await cues(page, 'wrong');
  await page.locator('.fj .pl').first().getByRole('button', { name: '✔ Right' }).click();
  await page.locator('.fj .pl').nth(1).getByRole('button', { name: '✘ Wrong' }).click();
  await page.waitForTimeout(200);
  assert((await cues(page, 'right')) === right + 1 && (await cues(page, 'wrong')) === wrong + 1, 'the reveal’s ✔ Right / ✘ Wrong buttons play their sounds');

  // ---------- A tie for first: no fanfare until it's settled; O rolls off the tied leaders ----------
  await page.locator('.fj .pl').nth(2).getByRole('button', { name: '✔ Right' }).click();
  assert((await revealMain()).includes('Finish game'), 'with everyone judged, Finish game is the main button');
  await page.getByRole('button', { name: 'Finish game ▶' }).click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Game over'));
  for (let i = 0; i < 3; i++) {
    await page.locator('.panel .p').nth(i).locator('.score').click();
    await page.locator('.panel .score-edit').fill('500');
    await page.keyboard.press('Enter');
  }
  await page.locator('.tie').waitFor();
  const winner = await cues(page, 'winner');
  // Back to the reveals and finish again, tied this time: "Tie for first" gets no fanfare.
  await page.getByRole('button', { name: '◀ Back to final reveals' }).click();
  assert(!(await page.locator('.fj details.how').evaluate((d) => d.open)), 'the how-to is folded after the first time');
  await page.getByRole('button', { name: 'Finish game ▶' }).click();
  await page.locator('.tie').waitFor();
  await page.waitForTimeout(300);
  assert((await cues(page, 'winner')) === winner, 'a tied end ("Tie for first") plays no winner fanfare');
  await page.locator('.panel .status').click();
  await page.keyboard.press('o');
  await stage('.wrap .title').waitFor();
  assert((await stage('.wrap .title').innerText()).includes('Tiebreaker roll-off'), 'O on a tie for first rolls off the tied leaders (not "Who goes first?")');
  await page.locator('.panel .muted', { hasText: 'won the tiebreaker roll-off' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  assert((await cues(page, 'winner')) === winner + 1, 'the winner fanfare plays once the roll-off settles the tie');
  await page.keyboard.press('Escape');

  // ---------- Resume asks how the game is shown, and comes back covered ----------
  await page.keyboard.press('k');
  await stage('.cover').waitFor();
  // (The results screen is cleared on Exit: go back to the reveals first.)
  await page.getByRole('button', { name: '◀ Back to final reveals' }).click();
  await page.getByRole('button', { name: '🚪 Exit' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await page.getByRole('button', { name: 'Resume game' }).click();
  const ask = page.locator('.mode-ask');
  await ask.waitFor();
  assert((await ask.locator('.mode').count()) === 2 && (await ask.innerText()).includes('screen covered'), 'Resume asks: single window or the audience window (and says it comes back covered)');
  const [aud] = await Promise.all([page.waitForEvent('popup'), ask.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  watch(aud, 'audience');
  await aud.locator('.cover').waitFor();
  await page.locator('.panel .cover-toggle.on').waitFor();
  assert(true, 'resumed into the audience window, the cover still on');
  await shot('host-3-resumed');

  assert(!errors.length, `no page errors (${errors.join(' | ')})`);
  console.log('hosting: all passed');
} finally {
  await browser.close();
}
