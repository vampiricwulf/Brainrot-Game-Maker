// What card files cost the buzzer server (README.md, "Card files": the measurement before raising FILE_MAX_BYTES).
// It opens a room with a host and one phone, then for each size uploads a file as the host and fetches it as the phone,
// each request in a minute of its own (15 s past it, as the dashboard's charts count by the minute) and labelled in its
// address (?measure=up-4MB-1), so it can be found in `wrangler tail` or the dashboard's logs. The room is closed at the
// end. Each run uses its sizes' worth of the server's daily budget.
//
//   node measure-files.mjs <server> [--sizes 1,2,3,4] [--runs 1] [--gap <seconds>] [--tail [worker-name]]
//
// --gap waits that long between requests instead of a minute each (for `wrangler tail`, which sees every request).
//
// --tail also runs `npx wrangler tail <worker-name> --format json` (on a computer logged in to the account, from
// buzzer/) and prints each request's CPU time: the Worker's own, and the room's (its Durable Object) while it ran.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const server = args[0] && !args[0].startsWith('--') ? args[0].replace(/\/+$/, '') : null;
if (!server) {
  console.error('Usage: node measure-files.mjs <server> [--sizes 1,2,3,4] [--runs 2] [--gap 5] [--tail [worker-name]]');
  process.exit(1);
}
const sizes = String(opt('sizes', '1,2,3,4')).split(',').map(Number).filter((n) => n > 0);
const runs = Number(opt('runs', 1));
const gap = opt('gap', null) === null ? null : Number(opt('gap')) * 1000;
const tailName = opt('tail', null);
const MB = 1024 * 1024;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const clock = () => new Date().toISOString().slice(11, 23);
/** Waits `gap`, or else until 15 s past the next minute (a minute of its own for the request that follows). */
const turn = () => sleep(gap ?? 60_000 - ((Date.now() - 15_000) % 60_000));

/** `wrangler tail`'s events (one JSON object each), as they come. */
const events = [];
let tail = null;
if (tailName) {
  const name = tailName === true ? 'brainrot-buzzer' : tailName;
  tail = spawn('npx', ['wrangler', 'tail', name, '--format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let buf = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  // (Objects may span lines: they're split by their braces, outside strings.)
  tail.stdout.on('data', (d) => {
    buf += d;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') {
        if (depth++ === 0) start = i;
      } else if (c === '}' && --depth === 0) {
        try {
          events.push(JSON.parse(buf.slice(start, i + 1)));
        } catch {}
        buf = buf.slice(i + 1);
        i = -1;
      }
    }
    if (depth === 0) buf = '';
  });
  let said = '';
  tail.stderr.on('data', (d) => (said += d));
  console.log(`wrangler tail ${name}: connecting…`);
  // (It says nothing on stdout until the first event: give it time to connect.)
  await sleep(8000);
  if (tail.exitCode !== null) {
    console.error(`wrangler tail stopped: ${said.trim()}`);
    process.exit(1);
  }
}

const label = (what) => `measure=${what}`;
const post = (path, body, headers = {}) => fetch(`${server}${path}`, { method: 'POST', headers, body });

// The room, its host, and a phone on its only seat.
const made = await (await post(`/api/rooms?${label('room')}`)).json();
if (!made.code) throw new Error(`no room: ${JSON.stringify(made)}`);
console.log(`${clock()} room ${made.code}: ${sizes.length * runs * 2} requests${gap === null ? ', one a minute at :15 (UTC)' : ''}`);
const wsBase = server.replace(/^http/, 'ws');
function socket(url) {
  const ws = new WebSocket(url);
  const heard = [];
  ws.addEventListener('message', (e) => heard.push(JSON.parse(e.data)));
  const until = async (pred, what, ms = 15000) => {
    for (const end = Date.now() + ms; !heard.some(pred); await sleep(25)) if (Date.now() > end) throw new Error(`never: ${what}`);
    return heard.findLast(pred);
  };
  return { ws, heard, until, opened: new Promise((ok, fail) => (ws.addEventListener('open', ok, { once: true }), ws.addEventListener('error', () => fail(new Error(`socket failed: ${url}`)), { once: true }))) };
}
const host = socket(`${wsBase}/ws/${made.code}?host=${encodeURIComponent(made.hostToken)}&${label('host')}`);
await host.opened;
const welcome = await host.until((m) => m.t === 'welcome', 'welcome');
if (!welcome.features?.includes('files')) throw new Error(`the server isn't taking card files (${welcome.features?.join(', ')})`);
let state = { title: 'Measure', seats: [{ id: 'a', name: 'Phone', color: '#30a46c' }], allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 0, scores: {} };
const send = (patch) => host.ws.send(JSON.stringify({ t: 'state', state: (state = { ...state, ...patch }) }));
send({});
const phone = socket(`${wsBase}/ws/${made.code}?${label('phone')}`);
await phone.opened;
await phone.until((m) => m.t === 'seats', 'the seats');
phone.ws.send(JSON.stringify({ t: 'join', seatId: 'a' }));
const { token } = await phone.until((m) => m.t === 'joined', 'the phone takes its seat');

