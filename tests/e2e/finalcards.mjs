// A Final's own 🤫 cards and named tile and Final cards, end to end (docs/PARTNER-CLUES-SPEC.md §12.2, §14.2): the
// built app hosts a game against the real buzzer room (buzzer/ under `wrangler dev`, local), with three phones on the
// real phone page.
// In the editor, a tile's card has a Card name: its tab and its words box say it, typing it is one undo step, a name
// that repeats the answer says so (and the checklist notes it), and F2 on its tab comes back to it. A Final takes cards
// too (＋ Card: its words box in focus, Goes to "everyone playing it"), the checklist's line about an empty one goes to
// it, 🗑 Delete card offers ↶ Undo, 📱 On their phone shows one as a phone gets it, 🔍 Find finds one by its words (its
// words box) or its name (its Card name box), and 🖼 Media counts a file used only on one as used, where.
// In play, one window: a named tile card is offered by its name; the Final's panel lists its cards under the wager rows
// (above the step's buttons), each starting with everyone playing it (it follows the ticks, and their Undo), and
// 📤 Send puts one on those phones beside the wager box, by a press, with neither its name nor a file name ever reaching
// the room. 🤫 Send a card… lists them once the Final is reached; a host reload keeps them out under their ids. Two
// windows: the column beside the stage shows what's on them, the cards out say which Final and card each one is, never
// on the audience window. They stay out through the question and the answer, and go when the Final ends; Ctrl+Z back
// into its reveals doesn't bring them back.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, editorReady, mainButton, openGameFile, packGame, png, recordSeen, roomStored, shownOf, startBuzzer, stored } from './helpers.mjs';

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
// leaves this computer. Nor may a card's name ("Clue tip", "Leader hint") reach the room, a phone or the audience window.
const HINT = 'Hint-qkzvx words';
const SIDE = 'Side-qkzvx words';
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
const buzzer = await startBuzzer('buzzer-finalcards-');
const { base, persist } = buzzer;
let browser;
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  return p;
};

