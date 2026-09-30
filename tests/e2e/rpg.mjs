// RPG rounds: build a tiny world (two screens, an item, stats), then play it: move with the pad and the keys, pick
// the item up, change a stat, undo and redo, show the map, and check viewers never see secret objects.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Nothing asks with a browser dialog once the game is on (it would show on stream): the host panel asks instead.
let playing = false;
const dialogs = [];
page.on('dialog', (d) => {
  if (playing) dialogs.push(d.message());
  return d.accept();
});
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const where = () => page.locator('.rh .where').innerText();

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // Stats & items.
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  await page.getByRole('button', { name: /Gold \(currency/ }).click();
  await page.getByRole('button', { name: '＋ Item', exact: true }).click();
  await page.getByLabel('Item name').fill('Potion');
  // Using it takes 1 HP (the first stat). A new item has its More open.
  await page.getByRole('button', { name: '＋ Add action' }).click();
  await page.getByRole('menuitem', { name: '📊 Change a stat' }).click();
  // A hat, drawn right on an avatar: it goes where it was drawn, and the preview shows it.
  await page.getByRole('button', { name: '＋ Item', exact: true }).click();
  await page.getByLabel('Item name').nth(1).fill('Hat');
  await page.getByLabel('Hat worn on').selectOption('head');
  await page.getByRole('button', { name: '🖌 Draw it…' }).click();
  const hatPad = page.getByRole('dialog', { name: 'Draw Hat on the avatar' });
  const hb = await hatPad.getByLabel('Drawing area').boundingBox();
  await hatPad.getByRole('button', { name: '⬟ Filled shape' }).click();
  await page.mouse.move(hb.x + hb.width * 0.42, hb.y + hb.height * 0.2);
  await page.mouse.down();
  for (const [fx, fy] of [[0.58, 0.2], [0.55, 0.05], [0.45, 0.05]]) await page.mouse.move(hb.x + hb.width * fx, hb.y + hb.height * fy, { steps: 4 });
  await page.mouse.up();
  await hatPad.getByRole('button', { name: 'Insert drawing' }).click();
  await page.locator('.worn .preview .gear img').waitFor();
  const hatY = +(await page.getByLabel('Up or down').inputValue());
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-hat-editor.png` });
  assert(hatY < -0.3, `the drawn hat sits on top of the avatar (${hatY})`);
  await page.getByRole('button', { name: '＋ Shop' }).click();
  await page.getByRole('button', { name: '＋ Something to sell' }).click();
  await page.locator('label', { hasText: 'Buys back at' }).locator('input').fill('50');
  // A second shop, deleted below.
  await page.getByRole('button', { name: '＋ Shop' }).click();

  // An RPG round: its world starts with one screen; add one to the east.
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /RPG/ }).click();
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  assert(await page.getByRole('button', { name: 'Screen Screen B1' }).isVisible(), 'a screen can be added to the map grid');
  // Put a secret Potion on the start screen.
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  assert((await page.getByRole('menu').count()) === 0, '📦 Item ▾ closes on a second click');
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Potion' }).click();
  await page.getByText('Secret (hidden until revealed)').click();
  // And a locked gate to Screen B1 (secret too: viewers see nothing on this screen).
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Potion' }).click();
  await page.getByPlaceholder('e.g. Old Man, Cave door').fill('Gate');
  await page.getByLabel('Object class').selectOption('doorway');
  await page.getByLabel('Leads to: screen').selectOption({ label: 'Screen B1' });
  await page.getByText('Locked (you can still open it in play)').click();
  await page.getByText('Secret (hidden until revealed)').click();
  await page.getByRole('button', { name: '🚩 Arrival' }).click();
  // A character selling from Shop 2: once that shop is deleted, its Shop box says so (not a blank box).
  await page.getByRole('button', { name: '◼ Shape ▾' }).click();
  await page.getByRole('button', { name: '▭ Rectangle' }).click();
  await page.getByLabel('Object class').selectOption('npc');
  await page.getByLabel('Shop', { exact: true }).selectOption({ label: 'Shop 2' });
  await page.getByRole('button', { name: '◀ Back to the map' }).click();
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: 'Delete shop' }).nth(1).click();
  await page.locator('nav > button.round-tab', { hasText: 'Adventure' }).click();
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  const canvasBox = await page.locator('.canvas').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  const shopShown = await page.getByLabel('Shop', { exact: true }).locator('option:checked').innerText();
  assert(shopShown === '⚠ Deleted shop — pick another', `a character's deleted shop says so (${shopShown})`);
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: '◀ Back to the map' }).click();

  // Play it: two players, straight to the adventure.
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  playing = true;
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

  // Right-click on the stage: an avatar's menu, and the empty stage's.
  await page.locator('.rpg .avatar[data-player-id]').first().click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '📺 Show their sheet' }).click();
  await page.locator('.sheet').waitFor();
  assert(true, 'right-click an avatar: show their sheet');
  await page.keyboard.press('Escape');
  const stageBox = await page.locator('.rpg').boundingBox();
  await page.mouse.click(stageBox.x + 30, stageBox.y + 30, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: /Full map/ }).click();
  await page.getByRole('dialog', { name: 'Full map' }).waitFor();
  assert(true, 'right-click the stage: the full map');
  await page.keyboard.press('Escape');
  // Text right there: the host panel asks for it, and it lands where the stage was clicked (its card opens).
  await page.mouse.click(stageBox.x + stageBox.width * 0.75, stageBox.y + stageBox.height * 0.25, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '＋ Text here…' }).click();
  await page.locator('.rh .ask', { hasText: 'Text to put here' }).waitFor();
  await page.locator('.rh').getByRole('textbox', { name: 'Text', exact: true }).fill('X marks the spot');
  await page.keyboard.press('Enter');
  const spot = page.getByRole('dialog', { name: 'Object: X marks the spot' });
  await spot.waitFor();
  assert(true, 'right-click ＋ Text here… asks in the host panel, then adds the text and opens its card');
  await spot.getByRole('button', { name: '🗑 Remove' }).click();

  // Viewers (single window) never get the secret Potion or the arrival point drawn, nor a click target for them.
  assert((await page.locator('.rpg .hit').count()) === 0, 'secret objects and arrival points get no click target on the viewers’ stage');
  assert(!(await page.locator('.rpg').innerText()).toLowerCase().includes('potion'), 'the secret Potion is not drawn for viewers');

  // The locked gate asks first (in its card), and only goes through on the answer.
  await page.locator('.rh .objs').getByRole('button', { name: /Gate/ }).click();
  const gate = page.getByRole('dialog', { name: 'Object: Gate' });
  await gate.getByRole('button', { name: '🚪 Go through (party)' }).click();
  await gate.getByText('Gate is locked. Go through anyway?').waitFor();
  await gate.getByRole('button', { name: 'Cancel' }).click();
  assert((await where()).includes('Start') && (await gate.locator('.ask').count()) === 0, 'a locked door asks inline; Cancel stays put');
  await gate.getByRole('button', { name: '🚪 Go through (party)' }).click();
  await page.waitForTimeout(450);
  await gate.getByRole('button', { name: '🚪 Go through', exact: true }).click();
  await page.waitForTimeout(200);
  assert((await where()).includes('Screen B1'), 'answering Go through takes the party through the locked door');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // Move: the pad, then numpad and Alt keys.
  await page.getByRole('button', { name: 'Go East', exact: true }).click();
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

  // The full map (J): pick a screen, then move the party there; a double-click moves at once.
  await page.keyboard.press('j');
  const full = page.getByRole('dialog', { name: 'Full map' });
  await full.waitFor();
  await full.getByRole('button', { name: 'Overworld · Screen B1' }).click();
  await full.getByRole('button', { name: /^▶ Move Party here$/ }).click();
  await page.waitForTimeout(200);
  assert((await where()).includes('Screen B1'), 'the full map jumps the party to the picked screen');
  await page.getByRole('button', { name: '⤢ Full map' }).click();
  await full.getByRole('button', { name: 'Overworld · Start' }).dblclick();
  await page.waitForTimeout(200);
  assert((await where()).includes('Start') && !(await full.isVisible()), 'double-clicking a screen jumps straight there and closes the map');
  await page.keyboard.press('j');
  await full.waitFor();
  await page.keyboard.press('Escape');
  assert(!(await full.isVisible()), 'Esc closes the full map');

  // Several wheels at once: the player wheel twice, spun together.
  await page.getByRole('button', { name: '🎡 Wheel' }).click();
  await page.getByRole('button', { name: '🎯 Pick a player', exact: true }).click();
  await page.getByLabel('Spin another wheel too').selectOption({ label: '🎯 Pick a player' });
  assert((await page.locator('.stage .many .cell').count()) === 2, 'a second wheel appears next to the first');
  if (process.env.SHOTS) await page.keyboard.press('j').then(async () => {
    await page.getByRole('dialog', { name: 'Full map' }).getByRole('button', { name: 'Overworld · Screen B1' }).click();
    await page.screenshot({ path: `${process.env.SHOTS}/rpg-fullmap.png` });
    await page.keyboard.press('Escape');
  });
  // The added wheel can be edited for this spin too.
  await page.getByRole('button', { name: 'Edit Pick a player for this spin' }).click();
  assert((await page.locator('.tc', { hasText: 'Spin another wheel' }).innerText()).includes('Editing Pick a player'), 'an added wheel has its own edit box');
  await page.getByRole('button', { name: 'Edit Pick a player for this spin' }).click();
  await page.locator('.tc').getByRole('button', { name: 'Spin!' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.stage .many .chip').length === 2, null, { timeout: 12000 });
  assert(true, 'both wheels land, each showing its result');
  assert((await page.locator('.tc .result').innerText()).includes(' · '), 'the host sees both results');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-wheels.png` });
  await page.keyboard.press('Escape');

  // The drawpad: draw a whole object (several strokes, a filled shape, undo), then insert it as one object.
  await page.getByRole('button', { name: '✏ Draw' }).click();
  const pad = page.getByRole('dialog', { name: 'Draw on Start' });
  await pad.waitFor();
  const padBox = await pad.getByLabel('Drawing area').boundingBox();
  assert((await pad.locator('.pad-token').count()) === 2, 'the drawpad shows the players where they stand');
  const stroke = async (pts) => {
    await page.mouse.move(padBox.x + padBox.width * pts[0][0], padBox.y + padBox.height * pts[0][1]);
    await page.mouse.down();
    for (const [fx, fy] of pts.slice(1)) await page.mouse.move(padBox.x + padBox.width * fx, padBox.y + padBox.height * fy, { steps: 4 });
    await page.mouse.up();
  };
  await pad.getByRole('button', { name: '⬟ Filled shape' }).click();
  await stroke([[0.3, 0.3], [0.45, 0.3], [0.45, 0.5], [0.3, 0.5]]);
  await pad.getByRole('button', { name: '✏ Pen' }).click();
  await stroke([[0.32, 0.55], [0.5, 0.6]]);
  await stroke([[0.1, 0.1], [0.12, 0.12]]);
  await pad.getByRole('button', { name: '↶ Undo' }).click();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-drawpad.png` });
  await pad.getByRole('button', { name: 'Insert drawing' }).click();
  const drawn = page.getByRole('dialog', { name: 'Object: Drawing' });
  await drawn.waitFor();
  assert(!(await pad.isVisible()), 'the drawing (several strokes) is inserted as one object and its card opens');
  const img = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.rpg img')];
    return els.length;
  });
  assert(img === 0, 'it starts hidden from viewers');
  await drawn.getByLabel('Object name').fill('Lava');
  await drawn.getByLabel('Object name').press('Enter');
  await page.getByRole('dialog', { name: 'Object: Lava' }).getByLabel('Object class').selectOption('zone');
  const lava = page.getByRole('dialog', { name: 'Object: Lava' });
  await lava.getByRole('button', { name: '👁 Reveal to viewers' }).click();
  assert((await lava.locator('.cls').innerText()) === 'zone', 'it can be named and made a zone');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-drawn.png` });
  // Drag it on the stage: it stays where it's dropped.
  const hit = page.getByRole('button', { name: 'Object: Lava' });
  const before = await hit.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await hit.boundingBox();
  assert(Math.abs(after.x - before.x - 60) < 6 && Math.abs(after.y - before.y - 30) < 6, 'an object can be dragged on the stage');
  // ✎ Edit opens its screen in the live editor, with the object there to move or restyle.
  await lava.getByRole('button', { name: '✎ Edit' }).click();
  const liveEd = page.getByRole('dialog', { name: /Edit Start.* live/ });
  await liveEd.waitFor();
  assert((await liveEd.getByRole('button', { name: /Lava/ }).count()) > 0 || (await liveEd.innerText()).includes('Lava'), 'the live editor has the drawn object');
  await liveEd.getByRole('button', { name: 'Done' }).click();
  assert(await page.getByRole('button', { name: 'Object: Lava' }).isVisible(), 'after editing it is still on the stage');
  await page.keyboard.press('Escape');

  // Give Player 1 the hat and equip it: it shows on their avatar.
  await page.locator('.rh .pc').first().getByLabel('Give Player 1 an item').selectOption({ label: 'Hat' });
  await page.locator('.rh .pc').first().getByRole('button', { name: 'Equip' }).click();
  await page.locator('.rpg .avatar .gear img').first().waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-hat-stage.png` });
  assert(true, 'an equipped hat shows on the avatar on stage');
  // An item made up on the spot: the card asks for its name.
  await page.locator('.rh .pc').first().getByLabel('Give Player 1 an item').selectOption({ label: 'Something else…' });
  await page.locator('.rh .pc').first().getByRole('textbox', { name: 'Name of the item' }).fill('Rubber duck');
  await page.keyboard.press('Enter');
  assert((await page.locator('.rh .pc').first().locator('.it').allInnerTexts()).join().includes('Rubber duck'), 'Something else… asks for a name in the card, then gives it');

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

  // Improvising: typed text starts hidden; a new look; a new screen to the south; keep it in the game.
  await page.getByRole('button', { name: '＋ Text' }).click();
  await page.locator('.rh').getByRole('textbox', { name: 'Text', exact: true }).fill('Beware of the goose');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '＋ Add text' }).click();
  await page.locator('.rh .objs').getByRole('button', { name: /Beware of the goose/ }).waitFor();
  assert(!(await page.locator('.rpg').innerText()).toLowerCase().includes('goose'), 'typed text is added hidden from viewers');
  await page.getByLabel('Look').selectOption('+');
  assert((await page.getByRole('textbox', { name: 'Look name' }).inputValue()) === 'New look', 'a new look asks for its name (New look to start with)');
  await page.getByRole('textbox', { name: 'Look name' }).press('Enter');
  await page.getByRole('dialog', { name: /Edit Start \(New look\) live/ }).waitFor();
  assert(true, 'a new look opens in the live editor');
  await page.getByRole('button', { name: 'Done' }).click();
  assert((await page.getByLabel('Look').locator('option:checked').innerText()).includes('New look'), 'the screen now shows the new look');
  await page.getByLabel('Add a screen').selectOption('s');
  await page.locator('.rh .ask', { hasText: 'Name of the new screen' }).waitFor();
  assert((await page.getByRole('textbox', { name: 'Screen name' }).inputValue()) === 'New south of Start', 'a new screen asks for its name');
  await page.getByRole('textbox', { name: 'Screen name' }).press('Enter');
  await page.getByRole('dialog', { name: /Edit New south of Start live/ }).waitFor();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('Control+z');
  assert(await page.getByRole('button', { name: 'Go South', exact: true }).isDisabled(), 'Ctrl+Z takes a screen added live away again');
  await page.keyboard.press('Control+Shift+z');
  await page.getByRole('button', { name: 'Go South', exact: true }).click();
  await page.waitForTimeout(200);
  assert((await where()).includes('New south of Start'), 'a screen added live can be walked to');
  await page.getByRole('button', { name: '💾 Keep in game' }).click();
  await page.getByText('Kept “New south of Start” in the game').waitFor();
  assert(true, 'Keep in game copies it to the editor');

  // A shop from the Shop menu: buy, then sell back.
  await page.getByLabel('Open a shop').selectOption({ index: 1 });
  await page.locator('.shop').waitFor();
  const shopTc = page.locator('.tc', { hasText: 'Buyer:' });
  const potions = async () =>
    (await firstCard.locator('.it .nm').allInnerTexts()).filter((t) => t.startsWith('Potion')).reduce((n, t) => n + Number(t.match(/×(\d+)/)?.[1] ?? 1), 0);
  await shopTc.getByRole('button', { name: /^Potion ·/ }).click();
  await shopTc.getByText('Short by 🪙1 for Potion.').waitFor();
  assert(true, 'short of gold, the host is asked');
  await shopTc.getByRole('button', { name: 'Sell anyway' }).click();
  assert((await potions()) === 2, 'selling anyway adds it to the buyer’s inventory');
  assert((await shopTc.innerText()).includes('Player 1 🪙-1'), 'and their gold goes below zero');
  await shopTc.getByRole('button', { name: /^Potion( ×\d+)? →/ }).first().click();
  assert((await potions()) === 1, 'selling back takes one away');
  // Click a ware on the stage to buy it; short of gold, the host picks what happens.
  assert((await page.locator('.stage .shop .who').innerText()).includes('Player 1'), 'the stage shows who is shopping');
  await page.locator('.stage').getByRole('button', { name: 'Buy Potion' }).click();
  await shopTc.getByText(/Short by .* for Potion/).waitFor();
  await shopTc.getByRole('button', { name: 'Give it free' }).click();
  assert((await potions()) === 2, 'clicking a ware on the stage buys it');
  assert(await page.locator('.stage .shop').isVisible(), 'clicking the shop keeps it open');
  await shopTc.getByRole('button', { name: '🚪 Leave shop' }).click();
  await page.locator('.stage .shop').waitFor({ state: 'detached' });
  assert(true, '🚪 Leave shop closes it');
  // Give one of the two Potions (not the whole stack), then a typed amount.
  await firstCard.getByLabel('Give Potion to').selectOption({ label: 'Player 2' });
  const secondCard = page.locator('.rh .pc').nth(1);
  assert((await potions()) === 1 && (await secondCard.locator('.it .nm').allInnerTexts()).join().includes('Potion'), 'giving an item gives one');

  // The player sheet.
  await page.keyboard.press('i');
  await page.locator('.sheet').waitFor();
  assert((await page.locator('.sheet').innerText()).includes('Potion'), 'I shows a player sheet with the inventory');
  await page.keyboard.press('Escape');

  // Use: the card says what the item does and asks first.
  const hp = await firstCard.getByLabel(/ HP$/).inputValue();
  await firstCard.locator('.it', { hasText: 'Potion' }).getByRole('button', { name: 'Use', exact: true }).click();
  await firstCard.getByText('Player 1 uses Potion: HP −1. Use it up?').waitFor();
  await page.waitForTimeout(450);
  await firstCard.locator('.ia').getByRole('button', { name: 'Use', exact: true }).click();
  await page.waitForTimeout(200);
  assert((await firstCard.getByLabel(/ HP$/).inputValue()) === String(+hp - 1) && (await potions()) === 0, 'Use asks in the card, then runs what the item does and uses it up');
  assert(!dialogs.length, 'no browser dialog showed during the game' + (dialogs.length ? `: ${dialogs.join('; ')}` : ''));

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
