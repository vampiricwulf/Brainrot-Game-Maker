// Phone buzzers, the host's side: one buzzer room at a time (see roomlink.ts for the connection, buzzproto.ts for what is
// said). Reactive, for the pre-game card and the host panel.
import { filesUrl, joinUrl, mbText, UPLOADS_BUSY, type CardLate, type FileLimits, type HostState, type NewRoom, type PhoneInfo } from './buzzproto';
import type { TeamMember } from './model';
import type { SavedRoom } from './persist';
import { embeddedBuzzerServer } from './export';
import { prefs, serverAddress } from './prefs.svelte';
import { app } from './app.svelte';
import { PING_MS, RoomLink, type LinkDeps, type RoomBuzz, type RoomCardSeen, type RoomQueue, type RoomStatus, type RoomWager, type RoomAnswer } from './roomlink';
import { healthFiles, noteServerFiles } from './serverlimits.svelte';

/** The buzzer server this copy was built with (CI passes it), or ''. */
export const DEFAULT_BUZZER_URL: string = (import.meta.env.VITE_BUZZER_URL ?? '').trim();

/**
 * Where rooms are made: ⚙ Settings › Buzzer server, else (an exported game) the one it was exported with, else the
 * built-in one. '' when none is set (no phone buzzers). A player-only file uses the one it was made with first: its
 * maker chose it, and this browser's setting may be another file's (every file:// page shares the same storage).
 */
export function buzzerBase(): string {
  const embedded = embeddedBuzzerServer();
  // (An address saved before ⚙ Settings added a missing https:// gets it here.)
  return serverAddress((app.playerOnly ? embedded || prefs.buzzerServer : prefs.buzzerServer || embedded) || DEFAULT_BUZZER_URL);
}

export const remote = $state<{
  status: RoomStatus;
  code: string | null;
  /** The server the room is on (its join link). */
  base: string;
  phones: PhoneInfo[];
  /**
   * The room sent its list of phones since it last welcomed this window: `phones` is the room's now. Until then it's the
   * list from before a reconnect, or none after a reload.
   */
  listed: boolean;
  /** What the room can do beyond the first protocol ('teams'); empty from an older buzzer server. */
  features: string[];
  /**
   * The room said what it can do (its welcome) since this window joined it. Until then `features` is empty because
   * nothing is known yet (a reload connects afresh), not because the room can't.
   */
  welcomed: boolean;
  /** The 🤫 card files the room holds now (their ids), as it last said; null until it has. */
  files: string[] | null;
  /** How big a 🤫 card file the room's server takes, as its welcome said (null: it didn't: an older one, or no files). */
  limits: FileLimits | null;
  /** The phones here now that a 🤫 card was sent to but that are late for it (the panel suggests ↻ Send again). */
  cardsLate: CardLate[];
  error: string;
  /** The close code the room turned this window away with (4004: it ended; 4000: another window took it), or 0. */
  closedCode: number;
  /** Reconnect attempts since the room was last reached. */
  attempts: number;
  /** Phones asking to join that the host already answered (until the room's next list leaves them out). */
  answered: string[];
  /** When the room last turned a phone away because it was full (0: not lately). */
  fullAt: number;
  /** Seats kicked from here (seat id → when): for the 2 minutes their phone is kept off, the host can ↩ Let it back. */
  kicked: Record<string, number>;
}>({ status: 'off', code: null, base: '', phones: [], listed: false, features: [], welcomed: false, files: null, limits: null, cardsLate: [], error: '', closedCode: 0, attempts: 0, answered: [], fullAt: 0, kicked: {} });

/** How long "Room full" shows after the room last turned a phone away. */
export const FULL_SHOWN_MS = 2 * 60_000;

/**
 * A room left open while the host went back to the editor from the pre-game screen (◀ Back to editor): ▶ Play picks
 * it up again (same code, phones stay joined). Saved too (persist.ts saveRoom), so a reload keeps it.
 */
/**
 * `handedOff`: another tab took over editing (this one paused): the room and its saved copy are that tab's now, and
 * nothing here closes or forgets them.
 */
export const kept = $state<{ room: SavedRoom | null; handedOff?: boolean }>({ room: null });

