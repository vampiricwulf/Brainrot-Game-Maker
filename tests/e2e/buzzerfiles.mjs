// 🤫 Card files on the buzzer server, a piece at a time (buzzer/src/filestore.ts), end to end: the room (buzzer/) under
// `wrangler dev` (local), a fake host and phones on plain sockets, and what the room stored read from its SQLite files
// (helpers.mjs roomKeys). An upload cut off by the host closing the room, by the server stopping (a deploy, a crash)
// or by the uploader leaves nothing stored, and a new upload works after; a full room's answer reaches the uploader;
// a download carries its Content-Length, and one whose file is deleted partway (the host took its card back) ends
// short, with an error; downloads a phone stopped partway don't keep the room from sending more. Needs `npm ci` in
// buzzer/.
import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { roomKeys, startBuzzer } from './helpers.mjs';

const MB = 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  console.log('  ✓ ' + msg);
}
/** Waits (up to `ms`) until pred() holds; its value. */
async function until(pred, what, ms = 10_000) {
  for (const end = Date.now() + ms; ; await sleep(50)) {
    const v = await pred();
    if (v) return v;
    if (Date.now() > end) throw new Error('never: ' + what);
  }
}
/** The card file pieces stored now, in every room. */
const pieces = async () => (await roomKeys(buzzer.persist)).filter((k) => /^(p|file):/.test(k));

const buzzer = await startBuzzer('buzzer-files-');
const { base } = buzzer;
const ws = base.replace(/^http/, 'ws');

/** A socket and everything it heard. */
async function socket(url) {
  const s = new WebSocket(url);
  const heard = [];
  s.addEventListener('message', (e) => heard.push(JSON.parse(e.data)));
  await new Promise((ok, fail) => {
    s.addEventListener('open', ok, { once: true });
    s.addEventListener('error', () => fail(new Error('socket failed: ' + url)), { once: true });
  });
  return { s, heard, send: (m) => s.send(JSON.stringify(m)), last: (t) => heard.filter((m) => m.t === t).at(-1) };
}

/** A new room with its host connected and one seat: the host, a phone seated on it, and what they can do with files. */
async function newRoom(ip) {
  const made = await (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'CF-Connecting-IP': ip } })).json();
  const host = await socket(`${ws}/ws/${made.code}?host=${encodeURIComponent(made.hostToken)}`);
  await until(() => host.last('welcome'), 'the welcome');
  assert(host.last('welcome').features.includes('files'), `room ${made.code} takes card files`);
  let st = { title: 'Files', seats: [{ id: 'a', name: 'Ann', color: '#e5484d' }], allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 0, scores: {} };
  const state = (patch) => host.send({ t: 'state', state: (st = { ...st, ...patch }) });
  state({});
  const url = (id) => `${base}/api/rooms/${made.code}/files${id ? `/${id}` : ''}`;
  const upload = (body, extra = {}) =>
    fetch(url(), { method: 'POST', headers: { 'Content-Type': 'video/mp4', Authorization: `Bearer ${made.hostToken}` }, body, ...extra });
  /**
   * An upload that gives `bytes` slowly, 256 KB at a time, and stops after `holdAt` bytes until go(): its answer
   * (or the error that cut it off), and when it got there.
   */
  const slowUpload = (bytes, holdAt) => {
    let sent = 0;
    let go;
    const held = new Promise((ok) => (go = ok));
    let reached;
    const at = new Promise((ok) => (reached = ok));
    const body = new ReadableStream({
      async pull(c) {
        if (sent >= holdAt) {
          reached();
          await held;
        }
        if (sent >= bytes.length) return c.close();
        await sleep(10);
        c.enqueue(bytes.subarray(sent, (sent += 256 * 1024)));
      },
    });
    const answer = upload(body, { duplex: 'half' }).then(
      (r) => r,
      (e) => e,
    );
    return { answer, at, go: () => go() };
  };
  const phone = await socket(`${ws}/ws/${made.code}`);
  await until(() => phone.last('seats'), 'the phone sees the seats');
  phone.send({ t: 'join', seatId: 'a' });
  const joined = await until(() => phone.last('joined'), 'the phone takes its seat');
  /** An upload that says it's twice as long as `bytes`, sends them, and waits: its connection, to drop as a closed tab would. */
  const halfUpload = (bytes) => {
    const req = request(url(), { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(2 * bytes.length), Authorization: `Bearer ${made.hostToken}` } });
    req.on('error', () => {});
    req.write(bytes);
    return req;
  };
  const get = (id, extra = {}) => fetch(url(id), { headers: { Authorization: `Bearer ${joined.token}` }, ...extra });
  /**
   * A download that reads nothing until told (its socket paused from the start, so the bytes on their way are what
   * fits in the network's buffers): its answer, and rest(), which reads the rest and says how many bytes came in all
   * and whether it came whole.
   */
  const heldGet = (id) =>
    new Promise((ok, fail) => {
      const req = request(url(id), { headers: { Authorization: `Bearer ${joined.token}` } }, (res) => {
        res.pause();
        const rest = () =>
          new Promise((done) => {
            let got = 0;
            res.on('data', (b) => (got += b.length));
            res.on('error', () => {});
            res.on('close', () => done({ got, whole: res.complete }));
            res.resume();
          });
        ok({ res, rest });
      });
      req.on('error', fail);
      req.end();
    });
  return { made, host, phone, state, upload, slowUpload, halfUpload, get, heldGet, token: joined.token };
}

