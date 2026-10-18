// 🎭 Deals, end to end (docs/PARTNER-CLUES-SPEC.md §11, §12, milestone P4): the built app hosts a game against the real
// buzzer room (buzzer/ under `wrangler dev`, local), with four phones on the real phone page. A ready-made deal goes in
// from the editor's 🎡 tab. In play, 🎭 Deal… deals the game's saved Odd one out (the host picks Bob as the spy, with
// the audience window open): nothing reaches the room until 📤 Send, then each phone gets its own card (the spy's
// words, or the location everyone else shares) under its own id, and the column beside the stage says who got which.
// Dan's phone goes: the deal's list marks him 📵, with 🪟 for the card window (the others, with phones, have none).
// ↻ Send again renews every card's id; 🎭 Who was who goes on stream only when pressed, and Ctrl+Z takes it off; a host
// reload keeps the deal and its cards; in one window the panel only counts the parts; ✖ Take back takes them all off.
// Neither the audience window before Who was who, nor the host page in one window, ever holds a card's words or the
// location. With four cards out, the deal's panel warns that its 📤 Send fills the phones; then, with the 8 they hold
// out, a tile's card and a partner clue's say in their panels why they can't go: the partner clue's by what's off now
// (📤 Send and start, then, the clock running, a card's 📤 Send or 📤 Send changes), never by what isn't.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { forgetSeen, mainButton, mainLabel, openGameFile, packGame, recordSeen, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// ---------- The game ----------

// The spy's card carries "qkzvx", every location "wqzj": neither may be on stream before Who was who.
const SPY = 'Spy-qkzvx words';
const PLACES = ['Beach-wqzj', 'Airport-wqzj', 'Casino-wqzj'];
const SECRETS = ['qkzvx', 'wqzj'];

let ids = 0;
const text = (t, y = 40) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1, kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...elements) => ({ background: {}, elements });

