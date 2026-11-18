// RPG and board-game rounds at 1280×720, from the editor's templates: what opens in the round's box comes into sight in
// it, and the box says when there's more below. Only that box moves, never the stage.
// 1. Race to the finish, one window: the box under the stage, taller than its room, fades at its foot while there's
//    more below (data-more), not once scrolled to the end.
// 2. Race to the finish, two windows: the turn box's long first line wraps to two lines beside the stage, not cut
//    short; the go-on card's long "Next turn anyway: …" button stays inside the card.
// 3. Mini quest, in two windows and in one: the Shopkeeper's card scrolled into sight never leaves the top row cut in
//    half; short of gold in the shop, the question comes into sight with the keys on Cancel, and the toast names the
//    item; ▸ Players: stats & inventory opened shows the first sheet, the toggle still in sight.
// 4. 3 × 3 dungeon, one window: ⤢ Full map opens with the party's screen (the bottom row) in sight.
// 5. Mini quest, two windows: the Boss's card, taller than the box, opens with its top under the pinned pad and map
//    (the round's part takes the empty main-button row, so the box has that room too).
// 6. Mini quest, one window: the screen's 📝 note has a slot of its own in the top row (cut short, the whole of it in
//    its tooltip), so the parties, 🗺 Map on stream, the pad and the minimap stay put from a screen with a note to one
//    without.
// 7. The slide editor in its host's words: objects on a screen in the RPG screen editor, pictures on the board in a
//    board game's backdrop, items on a slide in a slides round.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addPlayers, editorReady, goOnCheck } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/** A new game with one round from a template, started with 3 players (in two windows, with the audience window open). */
async function host(template, two) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // (The update check: never the real GitHub.)
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${template}] ${e.message}`));
  await page.goto(pathToFileURL(file).href);
  await editorReady(page);
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: new RegExp(template) }).click();
  await page.locator('nav > button.round-tab').first().waitFor();
  // Its undo step names the template only when the round's name doesn't already ("Added round “Mini quest”").
  const undo = await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(/^Undo: Added round “.+”/.test(undo) && !/“([^”]+)” \(\1\)/.test(undo), `the template's undo step says its name once (${undo})`);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await addPlayers(page, 3);
  if (two) {
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
    aud.on('pageerror', (e) => errors.push(`[${template} audience] ${e.message}`));
    await aud.setViewportSize({ width: 1280, height: 720 });
  }
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('main.play .mode-host').waitFor();
  return { ctx, page };
}

/** The stage's place and size, and how far the page and the play area are scrolled. */
const stageAt = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.stage-box').getBoundingClientRect();
    return [r.left, r.top, r.width, r.height, document.querySelector('main.play').scrollTop, scrollY].map(Math.round).join();
  });
/** The round's box: its top and bottom on screen. */
const boxOf = (page) => page.locator('.mode-host:not(.tools)').evaluate((e) => ({ top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom }));
/** Steps until `cond` holds in the page (false if it never does). */
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);

