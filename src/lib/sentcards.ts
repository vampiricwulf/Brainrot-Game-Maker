// 🤫 Cards anywhere (partner-clues spec §12): cards the host sends with 🤫 Send a card… (the tools row, in any round:
// one of the editor's 🤫 Cards, a tile's card or a quick one) or from an open tile's panel (a standard or Daily Double
// tile's own 🤫 cards: 🤫 Just you, 💡 Insider tip). They live in Session.cards, and only the host's presses add to it
// (sendCard, sendCardAgain); ✖ Take back, a round ending, a tile closing, a player taken out or a card deleted in the
// editor take them away. What the buzzer room gets is built from Session.cards alone (buzz.ts sessionCards), as a
// partner clue's is from its sends. No Svelte state: tested in sentcards.test.ts.
import { isLinkProblem, parseMediaLink, youtubeStart } from './links';
import {
  boardRounds,
  cardSlides,
  newAudioEl,
  newEmbedEl,
  newId,
  newImageEl,
  newTextEl,
  newVideoEl,
  SLIDE_W,
  type CardTo,
  type Clue,
  type ClueCard,
  type Game,
  type Id,
  type MediaRef,
  type SavedCard,
  type SentCard,
  type Session,
  type Slide,
  type SlideElement,
  type TeamMember,
} from './model';
import { cardHash, toKey } from './partner';

/** A card's id on the wire: `sc:<id>:<when>`. ↻ Send again gives it a new when: a new card for the room's late rule. */
export const sentCardId = (c: Pick<SentCard, 'id' | 'at'>): string => `sc:${c.id}:${c.at}`;

/** A clue anywhere in the game's boards, by id. */
function clueById(game: Pick<Game, 'rounds'>, id: Id): Clue | undefined {
  for (const r of boardRounds(game as Game)) for (const c of r.categories) for (const cl of c.clues) if (cl.id === id) return cl;
  return undefined;
}

/** A tile's card in the game, by its clue and card ids (and its number on the tile, from 1). */
export function tileCard(game: Pick<Game, 'rounds'>, clue: Id, card: Id): { clue: Clue; card: ClueCard; n: number } | undefined {
  const cl = clueById(game, clue);
  const cards = cl ? cardSlides(cl) : [];
  const i = cards.findIndex((c) => c.id === card);
  return cl && i >= 0 ? { clue: cl, card: cards[i], n: i + 1 } : undefined;
}

/**
 * What reading a sent card needs of the game: its boards (tile cards) and its 🤫 Cards. Always pass the game itself: an
 * object with only `rounds` reads every 🤫 Card as deleted.
 */
export type CardGame = Pick<Game, 'rounds' | 'cards'>;

/** A card from the editor's 🤫 Cards, by id. */
export const savedCard = (game: Pick<Game, 'cards'>, id: Id): SavedCard | undefined => game.cards?.find((c) => c.id === id);

/**
 * What a card shows: a tile's card or one of the editor's 🤫 Cards as the editor has it now, or the one made in 🤫 Send
 * a card….
 */
export function sentSlide(game: CardGame, c: Pick<SentCard, 'content'>): Slide | undefined {
  const k = c.content;
  return 'slide' in k ? k.slide : 'saved' in k ? savedCard(game, k.saved) : tileCard(game, k.clue, k.card)?.card;
}

/**
 * How a card stands: 'sent' (as it went), 'edited' (a card made in the editor, a tile's or a 🤫 Card, changed since: off
 * the phones until ↻ Send again) or 'gone' (that card or its tile was deleted).
 */
export function sentState(game: CardGame, c: Pick<SentCard, 'content' | 'hash'>): 'sent' | 'edited' | 'gone' {
  const slide = sentSlide(game, c);
  return !slide ? 'gone' : cardHash(slide) === c.hash ? 'sent' : 'edited';
}

/** A label's number ("Card 3": 3). */
const labelNo = (label: string): number => Number(/^Card (\d+)$/.exec(label)?.[1] ?? 0);

/**
 * The next card's label: "Card 4", one more than the last one sent while any is out (one taken back meanwhile keeps its
 * number: the next isn't another "Card 3"). Card 1 again once none is out. Made here, never typed.
 */
