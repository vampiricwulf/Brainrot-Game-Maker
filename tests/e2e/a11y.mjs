// Accessibility and consistency: windows keep the focus (Tab stays inside, the rest is inert, the focus goes back on
// close), the app asks in its own windows, the header fits at 150% zoom, readable colors, reduced motion, names.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dialogs = [];
page.on('dialog', (d) => (dialogs.push(d.message()), d.accept()));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** The focused element's accessible-ish name (aria-label or text). */
const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  return el && el !== document.body ? (el.getAttribute('aria-label') || el.textContent || '').trim() : 'BODY';
});
const focusInside = (sel) => page.evaluate((s) => !!document.querySelector(s)?.contains(document.activeElement), sel);
/** WCAG contrast of an element's text on its background color. */
const contrastOf = (loc) =>
  loc.evaluate((el) => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(el);
    const [a, b] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
/** The same, on the first background under the text (a link, a key chip on a button); 0 if it's faded (opacity). */
const inkOn = (loc) =>
  loc.evaluate((el) => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let faded = false;
    let bg = getComputedStyle(document.body).backgroundColor;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.opacity !== '1') faded = true;
      if (!/^rgba\(.*,\s*0\)$|^transparent$/.test(cs.backgroundColor)) {
        bg = cs.backgroundColor;
        break;
      }
    }
    const [a, b] = [lum(getComputedStyle(el).color), lum(bg)].sort((x, y) => y - x);
    return faded ? 0 : (a + 0.05) / (b + 0.05);
  });

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- A window keeps the focus ----------
  const more = page.getByRole('button', { name: /^More:/ });
  await more.click();
  await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.waitFor();
  assert(await focusInside('[role="dialog"]'), 'opening ⚙ Settings puts the focus in it');
  let escaped = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await focusInside('[role="dialog"]'))) escaped++;
  }
  assert(escaped === 0, 'Tab ×30 never leaves it');
  await page.keyboard.press('Shift+Tab');
  assert(await focusInside('[role="dialog"]'), 'nor does Shift+Tab');
  assert(await page.locator('.editor nav').evaluate((n) => !!n.closest('[inert]')), 'the page behind it is inert');
  assert((await settings.getAttribute('aria-modal')) === 'true', 'it says it is modal');
  await settings.getByRole('button', { name: 'Close' }).click();
  assert(await more.evaluate((b) => b === document.activeElement), 'closing it gives the focus back to ⋯');
  assert(!(await page.locator('[inert]').count()), 'and nothing stays inert');

  // The hosting guide, from the ⋯ menu (a new tab; GitHub is a stand-in here) and from ℹ About.
  await context.route('https://github.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Guide</title>' }));
  await more.click();
  const [guide] = await Promise.all([context.waitForEvent('page'), page.getByRole('menuitem', { name: /How to host/ }).click()]);
  await guide.waitForURL('https://github.com/vampiricwulf/Brainrot-Game-Maker#hosting');
  await guide.close();
  await more.click();
  await page.getByRole('menuitem', { name: 'ℹ About' }).click();
  const about = page.getByRole('dialog', { name: 'About Brainrot Games Maker' });
  await about.waitFor();
  assert(
    (await about.getByRole('link', { name: /How to host/ }).getAttribute('href')) === 'https://github.com/vampiricwulf/Brainrot-Game-Maker#hosting',
    'the ⋯ menu’s 📖 How to host opens the hosting guide in a new tab, and ℹ About links to it',
  );
  assert(
    (await more.getAttribute('aria-label')).includes('Keyboard shortcuts, How to host (guide), About') && (await more.getAttribute('title')).includes('📖 How to host (guide), ℹ About'),
    '⋯’s name and tooltip list 📖 How to host (guide) with the rest of its menu',
  );
  await page.keyboard.press('Escape');
  assert((await page.getByRole('dialog').count()) === 0 && (await more.evaluate((b) => b === document.activeElement)), 'Esc on ℹ About gives the focus back too');

  // Every window has the same ✕ named Close.
  await more.click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Editor keyboard shortcuts' });
  assert((await sheet.getByRole('button', { name: 'Close' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Done' }).count()) === 1, '⌨ Keyboard shortcuts: a ✕ named Close and a Done');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // ---------- Windows' buttons: Cancel (the safe answer) first, the main one last ----------
  /** A window's footer buttons, in the order they show (left to right), with their DOM order alongside. */
  const footer = (dlg) =>
    dlg.locator('.modal-foot button').evaluateAll((bs) => {
      const visual = [...bs].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((b) => b.textContent.trim());
      return { dom: bs.map((b) => b.textContent.trim()), visual, mainClass: bs.at(-1)?.className ?? '' };
    });
  await page.getByRole('button', { name: /Save/ }).first().click();
  const naming = page.getByRole('dialog', { name: 'Name your game' });
  await naming.waitFor();
  let foot = await footer(naming);
  assert(
    foot.dom.join('|') === 'Cancel|Save' && foot.visual.join('|') === 'Cancel|Save' && foot.mainClass.includes('primary'),
    `💾 Name your game: Cancel on the left, Save (the main one) rightmost (${foot.visual.join(' · ')})`,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /New/ }).first().click();
  const replacing = page.getByRole('dialog', { name: /Start a new game/ });
  await replacing.waitFor();
  foot = await footer(replacing);
  assert(
    foot.dom.join('|') === 'Cancel|Start new anyway|Save first' && foot.visual.join('|') === 'Cancel|Start new anyway|Save first',
    `Start a new game?: Cancel first, Start new anyway, then Save first rightmost (${foot.visual.join(' · ')})`,
  );
  await replacing.getByRole('button', { name: 'Cancel' }).click();

  // ---------- One focus ring, for the keyboard ----------
  const ring = () => page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { style: cs.outlineStyle, color: cs.outlineColor, width: parseFloat(cs.outlineWidth) };
  });
  await page.getByRole('button', { name: '🔊 Sounds' }).click();
  assert((await ring()).style === 'none', 'a button clicked with the mouse shows no focus ring');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const kb = await ring();
  assert(kb.style === 'solid' && kb.width >= 2 && kb.color === 'rgb(80, 128, 255)', `the same button reached with Tab shows the accent ring (${JSON.stringify(kb)})`);

  // ---------- A toast over a window stays clear of its buttons ----------
  await page.locator('nav > button.round-tab').first().click();
  await page.locator('.grid .tile').first().click();
  const clueDlg = page.getByRole('dialog', { name: 'Edit clue' });
  await clueDlg.waitFor();
  await clueDlg.getByRole('button', { name: /Copy slide/ }).click();
  const toastBox = await page.locator('.toast').boundingBox();
  const hit = await clueDlg.locator('button:visible').evaluateAll(
    (bs, t) =>
      bs
        .map((b) => [b.textContent.trim() || b.getAttribute('aria-label'), b.getBoundingClientRect()])
        .filter(([, r]) => r.width && r.left < t.x + t.width && r.right > t.x && r.top < t.y + t.height && r.bottom > t.y)
        .map(([n]) => n),
    toastBox,
  );
  assert(toastBox && hit.length === 0, `a toast while the clue editor is open covers none of its buttons (${hit.join(', ') || 'none'})`);
  // What's said while a window is open is still read: the live region isn't made inert with the page.
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => document.getElementById('live-region')?.dataset.said?.endsWith('Category 1 $400.'), null, { timeout: 3000 });
  assert(!(await page.locator('#live-region').evaluate((r) => !!r.closest('[inert]'))), 'Ctrl+Enter in the clue editor says which tile it’s on, in a live region the window leaves usable');
  await page.keyboard.press('Escape');
  await clueDlg.waitFor({ state: 'detached' });

  // ---------- Board editor: names and focus ----------
  const firstTile = page.locator('.tile').first();
  assert(/^Category 1, \$200: no question yet, no answer$/.test(await firstTile.getAttribute('aria-label')), `a tile is named by category, value and question (${await firstTile.getAttribute('aria-label')})`);
  await page.locator('.cat textarea').first().fill('Memes');
  // Its moves and Delete are in its ⋯ menu (named after the category).
  await page.getByRole('button', { name: 'More for category 1: Memes' }).click();
  await page.getByRole('menuitem', { name: /Delete category/ }).click();
  assert(/^More for category 1/.test(await focused()), `after deleting a category the focus goes to the next one’s ⋯ (${await focused()})`);
  await page.keyboard.press('Control+z');
  assert((await page.locator('nav [aria-current="page"]').count()) === 1, 'the sidebar marks the tab on screen (aria-current)');

  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /Jeopardy board/ }).click();
  assert(await page.evaluate(() => document.activeElement?.matches('main [data-round-name]')), 'a new round puts the focus in its name field');

  // ---------- Readable colors ----------
  const play = page.getByRole('button', { name: '▶ Play' });
  assert((await contrastOf(play)) >= 4.5, `▶ Play (white on the accent) reads at ${(await contrastOf(play)).toFixed(2)}:1`);
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  const pastel = page.getByRole('button', { name: 'Pastel', exact: true });
  assert((await pastel.getAttribute('aria-pressed')) === 'false', 'theme presets are named by their label and say which is on');
  await pastel.click();
  assert((await pastel.getAttribute('aria-pressed')) === 'true', 'Pastel is pressed once chosen');
  const plate = page.locator('.preview .plate .score').first();
  assert((await plate.evaluate((e) => getComputedStyle(e).color)) === 'rgb(74, 59, 92)', 'Pastel scores are dark text on the pale tiles');

  // A sound switched off: its name is muted, still readable (on its row's background).
  await page.getByRole('button', { name: '🔊 Sounds' }).click();
  await page.getByLabel('Play the Right sound').uncheck();
  const offName = page.locator('.sound.off .what b').first();
  const offContrast = await offName.evaluate((el) => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = rgb(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(getComputedStyle(el).color), lum(getComputedStyle(el.closest('.sound')).backgroundColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05) * (getComputedStyle(el.closest('.what')).opacity === '1' ? 1 : 0);
  });
  assert(offContrast >= 4.5, `a switched-off sound’s name reads at ${offContrast.toFixed(2)}:1`);
  await page.getByLabel('Play the Right sound').check();

  // ---------- Landmarks and headings ----------
  assert((await page.getByRole('main').getByRole('heading', { level: 1 }).count()) === 1, 'the editor has a main part with a heading naming the game');
  // 📊 Stats & Items shows up once an RPG or board game round is there to use it.
  assert((await page.getByRole('button', { name: '📊 Stats & Items' }).count()) === 0, 'a game of Jeopardy boards has no 📊 Stats & Items in the sidebar');
  const roundTabs = await page.locator('nav > button.round-tab').count();
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: /RPG/ }).click();
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  assert((await page.locator('[role="list"]:not(:has([role="listitem"]))').count()) === 0, 'Stats & Items has no empty lists (nothing added yet)');
  await page.keyboard.press('Control+z');
  await page.waitForFunction((n) => document.querySelectorAll('nav > button.round-tab').length === n, roundTabs);
  // 🤫 Cards: no empty list either (no card made yet), and one tab marked as the one on screen; nor with a card in it.
  await page.locator('nav > button', { hasText: '🤫 Cards' }).click();
  await page.locator('main .empty', { hasText: 'No cards yet.' }).waitFor();
  assert((await page.locator('[role="list"]:not(:has([role="listitem"]))').count()) === 0, '🤫 Cards has no empty list (no card made yet)');
  assert((await page.locator('nav [aria-current="page"]').count()) === 1, 'and the sidebar marks only 🤫 Cards as on screen');
  await page.getByRole('button', { name: '＋ Add card' }).click();
  await page.locator('[data-saved-card]').waitFor();
  assert(
    (await page.locator('[role="list"]:not(:has([role="listitem"]))').count()) === 0 && (await page.locator('nav [aria-current="page"]').count()) === 1,
    'nor with a card in it',
  );
  await page.keyboard.press('Control+z');
  await page.locator('[data-saved-card]').waitFor({ state: 'detached' });

  // ---------- In-app questions ----------
  // A game in progress, then ▶ Play again: the app asks in its own window, with the focus on the safe answer.
  await play.click();
  assert(await page.locator('.pregame h1').evaluate((h) => h === document.activeElement), '▶ Play puts the focus at the top of the pre-game page');
  assert((await page.getByRole('main').locator('h1').count()) === 1, 'the pre-game page is the main part, under the game’s title');

  // Pre-game (where players are added): deleting a player offers Undo.
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  const names = page.locator('.pregame input.name');
  const before = await names.count();
  await page.getByRole('button', { name: /^Delete Player 2$/ }).click();
  const undoNote = page.locator('.undo-note');
  assert((await names.count()) === before - 1 && (await undoNote.innerText()).includes('Deleted Player 2'), 'deleting a player before the game says so');
  await undoNote.getByRole('button', { name: '↶ Undo' }).click();
  assert((await names.count()) === before, 'and its Undo brings them back');
  // Small text in the accent color, and Start game's key chip, read at 4.5:1.
  const testSound = await inkOn(page.getByRole('button', { name: 'Test the sound' }));
  const startKey = await inkOn(page.locator('.start-key'));
  assert(testSound >= 4.5 && startKey >= 4.5, `“Test the sound” reads at ${testSound.toFixed(2)}:1, and Start game’s Ctrl+⏎ at ${startKey.toFixed(2)}:1`);

  const startedAt = await page.evaluate(() => Date.now());
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  // The whole page changed: screen readers are told, and the keys are on the panel (not on <body>).
  const said = () => page.evaluate(() => document.getElementById('live-region')?.dataset.said ?? '');
  const saidHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('live-region')?.dataset.said ?? ''), re.source);
  await saidHas(/Untitled Game has started/);
  assert((await focused()) !== 'BODY', `starting the game says so, and puts the keys on the panel (${await focused()})`);
  // Regions a screen reader can jump between: the stage and the host controls (🚪 Exit).
  const main = page.getByRole('main');
  assert(
    (await main.getByRole('region', { name: 'Stage' }).count()) === 1 &&
      (await main.getByRole('region', { name: 'Host controls' }).getByRole('button', { name: '🚪 Exit' }).count()) === 1,
    'the game screen has a Stage region and a Host controls region (🚪 Exit)',
  );
  // The same after a reload (once the game is stored) and Resume game, Enter picking how it's shown.
  for (let i = 0; i < 100 && !((await stored(page))?.savedAt >= startedAt); i++) await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole('button', { name: 'Resume game' }).click();
  // (The keys go to the one used last a frame after the question shows.)
  await page.waitForFunction(() => !!document.activeElement?.matches('.mode-ask .mode.on'));
  await page.keyboard.press('Enter');
  await saidHas(/Untitled Game resumed/);
  assert((await focused()) !== 'BODY', `Resume game says so too, and puts the keys on the panel (${await focused()})`);
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // P then a player's number, and S, are said.
  await page.keyboard.press('p');
  await page.keyboard.press('1');
  await saidHas(/Player 1 picks next/);
  await page.keyboard.press('s');
  await saidHas(/Scores on screen/);
  await page.keyboard.press('s');
  await saidHas(/Scores off screen/);
  assert(true, 'P, 1 says who picks next, and S whether the scores are on screen');
  assert((await page.getByRole('main').getByRole('heading', { level: 1, name: 'Untitled Game' }).count()) === 1, 'the stage and host panel are the main part, under a heading with the game’s title');
  await page.locator('.board .tile').first().click();
  assert((await focused()).includes('Reveal answer'), 'opening a clue puts the focus on 👁 Reveal answer');
  // The status line is read without its glyphs (⏱ is the timer's, not words).
  await page.waitForFunction(() => /Answer hidden/.test(document.getElementById('live-region')?.dataset.said ?? ''));
  assert(!(await said()).includes('⏱'), `the status line is read without the timer's ⏱ (“${await said()}”)`);
  // Screen readers hear an award from the page's polite live region (on the page all along, not mounted with its words).
  const region = page.locator('#live-region');
  assert((await region.getAttribute('data-live')) === 'polite', 'the page has a polite live region');
  await page.keyboard.press('1');
  // (Who's selected, before Enter awards them.)
  await page.waitForFunction(() => /Selected: Player 1/.test(document.getElementById('live-region')?.dataset.said ?? ''));
  assert(true, 'pressing a player’s number says who is selected');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Player 1 \+\$200, now \$200/.test(document.getElementById('live-region')?.dataset.said ?? ''), null, { timeout: 3000 });
  assert(true, `the live region announces the award (“${await region.getAttribute('data-said')}”)`);
  await page.keyboard.press('Escape');
  // A button the keys come back to (a window closed with Esc) is pressed by Enter, as one reached with Tab is (Enter
  // isn't an award there, as it is after a click).
  const rulesBtn = page.locator('.panel').getByRole('button', { name: '⚖ Rules', exact: true });
  const rulesDlg = page.getByRole('dialog', { name: 'Game rules' });
  await rulesBtn.focus();
  await page.keyboard.press('Enter');
  await rulesDlg.waitFor();
  await page.keyboard.press('Escape');
  await rulesDlg.waitFor({ state: 'detached' });
  assert(await rulesBtn.evaluate((b) => b === document.activeElement), 'Esc on ⚖ Game rules gives the keys back to ⚖ Rules');
  await page.keyboard.press('Enter');
  await rulesDlg.waitFor();
  assert(true, 'and Enter there opens it again (not “Select a player first”)');
  await page.keyboard.press('Escape');
  await rulesDlg.waitFor({ state: 'detached' });
  // Clicked with the mouse instead, Enter there still awards once Esc gives it the keys back.
  const scoreOf = (i) => page.locator('.panel .p').nth(i).locator('.score').innerText();
  const scoreNot = (i, was) => page.waitForFunction(([i, was]) => document.querySelectorAll('.panel .p .score')[i]?.textContent?.trim() !== was, [i, was]);
  await page.locator('.board .tile:not(.used)').first().click();
  await page.waitForFunction(() => document.activeElement?.textContent?.includes('Reveal answer'));
  let was = await scoreOf(0);
  await rulesBtn.click();
  await rulesDlg.waitFor();
  await page.keyboard.press('Escape');
  await rulesDlg.waitFor({ state: 'detached' });
  assert(await rulesBtn.evaluate((b) => b === document.activeElement), '⚖ Rules clicked, then Esc: the keys are back on it');
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await scoreNot(0, was);
  assert((await rulesDlg.count()) === 0, 'and 1, Enter award Player 1 there (Enter doesn’t open ⚖ Game rules again)');
  // ＋ Award reached with the keys: it turns off once pressed, and the keys go to a button near it, but 2, Enter still
  // award (not ▦ Done ▶ board, which would close the clue).
  const awardBtn = page.locator('.panel').getByRole('button', { name: /^＋ Award/ });
  await page.keyboard.press('1');
  await awardBtn.focus();
  was = await scoreOf(0);
  await page.keyboard.press('Enter');
  await scoreNot(0, was);
  await page.waitForFunction(() => {
    const a = document.activeElement;
    return !!a?.matches('.panel button:not(:disabled)') && !a.getAttribute('aria-label')?.startsWith('＋ Award');
  });
  was = await scoreOf(1);
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await scoreNot(1, was);
  assert((await page.locator('.board').count()) === 0, `＋ Award pressed with Enter: then 2, Enter award Player 2, and the clue stays open (the keys were on ${await focused()})`);
  await page.keyboard.press('Escape');
  await page.locator('.board').waitFor();
  await page.getByRole('button', { name: '👥 Players' }).click();
  const playersDlg = page.getByRole('dialog', { name: 'Players' });
  const ariaFocused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? 'BODY');
  const rowNames = () => playersDlg.locator('input.name').evaluateAll((els) => els.map((e) => e.value).join());
  await playersDlg.getByRole('button', { name: /^Remove / }).first().click();
  const removeAsk = await playersDlg.locator('.ask button').allInnerTexts();
  assert((await focused()) === 'Keep' && removeAsk.join(' | ') === 'Keep | Remove', `removing a player mid-game asks with the focus on Keep, before Remove, as every ask puts the safe answer first (${removeAsk.join(' | ')})`);
  await playersDlg.getByRole('button', { name: 'Keep' }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Player 1');
  assert(true, 'Keep gives the keys back to that player’s −');
  // ▼ with the keyboard: the keys stay on the moved row's arrow (the other one at the end), so Enter moves it again.
  const unmoved = await rowNames();
  await playersDlg.getByRole('button', { name: 'Move Player 1 down' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^Move Player 1 (down|up)$/.test(document.activeElement?.getAttribute('aria-label') ?? ''));
  const once = await rowNames();
  assert(once !== unmoved, `▼ moves the player, and the keys stay on their arrow (${await ariaFocused()})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((was) => [...document.querySelectorAll('[role="dialog"] input.name')].map((e) => e.value).join() !== was, once);
  assert(/^Move Player 1 (down|up)$/.test(await ariaFocused()), 'and a second Enter moves them again');
  // Removed, the keys go to the next row's −; restored, to theirs.
  await playersDlg.getByRole('button', { name: 'Remove Player 1' }).click();
  await playersDlg.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForFunction(() => !!document.activeElement?.matches('[role="dialog"] button.del, [role="dialog"] button.add'));
  assert(true, `a player removed mid-game: the keys go on from the next row (${await focused()})`);
  await playersDlg.getByRole('button', { name: '↩ Restore' }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Player 1');
  assert(true, 'and ↩ Restore puts them on that player’s −');
  await playersDlg.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Exit/ }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await page.getByRole('button', { name: 'Resume game' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.editor button.play'));
  assert(true, 'leaving the game puts the keys on ▶ Play (not on the page)');
  // (Discard on the line over the editor asks in the app.)
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  const ask = page.getByRole('alertdialog');
  await ask.waitFor();
  assert((await ask.getAttribute('aria-modal')) === 'true', 'an in-app question is aria-modal');
  assert((await ask.innerText()).includes('Its scores and used tiles are deleted') && (await focused()) === 'Keep', 'Discarding a saved game asks in the app, the focus on “Keep”');
  const askFoot = await footer(ask);
  assert(askFoot.visual.join('|') === 'Keep|Discard' && askFoot.dom[0] === 'Keep', `its safe answer is on the left, the answer rightmost (${askFoot.visual.join(' · ')})`);
  assert((await ask.getByRole('heading', { name: /^Discard the saved game .*\?$/ }).count()) === 1, 'and its question is its title');
  await page.keyboard.press('Escape');
  assert((await ask.count()) === 0 && (await page.getByRole('button', { name: 'Resume game' }).isVisible()), 'Esc keeps the saved game');
  assert(dialogs.length === 0, `no browser dialog anywhere (${dialogs.join(' | ')})`);

  // ---------- Reduce motion on stream ----------
  await more.click();
  await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByText('Reduce motion on stream').click();
  assert(await page.evaluate(() => document.documentElement.classList.contains('reduce-stream')), '“Reduce motion on stream” calms the stage');
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();
  const motion = await page.evaluate(() => JSON.parse(localStorage.getItem('jb.prefs')).reduceMotion);
  assert(motion === true, 'and is remembered');

  // ---------- The header at 150% zoom ----------
  await page.setViewportSize({ width: 853, height: 480 });
  await page.waitForTimeout(100);
  const fit = await page.evaluate(() => {
    const h = document.querySelector('header');
    const p = [...h.querySelectorAll('button')].find((b) => b.textContent.includes('Play')).getBoundingClientRect();
    return { over: h.scrollWidth - h.clientWidth, right: p.right };
  });
  assert(fit.over <= 0 && fit.right <= 853, `at 150% zoom (853px) the header fits and ▶ Play shows (${JSON.stringify(fit)})`);

  // ---------- 200% zoom on a laptop (720 CSS px): the header wraps, nothing runs off the side ----------
  await page.setViewportSize({ width: 720, height: 450 });
  await page.waitForTimeout(150);
  const fit720 = await page.evaluate(() => {
    const h = document.querySelector('header');
    const right = Math.max(...[...h.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().right));
    const play = [...h.querySelectorAll('button')].find((b) => b.textContent.includes('Play')).getBoundingClientRect();
    return { over: h.scrollWidth - h.clientWidth, right, page: document.documentElement.scrollWidth, playRight: play.right };
  });
  assert(fit720.over <= 0 && fit720.right <= 720 && fit720.page <= 720 && fit720.playRight <= 720, `at 200% zoom (720px) every header button is on screen and the page doesn’t scroll sideways (${JSON.stringify(fit720)})`);
  // (640×360, as 1280×720 at 200%: the round list, a bar across the top, keeps to 30% of the height and scrolls.)
  await page.setViewportSize({ width: 640, height: 360 });
  const navH = await page.locator('.editor nav').evaluate(async (n) => {
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    return { h: Math.round(n.getBoundingClientRect().height), all: n.scrollHeight };
  });
  assert(navH.h <= 108, `at 200% zoom (640×360) the round list takes at most 30% of the height (${navH.h}px of ${navH.all}px)`);
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---------- The keys after a move, a menu left with Tab, and New ----------
  const saidNow = () => page.evaluate(() => document.getElementById('live-region')?.dataset.said ?? '');
  await page.locator('nav > button.round-tab').first().click();
  assert((await page.getByRole('group', { name: /^Board: arrow keys move between tiles/ }).count()) === 1, 'the board’s tiles are a group whose name says how the keys reach them');
  await page.locator('.cat textarea').first().fill('Animals');
  await page.getByRole('button', { name: 'More for category 1: Animals' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: /Move right/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'More for category 2: Animals');
  assert(true, '⋯ → ▶ Move right: the keys stay on that category’s ⋯ (not the page)');
  await saidHas(/“Animals” moved to column 2 of/);
  assert(true, `and the move is said (“${await saidNow()}”)`);
  await page.keyboard.press('Enter');
  await page.locator('.cm').waitFor();
  await page.keyboard.press('Shift+Tab');
  await page.locator('.cm').waitFor({ state: 'detached' });
  assert((await focused()) === 'More for category 2: Animals', 'Shift+Tab out of an open ⋯ menu closes it, the keys back on its ⋯');
  const nameBox = page.locator('.cat textarea').nth(1);
  await nameBox.focus();
  await page.keyboard.type('!');
  assert((await nameBox.inputValue()) === 'Animals!', 'and typing in a category name works again');
  await page.getByRole('button', { name: /New/ }).first().click();
  const startNew = page.getByRole('dialog', { name: /Start a new game/ }).getByRole('button', { name: 'Start new anyway' });
  await startNew.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!document.activeElement?.matches('.first-round .sample'));
  assert(true, 'New → Start new anyway: the keys go to the new game’s first screen (not the page)');
  await saidHas(/Started a new game/);
  assert(true, `and it’s said (“${await saidNow()}”)`);

  // ---------- Windows High Contrast (forced colors): the selected and pressed states still show ----------
  const fc = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active' });
  const hc = await fc.newPage();
  hc.on('pageerror', (e) => errors.push(`[forced colors] ${e.message}`));
  await hc.goto(pathToFileURL(file).href);
  await addClassicRounds(hc);
  // (And no hover, as on a touch screen: the buttons a row shows when pointed at show anyway, so a tap never presses
  // one unseen. 🕘 History's Go there › here, 📜 Log's ↶ Back to here in play.)
  const noHover = await fc.newCDPSession(hc);
  await noHover.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await hc.locator('nav > button', { hasText: '🕘 History' }).click();
  const goThere = hc.locator('main .list .hr:not(.current) .gobtn').first();
  assert((await goThere.evaluate((b) => getComputedStyle(b).visibility)) === 'visible', 'on a screen without hover, 🕘 History’s Go there › shows on every row');
  await hc.getByRole('button', { name: '🎨 Theme' }).click();
  const outlined = (loc) => loc.evaluate((e) => { const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });
  const chosen = hc.locator('.preset[aria-pressed="true"]');
  const other = hc.locator('.preset[aria-pressed="false"]').first();
  assert((await outlined(chosen)) && !(await outlined(other)), 'with forced colors, the chosen theme preset is outlined (the others aren’t)');
  const swatches = await hc.locator('.preset .sw').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  assert(new Set(swatches).size > 1, `and the preset cards keep their own colors (${swatches.join(' | ')})`);
  await hc.getByRole('button', { name: '▶ Play' }).click();
  await hc.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await hc.getByRole('button', { name: '＋ Add player' }).click();
  await hc.getByRole('button', { name: '＋ Add player' }).click();
  await hc.getByRole('button', { name: 'Start game ▶' }).click();
  await hc.getByRole('button', { name: 'Skip intro' }).click();
  // What viewers see follows the game's theme, not the host's display: a board tile keeps the theme's color.
  const [tileBg, themeBg] = await hc.locator('.stage .tile').first().evaluate((e) => {
    const cs = getComputedStyle(e);
    const c = document.createElement('canvas').getContext('2d');
    const norm = (v) => ((c.fillStyle = '#000'), (c.fillStyle = v), c.fillStyle);
    return [norm(cs.backgroundColor), norm(cs.getPropertyValue('--tile-bg').trim() || cs.getPropertyValue('--tile').trim())];
  });
  assert(tileBg === themeBg, `with forced colors, a board tile on stage keeps the theme's color (${tileBg}, the theme's ${themeBg})`);
  await hc.keyboard.press('1');
  const sel = hc.locator('.panel .p.on');
  assert((await sel.count()) === 1 && (await outlined(sel)) && !(await outlined(hc.locator('.panel .p:not(.on)').first())), 'and a selected player in the host panel is outlined');
  // (Two steps: the older one has ↶ Back to here.)
  for (const who of ['2', '1']) {
    await hc.keyboard.press('p');
    await hc.keyboard.press(who);
  }
  await hc.keyboard.press('l');
  const backHere = hc.locator('aside .item .acts').first();
  assert((await backHere.evaluate((a) => getComputedStyle(a).opacity)) === '1', 'and 📜 Log’s ↶ Back to here shows on its rows');
  await fc.close();

  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log('a11y: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'a11y-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
