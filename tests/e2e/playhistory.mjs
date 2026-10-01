// Undo everywhere in play: the 📜 Log's 🕘 History (scores, steps and rolls in one list, back to any point and forward
// again), host choices that are steps too (a tile marked played, the picker, 👥 Players, a Final's players), and the
// keys that go with it (0, Esc, K, Shift+N, 1–9 in the reveals, Enter on a board game, keys from the audience window).
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
const dialogs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const toast = () => page.locator('.toast').innerText();
const tile = (i) => page.locator('.stage-box .board .tile').nth(i);
const isUsed = (i) => tile(i).evaluate((e) => e.classList.contains('used'));
const scores = async () => (await page.locator('.panel .p .score').allInnerTexts()).join(' ');
const names = async () => (await page.locator('.panel .p .sel').allInnerTexts()).map((t) => t.replace(/^\d+\s*/, '')).join(', ');
const selected = () => page.locator('.panel .p .sel[aria-pressed="true"]').count();
const history = () => page.locator('aside .item .text').allInnerTexts();
const nextRound = async () => {
  await page.waitForTimeout(450);
  await page.locator('.rn button').last().click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
  // The round's title card (these are RPG and board-game rounds): N goes on.
  await page.locator('.stage-box .title-card').waitFor();
  await page.keyboard.press('n');
};

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  for (const mode of [/RPG/, /Board game/]) {
    await page.getByRole('button', { name: '＋ Add round' }).click();
    await page.getByRole('menuitem', { name: mode }).click();
    // A second screen, east of the first.
    if (String(mode).includes('RPG')) await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  }
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();

  // Right-click a tile: skip it without opening it. It's a step: Ctrl+Z puts it back, Ctrl+Shift+Z marks it again.
  await tile(1).click({ button: 'right' });
  const menu = await page.getByRole('menu').innerText();
  assert(menu.includes('▶ Open') && menu.includes('Mark as played'), 'right-clicking a tile offers Open and Mark as played');
  await page.getByRole('menuitem', { name: /Mark as played/ }).click();
  assert(await isUsed(1), 'Mark as played uses the tile up without opening it');
  await page.keyboard.press('Control+z');
  assert(!(await isUsed(1)) && (await toast()).includes('Undid Category 2 $200 marked as played'), 'Ctrl+Z puts the tile back');
  await page.keyboard.press('Control+Shift+z');
  assert(await isUsed(1), 'Ctrl+Shift+Z marks it again');

  // 0 selects everyone (a group award is 0, then Enter), Esc clears the selection.
  await page.keyboard.press('0');
  assert((await selected()) === 3, '0 selects everyone');
  const [border, own] = await page.locator('.panel .p.on').first().evaluate((e) => {
    const probe = document.body.appendChild(document.createElement('i'));
    probe.style.color = getComputedStyle(e).getPropertyValue('--c');
    const color = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(e).borderTopColor, color];
  });
  assert(border === own, `a selected player's chip keeps their color (${border}, not the ⏸ Cover's highlight)`);
  await page.keyboard.press('0');
  assert((await selected()) === 0, '0 again selects no one');
  await page.keyboard.press('0');
  await page.keyboard.press('Escape');
  assert((await selected()) === 0, 'Esc clears the selection');
  await page.keyboard.press('0');
  await page.locator('.award input').fill('300');
  await page.locator('.award input').press('Enter');
  assert((await scores()) === '$300 $300 $300', 'the group award goes to everyone');
  // A button clicked with the mouse keeps Enter = Award, even after other keys.
  await page.locator('.panel .p .sel').nth(1).click();
  await page.keyboard.press('3');
  await page.locator('.award input').fill('100');
  await page.locator('.award input').blur();
  await page.keyboard.press('Enter');
  assert((await scores()) === '$300 $400 $400', 'Enter awards after clicking a player (not a press of the clicked button)');
  // The picker (P then a number) is a step, and ↶ Undo says what it would undo.
  await page.keyboard.press('p');
  await page.keyboard.press('1');
  const undoTitle = await page.getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  assert(undoTitle.startsWith('Undo: Player 1 picks next'), `↶ Undo names the step (${undoTitle})`);

  // 👥 Players: each change is a step; Esc leaves the name box, then closes.
  await page.getByRole('button', { name: '👥 Players' }).click();
  await page.getByLabel('Player 1 name').fill('Alice');
  await page.keyboard.press('Escape');
  assert(await page.getByRole('dialog', { name: 'Players' }).isVisible(), 'the first Esc only leaves the name box');
  await page.keyboard.press('Escape');
  assert((await page.getByRole('dialog', { name: 'Players' }).count()) === 0, 'the next Esc closes the Players dialog');
  assert((await names()) === 'Alice, Player 2, Player 3', 'the new name is in the host panel');
  await page.keyboard.press('Control+z');
  assert((await names()) === 'Player 1, Player 2, Player 3' && (await toast()).includes('Undid Renamed Player 1 to Alice'), 'Ctrl+Z undoes the rename');
  await page.keyboard.press('Control+Shift+z');

  // 📜 Log opens on 🕘 History: everything, newest first, and "● Now".
  await page.keyboard.press('l');
  assert((await page.locator('aside .tab.on').innerText()).includes('History'), 'L opens the log on 🕘 History');
  const rows = await history();
  assert(
    rows[0] === 'Renamed Player 1 to Alice' && rows[1] === 'Player 1 picks next' && rows.at(-1) === 'Category 2 $200 marked as played',
    `the history lists steps and score changes newest first (${rows.join(' | ')})`,
  );
  assert((await page.locator('aside .now').count()) === 1, 'with nothing undone, ● Now is at the top');
  // Back to here on the oldest: asks inline (never a browser dialog), then everything after it is undone.
  const oldest = page.locator('aside .item').last();
  await oldest.hover();
  await oldest.getByRole('button', { name: '↶ Back to here' }).click();
  assert((await page.locator('aside .ia').innerText()).startsWith('Undo 4 steps'), 'going back more than one step asks inline first');
  await page.waitForTimeout(450);
  await page.locator('aside .ia').getByRole('button', { name: 'Undo 4 steps' }).click();
  assert((await scores()) === '$0 $0 $0' && (await names()).startsWith('Player 1') && (await isUsed(1)), 'Back to here undoes everything after the step, not the step');
  const undone = await page.locator('aside .item.redo').count();
  assert(undone === 4, 'the undone steps stay listed above ● Now');
  const newest = page.locator('aside .item').first();
  await newest.hover();
  await newest.getByRole('button', { name: '↷ Redo to here' }).click();
  await page.waitForTimeout(450);
  await page.locator('aside .ia').getByRole('button', { name: 'Redo 4 steps' }).click();
  assert((await scores()) === '$300 $400 $400' && (await names()).startsWith('Alice'), 'Redo to here brings them all back');
  await page.keyboard.press('Escape');

  // K covers the screen in any round, and the nav row's ⏸ Cover shows it.
  await page.keyboard.press('k');
  assert(await page.getByRole('button', { name: '⏸ Cover' }).evaluate((e) => e.classList.contains('on')), 'K covers the screen on the board');
  await page.keyboard.press('k');

  // Timer: +10 without restarting.
  await page.keyboard.press('t');
  await page.keyboard.press('Shift+T');
  assert(Number((await page.locator('.tc .left').innerText()).replace('s', '')) > 30, 'Shift+T adds 10 seconds to the countdown');
  await page.locator('.tc button[title="Hide timer"]').click();

  // Next round with tiles left asks, with the focus on its Cancel: Enter presses Cancel, even with a player selected.
  await page.keyboard.press('2');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.getByText('clues left · go on?').waitFor();
  await page.keyboard.press('Enter');
  assert(
    (await page.getByText('clues left · go on?').count()) === 0 && (await scores()) === '$300 $400 $400',
    'while Next round asks, Enter presses the focused Cancel (not Award)',
  );
  await page.keyboard.press('Escape');

  // The RPG's "Last:" line opens the history.
  await nextRound();
  await page.locator('.rh').waitFor();
  await page.keyboard.press('Numpad6');
  await page.locator('.rh .last').click();
  assert((await history())[0] === 'Party east', "the RPG's Last: line opens the history, where the move is");
  await page.keyboard.press('Escape');
  // A player's sheet on the stage is for this round.
  await page.keyboard.press('i');
  await page.locator('.stage-box .sheet').waitFor();

  // Board game: D, then Enter moves; Shift+N goes back a turn.
  await nextRound();
  await page.locator('.bh').waitFor();
  assert((await page.locator('.stage-box .sheet').count()) === 0, "a player's sheet doesn't follow into the next round");
  await page.keyboard.press('d');
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 8000 });
  await page.keyboard.press('Enter');
  assert((await toast()).startsWith('Still rolling') && (await page.locator('.stage-box .ov').count()) === 1, 'Enter while the dice still roll waits for them');
  await page.waitForTimeout(1400);
  await page.keyboard.press('Enter');
  assert((await toast()).startsWith('Alice: Landed on'), 'Enter with nobody selected moves the rolled steps');
  await page.keyboard.press('n');
  await page.keyboard.press('Shift+N');
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Alice'), 'Shift+N goes back a turn');

  // The Final: a player sitting out is a step; 1–9 and Shift+N move the spotlight; a score plate's menu judges.
  await page.waitForTimeout(450);
  await page.locator('.rn button').last().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click().catch(() => {});
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.final-label').waitFor();
  await page.locator('.fj input[type=checkbox]').nth(2).uncheck();
  await page.keyboard.press('Control+z');
  assert((await page.locator('.fj input[type=checkbox]:checked').count()) === 3, 'Ctrl+Z brings a player back into the Final');
  await page.getByRole('button', { name: /take wagers/ }).click();
  for (let i = 0; i < 3; i++) await page.locator('.fj .wagers input').nth(i).fill(String((i + 1) * 100));
  await page.getByRole('button', { name: 'Show question ▶' }).click();
  await page.getByRole('button', { name: 'Reveal answer ▶' }).click();
  await page.getByRole('button', { name: 'Start player reveals ▶' }).click();
  await page.locator('.spot').waitFor();
  const spot = () => page.locator('.spot-name').innerText();
  const order = await page.locator('.fj .pl .name').allInnerTexts();
  await page.keyboard.press('3');
  assert((await spot()) === order[2], '3 spotlights the third player in the reveal order');
  await page.keyboard.press('Shift+N');
  assert((await spot()) === order[1], 'Shift+N spotlights the player before');
  await page.locator('.stage-box .plate', { hasText: order[0] }).click();
  assert((await spot()) === order[0], 'clicking a score plate spotlights that player');
  await page.locator('.stage-box .plate', { hasText: order[0] }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /✔ Right/ }).click();
  await page.locator('.spot-result').waitFor();
  assert((await page.locator('.spot-result').innerText()).includes('CORRECT'), "a plate's right-click menu judges the player");
  assert(await page.getByRole('button', { name: '↶ Undo' }).isEnabled(), '↶ Undo is there in the reveals too');
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await page.locator('.spot-result').waitFor({ state: 'detached' });
  assert(true, 'and takes the judgment back');

  // Dual window: keys pressed in the audience window work on the host.
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
  await aud.locator('.spot').waitFor();
  await aud.locator('.aud').click();
  await aud.keyboard.press('k');
  await page.waitForFunction(() => [...document.querySelectorAll('.nav button.on')].some((b) => b.textContent?.includes('Cover')));
  assert(true, 'K pressed in the audience window covers the screen');
  await aud.keyboard.press('k');
  await aud.keyboard.press('2');
  await page.waitForFunction((name) => document.querySelector('.spot-name')?.textContent === name, order[1]);
  assert(true, 'number keys from the audience window move the spotlight');
  await aud.close();

  assert(!dialogs.length, 'no browser dialogs' + (dialogs.length ? ': ' + dialogs.join(' | ') : ''));
  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Play history E2E passed.');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/playhistory-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
