// The blue button and the check before going on (src/play/host/goon.ts, docs/SPEC.md §6.6), in the built app:
// 1. a clue at ▦ Done ▶ board with points not given, one window at 1280×720: the check opens by N, by a click on the
//    blue button and by a click on the stage; N, N at once does nothing, a slow N goes on anyway; the keys go back to
//    what opened it; ＋ Award … ▶ board then Ctrl+Z takes the points back and the board stays; Not yet then a quick Esc
//    keeps the clue; Shift+click goes on at once;
// 2. a 🤝 partner clue's hand-out, one window, with phone buzzers and Bob's phone: N opens “First:” (the card not sent,
//    the clock not started), N, N, N there never shows the answer, a click on the stage with the card waiting opens it
//    too, Enter in it sends the card and starts the clock, then R in it reveals anyway; the page never holds the
//    card's words while it's open;
// 3. the Final's reveals, one window: N with the spotlit player not judged yet opens the check (a must: no “anyway”), C
//    in it judges them and closes it, the spotlight staying on them with their verdict on stage, then N goes on;
// 4. with the controls hidden: in one window N with something left changes nothing on stream (the stage its size, the
//    pill pulses) and H shows the panel with the check open; in two windows the controls come back while it's open and
//    hide again after;
// 5. the check's place at 1280×720 in one window: inside the panel, off the stage and the fixed bar, none of its buttons
//    where the blue button is, the stage its size.
// Each step waits for what it should do, never a timer. Needs `npm ci` in buzzer/ (the buzzers never opened, flow 4).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { anyway, checkItem, editorReady, flowIs, goOnCheck, mainButton, notYet, openBuzzerOptions, openGameFile, quick, startBuzzer, startRoomOn, stepButton } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// Ann and Bob on $0, a board of four categories (each flow plays its own column's first tile, $200), no Daily Doubles;
// Lore's first tile is a 🤝 partner clue with a card for its describer.
const text = (id, t) => ({ id, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 72, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
const cats = ['Memes', 'Rizz', 'Ohio', 'Lore'];
/** Only on the partner clue's card: never on the host page in one window. */
const CARD_WORDS = 'Kelp-goon-zq';
const partnerClue = {
  type: 'partner',
  partner: { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' },
  timerSeconds: 30,
  cards: [{ id: 'k1', to: 'giver', ...slide('k1t', CARD_WORDS) }],
};
const game = {
  id: 'g_goon', version: 2, title: 'Go On Night',
  settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 15, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8, stream: { clueCaption: true } },
  players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i], startScore: 0 })),
  rounds: [
    {
      id: 'r_board', name: 'Jeopardy!', mode: 'board', values: [200, 400], dailyDoubleCount: 0,
      categories: cats.map((c, ci) => ({
        id: `cat${ci}`,
        title: c,
        clues: [0, 1].map((ri) => ({ id: `c${ci}_${ri}`, value: null, type: 'standard', questionSlide: slide(`q${ci}_${ri}`, `${c} ${ri}`), answerSlide: slide(`a${ci}_${ri}`, `Answer ${ci}.${ri}`), ...(ci === 3 && !ri ? partnerClue : {}) })),
      })),
    },
  ],
  media: [], audio: {}, theme: {}, wheels: [], dice: [], statFields: [], items: [],
};
/** The same players, a Final only (both on $0 play it, their $0 wagers filled in): flow 3. */
const finalGame = {
  ...game,
  id: 'g_goon_final',
  title: 'Go On Final',
  rounds: [{ id: 'r_final', name: 'Final Jeopardy!', mode: 'final', category: 'Lore', questionSlide: slide('fq', 'The final question'), answerSlide: slide('fa', 'The final answer'), timerSeconds: 30, allowNonPositive: true }],
};
mkdirSync(resolve('test-results'), { recursive: true });
const gameFile = resolve('test-results/goon.json');
writeFileSync(gameFile, JSON.stringify(game));
const finalFile = resolve('test-results/goon-final.json');
writeFileSync(finalFile, JSON.stringify(finalGame));

