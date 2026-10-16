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
 * - Phones only ever see phoneView(): never answers, notes, media or other players' tokens, except the private cards the
 *   host sent to that phone (HostState.cards). A card holds whatever the host put on it, the answer included if the host
 *   put it there.
 *
 * This file is shared by the app and the Worker (buzzer/ imports it), so it has no app imports.
 */

export const BUZZ_PROTOCOL = 1;

/**
 * What this room can do beyond protocol 1 (the welcome lists them; a room from before lists none). 'teams': seats can be
 * teams that several phones join (HostState.teams). 'wagers': players send their Daily Double or Final wager from
 * their phone (HostState.wager), and only the host hears the amount. 'free': the host can free a seat without blocking
 * anyone (kick with block: false), for a player who came back on another phone. 'color': a seated phone asks for another
 * colour (PhoneMsg 'color'), passed on to the host, which takes it when it's free (HostState.colorPick). 'answers':
 * everyone types an answer to the clue on their phone, and only the host sees it (HostState.answers). 'cards': private
 * cards the host sent (HostState.cards), the greyed lobby (status.off), the late rule with Member.teamAt, cardSeen,
 * cardsLate and a card's `shared`.
 * 'files': card files over HTTP (POST and GET /api/rooms/:code/files); listed only while the server takes files.
 */
export const ROOM_FEATURES = ['teams', 'wagers', 'free', 'color', 'answers', 'cards', 'files'] as const;
export type RoomFeature = (typeof ROOM_FEATURES)[number];

/** Cards in the host's state at most, and how big they may be together (JSON bytes; over it, media go first, then cards). */
export const CARDS_MAX = 8;
export const CARDS_BYTES = 12 * 1024;
/** A card's id, and a team member id in its `to` (characters). */
export const CARD_ID_MAX = 100;
export const CARD_MEMBER_MAX = 64;
/** Recipients (`to` entries) per card. */
export const CARD_TO_MAX = 64;
/** A card's lines (characters). */
export const CARD_ROLE_MAX = 24;
export const CARD_HINT_MAX = 200;
export const CARD_TITLE_MAX = 80;
export const CARD_TEXT_MAX = 1000;
/** Pictures, videos, sounds and embeds per card. */
export const CARD_MEDIA_MAX = 6;
/** A link on a card (https only, no user name or password). */
export const CARD_LINK_MAX = 2048;

/**
 * A link a card may carry, tidied: https only, at most CARD_LINK_MAX characters, with no user name or password; null
 * if not. The app checks it before sending, the room again (cleanState), and the phone once more before loading it.
 */
export function cardLink(s: unknown): string | null {
  if (typeof s !== 'string' || !s || s.length > CARD_LINK_MAX) return null;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= CARD_LINK_MAX ? u.href : null;
  } catch {
    return null;
  }
}
/**
 * Up to three short words show huge on a card, so a secret word can be read at arm's length: its title, or its words
 * when it has no title. The phone's card panel and the editor's 📱 preview both use it, so they agree.
 */
export function bigWords(s: string | undefined): boolean {
  const t = (s ?? '').trim();
  return !!t && t.length <= 30 && !/\n/.test(t) && t.split(/\s+/).length <= 3;
}
/** Sites whose player a card may embed (the phone builds the frame from the link, see links.ts playerFor). */
export const EMBED_SITES = ['youtube', 'drive', 'streamable'] as const;

/** Card files ('files'): at most this big each, and per room in all (bytes and files). */
export const FILE_MAX_BYTES = 4 * 1024 * 1024;
export const ROOM_FILES_BYTES = 16 * 1024 * 1024;
export const ROOM_FILES_MAX = 32;
/** The types a card file may have. No SVG, no HTML. */
export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4'] as const;
/** A card file's id: the SHA-256 of its bytes, as 64 lowercase hex digits. */
export const isFileId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

/** A file's type as the room takes it (other names browsers use for the same types too), or null when it isn't taken. */
export function fileType(raw: string | null | undefined): (typeof FILE_TYPES)[number] | null {
  const t = (raw ?? '').split(';')[0].trim().toLowerCase();
  const alias: Record<string, (typeof FILE_TYPES)[number]> = { 'image/jpg': 'image/jpeg', 'audio/mp3': 'audio/mpeg', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/vnd.wave': 'audio/wav', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4' };
  if (alias[t]) return alias[t];
  return (FILE_TYPES as readonly string[]).includes(t) ? (t as (typeof FILE_TYPES)[number]) : null;
}

