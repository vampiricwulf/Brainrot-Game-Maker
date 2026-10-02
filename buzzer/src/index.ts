/**
 * The buzzer room server: a Worker that makes rooms and serves the phone page, and one Durable Object (BuzzRoom) per
 * room code that holds the sockets and runs room.ts. Sockets use the hibernation API, and everything the room knows
 * is in DO storage or on the sockets, so an idle room can sleep (and be evicted) without losing a thing. The one timer
 * (a buzz's grace window, under a second) keeps the room awake while it runs; a room restarted in the middle of one
 * finishes it from storage (see room.ts).
 *
 * Making a room is limited (limits.ts): 6 a minute per address (NEW_ROOM_LIMIT) and DAILY_ROOMS a day in all
 * (RoomCounter, one Durable Object for the whole server). Looking rooms up and connecting are limited per
 * address too (LOOKUP_LIMIT, SOCKET_LIMIT), so a script can't try every code to find live rooms.
 */
import { DurableObject } from 'cloudflare:workers';
import { BUZZ_PROTOCOL, ROOM_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, type NewRoom, type RoomToHost, type RoomToPhone } from '../../src/lib/buzzproto';
import { BUSY_TODAY, countRoom, TOO_MANY_LOOKUPS, TOO_MANY_ROOMS, type DayCount } from './limits';
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
  ASSETS: Fetcher;
}

/** A room ends this long after the host's last message… */
const IDLE_MS = 6 * 60 * 60 * 1000;
/** …or this long after it was made, if the host never came. */
const UNUSED_MS = 30 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
      if (!(await env.NEW_ROOM_LIMIT.limit({ key: ip })).success) return json({ error: TOO_MANY_ROOMS }, 429);
      if (!(await env.ROOM_COUNTER.getByName('rooms').take())) return json({ error: BUSY_TODAY }, 503);
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
    await this.ctx.storage.setAlarm(Date.now() + UNUSED_MS);
    this.room = this.makeRoom(code);
    return true;
  }

  async isOpen(): Promise<boolean> {
    return !!this.meta;
  }

  async fetch(request: Request): Promise<Response> {
    const hostToken = new URL(request.url).searchParams.get('host');
    // Turned away: accepted, then closed with a 4xxx code. A browser sees an HTTP refusal only as a dropped connection
    // (and would try again forever); 4000–4999 tells the host the room is gone for good.
    if (!this.meta || !this.room) return refuse(4004, 'no such room');
    if (hostToken !== null && !sameToken(hostToken, this.meta.hostToken)) return refuse(4003, 'wrong host token');
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
      this.room.hostOpen();
    } else {
      // Cloudflare sets it (the Worker passes the request on as it came): kicks and floods keep an address out a while.
      const ip = request.headers.get('CF-Connecting-IP') ?? undefined;
      if (this.room.floodBlocked(ip)) return refuse(4008, 'too many messages');
      const conn = randomToken(9);
      this.ctx.acceptWebSocket(server, [conn]);
      server.serializeAttachment({ role: 'phone', conn, seatId: null, ...(ip ? { ip } : {}) } satisfies Attachment);
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

  async alarm(): Promise<void> {
    if (!this.meta) return;
    const end = this.meta.lastHostAt ? this.meta.lastHostAt + IDLE_MS : this.meta.createdAt + UNUSED_MS;
    if (Date.now() >= end) {
      for (const s of this.ctx.getWebSockets()) {
        const a = s.deserializeAttachment() as Attachment | null;
        if (a?.role === 'phone' && s.readyState === OPEN) s.send(JSON.stringify({ t: 'closed' } satisfies RoomToPhone));
      }
      await this.wipe();
    } else {
      await this.ctx.storage.setAlarm(end);
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
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

/** Counts the rooms made today (one instance, 'rooms', for the whole server). */
export class RoomCounter extends DurableObject<Env> {
  /** One more room: false when today's cap is reached. */
  async take(): Promise<boolean> {
    const next = countRoom(await this.ctx.storage.get<DayCount>('today'), Date.now());
    if (!next) return false;
    await this.ctx.storage.put('today', next);
    return true;
  }
}

/** Accept a WebSocket only to close it at once with code (4000–4999: don't come back). */
function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}
