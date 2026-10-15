// 🤝 Judging a partner clue (docs/PARTNER-CLUES-SPEC.md §6.6, §9, §15): ✔ Got it and ✘ Missed score both players in one
// step with the clue's points (a second Enter right after the clock starts gives nothing), ⇄ Swap moving the points and
// the board with the parts, one Ctrl+Z taking it all back (scores, the board, the countdown, the 📤 list) and Ctrl+Y
// bringing it again, a player scored by hand first left as they are, ✘ Missed with negative scores off still marking
// both, the quick ✔/✘ chips worth each one's share, ↩ Cancel with the partner wheel up, and a reload mid-spin, while
// handing out the cards, while playing and once judged, then two windows (Enter held down in the audience window too).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mainLabel, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
mkdirSync(resolve('test-results'), { recursive: true });

// ---------- The game: Movies, Songs and Games, every tile but $200 a Describe it partner clue ----------
let n = 0;
const text = (t, y = 90) => ({ id: `t${n++}`, kind: 'text', text: t, x: 120, y, w: 1680, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...els) => ({ background: {}, elements: els });
const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
const values = [200, 400, 600, 800];
const clue = (c, r) => {
  const id = `q${c}_${r}`;
  const base = { id, value: null, type: 'standard', questionSlide: slide(text(`Clue ${c}-${r}`)), answerSlide: slide(text(`Answer ${c}-${r}`)) };
  if (r === 0 && c !== 2) return base;
  return {
    ...base,
    type: 'partner',
    partner: { ...rules },
    timerSeconds: 45,
    questionSlide: slide(text(`Describe movie ${c}-${r} without saying its name!`)),
    // (Movies $600 has no cards: its question starts the clock.)
    ...(c === 0 && r === 2 ? {} : { cards: [{ id: `c${n++}`, to: 'giver', ...slide(text(`Card ${c}-${r}`)) }] }),
  };
};
const game = {
  id: 'g_partner_judge', version: 2, title: 'Partner judging',
  settings: { allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true } },
  players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
  rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 0, categories: ['Movies', 'Songs', 'Games'].map((title, c) => ({ id: `cat${c}`, title, clues: values.map((_, r) => clue(c, r)) })) }],
  media: [], audio: {}, wheels: [], dice: [], theme: {},
};
const gameFile = resolve('test-results/partner-judge.json');
writeFileSync(gameFile, JSON.stringify(game));

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));

const stage = (sel) => page.locator(`.stage-box ${sel}`);
const tile = (cat, row) => stage(`.tile[data-clue="q${cat}_${row}"]`);
const panel = page.locator('.panel [data-partner-panel]');
const judgeRow = panel.locator('[data-partner-judge]');
const gotBtn = judgeRow.getByRole('button', { name: /✔ Got it/ });
const missBtn = judgeRow.getByRole('button', { name: /✘ Missed/ });
const toast = (t) => page.locator('.toast', { hasText: t }).waitFor({ timeout: 3000 }).then(() => true, () => false);
const chip = (name) => panel.getByRole('button', { name, exact: true });
const IDS = { Ann: 'p1', Bob: 'p2', Cat: 'p3', Dan: 'p4' };
const scoreOf = async (name) => (await page.locator(`.panel .players [data-player-id="${IDS[name]}"] .score`).innerText()).trim();
const scores = async () => Object.fromEntries(await Promise.all(Object.keys(IDS).map(async (k) => [k, await scoreOf(k)])));
const picker = async () => page.locator('.panel .players .p.picker').getAttribute('aria-label').catch(() => null);
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const wait = (ms) => page.waitForTimeout(ms);
/** P, then their number: who picks next. */
async function picks(num) {
  await page.keyboard.press('p');
  await page.keyboard.press(String(num));
}
/** Open a partner tile, choose the partner by number, show the question and (unless `clock` is false) start the clock. */
async function play(cat, row, partnerNo, { clock = true } = {}) {
  await tile(cat, row).click();
  await stage('[data-partner-up]').waitFor();
  await page.keyboard.press(String(partnerNo));
  await page.keyboard.press('Enter');
  await stage('[data-partner-badge]').waitFor();
  if (!clock) return;
  await wait(1100);
  await page.keyboard.press('Enter');
  await stage('.timer').waitFor();
}
async function resume() {
  await page.reload();
  await page.getByRole('button', { name: 'Resume game' }).click();
  await page.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await page.locator('.play .panel').waitFor();
}
/** Toggle a rule in ⚖ Rules mid-game. */
async function rule(label, on) {
  await page.locator('.panel').getByRole('button', { name: '⚖ Rules', exact: true }).click();
  const box = page.getByLabel(label);
  if (on) await box.check();
  else await box.uncheck();
  await page.keyboard.press('Escape');
  await page.getByLabel(label).waitFor({ state: 'detached' });
}