/** The biggest wager a phone may send (and a seat's max the room passes on). */
export const WAGER_MAX = 1_000_000_000;
/** The longest answer a phone may type (characters). */
export const ANSWER_MAX = 200;

/** A team member's name, as typed on their phone (characters). */
export const MEMBER_NAME_MAX = 24;

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
 * - armed: buzzers are open; the fastest buzz wins.
 * - answering: someone is answering (answering is set; null while a tie waits on the host); others wait.
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
  // ---- Added later (all optional: an older room drops them, an older app leaves them out) ----
  /** The clue is over (answered right): phones say so instead of "Get ready". by: who got it. Only with 'closed'. */
  done?: { by?: string | null } | null;
  /**
   * A short line for the phones when there's no buzzing (a Daily Double, a Final, an RPG round, the host setting up…).
   * The seats in `seats` see `seatsText` instead (the Daily Double's player: "Daily Double — you're up!").
   */
  status?: {
    text: string;
    seats?: string[];
    seatsText?: string;
    /** Added with 'cards': nobody buzzes now. Phones in the lobby grey the button and show text (or seatsText) as its big line. */
    off?: boolean;
    /** Added with 'cards': the small line under it, for everyone (sub) and for `seats` (seatsSub). */
    sub?: string;
    seatsSub?: string;
  } | null;
  /** The points symbol ("$"), for the scores phones show. */
  currency?: string;
  /** 🔒 Seats locked: nobody new takes a seat or asks to join; only phones with a seat's token come back. */
  locked?: boolean;
  /**
   * Teams: each seat is a team. Any number of phones join one (each with its own name), and any of them buzzes for it:
   * the team's first buzz counts (one place in the queue per team), a lock-out locks the whole team. allowNew is off.
   */
  teams?: boolean;
  /**
   * The host is taking wagers (a Daily Double, a Final): the seats in it can send theirs from their phone while `open`.
   * Amounts stay between the host, the room and that seat's own phones: phoneView() gives each phone its own only.
   */
  wager?: WagerAsk | null;
  /** The game is over (its final scores are up): phones say where they came (PhoneView.final). */
  over?: boolean;
  /**
   * With `over`: a tiebreaker (the roll-off, the tiebreaker clue) settled a tie for first. That seat came 1st on its own,
   * and the seats it tied with share 2nd (as the end screen ranks them).
   */
  winner?: string;
  /** Players may pick their own colour on their phone (not teams: a team's colour is the host's). */
  colorPick?: boolean;
  /** The clue's answer is on screen: no more buzzes, not even to get in line. */
  answerShown?: boolean;
  /**
   * Everyone answers this clue on their phone (a ✍ clue): the seats in it type theirs while `open`. The words go to the
   * host only: phoneView() gives each phone its own seat's.
   */
  answers?: AnswerAsk | null;
  /**
   * Added later ('cards'): the private cards the host sent, which only the phones they were sent to see (phoneView's
   * `cards`). Only ever what the host sent by hand; a card holds whatever the host put on it.
   */
  cards?: HostCard[] | null;
}

/** A card for some phones only (a partner clue's, one the host sent…). */
export interface HostCard {
  /**
   * A new id is a new card: phones seated, joined to the team or moved onto it after the room first saw the id don't
   * get it (the late rule), so the host sends it again under a new id for them.
   */
  id: string;
  /** Who gets it: whole seats (every phone on a team), one person on a team (member), or a team except some people. */
  to: CardTo[];
  /** false: the answer is on screen ("The answer's on screen"); the card stays. */
  open: boolean;
  /** "Describer" */
  role?: string;
  /** "Describe it to Ann: don't say what's on it!" */
  hint?: string;
  title?: string;
  text?: string;
  media?: CardMedia[];
  /** Behind "Tap to see" (default true). */
  tap?: boolean;
  /**
   * The same card went to others than `to` too (the app sends one card per part, each with its own lines): its phones
   * say it isn't theirs alone. The room sets it too when `to` names more than one.
   */
  shared?: boolean;
}

export interface CardTo {
  seat: string;
  /** Teams: only this member of the team (their id; not a credential). */
  member?: string;
  /** Teams: everyone on the team but these members. */
  except?: string[];
}

/**
 * A picture, video, sound or embed on a card. An https link (a GIF is an image) or a site's player; with 'files', a
 * file the host uploaded to the room (`file`: its id), one still on its way (`pending`), or one that won't come
 * (`missing`: "the host will show you this").
 */