try {
  // ---------- The host closes the room mid-upload ----------
  {
    const r = await newRoom('198.51.100.60');
    assert(!(await pieces()).length, '(nothing stored yet)');
    const up = r.slowUpload(randomBytes(4 * MB), 2 * MB);
    await up.at;
    await until(async () => (await pieces()).filter((k) => k.startsWith('p:')).length >= 1, 'pieces stored mid-upload');
    assert(true, 'an upload is stored a piece at a time as it comes, under a key of its own (p:…)');
    r.host.send({ t: 'close' });
    const answer = await up.answer;
    up.go();
    assert(answer instanceof Error || answer.status === 401, `the room closed mid-upload: the upload is turned away (${answer.status ?? answer.message})`);
    await until(async () => !(await pieces()).length, 'its pieces gone');
    assert(true, 'and nothing of it is left stored');
  }

  // ---------- The server stops mid-upload (a deploy, a crash) ----------
  {
    const r = await newRoom('198.51.100.61');
    const up = r.slowUpload(randomBytes(4 * MB), 2 * MB);
    await up.at;
    await until(async () => (await pieces()).length >= 1, 'pieces stored mid-upload');
    await buzzer.restart();
    up.go();
    const answer = await up.answer;
    assert(answer instanceof Error || answer.status >= 500, `the server stopped mid-upload: the upload didn't get through (${answer.status ?? answer.message})`);
    // The host comes back: the room starts again from its storage, and deletes what the upload left.
    const host = await socket(`${ws}/ws/${r.made.code}?host=${encodeURIComponent(r.made.hostToken)}`);
    await until(() => host.last('welcome'), 'the welcome after the restart');
    await until(async () => !(await pieces()).length, 'the pieces it left deleted');
    const files = await until(() => host.last('files'), 'the files list');
    assert(!files.ids.length, 'the room started again deletes what the cut-off upload stored, and doesn’t list it');
    const bytes = randomBytes(2.5 * MB);
    const again = await r.upload(bytes);
    assert(again.status === 200 && (await again.json()).id === createHash('sha256').update(bytes).digest('hex'), 'and a new upload works');
    const stored = await pieces();
    assert(stored.length === 3 && new Set(stored.map((k) => k.split(':').slice(0, 2).join(':'))).size === 1, `its 3 pieces under one prefix (${stored.join(', ')})`);
    host.send({ t: 'close' });
    await until(async () => !(await pieces()).length, 'the room’s files gone with it');
  }

  // ---------- The uploader goes partway (a closed tab, a dropped line) ----------
  {
    const r = await newRoom('198.51.100.64');
    const up = r.halfUpload(randomBytes(2 * MB));
    await until(async () => (await pieces()).length >= 1, 'pieces stored mid-upload');
    up.destroy();
    await until(async () => !(await pieces()).length, 'its pieces deleted');
    assert(true, 'an upload whose connection drops partway: the room deletes what it stored of it');
    const bytes = randomBytes(MB);
    assert((await r.upload(bytes)).status === 200 && (await pieces()).length === 1, 'and takes the next one');
    r.host.send({ t: 'close' });
    await until(async () => !(await pieces()).length, 'the room’s files gone with it');
  }

  // ---------- A full room ----------
  {
    const r = await newRoom('198.51.100.63');
    for (let i = 0; i < 4; i++) assert((await r.upload(randomBytes(16 * MB))).status === 200, `16 MB file ${i + 1} of 4 stored`);
    // Turned away before a byte of it is stored: the room reads the rest and throws it away, so the answer gets there
    // (stopped mid-upload, the uploader can get only a broken connection).
    const full = await r.upload(randomBytes(10 * MB));
    const said = await full.json().catch(() => null);
    assert(full.status === 409 && said?.error === 'This room holds all the card files it can: send fewer pictures and videos at once', `a room holding 64 MB turns a 10 MB file away, and the uploader reads why (${full.status} ${JSON.stringify(said)})`);
    r.host.send({ t: 'close' });
    await until(async () => !(await pieces()).length, 'the room’s files gone with it');
  }

  // ---------- Downloads ----------
  {
    const r = await newRoom('198.51.100.62');
    const bytes = randomBytes(16 * MB);
    const id = (await (await r.upload(bytes)).json()).id;
    r.state({ cards: [{ id: 'pc:c1:1:1', to: [{ seat: 'a' }], open: true, text: 'SHREK', media: [{ kind: 'video', file: id, mime: 'video/mp4' }] }] });
    await until(() => r.phone.last('view')?.view.cards?.list[0]?.media?.[0]?.file === id, 'the phone gets the card');
    const whole = await r.get(id);
    const back = Buffer.from(await whole.arrayBuffer());
    assert(
      whole.status === 200 && whole.headers.get('content-length') === String(bytes.length) && back.equals(bytes),
      `a phone fetches a 16 MB file whole, with its Content-Length (${whole.headers.get('content-length')})`,
    );
    assert(whole.headers.get('cache-control') === 'no-store, no-transform', 'never stored on the way, nor compressed (which would drop its length)');

    // Phones that stop partway (gone from the room, a card taken back) don't keep the room from sending more: more of
    // them than the room sends at once, each read a little and let go.
    for (let i = 0; i < 26; i++) {
      const ctrl = new AbortController();
      const res = await r.get(id, { signal: ctrl.signal });
      await res.body.getReader().read();
      ctrl.abort();
    }
    const after = await Promise.race([r.get(id).then((x) => x.arrayBuffer()), sleep(20_000).then(() => null)]);
    assert(after?.byteLength === bytes.length, 'downloads stopped partway free their place: the next one comes whole');

    // Deleted partway: the host takes the card back and is done with its file while a phone is still reading it. (The
    // room reads a piece as the line takes it: here the line holds about 10 MB with nothing read, so 16 MB is enough.)
    const going = await r.heldGet(id);
    const total = Number(going.res.headers['content-length']);
    r.state({ cards: null });
    r.host.send({ t: 'forget', files: [id] });
    await until(async () => !(await pieces()).length, 'its pieces deleted');
    const cut = await going.rest();
    assert(!cut.whole && cut.got < total, `a file deleted while a phone fetches it: the download ends short of its Content-Length, broken off (${cut.got} of ${total} bytes)`);
    assert((await r.get(id)).status === 404, 'and the next try gets 404');
    r.host.send({ t: 'close' });
  }

  console.log('Buzzer files E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  buzzer.stop();
}
