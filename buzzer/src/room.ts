/**
 * One buzzer room's rules, with no Cloudflare APIs: the Durable Object (index.ts) feeds it socket events and gives it
 * a clock, a token maker and ways to send and save. Tests drive it directly (room.test.ts).
 *
 * The host owns the game (seats, phase, clue, lock-outs, scores) and sends its whole HostState on every change. The
 * room owns the race: while armed, the first counted buzz wins, and the room moves to 'answering' itself.
 *
 * Re-arming: the host always bumps armId to open the buzzers again (after a wrong answer, a new clue…). A state that
 * says 'armed' with the armId of a race the room already decided is the host not having seen the buzz yet: the
 * room keeps its winner ('answering').
 *
 * Seats: a seat with a token is taken, whether or not its phone is connected right now, so a player whose phone
 * sleeps or reloads gets it back with the token (join with token). Another socket coming back with the right token
 * takes the seat; the old socket is detached (it gets the seat list again, not 'kicked'). Only the host frees a seat
 * someone holds: kick (or removing the seat from the game).
 *
 * An early buzz (while 'closed') locks the seat, not the socket, so a reload doesn't clear it.
 */
import {
  BUZZ_PROTOCOL,
  phoneView,
  type BuzzPhase,
  type HostState,
  type PhoneInfo,
  type RoomToHost,
  type RoomToPhone,
  type Seat,
} from '../../src/lib/buzzproto';

export const MAX_PHONES = 24;
/** Messages bigger than this (bytes) are dropped unread. */
export const HOST_MSG_MAX = 8 * 1024;
export const PHONE_MSG_MAX = 1024;
/** A new player's name (phones type it). */
export const NAME_MAX = 24;
/** Messages per socket per second; more are dropped. */
export const PHONE_RATE = 20;
export const HOST_RATE = 50;
/** join / new attempts per phone per minute. */
export const JOIN_RATE = 10;

/** The current arm's race. */
export interface Race {
  armId: number;
  armedAt: number;
  /** The seat that buzzed first, once someone has. */
  winner: string | null;
  winnerAt: number;
  /** Seats whose buzz counted in this arm, in order (winner first). */
  buzzed: string[];
}

/** What the room keeps in storage (saved whole after every change). */
export interface RoomSaved {
  state: HostState | null;
  /** Seat id → its token. A seat with a token is taken. */
  tokens: Record<string, string>;
  /** Seat id → the conn that last held it (listed to the host as away while that phone is gone). */
  holders: Record<string, string>;
  race: Race | null;
  /** Seat id → when its early-buzz lock ends. */
  earlyLocks: Record<string, number>;
}

/** What each phone socket keeps (stored on the socket, so it survives hibernation). */
export interface PhoneSaved {
  conn: string;
  seatId: string | null;
  pendingName?: string;
}

export interface RoomDeps {
  now(): number;
  /** A fresh unguessable token (≥ 128 random bits, base64url). */
  token(): string;
  toHost(msg: RoomToHost): void;
  toPhone(conn: string, msg: RoomToPhone): void;
  saveRoom(saved: RoomSaved): void;
  savePhone(phone: PhoneSaved): void;
}

interface Phone extends PhoneSaved {
  /** The last view / seats message sent, so unchanged ones aren't sent again. */
  lastView?: string;
  lastSeats?: string;
  rate: Window;
  joins: Window;
}

interface Window {
  start: number;
  count: number;
}

export const emptyRoom = (): RoomSaved => ({ state: null, tokens: {}, holders: {}, race: null, earlyLocks: {} });

export class Room {
  private s: RoomSaved;
  private phones = new Map<string, Phone>();
  private hostHere: boolean;
  private hostRate: Window = { start: 0, count: 0 };
  private lastPhones = '';

  constructor(
    private code: string,
    private deps: RoomDeps,
    saved: RoomSaved = emptyRoom(),
    phones: PhoneSaved[] = [],
    hostHere = false,
  ) {
    this.s = saved;
    this.hostHere = hostHere;
    for (const p of phones) this.phones.set(p.conn, { ...p, rate: { start: 0, count: 0 }, joins: { start: 0, count: 0 } });
  }

