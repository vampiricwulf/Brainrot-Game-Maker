// Is a newer version out? GitHub's "latest release" answer is faked here: the editor says when one is out (with the
// new file to download, for the HTML file, then says on the page what to do with it), "Not now" puts it away for that
// version, and ℹ About checks on demand. The copy online offers a reload instead.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, lineOf, playWithPlayers } from './helpers.mjs';

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
  // On a laptop's screen (1280×720, 1366×768 and a little shorter, a 1024×768 one) the first screen's 📂 Open a game…
  // stays in view under it, with room to spare (a wider font than CI's mustn't push it off).
  for (const [w, h] of [[1280, 720], [1366, 768], [1366, 764], [1024, 768], [1280, 800], [1366, 801], [1280, 840]]) {
    await page.setViewportSize({ width: w, height: h });
    const openLine = await page.locator('.first-round .open-line').evaluate((e) => e.getBoundingClientRect().bottom);
    assert(openLine <= h - 12, `with the notice up, 📂 Open a game… is in a ${w}×${h} window (${openLine})`);
  }
  // (A notice that appears with its words isn't always read: screen readers hear it from the page's live region.)
  await page.waitForFunction(() => document.getElementById('live-region')?.dataset.said?.includes('Brainrot Games Maker 99.0.0 is out.'), null, { timeout: 3000 });
  assert(true, 'screen readers are told a newer version is out');
  // (The link it opens is noted rather than opened, so the test doesn't go to GitHub.)
  await page.evaluate(() => (window.open = (u) => ((window.__opened = String(u)), null)));
  // (Narrow: the steps wrap, the ⬆ staying with their first words rather than on a line of its own.)
  await page.setViewportSize({ width: 820, height: 720 });
  await notice.getByRole('button', { name: '⬇ Download 99.0.0' }).click();
  const opened = await page.evaluate(() => window.__opened);
  assert(/\/v99\.0\.0\/brainrot-game-maker\.html$/.test(opened), `Download opens the new HTML file’s link (${opened})`);
  // Then the notice says what to do with the file, on the page (the page can't change its own file), and so does ℹ About.
  const steps = page.locator('.data-notice', { hasText: 'Downloading 99.0.0 in a new tab' });
  await steps.waitFor();
  assert(
    (await steps.innerText()).includes('Then save it over your old Brainrot file (same name, same folder) and open it. Your games come along.') &&
      // (Its ↗ says it opens the browser, as the app's other outside links do.)
      (await steps.getByRole('button', { name: 'What’s new ↗', exact: true }).getAttribute('title')) === 'The release notes on GitHub' &&
      (await steps.getByRole('button', { name: 'Done' }).evaluate((b) => b === document.activeElement)),
    `after ⬇ Download the notice says what to do with the new file, with What’s new ↗ and Done, the keys on Done (${(await steps.innerText()).replace(/\s+/g, ' ')})`,
  );
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/update-steps-820.png` });
  const arrow = await steps.evaluate((n) => {
    const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode()) && !t.data.includes('⬆'));
    const r = document.createRange();
    r.setStart(t, t.data.indexOf('⬆'));
    r.setEnd(t, t.data.indexOf('⬆') + 1);
    const word = n.querySelector('.steps');
    return { arrow: r.getBoundingClientRect().top, words: word && word.getClientRects()[0].top, h: n.getBoundingClientRect().height };
  });
  assert(arrow.words !== null && Math.abs(arrow.arrow - arrow.words) < 4 && arrow.h < 80, `at 820 wide the ⬆ starts the steps' first line (${JSON.stringify(arrow)})`);
  await page.setViewportSize({ width: 1280, height: 800 });
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

  // ⚙ Settings can turn the start-up check (and the hourly one) off.
  await page.getByRole('button', { name: /^More:/ }).click();
  await page.getByRole('menuitem', { name: /Settings/ }).click();
  const box = page.getByLabel("Check for a newer version when the app starts, and every hour while it's open");
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

  // While it's open, it asks again every hour, quietly: a newer version brings up the notice, and a check that fails
  // changes nothing on screen. (The page's clock is moved on rather than waited for.)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem('jb.updateCheck', 'on'));
    let hourly = release('0.0.1');
    let calls = 0;
    await ctx.route('https://api.github.com/**', (route) => {
      calls++;
      if (hourly === 'offline') return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(hourly) });
    });
    const hp = await ctx.newPage();
    hp.on('pageerror', (e) => errors.push(e.message));
    await hp.clock.install();
    await hp.goto(url);
    await hp.getByRole('button', { name: 'Open…' }).waitFor();
    await hp.waitForTimeout(500);
    const hn = hp.locator('.data-notice', { hasText: 'is out' });
    assert(calls === 1 && (await hn.count()) === 0, `it asks once at start-up and an older release brings up no notice (${calls} asked)`);
    await addClassicRounds(hp);
    hourly = release('99.2.0');
    await hp.clock.fastForward('30:00');
    await hp.waitForTimeout(500);
    assert(calls === 1 && (await hn.count()) === 0, 'half an hour on, it hasn’t asked again');
    // A version found while someone is at work waits for a pause: the notice would push the board down under their
    // hands. (Here: clicking into a category's name and typing, a click and a key every second.)
    const tile = hp.locator('.tile').first();
    const at = async () => JSON.stringify(await tile.evaluate((t) => t.getBoundingClientRect().toJSON()));
    const where = await at();
    const said = () => hp.evaluate(() => document.getElementById('live-region')?.dataset.said ?? '');
    const name = hp.getByLabel('Category 1 name');
    await name.click();
    await hp.clock.fastForward('31:00');
    await hp.waitForTimeout(300);
    for (const c of 'Science') {
      await name.click();
      await hp.keyboard.type(c);
      await hp.clock.fastForward('00:01');
    }
    await hp.waitForTimeout(300);
    assert(calls === 2, `an hour on, it asks again (${calls} asked)`);
    assert(
      (await hn.count()) === 0 && (await at()) === where && !(await said()).includes('99.2.0'),
      'while they keep clicking and typing (7 s), the notice for 99.2.0 waits: nothing moves and nothing is read out',
    );
    // ℹ About says so at once (it's a window: nothing under it moves).
    await hp.getByRole('button', { name: /^More:/ }).click();
    await hp.getByRole('menuitem', { name: 'ℹ About' }).click();
    const aboutText = await hp.getByRole('dialog', { name: 'About Brainrot Games Maker' }).innerText();
    assert(aboutText.includes('Version 99.2.0 is out.') && aboutText.includes('⬇ Download 99.2.0'), 'ℹ About shows 99.2.0 at once, with its download');
    await hp.keyboard.press('Escape');
    await hp.getByRole('dialog').waitFor({ state: 'detached' });
    assert((await hn.count()) === 0, 'and the editor’s notice still waits');
    // A few seconds with no key and no click: then it shows, and is read out.
    await hp.clock.fastForward('00:05');
    await hn.waitFor();
    assert(
      (await hn.innerText()).includes('99.2.0 is out') && (await at()) !== where,
      'after a few seconds without a key or a click, the notice says 99.2.0 is out (moving the board down, which is why it waited)',
    );
    await hp.waitForFunction(() => document.getElementById('live-region')?.dataset.said?.includes('99.2.0 is out.'), null, { timeout: 3000 });
    assert(true, 'and screen readers are told then');
    hourly = 'offline';
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(500);
    await hp.clock.fastForward('00:05');
    assert(calls === 3 && (await hn.count()) === 1 && (await hn.innerText()).includes('99.2.0 is out'), 'an hour later, a check that fails leaves the notice as it was');
    hourly = release('99.1.0');
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(500);
    await hp.clock.fastForward('00:05');
    assert(calls === 4 && (await hn.innerText()).includes('99.2.0 is out'), 'an older answer (99.1.0) doesn’t replace the newer version already known');
    // (⚙ Settings open as it comes: the notice is behind the window, out of reach like the rest of the page.)
    hourly = release('99.2.1');
    await hp.getByRole('button', { name: /^More:/ }).click();
    await hp.getByRole('menuitem', { name: /Settings/ }).click();
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(300);
    await hp.clock.fastForward('00:05');
    await hp.locator('.data-notice', { hasText: '99.2.1 is out' }).waitFor();
    assert(calls === 5, `a still newer version (99.2.1) takes the notice’s place after the pause (${calls} asked)`);
    assert(await hn.evaluate((n) => !!n.closest('[inert]')), 'a notice that comes while ⚙ Settings is open is inert behind it, as the rest of the page is');
    await hp.keyboard.press('Escape');
    await hp.getByRole('dialog').waitFor({ state: 'detached' });
    assert(await hn.evaluate((n) => !n.closest('[inert]')), 'and usable again once the window closes');
    // A drag (a tile picked up, here) is someone at work however long it lasts, even one started before the answer
    // came: the pause starts when it's dropped.
    hourly = release('99.2.2');
    const tb = await hp.locator('.tile').nth(1).boundingBox();
    const before = await at();
    await hp.mouse.move(tb.x + 10, tb.y + 10);
    await hp.mouse.down();
    await hp.mouse.move(tb.x + 40, tb.y + 40, { steps: 5 });
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(300);
    await hp.clock.fastForward('00:05');
    await hp.waitForTimeout(300);
    assert(
      calls === 6 && (await hn.innerText()).includes('99.2.1 is out') && (await at()) === before,
      'a newer version (99.2.2) found during a drag that lasts longer than the pause waits: nothing moves',
    );
    await hp.mouse.up();
    await hp.clock.fastForward('00:05');
    await hp.locator('.data-notice', { hasText: '99.2.2 is out' }).waitFor({ timeout: 2000 });
    assert(true, 'and shows a few seconds after the drop');
    // Going to another page of the editor is a pause too.
    hourly = release('99.2.3');
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(300);
    await hp.keyboard.press('Shift');
    assert(calls === 7 && (await hn.innerText()).includes('99.2.2 is out'), 'a newer version (99.2.3) found while they work leaves the notice at 99.2.2 for now');
    await hp.locator('nav > button.round-tab').nth(1).click();
    await hp.locator('.data-notice', { hasText: '99.2.3 is out' }).waitFor({ timeout: 2000 });
    assert(true, 'and going to another round shows it at once');
    // A press whose release never reaches the page (a right-click whose native menu takes it, alt-tab while holding a
    // button) holds the notice back only until the page can tell: the menu, the window losing focus, or a move with no
    // button down. (The press is made up here, with no release after it.)
    const press = () => hp.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, buttons: 2 })));
    for (const [v, how, lost] of [
      ['99.2.4', 'the right-click’s menu', () => hp.evaluate(() => document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2 })))],
      ['99.2.5', 'the window losing focus', () => hp.evaluate(() => window.dispatchEvent(new Event('blur')))],
      ['99.2.6', 'a move with no button down', () => hp.mouse.move(600, 400)],
    ]) {
      hourly = release(v);
      await press();
      await hp.clock.fastForward('01:01:00');
      await hp.waitForTimeout(300);
      await hp.clock.fastForward('00:05');
      await hp.waitForTimeout(300);
      assert((await hn.innerText()).includes('is out') && !(await hn.innerText()).includes(`${v} is out`), `a version (${v}) found while a button is held waits`);
      await lost();
      await hp.clock.fastForward('00:05');
      await hp.locator('.data-notice', { hasText: `${v} is out` }).waitFor({ timeout: 2000 });
      assert(true, `and when its release is lost, ${how} ends the wait`);
    }
    // ⬇ Download's steps stay while a still newer version comes out (the next hourly check after Done brings it up).
    await hp.evaluate(() => (window.open = () => null));
    await hn.getByRole('button', { name: '⬇ Download 99.2.6' }).click();
    const hs = hp.locator('.data-notice', { hasText: 'Downloading 99.2.6 in a new tab' });
    await hs.waitFor();
    hourly = release('99.3.0');
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(500);
    await hp.clock.fastForward('00:05');
    await hp.locator('nav > button.round-tab').first().click();
    assert(calls === 11 && (await hs.count()) === 1, 'a newer version found while the download’s steps show leaves them as they are');
    // With ⚙ Settings' box unticked, it doesn't ask again.
    await hp.getByRole('button', { name: /^More:/ }).click();
    await hp.getByRole('menuitem', { name: /Settings/ }).click();
    await hp.getByLabel("Check for a newer version when the app starts, and every hour while it's open").uncheck();
    await hp.keyboard.press('Escape');
    await hp.clock.fastForward('01:01:00');
    await hp.waitForTimeout(500);
    assert(calls === 11, 'with the box unticked in ⚙ Settings, it doesn’t ask every hour');
    await ctx.close();
  }

  // The copy online (GitHub Pages, over https) is put up again with every release: it offers a reload, not a file to
  // download (a downloaded file opens in another place, and the games kept online wouldn't come along). The page is
  // served here from a made-up https address, so nothing goes to GitHub.
  {
    const web = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await web.addInitScript(() => localStorage.setItem('jb.updateCheck', 'on'));
    await web.route('https://api.github.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(release('99.0.0')) }),
    );
    const site = 'https://pages.example.test/Brainrot-Game-Maker/';
    await web.route(site, (route) => route.fulfill({ status: 200, contentType: 'text/html', path: file }));
    const wp = await web.newPage();
    wp.on('pageerror', (e) => errors.push(e.message));
    await wp.goto(site);
    const wn = wp.locator('.data-notice', { hasText: 'is out' });
    await wn.waitFor();
    assert(
      (await wn.getByRole('button', { name: '⟳ Reload for 99.0.0' }).count()) === 1 && (await wn.getByRole('button', { name: /Download/ }).count()) === 0,
      'online, the notice offers ⟳ Reload for the new version, not a download',
    );
    // Online, the first screen's line that says what the app is ends with where to get the app (to keep, or use
    // offline). With the notice up it stays one line (its words cut short where the window is narrow, the link whole,
    // the full words in its tooltip) and 📂 Open a game… still fits a laptop's screen.
    const what = wp.locator('.first-round > p.what');
    const get = what.getByRole('link', { name: 'Get the app ↗' });
    for (const [w, h] of [[1280, 720], [1366, 768], [1366, 764], [1024, 768]]) {
      await wp.setViewportSize({ width: w, height: h });
      const line = await what.evaluate(lineOf);
      const wOpen = await wp.locator('.first-round .open-line').evaluate((e) => e.getBoundingClientRect().bottom);
      assert(
        (await get.getAttribute('href')) === 'https://github.com/vampiricwulf/Brainrot-Game-Maker/releases' && (await get.getAttribute('target')) === '_blank' &&
          line.lines === 1 && line.linkIn && line.title.includes('players buzz in from their phones') && wOpen <= h - 12,
        `online at ${w}×${h}, the first screen's one line about the app ends with “Get the app ↗” (the Releases page), and 📂 Open a game… fits under the notice (${JSON.stringify(line)}, ${wOpen})`,
      );
    }
    await wp.setViewportSize({ width: 1280, height: 800 });
    let reloaded = false;
    wp.on('framenavigated', (f) => f === wp.mainFrame() && (reloaded = true));
    await wn.getByRole('button', { name: '⟳ Reload for 99.0.0' }).click();
    await wp.getByRole('button', { name: 'Open…' }).waitFor();
    assert(reloaded, '⟳ Reload reloads the page');

    // There's no file online: ℹ About says it's the copy online, and that its games are its own (not shared with the
    // downloaded file, as copies opened from a file share theirs).
    await wp.getByRole('button', { name: /^More:/ }).click();
    await wp.getByRole('menuitem', { name: 'ℹ About' }).click();
    const about = await wp.getByRole('dialog', { name: 'About Brainrot Games Maker' }).innerText();
    assert(
      /Version\s+\d+\.\d+\.\d+ \(online\)/.test(about) &&
        about.includes("This site keeps its own games: the downloaded file and the desktop app don't see them") &&
        !about.includes('single HTML file') && !about.includes('opened from a file'),
      'online, ℹ About says “(online)” and that this site keeps its own games, not the file’s words',
    );
    await wp.keyboard.press('Escape');
    // A blocked popup: allow popups for this site (there's no file to allow them for).
    await addClassicRounds(wp);
    await playWithPlayers(wp, 2);
    await wp.evaluate(() => (window.open = () => null));
    await wp.getByRole('button', { name: /Separate audience window/ }).click();
    await wp.locator('.toast', { hasText: 'The browser blocked the popup. Allow popups for this site and try again.' }).waitFor();
    assert(true, 'online, a blocked popup says to allow popups for this site');
    await web.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Update E2E passed.');
} finally {
  await browser.close();
}
