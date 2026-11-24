// Editor polish at 1280×720: the first screen, the sidebar and its checklist, board values, category names and tools,
// Daily Doubles, standard dice tiles, wheels and dice made where they're picked, stat presets, RPG doorways and
// characters, the world's menu, one set of ↶ ↷, and the theme's clue text and preview. Also: Enter in a category's
// name, the last clue's Ctrl+Enter, Import clues keeping what was pasted, slice weights, ＋ buttons that put the
// focus on what they add, and a board's six columns fitting a narrower window. Also: an RPG screen pasted into
// another game bringing the items and stats its objects use, and undone where it was pasted. And the sample game's
// sidebar at 1280×720, pages opening at their top, and a round's name on a tablet; its round pages at 1920 (one header
// width; the slide of a slides round, a Final and the tiebreaker filling it, and the clue editor the window), the slide's
// buttons all one size, and the board's two count lines level. And a reload mid-edit coming back on the page, round and
// clue it left.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { appFile, answerReplace, clickExportHtml, editorReady, lineOf, openRules } from './helpers.mjs';

const file = appFile();
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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
const header = page.locator('.editor > header');
const tabs = page.locator('nav > button.round-tab');
const values = (loc) => loc.evaluateAll((els) => els.map((e) => e.value));
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-place') ?? document.activeElement?.tagName);
const note = page.locator('.history-notice');
const toastText = async () => ((await page.locator('.toast').count()) ? await page.locator('.toast').innerText() : '');
/** The focused text box: its label, value, and whether all of it is selected (ready to type over). */
const typingIn = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return { label: a?.getAttribute('aria-label'), value: a?.value, all: !!a?.value && a.selectionStart === 0 && a.selectionEnd === a.value.length };
  });

async function addRound(mode) {
  await page.getByRole('button', { name: '＋ Add round' }).click();
  await page.getByRole('menuitem', { name: mode }).click();
}