export type CardMedia =
  | { kind: 'image' | 'video' | 'audio'; url: string; start?: number; end?: number; name?: string }
  | { kind: 'embed'; site: (typeof EMBED_SITES)[number]; url: string; start?: number; end?: number }
  | { kind: 'image' | 'video' | 'audio'; file: string; mime: string; start?: number; end?: number; name?: string }
  | { kind: 'image' | 'video' | 'audio'; pending: true }
  | { kind: 'image' | 'video' | 'audio'; missing: true };

/** A card as the phone it was sent to sees it. */
export interface PhoneCard {
  id: string;
  open: boolean;
  role?: string;
  hint?: string;
  title?: string;
  text?: string;
  media?: CardMedia[];
  tap?: boolean;
  /** Everyone on this phone's team sees it. */
  team?: boolean;
  /** It went to others too (never who: a phone isn't told who else got a card). */
  shared?: boolean;
}

/** HostState.answers: whose answers are taken, for which clue. */
export interface AnswerAsk {
  /** Names this round of answers: a new id starts over (the room forgets what phones sent for another). */
  id: string;
  /** Phones may send (or change) theirs; false: locked (the answer is on screen). */
  open: boolean;
  /** got: the last answer (its `n`) the host took from this seat: one sent while the host was away comes again only if newer. */
  seats: { id: string; got?: number }[];
}

/** An answer a phone sent, as the room keeps it (per seat: a team's newest, whoever on it sent it). */
export interface SentAnswer {
  text: string;
  /** Counts up per seat: the host takes each once. */
  n: number;
  /** Teams: the member who sent it (id) and their name. */
  member?: string;
  by?: string;
  /** Added later: when the room took it (a phone seated after the answers began sees only what it sent since). */
  at?: number;
}

/** Answers, as one phone sees them: its own seat's only. */
export interface PhoneAnswer {
  id: string;
  open: boolean;
  /** This phone's seat is in it. */
  mine: boolean;
  /** What this seat sent (teams: whoever on it sent it last). */
  text?: string;
  by?: string;
  byYou?: boolean;
  /**
   * Added later: an answer is in, but this phone doesn't see it (it took its seat, or joined its team, after the answers
   * began). Sending one replaces it.
   */
  hidden?: boolean;
}

/** HostState.wager: who is wagering, and on what. */
export interface WagerAsk {
  /** Names this round of wagers: a new id starts over (the room forgets what phones sent for another). */
  id: string;
  kind: 'dd' | 'final';
  /** Phones may send (or change) their wager; false: locked (the question is up), phones see what was locked in. */
  open: boolean;
  /** The host holds wagers to each seat's max: a phone's wager over it is refused. Left out: the max is only shown. */
  limit?: boolean;
  seats: WagerSeat[];
}

export interface WagerSeat {
  id: string;
  /** Their max (shown on their phone; enforced only with `limit`). */
  max: number;
  /** Their wager as the host has it now (left out: none yet). */
  amount?: number;
  /** The host typed it, or changed the one their phone sent: their phone shows the host's amount. */
  fromHost?: boolean;
  /** The last phone wager (its `n`) the host took for this seat: one sent while the host was away comes again only if newer. */
  got?: number;
}

/** A wager a phone sent, as the room keeps it (per seat: a team's newest, whoever on it sent it). */
export interface SentWager {
  amount: number;
  /** Counts up per seat: the host takes each once (WagerSeat.got). */
  n: number;
  /** Teams: the member who sent it (id, not a credential) and their name. */
  member?: string;
  by?: string;
  /** Added later: when the room took it (a phone seated after the round began sees only what it sent since). */
  at?: number;
}

