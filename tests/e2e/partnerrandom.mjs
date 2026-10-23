// 🤝 Partner clues placed at random, and a steal on one of them (docs/PARTNER-CLUES-SPEC.md §5.1, §8.3, §21, milestone
// P4). The board has a partner clue made by hand (Movies $200, "No steal"), three written tiles, a ✍ tile and a tile
// with no answer. In the editor the 🤝 Partner clues box asks for 2: 🔀 Randomize places 2, never on the ✍ tile or the
// one with no answer; Ctrl+Z puts the one made by hand back where it was, Ctrl+Y brings back the very same placement,
// and Ctrl+Z again leaves one for Start. ⚖ Game rules' "A miss on a partner clue lets the others steal it" is ticked.
// Start game places the missing partner clue and the Daily Double (one toast, never the same tile), the partner clue
// with a copy of the tile's answer as its card. Then, against the real buzzer room (buzzer/ under `wrangler dev`, local)
// with four phones and one window (the buzzers open when the host presses U): the clue made by hand misses with no
// steal; the placed one goes to Bob's phone with its answer when sent (nobody else's, never on the host page before
// Reveal), Ann misses, the buzzers open at once for Cat and Dan, Cat buzzes and misses, the buzzers open for Dan alone,
// Dan steals it. Ctrl+Z three times takes back Dan's steal, Cat's miss and Ann's miss (the steal closes, the phones grey
// out); Ctrl+Y three times brings them all back. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openGameFile, openRules, recordSeen, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** Waits (up to `ms`) until pred() holds. */
const until = async (pred, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await pred()) return true;
  return !!(await pred());
};

// ---------- The game: Movies, Songs, Games at $200 and $400 ----------
let n = 0;
const text = (t, y = 90) => ({ id: `t${n++}`, kind: 'text', text: t, x: 120, y, w: 1680, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...els) => ({ background: {}, elements: els });
const values = [200, 400];
// Each tile's answer carries "Ans-kq<c><r>": a placed partner clue's card is a copy of it, never on the host page before Reveal.
const answer = (c, r) => `Ans-kq${c}${r}`;
const clue = (c, r) => {
  const base = { id: `q${c}_${r}`, value: null, type: 'standard', questionSlide: slide(text(`Clue ${c}-${r}`)), answerSlide: slide(text(answer(c, r))) };
  // Movies $200: a partner clue made by hand, with its own card, that lets nobody steal it.
  if (c === 0 && r === 0)
    return {
      ...base,
      type: 'partner',
      partner: { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game', steal: false },
      timerSeconds: 45,
      cards: [{ id: 'card1', to: 'giver', ...slide(text('Shrek-kq')) }],
    };
  // Songs $400: everyone answers on their phone (✍). Games $400: no answer written. Neither can be a partner clue.
  if (c === 1 && r === 1) return { ...base, everyone: true };
  if (c === 2 && r === 1) return { ...base, answerSlide: slide() };
  return base;
};
const game = {
  id: 'g_partner_random', version: 2, title: 'Partner clues at random',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    // (The buzzers open when the host presses U: a steal opens them at once all the same, the question already read.)
    buzzArm: 'host',
  },
  players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
  rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 1, categories: ['Movies', 'Songs', 'Games'].map((title, c) => ({ id: `cat${c}`, title, clues: values.map((_, r) => clue(c, r)) })) }],
  media: [], audio: {}, wheels: [], dice: [], theme: {},
};
const gameFile = resolve('test-results/partner-random.json');
writeFileSync(gameFile, JSON.stringify(game));

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-partnerrandom-');
const { base } = buzzer;
let browser;
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  return p;
};

