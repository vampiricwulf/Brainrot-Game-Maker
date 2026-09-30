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
