// Core data model. See docs/SPEC.md §4.
// Authored content (Game) is kept separate from runtime state (Session).

import { isWebUrl } from './links';
import { nextFreeColor } from './colors';
import { dedupeMediaNames } from './medianame';
import { presetTheme, type Theme } from './theme';

export type Id = string;

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- Media ----------

export type MediaKind = 'image' | 'video' | 'audio' | 'font';

/**
 * A file used by the game. Normally stored with it (the blob lives in the media store / .brainrot pack, keyed
 * by id). A link the game couldn't save a copy of plays straight from the internet instead (`url`).
 */
export interface MediaRef {
  id: Id;
  name: string;
  mime: string;
  /** Bytes (0 for a link: it isn't stored). */
  size: number;
  kind: MediaKind;
  /** Plays live from this http(s) link during the show (needs internet); no file is stored. */
  url?: string;
  /** The link it was added from, as pasted (for credit, and to save a copy later). */
  source?: string;
  /** When that link stops working (ms since 1970), if the site says (Discord). */
  expiresAt?: number;
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
  /** What the host calls it ("Old Man", "Locked door"): shown in the Layers list and on its action card. */
  name?: string;
  /** RPG screens: what the object is (doorway, item, NPC…) and what it can do. Absent = scenery. */
  role?: ObjectRole;
  /** Hidden from the audience until the host reveals it (the host sees it faded). */
  secret?: boolean;
  /** Never shown on stream. */
  hostNotes?: string;
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

export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow' | 'path';

export interface ShapeEl extends ElementBase {
  kind: 'shape';
  shape: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  /** 'path': the drawn line, as points inside the box (0–1 of its width and height). */
  points?: [number, number][];
  /** 'path': join the last point back to the first (a filled shape). */
  closed?: boolean;
  /** A hotspot: never drawn for the audience (the host sees its outline). Turns part of a picture into a doorway, shop… */
  hotspot?: boolean;
}

/**
 * 'youtube', 'drive' (Google Drive's own player) and 'streamable' play in the site's player; the
 * remote* kinds are older games' direct links (new links become ordinary image/video/audio items).
 */
export type EmbedKind = 'youtube' | 'drive' | 'streamable' | 'remoteVideo' | 'remoteAudio' | 'remoteImage';

/** Online media played in its site's own player: needs internet during the game. */
export interface EmbedEl extends ElementBase, Playback {
  kind: 'embed';
  /** The link as pasted; the player's address is worked out from it when the slide shows. */
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
  /** Picture for RPG avatars and player sheets (otherwise a colored token with initials). */
  avatar?: Id;
  /** Starting stat values that differ from the fields' defaults ("all mammals start with 4 gold"). */
  stats?: Record<Id, StatValue>;
}

export interface GameSettings {
  allowNegativeScores: boolean;
  /** Show the one-click ✔ +value / ✘ −value buttons on each player in the host panel. */
  deductOnWrong: boolean;
  defaultTimerSeconds: number | null;
  finalTimerSeconds: number;
  currencySymbol: string;
  rollOffDie: number;
  /** After a single-player award, that player becomes the current picker (TV-style). */
  pickerFollowsAward: boolean;
  maxPlayers: number;
  /** Start a clue's countdown automatically when it opens (if it has a timer). */
  timerAutoStart: boolean;
    roundIntro: { titleCard: boolean; tileFill: boolean; categoryReveal: 'click' | 'auto' | 'off' };
  /** What viewers see around the game (set on the pre-game screen): the cards' words and the captions. */
  stream?: { soonText?: string; coverText?: string; clueCaption?: boolean; placeCaption?: boolean };
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
  /** Buttons shown when it lands (move, give an item, change a stat…), run only when the host presses them. */
  actions?: Action[];
}

export interface WheelSegment extends Outcome {
  id: Id;
  color: string;
  /** Relative size and landing chance. */
  weight: number;
}

/** The built-in wheel of the current players (not saved in `game.wheels`); a wheel tile can use it by this id. */
export const PLAYER_WHEEL = 'players';

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
  /** Also used by the host (log, notes) when the header shows an image. */
  title: string;
  clues: Clue[];
  /** Image shown in the category header instead of (or under) the name. */
  image?: Id;
  imageFit?: 'contain' | 'cover';
  /** Show the name on top of the image. */
  showTitleOverImage?: boolean;
}

