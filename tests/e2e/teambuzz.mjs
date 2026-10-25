// Team buzzers, end to end: the built app hosts a game with Teams on against the real buzzer room (buzzer/ under
// `wrangler dev`, local), and people join teams from the real phone page with their own names. Two on one team: whoever
// buzzes first answers for it, the host and viewers see who ("Al (Player 1)"), a teammate's later buzz is no new place
// in the order, and a wrong answer locks out the whole team. The host moves someone to another team and takes someone
// off; a phone reload comes back on its team. Teams on or off with phones in the room asks first. On a ✍ clue, one
// member's answer fills in their teammates' boxes. The room kept for another game keeps its teams, through Ctrl+Z before
// the game and Resume with my edits (an editor Ctrl+Z of ▶ Play's step for it too, but not of the host's own Buzzer mode
// step); with 24 phones on teams, the next one is told the game is full. Needs `npm ci` in buzzer/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addClassicRounds, addPlayers, answerReplace, openRules, startRoomOn, stored, tap, tieThem } from './helpers.mjs';

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
const until = async (pred, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await pred()) return true;
  return false;
};

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
  // The second clue is a ✍ one (everyone answers on their phone; teams: anyone on the team, for it).
  await host.locator('.tile').nth(1).click();
  const editor = host.getByRole('dialog', { name: 'Edit clue' });
  await editor.locator('[data-field="q"]').fill('Name a dog breed');
  await editor.getByLabel(/Everyone answers/).check();
  await editor.getByRole('button', { name: /Done/ }).click();
  const card = host.getByRole('region', { name: 'Phone buzzers' });
  // An empty list with Teams on: what it says, and its sample rows, are teams.
  await host.getByRole('button', { name: '▶ Play' }).click();
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel(/Teams: people join a team/).check();
  const emptyRoster = host.locator('[data-place="play:players"]');
  assert((await emptyRoster.locator('.warn').innerText()).startsWith('Add teams to start: ＋ Add team, or'), 'with Teams on and nobody yet, the list says to add teams (＋ Add team)');
  const startButton = host.getByRole('button', { name: 'Start game ▶' });
  assert(
    (await host.getByText('Add teams to start', { exact: true }).isVisible()) && (await startButton.getAttribute('title')) === 'Add teams to start',
    'and so do the line by Start game and its tip',
  );
  const rules = await openRules(host);
  const rulesText = (await rules.innerText()).replace(/\s+/g, ' ');
  assert(
    ['8 teams at most', 'Scoring and teams', 'Team who gets points picks next', 'the number keys 1–8 pick teams'].every((t) => rulesText.includes(t)) && (await rules.getByLabel('Most teams').isVisible()),
    `⚖ Game rules speak of teams too (${rulesText.slice(0, 160)}…)`,
  );
  await rules.locator('summary').click();
  await emptyRoster.getByRole('button', { name: '＋ Add 3 sample teams' }).click();
  const samples = await emptyRoster.locator('input.name').evaluateAll((els) => els.map((e) => e.value));
  assert(samples.join() === 'Team 1,Team 2,Team 3', `＋ Add 3 sample teams adds teams with team names, not people's (${samples.join(', ')})`);
  for (const t of samples) await emptyRoster.getByRole('button', { name: `Delete ${t}` }).click();
  await card.getByLabel(/Teams: people join a team/).uncheck();
  await addPlayers(host, 2);
  await card.getByLabel(/Buzzer mode/).check();
  await card.getByLabel('Open the buzzers').selectOption('host');
  const teamsBox = card.getByLabel(/Teams: people join a team/);
  await teamsBox.check();
  assert(await card.getByLabel(/Let new players join from their phone/).isDisabled(), 'Teams is a checkbox on the 📱 card (new players from phones are off with it: people join a team)');
  const dimmed = await card.locator('label.check').evaluateAll((els) => els.map((e) => [e.textContent.trim().slice(0, 12), getComputedStyle(e).opacity]));
  assert(dimmed.filter(([, o]) => o !== '1').map(([t]) => t).join() === 'Let new play,Players can ', `and it and the color choice look greyed, as disabled buttons do (${JSON.stringify(dimmed)})`);
  await card.getByText(/up to 24 phones\s+can be in the room at once\./).waitFor();
  assert(true, 'with Teams ticked, the card says a room holds 24 phones at most');
  const codeEl = card.locator('[aria-label^="Room code "]');
  const code = await startRoomOn(card);
  await card.getByText('0 people on 0 of 2 teams').waitFor();
  assert(true, `a real room (${code}); the card counts people on teams`);
  assert(await card.getByText('🔒 Lock seats: no new phones (people already on a team can come back)', { exact: true }).isVisible(), 'its 🔒 Lock seats says people already on a team can come back');

  // ---------- People join teams from their phones ----------
  /** Each phone's buzzes, to hold two for a tie (tieThem). */
  const taps = new Map();
  const phone = async (name, team) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await ctx.newPage(), name);
    taps.set(p, await tap(p));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Pick your team' }).waitFor();
    await p.getByRole('button', { name: team }).click();
    await p.getByRole('heading', { name: `Join ${team}` }).waitFor();
    // (Your own name, not the team's: the box says so, and gives an example.)
    if ((await p.getByRole('textbox', { name: 'Your name (everyone sees it)' }).getAttribute('placeholder')) !== 'e.g. Zoe') throw new Error('the team name box has no example');
    await p.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(`${name} · ${team}`).waitFor();
    return p;
  };
  const ann = await phone('Ann', 'Player 1');
  const al = await phone('Al', 'Player 1');
  const bea = await phone('Bea', 'Player 2');
  await card.getByText('3 people on 2 of 2 teams').waitFor();
  const bar = (await host.locator('.actions .room-note').innerText()).replace(/\s+/g, ' ');
  assert(bar.includes(`Room ${code} · 3 people on 2 of 2 teams`), `the bar by Start game counts them as the card does (${bar})`);
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
  // (Zed is on a computer: a team's number key opens it, and Esc goes back with the keys on that team.)
  await zed.keyboard.press('2');
  await zed.locator('#team-on').getByText('On it: Bea').waitFor();
  await zed.keyboard.press('Escape');
  await zed.getByRole('heading', { name: 'Pick your team' }).waitFor();
  await zed.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Player 2: Bea');
  assert(true, 'the name form says who is on the team already ("On it: Bea"); on a computer, 2 opens it and Esc goes back');
  await zed.getByRole('button', { name: 'Player 2' }).click();
  await zed.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('ann');
  await zed.getByRole('button', { name: 'Join the team' }).click();
  const nameTaken = zed.locator('#team-err').getByText('A team or someone in the game already has that name: add a letter, or pick another.', { exact: true });
  await nameTaken.waitFor();
  assert(true, 'the team list shows who is on each team, and a name someone has is taken');
  // A team's name too ("Player 1" on Player 2 would buzz as "Player 1 (Player 2)").
  // (Join the team empties the line first: what shows next is the room's answer.)
  await zed.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('player 1');
  await zed.getByRole('button', { name: 'Join the team' }).click();
  await nameTaken.waitFor();
  assert(true, 'and so is a team’s name');
  await zed.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Zed');
  await zed.getByRole('button', { name: 'Join the team' }).click();
  await zed.locator('#me').getByText('Zed · Player 2').waitFor();

  // The ✕ that takes a whole team off reads differently from each person's ✕ under it.
  assert(
    (await card.getByRole('button', { name: 'Take everyone off Player 2' }).innerText()).trim() === '✕ All' && (await card.getByRole('button', { name: 'Take Zed off Player 2' }).innerText()).trim() === '✕',
    'a team’s row: “✕ All” takes everyone off; each person’s ✕ under it, only them',
  );
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
  // Change team or name asks about leaving the team, not giving it up (said no to).
  await al.evaluate(() => (window.confirm = (m) => ((window.__asked = m), false)));
  await al.getByRole('button', { name: 'Change team or name' }).click();
  const leaveAsk = await al.evaluate(() => window.__asked);
  assert(leaveAsk === 'Leave Player 1 to pick a team and your name again? Your team plays on.' && (await al.locator('#me').isVisible()), `Change team or name asks to leave the team, which plays on (${leaveAsk})`);

  // The list's words are a team's: two teams of one name.
  await roster.getByRole('button', { name: '＋ Add team' }).click();
  await roster.locator('input.name').nth(2).fill('player 1');
  const same = (await roster.locator('.same').innerText()).replace(/\s+/g, ' ');
  assert(same === '⚠ Teams share a name (“Player 1”): viewers can\'t tell them apart on the scores.', `two teams of one name: “Teams share a name”, no initial to add (${same})`);
  await roster.locator('button.del').nth(2).click();
  // A team with people on it deleted: the note says they pick a team again (its Undo brings back the team, not them).
  await roster.getByRole('button', { name: 'Delete Player 2' }).click();
  const note = (await roster.locator('.undo-note').innerText()).replace(/\s+/g, ' ');
  assert(note.startsWith('Deleted Player 2: its 1 person picks a team again'), `deleting a team Bea is on: the note says she picks a team again (${note})`);
  // (Her phone hears it before the Undo: so she rejoins by hand, as the note says.)
  await bea.locator('#seats-note').getByText('Your team left the game. Pick another one.').waitFor();
  await roster.locator('.undo-note').getByRole('button', { name: '↶ Undo' }).click();
  await bea.locator('#seats-note').getByText('Your team is back in the game. Tap it to rejoin.').waitFor();
  await bea.getByRole('button', { name: 'Player 2' }).click();
  await bea.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Bea');
  await bea.getByRole('button', { name: 'Join the team' }).click();
  await bea.locator('#me').getByText('Bea · Player 2').waitFor();
  await card.getByText('3 people on 2 of 2 teams').waitFor();

  // Teams off with people on teams: asked first (every phone would pick again), as closing the room is.
  await teamsBox.click();
  const ask = card.getByRole('alertdialog', { name: 'Turn teams off?' });
  await ask.waitFor();
  const asked = (await ask.innerText()).replace(/\s+/g, ' ');
  assert(asked.startsWith('3 phones are in the room: turning teams off sends them all back to tap their name.') && (await teamsBox.isChecked()), `Teams off with people on teams asks first, and the box stays ticked meanwhile (${asked})`);
  // ✕ Close the room meanwhile: that's the question now (one at a time), and the Teams one is gone for good.
  await card.getByRole('button', { name: '✕ Close the room' }).click();
  const closeAsk = card.getByRole('alertdialog', { name: 'Close the room?' });
  await closeAsk.waitFor();
  const closeButtons = await closeAsk.getByRole('button').allInnerTexts();
  assert((await card.getByRole('alertdialog').count()) === 1 && closeButtons.join(' | ') === 'Keep it open | Close the room', `closing the room while it asks about Teams: only the room’s question shows, Keep it open first (${closeButtons.join(' | ')})`);
  await closeAsk.getByRole('button', { name: 'Keep it open' }).click();
  await closeAsk.waitFor({ state: 'detached' });
  assert((await card.getByRole('alertdialog').count()) === 0, 'kept open: the Teams question doesn’t come back on its own');
  await teamsBox.click();
  const teamsButtons = await ask.getByRole('button').allInnerTexts();
  assert(teamsButtons.join(' | ') === 'Keep teams on | Turn teams off', `the Teams question puts Keep teams on first (${teamsButtons.join(' | ')})`);
  await ask.getByRole('button', { name: 'Keep teams on' }).click();
  await ask.waitFor({ state: 'detached' });
  assert((await teamsBox.isChecked()) && (await card.getByText('3 people on 2 of 2 teams').isVisible()), 'kept on: nobody is sent back');
  // Turned off all the same: the phones say why they're back at "Tap your name". On again, people pick their team.
  await teamsBox.click();
  await ask.getByRole('button', { name: 'Turn teams off' }).click();
  await ann.getByRole('heading', { name: 'Tap your name' }).waitFor();
  assert((await ann.locator('#seats-note').innerText()) === 'The host turned teams off. Tap your name.', 'turned off: the phones say so ("The host turned teams off. Tap your name.")');
  await card.getByText('0 of 2 players joined').waitFor();
  // Ann taps a player's name: Teams on again asks first too, and her phone says why it's back at "Pick your team".
  await ann.getByRole('button', { name: 'Player 1' }).click();
  await card.getByText('1 of 2 players joined').waitFor();
  await teamsBox.click();
  const askOn = card.getByRole('alertdialog', { name: 'Turn teams on?' });
  await askOn.waitFor();
  const askedOn = (await askOn.innerText()).replace(/\s+/g, ' ');
  assert(askedOn.startsWith('1 phone is in the room: turning teams on sends it back to pick a team.') && !(await teamsBox.isChecked()), `Teams on with a phone on a player asks first, and the box stays unticked meanwhile (${askedOn})`);
  await askOn.getByRole('button', { name: 'Turn teams on' }).click();
  await ann.getByRole('heading', { name: 'Pick your team' }).waitFor();
  assert((await ann.locator('#seats-note').innerText()) === 'The host switched to teams. Pick your team.', 'turned on: the phone says so ("The host switched to teams. Pick your team.")');
  for (const [p, name, team] of [[ann, 'Ann', 'Player 1'], [al, 'Al', 'Player 1'], [bea, 'Bea', 'Player 2']]) {
    await p.getByRole('heading', { name: 'Pick your team' }).waitFor();
    await p.getByRole('button', { name: team }).click();
    await p.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(`${name} · ${team}`).waitFor();
  }
  await card.getByText('3 people on 2 of 2 teams').waitFor();
  assert(true, 'people pick their team again');

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
  const annHears = await ann.locator('#buzz').getAttribute('aria-label');
  assert(annHears === 'Al is answering for your team.', `and a screen reader hears it as one sentence (${annHears})`);
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

  // ↺ Reset: Ann and Bea tie; 🎲 Roll for it. The team that rolled 2nd reads "Tie — your team rolled 2nd" (Al too,
  // who didn't buzz: never "you rolled").
  await host.getByRole('button', { name: '↺ Reset buzzers' }).click();
  await big(ann).getByText('BUZZ!').waitFor();
  await big(bea).getByText('BUZZ!').waitFor();
  tieThem([taps.get(ann), taps.get(bea)]);
  await press(ann);
  await press(bea);
  await host.getByRole('button', { name: '🎲 Roll for it' }).click();
  const won = await Promise.race([ann, bea].map((p, i) => big(p).getByText("You're answering!").waitFor({ timeout: 30_000 }).then(() => i)));
  const rolledSecond = won === 0 ? bea : ann;
  await small(rolledSecond).getByText('Tie — your team rolled 2nd').waitFor();
  if (won === 1) await small(al).getByText('Ann buzzed for your team · Tie — your team rolled 2nd').waitFor();
  assert((await big(rolledSecond).innerText()) === 'Your team is 2nd', `a tie rolled: the team that rolled 2nd reads “Your team is 2nd · Tie — your team rolled 2nd”${won === 1 ? ' (Al too, after “Ann buzzed for your team”)' : ''}`);
  await host.keyboard.press('Escape');
  await host.locator('.stage-box').getByText('Tie! Roll for it').waitFor({ state: 'detached' });

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

  // ---------- A ✍ clue: one answer per team; a teammate's fills the others' boxes ----------
  await host.locator('.stage-box .board .tile').nth(1).click();
  for (const p of [ann, al, bea]) await p.locator('#answer-in').waitFor();
  assert((await ann.locator('#answer-label').innerText()) === 'Your team’s answer (only the host and your team see it)', 'a ✍ clue: every member gets the team’s answer box, which says the team sees it too');
  // Ann's box has the focus (it takes it as it opens) and she typed nothing: Al's answer for the team fills it.
  await ann.locator('#answer-in').focus();
  await al.locator('#answer-in').fill('Poodle');
  await al.getByRole('button', { name: 'Send answer' }).click();
  await ann.locator('#answer-state').getByText('✔ Al sent it for your team: “Poodle”').waitFor();
  assert(
    (await ann.locator('#answer-in').inputValue()) === 'Poodle' && (await ann.evaluate(() => document.activeElement?.id)) === 'answer-in',
    'Al sends the team’s answer: it fills in Ann’s box too (it had the focus, but she typed nothing)',
  );
  assert(!(await bea.content()).includes('Poodle'), 'the other team doesn’t see it');
  // Someone joining the team now (from the other team, under another name, to read it) is told one is in, not what.
  const mal = await phone('Mal', 'Player 1');
  await mal.locator('#answer-state').getByText('Your team’s answer is in with the host (not shown on a phone that joined after the answers began). Sending one replaces it.').waitFor();
  assert(!(await mal.content()).includes('Poodle') && (await mal.locator('#answer-in').inputValue()) === '', 'someone who joins the team after its answer was sent is told one is in, never what it says');
  // Showing the answer locks them: still "in", not "None sent".
  await host.keyboard.press('r');
  await big(mal).getByText('Answers locked').waitFor();
  await small(mal).getByText('The host has it (not shown on this phone)').waitFor();
  assert(!(await mal.content()).includes('Poodle'), 'once the answers lock, that phone says the host has the team’s answer (not “None sent”), still without what it says');
  // (One window: the answers box shows the words once the answer is up.)
  const sentBy = host.locator('[data-answer-row] .text', { hasText: 'Poodle' });
  await sentBy.waitFor();
  assert((await sentBy.innerText()) === '“Poodle” · Al', `the host's answers box says who sent it, apart from the answer (${await sentBy.innerText()})`);
  await host.keyboard.press('Escape');

  // ---------- The host's words say team: Enter with no team picked ----------
  await host.locator('.stage-box .board .tile:not(.used)').first().click();
  await host.locator('.panel .status', { hasText: 'Answer hidden' }).waitFor();
  await host.keyboard.press('Enter');
  await host.locator('.toast', { hasText: /^Select a team first/ }).waitFor();
  assert(true, 'Enter with no team picked says “Select a team first” (not a player)');
  await host.keyboard.press('Escape');

  // ---------- 👥 Teams mid-game (not Players): a new row is a team, and removing one says its phones go ----------
  // (In a clue Bea, then Al, buzzed in: a team taken out leaves the buzz order, the rest move up.)
  await host.locator('.stage-box .board .tile:not(.used)').first().click();
  await big(bea).getByText('Get ready…').waitFor();
  await host.keyboard.press('u');
  await big(bea).getByText('BUZZ!').waitFor();
  await press(bea);
  await big(bea).getByText("You're answering!").waitFor();
  await press(al);
  const order = host.getByRole('list', { name: 'Buzz order' });
  await order.locator('li', { hasText: 'Al' }).waitFor();
  await host.getByRole('button', { name: '👥 Teams' }).click();
  const teamsDialog = host.getByRole('dialog', { name: 'Teams' });
  await teamsDialog.waitFor();
  assert((await teamsDialog.getByRole('heading', { level: 2 }).innerText()) === '👥 Teams', 'mid-game with Teams on, the host panel’s 👥 Teams opens the list of teams');
  await teamsDialog.getByRole('button', { name: '＋ Add team' }).click();
  assert((await teamsDialog.getByRole('textbox', { name: 'Team 3 name' }).inputValue()) === 'Team 3', 'its ＋ Add team adds "Team 3" (not "Player 3")');
  await teamsDialog.getByRole('button', { name: 'Remove Player 2' }).click();
  const removeAsk = (await teamsDialog.locator('.ask').innerText()).replace(/\s+/g, ' ');
  assert(removeAsk.includes('Its points leave the scoreboard') && removeAsk.includes('The 1 person on it goes back to picking a team on their phone.'), `removing a team says its phones go back to picking a team (${removeAsk})`);
  // Removed, then ↩ Restore (a mistake): its phone says it left, then that it's back, and its person rejoins it.
  await teamsDialog.locator('.ask').getByRole('button', { name: 'Remove', exact: true }).click();
  await bea.locator('#seats-note').getByText('Your team left the game. Pick another one.').waitFor();
  await order.locator('li', { hasText: 'Bea' }).waitFor({ state: 'detached' });
  const left = (await order.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ \+.*$/, ''));
  assert(left.join() === '1. Al (Player 1)', `a team taken out mid-clue leaves the buzz order, the rest move up (${left.join(' / ')})`);
  await teamsDialog.getByRole('button', { name: '↩ Restore' }).click();
  await bea.locator('#seats-note').getByText('Your team is back in the game. Tap it to rejoin.').waitFor();
  assert(true, 'a team removed and restored: its phone says it left the game, then that it’s back (tap it to rejoin)');
  await bea.getByRole('button', { name: 'Player 2' }).click();
  await bea.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Bea');
  await bea.getByRole('button', { name: 'Join the team' }).click();
  await bea.locator('#me').getByText('Bea · Player 2').waitFor();
  await teamsDialog.getByRole('button', { name: 'Remove Team 3' }).click();
  await teamsDialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await teamsDialog.getByRole('button', { name: 'Done' }).click();
  await host.keyboard.press('Escape');
  await host.locator('.stage-box .board').waitFor();

  // ---------- 🎡 Wheel › 🎯 Pick a team: viewers see "Pick a team" over the teams ----------
  await host.getByRole('button', { name: '🎡 Wheel' }).click();
  const pickTeam = host.getByRole('button', { name: '🎯 Pick a team', exact: true });
  assert((await pickTeam.getAttribute('title')) === 'A wheel of the teams, in their colors', 'with Teams on, 🎡 Wheel offers 🎯 Pick a team (“A wheel of the teams”)');
  await pickTeam.click();
  const wheelTitle = host.locator('.stage-box .wrap:has(> .disc.single) > .title');
  await wheelTitle.getByText('Pick a team', { exact: true }).waitFor();
  assert(true, 'the stage (what viewers see) reads “Pick a team” over the wheel, not “Pick a player”');
  await host.keyboard.press('Escape');
  await wheelTitle.waitFor({ state: 'detached' });

  // ---------- Kept for another game: the room keeps its teams, so nobody picks again ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  const roomBar = host.locator('.status-bar .room-bar');
  await roomBar.getByText('Resume game goes back into it').waitFor();
  const barText = (await roomBar.innerText()).replace(/\s+/g, ' ');
  assert(barText.includes(`Buzzer room ${code} is still open (2 teams)`), `Keep & leave: the bar over the editor counts the room's teams (${barText})`);
  await host.getByRole('button', { name: 'New', exact: true }).click();
  await answerReplace(host, 'Discard');
  await roomBar.getByText('▶ Play asks to keep it for this game').waitFor();
  // A reload with that game (no Teams ticked) in the editor: the phones stay on their teams.
  const keptFor = async () => {
    const [room, draft] = [await stored(host, 'playSession:room'), await stored(host, 'editorDraft')];
    return room?.screen === 'editor' && !!draft?.id && draft.id !== room.gameId && !draft.settings?.buzzTeams;
  };
  assert(await until(keptFor), 'the kept room and the new game in the editor are stored');
  await host.reload();
  await roomBar.getByText('▶ Play asks to keep it for this game').waitFor();
  // (Its setting-up state starts the scores at 0: Bea's team had −$200.)
  await bea.locator('#me').getByText('Bea · Player 2 · $0', { exact: true }).waitFor();
  assert(!(await ann.getByRole('heading', { name: 'Tap your name' }).isVisible()), 'a reload with another game in the editor: the phones stay on their teams (not sent back to "Tap your name")');
  await addClassicRounds(host);
  await host.getByRole('button', { name: '▶ Play' }).click();
  const keepAsk = host.getByRole('alertdialog', { name: `Keep buzzer room ${code} and its 2 teams?` });
  await keepAsk.waitFor();
  assert((await host.evaluate(() => document.activeElement?.textContent.trim())) === 'Keep room & teams', `▶ Play asks: keep buzzer room ${code} and its 2 teams? (Keep room & teams focused)`);
  await host.keyboard.press('Enter');
  await card.getByText('4 people on 2 of 2 teams').waitFor();
  assert((await teamsBox.isChecked()) && (await roster.getByRole('heading', { level: 2 }).innerText()) === '👥 Teams', 'kept for a game without Teams ticked: Teams stays on, with the same teams');
  for (const [p, name, team] of [[ann, 'Ann', 'Player 1'], [bea, 'Bea', 'Player 2'], [mal, 'Mal', 'Player 1']]) await p.locator('#me').getByText(`${name} · ${team} · $0`, { exact: true }).waitFor();
  assert(!(await ann.locator('#seats-note').isVisible()), 'and nobody’s phone is sent back to pick again');
  // Ctrl+Z before the game takes back only what it undoes: Teams and the kept teams stay.
  const keptRules = await openRules(host);
  const negative = keptRules.getByLabel('Allow negative scores');
  const wasNegative = await negative.isChecked();
  await negative.click();
  await host.keyboard.press('Control+z');
  await host.locator('.toast', { hasText: /^↶ Undid Rule: Negative scores/ }).waitFor();
  if ((await negative.isChecked()) !== wasNegative) throw new Error('Ctrl+Z didn’t take back the rule');
  await keptRules.locator('summary').click();
  // A team renamed, then undone, is back as it was (the game in the editor has the kept teams too).
  const firstTeam = roster.locator('input.name').first();
  await firstTeam.fill('Sharks');
  await firstTeam.press('Tab');
  await ann.locator('#me').getByText('Ann · Sharks · $0', { exact: true }).waitFor();
  await host.keyboard.press('Control+z');
  await ann.locator('#me').getByText('Ann · Player 1 · $0', { exact: true }).waitFor();
  const keptNames = await roster.locator('input.name').evaluateAll((els) => els.map((e) => e.value));
  assert(
    (await teamsBox.isChecked()) && keptNames.join() === 'Player 1,Player 2' && (await card.getByText('4 people on 2 of 2 teams').isVisible()) && !(await ann.locator('#seats-note').isVisible()),
    `Ctrl+Z of a rule, then of a team’s new name: Teams stays on, the same 2 teams are listed, and the phones stay on them (${keptNames.join(', ')})`,
  );
  // ◀ Back to editor, then Ctrl+Z there: it takes back the step ▶ Play made for the room (Buzzer mode and Teams on, its
  // teams), but the room stays open and the phones on their teams; Ctrl+Y brings the step back, and ▶ Play goes back
  // into the room.
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  await roomBar.getByText('▶ Play goes back into it').waitFor();
  // (The note under the editor says what it undid.)
  const editorSaid = (text) => host.locator('.history-notice', { hasText: text }).waitFor();
  await host.keyboard.press('Control+z');
  await editorSaid(`Undid Kept buzzer room ${code}`);
  await host.keyboard.press('Control+y');
  await editorSaid(`Redid Kept buzzer room ${code}`);
  await host.getByRole('button', { name: '▶ Play' }).click();
  await card.getByText('4 people on 2 of 2 teams').waitFor();
  for (const [p, name, team] of [[ann, 'Ann', 'Player 1'], [bea, 'Bea', 'Player 2'], [mal, 'Mal', 'Player 1']]) await p.locator('#me').getByText(`${name} · ${team} · $0`, { exact: true }).waitFor();
  assert(
    (await teamsBox.isChecked()) && !(await ann.locator('main').getByText('The game is over').isVisible()),
    'Ctrl+Z in the editor of the step ▶ Play made for the room leaves it open (Ctrl+Y puts the step back): ▶ Play goes back into it with Teams on, every phone still on its team',
  );

  // ---------- 24 phones on teams: the next one is told the game is full, and joins once someone leaves ----------
  await zed.close();
  await card.getByText(/on the join screen/).waitFor({ state: 'detached' });
  const fans = [];
  for (let i = 0; i < 20; i++) {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws/${code}`);
    const x = { w, msgs: [] };
    w.addEventListener('message', (e) => x.msgs.push(JSON.parse(e.data)));
    fans.push(x);
    if (!(await until(() => x.msgs.some((m) => m.t === 'seats')))) throw new Error(`fan ${i + 1} got no seat list`);
    // (On Player 1: Player 2 still turns away new phones from this address for a while, after Zed's kick.)
    const seat = x.msgs.find((m) => m.t === 'seats').seats[0];
    w.send(JSON.stringify({ t: 'join', seatId: seat.id, name: `Fan ${i + 1}`, device: `fan-${i}` }));
    if (!(await until(() => x.msgs.some((m) => m.t === 'joined')))) throw new Error(`fan ${i + 1} wasn't put on a team (${JSON.stringify(x.msgs.at(-1))})`);
  }
  await card.getByText('24 people on 2 of 2 teams').waitFor();
  assert(true, '20 more people join the teams (24 phones in the room, all on teams)');
  const zoe = watch(await (await browser.newContext({ viewport: { width: 390, height: 760 } })).newPage(), 'zoe');
  await zoe.goto(`${base}/${code}`);
  await zoe.getByRole('button', { name: 'Player 1' }).click();
  await zoe.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Zoe');
  await zoe.getByRole('button', { name: 'Join the team' }).click();
  await zoe.locator('main').getByText('This game is full').waitFor();
  await zoe.locator('#team-err').getByText('The game is full (24 phones at most): try again when someone leaves.', { exact: true }).waitFor();
  assert(
    (await zoe.getByRole('heading', { name: 'Join Player 1' }).isVisible()) && (await zoe.getByRole('textbox', { name: 'Your name (everyone sees it)' }).inputValue()) === 'Zoe',
    'the 25th phone, turned away as full, is back on the team’s name form, which says the game is full until someone leaves',
  );
  const fullNote = card.getByText(/^⚠ Room full: a buzzer room takes 24 phones at once\./);
  await fullNote.waitFor();
  assert((await fullNote.innerText()).includes('once 24 people are on teams nobody else can join until someone leaves'), 'the host is told 24 phones is the most, and that on teams nobody makes way by themselves');
  fans[0].w.close();
  await card.getByText('23 people on 2 of 2 teams').waitFor();
  await zoe.getByRole('button', { name: 'Join the team' }).click();
  await zoe.locator('#me').getByText('Zoe · Player 1 · $0', { exact: true }).waitFor();
  assert(true, 'someone leaves: Join the team gets Zoe on it');
  for (const x of fans) x.w.close();
  await zoe.close();
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.getByRole('button', { name: 'Skip intro' }).click();

  // ---------- Exit › Keep & leave, then Resume with my edits: the game kept the room's Teams, so the teams play on ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Keep & leave', exact: true }).click();
  const settingUp = ann.locator('main').getByText('The host is setting up — hang on');
  await settingUp.waitFor();
  // An edit undone in the editor: the game is as it was played, so nothing is offered to resume with.
  const withEdits = host.locator('.status-bar .kept').getByRole('button', { name: 'Resume with my edits' });
  const gameTitle = host.getByLabel('Game title');
  await gameTitle.fill('Team night');
  await gameTitle.press('Tab');
  await withEdits.waitFor();
  await host.keyboard.press('Control+z');
  await withEdits.waitFor({ state: 'detached' });
  assert(true, 'played in the kept room, the game in the editor has Teams on and the kept teams: an edit undone leaves no "Resume with my edits"');
  await host.keyboard.press('Control+y');
  await withEdits.click();
  await host.locator('.mode-ask .mode', { hasText: 'Single window' }).click();
  await settingUp.waitFor({ state: 'detached' });
  for (const [p, name, team] of [[ann, 'Ann', 'Player 1'], [bea, 'Bea', 'Player 2']]) await p.locator('#me').getByText(`${name} · ${team} · $0`, { exact: true }).waitFor();
  assert(!(await ann.locator('#seats-note').isVisible()) && (await host.locator('.panel').isVisible()), 'Resume with my edits: the game goes on with Teams, every phone still on its team');

  // ---------- Exit › Discard & leave ends the room (Keep & leave would keep it for Resume) ----------
  await host.getByRole('button', { name: 'Exit' }).click();
  await host.waitForTimeout(450);
  await host.getByRole('button', { name: 'Discard & leave', exact: true }).click();
  await ann.locator('main').getByText('The game is over').waitFor();
  assert(true, 'Discard & leave closes the room');

  // ---------- Sample teams in a room kept for the same game: Ctrl+Z of a rule leaves them listed ----------
  await host.getByRole('button', { name: '▶ Play' }).click();
  for (const t of ['Player 1', 'Player 2']) await roster.getByRole('button', { name: `Delete ${t}` }).click();
  await roster.getByRole('button', { name: '＋ Add 3 sample teams' }).click();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await codeEl.waitFor();
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  await roomBar.getByText('▶ Play goes back into it').waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  await card.getByText('0 people on 0 of 3 teams').waitFor();
  // (The game in the editor has no sample teams: Ctrl+Z follows only what it undid.)
  await (await openRules(host)).getByLabel('Allow negative scores').click();
  await host.keyboard.press('Control+z');
  await host.locator('.toast', { hasText: /^↶ Undid Rule: Negative scores/ }).waitFor();
  const sampleNames = await roster.locator('input.name').evaluateAll((els) => els.map((e) => e.value));
  assert(sampleNames.join() === 'Team 1,Team 2,Team 3', `back in the same room, Ctrl+Z of a rule keeps the sample teams listed (${sampleNames.join(', ')})`);

  // ---------- Your own Buzzer mode step undone in the editor closes the room, behind ▶ Play's step for its Teams ----------
  // The host's steps: Teams off, Buzzer mode off (the room closes) and on again, Teams on. A new room, a phone on a team.
  await teamsBox.uncheck();
  await card.getByLabel(/Buzzer mode/).uncheck();
  await codeEl.waitFor({ state: 'detached' });
  await card.getByLabel(/Buzzer mode/).check();
  await teamsBox.check();
  await card.getByRole('button', { name: '▶ Start the room' }).click();
  await codeEl.waitFor();
  const code2 = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  await ann.goto(`${base}/${code2}`);
  await ann.getByRole('button', { name: 'Team 1' }).click();
  await ann.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill('Ann');
  await ann.getByRole('button', { name: 'Join the team' }).click();
  await ann.locator('#me').getByText('Ann · Team 1').waitFor();
  // ◀ Back to editor, Ctrl+Z there (Teams off), and ▶ Play turns Teams back on for the room: a step of its own, with
  // Buzzer mode on already.
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  await roomBar.getByText('▶ Play goes back into it').waitFor();
  await host.keyboard.press('Control+z');
  await editorSaid('Undid Teams');
  await host.getByRole('button', { name: '▶ Play' }).click();
  await card.getByText('1 person on 1 of 3 teams').waitFor();
  assert(await teamsBox.isChecked(), `▶ Play into room ${code2}: Teams is on again`);
  // Ctrl+Z of that step leaves the room open; Ctrl+Z of the host's own Buzzer mode step closes it.
  await host.getByRole('button', { name: '◀ Back to editor' }).click();
  await roomBar.getByText('▶ Play goes back into it').waitFor();
  await host.keyboard.press('Control+z');
  await editorSaid(`Undid Kept buzzer room ${code2} (Teams on)`);
  assert(await roomBar.isVisible(), 'Ctrl+Z of ▶ Play’s step for the room’s Teams leaves the room open');
  await host.keyboard.press('Control+z');
  await editorSaid('Undid Buzzer mode');
  await ann.locator('main').getByText('The game is over').waitFor();
  await roomBar.waitFor({ state: 'detached' });
  assert(true, 'then Ctrl+Z of the host’s own Buzzer mode step closes the room: the phone is told the game is over');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Team buzzers E2E passed.');
} finally {
  await browser?.close();
  stopWrangler();
  rmSync(persist, { recursive: true, force: true });
}
