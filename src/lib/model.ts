// Core data model. See docs/SPEC.md §4.
// Authored content (Game) is kept separate from runtime state (Session).

import { isWebUrl } from './links';
import { nextFreeColor } from './colors';
import { dedupeMediaNames } from './medianame';
import { presetTheme, type Theme } from './theme';
import { CHOICE_MAX, CHOICES_MAX } from './buzzproto';
import type { BuzzState } from './buzz';

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
  /** Renamed in 📁 Media: the file's own name (Find missing files finds it by that too; Replace… keeps the new name). */
  file?: string;
  /**
   * Added for 🗜: this file is a smaller copy of `of`, made for phones only (never shown on stream, never sent to viewers'
   * windows, not listed in 🖼 Media). from/to: the stretch of the original it holds (seconds; to null: to the end), for a
   * copy of the part the cards play. One at most per file.
   */
  phoneCopy?: { of: Id; from?: number; to?: number | null; width?: number; height?: number };
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
  /** The box's size before the image editor first changed its shape: Use original goes back to it. */
  uneditedSize?: { w: number; h: number };
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
  /** 'remoteImage': how the picture fills its box, and its rounded corners (as a picture's). */
  fit?: Fit;
  radius?: number;
}

export type SlideElement = TextEl | ImageEl | VideoEl | AudioEl | ShapeEl | EmbedEl;
export type ElementKind = SlideElement['kind'];

/** Non-destructive image edits (spec §5.4). Positions/sizes are fractions of the output image. */
export interface ImageEdits {
  /**
   * 2: captions, stickers and brush strokes are placed on the source picture (fractions of it, sizes as fractions of its
   * width, angles before its turn), so they stay put through a crop, a turn or a flip. Missing (edits saved before):
   * they're fractions of the finished image (see migrateEdits).
   */
  v?: 2;
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
  /**
   * What viewers see around the game (set on the pre-game screen): the cards' words and the captions. hideJoinCode:
   * the phone buzzers' join code isn't shown in a corner of the stream during the game (it is by default).
   */
  stream?: { soonText?: string; coverText?: string; clueCaption?: boolean; placeCaption?: boolean; hideJoinCode?: boolean };
  /**
   * Buzzer mode (phone buzzers): during a clue players buzz in from their phones (a buzzer room, see remote.svelte.ts);
   * the fastest answers and a wrong answer locks them out of the clue. Set on the pre-game screen.
   */
  buzzer?: boolean;
  /** Buzzer mode: the buzzers open when the clue opens ('open', the default), or when the host opens them (U) after reading it. */
  buzzArm?: 'open' | 'host';
  /** Phone buzzers: someone not in the game can ask to join from their phone (the host adds them). */
  phoneJoin?: boolean;
  /** Phone buzzers: players can't pick their own colour on their phone (left out: they can; never with teams). */
  phoneColorsOff?: boolean;
  /**
   * Phone buzzers: teams. Each player is a team; people join one from their phone with their own name, and any of them
   * buzzes for it (the team's first buzz counts; a wrong answer locks out the whole team).
   */
  buzzTeams?: boolean;
  /** Phone buzzers: seconds a phone that buzzes before the buzzers open has to wait once they do (default 1; 0: none). */
  earlyBuzzLock?: number;
  /**
   * 🤝 Partner clues: a miss lets everyone else steal it (each clue can say otherwise: PartnerRules.steal). Left out: no
   * steals.
   */
  partnerSteal?: boolean;
}

/**
 * Sounds played on the audience side at key moments (spec §9). Each one is an audio file's id, or left out for the
 * app's built-in sound (see sounds.ts; the think music has none). One switched off is in Game.soundsOff ('' here in
 * older games).
 */
export interface GameAudio {
  roundIntro?: Id;
  tileOpen?: Id;
  dailyDouble?: Id;
  /** With a 🤝 partner clue's PARTNER UP! splash (left out: the tile-open sound plays). */
  partner?: Id;
  /** Buzzer mode: the first player in. */
  buzz?: Id;
  right?: Id;
  wrong?: Id;
  reveal?: Id;
  timesUp?: Id;
  dice?: Id;
  /** Each slice passing the pointer while a wheel spins. */
  wheelTick?: Id;
  wheelLand?: Id;
  /** A board-game token moving. */
  move?: Id;
  /** RPG: the party walking to the next screen. */
  step?: Id;
  /** RPG: no way that way. */
  blocked?: Id;
  /** RPG: through a doorway (or a way that leads somewhere else). */
  doorway?: Id;
  /** RPG: a player picks something up. */
  pickUp?: Id;
  /** Buying or selling in a shop. */
  coin?: Id;
  /** A button taking a stat (HP…) down. */
  hurt?: Id;
  finalThink?: Id;
  winner?: Id;
}

/** A clue's question slide after the first: its id keeps it apart from the others in the undo history. */
export interface ExtraSlide extends Slide {
  id: Id;
}

export type ClueType = 'standard' | 'dailyDouble' | 'wheel' | 'dice' | 'partner';

// ---------- Partner clues (docs/PARTNER-CLUES-SPEC.md) ----------
// A 🤝 partner clue is played by the player who picked it and a partner (picked by a wheel): nobody buzzes. One of them
// knows and gives clues (the giver: the Describer, Drawer, Helper…), the other says the answer (the guesser). The host
// makes 🤫 cards for it: slides only the players the host hands them to see, never on stream.

/** The ready-made partner games (partner-clues spec §2.2): each sets the part words, the points and the starting cards. */
export type PartnerGame = 'describe' | 'draw' | 'act' | 'help' | 'split' | 'custom';

/** The two parts of a partner clue: the one who knows and gives clues, and the one who says the answer. */
export type PartnerRole = 'giver' | 'guesser';

/** Which Points choice made a partner clue's numbers: the game's own, no penalty, the guesser loses it all, or typed. */
export type PartnerPoints = 'game' | 'none' | 'all' | 'custom';

/** A partner clue's rules. Kept when the type changes (like wheelId), so changing back restores them. */
export interface PartnerRules {
  game: PartnerGame;
  /** Who plays the giver's part: the partner (default) or the picker. ⇄ Swap changes it while playing. */
  giver: 'partner' | 'picker';
  /** The picker is on the partner wheel too (default: switched off on it). */
  includePicker?: boolean;
  /** % of the tile's value each part gets: when it's got, and when it's missed (negative: loses that much). */
  got: Record<PartnerRole, number>;
  missed: Record<PartnerRole, number>;
  /** A miss never costs the partner, whichever part they play: their points are at least 0 (left out: on). */
  partnerSafe?: boolean;
  /** Which Points choice made the numbers (left out: worked out from them, see pointsChoice). */
  points?: PartnerPoints;
  /** Part words when not the game's ("Describer" / "Guesser"): at most PART_WORD_MAX characters each. */
  words?: Partial<Record<PartnerRole, string>>;
  /** The guesser types their guess on their phone (✍, from the question on), else says it out loud. Needs phone buzzers. */
  typeGuess?: boolean;
  /**
   * Steal on a miss (partner-clues spec §8.3): ✘ Missed lets everyone else answer, the two locked out (the buzzers open
   * for the rest, or the host picks who steals), for the tile's value. Left out: as ⚖ Game rules says
   * (GameSettings.partnerSteal); false: never on this clue.
   */
  steal?: boolean;
}

/**
 * Who a 🤫 card starts with when the host hands the cards out: a part, both, every player but the two, or nobody. On any
 * other tile (partner-clues spec §11, §12.2): 'picker' (whoever picked it; a Daily Double's player), 'others' (everyone
 * but them) or 'nobody'. On a Final (FinalRound.cards): 'playing' (everyone playing it: its wager screen's ticks) or
 * 'nobody'.
 */
export type CardGoesTo = PartnerRole | 'both' | 'others' | 'nobody' | 'picker' | 'playing';

/**
 * A 🤫 card: a slide the host made for a tile (a partner clue's, or any tile's: 🤫 Just you, 💡 Insider tip) or a Final.
 * Only the players the host sends it to see it.
 */
export interface ClueCard extends ExtraSlide {
  /** Who it starts with when the host hands the cards out ('others': every player but the two). The host can change it then. */
  to: CardGoesTo;
  /** The line above it on a phone ({giver} and {guesser}: their names); left out, one from its game ("Describe it to Ann…"). */
  hint?: string;
  /**
   * The host's name for it, to tell a tile's or a Final's cards apart (clueCardName): its tab, the host panel, 🤫 Send a
   * card…, the checklist, 🔍 Find and Undo show it. Left out: "Card 2", its place. Phones never get it, nor 📋 Copy words;
   * in one window viewers can read it in the host panel (never what's on it). Never a sent card's label, nor part of
   * cardHash (renaming one that's out keeps it on the phones). At most CARD_NAME_MAX characters, never blank.
   */
  name?: string;
}