try {
  {
    console.log('Race to the finish, one window:');
    const { ctx, page } = await host('Race to the finish', false);
    const box = page.locator('.mode-host.bgame');
    const info = () =>
      box.evaluate((e) => ({ more: e.hasAttribute('data-more'), over: e.scrollHeight > e.clientHeight + 1, fade: getComputedStyle(e, '::after').content !== 'none', side: !!e.closest('.panel.side') }));
    const stage = await stageAt(page);
    const first = await info();
    assert(!first.side && first.over, `the board game's box is under the stage and has more than fits (${JSON.stringify(first)})`);
    assert(first.more && first.fade, `so its foot fades: there's more below (${JSON.stringify(first)})`);
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-bgame-more.png` });
    await box.evaluate((e) => (e.scrollTop = e.scrollHeight));
    assert(await until(page, () => !document.querySelector('.mode-host.bgame').hasAttribute('data-more')), 'scrolled to its end, the fade goes');
    assert((await info()).fade === false, 'and nothing is drawn over its last row');
    assert((await stageAt(page)) === stage, 'the stage keeps its place and size');
    await ctx.close();
  }
  {
    console.log('Race to the finish, two windows:');
    const { ctx, page } = await host('Race to the finish', true);
    await page.keyboard.press('n');
    await page.locator('.bh [data-turn-next]', { hasText: 'Roll' }).waitFor();
    // Start + 9 is Roll again: its landing button not pressed, N asks first.
    await page.getByLabel('Steps').fill('9');
    await page.getByLabel('Steps').press('Enter');
    await page.locator('.bh .acts').getByRole('button', { name: 'Roll again' }).waitFor();
    // Beside the stage the turn box's first line wraps to two lines where it's long, not cut short (its room is there).
    const line = await page.locator('.bh [data-turn-next]').evaluate((e) => ({
      side: !!e.closest('.bh.side'),
      text: e.textContent,
      cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
      lines: (() => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map((x) => Math.round(x.bottom))).size;
      })(),
    }));
    assert(line.side && line.text.endsWith('then Next turn ▶ (N).') && !line.cut && line.lines === 2, `beside the stage, the turn box's long first line wraps to two lines, whole (${JSON.stringify(line)})`);
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-turnline-side.png` });
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('n');
    const anyway = goOnCheck(page).locator('[data-anyway]');
    await anyway.waitFor();
    const fit = await goOnCheck(page).evaluate((g) => {
      const b = g.querySelector('[data-anyway]').getBoundingClientRect();
      const c = g.getBoundingClientRect();
      return { side: g.classList.contains('side'), card: [Math.round(c.left), Math.round(c.right)], button: [Math.round(b.left), Math.round(b.right)] };
    });
    assert(fit.side && fit.button[1] <= fit.card[1] && fit.button[0] >= fit.card[0], `beside the stage, the go-on card's “… anyway” button is inside the card (${JSON.stringify(fit)})`);
    assert((await anyway.locator('kbd').evaluate((k) => k.getClientRects().length)) === 1, 'its key stays on one line');
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-goon-side.png` });
    await ctx.close();
  }
  for (const two of [true, false]) {
    console.log(`Mini quest, ${two ? 'two windows' : 'one window'}:`);
    const { ctx, page } = await host('Mini quest', two);
    await page.keyboard.press('n');
    const rh = page.locator('.rh');
    await rh.getByRole('button', { name: /Shopkeeper/ }).first().click();
    // The card comes into sight with the box scrolled to a row's edge: the top row (where, the parties, 🗺 Map on
    // stream) all out of sight or all in it, never cut in half under the selection line.
    await rh.getByRole('button', { name: '🛒 Shop' }).waitFor();
    await page.waitForTimeout(300);
    const top = await rh.evaluate((r) => {
      const box = r.closest('.mode-host').getBoundingClientRect();
      const row = r.querySelector('.row.top').getBoundingClientRect();
      return { box: Math.round(box.top), row: [Math.round(row.top), Math.round(row.bottom)], scrolled: r.closest('.mode-host').scrollTop };
    });
    assert(top.row[1] <= top.box + 1 || top.row[0] >= top.box - 1, `the Shopkeeper's card open, the top row isn't cut at the box's top (${JSON.stringify(top)})`);
    await rh.getByRole('button', { name: '🛒 Shop' }).click();
    await page.getByRole('button', { name: /^Potion · / }).click();
    await page.locator('.toast', { hasText: 'Potion' }).waitFor();
    const stage = await stageAt(page);
    await page.getByRole('button', { name: /^Sword · / }).click();
    const ask = page.getByRole('group', { name: /^Short by .+ for Sword\.$/ });
    await ask.waitFor();
    // (Read at once: a toast goes after 3 seconds.)
    const said = await page.locator('.toast', { hasText: /^Short by/ }).innerText();
    assert(/^Short by .+ for Sword: choose in the shop’s box$/.test(said), `the toast names the item (${said})`);
    const sell = ask.getByRole('button', { name: 'Sell anyway' });
    const inSight = await until(
      page,
      () => {
        const b = [...document.querySelectorAll('.mode-host button')].find((x) => x.textContent.trim() === 'Sell anyway')?.getBoundingClientRect();
        const m = [...document.querySelectorAll('.mode-host')].at(-1).getBoundingClientRect();
        return b && b.bottom <= m.bottom + 1 && b.top >= m.top;
      },
      undefined,
    );
    assert(inSight, `short of gold, the question's answers come into sight in the round's box (Sell anyway ${JSON.stringify(await sell.boundingBox())}, box ${JSON.stringify(await boxOf(page))})`);
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    assert(focused === 'Cancel', `the keys are on Cancel, not on the item clicked (${focused})`);
    assert((await stageAt(page)) === stage, 'the stage keeps its place and size');
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-short-${two ? 2 : 1}.png` });
    // A price typed in that's still short: the question is asked again with the keys on its Cancel (not on a buyer's
    // chip at the top of the box), and the Enter that answered the price didn't press it.
    await page.locator('[data-ask][data-ready]').waitFor();
    await ask.getByRole('button', { name: 'Other price…' }).click();
    await ask.getByLabel('Price').fill('7');
    await ask.getByLabel('Price').press('Enter');
    await ask.getByRole('button', { name: 'Sell anyway' }).waitFor();
    await page.waitForTimeout(300);
    const again = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), inAsk: !!document.activeElement?.closest('[data-ask]') }));
    assert(again.text === 'Cancel' && again.inAsk && (await ask.count()) === 1, `still short at a typed price: asked again, the keys on its Cancel (${JSON.stringify(again)})`);
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await ask.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');

    // ▸ Players: stats & inventory, opened at the box's foot: the first sheet comes into sight, the toggle too.
    await page.locator('.mode-host:not(.tools)').evaluate((e) => (e.scrollTop = 0));
    const toggle = rh.getByRole('button', { name: /Players: stats & inventory/ });
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
    await toggle.click();
    const sheet = rh.locator('.cards > *').first();
    await sheet.waitFor();
    const seen = await until(page, () => {
      const m = [...document.querySelectorAll('.mode-host')].at(-1).getBoundingClientRect();
      const c = document.querySelector('.rh .cards > *').getBoundingClientRect();
      const t = document.querySelector('.rh .row.who [aria-expanded]').getBoundingClientRect();
      const shown = Math.min(c.bottom, m.bottom) - Math.max(c.top, m.top);
      return t.top >= m.top && shown >= Math.min(c.height, m.height - 80) - 1;
    });
    const at = await page.evaluate(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      return { box: [...document.querySelectorAll('.mode-host')].at(-1).getBoundingClientRect().toJSON(), sheet: r('.rh .cards > *').toJSON(), toggle: r('.rh .row.who [aria-expanded]').toJSON() };
    });
    assert(seen, `opened, the first player's sheet comes into sight in the box, the toggle still in sight (${JSON.stringify(at)})`);
    assert((await stageAt(page)) === stage, 'and the stage keeps its place and size');
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-sheets-${two ? 2 : 1}.png` });
    await ctx.close();
  }
  {
    console.log('3 × 3 dungeon, one window:');
    const { ctx, page } = await host('3 × 3 dungeon', false);
    await page.keyboard.press('n');
    await page.locator('.rh').waitFor();
    const stage = await stageAt(page);
    await page.getByRole('button', { name: '⤢ Full map' }).click();
    const dialog = page.getByRole('dialog', { name: 'Full map' });
    await dialog.locator('.grid .cell.cur').waitFor();
    const inSight = await until(page, () => {
      const g = document.querySelector('[role="dialog"] .grid').getBoundingClientRect();
      const c = document.querySelector('[role="dialog"] .grid .cell.cur').getBoundingClientRect();
      return c.top >= g.top - 1 && c.bottom <= g.bottom + 1;
    });
    const at = await dialog.evaluate((d) => ({
      grid: d.querySelector('.grid').getBoundingClientRect().toJSON(),
      scrolls: d.querySelector('.grid').scrollHeight > d.querySelector('.grid').clientHeight,
      here: d.querySelector('.grid .cell.cur').getBoundingClientRect().toJSON(),
    }));
    assert(at.scrolls && inSight, `⤢ Full map opens with the party's screen in sight, though the map is taller than its box (${JSON.stringify(at)})`);
    assert((await stageAt(page)) === stage, 'the stage keeps its place and size');
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-fullmap.png` });
    await ctx.close();
  }
  {
    console.log('Mini quest, two windows: the Boss’s card');
    const { ctx, page } = await host('Mini quest', true);
    await page.keyboard.press('n');
    const rh = page.locator('.rh');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.rh .where')?.textContent.includes('Boss lair'));
    const stage = await stageAt(page);
    await rh.getByRole('button', { name: /^Boss · / }).click();
    await rh.getByRole('button', { name: '▶ Run all' }).waitFor();
    await page.waitForTimeout(300);
    const at = await rh.evaluate((r) => {
      const host = r.closest('.mode-host');
      const act = host.closest('.act').getBoundingClientRect();
      const action = host.closest('.action').getBoundingClientRect();
      const nav = r.querySelector('.nav.pinned').getBoundingClientRect();
      const card = r.querySelector('.main .side').getBoundingClientRect();
      return { over: host.scrollHeight > host.clientHeight, act: Math.round(act.bottom), action: Math.round(action.bottom), nav: Math.round(nav.bottom), card: Math.round(card.top) };
    });
    assert(at.action === at.act, `beside the stage with no main button, the round's part reaches the column's foot (no empty row under it) (${JSON.stringify(at)})`);
    assert(at.over && at.card >= at.nav - 1, `a card taller than the box opens with its top row under the pinned pad and map, not cut by them (${JSON.stringify(at)})`);
    assert((await stageAt(page)) === stage, 'the stage keeps its place and size');
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-bosscard.png` });
    await ctx.close();
  }
  {
    console.log('Mini quest, one window: the top row from screen to screen');
    const { ctx, page } = await host('Mini quest', false);
    await page.keyboard.press('n');
    const rh = page.locator('.rh');
    await rh.waitFor();
    /** Where the top row's buttons, the pad and the minimap are, and what the note slot says. */
    const layout = () =>
      page.evaluate(() => {
        const at = (el) => (el ? [Math.round(el.getBoundingClientRect().left), Math.round(el.getBoundingClientRect().top)].join(',') : null);
        const btn = (t) => [...document.querySelectorAll('.rh button')].find((b) => b.textContent.includes(t));
        const slot = document.querySelector('.rh [data-screen-notes]');
        return {
          where: document.querySelector('.rh .where').textContent.trim(),
          places: { party: at(document.querySelector('.rh .party')), map: at(btn('Map on stream')), pad: at(document.querySelector('.rh .pad')), minimap: at(document.querySelector('.rh .mapbox')) },
          note: slot && { text: slot.textContent.trim(), title: slot.title, cut: slot.scrollWidth > slot.clientWidth + 1 || slot.scrollHeight > slot.clientHeight + 1, lines: slot.getClientRects().length },
        };
      });
    const village = await layout();
    assert(village.where.endsWith('Village') && village.note?.text.startsWith('📝 Everyone starts with 10 gold'), `in the Village the screen's note shows in its slot (${JSON.stringify(village)})`);
    assert(village.note.title.includes('Then walk east.'), `its whole text is in its tooltip (${village.note.title})`);
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-note-village.png` });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.rh .where')?.textContent.includes('Forest'));
    const forest = await layout();
    assert(forest.note && forest.note.text === '', `in the Forest (no note) the slot is there, empty (${JSON.stringify(forest.note)})`);
    assert(JSON.stringify(forest.places) === JSON.stringify(village.places), `the parties, 🗺 Map on stream, the pad and the minimap stay put (${JSON.stringify(village.places)} → ${JSON.stringify(forest.places)})`);
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-note-forest.png` });
    await ctx.close();
  }

  {
    console.log('The slide editor in its host’s words');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[nouns] ${e.message}`));
    await page.goto(pathToFileURL(file).href);
    await editorReady(page);
    const addRound = async (name) => {
      await page.getByRole('button', { name: '＋ Add round' }).click();
      await page.getByRole('menuitem', { name }).first().click();
      await page.waitForTimeout(500);
    };
    /** Everything the slide editor says (its text, tooltips and labels, its Tips folded or not). */
    const says = () =>
      page.locator('.se').evaluate((se) => [se.textContent, ...[...se.querySelectorAll('[aria-label], [title]')].flatMap((e) => [e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? ''])].join('\n'));
    // (Entrance animations “Slide from left” are a way in, and 📦 Item ▾ adds a catalog item: not its nouns.)
    const strays = (t) => t.replace(/Slide from \w+/g, '').replace(/📦 Item ▾?|an item from the catalog/g, '').match(/[^\n.]*\b(items?|slides?|slide['’]s)\b[^\n.]*/gi) ?? [];
    // An RPG screen: objects on a screen.
    await addRound(/Mini quest/);
    await page.getByRole('button', { name: 'Screen Forest' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '◀ Back to the map' }).waitFor();
    let t = await says();
    assert(t.includes('Click an object to edit it') && t.includes('copy objects between screens') && t.includes('More for this screen'), 'the RPG screen editor says objects and screens');
    await page.locator('.layers-box .row').filter({ hasText: 'Gold coins' }).locator('.name').click();
    t = await says();
    assert(t.includes("Move to the screen's left edge"), 'an object goes to the screen’s edges');
    await page.locator('.layers-box .row').filter({ hasNotText: 'Gold coins' }).first().locator('.name').click({ modifiers: ['Shift'] });
    t = await says();
    assert(t.includes('2 objects selected') && t.includes('Line up the selected objects'), 'two of them are “2 objects”');
    assert(!strays(t).length, `nothing in it says item or slide (${strays(t).join(' | ')})`);
    // A board game's backdrop: pictures on the board.
    await addRound(/Race to the finish/);
    await page.getByRole('button', { name: /Board backdrop/ }).click();
    t = await says();
    assert(t.includes('Click a picture to edit it') && t.includes('More for this board') && !strays(t).length, `the board backdrop says pictures and the board (${strays(t).join(' | ')})`);
    // A slides round keeps items on slides.
    await addRound(/Slides/);
    await page.locator('.se').waitFor();
    t = await says();
    assert(t.includes('Click an item to edit it') && t.includes('copy items between slides') && t.includes('More for this slide'), 'a slides round still says items and slides');
    if (shots) await page.screenshot({ path: `${shots}/worldfixes-nouns.png` });
    await ctx.close();
  }
  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('worldfixes: all passed');
} finally {
  await browser.close();
}
