// Transient on-screen state shared between the host and the audience window (not saved with the game).
import { newId, type DicePreset, type Id, type Slide, type WheelSegment } from './model';
import type { DiceRoll, PoolSlice, RollOffRound } from './tools';

/** What a host click on the stage asks for (the host's view decides what it means right now). */
export type StageAction = 'intro' | 'reveal' | 'back' | 'final-next' | 'overlay';

/** A short "+400 Alex" badge that floats up on the audience view after a score change. */
export interface Pop {
  id: string;
  text: string;
  color: string;
}

/** Countdown clock. Time is computed from timestamps so both windows agree without ticking messages. */
export interface TimerState {
  /** Seconds. */
  total: number;
  /** Date.now() when last started/resumed; null while paused. */
  startedAt: number | null;
  /** Seconds already elapsed before the current run. */
  elapsed: number;
  expired: boolean;
}

/** A game sound to play on the audience side (DD sting, time's up, think music…). */
export interface SoundCue {
  media: string;
  nonce: string;
}

/**
 * Full-screen tool overlay (spec §5.6/§6.6). Results are decided when the host acts; both windows animate
 * the same timestamps, so the audience sees exactly what the host sees.
 */
export type Overlay =
  | {
      kind: 'wheel';
      nonce: string;
      name: string;
      wheelId?: Id;
      /** The built-in "Pick a player" wheel: one slice per player (slice id = player id). */
      players?: boolean;
      /** Set once the host edits this run of the wheel: every slice, including ones switched off. */
      pool?: PoolSlice[];
      /** The host's edit box is open (host only). */
      editing?: boolean;
      segments: WheelSegment[];
      /** Resting rotation (degrees) before/after the current spin. */
      rotation: number;
      spin: { from: number; to: number; startedAt: number; duration: number } | null;
      /** Index into segments of the landed slice. */
      result: number | null;
      tagged?: Id[];
    }
  | {
      kind: 'dice';
      nonce: string;
      name: string;
      preset: DicePreset;
      /** null until the host rolls. */
      roll: DiceRoll | null;
      startedAt: number;
      duration: number;
      tagged?: Id[];
    }
  | {
      kind: 'rolloff';
      nonce: string;
      sides: number;
      rounds: RollOffRound[];
      ranking: Id[];
      winner: Id;
      startedAt: number;
      roundMs: number;
    }
  | { kind: 'scoreboard'; nonce: string }
  /** A slide shown over whatever is on air (a sign, dialogue, a jump-scare); with `answer`, a question to reveal. */
  | { kind: 'popup'; nonce: string; slide: Slide; answer?: Slide; revealed?: boolean; value?: number; title?: string }
  /** One player's full sheet: avatar, stats, inventory. */
  | { kind: 'sheet'; nonce: string; playerId: Id }
  /** A shop's wares and prices. */
  | { kind: 'shop'; nonce: string; shopId: Id };

export interface Live {
  pops: Pop[];
  timer: TimerState | null;
  sound: SoundCue | null;
  overlay: Overlay | null;
  /** Panic button: the audience sees only the cover card. */
  cover?: boolean;
}

export function newLive(): Live {
  return { pops: [], timer: null, sound: null, overlay: null };
}

/** How long into a roll-off round the dice settle (+ a beat before the winner shows). */
export const ROLLOFF_ROLL_MS = 1300;
export const ROLLOFF_REVEAL_MS = ROLLOFF_ROLL_MS + 300;

/** When a tool overlay's animation finishes (ms timestamp). */
export function overlayDoneAt(o: Overlay): number {
  if (o.kind === 'wheel') return o.spin ? o.spin.startedAt + o.spin.duration : 0;
  if (o.kind === 'dice') return o.roll ? o.startedAt + o.duration : 0;
  // Matches RollOffView: the winner shows 1.6s into the last round.
  if (o.kind === 'rolloff') return o.startedAt + (o.rounds.length - 1) * o.roundMs + ROLLOFF_REVEAL_MS;
  return 0;
}

export function timerRemaining(t: TimerState, now = Date.now()): number {
  const run = t.startedAt === null ? 0 : (now - t.startedAt) / 1000;
  return Math.max(0, t.total - t.elapsed - run);
}

export function startTimer(live: Live, seconds: number): void {
  live.timer = { total: seconds, startedAt: Date.now(), elapsed: 0, expired: false };
}

export function toggleTimer(live: Live): void {
  const t = live.timer;
  if (!t || t.expired) return;
  if (t.startedAt === null) t.startedAt = Date.now();
  else {
    t.elapsed += (Date.now() - t.startedAt) / 1000;
    t.startedAt = null;
  }
}

export function playSound(live: Live, media: string | undefined): void {
  live.sound = media ? { media, nonce: newId() } : null;
}
