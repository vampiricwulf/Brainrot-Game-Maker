// Board game rounds: build a board (a loop with a fork, a Start bonus, an off-board zone), then play it: roll, move,
// pick the way at the fork, pass Start, take turns, send someone to the Shadow Realm, undo.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, dragBy, openGameFile, playWithPlayers } from './helpers.mjs';

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
// The editor's board: its spaces are buttons named after them.
const spaces = page.locator('.canvas [data-space]');
const space = (name) => page.locator('.canvas').getByRole('button', { name, exact: true });
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
  assert((await spaces.count()) === 12, 'a new board has a loop of 12 spaces');
  // Ctrl+click adds a space (a plain click only deselects); Delete removes the selected one; right-click has both.
  const canvasBox = await page.locator('.canvas-box').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  assert((await spaces.count()) === 12, 'a plain click on the board adds nothing');
  await page.keyboard.down('Control');
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.keyboard.up('Control');
  assert((await spaces.count()) === 13, 'Ctrl+click adds a space');
  await page.keyboard.press('Delete');
  assert((await spaces.count()) === 12, 'Delete removes the selected space');
  await space('Space 5').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '＋ Add a space after it' }).click();
  assert((await spaces.count()) === 13, 'right-click a space: add a space after it');
  await space('Space 13').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🗑 Delete space' }).click();
  assert((await spaces.count()) === 12, 'and delete it');
  // A fork: Space 3 can also go straight to Space 7.
  await space('Space 3').click();
  await page.getByRole('button', { name: '🔗 Link to…' }).click();
  await space('Space 7').click();
  assert((await page.locator('.side').innerText()).includes('A fork'), 'linking a second way makes a fork');
  assert((await page.locator('.side').getByRole('button', { name: '🗑 Delete space' }).count()) === 1, 'the space card’s Delete space has its 🗑');
  // Both ways: one line with an arrow at each end.
  const arrowsBefore = await page.locator('.canvas line[marker-start]').count();
  await space('Space 2').click();
  await page.getByRole('button', { name: 'Both ways with Space 3' }).click();
  assert((await page.locator('.side').innerText()).includes('↔ Space 3'), 'a link can be made both ways');
  assert((await page.locator('.canvas line[marker-start]').count()) === arrowsBefore + 1, 'a two-way link is drawn with arrows at both ends');
  await page.getByRole('button', { name: 'Both ways with Space 3' }).click();
  assert((await page.locator('.canvas line[marker-start]').count()) === arrowsBefore, 'and back to one way');
  // Start gives points when passed.
  await space('Start').click();
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
  assert(await page.locator('.side .actions').first().getByLabel('Points').evaluate((e) => e === document.activeElement), 'a new button has the focus on its first setting');
  await page.locator('.side .actions').first().getByLabel('Points').fill('100');
  await page.locator('.side .actions').first().getByLabel('Who').selectOption('party');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-editor.png` });

  // ---------- The keyboard: the board is one tab stop ----------
  const active = () => page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label'), space: !!document.activeElement?.closest('[data-space]'), side: !!document.activeElement?.closest('.side'), tag: document.activeElement?.tagName }));
  const picked = () => page.locator('.canvas .space.sel').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const note = page.locator('.history-notice');
  await page.locator('[data-round-name]').focus();
  let tabs = 0;
  while (!(await active()).space && tabs < 25) {
    await page.keyboard.press('Tab');
    tabs++;
  }
  assert((await active()).label === 'Start', `Tab from the round's name reaches the board, at the selected space (${tabs} tabs)`);
  await page.keyboard.press('Tab');
  assert((await active()).side, `the next Tab leaves the board for the space's settings (${JSON.stringify(await active())})`);
  await page.keyboard.press('Shift+Tab');
  assert((await active()).label === 'Start', 'Shift+Tab comes back to it');
  await page.keyboard.press('ArrowRight');
  assert((await active()).label === 'Space 2' && (await picked()).join() === 'Space 2', 'the arrow keys go from space to space');
  await page.keyboard.press('Enter');
  assert((await active()).label === 'Space name' && (await page.getByLabel('Space name').inputValue()) === 'Space 2', 'Enter opens its settings');
  await space('Space 2').click();
  await page.keyboard.press('F2');
  await page.keyboard.type('Lava');
  assert((await spaces.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).includes('Lava'), 'F2 renames it');
  await space('Lava').click();
  await page.keyboard.press('F2');
  await page.keyboard.type('Space 2');
  await space('Space 2').click();
  // Copy and paste, with Ctrl+C / Ctrl+V on the board.
  await page.keyboard.press('Control+c');
  assert((await toast()).startsWith('Copied Space 2'), 'Ctrl+C copies the space');
  await page.keyboard.press('Control+v');
  assert((await spaces.count()) === 13 && (await picked()).join() === 'Space 13' && (await active()).label === 'Space 13', 'Ctrl+V pastes a copy (named afresh), selected, with the focus');
  await page.keyboard.press('Control+z');
  assert((await spaces.count()) === 12, 'one Ctrl+Z takes it back');
  // Several: Ctrl+D and the right-click menu.
  await space('Space 2').click();
  await page.keyboard.press('Shift+ArrowRight');
  assert((await picked()).join() === 'Space 2,Space 3', 'Shift+arrow picks several');
  await page.keyboard.press('Control+d');
  assert((await spaces.count()) === 14 && (await picked()).length === 2 && !(await picked()).includes('Space 2'), 'Ctrl+D duplicates all of them (the copies are selected)');
  await page.keyboard.press('Control+z');
  await space('Space 2').click();
  await space('Space 3').click({ modifiers: ['Shift'] });
  await space('Space 3').click({ button: 'right' });
  const several = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]);
  assert(['⧉ Duplicate them', '📋 Copy 2 spaces', '🗑 Delete 2 spaces'].every((x) => several.some((t) => t.startsWith(x))), `right-click on several: duplicate, copy, delete (${several.join(', ')})`);
  await page.getByRole('menu').getByRole('menuitem', { name: /Copy 2 spaces/ }).click();
  await space('Space 3').focus();
  await page.keyboard.press('Delete');
  assert((await spaces.count()) === 10 && (await note.innerText()).includes('Deleted 2 spaces'), 'Delete deletes them, with the app’s note (and its Undo)');
  await note.getByRole('button', { name: '↶ Undo' }).click();
  assert((await spaces.count()) === 12, 'which brings them back');
  // Pasted where the board is right-clicked: both, with the link between them.
  const cbox = await page.locator('.canvas-box').boundingBox();
  await page.mouse.click(cbox.x + cbox.width * 0.45, cbox.y + cbox.height * 0.55, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '📋 Paste 2 spaces here' }).click();
  assert((await spaces.count()) === 14 && (await picked()).length === 2, 'the board’s menu pastes the copied spaces there');
  await page.locator('.side').getByRole('button', { name: /Delete 2 spaces/ }).click();
  assert((await spaces.count()) === 12, 'and they go again');
  await space('Start').click();

  // Move by › ＋ Add dice…: the box says Dice (not "＋ Add dice…"), and the dice stay linked when renamed.
  await page.getByLabel('Move by').selectOption('new-dice');
  const dicePop = page.getByRole('dialog', { name: 'Dice' });
  await dicePop.waitFor();
  await dicePop.getByLabel('Dice name').fill('Big dice');
  await dicePop.getByRole('button', { name: 'Close' }).click();
  const diceBox = page.locator('.bge input[list="bg-dice"]');
  assert((await page.getByLabel('Move by').inputValue()) === 'dice' && (await diceBox.inputValue()) === 'Big dice', 'after ＋ Add dice…, Move by says Dice and the new dice are the ones rolled');
  await page.getByRole('button', { name: '✎ Edit dice' }).click();
  await dicePop.getByLabel('Dice name').fill('Huge dice');
  await dicePop.getByRole('button', { name: 'Close' }).click();
  assert((await diceBox.inputValue()) === 'Huge dice' && (await page.getByRole('button', { name: '✎ Edit dice' }).count()) === 1, 'renaming the dice keeps them (they are linked by id, not name)');
  await diceBox.fill('d6');
  assert(!(await page.getByRole('button', { name: '✎ Edit dice' }).count()), 'typing standard dice rolls those instead');

  // A zone.
  await page.getByRole('tab', { name: /Off-board zones/ }).click();
  await page.getByRole('button', { name: '＋ Add zone' }).click();
  assert((await page.getByLabel('Zone name').inputValue()) === 'Shadow Realm', 'the first zone is the Shadow Realm');
  assert(await page.getByLabel('Zone name').evaluate((e) => e === document.activeElement && e.selectionStart === 0 && e.selectionEnd === e.value.length), '＋ Add zone puts the typing in its name');

  // Play with two players, straight to the board game.
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
  // The round opens on its title card (the host's status line says so): clicking it goes on.
  await page.locator('.stage-box .title-card').waitFor();
  assert((await page.locator('.status').first().innerText()).includes('Title card'), 'the host panel says the title card is up');
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
  // The dice don't stay on stream into another round.
  assert((await page.locator('.stage-box .ov').count()) === 1, 'the dice are on the stage');
  await page.getByRole('button', { name: '◀ Prev round' }).click();
  await page.waitForTimeout(450);
  assert((await page.locator('.stage-box .ov').count()) === 0, 'and gone once the round changes');
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.waitForTimeout(450);
  if (await yes.isVisible()) await yes.click();
  if (await page.locator('.stage-box .title-card').count()) await page.locator('.stage-box .title-card').click();
  await page.locator('.bh').waitFor();

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
  // A typo in the steps: whole steps only, and at most 99 (100000 used to freeze the app).
  await page.getByLabel('Steps').fill('2.5');
  await page.getByRole('button', { name: /^▶ Move Player 2/ }).click();
  assert((await toast()).includes('Landed on Space 12'), '2.5 steps are 3');
  await page.getByLabel('Steps').fill('100000');
  const typoAt = Date.now();
  await page.getByRole('button', { name: /^▶ Move Player 2/ }).click();
  await page.locator('.fork').waitFor();
  assert((await page.locator('.fork').innerText()).includes('(96 to go)') && Date.now() - typoAt < 3000, `100000 steps are 99, at once (${Date.now() - typoAt} ms)`);
  // Enter in the steps at a fork doesn't replace the steps left: it says to pick the way.
  await page.getByLabel('Steps').fill('9');
  await page.getByLabel('Steps').press('Enter');
  assert((await toast()).includes('pick the way first') && (await page.locator('.fork').innerText()).includes('(96 to go)'), 'Enter in the steps at a fork says to pick the way, and keeps the steps left');

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
  await page.getByLabel('On screen', { exact: true }).selectOption({ label: '📺 Shadow Realm' });
  await page.locator('.stage .zone-players').waitFor();
  assert((await page.locator('.stage .zone-players').innerText()).includes('Player 2'), 'the zone can be put on screen, with its players');

  // On the stage: a click on a token selects the player, a token dragged onto a space sends them there, and a click on
  // a space opens its card (Esc closes it).
  await page.getByLabel('On screen', { exact: true }).selectOption({ label: '📺 The board' });
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
  // …and from the keyboard: the host panel's 🗂 Spaces… list opens it, with the focus in it.
  await page.getByLabel("Open a space's card").selectOption({ label: 'Space 2' });
  await card.waitFor();
  assert(await card.evaluate((c) => c.contains(document.activeElement)), 'the Spaces… list opens a space’s card, focus inside');
  await page.keyboard.press('Escape');
  assert(!(await card.count()), 'Esc closes it');
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
  // The game left behind can still be resumed: the app asks (in its own window) before starting a new one.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start a new game' }).click();
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
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^More:/ }).click().then(() => page.getByRole('menuitem', { name: /Export JSON/ }).click())]);
  const saved = resolve('test-results/boardgame-save.json');
  await json.saveAs(saved);
  await space('Space 5').click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  await openGameFile(page, saved);
  await answerReplace(page, 'Discard');
  await page.getByText(/^Opened “/).waitFor();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert(
    (await spaces.count()) === 12 && (await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).isDisabled()),
    'a game opened over the board starts its undo afresh (Ctrl+Z brings back nothing from before)',
  );

  // A board from a file: a fork whose ways meet again, a "Move +3" space, a space that rolls a d20, Finish low down,
  // and a movement wheel.
  const sp = (id, name, x, y, next, more = {}) => ({ id, name, x, y, color: '#4363d8', next, ...more });
  const board = {
    id: 'r_bg',
    name: 'Board game',
    mode: 'boardgame',
    slide: { background: { color: '#1d5e3a' }, elements: [] },
    spaces: [
      sp('b0', 'Start', 300, 300, ['b1']),
      sp('b1', 'Space 2', 500, 300, ['b2']),
      sp('b2', 'Fork', 700, 300, ['b3', 'b5']),
      sp('b3', 'Move +3', 900, 300, ['b4'], { onLand: [{ id: 'a1', do: 'steps', steps: 3, who: 'party' }] }),
      sp('b4', 'Space 5', 1100, 300, ['b5']),
      sp('b5', 'Merge', 1300, 450, ['b6']),
      sp('b6', 'Roll a d20', 1500, 450, ['b7'], { onLand: [{ id: 'a2', do: 'dice', dice: 'd20' }] }),
      sp('b7', 'Space 8', 1500, 650, ['b8']),
      sp('b8', 'Finish', 1000, 910, []),
    ],
    mover: { kind: 'wheel', wheel: 'w_move' },
    zones: [],
  };
  const g = {
    id: 'g_board_e2e', version: 2, title: 'Board check',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: true, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8 },
    players: [{ id: 'p1', name: 'Ann', color: '#e6194b' }, { id: 'p2', name: 'Bob', color: '#3cb44b' }],
    rounds: [board], media: [], audio: {}, dice: [], theme: {},
    wheels: [{ id: 'w_move', name: 'Move wheel', segments: ['1', '2', '3'].map((label, i) => ({ id: `s${i}`, label, color: ['#f00', '#0f0', '#00f'][i], weight: 1 })), spinDurationMs: 800, removeAfterLanding: false }],
  };
  mkdirSync(resolve('test-results'), { recursive: true });
  const boardFile = resolve('test-results/boardgame-check.json');
  writeFileSync(boardFile, JSON.stringify(g));
  await openGameFile(page, boardFile);
  const replace = page.getByRole('dialog', { name: /^(Start a new game|Open|Reopen)/ });
  if (await replace.isVisible().catch(() => false)) await replace.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByText(/^Opened “/).waitFor();
  // Finish is low down (y 910), but the board is scaled into the room above the stats strip in play: no warning.
  assert(!(await page.locator('nav .problem', { hasText: 'stats strip' }).count()), 'the checklist no longer warns about spaces under the stats strip');
  await page.getByRole('button', { name: '▶ Play' }).click();
  // (The game left behind earlier is asked about first.)
  const fresh = page.getByRole('alertdialog').getByRole('button', { name: 'Start a new game' });
  await fresh.or(page.getByRole('button', { name: 'Start game ▶' })).first().waitFor();
  if (await fresh.isVisible()) await fresh.click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.bh').waitFor();
  if (await page.locator('.stage-box .title-card').count()) await page.locator('.stage-box .title-card').click();
  assert(
    (await page.locator('.stage [data-space="b3"] .n').count()) === 0 && (await page.locator('.stage [data-space="b1"] .n').innerText()) === '2',
    'only spaces named “Space N” draw a number (not “Move +3”)',
  );
  assert((await page.getByRole('button', { name: 'Ann later in the turn order' }).count()) === 1, 'the turn order’s arrows say whose they are');
  // One press spins the movement wheel, and its slice fills in the steps.
  await page.getByRole('button', { name: '🎡 Spin to move' }).click();
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 5000 });
  assert(true, 'one press spins the movement wheel, and where it lands fills in the steps');
  // Another roll (a space's d20) doesn't.
  await page.keyboard.press('Escape');
  await page.getByLabel('Steps').fill('');
  await page.locator('.stage [data-space="b6"]').click();
  await page.getByRole('dialog', { name: 'Space: Roll a d20' }).getByRole('button', { name: 'Roll d20' }).click();
  await page.waitForTimeout(1800);
  assert((await page.locator('.stage-box .ov').count()) === 1 && (await page.getByLabel('Steps').inputValue()) === '', 'a space’s d20 roll doesn’t fill in the steps');
  // Esc: the dice go, then the card.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Ann's turn; Bob selected: the Move +3 space's button moves Bob, not Ann.
  await page.keyboard.press('2');
  await page.locator('.stage [data-space="b3"]').click();
  const plus3 = page.getByRole('dialog', { name: 'Space: Move +3' });
  assert((await plus3.innerText()).includes('Landing on it (Bob)'), 'the space’s card is for the selected player');
  await plus3.getByRole('button', { name: 'Forward 3 spaces' }).click();
  assert((await toast()).includes('Forward 3 spaces: Bob · At Fork'), `its button moves Bob, whoever’s turn it is (${await toast()})`);
  assert((await tokenOn('Ann')).x < 400, 'and Ann stays at Start');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  assert((await toast()).includes('Bob is at a fork: pick the way first'), 'Enter at a fork says to pick the way');
  await page.locator('.fork').getByRole('button', { name: '→ Merge' }).click();
  assert((await toast()).includes('Landed on Merge'), 'the fork’s other way leads to where the ways meet');
  // Back 1 from where the ways meet goes back the way Bob came (the Fork), not along the other way.
  await page.locator('.bh .ord .nm', { hasText: 'Bob' }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Steps').fill('1');
  await page.getByRole('button', { name: /^◀ Back/ }).click();
  assert((await toast()) === 'Bob: Landed on Fork', `moving back retraces the way (${await toast()})`);
  await page.getByLabel('Steps').fill('2');
  await page.keyboard.press('Enter');
  assert((await toast()).includes('Bob: At Fork: which way?'), `after moving back onto the fork, the next move asks the way again (${await toast()})`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/boardgame-file.png` });

  // Twelve players: the stats strip is one row of compact cards, and it never covers a space (Finish is low down).
  console.log('Twelve players on the board:');
  const crowd = { ...g, id: 'g_board_crowd', title: 'Board crowd', settings: { ...g.settings, maxPlayers: 12 } };
  crowd.players = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jay', 'Kim', 'Lou'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#56b4e9', '#f0e442', '#1f3a93', '#d55e00', '#f2f2f2', '#009e73', '#cc79a7', '#911eb4', '#9a6324', '#bfef45', '#f032e6'][i] }));
  const crowdFile = resolve('test-results/boardgame-crowd.json');
  writeFileSync(crowdFile, JSON.stringify(crowd));
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await ctx2.newPage();
  host.on('pageerror', (e) => errors.push(`[crowd] ${e.message}`));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, crowdFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  aud.on('pageerror', (e) => errors.push(`[crowd audience] ${e.message}`));
  await aud.setViewportSize({ width: 1280, height: 720 });
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.bh').waitFor();
  if (await aud.locator('.title-card').count()) await host.locator('.stage-box .title-card').click().catch(() => {});
  await aud.locator('[data-space="b8"]').waitFor();
  await aud.waitForTimeout(600);
  const cards = aud.locator('.strip .card');
  const tops = await cards.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
  assert((await cards.count()) === 12 && tops.length === 1, `the stats strip is one row of 12 cards (rows at ${tops.join(', ')})`);
  const stripTop = (await aud.locator('.bg > .strip').boundingBox()).y;
  const lowest = await aud.locator('[data-space]').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
  assert(lowest <= stripTop + 1, `no space is under the stats strip (lowest space ends at ${Math.round(lowest)}, the strip starts at ${Math.round(stripTop)})`);
  const tokensLow = await aud.locator('.tok.on-board').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
  assert(tokensLow <= stripTop + 1, 'nor a token');
  if (process.env.SHOTS) await aud.screenshot({ path: `${process.env.SHOTS}/boardgame-crowd.png` });
  await ctx2.close();

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
