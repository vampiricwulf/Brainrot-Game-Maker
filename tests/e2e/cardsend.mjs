// 🤫 Cards anywhere, end to end (docs/PARTNER-CLUES-SPEC.md §11, §12, §14, §22, milestone P3): the built app hosts a game
// against the real buzzer room (buzzer/ under `wrangler dev`, local), with three phones on the real phone page.
// 🤫 Send a card… in the tools row sends a quick card (typed words) to one player, then a tile's card made in the editor
// (its words and its picture from this computer) to ⇄ everyone else: each phone gets only what was sent to it, behind
// Tap to see, and nothing goes before the press. The list of cards out says "Card 1 → Bob", never what's on it; ↻ Send
// again renews only that card's id; a host reload keeps the cards out under the same ids; ✖ Take back takes one off.
// A standard tile's own card (🤫 Just you) and a Daily Double's (💡 Insider tip) are offered in the tile's panel to the
// picker, sent only by a press, and go when the tile closes; the tile plays as it always does. A card sent until the
// round ends goes with the round. "The slide on screen" is what viewers see as it comes up (never a hint that comes in
// later, nor a see-through box). In one window, an SVG already in the game put on a quick card is used with no toast
// naming it. The audience window, and the host page in one window, never hold a card's words, its file name or its link.
// A card's picture whose upload is cut off goes again by itself, unless its card was taken back meanwhile; one the server
// turns down is said in the list of cards out (and the tools row's cards out turns orange), and ↻ Send again puts it up.
// Cat's phone gone, a quick card to everyone says after 📤 Send that Cat has none, and copies it for her from there.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, openGameFile, packGame, png, recordSeen, roomStored, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';

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
// leaves this computer.
const SPY = 'Spy-qkzvx words';
const TIP = 'Tip-qkzvx words';
const INSIDER = 'Insider-qkzvx tip';
const SECRETS = ['qkzvx', 'zfnqj'];

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const slide = (...elements) => ({ background: {}, elements });

