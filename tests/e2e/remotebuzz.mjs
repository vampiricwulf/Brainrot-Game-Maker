// Phone buzzers, the host's side, against a fake buzzer room (a WebSocket and fetch put in the page before it loads):
// Buzzer mode and its options on the pre-game card, starting the room (a refusal in the server's words, then the code,
// link, QR), the phones list, a new player joining from their phone, opening the buzzers with U, a phone's buzz picking
// the player (and the audience plate), the queue of buzzes, a wrong answer locking them out, → Next in line, ↺ Reset
// buzzers, a tie and 🎲 Roll for it, a kick, a reconnect, the audience window closed by accident (the host is told),
// Exit › Keep & leave keeping the room for Resume, another game keeping the room and its players, and ✕ Close the room.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, answerReplace, exportHtml, openRules, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

// The fake buzzer room: POST /api/rooms makes room BCDF; a socket says welcome; everything the host sends is kept.
await context.addInitScript(() => {
  try {
    const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
    if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: 'https://buzz.test' }));
  } catch {}
  const room = (window.__room = { sockets: [], sent: [], posts: 0, health: 0, refuse: '' });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const u = String(url);
    if (u === 'https://buzz.test/api/rooms' && init?.method === 'POST') {
      room.posts++;
      if (room.refuse) return new Response(JSON.stringify({ error: room.refuse }), { status: 429, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ code: 'BCDF', hostToken: 'secret-token' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u === 'https://buzz.test/api/health') {
      room.health++;
      return new Response('{"ok":true}', { status: 200 });
    }
    return realFetch(url, init);
  };
  class FakeSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      room.sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.onopen?.({});
        this.onmessage?.({ data: JSON.stringify({ t: 'welcome', code: 'BCDF', protocol: 1, serverNow: Date.now(), ...(room.features ? { features: room.features } : {}) }) });
      }, 20);
    }
    send(d) {
      room.sent.push(JSON.parse(d));
    }
    close() {
      this.readyState = 3;
    }
  }
  window.WebSocket = FakeSocket;
  window.__say = (m) => room.sockets.at(-1).onmessage?.({ data: JSON.stringify(m) });
  window.__drop = () => {
    const ws = room.sockets.at(-1);
    ws.readyState = 3;
    ws.onclose?.({ code: 1006 });
  };
  window.__state = () => [...room.sent].reverse().find((m) => m.t === 'state')?.state;
});

