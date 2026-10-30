// 🤝 Playing a partner clue (docs/PARTNER-CLUES-SPEC.md §6–§8): PARTNER UP! on stream, "Who picked it?", the partner
// wheel (the picker never on it, the log hiding the spin until it lands, its landing the partner), overruling it with
// 1–9, ▶ Show question with the parts badge and caption, a second Enter that doesn't start the clock, the 📤 list's
// chips (a change stays through ⇄ Swap, ↺ follows the parts again), 📋 Copy words, ⏱ Start the clock, a click on the
// stage that leaves the answer hidden until it's judged, Shift+Enter on ✔ Got it giving ✘ Missed, a blank question's
// own card, Esc before the question keeping the tile, U and the ? list. In one window the host page never
// holds a card's words or its picture's name; in two windows the audience window never does, and the host column lists
// the cards as text.
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

// ---------- The game: Movies $400, $600 and $800 are partner clues ----------
// Words and a file name that are only on cards: they must never be on stream.
const SECRET = 'Ogres-xyzzy-onions';
const PIC = 'zorbulon-secret.png';
let n = 0;
const text = (t, y = 90) => ({ id: `t${n++}`, kind: 'text', text: t, x: 120, y, w: 1680, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...els) => ({ background: {}, elements: els });
const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
const cards = () => [
  { id: `c${n++}`, to: 'giver', ...slide(text('Shrek')) },
  { id: `c${n++}`, to: 'nobody', ...slide(text(SECRET), { id: `i${n++}`, kind: 'image', media: 'm_z', fit: 'contain', x: 600, y: 600, w: 400, h: 300, rotation: 0, opacity: 1, zIndex: 2 }) },
];
const values = [200, 400, 600, 800];
const clue = (c, r) => {
  const id = `q${c}_${r}`;
  const base = { id, value: null, type: 'standard', questionSlide: slide(text(`Clue ${c}-${r}`)), answerSlide: slide(text(`Answer ${c}-${r}`)) };
  if (c !== 0 || r === 0) return base;
  return {
    ...base,
    type: 'partner',
    partner: { ...rules },
    timerSeconds: 45,
    questionSlide: r === 2 ? slide(text('')) : slide(text('Describe this movie without saying its name!')),
    answerSlide: slide(text('Shrek')),
    ...(r === 2 ? {} : { cards: cards() }),
  };
};
const game = {
  id: 'g_partner', version: 2, title: 'Partner night',
  settings: { allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true } },
  players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
  rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 0, categories: ['Movies', 'Songs'].map((title, c) => ({ id: `cat${c}`, title, clues: values.map((_, r) => clue(c, r)) })) }],
  media: [{ id: 'm_z', name: PIC, mime: 'image/png', size: 0, kind: 'image', url: 'https://example.invalid/zorbulon-secret.png' }],
  // (Its own text color on slides and scores: the blank question's card follows it.)
  audio: {}, wheels: [], dice: [], theme: { stageText: '#ffe066' },
};
const gameFile = resolve('test-results/partner-play.json');
writeFileSync(gameFile, JSON.stringify(game));

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));

/** Everything a page shows or says: its text, its labels and titles (screen readers, tooltips). */
const pageWords = (p) =>
  p.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('[aria-label], [title]')].flatMap((e) => [e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? ''])].join('\n'));
/** The page never holds a card's own words or its picture's name. */
async function noCards(p, when) {
  const words = await pageWords(p);
  assert(!words.includes(SECRET) && !words.includes(PIC) && !words.includes('zorbulon'), `${when}: no card’s words nor its picture’s name`);
}
const stage = (sel) => page.locator(`.stage-box ${sel}`);
const tile = (cat, row) => stage(`.tile[data-clue="q${cat}_${row}"]`);
const panel = page.locator('.panel [data-partner-panel]');
const toast = (t) => page.locator('.toast', { hasText: t }).waitFor({ timeout: 3000 }).then(() => true, () => false);
const chip = (name) => panel.getByRole('button', { name, exact: true });

