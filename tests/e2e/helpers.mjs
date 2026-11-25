// @ts-check
// Shared e2e steps.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, isDeepStrictEqual } from 'node:util';
import { deflateSync } from 'node:zlib';

/** @typedef {import('playwright-core').Page} Page */
/** @typedef {import('playwright-core').Locator} Locator */
/** @typedef {import('playwright-core').Browser} Browser */

const repo = fileURLToPath(new URL('../../', import.meta.url));

// Every Chromium a test starts gets the tests' fonts (fonts.conf: the machine's minus Inter, as on CI), however the file
// is run: each e2e file imports this one before it launches, and Chromium inherits process.env. A FONTCONFIG_FILE that's
// already set wins.
process.env.FONTCONFIG_FILE ||= fileURLToPath(new URL('fonts.conf', import.meta.url));

/**
 * The newest of the files the build is made from (src/, index.html, vite.config.ts). Unit tests (*.test.ts and
 * src/test/) aren't in the build, so editing one doesn't call for a new one.
 */
function newestSource() {
  let newest = null;
  const consider = (path) => {
    const t = statSync(path).mtimeMs;
    if (!newest || t > newest.t) newest = { path, t };
  };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) {
        if (path !== join(repo, 'src/test')) walk(path);
      } else if (e.isFile() && !/\.test\.ts$/.test(e.name)) consider(path);
    }
  };
  walk(join(repo, 'src'));
  for (const f of ['index.html', 'vite.config.ts']) if (existsSync(join(repo, f))) consider(join(repo, f));
  return newest;
}

/**
 * The app file the tests open: APP_FILE as given, or else the repo's dist/index.html, which must exist and be newer
 * than every file it's built from, so a test never quietly drives an old build.
 */
export function appFile() {
  if (process.env.APP_FILE) {
    const file = resolve(process.env.APP_FILE);
    if (!existsSync(file)) throw new Error(`APP_FILE ${file} doesn't exist`);
    return file;
  }
  const file = join(repo, 'dist/index.html');
  if (!existsSync(file)) throw new Error('Run `npm run build` first');
  const src = newestSource();
  if (src && src.t > statSync(file).mtimeMs) {
    throw new Error(`dist/index.html is older than ${relative(repo, src.path)}: run npm run build (or set APP_FILE)`);
  }
  return file;
}

/**
 * Starts Chromium (CHROMIUM_PATH, or the sandbox's one) with the tests' fonts (FONTCONFIG_FILE, set above). Layout
 * checks measure text, and a wider UI font (Inter is system-ui on some Linux desktops) moves what they measure.
 * @param {import('playwright-core').LaunchOptions} [opts]
 */
export function launchChromium(opts = {}) {
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return chromium.launch({ executablePath, ...opts, env: { ...process.env, ...opts.env } });
}

/**
 * A check: throws `Assertion failed: <msg>` when `cond` is falsy, and prints `  ✓ <msg>` when it holds. Put what was
 * seen into `msg` (e.g. `(${got})`), or use assertEq(), so a failure says more than which check it was.
 * @param {unknown} cond
 * @param {string} msg
 * @returns {asserts cond}
 */
export function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

/**
 * assert() for a value: passes when `actual` deep-equals `expected` (strict: 1 isn't '1'), and on a failure says both,
 * as `Assertion failed: <msg> (got <actual>, expected <expected>)`.
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} msg
 */
export function assertEq(actual, expected, msg) {
  if (!isDeepStrictEqual(actual, expected)) {
    const show = (/** @type {unknown} */ v) => inspect(v, { depth: 6, breakLength: Infinity, maxStringLength: 300 });
    throw new Error(`Assertion failed: ${msg} (got ${show(actual)}, expected ${show(expected)})`);
  }
  console.log('  ✓ ' + msg);
}

/**
 * A section's heading in a test's output, as `---------- <title> ----------`.
 * @param {string} title
 */
export function section(title) {
  console.log(`---------- ${title} ----------`);
}

/**
 * Waits `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {object} UntilOptions
 * @property {number} [timeout] how long to keep asking, in ms (default 15 000)
 * @property {number} [every] how long to wait between asks, in ms (default 50)
 * @property {string} [what] what's awaited: given, a timeout throws `never: <what>` instead of returning false
 */

/**
 * Asks `cond` (sync or async) every `every` ms until it gives a truthy value, and returns that value. Past `timeout` it
 * asks once more, then returns false, or throws `never: <what>` when `what` is given. Most callers check the result:
 * `assert(await until(…), '…')`. `opts` may also be just the timeout (a number) or just `what` (a string).
 * @template T
 * @param {() => T | Promise<T>} cond
 * @param {number | string | UntilOptions} [opts]
 * @returns {Promise<T | false>}
 */
export async function until(cond, opts = {}) {
  const o = typeof opts === 'number' ? { timeout: opts } : typeof opts === 'string' ? { what: opts } : opts;
  const { timeout = 15_000, every = 50, what } = o;
  for (const end = Date.now() + timeout; ; await sleep(every)) {
    const v = await cond();
    if (v) return v;
    if (Date.now() >= end) {
      if (what !== undefined) throw new Error('never: ' + what);
      return false;
    }
  }
}

/**
 * until() with other defaults, for a file whose waits all want them, e.g. `const until = untilWith({ timeout: 20_000,
 * every: 100 })`. A call's own number, string or options still win.
 * @param {UntilOptions} defaults
 */
export const untilWith =
  (defaults) =>
  /**
   * @template T
   * @param {() => T | Promise<T>} cond
   * @param {number | string | UntilOptions} [opts]
   */
  (cond, opts = {}) =>
    until(cond, { ...defaults, ...(typeof opts === 'number' ? { timeout: opts } : typeof opts === 'string' ? { what: opts } : opts) });