/** What one phone sees. Built by phoneView() only. */
export interface PhoneView {
  title: string;
  phase: BuzzPhase;
  armId: number;
  clue: { text: string; caption?: string } | null;
  /**
   * Who is answering (name and colour only). Teams: by is the team member whose buzz it was (when one did), byYou
   * whether that's this phone; `you` is this phone's team.
   */
  answering: { name: string; color: string; you: boolean; by?: string; byYou?: boolean } | null;
  /**
   * This phone's player (teams: its team, with member: the name this phone joined it as); null until it has a seat.
   * Teams: out (added later, by the room) with lockedOut: this member had their go on this clue on another team (the
   * host moved them, or they left it), though this team hasn't answered.
   */
  you: (Seat & { score: number; lockedOut: boolean; member?: string; out?: boolean }) | null;
  // ---- Added later (optional: an older room leaves them out) ----
  /** The clue is over: who got it (null: not said). */
  done?: { by: { name: string; color: string; you: boolean } | null };
  /** HostState.status as this phone should see it. */
  status?: string;
  currency?: string;
  /** false while the host's connection is gone (the room adds it). */
  hostHere?: boolean;
  /** Seats are teams (HostState.teams). */
  teams?: boolean;
  /** The host is taking wagers (HostState.wager), as this phone should see it. */
  wager?: PhoneWager;
  /** The game is over (HostState.over): where this phone's seat came, by score (tied: others have the same score). */
  final?: { place: number; tied?: boolean };
  /** This phone may pick its player's colour (HostState.colorPick): `taken`, the other players' colours. */
  colorPick?: { taken: string[] };
  /** Someone else is answering and a buzz from this phone would still get in line behind them (the room adds it). */
  canQueue?: boolean;
  /** Everyone answers this clue on their phone (HostState.answers), as this phone should see it. */
  answer?: PhoneAnswer;
  /** Added later ('cards'): the status line's small line, and whether the buzz button is greyed (status.off). */
  statusSub?: string;
  statusOff?: true;
  /**
   * Added later ('cards', the room adds it): this phone's cards only, newest last as the host lists them. late: how many
   * sent to its seat it isn't shown (it took the seat, joined the team or was moved onto it after they were sent).
   */
  cards?: { list: PhoneCard[]; late?: number };
}

/**
 * Wagers, as one phone sees them. mine: this phone's seat is wagering (its own max and amount only); otherwise who
 * is (a Daily Double: `who`) or, in a Final, nothing: it sits this one out.
 */
export interface PhoneWager {
  /** The wager round (WagerAsk.id): a phone's wager names it. */
  id: string;
  kind: 'dd' | 'final';
  open: boolean;
  mine: boolean;
  /** Not mine, a Daily Double: the name(s) wagering. */
  who?: string;
  max?: number;
  /** The max is enforced (else it's only shown). */
  limit?: boolean;
  /** This seat's wager as it stands. */
  amount?: number;
  /** It came from a phone of this seat (by: who on the team; byYou: this phone). */
  sent?: boolean;
  by?: string;
  byYou?: boolean;
  /** The host typed it (or changed the one sent). */
  host?: boolean;
  /**
   * Added later: a wager is in, but this phone doesn't see it (it took its seat, or joined its team, after the round
   * began; see phoneView's `late`). Sending one replaces it.
   */
  hidden?: boolean;
}

/** A team member as the room knows them: id (not a credential) and the name they joined with. */
export interface MemberRef {
  id: string;
  name: string;
}

/**
 * `me`: this phone's team member (teams). `by`: the member whose buzz has the answering team answering (teams; null
 * when the host picked the team itself). `late`: this phone took its seat (or joined its team) after the wager round
 * began, so it isn't told the wager the host has (the room passes only what it sent itself as `sent`). `answerHidden`:
 * the same for answers: the seat has one this phone isn't shown (the room leaves it out of `answer`). `cards`: the cards
 * this phone gets and how many it is late for (the room picks them: only those sent to it, see room.ts cardsFor).
 */
export function phoneView(
  s: HostState,
  seatId: string | null,
  me?: MemberRef | null,
  by?: MemberRef | null,
  sent?: SentWager | null,
  late = false,
  answer?: SentAnswer | null,
  answerHidden = false,
  cards?: PhoneView['cards'] | null,
): PhoneView {
  const seat = seatId ? s.seats.find((x) => x.id === seatId) : undefined;
  const a = s.phase === 'answering' && s.answering ? s.seats.find((x) => x.id === s.answering) : undefined;
  // The status line's seats see their own pair of lines (the big one and the small one under it).
  const own = !!seatId && !!s.status?.seatsText && !!s.status.seats?.includes(seatId);
  const sub = own ? s.status?.seatsSub : s.status?.sub;
  return {
    title: s.title,
    phase: s.phase,
    armId: s.armId,
    clue: s.phase === 'lobby' && !s.answers ? null : s.clue ? { text: s.clue.text, ...(s.clue.caption ? { caption: s.clue.caption } : {}) } : null,
    answering: a ? { name: a.name, color: a.color, you: a.id === seatId, ...(s.teams && by ? { by: by.name, byYou: !!me && me.id === by.id } : {}) } : null,
    you: seat
      ? { id: seat.id, name: seat.name, color: seat.color, score: s.scores[seat.id] ?? 0, lockedOut: s.lockedOut.includes(seat.id), ...(s.teams && me ? { member: me.name } : {}) }
      : null,
    ...doneView(s, seatId),
    ...(s.status?.text ? { status: own ? s.status.seatsText! : s.status.text } : {}),
    ...(s.status?.text && sub ? { statusSub: sub } : {}),
    ...(s.status?.text && s.status.off ? { statusOff: true as const } : {}),
    ...(s.currency ? { currency: s.currency } : {}),
    ...(s.teams ? { teams: true } : {}),
    ...wagerView(s, seatId, me, sent, late),
    ...finalView(s, seat?.id),
    ...(s.colorPick && seat && !s.teams ? { colorPick: { taken: s.seats.filter((x) => x.id !== seat.id).map((x) => x.color.toLowerCase()) } } : {}),
    ...answerView(s, seat?.id, me, answer, answerHidden),
    ...(seat && cards && (cards.list.length || cards.late) ? { cards } : {}),
  };
}

