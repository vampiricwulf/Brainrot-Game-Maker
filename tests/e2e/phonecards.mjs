// The phone's private cards, end to end (docs/PARTNER-CLUES-SPEC.md §8.2, §12.3, §13.5, §14.6, §16): the buzzer room
// (buzzer/) under `wrangler dev` (local), a fake host on a plain WebSocket, and phones in Chromium on the real phone
// page. Every phone's button greys while nobody buzzes; a card sent to one phone takes its button's place behind
// "Tap to see", with its words, a picture fetched from the room with the phone's own token in a header (shown from a
// blob: address), a picture from a link, a video file playing muted and inline, a YouTube player framed only when
// tapped (no-cookie, sandboxed, with the referrer YouTube needs), "Picture coming…" filling in, and plain lines for what
// won't come. The room hears it was seen. Hide covers it again; the card going takes it all down. Also: the content
// policy, a phone seated too late, the guesser's box, a GIF held still for reduced motion, and on a computer a Space
// press that began before a card came doesn't open it. An open card sent again (a new id) stays open as it was (its
// player still framed), and its lines change in place; a card that comes while the buzzers are open goes under BUZZ!
// (on a touch screen straight under it; Tab going in the order they're drawn), and one left open closes as the next
// clue starts; a tap landing just as a cover comes doesn't open it; opened at the end of a page that scrolls, its words
// stay in sight; on its side, the cards keep room for Tap to see under a long clue with BUZZ! where it was, the
// guesser's box stays below the header and in place, an open card scrolls in its own place beside it, and a late
// phone's note keeps no room; in a laptop's taller window a box beside a card stays put as it opens. Needs `npm ci` in
// buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { png } from './helpers.mjs';

