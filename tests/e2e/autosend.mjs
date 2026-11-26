// @ts-check
// Words typed on a phone and not sent go by themselves, marked unfinished (AnswerAsk.autoSend), against the real buzzer
// room (buzzer/ under `wrangler dev`), in a single window (the host panel on stream). A ✍ clue locked by its answer with
// no clock: Player 1's typed lines go as the answers lock, the phone says "⏱️ Sent as answers locked, unfinished: “…”"
// and the host's row has them with ⏱️ sent at lock; Player 2, who typed nothing, has "None sent".
// A second ✍ clue with a countdown: as it runs out, Player 1's words go ("⏱️ Sent when time ran out, unfinished: “…”.
// Finished? Tap Send answer to mark it done.", the box still open), the host panel shows ✔ ⏱️ and never the words; edited and not sent, they go again at
// the lock ("as answers locked": they weren't in at 0). Player 2's went at 0 too, then Send answer sends them as
// their own (the ⏱️ goes), and that answer stays over an edit not sent; Player 3's went at 0 and were left as they
// were: "when time ran out" and ⏱️ sent at time's up after the lock too (with a slow network, words typed between its
// own 0 and the host's clock running out reaching it don't go as "when time ran out"). A partner clue whose guesser
// types: the guess typed and not sent goes as the answer shows ("⏱️ Sent, unfinished: “…”" under the status;
// the host's guess line ⏱️ sent at lock). Then the Final: words typed and not sent go
// as its answer shows ("⏱️ Yours, unfinished: “…”" after the wager), and the reveal rows mark them ⏱️ without the words until each is revealed.
// Needs `npm ci` in buzzer/.
import { pathToFileURL } from 'node:url';
import {
  appFile,
  addClassicRounds,
  anyway,
  assert,
  assertEq,
  boardIn,
  boardTilesIn,
  failureShots,
  finalControlsIn,
  goOnCheck,
  hostPanelIn,
  launchChromium,
  leaveAnswer,
  mainButton,
  playWithPlayers,
  section,
  sleep,
  stageBoxIn,
  startBuzzer,
  startRoomOn,
  tap,
  until,
} from './helpers.mjs';

const file = appFile();
const LONG_Q =
  'Name a dog breed: one that was first kept for herding sheep or cattle on farms, or for guarding a house and its yard, or for hunting birds and rabbits in the fields, or that was bred to sit on a lap, whichever comes to mind first, and say it the way it is usually written in a book about dogs.';
const buzzer = await startBuzzer('buzzer-autosend-');
const { base } = buzzer;