try {
  browser = await chromium.launch({ executablePath });

  const files = { hint: png(200, 60, 20, 300, 200) };
  const media = [{ id: 'hint', name: 'zfnqj-hint.png', mime: 'image/png', size: files.hint.length, kind: 'image' }];
  const plain = (id, q, a, extra = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)), ...extra });
  const game = {
    id: 'g_final_cards',
    version: 2,
    title: 'Final cards',
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
              plain('q_tip', 'A movie question', 'Shrek', {
                cards: [
                  { id: 't1', name: 'Clue tip', to: 'picker', ...slide(text('Tip-qkzvx words')) },
                  { id: 't2', to: 'nobody', ...slide(text('Tip2-qkzvx words')) },
                ],
              }),
              plain('q_plain', 'Another question', 'Another answer'),
            ],
          },
        ],
      },
      {
        id: 'f1', name: 'Final Jeopardy!', mode: 'final', category: 'Movies', timerSeconds: 30, allowNonPositive: true,
        questionSlide: slide(text('The final question')), answerSlide: slide(text('The final answer')),
        cards: [
          { id: 'fc1', name: 'Leader hint', to: 'playing', ...slide(text(HINT), image('hint', 400)) },
          { id: 'fc2', to: 'nobody', ...slide(text(SIDE)) },
        ],
      },
    ],
    media, audio: {}, wheels: [], dice: [], theme: {},
  };
  const packPath = resolve('test-results/final-cards.brainrot');
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

  const header = host.locator('.editor > header');
  const undoTitle = () => header.getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  const undoSays = async (start) => {
    const ok = await until(async () => ((await undoTitle()) ?? '').startsWith(start));
    assert(ok, `↶ says “${start}…” (${await undoTitle()})`);
  };
  /** The checklist's lines, with what a line that sums up several holds (its tooltip). */
  const checklist = () => host.locator('nav .problem').evaluateAll((ls) => ls.map((l) => `${l.textContent} ${l.getAttribute('title') ?? ''}`).join('\n'));
  const focused = (sel) => host.waitForFunction((sel) => !!document.activeElement?.matches(sel), sel);

  // =====================================================================================================================
  // A. The editor
  // =====================================================================================================================
  console.log('A tile’s card names:');
  await host.locator('[data-tile="0,0"]').click();
  const dialog = host.getByRole('dialog', { name: 'Edit clue' });
  await dialog.waitFor();
  const tabsOf = (where) => where.getByRole('tablist', { name: 'Slides' }).getByRole('tab').allInnerTexts().then((t) => t.map((s) => s.trim()));
  const tabsAre = async (where, want, what) => {
    const ok = await until(async () => JSON.stringify(await tabsOf(where)) === JSON.stringify(want));
    assert(ok, `${what} (${(await tabsOf(where)).join(' | ')})`);
  };
  await tabsAre(dialog, ['Question slide', '🤫 Clue tip', '🤫 Card 2', 'Answer'], 'a named card’s tab says its name, an unnamed one its place');
  await dialog.getByRole('tab', { name: '🤫 Clue tip' }).click();
  const nameBox = dialog.getByLabel('Card name');
  assert(await until(async () => (await nameBox.inputValue()) === 'Clue tip'), 'its Card name box holds its name');
  const wordsLabel = dialog.locator('label.field', { has: host.locator('[data-field="card"]') });
  assert((await wordsLabel.innerText()).includes('🤫 Clue tip words'), 'and its words box is named for it');

  await nameBox.fill('Bonus tip');
  await tabsAre(dialog, ['Question slide', '🤫 Bonus tip', '🤫 Card 2', 'Answer'], 'renamed: its tab follows');
  await undoSays('Undo: Renamed card “Bonus tip”');
  await dialog.locator('header .value').click();
  await host.keyboard.press('Control+z');
  await tabsAre(dialog, ['Question slide', '🤫 Clue tip', '🤫 Card 2', 'Answer'], 'Ctrl+Z: its name as it was');

  // A name that gives the answer away ("Shrek").
  await nameBox.fill('Shrek tip');
  await dialog.locator('[data-name-repeats]').waitFor();
  assert(await until(async () => (await checklist()).includes('the name of card “Shrek tip” repeats')), 'a name that repeats the answer says so, and the checklist notes it');
  await undoSays('Undo: Renamed card “Shrek tip”');
  await dialog.locator('header .value').click();
  await host.keyboard.press('Control+z');
  assert(
    await until(async () => (await nameBox.inputValue()) === 'Clue tip' && (await dialog.locator('[data-name-repeats]').count()) === 0),
    'Ctrl+Z: Clue tip again, and the line is gone',
  );

  await dialog.getByRole('tab', { name: '🤫 Clue tip' }).focus();
  await host.keyboard.press('F2');
  await focused('[data-field="card-name"]');
  assert(true, 'F2 on its tab puts the focus in its Card name');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert(true, 'Esc from the Card name box closes the clue');

  // ---------- A Final's cards ----------
  console.log('A Final’s cards:');
  const finalTab = host.locator('nav > button.round-tab', { hasText: 'Final' });
  await finalTab.click();
  const main = host.getByRole('main');
  await tabsAre(main, ['Question slide', '🤫 Leader hint', '🤫 Card 2', 'Answer'], 'the Final’s card tabs, after its question slide');
  await main.getByRole('button', { name: '＋ Card' }).click();
  const card3 = main.getByRole('tab', { name: '🤫 Card 3' });
  await card3.waitFor();
  assert(await until(async () => (await card3.getAttribute('aria-selected')) === 'true'), '＋ Card: 🤫 Card 3, open');
  await focused('main [data-field="card"]');
  assert(true, 'with its words box in focus');
  await undoSays('Undo: Added card 3 to Final Jeopardy!');
  const goesTo = main.getByLabel('Goes to');
  assert((await goesTo.inputValue()) === 'playing', 'it starts with everyone playing the Final');
  const goesOptions = await goesTo.locator('option').allInnerTexts();
  assert(
    JSON.stringify(goesOptions) === JSON.stringify(['everyone playing it (ticked on the wager screen)', 'nobody (I’ll choose when playing)']),
    `its Goes to: everyone playing it, or nobody (${goesOptions.join(' | ')})`,
  );

  // The checklist's line about it goes to it.
  assert(await until(async () => (await checklist()).includes('Final Jeopardy!: card 3 is empty')), 'the checklist: Final Jeopardy!: card 3 is empty');
  await host.locator('nav > button', { hasText: '🔊 Sounds' }).click();
  await card3.waitFor({ state: 'detached' });
  await host.locator('nav .problem', { hasText: 'card 3 is empty' }).click();
  await card3.waitFor();
  assert(await until(async () => (await card3.getAttribute('aria-selected')) === 'true'), 'its line opens the Final at 🤫 Card 3');
  await focused('main [data-field="card"]');
  assert(true, 'with its words box in focus');

  // 🗑 Delete card, with ↶ Undo in the note.
  await main.getByRole('button', { name: '🗑 Delete card' }).click();
  await card3.waitFor({ state: 'detached' });
  const notice = host.locator('.history-notice');
  await notice.waitFor();
  assert((await words(notice)).startsWith('Deleted card 3 of Final Jeopardy!'), `🗑 Delete card: the note says so (${await words(notice)})`);
  await notice.getByRole('button', { name: /Undo/ }).click();
  await card3.waitFor();
  assert(await until(async () => (await card3.getAttribute('aria-selected')) === 'true'), 'its ↶ Undo brings it back, open');
  await main.getByRole('button', { name: '🗑 Delete card' }).click();
  await tabsAre(main, ['Question slide', '🤫 Leader hint', '🤫 Card 2', 'Answer'], 'deleted again');

  // 📱 On their phone.
  await main.getByRole('tab', { name: '🤫 Leader hint' }).click();
  await main.getByRole('button', { name: '📱 On their phone' }).click();
  const phone = host.getByRole('complementary', { name: 'Card on their phone' });
  await phone.locator('img').waitFor();
  assert((await phone.innerText()).includes(HINT), '📱 On their phone: its words and its picture, as a phone gets them');

  // 🔍 Find: by its words (its words box), by its name (its Card name box).
  const findIt = async (q) => {
    // (From another page: Find has to open the Final, at the card.)
    await host.locator('nav > button', { hasText: '🔊 Sounds' }).click();
    await main.getByRole('tablist', { name: 'Slides' }).waitFor({ state: 'detached' });
    await host.keyboard.press('Control+f');
    const find = host.getByRole('combobox', { name: 'Find' });
    await find.fill(q);
    const hit = host.getByRole('listbox', { name: 'Found' }).getByRole('option').first();
    await hit.waitFor();
    const where = await words(hit);
    await find.press('Enter');
    return where;
  };
  const leaderTab = main.getByRole('tab', { name: '🤫 Leader hint' });
  let where = await findIt('Hint-qkzvx');
  assert(where.includes('Final Jeopardy! › Leader hint'), `Find finds a Final’s card by its words, at Final Jeopardy! › Leader hint (${where})`);
  await focused('main [data-field="card"]');
  assert((await leaderTab.getAttribute('aria-selected')) === 'true', 'Enter opens it, its words box in focus');
  where = await findIt('Leader');
  assert(where.includes('Final Jeopardy! › Leader hint'), `and by its name (${where})`);
  await focused('main [data-field="card-name"]');
  assert((await leaderTab.getAttribute('aria-selected')) === 'true', 'Enter opens it, its Card name box in focus');

  // 🖼 Media: a file used only on a Final's card is used, there.
  await host.locator('nav > button', { hasText: '🖼 Media' }).click();
  const unusedBtn = main.getByRole('button', { name: /^🗑 Delete unused/ });
  await unusedBtn.waitFor();
  assert((await unusedBtn.innerText()).trim() === '🗑 Delete unused (0)' && (await unusedBtn.isDisabled()), '🖼 Media: 🗑 Delete unused (0), off');
  const usedSpan = host.locator('[data-place="media:hint"] .meta span', { hasText: 'used 1×' });
  await usedSpan.waitFor();
  assert((await usedSpan.getAttribute('title')).includes('Final Jeopardy! (card “Leader hint”)'), `zfnqj-hint.png is used 1×, on the Final’s card (${await usedSpan.getAttribute('title')})`);

  // =====================================================================================================================
  // B. Play, one window, against the real buzzer room
  // =====================================================================================================================
  console.log('Play, one window:');
  // (What the editor showed doesn't count: from here on the host page is on stream.)
  await host.evaluate(() => (window.__seen.length = 0));
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  await roomCard.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = roomCard.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);

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
  const offStream = async (p, name, when, more = []) => {
    const found = await shownOf(p, [...SECRETS, ...more]);
    assert(!found.length, `${when}: ${name} holds no card’s words or file name${more.length ? ', nor its name' : ''}${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  // ---------- A named tile card, offered by its name ----------
  // (Ann picks: P, then her number.)
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  const tileRow = host.locator('.panel [data-tile-cards] [data-tile-card="1"]');
  await tileRow.waitFor();
  assert((await words(tileRow)).startsWith('Clue tip ·'), `the tile’s panel names its card (${await words(tileRow)})`);
  assert((await tileRow.getByRole('button', { name: 'Send card “Clue tip”', exact: true }).count()) === 1, 'its 📤 Send says which: Send card “Clue tip”');
  assert((await tileRow.getByRole('button', { name: 'Card “Clue tip” to Ann' }).getAttribute('aria-pressed')) === 'true', 'and it starts with the picker, Ann');
  await host.keyboard.press('Shift+Escape');
  await host.locator('.stage-box .board').waitFor();
  assert((await host.getByRole('alertdialog').count()) === 0, 'nothing went: Shift+Esc puts the tile back without asking');

  // ---------- The Final's wager screen: its cards, under the wager rows ----------
  await sleep(450);
  await host.locator('.rn button', { hasText: '▶' }).click();
  await confirmStrip(host).waitFor();
  await sleep(450);
  await confirmStrip(host).getByRole('button', { name: 'Yes', exact: true }).click();
  await host.locator('.fj .wagers input[data-wager]').first().waitFor();
  const panel = host.locator('[data-final-cards]');
  await panel.waitFor();
  const row1 = panel.locator('[data-tile-card="1"]');
  const row2 = panel.locator('[data-tile-card="2"]');
  assert((await words(row1)).includes('Leader hint · 1 line of words, 1 picture'), `the Final’s panel: Leader hint, counted, never said (${await words(row1)})`);
  const chipOn = (row, name, who) => row.getByRole('button', { name: `${name} to ${who}`, exact: true }).getAttribute('aria-pressed').then((a) => a === 'true');
  const allOn = async () => (await chipOn(row1, 'Card “Leader hint”', 'Ann')) && (await chipOn(row1, 'Card “Leader hint”', 'Bob')) && (await chipOn(row1, 'Card “Leader hint”', 'Cat'));
  assert(await until(allOn), 'it starts with everyone playing: Ann, Bob and Cat');
  assert((await words(row2)).startsWith('Card 2 ·') && (await words(row2)).includes('nobody yet'), `an unnamed card set to nobody: Card 2, nobody yet (${await words(row2)})`);
  const order = await host.evaluate(() => {
    const [w, c, s] = [document.querySelector('.fj .wagers'), document.querySelector('[data-final-cards]'), document.querySelector('.fj > .row:last-child')];
    return !!(w && c && s && w.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING && c.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert(order, 'the panel comes after the wager rows, before the step’s buttons');

  // Who plays, ticked and unticked: the card follows (and its Undo).
  await host.locator('[data-plays="p3"]').click();
  assert(await until(async () => !(await chipOn(row1, 'Card “Leader hint”', 'Cat'))), 'Cat unticked: she’s off the card');
  await host.locator('.panel .status').click();
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await host.locator('[data-plays="p3"]').isChecked()) && (await allOn())), 'Ctrl+Z: Cat plays again, and she’s back on it');
  await offStream(host, 'the host page in one window', 'the Final’s cards listed');
  assert((await words(panel.locator('.exposed'))).includes('never what’s on it'), 'the ⚠ line says viewers can read a card’s name here, never what’s on it');

  // ---------- 📤 Send: to everyone playing, beside the wager box ----------
  assert(!cards().length, 'nothing went by itself');
  await row1.getByRole('button', { name: 'Send card “Leader hint”', exact: true }).click();
  await host.waitForFunction(() => /Card “Leader hint” sent to Ann, Bob, Cat/.test(document.getElementById('live-region')?.dataset.said ?? ''));
  assert(true, 'a screen reader hears Card “Leader hint” sent to Ann, Bob, Cat');
  assert(await until(() => cards().length === 1), 'sent: the room’s state holds one card');
  const c1 = cards()[0];
  assert(/^sc:/.test(c1.id) && JSON.stringify(c1.to) === JSON.stringify([{ seat: seat.Ann }, { seat: seat.Bob }, { seat: seat.Cat }]) && c1.text === HINT, 'to Ann’s, Bob’s and Cat’s seats, with its words');
  assert(!['Leader hint', 'Clue tip', 'zfnqj'].some((w) => JSON.stringify(states).includes(w)), 'neither a card’s name nor a file name ever goes to the room');
  assert(await until(async () => /listed as Card 1/.test(await words(row1))), `its row says it went, listed as Card 1 (${await words(row1)})`);
  assert(!(await roomStored(persist, 'Leader hint')), 'nor does the room ever store its name');

  const cover = ann.getByRole('button', { name: 'Tap to see' });
  await cover.waitFor();
  await ann.locator('#wager-form').waitFor();
  assert((await ann.locator('.card').isVisible()) && (await ann.locator('#wager-form').isVisible()), 'Ann’s phone: the card and her wager box, both');
  await cover.tap();
  await ann.getByText(HINT).waitFor();
  assert(true, 'tapped: its words');
  await ann.locator('#wager-in').fill('300');
  await ann.locator('#wager-send').click();
  await host.locator('[data-phone-wager="p1"]', { hasText: 'from phone' }).waitFor();
  await host.locator('.fj input[data-wager="p2"]').fill('200');
  await host.locator('.fj input[data-wager="p3"]').fill('100');
  assert(true, 'Ann wagers from her phone, the host types Bob’s and Cat’s');

  // ---------- Card 2: nobody at first, to Bob by his chip ----------
  await row2.getByRole('button', { name: 'Card 2 to Bob', exact: true }).click();
  await row2.getByRole('button', { name: 'Send card 2', exact: true }).click();
  assert(await until(() => cards().length === 2), 'Card 2 to Bob: the room holds two cards');
  const c2 = cards()[1];
  assert(JSON.stringify(c2.to) === JSON.stringify([{ seat: seat.Bob }]) && c2.text === SIDE && cards()[0].id === c1.id, 'Card 2 goes to Bob’s seat only, Card 1 keeps its id');
  assert(await until(async () => (await cardsOn(bob)) === 2), 'Bob’s phone has both');
  assert(!heard.ann.join('').includes('Side-qkzvx') && !heard.cat.join('').includes('Side-qkzvx'), 'Ann’s and Cat’s phones never get anything of it');

  // ---------- 🤫 Send a card…: the Final's cards, once it's reached ----------
  const tools = host.locator('.panel .toolsrow');
  const openSend = async () => {
    await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
    const d = host.getByRole('dialog', { name: 'Send a card' });
    await d.waitFor();
    await d.getByRole('radio', { name: 'One made in the editor' }).check();
    return d;
  };
  let send = await openSend();
  let pick = send.getByRole('combobox', { name: 'The card to send' });
  const options = await pick.locator('option').allInnerTexts();
  assert(
    JSON.stringify(options) === JSON.stringify(['Final Jeopardy! · Leader hint · 1 line of words, 1 picture', 'Final Jeopardy! · Card 2 · 1 line of words']),
    `🤫 Send a card… lists the Final’s cards by name, counted (no tile played: none of a tile’s) (${options.join(' | ')})`,
  );
  await offStream(host, 'the host page in one window', '🤫 Send a card… open');
  await host.keyboard.press('Escape');
  await send.waitFor({ state: 'detached' });

  // ---------- A host reload: both stay out, under their ids ----------
  assert(
    await until(async () => JSON.stringify(((await stored(host))?.session?.cards ?? []).map((c) => `sc:${c.id}:${c.at}`)) === JSON.stringify([c1.id, c2.id])),
    'autosave holds both cards under their ids',
  );
  const n = states.length;
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  assert(await until(() => states.length > n && JSON.stringify(cards().map((c) => c.id)) === JSON.stringify([c1.id, c2.id])), 'reloaded: both cards are out under the same ids');
  await panel.waitFor();
  assert(await until(async () => /listed as Card 1/.test(await words(row1)) && /listed as Card 2/.test(await words(row2))), 'and the Final’s panel says both went');

  // =====================================================================================================================
  // C. Two windows
  // =====================================================================================================================
  console.log('Two windows:');
  // (From the panel, not a box the focus may be in: A would be typed there.)
  await host.locator('.panel .status').click();
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.waitForLoadState('domcontentloaded');
  await aud.locator('.final-sub, .slide-area').first().waitFor();
  const info = host.locator('[data-final-cards-info]');
  await info.waitFor();
  const infoText = await words(info);
  assert(['Leader hint', HINT, 'zfnqj-hint.png'].every((w) => infoText.includes(w)), `the column beside the stage shows what’s on the Final’s cards (${infoText})`);
  const outButton = tools.locator('[data-cards-out-count]');
  await outButton.click();
  const outList = host.getByRole('dialog', { name: 'Cards out' });
  await outList.waitFor();
  const outRow = outList.locator('[data-card-out="Card 1"]');
  assert((await outRow.locator('[data-card-from]').innerText()).trim() === '· Final Jeopardy! · Leader hint', `the cards out: Card 1 is the Final’s Leader hint (${await words(outRow)})`);
  assert((await words(outRow)).includes('until the Final ends'), 'and it lasts until the Final ends');
  await host.keyboard.press('Escape');
  await outList.waitFor({ state: 'detached' });
  send = await openSend();
  pick = send.getByRole('combobox', { name: 'The card to send' });
  const groups = await pick.locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label));
  assert(JSON.stringify(groups) === JSON.stringify(['On tiles', 'In Finals']), `two windows: On tiles, then In Finals (${groups.join(' | ')})`);
  const onTiles = await send.locator('optgroup[label="On tiles"] option').allInnerTexts();
  assert(onTiles.includes('Movies $200 · Clue tip · 1 line of words'), `On tiles: a tile’s card by its name (${onTiles.join(' | ')})`);
  await host.keyboard.press('Escape');
  await send.waitFor({ state: 'detached' });
  await offStream(aud, 'the audience window', 'the Final’s cards out and looked at', ['Leader hint', 'Clue tip']);
  await aud.close();

  // =====================================================================================================================
  // D. Through the Final, and its end
  // =====================================================================================================================
  console.log('Through the Final:');
  const next = async (label) => {
    await host.waitForFunction((l) => document.querySelector('.panel [data-next]')?.textContent?.startsWith(l) && !document.querySelector('.panel [data-next]')?.disabled, label);
    await mainButton(host).click();
  };
  await next('Show question ▶');
  await host.locator('.panel .status', { hasText: 'Question on screen' }).waitFor();
  // (The question locks the phones' wagers: the room is told, the cards with it.)
  assert(await until(() => last()?.wager?.open === false && cards().length === 2), 'the question: both cards stay out');
  assert(await until(async () => (await cardsOn(bob)) === 2), 'and on Bob’s phone');
  await next('Reveal answer ▶');
  await host.locator('.panel .status', { hasText: 'Answer on screen' }).waitFor();
  await next('Start player reveals ▶');
  await host.locator('.fj .pl').first().waitFor();
  // (The reveals take the wagers off the phones: the room is told, the cards with it.)
  assert(await until(() => !last()?.wager && cards().length === 2), 'the answer, then the reveals: both cards stay out');
  const marked = states.flatMap((s) => (s.cards ?? []).filter((c) => !c.open));
  assert(!marked.length && !(await bob.locator('body').innerText()).includes('answer’s on screen'), 'never marked “the answer’s on screen”: not to the room, not on Bob’s phone');
  await panel.waitFor();
  assert(/listed as Card 1/.test(await words(row1)), 'the reveals: the Final’s panel is still there, under the rows');
  for (const who of ['Ann', 'Bob', 'Cat']) await host.getByRole('button', { name: `✔ Right: ${who}` }).click();
  await mainButton(host).click();
  const ended = host.locator('.panel .status', { hasText: 'Game over' });
  await ended.waitFor();
  assert(await until(async () => !cards().length && (await stored(host))?.session?.phase === 'end'), 'the Final ends: its cards go with it');
  assert(await until(async () => !(await cardsOn(ann)) && !(await cardsOn(bob)) && !(await cardsOn(cat))), 'and every phone drops them');
  await host.locator('.panel .status').click();
  await host.keyboard.press('Control+z');
  await host.locator('.fj .pl').first().waitFor();
  await panel.waitFor();
  assert(await until(async () => (await row1.getByRole('button', { name: 'Send card “Leader hint”', exact: true }).count()) === 1), 'Ctrl+Z back into its reveals: its cards don’t come back, 📤 Send is offered again');
  assert(!cards().length, 'and the room holds none');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Final card tests passed');
} finally {
  await browser?.close();
  buzzer.stop();
}
