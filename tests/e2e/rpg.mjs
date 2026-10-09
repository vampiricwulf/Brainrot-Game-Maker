// RPG rounds: build a tiny world (two screens, an item, stats), then play it: move with the pad and the keys, pick
// the item up, change a stat, undo and redo, show the map, and check viewers never see secret objects.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, dragBy, openGameFile, playWithPlayers } from './helpers.mjs';

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
const toast = () => page.locator('.toast').innerText();

/** A big world (20×20 screens) from a file, with four players and an audience window. */
async function bigWorld() {
  console.log('A 20×20 world:');
  const text = (id, t, x, y) => ({ id, kind: 'text', text: t, x, y, w: 520, h: 100, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 48, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
  const shape = (id, name, x, y, role) => ({ id, name, kind: 'shape', shape: 'rect', x, y, w: 150, h: 150, rotation: 0, opacity: 1, zIndex: 1, fill: '#aa5500', stroke: '#000', strokeWidth: 0, radius: 0, role });
  const screens = [];
  for (let r = 0; r < 20; r++)
    for (let c = 0; c < 20; c++)
      screens.push({ id: `sc_${c}_${r}`, name: `Field ${c},${r}`, col: c, row: r, slide: { background: { color: `hsl(${(c * 17 + r * 7) % 360},40%,30%)` }, elements: [text(`t_${c}_${r}`, `Field ${c},${r}`, 700, 40)] } });
  screens[0].name = 'Village';
  screens[0].slide.elements.push(
    shape('el_door', 'Dungeon door', 200, 300, { class: 'doorway', to: { map: 'm_dun', screen: 'd_1' } }),
    shape('el_gold', 'Gold pile', 900, 300, { class: 'currency', field: 'f_gold', amount: 10 }),
    shape('el_trap', 'Trap', 1400, 300, { class: 'hazard', actions: [{ id: 'a_trap', do: 'stat', field: 'f_hp', op: 'add', amount: -3, who: 'party' }] }),
  );
  screens[1].exits = { e: { kind: 'blocked', note: 'A wall of fire' } };
  const map = (id, name, cols, rows, list, visibility) => ({ id, name, cols, rows, screens: list, visibility, showExits: true, revealNeighbors: true, diagonals: true, wrap: false, transition: 'cut' });
  const game = {
    id: 'g_big_world', version: 2, title: 'Big world',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: true, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8 },
    players: ['Ann', 'Bob', 'Cy', 'Dee'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
    rounds: [{ id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' }],
    media: [], audio: {}, wheels: [], dice: [], theme: {},
    statFields: [
      { id: 'f_hp', name: 'HP', type: 'number', start: 10, min: 0, max: 10, display: 'hearts', audience: 'hud' },
      { id: 'f_gold', name: 'Gold', type: 'number', start: 5, min: 0, currency: true, symbol: '🪙', audience: 'hud', display: 'counter' },
    ],
    items: [],
    worlds: [{ id: 'w1', name: 'World', maps: [map('m_main', 'Overworld', 20, 20, screens, 'discovered'), map('m_dun', 'Dungeon', 1, 1, [{ id: 'd_1', name: 'Dungeon 1', col: 0, row: 0, slide: { background: { color: '#222' }, elements: [] } }], 'hidden')] }],
  };
  mkdirSync(resolve('test-results'), { recursive: true });
  const gameFile = resolve('test-results/rpg-big-world.json');
  writeFileSync(gameFile, JSON.stringify(game));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Every sound a window starts (a built-in cue's link ends in #its-name).
  await ctx.addInitScript(() => {
    window.__plays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__plays.push(this.src);
      return play.call(this);
    };
  });
  const host = await ctx.newPage();
  host.on('pageerror', (e) => errors.push(`[big world] ${e.message}`));
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).waitFor();
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  aud.on('pageerror', (e) => errors.push(`[big world audience] ${e.message}`));
  await aud.setViewportSize({ width: 1280, height: 720 });
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.rh').waitFor();
  await host.waitForTimeout(500);
  // The stats strip never covers the screen: the screen is scaled into the room above it.
  const strip = await aud.locator('.rpg > .strip').boundingBox();
  const area = await aud.locator('.rpg .play-area').boundingBox();
  assert(strip && area && area.y + area.height <= strip.y + 1 && area.height > 500, `the stats strip doesn’t cover the screen (screen ends at ${Math.round(area.y + area.height)}, strip starts at ${Math.round(strip.y)})`);
  const cues = (p) => p.evaluate(() => window.__plays.filter((s) => s.includes('#')).map((s) => s.split('#').pop()));
  const said = () => host.locator('.toast').innerText();
  const there = () => host.locator('.rh .where').innerText();

  // The minimap: the cells around the party, big enough to read, and one Tab stop (the arrow keys go between screens).
  const mini = host.locator('.rh .mapbox .cell');
  const cell = await mini.first().boundingBox();
  assert((await mini.count()) === 35 && cell.height >= 12 && cell.width >= 20, `the minimap shows the 7×5 screens around the party (${await mini.count()}, ${Math.round(cell.width)}×${Math.round(cell.height)})`);
  const stops = host.locator('.rh .mapbox .cell:not([tabindex="-1"])');
  assert((await stops.count()) === 1, 'the minimap is one Tab stop');
  await stops.focus();
  await host.keyboard.press('ArrowRight');
  assert((await host.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Overworld · Field 1,0', 'the arrow keys go to the next screen on it');
  // The full map (J) stays in the window.
  await host.getByRole('button', { name: '⤢ Full map' }).click();
  const jump = host.getByRole('dialog', { name: 'Full map' });
  const jb = await jump.boundingBox();
  const close = await jump.getByRole('button', { name: 'Close' }).boundingBox();
  assert(jb.x >= 0 && jb.x + jb.width <= 1280 && jb.y + jb.height <= 720 && close.x + close.width <= 1280, `the full map fits the window, ✕ included (${JSON.stringify(jb)})`);
  assert(await jump.locator('.cell[aria-label="Overworld · Field 19,0"]').isVisible(), 'all 20 columns are in it');
  await host.keyboard.press('Escape');
  await jump.waitFor({ state: 'detached' });

  // The map on stream: just the part viewers know (and a cell around it), with big cells.
  await host.getByRole('button', { name: '🗺 Map on stream' }).click();
  await aud.locator('.map-ov .cell').first().waitFor();
  const ov = await aud.locator('.map-ov').evaluate((e) => getComputedStyle(e).backgroundColor);
  assert(/^rgb\(/.test(ov), `the map on stream is solid, the screen behind doesn’t show through (${ov})`);
  const mapStrip = await aud.locator('.rpg > .strip').boundingBox();
  const mapBox = await aud.locator('.map-ov').boundingBox();
  assert(mapBox.y + mapBox.height <= mapStrip.y, 'and it stays clear of the stats strip');
  const shown = await aud.locator('.map-ov .cell').count();
  const ac = await aud.locator('.map-ov .cell').first().boundingBox();
  assert(shown === 9 && ac.width > 100, `viewers’ map shows the known screens and one cell around them (${shown} cells, ${Math.round(ac.width)}px wide)`);
  // Moving with it on stream stays quick.
  const cdp = await aud.context().newCDPSession(aud);
  await cdp.send('Performance.enable');
  const busy = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'ScriptDuration').value;
  const before = await busy();
  for (let i = 0; i < 10; i++) {
    await host.keyboard.press(i % 2 ? 'Numpad4' : 'Numpad6');
    await host.waitForTimeout(40);
  }
  await host.waitForTimeout(500);
  const spent = (await busy()) - before;
  assert(spent < 1.5, `ten moves with the map on stream keep the audience window quick (${spent.toFixed(2)}s of script)`);
  await host.getByRole('button', { name: '🗺 Map on stream' }).click();

  // Walking in from the south edge, the avatars stand clear of the stats strip.
  await host.keyboard.press('Numpad2');
  await host.waitForTimeout(400);
  await host.keyboard.press('Numpad8');
  await host.waitForTimeout(800);
  const stripTop = Math.min(...(await host.locator('.rpg .strip .card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))));
  const lowest = Math.max(...(await host.locator('.rpg .avatar[data-player-id]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom))));
  assert((await there()).includes('Village') && lowest <= stripTop, `arriving from the south they stand above the stats strip (${Math.round(lowest)} ≤ ${Math.round(stripTop)})`);
  assert((await cues(aud)).includes('step'), 'a step plays the Step sound on stream');
  // The plain arrow keys move the party too (no video or sound on screen for them to seek).
  await host.keyboard.press('ArrowDown');
  await host.waitForTimeout(400);
  const southOf = await there();
  await host.keyboard.press('ArrowUp');
  await host.waitForTimeout(800);
  assert(!southOf.includes('Village') && (await there()).includes('Village'), `the arrow keys move the party (↓ to ${southOf}, ↑ back)`);
  // The ? list says so, among the RPG keys.
  await host.keyboard.press('?');
  const keyList = host.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await keyList.waitFor();
  const rpgKeys = await keyList.locator('section').filter({ has: host.getByRole('heading', { name: 'RPG', exact: true }) }).innerText();
  assert(rpgKeys.includes('← ↑ → ↓'), 'the ? list has the arrow keys among the RPG keys');
  await host.keyboard.press('Escape');
  await keyList.waitFor({ state: 'detached' });
  // Under ⏸ Cover, viewers hear nothing new: a step there and back makes no sound on stream.
  await host.keyboard.press('b');
  await aud.locator('.cover').waitFor();
  const heard = (await cues(aud)).length;
  await host.keyboard.press('Numpad2');
  await host.waitForTimeout(400);
  await host.keyboard.press('Numpad8');
  await host.waitForTimeout(800);
  assert((await cues(aud)).length === heard, `under the cover the party’s steps make no sound on stream (${(await cues(aud)).slice(heard).join(', ')})`);
  await host.keyboard.press('b');
  await aud.locator('.cover').waitFor({ state: 'detached' });
  await host.keyboard.press('Numpad6');
  await host.waitForTimeout(300);
  await host.keyboard.press('Numpad6');
  assert((await said()) === 'Blocked: A wall of fire', 'a blocked way says so');
  await host.waitForTimeout(300);
  assert((await cues(aud)).includes('blocked'), '…with the Blocked sound');
  await host.keyboard.press('Numpad4');
  await host.waitForTimeout(400);

  // Four players with 10 hearts each: a count, so the gold stays on its card.
  const cards = await host.locator('.rpg .strip .card').evaluateAll((els) =>
    els.map((c) => ({ text: c.innerText, right: c.getBoundingClientRect().right, last: c.querySelector('.stats > :last-child')?.getBoundingClientRect().right ?? 0 })),
  );
  assert(cards.every((c) => c.text.includes('♥ 10/10') && c.text.includes('🪙5') && c.last <= c.right), 'many hearts show as “♥ 10/10”, and the gold stays on each card');

  // Picking up with two players picked: the first one picks it up, and the button says so.
  await host.keyboard.press('1');
  await host.keyboard.press('2');
  await host.locator('.rh .objs button', { hasText: 'Gold pile' }).click();
  const pick = host.getByRole('dialog', { name: 'Object: Gold pile' }).getByRole('button', { name: /picks up/ });
  assert((await pick.innerText()) === '✋ Ann picks up 🪙10', `the pick-up button names the one who picks it up (${await pick.innerText()})`);
  await pick.click();
  await host.waitForTimeout(300);
  assert((await host.locator('.rpg .strip .card').first().innerText()).includes('🪙15') && (await cues(aud)).includes('pickUp'), 'Ann gets it, with the Pick up sound');

  // Cy & Dee split off and walk south (viewers follow them); the Trap at the Village hurts the party standing there.
  await host.keyboard.press('Escape');
  await host.keyboard.press('3');
  await host.keyboard.press('4');
  await host.getByRole('button', { name: '✂ Split off selected' }).click();
  assert((await said()) === 'Cy & Dee are Party 2 now: the pad moves them', `splitting off says who the pad moves now (${await said()})`);
  // Split view while they still stand together says why it shows one screen.
  await host.getByRole('button', { name: '▦ Split view' }).click();
  assert((await said()).startsWith('Everyone is on this screen'), `split view with everyone in one place says so (${await said()})`);
  await host.keyboard.press('Numpad2');
  await host.waitForTimeout(800);
  await host.locator('.rpg .hit[data-object="el_trap"]').click();
  // At 1280×720 the card opens with the pad and the minimap still in sight, and they stay pinned scrolled to its foot.
  const padSeen = () =>
    host.locator('.rh .pad').evaluate((p) => {
      let b = p.parentElement;
      while (b && !(b.scrollHeight > b.clientHeight && /auto|scroll/.test(getComputedStyle(b).overflowY))) b = b.parentElement;
      const v = b ? b.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const r = p.getBoundingClientRect();
      const m = document.querySelector('.rh .mapbox').getBoundingClientRect();
      return r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && m.top >= v.top - 1;
    });
  assert(await padSeen(), 'an object’s card opens with the pad and the minimap in sight');
  await host.getByRole('dialog', { name: 'Object: Trap' }).getByRole('button', { name: '🗑 Remove' }).scrollIntoViewIfNeeded();
  assert(await padSeen(), 'scrolled to the card’s foot, the pad and the minimap stay pinned in sight');
  await host.getByRole('dialog', { name: 'Object: Trap' }).getByRole('button', { name: 'HP −3' }).click();
  assert((await said()) === 'Trap: HP −3: Ann & Bob', `the Trap’s party button hurts the party at the Trap, not the one viewers follow (${await said()})`);
  await host.waitForTimeout(300);
  assert((await cues(aud)).includes('hurt'), '…with the Damage sound');
  await host.keyboard.press('Escape');
  // In split view, everyone selected: dragging one avatar moves the ones on the other pane too, by as much.
  {
    const av = host.locator('.rpg .avatar[data-player-id]');
    const boxes = () => Promise.all(['p1', 'p2', 'p3', 'p4'].map((id) => host.locator(`.rpg .avatar[data-player-id="${id}"]`).boundingBox()));
    for (const k of ['1', '2', '3', '4']) await host.keyboard.press(k);
    const start = await boxes();
    assert(new Set(await av.evaluateAll((els) => els.map((e) => e.closest('.pane')?.dataset.screen))).size === 2, 'split view shows both parties’ screens');
    await dragBy(host, host.locator('.rpg .avatar[data-player-id="p1"]'), { x: start[0].x + start[0].width / 2 - 50, y: start[0].y + start[0].height / 2 - 30 });
    await host.waitForTimeout(350);
    const end = await boxes();
    const d = start.map((r, i) => [Math.round(end[i].x - r.x), Math.round(end[i].y - r.y)]);
    const same = d.every(([x, y]) => Math.abs(x - d[0][0]) <= 2 && Math.abs(y - d[0][1]) <= 2);
    assert(same && Math.abs(d[0][0]) > 10, `in split view the selected players on both screens move together (${JSON.stringify(d)})`);
    await host.keyboard.press('Control+z');
    assert((await said()).includes('Undid Move Ann, Bob, Cy & Dee'), `…as one step (${await said()})`);
    await host.keyboard.press('Escape');
  }

  // Everyone back together at the Village (with Ann & Bob's party), through the door to a map viewers aren't shown:
  // their map says so.
  await host.locator('.rh .party', { hasText: 'Party 1' }).click();
  await host.keyboard.press('g');
  await host.waitForTimeout(300);
  await host.locator('.rh .objs button', { hasText: 'Dungeon door' }).click();
  await host.getByRole('button', { name: '🚪 Go through (party)' }).click();
  await host.waitForTimeout(500);
  assert((await there()).includes('Dungeon 1') && (await cues(aud)).includes('doorway'), 'through the door, with the Doorway sound');
  await host.getByRole('button', { name: '🗺 Map on stream' }).click();
  await aud.locator('.map-ov').waitFor();
  assert((await aud.locator('.map-ov').innerText()).includes('This map is hidden from viewers') && !(await aud.locator('.map-ov .cell').count()), 'on a hidden map, the viewers’ map says it’s hidden');
  if (process.env.SHOTS) await aud.screenshot({ path: `${process.env.SHOTS}/rpg-big-hidden.png` });
  await ctx.close();
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // Stats & items: in the sidebar once there's an RPG (or board game) round to use them.
  assert((await page.getByRole('button', { name: '📊 Stats & Items' }).count()) === 0, 'a game of Jeopardy rounds has no 📊 Stats & Items in the sidebar');
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /RPG/ }).click();
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  await page.getByRole('button', { name: /Gold \(currency/ }).click();
  // Gold starts at 10, enough to try a shop; this game starts everyone broke (the shop below asks when they're short).
  const goldStart = page.locator('label.field', { hasText: /^Start/ }).locator('input[type="number"]').last();
  assert((await goldStart.inputValue()) === '10', `the Gold preset starts at 10 (${await goldStart.inputValue()})`);
  await goldStart.fill('0');
  await page.getByRole('button', { name: '＋ Add item', exact: true }).click();
  await page.getByLabel('Item name').fill('Potion');
  // Using it takes 1 HP (the first stat). A new item has its More open.
  await page.getByRole('button', { name: '＋ Add button' }).click();
  await page.getByRole('menuitem', { name: '📊 Change a stat' }).click();
  // A hat, drawn right on an avatar: it goes where it was drawn, and the preview shows it.
  await page.getByRole('button', { name: '＋ Add item', exact: true }).click();
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
  await page.getByRole('button', { name: '＋ Add shop' }).click();
  // It lists the items it doesn't sell yet.
  await page.getByRole('button', { name: '＋ Add item to sell ▾' }).click();
  assert((await page.getByRole('menu').getByRole('menuitem').allTextContents()).map((t) => t.trim()).join('|') === 'Potion|Hat|＋ Add everything', 'Something to sell lists the items and Everything');
  await page.getByRole('menu').getByRole('menuitem', { name: 'Potion' }).click();
  await page.locator('label', { hasText: 'Buys back at' }).locator('input').fill('50');
  // A second shop, deleted below.
  await page.getByRole('button', { name: '＋ Add shop' }).click();

  // The RPG round: its world starts with one screen; add one to the east.
  await page.locator('nav > button.round-tab', { hasText: 'Adventure' }).click();
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  assert(await page.getByRole('button', { name: 'Screen Screen B1' }).isVisible(), 'a screen can be added to the map grid');
  const b1Name = await page.getByRole('button', { name: 'Screen Screen B1' }).locator('.nm').innerText();
  assert(b1Name === 'Screen B1', `its name on the map has its space (${b1Name})`);
  const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert((await focusedLabel()) === 'Screen Screen B1', `the new screen has the focus (not the page) (${await focusedLabel()})`);
  // Ctrl+C on it copies the screen, though the round's name is still selected from when the round was added.
  await page.keyboard.press('Control+c');
  assert((await toast()).startsWith('Copied Screen B1'), `Ctrl+C right after adding the round copies the screen (${await toast()})`);
  // Enter on an empty cell adds a screen there, and the focus stays on the map.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert((await focusedLabel()) === 'Screen Screen B2', `Enter on an empty cell adds a screen with the focus on it (${await focusedLabel()})`);
  await page.keyboard.press('Delete');
  assert(!(await page.getByRole('button', { name: 'Screen Screen B2' }).count()), 'Delete takes it away again');
  // Enter on a screen edits it with the focus on its canvas (not lost to the page), and Tab goes through its items
  // and then on, out of the canvas: no keyboard trap.
  await page.getByRole('button', { name: 'Screen Screen B1' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '◀ Back to the map' }).waitFor();
  await page.waitForTimeout(100);
  const onCanvas = () => page.evaluate(() => !!document.activeElement?.closest('.canvas'));
  assert(await onCanvas(), 'Enter on a screen opens its editor with the focus on the canvas');
  let tabs = 0;
  while ((await onCanvas()) && tabs < 10) {
    await page.keyboard.press('Tab');
    tabs++;
  }
  assert(!(await onCanvas()) && (await page.evaluate(() => document.activeElement !== document.body)), `Tab goes through the screen's items and on to the next control (${tabs} tabs)`);
  await page.getByRole('button', { name: '◀ Back to the map' }).click();
  // Clearing Columns (to type another number) deletes nothing: the box shows the size again.
  await page.locator('summary', { hasText: 'Map settings' }).click();
  const cols = page.locator('label.field', { hasText: 'Columns' }).locator('input');
  const colsWas = await cols.inputValue();
  await cols.fill('');
  await cols.press('Tab');
  assert((await cols.inputValue()) === colsWas && (await page.getByRole('button', { name: 'Screen Screen B1' }).count()) === 1, `clearing Columns keeps the map as it is (${await cols.inputValue()})`);
  await page.locator('summary', { hasText: 'Map settings' }).click();
  // Alt+drag from a screen (the map full where it starts) draws a box: both screens selected, nothing moved.
  const startBox = await page.getByRole('button', { name: 'Screen Start' }).boundingBox();
  const b1Box = await page.getByRole('button', { name: 'Screen Screen B1' }).boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1Box.x + b1Box.width / 2, b1Box.y + b1Box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(150);
  const boxed = await page.locator('.grid-map .cell.screen.sel').count();
  const startAt = await page.getByRole("button", { name: "Screen Start" }).getAttribute("data-cell");
  assert(boxed === 2 && startAt === "0,0" && (await page.locator(".side h4").first().innerText()) === '2 screens selected', `Alt+drag from a screen draws a box (${boxed} selected, Start at ${startAt})`);
  await page.keyboard.press('Escape');
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

  // The round's top: where players start, in plain words; the world (for carrying the adventure on) under Advanced.
  assert(await page.getByText('Players start on').isVisible(), 'the round says where players start on');
  assert((await page.getByText('Party starts at').count()) === 0, 'not “Party starts at”');
  assert(!(await page.getByLabel('World', { exact: true }).isVisible()) && (await page.locator('summary', { hasText: 'Advanced: carry this adventure into another round' }).isVisible()), 'the world picker waits under ⋯ Advanced');
  // A second adventure (the Mini quest template) has its own world: one line says so, and ⋯ Advanced stays shut.
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Mini quest/ }).click();
  await page.locator('[data-world-own]').waitFor();
  assert(
    (await page.locator('[data-world-own]').innerText()) === 'Its own world (separate from Adventure).' && !(await page.locator('details.adv').evaluate((d) => d.open)) && !(await page.getByLabel('World', { exact: true }).isVisible()),
    'adding the Mini quest to a game with an adventure keeps ⋯ Advanced shut: “Its own world (separate from Adventure)”',
  );
  await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await page.locator('nav > button.round-tab', { hasText: 'Adventure' }).click();
  // A character's Shop box makes a shop right there, and says where shops are set up.
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  await page.getByRole('button', { name: '🧙 Character' }).click();
  await page.getByPlaceholder('e.g. Old Man, Cave door').fill('Old Man');
  assert((await page.locator('[data-shop-hint]').innerText()).includes('Stats & Items'), 'the Shop box says shops are set up in 📊 Stats & Items');
  await page.getByLabel('Shop', { exact: true }).selectOption({ label: '＋ New shop…' });
  const madeShop = await page.getByLabel('Shop', { exact: true }).locator('option:checked').innerText();
  assert(madeShop === 'Old Man’s shop' && (await page.locator('[data-shop-hint]').innerText()).includes('Made “Old Man’s shop”, selling all 2 items'), `＋ New shop… makes one selling the catalog, and picks it (${madeShop})`);
  // The Layers list shows what an object is by its icon.
  const oldManIcon = await page.locator('.layers .row', { hasText: 'Old Man' }).locator('.ic').innerText();
  assert(oldManIcon === '🧙', `Layers shows a character with 🧙, not 🅣 (${oldManIcon})`);
  // 👹 Enemy: a character with HP and Power that viewers see, and buttons for the fight.
  await page.getByRole('button', { name: '👹 Enemy' }).click();
  assert((await page.getByLabel('Object class').inputValue()) === 'npc' && (await page.getByLabel('Stat name').evaluateAll((els) => els.map((e) => e.value))).join(',') === 'HP,Power', '👹 Enemy places a character with its own HP and Power');
  assert((await page.locator('[data-action]').count()) === 2, 'with a roll and an HP −1 button for the fight');
  // Leaving for 📊 Stats & Items and coming back opens the same screen again.
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.locator('nav > button.round-tab', { hasText: 'Adventure' }).click();
  assert(await page.getByRole('button', { name: '◀ Back to the map' }).isVisible(), 'coming back to the round opens the screen being edited');
  // (The game below has neither of them.)
  for (const name of ['Enemy', 'Old Man']) {
    await page.locator('.layers .row', { hasText: name }).locator('.txt').click();
    await page.keyboard.press('Delete');
  }
  assert((await page.locator('.layers .row', { hasText: /Enemy|Old Man/ }).count()) === 0, 'they delete again');
  await page.getByRole('button', { name: '◀ Back to the map' }).click();

  // Play it: two players, straight to the adventure.
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  playing = true;
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Next round ▶' }).click();
  await page.waitForTimeout(450);
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  if (await yes.isVisible()) await yes.click();
  // The round opens on its title card: clicking it goes on.
  await page.locator('.stage-box .title-card').click();
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
  const gateListed = await page.locator('.rh .objs').getByRole('button', { name: /Gate/ }).innerText();
  assert(gateListed === 'Gate · Doorway', `the objects here are listed with what they are in words (${gateListed})`);
  await page.locator('.rh .objs').getByRole('button', { name: /Gate/ }).click();
  const gate = page.getByRole('dialog', { name: 'Object: Gate' });
  const gateKind = await gate.locator('.cls').innerText();
  assert(gateKind === 'Doorway', `the card says what it is in words (${gateKind}), never a code like “npc”`);
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
  await page.locator('.panel [data-next]', { hasText: 'Spin!' }).click();
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
  await pad.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  // Esc asks right in the pad before throwing the drawing away (a browser dialog would show on stream); Esc again keeps it.
  await page.keyboard.press('Escape');
  const discard = pad.getByRole('group', { name: 'Discard this drawing?' });
  await discard.waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-drawpad-discard.png` });
  await page.keyboard.press('Escape');
  assert((await discard.count()) === 0 && (await pad.isVisible()) && !dialogs.length, 'Esc asks in the drawpad (no browser dialog), and Esc again goes back to drawing');
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
  assert((await lava.locator('.cls').innerText()) === 'Zone', 'it can be named and made a zone');
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
  // Esc is Done, after the editor's own Esc (the object it opened with is selected: that comes off first).
  for (let i = 0; i < 3 && (await liveEd.count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  assert(!(await liveEd.count()), 'Esc closes the live screen editor (after its own Esc steps)');
  assert(await page.getByRole('button', { name: 'Object: Lava' }).isVisible(), 'after editing it is still on the stage');
  await page.keyboard.press('Escape');

  // Both players and Lava selected (a click on an avatar, Shift+click on an object): dragging one drags them all.
  {
    const av = page.locator('.rpg .avatar[data-player-id]');
    const boxes = async () => Promise.all([av.nth(0).boundingBox(), av.nth(1).boundingBox(), hit.boundingBox()]);
    const moved = (a, b) => a.map((r, i) => [Math.round(b[i].x - r.x), Math.round(b[i].y - r.y)]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await av.nth(0).click();
    await av.nth(1).click();
    await hit.click({ modifiers: ['Shift'] });
    assert(!(await page.getByRole('dialog', { name: 'Object: Lava' }).count()), 'Shift+click on an object selects it (no card)');
    const inList = page.locator('.rh .objs').getByRole('button', { name: /Lava/ });
    assert((await inList.getAttribute('aria-pressed')) === 'true' && (await page.locator('.rh .side').innerText()).includes('1 selected'), 'the host panel’s list shows it selected');
    // Hovering it on the stage only outlines it: no button colour over it (viewers see this stage in one window).
    await hit.hover();
    assert((await hit.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgba(0, 0, 0, 0)', 'hovering an object doesn’t cover it');
    // Shift+click in the list takes it out of the selection, and puts it back (no card either).
    await inList.click({ modifiers: ['Shift'] });
    assert((await inList.getAttribute('aria-pressed')) === 'false', 'Shift+click in the list takes it out of the selection');
    await inList.click({ modifiers: ['Shift'] });
    assert((await inList.getAttribute('aria-pressed')) === 'true' && !(await page.getByRole('dialog', { name: 'Object: Lava' }).count()), '…and back in, without opening its card');
    const start = await boxes();
    await dragBy(page, av.nth(0), { x: start[0].x + start[0].width / 2 - 70, y: start[0].y + start[0].height / 2 - 40 });
    await page.waitForTimeout(350);
    const d = moved(start, await boxes());
    const same = d.every(([x, y]) => Math.abs(x - d[0][0]) <= 2 && Math.abs(y - d[0][1]) <= 2);
    assert(same && Math.abs(d[0][0]) > 10 && Math.abs(d[0][1]) > 10, `the selected players and object move together by the same amount (${JSON.stringify(d)})`);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(350);
    assert((await toast()).includes('Undid Move Player 1, Player 2 & Lava'), `one step moved them all (${await toast()})`);
    const back = moved(start, await boxes());
    assert(back.every(([x, y]) => Math.abs(x) <= 2 && Math.abs(y) <= 2), `one Ctrl+Z puts them all back (${JSON.stringify(back)})`);
    // Esc takes off the selected objects, then the players. An avatar that isn't selected drags on its own, even with
    // other things selected.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await av.nth(0).click();
    await hit.click({ modifiers: ['Shift'] });
    const start2 = await boxes();
    await dragBy(page, av.nth(1), { x: start2[1].x + start2[1].width / 2 - 70, y: start2[1].y + start2[1].height / 2 - 40 });
    await page.waitForTimeout(350);
    const d2 = moved(start2, await boxes());
    assert(Math.abs(d2[1][0]) > 10 && d2[0].every((v) => Math.abs(v) <= 2) && d2[2].every((v) => Math.abs(v) <= 2), `an unselected avatar dragged moves on its own (${JSON.stringify(d2)})`);
    await page.keyboard.press('Control+z');
    // Nothing selected again for what follows.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

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
  await page.keyboard.press('v');
  await page.locator('.rpg .map-ov').waitFor();
  assert(true, 'V shows the map to viewers');
  await page.keyboard.press('v');
  await page.waitForTimeout(300);
  assert(!(await page.locator('.rpg .map-ov').count()), 'V again takes the map off the screen');
  await page.keyboard.press('b');
  await page.locator('.cover').waitFor();
  assert(true, 'B covers the screen');
  await page.keyboard.press('b');

  // Improvising: typed text starts hidden; a new look; a new screen to the south; keep it in the game.
  await page.getByRole('button', { name: '＋ Text' }).click();
  await page.locator('.rh').getByRole('textbox', { name: 'Text', exact: true }).fill('Beware of the goose');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '＋ Add text' }).click();
  await page.getByRole('dialog', { name: 'Object: Beware of the goose' }).waitFor();
  assert(!(await page.locator('.rpg').innerText()).toLowerCase().includes('goose'), 'typed text is added hidden from viewers, and its card opens');
  await page.keyboard.press('Escape');
  await page.locator('.rh .objs').getByRole('button', { name: /Beware of the goose/ }).waitFor();
  await page.getByLabel('Look').selectOption('+');
  assert((await page.getByRole('textbox', { name: 'Look name' }).inputValue()) === 'New look', 'a new look asks for its name (New look to start with)');
  await page.getByRole('textbox', { name: 'Look name' }).press('Enter');
  await page.getByRole('dialog', { name: /Edit Start \(New look\) live/ }).waitFor();
  assert(true, 'a new look opens in the live editor');
  await page.getByRole('button', { name: 'Done' }).click();
  assert((await page.getByLabel('Look').locator('option:checked').innerText()).includes('New look'), 'the screen now shows the new look');
  const lastStep = () => page.locator('.rh .last').innerText();
  await page.getByLabel('Look').selectOption('');
  assert((await lastStep()) === 'Last: Start: original look', `going back to the original look is a step named so (${await lastStep()})`);
  await page.keyboard.press('Control+z');
  assert((await page.getByLabel('Look').locator('option:checked').innerText()).includes('New look'), 'Ctrl+Z puts the new look back on');
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
  // The row follows the buyer's gold: with enough it goes, and Ctrl+Z (taking the gold back) brings it back.
  await firstCard.getByRole('button', { name: 'Player 1 Gold plus 1' }).click();
  await shopTc.getByText(/^Short by/).waitFor({ state: 'detached' });
  assert(true, 'with the gold to pay, the host is no longer told they are short');
  await page.keyboard.press('Control+z');
  await shopTc.getByText('Short by 🪙1 for Potion.').waitFor();
  assert(true, 'Ctrl+Z takes the gold back and the row says so again');
  // Other price… at a price still too much: the row says the gap at that price, and Sell anyway charges that price.
  const priceBox = shopTc.getByRole('spinbutton', { name: 'Price' });
  await shopTc.getByRole('button', { name: 'Other price…' }).click();
  await priceBox.fill('2');
  await priceBox.press('Enter');
  await shopTc.getByText('Short by 🪙2 for Potion.').waitFor();
  await shopTc.getByRole('button', { name: 'Other price…' }).click();
  assert((await priceBox.inputValue()) === '2', `Other price… again starts at the price typed (${await priceBox.inputValue()})`);
  await shopTc.getByRole('button', { name: 'Cancel' }).click();
  await shopTc.getByRole('button', { name: 'Sell anyway' }).click();
  assert((await potions()) === 2, 'selling anyway adds it to the buyer’s inventory');
  assert((await shopTc.innerText()).includes('Player 1 🪙-2'), `and their gold goes below zero, by the price typed (${await shopTc.innerText()})`);
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

  // Dragging things where they go. An avatar dropped on another screen of the minimap goes there on its own.
  const avatars = page.locator('.rpg .avatar[data-player-id]');
  const parties = () => page.locator('.rh .party').allInnerTexts();
  await dragBy(page, avatars.first(), page.locator('.rh .mapbox .cell[aria-label="Overworld · Start"]'));
  assert((await where()).includes('Start') && (await parties()).length === 2, 'an avatar dropped on a screen of the minimap goes there, a party of their own');
  // Its party's menu renames it; Player 2's card on the stats strip dropped on it joins it.
  await page.locator('.rh .party.on').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '✎ Rename…' }).click();
  await page.getByRole('textbox', { name: 'Party name' }).fill('Heroes');
  await page.keyboard.press('Enter');
  await dragBy(page, page.locator('.rpg .strip .card').nth(1), page.locator('.rh .party', { hasText: 'Heroes' }));
  assert((await parties()).join() === 'Heroes (2)', `a party can be renamed, and a player's card dropped on it joins it (${await parties()})`);
  // The player menu, on their card on the stats strip: hide their avatar, then bring it back.
  await page.locator('.rpg .strip .card').first().click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🫥 Hide their avatar' }).click();
  assert((await avatars.count()) === 1, 'the stats strip gives the player’s menu: hide their avatar');
  await page.locator('.rpg .strip .card').first().click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🫥 Show their avatar' }).click();
  assert((await avatars.count()) === 2, '…and show it again');
  // An item dragged onto another player's card goes to them (scrolled into view: the host column scrolls).
  await secondCard.scrollIntoViewIfNeeded();
  await dragBy(page, firstCard.locator('.it .nm', { hasText: 'Rubber duck' }), secondCard);
  assert((await secondCard.locator('.it .nm').allInnerTexts()).join().includes('Rubber duck'), 'an item dragged onto another player’s card goes to them');
  // Delete takes off the object whose card is open (Ctrl+Z brings it back); the host panel's list has their menu too.
  await page.locator('.rh .objs').getByRole('button', { name: /Lava/ }).click();
  await page.getByRole('dialog', { name: 'Object: Lava' }).waitFor();
  await page.keyboard.press('Delete');
  assert(
    !(await page.getByRole('dialog', { name: 'Object: Lava' }).count()) && (await page.locator('.toast').innerText()) === 'Removed Lava · Ctrl+Z brings it back',
    'Delete takes the object whose card is open off the screen',
  );
  await page.keyboard.press('Control+z');
  await page.locator('.rh .objs').getByRole('button', { name: /Lava/ }).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: '🗂 Open its card' }).click();
  await page.getByRole('dialog', { name: 'Object: Lava' }).waitFor();
  assert(true, 'Ctrl+Z brings it back, and its right-click menu in the list opens its card');
  await page.keyboard.press('Escape');
  // Dragged off the east edge, an avatar walks through to the screen that way; a double-click on the minimap moves the party.
  const stageNow = await page.locator('.rpg').boundingBox();
  await dragBy(page, avatars.first(), { x: stageNow.x + stageNow.width + 40, y: stageNow.y + stageNow.height / 2 });
  assert((await where()).includes('Screen B1'), 'an avatar dragged off the east edge walks through to the screen there');
  // Picking a screen on the minimap leaves the map as it was, so both clicks of a double-click land on the same screen.
  const startCell = page.locator('.rh .mapbox .cell[aria-label="Overworld · Start"]');
  const cellBefore = JSON.stringify(await startCell.boundingBox());
  await startCell.click();
  assert(JSON.stringify(await startCell.boundingBox()) === cellBefore, 'picking a screen on the minimap leaves the map where it was');
  await page.waitForTimeout(450);
  await startCell.dblclick();
  await page.waitForTimeout(250);
  assert((await where()).includes('Start'), 'a double-click on the minimap moves the party there');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-direct.png` });
  assert(!dialogs.length, 'no browser dialog showed during the game' + (dialogs.length ? `: ${dialogs.join('; ')}` : ''));

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg.png` });
  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));

  await bigWorld();
  console.log('rpg: all passed');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
