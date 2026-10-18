/**
 * The buzzer room server: a Worker that makes rooms and serves the phone page, and one Durable Object (BuzzRoom) per
 * room code that holds the sockets and runs room.ts. Sockets use the hibernation API, and everything the room knows
 * is in DO storage or on the sockets, so an idle room can sleep (and be evicted) without losing a thing. The one timer
 * (a buzz's grace window, under a second) keeps the room awake while it runs; a room restarted in the middle of one
 * finishes it from storage (see room.ts).
 *
 * Making a room is limited (limits.ts): 6 a minute per address (NEW_ROOM_LIMIT), ADDRESS_ROOMS a day per address
 * (NETWORK_ROOMS per IPv6 /48) and DAILY_ROOMS a day in all (RoomCounter, one Durable Object for the whole server).
 * Looking rooms up and connecting are limited per address too (LOOKUP_LIMIT, SOCKET_LIMIT), so a script can't try every
 * code to find live rooms.
 *
 * Card files ('files'): the host uploads a card's picture, video or sound (POST /api/rooms/:code/files, its host token
 * in the Authorization header) and a phone the card was sent to fetches it (GET …/files/:id, its seat token in the
 * header, never in the address). The room checks who may have what (room.ts fileFor); the Durable Object stores the
 * bytes as they arrive and sends them a 1 MB piece at a time (filestore.ts), under their own keys (p:<random>:<n>),
 * never in 'room', which is written on every change. Uploads are limited per address (FILE_LIMIT) and by a byte budget
 * for the whole server in any 24 hours (FILES_MB_PER_DAY, counted by the hour by RoomCounter); how big a file and a
 * room's files may be is set too (FILE_MB, ROOM_FILES_MB), and told to the app (/api/health, the host's welcome). The
 * room's one alarm both ends it and deletes files no card has used for a while, and any file 20 hours after its upload
 * (nextAlarm), so the files kept are never more than the budget.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  BUZZ_PROTOCOL,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  fileType,
  isFileId,
  isRoomCode,
  type Health,
  type NewRoom,
  type RoomToHost,
  type RoomToPhone,
} from '../../src/lib/buzzproto';
import {
  addressKey,
  BUSY_TODAY,
  bytesLeft,
  countBytes,
  countRoom,
  fileLimits,
  filesBudget,
  filesBusy,
  FILES_OFF,
  freesIn,
  hourOf,
  nextAlarm,
  TOO_MANY_FILES,
  TOO_MANY_LOOKUPS,
  TOO_MANY_ROOMS,
  TOO_MANY_TODAY,
  tooBig,
  uncountBytes,
  WINDOW_HOURS,
  type DayCount,
  type SavedBytes,
} from './limits';
import { FILE_PART_BYTES, FileStore, type Hasher, type PieceSource, type Upload } from './filestore';
import { Room, emptyRoom, type PhoneSaved, type RoomSaved } from './room';

export interface Env {
  BUZZ_ROOM: DurableObjectNamespace<BuzzRoom>;
  ROOM_COUNTER: DurableObjectNamespace<RoomCounter>;
  /** New rooms per address per minute (Workers Rate Limiting). */
  NEW_ROOM_LIMIT: RateLimit;
  /** Room lookups (GET /api/rooms/:code) per address per minute. */
  LOOKUP_LIMIT: RateLimit;
  /** Connections (/ws/:code, phones and hosts) per address per minute. */
  SOCKET_LIMIT: RateLimit;
  /** Card file uploads and downloads per address per minute (counted apart). */
  FILE_LIMIT: RateLimit;
  /** Card files the whole server takes in any 24 hours, in MB (wrangler.jsonc vars; 0 turns them off: filesBudget). */
  FILES_MB_PER_DAY?: string | number;
  /** How big a card file may be, and a room's card files together, in MB (wrangler.jsonc vars; see fileLimits). */
  FILE_MB?: string | number;
  ROOM_FILES_MB?: string | number;
  ASSETS: Fetcher;
}

/** A room ends this long after the host's last message… */
const IDLE_MS = 6 * 60 * 60 * 1000;
/** …or this long after it was made, if the host never came. */
const UNUSED_MS = 30 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // (Authorization: card files carry their token in a header, never in the address.)
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });

/** `bytes` random bytes as base64url. */
function randomToken(bytes = 16): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  // 256 % 20 leaves a tiny bias toward the first letters; it doesn't matter for a room code.
  return [...b].map((x) => ROOM_ALPHABET[x % ROOM_ALPHABET.length]).join('');
}

/** The token in an `Authorization: Bearer <token>` header, or ''. */
const bearer = (request: Request): string => request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';

/**
 * An upload's body, read straight into the FILE_PART_BYTES pieces it's stored in, a whole piece at a time (reading it
 * in network-sized bits cost the room about 20 ms of CPU a MB), a new buffer for each. next() throws once cancel() was
 * called (a read cut short that way isn't the end of the file).
 */
function pieceSource(body: ReadableStream<Uint8Array>): PieceSource {
  const reader = body.getReader({ mode: 'byob' });
  let done = false;
  let cancelled = false;
  return {
    async next() {
      let piece = new Uint8Array(FILE_PART_BYTES);
      let at = 0;
      while (at < FILE_PART_BYTES && !done) {
        // (Waits for the rest of the piece, or the end: the bytes land in it, which comes back as r.value's buffer.)
        const r = await reader.readAtLeast(FILE_PART_BYTES - at, new Uint8Array(piece.buffer, at));
        if (cancelled) throw new Error('upload stopped');
        if (r.value) {
          piece = new Uint8Array(r.value.buffer);
          at += r.value.byteLength;
        }
        done = r.done;
      }
      if (!at) return null;
      return at === FILE_PART_BYTES ? piece : piece.slice(0, at);
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      void reader.cancel().catch(() => {});
    },
  };
}

