// @ts-check
// A reload mid-game in one window opens on the game's cover card (the window is the one on stream). The card sits in a
// box the stage's size and place in the game (16:9, the host panel's height under it), its words sized to that box, and
// Resume game / Go to the editor go under it, where the host panel is: a capture of just the stage (an OBS crop) shows
// the whole card and none of the host's buttons, at 1280×720, 1366×768 and 1920×1080.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { appFile, failureShots, launchChromium, openGameFile, assert, boardIn, stageBoxIn, statusLineIn, resultsPath } from './helpers.mjs';

const url = pathToFileURL(appFile()).href;
const browser = await launchChromium();
const errors = [];

const slide = (t) => ({
  background: {},
  elements: [
    {
      id: `t_${t.replace(/\W/g, '')}`,
      kind: 'text',
      text: t,
      x: 120,
      y: 90,
      w: 1680,
      h: 900,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      font: 'Arial',
      size: 110,
      weight: 700,
      italic: false,
      underline: false,
      uppercase: false,
      color: '#ffffff',
      align: 'center',
      vAlign: 'middle',
      lineHeight: 1.2,
      letterSpacing: 0,
      autoFit: true,
    },
  ],
});
const clue = (id, q) => ({ id, value: null, type: 'standard', questionSlide: slide(q), answerSlide: slide(`${q}: the answer`) });
const game = {
  id: 'g_reloadcover',
  version: 2,
  title: 'Reload cover',
  settings: {
    allowNegativeScores: true,
    deductOnWrong: true,
    defaultTimerSeconds: 20,
    finalTimerSeconds: 30,
    currencySymbol: '$',
    rollOffDie: 20,
    pickerFollowsAward: true,
    timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' },
  },
  players: [
    ['Ann', '#e6194b'],
    ['Bob', '#3cb44b'],
  ].map(([name, color], i) => ({ id: `p${i + 1}`, name, color })),
  rounds: [
    {
      id: 'r_b',
      name: 'Board',
      mode: 'board',
      values: [200, 400],
      dailyDoubleCount: 0,
      categories: [{ id: 'c0', title: 'Facts', clues: [clue('qa', 'Question one'), clue('qb', 'Question two')] }],
    },
  ],
  media: [],
  audio: {},
  dice: [],
  theme: {},
  wheels: [],
};
const gameFile = resultsPath('reloadcover.json');
writeFileSync(gameFile, JSON.stringify(game));

const SIZES = [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  // (Narrow and tall, a tablet on its side: the stage takes the width, not the height.)
  [820, 1180],
];
const rect = (loc) =>
  loc.evaluate((e) =>
    (({ left, top, right, bottom }) => ({ left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom) }))(
      e.getBoundingClientRect(),
    ),
  );
const same = (a, b) => ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(a[k] - b[k]) <= 1);
const inside = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

let page;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await openGameFile(page, gameFile);
  await page.getByText(/^Opened “/).waitFor();
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.locator('.mode', { hasText: 'Single window' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await boardIn(stageBoxIn(page)).locator('.tile[data-clue="qa"]').click();
  await statusLineIn(page, { hasText: 'Answer hidden' }).waitFor();

  // The stage's place in the game at each size (what a capture of the stage crops to).
  const stageAt = {};
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    stageAt[w] = await rect(stageBoxIn(page).locator('.stage'));
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  const cover = page.getByRole('region', { name: 'Game paused' });
  await cover.waitFor();
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const card = await rect(cover.locator('.cover-card'));
    const host = await rect(cover.locator('.cover-host'));
    const fs = await cover.locator('.cover-card').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const st = stageAt[w];
    assert(
      inside(card, st) && host.top >= st.bottom - 0.5,
      `${w}×${h}: a capture of just the stage shows the whole card and none of Resume game / Go to the editor (${JSON.stringify({ stage: st, card, host })})`,
    );
    const box = await rect(cover.locator('.cover-stage'));
    assert(
      same(box, st) && fs >= (st.right - st.left) * 0.05,
      `${w}×${h}: the card's box is the stage's size and place, its words sized to it (${JSON.stringify({ box, fs })})`,
    );
  }
  assert(
    (await cover.getByRole('button', { name: 'Resume game' }).count()) === 1 && (await cover.getByRole('button', { name: 'Go to the editor' }).count()) === 1,
    'Resume game and Go to the editor are there',
  );
  // Resume game's question (how the game is shown) fits under the box too, scrolling there, never over the card.
  await page.setViewportSize({ width: 1280, height: 720 });
  await cover.getByRole('button', { name: 'Resume game' }).click();
  await page.locator('.mode-ask .mode').first().waitFor();
  const [box, host] = [await rect(cover.locator('.cover-stage')), await rect(cover.locator('.cover-host'))];
  assert(
    same(box, stageAt[1280]) && host.top >= box.bottom && host.bottom <= 720,
    `Resume game's question stays under the box, the box where it was (${JSON.stringify({ box, host })})`,
  );
  // The question focuses the picked mode a frame after it shows; Enter before that would go nowhere.
  await page.waitForFunction(() => document.activeElement?.matches('.mode-ask .mode.on'));
  await page.keyboard.press('Enter');
  await statusLineIn(page, { hasText: 'Answer hidden' }).waitFor();
  assert(true, 'and Enter goes back into the game');

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Reload cover E2E passed.');
} catch (e) {
  await failureShots('reloadcover', page);
  throw e;
} finally {
  await browser.close();
}
