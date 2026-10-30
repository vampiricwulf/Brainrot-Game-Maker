// A whole show, twice: once by keys (an expert), once by clicks (a host who drives from the stage, and clicks the panel
// only where the stage does nothing). It counts the keys pressed, the clicks and the numbers typed in each part of the
// show, and checks them against today's (TODAY, below), so a change that makes a host take one more step shows up here.
// The show, one window, with phone buzzers and three phones: the round intro, a clue a phone buzzes in on, a Daily
// Double (by keys the host types the wager; by clicks the player's phone sends it), a wheel tile, a partner clue whose
// card goes to a phone (🎡 Spin for a partner) and one with no cards (the partner picked by hand), the played-out
// board's Next round ▶, a slides round, a board-game turn and leaving that round, a three-player Final (the wagers typed
// by the host, or sent from the phones) and a tie at the end settled by the tiebreaker clue. Each step waits for what it
// should do (never a timer), and goes at a host's pace where the app holds a quick second press back (KEY_GUARD,
// STAGE_GAP). With SCREENSHOTS set to a folder, it saves the host's window as each part starts. Needs `npm ci` in
// buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, mainButton, mainLabel, openGameFile, startBuzzer, startRoomOn } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
/** A folder for a screenshot of the host's window as each part of the show starts (left out: none). */
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/**
 * Today's counts, recorded on the app before the usability plan's changes (17e8dbe): each part of the show, by keys and
 * by clicks, the keys pressed, the clicks and the numbers typed. (By keys, a played-out board's Next round ▶ and leaving
 * a board game have no key: they're clicks.) A change that takes a host one more step changes its line here, naming the
 * plan's change that allows it (U2's last slide, U12's question, U26's first Enter after T, U7a's second R); one that
 * saves a step changes it too.
 */
const TODAY = {
  keys: {
    'Start and the round intro': { keys: 4, clicks: 0, typed: 0 },
    'A clue a phone buzzes in on': { keys: 4, clicks: 0, typed: 0 },
    'A Daily Double': { keys: 6, clicks: 0, typed: 1 },
    'A wheel tile': { keys: 7, clicks: 0, typed: 0 },
    'A partner clue, its card to a phone': { keys: 11, clicks: 0, typed: 0 },
    'A partner clue with no cards, the partner picked by hand': { keys: 7, clicks: 0, typed: 0 },
    'The played-out board': { keys: 0, clicks: 1, typed: 0 },
    'A slides round': { keys: 3, clicks: 0, typed: 0 },
    'A board-game turn, then leaving the round': { keys: 4, clicks: 2, typed: 0 },
    'The Final': { keys: 17, clicks: 0, typed: 3 },
    'A tie at the end: the tiebreaker clue': { keys: 4, clicks: 1, typed: 0 },
  },
  clicks: {
    'Start and the round intro': { keys: 0, clicks: 4, typed: 0 },
    'A clue a phone buzzes in on': { keys: 0, clicks: 4, typed: 0 },
    'A Daily Double': { keys: 0, clicks: 5, typed: 0 },
    'A wheel tile': { keys: 0, clicks: 6, typed: 0 },
    'A partner clue, its card to a phone': { keys: 0, clicks: 8, typed: 0 },
    'A partner clue with no cards, the partner picked by hand': { keys: 0, clicks: 6, typed: 0 },
    'The played-out board': { keys: 0, clicks: 1, typed: 0 },
    'A slides round': { keys: 0, clicks: 3, typed: 0 },
    'A board-game turn, then leaving the round': { keys: 0, clicks: 6, typed: 0 },
    'The Final': { keys: 0, clicks: 13, typed: 0 },
    'A tie at the end: the tiebreaker clue': { keys: 0, clicks: 5, typed: 0 },
  },
};

/** The app holds back an Enter (or N) a second after a step (a Daily Double's or partner clue's question, the clock). */
const KEY_GUARD = 1100;
/** …and a click on the stage within 450 ms of the one before (one double-click is one step). */
const STAGE_GAP = 500;
/** …and the round's Next round ▶ (a click, or N on a slides round's last slide) and its question's Yes as they come. */
const NEW_ROW = 500;

