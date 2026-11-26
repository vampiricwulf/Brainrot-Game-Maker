// The blue button and the check before going on (src/play/host/goon.ts, docs/SPEC.md §6.2), in the built app:
// 1. a clue at ▦ Done ▶ board with points not given, one window at 1280×720: the check opens by N, by a click on the
//    blue button and by a click on the stage; N, N at once does nothing, a slow N goes on anyway; the keys go back to
//    what opened it; ＋ Award … ▶ board then Ctrl+Z takes the points back and the board stays; Not yet then a quick Esc
//    keeps the clue; Shift+click goes on at once;
// 2. a 🤝 partner clue's hand-out, one window, with phone buzzers and Bob's phone: N opens “First:” (the card not sent,
//    the clock not started), N, N, N there never shows the answer, a click on the stage with the card waiting opens it
//    too, Enter in it sends the card and starts the clock, then R in it reveals anyway; the page never holds the
//    card's words while it's open;
// 3. the Final, one window: with its think clock running, 👁 Reveal answer by N, a stage click, the stage's menu or the
//    blue button asks first (⏱️ Let it run, the ⏎ one, keeps the clock going; ⏸ Pause the clock, T, pauses it;
//    👁 Reveal anyway shows the answer); with the clock paused or run out it goes on at once (3b). In its reveals, N with
//    the spotlit player not judged yet opens the check (a must: no “anyway”), C in it judges them and closes it, the
//    spotlight staying on them with their verdict on stage, then N goes on. On a touch tablet (3c) the check and the
//    reveals' how-to teach no keys, and every reveal row has its ✔ Right / ✘ Wrong at one place; on a phone the check's
//    lines and the reveal rows (½ Halve, 0 Nullify) get the panel's whole width;
// 4. with the controls hidden: in one window N with something left changes nothing on stream (the stage its size, the
//    pill pulses) and H shows the panel with the check open; in two windows the controls come back while it's open and
//    hide again after;
// 5. the check's place at 1280×720 in one window: inside the panel, off the stage and the fixed bar, none of its buttons
//    where the blue button is, the tools row covered whole (no tool cut off beside it), the stage its size.
// Each step waits for what it should do, never a timer. Needs `npm ci` in buzzer/ (the buzzers never opened, flow 4).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  appFile,
  anyway,
  checkItem,
  editorReady,
  flowIs,
  goOnCheck,
  mainButton,
  notYet,
  openBuzzerOptions,
  openGameFile,
  quick,
  quickInSight,
  startBuzzer,
  startRoomOn,
  stepButton,
  failureShots,
  assert,
  launchChromium,
  section,
  boardIn,
  finalControlsIn,
  hostPanelIn,
  playerRowsIn,
  stageBoxIn,
  statusLineIn,
  toastsIn,
  resultsPath,
} from './helpers.mjs';

const file = appFile();

// Ann and Bob on $0, a board of four categories (each flow plays its own column's first tile, $200), no Daily Doubles;
// Lore's first tile is a 🤝 partner clue with a card for its describer.
const text = (id, t) => ({
  id,
  kind: 'text',
  text: t,
  x: 160,
  y: 340,
  w: 1600,
  h: 400,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  font: 'Arial',
  size: 72,
  weight: 700,
  italic: false,
  underline: false,
  uppercase: false,
  color: '#fff',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.2,
  letterSpacing: 0,
  autoFit: true,
});
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
  id: 'g_goon',
  version: 2,
  title: 'Go On Night',
  settings: {
    allowNegativeScores: true,
    deductOnWrong: true,
    defaultTimerSeconds: 15,
    finalTimerSeconds: 30,
    currencySymbol: '$',
    rollOffDie: 20,
    pickerFollowsAward: true,
    timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' },
    maxPlayers: 8,
    stream: { clueCaption: true },
  },
  players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i], startScore: 0 })),
  rounds: [
    {
      id: 'r_board',
      name: 'Jeopardy!',
      mode: 'board',
      values: [200, 400],
      dailyDoubleCount: 0,
      categories: cats.map((c, ci) => ({
        id: `cat${ci}`,
        title: c,
        clues: [0, 1].map((ri) => ({
          id: `c${ci}_${ri}`,
          value: null,
          type: 'standard',
          questionSlide: slide(`q${ci}_${ri}`, `${c} ${ri}`),
          answerSlide: slide(`a${ci}_${ri}`, `Answer ${ci}.${ri}`),
          ...(ci === 3 && !ri ? partnerClue : {}),
        })),
      })),
    },
  ],
  media: [],
  audio: {},
  theme: {},
  wheels: [],
  dice: [],
  statFields: [],
  items: [],
};
/** The same players, a Final only (both on $0 play it, their $0 wagers filled in): flow 3. */
const finalGame = {
  ...game,
  id: 'g_goon_final',
  title: 'Go On Final',
  rounds: [
    {
      id: 'r_final',
      name: 'Final Jeopardy!',
      mode: 'final',
      category: 'Lore',
      questionSlide: slide('fq', 'The final question'),
      answerSlide: slide('fa', 'The final answer'),
      timerSeconds: 30,
      allowNonPositive: true,
    },
  ],
};
const gameFile = resultsPath('goon.json');
writeFileSync(gameFile, JSON.stringify(game));
const finalFile = resultsPath('goon-final.json');
writeFileSync(finalFile, JSON.stringify(finalGame));
/** The same Final with a 3-second clock: it runs out (flow 3b). */
const shortFinalFile = resultsPath('goon-final-short.json');
writeFileSync(shortFinalFile, JSON.stringify({ ...finalGame, id: 'g_goon_final_short', rounds: [{ ...finalGame.rounds[0], timerSeconds: 3 }] }));

