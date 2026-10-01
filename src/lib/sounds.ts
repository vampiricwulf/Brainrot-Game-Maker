// The game's sound cues: which ones there are, the built-in sounds (made here, like the test chime, so no sound file
// ships with the app), and when a spinning wheel ticks. Playing them is in src/play/cues.ts.
import { wavFile } from './audio';
import type { Game, GameAudio } from './model';
import { segmentAngles } from './tools';

export type CueKey = keyof GameAudio;

/** Every cue, in the order 🔊 Sounds lists them: [key, name, when it plays]. */
export const CUES: [CueKey, string, string][] = [
  ['roundIntro', 'Round intro', 'With the round title card'],
  ['tileOpen', 'Tile opens', 'When a clue opens'],
  ['dailyDouble', 'Daily Double', 'With the Daily Double splash'],
  ['buzz', 'Buzz in', 'Buzzer mode: the first player in'],
  ['right', 'Right', 'Points given'],
  ['wrong', 'Wrong', 'Points taken'],
  ['reveal', 'Reveal', 'When an answer shows'],
  ['timesUp', "Time's up", 'When a countdown runs out'],
  ['dice', 'Dice roll', 'Dice and roll-offs'],
  ['wheelTick', 'Wheel tick', 'Each slice passing the pointer'],
  ['wheelLand', 'Wheel lands', 'When a wheel stops'],
  ['move', 'Board move', 'A board-game token moving'],
  ['finalThink', 'Final round think music', 'While the final question is up'],
  ['winner', 'Winner', 'On the winner screen'],
];

/** "time's up", for the history ("Changed the time's up sound"). */
export const cueName = (k: string): string | undefined => {
  const c = CUES.find(([key]) => key === k);
  return c && (c[0] === 'finalThink' ? 'think music' : c[0] === 'dailyDouble' ? c[1] : c[1].toLowerCase());
};

/** The id a built-in sound plays under (in place of an audio file's). */
export const BUILTIN = 'builtin:';

/**
 * What the cue plays in this game: an audio file's id, a built-in sound (`builtin:right`), or nothing (switched off,
 * or the think music, which has no built-in one).
 */
export function cueMedia(game: Pick<Game, 'audio'>, key: CueKey): string | undefined {
  const v = game.audio?.[key];
  if (v === undefined) return hasBuiltin(key) ? BUILTIN + key : undefined;
  return v || undefined;
}

export const hasBuiltin = (key: CueKey): boolean => key in VOICES;

// ---------- Built-in sounds ----------

type Wave = 'sine' | 'bell' | 'buzz' | 'noise';
/** One note: from `at` for `len` seconds, gliding from `freq` to `to`, dying away at `decay` per second. */
interface Voice {
  at: number;
  len: number;
  freq: number;
  to?: number;
  wave?: Wave;
  vol?: number;
  decay?: number;
}

const notes = (freqs: number[], step: number, len: number, more: Partial<Voice> = {}): Voice[] =>
  freqs.map((freq, i) => ({ at: i * step, len, freq, wave: 'bell', decay: 6, ...more }));
const chord = (freqs: number[], at: number, len: number, more: Partial<Voice> = {}): Voice[] =>
  freqs.map((freq) => ({ at, len, freq, wave: 'bell', ...more }));

// Note frequencies.
const G4 = 392,
  C5 = 523.25,
  E5 = 659.25,
  G5 = 784,
  C6 = 1046.5,
  E6 = 1318.5,
  G6 = 1568,
  C7 = 2093;

/** The dice's clatter: short clicks bunched up at first, slowing as they settle. */
const CLATTER = [0, 0.05, 0.11, 0.16, 0.24, 0.3, 0.39, 0.47, 0.58, 0.7, 0.84];

