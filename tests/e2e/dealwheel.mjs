// 🧠 A deal drawn from a wheel, end to end (docs/PARTNER-CLUES-SPEC.md §11, §12, §14.6, milestone P4): the built app
// hosts a game against the real buzzer room (buzzer/ under `wrangler dev`, local), with four phones and the audience
// window open. The game's saved deal gives every player their own slice of its "Party prompts" wheel: four slices to
// draw (two with a picture from this computer, two with longer words) and a heavy "Spin again" slice that is never
// dealt. The host changes the card's words for this deal only, and deals it again and again: each time the four slices
// go one each, never Spin again. 📤 Send uploads the two pictures and gives each phone its own prompt (its words, its
// picture), with no "You're the Player" (everyone has the same part); no phone hears another's prompt or can fetch
// another's picture. The audience window holds none of it until 🎭 Who was who, which shows names and slices, never a
// slice's longer words. ✖ Take back lets go of the pictures, 📤 Send puts the same prompts out again. A deal drawn from
// the ready-made 🗺 Locations wheel replaces it (asked first, its cards out), and neither changes the game: its deal
// and wheels stay as saved. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openGameFile, packGame, png, recordSeen, shownOf, startBuzzer, startRoomOn, stored } from './helpers.mjs';

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

// ---------- The game ----------

// Each slice's label carries "qxN" and its longer words "dtlN"; the pictures' file names "zfnqj". Nothing of them may
// reach the audience window before Who was who, and the longer words and file names never.
const SLICES = [
  { id: 's1', label: 'Hum-qx1', details: 'Hum whenever you answer dtl1', media: 'hum' },
  { id: 's2', label: 'Wink-qx2', details: 'Wink at the host dtl2' },
  { id: 's3', label: 'Spin again', weight: 6 },
  { id: 's4', label: 'Clap-qx3', media: 'clap' },
  { id: 's5', label: 'Shrug-qx4' },
];
const PROMPTS = SLICES.filter((s) => s.id !== 's3');
const CARD_WORDS = 'Your secret prompt:';
const THIS_DEAL = 'Psst, your prompt:';

