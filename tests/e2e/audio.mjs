// Streaming the sound: the 🔊 Sound help, Test sound in single and dual mode, blocked sounds reported to the
// host, the Game audio output picker, and the desktop app's settings (with a stand-in for its native side).
// Headless Chromium has no speakers, and it's launched with autoplay allowed (as after a click in each
// window), so a blocking browser and fake speakers are simulated with init scripts where a check needs them.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, nameGame } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const fileUrl = pathToFileURL(file).href;
const shots = process.env.SCREENSHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// The desktop app serves the page over http (http://tauri.localhost), and its fallback audience window
// talks over a BroadcastChannel, which needs a real origin.
const html = readFileSync(file);
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const httpUrl = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
function watch(page, name) {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return page;
}
/** 8 kHz mono WAV with a tone (a game sound). */
function wav(seconds) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((i / rate) * 2 * Math.PI * 440));
  return b;
}

/** A fresh game with two players, at the pre-game screen. `introSound` sets a round-intro sound first. */
async function toPregame(page, url, { introSound = false } = {}) {
  await page.goto(url);
  await addClassicRounds(page);
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  if (introSound) {
    await page.getByRole('button', { name: 'Choose file…' }).first().click();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '⬆ Upload audio file…' }).click()]);
    await fc.setFiles({ name: 'intro.wav', mimeType: 'audio/wav', buffer: wav(2) });
    await page.getByText('🔊 intro.wav').waitFor();
  }
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
}

const dialog = (page) => page.getByRole('dialog', { name: 'Streaming the sound' });
const result = (page) => dialog(page).locator('.result');
async function testSound(page, expected) {
  await dialog(page).getByRole('button', { name: '▶ Test sound' }).click();
  await result(page).filter({ hasText: expected }).waitFor({ timeout: 6000 });
}

