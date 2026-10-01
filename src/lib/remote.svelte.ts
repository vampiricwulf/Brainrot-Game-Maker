// Phone buzzers, the host's side: one buzzer room at a time (see roomlink.ts for the connection, buzzproto.ts for what is
// said). Reactive, for the pre-game card and the host panel.
import { joinUrl, type HostState, type NewRoom, type PhoneInfo } from './buzzproto';
import type { SavedRoom } from './persist';
import { prefs } from './prefs.svelte';
import { RoomLink, type LinkDeps, type RoomBuzz, type RoomQueue, type RoomStatus } from './roomlink';

/** The buzzer server this copy was built with (CI passes it), or ''. */
export const DEFAULT_BUZZER_URL: string = (import.meta.env.VITE_BUZZER_URL ?? '').trim();

const clean = (url: string) => url.trim().replace(/\/+$/, '');

/** Where rooms are made: ⚙ Settings › Buzzer server, else the built-in one. '' when neither is set (no phone buzzers). */
export function buzzerBase(): string {
  return clean(prefs.buzzerServer || DEFAULT_BUZZER_URL);
}

export const remote = $state<{
  status: RoomStatus;
  code: string | null;
  /** The server the room is on (its join link). */
  base: string;
  phones: PhoneInfo[];
  error: string;
  /** Reconnect attempts since the room was last reached. */
  attempts: number;
  /** Phones asking to join that the host already answered (until the room's next list leaves them out). */
  answered: string[];
  /** When the room last turned a phone away because it was full (0: not lately). */
  fullAt: number;
}>({ status: 'off', code: null, base: '', phones: [], error: '', attempts: 0, answered: [], fullAt: 0 });

/** How long "Room full" shows after the room last turned a phone away. */
export const FULL_SHOWN_MS = 2 * 60_000;

/**
 * A room left open while the host went back to the editor from the pre-game screen (◀ Back to editor): ▶ Play picks
 * it up again (same code, phones stay joined). Saved too (persist.ts saveRoom), so a reload keeps it.
 */
export const kept = $state<{ room: SavedRoom | null }>({ room: null });

let link: RoomLink | null = null;
const buzzWatchers = new Set<(b: RoomBuzz) => void>();
const queueWatchers = new Set<(q: RoomQueue) => void>();
/** For tests: the WebSocket, fetch and timers the link uses. */
let deps: LinkDeps | undefined;
export function setRemoteDeps(d: LinkDeps | undefined): void {
  deps = d;
}

function sync(): void {
  if (!link) return;
  remote.status = link.status;
  remote.code = link.code;
  if (remote.phones !== link.phones) remote.answered = remote.answered.filter((c) => link!.phones.some((p) => p.conn === c && !p.seatId));
  remote.phones = link.phones;
  remote.error = link.error;
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

export function acceptPhone(conn: string, seatId: string): boolean {
  remote.answered = [...remote.answered, conn];
  return !!link?.send({ t: 'accept', conn, seatId });
}
export function rejectPhone(conn: string): boolean {
  remote.answered = [...remote.answered, conn];
  return !!link?.send({ t: 'reject', conn });
}
export const kickSeat = (seatId: string) => !!link?.send({ t: 'kick', seatId });

/** Close the room: the phones are told the game is over. */
export function closeRoom(): void {
  link?.close();
  link = null;
  Object.assign(remote, { status: 'off', code: null, phones: [], error: '', attempts: 0, answered: [], fullAt: 0 });
}

/** Close a room this window isn't in (one an earlier page left open), without touching the one it is in. */
export function endRoom(room: NewRoom & { base: string }): void {
  if (link?.room?.code === room.code) return closeRoom();
  new RoomLink(room.base, {}, deps).end(room);
}

/** The room this window is in, if it's that one and still there. */
export const inRoom = (code: string): boolean => link?.room?.code === code && link.status !== 'off' && link.status !== 'error';

/** The link players open on their phone. */
export function roomLink(code = remote.code): string {
  return code && remote.base ? joinUrl(remote.base, code) : '';
}

/** ⚙ Settings › Test: is a buzzer server answering there? */
export async function testServer(base: string): Promise<string> {
  const url = clean(base);
  if (!/^https?:\/\//.test(url)) return 'Type the server’s address, starting with https://';
  try {
    const res = await fetch(`${url}/api/health`);
    return res.ok ? '✔ The buzzer server is answering' : `✘ It answered, but not as a buzzer server (${res.status})`;
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
