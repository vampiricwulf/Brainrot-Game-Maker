// The editor's lists: stats, items, shops and what they sell, buttons, wheel slices, the wheels & dice list, dice
// faces, players, and a board game's spaces and zones. Reorder (drag, Alt+↑/↓), duplicate, delete with Undo.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, dragBy } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dialogs = [];
page.on('dialog', (d) => {
  dialogs.push(d.message());
  return d.accept();
});
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const notice = page.locator('.history-notice');
const values = (loc) => loc.evaluateAll((els) => els.map((e) => e.value));
const texts = async (loc) => (await loc.allInnerTexts()).map((t) => t.trim());

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- Stats ----------
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  for (const p of [/HP \(bar/, /Gold \(currency/, /Power/]) await page.getByRole('button', { name: p }).click();
  const statNames = page.getByLabel('Stat name');
  await statNames.first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  assert((await values(statNames)).join() === 'Gold,HP,Power', 'Alt+↓ in a stat moves it down');
  assert(await statNames.nth(1).evaluate((e) => e === document.activeElement), 'and the field keeps the focus');
  await page.keyboard.press('Alt+ArrowDown');
  assert((await values(statNames)).join() === 'Gold,Power,HP', 'again: one place per press');
  await page.keyboard.press('Control+z');
  assert((await values(statNames)).join() === 'Gold,HP,Power', 'each move is its own undo step');
  await dragBy(page, page.locator('[data-place^="stat:"] .drag-grip').nth(2), page.locator('[data-place^="stat:"]').first().locator('input.name'));
  assert((await values(statNames)).join() === 'Power,Gold,HP', 'dragging a stat’s ⋮⋮ reorders it');
  await page.getByRole('button', { name: 'Duplicate Gold' }).click();
  assert((await values(statNames)).join() === 'Power,Gold,Gold (copy),HP', '⧉ puts a copy right after it');
  await statNames.first().focus();
  await page.keyboard.press('Control+d');
  assert((await values(statNames))[1] === 'Power (copy)', 'Ctrl+D in a row duplicates it');
  await page.locator('[data-place^="stat:"] select').first().click({ button: 'right' });
  await page.locator('[data-place^="stat:"]').first().click({ button: 'right', position: { x: 4, y: 4 } });
  await page.getByRole('menu').getByRole('menuitem', { name: '🗑 Delete stat' }).click();
  assert((await values(statNames)).join() === 'Power (copy),Gold,Gold (copy),HP' && (await notice.innerText()).startsWith('Deleted stat “Power”'), 'right-click → Delete, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  assert((await values(statNames))[0] === 'Power', 'Undo brings it back in its place');

  // ---------- Items and shops ----------
  await page.getByRole('button', { name: '＋ Item', exact: true }).click();
  await page.getByLabel('Item name').fill('Potion');
  const items = page.locator('.item');
  // Its Use buttons: a note and a score change.
  const use = items.first().locator('.actions');
  await use.getByRole('button', { name: '＋ Add button' }).click();
  await page.getByRole('menuitem', { name: '📝 Host note' }).click();
  await use.getByRole('button', { name: '＋ Add button' }).click();
  await page.getByRole('menuitem', { name: /Change the score/ }).click();
  const heads = () => texts(use.locator('.act .head b'));
  assert((await heads()).join() === '📝 Host note,💯 Change the score', 'two buttons');
  await use.locator('.act').nth(1).locator('input').first().focus();
  await page.keyboard.press('Alt+ArrowUp');
  assert((await heads()).join() === '💯 Change the score,📝 Host note', 'Alt+↑ moves a button up');
  await use.getByRole('button', { name: 'Duplicate button' }).first().click();
  assert((await heads()).join() === '💯 Change the score,💯 Change the score,📝 Host note', '⧉ duplicates a button');
  await dragBy(page, use.locator('.act .drag-grip').nth(2), use.locator('.act').first().locator('.head b'));
  assert((await heads())[0] === '📝 Host note', 'dragging a button’s ⋮⋮ reorders it');
  await use.getByRole('button', { name: '📋 Copy buttons' }).click();
  await page.getByRole('button', { name: 'Duplicate Potion' }).click();
  assert((await values(page.getByLabel('Item name'))).join() === 'Potion,Potion (copy)', 'an item duplicates, right after it');
  await page.getByRole('button', { name: '＋ Item', exact: true }).click();
  await page.getByLabel('Item name').nth(2).fill('Hat');
  const hatUse = items.nth(2).locator('.actions');
  await hatUse.getByRole('button', { name: '📋 Paste 3 buttons' }).click();
  assert((await texts(hatUse.locator('.act .head b'))).length === 3, 'copied buttons paste onto another item');
  await page.keyboard.press('Control+z');
  assert((await hatUse.locator('.act').count()) === 0, 'the paste is one undo step');
  await page.keyboard.press('Control+y');

  await page.getByRole('button', { name: '＋ Shop' }).click();
  const shop = page.locator('.shop').first();
  await shop.getByRole('button', { name: '＋ Something to sell ▾' }).click();
  assert((await texts(page.getByRole('menu').getByRole('menuitem'))).join('|') === 'Potion|Potion (copy)|Hat|＋ Everything', 'Something to sell lists the items, and Everything');
  await page.getByRole('menu').getByRole('menuitem', { name: '＋ Everything' }).click();
  const sold = async () => (await shop.getByLabel('Item for sale').evaluateAll((els) => els.map((e) => e.selectedOptions[0].text))).join();
  assert((await sold()) === 'Potion,Potion (copy),Hat', 'Everything stocks all of them');
  await shop.getByLabel('Item for sale').nth(2).focus();
  await page.keyboard.press('Alt+ArrowUp');
  assert((await sold()) === 'Potion,Hat,Potion (copy)', 'Alt+↑ moves what a shop sells');
  // (Dropped on a text box: headless Chromium only drops a drag on one.)
  await shop.scrollIntoViewIfNeeded();
  await dragBy(page, shop.locator('tr .drag-grip').nth(2), shop.locator('tr').first().locator('input').first());
  assert((await sold()) === 'Potion (copy),Potion,Hat', 'and so does a drag');
  // What a shop sells has a right-click menu: move it, or take it out of the shop.
  await shop.locator('tr .drag-grip').nth(1).click({ button: 'right' });
  const wareMenu = (await texts(page.getByRole('menu').getByRole('menuitem'))).map((t) => t.split('\n')[0]);
  assert(wareMenu.join('|').startsWith('▲ Move up') && wareMenu.some((t) => t.startsWith('− Remove from shop')), `right-click a row a shop sells: move it, remove it (${wareMenu.join(', ')})`);
  await page.getByRole('menu').getByRole('menuitem', { name: /▼ Move down/ }).click();
  assert((await sold()) === 'Potion (copy),Hat,Potion', 'its ▼ Move down moves it');
  await shop.locator('tr .drag-grip').nth(2).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '− Remove from shop' }).click();
  assert((await sold()) === 'Potion (copy),Hat' && (await notice.innerText()).startsWith('Stopped selling “Potion”'), 'its − Remove from shop stops selling it, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.keyboard.press('Control+z');
  assert((await sold()) === 'Potion (copy),Potion,Hat', 'both undo');
  await shop.getByRole('button', { name: 'Remove Hat from shop' }).click();
  assert((await sold()) === 'Potion (copy),Potion' && (await notice.innerText()).startsWith('Stopped selling “Hat”'), '− stops selling it, with a note');
  // An item's 📦 dropped on a shop sells it there.
  // (Both on screen at once.)
  await page.setViewportSize({ width: 1500, height: 2400 });
  await dragBy(page, page.getByRole('button', { name: 'Icon for Hat' }), shop.getByLabel('Shop name'));
  await page.setViewportSize({ width: 1500, height: 1000 });
  assert((await sold()) === 'Potion (copy),Potion,Hat', 'dragging an item’s icon onto a shop sells it there');
  await page.getByRole('button', { name: 'Duplicate Shop 1' }).or(page.getByRole('button', { name: /^Duplicate Shop/ })).first().click();
  assert((await page.locator('.shop').count()) === 2 && (await page.locator('.shop').nth(1).getByLabel('Item for sale').count()) === 3, 'a shop duplicates with its stock');
  await page.getByLabel('Shop name').nth(1).focus();
  await page.keyboard.press('Alt+ArrowUp');
  assert((await values(page.getByLabel('Shop name')))[0].endsWith('(copy)'), 'shops reorder with Alt+↑');

  // ---------- Wheels ----------
  await page.getByRole('button', { name: '🎡 Wheels & Dice' }).click();
  await page.getByRole('button', { name: '＋ New wheel' }).click();
  const labels = page.locator('.seg input.label');
  await labels.nth(3).focus();
  await page.keyboard.press('Enter');
  assert((await labels.count()) === 5 && (await labels.nth(4).evaluate((e) => e === document.activeElement)), 'Enter in the last label adds a slice and types in it');
  await page.keyboard.type('Dance');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  assert((await labels.count()) === 5 && (await labels.nth(4).evaluate((e) => e === document.activeElement)), 'Backspace in an empty label deletes that slice');
  await labels.nth(4).press('Alt+ArrowUp');
  assert((await values(labels)).join() === 'Option 1,Option 2,Option 3,Dance,Option 4', 'Alt+↑ moves a slice');
  await dragBy(page, page.locator('.seg .drag-grip').nth(3), labels.first());
  assert((await values(labels)).join() === 'Dance,Option 1,Option 2,Option 3,Option 4', 'dragging ⋮⋮ moves a slice');
  await page.getByRole('button', { name: 'Duplicate slice' }).first().click();
  assert((await values(labels)).slice(0, 2).join() === 'Dance,Dance', '⧉ duplicates a slice');
  await page.getByRole('button', { name: 'Delete slice' }).first().click();
  assert((await labels.count()) === 5 && (await notice.innerText()).startsWith('Deleted slice “Dance”'), '🗑 deletes a slice, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  assert((await labels.count()) === 6, 'and Undo brings it back');
  await page.locator('.seg .pct').nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '▲ Move up' }).click();
  assert((await values(labels)).slice(0, 3).join() === 'Dance,Option 1,Dance', `a slice's right-click menu moves it (${await values(labels)})`);
  await page.locator('.seg .pct').nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '🗑 Delete slice' }).click();
  assert((await values(labels)).slice(0, 2).join() === 'Dance,Dance', 'and deletes it');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.locator('.preview path[data-slice="3"]').click({ force: true });
  assert(await labels.nth(3).evaluate((e) => e === document.activeElement), 'clicking a slice on the preview goes to its row');

  // The list: right-click, rename in place, move, duplicate, delete.
  await page.getByRole('button', { name: '＋ New wheel' }).click();
  const wheelList = page.getByRole('list', { name: 'Wheels' }).getByRole('button');
  assert((await texts(wheelList)).join() === 'Wheel 1,Wheel 2', 'two wheels');
  await wheelList.nth(1).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '▲ Move up' }).click();
  assert((await texts(wheelList)).join() === 'Wheel 2,Wheel 1', 'right-click → Move up');
  await wheelList.first().click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '✎ Rename' }).click();
  await page.getByLabel('Wheel name', { exact: true }).first().fill('Dares');
  await page.keyboard.press('Enter');
  assert((await texts(wheelList)).join() === 'Dares,Wheel 1', 'renamed in place');
  await wheelList.first().focus();
  await page.keyboard.press('Control+d');
  assert((await texts(wheelList)).join() === 'Dares,Dares (copy),Wheel 1', 'Ctrl+D duplicates, right after it');
  await dragBy(page, wheelList.nth(2), wheelList.first());
  assert((await texts(wheelList)).join() === 'Wheel 1,Dares,Dares (copy)', 'a drag reorders the list');
  await wheelList.nth(2).focus();
  await page.keyboard.press('Delete');
  assert((await texts(wheelList)).join() === 'Wheel 1,Dares' && (await notice.innerText()).startsWith('Deleted wheel “Dares (copy)”'), 'Delete removes it, with a note');

  // Dice faces from a list.
  await page.getByRole('button', { name: '＋ New dice' }).click();
  await page.getByLabel(/Custom faces/).first().check();
  await page.locator('details.fill summary').click();
  await page.getByLabel('Face labels, one per line').fill('Sip\nDare\n\nSing\nDance');
  await page.getByRole('button', { name: 'Fill and make it a d4' }).click();
  const faces = page.locator('.face input.label');
  assert((await values(faces)).join() === 'Sip,Dare,Sing,Dance', 'the pasted lines fill the faces, and the die gets as many sides');
  assert(!dialogs.length, 'nothing asked with a browser dialog');

  // ---------- Players ----------
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  const typing = () => page.evaluate(() => {
    const e = document.activeElement;
    return e instanceof HTMLInputElement && e.selectionStart === 0 && e.selectionEnd === e.value.length ? e.getAttribute('aria-label') : null;
  });
  assert((await typing()) === 'Player 1 name', '＋ Add player types in the new player’s name (all of it selected)');
  await page.getByLabel('Player 1 name').press('Enter');
  assert(await page.getByLabel('Player 2 name').evaluate((e) => e === document.activeElement), 'Enter in a name adds the next player and types in it');
  await page.keyboard.type('Zed');
  await page.keyboard.press('Alt+ArrowUp');
  assert((await page.getByLabel('Player 1 name').inputValue()) === 'Zed', 'Alt+↑ moves a player up');
  await page.getByRole('button', { name: 'Delete Zed' }).click();
  assert((await notice.innerText()).startsWith('Deleted player “Zed”'), '🗑 deletes a player, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  assert((await page.getByLabel('Player 1 name').inputValue()) === 'Zed', 'and Undo brings them back');
  // A player's right-click menu (in ⚙ Setup).
  const playerNames = () => values(page.getByLabel(/^Player \d name$/));
  await page.locator('[data-place^="player:"] .num').first().click({ button: 'right' });
  const playerMenu = (await texts(page.getByRole('menu').getByRole('menuitem'))).map((t) => t.split('\n')[0]);
  assert(['✎ Rename', '▲ Move up', '▼ Move down', '🗑 Delete player'].every((x) => playerMenu.some((t) => t.startsWith(x))), `right-click a player: rename, move, delete (${playerMenu.join(', ')})`);
  await page.getByRole('menu').getByRole('menuitem', { name: /▼ Move down/ }).click();
  assert((await playerNames()).join() === 'Player 1,Zed', 'its ▼ Move down moves them');
  await page.locator('[data-place^="player:"] .num').nth(1).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '✎ Rename' }).click();
  assert((await typing()) === 'Player 2 name', '✎ Rename types in their name');
  await page.locator('[data-place^="player:"] .num').nth(1).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🗑 Delete player' }).click();
  assert((await playerNames()).join() === 'Player 1' && (await notice.innerText()).startsWith('Deleted player “Zed”'), 'and 🗑 Delete player deletes them, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  await page.getByLabel('Player 2 name').click({ button: 'right' });
  assert(!(await page.getByRole('menu').count()), 'a name box keeps the browser’s own menu');

  // ---------- Board game ----------
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Board game/ }).click();
  const space = (n) => page.getByRole('button', { name: `Space ${n}`, exact: true });
  const at = (n) => space(n).evaluate((e) => [parseFloat(e.style.left), parseFloat(e.style.top)]);
  const selected = () => page.locator('.canvas .space.sel').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').slice(6)));
  await space('Space 3').click();
  const [x0, y0] = await at('Space 3');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  assert((await at('Space 3')).join() === [x0 + 20, y0 + 50].join(), 'arrows nudge the selected space (10, Shift 50)');
  await page.waitForTimeout(1700);
  await page.keyboard.press('Control+z');
  assert((await at('Space 3')).join() === [x0, y0].join(), 'the nudges undo as one step');
  await page.keyboard.press('Tab');
  assert((await selected()).join() === 'Space 4', 'Tab selects the next space');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  assert((await selected()).join() === 'Space 2', 'Shift+Tab the one before');
  await page.keyboard.press('Control+d');
  assert((await selected()).join() === 'Space 13' && (await page.locator('.side').innerText()).includes('→ Space 3'), 'Ctrl+D copies the space, after it on the path');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  await space('Space 5').click();
  await space('Space 6').click({ modifiers: ['Shift'] });
  assert((await selected()).join() === 'Space 5,Space 6' && (await page.locator('.side h4').innerText()) === '2 spaces selected', 'Shift+click adds a space to the selection');
  const [a5, a6] = [await at('Space 5'), await at('Space 6')];
  await dragBy(page, space('Space 5'), { x: (await space('Space 5').boundingBox()).x + 60, y: (await space('Space 5').boundingBox()).y + 90 });
  const [b5, b6] = [await at('Space 5'), await at('Space 6')];
  assert(b5[0] - a5[0] === b6[0] - a6[0] && b5[1] - a5[1] === b6[1] - a6[1] && b5[0] !== a5[0], 'dragging one moves the whole selection');
  await page.keyboard.press('Delete');
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 10, 'Delete removes all of them');
  await page.keyboard.press('Control+z');
  assert((await page.getByRole('button', { name: /^Space / }).count()) === 12, 'in one undo step');
  // A box on the empty board selects the spaces in it.
  const cb = await page.locator('.canvas-box').boundingBox();
  await page.mouse.move(cb.x + 4, cb.y + 4);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width * 0.6, cb.y + cb.height * 0.3, { steps: 6 });
  await page.mouse.up();
  const boxed = await selected();
  assert(boxed.length >= 2 && boxed.includes('Start'), `a box selects the spaces in it (${boxed.join(', ')})`);
  await page.keyboard.press('Escape');
  // Alt+drag links a space to another; again unlinks.
  await space('Space 2').click();
  await page.keyboard.down('Alt');
  await dragBy(page, space('Space 2'), space('Space 8'));
  await page.keyboard.up('Alt');
  await space('Space 2').click();
  assert((await page.locator('.side').innerText()).includes('→ Space 8'), 'Alt+drag from a space links it to where it is let go');
  await dragBy(page, page.getByRole('button', { name: 'Link Space 2 to…' }), space('Space 8'));
  assert(!(await page.locator('.side').innerText()).includes('→ Space 8'), 'dragging its ⊕ onto a linked space unlinks it');
  // Right-click a link: reverse it, both ways, remove.
  const l = await page.locator('.canvas line.hit').first().evaluate((e) => [e.getAttribute('data-link'), +e.getAttribute('x1'), +e.getAttribute('y1'), +e.getAttribute('x2'), +e.getAttribute('y2')]);
  const scale = cb.width / 1920;
  const mid = { x: cb.x + ((l[1] + l[3]) / 2) * scale, y: cb.y + ((l[2] + l[4]) / 2) * scale };
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '⇄ Both ways' }).click();
  assert((await page.locator('.canvas line[marker-start]').count()) === 1, 'right-click a link → Both ways');
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '− Unlink' }).click();
  assert((await notice.innerText()).startsWith('Unlinked'), 'and → Unlink, with a note');
  await notice.getByRole('button', { name: '↶ Undo' }).click();
  // Zones reorder (the header's ↶ ↷ undo it).
  await page.getByRole('tab', { name: /Off-board zones/ }).click();
  await page.getByRole('button', { name: '＋ Zone' }).click();
  await page.getByRole('button', { name: '＋ Zone' }).click();
  const zones = page.getByLabel('Zone name');
  await zones.nth(1).focus();
  await page.keyboard.press('Alt+ArrowUp');
  assert((await values(zones)).join() === 'Zone 2,Shadow Realm', 'Alt+↑ reorders zones');
  await dragBy(page, page.locator('.zone .drag-grip').nth(1), zones.first());
  assert((await values(zones)).join() === 'Shadow Realm,Zone 2', 'and so does a drag');
  assert(!(await page.locator('.zones').getByRole('button', { name: 'Undo (Ctrl+Z)' }).count()), 'the zones view has no ↶ of its own (the header has it)');
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  assert((await values(zones)).join() === 'Zone 2,Shadow Realm', "the header's ↶ undoes");
  await page.getByRole('button', { name: 'Delete zone Zone 2' }).click();
  assert((await zones.count()) === 1 && (await notice.innerText()).startsWith('Deleted zone “Zone 2”') && !dialogs.length, 'deleting a zone asks nothing and offers Undo');
  // A zone's right-click menu: duplicate, move, delete (and Ctrl+D in it).
  await page.locator('.zone .drag-grip').first().click({ button: 'right' });
  const zoneMenu = (await texts(page.getByRole('menu').getByRole('menuitem'))).map((t) => t.split('\n')[0]);
  assert(['✎ Edit its screen…', '⧉ Duplicate', '▲ Move up', '▼ Move down', '🗑 Delete zone'].every((x) => zoneMenu.some((t) => t.startsWith(x))), `right-click a zone: its menu (${zoneMenu.join(', ')})`);
  await page.getByRole('menu').getByRole('menuitem', { name: /⧉ Duplicate/ }).click();
  assert((await values(zones)).join() === 'Shadow Realm,Shadow Realm (copy)', 'its ⧉ Duplicate puts a copy right after it');
  await zones.first().focus();
  await page.keyboard.press('Control+d');
  assert((await values(zones)).join() === 'Shadow Realm,Shadow Realm (copy 2),Shadow Realm (copy)', 'Ctrl+D in a zone duplicates it');
  await page.locator('.zone .drag-grip').nth(2).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: /▲ Move up/ }).click();
  assert((await values(zones)).join() === 'Shadow Realm,Shadow Realm (copy),Shadow Realm (copy 2)', 'its ▲ Move up moves it');
  await page.locator('.zone .drag-grip').nth(2).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🗑 Delete zone' }).click();
  assert((await zones.count()) === 2 && (await notice.innerText()).startsWith('Deleted zone “Shadow Realm (copy 2)”'), 'and 🗑 Delete zone deletes it, with a note');

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/lists-zones.png` });
  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log('lists: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'lists-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