/** Most cards a clue or a Final has (＋ Card adds no more; a hand-edited game with more keeps them, with a warning). */
export const MAX_CARDS = 6;
/** A part's share of the tile's value is from −MAX_SHARE% to MAX_SHARE%. */
export const MAX_SHARE = 1000;
/** Longest part word ("Describer"). */
export const PART_WORD_MAX = 24;

export interface PartnerGameInfo {
  label: string;
  icon: string;
  /** The parts' words ("Describer", "Guesser"). */
  giver: string;
  guesser: string;
  /** What each part does, as "Bob describes → Ann guesses" says it. */
  verb: string;
  guessVerb: string;
  /** What the giver does with a card ("the describer has nothing to describe"). */
  task: string;
  /** The game's points: when it's got, and when it's missed. */
  got: Record<PartnerRole, number>;
  missed: Record<PartnerRole, number>;
  /** The cards a clue starts with (empty: the host fills them in), by who they go to. */
  cards: CardGoesTo[];
}

/**
 * The ready-made games (partner-clues spec §2.2). In every one the partner gives and the picker guesses, and a miss never
 * costs the partner.
 */
export const PARTNER_GAMES: Record<PartnerGame, PartnerGameInfo> = {
  describe: { label: 'Describe it', icon: '🗣', giver: 'Describer', guesser: 'Guesser', verb: 'describes', guessVerb: 'guesses', task: 'describe', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, cards: ['giver'] },
  draw: { label: 'Draw it', icon: '✏', giver: 'Drawer', guesser: 'Guesser', verb: 'draws', guessVerb: 'guesses', task: 'draw', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, cards: ['giver'] },
  act: { label: 'Act it out', icon: '🎭', giver: 'Actor', guesser: 'Guesser', verb: 'acts it out', guessVerb: 'guesses', task: 'act out', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, cards: ['giver'] },
  help: { label: 'Help a friend', icon: '🙋', giver: 'Helper', guesser: 'Answerer', verb: 'helps', guessVerb: 'answers', task: 'give as a hint', got: { giver: 50, guesser: 100 }, missed: { giver: 0, guesser: -50 }, cards: ['giver'] },
  split: { label: 'Split clue', icon: '🧩', giver: 'Half A', guesser: 'Half B', verb: 'has half A', guessVerb: 'has half B', task: 'share', got: { giver: 100, guesser: 100 }, missed: { giver: 0, guesser: -50 }, cards: ['giver', 'guesser'] },
  custom: { label: 'Custom', icon: '⚙', giver: 'Giver', guesser: 'Guesser', verb: 'gives the clues', guessVerb: 'answers', task: 'give', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, cards: [] },
};

/** A game's own rules, as a fresh copy: the partner gives, its points, and the partner never loses points. */
export function gameRules(game: PartnerGame): PartnerRules {
  const g = PARTNER_GAMES[game];
  return { game, giver: 'partner', got: { ...g.got }, missed: { ...g.missed }, partnerSafe: true, points: game === 'custom' ? 'custom' : 'game' };
}

/**
 * A clue's or a Final's 🤫 cards, in order (Card 1, Card 2…, or their names): kept on a clue whose type changed away, for
 * when it changes back.
 */
export function cardSlides(clue: Pick<Clue, 'cards'>): ClueCard[] {
  return clue.cards ?? [];
}

/** The tiebreaker clue: like a board clue's slides (more question slides after the first, then the answer). */
export interface Tiebreaker {
  questionSlide: Slide;
  /** More question slides, shown in order before the answer (left out: just the one). */
  extraSlides?: ExtraSlide[];
  answerSlide: Slide;
  hostNotes?: string;
}

export interface Clue {
  id: Id;
  /** Overrides round.values[row]; null means inherit. */
  value: number | null;
  type: ClueType;
  questionSlide: Slide;
  /**
   * More question slides, shown after questionSlide in this order (a lead-in, then more information…): the host steps
   * through them before revealing the answer. Absent (older games, and most clues): the one question slide.
   */
  extraSlides?: ExtraSlide[];
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
  /**
   * Everyone answers (a standard clue, with phone buzzers): no buzzing; each player types an answer on their phone, only
   * the host sees them, and judges each.
   */
  everyone?: boolean;
  /**
   * ✍ multiple choice: 2 to CHOICES_MAX choices players pick from on their phone (kept when ✍ is off or the type
   * changes, unused then, like partner rules).
   */
  choices?: Choice[];
  /** A partner clue's rules (kept when the type changes away, like wheelId). */
  partner?: PartnerRules;
  /** A tile's 🤫 cards, in order (Card 1, Card 2…, or their names): at most MAX_CARDS. Never the answer slide itself. */
  cards?: ClueCard[];
}

/**
 * One of a ✍ clue's (or a typed Final's) multiple choices: lettered A, B, C… by place (in play, by place among those
 * with words: see choices.ts usableChoices). `right`: the one ✔ Judge all goes by (at most one); in the Final, the one
 * the reveals tell each pick against.
 */
