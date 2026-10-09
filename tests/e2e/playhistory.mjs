// Undo everywhere in play: the 📜 Log's 🕘 History (scores, steps and rolls in one list, back to any point and forward
// again), host choices that are steps too (a tile marked played, the picker, 👥 Players, a Final's players), and the
// keys that go with it (0, Esc, K, Shift+N, 1–9 in the reveals, Enter on a board game, keys from the audience window).
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

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
// (Single window: the log opens in the host panel, once it has measured it.)
const history = async () => (await page.locator('aside .item .text').first().waitFor(), page.locator('aside .item .text').allInnerTexts());
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
  await playWithPlayers(page, 3);
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

  // K covers the screen in any round, and the fixed bar's ⏸ Cover shows it (filled, saying ▶ Uncover).
  await page.keyboard.press('k');
  assert(await page.getByRole('button', { name: '▶ Uncover' }).evaluate((e) => e.classList.contains('on')), 'K covers the screen on the board (the button says ▶ Uncover)');
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
  // (It fades out.)
  await page.locator('.stage-box .sheet').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  assert((await page.locator('.stage-box .sheet').count()) === 0, "a player's sheet doesn't follow into the next round");
  await page.keyboard.press('d');
  await page.waitForTimeout(250);
  // (The count isn't in the Steps box until the dice have landed on stream.)
  assert(!(await page.locator('.bh input[aria-label="Steps"]').inputValue()), 'the Steps box stays empty while the dice roll');
  await page.keyboard.press('Enter');
  assert((await toast()).startsWith('Still rolling') && (await page.locator('.stage-box .ov').count()) === 1, 'Enter while the dice still roll waits for them');
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 8000 });
  await page.keyboard.press('Enter');
  assert((await toast()).startsWith('Alice: Landed on'), 'Enter with nobody selected moves the rolled steps');
  await page.keyboard.press('n');
  // 🎲 Roll reached with Tab, then Enter: it turns off while the dice roll and the keys go to a button near it (a
  // player's chip), but Enter still moves once they land (it doesn't press that button).
  const roll = page.locator('.panel [data-next]', { hasText: '🎲 Roll' });
  await roll.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(() => document.activeElement?.matches('.panel [data-next]') && document.activeElement.textContent?.includes('🎲 Roll'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Number(document.querySelector('.bh input[aria-label="Steps"]')?.value) > 0, null, { timeout: 8000 });
  await page.keyboard.press('Enter');
  await page.locator('.toast', { hasText: 'Player 2: Landed on' }).waitFor();
  assert(true, `🎲 Roll pressed with Enter (Tab there): Enter moves once the dice land (the keys were on ${await page.evaluate(() => document.activeElement?.textContent?.trim())})`);
  await page.keyboard.press('Shift+N');
  assert((await page.locator('.stage .turn-banner').innerText()).includes('Alice'), 'Shift+N goes back a turn');

  // The Final: a player sitting out is a step; 1–9 and Shift+N move the spotlight; a score plate's menu judges.
  await page.waitForTimeout(450);
  await page.locator('.rn button').last().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click().catch(() => {});
  await page.getByRole('button', { name: 'Start the round ▶' }).click();
  await page.locator('.title-card .round-name').waitFor({ state: 'detached' });
  await page.locator('.fj').waitFor();
  await page.locator('.fj .wagers input[data-plays]').nth(2).uncheck();
  assert((await page.locator('.fj .wagers input[data-wager]').count()) === 2, 'a player ticked out on the wager screen loses their wager box');
  await page.keyboard.press('Control+z');
  assert((await page.locator('.fj .wagers input[data-plays]:checked').count()) === 3, 'Ctrl+Z brings a player back into the Final');
  // A player added on the wager screen (👥 Players) plays it at once, as the round lets players at $0 play; Ctrl+Z takes
  // them out of both.
  await page.getByRole('button', { name: '👥 Players' }).click();
  await page.getByRole('dialog', { name: 'Players' }).getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('dialog', { name: 'Players' }).getByRole('button', { name: 'Done' }).click();
  await page.locator('.fj .wagers input[data-plays]:checked').nth(3).waitFor();
  assert((await page.locator('.fj .wagers .wrow.out').count()) === 0, 'a player added on the wager screen (👥 Players) plays the Final at once (the round lets players at $0 play)');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('.fj .wagers .wrow').length === 3);
  assert((await page.locator('.fj .wagers input[data-plays]:checked').count()) === 3, 'Ctrl+Z takes them out of the game and the Final');
  // ✎ Set the score… from a plate's menu (the Final has no score chips): what isn't a number is asked again, saying so;
  // "−$200" reads; and the wager row shows that score (not the $0 they can wager). (Forced: the plate is a button that's
  // off while nothing is done by clicking it, and its right-click menu still comes up.)
  const plate3 = page.locator('.stage-box .plate', { hasText: 'Player 3' });
  await plate3.click({ button: 'right', force: true });
  await page.getByRole('menuitem', { name: '✎ Set the score…' }).click();
  const scoreAsk = page.getByRole('group', { name: 'Player 3’s score:' });
  await scoreAsk.getByRole('textbox').fill('abc');
  await scoreAsk.getByRole('textbox').press('Enter');
  await page.locator('.toast', { hasText: '“abc” isn’t a number' }).waitFor();
  assert((await scoreAsk.count()) === 1 && (await plate3.locator('.score').innerText()) === '$400', 'Set the score with no number in it says so, and stays open (the score as it was)');
  await scoreAsk.getByRole('textbox').fill('−$200');
  await scoreAsk.getByRole('textbox').press('Enter');
  await scoreAsk.waitFor({ state: 'detached' });
  assert((await plate3.locator('.score').innerText()) === '−$200', 'a score typed as “−$200” reads (a symbol and a minus sign around the number)');
  const row3 = page.locator('.fj .wagers .wrow', { hasText: 'Player 3' });
  const tip3 = await row3.locator('input[data-wager]').getAttribute('title');
  assert(tip3 === 'No limit now (their score: −$200)', `the wager box of a player below 0 says their real score in its tooltip (${tip3})`);
  // (Back to $400 the same way, before the wagers.)
  await plate3.click({ button: 'right', force: true });
  await page.getByRole('menuitem', { name: '✎ Set the score…' }).click();
  await scoreAsk.getByRole('textbox').fill('400');
  await scoreAsk.getByRole('textbox').press('Enter');
  await scoreAsk.waitFor({ state: 'detached' });
  assert((await plate3.locator('.score').innerText()) === '$400', 'and a plain number still sets it ($400)');
  // A wager past the most points is kept at the most, and its box says so (not a digit typed on past it).
  const wager1 = page.locator('.fj .wagers input[data-wager]').first();
  await wager1.fill('1000000000000');
  await wager1.press('9');
  await page.locator('.toast', { hasText: 'At most $1,000,000,000,000' }).waitFor();
  assert((await wager1.inputValue()) === '1000000000000', `a wager typed on past the most points shows the most in its box (${await wager1.inputValue()})`);
  for (let i = 0; i < 3; i++) await page.locator('.fj .wagers input[data-wager]').nth(i).fill(String((i + 1) * 100));
  // A wager already in is changed in its box: one step, named with the old and the new amount.
  await page.locator('.fj .wagers input[data-wager]').first().fill('150');
  await page.locator('.panel .status').click();
  await page.keyboard.press('l');
  const wagerSteps = await history();
  assert(
    /’s wager: \$100 → \$150$/.test(wagerSteps[0]) && /’s wager: \$300$/.test(wagerSteps[1]),
    `a wager typed is a step, a change says from what to what (${wagerSteps.slice(0, 2).join(' | ')})`,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Show question ▶' }).click();
  await page.getByRole('button', { name: 'Reveal answer ▶' }).click();
  await page.getByRole('button', { name: 'Start player reveals ▶' }).click();
  await page.locator('.spot').waitFor();
  const spot = () => page.locator('.spot-name').innerText();
  const order = await page.locator('.fj .pl .name').allInnerTexts();
  // In the reveals a wager not shown yet can still be fixed in its row (a step); once shown, it's no longer a field.
  const firstRow = page.locator('.fj .pl').first();
  const rowBox = firstRow.locator('input[data-reveal-wager]');
  assert(/^\d+$/.test(await rowBox.inputValue()), 'in the reveals a wager not shown yet is still a field');
  await rowBox.fill('120');
  await rowBox.press('Enter');
  await page.locator('.panel .status').click();
  await page.keyboard.press('l');
  assert(/’s wager: \$\d+ → \$120$/.test((await history())[0]), 'changing it in the reveals is a step too');
  await page.keyboard.press('Escape');
  // Already at the most points, a bigger one typed there puts the most back in the box (not the digits typed).
  await rowBox.fill('1000000000000');
  await rowBox.press('Enter');
  // (The wager screen's own "At most" gone first, so the one waited for is this box's.)
  await page.locator('.toast', { hasText: 'At most' }).waitFor({ state: 'detached' });
  await rowBox.fill('10000000000009');
  await rowBox.press('Enter');
  await page.locator('.toast', { hasText: 'At most $1,000,000,000,000' }).waitFor();
  assert((await rowBox.inputValue()) === '1000000000000', `in the reveals too, a wager past the most shows the most in its box (${await rowBox.inputValue()})`);
  await rowBox.fill('120');
  await rowBox.press('Enter');
  await firstRow.getByRole('button', { name: 'Show wager' }).click();
  await page.waitForFunction(() => document.querySelector('.spot-wager')?.textContent?.includes('120'));
  assert((await rowBox.count()) === 0, 'Show wager puts the changed wager on screen, and the field goes');
  await page.keyboard.press('3');
  assert((await spot()) === order[2], '3 spotlights the third player in the reveal order');
  // Screen readers hear the spotlight and the wager shown (on the stage and in the rows, not the status line).
  const said = () => page.evaluate(() => document.getElementById('live-region')?.dataset.said ?? '');
  await page.waitForFunction((n) => (document.getElementById('live-region')?.dataset.said ?? '').includes(`Spotlight: ${n}`), order[2]);
  await page.keyboard.press('n');
  await page.waitForFunction((n) => (document.getElementById('live-region')?.dataset.said ?? '').includes(`${n} wagered $`), order[2]);
  assert(true, `the spotlight and N's wager are said (“${await said()}”)`);
  await page.keyboard.press('Shift+N');
  assert((await spot()) === order[1], 'Shift+N spotlights the player before');
  await page.waitForFunction((n) => (document.getElementById('live-region')?.dataset.said ?? '').includes(`Spotlight: ${n}`), order[1]);
  assert(true, 'and says so');
  await page.locator('.stage-box .plate', { hasText: order[0] }).click();
  assert((await spot()) === order[0], 'clicking a score plate spotlights that player');
  await page.locator('.stage-box .plate', { hasText: order[0] }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /✔ Right/ }).click();
  await page.locator('.spot-result').waitFor();
  assert((await page.locator('.spot-result').innerText()).includes('CORRECT'), "a plate's right-click menu judges the player");
  await page.waitForFunction((n) => (document.getElementById('live-region')?.dataset.said ?? '').includes(`${n} right, now $`), order[0]);
  assert(true, `and the judgment is said, with the new score (“${await said()}”)`);
  assert(await page.getByRole('button', { name: '↶ Undo' }).isEnabled(), '↶ Undo is there in the reveals too');
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await page.locator('.spot-result').waitFor({ state: 'detached' });
  assert(true, 'and takes the judgment back');

  // Dual window: keys pressed in the audience window work on the host.
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
  await aud.locator('.spot').waitFor();
  await aud.locator('.aud').click();
  await aud.keyboard.press('k');
  await page.waitForFunction(() => [...document.querySelectorAll('.panel .fixed button.on')].some((b) => b.textContent?.includes('Uncover')));
  assert(true, 'K pressed in the audience window covers the screen');
  await aud.keyboard.press('k');
  await aud.keyboard.press('2');
  await page.waitForFunction((name) => document.querySelector('.spot-name')?.textContent === name, order[1]);
  assert(true, 'number keys from the audience window move the spotlight');
  // With the audience window the 📜 Log opens beside the host's view, not over the panel's buttons (the keys reach them).
  await page.keyboard.press('l');
  await page.locator('aside[aria-label="Log"]').waitFor();
  const exitFree = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.panel .fixed button')].find((x) => x.textContent?.includes('🚪 Exit'));
    b?.scrollIntoView({ block: 'center' });
    const r = b?.getBoundingClientRect();
    const at = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && !!b?.contains(at);
  });
  assert(exitFree, 'with the audience window, the 📜 Log leaves 🚪 Exit in sight (it’s beside the panel, not over it)');
  await page.keyboard.press('l');
  await page.locator('aside[aria-label="Log"]').waitFor({ state: 'detached' });
  await aud.close();

  // A player taken out in the round before the Final, back with ↶ Undo on its wager screen and out again with ↷ Redo:
  // they never join the Final on the way, so it isn't left waiting on a wager nobody can type.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  p2.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
  await p2.goto(pathToFileURL(file).href);
  await addClassicRounds(p2);
  await playWithPlayers(p2, 3);
  await p2.getByRole('button', { name: 'Start game ▶' }).click();
  await p2.getByRole('button', { name: 'Skip intro' }).click();
  // Player 3 has $500 (enough to play the Final), then leaves.
  await p2.keyboard.press('3');
  await p2.locator('.award input').fill('500');
  await p2.locator('.award input').press('Enter');
  await p2.getByRole('button', { name: '👥 Players' }).click();
  await p2.getByRole('button', { name: 'Remove Player 3' }).click();
  await p2.locator('.modal .ask').getByRole('button', { name: 'Remove', exact: true }).click();
  await p2.getByRole('button', { name: 'Done', exact: true }).click();
  await p2.getByRole('dialog', { name: 'Players' }).waitFor({ state: 'detached' });
  await p2.waitForTimeout(450);
  await p2.locator('.rn button').last().click();
  // (Its Yes takes no click in its first 400 ms.)
  await p2.getByRole('button', { name: 'Yes', exact: true }).waitFor();
  await p2.waitForTimeout(450);
  await p2.getByRole('button', { name: 'Yes', exact: true }).click();
  await p2.getByRole('button', { name: 'Start the round ▶' }).click();
  await p2.locator('.fj .wagers').waitFor();
  const wrows = p2.locator('.fj .wagers .wrow');
  const wagerBoxes = p2.locator('.fj .wagers input[data-wager]');
  assert((await wrows.count()) === 2 && (await wagerBoxes.count()) === 2, 'the Final has the two players left');
  await p2.getByRole('button', { name: '↶ Undo' }).click();
  await p2.waitForFunction(() => document.querySelectorAll('.fj .wagers .wrow').length === 3);
  assert((await wagerBoxes.count()) === 2 && (await wrows.filter({ hasText: 'Player 3' }).locator('input[data-wager]').count()) === 0, '↶ Undo on the wager screen brings Player 3 back into the game, not into the Final');
  await p2.getByRole('button', { name: '↷ Redo' }).click();
  await p2.waitForFunction(() => document.querySelectorAll('.fj .wagers .wrow').length === 2);
  // (Players 1 and 2 at $0 wager 0, filled in: every wager is in.)
  assert(
    (await p2.getByRole('button', { name: 'Show question ▶' }).isEnabled()) && (await wagerBoxes.count()) === 2,
    '↷ Redo takes them out again, and Show question ▶ is there to press (nothing waits on Player 3)',
  );
  await ctx2.close();

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