export function nextLabel(session: Pick<Session, 'cards' | 'lastCard'>): string {
  const n = Math.max(session.cards?.length ? (session.lastCard ?? 0) : 0, ...(session.cards ?? []).map((c) => labelNo(c.label)));
  return `Card ${n + 1}`;
}

/** No card out any more: the list goes, and the numbering starts again. */
function tidy(session: Session): void {
  if (session.cards?.length) return;
  delete session.cards;
  delete session.lastCard;
}

/**
 * Recipients as they go: players still in the game, in their order, each once (a whole seat, or one person on its
 * team; one person on a team that goes whole too isn't listed again).
 */
export function cleanTo(session: Pick<Session, 'players'>, to: CardTo[]): CardTo[] {
  const out: CardTo[] = [];
  for (const p of session.players) {
    const mine = to.filter((t) => t.seat === p.id);
    if (mine.some((t) => !t.member && !t.except?.length)) {
      out.push({ seat: p.id });
      continue;
    }
    for (const t of mine) {
      const one: CardTo = t.member ? { seat: p.id, member: { id: t.member.id, name: t.member.name } } : { seat: p.id, ...(t.except?.length ? { except: [...t.except] } : {}) };
      if (!out.some((x) => toKey(x) === toKey(one))) out.push(one);
    }
  }
  return out;
}

/** The round being played now (by id): none on the end screen or the tiebreaker, which are past the rounds. */
export function roundNow(game: Pick<Game, 'rounds'>, session: Pick<Session, 'currentRound' | 'phase'>): Id | undefined {
  return session.phase === 'end' || session.phase === 'tiebreaker' ? undefined : game.rounds[session.currentRound]?.id;
}

/** The tile open now (its clue id), if any. */
function tileNow(game: Pick<Game, 'rounds'>, session: Pick<Session, 'currentClue' | 'phase'>): Id | undefined {
  const ref = session.phase === 'clue' ? session.currentClue : null;
  const r = ref ? game.rounds[ref.round] : undefined;
  return r && r.mode === 'board' ? r.categories[ref!.cat]?.clues[ref!.row]?.id : undefined;
}

/** Whether a card is still out: its round is on, its tile is open, or it lasts until taken back; and it still exists. */
function stillOut(game: CardGame, session: Pick<Session, 'currentRound' | 'phase' | 'currentClue'>, c: SentCard): boolean {
  if (!sentSlide(game, c)) return false;
  if (c.until === 'round') return !!c.round && c.round === roundNow(game, session);
  if (c.until === 'tile') return !!c.tile && c.tile === tileNow(game, session);
  return true;
}

/** The cards out now, in the order sent (what the buzzer room gets, a 🎭 deal's cards included). */
export function cardsOut(game: CardGame, session: Pick<Session, 'cards' | 'currentRound' | 'phase' | 'currentClue'>): SentCard[] {
  return (session.cards ?? []).filter((c) => stillOut(game, session, c));
}

/**
 * The list of cards out: those sent with 🤫 Send a card… or from a tile's panel. A 🎭 deal's cards are listed by the
 * deal (its row only counts them: one per player would say who got which by what's on each).
 */
export function listedCards(game: CardGame, session: Pick<Session, 'cards' | 'currentRound' | 'phase' | 'currentClue'>): SentCard[] {
  return cardsOut(game, session).filter((c) => !c.deal);
}

/**
 * The cards that are over go: their round ended, their tile closed, or the card made in the editor (a tile's or a
 * 🤫 Card) was deleted. Called where the open clue or the round changes (backToBoard, goToRound, backToLastRound,
 * rebaseSession) and on loading a save.
 */
export function dropOverCards(game: CardGame, session: Session): void {
  if (!session.cards) return;
  const kept = session.cards.filter((c) => stillOut(game, session, c));
  if (kept.length !== session.cards.length) session.cards = kept;
  tidy(session);
}

/** A player taken out: they're dropped from every card (one sent only to them is taken back). */
export function dropSeatFromCards(session: Session, seat: Id): void {
  if (!session.cards) return;
  session.cards = session.cards.flatMap((c) => {
    const to = c.to.filter((t) => t.seat !== seat);
    return to.length === c.to.length ? [c] : to.length ? [{ ...c, to }] : [];
  });
  tidy(session);
}

