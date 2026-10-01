/**
 * Remote buzzers: the messages between the host (this app), the buzzer room (a Cloudflare Worker + Durable Object,
 * see buzzer/) and players' phones. JSON over WebSocket, one room per game, addressed by a 4-letter code.
 *
 * Who decides what:
 * - The host owns the game: seats (the players), whether buzzers are open, the clue text phones may see, who is locked
 *   out, scores. It sends its whole HostState whenever that changes; the room keeps the latest one.
 * - The room owns the race: while armed, the first buzz it receives from a seat that may buzz wins. It moves to
 *   'answering' on its own (so a second buzz can never also win), tells the host, and the host follows.
 * - Phones only ever see phoneView(): never answers, notes, media or other players' tokens.
 *
 * This file is shared by the app and the Worker (buzzer/ imports it), so it has no app imports.
 */

export const BUZZ_PROTOCOL = 1;

/** Room codes: consonants only (no words, no 0/O or 1/I mix-ups). */
export const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const isRoomCode = (s: string): boolean => new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(s);

/** A player's place in the game. id is the game's player id; it is never a credential (seat tokens are). */
export interface Seat {
  id: string;
  name: string;
  /** CSS colour (#rrggbb). */
  color: string;
}

/**
 * - lobby: no clue open (the board, between rounds, before the game). Phones show their name and score.
 * - closed: a clue is open but buzzers aren't armed yet (the host is reading). A buzz now is early.
 * - armed: buzzers are open; the first buzz wins.
 * - answering: someone is answering (answering is set); others wait.
 */
export type BuzzPhase = 'lobby' | 'closed' | 'armed' | 'answering';

/** Everything the host tells the room. Sent whole on every change (it is small). */
export interface HostState {
  title: string;
  seats: Seat[];
  /** Phones may ask to join as a player not in the game; the host accepts or rejects them. */
  allowNew: boolean;
  phase: BuzzPhase;
  /** Goes up by one every time the buzzers are armed; a buzz names the arm it was for, so a stale one never counts. */
  armId: number;
  /** While closed/armed/answering: what phones show of the clue. Question text only, never the answer. */
  clue?: { text: string; caption?: string } | null;
  /** The seat answering (phase 'answering'). */
  answering?: string | null;
  /** Seats that can't buzz on this clue (they already missed it). */
  lockedOut: string[];
  /** A buzz while 'closed' locks that phone out for this long once the buzzers open (0 = no penalty). */
  earlyLockMs: number;
  scores: Record<string, number>;
}

/** What one phone sees. Built by phoneView() only. */
export interface PhoneView {
  title: string;
  phase: BuzzPhase;
  armId: number;
  clue: { text: string; caption?: string } | null;
  /** Who is answering (name and colour only). */
  answering: { name: string; color: string; you: boolean } | null;
  /** This phone's player; null until it has a seat. */
  you: (Seat & { score: number; lockedOut: boolean }) | null;
}

export function phoneView(s: HostState, seatId: string | null): PhoneView {
  const seat = seatId ? s.seats.find((x) => x.id === seatId) : undefined;
  const a = s.phase === 'answering' && s.answering ? s.seats.find((x) => x.id === s.answering) : undefined;
  return {
    title: s.title,
    phase: s.phase,
    armId: s.armId,
    clue: s.phase === 'lobby' ? null : s.clue ? { text: s.clue.text, ...(s.clue.caption ? { caption: s.clue.caption } : {}) } : null,
    answering: a ? { name: a.name, color: a.color, you: a.id === seatId } : null,
    you: seat ? { id: seat.id, name: seat.name, color: seat.color, score: s.scores[seat.id] ?? 0, lockedOut: s.lockedOut.includes(seat.id) } : null,
  };
}

/** A phone as the host sees it in its list. */
export interface PhoneInfo {
  /** Connection id, stable while the socket lives. */
  conn: string;
  /** The seat it holds, or null while it is choosing / waiting to be accepted. */
  seatId: string | null;
  /** A name typed for a new player waiting on the host (allowNew). */
  pendingName?: string;
  connected: boolean;
}

/** The host → room. The host's token goes in the WebSocket URL, not in messages. */
export type HostMsg =
  | { t: 'state'; state: HostState }
  /** Accept a phone waiting as a new player: the host has added the seat (newSeat) to the game and to state.seats. */
  | { t: 'accept'; conn: string; seatId: string }
  | { t: 'reject'; conn: string }
  /** Take a seat back: its phone is told and its token stops working (it can claim a free seat again). */
  | { t: 'kick'; seatId: string }
  | { t: 'close' }
  | { t: 'ping'; at: number };

/** The room → host. */
export type RoomToHost =
  | { t: 'welcome'; code: string; protocol: number; serverNow: number }
  /** A buzz the room counted while armed. rank 1 is the winner (the room has moved to 'answering'); later ranks came after. */
  | { t: 'buzz'; armId: number; seatId: string; rank: number; afterMs: number }
  | { t: 'phones'; phones: PhoneInfo[] }
  | { t: 'pong'; at: number; serverNow: number }
  | { t: 'error'; message: string };

/** A phone → room. */
export type PhoneMsg =
  /** Claim a seat. With a token (from an earlier 'joined') it takes the seat back even if another socket holds it. */
  | { t: 'join'; seatId: string; token?: string }
  /** Ask to join as a new player (only when allowNew). */
  | { t: 'new'; name: string }
  | { t: 'buzz'; armId: number }
  | { t: 'leave' }
  | { t: 'ping'; at: number };

/** The room → a phone. */
export type RoomToPhone =
  /** On connect and whenever seats change: the seats and which are free. */
  | { t: 'seats'; title: string; seats: (Seat & { taken: boolean })[]; allowNew: boolean; hostHere: boolean }
  /** This phone holds seatId; keep token (localStorage, per room code) to come back after a refresh. */
  | { t: 'joined'; seatId: string; token: string }
  | { t: 'waiting' }
  | { t: 'denied'; reason: 'taken' | 'unknown-seat' | 'rejected' | 'full' | 'no-new' | 'bad-token' }
  | { t: 'view'; view: PhoneView }
  /** This phone's own buzz: rank 1 = you're answering; 'early' = before the buzzers opened (locked until lockedUntil); 'late' / 'locked' = didn't count. */
  | { t: 'result'; armId: number; outcome: 'first' | 'late' | 'early' | 'locked'; rank?: number; afterMs?: number; lockedUntil?: number }
  | { t: 'kicked' }
  /** The host closed the room (or it expired). */
  | { t: 'closed' }
  | { t: 'pong'; at: number; serverNow: number };

/** POST {base}/api/rooms → this. Then the host connects to {wss base}/ws/{code}?host={hostToken}; phones to /ws/{code}. */
export interface NewRoom {
  code: string;
  hostToken: string;
}

/** The link players open (it fills the code in). */
export const joinUrl = (base: string, code: string): string => `${base.replace(/\/+$/, '')}/${code}`;
/** http(s) → ws(s). */
export const socketUrl = (base: string, code: string, hostToken?: string): string =>
  `${base.replace(/\/+$/, '').replace(/^http/, 'ws')}/ws/${code}${hostToken ? `?host=${encodeURIComponent(hostToken)}` : ''}`;