// ---------- The game ----------
let n = 0;
const text = (t) => ({ id: `t${n++}`, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 80, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (t) => ({ background: { color: '#0a1a6b' }, elements: [text(t)] });
const clue = (id, more = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(`Question ${id}`), answerSlide: slide(`Answer ${id}`), ...more });
// The partner describes (all the tile's value when they get it), the picker guesses (half): nobody loses on a miss.
const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
const sp = (id, name, x, next) => ({ id, name, x, y: 500, color: '#4363d8', next });
const NAMES = ['Ann', 'Bob', 'Cat'];
const game = {
  id: 'g_fullshow', version: 2, title: 'Full show',
  settings: {
    allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: true,
    roundIntro: { titleCard: true, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: NAMES.map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 0 })),
  rounds: [
    {
      id: 'r1', name: 'Jeopardy!', mode: 'board', values: [200, 400, 600], dailyDoubleCount: 1,
      categories: [
        { id: 'cat0', title: 'Memes', clues: [clue('q_std'), clue('q_dd', { type: 'dailyDouble' }), clue('q_wheel', { type: 'wheel', wheelId: 'w1' })] },
        {
          id: 'cat1', title: 'Movies',
          clues: [
            clue('q_pc', { type: 'partner', partner: { ...rules }, timerSeconds: 45, cards: [{ id: 'card1', to: 'giver', ...slide('Shrek') }] }),
            clue('q_pn', { type: 'partner', partner: { ...rules }, timerSeconds: 45 }),
            clue('q_empty', { empty: true }),
          ],
        },
      ],
    },
    { id: 'r2', name: 'Intermission', mode: 'slides', questionSlide: slide('Slide one'), extraSlides: [{ id: 'sx2', ...slide('Slide two') }, { id: 'sx3', ...slide('Slide three') }] },
    {
      id: 'r3', name: 'Board game', mode: 'boardgame', slide: { background: { color: '#1d5e3a' }, elements: [] },
      spaces: ['Start', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Finish'].map((name, i, all) => sp(`b${i}`, name, 150 + i * 200, i < all.length - 1 ? [`b${i + 1}`] : [])),
      mover: { kind: 'dice', dice: 'd6' }, zones: [],
    },
    { id: 'r4', name: 'Final Jeopardy!', mode: 'final', category: 'Movies', questionSlide: slide('The final question'), answerSlide: slide('The final answer'), timerSeconds: 30, allowNonPositive: true, phoneAnswersOff: true },
  ],
  media: [], audio: {}, theme: {}, dice: [],
  wheels: [{ id: 'w1', name: 'Bonus wheel', spinDurationMs: 1000, removeAfterLanding: false, segments: ['Red', 'Blue', 'Gold'].map((label, i) => ({ id: `s${i}`, label, color: ['#cc0000', '#0000cc', '#cccc00'][i], weight: 1 })) }],
  tiebreaker: { questionSlide: slide('The tiebreaker question'), answerSlide: slide('The tiebreaker answer') },
};
const gameFile = resolve('test-results/fullshow.json');
writeFileSync(gameFile, JSON.stringify(game));

const { base, stop } = await startBuzzer('buzzer-fullshow-');
const browser = await chromium.launch({ executablePath });
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  return p;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The three phones, each in its own browser (joined to each run's room). */
const phones = {};
for (const name of NAMES) phones[name] = watch(await (await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true })).newPage(), name);