try {
  // ---------- 1. A browser that may play sound (the chime really plays: the generated WAV must decode) ----------
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    // Count play() calls per window, so we can tell which window played the test chime.
    await context.addInitScript(() => {
      const real = HTMLMediaElement.prototype.play;
      window.__plays = 0;
      HTMLMediaElement.prototype.play = function () {
        window.__plays++;
        return real.call(this);
      };
    });
    const page = watch(await context.newPage(), 'host');
    await toPregame(page, fileUrl);

    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    await dialog(page).waitFor();
    assert(true, 'the sound help opens from the pre-game display settings');
    const sections = await dialog(page).locator('summary').allInnerTexts();
    assert(['Discord on Windows', 'OBS', 'Mac', 'Linux'].every((s) => sections.includes(s)), 'help has Discord on Windows / OBS / Mac / Linux sections');
    assert(await dialog(page).locator('details', { hasText: 'Discord on Windows' }).evaluate((d) => d.open), 'the Discord steps start open');
    const mac = dialog(page).locator('details', { hasText: 'Mac' });
    assert(!(await mac.evaluate((d) => d.open)), 'the other platforms start collapsed');
    await mac.locator('summary').click();
    assert(await mac.evaluate((d) => d.open), 'a platform section expands on click');
    assert((await dialog(page).getByText('Discord audio fix').count()) === 0, 'no desktop-app setting in the browser');

    await testSound(page, 'Sound played in this window');
    assert((await page.evaluate(() => window.__plays)) === 1, 'single window: the chime plays in the host window');

    // Chromium can move sound to another device, but headless has no speakers to list.
    const picker = dialog(page).getByRole('combobox', { name: 'Game audio output' });
    assert(await picker.isVisible(), 'the Game audio output picker shows where the browser supports it');
    await dialog(page).getByRole('button', { name: 'List my speakers' }).click();
    await dialog(page).getByText('No speakers found').waitFor();
    assert(true, 'no speakers: says so instead of failing');
    assert((await picker.locator('option').allInnerTexts()).join() === 'Default (system)', 'only the default device is offered');
    await page.keyboard.press('Escape');
    assert((await dialog(page).count()) === 0, 'Esc closes the help');

    await page.getByRole('button', { name: 'Start game ▶' }).click();
    const startedAt = Date.now();
    await page.getByRole('button', { name: 'Skip intro' }).click();
    await page.locator('.board .tile').first().waitFor();
    await page.locator('.panel').getByRole('button', { name: '🔊 Sound' }).click();
    await dialog(page).waitFor();
    assert(true, 'the sound help opens from the host panel');
    assert((await dialog(page).getByText('plays in this window').count()) === 1, 'it says the sound plays in this window');
    await page.keyboard.press('1');
    await page.waitForTimeout(150);
    const firstPlayer = page.locator('.panel .p').first().locator('.sel');
    assert((await firstPlayer.getAttribute('aria-pressed')) !== 'true', 'shortcuts are off while the help is open');
    assert(await dialog(page).evaluate((d) => d.contains(document.activeElement)), 'focus moves into the help');
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    const soundButton = page.locator('.panel').getByRole('button', { name: '🔊 Sound' });
    assert(await soundButton.evaluate((b) => b === document.activeElement), 'closing it puts focus back on the button that opened it');
    await page.keyboard.press('1');
    assert((await firstPlayer.getAttribute('aria-pressed')) === 'true', 'and back on once it is closed');
    await page.keyboard.press('1');

    // Dual mode: the audience window plays the chime, the host stays silent. The round intro's sound (built in) is old by
    // the time the window opens, so the window doesn't play it again.
    await page.waitForTimeout(Math.max(0, startedAt + 4100 - Date.now()));
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
    watch(aud, 'audience');
    await aud.locator('.board').waitFor();
    // Nothing clicked in the audience window yet (and no aud.evaluate, which Playwright runs as a click). Its
    // "click once" note only shows while the mouse is over it (so it stays off the stream).
    await aud.mouse.move(200, 200);
    const clickOnce = page.getByText('Click the audience window once so it can play sound');
    assert((await clickOnce.count()) === 1 && (await aud.locator('.activate').count()) === 1, 'before any click or sound, both windows ask for a click');
    await page.locator('.panel').getByRole('button', { name: '🔊 Sound' }).click();
    assert((await dialog(page).getByText('plays in the audience window').count()) === 1, 'dual mode: it says the sound plays in the audience window');
    const hostPlays = await page.evaluate(() => window.__plays);
    await testSound(page, 'Sound played in the audience window');
    // This browser lets the new window play sound without a click: a sound that played there proves it.
    await clickOnce.waitFor({ state: 'detached' });
    assert((await aud.locator('.activate').count()) === 0, 'a sound that played in the audience window clears "click once" in both windows');
    assert((await aud.evaluate(() => window.__plays)) >= 1, 'the audience window played the chime');
    assert((await page.evaluate(() => window.__plays)) === hostPlays, 'the host window stayed silent');
    if (shots) await page.screenshot({ path: `${shots}/audio-help.png` });
    await context.close();
  }

  // ---------- 2. A browser that blocks sound until the audience window is clicked, with fake speakers ----------
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript(() => {
      const aud = location.hash === '#audience';
      const devices = [
        { kind: 'audiooutput', deviceId: 'default', label: 'Default - Speakers', groupId: 'g' },
        { kind: 'audioinput', deviceId: 'mic', label: 'Microphone', groupId: 'g' },
        { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers', groupId: 'g' },
        { kind: 'audiooutput', deviceId: 'cable', label: 'CABLE Input', groupId: 'c' },
        { kind: 'audiooutput', deviceId: 'usb', label: 'USB Headset', groupId: 'u' },
      ];
      navigator.mediaDevices.enumerateDevices = async () => devices;
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
      // Record where sound is sent; the USB headset is unplugged by the time the audience window uses it.
      window.__sinks = [];
      HTMLMediaElement.prototype.setSinkId = function (id) {
        window.__sinks.push(id);
        if (aud && id === 'usb') return Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
        Object.defineProperty(this, 'sinkId', { value: id, configurable: true });
        return Promise.resolve();
      };
      if (aud) {
        // Like Chromium: a click or a key press counts, but not Esc or a modifier key on its own.
        let clicked = false;
        addEventListener('pointerdown', () => (clicked = true), true);
        addEventListener('keydown', (e) => !['Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key) && (clicked = true), true);
        Object.defineProperty(navigator, 'userActivation', { get: () => ({ hasBeenActive: clicked, isActive: false }) });
        const real = HTMLMediaElement.prototype.play;
        window.__plays = 0;
        HTMLMediaElement.prototype.play = function () {
          if (!clicked && !this.muted) return Promise.reject(new DOMException('play() needs a click first', 'NotAllowedError'));
          window.__plays++;
          return real.call(this);
        };
      } else {
        // In dual mode the host window must never play a sound out loud (its copy of the game is silent).
        const real = HTMLMediaElement.prototype.play;
        window.__loud = 0;
        HTMLMediaElement.prototype.play = function () {
          if (!this.muted) window.__loud++;
          return real.call(this);
        };
      }
    });
    const page = watch(await context.newPage(), 'host');
    await toPregame(page, fileUrl, { introSound: true });
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Separate audience window/ }).click()]);
    watch(aud, 'audience');
    await aud.getByText('Click anywhere in this window once so it can play sound').waitFor();
    await page.getByText('Click the audience window once so it can play sound').waitFor();
    assert(true, "dual mode: the host warns that the audience window can't play sound yet, with no slide media");
    // Pre-game: viewers see a "Starting soon" card, not the board (it would give the categories away).
    assert((await aud.locator('.soon-text').count()) === 1 && (await aud.locator('.board').count()) === 0, 'pre-game: the audience window holds on a "Starting soon" card');
    // The "click once" note hides when the mouse is still (off the stream), and comes back with the mouse.
    await aud.waitForTimeout(1700);
    assert((await aud.locator('.activate').count()) === 0, 'the audience window hides its "click once" note while the mouse is still');
    await aud.mouse.move(200, 200);
    await aud.mouse.move(220, 210);
    // Shift or Alt (e.g. Alt+Tab away from it) doesn't let a window play sound.
    await aud.keyboard.press('Shift');
    await aud.keyboard.press('Alt');
    await page.waitForTimeout(300);
    assert(
      (await page.getByText('Click the audience window once so it can play sound').count()) === 1 && (await aud.locator('.activate').count()) === 1,
      'a modifier key in the audience window keeps the warning',
    );

    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    await testSound(page, 'Blocked: click the audience window once');
    assert(true, 'Test sound reports a blocked audience window');

    // Game audio output: list the speakers, pick one, and it's remembered on this computer.
    await dialog(page).getByRole('button', { name: 'List my speakers' }).click();
    const picker = dialog(page).getByRole('combobox', { name: 'Game audio output' });
    await picker.locator('option', { hasText: 'CABLE Input' }).waitFor({ state: 'attached' });
    const names = await picker.locator('option').allInnerTexts();
    assert(names.join('|') === 'Default (system)|Speakers|CABLE Input|USB Headset', `speakers are listed without the browser's aliases (${names.join(', ')})`);
    await picker.selectOption({ label: 'CABLE Input' });
    assert(
      (await page.evaluate(() => localStorage.getItem('jb.audioOutput'))) === JSON.stringify({ deviceId: 'cable', label: 'CABLE Input' }),
      'the chosen output is saved (jb.audioOutput)',
    );
    await dialog(page).getByRole('button', { name: 'Close' }).click();

    // The round-intro sound is blocked in the audience window, and the host is told.
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await page.getByText('The audience window blocked a sound').waitFor();
    assert(true, 'a blocked game sound is reported to the host');
    assert((await page.evaluate(() => window.__loud)) === 0, 'dual mode: the host window did not play the round-intro sound');
    assert((await aud.evaluate(() => window.__sinks)).includes('cable'), 'the audience window sends game sounds to the chosen output');

    await aud.locator('.aud').click({ position: { x: 40, y: 40 } });
    await page.getByText(/Click the audience window once|blocked a sound/).waitFor({ state: 'detached' });
    assert(true, 'clicking the audience window clears the warning');
    await page.locator('.panel').getByRole('button', { name: '🔊 Sound' }).click();
    const before = await aud.evaluate(() => window.__plays);
    await testSound(page, 'Sound played in the audience window');
    assert((await aud.evaluate(() => window.__plays)) > before, 'after the click, the audience window plays the test sound');
    assert((await page.evaluate(() => window.__loud)) === 0, 'the host window stayed silent for the test sound too');

    // A device that isn't there: the audience window falls back to the default device and says so.
    await picker.selectOption({ label: 'USB Headset' });
    await dialog(page).getByText(`The audience window couldn't use "USB Headset"`).waitFor();
    assert(true, 'a missing output device is reported to the host');
    await testSound(page, 'Sound played in the audience window');
    assert((await aud.evaluate(() => window.__sinks)).slice(-1)[0] === '', 'the audience window falls back to the default device');
    assert((await page.locator('.panel').getByText('wasn\'t found, so the sound plays on the default device').count()) === 1, 'the host panel warns about the missing device too');
    await picker.selectOption({ label: 'Default (system)' });
    await dialog(page).getByText("couldn't use").waitFor({ state: 'detached' });
    assert(true, 'choosing the default device clears the warning');
    await context.close();
  }

  // ---------- 3. A browser that can't choose an output device ----------
  {
    const context = await browser.newContext();
    await context.addInitScript(() => delete HTMLMediaElement.prototype.setSinkId);
    const page = watch(await context.newPage(), 'no-sink');
    await toPregame(page, fileUrl);
    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    await dialog(page).waitFor();
    assert(
      (await dialog(page).getByRole('combobox').count()) === 0 && (await dialog(page).getByRole('button', { name: /speaker/ }).count()) === 0,
      'the output picker is hidden where the browser can’t move sound',
    );
    await testSound(page, 'Sound played in this window');
    assert(true, 'Test sound still works there');
    await context.close();
  }

  // ---------- 4. The desktop app, with a stand-in for its native side ----------
  const ARGS = '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,AudioServiceOutOfProcess --autoplay-policy=no-user-gesture-required';
  /**
   * `fix`: the Discord audio fix is switched on. `active`: the app runs with its switches. `failed`: switched on, but it
   * didn't start this time. `crashed`: switched on, but off for this run after a WebView2 crash. `admin`: run as administrator.
   */
  async function desktopContext(opts) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript((o) => {
      window.__calls = [];
      // Callbacks the page handed over (event listeners among them), by id.
      window.__callbacks = {};
      const windows = ['main'];
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args, options) => {
          window.__calls.push([
            cmd,
            args instanceof Uint8Array
              ? { bytes: args.length, name: decodeURIComponent(options?.headers?.['x-name'] ?? ''), mode: options?.headers?.['x-mode'] }
              : JSON.parse(JSON.stringify(args ?? {})),
          ]);
          if (cmd === 'save_file') return { path: `C:\\Games\\BrainrotSaves\\${decodeURIComponent(options.headers['x-name'])}`, fallback: false };
          if (cmd === 'list_saves') return [];
          if (cmd === 'plugin:webview|create_webview_window') windows.push(args.options.label);
          if (cmd === 'plugin:window|get_all_windows') return windows;
          if (cmd === 'data_folders')
            return {
              data: { path: 'C:\\Users\\Host\\AppData\\Local\\com.brainrotgames.maker', exists: true },
              settings: { path: 'C:\\Users\\Host\\AppData\\Roaming\\com.brainrotgames.maker', exists: false },
              saves: { path: 'C:\\Games\\BrainrotSaves', exists: false },
              // After the rename: this start moved the old folders, but the old data folder was left behind.
              ...(o.moved
                ? { moved: true, oldData: { path: 'C:\\Users\\Host\\AppData\\Local\\com.jeopardybuilder.brainrot', exists: true }, oldSettings: { path: 'x', exists: false } }
                : {}),
            };
          return null;
        },
        transformCallback: (callback) => {
          const id = Math.floor(Math.random() * 1e9);
          window.__callbacks[id] = callback;
          return id;
        },
        metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
      };
      if (location.hash === '#audience') return;
      // What src-tauri/src/main.rs injects into the host window.
      window.__JB_AUDIO_FIX = o.fix;
      if (o.active) window.__JB_BROWSER_ARGS = o.args;
      if (o.failed) window.__JB_AUDIO_FIX_FAILED = true;
      if (o.crashed) window.__JB_AUDIO_FIX_CRASHED = true;
      if (o.admin) window.__JB_CAPTURE = { elevated: true, compat: null };
      // WebView2 without the native new-window handler: the app falls back to creating the window itself.
      window.open = () => null;
    }, { ...opts, args: ARGS });
    return context;
  }
  const calls = (page, cmd) => page.evaluate((c) => window.__calls.filter(([name]) => name === c).map(([, a]) => a), cmd);
  const called = (page, cmd) => page.waitForFunction((c) => window.__calls.some(([name]) => name === c), cmd, { timeout: 5000 });
  /** The audience window the app creates itself (the fallback), from the host panel or the pre-game screen. */
  async function createdAudience(page, button) {
    await page.getByRole('button', { name: button }).click();
    await called(page, 'plugin:webview|create_webview_window');
    return (await calls(page, 'plugin:webview|create_webview_window'))[0].options;
  }
  /** A command that fails once (it isn't logged in __calls then). */
  const failOnce = (page, cmd, message) =>
    page.evaluate(
      ([c, m]) => {
        const invoke = window.__TAURI_INTERNALS__.invoke;
        window.__TAURI_INTERNALS__.invoke = (name, args) => {
          if (name !== c) return invoke(name, args);
          window.__TAURI_INTERNALS__.invoke = invoke;
          return Promise.reject(m);
        };
      },
      [cmd, message],
    );
  /** An event from the native side, to the page's listeners for it. */
  const emit = (page, event, payload) =>
    page.evaluate(
      ([e, p]) => {
        const listeners = window.__calls.filter(([c, a]) => c === 'plugin:event|listen' && a.event === e);
        for (const [, a] of listeners) window.__callbacks[a.handler]({ event: e, id: 1, payload: p });
        return listeners.length;
      },
      [event, payload],
    );
  const fixWarning = (page, text) => page.getByRole('alert').filter({ hasText: text });
  /** A restart button asks first, inline (a browser dialog would show on stream): answer ↻ Restart. */
  async function restartVia(box, button) {
    await box.getByRole('button', { name: button }).click();
    await box.getByText('Restart Brainrot Games Maker now? Everything is saved').waitFor();
    // The ask ignores the second half of a double-click on the button.
    await box.page().waitForTimeout(450);
    await box.getByRole('button', { name: '↻ Restart', exact: true }).click();
  }
  const FAILED_WARNING = "The Discord audio fix didn't start this time";
  const CRASHED_WARNING = 'The Discord audio fix was turned off for this run because WebView2 crashed with it';

  {
    const context = await desktopContext({ fix: true, active: true, admin: true });
    const page = watch(await context.newPage(), 'desktop');
    await toPregame(page, httpUrl);
    const banner = 'Brainrot Games Maker is running as administrator (or in compatibility mode). Discord and OBS may stream no game sound. Close it and start it normally.';
    assert((await page.getByText(banner).count()) === 1, 'running as administrator: the host shows the warning banner');
    assert((await fixWarning(page, 'Discord audio fix').count()) === 0, 'the fix is running: no fix warning');

    // The fallback audience window must get exactly the switches the app started with.
    await page.getByRole('button', { name: /Separate audience window/ }).click();
    await page.waitForFunction(() => window.__calls.some(([c]) => c === 'plugin:webview|create_webview_window'));
    const [created] = await calls(page, 'plugin:webview|create_webview_window');
    assert(created.options.additionalBrowserArgs === ARGS, 'with the Discord audio fix on, the fallback audience window gets the same WebView2 switches');
    assert(created.options.url === 'index.html#audience' && created.options.label.startsWith('popup-audience-'), 'it opens the audience page');
    assert(created.options.title === 'Untitled Game · Audience', `it's titled after the game, like the page inside (${created.options.title})`);
    // The desktop app's audience window connects over the channel and may play sound without a click.
    const aud = watch(await context.newPage(), 'desktop audience');
    await aud.goto(httpUrl + '#audience');
    // Pre-game: a "Starting soon" card until the host starts.
    await aud.locator('.soon-text').waitFor();
    await page.waitForTimeout(300);
    assert((await aud.locator('.activate').count()) === 0, 'desktop app: no "click once" banner in the audience window');
    assert((await page.getByText('Click the audience window once').count()) === 0, 'desktop app: the host gets no "click the audience window" warning');
    const fixOffListeners = async (p) => (await calls(p, 'plugin:event|listen')).filter((a) => a.event === 'audio-fix-off').length;
    assert(
      (await fixOffListeners(page)) === 1 && (await fixOffListeners(aud)) === 0,
      'only the host window listens for the fix being switched off from outside',
    );

    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const help = dialog(page);
    assert((await help.getByRole('alert').filter({ hasText: 'running as administrator' }).count()) === 1, 'the help repeats the administrator warning');
    const sections = await help.locator('summary').allInnerTexts();
    assert(sections.includes('Discord on Windows') && !sections.includes('Mac') && !sections.includes('Linux'), 'desktop app: Windows help only');
    assert((await help.getByText('Share Your Screen › Applications › "Untitled Game · Audience"').count()) === 1, 'the Discord steps name the audience window by its real title');
    const fix = help.getByRole('checkbox', { name: /Discord audio fix/ });
    assert(await fix.isChecked(), 'the Discord audio fix shows as on');
    assert((await help.getByText('(on by default)').count()) === 1 && (await help.getByText('experimental', { exact: true }).count()) === 0, 'it says it is on by default (no longer experimental)');
    assert(
      (await help.locator('code', { hasText: '--no-audio-fix' }).count()) === 1 && (await help.locator('code', { hasText: 'discord-audio-fix-off' }).count()) === 1,
      'the help says how to switch the fix off from outside the app',
    );
    assert((await help.getByText(/didn't start this time|crashed/).count()) === 0 && (await help.getByRole('button', { name: /Restart now|Try it again/ }).count()) === 0, 'running as saved: no fix trouble and no restart offered');
    await fix.uncheck();
    await help.getByText('Restart Brainrot Games Maker to turn it off.').waitFor();
    assert(JSON.stringify(await calls(page, 'set_audio_fix')) === JSON.stringify([{ on: false }]), 'switching it off saves the setting');
    await fix.check();
    await help.getByText(/Restart Brainrot Games Maker to turn it/).waitFor({ state: 'detached' });
    assert(true, 'switching it back needs no restart');
    await fix.uncheck();
    await help.getByRole('button', { name: '↻ Restart now' }).click();
    await help.locator('.ia').getByRole('button', { name: 'Cancel' }).click();
    assert(
      (await calls(page, 'restart_app')).length === 0 && (await help.getByRole('button', { name: '↻ Restart now' }).count()) === 1,
      'Restart now asks first, in the help (Cancel: no restart)',
    );
    await restartVia(help, '↻ Restart now');
    await page.waitForFunction(() => window.__calls.some(([c]) => c === 'restart_app'), null, { timeout: 5000 });
    assert(true, 'Restart now restarts the app (after asking)');
    if (shots) await page.screenshot({ path: `${shots}/audio-desktop.png` });
    await context.close();
  }
  {
    // Switched off, and running without it.
    const context = await desktopContext({ fix: false });
    const page = watch(await context.newPage(), 'desktop (no fix)');
    await toPregame(page, httpUrl);
    assert((await page.getByText('running as administrator').count()) === 0, 'no administrator warning when started normally');
    assert((await fixWarning(page, 'Discord audio fix').count()) === 0, 'switched off by the host: no fix warning');
    const created = await createdAudience(page, /Separate audience window/);
    assert(!('additionalBrowserArgs' in created), 'with the fix off, the fallback window keeps the default switches');
    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const help = dialog(page);
    const fix = help.getByRole('checkbox', { name: /Discord audio fix/ });
    assert(!(await fix.isChecked()), 'with the setting off, the Discord audio fix box is unticked');
    await fix.check();
    await help.getByText('Restart Brainrot Games Maker to turn it on.').waitFor();
    assert((await help.getByRole('button', { name: '↻ Restart now' }).count()) === 1, 'switching it on asks for a restart, with a Restart now button');
    assert(JSON.stringify(await calls(page, 'set_audio_fix')) === JSON.stringify([{ on: true }]), 'switching it on saves the setting');
    await fix.uncheck();
    await help.getByText(/Restart Brainrot Games Maker to turn it/).waitFor({ state: 'detached' });
    assert(JSON.stringify(await calls(page, 'set_audio_fix')) === JSON.stringify([{ on: true }, { on: false }]), 'switching it back off is saved and needs no restart');
    // A setting that couldn't be saved: the box goes back to what still applies, with no restart offered.
    await failOnce(page, 'set_audio_fix', "Couldn't save the setting: access denied");
    await fix.click();
    await help.getByText("Couldn't save the setting: access denied").waitFor();
    assert(!(await fix.isChecked()) && (await help.getByText(/Restart Brainrot Games Maker to turn it/).count()) === 0, 'a failed save unticks the box again, with no restart prompt');
    await context.close();
  }
  {
    // Switched off, but WebView2 wouldn't start without the switches this time (the previous copy still held its data
    // folder), so the app runs with them.
    const context = await desktopContext({ fix: false, active: true });
    const page = watch(await context.newPage(), 'desktop (off, running with it)');
    await toPregame(page, httpUrl);
    assert((await fixWarning(page, 'Discord audio fix').count()) === 0, 'no fix warning: the sound still reaches Discord');
    const created = await createdAudience(page, /Separate audience window/);
    assert(created.additionalBrowserArgs === ARGS, 'running with the switches: the fallback audience window gets them too');
    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const help = dialog(page);
    assert(!(await help.getByRole('checkbox', { name: /Discord audio fix/ }).isChecked()), 'the box shows the saved setting (off)');
    assert(
      (await help.getByText('Restart Brainrot Games Maker to turn it off.').count()) === 1 && (await help.getByRole('button', { name: '↻ Restart now' }).count()) === 1,
      'it offers the restart that turns it off',
    );
    await context.close();
  }
  {
    // Switched on (the default), but WebView2 wouldn't start with it this time (the previous copy's WebView2 processes
    // were still closing): the app runs without it, warns the host and offers a restart.
    const context = await desktopContext({ fix: true, failed: true });
    const page = watch(await context.newPage(), 'desktop (fix failed)');
    await toPregame(page, httpUrl);
    assert((await fixWarning(page, FAILED_WARNING).count()) === 1, 'the pre-game screen warns that the fix didn’t start');
    await page.getByRole('button', { name: 'Start game ▶' }).click();
    await page.getByRole('button', { name: 'Skip intro' }).click();
    const warning = fixWarning(page.locator('.panel'), FAILED_WARNING);
    await warning.waitFor();
    assert((await dialog(page).count()) === 0, 'the host panel warns too, without opening the Sound help');
    assert((await warning.getByText('Restart Brainrot Games Maker to try again').count()) === 1, 'the warning says a restart should bring it back');
    const created = await createdAudience(page, '📺 Audience window');
    assert(!('additionalBrowserArgs' in created), 'running without the switches: the fallback audience window keeps the defaults');
    await warning.getByRole('button', { name: '🔊 Help' }).click();
    const help = dialog(page);
    await help.waitFor();
    assert(true, "the warning's Help button opens the Sound help");
    const fix = help.getByRole('checkbox', { name: /Discord audio fix/ });
    assert(await fix.isChecked(), 'the fix still shows as switched on');
    assert(
      (await help.getByText("The fix didn't start this time").count()) === 1 && (await help.getByText('probably still closing').count()) === 1,
      'the help says it didn’t start this time, and why',
    );
    assert((await help.getByText("couldn't start on this PC").count()) === 0, 'it no longer calls it permanent');
    assert((await help.getByRole('button', { name: '↻ Restart now' }).count()) === 1, 'it offers a restart');
    await fix.uncheck();
    await help.getByText("The fix didn't start this time").waitFor({ state: 'detached' });
    assert(
      (await help.getByText(/Restart Brainrot Games Maker to turn it/).count()) === 0 && (await help.getByRole('button', { name: '↻ Restart now' }).count()) === 0,
      'unticking it hides the failed text, with no restart needed (the app already runs without it)',
    );
    assert((await warning.count()) === 0, 'and the host warning goes away');
    await fix.check();
    await help.getByText("The fix didn't start this time").waitFor();
    assert((await warning.count()) === 1, 'ticking it again brings both back');
    assert(JSON.stringify(await calls(page, 'set_audio_fix')) === JSON.stringify([{ on: false }, { on: true }]), 'both changes are saved');
    await restartVia(help, '↻ Restart now');
    await called(page, 'restart_app');
    assert(true, 'Restart now restarts the app');
    if (shots) await page.screenshot({ path: `${shots}/audio-fix-failed.png` });
    await context.close();
  }
  {
    // Switched on, but WebView2 crashed with it: this run is without it, and the host can try it again.
    const context = await desktopContext({ fix: true, crashed: true });
    const page = watch(await context.newPage(), 'desktop (fix crashed)');
    await toPregame(page, httpUrl);
    const warning = fixWarning(page, CRASHED_WARNING);
    assert((await warning.count()) === 1, 'the host is told the fix is off for this run because WebView2 crashed with it');
    assert((await fixWarning(page, FAILED_WARNING).count()) === 0, 'not as a failed start');
    const created = await createdAudience(page, /Separate audience window/);
    assert(!('additionalBrowserArgs' in created), 'running without the switches: the fallback audience window keeps the defaults');
    await warning.getByRole('button', { name: '🔊 Help' }).click();
    const help = dialog(page);
    await help.waitFor();
    assert(await help.getByRole('checkbox', { name: /Discord audio fix/ }).isChecked(), 'the fix still shows as switched on');
    assert((await help.getByText(CRASHED_WARNING).count()) === 1, 'the help says so too');
    assert((await help.getByText(/Restart Brainrot Games Maker to turn it/).count()) === 0, 'it doesn’t offer a plain restart (that would start without it again)');
    // A try that fails (the crash note couldn't be removed) says why, and the button works again.
    await failOnce(page, 'retry_audio_fix', "Couldn't save the setting: access denied");
    await restartVia(help, '↻ Try it again');
    await help.getByText("Couldn't save the setting: access denied").waitFor();
    assert(
      (await calls(page, 'retry_audio_fix')).length === 0 && (await help.getByRole('button', { name: '↻ Try it again' }).isEnabled()),
      'a failed try says why and can be repeated',
    );
    await help.getByRole('button', { name: 'Close' }).click();
    await restartVia(warning, '↻ Try it again');
    await called(page, 'retry_audio_fix');
    assert(true, "the host warning's Try it again restarts with the fix (retry_audio_fix)");
    await context.close();
  }

  {
    // Opened again with --no-audio-fix while this run is without the fix (here: after a crash). The native side saved it
    // as off and needs no restart: the page's warnings and Sound help follow the saved setting.
    const context = await desktopContext({ fix: true, crashed: true });
    const page = watch(await context.newPage(), 'desktop (switched off from outside)');
    await toPregame(page, httpUrl);
    await fixWarning(page, CRASHED_WARNING).waitFor();
    assert((await emit(page, 'audio-fix-off', false)) === 1, 'the host page listens for the fix being switched off from outside');
    await fixWarning(page, CRASHED_WARNING).waitFor({ state: 'detached' });
    assert(true, 'the crash warning goes away');
    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const help = dialog(page);
    assert(!(await help.getByRole('checkbox', { name: /Discord audio fix/ }).isChecked()), 'the box shows it as off');
    assert(
      (await help.getByText(/crashed|Restart Brainrot Games Maker to turn it/).count()) === 0 &&
        (await help.getByRole('button', { name: /Try it again|Restart now|Restarting/ }).count()) === 0,
      'no Try it again (it would start without the fix), and no restart needed',
    );
    assert((await calls(page, 'set_audio_fix')).length === 0 && (await calls(page, 'retry_audio_fix')).length === 0, 'the page saves nothing itself');
    await context.close();
  }
  {
    // The same while this run uses the fix: the native side restarts the app without it after a moment.
    const context = await desktopContext({ fix: true, active: true });
    const page = watch(await context.newPage(), 'desktop (switched off from outside, restarting)');
    await toPregame(page, httpUrl);
    await emit(page, 'audio-fix-off', true);
    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const help = dialog(page);
    await help.getByText('Restart Brainrot Games Maker to turn it off.').waitFor();
    assert(!(await help.getByRole('checkbox', { name: /Discord audio fix/ }).isChecked()), 'the box shows it as off');
    const restarting = help.getByRole('button', { name: 'Restarting…' });
    assert((await restarting.count()) === 1 && (await restarting.isDisabled()), 'the page shows the restart under way');
    assert((await calls(page, 'restart_app')).length === 0, 'the native side restarts by itself (the page may be blank)');
    await context.close();
  }

  {
    // Where the desktop app keeps its data: said once up front, and in ℹ About with buttons to open the folders.
    const context = await desktopContext({ fix: true, active: true });
    const page = watch(await context.newPage(), 'desktop (data folders)');
    await page.goto(httpUrl);
    const notice = page.getByRole('status').filter({ hasText: 'saves your autosave and media in a folder on this PC' });
    await notice.waitFor();
    assert(true, 'first start: a notice says the app saves data in a folder on this PC');
    await notice.getByRole('button', { name: 'ℹ See where' }).click();
    const about = page.getByRole('dialog', { name: 'About Brainrot Games Maker' });
    await about.getByText('C:\\Users\\Host\\AppData\\Local\\com.brainrotgames.maker').waitFor();
    assert((await about.getByText('Windows desktop app').count()) === 1, 'About shows the version and that this is the desktop app');
    assert(
      (await about.getByRole('link', { name: /GitHub/ }).getAttribute('href')) === 'https://github.com/vampiricwulf/Brainrot-Game-Maker',
      'About links to the GitHub repo',
    );
    await about.getByRole('link', { name: /GitHub/ }).click();
    await called(page, 'open_link');
    assert(
      (await calls(page, 'open_link'))[0].url === 'https://github.com/vampiricwulf/Brainrot-Game-Maker' && context.pages().length === 1,
      "the repo link opens in the default browser (the app's open_link), not in an app window",
    );
    assert((await about.getByRole('button', { name: '📂 Open folder' }).count()) === 2 && (await about.getByText("Not created: it's only made").count()) === 1, "only folders that exist get Open folder (the settings folder isn't made until needed; the saves folder is made when opened)");
    assert((await about.innerText()).includes('C:\\Games\\BrainrotSaves'), 'About shows where saves go (BrainrotSaves next to the app)');
    await about.locator('.folder', { hasText: 'Autosave' }).getByRole('button', { name: '📂 Open folder' }).click();
    await called(page, 'open_data_folder');
    assert(JSON.stringify(await calls(page, 'open_data_folder')) === JSON.stringify([{ which: 'data' }]), 'Open folder asks the app to show the data folder');
    await page.keyboard.press('Escape');
    assert((await about.count()) === 0 && (await notice.count()) === 0, 'Esc closes About, and the notice is gone');
    // Save goes to BrainrotSaves next to the app (not a download), as raw bytes with the file name.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await nameGame(page);
    await called(page, 'save_file');
    const saveCall = (await calls(page, 'save_file'))[0];
    assert(saveCall.name === 'Untitled-Game.brainrot' && saveCall.bytes > 0 && saveCall.mode === 'backup', `Save sends the pack to the app, replacing the game's last save with a backup kept (${JSON.stringify(saveCall)})`);
    await page.locator('.toast', { hasText: 'Saved to C:\\Games\\BrainrotSaves\\Untitled-Game.brainrot' }).waitFor();
    assert(true, 'and says where it went');
    // ⚙ Settings: Save makes a new file each time instead (Game (2).brainrot…).
    await page.getByRole('button', { name: '⚙ Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByText('Save replaces the game’s last save').click();
    assert((await settings.getByLabel('Autosaves to keep').inputValue()) === '3', 'three autosaves are kept by default');
    await settings.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => window.__calls.filter((c) => c[0] === 'save_file').length === 2);
    assert((await calls(page, 'save_file'))[1].mode === 'new', 'with the setting off, Save makes a new file');
    await page.reload();
    await page.getByRole('button', { name: 'ℹ About' }).waitFor();
    assert((await page.getByRole('status').filter({ hasText: 'folder on this PC' }).count()) === 0, 'the notice only shows once');
    await context.close();
  }

  {
    // The first start after the rename: the app moved Jeopardy Builder's folders and says so once.
    const context = await desktopContext({ fix: true, active: true, moved: true });
    const page = watch(await context.newPage(), 'desktop (moved from Jeopardy Builder)');
    await page.goto(httpUrl);
    const notice = page.getByRole('status').filter({ hasText: 'Jeopardy Builder is now Brainrot Games Maker' });
    await notice.waitFor();
    assert(true, 'after the move, a notice says the data was moved to the new folder');
    await notice.getByRole('button', { name: 'ℹ See where' }).click();
    const about = page.getByRole('dialog', { name: 'About Brainrot Games Maker' });
    const leftover = about.getByRole('note');
    await leftover.getByText('com.jeopardybuilder.brainrot').waitFor();
    assert((await leftover.getByText('Left over from Jeopardy Builder').count()) === 1, 'About lists an old folder that could not be moved');
    await leftover.getByRole('button', { name: '📂 Open folder' }).click();
    await called(page, 'open_data_folder');
    assert(JSON.stringify(await calls(page, 'open_data_folder')) === JSON.stringify([{ which: 'old-data' }]), 'its Open folder shows the old folder');
    await page.keyboard.press('Escape');
    assert((await notice.count()) === 0, 'the notice is gone once seen');
    await context.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Audio E2E passed.');
} finally {
  await browser.close();
  server.close();
}