let link: RoomLink | null = null;
const buzzWatchers = new Set<(b: RoomBuzz) => void>();
const queueWatchers = new Set<(q: RoomQueue) => void>();
const wagerWatchers = new Set<(w: RoomWager) => void>();
/** For tests: the WebSocket, fetch and timers the link uses. */
let deps: LinkDeps | undefined;
export function setRemoteDeps(d: LinkDeps | undefined): void {
  deps = d;
}

function sync(): void {
  if (!link) return;
  remote.status = link.status;
  remote.code = link.code;
  // (Answered until the room's list no longer has it asking: a phone turned away that asks again shows again.)
  if (remote.phones !== link.phones) remote.answered = remote.answered.filter((c) => link!.phones.some((p) => p.conn === c && !p.seatId && p.pendingName !== undefined));
  remote.phones = link.phones;
  remote.listed = link.listed;
  if (remote.features.join() !== link.features.join()) remote.features = link.features;
  remote.welcomed = link.welcomed;
  if (remote.files?.join() !== link.files?.join()) remote.files = link.files;
  if (JSON.stringify(remote.limits) !== JSON.stringify(link.limits)) remote.limits = link.limits;
  // (What the server takes, for the editor and the next room on it too: a welcome with 'files' says it.)
  if (link.welcomed && link.features.includes('files')) noteServerFiles(link.base, link.limits ? { files: link.limits } : 'old');
  if (JSON.stringify(remote.cardsLate) !== JSON.stringify(link.cardsLate)) remote.cardsLate = link.cardsLate;
  remote.error = link.error;
  remote.closedCode = link.closedCode;
  remote.attempts = link.attempts;
}

function newLink(base: string): RoomLink {
  link?.stop();
  link = new RoomLink(
    base,
    {
      onChange: sync,
      onBuzz: (b) => buzzWatchers.forEach((fn) => fn(b)),
      onQueue: (q) => queueWatchers.forEach((fn) => fn(q)),
      onFull: () => (remote.fullAt = Date.now()),
      onWager: (w) => wagerWatchers.forEach((fn) => fn(w)),
      onAnswer: (a) => answerWatchers.forEach((fn) => fn(a)),
      onColor: (c) => colorWatchers.forEach((fn) => fn(c)),
      onCardSeen: (c) => seenWatchers.forEach((fn) => fn(c)),
    },
    deps,
  );
  remote.base = base;
  remote.fullAt = 0;
  return link;
}

/** A buzz the room counted (rank 1: the first in). Returns the unsubscribe. */
export function onRoomBuzz(fn: (b: RoomBuzz) => void): () => void {
  buzzWatchers.add(fn);
  return () => buzzWatchers.delete(fn);
}

/** The room's queue of buzzes (fastest first) changed. Returns the unsubscribe. */
export function onRoomQueue(fn: (q: RoomQueue) => void): () => void {
  queueWatchers.add(fn);
  return () => queueWatchers.delete(fn);
}

const answerWatchers = new Set<(a: RoomAnswer) => void>();
/** A player sent their answer to a ✍ clue from their phone. Returns the unsubscribe. */
export function onRoomAnswer(fn: (a: RoomAnswer) => void): () => void {
  answerWatchers.add(fn);
  return () => answerWatchers.delete(fn);
}

const seenWatchers = new Set<(c: RoomCardSeen) => void>();
/** A phone showed a 🤫 card the host sent it. Returns the unsubscribe. */
export function onRoomCardSeen(fn: (c: RoomCardSeen) => void): () => void {
  seenWatchers.add(fn);
  return () => seenWatchers.delete(fn);
}

const colorWatchers = new Set<(c: { seatId: string; color: string }) => void>();
/** A player asked for another colour from their phone. Returns the unsubscribe. */
export function onRoomColor(fn: (c: { seatId: string; color: string }) => void): () => void {
  colorWatchers.add(fn);
  return () => colorWatchers.delete(fn);
}

/** A player sent their wager from their phone. Returns the unsubscribe. */
export function onRoomWager(fn: (w: RoomWager) => void): () => void {
  wagerWatchers.add(fn);
  return () => wagerWatchers.delete(fn);
}

/** Make a room on the buzzer server. Null (remote.error says why) when it couldn't. */
export async function startRoom(base = buzzerBase()): Promise<(NewRoom & { base: string }) | null> {
  if (!base) return null;
  const l = newLink(base);
  try {
    const room = await l.create();
    return { ...room, base };
  } catch {
    return null;
  }
}

