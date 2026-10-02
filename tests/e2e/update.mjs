// Is a newer version out? GitHub's "latest release" answer is faked here: the editor says when one is out (with the
// new file to download, for the HTML file), "Not now" puts it away for that version, and ℹ About checks on demand.
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

  // Not now: put away for this version, also after a reload (which uses what it heard, without asking again).
  await notice.getByRole('button', { name: 'Not now' }).click();
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
    assert(asked === before, `and the reload asks GitHub no sooner than a few hours later (asked ${asked - before} more)`);
  } else console.log('  - (the browser lost its storage on that reload: the reload checks are skipped this time)');

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