let ids = 0;
const text = (t, y = 40) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1, kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...elements) => ({ background: {}, elements });

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-dealwheel-');
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

  const files = { hum: png(200, 40, 40, 300, 200), clap: png(40, 160, 40, 300, 200) };
  const media = Object.entries(files).map(([id, b]) => ({ id, name: `zfnqj-${id}.png`, mime: 'image/png', size: b.length, kind: 'image' }));
  const plain = (id) => ({ id, value: null, type: 'standard', questionSlide: slide(text('A question')), answerSlide: slide(text('An answer')) });
  const game = {
    id: 'g_deal_wheel',
    version: 2,
    title: 'Party prompts',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
    rounds: [{ id: 'r1', name: 'Round 1', mode: 'board', values: [200, 400], dailyDoubleCount: 0, categories: [{ id: 'cat0', title: 'Movies', clues: [plain('q1'), plain('q2')] }] }],
    media, audio: {}, dice: [], theme: {},
    wheels: [{ id: 'w_p', name: 'Party prompts', segments: SLICES.map((s, i) => ({ weight: 1, color: ['#e6194b', '#3cb44b', '#888888', '#4363d8', '#f58231'][i], ...s })), spinDurationMs: 3000, removeAfterLanding: false }],
    deals: [{ id: 'deal_p', name: 'Own prompts', wheel: 'w_p', parts: [{ id: 'pl', name: 'Player', count: 'rest', draw: 'own', card: slide(text(CARD_WORDS)) }] }],
  };
  const packPath = resolve('test-results/deal-wheel.brainrot');
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
  host.setDefaultTimeout(20000);
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
  const cards = () => last()?.cards ?? [];
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();

  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(roomCard);

  // ---------- Four phones ----------
  const heard = {};
  const phones = {};
  for (const name of ['Ann', 'Bob', 'Cat', 'Dan']) {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), name);
    p.setDefaultTimeout(20000);
    heard[name] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[name].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name, exact: true }).click();
    await p.locator('#me').getByText(name).waitFor();
    phones[name] = p;
  }
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const nameOf = Object.fromEntries(Object.entries(seat).map(([n, id]) => [id, n]));
  const tokenOf = (p) => p.evaluate((c) => JSON.parse(localStorage.getItem(`brainrot-buzzer:${c}`)).token, code);
  /** A card file, fetched from the room as this phone would: the HTTP status. */
  const fetchAs = async (p, id) => {
    const t = await tokenOf(p);
    return p.evaluate(async ([u, t]) => (await fetch(u, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' })).status, [`${base}/api/rooms/${code}/files/${id}`, t]);
  };

  // ---------- The audience window, watched until Who was who ----------
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  const offStream = async (words, when) => {
    const found = await shownOf(aud, words);
    assert(!found.length, `${when}: the audience window holds none of it${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };
  const SECRETS = ['qx1', 'qx2', 'qx3', 'qx4', 'dtl1', 'dtl2', 'zfnqj', CARD_WORDS, THIS_DEAL];

  /** The deal autosave holds for the game in progress (the test's own look). */
  const savedDeal = async () => (await stored(host))?.session?.deal ?? null;
  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

  // ---------- 🎭 Deal…: the saved deal, its words changed for this deal only ----------
  console.log('Dealing:');
  const tools = host.locator('.panel .toolsrow');
  const dialog = host.getByRole('dialog', { name: 'Deal' });
  await tools.getByRole('button', { name: '🎭 Deal…' }).click();
  await dialog.waitFor();
  assert((await dialog.getByRole('combobox', { name: 'The deal' }).inputValue()) === 'saved:deal_p', 'it starts with the game’s saved deal, Own prompts');
  assert((await dialog.getByLabel('Player’s card draws from the wheel').inputValue()) === 'own' && (await dialog.getByRole('combobox', { name: 'The wheel its cards draw from' }).inputValue()) === 'w_p', 'a slice each, from Party prompts');
  const words = dialog.getByLabel('Player’s card words');
  assert((await words.inputValue()) === CARD_WORDS, 'two windows: its card’s words show');
  await words.fill(THIS_DEAL);
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  await dialog.locator('[data-deal-counts]').waitFor();
  assert((await flat(dialog.locator('[data-deal-counts]'))) === 'Dealt to 4: Player ×4', 'dealt: “Dealt to 4: Player ×4”');
  const info = host.locator('[data-deal-info]');
  /** Who drew which, as the host's column says it. */
  const column = async () => {
    const t = await flat(info);
    return Object.fromEntries([...t.matchAll(/(Ann|Bob|Cat|Dan) → Player · (.+?)(?= (?:Ann|Bob|Cat|Dan) →|$)/g)].map((m) => [m[1], m[2].replace(/ · ✓ seen$/, '')]));
  };
  const labels = PROMPTS.map((s) => s.label).sort();
  let d = null;
  let drew = {};
  for (let i = 0; i < 6; i++) {
    if (i) {
      const before = d.id;
      await dialog.getByRole('button', { name: '↻ Deal again' }).click();
      assert(await until(async () => (d = await savedDeal())?.id !== before, 10000), `↻ Deal again (${i})`);
    } else assert(await until(async () => (d = await savedDeal())?.stage === 'dealt'), 'kept with the game in progress');
    assert(await until(async () => JSON.stringify(await column()) === JSON.stringify(Object.fromEntries(d.hands.map((h) => [nameOf[h.to.seat], h.slice])))), 'the column beside the stage says who drew which');
    drew = await column();
    assert(JSON.stringify(Object.values(drew).sort()) === JSON.stringify(labels), `the four slices, one each, never Spin again (${JSON.stringify(drew)})`);
  }
  assert(d.hands.every((h) => !h.role), 'everyone has the same part: no “You’re the Player” to send');
  await sleep(500);
  assert(!states.some((s) => s.cards?.length) && uploads === 0, 'dealt, not sent: no card reaches the room, and no picture goes up');
  await offStream(SECRETS, 'dealt');

  // ---------- 📤 Send: the pictures go up; each phone gets its own prompt ----------
  console.log('Sending:');
  await dialog.locator('[data-deal-send]').click();
  assert(await until(() => cards().length === 4), 'sent: four cards, one per player');
  const slice = (name) => PROMPTS.find((s) => s.label === drew[name]);
  const pics = () => cards().filter((c) => c.media?.[0]?.file);
  assert(await until(() => pics().length === 2) && uploads === 2, 'the two pictures go up once each, and the cards then name the room’s files');
  const sent = cards();
  for (const c of sent) {
    const who = nameOf[c.to[0].seat];
    const s = slice(who);
    assert(
      c.to.length === 1 && !c.role && !c.shared && c.title === THIS_DEAL && c.text === [s.label, s.details].filter(Boolean).join('\n') && !!c.media === !!s.media,
      `${who}’s card: “${THIS_DEAL}”, then ${s.label}${s.details ? ' and its longer words' : ''}${s.media ? ' and its picture' : ''}`,
    );
  }
  assert(!JSON.stringify(states).includes('zfnqj') && !JSON.stringify(states).includes(CARD_WORDS), 'no file name goes to the room, nor the saved deal’s words (this deal’s were changed)');
  const fileOf = {};
  for (const name of ['Ann', 'Bob', 'Cat', 'Dan']) {
    const p = phones[name];
    const s = slice(name);
    await p.getByRole('button', { name: 'Tap to see' }).tap();
    await p.locator('.card-words', { hasText: s.label }).waitFor();
    assert(!(await p.locator('.card-role').count()) && !(await p.locator('.card').innerText()).includes('You’re the'), `${name}’s phone: ${s.label}, with no part line`);
    if (s.media) {
      assert(await until(() => p.locator('.card img').evaluate((img) => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0).catch(() => false)), `${name}’s phone: the picture arrives`);
      fileOf[name] = sent.find((c) => c.to[0].seat === seat[name]).media[0].file;
    }
    const others = PROMPTS.filter((x) => x !== s).flatMap((x) => [x.label, ...(x.details ? [x.details] : [])]);
    assert(!others.some((w) => heard[name].join('\n').includes(w)), `${name}’s phone never hears another’s prompt`);
  }
  const withPic = Object.keys(fileOf);
  const without = ['Ann', 'Bob', 'Cat', 'Dan'].filter((n) => !fileOf[n]);
  assert((await fetchAs(phones[withPic[0]], fileOf[withPic[0]])) === 200 && (await fetchAs(phones[withPic[0]], fileOf[withPic[1]])) === 404, `${withPic[0]} can fetch their picture, not ${withPic[1]}’s`);
  assert((await fetchAs(phones[without[0]], fileOf[withPic[0]])) === 404 && (await fetchAs(phones[without[1]], fileOf[withPic[1]])) === 404, `${without.join(' and ')} (no picture) can fetch neither`);
  assert(await until(async () => /✓ seen by 4 of 4/.test(await flat(dialog.locator('[data-deal-status]')))), 'the panel: ✓ seen by 4 of 4');
  await offStream(SECRETS, 'sent');

  // ---------- 🎭 Who was who: names and slices, never the longer words ----------
  console.log('Who was who:');
  assert(!(await aud.locator('[data-who-was-who]').count()), 'not on stream before the host shows it');
  await dialog.locator('[data-deal-reveal]').click();
  const reveal = aud.locator('[data-who-was-who]');
  await reveal.waitFor();
  const shown = await flat(reveal);
  // (Everyone the same part: the slice takes its place, never "Player" on every line.)
  assert(['Ann', 'Bob', 'Cat', 'Dan'].every((n) => shown.includes(`${n} ${drew[n]}`)) && !/\bPlayer\b/.test(shown), `on stream: each name with the slice they drew, not the part they all had (${shown})`);
  await offStream(['dtl1', 'dtl2', 'zfnqj', CARD_WORDS, THIS_DEAL], 'Who was who');
  await host.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await host.keyboard.press('Control+z');
  assert(await until(async () => !(await reveal.count())), 'Ctrl+Z takes it off');
  // (From here on, what the audience window shows anew: Who was who showed the slices.)
  await aud.evaluate(() => (window.__seen.length = 0));
  await offStream(SECRETS, 'Who was who taken off');

  // ---------- ✖ Take back lets go of the pictures; 📤 Send puts the same prompts out again ----------
  console.log('Take back, send again:');
  await tools.getByRole('button', { name: '🎭 Deal…' }).click();
  await dialog.waitFor();
  await dialog.getByRole('button', { name: '✖ Take back' }).click();
  assert(await until(() => !cards().length), '✖ Take back: the room holds none of them');
  assert(await until(async () => !(await phones.Ann.locator('.card').count()) && !(await phones[withPic[0]].locator('.card').count())), 'the phones drop them');
  assert(await until(async () => (await fetchAs(phones[withPic[0]], fileOf[withPic[0]])) === 404), 'and the room lets go of the pictures');
  await dialog.getByRole('button', { name: '📤 Send' }).click();
  assert(await until(() => cards().length === 4 && cards().every((c) => !sent.some((x) => x.id === c.id))), '📤 Send again: four cards under new ids');
  assert(await until(() => pics().length === 2) && uploads === 4, 'the pictures go up again');
  assert(cards().every((c) => c.text === sent.find((x) => x.to[0].seat === c.to[0].seat).text), 'each player gets the same prompt as before');
  await phones[withPic[1]].getByRole('button', { name: 'Tap to see' }).tap();
  assert(await until(() => phones[withPic[1]].locator('.card img').evaluate((img) => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0).catch(() => false)), `${withPic[1]}’s picture is back`);
  await offStream(SECRETS, 'sent again');

  // ---------- A deal drawn from the ready-made 🗺 Locations wheel replaces it ----------
  console.log('A ready-made wheel:');
  await dialog.getByRole('button', { name: '🎭 Deal a new one' }).click();
  await dialog.getByRole('combobox', { name: 'The wheel its cards draw from' }).selectOption('tpl:locations');
  assert(!(await dialog.locator('[data-deal-problem]').count()), 'the ready-made Locations wheel can be drawn from');
  await dialog.getByRole('button', { name: '🎭 Deal', exact: true }).click();
  const askBox = host.getByRole('alertdialog');
  await askBox.waitFor();
  await askBox.getByRole('button', { name: 'Take them back and deal' }).click();
  assert(await until(() => !cards().length), 'its cards out are taken back first');
  assert(await until(async () => (await savedDeal())?.hands.every((h) => !PROMPTS.some((s) => s.label === h.slice))), 'the new deal’s slices are places');
  d = await savedDeal();
  const places = Object.fromEntries(d.hands.map((h) => [nameOf[h.to.seat], h.slice]));
  assert(new Set(Object.values(places)).size === 4, `four places, one each (${JSON.stringify(places)})`);
  assert(await until(async () => (await flat(info)).includes(`Ann → Player · ${places.Ann}`)), 'the column says who drew which');
  await dialog.locator('[data-deal-send]').click();
  assert(await until(() => cards().length === 4), 'sent');
  await phones.Bob.getByRole('button', { name: 'Tap to see' }).tap();
  await phones.Bob.locator('.card-words', { hasText: places.Bob }).waitFor();
  assert(!heard.Bob.join('\n').includes(places.Ann), 'Bob’s phone gets his place, not Ann’s');
  await offStream(Object.values(places), 'a deal of places sent');

  // ---------- The game is as saved: the deal's words and wheels unchanged ----------
  const play = await stored(host);
  const draft = await stored(host, 'editorDraft');
  for (const [g, where] of [[play?.game, 'the game in play'], [draft, 'the editor’s copy']]) {
    assert(!!g && g.deals?.length === 1 && g.deals[0].wheel === 'w_p' && JSON.stringify(g.deals[0].parts[0].card).includes(CARD_WORDS), `${where}: its deal is as saved (its words, its wheel)`);
    assert(g.wheels.length === 1 && g.wheels[0].id === 'w_p', `${where}: no Locations wheel added`);
  }

  assert(!errors.length, `no page errors (${errors.join('; ')})`);
  console.log('Deal wheel tests passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