/** Where a failing test leaves its pictures: SCREENSHOTS (CI uploads it), else SHOTS, else test-results/. */
export function failureDir() {
  const dir = process.env.SCREENSHOTS || process.env.SHOTS || 'test-results';
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * On a failure: a full-page screenshot of each page in failureDir(), as `<name>-failure.png` for one page or
 * `<name>-<label>-failure.png` for several, each logged with its address. `pages` is a page, a list of pages or
 * [label, page] pairs, or a browser (all its open pages). Closed pages, and a browser that never started, are skipped.
 * @param {string} name
 * @param {Page | Browser | Array<Page | [string, Page]> | null | undefined} pages
 */
export async function failureShots(name, pages) {
  try {
    let list = [];
    const given = /** @type {any} */ (pages);
    if (given && typeof given.contexts === 'function')
      list = given
        .contexts()
        .flatMap((c) => c.pages())
        .map((p, i) => [String(i + 1), p]);
    else if (given && typeof given.screenshot === 'function') list = [['', given]];
    else if (Array.isArray(given)) list = given.map((p, i) => (Array.isArray(p) ? p : [String(i + 1), p]));
    list = list.filter(([, p]) => p && !p.isClosed());
    const dir = failureDir();
    for (const [label, p] of list) {
      const path = `${dir}/${name}${list.length === 1 ? '' : '-' + String(label).replace(/[^\w.-]+/g, '')}-failure.png`;
      await p
        .screenshot({ path, fullPage: true })
        .then(() => console.error(`failure screenshot: ${path} (${p.url()})`))
        .catch(() => {});
    }
  } catch {
    /* best effort */
  }
}

/**
 * A new game has no rounds: add a Jeopardy board and a Final Jeopardy (the classic game most tests play), then go
 * back to the board's tab. Does nothing if the game already has rounds (e.g. after a reload).
 * The board wants no Daily Doubles (a test makes a tile one by hand, which counts it): Start game would otherwise
 * put one on a random tile, and a test clicking that tile would get its wager screen.
 * @param {Page} page
 */
export async function addClassicRounds(page) {
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  if (await roundTabsIn(page).count()) return;
  for (const mode of [/Jeopardy board/, /Final Jeopardy/]) {
    await page.getByRole('button', { name: '＋ Add round' }).click();
    await page.getByRole('menuitem', { name: mode }).click();
  }
  await roundTabsIn(page).first().click();
  await noDailyDoubles(page);
}

/**
 * The open board wants no Daily Doubles (none go on at random when the game starts).
 * @param {Page} page
 */
export async function noDailyDoubles(page) {
  const box = page.getByLabel('How many Daily Doubles');
  await box.fill('0');
  await box.press('Tab');
}

/**
 * The first Save (or export) of an untitled game asks for its name: answer with `name` ('' keeps "Untitled Game"). Its
 * button is Save, or Export when it's for the play-only web page.
 * @param {Page} page
 * @param {string} [name]
 */
export async function nameGame(page, name = '') {
  const dialog = page.getByRole('dialog', { name: 'Name your game' });
  await dialog.waitFor();
  if (name) await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: /^(Save|Export)$/ }).click();
}

/**
 * ⋯ → ⬇ Export as a web page… (play-only): Export HTML, the play-only web page.
 * @param {Page} page
 * @param {Parameters<Locator['click']>[0]} [opts] for its clicks
 */
export async function clickExportHtml(page, opts = {}) {
  await page.getByRole('button', { name: /^More:/ }).click(opts);
  await page.getByRole('menuitem', { name: /Export as a web page/ }).click(opts);
}

/**
 * Export HTML, answering the name it asks for on an untitled game's first export (with `name`: '' keeps "Untitled Game").
 * Returns the download.
 * @param {Page} page
 * @param {string} [name]
 */
export async function exportHtml(page, name = '') {
  // Nothing may be open over the editor: a window or question still up leaves the header inert, so the click would wait
  // in vain and the test fail on the download instead (CI run 117). Say which one it is.
  const over = page.locator('[role="alertdialog"], [role="dialog"][aria-modal="true"]').first();
  if (
    await over.waitFor({ state: 'detached', timeout: 5000 }).then(
      () => false,
      () => true,
    )
  )
    throw new Error(`Export HTML: a window is still open over the editor: “${(await over.innerText()).replace(/\s+/g, ' ').slice(0, 200)}”`);
  const download = page.waitForEvent('download');
  download.catch(() => {}); // (as in openGameFile: a failed click mustn't leave this wait unhandled)
  // (A click that can't land fails here, saying why, well before the download's wait runs out.)
  await clickExportHtml(page, { timeout: 10000 });
  const naming = page.getByRole('dialog', { name: 'Name your game' });
  const first = await Promise.race([
    download.then(() => 'download'),
    naming.waitFor().then(
      () => 'name',
      () => 'none',
    ),
  ]);
  if (first === 'name') await nameGame(page, name);
  return download;
}

/**
 * New, Open… or a recent game asks before replacing a game with unsaved changes: answer it (Save first, Cancel, or
 * 'Discard' for "Open anyway" / "Reopen anyway" / "Start new anyway", which keeps it in Recent games).
 * @param {Page} page
 * @param {string} [answer]
 */
export async function answerReplace(page, answer = 'Discard') {
  const dialog = page.getByRole('dialog', { name: /^(Start a new game|Open|Reopen)/ });
  await dialog.waitFor();
  await dialog.getByRole('button', answer === 'Discard' ? { name: / anyway$/ } : { name: answer, exact: true }).click();
  // (The game is being replaced as the click returns: what's typed next waits until the editor takes edits again.)
  if (answer !== 'Cancel') await editorReady(page);
}

/**
 * The editor takes edits: not while a game is being put in place of another (until the new one's undo history has
 * started). A fill meanwhile is lost, since the editor is inert then; a click waits by itself.
 * @param {Page} page
 */
export async function editorReady(page) {
  await page.waitForFunction(() => {
    const inert = (/** @type {string} */ sel) => /** @type {HTMLElement | null} */ (document.querySelector(sel))?.inert;
    return !inert('.editor > header') && !inert('.editor > .body');
  });
}

/**
 * The words selected (blue) on the page outside a field, '' for none (a text box's own selection doesn't count). A click,
 * a double-click, a drag or Ctrl+A selects nothing but fields and the few words marked to copy (.selectable).
 * @param {Page} page
 * @returns {Promise<string>}
 */
export const selectedWords = (page) =>
  page.evaluate(() => (document.activeElement?.matches?.('input, textarea') ? '' : String(getSelection()).replace(/\s+/g, ' ').trim()));
/**
 * Nothing on the page is selected (outside a field).
 * @param {Page} page
 */
export const noSelection = async (page) => (await selectedWords(page)) === '';

/**
 * 🎨 Theme › ▸ Share or bring in a theme: open its fold (it starts folded; this computer remembers it).
 * @param {Page} page
 */
export async function openThemeShare(page) {
  const fold = page.locator('[data-share-fold]');
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
  await page.locator('#theme-share').waitFor();
}

/**
 * Open… a game file (`files` as for setFiles): Open… is one window, whose Browse for a game file… picks it.
 * @param {Page} page
 * @param {Parameters<import('playwright-core').FileChooser['setFiles']>[0]} files
 */
