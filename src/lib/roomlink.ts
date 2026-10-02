// The host's line to its buzzer room (see buzzproto.ts): make a room, keep a WebSocket to it open (reconnecting with the
// same code and host token after a drop), send the host's state, and pass on what the room says. No Svelte here, so it
// can be tested with a fake WebSocket; remote.svelte.ts makes it reactive for the app.
import { BUZZ_PROTOCOL, isRoomCode, socketUrl, type HostMsg, type HostState, type NewRoom, type PhoneInfo, type QueuedBuzz, type RoomToHost } from './buzzproto';

export type RoomStatus = 'off' | 'connecting' | 'online' | 'reconnecting' | 'error';
export type RoomBuzz = Extract<RoomToHost, { t: 'buzz' }>;
export type RoomQueue = Extract<RoomToHost, { t: 'queue' }>;
export type RoomWager = Extract<RoomToHost, { t: 'wager' }>;

/** What the link needs from a WebSocket (the browser's, or a test's fake). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface LinkDeps {
  WebSocket: new (url: string) => SocketLike;
  fetch: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => number;
}

export interface LinkEvents {
  /** The status, code, phones or error changed. */
  onChange?: () => void;
  onBuzz?: (b: RoomBuzz) => void;
  /** The room's queue of buzzes for an arm changed. */
  onQueue?: (q: RoomQueue) => void;
  /** The room turned a phone away: too many phones are connected. */
  onFull?: () => void;
  /** A player sent their wager from their phone. */
  onWager?: (w: RoomWager) => void;
}

const OPEN = 1;
export const PING_MS = 15_000;
/** Nothing heard for this long (not even a pong): the socket is dead, start again. */
export const SILENT_MS = 40_000;
/** Debounce for state sends (arming goes at once). */
export const STATE_MS = 50;
/** Reconnect waits: 0.5 s, 1 s, 2 s… up to 15 s. */
export const retryDelay = (attempt: number): number => Math.min(15_000, 500 * 2 ** attempt);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function parsePhone(x: unknown): PhoneInfo | null {
  if (!isObj(x) || !isStr(x.conn) || typeof x.connected !== 'boolean') return null;
  if (!(x.seatId === null || isStr(x.seatId))) return null;
  if (x.pendingName !== undefined && !isStr(x.pendingName, 60)) return null;
  // Teams (added later): the member on that phone and their name.
  const member = isStr(x.member, 64) && x.member && isStr(x.name, 100) ? { member: x.member, name: x.name } : {};
  return { conn: x.conn, seatId: x.seatId, connected: x.connected, ...(x.pendingName !== undefined ? { pendingName: x.pendingName } : {}), ...member };
}

function parseQueued(x: unknown): QueuedBuzz | null {
  if (!isObj(x) || !isStr(x.seatId) || !isNum(x.afterMs)) return null;
  if (x.rolled !== undefined && !(isNum(x.rolled) && x.rolled >= 1)) return null;
  return {
    seatId: x.seatId,
    afterMs: x.afterMs,
    ...(x.rolled !== undefined ? { rolled: x.rolled } : {}),
    ...(x.arrivedLate === true ? { arrivedLate: true } : {}),
    ...(isStr(x.by, 100) && x.by ? { by: x.by } : {}),
  };
}

/** A message from the room, checked field by field (anything else is dropped). Takes the raw WebSocket data. */
export function parseRoomMsg(data: unknown): RoomToHost | null {
  let m: unknown;
  try {
    m = typeof data === 'string' ? JSON.parse(data) : null;
  } catch {
    return null;
  }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'welcome':
      if (!(isStr(m.code) && isRoomCode(m.code) && isNum(m.protocol) && isNum(m.serverNow))) return null;
      // features (added later): what the room can do beyond protocol 1 (teams…).
      return {
        t: 'welcome',
        code: m.code,
        protocol: m.protocol,
        serverNow: m.serverNow,
        ...(Array.isArray(m.features) ? { features: m.features.filter((f): f is string => isStr(f, 40)).slice(0, 20) } : {}),
      };
    case 'buzz':
      return isNum(m.armId) && isStr(m.seatId) && isNum(m.rank) && m.rank >= 1 && isNum(m.afterMs)
        ? { t: 'buzz', armId: m.armId, seatId: m.seatId, rank: m.rank, afterMs: m.afterMs, ...(isStr(m.by, 100) && m.by ? { by: m.by } : {}) }
        : null;
    case 'queue': {
      if (!isNum(m.armId) || !Array.isArray(m.queue) || m.queue.length > 200) return null;
      const queue = m.queue.map(parseQueued);
      if (!queue.every((q) => q)) return null;
      if (m.tie !== undefined && !(Array.isArray(m.tie) && m.tie.length <= 200 && m.tie.every((id) => isStr(id)))) return null;
      return { t: 'queue', armId: m.armId, queue: queue as QueuedBuzz[], ...(m.tie !== undefined ? { tie: m.tie as string[] } : {}) };
    }
    case 'phones': {
      if (!Array.isArray(m.phones) || m.phones.length > 200) return null;
      const phones = m.phones.map(parsePhone);
      return phones.every((p) => p) ? { t: 'phones', phones: phones as PhoneInfo[] } : null;
    }
    case 'pong':
      return isNum(m.at) && isNum(m.serverNow) ? { t: 'pong', at: m.at, serverNow: m.serverNow } : null;
    case 'error':
      return isStr(m.message, 500) ? { t: 'error', message: m.message } : null;
    case 'full':
      return { t: 'full' };
    case 'wager':
      return isStr(m.id, 100) && m.id && isStr(m.seatId) && Number.isSafeInteger(m.amount) && (m.amount as number) >= 0 && Number.isSafeInteger(m.n) && (m.n as number) >= 1
        ? { t: 'wager', id: m.id, seatId: m.seatId, amount: m.amount as number, n: m.n as number, ...(isStr(m.by, 100) && m.by ? { by: m.by } : {}) }
        : null;
    default:
      return null;
  }
}