  /** For tests and the Durable Object. */
  get saved(): RoomSaved {
    return this.s;
  }
  get phoneCount(): number {
    return this.phones.size;
  }

  // ---- host ----

  hostOpen(): void {
    this.hostHere = true;
    this.lastPhones = '';
    this.deps.toHost({ t: 'welcome', code: this.code, protocol: BUZZ_PROTOCOL, serverNow: this.deps.now() });
    this.sync();
  }

  hostClose(): void {
    this.hostHere = false;
    this.sync();
  }

  /** Returns 'close' when the host closed the room (phones have been told; the caller drops sockets and storage). */
  hostMessage(raw: unknown): 'close' | void {
    if (!this.allow(this.hostRate, HOST_RATE, 1000)) return;
    const m = parse(raw, HOST_MSG_MAX);
    if (!m) return;
    switch (m.t) {
      case 'state': {
        const next = cleanState(m.state);
        if (!next) return this.deps.toHost({ t: 'error', message: 'bad state' });
        this.setState(next);
        break;
      }
      case 'accept':
        if (typeof m.conn === 'string' && typeof m.seatId === 'string') this.accept(m.conn, m.seatId);
        break;
      case 'reject':
        if (typeof m.conn === 'string') this.reject(m.conn);
        break;
      case 'kick':
        if (typeof m.seatId === 'string') this.kick(m.seatId);
        break;
      case 'close':
        for (const conn of this.phones.keys()) this.deps.toPhone(conn, { t: 'closed' });
        return 'close';
      case 'ping':
        if (typeof m.at === 'number') this.deps.toHost({ t: 'pong', at: m.at, serverNow: this.deps.now() });
        break;
    }
  }

  private setState(next: HostState): void {
    const prev = this.s.state;
    const race = this.s.race;
    const now = this.deps.now();
    const winnerStays = race?.winner && next.seats.some((x) => x.id === race.winner);
    if (race && race.armId === next.armId && winnerStays && next.phase === 'armed') {
      // The host hasn't seen the winning buzz yet: the room's decision stands.
      next.phase = 'answering';
      next.answering = race.winner;
    } else if (next.phase === 'armed' && (!race || race.armId !== next.armId || race.winner)) {
      this.s.race = { armId: next.armId, armedAt: now, winner: null, winnerAt: 0, buzzed: [] };
    }
    this.s.state = next;
    // Seats gone from the game free their tokens and phones.
    const ids = new Set(next.seats.map((x) => x.id));
    for (const id of Object.keys(this.s.tokens)) if (!ids.has(id)) this.freeSeat(id);
    for (const id of Object.keys(this.s.earlyLocks)) if (!ids.has(id) || this.s.earlyLocks[id] <= now) delete this.s.earlyLocks[id];
    // Turning off new players turns away those waiting.
    if (prev?.allowNew && !next.allowNew) {
      for (const p of this.phones.values()) if (p.pendingName !== undefined) {
        delete p.pendingName;
        this.deps.savePhone(strip(p));
        this.deps.toPhone(p.conn, { t: 'denied', reason: 'no-new' });
      }
    }
    this.save();
  }

  private accept(conn: string, seatId: string): void {
    const p = this.phones.get(conn);
    if (!p || p.pendingName === undefined) return;
    delete p.pendingName;
    if (!this.s.state?.seats.some((x) => x.id === seatId)) this.deps.toPhone(conn, { t: 'denied', reason: 'unknown-seat' });
    else if (this.s.tokens[seatId]) this.deps.toPhone(conn, { t: 'denied', reason: 'taken' });
    else return this.seat(p, seatId);
    this.deps.savePhone(strip(p));
    this.sync();
  }

  private reject(conn: string): void {
    const p = this.phones.get(conn);
    if (!p || p.pendingName === undefined) return;
    delete p.pendingName;
    this.deps.savePhone(strip(p));
    this.deps.toPhone(conn, { t: 'denied', reason: 'rejected' });
    this.sync();
  }