export async function openGameFile(page, files) {
  const chooser = page.waitForEvent('filechooser');
  // A click that fails first mustn't leave this wait to reject unhandled later: that ends the run before the test's catch
  // (and its failure screenshots) can run. Awaited below, it still fails as ever when no chooser opens.
  chooser.catch(() => {});
  // (A click that can't land fails here, saying why, well before the chooser's wait runs out, as in exportHtml.)
  await page.getByRole('button', { name: 'Open…' }).click({ timeout: 10000 });
  await page.getByRole('dialog', { name: 'Open a game' }).getByRole('button', { name: 'Browse for a game file…' }).click({ timeout: 10000 });
  await (await chooser).setFiles(files);
}

/**
 * Drag in small steps (the browser's own drag and drop needs a few moves to start) from the middle of one thing to the
 * middle of another, or to a point ({ x, y }).
 * @param {Page} page
 * @param {Locator} from
 * @param {Locator | { x: number, y: number }} to
 */
export async function dragBy(page, from, to) {
  const point = /** @type {{ x?: number, y?: number }} */ (to);
  const toThing = /** @type {Locator} */ (to);
  // (Both ends on screen: the mouse can't go past the window's edge.)
  if (point.x === undefined) await toThing.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
  await from.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
  const a = await from.boundingBox();
  const b = point.x !== undefined ? point : await toThing.boundingBox().then((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }));
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/**
 * Clicks as Safari, the Mac desktop app and Firefox on a Mac make them: a button clicked doesn't take the focus, and the
 * field that had it lets go (its blur has no relatedTarget). Returns what puts Chromium's own clicks back.
 * @param {Page} page
 */
export async function macClicks(page) {
  await page.evaluate(() => {
    window.__macClick = (e) => {
      if (!e.target.closest?.('button')) return;
      e.preventDefault();
      /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
    };
    window.addEventListener('mousedown', window.__macClick, true);
  });
  return () => page.evaluate(() => window.removeEventListener('mousedown', window.__macClick, true));
}

/**
 * On the pre-game screen (▶ Play): add `n` players with ＋ Add player.
 * @param {Page} page
 * @param {number} n
 */
export async function addPlayers(page, n) {
  const add = page.getByRole('button', { name: '＋ Add player' });
  for (let i = 0; i < n; i++) await add.click();
}

/**
 * ▶ Play from the editor, then add `n` players on the pre-game screen (where the game's players are set).
 * @param {Page} page
 * @param {number} n
 */
export async function playWithPlayers(page, n) {
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await addPlayers(page, n);
}

/**
 * ▶ Play's Start game ▶, and, when it asks first about the game in progress it would throw away (one with points, tiles
 * played or rolls), its Start new game (past the question's double-click guard). Resolves once the game is on screen.
 * @param {Page} page
 */
export async function startNewGame(page) {
  await page.getByRole('button', { name: 'Start game ▶' }).click();
  const which = await (
    await page.waitForFunction(() => (document.querySelector('.actions [data-start-ask]') ? 'ask' : document.querySelector('main.play') ? 'play' : null))
  ).jsonValue();
  if (which === 'ask') {
    await page.waitForTimeout(450);
    await page.locator('.actions [data-start-ask]').getByRole('button', { name: 'Start new game' }).click();
  }
  await page.locator('main.play').waitFor();
}

/**
 * The 📱 Phone buzzers card's ▸ Buzzer options fold (when the buzzers open, new players, colors, the early wait), opened
 * (this computer remembers it). `where`: the card, or the page.
 * @param {Page | Locator} where
 */
