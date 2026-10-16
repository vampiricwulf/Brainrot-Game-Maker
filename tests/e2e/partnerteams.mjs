// 🤫 Partner clue cards on team phones, end to end (docs/PARTNER-CLUES-SPEC.md §6.5, §10, §14.4, §22): the built app
// hosts a team game in one window (the page viewers see) against the real buzzer room (buzzer/ under `wrangler dev`,
// local), people on the real phone page joining teams. A card sent to a team goes to every phone on it, and to no
// other: the guessing team's phones and the others' grey out with who plays which part. Someone the host moved onto the
// team before the send gets it; someone who joins the team mid-clue, or whom the host moves onto it afterwards, gets
// nothing of it (nor its picture) and is told they missed one, until ↻ Send again. The team's ✓ seen. All through, the
// host page holds no card's words and no file name: not in its text, labels, titles or announcements.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mainButton, mainLabel, openGameFile, packGame, png, recordSeen, shownOf, startBuzzer } from './helpers.mjs';

const file = resolve(process.env.APP_FILE || 'dist/index.html');
if (!existsSync(file)) throw new Error('Run `npm run build` first');
mkdirSync('test-results', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}

// Every card's words carry "qkzvt", its picture's file name "zfnqt": neither may ever be on the host page (on stream).
const WORDS1 = 'Kelp-qkzvt words';
const WORDS2 = 'Reef-qkzvt words';
const SECRETS = ['qkzvt', 'zfnqt'];

let ids = 0;
const box = (y) => ({ id: `e${ids++}`, x: 100, y, w: 800, h: 160, rotation: 0, opacity: 1, zIndex: 1 });
const text = (t, y = 40) => ({ ...box(y), kind: 'text', text: t, font: 'Arial', size: 90, weight: 700, italic: false, underline: false, uppercase: false, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, autoFit: true });
const slide = (...elements) => ({ background: {}, elements });

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const buzzer = await startBuzzer('buzzer-partnerteams-');
const { base } = buzzer;
let browser;
const errors = [];
const pages = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('dialog', (d) => (errors.push(`[${name}] dialog: ${d.message()}`), d.accept()));
  pages.push([name, p]);
  return p;
};

