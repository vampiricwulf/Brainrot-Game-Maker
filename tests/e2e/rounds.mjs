// Round modes: a game is a list of rounds and each picks a mode. Final Jeopardy is a round like any other (it can
// go in the middle), rounds can be reordered, duplicated and deleted, and games saved before modes still open.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  await page.getByLabel('Name (shown on screen)').fill('Midgame Wager');
  // TV rule for this one: players with $0 sit it out.
  await page.getByLabel('Players with a score of 0 or less can play it').uncheck();
  await page.getByLabel('Category').fill('Snacks');
  await page.getByRole('button', { name: '◀ Move earlier' }).click();
  await page.getByRole('button', { name: '◀ Move earlier' }).click();
  assert((await roundNames()).join('|') === 'Jeopardy!|Midgame Wager|Double Jeopardy!|Final Jeopardy!', 'rounds can be moved (a Final in the middle of the game)');
  assert((await page.locator('.ra .mode').innerText()).includes('Final Jeopardy') && (await page.locator('.ra').innerText()).includes('Round 2 of 4'), 'the round bar shows the mode and position');
  await page.locator('.se .canvas .hit').first().click();
  await page.locator('.se .insp textarea').fill('Best chip flavor?');
  // Duplicate and delete.
  await page.getByRole('button', { name: '⧉ Duplicate' }).click();
  assert((await roundNames()).join('|') === 'Jeopardy!|Midgame Wager|Midgame Wager (copy)|Double Jeopardy!|Final Jeopardy!', 'Duplicate puts a copy right after the round');
  await page.getByRole('button', { name: 'Delete round' }).click();
  assert((await roundNames()).length === 4, 'Delete round removes it (after asking)');

  // Play: board → Final in the middle → board → Final → end.
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // Give Player 1 some points so they can wager.
  await page.locator('.panel .p').first().locator('.score').click();
  await page.locator('.panel .p').first().locator('input').fill('500');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450); // the round buttons ignore clicks right after they appear
  await page.getByRole('button', { name: 'Midgame Wager ▶' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.locator('.final-label').waitFor();
  assert((await page.locator('.final-label').innerText()) === 'MIDGAME WAGER', 'the next round is the Final in the middle of the game');
  await page.getByRole('button', { name: /◀ Back to Jeopardy!/ }).waitFor();
  assert(true, 'its Back button goes to the round before it');
  // Through the Final: wagers, question, answer, then judge the one player who can play.
  await page.getByRole('button', { name: /take wagers/ }).click();
  await page.locator('.fj .wagers input').first().fill('200');
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
  await picker.selectOption({ label: '⭐ Final Jeopardy!' });
  await page.locator('.final-label').waitFor();
  assert((await page.locator('.final-label').innerText()) === 'FINAL JEOPARDY!', 'the round picker jumps straight to any round');
  // This Final lets players with $0 play: they can only wager $0, so it's filled in and Show question waits on no one else.
  await page.getByRole('button', { name: /take wagers/ }).click();
  const wagerBoxes = page.locator('.fj .wagers input');
  const showQuestion = page.getByRole('button', { name: 'Show question ▶' });
  const zeroes = page.locator('.fj .wagers .chip').filter({ hasText: 'can only wager $0' });
  assert(
    (await Promise.all([0, 1].map((i) => wagerBoxes.nth(i).inputValue()))).join('|') === '|0' && (await zeroes.count()) === 1,
    'a player at $0 gets a wager of $0 filled in, and the host panel says they can only wager $0',
  );
  assert(await showQuestion.isDisabled(), 'Show question still waits for the player who can wager more');
  await wagerBoxes.first().fill('100');
  assert(await showQuestion.isEnabled(), 'and nobody at $0 holds it up');
  await wagerBoxes.nth(1).fill('50');
  assert(await showQuestion.isDisabled(), 'more than $0 is over their max');
  await page.getByLabel('Ignore the limits').check();
  assert(await showQuestion.isEnabled(), 'unless the limits are ignored');
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
