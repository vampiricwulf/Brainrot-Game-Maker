// 🕵 Odd one out (Spyfall), end to end in one window (docs/PARTNER-CLUES-SPEC.md §11, §14.2, §14.4, §15, milestone P4):
// the built app hosts a game against the real buzzer room (buzzer/ under `wrangler dev`, local). The editor's
// 📋 Ready-made deal… adds Odd one out with its 🗺 Locations wheel. In play, one window (the host page is what viewers
// see), six players: Ann, Bob, Cat and Dan dealt in with their phones, Eve dealt in with no phone yet, and Fay not dealt
// in (her phone is in the room), plus a phone that never takes a seat. 🎭 Deal: nothing reaches the room, also through
// a host reload; dealing again (another spy) changes nothing on the host page. 📤 Send: each dealt-in phone gets its
// own card only (the spy's words, or the location the others share); Fay and the unseated phone get nothing; Eve's phone,
// joining after the send, gets nothing but a note that she missed one, and the panel names her phone (never her part);
// ↻ Send again reaches her. 🎭 Who was who goes on the stage only when pressed: Ctrl+Z, Ctrl+Y, and a host reload keep it
// as it was. "Deal a new one?" asks while cards are out. The next round takes the cards back. The host page never says
// who got which part, nor shows a card's words or the location, until Who was who. The audience window, opened at the
// end with Who was who up, shows it, and puts who got which in the host's column; closing it takes that away again.
// Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmStrip, openGameFile, recordSeen, startBuzzer, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** Waits (up to `ms`) until pred() holds. */
const until = async (pred, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await pred()) return true;
  return !!(await pred());
};

// ---------- The game: two short rounds, six players, no deal or wheel yet ----------

