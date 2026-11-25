// @ts-check
// 🎭 Deals with no phone buzzers (docs/SPEC.md §6, docs/hosting.md "🎭 Deal…"), in one window (the host page is what
// viewers see). Its lists mark the ready-made Odd one out and Locations wheel as already in this game (it has its own
// copies). Dealt and ✔ handed out, the cards are copied to each player (📋), so there's no "Lasts" choice to make
// and ↩ Take the cards back says it only marks them; the next round leaves the deal handed out, its 📋 rows still there.
// 📥 Import rounds… lists the other game's deal as a row to tick, and brings it with the wheel it draws from (one step);
// brought again, nothing comes in. Leaving the round doesn't say the copied cards go with it.
// Needs no buzzer room.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  appFile,
  confirmStrip,
  failureShots,
  launchChromium,
  leaveAnswer,
  openGameFile,
  recordSeen,
  stored,
  assert,
  sleep,
  untilWith,
  section,
  roundTabsIn,
  stageBoxIn,
  toastsIn,
  toolsRowIn,
  resultsPath,
} from './helpers.mjs';

const file = appFile();
/** Waits (up to `ms`) until pred() holds. */
const until = untilWith({ every: 100 });

let ids = 0;
const text = (t) => ({
  id: `e${ids++}`,
  x: 100,
  y: 40,
  w: 800,
  h: 160,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  kind: 'text',
  text: t,
  font: 'Arial',
  size: 90,
  weight: 700,
  italic: false,
  underline: false,
  uppercase: false,
  color: '#ffffff',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.2,
  letterSpacing: 0,
  autoFit: true,
});
const slide = (...elements) => ({ background: {}, elements });
const plain = (id) => ({ id, value: null, type: 'standard', questionSlide: slide(text('A question')), answerSlide: slide(text('An answer')) });
const settings = {
  allowNegativeScores: true,
  deductOnWrong: false,
  defaultTimerSeconds: 30,
  finalTimerSeconds: 30,
  currencySymbol: '$',
  rollOffDie: 20,
  pickerFollowsAward: true,
  timerAutoStart: false,
  roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' },
  maxPlayers: 8,
  stream: { clueCaption: true },
};
const board = (id, name) => ({
  id,
  name,
  mode: 'board',
  values: [200, 400],
  dailyDoubleCount: 0,
  categories: [{ id: `c_${id}`, title: 'Movies', clues: [plain(`${id}a`), plain(`${id}b`)] }],
});

// The game: two rounds, three players, the ready-made Odd one out saved with its Locations wheel (as 📋 Ready-made deal…
// adds them).
const game = {
  id: 'g_dealcopy',
  version: 2,
  title: 'Deal copy night',
  settings,
  players: ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
  rounds: [board('r1', 'Round 1'), board('r2', 'Round 2')],
  media: [],
  audio: {},
  dice: [],
  theme: {},
  wheels: [
    {
      id: 'w_loc',
      name: 'Locations',
      segments: ['Beach', 'Zoo', 'Bank'].map((label, i) => ({ id: `s${i}`, label, color: '#e6194b', weight: 1 })),
      spinDurationMs: 3000,
      removeAfterLanding: false,
    },
  ],
  deals: [
    {
      id: 'deal1',
      name: 'Odd one out',
      wheel: 'w_loc',
      parts: [
        { id: 'spy', name: 'Spy', count: 1, card: slide(text('Work out the location')) },
        { id: 'vil', name: 'Villager', count: 'rest', draw: 'shared', card: slide(text('The location:')) },
      ],
    },
  ],
};
const gameFile = resultsPath('dealcopy.json');
writeFileSync(gameFile, JSON.stringify(game));