/** Why the room turned the host away (a WebSocket close code 4000–4999), in plain words. */
export function closedText(code: number, reason = ''): string {
  if (code === 4004) return 'This buzzer room has ended (it was closed, or nobody used it for hours): start a new one';
  if (code === 4000) return 'The buzzer room is open in another window or tab of the app: this one let go of it';
  if (code === 4003) return 'This copy can’t get into that buzzer room any more: start a new one';
  return reason && !/^[a-z -]+$/.test(reason) ? reason : 'The buzzer room is closed: start a new one';
}

/** The `error` of a server's JSON error answer, or ''. */
const errorText = (x: unknown): string => (isObj(x) && isStr(x.error, 200) ? x.error : '');

/** POST /api/rooms's answer. */
export function parseNewRoom(x: unknown): NewRoom | null {
  return isObj(x) && isStr(x.code) && isRoomCode(x.code) && isStr(x.hostToken, 500) && x.hostToken.length > 0 ? { code: x.code, hostToken: x.hostToken } : null;
}

export function browserDeps(): LinkDeps {
  return {
    WebSocket: globalThis.WebSocket as unknown as LinkDeps['WebSocket'],
    fetch: (url, init) => globalThis.fetch(url, init),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  };
}

export class RoomLink {
  status: RoomStatus = 'off';
  code: string | null = null;
  phones: PhoneInfo[] = [];
  /** What the room said it can do beyond protocol 1 (its welcome's features; none from an older room). */
  features: string[] = [];
  error = '';
  /** Reconnect attempts since the room was last reached. */
  attempts = 0;
  room: NewRoom | null = null;

  private ws: SocketLike | null = null;
  private state: HostState | null = null;
  private sent = '';
  private stateTimer: unknown = null;
  private pingTimer: unknown = null;
  private retryTimer: unknown = null;
  private heard = 0;
  private stopped = true;
  /** end(): close the room as soon as it says welcome. */
  private ending = false;

  constructor(
    readonly base: string,
    private ev: LinkEvents = {},
    private deps: LinkDeps = browserDeps(),
  ) {}

  /** Make a new room and connect to it. Throws (with the status 'error') when the server can't make one. */
  async create(): Promise<NewRoom> {
    this.stopped = false;
    this.error = '';
    this.set('connecting');
    try {
      const res = await this.deps.fetch(`${this.base}/api/rooms`, { method: 'POST' });
      // The server says why in plain words (too many new rooms, busy today): show that.
      if (!res.ok) throw new Error((await res.json().then(errorText, () => '')) || `The buzzer server said no (${res.status})`);
      const room = parseNewRoom(await res.json());
      if (!room) throw new Error('The buzzer server gave an answer this app doesn’t understand');
      if (this.stopped) throw new Error('Stopped');
      this.connect(room);
      return room;
    } catch (err) {
      if (!this.stopped) {
        this.error = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Couldn’t reach the buzzer server';
        this.set('error');
      }
      throw err;
    }
  }

  /** Connect to a room (a new one, or the one a resumed game was using). */
  connect(room: NewRoom): void {
    this.stopped = false;
    this.room = room;
    this.code = room.code;
    this.attempts = 0;
    this.open('connecting');
  }

  /** The host's state: sent STATE_MS after the last change, or at once (`now`), and again after every reconnect. */
  setState(state: HostState, now = false): void {
    this.state = state;
    if (now) return this.flush();
    if (this.stateTimer === null) this.stateTimer = this.deps.setTimeout(() => this.flush(), STATE_MS);
  }