  private kick(seatId: string): void {
    if (!this.s.tokens[seatId] && ![...this.phones.values()].some((p) => p.seatId === seatId)) return;
    this.freeSeat(seatId, true);
    this.save();
  }

  /** Revokes a seat's token and unseats its phone (told 'kicked' when kick). */
  private freeSeat(seatId: string, kicked = false): void {
    delete this.s.tokens[seatId];
    delete this.s.holders[seatId];
    delete this.s.earlyLocks[seatId];
    for (const p of this.phones.values()) {
      if (p.seatId !== seatId) continue;
      p.seatId = null;
      p.lastView = p.lastSeats = undefined;
      this.deps.savePhone(strip(p));
      if (kicked) this.deps.toPhone(p.conn, { t: 'kicked' });
    }
  }

  // ---- phones ----

  /** A phone connected. false when the room is full (the caller tells it and closes it). */
  phoneOpen(conn: string): boolean {
    if (this.phones.size >= MAX_PHONES) return false;
    const p: Phone = { conn, seatId: null, rate: { start: 0, count: 0 }, joins: { start: 0, count: 0 } };
    this.phones.set(conn, p);
    this.deps.savePhone(strip(p));
    this.sync();
    return true;
  }

  phoneClose(conn: string): void {
    if (!this.phones.delete(conn)) return;
    this.sync();
  }

  phoneMessage(conn: string, raw: unknown): void {
    const p = this.phones.get(conn);
    if (!p || !this.allow(p.rate, PHONE_RATE, 1000)) return;
    const m = parse(raw, PHONE_MSG_MAX);
    if (!m) return;
    switch (m.t) {
      case 'join':
        if (typeof m.seatId !== 'string' || (m.token !== undefined && typeof m.token !== 'string')) return;
        if (this.allow(p.joins, JOIN_RATE, 60_000)) this.join(p, m.seatId, m.token);
        break;
      case 'new':
        if (typeof m.name !== 'string') return;
        if (this.allow(p.joins, JOIN_RATE, 60_000)) this.askNew(p, m.name);
        break;
      case 'buzz':
        if (typeof m.armId === 'number') this.buzz(p, m.armId);
        break;
      case 'leave':
        if (p.seatId) {
          this.freeSeat(p.seatId);
          this.save();
        } else if (p.pendingName !== undefined) {
          delete p.pendingName;
          this.deps.savePhone(strip(p));
          this.sync();
        }
        break;
      case 'ping':
        if (typeof m.at === 'number') this.deps.toPhone(conn, { t: 'pong', at: m.at, serverNow: this.deps.now() });
        break;
    }
  }

  private join(p: Phone, seatId: string, token?: string): void {
    const deny = (reason: 'taken' | 'unknown-seat' | 'bad-token') => this.deps.toPhone(p.conn, { t: 'denied', reason });
    if (!this.s.state?.seats.some((x) => x.id === seatId)) return deny('unknown-seat');
    if (p.seatId === seatId) return; // already there
    const held = this.s.tokens[seatId];
    if (token !== undefined) {
      // A token names one claim of one seat: a kicked or freed seat's old token doesn't take it back.
      if (held !== token) return deny(held ? 'taken' : 'bad-token');
      // Coming back: the socket that held it (another tab, a dead connection) is detached.
      for (const o of this.phones.values()) if (o !== p && o.seatId === seatId) {
        o.seatId = null;
        o.lastView = o.lastSeats = undefined;
        this.deps.savePhone(strip(o));
      }
      if (p.seatId) this.freeSeat(p.seatId);
      delete p.pendingName;
      p.seatId = seatId;
      p.lastView = p.lastSeats = undefined;
      this.s.holders[seatId] = p.conn;
      this.deps.savePhone(strip(p));
      this.deps.toPhone(p.conn, { t: 'joined', seatId, token });
      this.save();
      return;
    }
    if (held) return deny('taken');
    if (p.seatId) this.freeSeat(p.seatId);
    delete p.pendingName;
    this.seat(p, seatId);
  }

