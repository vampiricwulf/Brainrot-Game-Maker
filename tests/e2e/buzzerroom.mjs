// Remote buzzers, end to end: the buzzer room (buzzer/) under `wrangler dev` (local, no Cloudflare account), a fake
// host on a plain WebSocket, and four phones in Chromium on the real phone page, their sockets passed through Playwright
// (to slow one down, or to make two buzzes tie). Then the limit on new rooms. Needs `npm ci` in buzzer/ first.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { tap, tieThem } from './helpers.mjs';

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
const state = mkdtempSync(join(tmpdir(), 'buzzer-e2e-'));
const base = `http://127.0.0.1:${port}`;
let log = '';
const wrangler = spawn(
  join(dir, 'node_modules/.bin/wrangler'),
  ['dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', state, '--log-level', 'warn'],
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
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    got.push(m);
    for (const w of [...waiters]) if (w.pred(m)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.ok(m);
    }
  });
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => fail(new Error('host socket failed')), { once: true });
  });
  return {
    got,
    send: (m) => ws.send(JSON.stringify(m)),
    /** The first message (already received or still to come) matching pred. */
    wait(pred, what, ms = 5000) {
      const seen = got.find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise((ok, fail) => {
        const w = { pred, ok };
        waiters.push(w);
        setTimeout(() => fail(new Error('host never got ' + what)), ms);
      });
    },
    close: () => ws.close(),
  };
}

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser;
const errors = [];
const pages = [];
try {
  for (let i = 0; ; i++) {
    if (wrangler.exitCode !== null) throw new Error('wrangler dev exited:\n' + log);
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch {
      // not up yet
    }
    if (i > 120) throw new Error('wrangler dev never came up:\n' + log);
    await sleep(500);
  }
  const health = await (await fetch(`${base}/api/health`)).json();
  assert(health.ok && health.protocol === 1, 'the room server is up (/api/health)');

  const pre = await fetch(`${base}/api/rooms`, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } });
  assert(pre.headers.get('access-control-allow-origin') === '*', 'CORS lets the app (file://, origin null) make rooms');
  const room = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: 'null' } })).json();
  assert(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(room.code) && room.hostToken.length >= 22, `a room was made (${room.code})`);
  assert((await fetch(`${base}/api/rooms/${room.code}`)).status === 200, 'the room is open');

  const bad = await new Promise((ok) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${room.code}?host=nope`);
    ws.onclose = (e) => ok(e.code);
  });
  assert(bad === 4003, `a wrong host token is turned away with a "don't come back" code (${bad})`);
  const gone = await new Promise((ok) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ZZZZ?host=nope`);
    ws.onclose = (e) => ok(e.code);
  });
  assert(gone === 4004, `so is a host for a room that doesn't exist (${gone})`);

  const host = await connectHost(room.code, room.hostToken);
  assert((await host.wait((m) => m.t === 'welcome', 'welcome')).code === room.code, 'the host is welcomed');
  const seats = [
    { id: 'a', name: 'Ann', color: '#e5484d' },
    { id: 'b', name: 'Bob', color: '#30a46c' },
    { id: 'c', name: 'Cat', color: '#ffc53d' },
  ];
  let hs = { title: 'Buzzer test', seats, allowNew: true, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 1200, scores: { a: 200 } };
  const setState = (patch) => {
    hs = { ...hs, ...patch };
    host.send({ t: 'state', state: hs });
  };
  setState({});

  browser = await chromium.launch({ executablePath });
  const taps = new Map();
  const phone = async (label, width = 360) => {
    const ctx = await browser.newContext({ viewport: { width, height: 740 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
    pages.push([label, page]);
    taps.set(page, await tap(page));
    return page;
  };
  const big = (p) => p.locator('#buzz-big');
  const small = (p) => p.locator('#buzz-small');
  const press = (p) => p.locator('#buzz').dispatchEvent('pointerdown');
  const shot = (p, name) => process.env.SCREENSHOTS && p.screenshot({ path: `${process.env.SCREENSHOTS}/buzzer-${name}.png` });

  // Ann opens the link and taps her name.
  const ann = await phone('ann');
  await ann.goto(`${base}/${room.code}`);
  assert((await ann.title()) === 'Brainrot Buzzer', 'the phone page is "Brainrot Buzzer"');
  await ann.getByRole('heading', { name: 'Tap your name' }).waitFor();
  await ann.getByRole('button', { name: 'Ann' }).click();
  await big(ann).getByText('Ann').waitFor();
  assert((await ann.locator('#me').innerText()).includes('200'), 'Ann has a seat and sees her name and score');

  // Bob types the code in, at 320px wide.
  const bob = await phone('bob', 320);
  await bob.goto(base);
  await bob.getByLabel('Room code').fill(room.code.toLowerCase());
  await bob.getByRole('button', { name: 'Join' }).click();
  await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
  await shot(bob, 'seats');
  assert(await bob.getByRole('button', { name: /Ann/ }).isDisabled(), "Ann's seat is greyed out for Bob");
  await bob.getByRole('button', { name: 'Bob' }).click();
  await big(bob).getByText('Bob').waitFor();
  assert(new URL(bob.url()).pathname === `/${room.code}`, 'the code went into the address');
  const overflow = await bob.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, 'nothing overflows at 320px');

  // Dee is new: she asks, the host adds her and accepts.
  const dee = await phone('dee');
  await dee.goto(`${base}/${room.code}`);
  await dee.getByRole('button', { name: "＋ I'm new" }).click();
  await dee.getByLabel('Your name').fill('Dee');
  await dee.getByRole('button', { name: 'Ask to join' }).click();
  await dee.locator('main').getByText('Waiting for the host to let you in…').waitFor();
  await shot(bob, 'lobby');
  const pend = await host.wait((m) => m.t === 'phones' && m.phones.some((p) => p.pendingName === 'Dee'), 'Dee waiting');
  const deeConn = pend.phones.find((p) => p.pendingName === 'Dee').conn;
  assert(!!deeConn, 'the host sees Dee waiting');
  setState({ seats: [...seats, { id: 'd', name: 'Dee', color: '#3d68ea' }] });
  host.send({ t: 'accept', conn: deeConn, seatId: 'd' });
  await big(dee).getByText('Dee').waitFor();
  const seated = await host.wait((m) => m.t === 'phones' && ['a', 'b', 'd'].every((s) => m.phones.some((p) => p.seatId === s && p.connected)), 'three seated phones');
  assert(seated.phones.length === 3, 'the host sees three seated phones');

  // A clue opens, buzzers closed: Bob buzzes early and is locked out for a moment.
  setState({ phase: 'closed', clue: { text: 'This planet is red' } });
  await ann.locator('main').getByText('This planet is red').waitFor();
  assert((await big(ann).innerText()) === 'Get ready…', 'phones show the clue and "Get ready…"');
  await bob.keyboard.press('Space');
  await big(bob).getByText('Too early').waitFor();
  assert(/wait \ds/.test(await small(bob).innerText()), 'Bob buzzed early (Space): "Too early — wait 1s"');

  // Armed: Bob is still locked; Ann and Dee race, Ann reacts faster.
  setState({ phase: 'armed', armId: 1 });
  await big(ann).getByText('BUZZ!').waitFor();
  await big(dee).getByText('BUZZ!').waitFor();
  assert(await ann.locator('#buzz.armed').isVisible(), 'BUZZ! once armed');
  await shot(ann, 'armed');
  await shot(bob, 'early');
  await press(bob);
  const lockedNow = await big(bob).innerText();
  await press(ann);
  await sleep(150);
  await press(dee);
  const first = await host.wait((m) => m.t === 'buzz' && m.armId === 1 && m.rank === 1, 'the winner');
  const second = await host.wait((m) => m.t === 'buzz' && m.armId === 1 && m.rank === 2, 'the runner-up');
  assert(first.seatId === 'a' && second.seatId === 'd' && second.afterMs >= 100, `Ann reacted first and wins; Dee is 2nd (${second.afterMs} ms slower)`);
  assert(taps.get(ann).sent[0]?.reactMs >= 0 && taps.get(dee).sent[0]?.reactMs >= 0, `phones send their reaction time with the buzz (Ann ${taps.get(ann).sent[0]?.reactMs} ms)`);
  assert(!host.got.some((m) => m.t === 'buzz' && m.seatId === 'b'), `Bob's buzz while locked didn't count (${lockedNow})`);
  const queue1 = await host.wait((m) => m.t === 'queue' && m.armId === 1 && m.queue.length === 2, 'the queue');
  assert(queue1.queue.map((q) => q.seatId).join() === 'a,d', 'the host gets the queue, fastest first');
  const [winner, loser] = [ann, dee];
  const winnerName = 'Ann';
  await big(winner).getByText("You're answering!").waitFor();
  await small(winner).getByText(/^You were first by \d\.\d\d s$/).waitFor();
  await big(loser).getByText("You're 2nd").waitFor();
  assert(/^\d\.\d\d s behind Ann$/.test(await small(loser).innerText()), `"You were first by …" for Ann, "You're 2nd — ${await small(loser).innerText()}" for Dee`);
  await small(bob).getByText(`${winnerName} is answering`).waitFor();
  await shot(winner, 'first');
  await shot(loser, 'late');

  // Wrong: the host re-arms with a new armId, locking the winner out. Bob (lock over) wins.
  await sleep(1300);
  setState({ phase: 'armed', armId: 2, answering: null, lockedOut: [first.seatId] });
  await small(winner).getByText('You already answered this one').waitFor();
  await big(bob).getByText('BUZZ!').waitFor();
  await press(winner);
  await press(bob);
  const bobWins = await host.wait((m) => m.t === 'buzz' && m.armId === 2 && m.rank === 1, 'arm 2 winner');
  assert(bobWins.seatId === 'b', 'the locked-out player can\'t buzz; Bob wins the re-arm');
  await big(bob).getByText("You're answering!").waitFor();

  // A slow network doesn't lose: Cat's phone is 200 ms behind each way, Dee's isn't. Cat presses first; her buzz
  // reaches the room after Dee's, and she still wins (the room counts her reaction from when her phone lit up).
  const cat = await phone('cat');
  const catTap = taps.get(cat);
  catTap.delay = 200;
  await cat.goto(`${base}/${room.code}`);
  await cat.getByRole('button', { name: 'Cat' }).click();
  await cat.locator('#me').getByText('Cat').waitFor({ timeout: 10_000 });
  await sleep(1200); // its first round trips timed (three quick pings)
  setState({ phase: 'armed', armId: 3, answering: null, lockedOut: [] });
  await big(dee).getByText('BUZZ!').waitFor();
  await big(cat).getByText('BUZZ!').waitFor();
  await press(cat);
  await sleep(100);
  await press(dee);
  const fair = await host.wait((m) => m.t === 'buzz' && m.armId === 3 && m.rank === 1, 'arm 3 winner');
  const catAt = catTap.sent.find((b) => b.armId === 3)?.at;
  const deeAt = taps.get(dee).sent.find((b) => b.armId === 3)?.at;
  assert(deeAt < catAt, `Dee's buzz reached the room first (${catAt - deeAt} ms before Cat's)`);
  assert(fair.seatId === 'c', 'but Cat, who pressed first on a slow network, wins');
  await big(cat).getByText("You're answering!").waitFor();
  await big(dee).getByText("You're 2nd").waitFor();
  assert(/behind Cat$/.test(await small(dee).innerText()), `Dee: "You're 2nd — ${await small(dee).innerText()}"`);

  // A tie: Ann's and Dee's buzzes say the same reaction time. Nobody answers until the host decides (here: a roll).
  setState({ phase: 'armed', armId: 4, answering: null, lockedOut: [] });
  await big(ann).getByText('BUZZ!').waitFor();
  await big(dee).getByText('BUZZ!').waitFor();
  tieThem([taps.get(ann), taps.get(dee)]);
  await press(ann);
  await press(dee);
  const tied = await host.wait((m) => m.t === 'queue' && m.armId === 4 && m.tie, 'the tie');
  assert(tied.tie.slice().sort().join() === 'a,d', 'buzzes with the same reaction time tie: the host is told, nobody is picked');
  await big(ann).getByText('Tie!').waitFor();
  assert((await small(dee).innerText()) === 'The host decides who goes first', 'tied phones say "Tie! The host decides who goes first"');
  await shot(ann, 'tie');
  setState({ phase: 'answering', armId: 4, answering: 'd', rollOrder: ['d', 'a'] });
  await big(dee).getByText("You're answering!").waitFor();
  await small(dee).getByText('You won the roll').waitFor();
  await big(ann).getByText("You're 2nd").waitFor();
  assert((await small(ann).innerText()) === 'Tie — you rolled 2nd', 'the roll sets the order: Dee answers, Ann "Tie — you rolled 2nd"');
  hs = { ...hs, rollOrder: undefined };

  // Back to the board; Ann reloads and gets her seat back without picking.
  setState({ phase: 'lobby', clue: null, answering: null, lockedOut: [], scores: { a: 200, b: 400 } });
  await big(bob).getByText('Bob').waitFor();
  assert((await bob.locator('#me').innerText()).includes('400'), 'the lobby shows name and new score');
  await ann.reload();
  await big(ann).getByText('Ann').waitFor();
  assert(await ann.getByRole('heading', { name: 'Tap your name' }).isHidden(), 'after a reload Ann is straight back in her seat (token)');

  // Kick Bob: his phone says so and he can pick again.
  const key = `brainrot-buzzer:${room.code}`;
  const bobSaved = await bob.evaluate((k) => localStorage.getItem(k), key);
  assert(!!bobSaved && JSON.parse(bobSaved).seatId === 'b', "Bob's phone keeps its seat token");
  host.send({ t: 'kick', seatId: 'b' });
  await bob.locator('main').getByText('The host took your seat back').waitFor();
  await bob.getByRole('button', { name: 'Pick a seat' }).click();
  await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
  assert(await bob.getByRole('button', { name: 'Bob' }).isEnabled(), "kicked: Bob's seat is free again");
  // Even a phone that missed the kick (offline) can't come back with the old token.
  await bob.evaluate(([k, v]) => localStorage.setItem(k, v), [key, bobSaved]);
  await bob.reload();
  await bob.locator('main').getByText('Your seat was given back. Tap your name again.').waitFor();
  assert(await bob.getByRole('button', { name: 'Bob' }).isEnabled(), 'the revoked token is refused; Bob picks again');

  // The host closes the room.
  host.send({ t: 'close' });
  await ann.locator('main').getByText('The game is over').waitFor();
  await dee.locator('main').getByText('The game is over').waitFor();
  assert((await fetch(`${base}/api/rooms/${room.code}`)).status === 404, 'closing ends the room for everyone');

  // New rooms are limited: 6 a minute from one address (here a made-up one: wrangler dev takes CF-Connecting-IP as
  // sent; Cloudflare sets it itself), so the 7th quick one is turned away. Not right before a new minute starts.
  const s = new Date().getSeconds();
  if (s > 45) await sleep((61 - s) * 1000);
  const statuses = [];
  let refused;
  for (let i = 0; i < 7; i++) {
    const r = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: 'null', 'CF-Connecting-IP': '203.0.113.7' } });
    statuses.push(r.status);
    if (r.status === 429) refused = { body: await r.json(), cors: r.headers.get('access-control-allow-origin') };
  }
  assert(statuses.join() === '200,200,200,200,200,200,429', `the 7th new room in a minute from one address is refused (${statuses.join()})`);
  assert(refused.body.error === 'Too many new rooms — wait a minute' && refused.cors === '*', 'with a 429 the app can read: "Too many new rooms — wait a minute"');
  assert((await fetch(`${base}/api/rooms`, { method: 'POST' })).status === 200, 'another address can still make one');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Buzzer room E2E passed.');
} catch (e) {
  if (process.env.SCREENSHOTS) for (const [label, p] of pages) await p.screenshot({ path: `${process.env.SCREENSHOTS}/buzzer-${label}-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(state, { recursive: true, force: true });
}
