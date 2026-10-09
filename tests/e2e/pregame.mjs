// The ▶ Play screen before the game (players, ⚖ Game rules, the sticky Start bar, Ctrl+Z / Ctrl+Y there, History's
// Go there), the rules mid-game, a rematch keeping the players' pictures, and phone buzzers in a copy without a buzzer
// server (an old game with Buzzer mode on, an exported player-only file).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportHtml, noDailyDoubles, openRules } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
// 4×4 white PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR42mP8z8AARLgBAAC0BAP/HpJ+EwAAAABJRU5ErkJggg==';
/** Drop a picture on an element, the way a file from the desktop arrives. */
async function dropPicture(locator, name) {
  const dt = await page.evaluateHandle(
    ([n, b64]) => {
      const d = new DataTransfer();
      d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], n, { type: 'image/png' }));
      return d;
    },
    [name, PNG],
  );
  for (const type of ['dragenter', 'dragover', 'drop']) await locator.dispatchEvent(type, { dataTransfer: dt });
}
const names = () => page.locator('.pregame .player input.name').evaluateAll((els) => els.map((e) => e.value));
const historyLabels = () => page.locator('.hist .hr:not(.origin) .lb').allInnerTexts();
const play = page.getByRole('button', { name: '▶ Play', exact: true });
const back = page.getByRole('button', { name: '◀ Back to editor' });
const start = page.getByRole('button', { name: 'Start game ▶' });

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  await noDailyDoubles(page);

  // ---------- 🔊 Sounds points to ▶ Play ----------
  await page.getByRole('button', { name: '🔊 Sounds' }).click();
  const elsewhere = page.locator('.elsewhere');
  assert((await elsewhere.innerText()).includes('⚖ Game rules') && (await elsewhere.getByRole('button', { name: 'Open the Play screen' }).count()) === 1, '🔊 Sounds says, at the top, where the players and rules are, with a ▶ Play button');
  assert((await page.getByRole('button', { name: /^Back to the built-in .* sound$/ }).count()) === 0, '(no ↺ until a sound has a file of its own)');

  // ---------- Enter adds the next player: each one named is one step, called by their name ----------
  await play.click();
  await start.waitFor();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.keyboard.type('Bo');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Cy');
  await page.waitForTimeout(900);
  assert((await names()).join() === 'Bo,Cy', 'Enter in a name adds the next player, typing in their name');
  assert((await page.getByRole('button', { name: 'Move Bo down' }).count()) === 1 && (await page.getByRole('button', { name: 'Move Cy up' }).count()) === 1, '▲/▼ say whose they are');
  // ▲▼ with the keyboard: the keys stay on the moved row's arrow (the other one at an end), so Enter moves it again.
  await page.getByRole('button', { name: 'Move Bo down' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Move Bo up');
  assert((await names()).join() === 'Cy,Bo', '▼ moves Bo down, and the keys go to Bo’s ▲ (▼ is off at the end)');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Move Bo down');
  assert((await names()).join() === 'Bo,Cy', 'and Enter there moves Bo back up');
  // Wide windows put the rules beside the players: a player's row still fits on one line there.
  for (const [width, height] of [[1280, 720], [1366, 768], [1400, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const nameBox = await page.getByLabel('Player 1 name').boundingBox();
    const del = await page.getByRole('button', { name: 'Delete Bo' }).boundingBox();
    assert(del.y < nameBox.y + nameBox.height, `at ${width}px a player's ▲ ▼ 🗑 stay on their row's line`);
    // A laptop's window too: the display choice beside the players, in view without scrolling.
    const players = await page.locator('[data-place="play:players"]').boundingBox();
    const display = await page.locator('section[aria-labelledby="pregame-display"]').boundingBox();
    assert(display.x > players.x + players.width && display.y + display.height <= height - 60, `at ${width}×${height} 🖥 Display is beside 👥 Players, in view`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------- The sticky Start bar, with ⚖ Game rules open, at 1280×720 ----------
  const rules = await openRules(page);
  assert((await rules.locator('summary h2').innerText()).includes('⚖ Game rules'), 'the rules’ fold is a heading of its own: ⚖ Game rules');
  await page.evaluate(() => window.scrollTo(0, 0));
  const startBox = await start.boundingBox();
  const onTop = await start.evaluate((b) => {
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === b;
  });
  assert(startBox.y + startBox.height <= 720 && onTop, 'Start game ▶ is in view at the foot of the window with the rules open');
  // The notes beside it (a Daily Double not placed yet) wrap in their own room: Start stays at the right, on Back's line.
  const backBox = await back.boundingBox();
  assert(Math.abs(backBox.y + backBox.height / 2 - (startBox.y + startBox.height / 2)) < 4 && startBox.x + startBox.width > 1280 - 40, 'Start game ▶ stays at the right end of the bar, level with ◀ Back');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling');

  // ---------- Rules: whole-second countdown ----------
  const countdown = rules.getByLabel(/Default clue countdown/);
  await countdown.fill('-5');
  await countdown.press('Tab');
  assert((await countdown.inputValue()) === '1', 'a countdown below 1 second becomes 1 (blank or 0: none)');
  await countdown.fill('');
  await countdown.press('Tab');

  // ---------- Ctrl+Z / Ctrl+Y before the game ----------
  const negative = rules.getByLabel('Allow negative scores');
  const wasOn = await negative.isChecked();
  await negative.click();
  await page.locator('.pregame h1').click();
  await page.keyboard.press('Control+z');
  assert((await negative.isChecked()) === wasOn, 'Ctrl+Z takes back a rule changed here');
  await page.keyboard.press('Control+y');
  assert((await negative.isChecked()) !== wasOn, 'Ctrl+Y brings it back');
  await page.keyboard.press('Control+Shift+z');
  assert((await negative.isChecked()) !== wasOn, '(nothing more to redo)');
  await page.getByRole('button', { name: 'Delete Cy' }).click();
  assert((await names()).join() === 'Bo', '🗑 deletes Cy');
  await page.locator('.pregame h1').click();
  await page.keyboard.press('Control+z');
  assert((await names()).join() === 'Bo,Cy', 'Ctrl+Z brings a deleted player back in the list at once');
  // In a name with typing of its own, Ctrl+Z is the box's own (as in the editor).
  const bo = page.getByLabel('Player 1 name');
  await bo.click();
  await bo.press('End');
  await page.keyboard.type('b');
  await page.keyboard.press('Control+z');
  assert((await bo.inputValue()) === 'Bo' && (await names()).join() === 'Bo,Cy', 'in a name just typed in, Ctrl+Z undoes the typing there');
  await page.locator('.pregame h1').click();

  // ---------- History: the steps, and Go there back to ▶ Play ----------
  await back.click();
  await page.getByRole('button', { name: /🕘 History/ }).click();
  const labels = await historyLabels();
  assert(labels.some((l) => l.startsWith('Added player “Bo”')) && labels.some((l) => l.startsWith('Added player “Cy”')), `each player added and named is one step, by their name (${labels.join(' | ')})`);
  assert(!labels.some((l) => l.includes('“Player 2”')), 'no step is called by a default name typed over');
  const cyRow = page.locator('.hist .hr').filter({ hasText: 'Added player “Cy”' }).first();
  await cyRow.hover();
  await cyRow.getByRole('button', { name: 'Go there ›' }).click();
  await start.waitFor();
  assert((await names()).join() === 'Bo,Cy', 'Go there on a player’s step opens ▶ Play, with the players');

  // ---------- A picture, kept through a rematch ----------
  await dropPicture(page.getByRole('button', { name: 'Picture for Bo' }), 'bo.png');
  await page.getByRole('button', { name: 'Picture for Bo' }).locator('img').waitFor();
  // ---------- Names: a blank one says what it plays as; two the same are pointed out ----------
  const cy = page.getByLabel('Player 2 name');
  await cy.fill('');
  assert((await cy.getAttribute('placeholder')) === 'Player 2', 'a name left blank shows what it plays as (Player 2)');
  await cy.fill('bo ');
  const same = page.locator('.pregame .same');
  await same.waitFor();
  assert((await same.innerText()).includes('“Bo”'), 'two players called Bo (whatever the case) are pointed out');
  await cy.fill('Cy');
  assert((await same.count()) === 0, 'and the note goes once they differ');
  // ---------- A start score: whole points, within what reads on screen (made so once typed) ----------
  const boStart = page.getByLabel('Bo\'s start score');
  await boStart.fill('250.5');
  await boStart.press('Tab');
  assert((await boStart.inputValue()) === '251', 'a start score with a fraction becomes whole points once typed (250.5 → 251)');
  const cyStart = page.getByLabel('Cy\'s start score');
  await cyStart.fill('99999999999999999999');
  await cyStart.press('Tab');
  assert((await cyStart.inputValue()) === '1000000000000', 'and one past the most points reads as the most (1,000,000,000,000)');
  await cyStart.fill('0');
  assert((await start.getAttribute('title')).includes('Ctrl+Enter'), 'Start game ▶ says its key, Ctrl+Enter');
  // ---------- Ctrl+Enter starts the game, from a name being typed in (which keeps the typing) ----------
  await cy.press('End');
  await page.keyboard.type('z');
  await page.keyboard.press('Control+Enter');
  await page.getByRole('button', { name: 'Skip intro' }).waitFor();
  assert(await page.locator('.pregame').count() === 0, 'Ctrl+Enter starts the game');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  assert((await page.locator('main.play').innerText()).includes('Cyz'), 'with the name just typed in (Cyz)');
  assert((await page.locator('.stage-box .plate', { hasText: 'Bo' }).locator('.score').innerText()) === '$251', 'Bo starts on the whole start score ($251)');

  // ---------- ⚖ Game rules mid-game, and raising Most players from 👥 Players ----------
  await page.getByRole('button', { name: '⚖ Rules' }).click();
  const rulesDialog = page.getByRole('dialog', { name: 'Game rules' });
  const most = rulesDialog.getByLabel('Most players');
  await most.fill('1');
  await most.press('Tab');
  assert((await most.inputValue()) === '2', 'mid-game, Most players never goes below the players in the game');
  await rulesDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: '👥 Players' }).click();
  const playersDialog = page.getByRole('dialog', { name: 'Players' });
  assert(await playersDialog.getByRole('button', { name: '＋ Add player' }).isDisabled(), 'at the most players, ＋ Add player is off…');
  await playersDialog.getByRole('button', { name: 'Raise Most players to 3' }).click();
  assert(await playersDialog.getByRole('button', { name: '＋ Add player' }).isEnabled(), '…and Raise Most players lets one more in');
  await playersDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: '⚖ Rules' }).click();
  assert((await most.inputValue()) === '3', 'the rules show the new Most players');
  await page.keyboard.press('Escape');
  assert((await rulesDialog.count()) === 0, 'Esc closes the rules');

  // ---------- Rematch keeps Bo's picture, and a roster edit then doesn't take it off the game ----------
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'End game ▶' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  // ---------- ▶ Next game… (a stream of several games): the editor's Open…, the results kept ----------
  {
    const chooser = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
    await page.getByRole('button', { name: '▶ Next game…' }).click();
    const openList = page.getByRole('dialog', { name: 'Open a game' });
    const how = await Promise.race([chooser.then((c) => (c ? 'picker' : 'none')), openList.waitFor().then(() => 'list')]);
    assert(how !== 'none', `game over › ▶ Next game… goes to the editor's Open… (${how === 'list' ? 'Recent games' : 'the file picker'})`);
    if (how === 'list') await page.keyboard.press('Escape');
    await page.locator('.status-bar .kept').getByText('Finished game').waitFor();
    await page.getByRole('button', { name: 'View results' }).click();
    await page.locator('.end h1').waitFor();
    assert(true, 'and the results stay viewable from the editor (View results)');
  }
  // Rematch asks first (the results go).
  await page.getByRole('button', { name: '🔁 Rematch' }).click();
  await page.getByText('Start a rematch? Scores go back to 0.').waitFor();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '🔁 Rematch' }).click();
  await start.waitFor();
  // Viewers' card says it's a rematch.
  {
    const [audR] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
    audR.on('pageerror', (e) => errors.push('[audience] ' + e.message));
    await audR.locator('.soon-text').waitFor();
    assert((await audR.locator('.soon-text').innerText()) === 'Rematch! Starting soon…', 'a rematch’s card on stream says “Rematch! Starting soon…”');
    await page.locator('.mode', { hasText: 'Single window' }).click();
    if (!audR.isClosed()) await audR.waitForEvent('close', { timeout: 3000 });
  }
  assert((await page.getByRole('button', { name: 'Picture for Bo' }).locator('img').count()) === 1, 'a rematch keeps the players’ pictures');
  await page.getByLabel('Player 2 name').fill('Cyd');
  await page.waitForTimeout(900);
  await back.click();
  await page.getByRole('button', { name: /🕘 History/ }).click();
  assert((await historyLabels()).some((l) => l.startsWith('Rule: Most players')), 'a rule changed mid-game is kept with the game in the editor (a step in 🕘 History)');
  await play.click();
  await start.waitFor();
  assert((await names()).join() === 'Bo,Cyd' && (await page.getByRole('button', { name: 'Picture for Bo' }).locator('img').count()) === 1, 'and the game keeps Bo’s picture after the rematch’s roster changes');
  await back.click();

  // ---------- The game's name: a note in the editor's checklist, renamed right on the pre-game screen ----------
  const untitledLine = page.locator('nav .problem', { hasText: 'still called “Untitled Game”' });
  await untitledLine.waitFor();
  assert(true, 'the editor\'s checklist notes a game still called “Untitled Game”');
  await untitledLine.click();
  assert(await page.locator('input[data-place="title"]').evaluate((e) => e === document.activeElement), 'its line goes to the title box');
  await play.click();
  await start.waitFor();
  assert((await page.locator('[data-warn="untitled"]').count()) === 1, 'the pre-game screen asks for a name too (the title shows on stream)');
  await page.getByRole('button', { name: '✎ Rename' }).click();
  await page.getByLabel('Game title').fill('Meme Night');
  await page.keyboard.press('Enter');
  assert((await page.locator('.pregame h1').innerText()) === 'Meme Night' && (await page.locator('[data-warn="untitled"]').count()) === 0, '✎ Rename names the game right there');
  await page.screenshot({ path: 'test-results/pregame-golive.png' });

  // ---------- Going live? A short checklist, hidden with ✕ (and shown again from 🖥 Display) ----------
  const live = page.locator('.live-check');
  assert((await live.innerText()).includes('Single window') && (await live.getByRole('button', { name: 'Test the sound' }).count()) === 1, 'the “Going live?” checklist says the display and links the sound help');
  await live.getByRole('button', { name: 'Hide the Going live checklist' }).click();
  assert((await live.count()) === 0, '✕ hides it');
  await page.getByRole('button', { name: '✅ Show the “Going live?” checklist' }).click();
  assert((await live.count()) === 1, 'and 🖥 Display shows it again');

  // ---------- The display picked is remembered: the audience window opens with Start ----------
  const [aud1] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  assert((await page.evaluate(() => JSON.parse(localStorage.getItem('jb.prefs')).display)) === 'audience', 'picking the audience window is remembered on this computer');
  await aud1.getByText('🔊 Click to enable sound').waitFor();
  const lineup = await aud1.locator('.lineup .lineup-name').allInnerTexts();
  assert(lineup.length > 0 && JSON.stringify(lineup) === JSON.stringify(await names()), `the Starting soon card on stream lists who's playing (${lineup.join(', ')})`);
  assert((await page.locator('.live-check li[data-check="sound-click"]').getAttribute('class')).split(' ').every((c) => c !== 'done'), 'the checklist asks for a click in the audience window');
  await aud1.mouse.click(300, 300);
  await page.locator('.live-check li.done[data-check="sound-click"]').waitFor();
  assert((await aud1.locator('.activate').count()) === 0, 'a click there takes its “Click to enable sound” away, and the host gets a ✓');
  await back.click();
  // ◀ Back to editor keeps the audience window (OBS's capture source) up, on the Starting soon card; its ✕ closes it.
  const audOpen = page.locator('.status-bar [data-audience-open]');
  await audOpen.waitFor();
  await page.waitForTimeout(400);
  assert(!aud1.isClosed() && (await aud1.locator('.soon-text').count()) === 1, '◀ Back to editor keeps the audience window up, on the Starting soon card');
  await audOpen.getByRole('button', { name: 'Close the audience window' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close it' }).click();
  if (!aud1.isClosed()) await aud1.waitForEvent('close', { timeout: 3000 });
  await page.getByRole('button', { name: /▶ Test this round/ }).waitFor();
  await page.waitForTimeout(400);
  await play.click();
  const openAndStart = page.getByRole('button', { name: '📺 Open audience window & start' });
  await openAndStart.waitFor();
  assert((await page.locator('.mode.on', { hasText: 'Separate audience window' }).count()) === 1, 'the next ▶ Play has the audience window picked again');
  const [aud2] = await Promise.all([page.waitForEvent('popup'), openAndStart.click()]);
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await aud2.locator('.board').waitFor();
  assert(true, '📺 Open audience window & start opens it and starts the game');

  // ---------- Exit asks once: keep the game to resume, or discard it ----------
  await page.getByRole('button', { name: /Exit/ }).first().click();
  assert((await page.locator('.panel .confirm').innerText()).includes('keep it to resume later?'), 'Exit asks whether to keep the game to resume later');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  const kept = page.locator('.status-bar .kept');
  await kept.waitFor();
  const keptBox = await kept.boundingBox();
  assert(keptBox.height <= 44, `the game kept to resume is one line over the editor (${Math.round(keptBox.height)}px)`);
  await kept.getByRole('button', { name: 'Hide this line' }).click();
  assert((await kept.count()) === 0, '✕ puts that line away');
  await play.click();
  const resumeCard = page.locator('.resume-card');
  await resumeCard.waitFor();
  assert((await page.getByRole('alertdialog').count()) === 0 && (await resumeCard.innerText()).includes('Meme Night'), '▶ Play asks nothing: the pre-game screen offers the kept game');
  // Back to single window for the rest.
  await page.locator('.mode', { hasText: 'Single window' }).click();
  await resumeCard.getByRole('button', { name: '▶ Resume it' }).click();
  await page.locator('.board').waitFor();
  assert((await page.locator('.board .tile.used').count()) === 0 && (await page.locator('.panel').count()) === 1, '▶ Resume it plays on with the kept game');
  await page.getByRole('button', { name: /Exit/ }).first().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Discard & leave', exact: true }).click();
  await page.getByRole('button', { name: /▶ Test this round/ }).waitFor();
  assert((await kept.count()) === 0, 'Discard & leave keeps nothing to resume');

  // ---------- ▶ Test this round: just that round, nothing kept, back on it ----------
  await play.click();
  await start.click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().click();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Exit/ }).first().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await kept.waitFor();
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  await noDailyDoubles(page);
  const second = page.locator('nav > button.round-tab').nth(1);
  await second.click({ button: 'right' });
  assert((await page.getByRole('menuitem', { name: '▶ Test this round' }).count()) === 1, 'a round tab\'s right-click menu has ▶ Test this round');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '▶ Test this round' }).click();
  await page.locator('.rn .test').waitFor();
  assert((await page.locator('.rn .test').innerText()).includes('Testing this round'), 'the round plays at once, marked 🧪 Testing this round');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board').waitFor();
  assert((await page.locator('.panel .p').count()) === 2, 'with the game\'s players');
  // Its end screen has no ▶ Next game… (that would keep the throwaway test as the game to resume).
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'End game ▶' }).click();
  await page.waitForTimeout(450);
  await page.locator('.panel .confirm').getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: '📋 Copy standings' }).waitFor();
  assert(
    (await page.getByRole('button', { name: '▶ Next game…' }).count()) === 0 && (await page.getByRole('button', { name: '🔁 Rematch' }).count()) === 0,
    'a tested round’s end screen has no ▶ Next game… or 🔁 Rematch (either would keep the test as the game to resume)',
  );
  await page.getByRole('button', { name: /Exit/ }).first().click();
  assert((await page.locator('.panel .confirm').innerText()).includes('Nothing from this test is kept'), 'leaving a test says nothing is kept');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '◀ Back to editor', exact: true }).click();
  await kept.waitFor();
  assert((await page.locator('nav > button.round-tab').nth(1).getAttribute('aria-current')) === 'page', 'Exit comes back to the editor on the round tested');
  await kept.getByRole('button', { name: 'Resume game' }).click();
  await page.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await page.locator('.board').waitFor();
  assert((await page.locator('.board .tile.used').count()) === 1, 'the game kept to resume is as it was (the test never replaced it)');
  await page.getByRole('button', { name: /Exit/ }).first().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Discard & leave', exact: true }).click();
  await page.getByRole('button', { name: /▶ Test this round/ }).waitFor();

  // ---------- A game saved with Buzzer mode on, in a copy without a buzzer server ----------
  const prefs = (server) =>
    page.evaluate((s) => {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: s }));
    }, server);
  await prefs('https://buzz.test');
  await page.reload();
  await play.click();
  await page.getByLabel(/Buzzer mode/).check();
  // Buzzer mode with no room: Start asks in its bar (start the room first, or play without phones).
  await start.click();
  const noRoom = page.locator('.actions .ia');
  await noRoom.getByText("Buzzer mode is on, but the buzzer room isn't started").waitFor();
  assert((await noRoom.getByRole('button', { name: '📱 Start the room first' }).count()) === 1 && (await noRoom.getByRole('button', { name: 'Start without phones' }).count()) === 1, 'Start with Buzzer mode on and no room asks: start the room first, or play without phones');
  await noRoom.getByRole('button', { name: 'Not yet' }).click();
  assert((await noRoom.count()) === 0 && (await start.count()) === 1, 'Back leaves things as they were');
  await start.click();
  await page.waitForTimeout(450);
  await noRoom.getByRole('button', { name: 'Start without phones' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  const phonesChip = page.locator('.panel .chip', { hasText: '📱 Phones off' });
  await phonesChip.waitFor();
  assert((await phonesChip.getAttribute('title')) === 'No buzzer room: click to start one', 'Start without phones plays on; the 📱 Phones off chip says “No buzzer room: click to start one”');
  await page.getByRole('button', { name: /Exit/ }).first().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Discard & leave', exact: true }).click();
  await play.waitFor();
  // (Saved with the game a moment after.)
  await page.waitForTimeout(1500);
  await prefs('');
  await page.reload();
  await play.click();
  const phoneCard = page.locator('section[aria-label="Phone buzzers"]');
  assert((await phoneCard.innerText()).includes('once phone buzzers are set up. Until then you pick who answers'), 'the 📱 card says, in plain words, phones need setting up (you pick who answers)');
  // ⚙ Set up phone buzzers… opens ⚙ Settings right here, at its phone buzzers.
  await phoneCard.getByRole('button', { name: '⚙ Set up phone buzzers…' }).click();
  const settingsDlg = page.getByRole('dialog', { name: 'Settings' });
  await settingsDlg.waitFor();
  assert(await settingsDlg.getByLabel('Buzzer server').evaluate((e) => e === document.activeElement), '⚙ Set up phone buzzers… opens Settings with the buzzer server box ready');
  const guide = settingsDlg.getByRole('link', { name: /How to set up your own/ });
  assert((await guide.getAttribute('href')).endsWith('Brainrot-Game-Maker#set-up-your-own-buzzer-server'), 'and links to the guide to setting up your own buzzer server');
  await settingsDlg.getByRole('button', { name: 'Done' }).click();
  await start.click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.locator('.board .tile').first().click();
  await page.getByRole('button', { name: /Reveal|Show answer/ }).first().waitFor();
  assert(
    (await page.getByRole('button', { name: '↺ Reset buzzers' }).count()) === 0 && (await page.getByRole('button', { name: '🔔 Open the buzzers' }).count()) === 0,
    'and the clue has no buzzer buttons: the host picks who answers',
  );
  await page.getByRole('button', { name: /Exit/ }).first().click();
  // (A question's buttons ignore clicks right after it appears.)
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await page.getByRole('button', { name: /^More:/ }).waitFor();

  // ---------- An exported player-only file: no pointer to the editor's settings ----------
  const html = await exportHtml(page);
  mkdirSync('test-results', { recursive: true });
  const exported = resolve('test-results/pregame-player.html');
  await html.saveAs(exported);
  const player = await context.newPage();
  player.on('pageerror', (e) => errors.push('[exported] ' + e.message));
  player.on('dialog', (d) => d.accept());
  await player.goto(pathToFileURL(exported).href);
  await player.getByRole('button', { name: '▶ Play' }).click();
  const card = await player.locator('section[aria-label="Phone buzzers"]').innerText();
  assert(card.includes('This file has no phone buzzers') && !card.includes('⚙') && !card.includes('Settings') && !card.includes('editor'), `the player-only file says it has no phone buzzers, and doesn't send anyone to the editor (${card.replace(/\s+/g, ' ')})`);
  // Players and rules set up there stay through ◀ Back and ▶ Play again (the file's own copy of the game keeps them).
  const playerNames = () => player.locator('.pregame .player input.name').evaluateAll((els) => els.map((e) => e.value));
  const mostBox = (await openRules(player)).getByLabel('Most players');
  const mostSet = String(Number(await mostBox.inputValue()) + 1);
  await mostBox.fill(mostSet);
  await mostBox.press('Tab');
  await player.getByRole('button', { name: '＋ Add player' }).click();
  await player.keyboard.type('Zed');
  await player.keyboard.press('Tab');
  const setUp = await playerNames();
  await player.getByRole('button', { name: '◀ Back', exact: true }).click();
  await player.getByRole('button', { name: '▶ Play' }).click();
  await player.getByRole('button', { name: 'Start game ▶' }).waitFor();
  assert(setUp.at(-1) === 'Zed' && (await playerNames()).join() === setUp.join(), `a player-only file keeps the players set up through ◀ Back and ▶ Play (${setUp.join(', ')})`);
  assert((await (await openRules(player)).getByLabel('Most players').inputValue()) === mostSet, `…and the rules (Most players ${mostSet})`);
  await player.close();

  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log('pregame: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'pregame-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