/** The answers part of a phone's view: its own seat's words only. */
function answerView(s: HostState, seatId: string | undefined, me?: MemberRef | null, sent?: SentAnswer | null, hidden = false): Pick<PhoneView, 'answer'> {
  const a = s.answers;
  if (!a || !seatId) return {};
  const mine = a.seats.some((x) => x.id === seatId);
  return {
    answer: {
      id: a.id,
      open: a.open,
      mine,
      ...(mine && sent ? { text: sent.text, ...(s.teams && sent.by ? { by: sent.by, byYou: !!me && me.id === sent.member } : {}) } : {}),
      ...(mine && !sent && hidden ? { hidden: true } : {}),
    },
  };
}

/**
 * Where a seat came when the game is over: 1 + how many scored more (equal scores share a place), except that a
 * tiebreaker's winner came 1st on its own (HostState.winner).
 */
function finalView(s: HostState, seatId: string | undefined): Pick<PhoneView, 'final'> {
  if (!s.over || !seatId) return {};
  const mine = s.scores[seatId] ?? 0;
  const others = s.seats.filter((x) => x.id !== seatId).map((x) => s.scores[x.id] ?? 0);
  const top = Math.max(...s.seats.map((x) => s.scores[x.id] ?? 0));
  if (s.winner && s.scores[s.winner] === top && mine === top) {
    if (seatId === s.winner) return { final: { place: 1 } };
    // Tied with the tiebreaker's winner: 2nd, shared with the others they tied with.
    const rest = others.filter((x) => x === mine).length - 1;
    return { final: { place: 2, ...(rest > 0 ? { tied: true } : {}) } };
  }
  const tied = others.includes(mine);
  return { final: { place: 1 + others.filter((x) => x > mine).length, ...(tied ? { tied: true } : {}) } };
}

/**
 * The wager part of a phone's view: its own seat's max and amount only, never another seat's. `sent`: what a phone of
 * this seat sent (the room keeps it); the host's own amount wins once the host typed or changed it, and once the wagers
 * are locked over a send the host never took.
 */
