// What card files cost the buzzer server (README.md, "Card files": the measurement before raising FILE_MB).
// It opens a room with a host and one phone, then for each size uploads a file as the host and fetches it as the phone,
// each request in a minute of its own (15 s past it, as the dashboard's charts count by the minute), printing when each
// went. The room is closed at the end. Each run uses its sizes' worth of the server's budget (it says how much).
//
//   node measure-files.mjs <server> [--sizes 16,48,90] [--runs 1] [--gap <seconds>] [--analytics [account-id]]
//
// --gap waits that long between requests instead of a minute each (for Workers Logs or --analytics, which see every
// request).
// --analytics then reads each request's CPU time from Cloudflare's analytics (GraphQL): the Worker's, and the room's
// (its Durable Object's) in the same second. It needs an API token with Account Analytics Read in CLOUDFLARE_API_TOKEN
// (or added to the requests on the way, as a proxy can), and the account id here or in CLOUDFLARE_ACCOUNT_ID. --name
// names the Worker (brainrot-buzzer).
import { createHash, randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const server = args[0] && !args[0].startsWith('--') ? args[0].replace(/\/+$/, '') : null;
if (!server) {
  console.error('Usage: node measure-files.mjs <server> [--sizes 16,48,90] [--runs 1] [--gap <seconds>] [--analytics [account-id]] [--name <worker>]');
  process.exit(1);
}
const sizes = String(opt('sizes', '16,48,90')).split(',').map(Number).filter((n) => n > 0);
const runs = Number(opt('runs', 1));
const gap = opt('gap', null) === null ? null : Number(opt('gap')) * 1000;
const analytics = opt('analytics', null);
const account = analytics === true ? process.env.CLOUDFLARE_ACCOUNT_ID : analytics;
const script = opt('name', 'brainrot-buzzer');
if (analytics && !account) {
  console.error('--analytics needs the account id (or CLOUDFLARE_ACCOUNT_ID)');
  process.exit(1);
}
const MB = 1024 * 1024;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const clock = () => new Date().toISOString().slice(11, 23);
/** Waits `gap`, or else until 15 s past the next minute (a minute of its own for the request that follows). */
const turn = () => sleep(gap ?? 60_000 - ((Date.now() - 15_000) % 60_000));

const post = (path, body, headers = {}) => fetch(`${server}${path}`, { method: 'POST', headers, body });

// The room, its host, and a phone on its only seat.
const made = await (await post('/api/rooms')).json();
if (!made.code) throw new Error(`no room: ${JSON.stringify(made)}`);
console.log(`${clock()} room ${made.code}: ${sizes.length * runs * 2} requests${gap === null ? ', one a minute at :15 (UTC)' : ''}`);
// (What the uploads take from the server's budget, counted for 24 hours: one address may use a quarter of it.)
const takes = sizes.reduce((n, mb) => n + mb, 0) * runs;
console.log(`${clock()} the uploads take up to ${takes.toLocaleString('en-US')} MB of the server's card file budget (FILES_MB_PER_DAY) for the next 24 hours`);
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
const host = socket(`${wsBase}/ws/${made.code}?host=${encodeURIComponent(made.hostToken)}`);
await host.opened;
const welcome = await host.until((m) => m.t === 'welcome', 'welcome');
if (!welcome.features?.includes('files')) throw new Error(`the server isn't taking card files (${welcome.features?.join(', ')})`);
let state = { title: 'Measure', seats: [{ id: 'a', name: 'Phone', color: '#30a46c' }], allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 0, scores: {} };
const send = (patch) => host.ws.send(JSON.stringify({ t: 'state', state: (state = { ...state, ...patch }) }));
send({});
const phone = socket(`${wsBase}/ws/${made.code}`);
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
      let at = new Date();
      // (A body over the plan's limit is turned away by Cloudflare before the Worker: the connection just drops.)
      const up = await post(`/api/rooms/${made.code}/files`, bytes, { 'Content-Type': 'video/mp4', Authorization: `Bearer ${made.hostToken}` }).catch((e) => ({
        status: 0,
        json: async () => ({ error: `no answer (${e.cause?.code ?? e.message}): Cloudflare may have turned it away` }),
      }));
      const answer = await up.json().catch(() => ({}));
      rows.push({ label: `up-${tag}`, at, status: up.status, ms: performance.now() - t, note: answer.error ?? (answer.id === hash ? '' : 'wrong id') });
      console.log(`${clock()} up-${tag}: ${up.status}`);
      if (up.status !== 200) continue;
      // The phone gets a card with it, fetches it, then the card goes and the room forgets the file (room for the next).
      send({ cards: [{ id: `pc:m:1:${++n}`, to: [{ seat: 'a' }], open: true, text: 'Measure', media: [{ kind: 'video', file: hash, mime: 'video/mp4' }] }] });
      await phone.until((m) => m.t === 'view' && m.view.cards?.list?.[0]?.media?.[0]?.file === hash, 'the card on the phone');
      await turn();
      t = performance.now();
      at = new Date();
      const down = await fetch(`${server}/api/rooms/${made.code}/files/${hash}`, { headers: { Authorization: `Bearer ${token}` } });
      const got = Buffer.from(await down.arrayBuffer());
      rows.push({ label: `down-${tag}`, at, status: down.status, ms: performance.now() - t, note: down.status !== 200 ? '' : createHash('sha256').update(got).digest('hex') === hash ? '' : 'different bytes' });
      console.log(`${clock()} down-${tag}: ${down.status}`);
      send({ cards: null });
      host.ws.send(JSON.stringify({ t: 'forget', files: [hash] }));
    }
} finally {
  host.ws.send(JSON.stringify({ t: 'close' }));
  await sleep(500);
  host.ws.close();
  phone.ws.close();
}