export interface CardToSend {
  /** Who gets it (players' seats, or one person on a team). */
  to: CardTo[];
  /**
   * A tile's card (by its clue and card ids), a card from 🤫 Cards (by its id), or a card made here (its slide: a copy
   * is kept).
   */
  content: SentCard['content'];
  /** How long it lasts: until this round ends, until the open tile closes, or until taken back. */
  until: SentCard['until'];
}

/**
 * 📤 Send (🤫 Send a card…, or a tile's panel): the card goes to `to` now, as a new card with the next label. Null when
 * there's nobody to send it to, or nothing to send (a tile's card deleted, no tile open for a card that lasts until it
 * closes, no round for one that lasts the round), or when `full`: the buzzer room has all the cards it takes (buzz.ts
 * roomCardsFull, which the callers ask: the room is never told a card by leaving an older one off).
 */
export function sendCard(game: CardGame, session: Session, card: CardToSend, now = Date.now(), full = false): SentCard | null {
  if (full) return null;
  const to = cleanTo(session, card.to);
  // (A plain copy: the slide may be the dialog's live state.)
  const k = card.content;
  const content: SentCard['content'] = 'slide' in k ? { slide: JSON.parse(JSON.stringify(k.slide)) } : 'saved' in k ? { saved: k.saved } : { clue: k.clue, card: k.card };
  const slide = sentSlide(game, { content });
  if (!to.length || !slide) return null;
  const round = card.until === 'round' ? roundNow(game, session) : undefined;
  const tile = card.until === 'tile' ? tileNow(game, session) : undefined;
  if ((card.until === 'round' && !round) || (card.until === 'tile' && !tile)) return null;
  const sent: SentCard = {
    id: newId(),
    at: now,
    label: nextLabel(session),
    to,
    content,
    hash: cardHash(slide),
    until: card.until,
    ...(round ? { round } : {}),
    ...(tile ? { tile } : {}),
  };
  // (A new list, not a push: `session` may be the app's live state, which sees an assignment.)
  session.cards = [...(session.cards ?? []), sent];
  session.lastCard = labelNo(sent.label);
  return sent;
}

/**
 * ↻ Send again: the card goes again under a new id, to the players it's out to now (a phone that came late for it gets
 * it), with what's on it now. Returns whether it went.
 */
export function sendCardAgain(game: CardGame, session: Session, id: Id, now = Date.now()): boolean {
  const c = session.cards?.find((x) => x.id === id);
  const slide = c && sentSlide(game, c);
  const to = c ? cleanTo(session, c.to) : [];
  if (!c || !slide || !to.length) return false;
  const again: SentCard = { ...c, to, at: Math.max(now, c.at + 1), hash: cardHash(slide) };
  session.cards = session.cards!.map((x) => (x.id === id ? again : x));
  return true;
}

/** ✖ Take back: the card goes from every phone it was sent to. */
export function takeBackCard(session: Session, id: Id): void {
  if (!session.cards) return;
  session.cards = session.cards.filter((c) => c.id !== id);
  tidy(session);
}

/**
 * Who a tile's card goes to by default on any tile but a partner clue (TILE_GOES_TO): whoever picked it (a Daily
 * Double's player), everyone else, or nobody yet.
 */
export function tileRecipients(session: Pick<Session, 'players' | 'dd' | 'currentPickerId'>, card: Pick<ClueCard, 'to'>): CardTo[] {
  const who = session.dd ? session.dd.playerId : session.currentPickerId;
  if (card.to === 'picker') return session.players.filter((p) => p.id === who).map((p) => ({ seat: p.id }));
  if (card.to === 'others') return session.players.filter((p) => p.id !== who).map((p) => ({ seat: p.id }));
  return [];
}

/** Who a card went to, in words ("Ann, Bob", "Mia (Red Team)"): names only, never what's on it. */
export function sentToText(session: Pick<Session, 'players'>, to: CardTo[], teams = false): string {
  const name = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  return to.map((t) => (t.member ? `${t.member.name}${teams ? ` (${name(t.seat)})` : ''}` : t.except?.length ? `the rest of ${name(t.seat)}` : name(t.seat))).join(', ') || 'nobody';
}

// ---------- A card made in 🤫 Send a card… ----------

/** Teams: one person on a team as a recipient (their chip in 🤫 Send a card…). */
export const memberTo = (seat: Id, m: TeamMember): CardTo => ({ seat, member: { id: m.id, name: m.name } });