/** How a round plays. Each game is a list of rounds, and each round picks its mode. */
export type RoundMode = 'board' | 'final' | 'rpg' | 'boardgame';

/** A Jeopardy board: categories of clues with values. */
export interface BoardRound {
  id: Id;
  name: string;
  mode: 'board';
  categories: Category[];
  /** Default value for each row (length = rows per category). */
  values: number[];
  dailyDoubleCount?: number;
  /** Free-placed images on this round's board screen (1920×1080 stage coordinates). */
  decor?: BoardDecor[];
}

/**
 * An image placed on the board screen (logo, meme, sticker…). Reuses the slide image element so the
 * slide editor's drag/resize/rotate/opacity tools work on it.
 */
export interface BoardDecor extends ImageEl {
  /** Clicks go through to the tiles underneath (host window). */
  clickThrough?: boolean;
  /** Draw behind the tiles instead of on top of them. */
  behind?: boolean;
}

/** Final Jeopardy: one category, private wagers, one question, one-by-one reveal. Can go anywhere in the game. */
export interface FinalRound {
  id: Id;
  /** Shown on screen and in the host UI, e.g. "Final Jeopardy!" or "Final Brainrot". */
  name: string;
  mode: 'final';
  category: string;
  questionSlide: Slide;
  answerSlide: Slide;
  timerSeconds: number;
  /** Players with a score of 0 or less can play it too (they can only wager 0 unless the host ignores the limits). */
  allowNonPositive?: boolean;
  hostNotes?: string;
}

export type Round = BoardRound | FinalRound | RpgRound | BoardGameRound;

export const isBoard = (r: Round | undefined | null): r is BoardRound => r?.mode === 'board';
export const isFinal = (r: Round | undefined | null): r is FinalRound => r?.mode === 'final';
export const isRpg = (r: Round | undefined | null): r is RpgRound => r?.mode === 'rpg';
export const isBoardGame = (r: Round | undefined | null): r is BoardGameRound => r?.mode === 'boardgame';

/** Game format version (bumped when saved games need converting; see migrateGame). */
export const GAME_VERSION = 2;

export interface Game {
  id: Id;
  version: 1 | 2;
  title: string;
  settings: GameSettings;
  players: PlayerTemplate[];
  /** Played in order. Each round has a mode (Jeopardy board, Final Jeopardy…). */
  rounds: Round[];
  media: MediaRef[];
  audio: GameAudio;
  wheels: WheelPreset[];
  dice: DicePreset[];
  theme: Theme;
  /** Host-defined player stats (HP, Gold, Vibes…), used by RPG rounds and shown on the stats strip. */
  statFields?: StatField[];
  /** The item catalog (RPG pick-ups, shops, inventories). */
  items?: ItemDef[];
  shops?: Shop[];
  /** RPG worlds (maps of screens). Rounds in RPG mode play one of them. */
  worlds?: World[];
  /** Optional clue used to break a tie at the end. */
  tiebreaker?: { questionSlide: Slide; answerSlide: Slide; hostNotes?: string };
}

// ---------- Runtime session ----------

export type FinalStep = 'category' | 'wagers' | 'question' | 'answer' | 'reveal';

