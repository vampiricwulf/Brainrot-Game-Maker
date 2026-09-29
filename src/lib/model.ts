// Core data model. See docs/SPEC.md §4.
// Authored content (Game) is kept separate from runtime state (Session).

import { presetTheme, type Theme } from './theme';

export type Id = string;

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- Media ----------

export type MediaKind = 'image' | 'video' | 'audio' | 'font';

/** A file stored with the game (blob lives in the media store / .jbr pack, keyed by id). */
export interface MediaRef {
  id: Id;
  name: string;
  mime: string;
  size: number;
  kind: MediaKind;
}

// ---------- Slides ----------

/** Logical slide size; slides are scaled to fit whatever window shows them. */
export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

export interface ElementBase {
  id: Id;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked?: boolean;
  /** Plays when the slide appears. */
  entrance?: Entrance;
}

export type EntranceType = 'fade' | 'pop' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'typewriter' | 'shake' | 'spin';

export interface Entrance {
  type: EntranceType;
  /** Seconds after the slide appears. */
  delay: number;
  /** Seconds. */
  duration: number;
}

export interface TextEl extends ElementBase {
  kind: 'text';
  text: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  stroke?: { color: string; width: number };
  shadow?: { color: string; x: number; y: number; blur: number };
  glow?: { color: string; blur: number };
  background?: { color: string; padding: number; radius: number };
  /** Shrink the font until the text fits the box. */
  autoFit: boolean;
}

export type Fit = 'contain' | 'cover' | 'fill';

export interface ImageEl extends ElementBase {
  kind: 'image';
  media: Id;
  fit: Fit;
  /** Result of the image editor (M6); shown instead of `media` when set. */
  editedMedia?: Id;
  edits?: ImageEdits;
  radius?: number;
}

/** Playback options shared by video, audio and online embeds. */
export interface Playback {
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  /** Seconds. */
  startAt?: number;
  endAt?: number;
  /** 0..1 */
  volume: number;
}

export interface VideoEl extends ElementBase, Playback {
  kind: 'video';
  media: Id;
  fit: Fit;
}

export interface AudioEl extends ElementBase, Playback {
  kind: 'audio';
  media: Id;
  /** Show a speaker icon on the slide (otherwise the audio is invisible). */
  visible: boolean;
}

export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow';