export interface Choice {
  id: Id;
  text: string;
  right?: true;
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
  /**
   * Landing here means spin again (the slice is never used up on a "land once" wheel). Unset: a slice named "Spin
   * again" or "Respin" is one; false: it isn't, whatever it's called.
   */
  respin?: boolean;
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

// ---------- 🎭 Deals (partner-clues spec §11, §12.2) ----------

/** A part's name at most (characters): it's the top line of the card on a phone, "You're the Spy". */
export const DEAL_PART_MAX = 24;
/** Parts in one deal at most. */
export const DEAL_PARTS_MAX = 8;

/** One part in a 🎭 deal: what it's called, how many get it, and its 🤫 card. */
export interface DealPart {
  id: Id;
  /** "Spy", "Villager": the card's top line ("You're the Spy") and the reveal on stream. At most DEAL_PART_MAX. */
  name: string;
  /** How many get it: a number, or 'rest' (everyone not given another part). */
  count: number | 'rest';
  /** What its card shows (only the players who get this part see it). */
  card: Slide;
  /**
   * Its card shows a slice of the deal's wheel too: 'own' (each player with this part their own slice), 'shared' (the
   * one slice drawn for the whole deal, the same for every part that shares it: the place everyone but the spy knows).
   */
  draw?: 'own' | 'shared';
}

/**
 * 🎭 A deal saved with the game: parts with a card each, dealt at random (or as the host picks) to the players when the
 * host presses 🎭 Deal, and sent to their phones only when the host confirms it.
 */
export interface DealPreset {
  id: Id;
  name: string;
  parts: DealPart[];
  /** The saved wheel (game.wheels) its cards draw slices from. */
  wheel?: Id;
  /** Teams: dealt within each team, to the people on it (a captain for each team), instead of to the teams. */
  perTeam?: boolean;
}

// ---------- 🤫 Cards made before the show (the editor's 🤫 Cards tab) ----------

/** Longest name of a 🤫 card: one made ahead, a tile's or a Final's (characters). */
export const CARD_NAME_MAX = 60;

/**
 * 🤫 A card made before the show (the editor's 🤫 Cards tab): a slide only the players the host sends it to see, sent
 * from 🤫 Send a card… in play (by its id: changed in the editor since, it's off the phones until ↻ Send again). Its name
 * is the host's, to pick it by: phones never get it, but in one window viewers can read it in that dialog (never what's
 * on it). Never a sent card's label ("Card 3", made by the app).
 */
export interface SavedCard extends ExtraSlide {
  name: string;
  /** It starts as lasting until the host takes it back (left out: until the round ends). The host can change it then. */
  until?: 'host';
}

/** A new card: an empty words box, ready to type in. */
export function newSavedCard(name: string): SavedCard {
  return { id: newId(), name, ...textSlide('') };
}

/** Its name as the list, 🤫 Send a card… and the checklist say it ("Untitled card 2" for one left blank). */
export const savedCardName = (c: Pick<SavedCard, 'name'>, i: number): string => c.name.trim() || `Untitled card ${i + 1}`;

/** A tile's or a Final's 🤫 card as tabs, rows and lists name it: the host's name for it, or "Card 2" (its place). */
export const clueCardName = (c: Pick<ClueCard, 'name'>, i: number): string => c.name?.trim() || `Card ${i + 1}`;

/**
 * The same in a sentence: card “Clue tip”, or card 2 when it has no name (`cap`: "Card …", to start one). Never the
 * bare name: "Bob" mustn't read as a player, nor a name as a sent card's "Card 3".
 */
export function clueCardWords(c: Pick<ClueCard, 'name'>, i: number, cap = false): string {
  const n = c.name?.trim();
  return `${cap ? 'C' : 'c'}ard ${n ? `“${n}”` : i + 1}`;
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
export type RoundMode = 'board' | 'final' | 'rpg' | 'boardgame' | 'slides';

/** A Jeopardy board: categories of clues with values. */
export interface BoardRound {
  id: Id;
  name: string;
  mode: 'board';
  categories: Category[];
  /** Default value for each row (length = rows per category). */
  values: number[];
  dailyDoubleCount?: number;
  /**
   * 🤝 Partner clues wanted on this board (left out: none placed at random; any made by hand play): 🔀 Randomize, and
   * Start game for the ones missing, put them on tiles with a written question and answer, never on a Daily Double.
   */
  partnerCount?: number;
  /** The game a partner clue placed at random plays when its tile has no rules of its own (left out: Describe it). */
  partnerGame?: PartnerGame;
  /**
   * Where a partner clue placed at random gets its first 🤫 card when its tile has none of its own: a copy of the tile's
   * answer ('answer', the default: the giver gets what to describe) or an empty card to fill in ('empty').
   */
  partnerCardFrom?: 'answer' | 'empty';
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
  /** More question slides, shown in order before the answer (left out: just the one). */
  extraSlides?: ExtraSlide[];
  answerSlide: Slide;
  /**
   * Its 🤫 cards (＋ Card in its editor), in order (Card 1, Card 2…, or their names; at most MAX_CARDS): slides only the
   * players the host sends them to see, offered in the host panel from the wagers to the last reveal, lasting until the
   * Final ends. Each starts with everyone playing it ('playing') or nobody.
   */
  cards?: ClueCard[];
  timerSeconds: number;
  /**
   * Players with a score of 0 or less can play it too (a wager of 0 is filled in for them; the host can type more, as
   * wagers aren't held to their max unless the host turns the limits on).
   */
  allowNonPositive?: boolean;
  /**
   * Phone buzzers: players don't type their answer on their phone (✍); they answer out loud or on paper. Left out: they
   * type it (from the question until the answer shows).
   */
  phoneAnswersOff?: boolean;
  /** Its multiple choices, as a ✍ clue's (used while players type their answers on their phones). */
  choices?: Choice[];
  hostNotes?: string;
  /**
   * Was switched off in a Jeopardy Builder game, and kept (as a round that plays) because something was written in it:
   * the checklist says so, for the host to delete it if it shouldn't play.
   */
  wasOff?: boolean;
}

/**
 * Slides shown in order, with nothing to answer: an introduction, the rules, a break. The first slide is `questionSlide`
 * and the rest `extraSlides` (as a clue's question slides, so the same slide tools work on them).
 */
export interface SlidesRound {
  id: Id;
  name: string;
  mode: 'slides';
  questionSlide: Slide;
  extraSlides?: ExtraSlide[];
  hostNotes?: string;
}

export type Round = BoardRound | FinalRound | RpgRound | BoardGameRound | SlidesRound;

export const isBoard = (r: Round | undefined | null): r is BoardRound => r?.mode === 'board';
export const isFinal = (r: Round | undefined | null): r is FinalRound => r?.mode === 'final';
export const isRpg = (r: Round | undefined | null): r is RpgRound => r?.mode === 'rpg';
export const isSlides = (r: Round | undefined | null): r is SlidesRound => r?.mode === 'slides';
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
  /** Sounds switched off (each keeps the file chosen for it, for when it's switched back on). */
  soundsOff?: Partial<Record<keyof GameAudio, boolean>>;
  /** How loud each sound plays, 0–1 (left out: full volume). */
  soundVolume?: Partial<Record<keyof GameAudio, number>>;
  wheels: WheelPreset[];
  dice: DicePreset[];
  /** 🎭 Deals: secret parts for everyone, dealt during play (partner-clues spec §11, §12.2). */
  deals?: DealPreset[];
  /** 🤫 Cards made before the show, in the order 🤫 Send a card… lists them (the editor's 🤫 Cards tab). */
  cards?: SavedCard[];
  theme: Theme;
  /** Host-defined player stats (HP, Gold, Vibes…), used by RPG rounds and shown on the stats strip. */
  statFields?: StatField[];
  /** The item catalog (RPG pick-ups, shops, inventories). */
  items?: ItemDef[];
  shops?: Shop[];
  /** RPG worlds (maps of screens). Rounds in RPG mode play one of them. */
  worlds?: World[];
  /** Optional clue used to break a tie at the end. */
  tiebreaker?: Tiebreaker;
}

// ---------- Runtime session ----------

/**
 * The Final's steps. 'wagers' is the first: the category is on screen while the host picks who plays and takes the
 * wagers. (Sessions saved before had a 'category' step before the wagers: it reads as 'wagers', see finalStepFix.)
 */
export type FinalStep = 'wagers' | 'question' | 'answer' | 'reveal';

/** Where a Final wager came from: typed by the host, or sent from the player's phone buzzer (the host can still change it). */
/** Who gave a Final wager: the host, a phone, or the game ('auto': a 0 for a player with nothing to wager). */
export type WagerSource = 'host' | 'phone' | 'auto';

export interface FinalState {
  /** The Final round this is for (absent in games saved before Final became a round). */
  roundId?: Id;
  /** Players taking part (others sat out, e.g. score ≤ 0). */
  players: Id[];
  /**
   * The host's own ticks on the wager screen: true plays, false sits out, whatever their score. Coming back to the Final
   * keeps them (the others are checked again).
   */
  chosen?: Record<Id, boolean>;
  wagers: Record<Id, number>;
  /**
   * Where each wager came from (left out: the host typed it, as in every session saved before phones could send one).
   * A wager from a phone stays editable by the host until it's shown; the host's change makes it the host's.
   */
  wagerFrom?: Record<Id, WagerSource>;
  /** Teams: who on the team sent its wager from their phone (left out when the host typed it). */
  wagerBy?: Record<Id, string>;
  /** Order for the one-by-one reveal. */
  order: Id[];
  /** Wager shown on screen for this player. */
  shown: Record<Id, boolean>;
  results: Record<Id, 'right' | 'wrong'>;
  /** Player currently spotlighted in the reveal. */
  current?: Id;
  /**
   * The question has been on screen: phones can't send wagers any more, even after an Undo back to the wagers (kept out
   * of undo steps on purpose: the question was seen).
   */
  phonesLocked?: boolean;
  /**
   * Answers typed on phones (FinalRound.phoneAnswersOff not set, phone buzzers), by player: for the host only (viewers
   * get those shown, see forViewers). Set to {} when the question first shows with phones taking answers. Kept out of
   * undo steps (Ctrl+Z never takes an answer back).
   */
  answers?: Record<Id, FinalAnswer>;
  /** The answer was on screen: phones can't send or change answers any more (kept out of undo steps, like phonesLocked). */
  answersLocked?: true;
  /** Typed answers the host put on screen in the reveals. */
  answerShown?: Record<Id, true>;
}

/** A Final answer from a phone: its words, the room's count, on a team who sent it, and a multiple choice's pick. */
export interface FinalAnswer {
  text: string;
  n: number;
  by?: string;
  /** The choice picked (FinalRound.choices), its words in `text`. */
  pick?: Id;
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
  /** The award made its player the picker (it was `was`): undoing it gives the picker back. */
  picker?: { was?: Id; now: Id };
  /**
   * A 🤝 partner clue's ✘ Missed that let the others steal it (partnerSteal in session.ts): the steal is open while this
   * miss stands, so an Undo of it closes the steal and a Redo opens it again.
   */
  steal?: true;
}

export interface RollEvent {
  id: Id;
  ts: number;
  source: 'wheel' | 'dice' | 'rolloff';
  name: string;
  result: string;
  /** Optional "who this was for" tag. */
  playerIds?: Id[];
  /** The 🎯 Pick a player wheel's: its result is the player (tagging the spin doesn't change it). */
  picked?: boolean;
}

export interface ClueRef {
  round: number;
  cat: number;
  row: number;
}

/**
 * Who a 🤫 card goes to: a seat (a player, or a whole team: everyone on it), one person on a team (`member`), or a team
 * but some people on it (`except`: the rest of the team while one of them describes to it, partner-clues spec §10.2).
 */
export interface CardTo {
  seat: Id;
  /** Teams: only this person on the team (the buzzer room's member id, and the name they joined with). */
  member?: TeamMember;
  /** Teams: everyone on the team but these people (member ids). */
  except?: string[];
  /**
   * Sends only: the part they played when it went (Solo's one player: 'solo'). A send to more than one part goes to the
   * phones as one card per part, each with its own lines, and which of them a phone has stays as it was sent.
   */
  part?: 'giver' | 'guesser' | 'other' | 'solo';
}

/** Someone on a team, as the buzzer room knows them (its member id, not a credential) and the name they joined with. */
export interface TeamMember {
  id: string;
  name: string;
}

/**
 * One send of a 🤫 card (partner-clues spec §14.4, §18.2): who it went to, and when. Each send is one card on the wire
 * (cardId: `pc:<clue>:<card>:<at>`): a phone that took the seat (or joined the team) after the room first saw it doesn't
 * get it. `hash`: the card's content when it was sent (cardHash); a card edited since is taken off the phones until the
 * host sends it again.
 */
export interface CardSend {
  card: Id;
  to: CardTo[];
  at: number;
  hash: string;
}

/**
 * A 🤫 card the host sent with 🤫 Send a card… (the tools row) or from a tile's panel (partner-clues spec §12.2, §18.2).
 * Only the host's press makes one: its id on the wire is `sc:<id>:<at>`, so ↻ Send again (a new `at`) reaches a phone
 * that was late for it.
 */
export interface SentCard {
  id: Id;
  /** When it was sent (↻ Send again: then). */
  at: number;
  /**
   * "Card 2": made by the app, numbered in the order sent, never typed. The list of cards out shows it, and in one window
   * that list is on stream: never what's on the card.
   */
  label: string;
  /** Who it went to: players (whole teams), or one person on a team. */
  to: CardTo[];
  /**
   * A 🤫 card made in the editor on a tile or a Final (by the clue's or the Final round's id, and the card's), a card
   * from the editor's 🤫 Cards (by its id), or a card made in 🤫 Send a card… (its own slide).
   */
  content: { clue: Id; card: Id } | { saved: Id } | { slide: Slide };
  /** What was on it when it went (cardHash): a card made in the editor and changed since is off the phones until ↻ Send again. */
  hash: string;
  /**
   * How long it lasts: until the round ends (`round`: that round's id), until its tile closes (`tile`: the clue's id), or
   * until the host takes it back.
   */
  until: 'round' | 'tile' | 'host';
  round?: Id;
  tile?: Id;
  /** A 🎭 deal's card for one player (the deal's id): the deal's own row lists it, never the list of cards out. */
  deal?: Id;
  /** A deal's part ("You're the Spy"): the card's top line, under Tap to see on a phone (buzz.ts sessionCards). */
  role?: string;
}

/** One player's part in a 🎭 deal (a seat, or one person on a team). */
export interface DealHand {
  to: CardTo;
  /** The part's name: the card's top line on a phone, and the reveal. */
  part: string;
  /** The wheel's slice it drew (its label: the reveal says it too), if its part draws one. */
  slice?: string;
  /** Its card as it goes: the part's card with the slice on it. */
  slide: Slide;
  /** The phone says the part ("You're the Spy"): not when everyone dealt in got the same one. */
  role?: boolean;
}

/**
 * 🎭 The deal being played (one at a time, partner-clues spec §11): who got which part. Never sent to viewers (only
 * names and parts once the host shows Who was who), and in one window never shown: the panel only counts the parts.
 */
export interface DealState {
  id: Id;
  /** The deal's name ("Odd one out"). */
  name: string;
  /** When it was dealt. */
  at: number;
  /** Its parts' names in the deal's order: the counts follow it ("Spy ×1, Villager ×4"), never the players' order. */
  parts: string[];
  hands: DealHand[];
  /**
   * Everyone dealt in, a part or not, in the players' order (a deal with no part for "the rest" leaves some without
   * one: one window's list names them all, so it never says who got one). Left out in saves from before it was kept.
   */
  in?: CardTo[];
  /** 'dealt': shuffled, nothing sent (the host checks it, then 📤 Send); 'sent': its cards went (SentCards with `deal`). */
  stage: 'dealt' | 'sent';
  /** How long its cards last once sent. */
  until?: 'round' | 'host';
  /**
   * The buzzer room's phones on a place dealt in when its cards last went (📤 Send, ↻ Send again), away ones too: a
   * seat's (its id), or a person's on a team (`seat/member`). A place the room stops listing goes from it (freed,
   * kicked, Change player, moved off the team: dropGonePhones), as a phone there next is new. One window counts the
   * phones here on a place dealt in and not in it, a part or not (dealPhonesLate). Left out in saves from before it
   * was kept.
   */
  phonesAt?: string[];
  /** Who was who is on stream (a step: Ctrl+Z takes it off again). Only the host's press sets it. */
  shown?: boolean;
}

/**
 * A 🤝 partner clue being played (partner-clues spec §18.2). It holds who plays which part, the stage, and who the host
 * chose to give each card to: player ids and card ids only, never what's on a card (the parts are on stream anyway).
 */
export interface PartnerState {
  /** The clue it's for: a state left over from another clue is dropped. */
  clue: Id;
  /**
   * When the tile opened: the marks on the clue since then are this play's (✔ Got it and ✘ Missed score whoever of the
   * two has none yet). A tile put back and played again starts afresh. Left out (an older save): every mark on the clue.
   */
  at?: number;
  /**
   * 'pick': PARTNER UP!, the wheel, choosing (the question isn't on screen yet). 'distribute': the question is up and the
   * host hands out the cards. 'live': the clock started (or the clue has no cards). Judged is not a stage: it's both of
   * the two having a mark on the clue (partnerVerdict), so an Undo of ✔ Got it or ✘ Missed opens the list again.
   */
  stage: 'pick' | 'distribute' | 'live';
  /** Who picked the tile (as on a Daily Double: whoever was marked to pick). */
  pickerId?: Id;
  /** Who the wheel or the host chose (the picker themselves: Solo). */
  partnerId?: Id;
  /** How the partner was chosen: the wheel, the host (a chip or 1–9), or the only one there was. */
  how?: 'wheel' | 'host' | 'only';
  /** This play's copy of the clue's rule: the picker is on the partner wheel too (the host can tick it). */
  includePicker?: boolean;
  /** Who plays the giver's part this time: starts from the clue's, and ⇄ Swap changes it. */
  giver: 'partner' | 'picker';
  /**
   * Teams, when the picker's own team plays it (partnerId is the picker: Solo): the one person on it who describes to
   * the rest (partner-clues spec §10.2), from the member wheel or the host. Scored as Solo: one award to the team.
   */
  member?: TeamMember;
  /**
   * The players the host chose for a card, by card id. A card not listed follows its Goes to, worked out from the parts
   * at the moment (cardRecipients), so ⇄ Swap and a new partner move it.
   */
  deal?: Record<Id, CardTo[]>;
  /**
   * What the host sent to phones: only the host's presses add to it (📤 Send, Send and start, ↻ Send again, Send
   * changes: sendCards and the like in partner.ts); ✖ Take back removes a card's sends. Never the clue's cards by
   * themselves: opening the tile, the wheel and Show question send nothing.
   */
  sent?: CardSend[];
  /** The cards whose files the host pressed ⇡ Get it ready for (uploaded early, given to no phone): only that press adds to it. */
  ready?: Id[];
}

export interface Session {
  gameId: Id;
  players: Player[];
  /**
   * Players taken out mid-game, kept (with their log entries) so the host can restore them (`inFinal`: into the Final
   * being played too; `finalRound`: which one, so they aren't put in a later one).
   */
  removedPlayers?: (Player & { inFinal?: boolean; finalRound?: Id })[];
  /** Clue ids that have been played. */
  used: Record<Id, true>;
  /** The clue most recently closed (and marked used), for "Reopen last tile". */
  lastClosed?: Id | null;
  currentRound: number;
  /** Rounds whose intro has already played, so revisiting a round never replays it. */
  introducedRounds?: number[];
  phase: 'board' | 'clue' | 'final' | 'rpg' | 'boardgame' | 'slides' | 'tiebreaker' | 'end';
  /** Round intro sequence in progress (spec §6.3 step 0). */
  intro?: { stage: 'title' | 'fill' | 'categories'; revealed: number } | null;
  /** Daily Double in progress for the open clue. */
  /**
   * `shown`: the host put the wager on screen (viewers don't see it until then, like Final wagers). `draft`: the wager
   * in the host's box before the question shows; `draftFrom` 'phone' when the player sent it from their phone (and the
   * host hasn't typed over it), `draftBy` who on the team did.
   */
  dd?: { stage: 'splash' | 'question'; playerId?: Id; wager?: number; shown?: boolean; draft?: number; draftFrom?: WagerSource; draftBy?: string } | null;
  /** The 🤝 partner clue in progress for the open clue. Saved, so a reload picks it up (like dd). */
  partner?: PartnerState | null;
  /**
   * 🤫 Cards the host sent with 🤫 Send a card… or from a tile's panel, still out (partner-clues spec §12, §18.2). Never
   * sent to the audience or scores window (forViewers): a card made here holds the words the host typed.
   */
  cards?: SentCard[];
  /** The number in the last card's label ("Card 3") while any is out: the next is one more. Gone with the last card. */
  lastCard?: number;
  /** 🎭 The deal being played: who got which part (never sent to viewers but Who was who, once the host shows it). */
  deal?: DealState | null;
  finalStep?: FinalStep;
  /** The Final round being played (or last played). */
  final?: FinalState;
  /**
   * Other Final rounds' state, by round id, kept while the game is elsewhere. `titleOnly`: left while its title card was
   * up, so its category never went on stream (finalReached).
   */
  finals?: Record<Id, { state: FinalState; step: FinalStep; titleOnly?: boolean }>;
  /** Tiebreaker clue showing the answer. */
  tiebreakerRevealed?: boolean;
  /** The host declared the tied leaders co-winners: who they were (true, from older saves: whoever is tied). */
  coWinners?: boolean | Id[];
  /** Won the tiebreaker roll-off (or the tiebreaker clue) for first place: ranked above the players tied with them. */
  rollOffWinner?: Id;
  /** rollOffWinner won the tiebreaker clue (not a roll-off). */
  tiebreakClue?: boolean;
  /** Every spin / roll (no score impact). */
  rollLog?: RollEvent[];
  /** Wheel slices already used when "remove after landing" is on: wheelId → segment ids. */
  removedSegments?: Record<Id, Id[]>;
  currentClue: ClueRef | null;
  /** The open clue's question slide on screen (0, or left out: the first; see clueSlideIndex). */
  slide?: number;
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
  /**
   * Names this game's ✍ answer rounds in the buzzer room (answerRoundId): each new session (a 🔁 Rematch too) gets its
   * own, so a room kept from the last game never shows a phone what it sent then. Left out in sessions saved before.
   */
  answerKey?: string;
  /**
   * Phone buzzers: the buzzer room this game uses, so a reload (or a crash) gets back into the same room. Never sent to the
   * audience window. `armId`: the last time the buzzers opened there (it only goes up). `locked`: 🔒 seats locked (no
   * new phones take a seat; players already in come back). `buzz`: the buzzers during the open clue (`clue`: its
   * round.cat.row; `floor`: the last opening before it), so a reload mid-clue keeps who's answering and who missed.
   * `wagerGot`: the wagers sent from phones the host took in wager round `id` (each player's last count), so one isn't
   * taken twice; `amounts`: how much each of those was. `answers`: the answers phones sent in answer round `id` (a ✍
   * clue's, answerRoundId; only the host sees them).
   */
  remote?: {
    code: string;
    hostToken: string;
    base: string;
    armId?: number;
    locked?: boolean;
    buzz?: BuzzState & { clue: string; floor: number };
    wagerGot?: { id: string; seats: Record<Id, number>; amounts?: Record<Id, number> };
    /** A ✍ clue's answers from phones (`pick`: the choice picked, its id, on a multiple-choice clue). */
    answers?: { id: string; seats: Record<Id, { text: string; n: number; by?: string; pick?: Id }>; locked?: boolean };
    /**
     * 🤫 Card files put in room `code` for phones: a picture's (or its edited copy's), video's or sound's media id → the
     * room's id for it. So a reload doesn't upload them again (the room's 'files' list says which it still holds).
     */
    files?: { code: string; ids: Record<Id, string> };
    /** 🤫 Card sends (their ids on the wire) → the seats whose phone showed them (teams: `seat/member`). Host only. */
    cardsSeen?: Record<string, string[]>;
  } | null;
}

// ---------- Toolset: stats, items, shops, actions (games-maker spec §5.1, §7.7–7.10) ----------

export type StatValue = number | string | boolean | string[];

export interface StatField {
  id: Id;
  name: string;
  type: 'number' | 'text' | 'checkbox' | 'tags';
  /** Starting value for every player (a player can start with their own). */
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

/**
 * Who an action's 🤫 card is offered to (partner-clues spec §12.2): whoever set it off (the players its object's card is
 * for, an item's user, the player a spin was for, whoever landed on a space), the party (on a board: whoever's turn it
 * is), a player the host picks then, or everyone else. The host can change it before 📤 Send.
 */
export type CardWho = 'trigger' | 'party' | 'ask' | 'others';

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
  /**
   * 🤫 A private card (partner-clues spec §12.2): running it only offers the card in the host panel, and it goes to
   * phones when the host presses 📤 Send there. `slide`: what's on it (a copy goes). `until`: it lasts until the host
   * takes it back, else until the round ends.
   */
  | { do: 'card'; slide: Slide; to?: CardWho; until?: 'host' }
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
  /** A pile of currency partly picked up (the rest didn't fit under the player's max): what's left of it. */
  amount?: number;
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

/**
 * Set the slide's primary text. Returns the text box it made when the slide had none (its text was deleted): on top of
 * the rest, so a picture doesn't hide it.
 */
export function setSlideText(slide: Slide, text: string): TextEl | undefined {
  const el = slide.elements.find((e): e is TextEl => e.kind === 'text');
  if (el) return void (el.text = text);
  const t = newTextEl(text);
  t.zIndex = Math.max(0, ...slide.elements.map((e) => e.zIndex)) + 1;
  slide.elements.push(t);
  return t;
}

/** A clue's question slides in the order they show (the first, then its extra slides). */
export function questionSlides(clue: Pick<Clue, 'questionSlide' | 'extraSlides'>): Slide[] {
  return clue.extraSlides?.length ? [clue.questionSlide, ...clue.extraSlides] : [clue.questionSlide];
}

/** Every slide of a clue: its question slides, then the answer. */
export function slidesOfClue(clue: Pick<Clue, 'questionSlide' | 'extraSlides' | 'answerSlide'>): Slide[] {
  return [...questionSlides(clue), clue.answerSlide];
}

export function newClue(): Clue {
  return { id: newId(), value: null, type: 'standard', questionSlide: textSlide(), answerSlide: textSlide() };
}

/** A name with nothing to see in it: empty, spaces, or only invisible characters (zero-width spaces, direction marks…). */
export const blankName = (name: string): boolean => !name.replace(/[\s\p{Cf}]/gu, '');

/** A player's initials ("Ann Lee" → "AL", "Player 2" → "P2"): on their avatar token and their dot on a map. */
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
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

export function newSlidesRound(name = 'Introduction'): SlidesRound {
  return { id: newId(), name, mode: 'slides', questionSlide: textSlide() };
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
    theme: { ...presetTheme('classic'), source: { kind: 'preset', id: 'classic' } },
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

/** How many Daily Doubles a board has placed (on tiles that play). */
export function dailyDoublesPlaced(round: BoardRound): number {
  return round.categories.reduce((n, c) => n + c.clues.filter((cl) => cl.type === 'dailyDouble' && !cl.empty).length, 0);
}

/** How many 🤝 partner clues a board has placed (on tiles that play). */
export function partnerTilesPlaced(round: BoardRound): number {
  return round.categories.reduce((n, c) => n + c.clues.filter((cl) => cl.type === 'partner' && !cl.empty).length, 0);
}

/** Most 🤝 partner clues a board can ask for (a board has at most 10 × 10 tiles). */
export const PARTNER_COUNT_MAX = 100;

/** Every board round of the game. */
export function boardRounds(game: Game): BoardRound[] {
  return game.rounds.filter(isBoard);
}

/** A points symbol that's a word ("pts", "coins", "kr") goes after the number, with a space; $, €, R$, 🧠… go in front. */
export const wordSymbol = (sym: string) => /^\p{L}+\.?$/u.test(sym.trim());

/** The digits with the game's points symbol in its place, and "−" in front for less than zero. */
function withSymbol(n: number, digits: string, sym: string): string {
  return (n < 0 ? '−' : '') + (wordSymbol(sym) ? `${digits} ${sym.trim()}` : sym + digits);
}

/** "−$200", "$1,000", "350 pts"-style formatting with the game's points symbol. */
export function formatPoints(n: number, sym: string): string {
  return withSymbol(n, Math.abs(n).toLocaleString(), sym);
}

/**
 * Points shortened for a narrow spot ("$1.2M", "−3.4B pts"): cut down, never rounded up, so a score shown is never more
 * than the real one. Under `from` (10,000) it's the whole number; `digits` after the point at most ("$1K" with 0).
 */
export function compactPoints(n: number, sym: string, from = 10_000, digits = 1): string {
  if (Math.abs(n) < from) return formatPoints(n, sym);
  const opts = { notation: 'compact', maximumFractionDigits: digits, roundingMode: 'trunc' } as Intl.NumberFormatOptions;
  return withSymbol(n, Math.abs(n).toLocaleString(undefined, opts), sym);
}

/** A version-1 game (Jeopardy Builder): board rounds without a mode, and Final Jeopardy kept apart. */
interface GameV1 extends Omit<Game, 'version' | 'rounds'> {
  version: 1;
  rounds: Omit<BoardRound, 'mode'>[];
  final?: Partial<Omit<FinalRound, 'id' | 'mode'>> & { enabled?: boolean };
}

/**
 * Version 1 → 2: rounds get a mode, and an enabled Final Jeopardy becomes the last round. A disabled one is dropped
 * when there's nothing in it; one with a category, a question or an answer written is kept, so nothing written is lost.
 */
function migrateV1(data: GameV1): Game {
  const { final, ...rest } = data;
  const rounds: Round[] = objects<Omit<BoardRound, 'mode'>>(data.rounds).map((r) => ({ ...r, mode: 'board' }) as BoardRound);
  const off = !!final && final.enabled === false;
  const written = !!final && ((typeof final.category === 'string' && !!final.category.trim()) || slideWritten(final.questionSlide) || slideWritten(final.answerSlide));
  if (final && (!off || written)) {
    rounds.push({
      ...newFinalRound(),
      name: final.name?.trim() || 'Final Jeopardy!',
      category: final.category ?? '',
      questionSlide: final.questionSlide ?? textSlide(),
      answerSlide: final.answerSlide ?? textSlide(),
      timerSeconds: final.timerSeconds || 30,
      // A stable id, so a game in progress saved with this game can find its final round again.
      id: FINAL_V1_ROUND_ID,
      ...(off ? { wasOff: true } : {}),
    });
  }
  return { ...rest, version: 2, rounds } as Game;
}

/** Does this (unchecked) slide have anything on it: text, a picture, a video or a sound, or a background picture? */
function slideWritten(s: unknown): boolean {
  if (!isObj(s)) return false;
  const els = Array.isArray(s.elements) ? s.elements.filter(isObj) : [];
  return els.some((e) => (e.kind === 'text' ? typeof e.text === 'string' && !!e.text.trim() : !!e.kind)) || (isObj(s.background) && !!s.background.image);
}

/** The id the v1 → v2 conversion gives Final Jeopardy (see migrateSession). */
export const FINAL_V1_ROUND_ID = 'final-v1';

/** Convert older saved games and fill in fields added later, so every saved game keeps loading. */
export function migrateGame(input: Game): Game {
  const data = (input as unknown as { version?: number }).version === 2 ? input : migrateV1(input as unknown as GameV1);
  const d = newGame();
  const g = { ...d, ...data } as Game;
  g.version = GAME_VERSION;
  // (A round that isn't an object at all, like a null in the list, is dropped.)
  g.rounds = objects<Round>(data.rounds).map((r) => (r.mode ? r : ({ ...(r as object), mode: 'board' } as BoardRound)));
  g.settings = { ...d.settings, ...(data.settings ?? {}) };
  // "0 or less can play the final round" was a game setting; each Final round has its own now.
  const old = g.settings as GameSettings & { finalAllowNonPositive?: boolean };
  for (const r of g.rounds) if (isFinal(r)) r.allowNonPositive ??= old.finalAllowNonPositive ?? false;
  delete old.finalAllowNonPositive;
  // Buzzers are phones only now: buzzing from this computer's keys (and the audience window's buzz keys) is gone.
  const buzzOld = g.settings as GameSettings & { buzzKeys?: string; buzzFrom?: string };
  delete buzzOld.buzzKeys;
  delete buzzOld.buzzFrom;
  g.media ??= [];
  // Links only ever point at web pages (a hand-edited game must not smuggle in javascript: or file:).
  for (const m of g.media) {
    if (m.url !== undefined && !isWebUrl(m.url)) delete m.url;
    if (m.source !== undefined && !isWebUrl(m.source)) delete m.source;
  }
  dedupeMediaNames(g.media);
  g.audio ??= {};
  // A sound switched off used to be '' in its place (forgetting its file): now it's in soundsOff.
  for (const [k, v] of Object.entries(g.audio) as [keyof GameAudio, string | undefined][])
    if (v === '') {
      delete g.audio[k];
      (g.soundsOff ??= {})[k] = true;
    }
  g.wheels ??= [];
  g.dice ??= [];
  g.theme = { ...d.theme, ...(data.theme ?? {}) };
  // Where the theme came from is the game's own (an older game has none: the Theme page matches it instead).
  if (!data.theme?.source) delete g.theme.source;
  g.settings.roundIntro = { ...d.settings.roundIntro, ...(data.settings?.roundIntro ?? {}) };
  repairGame(g);
  return g;
}

/** Most players a game can have (the stats strip and the player list stay readable). */
export const MAX_PLAYERS = 20;

/**
 * "Most players" as it can be: a whole number from 1 to MAX_PLAYERS, never below the `players` already listed (up to
 * MAX_PLAYERS). Anything that isn't a number is the default 8.
 */
export function mostPlayers(n: unknown, players = 0): number {
  const want = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 8;
  return Math.min(MAX_PLAYERS, Math.max(1, players, want));
}

/** A clue countdown typed in (seconds): a whole number of at least 1, or null for none (blank, 0, not a number). */
export function countdownSeconds(text: string): number | null {
  const n = Math.round(Number(text));
  if (text.trim() === '' || !Number.isFinite(n) || n === 0) return null;
  return Math.max(1, n);
}

/**
 * A clue's own countdown typed in (seconds): null when blank (the game's default plays), 0 for none, else a whole
 * number of at least 1.
 */
export function clueCountdown(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) === 0 ? 0 : Math.max(1, Math.round(n));
}

/** Most points the host can give or set at once (either way): past it, numbers lose their last digits. */
export const MAX_POINTS = 1_000_000_000_000;

/** An amount of points typed by the host: whole, within ±MAX_POINTS; null when it isn't a number. */
export function wholePoints(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(MAX_POINTS, Math.max(-MAX_POINTS, Math.round(n)));
}

/**
 * Points typed as text by the host (as wholePoints): "1,000", "$500", "−$200", "–200" (a dash pasted from a chat) or
 * "500 pts." read too. Null when there's no number in it, or a short form ("1.5K", "10 k", "2M") that would read as far
 * less than meant.
 */
export function typedPoints(text: string): number | null {
  // (A word symbol may end in a period, "pts." or "kr.": not part of the number.)
  const t = text
    .replace(/[\s,_]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/(\p{L})\.$/u, '$1');
  if (t === '') return null;
  if (Number.isFinite(Number(t))) return wholePoints(Number(t));
  // (A letter right after K, M or B makes it a word, "5 kr" or "500 Kč", not a thousand or a million.)
  if (/\d\s*[kmb](?!\p{L})/iu.test(text.replace(/[,_]/g, ''))) return null;
  // A sign, a symbol in front ("$", "€"), the number, then a word after it ("pts") or a symbol.
  const m = /^(-?)[^\d.-]*(-?)(\d+(?:\.\d+)?)[^\d.]*$/.exec(t);
  return m ? wholePoints((m[1] || m[2] ? -1 : 1) * Number(m[3])) : null;
}

/** Most a tile (or a row of tiles) can be worth: past it, scores stop reading on screen. */
export const MAX_TILE_VALUE = 1_000_000_000;

/**
 * A clue's own value (or a row's) typed in: null when blank (the row's value) or not a number, else a whole number from
 * 0 to MAX_TILE_VALUE.
 */
export function clueValueTyped(text: string): number | null {
  const n = Number(text);
  return text.trim() === '' || !Number.isFinite(n) ? null : Math.min(MAX_TILE_VALUE, Math.max(0, Math.round(n)));
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

/** More question slides (left out: just the one). Each needs an id, and its parts what any slide needs. */
function repairExtraSlides(o: { extraSlides?: ExtraSlide[] }): void {
  if (o.extraSlides === undefined) return;
  const extra = objects<ExtraSlide>(o.extraSlides);
  if (!extra.length) return void delete o.extraSlides;
  if (extra !== o.extraSlides) o.extraSlides = extra;
  for (const sl of extra) {
    fixId(sl);
    repairSlide(sl);
  }
}

// (No 'playing' on a tile: it's a Final's.)
const CARD_TO = new Set<unknown>(['giver', 'guesser', 'both', 'others', 'nobody', 'picker'] satisfies CardGoesTo[]);
const FINAL_CARD_TO = new Set<unknown>(['playing', 'nobody'] satisfies CardGoesTo[]);
const POINTS = new Set<unknown>(['game', 'none', 'all', 'custom'] satisfies PartnerPoints[]);

/**
 * A tile's or a Final's 🤫 cards: each with its own id and what a slide needs. One that goes to someone the app doesn't
 * know there goes to nobody (a damaged file never hands a card to someone the host didn't choose). A hint that isn't
 * text goes; a name that isn't text or is blank goes, and a long one is cut to CARD_NAME_MAX. A second card with the
 * same id gets a new one (a card is sent by its id). More than MAX_CARDS are kept (validate warns).
 */
function repairCards(h: { cards?: ClueCard[] }, goes: ReadonlySet<unknown>): void {
  if (h.cards === undefined) return;
  const cards = objects<ClueCard>(h.cards);
  if (!cards.length) return void delete h.cards;
  if (cards !== h.cards) h.cards = cards;
  const seen = new Set<Id>();
  for (const card of cards) {
    fixId(card);
    if (seen.has(card.id)) card.id = newId();
    seen.add(card.id);
    repairSlide(card);
    if (!goes.has(card.to)) card.to = 'nobody';
    if (card.hint !== undefined && typeof card.hint !== 'string') delete card.hint;
    if (card.name !== undefined) {
      if (typeof card.name !== 'string' || !card.name.trim()) delete card.name;
      else if (card.name.length > CARD_NAME_MAX) card.name = card.name.slice(0, CARD_NAME_MAX);
    }
  }
}

/**
 * A ✍ clue's (or a Final's) multiple choices: not a list, none; each needs words (cut to CHOICE_MAX) and an id of its
 * own; ✔ Right only on the first marked; at most CHOICES_MAX. None left: none.
 */
function repairChoices(o: { choices?: Choice[] }): void {
  if (o.choices === undefined) return;
  const list = objects<Choice>(o.choices).filter((c) => typeof c.text === 'string');
  const seen = new Set<Id>();
  let right = false;
  for (const c of list) {
    if (typeof c.id !== 'string' || !c.id || seen.has(c.id)) c.id = newId();
    seen.add(c.id);
    if (c.text.length > CHOICE_MAX) c.text = c.text.slice(0, CHOICE_MAX);
    if (c.right !== true || right) delete c.right;
    else right = true;
  }
  if (list.length > CHOICES_MAX) list.length = CHOICES_MAX;
  if (!list.length) delete o.choices;
  else if (list.length !== o.choices.length || list.some((c, i) => c !== o.choices![i])) o.choices = list;
}

/**
 * A partner clue's rules (partner-clues spec §18.5), and its cards (repairCards). Rules that aren't an object are
 * dropped; a partner clue with none plays Describe it.
 */
function repairPartner(cl: Clue): void {
  repairCards(cl, CARD_TO);
  if (cl.partner !== undefined && !isObj(cl.partner)) delete cl.partner;
  const p = cl.partner;
  if (!p) {
    if (cl.type === 'partner') cl.partner = gameRules('describe');
    return;
  }
  if (!Object.hasOwn(PARTNER_GAMES, p.game)) p.game = 'custom';
  if (p.giver !== 'partner' && p.giver !== 'picker') p.giver = 'partner';
  // Each share a number within ±MAX_SHARE% (one missing: the game's).
  const preset = PARTNER_GAMES[p.game];
  for (const k of ['got', 'missed'] as const) {
    const share = isObj(p[k]) ? p[k] : (p[k] = { ...preset[k] });
    for (const role of ['giver', 'guesser'] as const) {
      const n = share[role];
      const fixed = typeof n === 'number' && Number.isFinite(n) ? Math.min(MAX_SHARE, Math.max(-MAX_SHARE, n)) : preset[k][role];
      if (fixed !== n) share[role] = fixed;
    }
  }
  for (const k of ['includePicker', 'partnerSafe', 'typeGuess', 'steal'] as const) if (p[k] !== undefined && typeof p[k] !== 'boolean') delete p[k];
  if (p.points !== undefined && !POINTS.has(p.points)) delete p.points;
  if (p.words !== undefined) {
    if (!isObj(p.words)) delete p.words;
    else
      for (const role of ['giver', 'guesser'] as const) {
        const w = p.words[role];
        if (w === undefined) continue;
        if (typeof w !== 'string' || !w.trim()) delete p.words[role];
        else if (w.length > PART_WORD_MAX) p.words[role] = w.slice(0, PART_WORD_MAX);
      }
  }
}

/** A board's 🤝 partner clues wanted, and the game and card they're placed with: anything the app can't use goes. */
function repairPartnerTiles(r: BoardRound): void {
  const n = r.partnerCount;
  if (n !== undefined) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) delete r.partnerCount;
    else if (n !== Math.min(PARTNER_COUNT_MAX, Math.floor(n))) r.partnerCount = Math.min(PARTNER_COUNT_MAX, Math.floor(n));
  }
  if (r.partnerGame !== undefined && !Object.hasOwn(PARTNER_GAMES, r.partnerGame)) delete r.partnerGame;
  if (r.partnerCardFrom !== undefined && r.partnerCardFrom !== 'answer' && r.partnerCardFrom !== 'empty') delete r.partnerCardFrom;
}

function repairSlide(s: unknown): Slide {
  if (!isObj(s)) return textSlide();
  const slide = s as unknown as Slide;
  if (!isObj(slide.background)) slide.background = {};
  const els = objects<SlideElement>(slide.elements);
  if (els !== slide.elements) slide.elements = els;
  for (const el of els) {
    fixId(el);
    if (el.kind === 'text' && typeof el.text !== 'string') el.text = el.text == null ? '' : String(el.text);
    repairNumbers(el);
  }
  return slide;
}

/** Number settings an older version saved as null (an Inspector field left empty) go back to their defaults. */
const NUMBER_DEFAULTS: [path: string, fallback: number][] = [
  ['x', 0], ['y', 0], ['w', 100], ['h', 100], ['rotation', 0], ['opacity', 1], ['zIndex', 0],
  ['size', 110], ['lineHeight', 1.2], ['letterSpacing', 0], ['strokeWidth', 0], ['radius', 0],
  ['stroke.width', 6], ['shadow.x', 0], ['shadow.y', 0], ['shadow.blur', 0], ['glow.blur', 20],
  ['background.padding', 24], ['background.radius', 16], ['entrance.delay', 0], ['entrance.duration', 0.6],
];
function repairNumbers(el: SlideElement): void {
  for (const [path, fallback] of NUMBER_DEFAULTS) {
    const keys = path.split('.');
    let o = el as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = isObj(o[k]) ? (o[k] as Record<string, unknown>) : {};
    const last = keys[keys.length - 1];
    // Only a setting that's there: a missing optional one (an image's corners) stays missing.
    if (last in o && (typeof o[last] !== 'number' || !Number.isFinite(o[last]))) {
      if (o[last] === undefined) continue;
      o[last] = fallback;
    }
  }
}

function repairGame(g: Game): void {
  if (typeof g.title !== 'string') g.title = g.title == null ? 'Untitled Game' : String(g.title);
  if (!isObj(g.settings.roundIntro)) g.settings.roundIntro = newGame().settings.roundIntro;
  // A countdown is whole seconds, at least 1, or none (a hand-edited -5 would show "Start -5s").
  const secs = g.settings.defaultTimerSeconds;
  if (secs !== null) {
    const fixed = countdownSeconds(String(secs ?? ''));
    if (fixed !== secs) g.settings.defaultTimerSeconds = fixed;
  }
  if (g.settings.partnerSteal !== undefined && typeof g.settings.partnerSteal !== 'boolean') delete g.settings.partnerSteal;
  const players = objects<PlayerTemplate>(g.players);
  if (players !== g.players) g.players = players;
  players.forEach((p, i) => {
    fixId(p);
    if (typeof p.name !== 'string') p.name = `Player ${i + 1}`;
    if (typeof p.color !== 'string' || !p.color) p.color = nextFreeColor(players.filter((o) => o !== p && typeof o.color === 'string').map((o) => o.color));
  });
  // "Most players" never below the players listed ("6/4 players"), and within what the app can show.
  const most = mostPlayers(g.settings.maxPlayers, players.length);
  if (most !== g.settings.maxPlayers) g.settings.maxPlayers = most;
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
          repairExtraSlides(cl);
          repairPartner(cl);
          repairChoices(cl);
        }
      }
      // No row values: the usual 200, 400… for as many rows as the board has.
      if (!Array.isArray(r.values) || r.values.some((v) => typeof v !== 'number')) {
        const rows = Math.max(0, ...cats.map((c) => c.clues.length));
        r.values = Array.from({ length: rows || DEFAULT_VALUES.length }, (_, i) => (typeof r.values?.[i] === 'number' ? r.values[i] : (i + 1) * 200));
      }
      // A row for every category's clues (a longer category keeps them all: rows are added, going up as the last did),
      // and an empty tile wherever a shorter category has none, so every row has a tile in every column.
      const rows = Math.max(r.values.length, ...cats.map((c) => c.clues.length));
      while (r.values.length < rows) {
        const [a, b] = [r.values[r.values.length - 2] ?? 0, r.values[r.values.length - 1] ?? 0];
        r.values.push(b + (b > a ? b - a : 200));
      }
      for (const c of cats) while (c.clues.length < rows) c.clues.push({ ...newClue(), empty: true });
      repairPartnerTiles(r);
    } else if (isFinal(r)) {
      r.questionSlide = repairSlide(r.questionSlide);
      r.answerSlide = repairSlide(r.answerSlide);
      repairExtraSlides(r);
      repairCards(r, FINAL_CARD_TO);
      if (typeof r.category !== 'string') r.category = r.category == null ? '' : String(r.category);
      if (typeof r.timerSeconds !== 'number' || !(r.timerSeconds >= 1)) r.timerSeconds = 30;
      if (r.phoneAnswersOff !== undefined && typeof r.phoneAnswersOff !== 'boolean') delete r.phoneAnswersOff;
      repairChoices(r);
    } else if (isSlides(r)) {
      r.questionSlide = repairSlide(r.questionSlide);
      repairExtraSlides(r);
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
      repairExtraSlides(g.tiebreaker);
    }
  }
  const refs = objects<MediaRef>(g.media).filter((m) => typeof m.id === 'string' && m.id);
  for (const m of refs) if (typeof m.name !== 'string') m.name = m.id;
  // A 🗜 phone copy is a stored file of another file in the game that isn't a copy itself, one per file: any other
  // goes (phones get the file itself then).
  const copied = new Set<Id>();
  const media = refs.filter((m) => {
    if (m.phoneCopy === undefined) return true;
    const of = isObj(m.phoneCopy) ? m.phoneCopy.of : undefined;
    const ok = typeof of === 'string' && !m.url && !copied.has(of) && refs.some((o) => o.id === of && o !== m && o.phoneCopy === undefined);
    if (ok) copied.add(of);
    return ok;
  });
  if (media.length !== g.media.length) g.media = media;
  for (const k of ['wheels', 'dice'] as const) {
    const list = objects<WheelPreset & DicePreset>(g[k]);
    if (list !== g[k]) g[k] = list;
    for (const w of list) fixId(w);
  }
  for (const w of g.wheels) if (!Array.isArray(w.segments)) w.segments = [];
  for (const d of g.dice) if (!Array.isArray(d.dice)) d.dice = [];
  repairDeals(g);
  repairSavedCards(g);
  linkMoverDice(g);
}