const rows = [];
let n = 0;
try {
  for (let run = 1; run <= runs; run++)
    for (const mb of sizes) {
      await turn();
      const bytes = randomBytes(Math.round(mb * MB));
      const hash = createHash('sha256').update(bytes).digest('hex');
      const tag = `${mb}MB-${run}`;
      let t = performance.now();
      const at = clock();
      const up = await post(`/api/rooms/${made.code}/files?${label(`up-${tag}`)}`, bytes, { 'Content-Type': 'video/mp4', Authorization: `Bearer ${made.hostToken}` });
      const answer = await up.json().catch(() => ({}));
      rows.push({ label: `up-${tag}`, at, status: up.status, ms: performance.now() - t, note: answer.error ?? (answer.id === hash ? '' : 'wrong id') });
      console.log(`${at} up-${tag}: ${up.status}`);
      if (up.status !== 200) continue;
      // The phone gets a card with it, fetches it, then the card goes and the room forgets the file (room for the next).
      send({ cards: [{ id: `pc:m:1:${++n}`, to: [{ seat: 'a' }], open: true, text: 'Measure', media: [{ kind: 'video', file: hash, mime: 'video/mp4' }] }] });
      await phone.until((m) => m.t === 'view' && m.view.cards?.list?.[0]?.media?.[0]?.file === hash, 'the card on the phone');
      await turn();
      t = performance.now();
      const at2 = clock();
      const down = await fetch(`${server}/api/rooms/${made.code}/files/${hash}?${label(`down-${tag}`)}`, { headers: { Authorization: `Bearer ${token}` } });
      const got = Buffer.from(await down.arrayBuffer());
      rows.push({ label: `down-${tag}`, at: at2, status: down.status, ms: performance.now() - t, note: down.status !== 200 ? '' : createHash('sha256').update(got).digest('hex') === hash ? '' : 'different bytes' });
      console.log(`${at2} down-${tag}: ${down.status}`);
      send({ cards: null });
      host.ws.send(JSON.stringify({ t: 'forget', files: [hash] }));
    }
} finally {
  host.ws.send(JSON.stringify({ t: 'close' }));
  await sleep(500);
  host.ws.close();
  phone.ws.close();
}

// Each labelled request, with what `wrangler tail` saw of it: the Worker's own invocation (its address carries the
// label), and the room's Durable Object invocations while it ran (upload, download, isHost…).
if (tail) {
  await sleep(10000);
  process.kill(-tail.pid, 'SIGTERM');
}
const worker = (e) => e.event?.request?.url ?? '';
for (const r of rows) {
  const w = events.find((e) => worker(e).includes(`${label(r.label)}`));
  if (w) {
    const from = w.eventTimestamp;
    const to = from + (w.wallTime ?? 0) + 50;
    const inside = events.filter((e) => e !== w && !worker(e) && e.eventTimestamp >= from && e.eventTimestamp <= to);
    r.workerCpu = w.cpuTime;
    r.workerWall = w.wallTime;
    r.roomCpu = inside.map((e) => `${e.event?.rpcMethod ?? e.entrypoint ?? '?'} ${e.cpuTime}`).join(', ');
    r.outcome = [w.outcome, ...inside.map((e) => e.outcome)].filter((o) => o !== 'ok').join(', ') || 'ok';
  }
}
const fmt = (x) => (typeof x === 'number' ? x.toFixed(x < 10 ? 2 : 0) : (x ?? ''));
console.log(`\n${['request', 'at (UTC)', 'status', 'took ms', ...(tail ? ['Worker CPU ms', 'Worker wall ms', 'room CPU ms', 'outcome'] : []), 'note'].join('\t')}`);
for (const r of rows) console.log([r.label, r.at, r.status, fmt(r.ms), ...(tail ? [fmt(r.workerCpu), fmt(r.workerWall), r.roomCpu ?? '', r.outcome ?? 'not seen'] : []), r.note].join('\t'));
if (tail) {
  const bad = events.filter((e) => e.outcome && e.outcome !== 'ok' && e.outcome !== 'canceled');
  if (bad.length) console.log(`\nNot ok: ${bad.map((e) => `${e.outcome} (${worker(e) || e.event?.rpcMethod || e.entrypoint})`).join('; ')}`);
}
process.exit(0);
