// ✍ Everyone answers: a clue where every player types an answer on their phone, against the real buzzer room (buzzer/
// under `wrangler dev`). Only the host sees the answers; the stream sees who has answered (in a single window the host
// panel too, until the answer is up); showing the answer locks them; the host marks each ✔ / ✘. Then, with an audience
// window, a second ✍ clue: the host judges while answers are still open (a judged answer is locked on its phone; Ctrl+Z
// opens it again, and once it's changed ↷ Redo doesn't bring the mark back), and a ✔ leaves the others' countdown going. Then a third, with multiple choice: phones tap one, the host sees each pick and
// how many picked each (in one window only once the answer is up), the stream shows the choices under the question (the
// right one lit with the answer), and ✔ Judge all marks everyone in one step (the first right one picks next), its
// score pops above the choices. Last, a 🔁 Rematch in the same room keeps the phones' 📱 on stream. (In the editor
// first: a ✍ tile with an empty choice says so on the board, and Take the choices off leaves the keys on ＋ Multiple choice.)
// Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers, startRoomOn } from './helpers.mjs';

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
const persist = mkdtempSync(join(tmpdir(), 'buzzer-answers-'));
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

  const hostCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await hostCtx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await hostCtx.newPage(), 'host');
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);

  // ---------- The editor: the first clue is a ✍ one ----------
  await host.locator('.tile').first().click();
  const editor = host.getByRole('dialog', { name: 'Edit clue' });
  await editor.locator('[data-field="q"]').fill('Name a dog breed');
  await editor.getByLabel(/Everyone answers/).check();
  await editor.getByRole('button', { name: /Done/ }).click();
  // (And the next one along, for the audience window's part.)
  await host.locator('.tile').nth(1).click();
  await editor.locator('[data-field="q"]').fill('Name a cat breed');
  await editor.getByLabel(/Everyone answers/).check();
  await editor.getByRole('button', { name: /Done/ }).click();
  assert(true, 'a clue is set to ✍ Everyone answers in the clue editor');
  // (And a third, with multiple choice: B is right.)
  await host.locator('.tile').nth(2).click();
  await editor.locator('[data-field="q"]').fill('The capital of Sweden?');
  await editor.getByLabel(/Everyone answers/).check();
  await editor.getByRole('button', { name: '＋ Multiple choice' }).click();
  await host.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Choice A');
  // The board marks the tile while a choice is empty, as the checklist warns of it.
  const tile3 = host.locator('.tile').nth(2);
  assert(
    (await tile3.locator('.missing', { hasText: 'Empty choice' }).count()) === 1 && (await tile3.getAttribute('aria-label')).endsWith(', empty choice'),
    'with a choice still empty, its tile on the board says “Empty choice”',
  );
  for (const [l, words] of [['A', 'Paris'], ['B', 'Stockholm'], ['C', 'Oslo'], ['D', 'Bern']]) await editor.getByLabel(`Choice ${l}`, { exact: true }).fill(words);
  await tile3.getByText('Empty choice').waitFor({ state: 'detached' });
  // Take the choices off by keyboard: the keys go to ＋ Multiple choice (not the header's Next ▶), with words gone a
  // note says so (as deleting a card does), and Ctrl+Z puts them back.
  await editor.getByRole('button', { name: 'Take the choices off' }).focus();
  await host.keyboard.press('Enter');
  await host.waitForFunction(() => document.activeElement?.textContent?.trim() === '＋ Multiple choice');
  await host.locator('.toast', { hasText: /^Took the choices off .+ \$200/ }).waitFor();
  await host.keyboard.press('Control+z');
  await editor.getByLabel('Choice D', { exact: true }).waitFor();
  assert((await editor.getByLabel('Choice D', { exact: true }).inputValue()) === 'Bern', 'Take the choices off: the keys land on ＋ Multiple choice, a note says so, and Ctrl+Z puts them back');
  await editor.locator('[data-choice-row]').nth(1).getByRole('button', { name: '✔ Right' }).click();
  await editor.locator('[data-choice-row]').nth(1).locator('button[aria-pressed="true"]').waitFor();
  const choiceUndo = await host.locator('.editor > header button[aria-label="Undo (Ctrl+Z)"]').getAttribute('title');
  assert(/^Undo: Marked B right on .+ \$200 \(Ctrl\+Z\)$/.test(choiceUndo), `＋ Multiple choice gives a ✍ clue A to D, and ✔ Right on B is a step of its own (${choiceUndo})`);
  await editor.getByRole('button', { name: /Done/ }).click();

  await playWithPlayers(host, 2);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  const code = await startRoomOn(card);
  const phone = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    await p.goto(`${base}/${code}`);
    await p.getByRole('button', { name }).click();
    await p.locator('#me').getByText(name).waitFor();
    return p;
  };
  const p1 = await phone('Player 1');
  const p2 = await phone('Player 2');
  await card.getByText('2 of 2 players joined').waitFor();

  // ---------- Playing the ✍ clue ----------
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.locator('.stage-box .board .tile').first().click();
  for (const p of [p1, p2]) await p.getByLabel(/Your answer/).waitFor();
  assert((await p1.locator('#clue').innerText()).includes('Name a dog breed') && (await p1.locator('#buzz').isHidden()), 'the phones show the clue and an answer box instead of the buzzer');
  const pill = host.locator('.stage-box [data-everyone]');
  await pill.waitFor();
  assert((await pill.getByRole('img').getAttribute('aria-label')) === '0 of 2 answers in', 'the stream says everyone answers (0 of 2 in)');

  await p1.getByLabel(/Your answer/).fill('Shiba Inu');
  await p1.getByLabel(/Your answer/).press('Enter');
  await p1.locator('#answer-state').getByText('✔ Sent').waitFor();
  await p2.getByLabel(/Your answer/).fill('Corgi');
  await p2.getByRole('button', { name: 'Send answer' }).click();
  await p2.locator('#answer-state').getByText('✔ Sent').waitFor();
  assert((await p1.getByRole('button', { name: 'Change answer' }).count()) === 1, 'a phone sends its answer (Enter or the button) and can change it');
  // Edited and not sent: it says so (not "✔ Sent"), and back as it was, it's sent again.
  await p1.getByLabel(/Your answer/).fill('Shiba Inu dog');
  await p1.locator('#answer-state').getByText('Not sent yet').waitFor();
  await p1.getByLabel(/Your answer/).fill('Shiba Inu');
  await p1.locator('#answer-state').getByText('✔ Sent: “Shiba Inu”').waitFor();
  assert(true, 'an answer edited on the phone and not sent says “Not sent yet”; back as sent, “✔ Sent: …”');
  // A single window (the default) is on stream, host panel and all: there it says who has answered, never the words.
  const answersBox = host.locator('[aria-label="Answers from phones"]');
  await answersBox.locator('[data-answer-in]', { hasText: 'Player 1 ✔' }).waitFor();
  await answersBox.locator('[data-answer-in]', { hasText: 'Player 2 ✔' }).waitFor();
  const panelText = await host.locator('.panel').innerText();
  assert(
    !panelText.includes('Shiba') && !panelText.includes('Corgi') && (await answersBox.getByRole('status').innerText()).includes('viewers see this window'),
    'in a single window the host panel shows who has answered (✔), not the words, and says viewers see it',
  );
  if (process.env.SCREENSHOTS) {
    await host.screenshot({ path: `${process.env.SCREENSHOTS}/everyone-host.png` });
    await p1.screenshot({ path: `${process.env.SCREENSHOTS}/everyone-phone.png` });
  }
  await host.waitForFunction(() => document.querySelector('.stage-box [data-everyone] [role="img"]')?.getAttribute('aria-label') === '2 of 2 answers in');
  const stageText = await host.locator('.stage-box').innerText();
  assert(!stageText.includes('Shiba') && !stageText.includes('Corgi'), 'the stream shows who has answered (2 of 2), never the words');
  assert(!(await p2.content()).includes('Shiba') && !(await p1.content()).includes('Corgi'), 'no phone sees another’s answer');

  await host.keyboard.press('r');
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  assert((await p1.locator('#buzz-small').innerText()) === 'Yours: “Shiba Inu”', 'showing the answer locks them: the phone keeps its own in sight');
  const row = (id) => answersBox.locator('li', { hasText: id });
  await row('Player 1').getByText('“Shiba Inu”').waitFor();
  await row('Player 2').getByText('“Corgi”').waitFor();
  assert(true, 'then the host sees each player’s answer');

  await row('Player 1').getByRole('button', { name: 'Player 1 is right' }).click();
  await row('Player 1').getByText('✔ Right').waitFor();
  await row('Player 2').getByRole('button', { name: 'Player 2 is wrong' }).click();
  await row('Player 2').getByText('✘ Wrong').waitFor();
  await p1.locator('#me').getByText(/\$[1-9]/).waitFor();
  assert(true, '✔ / ✘ on each: Player 1 gets the clue’s points');

  await host.keyboard.press('r');
  await host.waitForTimeout(800);
  assert((await p1.locator('#buzz-big').innerText()) === 'Answers locked' && (await p1.locator('#answer-form').isHidden()), 'hiding the answer again doesn’t open them: nobody changes theirs after seeing it');
  // Still locked: the stream's ✍ pill doesn't come back (nobody is answering), and the box says the answer was up.
  await answersBox.getByRole('status').getByText('locked (the answer was on screen)').waitFor();
  assert((await pill.count()) === 0, 'hidden again: no ✍ pill on stream, and the box says “locked (the answer was on screen)”');

  // ---------- With an audience window: the host panel is off stream ----------
  await host.keyboard.press('Escape');
  await host.locator('.stage-box .board').waitFor();
  const [aud] = await Promise.all([host.waitForEvent('popup'), host.keyboard.press('a')]);
  watch(aud, 'audience');
  await aud.locator('.board').waitFor();
  await host.locator('.stage-box .board .tile[data-row="0"][data-cat="1"]').click();
  for (const p of [p1, p2]) await p.getByLabel(/Your answer/).waitFor();
  // A countdown (T): this game has none of its own.
  await host.keyboard.press('t');
  await aud.locator('.timer').waitFor();
  await p1.getByLabel(/Your answer/).fill('Siamese');
  await p1.getByLabel(/Your answer/).press('Enter');
  await p2.getByLabel(/Your answer/).fill('Bulldog');
  await p2.getByLabel(/Your answer/).press('Enter');
  await row('Player 1').getByText('“Siamese”').waitFor();
  await row('Player 2').getByText('“Bulldog”').waitFor();
  assert(
    (await answersBox.getByRole('status').innerText()).includes('only you see them') &&
      (await row('Player 1').getByRole('button', { name: 'Player 1 is right' }).count()) === 1 &&
      (await row('Player 2').getByRole('button', { name: 'Player 2 is wrong' }).count()) === 1,
    'with an audience window, the host sees the words with ✔ / ✘ while answers are still open',
  );
  // By keyboard: ✔ reached with Tab, pressed with Enter (the keys then go to the next answer's ✔).
  await row('Player 1').getByRole('button', { name: 'Player 1 is right' }).focus();
  await host.keyboard.press('Tab');
  await host.keyboard.press('Shift+Tab');
  await host.keyboard.press('Enter');
  await row('Player 1').getByText('✔ Right').waitFor();
  await host.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Player 2 is right');
  // Judged, Player 1's answer is final: the phone says it's locked, while Player 2 can still change theirs.
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  assert(
    (await p1.locator('#buzz-small').innerText()) === 'Yours: “Siamese”' && (await p2.locator('#answer-form').isVisible()),
    'an answer judged while answers are open is locked on its phone (“Yours: “Siamese””); the others stay open',
  );
  // (Its score pop on stream: the audience window has the state after the ✔.)
  await aud.locator('.pop', { hasText: 'Player 1' }).first().waitFor();
  assert((await aud.locator('.timer').count()) === 1, '✔ on one answer leaves the countdown going for the others');
  // Ctrl+Z takes the ✔ back and opens Player 1's answer again. Changed, ↷ Redo has nothing left: that ✔ was for the
  // words before, so it never lands beside the new ones.
  await host.keyboard.press('Control+z');
  await p1.getByLabel(/Your answer/).waitFor();
  await p1.getByLabel(/Your answer/).fill('Persian');
  await p1.getByLabel(/Your answer/).press('Enter');
  await row('Player 1').getByText('“Persian”').waitFor();
  await host.locator('button[title="Nothing to redo"]').waitFor();
  await host.keyboard.press('Control+Shift+z');
  assert(
    (await row('Player 1').getByText('✔ Right').count()) === 0 && (await p1.locator('#answer-form').isVisible()),
    'an answer changed after Ctrl+Z took its ✔ back: ↷ Redo doesn’t put that ✔ beside the new words, and the answer stays open',
  );
  // (Judged again, by keyboard as before: the keys go on to Player 2's ✔.)
  await row('Player 1').getByRole('button', { name: 'Player 1 is right' }).focus();
  await host.keyboard.press('Tab');
  await host.keyboard.press('Shift+Tab');
  await host.keyboard.press('Enter');
  await row('Player 1').getByText('✔ Right').waitFor();
  await host.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Player 2 is right');
  await host.keyboard.press('Enter');
  await row('Player 2').getByText('✔ Right').waitFor();
  assert(true, '✔ reached with Tab and pressed with Enter: the keys go to the next ✔, and Enter marks Player 2 right (not “Select a player first”)');
  await host.keyboard.press('r');
  await aud.locator('.timer').waitFor({ state: 'detached' });
  assert(true, 'showing the answer ends it');

  // ---------- Multiple choice: phones tap one; the host sees the picks, how many picked each, and ✔ Judge all ----------
  await host.keyboard.press('Escape');
  await host.locator('.stage-box .board').waitFor();
  await aud.locator('.board').waitFor();
  await host.locator('.stage-box .board .tile[data-row="0"][data-cat="2"]').click();
  for (const p of [p1, p2]) await p.locator('#answer-choices .choice').nth(3).waitFor();
  assert(
    (await p1.locator('#answer-choices .choice').count()) === 4 &&
      (await p1.locator('#answer-in').isHidden()) &&
      (await p1.locator('#answer-choices .choice').first().innerText()).replace(/\s+/g, ' ') === 'A Paris' &&
      (await p1.evaluate(() => document.querySelector('#answer-choices .choice:last-child').getBoundingClientRect().bottom <= innerHeight)),
    'the phones show the 4 choices as buttons, lettered A to D, in place of the box to type in, the last one on screen',
  );
  // (Player 2 taps the right one and Player 1 another: ✔ Judge all then gives Player 2 the next pick.)
  const choice = (p, words) => p.locator('#answer-choices .choice', { hasText: words });
  await choice(p2, 'Stockholm').click();
  await p2.locator('#answer-state').getByText('✔ Sent: B').waitFor();
  await choice(p1, 'Oslo').click();
  await p1.locator('#answer-state').getByText('✔ Sent: C').waitFor();
  await choice(p1, 'Paris').click();
  await p1.locator('#answer-state').getByText('✔ Sent: A').waitFor();
  assert((await choice(p1, 'Paris').getAttribute('aria-pressed')) === 'true' && (await choice(p1, 'Oslo').getAttribute('aria-pressed')) === 'false', 'a tap sends a choice at once, and another tap changes it');
  await row('Player 1').getByText('A · Paris').waitFor();
  await row('Player 2').getByText('B · Stockholm').waitFor();
  const counts = answersBox.locator('[data-choice-counts]');
  await counts.getByText('A 1 · B 1 · C 0 · D 0').waitFor();
  assert(!(await answersBox.getByRole('status').innerText()).includes('A 1'), 'with an audience window the host sees each pick by its letter, and how many picked each (not in the head’s status line)');
  assert((await answersBox.getByRole('button', { name: /Judge all/ }).count()) === 0, 'no ✔ Judge all while the picks can still change');
  if (process.env.SCREENSHOTS) {
    await host.screenshot({ path: `${process.env.SCREENSHOTS}/everyone-choices-host.png` });
    await p1.screenshot({ path: `${process.env.SCREENSHOTS}/everyone-choices-phone.png` });
  }
  // The stream: the 4 choices under the question, lettered as the phones letter them, none lit yet.
  const strip = aud.locator('[data-choices]');
  await strip.locator('.choice').nth(3).waitFor();
  assert(
    (await strip.locator('.choice').count()) === 4 &&
      (await strip.locator('.choice').nth(1).innerText()).replace(/\s+/g, ' ') === 'B Stockholm' &&
      (await strip.locator('.choice.right, .choice.dim').count()) === 0,
    'the audience window shows the 4 choices under the question, A to D, none lit before the answer',
  );
  const audText = await aud.locator('body').innerText();
  assert(!audText.includes('B · Stockholm') && !audText.includes('A · Paris') && !audText.includes('A 1 ·'), 'the audience window shows none of the picks or the counts');
  assert(!(await p2.content()).includes('A · Paris') && !(await p1.content()).includes('B · Stockholm'), 'no phone sees another’s pick');
  // A single window: the host panel is on stream again, and shows only who has answered.
  await aud.close();
  await answersBox.locator('[data-answer-in]', { hasText: 'Player 1 ✔' }).waitFor();
  const oneWindow = await host.locator('.panel').innerText();
  const chips = await answersBox.locator('[data-answer-in]').allInnerTexts();
  assert(
    !oneWindow.includes('Stockholm') && !oneWindow.includes('Paris') && !oneWindow.includes('A 1 ·') && !oneWindow.includes('Judge all') && (await counts.count()) === 0 && JSON.stringify(chips) === JSON.stringify(['Player 1 ✔', 'Player 2 ✔']),
    `in a single window, before the answer is up: names ✔ only, no picks, no letters, no counts, no ✔ Judge all (${JSON.stringify(chips)})`,
  );
  await host.keyboard.press('r');
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  await p2.locator('#buzz-big').getByText('Answers locked').waitFor();
  assert((await p1.locator('#buzz-small').innerText()) === 'Yours: A · Paris' && (await p2.locator('#buzz-small').innerText()) === 'Yours: B · Stockholm', 'showing the answer locks the picks: each phone keeps its own in sight');
  await row('Player 2').getByText('B · Stockholm').waitFor();
  await counts.getByText('A 1 · B 1 · C 0 · D 0').waitFor();
  assert(true, 'then the panel shows each pick and the counts');
  const stageStrip = host.locator('.stage-box [data-choices]');
  await stageStrip.locator('.choice.right').waitFor();
  assert(
    (await stageStrip.locator('.choice.right').innerText()).replace(/\s+/g, ' ') === '✔ Stockholm' && (await stageStrip.locator('.choice.dim').count()) === 3,
    'with the answer, the stage’s choices light the one marked ✔ Right (B), the others dimmed',
  );
  if (process.env.SCREENSHOTS) await host.screenshot({ path: `${process.env.SCREENSHOTS}/everyone-choices-locked.png` });
  const before = await p2.locator('#me').innerText();
  const picker = (name) => host.locator('.panel .p.picker', { hasText: name });
  await picker('Player 1').waitFor();
  await answersBox.getByRole('button', { name: '✔ Judge all: B is right' }).click();
  await row('Player 1').getByText('✘ Wrong').waitFor();
  await row('Player 2').getByText('✔ Right').waitFor();
  await picker('Player 2').waitFor();
  // Its score pops come in above the choices, not over them: the line they stand on (their box's foot; a pop is there
  // only a moment, so it's the box that's measured) is above the strip.
  const [popsFoot, stripTop] = await host.evaluate(() =>
    ['.stage-box .pops', '.stage-box [data-choices]'].map((q, i) => document.querySelector(q)?.getBoundingClientRect()[i ? 'top' : 'bottom'] ?? NaN),
  );
  assert(popsFoot <= stripTop, `✔ Judge all’s score pops sit above the stage’s choices (their foot at ${Math.round(popsFoot)}px, the choices’ top at ${Math.round(stripTop)}px)`);
  await p2.waitForFunction((was) => document.querySelector('#me')?.textContent !== was, before);
  const judgedUndo = await host.getByRole('button', { name: '↶ Undo' }).getAttribute('title');
  assert(
    !judgedUndo.includes('Stockholm') && !judgedUndo.includes('Paris'),
    `✔ Judge all marks Player 2 right and Player 1 wrong, as one step that names no pick, and Player 2 (the first right) picks next (${judgedUndo})`,
  );
  await host.getByRole('button', { name: '↶ Undo' }).click();
  await row('Player 1').getByRole('button', { name: 'Player 1 is wrong' }).waitFor();
  await row('Player 2').getByRole('button', { name: 'Player 2 is right' }).waitFor();
  await answersBox.getByRole('button', { name: '✔ Judge all: B is right' }).waitFor();
  await p2.locator('#me').getByText(before).waitFor();
  await picker('Player 1').waitFor();
  await host.getByRole('button', { name: '↷ Redo' }).click();
  await row('Player 1').getByText('✘ Wrong').waitFor();
  await row('Player 2').getByText('✔ Right').waitFor();
  await picker('Player 2').waitFor();
  assert(true, 'one ↶ Undo un-judges both and gives Player 1 the pick back, and ↷ Redo judges both again');

  // ---------- 🔁 Rematch in the same room: the phones still in it keep their 📱 on stream ----------
  await host.keyboard.press('Escape');
  await host.locator('.stage-box .board').waitFor();
  for (const next of ['Final', 'End game']) {
    const go = host.locator('.rn > button.next', { hasText: next });
    await go.waitFor();
    // (Each takes clicks only after a moment: the second half of a double-click doesn't count.)
    await host.waitForTimeout(450);
    await go.click();
    await host.waitForTimeout(450);
    await host.locator('.panel .confirm').getByRole('button', { name: 'Yes' }).click();
  }
  await host.getByRole('button', { name: '🔁 Rematch' }).click();
  await host.getByText('Start a rematch? Scores go back to 0.').waitFor();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: '🔁 Rematch' }).click();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.locator('.stage-box .board').waitFor();
  await host.locator('.stage-box .plate .phone').nth(1).waitFor();
  assert((await host.locator('.stage-box .plate .phone').count()) === 2, 'after 🔁 Rematch in the same room, both plates still show 📱');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Everyone answers E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
