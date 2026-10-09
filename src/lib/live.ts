// Transient on-screen state shared between the host and the audience window (not saved with the game).
import { newId, type DicePreset, type Id, type Slide, type WheelSegment } from './model';
import type { DiceRoll, PoolSlice, RollOffRound } from './tools';
import type { BuzzState } from './buzz';
import type { CueKey } from './sounds';

/** What a host click on the stage asks for (the host's view decides what it means right now). */
export type StageAction = 'intro' | 'reveal' | 'back' | 'final-next' | 'overlay';

/** A short "+400 Alex" badge that floats up on the audience view after a score change. */
export interface Pop {
  id: string;
  text: string;
  color: string;
  /** One player's pop: on the board it sits over their plate (a group's pop sits in the middle). */
  playerId?: string;
  /** The text in two parts: who (cut short with "…" when long) and the points (always shown). */
  who?: string;
  amount?: string;
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
  /** The seconds it was started with (↺ Restart goes back to them, whatever +10/−10 did since). */
  start?: number;
}

/** A game sound to play on the audience side (DD sting, time's up, think music…). */
export interface SoundCue {
  media: string;
  nonce: string;
  /** When the host started it (Date.now()): a window that gets it much later doesn't play it. */
  at?: number;
  /** Stop the sounds still playing first (the think music when the answer goes up). Otherwise short cues overlap. */
  cut?: boolean;
  /** How loud, 0–1 (left out: full volume). */
  volume?: number;
  /** The built-in sound to play instead in a window that doesn't have `media` loaded (a cue's chosen file). */
  fallback?: string;
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
      /** A wheel that isn't saved (quick, ready-made, categories): its slices as it opened, for ↺ Reset after edits. */
      base?: WheelSegment[];
      /** The host's edit box is open (host only). */
      editing?: boolean;
      segments: WheelSegment[];
      /** Resting rotation (degrees) before/after the current spin. */
      rotation: number;
      spin: { from: number; to: number; startedAt: number; duration: number } | null;
      /** Index into segments of the landed slice. */
      result: number | null;
      tagged?: Id[];
      /** More wheels spun together with this one (e.g. a Good Wheel and a Bad Wheel at once). */
      extra?: ExtraWheel[];
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
      /** A board game's movement roll (its result fills Steps; a space's own "Roll d6" with the same dice doesn't). */
      mover?: boolean;
    }
  | {
      kind: 'rolloff';
      nonce: string;
      /**
       * 'tiebreak': tied winners roll for the win; 'buzz': players whose phone buzzes tied roll for the answering
       * order (ranking, every place settled); default: who goes first.
       */
      purpose?: 'first' | 'tiebreak' | 'buzz';
      /** 'buzz': the buzzer opening whose tie this settles. */
      armId?: number;
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
  | {
      kind: 'shop';
      nonce: string;
      shopId: Id;
      /** Who's buying (default: the player who opened it). */
      buyer?: Id;
      /** A purchase the buyer can't afford, waiting for the host's call (host panel only); `price`: one typed in. */
      short?: { item: Id; price?: number };
    };

/** A wheel spun alongside the main one: its own slices, spin and result. */
export interface ExtraWheel {
  key: string;
  name: string;
  wheelId?: Id;
  players?: boolean;
  segments: WheelSegment[];
  rotation: number;
  spin: { from: number; to: number; startedAt: number; duration: number } | null;
  result: number | null;
  /** Set once the host edits this run of the wheel (like the main wheel's). */
  pool?: PoolSlice[];
  base?: WheelSegment[];
}

export interface Live {
  pops: Pop[];
  timer: TimerState | null;
  sound: SoundCue | null;
  overlay: Overlay | null;
  /** Panic button: the audience sees only the cover card. */
  cover?: boolean;
  /** The host is still on the pre-game screen: viewers see a "Starting soon" card (the board would give it away). */
  pregame?: boolean;
  /** When the show starts (ms timestamp): the "Starting soon" card counts down to it. */
  soonAt?: number;
  /** The pre-game screen is a rematch's: the "Starting soon" card says "Rematch!". */
  rematch?: boolean;
  /** Who's playing, on the "Starting soon" card (teams: the members who joined from their phones). */
  lineup?: { name: string; color: string; members?: string[]; phone?: boolean }[];
  /** Phone buzzers: the players (or teams) with a phone connected now; their plates show 📱. */
  phones?: string[];
  /** A ✍ clue: everyone answers on their phone; `in`: the players whose answer is in (never the words). */
  answers?: { in: string[] };
  /**
   * Buzzer mode during a clue: open or not, who is answering, who already missed it. Outside buzzer mode `answering` is
   * the one player selected during a clue. Viewers see "🔔 Ann is answering".
   */
  buzz?: BuzzState;
  /**
   * Phone buzzers: the room's code and join link, on the "Starting soon" card so viewers can join. `closed`: nobody new
   * can join now (seats locked, or all taken): the stage's join badge says it's the players' code.
   */
  room?: { code: string; link: string; closed?: boolean } | null;
  /**
   * A short sound cue for something the host just did (a step, a pick-up, coins): played over whatever else is playing
   * (it doesn't stop a sound the host started), unless switched off in 🔊 Sounds.
   */
  blip?: { key: CueKey; nonce: string; at: number } | null;
}

export function newLive(): Live {
  return { pops: [], timer: null, sound: null, overlay: null };
}

/** How long into a roll-off round the dice settle (+ a beat before the winner shows). */
export const ROLLOFF_ROLL_MS = 1300;
export const ROLLOFF_REVEAL_MS = ROLLOFF_ROLL_MS + 300;

/** When a tool overlay's animation finishes (ms timestamp). */
export function overlayDoneAt(o: Overlay): number {
  if (o.kind === 'wheel') {
    const ends = [o, ...(o.extra ?? [])].map((w) => (w.spin ? w.spin.startedAt + w.spin.duration : 0));
    return Math.max(...ends);
  }
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
  // Whole seconds, 1 to an hour (a 0 or -5 typed would be an instant "TIME'S UP!" on stream).
  seconds = Number.isFinite(seconds) && seconds >= 1 ? Math.min(3600, Math.round(seconds)) : 30;
  live.timer = { total: seconds, startedAt: Date.now(), elapsed: 0, expired: false, start: seconds };
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

/**
 * Give the countdown `seconds` more (negative: take them away, down to none left) without restarting it. Time added
 * after it ran out starts it again.
 */
export function addTime(live: Live, seconds: number): void {
  const t = live.timer;
  if (!t) return;
  if (t.expired) {
    if (seconds <= 0) return;
    Object.assign(t, { total: t.elapsed + seconds, startedAt: Date.now(), expired: false });
    return;
  }
  t.total += Math.max(seconds, -timerRemaining(t));
}

/** Play a short sound cue (see Live.blip). */
export function blip(live: Live, key: CueKey): void {
  live.blip = { key, nonce: newId(), at: Date.now() };
}

export function playSound(live: Live, media: string | undefined, cut = false, volume = 1, fallback?: string): void {
  live.sound = media
    ? { media, nonce: newId(), at: Date.now(), ...(cut ? { cut } : {}), ...(volume < 1 ? { volume } : {}), ...(fallback && fallback !== media ? { fallback } : {}) }
    : null;
}

/** At most this many cues play at once (the oldest stops for a new one). */
export const MAX_CUES = 3;

/**
 * The cues playing in a window after `cue` arrives (`playing`: the ones still going, oldest first). A cue never cuts
 * off the one before it unless it says so (`cut`), or more than MAX_CUES would play. null (the host stopped the
 * sound) stops them all.
 */
export function cuesAfter(playing: SoundCue[], cue: SoundCue | null): SoundCue[] {
  if (!cue) return [];
  if (playing.some((c) => c.nonce === cue.nonce)) return playing;
  return [...(cue.cut ? [] : playing), cue].slice(-MAX_CUES);
}
