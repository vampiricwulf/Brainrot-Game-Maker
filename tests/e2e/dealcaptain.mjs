// 🧢 Team captain in one window with no phones (docs/PARTNER-CLUES-SPEC.md §12.2, §14.2, milestone P4): a deal with no
// part for "the rest" leaves most players without one, so who is on the list is the secret. Five players, no teams, no
// buzzer room, a 1280×720 window (the host page is what viewers see). In 🎭 Deal… the way on (🎭 Deal, ✔ Hand them out)
// stays in view at the foot of the menu, however long the parts are. Dealt and handed out, the panel lists all five
// dealt in, each with the same 📋 Copy and 🪟 buttons, and counts "Dealt to 5: Captain ×1"; the captain's 📋 copies their
// brief, everyone else's "no part for you this time". Dealt again until someone else is captain, the deal's window, the
// tools row, the stage, and everything the page showed or said on the way read the same, word for word. 🎭 Who was who
// goes on the stage; a click on it takes it off (Ctrl+Z puts it back), and so does Esc; a tile opened with the keyboard
// under it takes it off (it would cover the question); and the board under it takes clicks again.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openGameFile, recordSeen, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
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
const NAMES = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve'];
const game = {
  id: 'g_captain',
  version: 2,
  title: 'Captain night',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true },
  },
  players: NAMES.map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4'][i] })),
  rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values: [200, 400], dailyDoubleCount: 0, categories: [{ id: 'c1', title: 'Movies', clues: [plain('a'), plain('b')] }, { id: 'c2', title: 'Games', clues: [plain('c'), plain('d')] }] }],
  media: [], audio: {}, wheels: [], dice: [], theme: {},
};
const gameFile = resolve('test-results/dealcaptain.json');
writeFileSync(gameFile, JSON.stringify(game));

const ATTRS = ['aria-label', 'title', 'alt', 'aria-description', 'placeholder', 'data-said', 'value'];
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser;
const errors = [];

