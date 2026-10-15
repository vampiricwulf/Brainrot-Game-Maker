// 🤝 Partner clues from the editor to the end of the clue (docs/PARTNER-CLUES-SPEC.md §5–§10, §14, §15, §22).
// The editor: a tile made a partner clue gets its rules (game, who describes, the points and what they come to on the
// tile) and a 🤫 Card 1 tab; ⧉ Same as the answer copies the answer onto a card once; ＋ Card and 🗑 Delete card are undo
// steps; the tabs go Question · Cards · Answer by the arrow keys; Find finds a card's words and opens its tab; the board
// shows a 🤝 badge; the tile menu turns it off and on again, keeping the cards; a reload keeps it all; Card 2 gets a
// picture from this computer; and a second partner clue gets a card of its own, with a picture too.
// Two windows: that game played with the audience and scores windows open. "Who picked it?", the host column listing
// the cards, the wheel never drawing the picker (on either stage, all through the spin), overruling it with 2, a held
// Enter and a double Enter that neither start the clock nor score, a card given to someone else and 📋 Copy words,
// ✔ Got it with the default shares and the guesser picking next, Ctrl+Z taking both back, ✘ Missed costing the guesser
// half and never the partner. Neither viewer window ever shows a card's words or its picture's name.
// One window: the second clue from tile open to ▦ Done, with a reload before the spin and once paired. The host page (on
// stream) never holds its card's words or its picture's name, in its text, labels, titles, toasts or screen-reader
// announcements; ⇄ Swap moves a card that follows a part; 📋 Copy words and 📋 Copy picture.
// Phone buzzers, against a fake room (as in remotebuzz.mjs): nobody buzzes on a partner clue (a plain clue still opens
// them), the room hears who plays which part and how it went, and never a card. With teams, the wheel spins over the
// other teams and each team scores its share.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, mainButton, mainLabel, openGameFile, playWithPlayers, png } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
mkdirSync(resolve('test-results'), { recursive: true });

// Words and a file name that are only on the second clue's card (Movies $600), and words only on the first clue's
// second card: none of them may ever be on stream.
const SECRET = 'Marmalade-zyxq-spots';
const PIC = 'qwzx-unicorn.png';
const ONIONS = 'Ogres are like onions';
const PIC2 = 'zorbu-swamp.png';
const CARD_ONLY = [SECRET, 'zyxq', PIC, 'qwzx', 'unicorn'];

/**
 * Everything a page has put on screen or said since it loaded (or since `watch`): text added, and the labels, titles
 * and alt texts set, the screen-reader announcements included (the live region sits in a closed shadow root: its host's
 * data-said has its words). Toasts and announcements come and go; this keeps them.
 */
function recordSeen() {
  const seen = (window.__seen = []);
  const ATTRS = ['aria-label', 'title', 'alt', 'aria-description', 'placeholder', 'data-said'];
  const take = (n) => {
    if (n.nodeType === Node.TEXT_NODE) seen.push(n.data);
    else if (n.nodeType === Node.ELEMENT_NODE) {
      seen.push(n.textContent ?? '');
      for (const el of [n, ...n.querySelectorAll('*')]) for (const a of ATTRS) if (el.hasAttribute(a)) seen.push(el.getAttribute(a));
    }
  };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(take);
      else if (m.type === 'characterData') seen.push(m.target.data);
      else if (m.target.hasAttribute(m.attributeName)) seen.push(m.target.getAttribute(m.attributeName));
    }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
/** From now on: what this page shows and says (the editor before it held the cards, by design). */
const watch = (p) => p.evaluate(() => (window.__seen.length = 0));
/** None of `words` is on the page now, nor was since `watch` (case aside: a text box may show its words in capitals). */
async function never(pages, words, when) {
  const found = [];
  for (const [p, name] of pages) {
    const text = await p.evaluate(() =>
      [
        document.body.innerText,
        ...[...document.querySelectorAll('[aria-label], [title], [alt], [data-said]')].flatMap((e) => ['aria-label', 'title', 'alt', 'data-said'].map((a) => e.getAttribute(a) ?? '')),
        ...window.__seen,
      ]
        .join('\n')
        .toLowerCase(),
    );
    for (const w of words) if (text.includes(w.toLowerCase())) found.push(`“${w}” in ${name}`);
  }
  assert(!found.length, `${when}: ${found.length ? found.join(', ') : 'no card’s words, nor its picture’s name'}`);
}

const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await context.addInitScript(recordSeen);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));

// ---------- A fake buzzer room (as in remotebuzz.mjs) ----------
/** POST /api/rooms makes room BCDF; a socket says welcome; everything the host sends is kept (window.__room.sent). */
function fakeRoom() {
  try {
    const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
    if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: 'https://buzz.test' }));
  } catch {}
  const room = (window.__room = { sockets: [], sent: [] });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const u = String(url);
    if (u === 'https://buzz.test/api/rooms' && init?.method === 'POST') return new Response(JSON.stringify({ code: 'BCDF', hostToken: 'secret-token' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u === 'https://buzz.test/api/health') return new Response('{"ok":true}', { status: 200 });
    return realFetch(url, init);
  };
  class FakeSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      room.sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.onopen?.({});
        this.onmessage?.({ data: JSON.stringify({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: Date.now() }) });
      }, 20);
    }
    send(d) {
      room.sent.push(JSON.parse(d));
    }
    close() {
      this.readyState = 3;
    }
  }
  window.WebSocket = FakeSocket;
  window.__say = (m) => room.sockets.at(-1).onmessage?.({ data: JSON.stringify(m) });
  window.__state = () => [...room.sent].reverse().find((m) => m.t === 'state')?.state;
}