const VOICES: Partial<Record<CueKey, Voice[]>> = {
  roundIntro: [
    ...notes([G4, C5, E5], 0.13, 0.2, { decay: 3 }),
    ...chord([C5, E5, G5], 0.39, 0.8, { decay: 2.5, vol: 0.7 }),
  ],
  tileOpen: [
    { at: 0, len: 0.16, freq: 500, to: 1400, vol: 0.5 },
    { at: 0.12, len: 0.28, freq: 1400, wave: 'bell', decay: 10, vol: 0.6 },
  ],
  dailyDouble: [
    { at: 0, len: 0.55, freq: 300, to: 1200, vol: 0.35 },
    ...chord([C6, E6, G6], 0.5, 0.9, { decay: 3, vol: 0.55 }),
  ],
  buzz: [{ at: 0, len: 0.32, freq: 330, wave: 'buzz', vol: 0.45, decay: 1.5 }],
  right: notes([C6, E6, G6], 0.08, 0.4, { decay: 5 }),
  wrong: [
    { at: 0, len: 0.22, freq: 220, to: 190, wave: 'buzz', vol: 0.4, decay: 1 },
    { at: 0.25, len: 0.4, freq: 175, to: 140, wave: 'buzz', vol: 0.4, decay: 2 },
  ],
  reveal: notes([G5, C6, E6, G6, C7], 0.06, 0.4, { decay: 7, vol: 0.7 }),
  timesUp: [0, 0.26, 0.52].map((at) => ({ at, len: 0.2, freq: 392, wave: 'buzz' as const, vol: 0.4, decay: 2 })),
  dice: CLATTER.flatMap((at, i) => [
    { at, len: 0.035, freq: 1, wave: 'noise' as const, vol: 0.9 - i * 0.05, decay: 70 },
    { at, len: 0.04, freq: 260 + ((i * 97) % 180), vol: 0.4, decay: 60 },
  ]),
  wheelTick: [
    { at: 0, len: 0.014, freq: 1, wave: 'noise', vol: 0.6, decay: 250 },
    { at: 0, len: 0.018, freq: 1900, vol: 0.35, decay: 150 },
  ],
  wheelLand: [
    { at: 0, len: 0.7, freq: 880, wave: 'bell', decay: 4 },
    { at: 0.06, len: 0.65, freq: 1320, wave: 'bell', decay: 4, vol: 0.7 },
  ],
  move: [{ at: 0, len: 0.1, freq: 600, to: 950, vol: 0.55, decay: 12 }],
  winner: [
    ...notes([G4, G4, G4], 0.14, 0.12, { decay: 4 }),
    ...chord([C5, E5, G5], 0.42, 1.1, { decay: 1.8, vol: 0.6 }),
  ],
};

/** Samples of one built-in sound (-1…1). The noise is the same every time. */
export function cueSamples(key: CueKey, rate = 22050): Float32Array {
  const voices = VOICES[key] ?? [];
  const seconds = Math.max(0, ...voices.map((v) => v.at + v.len));
  const out = new Float32Array(Math.ceil(rate * seconds));
  let seed = 12345;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
  for (const v of voices) {
    const start = Math.round(v.at * rate);
    const n = Math.round(v.len * rate);
    const glide = (v.to ?? v.freq) - v.freq;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const dt = i / rate;
      // Fades of 5 ms in and 20 ms out (shorter for tiny clicks), so nothing clicks.
      const fade = Math.min(0.02, v.len / 3);
      const env = Math.min(1, dt / 0.003, (v.len - dt) / fade) * Math.exp(-dt * (v.decay ?? 3));
      const ph = 2 * Math.PI * (v.freq * dt + (glide * dt * dt) / (2 * v.len));
      let s: number;
      if (v.wave === 'noise') s = noise();
      else if (v.wave === 'bell') s = Math.sin(ph) + 0.3 * Math.sin(2 * ph);
      // A soft square: a buzzer, not a bleep.
      else if (v.wave === 'buzz') s = Math.tanh(4 * Math.sin(ph)) * 0.7 + 0.2 * Math.sin(3 * ph);
      else s = Math.sin(ph);
      out[start + i] += s * env * (v.vol ?? 1) * 0.35;
    }
  }
  return out;
}

/** A built-in sound as a WAV file. */
export const cueWav = (key: CueKey, rate = 22050): Uint8Array<ArrayBuffer> => wavFile(cueSamples(key, rate), rate);

// ---------- Wheel ticks ----------

/** Ticks closer together than this (the start of a fast spin) are left out: they'd only blur into a buzz. */
const TICK_GAP = 45;

/**
 * When a spin's slices pass the pointer (ms after it starts), so every window ticks with the same picture: the
 * wheel turns by `from` + (`to` − `from`) × easeOut(t / duration).
 */
export function tickTimes(segments: { weight: number }[], spin: { from: number; to: number; duration: number }): number[] {
  const span = spin.to - spin.from;
  if (span <= 0 || !segments.length) return [];
  // A boundary at wheel angle b is under the pointer when the rotation is 360 − b (mod 360).
  const marks = segmentAngles(segments).map((s) => (360 - s.start) % 360);
  const out: number[] = [];
  for (const m of marks) {
    let r = spin.from + ((((m - spin.from) % 360) + 360) % 360);
    if (r === spin.from) r += 360;
    for (; r <= spin.to; r += 360) {
      const p = (r - spin.from) / span;
      // easeOut(u) = p, solved for u.
      out.push((1 - Math.pow(1 - p, 1 / 4)) * spin.duration);
    }
  }
  out.sort((a, b) => a - b);
  const kept: number[] = [];
  for (const t of out) if (!kept.length || t - kept[kept.length - 1] >= TICK_GAP) kept.push(t);
  return kept;
}