export async function openBuzzerOptions(where) {
  const fold = where.locator('[data-buzzer-options]');
  await fold.waitFor();
  if (!(await fold.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) await fold.locator('summary').click();
  await fold.evaluate(
    (d) => new Promise((ok) => (/** @type {HTMLDetailsElement} */ (d).open ? ok() : d.addEventListener('toggle', () => ok(), { once: true }))),
  );
  return fold;
}

/**
 * The pre-game screen's 📺 On stream fold (the Starting soon and cover cards, captions…), opened (remembered).
 * @param {Page} page
 */
export async function openOnStream(page) {
  const fold = page.locator('[data-stream-fold]');
  await fold.waitFor();
  if (!(await fold.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) await fold.locator('summary').click();
  await fold.evaluate(
    (d) => new Promise((ok) => (/** @type {HTMLDetailsElement} */ (d).open ? ok() : d.addEventListener('toggle', () => ok(), { once: true }))),
  );
  return fold;
}

/**
 * The pre-game screen's player list with its start scores shown (± Start scores; they show anyway when one isn't 0).
 * @param {Page} page
 */
export async function openStartScores(page) {
  const toggle = page.getByRole('button', { name: '± Start scores' });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await page.locator('.pregame .player input.score').first().waitFor();
}

/**
 * The pre-game screen's ⚖ Game rules, opened (rules, timers, the round intro).
 * @param {Page} page
 */
export async function openRules(page) {
  const rules = page.locator('details.rules');
  await rules.waitFor();
  if (!(await rules.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) await rules.locator('summary').click();
  await rules.evaluate(
    (d) => new Promise((ok) => (/** @type {HTMLDetailsElement} */ (d).open ? ok() : d.addEventListener('toggle', () => ok(), { once: true }))),
  );
  return rules;
}

// ---------- The host panel ----------

/**
 * The host panel's main button (its NEXT cell: 👁 Reveal answer, Show question ▶, Next ▶…); with `name`, while it says that.
 * @param {Page} page
 * @param {string | RegExp} [name]
 */
export const mainButton = (page, name) => {
  const b = hostPanelIn(page).locator('[data-next]');
  return name === undefined ? b : b.and(page.getByRole('button', { name, exact: true }));
};

/**
 * The button in one of a clue's fixed places in the host panel (data-flow): 'pager' (◀ Slide, Next slide ▶), 'reveal'
 * (👁 Reveal answer / 🙈 Hide answer), 'putback' (↩ Put back (keep tile)) or 'done' (▦ Done ▶ board, the tiebreaker's
 * 🏁 Back to results); with `name`, the one that says that. The main button carries the mark of the place whose step it
 * does: the row's own button comes first, else the main button, so the step is found wherever it is now.
 * @param {Page} page
 * @param {string} place
 * @param {string | RegExp} [name]
 */
export const flowButton = (page, place, name) => {
  const b = hostPanelIn(page).locator(`[data-flow="${place}"]`);
  return (name === undefined ? b : b.and(page.getByRole('button', { name, exact: true }))).first();
};

/**
 * A step button (data-step) in a moment's box (the 🤝 box's 🎡 Spin for a partner…): the box's own button for a step the
 * main button may do too, never the main button. `box`: the box (a locator), or a page for any in its host panel; with
 * `name`, the one that says that.
 * @param {Page | Locator} box
 * @param {string | RegExp} [name]
 */
export const stepButton = (box, name) => {
  const root = typeof (/** @type {any} */ (box).mainFrame) === 'function' ? hostPanelIn(box) : box;
  const b = root.locator('[data-step]');
  return name === undefined ? b : b.and(root.getByRole('button', { name, exact: true }));
};

/**
 * What the main button says, without its key cap (R, N, Esc…).
 * @param {Page} page
 * @returns {Promise<string>}
 */
export const mainLabel = (page) =>
  mainButton(page).evaluate((b) =>
    [...b.childNodes]
      .filter((n) => n.nodeName !== 'KBD')
      .map((n) => n.textContent)
      .join('')
      .trim(),
  );

/**
 * The moment's box holds this action (🎡 Spin for a partner, 📤 Send and start, ✔ Got it…): one button in the whole
 * panel says `name` (no copy anywhere else, the blue button included), it's in `box`, and it's in sight there, not
 * scrolled away inside the box nor under its foot (what's at its middle is it). Resolves to '' when it holds, else
 * what's wrong, for the assertion's message.
 * @param {Locator} box
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function boxHasAction(box, name) {
  const all = hostPanelIn(box.page()).getByRole('button', { name, exact: true });
  const n = await all.count();
  if (n !== 1) return `${n} buttons say “${name}” in the panel`;
  const b = box.getByRole('button', { name, exact: true });
  if ((await b.count()) !== 1) return `“${name}” isn't in the box`;
  const seen = await b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!at && el.contains(at);
  });
  return seen ? '' : `the box's “${name}” is out of sight`;
}

/**
 * The blue button is this step of the show (its words without the key cap), and blue (the panel's one .primary).
 * @param {Page} page
 * @param {string} label
 */
export async function flowIs(page, label) {
  const b = mainButton(page);
  return (await b.count()) === 1 && (await mainLabel(page)) === label && (await b.evaluate((el) => el.classList.contains('primary')));
}

// ---------- The check before going on (host/goon.ts: the blue button pressed with something left) ----------

/**
 * The check, while it's open (its data-goon says its heading: 'first', 'loss' or 'nothing'). `ready`: once its guard
 * is over (600 ms after it opens: keys and clicks on it count from then), a state to wait on, never a timer.
 */
/**
 * Closing or reloading the tab now would have the browser ask first ("Leave site?"): the app's beforeunload says so.
 * @param {Page} page
 */
export const leaveAsks = (page) =>
  page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });

// Stable hooks: the app's big structural parts carry a valueless data-* attribute beside their class, and these find them
// by it, so a restyle that renames a class doesn't break the tests. Each takes where to look (a page, a locator or a
// frame) and, like locator(), optional { hasText, has, … }. A hook never carries a value: no card words, answers, picks
// or names. New tests use these rather than the classes; older ones move over as they're touched (see
// docs/development.md).

/** @typedef {Page | Locator | import('playwright-core').FrameLocator} Where */
/** @typedef {Parameters<Locator['locator']>[1]} LocatorOptions */

/**
 * @param {string} attr
 * @returns {(where: Where, opts?: LocatorOptions) => Locator}
 */
const hook = (attr) => (where, opts) => where.locator(`[${attr}]`, opts);

/** The stage box on the host screen, what viewers see (`.stage-box`). */
export const stageBoxIn = hook('data-stage-box');
/** The host panel, under or beside the stage (`.panel`). */
export const hostPanelIn = hook('data-host-panel');
/** The host panel's status line, what's going on (`.panel .status`). */
export const statusLineIn = hook('data-host-status');
/** The host panel's player rows, one per player or team (`.panel .p`). */
export const playerRowsIn = hook('data-player-row');
/** The host panel's award row: the verdict buttons and their options (`.panel .award`). */
export const awardRowIn = hook('data-award-row');
/** The host panel's tools row (`.panel .toolsrow`). */
export const toolsRowIn = hook('data-tools-row');
/** The Jeopardy board (`.board`), on the host's stage or the stream window. */
export const boardIn = hook('data-board');
/** The board's tiles, the category headings left out (`.board .tile`). */
export const boardTilesIn = hook('data-board-tile');
/** The toasts: the app's own, and the host screen's notes while its controls are hidden (`.toast`). */
export const toastsIn = hook('data-toast');
/** A Final's controls in the host panel: wagers, answers, the reveal (`.fj`). */
export const finalControlsIn = hook('data-final-controls');
/** The host panel's round navigation (`.rn`). */
export const roundNavIn = hook('data-round-nav');
/** The editor's round tabs, one per round, in the side nav (`nav > button.round-tab`). */
export const roundTabsIn = hook('data-round-tab');
/** The app's status bar at the bottom: the phone room, the saved game, the stream window (`.status-bar`). */
export const statusBarIn = hook('data-status-bar');
/** The slide editor's inspector, beside the canvas (`.insp`). */
export const inspectorIn = hook('data-inspector');

/**
 * @param {Page} page
 * @param {{ ready?: boolean }} [opts]
 */
export const goOnCheck = (page, { ready = false } = {}) => hostPanelIn(page).locator(ready ? '[data-goon][data-ready]' : '[data-goon]');
/**
 * One thing left in it, by its id: 'picked', 'dd', 'buzzers', 'tie', 'answers', 'judge', 'card:<card id>'.
 * @param {Page} page
 * @param {string} id
 */
export const checkItem = (page, id) => goOnCheck(page).locator(`[data-goon-item="${id}"]`);
/**
 * A fix in it, by the words it starts with ("＋ Award Ann $200 ▶ board", "🔔 Open the buzzers").
 * @param {Page} page
 * @param {string | RegExp} words
 */
export const quick = (page, words) => goOnCheck(page).locator('[data-quick]').filter({ hasText: words }).first();
/**
 * Its quiet "… anyway" (▦ Done anyway: no points, 👁 Reveal anyway).
 * @param {Page} page
 */
export const anyway = (page) => goOnCheck(page).locator('[data-anyway]');
/**
 * Its Not yet (Esc).
 * @param {Page} page
 */
export const notYet = (page) => goOnCheck(page).locator('[data-notyet]');
/**
 * The Final's 👁 Reveal answer just pressed, its think clock still running: the check asks first, 👁 Reveal anyway.
 * @param {Page} page
 */
export async function revealAnyway(page) {
  await checkItem(page, 'clock').waitFor();
  await goOnCheck(page, { ready: true }).waitFor();
  await anyway(page).click();
  await goOnCheck(page).waitFor({ state: 'detached' });
}
/**
 * Whether a fix in the open check is in sight as it opened, scrolled nowhere: all of it inside the check's scrolling
 * part above its faded foot, and a click at its middle lands on it (not on the pinned foot). Playwright's own click
 * scrolls a hidden button into view first, so a test that only clicks it can't tell. '' when it is, else what's wrong.
 * @param {Page} page
 * @param {string | RegExp} words
 * @returns {Promise<string>}
 */
export async function quickInSight(page, words) {
  return quick(page, words).evaluate((b) => {
    const r = b.getBoundingClientRect();
    const scroll = b.closest('.scroll');
    const s = scroll.getBoundingClientRect();
    const fade = parseFloat(getComputedStyle(scroll, '::after').height) || 0;
    const at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    const inside = r.top >= s.top - 0.5 && r.bottom <= s.bottom - fade + 0.5;
    return inside && b.contains(at)
      ? ''
      : `“${/** @type {HTMLElement} */ (b).innerText.replace(/\s+/g, ' ').trim()}” at ${Math.round(r.top)}–${Math.round(r.bottom)}, the scrolling part ${Math.round(s.top)}–${Math.round(s.bottom)} (its last ${fade}px faded), the middle on ${at?.tagName}.${at?.className}`;
  });
}

/**
 * The app's own right-click menu, while it's open.
 * @param {Page} page
 */
export const openMenu = (page) => page.locator('.cm[role="menu"]');

/**
 * What the open right-click menu says, in order: "# heading", each item's words with its key ("👁 Reveal answer · R"),
 * " (off)" on a greyed one, "—" for a line.
 * @param {Page} page
 */
export async function menuLines(page) {
  const m = openMenu(page);
  await m.waitFor();
  return m.evaluate((el) =>
    [...el.children].map((c) => {
      if (c.classList.contains('sep')) return '—';
      if (c.classList.contains('heading')) return `# ${c.textContent.trim()}`;
      const key = c.querySelector('kbd')?.textContent.trim();
      return `${c.querySelector('.label')?.textContent.trim()}${key ? ` · ${key}` : ''}${/** @type {HTMLButtonElement} */ (c).disabled ? ' (off)' : ''}`;
    }),
  );
}

/**
 * A finger held still on `target` (a locator) for `ms`, then lifted: a long press on a touch screen, sent from the page.
 * @param {Locator} target
 * @param {number} [ms]
 */
export async function longPress(target, ms = 800) {
  await target.evaluate(async (el, wait) => {
    const r = el.getBoundingClientRect();
    const at = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerType: 'touch',
      pointerId: 7,
      isPrimary: true,
      clientX: r.x + r.width / 2,
      clientY: r.y + r.height / 2,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', at));
    await new Promise((ok) => setTimeout(ok, wait));
    el.dispatchEvent(new PointerEvent('pointerup', at));
    el.dispatchEvent(new MouseEvent('click', at));
  }, ms);
}

/** The confirmation strip above the fixed bar (Leave this game?, End the game now? 7 clues are left.…) (`.panel .confirm`). */
export const confirmStrip = hook('data-confirm-strip');

/**
 * Press an answer of a question asked in the panel (Replace, Sell anyway…), once its question takes clicks: in its first
 * moment it takes none (the rest of the double-click that asked it). Cancel needs no wait.
 * @param {Locator} button
 */
export async function answerAsk(button) {
  await button.locator('xpath=ancestor::*[@data-ask][@data-ready]').waitFor();
  await button.click();
}

/**
 * Leaving a round's question, its answer that goes: Go to Double Jeopardy! ▶, End game ▶ (Keep playing stays).
 * @param {Page} page
 */
export const leaveAnswer = (page) => confirmStrip(page).getByRole('button', { name: /^(Go to .+|End game) ▶$/ });

// ---------- Phone buzzers ----------

/**
 * A page's WebSocket (a phone's, or the host's), passed through Playwright: `delay` ms each way (a slow network), when
 * each buzz reached the server (`sent`), when each armed view reached the page (`armedAt`), and `rewrite` to change a
 * buzz on its way. `drop()` cuts the connection (both ends see it close), `stall()` makes it go silent without closing
 * (a phone asleep in the background), and `blocked` turns new connections away (the network is down). Each of `routes`
 * notes the code the server closed it with (`closed`).
 * @param {Page} page
 */
export async function tap(page) {
  const t = { delay: 0, sent: [], armedAt: {}, rewrite: null, blocked: false, routes: [] };
  t.drop = () => {
    const r = t.routes.at(-1);
    r.dead = true;
    r.ws.close({ code: 1011, reason: 'dropped' }).catch(() => {});
    r.server.close().catch(() => {});
  };
  t.stall = () => (t.routes.at(-1).dead = true);
  await page.routeWebSocket(/\/ws\//, (ws) => {
    if (t.blocked) return void ws.close({ code: 1011, reason: 'offline' }).catch(() => {});
    const server = ws.connectToServer();
    const route = { ws, server, dead: false, closed: 0 };
    t.routes.push(route);
    server.onClose((code, reason) => {
      route.closed = code;
      ws.close({ code, reason }).catch(() => {});
    });
    const later = (fn) => (t.delay ? setTimeout(fn, t.delay) : fn());
    const toServer = (m) =>
      later(() => {
        if (route.dead) return;
        const j = JSON.parse(m);
        if (j.t === 'buzz') t.sent.push({ ...j, at: Date.now() });
        server.send(m);
      });
    ws.onMessage((m) => {
      const j = JSON.parse(String(m));
      if (j.t === 'buzz' && t.rewrite) t.rewrite(j, (k) => toServer(JSON.stringify(k)));
      else toServer(String(m));
    });
    server.onMessage((m) =>
      later(() => {
        if (route.dead) return;
        const j = JSON.parse(String(m));
        if (j.t === 'view' && j.view.phase === 'armed') t.armedAt[j.view.armId] ??= Date.now();
        ws.send(m);
      }),
    );
  });
  return t;
}

