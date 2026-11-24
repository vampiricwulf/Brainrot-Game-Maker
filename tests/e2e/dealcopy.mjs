// 🎭 Deals with no phone buzzers (docs/SPEC.md §6, docs/hosting.md "🎭 Deal…"), in one window (the host page is what
// viewers see). Its lists mark the ready-made Odd one out and Locations wheel as already in this game (it has its own
// copies). Dealt and ✔ handed out, the cards are copied to each player (📋), so there's no "Lasts" choice to make
// and ↩ Take the cards back says it only marks them; the next round leaves the deal handed out, its 📋 rows still there.
// Needs no buzzer room.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appFile, failureShots, launchChromium, leaveAnswer, openGameFile, recordSeen, stored } from './helpers.mjs';

const file = appFile();
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** Waits (up to `ms`) until pred() holds. */
const until = async (pred, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await pred()) return true;
  return !!(await pred());
};

let ids = 0;
const text = (t) => ({ id: `e${ids++}`, x: 100, y: 40, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1, kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...elements) => ({ background: {}, elements });
const plain = (id) => ({ id, value: null, type: 'standard', questionSlide: slide(text('A question')), answerSlide: slide(text('An answer')) });
const settings = {
  allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
  roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true },
};
const board = (id, name) => ({ id, name, mode: 'board', values: [200, 400], dailyDoubleCount: 0, categories: [{ id: `c_${id}`, title: 'Movies', clues: [plain(`${id}a`), plain(`${id}b`)] }] });

// The game: two rounds, three players, the ready-made Odd one out saved with its Locations wheel (as 📋 Ready-made deal…
// adds them).
const game = {
  id: 'g_dealcopy',
  version: 2,
  title: 'Deal copy night',
  settings,
  players: ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
  rounds: [board('r1', 'Round 1'), board('r2', 'Round 2')],
  media: [], audio: {}, dice: [], theme: {},
  wheels: [{ id: 'w_loc', name: 'Locations', segments: ['Beach', 'Zoo', 'Bank'].map((label, i) => ({ id: `s${i}`, label, color: '#e6194b', weight: 1 })), spinDurationMs: 3000, removeAfterLanding: false }],
  deals: [
    {
      id: 'deal1', name: 'Odd one out', wheel: 'w_loc',
      parts: [
        { id: 'spy', name: 'Spy', count: 1, card: slide(text('Work out the location')) },
        { id: 'vil', name: 'Villager', count: 'rest', draw: 'shared', card: slide(text('The location:')) },
      ],
    },
  ],
};
const gameFile = resolve('test-results/dealcopy.json');
writeFileSync(gameFile, JSON.stringify(game));

let browser;
const errors = [];

try {
  browser = await launchChromium();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.addInitScript(recordSeen);
  const host = await ctx.newPage();
  host.setDefaultTimeout(20000);
  host.on('pageerror', (e) => errors.push(e.message));
  host.on('dialog', (d) => (errors.push(`dialog: ${d.message()}`), d.accept()));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- In play, no phones ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  const tools = host.locator('.panel .toolsrow');
  const dealButton = tools.locator('[data-deal-tool]');
  const dialog = host.getByRole('dialog', { name: 'Deal' });
  const openDeal = async () => {
    if (!(await dialog.count())) await dealButton.click();
    await dialog.waitFor();
  };
  const closeDeal = async () => {
    await host.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  };

  // ---------- Dealt, handed out: nothing about phones ----------
  console.log('Copy mode:');
  await openDeal();
  // ---------- The lists mark a ready-made deal or wheel the game has its own copy of ----------
  const dealOptions = await dialog.getByRole('combobox', { name: 'The deal' }).locator('option').allInnerTexts();
  assert(
    dealOptions.includes('🎭 Odd one out') && dealOptions.includes('🕵 Odd one out · already in this game · One spy; everyone else knows the location') && dealOptions.filter((o) => o.includes('already in this game')).length === 1,
    `🎭 Deal…: the ready-made Odd one out says the game already has one, and no other (${dealOptions.join(' | ')})`,
  );
  const wheelOptions = await dialog.getByRole('combobox', { name: 'The wheel its cards draw from' }).locator('option').allInnerTexts();
  assert(
    wheelOptions.includes('Locations') && wheelOptions.includes('🗺 Locations · already in this game') && wheelOptions.filter((o) => o.includes('already in this game')).length === 1,
    `and so does the ready-made Locations wheel (${wheelOptions.join(' | ')})`,
  );
  await dialog.getByRole('combobox', { name: 'The deal' }).selectOption('saved:deal1');
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-counts]').waitFor();
  assert((await dialog.getByRole('radiogroup', { name: 'How long the cards last' }).count()) === 0, 'no phones: no “Lasts until the round ends / until I take them back” choice');
  await dialog.locator('[data-deal-send]').click();
  await dialog.locator('.hands').waitFor();
  const takeBack = dialog.locator('[data-deal-takeback]');
  const tip = await takeBack.getAttribute('title');
  assert(tip.includes('copied cards can’t be unsent') && !tip.includes('off the phones'), `↩ Take the cards back says it only marks them (“${tip}”)`);
  assert((await dealButton.getAttribute('data-deal-tool')) === 'handed out', 'the tools row: “Odd one out · handed out”');
  await closeDeal();

  // ---------- The next round: still handed out ----------
  await sleep(450); // the round buttons ignore clicks right after they appear
  await tools.getByRole('button', { name: 'Next round ▶' }).click();
  await leaveAnswer(host).waitFor();
  await sleep(500);
  await leaveAnswer(host).click();
  assert(await until(async () => (await stored(host))?.session?.currentRound === 1), 'Next round ▶: on to Round 2');
  assert(await until(async () => (await dealButton.getAttribute('data-deal-tool')) === 'handed out'), `past the round’s end the deal is still handed out (${await dealButton.getAttribute('data-deal-tool')})`);
  await openDeal();
  assert((await dialog.locator('.hands .row').count()) === 3 && (await takeBack.count()) === 1, 'its 📋 rows are still there for all three, with ↩ Take the cards back');
  await takeBack.click();
  assert(await until(async () => (await dealButton.getAttribute('data-deal-tool')) === 'cards back'), '↩ Take the cards back: “· cards back”');
  await closeDeal();

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('\nAll deal copy-mode checks passed.');
} catch (e) {
  await failureShots('dealcopy', browser);
  throw e;
} finally {
  await browser?.close();
}
