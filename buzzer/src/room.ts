/**
 * One buzzer room's rules, with no Cloudflare APIs: the Durable Object (index.ts) feeds it socket events and gives it
 * a clock, timers, a token maker and ways to send and save. Tests drive it directly (room.test.ts).
 *
 * The host owns the game (seats, phase, clue, lock-outs, scores) and sends its whole HostState on every change. The
 * room owns the race: while armed, the fastest counted buzz wins, and the room moves to 'answering' itself. Every
 * buzz of the arm is kept in a queue, fastest first, so the host can go to the next in line.
 *
 * Fair timing: each phone sends how long after its own BUZZ! light it pressed (reactMs), so a phone on a slow network
 * isn't behind. The room trusts that only as far as it can check it: the time from arming to the buzz arriving, minus
 * reactMs, is the network's share, and it can't be more than that phone's round trip (which the room times itself:
 * pong → sync) plus NET_TOLERANCE_MS. So a phone lying about reactMs gains at most about one round trip. A missing or
 * impossible reactMs falls back to the arrival time minus the round trip (see rankKey). The first buzz opens a grace
 * window (GRACE_MS) to collect buzzes still on their way; then the lowest key wins. Keys within TIE_MS of the fastest
 * are a tie: the room picks nobody and the host decides (picks one, or rolls and sends rollOrder).
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
  TIE_MS,
  type BuzzPhase,
  type HostState,
  type PhoneInfo,
  type QueuedBuzz,
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
/** After the first buzz of an arm, how long the room waits for buzzes still on their way before deciding. */
export const GRACE_MS = 250;
/** Round-trip samples kept per phone; the median is used (one slow or lucky sample doesn't swing it). */
export const RTT_SAMPLES = 5;
/** The round trip assumed when checking reactMs from a phone the room hasn't timed yet. */
export const DEFAULT_RTT_MS = 300;
/** A round trip longer than this counts as this (a phone stalling its sync can't buy itself much more slack). */
export const MAX_RTT_MS = 1000;
/** Slack on top of the round trip for the phone drawing the screen and network jitter. */
export const NET_TOLERANCE_MS = 150;
/** No ranking key is lower than this: nobody reacts faster, so anything below is a tie. */
export const MIN_REACT_MS = 50;

/** A counted buzz. key: its ranking key (ms, see rankKey); n: arrival order in the arm. */
export interface Buzz {
  seatId: string;
  key: number;
  n: number;
}

/** The current arm's race. */
export interface Race {
  armId: number;
  armedAt: number;
  /** Every counted buzz: in arrival order during the grace window, then ranked (fastest first). */
  queue: Buzz[];
  /** When the grace window ends (set while it is open). */
  graceUntil?: number;
  /** The window is over (or the host decided): later buzzes join the queue, after the head. */
  decided: boolean;
  /** The first `head` places are settled (the winner, or the tied seats) and later buzzes can't pass them. */
  head: number;
  /** The seat answering by the room's decision or the host's pick. */
  winner: string | null;
  /** Seats tied for first, until the host decides. */
  tie?: string[];
  /** The order a tie was rolled in. */
  rolled?: string[];
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
  /** The last few round trips the room timed (ms, newest last). */
  rtts?: number[];
}

export interface RoomDeps {
  now(): number;
  /** A fresh unguessable token (≥ 128 random bits, base64url). */
  token(): string;
  toHost(msg: RoomToHost): void;
  toPhone(conn: string, msg: RoomToPhone): void;
  saveRoom(saved: RoomSaved): void;
  savePhone(phone: PhoneSaved): void;
  /** Run fn in ms (the grace window); returns a handle for cancel. */
  schedule(ms: number, fn: () => void): unknown;
  cancel(handle: unknown): void;
}

interface Phone extends PhoneSaved {
  /** The last view / seats message sent, so unchanged ones aren't sent again. */
  lastView?: string;
  lastSeats?: string;
  rate: Window;
  joins: Window;
  /** serverNow of pongs sent and not yet echoed (only those count as a sync). */
  pongs: number[];
}

interface Window {
  start: number;
  count: number;
}

export const emptyRoom = (): RoomSaved => ({ state: null, tokens: {}, holders: {}, race: null, earlyLocks: {} });

/**
 * A buzz's ranking key (lower wins): the phone's own reaction time when it is plausible (not negative, not more than
 * the time since arming, and leaving no more than the round trip + NET_TOLERANCE_MS for the network), else the time
 * since arming minus the round trip. rttMs null: not timed yet. Never below MIN_REACT_MS.
 */