try {
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.addInitScript(recordSeen);
  const host = await ctx.newPage();
  host.setDefaultTimeout(20000);
  host.on('pageerror', (e) => errors.push(e.message));
  host.on('dialog', (d) => (errors.push(`dialog: ${d.message()}`), d.accept()));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();

  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const tools = host.locator('.panel .toolsrow');
  const dealButton = tools.getByRole('button', { name: '🎭 Deal…' });
  const dialog = host.getByRole('dialog', { name: 'Deal' });
  const openDeal = async () => {
    if (!(await dialog.count())) await dealButton.click();
    await dialog.waitFor();
  };
  /** Whether a click at the middle of `loc` lands on it (in view, nothing over it). */
  const clickable = (loc) =>
    loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === el || el.contains(at));
    });
  const savedDeal = async () => (await stored(host))?.session?.deal ?? null;

  // ---------- 🎭 Deal…: the way on stays in view at the menu's foot ----------
  console.log('The menu’s foot:');
  await openDeal();
  const pick = dialog.getByRole('combobox', { name: 'The deal' });
  await pick.selectOption('tpl:roles');
  const scrolls = await dialog.evaluate((m) => m.scrollHeight > m.clientHeight + 20);
  assert(scrolls, `🐺 Secret roles: more than the menu holds at 1280×720 (it scrolls)`);
  assert(await clickable(dialog.getByRole('button', { name: '🎭 Deal', exact: true })), 'scrolled to the top, 🎭 Deal is still in view and takes a click');
  assert(await dialog.getByText('Make your own in the editor’s 🎡 Wheels, Dice & Deals tab.').isVisible(), 'the menu says where one’s own deals are made');
  await pick.selectOption('tpl:captain');
  assert(await dialog.getByText('Not a teams game: dealt to the players.').isVisible(), '🧢 Team captain, not a teams game: dealt to the players');
  assert((await dialog.getByLabel('How many get Captain').inputValue()) === '1', 'one Captain');

  // ---------- Dealt and handed out: everyone on the list, the same buttons for each ----------
  console.log('One window, no phones:');
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-counts]').waitFor();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 5: Captain ×1', '“Dealt to 5: Captain ×1”: everyone dealt in, one part');
  const handOut = dialog.locator('[data-deal-send]');
  assert((await handOut.innerText()).trim() === '✔ Hand them out' && (await clickable(handOut)), 'no phones: ✔ Hand them out, in view');
  await handOut.click();
  await dialog.locator('.hands').waitFor();
  const rows = await dialog.locator('.hands .row').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  assert(JSON.stringify(rows) === JSON.stringify(NAMES.map((n) => `${n} 📋 Copy 🪟`)), `the list names all five dealt in, each with 📋 Copy and 🪟 (${rows.join(' | ')})`);
  let d = null;
  const nameOf = (seat) => NAMES[Number(seat.slice(1)) - 1];
  assert(await until(async () => (d = await savedDeal())?.stage === 'sent'), 'the deal is kept with the game in progress (autosave)');
  assert(d.hands.length === 1 && d.in?.length === 5, `the test sees one captain (${nameOf(d.hands[0].to.seat)}) among the five dealt in`);
  const captain = nameOf(d.hands[0].to.seat);
  for (const n of NAMES) {
    await dialog.getByRole('button', { name: `Copy ${n}’s card` }).click();
    const copied = await until(async () => (await host.evaluate(() => navigator.clipboard.readText())).startsWith(`🤫 For ${n} only`), 5000);
    const got = await host.evaluate(() => navigator.clipboard.readText());
    assert(
      copied && (n === captain ? got.includes('You’re the Captain') && got.includes('your team only answers when you say so') : got.endsWith('no part for you this time')),
      `${n}’s 📋 Copy: ${n === captain ? 'the captain’s brief' : '“no part for you this time”'}`,
    );
  }

  // ---------- Dealt again until someone else is captain: the page reads the same ----------
  /** Everything the deal's window, the tools row and the stage say, as text and labels. */
  const snapshot = () =>
    host.evaluate((ATTRS) => {
      const parts = [];
      for (const root of document.querySelectorAll('[role="dialog"][aria-label="Deal"], .panel .toolsrow, .stage-box'))
        for (const el of [root, ...root.querySelectorAll('*')]) {
          for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.data.trim()) parts.push(n.data.trim());
          for (const a of ATTRS) if (el.getAttribute(a)) parts.push(`${a}=${el.getAttribute(a)}`);
        }
      return parts.join('\n');
    }, ATTRS);
  /** 🎭 Deal a new one → 🎭 Deal → (take the cards back) → ✔ Hand them out: the panel after it, what it showed or said, and the captain. */
  const dealAgain = async () => {
    // (Once what was said before is out: the live region says what comes within a moment of each other together.)
    await sleep(800);
    await host.evaluate(() => (window.__seen.length = 0));
    await dialog.getByRole('button', { name: '🎭 Deal a new one' }).click();
    await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
    const askBox = dialog.locator('[data-deal-ask]');
    await askBox.waitFor();
    await askBox.getByRole('button', { name: 'Take them back and deal' }).click();
    await askBox.waitFor({ state: 'detached' });
    await openDeal();
    await dialog.locator('[data-deal-send]').click();
    await dialog.locator('.hands').waitFor();
    await sleep(800);
    // (Each sentence once, in order: how the live region bunched them depends on how fast the clicks came.)
    const said = await host.evaluate(() => [...new Set(window.__seen.flatMap((s) => s.split(/(?<=[.!?…])\s+/)).map((s) => s.trim()).filter(Boolean))].sort().join('\n'));
    const page = await snapshot();
    const was = d.id;
    if (!(await until(async () => (d = await savedDeal())?.stage === 'sent' && d.id !== was))) throw new Error('the new deal never reached autosave');
    return { page, said, captain: nameOf(d.hands[0].to.seat) };
  };
  const first = await dealAgain();
  let next = first;
  for (let i = 0; i < 25 && next.captain === first.captain; i++) next = await dealAgain();
  assert(next.captain !== first.captain, `another captain now (${first.captain}, then ${next.captain})`);
  assert(next.page === first.page, `the deal’s window, the tools row and the stage read the same whoever is captain${next.page === first.page ? '' : `:\n${first.page}\n---\n${next.page}`}`);
  assert(next.said === first.said, `and so did everything the page showed or said on the way${next.said === first.said ? '' : `:\n${first.said}\n---\n${next.said}`}`);
  assert(!/\b(Ann|Bob|Cat|Dan|Eve)\b[^\n]*Captain|Captain[^\n]*\b(Ann|Bob|Cat|Dan|Eve)\b/.test(`${next.page}\n${next.said}`), 'no line names anyone with “Captain”');

  // ---------- 🎭 Who was who: a click on the stage takes it off ----------
  console.log('Who was who:');
  const reveal = host.locator('.stage-box [data-who-was-who]');
  await dialog.locator('[data-deal-reveal]').click();
  await reveal.waitFor();
  assert((await flat(reveal)).includes(`${next.captain} Captain`), 'on the stage: who was captain');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert((await dealButton.getAttribute('title')) === '🎭 Who was who is on screen: click it on the stage, or 🙈 Hide it here', 'the 🎭 Deal… button says how to take it off');
  const tile = host.locator('.stage-box .tile').first();
  assert(!(await clickable(tile)), 'while it’s up, it covers the board');
  await sleep(500);
  await reveal.click();
  assert(await until(async () => !(await reveal.count())), 'a click on it takes it off the stage');
  assert(await until(async () => (await savedDeal())?.shown !== true), 'and the game in progress says so');
  await host.keyboard.press('Control+z');
  await reveal.waitFor();
  assert(true, 'Ctrl+Z puts it back');
  await sleep(500);
  await reveal.click();
  assert(await until(async () => !(await reveal.count())), 'clicked again: off');
  await host.keyboard.press('Control+z');
  await reveal.waitFor();
  await host.keyboard.press('Escape');
  assert(await until(async () => !(await reveal.count())), 'Esc takes it off too');
  await host.keyboard.press('Control+z');
  await reveal.waitFor();
  // (Enter on a tile reached with the keyboard opens it under Who was who: it goes, the question would be under it.)
  await host.locator('.stage-box .tile[data-clue="b"]').focus();
  await host.keyboard.press('Enter');
  assert(await until(async () => (await host.locator('.panel .status').innerText()).includes('Answer hidden')), 'Enter on a tile under it opens the tile');
  assert(await until(async () => !(await reveal.count())), 'and takes Who was who off the screen');
  await host.keyboard.press('Escape');
  await tile.waitFor();
  assert(await clickable(tile), 'the board takes clicks again');
  await tile.click();
  assert(await until(async () => !(await host.locator('.stage-box .tile').count())), 'a tile opens');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Team captain tests passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