const page = await context.newPage();
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
};
watch(page, 'host');
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const shot = async (name, p = page) => shots && (await p.screenshot({ path: `${shots}/${name}.png` }));
const state = () => page.evaluate(() => window.__state());
const sent = () => page.evaluate(() => window.__room.sent);
const say = (m) => page.evaluate((m) => window.__say(m), m);
/** Wait until the last state sent to the room matches. */
const stateIs = (fn, arg) => page.waitForFunction(([src, arg]) => new Function('s', 'arg', `return (${src})(s, arg)`)(window.__state(), arg), [fn.toString(), arg]);
const pressed = () => page.locator('.panel .p .sel[aria-pressed="true"]').allInnerTexts();

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);

  // ---------- Settings: the buzzer server and its Test ----------
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: '⚙ Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.waitFor();
  assert((await settings.getByLabel('Buzzer server').inputValue()) === 'https://buzz.test', 'Settings shows the buzzer server');
  await settings.getByRole('button', { name: 'Test' }).click();
  await settings.getByText('✔ The buzzer server is answering').waitFor();
  assert((await page.evaluate(() => window.__room.health)) === 1, 'Test asks the server’s /api/health');
  await settings.getByRole('button', { name: 'Done' }).click();

  // ---------- Export HTML takes the buzzer server along (another computer has no Settings for it) ----------
  {
    const download = await exportHtml(page, 'Buzz Night');
    mkdirSync('test-results', { recursive: true });
    const saved = resolve('test-results/buzz-export.html');
    await download.saveAs(saved);
    const html = readFileSync(saved, 'utf8');
    assert(/id="jb-pack"[^>]*data-buzzer="https:\/\/buzz\.test"/.test(html), 'the exported file carries the buzzer server');
    const other = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p2 = watch(await other.newPage(), 'export');
    await p2.goto(pathToFileURL(saved).href);
    await p2.getByRole('button', { name: '▶ Play' }).click();
    const card2 = p2.getByRole('region', { name: 'Phone buzzers' });
    await card2.getByLabel(/Buzzer mode/).waitFor();
    assert((await card2.getByText(/aren't set up/).count()) === 0, 'and phone buzzers work in it on a browser without that setting');
    await other.close();
  }

  // ---------- Pre-game: players; 📋 Game rules has no buzzer options (they're on the 📱 Phone buzzers card) ----------
  await playWithPlayers(page, 3);
  const rules = await openRules(page);
  assert((await rules.getByLabel(/Buzzer mode/).count()) === 0 && (await rules.getByLabel('Open the buzzers').count()) === 0, '📋 Game rules has no buzzer options');

  // ---------- Pre-game: Buzzer mode, its options, start the room ----------
  const card = page.getByRole('region', { name: 'Phone buzzers' });
  await card.waitFor();
  assert((await card.getByLabel('Open the buzzers').count()) === 0 && (await card.getByRole('button', { name: '▶ Start the room' }).count()) === 0, 'with Buzzer mode off the card only offers to turn it on');
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel('Open the buzzers').selectOption('host');
  await card.getByLabel(/Let new players join/).check();
  await shot('rb-0-setup');
  // A laptop's window: what the room shows once it's started must be in sight, not under the Start bar.
  await page.setViewportSize({ width: 1280, height: 720 });
  // Start game with Buzzer mode on and no room asks first; Start the room first starts it (the server turns the
  // first room down: its words show).
  await page.evaluate(() => (window.__room.refuse = 'Too many new rooms — wait a minute'));
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.waitForTimeout(450);
  await page.locator('.actions .ia').getByRole('button', { name: '📱 Start the room first' }).click();
  await card.getByRole('alert').getByText('Too many new rooms — wait a minute').waitFor();
  assert(true, 'Start the room first (from Start game) starts it; a refused room shows the server’s reason (Too many new rooms — wait a minute)');
  await page.evaluate(() => (window.__room.refuse = ''));
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await card.getByLabel('Room code BCDF').waitFor();
  await page.waitForTimeout(600);
  {
    const code = await card.getByLabel('Room code BCDF').boundingBox();
    const bar = await page.locator('.pregame .actions').boundingBox();
    assert(code.y >= 0 && code.y + code.height <= bar.y, `at 1280×720 the room code scrolls into sight above the Start bar (${Math.round(code.y)}–${Math.round(code.y + code.height)}, the bar at ${Math.round(bar.y)})`);
    assert((await page.locator('.actions .room-note').innerText()).includes('Room BCDF · 0 of 3 joined'), 'and the Start bar shows the code and who has joined');
  }
  await page.setViewportSize({ width: 1400, height: 900 });
  assert((await page.evaluate(() => window.__room.posts)) === 2, 'Start the room asks the server for a room');
  assert((await page.evaluate(() => window.__room.sockets[0].url)) === 'wss://buzz.test/ws/BCDF?host=secret-token', 'and connects to it as the host');
  assert((await card.getByRole('link').innerText()) === 'https://buzz.test/BCDF', 'the card shows the join link');
  assert((await card.getByRole('img', { name: /QR code/ }).count()) === 1, 'and a QR code for it');
  assert(await card.getByRole('button', { name: '📋 Copy link' }).isVisible(), 'with a Copy link button for the Discord chat');
  await stateIs((s) => s?.seats.length === 3 && s.phase === 'lobby' && s.allowNew === true);
  const seats = (await state()).seats;
  assert(seats.map((s) => s.name).join() === 'Player 1,Player 2,Player 3', 'the room is told the players');

  // Phones: Player 1 joins, someone new asks to.
  await say({
    t: 'phones',
    phones: [
      { conn: 'c1', seatId: seats[0].id, connected: true },
      { conn: 'c9', seatId: null, pendingName: 'Zed', connected: true },
    ],
  });
  await card.getByText('1 of 3 players joined').waitFor();
  assert((await page.locator('.live-check li.done', { hasText: 'Room BCDF open: 1 of 3 joined' }).count()) === 1, '“Going live?” ticks the room off once a phone has joined');
  assert((await card.locator('li', { hasText: 'Player 1' }).innerText()).includes('✔ joined'), 'a joined player shows ✔ joined');
  assert((await card.locator('li', { hasText: 'Player 2' }).innerText()).includes('waiting'), 'the others are waiting');
  await card.getByRole('button', { name: '✔ Add' }).click();
  await page.waitForFunction(() => window.__room.sent.some((m) => m.t === 'accept'));
  const all = await sent();
  const accept = all.find((m) => m.t === 'accept');
  const before = all.slice(0, all.indexOf(accept)).reverse().find((m) => m.t === 'state').state;
  const zed = before.seats.find((s) => s.name === 'Zed');
  assert(zed && accept.conn === 'c9' && accept.seatId === zed.id, 'Add makes Zed a player, tells the room the seat, then accepts the phone');
  assert((await page.locator('.pregame input.name').count()) === 4, 'Zed is in the player list');
  await shot('rb-1-pregame');

  // The audience window's Starting soon card shows the code and the QR code.
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  watch(aud, 'audience');
  await aud.locator('.join-code').waitFor();
  assert((await aud.locator('.join-code').innerText()) === 'BCDF', 'viewers see the room code on the Starting soon card');
  assert((await aud.locator('.join-link').innerText()) === 'buzz.test/BCDF', 'and the link');
  assert((await aud.getByRole('img', { name: /QR code/ }).count()) === 1, 'and the QR code');
  // Who's playing too (4 players), and all of it on the stage.
  await aud.locator('.lineup li').nth(3).waitFor();
  const soonBox = await aud.locator('.soon').boundingBox();
  const stageBox = await aud.locator('.title-card').boundingBox();
  assert(soonBox.y >= stageBox.y - 1 && soonBox.y + soonBox.height <= stageBox.y + stageBox.height + 1, `the card's lineup, code and QR code all fit on the stage (${Math.round(soonBox.height)} of ${Math.round(stageBox.height)} px)`);
  await shot('rb-2-soon', aud);

  // ---------- A clue: the host opens the buzzers, a phone buzzes ----------
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await stateIs((s) => s.phase === 'lobby');
  await page.locator('.stage-box .board .tile').first().click();
  await stateIs((s) => s.phase === 'closed' && !!s.clue);
  const closed = await state();
  assert(closed.clue.caption.includes('$200'), `the room gets the clue's caption (${closed.clue.caption})`);
  assert(await page.locator('.panel button.primary', { hasText: '🔔 Open the buzzers' }).isVisible(), 'the buzzers start closed: the host panel offers to open them');
  // The buzzers' things are on a row of their own, one height whatever it says: the panel (and the stage over it) keeps
  // its height as people buzz, miss and tie.
  const panelH = () => page.locator('.panel').evaluate((e) => Math.round(e.getBoundingClientRect().height));
  const heights = { closed: await panelH() };
  await page.keyboard.press('u');
  await stateIs((s, a) => s.phase === 'armed' && s.armId > a, closed.armId);
  const armed = await state();
  assert(true, `U opens the buzzers (a new armId ${armed.armId})`);
  await aud.locator('[data-buzz-now]').getByText('🔔 Buzz now!').waitFor();
  assert(true, 'viewers see the buzzers open: “🔔 Buzz now!” and a light around the stage');
  assert((await aud.locator('.join-badge .jb-link').innerText()) === 'buzz.test', 'the corner’s join badge says where to go too (buzz.test), with the code');
  await say({ t: 'buzz', armId: armed.armId, seatId: seats[1].id, rank: 1, afterMs: 0 });
  await say({ t: 'queue', armId: armed.armId, queue: [{ seatId: seats[1].id, afterMs: 0 }] });
  await aud.locator('.plate').waitFor();
  assert((await aud.locator('.plate').innerText()).includes('Player 2'), 'a phone’s buzz picks the player: viewers see Player 2 is answering');
  await aud.locator('[data-buzz-now]').waitFor({ state: 'detached' });
  assert(true, 'and the “Buzz now!” cue goes once someone answers');
  assert((await pressed()).join() === '2Player 2' || (await pressed())[0].includes('Player 2'), 'Player 2 is selected in the host panel');
  // A later buzz joins the queue.
  await say({ t: 'buzz', armId: armed.armId, seatId: seats[2].id, rank: 2, afterMs: 120 });
  await say({ t: 'queue', armId: armed.armId, queue: [{ seatId: seats[1].id, afterMs: 0 }, { seatId: seats[2].id, afterMs: 120 }] });
  const queue = page.getByRole('list', { name: 'Buzz order' });
  await queue.locator('li', { hasText: 'Player 3' }).waitFor();
  const rows = (await queue.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert(rows.join(' | ') === '1. Player 2 | 2. Player 3 +0.12 s', `the host panel lists the buzzes fastest first (${rows.join(' | ')})`);
  await stateIs((s, id) => s.phase === 'answering' && s.answering === id, seats[1].id);
  await shot('rb-3-answering');
  heights.answering = await panelH();
  assert(
    await page.locator('.panel [data-buzzrow]').evaluate((row) => {
      const award = document.querySelector('.panel .award');
      return !!row.querySelector('[aria-label="Buzz order"]') && !!award && row.getBoundingClientRect().bottom <= award.getBoundingClientRect().top;
    }),
    'the buzz order, who buzzed and ⏭ Skip are on the buzzers’ row, above the Amount row',
  );

  // Wrong: Player 2 is locked out, and Player 3, next in the buzz order, answers at once (the same opening: there's no
  // new one for a later buzz to jump the queue with).
  const scoresBefore = await page.locator('.panel .p .score').allInnerTexts();
  await page.keyboard.press('Shift+Enter');
  await stateIs((s, a) => s.phase === 'answering' && s.answering === a.next && s.armId === a.armId && s.lockedOut.join() === a.id, {
    armId: armed.armId,
    id: seats[1].id,
    next: seats[2].id,
  });
  assert((await pressed())[0].includes('Player 3'), 'a wrong answer locks Player 2 out, and Player 3, next in the buzz order, answers (no re-opening)');
  await page.getByText('Missed: Player 2').waitFor();
  heights.missed = await panelH();
  assert((await queue.locator('li.out', { hasText: 'Player 2' }).count()) === 1, 'the queue stays, Player 2 struck out');
  // A buzz from a phone meanwhile doesn't take the turn.
  await say({ t: 'buzz', armId: armed.armId, seatId: seats[0].id, rank: 3, afterMs: 200 });
  await page.waitForTimeout(150);
  assert((await pressed())[0].includes('Player 3') && (await pressed()).length === 1, 'a phone buzzing meanwhile doesn’t take Player 3’s turn');
  // ⏭ Skip: Player 3 passes with no points taken; nobody's left in the order, so the buzzers open for the rest.
  const p3Before = (await page.locator('.panel .p .score').allInnerTexts())[2];
  await page.getByRole('button', { name: '⏭ Skip Player 3' }).click();
  await stateIs((s, a) => s.phase === 'armed' && s.armId === a.armId + 1 && [...s.lockedOut].sort().join() === a.out, {
    armId: armed.armId,
    out: [seats[1].id, seats[2].id].sort().join(),
  });
  assert((await page.locator('.panel .p .score').allInnerTexts())[2] === p3Before && scoresBefore[2] === p3Before, '⏭ Skip passes Player 3 with no points taken, then opens the buzzers for the rest');
  await aud.locator('.plate').waitFor({ state: 'detached' });
  assert(true, 'the plate goes');
  // A late buzz for the old opening doesn't count.
  const n = (await sent()).length;
  await say({ t: 'buzz', armId: armed.armId, seatId: seats[0].id, rank: 1, afterMs: 0 });
  await page.waitForTimeout(150);
  assert((await pressed()).length === 0, 'a buzz from an earlier opening is ignored');
  assert((await sent()).slice(n).some((m) => m.t === 'state'), 'and the room hears the host’s state again');
  // The host picks by hand with a number key too.
  await page.keyboard.press('4');
  await stateIs((s, id) => s.answering === id, (await state()).seats[3].id);
  assert(true, 'number keys pick who answers by hand (Zed, 4)');
  // ↺ Reset buzzers: nobody locked out, open for everyone.
  await page.getByRole('button', { name: '↺ Reset buzzers' }).click();
  await stateIs((s) => s.phase === 'armed' && s.lockedOut.length === 0 && !s.answering);
  assert((await pressed()).length === 0 && (await queue.count()) === 0, '↺ Reset buzzers opens them for everyone again (Player 2 too) and clears the queue');

  // A tie: the room picks nobody; 🎲 Roll for it sets the answering order.
  const tieArm = (await state()).armId;
  await say({ t: 'queue', armId: tieArm, queue: [{ seatId: seats[0].id, afterMs: 0 }, { seatId: seats[1].id, afterMs: 4 }], tie: [seats[0].id, seats[1].id] });
  await page.getByText('Tie: Player 1 & Player 2').waitFor();
  assert((await pressed()).length === 0, 'a tie: nobody is picked, the host panel says "Tie: Player 1 & Player 2"');
  heights.tie = await panelH();
  assert(new Set(Object.values(heights)).size === 1, `the host panel keeps its height through the buzzes (${JSON.stringify(heights)})`);
  await shot('rb-3b-tie');
  await page.getByRole('button', { name: '🎲 Roll for it' }).click();
  await aud.getByText('Tie! Roll for it').waitFor();
  assert(true, 'Roll for it rolls on stream for the tied players');
  await stateIs((s, a) => s.phase === 'answering' && s.armId === a && s.rollOrder?.length === 2 && s.rollOrder[0] === s.answering, tieArm);
  const rolled = (await state()).rollOrder;
  assert(rolled.slice().sort().join() === [seats[0].id, seats[1].id].sort().join(), 'the roll sets the answering order of the tied players (sent to the room as rollOrder)');
  await say({ t: 'queue', armId: tieArm, queue: rolled.map((id, i) => ({ seatId: id, afterMs: 0, rolled: i + 1 })) });
  await queue.getByText('🎲 2nd').waitFor();
  assert((await pressed())[0].includes(rolled[0] === seats[0].id ? 'Player 1' : 'Player 2'), 'the first in the roll answers; the queue shows 🎲 1st, 🎲 2nd');
  await page.keyboard.press('Escape');
  await aud.getByText('Tie! Roll for it').waitFor({ state: 'detached' });

  // ---------- The 📱 chip: kick, a new player mid-game ----------
  const chip = page.locator('.panel .chip');
  assert((await chip.innerText()).startsWith('📱 1/4'), `the host panel shows how many phones joined (${await chip.innerText()})`);
  await chip.click();
  const pop = page.getByRole('region', { name: 'Phone buzzers' });
  assert((await pop.getByRole('button', { name: /Free .* seat/ }).count()) === 0, 'a room from before Free seat offers only ✕ Kick');
  await pop.getByRole('button', { name: 'Take Player 1’s seat back from their phone' }).click();
  await page.waitForFunction((id) => window.__room.sent.some((m) => m.t === 'kick' && m.seatId === id && m.block === undefined), seats[0].id);
  assert(true, 'kick ✕ takes Player 1’s seat back');
  await say({ t: 'phones', phones: [{ conn: 'c5', seatId: null, pendingName: 'Amy', connected: true }] });
  await pop.getByText('Amy wants to join').waitFor();
  assert((await chip.innerText()).includes('1 asking'), 'the chip says someone is asking to join');
  await pop.getByRole('button', { name: '✔ Add' }).click();
  await page.waitForFunction(() => window.__room.sent.some((m) => m.t === 'accept' && m.conn === 'c5'));
  assert((await page.locator('.panel .p').count()) === 5, 'Amy joins mid-game');
  assert((await page.getByRole('button', { name: '↶ Undo' }).getAttribute('title')).includes('Added Amy'), 'as one undoable step');
  // A phone drops: its player's chip shows 📵, and the phones list how long it's been gone.
  await say({ t: 'phones', phones: [{ conn: 'c2', seatId: seats[1].id, connected: false }, { conn: 'c3', seatId: seats[2].id, connected: true }] });
  await page.locator(`.panel .p [data-phone-away="${seats[1].id}"]`).waitFor();
  assert((await page.locator('.panel .p [data-phone-away]').count()) === 1, 'a dropped phone: 📵 on that player’s chip (only theirs)');
  await pop.locator(`[data-phone-offline="${seats[1].id}"]`).waitFor();
  assert(/📵 phone offline \d+:\d\d/.test(await pop.locator(`[data-phone-offline="${seats[1].id}"]`).innerText()), `and the phones list says “phone offline 0:01” (${await pop.locator(`[data-phone-offline="${seats[1].id}"]`).innerText()})`);
  await say({ t: 'phones', phones: [{ conn: 'c2', seatId: seats[1].id, connected: true }, { conn: 'c3', seatId: seats[2].id, connected: true }] });
  await page.locator('.panel .p [data-phone-away]').waitFor({ state: 'detached' });
  assert(true, 'back online, the 📵 goes');
  // Seats locked (nobody new can join): the stage stops inviting everyone to buzz in.
  await aud.locator('.join-badge', { hasText: '📱 Buzz in' }).waitFor();
  await pop.getByLabel(/Lock seats/).check();
  await aud.locator('.join-badge', { hasText: '📱 Players’ buzzers' }).waitFor();
  assert((await aud.locator('.join-badge .jb-link').count()) === 0, 'with the seats locked, the stage’s badge says “📱 Players’ buzzers” (no “Buzz in” for everyone watching)');
  await pop.getByLabel(/Lock seats/).uncheck();
  await aud.locator('.join-badge', { hasText: '📱 Buzz in' }).waitFor();
  await page.keyboard.press('Escape');
  assert((await pop.count()) === 0, 'Esc closes the phones list (and nothing else)');
  assert((await page.locator('.stage-box .board').count()) === 0, 'the clue is still open');

  // Wrong, then right: the main button is 👁 Reveal answer (not the buzzers again), and nobody is "next in line".
  const r2 = rolled[1];
  await page.keyboard.press('Shift+Enter');
  await stateIs((st, a) => st.phase === 'answering' && st.answering === a, r2);
  await page.keyboard.press('Enter');
  await stateIs((st) => st.phase === 'closed' && !!st.done);
  const mainNow = await page.locator('.panel [data-next]').innerText();
  assert(mainNow.startsWith('👁 Reveal answer'), `after a right answer the main button is 👁 Reveal answer (${mainNow})`);
  assert(
    (await page.locator('.panel .act button:not(.primary)', { hasText: '🔔 Open the buzzers' }).count()) === 1 && (await page.getByText(/Next in line/).count()) === 0,
    '🔔 Open the buzzers is a quiet button beside it, and nobody is “→ Next in line”',
  );
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer is showing'));
  assert(true, 'N does it: the answer is showing');

  // ---------- A dropped connection: reconnect with the same code ----------
  // (The room it comes back to can free a seat without blocking anyone.)
  await page.evaluate(() => (window.__room.features = ['teams', 'wagers', 'free']));
  await page.evaluate(() => window.__drop());
  await page.waitForFunction(() => document.querySelector('.panel .chip')?.textContent.includes('⚠'));
  assert(true, 'a dropped connection shows ⚠ on the chip');
  await page.waitForFunction(() => window.__room.sockets.length === 2 && !document.querySelector('.panel .chip')?.textContent.includes('⚠'));
  assert((await page.evaluate(() => window.__room.sockets[1].url)) === 'wss://buzz.test/ws/BCDF?host=secret-token', 'it reconnects to the same room');
  assert((await page.evaluate(() => window.__room.posts)) === 2, 'without making a new one');

  // ---------- Free seat: a player back on a new phone (no block, unlike ✕ Kick) ----------
  await say({ t: 'phones', phones: [{ conn: 'c9', seatId: seats[1].id, connected: false }] });
  await chip.click();
  const free = pop.getByRole('button', { name: 'Free Player 2’s seat (moved phone)' });
  await free.waitFor();
  assert(
    (await pop.getByRole('button', { name: 'Take Player 2’s seat back from their phone' }).innerText()).includes('Kick') && (await free.innerText()) === 'Free seat',
    'a seat whose phone is gone offers Free seat (moved phone) beside ✕ Kick',
  );
  await free.click();
  await page.waitForFunction((id) => window.__room.sent.some((m) => m.t === 'kick' && m.seatId === id && m.block === false), seats[1].id);
  await page.locator('.toast', { hasText: 'seat is free' }).waitFor();
  assert(true, 'Free seat tells the room to free it without a block, and says they can tap their name on the new phone');
  await page.keyboard.press('Escape');

  // Back to the board: the lobby, nobody locked out.
  await page.keyboard.press('Escape');
  await stateIs((s) => s.phase === 'lobby' && !s.clue && s.lockedOut.length === 0);
  assert(true, 'back to the board: the phones go back to the lobby');
  await shot('rb-4-host');

  // ---------- The audience window closed by accident: the host panel says so, and Reopen brings it back ----------
  const lost = page.locator('.panel [data-audience-lost]');
  assert((await lost.count()) === 0, 'no "Audience window closed" strip while it is open');
  await aud.close();
  await lost.waitFor();
  assert((await lost.innerText()).includes('Audience window closed: viewers see nothing'), 'closing the audience window by accident: the host panel says viewers see nothing');
  await page.waitForTimeout(1000);
  assert((await lost.count()) === 1, 'and the strip stays');
  const [aud2] = await Promise.all([page.waitForEvent('popup'), lost.getByRole('button', { name: 'Reopen (A)' }).click()]);
  watch(aud2, 'audience 2');
  await aud2.locator('.board').waitFor();
  await lost.waitFor({ state: 'detached' });
  assert(true, 'Reopen (A) opens it again, the board on it, and the strip goes');
  // A reopened window that still needs a click asks with a small chip in its corner: the stage isn't dimmed (it's on
  // stream). (Whether this browser still needs that click for a window opened by a click varies, so it's checked when it shows.)
  await aud2.waitForTimeout(300);
  const chip2 = aud2.locator('.activate');
  if (await chip2.count()) {
    const chipBox = await chip2.boundingBox();
    const vpAud = aud2.viewportSize();
    assert(chipBox.width < vpAud.width / 3 && chipBox.height < 60 && chipBox.x > vpAud.width / 2 && chipBox.y > vpAud.height / 2, `"Click to enable sound" is a small chip in the corner (${Math.round(chipBox.width)}×${Math.round(chipBox.height)}), no dimming layer over the stage`);
  } else console.log('  - (this window may already play sound: no chip to check)');

  // ---------- One window: the phones list opens over the host panel, never the stage viewers see ----------
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '📺 Audience ●' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Close it' }).click();
  if (!aud2.isClosed()) await aud2.waitForEvent('close', { timeout: 3000 });
  await page.waitForTimeout(900);
  assert((await lost.count()) === 0, 'closed by the host (📺 Audience › Close it): no "closed" strip');
  await chip.click();
  await pop.waitFor();
  await page.waitForTimeout(300);
  const popAt = await pop.boundingBox();
  const stageAt = await page.locator('.stage-box').boundingBox();
  const vp = page.viewportSize();
  assert(
    popAt.y >= stageAt.y + stageAt.height - 1 && popAt.y + popAt.height <= vp.height + 1,
    `single window: the 📱 phones list shows in the host panel, all of it in sight (${Math.round(popAt.y)}–${Math.round(popAt.y + popAt.height)}, the stage ends at ${Math.round(stageAt.y + stageAt.height)})`,
  );
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });

  // ---------- Exit › Keep & leave keeps the room: the phones wait, Resume goes back into it ----------
  const closes = () => page.evaluate(() => window.__room.sent.filter((m) => m.t === 'close').length);
  const exitKeep = async () => {
    await page.getByRole('button', { name: 'Exit' }).click();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  };
  await exitKeep();
  const roomBar = page.locator('.status-bar .room-bar');
  await roomBar.getByText('BCDF').waitFor();
  await stateIs((s) => s.status?.text === 'The host is setting up — hang on');
  await page.waitForTimeout(300);
  assert((await closes()) === 0, 'Keep & leave keeps the buzzer room: phones are told the host is setting up, not that the game is over');
  assert((await roomBar.innerText()).includes('▶ Play goes back into it'), 'the bar over the editor says the room is still open');
  assert((await page.locator('.status-bar').count()) === 1 && (await page.locator('.status-bar .kept').count()) === 1, 'one status bar over the editor: the room and the kept game on it');
  assert((await page.evaluate(() => document.scrollingElement.scrollHeight <= window.innerHeight)), 'the page itself doesn’t scroll (the bar stays in sight)');
  assert((await page.getByRole('button', { name: 'Resume with my edits' }).count()) === 0, 'nothing was edited: no "Resume with my edits"');
  await page.getByRole('button', { name: 'Resume game' }).click();
  await page.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await page.locator('.panel .chip').waitFor();
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => window.__room.posts)) === 2 && (await closes()) === 0, 'Resume goes back into the same room BCDF (no new room)');
  assert((await page.locator('.panel .chip').innerText()).startsWith('📱'), 'the 📱 chip is back in the host panel');

  // ---------- Another game: the room and its players carry over ----------
  await exitKeep();
  await roomBar.waitFor();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(page, 'Discard');
  await roomBar.getByText('▶ Play asks to keep it for this game').waitFor();
  assert(true, 'with another game open, the bar says ▶ Play asks to keep the room for it');
  await addClassicRounds(page);
  await page.getByRole('button', { name: '▶ Play' }).click();
  const keepAsk = page.getByRole('alertdialog', { name: 'Keep buzzer room BCDF and its 5 players?' });
  await keepAsk.waitFor();
  assert((await page.evaluate(() => document.activeElement?.textContent.trim())) === 'Keep room & players', '▶ Play asks: keep buzzer room BCDF and its 5 players? (Keep room & players focused)');
  await page.keyboard.press('Enter');
  await card.getByLabel('Room code BCDF').waitFor();
  assert((await page.locator('.pregame input.name').count()) === 5, 'the 5 players come along');
  assert(await card.getByLabel(/Buzzer mode/).isChecked(), 'Buzzer mode stays on');
  await stateIs((s) => s.seats.length === 5);
  assert((await page.evaluate(() => window.__room.posts)) === 2 && (await closes()) === 0, 'same room, same seats: nobody joins again');

  // ---------- ▶ Next game… from the results: the phones wait for the next game (not the last one's places) ----------
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.waitForTimeout(450);
  await page.locator('.rn > button').last().click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await page.locator('.panel .status').innerText()).includes('Title card')) await page.keyboard.press('n');
  const plays = page.locator('.fj .wagers input[data-plays]');
  await plays.first().waitFor();
  for (let i = 0; i < (await plays.count()); i++) await plays.nth(i).uncheck();
  await page.getByRole('button', { name: 'Finish game ▶' }).click();
  await stateIs((s) => s.over === true);
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: '▶ Next game…' }).click();
  const openList = page.getByRole('dialog', { name: 'Open a game' });
  if ((await Promise.race([chooser.then(() => 'picker'), openList.waitFor().then(() => 'list')])) === 'list') await page.keyboard.press('Escape');
  await stateIs((s) => s.status?.text === 'The host is setting up — hang on' && !s.over);
  assert(true, 'game over › ▶ Next game…: the phones are told the host is setting up (no longer where they came)');

  // ---------- ✕ Close the room ----------
  await roomBar.getByRole('button', { name: '✕ Close the room' }).click();
  await page.waitForFunction(() => window.__room.sent.some((m) => m.t === 'close'));
  await roomBar.waitFor({ state: 'detached' });
  assert(true, '✕ Close the room closes it (phones are told the game is over)');

  assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('remotebuzz e2e passed');
} finally {
  await browser.close();
}