/** Back into the room a resumed game was using (same code and host token). */
export function rejoinRoom(room: NewRoom & { base: string }): void {
  if (link?.room?.code === room.code && link.status !== 'off' && link.status !== 'error') return;
  newLink(room.base).connect(room);
  sync();
}

export function sendHostState(state: HostState, now = false): void {
  link?.setState(state, now);
}

/** Send the state again (the room let a buzz through that the host overruled). */
export function resendHostState(): void {
  link?.resend();
}

/** Let a phone asking to join in, on seat `seatId`. false: the room can't be reached (the request stays listed). */
export function acceptPhone(conn: string, seatId: string): boolean {
  const ok = !!link?.send({ t: 'accept', conn, seatId });
  if (ok) remote.answered = [...remote.answered, conn];
  return ok;
}
/** Turn a phone asking to join away. false: the room can't be reached (the request stays listed). */
export function rejectPhone(conn: string): boolean {
  const ok = !!link?.send({ t: 'reject', conn });
  if (ok) remote.answered = [...remote.answered, conn];
  return ok;
}
/**
 * Take a seat back from its phone (it can't take it again for 2 minutes). free: only let go of it, blocking nobody (the
 * player is back on another phone); a room without 'free' blocks anyway.
 */
export function kickSeat(seatId: string, free = false): boolean {
  const ok = !!link?.send(free ? { t: 'kick', seatId, block: false } : { t: 'kick', seatId });
  if (!ok) return false;
  // (Freed: ↩ Let back is done, or Free seat let go of a seat another phone took since, which keeps the kick's block.)
  const { [seatId]: _was, ...rest } = remote.kicked;
  remote.kicked = free ? rest : { ...rest, [seatId]: Date.now() };
  return true;
}

/** The room can free a seat without blocking anyone (an older buzzer server can only kick). */
export const roomCanFree = (): boolean => remote.features.includes('free');
/** Teams: take one person (their phone) off their team; they can't join it again for 2 minutes. */
export const kickMember = (seatId: string, member: string) => !!link?.send({ t: 'kick', seatId, member });
/** Teams: put one person (their phone) on another team. */
export const moveMember = (member: string, seatId: string) => !!link?.send({ t: 'move', member, seatId });
/** The room this window is in knows teams (an older buzzer server doesn't: its phones join as players). */
export const roomHasTeams = (): boolean => remote.features.includes('teams');
/** The room this window is in takes wagers from phones (an older buzzer server doesn't: the host types them). */
export const roomHasWagers = (): boolean => remote.features.includes('wagers');
/** The room this window is in takes answers from phones (✍ clues; an older buzzer server doesn't). */
export const roomHasAnswers = (): boolean => remote.features.includes('answers');
/** The room this window is in puts a ✍ clue's multiple choices on phones (an older buzzer server doesn't: they type). */
export const roomHasChoices = (): boolean => remote.features.includes('choices');
/** Teams: the people on team `seatId` with a phone in the room now (each once), for the member wheel. */
export function roomMembers(seatId: string): TeamMember[] {
  const out: TeamMember[] = [];
  for (const p of remote.phones) if (p.seatId === seatId && p.connected && p.member && !out.some((m) => m.id === p.member)) out.push({ id: p.member, name: p.name?.trim() || 'Someone' });
  return out;
}

/** The room this window is in puts 🤫 cards on phones (an older buzzer server doesn't: the host copies them). */
export const roomHasCards = (): boolean => remote.features.includes('cards');
/** The room this window is in takes card files from this computer now (its server may be off them, or out of budget). */
export const roomHasFiles = (): boolean => roomHasCards() && remote.features.includes('files');

/** Why the room turned a card file down (its HTTP answer): plain words for each, and whether trying again may help. */
export type UploadRefusal = 'full' | 'big' | 'kind' | 'busy' | 'off' | 'room' | 'error';

/** An upload with no bytes going up (nor an answer coming) for this long is stuck: stopped, and taken as a network blip. */
export const UPLOAD_STALL_MS = 60_000;
/**
 * Cloudflare turns away a request body over this (its Free and Pro plans' limit) before it reaches the buzzer server,
 * with no CORS headers, so the page only sees the connection drop.
 */
