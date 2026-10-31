// Is a newer version out? GitHub's "latest release" answer is faked here: the editor says when one is out (with the
// new file to download, for the HTML file, then says on the page what to do with it), "Not now" puts it away for that
// version, and ℹ About checks on demand.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const DL = 'https://github.com/vampiricwulf/Brainrot-Game-Maker/releases/download';
const release = (v) => ({
  tag_name: `v${v}`,
  html_url: `https://github.com/vampiricwulf/Brainrot-Game-Maker/releases/tag/v${v}`,
  body: '### Added\n- Something new',
  draft: false,
  prerelease: false,
  assets: ['brainrot-game-maker.html', 'brainrot-game-maker-portable.exe', 'brainrot-game-maker-portable.exe.sig'].map((name) => ({
    name,
    browser_download_url: `${DL}/v${v}/${name}`,
  })),
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // The start-up check is on for this test (published releases have it on; test builds don't ask GitHub by themselves).
  await context.addInitScript(() => localStorage.setItem('jb.updateCheck', 'on'));
  let answer = release('99.0.0');
  let asked = 0;
  await context.route('https://api.github.com/**', (route) => {
    asked++;
    if (answer === 'offline') return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  const notice = page.locator('.data-notice', { hasText: 'is out' });
  await notice.waitFor();
  assert((await notice.innerText()).includes('Brainrot Games Maker 99.0.0 is out'), `the editor says a newer version is out (${(await notice.innerText()).split('\n')[0]})`);
  // (The link it opens is noted rather than opened, so the test doesn't go to GitHub.)
  await page.evaluate(() => (window.open = (u) => ((window.__opened = String(u)), null)));
  await notice.getByRole('button', { name: '⬇ Download 99.0.0' }).click();
  const opened = await page.evaluate(() => window.__opened);
  assert(/\/v99\.0\.0\/brainrot-game-maker\.html$/.test(opened), `Download opens the new HTML file’s link (${opened})`);
  // Then the notice says what to do with the file, on the page (the page can't change its own file), and so does ℹ About.
  const steps = page.locator('.data-notice', { hasText: 'Downloading 99.0.0 in a new tab' });
  await steps.waitFor();
  assert(
    (await steps.innerText()).includes('Then save it over your old Brainrot file (same name, same folder) and open it. Your games come along.') &&
      (await steps.getByRole('button', { name: 'What’s new' }).count()) === 1 &&
      (await steps.getByRole('button', { name: 'Done' }).evaluate((b) => b === document.activeElement)),
    `after ⬇ Download the notice says what to do with the new file, with What’s new and Done, the keys on Done (${(await steps.innerText()).replace(/\s+/g, ' ')})`,
  );
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: /About/ }).click();
  await page.getByRole('dialog', { name: 'About Brainrot Games Maker' }).getByText('Downloading 99.0.0 in a new tab').waitFor();
  assert(true, 'ℹ About says the steps too');
  await page.keyboard.press('Escape');
  // (A double-click on Done is one click: Not now, come up where Done was, isn't pressed too.)
  await steps.getByRole('button', { name: 'Done' }).dblclick();
  await notice.waitFor();
  await page.waitForTimeout(300);
  assert(
    (await notice.isVisible()) && (await page.evaluate(() => localStorage.getItem('jb.updateSkip'))) === null,
    'Done puts the steps away: the notice is back, with Not now (a double-click on Done doesn’t press Not now)',
  );

  // Not now: put away for this version, also after a reload (which uses what it heard, without asking again). It's the
  // notice's ✕, its last button, its tooltip saying what it does (every notice under the header ends so).
  const notNow = notice.getByRole('button', { name: 'Not now' });
  assert(
    (await notNow.innerText()) === '✕' &&
      (await notNow.getAttribute('title')) === 'Hide until a newer version is out' &&
      (await notice.getByRole('button').last().evaluate((b) => b.getAttribute('aria-label'))) === 'Not now',
    'Not now is the notice’s ✕ at its far right, its tooltip saying what it does',
  );
  await notNow.click();
  await notice.waitFor({ state: 'detached' });
  assert((await page.evaluate(() => localStorage.getItem('jb.updateSkip'))) === '99.0.0', 'Not now puts it away for that version (kept on this computer)');
  // After a reload: still put away, and no new question to GitHub. (This browser sometimes comes back from a reload
  // of a file:// page with the storage of the last few seconds gone, the test's own marker too: then there's nothing
  // the app could have done, and that part is skipped.)
  await page.waitForTimeout(1000);
  await page.evaluate(() => localStorage.setItem('test.marker', '1'));
  const before = asked;
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => localStorage.getItem('test.marker') === '1')) {
    assert((await notice.count()) === 0, 'after a reload, Not now still holds');
    assert(asked === before + 1, `and each start asks GitHub again (asked ${asked - before} more)`);
  } else console.log('  - (the browser lost its storage on that reload: the reload checks are skipped this time)');

  // A start asks even when it heard from GitHub a little while ago (releases come often: what it heard then would hide a
  // newer one), and an offline start goes by what it heard last.
  await page.evaluate(() => localStorage.setItem('jb.update', JSON.stringify({ at: Date.now() - 60_000, release: { version: '0.0.1', page: 'p', notes: '', files: {} } })));
  answer = release('99.2.0');
  await page.waitForTimeout(1000);
  await page.evaluate(() => localStorage.setItem('test.marker', '3'));
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  if (await page.evaluate(() => localStorage.getItem('test.marker') === '3')) {
    await page.locator('.data-notice', { hasText: '99.2.0 is out' }).waitFor();
    assert(true, 'a start finds a newer version though it checked a minute ago');
    answer = 'offline';
    // (What GitHub said is kept as it's heard: wait for it, then the same storage check as above before the reload.)
    await page.waitForFunction(() => localStorage.getItem('jb.update')?.includes('99.2.0'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => localStorage.setItem('test.marker', '4'));
    await page.reload();
    await page.getByRole('button', { name: 'Open…' }).waitFor();
    if (await page.evaluate(() => localStorage.getItem('test.marker') === '4')) {
      await page.locator('.data-notice', { hasText: '99.2.0 is out' }).waitFor();
      assert(true, 'offline, a start goes by what GitHub said last');
    } else console.log('  - (the browser lost its storage on that reload: the offline check is skipped this time)');
  } else console.log('  - (the browser lost its storage on that reload: the stale-answer check is skipped this time)');

  // ℹ About checks on demand: a still newer one shows again; this one is the newest; offline says so.
  const about = async () => {
    await page.getByRole('button', { name: /^More:/ }).click();
    await page.getByRole('menuitem', { name: /About/ }).click();
    return page.getByRole('dialog', { name: 'About Brainrot Games Maker' });
  };
  let dlg = await about();
  answer = release('0.0.1');
  await dlg.getByRole('button', { name: 'Check for updates' }).click();
  await dlg.getByText('✓ This is the newest version.').waitFor();
  assert(true, 'ℹ About › Check for updates: "This is the newest version" when it is');
  assert(/\(checked \d/.test(await dlg.locator('.updates').innerText()), 'and says when it last checked');
  answer = 'offline';
  await dlg.getByRole('button', { name: 'Check for updates' }).click();
  await dlg.getByText(/Couldn't reach GitHub/).waitFor();
  assert(true, 'and says when GitHub can’t be reached');
  answer = release('99.1.0');
  await dlg.getByRole('button', { name: 'Check for updates' }).click();
  await dlg.getByRole('button', { name: '⬇ Download 99.1.0' }).waitFor();
  assert(true, 'a newer version shows in ℹ About with its download');
  await page.keyboard.press('Escape');
  const again = page.locator('.data-notice', { hasText: '99.1.0 is out' });
  await again.waitFor();
  assert(true, 'and the editor’s notice comes back for it (put away was only for 99.0.0)');

  // ⚙ Settings can turn the start-up check off.
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: /Settings/ }).click();
  const box = page.getByLabel('Check for a newer version when the app starts');
  assert(await box.isChecked(), '⚙ Settings has the start-up check, on');
  await box.uncheck();
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.removeItem('jb.update'));
  // (The same storage loss on a reload as above would lose the setting too: checked only when the marker survives.)
  await page.waitForTimeout(1000);
  await page.evaluate(() => localStorage.setItem('test.marker', '2'));
  const n = asked;
  await page.reload();
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  await page.waitForTimeout(800);
  if (await page.evaluate(() => localStorage.getItem('test.marker') === '2')) assert(asked === n, 'with it off, starting doesn’t ask GitHub');
  else console.log('  - (the browser lost its storage on that reload: the start-up check is skipped this time)');

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Update E2E passed.');
} finally {
  await browser.close();
}
