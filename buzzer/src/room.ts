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
 * probe → echo, see rtt()) plus NET_TOLERANCE_MS. A reactMs that leaves more than that is raised until it fits (see
 * rankKey). A phone can make its round trip look longer by holding its echoes, so it counts as MAX_RTT_MS at most: a
 * phone lying about reactMs gains at most MAX_RTT_MS + NET_TOLERANCE_MS over its real network. The first buzz opens a
 * grace window to collect buzzes still on their way, as long as a phone that reacted as fast would need to get here
 * (GRACE_MS to MAX_GRACE_MS, see graceEnd); then the lowest key wins. Keys within TIE_MS of the fastest are a tie: the
 * room picks nobody and the host decides (picks one, or rolls and sends rollOrder).
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
 *
 * Kicks: the kicked phone (its socket, its browser's device id and its address) can't take that seat again for
 * KICK_BLOCK_MS (it can take another free one); the other phones already in the room at its address (the same house's
 * Wi-Fi) are spared. Freeing a seat (kick with block: false, for a player back on another
 * phone, maybe on the same Wi-Fi) keeps nobody off it. The seat list tells phones which taken seats are away (no
 * connected phone has them). 🔒 Seats locked (HostState.locked): only phones with a seat's token get a seat.
 *
 * Full rooms: phones without a seat that have done nothing for IDLE_MS (viewers who opened the link, extra tabs) don't
 * hold a place: when MAX_PHONES are connected, the oldest of them is turned away ('denied full', closed; it tries again
 * later) to make room. With none to turn away a newcomer still gets in, up to MAX_SOCKETS, but only to come back to its
 * seat with a token; anything else turns it away. The host is told ('full').
 *
 * Teams (HostState.teams): each seat is a team. A phone joins one with its own name and becomes a member (its own
 * token, so it comes back after a reload, on whichever team the host has put it). The race still counts one buzz per
 * seat: a team's first buzz holds its place (and says who it was); a teammate's later buzz only hears where the team
 * stands. A lock-out (a wrong answer) locks the team; an early buzz only the member who jumped. The host can move a
 * member to another team or kick one (kick with member), or the whole team (kick without). Turning teams on or off
 * frees every seat and member: phones pick again.
 *
 * Wagers (HostState.wager): while the host takes them, each seat in the wager round sends its own from its phone (teams:
 * anyone on the team; the newest counts). The room checks it (a whole number up to WAGER_MAX, only while the round is
 * open, over the seat's max only when the host doesn't hold to it, WAGER_RATE sends at most), keeps it per seat, and
 * passes the amount to the host and to that seat's own phones only: never to another phone, never in the seat list.
 * One sent while the host is away reaches it when it is back (unless it already took it: WagerSeat.got). A phone that
 * took its seat (teams: joined its team) after the round began sees no amount it didn't send itself: not the host's,
 * not a teammate's (whoever has the code could otherwise tap a free seat or join a rival team to read theirs). It is
 * told one is in, and can still send its own.
 *
 * Floods: a phone socket over PHONE_RATE messages a second for FLOOD_STRIKES seconds in a row, over FLOOD_BURST in one
 * second, or over PHONE_BYTES in one second, is closed (4008) before its messages are read, and for FLOOD_BLOCK_MS a
 * phone from its address may only come back to a seat it holds (a join with its token, not the flooder's): phones on one
 * Wi-Fi share an address, and a seated player reconnecting there isn't the flood. Anything else from it is closed.
 */
import {
  BUZZ_PROTOCOL,
  MEMBER_NAME_MAX,
  WAGER_MAX,
  phoneView,
  ROOM_FEATURES,
  TIE_MS,
  clip,
  cleanName,
  type BuzzPhase,
  type DenyReason,
  type HostState,
  type MemberRef,
  type PhoneInfo,
  type QueuedBuzz,
  type RoomToHost,
  type RoomToPhone,
  type Seat,
  type SentWager,
  type WagerRefusal,
  type WagerSeat,
} from '../../src/lib/buzzproto';

/** Phones connected at most, not counting idle ones without a seat (see Full rooms above). */
export const MAX_PHONES = 24;
/** Sockets at most, counting newcomers let in over MAX_PHONES to come back with a seat's token. */
export const MAX_SOCKETS = 40;
/** A phone without a seat that hasn't joined, asked, buzzed or left for this long can be turned away when full. */
export const IDLE_MS = 10_000;
/** A kicked phone can't take that seat again for this long. */
export const KICK_BLOCK_MS = 2 * 60_000;
/** Messages bigger than this (bytes) are dropped unread (the host is told when its state is too big). */
export const HOST_MSG_MAX = 32 * 1024;
export const TOO_BIG = 'The game is too big for the buzzer room to pass on (too many players or very long names)';
/** A seat's name as phones see it, and the room's title (characters). */
export const SEAT_NAME_MAX = 40;
export const TITLE_MAX = 200;
/** A status line for the phones (characters). */
export const STATUS_MAX = 120;
export const PHONE_MSG_MAX = 1024;
/** A new player's name (phones type it). */
export const NAME_MAX = 24;
/** Team members the room keeps at most (phones gone for good still count, until a newcomer needs the room). */
export const MAX_MEMBERS = 64;
/** Messages per socket per second; more are dropped (and a phone that keeps it up is closed: see Floods). */
export const PHONE_RATE = 20;
export const HOST_RATE = 50;
/** Seconds in a row over PHONE_RATE that close a phone's socket… */
export const FLOOD_STRIKES = 3;
/** …or this many messages in one second (no phone page sends anything like it). */
export const FLOOD_BURST = 3 * PHONE_RATE;
/** Bytes a phone may send in one second (a buzz is ~40); more closes its socket at once. */
export const PHONE_BYTES = 16 * 1024;
/** A phone closed for flooding: its address can't connect again for this long. */
export const FLOOD_BLOCK_MS = 30_000;
/** join / new attempts per phone per minute. */
export const JOIN_RATE = 10;
/** Wagers a phone may send per WAGER_WINDOW_MS (changing its mind a few times is fine; a script isn't). */
export const WAGER_RATE = 10;
export const WAGER_WINDOW_MS = 10_000;
/** Colours a phone may ask for per COLOR_WINDOW_MS (trying a few is fine; a script cycling them isn't). */
export const COLOR_RATE = 10;
export const COLOR_WINDOW_MS = 10_000;
/** After the first buzz of an arm, the room waits at least this long for buzzes still on their way before deciding… */
export const GRACE_MS = 250;
/** …and at most this long, however slow the network of a phone that could still beat it (see graceEnd). */
export const MAX_GRACE_MS = 800;
/** The room sends a phone a probe at most this often (see probe). */
export const PROBE_GAP_MS = 250;
/** Round-trip samples kept per phone; a low one is used (see rtt). */
export const RTT_SAMPLES = 5;
/** The round trip assumed when checking reactMs from a phone the room hasn't timed yet. */
export const DEFAULT_RTT_MS = 250;
/** A round trip longer than this counts as this (a phone holding its echoes can't buy itself more slack). */
export const MAX_RTT_MS = 350;
/** Slack on top of the round trip for the phone drawing the screen and network jitter. */
export const NET_TOLERANCE_MS = 70;
/** No ranking key is lower than this: nobody reacts faster, so anything below is a tie. */
export const MIN_REACT_MS = 50;

/** A counted buzz. key: its ranking key (ms, see rankKey); n: arrival order in the arm. */
export interface Buzz {
  seatId: string;
  key: number;
  n: number;
  /** It came after the grace window (it can't pass the settled head, even with a lower key). */
  late?: boolean;
  /** Teams: the member whose buzz it was, and their name then. */
  member?: string;
  by?: string;
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
  /** Seat id → the phones kicked from it (sockets, device ids, addresses) and until when they can't take it again. */
  blocks?: Record<string, { until: number; conns: string[]; devices: string[]; ips?: string[]; spared?: string[] }>;
  /** Teams: member id → their team (seat id), name, token and the conn that last held it. */
  members?: Record<string, Member>;
  /** Teams: member id → when their early-buzz lock ends (an early buzz locks the member, not the team). */
  memberLocks?: Record<string, number>;
  /** The wagers phones sent for the host's wager round `id` (HostState.wager), per seat; at: when the round began. */
  wagers?: { id: string; seats: Record<string, SentWager>; at?: number };
  /** Seat id → when its token was handed out (a phone coming back with it keeps the time; see Wagers above). */
  seatedAt?: Record<string, number>;
  /**
   * Seat id (teams: member id) → the device id and address of the phone that last held it, so a kick blocks it even while
   * that phone is away (asleep, its tab closed).
   */
  seen?: Record<string, { device?: string; ip?: string }>;
}

/** Someone on a team (teams). */
export interface Member {
  seatId: string;
  name: string;
  token: string;
  conn?: string;
  /** When they joined (the member gone longest makes room when there are MAX_MEMBERS). */
  at: number;
}

/** What each phone socket keeps (stored on the socket, so it survives hibernation). */
export interface PhoneSaved {
  conn: string;
  seatId: string | null;
  /** Teams: the member this phone is (seatId is their team). */
  member?: string;
  pendingName?: string;
  /** The last few round trips the room timed (ms, newest last). */
  rtts?: number[];
  /** The id its browser sent with a join or a request to join (kept for kicks). */
  device?: string;
  /** Its address (CF-Connecting-IP; kept for kicks and floods). */
  ip?: string;
  /** It connected from an address that flooded a moment ago: it may only take back a seat it holds (see floods). */
  flooded?: boolean;
}

export interface RoomDeps {
  now(): number;
  /** A fresh unguessable token (≥ 128 random bits, base64url). */
  token(): string;
  toHost(msg: RoomToHost): void;
  toPhone(conn: string, msg: RoomToPhone): void;
  saveRoom(saved: RoomSaved): void;
  savePhone(phone: PhoneSaved): void;
  /** Close a phone's socket (it was turned away and told 'denied full' already). */
  dropPhone(conn: string): void;
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
  /** Probes sent and not yet echoed (only those count as a round trip). */
  probes: { id: number; at: number }[];
  /** When the last probe went. */
  probedAt?: number;
  /** Seconds in a row it went over PHONE_RATE (see Floods). */
  strikes: number;
  /** When it last joined, asked, buzzed or left (or connected). */
  active: number;
  /** Let in over MAX_PHONES: only a seat's token keeps it (see Full rooms). */
  hold?: boolean;
  /** Wagers sent lately (WAGER_RATE). */
  wagerRate?: Window;
  /** Colours asked for lately (COLOR_RATE). */
  colorRate?: Window;
}

interface Window {
  start: number;
  count: number;
  bytes?: number;
}

export const emptyRoom = (): RoomSaved => ({ state: null, tokens: {}, holders: {}, race: null, earlyLocks: {} });

/** How much of a buzz's time from arming may be the network's: the round trip (rttMs null: not timed yet) + tolerance. */
export const slackFor = (rttMs: number | null): number => (rttMs ?? DEFAULT_RTT_MS) + NET_TOLERANCE_MS;

/**
 * A buzz's ranking key (lower wins): the phone's own reaction time, raised (if need be) so that it leaves no more than
 * slackFor(rttMs) of the time since arming to the network. A missing or impossible one (negative, more than the time
 * since arming) falls back to the time since arming minus the round trip. Never below MIN_REACT_MS.
 */
export function rankKey(elapsedMs: number, reactMs: number | undefined, rttMs: number | null): number {
  const ok = reactMs !== undefined && Number.isFinite(reactMs) && reactMs >= 0 && reactMs <= elapsedMs;
  const key = ok ? Math.max(reactMs, elapsedMs - slackFor(rttMs)) : Math.max(0, elapsedMs - (rttMs ?? 0));
  return Math.max(MIN_REACT_MS, Math.round(key));
}

/**
 * The round trip to count from a phone's last few samples: the second lowest (the lowest with fewer than 3). A low one
 * is the phone's real network time; not the very lowest, so one lucky sample doesn't leave an honest phone on jittery
 * Wi-Fi without slack.
 */
export function lowRtt(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >= 3 ? 1 : 0];
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
  /** When the host was last told the room is full. */
  private lastFull = -Infinity;
  /** The last probe id (see rtt). */
  private probeN = 0;
  /** Addresses closed for flooding → until when they can't connect (kept in memory only: it's brief). */
  /** Addresses that flooded a moment ago: until when, and the seat tokens the flooding phone held (not taken back). */
  private floodBlocks = new Map<string, { until: number; tokens: string[] }>();

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
    const now = this.deps.now();
    for (const p of phones) this.phones.set(p.conn, { ...p, rate: { start: 0, count: 0 }, joins: { start: 0, count: 0 }, probes: [], strikes: 0, active: now });
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
    this.deps.toHost({ t: 'welcome', code: this.code, protocol: BUZZ_PROTOCOL, serverNow: this.deps.now(), features: [...ROOM_FEATURES] });
    this.settle();
    this.sync();
    this.announce();
    // A buzz won while the host was away never reached it: it hears it again (a host that had it already ignores it).
    const race = this.s.race;
    const st = this.s.state;
    if (race?.decided && race.winner && st?.phase === 'answering' && st.answering === race.winner && st.armId === race.armId) {
      const by = race.queue.find((b) => b.seatId === race.winner)?.by;
      this.deps.toHost({ t: 'buzz', armId: race.armId, seatId: race.winner, rank: 1, afterMs: 0, ...(by ? { by } : {}) });
    }
    // Wagers sent while the host was away (those it hasn't taken yet).
    const sent = this.s.wagers;
    if (sent && st?.wager?.id === sent.id)
      for (const [seatId, w] of Object.entries(sent.seats))
        if (w.n > (st.wager.seats.find((x) => x.id === seatId)?.got ?? 0)) this.tellWager(sent.id, seatId, w);
  }

  private tellWager(id: string, seatId: string, w: SentWager): void {
    if (this.hostHere) this.deps.toHost({ t: 'wager', id, seatId, amount: w.amount, n: w.n, ...(w.by ? { by: w.by } : {}) });
  }

  hostClose(): void {
    this.hostHere = false;
    this.sync();
  }

  /** Returns 'close' when the host closed the room (phones have been told; the caller drops sockets and storage). */
  hostMessage(raw: unknown): 'close' | void {
    this.settle();
    if (!this.allow(this.hostRate, HOST_RATE, 1000)) return;
    if (typeof raw === 'string' && (raw.length > HOST_MSG_MAX || bytes(raw) > HOST_MSG_MAX)) return this.deps.toHost({ t: 'error', message: TOO_BIG });
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
        if (typeof m.seatId === 'string') this.kick(m.seatId, typeof m.member === 'string' ? m.member : undefined, m.block !== false);
        break;
      case 'move':
        if (typeof m.member === 'string' && typeof m.seatId === 'string') this.move(m.member, m.seatId);
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
    const now = this.deps.now();
    // A new clue opened with the buzzers closed keeps the last opening's number: the last clue's buzzes aren't this one's
    // (picking who answers there would tell phones "You're 2nd" on a clue they never buzzed on).
    if (this.s.race && prev?.phase === 'lobby' && next.phase !== 'lobby' && next.phase !== 'armed' && this.s.race.armId === next.armId)
      this.newRace(next.armId, now);
    const race = this.s.race;
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
    // Teams turned on or off: every seat and member is let go (phones pick again: a team, or their own name).
    if (prev && !!prev.teams !== !!next.teams) {
      for (const id of Object.keys(this.s.tokens)) this.freeSeat(id);
      for (const id of Object.keys(this.s.members ?? {})) this.dropMember(id);
      for (const p of this.phones.values()) if (p.seatId) this.unseat(p);
    }
    // Seats gone from the game free their tokens and phones (teams: their members).
    for (const id of Object.keys(this.s.tokens)) if (!seatIds.has(id)) this.freeSeat(id);
    for (const [id, m] of Object.entries(this.s.members ?? {})) if (!seatIds.has(m.seatId)) this.dropMember(id);
    for (const id of Object.keys(this.s.earlyLocks)) if (!seatIds.has(id) || this.s.earlyLocks[id] <= now) delete this.s.earlyLocks[id];
    for (const id of Object.keys(this.s.memberLocks ?? {})) if (!this.s.members?.[id] || this.s.memberLocks![id] <= now) delete this.s.memberLocks![id];
    for (const id of Object.keys(this.s.blocks ?? {})) if (!seatIds.has(id) || this.s.blocks![id].until <= now) delete this.s.blocks![id];
    // A new wager round (or none) forgets what phones sent; a seat taken out of it forgets its own.
    const ask = next.wager;
    if (!ask) delete this.s.wagers;
    else if (this.s.wagers?.id !== ask.id) this.s.wagers = { id: ask.id, seats: {}, at: now };
    else for (const id of Object.keys(this.s.wagers.seats)) if (!ask.seats.some((x) => x.id === id)) delete this.s.wagers.seats[id];
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

  /**
   * Takes a seat back (teams: one member, or without `member` everyone on the team). block false: only frees it (the
   * player came back on another phone, maybe on the same Wi-Fi): nobody is kept off it.
   */
  private kick(seatId: string, member?: string, block = true): void {
    const one = member !== undefined;
    if (one && this.s.members?.[member]?.seatId !== seatId) return;
    const holders = [...this.phones.values()].filter((p) => (one ? p.member === member : p.seatId === seatId));
    const members = Object.entries(this.s.members ?? {}).filter(([id, x]) => (one ? id === member : x.seatId === seatId));
    if (!this.s.tokens[seatId] && !holders.length && !members.length) return;
    if (!block) {
      if (one) this.dropMember(member, 'freed');
      else this.freeSeat(seatId, 'freed');
      return this.save();
    }
    // The kicked phone can't just tap the same name again (a troll with the code from the stream).
    const conns = new Set(holders.map((p) => p.conn));
    if (!one && this.s.holders[seatId]) conns.add(this.s.holders[seatId]);
    for (const [, x] of members) if (x.conn) conns.add(x.conn);
    // (The phones that held it while away too: their device ids and addresses from when they last held it.)
    const away = (one ? [member] : [seatId, ...members.map(([id]) => id)]).flatMap((k) => (this.s.seen?.[k] ? [this.s.seen[k]] : []));
    const devices = new Set([...holders.flatMap((p) => (p.device ? [p.device] : [])), ...away.flatMap((x) => (x.device ? [x.device] : []))]);
    // Its address too: a new device id is one cleared localStorage away. But phones on one Wi-Fi share an address: the
    // others already here (another player in the same house) are spared.
    const ips = new Set([...holders.flatMap((p) => (p.ip ? [p.ip] : [])), ...away.flatMap((x) => (x.ip ? [x.ip] : []))]);
    const spared = [...this.phones.values()].flatMap((p) => (p.device && !conns.has(p.conn) && !devices.has(p.device) ? [p.device] : []));
    // A team's block adds up: kicking a second member doesn't let the first back on.
    const now = this.deps.now();
    const was = this.s.blocks?.[seatId];
    const keep = was && was.until > now ? was : { conns: [], devices: [], ips: [], spared: [] };
    const blocked = new Set([...keep.devices, ...devices]);
    (this.s.blocks ??= {})[seatId] = {
      until: now + KICK_BLOCK_MS,
      conns: [...new Set([...keep.conns, ...conns])],
      devices: [...new Set([...keep.devices, ...devices])],
      ips: [...new Set([...(keep.ips ?? []), ...ips])],
      spared: [...new Set([...(keep.spared ?? []), ...spared])].filter((d) => !blocked.has(d)),
    };
    if (one) this.dropMember(member, 'kicked');
    else this.freeSeat(seatId, 'kicked');
    this.save();
  }

  /** Teams: the host puts a member (and their phone) on another team. */
  private move(member: string, seatId: string): void {
    const m = this.s.members?.[member];
    if (!m || !this.s.state?.teams || !this.s.state.seats.some((x) => x.id === seatId) || m.seatId === seatId) return;
    m.seatId = seatId;
    for (const p of this.phones.values()) {
      if (p.member !== member) continue;
      p.seatId = seatId;
      p.lastView = p.lastSeats = undefined;
      this.deps.savePhone(strip(p));
      // Its saved seat follows (the token stays the same).
      this.deps.toPhone(p.conn, { t: 'joined', seatId, token: m.token, name: m.name });
    }
    this.save();
  }

  /** Teams: forgets a member (left, kicked, their team gone); their phone is unseated (told so when kicked or freed). */
  private dropMember(id: string, kicked?: Kicked): void {
    if (!this.s.members?.[id]) return;
    delete this.s.members[id];
    delete this.s.memberLocks?.[id];
    delete this.s.seen?.[id];
    for (const p of this.phones.values()) {
      if (p.member !== id) continue;
      this.unseat(p);
      if (kicked) this.deps.toPhone(p.conn, kickedMsg(kicked));
    }
  }

  /** The phone holds no seat (and is no team member) any more. */
  private unseat(p: Phone): void {
    p.seatId = null;
    delete p.member;
    p.lastView = p.lastSeats = undefined;
    this.deps.savePhone(strip(p));
  }

  /** Revokes a seat's token (teams: its members') and unseats its phones (told so when kicked or freed). */
  private freeSeat(seatId: string, kicked?: Kicked): void {
    delete this.s.tokens[seatId];
    delete this.s.holders[seatId];
    delete this.s.seatedAt?.[seatId];
    delete this.s.seen?.[seatId];
    delete this.s.earlyLocks[seatId];
    for (const [id, m] of Object.entries(this.s.members ?? {})) if (m.seatId === seatId) this.dropMember(id, kicked);
    for (const p of this.phones.values()) {
      if (p.seatId !== seatId) continue;
      this.unseat(p);
      if (kicked) this.deps.toPhone(p.conn, kickedMsg(kicked));
    }
  }

  // ---- phones ----

  /** A phone connected (from address ip, if known). false when the room is full (the caller tells it and closes it). */
  phoneOpen(conn: string, ip?: string): boolean {
    const now = this.deps.now();
    if (this.countedPhones() >= MAX_PHONES || this.phones.size >= MAX_SOCKETS) this.turnAwayIdle(now);
    if (this.phones.size >= MAX_SOCKETS) {
      this.tellFull();
      return false;
    }
    const p: Phone = { conn, seatId: null, rate: { start: 0, count: 0 }, joins: { start: 0, count: 0 }, probes: [], strikes: 0, active: now, ...(ip ? { ip } : {}) };
    if (this.floodBlocked(ip)) p.flooded = true;
    if (this.countedPhones() >= MAX_PHONES) p.hold = true;
    this.phones.set(conn, p);
    this.deps.savePhone(strip(p));
    this.sync();
    return true;
  }

  /** Phones that hold a place: all but those let in on hold. */
  private countedPhones(except?: Phone): number {
    let n = 0;
    for (const p of this.phones.values()) if (p !== except && !p.hold) n++;
    return n;
  }

  /** Turns away the phone without a seat that has been idle longest (more than IDLE_MS). false: there is none. */
  private turnAwayIdle(now: number): boolean {
    let oldest: Phone | undefined;
    for (const p of this.phones.values())
      if (!p.seatId && p.pendingName === undefined && now - p.active > IDLE_MS && (!oldest || p.active < oldest.active)) oldest = p;
    if (!oldest) return false;
    this.turnAway(oldest);
    return true;
  }

  /** 'full': the phone is told and its socket closed (it tries again in a while). */
  private turnAway(p: Phone): void {
    this.phones.delete(p.conn);
    this.deps.toPhone(p.conn, { t: 'denied', reason: 'full' });
    this.deps.dropPhone(p.conn);
    this.tellFull();
    this.sync();
  }

  /** The host hears that the room is full (at most every few seconds). */
  private tellFull(): void {
    const now = this.deps.now();
    if (!this.hostHere || now - this.lastFull < 5000) return;
    this.lastFull = now;
    this.deps.toHost({ t: 'full' });
  }

  /**
   * A phone let in over MAX_PHONES wants a seat without a token, or to join as someone new: only if there's room now
   * (an idle phone can be turned away for it); else it is turned away itself. true: it was.
   */
  private turnedAway(p: Phone): boolean {
    if (!p.hold) return false;
    if (this.countedPhones(p) >= MAX_PHONES) this.turnAwayIdle(this.deps.now());
    if (this.countedPhones(p) >= MAX_PHONES) {
      this.turnAway(p);
      return true;
    }
    delete p.hold;
    return false;
  }

  phoneClose(conn: string): void {
    if (!this.phones.delete(conn)) return;
    this.sync();
  }

  /** An address closed for flooding a moment ago (a phone from it may only take back a seat it holds). */
  floodBlocked(ip: string | null | undefined): boolean {
    return !!this.floodBlock(ip);
  }

  private floodBlock(ip: string | null | undefined): { until: number; tokens: string[] } | undefined {
    const b = ip ? this.floodBlocks.get(ip) : undefined;
    if (!b) return undefined;
    if (b.until > this.deps.now()) return b;
    this.floodBlocks.delete(ip!);
    return undefined;
  }

  /** The seat token a phone holds its seat (or its team place) with. */
  private tokenOf(p: Phone): string | undefined {
    if (p.member) return this.s.members?.[p.member]?.token;
    return p.seatId && this.s.holders[p.seatId] === p.conn ? this.s.tokens[p.seatId] : undefined;
  }

  /** A token that holds a seat or a team place now. */
  private holdsSeat(token: string): boolean {
    return Object.values(this.s.tokens).includes(token) || Object.values(this.s.members ?? {}).some((m) => m.token === token);
  }

  /** Returns 'close' when the phone is flooding: it is forgotten here, and the caller closes its socket (4008). */
  phoneMessage(conn: string, raw: unknown): 'close' | void {
    const p = this.phones.get(conn);
    if (!p) return;
    // Counted and checked before anything else (no parsing, no deciding a race), so a flood costs the room little.
    if (this.flooding(p, raw)) {
      this.phones.delete(conn);
      if (p.ip) {
        const was = this.floodBlock(p.ip)?.tokens ?? [];
        const token = this.tokenOf(p);
        this.floodBlocks.set(p.ip, { until: this.deps.now() + FLOOD_BLOCK_MS, tokens: token ? [...new Set([...was, token])] : was });
      }
      this.sync();
      return 'close';
    }
    if (typeof raw !== 'string' || raw.length > PHONE_MSG_MAX || p.rate.count > PHONE_RATE) return;
    this.settle();
    const m = parse(raw, PHONE_MSG_MAX);
    if (!m) return;
    if (p.flooded) {
      // From an address that flooded: only a phone taking back the seat it holds (a reconnect) gets in.
      const b = this.floodBlock(p.ip);
      const back = m.t === 'join' && typeof m.token === 'string' && this.holdsSeat(m.token) && !b?.tokens.includes(m.token);
      if (b && !back) {
        if (m.t !== 'join' && m.t !== 'new') return;
        this.phones.delete(conn);
        this.sync();
        return 'close';
      }
      delete p.flooded;
      this.deps.savePhone(strip(p));
    }
    if (m.t === 'join' || m.t === 'new' || m.t === 'buzz' || m.t === 'leave' || m.t === 'wager') p.active = this.deps.now();
    if ((m.t === 'join' || m.t === 'new') && typeof m.device === 'string' && m.device && m.device.length <= 64 && p.device !== m.device) {
      p.device = m.device;
      this.deps.savePhone(strip(p));
    }
    switch (m.t) {
      case 'join':
        if (typeof m.seatId !== 'string' || (m.token !== undefined && typeof m.token !== 'string') || (m.name !== undefined && typeof m.name !== 'string')) return;
        // (Too many tries: told so, not left waiting for an answer that never comes.)
        if (this.allow(p.joins, JOIN_RATE, 60_000)) this.join(p, m.seatId, m.token, m.name);
        else this.deps.toPhone(p.conn, { t: 'denied', reason: 'slow-down' });
        break;
      case 'new':
        if (typeof m.name !== 'string') return;
        if (this.allow(p.joins, JOIN_RATE, 60_000)) this.askNew(p, m.name);
        else this.deps.toPhone(p.conn, { t: 'denied', reason: 'slow-down' });
        break;
      case 'buzz':
        if (typeof m.armId === 'number') this.buzz(p, m.armId, typeof m.reactMs === 'number' ? m.reactMs : undefined);
        break;
      case 'leave':
        if (p.member) {
          this.dropMember(p.member);
          this.save();
        } else if (p.seatId && this.s.state?.teams) {
          this.unseat(p);
          this.save();
        } else if (p.seatId) {
          this.freeSeat(p.seatId);
          this.save();
        } else if (p.pendingName !== undefined) {
          delete p.pendingName;
          this.deps.savePhone(strip(p));
          this.sync();
        }
        break;
      case 'wager':
        if (typeof m.id === 'string') this.wager(p, m.id, m.amount);
        break;
      case 'color':
        if (typeof m.color === 'string') this.color(p, m.color);
        break;
      case 'ping':
        if (typeof m.at === 'number') {
          this.deps.toPhone(conn, { t: 'pong', at: m.at, serverNow: this.deps.now() });
          this.probe(p);
        }
        break;
      case 'echo': {
        // The phone echoing a probe: the room's own round trip for it (only for a probe it really sent, once).
        const i = p.probes.findIndex((x) => x.id === m.id);
        if (i < 0) return;
        const rtt = this.deps.now() - p.probes[i].at;
        p.probes.splice(i, 1);
        p.rtts = [...(p.rtts ?? []).slice(1 - RTT_SAMPLES), rtt];
        this.deps.savePhone(strip(p));
        break;
      }
    }
  }

  /**
   * Counts a phone's message (before reading it): true when it is flooding (see Floods). Over PHONE_RATE this second:
   * the caller drops it.
   */
  private flooding(p: Phone, raw: unknown): boolean {
    const now = this.deps.now();
    const w = p.rate;
    if (now - w.start >= 1000) {
      // A second within the limit (or a quiet gap) in between: the strikes start over.
      if (w.count <= PHONE_RATE || now - w.start >= 2000) p.strikes = 0;
      w.start = now;
      w.count = 0;
      w.bytes = 0;
    }
    w.bytes = (w.bytes ?? 0) + (typeof raw === 'string' ? raw.length : raw instanceof ArrayBuffer ? raw.byteLength : 0);
    if (++w.count === PHONE_RATE + 1) p.strikes++;
    return p.strikes >= FLOOD_STRIKES || w.count > FLOOD_BURST || w.bytes > PHONE_BYTES;
  }

  /**
   * The room times the phone's round trip itself: it sends a probe the phone echoes at once (after each of the
   * phone's pings, and when it takes a seat). Only an echo of a probe it sent counts, once.
   */
  private probe(p: Phone): void {
    // At most one every PROBE_GAP_MS (a phone pinging fast mustn't double its own messages).
    const now = this.deps.now();
    if (now - (p.probedAt ?? -Infinity) < PROBE_GAP_MS) return;
    p.probedAt = now;
    const id = ++this.probeN;
    p.probes = [...p.probes.slice(-3), { id, at: now }];
    this.deps.toPhone(p.conn, { t: 'probe', id });
  }

  /** A phone's round trip as the room timed it (a low one of the last few, at most MAX_RTT_MS), or null before the first. */
  rtt(conn: string): number | null {
    const r = this.phones.get(conn)?.rtts;
    return r?.length ? Math.min(MAX_RTT_MS, lowRtt(r)) : null;
  }

  private join(p: Phone, seatId: string, token?: string, name?: string): void {
    const deny = (reason: DenyReason) => this.deps.toPhone(p.conn, { t: 'denied', reason });
    if (this.s.state?.teams) return this.joinTeam(p, seatId, token, name);
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
      delete p.hold;
      p.seatId = seatId;
      p.lastView = p.lastSeats = undefined;
      this.s.holders[seatId] = p.conn;
      this.deps.savePhone(strip(p));
      this.deps.toPhone(p.conn, { t: 'joined', seatId, token });
      this.save();
      this.seated(p, seatId);
      return;
    }
    if (held) return deny('taken');
    if (this.s.state.locked) return deny('locked');
    const block = this.s.blocks?.[seatId];
    const kicked = block && (block.conns.includes(p.conn) || (!!p.device && block.devices.includes(p.device)) || (!!p.ip && !!block.ips?.includes(p.ip) && !(p.device && block.spared?.includes(p.device))));
    if (kicked && block.until > this.deps.now()) return deny('blocked');
    if (this.turnedAway(p)) return;
    if (p.seatId) this.freeSeat(p.seatId);
    delete p.pendingName;
    this.seat(p, seatId);
  }

  /**
   * Teams: with a token, the member it names comes back on this phone (on whichever team the host has them now);
   * otherwise the phone joins team `seatId` as a new member called `raw`. A name someone on a connected phone has is
   * taken; one a member gone quiet has is theirs to take over (the same person, their token lost).
   */
  private joinTeam(p: Phone, seatId: string, token?: string, raw?: string): void {
    const deny = (reason: DenyReason) => this.deps.toPhone(p.conn, { t: 'denied', reason });
    const st = this.s.state!;
    const members = (this.s.members ??= {});
    if (token !== undefined) {
      const id = Object.keys(members).find((k) => members[k].token === token);
      if (!id) return deny('bad-token');
      if (p.member === id) return;
      for (const o of this.phones.values()) if (o !== p && o.member === id) this.unseat(o);
      if (p.member) this.dropMember(p.member);
      delete p.pendingName;
      delete p.hold;
      return this.seatMember(p, id, members[id]);
    }
    if (!st.seats.some((x) => x.id === seatId)) return deny('unknown-seat');
    const name = cleanName(raw ?? '', MEMBER_NAME_MAX);
    if (!name) return deny('need-name');
    if (p.member && members[p.member]?.seatId === seatId && members[p.member].name === name) return; // already there
    if (st.locked) return deny('locked');
    const block = this.s.blocks?.[seatId];
    const kicked = block && (block.conns.includes(p.conn) || (!!p.device && block.devices.includes(p.device)) || (!!p.ip && !!block.ips?.includes(p.ip) && !(p.device && block.spared?.includes(p.device))));
    if (kicked && block.until > this.deps.now()) return deny('blocked');
    const key = (a: string) => a.toLocaleLowerCase().replace(/\s+/g, '');
    const here = (id: string) => [...this.phones.values()].some((o) => o.member === id);
    const same = Object.keys(members).find((k) => k !== p.member && key(members[k].name) === key(name));
    if (same && here(same)) return deny('name-taken');
    if (this.turnedAway(p)) return;
    if (same) this.dropMember(same);
    if (p.member) this.dropMember(p.member);
    else if (p.seatId) this.unseat(p);
    delete p.pendingName;
    // Full: the members gone longest make room (there are always some: fewer phones than that can connect).
    const ids = Object.keys(members);
    if (ids.length >= MAX_MEMBERS) {
      const gone = ids.filter((k) => !here(k)).sort((a, b) => members[a].at - members[b].at);
      for (const k of gone.slice(0, ids.length - MAX_MEMBERS + 1)) this.dropMember(k);
      if (Object.keys(members).length >= MAX_MEMBERS) return deny('full');
    }
    // Its id is never a credential (the host and teammates hear it); the token is.
    let id = `m${this.deps.token().slice(0, 15)}`;
    while (members[id]) id = `m${this.deps.token().slice(0, 15)}`;
    const m: Member = { seatId, name, token: this.deps.token(), at: this.deps.now() };
    members[id] = m;
    this.seatMember(p, id, m);
  }

  /** Teams: the phone is member `id` now, on their team. */
  private seatMember(p: Phone, id: string, m: Member): void {
    m.conn = p.conn;
    p.seatId = m.seatId;
    p.member = id;
    p.lastView = p.lastSeats = undefined;
    this.deps.savePhone(strip(p));
    this.deps.toPhone(p.conn, { t: 'joined', seatId: m.seatId, token: m.token, name: m.name });
    this.save();
    this.seated(p, m.seatId);
  }

  /** Gives a phone a free seat with a fresh token. */
  private seat(p: Phone, seatId: string): void {
    const token = this.deps.token();
    this.s.tokens[seatId] = token;
    this.s.holders[seatId] = p.conn;
    (this.s.seatedAt ??= {})[seatId] = this.deps.now();
    p.seatId = seatId;
    p.lastView = p.lastSeats = undefined;
    this.deps.savePhone(strip(p));
    this.deps.toPhone(p.conn, { t: 'joined', seatId, token });
    this.save();
    this.seated(p, seatId);
  }

  /**
   * A phone took a seat (or came back to it): it hears where this arm's buzz from that seat stands ("You're 2nd…"), as
   * the phone that had it did, and the room times its round trip at once.
   */
  private seated(p: Phone, seatId: string): void {
    if (p.device || p.ip) {
      (this.s.seen ??= {})[p.member ?? seatId] = { ...(p.device ? { device: p.device } : {}), ...(p.ip ? { ip: p.ip } : {}) };
      this.save();
    }
    this.probe(p);
    this.lastResults.delete(p.conn);
    const race = this.s.race;
    if (!race || race.armId !== this.s.state?.armId || !race.queue.some((b) => b.seatId === seatId)) return;
    if (race.decided) this.announce();
    else this.deps.toPhone(p.conn, { t: 'result', armId: race.armId, outcome: 'pending' });
  }

  private askNew(p: Phone, raw: string): void {
    const name = cleanName(raw, NAME_MAX);
    if (p.seatId) return;
    const deny = (reason: DenyReason) => this.deps.toPhone(p.conn, { t: 'denied', reason });
    // Only invisible characters: no name (the phone asks for one, instead of waiting for the host).
    if (!name) return deny('need-name');
    const st = this.s.state;
    if (st?.locked) return deny('locked');
    if (!st?.allowNew || st.teams) return deny('no-new');
    // A second "Ann": if it's her, she taps her name; if not, she picks another one.
    const key = (a: string) => a.toLocaleLowerCase().replace(/\s+/g, '');
    if (st.seats.some((x) => key(x.name) === key(name))) return deny('name-taken');
    if (this.turnedAway(p)) return;
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
    if ((st.phase === 'closed' && st.done) || st.answerShown) return result('late'); // the clue is over: no penalty
    // Teams: an early buzz locks the one who jumped, not their teammates.
    const member = st.teams && p.member && this.s.members?.[p.member] ? p.member : undefined;
    if (st.phase === 'closed') {
      // Pressing again while closed starts the penalty over, as on the show.
      if (st.earlyLockMs > 0) {
        if (member) (this.s.memberLocks ??= {})[member] = now + st.earlyLockMs;
        else this.s.earlyLocks[seatId] = now + st.earlyLockMs;
      }
      result('early', { lockedUntil: now + st.earlyLockMs });
      if (st.earlyLockMs > 0) this.save();
      return;
    }
    if (armId !== st.armId) return result('late');
    if (st.lockedOut.includes(seatId)) return result('locked');
    const until = (member ? this.s.memberLocks?.[member] : this.s.earlyLocks[seatId]) ?? 0;
    if (until > now) return result('locked', { lockedUntil: until });
    let race = this.s.race;
    if (!race || race.armId !== st.armId) {
      if (st.phase !== 'armed') return result('late'); // the host set 'answering' itself: there is no race to rank
      this.newRace(st.armId, now);
      race = this.s.race!;
    }
    // Teams: someone the host moved after they buzzed doesn't buzz again for their new team on the same clue.
    if (member && race.queue.some((b) => b.member === member && b.seatId !== seatId)) return result('late');
    const by = member ? { member, by: this.s.members![member].name } : {};
    const key = rankKey(now - race.armedAt, reactMs, this.rtt(p.conn));
    const had = race.queue.find((b) => b.seatId === seatId);
    if (had) {
      // One counted buzz per seat per arm (teams: per team, a teammate's buzz already holds its place). The same press
      // sent again (its phone lost the connection), or a teammate's, hears where the seat stands. Teams: while the room
      // is still collecting, a teammate who reacted faster is the team's time (the team's fastest, as one player's).
      if (!race.decided) {
        if (member && had.member !== member && key < had.key) {
          Object.assign(had, { key, ...by });
          this.save();
        }
        return result('pending');
      }
      this.lastResults.delete(p.conn);
      return this.announce();
    }
    const buzz: Buzz = { seatId, key, n: race.queue.length, ...by };
    if (race.decided) {
      // After the grace window: into the queue by its key, behind the settled head.
      buzz.late = true;
      let i = race.head;
      while (i < race.queue.length && byKey(race.queue[i], buzz) <= 0) i++;
      race.queue.splice(i, 0, buzz);
      this.deps.toHost({ t: 'buzz', armId, seatId, rank: i + 1, afterMs: Math.max(0, buzz.key - race.queue[0].key), ...(buzz.by ? { by: buzz.by } : {}) });
    } else if (st.phase === 'armed') {
      race.queue.push(buzz);
      if (race.graceUntil === undefined) {
        race.graceUntil = this.graceEnd(race, buzz.key, now);
        this.stopGrace();
        this.grace = this.deps.schedule(race.graceUntil - now, () => this.resolve());
      }
      result('pending');
    } else {
      return result('late');
    }
    this.save();
    this.announce();
  }

  /**
   * A seated phone asks for another colour for its player: passed on to the host (which takes it when it's free, and
   * the new colour comes back in its state). Only when the host lets players pick (colorPick), never for teams.
   */
  private color(p: Phone, color: string): void {
    const st = this.s.state;
    if (!st?.colorPick || st.teams || !p.seatId || !st.seats.some((x) => x.id === p.seatId) || !/^#[0-9a-f]{6}$/i.test(color)) return;
    if (!this.allow((p.colorRate ??= { start: 0, count: 0 }), COLOR_RATE, COLOR_WINDOW_MS)) return;
    if (this.hostHere) this.deps.toHost({ t: 'color', seatId: p.seatId, color: color.toLowerCase() });
  }

  /**
   * A phone sends its seat's wager for the host's wager round `id`. Taken: kept for the seat (teams: whoever on it sent
   * it last), told to the host, and every phone of the seat sees it. The phone hears either way.
   */
  private wager(p: Phone, id: string, amount: unknown): void {
    const st = this.s.state;
    const ask = st?.wager;
    const no = (reason: WagerRefusal, max?: number) =>
      this.deps.toPhone(p.conn, { t: 'wagered', id: clip(id, 100), ok: false, reason, ...(max !== undefined ? { max } : {}) });
    const seat: WagerSeat | undefined = p.seatId ? ask?.seats.find((x) => x.id === p.seatId) : undefined;
    if (!st || !ask || !ask.open || ask.id !== id || !seat || !p.seatId) return no('closed');
    if (!this.allow((p.wagerRate ??= { start: 0, count: 0 }), WAGER_RATE, WAGER_WINDOW_MS)) return no('slow');
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || amount > WAGER_MAX) return no('bad');
    if (ask.limit && amount > seat.max) return no('over', seat.max);
    const now = this.deps.now();
    const sent = this.s.wagers?.id === id ? this.s.wagers : (this.s.wagers = { id, seats: {}, at: now });
    const member = st.teams && p.member ? this.s.members?.[p.member] : undefined;
    const w: SentWager = { amount, n: Math.max(sent.seats[p.seatId]?.n ?? 0, seat.got ?? 0) + 1, at: now, ...(member && p.member ? { member: p.member, by: member.name } : {}) };
    sent.seats[p.seatId] = w;
    this.deps.toPhone(p.conn, { t: 'wagered', id, ok: true, amount });
    this.tellWager(id, p.seatId, w);
    this.save();
  }

  /**
   * When the grace window the first buzz (ranking key `key`) opens ends: once a phone that reacted as fast, on the
   * slowest network of the seated phones that could still buzz, has had time to get its buzz here. At least GRACE_MS
   * from now, at most MAX_GRACE_MS.
   */
  private graceEnd(race: Race, key: number, now: number): number {
    const out = this.s.state?.lockedOut ?? [];
    let slack = 0;
    for (const p of this.phones.values())
      if (p.seatId && !out.includes(p.seatId) && !race.queue.some((b) => b.seatId === p.seatId)) slack = Math.max(slack, slackFor(this.rtt(p.conn)));
    return Math.min(now + MAX_GRACE_MS, Math.max(now + GRACE_MS, race.armedAt + key + slack));
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
        race.queue.forEach((b, i) =>
          this.deps.toHost({ t: 'buzz', armId: race.armId, seatId: b.seatId, rank: i + 1, afterMs: b.key - race.queue[0].key, ...(b.by ? { by: b.by } : {}) }),
        );
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
      // Reacted faster than the first, but got here after the window: it says so rather than "0.00 s behind".
      const late = b.late && b.key < lead.key ? { arrivedLate: true as const } : {};
      return { seatId: b.seatId, afterMs: Math.max(0, b.key - lead.key), ...(r >= 0 ? { rolled: r + 1 } : {}), ...late, ...(b.by ? { by: b.by } : {}) };
    });
    const msg: RoomToHost = { t: 'queue', armId: race.armId, queue, ...(race.tie ? { tie: race.tie } : {}) };
    const key = JSON.stringify(msg);
    if (this.hostHere && race.queue.length && key !== this.lastQueue) {
      this.lastQueue = key;
      this.deps.toHost(msg);
    }
    // The answering seat isn't in the queue when the host picked someone who hadn't buzzed: everyone moves down one.
    const shift = race.winner && !race.queue.some((b) => b.seatId === race.winner) ? 1 : 0;
    // Those who already missed this clue aren't ahead of anyone any more: the places count without them, and the one
    // ahead is the one answering.
    const out = new Set(st.lockedOut.filter((id) => id !== race.winner));
    const ahead = lead && out.has(lead.seatId) && race.winner ? race.winner : lead?.seatId;
    const aheadKey = race.queue.find((b) => b.seatId === ahead)?.key ?? lead?.key ?? 0;
    let missed = 0;
    queue.forEach((q, i) => {
      if (out.has(q.seatId)) return void missed++;
      const rank = i + 1 + shift - missed;
      const rolled = q.rolled !== undefined ? { rolled: q.rolled } : {};
      let r: RoomToPhone;
      if (race.tie?.includes(q.seatId)) r = { t: 'result', armId: race.armId, outcome: 'tie', rank };
      else if (q.seatId === race.winner) {
        // "First by 0.12 s" only when they were: not when they answer because a faster one missed or passed.
        const next = queue[i + 1];
        const fastest = i === 0 && !!next && race.queue[1].key > race.queue[0].key;
        r = { t: 'result', armId: race.armId, outcome: 'first', rank, afterMs: 0, ...(fastest ? { byMs: next.afterMs } : {}), ...rolled };
      } else if (shift) r = { t: 'result', armId: race.armId, outcome: 'late', rank, behind: name(race.winner!), ...rolled };
      else r = { t: 'result', armId: race.armId, outcome: 'late', rank, afterMs: Math.max(0, race.queue[i].key - aheadKey), behind: name(ahead ?? ''), ...rolled, ...(q.arrivedLate ? { arrivedLate: true } : {}) };
      const member = race.queue[i].member;
      for (const p of this.phones.values()) {
        if (p.seatId !== q.seatId) continue;
        // Teams: whose buzz holds the team's place, and whether it's this phone's.
        const mine = st.teams && q.by ? { ...r, by: q.by, byYou: !!member && p.member === member } : r;
        const k = JSON.stringify(mine);
        if (this.lastResults.get(p.conn) === k) continue;
        this.lastResults.set(p.conn, k);
        this.deps.toPhone(p.conn, mine);
      }
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
    const teams = !!st?.teams;
    const members = Object.entries(this.s.members ?? {});
    /** Seats a connected phone holds (a taken seat without one is away). */
    const held = new Set([...this.phones.values()].flatMap((p) => (p.seatId ? [p.seatId] : [])));
    const seatsMsg = JSON.stringify({
      t: 'seats',
      title: st?.title ?? '',
      seats: (st?.seats ?? []).map((x) =>
        teams
          ? { ...x, taken: false, members: members.filter(([, m]) => m.seatId === x.id).map(([, m]) => m.name) }
          : { ...x, taken: !!this.s.tokens[x.id], ...(this.s.tokens[x.id] && !held.has(x.id) ? { away: true } : {}) },
      ),
      allowNew: !teams && (st?.allowNew ?? false),
      hostHere: this.hostHere,
      ...(st?.locked ? { locked: true } : {}),
      ...(st?.status?.text ? { note: st.status.text } : {}),
      ...(teams ? { teams: true } : {}),
    } satisfies RoomToPhone);
    const by = teams ? this.answeringBy() : null;
    for (const p of this.phones.values()) {
      if (p.seatId && st) {
        const m = p.member ? this.s.members?.[p.member] : undefined;
        const me: MemberRef | null = m && p.member ? { id: p.member, name: m.name } : null;
        const round = st.wager && this.s.wagers?.id === st.wager.id ? this.s.wagers : undefined;
        let sent = round?.seats[p.seatId];
        // Seated (teams: on the team) since the round began: only what it sent itself (see Wagers above).
        const since = m ? m.at : this.s.seatedAt?.[p.seatId];
        const late = round?.at !== undefined && since !== undefined && since > round.at;
        // (Teams: by who sent it, not when: a teammate's wager changed after they joined stays hidden from them too.)
        const own = m ? sent?.member === p.member : sent?.at !== undefined && sent.at >= (since ?? 0);
        if (late && sent && !own) sent = undefined;
        const race = this.s.race;
        // A buzz now would still get in line: someone else answers out of a race this seat hasn't buzzed in.
        const canQueue =
          st.phase === 'answering' && !st.answerShown && !!race && race.armId === st.armId && st.answering !== p.seatId && !st.lockedOut.includes(p.seatId) && !race.queue.some((b) => b.seatId === p.seatId);
        const view = { ...phoneView(st, p.seatId, me, by, sent, late), hostHere: this.hostHere, ...(canQueue ? { canQueue: true } : {}) };
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
    const named = (id: string | undefined) => {
      const m = id ? this.s.members?.[id] : undefined;
      return m && id ? { member: id, name: m.name } : {};
    };
    const list: PhoneInfo[] = [...this.phones.values()].map((p) => ({
      conn: p.conn,
      seatId: p.seatId,
      ...(p.pendingName !== undefined ? { pendingName: p.pendingName } : {}),
      connected: true,
      ...named(p.member),
    }));
    for (const [seatId, conn] of Object.entries(this.s.holders)) {
      if (this.s.tokens[seatId] && ![...this.phones.values()].some((p) => p.seatId === seatId)) list.push({ conn, seatId, connected: false });
    }
    // Team members whose phone is away (asleep, reloading): still on their team.
    for (const [id, m] of members) {
      if (![...this.phones.values()].some((p) => p.member === id)) list.push({ conn: m.conn ?? id, seatId: m.seatId, connected: false, ...named(id) });
    }
    const key = JSON.stringify(list);
    if (key !== this.lastPhones) {
      this.lastPhones = key;
      this.deps.toHost({ t: 'phones', phones: list });
    }
  }

  /** Teams: the member whose buzz has the answering team answering (null: none did, e.g. the host picked the team). */
  private answeringBy(): MemberRef | null {
    const st = this.s.state;
    const race = this.s.race;
    if (!st || st.phase !== 'answering' || !st.answering || !race || race.armId !== st.armId) return null;
    const b = race.queue.find((x) => x.seatId === st.answering);
    return b?.member && b.by ? { id: b.member, name: b.by } : null;
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

/** How a phone lost its seat to the host: taken back (kick, with a block) or freed for its player's other phone. */
type Kicked = 'kicked' | 'freed';
const kickedMsg = (k: Kicked): RoomToPhone => (k === 'freed' ? { t: 'kicked', freed: true } : { t: 'kicked' });

const strip = (p: Phone): PhoneSaved => ({
  conn: p.conn,
  seatId: p.seatId,
  ...(p.member ? { member: p.member } : {}),
  ...(p.pendingName !== undefined ? { pendingName: p.pendingName } : {}),
  ...(p.rtts?.length ? { rtts: p.rtts } : {}),
  ...(p.device ? { device: p.device } : {}),
  ...(p.ip ? { ip: p.ip } : {}),
  ...(p.flooded ? { flooded: true } : {}),
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
    seats.push({ id: s.id, name: cleanName(s.name, SEAT_NAME_MAX), color: typeof s.color === 'string' && COLOR.test(s.color) ? s.color : '#4f7cff' });
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
  // Added later (optional).
  const extra: Partial<HostState> = {};
  if (isObj(x.done)) extra.done = { by: typeof x.done.by === 'string' && ids.has(x.done.by) ? x.done.by : null };
  if (isObj(x.status) && typeof x.status.text === 'string' && x.status.text.trim()) {
    const st: NonNullable<HostState['status']> = { text: clip(x.status.text.trim(), STATUS_MAX) };
    if (Array.isArray(x.status.seats) && typeof x.status.seatsText === 'string' && x.status.seatsText.trim()) {
      st.seats = x.status.seats.filter((id): id is string => typeof id === 'string' && ids.has(id));
      st.seatsText = clip(x.status.seatsText.trim(), STATUS_MAX);
    }
    extra.status = st;
  }
  if (typeof x.currency === 'string' && x.currency) extra.currency = clip(x.currency, 8);
  if (x.locked === true) extra.locked = true;
  if (x.teams === true) extra.teams = true;
  if (x.colorPick === true) extra.colorPick = true;
  if (x.answerShown === true) extra.answerShown = true;
  if (x.over === true) extra.over = true;
  if (isObj(x.wager) && typeof x.wager.id === 'string' && x.wager.id && x.wager.id.length <= 100 && (x.wager.kind === 'dd' || x.wager.kind === 'final') && Array.isArray(x.wager.seats)) {
    const amount = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= WAGER_MAX ? (v as number) : undefined);
    const wseats: WagerSeat[] = [];
    for (const w of x.wager.seats.slice(0, 64)) {
      if (!isObj(w) || typeof w.id !== 'string' || !ids.has(w.id) || wseats.some((o) => o.id === w.id)) continue;
      const max = typeof w.max === 'number' && Number.isFinite(w.max) ? Math.max(0, Math.min(WAGER_MAX, Math.floor(w.max))) : 0;
      const a = amount(w.amount);
      const got = Number.isSafeInteger(w.got) && (w.got as number) > 0 ? (w.got as number) : undefined;
      wseats.push({ id: w.id, max, ...(a !== undefined ? { amount: a } : {}), ...(w.fromHost === true ? { fromHost: true } : {}), ...(got ? { got } : {}) });
    }
    extra.wager = { id: x.wager.id, kind: x.wager.kind, open: x.wager.open === true, ...(x.wager.limit === true ? { limit: true } : {}), seats: wseats };
  }
  return {
    title: clip(x.title, TITLE_MAX),
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
    ...extra,
  };
}