const fmt = (x) => (typeof x === 'number' ? x.toFixed(x < 10 ? 2 : 0) : (x ?? ''));
const head = ['request', 'at (UTC)', 'status', 'took ms'];
if (!analytics) {
  console.log(`\n${[...head, 'note'].join('\t')}`);
  for (const r of rows) console.log([r.label, r.at.toISOString().slice(11, 23), r.status, fmt(r.ms), r.note].join('\t'));
  process.exit(0);
}

// Each request's CPU time from Cloudflare's analytics, by the second it began in: the Worker's request, and the calls
// the room took then (the upload's includes the host check; the room is the class with WebSocket calls, the other the
// daily counter). They show up a few minutes late: it waits for the last one.
const gql = async (query) => {
  const key = process.env.CLOUDFLARE_API_TOKEN;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ query }),
  });
  const json = await r.json();
  if (json.errors?.length) throw new Error(`Cloudflare analytics: ${JSON.stringify(json.errors)}`);
  return json.data.viewer.accounts[0];
};
const span = `scriptName: "${script}", datetime_geq: "${new Date(+rows[0].at - 5000).toISOString()}", datetime_leq: "${new Date(+rows.at(-1).at + 30000).toISOString()}"`;
const query = `{ viewer { accounts(filter: {accountTag: "${account}"}) {
  workersInvocationsAdaptive(limit: 2000, filter: {${span}}) { dimensions { datetime status } max { cpuTime } }
  durableObjectsInvocationsAdaptiveGroups(limit: 2000, filter: {${span}}) { dimensions { datetime type namespaceId status } quantiles { cpuTimeP999 } } } } }`;
const second = (d) => Math.floor(Date.parse(d) / 1000);
const last = Math.floor(+rows.at(-1).at / 1000);
console.log(`${clock()} waiting for Cloudflare's analytics to show the last request…`);
let data;
for (const end = Date.now() + 10 * 60_000; ; await sleep(15_000)) {
  data = await gql(query);
  if (data.workersInvocationsAdaptive.some((w) => second(w.dimensions.datetime) >= last)) break;
  if (Date.now() > end) throw new Error('the analytics never showed the last request');
}
const calls = data.durableObjectsInvocationsAdaptiveGroups;
const roomNs = calls.find((c) => c.dimensions.type === 'hibernation')?.dimensions.namespaceId;
const near = (list, at) => list.filter((x) => Math.abs(second(x.dimensions.datetime) - Math.floor(+at / 1000)) <= 1);
const most = (list, cpu) => (list.length ? Math.max(...list.map(cpu)) / 1000 : undefined);
console.log(`\n${[...head, 'Worker CPU ms', 'room CPU ms', 'counter CPU ms', 'not ok', 'note'].join('\t')}`);
for (const r of rows) {
  const w = near(data.workersInvocationsAdaptive, r.at);
  const c = near(calls, r.at).filter((x) => x.dimensions.type !== 'hibernation');
  const room = c.filter((x) => x.dimensions.namespaceId === roomNs);
  const bad = [...w, ...c].map((x) => x.dimensions.status).filter((s) => s !== 'success');
  const counter = c.filter((x) => !room.includes(x));
  console.log(
    [r.label, r.at.toISOString().slice(11, 23), r.status, fmt(r.ms), fmt(most(w, (x) => x.max.cpuTime)), fmt(most(room, (x) => x.quantiles.cpuTimeP999)), fmt(most(counter, (x) => x.quantiles.cpuTimeP999)), bad.join(','), r.note].join(
      '\t',
    ),
  );
}
process.exit(0);