let textIds = 0;
const textEl = (t) => ({ id: `t${textIds++}`, kind: 'text', text: t, x: 120, y: 90, w: 1680, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slideOf = (t) => ({ background: {}, elements: [textEl(t)] });

/**
 * A game with phone buzzers on (`teams`: each player a team), Movies $200 a plain clue and $400 a Describe it partner
 * clue with a card, opened in a page of its own with the fake room started and the game under way.
 */
async function roomGame(names, teams) {
  const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
  const values = [200, 400];
  const clue = (c, r) => {
    const base = { id: `q${c}_${r}`, value: null, type: 'standard', questionSlide: slideOf('A plain clue'), answerSlide: slideOf('Plain') };
    if (r === 0) return base;
    return { ...base, type: 'partner', partner: { ...rules }, timerSeconds: 45, questionSlide: slideOf('Describe this movie quietly'), answerSlide: slideOf('Shrek'), cards: [{ id: `c${c}`, to: 'giver', ...slideOf('Card-only-zz words') }] };
  };
  const g = {
    id: `g_partner_room_${teams ? 'teams' : 'players'}`,
    version: 2,
    title: teams ? 'Partner teams' : 'Partner buzzers',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true, ...(teams ? { buzzTeams: true } : {}),
    },
    players: names.map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
    rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 0, categories: ['Movies', 'Songs'].map((title, c) => ({ id: `cat${c}`, title, clues: values.map((_, r) => clue(c, r)) })) }],
    media: [], audio: {}, wheels: [], dice: [], theme: {},
  };
  const gameFile = resolve(`test-results/partner-room-${teams ? 'teams' : 'players'}.json`);
  writeFileSync(gameFile, JSON.stringify(g));
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(fakeRoom);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[room] ${e.message}`));
  p.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));
  await p.goto(pathToFileURL(file).href);
  await openGameFile(p, gameFile);
  await p.getByText(/^Opened “/).waitFor();
  await p.getByRole('button', { name: '▶ Play' }).click();
  const card = p.getByRole('region', { name: 'Phone buzzers' });
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await card.getByLabel('Room code BCDF').waitFor();
  await p.getByRole('button', { name: 'Start game ▶' }).click();
  await p.locator('.stage-box .tile').first().waitFor();
  const state = () => p.evaluate(() => window.__state());
  return {
    p,
    stage: (sel) => p.locator(`.stage-box ${sel}`),
    panel: p.locator('.panel [data-partner-panel]'),
    state,
    sent: () => p.evaluate(() => window.__room.sent),
    say: (m) => p.evaluate((m) => window.__say(m), m),
    /** Wait until the last state sent to the room matches. */
    stateIs: (fn) => p.waitForFunction((src) => !!window.__state() && new Function('s', `return (${src})(s)`)(window.__state()), fn.toString()),
    toast: (t) => p.locator('.toast', { hasText: t }).waitFor({ timeout: 5000 }).then(() => true, () => false),
  };
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await page.locator('.cat textarea').first().fill('Movies');

  // ---------- Making a tile a partner clue ----------
  await page.locator('[data-tile="0,1"]').click();
  const dialog = page.getByRole('dialog', { name: 'Edit clue' });
  await dialog.waitFor();
  const tabs = dialog.getByRole('tablist', { name: 'Slides' });
  const tabNames = () => tabs.getByRole('tab').allInnerTexts();
  const opens = (name) => tabs.locator('[role="tab"][aria-selected="true"]', { hasText: name }).waitFor({ timeout: 3000 }).then(() => true, () => false);
  const away = () => dialog.locator('header .value').click();
  const undo = () => page.keyboard.press('Control+z');
  const redo = () => page.keyboard.press('Control+y');
  const card = dialog.locator('[data-field="card"]');
  const settings = dialog.getByRole('group', { name: 'Partner clue' });
  const summary = () => settings.locator('p.hint').first().innerText();

  assert((await dialog.getByRole('option', { name: '🤝 Partner clue' }).count()) === 1, 'the Type box offers 🤝 Partner clue');
  await dialog.locator('select').first().selectOption('partner');
  await settings.waitFor();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', 'Answer']), `a partner clue's tabs: Question · 🤫 Card 1 · Answer (${await tabNames()})`);
  assert((await settings.locator('select').first().inputValue()) === 'describe', 'it starts as 🗣 Describe it');
  assert((await dialog.getByLabel('⏱ Countdown (s)').inputValue()) === '45', 'with a 45 s countdown');
  assert((await summary()) === 'On this $400 tile: got → describer +$400, guesser +$200 · missed → guesser −$200', `the points in money on this tile (${await summary()})`);
  await dialog.locator('[data-field="q"]').fill('Describe this movie without saying its name!');
  await dialog.locator('[data-field="a"]').fill('Shrek');

  // ---------- The card ----------
  await tabs.getByRole('tab', { name: '🤫 Card 1' }).click();
  assert((await dialog.getByText('🤫 CARD 1 · ONLY WHO YOU SEND IT TO SEES IT').count()) === 1, 'Card 1 opens with its badge');
  assert((await dialog.getByLabel('Goes to').inputValue()) === 'giver', 'Card 1 goes to the describer');
  assert((await dialog.getByRole('option', { name: 'the describer (the partner)' }).count()) === 1, 'in the game’s words, saying who that is');
  await away();
  await dialog.getByRole('button', { name: '⧉ Same as the answer' }).click();
  assert((await card.inputValue()) === 'Shrek', '⧉ Same as the answer copies the answer onto the card');
  assert((await dialog.getByText('This card shows the answer: whoever you send it to sees it').count()) === 1, 'and the tab says the card shows the answer');
  assert((await dialog.getByRole('button', { name: '⧉ Same as the answer' }).count()) === 0, '⧉ is only offered on an empty card');
  await undo();
  await page.waitForFunction(() => document.querySelector('[data-field="card"]')?.value === '', null, { timeout: 3000 });
  assert(await opens('Card 1'), 'Ctrl+Z takes the copy back, on the card’s tab');
  await redo();
  await page.waitForFunction(() => document.querySelector('[data-field="card"]')?.value === 'Shrek', null, { timeout: 3000 });
  // A copy, not a link: the answer changed afterwards leaves the card.
  await dialog.locator('[data-field="a"]').fill('Shrek 2');
  assert((await card.inputValue()) === 'Shrek', 'changing the answer afterwards doesn’t change the card');
  assert((await dialog.getByText('This card shows the answer').count()) === 0, 'and the card no longer says it shows the answer');
  await dialog.locator('[data-field="a"]').fill('Shrek');
  await dialog.getByLabel('Goes to').selectOption('both');
  assert((await dialog.getByLabel('Goes to').inputValue()) === 'both', 'Goes to can be both of them');

  // ---------- ＋ Card, the tabs' keys, 🗑 Delete card ----------
  await away();
  await dialog.getByRole('button', { name: '＋ Card' }).click();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', '🤫 Card 2', 'Answer']), '＋ Card adds Card 2 before the answer');
  assert(await opens('Card 2'), 'and opens it');
  assert(await card.evaluate((e) => e === document.activeElement), 'its words box has the focus, ready to type');
  await page.keyboard.type('Ogres are like onions');
  assert((await dialog.locator('label.field', { has: page.locator('[data-field="card"]') }).innerText()).includes('Card 2 words'), 'the quick box is the open card’s');
  await tabs.getByRole('tab', { name: 'Question slide' }).click();
  await tabs.getByRole('tab', { name: 'Question slide' }).focus();
  const keyTo = async (key, name) => (await page.keyboard.press(key), opens(name));
  assert((await keyTo('ArrowRight', 'Card 1')) && (await keyTo('ArrowRight', 'Card 2')) && (await keyTo('ArrowRight', 'Answer')), '→ goes Question · Card 1 · Card 2 · Answer');
  assert((await keyTo('Home', 'Question slide')) && (await keyTo('End', 'Answer')) && (await keyTo('ArrowLeft', 'Card 2')), 'Home, End and ← too');
  // Delete on a card's tab does nothing (as on the Answer's): 🗑 Delete card does it.
  await page.keyboard.press('Delete');
  assert((await tabs.getByRole('tab').count()) === 4, 'Delete on a card’s tab deletes nothing');
  await dialog.getByRole('button', { name: '🗑 Delete card' }).click();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', 'Answer']), '🗑 Delete card takes it out');
  await away();
  await undo();
  assert((await opens('Card 2')) && (await card.inputValue()) === 'Ogres are like onions', 'Ctrl+Z brings it back, open');

  // ---------- Points ----------
  const points = settings.getByRole('combobox', { name: /^Points/ });
  await points.selectOption('none');
  assert((await summary()).endsWith('missed → nobody loses points'), `Points “No penalty”: a miss costs nobody (${await summary()})`);
  await settings.getByLabel(/^Guesser’s share if it’s missed/).fill('-75');
  assert((await points.inputValue()) === 'custom', 'typing a share makes the Points Custom');
  assert((await summary()).endsWith('missed → guesser −$300'), `and the money follows (${await summary()})`);
  await points.selectOption('game');
  await settings.getByRole('radio', { name: 'the picker' }).check();
  assert((await summary()) === 'On this $400 tile: got → describer +$400, guesser +$200 · missed → nobody loses points', `the picker describing: the partner guesses, and never loses points (${await summary()})`);
  await settings.getByRole('checkbox', { name: 'The partner never loses points' }).uncheck();
  assert((await summary()).endsWith('missed → guesser −$200'), 'unticked, a miss costs the partner too');
  await settings.getByRole('checkbox', { name: 'The partner never loses points' }).check();
  await settings.getByRole('radio', { name: 'the partner' }).check();
  await settings.getByRole('combobox', { name: /^Game/ }).selectOption('help');
  assert((await summary()) === 'On this $400 tile: got → helper +$200, answerer +$400 · missed → answerer −$200', `🙋 Help a friend: its own words and points (${await summary()})`);
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', '🤫 Card 2', 'Answer']), 'a game chosen keeps the cards the clue has');
  await settings.getByRole('combobox', { name: /^Game/ }).selectOption('describe');
  await page.screenshot({ path: 'test-results/partner-editor.png' });

  // ---------- The board, Find and the history ----------
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  const tile = page.locator('[data-tile="0,1"]');
  assert((await tile.locator('.dd[title^="Partner clue"]').count()) === 1, 'the board shows the tile’s 🤝 badge');
  assert((await tile.getAttribute('aria-label')).includes(', partner clue:'), 'and its name says so');
  await page.keyboard.press('Control+f');
  const find = page.getByRole('combobox', { name: 'Find' });
  await find.fill('onions');
  const found = await page.getByRole('listbox', { name: 'Found' }).getByRole('option').allInnerTexts();
  assert(found.length === 1 && found[0].includes('Movies › $400 › Card 2'), `Find finds a card’s words, and says which card (${found.join(' | ')})`);
  await find.press('Enter');
  await dialog.waitFor();
  assert(await opens('Card 2'), 'and opens its tab');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-field') === 'card', null, { timeout: 3000 });
  assert((await card.inputValue()) === 'Ogres are like onions', 'with the focus in its words box');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.locator('nav button', { hasText: 'History' }).first().click();
  const history = await page.locator('main').innerText();
  for (const label of ['Made Movies $400 a partner clue', 'Copied the answer onto card 1 of Movies $400', 'Edited card 2 “Ogres are like onions”', 'Card 1 of Movies $400 goes to both of them', 'Made Movies $400 a Help a friend partner clue'])
    assert(history.includes(label), `the history says “${label}”`);
  await page.locator('nav > button.round-tab').first().click();

  // ---------- Off and on again, and a reload ----------
  await tile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '🤝 Not a partner clue' }).click();
  assert((await tile.locator('.dd[title^="Partner clue"]').count()) === 0, 'the tile menu makes it a plain clue again');
  await tile.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '🤝 Make it a partner clue' }).click();
  // (The page keeps the last changes as it goes away, so the reload can come at once.)
  await tile.locator('.dd[title^="Partner clue"]').waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await tile.click();
  await dialog.waitFor();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', '🤫 Card 2', 'Answer']), 'made one again, and after a reload, it has its cards back');
  await tabs.getByRole('tab', { name: '🤫 Card 1' }).click();
  assert((await card.inputValue()) === 'Shrek' && (await dialog.getByLabel('Goes to').inputValue()) === 'both', 'with their words and who they go to');

  // ---------- Pictures from this computer on the cards, and a second partner clue with a card of its own ----------
  /** 🖼 Image › ⬆ Upload image file… on the slide open in the clue: a picture named `name`. */
  async function addPicture(name, r, g, b) {
    const before = await dialog.locator('.slide .el img').count();
    await dialog.getByRole('button', { name: '🖼 Image' }).click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('dialog', { name: 'Choose image' }).getByRole('button', { name: '⬆ Upload image file…' }).click()]);
    await chooser.setFiles({ name, mimeType: 'image/png', buffer: png(r, g, b, 160, 120) });
    await dialog.locator('.slide .el img').nth(before).waitFor();
  }
  await tabs.getByRole('tab', { name: '🤫 Card 2' }).click();
  await addPicture(PIC2, 20, 160, 60);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.locator('[data-tile="0,2"]').click();
  await dialog.waitFor();
  await dialog.locator('select').first().selectOption('partner');
  await settings.waitFor();
  await dialog.locator('[data-field="q"]').fill('Describe this animal without saying its name!');
  await dialog.locator('[data-field="a"]').fill('Leopard');
  await tabs.getByRole('tab', { name: '🤫 Card 1' }).click();
  await card.fill(SECRET);
  await addPicture(PIC, 200, 60, 20);
  assert((await opens('Card 1')) && (await card.inputValue()) === SECRET, 'the second clue’s Card 1 has its own words and a picture from a file');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });

  // ---------- Two windows ----------
  console.log('Two windows:');
  await playWithPlayers(page, 4);
  for (const [i, name] of ['Ann', 'Bob', 'Cat', 'Dan'].entries()) await page.getByLabel(`Player ${i + 1} name`).fill(name);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  const stage = (sel, opts) => page.locator(`.stage-box ${sel}`, opts);
  const tileOf = (value) => stage(`.tile[aria-label="Movies for ${value}"]`);
  await tileOf('$400').waitFor();
  const panel = page.locator('.panel [data-partner-panel]');
  const chip = (name) => panel.getByRole('button', { name, exact: true });
  const pressed = (name) => chip(name).getAttribute('aria-pressed');
  const toast = (t) => page.locator('.toast', { hasText: t }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  const judged = panel.locator('[data-judged]');
  const gotBtn = panel.locator('[data-partner-judge]').getByRole('button', { name: /✔ Got it/ });
  const scoreOf = (name) => page.locator(`.panel .players .p[aria-label="${name}"] .score`).innerText().then((t) => t.trim());
  const scores = async () => Object.fromEntries(await Promise.all(['Ann', 'Bob', 'Cat', 'Dan'].map(async (n) => [n, await scoreOf(n)])));
  const picker = () => page.locator('.panel .players .p.picker').getAttribute('aria-label', { timeout: 1000 }).catch(() => null);
  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

  const [aud] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('a')]);
  aud.on('pageerror', (e) => errors.push(`[audience] ${e.message}`));
  await aud.locator('.board').waitFor();
  const [sc] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Shift+A')]);
  sc.on('pageerror', (e) => errors.push(`[scores] ${e.message}`));
  await sc.locator('.strip .plate').first().waitFor();
  const viewers = [
    [aud, 'the audience window'],
    [sc, 'the scores window'],
  ];
  for (const [p] of viewers) await watch(p);
  /** The scores window comes to show these scores (a plate's score's title is the score, not the count-up on it). */
  const platesSay = (want) =>
    sc
      .waitForFunction(
        (want) => Object.entries(want).every(([name, score]) => [...document.querySelectorAll('.plate')].some((p) => p.querySelector('.name .nm')?.textContent.trim() === name && p.querySelector('.score .nm')?.getAttribute('title') === score)),
        want,
      )
      .then(() => true);
  // (Card 1 is the answer, so "Shrek" is fine on stream once the answer is: until then it's a card's words too.)
  const hidden = [ONIONS, PIC2, 'zorbu', 'Shrek', ...CARD_ONLY];

  // ---------- PARTNER UP!, who picked it, and the wheel never drawing the picker ----------
  await tileOf('$400').click();
  await aud.locator('[data-partner-up]').waitFor();
  assert((await panel.innerText()).includes('Who picked it?'), 'nobody was marked to pick: the panel asks who picked it');
  await page.keyboard.press('1');
  await panel.getByText('Ann picked it.').waitFor();
  await aud.locator('[data-partner-up]', { hasText: 'Ann' }).waitFor();
  const info = page.locator('.info [data-partner-cards-info]');
  const infoText = await flat(info);
  assert(
    infoText.includes('Card 1 → both of them') && infoText.includes('This card shows the answer') && infoText.includes('Card 2 → the describer') && infoText.includes(ONIONS) && infoText.includes(`🖼 ${PIC2} · picture`),
    `the host column (not on stream) lists the cards as text, with who they go to and their pictures’ names (${infoText})`,
  );
  await page.keyboard.press('w');
  // Every look at both stages, from the moment the wheel is up to its landing: Ann's slice is never drawn.
  const drawn = new Set();
  let looks = 0;
  for (const deadline = Date.now() + 15000; ; ) {
    for (const p of [page, aud]) {
      const slices = await p.locator(`${p === page ? '.stage-box ' : ''}.wheel text`).allTextContents();
      if (slices.length) looks++;
      for (const t of slices) drawn.add(t.trim());
    }
    if (await panel.locator('button.chip[aria-pressed="true"]').count()) break;
    if (Date.now() > deadline) throw new Error('the partner wheel never landed');
    await page.waitForTimeout(100);
  }
  assert(looks >= 4 && !drawn.has('Ann') && ['Bob', 'Cat', 'Dan'].every((n) => drawn.has(n)), `W spins a wheel of the others: Ann is never on it, on either stage, before or during the spin (${looks} looks: ${[...drawn].join(', ')})`);
  await page.keyboard.press('Escape');
  await aud.locator('.wheel').waitFor({ state: 'detached' });
  await page.keyboard.press('2');
  await aud.locator('[data-partner-up]', { hasText: 'Bob' }).waitFor();
  assert((await pressed('Bob is the partner')) === 'true', '2 overrules the wheel: Bob is the partner, on stream too');
  await never(viewers, hidden, 'PARTNER UP!');

  // ---------- ▶ Show question, with Enter held down ----------
  await page.keyboard.down('Enter');
  await aud.locator('[data-partner-badge]').waitFor();
  await page.keyboard.down('Enter');
  await page.waitForTimeout(1100);
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert((await mainLabel(page)) === '⏱ Start the clock' && (await aud.locator('.timer').count()) === 0, 'Enter held down shows the question once, and its repeats (even a second later) don’t start the clock');
  assert((await flat(aud.locator('[data-partner-badge]'))) === '🗣 Bob describes → 🎯 Ann guesses', 'the stream shows who plays which part');
  await never(viewers, hidden, 'the question');

  // ---------- Handing out the cards: one given to someone else, and copied for them ----------
  assert((await pressed('Card 1 to Ann')) === 'true' && (await pressed('Card 1 to Bob')) === 'true' && (await pressed('Card 2 to Bob')) === 'true', 'Card 1 starts with both of them, Card 2 with the describer (as the editor set them)');
  assert((await flat(panel.locator('[data-card="2"]'))).startsWith('Card 2 · 1 line of words, 1 picture'), 'the list counts what’s on a card');
  await chip('Card 2 to Cat').click();
  await chip('Card 2 to Bob').click();
  assert((await pressed('Card 2 to Cat')) === 'true' && (await pressed('Card 2 to Bob')) === 'false' && (await panel.locator('[data-card="2"]').innerText()).includes('(changed)'), 'Card 2 given to Cat instead: the row says it changed');
  assert((await flat(info)).includes('Card 2 → Cat'), 'and the host column says who gets it');
  await panel.locator('[data-card="2"]').getByRole('button', { name: '📋 Copy words' }).click();
  assert(await toast('Card 2’s words copied: paste them to Cat'), '📋 Copy words says who to paste it to');
  assert((await page.evaluate(() => navigator.clipboard.readText())) === `🤫 For Cat only (Movies $400, card 2): ${ONIONS}`, 'and copies the card for Cat');
  await never(viewers, hidden, 'handing out the cards');

  // ---------- ⏱ Start the clock, then Enter again at once, then held down: no score ----------
  // (The keys back to back: the guard is the second after the clock starts.)
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(1100);
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await aud.locator('.timer').waitFor();
  await sc.locator('.clock').waitFor();
  assert((await mainLabel(page)) === '👁 Reveal answer', 'Enter starts the clock, on stream and in the scores window');
  assert(await toast('The clock just started: press Enter again to give ✔ Got it'), 'Enter again at once gives no score, and says why');
  assert(Object.values(await scores()).every((s) => s === '$0') && (await judged.count()) === 0, 'nor does Enter held down, even once its repeats come a second later');

  // ---------- ✔ Got it: the default shares, and the guesser picks next ----------
  assert((await picker()) === null, 'nobody is marked to pick on the board (Ann only picked this clue)');
  await page.keyboard.press('Enter');
  await judged.waitFor();
  let sc1 = await scores();
  assert(sc1.Bob === '$400' && sc1.Ann === '$200' && sc1.Cat === '$0', `Enter: ✔ Got it gives the describer the tile’s value and the guesser half (${JSON.stringify(sc1)})`);
  assert((await picker()) === 'Ann', 'Ann, the guesser, picks next');
  await aud.locator('.pops .pop').nth(1).waitFor();
  await aud.locator('.timer').waitFor({ state: 'detached' });
  await sc.waitForFunction(() => !document.querySelector('.clock'));
  assert(await platesSay({ Bob: '$400', Ann: '$200' }), 'two pops on stream, the countdown stops, and the scores window has both scores');
  await never(viewers, hidden, 'judged');

  // ---------- Ctrl+Z takes both back; ✘ Missed costs the guesser half, never the partner ----------
  await page.keyboard.press('Control+z');
  await gotBtn.and(page.locator(':enabled')).waitFor();
  sc1 = await scores();
  assert(sc1.Bob === '$0' && sc1.Ann === '$0' && (await picker()) === null, 'one Ctrl+Z takes both scores back, and the board’s picker');
  await aud.locator('.timer').waitFor();
  assert((await pressed('Card 2 to Cat')) === 'true', 'the countdown comes back, and the cards’ list opens again as it was');
  await platesSay({ Ann: '$0', Bob: '$0' });
  await page.keyboard.press('Shift+Enter');
  await judged.waitFor();
  sc1 = await scores();
  assert(sc1.Ann === '−$200' && sc1.Bob === '$0' && (await flat(judged)) === 'Judged: Bob ✘ 0 · Ann ✘ −$200', `Shift+Enter: ✘ Missed costs Ann, the guesser, half; Bob, the partner, nothing (${JSON.stringify(sc1)})`);
  assert((await picker()) === null, 'a miss leaves the board as it was');
  await platesSay({ Ann: '−$200', Bob: '$0' });
  await never(viewers, hidden, 'missed');
  await page.keyboard.press('r');
  await aud.locator('[data-slide="answer"]').waitFor();
  await never(viewers, [ONIONS, PIC2, 'zorbu', ...CARD_ONLY], 'the answer');
  assert((await mainLabel(page)) === '▦ Done ▶ board', 'then ▦ Done');
  await mainButton(page).click();
  await aud.locator('.board').waitFor();
  await never(viewers, [ONIONS, PIC2, 'zorbu', ...CARD_ONLY], 'back on the board');
  await page.screenshot({ path: 'test-results/partner-two-windows.png' });

  // Back to one window: the scores window, then the audience window (it asks first).
  await Promise.all([sc.waitForEvent('close'), page.locator('.panel button[aria-label="Close the scores window"]').click()]);
  await page.locator('.panel').getByRole('button', { name: '📺 Audience ●' }).click();
  // (A confirmation ignores a click in its first moment, against a double-click: click until the window goes.)
  for (let i = 0; !aud.isClosed(); i++) {
    if (i > 20) throw new Error('the audience window never closed');
    await page.locator('.panel .confirm').getByRole('button', { name: 'Close it' }).click({ timeout: 5000 });
    await aud.waitForEvent('close', { timeout: 250 }).catch(() => {});
  }

  // ---------- One window: Movies $600, from tile open to ▦ Done ----------
  console.log('One window:');
  const host = [[page, 'the host page']];
  await watch(page);
  await tileOf('$600').click();
  await stage('[data-partner-up]').waitFor();
  await page.keyboard.press('1');
  await panel.getByText('Ann picked it.').waitFor();
  assert((await panel.innerText()).includes('⚠ Viewers can see this window'), 'the panel says viewers can see this window');
  await never(host, CARD_ONLY, 'PARTNER UP!');
  /** Reload the page and resume the game in one window (the editor shows first, with Resume game: on stream too). */
  const resume = async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Resume game' }).click();
    await page.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
    await panel.getByText('Ann picked it.').waitFor();
  };
  await resume();
  assert((await mainLabel(page)) === '🎡 Spin for a partner' && (await stage('[data-partner-up]').count()) === 1, 'a reload before the spin: PARTNER UP!, Ann picked it, 🎡 Spin for a partner next');
  await never(host, CARD_ONLY, 'reloaded before the spin');
  await page.keyboard.press('w');
  await stage('.wheel').waitFor();
  await panel.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 15000 });
  await page.keyboard.press('Escape');
  await stage('.wheel').waitFor({ state: 'detached' });
  await page.keyboard.press('2');
  await panel.locator('button[aria-label="Bob is the partner"][aria-pressed="true"]').waitFor();
  assert(true, 'paired: Ann and Bob');
  await never(host, CARD_ONLY, 'paired');

  await resume();
  assert((await pressed('Bob is the partner')) === 'true' && (await mainLabel(page)) === '▶ Show question' && (await stage('[data-partner-up]').count()) === 1, 'a reload once paired: PARTNER UP!, Ann and Bob, ▶ Show question next');
  await never(host, CARD_ONLY, 'reloaded, paired');

  // (Back to back: the guard is the second after the question goes up.)
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await stage('[data-partner-badge]').waitFor();
  const shownAt = Date.now();
  assert(await toast('The question just went up: press Enter again to start the clock'), 'Enter shows the question; Enter again at once doesn’t start the clock');
  assert((await mainLabel(page)) === '⏱ Start the clock' && (await stage('.timer').count()) === 0, 'no countdown runs');
  const row = panel.locator('[data-card="1"]');
  assert((await flat(row)).includes('Card 1 · 1 line of words, 1 picture'), `the list counts what’s on the card, and never says it (${await flat(row)})`);
  assert((await pressed('Card 1 to Bob')) === 'true', 'Card 1 goes to the describer, Bob');
  await panel.getByRole('button', { name: '⇄ Swap' }).first().click();
  await stage('[data-partner-badge]', { hasText: 'Ann describes' }).waitFor();
  assert((await pressed('Card 1 to Ann')) === 'true' && (await pressed('Card 1 to Bob')) === 'false', '⇄ Swap: a card that follows the describer goes to Ann');
  await panel.getByRole('button', { name: '⇄ Swap' }).first().click();
  await stage('[data-partner-badge]', { hasText: 'Bob describes' }).waitFor();
  await row.getByRole('button', { name: '📋 Copy words' }).click();
  assert(await toast('Card 1’s words copied: paste them to Bob'), '📋 Copy words says who to paste it to, never what');
  assert((await page.evaluate(() => navigator.clipboard.readText())) === `🤫 For Bob only (Movies $600, card 1): ${SECRET}`, 'and the words go on the clipboard only');
  await row.getByRole('button', { name: '📋 Copy picture' }).click();
  assert(await toast('Card 1’s picture copied: paste it to Bob'), '📋 Copy picture says who to paste it to');
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
  assert(types.includes('image/png'), `and puts the picture on the clipboard (${types.join(', ')})`);
  await never(host, CARD_ONLY, 'handing out the cards');

  // A second after the question went up, Enter starts the clock.
  await page.waitForTimeout(Math.max(0, shownAt + 1100 - Date.now()));
  await page.keyboard.press('Enter');
  await stage('.timer').waitFor();
  await never(host, CARD_ONLY, 'the clock running');
  await page.waitForTimeout(1100);
  await page.keyboard.press('Enter');
  await judged.waitFor();
  assert((await flat(judged)) === 'Judged: Bob ✔ +$600 · Ann ✔ +$300', `✔ Got it: Bob +$600, Ann +$300 (${await flat(judged)})`);
  await page.keyboard.press('l');
  await page.locator('aside').getByText('partner clue: Bob described, Ann guessed').first().waitFor();
  await never(host, CARD_ONLY, 'judged, 📜 Log open');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await gotBtn.and(page.locator(':enabled')).waitFor();
  await page.keyboard.press('Enter');
  await judged.waitFor();
  await never(host, CARD_ONLY, 'undone and judged again');
  await page.keyboard.press('r');
  await stage('[data-slide="answer"]').waitFor();
  await never(host, CARD_ONLY, 'the answer');
  await mainButton(page).click();
  await stage('.tile[aria-label="Movies for $600, played"]').waitFor();
  await never(host, CARD_ONLY, '▦ Done ▶ board (all of it, from the tile opening)');
  // (The check sees what comes and goes: the toasts, and what screen readers were told, long after they went.)
  const heard = await page.evaluate(() => window.__seen.join('\n'));
  assert(heard.includes('Card 1’s words copied: paste them to Bob.') && (await page.locator('.toast', { hasText: 'words copied' }).count()) === 0, 'the check above heard every toast and announcement, gone since');
  await page.screenshot({ path: 'test-results/partner-one-window.png' });

  // ---------- Phone buzzers, against a fake room: nobody buzzes, and the room never gets a card ----------
  console.log('Phone buzzers (a fake room):');
  {
    const { p, stage: rs, panel: rp, state, sent, say, stateIs, toast: rtoast } = await roomGame(['Ann', 'Bob', 'Cat'], false);
    // A plain clue opens the buzzers at once (the room is live, Buzzer mode on).
    await rs('.tile[aria-label="Movies for $200"]').click();
    await stateIs((st) => st.phase === 'armed' && !!st.clue);
    await p.keyboard.press('Escape');
    await stateIs((st) => st.phase === 'lobby');
    assert(true, 'a plain clue opens the buzzers as it opens (the room is live)');
    await p.keyboard.press('p');
    await p.keyboard.press('1');
    await stateIs((st) => st.status?.text === 'Ann picks the next clue');
    const from = (await sent()).length;

    await rs('.tile[aria-label="Movies for $400"]').click();
    await stateIs((st) => st.status?.text === '🤝 Partner clue: Ann needs a partner…');
    let st = await state();
    assert(st.phase === 'lobby' && !st.clue && st.status.seats.join() === 'p1' && st.status.seatsText === '🤝 Your partner clue! Spinning for your partner…', 'a partner clue opens with the buzzers off: the phones hear who needs a partner (Ann’s: it’s hers)');
    await p.keyboard.press('w');
    await rp.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 15000 });
    await p.keyboard.press('Escape');
    await rs('.wheel').waitFor({ state: 'detached' });
    await p.keyboard.press('2');
    await stateIs((st) => st.status?.text === '🤝 Partner clue: Ann + Bob');
    assert((await state()).status.seatsText === '🤝 You two play this one!', 'paired: “🤝 You two play this one!” on both their phones');
    await p.keyboard.press('Enter');
    await rs('[data-partner-badge]').waitFor();
    const shown = Date.now();
    await stateIs((st) => st.status?.text === '🤝 Bob describes → Ann guesses');
    st = await state();
    assert(st.phase === 'lobby' && !st.clue && st.status.seats.join() === 'p2' && st.status.seatsText === '🗣 You’re describing!', 'the question up: still no buzzers and no question words; the describer’s phone says so');
    assert((await p.locator('.panel .row.buzzrow').count()) === 1 && (await p.locator('.panel [data-buzzrow]').count()) === 0, 'the buzzers’ row is kept empty (the stage keeps its size), with nothing to open');
    await p.keyboard.press('u');
    assert(await rtoast('Nobody buzzes on a partner clue'), 'U: nobody buzzes on a partner clue');
    // A phone buzzing anyway (an older phone page, say): nobody is picked to answer.
    await say({ t: 'buzz', armId: st.armId, seatId: 'p3', rank: 1, afterMs: 0 });
    await say({ t: 'queue', armId: st.armId, queue: [{ seatId: 'p3', afterMs: 0 }] });
    await p.locator('.panel .players').waitFor();
    await p.waitForTimeout(300);
    // (div.plate: the answering player's plate, not a score plate.)
    assert((await p.locator('.panel .p .sel[aria-pressed="true"]').count()) === 0 && (await rs('div.plate').count()) === 0 && (await state()).phase === 'lobby', 'a buzz from a phone picks nobody');
    await p.waitForTimeout(Math.max(0, shown + 1100 - Date.now()));
    await p.keyboard.press('Enter');
    await rs('.timer').waitFor();
    const clockAt = Date.now();
    assert((await state()).phase === 'lobby', 'the clock starts: the buzzers stay off');
    await p.waitForTimeout(Math.max(0, clockAt + 1100 - Date.now()));
    await p.keyboard.press('Enter');
    await stateIs((st) => st.status?.text === '✔ Got it! Bob +$400 · Ann +$200');
    st = await state();
    assert(st.scores.p2 === 400 && st.scores.p1 === 200 && !st.status.seats, '✔ Got it: every phone says how it went, and the room has both scores');
    await p.keyboard.press('r');
    await stateIs((st) => st.status?.text === '🤝 Bob described → Ann guessed');
    await p.keyboard.press('Escape');
    await stateIs((st) => st.status?.text === 'Ann picks the next clue');
    const during = (await sent()).slice(from);
    const states = during.filter((m) => m.t === 'state').map((m) => m.state);
    assert(states.length > 3 && states.every((x) => x.phase === 'lobby' && !x.clue), `from tile open to the board, every state the room got had the buzzers off and no clue (${states.length} states)`);
    assert(!/Card-only-zz|quietly|"cards"/.test(JSON.stringify(during)), 'and nothing the room got held a card, or the question’s words');
    await p.context().close();
  }

  // ---------- Teams: team against team ----------
  console.log('Teams:');
  {
    const { p, stage: rs, panel: rp, state, stateIs } = await roomGame(['Red Team', 'Green Team', 'Blue Team'], true);
    await rs('.tile[aria-label="Movies for $400"]').click();
    await rs('[data-partner-up]').waitFor();
    assert((await rp.innerText()).includes('Which team picked it?') && (await mainButton(p).isDisabled()), 'nobody marked to pick: “Which team picked it?”, and no spin until then');
    assert((await mainButton(p).getAttribute('title')).startsWith('Which team picked it? Press their number first'), 'the main button says why');
    await p.keyboard.press('1');
    await rp.getByText('Red Team picked it.').waitFor();
    await stateIs((st) => st.status?.seatsText === '🤝 Your team’s partner clue! Spinning for your partner…');
    assert((await state()).status.seats.join() === 'p1', 'Red Team’s phones: “🤝 Your team’s partner clue!”');
    await p.keyboard.press('w');
    await rs('.wheel').waitFor();
    const slices = await rs('.wheel text').allTextContents();
    await rp.locator('button.chip[aria-pressed="true"]').waitFor({ timeout: 15000 });
    const landed = (await rp.locator('button.chip[aria-pressed="true"]').getAttribute('aria-label')).replace(' is the partner', '');
    assert(slices.map((t) => t.trim()).sort().join() === 'Blue Team,Green Team' && landed !== 'Red Team', `the wheel spins over the other teams (${slices.join(', ')}), and lands on one (${landed})`);
    await p.keyboard.press('Escape');
    await rs('.wheel').waitFor({ state: 'detached' });
    await p.keyboard.press('2');
    await stateIs((st) => st.status?.seatsText === '🤝 Your team plays this one!');
    await p.keyboard.press('Enter');
    await rs('[data-partner-badge]').waitFor();
    const shown = Date.now();
    await stateIs((st) => st.status?.text === '🤝 Green Team describes → Red Team guesses');
    assert((await state()).status.seatsText === '🗣 Your team is describing!', 'the question up: Green Team’s phones say the team is describing');
    assert((await rp.innerText()).includes('Copy each card to its teams'), 'the panel copies the cards to teams');
    await p.waitForTimeout(Math.max(0, shown + 1100 - Date.now()));
    await p.keyboard.press('Enter');
    await rs('.timer').waitFor();
    const clockAt = Date.now();
    await p.waitForTimeout(Math.max(0, clockAt + 1100 - Date.now()));
    await p.keyboard.press('Enter');
    await stateIs((st) => st.status?.text === '✔ Got it! Green Team +$400 · Red Team +$200');
    const st = await state();
    assert(st.scores.p2 === 400 && st.scores.p1 === 200 && st.scores.p3 === 0, '✔ Got it: each team scores its part’s share');
    await p.keyboard.press('Escape');
    await stateIs((st) => st.status?.text === 'Red Team picks the next clue');
    assert(true, 'and the guessing team picks next');
    await p.context().close();
  }

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner clue tests passed');
} catch (e) {
  await page.screenshot({ path: 'test-results/partner-failure.png' }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