/** SHA-256 as 64 hex digits, fed piece by piece. */
function sha256(): Hasher {
  const digest = new crypto.DigestStream('SHA-256');
  const w = digest.getWriter();
  return {
    write: (b) => w.write(b),
    async hex() {
      await w.close();
      return [...new Uint8Array(await digest.digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
  };
}

/**
 * The card file routes: POST /api/rooms/:code/files (the host uploads one) and GET /api/rooms/:code/files/:id (a phone
 * fetches one). See buzzproto.ts filesUrl for the answers.
 */
async function roomFiles(request: Request, env: Env, ip: string, code: string, id: string | undefined): Promise<Response> {
  const upload = request.method === 'POST' && id === undefined;
  const download = request.method === 'GET' && id !== undefined;
  if (!upload && !download) return json({ error: 'not found' }, 404);
  const who = addressKey(ip);
  if (!(await env.FILE_LIMIT.limit({ key: upload ? `up:${who}` : `get:${ip}` })).success) return json({ error: TOO_MANY_FILES }, 429);
  const token = bearer(request);
  if (download) {
    // The room answers with the file as a response, its pieces streaming through: the Worker never holds it. (Over
    // HTTP, not RPC: a stream an RPC call returns counts as a disconnected call, an error, once it's been read.) Its
    // length comes with it (the room's download), and so does a phone letting go partway: passed on as it is.
    const room = token && isRoomCode(code) && isFileId(id) ? env.BUZZ_ROOM.getByName(code) : null;
    const file = room ? await room.fetch(new Request(`https://room/file/${id}`, { headers: { Authorization: `Bearer ${token}` } })) : null;
    if (!file?.ok || !file.body) return json({ error: 'not found' }, 404);
    return new Response(file.body, {
      // (no-transform: Cloudflare compressing it would drop its Content-Length.)
      headers: { 'Content-Type': file.headers.get('Content-Type') ?? '', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff', ...CORS },
    });
  }
  if (!filesBudget(env.FILES_MB_PER_DAY)) return json({ error: FILES_OFF }, 503);
  // (A room that doesn't exist answers the same as a wrong token: uploads can't be used to look rooms up.)
  if (!token || !isRoomCode(code)) return json({ error: 'wrong host token' }, 401);
  const mime = fileType(request.headers.get('Content-Type'));
  if (!mime) return json({ error: 'Pictures (PNG, JPEG, WebP, GIF), videos (MP4, WebM) and sounds (MP3, OGG, WAV, M4A) only' }, 415);
  // The token is checked before the body is read: the room code is on stream, and a wrong token mustn't cost the room a
  // file's read. (upload() checks it again, for a room that ended meanwhile. The body is left unread, as for a
  // missing token above.)
  const stub = env.BUZZ_ROOM.getByName(code);
  if (!(await stub.isHost(token))) return json({ error: 'wrong host token' }, 401);
  const lim = fileLimits(env);
  // (The room keeps this much room for it before reading it: a whole file's limit when it doesn't say.)
  const length = request.headers.get('Content-Length');
  const size = length && /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) ? Number(length) : null;
  if (size !== null && size > lim.fileBytes) return json({ error: tooBig(lim) }, 413);
  if (size === 0) return json({ error: 'empty file' }, 400);
  // The bytes stream on to the room as they come, never gathered here: copying a file's worth through the Worker cost
  // it several times a request's CPU on the Free plan (README.md, "Card files").
  const r = await stub.upload(token, mime, request.body, who, size);
  return json(r.id ? { id: r.id } : { error: r.error }, r.status);
}

/** Compares without stopping at the first difference. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS' && (path.startsWith('/api/') || path.startsWith('/ws/'))) return new Response(null, { status: 204, headers: CORS });

    // (What card files it takes, so the app knows before a room is open: no room is asked.)
    if (path === '/api/health')
      return json({ ok: true, protocol: BUZZ_PROTOCOL, files: filesBudget(env.FILES_MB_PER_DAY) ? fileLimits(env) : null } satisfies Health);

    // Cloudflare sets CF-Connecting-IP to the caller's address (a caller can't choose it).
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (path === '/api/rooms' && request.method === 'POST') {
      const who = addressKey(ip);
      if (!(await env.NEW_ROOM_LIMIT.limit({ key: who })).success) return json({ error: TOO_MANY_ROOMS }, 429);
      const took = await env.ROOM_COUNTER.getByName('rooms').take(who);
      if (took === 'address') return json({ error: TOO_MANY_TODAY }, 429);
      if (took === 'busy') return json({ error: BUSY_TODAY }, 503);
      for (let i = 0; i < 10; i++) {
        const code = randomCode();
        const hostToken = randomToken();
        if (await env.BUZZ_ROOM.getByName(code).init(code, hostToken)) return json({ code, hostToken } satisfies NewRoom);
      }
      return json({ error: 'no free room code' }, 503);
    }

    const room = path.match(/^\/api\/rooms\/([A-Za-z]+)$/);
    if (room && request.method === 'GET') {
      if (!(await env.LOOKUP_LIMIT.limit({ key: ip })).success) return json({ error: TOO_MANY_LOOKUPS }, 429);
      const code = room[1].toUpperCase();
      const open = isRoomCode(code) && (await env.BUZZ_ROOM.getByName(code).isOpen());
      return json({ code, open }, open ? 200 : 404);
    }

    // Card files: before the /api/ 404 below.
    const files = path.match(/^\/api\/rooms\/([A-Za-z]+)\/files(?:\/([^/]+))?$/);
    if (files) return roomFiles(request, env, ip, files[1].toUpperCase(), files[2]);

    const ws = path.match(/^\/ws\/([A-Za-z]+)$/);
    if (ws) {
      const code = ws[1].toUpperCase();
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426, headers: CORS });
      if (!isRoomCode(code)) return new Response('No such room', { status: 404, headers: CORS });
      // Every socket, the host's too: a wrong host token is turned away differently from a missing room, so it could
      // be used to look rooms up.
      if (!(await env.SOCKET_LIMIT.limit({ key: ip })).success)
        return new Response(TOO_MANY_LOOKUPS, { status: 429, headers: CORS });
      return env.BUZZ_ROOM.getByName(code).fetch(request);
    }

    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** Kept in storage under 'meta'. */
interface Meta {
  code: string;
  hostToken: string;
  createdAt: number;
  /** The host's last message (0: never). Saved at most once a minute. */
  lastHostAt: number;
}

type Attachment = { role: 'host' } | ({ role: 'phone' } & PhoneSaved);

const OPEN = 1;

export class BuzzRoom extends DurableObject<Env> {
  private meta: Meta | null = null;
  private room: Room | null = null;
  /** lastHostAt as last saved. */
  private savedHostAt = 0;
  /**
   * Who each socket is (its role and conn never change while it lives; null: forgotten), kept in memory so a message
   * doesn't read the socket's attachment: a flood costs the room as little as possible.
   */
  private ids = new WeakMap<WebSocket, { role: 'host' } | { role: 'phone'; conn: string } | null>();
  /** When the alarm is set for (null: none; undefined: not read from storage yet). */
  private alarmAt: number | null | undefined = undefined;
  /**
   * Up by one whenever a room begins or ends here (init, wipe): an upload or download that began in a room stops once
   * this changes, so nothing of it reaches storage after the wipe, or a new room under the same code.
   */
  private epoch = 0;
  /** Card files in and out a piece at a time (filestore.ts). */
  private files = new FileStore({
    limits: () => fileLimits(this.env),
    put: (key, piece) => this.ctx.storage.put(key, piece),
    get: async (key) => {
      const v = await this.ctx.storage.get<Uint8Array | ArrayBuffer>(key);
      return v === undefined ? undefined : v instanceof Uint8Array ? v : new Uint8Array(v);
    },
    drop: (prefix, parts) => this.dropPieces([{ prefix, parts }]),
    prefix: () => `p:${randomToken(9)}`,
    hasher: sha256,
    take: async (who, n) => {
      const took = await this.env.ROOM_COUNTER.getByName('rooms').takeBytes(who, n);
      // (The ticket is the hour it was counted under: a refund goes back there.)
      return typeof took === 'string' ? took : { ok: true, ticket: took.hour };
    },
    refund: (who, n, hour) => this.env.ROOM_COUNTER.getByName('rooms').refundBytes(who, n, typeof hour === 'number' ? hour : undefined).catch(() => {}),
    busyText: async (took, who, n) => filesBusy(took, await this.env.ROOM_COUNTER.getByName('rooms').bytesFreeIn(who, n).catch(() => WINDOW_HOURS)),
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get<Meta>('meta')) ?? null;
      if (!this.meta) return;
      this.savedHostAt = this.meta.lastHostAt;
      const saved = (await ctx.storage.get<RoomSaved>('room')) ?? emptyRoom();
      const phones: PhoneSaved[] = [];
      let hostHere = false;
      for (const s of ctx.getWebSockets()) {
        const a = s.deserializeAttachment() as Attachment | null;
        if (a?.role === 'phone')
          phones.push({
            conn: a.conn,
            seatId: a.seatId,
            ...(typeof a.member === 'string' ? { member: a.member } : {}),
            ...(a.pendingName !== undefined ? { pendingName: a.pendingName } : {}),
            ...(Array.isArray(a.rtts) ? { rtts: a.rtts } : {}),
            ...(typeof a.device === 'string' ? { device: a.device } : {}),
            ...(typeof a.ip === 'string' ? { ip: a.ip } : {}),
            ...(a.flooded === true ? { flooded: true } : {}),
          });
        else if (a?.role === 'host' && s.readyState === OPEN) hostHere = true;
      }
      this.room = this.makeRoom(this.meta.code, saved, phones, hostHere);
      // The pieces of uploads that stopped with the last instance (a deploy, a crash, out of memory): nothing can be
      // writing yet. (Their part of the budget isn't given back: that errs safe, and it frees within 24 hours.)
      this.dropPieces(this.room.takeUploads());
    });
  }

  /** Deletes pieces 0 to parts − 1 under each prefix, 128 keys a call. Not after wipe(): deleteAll took them. */
  private dropPieces(files: { prefix: string; parts: number }[]): void {
    const keys = files.flatMap((f) => Array.from({ length: f.parts }, (_, i) => `${f.prefix}:${i}`));
    if (!this.meta || !keys.length) return;
    for (let i = 0; i < keys.length; i += 128) void this.ctx.storage.delete(keys.slice(i, i + 128));
    // In Workers Logs: whether the room's storage gets smaller again once files are deleted (README.md, "Card files").
    try {
      console.log(`card file pieces deleted: ${keys.length}; room storage now ${this.ctx.storage.sql.databaseSize} bytes`);
    } catch {
      // (not SQLite-backed)
    }
  }

  private makeRoom(code: string, saved?: RoomSaved, phones?: PhoneSaved[], hostHere?: boolean): Room {
    const send = (s: WebSocket | undefined, m: RoomToHost | RoomToPhone) => {
      if (s?.readyState !== OPEN) return;
      try {
        s.send(JSON.stringify(m));
      } catch {
        // closing under us: its close event tidies up
      }
    };
    return new Room(
      code,
      {
        now: () => Date.now(),
        token: () => randomToken(),
        toHost: (m) => {
          for (const s of this.ctx.getWebSockets('host')) send(s, m);
        },
        toPhone: (conn, m) => send(this.ctx.getWebSockets(conn)[0], m),
        // Not after wipe(): a timer left over from an ended room mustn't bring its storage back.
        saveRoom: (s) => void (this.meta && this.ctx.storage.put('room', s)),
        savePhone: (p) => this.ctx.getWebSockets(p.conn)[0]?.serializeAttachment({ role: 'phone', ...p } satisfies Attachment),
        dropPhone: (conn) => {
          for (const s of this.ctx.getWebSockets(conn)) {
            try {
              // Forgotten at once: a room woken from hibernation before the socket is gone mustn't count it again.
              s.serializeAttachment(null);
              this.ids.set(s, null);
              s.close(4001, 'full');
            } catch {
              // already closing
            }
          }
        },
        schedule: (ms, fn) => setTimeout(fn, ms),
        cancel: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
        dropFiles: (files) => this.dropPieces(files),
        cleanupAt: (at) => void this.wakeBy(at),
        limits: fileLimits(this.env),
      },
      saved,
      phones,
      hostHere,
    );
  }

  /** Called by the Worker for a new code. false: the code is in use. */
  async init(code: string, hostToken: string): Promise<boolean> {
    if (this.meta) return false;
    this.epoch++;
    this.meta = { code, hostToken, createdAt: Date.now(), lastHostAt: 0 };
    this.savedHostAt = 0;
    await this.ctx.storage.put('meta', this.meta);
    this.alarmAt = Date.now() + UNUSED_MS;
    await this.ctx.storage.setAlarm(this.alarmAt);
    this.room = this.makeRoom(code);
    return true;
  }

  /** Makes sure the alarm goes off by `at` (it may be set later: for the room's end). */
  private async wakeBy(at: number): Promise<void> {
    if (!this.meta) return;
    if (this.alarmAt === undefined) this.alarmAt = await this.ctx.storage.getAlarm();
    if (!this.meta || (this.alarmAt !== null && this.alarmAt <= at)) return;
    this.alarmAt = at;
    await this.ctx.storage.setAlarm(at);
  }

  /** When the room ends: 6 hours after the host's last message, or 30 minutes after it was made if the host never came. */
  private end(meta: Meta): number {
    return meta.lastHostAt ? meta.lastHostAt + IDLE_MS : meta.createdAt + UNUSED_MS;
  }

  /** The server takes card files now: the setting isn't 0 and the last 24 hours' uploads haven't used up the budget. */
  private async takingFiles(): Promise<boolean> {
    if (!filesBudget(this.env.FILES_MB_PER_DAY)) return false;
    try {
      return await this.env.ROOM_COUNTER.getByName('rooms').takingFiles();
    } catch {
      return false;
    }
  }

  /**
   * A card file from the host, its bytes streaming in (the Worker checked its type, and its size when it gave one):
   * stored a piece at a time as they come (filestore.ts). size: its Content-Length (null: it didn't say).
   */
  async upload(token: string, mime: string, body: ReadableStream<Uint8Array> | null, who: string, size: number | null = null): Promise<Upload> {
    if (!this.meta || !this.room || !sameToken(token, this.meta.hostToken)) {
      void body?.cancel().catch(() => {});
      return { status: 401, error: 'wrong host token' };
    }
    this.touchHost();
    if (!body) return { status: 400, error: 'empty file' };
    const epoch = this.epoch;
    return this.files.upload({ mime, size, who, body: pieceSource(body), room: () => (this.meta && this.epoch === epoch ? this.room : null) });
  }

  /**
   * Card file `id` for the phone holding `token`, when the room lets it have it (room.ts fileFor, asked once its turn
   * comes); else 404. Its pieces go out one after another, read as they're asked for, with its Content-Length (so the
   * phone knows a body that broke off when it sees one: fewer bytes than that, an error).
   */
  private async download(token: string, id: string): Promise<Response> {
    const epoch = this.epoch;
    const file = await this.files.send(id, () => this.room?.fileFor(token, id) ?? null, () => !!this.meta && this.epoch === epoch);
    const n = Number(file.headers.get('X-File-Bytes'));
    if (!file.ok || !file.body || !Number.isSafeInteger(n) || n <= 0) return file;
    // (Here, not in the Worker: piped there, a phone letting go partway never reached this end, and the download kept
    // its place in the room for good.)
    const { readable, writable } = new FixedLengthStream(n);
    void file.body.pipeTo(writable).catch(() => {});
    return new Response(readable, { headers: { 'Content-Type': file.headers.get('Content-Type') ?? '' } });
  }

  async isOpen(): Promise<boolean> {
    return !!this.meta;
  }

  /** `token` is this room's host token (the Worker asks before it reads an upload's body). */
  async isHost(token: string): Promise<boolean> {
    return !!this.meta && !!token && sameToken(token, this.meta.hostToken);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // A phone's card file, asked for by the Worker (roomFiles) with the phone's token.
    const file = url.pathname.match(/^\/file\/([0-9a-f]{64})$/);
    if (file) return this.download(bearer(request), file[1]);
    const hostToken = url.searchParams.get('host');
    // Turned away: accepted, then closed with a 4xxx code. A browser sees an HTTP refusal only as a dropped connection
    // (and would try again forever); 4000–4999 tells the host the room is gone for good.
    if (!this.meta || !this.room) return refuse(4004, 'no such room');
    if (hostToken !== null && !sameToken(hostToken, this.meta.hostToken)) return refuse(4003, 'wrong host token');
    // The host's welcome says whether the server takes card files now (asked before its socket is taken).
    const files = hostToken !== null && (await this.takingFiles());
    if (!this.meta || !this.room) return refuse(4004, 'no such room');
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    if (hostToken !== null) {
      // A new host socket replaces the old one (a reload, a second window).
      for (const old of this.ctx.getWebSockets('host')) {
        try {
          old.close(4000, 'replaced');
        } catch {
          // already closing
        }
      }
      this.ctx.acceptWebSocket(server, ['host']);
      server.serializeAttachment({ role: 'host' } satisfies Attachment);
      this.touchHost();
      this.room.hostOpen(files);
    } else {
      // Cloudflare sets it (the Worker passes the request on as it came): kicks and floods keep an address out a while
      // (after a flood, a phone from it may only take back a seat it holds: see the room).
      const ip = request.headers.get('CF-Connecting-IP') ?? undefined;
      const conn = randomToken(9);
      this.ctx.acceptWebSocket(server, [conn]);
      server.serializeAttachment({ role: 'phone', conn, seatId: null, ...(ip ? { ip } : {}), ...(this.room.floodBlocked(ip) ? { flooded: true } : {}) } satisfies Attachment);
      if (!this.room.phoneOpen(conn, ip)) {
        server.send(JSON.stringify({ t: 'denied', reason: 'full' } satisfies RoomToPhone));
        server.close(4001, 'full');
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private who(ws: WebSocket): { role: 'host' } | { role: 'phone'; conn: string } | null {
    let id = this.ids.get(ws);
    if (id === undefined) {
      const a = ws.deserializeAttachment() as Attachment | null;
      id = !a ? null : a.role === 'host' ? { role: 'host' } : { role: 'phone', conn: a.conn };
      this.ids.set(ws, id);
    }
    return id;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = this.who(ws);
    if (!a || !this.room) return;
    if (a.role === 'host') {
      this.touchHost();
      if (this.room.hostMessage(message) === 'close') await this.wipe();
    } else if (this.room.phoneMessage(a.conn, message) === 'close') {
      // Flooding: forgotten at once (its close event has nothing left to do) and closed.
      try {
        ws.serializeAttachment(null);
        this.ids.set(ws, null);
        ws.close(4008, 'too many messages');
      } catch {
        // already closing
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  private gone(ws: WebSocket): void {
    const a = this.who(ws);
    if (!a || !this.room) return;
    if (a.role === 'phone') this.room.phoneClose(a.conn);
    else if (!this.ctx.getWebSockets('host').some((s) => s !== ws && s.readyState === OPEN)) this.room.hostClose();
  }

  /** One alarm, two jobs: card files no card has used for a while are deleted, then the room ends if it's time. */
  async alarm(): Promise<void> {
    this.alarmAt = null;
    if (!this.meta) return;
    this.room?.sweepFiles();
    const end = this.end(this.meta);
    if (Date.now() >= end) {
      for (const s of this.ctx.getWebSockets()) {
        const a = s.deserializeAttachment() as Attachment | null;
        if (a?.role === 'phone' && s.readyState === OPEN) s.send(JSON.stringify({ t: 'closed' } satisfies RoomToPhone));
      }
      await this.wipe();
    } else {
      this.alarmAt = nextAlarm(end, this.room?.saved.files, Date.now());
      await this.ctx.storage.setAlarm(this.alarmAt);
    }
  }

  private touchHost(): void {
    if (!this.meta) return;
    this.meta.lastHostAt = Date.now();
    if (this.meta.lastHostAt - this.savedHostAt > 60_000) {
      this.savedHostAt = this.meta.lastHostAt;
      void this.ctx.storage.put('meta', this.meta);
    }
  }

  /** Ends the room: closes every socket and forgets everything (the code can be used again). */
  private async wipe(): Promise<void> {
    // (First: no upload writes another piece, and no download sends one.)
    this.epoch++;
    this.files.abortAll();
    for (const s of this.ctx.getWebSockets()) {
      try {
        s.close(1000, 'closed');
      } catch {
        // already closed
      }
    }
    this.meta = null;
    this.room = null;
    this.alarmAt = null;
    // (Card files too: they are keys in the same storage.)
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

/** Counts the rooms made today (one instance, 'rooms', for the whole server). */
export class RoomCounter extends DurableObject<Env> {
  /** One more room for address key `who`: 'busy' when today's cap is reached, 'address' when its (or its /48's) is. */
  async take(who: string): Promise<'ok' | 'busy' | 'address'> {
    const next = countRoom(await this.ctx.storage.get<DayCount>('today'), Date.now(), who);
    if (typeof next === 'string') return next;
    await this.ctx.storage.put('today', next);
    return 'ok';
  }

  /**
   * n more bytes of card files from address key `who`: { ok, hour } (the hour they're counted under, for a refund), or
   * 'off' (FILES_MB_PER_DAY is 0), 'busy' when the last 24 hours' uploads would pass the budget, 'address' when this
   * address's share (or its /48's) would.
   */
  async takeBytes(who: string, n: number): Promise<{ ok: true; hour: number } | 'off' | 'busy' | 'address'> {
    const now = Date.now();
    const next = countBytes(await this.ctx.storage.get<SavedBytes>('bytes'), now, who, n, filesBudget(this.env.FILES_MB_PER_DAY));
    if (typeof next === 'string') return next;
    await this.ctx.storage.put('bytes', next);
    return { ok: true, hour: hourOf(now) };
  }

  /** In about how many hours n more bytes from `who` would be taken (for the words of a refusal). */
  async bytesFreeIn(who: string, n: number): Promise<number> {
    return freesIn(await this.ctx.storage.get<SavedBytes>('bytes'), Date.now(), who, n, filesBudget(this.env.FILES_MB_PER_DAY));
  }

  /**
   * n bytes counted by takeBytes for `who` (in `hour`) weren't stored after all (the room ended, or storing failed):
   * given back, unless that hour isn't counted any more.
   */
  async refundBytes(who: string, n: number, hour?: number): Promise<void> {
    const now = Date.now();
    const next = uncountBytes(await this.ctx.storage.get<SavedBytes>('bytes'), now, who, n, Number.isSafeInteger(hour) ? hour : hourOf(now));
    if (next) await this.ctx.storage.put('bytes', next);
  }

  /** Some of the budget for card files is left. */
  async takingFiles(): Promise<boolean> {
    return bytesLeft(await this.ctx.storage.get<SavedBytes>('bytes'), Date.now(), filesBudget(this.env.FILES_MB_PER_DAY)) > 0;
  }
}

/** Accept a WebSocket only to close it at once with code (4000–4999: don't come back). */
function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}
