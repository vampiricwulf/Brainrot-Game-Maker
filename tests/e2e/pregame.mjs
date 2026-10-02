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
  assert((await start.getAttribute('title')).includes('Ctrl+Enter'), 'Start game ▶ says its key, Ctrl+Enter');
  // ---------- Ctrl+Enter starts the game, from a name being typed in (which keeps the typing) ----------
  await cy.press('End');
  await page.keyboard.type('z');
  await page.keyboard.press('Control+Enter');
  await page.getByRole('button', { name: 'Skip intro' }).waitFor();
  assert(await page.locator('.pregame').count() === 0, 'Ctrl+Enter starts the game');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  assert((await page.locator('main.play').innerText()).includes('Cyz'), 'with the name just typed in (Cyz)');

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
  // Rematch asks first (the results go).
  await page.getByRole('button', { name: '🔁 Rematch' }).click();
  await page.getByText('Start a rematch? Scores go back to 0.').waitFor();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '🔁 Rematch' }).click();
  await start.waitFor();
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
  await back.click();
  // (Saved with the game a moment after.)
  await page.waitForTimeout(1500);
  await prefs('');
  await page.reload();
  await play.click();
  const phoneCard = page.locator('section[aria-label="Phone buzzers"]');
  assert((await phoneCard.innerText()).includes("Phone buzzers aren't set up in this copy, so Buzzer mode is off here"), 'the 📱 card says Buzzer mode is off here (no buzzer server)');
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
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('button', { name: 'Export HTML' }).waitFor();

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
  assert(card.includes("Phone buzzers aren't set up in this copy") && !card.includes('Settings') && !card.includes('editor'), `the player-only file doesn't send anyone to the editor (${card.replace(/\s+/g, ' ')})`);
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
