// 🤫 Sending a partner clue's cards to phones, end to end (docs/PARTNER-CLUES-SPEC.md §6.5, §13.5, §14.4, §15.2, §22):
// the built app hosts a game (opened from a pack, with its pictures and video) against the real buzzer room (buzzer/
// under `wrangler dev`, local), with four phones on the real phone page.
// Nothing of a card reaches the room (its state, what it saves to disk), a phone or an upload until the host sends it:
// from the tile opening through the question and a card given to someone else. 📤 Send and start gives the describer
// the card behind Tap to see (its words at once, then its picture shrunk on this computer, its video file and its
// YouTube clip), and the card given to someone else to them only; the guesser's and the other phones grey out with who
// plays which part. A host reload mid-upload finishes the uploads of the cards that were sent, and never touches a card
// that wasn't. A phone that takes a freed seat afterwards gets nothing of the card (nor its file) until ↻ Send again;
// 📤 Send changes adds and takes back one player; no phone can fetch a file of a card it wasn't sent; ⇡ Get it ready
// cut off by a reload finishes after it, given to no phone; ✖ Take back. A card with more GIFs than the room holds:
// the upload the room turns down, and one too big for the buzzer server, are said in plain words and offered 📋 Copy
// picture.
// The audience window, and the host page in one window, never hold a card's words, its file names or its link.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mainButton, mainLabel, openGameFile, packGame, png, recordSeen, roomStored, shownOf, startBuzzer, stored } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/**
 * A GIF of `w`×`h` random pixels (seeded), its picture data stored uncompressed (a clear code every 250 pixels keeps
 * every code 9 bits wide): about 9 bits a pixel, so its size is known, and it's a real GIF a browser draws. With
 * `frames`, as many pictures one after another: that many times the bytes, with no bigger a picture to draw.
 */
function noiseGif(w, h, seed, frames = 1) {
  let x = seed >>> 0 || 1;
  const rnd = () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), x >>> 0);
  const head = Buffer.alloc(13);
  head.write('GIF89a');
  head.writeUInt16LE(w, 6);
  head.writeUInt16LE(h, 8);
  head[10] = 0xf7; // a global table of 256 colors
  const palette = Buffer.alloc(768);
  for (let i = 0; i < 768; i++) palette[i] = rnd() & 255;
  const out = [head, palette];
  for (let f = 0; f < frames; f++) {
    const desc = Buffer.alloc(10);
    desc[0] = 0x2c;
    desc.writeUInt16LE(w, 5);
    desc.writeUInt16LE(h, 7);
    const n = w * h;
    const codes = n + Math.ceil(n / 250) + 1;
    const data = Buffer.alloc(Math.ceil((codes * 9) / 8) + 2);
    let bit = 0;
    const put = (c) => {
      for (let k = 0; k < 9; k++, bit++) if ((c >> k) & 1) data[bit >> 3] |= 1 << (bit & 7);
    };
    for (let i = 0; i < n; i++) {
      if (i % 250 === 0) put(256);
      put(rnd() & 255);
    }
    put(257);
    const bytes = data.subarray(0, Math.ceil(bit / 8));
    out.push(desc, Buffer.from([8]));
    for (let i = 0; i < bytes.length; i += 255) {
      const part = bytes.subarray(i, i + 255);
      out.push(Buffer.from([part.length]), part);
    }
    out.push(Buffer.from([0]));
  }
  out.push(Buffer.from([0x3b]));
  return Buffer.concat(out);
}

// ---------- The game ----------

// Every card's words carry "qkzvx", every file name "zfnqj": none may ever be on stream, and no file name ever leaves this
// computer. Card 3 is never sent: its words never reach the room at all.
const WORDS1 = 'Ogre-qkzvx words';
const WORDS2 = 'Swamp-qkzvx words';
const WORDS3 = 'Third-qkzvx words';
const YT = 'https://youtu.be/dQw4w9WgXcQ';
const SECRETS = ['qkzvx', 'zfnqj', 'dQw4w9WgXcQ'];

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const image = (media, y) => ({ ...box(y), kind: 'image', media, fit: 'contain' });
const play = { autoplay: false, loop: false, muted: false, volume: 1 };
const video = (media, y) => ({ ...box(y), kind: 'video', media, fit: 'contain', ...play });
const youtube = (url, y) => ({ ...box(y), kind: 'embed', embedKind: 'youtube', url, ...play });
const slide = (...elements) => ({ background: {}, elements });

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// (Its own limits, so the sizes below hold whatever wrangler.jsonc says: small ones, so the files are small too.)
const buzzer = await startBuzzer('buzzer-partnersend-', { vars: { FILE_MB: 3, ROOM_FILES_MB: 10, FILES_MB_PER_DAY: 200 } });
const { base, persist } = buzzer;
let browser;
const errors = [];
const pages = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  pages.push([name, p]);
  return p;
};