/**
 * Holds the next buzz from each of these phones, then lets them all go with the same reaction time: a tie.
 * @param {Array<Awaited<ReturnType<typeof tap>>>} taps
 */
export function tieThem(taps) {
  const held = [];
  for (const t of taps)
    t.rewrite = (j, send) => {
      held.push({ t, j, send });
      if (held.length < taps.length) return;
      // The phone that lit first's time (less a little): every phone lit after the room armed, so it never claims more
      // than the time since arming, and the network time it implies is that phone's, small for both. (The later phone's
      // time would make the earlier one look like it took a long network trip on a busy machine, and the room would rank
      // it by arrival instead: no tie.)
      const reactMs = Math.max(...held.map((h) => Date.now() - h.t.armedAt[h.j.armId])) - 20;
      for (const h of held) {
        h.t.rewrite = null;
        h.send({ ...h.j, reactMs });
      }
    };
}

/**
 * A plain-colored PNG.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} [w]
 * @param {number} [h]
 */
export function png(r, g, b, w = 40, h = 24) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- The buzzer room, game packs, and what a page showed ----------

// Ports claimed by this process (freePort), given up when it exits.
const claimedPorts = new Set();
const portClaims = join(tmpdir(), 'brainrot-e2e-ports');
process.on('exit', () => {
  for (const f of claimedPorts) rmSync(f, { force: true });
});
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