  /** Gives a phone a free seat with a fresh token. */
  private seat(p: Phone, seatId: string): void {
    const token = this.deps.token();
    this.s.tokens[seatId] = token;
    this.s.holders[seatId] = p.conn;
    p.seatId = seatId;
    p.lastView = p.lastSeats = undefined;
    this.deps.savePhone(strip(p));
    this.deps.toPhone(p.conn, { t: 'joined', seatId, token });
    this.save();
  }

  private askNew(p: Phone, raw: string): void {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX).trim();
    if (!name || p.seatId) return;
    if (!this.s.state?.allowNew) return this.deps.toPhone(p.conn, { t: 'denied', reason: 'no-new' });
    p.pendingName = name;
    this.deps.savePhone(strip(p));
    this.deps.toPhone(p.conn, { t: 'waiting' });
    this.sync();
  }

  private buzz(p: Phone, armId: number): void {
    const st = this.s.state;
    const seatId = p.seatId;
    if (!st || !seatId || st.phase === 'lobby') return;
    const now = this.deps.now();
    const result = (outcome: 'first' | 'late' | 'early' | 'locked', extra: { rank?: number; afterMs?: number; lockedUntil?: number } = {}) =>
      this.deps.toPhone(p.conn, { t: 'result', armId, outcome, ...extra });
    if (st.phase === 'closed') {
      // Pressing again while closed starts the penalty over, as on the show.
      if (st.earlyLockMs > 0) this.s.earlyLocks[seatId] = now + st.earlyLockMs;
      result('early', { lockedUntil: now + st.earlyLockMs });
      if (st.earlyLockMs > 0) this.save();
      return;
    }
    if (armId !== st.armId) return result('late');
    if (st.lockedOut.includes(seatId)) return result('locked');
    const until = this.s.earlyLocks[seatId] ?? 0;
    if (until > now) return result('locked', { lockedUntil: until });
    let race = this.s.race;
    if (!race || race.armId !== st.armId) {
      if (st.phase !== 'armed') return result('late'); // the host set 'answering' itself: there is no race to rank
      race = this.s.race = { armId: st.armId, armedAt: now, winner: null, winnerAt: 0, buzzed: [] };
    }
    if (race.buzzed.includes(seatId)) return; // one counted buzz per seat per arm
    race.buzzed.push(seatId);
    if (!race.winner && st.phase === 'armed') {
      race.winner = seatId;
      race.winnerAt = now;
      st.phase = 'answering';
      st.answering = seatId;
      this.deps.toHost({ t: 'buzz', armId, seatId, rank: 1, afterMs: 0 });
      result('first', { rank: 1, afterMs: 0 });
    } else if (race.winner) {
      const rank = race.buzzed.length;
      const afterMs = now - race.winnerAt;
      this.deps.toHost({ t: 'buzz', armId, seatId, rank, afterMs });
      result('late', { rank, afterMs });
    } else {
      race.buzzed.pop();
      return result('late');
    }
    this.save();
  }

  // ---- sending ----

  private save(): void {
    this.deps.saveRoom(this.s);
    this.sync();
  }

  /** Brings every phone and the host up to date, sending only what changed. */
  private sync(): void {
    const st = this.s.state;
    const seatsMsg = JSON.stringify({
      t: 'seats',
      title: st?.title ?? '',
      seats: (st?.seats ?? []).map((x) => ({ ...x, taken: !!this.s.tokens[x.id] })),
      allowNew: st?.allowNew ?? false,
      hostHere: this.hostHere,
    } satisfies RoomToPhone);
    for (const p of this.phones.values()) {
      if (p.seatId && st) {
        const view = phoneView(st, p.seatId);
        const key = JSON.stringify(view);
        if (key !== p.lastView) {
          p.lastView = key;
          this.deps.toPhone(p.conn, { t: 'view', view });
        }
      } else if (seatsMsg !== p.lastSeats) {
        p.lastSeats = seatsMsg;
        this.deps.toPhone(p.conn, JSON.parse(seatsMsg));
      }
    }
    if (!this.hostHere) return;
    const list: PhoneInfo[] = [...this.phones.values()].map((p) => ({
      conn: p.conn,
      seatId: p.seatId,
      ...(p.pendingName !== undefined ? { pendingName: p.pendingName } : {}),
      connected: true,
    }));
    for (const [seatId, conn] of Object.entries(this.s.holders)) {
      if (this.s.tokens[seatId] && ![...this.phones.values()].some((p) => p.seatId === seatId)) list.push({ conn, seatId, connected: false });
    }
    const key = JSON.stringify(list);
    if (key !== this.lastPhones) {
      this.lastPhones = key;
      this.deps.toHost({ t: 'phones', phones: list });
    }
  }

  /** Fixed-window rate limit: false (drop) once `max` events land in one window. */
  private allow(w: Window, max: number, ms: number): boolean {
    const now = this.deps.now();
    if (now - w.start >= ms) {
      w.start = now;
      w.count = 0;
    }
    return ++w.count <= max;
  }
}