const buzzer = await startBuzzer('buzzer-goon-');
const browser = await chromium.launch({ executablePath });
const errors = [];

/** A window at 1280×720 on the game's pre-game screen (`server`: the buzzer server in its settings; `from`: its file). */
async function host(name, server, from = gameFile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (server)
    await ctx.addInitScript((s) => {
      try {
        const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
        if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: s }));
      } catch {}
    }, server);
  // (Whether the check was ever on the page, for a press that should go on without it.)
  await ctx.addInitScript(() => {
    window.__goonSeen = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-goon]')) window.__goonSeen++;
    }).observe(document, { subtree: true, childList: true });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, from);
  await page.getByText(/^Opened “/).waitFor();
  await editorReady(page);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  return { ctx, page };
}

/** Start game ▶, the categories' reveal skipped: the board. */
async function start(page) {
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.stage-box .board').waitFor();
}

/** Category `cat`'s first tile open, its question up. */
async function openTile(page, cat) {
  await page.locator(`.stage-box .board .tile[data-cat="${cat}"]:not([disabled])`).first().click();
  await page.locator('.panel .status', { hasText: 'Answer hidden' }).waitFor();
}

/** Category `cat`'s tile open, Ann picked (1) and the answer shown (R): ▦ Done ▶ board, with Ann's points not given. */
async function atDone(page, cat) {
  await openTile(page, cat);
  await page.keyboard.press('1');
  await page.keyboard.press('r');
  await page.locator('.stage-box [data-slide="answer"]').waitFor();
}

const stageSize = (page) =>
  page.locator('.stage-box .stage').evaluate((s) => {
    const r = s.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  });
