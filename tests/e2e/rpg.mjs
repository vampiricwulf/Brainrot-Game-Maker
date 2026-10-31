// RPG rounds: build a tiny world (two screens, an item, stats), then play it: move with the pad and the keys, pick
// the item up, change a stat, undo and redo, show the map, and check viewers never see secret objects. The editor
// shows a screen with its background reset in the color viewers see. A box drawn on the stage selects players and
// the things that move in play, in two windows, one, and on a touch screen.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerAsk, dragBy, editorReady, exportHtml, flowIs, menuLines, openGameFile, openMenu, playWithPlayers, stepButton, leaveAnswer } from './helpers.mjs';

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
    shape('el_gold', 'Gold pile', 900, 300, { class: 'currency', field: 'f_gold', amount: 12 }),
    shape('el_trap', 'Trap', 1400, 300, { class: 'hazard', actions: [{ id: 'a_trap', do: 'stat', field: 'f_hp', op: 'add', amount: -3, who: 'party' }] }),
    shape('el_heap', 'Coin heap', 200, 650, { class: 'currency', field: 'f_gold', amount: 10 }),
    shape('el_cat', 'Riddle cat', 1550, 650, {
      class: 'npc',
      actions: [{ id: 'a_ask', do: 'question', value: 100, question: { background: { color: '#123' }, elements: [text('t_q', 'What has keys but no locks?', 700, 400)] }, answer: { background: { color: '#123' }, elements: [text('t_a', 'A piano', 700, 400)] } }],
    }),
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
      { id: 'f_gold', name: 'Gold', type: 'number', start: 5, min: 0, max: 15, currency: true, symbol: '🪙', audience: 'hud', display: 'counter' },
      { id: 'f_gems', name: 'Gems', type: 'number', start: 0, min: 0, currency: true, symbol: '💎', audience: 'hidden', display: 'counter' },
    ],
    items: [{ id: 'i_helmet', name: 'Helmet', stackable: false, wearable: { slot: 'head' } }],
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
  // Exported, ✎ Edit screen says its changes last for this game only (the file has no 💾 Keep in game).
  const fileHtml = await exportHtml(host);
  const fileCopy = resolve('test-results/rpg-big-world.html');
  await fileHtml.saveAs(fileCopy);
  const filePage = await ctx.newPage();
  filePage.on('pageerror', (e) => errors.push(`[big world file] ${e.message}`));
  await filePage.goto(pathToFileURL(fileCopy).href);
  await filePage.getByRole('button', { name: '▶ Play' }).click({ timeout: 20000 });
  await filePage.getByRole('button', { name: 'Start game ▶' }).click();
  await filePage.getByRole('button', { name: '✎ Edit screen' }).click();
  const fileEditor = await filePage.getByRole('dialog', { name: / live$/ }).locator('.row').first().innerText();
  assert(fileEditor.includes('They last for this game only.') && !fileEditor.includes('Keep in game'), `in an exported file, ✎ Edit screen says the changes last for this game only (${fileEditor.replace(/\s+/g, ' ')})`);
  await filePage.close();
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
  // The RPG box, the pad first: the selection line, the pad and the minimap (with the object's card), then ✎ Improvise
  // (open until the host folds it, so its ✎ Edit screen is in sight), then the players.
  const rhParts = await host
    .locator('.rh')
    .evaluate((r) => [...r.children].flatMap((c) => ('rpgSel' in c.dataset ? ['sel'] : c.classList.contains('main') ? ['pad'] : 'improvise' in c.dataset ? ['improvise'] : c.classList.contains('who') ? ['players'] : [])));
  const improv = host.locator('.rh [data-improvise]');
  const improvToggle = improv.getByRole('button', { name: /✎ Improvise/ });
  assert(rhParts.join() === 'sel,pad,improvise,players' && (await improvToggle.getAttribute('aria-expanded')) === 'true', `the RPG box: the pad first, then ✎ Improvise, open (${rhParts.join()})`);
  // Folded, one line (its ✎ Edit screen gone); a click opens it again, in the same place.
  const toggleAt = await improvToggle.boundingBox();
  await improvToggle.click();
  assert(
    !(await host.getByRole('button', { name: '✎ Edit screen' }).count()) && (await improvToggle.innerText()).startsWith('▸ ✎ Improvise') && (await improvToggle.boundingBox()).x === toggleAt.x,
    '▾ ✎ Improvise folds the improvising tools into one line, its button where it was',
  );
  await improvToggle.click();
  // ✎ Edit screen with the four standing here: a character added starts clear of them (avatars are drawn over objects).
  await host.getByRole('button', { name: '✎ Edit screen' }).click();
  const liveEd = host.getByRole('dialog', { name: / live$/ });
  await liveEd.getByRole('button', { name: '🧙 Character' }).click();
  await liveEd.getByRole('button', { name: 'Done' }).click();
  await liveEd.waitFor({ state: 'detached' });
  const wizard = aud.locator('.rpg .el', { hasText: '🧙' });
  await wizard.waitFor();
  const onSomeone = await aud.locator('.rpg .avatar[data-player-id]').evaluateAll(
    (els, w) => els.some((e) => (({ left, right, top, bottom }) => left < w.x + w.width && w.x < right && top < w.y + w.height && w.y < bottom)(e.getBoundingClientRect())),
    await wizard.boundingBox(),
  );
  assert(!onSomeone, 'a character added in ✎ Edit screen starts clear of the players standing there');
  await host.keyboard.press('Control+z');
  await wizard.waitFor({ state: 'detached' });
  // The ? list says so, among the RPG keys.
  await host.keyboard.press('?');
  const keyList = host.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await keyList.waitFor();
  const rpgKeys = await keyList.locator('section').filter({ has: host.getByRole('heading', { name: 'RPG', exact: true }) }).innerText();
  assert(rpgKeys.includes('← ↑ → ↓'), 'the ? list has the arrow keys among the RPG keys');
  assert(rpgKeys.includes('Drag on an empty spot') && rpgKeys.includes('Alt+drag') && rpgKeys.includes('▭ Select in a box instead'), 'and the box: drag on an empty spot, Alt+drag, and the stage menu’s way for Linux desktops');
  const firstGroup = await keyList.locator('h3').first().innerText();
  assert(firstGroup === 'RPG', `in an RPG round the ? list starts with the RPG keys (${firstGroup})`);
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
  assert((await pick.innerText()) === '✋ Ann picks up 🪙10 of 🪙12', `the pick-up button names the one who picks it up, and what fits under her max (${await pick.innerText()})`);
  await pick.click();
  await host.waitForTimeout(300);
  assert((await host.locator('.rpg .strip .card').first().innerText()).includes('🪙15') && (await cues(aud)).includes('pickUp'), 'Ann gets it, with the Pick up sound');
  // Ann is at her most (🪙15) now: with nobody picked, the next pile goes to the first one here with room. Picking her
  // anyway says she can't carry more, and the card stays open to pick someone else.
  await host.keyboard.press('Escape');
  await host.locator('.rh .objs button', { hasText: 'Coin heap' }).click();
  const heap = host.getByRole('dialog', { name: 'Object: Coin heap' });
  const heapPick = heap.getByRole('button', { name: /picks up/ });
  assert((await heapPick.innerText()) === '✋ Bob picks up 🪙10', `with nobody picked, a pile goes to the first one here with room (${await heapPick.innerText()})`);
  await heap.locator('.who').getByRole('button', { name: 'Ann' }).click();
  await heapPick.click();
  await host.locator('.toast', { hasText: 'Ann can’t carry any more Gold' }).waitFor();
  assert(await heap.isVisible(), 'picking up with a full purse says so and keeps the card open');
  await host.keyboard.press('Escape');
  await heap.waitFor({ state: 'detached' });

  // Its menu (a right-click in the list, or on the stage) starts with its card's buttons, in the card's words: then 🗂 Open
  // its card, ✎ Edit, Hide or Reveal, and 🗑 Remove last (with no key: Delete takes off only the object whose card is open).
  await host.locator('.rh .objs button', { hasText: 'Riddle cat' }).click({ button: 'right' });
  const catMenu = await menuLines(host);
  assert(
    catMenu[0] === '# Riddle cat' && catMenu[1] === 'Ask the question' && catMenu.includes('🗂 Open its card') && catMenu.includes('✎ Edit') && catMenu.at(-1) === '🗑 Remove',
    `an object's menu starts with its card's buttons (${catMenu.join(' | ')})`,
  );
  await host.keyboard.press('Escape');
  await openMenu(host).waitFor({ state: 'detached' });
  // A question pop-up (the Riddle cat's): the host sees its answer before it's revealed, viewers don't.
  await host.locator('.rh .objs button', { hasText: 'Riddle cat' }).click();
  // With its card open, its menu's 🗑 Remove shows the Delete key (the key takes off the object whose card is open).
  await host.locator('.rh .objs button', { hasText: 'Riddle cat' }).click({ button: 'right' });
  const catOpenMenu = await menuLines(host);
  await host.keyboard.press('Escape');
  await openMenu(host).waitFor({ state: 'detached' });
  assert(catOpenMenu.at(-1) === '🗑 Remove · Delete', `with its card open, 🗑 Remove shows Delete (${catOpenMenu.at(-1)})`);
  await host.getByRole('dialog', { name: 'Object: Riddle cat' }).getByRole('button', { name: 'Ask the question' }).click();
  await aud.waitForFunction(() => document.body.innerText.includes('What has keys but no locks?'));
  const hostInfo = host.locator('.stage-area > .info');
  await hostInfo.locator('.a', { hasText: 'A piano' }).waitFor();
  assert(/answer \(hidden from viewers\)/i.test(await hostInfo.innerText()) && !(await aud.locator('body').innerText()).includes('A piano'), 'a question pop-up shows the host its answer before it’s revealed, and not viewers');
  // Its blue button is 👁 Reveal answer (no copy in its box), and its box keeps ✕ Close to put it away unseen. The box is
  // beside the pad, right over the card of the object it came from.
  const popBox = host.locator('.panel [data-tool-controls]');
  assert((await host.locator('.rh .side > [data-tool-controls] + div [role="dialog"][aria-label="Object: Riddle cat"]').count()) === 1, 'the pop-up’s box is beside the pad, over the Riddle cat’s card');
  assert(
    (await flowIs(host, '👁 Reveal answer')) && (await popBox.getByRole('button', { name: '✕ Close', exact: true }).count()) === 1 && (await popBox.getByRole('button', { name: '👁 Reveal answer' }).count()) === 0,
    'a question pop-up: the blue button is 👁 Reveal answer, and its box has ✕ Close but no copy of the reveal',
  );
  await host.keyboard.press('r');
  await aud.waitForFunction(() => document.body.innerText.includes('A piano'));
  assert(/answer \(on screen\)/i.test(await hostInfo.innerText()), 'revealed, the host’s column says the answer is on screen');
  await host.waitForFunction(() => document.querySelector('.panel [data-next]')?.textContent?.trim().startsWith('Next ▶'));
  assert((await popBox.getByRole('button', { name: '✕ Close', exact: true }).count()) === 0, 'its answer up: the blue button is Next ▶, and the box has no ✕ Close any more');
  await host.keyboard.press('Escape');
  await host.keyboard.press('Escape');
  await host.getByRole('dialog', { name: 'Object: Riddle cat' }).waitFor({ state: 'detached' });

  // Two Helmets (not stackable: a row each), both worn: one helmet on Ann's avatar, and the panel keeps up. (The
  // players' cards are folded away in a short window: open them for this, then fold them again.)
  const cardsToggle = host.getByRole('button', { name: /Players: stats & inventory/ });
  await cardsToggle.click();
  const annCard = host.locator('.rh .pc').first();
  // With two currencies, the card's list shows the one its buttons convert (not a blank).
  const convertsTo = await annCard.getByLabel('Currency').evaluate((s) => s.options[s.selectedIndex]?.text ?? '');
  assert(convertsTo === 'Gold' && (await annCard.getByRole('button', { name: 'Score → Gold' }).count()) === 1, `with two currencies the card's list shows the one its buttons use (${convertsTo})`);
  for (let i = 0; i < 2; i++) await annCard.getByLabel('Give Ann an item').selectOption({ label: 'Helmet' });
  for (let i = 1; i <= 2; i++) {
    await annCard.getByRole('button', { name: 'Equip', exact: true }).first().click();
    await annCard.getByRole('button', { name: 'Unequip', exact: true }).nth(i - 1).waitFor();
  }
  await aud.locator('.avatar[data-player-id="p1"] .gear').first().waitFor();
  assert((await aud.locator('.avatar[data-player-id="p1"] .gear').count()) === 1 && !errors.length, 'two Helmets worn show one helmet on the avatar, with no page error');
  await cardsToggle.click();
  await annCard.waitFor({ state: 'detached' });

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
      // (The selection line too, above them.)
      const sel = document.querySelector('.rh [data-rpg-sel]').getBoundingClientRect();
      return r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && m.top >= v.top - 1 && sel.top >= v.top - 1 && sel.bottom <= r.top + 1;
    });
  assert(await padSeen(), 'an object’s card opens with the pad and the minimap in sight');
  await host.getByRole('dialog', { name: 'Object: Trap' }).getByRole('button', { name: '🗑 Remove' }).scrollIntoViewIfNeeded();
  assert(await padSeen(), 'scrolled to the card’s foot, the pad and the minimap stay pinned in sight, the selection line above them');
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
  await host.waitForFunction(() => (document.getElementById('live-region')?.dataset.said ?? '').includes('Party went through Dungeon door to Dungeon 1'));
  assert(true, 'and screen readers hear where it led');
  await host.getByRole('button', { name: '🗺 Map on stream' }).click();
  await aud.locator('.map-ov').waitFor();
  assert((await aud.locator('.map-ov').innerText()).includes('This map is hidden from viewers') && !(await aud.locator('.map-ov .cell').count()), 'on a hidden map, the viewers’ map says it’s hidden');
  if (process.env.SHOTS) await aud.screenshot({ path: `${process.env.SHOTS}/rpg-big-hidden.png` });
  await ctx.close();
}