const dir = resolve('buzzer');
if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await freePort();
const inspector = await freePort();
const persist = mkdtempSync(join(tmpdir(), 'buzzer-cards-'));
const base = `http://127.0.0.1:${port}`;
let log = '';
const wrangler = spawn(
  join(dir, 'node_modules/.bin/wrangler'),
  ['dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', persist, '--log-level', 'warn'],
  { cwd: dir, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } },
);
wrangler.stdout.on('data', (d) => (log += d));
wrangler.stderr.on('data', (d) => (log += d));
const stopWrangler = () => {
  try {
    process.kill(-wrangler.pid, 'SIGTERM');
  } catch {
    // already gone
  }
};
process.on('exit', stopWrangler);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/** The fake host: a WebSocket, everything it received, and a way to wait for a message. */
async function connectHost(code, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${code}?host=${encodeURIComponent(token)}`);
  const got = [];
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)));
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => fail(new Error('host socket failed')), { once: true });
  });
  return { got, send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
}

/** Waits (up to 8 s) until pred() holds. */
const until = async (pred, what) => {
  for (let i = 0; ; i++) {
    if (await pred()) return;
    if (i > 160) throw new Error('never: ' + what);
    await sleep(50);
  }
};

// A 1×1 GIF.
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const PLAYER = '<!doctype html><title>player</title><p>a player</p>';

let browser;
const errors = [];
const pages = [];
mkdirSync('test-results', { recursive: true });
// (Not full page: in Chromium that drops a phone's touch emulation, and the page turns into a laptop's.)
const shot = (p, name) => p.screenshot({ path: `test-results/phonecards-${name}.png`, animations: 'disabled' });
try {
  for (let i = 0; ; i++) {
    if (wrangler.exitCode !== null) throw new Error('wrangler dev exited:\n' + log);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 120) throw new Error('wrangler dev never came up:\n' + log);
    await sleep(500);
  }
  const room = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.40' } })).json();
  const h = await connectHost(room.code, room.hostToken);
  await until(() => h.got.some((m) => m.t === 'welcome'), 'the welcome');
  const seats = [
    { id: 'a', name: 'Ann', color: '#e5484d' },
    { id: 'b', name: 'Bob', color: '#30a46c' },
    { id: 'c', name: 'Cat', color: '#3d68ea' },
  ];
  let hs = { title: 'Cards', seats, allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 0, scores: { a: 200, b: 100 } };
  const hostState = (patch) => h.send({ t: 'state', state: (hs = { ...hs, ...patch }) });
  hostState({});
  const upload = async (body, type) => {
    const r = await fetch(`${base}/api/rooms/${room.code}/files`, { method: 'POST', headers: { 'Content-Type': type, Authorization: `Bearer ${room.hostToken}` }, body });
    if (r.status !== 200) throw new Error(`upload: HTTP ${r.status} ${await r.text()}`);
    return (await r.json()).id;
  };

  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=user-gesture-required'] });
  /** A phone (or, `desk`, a laptop with a mouse) on seat `name`, with the media sites the cards use answered locally. */
  const phone = async (label, name, opts = {}) => {
    const ctx = await browser.newContext(
      opts.desk ? { viewport: { width: 1280, height: 800 }, reducedMotion: opts.reducedMotion } : { viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true, reducedMotion: opts.reducedMotion },
    );
    await ctx.route('https://img.test/**', (r) => r.fulfill({ body: png(240, 180, 40, 160, 90), contentType: 'image/png' }));
    await ctx.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ body: PLAYER, contentType: 'text/html' }));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
    pages.push([label, p]);
    /** Every card file the page asked for: its address and whether its token went in a header. */
    p.fileGets = [];
    p.on('request', (r) => /\/files\//.test(new URL(r.url()).pathname) && p.fileGets.push({ url: r.url(), auth: r.headers().authorization ?? '' }));
    await p.goto(`${base}/${room.code}`);
    await p.getByRole('button', { name, exact: true }).click();
    await p.locator('#me').getByText(name).waitFor();
    return p;
  };
  const ann = await phone('ann', 'Ann', { reducedMotion: 'reduce' });
  const bob = await phone('bob', 'Bob');
  const cat = await phone('cat', 'Cat', { desk: true });
  const big = (p) => p.locator('#buzz-big');
  const small = (p) => p.locator('#buzz-small');

  // ---------- Nobody buzzes: every button greyed, with who plays which part ----------
  const parts = { text: '🤝 Bob describes → Ann guesses', off: true, sub: 'Nobody buzzes on this one', seats: ['a'], seatsText: '🎯 You’re guessing!', seatsSub: 'Bob is describing: say it out loud' };
  hostState({ status: parts });
  await big(bob).getByText(parts.text).waitFor();
  assert((await small(bob).innerText()) === parts.sub && (await bob.locator('#buzz').getAttribute('class')) === 'off', 'a greyed button: who plays which part as its big line, what’s going on under it');
  assert((await bob.locator('#buzz').getAttribute('aria-disabled')) === 'true' && (await bob.locator('#buzz').getAttribute('aria-label')).startsWith(parts.text), 'disabled to a screen reader too, its big line read as its name');
  assert((await big(ann).innerText()) === '🎯 You’re guessing!' && (await small(ann).innerText()) === parts.sub.replace(parts.sub, parts.seatsSub), 'the guesser’s phone says what’s theirs');
  assert(!(await cat.locator('#keys').isVisible()), 'a laptop doesn’t offer Space to buzz while nobody buzzes');
  const sent = h.got.length;
  // (Disabled to a screen reader, so Playwright won't tap it unless made to.)
  await bob.locator('#buzz').tap({ force: true });
  await sleep(300);
  assert(!h.got.slice(sent).some((m) => m.t === 'buzz' || m.t === 'buzzed'), 'a tap on it does nothing');
  await shot(bob, 'greyed');

  // ---------- A card for Bob ----------
  const pic = await upload(png(30, 160, 90, 320, 200), 'image/png');
  const clip = Buffer.from(
    await bob.evaluate(async () => {
      // A second of WebM from a canvas: a real video file the phone can play.
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
  const vid = await upload(clip, 'video/webm');
  const card = {
    id: 'pc:c1:1:1',
    to: [{ seat: 'b' }],
    open: true,
    role: 'Describer',
    hint: 'Describe it to Ann: don’t say what’s on it!',
    title: 'SHREK',
    text: 'Green ogre-zz, lives in a swamp',
    media: [
      { kind: 'image', file: pic, mime: 'image/png', name: 'The ogre' },
      { kind: 'image', url: 'https://img.test/donkey.png' },
      { kind: 'video', file: vid, mime: 'video/webm' },
      { kind: 'embed', site: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=5' },
      { kind: 'image', pending: true },
      { kind: 'audio', missing: true },
    ],
  };
  hostState({ cards: [card] });
  const bobCard = bob.locator('.card');
  await bobCard.waitFor();
  assert((await bob.locator('#buzz').isHidden()) && (await bob.locator('#card-status-big').innerText()) === parts.text, 'the card takes the button’s place, the status line over it');
  const lines = await bobCard.innerText();
  assert(
    lines.includes('Only you can see this'.toUpperCase()) && lines.includes('You’re the Describer') && lines.includes('Describe it to Ann') && !lines.includes('ogre-zz') && !lines.includes('SHREK'),
    'its part and hint show; its words wait behind the cover',
  );
  const cover = bob.getByRole('button', { name: 'Tap to see' });
  assert(await cover.evaluate((el) => el === document.activeElement), 'the keys (and a screen reader) go to Tap to see as it comes');
  assert((await bob.locator('#news').innerText()) === 'A card only you can see' && !(await bob.locator('#live').innerText()).includes('card'), 'its arrival is said once: “A card only you can see”');
  assert(!h.got.some((m) => m.t === 'cardSeen'), 'the room isn’t told it was seen before the tap');
  for (const [p, who] of [[ann, 'Ann'], [cat, 'Cat']]) assert(!(await p.locator('.card').count()) && !(await p.locator('body').innerText()).includes('ogre-zz'), `${who}’s phone gets nothing of it`);
  await until(() => bob.fileGets.length >= 2, 'the files are fetched');
  const token = await bob.evaluate((code) => JSON.parse(localStorage.getItem(`brainrot-buzzer:${code}`)).token, room.code);
  assert(
    bob.fileGets.every((g) => g.auth === `Bearer ${token}` && !g.url.includes(token)) && bob.fileGets.some((g) => g.url.endsWith(pic)) && bob.fileGets.some((g) => g.url.endsWith(vid)),
    'its files are fetched with the phone’s own token in a header, never in the address',
  );
  await shot(bob, 'covered');

  await cover.tap();
  await bob.getByText('Green ogre-zz, lives in a swamp').waitFor();
  assert((await bob.locator('.card-title').innerText()) === 'SHREK' && (await bob.locator('.card-title').getAttribute('class')).includes('huge'), 'Tap to see: its title, huge, and its words');
  assert(await bob.locator('.card-title').evaluate((el) => el === document.activeElement), 'the keys go to its words as it opens');
  await until(() => h.got.some((m) => m.t === 'cardSeen' && m.id === card.id && m.seatId === 'b'), 'cardSeen');
  assert(true, 'the room tells the host Bob saw it');
  const own = bob.getByRole('img', { name: 'The ogre' });
  await until(() => own.evaluate((img) => img.complete && img.naturalWidth === 320), 'the picture file shows');
  assert((await own.getAttribute('src')).startsWith('blob:'), 'the picture file shows from a blob: address, named for a screen reader');
  const linked = bob.locator('img[src="https://img.test/donkey.png"]');
  await until(() => linked.evaluate((img) => img.complete && img.naturalWidth > 0), 'the linked picture shows');
  assert((await linked.getAttribute('referrerpolicy')) === 'no-referrer' && (await linked.getAttribute('alt')) === 'Picture', 'a picture from a link loads from there, with no referrer');
  const video = bob.locator('.card video');
  await until(() => video.evaluate((v) => !v.paused && v.currentTime > 0), 'the video plays');
  assert(
    await video.evaluate((v) => v.muted && v.playsInline && v.controls && v.src.startsWith('blob:')),
    'the video file plays muted and inline, with controls (from a blob: address)',
  );
  await bob.getByRole('button', { name: '🔊 Tap for sound' }).tap();
  assert(await video.evaluate((v) => !v.muted), '🔊 Tap for sound turns its sound on');
  assert(!(await bob.locator('.card iframe').count()), 'the YouTube player isn’t framed until it’s tapped');
  await bob.getByRole('button', { name: /YouTube video/ }).tap();
  const frame = bob.locator('.card iframe');
  await frame.waitFor();
  const fa = await frame.evaluate((f) => ({ src: f.src, sandbox: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy'), allow: f.getAttribute('allow'), title: f.title }));
  assert(
    fa.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&autoplay=1&start=5' &&
      fa.sandbox === 'allow-scripts allow-same-origin allow-presentation' &&
      fa.ref === 'strict-origin-when-cross-origin' &&
      fa.allow.includes('autoplay') &&
      fa.allow.includes('fullscreen') &&
      fa.title === 'YouTube video',
    `tapped: YouTube’s no-cookie player from the link’s time, sandboxed, with the referrer YouTube needs${fa.ref ? '' : JSON.stringify(fa)}`,
  );
  await until(async () => (await bob.frames()).some((f) => f.url().startsWith('https://www.youtube-nocookie.com/') && f.url() !== 'about:blank'), 'the player loads');
  assert(
    (await bobCard.innerText()).includes('🖼 Picture coming…') && (await bobCard.innerText()).includes('🔊 The host will show you this sound'),
    'a file on its way says “🖼 Picture coming…”; one that won’t come, “the host will show you”',
  );
  await shot(bob, 'open');

  // The file on its way arrives: it fills in (said, as the card is open).
  const later = await upload(png(200, 60, 160, 200, 120), 'image/png');
  hostState({ cards: [{ ...card, media: card.media.map((m) => ('pending' in m ? { kind: 'image', file: later, mime: 'image/png' } : m)) }] });
  await until(() => bob.locator('.card img[src^="blob:"]').count().then((n) => n === 2), 'the second file fills in');
  assert(!(await bobCard.innerText()).includes('Picture coming…') && (await bob.locator('#news').innerText()) === 'Your picture is here', 'the picture on its way fills in, and that’s said');
  assert((await frame.count()) === 1 && (await video.evaluate((v) => !v.paused)), 'the rest of the card isn’t drawn again (the player and the video carry on)');

  // CSP: a frame from anywhere else is refused.
  const refused = await bob.evaluate(
    () =>
      new Promise((ok) => {
        document.addEventListener('securitypolicyviolation', (e) => ok(e.violatedDirective), { once: true });
        const f = document.createElement('iframe');
        f.src = 'https://example.com/';
        document.body.append(f);
        setTimeout(() => ok('none'), 3000);
      }).then((d) => {
        document.querySelector('body > iframe')?.remove();
        return d;
      }),
  );
  assert(refused === 'frame-src', 'the page’s content policy refuses a frame from another site');

  // Hide: covered again, the player taken down.
  await bob.getByRole('button', { name: '🙈 Hide' }).tap();
  const hid = [await cover.isVisible(), !(await bob.getByText('Green ogre-zz').isVisible()), !(await frame.count()), await video.evaluate((v) => v.paused)];
  assert(hid.every(Boolean), `🙈 Hide covers it again, stops the video and takes the player down${hid.every(Boolean) ? '' : ` (${hid})`}`);
  assert(h.got.filter((m) => m.t === 'cardSeen').length === 1, 'seen is told once');

  // ---------- Revealed: the card stays, marked ----------
  hostState({ cards: [{ ...card, open: false }], status: { text: '🤝 Bob described → Ann guessed', off: true } });
  await bob.locator('.card-shown').getByText('The answer’s on screen').waitFor();
  assert((await bob.locator('#card-status-big').innerText()) === '🤝 Bob described → Ann guessed', 'the answer up: the card stays, marked “The answer’s on screen”');

  // ---------- The card goes ----------
  // (Covered: hidden, so read straight from the page.)
  const blob = await bob.locator('img[alt="The ogre"]').getAttribute('src');
  hostState({ cards: null, status: parts });
  await bobCard.waitFor({ state: 'detached' });
  assert(await bob.locator('#buzz').isVisible(), 'the card goes, and the greyed button is back');
  assert(await bob.evaluate((u) => fetch(u).then(() => false, () => true), blob), 'its blob: addresses are let go');

  // ---------- The guesser: a hint card over her box, a GIF held still (she asked for less motion) ----------
  const gif = await upload(GIF, 'image/gif');
  const hint = { id: 'pc:c1:2:2', to: [{ seat: 'a' }], open: true, role: 'Guesser', text: 'A hint', media: [{ kind: 'image', file: gif, mime: 'image/gif', name: 'Dance' }] };
  hostState({ cards: [hint], answers: { id: 'c1', open: true, seats: [{ id: 'a' }] }, clue: { text: 'Describe this movie' }, status: { ...parts, seatsSub: 'Bob is describing: type your guess' } });
  await ann.getByLabel(/Your answer/).waitFor();
  await ann.locator('.card').waitFor();
  assert(
    (await ann.locator('#answer-head').innerText()) === '🎯 You’re guessing!' && (await ann.locator('#answer-sub').innerText()) === 'Bob is describing: type your guess',
    'the guesser’s box says what’s theirs over it',
  );
  const order = await ann.evaluate(() => document.getElementById('cards').compareDocumentPosition(document.getElementById('answer-form')) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert(!!order && (await ann.getByLabel(/Your answer/).evaluate((el) => el === document.activeElement || document.activeElement === document.body)), 'a card sits above the box, and doesn’t take its keys');
  await ann.getByRole('button', { name: 'Tap to see' }).tap();
  await ann.locator('.card canvas[role="img"][aria-label="Dance"]').waitFor();
  assert((await ann.locator('.card img').isHidden()) && (await ann.getByRole('button', { name: '▶ Play Dance' }).isVisible()), 'with reduced motion, a GIF shows still with ▶ Play');
  await ann.getByRole('button', { name: '▶ Play Dance' }).tap();
  assert(await ann.locator('.card img').isVisible(), '▶ Play shows it moving');
  await shot(ann, 'guesser');

  // ---------- A laptop: a Space press that began before a card came doesn't open it ----------
  await cat.locator('body').click({ position: { x: 5, y: 300 } });
  await cat.keyboard.down(' ');
  hostState({ cards: [hint, { id: 'pc:c1:3:3', to: [{ seat: 'c' }], open: true, role: 'Describer', text: 'Laptop-qq words' }], answers: null, clue: null });
  await cat.locator('.card').waitFor();
  const click = cat.getByRole('button', { name: 'Click to see' });
  await sleep(300);
  await until(() => click.evaluate((el) => el === document.activeElement), 'the keys go to Click to see');
  await cat.keyboard.up(' ');
  await sleep(200);
  assert(!(await cat.getByText('Laptop-qq words').isVisible()), 'on a laptop, Space held down as a card came doesn’t open it');
  await cat.keyboard.press(' ');
  await cat.getByText('Laptop-qq words').waitFor();
  assert(true, 'a Space press on Click to see does');
  assert((await cat.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) && (await cat.locator('#cards').boundingBox()).x > 500, 'side by side on a laptop: the card on the right, nothing wider than the window');
  await shot(cat, 'laptop');
  await bob.setViewportSize({ width: 760, height: 390 });
  hostState({ cards: [{ ...card, id: 'pc:c1:1:4' }] });
  await bob.locator('.card').waitFor();
  assert(await bob.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'a phone on its side: nothing wider than the screen');
  await shot(bob, 'landscape');
  await bob.setViewportSize({ width: 390, height: 760 });

  // ---------- ↻ Send again (the same card, a new id), and who else can see it changing: an open card stays as it is ----------
  await bob.getByRole('button', { name: 'Tap to see' }).tap();
  await until(() => h.got.some((m) => m.t === 'cardSeen' && m.id === 'pc:c1:1:4'), 'cardSeen for the card');
  // (Its YouTube player framed, its video's sound on.)
  await bob.getByRole('button', { name: /YouTube video/ }).tap();
  await bob.locator('.card iframe').waitFor();
  await bob.getByRole('button', { name: '🔊 Tap for sound' }).tap();
  const [player, clip2] = [await bob.locator('.card iframe').elementHandle(), await bob.locator('.card video').elementHandle()];
  await bob.evaluate(() => {
    window.buzzes = [];
    navigator.vibrate = (p) => (window.buzzes.push(p), true);
  });
  hostState({ cards: [{ ...card, id: 'pc:c1:1:5' }] });
  await until(() => h.got.some((m) => m.t === 'cardSeen' && m.id === 'pc:c1:1:5'), 'cardSeen for the card sent again');
  assert(
    (await bob.getByText('Green ogre-zz, lives in a swamp').isVisible()) && !(await bob.getByRole('button', { name: 'Tap to see' }).isVisible()) && !(await bob.evaluate(() => window.buzzes.length)),
    '↻ Send again: a phone that had the card open keeps it open, doesn’t buzz again, and the room hears it was seen',
  );
  assert(
    (await player.evaluate((f) => f.isConnected)) && (await clip2.evaluate((v) => v.isConnected && !v.muted && !!v.src)),
    'as it was: its YouTube player still framed, its video still there with its sound on',
  );
  hostState({ cards: [{ ...card, id: 'pc:c1:1:5', shared: true, hint: 'Describe it to Ann and Cat: don’t say what’s on it!' }] });
  await until(() => bob.locator('.card-head').textContent().then((t) => t.includes('and the others the host chose')), 'the card says others can see it');
  assert(
    (await player.evaluate((f) => f.isConnected)) && (await bob.locator('.card-hint').textContent()) === 'Describe it to Ann and Cat: don’t say what’s on it!' && (await bob.getByText('Green ogre-zz').isVisible()),
    'who else can see it, or its hint, changing: those lines change in place (an open player carries on)',
  );
  // 🙈 Hide, under its new id: it stays covered as it's drawn again.
  await bob.getByRole('button', { name: '🙈 Hide' }).tap();
  hostState({ cards: [{ ...card, id: 'pc:c1:1:5', shared: true }] });
  await until(() => bob.locator('.card-hint').textContent().then((t) => t === card.hint), 'its hint back');
  assert(
    (await bob.getByRole('button', { name: 'Tap to see' }).isVisible()) && !(await bob.getByText('Green ogre-zz').isVisible()),
    'hidden after it came again, it stays covered as the page is drawn again',
  );

  // ---------- A card that comes while the buzzers are open goes under BUZZ!, not over it ----------
  hostState({ phase: 'armed', armId: 1, clue: { text: 'This planet is known as the Red Planet' }, status: undefined });
  await ann.locator('#buzz.armed').waitFor();
  const was = await ann.locator('#buzz').boundingBox();
  const spy = { id: 'pc:x:1:1', to: [{ seat: 'a' }], open: true, title: 'Spy-qz', text: 'Blend in', media: [{ kind: 'image', url: 'https://img.test/spy.png' }] };
  // (And one for the laptop, in a window too narrow for side by side.)
  await cat.setViewportSize({ width: 700, height: 1000 });
  await cat.locator('#buzz.armed').waitFor();
  const catCard = { id: 'pc:x:2:1', to: [{ seat: 'c' }], open: true, title: 'Laptop-spy-qz', text: 'Blend in' };
  hostState({ cards: [...hs.cards, spy, catCard] });
  await ann.locator('.card').waitFor();
  const [now, under] = [await ann.locator('#buzz').boundingBox(), await ann.locator('.card').boundingBox()];
  const before = h.got.length;
  // (Where the finger was going as the card came.)
  await ann.touchscreen.tap(was.x + was.width / 2, was.y + 40);
  await until(() => h.got.slice(before).some((m) => m.t === 'buzz' && m.seatId === 'a'), 'Ann’s buzz');
  assert(
    under.y >= now.y + now.height && now.y <= was.y + 40 && !(await ann.getByText('Spy-qz').isVisible()) && !h.got.some((m) => m.t === 'cardSeen' && m.id === spy.id),
    'a card that comes with the buzzers open goes under BUZZ!: a tap where it was still buzzes, and the card stays covered',
  );
  assert(
    await ann.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#buzz'), [was.x + was.width / 2, was.y + was.height / 2]),
    'and where the middle of the button was is still BUZZ!',
  );
  // (Its lower edge: the card, whose cover ignores a tap just as it comes, not Not you? or the name under BUZZ!.)
  const low = await ann.evaluate(
    ([x, y]) =>
      [12, 30, 50].map((dy) => {
        const e = document.elementFromPoint(x, y - dy);
        return e?.closest('#buzz') ? 'BUZZ!' : e?.closest('.card') ? 'card' : (e?.id ?? '');
      }),
    [was.x + was.width / 2, was.y + was.height],
  );
  assert(
    low.every((e) => e === 'BUZZ!' || e === 'card'),
    `on a touch screen the card goes straight under BUZZ!, the name under it: where its lower edge was is BUZZ! or the card (${low})`,
  );
  // On a laptop: the key hint stays under the button, the card under that, and Tab goes in that order.
  await cat.locator('.card').waitFor();
  const [catKeys, catCards] = [await cat.locator('#keys').boundingBox(), await cat.locator('#cards').boundingBox()];
  await cat.locator('#buzz').focus();
  const tabs = [];
  for (let i = 0; i < 2; i++) {
    await cat.keyboard.press('Tab');
    tabs.push(await cat.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
  }
  assert(
    !!catKeys && catKeys.y + catKeys.height <= catCards.y && tabs[0] === 'Not you? Change player' && tabs[1] === 'Click to see',
    `a narrow laptop window: the key hint stays under BUZZ!, the card below the name, and Tab goes BUZZ! → Not you? → the card (${tabs.join(' → ')})`,
  );
  await cat.setViewportSize({ width: 1280, height: 800 });
  // On its side with a long clue: the clue scrolls in less room, and the card under it keeps room for its Tap to see.
  await ann.setViewportSize({ width: 740, height: 340 });
  hostState({ clue: { text: 'This planet, fourth from the Sun, is known as the Red Planet for the rusty dust on its face. '.repeat(6) + 'Name it.' } });
  await until(() => ann.locator('#clue').textContent().then((t) => t.endsWith('Name it.')), 'the long clue');
  await until(() => ann.evaluate(() => getComputedStyle(document.getElementById('s-buzz')).display === 'grid'), 'side by side');
  const tall = await ann.evaluate(() => {
    const [cards, cover] = [document.getElementById('cards'), document.querySelector('.card-cover')];
    const [r, c] = [cards.getBoundingClientRect(), cover.getBoundingClientRect()];
    return { h: cards.clientHeight, label: (c.top + c.bottom) / 2 < r.bottom - 10 };
  });
  assert(tall.h >= 132 && tall.label, `on its side under a long clue, the card keeps room for its Tap to see (${JSON.stringify(tall)})`);
  // (BUZZ! where it is with no card: the middle of the screen under the header, not of the rows beside it, which run on.)
  await ann.evaluate(() => scrollTo(0, 0));
  const off = await ann.evaluate(() => {
    const [b, h] = [document.getElementById('buzz').getBoundingClientRect(), document.querySelector('header').getBoundingClientRect()];
    return Math.round((b.top + b.bottom) / 2 - (h.bottom + innerHeight) / 2);
  });
  assert(Math.abs(off) <= 2, `and BUZZ! stays where it was, in the middle of the screen under the header (${off}px off)`);
  await ann.setViewportSize({ width: 390, height: 760 });
  // Opened in the buzzer's place, it closes again as the next clue's buzzers open (the clue in sight, the keys on BUZZ!).
  hostState({ phase: 'lobby', clue: null });
  await ann.locator('#s-buzz.cards-up').waitFor();
  await ann.getByRole('button', { name: 'Tap to see' }).tap();
  await ann.getByText('Spy-qz').waitFor();
  hostState({ phase: 'armed', armId: 2, clue: { text: 'This planet is the largest in the solar system' } });
  await ann.locator('#buzz.armed').waitFor();
  await until(() => ann.evaluate(() => document.activeElement?.id === 'buzz'), 'the keys go to BUZZ!');
  assert(
    !(await ann.getByText('Spy-qz').isVisible()) && (await ann.getByRole('button', { name: 'Tap to see' }).isVisible()) && (await ann.locator('#clue').boundingBox()).y >= 0,
    'a card left open closes as the buzzers open for the next clue, the clue still on screen',
  );

  // ---------- The guesser typing in her box as a card comes over it: her tap doesn't open it ----------
  const guessParts = { phase: 'lobby', clue: { text: 'Describe this movie' }, answers: { id: 'c2', open: true, seats: [{ id: 'a' }] }, status: { ...parts, seatsSub: 'Bob is describing: type your guess' } };
  hostState({ ...guessParts, cards: [{ ...card, id: 'pc:c1:1:5' }] });
  await ann.getByLabel(/Your answer/).waitFor();
  await ann.locator('.card').waitFor({ state: 'detached' });
  // (Where her box was, before the card pushes it down.)
  const box = await ann.locator('#answer-form').boundingBox();
  const guess = { to: [{ seat: 'a' }], open: true, role: 'Guesser', hint: 'Bob describes it: type your guess', title: 'Hint-qz', text: 'It’s a cartoon from 2001', media: [{ kind: 'image', url: 'https://img.test/hint.png' }] };
  // The cover ignores taps for a moment as it comes. The page notes whether it still had when the tap landed: on a very
  // slow machine it may not, and the tap opens the card; then another card comes and the tap is tried again.
  let [fresh, tap] = [false, null];
  for (let i = 1; i <= 3 && !fresh; i++) {
    guess.id = `pc:c2:1:${i}`;
    if (i > 1) {
      hostState({ cards: [{ ...card, id: 'pc:c1:1:5' }] });
      await ann.locator('.card').waitFor({ state: 'detached' });
    }
    hostState({ cards: [{ ...card, id: 'pc:c1:1:5' }, guess] });
    await ann.waitForFunction(() => !!document.querySelector('.card-cover.just-in'), null, { polling: 'raf' });
    // (A finger going to the box lands on the cover now there.)
    tap = await ann.evaluate(() => {
      addEventListener('touchstart', () => (window.tapFresh = !!document.querySelector('.card-cover.just-in')), { capture: true, once: true });
      const r = document.querySelector('.card-cover').getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    await ann.touchscreen.tap(...tap);
    fresh = await ann.evaluate(() => window.tapFresh);
  }
  await ann.locator('.card-cover:not(.just-in)').waitFor({ state: 'attached' });
  const wasBox = tap[1] >= box.y && tap[1] <= box.y + box.height;
  assert(
    fresh &&
      wasBox &&
      (await ann.getByRole('button', { name: 'Tap to see' }).isVisible()) &&
      !(await ann.getByText('Hint-qz').isVisible()) &&
      !h.got.some((m) => m.t === 'cardSeen' && m.id === guess.id),
    `a card coming over the guesser’s box as she taps it: the tap lands on its cover just come, and doesn’t open it${fresh && wasBox ? '' : ` (${fresh}, ${tap}, ${JSON.stringify(box)})`}`,
  );

  // ---------- On its side: the box below the header and in place, the card's Tap to see in sight, and open, it scrolls there ----------
  await ann.setViewportSize({ width: 740, height: 340 });
  await until(() => ann.evaluate(() => getComputedStyle(document.getElementById('s-buzz')).display === 'grid'), 'side by side');
  await ann.evaluate(() => scrollTo(0, 0));
  const lay = () =>
    ann.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const c = document.querySelector('.card-cover')?.getBoundingClientRect();
      const cards = document.getElementById('cards');
      return {
        header: r('header').bottom,
        head: r('#answer-head').top,
        send: r('#answer-send').bottom,
        label: !!c && c.height > 0 && (c.top + c.bottom) / 2 < Math.min(r('#cards').bottom, innerHeight) - 10,
        inside: cards.scrollHeight > cards.clientHeight,
      };
    });
  const shut = await lay();
  assert(
    shut.head >= shut.header && shut.send <= 340 && shut.label,
    `a phone on its side: the guesser’s box below the header with Send answer on screen, and her card’s Tap to see in sight (${JSON.stringify(shut)})`,
  );
  await ann.getByRole('button', { name: 'Tap to see' }).tap();
  await ann.getByText('Hint-qz').waitFor();
  await until(() => ann.locator('.card img').evaluate((i) => i.complete && i.naturalWidth > 0), 'her card’s picture');
  await ann.evaluate(() => scrollTo(0, 0));
  const open = await lay();
  assert(
    open.inside && open.head === shut.head && open.send <= 340,
    `open, her card scrolls in its own place beside the box, which stays put with Send answer on screen (${JSON.stringify(open)})`,
  );
  await ann.setViewportSize({ width: 390, height: 760 });
  hostState({ clue: null, answers: null, status: parts, cards: [{ ...card, id: 'pc:c1:1:5' }] });
  await ann.locator('.card').waitFor({ state: 'detached' });

  // ---------- A laptop's taller window: a box barely moves as a card comes beside it, and stays put as it opens ----------
  hostState({ clue: { text: 'Describe this movie' }, answers: { id: 'c3', open: true, seats: [{ id: 'c' }] } });
  await cat.getByLabel(/Your answer/).waitFor();
  const boxTop = () => cat.locator('#answer-form').boundingBox().then((r) => Math.round(r.y));
  const tops = [await boxTop()];
  hostState({ cards: [...hs.cards, { ...guess, id: 'pc:c3:1:1', to: [{ seat: 'c' }], title: 'Laptop-hint-qz' }] });
  await cat.locator('.card').waitFor();
  tops.push(await boxTop());
  await cat.getByRole('button', { name: 'Click to see' }).click();
  await cat.getByText('Laptop-hint-qz').waitFor();
  await until(() => cat.locator('.card img').evaluate((i) => i.complete && i.naturalWidth > 0), 'her card’s picture');
  tops.push(await boxTop());
  assert(
    Math.abs(tops[0] - tops[1]) < 60 && tops[1] === tops[2],
    `a laptop’s taller window: the box beside a card barely moves as it comes, and stays put as it opens (${tops.join(' → ')})`,
  );
  hostState({ clue: null, answers: null, cards: [{ ...card, id: 'pc:c1:1:5' }] });
  await cat.locator('.card').waitFor({ state: 'detached' });

  // ---------- Opened at the end of a page that scrolls, a card's words stay in sight ----------
  // A small phone, a long hint pushing Tap to see down, the page scrolled to its end: as the card opens, the browser
  // holds what's under it still (scroll anchoring), which would throw its words off the top of the screen.
  await bob.setViewportSize({ width: 360, height: 640 });
  const long = {
    id: 'pc:c3:1:1',
    to: [{ seat: 'b' }],
    open: true,
    role: 'Describer (no talking)',
    hint: 'Describe it to Annabelle-Josephine-Maximiliana: don’t say what’s on it! '.repeat(3).slice(0, 200),
    title: 'A long secret phrase for the describer',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10),
    media: [{ kind: 'image', url: 'https://img.test/long.png' }],
  };
  hostState({ cards: [long] });
  await bob.locator(`.card[data-card="${long.id}"] .card-cover:not(.just-in)`).waitFor();
  await bob.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  assert(await bob.evaluate(() => scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 1), '(the page scrolls, and it’s at its end)');
  const at = await bob.locator('.card-cover').boundingBox();
  await bob.touchscreen.tap(at.x + at.width / 2, Math.max(at.y, 0) + 20);
  await bob.getByText('A long secret phrase for the describer').waitFor();
  // (Its top edge at the screen's: a fraction of a pixel either way.)
  const words = () => bob.locator('.card-title').boundingBox();
  await until(() => words().then((r) => !!r && r.y > -1 && r.y < 640), 'the card’s words in sight').catch(async (e) => {
    throw new Error(`${e.message}: ${JSON.stringify(await words())}, scrolled ${await bob.evaluate(() => scrollY)}`);
  });
  assert(true, 'opened at the end of a page that scrolls, the card’s words stay in sight');
  await bob.setViewportSize({ width: 390, height: 760 });

  // ---------- A phone seated after the card went out ----------
  h.send({ t: 'kick', seatId: 'b', block: false });
  await bob.getByRole('heading', { name: 'The host freed your seat' }).waitFor();
  assert(!(await bob.locator('.card').count()), 'a phone that loses its seat drops its cards');
  const dee = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true }).then((c) => c.newPage());
  dee.on('pageerror', (e) => errors.push(`[dee] ${e.message}`));
  await dee.goto(`${base}/${room.code}`);
  await dee.getByRole('button', { name: 'Bob', exact: true }).click();
  await dee.locator('#cards-late').getByText('A card went to your seat before this phone joined. Ask the host to send it again.').waitFor();
  assert(!(await dee.locator('.card').count()) && (await dee.locator('#buzz').isVisible()), 'a phone that took the seat after the card went out is told it missed one, and gets nothing of it');
  // On its side: the note takes only its own room (none kept for a card), and BUZZ! stays in the middle.
  await dee.setViewportSize({ width: 740, height: 340 });
  await until(() => dee.evaluate(() => getComputedStyle(document.getElementById('s-buzz')).display === 'grid'), 'side by side');
  const note = await dee.evaluate(() => {
    const [b, h] = [document.getElementById('buzz').getBoundingClientRect(), document.querySelector('header').getBoundingClientRect()];
    return { h: Math.round(document.getElementById('cards').getBoundingClientRect().height), off: Math.round((b.top + b.bottom) / 2 - (h.bottom + innerHeight) / 2) };
  });
  assert(note.h < 100 && Math.abs(note.off) <= 2, `on its side, the note beside BUZZ! keeps no room for a card, and BUZZ! stays in the middle (${JSON.stringify(note)})`);

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Phone cards E2E passed.');
} catch (e) {
  for (const [label, p] of pages) await p.screenshot({ path: `test-results/phonecards-${label}-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
