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

/** The pre-game screen's ⚙ Game rules, opened (rules, timers, the round intro). */
export async function openRules(page) {
  const rules = page.locator('details.rules');
  await rules.waitFor();
  if (!(await rules.evaluate((d) => d.open))) await rules.locator('summary').click();
  return rules;
}

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
      // As long as both really took (a little less than the time since each saw BUZZ!), so the room believes it.
      const reactMs = Math.min(...held.map((h) => Date.now() - h.t.armedAt[h.j.armId])) - 20;
      for (const h of held) {
        h.t.rewrite = null;
        h.send({ ...h.j, reactMs });
      }
    };
}