export interface FinalState {
  /** The Final round this is for (absent in games saved before Final became a round). */
  roundId?: Id;
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
  avatar?: Id;
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
  /** Shared by every event of one award/effect (e.g. "Award (3)"), so Undo/Redo treat it as one step. */
  batchId?: Id;
  /** A Final re-judge: the earlier judgment's event it took the place of (undoing this brings that one back). */
  replaces?: Id;
  /** A Final judgment: marked right or wrong (older saves go by the sign of `delta`; a 0 wager changes nothing). */
  right?: boolean;
  /** The round it was given in (the 📜 Log's history groups by round). */
  round?: number;
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
  /** Players taken out mid-game, kept (with their log entries) so the host can restore them (`inFinal`: into the final round too). */
  removedPlayers?: (Player & { inFinal?: boolean })[];
  /** Clue ids that have been played. */
  used: Record<Id, true>;
  /** The clue most recently closed (and marked used), for "Reopen last tile". */
  lastClosed?: Id | null;
  currentRound: number;
  /** Rounds whose intro has already played, so revisiting a round never replays it. */
  introducedRounds?: number[];
  phase: 'board' | 'clue' | 'final' | 'rpg' | 'boardgame' | 'tiebreaker' | 'end';
  /** Round intro sequence in progress (spec §6.3 step 0). */
  intro?: { stage: 'title' | 'fill' | 'categories'; revealed: number } | null;
  /** Daily Double in progress for the open clue. */
  /** `shown`: the host put the wager on screen (viewers don't see it until then, like Final wagers). */
  dd?: { stage: 'splash' | 'question'; playerId?: Id; wager?: number; shown?: boolean } | null;
  finalStep?: FinalStep;
  /** The Final round being played (or last played). */
  final?: FinalState;
  /** Other Final rounds' state, by round id, kept while the game is elsewhere. */
  finals?: Record<Id, { state: FinalState; step: FinalStep }>;
  /** Tiebreaker clue showing the answer. */
  tiebreakerRevealed?: boolean;
  /** The host declared the tied leaders co-winners. */
  coWinners?: boolean;
  /** Won the tiebreaker roll-off for first place: ranked above the players tied with them. */
  rollOffWinner?: Id;
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
  /** Player stats (host-defined fields), by player then field. */
  stats?: Record<Id, Record<Id, StatValue>>;
  /** What each player carries. */
  inventories?: Record<Id, InventoryEntry[]>;
  /** RPG state per world (shared by every round that uses the world). */
  worlds?: Record<Id, WorldState>;
  /** Board game state per board-game round (by round id). */
  boardgames?: Record<Id, BoardGameState>;
  /** Shop stock left, by shop (or stock pool) then item; null = unlimited. */
  stock?: Record<Id, Record<Id, number | null>>;
  /** Everything the host did besides scoring (moves, stats, items, reveals…), newest last, for undo. */
  actionLog?: ActionEvent[];
  actionRedo?: ActionEvent[];
}

// ---------- Toolset: stats, items, shops, actions (games-maker spec §5.1, §7.7–7.10) ----------

export type StatValue = number | string | boolean | string[];

export interface StatField {
  id: Id;
  name: string;
  type: 'number' | 'text' | 'checkbox' | 'tags';
  /** Starting value for every player (a player can override it in Setup). */
  start?: StatValue;
  min?: number;
  max?: number;
  /** Numbers: how the audience sees it. */
  display?: 'counter' | 'bar' | 'hearts';
  /** A currency: shops charge it and currency objects add to it. */
  currency?: boolean;
  /** Shown before the number, e.g. "🪙" or "$". */
  symbol?: string;
  /** Where the audience sees it: the stats strip, only the full player sheet, or never (host only). */
  audience: 'hud' | 'sheet' | 'hidden';
  color?: string;
}

export interface ItemDef {
  id: Id;
  name: string;
  icon?: Id;
  description?: string;
  price?: number;
  /** Several of it make one entry with a count (coins, potions), otherwise each one is its own entry. */
  stackable: boolean;
  /** Worn items show on the player's avatar. */
  wearable?: Wearable;
  /** Only the host sees it in inventories. */
  secret?: boolean;
  hostNotes?: string;
  /** What "Use" does (always confirmed by the host). */
  onUse?: Action[];
}

/**
 * How a worn item shows on the avatar: its picture (else the item's icon) and where, in avatar sizes from the
 * avatar's center (x: right, y: down, w: width), so it fits any avatar size. Missing values use the slot's defaults.
 */
export interface Wearable {
  slot: 'head' | 'hand' | 'body' | 'badge';
  image?: Id;
  x?: number;
  y?: number;
  w?: number;
  /** Degrees. */
  rotate?: number;
  /** Drawn behind the avatar (a cape, wings). */
  behind?: boolean;
}

export interface InventoryEntry {
  id: Id;
  /** A catalog item, or null for one made up mid-show (then `name` says what it is). */
  item: Id | null;
  name?: string;
  qty: number;
  equipped?: boolean;
  notes?: string;
}

export interface Shop {
  id: Id;
  name: string;
  /** The currency stat it charges. */
  currency?: Id;
  stock: { item: Id; price?: number; qty: number | null }[];
  /** Shops with the same pool share their stock (e.g. the Village shop and the Shadow Realm shop). */
  pool?: string;
  /** Players can sell items here for this share of the price (0.5 = half). */
  buysBack?: { rate: number };
}

