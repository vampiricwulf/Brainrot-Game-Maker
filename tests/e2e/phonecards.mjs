// The phone's private cards, end to end (docs/PARTNER-CLUES-SPEC.md §8.2, §12.3, §13.5, §14.6, §16): the buzzer room
// (buzzer/) under `wrangler dev` (local), a fake host on a plain WebSocket, and phones in Chromium on the real phone
// page. Every phone's button greys while nobody buzzes; a card sent to one phone takes its button's place behind
// "Tap to see", with its words, a picture fetched from the room with the phone's own token in a header (shown from a
// blob: address), a picture from a link, a video file playing muted and inline, a YouTube player framed only when
// tapped (no-cookie, sandboxed, with the referrer YouTube needs), "Picture coming…" filling in, and plain lines for what
// won't come. The room hears it was seen. Hide covers it again; the card going takes it all down. Also: the content
// policy, a phone seated too late, the guesser's box, a GIF held still for reduced motion, and on a computer a Space
// press that began before a card came doesn't open it. Needs `npm ci` in buzzer/.
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
