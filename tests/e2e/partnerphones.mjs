// 🤝 A partner clue with phone buzzers, end to end (docs/PARTNER-CLUES-SPEC.md §8.2, §12.3, §13.5, §14.9, §19.4): the
// built app hosts a game against the real buzzer room (buzzer/ under `wrangler dev`, local), which takes cards and card
// files. Nobody buzzes: every phone's button greys, with who plays which part as its big line (the picker's, then the
// guesser's, say what's theirs). Nothing of the card reaches the room or a phone until the host sends it: from the tile
// opening through Show question the host's state holds no card and nothing is uploaded; ⇡ Get it ready uploads the
// card's picture with no phone getting it; then 📤 Send and start gives exactly that card to exactly the describer's
// phone, its picture as the room's file. There it waits behind Tap to see; tapped, it shows its words and its picture,
// and the host's panel says ✓ seen. The tile closing takes it away. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers, png } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
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
const persist = mkdtempSync(join(tmpdir(), 'buzzer-partner-'));
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

let browser;
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
};
/**
 * The phone's status line comes to say `text`: on its button (the big line while nobody buzzes, the small one under the
 * player's name otherwise), or over the card that took the button's place.
 */
const says = (p, text) =>
  p
    .waitForFunction((t) => ['buzz-big', 'buzz-small', 'card-status-big'].some((id) => document.getElementById(id)?.textContent === t && !!document.getElementById(id)?.getClientRects().length), text, { timeout: 8000 })
    .then(() => true, () => false);
