// 🤫 Cards from actions and the 🪟 card window, end to end (docs/PARTNER-CLUES-SPEC.md §11, §12.2, §13.6, §14, milestone
// P3): the built app hosts an RPG round against the real buzzer room (buzzer/ under `wrangler dev`, local), with phones
// for Ann and Bob (Cat has none). In the editor, an item's buttons offer 🤫 Send a card, with who gets it. In play, an
// object's 🤫 button and a wheel slice's only offer their card in the host panel: nothing reaches the room until the
// host presses 📤 Send there, and Skip sends nothing. The 🪟 card window shows only its player's cards (a picture from
// this computer included), "Nothing private right now" between them, and the audience window never gets one of its
// messages, nor a card's words. With no phone buzzers, 🪟 Show puts an offered card in the card window, and so it does a
// standard tile's card (the stream then says "Cat has a private question") and a partner clue's, until the tile closes,
// with more cards out than the phones' 8 (that limit is the buzzer room's).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, flowButton, mainButton, openGameFile, packGame, png, recordSeen, shownOf, startBuzzer, startRoomOn } from './helpers.mjs';
import { wav } from './mediafixtures.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// Every card's words carry "wqzpk", its picture's file name "jhxvb": never on stream, and no file name leaves this computer.
const MISSION = 'Mission-wqzpk words';
const WHISPER = 'Whisper-wqzpk words';
const SCROLL = 'Scroll-wqzpk words';
const TIP = 'Tip-wqzpk words'; // a standard tile's card (no phones: shown in the card window)
const DESCRIBE = 'Describe-wqzpk words'; // a partner clue's card (the same)
const SECRETS = ['wqzpk', 'jhxvb'];

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const slide = (...elements) => ({ background: {}, elements });