/**
 * A link as an item on a card: a YouTube, Streamable or Drive video in its site's player, else a picture, video or
 * sound played from the link (a picture when the link doesn't say). Words for the host when it won't work.
 */
export function linkItem(raw: string): SlideElement | string {
  const link = parseMediaLink(raw.trim());
  if (!link) return 'That isn’t a web link';
  if (isLinkProblem(link)) return link.message;
  if (link.noLive) return link.noLive.message;
  if (link.embed) {
    const el = newEmbedEl(link.source, link.embed);
    if (link.embed === 'youtube') el.startAt = youtubeStart(link.source);
    return el;
  }
  if (link.drive) return newEmbedEl(link.source, 'drive');
  const kind = link.kindHint ?? 'image';
  return newEmbedEl(link.playUrls[0] ?? link.source, kind === 'video' ? 'remoteVideo' : kind === 'audio' ? 'remoteAudio' : 'remoteImage');
}

/** A file from the game's 🖼 Media as an item on a card. */
export function fileItem(ref: Pick<MediaRef, 'id' | 'kind'>): SlideElement | null {
  return ref.kind === 'image' ? newImageEl(ref.id) : ref.kind === 'video' ? newVideoEl(ref.id) : ref.kind === 'audio' ? newAudioEl(ref.id) : null;
}

/**
 * A card made in 🤫 Send a card…: its words at the top and its items under them, in order (a phone shows a card as words
 * then items, by where they sit: phonecard.ts).
 */
export function quickSlide(words: string, items: SlideElement[] = []): Slide {
  const els: SlideElement[] = [];
  if (words.trim()) els.push(newTextEl(words.trim(), { x: 120, y: 60, w: SLIDE_W - 240, h: 300 }));
  items.forEach((it, i) => els.push({ ...it, y: 400 + i * 10 }));
  return { background: {}, elements: els };
}

// ---------- Loading a save ----------

/** Saved cards that aren't well-formed are dropped (never widened): a damaged save sends nothing it didn't send. */
export function repairSentCards(session: Session): void {
  const c = session.cards as unknown;
  if (c === undefined) return;
  const isMember = (m: unknown) => typeof m === 'object' && !!m && typeof (m as TeamMember).id === 'string' && typeof (m as TeamMember).name === 'string';
  const okTo = (to: unknown) =>
    Array.isArray(to) &&
    to.length > 0 &&
    to.every((t) => typeof t?.seat === 'string' && (t.member === undefined || isMember(t.member)) && (t.except === undefined || (Array.isArray(t.except) && t.except.every((x: unknown) => typeof x === 'string'))));
  // (Each shape tested in the order sentSlide reads them: `{ saved, slide: 5 }` is a damaged slide, not a 🤫 Card.)
  const okContent = (x: unknown) => {
    if (typeof x !== 'object' || !x) return false;
    const k = x as { slide?: unknown; saved?: unknown; clue?: unknown; card?: unknown };
    if ('slide' in k) return typeof k.slide === 'object' && !!k.slide && Array.isArray((k.slide as Slide).elements);
    if ('saved' in k) return typeof k.saved === 'string';
    return typeof k.clue === 'string' && typeof k.card === 'string';
  };
  const until = ['round', 'tile', 'host'];
  const kept = (Array.isArray(c) ? c : []).filter(
    (x): x is SentCard =>
      typeof x === 'object' &&
      !!x &&
      typeof x.id === 'string' &&
      Number.isFinite(x.at) &&
      typeof x.label === 'string' &&
      // (A 🎭 deal's cards are labelled by the deal.)
      (x.deal === undefined ? /^Card \d+$/.test(x.label) : typeof x.deal === 'string') &&
      (x.role === undefined || typeof x.role === 'string') &&
      typeof x.hash === 'string' &&
      until.includes(x.until) &&
      (x.until !== 'round' || typeof x.round === 'string') &&
      (x.until !== 'tile' || typeof x.tile === 'string') &&
      okTo(x.to) &&
      okContent(x.content),
  );
  if (kept.length) session.cards = kept;
  else delete session.cards;
  if (session.lastCard !== undefined && !(Number.isSafeInteger(session.lastCard) && session.lastCard > 0)) delete session.lastCard;
  tidy(session);
}