// Another game, to 📥 Import rounds… from: a round, and its own deal drawn from its own wheel (a wheel no round uses).
const other = {
  id: 'g_other',
  version: 2,
  title: 'Other night',
  settings,
  players: game.players,
  rounds: [board('o1', 'Their round')],
  media: [],
  audio: {},
  dice: [],
  theme: {},
  wheels: [
    {
      id: 'w_places',
      name: 'Places',
      segments: ['Moon', 'Mars'].map((label, i) => ({ id: `p${i}`, label, color: '#3cb44b', weight: 1 })),
      spinDurationMs: 3000,
      removeAfterLanding: false,
    },
  ],
  deals: [
    {
      id: 'deal_o',
      name: 'Spy night',
      wheel: 'w_places',
      parts: [
        { id: 'ospy', name: 'Spy', count: 1, card: slide(text('Find the place')) },
        { id: 'ovil', name: 'Crew', count: 'rest', draw: 'shared', card: slide(text('The place:')) },
      ],
    },
  ],
};
const otherFile = resultsPath('dealcopy-other.json');
writeFileSync(otherFile, JSON.stringify(other));

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

  // ---------- 📥 Import rounds…: the other game's deal, with the wheel it draws from ----------
  section('Import rounds…');
  const tabs = () => roundTabsIn(host).allInnerTexts();
  const tabsBefore = await tabs();
  await host.getByRole('button', { name: '＋ Add round' }).click();
  const [chooser] = await Promise.all([host.waitForEvent('filechooser'), host.getByRole('menuitem', { name: '📥 Import rounds…' }).click()]);
  await chooser.setFiles(otherFile);
  const pick = host.getByRole('dialog', { name: 'Import rounds' });
  const hintText = (await pick.locator('[data-import-hint]').innerText()).replace(/\s+/g, ' ').trim();
  assert(
    hintText ===
      'Tick the rounds and 🎭 deals to bring in. What they use comes along: RPG worlds, wheels, dice, stats, items, shops and files. That game’s 🤫 Cards tab, sounds and theme stay in it.',
    `its hint says what comes along and what stays (“${hintText}”)`,
  );
  const dealRow = pick.locator('[data-import-deal]');
  assert(
    (await dealRow.innerText()).replace(/\s+/g, ' ').trim() === '🎭 Spy night Deal, with its 🎡 Places wheel',
    `the other game’s deal is a row to tick, with the wheel it draws from (${await dealRow.innerText()})`,
  );
  // (A game of one round has it ticked already: only the deal, this time.)
  await pick.getByLabel(/Their round/).uncheck();
  await dealRow.getByRole('checkbox').check();
  await pick.getByRole('button', { name: 'Import 1 deal' }).click();
  await host.getByText('Imported 1 deal from “Other night”').waitFor({ timeout: 3000 });
  assert(JSON.stringify(await tabs()) === JSON.stringify(tabsBefore), 'Import 1 deal: the toast says so, and no round comes in');
  await host.getByRole('button', { name: /Wheels, Dice & Deals/ }).click();
  const dealList = host.getByRole('list', { name: 'Deals' });
  const wheelList = host.getByRole('list', { name: 'Wheels' });
  assert(
    (await dealList.getByRole('button', { name: 'Spy night' }).count()) === 1 && (await wheelList.getByRole('button', { name: 'Places' }).count()) === 1,
    'the 🎡 tab has the deal Spy night, and its wheel Places',
  );
  await dealList.getByRole('button', { name: 'Spy night' }).click();
  const drawn = host.locator('[data-deal-editor]').getByRole('combobox', { name: /Wheel its cards draw from/ });
  assert((await drawn.locator('option:checked').innerText()) === 'Places', 'and the deal draws from that wheel');
  // Again: the game has that deal now, so nothing comes in, its wheel neither, and nothing is said as used.
  await host.getByRole('button', { name: '＋ Add round' }).click();
  const [chooser2] = await Promise.all([host.waitForEvent('filechooser'), host.getByRole('menuitem', { name: '📥 Import rounds…' }).click()]);
  await chooser2.setFiles(otherFile);
  await pick.getByLabel(/Their round/).uncheck();
  await pick.locator('[data-import-deal]').getByRole('checkbox').check();
  await pick.getByRole('button', { name: 'Import 1 deal' }).click();
  const again = toastsIn(host, { hasText: 'Nothing imported' });
  await again.waitFor({ timeout: 3000 });
  const againText = (await again.innerText()).replace(/\s+/g, ' ').trim();
  assert(
    againText.includes('Nothing imported: “Spy night” is in this game already') && !againText.includes('Used'),
    `importing it again brings nothing, and says so (“${againText}”)`,
  );
  assert(
    (await dealList.getByRole('button', { name: 'Spy night' }).count()) === 1 && (await wheelList.getByRole('button', { name: 'Places' }).count()) === 1,
    'still one Spy night, and one Places wheel',
  );
  // (That changed nothing, so it's no step of its own: one Ctrl+Z takes out the import before it.)
  await host.keyboard.press('Control+z');
  assert(
    await until(
      async () => !(await dealList.getByRole('button', { name: 'Spy night' }).count()) && !(await wheelList.getByRole('button', { name: 'Places' }).count()),
    ),
    'Ctrl+Z takes the deal and its wheel out, as one step',
  );

  // ---------- In play, no phones ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await stageBoxIn(host).locator('.tile').first().waitFor();
  const tools = toolsRowIn(host);
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
  section('Copy mode');
  await openDeal();
  // ---------- The lists mark a ready-made deal or wheel the game has its own copy of ----------
  const dealOptions = await dialog.getByRole('combobox', { name: 'The deal' }).locator('option').allInnerTexts();
  assert(
    dealOptions.includes('🎭 Odd one out') &&
      dealOptions.includes('🕵️ Odd one out · already in this game · One spy; everyone else knows the location') &&
      dealOptions.filter((o) => o.includes('already in this game')).length === 1,
    `🎭 Deal…: the ready-made Odd one out says the game already has one, and no other (${dealOptions.join(' | ')})`,
  );
  const wheelOptions = await dialog.getByRole('combobox', { name: 'The wheel its cards draw from' }).locator('option').allInnerTexts();
  assert(
    wheelOptions.includes('Locations') &&
      wheelOptions.includes('🗺️ Locations · already in this game') &&
      wheelOptions.filter((o) => o.includes('already in this game')).length === 1,
    `and so does the ready-made Locations wheel (${wheelOptions.join(' | ')})`,
  );
  await dialog.getByRole('combobox', { name: 'The deal' }).selectOption('saved:deal1');
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-counts]').waitFor();
  assert(
    (await dialog.getByRole('radiogroup', { name: 'How long the cards last' }).count()) === 0,
    'no phones: no “Lasts until the round ends / until I take them back” choice',
  );
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
  const leaving = (await confirmStrip(host).innerText()).replace(/\s+/g, ' ');
  assert(!leaving.includes('go with') && !leaving.includes('🎭'), `leaving the round doesn’t say the copied cards go with it: they stay (“${leaving}”)`);
  await sleep(500);
  await leaveAnswer(host).click();
  assert(await until(async () => (await stored(host))?.session?.currentRound === 1), 'Next round ▶: on to Round 2');
  assert(
    await until(async () => (await dealButton.getAttribute('data-deal-tool')) === 'handed out'),
    `past the round’s end the deal is still handed out (${await dealButton.getAttribute('data-deal-tool')})`,
  );
  await openDeal();
  assert(
    (await dialog.locator('.hands .row').count()) === 3 && (await takeBack.count()) === 1,
    'its 📋 rows are still there for all three, with ↩ Take the cards back',
  );
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
