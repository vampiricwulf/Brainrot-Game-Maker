// Wagers from phones, end to end: the built app hosts a game against the real buzzer room (buzzer/ under `wrangler dev`,
// local), with the audience window open, and players send their wagers from the real phone page. A Daily Double: its
// player's phone sends the wager (refused over the max once the host turns the limit on), the host's box fills in
// marked 📱, the others see who is wagering, and it locks when the question shows. A Final: two phones wager, change
// their minds, one reloads, the host changes one, and Show question locks them; the audience window never has an
// amount on it. Then a team: anyone on it sends the team's wager, and the host sees who; that host keeps one window
// (viewers see it), so the amounts phones send stay hidden in its panel until the reveals show them. The Final's answers
// too: typed on the phones once the question shows, only the host sees them (one window: not until each is revealed),
// and N in the reveals puts each on stream before C / X shows the wager. The team's Final has multiple choice (made in
// its editor): they show on stream under the question (the right one lit with the answer), a member taps one, and the
// reveal says whether it's the right one. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, mainButton, mainLabel, playWithPlayers, recordSeen, seenWhere, shownOf, startRoomOn } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const dir = resolve('buzzer');
if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });

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
const persist = mkdtempSync(join(tmpdir(), 'buzzer-wagers-'));
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
const shot = async (name, p) => shots && (await p.screenshot({ path: `${shots}/${name}.png` }));

/**
 * A host window with the buzzer server set, on a new game with a Jeopardy board and a Final. `seen`: it records all it
 * shows and says (recordSeen).
 */
async function newHost(viewport = { width: 1400, height: 900 }, seen = false) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  if (seen) await ctx.addInitScript(recordSeen);
  const host = watch(await ctx.newPage(), 'host');
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  return host;
}

/** Buzzer mode on (Teams too with `teams`), the room started: its code. */
async function startRoom(host, teams = false) {
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel('Open the buzzers').selectOption('host');
  if (teams) await card.getByLabel(/Teams: people join a team/).check();
  return await startRoomOn(card);
}

async function phonePage(code, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
  const p = watch(await ctx.newPage(), name);
  await p.goto(`${base}/${code}`);
  return p;
}

