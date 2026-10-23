// 🤫 Cards in every kind of round, end to end (docs/PARTNER-CLUES-SPEC.md §11, §12, §13.6, §14, §15.2, milestone P3):
// the built app hosts one game of three rounds (a Jeopardy board, an RPG round and a board-game round) against the real
// buzzer room (buzzer/ under `wrangler dev`, local), with phones for Ann, Bob and Cat on the real phone page (Dan comes
// late). In each round 🤫 Send a card… in the tools row sends a card to one chosen player: only that phone gets it, and a
// phone that takes the seat after the send doesn't (a freed seat taken by a new phone, a seat given up and picked again,
// a player's first phone), until ↻ Send again. In one window the host page (what viewers see) never holds a card's
// words or file names, the list of cards out included, and ✖ Take back takes a card off the phones. A standard tile's
// card and a Daily Double's go to the picker by a press and stay until the tile closes ("The answer's on screen" after
// Reveal). An RPG object's card action, a wheel slice's and a board space's only offer their card: nothing reaches the
// room until 📤 Send. The 🪟 card window shows only its player's cards, and the audience window never gets one of its
// messages nor a typed card's words. Exit › Keep & leave keeps the cards out under their ids (a reload in the editor
// too), so a phone seated meanwhile is late for them on Resume; discarding the kept game takes them off the phones. A
// host reload with cards out resumes with the same card ids (nothing sent again, an offer left waiting not sent), the
// card window lets go of its cards when the host page goes, and comes back (the same window) on 🪟.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, mainButton, mainLabel, openGameFile, packGame, png, recordSeen, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// ---------- The game ----------

// Words made in the editor carry "vqzjx" and file names "mwkpf". Words typed into a quick card in play carry "zqxwv"
// (and "xqvzk", in one window): they are only ever in the game in progress, which the viewers' windows never get.
const NOTE = 'Note-vqzjx words'; // Songs $400's card (to nobody): never listed in one window, as the tile isn't played
const TYPED = 'Typed-xqvzk note'; // typed into a quick card in one window, hidden as it's typed
const JUST = 'Just-vqzjx words'; // Movies $200's card (🤫 Just you), with a picture
const INSIDER = 'Insider-vqzjx tip'; // the Daily Double's (💡 Insider tip)
const MISSION = 'Mission-vqzjx words'; // the RPG object's card action, with a picture
const WHISPER = 'Whisper-vqzjx words'; // the wheel slice's
const SECRET = 'Secret-vqzjx mission'; // the board space's
const QUICK = 'Quick-zqxwv rpg'; // typed in the RPG round
const QUICK_FILE = 'zqxwv-quick.png'; // a picture put on that quick card: its name must never reach the viewers' windows
const FOR_DAN = 'Dan-zqxwv only'; // typed in the board-game round
const SECRETS = ['vqzjx', 'mwkpf', 'zqxwv', 'xqvzk'];
const LATE = 'A card went to your seat before this phone joined. Ask the host to send it again.';

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const slide = (...elements) => ({ background: {}, elements });

/** Waits (up to `ms`: a slow machine takes its time) until pred() holds. */
const until = async (pred, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await pred()) return true;
  return !!(await pred());
};
/** An element's words on one line (a row's parts are laid out apart). */
const words = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-cardrounds-');
const { base } = buzzer;
let browser;
const errors = [];
/** Pages whose next dialog is expected (a phone's "Give up this player?"): accepted, not an error. */
const asking = new Set();
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => {
    if (!asking.delete(p)) errors.push(`[${name}] dialog: ${d.message()}`);
    void d.accept();
  });
  return p;
};