/**
 * 🎭 Deals: each with an id, a name and parts (each with an id, a name, a count and a card). A count that isn't a whole
 * number becomes one, and a draw that isn't known goes, so a damaged file never deals a card it didn't mean to.
 */
function repairDeals(g: Game): void {
  if (g.deals === undefined) return;
  const deals = objects<DealPreset>(g.deals);
  if (!deals.length) return void delete g.deals;
  if (deals !== g.deals) g.deals = deals;
  for (const d of deals) {
    fixId(d);
    if (typeof d.name !== 'string') d.name = 'Deal';
    const parts = objects<DealPart>(d.parts);
    if (parts !== d.parts) d.parts = parts;
    for (const p of parts) {
      fixId(p);
      if (typeof p.name !== 'string') p.name = 'Part';
      else if (p.name.length > DEAL_PART_MAX) p.name = p.name.slice(0, DEAL_PART_MAX);
      if (p.count !== 'rest' && !(Number.isSafeInteger(p.count) && p.count >= 0 && p.count <= MAX_PLAYERS))
        p.count = typeof p.count === 'number' && Number.isFinite(p.count) ? Math.max(0, Math.min(MAX_PLAYERS, Math.round(p.count))) : 1;
      p.card = repairSlide(p.card);
      if (p.draw !== undefined && p.draw !== 'own' && p.draw !== 'shared') delete p.draw;
    }
    if (d.wheel !== undefined && typeof d.wheel !== 'string') delete d.wheel;
    if (d.perTeam !== undefined && typeof d.perTeam !== 'boolean') delete d.perTeam;
  }
}

