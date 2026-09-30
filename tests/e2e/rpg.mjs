// RPG rounds: build a tiny world (two screens, an item, stats), then play it: move with the pad and the keys, pick
// the item up, change a stat, undo and redo, show the map, and check viewers never see secret objects.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
const where = () => page.locator('.rh .where').innerText();

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();

  // Stats & items.
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  await page.getByRole('button', { name: /Gold \(currency/ }).click();
  await page.getByRole('button', { name: '＋ Item', exact: true }).click();
  await page.getByLabel('Item name').fill('Potion');

  // An RPG round: its world starts with one screen; add one to the east.
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /RPG/ }).click();
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  assert(await page.getByRole('button', { name: 'Screen Screen B1' }).isVisible(), 'a screen can be added to the map grid');
  // Put a secret Potion on the start screen.
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  await page.locator('.menu').getByRole('button', { name: 'Potion' }).click();
  await page.getByText('Secret (hidden until revealed)').click();
  await page.getByRole('button', { name: '🚩 Arrival' }).click();
  await page.getByRole('button', { name: '◀ Back to the map' }).click();

  // Play it: two players, straight to the adventure.
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
  await page.locator('.rh').waitFor();
  assert((await where()).includes('Start'), `the party starts on the start screen (${await where()})`);
  assert((await page.locator('.rpg .avatar').count()) === 2, 'both avatars are on the stage');
  assert((await page.locator('.rpg .strip .card').count()) === 2, 'the stats strip shows every player');

  // Viewers (single window) never get the secret Potion or the arrival point drawn, nor a click target for them.
  assert((await page.locator('.rpg .hit').count()) === 0, 'secret objects and arrival points get no click target on the viewers’ stage');
  assert(!(await page.locator('.rpg').innerText()).toLowerCase().includes('potion'), 'the secret Potion is not drawn for viewers');

  // Move: the pad, then numpad and Alt keys.
  await page.getByRole('button', { name: 'Go East' }).click();
  await page.waitForTimeout(200);
  assert((await where()).includes('Screen B1'), 'the pad moves the party east');
  await page.keyboard.press('Numpad4');
  await page.waitForTimeout(200);
  assert((await where()).includes('Start'), 'numpad 4 moves west');
  await page.keyboard.press('Alt+d');
  await page.waitForTimeout(200);
  assert((await where()).includes('Screen B1'), 'Alt+D moves east');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert((await where()).includes('Start'), 'Ctrl+Z undoes a move');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(200);
  assert((await where()).includes('Screen B1'), 'Ctrl+Shift+Z redoes it');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(200);
  assert((await where()).includes('Start'), 'Alt+← moves west');

  // The secret Potion is in the host's list: reveal it, then pick it up.
  await page.locator('.rh .objs').getByRole('button', { name: /Potion/ }).click();
  const card = page.getByRole('dialog', { name: 'Object: Potion' });
  await card.waitFor();
  await card.getByRole('button', { name: '👁 Reveal to viewers' }).click();
  await page.locator('.rpg .hit').first().waitFor();
  assert((await page.locator('.rpg').innerText()).toLowerCase().includes('potion'), 'revealed, viewers see the Potion');
  await card.locator('.who').getByRole('button').first().click();
  await card.getByRole('button', { name: /picks up 1 Potion/ }).click();
  const firstCard = page.locator('.rh .pc').first();
  assert((await firstCard.locator('.it').allInnerTexts()).join().includes('Potion'), 'picking it up puts it in the player’s inventory');
  assert(!(await page.locator('.rpg').innerText()).toLowerCase().includes('potion'), 'and it is gone from the screen');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert(!(await firstCard.locator('.it').allInnerTexts()).join().includes('Potion'), 'undo gives it back to the screen');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(200);
  assert((await firstCard.locator('.it').allInnerTexts()).join().includes('Potion'), 'redo picks it up again');

  // Stats: HP down one.
  await firstCard.getByRole('button', { name: /HP minus 1/ }).click();
  assert((await firstCard.getByLabel(/ HP$/).inputValue()) === '9', 'HP − takes one off');
  assert((await page.locator('.rpg .strip').first().innerText()).includes('HP 9'), 'the stats strip shows the new HP');
  // Score and actions share Ctrl+Z, newest first: an award, then undo takes the award back, then the HP.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert((await firstCard.getByLabel(/ HP$/).inputValue()) === '10', 'undo puts the HP back');

  // Map and cover.
  await page.keyboard.press('m');
  await page.locator('.rpg .map-ov').waitFor();
  assert(true, 'M shows the map to viewers');
  await page.keyboard.press('m');
  await page.keyboard.press('b');
  await page.locator('.cover').waitFor();
  assert(true, 'B covers the screen');
  await page.keyboard.press('b');

  // The player sheet.
  await page.keyboard.press('i');
  await page.locator('.sheet').waitFor();
  assert((await page.locator('.sheet').innerText()).includes('Potion'), 'I shows a player sheet with the inventory');
  await page.keyboard.press('Escape');

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg.png` });
  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('rpg: all passed');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
