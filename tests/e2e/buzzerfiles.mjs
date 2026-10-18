// 🤫 Card files on the buzzer server, a piece at a time (buzzer/src/filestore.ts), end to end: the room (buzzer/) under
// `wrangler dev` (local), a fake host and phones on plain sockets, and what the room stored read from its SQLite files
// (helpers.mjs roomKeys). An upload cut off by the host closing the room, by the server stopping (a deploy, a crash)
// or by the uploader leaves nothing stored, and a new upload works after; a full room's answer reaches the uploader;
// a download carries its Content-Length, and one whose file is deleted partway (the host took its card back) ends
// short, with an error; downloads a phone stopped partway don't keep the room from sending more, and one phone can't
// hold more than 4 places. Then a server with limits of its own (FILE_MB, ROOM_FILES_MB, FILES_MB_PER_DAY): it says
// them, holds to them, and gives back what an upload kept for itself and didn't store. Needs `npm ci` in buzzer/.
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

// (16 MB a file and 64 MB a room, what older servers took, whatever wrangler.jsonc says: a full room is four 16 MB files.)
const buzzer = await startBuzzer('buzzer-files-', { vars: { FILE_MB: 16, ROOM_FILES_MB: 64 } });
const { base } = buzzer;
const ws = base.replace(/^http/, 'ws');
/** The server with limits of its own (started once the first is done). */
let small;

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

/**
 * A new room (on the server at `at`) with its host connected and one seat: the host, a phone seated on it, and what
 * they can do with files.
 */