/**
 * A port on 127.0.0.1 for a server this test starts later (wrangler dev and its inspector), kept for this process
 * until it exits, so e2e files run side by side (e2e-shard --jobs) never get the same one. It's picked from 20000–29999,
 * below the range the system hands out for port 0, so no server that asks for "any port" (Chromium, workerd's own,
 * another test's) takes it meanwhile; it's free when picked; and it's claimed with a file in the temp folder
 * (brainrot-e2e-ports/<port>, holding the process id) that no other test process can make while this one is alive.
 */
export async function freePort() {
  mkdirSync(portClaims, { recursive: true });
  const canBind = (port) =>
    new Promise((ok) => {
      const s = createServer();
      s.once('error', () => ok(false));
      s.listen(port, '127.0.0.1', () => s.close(() => ok(true)));
    });
  for (let tries = 0; tries < 500; tries++) {
    const port = 20000 + Math.floor(Math.random() * 10000);
    const claim = join(portClaims, String(port));
    if (claimedPorts.has(claim)) continue;
    try {
      writeFileSync(claim, String(process.pid), { flag: 'wx' });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Claimed by a test process that's gone (killed before it could tidy up): free it for a later try. An empty
      // claim is one being made right now (the file exists before its process id is in it): leave that alone.
      const owner = Number(readFileSync(claim, 'utf8'));
      if (!owner || pidAlive(owner)) continue;
      rmSync(claim, { force: true });
      continue;
    }
    claimedPorts.add(claim);
    if (await canBind(port)) return port;
    // Something else (not a test) is on it: keep the claim, so no one else tries it either, and pick another.
  }
  throw new Error('freePort: no free port in 20000–29999');
}

/**
 * The buzzer room (buzzer/ under `wrangler dev`, local), its storage in a new folder (`persist`): its address (`base`,
 * and `port`) once it answers, stop() (which also deletes that folder), and restart() (stopped and started again on the
 * same address and storage, as a deploy or a crash would: its rooms come back from storage). `vars`: its settings for this test (as
 * wrangler.jsonc's vars, e.g. { FILE_MB: 4 }), passed as --var (never buzzer/.dev.vars: the working tree is shared).
 * Needs `npm ci` in buzzer/.
 * @param {string} prefix the name its storage folder starts with
 * @param {{ vars?: Record<string, string | number> }} [opts]
 */
export async function startBuzzer(prefix, { vars = {} } = {}) {
  const { spawn } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const dir = resolve('buzzer');
  if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');
  const port = await freePort();
  const inspector = await freePort();
  const persist = mkdtempSync(join(tmpdir(), prefix));
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  let wrangler;
  const start = async () => {
    log = '';
    wrangler = spawn(
      join(dir, 'node_modules/.bin/wrangler'),
      [
        'dev',
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        String(inspector),
        '--persist-to',
        persist,
        '--log-level',
        'warn',
        ...buzzerVars(vars),
      ],
      { cwd: dir, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } },
    );
    wrangler.stdout.on('data', (d) => (log += d));
    wrangler.stderr.on('data', (d) => (log += d));
    for (let i = 0; ; i++) {
      if (wrangler.exitCode !== null) throw new Error('wrangler dev exited:\n' + log);
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {
        // not up yet
      }
      if (i > 120) throw new Error('wrangler dev never came up:\n' + log);
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  const kill = (signal = 'SIGTERM') => {
    try {
      process.kill(-wrangler.pid, signal);
    } catch {
      // already gone
    }
  };
  const stop = () => {
    kill();
    rmSync(persist, { recursive: true, force: true });
  };
  const restart = async () => {
    const gone = wrangler.exitCode !== null ? Promise.resolve() : new Promise((ok) => wrangler.once('exit', ok));
    kill();
    const late = setTimeout(() => kill('SIGKILL'), 5000);
    await gone;
    clearTimeout(late);
    // (Its address free again: nothing answers there.)
    for (let i = 0; ; i++) {
      try {
        await fetch(`${base}/api/health`);
      } catch {
        break;
      }
      if (i > 100) throw new Error('the old wrangler dev still answers');
      await new Promise((r) => setTimeout(r, 100));
    }
    await start();
  };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));
  await start();
  return { base, port, persist, stop, restart };
}

/**
 * ▶ Start the room on a 📱 Phone buzzers card (`keys`: with Enter, not a click): its code, once the card shows it. If it
 * never does, it fails saying what the card says instead (the buzzer server's refusal, or still its Start button) and what the page asked the buzzer
 * server meanwhile.
 * @param {Locator} card
 * @param {{ keys?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function startRoomOn(card, { keys = false } = {}) {
  const page = card.page();
  const t0 = Date.now();
  const asked = [];
  const note = (what) => asked.push(`+${Date.now() - t0} ms ${what}`);
  const ours = (url) => /\/(api|ws)\//.test(url);
  const path = (url) => url.replace(/\?.*/, '');
  const onRequest = (r) => ours(r.url()) && note(`${r.method()} ${path(r.url())}`);
  const onResponse = (r) => ours(r.url()) && note(`${r.status()} ${path(r.url())}`);
  const onFailed = (r) => ours(r.url()) && note(`failed ${path(r.url())}: ${r.failure()?.errorText}`);
  const onSocket = (ws) => ours(ws.url()) && (note(`socket ${path(ws.url())}`), ws.on('close', () => note(`socket closed ${path(ws.url())}`)));
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  page.on('websocket', onSocket);
  try {
    const start = card.getByRole('button', { name: '▶ Start the room' });
    if (keys) {
      await start.focus();
      await page.keyboard.press('Enter');
    } else await start.click();
    note(`${keys ? 'pressed' : 'clicked'} ▶ Start the room`);
    const codeEl = card.locator('[aria-label^="Room code "]');
    try {
      await codeEl.waitFor();
    } catch (e) {
      const says = (await card.innerText({ timeout: 1000 }).catch(() => '(no card)')).replace(/\s+/g, ' ').trim();
      throw new Error(`The room's code never showed. The card says: ${says}\nThe page and the buzzer server:\n  ${asked.join('\n  ')}`, { cause: e });
    }
    return (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
    page.off('websocket', onSocket);
  }
}