const buzzer = await startBuzzer('buzzer-goon-');
const browser = await launchChromium();
const errors = [];

/**
 * A window at 1280×720 on the game's pre-game screen (`server`: the buzzer server in its settings; `from`: its file;
 * `opts`: the window's own, a touch tablet's say).
 */
async function host(name, server, from = gameFile, opts = { viewport: { width: 1280, height: 720 } }) {
  const ctx = await browser.newContext(opts);
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
  await boardIn(stageBoxIn(page)).waitFor();
}

/** Category `cat`'s first tile open, its question up. */
async function openTile(page, cat) {
  await boardIn(stageBoxIn(page)).locator(`.tile[data-cat="${cat}"]:not([disabled])`).first().click();
  await statusLineIn(page, { hasText: 'Answer hidden' }).waitFor();
}

/** Category `cat`'s tile open, Ann picked (1) and the answer shown (R): ▦ Done ▶ board, with Ann's points not given. */
async function atDone(page, cat) {
  await openTile(page, cat);
  await page.keyboard.press('1');
  await page.keyboard.press('r');
  await stageBoxIn(page).locator('[data-slide="answer"]').waitFor();
}

const stageSize = (page) =>
  stageBoxIn(page)
    .locator('.stage')
    .evaluate((s) => {
      const r = s.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    });
