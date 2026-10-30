// The editor's 🤫 Cards, end to end (docs/PARTNER-CLUES-SPEC.md §12.2, §14.2, milestone P5): private cards made before
// the show, then sent in play against the real buzzer room (buzzer/ under `wrangler dev`, local), with three phones on
// the real phone page.
// In the editor, 🤫 Cards (2) sits right after 🎡 Wheels, Dice & Deals: ＋ Add card opens a new one with its words box in
// focus, the checklist's line about an empty card goes to it (it flashes), typing and renaming are named undo steps, a
// name that repeats what's on the card says so, and the list's right-click ⧉ Duplicate, Alt+↓, F2 and Delete (with ↶ Undo)
// work as they do for wheels (a rename there ended by a click elsewhere leaves the keys where the click put them). 📱 On their phone shows a card as a phone gets it, 🔍 Find finds one by its words, and 🖼 Media
// counts a file used only on a card as used.
// In play, one window: 🤫 Send a card… › One made in the editor lists them by name and counted, never what's on them
// (a tile's card once the tile is played, under its own heading), Lasts follows the card picked, and 📤 Send puts it on
// the chosen player's phone only, by a press, with neither its name nor a file name ever reaching the room. The same
// card can't go to the same players twice (↻ Send again is for that); a host reload keeps it out under its id. Two
// windows: the dialog shows what's on the card picked, and the cards out say which 🤫 Card each one is, never on the
// audience window. A card changed in the editor (▶ Resume with my edits) comes off the phones until ↻ Send again. With
// no phones (the room closed), one shown in the 🪟 card window comes out of it, and its row says to ✖ Take it back and
// show it again: there's no ↻ Send again.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, forgetSeen, macClicks, openGameFile, packGame, png, recordSeen, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// ---------- The game ----------

// Every card's words carry "qkzvx", its picture's file name "zfnqj": neither may ever be on stream, and no file name ever
// leaves this computer. Nor may a card's name ("Wild card") reach the room.
const WILD = 'Wild-qkzvx words';
const WILD2 = 'Wild2-qkzvx words';
const TIP = 'Tip-qkzvx words';
const SECRETS = ['qkzvx', 'zfnqj'];

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const slide = (...elements) => ({ background: {}, elements });

/** Waits (up to `ms`: a slow machine takes its time) until pred() holds. */
const until = async (pred, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
  return !!(await pred());
};
/** An element's words on one line (a row's parts are laid out apart). */
const words = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-savedcards-');
const { base } = buzzer;
let browser;
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  return p;
};