const rectOf = (loc) => loc.evaluate((b) => (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(b.getBoundingClientRect()));
const boardUp = async (page) => (await page.locator('.stage-box .board').count()) === 1 && (await page.locator('.stage-box [data-slide]').count()) === 0;

try {
  // ---------- 1 and 5: a clue at ▦ Done with points not given, one window ----------
  console.log('A clue at ▦ Done ▶ board with points not given, one window at 1280×720:');
  {
    const { ctx, page } = await host('one window');
    await start(page);
    const annScore = () => page.locator('.panel .p').nth(0).locator('.score').innerText();

    // By N, and its place (5).
    await atDone(page, 0);
    assert(await flowIs(page, '▦ Done ▶ board'), 'with the answer showing, the blue button is ▦ Done ▶ board');
    const stageWas = await stageSize(page);
    const mainWas = await rectOf(mainButton(page));
    // (N, N at once: the second is inside the check's first 600 ms, so it presses nothing; what it would press lights up.)
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await checkItem(page, 'picked').waitFor();
    await page.locator('.panel [data-goon] [data-anyway].lit').waitFor();
    assert(
      (await goOnCheck(page).getAttribute('data-goon')) === 'loss' && (await page.locator('.stage-box [data-slide="answer"]').count()) === 1,
      'N opens the check (“Before you go on”: Ann has no points), and an N right after it presses nothing: its ▦ Done anyway lights up, the clue stays open',
    );
    const c = await page.evaluate((m) => {
      const rect = (el) => el.getBoundingClientRect();
      const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const card = rect(document.querySelector('.panel [data-goon]'));
      const panel = rect(document.querySelector('.play > .panel'));
      return {
        inside: card.left >= panel.left - 1 && card.right <= panel.right + 1 && card.top >= panel.top - 1 && card.bottom <= panel.bottom + 1,
        offStage: !meets(card, rect(document.querySelector('.stage-box'))),
        offBar: !meets(card, rect(document.querySelector('.panel .fixed'))),
        onMain: [...document.querySelectorAll('.panel [data-goon] :is(button, input, label)')].filter((b) => meets(rect(b), m)).map((b) => b.textContent.trim()),
      };
    }, mainWas);
    assert(
      c.inside && c.offStage && c.offBar && !c.onMain.length && (await stageSize(page)) === stageWas,
      `its place: inside the panel, off the stage and the fixed bar, none of its buttons on the blue button's spot, the stage its size (${JSON.stringify({ ...c, stageWas, stage: await stageSize(page) })})`,
    );
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('n');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.locator('.stage-box .board').waitFor();
    assert((await boardUp(page)) && (await annScore()) === '$0', 'a slow N goes on anyway (▦ Done anyway: no points): the board, Ann still on $0');

    // By a click on the blue button: the keys come back to it; Not yet then a quick Esc keeps the clue.
    await atDone(page, 1);
    await mainButton(page).click();
    await checkItem(page, 'picked').waitFor();
    assert(await page.evaluate(() => !!document.activeElement?.closest('[data-goon]')), 'a click on the blue button opens the check, the keys in it');
    await goOnCheck(page, { ready: true }).waitFor();
    await notYet(page).click();
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.matches('.panel [data-next]'));
    assert((await page.locator('.stage-box [data-slide="answer"]').count()) === 1, 'Not yet closes it, the keys back on the blue button, and an Esc right after it does nothing: the clue stays open');

    // By a click on the stage.
    await page.locator('.stage-box .stage').click();
    await checkItem(page, 'picked').waitFor();
    assert((await page.locator('.stage-box [data-slide="answer"]').count()) === 1, 'a click on the stage at ▦ Done opens the check too (the clue stays open)');
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });

    // Shift+click: on at once, asking nothing.
    const seen = await page.evaluate(() => window.__goonSeen);
    await mainButton(page).click({ modifiers: ['Shift'] });
    await page.locator('.stage-box .board').waitFor();
    assert((await boardUp(page)) && (await page.evaluate(() => window.__goonSeen)) === seen && (await annScore()) === '$0', 'Shift+click on the blue button goes on at once, the check never opening');

    // ＋ Award Ann $200 ▶ board, then Ctrl+Z: the points go, the board stays.
    await atDone(page, 2);
    await page.keyboard.press('n');
    await goOnCheck(page, { ready: true }).waitFor();
    await quick(page, '＋ Award Ann $200 ▶ board').click();
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.locator('.stage-box .board').waitFor();
    assert((await boardUp(page)) && (await annScore()) === '$200', 'the check’s ＋ Award Ann $200 ▶ board gives the points and goes back to the board');
    await page.keyboard.press('Control+z');
    await page.locator('.toast', { hasText: 'Undid' }).waitFor();
    assert((await annScore()) === '$0' && (await boardUp(page)), 'Ctrl+Z takes the award back, and the board stays');
    await ctx.close();
  }

  // ---------- 2: a partner clue's hand-out, one window, with phones ----------
  console.log('A partner clue’s hand-out, one window, with phones:');
  {
    const { ctx, page } = await host('partner, one window', buzzer.base);
    const card = page.getByRole('region', { name: 'Phone buzzers' });
    await card.getByLabel(/Buzzer mode/).check();
    const code = await startRoomOn(card);
    const bob = await ctx.newPage();
    bob.on('pageerror', (e) => errors.push(`[bob] ${e.message}`));
    await bob.goto(`${buzzer.base}/${code}`);
    await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await bob.getByRole('button', { name: 'Bob', exact: true }).click();
    await bob.locator('#me').getByText('Bob').waitFor();
    await card.getByText('1 of 2 players joined').waitFor();
    await start(page);
    /** The host page holds no word of the card: its text, its labels and its tooltips. */
    const noCard = async () =>
      !(await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('[aria-label], [title]')].flatMap((e) => [e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? ''])].join('\n'))).includes(CARD_WORDS);
    const answer = () => page.locator('.stage-box [data-slide="answer"]').count();
    // Ann picks it; Bob, the only other player, is her partner at once. Enter on PARTNER UP! is Show question ▶.
    await page.keyboard.press('p');
    await page.keyboard.press('1');
    await page.locator('.stage-box .tile[data-clue="c3_0"]').click();
    await page.locator('.stage-box [data-partner-up]').waitFor();
    await page.locator('.panel [data-partner-next]', { hasText: 'Pair set' }).waitFor();
    assert(await flowIs(page, 'Show question ▶'), 'PARTNER UP!, the pair set: the blue button is Show question ▶');
    await page.keyboard.press('Enter');
    await page.locator('.stage-box [data-partner-badge]').waitFor();
    const box = page.locator('.panel [data-partner-panel]');
    await stepButton(box, '📤 Send and start').waitFor();
    assert(await flowIs(page, '👁 Reveal answer'), 'the question up, the card to hand out: the blue button is 👁 Reveal answer, 📤 Send and start the 🤝 box’s');

    // N: “First:”, the card not sent and the clock not started. N, N, N in it never shows the answer (R would).
    await page.keyboard.press('n');
    await checkItem(page, 'handout').waitFor();
    assert(
      (await goOnCheck(page).getAttribute('data-goon')) === 'first' && (await quick(page, '📤 Send and start').count()) === 1 && (await anyway(page).innerText()).includes('👁 Reveal anyway: they haven’t played'),
      'N opens “First:” Card 1 hasn’t gone to Bob’s phone, with 📤 Send and start and a quiet 👁 Reveal anyway',
    );
    assert(await noCard(), 'the page holds no word of the card with the check open (its name and who it’s for only)');
    await goOnCheck(page, { ready: true }).waitFor();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('n');
      await page.locator('.toast', { hasText: 'R: 👁 Reveal anyway' }).waitFor();
    }
    assert((await answer()) === 0 && (await goOnCheck(page).count()) === 1, 'N, N, N in it never shows the answer: each says Enter sends, R reveals anyway');
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });

    // A click on the stage with the card waiting opens it too; Enter in it sends the card and starts the clock.
    await page.locator('.stage-box .stage').click();
    await checkItem(page, 'handout').waitFor();
    assert((await answer()) === 0, 'a click on the stage with the card waiting opens the check, never the answer');
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('Enter');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.locator('.stage-box .timer').waitFor();
    await bob.getByRole('button', { name: 'Tap to see' }).waitFor();
    assert((await answer()) === 0 && (await noCard()), 'Enter in it sends the card to Bob’s phone and starts the clock, the answer still hidden');

    // They're playing: N asks again (✔ Got it ▶ reveal…); R in it reveals anyway.
    await page.keyboard.press('n');
    await checkItem(page, 'playing').waitFor();
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('r');
    await page.locator('.stage-box [data-slide="answer"]').waitFor();
    assert((await goOnCheck(page).count()) === 0 && (await noCard()), 'with the pair playing N asks again, and R in it reveals anyway');
    await ctx.close();
  }

  // ---------- 3: the Final's spotlit player's verdict, a must ----------
  console.log('The Final’s reveals, one window:');
  {
    const { ctx, page } = await host('final', undefined, finalFile);
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    // (Its title card, if it has one: N starts the round.)
    await page.locator('.fj .wagers, .stage-box .title-card').first().waitFor();
    if (await page.locator('.stage-box .title-card').count()) await page.keyboard.press('n');
    await page.locator('.fj .wagers').waitFor();
    const status = (t) => page.locator('.panel .status', { hasText: t }).waitFor();
    // (Their $0 wagers are in: N shows the question, the answer, the reveals, then the first one's wager.)
    await page.keyboard.press('n');
    await status('Question on screen');
    await page.keyboard.press('n');
    await status('Answer on screen');
    await page.keyboard.press('n');
    await status('Player reveals');
    const spot = () => page.locator('.fj .pl.cur .name').innerText();
    const who = await spot();
    await page.keyboard.press('n');
    await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Next player ▶'));
    assert((await page.locator('.stage-box .spot-wager').innerText()).includes('$0'), `N shows ${who}’s wager; the blue button is Next player ▶ (their verdict due, in their row)`);
    // N with them not judged yet: the check (“First:”, a must: no anyway), the spotlight staying on them.
    await page.keyboard.press('n');
    await checkItem(page, 'verdict').waitFor();
    assert(
      (await goOnCheck(page).getAttribute('data-goon')) === 'first' && (await anyway(page).count()) === 0 && (await quick(page, '✔ Right').count()) === 1 && (await quick(page, '✘ Wrong').count()) === 1 && (await spot()) === who,
      `N with ${who} not judged yet opens the check: ✔ Right / ✘ Wrong, no “anyway”, the spotlight still on them`,
    );
    // C in it: judged, the check closed, the spotlight still on them with their verdict on stage.
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('c');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.locator('.stage-box .spot-result', { hasText: 'CORRECT' }).waitFor();
    assert((await spot()) === who && (await page.locator('.stage-box .spot-name').textContent()) === who, `C judges ${who} and closes it: their verdict on stage, the spotlight still on them`);
    // N then goes on, to the next player.
    await page.keyboard.press('n');
    await page.waitForFunction((w) => document.querySelector('.fj .pl.cur .name')?.textContent !== w, who);
    assert((await goOnCheck(page).count()) === 0, 'then N goes on to the next player (N, C, N)');
    await ctx.close();
  }

  // ---------- 4: with the controls hidden ----------
  console.log('With the controls hidden:');
  {
    // One window, phone buzzers the host opens, never opened on this clue: 👁 Reveal answer would show it with nobody
    // having had a chance to buzz.
    const { ctx, page } = await host('hidden, one window', buzzer.base);
    const card = page.getByRole('region', { name: 'Phone buzzers' });
    await card.getByLabel(/Buzzer mode/).check();
    // (The options are folded under ▸ Buzzer options.)
    await openBuzzerOptions(card);
    await card.getByLabel('Open the buzzers').selectOption('host');
    await startRoomOn(card);
    await start(page);
    await openTile(page, 0);
    await page.locator('.panel button[data-box="buzzers"].ring').waitFor();
    assert(await flowIs(page, '👁 Reveal answer'), 'the buzzers never opened: the blue button is still 👁 Reveal answer, 🔔 Open the buzzers in the buzzers’ row has the ring');
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    const hiddenSize = await stageSize(page);
    await page.keyboard.press('n');
    await page.locator('.show-controls.pulse').waitFor();
    await page.locator('[data-goon-held]').waitFor();
    assert(
      (await page.locator('.play > .panel').count()) === 0 && (await page.locator('.stage-box [data-slide="answer"]').count()) === 0 && (await stageSize(page)) === hiddenSize,
      'one window, the controls hidden: N with something left shows nothing new on stream (no answer, no panel, the stage its size) and the pill pulses',
    );
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor();
    await checkItem(page, 'buzzers').waitFor();
    assert((await goOnCheck(page).getAttribute('data-goon')) === 'first', 'H shows the panel with the check open in it (“First:” 🔔 Open the buzzers)');
    await goOnCheck(page, { ready: true }).waitFor();
    await quick(page, '🔔 Open the buzzers').click();
    await goOnCheck(page).waitFor({ state: 'detached' });
    assert((await page.locator('.stage-box [data-slide="answer"]').count()) === 0, 'its 🔔 Open the buzzers opens them and closes it, the answer still hidden');
    await ctx.close();
  }
  {
    // Two windows: the host's window isn't on stream, so the controls come back while the check is open.
    const { ctx, page } = await host('hidden, two windows');
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
    aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
    await aud.waitForLoadState();
    await start(page);
    await aud.locator('.board').waitFor();
    await atDone(page, 0);
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    await page.keyboard.press('n');
    await page.locator('.play > .panel').waitFor();
    await checkItem(page, 'picked').waitFor();
    assert((await page.locator('.stage-box [data-slide="answer"]').count()) === 1, 'two windows, the controls hidden: N with Ann’s points not given brings the controls back with the check open');
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    assert((await page.locator('.stage-box [data-slide="answer"]').count()) === 1, 'Not yet (Esc) closes it, and the controls hide again, the clue still open');
    await ctx.close();
  }

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('goon: all passed');
} finally {
  await browser.close();
  buzzer.stop();
}
