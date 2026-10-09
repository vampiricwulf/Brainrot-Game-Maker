// ✍ Everyone answers: a clue where every player types an answer on their phone, against the real buzzer room (buzzer/
// under `wrangler dev`). Only the host sees the answers; the stream sees who has answered (in a single window the host
// panel too, until the answer is up); showing the answer locks them; the host marks each ✔ / ✘. Then, with an audience
// window, a second ✍ clue: the host judges while answers are still open, and a ✔ leaves the others' countdown going.
// Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

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

  await playWithPlayers(host, 2);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
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
  // (Its score pop on stream: the audience window has the state after the ✔.)
  await aud.locator('.pop', { hasText: 'Player 1' }).first().waitFor();
  assert((await aud.locator('.timer').count()) === 1, '✔ on one answer leaves the countdown going for the others');
  await host.keyboard.press('Enter');
  await row('Player 2').getByText('✔ Right').waitFor();
  assert(true, '✔ reached with Tab and pressed with Enter: the keys go to the next ✔, and Enter marks Player 2 right (not “Select a player first”)');
  await host.keyboard.press('r');
  await aud.locator('.timer').waitFor({ state: 'detached' });
  assert(true, 'showing the answer ends it');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Everyone answers E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