function wagerView(s: HostState, seatId: string | null, me?: MemberRef | null, sent?: SentWager | null, late = false): Pick<PhoneView, 'wager'> {
  const w = s.wager;
  if (!w || !seatId || !s.seats.some((x) => x.id === seatId)) return {};
  const own = w.seats.find((x) => x.id === seatId);
  if (!own) {
    const who = w.kind === 'dd' ? w.seats.map((x) => s.seats.find((y) => y.id === x.id)?.name).filter(Boolean).join(' & ') : '';
    return { wager: { id: w.id, kind: w.kind, open: w.open, mine: false, ...(who ? { who } : {}) } };
  }
  // A phone's wager the host took, then cleared (an emptied box, an undo): gone, not still "sent".
  const taken = !!sent && own.got !== undefined && sent.n <= own.got;
  const cleared = taken && own.amount === undefined;
  // Locked: one the host never took (sent just as the question showed) isn't the wager, the host's amount is.
  const phone = !!sent && !own.fromHost && !cleared && (w.open || taken);
  const amount = phone ? sent.amount : late ? undefined : own.amount;
  return {
    wager: {
      id: w.id,
      kind: w.kind,
      open: w.open,
      mine: true,
      max: own.max,
      ...(w.limit ? { limit: true } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(phone || (amount !== undefined && !own.fromHost) ? { sent: true } : {}),
      ...(phone && s.teams && sent.by ? { by: sent.by, byYou: !!me && me.id === sent.member } : {}),
      ...(amount !== undefined && own.fromHost ? { host: true } : {}),
      ...(amount === undefined && own.amount !== undefined ? { hidden: true } : {}),
    },
  };
}

function doneView(s: HostState, seatId: string | null): Pick<PhoneView, 'done'> {
  if (!s.done || s.phase !== 'closed') return {};
  const by = s.done.by ? s.seats.find((x) => x.id === s.done!.by) : undefined;
  return { done: { by: by ? { name: by.name, color: by.color, you: by.id === seatId } : null } };
}

/**
 * A name typed on a phone made safe to show: no control or invisible formatting characters (bidi overrides,
 * zero-width spaces…; a zero-width joiner inside an emoji stays, and so do the tag characters of a flag like
 * England's), spaces squeezed, at most `max` characters (whole characters, with "…" when cut).
 */
export function cleanName(raw: string, max: number): string {
  const chars = Array.from(raw);
  const pic = /\p{Extended_Pictographic}/u;
  const invisible = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
  const isTag = (c: string) => c >= '\u{E0020}' && c <= '\u{E007F}';
  const kept: string[] = [];
  /** Right after a 🏴 (and its tags so far): tag characters spell the flag. */
  let flag = false;
  chars.forEach((c, i) => {
    if (isTag(c)) {
      if (flag) kept.push(c);
      return;
    }
    flag = c === '\u{1F3F4}';
    if (!invisible.test(c) || (c === '\u200d' && pic.test(chars[i - 1] ?? '') && pic.test(chars[i + 1] ?? ''))) kept.push(c);
  });
  return clip(kept.join('').replace(/\s+/g, ' ').trim(), max);
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
/** The characters as people see them: a family emoji or a flag is one (code points where Intl.Segmenter is missing). */
const graphemes = (s: string): string[] => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

/**
 * At most `max` characters (whole ones as people see them: an emoji, a family or a flag isn't cut apart), ending in
 * "…" when cut. Also at most 16 × max UTF-16 units, so piled-up accents can't make one "character" huge.
 */
export function clip(s: string, max: number): string {
  const g = graphemes(s);
  if (g.length <= max && s.length <= max * 16) return s;
  let out = '';
  for (const x of g.slice(0, Math.max(0, max - 1))) {
    if (out.length + x.length >= max * 16) break;
    out += x;
  }
  return `${out.trimEnd()}…`;
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
  /** Added later. Teams: the team member on this phone (id, not a credential) and the name they joined with. */
  member?: string;
  name?: string;
}

/** The host → room. The host's token goes in the WebSocket URL, not in messages. */
export type HostMsg =
  | { t: 'state'; state: HostState }
  /** Accept a phone waiting as a new player: the host has added the seat (newSeat) to the game and to state.seats. */
  | { t: 'accept'; conn: string; seatId: string }
  | { t: 'reject'; conn: string }
  /**
   * Take a seat back: its phone is told and its token stops working (it can claim a free seat again). Teams: member
   * (added later) takes just that one person off the team; without it, everyone on the team. block (added later,
   * 'free'): false frees the seat without keeping anyone off it (the player came back on another phone); left out,
   * that phone (and its address) can't take it again for a while.
   */
  | { t: 'kick'; seatId: string; member?: string; block?: boolean }
  /** Added later. Teams: put a team member (and their phone) on another team. */
  | { t: 'move'; member: string; seatId: string }
  | { t: 'close' }
  | { t: 'ping'; at: number }
  /** Added later ('files'): the room deletes these card files now (those no current card uses). */
  | { t: 'forget'; files: string[] };

/** One place in the room's queue of buzzes (see the 'queue' message). */
export interface QueuedBuzz {
  seatId: string;
  afterMs: number;
  rolled?: number;
  /** Added later: it reacted faster than the first, but got to the room after the race was decided. */
  arrivedLate?: boolean;
  /** Added later. Teams: the team member whose buzz it was (the team's first; teammates' later buzzes don't count). */
  by?: string;
}

/** Buzzes this close (ms) are a tie: below that it's touch sampling and screen timing, not who reacted first. */
export const TIE_MS = 10;

/** The room → host. */
export type RoomToHost =
  /** features (added later): what this room can do beyond protocol 1 (ROOM_FEATURES; an older room sends none). */
  | { t: 'welcome'; code: string; protocol: number; serverNow: number; features?: string[] }
  /**
   * A buzz the room counted while armed. rank 1 is the winner (the room has moved to 'answering'); later ranks came
   * after. afterMs: 0 for the winner; for later ranks, how much slower than the winner they reacted (ms).
   */
  | { t: 'buzz'; armId: number; seatId: string; rank: number; afterMs: number; by?: string }
  /**
   * Every buzz counted in this arm, fastest reaction first, sent again whenever it changes (late buzzes keep coming).
   * afterMs: behind the first. tie: seats tied for first (within TIE_MS): the room picked nobody, the host decides
   * (pick one, or roll and send rollOrder). rolled: a tied seat's place in the host's roll.
   */
  | { t: 'queue'; armId: number; queue: QueuedBuzz[]; tie?: string[] }
  | { t: 'phones'; phones: PhoneInfo[] }
  | { t: 'pong'; at: number; serverNow: number }
  | { t: 'error'; message: string }
  /** Added later: a phone was turned away because the room is full (too many phones connected). */
  | { t: 'full' }
  /**
   * Added later ('wagers'): a phone sent seatId's wager for the host's wager round `id`. n counts up per seat (the host
   * says which it took: WagerSeat.got). by: teams, who on the team sent it. Only the host ever hears the amount.
   */
  | { t: 'wager'; id: string; seatId: string; amount: number; n: number; by?: string }
  /** Added later ('color'): a seated phone asks for this colour (#rrggbb) for its player. */
  | { t: 'color'; seatId: string; color: string }
  /** Added later ('answers'): a phone sent seatId's answer for the answer round `id` (n counts up per seat). */
  | { t: 'answer'; id: string; seatId: string; text: string; n: number; by?: string }
  /**
   * Added later ('cards'): card `id` was seen on a phone of seatId (teams: member, called by). Sent again for the
   * current cards when the host comes back.
   */
  | { t: 'cardSeen'; id: string; seatId: string; member?: string; by?: string }
  /**
   * Added later ('files'): the card files the room holds now (their ids), on welcome and whenever that changes. A file
   * no card used for a while is deleted, so the host uploads again any its cards need that isn't listed.
   */
  | { t: 'files'; ids: string[] }
  /**
   * Added later ('cards'): the phones here now that a current card was sent to but that are late for it (one that took
   * the seat, joined the team or was moved onto it after the card went out), whenever that changes; empty once none
   * are. The host suggests ↻ Send again.
   */
  | { t: 'cardsLate'; late: CardLate[] };

/** A phone of seatId (teams: member, called by) that card `id` was sent to, but that is late for it. */
export interface CardLate {
  id: string;
  seatId: string;
  member?: string;
  by?: string;
}

/** A phone → room. */
export type PhoneMsg =
  /**
   * Claim a seat. With a token (from an earlier 'joined') it takes the seat back even if another socket holds it.
   * device (added later): a random id this browser keeps, so a kick can keep that phone off the seat for a while.
   * Teams (added later): seatId is the team and name the person's own name (a token takes its member back, on whichever
   * team the host has them now).
   */
  | { t: 'join'; seatId: string; token?: string; device?: string; name?: string }
  /** Ask to join as a new player (only when allowNew). */
  | { t: 'new'; name: string; device?: string }
  /** reactMs: ms from this phone showing BUZZ! for armId to the press (old phones leave it out). */
  | { t: 'buzz'; armId: number; reactMs?: number }
  | { t: 'leave' }
  | { t: 'ping'; at: number }
  /** Sent straight back on every probe, so the room can time the round trip itself (replaced pong → sync). */
  | { t: 'echo'; id: number }
  /** Added later ('wagers'): this phone's seat's wager for the host's wager round `id` (a whole number, 0 or more). */
  | { t: 'wager'; id: string; amount: number }
  /** Added later ('color'): this phone's player wants this colour (#rrggbb); the host takes it if it's free. */
  | { t: 'color'; color: string }
  /** Added later ('answers'): this phone's seat's answer for the answer round `id`. */
  | { t: 'answer'; id: string; text: string }
  /** Added later ('cards'): this phone showed card `id` (its player tapped to see it). */
  | { t: 'cardSeen'; id: string };

/** Why the room didn't take a phone's wager: not taking one now, over the max (with the limit on), not a whole number, too many sends. */
export type WagerRefusal = 'closed' | 'over' | 'bad' | 'slow';

/**
 * Added later: 'locked' (🔒 the host locked the seats), 'blocked' (kicked from that seat a moment ago), 'name-taken',
 * 'need-name' (joining a team takes your name; so does asking to join, a name of only invisible characters isn't one),
 * 'slow-down' (too many tries to join in a minute).
 */
export type DenyReason = 'taken' | 'unknown-seat' | 'rejected' | 'full' | 'no-new' | 'bad-token' | 'locked' | 'blocked' | 'name-taken' | 'need-name' | 'slow-down';

/** The room → a phone. */
export type RoomToPhone =
  /**
   * On connect and whenever seats change: the seats and which are free. Added later: locked (🔒 nobody new can take a
   * seat), note (HostState.status's text, e.g. "The host is setting up — hang on").
   */
  | {
      t: 'seats';
      title: string;
      /**
       * members (teams): the names of the people on that team. away (added later): taken, but the phone that has it
       * isn't connected (its player may be back on another phone: the host can free it).
       */
      seats: (Seat & { taken: boolean; members?: string[]; away?: boolean })[];
      allowNew: boolean;
      hostHere: boolean;
      locked?: boolean;
      note?: string;
      /** Added later: the seats are teams (pick one and give your name). */
      teams?: boolean;
    }
  /**
   * This phone holds seatId; keep token (localStorage, per room code) to come back after a refresh. Teams: name is the
   * name this phone joined its team as.
   */
  | { t: 'joined'; seatId: string; token: string; name?: string }
  | { t: 'waiting' }
  | { t: 'denied'; reason: DenyReason }
  | { t: 'view'; view: PhoneView }
  /**
   * This phone's own buzz, sent again whenever its place in the queue changes. 'pending' = counted, the room is still
   * collecting buzzes (a quarter second or so); 'first' = you're answering (byMs: how much faster than the next one,
   * once there is one); 'late' = in the queue at rank, afterMs behind the first (no rank: it didn't count;
   * arrivedLate: it reacted faster, but got there after the race was decided); 'tie' = tied for first, the host is
   * deciding; 'early' = before the buzzers opened (locked until lockedUntil); 'locked' = can't buzz.
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
      arrivedLate?: boolean;
      /** Teams: the team member whose buzz holds the team's place (by), and whether that's this phone (byYou). */
      by?: string;
      byYou?: boolean;
    }
  /** freed (added later): the host freed the seat (its player moved to another phone), rather than taking it back. */
  | { t: 'kicked'; freed?: boolean }
  /** The host closed the room (or it expired). */
  | { t: 'closed' }
  | { t: 'pong'; at: number; serverNow: number }
  /** Added later: echo this id at once (the room times this phone's round trip). */
  | { t: 'probe'; id: number }
  /** Added later ('wagers'): the answer to this phone's wager (its view has the wager as it stands). */
  | { t: 'wagered'; id: string; ok: boolean; amount?: number; reason?: WagerRefusal; max?: number }
  /** Added later ('answers'): the answer to this phone's answer (its view has it as it stands). */
  | { t: 'answered'; id: string; ok: boolean; reason?: 'closed' | 'bad' | 'slow' };

/** POST {base}/api/rooms → this. Then the host connects to {wss base}/ws/{code}?host={hostToken}; phones to /ws/{code}. */
export interface NewRoom {
  code: string;
  hostToken: string;
}

/**
 * Card files ('files'). The host uploads one with POST {base}/api/rooms/{code}/files, `Authorization: Bearer
 * <hostToken>`, the file's type (FILE_TYPES) as Content-Type and its bytes (at most FILE_MAX_BYTES): 200 {id} (its
 * SHA-256; the same bytes again store nothing new), or {error} with 401, 409 (the room's files are full), 413 (too big),
 * 415 (a type it doesn't take), 429 (too many, or today's budget is used up) or 503 (the server takes no files). A phone
 * fetches one with GET …/files/{id} and `Authorization: Bearer <its seat or member token>` (never in the address): only
 * for a card sent to it that it isn't late for, else 404.
 */
export const filesUrl = (base: string, code: string, id?: string): string => `${base.replace(/\/+$/, '')}/api/rooms/${code}/files${id ? `/${id}` : ''}`;

/** The link players open (it fills the code in). */
export const joinUrl = (base: string, code: string): string => `${base.replace(/\/+$/, '')}/${code}`;
/** http(s) → ws(s). */
export const socketUrl = (base: string, code: string, hostToken?: string): string =>
  `${base.replace(/\/+$/, '').replace(/^http/, 'ws')}/ws/${code}${hostToken ? `?host=${encodeURIComponent(hostToken)}` : ''}`;