/** Waits (up to 8 s) until pred() holds. */
const until = async (pred) => {
  for (let i = 0; i < 160; i++) {
    if (await pred()) return true;
    await sleep(50);
  }
  return false;
};
const PIC = 'kzv-ogre-pic.png';

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
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await chromium.launch({ executablePath });

  // ---------- The host: Category 1 $400 a partner clue with a card, 3 players, a room ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await ctx.newPage(), 'host');
  // Everything the host tells the room, and every card file it uploads.
  const states = [];
  const uploads = [];
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
  host.on('request', (r) => r.method() === 'POST' && /\/files$/.test(new URL(r.url()).pathname) && uploads.push(r.url()));
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  await host.locator('[data-tile="0,1"]').click();
  const dialog = host.getByRole('dialog', { name: 'Edit clue' });
  await dialog.locator('select').first().selectOption('partner');
  await dialog.locator('[data-field="q"]').fill('Describe this movie quietly-qq');
  await dialog.locator('[data-field="a"]').fill('Shrek');
  await dialog.locator('[data-field="card"]').fill('Card-only-zz words');
  await dialog.getByLabel('The guesser types their guess on their phone').check();
  // A picture from this computer on the card.
  await dialog.getByRole('tab', { name: '🤫 Card 1' }).click();
  await dialog.getByRole('button', { name: '🖼 Image' }).click();
  const [chooser] = await Promise.all([host.waitForEvent('filechooser'), host.getByRole('dialog', { name: 'Choose image' }).getByRole('button', { name: '⬆ Upload image file…' }).click()]);
  await chooser.setFiles({ name: PIC, mimeType: 'image/png', buffer: png(200, 60, 20, 640, 480) });
  await dialog.locator('.slide .el img').first().waitFor();
  await dialog.getByRole('button', { name: '📱 On their phone' }).click();
  const preview = dialog.getByRole('complementary', { name: 'Card on their phone' });
  const previewText = await preview.innerText();
  await host.screenshot({ path: 'test-results/partner-phone-preview.png' });
  assert(previewText.includes('Card-only-zz words') && (await preview.locator('img').count()) === 1, 'the card tab’s 📱 preview shows the card as a phone gets it: its words, then its picture');
  // Beside the slide editor, never over its toolbar or its Layers' buttons.
  const [pBox, seBox] = [await preview.boundingBox(), await dialog.locator('.se').boundingBox()];
  assert(pBox.x >= seBox.x + seBox.width - 1, `the preview sits beside the slide editor, not over it (preview at x ${Math.round(pBox.x)}, the editor ends at ${Math.round(seBox.x + seBox.width)})`);
  await host.getByRole('button', { name: 'Done' }).click();
  await playWithPlayers(host, 3);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  /** What each phone heard from the room. */
  const heard = {};
  const join = async (name, seat) => {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx2.newPage(), name);
    heard[name] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[name].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat }).click();
    await p.locator('#me').getByText(seat).waitFor();
    return p;
  };
  const ann = await join('ann', 'Player 1');
  const bob = await join('bob', 'Player 2');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.keyboard.press('p');
  await host.keyboard.press('1');

  /** Nothing of the card has reached the room or a phone, and nothing went up. */
  const nothingSent = (when) => {
    const all = JSON.stringify(states);
    const phones = JSON.stringify(heard);
    assert(!all.includes('"cards"') && !all.includes('Card-only-zz') && !phones.includes('Card-only-zz') && !uploads.length, `${when}: no card in the room’s state or on a phone, and no file uploaded`);
  };

  // ---------- PARTNER UP! ----------
  // (The room takes cards, so its phones get the spec's lines for it, greyed: the status line is the button's big line.)
  await host.locator('.stage-box .tile[aria-label^="Category 1 for $400"]').click();
  await host.locator('.stage-box [data-partner-up]').waitFor();
  assert(await says(ann, '🤝 Your partner clue!'), 'the picker’s phone: “🤝 Your partner clue!”');
  assert(await says(bob, '🤝 Partner clue'), 'the others: “🤝 Partner clue”');
  assert(
    (await bob.locator('#buzz-big').innerText()) === '🤝 Partner clue' && (await bob.locator('#buzz-small').innerText()) === 'Player 1 needs a partner…' && (await bob.locator('#buzz').getAttribute('aria-disabled')) === 'true',
    'every phone’s button greyed and disabled, the small line under it',
  );
  const last = () => states.at(-1);
  assert(last()?.status?.off === true && last().status.sub === 'Player 1 needs a partner…' && last().status.seatsSub === 'Spinning for your partner…', 'every phone greyed (off), with the small lines under them');
  assert((await host.locator('.stage-box .join-badge').count()) === 0, 'no join code over PARTNER UP! (nobody buzzes)');
  const panel = host.locator('[data-partner-panel]');
  assert((await panel.locator('[data-partner-files]').innerText()).includes('1 picture goes up when you send its card'), 'the panel counts the card’s picture that goes up when its card is sent (never names it)');
  await host.screenshot({ path: 'test-results/partner-phones-up.png' });
  nothingSent('the tile open');
  await host.keyboard.press('2');
  assert(await says(ann, '🤝 You two play this one!') && (await says(bob, '🤝 You two play this one!')), 'paired: both phones say “🤝 You two play this one!”');
  assert((await panel.locator('[data-partner-readiness]').innerText()).includes('📱 Player 2: phone here'), 'the readiness line: “📱 Player 2: phone here”');
  nothingSent('paired');
  // Before the question shows, no phone gets its words (nor a ✍ box), though the guesser types their guess later.
  for (const [p, name] of [[ann, 'the picker'], [bob, 'the partner']]) {
    const words = await p.locator('body').innerText();
    assert(!words.includes('quietly-qq') && !words.includes('Card-only-zz') && !(await p.getByLabel(/Your answer/).isVisible()), `before the question, ${name}’s phone has no question words, no card and no ✍ box`);
  }

  // ---------- The question ----------
  await host.keyboard.press('Enter');
  await host.locator('.stage-box [data-partner-badge]').waitFor();
  assert(await says(bob, '🤝 Player 2 describes → Player 1 guesses'), 'the describer’s phone: who plays which part');
  assert(
    last()?.status?.seatsText === '🎯 You’re guessing!' && last().status.seatsSub === 'Player 2 is describing: type your guess',
    'the guesser’s lines: “🎯 You’re guessing!” · “Player 2 is describing: type your guess”',
  );
  assert((await host.locator('.panel [data-next]').innerText()).includes('📤 Send and start'), 'the main button: 📤 Send and start');
  await sleep(300);
  nothingSent('the question up');
  // A tap does nothing: nobody buzzes on a partner clue. (The greyed button is disabled to a screen reader too, so
  // Playwright taps it only when made to.)
  await bob.locator('#buzz').tap({ force: true });
  await sleep(600);
  assert((await host.locator('.panel .status').innerText()).includes('hand out the cards') && (await host.locator('.stage-box .bell').count()) === 0, 'a tap on a phone does nothing (nobody is answering)');
  // The guesser types their guess (from the question on): their phone only.
  await ann.getByLabel(/Your answer/).waitFor();
  assert(!(await bob.getByLabel(/Your answer/).isVisible()), 'the guesser’s phone has a ✍ box for their guess, the describer’s none');
  await ann.getByLabel(/Your answer/).fill('Shrek-ish');
  await ann.getByLabel(/Your answer/).press('Enter');
  await ann.locator('#answer-state').getByText('✔ Sent').waitFor();
  const guessLine = panel.locator('[data-partner-guess]');
  await guessLine.waitFor();
  assert((await guessLine.innerText()).includes('Player 1 sent a guess') && !(await panel.innerText()).includes('Shrek-ish'), 'the host hears the guess: in one window, that it came, never the words before the answer is up');
  assert(!(await bob.locator('body').innerText()).includes('Card-only-zz'), 'the describer’s phone has no card yet');

  // ---------- ⇡ Get it ready: the picture goes up, and no phone gets anything ----------
  await panel.getByRole('button', { name: '⇡ Get it ready now' }).click();
  assert(await until(() => uploads.length === 1), 'the picture goes up to the buzzer room (one upload)');
  assert(await until(async () => (await panel.locator('[data-partner-files]').innerText()).includes('ready in the buzzer room')), 'the panel says it’s ready, counted (never named)');
  await sleep(300);
  assert(!JSON.stringify(states).includes('"cards"') && !JSON.stringify(heard).includes('Card-only-zz'), 'got ready: still no card in the room’s state, nor on a phone');

  // ---------- 📤 Send and start (Enter, a moment after the question) ----------
  await sleep(1100);
  await host.keyboard.press('Enter');
  await host.locator('.stage-box .timer').waitFor();
  assert(await until(() => last()?.cards?.length === 1 && last().cards[0].media?.[0]?.file), 'the room’s state now holds the card, its picture as the room’s file');
  const sent = last().cards[0];
  assert(
    sent.to.length === 1 && sent.to[0].seat === last().seats[1].id && sent.text === 'Card-only-zz words' && sent.role === 'Describer' && /^pc:/.test(sent.id),
    'exactly one card, to exactly the describer’s seat: its words and part, under its send’s id',
  );
  assert(!JSON.stringify(sent).includes(PIC), 'the picture’s file name never goes to the room');
  assert(uploads.length === 1, 'and nothing was uploaded again');
  assert(await until(() => heard.bob.some((m) => m.includes('Card-only-zz'))), 'the describer’s phone gets the card');
  const view = JSON.parse(heard.bob.filter((m) => m.includes('Card-only-zz')).at(-1)).view;
  assert(view.cards.list[0].media[0].file === sent.media[0].file && !('to' in view.cards.list[0]), 'with its picture as a file to fetch, and never who else it went to');
  assert(!JSON.stringify(heard.ann).includes('Card-only-zz'), 'the guesser’s phone never gets it');
  assert((await panel.locator('[data-card="1"] [data-card-state]').innerText()).includes('sent'), 'its row says it’s sent');
  await host.screenshot({ path: 'test-results/partner-phones-sent.png' });
  // On the describer's phone: in the button's place, behind Tap to see.
  const cover = bob.getByRole('button', { name: 'Tap to see' });
  await cover.waitFor();
  assert((await bob.locator('#buzz').isHidden()) && !(await bob.getByText('Card-only-zz words').isVisible()), 'the describer’s phone shows the card in the button’s place, covered');
  await cover.tap();
  await bob.getByText('Card-only-zz words').waitFor();
  const pic = bob.locator('.card img');
  await bob.waitForFunction(() => {
    const img = document.querySelector('.card img');
    return !!img && img.src.startsWith('blob:') && img.complete && img.naturalWidth === 640;
  });
  assert((await pic.getAttribute('alt')) === 'Picture' && !(await bob.locator('body').innerText()).includes(PIC), 'tapped: its words and its picture, fetched from the room (never its file name)');
  await bob.screenshot({ path: 'test-results/partner-phones-card.png' });
  assert(await until(async () => (await panel.locator('[data-card="1"] [data-card-state]').innerText()).includes('✓ seen')), 'the host’s row says ✓ seen');
  assert(!(await ann.locator('.card').count()) && (await ann.getByLabel(/Your answer/).isVisible()), 'the guesser’s phone has no card, only its box for the guess');
  await sleep(1100);
  await host.keyboard.press('Enter');
  assert(
    (await says(bob, '✔ Got it! Player 2 +$400 · Player 1 +$200')) && last()?.status?.text === '✔ Got it! Player 2 +$400 · Player 1 +$200' && !last().status.seats,
    'judged: every phone says “✔ Got it! Player 2 +$400 · Player 1 +$200”',
  );
  assert(last()?.cards?.length === 1 && last().answers?.open === false, 'the card stays out after judging, and the guess box is locked');
  await host.keyboard.press('r');
  assert(await says(bob, '🤝 Player 2 described → Player 1 guessed'), 'the answer up: “🤝 Player 2 described → Player 1 guessed”');
  assert((await guessLine.innerText()).includes('“Shrek-ish”'), 'and the guess shows in the panel once the answer is up');
  await host.keyboard.press('Escape');
  assert(await says(ann, 'Your pick! Tell the host which clue'), 'back on the board, the phones are as before');
  assert(await until(() => !('cards' in (last() ?? {}))), 'and the room’s state has no card any more');
  assert(await until(async () => !(await bob.locator('.card').count()) && (await bob.locator('#buzz').isVisible())), 'and the describer’s phone drops it, its button back');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner clue phones E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