/**
 * wrangler dev's arguments for these settings (startBuzzer's `vars`): --var K:V each, over wrangler.jsonc's.
 * @param {Record<string, string | number>} vars
 */
export const buzzerVars = (vars) => Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`]);

/**
 * The keys every buzzer room (BuzzRoom Durable Object) under `persist` has stored now: read from a copy of their
 * SQLite files (wrangler dev keeps one per object, its keys in the _cf_KV table), so the server needs no test code.
 * @param {string} persist
 * @returns {Promise<string[]>}
 */
export async function roomKeys(persist) {
  const { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = join(persist, 'v3/do/brainrot-buzzer-BuzzRoom');
  // (The room writes as this reads: a file gone or half written meanwhile, and it's read again.)
  for (let tries = 1; ; tries++) {
    const copy = mkdtempSync(join(tmpdir(), 'room-keys-'));
    try {
      if (!existsSync(dir)) return [];
      const names = readdirSync(dir);
      for (const f of names) {
        try {
          copyFileSync(join(dir, f), join(copy, f));
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
      }
      const keys = [];
      for (const f of names) {
        if (!f.endsWith('.sqlite') || f === 'metadata.sqlite' || !existsSync(join(copy, f))) continue;
        const db = new DatabaseSync(join(copy, f), { readOnly: true });
        try {
          // (A room that ended has no table left.)
          if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = '_cf_KV'").get())
            keys.push(
              ...db
                .prepare('SELECT key FROM _cf_KV')
                .all()
                .map((r) => /** @type {string} */ (r.key)),
            );
        } finally {
          db.close();
        }
      }
      return keys;
    } catch (e) {
      if (tries >= 5) throw e;
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }
}

/**
 * Whether any file the buzzer room stored (its Durable Objects' SQLite files under `persist`) holds `text`: as the
 * room saves strings (one byte a character for plain ASCII, two otherwise), so look for both.
 * @param {string} persist
 * @param {string} text
 */
export async function roomStored(persist, text) {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const wants = [Buffer.from(text, 'latin1'), Buffer.from(text, 'utf16le')];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of walk(persist)) {
    let b;
    try {
      b = readFileSync(f);
    } catch {
      continue;
    }
    if (wants.some((w) => b.includes(w))) return true;
  }
  return false;
}

/**
 * A game pack (.brainrot: a zip of game.json and media/<id>.<ext>) with these files, by media id: what Open… takes.
 * @param {object} game
 * @param {Record<string, Uint8Array | string>} files
 */
export async function packGame(game, files) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('game.json', JSON.stringify(game));
  for (const ref of game.media) if (files[ref.id]) zip.file(`media/${ref.id}.${ref.name.split('.').pop()}`, files[ref.id]);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

/**
 * An init script: everything the page puts on screen or says from now on (text added, and the labels, titles and alt
 * texts set, the screen-reader announcements included: the live region's host keeps its words in data-said) goes in
 * window.__seen, so a toast or an announcement that came and went is still there to check. Beside each, in
 * window.__seenWhere (same place, kept in step when a test empties __seen), where it was: the element, its ancestors,
 * when (performance.now()) and whether it was still on the page then (seenWhere reads them).
 */
export function recordSeen() {
  const seen = (window.__seen = []);
  const where = (window.__seenWhere = []);
  const ATTRS = ['aria-label', 'title', 'alt', 'aria-description', 'placeholder', 'data-said'];
  // (A style sheet's or a script's text is never shown: a font's base64 would hold any short word.)
  const unseen = (n) => !!n?.closest?.('style, script, noscript, template');
  /** An element's opening tag, short. */
  const tag = (el) => (el ? `<${el.localName}${[...el.attributes].map((a) => ` ${a.name}="${a.value.slice(0, 40)}"`).join('')}>`.slice(0, 160) : '?');
  /** Its ancestors (tag#id.class), from the outermost of the nearest 8. */
  const path = (el) => {
    const out = [];
    for (let p = el; p && out.length < 8; p = p.parentElement) out.push(p.localName + (p.id ? `#${p.id}` : '') + [...p.classList].map((c) => `.${c}`).join(''));
    return out.reverse().join(' > ');
  };
  const push = (text, el) => {
    // (A test empties __seen by setting its length to 0: the places go with it.)
    if (where.length > seen.length) where.length = seen.length;
    seen.push(text);
    where.push({ at: Math.round(performance.now()), el: tag(el), path: path(el), on: !!el?.isConnected });
  };
  const take = (n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!unseen(n.parentElement)) push(n.data, n.parentElement);
    } else if (n.nodeType === Node.ELEMENT_NODE && !unseen(n)) {
      const walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) if (!unseen(t.parentElement)) push(/** @type {Text} */ (t).data, t.parentElement);
      for (const el of [n, ...n.querySelectorAll('*')]) for (const a of ATTRS) if (el.hasAttribute(a)) push(el.getAttribute(a), el);
    }
  };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(take);
      else if (m.type === 'characterData') !unseen(m.target.parentElement) && push(/** @type {CharacterData} */ (m.target).data, m.target.parentElement);
      else {
        const el = /** @type {Element} */ (m.target);
        if (el.hasAttribute(m.attributeName)) push(el.getAttribute(m.attributeName), el);
      }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/**
 * Where a page (with recordSeen) shows or said any of `words` (case aside), now or since it loaded, as lines to print
 * when a check fails: what held it, the element (its tag, its ancestors), when (ms since the page loaded), and whether
 * it was still on the page by the time it was recorded ("gone at once": added and taken off before it could be drawn).
 * (The screen reader's words are the live region's: div#live-region, drawn nowhere.)
 * @param {Page} page
 * @param {string[]} words
 * @returns {Promise<string[]>}
 */
