/**
 * Remote buzzers: the messages between the host (this app), the buzzer room (a Cloudflare Worker + Durable Object,
 * see buzzer/) and players' phones. JSON over WebSocket, one room per game, addressed by a 4-letter code.
 *
 * Who decides what:
 * - The host owns the game: seats (the players), whether buzzers are open, the clue text phones may see, who is locked
 *   out, scores. It sends its whole HostState whenever that changes; the room keeps the latest one.
 * - The room owns the race: while armed, the seat that reacted fastest to the BUZZ! light on its own phone wins (each
 *   phone measures its reaction time; the room checks it against that phone's round trip and collects buzzes for a
 *   short grace window before deciding). It moves to 'answering' on its own (so a second buzz can never also win),
 *   tells the host, and the host follows.
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
  /**
   * Goes up by one every time the buzzers are armed; a buzz names the arm it was for, so a stale one never counts.
   * To reopen the buzzers (after a wrong answer too) the host always sends a new armId: 'armed' with the armId of a
   * race the room already decided keeps that winner ('answering'), since the host just hadn't seen the buzz yet.
   */
  armId: number;
  /** While closed/armed/answering: what phones show of the clue. Question text only, never the answer. */
  clue?: { text: string; caption?: string } | null;
  /** The seat answering (phase 'answering'). */
  answering?: string | null;
  /** After a tie: the order the tied seats rolled in (answering first); they go first in the queue in this order. */
  rollOrder?: string[];
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

/** One place in the room's queue of buzzes (see the 'queue' message). */
export interface QueuedBuzz {
  seatId: string;
  afterMs: number;
  rolled?: number;
}

/** Buzzes this close (ms) are a tie: below that it's touch sampling and screen timing, not who reacted first. */
export const TIE_MS = 10;

/** The room → host. */
export type RoomToHost =
  | { t: 'welcome'; code: string; protocol: number; serverNow: number }
  /**
   * A buzz the room counted while armed. rank 1 is the winner (the room has moved to 'answering'); later ranks came
   * after. afterMs: 0 for the winner; for later ranks, how much slower than the winner they reacted (ms).
   */
  | { t: 'buzz'; armId: number; seatId: string; rank: number; afterMs: number }
  /**
   * Every buzz counted in this arm, fastest reaction first, sent again whenever it changes (late buzzes keep coming).
   * afterMs: behind the first. tie: seats tied for first (within TIE_MS): the room picked nobody, the host decides
   * (pick one, or roll and send rollOrder). rolled: a tied seat's place in the host's roll.
   */
  | { t: 'queue'; armId: number; queue: QueuedBuzz[]; tie?: string[] }
  | { t: 'phones'; phones: PhoneInfo[] }
  | { t: 'pong'; at: number; serverNow: number }
  | { t: 'error'; message: string };

/** A phone → room. */
export type PhoneMsg =
  /** Claim a seat. With a token (from an earlier 'joined') it takes the seat back even if another socket holds it. */
  | { t: 'join'; seatId: string; token?: string }
  /** Ask to join as a new player (only when allowNew). */
  | { t: 'new'; name: string }
  /** reactMs: ms from this phone showing BUZZ! for armId to the press (old phones leave it out). */
  | { t: 'buzz'; armId: number; reactMs?: number }
  | { t: 'leave' }
  | { t: 'ping'; at: number }
  /** Sent straight back on every pong, echoing its serverNow, so the room can time the round trip itself. */
  | { t: 'sync'; serverNow: number };

/** The room → a phone. */
export type RoomToPhone =
  /** On connect and whenever seats change: the seats and which are free. */
  | { t: 'seats'; title: string; seats: (Seat & { taken: boolean })[]; allowNew: boolean; hostHere: boolean }
  /** This phone holds seatId; keep token (localStorage, per room code) to come back after a refresh. */
  | { t: 'joined'; seatId: string; token: string }
  | { t: 'waiting' }
  | { t: 'denied'; reason: 'taken' | 'unknown-seat' | 'rejected' | 'full' | 'no-new' | 'bad-token' }
  | { t: 'view'; view: PhoneView }
  /**
   * This phone's own buzz, sent again whenever its place in the queue changes. 'pending' = counted, the room is still
   * collecting buzzes (a quarter second); 'first' = you're answering (byMs: how much faster than the next one, once
   * there is one); 'late' = in the queue at rank, afterMs behind the first (no rank: it didn't count); 'tie' = tied for
   * first, the host is deciding; 'early' = before the buzzers opened (locked until lockedUntil); 'locked' = can't buzz.
   */
  | {
      t: 'result';
      armId: number;
      outcome: 'pending' | 'first' | 'late' | 'tie' | 'early' | 'locked';
      rank?: number;
      afterMs?: number;
      byMs?: number;
      /** The name of the player first in the queue (who afterMs is behind). */
      behind?: string;
      /** In a tie the host rolled for: this phone's place in the roll (1 = rolled highest). */
      rolled?: number;
      lockedUntil?: number;
    }
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