/** One show: `how` is 'keys' or 'clicks'. Returns what each part took ({ keys, clicks, typed } by part). */
async function show(how) {
  const byKeys = how === 'keys';
  console.log(`By ${how}:`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await ctx.newPage(), `host (${how})`);
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  const code = await startRoomOn(host.getByRole('region', { name: 'Phone buzzers' }));
  for (const name of NAMES) {
    const p = phones[name];
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name, exact: true }).click();
    await p.locator('#me').getByText(name).waitFor();
  }
  await host.getByRole('region', { name: 'Phone buzzers' }).getByText('3 of 3 players joined').waitFor();

  // ---------- Counting ----------
  const took = {};
  let part = null;
  const begin = async (name) => {
    part = name;
    took[name] = { keys: 0, clicks: 0, typed: 0 };
    if (shots) await host.screenshot({ path: `${shots}/fullshow-${how}-${String(Object.keys(took).length).padStart(2, '0')}.png` });
  };
  /** Where it got to (when a wait runs out). */
  const where = async () => {
    const status = (await host.locator('.panel .status').innerText().catch(() => '?')).replace(/\s+/g, ' ');
    const main = (await mainButton(host).count()) ? await mainLabel(host) : '(none)';
    const toast = (await host.locator('.toast').allInnerTexts().catch(() => [])).join(' / ');
    return `main button “${main}”, status “${status}”${toast ? `, toast “${toast}”` : ''}`;
  };
  /** Waits for the state `what` describes (`check` holds), or fails saying which step didn't bring it. */
  const until = async (what, check, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await check()) return;
    throw new Error(`${part}: ${what} never came (${await where()})`);
  };
  const label = async () => ((await mainButton(host).count()) ? await mainLabel(host) : '');
  const mainIs = (l) => async () => (await label()) === l;
  const noMain = async () => (await mainButton(host).count()) === 0;
  const statusHas = (t) => async () => (await host.locator('.panel .status').innerText()).includes(t);
  const stageHas = (sel) => async () => (await host.locator(`.stage-box ${sel}`).count()) > 0;
  const marked = async () => (await host.locator('.panel .mark.right').count()) === 1;
  /** A wheel spinning, or landed already. */
  const spun = async () => ['Spin again', 'Close'].includes(await label());
  /** A key, then the state it brings. */
  const key = async (k, what, check) => {
    took[part].keys++;
    await host.keyboard.press(k);
    if (check) await until(`${k}: ${what}`, check);
  };
  /** A number typed into the box the keys are in. */
  const type = async (t) => {
    took[part].typed++;
    await host.keyboard.type(String(t));
  };
  /** A click on this, then the state it brings. */
  const click = async (loc, what, check) => {
    took[part].clicks++;
    await loc.click();
    if (check) await until(`a click: ${what}`, check);
  };
  let lastStage = 0;
  /** A click mid-stage (or on `loc` there: a tile), a moment after the one before, then the state it brings. */
  const stageClick = async (what, check, loc = host.locator('.stage-box')) => {
    const wait = lastStage + STAGE_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    await click(loc, `on the stage: ${what}`, check);
    lastStage = Date.now();
  };
  /** A click on the main button while it says `l`, then the state it brings. */
  const main = async (l, what, check) => {
    await until(`the main button saying ${l}`, mainIs(l));
    await click(mainButton(host), `${l}: ${what}`, check);
  };
  const tile = (name) => host.locator(`.stage-box .tile[aria-label^="${name}"]`);
  /** Where the board's keys are (the tile they're on). */
  const keysOn = (name) => async () => (await host.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).startsWith(name);
  /** A phone buzzes in once its buzzer is open: the host has them answering. */
  const buzz = async (name) => {
    const p = phones[name];
    await p.locator('#buzz-big', { hasText: 'BUZZ!' }).waitFor();
    await p.locator('#buzz').dispatchEvent('pointerdown');
    await until(`${name} answering`, async () => (await host.locator('.panel .p .sel[aria-pressed="true"]').allInnerTexts()).some((t) => t.includes(name)));
  };
  const award = host.locator('.panel .award button.good');
  const gotIt = host.locator('.panel [data-partner-judge]').getByRole('button', { name: /^✔ Got it/ });
  /** A score: on the stage's plates, or (at the end) on the panel's chips. */
  const scoreOf = async (name) => {
    const plate = host.locator('.stage-box .plate', { hasText: name });
    const t = (await plate.count()) ? await plate.first().innerText() : await host.locator(`.panel .p[aria-label="${name}"] .score`).innerText();
    return Number(t.replace(/[^\d-]/g, '') || 0);
  };
  /** The answer (R, or a click on the stage), then the board (Esc, or a click), or what `check` says comes next. */
  const answerThenBoard = async (check = noMain) => {
    if (byKeys) {
      await key('r', 'the answer', mainIs('▦ Done ▶ board'));
      await key('Escape', 'the board', check);
    } else {
      await stageClick('the answer', mainIs('▦ Done ▶ board'));
      await stageClick('the board', check);
    }
  };

  // ---------- Start, and the round intro ----------
  await begin('Start and the round intro');
  if (byKeys) {
    await key('Control+Enter', 'the round’s title card', mainIs('Show board ▶'));
    await key('n', 'the categories’ reveal', mainIs('Reveal category 1 of 2 ▶'));
    await key('n', 'the first category', mainIs('Reveal category 2 of 2 ▶'));
    await key('n', 'the board', noMain);
  } else {
    await click(host.getByRole('button', { name: 'Start game ▶' }), 'the round’s title card', mainIs('Show board ▶'));
    await stageClick('the categories’ reveal', mainIs('Reveal category 1 of 2 ▶'));
    await stageClick('the first category', mainIs('Reveal category 2 of 2 ▶'));
    await stageClick('the board', noMain);
  }
  assert(true, 'started, and the round intro played');

  // ---------- A clue a phone buzzes in on ----------
  await begin('A clue a phone buzzes in on');
  if (byKeys) {
    await until('the keys on the first tile', keysOn('Memes for $200'));
    await key('Enter', 'the clue', mainIs('👁 Reveal answer'));
    await buzz('Ann');
    await key('Enter', 'Ann’s points', marked);
  } else {
    await stageClick('the clue', mainIs('👁 Reveal answer'), tile('Memes for $200'));
    await buzz('Ann');
    await click(award, 'Ann’s points', marked);
  }
  await answerThenBoard();
  assert((await scoreOf('Ann')) === 200, 'Ann buzzed in and got it ($200)');

  // ---------- A Daily Double: Ann (who picks now) wagers $300 ----------
  await begin('A Daily Double');
  if (byKeys) {
    await key('ArrowDown', 'the keys on the Daily Double', keysOn('Memes for $400'));
    await key('Enter', 'its wager box', () => host.evaluate(() => !!document.activeElement?.closest('.panel .dd')));
    await type(300);
    await key('Enter', 'its question', mainIs('👁 Reveal answer'));
    await sleep(KEY_GUARD);
    await key('Enter', 'Ann’s points', marked);
  } else {
    await stageClick('its wager screen', mainIs('Show question ▶'), tile('Memes for $400'));
    const ann = phones.Ann;
    await ann.locator('#wager-form').waitFor();
    await ann.locator('#wager-in').fill('300');
    await ann.locator('#wager-send').click();
    await until('Ann’s wager from her phone', async () => (await host.locator('.panel .dd [data-dd-phone]', { hasText: '📱 from phone' }).count()) === 1);
    await main('Show question ▶', 'its question', mainIs('👁 Reveal answer'));
    await click(award, 'Ann’s points', marked);
  }
  await answerThenBoard();
  assert((await scoreOf('Ann')) === 500, 'Ann wagered $300 on the Daily Double and got it ($500)');

  // ---------- A wheel tile: its wheel, then its question (Bob buzzes in) ----------
  await begin('A wheel tile');
  if (byKeys) {
    await key('ArrowDown', 'the keys on the wheel tile', keysOn('Memes for $600'));
    await key('Enter', 'its wheel', mainIs('Spin!'));
    await key('w', 'the wheel landing', mainIs('Close'));
    await key('Escape', 'its question', mainIs('👁 Reveal answer'));
    await buzz('Bob');
    await key('Enter', 'Bob’s points', marked);
  } else {
    await stageClick('its wheel', mainIs('Spin!'), tile('Memes for $600'));
    await stageClick('the wheel spinning', spun);
    await until('the wheel landing', mainIs('Close'));
    await stageClick('its question', mainIs('👁 Reveal answer'));
    await buzz('Bob');
    await click(award, 'Bob’s points', marked);
  }
  await answerThenBoard();
  assert((await scoreOf('Bob')) === 600, 'the wheel spun, then Bob buzzed in on its question and got it ($600)');

  // ---------- A partner clue: Bob picked it, the wheel picks his partner, the card goes to their phone ----------
  await begin('A partner clue, its card to a phone');
  const partnerUp = async () => (await stageHas('[data-partner-up]')()) && (await mainIs('🎡 Spin for a partner')());
  if (byKeys) {
    await key('ArrowRight', 'the keys across the board', keysOn('Movies for $600'));
    await key('ArrowUp', 'the keys up', keysOn('Movies for $400'));
    await key('ArrowUp', 'the keys on the partner clue', keysOn('Movies for $200'));
    await key('Enter', 'PARTNER UP!', partnerUp);
    await key('w', 'the partner wheel landing', mainIs('Close'));
    await key('Enter', 'the wheel closed onto the pair', mainIs('▶ Show question'));
    await key('Enter', 'its question', mainIs('📤 Send and start'));
    await sleep(KEY_GUARD);
    await key('Enter', 'the card sent and the clock started', mainIs('👁 Reveal answer'));
    await sleep(KEY_GUARD);
    await key('Enter', '✔ Got it', statusHas('judged'));
  } else {
    await stageClick('PARTNER UP!', partnerUp, tile('Movies for $200'));
    await main('🎡 Spin for a partner', 'the partner wheel spinning', spun);
    await until('the partner wheel landing', mainIs('Close'));
    await stageClick('the wheel closed onto the pair', mainIs('▶ Show question'));
    await main('▶ Show question', 'its question', mainIs('📤 Send and start'));
    // (A click within a second of the question sends nothing, as Enter does.)
    await sleep(KEY_GUARD);
    await main('📤 Send and start', 'the card sent and the clock started', mainIs('👁 Reveal answer'));
    await click(gotIt, '✔ Got it', statusHas('judged'));
  }
  await answerThenBoard();
  const partner = (await scoreOf('Ann')) === 700 ? 'Ann' : 'Cat';
  assert((await scoreOf('Bob')) === 700 && (await scoreOf(partner)) === (partner === 'Ann' ? 700 : 200), `Bob and his partner (${partner}, the wheel’s pick, the card on their phone) got it`);

  // ---------- A partner clue with no cards: Bob picked it, Cat is his partner (picked by hand) ----------
  await begin('A partner clue with no cards, the partner picked by hand');
  if (byKeys) {
    await key('ArrowDown', 'the keys on the partner clue', keysOn('Movies for $400'));
    await key('Enter', 'PARTNER UP!', partnerUp);
    await key('3', 'Cat the partner', mainIs('▶ Show question'));
    await key('Enter', 'its question, the clock started', mainIs('👁 Reveal answer'));
    await sleep(KEY_GUARD);
    await key('Enter', '✔ Got it', statusHas('judged'));
  } else {
    await stageClick('PARTNER UP!', partnerUp, tile('Movies for $400'));
    await click(host.locator('.panel [data-partner-panel]').getByRole('button', { name: 'Cat is the partner', exact: true }), 'Cat the partner', mainIs('▶ Show question'));
    await main('▶ Show question', 'its question, the clock started', mainIs('👁 Reveal answer'));
    await click(gotIt, '✔ Got it', statusHas('judged'));
  }
  await answerThenBoard(mainIs('Next round ▶'));
  assert((await scoreOf('Bob')) === 900, 'Bob and Cat got it, and the board is played out');
  const scores = Object.fromEntries(await Promise.all(NAMES.map(async (p) => [p, await scoreOf(p)])));

  // ---------- The played-out board: Next round ▶ (only its button goes on) ----------
  await begin('The played-out board');
  await sleep(NEW_ROW);
  await main('Next round ▶', 'the slides round', mainIs('Next slide ▶'));

  // ---------- A slides round: three slides, then on ----------
  await begin('A slides round');
  const pips = (t) => async () => (await host.locator('.stage-box [data-slide-pips]').getAttribute('aria-label').catch(() => '')) === t;
  const titleCard = stageHas('.title-card');
  // (A host looks at the first slide: the round's ▶ takes no press within a moment of it.)
  await sleep(NEW_ROW);
  if (byKeys) {
    await key('n', 'its second slide', pips('Slide 2 of 3'));
    await key('n', 'its last slide', pips('Slide 3 of 3'));
    await key('n', 'the board game’s title card', titleCard);
  } else {
    await stageClick('its second slide', pips('Slide 2 of 3'));
    await stageClick('its last slide', pips('Slide 3 of 3'));
    await stageClick('the board game’s title card', titleCard);
  }

  // ---------- A board-game turn (roll, move, next turn), then on to the Final ----------
  await begin('A board-game turn, then leaving the round');
  const rolled = async () => (await label()).startsWith('▶ Move');
  if (byKeys) {
    await key('n', 'the board', mainIs('🎲 Roll'));
    await key('d', 'the dice landing', rolled);
    await key('Enter', 'Ann’s token moving', mainIs('Next turn ▶'));
    await key('n', 'Bob’s turn', mainIs('🎲 Roll'));
  } else {
    await stageClick('the board', mainIs('🎲 Roll'));
    await main('🎲 Roll', 'the dice rolling', async () => !(await mainIs('🎲 Roll')()));
    await until('the dice landing', rolled);
    await click(mainButton(host), 'Ann’s token moving', mainIs('Next turn ▶'));
    await main('Next turn ▶', 'Bob’s turn', mainIs('🎲 Roll'));
  }
  await sleep(NEW_ROW);
  await click(host.locator('.rn button.next'), 'leaving asks first', async () => (await confirmStrip(host).count()) > 0);
  await sleep(NEW_ROW);
  await click(confirmStrip(host).getByRole('button', { name: 'Yes', exact: true }), 'the Final’s title card', mainIs('Start the round ▶'));

  // ---------- The Final: the leader wagers what makes a tie and misses it, the others wager nothing ----------
  await begin('The Final');
  const [lead, second] = [...NAMES].sort((a, b) => scores[b] - scores[a]);
  const wagers = Object.fromEntries(NAMES.map((p) => [p, p === lead ? scores[lead] - scores[second] : 0]));
  const wagerScreen = async () => (await host.locator('.fj .wagers').count()) > 0;
  if (byKeys) {
    await key('n', 'the wagers', wagerScreen);
    await key('n', 'the keys in the first wager box', () => host.evaluate(() => !!document.activeElement?.matches('input[data-wager]')));
    for (const [i, p] of NAMES.entries()) {
      await until(`the keys in ${p}’s wager box`, async () => (await host.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')) === `${p}’s wager`);
      await type(wagers[p]);
      // (Enter goes on to the next box; the last one's shows the question.)
      await key('Enter', i < NAMES.length - 1 ? 'the next wager box' : 'the question', i < NAMES.length - 1 ? null : mainIs('Reveal answer ▶'));
    }
    await key('r', 'the answer', mainIs('Start player reveals ▶'));
    await key('n', 'the reveals', mainIs('Show wager ▶'));
  } else {
    await stageClick('the wagers', wagerScreen);
    for (const p of NAMES) {
      const ph = phones[p];
      await ph.locator('#wager-form').waitFor();
      await ph.locator('#wager-in').fill(String(wagers[p]));
      await ph.locator('#wager-send').click();
      await ph.locator('#wager-state', { hasText: '✔ Sent' }).waitFor();
    }
    await main('Show question ▶', 'the question', mainIs('Reveal answer ▶'));
    await stageClick('the answer', mainIs('Start player reveals ▶'));
    await stageClick('the reveals', mainIs('Show wager ▶'));
  }
  const judging = async () => /^✔ \w+ right$/.test(await label());
  for (let i = 0; i < NAMES.length; i++) {
    if (byKeys) await key('n', 'their wager', judging);
    else await main('Show wager ▶', 'their wager', judging);
    const who = (await label()).split(' ')[1];
    const last = i === NAMES.length - 1;
    const next = mainIs(last ? 'Finish game ▶' : 'Next player ▶');
    if (byKeys) await key(who === lead ? 'x' : 'c', `${who} judged`, next);
    else await click(who === lead ? host.locator('.panel [data-next-also]', { hasText: '✘ Wrong' }) : mainButton(host), `${who} judged`, next);
    if (last) break;
    if (byKeys) await key('n', 'the next player', mainIs('Show wager ▶'));
    else await main('Next player ▶', 'the next player', mainIs('Show wager ▶'));
  }
  const armed = async () => (await host.locator('.fj .armed').count()) > 0;
  const over = statusHas('Game over');
  // (N once more says everyone is judged: again to finish. The button finishes at once.)
  if (byKeys) {
    await key('n', 'N again to finish', armed);
    await key('n', 'the end screen', over);
  } else await main('Finish game ▶', 'the end screen', over);
  const tied = [lead, second].sort((a, b) => NAMES.indexOf(a) - NAMES.indexOf(b));
  assert((await scoreOf(lead)) === scores[second], `the Final played: ${lead} missed it, and ${tied.join(' and ')} tie for first`);

  // ---------- A tie at the end: the tiebreaker clue ----------
  await begin('A tie at the end: the tiebreaker clue');
  const winner = tied[0];
  const settled = statusHas(`${winner} won the tiebreaker`);
  await main('❓ Tiebreaker clue', 'the tiebreaker clue', mainIs('👁 Reveal answer'));
  if (byKeys) {
    await key('r', 'its answer', mainIs('🏁 Back to results'));
    await key(String(NAMES.indexOf(winner) + 1), `${winner} picked`, async () => (await host.locator('.panel .p .sel[aria-pressed="true"]').count()) === 1);
    await key('Enter', `${winner} the winner`, settled);
    await key('n', 'the results', over);
  } else {
    await stageClick('its answer', mainIs('🏁 Back to results'));
    await click(host.locator('.panel .p', { hasText: winner }).locator('.sel'), `${winner} picked`, async () => (await host.locator('.panel .p .sel[aria-pressed="true"]').count()) === 1);
    await click(award, `${winner} the winner`, settled);
    await main('🏁 Back to results', 'the results', over);
  }
  assert(true, `${winner} won the tiebreaker, and the show is over`);
  await ctx.close();
  return took;
}

try {
  const runs = { keys: await show('keys'), clicks: await show('clicks') };
  // ---------- Nothing took more than today ----------
  for (const how of ['keys', 'clicks']) {
    console.log(`\nBy ${how} (keys · clicks · numbers typed; today's in brackets where it differs):`);
    for (const [name, now] of Object.entries(runs[how])) {
      const was = TODAY[how][name];
      const same = was && was.keys === now.keys && was.clicks === now.clicks && was.typed === now.typed;
      console.log(`  ${name.padEnd(58)} ${now.keys} · ${now.clicks} · ${now.typed}${same ? '' : `  [${was ? `${was.keys} · ${was.clicks} · ${was.typed}` : 'none'}]`}`);
    }
  }
  console.log('');
  for (const how of ['keys', 'clicks'])
    for (const [name, now] of Object.entries(runs[how])) {
      const was = TODAY[how][name];
      assert(!!was && was.keys === now.keys && was.clicks === now.clicks && was.typed === now.typed, `by ${how}, ${name}: ${now.keys} keys, ${now.clicks} clicks and ${now.typed} typed, as today`);
    }
  assert(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log('\nfullshow: all checks passed');
} finally {
  await browser.close();
  stop();
}