export function seenWhere(page, words) {
  return page.evaluate((words) => {
    const at = (s) =>
      Math.min(
        ...words
          .map((w) =>
            String(s ?? '')
              .toLowerCase()
              .indexOf(w.toLowerCase()),
          )
          .filter((i) => i >= 0),
      );
    const has = (s) => at(s) !== Infinity;
    /** Its words on one line, around the first match when they're long. */
    const near = (s) => {
      const t = String(s).replace(/\s+/g, ' ');
      if (t.length <= 200) return `“${t}”`;
      const i = at(t);
      return `“${i > 80 ? '…' : ''}${t.slice(Math.max(0, i - 80), i + 120)}${i + 120 < t.length ? '…' : ''}”`;
    };
    const cls = (el) => (el?.getAttribute('class') ? ` class="${el.getAttribute('class')}"` : '');
    const seen = window.__seen ?? [];
    const where = (window.__seenWhere ?? []).slice(0, seen.length);
    const out = [];
    seen.forEach((s, i) => {
      if (!has(s)) return;
      const w = where[i];
      out.push(`seen at ${w ? `${w.at}ms${w.on ? '' : ' (gone at once)'} in ${w.el} (${w.path})` : '?'}: ${near(s)}`);
    });
    const ATTRS = ['aria-label', 'title', 'alt', 'aria-description', 'placeholder', 'data-said'];
    let inNode = false;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode())
      if (has(/** @type {Text} */ (t).data) && !t.parentElement?.closest('style, script, noscript, template')) {
        inNode = true;
        out.push(`on the page now in <${t.parentElement?.localName}${cls(t.parentElement)}>: ${near(/** @type {Text} */ (t).data)}`);
      }
    for (const el of document.body.querySelectorAll('*'))
      for (const a of ATTRS)
        if (el.hasAttribute(a) && has(el.getAttribute(a))) out.push(`on the page now in <${el.localName}${cls(el)}> ${a}: ${near(el.getAttribute(a))}`);
    // (The page's words read together run across elements: "Leader" in one, " hint" in the next.)
    if (!inNode && has(document.body.innerText)) out.push(`on the page now, across elements: ${near(document.body.innerText)}`);
    out.push(`(now ${Math.round(performance.now())}ms)`);
    return out;
  }, words);
}

/**
 * Starts what a page (with recordSeen) showed and said afresh, once it has said what it was still to say. Its screen
 * reader's words go out in a batch ANNOUNCE_WAIT (400 ms) after the last of them, and reach the live region 30 ms after
 * that (src/lib/announce.ts): an editor's last notices ("Deleted card “Leader hint”…") are said after ▶ Play when ▶ Play
 * comes sooner, and would count as said in play. So it waits in the page itself: timers run in the order they're due
 * however busy the page is, so the batch goes before a 1 s timer, and its last 30 ms before one set after that.
 * @param {Page} page
 */
export async function forgetSeen(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    await wait(1000);
    await wait(100);
    window.__seen.length = 0;
    if (window.__seenWhere) window.__seenWhere.length = 0;
  });
}

/**
 * Which of `words` a page (with recordSeen) shows or said, now or since it loaded (case aside).
 * @param {Page} page
 * @param {string[]} words
 * @returns {Promise<string[]>}
 */
export async function shownOf(page, words) {
  const text = await page.evaluate(() =>
    [
      document.body.innerText,
      ...[...document.querySelectorAll('[aria-label], [title], [alt], [data-said], [aria-description], [placeholder]')].flatMap((e) =>
        ['aria-label', 'title', 'alt', 'data-said', 'aria-description', 'placeholder'].map((a) => e.getAttribute(a) ?? ''),
      ),
      ...(window.__seen ?? []),
    ]
      .join('\n')
      .toLowerCase(),
  );
  return words.filter((w) => text.includes(w.toLowerCase()));
}

/**
 * What autosave last stored under `key` (IndexedDB, idb-keyval's store): 'playSession' is the game in progress
 * ({ game, session, savedAt }), what a reload resumes; 'editorDraft' the editor's game. Null when there is none. A test
 * that reloads waits for the stored session to hold its last host action first: the write waits a moment for more
 * clicks, and the copy written as the page goes away isn't always kept by a browser under test.
 * @param {Page} page
 * @param {string} [key]
 * @returns {Promise<any>}
 */
export function stored(page, key = 'playSession') {
  return page.evaluate(
    (key) =>
      new Promise((ok) => {
        const r = indexedDB.open('keyval-store');
        r.onerror = () => ok(null);
        r.onsuccess = () => {
          const db = r.result;
          try {
            const g = db.transaction('keyval').objectStore('keyval').get(key);
            g.onsuccess = () => (ok(g.result ?? null), db.close());
            g.onerror = () => (ok(null), db.close());
          } catch {
            db.close();
            ok(null);
          }
        };
      }),
    key,
  );
}

/**
 * The context's pages are a host's who used the app before (a setting is kept): a first run counts “What moved in this
 * version” as seen (no ❔ Help dot), so a test of the dot and the open list starts as a returning host.
 * @param {import('playwright-core').BrowserContext} context
 */
export const returningHost = (context) =>
  context.addInitScript(() => {
    try {
      localStorage.setItem('jb.e2e.returningHost', '1');
    } catch {
      // (A page with no storage of its own.)
    }
  });

/**
 * The editor's sidebar Checklist unfolded (it starts folded on a window under 800 px high; the choice is remembered, so
 * once is enough for a page).
 * @param {Page} page
 */
export async function showChecklist(page) {
  const head = page.locator('nav .problems > button.fold');
  await head.waitFor();
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
}

/**
 * (Run in the page, with `locator.evaluate(lineOf)`.) How many lines an element's words take, counted from where they
 * sit (its height over its line height can't tell: a `normal` line height reads as no number, and a guess passes two
 * lines), whether any of it is cut short with an ellipsis, whether its link (if any) shows whole inside it, and its
 * tooltip.
 * @param {Element} e
 */
export const lineOf = (e) => {
  const range = document.createRange();
  range.selectNodeContents(e);
  const tops = [...range.getClientRects()]
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => r.top)
    .sort((a, b) => a - b);
  // (Words in another font, or bold, sit a few pixels off the line's own top: a new line is more than half a line down.)
  const half = (parseFloat(getComputedStyle(e).fontSize) || 12) * 0.6;
  const lines = tops.reduce((n, t, i) => (i && t - tops[i - 1] > half ? n + 1 : n), tops.length ? 1 : 0);
  const box = e.getBoundingClientRect();
  const link = e.querySelector('a')?.getBoundingClientRect();
  const linkIn = !!link && link.left >= box.left - 1 && link.right <= box.right + 1 && link.right <= innerWidth;
  const cut = [e, ...e.querySelectorAll('*')].some((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis');
  return { lines, cut, linkIn, title: /** @type {HTMLElement} */ (e).title };
};
