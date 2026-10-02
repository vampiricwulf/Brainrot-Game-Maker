// Shared e2e steps.
import { deflateSync } from 'node:zlib';

/**
 * A new game has no rounds: add a Jeopardy board and a Final Jeopardy (the classic game most tests play), then go
 * back to the board's tab. Does nothing if the game already has rounds (e.g. after a reload).
 * The board wants no Daily Doubles (a test makes a tile one by hand, which counts it): Start game would otherwise
 * put one on a random tile, and a test clicking that tile would get its wager screen.
 */
export async function addClassicRounds(page) {
  await page.getByRole('button', { name: 'Open…' }).waitFor();
  if (await page.locator('nav > button.round-tab').count()) return;
  for (const mode of [/Jeopardy board/, /Final Jeopardy/]) {
    await page.getByRole('button', { name: '＋ Add round' }).click();
    await page.getByRole('menuitem', { name: mode }).click();
  }
  await page.locator('nav > button.round-tab').first().click();
  await noDailyDoubles(page);
}

/** The open board wants no Daily Doubles (none go on at random when the game starts). */
export async function noDailyDoubles(page) {
  const box = page.getByLabel('How many Daily Doubles');
  await box.fill('0');
  await box.press('Tab');
}

/** The first Save of an untitled game asks for its name: answer with `name` ('' keeps "Untitled Game"). */
export async function nameGame(page, name = '') {
  const dialog = page.getByRole('dialog', { name: 'Name your game' });
  await dialog.waitFor();
  if (name) await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
}

/** ⋯ → ⬇ Export as a web page… (Export HTML, the playable file). */
export async function clickExportHtml(page, opts = {}) {
  await page.getByRole('button', { name: /^More:/ }).click(opts);
  await page.getByRole('menuitem', { name: /Export as a web page/ }).click(opts);
}

/**
 * Export HTML, answering the name it asks for on an untitled game's first export (with `name`: '' keeps "Untitled Game").
 * Returns the download.
 */
export async function exportHtml(page, name = '') {
  // Nothing may be open over the editor: a window or question still up leaves the header inert, so the click would wait
  // in vain and the test fail on the download instead (CI run 117). Say which one it is.
  const over = page.locator('[role="alertdialog"], [role="dialog"][aria-modal="true"]').first();
  if (await over.waitFor({ state: 'detached', timeout: 5000 }).then(() => false, () => true))
    throw new Error(`Export HTML: a window is still open over the editor: “${(await over.innerText()).replace(/\s+/g, ' ').slice(0, 200)}”`);
  const download = page.waitForEvent('download');
  // (A click that can't land fails here, saying why, well before the download's wait runs out.)
  await clickExportHtml(page, { timeout: 10000 });
  const naming = page.getByRole('dialog', { name: 'Name your game' });
  const first = await Promise.race([download.then(() => 'download'), naming.waitFor().then(() => 'name', () => 'none')]);
  if (first === 'name') await nameGame(page, name);
  return download;
}

/**
 * New, Open… or a recent game asks before replacing a game with unsaved changes: answer it (Save first, Cancel, or
 * 'Discard' for "Open anyway" / "Reopen anyway" / "Start new anyway", which keeps it in Recent games).
 */
export async function answerReplace(page, answer = 'Discard') {
  const dialog = page.getByRole('dialog', { name: /^(Start a new game|Open|Reopen)/ });
  await dialog.waitFor();
  await dialog.getByRole('button', answer === 'Discard' ? { name: / anyway$/ } : { name: answer, exact: true }).click();
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
  // (Both ends on screen: the mouse can't go past the window's edge.)
  if (to.x === undefined) await to.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
  await from.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
  const a = await from.boundingBox();
  const b = to.x !== undefined ? to : await to.boundingBox().then((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }));
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/** On the pre-game screen (▶ Play): add `n` players with ＋ Add player. */
export async function addPlayers(page, n) {
  const add = page.getByRole('button', { name: '＋ Add player' });
  for (let i = 0; i < n; i++) await add.click();
}

/** ▶ Play from the editor, then add `n` players on the pre-game screen (where the game's players are set). */
export async function playWithPlayers(page, n) {
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('button', { name: 'Start game ▶' }).waitFor();
  await addPlayers(page, n);
}

/** The pre-game screen's ⚖ Game rules, opened (rules, timers, the round intro). */
export async function openRules(page) {
  const rules = page.locator('details.rules');
  await rules.waitFor();
  if (!(await rules.evaluate((d) => d.open))) await rules.locator('summary').click();
  await rules.evaluate((d) => new Promise((ok) => (d.open ? ok() : d.addEventListener('toggle', () => ok(), { once: true }))));
  return rules;
}

// ---------- The host panel ----------

/** The host panel's main button (its NEXT cell: Reveal answer, Show question ▶, Spin!…). */
export const mainButton = (page) => page.locator('.panel [data-next]');

/** What the main button says, without its key cap (R, N, Esc…). */
export const mainLabel = (page) =>
  mainButton(page).evaluate((b) => [...b.childNodes].filter((n) => n.nodeName !== 'KBD').map((n) => n.textContent).join('').trim());

/** The confirmation strip above the fixed bar (Leave this game?, N clues left · go on?…). */
export const confirmStrip = (page) => page.locator('.panel .confirm');

// ---------- Phone buzzers ----------

/**
 * A page's WebSocket (a phone's, or the host's), passed through Playwright: `delay` ms each way (a slow network), when
 * each buzz reached the server (`sent`), when each armed view reached the page (`armedAt`), and `rewrite` to change a
 * buzz on its way. `drop()` cuts the connection (both ends see it close), `stall()` makes it go silent without closing
 * (a phone asleep in the background), and `blocked` turns new connections away (the network is down).
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
    const route = { ws, server, dead: false };
    t.routes.push(route);
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

/** Holds the next buzz from each of these phones, then lets them all go with the same reaction time: a tie. */
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

/** A plain-colored PNG. */
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