/** @type {import('playwright-core').Browser | undefined} */
let browser;
/** @type {string[]} */
const errors = [];
/**
 * @param {import('playwright-core').Page} p
 * @param {string} name
 */
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
};
try {
  browser = await launchChromium();
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

  // Two ✍ clues.
  const editor = host.getByRole('dialog', { name: 'Edit clue' });
  for (const [i, q] of /** @type {const} */ ([
    // (A long question: on a small phone it doesn't fit, even at its smallest size.)
    [0, LONG_Q],
    [1, 'Name a cat breed'],
  ])) {
    await host.locator('.tile').nth(i).click();
    await editor.locator('[data-field="q"]').fill(q);
    await editor.getByLabel(/Everyone answers/).check();
    await editor.getByRole('button', { name: /Done/ }).click();
  }

  // A partner clue (Category 3 $200) whose guesser types their guess.
  await host.locator('[data-tile="2,0"]').click();
  await editor.locator('select').first().selectOption('partner');
  await editor.locator('[data-field="q"]').fill('Describe this movie');
  await editor.locator('[data-field="a"]').fill('Shrek');
  await editor.locator('[data-more-rules]').click();
  await editor.getByLabel('The guesser types their guess on their phone').check();
  await editor.getByRole('button', { name: /Done/ }).click();

  await playWithPlayers(host, 3);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  const code = await startRoomOn(card);
  /**
   * @param {string} name
   * @param {(p: import('playwright-core').Page) => Promise<unknown>} [before] what to do with the page before it opens
   */
  const phone = async (name, before) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    await before?.(p);
    await p.goto(`${base}/${code}`);
    await p.getByRole('button', { name }).click();
    await p.locator('#me').getByText(name).waitFor();
    return p;
  };
  const p1 = await phone('Player 1');
  const p2 = await phone('Player 2');
  // (Player 3's connection can be made slow: tap.)
  /** @type {any} */
  let net3;
  const p3 = await phone('Player 3', async (p) => (net3 = await tap(p)));
  await card.getByText('3 of 3 players joined').waitFor();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();

  const answersBox = host.locator('[aria-label="Answers from phones"]');
  /** @param {string} name */
  const row = (name) => answersBox.locator('li', { hasText: name });
  const small = (/** @type {import('playwright-core').Page} */ p) => p.locator('#buzz-small').innerText();
  const stageH = () => stageBoxIn(host).evaluate((e) => Math.round(e.getBoundingClientRect().height));
  /** R shows the answer: with answers still to come in, the check asks first, and R again shows it anyway. */
  const reveal = async () => {
    await host.keyboard.press('r');
    const locked = async () =>
      (await p1
        .locator('#buzz-big')
        .innerText()
        .catch(() => '')) === 'Answers locked';
    await until(async () => (await goOnCheck(host).count()) > 0 || (await locked()), { timeout: 5_000 });
    if (!(await locked())) {
      await goOnCheck(host, { ready: true }).waitFor();
      await host.keyboard.press('r');
    }
  };

  // ---------- A ✍ clue locked with no clock ----------
  section('A ✍ clue: the answers lock with words typed and not sent');
  await boardTilesIn(boardIn(stageBoxIn(host)))
    .first()
    .click();
  for (const p of [p1, p2]) await p.getByLabel(/Your answer/).waitFor();
  // A small phone: the long question takes the room kept for why an answer wasn't taken (none kept under the box), and
  // one coming (Send answer with nothing typed) moves neither the question nor the box.
  await p2.setViewportSize({ width: 320, height: 568 });
  await until(async () => (await p2.locator('#s-buzz.squeezed').count()) === 1, { timeout: 5_000 });
  const boxAt = () =>
    p2.evaluate(() =>
      ['clue', 'answer-in', 'answer-send', 'answer-err'].map((id) =>
        Math.round(/** @type {HTMLElement} */ (document.getElementById(id)).getBoundingClientRect()[id === 'answer-err' ? 'height' : 'bottom']),
      ),
    );
  const squeezed = await boxAt();
  await p2.getByRole('button', { name: 'Send answer' }).click();
  await p2.locator('#answer-err').getByText('Type an answer first.').waitFor();
  await sleep(300);
  const withErr = await boxAt();
  assert(
    squeezed[3] === 0 && withErr[3] > 0 && JSON.stringify(withErr.slice(0, 3)) === JSON.stringify(squeezed.slice(0, 3)),
    `a small phone, a long question: no room kept under the box, and a line coming there moves nothing (${squeezed} → ${withErr})`,
  );
  await p2.setViewportSize({ width: 360, height: 640 });
  await p1.getByLabel(/Your answer/).fill('line one');
  await p1.getByLabel(/Your answer/).press('Enter');
  await p1.keyboard.insertText('line two');
  await p1.locator('#answer-state').getByText('Not sent yet').waitFor();
  // (Typing alone sends nothing: the host's row still waits.)
  await sleep(500);
  assert(
    (await answersBox.locator('[data-answer-in]', { hasText: 'Player 1 …' }).count()) === 1 && !(await hostPanelIn(host).innerText()).includes('line one'),
    'typed and not sent: nothing reaches the host while the answers are open',
  );
  const before = await stageH();
  await reveal();
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  await until(async () => (await small(p1)).startsWith('⏱️ Sent'), { timeout: 5_000 });
  assertEq(
    await small(p1),
    '⏱️ Sent as answers locked, unfinished: “line one / line two”',
    'the answers lock (no clock): the words typed and not sent go by themselves, and the phone says so over them',
  );
  assertEq(await small(p2), 'None sent', 'a phone that typed nothing still says “None sent”');
  await row('Player 1').locator('[data-auto-sent]').waitFor();
  assertEq(await row('Player 1').locator('bdi').innerText(), 'line one\nline two', 'the host’s row has the words, on their lines');
  assertEq(await row('Player 1').locator('[data-auto-sent]').innerText(), '⏱️ sent at lock', 'marked ⏱️ sent at lock');
  assert(
    /may be unfinished/.test((await row('Player 1').locator('[data-auto-sent]').getAttribute('title')) ?? '') &&
      (await row('Player 2').locator('[data-auto-sent]').count()) === 0 &&
      (await row('Player 2').innerText()).includes('no answer'),
    'its title says it may be unfinished; Player 2’s row has no answer and no mark',
  );
  assertEq(await stageH(), before, 'the stage keeps its size');
  await row('Player 1')
    .getByRole('button', { name: /^Wrong: Player 1( |$)/ })
    .click();
  await p1
    .locator('#buzz.wrong #buzz-big')
    .getByText(/^✘ Wrong/)
    .waitFor();
  assert((await small(p1)).startsWith('⏱️ Sent as answers locked, unfinished:'), 'judged: the phone still says how it went in');
  await host.keyboard.press('Escape');
  await boardIn(stageBoxIn(host)).waitFor();

  // ---------- A ✍ clue whose countdown runs out ----------
  section('A ✍ clue: the countdown runs out with words typed and not sent');
  // (Player 1's phone loses its network while this clue opens and its countdown runs out: back, the box comes up with
  // time up. The last clue's words, still in its box out of sight, never go as this one's.)
  await p1.context().setOffline(true);
  await boardIn(stageBoxIn(host)).locator('.tile[data-row="0"][data-cat="1"]').click();
  for (const p of [p2, p3]) await p.getByLabel(/Your answer/).waitFor();
  // (A question that fits, on a phone as short: the room under the box stays kept, as its column is centred.)
  assert(
    (await p2.locator('#s-buzz.squeezed').count()) === 0 && (await p2.locator('#answer-err').evaluate((e) => e.getBoundingClientRect().height)) > 0,
    'a short question: the room for a line under the box is kept',
  );
  const secs = host.getByLabel('Timer seconds');
  await secs.fill('1');
  await secs.press('Enter');
  await p2.locator('#answer-clock').getByText('Time’s up').waitFor({ timeout: 10_000 });
  await p1.context().setOffline(false);
  await p1.getByLabel(/Your answer/).waitFor();
  await p1.locator('#answer-clock').getByText('Time’s up').waitFor();
  await sleep(1000);
  assert(
    (await p1.getByLabel(/Your answer/).inputValue()) === '' &&
      (await answersBox.locator('[data-answer-in]', { hasText: 'Player 1' }).innerText()).trim().endsWith('…') &&
      !(await p1.locator('#answer-state').innerText()).includes('unfinished'),
    'back online with time up: the box is empty, and the last clue’s words don’t go as this one’s answer',
  );
  await p2.getByLabel(/Your answer/).fill('Bulldog');
  await p1.getByLabel(/Your answer/).fill('Siam');
  // (Player 3's words go at 0 and are left as they are.)
  await p3.getByLabel(/Your answer/).fill('Persian');
  // (A new countdown: the one run out put away first.)
  await host.getByRole('button', { name: 'Hide timer' }).click();
  await p1.locator('#answer-clock').waitFor({ state: 'hidden' });
  // (Player 3's network slow: the host's clock running out reaches the phone a while after its own countdown did.)
  net3.delay = 1500;
  await secs.fill('3');
  await secs.press('Enter');
  await p3.locator('#answer-clock').getByText('Time’s up').waitFor({ timeout: 10_000 });
  // Typed on in that while: words after 0, which don't go as "when time ran out" when it reaches the phone. (Put back
  // as they were after, so they aren't sent at the lock either.)
  await p3.getByLabel(/Your answer/).fill('Persian cat');
  // (Long enough for the host's clock run out to reach it, and an answer it sent then to come back: 1.5 s each way.)
  await sleep(6500);
  assert(
    /^Not sent yet: (tap|click) Send answer to send it\. What the host has \(⏱️ sent when time ran out, unfinished\): “Persian”$/.test(
      await p3.locator('#answer-state').innerText(),
    ),
    `typed on just after 0, the host’s clock running out after that sends nothing more (${await p3.locator('#answer-state').innerText()})`,
  );
  await p3.getByLabel(/Your answer/).fill('Persian');
  net3.delay = 0;
  await p1.locator('#answer-clock').getByText('Time’s up').waitFor({ timeout: 10_000 });
  await p1.locator('#answer-state').getByText('⏱️ Sent when time ran out, unfinished').waitFor();
  assert(
    /^⏱️ Sent when time ran out, unfinished: “Siam”\. Finished\? (Tap|Click) Send answer to mark it done\.$/.test(
      await p1.locator('#answer-state').innerText(),
    ) &&
      (await p1.locator('#answer-send').innerText()) === 'Send answer' &&
      (await p1.locator('#answer-form').isVisible()),
    `time's up: the words go by themselves, the box stays open, and Send answer would send them as the player's own (${await p1.locator('#answer-state').innerText()})`,
  );
  assert(await p1.locator('#answer-state.unsent').isVisible(), 'the line saying they went unfinished is amber, as an edit not sent is');
  // One window: the host panel says it's in and that it went by itself, never the words.
  const chip = answersBox.locator('[data-answer-in]', { hasText: 'Player 1' });
  await chip.filter({ hasText: '✔ ⏱️' }).waitFor();
  const chip2 = answersBox.locator('[data-answer-in]', { hasText: 'Player 2' });
  await chip2.filter({ hasText: '✔ ⏱️' }).waitFor();
  const panel = await hostPanelIn(host).innerText();
  assert(
    !panel.includes('Siam') && !panel.includes('Bulldog') && !panel.includes('Persian') && !((await chip.getAttribute('title')) ?? '').includes('Siam'),
    'in one window the host panel shows ✔ ⏱️ (in, by itself), never the words',
  );
  assertEq(await stageH(), before, 'the stage keeps its size with the ⏱️ in the row');
  // Send answer after it went by itself: the player's own now, the ⏱️ gone (the room's view and the host's chip).
  await p2.getByRole('button', { name: 'Send answer' }).click();
  await p2.locator('#answer-state').getByText('✔ Sent').waitFor();
  await until(async () => !(await chip2.innerText()).includes('⏱') && (await chip2.innerText()).includes('✔'), { timeout: 5_000 });
  assert(!/⏱|sent by itself|unfinished/.test((await chip2.getAttribute('title')) ?? ''), 'sent as their own: no ⏱️ on the host’s chip or its title');
  // (Edited and not sent: the answer sent on purpose stays.)
  await p2.getByLabel(/Your answer/).fill('Bulldog mix');
  // Typed on after time's up, not sent: those go as the answers lock.
  await p1.getByLabel(/Your answer/).fill('Siamese');
  await p1.locator('#answer-state').getByText('Not sent yet').waitFor();
  assert(
    /What the host has \(⏱️ sent when time ran out, unfinished\): “Siam”$/.test(await p1.locator('#answer-state').innerText()),
    'edited: the phone says what the host has, and that it went by itself',
  );
  await reveal();
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  await until(async () => (await small(p1)).includes('Siamese'), { timeout: 5_000 });
  assertEq(
    await small(p1),
    '⏱️ Sent as answers locked, unfinished: “Siamese”',
    'at the lock the words as they are go: “when answers locked”, the clock having run out before (they weren’t in at 0)',
  );
  assertEq(await small(p2), 'Yours: “Bulldog”', 'an answer sent on purpose stays over an edit not sent (no mark)');
  assertEq(
    await small(p3),
    '⏱️ Sent when time ran out, unfinished: “Persian”',
    'words that went at 0, left as they were: “when time ran out” at the lock too (not sent again)',
  );
  await row('Player 3').getByText('“Persian”').waitFor();
  assertEq(await row('Player 3').locator('[data-auto-sent]').innerText(), '⏱️ sent at time’s up', 'the host’s row: ⏱️ sent at time’s up');
  await row('Player 1').getByText('“Siamese”').waitFor();
  assertEq(await row('Player 1').locator('[data-auto-sent]').innerText(), '⏱️ sent at lock', 'the host’s row: ⏱️ sent at lock');
  assert(
    (await row('Player 2').getByText('“Bulldog”').count()) === 1 && (await row('Player 2').locator('[data-auto-sent]').count()) === 0,
    'Player 2’s row has the answer sent, unmarked',
  );
  await host.keyboard.press('Escape');
  await boardIn(stageBoxIn(host)).waitFor();

  // ---------- A partner clue ----------
  section('A partner clue: the guess typed and not sent goes as the answer shows');
  // (Player 1 picks, and guesses with Player 2.)
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  // The picker's phone (a small one): "Your pick!" is its big line, what to do under it; the others keep their name.
  await p1.setViewportSize({ width: 320, height: 568 });
  await p1.locator('#buzz-big').getByText('Your pick!', { exact: true }).waitFor();
  const pickLines = await p1.evaluate(() =>
    ['buzz-big', 'buzz-small'].map((id) => {
      const el = /** @type {HTMLElement} */ (document.getElementById(id));
      return { text: el.textContent, px: parseFloat(getComputedStyle(el).fontSize) };
    }),
  );
  assert(
    pickLines[1].text === 'Tell the host which clue' && pickLines[0].px > pickLines[1].px && (await p2.locator('#buzz-big').innerText()) === 'Player 2',
    `the picker’s phone: “Your pick!” big, “Tell the host which clue” under it; another phone keeps its name (${JSON.stringify(pickLines)})`,
  );
  await p1.setViewportSize({ width: 360, height: 640 });
  await stageBoxIn(host).locator('.tile[aria-label^="Category 3 for $200"]').click();
  await stageBoxIn(host).locator('[data-partner-up]').waitFor();
  await host.keyboard.press('2');
  await sleep(300);
  await host.keyboard.press('Enter');
  await stageBoxIn(host).locator('[data-partner-badge]').waitFor();
  await p1.getByLabel(/Your answer/).waitFor();
  await p1.getByLabel(/Your answer/).fill('Shrek-ish');
  await sleep(500);
  const guessLine = host.locator('[data-partner-guess]');
  assertEq(await guessLine.count(), 0, 'typed and not sent: the host has no guess yet');
  await host.keyboard.press('r');
  await sleep(300);
  if (await goOnCheck(host).count()) {
    await goOnCheck(host, { ready: true }).waitFor();
    await host.keyboard.press('r');
  }
  await until(async () => (await small(p1)).includes('Shrek-ish'), { timeout: 5_000 });
  assertEq(
    await small(p1),
    '⏱️ Sent, unfinished: “Shrek-ish”',
    'the answer up: the guess typed and not sent goes, and the phone says so, short (under the status line)',
  );
  await guessLine.locator('[data-auto-sent]').waitFor();
  assert(
    (await guessLine.innerText()).includes('“Shrek-ish”') && (await guessLine.locator('[data-auto-sent]').innerText()) === '⏱️ sent at lock',
    `the host’s guess line: the words (the answer is up) and ⏱️ sent at lock (${await guessLine.innerText()})`,
  );
  assertEq(await stageH(), before, 'the stage keeps its size');
  await host.keyboard.press('Escape');
  await boardIn(stageBoxIn(host)).waitFor();

  // ---------- The Final ----------
  section('The Final: words typed and not sent go as its answer shows');
  const go = host.locator('.rn > button.next', { hasText: 'Final' });
  await go.waitFor();
  await host.waitForTimeout(450);
  await go.click();
  await host.waitForTimeout(450);
  await leaveAnswer(host).click();
  const start = host.getByRole('button', { name: 'Start the round ▶' });
  await sleep(300);
  if (await start.isVisible().catch(() => false)) await start.click();
  const boxes = finalControlsIn(host).locator('.wagers input[data-wager]');
  await boxes.first().waitFor();
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).fill('0');
  await finalControlsIn(host).click({ position: { x: 2, y: 2 } });
  await mainButton(host, 'Show question ▶').click();
  for (const p of [p1, p2]) await p.getByLabel(/Your answer/).waitFor();
  await p1.getByLabel(/Your answer/).fill('Tralaler');
  await p2.getByLabel(/Your answer/).fill('Bombardiro');
  await p2.getByRole('button', { name: 'Send answer' }).click();
  await p2.locator('#answer-state').getByText('✔ Sent').waitFor();
  await mainButton(host, '👁 Reveal answer').click();
  // (Its think clock still running, an answer not in: the check asks first.)
  await goOnCheck(host, { ready: true }).waitFor();
  await anyway(host).click();
  await goOnCheck(host).waitFor({ state: 'detached' });
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  await until(async () => (await small(p1)).includes('Tralaler'), { timeout: 5_000 });
  assertEq(
    await small(p1),
    'Your wager: $0 · ⏱️ Yours, unfinished: “Tralaler”',
    'the Final’s answer shows over words typed and not sent (its clock still running): they go, said short after the wager (its words in sight)',
  );
  const inChip = answersBox.locator('[data-answer-in]', { hasText: 'Player 1' });
  await inChip.filter({ hasText: '⏱️' }).waitFor();
  assert(!(await hostPanelIn(host).innerText()).includes('Tralaler'), 'one window: the host panel marks it ⏱️, never the words');
  assertEq(await stageH(), before, 'the stage keeps its size');
  await mainButton(host, 'Start player reveals ▶').click();
  const typed = finalControlsIn(host).locator('[data-typed]');
  await typed.first().waitFor();
  const mark = finalControlsIn(host).locator('[data-auto-sent]');
  await mark.first().waitFor();
  assert(
    (await mark.count()) === 1 &&
      (await typed.filter({ has: host.locator('[data-auto-sent]') }).innerText()).replace(/\s+/g, ' ') === '⏱️ ✍ hidden' &&
      !(await hostPanelIn(host).innerText()).includes('Tralaler') &&
      !((await typed.filter({ has: host.locator('[data-auto-sent]') }).getAttribute('title')) ?? '').includes('Tralaler'),
    'the reveal rows: Player 1’s marked ⏱️ (its title says it may be unfinished), its words hidden until revealed; Player 2’s unmarked',
  );
  assertEq(await stageH(), before, 'the stage keeps its size with the reveal rows');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Answers sent by themselves E2E passed.');
} catch (e) {
  await failureShots('autosend', browser);
  throw e;
} finally {
  await browser?.close();
  buzzer.stop();
}