let ids = 0;
const text = (t) => ({ id: `e${ids++}`, x: 100, y: 40, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1, kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...elements) => ({ background: {}, elements });
const plain = (id) => ({ id, value: null, type: 'standard', questionSlide: slide(text('A question')), answerSlide: slide(text('An answer')) });
const NAMES = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay'];
const game = {
  id: 'g_spyfall',
  version: 2,
  title: 'Spyfall night',
  settings: {
    allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
  },
  players: NAMES.map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0'][i] })),
  rounds: ['r1', 'r2'].map((id, n) => ({ id, name: `Round ${n + 1}`, mode: 'board', values: [200, 400], dailyDoubleCount: 0, categories: [{ id: `c${n}`, title: 'Movies', clues: [plain(`${id}a`), plain(`${id}b`)] }] })),
  media: [], audio: {}, wheels: [], dice: [], theme: {},
};
const gameFile = resolve('test-results/spyfall.json');
writeFileSync(gameFile, JSON.stringify(game));

// The ready-made deal's words, and the ready-made wheel's places (src/lib/deals.ts, src/lib/wheeltemplates.ts).
const SPY_WORDS = 'Work out the location';
const LOCATIONS = ['Beach', 'Airplane', 'Hospital', 'School', 'Casino', 'Movie theater', 'Space station', 'Submarine', 'Restaurant', 'Pirate ship', 'Zoo', 'Bank', 'Circus', 'Supermarket', 'Hotel', 'Train'];

const ATTRS = ['aria-label', 'title', 'alt', 'aria-description', 'placeholder', 'data-said', 'value'];

/**
 * Where the host page says (or said, since recordSeen last started) who got which part: a string it showed or said, an
 * attribute, or a line on screen naming a dealt player with their part. A line naming every dealt player (the scores)
 * says nothing of who. Who was who on the stage is left out (`skip`).
 */
function whoGotWhich({ hands, ATTRS, skip }) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = (w) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}($|[^\\p{L}\\p{N}])`, 'u');
  const pairs = hands.map((h) => [word(h.name), word(h.part), `${h.name} → ${h.part}`]);
  const names = hands.map((h) => word(h.name));
  const says = (s) => (names.every((n) => n.test(s)) ? [] : pairs.filter(([n, p]) => n.test(s) && p.test(s)).map((x) => x[2]));
  const out = [];
  for (const s of window.__seen ?? []) for (const x of says(s)) out.push(`said “${s.slice(0, 100)}” (${x})`);
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('style, script, noscript, template') || (skip && el.closest(skip))) continue;
    for (const a of ATTRS) {
      const v = a === 'value' && 'value' in el ? String(el.value ?? '') : el.getAttribute(a);
      if (v) for (const x of says(v)) out.push(`${a}=“${v.slice(0, 100)}” (${x})`);
    }
  }
  // (Each line as laid out: a name and a part in one row, a table's cells included, are on one line.)
  const hide = skip ? [...document.querySelectorAll(skip)] : [];
  const was = hide.map((e) => e.style.display);
  for (const e of hide) e.style.display = 'none';
  try {
    for (const line of document.body.innerText.split('\n')) for (const x of says(line)) out.push(`line “${line.slice(0, 120)}” (${x})`);
  } finally {
    hide.forEach((e, i) => (e.style.display = was[i]));
  }
  return out;
}

/** Which of `words` the host page shows or showed (whole words, as written), leaving out Who was who. */
function wordsShown({ words, ATTRS, skip }) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [
    ...(window.__seen ?? []),
    ...[...document.body.querySelectorAll('*')]
      .filter((e) => !e.closest('style, script, noscript, template') && !(skip && e.closest(skip)))
      .flatMap((e) => [...[...e.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.data), ...ATTRS.map((a) => (a === 'value' && 'value' in e ? String(e.value ?? '') : (e.getAttribute(a) ?? '')))]),
  ].join('\n');
  return words.filter((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}($|[^\\p{L}\\p{N}])`, 'u').test(all));
}

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-spyfall-');
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
  host.setDefaultTimeout(20000);
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
  await openGameFile(host, gameFile);
  await host.getByText(/^Opened “/).waitFor();

  // ---------- The editor: 📋 Ready-made deal… → 🕵 Odd one out, with its 🗺 Locations wheel ----------
  console.log('Editor:');
  await host.getByRole('button', { name: /Wheels & Dice/ }).click();
  await host.getByRole('button', { name: '📋 Ready-made deal…' }).click();
  await host.getByRole('menuitem', { name: /Odd one out/ }).click();
  const deals = host.getByRole('list', { name: 'Deals' });
  const wheels = host.getByRole('list', { name: 'Wheels' });
  assert(await until(async () => (await deals.getByRole('button', { name: 'Odd one out' }).count()) === 1), 'the ready-made deal goes in: Odd one out');
  assert((await wheels.getByRole('button', { name: 'Locations' }).count()) === 1, 'with the 🗺 Locations wheel, as the game had none like it');
  const editor = host.locator('[data-deal-editor]');
  assert(
    (await editor.getByLabel('Villager’s card draws from the wheel').inputValue()) === 'shared' && (await editor.getByLabel('How many get Spy').inputValue()) === '1',
    'one Spy, and the Villagers share a slice of the wheel',
  );
  assert((await editor.getByRole('combobox', { name: /Wheel its cards draw from/ }).locator('option:checked').innerText()) === 'Locations', 'drawn from Locations');

  // ---------- The room: Ann, Bob, Cat, Dan and Fay take their seats; a sixth phone never does ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  await roomCard.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = roomCard.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  const heard = {};
  const phones = {};
  const open = async (label) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), label);
    p.setDefaultTimeout(20000);
    heard[label] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[label].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    return p;
  };
  const join = async (name) => {
    const p = await open(name);
    await p.getByRole('button', { name, exact: true }).click();
    await p.locator('#me').getByText(name).waitFor();
    phones[name] = p;
    return p;
  };
  for (const name of ['Ann', 'Bob', 'Cat', 'Dan', 'Fay']) await join(name);
  const watcher = await open('watcher');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const nameOf = Object.fromEntries(Object.entries(seat).map(([n, id]) => [id, n]));
  const cardsOn = (p) => p.locator('.card').count();
  const hadWords = (label, w) => heard[label].join('\n').includes(w);

  // ---------- One window: the host page is what viewers see ----------
  // (The editor showed the wheel's places: from here on, what the host page shows is what's on stream.)
  await host.evaluate(() => (window.__seen.length = 0));
  const reveal = host.locator('.stage-box [data-who-was-who]');
  /** The deal autosave holds for the game in progress (who got which: the test's own look, never on screen). */
  const savedDeal = async () => (await stored(host))?.session?.deal ?? null;
  const handsOf = (d) => d.hands.map((h) => ({ name: nameOf[h.to.seat], part: h.part, slice: h.slice }));
  let hands = [];
  /** Nothing on the host page says who got which, nor shows the spy's words or a place (Who was who aside). */
  const secret = async (when) => {
    const told = await host.evaluate(whoGotWhich, { hands, ATTRS, skip: '[data-who-was-who]' });
    assert(!told.length, `${when}: the host page never says who got which part${told.length ? ` (${told.join(' | ')})` : ''}`);
    const shown = await host.evaluate(wordsShown, { words: [SPY_WORDS, ...LOCATIONS], ATTRS, skip: '[data-who-was-who]' });
    assert(!shown.length, `${when}: nor the spy’s words or any place${shown.length ? ` (found ${shown.join(', ')})` : ''}`);
  };
  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const tools = host.locator('.panel .toolsrow');
  const dialog = host.getByRole('dialog', { name: 'Deal' });
  const openDeal = async () => {
    if (!(await dialog.count())) await tools.getByRole('button', { name: '🎭 Deal…' }).click();
    await dialog.waitFor();
    return dialog;
  };
  /** Everything the deal's window, the tools row and the stage say, as text and labels (to compare two deals). */
  const snapshot = () =>
    host.evaluate((ATTRS) => {
      const parts = [];
      for (const root of document.querySelectorAll('[role="dialog"][aria-label="Deal"], .panel .toolsrow, .stage-box'))
        for (const el of [root, ...root.querySelectorAll('*')]) {
          for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.data.trim()) parts.push(n.data.trim());
          for (const a of ATTRS) if (el.getAttribute(a)) parts.push(`${a}=${el.getAttribute(a)}`);
        }
      return parts.join('\n');
    }, ATTRS);

  // ---------- 🎭 Deal… in one window: the setup counts, never says ----------
  console.log('Dealing in one window:');
  await openDeal();
  assert((await dialog.locator('.exposed').count()) === 1, 'one window: the deal’s window warns that viewers see it');
  assert((await dialog.getByRole('combobox', { name: 'The deal' }).locator('option:checked').innerText()).includes('Odd one out'), 'it starts with the game’s saved deal');
  assert(
    !(await dialog.locator('summary').count()) && !(await dialog.getByLabel('Spy’s card words').count()) && (await flat(dialog.locator('[data-deal-part="1"]'))).includes('Card: 1 line of words'),
    'no choosing who gets a part, and a part’s card is only counted',
  );
  assert((await dialog.getByRole('combobox', { name: 'The wheel its cards draw from' }).locator('option:checked').innerText()) === 'Locations', 'the Villagers draw from the game’s Locations');
  await dialog.getByRole('button', { name: 'Deal Fay in' }).click();
  assert((await dialog.getByRole('button', { name: 'Deal Fay in' }).getAttribute('aria-pressed')) === 'false', 'Fay is left out of the deal');
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-counts]').waitFor();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 5: Spy ×1, Villager ×4', 'dealt: “Dealt to 5: Spy ×1, Villager ×4”');
  let d = null;
  assert(await until(async () => (d = await savedDeal())?.stage === 'dealt'), 'the deal is kept with the game in progress');
  hands = handsOf(d);
  const spy1 = hands.find((h) => h.part === 'Spy').name;
  assert(hands.length === 5 && !hands.some((h) => h.name === 'Fay') && new Set(hands.filter((h) => h.part === 'Villager').map((h) => h.slice)).size === 1, `the test sees the spy is ${spy1}, and the Villagers share one place`);
  const first = await snapshot();
  await secret('dealt');

  // ↻ Deal again until someone else is the spy: the host page reads the same, word for word.
  let tries = 0;
  for (; tries < 25; tries++) {
    const before = d.id;
    await dialog.getByRole('button', { name: '↻ Deal again' }).click();
    assert(await until(async () => (d = await savedDeal())?.id !== before, 10000), `↻ Deal again deals it afresh (${tries + 1})`);
    if (handsOf(d).find((h) => h.part === 'Spy').name !== spy1) break;
  }
  hands = handsOf(d);
  const spy = hands.find((h) => h.part === 'Spy').name;
  const place = hands.find((h) => h.part === 'Villager').slice;
  assert(spy !== spy1, `another spy now (${spy}, after ${tries + 1})`);
  const second = await snapshot();
  assert(second === first, `the deal’s window, the tools row and the stage read the same whoever is the spy${second === first ? '' : `:\n${first}\n---\n${second}`}`);
  await secret('dealt again');
  await sleep(500);
  assert(!states.some((s) => s.cards?.length) && !JSON.stringify(states).includes(place) && !JSON.stringify(states).includes(SPY_WORDS), 'dealt, not sent: nothing of it reaches the room');

  // ---------- A host reload before 📤 Send sends nothing ----------
  const resume = async () => {
    await host.reload();
    await host.getByRole('button', { name: 'Resume game' }).click();
    await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
    await host.locator('.play .panel').waitFor();
  };
  let n = states.length;
  await resume();
  assert(await until(() => states.length > n), 'reloaded: the host is back in the room');
  await sleep(800);
  assert(states.slice(n).every((s) => !s.cards?.length), 'and tells it of no card');
  await openDeal();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 5: Spy ×1, Villager ×4' && (await dialog.getByText('Not sent yet: nobody has their card.').count()) === 1, 'the deal is still on the table, not sent');
  assert((await savedDeal()).id === d.id, 'the same deal (the same spy)');
  for (const name of ['Ann', 'Bob', 'Cat', 'Dan', 'Fay']) assert(!(await cardsOn(phones[name])) && !hadWords(name, place) && !hadWords(name, SPY_WORDS), `${name}’s phone: nothing yet`);
  await secret('reloaded, dealt');

  // ---------- 📤 Send: each dealt-in phone gets its own card ----------
  console.log('Sending:');
  await dialog.locator('[data-deal-send]').click();
  assert(await until(() => cards().length === 5), 'sent: the room holds five cards, one per player dealt in (Eve’s too, with no phone yet)');
  const sent = cards();
  assert(new Set(sent.map((c) => c.id)).size === 5 && sent.every((c) => c.to.length === 1 && !c.to[0].member && !c.shared), 'each under its own id, to one seat, never marked shared');
  assert(!sent.some((c) => c.to[0].seat === seat.Fay), 'none for Fay, who isn’t dealt in');
  for (const c of sent) {
    const who = nameOf[c.to[0].seat];
    const mine = hands.find((h) => h.name === who);
    assert(
      c.title === `You’re the ${mine.part}` && !c.role && (mine.part === 'Spy' ? c.text.includes(SPY_WORDS) && !JSON.stringify(c).includes(place) : c.text === `The location:\n${place}`),
      `${who}’s card: “You’re the ${mine.part}”, then the ${mine.part === 'Spy' ? 'spy’s words, with no place' : `place (${place})`}`,
    );
  }
  for (const name of ['Ann', 'Bob', 'Cat', 'Dan']) {
    const p = phones[name];
    const mine = hands.find((h) => h.name === name);
    const cover = p.getByRole('button', { name: 'Tap to see' });
    await cover.waitFor();
    // (The part is the secret here: a neighbour glancing at the phone mustn't read it off the card's cover.)
    const covered = (await p.locator('.card').innerText()).replace(/\s+/g, ' ');
    assert(!/\b(Spy|Villager)\b/.test(covered) && !covered.includes(place) && !covered.includes(SPY_WORDS), `${name}’s phone: behind Tap to see, nothing of the card, their part included (“${covered}”)`);
    await cover.tap();
    await p.locator('.card-words', { hasText: mine.part === 'Spy' ? SPY_WORDS : place }).waitFor();
    await p.locator('.card-title').getByText(`You’re the ${mine.part}`, { exact: true }).waitFor();
    assert((await cardsOn(p)) === 1, `${name}’s phone: one card, “You’re the ${mine.part}”`);
    assert(mine.part === 'Spy' ? !hadWords(name, place) : !hadWords(name, SPY_WORDS), `${name}’s phone never heard the ${mine.part === 'Spy' ? 'place' : 'spy’s words'}`);
  }
  assert(!(await cardsOn(phones.Fay)) && !hadWords('Fay', place) && !hadWords('Fay', SPY_WORDS) && !(await phones.Fay.locator('#cards-late').isVisible()), 'Fay’s phone (not dealt in): no card, nothing of one, no note');
  assert((await watcher.getByRole('heading', { name: 'Tap your name' }).isVisible()) && !hadWords('watcher', place) && !hadWords('watcher', SPY_WORDS), 'the phone with no seat: nothing of any card');
  assert(await until(async () => /✓ seen by 4 of 5/.test(await flat(dialog.locator('[data-deal-status]')))), 'the panel counts who saw theirs: ✓ seen by 4 of 5');
  await secret('sent');

  // ---------- Eve's phone joins after the send: no card, only a note; the panel names her phone ----------
  console.log('A late phone:');
  const eve = await join('Eve');
  const lateLine = 'A card went to your seat before this phone joined. Ask the host to send it again.';
  await eve.locator('#cards-late').getByText(lateLine).waitFor();
  assert(!(await cardsOn(eve)) && !hadWords('Eve', place) && !hadWords('Eve', SPY_WORDS), 'Eve’s phone, seated after the send: no card and nothing of it, only a note that it missed one');
  const lateStatus = 'Eve’s new phone hasn’t got theirs: ↻ Send again';
  assert(await until(async () => (await flat(dialog.locator('[data-deal-status]'))).includes(lateStatus)), `the panel says “${lateStatus}” (her phone, never her part)`);
  await secret('a late phone');

  // ---------- ↻ Send again: every card under a new id; Eve's phone gets hers ----------
  await dialog.getByRole('button', { name: '↻ Send again' }).click();
  assert(await until(() => cards().length === 5 && cards().every((c) => !sent.some((x) => x.id === c.id))), '↻ Send again: all five under new ids');
  const again = cards().map((c) => c.id);
  const eves = hands.find((h) => h.name === 'Eve');
  await eve.getByRole('button', { name: 'Tap to see' }).tap();
  await eve.locator('.card-words', { hasText: eves.part === 'Spy' ? SPY_WORDS : place }).waitFor();
  assert(!(await eve.locator('#cards-late').isVisible()) && (eves.part === 'Spy' ? !hadWords('Eve', place) : !hadWords('Eve', SPY_WORDS)), `Eve’s phone gets hers (the ${eves.part}’s), and only hers`);
  assert(await until(async () => !(await flat(dialog.locator('[data-deal-status]'))).includes('hasn’t got')), 'the late note goes from the panel');
  assert(!(await cardsOn(phones.Fay)) && !hadWords('Fay', place) && !hadWords('Fay', SPY_WORDS), 'Fay still has nothing');
  await secret('sent again');

  // ---------- 🎭 Who was who: on the stage only when pressed; Ctrl+Z, Ctrl+Y ----------
  console.log('Who was who:');
  assert(!(await reveal.count()), 'Who was who isn’t on the stage before the host shows it');
  await dialog.locator('[data-deal-reveal]').click();
  await reveal.waitFor();
  const shown = await flat(reveal);
  assert(hands.every((h) => shown.includes(h.part === 'Spy' ? `${h.name} Spy` : `${h.name} Villager · ${place}`)) && !shown.includes('Fay'), `on the stage: names, parts and the place (${shown})`);
  assert(!shown.includes(SPY_WORDS) && !shown.includes('The location:'), 'never a card’s words');
  assert(!(await reveal.evaluate((e) => !!e.closest('.panel'))), 'over the stage, not in the panel');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await host.keyboard.press('Control+z');
  assert(await until(async () => !(await reveal.count())), 'Ctrl+Z takes it off the stage');
  await host.evaluate(() => (window.__seen.length = 0));
  await secret('Who was who taken off');
  await host.keyboard.press('Control+y');
  await reveal.waitFor();
  assert((await flat(reveal)).includes(`${spy} Spy`), 'Ctrl+Y puts it back');

  // ---------- A host reload: Who was who, the cards and their ids stay; Ctrl+Z still takes it off ----------
  // (Once autosave holds them: its write waits a moment for more clicks.)
  const kept = async () => {
    const s = (await stored(host))?.session;
    return s?.deal?.shown === true && JSON.stringify((s.cards ?? []).map((c) => `sc:${c.id}:${c.at}`)) === JSON.stringify(again);
  };
  assert(await until(kept), 'autosave holds Who was who on, and the cards under their new ids');
  n = states.length;
  await resume();
  assert(await until(() => states.length > n && cards().length === 5), 'reloaded: back in the room with the five cards');
  const odd = states.slice(n).filter((s) => JSON.stringify((s.cards ?? []).map((c) => c.id)) !== JSON.stringify(again));
  assert(!odd.length, 'under the same ids (no phone is told anything new)');
  await reveal.waitFor();
  assert((await flat(reveal)).includes(`${spy} Spy`), 'Who was who is still on the stage');
  await host.keyboard.press('Control+z');
  assert(await until(async () => !(await reveal.count())), 'Ctrl+Z after the reload takes it off');
  await host.evaluate(() => (window.__seen.length = 0));
  await openDeal();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 5: Spy ×1, Villager ×4' && (await dialog.locator('[data-deal-reveal]').count()) === 1, 'the deal’s window: the counts, and 🎭 Who was who to show again');
  await secret('reloaded, sent');

  // ---------- 🎭 Deal a new one asks first while the cards are out ----------
  await dialog.getByRole('button', { name: '🎭 Deal a new one' }).click();
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  const askBox = host.getByRole('alertdialog');
  await askBox.waitFor();
  assert((await flat(askBox)).includes('Dealing a new one takes the cards of “Odd one out” back from the phones.'), 'dealing a new one asks first: the cards out would go');
  await askBox.getByRole('button', { name: 'Cancel' }).click();
  await askBox.waitFor({ state: 'detached' });
  await sleep(500);
  assert(cards().length === 5 && JSON.stringify(cards().map((c) => c.id)) === JSON.stringify(again) && (await savedDeal()).id === d.id, 'Cancel: the same deal, its cards out as they were');
  if (!(await dialog.count())) await openDeal();
  await dialog.getByRole('button', { name: 'Back to “Odd one out”' }).click();

  // ---------- The next round takes the cards back; the deal stays for Who was who ----------
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await sleep(500);
  await tools.getByRole('button', { name: 'Next round ▶' }).click();
  await confirmStrip(host).getByRole('button', { name: 'Yes' }).waitFor();
  await sleep(500);
  await confirmStrip(host).getByRole('button', { name: 'Yes' }).click();
  assert(await until(() => !cards().length), 'the next round: the cards (until the round ends) go from the room');
  assert(await until(async () => !(await cardsOn(phones[spy])) && !(await cardsOn(eve))), 'and from the phones');
  await openDeal();
  assert((await flat(dialog.locator('[data-deal-status]'))).includes('Its cards are back (or over)'), 'the deal’s window says its cards are over');
  await secret('the next round');
  await dialog.locator('[data-deal-reveal]').click();
  await reveal.waitFor();
  assert((await flat(reveal)).includes(`${spy} Spy`), 'Who was who still shows who was who');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---------- Two windows: the audience window, opened with Who was who up, shows it; the host's column says who got which ----------
  console.log('Two windows:');
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  const audReveal = aud.locator('[data-who-was-who]');
  await audReveal.waitFor();
  assert((await flat(audReveal)).includes(`${spy} Spy`), 'the audience window, opened with Who was who up, shows it');
  const info = host.locator('[data-deal-info]');
  await info.waitFor();
  const infoText = await flat(info);
  assert(hands.every((h) => infoText.includes(`${h.name} → ${h.part}${h.slice ? ` · ${h.slice}` : ''}`)), `the column beside the stage (viewers don’t see it) says who got which (${infoText})`);
  const caught = await host.evaluate(whoGotWhich, { hands, ATTRS, skip: '[data-who-was-who]' });
  assert(hands.every((h) => caught.some((x) => x.includes(`(${h.name} → ${h.part})`))), 'and the check that found nothing in one window finds each of them there');
  await openDeal();
  await dialog.locator('[data-deal-hide]').click();
  assert(await until(async () => !(await audReveal.count()) && !(await reveal.count())), '🙈 Hide takes it off the stream');
  assert(!(await aud.locator('body').innerText()).includes(place), 'the audience window shows no place now');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await aud.close();
  assert(await until(async () => !(await info.count())), 'the audience window closed: the column goes, the host page being on stream again');
  await host.evaluate(() => (window.__seen.length = 0));
  await secret('the audience window closed');

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Spyfall tests passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
