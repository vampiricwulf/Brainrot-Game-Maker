// Round modes: a game is a list of rounds and each picks a mode. Final Jeopardy is a round like any other (it can
// go in the middle), rounds can be reordered, duplicated and deleted, and games saved before modes still open.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { anyway, checkItem, goOnCheck, macClicks, mainButton, noDailyDoubles, openGameFile, playWithPlayers, leaveAnswer, confirmStrip } from './helpers.mjs';

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
  // ▶ Play isn't greyed with no rounds: a click says to add one, the keys on ✨ Try a sample game.
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.locator('.toast', { hasText: 'Add a round first' }).waitFor();
  await page.waitForFunction(() => !!document.activeElement?.matches('.first-round .sample'));
  assert(await page.locator('.first-round').isVisible(), '▶ Play with no rounds says “Add a round first”, the keys on ✨ Try a sample game');
  assert((await page.locator('.first-round .mode').count()) === 5, 'every mode can be the first round');
  await page.locator('.first-round').getByRole('button', { name: /Jeopardy board/ }).click();
  // (Its first tile is played below as a plain clue: no Daily Double may land on it at random when the game starts.)
  await noDailyDoubles(page);
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
  // Answers on paper for this one: a step named so (↶ Undo says it), and Ctrl+Z ticks it again.
  const typed = page.getByLabel('✍ Players type their answers on their phones');
  const finalMust = page.getByLabel('🚫 No Pass (everyone must play)');
  assert((await finalMust.isChecked()) && (await finalMust.isDisabled()), 'the Final shows 🚫 No Pass (everyone must play) ticked and fixed (everyone in it plays)');
  // (BOARD-9: with no choices, nothing of them shows unticked; with some, they stay in sight, dimmed and out of reach.)
  await typed.uncheck();
  assert((await page.locator('[data-choices-off]').count()) === 0 && (await page.getByRole('button', { name: '＋ Multiple choice' }).count()) === 0, 'unticked with no choices: no ＋ Multiple choice, nothing dimmed');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('input[data-final-typed]')?.checked === true);
  await page.getByRole('button', { name: '＋ Multiple choice' }).click();
  await page.getByRole('textbox', { name: 'Choice A', exact: true }).fill('Crisps');
  await typed.uncheck();
  const undoTitle = await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(undoTitle === 'Undo: Midgame Wager: players answer out loud or on paper (Ctrl+Z)', `unticking “✍ Players type their answers on their phones” is a step with its own name (${undoTitle})`);
  const off = page.locator('[data-choices-off]');
  const offState = await off.evaluate((el) => ({
    note: el.querySelector('.hint')?.textContent?.trim(),
    inert: !!el.querySelector('[inert]'),
    dim: +getComputedStyle(el.querySelector('[inert]')).opacity,
    a: el.querySelector('[data-field="choice-0"]')?.value,
  }));
  assert(
    offState.note === 'Off while players don’t type their answers: tick ✍ above to use these choices (they’re kept).' && offState.inert && offState.dim < 1 && offState.a === 'Crisps',
    `unticked, the choices stay in sight, dimmed and out of reach, with a line that says why (${JSON.stringify(offState)})`,
  );
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelector('input[data-final-typed]')?.checked === true);
  assert((await off.count()) === 0 && (await page.getByRole('textbox', { name: 'Choice A', exact: true }).inputValue()) === 'Crisps', 'Ctrl+Z: it is ticked again, its choices back in reach');
  await page.getByRole('button', { name: 'Take the choices off' }).click();
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
  const order = ['▶ Test this round', '✎ Rename', '⧉ Duplicate', '📋 Copy round', '📋 Paste round', '▲ Move up', '▼ Move down', '🗑 Delete round'];
  assert(tabMenu.length === order.length && order.every((x, n) => tabMenu[n].startsWith(x)), `in one order: test, rename, duplicate, copy, paste, move, delete (${tabMenu.join(', ')})`);
  await page.keyboard.press('Escape');
  // The round's page header has the same menu: its ⋯ at the end, and a right-click on the bar.
  await roundTab('Midgame Wager').click();
  await page.locator('.ra').getByRole('button', { name: 'More for this round' }).click();
  const headMenu = (await page.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]);
  assert(JSON.stringify(headMenu) === JSON.stringify(tabMenu), `the header's ⋯ opens the round's menu (${headMenu.join(', ')})`);
  await page.keyboard.press('Escape');
  await page.locator('.ra h2').click({ button: 'right' });
  assert(await page.getByRole('menu').getByRole('menuitem', { name: '📋 Copy round' }).isVisible(), 'and so does a right-click on the bar');
  await page.keyboard.press('Escape');
  // Ctrl+C / Ctrl+V on a round's tab: copied, then pasted after it, the keys on the copy's tab.
  await roundTab('Midgame Wager').focus();
  await page.keyboard.press('Control+c');
  await page.locator('.toast', { hasText: 'Copied “Midgame Wager”' }).waitFor();
  await page.keyboard.press('Control+v');
  await page.waitForFunction(() => document.activeElement?.matches('nav button.round-tab') && /Midgame Wager \(copy/.test(document.activeElement.textContent ?? ''), null, { timeout: 3000 });
  assert((await roundNames()).length === 5 && (await roundNames())[2].startsWith('Midgame Wager (copy'), `Ctrl+C / Ctrl+V on a round's tab copy it and paste it after it, the keys on its tab (${(await roundNames()).join(', ')})`);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.querySelectorAll('nav > button.round-tab').length === 4, null, { timeout: 3000 });
  // Renamed on its tab, then its Round name box clicked: Backspace types there, and deletes no round.
  await roundTab('Midgame Wager').dblclick();
  await page.locator('nav input.tab-name').fill('Midgame Wagers');
  await page.locator('.grid input[data-round-name]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.activeElement?.matches('.grid input[data-round-name]') && document.activeElement.value === 'Midgame Wager');
  assert((await roundNames()).join('|') === 'Jeopardy!|Midgame Wager|Double Jeopardy!|Final Jeopardy!', 'renamed on its tab, then its Round name box clicked: Backspace types there, and deletes no round');
  // Renamed, then a click on nothing: the keys go back to the tab renamed (not the first round's).
  await roundTab('Midgame Wager').dblclick();
  await page.locator('nav .navlabel', { hasText: 'Rounds' }).click();
  await page.waitForFunction(() => document.activeElement?.matches('nav > button.round-tab') && document.activeElement.textContent.trim().endsWith('Midgame Wager'));
  assert(true, 'renamed, then a click on nothing: its tab has the keys again');
  // Renamed, then another tab clicked where a button clicked doesn't take the focus (Safari, a Mac): that tab has the keys.
  const chromiumClicks = await macClicks(page);
  await roundTab('Midgame Wager').dblclick();
  await page.locator('nav input.tab-name').fill('Midgame Wager');
  await page.locator('nav > button.round-tab').first().click();
  await page.waitForFunction(() => document.activeElement === document.querySelector('nav > button.round-tab') && document.activeElement.getAttribute('aria-current') === 'page');
  assert(true, 'renamed, then another tab clicked, with a Mac’s clicks: that round shows, and its tab has the keys (not the one renamed)');
  await chromiumClicks();

  // Play: board → Final in the middle → board → Final → end.
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // The board is up: the keys go on from its first open tile (arrows + Enter), and the status line says so.
  await page.waitForFunction(() => document.activeElement?.matches('.stage-box .board .tile:not(.used)'));
  assert((await page.locator('.panel .status').innerText()).includes('Pick a tile on the board. (arrows + Enter)'), 'the board comes up with its first open tile in focus: “Pick a tile on the board. (arrows + Enter)”');
  // N on a clue does what the main button shows: 👁 Reveal answer, then ▦ Done ▶ board.
  // (The board takes its keys once it has settled.)
  await page.waitForTimeout(200);
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
  await confirmStrip(page).getByRole('button', { name: 'Go to Midgame Wager ▶' }).click();
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
  await mainButton(page, 'Show question ▶').click();
  await mainButton(page, '👁 Reveal answer').click();
  await mainButton(page, 'Start player reveals ▶').click();
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
  // With clues left on this board it asks first, like Next round; Keep playing puts the list back on this round.
  await picker.selectOption({ label: '🏆 Final Jeopardy!' });
  const goTo = page.getByText(/clues? (is|are) left in Double Jeopardy!\. Go to Final Jeopardy!\?/);
  await goTo.waitFor();
  await page.waitForTimeout(450);
  // (It asks in the strip above the fixed bar.)
  await page.locator('.panel .confirm').getByRole('button', { name: 'Keep playing' }).click();
  assert(
    (await goTo.count()) === 0 && (await picker.locator('option:checked').innerText()).includes('Double Jeopardy!'),
    'Keep playing on “N clues are left in Double Jeopardy!. Go to Final Jeopardy!?” stays on this round, and the round list shows it again',
  );
  await picker.selectOption({ label: '🏆 Final Jeopardy!' });
  await page.waitForTimeout(450);
  await leaveAnswer(page).click();
  // Its title card, by mistake: ◀ Previous round goes back without starting it (its category never on stream).
  await page.locator('.title-card .round-name').filter({ hasText: 'Final Jeopardy!' }).waitFor();
  await page.waitForTimeout(450); // the round buttons ignore clicks right after they appear
  await page.getByRole('button', { name: '◀ Previous round' }).click();
  await page.locator('.stage-box .board').waitFor();
  assert((await page.locator('.fj').count()) === 0, 'the Final’s title card has ◀ Previous round: back to Double Jeopardy! without starting the Final');
  await page.waitForTimeout(450);
  await picker.selectOption({ label: '🏆 Final Jeopardy!' });
  await page.waitForTimeout(450);
  await leaveAnswer(page).click();
  // (Its title card was shown already: it opens on the round.)
  await page.locator('.fj').waitFor();
  assert((await page.locator('.stage-box .full').innerText()).toUpperCase().includes('FINAL JEOPARDY!'), 'the round picker jumps straight to any round');
  // No "Lock category, take wagers" step: the category is up and the wager screen with it, who plays on the same screen.
  assert((await page.getByRole('button', { name: /Lock category|take wagers/ }).count()) === 0, 'the Final opens straight on its wager screen (no lock step)');
  assert((await page.locator('.panel .status').innerText()).includes('Category on screen · taking wagers'), 'the status line says the category is up and wagers are being taken');
  // This Final lets players with $0 play: they can wager up to $2,000 (their score, or $2,000 if they have less), so
  // nothing is filled in for them and Show question waits on them too.
  const wagerBoxes = page.locator('.fj .wagers input[data-wager]');
  const plays = page.locator('.fj .wagers input[data-plays]');
  const showQuestion = mainButton(page, 'Show question ▶');
  const limits = page.getByLabel('Ignore the limits');
  /** The wager screen's own line saying whose wager it waits on (none: every wager is fine). */
  const waiting = page.locator('.fj .row .muted', { hasText: /^(Waiting on|Not a whole number|Over the max)/ });
  assert(!(await limits.isChecked()), 'the limits hold by default (Ignore the limits unticked)');
  assert(
    (await plays.count()) === 2 && (await Promise.all([0, 1].map((i) => wagerBoxes.nth(i).inputValue()))).join('|') === '|',
    'each player’s row has its plays tick and its wager box; a player at $0 gets nothing filled in',
  );
  const tips = await Promise.all([0, 1].map((i) => wagerBoxes.nth(i).getAttribute('title')));
  assert(
    tips.every((t) => t === 'Max $2,000 (their score, or $2,000 if they have less)') && (await page.locator('.fj [data-wager-rule]').innerText()) === '(max: their score, or $2,000)',
    `both can wager up to $2,000 (one has less, one is at $0): their boxes say so, and the line by Ignore the limits says the rule (${tips.join(' | ')})`,
  );
  // Show question ▶ is never greyed: pressed with a wager missing, the keys go to its box and the status line says whose.
  assert((await showQuestion.isEnabled()) && (await waiting.count()) === 1, 'Show question waits for the wagers, never greyed');
  await showQuestion.click();
  await page.locator('.toast', { hasText: /Waiting on .+: type their wagers, or untick them to sit out/ }).waitFor();
  assert(
    (await wagerBoxes.first().evaluate((b) => b === document.activeElement)) && (await page.locator('.panel .status').innerText()).includes('taking wagers') && (await goOnCheck(page).count()) === 0,
    'pressed with a wager missing: the keys go to its box, no check, the question not up',
  );
  await wagerBoxes.first().fill('100');
  assert((await waiting.count()) === 1, 'the player at $0 still holds it up: they have something to wager');
  await wagerBoxes.nth(1).fill('50');
  assert((await waiting.count()) === 0, 'a player at $0 can wager $50 (up to $2,000)');
  await wagerBoxes.nth(1).fill('2001');
  assert((await waiting.count()) === 1 && (await waiting.innerText()).startsWith('Over the max'), 'over $2,000 is over their max with the limits on');
  await limits.check();
  assert((await waiting.count()) === 0 && (await page.locator('.fj [data-wager-rule]').innerText()) === '(any wager goes)', 'ticking Ignore the limits lets it go (“any wager goes”)');
  await limits.uncheck();
  await wagerBoxes.nth(1).fill('50');
  assert((await waiting.count()) === 0, 'and back within the max, it goes with the limits on');
  // Ticking a player out on the wager screen drops their box (they sit out); ticked back in, their wager is still there.
  await plays.nth(1).uncheck();
  assert((await wagerBoxes.count()) === 1 && (await page.locator('.fj .wagers .wrow.out').innerText()).includes('sits out'), 'a player ticked out sits out: no wager box');
  assert((await waiting.count()) === 0, 'and Show question doesn’t wait on them');
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
  // The reveals: N shows the wager; then their verdict is due, in their row only (C / X), the blue button Next player ▶;
  // N asks for the verdict first (a must: no “anyway”), C there judges them and closes it, then N the next player.
  const revealMain = () => page.locator('.panel [data-next]').innerText();
  const spot = () => page.locator('.fj .pl.cur .name').innerText();
  assert((await revealMain()).startsWith('Show wager ▶'), `the reveals start on Show wager (${await revealMain()})`);
  const first = await spot();
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Next player'));
  assert(
    !/[✔✘]/.test(await revealMain()) && (await page.locator('.fj .pl.cur').getByRole('button', { name: `✔ Right: ${first}` }).isEnabled()),
    `after Show wager the blue button is Next player ▶, the verdict ✔ Right (C) / ✘ Wrong (X) in ${first}'s row (${await revealMain()})`,
  );
  await page.keyboard.press('n');
  await checkItem(page, 'verdict').waitFor();
  assert((await spot()) === first && (await anyway(page).count()) === 0, 'N doesn’t go on past a player whose wager is up until they’re judged: it asks for the verdict (no “anyway”)');
  await goOnCheck(page, { ready: true }).waitFor();
  await page.keyboard.press('c');
  await goOnCheck(page).waitFor({ state: 'detached' });
  assert((await spot()) === first && (await revealMain()).startsWith('Next player'), 'C in the check judges them and closes it, the spotlight staying on them');
  // Already judged, their wager can still be halved or made 0 in their row, and their points follow.
  const row = page.locator('.fj .pl.cur');
  const wagerOf = async () => Number((await row.locator('.cell.sw').innerText()).match(/wager\D*([\d,]+)/)[1].replace(/,/g, ''));
  const plate = page.locator('.stage-box .plate', { hasText: first }).locator('.score');
  const pts = async () => Number((await plate.innerText()).replace(/[^\d-]/g, ''));
  const [w0, s0] = [await wagerOf(), await pts()];
  await row.getByRole('button', { name: `Halve wager: ${first}` }).click();
  const [w1, s1] = [await wagerOf(), await pts()];
  await row.getByRole('button', { name: `Nullify wager: ${first}` }).click();
  const [w2, s2] = [await wagerOf(), await pts()];
  assert(
    w1 === Math.floor(w0 / 2) && s1 === s0 - (w0 - w1) && w2 === 0 && s2 === s0 - w0 && (await row.getByRole('button', { name: `Halve wager: ${first}` }).count()) === 0,
    `½ Halve and 0 Nullify change a judged player's wager and points (${w0}/${s0} → ${w1}/${s1} → ${w2}/${s2})`,
  );
  // Two Ctrl+Z put back their wager and their points.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(([p, n]) => [...document.querySelectorAll('.stage-box .plate')].find((x) => x.textContent.includes(p))?.querySelector('.score')?.textContent.replace(/[^\d-]/g, '') === String(n), [first, s0]);
  await page.keyboard.press('n');
  await page.waitForFunction((f) => document.querySelector('.fj .pl.cur .name')?.textContent !== f, first);
  assert((await page.locator('.fj [data-finish-early]').count()) === 1, 'the next one’s wager not up yet: the quiet Finish now… for finishing early is there');
  await page.keyboard.press('n');
  // (The last verdict due: the blue button is Finish game ▶ itself, so the quiet one for finishing early is gone.)
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.startsWith('Finish game') && !document.querySelector('.fj [data-finish-early]'));
  assert(true, 'the last verdict due: the blue button is Finish game ▶, and the quiet Finish now… is gone (one way to finish)');
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
  await openGameFile(p2, resolve('test-results/v1-game.json'));
  await p2.waitForFunction(() => document.querySelector('input.title')?.value === 'Old Game', null, { timeout: 5000 }).catch(() => {
    throw new Error('the old game did not open: ' + alerts.join(' | '));
  });
  const oldRounds = (await p2.locator('nav > button.round-tab').allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());
  assert(oldRounds.join('|') === 'Classic|Old Final', `an old game's Final becomes its last round (${oldRounds.join(', ')})`);
  await p2.getByRole('button', { name: 'Old Final' }).click();
  assert((await p2.getByLabel('Category').inputValue()) === 'History' && (await p2.getByLabel('Think time (seconds)').inputValue()) === '40', 'with its category and think time');
  // Its board played out (its one tile marked played): N says how to go on, and doesn't jump to the Final on stream.
  await playWithPlayers(p2, 2);
  await p2.getByRole('button', { name: 'Start game ▶' }).click();
  await p2.getByRole('button', { name: 'Skip intro' }).click();
  await p2.locator('.stage-box .board .tile').first().click({ button: 'right' });
  await p2.getByRole('menuitem', { name: /Mark as played/ }).click();
  await p2.locator('.panel', { hasText: 'Round complete!' }).waitFor();
  await p2.keyboard.press('n');
  await p2.locator('.toast', { hasText: 'Round complete: click Old Final ▶ to go on' }).waitFor();
  assert((await p2.locator('.stage-box .board').count()) === 1, 'N on a played-out board says to click Old Final ▶ to go on (the board stays)');
  await fresh.close();

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nRounds E2E passed.');
} finally {
  await browser.close();
}
