// Transient on-screen state shared between the host and the audience window (not saved with the game).
import { newId } from './model';

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

export interface Live {
  pops: Pop[];
  timer: TimerState | null;
  sound: SoundCue | null;
}

export function newLive(): Live {
  return { pops: [], timer: null, sound: null };
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