/** Who an action applies to when it runs: the moving party, the selected players, the picker, or the host picks. */
export type Who = 'party' | 'selected' | 'picker' | 'ask' | 'all';

/** Something the host can run (from an object, an item's "Use", a wheel slice…). Always shown to the host first. */
export type Action = { id: Id } & (
  | { do: 'move'; to: ScreenRef; who?: Who }
  /** `also`: more wheels spun together with it. */
  | { do: 'wheel'; wheel: Id; also?: Id[] }
  | { do: 'dice'; dice: string }
  | { do: 'popup'; slide: Slide }
  | { do: 'question'; question: Slide; answer: Slide; value?: number }
  | { do: 'sound'; media: Id }
  | { do: 'stat'; field: Id; op: 'add' | 'set'; amount: number; who?: Who }
  | { do: 'item'; item: Id; qty: number; op: 'give' | 'take'; who?: Who }
  | { do: 'score'; amount: number; who?: Who }
  | { do: 'reveal' | 'hide'; object?: Id; screen?: ScreenRef }
  | { do: 'timer'; seconds: number }
  | { do: 'shop'; shop: Id }
  | { do: 'note'; text: string }
  /** Board games: send players to a space or an off-board zone. */
  | { do: 'goto'; space?: Id; zone?: Id; who?: Who }
  /** Board games: move players forward (or back, negative) this many spaces from where they are. */
  | { do: 'steps'; steps: number; who?: Who }
  /** Board games: players miss their next turn(s). */
  | { do: 'skip'; turns?: number; who?: Who }
  /** Board games: the player goes again (Next turn comes back to them). */
  | { do: 'again'; who?: Who }
);
export type ActionKind = Action['do'];

/**
 * One undoable step in the action log: the parts of the state it changed (session parts, screens of the game being
 * played) as they were before, and after once undone, as JSON.
 */
export interface ActionEvent {
  id: Id;
  ts: number;
  text: string;
  /** The round it was taken in (Ctrl+Z can reach back into an earlier round). */
  round?: number;
  before: string;
  after?: string;
  /** Points the step spent or earned (a shop that charges points): they come off the score log when it's undone. */
  score?: ScoreEvent[];
}

// ---------- RPG mode: worlds, maps, screens, objects (games-maker spec §7) ----------

export type Dir8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface ScreenRef {
  map: Id;
  screen: Id;
}

/** How one side of a screen differs from the grid (by default a side leads to the screen next to it). */
export type ExitRule = { kind: 'blocked'; note?: string } | { kind: 'warp'; to: ScreenRef };

export interface Screen {
  id: Id;
  name: string;
  col: number;
  row: number;
  slide: Slide;
  exits?: Partial<Record<Dir8, ExitRule>>;
  hostNotes?: string;
  /** Looping music while the party is here (overrides the map's). */
  music?: Id;
  /** Other looks for the same place ("the village, on fire"); the host switches between them in play. */
  variants?: ScreenVariant[];
}

export interface ScreenVariant {
  id: Id;
  name: string;
  slide: Slide;
}

export interface WorldMap {
  id: Id;
  name: string;
  cols: number;
  rows: number;
  screens: Screen[];
  /** What the audience's map shows: every screen, only discovered ones, or nothing. */
  visibility: 'full' | 'discovered' | 'hidden';
  /** Show arrows for open ways out of known screens, without saying where they lead. */
  showExits: boolean;
  /** Moving to a screen also marks its neighbors discovered. */
  revealNeighbors: boolean;
  /** Allow diagonal moves (NE, SE, SW, NW). */
  diagonals: boolean;
  /** Walking off one edge comes back on the opposite edge. */
  wrap: boolean;
  transition: 'slide' | 'fade' | 'cut';
  music?: Id;
}

export interface World {
  id: Id;
  name: string;
  /** maps[0] is the primary map; the rest (dungeons, shops, the Shadow Realm) are joined by doorways. */
  maps: WorldMap[];
}

export type ObjectClass = 'doorway' | 'item' | 'currency' | 'npc' | 'shop' | 'hazard' | 'zone' | 'interactable' | 'spawn' | 'blocker';