export function rankKey(elapsedMs: number, reactMs: number | undefined, rttMs: number | null): number {
  const plausible =
    reactMs !== undefined &&
    Number.isFinite(reactMs) &&
    reactMs >= 0 &&
    reactMs <= elapsedMs &&
    elapsedMs - reactMs <= (rttMs ?? DEFAULT_RTT_MS) + NET_TOLERANCE_MS;
  const key = plausible ? reactMs : Math.max(0, elapsedMs - (rttMs ?? 0));
  return Math.max(MIN_REACT_MS, Math.round(key));
}

/** The median of a few numbers (the lower middle one for an even count). */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

const newRace = (armId: number, armedAt: number): Race => ({ armId, armedAt, queue: [], decided: false, head: 0, winner: null });
const byKey = (a: Buzz, b: Buzz) => a.key - b.key || a.n - b.n;

export class Room {
  private s: RoomSaved;
  private phones = new Map<string, Phone>();
  private hostHere: boolean;
  private hostRate: Window = { start: 0, count: 0 };
  private lastPhones = '';
  /** The grace window's timer. */
  private grace: unknown = null;
  /** The last queue / results sent this arm, so unchanged ones aren't sent again. */
  private lastQueue = '';
  private lastResults = new Map<string, string>();

  constructor(
    private code: string,
    private deps: RoomDeps,
    saved: RoomSaved = emptyRoom(),
    phones: PhoneSaved[] = [],
    hostHere = false,
  ) {
    this.s = saved;
    // A race saved by an older version of the room (no queue) is dropped.
    if (this.s.race && !Array.isArray(this.s.race.queue)) this.s.race = null;
    this.hostHere = hostHere;
    for (const p of phones) this.phones.set(p.conn, { ...p, rate: { start: 0, count: 0 }, joins: { start: 0, count: 0 }, pongs: [] });
    // Woken (or restarted) in the middle of a grace window: finish it on time, or at once if that's past.
    const race = this.s.race;
    if (race && race.graceUntil !== undefined && !race.decided)
      this.grace = this.deps.schedule(Math.max(0, race.graceUntil - this.deps.now()), () => this.resolve());
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
    this.lastQueue = '';
    this.deps.toHost({ t: 'welcome', code: this.code, protocol: BUZZ_PROTOCOL, serverNow: this.deps.now() });
    this.sync();
    this.announce();
  }

  hostClose(): void {
    this.hostHere = false;
    this.sync();
  }

  /** Returns 'close' when the host closed the room (phones have been told; the caller drops sockets and storage). */
  hostMessage(raw: unknown): 'close' | void {
    this.settle();
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
        this.stopGrace();
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
    const same = !!race && race.armId === next.armId;
    const seatIds = new Set(next.seats.map((x) => x.id));
    // The host moved on during a grace window: the host wins. A new arm drops the buzzes; anything else ranks them now.
    if (race && race.graceUntil !== undefined && !race.decided && (!same || next.phase !== 'armed')) {
      this.stopGrace();
      delete race.graceUntil;
      if (same) this.rank(race);
    }
    if (race && same && race.decided && next.phase === 'armed') {
      // The host hasn't seen the room's decision yet: it stands.
      if (race.winner && seatIds.has(race.winner)) {
        next.phase = 'answering';
        next.answering = race.winner;
      } else if (race.tie) {
        next.phase = 'answering';
        next.answering = null;
      } else {
        this.newRace(next.armId, now);
      }
    } else if (race && same && next.phase === 'answering' && next.answering && race.graceUntil === undefined) {
      // The host picked who answers (a tie settled, the next in line, a key): that seat goes first.
      if (next.answering !== race.winner || (next.rollOrder && next.rollOrder.join() !== race.rolled?.join())) this.hostPick(race, next.answering, next.rollOrder);
    } else if (next.phase === 'armed' && (!race || !same || race.decided)) {
      this.newRace(next.armId, now);
    }
    delete next.rollOrder;
    this.s.state = next;
    // Seats gone from the game free their tokens and phones.
    for (const id of Object.keys(this.s.tokens)) if (!seatIds.has(id)) this.freeSeat(id);
    for (const id of Object.keys(this.s.earlyLocks)) if (!seatIds.has(id) || this.s.earlyLocks[id] <= now) delete this.s.earlyLocks[id];
    // Turning off new players turns away those waiting.
    if (prev?.allowNew && !next.allowNew) {
      for (const p of this.phones.values()) if (p.pendingName !== undefined) {
        delete p.pendingName;
        this.deps.savePhone(strip(p));
        this.deps.toPhone(p.conn, { t: 'denied', reason: 'no-new' });
      }
    }
    this.save();
    this.announce();
  }

  private newRace(armId: number, now: number): void {
    this.s.race = newRace(armId, now);
    this.lastQueue = '';
    this.lastResults.clear();
  }

