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
  // (The game is being replaced as the click returns: what's typed next waits until the editor takes edits again.)
  if (answer !== 'Cancel') await editorReady(page);
}

/**
 * The editor takes edits: not while a game is being put in place of another (until the new one's undo history has
 * started). A fill meanwhile is lost, since the editor is inert then; a click waits by itself.
 */
export async function editorReady(page) {
  await page.waitForFunction(() => !document.querySelector('.editor > header')?.inert && !document.querySelector('.editor > .body')?.inert);
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

/**
 * Clicks as Safari, the Mac desktop app and Firefox on a Mac make them: a button clicked doesn't take the focus, and the
 * field that had it lets go (its blur has no relatedTarget). Returns what puts Chromium's own clicks back.
 */
export async function macClicks(page) {
  await page.evaluate(() => {
    window.macClick = (e) => {
      if (!e.target.closest?.('button')) return;
      e.preventDefault();
      document.activeElement?.blur();
    };
    window.addEventListener('mousedown', window.macClick, true);
  });
  return () => page.evaluate(() => window.removeEventListener('mousedown', window.macClick, true));
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
 * (a phone asleep in the background), and `blocked` turns new connections away (the network is down). Each of `routes`
 * notes the code the server closed it with (`closed`).
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

// ---------- The buzzer room, game packs, and what a page showed ----------

/**
 * The buzzer room (buzzer/ under `wrangler dev`, local), its storage in a new folder (`persist`): its address once it
 * answers, and stop() (which also deletes that folder). Needs `npm ci` in buzzer/.
 */
export async function startBuzzer(prefix) {
  const { spawn } = await import('node:child_process');
  const { createServer } = await import('node:net');
  const { existsSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const dir = resolve('buzzer');
  if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');
  const freePort = () =>
    new Promise((ok) => {
      const s = createServer().listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => ok(port));
      });
    });
  const port = await freePort();
  const inspector = await freePort();
  const persist = mkdtempSync(join(tmpdir(), prefix));
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  const wrangler = spawn(
    join(dir, 'node_modules/.bin/wrangler'),
    ['dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', persist, '--log-level', 'warn'],
    { cwd: dir, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } },
  );
  wrangler.stdout.on('data', (d) => (log += d));
  wrangler.stderr.on('data', (d) => (log += d));
  const stop = () => {
    try {
      process.kill(-wrangler.pid, 'SIGTERM');
    } catch {
      // already gone
    }
    rmSync(persist, { recursive: true, force: true });
  };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));
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
  return { base, persist, stop };
}

/**
 * Whether any file the buzzer room stored (its Durable Objects' SQLite files under `persist`) holds `text`: as the
 * room saves strings (one byte a character for plain ASCII, two otherwise), so look for both.
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

/** A game pack (.brainrot: a zip of game.json and media/<id>.<ext>) with these files, by media id: what Open… takes. */
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
 * window.__seen, so a toast or an announcement that came and went is still there to check.
 */
export function recordSeen() {
  const seen = (window.__seen = []);
  const ATTRS = ['aria-label', 'title', 'alt', 'aria-description', 'placeholder', 'data-said'];
  // (A style sheet's or a script's text is never shown: a font's base64 would hold any short word.)
  const unseen = (n) => !!n?.closest?.('style, script, noscript, template');
  const take = (n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!unseen(n.parentElement)) seen.push(n.data);
    } else if (n.nodeType === Node.ELEMENT_NODE && !unseen(n)) {
      const walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) if (!unseen(t.parentElement)) seen.push(t.data);
      for (const el of [n, ...n.querySelectorAll('*')]) for (const a of ATTRS) if (el.hasAttribute(a)) seen.push(el.getAttribute(a));
    }
  };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(take);
      else if (m.type === 'characterData') !unseen(m.target.parentElement) && seen.push(m.target.data);
      else if (m.target.hasAttribute(m.attributeName)) seen.push(m.target.getAttribute(m.attributeName));
    }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Which of `words` a page (with recordSeen) shows or said, now or since it loaded (case aside). */
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
