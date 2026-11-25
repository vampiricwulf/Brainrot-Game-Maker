// @ts-check
// Words typed on a phone and not sent go by themselves, marked unfinished (AnswerAsk.autoSend), against the real buzzer
// room (buzzer/ under `wrangler dev`), in a single window (the host panel on stream). A ✍ clue locked by its answer with
// no clock: Player 1's typed lines go as the answers lock, the phone says "Sent automatically when answers locked:
// unfinished" over them and the host's row has them with ⏱️ sent at lock; Player 2, who typed nothing, has "None sent".
// A second ✍ clue with a countdown: as it runs out, Player 1's words go ("Sent automatically when time ran out:
// unfinished", the box still open), the host panel shows ✔ ⏱️ and never the words; edited and not sent, they go again at
// the lock. Player 2's answer sent on purpose stays, over an edit not sent. Then the Final: words typed and not sent go
// as its answer shows, and the reveal rows mark them ⏱️ without the words until each is revealed.
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
  until,
} from './helpers.mjs';

const file = appFile();
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
    [0, 'Name a dog breed'],
    [1, 'Name a cat breed'],
  ])) {
    await host.locator('.tile').nth(i).click();
    await editor.locator('[data-field="q"]').fill(q);
    await editor.getByLabel(/Everyone answers/).check();
    await editor.getByRole('button', { name: /Done/ }).click();
  }

  await playWithPlayers(host, 2);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  const code = await startRoomOn(card);
  /** @param {string} name */
  const phone = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    await p.goto(`${base}/${code}`);
    await p.getByRole('button', { name }).click();
    await p.locator('#me').getByText(name).waitFor();
    return p;
  };
  const p1 = await phone('Player 1');
  const p2 = await phone('Player 2');
  await card.getByText('2 of 2 players joined').waitFor();
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
    await sleep(300);
    if (await goOnCheck(host).count()) {
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
  await until(async () => (await small(p1)).startsWith('Sent automatically'), { timeout: 5_000 });
  assertEq(
    await small(p1),
    'Sent automatically when answers locked: unfinished · Yours: “line one / line two”',
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
  assert((await small(p1)).startsWith('Sent automatically when answers locked: unfinished · Yours:'), 'judged: the phone still says how it went in');
  await host.keyboard.press('Escape');
  await boardIn(stageBoxIn(host)).waitFor();

  // ---------- A ✍ clue whose countdown runs out ----------
  section('A ✍ clue: the countdown runs out with words typed and not sent');
  await boardIn(stageBoxIn(host)).locator('.tile[data-row="0"][data-cat="1"]').click();
  for (const p of [p1, p2]) await p.getByLabel(/Your answer/).waitFor();
  await p2.getByLabel(/Your answer/).fill('Bulldog');
  await p2.getByRole('button', { name: 'Send answer' }).click();
  await p2.locator('#answer-state').getByText('✔ Sent').waitFor();
  // (Edited and not sent: the answer sent on purpose stays.)
  await p2.getByLabel(/Your answer/).fill('Bulldog mix');
  await p1.getByLabel(/Your answer/).fill('Siam');
  const secs = host.getByLabel('Timer seconds');
  await secs.fill('3');
  await secs.press('Enter');
  await p1.locator('#answer-clock').getByText('Time’s up').waitFor({ timeout: 10_000 });
  await p1.locator('#answer-state').getByText('Sent automatically when time ran out: unfinished').waitFor();
  assert(
    /^Sent automatically when time ran out: unfinished: “Siam”\. (Tap|Click) Send answer to send it as it is\.$/.test(
      await p1.locator('#answer-state').innerText(),
    ) &&
      (await p1.locator('#answer-send').innerText()) === 'Send answer' &&
      (await p1.locator('#answer-form').isVisible()),
    `time's up: the words go by themselves, the box stays open, and Send answer would send them as the player's own (${await p1.locator('#answer-state').innerText()})`,
  );
  // One window: the host panel says it's in and that it went by itself, never the words.
  const chip = answersBox.locator('[data-answer-in]', { hasText: 'Player 1' });
  await chip.filter({ hasText: '✔ ⏱️' }).waitFor();
  const panel = await hostPanelIn(host).innerText();
  assert(
    !panel.includes('Siam') && !panel.includes('Bulldog') && !((await chip.getAttribute('title')) ?? '').includes('Siam'),
    'in one window the host panel shows ✔ ⏱️ (in, by itself), never the words',
  );
  // Typed on after time's up, not sent: those go as the answers lock.
  await p1.getByLabel(/Your answer/).fill('Siamese');
  await p1.locator('#answer-state').getByText('Not sent yet').waitFor();
  assert(
    /What the host has \(sent automatically when time ran out: unfinished\): “Siam”$/.test(await p1.locator('#answer-state').innerText()),
    'edited: the phone says what the host has, and that it went by itself',
  );
  await reveal();
  await p1.locator('#buzz-big').getByText('Answers locked').waitFor();
  await until(async () => (await small(p1)).includes('Siamese'), { timeout: 5_000 });
  assertEq(
    await small(p1),
    'Sent automatically when time ran out: unfinished · Yours: “Siamese”',
    'at the lock the words as they are go, after the clock ran out: “when time ran out”',
  );
  assertEq(await small(p2), 'Yours: “Bulldog”', 'an answer sent on purpose stays over an edit not sent (no mark)');
  await row('Player 1').getByText('“Siamese”').waitFor();
  assertEq(await row('Player 1').locator('[data-auto-sent]').innerText(), '⏱️ sent at time’s up', 'the host’s row: ⏱️ sent at time’s up');
  assert(
    (await row('Player 2').getByText('“Bulldog”').count()) === 1 && (await row('Player 2').locator('[data-auto-sent]').count()) === 0,
    'Player 2’s row has the answer sent, unmarked',
  );
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
    'Your wager: $0 · Sent automatically when answers locked: unfinished · Yours: “Tralaler”',
    'the Final’s answer shows over words typed and not sent (its clock still running): they go, “when answers locked”',
  );
  const inChip = answersBox.locator('[data-answer-in]', { hasText: 'Player 1' });
  await inChip.filter({ hasText: '⏱️' }).waitFor();
  assert(!(await hostPanelIn(host).innerText()).includes('Tralaler'), 'one window: the host panel marks it ⏱️, never the words');
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

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Answers sent by themselves E2E passed.');
} catch (e) {
  await failureShots('autosend', browser);
  throw e;
} finally {
  await browser?.close();
  buzzer.stop();
}