  /**
   * The host's pick: `seatId` answers and goes first. After a tie, rollOrder (the tied seats as rolled) goes first in
   * that order; picked by hand, the rest of the tie keep their arrival order.
   */
  private hostPick(race: Race, seatId: string, rollOrder?: string[]): void {
    if (!race.decided) this.rank(race, false);
    const tie = race.tie ?? (race.rolled ? race.queue.slice(0, race.head).map((b) => b.seatId) : []);
    const inQueue = (id: string) => race.queue.some((b) => b.seatId === id);
    let head: string[];
    let rolled: string[] | undefined;
    if (rollOrder?.[0] === seatId && rollOrder.every((id) => tie.includes(id))) {
      rolled = [...rollOrder, ...tie.filter((id) => !rollOrder.includes(id))];
      head = rolled;
    } else if (tie.includes(seatId)) {
      const rest = race.queue.filter((b) => tie.includes(b.seatId) && b.seatId !== seatId).sort((a, b) => a.n - b.n);
      head = [seatId, ...rest.map((b) => b.seatId)];
    } else {
      head = inQueue(seatId) ? [seatId] : [];
    }
    const first = head.map((id) => race.queue.find((b) => b.seatId === id)!);
    race.queue = [...first, ...race.queue.filter((b) => !head.includes(b.seatId)).sort(byKey)];
    race.head = head.length;
    race.winner = seatId;
    race.decided = true;
    delete race.tie;
    if (rolled) race.rolled = rolled;
    else delete race.rolled;
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
    const p: Phone = { conn, seatId: null, rate: { start: 0, count: 0 }, joins: { start: 0, count: 0 }, pongs: [] };
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
    this.settle();
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
        if (typeof m.armId === 'number') this.buzz(p, m.armId, typeof m.reactMs === 'number' ? m.reactMs : undefined);
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
        if (typeof m.at === 'number') {
          const serverNow = this.deps.now();
          p.pongs = [...p.pongs.slice(-3), serverNow];
          this.deps.toPhone(conn, { t: 'pong', at: m.at, serverNow });
        }
        break;
      case 'sync': {
        // The phone echoing a pong: the room's own round trip for it (only for a pong it really sent, once).
        const i = typeof m.serverNow === 'number' ? p.pongs.indexOf(m.serverNow) : -1;
        if (i < 0) return;
        p.pongs.splice(i, 1);
        const rtt = this.deps.now() - (m.serverNow as number);
        if (rtt < 0) return;
        p.rtts = [...(p.rtts ?? []).slice(1 - RTT_SAMPLES), rtt];
        this.deps.savePhone(strip(p));
        break;
      }
    }
  }

  /** A phone's round trip as the room timed it (the median of the last few), or null before the first. */
  rtt(conn: string): number | null {
    const r = this.phones.get(conn)?.rtts;
    return r?.length ? Math.min(MAX_RTT_MS, median(r)) : null;
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

  private buzz(p: Phone, armId: number, reactMs?: number): void {
    const st = this.s.state;
    const seatId = p.seatId;
    if (!st || !seatId || st.phase === 'lobby') return;
    const now = this.deps.now();
    const result = (outcome: 'pending' | 'late' | 'early' | 'locked', extra: { lockedUntil?: number } = {}) =>
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
      this.newRace(st.armId, now);
      race = this.s.race!;
    }
    if (race.queue.some((b) => b.seatId === seatId)) return; // one counted buzz per seat per arm
    const buzz: Buzz = { seatId, key: rankKey(now - race.armedAt, reactMs, this.rtt(p.conn)), n: race.queue.length };
    if (race.decided) {
      // After the grace window: into the queue by its key, behind the settled head.
      let i = race.head;
      while (i < race.queue.length && byKey(race.queue[i], buzz) <= 0) i++;
      race.queue.splice(i, 0, buzz);
      this.deps.toHost({ t: 'buzz', armId, seatId, rank: i + 1, afterMs: Math.max(0, buzz.key - race.queue[0].key) });
    } else if (st.phase === 'armed') {
      race.queue.push(buzz);
      if (race.graceUntil === undefined) {
        race.graceUntil = now + GRACE_MS;
        this.stopGrace();
        this.grace = this.deps.schedule(GRACE_MS, () => this.resolve());
      }
      result('pending');
    } else {
      return result('late');
    }
    this.save();
    this.announce();
  }

  /** A grace window whose time is up but whose timer hasn't run (the room slept or restarted): decide it now. */
  private settle(): void {
    const race = this.s.race;
    if (race && race.graceUntil !== undefined && !race.decided && this.deps.now() >= race.graceUntil) this.resolve();
  }

  private stopGrace(): void {
    if (this.grace !== null) this.deps.cancel(this.grace);
    this.grace = null;
  }

  /** The grace window ends: rank the buzzes, and the fastest answers (or a tie goes to the host). */
  private resolve(): void {
    this.stopGrace();
    const race = this.s.race;
    const st = this.s.state;
    if (!race || race.graceUntil === undefined || race.decided) return;
    delete race.graceUntil;
    if (!st || st.phase !== 'armed' || st.armId !== race.armId) {
      this.rank(race);
    } else {
      this.rank(race, true);
      if (race.tie) {
        st.phase = 'answering';
        st.answering = null;
      } else if (race.winner) {
        st.phase = 'answering';
        st.answering = race.winner;
        race.queue.forEach((b, i) => this.deps.toHost({ t: 'buzz', armId: race.armId, seatId: b.seatId, rank: i + 1, afterMs: b.key - race.queue[0].key }));
      }
    }
    this.save();
    this.announce();
  }

  /**
   * Ranks the collected buzzes (fastest first; ties: arrival) and settles the race. With `pick`, the fastest wins, or
   * the seats within TIE_MS of it tie. Seats gone from the game or locked out since don't count.
   */
  private rank(race: Race, pick = false): void {
    const st = this.s.state;
    const ok = (id: string) => !!st?.seats.some((x) => x.id === id) && !st.lockedOut.includes(id);
    race.queue = race.queue.filter((b) => ok(b.seatId)).sort(byKey);
    race.decided = true;
    race.head = 0;
    if (!pick || !race.queue.length) return;
    const tied = race.queue.filter((b) => b.key - race.queue[0].key <= TIE_MS);
    race.head = tied.length;
    if (tied.length > 1) race.tie = tied.map((b) => b.seatId);
    else race.winner = race.queue[0].seatId;
  }

  /** Tells the host the queue and each queued phone its place (only what changed). */
  private announce(): void {
    const race = this.s.race;
    const st = this.s.state;
    if (!race || !st || !race.decided) return;
    const lead = race.queue[0];
    const name = (id: string) => st.seats.find((x) => x.id === id)?.name ?? '';
    const queue: QueuedBuzz[] = race.queue.map((b) => {
      const r = race.rolled?.indexOf(b.seatId) ?? -1;
      return { seatId: b.seatId, afterMs: Math.max(0, b.key - lead.key), ...(r >= 0 ? { rolled: r + 1 } : {}) };
    });
    const msg: RoomToHost = { t: 'queue', armId: race.armId, queue, ...(race.tie ? { tie: race.tie } : {}) };
    const key = JSON.stringify(msg);
    if (this.hostHere && race.queue.length && key !== this.lastQueue) {
      this.lastQueue = key;
      this.deps.toHost(msg);
    }
    // The answering seat isn't in the queue when the host picked someone who hadn't buzzed: everyone moves down one.
    const shift = race.winner && !race.queue.some((b) => b.seatId === race.winner) ? 1 : 0;
    queue.forEach((q, i) => {
      const rank = i + 1 + shift;
      const rolled = q.rolled !== undefined ? { rolled: q.rolled } : {};
      let r: RoomToPhone;
      if (race.tie?.includes(q.seatId)) r = { t: 'result', armId: race.armId, outcome: 'tie', rank };
      else if (q.seatId === race.winner) {
        const next = queue[i + 1];
        r = { t: 'result', armId: race.armId, outcome: 'first', rank, afterMs: 0, ...(i === 0 && next ? { byMs: next.afterMs } : {}), ...rolled };
      } else if (shift) r = { t: 'result', armId: race.armId, outcome: 'late', rank, behind: name(race.winner!), ...rolled };
      else r = { t: 'result', armId: race.armId, outcome: 'late', rank, afterMs: q.afterMs, behind: name(lead.seatId), ...rolled };
      const k = JSON.stringify(r);
      if (this.lastResults.get(q.seatId) === k) return;
      this.lastResults.set(q.seatId, k);
      for (const p of this.phones.values()) if (p.seatId === q.seatId) this.deps.toPhone(p.conn, r);
    });
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

const strip = (p: Phone): PhoneSaved => ({
  conn: p.conn,
  seatId: p.seatId,
  ...(p.pendingName !== undefined ? { pendingName: p.pendingName } : {}),
  ...(p.rtts?.length ? { rtts: p.rtts } : {}),
});

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
  const rollOrder = Array.isArray(x.rollOrder) ? [...new Set(x.rollOrder.filter((id): id is string => typeof id === 'string' && ids.has(id)))] : [];
  return {
    title: x.title.slice(0, 200),
    seats,
    allowNew: x.allowNew,
    phase: x.phase as BuzzPhase,
    armId: x.armId as number,
    clue,
    answering,
    ...(rollOrder.length ? { rollOrder } : {}),
    lockedOut: x.lockedOut.filter((id): id is string => typeof id === 'string' && ids.has(id)),
    earlyLockMs: Number.isFinite(x.earlyLockMs) ? Math.max(0, Math.min(10_000, Math.round(x.earlyLockMs))) : 0,
    scores,
  };
}