  /** Send the state again even if it hasn't changed (the room went its own way, e.g. a buzz the host overruled). */
  resend(): void {
    this.sent = '';
    this.flush();
  }

  send(msg: HostMsg): boolean {
    if (this.status !== 'online' || !this.ws || this.ws.readyState !== OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Close a room this link isn't in (one left open by an earlier page): connect, close it, stop. */
  end(room: NewRoom): void {
    this.ending = true;
    this.connect(room);
  }

  /** Close the room for good (the phones are told), and stop. */
  close(): void {
    this.send({ t: 'close' });
    this.stop();
  }

  /** Let go of the room without closing it (it can be picked up again with connect()). */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close(1000);
      } catch {
        // Already closed.
      }
    }
    this.room = null;
    this.code = null;
    this.phones = [];
    this.sent = '';
    this.attempts = 0;
    this.set('off');
  }

  private flush(): void {
    if (this.stateTimer !== null) this.deps.clearTimeout(this.stateTimer);
    this.stateTimer = null;
    if (!this.state) return;
    const json = JSON.stringify({ t: 'state', state: this.state } satisfies HostMsg);
    if (json === this.sent || this.status !== 'online' || this.ws?.readyState !== OPEN) return;
    this.ws.send(json);
    this.sent = json;
  }

  private set(status: RoomStatus): void {
    this.status = status;
    this.ev.onChange?.();
  }

  private clearTimers(): void {
    for (const t of [this.stateTimer, this.pingTimer, this.retryTimer]) if (t !== null) this.deps.clearTimeout(t);
    this.stateTimer = this.pingTimer = this.retryTimer = null;
  }

  private open(status: RoomStatus): void {
    if (!this.room) return;
    this.set(status);
    let ws: SocketLike;
    try {
      ws = new this.deps.WebSocket(socketUrl(this.base, this.room.code, this.room.hostToken));
    } catch {
      return this.retry();
    }
    this.ws = ws;
    this.sent = '';
    ws.onmessage = (e) => ws === this.ws && this.receive(e.data);
    ws.onclose = (e) => {
      if (ws !== this.ws) return;
      this.ws = null;
      if (this.pingTimer !== null) this.deps.clearTimeout(this.pingTimer);
      this.pingTimer = null;
      // 4000–4999: the room turned the host away on purpose (closed, expired, a wrong token). No point trying again.
      if (e.code >= 4000 && e.code < 5000) {
        if (this.ending) return this.stop();
        this.error = closedText(e.code, e.reason);
        this.room = null;
        this.set('error');
        return;
      }
      this.retry();
    };
    ws.onerror = () => {};
  }

  private retry(): void {
    if (this.stopped || !this.room) return;
    // Only ending an old room: not worth more than a few tries (it ends by itself after hours anyway).
    if (this.ending && this.attempts >= 3) return this.stop();
    const wait = retryDelay(this.attempts++);
    this.set('reconnecting');
    this.retryTimer = this.deps.setTimeout(() => {
      this.retryTimer = null;
      this.open('reconnecting');
    }, wait);
  }

  private ping(): void {
    this.pingTimer = this.deps.setTimeout(() => {
      this.pingTimer = null;
      const ws = this.ws;
      if (!ws) return;
      if (this.deps.now() - this.heard > SILENT_MS) {
        // A socket that went quiet without closing (a laptop asleep, a dropped Wi-Fi): start again.
        ws.onclose?.({ code: 1006 });
        try {
          ws.close();
        } catch {
          // Gone.
        }
        return;
      }
      this.send({ t: 'ping', at: this.deps.now() });
      this.ping();
    }, PING_MS);
  }

  private receive(data: unknown): void {
    const m = parseRoomMsg(data);
    if (!m) return;
    this.heard = this.deps.now();
    switch (m.t) {
      case 'welcome':
        if (m.protocol !== BUZZ_PROTOCOL) {
          this.error = 'The buzzer server runs another version: update the app';
          this.stop();
          this.set('error');
          return;
        }
        if (this.ending) {
          this.status = 'online';
          return this.close();
        }
        this.code = m.code;
        this.features = m.features ?? [];
        this.attempts = 0;
        this.error = '';
        this.set('online');
        if (this.pingTimer === null) this.ping();
        this.resend();
        return;
      case 'buzz':
        this.ev.onBuzz?.(m);
        return;
      case 'queue':
        this.ev.onQueue?.(m);
        return;
      case 'phones':
        this.phones = m.phones;
        this.ev.onChange?.();
        return;
      case 'error':
        this.error = m.message;
        this.ev.onChange?.();
        return;
      case 'full':
        this.ev.onFull?.();
        return;
      case 'wager':
        this.ev.onWager?.(m);
        return;
      case 'pong':
        return;
    }
  }
}