/** Waits (up to `ms`) until pred() holds. */
const until = async (pred, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
  return !!(await pred());
};

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-deal-');
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

  const plain = (id, extra = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(text('A question')), answerSlide: slide(text('An answer')), ...extra });
  const partnerClue = {
    type: 'partner', timerSeconds: 60,
    partner: { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' },
    cards: [
      { id: 'p1', to: 'giver', ...slide(text('Describe it')) },
      { id: 'p2', to: 'giver', ...slide(text('Then this')) },
    ],
  };
  const game = {
    id: 'g_deal',
    version: 2,
    title: 'Deals',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
    rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values: [200, 400], dailyDoubleCount: 0, categories: [{ id: 'cat0', title: 'Movies', clues: [plain('q1', { cards: [{ id: 't1', to: 'picker', ...slide(text('A tip')) }] }), plain('q2', partnerClue)] }] }],
    media: [], audio: {}, dice: [], theme: {},
    wheels: [{ id: 'w_loc', name: 'Places', segments: PLACES.map((label, i) => ({ id: `s${i}`, label, color: '#e6194b', weight: 1 })), spinDurationMs: 3000, removeAfterLanding: false }],
    deals: [
      {
        id: 'deal1', name: 'Odd one out', wheel: 'w_loc',
        parts: [
          { id: 'spy', name: 'Spy', count: 1, card: slide(text(SPY)) },
          { id: 'vil', name: 'Villager', count: 'rest', draw: 'shared', card: slide(text('The location:')) },
        ],
      },
    ],
  };
  const packPath = resolve('test-results/deal.brainrot');
  writeFileSync(packPath, await packGame(game, {}));

  // ---------- The host ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  await ctx.addInitScript(recordSeen);
  const host = watch(await ctx.newPage(), 'host');
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
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- In the editor: the saved deal, and a ready-made one ----------
  await host.getByRole('button', { name: /Wheels, Dice & Deals/ }).click();
  const deals = host.getByRole('list', { name: 'Deals' });
  await deals.getByRole('button', { name: 'Odd one out' }).click();
  const editor = host.locator('[data-deal-editor]');
  await editor.waitFor();
  assert((await editor.getByLabel('Part 1’s name').inputValue()) === 'Spy' && (await editor.getByLabel('Part 2’s name').inputValue()) === 'Villager', 'the saved deal’s parts: Spy and Villager');
  assert((await editor.getByLabel('How many get Villager').inputValue()) === 'rest' && (await editor.getByLabel('Villager’s card draws from the wheel').inputValue()) === 'shared', 'the Villagers are the rest, and share a slice of the wheel');
  await host.getByRole('button', { name: '📋 Ready-made deal…' }).click();
  await host.getByRole('menuitem', { name: /Secret roles/ }).click();
  assert(await until(async () => (await deals.getByRole('button').allInnerTexts()).map((t) => t.trim()).join('|') === 'Odd one out|Secret roles'), 'a ready-made deal goes in: Secret roles');
  assert((await editor.getByLabel('Part 3’s name').inputValue()) === 'Villager' && (await editor.getByLabel('Part 1’s name').inputValue()) === 'Wolf', 'with a wolf, a seer and villagers');
  // A part's choices are steps named after the part, not "Changed count of deal".
  const undoTitle = () => host.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  await editor.getByLabel('How many get Wolf').selectOption('2');
  assert(await until(async () => (await undoTitle()).startsWith('Undo: How many get Wolf in “Secret roles”: ×2')), `how many get a part is a step named after it (${await undoTitle()})`);
  await editor.getByLabel('Wolf’s card draws from the wheel').selectOption('shared');
  assert(await until(async () => (await undoTitle()).startsWith('Undo: Wolf’s card in “Secret roles”: + the slice they all share')), `and so is its card's wheel (${await undoTitle()})`);
  await host.keyboard.press('Control+z');
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await editor.getByLabel('How many get Wolf').inputValue()) === '1'), 'Ctrl+Z takes them back');
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await deals.getByRole('button').count()) === 1), 'Ctrl+Z takes it out again');

  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(roomCard);

  // ---------- Four phones ----------
  const heard = {};
  const phones = {};
  const join = async (seat) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), seat);
    heard[seat] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[seat].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat, exact: true }).click();
    await p.locator('#me').getByText(seat).waitFor();
    phones[seat] = p;
  };
  for (const s of ['Ann', 'Bob', 'Cat', 'Dan']) await join(s);
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const cards = () => last()?.cards ?? [];
  const cardsOn = (p) => p.locator('.card').count();

  // ---------- Two windows: the audience window, watched until Who was who ----------
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  const offStream = async (p, name, when) => {
    const found = await shownOf(p, SECRETS);
    assert(!found.length, `${when}: ${name} holds no card’s words or location${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  // ---------- 🎭 Deal…: Bob picked as the spy, dealt, nothing sent ----------
  const tools = host.locator('.panel .toolsrow');
  const openDeal = async () => {
    await tools.getByRole('button', { name: '🎭 Deal…' }).click();
    const d = host.getByRole('dialog', { name: 'Deal' });
    await d.waitFor();
    return d;
  };
  let dialog = await openDeal();
  assert((await dialog.getByRole('combobox', { name: 'The deal' }).inputValue()) === 'saved:deal1', 'it starts with the game’s saved deal');
  assert((await dialog.getByLabel('Spy’s card words').inputValue()) === SPY, 'two windows: the parts’ words show (viewers don’t see this window)');
  await dialog.locator('[data-deal-part="1"] summary').click();
  await dialog.getByRole('button', { name: 'Bob gets Spy' }).click();
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-counts]').waitFor();
  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 4: Spy ×1, Villager ×3', 'dealt: the panel counts the parts');
  const info = host.locator('[data-deal-info]');
  await info.waitFor();
  const infoText = await flat(info);
  const place = PLACES.find((p) => infoText.includes(p));
  assert(infoText.includes('Bob → Spy') && ['Ann', 'Cat', 'Dan'].every((n) => infoText.includes(`${n} → Villager · ${place}`)), `the column beside the stage says who got which (${infoText})`);
  await sleep(600);
  assert(!cards().length && !JSON.stringify(states).includes('qkzvx') && !JSON.stringify(states).includes('wqzj'), 'dealt, not sent: nothing of it reaches the room');
  for (const s of ['Ann', 'Bob', 'Cat', 'Dan']) assert(!(await cardsOn(phones[s])), `${s}’s phone: no card yet`);
  await offStream(aud, 'the audience window', 'dealt');

  // ---------- 📤 Send: one card per player, each its own ----------
  await dialog.locator('[data-deal-send]').click();
  assert(await until(() => cards().length === 4), 'sent: the room holds four cards');
  const sent = cards();
  assert(new Set(sent.map((c) => c.id)).size === 4 && sent.every((c) => c.to.length === 1 && !c.shared), 'each its own id, to one player, never marked shared');
  const bobs = sent.find((c) => c.to[0].seat === seat.Bob);
  assert(bobs.title === 'You’re the Spy' && bobs.text === SPY && !bobs.role && !JSON.stringify(bobs).includes('wqzj'), 'Bob’s: the spy’s card, its part under Tap to see, with no location');
  assert(sent.filter((c) => c !== bobs).every((c) => c.title === 'You’re the Villager' && c.text === `The location:\n${place}`), `the others’: the location they share (${place})`);
  await phones.Bob.getByRole('button', { name: 'Tap to see' }).tap();
  await phones.Bob.getByText(SPY).waitFor();
  await phones.Bob.getByText('You’re the Spy').waitFor();
  await phones.Ann.getByRole('button', { name: 'Tap to see' }).tap();
  await phones.Ann.getByText(place).waitFor();
  await phones.Ann.getByText('You’re the Villager').waitFor();
  assert(!heard.Ann.join('').includes('qkzvx') && !heard.Cat.join('').includes('qkzvx') && !heard.Bob.join('').includes('wqzj'), 'no phone gets anyone else’s card');
  assert(await until(async () => /✓ seen by 2 of 4/.test(await flat(dialog.locator('[data-deal-status]')))), 'the panel counts who saw theirs');
  await offStream(aud, 'the audience window', 'sent');

  // ---------- Dan's phone goes: two windows mark him 📵, with 🪟 for the card window ----------
  await phones.Dan.context().close();
  const danLine = '📵 Dan has no phone here: copy theirs (📋)';
  assert(await until(async () => (await flat(dialog.locator('[data-deal-status]'))).includes(danLine)), `Dan’s phone gone: the panel says “${danLine}”`);
  const rows = await dialog.locator('.hands .row').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  assert(rows.length === 4 && rows.includes('Dan · 📵 no phone here 📋 Copy 🪟'), `two windows: everyone dealt in is listed, Dan with 📵 and 🪟 (${rows.join(' | ')})`);
  assert(rows.filter((r) => !r.startsWith('Dan ')).every((r) => r.includes('📋 Copy') && !r.includes('🪟') && !r.includes('📵')), 'the others, with their phones: 📋 Copy, no 🪟 and no 📵');

  // ---------- ↻ Send again: every card under a new id ----------
  await dialog.getByRole('button', { name: '↻ Send again' }).click();
  assert(await until(() => cards().length === 4 && cards().every((c) => !sent.some((x) => x.id === c.id))), '↻ Send again: all four under new ids');
  const again = cards().map((c) => c.id);

  // ---------- 🎭 Who was who: on stream when pressed; Ctrl+Z takes it off ----------
  assert(!(await aud.locator('[data-who-was-who]').count()), 'Who was who isn’t on stream before the host shows it');
  await dialog.locator('[data-deal-reveal]').click();
  const reveal = aud.locator('[data-who-was-who]');
  await reveal.waitFor();
  const shown = await flat(reveal);
  assert(shown.includes('Bob Spy') && shown.includes(`Ann Villager · ${place}`), `Who was who: names and parts on stream (${shown})`);
  assert(!shown.includes('qkzvx'), 'never a card’s words');
  await host.keyboard.press('Escape');
  await host.keyboard.press('Control+z');
  assert(await until(async () => !(await reveal.count())), 'Ctrl+Z takes it off the stream');

  // ---------- A host reload, in one window: the deal and its cards come back as they were ----------
  // (Once autosave holds them: its write waits a moment for more clicks.)
  const keptIds = async () => {
    const s = (await stored(host))?.session;
    return !s?.deal?.shown && JSON.stringify((s?.cards ?? []).map((c) => `sc:${c.id}:${c.at}`)) === JSON.stringify(again);
  };
  assert(await until(keptIds), 'autosave holds the cards under their new ids');
  await aud.close();
  const n = states.length;
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  assert(await until(() => states.length > n && cards().length === 4), 'reloaded: back in the room with the four cards');
  const odd = states.slice(n).filter((s) => JSON.stringify((s.cards ?? []).map((c) => c.id)) !== JSON.stringify(again));
  assert(!odd.length, `under the same ids (no phone is told anything new)${odd.length ? `: ${JSON.stringify(again)} vs ${odd.map((s) => JSON.stringify((s.cards ?? []).map((c) => c.id))).join(' | ')}` : ''}`);
  dialog = await openDeal();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 4: Spy ×1, Villager ×3' && !(await host.locator('[data-deal-info]').count()), 'one window: the panel counts the parts, and nothing says who got which');
  assert((await dialog.locator('.exposed').count()) === 1, 'one window: it warns that viewers see it');
  await dialog.getByRole('button', { name: '🎭 Deal a new one' }).click();
  assert(!(await dialog.locator('summary').count()) && (await flat(dialog.locator('[data-deal-part="1"]'))).includes('Card: 1 line of words'), 'one window: no choosing who gets a part, and a part’s card is only counted');
  await dialog.getByRole('combobox', { name: 'The deal' }).selectOption('tpl:prompt');
  assert(
    (await dialog.getByRole('combobox', { name: 'The wheel its cards draw from' }).inputValue()) === 'tpl:prompts' && !(await dialog.locator('[data-deal-problem]').count()),
    'a ready-made deal draws from its ready-made wheel when the game has none like it',
  );
  await dialog.getByRole('button', { name: 'Back to “Odd one out”' }).click();
  await offStream(host, 'the host page in one window', 'the deal open');

  // ---------- ✖ Take back, and Who was who in one window ----------
  await dialog.getByRole('button', { name: '✖ Take back' }).click();
  assert(await until(() => !cards().length), '✖ Take back: the room holds none of them');
  assert(await until(async () => !(await cardsOn(phones.Bob)) && !(await cardsOn(phones.Ann))), 'the phones drop them');
  await dialog.locator('[data-deal-reveal]').click();
  await host.locator('.stage-box [data-who-was-who]').waitFor();
  assert((await flat(host.locator('.stage-box [data-who-was-who]'))).includes('Bob Spy'), 'Who was who after the cards came back: on the stage');

  // ---------- The phones full: a tile's card and a partner clue's say why they can't go ----------
  await dialog.locator('[data-deal-hide]').click();
  await host.locator('.stage-box [data-who-was-who]').waitFor({ state: 'detached' });
  // (Who was who showed the location on stream, as it should: the host page is watched again from here.)
  await forgetSeen(host);
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  const quick = host.getByRole('dialog', { name: 'Send a card' });
  await quick.getByRole('radio', { name: 'A quick card' }).check();
  await quick.getByRole('button', { name: 'Ann', exact: true }).click();
  for (let i = 1; i <= 4; i++) {
    await quick.getByRole('textbox', { name: 'The card’s words' }).fill(`Note ${i}`);
    await quick.getByRole('button', { name: '📤 Send' }).click();
    await quick.locator('[data-card-said]').getByText(`Card ${i} sent to Ann`).waitFor();
  }
  await host.keyboard.press('Escape');
  await quick.waitFor({ state: 'detached' });
  assert(await until(() => cards().length === 4), 'four quick cards to Ann: the room holds them');
  // The deal would fill the phones: its panel says so before 📤 Send, its cards back or dealt anew.
  dialog = await openDeal();
  const fills = dialog.locator('[data-deal-fills]');
  const fillsText = '⚠ This fills the phones: they hold 8 cards at once, all phones together. Until you ✖ Take its cards back (or the round ends), no other 🤫 card can go to a phone, a partner clue’s included.';
  assert((await flat(fills)) === fillsText, `its cards back, 📤 Send would fill the phones: the panel says so first (“${fillsText}”)`);
  await dialog.getByRole('button', { name: '🎭 Deal a new one' }).click();
  await dialog.getByRole('combobox', { name: 'The deal' }).selectOption('saved:deal1');
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-send]').waitFor();
  assert((await flat(fills)) === fillsText, 'dealt anew, not sent yet: the same');
  await dialog.locator('[data-deal-send]').click();
  assert(await until(() => cards().length === 8), '📤 Send: the room holds 8, all the phones hold at once');
  assert(!(await fills.count()), 'and the warning goes');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  const fullLine = '8 cards are out on the phones, 4 of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…, or take back another one';
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  const tilePart = host.locator('.panel [data-tile-cards]');
  await tilePart.waitFor();
  assert(await tilePart.getByRole('button', { name: 'Send card 1' }).isDisabled(), 'a tile’s card can’t go');
  assert((await tilePart.locator('[data-cards-full]').innerText()) === fullLine, `and its panel says why, in sight: “${fullLine}”`);
  await host.keyboard.press('r');
  await host.keyboard.press('Escape');
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $400"]').click();
  const partner = host.locator('.panel [data-partner-panel]');
  await partner.getByText('Ann picked it.').waitFor();
  await host.keyboard.press('3');
  await mainButton(host).click();
  const pRow = partner.locator('[data-card="1"]');
  await pRow.waitFor();
  const sendRow = (n) => partner.getByRole('button', { name: `Send card ${n}`, exact: true });
  assert(
    (await sendRow(1).isDisabled()) && (await sendRow(2).isDisabled()) && (await mainLabel(host)) === '📤 Send and start' && (await mainButton(host).isDisabled()),
    'a partner clue’s: its 📤 Send and 📤 Send and start are off',
  );
  const pFull = partner.locator('[data-cards-full]');
  const bothLine = '8 cards are out on the phones, 4 of them the 🎭 deal’s, and this sends 2: they hold 8 at once, all phones together, so ✖ Take 2 back first (the deal’s go together, in 🎭 Deal…)';
  assert((await pFull.innerText()) === bothLine, `and its panel says why, for 📤 Send and start, in sight: “${bothLine}”`);
  // Two quick cards back: both fit, and 📤 Send and start sends them (8 out), the clock running.
  await tools.locator('[data-cards-out-count]').click();
  const outList = host.getByRole('dialog', { name: 'Cards out' });
  await outList.getByRole('button', { name: 'Take Card 1 back' }).click();
  await outList.getByRole('button', { name: 'Take Card 2 back' }).click();
  assert(await until(() => cards().length === 6), 'two quick cards taken back: the room holds 6');
  await host.keyboard.press('Escape');
  await outList.waitFor({ state: 'detached' });
  assert(await until(async () => !(await pFull.count()) && (await mainButton(host).isEnabled())), 'then 📤 Send and start can go, and the line goes');
  await mainButton(host).click();
  assert(await until(() => cards().length === 8), '📤 Send and start: both cards go (8 out)');
  // Both back, and one more quick card (7 out): each row's 📤 Send fits, though both together wouldn't.
  await partner.getByRole('button', { name: 'Take card 1 back' }).click();
  await partner.getByRole('button', { name: 'Take card 2 back' }).click();
  assert(await until(() => cards().length === 6), 'the clock running, both partner cards taken back: 6 out');
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  await quick.getByRole('radio', { name: 'A quick card' }).check();
  await quick.getByRole('button', { name: 'Ann', exact: true }).click();
  await quick.getByRole('textbox', { name: 'The card’s words' }).fill('Note 5');
  await quick.getByRole('button', { name: '📤 Send' }).click();
  await quick.locator('[data-card-said]').getByText('Card 5 sent to Ann').waitFor();
  await host.keyboard.press('Escape');
  await quick.waitFor({ state: 'detached' });
  assert(await until(() => cards().length === 7), 'one more quick card: 7 out');
  assert(
    (await sendRow(1).isEnabled()) && (await sendRow(2).isEnabled()) && !(await pFull.count()),
    'the clock running: each card’s 📤 Send can go, and no line says otherwise (📤 Send and start is gone)',
  );
  await sendRow(1).click();
  assert(await until(() => cards().length === 8), 'card 1 goes: 8 out');
  const oneLine = '8 cards are out on the phones, 4 of them the 🎭 deal’s and 1 this partner clue’s: ✖ Take them back in 🎭 Deal…, or take back another one';
  assert(await until(async () => (await sendRow(2).isDisabled()) && (await pFull.count()) === 1 && (await pFull.innerText()) === oneLine), `card 2 can’t go now, and the line says why: “${oneLine}”`);
  // Card 2 to nobody: nothing is refused. Card 1 given to Bob too: its 📤 Send changes is off, and the line says why.
  await partner.getByRole('button', { name: 'Card 2 to nobody' }).click();
  assert(await until(async () => !(await pFull.count())), 'card 2 to nobody: the line goes');
  await pRow.getByRole('button', { name: /^Card 1 to Bob/ }).click();
  const changesBtn = partner.getByRole('button', { name: 'Send card 1’s changes' });
  await changesBtn.waitFor();
  assert(await until(async () => (await changesBtn.isDisabled()) && (await pFull.count()) === 1 && (await pFull.innerText()) === oneLine), `card 1 changed: 📤 Send changes is off, and the line says why: “${oneLine}”`);
  await offStream(host, 'the host page in one window', 'the phones full');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Deal tests passed');
} finally {
  await browser?.close();
  buzzer.stop();
}