/**
 * 🤫 Cards: each with an id of its own, a name and what a slide needs; anything else in the list goes. An `until` the
 * app doesn't know goes too (the shorter: until the round ends), so a damaged file never keeps a card on phones longer
 * than meant. (A card is sent by its id: a second card with the same one would send the first's.)
 */
function repairSavedCards(g: Game): void {
  if (g.cards === undefined) return;
  const cards = objects<SavedCard>(g.cards);
  if (!cards.length) return void delete g.cards;
  if (cards !== g.cards) g.cards = cards;
  const seen = new Set<Id>();
  for (const c of cards) {
    fixId(c);
    if (seen.has(c.id)) c.id = newId();
    seen.add(c.id);
    repairSlide(c);
    if (typeof c.name !== 'string') c.name = '';
    else if (c.name.length > CARD_NAME_MAX) c.name = c.name.slice(0, CARD_NAME_MAX);
    if (c.until !== undefined && c.until !== 'host') delete c.until;
  }
}

/**
 * Board games saved before their movement dice were linked by id named them: link them to the saved dice of that
 * name (or id), so renaming the dice no longer breaks the link. Dice typed in ("2d6") stay as they are.
 */
export function linkMoverDice(game: Pick<Game, 'dice' | 'rounds'>): void {
  for (const r of game.rounds) {
    if (!isBoardGame(r) || r.mover?.kind !== 'dice' || r.mover.diceId) continue;
    const m = r.mover;
    const d = game.dice.find((x) => x.id === m.dice) ?? game.dice.find((x) => x.name === m.dice);
    if (d) r.mover = { ...m, dice: d.name, diceId: d.id };
  }
}

