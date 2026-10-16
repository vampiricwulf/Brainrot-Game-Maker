// 🤝 Partner clues, milestone P4 (docs/PARTNER-CLUES-SPEC.md §8.3, §21): steal on a miss and partner clues placed at
// random. In the editor, a partner clue's "After a miss" lets the others steal it; the board's 🤝 Partner clues box with
// 🔀 Randomize scatters them over written tiles (one undo step), and the pre-game's 🎲 Place now puts the missing one on
// the board, in the editor's copy too. Then, against the real buzzer room (buzzer/ under `wrangler dev`, local) with four
// phones: ✘ Missed opens the buzzers for the two others only (the stream says "Steal!"), Cat buzzes in and steals it,
// Ctrl+Z takes the steal back (Cat answering again), Ctrl+Z again takes the miss back and closes the steal (the phones
// greyed again), Ctrl+Y opens it again, Dan (chosen by the host) answers it through a host reload, misses, and the
// buzzers open for Cat alone; showing the answer ends it. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openGameFile, startBuzzer } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** Waits (up to `ms`) until pred() holds. */
const until = async (pred, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
  return !!(await pred());
};

// ---------- The game: Movies, Songs, Games, every tile written; Movies $400 a Describe it partner clue ----------
let n = 0;
const text = (t, y = 90) => ({ id: `t${n++}`, kind: 'text', text: t, x: 120, y, w: 1680, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...els) => ({ background: {}, elements: els });
const values = [200, 400, 600];
const clue = (c, r) => {
  const base = { id: `q${c}_${r}`, value: null, type: 'standard', questionSlide: slide(text(`Clue ${c}-${r}`)), answerSlide: slide(text(`Answer ${c}-${r}`)) };
  if (c !== 0 || r !== 1) return base;
  return {
    ...base,
    type: 'partner',
    partner: { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' },
    timerSeconds: 45,
    questionSlide: slide(text('Describe this movie!')),
    cards: [{ id: 'card1', to: 'giver', ...slide(text('Shrek')) }],
  };
};
const game = {
  id: 'g_partner_steal', version: 2, title: 'Partner steals',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
  rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 0, categories: ['Movies', 'Songs', 'Games'].map((title, c) => ({ id: `cat${c}`, title, clues: values.map((_, r) => clue(c, r)) })) }],
  media: [], audio: {}, wheels: [], dice: [], theme: {},
};
const gameFile = resolve('test-results/partner-steal.json');
writeFileSync(gameFile, JSON.stringify(game));

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-steal-');
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
  const host = watch(await ctx.newPage(), 'host');
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
  const toast = (t) => host.locator('.toast', { hasText: t }).waitFor({ timeout: 4000 }).then(() => true, () => false);
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- In the editor: a partner clue's steal ----------
  console.log('Editor:');
  await host.locator('[data-tile="0,1"]').click();
  const dialog = host.getByRole('dialog', { name: 'Edit clue' });
  const settings = dialog.locator('details.partner-opts');
  const after = settings.getByRole('combobox', { name: /^After a miss/ });
  const summary = async () => (await settings.locator(':scope > summary .money').innerText()).replace(/\s+/g, ' ').trim();
  assert((await after.inputValue()) === 'game' && (await after.locator('option:checked').innerText()).includes('(no steal)'), 'a partner clue’s “After a miss” starts as ⚖ Game rules say (no steal)');
  await after.selectOption('on');
  assert((await summary()).endsWith('missed → guesser −$200, then a steal: $400'), `“The others can steal it”: the summary says what a steal is worth (${await summary()})`);
  await host.getByRole('button', { name: 'Done' }).click();
  await dialog.waitFor({ state: 'detached' });

  // ---------- 🤝 Partner clues on the board: 🔀 Randomize, one undo step ----------
  const badges = () => host.locator('[data-tile] [title^="Partner clue: played by"]').count();
  const isPartner = (cat, row) => host.locator(`[data-tile="${cat},${row}"] [title^="Partner clue: played by"]`).count().then((x) => x === 1);
  assert((await badges()) === 1, 'the board has its one partner clue made by hand');
  const count = host.getByLabel('How many partner clues');
  await count.fill('3');
  await count.press('Tab');
  const group = host.locator('[data-partner-count]');
  assert((await group.innerText()).includes('1 placed (Start places 2 at random)'), 'the box asks for 3: one placed, Start places 2');
  assert((await group.getByRole('combobox', { name: 'The game partner clues placed at random play' }).inputValue()) === 'describe', 'placed at random, they play Describe it (the round’s choice)');
  await group.getByRole('button', { name: 'Randomize partner clues' }).click();
  assert(await toast('Placed 3 partner clues at random'), '🔀 Randomize places 3');
  assert((await badges()) === 3, 'the board shows 3 partner clues');
  await host.screenshot({ path: 'test-results/partner-steal-board.png' });
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await badges()) === 1 && (await isPartner(0, 1))), 'Ctrl+Z takes them off in one step: the one made by hand is back where it was');
  await count.fill('2');
  await count.press('Tab');

  // ---------- The pre-game: 🎲 Place now puts the missing one on, in the editor's copy too ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  assert(await host.getByText('🤝 1 partner clue not placed yet: Start puts it on the board at random').isVisible(), 'the Start bar says 1 partner clue isn’t placed yet');
  const checks = host.locator('details.checks');
  await checks.locator('summary').click();
  const item = checks.locator('li', { hasText: 'Round 1: 1 partner clue not placed yet' });
  await item.getByRole('button', { name: '🎲 Place now' }).click();
  assert(await toast('Placed 1 partner clue in Round 1'), '🎲 Place now places it');
  assert(await until(async () => !(await host.getByText(/partner clue not placed yet/).count())), 'and nothing is left to place');
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  assert(await until(async () => (await badges()) === 2 && (await isPartner(0, 1))), 'the editor’s board has it too: 2 partner clues, Movies $400 still one');
  await host.getByRole('button', { name: '▶ Play' }).click();

  // ---------- Four phones, the room ----------
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  await roomCard.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = roomCard.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  const phones = {};
  for (const seat of ['Ann', 'Bob', 'Cat', 'Dan']) {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), seat);
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat, exact: true }).click();
    await p.locator('#me').getByText(seat).waitFor();
    phones[seat] = p;
  }
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  const big = (who) => phones[who].locator('#buzz-big').innerText().catch(() => '');
  const small = (who) => phones[who].locator('#buzz-small').innerText().catch(() => '');
  const IDS = { Ann: 'p1', Bob: 'p2', Cat: 'p3', Dan: 'p4' };
  const scoreOf = async (name) => (await host.locator(`.panel .players [data-player-id="${IDS[name]}"] .score`).innerText()).trim();
  const panel = host.locator('.panel [data-partner-panel]');
  const stealRow = panel.locator('[data-partner-steal]');
  const badge = host.locator('.stage-box [data-partner-badge]');
  const lockedOut = () => [...(last()?.lockedOut ?? [])].sort().join(',');

  // ---------- Ann picks Movies $400, Bob describes, Ann misses ----------
  console.log('Steal on a miss:');
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[data-clue="q0_1"]').click();
  await host.locator('.stage-box [data-partner-up]').waitFor();
  await host.keyboard.press('2');
  await host.keyboard.press('Enter');
  await badge.waitFor();
  await sleep(1100);
  await host.keyboard.press('Enter');
  await host.locator('.stage-box .timer').waitFor();
  assert(last()?.phase === 'lobby' && (await phones.Cat.locator('#buzz').getAttribute('aria-disabled')) === 'true', 'nobody buzzes while the two play it (every phone greyed)');
  await sleep(1100);
  await host.keyboard.press('Shift+Enter');
  await stealRow.waitFor();
  assert((await scoreOf('Ann')) === '−$200' && (await scoreOf('Bob')) === '$0', '✘ Missed: Ann −$200, Bob nothing');
  assert((await stealRow.innerText()).includes('🔔 Steal!') && (await stealRow.innerText()).includes('Enter: right +$400'), 'the panel: 🔔 Steal!, a right steal worth the tile’s $400');
  assert(await until(async () => (await badge.innerText()).replace(/\s+/g, ' ').trim() === '🔔 Steal! Bob and Ann missed it'), 'the stream: “🔔 Steal! Bob and Ann missed it”');
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2'), 'the buzzers open for the others: Ann and Bob locked out');
  assert(await until(async () => (await big('Cat')) === 'BUZZ!' && (await big('Dan')) === 'BUZZ!'), 'Cat’s and Dan’s phones light up: BUZZ!');
  assert((await small('Ann')).includes('already answered') && (await small('Bob')).includes('already answered'), 'Ann’s and Bob’s phones say they already answered this one');
  await host.screenshot({ path: 'test-results/partner-steal-open.png' });

  // ---------- Cat buzzes in and steals it ----------
  await phones.Cat.locator('#buzz').dispatchEvent('pointerdown');
  assert(await until(() => last()?.phase === 'answering' && last().answering === 'p3'), 'Cat buzzes in first: Cat answers');
  assert((await stealRow.getByRole('button', { name: 'Cat steals it' }).getAttribute('aria-pressed')) === 'true', 'the steal row shows Cat answering');
  await host.keyboard.press('Enter');
  assert(await until(async () => (await scoreOf('Cat')) === '$400'), 'Enter: Cat steals it, +$400');
  assert((await stealRow.innerText()).includes('🔔 Cat stole it'), 'the panel: “🔔 Cat stole it”');
  assert(await until(() => last()?.phase === 'closed' && last().done?.by === 'p3'), 'the buzzers close on Cat’s right answer');
  assert(await until(async () => (await host.locator('.panel .players .p.picker').getAttribute('aria-label')) === 'Cat'), 'Cat picks next');

  // ---------- Undo, redo ----------
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await scoreOf('Cat')) === '$0' && (await stealRow.innerText()).includes('🔔 Steal!')), 'Ctrl+Z takes the steal back: Cat $0, the steal open again');
  assert(await until(() => last()?.phase === 'answering' && last().answering === 'p3'), 'with Cat answering, as before');
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await scoreOf('Ann')) === '$0' && !(await stealRow.count())), 'Ctrl+Z again takes the miss back: Ann $0, and the steal closes with it');
  assert(await panel.getByRole('button', { name: /✔ Got it/ }).isEnabled(), 'the judge buttons are back');
  assert(await until(async () => last()?.phase === 'lobby' && (await phones.Cat.locator('#buzz').getAttribute('aria-disabled')) === 'true'), 'the phones are greyed again (nobody buzzes)');
  await host.keyboard.press('Control+y');
  assert(await until(async () => (await scoreOf('Ann')) === '−$200' && (await stealRow.count()) === 1), 'Ctrl+Y: the miss again, and the steal opens again');
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2'), 'the buzzers open for the others again');

  // ---------- The host picks Dan, who misses: the buzzers open for Cat alone ----------
  await stealRow.getByRole('button', { name: 'Dan steals it' }).click();
  assert(await until(() => last()?.phase === 'answering' && last().answering === 'p4'), 'the host picks Dan to steal it: Dan answers');

  // ---------- A host reload mid-steal: the steal, and who's answering it, come back ----------
  const before = states.length;
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  assert(
    await until(async () => (await stealRow.count()) === 1 && (await stealRow.getByRole('button', { name: 'Dan steals it' }).getAttribute('aria-pressed')) === 'true'),
    'a host reload keeps the steal open, Dan still answering it',
  );
  assert(await until(() => states.length > before && last()?.phase === 'answering' && last().answering === 'p4' && lockedOut() === 'p1,p2'), 'the room hears the same: Dan answering, Ann and Bob out');
  await host.locator('.panel [data-next]').focus();
  await host.keyboard.press('Shift+Enter');
  assert(await until(async () => (await scoreOf('Dan')) === '−$400'), 'Shift+Enter: Dan misses the steal, −$400');
  assert(await until(() => last()?.phase === 'armed' && lockedOut() === 'p1,p2,p4'), 'the buzzers open for the rest: Cat alone');
  assert(await until(async () => (await big('Cat')) === 'BUZZ!' && (await small('Dan')).includes('already answered')), 'Cat’s phone lights up again, Dan’s says he answered');
  assert(await stealRow.getByRole('button', { name: 'Dan steals it' }).isDisabled(), 'Dan’s steal chip is off now');
  await host.keyboard.press('r');
  assert(await until(async () => (await stealRow.innerText()).includes('🔔 Nobody stole it')), 'the answer up: “🔔 Nobody stole it”');
  assert(await until(() => last()?.phase === 'closed'), 'and the buzzers close');
  await host.keyboard.press('Escape');
  assert(await until(() => last()?.phase === 'lobby' && !last().lockedOut.length), 'back on the board: nobody locked out');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner steal E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
