// Core data model. See docs/SPEC.md §4.
// Authored content (Game) is kept separate from runtime state (Session).

export type Id = string;

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

// Image, video, audio, shape and embed elements arrive in milestone M3.
export type SlideElement = TextEl;

export interface Slide {
  background: { color?: string; gradient?: string };
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
  /** Blank tile, not playable. */
  empty?: boolean;
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
}

// ---------- Runtime session ----------

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
  phase: 'board' | 'clue' | 'final' | 'end';
  /** Step within Final Jeopardy (wagers + per-player reveal arrive in M4). */
  finalStep?: 'category' | 'question' | 'answer';
  currentClue: ClueRef | null;
  revealed: boolean;
  scoreLog: ScoreEvent[];
  /** Event ids undone by Undo, most recent last; cleared by any new score change. */
  redoStack: Id[];
  currentPickerId?: Id;
}

// ---------- Factories ----------

export const DEFAULT_VALUES = [200, 400, 600, 800, 1000];

export function textSlide(text = ''): Slide {
  return {
    background: {},
    elements: [
      {
        kind: 'text',
        id: newId(),
        x: 120,
        y: 90,
        w: SLIDE_W - 240,
        h: SLIDE_H - 180,
        rotation: 0,
        opacity: 1,
        zIndex: 0,
        text,
        font: 'Korinna, "ITC Korinna", Georgia, "Times New Roman", serif',
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
        shadow: { color: 'rgba(0,0,0,0.85)', x: 6, y: 6, blur: 0 },
        autoFit: true,
      },
    ],
  };
}

/** The primary text of a slide (the first text element); used by the simple M1 editor. */
export function slideText(slide: Slide): string {
  return slide.elements.find((e) => e.kind === 'text')?.text ?? '';
}

export function setSlideText(slide: Slide, text: string): void {
  const el = slide.elements.find((e) => e.kind === 'text');
  if (el) el.text = text;
  else slide.elements.push(textSlide(text).elements[0]);
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
      maxPlayers: 8,
    },
    players: [],
    rounds: [newRound('Jeopardy!')],
    final: { enabled: true, category: '', questionSlide: textSlide(), answerSlide: textSlide(), timerSeconds: 30 },
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