const CLOUDFLARE_BODY_MAX = 100_000_000;
/** What an upload came to: the room's id for the file, or why not (`aborted`: stopped from here). */
export type UploadAnswer = { id: string } | { refused: UploadRefusal; error: string; aborted?: true };

/**
 * Upload one 🤫 card file to the room this window is in (POST …/files, the host token in a header, never in the
 * address): its id there, or why not. Only a send or ⇡ Get it ready gets here (cardfiles.svelte.ts). `onProgress`
 * hears how much of it went up (0 to 1); `signal` stops it ({ aborted: true }).
 */
export function uploadCardFile(
  blob: Blob,
  type: string,
  { onProgress, signal }: { onProgress?: (done: number) => void; signal?: AbortSignal } = {},
): Promise<UploadAnswer> {
  const room = link?.room;
  if (!room || !remote.base) return Promise.resolve({ refused: 'room', error: 'The buzzer room isn’t open' });
  if (signal?.aborted) return Promise.resolve({ refused: 'error', error: 'Stopped', aborted: true });
  const base = remote.base;
  return new Promise((done) => {
    // (XMLHttpRequest, not fetch: only it says how much of a body went up.)
    const x = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    let stalled = false;
    let over = false;
    const unreached = () => ({
      refused: 'error' as const,
      error: blob.size > CLOUDFLARE_BODY_MAX ? 'Couldn’t reach the buzzer server (Cloudflare may turn files this big away before they reach it)' : 'Couldn’t reach the buzzer server',
    });
    const end = (r: UploadAnswer) => {
      if (over) return;
      over = true;
      clearTimeout(stall);
      signal?.removeEventListener('abort', stop);
      done(r);
    };
    const stop = () => x.abort();
    // (Each bit that goes up, or comes back, puts off the stall.)
    const moved = () => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        stalled = true;
        x.abort();
      }, UPLOAD_STALL_MS);
    };
    x.upload.onprogress = (e) => {
      moved();
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    x.onprogress = moved;
    x.onerror = () => end(unreached());
    x.onabort = () => end(stalled ? unreached() : { refused: 'error', error: 'Stopped', aborted: true });
    x.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(x.responseText);
      } catch {
        // (Not JSON: said by its status.)
      }
      const said = typeof body === 'object' && body && 'error' in body && typeof body.error === 'string' ? body.error.slice(0, 200) : '';
      const id = typeof body === 'object' && body && 'id' in body && typeof body.id === 'string' ? body.id : '';
      if (x.status >= 200 && x.status < 300 && /^[0-9a-f]{64}$/.test(id)) {
        // (The room holds it now: its 'files' list says so in a moment; until then, so does this.)
        if (link?.room === room && link.files && !link.files.includes(id)) {
          link.files = [...link.files, id];
          sync();
        }
        return end({ id });
      }
      const s = x.status;
      // (The room taking 2 already is over in a moment: tried again, as a blip. The budget's 429s aren't.)
      const busy = s === 429 && said !== UPLOADS_BUSY;
      const refused: UploadRefusal = s === 409 ? 'full' : s === 413 ? 'big' : s === 415 ? 'kind' : busy ? 'busy' : s === 503 ? 'off' : s === 401 ? 'room' : 'error';
      end({ refused, error: said || `The buzzer server said no (${s})` });
    };
    signal?.addEventListener('abort', stop);
    try {
      x.open('POST', filesUrl(base, room.code));
      x.setRequestHeader('Authorization', `Bearer ${room.hostToken}`);
      x.setRequestHeader('Content-Type', type);
      moved();
      x.send(blob);
    } catch {
      end(unreached());
    }
  });
}

/** ✖ Take back: the room deletes these card files now (only those no card still out uses). */
export const forgetCardFiles = (ids: string[]): boolean => ids.length > 0 && remote.features.includes('files') && !!link?.send({ t: 'forget', files: ids });

/**
 * Close the room: the phones are told the game is over. A close that went out may still not get there (a line that
 * died a moment ago takes it all the same), so a link of its own goes in after it: a room that got it turns that one
 * away at once; one that didn't is closed once it answers (it keeps trying for about a minute). False when the phones
 * likely weren't told yet: the close couldn't go, or the room hasn't answered lately.
 */
