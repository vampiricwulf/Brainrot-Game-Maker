// Shared e2e steps.

/**
 * A new game has no rounds: add a Jeopardy board and a Final Jeopardy (the classic game most tests play), then go
 * back to the board's tab. Does nothing if the game already has rounds (e.g. after a reload).
 */
export async function addClassicRounds(page) {
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  if (await page.locator('nav > button.round-tab').count()) return;
  for (const mode of [/Jeopardy board/, /Final Jeopardy/]) {
    await page.getByRole('button', { name: '＋ Add round' }).click();
    await page.getByRole('menuitem', { name: mode }).click();
  }
  await page.locator('nav > button.round-tab').first().click();
}

/** The first Save of an untitled game asks for its name: answer with `name` ('' keeps "Untitled Game"). */
export async function nameGame(page, name = '') {
  const dialog = page.getByRole('dialog', { name: 'Name your game' });
  await dialog.waitFor();
  if (name) await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

/** New, Open… or a recent game asks before replacing a game with unsaved changes: answer it (Save first, Discard, Cancel). */
export async function answerReplace(page, answer = 'Discard') {
  const dialog = page.getByRole('dialog', { name: /^(Start a new game|Open|Reopen)/ });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: answer, exact: true }).click();
}

/** Open… a game file (`files` as for setFiles), through Browse… when Open… lists recent games first. */
export async function openGameFile(page, files) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  const list = page.getByRole('dialog', { name: 'Open a game' });
  const first = await Promise.race([chooser.then(() => 'picker'), list.waitFor().then(() => 'list')]);
  if (first === 'list') await list.getByRole('button', { name: 'Browse…' }).click();
  await (await chooser).setFiles(files);
}

/**
 * Drag in small steps (the browser's own drag and drop needs a few moves to start) from the middle of one thing to the
 * middle of another, or to a point ({ x, y }).
 */
export async function dragBy(page, from, to) {
  const a = await from.boundingBox();
  const b = to.x !== undefined ? to : await to.boundingBox().then((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }));
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