const KNOWN_MODES = new Set<string>(['board', 'final', 'rpg', 'boardgame', 'slides']);

/**
 * What a game the app can't use is missing, as the first place it's wrong ("rounds[2].world: no such world"), or null
 * when it looks whole. For an opened file that the repairs above couldn't fix.
 */
export function gameProblem(g: Game): string | null {
  for (const [i, r] of g.rounds.entries()) {
    const at = `rounds[${i}]`;
    if (!KNOWN_MODES.has(r.mode)) return `${at}.mode: "${r.mode}" isn't a kind of round`;
    if (isRpg(r) && !g.worlds?.some((w) => w.id === r.world)) return `${at}.world: no world "${r.world}" in worlds`;
    // (The editor and the board show a tile for every row in every column.)
    if (isBoard(r))
      for (const [ci, c] of r.categories.entries()) {
        const short = r.values.findIndex((_, row) => !isObj(c.clues[row]));
        if (short >= 0) return `${at}.categories[${ci}].clues[${short}]: no clue for row ${short + 1}`;
      }
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
  /** An emoji drawn in the space when it has no image (🛒, 👹…: what "Make it a…" made it). */
  mark?: string;
  /** Spaces a player can step to next; more than one is a fork (the host picks). */
  next: Id[];
  /** Run (host-confirmed) when a player passes over it, e.g. Start: +2 gold. */
  onPass?: Action[];
  /** Run (host-confirmed) when a player stops on it. */
  onLand?: Action[];
  hostNotes?: string;
  /** Viewers see a plain space until the host reveals what it is. */
  secret?: boolean;
  /**
   * Viewers see the space's name under it (absent: they don't, in games made before names could be hidden too). The
   * host always sees it while editing, dimmed when viewers don't.
   */
  showName?: boolean;
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
   * How a turn's move is decided: dice, a saved wheel, or 'step': one space per turn, the player choosing which way.
   * Dice are standard dice as typed ("d6", "2d6"), or saved dice (`diceId`; `dice` then has their name when picked).
   */
  mover: { kind: 'dice'; dice: string; diceId?: Id } | { kind: 'wheel'; wheel: Id } | { kind: 'step' };
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
  fork?: { playerId: Id; at: Id; stepsLeft: number; came?: Id };
  /**
   * Spaces passed and landed on in the last move, for their action buttons; `turn`: the turn (`turns`) it was made in;
   * `back`: it went back, so landing passes nothing (no Start bonus for being sent back onto it).
   */
  last?: { playerId: Id; passed: Id[]; landed?: Id; turn?: number; back?: boolean };
  /** How many times the turn has changed (Next turn, Previous turn): a move counts for the turn it was made in. */
  turns?: number;
  /** The zone on screen instead of the board (null: the board). */
  zoneShown?: Id | null;
  /** Secret spaces the host revealed. */
  revealed?: Id[];
  /** Turns each player still has to miss (⏭ Skip next turn). */
  skips?: Record<Id, number>;
  /** The player Next turn goes to instead of the next one (🔁 Roll again). */
  again?: Id;
  /** The turn as it was before the last Next turn, for ◀ Previous turn (the skips and Roll again it used up, its move). */
  before?: { turn: number; turns?: number; skipped: Id[]; again?: Id; last?: BoardGameState['last'] };
}