try {
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  await ctx.addInitScript(recordSeen);
  const host = watch(await ctx.newPage(), 'host');
  host.setDefaultTimeout(20000);
  const states = [];
  host.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(f.payload);
        if (m.t === 'state') states.push(m.state);
      } catch {
        // not JSON
      }
    }),
  );
  const last = () => states.at(-1);
  /** The host page showed `t` (a toast that came and went included: recordSeen). */
  const toast = (t) => until(async () => (await shownOf(host, [t])).length === 1, 10000);
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- The editor: 🔀 Randomize, Ctrl+Z, Ctrl+Y ----------
  console.log('Editor:');
  /** The board's partner clues, by "category,row". */
  const partnerTiles = () =>
    host.locator('[data-tile]').evaluateAll((els) => els.filter((e) => e.querySelector('[title^="Partner clue: played by"]')).map((e) => e.dataset.tile).sort());
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clueDialog = host.getByRole('dialog', { name: 'Edit clue' });
  /** Undo and Redo show where the step was: a step that changed one tile opens its editor, closed here. */
  const shut = async () => {
    if (!(await clueDialog.waitFor({ timeout: 1500 }).then(() => true, () => false))) return;
    await host.keyboard.press('Escape');
    await clueDialog.waitFor({ state: 'detached' });
  };
  assert(same(await partnerTiles(), ['0,0']), 'the board has its partner clue made by hand: Movies $200');
  const count = host.getByLabel('How many partner clues');
  await count.fill('2');
  await count.press('Tab');
  const group = host.locator('[data-partner-count]');
  assert((await group.innerText()).includes('1 placed (Start places 1 at random)'), 'the box asks for 2: one placed, Start places 1');
  await group.getByRole('button', { name: 'Randomize partner clues' }).click();
  assert(await toast('Placed 2 partner clues at random'), '🔀 Randomize places 2');
  const placed = await partnerTiles();
  assert(placed.length === 2 && placed.every((t) => ['0,0', '0,1', '1,0', '2,0'].includes(t)), `on written tiles, never the ✍ tile or the one with no answer (${placed.join(' and ')})`);
  await host.keyboard.press('Control+z');
  assert(await until(async () => same(await partnerTiles(), ['0,0'])), 'Ctrl+Z: the one made by hand is back where it was, alone');
  await shut();
  await host.keyboard.press('Control+y');
  assert(await until(async () => same(await partnerTiles(), placed)), `Ctrl+Y: the very same placement comes back (${placed.join(' and ')}), not another`);
  await shut();
  await host.keyboard.press('Control+z');
  assert(await until(async () => same(await partnerTiles(), ['0,0'])), 'Ctrl+Z again: one placed, for Start to place the other');
  await shut();
  assert((await group.innerText()).includes('1 placed (Start places 1 at random)'), 'the box says so');

  // ---------- The pre-game: steals on, as a game rule; the room; four phones ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  assert(await host.getByText('🤝 1 partner clue not placed yet: Start puts it on the board at random').isVisible(), 'the Start bar says 1 partner clue isn’t placed yet');
  const rules = await openRules(host);
  const stealRule = rules.getByRole('checkbox', { name: 'A miss on a partner clue lets the others steal it' });
  assert(!(await stealRule.isChecked()), '⚖ Game rules: steals start off');
  await stealRule.check();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(roomCard);
  const phones = {};
  const heard = {};
  for (const seat of ['Ann', 'Bob', 'Cat', 'Dan']) {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), seat);
    p.setDefaultTimeout(20000);
    heard[seat] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[seat].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat, exact: true }).click();
    await p.locator('#me').getByText(seat).waitFor();
    phones[seat] = p;
  }

  // ---------- Start game: the missing partner clue and the Daily Double go on, one toast, never one tile ----------
  console.log('Start game:');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  assert(
    await toast('🤝 Placed 1 partner clue at random in Round 1 · ⭐ Placed 1 Daily Double at random in Round 1'),
    'one toast for both: 🤝 1 partner clue and ⭐ 1 Daily Double placed at random',
  );
  // (What Start placed, as the game in progress keeps it: the stage doesn't say which tiles are what.)
  const savedGame = async () => (await stored(host))?.game ?? null;
  let board = null;
  assert(await until(async () => (board = (await savedGame())?.rounds?.[0])?.categories?.flatMap((c) => c.clues).filter((cl) => cl.type === 'partner').length === 2), 'the game in progress has 2 partner clues');
  const all = board.categories.flatMap((c, ci) => c.clues.map((cl, r) => ({ ...cl, at: `${ci},${r}`, ci, r })));
  const extra = all.find((cl) => cl.type === 'partner' && cl.id !== 'q0_0');
  const dd = all.filter((cl) => cl.type === 'dailyDouble');
  assert(['0,1', '1,0', '2,0'].includes(extra.at), `the new one is on a written tile (${extra.at})`);
  assert(dd.length === 1 && dd[0].id !== extra.id && dd[0].id !== 'q0_0', `the Daily Double is on a tile of its own (${dd[0]?.at})`);
  const cardWords = extra.cards?.[0]?.elements?.map((e) => e.text).join(' ') ?? '';
  assert(extra.partner?.game === 'describe' && extra.partner.steal === undefined && cardWords === answer(extra.ci, extra.r), `it plays Describe it, follows the game’s rule on steals, and its card is a copy of its answer (${cardWords})`);
  const value = values[extra.r];

  const big = (who) => phones[who].locator('#buzz-big').innerText().catch(() => '');
  const small = (who) => phones[who].locator('#buzz-small').innerText().catch(() => '');
  const IDS = { Ann: 'p1', Bob: 'p2', Cat: 'p3', Dan: 'p4' };
  const scoreOf = async (name) => (await host.locator(`.panel .players [data-player-id="${IDS[name]}"] .score`).innerText()).trim();
  const panel = host.locator('.panel [data-partner-panel]');
  const stealRow = panel.locator('[data-partner-steal]');
  const lockedOut = () => [...(last()?.lockedOut ?? [])].sort().join(',');
  const money = (v) => (v < 0 ? `−$${-v}` : `$${v}`);
  /** Ann picks the tile, Bob is her partner (2), the question shows, the cards go and the clock starts. */
  const play = async (id) => {
    await host.keyboard.press('p');
    await host.keyboard.press('1');
    await host.locator(`.stage-box .tile[data-clue="${id}"]`).click();
    await host.locator('.stage-box [data-partner-up]').waitFor();
    await host.keyboard.press('2');
    await host.keyboard.press('Enter');
    await host.locator('.stage-box [data-partner-badge]').waitFor();
    // (A second Enter at once is held back: the double-Enter guard.)
    await sleep(1100);
    await host.keyboard.press('Enter');
    await host.locator('.stage-box .timer').waitFor();
    await sleep(1100);
  };

  // ---------- The partner clue made by hand: "No steal" wins over the game's rule ----------
  console.log('No steal:');
  await play('q0_0');
  await phones.Bob.getByRole('button', { name: 'Tap to see' }).waitFor();
  await host.keyboard.press('Shift+Enter');
  assert(await until(async () => (await scoreOf('Ann')) === '−$100'), '✘ Missed: Ann −$100');
  await sleep(800);
  assert(!(await stealRow.count()) && last()?.phase !== 'armed', 'its own “No steal” wins: no steal, the buzzers stay shut');
  assert((await phones.Cat.locator('#buzz').getAttribute('aria-disabled')) === 'true', 'Cat’s phone stays greyed');
  await host.keyboard.press('r');
  await host.keyboard.press('Escape');
  assert(await until(async () => !(await phones.Bob.locator('.card').count())), 'back on the board: Bob’s card goes');

  // ---------- The placed one: its card (the answer) to Bob's phone only, never on the host page ----------
  console.log('Steal on a miss:');
  await host.evaluate(() => (window.__seen.length = 0));
  const ANSWER = answer(extra.ci, extra.r);
  await play(extra.id);
  await phones.Bob.getByRole('button', { name: 'Tap to see' }).tap();
  await phones.Bob.locator('.card', { hasText: ANSWER }).waitFor();
  assert(['Ann', 'Cat', 'Dan'].every((s) => !heard[s].join('\n').includes(ANSWER)), 'the copy of its answer goes to Bob’s phone only (Ann guesses)');
  assert(!(await shownOf(host, [ANSWER])).length, 'one window: the host page never shows it');

  // ---------- Ann misses: the buzzers open for Cat and Dan ----------
  await host.keyboard.press('Shift+Enter');
  await stealRow.waitFor();
  assert(await until(async () => (await scoreOf('Ann')) === money(-100 - value / 2)), `✘ Missed: Ann −$${value / 2} more, ${money(-100 - value / 2)}`);
  assert((await stealRow.innerText()).includes('🔔 Steal!') && (await stealRow.innerText()).includes(`Enter: right +$${value}`), `the steal row: 🔔 Steal!, a right steal worth the tile’s $${value} (the game’s rule)`);
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2'), 'the buzzers open at once for the others (no U needed): Ann and Bob locked out');
  assert(await until(async () => (await big('Cat')) === 'BUZZ!' && (await big('Dan')) === 'BUZZ!'), 'Cat’s and Dan’s phones light up');
  assert((await small('Ann')).includes('had your go') && (await small('Bob')).includes('had your go'), 'Ann’s and Bob’s phones say they’ve had their go on this one');
  assert(['Cat', 'Dan'].every((s) => !heard[s].join('\n').includes(ANSWER)), 'the stealers never get the card');

  // ---------- Cat buzzes in and misses; Dan, alone, steals it ----------
  await phones.Cat.locator('#buzz').dispatchEvent('pointerdown');
  assert(await until(() => last()?.phase === 'answering' && last().answering === 'p3'), 'Cat buzzes in: Cat answers');
  await host.keyboard.press('Shift+Enter');
  assert(await until(async () => (await scoreOf('Cat')) === money(-value)), `Shift+Enter: Cat misses, ${money(-value)}`);
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2,p3'), 'the buzzers open for Dan alone');
  assert(await until(async () => (await big('Dan')) === 'BUZZ!' && (await small('Cat')).includes('had your go')), 'Dan’s phone lights up, Cat’s says she’s had her go');
  await phones.Dan.locator('#buzz').dispatchEvent('pointerdown');
  assert(await until(() => last()?.phase === 'answering' && last().answering === 'p4'), 'Dan buzzes in');
  await host.keyboard.press('Enter');
  assert(await until(async () => (await scoreOf('Dan')) === money(value)), `Enter: Dan steals it, ${money(value)}`);
  assert(await until(async () => (await stealRow.innerText()).includes('🔔 Dan stole it')), 'the panel: “🔔 Dan stole it”');
  assert(await until(() => last()?.phase === 'closed' && last().done?.by === 'p4'), 'the buzzers close');
  await host.screenshot({ path: 'test-results/partner-random-steal.png' });

  // ---------- Ctrl+Z three times: Dan's steal, Cat's miss, Ann's miss ----------
  console.log('Undo, redo:');
  const scores = async () => Promise.all(['Ann', 'Bob', 'Cat', 'Dan'].map(scoreOf)).then((s) => s.join(' '));
  const after = await scores();
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await scoreOf('Dan')) === '$0' && last()?.phase === 'answering' && last().answering === 'p4'), 'Ctrl+Z: Dan’s steal goes, Dan answering again');
  assert((await stealRow.innerText()).includes('🔔 Steal!'), 'the steal is open again');
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await scoreOf('Cat')) === '$0' && last()?.phase === 'answering' && last().answering === 'p3'), 'Ctrl+Z: Cat’s miss goes, Cat answering again');
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await scoreOf('Ann')) === '−$100' && !(await stealRow.count())), 'Ctrl+Z: Ann’s miss goes (her −$100 from the first clue stays), and the steal closes');
  assert(await until(async () => last()?.phase === 'lobby' && (await phones.Cat.locator('#buzz').getAttribute('aria-disabled')) === 'true'), 'the phones are greyed again: nobody buzzes while the two play it');
  assert(await panel.getByRole('button', { name: /✔ Got it/ }).isEnabled(), 'the judge buttons are back');
  await host.keyboard.press('Control+y');
  assert(await until(async () => (await scoreOf('Ann')) === money(-100 - value / 2) && (await stealRow.count()) === 1), 'Ctrl+Y: Ann’s miss again, and the steal opens');
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2'), 'the buzzers open for Cat and Dan again');
  await host.keyboard.press('Control+y');
  assert(await until(async () => (await scoreOf('Cat')) === money(-value)), 'Ctrl+Y: Cat’s miss again');
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2,p3'), 'the buzzers open for Dan alone again');
  await host.keyboard.press('Control+y');
  assert(await until(async () => (await scores()) === after), `Ctrl+Y: Dan’s steal again: every score as it was (${after})`);
  assert(await until(async () => (await stealRow.innerText()).includes('🔔 Dan stole it')), 'the panel: “🔔 Dan stole it” again');
  assert(await until(() => last()?.phase === 'closed' && last().done?.by === 'p4'), 'and the buzzers are closed on Dan’s steal');

  // ---------- The answer up, back to the board ----------
  await host.keyboard.press('r');
  await host.keyboard.press('Escape');
  assert(await until(() => last()?.phase === 'lobby' && !last().lockedOut.length), 'back on the board: nobody locked out');
  assert(await until(async () => !(await phones.Bob.locator('.card').count())), 'Bob’s card goes with the tile');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner random E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