// The stage's size once it has stopped changing (it grows to the window a frame or two after the panel goes).
async function settledStageSize(page) {
  let was = '';
  for (let i = 0; i < 40; i++) {
    const now = await stageSize(page);
    if (now === was) return now;
    was = now;
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  throw new Error(`the stage never settled at one size (last ${was})`);
}
const rectOf = (loc) => loc.evaluate((b) => (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(b.getBoundingClientRect()));
/** What a tap at the middle of `r` would press (its words), or '' for nothing. */
const underAt = (page, r) =>
  page.evaluate(({ x, y, width, height }) => {
    const t = document.elementFromPoint(x + width / 2, y + height / 2)?.closest('button, label, input');
    return t ? t.textContent.trim() || t.outerHTML.slice(0, 60) : '';
  }, r);
const boardUp = async (page) => (await boardIn(stageBoxIn(page)).count()) === 1 && (await stageBoxIn(page).locator('[data-slide]').count()) === 0;

try {
  /**
   * The tools row's buttons the open check cuts (one partly under it, partly beside it): it covers the row whole where it
   * would cut one.
   */
  const toolStubs = (page) =>
    page.evaluate(() => {
      const card = document.querySelector('.panel [data-goon]').getBoundingClientRect();
      return [...document.querySelectorAll('.panel > .toolsrow :is(button, select)')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.left < card.right &&
            card.left < r.right &&
            r.top < card.bottom &&
            card.top < r.bottom &&
            (r.left < card.left - 0.5 || r.right > card.right + 0.5)
          );
        })
        .map((b) => b.textContent.trim());
    });

  // ---------- 1 and 5: a clue at ▦ Done with points not given, one window ----------
  section('A clue at ▦ Done ▶ board with points not given, one window at 1280×720');
  {
    const { ctx, page } = await host('one window');
    await start(page);
    const annScore = () => playerRowsIn(page).nth(0).locator('.score').innerText();

    // By N, and its place (5).
    await atDone(page, 0);
    assert(await flowIs(page, '▦ Done ▶ board'), 'with the answer showing, the blue button is ▦ Done ▶ board');
    const stageWas = await stageSize(page);
    const mainWas = await rectOf(mainButton(page));
    // (N, N at once: the second is inside the check's first 600 ms, so it presses nothing; what it would press lights up.)
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await checkItem(page, 'picked').waitFor();
    await hostPanelIn(page).locator('[data-goon] [data-anyway].lit').waitFor();
    assert(
      (await goOnCheck(page).getAttribute('data-goon')) === 'loss' && (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 1,
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
        onMain: [...document.querySelectorAll('.panel [data-goon] :is(button, input, label)')]
          .filter((b) => meets(rect(b), m))
          .map((b) => b.textContent.trim()),
      };
    }, mainWas);
    assert(
      c.inside && c.offStage && c.offBar && !c.onMain.length && (await stageSize(page)) === stageWas,
      `its place: inside the panel, off the stage and the fixed bar, none of its buttons on the blue button's spot, the stage its size (${JSON.stringify({ ...c, stageWas, stage: await stageSize(page) })})`,
    );
    const stubs = await toolStubs(page);
    assert(!stubs.length, `it covers the tools row whole, no tool cut off beside it (${stubs.join(', ') || 'none'})`);
    // (Its fixes in sight as it opens, not under its pinned foot while “▦ Done anyway: no points” shows.)
    for (const fix of ['＋ Award Ann $200 ▶ board', '− Deduct Ann $200 ▶ board']) {
      const hid = await quickInSight(page, fix);
      assert(!hid, `its ${fix} is in sight as it opens, nothing scrolled (${hid})`);
    }
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('n');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await boardIn(stageBoxIn(page)).waitFor();
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
    assert(
      (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 1,
      'Not yet closes it, the keys back on the blue button, and an Esc right after it does nothing: the clue stays open',
    );

    // By a click on the stage.
    await stageBoxIn(page).locator('.stage').click();
    await checkItem(page, 'picked').waitFor();
    assert((await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 1, 'a click on the stage at ▦ Done opens the check too (the clue stays open)');
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });

    // Shift+click: on at once, asking nothing.
    const seen = await page.evaluate(() => window.__goonSeen);
    await mainButton(page).click({ modifiers: ['Shift'] });
    await boardIn(stageBoxIn(page)).waitFor();
    assert(
      (await boardUp(page)) && (await page.evaluate(() => window.__goonSeen)) === seen && (await annScore()) === '$0',
      'Shift+click on the blue button goes on at once, the check never opening',
    );

    // ＋ Award Ann $200 ▶ board, then Ctrl+Z: the points go, the board stays.
    await atDone(page, 2);
    await page.keyboard.press('n');
    await goOnCheck(page, { ready: true }).waitFor();
    await quick(page, '＋ Award Ann $200 ▶ board').click();
    await goOnCheck(page).waitFor({ state: 'detached' });
    await boardIn(stageBoxIn(page)).waitFor();
    assert((await boardUp(page)) && (await annScore()) === '$200', 'the check’s ＋ Award Ann $200 ▶ board gives the points and goes back to the board');
    await page.keyboard.press('Control+z');
    await toastsIn(page, { hasText: 'Undid' }).waitFor();
    assert((await annScore()) === '$0' && (await boardUp(page)), 'Ctrl+Z takes the award back, and the board stays');

    // A double-click on a fix does one thing. Ann and Bob both picked (a line each): Ann's ＋ Award keeps the check open,
    // Bob's ＋ Award Bob $400 ▶ board then where hers was, and the double-click's second click gives him nothing. On his
    // (it goes on), the second click lands on nothing where the check was.
    const bobScore = () => playerRowsIn(page).nth(1).locator('.score').innerText();
    const dblclickMiddle = async (loc) => {
      const b = await loc.boundingBox();
      await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    };
    await boardIn(stageBoxIn(page)).locator('.tile[data-cat="0"]:not(.used):not([disabled])').first().click();
    await statusLineIn(page, { hasText: 'Answer hidden' }).waitFor();
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('r');
    await stageBoxIn(page).locator('[data-slide="answer"]').waitFor();
    await page.keyboard.press('n');
    await goOnCheck(page, { ready: true }).waitFor();
    assert((await goOnCheck(page).locator('[data-quick]').count()) === 4, 'two picked: the check has a line each (＋ / −)');
    // (A host who reads it first: past the 1.2 s in which the rest of the press that opened it is held anyway.)
    await page.waitForTimeout(700);
    await dblclickMiddle(quick(page, '＋ Award'));
    await playerRowsIn(page).nth(0).locator('.score', { hasText: '$400' }).waitFor();
    assert(
      (await bobScore()) === '$0' && (await quick(page, '＋ Award Bob $400 ▶ board').count()) === 1,
      `a double-click on Ann's ＋ Award gives her $400 only: Bob's ＋ Award Bob $400 ▶ board, come in its place, isn't pressed, the check still open (Ann ${await annScore()}, Bob ${await bobScore()})`,
    );
    // (A fresh double-click: past the second the spot waits after a fix redrew it there.)
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.__restClicks = 0;
      document.addEventListener('click', (e) => e.detail >= 2 && window.__restClicks++);
    });
    await dblclickMiddle(quick(page, '＋ Award Bob $400 ▶ board'));
    await goOnCheck(page).waitFor({ state: 'detached' });
    await boardIn(stageBoxIn(page)).waitFor();
    assert(
      (await bobScore()) === '$400' &&
        (await annScore()) === '$400' &&
        (await page.evaluate(() => window.__restClicks)) === 0 &&
        (await hostPanelIn(page).locator('.score-edit').count()) === 0,
      'a double-click on ＋ Award Bob $400 ▶ board gives him $400 and goes back to the board; its second click reaches nothing where the check was',
    );
    await ctx.close();
  }

  // ---------- 2: a partner clue's hand-out, one window, with phones ----------
  section('A partner clue’s hand-out, one window, with phones');
  {
    const { ctx, page } = await host('partner, one window', buzzer.base);
    const card = page.getByRole('region', { name: 'Phone buzzers' });
    await card.getByLabel(/Buzzer mode/).check();
    const code = await startRoomOn(card);
    // (Bob's phone: a touch screen of its own, as a phone is. In the host's window the page would say “Click”.)
    const bobCtx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const bob = await bobCtx.newPage();
    bob.on('pageerror', (e) => errors.push(`[bob] ${e.message}`));
    await bob.goto(`${buzzer.base}/${code}`);
    await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await bob.getByRole('button', { name: 'Bob', exact: true }).click();
    await bob.locator('#me').getByText('Bob').waitFor();
    await card.getByText('1 of 2 players joined').waitFor();
    await start(page);
    /** The host page holds no word of the card: its text, its labels and its tooltips. */
    const noCard = async () =>
      !(
        await page.evaluate(() =>
          [
            document.body.innerText,
            ...[...document.querySelectorAll('[aria-label], [title]')].flatMap((e) => [e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? '']),
          ].join('\n'),
        )
      ).includes(CARD_WORDS);
    const answer = () => stageBoxIn(page).locator('[data-slide="answer"]').count();
    // Ann picks it; Bob, the only other player, is her partner at once. Enter on PARTNER UP! is Show question ▶.
    await page.keyboard.press('p');
    await page.keyboard.press('1');
    await stageBoxIn(page).locator('.tile[data-clue="c3_0"]').click();
    await stageBoxIn(page).locator('[data-partner-up]').waitFor();
    await hostPanelIn(page).locator('[data-partner-next]', { hasText: 'Pair set' }).waitFor();
    assert(await flowIs(page, 'Show question ▶'), 'PARTNER UP!, the pair set: the blue button is Show question ▶');
    await page.keyboard.press('Enter');
    await stageBoxIn(page).locator('[data-partner-badge]').waitFor();
    const box = hostPanelIn(page).locator('[data-partner-panel]');
    await stepButton(box, '📤 Send and start').waitFor();
    assert(await flowIs(page, '👁 Reveal answer'), 'the question up, the card to hand out: the blue button is 👁 Reveal answer, 📤 Send and start the 🤝 box’s');

    // N: “First:”, the card not sent and the clock not started. N, N, N in it never shows the answer (R would).
    await page.keyboard.press('n');
    await checkItem(page, 'handout').waitFor();
    assert(
      (await goOnCheck(page).getAttribute('data-goon')) === 'first' &&
        (await quick(page, '📤 Send and start').count()) === 1 &&
        (await anyway(page).innerText()).includes('👁 Reveal anyway: they haven’t played'),
      'N opens “First:” Card 1 hasn’t gone to Bob’s phone, with 📤 Send and start and a quiet 👁 Reveal anyway',
    );
    assert(await noCard(), 'the page holds no word of the card with the check open (its name and who it’s for only)');
    await goOnCheck(page, { ready: true }).waitFor();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('n');
      await toastsIn(page, { hasText: 'R: 👁 Reveal anyway' }).waitFor();
    }
    assert((await answer()) === 0 && (await goOnCheck(page).count()) === 1, 'N, N, N in it never shows the answer: each says Enter sends, R reveals anyway');
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });

    // A click on the stage with the card waiting opens it too; Enter in it sends the card and starts the clock.
    await stageBoxIn(page).locator('.stage').click();
    await checkItem(page, 'handout').waitFor();
    assert((await answer()) === 0, 'a click on the stage with the card waiting opens the check, never the answer');
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('Enter');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await stageBoxIn(page).locator('.timer').waitFor();
    await bob.getByRole('button', { name: 'Tap to see' }).waitFor();
    assert((await answer()) === 0 && (await noCard()), 'Enter in it sends the card to Bob’s phone and starts the clock, the answer still hidden');

    // They're playing: N asks again (✔ Got it ▶ reveal…); R in it reveals anyway.
    await page.keyboard.press('n');
    await checkItem(page, 'playing').waitFor();
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('r');
    await stageBoxIn(page).locator('[data-slide="answer"]').waitFor();
    assert((await goOnCheck(page).count()) === 0 && (await noCard()), 'with the pair playing N asks again, and R in it reveals anyway');
    await bobCtx.close();
    await ctx.close();
  }

  // ---------- 3: the Final's spotlit player's verdict, a must ----------
  section('The Final’s reveals, one window');
  {
    const { ctx, page } = await host('final', undefined, finalFile);
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    // (Its title card, if it has one: N starts the round.)
    await finalControlsIn(page).locator('.wagers').or(stageBoxIn(page).locator('.title-card')).first().waitFor();
    if (await stageBoxIn(page).locator('.title-card').count()) await page.keyboard.press('n');
    await finalControlsIn(page).locator('.wagers').waitFor();
    const status = (t) => statusLineIn(page, { hasText: t }).waitFor();
    // (Everyone on $0 could wager up to $2,000; each wagers $0 here: N shows the question, the answer, the reveals,
    // then the first one's wager.)
    const zeroBoxes = finalControlsIn(page).locator('.wagers input[data-wager]');
    for (let i = 0; i < (await zeroBoxes.count()); i++) await zeroBoxes.nth(i).fill('0');
    await page.keyboard.press('n');
    await status('Question on screen');
    // The think clock running: 👁 Reveal answer asks first, by N, by a click on the stage, by the stage's menu and by
    // the blue button (⏱️ Let it run, the ⏎ one; 👁 Reveal anyway, R), the answer hidden meanwhile.
    const answerUp = () => stageBoxIn(page).locator('.stage', { hasText: 'The final answer' }).count();
    const clockRuns = () => hostPanelIn(page).locator('.tc button[aria-label="Pause timer"]').count();
    const clockLine = checkItem(page, 'clock');
    await page.keyboard.press('n');
    await clockLine.waitFor();
    assert(
      /^The clock is still running \(\d+ s left\)\.$/.test((await clockLine.locator('.text').innerText()).trim()) &&
        (await quick(page, '⏱️ Let it run').innerText()).includes('⏎') &&
        (await anyway(page).innerText()).startsWith('👁 Reveal anyway') &&
        (await answerUp()) === 0,
      `N with the Final’s clock running asks first (“${(await clockLine.locator('.text').innerText()).trim()}”): ⏱️ Let it run ⏎, 👁 Reveal anyway, the answer hidden`,
    );
    const stubs = await toolStubs(page);
    assert(!stubs.length, `1280×720: the Final's clock check covers the tools row whole, no tool cut off beside it (${stubs.join(', ') || 'none'})`);
    const inSight = (await quickInSight(page, '⏱️ Let it run')) + (await quickInSight(page, '⏸ Pause the clock'));
    assert(inSight === '', `1280×720, one window: ⏱️ Let it run and ⏸ Pause the clock are in sight, nothing scrolled${inSight ? ` (${inSight})` : ''}`);
    // Enter in it: ⏱️ Let it run, the clock still running, the answer still hidden.
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('Enter');
    await goOnCheck(page).waitFor({ state: 'detached' });
    assert((await answerUp()) === 0 && (await clockRuns()) === 1, 'Enter (⏱️ Let it run) closes it: the clock still running, the answer hidden');
    await stageBoxIn(page).locator('.stage').click();
    await clockLine.waitFor();
    // (Its seconds follow the clock while it's open.)
    const secs = () => page.evaluate(() => Number(/\((\d+) s left\)/.exec(document.querySelector('[data-goon-item="clock"] .text')?.textContent ?? '')?.[1]));
    const was = await secs();
    await page.waitForFunction(
      (w) => Number(/\((\d+) s left\)/.exec(document.querySelector('[data-goon-item="clock"] .text')?.textContent ?? '')?.[1]) < w,
      was,
    );
    assert((await answerUp()) === 0, `a click on the stage asks too, its seconds counting down (${was} s, then ${await secs()} s)`);
    // (The check, the status line and the stage show the same seconds left at any moment: its words invite comparing.)
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      seen.add(
        await page.evaluate(() =>
          [
            /\((\d+) s left\)/.exec(document.querySelector('[data-goon-item="clock"] .text')?.textContent ?? '')?.[1],
            /(\d+)s/.exec(document.querySelector('.panel .tc .left')?.textContent ?? '')?.[1],
            document.querySelector('.stage-box .timer .num')?.textContent?.trim(),
          ].join('/'),
        ),
      );
      await page.waitForTimeout(37);
    }
    const odd = [...seen].filter((x) => new Set(x.split('/')).size !== 1);
    assert(odd.length === 0, `the check, the status line and the stage show the same seconds left (${[...seen].join(', ')})`);
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await stageBoxIn(page).locator('.stage').click({ button: 'right' });
    await page
      .locator('.cm[role="menu"]')
      .getByRole('menuitem', { name: /👁 Reveal answer/ })
      .click();
    await clockLine.waitFor();
    assert((await answerUp()) === 0 && (await clockRuns()) === 1, 'so does the stage’s menu; Esc (Not yet) leaves the clock running');
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });
    // Enter with the keys on the blue button shows nothing either.
    await mainButton(page, '👁 Reveal answer').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    assert((await answerUp()) === 0, 'Enter with the keys on the blue button doesn’t show the answer');
    if (await goOnCheck(page).count()) {
      await goOnCheck(page, { ready: true }).waitFor();
      await page.keyboard.press('Escape');
      await goOnCheck(page).waitFor({ state: 'detached' });
    }
    // The controls hidden in one window: N changes nothing on stream (the pill pulses), H shows the check.
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    await page.keyboard.press('n');
    await page.locator('.show-controls.pulse').waitFor();
    assert((await answerUp()) === 0, 'the controls hidden, one window: N holds (the pill pulses), the answer hidden');
    await page.keyboard.press('h');
    await clockLine.waitFor();
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });
    // T in it: ⏸ Pause the clock, as outside. It closes with the clock paused and the answer still hidden (a paused
    // clock lets the next 👁 Reveal answer go on at once); T outside starts it again.
    await mainButton(page, '👁 Reveal answer').click();
    await clockLine.waitFor();
    assert((await quick(page, '⏸ Pause the clock').innerText()).includes('T'), 'the check offers ⏸ Pause the clock, its key T');
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('t');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await hostPanelIn(page).locator('.tc button[aria-label="Start timer"]').waitFor();
    assert((await answerUp()) === 0, 'T in the check pauses the clock and closes it, the answer still hidden');
    await page.keyboard.press('t');
    await hostPanelIn(page).locator('.tc button[aria-label="Pause timer"]').waitFor();
    await mainButton(page, '👁 Reveal answer').click();
    await clockLine.waitFor();
    await goOnCheck(page, { ready: true }).waitFor();
    await anyway(page).click();
    await status('Answer on screen');
    assert((await answerUp()) === 1 && (await goOnCheck(page).count()) === 0, 'the blue button asks too, and 👁 Reveal anyway shows the answer');
    await page.keyboard.press('n');
    await status('Player reveals');
    const spot = () => finalControlsIn(page).locator('.pl.cur .name').innerText();
    const who = await spot();
    await page.keyboard.press('n');
    await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Next player ▶'));
    assert(
      (await stageBoxIn(page).locator('.spot-wager').innerText()).includes('$0'),
      `N shows ${who}’s wager; the blue button is Next player ▶ (their verdict due, in their row)`,
    );
    // N with them not judged yet: the check (“First:”, a must: no anyway), the spotlight staying on them.
    await page.keyboard.press('n');
    await checkItem(page, 'verdict').waitFor();
    assert(
      (await goOnCheck(page).getAttribute('data-goon')) === 'first' &&
        (await anyway(page).count()) === 0 &&
        (await quick(page, '✔ Right').count()) === 1 &&
        (await quick(page, '✘ Wrong').count()) === 1 &&
        (await spot()) === who,
      `N with ${who} not judged yet opens the check: ✔ Right / ✘ Wrong, no “anyway”, the spotlight still on them`,
    );
    // C in it: judged, the check closed, the spotlight still on them with their verdict on stage.
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('c');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await stageBoxIn(page).locator('.spot-result', { hasText: 'CORRECT' }).waitFor();
    assert(
      (await spot()) === who && (await stageBoxIn(page).locator('.spot-name').textContent()) === who,
      `C judges ${who} and closes it: their verdict on stage, the spotlight still on them`,
    );
    // N then goes on, to the next player.
    await page.keyboard.press('n');
    await page.waitForFunction((w) => document.querySelector('.fj .pl.cur .name')?.textContent !== w, who);
    assert((await goOnCheck(page).count()) === 0, 'then N goes on to the next player (N, C, N)');
    await ctx.close();
  }

  // ---------- 3b: the Final's clock stopped or run out: 👁 Reveal answer at once ----------
  section('The Final’s reveal, the clock stopped or run out');
  for (const [how, from] of [
    ['paused', finalFile],
    ['run out', shortFinalFile],
    ['run out with the check open', shortFinalFile],
  ]) {
    const { ctx, page } = await host(`final ${how}`, undefined, from);
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await finalControlsIn(page).locator('.wagers').or(stageBoxIn(page).locator('.title-card')).first().waitFor();
    if (await stageBoxIn(page).locator('.title-card').count()) await page.keyboard.press('n');
    await finalControlsIn(page).locator('.wagers').waitFor();
    const zeroBoxes = finalControlsIn(page).locator('.wagers input[data-wager]');
    for (let i = 0; i < (await zeroBoxes.count()); i++) await zeroBoxes.nth(i).fill('0');
    await page.keyboard.press('n');
    await statusLineIn(page, { hasText: 'Question on screen' }).waitFor();
    if (how === 'run out with the check open') {
      // N while it runs: the check; once it runs out, its line says so and N takes the step.
      await page.keyboard.press('n');
      await checkItem(page, 'clock').waitFor();
      await hostPanelIn(page).locator('[data-goon="nothing"] [data-goon-item="clock"]', { hasText: '✓ Time’s up' }).waitFor();
      assert(
        (await stageBoxIn(page).locator('.stage', { hasText: 'The final answer' }).count()) === 0,
        'the clock runs out with the check open: “✓ Time’s up”, the answer still hidden',
      );
      await goOnCheck(page, { ready: true }).waitFor();
      await page.keyboard.press('n');
      await statusLineIn(page, { hasText: 'Answer on screen' }).waitFor();
      assert((await goOnCheck(page).count()) === 0, 'then N shows the answer');
      await ctx.close();
      continue;
    }
    if (how === 'paused') {
      await hostPanelIn(page).locator('.tc button[aria-label="Pause timer"]').waitFor();
      await page.keyboard.press('t');
      await hostPanelIn(page).locator('.tc button[aria-label="Start timer"]').waitFor();
    } else
      await hostPanelIn(page)
        .locator('.tc .left', { hasText: 'Time’s up' })
        .or(hostPanelIn(page).locator('.tc .left', { hasText: "Time's up" }))
        .waitFor();
    const seen = await page.evaluate(() => window.__goonSeen);
    await page.keyboard.press('n');
    await statusLineIn(page, { hasText: 'Answer on screen' }).waitFor();
    assert(
      (await page.evaluate(() => window.__goonSeen)) === seen && (await stageBoxIn(page).locator('.stage', { hasText: 'The final answer' }).count()) === 1,
      `the clock ${how}: N shows the answer at once, no check`,
    );
    await ctx.close();
  }

  // ---------- 3c: the Final's clock check on a touch tablet: no keys taught ----------
  section('The Final’s clock check on a touch tablet');
  for (const [what, opts] of [
    ['a computer', { viewport: { width: 1280, height: 720 } }],
    ['a touch tablet', { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }],
    ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ]) {
    const { ctx, page } = await host(`final, ${what}`, undefined, finalFile, opts);
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await finalControlsIn(page).locator('.wagers').or(stageBoxIn(page).locator('.title-card')).first().waitFor();
    if (await stageBoxIn(page).locator('.title-card').count()) await page.keyboard.press('n');
    await finalControlsIn(page).locator('.wagers').waitFor();
    const zeroBoxes = finalControlsIn(page).locator('.wagers input[data-wager]');
    // (On the phone, $100 each: ½ Halve and 0 Nullify show for a wager over $0.)
    for (let i = 0; i < (await zeroBoxes.count()); i++) await zeroBoxes.nth(i).fill(what === 'a phone' ? '100' : '0');
    await page.keyboard.press('n');
    await statusLineIn(page, { hasText: 'Question on screen' }).waitFor();
    const mainAt = await mainButton(page, '👁 Reveal answer').boundingBox();
    await mainButton(page, '👁 Reveal answer').click();
    await checkItem(page, 'clock').waitFor();
    const teach = goOnCheck(page).locator('.teach');
    const shown = (await teach.count()) === 1 && (await teach.isVisible());
    // (A finger can't press R or Shift+click: "Next time: …" is only for a keyboard and a mouse.)
    assert(
      what === 'a computer' ? shown : !shown,
      `${what}: the check ${what === 'a computer' ? 'says' : 'doesn’t say'} “Next time: R reveals at once · Shift+click …”`,
    );
    if (what === 'a phone') {
      // A phone: the check's lines get the card's whole width (no room kept beside them for the blue button's spot, which
      // squeezed them to half of it); the reveal rows get the panel's whole width, ½ Halve and 0 Nullify in sight, the
      // blue button on its own row under them.
      const pad = await goOnCheck(page)
        .locator('.scroll')
        .evaluate((e) => getComputedStyle(e).paddingRight);
      assert(pad === '0px', `a phone: the check's lines take its whole width (padding ${pad})`);
      await goOnCheck(page, { ready: true }).waitFor();
      // (No spot drawn, but where the blue button was the check has no button: a nervous second tap there presses nothing.)
      const under = await underAt(page, mainAt);
      assert(under === '' && (await goOnCheck(page).locator('.spot').count()) === 0, `a phone: where the blue button was, the check has no button (${under})`);
      await anyway(page).click();
      await statusLineIn(page, { hasText: 'Answer on screen' }).waitFor();
      await page.keyboard.press('n');
      await statusLineIn(page, { hasText: 'Player reveals' }).waitFor();
      await finalControlsIn(page).locator('.pl').first().waitFor();
      const cut = await page.evaluate(() => {
        const box = document.querySelector('.panel > .act > .action').getBoundingClientRect();
        return [...document.querySelectorAll('.fj .pl.cur button')]
          .filter((b) => /Halve|Nullify/.test(b.textContent))
          .map((b) => [b.textContent.trim(), b.getBoundingClientRect()])
          .filter(([, r]) => r.left < box.left - 1 || r.right > box.right + 1)
          .map(([t, r]) => `${t} ${Math.round(r.left)}..${Math.round(r.right)} outside ${Math.round(box.left)}..${Math.round(box.right)}`);
      });
      const halves = await finalControlsIn(page)
        .locator('.pl.cur button', { hasText: /Halve|Nullify/ })
        .count();
      assert(halves === 2 && !cut.length, `a phone: the spotlit reveal row's ½ Halve and 0 Nullify are in sight (${cut.join(', ') || 'both'})`);
    }
    if (what === 'a touch tablet') {
      // Its reveals: the rows wrap, ✔ Right and ✘ Wrong together at one place in every row (the spotlit one's too, its
      // wager shown and its Show wager kept empty), and the how-to names no keys.
      await goOnCheck(page, { ready: true }).waitFor();
      await anyway(page).click();
      await statusLineIn(page, { hasText: 'Answer on screen' }).waitFor();
      await page.keyboard.press('n');
      await statusLineIn(page, { hasText: 'Player reveals' }).waitFor();
      await page.keyboard.press('n');
      await finalControlsIn(page).locator('.pl.cur', { hasText: 'wager $0' }).waitFor();
      const at = await finalControlsIn(page)
        .locator('.pl')
        .evaluateAll((rows) =>
          rows.map((r) => ['button.good', 'button.bad'].map((sel) => Math.round(r.querySelector(sel).getBoundingClientRect().left)).join('/')),
        );
      assert(new Set(at).size === 1, `a touch tablet: ✔ Right / ✘ Wrong at one place in every reveal row, the spotlit one's too (${at.join(', ')})`);
      const how = finalControlsIn(page).locator('details.how');
      if (!(await how.evaluate((d) => d.open))) await how.locator('summary').click();
      const words = await how.innerText();
      assert(
        words.includes('spotlight') && !/Keys:|Alt\+|\(N, C, X\)/.test(words),
        `a touch tablet: the reveals' how-to names no keys (“${words.replace(/\s+/g, ' ')}”)`,
      );
    }
    await ctx.close();
  }

  // ---------- 4: with the controls hidden ----------
  section('With the controls hidden');
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
    await hostPanelIn(page).locator('button[data-box="buzzers"].ring').waitFor();
    assert(
      await flowIs(page, '👁 Reveal answer'),
      'the buzzers never opened: the blue button is still 👁 Reveal answer, 🔔 Open the buzzers in the buzzers’ row has the ring',
    );
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    const hiddenSize = await settledStageSize(page);
    await page.keyboard.press('n');
    await page.locator('.show-controls.pulse').waitFor();
    await page.locator('[data-goon-held]').waitFor();
    assert(
      (await page.locator('.play > .panel').count()) === 0 &&
        (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 0 &&
        (await stageSize(page)) === hiddenSize,
      'one window, the controls hidden: N with something left shows nothing new on stream (no answer, no panel, the stage its size) and the pill pulses',
    );
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor();
    await checkItem(page, 'buzzers').waitFor();
    assert((await goOnCheck(page).getAttribute('data-goon')) === 'first', 'H shows the panel with the check open in it (“First:” 🔔 Open the buzzers)');
    {
      const hid = await quickInSight(page, '🔔 Open the buzzers');
      const tick = await goOnCheck(page).locator('label:has(input[type="checkbox"])').allInnerTexts();
      assert(
        !hid && tick.length === 1 && tick[0].includes('Don’t ask about opening the buzzers'),
        `its 🔔 Open the buzzers is in sight, nothing scrolled, its “Don’t ask” tick there too, under it (${hid}; ${JSON.stringify(tick)})`,
      );
    }
    await goOnCheck(page, { ready: true }).waitFor();
    await quick(page, '🔔 Open the buzzers').click();
    await goOnCheck(page).waitFor({ state: 'detached' });
    assert(
      (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 0,
      'its 🔔 Open the buzzers opens them and closes it, the answer still hidden',
    );
    // The expert's "2, Enter" in it (Bob shouted it out, the buzzers never opened on this clue): Bob gets the points, as
    // outside, never 👁 Reveal answer (2 picks him and leaves nothing to do; Enter then awards, the check closing).
    await page.keyboard.press('Escape');
    await boardIn(stageBoxIn(page)).waitFor();
    await openTile(page, 1);
    await hostPanelIn(page).locator('button[data-box="buzzers"].ring').waitFor();
    await page.keyboard.press('n');
    await checkItem(page, 'buzzers').waitFor();
    await goOnCheck(page, { ready: true }).waitFor();
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await playerRowsIn(page).nth(1).locator('.score', { hasText: '$200' }).waitFor();
    assert(
      (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 0 && (await playerRowsIn(page).nth(0).locator('.score').innerText()) === '$0',
      'the buzzers never opened: 2 then Enter in the check gives Bob $200 and closes it, the answer still hidden',
    );
    await ctx.close();
  }
  {
    // Two windows: the host's window isn't on stream, so the controls come back while the check is open.
    const { ctx, page } = await host('hidden, two windows');
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
    aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
    await aud.waitForLoadState();
    await start(page);
    await boardIn(aud).waitFor();
    await atDone(page, 0);
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    await page.keyboard.press('n');
    await page.locator('.play > .panel').waitFor();
    await checkItem(page, 'picked').waitFor();
    assert(
      (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 1,
      'two windows, the controls hidden: N with Ann’s points not given brings the controls back with the check open',
    );
    await page.keyboard.press('Escape');
    await goOnCheck(page).waitFor({ state: 'detached' });
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    assert(
      (await stageBoxIn(page).locator('[data-slide="answer"]').count()) === 1,
      'Not yet (Esc) closes it, and the controls hide again, the clue still open',
    );
    await ctx.close();
  }

  {
    // Two windows, the Final's wagers with the controls hidden (H): no box under it, so N's toast says whose too.
    const { ctx, page } = await host('final, hidden, two windows', undefined, finalFile);
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
    aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
    await aud.waitForLoadState();
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await finalControlsIn(page).locator('.wagers').or(stageBoxIn(page).locator('.title-card')).first().waitFor();
    if (await stageBoxIn(page).locator('.title-card').count()) await page.keyboard.press('n');
    await finalControlsIn(page).locator('.wagers').waitFor();
    await statusLineIn(page).click();
    await page.keyboard.press('h');
    await page.locator('.play > .panel').waitFor({ state: 'detached' });
    await page.keyboard.press('n');
    await toastsIn(page, { hasText: /^Waiting on .+: type their wagers?, or untick them to sit out$/ }).waitFor();
    assert(true, 'two windows, the controls hidden at the Final’s wagers: N’s toast says whose and what to do');
    await ctx.close();
  }

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('goon: all passed');
} catch (e) {
  await failureShots('goon', browser);
  throw e;
} finally {
  await browser.close();
  buzzer.stop();
}