export interface ShapeEl extends ElementBase {
  kind: 'shape';
  shape: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export type EmbedKind = 'youtube' | 'remoteVideo' | 'remoteAudio' | 'remoteImage';

/** Online media: needs internet during the game. */
export interface EmbedEl extends ElementBase, Playback {
  kind: 'embed';
  url: string;
  embedKind: EmbedKind;
}

export type SlideElement = TextEl | ImageEl | VideoEl | AudioEl | ShapeEl | EmbedEl;
export type ElementKind = SlideElement['kind'];

/** Non-destructive image edits (spec §5.4). Positions/sizes are fractions of the output image. */
export interface ImageEdits {
  /** Fractions of the rotated image. */
  crop?: { x: number; y: number; w: number; h: number };
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  /** Percent (100 = unchanged). */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Degrees. */
  hue: number;
  /** Pixels at output size. */
  blur: number;
  /** Percent. */
  grayscale: number;
  sepia: number;
  invert: number;
  /** Output size multiplier (1 = original resolution). */
  scale: number;
  texts: ImageText[];
  stickers: ImageSticker[];
  strokes: ImageStroke[];
}

export interface ImageText {
  id: Id;
  text: string;
  x: number;
  y: number;
  /** Font size as a fraction of image width. */
  size: number;
  color: string;
  stroke: string;
  /** Outline width as a fraction of the font size. */
  strokeWidth: number;
  font: string;
  rotation: number;
}

export interface ImageSticker {
  id: Id;
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export interface ImageStroke {
  color: string;
  /** Fraction of image width. */
  size: number;
  erase: boolean;
  /** Flat list x0, y0, x1, y1… as fractions. */
  points: number[];
}

export interface Slide {
  background: { color?: string; gradient?: string; image?: Id; fit?: 'cover' | 'contain' };
  elements: SlideElement[];
}

// ---------- Game ----------

export interface PlayerTemplate {
  id: Id;
  name: string;
  /** Hex color, unique among players. */
  color: string;
}

export interface GameSettings {
  allowNegativeScores: boolean;
  deductOnWrong: boolean;
  defaultTimerSeconds: number | null;
  finalTimerSeconds: number;
  displayMode: 'dual' | 'single';
  currencySymbol: string;
  rollOffDie: number;
  /** After a single-player award, that player becomes the current picker (TV-style). */
  pickerFollowsAward: boolean;
  maxPlayers: number;
  /** Start a clue's countdown automatically when it opens (if it has a timer). */
  timerAutoStart: boolean;
  /** Let players with $0 or less play the final round. */
  finalAllowNonPositive: boolean;
  roundIntro: { titleCard: boolean; tileFill: boolean; categoryReveal: 'click' | 'auto' | 'off' };
}

/** Optional sounds played on the audience side at key moments (spec §9). */
export interface GameAudio {
  roundIntro?: Id;
  dailyDouble?: Id;
  timesUp?: Id;
  finalThink?: Id;
  winner?: Id;
}

export type ClueType = 'standard' | 'dailyDouble' | 'wheel' | 'dice';

export interface Clue {
  id: Id;
  /** Overrides round.values[row]; null means inherit. */
  value: number | null;
  type: ClueType;
  questionSlide: Slide;
  answerSlide: Slide;
  hostNotes?: string;
  timerSeconds?: number | null;
  /** For wheel / dice clue types. */
  wheelId?: Id;
  diceId?: Id;
  /** Shown on the board tile instead of the value. */
  tileFace?: { text?: string; image?: Id };
  /** Blank tile, not playable. */
  empty?: boolean;
}

// ---------- Wheels & dice (spec §4, §5.6) ----------

/** Optional score effect of a wheel slice / die face. Always confirmed by the host before it applies. */
export type ScoreAction =
  | { kind: 'addPoints'; amount: number }
  | { kind: 'addRollTimes'; multiplier: number }
  | { kind: 'multiplyScore'; factor: number }
  | { kind: 'setScore'; amount: number }
  | { kind: 'steal'; amount: number | 'all' }
  | { kind: 'swapScores' };

/** What a wheel slice or die face means. Most are free-form (punishments, dares, prompts…), not points. */
export interface Outcome {
  label: string;
  /** Longer text shown big on reveal. */
  details?: string;
  /** Image/GIF/video/audio shown or played on reveal. */
  media?: Id;
  /** Countdown started on reveal (e.g. a 30-second punishment). */
  timerSeconds?: number;
  scoreAction?: ScoreAction;
}

export interface WheelSegment extends Outcome {
  id: Id;
  color: string;
  /** Relative size and landing chance. */
  weight: number;
}

export interface WheelPreset {
  id: Id;
  name: string;
  segments: WheelSegment[];
  spinDurationMs: number;
  /** Each slice can only land once per game (the host can restore them). */
  removeAfterLanding: boolean;
}

export interface Die {
  id: Id;
  sides: number;
  count: number;
  /** One per side; otherwise faces are the numbers 1..sides. */
  customFaces?: Outcome[];
}

export interface DicePreset {
  id: Id;
  name: string;
  dice: Die[];
  showTotal: boolean;
  /** Map a total range to an outcome ("2–4: take a sip"). */
  totalOutcomes?: { id: Id; min: number; max: number; outcome: Outcome }[];
}

export interface Category {
  id: Id;
  title: string;
  clues: Clue[];
}

export interface Round {
  id: Id;
  name: string;
  categories: Category[];
  /** Default value for each row (length = rows per category). */
  values: number[];
  dailyDoubleCount?: number;
}

export interface FinalRound {
  enabled: boolean;
  /** Shown on screen and in the host UI, e.g. "Final Jeopardy!" or "Final Brainrot". */
  name: string;
  category: string;
  questionSlide: Slide;
  answerSlide: Slide;
  timerSeconds: number;
}

export interface Game {
  id: Id;
  version: 1;
  title: string;
  settings: GameSettings;
  players: PlayerTemplate[];
  rounds: Round[];
  final: FinalRound;
  media: MediaRef[];
  audio: GameAudio;
  wheels: WheelPreset[];
  dice: DicePreset[];
  theme: Theme;
  /** Optional clue used to break a tie at the end. */
  tiebreaker?: { questionSlide: Slide; answerSlide: Slide; hostNotes?: string };
}

// ---------- Runtime session ----------

export interface FinalState {
  /** Players taking part (others sat out, e.g. score ≤ 0). */
  players: Id[];
  wagers: Record<Id, number>;
  /** Order for the one-by-one reveal. */
  order: Id[];
  /** Wager shown on screen for this player. */
  shown: Record<Id, boolean>;
  results: Record<Id, 'right' | 'wrong'>;
  /** Player currently spotlighted in the reveal. */
  current?: Id;
}

export interface Player {
  id: Id;
  name: string;
  color: string;
  /** Score before any logged events (normally 0; set when editing a player's starting score). */
  startScore: number;
}

export interface ScoreEvent {
  id: Id;
  ts: number;
  playerId: Id;
  delta: number;
  reason: string;
  clueId?: Id;
  undone?: boolean;
}

export interface RollEvent {
  id: Id;
  ts: number;
  source: 'wheel' | 'dice' | 'rolloff';
  name: string;
  result: string;
  /** Optional "who this was for" tag. */
  playerIds?: Id[];
}

export interface ClueRef {
  round: number;
  cat: number;
  row: number;
}

export interface Session {
  gameId: Id;
  players: Player[];
  /** Clue ids that have been played. */
  used: Record<Id, true>;
  currentRound: number;
  phase: 'board' | 'clue' | 'final' | 'tiebreaker' | 'end';
  /** Round intro sequence in progress (spec §6.3 step 0). */
  intro?: { stage: 'title' | 'fill' | 'categories'; revealed: number } | null;
  /** Daily Double in progress for the open clue. */
  dd?: { stage: 'splash' | 'question'; playerId?: Id; wager?: number } | null;
  finalStep?: 'category' | 'wagers' | 'question' | 'answer' | 'reveal';
  final?: FinalState;
  /** Tiebreaker clue showing the answer. */
  tiebreakerRevealed?: boolean;
  /** The host declared the tied leaders co-winners. */
  coWinners?: boolean;
  /** Every spin / roll (no score impact). */
  rollLog?: RollEvent[];
  /** Wheel slices already used when "remove after landing" is on: wheelId → segment ids. */
  removedSegments?: Record<Id, Id[]>;
  currentClue: ClueRef | null;
  revealed: boolean;
  scoreLog: ScoreEvent[];
  /** Event ids undone by Undo, most recent last; cleared by any new score change. */
  redoStack: Id[];
  currentPickerId?: Id;
}

// ---------- Factories ----------

export const DEFAULT_VALUES = [200, 400, 600, 800, 1000];

function base(x: number, y: number, w: number, h: number): ElementBase {
  return { id: newId(), x, y, w, h, rotation: 0, opacity: 1, zIndex: 0 };
}

export function newTextEl(text = '', box = { x: 120, y: 90, w: SLIDE_W - 240, h: SLIDE_H - 180 }): TextEl {
  return {
    ...base(box.x, box.y, box.w, box.h),
    kind: 'text',
    text,
    font: "'Libre Baskerville', Georgia, serif",
    size: 110,
    weight: 700,
    italic: false,
    underline: false,
    uppercase: true,
    color: '#ffffff',
    align: 'center',
    vAlign: 'middle',
    lineHeight: 1.2,
    letterSpacing: 0,
    shadow: { color: '#000000', x: 6, y: 6, blur: 0 },
    autoFit: true,
  };
}

const PLAYBACK: Playback = { autoplay: true, loop: false, muted: false, volume: 1 };

export function newImageEl(media: Id, w = 960, h = 540): ImageEl {
  return { ...base((SLIDE_W - w) / 2, (SLIDE_H - h) / 2, w, h), kind: 'image', media, fit: 'contain' };
}

export function newVideoEl(media: Id): VideoEl {
  return { ...base(240, 135, 1440, 810), ...PLAYBACK, kind: 'video', media, fit: 'contain' };
}

export function newAudioEl(media: Id): AudioEl {
  return { ...base(SLIDE_W - 220, SLIDE_H - 220, 140, 140), ...PLAYBACK, kind: 'audio', media, visible: false };
}

export function newShapeEl(shape: ShapeType): ShapeEl {
  const line = shape === 'line' || shape === 'arrow';
  return {
    ...base(660, line ? 510 : 290, 600, line ? 60 : 500),
    kind: 'shape',
    shape,
    fill: line ? 'transparent' : '#ffcc00',
    stroke: line ? '#ffffff' : '#000000',
    strokeWidth: line ? 12 : 0,
    radius: 0,
  };
}

export function newEmbedEl(url: string, embedKind: EmbedKind): EmbedEl {
  const box = embedKind === 'remoteAudio' ? base(SLIDE_W - 220, SLIDE_H - 220, 140, 140) : base(240, 135, 1440, 810);
  return { ...box, ...PLAYBACK, kind: 'embed', url, embedKind };
}

export function textSlide(text = ''): Slide {
  return { background: {}, elements: [newTextEl(text)] };
}

/** The primary text of a slide (its first text element). */
export function slideText(slide: Slide): string {
  return slide.elements.find((e) => e.kind === 'text')?.text ?? '';
}

export function setSlideText(slide: Slide, text: string): void {
  const el = slide.elements.find((e) => e.kind === 'text');
  if (el) el.text = text;
  else slide.elements.push(newTextEl(text));
}

export function newClue(): Clue {
  return { id: newId(), value: null, type: 'standard', questionSlide: textSlide(), answerSlide: textSlide() };
}

export function newCategory(rows: number, title = ''): Category {
  return { id: newId(), title, clues: Array.from({ length: rows }, newClue) };
}

export function newRound(name: string, cats = 6, values: number[] = DEFAULT_VALUES): Round {
  return {
    id: newId(),
    name,
    values: [...values],
    categories: Array.from({ length: cats }, (_, i) => newCategory(values.length, `Category ${i + 1}`)),
  };
}

export function newGame(): Game {
  return {
    id: newId(),
    version: 1,
    title: 'Untitled Game',
    settings: {
      allowNegativeScores: true,
      deductOnWrong: true,
      defaultTimerSeconds: null,
      finalTimerSeconds: 30,
      displayMode: 'single',
      currencySymbol: '$',
      rollOffDie: 20,
      pickerFollowsAward: true,
      timerAutoStart: true,
      finalAllowNonPositive: false,
      roundIntro: { titleCard: true, tileFill: true, categoryReveal: 'click' },
      maxPlayers: 8,
    },
    players: [],
    rounds: [newRound('Jeopardy!')],
    final: { enabled: true, name: 'Final Jeopardy!', category: '', questionSlide: textSlide(), answerSlide: textSlide(), timerSeconds: 30 },
    media: [],
    audio: {},
    wheels: [],
    dice: [],
    theme: presetTheme('classic'),
  };
}

export function clueValue(round: Round, row: number, clue: Clue): number {
  return clue.value ?? round.values[row] ?? 0;
}

export function getClue(game: Game, ref: ClueRef): { round: Round; category: Category; clue: Clue } | null {
  const round = game.rounds[ref.round];
  const category = round?.categories[ref.cat];
  const clue = category?.clues[ref.row];
  return round && category && clue ? { round, category, clue } : null;
}

/** Playable clues in a round (not marked empty). */
export function playableClues(round: Round): Clue[] {
  return round.categories.flatMap((c) => c.clues.filter((cl) => !cl.empty));
}

/** "−$200", "$1,000", "350 pts"-style formatting with the game's points symbol. */
export function formatPoints(n: number, sym: string): string {
  return (n < 0 ? '−' : '') + sym + Math.abs(n).toLocaleString();
}

/** Fill in fields added in later versions so older saved games keep loading. */
export function migrateGame(data: Game): Game {
  const d = newGame();
  const g = { ...d, ...data } as Game;
  g.settings = { ...d.settings, ...(data.settings ?? {}) };
  g.final = { ...d.final, ...(data.final ?? {}) };
  g.media ??= [];
  g.audio ??= {};
  g.wheels ??= [];
  g.dice ??= [];
  g.theme = { ...d.theme, ...(data.theme ?? {}) };
  g.settings.roundIntro = { ...d.settings.roundIntro, ...(data.settings?.roundIntro ?? {}) };
  return g;
}

/** Display name of the final round (never empty). */
export function finalName(game: Game): string {
  return game.final.name?.trim() || 'Final Jeopardy!';
}
