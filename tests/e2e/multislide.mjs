// Clues with several question slides: the host builds one in the clue editor (＋ Add slide, the tabs, moving, duplicating
// and deleting slides, each one an undo step), saves it, opens the pack again, then plays it: the main button goes
// Next slide ▶ (N) through the slides, ◀ Slide goes back, the audience window shows the slide the host is on, and then
// 👁 Reveal answer as before. A game made before clues had more slides still opens and plays as it did.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { addClassicRounds, mainButton, mainLabel, nameGame, openGameFile, answerReplace } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const url = pathToFileURL(file).href;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
mkdirSync(resolve('test-results'), { recursive: true });

const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => (errors.push('dialog: ' + d.message()), d.accept()));

try {
  await page.goto(url);
  await addClassicRounds(page);
  await page.locator('.cat textarea').first().fill('Lore');

  // ---------- The clue editor ----------
  await page.locator('.tile').first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit clue' });
  await dialog.waitFor();
  const tabs = dialog.getByRole('tablist', { name: 'Slides' });
  const tabNames = () => tabs.getByRole('tab').allInnerTexts();
  const q = dialog.locator('[data-field="q"]');
  const addSlide = dialog.getByRole('button', { name: '＋ Add slide' });
  const undo = () => page.keyboard.press('Control+z');
  const redo = () => page.keyboard.press('Control+y');
  /** An opened game (answering Discard if it asks first about unsaved changes). */
  async function opened() {
    const ask = page.getByRole('dialog', { name: /^(Start a new game|Open|Reopen)/ });
    const done = page.getByText(/^Opened “/);
    if ((await Promise.race([done.waitFor().then(() => 'done'), ask.waitFor().then(() => 'ask')])) === 'ask') await answerReplace(page, 'Discard');
    await done.waitFor();
  }
  /** Click away from the text fields (Ctrl+Z in a field with typing of its own undoes the typing first). */
  const away = () => dialog.locator('header .value').click();

  // One slide: the plain tabs, a quiet ＋ Add slide, no slide tools.
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', 'Answer slide (hidden until revealed)']), 'a clue starts with its one question slide and the answer');
  assert((await dialog.getByRole('button', { name: '🗑 Delete slide' }).count()) === 0, 'no slide tools on a one-slide clue');
  await q.fill('This started as a lead-in');
  await dialog.locator('[data-field="a"]').fill('Skibidi Toilet');

  await addSlide.click();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question 1', 'Question 2', 'Answer slide (hidden until revealed)']), '＋ Add slide makes Question 1 · Question 2 · Answer');
  assert((await tabs.getByRole('tab', { name: 'Question 2' }).getAttribute('aria-selected')) === 'true', 'the new slide is open');
  assert(await q.evaluate((e) => e === document.activeElement), 'its question field has the focus, ready to type');
  assert((await q.inputValue()) === '', 'the new slide starts empty');
  assert((await dialog.locator('label.field', { has: page.locator('[data-field="q"]') }).innerText()).includes('slide 2 of 2'), 'the Question field says which slide it is');
  await q.fill('It is a YouTube series');
  await addSlide.click();
  await q.fill('Toilets with heads');
  assert((await dialog.getByText('Slide 3 of 3', { exact: true }).count()) === 1, 'the slide tools say Slide 3 of 3');

  await page.screenshot({ path: 'test-results/multislide-editor.png' });
  // The first slide still has its own text.
  await tabs.getByRole('tab', { name: 'Question 1' }).click();
  assert((await q.inputValue()) === 'This started as a lead-in', 'Question 1 keeps its text');
  await q.fill('Lead-in: a meme from 2023');

  // Duplicate, move and delete: each one an undo step.
  await away();
  await tabs.getByRole('tab', { name: 'Question 2' }).click();
  await dialog.getByRole('button', { name: '⧉ Duplicate' }).click();
  assert((await tabs.getByRole('tab').count()) === 5, '⧉ Duplicate adds a copy');
  assert((await q.inputValue()) === 'It is a YouTube series', 'the copy opens, with the slide’s text');
  await away();
  await undo();
  assert((await tabs.getByRole('tab').count()) === 4, 'Ctrl+Z takes the copy back');
  await tabs.getByRole('tab', { name: 'Question 3' }).click();
  await dialog.getByRole('button', { name: 'Move slide earlier' }).click();
  assert((await q.inputValue()) === 'Toilets with heads' && (await tabs.getByRole('tab', { name: 'Question 2' }).getAttribute('aria-selected')) === 'true', '◀ moves the slide earlier (it stays open)');
  await away();
  await undo();
  await tabs.getByRole('tab', { name: 'Question 3' }).click();
  assert((await q.inputValue()) === 'Toilets with heads', 'Ctrl+Z puts it back in its place');
  await dialog.getByRole('button', { name: '🗑 Delete slide' }).click();
  assert((await tabs.getByRole('tab').count()) === 3, '🗑 Delete slide takes it out');
  await away();
  await undo();
  assert((await tabs.getByRole('tab').count()) === 4, 'Ctrl+Z brings the deleted slide back');
  await redo();
  assert((await tabs.getByRole('tab').count()) === 3, 'Ctrl+Y deletes it again');
  await undo();
  await tabs.getByRole('tab', { name: 'Question 3' }).click();
  assert((await q.inputValue()) === 'Toilets with heads', 'the slide came back with its text');

  // The history names each step.
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /History/ }).first().click();
  const history = await page.locator('main').innerText();
  for (const label of ['Added question slide 2 to Lore $200', 'Added question slide 3 to Lore $200', 'Edited question “Lead-in: a meme from 2023”'])
    assert(history.includes(label), `the history says “${label}”`);
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  assert((await page.locator('.tile').first().innerText()).includes('▤ 3'), 'the board tile shows it has 3 question slides');

  // ---------- Save, then open the pack again ----------
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click().then(() => nameGame(page, 'Slides Night')),
  ]);
  const packPath = resolve('test-results/multislide.brainrot');
  await download.saveAs(packPath);
  const zip = await JSZip.loadAsync(await import('node:fs').then((fs) => fs.readFileSync(packPath)));
  const saved = JSON.parse(await zip.file('game.json').async('string'));
  const savedClue = saved.rounds[0].categories[0].clues[0];
  assert(savedClue.extraSlides?.length === 2 && savedClue.extraSlides.every((s) => s.id), 'the pack keeps the extra slides (with their ids)');

  await openGameFile(page, packPath);
  await opened();
  await page.getByRole('button', { name: 'Jeopardy!', exact: true }).click();
  await page.locator('.tile').first().click();
  await dialog.waitFor();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question 1', 'Question 2', 'Question 3', 'Answer slide (hidden until revealed)']), 'the reopened pack has the clue’s three question slides');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---------- Play ----------
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  await page.locator('.panel').waitFor();
  if (await page.getByRole('button', { name: 'Skip intro' }).count()) await page.getByRole('button', { name: 'Skip intro' }).click();
  const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience', exact: true }).click()]);
  aud.on('pageerror', (e) => errors.push('[audience] ' + e.message));
  await aud.locator('.board').waitFor();

  await page.locator('.stage-box .board .tile').first().click();
  const audSlide = aud.locator('.full[data-slide]');
  const audSays = async (n, text) => {
    await aud.locator(`.full[data-slide="${n}"]`).waitFor();
    await aud.locator('.full').getByText(text).waitFor();
    return true;
  };
  assert(await audSays(1, 'Lead-in: a meme from 2023'), 'the audience window shows slide 1');
  assert((await page.locator('.panel [data-slidepos]').innerText()) === 'Slide 1 of 3', 'the host sees “Slide 1 of 3”');
  assert((await mainLabel(page)) === 'Next slide ▶' && (await mainButton(page).locator('kbd').innerText()) === 'N', 'the main button is Next slide ▶ (N)');
  assert(await page.locator('.panel').getByRole('button', { name: '◀ Slide' }).isDisabled(), '◀ Slide is off on the first slide');
  assert((await page.locator('.info .q').innerText()) === 'Lead-in: a meme from 2023' && (await page.locator('.info .notes').first().innerText()) === 'It is a YouTube series', 'the host info shows the slide on screen and the next one');

  await mainButton(page).click();
  assert(await audSays(2, 'It is a YouTube series'), 'Next slide ▶ moves the audience window to slide 2');
  assert((await page.locator('.panel [data-slidepos]').innerText()) === 'Slide 2 of 3', 'the host sees “Slide 2 of 3”');
  assert((await aud.getByText('Skibidi Toilet').count()) === 0, 'the answer is still hidden');
  await page.screenshot({ path: 'test-results/multislide-host.png' });

  // A player buzzes in (picked by hand) mid-way: the slides go on, nobody's pick is reset.
  await page.keyboard.press('1');
  await page.keyboard.press('n');
  assert(await audSays(3, 'Toilets with heads'), 'N goes to slide 3');
  assert((await page.locator('.panel .p.on').count()) === 1, 'moving through the slides leaves the selected player alone');
  await page.keyboard.press('1');
  assert((await page.locator('.panel .p.on').count()) === 0, '1 again lets go of the player');
  assert((await mainLabel(page)) === '👁 Reveal answer', 'on the last slide the main button is 👁 Reveal answer');

  await page.keyboard.press('Shift+N');
  assert(await audSays(2, 'It is a YouTube series'), 'Shift+N goes back a slide');
  await page.locator('.panel').getByRole('button', { name: '◀ Slide' }).click();
  assert(await audSays(1, 'Lead-in: a meme from 2023'), '◀ Slide goes back too');
  // Clicking the slide goes on to the next one, then the answer.
  await page.locator('.stage-box .full').click();
  assert(await audSays(2, 'It is a YouTube series'), 'clicking the slide shows the next one');
  await page.waitForTimeout(500);
  await page.keyboard.press('n');
  await audSays(3, 'Toilets with heads');
  await mainButton(page).click();
  await aud.locator('.full[data-slide="answer"]').getByText('Skibidi Toilet').waitFor();
  assert(true, '👁 Reveal answer shows the answer in the audience window');
  assert((await page.locator('.panel [data-slidepos]').count()) === 0, 'with the answer up, no slide position');
  await page.keyboard.press('r');
  assert(await audSays(3, 'Toilets with heads'), 'hiding the answer goes back to the last slide');
  await page.keyboard.press('r');
  await page.keyboard.press('Escape');
  await aud.locator('.board').waitFor();

  // Another clue (one slide) plays as always.
  await page.locator('.stage-box .board .tile').nth(1).click();
  await audSlide.waitFor();
  assert((await page.locator('.panel [data-slidepos]').count()) === 0 && (await mainLabel(page)) === '👁 Reveal answer', 'a one-slide clue: no slide position, the main button reveals');
  await page.keyboard.press('Escape');
  await aud.locator('.board').waitFor();

  // ---------- A game made before clues had more slides ----------
  const text = (id, t) => ({ id, kind: 'text', text: t, x: 160, y: 340, w: 1600, h: 400, rotation: 0, opacity: 1, zIndex: 1, font: 'Arial', size: 72, weight: 700, italic: false, underline: false, uppercase: false, color: '#fff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
  const slide = (id, t) => ({ background: { color: '#0a1a6b' }, elements: [text(id, t)] });
  const old = {
    id: 'g_old', version: 2, title: 'Old Night',
    settings: { allowNegativeScores: true, deductOnWrong: true, defaultTimerSeconds: null, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false, roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8 },
    players: [{ id: 'p1', name: 'Ann', color: '#e6194b' }],
    rounds: [{ id: 'r1', name: 'Old Board', mode: 'board', values: [100], dailyDoubleCount: 0, categories: [{ id: 'c1', title: 'Old', clues: [{ id: 'k1', value: null, type: 'standard', questionSlide: slide('q1', 'An old question'), answerSlide: slide('a1', 'An old answer') }] }] }],
    media: [], audio: {}, theme: {}, wheels: [], dice: [],
  };
  const oldFile = resolve('test-results/multislide-old.json');
  writeFileSync(oldFile, JSON.stringify(old));
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await openGameFile(page, oldFile);
  await opened();
  await page.getByRole('button', { name: 'Old Board', exact: true }).click();
  await page.locator('.tile').first().click();
  await dialog.waitFor();
  assert(JSON.stringify(await tabNames()) === JSON.stringify(['Question slide', 'Answer slide (hidden until revealed)']) && (await q.inputValue()) === 'An old question', 'an older game opens with its one question slide');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '▶ Play' }).click();
  // (The game left in progress above can still be resumed: start this one anyway.)
  const anyway = page.getByRole('button', { name: 'Start a new game' });
  const start = page.getByRole('button', { name: 'Start game ▶' });
  if ((await Promise.race([anyway.waitFor().then(() => 'ask'), start.waitFor().then(() => 'start')])) === 'ask') await anyway.click();
  await start.click();
  await page.locator('.panel').waitFor();
  await page.locator('.stage-box .board .tile').first().click();
  // (The audience window closed with the last game: the host's own stage shows what viewers see.)
  await page.locator('.stage-box .full[data-slide="1"]').getByText('An old question').waitFor();
  assert((await mainLabel(page)) === '👁 Reveal answer', 'it plays as before: the main button reveals');
  await mainButton(page).click();
  await page.locator('.stage-box .full[data-slide="answer"]').getByText('An old answer').waitFor();
  assert(true, 'and the answer shows');

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('\nMulti-slide clues E2E passed.');
} catch (e) {
  console.error(e);
  console.error('Page errors:', errors);
  await page.screenshot({ path: 'test-results/multislide-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
