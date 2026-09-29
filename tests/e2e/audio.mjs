// Streaming the sound: the 🔊 Sound help, Test sound in single and dual mode, blocked sounds reported to the
// host, the Game audio output picker, and the desktop app's settings (with a stand-in for its native side).
// Headless Chromium has no speakers, and it's launched with autoplay allowed (as after a click in each
// window), so a blocking browser and fake speakers are simulated with init scripts where a check needs them.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  await page.getByRole('button', { name: '⚙ Setup & Players' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  await page.getByRole('button', { name: '＋ Add player' }).click();
  if (introSound) {
    await page.getByRole('button', { name: 'Choose…' }).first().click();
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

    // Dual mode: the audience window plays the chime, the host stays silent.
    const [aud] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '📺 Audience window' }).click()]);
    watch(aud, 'audience');
    await aud.locator('.board').waitFor();
    // Nothing clicked in the audience window yet (and no aud.evaluate, which Playwright runs as a click).
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
  async function desktopContext(opts) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript((o) => {
      window.__calls = [];
      const windows = ['main'];
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          window.__calls.push([cmd, JSON.parse(JSON.stringify(args ?? {}))]);
          if (cmd === 'plugin:webview|create_webview_window') windows.push(args.options.label);
          if (cmd === 'plugin:window|get_all_windows') return windows;
          return null;
        },
        transformCallback: () => Math.floor(Math.random() * 1e9),
        metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
      };
      if (location.hash === '#audience') return;
      // What src-tauri/src/main.rs injects into the host window.
      window.__JB_AUDIO_FIX = o.fix;
      if (o.fix) window.__JB_BROWSER_ARGS = o.args;
      if (o.admin) window.__JB_CAPTURE = { elevated: true, compat: null };
      // WebView2 without the native new-window handler: the app falls back to creating the window itself.
      window.open = () => null;
    }, opts);
    return context;
  }
  const calls = (page, cmd) => page.evaluate((c) => window.__calls.filter(([name]) => name === c).map(([, a]) => a), cmd);

  {
    const context = await desktopContext({ fix: true, admin: true, args: ARGS });
    const page = watch(await context.newPage(), 'desktop');
    await toPregame(page, httpUrl);
    const banner = 'Jeopardy Builder is running as administrator (or in compatibility mode). Discord and OBS may stream no game sound. Close it and start it normally.';
    assert((await page.getByText(banner).count()) === 1, 'running as administrator: the host shows the warning banner');

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
    await aud.locator('.board').waitFor();
    await page.waitForTimeout(300);
    assert((await aud.locator('.activate').count()) === 0, 'desktop app: no "click once" banner in the audience window');
    assert((await page.getByText('Click the audience window once').count()) === 0, 'desktop app: the host gets no "click the audience window" warning');

    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const help = dialog(page);
    assert((await help.getByRole('alert').filter({ hasText: 'running as administrator' }).count()) === 1, 'the help repeats the administrator warning');
    const sections = await help.locator('summary').allInnerTexts();
    assert(sections.includes('Discord on Windows') && !sections.includes('Mac') && !sections.includes('Linux'), 'desktop app: Windows help only');
    assert((await help.getByText('Share Your Screen › Applications › "Untitled Game · Audience"').count()) === 1, 'the Discord steps name the audience window by its real title');
    const fix = help.getByRole('checkbox', { name: /Discord audio fix/ });
    assert(await fix.isChecked(), 'the Discord audio fix shows as on');
    assert((await help.getByText('experimental', { exact: true }).count()) === 1, 'it is labelled experimental');
    await fix.uncheck();
    await help.getByText('Restart Jeopardy Builder to turn it off.').waitFor();
    assert(JSON.stringify(await calls(page, 'set_audio_fix')) === JSON.stringify([{ on: false }]), 'switching it off saves the setting');
    await fix.check();
    await help.getByText(/Restart Jeopardy Builder to turn it/).waitFor({ state: 'detached' });
    assert(true, 'switching it back needs no restart');
    await fix.uncheck();
    await help.getByRole('button', { name: '↻ Restart now' }).click();
    await page.waitForFunction(() => window.__calls.some(([c]) => c === 'restart_app'), null, { timeout: 5000 });
    assert(true, 'Restart now restarts the app (after asking)');
    if (shots) await page.screenshot({ path: `${shots}/audio-desktop.png` });
    await context.close();
  }
  {
    const context = await desktopContext({ fix: false, admin: false, args: ARGS });
    const page = watch(await context.newPage(), 'desktop (no fix)');
    await toPregame(page, httpUrl);
    assert((await page.getByText('running as administrator').count()) === 0, 'no administrator warning when started normally');
    await page.getByRole('button', { name: /Separate audience window/ }).click();
    await page.waitForFunction(() => window.__calls.some(([c]) => c === 'plugin:webview|create_webview_window'));
    const [created] = await calls(page, 'plugin:webview|create_webview_window');
    assert(!('additionalBrowserArgs' in created.options), 'with the fix off, the fallback window keeps the default switches');
    await page.getByRole('button', { name: '🔊 Sound for Discord / OBS…' }).click();
    const fix = dialog(page).getByRole('checkbox', { name: /Discord audio fix/ });
    assert(!(await fix.isChecked()), 'with the setting off, the Discord audio fix box is unticked');
    // A setting that couldn't be saved: the box goes back to what still applies, with no restart offered.
    await page.evaluate(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = (cmd, args) => (cmd === 'set_audio_fix' ? Promise.reject("Couldn't save the setting: access denied") : invoke(cmd, args));
    });
    await fix.click();
    await dialog(page).getByText("Couldn't save the setting: access denied").waitFor();
    assert(!(await fix.isChecked()) && (await dialog(page).getByText(/Restart Jeopardy Builder to turn it/).count()) === 0, 'a failed save unticks the box again, with no restart prompt');
    await context.close();
  }

  assert(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log('Audio E2E passed.');
} finally {
  await browser.close();
  server.close();
}
