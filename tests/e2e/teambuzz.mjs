// Team buzzers, end to end: the built app hosts a game with Teams on against the real buzzer room (buzzer/ under
// `wrangler dev`, local), and people join teams from the real phone page with their own names. Two on one team: whoever
// buzzes first answers for it, the host and viewers see who ("Al (Player 1)"), a teammate's later buzz is no new place
// in the order, and a wrong answer locks out the whole team. The host moves someone to another team and takes someone
// off; a phone reload comes back on its team. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, playWithPlayers } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
const dir = resolve('buzzer');
if (!existsSync(join(dir, 'node_modules/.bin/wrangler'))) throw new Error('Run `npm ci` in buzzer/ first');

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await freePort();
const inspector = await freePort();
const persist = mkdtempSync(join(tmpdir(), 'buzzer-teams-'));
const base = `http://127.0.0.1:${port}`;
let log = '';
const wrangler = spawn(
  join(dir, 'node_modules/.bin/wrangler'),
  ['dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', persist, '--log-level', 'warn'],
  { cwd: dir, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } },
);
wrangler.stdout.on('data', (d) => (log += d));
wrangler.stderr.on('data', (d) => (log += d));
const stopWrangler = () => {
  try {
    process.kill(-wrangler.pid, 'SIGTERM');
  } catch {
    // already gone
  }
};
process.on('exit', stopWrangler);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