try {
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await tile(0, 1).waitFor();

  // ---------- ✔ Got it, after ⇄ Swap: the points and the board follow the parts ----------
  console.log('Judging:');
  await picks(1);
  await play(0, 1, 2);
  assert((await flat(judgeRow.locator('[data-judge-got]'))) === 'Bob +$400 · Ann +$200' && (await flat(judgeRow.locator('[data-judge-missed]'))) === 'Ann −$200', 'the judge row says what each gives: got → Bob +$400 · Ann +$200, missed → Ann −$200');
  assert((await gotBtn.innerText()).includes('⏎') && (await missBtn.innerText()).includes('⇧⏎'), 'once the clock runs, ✔ Got it is Enter and ✘ Missed is Shift+Enter');
  await page.keyboard.press('Enter');
  assert(await toast('The clock just started: press Enter again to give ✔ Got it'), 'a second Enter right after the clock starts gives nothing, and says why');
  assert(Object.values(await scores()).every((s) => s === '$0') && (await stage('.timer').count()) === 1, 'no score, and the countdown runs on');
  await page.screenshot({ path: 'test-results/partner-judge-live.png' });
  await panel.getByRole('button', { name: '⇄ Swap' }).first().click();
  assert((await flat(judgeRow.locator('[data-judge-got]'))) === 'Ann +$400 · Bob +$200' && (await flat(judgeRow.locator('[data-judge-missed]'))) === 'no points', '⇄ Swap: Ann describes, so got → Ann +$400 · Bob +$200, and a miss costs nobody (Bob is the partner)');
  await wait(1100);
  await page.keyboard.press('Enter');
  await panel.locator('[data-judged]').waitFor();
  let sc = await scores();
  assert(sc.Ann === '$400' && sc.Bob === '$200' && sc.Cat === '$0', `Enter: ✔ Got it scores both (${JSON.stringify(sc)})`);
  assert((await stage('.pops .pop').count()) === 2, 'two pops on stream');
  assert((await picker()) === 'Bob', 'the guesser, Bob, picks next');
  assert((await stage('.timer').count()) === 0, 'the countdown stops');
  assert((await flat(panel.locator('[data-judged]'))) === 'Judged: Ann ✔ +$400 · Bob ✔ +$200' && (await gotBtn.isDisabled()) && (await missBtn.isDisabled()), 'the buttons are off and their line reads the marks');
  assert((await flat(panel.locator('[data-card="1"]'))) === 'Card 1 → Ann (describer)' && (await chip('Card 1 to Bob').count()) === 0, 'the 📤 list closes to one line a card');
  assert((await mainLabel(page)) === '👁 Reveal answer', 'the answer is next');
  await page.screenshot({ path: 'test-results/partner-judge-judged.png' });
  await page.keyboard.press('Enter');
  assert(await toast('Judged: Ann ✔ +$400 · Bob ✔ +$200 (Ctrl+Z takes it back)'), 'Enter again says it’s judged');
  await page.keyboard.press('l');
  const log = await page.locator('aside').innerText();
  assert((log.match(/partner clue: Ann described, Bob guessed/g) ?? []).length >= 1 && log.includes('score changes'), `📜 Log: one step, “score changes”, for the partner clue (${log.slice(0, 300).replace(/\n/g, ' | ')})`);
  await page.keyboard.press('Escape');

  // ---------- Ctrl+Z / Ctrl+Y ----------
  await page.keyboard.press('Control+z');
  await gotBtn.and(page.locator(':enabled')).waitFor();
  sc = await scores();
  assert(sc.Ann === '$0' && sc.Bob === '$0', 'one Ctrl+Z takes both scores back');
  assert((await picker()) === 'Ann', 'gives the board back to Ann');
  assert((await stage('.timer').count()) === 1, 'brings the countdown back');
  assert((await chip('Card 1 to Ann').count()) === 1 && (await panel.locator('[data-judged]').count()) === 0, 'and opens the 📤 list again');
  await page.keyboard.press('Control+y');
  await panel.locator('[data-judged]').waitFor();
  sc = await scores();
  assert(sc.Ann === '$400' && sc.Bob === '$200' && (await picker()) === 'Bob' && (await stage('.timer').count()) === 0, 'Ctrl+Y: both scores, the board and the stopped countdown come back');
  await page.keyboard.press('Control+z');
  await gotBtn.and(page.locator(':enabled')).waitFor();
  await page.keyboard.press('Shift+Enter');
  await panel.locator('[data-judged]').waitFor();
  sc = await scores();
  assert(sc.Ann === '$0' && sc.Bob === '$0' && (await flat(panel.locator('[data-judged]'))) === 'Judged: Ann ✘ 0 · Bob ✘ 0', 'Shift+Enter after ⇄ Swap: ✘ Missed costs nobody, and marks both');
  assert((await picker()) === 'Ann', 'a miss leaves the board where it was');
  await page.keyboard.press('Escape');
  await tile(0, 2).waitFor();
  assert((await tile(0, 1).getAttribute('class')).includes('used'), 'Esc: back to the board, the tile used');

  // ---------- ✘ Missed costs the guesser half, never the partner ----------
  await picks(1);
  await play(0, 3, 2);
  await wait(1100);
  await page.keyboard.press('Shift+Enter');
  await panel.locator('[data-judged]').waitFor();
  sc = await scores();
  assert(sc.Ann === '−$400' && sc.Bob === '$0' && (await flat(panel.locator('[data-judged]'))) === 'Judged: Bob ✘ 0 · Ann ✘ −$400', `✘ Missed: Ann −$400, Bob ✘ 0 (${JSON.stringify(sc)})`);
  await page.keyboard.press('Escape');

  // ---------- A clue with no cards: Show question starts it, and a second Enter gives nothing ----------
  await picks(1);
  await play(0, 2, 3, { clock: false });
  await page.keyboard.press('Enter');
  assert(await toast('The question just went up: press Enter again to give ✔ Got it'), 'no cards: Enter right after Show question gives nothing (no countdown started by itself: it says the question went up)');
  await page.keyboard.press('Shift+Enter');
  sc = await scores();
  assert(sc.Cat === '$0' && sc.Ann === '−$400', 'nor does Shift+Enter');
  await wait(1100);
  await page.keyboard.press('Enter');
  await panel.locator('[data-judged]').waitFor();
  sc = await scores();
  assert(sc.Cat === '$600' && sc.Ann === '−$100' && (await picker()) === 'Ann', `a moment later Enter gives ✔ Got it: Cat +$600, Ann +$300, and Ann keeps the board (${JSON.stringify(sc)})`);
  await page.keyboard.press('Escape');

  // ---------- Scored by hand first ----------
  await picks(1);
  await play(1, 1, 2, { clock: false });
  await wait(1100);
  await page.keyboard.press('Shift+Enter');
  assert(await toast('Start the clock first (Enter), or click ✘ Missed'), 'Shift+Enter while handing out the cards judges nothing');
  assert((await scoreOf('Bob')) === '$0', 'and gives nothing');
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.panel .players [data-player-id="p2"] .score')?.textContent.trim() === '$400');
  assert((await flat(judgeRow.locator('[data-judge-got]'))) === 'Ann +$200 · Bob already scored', '2, then Enter awards Bob by hand; ✔ Got it would give only Ann her share');
  await gotBtn.click();
  await panel.locator('[data-judged]').waitFor();
  sc = await scores();
  assert(sc.Ann === '$100' && sc.Bob === '$400', `a click on ✔ Got it while handing out the cards: Ann +$200, Bob left as he was (${JSON.stringify(sc)})`);
  assert((await flat(panel.locator('[data-judged]'))) === 'Judged: Bob ✔ +$400 · Ann ✔ +$200' && (await gotBtn.isDisabled()), 'both marked: the buttons are off, the line reads the marks');
  assert((await mainLabel(page)) === '👁 Reveal answer' && (await page.evaluate(() => document.activeElement?.matches('[data-next]'))), 'judged by a click: the answer is next, and the keys are on it');
  await page.keyboard.press('Control+z');
  await gotBtn.and(page.locator(':enabled')).waitFor();
  assert((await flat(judgeRow.locator('[data-judge-got]'))) === 'Ann +$200 · Bob already scored' && (await mainLabel(page)) === '⏱ Start the clock', 'Ctrl+Z brings the buttons back (Bob still scored), and the clock to start');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('.panel .players [data-player-id="p2"] .score')?.textContent.trim() === '$0');
  assert((await flat(judgeRow.locator('[data-judge-got]'))) === 'Bob +$400 · Ann +$200', 'another Ctrl+Z takes Bob’s back');
  await page.keyboard.press('Escape');

  // ---------- Negative scores off: a guesser on $0 still gets a ✘ ----------
  await rule('Allow negative scores', false);
  await picks(4);
  await play(1, 2, 2);
  await wait(1100);
  await page.keyboard.press('Shift+Enter');
  await panel.locator('[data-judged]').waitFor();
  assert((await flat(panel.locator('[data-judged]'))) === 'Judged: Bob ✘ 0 · Dan ✘ 0' && (await missBtn.isDisabled()), 'negative scores off, Dan on $0: ✘ Missed marks both all the same, and the buttons go off');
  await page.keyboard.press('Escape');
  await rule('Allow negative scores', true);

  // ---------- The quick ✔/✘ chips: only the two, each worth their share ----------
  await rule('Show quick ✔/✘ buttons (one click for right or wrong)', true);
  await picks(1);
  await play(1, 3, 2);
  const quick = (who, k) => page.locator(`.panel .players [data-player-id="${IDS[who]}"] button.quick.${k}`);
  assert((await quick('Cat', 'right').count()) === 0 && (await quick('Dan', 'right').count()) === 0, 'the quick ✔/✘ are only on the two players’ chips');
  assert(
    (await quick('Ann', 'right').getAttribute('aria-label')) === 'Right: Ann +$400' && (await quick('Bob', 'right').getAttribute('aria-label')) === 'Right: Bob +$800' && (await quick('Bob', 'wrong').getAttribute('aria-label')) === 'Wrong: Bob $0' && (await quick('Ann', 'wrong').getAttribute('aria-label')) === 'Wrong: Ann −$400',
    'each is worth that player’s share',
  );
  await quick('Bob', 'wrong').click();
  await page.waitForFunction(() => document.querySelector('[data-judge-got]')?.textContent.includes('Bob already scored'));
  assert((await scoreOf('Bob')) === '$0', 'Bob’s ✘: a mark, no points');
  await wait(1100);
  await page.keyboard.press('Enter');
  await panel.locator('[data-judged]').waitFor();
  assert((await flat(panel.locator('[data-judged]'))) === 'Judged: Bob ✘ 0 · Ann ✔ +$400' && (await scoreOf('Ann')) === '$300', 'then Enter gives Ann her share only');
  await page.keyboard.press('Escape');
  await rule('Show quick ✔/✘ buttons (one click for right or wrong)', false);

  // ---------- ↩ Cancel with the partner wheel up: it goes with the clue ----------
  await picks(1);
  await tile(2, 3).click();
  await stage('[data-partner-up]').waitFor();
  await page.keyboard.press('w');
  await stage('.wheel').waitFor();
  await page.locator('.panel').getByRole('button', { name: '↩ Cancel (keep tile)' }).click();
  await tile(2, 3).waitFor();
  const gone = await stage('.wheel').waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false);
  assert(gone && !(await tile(2, 3).getAttribute('class')).includes('used'), '↩ Cancel with the partner wheel up: back to the board, the wheel gone, the tile kept');

  // ---------- Reloads ----------
  console.log('Reloads:');
  await picks(1);
  await tile(2, 1).click();
  await stage('[data-partner-up]').waitFor();
  await page.keyboard.press('w');
  await stage('.wheel').waitFor();
  await resume();
  await stage('.wheel').waitFor();
  await page.keyboard.press('l');
  await page.locator('aside .tab', { hasText: 'Rolls' }).click();
  const rollNow = await page.locator('aside .roll').first().innerText();
  await page.keyboard.press('Escape');
  await panel.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 8000 });
  const landed = (await panel.locator('button.chip[aria-pressed="true"]').getAttribute('aria-label')).replace(' is the partner', '');
  assert(rollNow.includes('… spinning') && ['Bob', 'Cat', 'Dan'].includes(landed), `a reload mid-spin: the wheel comes back still spinning (the log keeps it hidden), and its landing is the partner (${landed})`);
  await page.keyboard.press('Escape');
  await stage('.wheel').waitFor({ state: 'detached' });
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await stage('[data-partner-badge]').waitFor();
  await chip('Card 1 to Cat').click();
  await resume();
  await panel.waitFor();
  assert((await mainLabel(page)) === '⏱ Start the clock' && (await chip('Card 1 to Cat').getAttribute('aria-pressed')) === 'true' && (await panel.locator('[data-card="1"]').innerText()).includes('(changed)'), 'a reload while handing out the cards: the list as it was, the change kept');
  await page.keyboard.press('Enter');
  await stage('.timer').waitFor();
  assert((await mainLabel(page)) === '👁 Reveal answer', 'and Enter starts the clock at once (the guard’s times aren’t kept)');
  await resume();
  await panel.waitFor();
  assert((await gotBtn.isEnabled()) && (await gotBtn.innerText()).includes('⏎') && (await stage('.timer').count()) === 0, 'a reload while playing: the judge buttons, the countdown lost (as on any clue)');
  const before = await scores();
  await page.keyboard.press('Enter');
  await panel.locator('[data-judged]').waitFor();
  sc = await scores();
  assert(sc.Bob === `$${parseInt(before.Bob.replace(/\D/g, '')) + 400}`, `Enter at once gives ✔ Got it (${JSON.stringify(before)} → ${JSON.stringify(sc)})`);
  await resume();
  await panel.locator('[data-judged]').waitFor();
  assert((await gotBtn.isDisabled()) && (await panel.locator('[data-card="1"]').innerText()).startsWith('Card 1 → '), 'a reload once judged: still judged, the list closed');
  await page.keyboard.press('Control+z');
  await gotBtn.and(page.locator(':enabled')).waitFor();
  assert((await scores()).Bob === before.Bob, 'and Ctrl+Z still takes it back');
  await page.keyboard.press('Escape');

  // ---------- Two windows ----------
  console.log('Two windows:');
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('a')]);
  aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
  await aud.locator('.board').waitFor();
  await picks(1);
  await tile(2, 2).click();
  await aud.locator('[data-partner-up]').waitFor();
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await aud.locator('[data-partner-badge]').waitFor();
  await wait(1100);
  await page.keyboard.press('Enter');
  await aud.locator('.timer').waitFor();
  await wait(1100);
  await page.keyboard.press('Enter');
  await aud.locator('.pops .pop').first().waitFor();
  assert((await aud.locator('.pops .pop').count()) === 2 && (await aud.locator('.timer').count()) === 0, 'the audience window gets both pops, and the countdown stops');
  assert(!(await aud.locator('body').innerText()).includes('Judged'), 'the panel’s judge row stays in the host window');
  await page.keyboard.press('Escape');
  await aud.locator('.board').waitFor();

  // Enter held down in the audience window (the host clicked it to allow sound, and kept typing there): its first press
  // shows the question, and its repeats, even seconds later, neither start the clock nor score.
  await picks(1);
  const held = JSON.stringify(await scores());
  await tile(2, 3).click();
  await aud.locator('[data-partner-up]').waitFor();
  await page.keyboard.press('2');
  await aud.locator('[data-partner-up]', { hasText: 'Bob' }).waitFor();
  await aud.keyboard.down('Enter');
  await aud.locator('[data-partner-badge]').waitFor();
  for (let i = 0; i < 30; i++) {
    await aud.keyboard.down('Enter');
    await aud.waitForTimeout(80);
  }
  await aud.keyboard.up('Enter');
  await wait(300);
  assert(
    (await mainLabel(page)) === '⏱ Start the clock' && (await aud.locator('.timer').count()) === 0 && JSON.stringify(await scores()) === held && (await panel.locator('[data-judged]').count()) === 0,
    'Enter held down in the audience window shows the question once: its repeats don’t start the clock or score',
  );
  await page.keyboard.press('Escape');
  await aud.locator('.board').waitFor();

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner clue judging tests passed');
} catch (e) {
  await page.screenshot({ path: 'test-results/partner-judge-failure.png' }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
