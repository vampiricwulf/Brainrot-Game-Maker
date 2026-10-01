// Board game rounds: build a board (a loop with a fork, a Start bonus, an off-board zone), then play it: roll, move,
// pick the way at the fork, pass Start, take turns, send someone to the Shadow Realm, undo.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, dragBy, openGameFile } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const toast = () => page.locator('.toast').innerText();
const tokenOn = async (name) =>
  page.evaluate((n) => {
    const t = document.querySelector(`.stage .on-board[data-player="${n}"]`);
    return t ? { x: parseFloat(t.style.left), y: parseFloat(t.style.top) } : null;
  }, name);

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Board game/ }).click();
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 12, 'a new board has a loop of 12 spaces');
  // Ctrl+click adds a space (a plain click only deselects); Delete removes the selected one; right-click has both.
  const canvasBox = await page.locator('.canvas-box').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 12, 'a plain click on the board adds nothing');
  await page.keyboard.down('Control');
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.keyboard.up('Control');
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 13, 'Ctrl+click adds a space');
  await page.keyboard.press('Delete');
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 12, 'Delete removes the selected space');
  await page.getByRole('button', { name: 'Space Space 5' }).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '＋ Add a space after it' }).click();
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 13, 'right-click a space: add a space after it');
  await page.getByRole('button', { name: 'Space Space 13' }).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🗑 Delete space' }).click();
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 12, 'and delete it');
  // A fork: Space 3 can also go straight to Space 7.
  await page.getByRole('button', { name: 'Space Space 3' }).click();
  await page.getByRole('button', { name: '🔗 Link to…' }).click();
  await page.getByRole('button', { name: 'Space Space 7' }).click();
  assert((await page.locator('.side').innerText()).includes('A fork'), 'linking a second way makes a fork');
  // Both ways: one line with an arrow at each end.
  const arrowsBefore = await page.locator('.canvas line[marker-start]').count();
  await page.getByRole('button', { name: 'Space Space 2' }).click();
  await page.getByRole('button', { name: 'Both ways with Space 3' }).click();
  assert((await page.locator('.side').innerText()).includes('↔ Space 3'), 'a link can be made both ways');
  assert((await page.locator('.canvas line[marker-start]').count()) === arrowsBefore + 1, 'a two-way link is drawn with arrows at both ends');
  await page.getByRole('button', { name: 'Both ways with Space 3' }).click();
  assert((await page.locator('.canvas line[marker-start]').count()) === arrowsBefore, 'and back to one way');
  // Start gives points when passed.
  await page.getByRole('button', { name: 'Space Start' }).click();
  // Its menu closes on a second click, like the other menus, and on Esc (the focus goes back to the button).
  const addAction = page.locator('.side .actions').first().getByRole('button', { name: '＋ Add button' });
  await addAction.click();
  await addAction.click();
  assert((await page.getByRole('menu').count()) === 0, '＋ Add button closes on a second click');
  await addAction.click();
  await page.keyboard.press('Escape');
  assert((await page.getByRole('menu').count()) === 0 && (await addAction.evaluate((b) => b === document.activeElement)), 'and on Esc, back to its button');
  await addAction.click();
  await page.getByRole('menuitem', { name: /Change the score/ }).click();
  await page.locator('.side .actions').first().getByLabel('Points').fill('100');
  await page.locator('.side .actions').first().getByLabel('Who').selectOption('party');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-editor.png` });
  // A zone.
  await page.getByRole('tab', { name: /Off-board zones/ }).click();
  await page.getByRole('button', { name: '＋ Zone' }).click();
  assert((await page.getByLabel('Zone name').inputValue()) === 'Shadow Realm', 'the first zone is the Shadow Realm');

  // Play with two players, straight to the board game.
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
  // The round opens on its title card: clicking it goes on.
  await page.locator('.stage-box .title-card').click();
  await page.locator('.bh').waitFor();
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Player 1'), 'Player 1 goes first');
  assert((await page.locator('.stage .on-board').count()) === 2, 'both tokens are on the board');

  // Right-click a token: make it their turn.
  await page.locator('.stage .on-board[data-player="Player 2"]').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🎲 Make it their turn' }).click();
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Player 2'), "right-click a token: make it their turn");
  await page.locator('.stage .on-board[data-player="Player 1"]').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🎲 Make it their turn' }).click();

  // Roll with D: the result fills in the steps.
  await page.keyboard.press('d');
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 8000 });
  assert(true, 'D rolls the dice and fills in the steps');
  await page.keyboard.press('Escape');

  await page.getByLabel('Steps').fill('2');
  await page.getByRole('button', { name: /^▶ Move Player 1/ }).click();
  assert((await toast()).includes('Landed on Space 3'), 'moving 2 from Start lands on Space 3');
  assert((await page.getByLabel('Steps').inputValue()) === '', 'the move uses up the count (no second move with the same roll)');
  await page.waitForTimeout(1200);
  const s3 = await tokenOn('Player 1');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-board.png` });
  assert(s3 && s3.x > 900 && s3.x < 1000, `the token walked to Space 3 (${JSON.stringify(s3)})`);

  await page.keyboard.press('n');
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Player 2'), 'N passes the turn to Player 2');
  await page.keyboard.press('b');
  await page.locator('.cover').waitFor();
  assert(true, 'B covers the screen in a board game too');
  await page.keyboard.press('b');
  await page.getByLabel('Steps').fill('5');
  await page.getByRole('button', { name: /^▶ Move Player 2/ }).click();
  await page.locator('.fork').waitFor();
  assert((await page.locator('.fork').innerText()).includes('at Space 3: which way? (3 to go)'), 'a move stops at the fork and asks');
  await page.locator('.fork').getByRole('button', { name: '→ Space 7' }).click();
  assert((await toast()).includes('Landed on Space 9'), 'taking the shortcut lands on Space 9');

  // Passing Start offers its action.
  await page.getByLabel('Send to').selectOption({ label: 'Space 12' });
  await page.getByLabel('Steps').fill('2');
  await page.getByRole('button', { name: /^▶ Move Player 2/ }).click();
  await page.locator('.acts').getByRole('button', { name: '+$100' }).click();
  assert((await page.locator('.bh .pc').nth(1).innerText()).includes('$100'), 'passing Start and pressing its button gives the points');

  // Ctrl+Z undoes the last move.
  await page.keyboard.press('Control+z'); // the points
  await page.keyboard.press('Control+z'); // the move
  await page.waitForTimeout(300);
  assert((await page.locator('.last').innerText()).includes('Player 2 →'), 'undo steps back through the log');

  // The Shadow Realm.
  await page.getByLabel('Send to').selectOption({ label: '🌀 Shadow Realm' });
  await page.locator('.stage .zones').waitFor();
  assert((await page.locator('.stage .zones').innerText()).includes('Shadow Realm: Player 2'), 'the board lists who is in the Shadow Realm');
  await page.getByLabel('On screen').selectOption({ label: '📺 Shadow Realm' });
  await page.locator('.stage .zone-players').waitFor();
  assert((await page.locator('.stage .zone-players').innerText()).includes('Player 2'), 'the zone can be put on screen, with its players');

  // On the stage: a click on a token selects the player, a token dragged onto a space sends them there, and a click on
  // a space opens its card (Esc closes it).
  await page.getByLabel('On screen').selectOption({ label: '📺 The board' });
  const token1 = page.locator('.stage .on-board[data-player="Player 1"]');
  await token1.click();
  assert((await page.locator('.bh .pc.on').count()) === 1, 'clicking a token selects that player');
  await token1.click();
  await dragBy(page, token1, page.locator('.stage [data-space]').nth(4));
  assert((await toast()) === 'Player 1 → Space 5', 'a token dragged onto a space sends them there');
  await page.locator('.stage [data-space]').nth(1).click();
  const card = page.getByRole('dialog', { name: 'Space: Space 2' });
  await card.waitFor();
  await page.keyboard.press('Escape');
  assert(!(await card.count()), 'clicking a space opens its card, and Esc closes it');
  // The turn order: a click on a name makes it their turn; a chip dragged before another moves it there (one undo step).
  await page.locator('.bh .ord .nm', { hasText: 'Player 1' }).click();
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Player 1'), 'clicking a name in the turn order makes it their turn');
  const firstChip = await page.locator('.bh .ord').first().boundingBox();
  await dragBy(page, page.locator('.bh .ord', { hasText: 'Player 2' }), { x: firstChip.x + 4, y: firstChip.y + firstChip.height / 2 });
  const order = () => page.locator('.bh .ord .nm').allInnerTexts();
  assert((await order()).join() === 'Player 2,Player 1' && (await page.locator('.stage .turn-banner').innerText()).includes('Player 1'), 'a turn-order chip dragged before another moves there, and the turn stays');
  await page.keyboard.press('Control+z');
  assert((await order()).join() === 'Player 1,Player 2', 'one Ctrl+Z puts the order back');

  // One space a turn: the players pick the way (no dice).
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.locator('nav > button.round-tab', { hasText: 'Board game' }).click();
  await page.getByLabel('Move by').selectOption('step');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.waitForTimeout(450);
  if (await yes.isVisible()) await yes.click();
  await page.locator('.bh').waitFor();
  // Its title card has a Skip intro too.
  await page.getByRole('button', { name: 'Skip intro' }).click();
  assert(!(await page.getByRole('button', { name: /Roll/ }).count()), 'one-space boards have no dice');
  await page.locator('.bh .move').getByRole('button', { name: '→ Space 2' }).click();
  assert((await toast()).includes('Landed on Space 2'), 'a player moves one space');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.locator('.bh .move').getByRole('button', { name: '→ Space 3' }).click();
  const ways = await page.locator('.bh .move button.good').allInnerTexts();
  assert(ways.join('|') === '→ Space 4|→ Space 7', `at a fork the host picks the way (${ways.join(', ')})`);
  await page.locator('.stage [data-space]').nth(6).click();
  assert((await toast()).includes('Landed on Space 7'), 'or clicks it on the stage');

  // A game opened over the board (here an earlier save of it, with the same ids) brings back none of its undo steps.
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await page.getByRole('button', { name: /Board game/ }).click();
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const saved = resolve('test-results/boardgame-save.json');
  await json.saveAs(saved);
  await page.getByRole('button', { name: 'Space Space 5' }).click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  await openGameFile(page, saved);
  await answerReplace(page, 'Discard');
  await page.getByText(/^Opened "/).waitFor();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert(
    (await page.getByRole('button', { name: /^Space / }).count()) === 12 && (await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).isDisabled()),
    'a game opened over the board starts its undo afresh (Ctrl+Z brings back nothing from before)',
  );

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame.png` });
  console.log('boardgame: all passed');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