let browser;
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
};
try {
  for (let i = 0; ; i++) {
    if (wrangler.exitCode !== null) throw new Error('wrangler dev exited:\n' + log);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 120) throw new Error('wrangler dev never came up:\n' + log);
    await sleep(500);
  }

  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await chromium.launch({ executablePath });

  // ---------- The host: buzzer mode with Teams, two teams ----------
  const hostCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await hostCtx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  const host = watch(await hostCtx.newPage(), 'host');
  await host.goto(pathToFileURL(file).href);
  await addClassicRounds(host);
  await playWithPlayers(host, 2);
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel('Open the buzzers').selectOption('host');
  const teamsBox = card.getByLabel(/Teams: people join a team/);
  await teamsBox.check();
  assert(await card.getByLabel(/Let new players join from their phone/).isDisabled(), 'Teams is a checkbox on the 📱 card (new players from phones are off with it: people join a team)');
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = card.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  await card.getByText('0 people on 0 of 2 teams').waitFor();
  assert(true, `a real room (${code}); the card counts people on teams`);

  // ---------- People join teams from their phones ----------
  const phone = async (name, team) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Pick your team' }).waitFor();
    await p.getByRole('button', { name: team }).click();
    await p.getByRole('heading', { name: `Join ${team}` }).waitFor();
    // (Your own name, not the team's: the box says so, and gives an example.)
    if ((await p.getByRole('textbox', { name: 'Your name (your team sees it)' }).getAttribute('placeholder')) !== 'e.g. Zoe') throw new Error('the team name box has no example');
    await p.getByRole('textbox', { name: 'Your name (your team sees it)' }).fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(`${name} · ${team}`).waitFor();
    return p;
  };
  const ann = await phone('Ann', 'Player 1');
  const al = await phone('Al', 'Player 1');
  const bea = await phone('Bea', 'Player 2');
  await card.getByText('3 people on 2 of 2 teams').waitFor();
  const list = card.locator('ul.phones');
  const listed = (await list.innerText()).replace(/\s+/g, ' ');
  assert(/Player 1 2 on it.*Ann ✔ joined.*Al ✔ joined.*Player 2 1 on it.*Bea ✔ joined/.test(listed), `two phones on one team, one on the other: the host sees who is on which team (${listed})`);
  // The pre-game list is of teams now: its words say so, and who joined shows under each team.
  const roster = host.locator('[data-place="play:players"]');
  assert((await roster.getByRole('heading', { level: 2 }).innerText()) === '👥 Teams' && (await roster.getByRole('button', { name: '＋ Add team' }).isVisible()), 'with Teams on, the pre-game card is 👥 Teams, with ＋ Add team');
  assert((await roster.locator('.hint').innerText()).startsWith('Each row is a team; people join it from their phone'), 'and says each row is a team that people join from their phone');
  const onTeams = await roster.locator('.on-team').allInnerTexts();
  assert(onTeams.join('|') === 'On it: Ann, Al|On it: Bea', `who is on each team shows under its row (${onTeams.join(' | ')})`);

  // A name someone has is taken; the seat list shows who is on each team.
  const zed = watch(await (await browser.newContext({ viewport: { width: 390, height: 760 } })).newPage(), 'zed');
  await zed.goto(`${base}/${code}`);
  await zed.getByRole('button', { name: 'Player 1' }).getByText('Ann, Al').waitFor();
  await card.getByText('1 more phone is on the join screen, not on a team yet.').waitFor();
  assert(true, 'the host sees a phone still on the join screen (not on a team yet)');
  await zed.getByRole('button', { name: 'Player 2' }).click();
  await zed.locator('#team-on').getByText('On it: Bea').waitFor();
  await zed.getByRole('button', { name: 'Back' }).click();
  assert(true, 'the name form says who is on the team already ("On it: Bea")');
  await zed.getByRole('button', { name: 'Player 2' }).click();
  await zed.getByRole('textbox', { name: 'Your name (your team sees it)' }).fill('ann');
  await zed.getByRole('button', { name: 'Join the team' }).click();
  await zed.locator('#team-err').getByText('Someone in the game already has that name').waitFor();
  assert(true, 'the team list shows who is on each team, and a name someone has is taken');
  await zed.getByRole('textbox', { name: 'Your name (your team sees it)' }).fill('Zed');
  await zed.getByRole('button', { name: 'Join the team' }).click();
  await zed.locator('#me').getByText('Zed · Player 2').waitFor();

  // The host moves Al to Player 2 and back, and takes Zed off.
  await card.getByLabel('Move Al to another team').selectOption({ label: 'Player 2' });
  await al.locator('#me').getByText('Al · Player 2').waitFor();
  await card.getByLabel('Move Al to another team').selectOption({ label: 'Player 1' });
  await al.locator('#me').getByText('Al · Player 1').waitFor();
  assert(true, 'the host moves a phone to another team (and back)');
  await card.getByRole('button', { name: 'Take Zed off Player 2' }).click();
  await zed.locator('main').getByText('The host took you off the team').waitFor();
  await card.getByText('3 people on 2 of 2 teams').waitFor();
  assert(true, 'the host takes one person off a team (their phone is told)');

  // A phone reload comes back on its team, under its own name.
  await al.reload();
  await al.locator('#me').getByText('Al · Player 1').waitFor();
  assert(true, 'a phone reload comes back on its team with its name');

  // ---------- A clue: whoever on a team buzzes first answers for it ----------
  const big = (p) => p.locator('#buzz-big');
  const small = (p) => p.locator('#buzz-small');
  const press = (p) => p.locator('#buzz').dispatchEvent('pointerdown');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();
  await host.locator('.stage-box .board .tile').first().click();
  await big(ann).getByText('Get ready…').waitFor();
  await host.keyboard.press('u');
  for (const p of [ann, al, bea]) await big(p).getByText('BUZZ!').waitFor();
  assert((await small(al).innerText()) === 'Al for Player 1', 'U opens the buzzers on every phone ("BUZZ!  Al for Player 1")');

  await press(al);
  await big(al).getByText("You're answering!").waitFor();
  await big(ann).getByText('Al is answering').waitFor();
  assert((await small(ann).innerText()) === 'for your team', 'Al buzzed: he answers; his teammate Ann sees "Al is answering for your team"');
  await small(bea).getByText('Player 1 is answering (Al)').waitFor();
  assert(true, 'the other team sees "Player 1 is answering (Al)"');
  await host.waitForFunction(() => [...document.querySelectorAll('.panel .p .sel[aria-pressed="true"]')].some((e) => e.textContent.includes('Player 1')));
  await host.getByText('🔔 Al (Player 1) buzzed').waitFor();
  const plate = host.locator('.stage-box .plate');
  await plate.waitFor();
  assert((await plate.innerText()).replace(/\s+/g, ' ').includes('Player 1 is answering · Al'), 'the team is picked in the host panel ("🔔 Al (Player 1) buzzed"), and viewers see "Player 1 is answering · Al"');

  // Ann buzzes too (later): no second place for Player 1. Bea's buzz is 2nd.
  await press(ann);
  await press(bea);
  await big(bea).getByText('Your team is 2nd').waitFor();
  const queue = host.getByRole('list', { name: 'Buzz order' });
  await queue.locator('li', { hasText: 'Bea' }).waitFor();
  await host.waitForTimeout(500);
  const rows = (await queue.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ \+.*$/, ''));
  assert(rows.join() === '1. Al (Player 1),2. Bea (Player 2)', `the buzz order has each team once, with who buzzed (${rows.join(' / ')})`);
  assert((await big(ann).innerText()) === 'Al is answering', "Ann's later buzz only hears her team is answering");

  // Wrong: Player 1 is out, whoever on it presses; Bea (next in the order) answers.
  await host.keyboard.press('Shift+Enter');
  await big(bea).getByText("You're answering!").waitFor();
  await small(ann).getByText('Player 2 is answering (Bea)').waitFor();
  await small(al).getByText('Player 2 is answering (Bea)').waitFor();
  assert(true, 'a wrong answer locks out the whole team; the next team in the order answers');
  await host.getByRole('button', { name: '↺ Reset buzzers' }).waitFor();
  // Bea wrong too: the buzzers stay closed for both teams.
  await host.keyboard.press('Shift+Enter');
  await small(ann).getByText('Your team already answered this one').waitFor();
  await press(ann);
  await host.waitForTimeout(500);
  assert((await small(ann).innerText()) === 'Your team already answered this one', 'a locked-out team stays out: "Your team already answered this one"');

  // ↺ Reset: Ann buzzes for Player 1 this time; awarded, the team scores.
  await host.getByRole('button', { name: '↺ Reset buzzers' }).click();
  await big(ann).getByText('BUZZ!').waitFor();
  await press(ann);
  await big(ann).getByText("You're answering!").waitFor();
  await big(al).getByText('Ann is answering').waitFor();
  const before = await al.locator('#me').innerText();
  await host.keyboard.press('Enter');
  await big(al).getByText('Your team got it!').waitFor();
  await al.waitForFunction((b) => document.getElementById('me').textContent !== b, before);
  assert((await ann.locator('#me').innerText()) === (await al.locator('#me').innerText()).replace(/^Al/, 'Ann'), 'right: the team scores, and both teammates see it ("Your team got it!")');
  await host.keyboard.press('Escape');

  // ---------- Exit › Discard & leave ends the room (Keep & leave would keep it for Resume) ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Discard & leave', exact: true }).click();
  await ann.locator('main').getByText('The game is over').waitFor();
  assert(true, 'Discard & leave closes the room');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Team buzzers E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
