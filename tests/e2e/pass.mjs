// Pass, end to end: the built app hosts a game with phone buzzers against the buzzer room (buzzer/ under `wrangler dev`,
// local, never the real server), with phones for Ann (390×844), Bob (360×640) and Cat (a desktop window, keys only).
// 1. On an ordinary buzz-in clue each phone has Pass under the buzzer: a pass (a double tap passes once) blocks the buzz
//    until it's taken back; the host sees "Passed 1 of 3: Ann" in the buzzers' row and the chips of who passed fade;
//    once everyone still able to buzz passed (a wrong answer counts as out), the host's row says "Everyone passed",
//    👁 Reveal answer wears the ring and a running countdown stops (Ctrl+Z brings it back); Cat takes the pass back with
//    P; ↺ Reset buzzers (0) starts the passes over, and Ctrl+Z of it brings them back; the answer up, Pass can't be pressed.
// 2. No Pass on a clue ticked Everyone must play (no Pass) in the editor, nor on a ✍ clue (whose tick is fixed on).
// 3. Teams: a pass counts for the team (a teammate's phone says who passed, and can take it back).
// Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { editorReady, openGameFile, startBuzzer, startRoomOn } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
mkdirSync('test-results', { recursive: true });
const shots = process.env.PASS_SHOTS ? resolve(process.env.PASS_SHOTS) : null;
if (shots) mkdirSync(shots, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const text = (id, t) => ({ id, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 72, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
const cats = ['Memes', 'Rizz', 'Lore'];
/** Lore's first tile is a ✍ clue (everyone answers on their phone). */
const game = (teams = false) => ({
  id: teams ? 'g_pass_teams' : 'g_pass',
  version: 2,
  title: teams ? 'Pass Teams' : 'Pass Night',
  settings: {
    allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: 15, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
    roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, buzzer: true, ...(teams ? { buzzTeams: true } : {}),
  },
  players: (teams ? ['Red', 'Blue'] : ['Ann', 'Bob', 'Cat']).map((name, i) => ({ id: `p${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 0 })),
  rounds: [
    {
      id: 'r_board', name: 'Jeopardy!', mode: 'board', values: [200, 400], dailyDoubleCount: 0,
      categories: cats.map((c, ci) => ({
        id: `cat${ci}`,
        title: c,
        clues: [0, 1].map((ri) => ({ id: `c${ci}_${ri}`, value: null, type: 'standard', questionSlide: slide(`q${ci}_${ri}`, `${c} question ${ri}`), answerSlide: slide(`a${ci}_${ri}`, `Answer ${ci}.${ri}`), ...(ci === 2 && !ri ? { everyone: true } : {}) })),
      })),
    },
  ],
  media: [], audio: {}, theme: {}, wheels: [], dice: [], statFields: [], items: [],
});
const gameFile = resolve('test-results/pass.json');
writeFileSync(gameFile, JSON.stringify(game()));
const teamsFile = resolve('test-results/pass-teams.json');
writeFileSync(teamsFile, JSON.stringify(game(true)));

const buzzer = await startBuzzer('buzzer-pass-');
const browser = await chromium.launch({ executablePath });
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  return p;
};

/** The host at 1280×720 on the game's pre-game screen, phone buzzers on, its room started: the page and the room's code. */
async function host(from, edit) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((s) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: s }));
    } catch {}
  }, buzzer.base);
  const page = watch(await ctx.newPage(), 'host');
  await page.goto(pathToFileURL(file).href);
  await openGameFile(page, from);
  await page.getByText(/^Opened “/).waitFor();
  await editorReady(page);
  if (edit) await edit(page);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  const card = page.getByRole('region', { name: 'Phone buzzers' });
  const code = await startRoomOn(card);
  return { ctx, page, card, code };
}

/** A phone on the room: a touch screen of `w`×`h`, or (`desk`) a desktop window with a mouse and keys. */
async function phone(name, code, { w = 390, h = 844, desk = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(desk ? {} : { hasTouch: true, isMobile: true }) });
  const p = watch(await ctx.newPage(), name);
  await p.goto(`${buzzer.base}/${code}`);
  await p.locator('#seat-list button.seat').first().waitFor();
  return p;
}
async function sit(p, name) {
  await p.locator('#seat-list button.seat', { hasText: name }).first().click();
  await p.locator('#me').getByText(name).waitFor();
}

const big = (p) => p.locator('#buzz-big').innerText();
const passBtn = (p) => p.locator('#pass');
/** Pass is up and can be pressed (in sight), saying `words`. */
const passSays = async (p, words) => (await passBtn(p).isVisible()) && (await passBtn(p).innerText()) === words;
const row = (page) => page.locator('.panel [data-buzzrow]');
const main = (page) => page.locator('.panel [data-next]');
const ringed = (page) => main(page).evaluate((b) => b.classList.contains('ring'));
const stageSize = (page) =>
  page.locator('.stage-box .stage').evaluate((s) => {
    const r = s.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  });
/** The stage's size once it has stopped changing. */
async function settledStageSize(page) {
  let was = '';
  for (let i = 0; i < 40; i++) {
    const now = await stageSize(page);
    if (now === was) return now;
    was = now;
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  throw new Error(`the stage never settled at one size (last ${was})`);
}
const shot = async (p, name) => shots && (await p.screenshot({ path: `${shots}/${name}.png` }));

async function start(page) {
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.stage-box .board').waitFor();
}
async function openTile(page, id) {
  await page.locator(`.stage-box .board .tile[data-clue="${id}"]`).click();
  await page.locator('.panel .status', { hasText: 'Answer hidden' }).waitFor();
}

try {
  // ---------- 1. An ordinary clue: Pass, the buzz it blocks, everyone passed ----------
  console.log('An ordinary buzz-in clue:');
  // In the editor: Rizz's first tile is ticked Everyone must play (no Pass); Lore's ✍ one shows it ticked and fixed.
  const { page, card, code } = await host(gameFile, async (page) => {
    await page.locator('.tile[data-place="clue:c1_0"]').click();
    const editor = page.getByRole('dialog', { name: 'Edit clue' });
    const must = editor.getByLabel('Everyone must play (no Pass)');
    assert(!(await must.isChecked()), 'the clue editor has an Everyone must play (no Pass) tick, off by default');
    await must.check();
    await editor.getByRole('button', { name: /Done/ }).click();
    await page.locator('.tile[data-place="clue:c2_0"]').click();
    const fixed = editor.getByLabel('Everyone must play (no Pass)');
    assert((await fixed.isChecked()) && (await fixed.isDisabled()), 'a ✍ clue shows it ticked and fixed (everyone answers it anyway)');
    await editor.getByRole('button', { name: /Done/ }).click();
    // A Daily Double and a partner clue: the same, ticked and fixed; back to Standard, it's the author's again (off).
    await page.locator('.tile[data-place="clue:c0_1"]').click();
    for (const type of ['dailyDouble', 'partner']) {
      await editor.getByRole('combobox', { name: /^Type/ }).selectOption(type);
      assert((await fixed.isChecked()) && (await fixed.isDisabled()), `a ${type === 'partner' ? 'partner clue' : 'Daily Double'} shows it ticked and fixed`);
    }
    await editor.getByRole('combobox', { name: /^Type/ }).selectOption('standard');
    assert(!(await fixed.isChecked()) && (await fixed.isEnabled()), 'made Standard again, the tick is the author’s to set (off)');
    await editor.getByRole('button', { name: /Done/ }).click();
    // (Undo the three type changes, so the game played below is the one written above: a partner clue leaves its card.)
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
    await page.locator('.tile[data-place="clue:c0_1"]').click();
    assert((await editor.getByRole('combobox', { name: /^Type/ }).inputValue()) === 'standard', 'Ctrl+Z ×3 takes the type changes back');
    await editor.getByRole('button', { name: /Done/ }).click();
  });
  const ann = await phone('ann', code);
  const bob = await phone('bob', code, { w: 360, h: 640 });
  const cat = await phone('cat', code, { w: 1280, h: 720, desk: true });
  await sit(ann, 'Ann');
  await sit(bob, 'Bob');
  await sit(cat, 'Cat');
  await card.getByText('3 of 3 players joined').waitFor();
  await start(page);
  assert((await passBtn(ann).isHidden()) && (await passBtn(cat).isHidden()), 'on the board no phone has Pass');

  await openTile(page, 'c0_0');
  await ann.locator('#buzz.armed').waitFor();
  assert(
    (await passSays(ann, 'Pass: I won’t buzz on this one')) && (await passSays(bob, 'Pass: I won’t buzz on this one')) && (await passSays(cat, 'Pass: I won’t buzz on this one')),
    'an ordinary clue: every phone has Pass under BUZZ!, "I won’t buzz on this one"',
  );
  assert((await cat.locator('#keys').innerText()) === 'Press Space to buzz · P to pass', `a desktop phone page says its key: P (${await cat.locator('#keys').innerText()})`);
  // (Its layout box, without the armed pulse's scale: the button grows and shrinks while it waits for a buzz;
  // taken once the page has settled, the same twice 200ms apart.)
  const layoutBox = (loc) => loc.evaluate((el) => {
    let y = 0;
    for (let e = el; e; e = e.offsetParent) y += e.offsetTop;
    return { y, height: el.offsetHeight };
  });
  const settledBox = async (loc) => {
    let last = await layoutBox(loc);
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      const b = await layoutBox(loc);
      if (b.y === last.y && b.height === last.height) return b;
      last = b;
    }
    return last;
  };
  const at = await settledBox(ann.locator('#buzz'));
  // A small phone (360×640): BUZZ! and Pass fit on the screen, so a quick press never scrolls the page instead.
  const bobFits = await bob.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight]);
  assert(bobFits[0] <= bobFits[1], `at 360×640, BUZZ! with Pass under it fits the screen: nothing to scroll (${bobFits.join(' ≤ ')})`);
  const size0 = await settledStageSize(page);
  await shot(ann, 'ann-390-armed');
  await shot(bob, 'bob-360-armed');
  await shot(cat, 'cat-desk-armed');

  // Ann passes with a double tap: once (not passed and taken back).
  await passBtn(ann).dblclick();
  await ann.locator('#pass.passed').waitFor();
  await sleep(800);
  assert((await big(ann)) === 'You passed' && (await passBtn(ann).innerText()) === 'Take back my pass', 'Ann passes (a double tap passes once): her buzzer says You passed, Pass says Take back my pass');
  const at2 = await settledBox(ann.locator('#buzz'));
  assert(at && at2 && Math.abs(at.y - at2.y) < 1 && Math.abs(at.height - at2.height) < 1, `and BUZZ! stays where it was (${JSON.stringify([at, at2])})`);
  await row(page).getByText('Passed 1 of 3: Ann').waitFor();
  assert(
    (await row(page).getByText(/Buzzers open/).count()) === 0,
    'the host sees "Passed 1 of 3: Ann" in the buzzers’ row, the count first (the 🔔 Buzzers open hint gives it its room)',
  );
  await shot(ann, 'ann-390-passed');
  if (shots) {
    // (On its side, and at 360×640: Pass in sight, nothing over BUZZ!.)
    await ann.setViewportSize({ width: 844, height: 390 });
    await sleep(300);
    await shot(ann, 'ann-844-passed');
    await ann.setViewportSize({ width: 390, height: 844 });
  }
  // Her buzz does nothing now.
  await ann.locator('#buzz').click({ force: true });
  await sleep(600);
  assert((await big(ann)) === 'You passed' && (await page.locator('.panel .buzz-queue').count()) === 0, 'a press on her buzzer does nothing while she has passed');
  // Taken back: she can buzz again.
  await passBtn(ann).click();
  await ann.locator('#buzz.armed').waitFor();
  await row(page).getByText(/^Passed \d/).waitFor({ state: 'detached' });
  assert((await passBtn(ann).innerText()) === 'Pass: I won’t buzz on this one', 'Take back my pass: BUZZ! again, and the host’s row no longer names her');

  // Everyone passes: Ann, Bob, and Cat with P.
  await passBtn(ann).click();
  await passBtn(bob).click();
  await row(page).getByText('Passed 2 of 3: Ann, Bob').waitFor();
  assert(!(await ringed(page)), 'two of three passed: no ring yet');
  // Who passed shows on the players' chips too: faded, "passed" in the mark's place (the chip keeps its width).
  const chip = (name) => page.locator('.panel .players .p', { has: page.locator('.who', { hasText: name }) });
  const fade = async (name) => [await chip(name).evaluate((e) => e.classList.contains('passed') && getComputedStyle(e).opacity), (await chip(name).locator('.mark').innerText()).trim()];
  assert(
    JSON.stringify(await fade('Ann')) === JSON.stringify(['0.55', 'passed']) && JSON.stringify(await fade('Bob')) === JSON.stringify(['0.55', 'passed']) && (await fade('Cat'))[0] === false,
    `Ann's and Bob's chips fade, with "passed" on them; Cat's doesn't (${JSON.stringify([await fade('Ann'), await fade('Cat')])})`,
  );
  // The countdown going as the last one passes: it stops (no "Time's up" for nobody on stream); Ctrl+Z brings it back.
  await page.keyboard.press('t');
  await page.locator('.stage-box .timer').waitFor();
  const size1 = await settledStageSize(page);
  if (shots)
    for (const [w, h] of [[1366, 768], [1920, 1080], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      await settledStageSize(page);
      await shot(page, `host-${w}-passed-two`);
    }
  await cat.keyboard.press('p');
  await row(page).getByText('Everyone passed: reveal the answer').waitFor();
  await page.locator('.stage-box .timer').waitFor({ state: 'detached' });
  assert(true, 'everyone passed with the countdown going: it stops');
  await page.keyboard.press('Control+z');
  await page.locator('.stage-box .timer .num').waitFor();
  assert(+(await page.locator('.stage-box .timer .num').innerText()) > 0 && (await big(cat)) === 'You passed', 'Ctrl+Z brings the countdown back, with the passes as they were');
  await page.keyboard.press('Control+y');
  await page.locator('.stage-box .timer').waitFor({ state: 'detached' });
  assert(true, 'and Ctrl+Y stops it again');
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.classList.contains('ring'));
  assert(
    (await main(page).innerText()).startsWith('👁 Reveal answer') && (await page.locator('.panel .status .say').innerText()).includes('everyone passed'),
    'Cat passes with P: the host’s row says Everyone passed, 👁 Reveal answer wears the ring, the status line says so',
  );
  await shot(page, 'host-1280-everyone-passed');
  // The phones are told too, and never what comes next (the host may reset the buzzers and give a hint).
  await ann.locator('#buzz-small', { hasText: 'Everyone passed' }).waitFor();
  await bob.locator('#buzz-small', { hasText: 'Everyone passed' }).waitFor();
  assert(
    (await ann.locator('#buzz-small').innerText()) === 'Everyone passed · take the pass back to buzz' && (await passBtn(ann).innerText()) === 'Take back my pass' && !/answer|next/i.test(await bob.locator('#buzz-small').innerText()),
    'every phone says Everyone passed (and the pass can still be taken back), never what comes next',
  );
  await shot(bob, 'bob-360-everyone-passed');
  assert(
    !(await page.locator('.panel .status .say').innerText()).includes('reveal the answer'),
    'the status line says where the clue stands (everyone passed); the buzzers’ row alone says to reveal the answer',
  );
  // Enter with nobody selected: nobody is left to award, so it says N reveals the answer (not “Select a player first”).
  await page.keyboard.press('Enter');
  await page.locator('.toast', { hasText: 'Everyone passed: N reveals the answer' }).waitFor();
  assert((await page.locator('.toast', { hasText: 'Select a player first' }).count()) === 0, 'Enter after everyone passed: the hint names N, not “Select a player first”');
  const size2 = await settledStageSize(page);
  assert(size0 === size1 && size1 === size2, `one window: the stage keeps its size as players pass and everyone has (${size0}, ${size1}, ${size2})`);
  await shot(cat, 'cat-desk-passed');
  assert((await cat.locator('#keys').innerText()) === 'Press P to take back the pass', 'Cat’s key hint now says P takes it back (Space does nothing then)');
  await cat.keyboard.press('p');
  await cat.locator('#buzz.armed').waitFor();
  await row(page).getByText('Passed 2 of 3: Ann, Bob').waitFor();
  assert(!(await ringed(page)), 'Cat takes it back with P: the ring goes');

  // Cat buzzes and is wrong: out of the clue; with Ann and Bob passed, everyone left passed.
  await cat.keyboard.press(' ');
  await page.locator('.panel .status', { hasText: /Cat/ }).first().waitFor().catch(() => {});
  await cat.locator('#buzz.first').waitFor();
  assert(await passBtn(cat).evaluate((b) => getComputedStyle(b).visibility === 'hidden' && !b.hidden), 'Cat answering: Pass keeps its place, out of sight');
  await page.keyboard.press('Shift+Enter');
  await row(page).getByText('Everyone passed: reveal the answer').waitFor();
  await page.waitForFunction(() => document.querySelector('.panel [data-next]')?.classList.contains('ring'));
  assert(true, 'Cat wrong (out of the clue) and the others passed: everyone passed, 👁 Reveal answer ringed');
  // Ctrl+Z of the wrong answer: Cat answers again, nobody's pass lost.
  await page.keyboard.press('Control+z');
  await cat.locator('#buzz.first').waitFor();
  assert(!(await ringed(page)) && (await big(ann)) === 'You passed', 'Ctrl+Z of the wrong answer: Cat is answering again, no ring, Ann still passed');
  await page.keyboard.press('Control+y');
  await row(page).getByText('Everyone passed: reveal the answer').waitFor();
  assert(true, 'and Ctrl+Y: everyone passed again');

  // ↺ Reset buzzers (0): everyone may buzz again, the passes start over.
  await page.keyboard.press('0');
  await ann.locator('#buzz.armed').waitFor();
  await bob.locator('#buzz.armed').waitFor();
  assert((await passSays(ann, 'Pass: I won’t buzz on this one')) && !(await ringed(page)) && (await row(page).getByText(/Passed/).count()) === 0, '↺ Reset buzzers (0): nobody has passed any more, BUZZ! on every phone');
  assert(!/Everyone/.test(await ann.locator('#buzz-small').innerText()), 'and the phones no longer say Everyone passed');
  // A slip of 0: Ctrl+Z puts the buzzers back, with the passes and Cat's miss.
  await page.keyboard.press('Control+z');
  await row(page).getByText('Everyone passed: reveal the answer').waitFor();
  await ann.locator('#pass.passed').waitFor();
  await page.locator('.toast', { hasText: 'Undid ↺ Reset buzzers' }).waitFor();
  assert((await big(ann)) === 'You passed' && (await big(bob)) === 'You passed' && (await chip('Cat').locator('.mark').innerText()).includes('✘'), 'Ctrl+Z of ↺ Reset buzzers: Ann and Bob passed again, Cat still out, everyone passed');
  await page.keyboard.press('Control+y');
  await ann.locator('#buzz.armed').waitFor();
  await row(page).getByText(/Passed/).waitFor({ state: 'detached' });
  assert(await passSays(ann, 'Pass: I won’t buzz on this one'), 'and Ctrl+Y resets them again');
  await passBtn(bob).click();
  await row(page).getByText('Passed 1 of 3: Bob').waitFor();
  // The answer up: Pass can't be pressed.
  await page.keyboard.press('r');
  await page.locator('.stage-box [data-slide="answer"]').waitFor();
  await bob.waitForFunction(() => document.querySelector('#pass')?.classList.contains('gone'));
  assert((await bob.locator('#buzz-big').innerText()) !== 'You passed', 'the answer up: the clue is over on the phones, Pass out of sight');

  // ---------- 2. No Pass on a clue everyone must play, nor on a ✍ clue ----------
  console.log('Clues everyone plays:');
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();
  await openTile(page, 'c1_0');
  await ann.locator('#buzz.armed').waitFor();
  assert((await passBtn(ann).isHidden()) && (await passBtn(cat).isHidden()), 'a clue ticked Everyone must play (no Pass): BUZZ! and no Pass');
  await page.keyboard.press('Escape');
  await page.locator('.stage-box .board').waitFor();
  await page.locator('.stage-box .board .tile[data-clue="c2_0"]').click();
  await ann.locator('#answer-form').waitFor();
  assert(await passBtn(ann).isHidden(), 'a ✍ clue: the answer box, no Pass');
  await page.keyboard.press('Escape');

  // ---------- 3. Teams: a pass counts for the team ----------
  console.log('Teams:');
  const t = await host(teamsFile);
  const joinTeam = async (name, team, opts) => {
    const p = await phone(name, t.code, opts);
    await p.locator('#seat-list button.seat', { hasText: team }).first().click();
    await p.locator('#team-in').fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(team).waitFor();
    return p;
  };
  const zoe = await joinTeam('Zoe', 'Red');
  const al = await joinTeam('Al', 'Red', { w: 360, h: 640 });
  const bea = await joinTeam('Bea', 'Blue');
  await start(t.page);
  await openTile(t.page, 'c0_0');
  await zoe.locator('#buzz.armed').waitFor();
  assert(await passSays(zoe, 'Pass: our team won’t buzz on this one'), 'a team’s phone: Pass says "our team"');
  await passBtn(zoe).click();
  await al.locator('#pass.passed').waitFor();
  await zoe.locator('#pass.passed').waitFor();
  const [alSays, zoeSays] = [await big(al), await big(zoe)];
  assert(alSays === 'Zoe passed for your team' && zoeSays === 'Your team passed', `Zoe passes: the whole team passed (Al’s phone says Zoe passed for it: ${alSays}; ${zoeSays})`);
  await row(t.page).getByText('Passed 1 of 2: Zoe (Red)').waitFor();
  assert(true, 'the host sees "Passed 1 of 2: Zoe (Red)"');
  await shot(al, 'al-360-team-passed');
  await al.locator('#buzz').click({ force: true });
  await sleep(500);
  assert((await t.page.locator('.panel .buzz-queue').count()) === 0, 'Al can’t buzz for the team now');
  await passBtn(al).click();
  await al.locator('#buzz.armed').waitFor();
  assert((await big(zoe)) === 'BUZZ!', 'Al takes the pass back for the team: BUZZ! on both phones');
  await passBtn(bea).click();
  await passBtn(al).click();
  await t.page.locator('.panel [data-buzzrow]').getByText('Everyone passed: reveal the answer').waitFor();
  assert(true, 'both teams passed: everyone passed');

  assert(!errors.length, `no page errors (${errors.join(' | ')})`);
  console.log('Pass: all good');
} finally {
  await browser.close();
  buzzer.stop();
}