const until = async (pred, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
  return !!(await pred());
};

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-cardaction-');
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

  const files = { pic: png(40, 200, 90, 300, 200) };
  const media = [{ id: 'pic', name: 'jhxvb-map.png', mime: 'image/png', size: files.pic.length, kind: 'image' }];
  const spy = {
    ...box(300), x: 900, w: 200, h: 200, id: 'el_spy', name: 'Spy master', kind: 'shape', shape: 'rect', fill: '#aa5500', stroke: '#000', strokeWidth: 0, radius: 0,
    role: { class: 'npc', actions: [{ id: 'a_mission', do: 'card', slide: slide(text(MISSION), image('pic', 400)), to: 'trigger' }] },
  };
  const game = {
    id: 'g_card_action', version: 2, title: 'Cards from actions',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
    rounds: [{ id: 'r_rpg', name: 'Adventure', mode: 'rpg', world: 'w1' }],
    worlds: [{
      id: 'w1', name: 'World',
      maps: [{ id: 'm1', name: 'Map', cols: 1, rows: 1, visibility: 'full', showExits: true, revealNeighbors: true, diagonals: true, wrap: false, transition: 'cut',
        screens: [{ id: 's1', name: 'Village', col: 0, row: 0, slide: { background: { color: '#234' }, elements: [spy] } }] }],
    }],
    items: [{ id: 'i_scroll', name: 'Secret scroll', stackable: false }],
    statFields: [],
    wheels: [{ id: 'w_whisper', name: 'Whisper wheel', spinDurationMs: 300, removeAfterLanding: false, segments: [
      { id: 'sw', label: 'Whisper', color: '#e6194b', weight: 1, actions: [{ id: 'a_whisper', do: 'card', slide: slide(text(WHISPER)), to: 'others' }] },
    ] }],
    media, audio: {}, dice: [], theme: {},
  };
  const packPath = resolve('test-results/card-action.brainrot');
  writeFileSync(packPath, await packGame(game, files));

  // ---------- The host ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  await ctx.addInitScript(recordSeen);
  // Every message a window of the host's gets (by type): the audience window must never get a card window's. (A page's
  // own empty ones, a browser's way of yielding, aren't messages from another window.)
  await ctx.addInitScript(() => {
    window.__msgs = [];
    window.addEventListener('message', (e) => e.source !== window && window.__msgs.push(typeof e.data === 'object' && e.data ? String(e.data.type ?? '?') : `(${typeof e.data})`));
  });
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
  const cards = () => last()?.cards ?? [];
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- In the editor: an item's 🤫 Send a card button ----------
  await host.getByRole('button', { name: '📊 Stats & Items' }).click();
  await host.locator('div:has(> button[aria-label="Delete Secret scroll"])').getByRole('button', { name: 'More' }).click();
  await host.getByRole('button', { name: '＋ Add button' }).last().click();
  await host.getByRole('menuitem', { name: '🤫 Send a card' }).click();
  const words = host.getByLabel('Card words').last();
  await words.fill(SCROLL);
  const whoGets = host.getByLabel('Who gets it').last();
  const options = await whoGets.locator('option').allInnerTexts();
  assert(
    JSON.stringify(options) === JSON.stringify(['Whoever uses it', 'The party here', 'A player you pick then', 'Everyone else']),
    `an item’s 🤫 Send a card: who gets it is whoever uses it, the party, a player picked then, or everyone else (${options.join(' | ')})`,
  );
  assert((await whoGets.inputValue()) === 'trigger', 'it starts with whoever uses it');
  assert((await host.getByLabel('How long it lasts').last().inputValue()) === 'round', 'and lasts until the round ends');

  // ---------- Play, with phones for Ann and Bob ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(roomCard);
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
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.rh').waitFor();
  assert(await until(() => !!last()?.seats?.length), 'the room has the players');
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.rpg').waitFor();
  const offStream = async (when) => {
    const found = await shownOf(aud, SECRETS);
    assert(!found.length, `${when}: the audience window holds no card’s words or file name${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  // ---------- An object's 🤫 button only offers its card ----------
  await host.locator('.rpg .hit[data-object="el_spy"]').click();
  const objCard = host.getByRole('dialog', { name: 'Object: Spy master' });
  await objCard.waitFor();
  await objCard.locator('.who').getByRole('button', { name: 'Bob', exact: true }).click();
  await objCard.getByRole('button', { name: '🤫 Card for whoever set it off' }).click();
  const offer = host.locator('.panel [data-card-offer]');
  await offer.waitFor();
  const chip = (o, name) => o.getByRole('button', { name: new RegExp(`^${name}( \\(no phone here\\))?$`) });
  assert((await chip(offer, 'Bob').getAttribute('aria-pressed')) === 'true' && (await chip(offer, 'Ann').getAttribute('aria-pressed')) === 'false', 'the offer starts with whoever set it off (Bob, picked on the object’s card)');
  assert((await offer.locator('[data-offer-card]').innerText()).includes('1 line of words, 1 picture') && !(await offer.innerText()).includes('wqzpk'), 'it counts what’s on the card, never says it');
  await sleep(600);
  assert(!cards().length && !JSON.stringify(states).includes('wqzpk') && !heard.bob.join('').includes('wqzpk'), 'pressing the button sent nothing: the room has no card');
  await offer.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 1), '📤 Send: the room’s state holds the card');
  assert(JSON.stringify(cards()[0].to) === JSON.stringify([{ seat: seat.Bob }]) && cards()[0].text === MISSION && /^sc:/.test(cards()[0].id), 'to Bob’s seat only, with its words, under its own id');
  assert(await until(() => !!cards()[0]?.media?.[0]?.file), 'its picture from this computer goes up, and the card names the room’s file');
  assert(!JSON.stringify(states).includes('jhxvb'), 'no file name goes to the room');
  await bob.getByRole('button', { name: 'Tap to see' }).waitFor();
  assert(!(await ann.locator('.card').count()) && !heard.ann.join('').includes('wqzpk'), 'Ann’s phone gets nothing of it');
  assert(await until(async () => !(await offer.count())), 'the offer goes once sent');
  const tools = host.locator('.panel .toolsrow');
  assert((await tools.locator('[data-cards-out-count]').innerText()).trim() === '🤫 1 card out', 'it is in the cards out, counted');
  await host.keyboard.press('Escape');

  // ---------- A wheel slice's: Skip sends nothing; 📤 Send to everyone else ----------
  await tools.getByRole('button', { name: '🎡 Wheel' }).click();
  await host.getByRole('button', { name: 'Whisper wheel', exact: true }).click();
  await mainButton(host, 'Spin!').click();
  const tc = host.locator('[data-tool-controls]');
  await tc.getByText('This was for').waitFor({ timeout: 10000 });
  await tc.getByRole('button', { name: 'Bob', exact: true }).click();
  const slice = tc.getByRole('button', { name: '🤫 Card for everyone else' });
  await slice.click();
  await offer.waitFor();
  assert(
    (await chip(offer, 'Ann').getAttribute('aria-pressed')) === 'true' && (await chip(offer, 'Cat').getAttribute('aria-pressed')) === 'true' && (await chip(offer, 'Bob').getAttribute('aria-pressed')) === 'false',
    'a slice’s card for everyone else starts with everyone but the player the spin was for',
  );
  assert((await offer.innerText()).includes('Cat has no phone here'), 'it says Cat has no phone here (copy, or the card window)');
  await offer.getByRole('button', { name: 'Skip' }).click();
  await sleep(600);
  assert(!(await offer.count()) && cards().length === 1 && !JSON.stringify(states).includes('Whisper-'), 'Skip: the offer goes, and nothing is sent');
  await slice.click();
  await offer.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 2), 'pressed again and sent: two cards out');
  assert(JSON.stringify(cards()[1].to) === JSON.stringify([{ seat: seat.Ann }, { seat: seat.Cat }]) && cards()[1].text === WHISPER, 'Card 2 goes to Ann’s and Cat’s seats');
  await ann.getByRole('button', { name: 'Tap to see' }).waitFor();
  assert(!heard.bob.join('').includes('Whisper-'), 'Bob’s phone gets nothing of it');
  await host.keyboard.press('Escape');
  await offStream('cards from actions sent');

  // ---------- 🪟 The card window: Cat's cards (she has no phone) ----------
  assert(!(await tools.getByRole('button', { name: /🪟/ }).count()), 'the tools row has no 🪟 button while no card window is open');
  await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
  const sendMenu = host.getByRole('dialog', { name: 'Send a card' });
  await sendMenu.waitFor();
  const [win] = await Promise.all([host.waitForEvent('popup'), sendMenu.getByRole('button', { name: 'Card window for Cat' }).click()]);
  watch(win, 'card window');
  await win.getByText('For Cat only').waitFor();
  await win.getByText(WHISPER).waitFor();
  assert(!(await win.getByText(MISSION).count()), 'the card window shows Cat’s card, not Bob’s');
  assert((await tools.locator('[data-card-window-warn]').innerText()).includes('share only the game window with viewers'), 'a ⚠ line reminds the host to share only the game window with viewers');
  assert((await tools.getByRole('button', { name: /🪟 Cards: Cat/ }).count()) === 1, 'the tools row says whose cards it shows');
  // Switched to Bob: his card, with its picture from this computer.
  await tools.getByRole('button', { name: /🪟 Cards: Cat/ }).click();
  await host.getByRole('dialog', { name: 'Card window' }).getByRole('button', { name: 'Card window for Bob' }).click();
  await win.getByText('For Bob only').waitFor();
  await win.getByText(MISSION).waitFor();
  assert(await until(() => win.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0 && i.src.startsWith('blob:')).catch(() => false)), 'its picture shows, from this computer’s file');
  assert(!(await win.getByText(WHISPER).count()), 'and not Cat’s card');
  // ✖ Take back: the window drops it.
  await tools.locator('[data-cards-out-count]').click();
  await host.getByRole('dialog', { name: 'Cards out' }).getByRole('button', { name: 'Take Card 1 back' }).click();
  await win.getByText('Nothing private right now').waitFor();
  assert(await until(() => win.locator('img').count().then((n) => n === 0)), 'taken back: “Nothing private right now”, its picture gone');
  assert(await until(async () => !(await bob.locator('.card').count())), 'Bob’s phone drops it too');
  await host.keyboard.press('Escape');

  // ---------- Nothing of it in the audience window ----------
  const audMsgs = await aud.evaluate(() => window.__msgs);
  assert(audMsgs.includes('session') && !audMsgs.some((t) => t.startsWith('private-')), `the audience window got the game’s state and never a card window message (${[...new Set(audMsgs)].join(', ')})`);
  const winMsgs = await win.evaluate(() => window.__msgs);
  assert(winMsgs.length > 0 && winMsgs.every((t) => t.startsWith('private-')), `the card window gets only its own messages (${[...new Set(winMsgs)].join(', ')})`);
  await offStream('the card window open');

  // ✖ Close it from the menu.
  await tools.getByRole('button', { name: /🪟 Cards: Bob/ }).click();
  await host.getByRole('dialog', { name: 'Card window' }).getByRole('button', { name: '✖ Close the card window' }).click();
  assert(await until(() => win.isClosed()), 'Close the card window closes it');
  assert(!(await tools.locator('[data-card-window-warn]').count()) && !(await tools.getByRole('button', { name: /🪟/ }).count()), 'and the ⚠ line and its button go');

  // ---------- No phone buzzers: 🪟 Show puts an offered card in the card window ----------
  const plain = (id, q, a, extra = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)), ...extra });
  const board = {
    id: 'r_board', name: 'Round 2', mode: 'board', values: [200, 400], dailyDoubleCount: 0,
    categories: [
      {
        id: 'cat0', title: 'Movies',
        clues: [
          plain('q_tip', 'A plain question', 'Plain answer', { cards: [{ id: 't1', to: 'picker', ...slide(text(TIP)) }] }),
          plain('q_partner', 'Describe it', 'Shrek', {
            type: 'partner', timerSeconds: 60,
            partner: { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' },
            cards: [{ id: 'p1', to: 'giver', ...slide(text(DESCRIBE)) }],
          }),
        ],
      },
      { id: 'cat1', title: 'Songs', clues: [plain('q_s1', 'A song', 'Song'), plain('q_s2', 'Another song', 'Song')] },
    ],
  };
  // (Here the Spy master's card has a sound too, of which it plays 1 s to 3 s: the card window keeps to that part.)
  const offlineWorlds = structuredClone(game.worlds);
  offlineWorlds[0].maps[0].screens[0].slide.elements[0].role.actions[0].slide.elements.push({
    ...box(600), kind: 'audio', media: 'part', startAt: 1, endAt: 3, autoplay: false, loop: false, muted: false, volume: 1, visible: true,
  });
  const part = wav(4, { rate: 8000, channels: 1 });
  const offline = {
    ...game, id: 'g_card_action_offline', settings: { ...game.settings, buzzer: false }, rounds: [...game.rounds, board], worlds: offlineWorlds,
    media: [...media, { id: 'part', name: 'part.wav', mime: 'audio/wav', size: part.length, kind: 'audio' }],
  };
  const offlinePath = resolve('test-results/card-action-offline.brainrot');
  writeFileSync(offlinePath, await packGame(offline, { ...files, part }));
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx2.grantPermissions(['clipboard-read', 'clipboard-write']);
  const solo = watch(await ctx2.newPage(), 'host, no phones');
  let sockets = 0;
  solo.on('websocket', () => sockets++);
  await solo.goto(pathToFileURL(file).href);
  await openGameFile(solo, offlinePath);
  await solo.getByText(/^Opened “/).waitFor();
  await solo.getByRole('button', { name: '▶ Play' }).click();
  await solo.getByRole('button', { name: 'Start game ▶' }).click();
  await solo.locator('.rh').waitFor();
  const tools2 = solo.locator('.panel .toolsrow');
  await tools2.getByRole('button', { name: '🤫 Send a card…' }).click();
  const soloSend = solo.getByRole('dialog', { name: 'Send a card' });
  const [win2] = await Promise.all([solo.waitForEvent('popup'), soloSend.getByRole('button', { name: 'Card window for Cat' }).click()]);
  watch(win2, 'card window, no phones');
  await win2.getByText('Nothing private right now').waitFor();
  // (🤫 Send a card… stays open, so a card can go to the window next: Esc closes it.)
  assert(await soloSend.isVisible(), 'opening the card window from 🤫 Send a card… leaves the dialog open');
  await solo.keyboard.press('Escape');
  await soloSend.waitFor({ state: 'detached' });
  await solo.locator('.rpg .hit[data-object="el_spy"]').click();
  const spyCard = solo.getByRole('dialog', { name: 'Object: Spy master' });
  await spyCard.locator('.who').getByRole('button', { name: 'Cat', exact: true }).click();
  await spyCard.getByRole('button', { name: '🤫 Card for whoever set it off' }).click();
  const offer2 = solo.locator('.panel [data-card-offer]');
  await offer2.waitFor();
  assert(!(await offer2.getByRole('button', { name: '📤 Send' }).count()) && (await offer2.getByRole('button', { name: '📋 Copy words' }).count()) === 1, 'no phones: the offer has no 📤 Send, and copies the card (📋)');
  await offer2.getByRole('button', { name: '🪟 Show Cat' }).click();
  await win2.getByText(MISSION).waitFor();
  assert(await until(() => win2.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false)), 'with the card window open for Cat, 🪟 Show puts the card there, its picture included');
  // Its sound plays its part only: from 1 s, and at 3 s it stops and goes back to 1 s, as on a phone.
  const partSound = win2.locator('audio');
  const waits = await win2.waitForFunction(() => { const a = document.querySelector('audio'); return !!a && a.readyState >= 1 && Math.abs(a.currentTime - 1) < 0.05; }).then(() => true, () => false);
  assert(waits, 'its sound waits at its Start at (1 s)');
  // (A click there first, as Cat's: the window may play sound.)
  await win2.locator('.head').click();
  await partSound.evaluate((a) => a.play());
  await win2.waitForFunction(() => document.querySelector('audio').currentTime > 1.5);
  const partEnd = await win2
    .waitForFunction(() => { const a = document.querySelector('audio'); return a.paused && a.currentTime < 1.2; }, null, { timeout: 8000 })
    .then(() => true, () => false);
  const partAt = await partSound.evaluate((a) => ({ t: +a.currentTime.toFixed(2), paused: a.paused }));
  assert(partEnd, `played, it stops at its Stop at (3 s) and goes back to 1 s, as on a phone (${JSON.stringify(partAt)})`);
  assert((await tools2.locator('[data-cards-out-count]').innerText()).trim() === '🤫 1 card out' && sockets === 0, 'it is in the cards out (to take back), and nothing went anywhere else');

  // ---------- No phone buzzers, a board round: 🪟 Show a standard tile's card, then a partner clue's ----------
  await solo.keyboard.press('Escape');
  await sleep(600);
  await tools2.getByRole('button', { name: 'Next round ▶' }).click();
  await confirmStrip(solo).getByRole('button', { name: 'Yes' }).waitFor();
  await sleep(600);
  await confirmStrip(solo).getByRole('button', { name: 'Yes' }).click();
  await solo.locator('.stage-box .tile').first().waitFor();
  await win2.getByText('Nothing private right now').waitFor();
  assert(true, 'the next round: the offered card (until the round ends) goes from the card window');
  // The buzzer room's limit (8 cards at once) is for phones: with none, the card window takes more.
  await tools2.getByRole('button', { name: '🤫 Send a card…' }).click();
  const fillSend = solo.getByRole('dialog', { name: 'Send a card' });
  await fillSend.getByRole('radio', { name: 'A quick card' }).check();
  await fillSend.getByRole('button', { name: 'Cat', exact: true }).click();
  for (let i = 1; i <= 9; i++) {
    await fillSend.getByRole('textbox', { name: 'The card’s words' }).fill(`Extra card ${i}`);
    const show = fillSend.getByRole('button', { name: '🪟 Show Cat' });
    assert(await until(() => show.isEnabled()), `no phones: 🪟 Show Cat can show card ${i}`);
    await show.click();
    await fillSend.locator('[data-card-said]').getByText(`Card ${i} sent to Cat`).waitFor();
  }
  await win2.getByText('Extra card 9').waitFor();
  assert(!(await fillSend.locator('[data-cards-full]').count()) && (await tools2.locator('[data-cards-out-count]').innerText()).trim() === '🤫 9 cards out', 'all nine are in the card window, and nothing says the phones are full');
  // A quick card for Ann and Cat: 🪟 Show shows it to Cat alone, and the line under it copies it to Ann (its words are
  // gone from the form once it went).
  await fillSend.getByRole('button', { name: 'Ann', exact: true }).click();
  const FOR_BOTH = 'Extra card for two';
  await fillSend.getByRole('textbox', { name: 'The card’s words' }).fill(FOR_BOTH);
  await fillSend.getByRole('button', { name: '🪟 Show Cat' }).click();
  const fillSaid = fillSend.locator('[data-card-said]');
  await fillSaid.getByText('Card 10 sent to Cat').waitFor();
  await win2.getByText(FOR_BOTH).waitFor();
  assert((await fillSaid.innerText()) === '✓ Card 10 sent to Cat · copy it to Ann (📋)', `shown to Cat: the line under it says to copy it to Ann (${await fillSaid.innerText()})`);
  assert(!(await fillSend.getByRole('button', { name: '📋 Copy words', exact: true }).count()), 'and the form’s 📋 Copy words, with nothing on the card now, is gone');
  await fillSend.getByRole('button', { name: 'Copy Card 10’s words for Ann' }).click();
  const forAnn = `🤫 For Ann only (Card 10): ${FOR_BOTH}`;
  assert(await until(async () => (await solo.evaluate(() => navigator.clipboard.readText())) === forAnn, 5000), `its 📋 Copy words copies what went, for Ann (“${forAnn}”)`);
  await solo.keyboard.press('Escape');
  await fillSend.waitFor({ state: 'detached' });
  await solo.keyboard.press('p');
  await solo.keyboard.press('3');
  await solo.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  const soloTile = solo.locator('.panel [data-tile-cards] [data-tile-card="1"]');
  await soloTile.waitFor();
  assert(!(await soloTile.getByRole('button', { name: 'Send card 1' }).count()), 'no phones: a tile’s card has no 📤 Send');
  await soloTile.getByRole('button', { name: 'Show card 1 to Cat' }).click();
  await win2.getByText(TIP).waitFor();
  assert((await soloTile.innerText()).includes('in the 🪟 card window'), 'with the card window open for Cat (who picked it), 🪟 Show puts the tile’s card there, and its row says so');
  const soloBadge = solo.locator('.stage-box [data-private-badge]');
  assert(await until(async () => (await soloBadge.count()) === 1 && (await soloBadge.innerText()).includes('Cat') && (await soloBadge.innerText()).includes('has a private question')), 'the stream says Cat has a private question');
  assert(!(await shownOf(solo, SECRETS)).length, 'one window: the host page holds none of the card’s words');
  // 🤫 Send a card… with that card, to Cat, to last the round: it can go (the one out lasts only until the tile closes),
  // once. With no phones there's no ↻ Send again in the cards out, so the dialog never sends the host there.
  await tools2.getByRole('button', { name: '🤫 Send a card…' }).click();
  const tileSend = solo.getByRole('dialog', { name: 'Send a card' });
  await tileSend.waitFor();
  await tileSend.getByRole('radio', { name: 'One made in the editor' }).check();
  await tileSend.getByRole('combobox', { name: 'The card to send' }).selectOption('q_tip/t1');
  await tileSend.getByRole('button', { name: 'Cat', exact: true }).click();
  await tileSend.getByRole('radio', { name: 'until the round ends' }).check();
  const showCat = tileSend.getByRole('button', { name: '🪟 Show Cat' });
  assert(await until(() => showCat.isEnabled()), 'out to Cat until the tile closes: 🪟 Show Cat can still make it last the round');
  await showCat.click();
  const said = await tileSend.locator('[data-card-said]').innerText();
  const label = said.match(/Card \d+/)?.[0];
  assert(!!label && said.includes('sent to Cat'), `it goes (${said})`);
  assert(await until(() => showCat.isDisabled()), 'and then 🪟 Show Cat is off: it’s out to her for as long');
  const already = await tileSend.locator('[data-card-already]').innerText();
  assert(already.includes(`${label} is out to them already`) && already.includes('✖ Take it back') && !already.includes('↻'), `it says to ✖ take it back first, never ↻ Send again, which isn’t there (${already})`);
  await solo.keyboard.press('Escape');
  await tileSend.waitFor({ state: 'detached' });
  await tools2.locator('[data-cards-out-count]').click();
  const soloOut = solo.locator('[data-cards-out]');
  await soloOut.waitFor();
  assert(!(await soloOut.getByRole('button', { name: /^Send .* again$/ }).count()), 'the cards out offer no ↻ Send again');
  await soloOut.getByRole('button', { name: `Take ${label} back` }).click();
  await soloOut.locator(`[data-card-out="${label}"]`).waitFor({ state: 'detached' });
  // (The card window hears it a moment after the host page: until then it still shows both copies, and looking for the
  // card's words would find two.)
  assert(await until(async () => (await win2.getByText(TIP).count()) === 1), `${label} taken back: the card window shows the tile’s card alone`);
  await solo.keyboard.press('Escape');
  await soloOut.waitFor({ state: 'detached' });
  // Shift+Esc asks first (Cat saw the tile's card); left unanswered, ▦ Done ▶ board closes the tile.
  await solo.keyboard.press('Shift+Escape');
  await confirmStrip(solo).getByText('Put the tile back anyway?').waitFor();
  await flowButton(solo, 'done', '▦ Done ▶ board').click();
  await win2.getByText(TIP).waitFor({ state: 'detached' });
  assert(await win2.getByText('Extra card 9').isVisible(), 'the tile closed: its card goes from the card window (the round’s stay)');
  assert(!(await confirmStrip(solo).count()), 'and the question left unanswered goes with the tile');
  await solo.getByRole('button', { name: '↶ Reopen Movies $200' }).click();
  await solo.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  await soloTile.waitFor();
  assert(!(await confirmStrip(solo).count()), 'opened again, the tile asks nothing by itself');
  await solo.keyboard.press('Shift+Escape');
  await soloTile.waitFor({ state: 'detached' });

  await solo.keyboard.press('p');
  await solo.keyboard.press('1');
  await solo.locator('.stage-box .tile[aria-label^="Movies for $400"]').click();
  const soloPartner = solo.locator('.panel [data-partner-panel]');
  await soloPartner.getByText('Ann picked it.').waitFor();
  await solo.keyboard.press('3');
  await mainButton(solo).click();
  const pRow = soloPartner.locator('[data-card="1"]');
  await pRow.waitFor();
  assert((await pRow.getByRole('button', { name: 'Card 1 to Cat', exact: true }).getAttribute('aria-pressed')) === 'true', 'the partner clue’s card goes to Cat, the describer');
  await pRow.getByRole('button', { name: 'Show card 1 to Cat' }).click();
  await win2.getByText(DESCRIBE).waitFor();
  assert((await pRow.innerText()).includes('in the 🪟 card window'), 'from the Distribute row, 🪟 Show puts it in Cat’s card window, and the row says so');
  assert(!(await shownOf(solo, SECRETS)).length && sockets === 0, 'the host page holds none of its words, and nothing went anywhere else');
  await win2.getByText('You’re the Describer').waitFor();
  assert(await win2.getByText('Describe it to Ann: don’t say what’s on it!').isVisible(), 'the card window says Cat’s part and what to do, as a phone does');
  // Cat saw it: ↩ Cancel (keep tile) asks first, as with phones, in the panel (nothing goes over the stage).
  await solo.keyboard.press('Shift+Escape');
  const keepAsk = confirmStrip(solo);
  await keepAsk.waitFor();
  assert(/went to Cat\. Put the tile back anyway\?/.test(await keepAsk.innerText()) && !(await solo.getByRole('alertdialog').count()), `Shift+Esc asks first, in the panel (${(await keepAsk.innerText()).replace(/\s+/g, ' ')})`);
  await keepAsk.getByRole('button', { name: 'Keep playing' }).click();
  await keepAsk.waitFor({ state: 'detached' });
  assert((await soloPartner.count()) === 1 && (await win2.getByText(DESCRIBE).count()) === 1, 'Keep playing: the tile stays open, its card in the card window');
  await solo.keyboard.press('r');
  await solo.keyboard.press('Escape');
  await win2.getByText(DESCRIBE).waitFor({ state: 'detached' });
  assert(true, 'the tile closed: the partner clue’s card goes from the card window');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Card action tests passed');
} finally {
  await browser?.close();
  buzzer.stop();
}