/** Waits (up to `ms`) until pred() holds. */
const until = async (pred, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
  return !!(await pred());
};

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-cardsend-');
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

  // An SVG as a drawing program saves it (an XML declaration first), and as the game stores it (cleaned: without one).
  const FLAG_RAW = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="green"/></svg>\n';
  const scratch = await browser.newPage();
  const flag = await scratch.evaluate((svg) => new XMLSerializer().serializeToString(new DOMParser().parseFromString(svg, 'image/svg+xml')), FLAG_RAW);
  await scratch.close();
  const files = { tip: png(200, 60, 20, 300, 200), flag: Buffer.from(flag) };
  const media = [
    { id: 'tip', name: 'zfnqj-tip.png', mime: 'image/png', size: files.tip.length, kind: 'image' },
    { id: 'flag', name: 'zfnqj-flag.svg', mime: 'image/svg+xml', size: files.flag.length, kind: 'image' },
  ];
  // Songs $200's question has a hint that comes in 20 s later and a see-through box; Songs $400's answer the SVG.
  const later = { ...text('Later-hint words', 400), entrance: { type: 'fade', delay: 20, duration: 1 } };
  const clear = { ...text('See-through words', 600), opacity: 0 };
  const songExtra = [{ questionSlide: slide(text('A song clue'), later, clear) }, { answerSlide: slide(text('A song'), image('flag', 400)) }];
  const plain = (id, q, a, extra = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)), ...extra });
  const values = [200, 400];
  const game = {
    id: 'g_card_send',
    version: 2,
    title: 'Cards anywhere',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
    rounds: [
      {
        id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 1,
        categories: [
          {
            id: 'cat0', title: 'Movies',
            clues: [
              plain('q_tip', 'A plain question', 'Plain answer', { cards: [{ id: 't1', to: 'picker', ...slide(text(TIP), image('tip', 400)) }] }),
              plain('q_dd', 'A Daily Double question', 'DD answer', { type: 'dailyDouble', cards: [{ id: 'd1', to: 'picker', ...slide(text(INSIDER)) }] }),
            ],
          },
          { id: 'cat1', title: 'Songs', clues: values.map((_, r) => plain(`q_song${r}`, 'A song clue', 'A song', songExtra[r])) },
        ],
      },
      { id: 'r2', name: 'Round 2', mode: 'board', values, dailyDoubleCount: 0, categories: [{ id: 'cat2', title: 'Books', clues: values.map((_, r) => plain(`q_book${r}`, 'A book clue', 'A book')) }] },
    ],
    media, audio: {}, wheels: [], dice: [], theme: {},
  };
  const packPath = resolve('test-results/card-send.brainrot');
  writeFileSync(packPath, await packGame(game, files));

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
  // Everything the host tells the room, and every card file it uploads.
  const states = [];
  let uploads = 0;
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
  host.on('request', (r) => r.method() === 'POST' && /\/api\/rooms\/[^/]+\/files$/.test(new URL(r.url()).pathname) && uploads++);
  const last = () => states.at(-1);
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- In the editor: 🤫 Card tabs on any tile ----------
  const editTile = async (at) => {
    await host.locator(`[data-tile="${at}"]`).click();
    const d = host.getByRole('dialog', { name: 'Edit clue' });
    await d.waitFor();
    return d;
  };
  let dialog = await editTile('1,0');
  const tabNames = () => dialog.getByRole('tablist', { name: 'Slides' }).getByRole('tab').allInnerTexts();
  await dialog.getByRole('button', { name: '＋ Card' }).click();
  await until(async () => (await tabNames()).includes('🤫 Card 1'), 5000);
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', '🤫 Card 1', 'Answer']), `a standard tile takes a 🤫 card too (${await tabNames()})`);
  const goesTo = dialog.getByLabel('Goes to');
  assert((await goesTo.inputValue()) === 'picker', 'it goes to the player who picks the tile');
  assert(
    JSON.stringify(await goesTo.locator('option').allInnerTexts()) === JSON.stringify(['the player who picks it', 'everyone but the player who picks it', 'nobody (I’ll choose when playing)']),
    'its Goes to: the player who picks it, everyone else, or nobody',
  );
  await dialog.locator('header .value').click();
  await host.keyboard.press('Control+z');
  assert(await until(async () => !(await tabNames()).includes('🤫 Card 1')), 'Ctrl+Z takes it off again');
  await host.keyboard.press('Escape');
  dialog = await editTile('0,1');
  assert((await dialog.getByLabel('Goes to').count()) === 0 && (await tabNames()).includes('🤫 Card 1'), 'a Daily Double with a card shows its tab');
  await dialog.getByRole('tab', { name: '🤫 Card 1' }).click();
  assert((await dialog.getByLabel('Goes to').locator('option:checked').innerText()) === 'the Daily Double’s player', 'a Daily Double’s card goes to its player');
  // Its Card name: typed, its tab and its words box say it, and it's one undo step; F2 on its tab comes back to it.
  const nameBox = dialog.getByLabel('Card name');
  assert((await nameBox.inputValue()) === '' && (await nameBox.getAttribute('placeholder')) === 'Card 1', 'a card has no name at first: it’s “Card 1”');
  await nameBox.fill('Insider tip');
  assert(await until(async () => (await tabNames()).includes('🤫 Insider tip')), `named, its tab says it (${await tabNames()})`);
  assert((await dialog.locator('label.field', { has: host.locator('[data-field="card"]') }).innerText()).includes('🤫 Insider tip words'), 'and so does its words box');
  const undoTitle = () => host.locator('.editor > header').getByRole('button', { name: 'Undo (Ctrl+Z)' }).getAttribute('title');
  assert(await until(async () => (await undoTitle())?.startsWith('Undo: Renamed card “Insider tip”')), `one undo step, “Renamed card” (${await undoTitle()})`);
  await dialog.getByRole('tab', { name: '🤫 Insider tip' }).focus();
  await host.keyboard.press('F2');
  assert(await until(() => host.evaluate(() => !!document.activeElement?.matches('[data-field="card-name"]'))), 'F2 on its tab puts the focus in its Card name');
  await dialog.locator('header .value').click();
  await host.keyboard.press('Control+z');
  assert(await until(async () => (await tabNames()).includes('🤫 Card 1')), `Ctrl+Z takes the name off: “Card 1” again (${await tabNames()})`);
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

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
  /** The cards in the room's state now. */
  const cards = () => last()?.cards ?? [];
  const cardsOn = (p) => p.locator('.card').count();

  // ---------- Two windows: the audience window, watched all through ----------
  let [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  const offStream = async (p, name, when) => {
    const found = await shownOf(p, SECRETS);
    assert(!found.length, `${when}: ${name} holds no card’s words or file name${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  // ---------- 🤫 Send a card…: a quick card to Bob ----------
  const tools = host.locator('.panel .toolsrow');
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  dialog = host.getByRole('dialog', { name: 'Send a card' });
  await dialog.waitFor();
  assert((await dialog.getByRole('radio', { name: 'A quick card' }).isChecked()) && !(await dialog.locator('.exposed').count()), 'two windows: a quick card is the first choice, and no warning about viewers');
  assert((await dialog.getByRole('combobox', { name: 'A file from the game’s 🖼 Media' }).count()) === 1, 'two windows: a file from the game’s 🖼 Media can go on it (by name: viewers don’t see this window)');
  assert(!(await dialog.getByRole('button', { name: '👁 Show' }).count()), 'and what’s typed isn’t hidden (no 👁 Show)');
  await dialog.getByRole('textbox', { name: 'The card’s words' }).fill(SPY);
  assert(!JSON.stringify(states).includes('"cards"') && !JSON.stringify(heard).includes('qkzvx'), 'typing the card sends nothing');
  await dialog.getByRole('button', { name: 'Bob', exact: true }).click();
  await dialog.getByRole('button', { name: '📤 Send' }).click();
  await dialog.locator('[data-card-said]').getByText('Card 1 sent to Bob').waitFor();
  assert(await until(() => cards().length === 1), 'sent: the room’s state holds one card');
  const c1 = cards()[0];
  assert(/^sc:/.test(c1.id) && JSON.stringify(c1.to) === JSON.stringify([{ seat: seat.Bob }]) && c1.text === SPY && c1.open, 'Card 1 goes to Bob’s seat only, with its words, under its own id');
  assert(!JSON.stringify(states).includes('Card 1'), 'its label (made by the app) never goes to the room');
  const bobCover = bob.getByRole('button', { name: 'Tap to see' });
  await bobCover.waitFor();
  assert(!(await bob.getByText(SPY).isVisible()), 'Bob’s phone: the card behind Tap to see');
  await bobCover.tap();
  await bob.getByText(SPY).waitFor();
  for (const [p, label] of [[ann, 'ann'], [cat, 'cat']]) assert(!(await cardsOn(p)) && !heard[label].join('').includes('qkzvx'), `${label === 'ann' ? 'Ann' : 'Cat'}’s phone: no card, and nothing of it`);
  await offStream(aud, 'the audience window', 'a quick card sent');

  // ---------- ⇄ Everyone else gets the tile's card made in the editor, until taken back ----------
  await dialog.getByRole('button', { name: '⇄ Everyone else' }).click();
  const pressed = async (name) => (await dialog.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')) === 'true';
  assert((await pressed('Ann')) && !(await pressed('Bob')) && (await pressed('Cat')), '⇄ Everyone else: Ann and Cat, not Bob');
  await dialog.getByRole('radio', { name: 'One made in the editor' }).check();
  const pick = dialog.getByRole('combobox', { name: 'The card to send' });
  const options = await pick.locator('option').allInnerTexts();
  assert(
    JSON.stringify(options) === JSON.stringify(['Round 1 · Movies $200 · Card 1 · 1 line of words, 1 picture', 'Round 1 · Movies $400 · Card 1 · 1 line of words']),
    `the cards made in the editor, by tile and counted, never said (${options.join(' | ')})`,
  );
  await dialog.getByRole('radio', { name: 'until I take it back' }).check();
  await dialog.getByRole('button', { name: '📤 Send' }).click();
  await dialog.locator('[data-card-said]').getByText('Card 2 sent to Ann, Cat').waitFor();
  assert(await until(() => cards().length === 2), 'the room’s state holds two cards');
  const c2 = cards()[1];
  assert(JSON.stringify(c2.to) === JSON.stringify([{ seat: seat.Ann }, { seat: seat.Cat }]) && c2.text === TIP && cards()[0].id === c1.id, 'Card 2 goes to Ann’s and Cat’s seats, Card 1 keeps its id');
  assert(await until(() => cards()[1]?.media?.[0]?.file && uploads === 1), 'its picture from this computer goes up once, and the card then names the room’s file');
  assert(!JSON.stringify(states).includes('zfnqj'), 'no file name ever goes to the room');
  await ann.getByRole('button', { name: 'Tap to see' }).waitFor();
  await cat.getByRole('button', { name: 'Tap to see' }).waitFor();
  assert((await cardsOn(bob)) === 1 && !heard.bob.join('').includes(TIP), 'Bob still has only his card');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---------- The list of cards out: labels only, ↻ Send again, ✖ Take back ----------
  const outButton = tools.locator('[data-cards-out-count]');
  assert((await outButton.innerText()).trim() === '🤫 2 cards out', 'the tools row says how many cards are out');
  await outButton.click();
  const list = host.getByRole('dialog', { name: 'Cards out' });
  await list.waitFor();
  /** An element's words on one line (a row's parts are laid out apart). */
  const words = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const rowText = (label) => words(list.locator(`[data-card-out="${label}"]`));
  assert(await until(async () => (await rowText('Card 1')).includes('Card 1 → Bob · ✓ seen')), `Card 1 → Bob · ✓ seen (${await rowText('Card 1')})`);
  // (Two windows: a tile's card also says which it is, the tile and the card's name.)
  assert(
    (await rowText('Card 2')).includes('Card 2 → Ann, Cat · Movies $200 · Card 1 · sent · until you take it back'),
    `Card 2 → Ann, Cat · Movies $200 · Card 1 · sent · until you take it back (${await rowText('Card 2')})`,
  );
  await list.getByRole('button', { name: 'Send Card 1 again' }).click();
  assert(await until(() => cards().length === 2 && !cards().some((c) => c.id === c1.id)), '↻ Send again: Card 1 goes under a new id');
  const c1b = cards().find((c) => c.text === SPY);
  assert(cards()[0].id === c2.id && cards()[1] === c1b, 'Card 2 keeps its own, and Card 1, sent last, is the newest (the phones show it first)');
  // (Bob had it open: under its new id it stays open on his phone, with no tap, and the room hears he saw it.)
  await bob.locator(`.card[data-card="${c1b.id}"]`).waitFor();
  assert((await bob.getByText(SPY).isVisible()) && !(await bobCover.isVisible()), 'Bob had it open: it stays open on his phone under its new id');
  assert(await until(async () => (await rowText('Card 1')).includes('Card 1 → Bob · ✓ seen')), `and Card 1 → Bob · ✓ seen again (${await rowText('Card 1')})`);
  await host.keyboard.press('Escape');
  await offStream(aud, 'the audience window', 'the list of cards out');

  // ---------- A host reload: the cards out stay out, under the same ids; one window from here ----------
  const resume = async () => {
    await host.reload();
    await host.getByRole('button', { name: 'Resume game' }).click();
    await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
    await host.locator('.play .panel').waitFor();
  };
  // (Once autosave holds them: its write waits a moment for more clicks, and the copy written as the page goes away
  // isn't always kept by a browser under test. A reload before that comes back to the game before Card 2 went, and the
  // room would take it off Ann's and Cat's phones.)
  const keptIds = async () => JSON.stringify(((await stored(host))?.session?.cards ?? []).map((c) => `sc:${c.id}:${c.at}`)) === JSON.stringify([c1b.id, c2.id]);
  assert(await until(keptIds), 'autosave holds both cards under their ids');
  await aud.close();
  let n = states.length;
  await resume();
  assert(await until(() => states.length > n && cards().length === 2), 'reloaded: the host is back in the room, with both cards');
  assert(states.slice(n).every((s) => JSON.stringify((s.cards ?? []).map((c) => c.id)) === JSON.stringify([c2.id, c1b.id])), 'every state since the reload holds both cards under the same ids (no phone is told anything new)');
  assert((await bob.getByText(SPY).isVisible()) && (await cardsOn(ann)) === 1, 'the phones keep their cards through the host’s reload');
  assert((await tools.locator('[data-cards-out-count]').innerText()).trim() === '🤫 2 cards out', 'one window: the tools row only counts the cards out');
  // (On a window up to 1280px wide it shows as 🤫 2, named in full, so the board's tools row keeps one line.)
  await host.setViewportSize({ width: 1024, height: 768 });
  const outWidth = async () => Math.round((await tools.locator('[data-cards-out-count]').boundingBox()).width);
  assert(await until(async () => (await outWidth()) < 60), `1024px wide: the cards out show as 🤫 2 (${await outWidth()}px wide)`);
  assert(
    (await tools.getByRole('button', { name: '🤫 2 cards out', exact: true }).count()) === 1 && (await tools.boundingBox()).height < 40,
    '1024px wide: still named in full, and the board’s tools row keeps one line',
  );
  await host.setViewportSize({ width: 1400, height: 900 });
  await tools.locator('[data-cards-out-count]').click();
  await list.waitFor();
  assert((await list.locator('.exposed').count()) === 1, 'one window: the list warns that viewers see it');
  await offStream(host, 'the host page in one window', 'the list of cards out open');
  await list.getByRole('button', { name: 'Take Card 2 back' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].id === c1b.id), '✖ Take back: Card 2 goes, Card 1 stays');
  assert(await until(() => roomStored(persist, 'Spy-qkzvx')), 'the room saved the cards it was sent (so its saved state is where to look)');
  assert(await until(async () => !(await cardsOn(ann)) && !(await cardsOn(cat))), 'Ann’s and Cat’s phones drop it');
  await host.keyboard.press('Escape');

  // ---------- One window: an SVG already in the game, on a quick card ----------
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  dialog = host.getByRole('dialog', { name: 'Send a card' });
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: 'A quick card' }).check();
  // (Its bytes differ from the game's copy until it's cleaned: the game's own is used then, as it is for any file.)
  await dialog.locator('input[type=file]').setInputFiles({ name: 'flag.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(FLAG_RAW) });
  await dialog.locator('[aria-label="On the card"]').getByText('🖼 picture').waitFor();
  assert(!(await host.locator('.toast', { hasText: 'already in 🖼 Media' }).count()), 'one window: an SVG already in the game goes on a quick card with no toast naming it');
  await offStream(host, 'the host page in one window', 'an SVG already in the game put on a quick card');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---------- 🤫 Just you: a standard tile's own card, offered to the picker, sent by a press ----------
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Songs for $200"]').click();
  assert(await until(() => !!last()?.clue), 'a plain tile opens');
  const plainPhase = last().phase;
  assert(!(await host.locator('.panel [data-tile-cards]').count()), 'a tile with no card has no cards part');
  // "The slide on screen": what viewers see as it comes up, never its hint (in 20 s) nor its see-through box.
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  dialog = host.getByRole('dialog', { name: 'Send a card' });
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: 'The slide on screen' }).check();
  const onScreen = await words(dialog.locator('[data-stage-card]'));
  assert(onScreen.startsWith('1 line of words'), `the slide on screen as a card: the question only (${onScreen})`);
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await host.keyboard.press('Escape');
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  const tilePart = host.locator('.panel [data-tile-cards]');
  await tilePart.waitFor();
  const tileRow = tilePart.locator('[data-tile-card="1"]');
  assert((await words(tileRow)).includes('Card 1 · 1 line of words, 1 picture'), 'its card, counted, never said');
  assert((await tileRow.getByRole('button', { name: 'Card 1 to Ann' }).getAttribute('aria-pressed')) === 'true', 'it starts with the picker, Ann');
  assert(await until(() => last().phase === plainPhase && !(last().cards ?? []).some((c) => c.text === TIP)), `nothing goes by itself, and the tile plays as any tile does (the buzzers: ${plainPhase})`);
  await offStream(host, 'the host page in one window', 'a tile with a card open');
  await tileRow.getByRole('button', { name: 'Send card 1' }).click();
  assert(await until(() => cards().length === 2 && cards()[1].text === TIP), 'sent: the room holds it too');
  assert(JSON.stringify(cards()[1].to) === JSON.stringify([{ seat: seat.Ann }]) && last().phase === plainPhase, 'to Ann only, and the buzzers are as they were');
  await ann.getByRole('button', { name: 'Tap to see' }).waitFor();
  assert(await ann.locator('#buzz').isVisible(), 'Ann’s phone keeps its buzz button beside the card');
  assert(await until(async () => /· (sent|✓ seen) · listed as Card 3/.test(await words(tileRow))), `its row says it went, listed as Card 3 (${await words(tileRow)})`);
  // Shift+Esc puts the tile back: the card was seen, so it asks (in the panel: one window, nothing goes over the stage).
  await host.keyboard.press('Shift+Escape');
  const askBox = confirmStrip(host);
  await askBox.waitFor();
  assert((await words(askBox)).includes('Card 3 went to Ann') && !(await host.getByRole('alertdialog').count()), `it asks first, in the panel: “${await words(askBox)}”`);
  await askBox.getByRole('button', { name: '↩ Put it back' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].id === c1b.id), 'the tile closed: its card goes, the round’s stays');
  assert(await until(async () => !(await cardsOn(ann))), 'Ann’s phone drops it');
  assert(!(await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').getAttribute('class')).includes('used'), 'the tile is still playable');

  // ---------- 💡 Insider tip: a Daily Double's card to its player, before the wager ----------
  await host.locator('.stage-box .tile[aria-label^="Movies for $400"]').click();
  await tilePart.waitFor();
  assert((await tilePart.locator('[data-tile-card="1"]').getByRole('button', { name: 'Card 1 to Ann' }).getAttribute('aria-pressed')) === 'true', 'a Daily Double’s card starts with its player');
  await tilePart.getByRole('button', { name: 'Send card 1' }).click();
  assert(await until(() => cards().some((c) => c.text === INSIDER)), 'sent before the wager');
  await ann.getByRole('button', { name: 'Tap to see' }).waitFor();
  await ann.getByRole('button', { name: 'Tap to see' }).tap();
  await ann.getByText(INSIDER).waitFor();
  assert(!heard.bob.join('').includes('Insider') && !heard.cat.join('').includes('Insider'), 'only Ann gets it');
  await offStream(host, 'the host page in one window', 'a Daily Double’s card sent');
  await host.keyboard.press('Escape');
  assert(await until(() => cards().length === 1), 'back to the board: the Daily Double’s card goes with the tile');

  // ---------- The next round: a card sent until the round ends goes with it ----------
  // (Its button ignores a click in its first moments on screen: the second half of a double-click.)
  await sleep(500);
  await tools.getByRole('button', { name: 'Next round ▶' }).click();
  await confirmStrip(host).getByRole('button', { name: 'Yes' }).waitFor();
  await sleep(500);
  await confirmStrip(host).getByRole('button', { name: 'Yes' }).click();
  assert(await until(() => !cards().length), 'the next round: Card 1 (until the round ends) goes');
  assert(await until(async () => !(await cardsOn(bob))), 'Bob’s phone drops it');
  assert(!(await tools.locator('[data-cards-out-count]').count()), 'no cards out: the tools row says nothing of them');
  await offStream(host, 'the host page in one window', 'the end');

  // ---------- A card's picture that doesn't go up: tried again after a blip, else the list of cards out says so ----------
  // (The first upload is cut off as a dropped connection would; while `hold` is set, one waits for it, then is cut off;
  // while `refuse` is set, the server turns them down.)
  let blip = true;
  let refuse = false;
  /** @type {Promise<void> | null} */
  let hold = null;
  const filesRoute = async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    if (blip) {
      blip = false;
      return r.abort('internetdisconnected');
    }
    if (hold) {
      await hold;
      return r.abort('internetdisconnected');
    }
    if (refuse) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Card files are off on this buzzer server right now' }) });
    return r.continue();
  };
  await host.route('**/api/rooms/*/files', filesRoute);
  /** A quick card with a picture of its own, to Bob. */
  const sendPicture = async (name, buffer, label) => {
    await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
    dialog = host.getByRole('dialog', { name: 'Send a card' });
    await dialog.waitFor();
    await dialog.getByRole('radio', { name: 'A quick card' }).check();
    await dialog.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer });
    await dialog.locator('[aria-label="On the card"]').getByText('🖼 picture').waitFor();
    await dialog.getByRole('button', { name: 'Bob', exact: true }).click();
    await dialog.getByRole('button', { name: '📤 Send' }).click();
    await dialog.locator('[data-card-said]').getByText(`${label} sent to Bob`).waitFor();
    await host.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  };
  let n0 = uploads;
  await sendPicture('blip.png', png(200, 40, 40, 120, 90), 'Card 1');
  assert(await until(() => cards()[0]?.media?.[0]?.file && uploads === n0 + 2, 30_000), `an upload cut off goes again by itself, and the card then names the room’s file (${uploads - n0} tries)`);
  const outWarn = () => outButton.evaluate((e) => e.classList.contains('warn'));
  assert(!(await outWarn()), 'its picture went up: the tools row’s 🤫 1 card out isn’t marked');
  refuse = true;
  n0 = uploads;
  await sendPicture('refused.png', png(40, 40, 200, 120, 90), 'Card 2');
  // (The send dialog is closed: nothing else in sight says so.)
  await tools.locator('[data-cards-out-count="2"].warn').waitFor();
  assert((await outButton.getAttribute('title')).startsWith('🤫 2 cards out: ⚠ one isn’t all on the phones'), 'one the server turns down: the tools row’s 🤫 2 cards out turns orange, and says to open the list');
  // A card taken back while its picture goes up, and that upload cut off: it isn't tried again (the room would only
  // be told to let go of it).
  let release = () => {};
  hold = new Promise((ok) => (release = ok));
  await sendPicture('taken.png', png(40, 200, 40, 120, 90), 'Card 3');
  assert(await until(() => uploads === n0 + 2), 'Card 3’s picture starts going up');
  await outButton.click();
  await list.waitFor();
  await list.getByRole('button', { name: 'Take Card 3 back' }).click();
  assert(await until(() => cards().length === 2), 'Card 3 is taken back while its picture goes up');
  hold = null;
  release();
  // (Past the 5 s a cut-off upload waits before it goes again: there's no state to wait for, as nothing should go.)
  await sleep(6000);
  assert(uploads === n0 + 2, `neither goes again by itself: the one the server turned down (it would only say no again), nor the one whose card was taken back (${uploads - n0} uploads)`);
  const left2 = list.locator('[data-card-left="Card 2"]');
  await left2.waitFor();
  const copyPicture = (await list.getByRole('button', { name: 'Copy Card 2’s picture' }).count()) === 1;
  const leftLine = `🖼 1 picture won’t reach the phones (didn’t reach the buzzer server): ↻ Send again tries again${copyPicture ? ', or 📋 Copy picture' : ''}`;
  assert((await left2.innerText()) === leftLine, `one the server turns down: its row in the list says so, counted, and what to do (“${await left2.innerText()}”)`);
  assert(
    (await list.locator('[data-card-out="Card 2"] [data-card-state]').evaluate((e) => e.classList.contains('warn'))) && !(await list.locator('[data-card-left="Card 1"]').count()),
    'the row is marked (not just “sent”), and Card 1, whose picture went up, says nothing more',
  );
  refuse = false;
  await list.getByRole('button', { name: 'Send Card 2 again' }).click();
  await left2.waitFor({ state: 'detached' });
  assert(await until(() => cards()[1]?.media?.[0]?.file), '↻ Send again puts it up once the server takes it, and the line goes');
  assert(uploads === n0 + 3 && !(await outWarn()), `once, and the tools row’s 🤫 2 cards out is no longer marked (${uploads - n0} uploads)`);
  await host.keyboard.press('Escape');
  await host.unroute('**/api/rooms/*/files', filesRoute);
  await offStream(host, 'the host page in one window', 'a card’s picture that didn’t go up');

  // ---------- A quick card for a player with no phone: copied from the line under 📤 Send, once it went ----------
  await cat.context().close();
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  dialog = host.getByRole('dialog', { name: 'Send a card' });
  await dialog.waitFor();
  await dialog.getByRole('radio', { name: 'A quick card' }).check();
  await dialog.getByRole('button', { name: 'Everyone', exact: true }).click();
  const LAST = 'Last-call words';
  await dialog.getByRole('textbox', { name: 'The card’s words' }).fill(LAST);
  const noPhoneLine = dialog.getByText('📵 Cat has no phone here: copy it to them (📋), or');
  assert(await until(() => noPhoneLine.isVisible()), 'Cat’s phone gone: the dialog says to copy it to her');
  // 👁 Show to check the words: it reads 🙈 Hide while on, and the next card starts hidden again.
  const wordsBox = dialog.getByRole('textbox', { name: 'The card’s words' });
  const hidden = () => wordsBox.evaluate((el) => getComputedStyle(el).webkitTextSecurity === 'disc');
  await dialog.getByRole('button', { name: '👁 Show', exact: true }).click();
  const hideBtn = dialog.getByRole('button', { name: '🙈 Hide', exact: true });
  assert((await hideBtn.getAttribute('aria-pressed')) === 'true' && !(await hidden()), '👁 Show: the words show, and the button reads 🙈 Hide');
  await dialog.getByRole('button', { name: '📤 Send' }).click();
  const saidLine = dialog.locator('[data-card-said]');
  await saidLine.getByText('sent to Ann, Bob, Cat').waitFor();
  assert(
    (await hidden()) && (await dialog.getByRole('button', { name: '👁 Show', exact: true }).getAttribute('aria-pressed')) === 'false' && !(await hideBtn.count()),
    'sent: the next card’s words are hidden again (viewers see this window)',
  );
  /** Inside what its scrolling menu shows. */
  const inView = (loc) =>
    loc.evaluate((el) => {
      let box = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      const r = el.getBoundingClientRect();
      const b = box?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    });
  assert(await until(async () => (await inView(saidLine)) && (await inView(dialog.locator('[data-card-said-copy]')))), 'the ✓ line and its 📋 copy row are in view under 📤 Send');
  const lastLabel = (await saidLine.innerText()).match(/Card \d+/)?.[0];
  assert(
    (await saidLine.innerText()) === `✓ ${lastLabel} sent to Ann, Bob, Cat · 📵 Cat has no phone here: copy it to them (📋)`,
    `sent: the line under it says Cat has no phone here (${await saidLine.innerText()})`,
  );
  assert(await until(async () => !(await noPhoneLine.count())), 'the words gone from the dialog, its own 📵 line goes (nothing there to copy)');
  assert(!(await dialog.getByRole('button', { name: '📋 Copy words', exact: true }).count()), 'and so does its greyed 📋 Copy words, beside 📤 Send');
  await dialog.getByRole('button', { name: `Copy ${lastLabel}’s words for Cat` }).click();
  const forCat = `🤫 For Cat only (${lastLabel}): ${LAST}`;
  assert(await until(async () => (await host.evaluate(() => navigator.clipboard.readText())) === forCat, 5000), `its 📋 Copy words copies what went, for Cat (“${forCat}”)`);
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Card send tests passed');
} finally {
  await browser?.close();
  buzzer.stop();
}