try {
  browser = await chromium.launch({ executablePath });

  const files = { tip: png(200, 60, 20, 300, 200) };
  const media = [{ id: 'tip', name: 'zfnqj-tip.png', mime: 'image/png', size: files.tip.length, kind: 'image' }];
  const plain = (id, q, a, extra = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)), ...extra });
  const game = {
    id: 'g_saved_cards',
    version: 2,
    title: 'Cards made ahead',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
    rounds: [
      {
        id: 'r1', name: 'Round 1', mode: 'board', values: [200, 400], dailyDoubleCount: 0,
        categories: [
          {
            id: 'cat0', title: 'Movies',
            clues: [
              plain('q_tile', 'A plain question', 'Plain answer', { cards: [{ id: 't1', to: 'picker', ...slide(text('Tile-qkzvx words')) }] }),
              plain('q_plain', 'Another question', 'Another answer'),
            ],
          },
        ],
      },
    ],
    media, audio: {}, wheels: [], dice: [], theme: {},
    // Only Tip A uses the picture.
    cards: [
      { id: 'sc_wild', name: 'Wild card', until: 'host', ...slide(text(WILD)) },
      { id: 'sc_tip', name: 'Tip A', ...slide(text(TIP), image('tip', 400)) },
    ],
  };
  const packPath = resolve('test-results/saved-cards.brainrot');
  writeFileSync(packPath, await packGame(game, files));

  // ---------- The host ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  await ctx.addInitScript(recordSeen);
  const host = watch(await ctx.newPage(), 'host');
  // Everything the host tells the room.
  const states = [];
  host.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(f.payload);
        if (m.t === 'state') states.push(m.state);
      } catch {
        // not JSON
      }
    }),
  );
  const last = () => states.at(-1);
  /** The cards in the room's state now. */
  const cards = () => last()?.cards ?? [];
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();
  await editorReady(host);

  // =====================================================================================================================
  // A. The editor's 🤫 Cards tab
  // =====================================================================================================================
  console.log('The editor’s 🤫 Cards tab:');
  const navTexts = await host.locator('nav > button').allInnerTexts();
  const at = (re) => navTexts.findIndex((t) => re.test(t.trim()));
  assert(at(/^🤫 Cards \(2\)$/) >= 0 && at(/^🤫 Cards \(2\)$/) === at(/Wheels, Dice & Deals/) + 1, `🤫 Cards (2) sits right after 🎡 Wheels, Dice & Deals (${navTexts.join(' | ')})`);
  const cardsTab = host.locator('nav > button', { hasText: '🤫 Cards' });
  await cardsTab.click();
  const editor = host.locator('[data-card-editor]');
  await editor.waitFor();
  assert((await host.locator('main .page-header h2').innerText()).trim() === 'Cards', 'its page is called Cards');
  const list = host.getByRole('list', { name: 'Cards' });
  /** The cards in the list, in order. */
  const names = () => list.getByRole('button').allInnerTexts().then((t) => t.map((s) => s.trim()).join(', '));
  const listIs = (want) => host.waitForFunction((want) => [...document.querySelectorAll('[data-saved-card]')].map((b) => b.textContent.trim()).join(', ') === want, want);
  const row = (name) => list.getByRole('button', { name, exact: true });
  assert((await names()) === 'Wild card, Tip A', `the list: Wild card, Tip A (${await names()})`);
  assert((await row('Wild card').getAttribute('aria-current')) === 'true', 'the first is open');
  assert((await editor.getByLabel('Card name').inputValue()) === 'Wild card' && (await editor.getByLabel('Stays until you take it back').isChecked()), 'its name, and Stays until you take it back');
  // Enter on a card in the list goes into it: its name, selected.
  await row('Tip A').focus();
  await host.keyboard.press('Enter');
  await host.waitForFunction(() => {
    const e = document.activeElement;
    return e instanceof HTMLInputElement && e.matches('main [data-field="card-name"]') && e.value === 'Tip A' && e.selectionStart === 0 && e.selectionEnd === e.value.length;
  });
  assert((await row('Tip A').getAttribute('aria-current')) === 'true', 'Enter on a card in the list opens it, the typing in its name (all of it selected)');
  await row('Wild card').click();

  // ---------- ＋ Add card ----------
  const header = host.locator('.editor > header');
  const undoTitle = () => header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  const undoSays = async (start) => {
    const ok = await until(async () => ((await undoTitle()) ?? '').startsWith(start));
    assert(ok, `↶ says “${start}…” (${await undoTitle()})`);
  };
  await host.getByRole('button', { name: '＋ Add card' }).click();
  await listIs('Wild card, Tip A, Private card 3');
  assert((await row('Private card 3').getAttribute('aria-current')) === 'true', '＋ Add card: Private card 3, at the end, open');
  await host.waitForFunction(() => document.activeElement?.matches('main [data-field="card"]'));
  assert(true, 'with its words box in focus');
  await host.waitForFunction(() => /Card “Private card 3” added/.test(document.getElementById('live-region')?.dataset.said ?? ''));
  assert(true, 'and a screen reader hears which card it made (the words box is named the same on every card)');
  await undoSays('Undo: Added card “Private card 3”');
  assert((await cardsTab.innerText()).trim() === '🤫 Cards (3)', 'the sidebar says 🤫 Cards (3)');

  // ---------- The checklist's line goes to it ----------
  const empty = host.locator('nav .problem', { hasText: '🤫 Card “Private card 3” is empty' });
  await empty.waitFor();
  const newId = await row('Private card 3').getAttribute('data-saved-card');
  await host.locator('nav > button', { hasText: '🔊 Sounds' }).click();
  await editor.waitFor({ state: 'detached' });
  await empty.click();
  await host.waitForFunction((id) => !!document.querySelector(`[data-place="card:${id}"].flash`), newId);
  assert((await cardsTab.getAttribute('aria-current')) === 'page' && (await row('Private card 3').getAttribute('aria-current')) === 'true', 'the checklist’s “is empty” line opens 🤫 Cards at that card, flashing it');

  // ---------- Typing, renaming, and a name that gives the card away ----------
  const wordsBox = host.locator('main [data-field="card"]');
  const nameBox = host.locator('main [data-field="card-name"]');
  await wordsBox.fill('Spoon');
  await undoSays('Undo: Edited card “Spoon”');
  await nameBox.fill('Spoon run');
  await host.locator('[data-name-repeats]').waitFor();
  await host.locator('nav .problem', { hasText: '🤫 Card “Spoon run”: its name repeats' }).waitFor();
  assert(true, 'a name that repeats what’s on the card says so, and the checklist notes it');
  await undoSays('Undo: Renamed card “Spoon run”');
  // (From the list: Ctrl+Z in a box just typed in would be that box's own.)
  await row('Spoon run').focus();
  await host.keyboard.press('Control+z');
  await listIs('Wild card, Tip A, Private card 3');
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await wordsBox.inputValue()) === ''), 'Ctrl+Z twice: back to Private card 3, with no words');
  assert((await host.locator('[data-name-repeats]').count()) === 0, 'and the name note’s line is gone');
  // A rename in the list ended by a click elsewhere: the keys stay where the click put them.
  await row('Private card 3').dblclick();
  const renameBox = list.getByLabel('Card name', { exact: true });
  await renameBox.waitFor();
  await wordsBox.click();
  await renameBox.waitFor({ state: 'detached' });
  await host.waitForFunction(() => document.activeElement?.matches('main [data-field="card"]'));
  assert(true, 'a rename in the list ended by a click in the words box: the keys stay in the words box');

  // ---------- The list: ⧉ Duplicate, Alt+↓, F2, Delete ----------
  await row('Tip A').click({ button: 'right' });
  await host.getByRole('menuitem', { name: /Duplicate/ }).click();
  await listIs('Wild card, Tip A, Tip A (copy), Private card 3');
  assert(true, 'right-click › ⧉ Duplicate: Tip A (copy), right after it');
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Tip A (copy)' && document.activeElement.getAttribute('aria-current') === 'true');
  assert(true, 'the copy is open, and its row has the focus (the next key acts on it)');
  await host.keyboard.press('Alt+ArrowDown');
  await listIs('Wild card, Tip A, Private card 3, Tip A (copy)');
  await host.waitForFunction(() => /Card “Tip A \(copy\)” moved to 4 of 4/.test(document.getElementById('live-region')?.dataset.said ?? ''));
  assert(true, 'Alt+↓ moves it down, and says where to');
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Tip A (copy)');
  await host.keyboard.press('F2');
  // (The box in the list, where the row was: the card's own name box is called that too.)
  await list.getByLabel('Card name', { exact: true }).fill('Tip B');
  await host.keyboard.press('Enter');
  await listIs('Wild card, Tip A, Private card 3, Tip B');
  assert(true, 'F2 renames it in place');
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Tip B');
  await host.keyboard.press('Delete');
  await listIs('Wild card, Tip A, Private card 3');
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Private card 3' && document.activeElement.getAttribute('aria-current') === 'true');
  assert(true, 'the card before it (it was the last) opens and its row takes the keys, so a second Delete acts there');
  const notice = host.locator('.history-notice');
  await notice.waitFor();
  assert((await words(notice)).startsWith('Deleted card “Tip B”'), `Delete deletes it, and the note says so (${await words(notice)})`);
  await notice.getByRole('button', { name: /Undo/ }).click();
  await listIs('Wild card, Tip A, Private card 3, Tip B');
  assert(true, 'its ↶ Undo brings it back');
  // Back to how it was: the rename, the move, the copy.
  for (const want of ['Wild card, Tip A, Private card 3, Tip A (copy)', 'Wild card, Tip A, Tip A (copy), Private card 3', 'Wild card, Tip A, Private card 3']) {
    await row('Wild card').focus();
    await host.keyboard.press('Control+z');
    await listIs(want);
  }
  assert(true, 'Ctrl+Z takes back the rename, the move and the copy, one at a time');
  const openCard = () => host.locator('[data-saved-card][aria-current="true"]').innerText().then((t) => t.trim());
  assert(await until(async () => (await openCard()) === 'Tip A'), `the copy taken back: Tip A, the card copied, is open (${await openCard()})`);
  // A move up: the slot that changed first holds the card it swapped with, but Undo shows the card moved.
  await row('Private card 3').focus();
  await host.keyboard.press('Alt+ArrowUp');
  await listIs('Wild card, Private card 3, Tip A');
  await row('Wild card').click();
  await host.keyboard.press('Control+z');
  await listIs('Wild card, Tip A, Private card 3');
  assert(await until(async () => (await openCard()) === 'Private card 3'), `Ctrl+Z on a move opens the card moved (${await openCard()})`);
  assert(
    await until(async () => (await words(notice).catch(() => '')).startsWith('↶ Undid Moved card “Private card 3” up · Cards ↷')),
    `and the note names it, nothing else (${await words(notice).catch(() => '')})`,
  );

  // ---------- 📱 On their phone ----------
  await row('Tip A').click();
  await host.waitForFunction(() => document.querySelector('main [data-field="card-name"]')?.value === 'Tip A');
  assert((await row('Tip A').getAttribute('aria-current')) === 'true', 'clicking Tip A opens it');
  const phoneBtn = host.getByRole('button', { name: '📱 On their phone' });
  const xBefore = (await phoneBtn.boundingBox()).x;
  await phoneBtn.click();
  const phone = host.getByRole('complementary', { name: 'Card on their phone' });
  await phone.locator('img').waitFor();
  const after = await phoneBtn.boundingBox();
  assert(after.x === xBefore && after.y >= 0 && after.y + after.height <= 900, `📱 stays where it was across the page, on screen (x ${xBefore} → ${after.x}, y ${after.y})`);
  assert((await phone.innerText()).includes(TIP), '📱 On their phone: its words and its picture, as a phone gets them');

  // ---------- 🔍 Find ----------
  await host.keyboard.press('Control+f');
  const find = host.getByRole('combobox', { name: 'Find' });
  await find.fill('Wild-qkzvx');
  const hit = host.getByRole('listbox', { name: 'Found' }).getByRole('option').first();
  await hit.waitFor();
  assert((await words(hit)).includes('Cards › Wild card'), `Find finds a card by its words, at Cards › Wild card (${await words(hit)})`);
  await find.press('Enter');
  await host.waitForFunction(() => document.activeElement?.matches('main [data-field="card"]'));
  assert((await row('Wild card').getAttribute('aria-current')) === 'true', 'Enter opens it, its words box in focus');

  // ---------- 🖼 Media: a file used only on a card is used ----------
  await host.locator('nav > button', { hasText: '🖼 Media' }).click();
  const unusedBtn = host.getByRole('main').getByRole('button', { name: /^🗑 Delete unused/ });
  await unusedBtn.waitFor();
  assert((await unusedBtn.innerText()).trim() === '🗑 Delete unused (0)' && (await unusedBtn.isDisabled()), '🖼 Media: 🗑 Delete unused (0), off');
  const tipFile = host.locator('[data-place="media:tip"]');
  const usedSpan = tipFile.locator('.meta span', { hasText: 'used 1×' });
  await usedSpan.waitFor();
  assert((await usedSpan.getAttribute('title')).includes('Card: Tip A'), `zfnqj-tip.png is used 1×, on Card: Tip A (${await usedSpan.getAttribute('title')})`);
  await host.locator('nav .problem', { hasText: '1 file is used only on 🤫 cards' }).waitFor();
  assert(true, 'the checklist notes a file used only on 🤫 cards');

  // ---------- Renamed in the list, then something else clicked: the keys stay there ----------
  await cardsTab.click();
  await row('Private card 3').dblclick();
  await list.getByLabel('Card name', { exact: true }).fill('Mission 2');
  await nameBox.click();
  await host.keyboard.press('End');
  await host.keyboard.press('Backspace');
  assert(await until(async () => (await nameBox.inputValue()) === 'Mission '), `renamed in the list, then its Card name box clicked: Backspace types there (${await nameBox.inputValue()})`);
  await listIs('Wild card, Tip A, Mission');
  assert(true, 'and deletes no card');
  await row('Mission').dblclick();
  await list.getByLabel('Card name', { exact: true }).fill('Private card 3');
  await row('Tip A').click();
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Tip A' && document.activeElement.getAttribute('aria-current') === 'true');
  assert(true, 'renamed, then another card clicked: that card is open, and its row has the keys (not the card renamed)');
  // The same where a button clicked doesn't take the focus (Safari, a Mac): the row clicked takes it.
  const chromiumClicks = await macClicks(host);
  await row('Private card 3').dblclick();
  await list.getByLabel('Card name', { exact: true }).fill('Private card 3');
  await row('Wild card').click();
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Wild card' && document.activeElement.getAttribute('aria-current') === 'true');
  assert(true, 'renamed, then another card clicked, with a Mac’s clicks: that card is open, and its row has the keys');
  await chromiumClicks();

  // ---------- Private card 3 goes (the play list has two cards) ----------
  await listIs('Wild card, Tip A, Private card 3');
  await row('Private card 3').focus();
  await host.keyboard.press('Delete');
  await listIs('Wild card, Tip A');
  assert((await cardsTab.innerText()).trim() === '🤫 Cards (2)', 'Private card 3 deleted: 🤫 Cards (2)');

  // =====================================================================================================================
  // B. Play, one window, against the real buzzer room
  // =====================================================================================================================
  console.log('Play, one window:');
  // (What the editor showed doesn't count, nor its last notices (the Delete above), said a moment late: from here on the
  // host page is on stream.)
  await forgetSeen(host);
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(roomCard);

  // ---------- Three phones ----------
  const heard = {};
  const join = async (label, seat) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), label);
    heard[label] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[label].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat, exact: true }).click();
    await p.locator('#me').getByText(seat).waitFor();
    return p;
  };
  const ann = await join('ann', 'Ann');
  const bob = await join('bob', 'Bob');
  const cat = await join('cat', 'Cat');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const cardsOn = (p) => p.locator('.card').count();
  const offStream = async (p, name, when) => {
    const found = await shownOf(p, SECRETS);
    assert(!found.length, `${when}: ${name} holds no card’s words or file name${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  const tools = host.locator('.panel .toolsrow');
  const openSend = async () => {
    await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
    const d = host.getByRole('dialog', { name: 'Send a card' });
    await d.waitFor();
    return d;
  };
  let dialog = await openSend();
  const editorRadio = dialog.getByRole('radio', { name: 'One made in the editor' });
  assert((await editorRadio.isEnabled()) && (await editorRadio.isChecked()), 'no tile played yet: One made in the editor is there, and the first choice');
  const pick = dialog.getByRole('combobox', { name: 'The card to send' });
  const options = await pick.locator('option').allInnerTexts();
  assert(
    JSON.stringify(options) === JSON.stringify(['Wild card · 1 line of words', 'Tip A · 1 line of words, 1 picture']),
    `the 🤫 Cards, by name and counted, never said (${options.join(' | ')})`,
  );
  assert((await pick.locator('optgroup').count()) === 0, 'with no tile’s card to list, no headings');
  await offStream(host, 'the host page in one window', '🤫 Send a card… open');
  assert((await dialog.locator('.exposed').innerText()).includes('never what’s on it'), 'the ⚠ line says viewers see a card’s name, never what’s on it');
  assert((await dialog.locator('[data-card-preview]').count()) === 0, 'one window: no What’s on it');

  // ---------- Lasts follows the card picked ----------
  assert(await dialog.getByRole('radio', { name: 'until I take it back' }).isChecked(), 'Wild card stays until taken back: Lasts says so');
  await pick.selectOption('saved:sc_tip');
  assert(await until(() => dialog.getByRole('radio', { name: 'until the round ends' }).isChecked()), 'Tip A: until the round ends');
  await pick.selectOption('saved:sc_wild');
  assert(await until(() => dialog.getByRole('radio', { name: 'until I take it back' }).isChecked()), 'back to Wild card: until I take it back');
  // (A 🤫 Card's own is only for it: another kind of card is back to how the dialog opened, or to what the host picked.)
  const lastsIs = (name) => until(() => dialog.getByRole('radio', { name }).isChecked());
  await dialog.getByRole('radio', { name: 'A quick card' }).check();
  assert(await lastsIs('until the round ends'), 'A quick card: until the round ends, as the dialog opened');
  await dialog.getByRole('radio', { name: 'until I take it back' }).check();
  await editorRadio.check();
  await pick.selectOption('saved:sc_tip');
  assert(await lastsIs('until the round ends'), 'Tip A again: its own, until the round ends');
  await dialog.getByRole('radio', { name: 'A quick card' }).check();
  assert(await lastsIs('until I take it back'), 'A quick card: until I take it back, as the host picked it for one');
  await editorRadio.check();
  await pick.selectOption('saved:sc_wild');
  assert(await lastsIs('until I take it back'), 'Wild card again: until I take it back');

  // ---------- 📤 Send to Bob ----------
  await dialog.getByRole('button', { name: 'Bob', exact: true }).click();
  assert(!cards().length && !JSON.stringify(states).includes('"cards"'), 'choosing who gets it sends nothing');
  await dialog.getByRole('button', { name: '📤 Send' }).click();
  await dialog.locator('[data-card-said]').getByText('Card 1 sent to Bob').waitFor();
  assert(await until(() => cards().length === 1), 'sent: the room’s state holds one card');
  const c1 = cards()[0];
  assert(/^sc:/.test(c1.id) && JSON.stringify(c1.to) === JSON.stringify([{ seat: seat.Bob }]) && c1.text.includes('Wild-qkzvx'), 'Card 1 goes to Bob’s seat only, with its words');
  assert(!JSON.stringify(states).includes('Wild card') && !JSON.stringify(states).includes('zfnqj'), 'neither its name nor a file name ever goes to the room');
  const cover = bob.getByRole('button', { name: 'Tap to see' });
  await cover.waitFor();
  assert(!(await bob.getByText(WILD).isVisible()), 'Bob’s phone: the card behind Tap to see');
  await cover.tap();
  await bob.getByText(WILD).waitFor();
  for (const [p, label] of [[ann, 'ann'], [cat, 'cat']]) assert(!(await cardsOn(p)) && !heard[label].join('').includes('qkzvx'), `${label === 'ann' ? 'Ann' : 'Cat'}’s phone: no card, and nothing of it`);

  // ---------- Not twice to the same players ----------
  const sendBtn = dialog.getByRole('button', { name: '📤 Send' });
  assert(await sendBtn.isDisabled(), '📤 Send is off: Wild card is out to Bob already');
  assert((await dialog.locator('[data-card-already]').innerText()).includes('Card 1 is out to them already'), `it says so (${await dialog.locator('[data-card-already]').innerText()})`);
  assert((await pick.locator('option:checked').innerText()) === 'Wild card · 1 line of words · out', `the option says it’s out (${await pick.locator('option:checked').innerText()})`);
  await dialog.getByRole('button', { name: 'Ann', exact: true }).click();
  assert(await until(() => sendBtn.isEnabled()), 'Bob and Ann: 📤 Send is on again');
  await dialog.getByRole('button', { name: 'Ann', exact: true }).click();
  await offStream(host, 'the host page in one window', 'a 🤫 Card sent');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---------- A tile played: its card is listed too, under its own heading ----------
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  assert(await until(() => !!last()?.clue), 'Movies $200 opens');
  await host.keyboard.press('Escape');
  assert(await until(() => !last()?.clue), 'and closes, back to the board');
  dialog = await openSend();
  const groups = await dialog.getByRole('combobox', { name: 'The card to send' }).locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label));
  assert(JSON.stringify(groups) === JSON.stringify(['🤫 Cards', 'On tiles']), `the 🤫 Cards, then On tiles (${groups.join(' | ')})`);
  const onTiles = await dialog.locator('optgroup[label="On tiles"] option').allInnerTexts();
  assert(JSON.stringify(onTiles) === JSON.stringify(['Movies $200 · Card 1 · 1 line of words']), `On tiles: the played tile’s card (${onTiles.join(' | ')})`);
  await offStream(host, 'the host page in one window', 'both kinds listed');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---------- A host reload: the card stays out, under its id ----------
  // (Once autosave holds the tile played and the card out: its write waits a moment for more clicks.)
  assert(
    await until(async () => {
      const s = (await stored(host))?.session;
      return !!s?.used?.q_tile && s.phase === 'board' && s.cards?.length === 1 && s.cards[0].content?.saved === 'sc_wild';
    }),
    'autosave holds the tile played and Wild card out, by its id',
  );
  const n = states.length;
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  assert(await until(() => states.length > n && cards().length === 1 && cards()[0].id === c1.id), 'reloaded: the card is out under the same id');
  const outButton = tools.locator('[data-cards-out-count]');
  assert((await outButton.innerText()).trim() === '🤫 1 card out', 'and the tools row counts it');
  await outButton.click();
  const outList = host.locator('[data-cards-out]');
  await outList.waitFor();
  assert((await words(outList.locator('[data-card-out="Card 1"]'))).includes('Card 1 → Bob'), 'the cards out: Card 1 → Bob');
  assert((await outList.locator('[data-card-from]').count()) === 0, 'one window: never which 🤫 Card it is');
  await offStream(host, 'the host page in one window', 'the cards out open');
  await host.keyboard.press('Escape');
  await outList.waitFor({ state: 'detached' });

  // =====================================================================================================================
  // C. Two windows
  // =====================================================================================================================
  console.log('Two windows:');
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  dialog = await openSend();
  assert(await dialog.getByRole('radio', { name: 'One made in the editor' }).isChecked(), 'two windows, a game with 🤫 Cards: One made in the editor is the first choice');
  const wildOption = await dialog.locator('option[value="saved:sc_wild"]').innerText();
  assert(wildOption.endsWith(' · out to Bob'), `Wild card · out to Bob (${wildOption})`);
  const preview = dialog.locator('[data-card-preview]');
  assert((await preview.innerText()).includes(WILD), 'What’s on it: Wild card’s words');
  await dialog.getByRole('combobox', { name: 'The card to send' }).selectOption('saved:sc_tip');
  assert(
    await until(async () => (await preview.innerText()).includes(TIP) && (await preview.innerText()).includes('🖼 picture · zfnqj-tip.png')),
    `Tip A: its words, and its picture by name (${await words(preview)})`,
  );
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await outButton.click();
  await outList.waitFor();
  assert((await outList.locator('[data-card-out="Card 1"] [data-card-from]').innerText()).trim() === '· 🤫 Wild card', 'the cards out: Card 1 is the Wild card');
  await host.keyboard.press('Escape');
  await outList.waitFor({ state: 'detached' });
  await offStream(aud, 'the audience window', 'a 🤫 Card sent and looked at');
  await aud.close();

  // =====================================================================================================================
  // D. Changed in the editor
  // =====================================================================================================================
  console.log('Changed in the editor:');
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await editorReady(host);
  await cardsTab.click();
  await row('Wild card').click();
  await host.waitForFunction(() => document.querySelector('main [data-field="card-name"]')?.value === 'Wild card');
  await wordsBox.fill(WILD2);
  const resumeEdits = host.getByRole('button', { name: 'Resume with my edits' });
  await resumeEdits.waitFor();
  // (What the editor showed doesn't count: from here on the host page is on stream again. Once the typing is an undo
  // step, as ↶'s title then names it.)
  await undoSays('Undo: Edited card “Wild2-qkzvx words”');
  await host.evaluate(() => (window.__seen.length = 0));
  await resumeEdits.click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  assert(await until(() => cards().length === 0), 'Wild card changed in the editor: the room no longer has it');
  assert(await until(async () => (await cardsOn(bob)) === 0), 'and Bob’s phone drops it');
  await outButton.click();
  await outList.waitFor();
  assert(
    (await outList.locator('[data-card-out="Card 1"] [data-card-state]').innerText()).includes('changed in the editor: off the phones until ↻ Send again'),
    'the cards out say it changed in the editor: off the phones until ↻ Send again',
  );
  await outList.getByRole('button', { name: 'Send Card 1 again' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].text?.includes('Wild2-qkzvx')), '↻ Send again: its new words go');
  await bob.getByRole('button', { name: 'Tap to see' }).tap();
  await bob.getByText(WILD2).waitFor();
  assert(true, 'Bob sees the new words');
  await outList.getByRole('button', { name: 'Take Card 1 back' }).click();
  assert(await until(() => !cards().length), '✖ Take back: no card out');
  assert(await until(async () => !(await cardsOn(bob))), 'Bob’s phone drops it');
  await offStream(host, 'the host page in one window', 'the end');
  await host.keyboard.press('Escape');
  await outList.waitFor({ state: 'detached' });

  // =====================================================================================================================
  // E. Changed in the editor, with no phones (the 🪟 card window)
  // =====================================================================================================================
  console.log('Changed in the editor, no phones:');
  // Keep & leave, then ✕ Close the room in the bar over the editor: Resume game plays on with no phones getting cards.
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await editorReady(host);
  const roomBar = host.locator('.status-bar .room-bar');
  await roomBar.getByRole('button', { name: '✕ Close the room' }).click();
  // (Bob's phone is in it: asked first.)
  await host.locator('.status-bar').getByRole('alertdialog', { name: 'Close the room?' }).getByRole('button', { name: 'Close the room' }).click();
  await roomBar.waitFor({ state: 'detached' });
  await host.evaluate(() => (window.__seen.length = 0));
  await host.locator('.status-bar .kept').getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  dialog = await openSend();
  assert((await dialog.getByRole('button', { name: '📤 Send' }).count()) === 0, 'the room closed: no 📤 Send (no phones get cards)');
  const [win] = await Promise.all([host.waitForEvent('popup'), dialog.getByRole('button', { name: 'Card window for Bob' }).click()]);
  watch(win, 'card window');
  await win.getByText('For Bob only').waitFor();
  await dialog.getByRole('radio', { name: 'One made in the editor' }).check();
  await dialog.getByRole('combobox', { name: 'The card to send' }).selectOption('saved:sc_wild');
  const bobChip = dialog.getByRole('button', { name: 'Bob', exact: true });
  if ((await bobChip.getAttribute('aria-pressed')) !== 'true') await bobChip.click();
  const show = dialog.getByRole('button', { name: '🪟 Show Bob' });
  assert(await until(() => show.isEnabled()), 'the card window open for Bob: Wild card can be shown there (🪟 Show Bob)');
  await show.click();
  await tools.locator('[data-cards-out-count="1"]').waitFor();
  await win.getByText(WILD2).waitFor();
  assert(true, '🪟 Show Bob: the card window shows Wild card, with its words now');
  await offStream(host, 'the host page in one window', 'a 🤫 Card shown in the card window');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // Changed again in the editor, ▶ Resume with my edits: it's out of the card window, and there's no ↻ Send again to
  // point at, so its row says to take it back and show it again.
  const WILD3 = 'Wild3-qkzvx words';
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await editorReady(host);
  await cardsTab.click();
  await row('Wild card').click();
  await host.waitForFunction(() => document.querySelector('main [data-field="card-name"]')?.value === 'Wild card');
  await wordsBox.fill(WILD3);
  await resumeEdits.waitFor();
  await undoSays('Undo: Edited card “Wild3-qkzvx words”');
  await host.evaluate(() => (window.__seen.length = 0));
  await resumeEdits.click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  await outButton.click();
  await outList.waitFor();
  const noPhones = await words(outList.locator('[data-card-out] [data-card-state]'));
  assert(noPhones.includes('changed in the editor') && noPhones.includes('✖ Take it back and show it again') && !noPhones.includes('↻'), `no phones: the cards out say it changed in the editor, and to ✖ Take it back and show it again (${noPhones})`);
  assert((await outList.getByRole('button', { name: /^Send .+ again$/ }).count()) === 0, 'and offer no ↻ Send again');
  await outList.getByRole('button', { name: /^Take .+ back$/ }).click();
  await tools.locator('[data-cards-out-count="0"]').waitFor();
  assert(true, '✖ Take back: no card out');
  await offStream(host, 'the host page in one window', 'no phones, the end');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Saved card tests passed');
} finally {
  await browser?.close();
  buzzer.stop();
}