/** What an object on an RPG screen is. Fields apply by class (the rest are ignored). */
export interface ObjectRole {
  class: ObjectClass;
  /** doorway: where it leads. */
  to?: ScreenRef;
  /** doorway: arrive at this object on the other side (e.g. its spawn point); default: the screen's first spawn point. */
  arrive?: Id;
  /** doorway: locked (the host can still open it). */
  locked?: boolean;
  /** item: which catalog item and how many. */
  item?: Id;
  qty?: number;
  /** currency: which stat and how much. */
  field?: Id;
  amount?: number;
  /** npc / shop: the shop it opens. */
  shop?: Id;
  /** npc: its own numbers (power, HP…), editable during the game. */
  stats?: { name: string; value: number }[];
  /** npc: viewers see its stats as a badge over it. */
  statsShown?: boolean;
  /** npc / interactable: a slide shown when talked to or used. */
  dialogue?: Slide;
  /** Buttons on its action card (always confirmed by the host). */
  actions?: Action[];
}

export interface RpgRound {
  id: Id;
  name: string;
  mode: 'rpg';
  /** The world played (worlds are shared, so a later round can continue the same adventure). */
  world: Id;
  /** Where the party starts, if the world hasn't been played yet (default: the primary map's first screen). */
  start?: ScreenRef;
  hostNotes?: string;
}

/** A player's avatar on a screen. */
export interface Position extends ScreenRef {
  x: number;
  y: number;
  /** Knocked out, shown grey and tipped over. */
  down?: boolean;
  hidden?: boolean;
}

export interface Party {
  id: Id;
  name: string;
  members: Id[];
  /** The host named it: splitting and regrouping keep its name (others are numbered). */
  named?: boolean;
}

/** Changes to an object during the game (the authored slide never changes). */
export interface ObjectOverride {
  taken?: boolean;
  /** Revealed (true) or hidden (false) from the audience, overriding `secret`. */
  shown?: boolean;
  x?: number;
  y?: number;
  locked?: boolean;
  stats?: { name: string; value: number }[];
}