try {
  browser = await chromium.launch({ executablePath });

  // A second of WebM, made in the browser (a real video file a phone can play).
  const maker = await browser.newPage();
  const clip = Buffer.from(
    await maker.evaluate(async () => {
      const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
      const g = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
      const parts = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      const done = new Promise((ok) => (rec.onstop = ok));
      rec.start();
      for (let i = 0; i < 15; i++) {
        g.fillStyle = `hsl(${i * 24} 70% 50%)`;
        g.fillRect(0, 0, 160, 90);
        await new Promise((r) => setTimeout(r, 66));
      }
      rec.stop();
      await done;
      return [...new Uint8Array(await new Blob(parts).arrayBuffer())];
    }),
  );
  await maker.close();

  // Files: a big picture (shrunk before it goes up), the video, two small pictures; for the second clue a small
  // picture, five GIFs of about 2.2 MB (the room holds 10 MB: the fifth is turned down) and one over 3 MB, each four
  // frames.
  const files = {
    big: png(200, 60, 20, 3000, 2000),
    clip,
    swamp: png(20, 160, 60, 400, 300),
    third: png(60, 20, 160, 300, 200),
    first: png(240, 200, 40, 300, 200),
    ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`gif${i}`, noiseGif(700, 700, i * 7919, 4)])),
    huge: noiseGif(900, 900, 4242, 4),
  };
  const ref = (id, name, mime, kind) => ({ id, name, mime, size: files[id].length, kind });
  const media = [
    ref('big', 'zfnqj-ogre.png', 'image/png', 'image'),
    ref('clip', 'zfnqj-clip.webm', 'video/webm', 'video'),
    ref('swamp', 'zfnqj-swamp.png', 'image/png', 'image'),
    ref('third', 'zfnqj-third.png', 'image/png', 'image'),
    ref('first', 'zfnqj-first.png', 'image/png', 'image'),
    ...[1, 2, 3, 4, 5].map((i) => ref(`gif${i}`, `zfnqj-gif${i}.gif`, 'image/gif', 'image')),
    ref('huge', 'zfnqj-huge.gif', 'image/gif', 'image'),
  ];
  // (Four of them and the rest fit in 10 MiB, five don't; the one too big is over 3 MiB.)
  assert(files.gif1.length > 2.15e6 && files.gif1.length < 2.4e6 && files.huge.length > 3 * 1024 * 1024, `the GIFs: five of ${(files.gif1.length / 1e6).toFixed(2)} MB, one of ${(files.huge.length / 1e6).toFixed(2)} MB`);
  const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
  const plain = (id, q, a) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)) });
  const partnerClue = (id, q, a, cards) => ({ ...plain(id, q, a), type: 'partner', partner: { ...rules }, timerSeconds: 60, cards });
  const values = [200, 400];
  const game = {
    id: 'g_partner_send',
    version: 2,
    title: 'Partner cards',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true,
    },
    players: ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] })),
    rounds: [
      {
        id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 0,
        categories: [
          {
            id: 'cat0', title: 'Movies',
            clues: [
              partnerClue('q_send', 'Describe this movie quietly', 'Shrek', [
                { id: 'c1', to: 'giver', ...slide(text(WORDS1), image('big', 300), video('clip', 600), youtube(YT, 900)) },
                { id: 'c2', to: 'guesser', ...slide(text(WORDS2), image('swamp', 400)) },
                { id: 'c3', to: 'nobody', ...slide(text(WORDS3), image('third', 400)) },
              ]),
              partnerClue('q_gifs', 'Describe these animals', 'Cats', [
                { id: 'g1', to: 'giver', ...slide(text('Gifs-qkzvx words', 0), image('first', 100), ...[1, 2, 3, 4, 5].map((i) => image(`gif${i}`, 100 + i * 150))) },
                { id: 'g2', to: 'giver', ...slide(text('Huge-qkzvx words'), image('huge', 400)) },
              ]),
            ],
          },
          { id: 'cat1', title: 'Songs', clues: values.map((_, r) => plain(`q_song${r}`, 'A plain clue', 'Plain')) },
        ],
      },
    ],
    media, audio: {}, wheels: [], dice: [], theme: {},
  };
  const packPath = resolve('test-results/partner-send.brainrot');
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
  await ctx.route(/youtube|ytimg/, (r) => r.fulfill({ body: '', contentType: 'text/plain' }));
  const host = watch(await ctx.newPage(), 'host');
  // Everything the host tells the room, every card file it uploads (in order), and what the room answered.
  const states = [];
  const uploads = [];
  const answers = [];
  const isUpload = (r) => r.method() === 'POST' && /\/api\/rooms\/[^/]+\/files$/.test(new URL(r.url()).pathname);
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
  host.on('request', (r) => isUpload(r) && uploads.push({ type: r.headers()['content-type'], bytes: r.postDataBuffer()?.length ?? 0 }));
  // (In the order they came: a body is read later, and a later one can be read first.)
  host.on('response', (r) => {
    if (!isUpload(r.request())) return;
    const a = { status: r.status(), read: false };
    answers.push(a);
    void r.json().then(
      (body) => Object.assign(a, { id: body.id, error: body.error, read: true }),
      () => (a.read = true),
    );
  });
  const last = () => states.at(-1);
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  await roomCard.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = roomCard.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);

  // ---------- Four phones ----------
  /** What each phone heard from the room. */
  const heard = {};
  const PLAYER = '<!doctype html><title>player</title><p>a player</p>';
  const join = async (label, seat) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    await c.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ body: PLAYER, contentType: 'text/html' }));
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
  const dan = await join('dan', 'Dan');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();

  /** The phone's status line comes to say `text`: its greyed button's big line, or over its cards. */
  const says = (p, t) =>
    p
      .waitForFunction((t) => ['buzz-big', 'card-status-big'].some((id) => document.getElementById(id)?.textContent === t && !!document.getElementById(id)?.getClientRects().length), t, { timeout: 8000 })
      .then(() => true, () => false);
  /** Its small line under that. */
  const small = (p) => p.evaluate(() => (document.getElementById('buzz')?.getClientRects().length ? document.getElementById('buzz-small') : document.getElementById('card-status-small'))?.textContent ?? '');
  /** Waits (up to `ms`) until pred() holds. */
  const until = async (pred, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
    return !!(await pred());
  };
  /** The room's answers to the uploads, once `n` came and each was read. */
  const answered = (n) => until(() => answers.length === n && answers.every((a) => a.read));
  /** This phone's seat token (what it fetches card files with). */
  const tokenOf = (p) => p.evaluate((c) => JSON.parse(localStorage.getItem(`brainrot-buzzer:${c}`)).token, code);
  /** A card file, fetched from the room as this phone would (its token, or `token`, in a header): the HTTP status. */
  const fetchAs = async (p, id, token) => {
    const t = token ?? (await tokenOf(p));
    return p.evaluate(async ([u, t]) => (await fetch(u, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' })).status, [`${base}/api/rooms/${code}/files/${id}`, t]);
  };
  /** What's in these elements now (nothing when there are none: never waits for them). */
  const textOf = (loc) => loc.allInnerTexts().then((t) => t.join('\n'));
  /** The cards the room's state holds now, by the card they're a send of ("pc:<clue>:<card>:<at>"). */
  const sends = () => (last()?.cards ?? []).map((c) => ({ ...c, card: c.id.split(':')[2] }));
  const sendOf = (card) => sends().filter((c) => c.card === card);
  const viewOf = (label) => {
    const v = heard[label].map((m) => JSON.parse(m)).filter((m) => m.t === 'view').at(-1)?.view;
    return v ?? {};
  };

  const panel = host.locator('.panel [data-partner-panel]');
  const row = (n) => panel.locator(`[data-card="${n}"]`).first();
  // (A chip's name says whether its card went to that player, and was seen: "Card 1 to Bob, seen".)
  const chip = (name) => panel.getByRole('button', { name: new RegExp(`^${name}(, sent|, seen)?$`) });

  // ---------- Two windows: the audience window, watched all through ----------
  let [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  /** No card's words, file names or link in the audience window (nor anything it said), now or since it opened. */
  const offStream = async (p, name, when) => {
    const found = await shownOf(p, SECRETS);
    assert(!found.length, `${when}: ${name} holds no card’s words, file names or link${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  /** Nothing of a card has reached the room, what it saved, or a phone, and nothing went up. */
  const nothingSent = async (when) => {
    const all = JSON.stringify(states);
    const phones = JSON.stringify(heard);
    const stored = (await roomStored(persist, 'qkzvx')) || (await roomStored(persist, 'zfnqj'));
    assert(
      states.length > 0 && !all.includes('"cards"') && !all.includes('qkzvx') && !all.includes('zfnqj') && !phones.includes('qkzvx') && !uploads.length && !stored,
      `${when}: no card in the room’s state, in what it saved or on a phone, and no file uploaded`,
    );
  };

  // ---------- PARTNER UP! (Ann picked it), paired with Bob, the question, and a card given to Cat ----------
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  await host.locator('.stage-box [data-partner-up]').waitFor();
  await panel.getByText('Ann picked it.').waitFor();
  assert(await says(dan, '🤝 Partner clue'), 'PARTNER UP!: every phone greys out with the roles line');
  await nothingSent('the tile open');
  await host.keyboard.press('2');
  assert((await says(ann, '🤝 You two play this one!')) && (await says(dan, '🤝 Ann + Bob')), 'paired: Ann and Bob “🤝 You two play this one!”, the others “🤝 Ann + Bob”');
  await nothingSent('paired');
  await offStream(aud, 'the audience window', 'PARTNER UP!');
  await mainButton(host).click();
  await host.locator('.stage-box [data-partner-badge]').waitFor();
  assert((await mainLabel(host)) === '📤 Send and start', 'the question up: the main button is 📤 Send and start');
  for (const [p, name] of [[bob, 'Bob, the describer'], [dan, 'Dan']]) assert(await says(p, '🤝 Bob describes → Ann guesses'), `${name}: “🤝 Bob describes → Ann guesses”`);
  assert((await says(ann, '🎯 You’re guessing!')) && (await small(ann)) === 'Bob is describing: say it out loud', 'Ann, the guesser: “🎯 You’re guessing!” · “Bob is describing: say it out loud”');
  assert((await chip('Card 2 to Ann').getAttribute('aria-pressed')) === 'true', 'Card 2 starts with Ann (the guesser)');
  await chip('Card 2 to Cat').click();
  await chip('Card 2 to Ann').click();
  await row(2).getByText('(changed)').waitFor();
  assert((await chip('Card 2 to Cat').getAttribute('aria-pressed')) === 'true' && (await chip('Card 2 to Ann').getAttribute('aria-pressed')) === 'false', 'Card 2 given to Cat instead of Ann');
  await sleep(300);
  await nothingSent('the question up, a card given to someone else');
  await offStream(aud, 'the audience window', 'handing out the cards');
  // (Once autosave holds it: its write waits a moment for more clicks, and the copy written as the page goes away isn't
  // always kept by a browser under test.)
  const catSeat = last().seats.find((x) => x.name === 'Cat').id;
  assert(await until(async () => JSON.stringify((await stored(host))?.session?.partner?.deal?.c2) === JSON.stringify([{ seat: catSeat }])), 'autosave holds card 2 given to Cat');

  // ---------- A host reload in the Distribute step, nothing sent or got ready: no upload, the list as it was ----------
  /** The host reloads and resumes in one window (`reloaded` runs once the page is back, before Resume game). */
  const resume = async (reloaded = () => {}) => {
    await host.reload();
    reloaded();
    await host.getByRole('button', { name: 'Resume game' }).click();
    await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
    await host.locator('.play .panel').waitFor();
  };
  await aud.close();
  let n = states.length;
  await resume();
  assert(await until(() => states.length > n), 'reloaded: the host is back in the room');
  assert((await chip('Card 2 to Cat').getAttribute('aria-pressed')) === 'true' && (await mainLabel(host)) === '📤 Send and start', 'a reload in the Distribute step: the list as it was (card 2 to Cat), nothing sent');
  await nothingSent('reloaded in the Distribute step');
  [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('[data-partner-badge]').waitFor();

  // ---------- 📤 Send and start, with the uploads held up (a slow network), then a host reload ----------
  /** Uploads that reach the network wait here while `holding`: none goes through. */
  const held = [];
  let holding = true;
  await host.route('**/api/rooms/*/files', (r) => (holding && r.request().method() === 'POST' ? void held.push(r) : r.continue()));
  await mainButton(host).click();
  await host.locator('.stage-box .timer').waitFor();
  assert(await until(() => sendOf('c1').length === 1 && sendOf('c2').length === 1), 'sent: the room’s state holds card 1 and card 2');
  const s1 = sendOf('c1')[0];
  const s2 = sendOf('c2')[0];
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  assert(
    JSON.stringify(s1.to) === JSON.stringify([{ seat: seat.Bob }]) && JSON.stringify(s2.to) === JSON.stringify([{ seat: seat.Cat }]) && !sendOf('c3').length,
    'card 1 to Bob’s seat only, card 2 to Cat’s only (not Ann’s, whose it was), and card 3 (to nobody) not at all',
  );
  assert(
    s1.text === WORDS1 && s1.role === 'Describer' && s1.hint === 'Describe it to Ann: don’t say what’s on it!' && JSON.stringify(s1.media) === JSON.stringify([{ kind: 'image', pending: true }, { kind: 'video', pending: true }, { kind: 'embed', site: 'youtube', url: YT }]),
    'card 1 goes at once with its words, its part and hint, its YouTube link, and its picture and video “coming”',
  );
  assert(!JSON.stringify(states).includes('zfnqj') && !JSON.stringify(states).includes(WORDS3), 'no file name ever goes to the room, nor card 3’s words');
  assert(await until(() => roomStored(persist, 'Ogre-qkzvx')), 'the room saved the card it was sent (so its saved state is where to look)');
  assert(!(await roomStored(persist, 'Third-qkzvx')), 'and never card 3, which wasn’t sent');
  assert(await until(() => uploads.length === 1), 'one upload starts (one at a time)');
  assert(uploads[0].type === 'image/webp' && uploads[0].bytes < files.big.length, `the picture goes up shrunk on this computer, as WebP (${uploads[0].bytes} bytes from ${files.big.length})`);

  // The describer's phone: the card in the button's place, behind Tap to see.
  const cover = bob.getByRole('button', { name: 'Tap to see' });
  await cover.waitFor();
  assert((await bob.locator('#buzz').isHidden()) && !(await bob.getByText(WORDS1).isVisible()) && (await bob.locator('#card-status-big').innerText()) === '🤝 Bob describes → Ann guesses', 'Bob’s phone: the card in the button’s place, covered, the roles line over it');
  await cover.tap();
  await bob.getByText(WORDS1).waitFor();
  const bobCard = bob.locator('.card');
  assert((await bobCard.innerText()).includes('🖼 Picture coming…') && (await bobCard.innerText()).includes('🎞 Video coming…'), 'tapped: its words, “🖼 Picture coming…” and “🎞 Video coming…”');
  assert(await until(async () => (await textOf(row(1).locator('[data-card-state]'))).includes('✓ seen')), 'the host’s row says ✓ seen');
  await cat.getByRole('button', { name: 'Tap to see' }).waitFor();
  for (const [p, label, name] of [[ann, 'ann', 'Ann (the guesser)'], [dan, 'dan', 'Dan']]) {
    assert(!(await p.locator('.card').count()) && (await p.locator('#buzz').getAttribute('aria-disabled')) === 'true' && !heard[label].join('').includes('qkzvx'), `${name}: no card, the button greyed`);
  }
  await offStream(aud, 'the audience window', 'sent');

  // ---------- A phone that takes a freed seat after the send (before the host reloads) ----------
  const catToken = await tokenOf(cat);
  const phonesChip = host.getByRole('button', { name: /^📱 \d/ });
  await phonesChip.click();
  await host.getByRole('button', { name: 'Free Cat’s seat (moved phone)' }).click();
  await cat.getByRole('heading', { name: 'The host freed your seat' }).waitFor();
  assert(!(await cat.locator('.card').count()), 'Cat’s seat freed: her old phone drops her card');
  await host.getByRole('button', { name: 'Close the phones list' }).click();
  const cat2 = await join('cat2', 'Cat');
  const lateLine = 'A card went to your seat before this phone joined. Ask the host to send it again.';
  await cat2.locator('#cards-late').getByText(lateLine).waitFor();
  assert(!(await cat2.locator('.card').count()) && !heard.cat2.join('').includes('qkzvx') && viewOf('cat2').cards?.late === 1, 'a phone that took Cat’s seat after the send gets nothing of the card, only a note that it missed one');
  const lateRow = 'Cat’s new phone hasn’t got it: ↻ Send again';
  assert(await until(async () => (await textOf(row(2).locator('[data-card-state]'))).includes(lateRow)), `and the host’s row says so: “${lateRow}”`);

  // ---------- The host reloads mid-upload (the held upload is cut off with the page) ----------
  // (Left held as the page goes, so the reload cuts it off: taking the route off sends a held request on, and it could
  // reach the room, and its answer the page, before the reload does. The uploads after the reload go through, counted
  // from the page that's back: the one going away may start the next upload as the held one is cut off, cut off too.)
  await aud.close();
  holding = false;
  let before = 0;
  const sentAt = states.length;
  await resume(() => (before = uploads.length));
  assert(await until(() => sendOf('c1')[0]?.media?.[0]?.file && sendOf('c1')[0].media[1]?.file && sendOf('c2')[0]?.media?.[0]?.file), 'after the reload the uploads finish: card 1’s picture and video, card 2’s picture');
  assert(
    states.slice(sentAt).every((x) => x.cards?.length === 2) && sendOf('c1')[0].id === s1.id && sendOf('c2')[0].id === s2.id,
    'every state the room got since the reload holds both cards, under the same ids (the room never takes them off the phones)',
  );
  // (A response's body is read after the room's state may already have its id.)
  await answered(3);
  const ok = answers.filter((a) => a.status === 200);
  assert(uploads.length - before === 3 && ok.length === 3, `three uploads after the reload, and nothing for card 3 (${uploads.length - before} uploads, ${ok.length} taken)`);
  const pic1 = sendOf('c1')[0].media[0].file;
  const vid1 = sendOf('c1')[0].media[1].file;
  const pic2 = sendOf('c2')[0].media[0].file;
  assert(ok.map((a) => a.id).join() === [pic1, vid1, pic2].join(), 'in the order they sit on the cards, each under the id the room gave it');
  assert(await until(() => viewOf('bob').cards?.list?.[0]?.media?.[0]?.mime === 'image/webp'), 'the room tells the phone the picture is the WebP that went up');
  assert(!(await cat2.locator('.card').count()) && viewOf('cat2').cards?.late === 1 && (await cat2.locator('#cards-late').isVisible()), 'the phone that came late is still late after the host’s reload: no card');
  assert((await fetchAs(cat2, pic2)) === 404, 'and the room won’t give it the card’s picture');
  assert(await until(async () => (await textOf(row(2).locator('[data-card-state]'))).includes(lateRow)), 'the host’s row says so again after the reload');

  // Bob's card stayed open; it fills in: the picture shrunk to 1600 px, the video playing muted, the YouTube player on a tap.
  assert((await bob.getByText(WORDS1).isVisible()) && !(await cover.isVisible()), 'Bob’s card stayed open through the host’s reload');
  await bob.waitForFunction(() => {
    const img = document.querySelector('.card img');
    return !!img && img.src.startsWith('blob:') && img.complete && img.naturalWidth === 1600;
  });
  assert((await bob.locator('.card img').getAttribute('alt')) === 'Picture', 'Bob’s card: the picture arrives, 1600 px wide (shrunk from 3000), from a blob: address');
  const vid = bob.locator('.card video');
  assert(await until(() => vid.evaluate((v) => !v.paused && v.currentTime > 0 && v.muted && v.src.startsWith('blob:'))), 'the video file plays as it arrives in the open card, muted, from a blob: address');
  await bob.getByRole('button', { name: /YouTube video/ }).tap();
  const frame = bob.locator('.card iframe');
  await frame.waitFor();
  assert((await frame.getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'the YouTube clip plays in YouTube’s player once tapped');
  assert(!(await bob.locator('body').innerText()).includes('zfnqj'), 'and no file name on the phone');
  await bob.screenshot({ path: 'test-results/partnersend-card.png' });
  assert((await shownOf(host, SECRETS)).length === 0, 'the host page in one window holds no card’s words, file names or link');

  // ---------- ↻ Send again reaches the late phone ----------
  await row(2).getByRole('button', { name: 'Send card 2 again' }).click();
  await cat2.getByRole('button', { name: 'Tap to see' }).waitFor();
  const again = sendOf('c2');
  assert(again.length === 1 && again[0].id !== s2.id && JSON.stringify(again[0].to) === JSON.stringify([{ seat: seat.Cat }]) && sendOf('c1')[0].id === s1.id, '↻ Send again: card 2 under a new id, to Cat’s seat (card 1 keeps its id)');
  assert(await until(async () => (await cat2.locator('.card img').count()) === 1), 'the new phone gets it, picture and all');
  assert((await fetchAs(cat2, pic2)) === 200 && !(await cat2.locator('#cards-late').isVisible()), 'it can fetch the picture now, and the note is gone');
  assert(await until(async () => !(await textOf(row(2).locator('[data-card-state]'))).includes('hasn’t got it')), 'and so is the row’s warning');

  // ---------- No phone can fetch a file of a card it wasn't sent ----------
  assert((await fetchAs(bob, pic2)) === 404 && (await fetchAs(cat2, pic1)) === 404 && (await fetchAs(cat2, vid1)) === 404 && (await fetchAs(bob, pic1)) === 200 && (await fetchAs(bob, vid1)) === 200, 'Bob can’t fetch card 2’s picture, nor Cat card 1’s files; each can fetch their own');
  assert((await fetchAs(ann, pic1)) === 404 && (await fetchAs(ann, pic2)) === 404 && (await fetchAs(dan, vid1)) === 404 && (await fetchAs(cat, pic2, catToken)) === 404, 'Ann, Dan and Cat’s old phone (with the token it had) can fetch none');

  // ---------- 📤 Send changes: Dan added, then Bob taken off ----------
  await chip('Card 1 to Dan').click();
  await row(1).getByText('changed:').waitFor();
  assert(!(await dan.locator('.card').count()), 'a chip alone sends nothing (the row reads “changed:”)');
  await row(1).getByRole('button', { name: 'Send card 1’s changes' }).click();
  await dan.getByRole('button', { name: 'Tap to see' }).waitFor();
  const changed = sendOf('c1');
  const toDan = changed.find((c) => c.to.some((t) => t.seat === seat.Dan));
  assert(changed.length === 2 && changed.some((c) => c.id === s1.id && c.to.length === 1 && c.to[0].seat === seat.Bob) && toDan && toDan.id !== s1.id && toDan.to.length === 1, '📤 Send changes: Dan gets card 1 under a new id, Bob keeps his');
  assert(await bob.getByText(WORDS1).isVisible(), 'Bob’s card stays as it was (open)');
  await chip('Card 1 to Bob').click();
  await row(1).getByRole('button', { name: 'Send card 1’s changes' }).click();
  await bob.locator('.card').waitFor({ state: 'detached' });
  assert(sendOf('c1').length === 1 && sendOf('c1')[0].id === toDan.id && (await dan.locator('.card').count()) === 1, 'Bob taken off: card 1 goes from his phone, and Dan’s keeps its id');
  assert(await until(async () => (await fetchAs(bob, pic1)) === 404), 'Bob can’t fetch its picture any more');
  assert((await fetchAs(dan, pic1)) === 200, 'Dan can');

  // ---------- ⇡ Get it ready (card 3), cut off by a reload ----------
  assert(uploads.length === before + 3, 'nothing else went up meanwhile');
  const files3 = panel.locator('[data-partner-files]');
  assert((await files3.innerText()).includes('1 picture goes up when you send'), 'the panel counts card 3’s picture (never names it)');
  held.length = 0;
  holding = true;
  await files3.getByRole('button', { name: '⇡ Get it ready now' }).click();
  assert(await until(() => held.length === 1), '⇡ Get it ready: card 3’s picture starts up');
  // (The game in progress is saved a moment after a change: a reload before that wouldn't know card 3 was got ready.
  // Waited for while the upload is still held, so the reload still cuts it off.)
  const readySaved = () =>
    host.evaluate(
      () =>
        new Promise((ok) => {
          const q = indexedDB.open('keyval-store');
          q.onerror = () => ok(false);
          q.onsuccess = () => {
            const g = q.result.transaction('keyval').objectStore('keyval').get('playSession');
            g.onerror = () => ok(false);
            g.onsuccess = () => {
              q.result.close();
              ok(!!g.result?.session?.partner?.ready?.length);
            };
          };
        }),
    );
  assert(await until(readySaved), '⇡ Get it ready is kept with the game in progress');
  holding = false;
  await resume();
  // (The picture is shrunk again and goes up to wrangler dev: a slow CI machine takes a while.)
  const readied = await until(async () => (await textOf(panel.locator('[data-partner-files]'))).includes('ready in the buzzer room'), 45000);
  assert(readied, `after the reload it finishes: “ready in the buzzer room” (the panel says “${await textOf(panel.locator('[data-partner-files]'))}”)`);
  await answered(4);
  const ready = answers.filter((a) => a.status === 200).at(-1).id;
  assert(uploads.length === before + 5 && ![pic1, vid1, pic2].includes(ready), `one upload more (card 3’s picture, the cut-off one again) (${uploads.length - before} uploads)`);
  await sleep(500);
  assert(!sendOf('c3').length && !JSON.stringify(states).includes(WORDS3), 'got ready: card 3 is in no state');
  for (const [p, name] of [[ann, 'Ann'], [bob, 'Bob'], [cat2, 'Cat'], [dan, 'Dan']]) assert((await fetchAs(p, ready)) === 404, `${name} can’t fetch a file that was only got ready`);

  // ---------- A row's 📤 Send: card 3, got ready, to Ann ----------
  await chip('Card 3 to Ann').click();
  n = states.length;
  await row(3).getByRole('button', { name: 'Send card 3' }).click();
  await ann.getByRole('button', { name: 'Tap to see' }).waitFor();
  const s3 = sendOf('c3');
  assert(s3.length === 1 && JSON.stringify(s3[0].to) === JSON.stringify([{ seat: seat.Ann }]) && s3[0].media?.[0]?.file === ready, '📤 Send on its row: card 3 to Ann, with the picture that was got ready');
  assert(states.slice(n).every((x) => !(x.cards ?? []).some((c) => c.id.split(':')[2] === 'c3' && c.media?.[0]?.pending)), 'its picture was in the room already: it never shows as coming');
  await ann.getByRole('button', { name: 'Tap to see' }).tap();
  await ann.getByText(WORDS3).waitFor();
  assert(await until(async () => (await ann.locator('.card img[src^="blob:"]').count()) === 1), 'Ann opens it: its words and its picture');
  assert(uploads.length === before + 5 && (await fetchAs(ann, ready)) === 200 && (await fetchAs(dan, ready)) === 404, 'nothing went up again; Ann can fetch the picture now, Dan still can’t');

  // ---------- ✖ Take back card 2 ----------
  await row(2).getByRole('button', { name: 'Take card 2 back' }).click();
  await cat2.locator('.card').waitFor({ state: 'detached' });
  assert(!sendOf('c2').length && (await fetchAs(cat2, pic2)) === 404, '✖ Take back: card 2 goes from Cat’s phone, and its picture with it');
  assert((await shownOf(host, SECRETS)).length === 0, 'the host page in one window still holds no card’s words, file names or link');

  // ---------- Judged, the answer, back to the board ----------
  await panel.getByRole('button', { name: /✔ Got it/ }).click();
  await panel.locator('[data-judged]').waitFor();
  await host.keyboard.press('r');
  assert(await until(() => sends().length === 2 && sends().every((c) => c.open === false)), 'the answer up: Dan’s and Ann’s cards stay, marked open: false');
  await host.keyboard.press('Escape');
  assert(await until(() => !last()?.cards), 'back on the board: no card in the room’s state');
  assert(await until(async () => !(await dan.locator('.card').count()) && !(await ann.locator('.card').count())), 'and Dan’s and Ann’s phones drop them');
  assert((await shownOf(host, SECRETS)).length === 0, 'the host page in one window held no card’s words, file names or link, through the whole clue');

  // ---------- More GIFs than the room holds, and one too big for the buzzer server ----------
  console.log('Over the caps:');
  const [aud2] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud2, 'audience 2');
  await aud2.locator('.board').waitFor();
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $400"]').click();
  await panel.getByText('Ann picked it.').waitFor();
  await host.keyboard.press('2');
  await mainButton(host).click();
  await host.locator('.stage-box [data-partner-badge]').waitFor();
  const left2 = panel.locator('[data-card-left="2"]');
  assert((await left2.innerText()) === '🖼 1 GIF won’t reach the phones (too big for the buzzer server)', 'the GIF over 3 MB, counted: “🖼 1 GIF won’t reach the phones (too big for the buzzer server)”');
  assert(await row(2).getByRole('button', { name: '📋 Copy picture' }).isVisible(), 'and its row offers 📋 Copy picture');
  const upBefore = uploads.length;
  await mainButton(host).click();
  // (About 11 MB going up, one file at a time.)
  assert(await until(() => answers.some((a) => a.status === 409 && a.read), 120000), 'sent: the room turns an upload down once it holds 10 MB');
  const turned = answers.find((a) => a.status === 409);
  assert(turned.error === 'This room holds all the card files it can: send fewer pictures and videos at once', `in plain words (“${turned.error}”)`);
  assert(uploads.length - upBefore === 6, 'six uploads (the picture and five GIFs; never the one over 3 MB)');
  await panel.locator('[data-card-left="1"]').waitFor();
  const fullLine = '🖼 1 GIF won’t reach the phones (the buzzer room holds all the files it can: ✖ take a card back, then ↻ Send again)';
  assert((await panel.locator('[data-card-left="1"]').innerText()) === fullLine, `the panel counts it, and says why: “${fullLine}”`);
  const info = host.locator('.info [data-partner-cards-info]');
  assert((await info.innerText()).includes(`📋 copy it: ${turned.error}`) && (await info.innerText()).includes('📋 copy it: too big for the buzzer server (3 MB at most)'), 'the two-window host column names them, with why');
  await row(1).getByRole('button', { name: '📋 Copy picture' }).click();
  await host.locator('.toast', { hasText: 'Card 1’s picture copied: paste it to Bob' }).waitFor();
  const copied = await host.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
  assert(copied.includes('image/png'), '📋 Copy picture puts the card’s picture on the clipboard, to paste to Bob');
  await until(async () => (await bob.getByRole('button', { name: 'Tap to see' }).count()) === 2);
  while (await bob.getByRole('button', { name: 'Tap to see' }).count()) await bob.getByRole('button', { name: 'Tap to see' }).first().tap();
  assert(await until(async () => (await bob.locator('.card img[src^="blob:"]').count()) === 5, 60000), 'Bob’s phone shows the picture and the four GIFs that went up');
  assert((await bob.getByText('🖼 The host will show you this picture').count()) === 2, 'and “🖼 The host will show you this picture” for the one turned down and the one too big');
  await offStream(aud2, 'the audience window', 'the GIFs');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner cards sent to phones E2E passed.');
} catch (e) {
  for (const [label, p] of pages) await p.screenshot({ path: `test-results/partnersend-${label.replace(/\s/g, '')}-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