try {
  browser = await chromium.launch({ executablePath });

  // ---------- A team game: Movies $200 is a partner clue, card 1 for the describing team (a picture on it), card 2 for the others ----------
  const kelp = png(30, 140, 90, 640, 480);
  const rules = { game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' };
  const plain = (id, q, a) => ({ id, value: null, type: 'standard', questionSlide: slide(text(q)), answerSlide: slide(text(a)) });
  const values = [200, 400];
  const game = {
    id: 'g_partner_teams',
    version: 2,
    title: 'Partner teams',
    settings: {
      allowNegativeScores: true, deductOnWrong: false, defaultTimerSeconds: 30, finalTimerSeconds: 30, currencySymbol: '$', rollOffDie: 20, pickerFollowsAward: true, timerAutoStart: false,
      roundIntro: { titleCard: false, tileFill: false, categoryReveal: 'off' }, maxPlayers: 8, stream: { clueCaption: true }, buzzer: true, buzzTeams: true,
    },
    players: ['Red', 'Green', 'Blue'].map((name, i) => ({ id: `t${i + 1}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] })),
    rounds: [
      {
        id: 'r1', name: 'Round 1', mode: 'board', values, dailyDoubleCount: 0,
        categories: [
          {
            id: 'cat0', title: 'Movies',
            clues: [
              {
                ...plain('q_team', 'Describe this sea creature', 'Octopus'),
                type: 'partner', partner: { ...rules }, timerSeconds: 60,
                cards: [
                  { id: 'c1', to: 'giver', ...slide(text(WORDS1), { ...box(400), kind: 'image', media: 'kelp', fit: 'contain' }) },
                  { id: 'c2', to: 'others', ...slide(text(WORDS2)) },
                ],
              },
              plain('q_plain', 'A plain clue', 'Plain'),
            ],
          },
          { id: 'cat1', title: 'Songs', clues: values.map((_, r) => plain(`q_song${r}`, 'A plain clue', 'Plain')) },
        ],
      },
    ],
    media: [{ id: 'kelp', name: 'zfnqt-kelp.png', mime: 'image/png', size: kelp.length, kind: 'image' }],
    audio: {}, wheels: [], dice: [], theme: {},
  };
  const packPath = resolve('test-results/partner-teams.brainrot');
  writeFileSync(packPath, await packGame(game, { kelp }));

  // ---------- The host, in one window ----------
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((server) => {
    try {
      const p = JSON.parse(localStorage.getItem('jb.prefs') || '{}');
      if (!p.buzzerServer) localStorage.setItem('jb.prefs', JSON.stringify({ ...p, v: 2, buzzerServer: server }));
    } catch {}
  }, base);
  await ctx.addInitScript(recordSeen);
  const host = watch(await ctx.newPage(), 'host');
  const states = [];
  host.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(f.payload);
        if (m.t === 'state') states.push(m.state);
      } catch {
        // not JSON
      }
    }),
  );
  const last = () => states.at(-1);
  await host.goto(pathToFileURL(file).href);
  await openGameFile(host, packPath);
  await host.getByText(/^Opened “/).waitFor();
  await host.getByRole('button', { name: '▶ Play' }).click();
  const roomCard = host.getByRole('region', { name: 'Phone buzzers' });
  assert(await roomCard.getByLabel(/Teams: people join a team/).isChecked(), 'a team game: Teams is on');
  await roomCard.getByRole('button', { name: '▶ Start the room' }).click();
  const codeEl = roomCard.locator('[aria-label^="Room code "]');
  await codeEl.waitFor();
  const code = (await codeEl.getAttribute('aria-label')).slice('Room code '.length);
  /** The host page (viewers see it) holds none of a card's words nor its file name, and never did since it loaded. */
  const offStream = async (when) => {
    const found = await shownOf(host, SECRETS);
    assert(!found.length, `${when}: the host page holds no card’s words or file name${found.length ? ` (found ${found.join(', ')})` : ''}`);
  };

  // ---------- People join teams ----------
  const heard = {};
  const person = async (name, team) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const p = watch(await c.newPage(), name);
    heard[name] = [];
    p.on('websocket', (ws) => ws.on('framereceived', (f) => heard[name].push(String(f.payload))));
    await p.goto(`${base}/${code}`);
    await p.getByRole('heading', { name: 'Pick your team' }).waitFor();
    await p.getByRole('button', { name: team }).click();
    await p.getByRole('textbox', { name: 'Your name (everyone sees it)' }).fill(name);
    await p.getByRole('button', { name: 'Join the team' }).click();
    await p.locator('#me').getByText(`${name} · ${team}`).waitFor();
    return p;
  };
  const al = await person('Al', 'Red');
  const gus = await person('Gus', 'Green');
  const bea = await person('Bea', 'Blue');
  const bo = await person('Bo', 'Blue');
  await host.getByRole('button', { name: 'Start game ▶' }).click();
  await host.locator('.stage-box .tile').first().waitFor();
  await offStream('the game started');

  const says = (p, t) =>
    p
      .waitForFunction((t) => ['buzz-big', 'card-status-big'].some((id) => document.getElementById(id)?.textContent === t && !!document.getElementById(id)?.getClientRects().length), t, { timeout: 8000 })
      .then(() => true, () => false);
  /** Waits (up to `ms`) until pred() holds. */
  const until = async (pred, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await pred()) return true;
    return !!(await pred());
  };
  const tokenOf = (p) => p.evaluate((c) => JSON.parse(localStorage.getItem(`brainrot-buzzer:${c}`)).token, code);
  const fetchAs = async (p, id) => {
    const t = await tokenOf(p);
    return p.evaluate(async ([u, t]) => (await fetch(u, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' })).status, [`${base}/api/rooms/${code}/files/${id}`, t]);
  };
  const textOf = (loc) => loc.allInnerTexts().then((t) => t.join('\n'));
  const sendOf = (card) => (last()?.cards ?? []).filter((c) => c.id.split(':')[2] === card);
  const viewOf = (name) => heard[name].map((m) => JSON.parse(m)).filter((m) => m.t === 'view').at(-1)?.view ?? {};
  const panel = host.locator('.panel [data-partner-panel]');
  const row = (n) => panel.locator(`[data-card="${n}"]`).first();
  /** 📱 › the phones list › “Move <name> to another team” › `team`. */
  const move = async (name, team) => {
    await host.getByRole('button', { name: /^📱 \d/ }).click();
    await host.getByLabel(`Move ${name} to another team`).selectOption({ label: team });
    await host.getByRole('button', { name: 'Close the phones list' }).click();
  };

  // ---------- PARTNER UP!: Red picked it, Green is the partner (Green describes, Red guesses) ----------
  await host.keyboard.press('p');
  await host.keyboard.press('1');
  await host.locator('.stage-box .tile[aria-label^="Movies for $200"]').click();
  await panel.getByText('Red picked it.').waitFor();
  await host.keyboard.press('2');
  assert((await says(al, '🤝 Your team plays this one!')) && (await says(gus, '🤝 Your team plays this one!')) && (await says(bea, '🤝 Red + Green')), 'paired: Red’s and Green’s phones “🤝 Your team plays this one!”, Blue’s “🤝 Red + Green”');
  // Bo moves onto Green before anything is sent.
  await move('Bo', 'Green');
  await bo.locator('#me').getByText('Bo · Green').waitFor();
  await offStream('PARTNER UP!');
  await mainButton(host).click();
  await host.locator('.stage-box [data-partner-badge]').waitFor();
  assert((await mainLabel(host)) === '📤 Send and start', 'the question up: 📤 Send and start');
  assert(
    (await panel.getByRole('button', { name: 'Card 1 to Green', exact: true }).getAttribute('aria-pressed')) === 'true' && (await panel.getByRole('button', { name: 'Card 2 to Blue', exact: true }).getAttribute('aria-pressed')) === 'true',
    'card 1 goes to Green (the describing team), card 2 to Blue (everyone else)',
  );
  await sleep(300);
  assert(!JSON.stringify(states).includes('"cards"') && !JSON.stringify(heard).includes('qkzvt'), 'nothing of a card in the room’s state or on a phone before the send');
  await offStream('the question up');

  // ---------- 📤 Send and start ----------
  await mainButton(host).click();
  await host.locator('.stage-box .timer').waitFor();
  assert(await until(() => sendOf('c1')[0]?.media?.[0]?.file && sendOf('c2').length === 1), 'sent: the room’s state holds both cards, card 1’s picture up');
  const seat = Object.fromEntries(last().seats.map((x) => [x.name, x.id]));
  const s1 = sendOf('c1')[0];
  const pic = s1.media[0].file;
  assert(JSON.stringify(s1.to) === JSON.stringify([{ seat: seat.Green }]) && JSON.stringify(sendOf('c2')[0].to) === JSON.stringify([{ seat: seat.Blue }]), 'card 1 to the Green team, card 2 to the Blue team');
  for (const [p, name] of [[gus, 'Gus'], [bo, 'Bo (moved onto Green before the send)']]) {
    await p.getByRole('button', { name: 'Tap to see' }).waitFor();
    assert((await p.locator('.card-head').textContent()) === '🤫 Only your team can see this', `${name}: card 1, “🤫 Only your team can see this”`);
  }
  assert((await says(al, '🎯 Your team is guessing!')) && !(await al.locator('.card').count()) && (await al.locator('#buzz').getAttribute('aria-disabled')) === 'true', 'Al (Red, guessing): no card, his button greyed, “🎯 Your team is guessing!”');
  await bea.getByRole('button', { name: 'Tap to see' }).waitFor();
  assert(!heard.Al.join('').includes('qkzvt') && !heard.Bea.join('').includes('Kelp-qkzvt') && !heard.Gus.join('').includes('Reef-qkzvt'), 'each phone only ever heard its own team’s card');
  await gus.getByRole('button', { name: 'Tap to see' }).tap();
  await gus.getByText(WORDS1).waitFor();
  await gus.waitForFunction(() => {
    const img = document.querySelector('.card img');
    return !!img && img.src.startsWith('blob:') && img.complete && img.naturalWidth === 640;
  });
  assert(true, 'Gus opens it: its words and its picture');
  assert(await until(async () => (await textOf(row(1).locator('[data-card-state]'))).includes('✓ seen')), 'the host’s row says ✓ seen');
  assert((await fetchAs(bo, pic)) === 200 && (await fetchAs(al, pic)) === 404 && (await fetchAs(bea, pic)) === 404, 'Bo can fetch its picture; Al and Bea can’t');
  await offStream('sent');

  // ---------- Gwen joins Green mid-clue; the host moves Bea onto Green ----------
  const gwen = await person('Gwen', 'Green');
  const lateLine = 'A card went to your team before this phone joined. Ask the host to send it again.';
  await gwen.locator('#cards-late').getByText(lateLine).waitFor();
  assert(!(await gwen.locator('.card').count()) && !heard.Gwen.join('').includes('qkzvt') && viewOf('Gwen').cards?.late === 1, 'Gwen joins Green mid-clue: nothing of the card, only a note that she missed one');
  assert((await fetchAs(gwen, pic)) === 404, 'and the room won’t give her its picture');
  await move('Bea', 'Green');
  await bea.locator('#me').getByText('Bea · Green').waitFor();
  await bea.locator('#cards-late').getByText(lateLine).waitFor();
  assert(!(await bea.locator('.card').count()) && !heard.Bea.join('').includes('Kelp-qkzvt'), 'Bea moved onto Green after the send: Blue’s card goes from her phone, and she doesn’t get Green’s');
  assert((await fetchAs(bea, pic)) === 404, 'nor its picture');
  assert((await gus.locator('.card').count()) === 1 && (await bo.locator('.card').count()) === 1, 'Gus and Bo keep theirs');
  await offStream('a phone joined, someone moved');

  // ---------- ↻ Send again: the whole team now ----------
  await row(1).getByRole('button', { name: 'Send card 1 again' }).click();
  await gwen.getByRole('button', { name: 'Tap to see' }).waitFor();
  await bea.getByRole('button', { name: 'Tap to see' }).waitFor();
  assert(true, '↻ Send again: Gwen and Bea get card 1');
  const again = sendOf('c1');
  assert(again.length === 1 && again[0].id !== s1.id && JSON.stringify(again[0].to) === JSON.stringify([{ seat: seat.Green }]), 'under a new id, to the Green team');
  assert((await fetchAs(gwen, pic)) === 200 && (await fetchAs(bea, pic)) === 200 && !(await gwen.locator('#cards-late').isVisible()), 'they can fetch its picture now, and the note is gone');
  assert(await until(async () => (await gus.locator('.card').count()) === 1 && (await bo.locator('.card').count()) === 1), 'Gus and Bo have it too (once each)');
  await offStream('sent again');

  // ---------- Judged, the answer, back to the board ----------
  await panel.getByRole('button', { name: /✔ Got it/ }).click();
  await panel.locator('[data-judged]').waitFor();
  assert(await says(al, '✔ Got it! Green +$200 · Red +$100'), 'judged: “✔ Got it! Green +$200 · Red +$100”');
  await host.keyboard.press('r');
  await host.keyboard.press('Escape');
  assert(await until(() => !last()?.cards), 'back on the board: no card in the room’s state');
  for (const [p, name] of [[gus, 'Gus'], [bo, 'Bo'], [gwen, 'Gwen'], [bea, 'Bea']]) assert(await until(async () => !(await p.locator('.card').count())), `${name}’s phone drops it`);
  await offStream('the whole clue');

  assert(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  console.log('Partner cards on team phones E2E passed.');
} catch (e) {
  for (const [label, p] of pages) await p.screenshot({ path: `test-results/partnerteams-${label}-failure.png` }).catch(() => {});
  console.error(e);
  if (errors.length) console.error('page errors:', errors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  buzzer.stop();
}
