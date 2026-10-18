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
 * header, never in the address). The room checks who may have what (room.ts fileFor); the Durable Object keeps the bytes
 * in 1 MB pieces under their own keys (file:<id>:<n>), never in 'room', which is written on every change. Uploads are
 * limited per address (FILE_LIMIT) and by a daily byte budget for the whole server (FILES_MB_PER_DAY, counted by
 * RoomCounter). The room's one alarm both ends it and deletes files no card has used for a while (nextAlarm).
 */
import { DurableObject } from 'cloudflare:workers';
import {
  BUZZ_PROTOCOL,
  FILE_MAX_BYTES,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  fileType,
  isFileId,
  isRoomCode,
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
  filesBudget,
  FILES_BUSY_TODAY,
  FILES_OFF,
  nextAlarm,
  TOO_MANY_FILES,
  TOO_MANY_FILES_TODAY,
  TOO_MANY_LOOKUPS,
  TOO_MANY_ROOMS,
  TOO_MANY_TODAY,
  uncountBytes,
  type DayBytes,
  type DayCount,
} from './limits';
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
  /** Card files the whole server takes a UTC day, in MB (wrangler.jsonc vars; 0 turns them off; see filesBudget). */
  FILES_MB_PER_DAY?: string | number;
  ASSETS: Fetcher;
}

/** A room ends this long after the host's last message… */
const IDLE_MS = 6 * 60 * 60 * 1000;
/** …or this long after it was made, if the host never came. */
const UNUSED_MS = 30 * 60 * 1000;
/** What an upload comes to: 200 with the file's id, or the HTTP status and why. */
type Upload = { status: number; id?: string; error?: string };
/** A card file's bytes are stored in pieces this big (a Durable Object value is at most 2 MB, its key included). */
const FILE_PART_BYTES = 1024 * 1024;

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

/** Refused for its size (413). */
const TOO_BIG = `Too big for phones (${FILE_MAX_BYTES / 1024 / 1024} MB at most)`;

/**
 * A card file as it streams in, read once: straight into the FILE_PART_BYTES pieces it's stored in, a whole piece at a
 * time (reading it in network-sized bits cost the room about 20 ms of CPU a MB), its SHA-256 (the file's id) worked out
 * on the way. 'big' when it runs past max bytes (reading stops there); 'empty' with no bytes.
 */
