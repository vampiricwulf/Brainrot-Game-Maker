// A slides round: an introduction of several slides, in one round. The host makes it in the editor (it goes first, a
// template one too, which says so; the checklist goes to an empty slide, to a Final's missing answer, and to a
// tiebreaker ticked on but left empty), then plays through it with N (Shift+N back) and goes on to the board after the
// last slide. Then a game that ends with a Final
// and a long slides outro after it, in two windows: the outro's dots say "1 / 22" (they'd run off the stage), its host
// notes keep their lines, the tiebreaker's notes show; in the tiebreaker N follows the main button (the answer, then
// 🏁 Back to results, which warns first with a tied player picked and no winner given), points given there settle the
// tie (the panel says so), and Ctrl+Z takes back that award there, then goes back to the Final's reveals for its last
// judgment (not out of sight).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, mainButton, mainLabel, openGameFile, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const roundNames = async () => (await page.locator('nav > button.round-tab').allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  // A slides template goes first too, and says so (taken back after).
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Welcome and rules/ }).click();
  await page.locator('.toast', { hasText: 'at the start of the game: drag its tab to move it' }).waitFor();
  assert((await roundNames())[0] === 'Introduction', 'the 🖼 Welcome and rules template goes first, and says so');
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await page.waitForFunction(() => document.querySelectorAll('nav > button.round-tab').length === 2);
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Slides/ }).click();
  assert((await roundNames()).join('|') === 'Introduction|Jeopardy!|Final Jeopardy!', `the first slides round is the introduction: it goes first (${(await roundNames()).join(', ')})`);
  const text = page.locator('main [data-field="q"]');
  await text.fill('Welcome to the show');
  await page.getByRole('button', { name: '＋ Add slide' }).click();
  await page.getByRole('tab', { name: 'Slide 2' }).waitFor();
  assert((await page.getByRole('tab', { name: /Answer/ }).count()) === 0, 'its tabs are Slide 1, Slide 2 (no Answer)');
  // The checklist's line for an empty slide opens that slide, with the focus in its text.
  await page.getByRole('tab', { name: 'Slide 1' }).click();
  await page.locator('nav .problem', { hasText: 'Introduction: slide 2 is empty' }).click();
  await page.locator('label.quick', { hasText: 'Text (slide 2 of 2)' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="q"]'), null, { timeout: 3000 });
  assert(true, 'the checklist line for an empty slide opens that slide, with the focus in its text');
  await text.fill('Rules: be nice');
  await page.getByRole('tab', { name: 'Slide 1' }).click();
  assert((await text.inputValue()) === 'Welcome to the show', 'each slide keeps its own text');
  // A Final's line goes to the side with nothing on it (here its answer), from another round.
  await page.locator('nav > button.round-tab', { hasText: 'Final' }).click();
  await page.locator('main [data-field="q"]').fill('The final question');
  await page.locator('nav > button.round-tab', { hasText: 'Introduction' }).click();
  await page.locator('nav .problem', { hasText: 'Final Jeopardy! has no answer' }).click();
  await page.getByRole('tab', { name: /^Answer slide/, selected: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="a"]'), null, { timeout: 3000 });
  assert(true, "a Final's line for its missing answer opens its Answer side, with the focus in the Answer box");
  // A tiebreaker ticked on but not finished is on the checklist too (a tie would put its blank slide on stream): its line
  // opens the empty side's box.
  await page.getByRole('button', { name: /^Tiebreaker/ }).click();
  await page.getByLabel('Include a tiebreaker clue').check();
  await page.locator('nav .problem', { hasText: 'The tiebreaker has no question' }).waitFor();
  await page.locator('main [data-field="q"]').fill('How many toilets?');
  await page.locator('nav > button.round-tab', { hasText: 'Introduction' }).click();
  await page.locator('nav .problem', { hasText: 'The tiebreaker has no answer' }).click();
  await page.waitForFunction(() => document.activeElement?.matches('main [data-field="a"]'), null, { timeout: 3000 });
  assert(true, 'a tiebreaker ticked on but left empty is on the checklist, and its line opens the box to fill in');

  // ---------- Playing it ----------
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  const stage = page.locator('.stage-box');
  await stage.locator('[data-slide="1"]').getByText('Welcome to the show').waitFor();
  await page.locator('[data-slidepos]').getByText('Slide 1 of 2').waitFor();
  assert(true, 'the game starts on its first slide (no title card), and the panel says "Slide 1 of 2"');
  await page.getByRole('button', { name: 'Next slide ▶' }).waitFor();
  await page.keyboard.press('n');
  await stage.locator('[data-slide="2"]').getByText('Rules: be nice').waitFor();
  assert((await page.locator('[data-slide-pips]').getAttribute('aria-label')) === 'Slide 2 of 2', 'N shows the next slide (the dots say where it is)');
  await page.keyboard.press('Shift+N');
  await stage.locator('[data-slide="1"]').waitFor();
  await page.keyboard.press('n');
  await stage.locator('[data-slide="2"]').waitFor();
  assert(true, 'Shift+N the one before');
  await page.getByRole('button', { name: '◀ Slide' }).click();
  await stage.locator('[data-slide="1"]').waitFor();
  await stage.locator('[data-slide="1"]').click();
  await stage.locator('[data-slide="2"]').waitFor();
  assert(true, 'and with the mouse: ◀ Slide, and a click on the stage for the next');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/slides-host.png` });
  await page.getByRole('button', { name: 'Next round ▶' }).first().waitFor();
  assert(true, 'on the last slide the main button is Next round ▶');
  // Go to round with the keyboard: on a closed list ↓ picks the next round, so it asks first (a round played out goes on
  // at once only when picked with the mouse); Cancel gives the keys back to the list, on this round again.
  const goTo = page.getByRole('combobox', { name: 'Go to round' });
  await goTo.focus();
  await page.keyboard.press('ArrowDown');
  const strip = page.locator('.panel .confirm');
  await strip.getByText('Leave Introduction for Jeopardy!?').waitFor();
  assert((await stage.locator('[data-slide="2"]').count()) === 1, '↓ on Go to round asks before leaving the round (it doesn’t jump)');
  await page.waitForFunction(() => document.activeElement?.closest('.panel .confirm') && document.activeElement.textContent?.trim() === 'Cancel');
  await page.keyboard.press('Enter');
  await strip.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.matches('select[aria-label="Go to round"]'));
  assert((await goTo.locator('option:checked').innerText()).includes('Introduction'), 'Cancel puts the keys back on Go to round, on this round');
  // (Not in the first moments of a round: a double-click's second half doesn't jump ahead.)
  await page.waitForTimeout(500);
  // A click on the stage does what it says too.
  await stage.locator('[data-slide="2"]').click();
  await stage.locator('.board, .round-name').first().waitFor();
  assert(true, 'and then (a click on the stage, as N) goes on to the board');

  // ---------- A Final, then a slides outro, then the tiebreaker ----------
  console.log('A Final with a slides outro after it, and the tiebreaker:');
  const textEl = (id, t) => ({ id, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 72, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
  const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [textEl(id, t)] });
  const outro = Array.from({ length: 22 }, (_, i) => slide(`o${i}`, `Thanks ${i + 1}`));
  const game = {
    id: 'g_outro', version: 2, title: 'Outro Night',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 15, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8 },
    players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i], startScore: 500 })),
    rounds: [
      { id: 'r_final', name: 'Final Jeopardy!', mode: 'final', category: 'Memes', questionSlide: slide('fq', 'The final question'), answerSlide: slide('fa', 'The final answer'), timerSeconds: 30, allowNonPositive: true },
      { id: 'r_outro', name: 'Outro', mode: 'slides', questionSlide: outro[0], extraSlides: outro.slice(1).map((sl, i) => ({ id: `ox${i}`, ...sl })), hostNotes: 'Thank the sponsors\nPlug the next stream' },
    ],
    media: [], audio: {}, theme: {}, wheels: [], dice: [], statFields: [], items: [],
    tiebreaker: { questionSlide: slide('tq', 'How many toilets?'), answerSlide: slide('ta', 'Forty-two'), hostNotes: 'Closest without going over wins' },
  };
  mkdirSync(resolve('test-results'), { recursive: true });
  const gameFile = resolve('test-results/slidesround-outro.json');
  writeFileSync(gameFile, JSON.stringify(game));
  const p2 = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  p2.on('dialog', (d) => d.accept());
  await p2.goto(pathToFileURL(file).href);
  await openGameFile(p2, gameFile);
  await p2.getByText(/^Opened “/).waitFor();
  await p2.getByRole('button', { name: '▶ Play' }).click();
  await p2.getByRole('button', { name: 'Start game ▶' }).click();
  await p2.locator('.fj .wagers input[data-wager]').first().waitFor();
  // Two windows: the host's info column (the notes) is up.
  const [aud] = await Promise.all([p2.waitForEvent('popup'), p2.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
  aud.on('pageerror', (e) => errors.push('[audience] ' + e.message));
  await p2.locator('.info').waitFor();
  const wagers = p2.locator('.fj .wagers input[data-wager]');
  for (let i = 0; i < 2; i++) await wagers.nth(i).fill('100');
  for (const label of ['Show question ▶', 'Reveal answer ▶', 'Start player reveals ▶']) {
    await p2.waitForFunction((l) => document.querySelector('.panel [data-next]')?.textContent?.startsWith(l) && !document.querySelector('.panel [data-next]')?.disabled, label);
    await mainButton(p2).click();
  }
  // Both right: $600 each, a tie for first.
  for (let i = 0; i < 2; i++) await p2.locator('.fj .pl').nth(i).getByRole('button', { name: '✔ Right' }).click();
  await p2.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Next: Outro ▶'));
  await mainButton(p2).click();
  const s2 = p2.locator('.stage-box');
  await s2.locator('[data-slide="1"]').getByText('Thanks 1').waitFor();
  const pips = aud.locator('[data-slide-pips]');
  await pips.waitFor();
  const [pipBox, audWidth] = [await pips.boundingBox(), await aud.evaluate(() => window.innerWidth)];
  assert(
    (await pips.innerText()).trim() === '1 / 22' && (await pips.getAttribute('aria-label')) === 'Slide 1 of 22' && pipBox.x >= 0 && pipBox.x + pipBox.width <= audWidth,
    `a 22-slide outro: its dots say “1 / 22” and stay on the stage (${Math.round(pipBox.x)}–${Math.round(pipBox.x + pipBox.width)} of ${audWidth}px)`,
  );
  assert((await p2.locator('.info .notes').innerText()) === 'Thank the sponsors\nPlug the next stream', 'its host notes keep their lines in the host’s info column');
  for (let k = 2; k <= 22; k++) {
    await p2.keyboard.press('n');
    await s2.locator(`[data-slide="${k}"]`).waitFor();
  }
  await p2.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('End game ▶'));
  // (Not in the first moments of a round: see the Go to round guard.)
  await p2.waitForTimeout(450);
  await p2.keyboard.press('n');
  await p2.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  assert((await mainLabel(p2)) === '❓ Tiebreaker clue', `a tie for first: the tiebreaker clue is the main button (${await mainLabel(p2)})`);
  await mainButton(p2).click();
  await p2.locator('.panel .status', { hasText: 'Select the winner (Ann & Bob)' }).waitFor();
  assert((await p2.locator('.panel .hint', { hasText: 'Pick the winner' }).innerText()) === 'Pick the winner (1–2)', 'the tiebreaker names who’s tied, and asks for the winner (not "0 for everyone")');
  assert((await p2.locator('.info .notes').innerText()) === 'Closest without going over wins', 'the tiebreaker’s host notes show in the info column');
  // N: the answer, then 🏁 Back to results (its key on it).
  assert((await mainLabel(p2)) === '👁 Reveal answer', 'its one question slide up: 👁 Reveal answer is the main button');
  await p2.keyboard.press('n');
  await s2.locator('[data-slide="answer"]').getByText('Forty-two').waitFor();
  await p2.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('🏁 Back to results'));
  assert((await mainButton(p2).locator('kbd').innerText()) === 'N', 'N reveals the answer, then 🏁 Back to results is the main button, with N on it');
  // A tied player picked (1) and no winner given: the first N says so, and the tiebreaker stays up.
  await p2.keyboard.press('1');
  await p2.locator('.panel .p.on[data-player-id="p1"]').waitFor();
  await p2.keyboard.press('n');
  await p2.locator('.toast', { hasText: 'Ann is picked but hasn’t won yet' }).waitFor();
  assert((await p2.locator('.panel .status b').innerText()) === 'Tiebreaker', 'N with a tied player picked and no winner given warns first; the tiebreaker stays up');
  await p2.keyboard.press('n');
  await p2.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  assert(true, 'and N again goes back to the results');
  await mainButton(p2).click();
  await p2.locator('.panel .status', { hasText: 'Select the winner' }).waitFor();
  // Points given in the tiebreaker settle it: the panel says so (not "Select the winner").
  await p2.locator('.panel .status').click();
  await p2.keyboard.press('1');
  await p2.locator('.panel .award').getByLabel('Amount').fill('100');
  await p2.locator('.panel .award').getByLabel('Amount').press('Enter');
  await p2.locator('.panel .status', { hasText: 'Nobody is tied for first any more: 🏁 Back to results' }).waitFor();
  assert(true, '$100 to Ann in the tiebreaker: “Nobody is tied for first any more”');
  // Ctrl+Z takes that back there (the tiebreaker stays up), then the Final's last judgment goes back to its reveals,
  // past the outro after it.
  await p2.locator('.panel .status').click();
  await p2.keyboard.press('Control+z');
  await p2.locator('.panel .status', { hasText: 'Select the winner (Ann & Bob)' }).waitFor();
  assert((await aud.locator('[data-slide="1"]').innerText()).includes('How many toilets?'), 'Ctrl+Z takes back the tiebreaker’s points there (it stays on stream)');
  await p2.keyboard.press('Control+z');
  await p2.locator('.panel .status', { hasText: 'Player reveals' }).waitFor();
  // (The audience window follows a moment later.)
  await aud.locator('.final-label', { hasText: 'TIEBREAKER' }).waitFor({ state: 'detached' });
  const right = (i) => p2.locator('.fj .pl').nth(i).getByRole('button', { name: '✔ Right' }).getAttribute('aria-pressed');
  assert(
    (await right(0)) === 'true' && (await right(1)) === 'false',
    'then Ctrl+Z goes back to the Final’s reveals (an outro after it), its last judgment taken back there; the tiebreaker is off stream',
  );

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Slides round E2E passed.');
} finally {
  await browser.close();
}