/**
 * A box drawn on the stage (a world from a file: Ann and Bob on a 🔒 locked rug on the Lava, the Sword, a door and the
 * arrival point beside them, a pile of gold, a secret Chest, and a screen-sized picture on the Meadow next door): two
 * windows, then one, then a touch screen.
 */
async function boxSelect() {
  console.log('A box on the RPG stage:');
  const shape = (id, name, x, y, w, h, role, more = {}) => ({
    id, name, kind: 'shape', shape: 'rect', x, y, w, h, rotation: 0, opacity: 1, zIndex: 1, fill: '#887755', stroke: '#000', strokeWidth: 0, radius: 0, ...(role ? { role } : {}), ...more,
  });
  const start = {
    id: 's_start', name: 'Start', col: 0, row: 0,
    slide: {
      background: { color: '#2f6b3a' },
      elements: [
        shape('el_lava', 'Lava', 60, 520, 1100, 500, { class: 'hazard' }),
        shape('el_rug', 'Rug', 560, 620, 400, 200, null, { locked: true }),
        shape('el_sword', 'Sword', 900, 300, 140, 140, { class: 'item', item: 'i_sword', qty: 1 }),
        shape('el_door', 'Door', 1200, 600, 160, 260, { class: 'doorway', to: { map: 'm1', screen: 's_meadow' } }),
        shape('el_spawn', 'Arrival point', 700, 560, 120, 120, { class: 'spawn' }),
        shape('el_gold', 'Gold pile', 1500, 250, 140, 140, { class: 'currency', field: 'f_gold', amount: 5 }),
        shape('el_chest', 'Chest', 1600, 700, 140, 100, { class: 'item', item: 'i_sword', qty: 1 }, { secret: true }),
        // (Out of every box drawn: its button reveals the secret Chest.)
        shape('el_lever', 'Lever', 1780, 0, 100, 80, { class: 'interactable', actions: [{ id: 'a_peek', do: 'reveal', object: 'el_chest' }] }),
      ],
    },
  };
  const meadow = { id: 's_meadow', name: 'Meadow', col: 1, row: 0, slide: { background: { color: '#3a6b2f' }, elements: [shape('el_bg', 'Meadow picture', 0, 0, 1920, 1080, null)] } };
  const game = {
    id: 'g_box_select', version: 2, title: 'Box select',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: true, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'click' }, maxPlayers: 8 },
    players: ['Ann', 'Bob'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b'][i] })),
    rounds: [{ id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' }],
    media: [], audio: {}, wheels: [], dice: [], theme: {},
    statFields: [{ id: 'f_gold', name: 'Gold', type: 'number', start: 0, min: 0, currency: true, symbol: '🪙', audience: 'hud', display: 'counter' }],
    items: [{ id: 'i_sword', name: 'Sword', stackable: false }],
    worlds: [{ id: 'w1', name: 'World', maps: [{ id: 'm1', name: 'Overworld', cols: 2, rows: 1, screens: [start, meadow], visibility: 'discovered', showExits: true, revealNeighbors: true, diagonals: false, wrap: false, transition: 'cut' }] }],
  };
  mkdirSync(resolve('test-results'), { recursive: true });
  const gameFile = resolve('test-results/rpg-box-select.json');
  writeFileSync(gameFile, JSON.stringify(game));

  /** A game screen on the round, from the file (`aud`: with the audience window open). */
  async function playIt(ctx, two) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`[box select] ${e.message}`));
    await p.goto(pathToFileURL(file).href);
    await openGameFile(p, gameFile);
    await p.getByText(/^Opened “/).waitFor();
    await editorReady(p);
    await p.getByRole('button', { name: '▶ Play' }).click();
    await p.getByRole('button', { name: 'Start game ▶' }).waitFor();
    let aud = null;
    if (two) {
      [aud] = await Promise.all([p.waitForEvent('popup'), p.locator('.mode', { hasText: 'Separate audience window' }).click()]);
      await aud.waitForLoadState('domcontentloaded');
    }
    await p.getByRole('button', { name: 'Start game ▶' }).click();
    await p.locator('.stage-box .rpg .avatar[data-player-id="p2"]').waitFor();
    return { p, aud };
  }
  /** A point of the screen on the stage (1920×1080) in the window. */
  const at = async (p, x, y) => {
    const r = await p.locator('.stage-box .rpg .pane').first().boundingBox();
    return { x: r.x + (x * r.width) / 1920, y: r.y + (y * r.height) / 1080 };
  };
  /** Press at one point of the screen, move to another, and (unless `hold`) let go. */
  async function box(p, a, b, { hold = false } = {}) {
    const [from, to] = [await at(p, ...a), await at(p, ...b)];
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    await p.mouse.move(to.x, to.y, { steps: 8 });
    if (!hold) await p.mouse.up();
  }
  const line = (p) => p.locator('.rh [data-rpg-sel]');
  const says = (p, words) => line(p).filter({ hasText: words }).waitFor();
  const again = (p) => line(p).getByRole('button', { name: '↩ Select them again' });
  const av = (p, id) => p.locator(`.stage-box .rpg .avatar[data-player-id="${id}"]`);
  const hitBox = (p, id) => p.locator(`.stage-box .rpg .hit[data-object="${id}"]`).boundingBox();
  const undoSays = (p) => p.locator('.panel .fixed').getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  /** Ann (p1) and Bob (p2) stand on the rug, side by side, done gliding there. */
  const RUG = [['p1', 680], ['p2', 840]];
  async function settled(p) {
    for (const [id, x] of RUG) {
      const to = await at(p, x, 720);
      // (There, and done gliding: a position measured mid-glide would differ from the same one a moment later.)
      await p.waitForFunction(([sel, tx, ty]) => {
        const el = document.querySelector(sel);
        const r = el?.getBoundingClientRect();
        return !!r && Math.abs(r.x + r.width / 2 - tx) < 3 && Math.abs(r.y + r.height / 2 - ty) < 3 && !el.getAnimations().length;
      }, [`.stage-box .rpg .avatar[data-player-id="${id}"]`, to.x, to.y]);
    }
  }
  /** Ann and Bob dragged onto the rug (where they arrive depends on the room there), nothing selected after. */
  async function standOnRug(p) {
    for (const [id, x] of RUG) await dragBy(p, av(p, id), await at(p, x, 720));
    await settled(p);
    await p.keyboard.press('Escape');
    await again(p).waitFor();
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    // ---- Two windows ----
    const { p: host, aud } = await playIt(ctx, true);
    await standOnRug(host);
    assert((await host.locator('.stage-box .rpg .hit[data-object="el_spawn"]').count()) === 1, 'two windows: the host’s copy draws the arrival point (viewers never see it)');
    await box(host, [560, 280], [1420, 900], { hold: true });
    // Live: the rings light up as it's drawn, on the host's copy only.
    await host.locator('.stage-box .rpg .hit.picked[data-object="el_sword"]').waitFor();
    const mid = { band: await host.locator('.stage-box .rpg .band.mirror').count(), rings: await host.locator('.stage-box .rpg .avatar.picked').count(), viewers: await aud.locator('.band, .picked, .outlined').count() };
    await host.mouse.up();
    await says(host, 'Selected: Ann, Bob · Sword —');
    const ringed = await host.locator('.stage-box .rpg .hit.picked').evaluateAll((l) => l.map((e) => e.dataset.object));
    assert(
      mid.band === 1 && mid.rings === 2 && !mid.viewers && ringed.join() === 'el_sword',
      `two windows: a box picks Ann, Bob and the Sword, not the Lava under them, the door beside them or the arrival point; a yellow box and live rings on the host’s copy, nothing for viewers (${JSON.stringify(mid)}, ${ringed})`,
    );
    // Shift+drag from an empty spot adds (the Gold pile); Shift+click adds what a box never catches (the door).
    await host.keyboard.down('Shift');
    await box(host, [1450, 200], [1700, 450]);
    await host.locator('.stage-box .rpg .hit[data-object="el_door"]').click();
    await host.keyboard.up('Shift');
    await says(host, 'Selected: Ann, Bob · Sword, Gold pile, Door —');
    assert(true, 'Shift+drag from an empty spot adds to what’s selected, and Shift+click adds the door a box leaves out');
    // A click on an empty spot clears it all; ↩ Select them again brings it back.
    const empty = await at(host, 1750, 120);
    await host.mouse.click(empty.x, empty.y);
    await again(host).waitFor();
    assert(!(await line(host).innerText()).includes('Selected:'), 'a click on an empty spot clears the selection');
    await again(host).click();
    await says(host, 'Selected: Ann, Bob · Sword, Gold pile, Door —');
    assert(true, '↩ Select them again brings it all back');
    // Esc while drawing: the box replaced the selection as it went; the selection is as it was.
    await box(host, [1450, 150], [1800, 450], { hold: true });
    // (Only the Gold pile: the line's text starts after the space Svelte leaves before its words.)
    await line(host).filter({ hasText: /^\s*Selected: Gold pile —/ }).waitFor();
    await host.keyboard.press('Escape');
    await host.mouse.up();
    await says(host, 'Selected: Ann, Bob · Sword, Gold pile, Door —');
    assert((await host.locator('.stage-box .rpg .band').count()) === 0, 'Esc while drawing a box puts back what was selected (the box had replaced it live)');

    // ---- One window ----
    await aud.close();
    await host.locator('.play:not(.dual)').waitFor();
    await host.keyboard.press('Escape');
    await again(host).waitFor();
    await box(host, [560, 280], [1420, 900], { hold: true });
    await host.locator('.stage-box .rpg .hit.outlined[data-object="el_sword"]').waitFor();
    const held = { band: await host.locator('.stage-box .rpg .band:not(.mirror)').count(), outlined: await host.locator('.stage-box .rpg .outlined').count(), rings: await host.locator('.stage-box .rpg .picked').count() };
    // (From the moment it's let go: how long the outlines stay.)
    await host.evaluate(() => {
      const t0 = performance.now();
      window.__outlinesGone = new Promise((done) => {
        const tick = () => (document.querySelector('.stage-box .rpg .outlined') ? requestAnimationFrame(tick) : done(performance.now() - t0));
        requestAnimationFrame(tick);
      });
    });
    await host.mouse.up();
    await says(host, 'Selected: Ann, Bob · Sword —');
    const stayed = await host.evaluate(() => window.__outlinesGone);
    assert(
      held.band === 1 && held.outlined === 3 && !held.rings && stayed >= 1200,
      `one window: the same box picks Ann, Bob and the Sword; a thin dashed box and outlines while held, kept ${Math.round(stayed)} ms after (about 1.5 s), then nothing (${JSON.stringify(held)})`,
    );
    // A press on the 🔒 locked rug under them draws a box (the rug doesn't move, no card opens).
    const rug = await hitBox(host, 'el_rug');
    await box(host, [570, 800], [900, 640]);
    await says(host, 'Selected: Ann, Bob —');
    assert(JSON.stringify(await hitBox(host, 'el_rug')) === JSON.stringify(rug) && !(await host.getByRole('dialog', { name: 'Object: Rug' }).count()), 'a press on the 🔒 locked rug under the players draws a box: Ann and Bob, the rug left where it is');
    // A box over the secret Chest catches nothing (it isn't on the stage), and Objects here numbers it.
    await box(host, [1550, 650], [1800, 850]);
    await again(host).waitFor();
    const objs = await host.locator('.rh .objs').innerText();
    assert(!(await line(host).innerText()).includes('Selected:') && !objs.includes('Chest') && objs.includes('🙈 Hidden object 1'), `one window: a box over the secret Chest catches nothing, and Objects here doesn’t name it (${objs.replace(/\s+/g, ' ')})`);
    // Its menu there offers no ✎ Edit (the live editor would list the Chest by name, on stream), as its card keeps it behind 👁 Show.
    await host.locator('.rh .objs').getByRole('button', { name: '🙈 Hidden object 1', exact: true }).click({ button: 'right' });
    const hiddenMenu = (await host.getByRole('menu').getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]);
    await host.keyboard.press('Escape');
    assert(hiddenMenu.includes('🗂 Open its card') && !hiddenMenu.includes('✎ Edit'), `one window: the secret object's menu has no ✎ Edit (${hiddenMenu.join(' | ')})`);
    // A visible Lever whose button reveals it: its menu calls it what Objects here does, never the Chest.
    await host.locator('.rh .objs').getByRole('button', { name: /^Lever/ }).click({ button: 'right' });
    const leverMenu = await host.getByRole('menu').innerText();
    await host.keyboard.press('Escape');
    assert(leverMenu.includes('Reveal 🙈 Hidden object 1 (Start)') && !leverMenu.includes('Chest'), `one window: the Lever's Reveal names no secret object (${leverMenu.replace(/\s+/g, ' ')})`);
    // Pressing one of a selected group outlines it all before it moves; one Ctrl+Z puts the whole move back.
    await again(host).click();
    await says(host, 'Selected: Ann, Bob —');
    await host.locator('.stage-box .rpg .hit[data-object="el_sword"]').click({ modifiers: ['Shift'] });
    await says(host, 'Selected: Ann, Bob · Sword —');
    const sword = await hitBox(host, 'el_sword');
    const ann = await av(host, 'p1').boundingBox();
    await host.mouse.move(ann.x + ann.width / 2, ann.y + ann.height / 2);
    await host.mouse.down();
    await host.locator('.stage-box .rpg .outlined').nth(2).waitFor();
    const pressed = await host.locator('.stage-box .rpg .outlined').count();
    await host.mouse.move(ann.x + ann.width / 2 + 60, ann.y + ann.height / 2 - 40, { steps: 6 });
    await host.mouse.up();
    await host.waitForFunction(() => document.querySelector('.panel .fixed button[title^="Undo: Move Ann, Bob & Sword"]'));
    assert(pressed === 3 && JSON.stringify(await hitBox(host, 'el_sword')) !== JSON.stringify(sword), `one window: pressing Ann outlines the whole group (${pressed}), and they move together`);
    await host.keyboard.press('Control+z');
    await host.waitForFunction(([sx, sy]) => {
      const r = document.querySelector('.stage-box .rpg .hit[data-object="el_sword"]')?.getBoundingClientRect();
      return !!r && Math.abs(r.x - sx) < 2 && Math.abs(r.y - sy) < 2;
    }, [sword.x, sword.y]);
    await settled(host);
    assert(true, 'one Ctrl+Z puts the group move back');
    // Alt+drag from a player draws a box (Bob stays put), and Alt's keyup stays in the page (Firefox's menu bar).
    await host.keyboard.press('Escape');
    await host.evaluate(() => addEventListener('keyup', (e) => e.key === 'Alt' && (window.__altKept = e.defaultPrevented)));
    const bob = await av(host, 'p2').boundingBox();
    await host.keyboard.down('Alt');
    await box(host, [875, 680], [600, 780]);
    await host.keyboard.up('Alt');
    await says(host, 'Selected: Ann, Bob —');
    assert(JSON.stringify(await av(host, 'p2').boundingBox()) === JSON.stringify(bob) && (await host.evaluate(() => window.__altKept)) === true, 'Alt+drag from a player draws a box (Bob isn’t dragged), and Alt’s keyup stays in the page');
    // The stage menu's ▭ Select in a box: the next drag draws one even from a player, with no key held.
    await host.keyboard.press('Escape');
    const menuAt = await at(host, 1750, 120);
    await host.mouse.click(menuAt.x, menuAt.y, { button: 'right' });
    const items = await menuLines(host);
    assert(items.includes('▭ Select in a box · Alt+drag') && items.includes('Select everything here'), `the stage’s menu has ▭ Select in a box and Select everything here (${items.join(' | ')})`);
    await openMenu(host).getByRole('menuitem', { name: '▭ Select in a box' }).click();
    const annNow = await av(host, 'p1').boundingBox();
    await box(host, [650, 680], [900, 780]);
    await says(host, 'Selected: Ann, Bob —');
    assert(JSON.stringify(await av(host, 'p1').boundingBox()) === JSON.stringify(annNow), '▭ Select in a box: the next drag from Ann draws a box instead of moving her');
    // A big object dragged alone says, once a game, how to lock it or box over it.
    await host.keyboard.press('Escape');
    await box(host, [200, 900], [260, 900]);
    await host.locator('.toast', { hasText: 'Moved Lava · 🔒 Lock it in the editor, or Alt+drag to draw a box over it' }).waitFor();
    await host.keyboard.press('Control+z');
    await host.locator('.toast', { hasText: 'Undid Move Lava' }).waitFor();
    await box(host, [200, 900], [260, 900]);
    await host.waitForFunction(() => document.querySelector('.panel .fixed button[title^="Undo: Move Lava"]'));
    assert(!(await host.locator('.toast', { hasText: 'Lock it' }).count()), 'the big-object hint shows the first time only');
    await host.keyboard.press('Control+z');
    // On the Meadow, a drag on its screen-sized picture draws a box, moves nothing and leaves no step.
    await host.getByRole('button', { name: 'Go East', exact: true }).click();
    await host.locator('.rh .where', { hasText: 'Meadow' }).waitFor();
    const step = await undoSays(host);
    const pic = await hitBox(host, 'el_bg');
    await box(host, [1200, 300], [1600, 600], { hold: true });
    const drawn = await host.locator('.stage-box .rpg .band').count();
    await host.mouse.up();
    assert(
      drawn === 1 && (await undoSays(host)) === step && JSON.stringify(await hitBox(host, 'el_bg')) === JSON.stringify(pic) && !(await host.getByRole('dialog', { name: 'Object: Meadow picture' }).count()),
      `a drag on a picture as big as its screen draws a box and records no step (${step})`,
    );
    // Kept to resume: an RPG game's progress is its steps (the party went east; no points, tiles or rolls), and Start
    // game ▶ asks before throwing it away.
    await host.getByRole('button', { name: /Exit/ }).first().click();
    await host.waitForTimeout(450);
    await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
    await host.getByRole('button', { name: '▶ Play' }).click();
    // (One window this time: the audience window was picked for the last game.)
    await host.locator('.mode', { hasText: 'Single window' }).click();
    await host.getByRole('button', { name: 'Start game ▶' }).click();
    const keptAsk = host.locator('.actions [data-start-ask]');
    await keptAsk.waitFor();
    assert((await keptAsk.innerText()).includes('Start a new game? The game in progress (Adventure) is discarded.'), `Start asks before throwing away an RPG game kept with its party moved (${await keptAsk.innerText()})`);
    await host.close();
  } finally {
    await ctx.close();
  }

  // ---- A touch screen: a box adds to what's selected; a tap on an empty spot clears it ----
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  try {
    const { p: tp } = await playIt(tctx, false);
    const cdp = await tctx.newCDPSession(tp);
    const touch = async (pts) => {
      const [a, ...rest] = await Promise.all(pts.map(([x, y]) => at(tp, x, y)));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
      for (const b of rest) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [b] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await tp.keyboard.press('1');
    await says(tp, 'Selected: Ann —');
    // (From well clear of the Sword: a finger pressed just beside a thing is taken as on it, as the browser adjusts a touch.)
    await touch([[800, 220], [880, 300], [960, 380], [1060, 460]]);
    await says(tp, 'Selected: Ann · Sword —');
    assert(true, 'a touch screen: a box adds to what’s selected (Ann, then the Sword)');
    await touch([[1750, 120]]);
    await again(tp).waitFor();
    assert(!(await line(tp).innerText()).includes('Selected:'), 'a tap on an empty spot clears the selection, with ↩ Select them again');
  } finally {
    await tctx.close();
  }
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // Stats & items: in the sidebar, muted "(optional)" until there's an RPG (or board game) round to use them.
  assert((await page.getByRole('button', { name: '📊 Stats & Items' }).innerText()).includes('(optional)'), 'a game of Jeopardy rounds lists 📊 Stats & Items as optional');
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
  {
    // Its menu, in the editors' one order: ✎ Edit, ✎ Rename, the moves, its column's and row's own groups, 🗑 Delete last.
    await page.getByRole('button', { name: 'Screen Screen B1' }).click({ button: 'right' });
    const menu = page.getByRole('menu');
    const items = (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0]);
    const heads = await menu.locator('.heading').allInnerTexts();
    const at = (x) => items.findIndex((t) => t.startsWith(x));
    const want = ['✎ Edit screen', '✎ Rename', '⧉ Duplicate', '📋 Copy screen', '◀ Move left', '＋ Insert left', '🗑 Delete column B', '＋ Insert above', '🗑 Delete row 1', '🗑 Delete screen'].map(at);
    assert(
      want.every((n, i) => n >= 0 && (i === 0 || n > want[i - 1])) && items.at(-1).startsWith('🗑 Delete screen') && heads.includes('Column B') && heads.includes('Row 1'),
      `a screen's menu: its column's and row's own groups, its own delete last (${items.join(' | ')})`,
    );
    await page.keyboard.press('Escape');
  }
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
  // An RPG screen's Shape ▾ has ⬚ Hotspot (a clue's doesn't), in a section of its own.
  await page.getByRole('button', { name: /◼ Shape/ }).click();
  assert((await page.locator('.shape-menu').getByRole('button', { name: '⬚ Hotspot' }).count()) === 1, 'an RPG screen’s Shape ▾ offers ⬚ Hotspot');
  await page.keyboard.press('Escape');
  // ↺ Reset background: the editor shows the screen's green, as viewers will see it, not the theme's tile color.
  await page.getByRole('button', { name: /Background ▾/ }).click();
  await page.getByRole('button', { name: '↺ Reset background' }).click();
  const bgs = await page.evaluate(() => [document.querySelector('.canvas .slide'), document.querySelector('.swatch')].map((e) => getComputedStyle(e).backgroundColor));
  assert(bgs.every((c) => c === 'rgb(47, 107, 58)'), `a screen with its background reset shows green in the editor, as on stage (${bgs.join(', ')})`);
  await page.getByRole('button', { name: /Background ▾/ }).click();
  assert((await page.getByRole('button', { name: '↺ Reset background' }).getAttribute('title')) === 'Back to the default background', "and its Reset doesn't say it's the theme's");
  await page.getByLabel('Slide background color').press('Escape');
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
  // The several-selected bar: ⧉ Duplicate, then Clear selection and 🗑 Delete 2 screens together at the right end,
  // 🗑 last, red and apart, never alone on a line under ⧉ Duplicate.
  {
    const dup = await page.locator('.side').getByRole('button', { name: '⧉ Duplicate' }).boundingBox();
    const del = page.locator('.side').getByRole('button', { name: '🗑 Delete 2 screens' });
    const box = await del.boundingBox();
    const [color, gap, last] = await del.evaluate((b) => [
      getComputedStyle(b).color,
      b.getBoundingClientRect().left - b.previousElementSibling.getBoundingClientRect().right,
      [...b.closest('.row:not(.end)').querySelectorAll('button')].at(-1) === b,
    ]);
    assert(color === 'rgb(255, 107, 107)' && gap >= 12 && last && box.x > dup.x + dup.width + 12, `several screens: 🗑 last in red, apart (${gap}px), not under ⧉ Duplicate (🗑 at ${Math.round(box.x)}, ⧉ ends at ${Math.round(dup.x + dup.width)})`);
  }
  await page.keyboard.press('Escape');
  // Ctrl+A on the map picks every screen (as in the slide and board editors), not the page's text.
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.keyboard.press('Control+a');
  const allScreens = await page.locator('.grid-map .cell.screen').count();
  await page.locator('.side h4', { hasText: `${allScreens} screens selected` }).waitFor();
  assert(allScreens > 1 && (await page.locator('.grid-map .cell.screen.sel').count()) === allScreens && (await page.evaluate(() => String(window.getSelection()))) === '', `Ctrl+A selects all ${allScreens} screens`);
  await page.keyboard.press('Escape');
  // A screen's Ways out is one line, folded (where each side leads); ▸ Change… opens a box for each side.
  await page.getByRole('button', { name: 'Screen Start' }).click();
  const ways = page.locator('.side [data-ways-out]');
  const waysText = (await ways.innerText()).replace(/\s+/g, ' ').trim();
  assert(waysText.startsWith('Ways out:') && waysText.includes('nothing there') && waysText.endsWith('▸ Change…') && (await page.getByLabel('East exit', { exact: true }).count()) === 0, `a screen's Ways out is one line, folded (${waysText})`);
  await ways.getByRole('button', { name: '▸ Change…' }).click();
  assert((await page.getByLabel('East exit', { exact: true }).count()) === 1, '▸ Change… opens a box for each side');
  await ways.getByRole('button', { name: '▾ Done' }).click();
  await page.keyboard.press('Escape');
  // Put a secret Potion on the start screen.
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  // A screen has no slide tabs: 📋 Copy slide's note says where it pastes (not “by the slide tabs”).
  await page.getByRole('button', { name: 'More for this slide' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: '📋 Copy slide' }).click();
  const slideCopied = (await page.locator('.toast', { hasText: 'Slide copied' }).last().innerText()).trim();
  assert(slideCopied === 'Slide copied: on another one, right-click an empty spot › 📋 Paste over this slide', `on a screen, 📋 Copy slide says where to paste it (${slideCopied})`);
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
  assert(!(await page.getByLabel('World', { exact: true }).isVisible()) && (await page.locator('summary', { hasText: '▸ Advanced: carry this adventure into another round' }).isVisible()), 'the world picker waits under ▸ Advanced');
  // A second adventure (the Mini quest template) has its own world: one line says so, and ▸ Advanced stays shut.
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Mini quest/ }).click();
  await page.locator('[data-world-own]').waitFor();
  assert(
    (await page.locator('[data-world-own]').innerText()) === 'Its own world (separate from Adventure).' && !(await page.locator('details.adv').evaluate((d) => d.open)) && !(await page.getByLabel('World', { exact: true }).isVisible()),
    'adding the Mini quest to a game with an adventure keeps ▸ Advanced shut: “Its own world (separate from Adventure)”',
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
  const yes = leaveAnswer(page);
  if (await yes.isVisible()) await yes.click();
  // The round opens on its title card. The pad and the minimap don't move the party under it (nobody would see it).
  await page.locator('.stage-box .title-card').waitFor();
  await page.getByRole('button', { name: 'Go East', exact: true }).click();
  await page.locator('.toast', { hasText: 'Start the round first' }).waitFor();
  await page.locator('.rh .mapbox .cell[aria-label="Overworld · Screen B1"]').dblclick();
  assert((await where()).includes('Start') && (await page.locator('.stage-box .title-card').count()) === 1, `under the title card the pad and a double-click on the minimap don’t move the party (${await where()})`);
  await page.getByRole('button', { name: 'Go East', exact: true }).click();
  await page.locator('.toast', { hasText: 'Start the round first' }).waitFor();
  // Clicking it goes on (and puts the pad's hint away).
  await page.locator('.stage-box .title-card').click();
  await page.locator('.rh').waitFor();
  assert((await page.locator('.toast', { hasText: 'Start the round first' }).count()) === 0, 'starting the round puts the pad’s “Start the round first” away');
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
  // The stage is a Tab stop: Shift+F10 there opens the round's own menu, or the selected player's.
  await page.locator('.stage-box .rpg[tabindex="0"]').focus();
  await page.keyboard.press('Shift+F10');
  const rpgMenu = await menuLines(page);
  assert(rpgMenu.includes('🗺 Full map (jump anywhere) · J') && rpgMenu.includes('🤝 Regroup · G'), `Shift+F10 on the stage: the round’s menu (${rpgMenu.join(' | ')})`);
  await page.keyboard.press('Escape');
  await openMenu(page).waitFor({ state: 'detached' });
  await page.keyboard.press('1');
  await page.keyboard.press('Shift+F10');
  assert((await menuLines(page))[0] === '# Player 1', 'with Player 1 selected, theirs');
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');

  // Viewers (single window) never get the secret Potion or the arrival point drawn, nor a click target for them.
  assert((await page.locator('.rpg .hit').count()) === 0, 'secret objects and arrival points get no click target on the viewers’ stage');
  assert(!(await page.locator('.rpg').innerText()).toLowerCase().includes('potion'), 'the secret Potion is not drawn for viewers');
  // The arrival point is never shown to viewers: its card says so, with no Reveal button that would do nothing.
  await page.locator('.rh .objs').getByRole('button', { name: /^Arrival point/ }).click();
  const arrival = page.getByRole('dialog', { name: 'Object: Arrival point' });
  await arrival.getByText('Never shown to viewers').waitFor();
  assert((await arrival.getByRole('button', { name: /Reveal to viewers/ }).count()) === 0, 'an arrival point’s card says it’s never shown to viewers, with no Reveal button');
  await page.keyboard.press('Escape');
  await arrival.waitFor({ state: 'detached' });

  // One window (viewers see the panel): the secret Potion and Gate aren't named in Objects here, only numbered; a card
  // keeps the name and buttons behind 👁 Show.
  const listed = await page.locator('.rh .objs').innerText();
  assert(
    !/Potion|Gate/.test(listed) && (await page.locator('.rh .objs').getByRole('button', { name: '🙈 Hidden object 2', exact: true }).count()) === 1,
    `one window: Objects here doesn’t name the secret Potion or Gate (${listed.replace(/\s+/g, ' ')})`,
  );
  await page.locator('.rh .objs').getByRole('button', { name: '🙈 Hidden object 2', exact: true }).click();
  const masked = page.getByRole('dialog', { name: 'Object: 🙈 Hidden object 2' });
  await masked.waitFor();
  assert(!(await masked.innerText()).includes('Gate') && !(await masked.innerText()).includes('Doorway'), 'its card doesn’t say what it is either');
  await masked.getByRole('button', { name: '👁 Show', exact: true }).click();
  // The locked gate asks first (in its card), and only goes through on the answer.
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
  // (One window: over the host panel beside the stage, never the stage: the host's map names screens not found yet.)
  const [fb, sb] = [await full.boundingBox(), await page.locator('.stage-box').boundingBox()];
  assert(fb.x >= sb.x + sb.width - 1, `one window: the full map opens over the host panel, not the stage (map at x ${Math.round(fb.x)}, the stage ends at ${Math.round(sb.x + sb.width)})`);
  const [tb, xb] = [await full.locator('.modal-title').boundingBox(), await full.getByRole('button', { name: 'Close' }).boundingBox()];
  assert(xb.y < tb.y + tb.height && xb.x + xb.width > fb.x + fb.width - 40, `its ✕ stays at the top right, on the title's line (✕ at ${Math.round(xb.x)},${Math.round(xb.y)}; title at y ${Math.round(tb.y)})`);
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
  // Over the panel under the stage (a 4:3 window): a picked screen's card sits beside the map, its Move in sight.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.keyboard.press('j');
  await full.waitFor();
  await full.getByRole('button', { name: 'Overworld · Screen B1' }).click();
  const moveHere = full.getByRole('button', { name: /^▶ Move Party here$/ });
  await moveHere.waitFor();
  const moveInSight = await moveHere.evaluate((b) => {
    const r = b.getBoundingClientRect();
    return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  assert(moveInSight, 'one window at 1024×768 (the map over the panel under the stage): a picked screen’s ▶ Move Party here is in sight');
  await page.keyboard.press('Escape');
  await full.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1500, height: 1000 });

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
  // (From the tools row: its box's Spin!; the blue button over it is Next ▶, which only puts it away.)
  assert(await flowIs(page, 'Next ▶'), 'a wheel from the tools row in an RPG round: the blue button is Next ▶');
  await stepButton(page.locator('.panel [data-tool-controls]'), '🎡 Spin!').click();
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
  // The step is named in words (Ctrl+Z says it), and Ctrl+Shift+Z makes it a zone again.
  await lava.locator('.cls', { hasText: 'Zone' }).waitFor();
  await page.keyboard.press('Control+z');
  await page.locator('.toast', { hasText: /^Undid Lava: Zone$/ }).waitFor();
  await page.keyboard.press('Control+Shift+z');
  await lava.locator('.cls', { hasText: 'Zone' }).waitFor();
  await lava.getByRole('button', { name: '👁 Reveal to viewers' }).click();
  assert((await lava.locator('.cls').innerText()) === 'Zone', 'it can be named and made a zone (a step named in words: “Undid Lava: Zone”)');
  // Without a name, the stage calls it what it is in words, never a code like “zone”.
  await lava.getByLabel('Object name').fill('');
  await lava.getByLabel('Object name').press('Enter');
  await page.getByRole('button', { name: 'Object: Zone', exact: true }).waitFor();
  await page.getByRole('dialog', { name: 'Object: Zone' }).getByLabel('Object name').fill('Lava');
  await page.getByRole('dialog', { name: 'Object: Zone' }).getByLabel('Object name').press('Enter');
  await lava.waitFor();
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
  assert((await liveEd.innerText()).includes('One window: viewers see this editor, hidden things too.'), 'one window: the live editor says viewers see it (not “viewers see changes as you make them”)');
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
    const selLine = page.locator('.rh [data-rpg-sel]');
    assert(
      (await inList.getAttribute('aria-pressed')) === 'true' && (await selLine.innerText()).includes('Selected: Player 1, Player 2 · Lava'),
      `the host panel’s list shows it selected, and the RPG box’s one line says what is (${await selLine.innerText()})`,
    );
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
    // One Esc clears the players and the object selected at once (↩ Select them again in the line instead). An avatar
    // that isn't selected drags on its own, even with other things selected.
    await page.keyboard.press('Escape');
    await selLine.getByRole('button', { name: '↩ Select them again' }).waitFor();
    assert(!(await selLine.innerText()).includes('Selected:') && (await inList.getAttribute('aria-pressed')) === 'false', 'one Esc clears the players and the objects selected');
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

  // The secret Potion is in the host's list (numbered, in one window): reveal it, then pick it up.
  await page.locator('.rh .objs').getByRole('button', { name: '🙈 Hidden object 1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Object: 🙈 Hidden object 1' }).getByRole('button', { name: '👁 Reveal to viewers' }).click();
  const card = page.getByRole('dialog', { name: 'Object: Potion' });
  await card.waitFor();
  await page.locator('.rpg .hit').first().waitFor();
  assert((await page.locator('.rpg').innerText()).toLowerCase().includes('potion'), 'revealed, viewers see the Potion');
  await card.locator('.who').getByRole('button').first().click();
  await card.getByRole('button', { name: /picks up Potion$/ }).click();
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
  // A right-click on a ware on the stage: 🛒 Buy for each player, then 📦 Change the stock… (asked in the shop's box).
  await page.locator('.shop [data-ware]').first().click({ button: 'right' });
  const wareLines = await menuLines(page);
  assert(
    wareLines[0].startsWith('# ') && wareLines.filter((l) => l.startsWith('🛒 Buy for ')).length === (await page.locator('.rpg .strip .card').count()) && wareLines.at(-1) === '📦 Change the stock…',
    `a ware's menu in the shop on the stage: 🛒 Buy for each player, then 📦 Change the stock… (${wareLines.join(' | ')})`,
  );
  await openMenu(page).getByRole('menuitem', { name: '📦 Change the stock…' }).click();
  await shopTc.getByRole('spinbutton', { name: 'Stock left' }).waitFor();
  await answerAsk(shopTc.getByRole('group', { name: /How many .+ left\?/ }).getByRole('button', { name: 'Cancel' }));
  await shopTc.getByRole('spinbutton', { name: 'Stock left' }).waitFor({ state: 'detached' });
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
  // Asked in the panel's way: Cancel first, Sell anyway (the buyer below zero) last.
  const shortAsk = shopTc.getByRole('group', { name: 'Short by 🪙1 for Potion.' });
  const answers = (await shortAsk.getByRole('button').allInnerTexts()).map((t) => t.trim()).join(' | ');
  assert(answers === 'Cancel | Give it free | Other price… | Sell anyway', `short of gold: Cancel first, Sell anyway last (${answers})`);
  // Other price… at a price still too much: the row says the gap at that price, and Sell anyway charges that price.
  const priceBox = shopTc.getByRole('spinbutton', { name: 'Price' });
  await answerAsk(shopTc.getByRole('button', { name: 'Other price…' }));
  await priceBox.fill('2');
  await priceBox.press('Enter');
  await shopTc.getByText('Short by 🪙2 for Potion.').waitFor();
  await answerAsk(shopTc.getByRole('button', { name: 'Other price…' }));
  assert((await priceBox.inputValue()) === '2', `Other price… again starts at the price typed (${await priceBox.inputValue()})`);
  await shopTc.getByRole('button', { name: 'Cancel' }).click();
  await answerAsk(shopTc.getByRole('button', { name: 'Sell anyway' }));
  assert((await potions()) === 2, 'selling anyway adds it to the buyer’s inventory');
  assert((await shopTc.innerText()).includes('Player 1 🪙-2'), `and their gold goes below zero, by the price typed (${await shopTc.innerText()})`);
  await shopTc.getByRole('button', { name: /^Potion( ×\d+)? →/ }).first().click();
  assert((await potions()) === 1, 'selling back takes one away');
  // Click a ware on the stage to buy it; short of gold, the host picks what happens.
  assert((await page.locator('.stage .shop .who').innerText()).includes('Player 1'), 'the stage shows who is shopping');
  await page.locator('.stage').getByRole('button', { name: 'Buy Potion' }).click();
  await shopTc.getByText(/Short by .* for Potion/).waitFor();
  await answerAsk(shopTc.getByRole('button', { name: 'Give it free' }));
  assert((await potions()) === 2, 'clicking a ware on the stage buys it');
  assert(await page.locator('.stage .shop').isVisible(), 'clicking the shop keeps it open');
  await shopTc.getByRole('button', { name: '🚪 Leave shop' }).click();
  await page.locator('.stage .shop').waitFor({ state: 'detached' });
  assert(true, '🚪 Leave shop closes it');
  // Moving the party on closes a shop left up on stream (Ctrl+Z takes the step back).
  await page.getByLabel('Open a shop').selectOption({ index: 1 });
  await page.locator('.stage .shop').waitFor();
  await page.getByRole('button', { name: 'Go North', exact: true }).click();
  await page.locator('.rh .where', { hasText: / · Start$/ }).waitFor();
  await page.locator('.stage .shop').waitFor({ state: 'detached' });
  assert(true, 'moving the party on closes the shop on stream');
  await page.keyboard.press('Control+z');
  await page.locator('.rh .where', { hasText: 'New south of Start' }).waitFor();
  // Give one of the two Potions (not the whole stack), then a typed amount.
  await firstCard.getByLabel('Give Potion to').selectOption({ label: 'Player 2' });
  const secondCard = page.locator('.rh .pc').nth(1);
  assert((await potions()) === 1 && (await secondCard.locator('.it .nm').allInnerTexts()).join().includes('Potion'), 'giving an item gives one');
  // − on their only item: the keys go to a button on their card, not to "＋ Item…" (an arrow key there would give them
  // an item instead of moving the party).
  await secondCard.getByRole('button', { name: 'Remove Potion' }).click();
  await secondCard.locator('.it').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.matches('.rh .pc button'));
  await page.keyboard.press('ArrowUp');
  await page.locator('.rh .where', { hasText: / · Start$/ }).waitFor();
  assert(!(await secondCard.locator('.it').count()), 'after − on a player’s last item, ↑ moves the party (nothing given from ＋ Item…)');
  await page.keyboard.press('Control+z');
  await page.locator('.rh .where', { hasText: 'New south of Start' }).waitFor();
  await page.keyboard.press('Control+z');
  await secondCard.locator('.it', { hasText: 'Potion' }).waitFor();

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
  await page.getByRole('menu').getByRole('menuitem', { name: '✎ Rename' }).click();
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
  await boxSelect();
  console.log('rpg: all passed');
} catch (e) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rpg-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