async function readPieces(body: ReadableStream<Uint8Array> | null, max: number): Promise<{ id: string; pieces: Uint8Array[]; bytes: number } | 'big' | 'empty'> {
  if (!body) return 'empty';
  const digest = new crypto.DigestStream('SHA-256');
  const hash = digest.getWriter();
  const reader = body.getReader({ mode: 'byob' });
  const pieces: Uint8Array[] = [];
  let n = 0;
  for (let done = false; !done; ) {
    let piece = new Uint8Array(FILE_PART_BYTES);
    let at = 0;
    while (at < FILE_PART_BYTES && !done) {
      // (Waits for the rest of the piece, or the end: the bytes land in it, which comes back as r.value's buffer.)
      const r = await reader.readAtLeast(FILE_PART_BYTES - at, new Uint8Array(piece.buffer, at));
      if (r.value) {
        piece = new Uint8Array(r.value.buffer);
        at += r.value.byteLength;
      }
      done = r.done;
    }
    n += at;
    if (n > max) {
      void reader.cancel();
      return 'big';
    }
    if (!at) break;
    const part = at === FILE_PART_BYTES ? piece : piece.slice(0, at);
    await hash.write(part);
    pieces.push(part);
  }
  if (!n) return 'empty';
  await hash.close();
  const id = [...new Uint8Array(await digest.digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { id, pieces, bytes: n };
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
    // HTTP, not RPC: a stream an RPC call returns counts as a disconnected call, an error, once it's been read.)
    const room = token && isRoomCode(code) && isFileId(id) ? env.BUZZ_ROOM.getByName(code) : null;
    const file = room ? await room.fetch(new Request(`https://room/file/${id}`, { headers: { Authorization: `Bearer ${token}` } })) : null;
    if (!file?.ok) return json({ error: 'not found' }, 404);
    return new Response(file.body, {
      headers: { 'Content-Type': file.headers.get('Content-Type') ?? '', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...CORS },
    });
  }
  if (!filesBudget(env.FILES_MB_PER_DAY)) return json({ error: FILES_OFF }, 503);
  // (A room that doesn't exist answers the same as a wrong token: uploads can't be used to look rooms up.)
  if (!token || !isRoomCode(code)) return json({ error: 'wrong host token' }, 401);
  const mime = fileType(request.headers.get('Content-Type'));
  if (!mime) return json({ error: 'Pictures (PNG, JPEG, WebP, GIF), videos (MP4, WebM) and sounds (MP3, OGG, WAV, M4A) only' }, 415);
  // The token is checked before the body is read: the room code is on stream, and a wrong token mustn't cost the room a
  // 4 MB read and RPC. (upload() checks it again, for a room that ended meanwhile. The body is left unread, as for a
  // missing token above.)
  const stub = env.BUZZ_ROOM.getByName(code);
  if (!(await stub.isHost(token))) return json({ error: 'wrong host token' }, 401);
  if (Number(request.headers.get('Content-Length') ?? 0) > FILE_MAX_BYTES) return json({ error: TOO_BIG }, 413);
  // The bytes stream on to the room as they come, never gathered here: copying a file's worth through the Worker cost
  // it several times a request's CPU on the Free plan (README.md, "Card files").
  const r = await stub.upload(token, mime, request.body, who);
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

    if (path === '/api/health') return json({ ok: true, protocol: BUZZ_PROTOCOL });

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
   * Card files on their way into storage now, by id: their size (kept for them under the room's caps), the idle files
   * deleted to make room for them once they're sure to be stored (room.ts fileRoom), and their answer.
   */
  private uploading = new Map<string, { bytes: number; drop: string[]; done: Promise<Upload> }>();

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
    });
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
        dropFiles: (files) => {
          const keys = files.flatMap((f) => Array.from({ length: f.parts }, (_, i) => `file:${f.id}:${i}`));
          // (Not after wipe(): deleteAll took them.) At most 128 keys a call.
          for (let i = 0; this.meta && i < keys.length; i += 128) void this.ctx.storage.delete(keys.slice(i, i + 128));
        },
        cleanupAt: (at) => void this.wakeBy(at),
      },
      saved,
      phones,
      hostHere,
    );
  }

  /** Called by the Worker for a new code. false: the code is in use. */
  async init(code: string, hostToken: string): Promise<boolean> {
    if (this.meta) return false;
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

  /** The server takes card files now: the setting isn't 0 and today's budget isn't used up. */
  private async takingFiles(): Promise<boolean> {
    if (!filesBudget(this.env.FILES_MB_PER_DAY)) return false;
    try {
      return await this.env.ROOM_COUNTER.getByName('rooms').takingFiles();
    } catch {
      return false;
    }
  }

  /**
   * A card file from the host, its bytes streaming in (the Worker checked its type): read into its pieces, at most
   * FILE_MAX_BYTES. The same bytes again store nothing new. Otherwise the room's caps (counting the files still on their
   * way, so uploads at the same time can't pass them together), then today's budget, then its pieces are stored: only
   * then are the idle files that make room for it deleted.
   */
  async upload(token: string, mime: string, body: ReadableStream<Uint8Array> | null, who: string): Promise<Upload> {
    const wrong = { status: 401, error: 'wrong host token' };
    if (!this.meta || !this.room || !sameToken(token, this.meta.hostToken)) {
      void body?.cancel().catch(() => {});
      return wrong;
    }
    this.touchHost();
    const file = await readPieces(body, FILE_MAX_BYTES);
    if (file === 'big') return { status: 413, error: TOO_BIG };
    if (file === 'empty') return { status: 400, error: 'empty file' };
    const { id } = file;
    // The same file already on its way (a second host window, a reload mid-upload): its answer, counted once.
    const going = this.uploading.get(id);
    if (going) return going.done;
    if (!this.meta || !this.room) return wrong;
    const ahead = [...this.uploading.values()];
    const pending = { files: ahead.length, bytes: ahead.reduce((n, u) => n + u.bytes, 0), drop: ahead.flatMap((u) => u.drop) };
    const room = this.room.fileRoom(id, file.bytes, pending);
    if (room === 'have') return { status: 200, id };
    if (room === 'full') return { status: 409, error: 'This room holds all the card files it can: send fewer pictures and videos at once' };
    // (Its room is kept for it from here: nothing between this and the store can fill the room or store it first.)
    const done = this.store(id, mime, file.pieces, file.bytes, who, room.drop);
    this.uploading.set(id, { bytes: file.bytes, drop: room.drop, done });
    try {
      return await done;
    } finally {
      this.uploading.delete(id);
    }
  }

  /**
   * upload()'s second half: today's budget, then the idle files `drop` go to make room, then the pieces. A file counted
   * and then not stored is given back.
   */
  private async store(id: string, mime: string, parts: Uint8Array[], n: number, who: string, drop: string[]): Promise<Upload> {
    const wrong = { status: 401, error: 'wrong host token' };
    const counter = this.env.ROOM_COUNTER.getByName('rooms');
    const took = await counter.takeBytes(who, n);
    if (took === 'off') return { status: 503, error: FILES_OFF };
    if (took !== 'ok') return { status: 429, error: took === 'address' ? TOO_MANY_FILES_TODAY : FILES_BUSY_TODAY };
    const refund = () => counter.refundBytes(who, n).catch(() => {});
    // (The room may have ended meanwhile.)
    if (!this.meta || !this.room) {
      await refund();
      return wrong;
    }
    // (Only now, with today's budget taken: a file refused for it leaves every other where it was.)
    this.room.dropIdle(drop);
    const pieces: Record<string, Uint8Array> = {};
    parts.forEach((part, i) => (pieces[`file:${id}:${i}`] = part));
    try {
      await this.ctx.storage.put(pieces);
    } catch (e) {
      await refund();
      throw e;
    }
    if (!this.meta || !this.room) {
      await this.ctx.storage.delete(Object.keys(pieces));
      await refund();
      return wrong;
    }
    this.room.fileAdded(id, mime, n, parts.length);
    return { status: 200, id };
  }

  /**
   * Card file `id` for the phone holding `token`, when the room lets it have it (room.ts fileFor); else 404. Its pieces
   * go out one after another as they're stored, never joined into one copy.
   */
  private async download(token: string, id: string): Promise<Response> {
    const missing = new Response(null, { status: 404 });
    const file = this.room?.fileFor(token, id);
    if (!file) return missing;
    const keys = Array.from({ length: file.parts }, (_, i) => `file:${id}:${i}`);
    const got = await this.ctx.storage.get<Uint8Array | ArrayBuffer>(keys);
    const parts: Uint8Array[] = [];
    let at = 0;
    for (const k of keys) {
      const v = got.get(k);
      if (!v) return missing;
      const part = v instanceof Uint8Array ? v : new Uint8Array(v);
      parts.push(part);
      at += part.byteLength;
    }
    if (at !== file.bytes) return missing;
    let next = 0;
    const body = new ReadableStream({
      type: 'bytes',
      pull(c) {
        if (next < parts.length) c.enqueue(parts[next++]);
        else c.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': file.mime } });
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
   * n more bytes of card files from address key `who`: 'off' (FILES_MB_PER_DAY is 0), 'busy' when today's budget would
   * be used up, 'address' when this address's share (or its /48's) would.
   */
  async takeBytes(who: string, n: number): Promise<'ok' | 'off' | 'busy' | 'address'> {
    const next = countBytes(await this.ctx.storage.get<DayBytes>('bytes'), Date.now(), who, n, filesBudget(this.env.FILES_MB_PER_DAY));
    if (typeof next === 'string') return next;
    await this.ctx.storage.put('bytes', next);
    return 'ok';
  }

  /** n bytes counted by takeBytes for `who` weren't stored after all (the room ended, or storing failed): given back. */
  async refundBytes(who: string, n: number): Promise<void> {
    const next = uncountBytes(await this.ctx.storage.get<DayBytes>('bytes'), Date.now(), who, n);
    if (next) await this.ctx.storage.put('bytes', next);
  }

  /** Some of today's budget for card files is left. */
  async takingFiles(): Promise<boolean> {
    return bytesLeft(await this.ctx.storage.get<DayBytes>('bytes'), Date.now(), filesBudget(this.env.FILES_MB_PER_DAY)) > 0;
  }
}

/** Accept a WebSocket only to close it at once with code (4000–4999: don't come back). */
function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}
