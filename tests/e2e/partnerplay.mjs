// 🤝 Playing a partner clue (docs/PARTNER-CLUES-SPEC.md §6–§8): PARTNER UP! on stream, "Who picked it?", the partner
// wheel (the picker never on it, the log hiding the spin until it lands, its landing the partner), overruling it with
// 1–9, Show question ▶ with the parts badge and caption, a second Enter that doesn't start the clock, the 📤 list's
// chips (a change stays through ⇄ Swap, ↺ follows the parts again), 📋 Copy words, ⏱ Start the clock, a click on the
// stage that leaves the answer hidden until it's judged, Shift+Enter on ✔ Got it giving ✘ Missed, a blank question's
// own card, Esc before the question keeping the tile, U and the ? list. The 🤝 box holds each action once (🎡 Spin for a
// partner in front of the names, ↻ Spin again in its place after, ⏱ Start the clock at its foot, ringed while due); the
// blue button is the show's next step only (Show question ▶, Next ▶ with the wheel up, 👁 Reveal answer), asking first
// with something left (who picked it, the partner, the cards, the pair still playing); a click on a box's button leaves
// the keys where they were, and the rest of a double-click that redrew the box (who picked it, the question) is dropped:
// it never spins or judges. In one window the host page never
// holds a card's words or its picture's name; in two windows the audience window never does, and the host column lists
// the cards as text.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { anyway, boxHasAction, checkItem, flowIs, goOnCheck, mainButton, mainLabel, menuLines, notYet, openGameFile, openMenu, quick, stepButton } from './helpers.mjs';

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
  assert((await flowIs(page, 'Show question ▶')) && !(await mainButton(page).isDisabled()), 'the blue button is Show question ▶, never greyed');
  assert((await page.locator('.panel .status').innerText()).includes('Partner clue: who picked it? (1–4)'), 'the status row asks who picked it too (not to spin yet)');
  // N asks first: who picked it, a must (no "anyway"), the players by their number.
  await page.keyboard.press('n');
  await checkItem(page, 'picker').waitFor();
  assert(
    (await goOnCheck(page).getAttribute('data-goon')) === 'first' && (await anyway(page).count()) === 0 && (await quick(page, 'Ann').innerText()).includes('1'),
    'N with nobody marked asks “First:” who picked it, with no “anyway”, the players by their number',
  );
  assert((await stage('[data-slide="1"]').count()) === 0, 'and the question stays off stream');
  await notYet(page).click();
  await goOnCheck(page).waitFor({ state: 'detached' });
  // A double-click on a name: its first click says who picked it, and the rest of it, landing on the 🎡 Spin for a partner
  // that took the names' place, is dropped: nothing spins. (Its two clicks sent from the page.)
  await page.evaluate(async () => {
    const at = (sel) => document.querySelector(`.panel [data-partner-panel] ${sel}`);
    at('button[aria-label="Ann picked it"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    at('[data-partner-row] [data-step]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
  });
  await panel.getByText('Ann picked it.').waitFor();
  await page.waitForTimeout(300);
  assert((await stage('.wheel').count()) === 0 && (await stepButton(panel, '🎡 Spin for a partner').count()) === 1, 'a double-click on a name says who picked it and never spins the wheel');
  assert((await page.locator('.panel .status').innerText()).includes('Partner clue: spin for a partner'), 'Ann picked it: the status row says to spin for a partner');
  assert((await stage('[data-partner-up]').innerText()).includes('Ann') && (await stage('.pu-plate.waiting').count()) === 1, 'Ann picked it; the stage shows her plate and a pulsing “?”');
  assert((await page.locator('.panel [data-partner-tag]').innerText()).trim() === '🤝 Ann', 'the status row’s tag says whose partner clue it is');
  assert((await page.locator('.panel .players').count()) === 0, 'no award row before the question');
  await noCards(page, 'PARTNER UP!');

  // ---------- The partner wheel ----------
  assert(await flowIs(page, 'Show question ▶'), `the blue button stays Show question ▶ (${await mainLabel(page)})`);
  // (The friend's case: the wheel is in the 🤝 box, in front of the names it's an alternative to, and only there.)
  assert((await boxHasAction(panel, '🎡 Spin for a partner')) === '', `the 🤝 box has 🎡 Spin for a partner, once on the page and in sight (${await boxHasAction(panel, '🎡 Spin for a partner')})`);
  assert(await stepButton(panel, '🎡 Spin for a partner').evaluate((b) => b.classList.contains('ring')), 'ringed, as the step due now');
  const row = await panel.locator('[data-partner-row] button').evaluateAll((bs) => bs.map((b) => (b.matches('[data-step]') ? 'step' : b.getAttribute('aria-label'))));
  assert(row[0] === 'step' && row.slice(1).join() === 'Ann is the partner,Bob is the partner,Cat is the partner,Dan is the partner', `in front of the players to choose from by hand (${row.join(', ')})`);
  const spinAt = await stepButton(panel, '🎡 Spin for a partner').boundingBox();
  await stepButton(panel, '🎡 Spin for a partner').click();
  await stage('.wheel').waitFor();
  assert(await page.evaluate(() => !document.activeElement?.closest('[data-partner-panel]')), 'a click on it spins the wheel, and the keys aren’t left on it (Enter and W mean what they meant)');
  assert((await mainLabel(page)) === 'Next ▶' && (await mainButton(page).isDisabled()), 'the blue button is Next ▶ while the wheel is up, greyed while it turns');
  assert((await stepButton(panel, '🎡 Spin for a partner').isDisabled()) && (await stepButton(panel, '🎡 Spin for a partner').getAttribute('title')) === 'Still spinning', 'greyed while the wheel turns: “Still spinning”');
  const slices = await stage('.wheel text').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  assert(slices.length === 3 && !slices.includes('Ann') && slices.includes('Bob'), `the wheel is of the others: Ann isn’t on it (${slices.join(', ')})`);
  assert((await page.locator('.panel [data-tool-controls]').innerText()).includes('Partner for Ann'), 'its name says who it’s for');
  assert((await chip('Bob is the partner').isDisabled()) && !(await chip('Bob is the partner').getAttribute('aria-pressed')).includes('true'), 'the partner chips wait while it spins');
  await page.keyboard.press('l');
  await page.locator('aside .tab', { hasText: 'Rolls' }).click();
  assert((await page.locator('aside .roll').first().innerText()).includes('… spinning'), '📜 Log › Rolls doesn’t give the spin away while it spins');
  await page.keyboard.press('Escape');
  await panel.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 8000 });
  const landed = (await panel.locator('button.chip[aria-pressed="true"]').getAttribute('aria-label')).replace(' is the partner', '');
  assert(['Bob', 'Cat', 'Dan'].includes(landed), `its landing is the partner (${landed})`);
  // (The wheel's own bar is over the box now: the same place in the row, at the same left edge.)
  const againAt = await stepButton(panel, '↻ Spin again').boundingBox();
  const firstInRow = await panel.locator('[data-partner-row] button').first().evaluate((b) => b.matches('[data-step]') && b.textContent.includes('↻ Spin again'));
  assert(firstInRow && Math.abs(againAt.x - spinAt.x) < 1, 'landed: the same button in the same place reads ↻ Spin again');
  assert((await page.locator('.panel [data-partner-tag]').innerText()).includes(`Ann + ${landed}`), 'the tag says the pair');
  await page.keyboard.press('l');
  const shown = await page.waitForFunction((who) => document.querySelector('aside .roll')?.textContent.includes(who), landed, { timeout: 2000 }).then(() => true, () => false);
  assert(shown && !(await page.locator('aside .roll').first().innerText()).includes('spinning'), 'and the log shows the spin once it has landed');
  await page.keyboard.press('Escape');
  assert(await flowIs(page, 'Next ▶'), 'landed: the blue button is Next ▶, and the wheel’s box has no Close of its own');
  assert((await page.locator('.panel [data-tool-controls]').getByRole('button', { name: /Close/ }).count()) === 0, 'the wheel’s box has no Close (the blue button’s Next ▶, or Esc, puts it away)');
  await page.keyboard.press('Escape');
  await stage('.wheel').waitFor({ state: 'detached' });
  assert((await stage('[data-partner-up]').innerText()).includes(landed), 'Esc closes the wheel onto the pair');
  await page.keyboard.press('3');
  await page.keyboard.press('2');
  assert((await chip('Bob is the partner').getAttribute('aria-pressed')) === 'true', '1–9 overrule the wheel (2: Bob)');
  assert((await stepButton(panel, '↻ Spin again').count()) === 1, 'and ↻ Spin again stays in its place');
  await page.keyboard.press('1');
  assert(await toast('Ann picked it: tick'), 'Ann’s own number says how to make it Solo');
  // PARTNER UP!'s cards fold into one quiet line (copied by hand: no phone buzzers here); a click on it, or Enter with
  // the keys on it, opens it (and shows no question).
  const fold = panel.locator('[data-partner-cards-fold]');
  const foldSays = (await fold.locator('summary').innerText()).trim();
  assert(foldSays === '🤫 2 cards · 📋 you’ll copy them' && !(await fold.evaluate((d) => d.open)), `PARTNER UP!'s cards fold into one line (${foldSays})`);
  await fold.locator('summary').focus();
  await page.keyboard.press('Enter');
  await panel.locator('[data-partner-readiness]').waitFor();
  assert((await stage('[data-partner-up]').count()) === 1, 'Enter on its line opens it, and the question stays put');
  // (The keys off it again, onto the panel: Enter is the main button's.)
  await page.locator('.panel .status').click();
  const panelText = await panel.innerText();
  assert(panelText.includes('🗣 Bob describes · 🎯 Ann guesses') && panelText.includes('Card 1 → Bob (describer) · Card 2 → nobody yet'), `the panel says who plays which part and where the cards go (${panelText.replace(/\n/g, ' | ')})`);
  const viewers = page.locator('.panel .status [data-viewers]');
  assert(
    (await viewers.innerText()).startsWith('⚠ Viewers see this') && (await viewers.textContent()).includes('⚠ Viewers can see this window: they can read a card’s name here') && !panelText.includes('Viewers can see'),
    'and the status line’s ⚠ Viewers see this chip says viewers can see it (its sentence for screen readers), not a line in the box',
  );
  await noCards(page, 'paired');
  await page.screenshot({ path: 'test-results/partner-play-paired.png' });
  // A right-click on the stage: the moment's menu, the blue button's Show question ▶ first (N, once only), then the 🤝
  // box's actions, each with its key (the partner there greyed, not left out), then the box's own, the way out, ↶ Undo
  // and ⏸ Cover. Names only: no card's words.
  await stage('[data-partner-up]').click({ button: 'right' });
  const pairedMenu = await menuLines(page);
  assert(
    JSON.stringify(pairedMenu.slice(0, 7)) ===
      JSON.stringify(['# 🤝 Partner clue · Movies $400', 'Show question ▶ · N', '—', '↻ Spin again · W', 'Make Bob the partner · 2 (off)', 'Make Cat the partner · 3', 'Make Dan the partner · 4']) &&
      pairedMenu.filter((l) => l.startsWith('Show question ▶')).length === 1 && pairedMenu.includes('⇄ Swap') && pairedMenu.includes('↩ Put back (keep tile) · Esc') && pairedMenu.at(-1) === '⏸ Cover the screen · K',
    `a right-click on PARTNER UP! gives the moment’s menu, the blue button’s step first (${pairedMenu.join(' | ')})`,
  );
  await noCards(page, 'the stage’s menu on PARTNER UP!');
  await page.keyboard.press('Escape');
  await openMenu(page).waitFor({ state: 'detached' });

  // ---------- Show question ▶, and a second Enter ----------
  assert(await flowIs(page, 'Show question ▶'), 'paired: Show question ▶ is the blue button');
  assert(
    (await panel.getByRole('button', { name: /Show question/ }).count()) === 0 && (await panel.locator('[data-partner-foot]').count()) === 0 &&
      (await panel.locator('[data-partner-next]').innerText()) === 'Pair set: Show question ▶ (the blue button, or N) puts the question up',
    'and only there: the box has no copy at its foot, its first line names the blue button',
  );
  assert((await page.locator('.panel [data-flow="putback"] kbd').innerText()) === '⇧Esc', 'PARTNER UP!’s ↩ Put back (keep tile) shows its key, ⇧Esc');
  await page.keyboard.press('Enter');
  await stage('[data-partner-badge]').waitFor();
  await page.keyboard.press('Enter');
  assert(await toast('The question just went up'), 'a second Enter at once doesn’t start the clock');
  assert((await flowIs(page, '👁 Reveal answer')) && (await stage('.timer').count()) === 0, 'the blue button is 👁 Reveal answer, and no countdown runs');
  assert((await boxHasAction(panel, '⏱ Start the clock (45 s)')) === '', 'the box has ⏱ Start the clock at its foot, once on the page, in sight');
  assert(await stepButton(panel, '⏱ Start the clock (45 s)').evaluate((b) => b.classList.contains('ring')), 'ringed, as the step due now');
  assert(
    (await panel.locator('[data-partner-next]').innerText()) === 'Next: 📋 copy each card to its player, then ⏱ Start the clock',
    'its first line says to copy the cards first (no phones here), then start the clock',
  );
  const foot = panel.locator('[data-partner-foot]');
  assert(
    JSON.stringify(await foot.getByRole('button').evaluateAll((bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()))) === JSON.stringify(['✔ Got it', '✘ Missed', '📋 Copy words', '⏱ Start the clock (45 s)⏎']),
    `the foot: ✔ Got it and ✘ Missed, then at its right end Card 1’s 📋 Copy words (the card to copy, in view) and ⏱ Start the clock (${await foot.getByRole('button').evaluateAll((bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()).join(' | '))})`,
  );
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
  await stage('[data-slide="1"]').click({ button: 'right' });
  const handMenu = await menuLines(page);
  assert(
    JSON.stringify(handMenu.slice(0, 7)) ===
      JSON.stringify(['# 🤝 Partner clue · Movies $400', '👁 Reveal answer · N', '—', '⏱ Start the clock (45 s) · Enter', '✔ Got it', '✘ Missed', '⏱ Start the countdown · T']) &&
      handMenu.filter((l) => l.startsWith('👁 Reveal answer')).length === 1,
    `handing out the cards, its menu has the blue button’s 👁 Reveal answer first (it asks first), then the box's clock, then ✔ / ✘ (their keys wait for the clock) (${handMenu.join(' | ')})`,
  );
  await noCards(page, 'the stage’s menu handing out the cards');
  await page.keyboard.press('Escape');
  await openMenu(page).waitFor({ state: 'detached' });
  // A click on the question while the cards are handed out never puts the answer on stream: it asks first, as the blue
  // button does (copied by hand here: ⏱ Start the clock first, and 📋 for each card). Card names only.
  await stage('[data-slide="1"]').click();
  await checkItem(page, 'handout').waitFor();
  assert(
    (await checkItem(page, 'handout').innerText()).includes('copy each to its player, then start the clock') && (await quick(page, '⏱ Start the clock (45 s)').count()) === 1 && (await quick(page, '📋 Copy Card 1’s words').count()) === 1,
    `a click on the stage while handing out the cards asks first: copy them, then ⏱ Start the clock (${(await checkItem(page, 'handout').innerText()).replace(/\s+/g, ' ')})`,
  );
  await noCards(page, 'the check while handing out the cards');
  assert((await stage('[data-slide="answer"]').count()) === 0 && (await flowIs(page, '👁 Reveal answer')), 'and the question stays up');
  await page.keyboard.press('Escape');
  await goOnCheck(page).waitFor({ state: 'detached' });

  // ---------- ⏱ Start the clock ----------
  await page.keyboard.press('u');
  assert(await toast('Nobody buzzes on a partner clue'), 'U: nobody buzzes on a partner clue');
  await page.waitForTimeout(1100);
  const startAt = await stepButton(panel, '⏱ Start the clock (45 s)').boundingBox();
  const gotIt = panel.locator('[data-partner-judge]').getByRole('button', { name: /✔ Got it/ });
  const gotAt = (await gotIt.boundingBox()).x;
  await page.mouse.click(startAt.x + startAt.width / 2, startAt.y + startAt.height / 2);
  await stage('.timer').waitFor();
  assert(await flowIs(page, '👁 Reveal answer'), 'the box’s ⏱ Start the clock, a moment later, starts the clock; the blue button is still 👁 Reveal answer');
  assert(await mainButton(page).evaluate((b) => b === document.activeElement), 'and the keys are the main button’s again');
  // The same spot clicked again a moment later (a fresh click, not a double-click's): nothing took its place, so it
  // judges nothing, and ✔ Got it is where it was.
  await page.waitForTimeout(700);
  await page.mouse.click(startAt.x + startAt.width / 2, startAt.y + startAt.height / 2);
  await page.waitForTimeout(300);
  assert((await panel.locator('[data-judged]').count()) === 0 && (await gotIt.boundingBox()).x === gotAt, 'a second click where ⏱ Start the clock was judges nothing: ✔ Got it kept its place');
  assert((await panel.locator('[data-partner-next]').innerText()) === 'Did they get it? ✔ Got it (Enter) or ✘ Missed (Shift+Enter)', 'the box’s first line asks if they got it, and how');
  // The verdict due: ✔ Got it and ✘ Missed an equal pair in the box, neither blue; the blue button stays 👁 Reveal answer,
  // and pressing it while they play asks first, so clicking it over and over never shows the answer mid-turn.
  const verdicts = await panel.locator('[data-partner-judge] button').evaluateAll((bs) => bs.slice(0, 2).map((b) => (b.classList.contains('good') ? 'good' : b.classList.contains('bad') ? 'bad' : b.className)));
  assert(
    verdicts.join() === 'good,bad' && (await page.locator('.panel button.primary:visible').count()) === 1 && (await flowIs(page, '👁 Reveal answer')),
    `the clock running: ✔ Got it and ✘ Missed an equal pair, the one blue button 👁 Reveal answer (${verdicts.join(', ')})`,
  );
  await mainButton(page).click();
  await checkItem(page, 'playing').waitFor();
  assert(
    (await checkItem(page, 'playing').innerText()).includes('still playing') && (await quick(page, '✔ Got it').count()) === 1 && (await stage('[data-slide="answer"]').count()) === 0,
    'pressing it while they play asks first (✔ Got it ▶ reveal, ✘ Missed), the answer still hidden',
  );
  await notYet(page).click();
  await goOnCheck(page).waitFor({ state: 'detached' });
  assert((await page.locator('.panel .players').count()) === 1, 'the players’ chips are there, as on any clue');
  assert(
    (await page.locator('.panel .award').count()) === 0 && (await page.getByRole('button', { name: '± Other points…' }).isVisible()),
    'the Amount row folds behind ± Other points… (✔ Got it / ✘ Missed give the points)',
  );
  // With the clock running they're still describing: a click on the stage asks the same, never the answer.
  await stage('[data-slide="1"]').click();
  await checkItem(page, 'playing').waitFor();
  assert((await stage('[data-slide="answer"]').count()) === 0, 'a click on the stage with the clock running asks the same, and leaves the answer hidden');
  await notYet(page).click();
  await goOnCheck(page).waitFor({ state: 'detached' });
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
  // A double-click on the blue Show question ▶: the question goes up (no cards: straight to the judging), and the rest
  // of the double-click, landing on the box's ✔ Got it, is dropped. (Its two clicks sent from the page.)
  await page.evaluate(async () => {
    document.querySelector('.panel [data-next]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    document.querySelector('.panel [data-partner-panel] [data-partner-judge] button:not([data-step])').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
  });
  await stage('[data-partner-card]').waitFor();
  assert((await panel.locator('[data-judged]').count()) === 0, 'a double-click on Show question ▶ puts the question up and judges nothing');
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
  // With the controls hidden, the stage's menu still has the blue button's step first, then the box's: 🎡 Spin for a
  // partner spins the wheel.
  await page.keyboard.press('h');
  await page.locator('.panel').waitFor({ state: 'detached' });
  await stage('[data-partner-up]').click({ button: 'right' });
  const hiddenMenu = await menuLines(page);
  assert(
    hiddenMenu[0] === '# 🤝 Partner clue · Movies $800' && hiddenMenu[1] === 'Show question ▶ · N' && hiddenMenu[3] === '🎡 Spin for a partner · W',
    `with the controls hidden, a right-click on the stage offers Show question ▶, then 🎡 Spin for a partner (${hiddenMenu.join(' | ')})`,
  );
  await noCards(page, 'the stage’s menu with the controls hidden');
  await openMenu(page).getByRole('menuitem', { name: '🎡 Spin for a partner' }).click();
  await stage('.wheel').waitFor();
  assert((await page.locator('.panel').count()) === 0, 'and spins the wheel from there, the controls still hidden');
  await page.keyboard.press('h');
  await page.keyboard.press('Escape');
  await stage('.wheel').waitFor({ state: 'detached' });
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
  // N with no partner yet asks first: a must (no "anyway"), and W in it spins the wheel.
  await page.keyboard.press('n');
  await checkItem(page, 'partner').waitFor();
  assert((await goOnCheck(page).getAttribute('data-goon')) === 'first' && (await anyway(page).count()) === 0, 'N with no partner yet asks first (“First:” Ann needs a partner), with no “anyway”');
  await goOnCheck(page, { ready: true }).waitFor();
  await page.keyboard.press('w');
  await aud.locator('.wheel').waitFor();
  await goOnCheck(page).waitFor({ state: 'detached' });
  assert(true, 'W in it spins the wheel, and it closes');
  await panel.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 8000 });
  assert(await flowIs(page, 'Next ▶'), 'landed: the blue button is Next ▶');
  await page.keyboard.press('3');
  // (Enter is Next on PARTNER UP!: the wheel goes, then the question.)
  await page.keyboard.press('Enter');
  await aud.locator('.wheel').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent.includes('Show question ▶'));
  await page.keyboard.press('Enter');
  await aud.locator('[data-partner-badge]').waitFor();
  assert((await info.innerText()).includes('Card 1 → Cat (describer)'), 'the host column says who gets each card');
  await noCards(aud, 'audience: the question');
  await page.waitForTimeout(1100);
  // T, with no card waiting for a phone (they're copied by hand), makes it live as ⏱ Start the clock does, and the first
  // Enter after it only says so: "T, then Enter" never judges by habit.
  await page.keyboard.press('t');
  await aud.locator('.timer').waitFor();
  await panel.locator('[data-partner-next]', { hasText: 'Did they get it?' }).waitFor();
  await page.keyboard.press('Enter');
  assert(
    (await toast('Clock is running: Enter again for ✔ Got it')) && (await panel.locator('[data-judged]').count()) === 0,
    'T makes it live (no card waits for a phone), and the first Enter after it judges nothing, saying so',
  );
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