const big = (p) => p.locator('#buzz-big');
const small = (p) => p.locator('#buzz-small');
const form = (p) => p.locator('#wager-form');
const answerForm = (p) => p.locator('#answer-form');
/** Type an answer on a phone and send it. */
async function sendAnswer(p, words) {
  await p.locator('#answer-in').fill(words);
  await p.locator('#answer-send').click();
}
/** Type a wager on a phone and send it. */
async function sendWager(p, amount) {
  await p.locator('#wager-in').fill(String(amount));
  await p.locator('#wager-send').click();
}
const text = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
/** Every amount in `amounts` is missing from the page's text (in any of the ways it could be written). */
async function noneOf(p, amounts) {
  const t = await text(p);
  return amounts.every((n) => !t.includes(String(n)) && !t.includes(n.toLocaleString('en-US')));
}

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

  // ---------- The host: a Daily Double on the board, 3 players, the audience window ----------
  const host = await newHost();
  await host.locator('.tile').nth(3).click();
  await host.getByRole('combobox', { name: /^Type/ }).selectOption('dailyDouble');
  await host.getByRole('button', { name: 'Done' }).click();
  await playWithPlayers(host, 3);
  const code = await startRoom(host);
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.locator('.mode', { hasText: 'Separate audience window' }).click()]);
  watch(aud, 'audience');

  // Ann and Bo join from their phones (Player 3 has none).
  const join = async (name, seat) => {
    const p = await phonePage(code, name);
    await p.getByRole('heading', { name: 'Tap your name' }).waitFor();
    await p.getByRole('button', { name: seat }).click();
    await p.locator('#me').getByText(seat).waitFor();
    return p;
  };
  const ann = await join('ann', 'Player 1');
  const bo = await join('bo', 'Player 2');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();

  // ---------- A Daily Double ----------
  await host.locator('.stage-box .board .tile').nth(3).click();
  const dd = host.locator('.panel .dd', { hasText: 'Who found it?' });
  await dd.waitFor();
  assert((await form(ann).isHidden()) && (await form(bo).isHidden()), 'nobody picked for the Daily Double yet: no phone has a wager box');
  assert((await dd.innerText()).includes('Who found it? Pick a player.'), 'the host is asked “Who found it? Pick a player.”');
  assert(await dd.getByRole('button', { name: 'True Daily Double' }).isDisabled(), 'True Daily Double is off (with no amount) until a player is picked');
  assert((await dd.locator('[data-dd-phones]').innerText()).includes('Once you pick them'), 'the phones’ line is there from the start (the box doesn’t grow as a wager comes in)');
  const key1 = dd.locator('.chip .key', { hasText: '1' });
  assert(await key1.isVisible(), 'nobody picked yet: the chips show their number keys (1–9 pick who found it)');
  const ddBox = async () => Math.round((await dd.boundingBox()).height);
  const ddH = await ddBox();
  await dd.locator('.chip', { hasText: 'Player 1' }).click();
  await form(ann).waitFor();
  assert(await key1.isHidden(), 'picked: the number keys go from the chips (they type the wager now)');
  assert((await ann.locator('#wager-head').innerText()) === 'Your wager', 'the player who found it gets a wager box on their phone (“Your wager”, under “Daily Double — you’re up!”)');
  assert((await ann.locator('#wager-info').innerText()) === 'Score $0 · No limit', `with their score, and no max while the host ignores the limit (${await ann.locator('#wager-info').innerText()})`);
  await big(bo).getByText('Player 1 is wagering…').waitFor();
  assert(true, 'the other phones see "Player 1 is wagering…"');
  await dd.getByText('📱 waiting…').waitFor();
  assert(true, 'the host sees the phone can send it ("📱 waiting…")');

  // The host turns the limit on: over the max is refused, with a clear message, and nothing reaches the host.
  await dd.getByLabel('Ignore the limit').uncheck();
  await ann.waitForFunction(() => document.getElementById('wager-info').textContent === 'Score $0 · Max $1,000');
  await sendWager(ann, 5000);
  await ann.locator('#wager-err').getByText('over your max of $1,000').waitFor();
  assert((await dd.locator('input[type=number]').inputValue()) === '', 'the limit on: a wager over the max is refused on the phone ("That’s over your max of $1,000")');
  // Within it: the host's box fills in, marked 📱.
  await sendWager(ann, 777);
  await ann.locator('#wager-state').getByText('✔ Sent: $777').waitFor();
  await host.waitForFunction(() => document.querySelector('.dd input[type=number]')?.value === '777');
  await dd.getByText('📱 from phone').waitFor();
  assert(true, 'sent from the phone: the host’s wager box fills in (777) marked “📱 from phone”, and the phone says “✔ Sent: $777”');
  assert((await ddBox()) === ddH, `the Daily Double box keeps its height from the pick to the phone’s wager (${ddH}px)`);
  await shot('pw-1-dd-host', host);
  await shot('pw-2-dd-phone', ann);
  assert(await noneOf(aud, [777]), 'the audience window has no sign of the amount');
  assert(await noneOf(bo, [777]), 'nor does the other phone');
  // The host types over it: it's the host's.
  await dd.locator('input[type=number]').fill('600');
  await dd.getByText('📱 from phone').waitFor({ state: 'detached' });
  await ann.locator('#wager-state').getByText('The host has your wager as $600').waitFor();
  assert(true, 'the host types over it: the 📱 mark goes, and the phone shows the host’s amount');
  await sendWager(ann, 700);
  await host.waitForFunction(() => document.querySelector('.dd input[type=number]')?.value === '700');
  await mainButton(host).click();
  await big(ann).getByText('Wager locked').waitFor();
  assert((await small(ann).innerText()) === 'Your wager: $700', 'Show question locks it: the phone says “Wager locked · Your wager: $700”');
  // The host fixes it in the Amount box (the question is up): the phone has the host's amount, not the one it sent.
  const amountBox = host.locator('.panel .award').getByLabel('Amount');
  await amountBox.fill('500');
  await small(ann).getByText('Your wager: $500').waitFor();
  assert(true, 'the host fixes the wager in the Amount box: the phone says “Your wager: $500”, not the $700 it sent');
  await amountBox.fill('700');
  await small(ann).getByText('Your wager: $700').waitFor();
  await big(bo).getByText('Player 1 is answering').waitFor();
  assert((await small(bo).innerText()) === 'Daily Double', 'and the other phones say “Player 1 is answering · Daily Double” (no longer “wagering…”)');
  assert(await noneOf(aud, [700, 777]), 'the audience window still has no amount (until the host shows the wager)');
  // Right: Player 1 has 700 to wager in the Final.
  await host.getByRole('button', { name: 'Right: Player 1 +$700' }).click();
  await ann.locator('#me').getByText('Player 1 · $700').waitFor();
  await host.keyboard.press('Escape');

  // ---------- The Final: both phones wager ----------
  await host.waitForTimeout(450);
  await host.locator('.rn > button').last().click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Yes', exact: true }).click();
  await host.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await host.locator('.panel .status').innerText()).includes('Title card')) await host.keyboard.press('n');
  const rows = host.locator('.fj .wagers');
  await rows.waitFor();
  const row = (name) => rows.locator('.wrow', { hasText: name });
  const box = (name) => row(name).locator('input[data-wager]');
  await form(ann).waitFor();
  await form(bo).waitFor();
  assert((await ann.locator('#wager-head').innerText()) === 'Your wager', 'the Final’s wager screen (“Your wager”, under the Final’s name): every phone in it gets its wager box');
  assert(
    (await bo.locator('#wager-info').innerText()) === 'Score $0 · No limit',
    `a player with nothing to wager isn't told "Max $0" while the host ignores the limits (${await bo.locator('#wager-info').innerText()})`,
  );
  await row('Player 1').getByText('📱 waiting…').waitFor();
  assert(!(await host.evaluate(() => !!document.activeElement?.matches('input[data-wager]'))), 'phones send the wagers: no wager box takes the focus (the keys stay the host’s)');
  assert(
    (await row('Player 2').getByText('📱 can still send').count()) === 1 && (await row('Player 3').getByText('📱').count()) === 0,
    'the host sees whose phone can send one (“📱 waiting…”, or “📱 can still send” over the 0 filled in for nothing to wager); a player without a phone has no 📱',
  );

  // Ticked out: their phone says so; back in, the box is back.
  await row('Player 2').locator('input[data-plays]').uncheck();
  await big(bo).getByText('You sit this one out').waitFor();
  await row('Player 2').locator('input[data-plays]').check();
  await form(bo).waitFor();
  assert(true, 'a player ticked out sees “You sit this one out” on their phone (ticked back in, the box is back)');
  await sendWager(ann, 1234);
  await row('Player 1').getByText('📱 $1,234 from phone ✔').waitFor();
  assert((await box('Player 1').inputValue()) === '1234', 'Player 1’s wager comes in from their phone: “📱 $1,234 from phone ✔”, in their box');
  await sendWager(bo, 2222);
  await row('Player 2').getByText('📱 $2,222 from phone ✔').waitFor();
  await host.waitForTimeout(300);
  assert(await noneOf(aud, [1234, 2222]), 'the audience window never has the amounts (only the ✔ that a wager is in)');
  assert((await noneOf(ann, [2222])) && (await noneOf(bo, [1234])), 'each phone has its own amount only');
  await shot('pw-3-final-host', host);
  await shot('pw-4-final-audience', aud);

  // A change of mind before the host locks: the host's box follows, as a named step. Its name leaves the amounts out (a
  // step keeps its name: with the audience window closed, viewers would see ↶ Undo's toast and the 📜 Log).
  await sendWager(ann, 1300);
  await row('Player 1').getByText('📱 $1,300 from phone ✔').waitFor();
  const undo = await host.getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  assert(
    undo.startsWith('Undo: Player 1’s wager (from their phone) (Ctrl+Z') && !undo.includes('$'),
    `a late change before the lock: the host's box follows, one step, named without the amounts even with the audience window open (${undo})`,
  );
  // ↶ Undo puts the one before back: the phone says the host has that one (not the $1,300 it sent last); ↷ Redo, its own.
  await host.getByRole('button', { name: '↶ Undo' }).click();
  await row('Player 1').getByText('📱 $1,234 from phone ✔').waitFor();
  await ann.locator('#wager-state').getByText('The host has your wager as $1,234').waitFor();
  assert(true, '↶ Undo of a phone’s change: its phone says the host has the one before ($1,234), not the $1,300 it sent');
  await host.getByRole('button', { name: '↷ Redo' }).click();
  await row('Player 1').getByText('📱 $1,300 from phone ✔').waitFor();
  await ann.locator('#wager-state').getByText('✔ Sent: $1,300').waitFor();
  // A phone reload shows its own wager again.
  await ann.reload();
  await ann.locator('#wager-state').getByText('✔ Sent: $1,300').waitFor();
  assert((await ann.locator('#wager-in').inputValue()) === '1300', 'a phone reload comes back to its own wager');
  // The host changes Player 2's: it's the host's now (the phone says so).
  await box('Player 2').fill('2000');
  await box('Player 3').fill('5');
  await box('Player 3').press('Tab');
  assert(
    (await row('Player 2').getByText('from phone').count()) === 0 && (await row('Player 2').getByText('📱 can still send').count()) === 1,
    'the host changes a wager a phone sent: it’s the host’s now (no “from phone”)',
  );
  await bo.locator('#wager-state').getByText('The host has your wager as $2,000').waitFor();
  assert(true, 'and that phone shows the host’s amount');
  await shot('pw-5-final-phone', ann);

  // Show question (N, even from a wager box, once every wager is in): locked, and each phone gets its answer box.
  await box('Player 3').focus();
  await host.keyboard.press('n');
  await answerForm(ann).waitFor();
  await answerForm(bo).waitFor();
  assert(
    (await ann.locator('#answer-sub').innerText()) === 'Your wager: $1,300 (locked)' && (await form(ann).isHidden()),
    'Show question locks the wagers: the phone has no box to change it, its answer box instead, under “Your wager: $1,300 (locked)”',
  );
  assert((await bo.locator('#answer-sub').innerText()) === 'Your wager: $2,000 (locked)', 'the host’s change is what was locked in');
  assert((await ann.locator('#clue-cap').innerText()) === 'Final Jeopardy!', `over the question, what’s on (${await ann.locator('#clue-cap').innerText()})`);
  assert(await noneOf(aud, [1234, 1300, 2000, 2222]), 'the audience window still has no amount once the question is up');
  // The stream: ✍ and who has answered (the Final's three players), never what.
  const pill = aud.locator('[data-everyone]');
  await pill.waitFor();
  assert(
    (await pill.innerText()).includes('✍ Answers on phones') && (await pill.getByRole('img').getAttribute('aria-label')) === '0 of 3 answers in',
    'the audience window shows “✍ Answers on phones”, 0 of 3 in',
  );
  await sendAnswer(ann, 'Fleming');
  await ann.locator('#answer-state').getByText('✔ Sent: “Fleming”').waitFor();
  const answers = host.locator('.fj [aria-label="Answers from phones"]');
  await answers.locator('[data-answer-row]', { hasText: '“Fleming”' }).waitFor();
  assert((await answers.getByRole('status').innerText()).startsWith('1 of 3 in · only you see them'), 'Player 1 types “Fleming” and sends it: the host’s panel has it (only the host sees it)');
  await aud.waitForFunction(() => document.querySelector('[data-everyone] [role="img"]')?.getAttribute('aria-label') === '1 of 3 answers in');
  assert(!(await text(aud)).includes('Fleming') && !(await text(bo)).includes('Fleming'), 'the stream says 1 of 3 in, never the words; nor does the other phone have them');
  await shot('pw-6-answer-phone', ann);
  // Back to the wagers (↶ Undo), to the round before and to the Final again: the question was seen, the phones stay locked.
  await host.getByRole('button', { name: '↶ Undo' }).click();
  await host.locator('.fj button', { hasText: '◀ Previous round' }).click();
  await host.locator('.stage-box .board').waitFor();
  await host.waitForTimeout(450);
  await host.locator('.rn > button').last().click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Yes', exact: true }).click();
  await host.locator('.fj').getByText('📱 The question was on screen: phones can’t send wagers any more').waitFor();
  await big(ann).getByText('Wager locked').waitFor();
  assert((await small(ann).innerText()) === 'Your wager: $1,300' && (await form(ann).isHidden()), 'back at the wagers after a trip to the round before, the phones stay locked (the question was seen)');
  // The question again: her answer came back with the Final, on her phone and in the host's panel.
  await mainButton(host).filter({ hasText: 'Show question ▶' }).click();
  await ann.locator('#answer-state').getByText('✔ Sent: “Fleming”').waitFor();
  await answers.locator('[data-answer-row]', { hasText: '“Fleming”' }).waitFor();
  assert(true, 'Show question again: Player 1’s phone still says “✔ Sent: “Fleming””, and the host still has it');
  // The answer on screen: answers lock, each phone keeping its own (after the wager it was locked with).
  await mainButton(host).filter({ hasText: 'Reveal answer ▶' }).click();
  await big(ann).getByText('Answers locked').waitFor();
  assert((await small(ann).innerText()) === 'Your wager: $1,300 · Yours: “Fleming”', `the answer shows: “Answers locked”, with her wager and her answer (${await small(ann).innerText()})`);
  await big(bo).getByText('Answers locked').waitFor();
  assert((await small(bo).innerText()) === 'Your wager: $2,000 · None sent', 'and one who sent none: “None sent”');
  await shot('pw-6-locked-phone', ann);
  // The reveals: N puts Player 1's answer on stream, then C judges her and her wager goes up with it.
  await mainButton(host).filter({ hasText: 'Start player reveals ▶' }).click();
  const rev = (name) => host.locator('.fj .pl', { hasText: name });
  await rev('Player 1').locator('[data-typed]').waitFor();
  assert(
    (await rev('Player 1').locator('[data-typed]').innerText()) === '“Fleming”' && (await rev('Player 2').innerText()).includes('no typed answer'),
    'the reveal rows: Player 1’s typed answer (two windows: in sight), Player 2 “no typed answer”',
  );
  await rev('Player 1').locator('button.name').click();
  await mainButton(host).filter({ hasText: 'Show answer ▶' }).waitFor();
  await host.keyboard.press('n');
  await aud.locator('.spot-answer', { hasText: '“Fleming”' }).waitFor();
  assert((await aud.locator('.spot-wager').innerText()).includes('???'), 'N on Player 1: her answer goes on the audience window (“Fleming”), her wager not yet');
  await host.keyboard.press('n');
  await host.getByText('Mark Player 1 right (C) or wrong (X) first').first().waitFor();
  assert(true, 'N again: “Mark Player 1 right (C) or wrong (X) first”');
  await host.keyboard.press('c');
  await aud.locator('.spot-result', { hasText: '✔ CORRECT' }).waitFor();
  assert((await aud.locator('.spot-wager').innerText()).includes('$1,300'), 'C: CORRECT, and her wager ($1,300) goes up with it');
  // (Its fly-in done:) the card, with the answer's line, still fits above the scores.
  await aud.waitForFunction(() => document.querySelector('.spot')?.getBoundingClientRect().bottom <= document.querySelector('.score-area')?.getBoundingClientRect().top);
  assert(true, 'the spotlight card, answer line and all, fits above the scores');
  // Player 2 answered out loud: N spotlights him, N shows his wager, as before.
  await host.keyboard.press('n');
  await aud.locator('.spot-name', { hasText: 'Player 2' }).waitFor();
  await host.keyboard.press('n');
  await aud.locator('.spot-wager', { hasText: '$2,000' }).waitFor();
  assert((await aud.locator('.spot-answer').innerText()).trim() === '', 'Player 2, with no typed answer: N shows his wager, as before (his answer line stays empty)');
  await shot('pw-6b-reveal-audience', aud);

  // ---------- Teams: one wager per team, anyone on it sends it (one window: viewers see the host's panel) ----------
  const host2 = await newHost(undefined, true);
  await host2.locator('.tile').nth(3).click();
  await host2.getByRole('combobox', { name: /^Type/ }).selectOption('dailyDouble');
  await host2.getByRole('button', { name: 'Done' }).click();
  // Its Final has multiple choice, made in its editor under the ✍ switch: B is right.
  const CHOICES = ['Alpha-wqz', 'Bravo-wqz', 'Charlie-wqz', 'Delta-wqz'];
  await host2.locator('nav > button.round-tab').nth(1).click();
  await host2.getByRole('button', { name: '＋ Multiple choice' }).click();
  await host2.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Choice A');
  for (const [i, words] of CHOICES.entries()) await host2.getByLabel(`Choice ${'ABCD'[i]}`, { exact: true }).fill(words);
  await host2.locator('[data-choice-row]').nth(1).getByRole('button', { name: '✔ Right' }).click();
  await host2.locator('[data-choice-row]').nth(1).locator('button[aria-pressed="true"]').waitFor();
  const choiceUndo = await host2.locator('.editor > header button[aria-label="Undo (Ctrl+Z)"]').getAttribute('title');
  await shot('pw-10-final-choices-editor', host2);
  assert(choiceUndo === 'Undo: Marked B right on Final Jeopardy! (Ctrl+Z)', `the Final's editor: ＋ Multiple choice under the ✍ switch, ✔ Right on B a step of its own (${choiceUndo})`);
  await playWithPlayers(host2, 2);
  const code2 = await startRoom(host2, true);
  const member = async (name, team) => {
    const p = await phonePage(code2, name);
    await p.getByRole('heading', { name: 'Pick your team' }).waitFor();
    await p.getByRole('button', { name: team }).click();
    await p.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(`${name} · ${team}`).waitFor();
    return p;
  };
  const al = await member('Al', 'Player 1');
  const amy = await member('Amy', 'Player 1');
  const cy = await member('Cy', 'Player 2');
  await host2.getByRole('button', { name: 'Start game ▶' }).click();
  await host2.getByRole('button', { name: 'Skip intro' }).click();
  /** The host panel's text has none of these amounts (as "$300"). */
  const panelHides = async (amounts) => {
    const t = await host2.locator('.panel').innerText();
    return amounts.every((n) => !t.includes(`$${n.toLocaleString('en-US')}`));
  };
  // A Daily Double in one window: the box doesn't show the amount the phone sent (typed over, it's the host's).
  await host2.locator('.stage-box .board .tile').nth(3).click();
  const dd2 = host2.locator('.panel .dd', { hasText: 'Who found it?' });
  await dd2.locator('.chip', { hasText: 'Player 1' }).click();
  await form(al).waitFor();
  await sendWager(al, 345);
  await dd2.getByText('📱 from phone · sent by Al').waitFor();
  const ddIn = dd2.locator('input[type=number]');
  assert(
    (await ddIn.inputValue()) === '' && (await ddIn.getAttribute('placeholder')) === 'hidden' && (await panelHides([345])),
    'one window: a Daily Double wager sent from a phone stays hidden in the host’s box (“hidden”), viewers see the panel',
  );
  assert((await dd2.innerText()).includes('its amount stays hidden (viewers see this window)'), 'and the phones’ line says so (not “only you see it”)');
  await shot('pw-10-dd-one-window', host2);
  await ddIn.fill('400');
  await dd2.getByText('📱 from phone').waitFor({ state: 'detached' });
  assert((await ddIn.inputValue()) === '400', 'the host types over it: it’s the host’s, shown as typed');
  await ddIn.press('Escape');
  await form(al).waitFor({ state: 'hidden' });
  await host2.waitForTimeout(450);
  await host2.locator('.rn > button').last().click();
  await host2.waitForTimeout(450);
  await host2.getByRole('button', { name: 'Yes', exact: true }).click();
  await host2.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Final'));
  if ((await host2.locator('.panel .status').innerText()).includes('Title card')) await host2.keyboard.press('n');
  const rows2 = host2.locator('.fj .wagers');
  await rows2.waitFor();
  await form(al).waitFor();
  assert((await al.locator('#wager-head').innerText()) === 'Your team’s wager', 'teams: every member’s phone gets the team’s wager box');
  await sendWager(al, 300);
  const team1 = rows2.locator('.wrow', { hasText: 'Player 1' });
  await team1.getByText('📱 from phone ✔ · sent by Al').waitFor();
  assert(
    (await team1.locator('input[data-wager]').inputValue()) === '' && (await team1.locator('input[data-wager]').getAttribute('placeholder')) === 'hidden' && (await panelHides([300])),
    'one window: the Final wager a phone sent stays hidden in the host’s panel (“📱 from phone ✔ · sent by Al”, the box “hidden”)',
  );
  const undo2 = await host2.getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  assert(undo2.startsWith('Undo: Player 1’s wager (from Al’s phone)') && !undo2.includes('$'), `and ↶ Undo names the step without the amount (${undo2})`);
  await amy.locator('#wager-state').getByText('✔ Al sent $300 for your team').waitFor();
  assert((await amy.locator('#wager-in').inputValue()) === '300', 'his teammate’s box fills in with it (it had the focus as it opened, but she typed nothing)');
  assert((await amy.locator('#wager-label').innerText()) === 'Wager (only the host and your team see it)', 'teams: the box says the team sees the wager too');
  assert(await noneOf(cy, [300]), 'Al sends the team’s wager: the host sees “sent by Al”, his teammate sees it, the other team doesn’t');
  await sendWager(amy, 450);
  await team1.getByText('📱 from phone ✔ · sent by Amy').waitFor();
  assert(await panelHides([300, 450]), 'a teammate changes it: still hidden in the host’s panel');
  await al.locator('#wager-state').getByText('✔ Amy sent $450 for your team').waitFor();
  assert((await al.locator('#wager-in').inputValue()) === '450', 'a teammate changes it: still one wager for the team, and every member sees the new one');
  await shot('pw-7-team-phone', al);
  await shot('pw-8-team-host', host2);
  // The host types over the hidden wager: the step's name leaves out the amount it replaced. ↶ Undo puts the phone's back,
  // hidden again.
  const box1 = team1.locator('input[data-wager]');
  await box1.fill('500');
  await al.locator('#wager-state').getByText('The host has your wager as $500').waitFor();
  await box1.blur();
  await host2.waitForFunction(() => document.querySelector('button[title^="Undo:"]')?.getAttribute('title')?.includes('→'));
  const undo3 = await host2.getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  assert(
    undo3.startsWith('Undo: Player 1’s wager (from their phone) → $500 (Ctrl+Z') && !undo3.includes('$300') && !undo3.includes('$450'),
    `the host types over it: ↶ Undo names the step without the phone’s amount (${undo3})`,
  );
  await host2.getByRole('button', { name: '↶ Undo' }).click();
  await team1.getByText('📱 from phone ✔ · sent by Amy').waitFor();
  await al.locator('#wager-state').getByText('✔ Amy sent $450 for your team').waitFor();
  assert((await box1.inputValue()) === '' && (await panelHides([300, 450])), '↶ Undo puts the phone’s wager back, hidden again');

  // Cy (Player 2) changes name and joins Player 1 to read their wager: his phone is told one is in, not how much.
  await cy.locator('#leave').click();
  await cy.getByRole('heading', { name: 'Pick your team' }).waitFor();
  await cy.getByRole('button', { name: 'Player 1' }).click();
  await cy.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Spy');
  await cy.getByRole('button', { name: 'Join the team' }).click();
  await form(cy).waitFor();
  await cy.locator('#wager-state').getByText('wager is in with the host (not shown').waitFor();
  assert((await noneOf(cy, [450])) && (await cy.locator('#wager-in').inputValue()) === '', 'someone who joins a team after the wagers began is told one is in, never the amount');
  await shot('pw-9-late-joiner-phone', cy);
  // Back on Player 2, he'll pick for it (not the one marked ✔ Right).
  await cy.locator('#leave').click();
  await cy.getByRole('button', { name: 'Player 2' }).click();
  await cy.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Cy');
  await cy.getByRole('button', { name: 'Join the team' }).click();
  await cy.locator('#me').getByText('Cy · Player 2').waitFor();

  // The reveals, still one window: Player 1's row keeps the phone's amount hidden until the host shows it.
  await rows2.locator('.wrow', { hasText: 'Player 2' }).locator('input[data-wager]').fill('0');
  await mainButton(host2).filter({ hasText: 'Show question ▶' }).click();
  // The team's answer: anyone on it taps one of the Final's choices; in one window the host's panel says who has
  // answered, never what.
  const PICKED = `B · ${CHOICES[1]}`;
  await answerForm(amy).waitFor();
  const amyChoices = amy.locator('#answer-choices .choice');
  await amyChoices.nth(3).waitFor();
  assert(
    (await amyChoices.count()) === 4 && (await amy.locator('#answer-in').isHidden()) && (await amy.locator('#answer-sub').innerText()) === 'Your team’s wager: $450 (locked)',
    'the Final’s multiple choice: every member’s phone has its 4 choices (no box to type in), under the team’s locked wager',
  );
  await amyChoices.filter({ hasText: CHOICES[1] }).click();
  await al.locator('#answer-state').getByText('✔ Amy picked B for your team').waitFor();
  await shot('pw-11-final-choices-phone', al);
  const answers2 = host2.locator('.fj [aria-label="Answers from phones"]');
  await answers2.locator('[data-answer-in]', { hasText: 'Player 1 ✔' }).waitFor();
  const head2 = await answers2.getByRole('status').innerText();
  const chips2 = await answers2.locator('[data-answer-in]').allInnerTexts();
  assert(
    head2.includes('1 of 2 in · viewers see this window') && head2.includes('Open the 📺 audience window to read them before they go on screen') && JSON.stringify(chips2) === JSON.stringify(['Player 1 ✔', 'Player 2 …']),
    `one window: Amy taps B for her team, the panel shows “Player 1 ✔” (no letter) and says to open the audience window to read them first (${JSON.stringify(chips2)}; ${head2})`,
  );
  await cy.locator('#answer-choices .choice').filter({ hasText: CHOICES[2] }).click();
  await answers2.locator('[data-answer-in]', { hasText: 'Player 2 ✔' }).waitFor();
  /**
   * The host page never showed (nor said) the team's pick: not as “B · …”, nor its words anywhere but the stage's
   * choices under the question (every choice's words are there for all to see). With where, if it did.
   */
  const typedHidden = async (when) => {
    const found = await shownOf(host2, [PICKED]);
    const panel = await host2.locator('.panel').innerText();
    const elsewhere = await host2.evaluate(
      (w) =>
        (window.__seen ?? [])
          .map((s, i) => [String(s), window.__seenWhere?.[i]?.path ?? '?'])
          .filter(([s, p]) => s.includes(w) && !p.includes('div.choices'))
          .map(([s, p]) => `${p}: ${s}`),
      CHOICES[1],
    );
    assert(
      !found.length && !elsewhere.length && !panel.includes(CHOICES[1]) && !(await answers2.locator('[data-choice-counts]').count()),
      `${when}: the host page never showed the team’s pick, nor its panel how many picked each${found.length ? `:\n    ${(await seenWhere(host2, found)).join('\n    ')}` : ''}${elsewhere.length ? `\n    its words: ${elsewhere.join('\n    ')}` : ''}`,
    );
  };
  await typedHidden('the question');
  // The stream (one window: the host's stage) has the 4 choices under the question, none lit; with the answer, B.
  const stageStrip = host2.locator('.stage-box [data-choices]');
  assert(
    (await stageStrip.locator('.choice').count()) === 4 && (await stageStrip.locator('.choice.right').count()) === 0,
    'the stage shows the Final’s 4 choices under the question, none lit',
  );
  await mainButton(host2).filter({ hasText: 'Reveal answer ▶' }).click();
  await stageStrip.locator('.choice.right', { hasText: CHOICES[1] }).waitFor();
  assert(true, 'with the answer, the one marked ✔ Right (B) lights up');
  await mainButton(host2).filter({ hasText: 'Start team reveals ▶' }).click();
  await stageStrip.waitFor({ state: 'detached' });
  const rev1 = host2.locator('.fj .pl', { hasText: 'Player 1' });
  const revIn = rev1.locator('input[data-reveal-wager]');
  await revIn.waitFor();
  assert((await revIn.inputValue()) === '' && (await revIn.getAttribute('placeholder')) === 'hidden' && (await panelHides([450])), 'the reveals in one window: the row’s box keeps the phone’s amount hidden');
  await shot('pw-11-reveal-one-window', host2);
  // A change refused (not a whole number) or nothing typed: the box goes back as it was, hidden (not to the phone's amount).
  for (const [typed, what] of [
    ['1.5', 'refused'],
    ['', 'left empty'],
  ]) {
    await revIn.fill(typed);
    await revIn.press('Enter');
    assert((await revIn.inputValue()) === '' && (await panelHides([450])), `a change in the reveals ${what}: the box goes back to hidden, not to the phone’s $450`);
  }
  await rev1.getByRole('button', { name: 'Show wager: Player 1' }).click();
  await rev1.getByText('wager $450').waitFor();
  assert(true, 'Show wager: the row has the amount (“wager $450”) once the stage shows it');
  assert(
    (await rev1.locator('[data-typed]').innerText()) === '✍ hidden' && !(await rev1.locator('[data-pick-hint]').count()),
    'the row’s answer: “✍ hidden” (one window) until it’s on screen, and nothing yet of whether it’s right',
  );
  await typedHidden('the reveals, before Show answer');
  // C before N showed it: judging puts the answer up too, with the wager (never a blank line under ✔ CORRECT).
  await host2.keyboard.press('c');
  const spotAnswer = host2.locator('.stage-box .spot-answer');
  await spotAnswer.filter({ hasText: CHOICES[1] }).waitFor();
  assert(
    (await spotAnswer.locator('.pick-letter').innerText()) === 'B' && (await host2.locator('.stage-box .spot-result').innerText()) === '✔ CORRECT',
    'C before the answer is up: the stage’s spotlight has the team’s pick (its letter and its words) with ✔ CORRECT',
  );
  assert(
    (await rev1.locator('[data-typed]').innerText()) === PICKED && (await rev1.locator('[data-pick-hint]').innerText()) === '✔ right choice',
    `and the row: “${PICKED}”, “✔ right choice”`,
  );
  await shot('pw-12-pick-reveal-one-window', host2);
  // N, N: Player 2's pick (C) goes up; the row says it isn't B, and the main button offers ✘ Wrong first (C still works).
  await host2.keyboard.press('n');
  await mainButton(host2).filter({ hasText: 'Show answer ▶' }).waitFor();
  await host2.keyboard.press('n');
  await host2.locator('.fj .pl', { hasText: 'Player 2' }).locator('[data-pick-hint]', { hasText: '✘ not B' }).waitFor();
  const main2 = await mainLabel(host2);
  const also2 = await host2.locator('.panel [data-next-also]').allInnerTexts();
  assert(main2 === '✘ Player 2 wrong' && also2.some((t) => t.startsWith('✔ Right')), `a pick that isn't the ✔ Right one: the main button is “${main2}”, ✔ Right beside it`);

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Phone wagers E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