const strip = (p: Phone): PhoneSaved => ({ conn: p.conn, seatId: p.seatId, ...(p.pendingName !== undefined ? { pendingName: p.pendingName } : {}) });

// ---- checking untrusted messages ----

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** A JSON object with a string `t`, or null (not a string, too big, not JSON). */
function parse(raw: unknown, max: number): (Obj & { t: string }) | null {
  if (typeof raw !== 'string' || raw.length > max || bytes(raw) > max) return null;
  try {
    const m: unknown = JSON.parse(raw);
    return isObj(m) && typeof m.t === 'string' ? (m as Obj & { t: string }) : null;
  } catch {
    return null;
  }
}

const PHASES: BuzzPhase[] = ['lobby', 'closed', 'armed', 'answering'];
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** The host's state checked and trimmed to what the room passes on; null when its shape is wrong. */
export function cleanState(x: unknown): HostState | null {
  if (!isObj(x)) return null;
  if (typeof x.title !== 'string' || !Array.isArray(x.seats) || typeof x.allowNew !== 'boolean') return null;
  if (typeof x.phase !== 'string' || !PHASES.includes(x.phase as BuzzPhase)) return null;
  if (!Number.isSafeInteger(x.armId) || (x.armId as number) < 0) return null;
  if (!Array.isArray(x.lockedOut) || typeof x.earlyLockMs !== 'number' || !isObj(x.scores)) return null;
  const seats: Seat[] = [];
  for (const s of x.seats.slice(0, 64)) {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id || s.id.length > 64 || typeof s.name !== 'string') return null;
    if (seats.some((o) => o.id === s.id)) continue;
    seats.push({ id: s.id, name: s.name.trim().slice(0, 40), color: typeof s.color === 'string' && COLOR.test(s.color) ? s.color : '#4f7cff' });
  }
  const ids = new Set(seats.map((s) => s.id));
  let clue: HostState['clue'] = null;
  if (x.clue !== undefined && x.clue !== null) {
    if (!isObj(x.clue) || typeof x.clue.text !== 'string') return null;
    clue = { text: x.clue.text.slice(0, 1000) };
    if (typeof x.clue.caption === 'string' && x.clue.caption) clue.caption = x.clue.caption.slice(0, 200);
  }
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(x.scores)) if (ids.has(k) && typeof v === 'number' && Number.isFinite(v)) scores[k] = v;
  const answering = typeof x.answering === 'string' && ids.has(x.answering) ? x.answering : null;
  return {
    title: x.title.slice(0, 200),
    seats,
    allowNew: x.allowNew,
    phase: x.phase as BuzzPhase,
    armId: x.armId as number,
    clue,
    answering,
    lockedOut: x.lockedOut.filter((id): id is string => typeof id === 'string' && ids.has(id)),
    earlyLockMs: Number.isFinite(x.earlyLockMs) ? Math.max(0, Math.min(10_000, Math.round(x.earlyLockMs))) : 0,
    scores,
  };
}