export function closeRoom(): boolean {
  const l = link;
  link = null;
  // (Taken before stop(), which forgets it. None after the room turned this window away: it's gone already, or another
  // window's now.)
  const room = l?.room ?? null;
  // (A room that's there answers every ping, PING_MS apart: 5 s more for the pong.)
  const told = !!l && l.send({ t: 'close' }) && l.heardAgo() < PING_MS + 5000;
  l?.stop();
  // (8 tries: 0.5 s, 1 s, 2 s… 15 s, about a minute in all; see retryDelay.)
  if (l && room) new RoomLink(l.base, {}, deps).end(room, 8);
  Object.assign(remote, { status: 'off', code: null, phones: [], listed: false, features: [], welcomed: false, files: null, limits: null, cardsLate: [], error: '', closedCode: 0, attempts: 0, answered: [], fullAt: 0, kicked: {} });
  return told || !room;
}

/**
 * Let go of the room without closing it (the phones stay joined): another tab took over the game, and picks the room
 * up again when it resumes.
 */
export function leaveRoom(): void {
  link?.stop();
  link = null;
  Object.assign(remote, { status: 'off', code: null, phones: [], listed: false, features: [], welcomed: false, files: null, limits: null, cardsLate: [], error: '', closedCode: 0, attempts: 0, answered: [], fullAt: 0, kicked: {} });
}

/** Close a room this window isn't in (one an earlier page left open), without touching the one it is in. */
export function endRoom(room: NewRoom & { base: string }): void {
  if (link?.room?.code === room.code) return void closeRoom();
  new RoomLink(room.base, {}, deps).end(room);
}

// A hidden page's timers are held back (to about one a minute): a connection that dropped meanwhile tries again as soon
// as the host looks, or the network comes back, not on its next late try. One that seems fine is checked then (a
// router restart can leave it dead without a word), and when the network goes.
if (typeof document !== 'undefined') {
  const check = () => {
    link?.retryNow();
    link?.probe();
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  window.addEventListener('online', check);
  window.addEventListener('offline', check);
}

/**
 * Is room `code` still there (GET /api/rooms/:code, as a phone asks before it joins)? A room this window isn't in: one a
 * game kept to resume left its phones in. null: no answer (offline, too many lookups).
 */
export async function roomStillOpen(room: { code: string; base: string }): Promise<boolean | null> {
  try {
    const res = await (deps?.fetch ?? fetch)(`${room.base.replace(/\/+$/, '')}/api/rooms/${room.code}`, { cache: 'no-store' });
    return res.status === 404 ? false : res.ok ? true : null;
  } catch {
    return null;
  }
}

/** The room this window is in, if it's that one and still there. */
export const inRoom =(code: string): boolean => link?.room?.code === code && link.status !== 'off' && link.status !== 'error';

/** The link players open on their phone. */
export function roomLink(code = remote.code): string {
  return code && remote.base ? joinUrl(remote.base, code) : '';
}

/** ⚙ Settings › Test: is a buzzer server answering there, and what card files does it take? */
export async function testServer(base: string): Promise<string> {
  const url = serverAddress(base);
  if (!/^https?:\/\//.test(url)) return 'Type the server’s address, starting with https://';
  try {
    const res = await fetch(`${url}/api/health`);
    if (!res.ok) return `✘ It answered, but not as a buzzer server (${res.status})`;
    const said = healthFiles(await res.json().catch(() => null));
    if (said) noteServerFiles(url, said);
    if (said === 'off') return '✔ The buzzer server is answering (it takes no card files)';
    if (said === 'old') return '✔ The buzzer server is answering (an older one: card files up to 16 MB)';
    if (said) return `✔ The buzzer server is answering: card files up to ${mbText(said.files.fileBytes)} each, ${mbText(said.files.roomBytes)} a room`;
    return '✔ The buzzer server is answering';
  } catch {
    return '✘ No answer from there';
  }
}

/**
 * Buzzer mode as the game plays it: on only when this copy has a buzzer server to run the room on. (A game saved with
 * it on keeps its setting, for a copy that has one.)
 */
export function buzzerOn(settings: { buzzer?: boolean }): boolean {
  return !!settings.buzzer && !!buzzerBase();
}
