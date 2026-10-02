// Round modes: a game is a list of rounds and each picks a mode. Final Jeopardy is a round like any other (it can
// go in the middle), rounds can be reordered, duplicated and deleted, and games saved before modes still open.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const nav = () => page.locator('nav > button, nav .add > button').allInnerTexts();
const roundNames = async () => (await page.locator('nav > button.round-tab').allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  assert((await roundNames()).length === 0, 'a new game has no rounds');
  assert(await page.locator('.first-round').isVisible(), 'the editor opens on "Add your first round"');
  assert(await page.getByRole('button', { name: '▶ Play' }).isDisabled(), 'Play waits for a round');
  assert((await page.locator('.first-round .mode').count()) === 4, 'every mode can be the first round');
  await page.locator('.first-round').getByRole('button', { name: /Jeopardy board/ }).click();
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Final Jeopardy/ }).click();
  assert((await roundNames()).join('|') === 'Jeopardy!|Final Jeopardy!', `the host adds a board and a Final (${(await roundNames()).join(', ')})`);

  // Add a board round: it goes before the Final, so the Final stays last.
  await page.getByRole('button', { name: '＋ Add round' }).click();
  const menu = page.getByRole('menu');
  assert((await menu.getByRole('menuitem').allInnerTexts()).join('|').includes('Jeopardy board'), 'Add round asks for the mode');
  await menu.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  assert((await roundNames()).join('|') === 'Jeopardy!|Double Jeopardy!|Final Jeopardy!', 'a new board round goes before the Final');
  // A second Final, then moved into the middle of the game.
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Final Jeopardy/ }).click();
  assert((await roundNames()).at(-1) === 'Final round 2', 'a second Final gets its own name');
  await page.locator('.grid input[data-round-name]').fill('Midgame Wager');
  // TV rule for this one: players with $0 sit it out.
  await page.getByLabel('Players with a score of 0 or less can play it').uncheck();
  await page.getByLabel('Category').fill('Snacks');
  await page.getByRole('button', { name: '▲ Move round up' }).click();
  await page.getByRole('button', { name: '▲ Move round up' }).click();
  assert((await roundNames()).join('|') === 'Jeopardy!|Midgame Wager|Double Jeopardy!|Final Jeopardy!', 'rounds can be moved (a Final in the middle of the game)');
  assert((await page.locator('.ra .mode-chip').innerText()).includes('Final Jeopardy') && (await page.locator('.ra').innerText()).includes('Round 2 of 4'), 'the round bar shows the mode and position');
  await page.locator('.se .canvas .hit').first().click();
  await page.locator('.se .insp textarea').fill('Best chip flavor?');
  // Duplicate and delete.
  await page.getByRole('button', { name: '⧉ Duplicate round' }).click();
  assert((await roundNames()).join('|') === 'Jeopardy!|Midgame Wager|Midgame Wager (copy)|Double Jeopardy!|Final Jeopardy!', 'Duplicate puts a copy right after the round');
  await page.getByRole('button', { name: 'Delete round' }).click();
  assert((await roundNames()).length === 4, 'Delete round removes it (after asking)');
  // Undoing a duplicate shows the original again, and its tab keeps the focus (the copy's tab is gone).
  const roundTab = (name) => page.locator('nav > button.round-tab', { hasText: new RegExp(`${name}$`) });
  const activeTab = () => page.locator('nav > button.round-tab.active').innerText();
  const tabFocused = (name) => roundTab(name).evaluate((e) => e === document.activeElement);
  await roundTab('Midgame Wager').click();
  await page.keyboard.press('Control+d');
  assert((await activeTab()).endsWith('Midgame Wager (copy)') && (await tabFocused('Midgame Wager \\(copy\\)')), 'Ctrl+D on a round’s tab shows the copy, its tab in focus');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert((await roundNames()).length === 4 && (await activeTab()).endsWith('Midgame Wager') && (await tabFocused('Midgame Wager')), 'undoing it shows the original, its tab in focus');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(100);
  assert((await activeTab()).endsWith('Midgame Wager (copy)'), 'redoing it shows the copy again');
  await page.keyboard.press('Control+z');
  // The tabs are a vertical list: their menu moves a round up or down.
  await roundTab('Midgame Wager').click({ button: 'right' });
  const tabMenu = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]);
  assert(['▲ Move up', '▼ Move down'].every((x) => tabMenu.some((t) => t.startsWith(x))), `a round tab’s menu says ▲ Move up / ▼ Move down (${tabMenu.join(', ')})`);
  await page.keyboard.press('Escape');

  // Play: board → Final in the middle → board → Final → end.
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // The board is up: the keys go on from its first open tile (arrows + Enter), and the status line says so.
  await page.waitForFunction(() => document.activeElement?.matches('.stage-box .board .tile:not(.used)'));
  assert((await page.locator('.panel .status').innerText()).includes('Pick a tile on the board (arrows + Enter)'), 'the board comes up with its first open tile in focus: “Pick a tile on the board (arrows + Enter)”');
  // N on a clue does what the main button shows: 👁 Reveal answer, then ▦ Done ▶ board.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('👁 Reveal answer'));
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer is showing'));
  assert((await page.locator('.panel [data-next]').innerText()).startsWith('▦ Done ▶ board'), 'N on a clue reveals the answer (the main button), then the main button is ▦ Done ▶ board');
  await page.keyboard.press('n');
  await page.locator('.stage-box .board').waitFor();
  assert(true, 'and N again goes back to the board');
  // Give Player 1 some points so they can wager.
  await page.locator('.panel .p').first().locator('.score').click();
  await page.locator('.panel .p').first().locator('input').fill('500');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450); // the round buttons ignore clicks right after they appear
  await page.getByRole('button', { name: 'Midgame Wager ▶' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  // Its title card first, as for a board round.
  await page.locator('.title-card .round-name').filter({ hasText: 'Midgame Wager' }).waitFor();
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.title-card .round-name').waitFor({ state: 'detached' });
  await page.locator('.fj').waitFor();
  assert((await page.locator('.stage-box .full').innerText()).toUpperCase().includes('MIDGAME WAGER'), 'the next round is the Final in the middle of the game');
  await page.getByRole('button', { name: /◀ Previous round \(Jeopardy!\)/ }).waitFor();
  assert(true, 'its Back button goes to the round before it');
  // Through the Final: wagers, question, answer, then judge the one player who can play.
  await page.locator('.fj .wagers input[data-wager]').first().fill('200');
  await page.getByRole('button', { name: 'Show question ▶' }).click();
  await page.getByRole('button', { name: 'Reveal answer ▶' }).click();
  await page.getByRole('button', { name: 'Start player reveals ▶' }).click();
  await page.locator('.spot').waitFor();
  await page.keyboard.press('c');
  const finish = page.getByRole('button', { name: /^Next: Double Jeopardy! ▶$/ });
  assert((await finish.count()) === 1, 'a Final in the middle of the game offers the next round instead of finishing the game');
  await page.waitForTimeout(450);
  await finish.click();
  await page.locator('.board, .round-name').first().waitFor({ timeout: 10000 });
  assert(true, 'after the mid-game Final, play continues with the next board round');
  // The round picker jumps anywhere (rounds can be played out of order).
  await page.getByRole('button', { name: 'Skip intro' }).click().catch(() => {});
  const picker = page.getByRole('combobox', { name: 'Go to round' });
  // With clues left on this board it asks first, like Next round; Cancel puts the list back on this round.
  await picker.selectOption({ label: '🏆 Final Jeopardy!' });
  const goTo = page.getByText(/clues? left · go to Final Jeopardy!\?/);
  await goTo.waitFor();
  await page.waitForTimeout(450);
  // (It asks in the strip above the fixed bar.)
  await page.locator('.panel .confirm').getByRole('button', { name: 'Cancel' }).click();
  assert(
    (await goTo.count()) === 0 && (await picker.locator('option:checked').innerText()).includes('Double Jeopardy!'),
    'Cancel on “N clues left · go to …?” stays on this round, and the round list shows it again',
  );
  await picker.selectOption({ label: '🏆 Final Jeopardy!' });
  await page.waitForTimeout(450);
  await page.locator('.panel .confirm').getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.title-card .round-name').waitFor({ state: 'detached' });
  await page.locator('.fj').waitFor();
  assert((await page.locator('.stage-box .full').innerText()).toUpperCase().includes('FINAL JEOPARDY!'), 'the round picker jumps straight to any round');
  // No "Lock category, take wagers" step: the category is up and the wager screen with it, who plays on the same screen.
  assert((await page.getByRole('button', { name: /Lock category|take wagers/ }).count()) === 0, 'the Final opens straight on its wager screen (no lock step)');
  assert((await page.locator('.panel .status').innerText()).includes('Category on screen · taking wagers'), 'the status line says the category is up and wagers are being taken');
  // This Final lets players with $0 play: a wager of $0 is filled in for them, and Show question waits on no one else.
  const wagerBoxes = page.locator('.fj .wagers input[data-wager]');
  const plays = page.locator('.fj .wagers input[data-plays]');
  const showQuestion = page.getByRole('button', { name: 'Show question ▶' });
  const limits = page.getByLabel('Ignore the limits');
  const zeroes = page.locator('.fj .wagers .chip').filter({ hasText: 'can only wager $0' });
  assert(await limits.isChecked(), 'the limits are ignored by default');
  assert(
    (await plays.count()) === 2 && (await Promise.all([0, 1].map((i) => wagerBoxes.nth(i).inputValue()))).join('|') === '|0',
    'each player’s row has its plays tick and its wager box; a player at $0 gets $0 filled in',
  );
  assert(await showQuestion.isDisabled(), 'Show question still waits for the player who can wager more');
  await wagerBoxes.first().fill('100');
  assert(await showQuestion.isEnabled(), 'and nobody at $0 holds it up');
  await wagerBoxes.nth(1).fill('50');
  assert(await showQuestion.isEnabled(), 'more than a player’s score is fine while the limits are ignored (the default)');
  await limits.uncheck();
  assert((await zeroes.count()) === 1 && (await showQuestion.isDisabled()), 'with the limits on, a player at $0 can only wager $0 and $50 is over their max');
  await limits.check();
  assert(await showQuestion.isEnabled(), 'and ignored again, it goes');
  // Ticking a player out on the wager screen drops their box (they sit out); ticked back in, their wager is still there.
  await plays.nth(1).uncheck();
  assert((await wagerBoxes.count()) === 1 && (await page.locator('.fj .wagers .wrow.out').innerText()).includes('sits out'), 'a player ticked out sits out: no wager box');
  assert(await showQuestion.isEnabled(), 'and Show question doesn’t wait on them');
  await plays.nth(1).check();
  assert((await wagerBoxes.nth(1).inputValue()) === '50', 'ticked back in, their wager is kept');
  // Nobody ticked in: the main button goes on to the end instead.
  await plays.nth(0).uncheck();
  await plays.nth(1).uncheck();
  assert((await page.locator('.panel [data-next]').innerText()).startsWith('Finish game'), 'nobody playing: the main button goes on (Finish game)');
  await plays.nth(0).check();
  await plays.nth(1).check();
  // The keys go on: N shows the question once every wager is in, N the answer, N the reveals.
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Question on screen'));
  assert(true, 'N on the wager screen shows the question once every wager is in');
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer on screen'));
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Player reveals'));
  // The reveals: N shows the wager, then judging (C / X) is the main step; N waits for it, then the next player.
  const revealMain = () => page.locator('.panel [data-next]').innerText();
  const spot = () => page.locator('.fj .pl.cur .name').innerText();
  assert((await revealMain()).startsWith('Show wager ▶'), `the reveals start on Show wager (${await revealMain()})`);
  const first = await spot();
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.includes('right'));
  assert((await revealMain()).startsWith(`✔ ${first} right`) && (await page.locator('.panel [data-next-also]').innerText()).startsWith('✘ Wrong'), `after Show wager, judging is the main step: ✔ ${first} right (C), ✘ Wrong (X) beside it (${await revealMain()})`);
  await page.keyboard.press('n');
  await page.waitForTimeout(150);
  assert((await spot()) === first && (await revealMain()).startsWith(`✔ ${first} right`), 'N doesn’t go on past a player whose wager is up until they’re judged');
  await page.keyboard.press('c');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Next player'));
  await page.keyboard.press('n');
  await page.waitForFunction((f) => document.querySelector('.fj .pl.cur .name')?.textContent !== f, first);
  await page.keyboard.press('n');
  await page.keyboard.press('x');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Finish game'));
  assert((await page.locator('.fj').innerText()).includes('still to judge') === false, 'with both judged, nobody is left to judge and the main button is Finish game');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.locator('.panel .status', { hasText: 'Game over' }).waitFor();
  assert(true, 'N (twice, as it asks) finishes the game');
  await context.close();

  // A game saved by Jeopardy Builder (format version 1): the Final becomes the last round.
  const fresh = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p2 = await fresh.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  const alerts = [];
  p2.on('dialog', (d) => (alerts.push(d.message()), d.accept()));
  const text = (t) => ({ background: {}, elements: [{ id: 't' + t.length, kind: 'text', x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1, zIndex: 0, text: t, font: 'Anton', size: 80, weight: 400, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.1, letterSpacing: 0, autoFit: true }] });
  const v1 = {
    id: 'old', version: 1, title: 'Old Game', settings: {}, players: [], media: [], audio: {}, wheels: [], dice: [], theme: {},
    rounds: [{ id: 'r1', name: 'Classic', values: [100], categories: [{ id: 'c1', title: 'Cats', clues: [{ id: 'k1', value: null, type: 'standard', questionSlide: text('Q'), answerSlide: text('A') }] }] }],
    final: { enabled: true, name: 'Old Final', category: 'History', questionSlide: text('FQ'), answerSlide: text('FA'), timerSeconds: 40 },
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/v1-game.json', JSON.stringify(v1));
  await p2.goto(pathToFileURL(file).href);
  const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: 'Open…' }).click()]);
  await chooser.setFiles(resolve('test-results/v1-game.json'));
  await p2.waitForFunction(() => document.querySelector('input.title')?.value === 'Old Game', null, { timeout: 5000 }).catch(() => {
    throw new Error('the old game did not open: ' + alerts.join(' | '));
  });
  const oldRounds = (await p2.locator('nav > button.round-tab').allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());
  assert(oldRounds.join('|') === 'Classic|Old Final', `an old game's Final becomes its last round (${oldRounds.join(', ')})`);
  await p2.getByRole('button', { name: 'Old Final' }).click();
  assert((await p2.getByLabel('Category').inputValue()) === 'History' && (await p2.getByLabel('Think time (seconds)').inputValue()) === '40', 'with its category and think time');
  await fresh.close();

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nRounds E2E passed.');
} finally {
  await browser.close();
}
