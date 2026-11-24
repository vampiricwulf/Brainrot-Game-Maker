// @ts-check
// A verdict switched on a clue (✔ after ✘): a tile reopened and the page reloaded mid-clue switches only marks from
// this opening, and 📜 Log › Scores' ↷ Restore on the mark a switch took back takes the switch back (never counted twice).
import { pathToFileURL } from 'node:url';
import {
  addClassicRounds,
  appFile,
  playWithPlayers,
  stored,
  failureShots,
  assert,
  launchChromium,
  until,
  boardIn,
  boardTilesIn,
  playerRowsIn,
  stageBoxIn,
} from './helpers.mjs';

const file = appFile();
const browser = await launchChromium();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const tile = (i) => boardTilesIn(boardIn(stageBoxIn(page))).nth(i);
const chip = () => playerRowsIn(page).first();
const money = (t) => Number(t.trim().replace('−', '-').replace(/[$,]/g, ''));
const scoreOf = async () => money(await chip().locator('.score').innerText());
const opened = () => page.waitForFunction(() => document.querySelector('.panel .status')?.textContent?.includes('Answer hidden'));
/** Waits for autosave to hold what's on screen (a reload resumes what it stored). */
async function saved() {
  const at = Date.now();
  await until(async () => (await stored(page))?.savedAt >= at, {
    timeout: 10_000,
    every: 100,
  });
}

try {
  await page.goto(pathToFileURL(file).href);
  await addClassicRounds(page);
  await playWithPlayers(page, 2);
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.getByRole('button', { name: 'Skip intro' }).click();

  // ---------- A tile played, put back, opened again and the page reloaded: its old ✘ isn't switched ----------
  await tile(0).click();
  await opened();
  await chip()
    .getByRole('button', { name: /^Wrong:/ })
    .click();
  await chip().locator('.mark.wrong').waitFor();
  const missed = await scoreOf();
  await page.waitForTimeout(700); // past Not yet's bounce guard
  await page.keyboard.press('Escape');
  await boardIn(stageBoxIn(page)).waitFor();
  await tile(0).click({ button: 'right', force: true });
  await page.getByRole('menuitem', { name: /Reopen this tile/ }).click();
  await tile(0).click();
  await opened();
  assert((await chip().locator('.mark.wrong').count()) === 0, 'the tile reopened: the earlier ✘ isn’t on the chip');
  await saved();
  await page.reload();
  await page.getByRole('button', { name: 'Resume game' }).click();
  await page.waitForFunction(() => !!document.activeElement?.matches('.mode-ask .mode.on'));
  await page.keyboard.press('Enter');
  await opened();
  assert((await chip().locator('.mark.wrong').count()) === 0, 'after a reload, still not: marks count since the tile opened again');
  await chip()
    .getByRole('button', { name: /^Right:/ })
    .click();
  await chip().locator('.mark.right').waitFor();
  assert(
    (await scoreOf()) === missed + 200 && (await chip().locator('.mark').innerText()).trim() === '✔ +$200',
    `✔ after the reload gives +$200 on top of the earlier ✘ (no switch of a mark from before it reopened): ${await scoreOf()}`,
  );
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await boardIn(stageBoxIn(page)).waitFor();

  // ---------- 📜 Log › Scores: ↷ Restore on the ✘ a switch took back takes the switch back ----------
  await tile(1).click();
  await opened();
  const before = await scoreOf();
  await chip()
    .getByRole('button', { name: /^Wrong:/ })
    .click();
  await chip().locator('.mark.wrong').waitFor();
  await chip()
    .getByRole('button', { name: /^Right:/ })
    .click();
  await chip().locator('.mark.right').waitFor();
  assert((await scoreOf()) === before + 200, '✘ then ✔ (a switch): +$200');
  await page.keyboard.press('l');
  await page.locator('aside .tab', { hasText: 'Scores' }).click();
  const restore = page.locator('aside .ev.undone').getByRole('button', { name: '↷ Restore' });
  assert(
    (await restore.count()) === 1 && (await restore.getAttribute('title')) === 'Takes back the switched verdict that replaced it',
    'the ✘ the switch took back reads undone, its ↷ Restore saying it takes the switch back',
  );
  await restore.click();
  await until(async () => (await scoreOf()) === before - 200, {
    timeout: 2_000,
    every: 100,
  });
  assert(
    (await scoreOf()) === before - 200 &&
      (await page.locator('aside .ev.undone').count()) === 1 &&
      (await page.locator('aside .ev.undone .delta').innerText()).trim().startsWith('+'),
    `↷ Restore on it: the ✘ counts and the switch is taken back (−$200, not counted twice): ${await scoreOf()}`,
  );

  assert(!errors.length, `no page errors (${errors.join(' | ')})`);
  console.log('verdictswitch: all passed');
} catch (e) {
  await failureShots('verdictswitch', browser);
  throw e;
} finally {
  await browser.close();
}