export interface WorldState {
  positions: Record<Id, Position>;
  parties: Party[];
  /** The party the audience follows and the pad moves. */
  active: Id;
  /** Show every party's screen side by side (split party). */
  split?: boolean;
  /** 'visited' screens were stood on; 'discovered' ones are known but not visited. */
  knowledge: Record<Id, 'discovered' | 'visited'>;
  objects: Record<Id, ObjectOverride>;
  /** Objects the host added during the game, by screen id. */
  added: Record<Id, SlideElement[]>;
  mapShown: boolean;
  /** The variant each screen is showing (by screen id; none = the screen's own slide). */
  variant?: Record<Id, Id>;
  /** Which way the last move went (for the flip-screen transition). */
  lastMove?: { dir: Dir8 | 'warp'; at: number };
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

/** A category's name for the host (log, notes, lists), even when the board shows an image instead. */
export function categoryLabel(cat: Category): string {
  return cat.title.trim() || (cat.image ? '🖼 Image category' : 'Category');
}

export function newCategory(rows: number, title = ''): Category {
  return { id: newId(), title, clues: Array.from({ length: rows }, newClue) };
}

export function newRound(name: string, cats = 6, values: number[] = DEFAULT_VALUES): BoardRound {
  return {
    id: newId(),
    name,
    mode: 'board',
    values: [...values],
    categories: Array.from({ length: cats }, (_, i) => newCategory(values.length, `Category ${i + 1}`)),
  };
}

export function newFinalRound(name = 'Final Jeopardy!'): FinalRound {
  return { id: newId(), name, mode: 'final', category: '', questionSlide: textSlide(), answerSlide: textSlide(), timerSeconds: 30, allowNonPositive: true };
}

export function newGame(): Game {
  return {
    id: newId(),
    version: GAME_VERSION,
    title: 'Untitled Game',
    settings: {
      allowNegativeScores: true,
      deductOnWrong: true,
      defaultTimerSeconds: null,
      finalTimerSeconds: 30,
      currencySymbol: '$',
      rollOffDie: 20,
      pickerFollowsAward: true,
      timerAutoStart: true,
      roundIntro: { titleCard: true, tileFill: true, categoryReveal: 'click' },
      maxPlayers: 8,
    },
    players: [],
    // The host adds rounds themselves (＋ Add round picks the mode).
    rounds: [],
    media: [],
    audio: {},
    wheels: [],
    dice: [],
    theme: presetTheme('classic'),
  };
}

export function clueValue(round: BoardRound, row: number, clue: Clue): number {
  return clue.value ?? round.values[row] ?? 0;
}

export function getClue(game: Game, ref: ClueRef): { round: BoardRound; category: Category; clue: Clue } | null {
  const r = game.rounds[ref.round];
  const round = isBoard(r) ? r : undefined;
  const category = round?.categories[ref.cat];
  const clue = category?.clues[ref.row];
  return round && category && clue ? { round, category, clue } : null;
}

/** Playable clues in a round (not marked empty). Only board rounds have clues. */
export function playableClues(round: Round): Clue[] {
  return isBoard(round) ? round.categories.flatMap((c) => c.clues.filter((cl) => !cl.empty)) : [];
}

/** Every board round of the game. */
export function boardRounds(game: Game): BoardRound[] {
  return game.rounds.filter(isBoard);
}

/** "−$200", "$1,000", "350 pts"-style formatting with the game's points symbol. */
export function formatPoints(n: number, sym: string): string {
  return (n < 0 ? '−' : '') + sym + Math.abs(n).toLocaleString();
}

/** A version-1 game (Jeopardy Builder): board rounds without a mode, and Final Jeopardy kept apart. */
interface GameV1 extends Omit<Game, 'version' | 'rounds'> {
  version: 1;
  rounds: Omit<BoardRound, 'mode'>[];
  final?: Partial<Omit<FinalRound, 'id' | 'mode'>> & { enabled?: boolean };
}

/** Version 1 → 2: rounds get a mode, and an enabled Final Jeopardy becomes the last round (a disabled one is dropped). */
function migrateV1(data: GameV1): Game {
  const { final, ...rest } = data;
  const rounds: Round[] = (data.rounds ?? []).map((r) => ({ ...r, mode: 'board' }) as BoardRound);
  if (final && final.enabled !== false) {
    rounds.push({
      ...newFinalRound(),
      name: final.name?.trim() || 'Final Jeopardy!',
      category: final.category ?? '',
      questionSlide: final.questionSlide ?? textSlide(),
      answerSlide: final.answerSlide ?? textSlide(),
      timerSeconds: final.timerSeconds || 30,
      // A stable id, so a game in progress saved with this game can find its final round again.
      id: FINAL_V1_ROUND_ID,
    });
  }
  return { ...rest, version: 2, rounds } as Game;
}

/** The id the v1 → v2 conversion gives Final Jeopardy (see migrateSession). */
export const FINAL_V1_ROUND_ID = 'final-v1';

/** Convert older saved games and fill in fields added later, so every saved game keeps loading. */
export function migrateGame(input: Game): Game {
  const data = (input as unknown as { version?: number }).version === 2 ? input : migrateV1(input as unknown as GameV1);
  const d = newGame();
  const g = { ...d, ...data } as Game;
  g.version = GAME_VERSION;
  g.rounds = (data.rounds ?? []).map((r) => (r.mode ? r : ({ ...(r as object), mode: 'board' } as BoardRound)));
  g.settings = { ...d.settings, ...(data.settings ?? {}) };
  // "0 or less can play the final round" was a game setting; each Final round has its own now.
  const old = g.settings as GameSettings & { finalAllowNonPositive?: boolean };
  for (const r of g.rounds) if (isFinal(r)) r.allowNonPositive ??= old.finalAllowNonPositive ?? false;
  delete old.finalAllowNonPositive;
  g.media ??= [];
  // Links only ever point at web pages (a hand-edited game must not smuggle in javascript: or file:).
  for (const m of g.media) {
    if (m.url !== undefined && !isWebUrl(m.url)) delete m.url;
    if (m.source !== undefined && !isWebUrl(m.source)) delete m.source;
  }
  dedupeMediaNames(g.media);
  g.audio ??= {};
  g.wheels ??= [];
  g.dice ??= [];
  g.theme = { ...d.theme, ...(data.theme ?? {}) };
  g.settings.roundIntro = { ...d.settings.roundIntro, ...(data.settings?.roundIntro ?? {}) };
  repairGame(g);
  return g;
}

// ---------- Hand-edited games ----------
// A game edited by hand can miss parts the app needs (a player's color, a board's values, a slide's elements…). The
// ones that have an obvious fill are filled in place; a game that's whole is left exactly as it is.

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** The objects in a list (anything else in it is dropped); not a list: none. */
function objects<T>(v: unknown): T[] {
  if (!Array.isArray(v)) return [];
  return (v.every(isObj) ? v : v.filter(isObj)) as T[];
}
const fixId = (o: { id: Id }) => typeof o.id === 'string' && o.id ? o.id : (o.id = newId());

function repairSlide(s: unknown): Slide {
  if (!isObj(s)) return textSlide();
  const slide = s as unknown as Slide;
  if (!isObj(slide.background)) slide.background = {};
  const els = objects<SlideElement>(slide.elements);
  if (els !== slide.elements) slide.elements = els;
  for (const el of els) {
    fixId(el);
    if (el.kind === 'text' && typeof el.text !== 'string') el.text = el.text == null ? '' : String(el.text);
  }
  return slide;
}

function repairGame(g: Game): void {
  if (typeof g.title !== 'string') g.title = g.title == null ? 'Untitled Game' : String(g.title);
  if (!isObj(g.settings.roundIntro)) g.settings.roundIntro = newGame().settings.roundIntro;
  const players = objects<PlayerTemplate>(g.players);
  if (players !== g.players) g.players = players;
  players.forEach((p, i) => {
    fixId(p);
    if (typeof p.name !== 'string') p.name = `Player ${i + 1}`;
    if (typeof p.color !== 'string' || !p.color) p.color = nextFreeColor(players.filter((o) => o !== p && typeof o.color === 'string').map((o) => o.color));
  });
  const rounds = objects<Round>(g.rounds);
  if (rounds !== g.rounds) g.rounds = rounds;
  for (const r of rounds) {
    fixId(r);
    if (isBoard(r)) {
      const cats = objects<Category>(r.categories);
      if (cats !== r.categories) r.categories = cats;
      for (const c of cats) {
        fixId(c);
        if (typeof c.title !== 'string') c.title = c.title == null ? '' : String(c.title);
        const clues = objects<Clue>(c.clues);
        if (clues !== c.clues) c.clues = clues;
        for (const cl of clues) {
          fixId(cl);
          if (cl.value !== null && typeof cl.value !== 'number') cl.value = null;
          cl.type ??= 'standard';
          cl.questionSlide = repairSlide(cl.questionSlide);
          cl.answerSlide = repairSlide(cl.answerSlide);
        }
      }
      // No row values: the usual 200, 400… for as many rows as the board has.
      if (!Array.isArray(r.values) || r.values.some((v) => typeof v !== 'number')) {
        const rows = Math.max(0, ...cats.map((c) => c.clues.length));
        r.values = Array.from({ length: rows || DEFAULT_VALUES.length }, (_, i) => (typeof r.values?.[i] === 'number' ? r.values[i] : (i + 1) * 200));
      }
    } else if (isFinal(r)) {
      r.questionSlide = repairSlide(r.questionSlide);
      r.answerSlide = repairSlide(r.answerSlide);
      if (typeof r.category !== 'string') r.category = r.category == null ? '' : String(r.category);
      if (typeof r.timerSeconds !== 'number') r.timerSeconds = 30;
    } else if (isBoardGame(r)) {
      r.slide = repairSlide(r.slide);
      if (!Array.isArray(r.spaces)) r.spaces = [];
      if (!Array.isArray(r.zones)) r.zones = [];
    }
  }
  if (g.tiebreaker !== undefined) {
    if (!isObj(g.tiebreaker)) delete g.tiebreaker;
    else {
      g.tiebreaker.questionSlide = repairSlide(g.tiebreaker.questionSlide);
      g.tiebreaker.answerSlide = repairSlide(g.tiebreaker.answerSlide);
    }
  }
  const media = objects<MediaRef>(g.media).filter((m) => typeof m.id === 'string' && m.id);
  if (media.length !== g.media.length) g.media = media;
  for (const m of media) if (typeof m.name !== 'string') m.name = m.id;
  for (const k of ['wheels', 'dice'] as const) {
    const list = objects<WheelPreset & DicePreset>(g[k]);
    if (list !== g[k]) g[k] = list;
    for (const w of list) fixId(w);
  }
  for (const w of g.wheels) if (!Array.isArray(w.segments)) w.segments = [];
  for (const d of g.dice) if (!Array.isArray(d.dice)) d.dice = [];
}

const KNOWN_MODES = new Set<string>(['board', 'final', 'rpg', 'boardgame']);

/**
 * What a game the app can't use is missing, as the first place it's wrong ("rounds[2].world: no such world"), or null
 * when it looks whole. For an opened file that the repairs above couldn't fix.
 */
export function gameProblem(g: Game): string | null {
  for (const [i, r] of g.rounds.entries()) {
    const at = `rounds[${i}]`;
    if (!KNOWN_MODES.has(r.mode)) return `${at}.mode: "${r.mode}" isn't a kind of round`;
    if (isRpg(r) && !g.worlds?.some((w) => w.id === r.world)) return `${at}.world: no world "${r.world}" in worlds`;
  }
  return null;
}

/** Display name of a round (never empty). */
export function roundName(round: Round, index?: number): string {
  return round.name?.trim() || (isFinal(round) ? 'Final Jeopardy!' : index !== undefined ? `Round ${index + 1}` : 'Round');
}

/** Display name of a final round (never empty). */
export function finalName(round: FinalRound): string {
  return roundName(round);
}

// ---------- Board game mode: spaces on a board, spin or roll to move (games-maker spec §7.13) ----------

export interface BoardSpace {
  id: Id;
  name: string;
  /** Center on the 1920×1080 board. */
  x: number;
  y: number;
  color: string;
  /** An image drawn in the space (instead of its name). */
  icon?: Id;
  /** Spaces a player can step to next; more than one is a fork (the host picks). */
  next: Id[];
  /** Run (host-confirmed) when a player passes over it, e.g. Start: +2 gold. */
  onPass?: Action[];
  /** Run (host-confirmed) when a player stops on it. */
  onLand?: Action[];
  hostNotes?: string;
  /** Viewers see a plain space until the host reveals what it is. */
  secret?: boolean;
}

/** An area off the board (the Shadow Realm) where players are sent until they escape. */
export interface BoardZone {
  id: Id;
  name: string;
  slide: Slide;
  hostNotes?: string;
}

export interface BoardGameRound {
  id: Id;
  name: string;
  mode: 'boardgame';
  /** The board's backdrop and decorations; spaces are drawn over it. */
  slide: Slide;
  spaces: BoardSpace[];
  /** Where everyone starts (default: the first space). */
  start?: Id;
  /**
   * How a turn's move is decided: dice ("d6", "2d6", a saved dice preset's name), a saved wheel, or 'step': one
   * space per turn, the player choosing which way.
   */
  mover: { kind: 'dice'; dice: string } | { kind: 'wheel'; wheel: Id } | { kind: 'step' };
  zones: BoardZone[];
  /** How to win, shown to the host; public ones are shown on the board too. */
  winNotes?: string;
  winPublic?: boolean;
  hostNotes?: string;
}

export interface BoardGameState {
  /** Where each player is: a space, or an off-board zone. */
  positions: Record<Id, { space?: Id; zone?: Id }>;
  /** Turn order (player ids) and whose turn it is (index into it). */
  order: Id[];
  turn: number;
  /** The move being shown: the spaces stepped through, animated from `at`. */
  hop?: { playerId: Id; path: Id[]; at: number };
  /** The space each player came from, so a move doesn't turn back along a two-way link. */
  prev?: Record<Id, Id>;
  /** A move stopped at a fork: the host picks the way, then it goes on (the same way: negative steps go back). */
  fork?: { playerId: Id; at: Id; stepsLeft: number };
  /** Spaces passed and landed on in the last move, for their action buttons. */
  last?: { playerId: Id; passed: Id[]; landed?: Id };
  /** The zone on screen instead of the board (null: the board). */
  zoneShown?: Id | null;
  /** Secret spaces the host revealed. */
  revealed?: Id[];
  /** Turns each player still has to miss (⏭ Skip next turn). */
  skips?: Record<Id, number>;
  /** The player Next turn goes to instead of the next one (🔁 Roll again). */
  again?: Id;
}