try {
  browser = await chromium.launch({ executablePath });

  const files = { just: png(200, 60, 20, 300, 200), map: png(40, 200, 90, 300, 200) };
  const media = [
    { id: 'just', name: 'mwkpf-just.png', mime: 'image/png', size: files.just.length, kind: 'image' },
    { id: 'map', name: 'mwkpf-map.png', mime: 'image/png', size: files.map.length, kind: 'image' },
  ];
  const plain = (id, q, a, extra = {}) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)), ...extra });
  const values = [200, 400];
  const spy = {
    ...box(300), x: 900, w: 200, h: 200, id: 'el_spy', name: 'Spy master', kind: 'shape', shape: 'rect', fill: '#aa5500', stroke: '#000', strokeWidth: 0, radius: 0,
    role: { class: 'npc', actions: [{ id: 'a_mission', do: 'card', slide: slide(text(MISSION), image('map', 400)), to: 'trigger' }] },
  };
  const space = (id, name, x, y, next, more = {}) => ({ id, name, x, y, color: '#4363d8', next, ...more });
  const game = {
    id: 'g_card_rounds',
    version: 2,
    title: 'Cards in every round',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
    rounds: [
      {
        id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 1,
        categories: [
          {
            id: 'cat0', title: 'Movies',
            clues: [
              plain('q_just', 'A plain question', 'Plain answer', { cards: [{ id: 'j1', to: 'picker', ...slide(text(JUST), image('just', 400)) }] }),
              plain('q_dd', 'A Daily Double question', 'DD answer', { type: 'dailyDouble', cards: [{ id: 'd1', to: 'picker', ...slide(text(INSIDER)) }] }),
            ],
          },
          { id: 'cat1', title: 'Songs', clues: [plain('q_song', 'A song clue', 'A song'), plain('q_note', 'Another song clue', 'Another song', { cards: [{ id: 'n1', to: 'nobody', ...slide(text(NOTE)) }] })] },
        ],
      },
      { id: 'r2', name: 'Adventure', mode: 'rpg', world: 'w1' },
      {
        id: 'r3', name: 'Board game', mode: 'boardgame', slide: { background: { color: '#1d5e3a' }, elements: [] },
        spaces: [
          space('b0', 'Start', 400, 420, ['b1']),
          space('b1', 'Mission', 800, 420, ['b2'], { onLand: [{ id: 'a_secret', do: 'card', slide: slide(text(SECRET)), to: 'trigger' }] }),
          space('b2', 'Space 3', 1200, 420, ['b3']),
          space('b3', 'Space 4', 800, 720, ['b0']),
        ],
        mover: { kind: 'dice', dice: 'd6' }, zones: [],
      },
    ],
    worlds: [{
      id: 'w1', name: 'World',
      maps: [{ id: 'm1', name: 'Map', cols: 1, rows: 1, visibility: 'full', showExits: true, revealNeighbors: true, diagonals: true, wrap: false, transition: 'cut',
        screens: [{ id: 's1', name: 'Village', col: 0, row: 0, slide: { background: { color: '#234' }, elements: [spy] } }] }],
    }],
    items: [], statFields: [],
    wheels: [{ id: 'w_whisper', name: 'Whisper wheel', spinDurationMs: 300, removeAfterLanding: false, segments: [
      { id: 'sw', label: 'Whisper', color: '#e6194b', weight: 1, actions: [{ id: 'a_whisper', do: 'card', slide: slide(text(WHISPER)), to: 'trigger' }] },
    ] }],
    media, audio: {}, dice: [], theme: {},
  };
  const packPath = resolve('test-results/card-rounds.brainrot');
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
  // Every message a window of the host's gets from another (by type), and any (from a window or on the app's channel)
  // that holds a card window's message or a typed card's words: the audience window must never get one.
  await ctx.addInitScript(() => {
    window.__msgs = [];
    window.__leaks = [];
    // The files in each copy of the game this window was sent (by name).
    window.__games = [];
    const check = (where, data) => {
      try {
        const s = JSON.stringify(data) ?? '';
        if (s.includes('zqxwv') || s.includes('"private-')) window.__leaks.push(`${where}: ${s.slice(0, 160)}`);
      } catch {
        // (not JSON)
      }
    };
    window.addEventListener('message', (e) => {
      if (e.source === window) return;
      window.__msgs.push(typeof e.data === 'object' && e.data ? String(e.data.type ?? '?') : `(${typeof e.data})`);
      if (e.data?.type === 'game') window.__games.push((e.data.game?.media ?? []).map((m) => m.name));
      check('window', e.data);
    });
    try {
      new BroadcastChannel('brainrot-games-sync').onmessage = (e) => check('channel', e.data);
    } catch {
      // no channel here
    }
  });
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
  /** The cards in the room's state now. */
  const cards = () => last()?.cards ?? [];
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(roomCard);

  // ---------- Phones for Ann, Bob and Cat (Dan has none yet) ----------
  /** What each phone heard from the room. */
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
  /** The phone's last view from the room. */
  const viewOf = (label) => heard[label].map((m) => JSON.parse(m)).filter((m) => m.t === 'view').at(-1)?.view ?? {};
  /** Whether a phone has heard anything of these words. */
  const heardOf = (label, w) => heard[label].join('').includes(w);
  const cardsOn = (p) => p.locator('.card').count();
  /** A card file, fetched from the room as this phone would (with its seat token): the HTTP status. */
  const fetchAs = (p, id) =>
    p.evaluate(
      async ([u, c]) => {
        const token = JSON.parse(localStorage.getItem(`brainrot-buzzer:${c}`)).token;
        return (await fetch(u, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })).status;
      },
      [`${base}/api/rooms/${code}/files/${id}`, code],
    );
  /** The phone shows a card behind Tap to see: tap it, and its words show. */
  const tapOpen = async (p, w) => {
    const cover = p.getByRole('button', { name: 'Tap to see' });
    await cover.waitFor();
    assert(!(await p.getByText(w).isVisible()), `${w.split('-')[0]}: behind Tap to see`);
    await cover.tap();
    await p.getByText(w).waitFor();
  };
  const ann = await join('ann', 'Ann');
  let bob = await join('bob', 'Bob');
  const cat = await join('cat', 'Cat');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  assert(await until(() => (last()?.seats?.length ?? 0) === 4), 'the room has the four players');
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const to = (...names) => JSON.stringify(names.map((n) => ({ seat: seat[n] })));

  /** No card's words or file names on this page (with recordSeen: nor anything it showed or said since it loaded). */
  const offStream = async (p, name, when) => {
    const found = await shownOf(p, SECRETS);
    assert(!found.length, `${when}: ${name} holds no card’s words or file name${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };
  const tools = host.locator('.panel .toolsrow');
  const sendMenu = host.getByRole('dialog', { name: 'Send a card' });
  const outList = host.getByRole('dialog', { name: 'Cards out' });
  const outButton = tools.locator('[data-cards-out-count]');
  const rowText = (label) => words(outList.locator(`[data-card-out="${label}"]`));
  const openSend = async () => {
    await tools.getByRole('button', { name: '🤫 Send a card…' }).click();
    await sendMenu.waitFor();
  };
  const closeMenu = async (menu) => {
    await host.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
  };
  const nextRound = async () => {
    // (Its button ignores a click in its first moments on screen: the second half of a double-click.)
    await sleep(600);
    await tools.getByRole('button', { name: 'Next round ▶' }).click();
    await confirmStrip(host).getByRole('button', { name: 'Yes' }).waitFor();
    await sleep(600);
    await confirmStrip(host).getByRole('button', { name: 'Yes' }).click();
  };

  // =====================================================================================================================
  // Round 1, a Jeopardy board, in one window: the host page is what viewers see.
  // =====================================================================================================================
  console.log('A Jeopardy round, in one window:');

  // ---------- 🤫 Send a card… to Bob, in one window: a quick card, typed out of sight ----------
  await openSend();
  const pick = sendMenu.getByRole('combobox', { name: 'The card to send' });
  assert(
    (await sendMenu.getByRole('radio', { name: 'One made in the editor' }).isDisabled()) && (await sendMenu.getByRole('radio', { name: 'A quick card' }).isChecked()) && !(await pick.count()),
    'one window, no tile played yet: no card made in the editor to choose (listing them would tell viewers where the Daily Double is)',
  );
  assert((await sendMenu.locator('[data-saved-note]').innerText()).includes('not played yet are listed with the audience window open'), 'and it says why');
  assert((await sendMenu.locator('.exposed').innerText()).includes('Viewers can see this window'), 'and the menu says viewers see it');
  assert(await sendMenu.getByRole('radio', { name: 'The slide on screen' }).isDisabled(), 'on the board, nothing is on screen to send');
  const typedBox = sendMenu.getByRole('textbox', { name: 'The card’s words' });
  await typedBox.fill(TYPED);
  assert((await typedBox.evaluate((el) => getComputedStyle(el).webkitTextSecurity)) === 'disc', 'what’s typed is hidden as it’s typed (viewers see this window)');
  assert(!(await sendMenu.getByRole('combobox', { name: 'A file from the game’s 🖼 Media' }).count()), 'and the game’s files (by name) aren’t offered in one window');
  await sendMenu.getByRole('button', { name: 'Bob', exact: true }).click();
  await sleep(500);
  assert(!JSON.stringify(states).includes('"cards"') && !Object.values(heard).join('').includes('Typed-'), 'typing the card and choosing who gets it sends nothing');
  await sendMenu.getByRole('button', { name: '📤 Send' }).click();
  await sendMenu.locator('[data-card-said]').getByText('Card 1 sent to Bob').waitFor();
  assert(await until(() => cards().length === 1), 'sent: the room’s state holds one card');
  const note1 = cards()[0];
  assert(/^sc:/.test(note1.id) && JSON.stringify(note1.to) === to('Bob') && note1.text === TYPED, 'to Bob’s seat only, with its words, under its own id');
  await tapOpen(bob, TYPED);
  assert(true, 'Bob’s phone gets it');
  for (const [p, label] of [[ann, 'ann'], [cat, 'cat']]) assert(!(await cardsOn(p)) && !heardOf(label, 'Typed-'), `${label === 'ann' ? 'Ann' : 'Cat'}’s phone: no card, and nothing of it`);
  await offStream(host, 'the host page in one window', 'a card sent from the tools row');
  await closeMenu(sendMenu);

  // ---------- A new phone on Bob's seat (freed for it) came late: nothing, until ↻ Send again ----------
  await host.getByRole('button', { name: /^📱 \d/ }).click();
  // (The phones list: one line per player, status, Free seat and ✕ Kick all inside it, with either font.)
  const fit = await host.getByRole('region', { name: 'Phone buzzers' }).evaluate((box) => {
    const ul = box.querySelector('ul.phones');
    const right = box.getBoundingClientRect().right;
    const rows = [...ul.children].map((li) => {
      const status = li.querySelector('.ok, .away, .muted');
      const lh = parseFloat(getComputedStyle(li).lineHeight) || 18;
      return { h: Math.round(status?.getBoundingClientRect().height ?? 0), lh, out: [...li.querySelectorAll('button')].some((b) => b.getBoundingClientRect().right > right + 0.5) };
    });
    return { rows, ul: ul.scrollWidth - ul.clientWidth, pop: box.scrollWidth - box.clientWidth };
  });
  assert(
    fit.rows.length >= 3 && fit.rows.every((r) => r.h && r.h < r.lh * 1.5 && !r.out) && fit.ul <= 0 && fit.pop <= 0,
    `the phones list: each player on one line, Free seat and ✕ Kick inside it, nothing scrolling sideways (${JSON.stringify(fit)})`,
  );
  await host.getByRole('button', { name: 'Free Bob’s seat (moved phone)' }).click();
  await bob.getByRole('heading', { name: 'The host freed your seat' }).waitFor();
  assert(!(await cardsOn(bob)), 'Bob’s seat freed: his old phone drops the card');
  await host.getByRole('button', { name: 'Close the phones list' }).click();
  bob = await join('bob2', 'Bob');
  await bob.locator('#cards-late').getByText(LATE).waitFor();
  assert(!(await cardsOn(bob)) && !heardOf('bob2', 'Typed-') && viewOf('bob2').cards?.late === 1, 'a new phone that took Bob’s seat after the send gets nothing of the card, only a note that it missed one');

  // ---------- The list of cards out, in one window: labels only ----------
  assert((await outButton.innerText()).trim() === '🤫 1 card out', 'the tools row only counts the cards out');
  await outButton.click();
  await outList.waitFor();
  assert(await until(async () => (await rowText('Card 1')).includes('Card 1 → Bob · ✓ seen · Bob’s new phone hasn’t got it: ↻ Send again · until the round ends')), `its row: who, seen (by his old phone), the new phone late, how long (${await rowText('Card 1')})`);
  assert((await outList.locator('.exposed').innerText()).includes('never what’s on it'), 'one window: the list says viewers see who got each card, never what’s on it');
  await offStream(host, 'the host page in one window', 'the list of cards out open');
  await outList.getByRole('button', { name: 'Send Card 1 again' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].id !== note1.id), '↻ Send again: the card goes under a new id');
  await tapOpen(bob, TYPED);
  assert(true, 'and reaches the new phone');
  assert(await until(async () => !(await rowText('Card 1')).includes('hasn’t got it')), 'the row’s warning goes');
  await outList.getByRole('button', { name: 'Take Card 1 back' }).click();
  assert(await until(() => !cards().length), '✖ Take back: no card in the room’s state');
  assert(await until(async () => !(await cardsOn(bob))), 'Bob’s phone drops it');
  await closeMenu(outList);
  assert(!(await outButton.count()), 'no cards out: the tools row says nothing of them');
  await offStream(host, 'the host page in one window', 'a card taken back');

  // ---------- 🤫 Just you: a standard tile's card to the picker, sent by a press ----------
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  const tilePart = host.locator('.panel [data-tile-cards]');
  await tilePart.waitFor();
  let tileRow = tilePart.locator('[data-tile-card="1"]');
  assert((await words(tileRow)).includes('Card 1 · 1 line of words, 1 picture'), 'the tile’s card in its panel, counted, never said');
  assert((await tileRow.getByRole('button', { name: 'Card 1 to Ann' }).getAttribute('aria-pressed')) === 'true', 'it starts with the picker, Ann');
  await sleep(600);
  assert(!cards().length && uploads === 0, 'opening the tile sends nothing, and uploads nothing');
  await tileRow.getByRole('button', { name: 'Send card 1' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].text === JUST), 'sent: the room holds the tile’s card');
  assert(JSON.stringify(cards()[0].to) === to('Ann') && cards()[0].open, 'to Ann only, open');
  assert(await until(() => !!cards()[0]?.media?.[0]?.file && uploads === 1), 'its picture from this computer goes up once');
  await tapOpen(ann, JUST);
  assert(await until(() => ann.locator('.card img').evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false)), 'Ann’s phone gets it, picture and all');
  assert(!(await cardsOn(bob)) && !(await cardsOn(cat)) && !heardOf('bob2', 'Just-') && !heardOf('cat', 'Just-'), 'nobody else gets it');
  await offStream(host, 'the host page in one window', 'a standard tile’s card sent');
  const privateBadge = host.locator('.stage-box [data-private-badge]');
  assert(await until(async () => (await privateBadge.count()) === 1 && (await words(privateBadge)) === '🤫 Ann has a private question'), 'the stream says Ann has a private question (never what it is)');
  assert((await mainLabel(host)) === '👁 Reveal answer', 'the tile plays as usual: 👁 Reveal answer');

  // ---------- The slide on screen, as a card (what viewers see: nothing hidden from them goes) ----------
  await openSend();
  await sendMenu.getByRole('radio', { name: 'The slide on screen' }).check();
  await sendMenu.getByRole('button', { name: 'Bob', exact: true }).click();
  await sendMenu.getByRole('button', { name: '📤 Send' }).click();
  await sendMenu.locator('[data-card-said]').getByText('Card 2 sent to Bob').waitFor();
  assert(await until(() => cards().length === 2 && cards()[1].text === 'A plain question' && JSON.stringify(cards()[1].to) === to('Bob')), 'the slide on screen goes as a card, to Bob only');
  await closeMenu(sendMenu);
  await outButton.click();
  await outList.waitFor();
  await outList.getByRole('button', { name: 'Take Card 2 back' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].text === JUST), '✖ Take back: the tile’s card stays');
  await closeMenu(outList);

  await mainButton(host).click();
  assert(await until(() => cards().length === 1 && cards()[0].open === false), 'Reveal: the card stays, marked “the answer’s on screen”');
  assert(await until(async () => !(await privateBadge.count())), 'and the stream stops saying who has a private question');
  await ann.locator('.card .card-shown').getByText('The answer’s on screen').waitFor();
  assert(true, 'Ann’s phone says “The answer’s on screen” on it');
  const doneLabel = await mainLabel(host);
  await mainButton(host).click();
  assert(await until(() => !cards().length), `the tile closed (${doneLabel}): its card goes`);
  assert(await until(async () => !(await cardsOn(ann))), 'Ann’s phone drops it');

  // ---------- 💡 Insider tip: a Daily Double's card to its player, before the wager ----------
  await host.locator('.stage-box .tile[aria-label^="Movies for $400"]').click();
  await tilePart.waitFor();
  tileRow = tilePart.locator('[data-tile-card="1"]');
  assert((await tileRow.getByRole('button', { name: 'Card 1 to Ann' }).getAttribute('aria-pressed')) === 'true', 'a Daily Double’s card starts with its player, Ann');
  await sleep(600);
  assert(!cards().length, 'opening it sends nothing');
  await tileRow.getByRole('button', { name: 'Send card 1' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].text === INSIDER && JSON.stringify(cards()[0].to) === to('Ann')), 'sent before the wager, to Ann only');
  await tapOpen(ann, INSIDER);
  assert(!heardOf('bob2', 'Insider-') && !heardOf('cat', 'Insider-'), 'only Ann gets it');
  assert(!(await host.locator('.stage-box [data-private-badge]').count()), 'a Daily Double’s badge already says who plays: no “private question” line');
  await host.locator('.panel .dd input[type=number]').fill('100');
  await mainButton(host).click();
  assert(await until(async () => last()?.wager?.open === false && (await mainLabel(host)) === '👁 Reveal answer' && cards().length === 1 && cards()[0].open), 'the question shows (wager $100, locked): the card stays');
  await offStream(host, 'the host page in one window', 'a Daily Double’s card sent');
  await mainButton(host).click();
  assert(await until(() => cards()[0]?.open === false), 'Reveal: “the answer’s on screen” on it');
  await host.keyboard.press('Escape');
  assert(await until(() => !cards().length), 'back to the board: the Daily Double’s card goes with the tile');
  assert(await until(async () => !(await cardsOn(ann))), 'Ann’s phone drops it');

  // ---------- A card until the round ends, to Cat: it goes with the round ----------
  await openSend();
  const options = await pick.locator('option').allInnerTexts();
  assert(
    JSON.stringify(options) === JSON.stringify(['Movies $200 · Card 1 · 1 line of words, 1 picture', 'Movies $400 · Card 1 · 1 line of words']),
    `one window: the cards of the tiles played (the Daily Double’s now it’s played), by tile and counted, never said, and none of a tile not played (${options.join(' | ')})`,
  );
  await pick.selectOption({ label: 'Movies $200 · Card 1 · 1 line of words, 1 picture' });
  await sendMenu.getByRole('button', { name: 'Cat', exact: true }).click();
  assert(await sendMenu.getByRole('radio', { name: 'until the round ends' }).isChecked(), 'it lasts until the round ends by default');
  await sendMenu.getByRole('button', { name: '📤 Send' }).click();
  await sendMenu.locator('[data-card-said]').getByText('Card 1 sent to Cat').waitFor();
  assert(await until(() => cards().length === 1 && JSON.stringify(cards()[0].to) === to('Cat')), 'to Cat’s seat only');
  await closeMenu(sendMenu);
  await tapOpen(cat, JUST);
  await nextRound();
  await host.locator('.rh').waitFor();
  assert(await until(() => !cards().length), 'the next round: the card goes');
  assert(await until(async () => !(await cardsOn(cat))), 'Cat’s phone drops it');
  await offStream(host, 'the host page in one window', 'the round over');

  // =====================================================================================================================
  // Round 2, an RPG round, in two windows: the audience window is what viewers see.
  // =====================================================================================================================
  console.log('An RPG round, in two windows:');
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.rpg').waitFor();
  /** The audience window never shows a card's words or file name, never gets a card window's message, nor typed words. */
  const audClean = async (when) => {
    await offStream(aud, 'the audience window', when);
    const leaks = await aud.evaluate(() => window.__leaks);
    assert(!leaks.length, `${when}: the audience window never got a card window’s message nor a typed card’s words${leaks.length ? ` (${leaks.join(' | ')})` : ''}`);
  };

  // ---------- 🤫 Send a card… to Cat: a quick card, typed ----------
  await openSend();
  assert((await sendMenu.getByRole('radio', { name: 'A quick card' }).isChecked()) && !(await sendMenu.locator('.exposed').count()), 'two windows: a quick card is the first choice, with no warning about viewers');
  await sendMenu.getByRole('textbox', { name: 'The card’s words' }).fill(QUICK);
  // A picture from this computer: it goes into the game's 🖼 Media, but never to the viewers' windows (nor its name).
  await sendMenu.locator('input[type=file]').setInputFiles({ name: QUICK_FILE, mimeType: 'image/png', buffer: png(90, 30, 160, 200, 120) });
  await sendMenu.locator('[aria-label="On the card"]').getByText('🖼 picture').waitFor();
  await sendMenu.getByRole('button', { name: 'Cat', exact: true }).click();
  await sleep(500);
  assert(!cards().length && !JSON.stringify(states).includes('Quick-') && !JSON.stringify(states).includes(QUICK_FILE), 'typing the card, adding its picture and choosing Cat sends nothing');
  const upQ = uploads;
  await sendMenu.getByRole('button', { name: '📤 Send' }).click();
  await sendMenu.locator('[data-card-said]').getByText('Card 1 sent to Cat').waitFor();
  assert(await until(() => cards().length === 1 && cards()[0].text === QUICK && JSON.stringify(cards()[0].to) === to('Cat')), 'sent: to Cat’s seat only, with its words');
  assert(await until(() => !!cards()[0]?.media?.[0]?.file && uploads === upQ + 1), 'its picture goes up with it');
  await sleep(500);
  const audGames = await aud.evaluate(() => window.__games);
  assert(audGames.length > 0 && audGames.every((names) => !names.some((n) => n.includes('zqxwv'))), `the audience window’s copy of the game never lists the quick card’s picture (${audGames.at(-1)?.join(', ')})`);
  let quick1 = cards()[0];
  await tapOpen(cat, QUICK);
  assert(!(await cardsOn(ann)) && !(await cardsOn(bob)) && !heardOf('ann', 'zqxwv') && !heardOf('bob2', 'zqxwv'), 'Ann’s and Bob’s phones get nothing of it');
  await closeMenu(sendMenu);
  await audClean('a quick card sent');

  // ---------- Cat gives up her seat and picks it again: that phone is new for the card ----------
  asking.add(cat);
  await cat.getByRole('button', { name: 'Not you? Change player' }).click();
  await cat.getByRole('heading', { name: 'Tap your name' }).waitFor();
  assert(!(await cardsOn(cat)), 'her phone lets go of the seat, and of the card');
  await cat.getByRole('button', { name: 'Cat', exact: true }).click();
  await cat.locator('#me').getByText('Cat').waitFor();
  await cat.locator('#cards-late').getByText(LATE).waitFor();
  assert(!(await cardsOn(cat)) && viewOf('cat').cards?.late === 1, 'back on Cat’s seat, it counts as late: no card, only the note');
  await outButton.click();
  await outList.waitFor();
  assert(await until(async () => (await rowText('Card 1')).includes('Cat’s new phone hasn’t got it')), `the list says so (${await rowText('Card 1')})`);
  await outList.getByRole('button', { name: 'Send Card 1 again' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].id !== quick1.id), '↻ Send again: under a new id');
  quick1 = cards()[0];
  await tapOpen(cat, QUICK);
  assert(true, 'and Cat’s phone gets it');
  await closeMenu(outList);

  // ---------- An object's 🤫 button only offers its card: 📤 Send sends it ----------
  await host.locator('.rpg .hit[data-object="el_spy"]').click();
  const objCard = host.getByRole('dialog', { name: 'Object: Spy master' });
  await objCard.waitFor();
  await objCard.locator('.who').getByRole('button', { name: 'Bob', exact: true }).click();
  const n0 = states.length;
  const up0 = uploads;
  await objCard.getByRole('button', { name: '🤫 Card for whoever set it off' }).click();
  const offer = host.locator('.panel [data-card-offer]');
  await offer.waitFor();
  const chip = (o, name) => o.getByRole('button', { name: new RegExp(`^${name}( \\(no phone here\\))?$`) });
  assert((await chip(offer, 'Bob').getAttribute('aria-pressed')) === 'true' && (await chip(offer, 'Ann').getAttribute('aria-pressed')) === 'false', 'the offer starts with whoever set it off (Bob)');
  assert((await offer.locator('[data-offer-card]').innerText()).includes('1 line of words, 1 picture'), 'it counts what’s on the card');
  await sleep(1000);
  assert(cards().length === 1 && !JSON.stringify(states.slice(n0)).includes('Mission-') && !heardOf('bob2', 'Mission-') && uploads === up0, 'pressing the button sent nothing: no card in the room, no file uploaded');
  await offer.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 2), 'confirmed with 📤 Send: the room holds it');
  const mission = cards()[1];
  assert(JSON.stringify(mission.to) === to('Bob') && mission.text === MISSION, 'to Bob’s seat only');
  assert(await until(() => !!cards()[1]?.media?.[0]?.file && uploads === up0 + 1), 'its picture goes up then, once');
  await tapOpen(bob, MISSION);
  assert(!heardOf('ann', 'Mission-') && !heardOf('cat', 'Mission-'), 'nobody else gets it');
  const missionPic = cards()[1].media[0].file;
  assert((await fetchAs(bob, missionPic)) === 200 && (await fetchAs(ann, missionPic)) === 404 && (await fetchAs(cat, missionPic)) === 404, 'only Bob’s phone can fetch its picture from the room');
  assert(await until(async () => !(await offer.count())), 'the offer goes once sent');
  await host.keyboard.press('Escape');

  // ---------- A wheel slice's 🤫 button: Skip sends nothing; 📤 Send sends it ----------
  await tools.getByRole('button', { name: '🎡 Wheel' }).click();
  await host.getByRole('button', { name: 'Whisper wheel', exact: true }).click();
  await host.locator('.panel [data-next]', { hasText: 'Spin!' }).click();
  const tc = host.locator('[data-tool-controls]');
  await tc.getByText('This was for').waitFor({ timeout: 20000 });
  await tc.getByRole('button', { name: 'Ann', exact: true }).click();
  const slice = tc.getByRole('button', { name: '🤫 Card for whoever set it off' });
  await slice.click();
  await offer.waitFor();
  assert((await chip(offer, 'Ann').getAttribute('aria-pressed')) === 'true' && (await chip(offer, 'Bob').getAttribute('aria-pressed')) === 'false', 'the slice’s offer starts with the player the spin was for (Ann)');
  await offer.getByRole('button', { name: 'Skip' }).click();
  await sleep(1000);
  assert(!(await offer.count()) && cards().length === 2 && !JSON.stringify(states).includes('Whisper-'), 'Skip: the offer goes, and nothing is sent');
  await slice.click();
  await offer.waitFor();
  // (The offer and the tools row's dialog are two copies of the same form, on screen at once: each keeps its own choice.)
  await openSend();
  await sendMenu.getByRole('radio', { name: 'until I take it back' }).check();
  assert(
    (await offer.getByRole('radio', { name: 'until the round ends' }).isChecked()) && (await sendMenu.getByRole('radio', { name: 'until I take it back' }).isChecked()),
    'the offer and 🤫 Send a card… each keep their own “Lasts” choice',
  );
  await closeMenu(sendMenu);
  await chip(offer, 'Dan').click();
  assert((await offer.innerText()).includes('Dan has no phone here'), 'Dan added: the offer says he has no phone here');
  await sleep(600);
  assert(cards().length === 2 && !JSON.stringify(states).includes('Whisper-'), 'pressed again, and Dan added: still nothing sent');
  await offer.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 3), 'confirmed with 📤 Send: three cards out');
  assert(JSON.stringify(cards()[2].to) === to('Ann', 'Dan') && cards()[2].text === WHISPER, 'to Ann’s and Dan’s seats');
  await tapOpen(ann, WHISPER);
  assert(!heardOf('bob2', 'Whisper-') && !heardOf('cat', 'Whisper-'), 'Bob and Cat get nothing of it');
  await host.keyboard.press('Escape');
  await audClean('cards from actions sent');

  // ---------- 🪟 The card window for Dan (no phone): his card only ----------
  await openSend();
  const [win] = await Promise.all([host.waitForEvent('popup'), sendMenu.getByRole('button', { name: 'Card window for Dan' }).click()]);
  watch(win, 'card window');
  await win.getByText('For Dan only').waitFor();
  await win.getByText(WHISPER).waitFor();
  assert(!(await win.getByText(QUICK).count()) && !(await win.getByText(MISSION).count()), 'the card window shows Dan’s card, not Cat’s nor Bob’s');
  assert((await tools.locator('[data-card-window-warn]').innerText()).includes('share only the game window with viewers'), 'a ⚠ line: share only the game window with viewers');
  // Switched to Cat: hers only.
  await tools.getByRole('button', { name: /🪟 Cards: Dan/ }).click();
  await host.getByRole('dialog', { name: 'Card window' }).getByRole('button', { name: 'Card window for Cat' }).click();
  await win.getByText('For Cat only').waitFor();
  await win.getByText(QUICK).waitFor();
  assert(!(await win.getByText(WHISPER).count()) && !(await win.getByText(MISSION).count()), 'switched to Cat: her card only');
  await tools.getByRole('button', { name: /🪟 Cards: Cat/ }).click();
  await host.getByRole('dialog', { name: 'Card window' }).getByRole('button', { name: 'Card window for Dan' }).click();
  await win.getByText('For Dan only').waitFor();
  await win.getByText(WHISPER).waitFor();
  const audMsgs = await aud.evaluate(() => window.__msgs);
  assert(audMsgs.includes('session') && !audMsgs.some((t) => t.startsWith('private-')), `the audience window gets the game’s state and never a card window message (${[...new Set(audMsgs)].join(', ')})`);
  const winMsgs = await win.evaluate(() => window.__msgs);
  assert(winMsgs.length > 0 && winMsgs.every((t) => t.startsWith('private-')), `the card window gets only its own messages (${[...new Set(winMsgs)].join(', ')})`);
  await audClean('the card window open');

  // =====================================================================================================================
  // Round 3, a board-game round: two windows, then one after Exit › Keep & leave and Resume.
  // =====================================================================================================================
  console.log('A board-game round, in two windows, then Keep & leave, Resume and a host reload in one window:');
  await nextRound();
  await host.locator('.bh').waitFor();
  assert(await until(() => !cards().length), 'the next round: the RPG round’s cards go');
  await win.getByText('Nothing private right now').waitFor();
  assert(await until(async () => !(await cardsOn(ann)) && !(await cardsOn(bob)) && !(await cardsOn(cat))), 'from the phones and the card window too');

  // ---------- 🤫 Send a card… to Dan, who has no phone: it shows in his card window ----------
  await openSend();
  await sendMenu.getByRole('textbox', { name: 'The card’s words' }).fill(FOR_DAN);
  await chip(sendMenu, 'Dan').click();
  assert((await sendMenu.innerText()).includes('Dan has no phone here'), 'it says Dan has no phone here (copy it, or the card window)');
  await sendMenu.getByRole('radio', { name: 'until I take it back' }).check();
  await sendMenu.getByRole('button', { name: '📤 Send' }).click();
  await sendMenu.locator('[data-card-said]').getByText('Card 1 sent to Dan').waitFor();
  assert(await until(() => cards().length === 1 && JSON.stringify(cards()[0].to) === to('Dan') && cards()[0].text === FOR_DAN), 'sent: to Dan’s seat only');
  const forDan = cards()[0];
  await closeMenu(sendMenu);
  await win.getByText(FOR_DAN).waitFor();
  assert(true, 'his card window shows it');
  assert(!heardOf('ann', 'Dan-') && !heardOf('bob2', 'Dan-') && !heardOf('cat', 'Dan-'), 'no phone gets it');
  await audClean('a card for a player with no phone sent');

  // ---------- Exit › Keep & leave; Dan's phone joins while the host is in the editor; Resume: it came late ----------
  await aud.close();
  await host.getByRole('button', { name: 'Exit' }).click();
  await sleep(500);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  await host.locator('.status-bar .room-bar').getByText(code).waitFor();
  assert(await until(() => win.isClosed()), 'leaving the game (Keep & leave) closes the card window');
  const SETTING_UP = 'The host is setting up — hang on';
  assert(
    await until(() => last()?.status?.text === SETTING_UP && cards().length === 1 && cards()[0].id === forDan.id),
    'the phones are told the host is setting up, and the card stays out under its id (the room keeps when it saw it)',
  );
  // A reload in the editor: the room left open gets the same again.
  const n3 = states.length;
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).waitFor();
  assert(
    await until(() => states.length > n3 && last()?.status?.text === SETTING_UP && cards().length === 1 && cards()[0].id === forDan.id),
    'a reload in the editor: the room’s setting-up state still holds the card, under the same id',
  );
  const dan = await join('dan', 'Dan');
  assert(!(await cardsOn(dan)) && !heardOf('dan', 'zqxwv'), 'Dan’s phone joins while the host is in the editor: nothing of the card');
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.bh').waitFor();
  assert(await until(() => cards().length === 1 && cards()[0].id === forDan.id), 'Resume game: Dan’s card is out again, under the same id');
  await dan.locator('#cards-late').getByText(LATE).waitFor();
  assert(!(await cardsOn(dan)) && !heardOf('dan', 'zqxwv') && viewOf('dan').cards?.late === 1, 'Dan’s phone, seated after the card went to his seat, gets nothing of it, only the note');

  // ---------- 🪟 The card window again, for Dan; one window from here ----------
  await openSend();
  const [win2] = await Promise.all([host.waitForEvent('popup'), sendMenu.getByRole('button', { name: 'Card window for Dan' }).click()]);
  watch(win2, 'card window 2');
  await win2.getByText(FOR_DAN).waitFor();
  assert((await win2.getByText('For Dan only').count()) === 1, 'the card window for Dan shows his card');
  await closeMenu(sendMenu);
  await offStream(host, 'the host page in one window', 'resumed with a card out');

  // ---------- A board space's 🤫 button only offers its card (in one window: who, and counted) ----------
  await host.keyboard.press('1');
  await host.locator('.stage [data-space="b1"]').click();
  const spaceCard = host.getByRole('dialog', { name: 'Space: Mission' });
  await spaceCard.waitFor();
  assert((await spaceCard.innerText()).includes('Landing on it (Ann)'), 'the space’s card is for the selected player, Ann');
  const n1 = states.length;
  await spaceCard.getByRole('button', { name: '🤫 Card for whoever landed there' }).click();
  await offer.waitFor();
  assert((await chip(offer, 'Ann').getAttribute('aria-pressed')) === 'true' && (await chip(offer, 'Dan').getAttribute('aria-pressed')) === 'false', 'the offer starts with whoever landed (Ann)');
  assert((await offer.locator('.exposed').innerText()).includes('never what’s on it'), 'one window: the offer says viewers see who gets the card, never what’s on it');
  await offStream(host, 'the host page in one window', 'a board space’s card offered');
  await sleep(1000);
  assert(cards().length === 1 && !JSON.stringify(states.slice(n1)).includes('Secret-') && !heardOf('ann', 'Secret-'), 'pressing the button sent nothing');
  await offer.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 2 && cards()[1].text === SECRET && JSON.stringify(cards()[1].to) === to('Ann')), 'confirmed with 📤 Send: to Ann’s seat only');
  const secret = cards()[1];
  await tapOpen(ann, SECRET);
  assert(!heardOf('bob2', 'Secret-') && !heardOf('cat', 'Secret-') && !heardOf('dan', 'Secret-'), 'nobody else gets it');
  assert(!(await win2.getByText(SECRET).count()), 'nor Dan’s card window');
  // Pressed again and left waiting: an offer is on this computer only, and never sent by itself.
  await spaceCard.getByRole('button', { name: '🤫 Card for whoever landed there' }).click();
  await offer.waitFor();
  await host.keyboard.press('Escape');
  await offStream(host, 'the host page in one window', 'a board space’s card sent');

  // ---------- The host reloads: the cards out stay out, under the same ids ----------
  const n2 = states.length;
  await host.reload();
  await host.getByRole('button', { name: 'Resume game' }).click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await host.locator('.play .panel').waitFor();
  await host.locator('.bh').waitFor();
  assert(await until(() => states.length > n2 && cards().length === 2), 'reloaded: the host is back in the room, with both cards');
  assert(
    states.slice(n2).every((s) => JSON.stringify((s.cards ?? []).map((c) => c.id)) === JSON.stringify([forDan.id, secret.id])),
    'every state since the reload holds both cards under the same ids (nothing is sent again)',
  );
  assert(!(await offer.count()), 'the offer left waiting is gone, and was never sent');
  assert((await ann.getByText(SECRET).isVisible()) && !(await cardsOn(dan)) && viewOf('dan').cards?.late === 1, 'Ann’s phone keeps her card through the reload; Dan’s phone is still late');
  await win2.getByText('The host’s page closed').waitFor();
  assert(!(await win2.getByText(FOR_DAN).count()), 'the card window let go of the card when the host’s page went');
  assert((await outButton.innerText()).trim() === '🤫 2 cards out', 'one window: the tools row counts the cards out');

  // 🪟 again: the card window comes back (found again, not a new window), with Dan's card.
  let popups = 0;
  host.on('popup', () => popups++);
  await openSend();
  await sendMenu.getByRole('button', { name: 'Card window for Dan' }).click();
  await win2.getByText(FOR_DAN).waitFor();
  assert((await win2.getByText('For Dan only').count()) === 1 && !(await win2.getByText(SECRET).count()), '🪟 again: the card window shows Dan’s card again, and only his');
  await sleep(500);
  assert(popups === 0 && ctx.pages().length === 2, 'in the same window (no second one opens)');
  await closeMenu(sendMenu);

  // ---------- The list of cards out in one window; ↻ Send again reaches Dan's phone; ✖ Take back ----------
  await outButton.click();
  await outList.waitFor();
  assert((await rowText('Card 1')).includes('Card 1 → Dan') && (await rowText('Card 2')).includes('Card 2 → Ann'), 'the list keeps its labels through the reload');
  assert(await until(async () => (await rowText('Card 1')).includes('Dan’s new phone hasn’t got it')), `and says Dan’s phone came late (${await rowText('Card 1')})`);
  await offStream(host, 'the host page in one window', 'the list of cards out, after the reload');
  await outList.getByRole('button', { name: 'Send Card 1 again' }).click();
  assert(
    await until(() => cards().length === 2 && cards()[0].id === secret.id && cards()[1].text === FOR_DAN && cards()[1].id !== forDan.id),
    '↻ Send again: Dan’s card under a new id (the newest now), Ann’s keeps hers',
  );
  await tapOpen(dan, FOR_DAN);
  assert(!(await dan.locator('#cards-late').isVisible()), 'Dan’s phone gets it now, and the note goes');
  assert(await win2.getByText(FOR_DAN).isVisible(), 'the card window still shows it');
  await outList.getByRole('button', { name: 'Take Card 2 back' }).click();
  assert(await until(() => cards().length === 1 && cards()[0].text === FOR_DAN), '✖ Take back Card 2: Ann’s card goes');
  assert(await until(async () => !(await cardsOn(ann))), 'Ann’s phone drops it');
  await outList.getByRole('button', { name: 'Take Card 1 back' }).click();
  assert(await until(() => !cards().length), '✖ Take back Card 1: no card out');
  await win2.getByText('Nothing private right now').waitFor();
  assert(await until(async () => !(await cardsOn(dan))), 'Dan’s phone and his card window drop it');
  await closeMenu(outList);
  await offStream(host, 'the host page in one window', 'all cards taken back');

  // ---------- Exit › Keep & leave with a card out, then the kept game discarded: its card goes from the phone ----------
  // (One window: a card made in the editor, which stays off stream.)
  await openSend();
  await pick.selectOption({ label: 'Movies $200 · Card 1 · 1 line of words, 1 picture' });
  await chip(sendMenu, 'Dan').click();
  await sendMenu.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 1 && JSON.stringify(cards()[0].to) === to('Dan') && !!cards()[0].media?.[0]?.file), 'a tile’s card, with its picture, to Dan');
  const lastCard = cards()[0];
  await closeMenu(sendMenu);
  await tapOpen(dan, JUST);
  assert(await until(() => dan.locator('.card img').evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false)), 'his phone shows it, picture and all');
  await host.getByRole('button', { name: 'Exit' }).click();
  await sleep(500);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  assert(await until(() => last()?.status?.text === SETTING_UP && cards()[0]?.id === lastCard.id), 'Keep & leave: the card stays out, under its id');
  await sleep(1000);
  assert((await dan.getByText(JUST).isVisible()) && !(await dan.getByRole('button', { name: 'Tap to see' }).count()), 'Dan’s phone keeps it open as it was (no new card)');
  await host.locator('.status-bar .kept').getByRole('button', { name: 'Discard', exact: true }).click();
  await host.getByRole('alertdialog').getByRole('button', { name: 'Discard', exact: true }).click();
  assert(await until(() => last()?.status?.text === SETTING_UP && !cards().length), 'the kept game discarded: the room (still open) holds no card');
  assert(await until(async () => !(await cardsOn(dan))), 'Dan’s phone drops it');
  // (Stored as a plain copy: a reload doesn't send the discarded game's card again, and autosave keeps working.)
  assert(await until(async () => { const r = await stored(host, 'playSession:room'); return !!r && !r.cards; }), 'the room is saved without the discarded game’s cards');
  assert(await host.locator('.editor > header').getByText('✓ Autosaved').isVisible(), 'autosave still works');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Card rounds tests passed');
} finally {
  await browser?.close();
  buzzer.stop();
}