try {
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'Open…' }).waitFor();

  // ---------- First screen ----------
  const cards = await page.locator('.first-round .mode').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  assert(cards.length === 5 && cards[0] === cards[1] && cards[1] === cards[2] && cards[3] === cards[4] && cards[2] < cards[3], `the five mode cards sit three, then two (${cards})`);
  assert((await page.locator('main').count()) === 1, 'one main landmark');
  // No checklist yet (the page says what to do), and the first screen fits a laptop: a line saying what the app is,
  // one short line over the cards, and 📂 Open a game… in the window.
  assert((await page.locator('nav .problems').count()) === 0, 'with no rounds the sidebar has no checklist');
  const openBottom = await page.locator('.first-round .open-line').evaluate((e) => e.getBoundingClientRect().bottom);
  assert(openBottom <= 720 && (await page.locator('.first-round > p').count()) === 3, `the first screen has three lines of words and 📂 Open a game… in the window (${openBottom})`);
  const what = page.locator('.first-round > p.what');
  // (At 1280 it shows whole; narrower, it stays one line, cut short, the full words in its tooltip.)
  const whatBox = { ...(await what.evaluate(lineOf)), above: await what.evaluate((e) => !!e.nextElementSibling?.matches('h2')) };
  assert(
    (await what.innerText()).startsWith('🎮 Brainrot Games Maker: build a game show') && (await what.innerText()).includes('Nothing to install.') && whatBox.above && whatBox.lines === 1 && !whatBox.cut && (await what.locator('a').count()) === 0,
    `over “Add your first round”, one line says what the app is, whole (no download link in the file: it's the file) (${JSON.stringify(whatBox)})`,
  );
  await page.setViewportSize({ width: 900, height: 720 });
  const narrowWhat = await what.evaluate(lineOf);
  assert(narrowWhat.lines === 1 && narrowWhat.title.includes('Nothing to install.'), `in a 900 px window it's still one line, its words in full in its tooltip (${JSON.stringify(narrowWhat)})`);
  await page.setViewportSize({ width: 1280, height: 720 });
  // A card a mode, each with at most two templates in it to start from (＋ Add round has them all).
  const starts = await page.locator('.first-round .card').evaluateAll((cs) => cs.map((c) => [...c.querySelectorAll('.from button')].map((b) => b.textContent.trim())));
  assert(
    JSON.stringify(starts) === JSON.stringify([['Quick board, 4 × 3'], [], ['Mini quest', '3 × 3 dungeon'], ['20-space loop', 'Race to the finish'], ['Welcome and rules']]),
    `each mode's card has at most two templates in it (${JSON.stringify(starts)})`,
  );
  // The arrow keys go from card to card: ← / → the one before or after, ↑ / ↓ the row above or below.
  const onCard = () => page.evaluate(() => (document.activeElement?.matches('.first-round .sample') ? '✨' : document.activeElement?.matches('.first-round .mode') ? document.activeElement.querySelector('b')?.textContent : '?'));
  await page.locator('.first-round .sample').focus();
  const went = [];
  for (const key of ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowUp']) {
    await page.keyboard.press(key);
    went.push(await onCard());
  }
  assert(went.join(' › ') === 'Final Jeopardy › RPG › Slides › Board game › Jeopardy board › ✨', `the arrow keys go from card to card (${went.join(' › ')})`);
  // A template there adds its round, as ＋ Add round's does.
  await page.locator('.first-round .card', { hasText: 'RPG' }).getByRole('button', { name: '3 × 3 dungeon' }).click();
  await page.locator('nav > button.round-tab').first().waitFor();
  assert((await page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title')).startsWith('Undo: Added round'), 'a card’s template adds its round, one step');
  await page.keyboard.press('Control+z');
  await page.locator('.first-round').waitFor();
  // A game with no rounds isn't exported: the file couldn't be played (and has no ＋ Add round).
  await clickExportHtml(page);
  await page.locator('.toast', { hasText: 'Add a round first' }).waitFor();
  assert((await page.getByRole('dialog', { name: 'Name your game' }).count()) === 0, 'Export HTML with no rounds says to add one, and exports nothing');

  // ---------- Board values and focus ----------
  assert((await page.locator('.first-round .mode', { hasText: 'Jeopardy board' }).innerText()).includes('📥 Import clues'), 'the Jeopardy board card mentions 📥 Import clues…');
  // A double-click on a card adds its round, and its second click does nothing on the new page (it added a 🤫 card to a
  // Final, a space to a board game).
  const undoTitle = () => page.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  await page.locator('.first-round .mode', { hasText: 'Final Jeopardy' }).dblclick();
  await page.waitForTimeout(300);
  assert((await tabs.count()) === 1 && (await undoTitle()).startsWith('Undo: Added round'), `a double-click on a first-screen card adds that round, and nothing else (${await undoTitle()})`);
  await page.keyboard.press('Control+z');
  await page.locator('.first-round').waitFor();
  await page.locator('.first-round .mode', { hasText: 'Jeopardy board' }).click();
  // The board's 💡 Tips are open the first time it's seen (and closed after that).
  assert(await page.locator('details.tips').first().evaluate((d) => d.open), "the board's 💡 Tips open the first time");
  assert((await page.locator('.cat textarea').first().getAttribute('placeholder')) === 'Type a name, or paste a column of clues', 'an empty category name says a column of clues can be pasted');
  await addRound(/Jeopardy board/);
  assert(
    await page.evaluate(() => { const a = document.activeElement; return a?.hasAttribute('data-round-name') && a.value === 'Double Jeopardy!' && a.selectionEnd - a.selectionStart === a.value.length; }),
    "＋ Add round puts the focus in the new round's name, selected",
  );
  assert(!(await page.locator('details.tips').first().evaluate((d) => d.open)), "…and the board's 💡 Tips are closed from then on (on the next board)");
  await addRound(/Jeopardy board/);
  const vals = () => values(page.locator('.values input[aria-label^="Row"]'));
  assert((await vals()).join() === '400,800,1200,1600,2000', `a third board keeps the second's values (${await vals()})`);
  await tabs.nth(1).click();
  assert((await vals()).join() === '400,800,1200,1600,2000', 'the second board doubles the first');
  await tabs.nth(0).click();

  // ---------- Sidebar ----------
  const order = await page.locator('nav > button, nav > .navlabel').allInnerTexts();
  const at = (re) => order.findIndex((t) => re.test(t));
  // (Off, it reads ＋ Add tiebreaker (optional).)
  assert(at(/tiebreaker/i) === at(/Jeopardy! 3/) + 1 && at(/Add round/) === at(/tiebreaker/i) + 1, `the Tiebreaker comes right after the rounds (${order.join(' | ')})`);
  assert(at(/^Game$/i) > at(/Add round/) && at(/Sounds/) > at(/^Game$/i) && at(/Theme/) > at(/^Game$/i), 'the game-wide tabs have a Game group of their own');
  // At 720 px high the checklist starts folded to its heading, still counting what's left: the sidebar's own tabs stay
  // clear of it, down to 🕘 History.
  const fold = page.locator('nav .problems > button.fold');
  await fold.waitFor();
  const shut = await page.evaluate(() => {
    const p = document.querySelector('nav .problems').getBoundingClientRect();
    const h = [...document.querySelectorAll('nav > button')].find((b) => b.textContent.includes('🕘 History')).getBoundingClientRect();
    return { top: Math.round(p.top), height: Math.round(p.height), history: Math.round(h.bottom), lines: document.querySelectorAll('nav .problem').length };
  });
  assert(
    (await fold.getAttribute('aria-expanded')) === 'false' && /^Checklist · ⚠ \d+( · ℹ \d+)? ▸$/i.test((await fold.innerText()).replace(/\s+/g, ' ').trim()) && shut.height < 40 && shut.history <= shut.top,
    `on a 720-high window the checklist starts folded to its heading (“${await fold.innerText()}”), below 🕘 History (${JSON.stringify(shut)})`,
  );
  await fold.click();
  assert((await fold.getAttribute('aria-expanded')) === 'true' && (await fold.innerText()).trim().endsWith('▾'), 'its heading unfolds it');
  assert((await page.evaluate(() => JSON.parse(localStorage.getItem('jb.prefs')).checklistFolded)) === false, '…and this computer remembers it open');
  // (A third board is “Jeopardy! 3”, a name that can't be read as its place, unlike “Round 3”.)
  await page.locator('nav .problem', { hasText: 'Jeopardy! 3:' }).waitFor();
  const lines = await page.locator('nav .problem').allInnerTexts();
  assert(lines.filter((l) => /^⚠ Jeopardy!:/.test(l)).length === 1 && lines.some((l) => /^⚠ Jeopardy!: 30 clues to finish/.test(l)), `the checklist has one line a round (${lines.join(' | ')})`);
  // (👥 Players & rules ▶ and 📊 Stats & Items (optional) are always listed now: the list may scroll in its own box, by
  // about those two rows at most. The third board's checklist line, “⚠ Jeopardy! 3: 30 clues to finish”, takes two
  // lines as “⚠ Double Jeopardy!: …” does: 72px became 86px when the third board stopped being called “Round 3”.)
  const navOver = await page.locator('nav').evaluate((n) => n.scrollHeight - n.clientHeight);
  assert(navOver <= 88 && (await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)), `with three boards the sidebar fits at 720p, or scrolls in its box by two rows at most (${navOver}px)`);
  // No sidebar label is cut to "…": "(optional)" sits on a small line of its own.
  const cut = await page.locator('nav > button').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent.trim()));
  assert(cut.length === 0, `no sidebar label is cut short (${cut.join(' | ')})`);
  const opt = await page.locator('nav > button.optional .opt').evaluateAll((os) => os.map((o) => getComputedStyle(o).display));
  assert(opt.length === 2 && opt.every((d) => d === 'block'), `“(optional)” goes on a line of its own under ＋ Add tiebreaker and 📊 Stats & Items (${opt})`);
  // The checklist is pinned to the bottom of the sidebar, its heading counting what's left, in view however the
  // sidebar is scrolled; a button Tab reaches isn't hidden under it.
  const pinned = async () =>
    page.locator('nav .problems').evaluate((p) => {
      const r = p.getBoundingClientRect();
      const first = p.querySelector('.problem').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), first: Math.round(first.bottom), head: p.querySelector('.navlabel').textContent };
    });
  for (const to of [0, 9999]) {
    await page.locator('nav').evaluate((n, to) => (n.scrollTop = to), to);
    const at = await pinned();
    assert(at.bottom <= 720 && at.first <= 720 && /^Checklist · ⚠ \d+/.test(at.head), `the checklist's heading and first line stay in view (nav scrolled to ${to}: ${JSON.stringify(at)})`);
  }
  // More of the sidebar under the open checklist: a fade over its foot says so, gone once scrolled to the end.
  const fades = () => page.locator('nav .problems').evaluate((p) => p.classList.contains('below') && getComputedStyle(p, '::before').content !== 'none');
  await page.locator('nav').evaluate((n) => (n.scrollTop = 0));
  await page.waitForFunction(() => document.querySelector('nav .problems.below'));
  assert(await fades(), 'with more of the sidebar below, a fade over its foot says it scrolls');
  await page.locator('nav').evaluate((n) => (n.scrollTop = 9999));
  await page.waitForFunction(() => !document.querySelector('nav .problems.below'));
  assert(!(await fades()), '…and none once it’s scrolled to the end');
  await page.locator('nav').evaluate((n) => (n.scrollTop = 0));
  await page.locator('nav > button', { hasText: '🖼 Media' }).focus();
  await page.keyboard.press('Tab');
  const hist = await page.evaluate(() => { const a = document.activeElement; return { text: a?.textContent.trim(), bottom: Math.round(a.getBoundingClientRect().bottom), check: Math.round(document.querySelector('nav .problems').getBoundingClientRect().top) }; });
  assert(hist.text.startsWith('🕘 History') && hist.bottom <= hist.check, `Tab to 🕘 History scrolls it into view above the pinned checklist (${JSON.stringify(hist)})`);

  // Write the first clue, then the checklist goes to the second one (the first unfinished tile).
  await page.locator('.tile').first().click();
  await page.getByPlaceholder('Type the question…').fill('Q1');
  await page.getByPlaceholder('Type the answer…').fill('A1');
  await page.getByRole('button', { name: 'Done' }).click();
  // A double-click on a tile opens its clue, and its second click doesn't land in there (in the slide's text box
  // settings, where Esc didn't close it): one Esc closes it.
  await page.locator('.tile').first().dblclick();
  const clueWin = page.getByRole('dialog', { name: 'Edit clue' });
  await clueWin.waitFor();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  assert(await clueWin.waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false), 'a double-click on a tile opens its clue, and one Esc closes it (the second click picked nothing in it)');
  await tabs.nth(2).click();
  await page.locator('nav .problem', { hasText: /^⚠ Jeopardy!:/ }).click();
  await page.waitForTimeout(300);
  const tile = await page.evaluate(() => document.activeElement?.getAttribute('data-tile'));
  assert((await tabs.nth(0).getAttribute('class')).includes('active') && tile === '0,1', `a checklist line opens its round at the first unfinished tile (${tile})`);

  // ---------- Categories ----------
  const name = page.locator('.cat textarea').first();
  await name.fill('Famous Memes Of The Early Twenty Tens Internet Era');
  const hidden = await name.evaluate((t) => t.scrollHeight - t.clientHeight);
  assert(hidden <= 1, `a long category name grows its box instead of hiding lines (${hidden}px hidden)`);
  // Every header in the row fills it, as tall as the long one, as on stream (no short blue strip over a dark gap).
  const nameBoxes = () => page.locator('.cat > textarea:not(.sub)').evaluateAll((ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return `${Math.round(r.top)}+${Math.round(r.height)}`; }));
  const even = await nameBoxes();
  assert(new Set(even).size === 1, `the category name boxes are one height when one name is long (${even.join(' ')})`);
  await name.fill('Memes');
  const back = await nameBoxes();
  assert(new Set(back).size === 1 && Number(back[0].split('+')[1]) < Number(even[0].split('+')[1]), `and all shrink back when it is short again (${back.join(' ')} after ${even.join(' ')})`);
  await name.fill('Famous Memes Of The Early Twenty Tens Internet Era');
  const fits = await page.locator('.cat').evaluateAll((cats) => cats.every((c) => c.querySelector('.cat-tools').scrollWidth <= c.clientWidth));
  assert(fits, "each category's tools fit its column at 1280");
  await page.getByRole('button', { name: 'More for category 2' }).click();
  assert(await page.getByRole('menuitem', { name: /Delete category/ }).isVisible(), 'the ⋯ button opens the category menu');
  await page.keyboard.press('Escape');
  await page.getByLabel('Categories').fill('10');
  await page.getByLabel('Categories').press('Tab');
  const sideways = await page.locator('.grid-wrap').evaluate((w) => w.scrollWidth - w.clientWidth);
  assert(sideways <= 1, `ten categories fit across at 1280 (${sideways}px over)`);
  await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  assert((await page.locator('.cat').count()) === 6, 'back to six');
  // Fewer categories: the note names the one that went, when it had only a name of its own.
  await page.locator('[data-cat-name="5"]').fill('Topic F');
  await page.getByLabel('Categories').fill('5');
  await page.getByLabel('Categories').press('Tab');
  const fewer = await page.locator('.history-notice', { hasText: 'to 5 categories' }).innerText();
  assert(fewer.startsWith('Changed round “Jeopardy!” to 5 categories (removed “Topic F”)'), `fewer categories names the one removed (${fewer.split('\n')[0]})`);
  await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  assert((await page.locator('.cat').count()) === 6 && (await page.locator('[data-cat-name="5"]').inputValue()) === 'Category 6', 'Ctrl+Z brings it back, then its old name');
  // A narrower window (a 1024 laptop, half a 1920 screen): the six columns narrow to fit, none runs past the edge.
  for (const w of [1024, 960]) {
    await page.setViewportSize({ width: w, height: 720 });
    await page.waitForFunction(() => document.querySelector('.grid-wrap').scrollWidth - document.querySelector('.grid-wrap').clientWidth <= 1, null, { timeout: 3000 }).catch(() => {});
    const over = await page.locator('.grid-wrap').evaluate((g) => g.scrollWidth - g.clientWidth);
    assert(over <= 1, `six categories fit across a ${w}px window (${over}px over)`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  assert((await page.getByText('Rows (questions per category)').count()) === 1, 'the rows field says rows');
  // Enter in a category's name goes to its top tile (Shift+Enter is a new line); a new line left at its end goes.
  const cat3 = page.locator('[data-cat-name="2"]');
  await cat3.fill('Memes');
  await cat3.press('Enter');
  assert((await page.evaluate(() => document.activeElement?.getAttribute('data-tile'))) === '2,0' && (await cat3.inputValue()) === 'Memes', 'Enter in a category name goes to its top tile, adding no new line');
  await cat3.fill('Memes\n');
  await page.locator('[data-tile="2,1"]').focus();
  assert((await cat3.inputValue()) === 'Memes', 'a new line left at the end of a name goes when the box is left');
  await cat3.focus();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('2');
  assert((await cat3.inputValue()) === 'Memes\n2', 'Shift+Enter starts a second line');
  await cat3.fill('Memes');
  // Ctrl+Enter on the last clue: a note says so (not nothing at all).
  await page.locator('[data-tile="5,4"]').click();
  await page.keyboard.press('Control+Enter');
  assert((await toastText()).includes('last clue'), `Ctrl+Enter on the last clue says it's the last (${await toastText()})`);
  assert(
    (await page.getByRole('button', { name: 'Next ▶' }).count()) === 0 && (await page.getByRole('dialog', { name: 'Edit clue' }).getByRole('button', { name: 'Done' }).innerText()).includes('✓'),
    'on the last clue, Next ▶ becomes Done ✓ (one Done, which closes it)',
  );
  await page.getByRole('button', { name: 'Done' }).click();

  // ---------- Import clues keeps what was pasted ----------
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  const imp = page.getByRole('dialog', { name: 'Import clues' });
  await imp.getByLabel('Clues to import').fill('Science\t200\tH2O is this\tWater\nScience\t400\tCO2 is this\tCarbon dioxide');
  await page.mouse.click(4, 4);
  assert(await imp.isVisible(), 'a click outside Import clues doesn’t close it (nor lose what was pasted)');
  await page.keyboard.press('Escape');
  await imp.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  assert((await imp.getByLabel('Clues to import').inputValue()).startsWith('Science\t200'), 'closed with Esc and opened again, what was pasted is still there');
  await imp.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  assert((await imp.getByLabel('Clues to import').inputValue()).startsWith('Science\t200'), 'and after Cancel');
  await imp.getByRole('button', { name: /^Import \d+ clue/ }).click();
  await note.waitFor();
  const imported = await note.innerText();
  assert(/Imported \d+ clues? into round “Jeopardy!”/.test(imported) && !imported.includes('Row values') && !(await toastText()).includes('Imported'), `importing says so once, at the board (${imported.replace(/\n/g, ' ')})`);
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: '📥 Import clues…' }).click();
  assert((await imp.getByLabel('Clues to import').inputValue()) === '', 'once imported, the box starts empty');
  await page.keyboard.press('Escape');

  // ---------- Row values and Daily Doubles ----------
  const row1 = page.getByLabel('Row 1 value');
  await row1.fill('');
  await row1.press('Tab');
  assert((await row1.inputValue()) === '200' && (await page.locator('.tile .val').first().innerText()).startsWith('$200'), 'a row value left blank keeps its value');
  // Whole points, 0 or more (like a clue's own value).
  await row1.fill('-100');
  await row1.press('Tab');
  const neg = await page.locator('.tile .val').first().innerText();
  assert(neg.startsWith('$0') && (await row1.inputValue()) === '0', `a row value can't be negative (${neg})`);
  await row1.fill('250.6');
  await row1.press('Tab');
  assert((await row1.inputValue()) === '251', 'a row value is whole points');
  await row1.fill('200');
  await row1.press('Tab');
  // A mouse wheel over a number box with the keys scrolls the page; it never changes the number (nor deletes rows).
  await page.evaluate(() => ((window.__wheels = 0), addEventListener('wheel', () => window.__wheels++, { passive: true })));
  let wheels = 0;
  for (const box of [row1, page.getByLabel('Rows (questions per category)')]) {
    await box.click();
    const r = await box.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    // (Each tick handled before the next: a change the wheel made would be in the box by then.)
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForFunction((n) => window.__wheels > n, wheels++);
    }
    await page.evaluate(() => document.activeElement?.blur());
  }
  assert(
    (await vals()).join() === '200,400,600,800,1000' && (await page.locator('.tile .val').first().innerText()).startsWith('$200'),
    `a mouse wheel over a focused number box leaves it as it was (${await vals()})`,
  );
  const dd = page.getByLabel('How many Daily Doubles');
  const ddGroup = page.getByRole('group', { name: '⭐ Daily Doubles' });
  await dd.fill('50');
  await dd.press('Tab');
  const ddHint = await ddGroup.locator('.hint').innerText();
  assert(ddHint === '0 on the board · Start places 6 at random (one a category, 6 at most)', `the hint says what Start places, one a category (${ddHint})`);
  await ddGroup.getByRole('button', { name: '🔀 Randomize' }).click();
  const placed = await page.locator('.tile .dd', { hasText: 'DD' }).count();
  assert(placed === 6 && (await dd.inputValue()) === '6', `Daily Doubles are clamped and the box says how many were placed (${placed}, ${await dd.inputValue()})`);
  await page.locator('.toast', { hasText: 'Daily Doubles' }).waitFor();
  assert((await toastText()) === 'Placed 6 of 10 Daily Doubles: one a category', `and the note says why there are fewer (${await toastText()})`);
  await dd.fill('0');
  await dd.press('Tab');
  assert(await ddGroup.getByRole('button', { name: '🔀 Randomize' }).isDisabled(), '🔀 Randomize is greyed at 0 Daily Doubles');
  await dd.fill('6');
  await dd.press('Tab');

  // ---------- Standard dice and new wheels from a tile ----------
  await page.locator('.tile').nth(2).click();
  await page.getByLabel('Type').selectOption('dice');
  const diceOpts = await page.getByLabel('Which dice').locator('option').allInnerTexts();
  assert(diceOpts.some((o) => o.includes('2d6')) && diceOpts.some((o) => o.includes('Add dice')), `a dice tile can use standard dice (${diceOpts.join(', ')})`);
  await page.getByLabel('Which dice').selectOption({ label: '🎲 2d6' });
  await page.getByLabel('Type').selectOption('wheel');
  await page.getByLabel('Which wheel').selectOption({ label: '＋ Add wheel…' });
  const pop = page.getByRole('dialog', { name: 'Wheel' });
  await pop.waitFor();
  await pop.getByLabel('Wheel name').fill('Spicy Wheel');
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });
  assert(await page.getByRole('dialog', { name: 'Edit clue' }).isVisible(), 'Esc closes the new wheel and leaves the clue open');
  const picked = await page.getByLabel('Which wheel').evaluate((s) => s.selectedOptions[0].text);
  assert(picked === 'Spicy Wheel', `the new wheel is the tile's wheel (${picked})`);
  await page.getByRole('button', { name: '✎ Edit wheel' }).click();
  await pop.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Type').selectOption('dice');
  // ＋ Add dice… undone, and redone, stays on the clue it was made from (not the Wheels, Dice & Deals tab).
  const clueBox = page.getByRole('dialog', { name: 'Edit clue' });
  const whichDice = page.getByLabel('Which dice');
  const diceShows = (t) => whichDice.locator('option:checked', { hasText: t }).waitFor({ state: 'attached', timeout: 3000 }).then(() => true, () => false);
  const diceWas = await whichDice.evaluate((s) => s.selectedOptions[0].text);
  await whichDice.selectOption({ label: '＋ Add dice…' });
  const newDice = page.getByRole('dialog', { name: 'Dice' });
  await newDice.waitFor();
  await page.keyboard.press('Escape');
  await newDice.waitFor({ state: 'detached' });
  const diceMade = await whichDice.evaluate((s) => s.selectedOptions[0].text);
  await clueBox.locator('header .value').click();
  await page.keyboard.press('Control+z');
  assert((await diceShows(diceWas)) && (await clueBox.isVisible()), `Ctrl+Z of ＋ Add dice… keeps the clue open (back on ${diceWas})`);
  await page.keyboard.press('Control+y');
  assert((await diceShows(diceMade)) && (await clueBox.isVisible()), `and so does Ctrl+Y (on ${diceMade} again)`);
  // (Undone again: the board game's ＋ Add dice… below makes the game's first dice.)
  await page.keyboard.press('Control+z');
  await diceShows(diceWas);
  await whichDice.selectOption({ label: '🎲 2d6' });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(800);
  assert(!(await page.locator('nav .problem').allInnerTexts()).some((l) => l.includes('wheel/dice')), 'a tile with standard dice is not a problem');
  // The board's tiles say what the clue editor and the checklist do: a dice tile with its dice warns of nothing (its
  // question is optional), a wheel tile with no wheel says so, and a tile's name says its type and what its badges show.
  const diceTile = page.locator('.tile').nth(2);
  const tileLabel = (t) => t.getAttribute('aria-label');
  assert((await diceTile.locator('.missing').count()) === 0 && /, dice tile: no question$/.test(await tileLabel(diceTile)), `a dice tile with its dice warns of nothing (${await tileLabel(diceTile)})`);
  const wheelTile = page.locator('.tile').nth(3);
  await wheelTile.click();
  await page.getByLabel('Type').selectOption('wheel');
  await page.getByPlaceholder('Type the question…').fill('Spin it');
  await page.getByRole('button', { name: 'Done' }).click();
  assert(
    (await wheelTile.locator('.missing').allInnerTexts()).join() === 'No wheel chosen' && /, wheel tile: Spin it, no wheel chosen$/.test(await tileLabel(wheelTile)),
    `a wheel tile with no wheel says so (${await tileLabel(wheelTile)})`,
  );
  const everyoneTile = page.locator('.tile').nth(4);
  await everyoneTile.click();
  await page.getByLabel('Type').selectOption('standard');
  await page.getByLabel(/Everyone answers/).check();
  await page.getByLabel('Tile shows').fill('MYSTERY');
  await page.getByRole('button', { name: 'Done' }).click();
  assert(
    (await everyoneTile.locator('.dd', { hasText: '✍' }).count()) === 1 && (await everyoneTile.innerText()).includes('“MYSTERY”') && (await tileLabel(everyoneTile)).includes(', everyone answers, tile shows “MYSTERY”: '),
    `a ✍ Everyone answers tile shows ✍ and what the tile shows (${await tileLabel(everyoneTile)})`,
  );
  const ddTile = page.locator('.tile', { has: page.locator('.dd', { hasText: 'DD' }) }).first();
  assert((await tileLabel(ddTile)).includes(', Daily Double: '), `a Daily Double's name says so (${await tileLabel(ddTile)})`);
  await page.getByRole('button', { name: '🎡 Wheels, Dice & Deals' }).click();
  assert(await page.getByRole('button', { name: 'Spicy Wheel' }).isVisible(), 'and the wheel made there is in Wheels, Dice & Deals');
  // A slice's weight: named after its slice, and never 0 or less (the slice would drop off the wheel).
  await page.getByRole('button', { name: 'Spicy Wheel' }).click();
  const weight = page.getByLabel('Option 1 weight');
  await weight.fill('0');
  await weight.press('Tab');
  assert((await weight.inputValue()) === '0.1', `a weight of 0 is the least a slice can have (${await weight.inputValue()})`);
  await weight.fill('');
  await weight.press('Tab');
  assert((await weight.inputValue()) === '1', 'a blank weight is 1');
  await weight.fill('-3');
  await weight.press('Tab');
  assert((await weight.inputValue()) === '0.1', 'and a negative one the least');
  assert((await page.locator('main main').count()) === 0 && (await page.locator('main').count()) === 1, 'no main inside main');

  // ---------- Board game: Move by a new dice ----------
  await addRound(/Board game/);
  await page.getByLabel('Move by').selectOption({ label: '＋ Add dice…' });
  const dpop = page.getByRole('dialog', { name: 'Dice' });
  await dpop.waitFor();
  await dpop.getByRole('button', { name: 'Done' }).click();
  assert((await page.getByLabel('Dice', { exact: true }).inputValue()) === 'Dice 1', 'Move by ＋ Add dice… makes dice and moves by them');
  await page.getByRole('button', { name: /Board backdrop/ }).click();
  assert((await page.locator('.se').getByRole('button', { name: 'Undo (Ctrl+Z)' }).count()) === 0, "the board game's backdrop editor has no ↶ of its own (the header has it)");

  // ---------- Stat presets ----------
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  assert(await page.getByRole('button', { name: /HP \(bar/ }).isDisabled(), 'a stat preset can only be added once');
  const hp = await typingIn();
  assert(hp.label === 'Stat name' && hp.value === 'HP' && hp.all, `a stat preset puts the typing in its name (${JSON.stringify(hp)})`);

  // ---------- RPG: doorways and characters ----------
  await addRound(/RPG/);
  // (The world's settings wait under ▸ Advanced.)
  await page.locator('summary', { hasText: 'Advanced: carry this adventure into another round' }).click();
  await page.getByRole('button', { name: 'More for this world' }).click();
  assert(await page.getByRole('menuitem', { name: /Delete world/ }).isVisible(), 'Delete world is in the world\'s ⋯ menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add a screen at column 2, row 1' }).click();
  await page.getByRole('button', { name: 'Screen Start' }).click();
  await page.getByRole('button', { name: '✎ Edit screen' }).click();
  await page.getByRole('button', { name: '🚪 Doorway' }).click();
  assert((await page.getByLabel('Object class').inputValue()) === 'doorway', 'the 🚪 Doorway button places a doorway');
  assert(await page.getByLabel('Leads to: screen').evaluate((s) => s === document.activeElement), 'and its screen list has the focus');
  await page.getByLabel('Leads to: screen').selectOption({ label: 'Screen B1' });
  // 📦 Item ▾ with no items yet: make one here, or go to 📊 Stats & Items.
  await page.getByRole('button', { name: '📦 Item ▾' }).click();
  const itemMenu = await page.getByRole('menu').getByRole('menuitem').allInnerTexts();
  assert(itemMenu.some((t) => t.includes('Add new item here')) && itemMenu.some((t) => t.includes('Stats & Items')), `📦 Item ▾ with no items offers to make one (${itemMenu.join(', ')})`);
  await page.getByRole('menu').getByRole('menuitem', { name: /Add new item here/ }).click();
  assert(
    (await page.getByLabel('Object class').inputValue()) === 'item' && (await page.getByLabel('Item', { exact: true }).evaluate((s) => s.selectedOptions[0].text)) === 'Item 1',
    'which puts a new catalog item on the screen',
  );
  await page.getByRole('button', { name: '🧙 Character' }).click();
  assert((await page.getByLabel('Object class').inputValue()) === 'npc', 'the 🧙 Character button places a character');
  const npcName = await typingIn();
  assert(npcName.value === 'Character' && npcName.all, `with its name ready to type over (${JSON.stringify(npcName)})`);
  await page.getByRole('button', { name: '＋ Add stat (power, HP…)' }).click();
  const npcStat = await typingIn();
  assert(npcStat.label === 'Stat name' && npcStat.all, 'its ＋ Stat puts the typing in the stat’s name');
  await page.getByRole('button', { name: 'Delete stat', exact: true }).click();
  assert((await note.innerText()).includes('Deleted stat “Power” of “Character”'), 'deleting its stat says so, with Undo');
  await page.getByRole('button', { name: '＋ Add dialogue slide' }).click();
  await page.getByRole('dialog', { name: /Dialogue slide/ }).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Delete dialogue' }).click();
  assert((await note.innerText()).includes('Deleted the dialogue slide of “Character”'), 'and so does deleting its dialogue slide');
  await note.getByRole('button', { name: '↶ Undo' }).click();
  assert((await page.getByRole('button', { name: 'Edit dialogue slide…' }).count()) === 1, 'whose Undo brings it back');
  // Changing its class (one arrow key on the select does it) throws the dialogue away: that says so too, with Undo.
  await page.getByLabel('Object class').selectOption('shop');
  await note.filter({ hasText: 'Character: now Shop (removed its dialogue slide)' }).waitFor();
  await note.getByRole('button', { name: '↶ Undo' }).click();
  await page.getByRole('button', { name: 'Edit dialogue slide…' }).waitFor();
  assert((await page.getByLabel('Object class').inputValue()) === 'npc', 'a class change that drops the dialogue says so, and Undo brings both back');
  await page.getByRole('button', { name: '◀ Back to the map' }).click();
  // A map renamed on its tab, then the round's name box clicked: the typing goes there, not to the tab.
  const mapTab = page.getByRole('tablist', { name: 'Maps' }).getByRole('tab');
  await mapTab.first().dblclick();
  await page.getByLabel('Map name').fill('Overland');
  const roundNameBox = page.locator('main [data-round-name]');
  await roundNameBox.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.waitForFunction(() => document.activeElement?.matches('main [data-round-name]') && document.activeElement.value.endsWith('!'));
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => !document.querySelector('main [data-round-name]')?.value.endsWith('!'));
  assert((await mapTab.first().innerText()).includes('Overland'), 'a map renamed on its tab, then the round’s name box clicked: the typing and Backspace go there');

  // ---------- ＋ Add item and ＋ Add shop put the typing in the new one's name ----------
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: '＋ Add item' }).click();
  const item = await typingIn();
  assert(item.label === 'Item name' && item.value === 'Item 2' && item.all, `＋ Add item puts the typing in its name (${JSON.stringify(item)})`);
  await page.getByRole('button', { name: '＋ Add shop' }).click();
  const shop = await typingIn();
  assert(shop.label === 'Shop name' && shop.value === 'Shop 1' && shop.all, `＋ Add shop too (${JSON.stringify(shop)})`);

  // ---------- Pre-game: 📋 Game rules ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  const rules = await openRules(page);
  const boxes = await rules.locator('.check input[type=checkbox]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  assert(boxes.length > 3 && new Set(boxes).size === 1, `every checkbox in 📋 Game rules is the same size (${boxes})`);
  await page.getByRole('button', { name: '◀ Back to editor' }).click();

  // ---------- Theme: clue text and preview ----------
  await tabs.nth(0).click();
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  const prev = await page.getByLabel('Preview', { exact: true }).evaluate((s) => s.selectedOptions[0].text);
  assert(prev.includes('Jeopardy!'), `the preview starts on the round last open (${prev})`);
  await page.getByLabel('Preview', { exact: true }).selectOption({ label: '❓ A clue' });
  await page.getByLabel('Clue text font').selectOption({ label: 'Bangers (comic)' });
  await page.locator('nav > button.round-tab').first().click();
  await page.locator('.tile').first().click();
  const editorFont = await page.locator('.modal .se .canvas').evaluate((c) => [...c.querySelectorAll('*')].map((e) => getComputedStyle(e).fontFamily).find((f) => f.includes('Bangers')) ?? '');
  assert(editorFont.includes('Bangers'), `the clue text font changes the clues' text (${editorFont})`);
  // Its text box deleted, then the question typed again in the Question box: the new text box is on top of the rest (it
  // went under them), in the clue text font (it came back in a new text box's).
  const se = page.locator('.modal .se');
  await se.getByRole('button', { name: /◼ Shape/ }).click();
  await page.getByRole('button', { name: '▭ Rectangle' }).click();
  await se.locator('.layers-box .row').filter({ hasNotText: 'Rectangle' }).locator('.name').click();
  await page.keyboard.press('Delete');
  await page.locator('.modal [data-field="q"]').fill('Back on top');
  const items = await se.locator('.canvas .slide .el').evaluateAll((els) =>
    els.map((e) => ({ text: !!e.querySelector('.text'), z: Number(e.style.zIndex), font: e.querySelector('.text') ? getComputedStyle(e.querySelector('.text')).fontFamily : '' })),
  );
  const retyped = items.find((e) => e.text);
  const shape = items.find((e) => !e.text);
  assert(items.length === 2 && retyped.z > shape.z && retyped.font.includes('Bangers'), `the question typed again goes on top, in the clue text font (${JSON.stringify(items)})`);
  await page.getByRole('button', { name: 'Done' }).click();

  // ---------- A copy of a copy is "(copy 2)", not "(copy) (copy)" ----------
  await tabs.nth(0).focus();
  await page.keyboard.press('Control+d');
  await page.waitForFunction(() => document.activeElement?.matches('nav > button.round-tab') && document.activeElement.textContent.includes('(copy)'));
  await page.keyboard.press('Control+d');
  const roundNames = (await tabs.allInnerTexts()).map((t) => t.replace(/^\S+\s/, '').trim());
  assert(roundNames.some((n) => n.endsWith('(copy 2)')) && !roundNames.some((n) => n.includes('(copy) (copy)')), `duplicating a copy numbers it on (${roundNames.join(', ')})`);

  // ---------- A game with only a title and a theme counts: New asks, and keeps it in Recent games ----------
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await page.locator('.data-notice').waitFor();
  const title = header.getByLabel('Game title');
  await title.fill('Only a title and a theme');
  await title.press('Enter');
  await page.getByRole('button', { name: '🎨 Theme' }).click();
  await page.locator('input[type=color]').first().evaluate((el) => {
    el.value = '#123456';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await page.locator('.data-notice', { hasText: '“Only a title and a theme” was replaced.' }).waitFor();
  assert(true, 'New asks before replacing a game with only a title and theme changes, and keeps it in Recent games');

  // ---------- An RPG screen pasted into another game brings the items and stats its objects use ----------
  await page.getByRole('button', { name: /Try a sample game/ }).click();
  await tabs.filter({ hasText: 'Adventure' }).click();
  await page.getByRole('button', { name: 'Screen Forest' }).click();
  await page.keyboard.press('Control+c');
  await page.locator('.toast', { hasText: 'Copied Forest' }).waitFor();
  // (The sample as it came, a screen only selected and copied: New asks nothing, and keeps it in Recent games.)
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.locator('.data-notice', { hasText: '“Sample game” was replaced.' }).waitFor();
  await editorReady(page);
  await page.locator('.first-round .mode', { hasText: 'RPG' }).click();
  // (A game with a stat already: the ones the screen brings are added to it.)
  await page.getByRole('button', { name: '📊 Stats & Items' }).click();
  await page.getByRole('button', { name: /HP \(bar/ }).click();
  const adventure = tabs.filter({ hasText: 'Adventure' });
  await adventure.click();
  const cell = page.getByRole('button', { name: 'Add a screen at column 2, row 1' });
  await cell.focus();
  await page.keyboard.press('Control+v');
  const forest = page.getByRole('button', { name: 'Screen Forest' });
  await forest.waitFor();
  // Undone and redone, it shows on the map it was pasted on (not on 📊 Stats & Items with what it brought).
  const onMap = async (shown) => (await adventure.getAttribute('aria-current')) === 'page' && (await shown.isVisible());
  await page.keyboard.press('Control+z');
  await forest.waitFor({ state: 'detached' });
  assert(await onMap(cell), 'Ctrl+Z of a screen pasted with its stats and items stays on the map');
  await page.keyboard.press('Control+y');
  await forest.waitFor();
  assert(await onMap(forest), 'Ctrl+Y of it stays on the map too');
  await forest.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '◀ Back to the map' }).waitFor();
  const picks = [];
  for (const name of ['Potion', 'Gold coins']) {
    await page.locator('.layers-box .row').filter({ hasText: name }).locator('.name').click();
    picks.push((await page.locator('.insp select').evaluateAll((els) => els.map((e) => e.selectedOptions[0]?.textContent?.trim()))).join(', '));
  }
  assert(picks[0].includes('Potion') && picks[1].includes('Gold') && !picks.join().includes('Deleted'), `a screen pasted into another game keeps its Potion and Gold (${picks.join(' | ')})`);

  // ---------- The sample game: its sidebar, scrolling and a round's name on a tablet ----------
  // (On a page of its own: no notice over the editor.) With the sample's five rounds the sidebar fits at 1280×720,
  // 🕘 History whole above the checklist.
  {
    const sp = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    sp.on('pageerror', (e) => errors.push(e.message));
    await sp.goto(pathToFileURL(file).href);
    await sp.getByRole('button', { name: /Try a sample game/ }).click();
    // (Once the checklist has caught up with the sample's rounds.)
    await sp.locator('nav .problem', { hasText: 'No rounds yet' }).waitFor({ state: 'detached' });
    const side = await sp.locator('nav').first().evaluate((n) => ({
      over: n.scrollHeight - n.clientHeight,
      history: [...n.querySelectorAll(':scope > button')].at(-1).getBoundingClientRect().bottom,
      check: n.querySelector('.problems').getBoundingClientRect().top,
    }));
    assert(side.over <= 0 && side.history <= side.check, `the sample game's sidebar fits at 1280×720, History above the checklist (${JSON.stringify(side)})`);
    // A page picked in the sidebar opens at its top, not as far down as the last one was scrolled.
    const mainEl = sp.locator('main');
    await sp.getByRole('button', { name: '🔊 Sounds' }).click();
    await mainEl.evaluate((m) => (m.scrollTop = m.scrollHeight));
    const scrolled = await mainEl.evaluate((m) => m.scrollTop);
    await sp.getByRole('button', { name: '🎨 Theme' }).click();
    const onTheme = await mainEl.evaluate((m) => m.scrollTop);
    await mainEl.evaluate((m) => (m.scrollTop = m.scrollHeight));
    await sp.locator('nav > button.round-tab').filter({ hasText: /^\W*Jeopardy!$/ }).click();
    const onRound = await mainEl.evaluate((m) => m.scrollTop);
    assert(scrolled > 100 && onTheme === 0 && onRound === 0, `🎨 Theme and a round's tab open at the top after a page scrolled down (${scrolled} → ${onTheme}, ${onRound})`);
    // So does a round just added.
    await mainEl.evaluate((m) => (m.scrollTop = m.scrollHeight));
    await sp.getByRole('button', { name: '＋ Add round' }).click();
    await sp.getByRole('menuitem', { name: /Jeopardy board/ }).click();
    await sp.locator('nav > button.round-tab', { hasText: 'Double Jeopardy!' }).waitFor();
    const onAdded = await mainEl.evaluate((m) => m.scrollTop);
    assert(onAdded === 0, `a round just added opens at the top too (${onAdded})`);
    await sp.keyboard.press('Control+z');
    await sp.locator('nav > button.round-tab', { hasText: 'Double Jeopardy!' }).waitFor({ state: 'detached' });
    await sp.locator('nav > button.round-tab').filter({ hasText: /^\W*Jeopardy!$/ }).click();
    // And a round pasted with Ctrl+V on its tab, as the menu's 📋 Paste round does.
    const tabs = sp.locator('nav > button.round-tab');
    const before = await tabs.count();
    await mainEl.evaluate((m) => (m.scrollTop = m.scrollHeight));
    await tabs.filter({ hasText: /^\W*Jeopardy!$/ }).focus();
    await sp.keyboard.press('Control+c');
    await sp.keyboard.press('Control+v');
    await sp.waitForFunction((n) => document.querySelectorAll('nav > button.round-tab').length === n + 1, before);
    const onPasted = await mainEl.evaluate((m) => m.scrollTop);
    assert(onPasted === 0, `a round pasted with Ctrl+V opens at the top (${onPasted})`);
    await sp.keyboard.press('Control+z');
    await sp.waitForFunction((n) => document.querySelectorAll('nav > button.round-tab').length === n, before);
    await tabs.filter({ hasText: /^\W*Jeopardy!$/ }).click();
    // A round's name keeps its width on a tablet (the sidebar beside it): its buttons go under it where both don't fit.
    for (const width of [720, 760, 820, 900, 1280]) {
      await sp.setViewportSize({ width, height: 720 });
      const h = await sp.locator('main .page-header').first().evaluate((el) => {
        const h2 = el.querySelector('h2');
        const t = el.querySelector('.titles').getBoundingClientRect();
        const a = el.querySelector('.actions').getBoundingClientRect();
        const main = el.closest('main');
        return { cut: h2.scrollWidth - h2.clientWidth, width: Math.round(t.width), under: a.top >= t.bottom, beside: Math.round(a.top) === Math.round(t.top), wide: main.scrollWidth - main.clientWidth };
      });
      assert(h.cut <= 0 && h.width >= 200 && h.wide <= 0 && (width === 1280 ? h.beside : h.under), `at ${width} px wide the round's name shows whole, its buttons ${width === 1280 ? 'beside' : 'under'} it (${JSON.stringify(h)})`);
    }
    await sp.context().close();
  }

  // ---------- The sample's round pages: one header width, a slides round's slide, level hints, the slide's buttons ----------
  {
    const wp = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    wp.on('pageerror', (e) => errors.push(e.message));
    await wp.goto(pathToFileURL(file).href);
    await wp.getByRole('button', { name: /Try a sample game/ }).click();
    const roundTab = (name) => wp.locator('nav > button.round-tab').filter({ hasText: name }).first();
    // At 1920 a round's buttons stay put from tab to tab: its header is one width on every round's page.
    const edges = [];
    for (const name of [/Introduction/, /^\W*Jeopardy!$/, /Adventure/, /Board game/, /Final Jeopardy!/]) {
      await roundTab(name).click();
      const del = await wp.getByRole('button', { name: '🗑 Delete round' }).boundingBox();
      edges.push(Math.round(del.x + del.width));
    }
    assert(new Set(edges).size === 1 && edges[0] > 1800, `at 1920 🗑 Delete round is in one place on every round's page (right edges ${edges.join(', ')})`);
    // A slides round's slide fills the width, as a board does; its Round name and Host notes stay at the readable width.
    await roundTab(/Introduction/).click();
    const slides = await wp.evaluate(() => {
      const main = document.querySelector('main');
      const r = (el) => el.getBoundingClientRect();
      return {
        head: r(main.querySelector('.page-header')).right,
        editor: r(main.querySelector('.se')).right,
        canvas: Math.round(r(main.querySelector('.se .canvas')).width),
        fields: r(main.querySelector('[data-field="round-notes"]')).right - r(main.querySelector('[data-round-name]')).left,
        scroll: main.scrollHeight - main.clientHeight,
      };
    });
    assert(
      Math.abs(slides.editor - slides.head) <= 2 && slides.canvas > 1000 && slides.fields <= 1200 && slides.scroll <= 0,
      `at 1920 a slides round's slide editor reaches the header's right edge, its fields stay at the readable width, and the whole slide shows (${JSON.stringify(slides)})`,
    );
    // Lines typed above the slide shrink it to fit (still all in sight), and it grows back when they go.
    const fit = () => wp.evaluate(() => ({ canvas: Math.round(document.querySelector('main .se .canvas').getBoundingClientRect().width), scroll: document.querySelector('main').scrollHeight - document.querySelector('main').clientHeight }));
    await wp.locator('[data-field="round-notes"]').fill('one\ntwo\nthree\nfour');
    await wp.locator('main [data-field="q"]').fill('Welcome to the sample game!\n2\n3\n4\n5\n6');
    await wp.waitForTimeout(200);
    const typed = await fit();
    await wp.locator('[data-field="round-notes"]').fill('');
    await wp.locator('main [data-field="q"]').fill('Welcome to the sample game!');
    await wp.waitForTimeout(200);
    const cleared = await fit();
    assert(typed.scroll <= 0 && typed.canvas < slides.canvas - 50 && cleared.canvas === slides.canvas && cleared.scroll <= 0, `lines typed above a slides round's slide shrink it to stay in sight, and it grows back (${slides.canvas} → ${typed.canvas} → ${cleared.canvas})`);
    // The Final's slide fills the width as a slides round's does, all in sight; its form stays at the readable width.
    await roundTab(/Final Jeopardy!/).click();
    const page = (fieldsSel = '.grid, .quick') =>
      wp.evaluate((fieldsSel) => {
        const main = document.querySelector('main');
        const r = (el) => el.getBoundingClientRect();
        return {
          head: Math.round(r(main.querySelector('.page-header')).right),
          editor: Math.round(r(main.querySelector('.se')).right),
          canvas: Math.round(r(main.querySelector('.se .canvas')).width),
          fields: Math.round(Math.max(...[...main.querySelectorAll(fieldsSel)].filter((el) => !el.closest('.se')).map((el) => r(el).right)) - r(main.querySelector('.se')).left),
          scroll: main.scrollHeight - main.clientHeight,
        };
      }, fieldsSel);
    const final = await page();
    assert(
      Math.abs(final.editor - final.head) <= 2 && final.canvas > 1000 && final.scroll <= 0 && final.fields <= 1200,
      `at 1920 the Final's slide editor reaches the header's right edge and the whole slide shows; its form keeps the readable width (${JSON.stringify(final)})`,
    );
    await wp.locator('main [data-field="round-notes"]').fill('one\ntwo\nthree\nfour');
    await wp.waitForTimeout(200);
    const finalTyped = await page();
    assert(finalTyped.canvas < final.canvas - 20 && finalTyped.scroll <= 0, `lines typed in its Host notes shrink it to stay in sight (${final.canvas} → ${finalTyped.canvas})`);
    await wp.locator('main [data-field="round-notes"]').fill('');
    // The tiebreaker's too, under its fields at the readable width.
    await wp.locator('nav button', { hasText: 'Add tiebreaker' }).click();
    await wp.locator('main [data-field="q"]').waitFor();
    const tb = await page('.page-header, .quick');
    assert(
      Math.abs(tb.editor - slides.head) <= 2 && tb.canvas > 1000 && tb.scroll <= 0 && tb.fields <= 1200,
      `at 1920 the tiebreaker's slide editor fills the width too, its header and fields at the readable width (${JSON.stringify(tb)})`,
    );
    await roundTab(/Final Jeopardy!/).click();
    // ＋ Add slide and ＋ 🤫 Card are the same small button as the rest of the slide's group.
    const look = (b) => {
      const s = getComputedStyle(b);
      return [Math.round(b.getBoundingClientRect().height), s.fontSize, s.opacity, s.borderRadius, s.paddingTop, s.paddingLeft].join(' ');
    };
    const slideButtons = (where) =>
      wp.evaluate(
        ([f, where]) => {
          const look = new Function(`return ${f}`)();
          const g = document.querySelector(`${where} .tabs .group`);
          const bs = [...g.closest('.tabs').querySelectorAll('.add'), ...g.querySelectorAll(':scope > button:not(.add):not(:disabled)')];
          return bs.map((b) => `${b.textContent.trim()}: ${look(b)}`);
        },
        [look.toString(), where],
      );
    const oneLook = (group) => group.some((l) => l.startsWith('＋ 🤫 Card')) && group.some((l) => l.startsWith('＋ Add slide')) && new Set(group.map((l) => l.split(': ')[1])).size === 1;
    const group = await slideButtons('main');
    assert(oneLook(group), `the Final's slide buttons are one small button, ＋ Add slide and ＋ 🤫 Card too (${group.join(' | ')})`);
    // The same in the clue editor.
    await roundTab(/^\W*Jeopardy!$/).click();
    await wp.locator('.grid .tile').first().click();
    const clueDlg = wp.getByRole('dialog', { name: 'Edit clue' });
    await clueDlg.waitFor();
    const clueGroup = await slideButtons('[role="dialog"]');
    assert(oneLook(clueGroup), `the clue editor's slide buttons are one small button, ＋ Add slide and ＋ 🤫 Card too (${clueGroup.join(' | ')})`);
    // Its window takes the whole width, as a slides round's slide does the page's.
    const clueRight = await clueDlg.evaluate((d) => Math.round(innerWidth - d.getBoundingClientRect().right));
    assert(clueRight <= 20, `at 1920 the clue editor takes the window's width (${clueRight}px to spare at its right)`);
    await wp.keyboard.press('Escape');
    await clueDlg.waitFor({ state: 'detached' });
    // At laptop widths Partner clues' selects take a second line: the two blocks' "… on the board" lines stay level.
    await roundTab(/^\W*Jeopardy!$/).click();
    for (const [w, h] of [[1280, 720], [1366, 768]]) {
      await wp.setViewportSize({ width: w, height: h });
      const hints = await wp.evaluate(() => {
        const [dd, pt] = [...document.querySelectorAll('main .values .extras .group')];
        const r = (el) => Math.round(el.getBoundingClientRect().top);
        return { dd: r(dd.querySelector('.hint')), pt: r(pt.querySelector('.hint')), wrapped: r(pt.querySelector('select:last-of-type')) > r(pt.querySelector('input')) + 10, ddText: dd.querySelector('.hint').textContent, ptText: pt.querySelector('.hint').textContent };
      });
      assert(hints.dd === hints.pt && hints.wrapped && /on the board/.test(hints.ddText) && /on the board/.test(hints.ptText), `at ${w}×${h} the ⭐ Daily Doubles and 🤝 Partner clues lines are level, with Partner clues' 🤫 Card on a second line (${JSON.stringify(hints)})`);
    }
    // On a laptop the Final's settings leave its slide little room in sight: it keeps its size at the readable width
    // (the page scrolls to it), never shrunk to fit.
    await wp.setViewportSize({ width: 1280, height: 720 });
    await roundTab(/Final Jeopardy!/).click();
    const laptop = await page();
    assert(laptop.canvas >= 700, `at 1280×720 the Final's slide keeps the size it has at the readable width (${JSON.stringify(laptop)})`);
    await wp.context().close();
  }

  // ---------- A reload mid-edit comes back where it was ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const rp = await ctx.newPage();
    rp.on('pageerror', (e) => errors.push(e.message));
    await rp.goto(pathToFileURL(file).href);
    await rp.getByRole('button', { name: /Try a sample game/ }).click();
    const roundTab = (name) => rp.locator('nav > button.round-tab').filter({ hasText: name }).first();
    const current = () => rp.locator('nav button[aria-current="page"]').first().innerText();
    const clue = rp.getByRole('dialog', { name: 'Edit clue' });
    await roundTab(/^\W*Jeopardy!$/).click();
    await rp.locator('.grid .tile').nth(1).click();
    await clue.waitFor();
    const question = clue.locator('[data-field="q"]');
    const asked = await question.inputValue();
    await question.fill(`${asked} TYPED`);
    await rp.waitForTimeout(1200);
    await rp.reload();
    await clue.waitFor();
    assert(
      (await clue.locator('[data-field="q"]').inputValue()) === `${asked} TYPED` && /Jeopardy!/.test(await current()),
      `a reload with a clue open comes back on its round with that clue open again (${await current()})`,
    );
    await rp.keyboard.press('Escape');
    await clue.waitFor({ state: 'detached' });
    await rp.reload();
    await editorReady(rp);
    await rp.locator('.grid .tile').first().waitFor();
    assert((await clue.count()) === 0 && /Jeopardy!/.test(await current()), 'closed, the round comes back without it');
    await rp.locator('nav > button', { hasText: 'Theme' }).first().click();
    await rp.reload();
    await editorReady(rp);
    assert(/Theme/.test(await current()), `on a page such as 🎨 Theme, that page (${await current()})`);
    await ctx.close();
  }

  assert(!errors.length, 'no page errors' + (errors.length ? `: ${errors.join('; ')}` : ''));
  console.log('editorfixes: all passed');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'editorfixes-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
