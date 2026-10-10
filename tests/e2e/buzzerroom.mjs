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

  let host = await connectHost(room.code, room.hostToken);
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
  const phone = async (label, width = 360, height = 740) => {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
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
  // No name yet: the name screen itself says so (not the hidden seat list).
  await dee.getByRole('button', { name: 'Ask to join' }).click();
  await dee.locator('#new-err').getByText('Type your name first.').waitFor();
  assert(await dee.getByLabel('Your name', { exact: true }).evaluate((el) => el === document.activeElement), '"Ask to join" with no name says to type one, on the name screen');
  await dee.getByLabel('Your name', { exact: true }).fill('Dee');
  await dee.getByRole('button', { name: 'Ask to join' }).click();
  await dee.locator('main').getByText('Waiting for the host to let you in…').waitFor();
  // She changes her mind (Cancel takes the request back: the host no longer sees it), then asks again.
  await host.wait((m) => m.t === 'phones' && m.phones.some((p) => p.pendingName === 'Dee'), 'Dee asking');
  const before = host.got.length;
  await dee.getByRole('button', { name: 'Cancel' }).click();
  await dee.getByRole('heading', { name: 'Tap your name' }).waitFor();
  await host.wait((m) => host.got.indexOf(m) >= before && m.t === 'phones' && !m.phones.some((p) => p.pendingName === 'Dee'), 'Dee no longer asking');
  assert(true, 'a phone waiting to be let in can cancel (the host stops seeing the request)');
  await dee.getByRole('button', { name: "＋ I'm new" }).click();
  await dee.getByLabel('Your name', { exact: true }).fill('Dee');
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
  // The assertive alert is emptied once said, so a screen reader browsing later doesn't find a stale "You're answering!".
  await winner.waitForFunction(() => document.getElementById('alert').textContent === '');
  assert(true, 'the "You\'re answering!" alert is cleared after it has been said');
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
  // A second tab of Ann's takes the seat (same browser, same token): the first tab can take it back with a tap.
  const ann2 = await ann.context().newPage();
  ann2.on('pageerror', (e) => errors.push(`[ann2] ${e.message}`));
  await ann2.goto(`${base}/${room.code}`);
  await big(ann2).getByText('Ann').waitFor();
  await ann.locator('main').getByText('Your seat moved to another tab or phone. Tap your name to take it back here.').waitFor();
  const annSeat = ann.getByRole('button', { name: /^Ann/ });
  assert(await annSeat.isEnabled(), 'the seat moved to another tab: Ann’s own seat is still tappable here');
  // The first tab's connection blips: back, it doesn't take the seat by itself (only a tap does), so the tab in use
  // keeps it. (The room hears a score change after the first tab is back: the second tab still shows Ann's buzzer.)
  const annTap = taps.get(ann);
  const annRoutes = annTap.routes.length;
  annTap.drop();
  for (let i = 0; i < 80 && annTap.routes.length === annRoutes; i++) await sleep(250);
  await ann.locator('#overlay').waitFor({ state: 'hidden' });
  setState({ scores: { a: 250, b: 400 } });
  await ann2.locator('#me').getByText('250').waitFor();
  assert(
    annTap.routes.length > annRoutes && (await big(ann2).innerText()) === 'Ann' && (await ann.getByRole('heading', { name: 'Tap your name' }).isVisible()),
    'after a dropped connection the first tab stays on the seat list: the tab in use keeps Ann’s seat',
  );
  setState({ scores: { a: 200, b: 400 } });
  await annSeat.click();
  await big(ann).getByText('Ann').waitFor();
  assert(true, 'and tapping it takes it back here (with the token: no "taken")');
  await ann2.close();

  // Kick Bob: his phone says so and he can pick again.
  const key = `brainrot-buzzer:${room.code}`;
  const bobSaved = await bob.evaluate((k) => localStorage.getItem(k), key);
  assert(!!bobSaved && JSON.parse(bobSaved).seatId === 'b', "Bob's phone keeps its seat token");
  host.send({ t: 'kick', seatId: 'b' });
  await bob.locator('main').getByText('The host took your seat back').waitFor();
  await bob.getByRole('button', { name: 'Pick a seat' }).click();
  await bob.getByRole('heading', { name: 'Tap your name' }).waitFor();
  assert(await bob.getByRole('button', { name: 'Bob' }).isEnabled(), "kicked: Bob's seat is free again");
  // Even a phone that missed the kick (offline) can't come back with the old token: it's told the host took it off the
  // seat straight away (not "Tap your name again", which would be refused too).
  await bob.evaluate(([k, v]) => localStorage.setItem(k, v), [key, bobSaved]);
  await bob.reload();
  await bob.locator('#seats-note').getByText('The host took you off that seat').waitFor();
  assert((await bob.evaluate((k) => localStorage.getItem(k), key)) === null, 'the revoked token is refused, saying the host took Bob off that seat (and forgotten)');
  // A kicked phone can't just tap the same name again (a troll with the code from the stream), even after a reload.
  await bob.getByRole('button', { name: 'Bob' }).click();
  await bob.locator('#seats-note').getByText('The host took you off that seat').waitFor();
  assert(true, 'kicked: tapping the same name again is refused for a while ("The host took you off that seat…")');

  // Mo moves to a new phone (same Wi-Fi: the same address): his seat is taken by his old one, which is gone. The
  // seat says what to do; the host frees it (no block), and the new phone takes it.
  setState({ seats: [...hs.seats, { id: 'm', name: 'Mo', color: '#0077aa' }] });
  const oldMo = await phone('oldmo');
  await oldMo.goto(`${base}/${room.code}`);
  await oldMo.getByRole('button', { name: 'Mo' }).click();
  await big(oldMo).getByText('Mo').waitFor();
  await oldMo.context().close();
  pages.splice(pages.findIndex(([, p]) => p === oldMo), 1);
  const mo = await phone('mo');
  await mo.goto(`${base}/${room.code}`);
  const moSeat = mo.getByRole('button', { name: /^Mo:/ });
  await moSeat.getByText('Taken (its phone is away) · is this you on a new phone? Ask the host to free it').waitFor();
  assert(await moSeat.isDisabled(), 'a taken seat whose phone is gone says so: "is this you on a new phone? Ask the host to free it"');
  await host.wait((m) => m.t === 'phones' && m.phones.some((p) => p.seatId === 'm' && !p.connected), 'Mo offline');
  host.send({ t: 'kick', seatId: 'm', block: false });
  await mo.getByRole('button', { name: 'Mo', exact: true }).click();
  await big(mo).getByText('Mo').waitFor();
  assert(true, 'the host frees it (no block): Mo takes his seat on the new phone, from the same address');
  await mo.context().close();
  pages.splice(pages.findIndex(([, p]) => p === mo), 1);
  setState({ seats: hs.seats.filter((x) => x.id !== 'm') });

  // 🔒 Lock seats: nobody new gets a seat.
  setState({ locked: true });
  await bob.locator('#seats-status').getByText('The host has locked the seats').waitFor();
  assert(await bob.getByRole('button', { name: 'Bob' }).isDisabled(), '🔒 seats locked: free seats are greyed out');
  assert(await bob.getByRole('button', { name: "＋ I'm new" }).isHidden(), '🔒 and nobody can ask to join');
  setState({ locked: false });
  await bob.locator('#seats-status').getByText('The host has locked the seats').waitFor({ state: 'hidden' });

  // A status line when nobody buzzes: the Daily Double's player sees their own words.
  setState({ status: { text: 'Daily Double: Ann', seats: ['a'], seatsText: "Daily Double — you're up!" } });
  await small(ann).getByText("Daily Double — you're up!").waitFor();
  await small(dee).getByText('Daily Double: Ann').waitFor();
  assert(true, 'a status line: "Daily Double — you\'re up!" for Ann, "Daily Double: Ann" for the others');
  setState({ status: null });

  // The host's connection drops with the buzzers open: phones are told, the race goes on, and the host hears who won
  // once it's back.
  setState({ phase: 'armed', armId: 6, clue: { text: 'Q6' }, answering: null, lockedOut: [] });
  await big(dee).getByText('BUZZ!').waitFor();
  await dee.locator('#flash.on').waitFor({ state: 'attached' });
  assert(true, 'the screen flashes when BUZZ! lights up');
  host.close();
  await dee.locator('#host-note').waitFor();
  assert(true, "phones see that the host's connection dropped");
  await press(dee);
  await big(dee).getByText("You're answering!").waitFor();
  host = await connectHost(room.code, room.hostToken);
  await host.wait((m) => m.t === 'welcome', 'welcome again');
  const missed = await host.wait((m) => m.t === 'buzz' && m.armId === 6 && m.rank === 1, 'the buzz it missed');
  assert(missed.seatId === 'd', 'back, the host hears the buzz it missed (Dee won while it was away)');
  setState({});
  await dee.locator('#host-note').waitFor({ state: 'hidden' });
  assert((await big(dee).innerText()) === "You're answering!", 'the winner stands, and the note goes once the host is back');

  // Right: the phones say who got it, not "Get ready"; pressing now is no early buzz.
  setState({ phase: 'closed', answering: null, done: { by: 'd' } });
  await big(ann).getByText('Dee got it').waitFor();
  await big(dee).getByText('You got it!').waitFor();
  await press(ann);
  await sleep(400);
  assert((await big(ann).innerText()) === 'Dee got it', 'a right answer: "Dee got it" / "You got it!", and a press then is no early buzz');
  setState({ phase: 'lobby', clue: null, done: null });

  // "Not you?": Dee lets go of her seat and taps her name again.
  // It asks first (the link sits under the buzz button).
  dee.once('dialog', (d) => d.accept());
  await dee.getByRole('button', { name: 'Not you? Change player' }).click();
  await dee.getByRole('heading', { name: 'Tap your name' }).waitFor();
  assert(await dee.getByRole('button', { name: 'Dee' }).isEnabled(), '"Not you? Change player" frees the seat');
  await dee.getByRole('button', { name: 'Dee' }).click();
  await big(dee).getByText('Dee').waitFor();

  // Waiting for the host to let her in, Eve's connection drops: her phone asks again by itself.
  const eve = await phone('eve');
  await eve.goto(`${base}/${room.code}`);
  await eve.getByRole('button', { name: "＋ I'm new" }).click();
  await eve.getByLabel('Your name', { exact: true }).fill('Eve');
  await eve.getByRole('button', { name: 'Ask to join' }).click();
  const ask1 = await host.wait((m) => m.t === 'phones' && m.phones.some((p) => p.pendingName === 'Eve'), 'Eve asking');
  const eveConn = ask1.phones.find((p) => p.pendingName === 'Eve').conn;
  taps.get(eve).drop();
  const ask2 = await host.wait((m) => m.t === 'phones' && m.phones.some((p) => p.pendingName === 'Eve' && p.conn !== eveConn), 'Eve asking again', 15_000);
  await eve.locator('main').getByText('Waiting for the host to let you in…').waitFor();
  assert(true, 'a request to join survives a dropped connection (the phone asks again; the host still sees Eve)');
  host.send({ t: 'reject', conn: ask2.phones.find((p) => p.pendingName === 'Eve').conn });
  await eve.locator('#seats-note').getByText("The host didn't let you in.").waitFor();

  // A phone back from the background with a socket that looks open but is dead: it checks, and starts again.
  const catTap2 = taps.get(cat);
  catTap2.delay = 0;
  let routes = catTap2.routes.length;
  catTap2.stall();
  await cat.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  for (let i = 0; i < 40 && catTap2.routes.length === routes; i++) await sleep(250);
  assert(catTap2.routes.length > routes, 'back from the background, a dead connection is noticed in seconds and replaced');
  await big(cat).getByText('Cat').waitFor();
  // A buzz the room never answers: "Sending…", then it starts again at once.
  setState({ phase: 'armed', armId: 7, clue: { text: 'Q7' }, answering: null, lockedOut: [] });
  await big(cat).getByText('BUZZ!').waitFor();
  routes = catTap2.routes.length;
  catTap2.stall();
  await press(cat);
  await small(cat).getByText('Sending…').waitFor();
  for (let i = 0; i < 40 && catTap2.routes.length === routes; i++) await sleep(250);
  assert(catTap2.routes.length > routes, 'a buzz the room never answered shows "Sending…", and the phone reconnects');
  const resent = await host.wait((m) => m.t === 'buzz' && m.armId === 7 && m.rank === 1, 'the press sent again', 10_000);
  await big(cat).getByText("You're answering!").waitFor();
  assert(resent.seatId === 'c', 'and sends the press again once back in its seat (the buzzers still open): it counts');
  // Back from the background mid-clue: "Checking connection…"; a press then is kept and goes once reconnected.
  setState({ phase: 'armed', armId: 8, clue: { text: 'Q8' }, answering: null, lockedOut: [] });
  await big(cat).getByText('BUZZ!').waitFor();
  routes = catTap2.routes.length;
  catTap2.stall();
  await cat.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await small(cat).getByText('Checking connection…').waitFor();
  await press(cat);
  const kept = await host.wait((m) => m.t === 'buzz' && m.armId === 8 && m.rank === 1, 'the press made while checking', 15_000);
  assert(kept.seatId === 'c' && catTap2.routes.length > routes, 'a press while "Checking connection…" on a dead socket still counts, sent once reconnected');
  setState({ phase: 'lobby', clue: null });

  // Ann's phone is off the network for a while (no Wi-Fi, asleep): after a few tries it checks whether the room is
  // still there. It is, so it keeps trying, and she's back on her buzzer once online again (not "The game is over").
  // (Online again the moment it asks, in step with the phone: its next try gets through.)
  let asked = '';
  const checking = (r) => {
    const path = new URL(r.url()).pathname;
    if (!path.startsWith('/api/rooms/')) return;
    asked = path;
    annTap.blocked = false;
  };
  ann.on('request', checking);
  annTap.blocked = true;
  annTap.drop();
  // While away, the page behind the overlay is inert and the screen reader hears what the overlay says.
  await ann.waitForFunction(
    () => !document.getElementById('overlay').hidden && document.querySelector('main').inert && document.getElementById('live').textContent.startsWith(document.getElementById('overlay-text').textContent),
  );
  assert(true, 'reconnecting: the buzzer behind the overlay is inert and #live starts with the overlay text');
  for (let i = 0; i < 240 && !asked; i++) await sleep(250);
  ann.off('request', checking);
  annTap.blocked = false;
  await ann.locator('#overlay').waitFor({ state: 'hidden' });
  assert(
    asked === `/api/rooms/${room.code}` && (await ann.locator('main').getByText('The game is over').count()) === 0 && (await big(ann).innerText()) === 'Ann',
    `a phone offline for a while checks its own room (${asked}), finds it still open, and keeps trying: never "The game is over"`,
  );
  setState({ scores: { ...hs.scores, a: 300 } });
  await ann.locator('#me').getByText('300').waitFor();
  assert(true, 'and back online, Ann is in her seat again');
  setState({ scores: { ...hs.scores, a: 200 } });

  // 24 open pages that do nothing (viewers, extra tabs) don't lock a real player out: the longest idle one makes way.
  await bob.close();
  await eve.close();
  const idle = [];
  for (let i = 0; i < 24; i++) {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws/${room.code}`);
    const x = { w, msgs: [], closed: new Promise((ok) => w.addEventListener('close', (e) => ok(e.code))) };
    w.addEventListener('message', (e) => x.msgs.push(JSON.parse(e.data)));
    idle.push(x);
    await new Promise((ok) => w.addEventListener('open', ok, { once: true }));
  }
  await sleep(10_500);
  setState({ seats: [...hs.seats, { id: 'f', name: 'Fay', color: '#aa00aa' }, { id: 'g', name: 'Gus', color: '#00aaaa' }] });
  const fay = await phone('fay');
  await fay.goto(`${base}/${room.code}`);
  await fay.getByRole('button', { name: 'Fay' }).click();
  await big(fay).getByText('Fay').waitFor();
  assert(true, "24 idle open pages don't lock out a real player: Fay gets her seat");
  for (let i = 0; i < 30 && idle[0].w.readyState < 2; i++) await sleep(100);
  assert(idle[0].w.readyState >= 2 && idle[0].msgs.some((m) => m.t === 'denied' && m.reason === 'full'), 'the longest idle page made way (told "full": it tries again later)');
  await host.wait((m) => m.t === 'full', 'room full');
  assert(true, 'the host is told the room is full');
  for (const x of idle) x.w.close();

  // A phone held sideways: the button fits, the score shows, and words never break in the middle.
  const gus = await phone('gus', 740, 360);
  await gus.goto(`${base}/${room.code}`);
  await gus.getByRole('button', { name: 'Gus' }).click();
  await big(gus).getByText('Gus').waitFor();
  setState({ phase: 'answering', armId: 9, clue: { text: 'A clue long enough to wrap onto a second line on a phone held sideways' }, answering: 'g' });
  await big(gus).getByText("You're answering!").waitFor();
  const fits = await gus.evaluate(() => {
    const inside = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    };
    // Every word on one line: a word whose text spans two line boxes was broken mid-word.
    const broken = [];
    for (const id of ['buzz-big', 'buzz-small']) {
      const node = document.getElementById(id).firstChild;
      const text = node?.textContent ?? '';
      for (const m of text.matchAll(/\S+/g)) {
        const r = document.createRange();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        if (tops.size > 1) broken.push(m[0]);
      }
    }
    return { buzz: inside(document.getElementById('buzz')), me: inside(document.getElementById('me')), broken, wide: document.documentElement.scrollWidth > innerWidth };
  });
  await sleep(500); // after the flash
  const png = await gus.screenshot({ path: process.env.SCREENSHOTS ? `${process.env.SCREENSHOTS}/buzzer-landscape.png` : undefined });
  assert(fits.buzz && fits.me && !fits.wide && png.length > 1000, 'held sideways (740×360): the button and the score fit on screen, nothing overflows');
  assert(!fits.broken.length, `held sideways: no word is broken in the middle (${fits.broken.join(', ') || 'none'})`);
  setState({ phase: 'lobby', clue: null, answering: null });

  // A long name with no spaces breaks rather than push the page sideways, on small phones, upright and sideways.
  const longName = 'Bartholomew_Maximilian_Fitzgerald';
  setState({ seats: [...hs.seats, { id: 'h', name: longName, color: '#884400' }] });
  const hal = await phone('hal', 320, 568);
  await hal.goto(`${base}/${room.code}`);
  await hal.getByRole('button', { name: longName }).click();
  await big(hal).getByText(longName).waitFor();
  const sideways = async () => hal.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.getElementById('buzz-big').scrollWidth > document.getElementById('buzz').clientWidth);
  const wide = [await sideways()];
  setState({ phase: 'armed', armId: 10, clue: { text: 'Q10' } });
  await big(hal).getByText('BUZZ!').waitFor();
  wide.push(await sideways());
  for (const [w, h] of [[375, 667], [568, 320]]) {
    await hal.setViewportSize({ width: w, height: h });
    wide.push(await sideways());
  }
  assert(!wide.some(Boolean), `a long name with no spaces fits the button and the page (320×568, 375×667, 568×320: ${wide.join()})`);
  const live = await hal.locator('#live').innerText();
  assert(live === `BUZZ! ${longName}.`, `what a screen reader hears reads as sentences ("${live}")`);
  setState({ phase: 'closed', clue: { text: 'Q10' }, armId: 10 });
  await big(hal).getByText('Get ready…').waitFor();
  assert((await hal.locator('#live').innerText()) === "Get ready… Don't buzz yet.", 'no "Get ready…." doubled stop');
  setState({ phase: 'lobby', clue: null });

  // A socket that floods the room is closed (4008), and its address can't come straight back (only a phone taking back
  // a seat it holds may: others on that Wi-Fi).
  const flood = new WebSocket(`ws://127.0.0.1:${port}/ws/${room.code}`);
  const floodClosed = new Promise((ok) => flood.addEventListener('close', (e) => ok(e.code)));
  await new Promise((ok) => flood.addEventListener('open', ok, { once: true }));
  const spam = setInterval(() => {
    for (let i = 0; i < 10 && flood.readyState === 1; i++) flood.send('{"t":"ping","at":1}');
  }, 20);
  const floodCode = await Promise.race([floodClosed, sleep(8000).then(() => 'still open')]);
  clearInterval(spam);
  assert(floodCode === 4008, `a phone socket flooding the room is closed with 4008 (${floodCode})`);
  const again = await new Promise((ok) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws/${room.code}`);
    w.addEventListener('close', (e) => ok(e.code));
    w.addEventListener('open', () => w.send('{"t":"new","name":"Flood","device":"dev-flood"}'), { once: true });
    setTimeout(() => ok('open'), 3000);
  });
  assert(again === 4008, `and from its address, a phone asking to join is turned away for a while (${again})`);
  await small(ann).getByText('Wait for the next clue').waitFor();
  assert(true, 'the room carries on for everyone else');

  // Game over: each phone says where it came.
  setState({ over: true, currency: '$', scores: { a: 700, b: 400, c: 0, d: 100 }, status: { text: 'Game over: thanks for playing!' } });
  await big(ann).getByText('You came 1st').waitFor();
  assert((await small(ann).innerText()) === 'with $700 🎉', `game over: "You came 1st / with $700 🎉" (${await small(ann).innerText()})`);
  await big(dee).getByText('You came 3rd').waitFor();
  assert(true, 'and the others their own place ("You came 3rd")');
  // A tie for first the tiebreaker settled: its winner came 1st, the one it beat 2nd (not "You tied for 1st" on both).
  setState({ scores: { a: 700, b: 400, c: 0, d: 700 }, winner: 'd' });
  await big(dee).getByText('You came 1st').waitFor();
  await big(ann).getByText('You came 2nd').waitFor();
  assert(true, 'a tie for first settled by a tiebreaker: "You came 1st" for its winner, "You came 2nd" for the other');
  setState({ scores: { a: 700, b: 400, c: 0, d: 100 }, winner: undefined });
  await big(ann).getByText('You came 1st').waitFor();
  await big(dee).getByText('You came 3rd').waitFor();

  // The host closes the room.
  host.send({ t: 'close' });
  await ann.locator('main').getByText('You came 1st with $700 🎉').waitFor();
  await dee.locator('main').getByText('You came 3rd with $100').waitFor();
  assert(true, 'closed at the end, the place stays up ("You came 1st with $700 🎉")');
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
  // IPv6 counts by the first 56 bits: a new address in the same /56 for every room is still one address.
  const v6 = [];
  for (let i = 0; i < 7; i++)
    v6.push((await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: 'null', 'CF-Connecting-IP': `2001:db8:1:2a0${i}::${i + 1}` } })).status);
  assert(v6.join() === '200,200,200,200,200,200,429', `so are 7 from addresses in one IPv6 /56 (${v6.join()})`);
  assert((await fetch(`${base}/api/rooms`, { method: 'POST' })).status === 200, 'another address can still make one');
  // Looking codes up is limited too (60 a minute), so a script can't try them all to find live rooms.
  const s2 = new Date().getSeconds();
  if (s2 > 50) await sleep((61 - s2) * 1000);
  const looks = [];
  for (let i = 0; i < 61; i++) looks.push((await fetch(`${base}/api/rooms/BCDF`, { headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status);
  assert(looks.slice(0, 60).every((s) => s !== 429) && looks[60] === 429, `the 61st room lookup in a minute from one address is refused (${looks.at(-1)})`);

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