try {
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await tile(0, 1).waitFor();

  // ---------- PARTNER UP!, and who picked it ----------
  console.log('One window:');
  await tile(0, 1).click();
  await stage('[data-partner-up]').waitFor();
  assert((await stage('[data-partner-up]').innerText()).replace(/\s+/g, ' ').includes('PARTNER UP!'), 'the tile opens on PARTNER UP! on stream');
  assert((await panel.innerText()).includes('Who picked it?'), 'nobody was marked to pick: the panel asks who picked it');
  assert((await mainButtonState()).disabled, 'and 🎡 Spin for a partner waits for that');
  assert((await page.locator('.panel .status').innerText()).includes('Partner clue: who picked it? (1–4)'), 'the status row asks who picked it too (not to spin yet)');
  await page.keyboard.press('1');
  await panel.getByText('Ann picked it.').waitFor();
  assert((await page.locator('.panel .status').innerText()).includes('Partner clue: spin for a partner'), 'Ann picked it: the status row says to spin for a partner');
  assert((await stage('[data-partner-up]').innerText()).includes('Ann') && (await stage('.pu-plate.waiting').count()) === 1, '1: Ann picked it; the stage shows her plate and a pulsing “?”');
  assert((await page.locator('.panel [data-partner-tag]').innerText()).trim() === '🤝 Ann', 'the status row’s tag says whose partner clue it is');
  assert((await page.locator('.panel .players').count()) === 0, 'no award row before the question');
  await noCards(page, 'PARTNER UP!');

  // ---------- The partner wheel ----------
  assert((await mainLabel(page)) === '🎡 Spin for a partner', `the main button spins for a partner (${await mainLabel(page)})`);
  await page.keyboard.press('w');
  await stage('.wheel').waitFor();
  const slices = await stage('.wheel text').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  assert(slices.length === 3 && !slices.includes('Ann') && slices.includes('Bob'), `W spins a wheel of the others: Ann isn’t on it (${slices.join(', ')})`);
  assert((await page.locator('.panel [data-tool-controls]').innerText()).includes('Partner for Ann'), 'its name says who it’s for');
  assert((await chip('Bob is the partner').isDisabled()) && !(await chip('Bob is the partner').getAttribute('aria-pressed')).includes('true'), 'the partner chips wait while it spins');
  await page.keyboard.press('l');
  await page.locator('aside .tab', { hasText: 'Rolls' }).click();
  assert((await page.locator('aside .roll').first().innerText()).includes('… spinning'), '📜 Log › Rolls doesn’t give the spin away while it spins');
  await page.keyboard.press('Escape');
  await panel.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 8000 });
  const landed = (await panel.locator('button.chip[aria-pressed="true"]').getAttribute('aria-label')).replace(' is the partner', '');
  assert(['Bob', 'Cat', 'Dan'].includes(landed), `its landing is the partner (${landed})`);
  assert((await page.locator('.panel [data-partner-tag]').innerText()).includes(`Ann + ${landed}`), 'the tag says the pair');
  await page.keyboard.press('l');
  const shown = await page.waitForFunction((who) => document.querySelector('aside .roll')?.textContent.includes(who), landed, { timeout: 2000 }).then(() => true, () => false);
  assert(shown && !(await page.locator('aside .roll').first().innerText()).includes('spinning'), 'and the log shows the spin once it has landed');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await stage('.wheel').waitFor({ state: 'detached' });
  assert((await stage('[data-partner-up]').innerText()).includes(landed), 'Esc closes the wheel onto the pair');
  await page.keyboard.press('3');
  await page.keyboard.press('2');
  assert((await chip('Bob is the partner').getAttribute('aria-pressed')) === 'true', '1–9 overrule the wheel (2: Bob)');
  await page.keyboard.press('1');
  assert(await toast('Ann picked it: tick'), 'Ann’s own number says how to make it Solo');
  const panelText = await panel.innerText();
  assert(panelText.includes('🗣 Bob describes · 🎯 Ann guesses') && panelText.includes('Card 1 → Bob (describer) · Card 2 → nobody yet'), `the panel says who plays which part and where the cards go (${panelText.replace(/\n/g, ' | ')})`);
  assert(panelText.includes('⚠ Viewers can see this window'), 'and that viewers can see it');
  await noCards(page, 'paired');
  await page.screenshot({ path: 'test-results/partner-play-paired.png' });

  // ---------- ▶ Show question, and a second Enter ----------
  assert((await mainLabel(page)) === '▶ Show question', 'paired: ▶ Show question is the main button');
  await page.keyboard.press('Enter');
  await stage('[data-partner-badge]').waitFor();
  await page.keyboard.press('Enter');
  assert(await toast('The question just went up'), 'a second Enter at once doesn’t start the clock');
  assert((await mainLabel(page)) === '⏱ Start the clock' && (await stage('.timer').count()) === 0, 'the main button is ⏱ Start the clock, and no countdown runs');
  assert((await stage('[data-partner-badge]').innerText()).replace(/\s+/g, ' ').trim() === '🗣 Bob describes → 🎯 Ann guesses', 'the stream shows who plays which part');
  assert((await stage('.caption').innerText()).trim().endsWith('· 🤝'), `and the caption marks it (${await stage('.caption').innerText()})`);
  assert((await stage('[data-slide="1"]').innerText()).includes('Describe this movie'), 'the question is on stream');
  const list = (await panel.innerText()).replace(/\s+/g, ' ');
  assert(list.includes('Card 1 · 1 line of words') && list.includes('Card 2 · 1 line of words, 1 picture'), `the 📤 list counts what’s on each card (${list})`);

  // ---------- Who gets each card ----------
  assert((await chip('Card 1 to Bob').getAttribute('aria-pressed')) === 'true' && (await chip('Card 1 to Ann').getAttribute('aria-pressed')) === 'false', 'Card 1 starts with the describer, Bob');
  await chip('Card 1 to Cat').click();
  assert((await chip('Card 1 to Cat').getAttribute('aria-pressed')) === 'true' && (await panel.locator('[data-card="1"]').innerText()).includes('(changed)'), 'a chip gives it to Cat as well, and the row says it changed');
  await panel.getByRole('button', { name: '⇄ Swap' }).first().click();
  assert((await stage('[data-partner-badge]').innerText()).replace(/\s+/g, ' ').trim() === '🗣 Ann describes → 🎯 Bob guesses', '⇄ Swap turns the parts round on stream');
  assert((await chip('Card 1 to Bob').getAttribute('aria-pressed')) === 'true' && (await chip('Card 1 to Ann').getAttribute('aria-pressed')) === 'false', 'a row you changed stays as it was');
  await panel.getByRole('button', { name: 'Card 1: back to the describer' }).click();
  assert((await chip('Card 1 to Ann').getAttribute('aria-pressed')) === 'true' && (await chip('Card 1 to Bob').getAttribute('aria-pressed')) === 'false', '↺ follows the parts again: the describer is Ann now');
  await panel.getByRole('button', { name: '⇄ Swap' }).first().click();
  assert((await chip('Card 1 to Bob').getAttribute('aria-pressed')) === 'true', 'swapped back, it’s Bob’s again');
  assert(await panel.locator('[data-card="2"]').getByRole('button', { name: '📋 Copy words' }).isDisabled(), 'a card for nobody yet has nothing to copy');
  await panel.locator('[data-card="1"]').getByRole('button', { name: '📋 Copy words' }).click();
  assert(await toast('Card 1’s words copied: paste them to Bob'), '📋 Copy words says who to paste it to (not what)');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert(copied === '🤫 For Bob only (Movies $400, card 1): Shrek', `and copies the card for Bob (${copied})`);
  await chip('Card 2 to Cat').click();
  assert((await panel.locator('[data-card="2"]').getByRole('button', { name: '📋 Copy picture' }).count()) === 1, 'a card with a picture offers 📋 Copy picture');
  await noCards(page, 'handing out the cards');
  await page.screenshot({ path: 'test-results/partner-play-distribute.png' });
  // A click on the question while the cards are handed out never puts the answer on stream: it says so.
  await stage('[data-slide="1"]').click();
  assert(
    await toast('The answer stays hidden until they’ve had their go: copy the cards to their players, then ⏱ Start the clock (Enter) · R shows it anyway'),
    'a click on the stage while handing out the cards says the answer stays hidden, and what’s next',
  );
  assert((await stage('[data-slide="answer"]').count()) === 0 && (await mainLabel(page)) === '⏱ Start the clock', 'and the question stays up, the clock next');

  // ---------- ⏱ Start the clock ----------
  await page.keyboard.press('u');
  assert(await toast('Nobody buzzes on a partner clue'), 'U: nobody buzzes on a partner clue');
  await page.waitForTimeout(1100);
  await page.keyboard.press('Enter');
  await stage('.timer').waitFor();
  assert((await mainLabel(page)) === '👁 Reveal answer', 'Enter a moment later starts the clock; the answer is next');
  assert((await page.locator('.panel .players').count()) === 1, 'the award row is there, as on any clue');
  // With the clock running they're still describing: a click on the stage says how to judge, not the answer.
  await stage('[data-slide="1"]').click();
  assert(await toast('Right or wrong? ✔ Got it / ✘ Missed in the 🤝 box (Enter / Shift+Enter)'), 'a click on the stage with the clock running says how to judge');
  assert((await stage('[data-slide="answer"]').count()) === 0, 'and leaves the answer hidden');
  // Shift+Tab to ✔ Got it, then Shift+Enter: ✘ Missed, as Shift+Enter is anywhere (not a press of the button the keys
  // are on). (Past the second after the clock starts in which the keys don't judge.)
  await page.waitForTimeout(1100);
  const judgeRow = panel.locator('[data-partner-judge]');
  await judgeRow.getByRole('button', { name: /✘ Missed/ }).focus();
  await page.keyboard.press('Shift+Tab');
  assert(await judgeRow.getByRole('button', { name: /✔ Got it/ }).evaluate((e) => e === document.activeElement), 'Shift+Tab takes the keys to ✔ Got it');
  await page.keyboard.press('Shift+Enter');
  await judgeRow.locator('[data-judged]').waitFor();
  const judgedLine = await judgeRow.locator('[data-judged]').innerText();
  assert(judgedLine.includes('✘') && !judgedLine.includes('✔'), `Shift+Enter with the keys on ✔ Got it gives ✘ Missed (${judgedLine})`);
  // Judged: a click on the stage shows the answer now, as on any clue.
  await stage('[data-slide="1"]').click();
  await stage('[data-slide="answer"]').waitFor();
  assert(true, 'judged, a click on the stage shows the answer');
  await noCards(page, 'the answer');
  await page.keyboard.press('Escape');
  await tile(0, 2).waitFor();
  assert((await tile(0, 1).getAttribute('class')).includes('used'), 'Esc after the question: the tile is used');

  // ---------- A clue with no cards and a blank question ----------
  await page.keyboard.press('p');
  await page.keyboard.press('1');
  await tile(0, 2).click();
  await panel.getByText('Ann picked it.').waitFor();
  assert((await panel.innerText()).includes('No cards on this clue'), 'a clue with no cards says so');
  // (The countdown doesn't start by itself in this game: the question doesn't start it either.)
  assert((await panel.innerText()).includes('No cards on this clue: start the clock yourself (T) once the question is up.'), 'and, the countdown not starting by itself, to start the clock with T');
  await page.keyboard.press('4');
  await page.keyboard.press('Enter');
  await stage('[data-partner-card]').waitFor();
  assert(!(await stage('.timer').count()), 'the question is up, and no countdown runs');
  const card = (await stage('[data-partner-card]').innerText()).replace(/\s+/g, ' ');
  assert(card.includes('Describe it!') && card.includes('Ann') && card.includes('Dan') && card.includes('MOVIES'), `a blank question shows a card of its own: the game, the two, the category (${card})`);
  const catColor = await stage('[data-partner-card] .pc-cat').evaluate((e) => getComputedStyle(e).color);
  assert(catColor === 'rgb(255, 224, 102)', `its category is in the theme's text color, as a slide's text is (it was always white, faint on a light theme) (${catColor})`);
  assert((await mainLabel(page)) === '👁 Reveal answer', 'with no cards to hand out, the question is all: the answer is next');
  // Dan taken out mid-question (👥 Players), then Ctrl+Z: the pair and its question come back with their countdown.
  await page.keyboard.press('t');
  // (A second or two in, so a countdown started afresh would show.)
  await page.waitForFunction(() => Number(document.querySelector('.stage-box .timer .num')?.textContent) <= 43);
  const left = Number(await stage('.timer .num').innerText());
  await page.getByRole('button', { name: '👥 Players' }).click();
  await page.getByRole('button', { name: 'Remove Dan' }).click();
  await page.locator('.modal .ask').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('dialog', { name: 'Players' }).waitFor({ state: 'detached' });
  await stage('[data-partner-up]').waitFor();
  assert((await stage('.timer').count()) === 0, 'the partner taken out mid-question: back to PARTNER UP!, its countdown gone');
  await page.keyboard.press('Control+z');
  await stage('[data-partner-card]').waitFor();
  await stage('.timer .num').waitFor();
  const back = Number(await stage('.timer .num').innerText());
  assert(back > 0 && back <= left && !(await stage('.timer.paused').count()), `Ctrl+Z: the question is back with its countdown going, with the time it had left (${left} → ${back} s)`);
  await page.keyboard.press('Control+Shift+z');
  await stage('[data-partner-up]').waitFor();
  assert((await stage('.timer').count()) === 0, 'Ctrl+Shift+Z takes Dan out again, and the countdown with him');
  await page.keyboard.press('Control+z');
  await stage('.timer .num').waitFor();
  await page.keyboard.press('Escape');

  // ---------- Esc before the question keeps the tile ----------
  await tile(0, 3).click();
  await stage('[data-partner-up]').waitFor();
  await page.keyboard.press('Escape');
  await tile(0, 3).waitFor();
  assert(!(await tile(0, 3).getAttribute('class')).includes('used'), 'Esc on PARTNER UP!: back to the board, the tile still playable');
  await page.keyboard.press('?');
  assert((await page.getByText('W on a partner clue').count()) === 1, 'the ? list has the partner clue’s keys');
  // (As at the start: with nobody marked as its picker yet, the first number says who picked it, not the partner.)
  const partnerKey = page.getByRole('dialog', { name: 'Keyboard shortcuts' }).locator('tr', { hasText: 'W on a partner clue' });
  assert((await partnerKey.innerText()).includes('who picked it: their number first'), 'and says that with nobody marked as its picker, their number comes first');
  await page.keyboard.press('Escape');

  // ---------- Two windows: the audience window never gets a card; the host column lists them ----------
  console.log('Two windows:');
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('a')]);
  aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
  await aud.locator('.board').waitFor();
  await tile(0, 3).click();
  await aud.locator('[data-partner-up]').waitFor();
  assert((await aud.locator('[data-partner-up]').innerText()).includes('Ann'), 'PARTNER UP! goes on stream');
  const info = page.locator('.info');
  assert((await info.innerText()).includes('🤝 Partner clue · Ann · choosing a partner'), 'the host column says whose partner clue it is');
  const cardsInfo = await info.locator('[data-partner-cards-info]').innerText();
  assert(cardsInfo.includes(SECRET) && cardsInfo.includes(`🖼 ${PIC} · picture`) && cardsInfo.includes('This card shows the answer'), 'and lists each card as text, with its picture’s name (only the host sees this window)');
  await noCards(aud, 'audience: PARTNER UP!');
  await page.keyboard.press('3');
  await page.keyboard.press('Enter');
  await aud.locator('[data-partner-badge]').waitFor();
  assert((await info.innerText()).includes('Card 1 → Cat (describer)'), 'the host column says who gets each card');
  await noCards(aud, 'audience: the question');
  await page.waitForTimeout(1100);
  await page.keyboard.press('Enter');
  await aud.locator('.timer').waitFor();
  await page.keyboard.press('r');
  await aud.locator('[data-slide="answer"]').waitFor();
  await noCards(aud, 'audience: the answer');
  await page.keyboard.press('Escape');
  await aud.locator('.board').waitFor();
  await noCards(aud, 'audience: back on the board');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner clue play tests passed');
} catch (e) {
  await page.screenshot({ path: 'test-results/partner-play-failure.png' }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}

async function mainButtonState() {
  const b = page.locator('.panel [data-next]');
  return { disabled: await b.isDisabled(), label: await mainLabel(page) };
}