async function newRoom(ip, at = base) {
  const ws = at.replace(/^http/, 'ws');
  const made = await (await fetch(`${at}/api/rooms`, { method: 'POST', headers: { 'CF-Connecting-IP': ip } })).json();
  const host = await socket(`${ws}/ws/${made.code}?host=${encodeURIComponent(made.hostToken)}`);
  await until(() => host.last('welcome'), 'the welcome');
  assert(host.last('welcome').features.includes('files'), `room ${made.code} takes card files`);
  let st = { title: 'Files', seats: [{ id: 'a', name: 'Ann', color: '#e5484d' }], allowNew: false, phase: 'lobby', armId: 0, clue: null, answering: null, lockedOut: [], earlyLockMs: 0, scores: {} };
  const state = (patch) => host.send({ t: 'state', state: (st = { ...st, ...patch }) });
  state({});
  const url = (id) => `${at}/api/rooms/${made.code}/files${id ? `/${id}` : ''}`;
  /** An upload (`from`: the address it comes from, which the server's budget counts by). */
  const upload = (body, { from, ...extra } = {}) =>
    fetch(url(), { method: 'POST', headers: { 'Content-Type': 'video/mp4', Authorization: `Bearer ${made.hostToken}`, ...(from ? { 'CF-Connecting-IP': from } : {}) }, body, ...extra });
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
  /**
   * An upload that says it's twice as long as `bytes`, sends them, and waits: its connection, to drop as a closed tab
   * (or ✖ Take back in the app) would.
   */
  const halfUpload = (bytes, from) => {
    const req = request(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(2 * bytes.length), Authorization: `Bearer ${made.hostToken}`, ...(from ? { 'CF-Connecting-IP': from } : {}) },
    });
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
    // them than the room sends at once, each read a little and let go. (One phone may have 4 going: a 429 until the
    // room hears the last ones were let go, which the phone page tries again too.)
    const turn = async (id, extra) => {
      for (const end = Date.now() + 20_000; ; await sleep(200)) {
        const res = await r.get(id, extra);
        if (res.status !== 429 || Date.now() > end) return res;
        await res.arrayBuffer();
      }
    };
    for (let i = 0; i < 26; i++) {
      const ctrl = new AbortController();
      const res = await turn(id, { signal: ctrl.signal });
      if (res.status !== 200) throw new Error(`download ${i + 1} of 26: ${res.status}`);
      await res.body.getReader().read();
      ctrl.abort();
    }
    const after = await Promise.race([turn(id).then((x) => x.arrayBuffer()), sleep(20_000).then(() => null)]);
    assert(after?.byteLength === bytes.length, 'downloads stopped partway free their place: the next one comes whole');

    // One phone can't hold the room's places: 4 of its downloads held unread, its 5th gets 429 at once.
    const heldTurn = async (id) => {
      for (const end = Date.now() + 20_000; ; await sleep(200)) {
        const g = await r.heldGet(id);
        if (g.res.statusCode !== 429 || Date.now() > end) return g;
        await g.rest();
      }
    };
    const four = [];
    for (let i = 0; i < 4; i++) four.push(await heldTurn(id));
    assert(four.every((g) => g.res.statusCode === 200), 'a phone has 4 downloads going, none of them read');
    const fifth = await Promise.race([r.get(id), sleep(10_000).then(() => null)]);
    const fifthSaid = await fifth?.json().catch(() => null);
    assert(fifth?.status === 429 && fifthSaid?.error === 'Too many files — wait a minute', `its 5th is turned away at once, to try again (${fifth?.status} ${JSON.stringify(fifthSaid)})`);
    const read = await Promise.all(four.map((g) => g.rest()));
    assert(read.every((x) => x.whole && x.got === bytes.length), 'the 4 come whole once read');
    const again = await r.get(id);
    assert(again.status === 200 && (await again.arrayBuffer()).byteLength === bytes.length, 'and once they’re done, the next one comes');

    // Deleted partway: the host takes the card back and is done with its file while a phone is still reading it. (The
    // room reads a piece as the line takes it: here the line holds about 10 MB with nothing read, so 16 MB is enough.)
    const going = await heldTurn(id);
    const total = Number(going.res.headers['content-length']);
    r.state({ cards: null });
    r.host.send({ t: 'forget', files: [id] });
    await until(async () => !(await pieces()).length, 'its pieces deleted');
    const cut = await going.rest();
    assert(!cut.whole && cut.got < total, `a file deleted while a phone fetches it: the download ends short of its Content-Length, broken off (${cut.got} of ${total} bytes)`);
    assert((await r.get(id)).status === 404, 'and the next try gets 404');
    r.host.send({ t: 'close' });
  }
  buzzer.stop();

  // ---------- A server with limits of its own: 4 MB a file, 12 MB a room, 24 MB a day (6 MB of it an address) ----------
  small = await startBuzzer('buzzer-files-small-', { vars: { FILE_MB: 4, ROOM_FILES_MB: 12, FILES_MB_PER_DAY: 24 } });
  {
    const limits = JSON.stringify({ fileBytes: 4 * MB, roomBytes: 12 * MB, roomFiles: 32 });
    const health = await (await fetch(`${small.base}/api/health`)).json();
    assert(JSON.stringify(health.files) === limits, `its /api/health says what card files it takes (${JSON.stringify(health.files)})`);
    const r = await newRoom('198.51.100.70', small.base);
    assert(JSON.stringify(r.host.last('welcome').limits) === limits, `and so does the host's welcome (${JSON.stringify(r.host.last('welcome').limits)})`);
    const big = await r.upload(randomBytes(4 * MB + 1), { from: '198.51.100.71' });
    const said = await big.json().catch(() => null);
    assert(big.status === 413 && said?.error === 'Too big for the buzzer server (4 MB at most)', `a file over 4 MB is turned away with its number (${big.status} ${JSON.stringify(said)})`);

    // An upload stopped partway gives back the room it kept: 8 MB held (on a card, so nothing makes room for another)…
    const held = [];
    for (const from of ['198.51.100.71', '198.51.100.72']) {
      const res = await r.upload(randomBytes(4 * MB), { from });
      if (res.status === 200) held.push((await res.json()).id);
    }
    assert(held.length === 2, '4 MB files 1 and 2 stored');
    r.state({ cards: [{ id: 'pc:c1:1:1', to: [{ seat: 'a' }], open: true, text: 'Two', media: held.map((file) => ({ kind: 'video', file, mime: 'video/mp4' })) }] });
    await until(() => r.phone.last('view')?.view.cards?.list[0]?.media?.length === 2, 'the phone gets the card');
    // …and a 4 MB one going fills the room…
    const going = r.halfUpload(randomBytes(2 * MB), '198.51.100.73');
    await until(async () => (await roomKeys(small.persist)).filter((k) => k.startsWith('p:')).length > 8, 'pieces of the upload going');
    const meanwhile = await r.upload(randomBytes(4 * MB), { from: '198.51.100.73' });
    assert(meanwhile.status === 409, `while it goes, another 4 MB file doesn't fit (${meanwhile.status})`);
    // …and once it's stopped (✖ Take back), the next one does.
    going.destroy();
    let after;
    for (const end = Date.now() + 5000; ; await sleep(200)) {
      after = await r.upload(randomBytes(4 * MB), { from: '198.51.100.73' });
      if (after.status === 200 || Date.now() > end) break;
    }
    assert(after.status === 200, `an upload stopped partway gives back the room it kept: the next 4 MB file is stored (${after.status})`);

    // A file that doesn't say how big it is keeps a whole file's room for itself: in a nearly full room it's turned away
    // even when small, where the same file saying its size is taken.
    const third = (await after.json()).id;
    await until(() => r.host.last('files')?.ids.includes(third), 'the files list with it');
    r.host.send({ t: 'forget', files: [third] });
    await until(() => r.host.last('files')?.ids.length === 2, 'the third let go');
    assert((await r.upload(randomBytes(100 * 1024), { from: '198.51.100.74' })).status === 200, 'with 8 MB held, a 100 KB file saying its size is taken');
    const unsized = (bytes) =>
      r.upload(
        new ReadableStream({
          start(c) {
            c.enqueue(bytes);
            c.close();
          },
        }),
        { from: '198.51.100.74', duplex: 'half' },
      );
    const small100 = await unsized(randomBytes(100 * 1024));
    assert(small100.status === 409, `the same size not saying it is turned away: it could be 4 MB (${small100.status})`);
    r.host.send({ t: 'close' });
  }
  {
    // What a twin (the same bytes again) kept of the budget is given back: one address has 6 MB of it.
    const r = await newRoom('198.51.100.80', small.base);
    const from = '198.51.100.81';
    const one = randomBytes(MB);
    assert((await r.upload(randomBytes(4 * MB), { from })).status === 200 && (await r.upload(one, { from })).status === 200, 'an address uploads 4 MB and 1 MB');
    const twin = await r.upload(one, { from });
    assert(twin.status === 200 && (await twin.json()).id === createHash('sha256').update(one).digest('hex'), 'the same 1 MB again is taken (its id, stored once)');
    const last = await r.upload(randomBytes(MB), { from });
    assert(last.status === 200, `and another 1 MB still fits its 6 MB: the twin's share was given back (${last.status})`);
    const over = await r.upload(randomBytes(1024), { from });
    const said = (await over.json()).error;
    assert(over.status === 429, `past its 6 MB, the next is turned away (${over.status})`);
    // (Its 6 MB went up this hour, so they count until this hour is 24 hours gone: about 24 hours, or 23 if an hour
    // began meanwhile.)
    assert(/^Too many files from here for now — try again in about 2[34] hours$/.test(said), `saying when to try again: "${said}"`);
    r.host.send({ t: 'close' });
  }

  console.log('Buzzer files E2E passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  buzzer.stop();
  small?.stop();
}
