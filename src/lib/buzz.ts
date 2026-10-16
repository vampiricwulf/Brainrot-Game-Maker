// Buzzer mode's state during a clue: whether the buzzers are open, who is answering, who already missed it. The host
// decides all of it (keys, the host panel, a phone's buzz that the buzzer room let through); it lives in Live, so the
// audience window shows "🔔 Ann is answering", and the phones get it through hostState().
import { CARD_HINT_MAX, CARDS_BYTES, CARDS_MAX, clip, WAGER_MAX, type BuzzPhase, type HostCard, type HostState, type WagerAsk, type AnswerAsk } from './buzzproto';
import { categoryLabel, finalName, formatPoints, PARTNER_GAMES, roundName, type CardSend, type CardTo, type Game, type Id, type PartnerState, type Session, type Slide, type TextEl } from './model';
import {
  cardHash, cardId, cardLines, cardSlides, describer, giverLine, partnerRoles, partnerRules, partnerVerdict, partOfTo, partsLine, partWords, resultLine, type CardPart,
} from './partner';
import { cardWords, clipWords, phoneCard, type PhoneCan } from './phonecard';
import { cardsOut, sentCardId, sentSlide } from './sentcards';
import { clueMarks, currentClueInfo, currentFinal, ddCap, finalWagerCap, score, shownQuestionSlide, tiedForFirst, wagerFromPhone } from './session';

export interface BuzzState {
  phase: BuzzPhase;
  /** Goes up by one each time the buzzers open (a phone's buzz names the opening it was for). */
  armId: number;
  /** Who is answering (phase 'answering'). */
  answering: Id | null;
  /** Players who already missed this clue: they can't buzz again until 0 opens the buzzers for everyone. */
  lockedOut: Id[];
  /** Phone buzzers: a tie the host rolled for, in roll order (answering first). Dropped by any other change. */
  rollOrder?: Id[];
  /** Answered right: the clue is over (phones say who got it, not "Get ready"). Dropped by any other change. */
  done?: boolean;
  doneBy?: Id | null;
  /**
   * Teams (⚙ Teams on the 📱 card): who on the answering team buzzed (their own name, from their phone), so the host and
   * viewers see "Ann (Red team)". Left out when nobody did (the host picked the team) or teams are off.
   */
  by?: string;
}

/** A place in the buzz order: a player (team) id, or (teams) with the name of the team member who buzzed. */
export type QueuedId = Id | { id: Id; by?: string };

/** Teams are on: each player is a team that any number of phones join (the 📱 card's Teams). */
export const teamsOn = (settings: { buzzTeams?: boolean }): boolean => !!settings.buzzTeams;

/** Who buzzed, as the host and viewers see it: "Ann (Red team)" for a team member, else the player's name. */
export const whoBuzzed = (name: string, by?: string | null): string => (by ? `${by} (${name})` : name);

/**
 * The buzz order with each player (team) once, fastest first: a teammate's later buzz never counts as another place.
 * (The buzzer room already sends it so; this keeps the host's side right whatever it is given.)
 */
export function buzzOrder(queue: QueuedId[]): { id: Id; by?: string }[] {
  const seen = new Set<Id>();
  const out: { id: Id; by?: string }[] = [];
  for (const q of queue) {
    const e = typeof q === 'string' ? { id: q } : q;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e.by ? { id: e.id, by: e.by } : { id: e.id });
  }
  return out;
}

export function newBuzz(armId = 0): BuzzState {
  return { phase: 'lobby', armId, answering: null, lockedOut: [] };
}

/** No clue to buzz on (the board, a Daily Double, another round): nothing open, nobody locked out. */
export function buzzIdle(b: BuzzState): BuzzState {
  return { phase: 'lobby', armId: b.armId, answering: null, lockedOut: [] };
}

/** A tile opened: nobody is locked out; the buzzers open now, or (`armNow` false) once the host opens them. */
export function buzzClueOpened(b: BuzzState, armNow: boolean): BuzzState {
  return armNow ? { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [] } : { phase: 'closed', armId: b.armId, answering: null, lockedOut: [] };
}

/** Open the buzzers (for everyone not locked out). With everyone locked out they stay closed. */
export function buzzArm(b: BuzzState, players: Id[]): BuzzState {
  const left = players.filter((id) => !b.lockedOut.includes(id));
  if (players.length && !left.length) {
    const { by: _by, ...rest } = b;
    return { ...rest, phase: 'closed', answering: null };
  }
  return { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [...b.lockedOut] };
}

/** 0: everyone may buzz again (the locked-out players too). */
export function buzzReset(b: BuzzState): BuzzState {
  return { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [] };
}

/**
 * Player `id` buzzed in: they answer. Null when it doesn't count: someone is answering already, or they missed this clue.
 * `force` (the host picked them) skips both checks. `by` (teams): the team member who buzzed for team `id`.
 */
export function buzzTake(b: BuzzState, id: Id, force = false, by?: string): BuzzState | null {
  if (!force && (b.phase === 'answering' || b.phase === 'lobby' || b.lockedOut.includes(id))) return null;
  return { phase: 'answering', armId: b.armId, answering: id, lockedOut: [...b.lockedOut], ...(by ? { by } : {}) };
}

/**
 * The one answering got it wrong: they're locked out (teams: the whole team, whoever on it buzzed). The next in the
 * clue's buzz order (`queue`, fastest first) who hasn't missed it answers now; with nobody left in it, the buzzers open
 * again for the rest (a rebound).
 */
export function buzzMissed(b: BuzzState, id: Id, players: Id[], queue: QueuedId[] = []): BuzzState {
  const lockedOut = b.lockedOut.includes(id) ? [...b.lockedOut] : [...b.lockedOut, id];
  const next = buzzOrder(queue).find((q) => !lockedOut.includes(q.id) && players.includes(q.id));
  if (next) return { phase: 'answering', armId: b.armId, answering: next.id, lockedOut, ...(next.by ? { by: next.by } : {}) };
  return buzzArm({ ...b, answering: null, lockedOut }, players);
}

/** Answered right: the buzzers close for this clue (0 opens them again). */
export function buzzDone(b: BuzzState): BuzzState {
  return { phase: 'closed', armId: b.armId, answering: null, lockedOut: [...b.lockedOut], done: true, doneBy: b.answering };
}

/** The question slide's words, for the phones: text boxes only, top to bottom, none hidden from viewers. */
export function questionText(s: Slide | undefined): string {
  if (!s) return '';
  // (Not text viewers can't see yet either: see-through, or coming in seconds later, like a hint.)
  const texts = s.elements.filter((e): e is TextEl => e.kind === 'text' && !e.secret && e.opacity > 0 && (e.entrance?.delay ?? 0) <= 2 && !!e.text.trim());
  texts.sort((a, b) => a.y - b.y || a.x - b.x);
  return texts
    .map((t) => t.text.trim())
    .join('\n')
    .slice(0, 500);
}

/** A 🤫 card's words for the phones: every text box, top to bottom (one hidden from viewers too), cut at 1000 characters. */
export function cardText(s: Slide): string {
  return clipWords(cardWords(s));
}

/** The phones' status line while the host is back in the editor with the room kept open. */
export const SETTING_UP = 'The host is setting up — hang on';

/**
 * A short line for the phones about what's on screen when nobody buzzes: the round starting, who picks, a Daily Double
 * (its player sees "you're up"), a partner clue (who plays which part), a Final, an RPG or board game round, the end.
 * Null during an ordinary clue. `room.cards`: the buzzer room takes cards, so its phones also grey their button and
 * show a small line under the big one (status.off, sub, seatsSub) on a partner clue.
 */
export function phoneStatus(game: Game, session: Session, pregame = false, room: { cards: boolean } = { cards: false }): HostState['status'] {
  if (pregame) return { text: 'The game starts soon' };
  const nameOf = (id?: Id | null) => (id ? session.players.find((p) => p.id === id)?.name : undefined);
  const round = game.rounds[session.currentRound];
  if (session.phase === 'clue' && session.dd) {
    const id = session.dd.playerId;
    const who = nameOf(id);
    return who && id ? { text: `Daily Double: ${who}`, seats: [id], seatsText: 'Daily Double — you’re up!' } : { text: 'Daily Double!' };
  }
  if (session.phase === 'clue' && session.partner) return room.cards ? partnerStatusOff(game, session, session.partner) : partnerStatus(game, session, session.partner);
  if (session.intro?.stage === 'title' && round) return { text: `${roundName(round, session.currentRound)} is starting` };
  switch (session.phase) {
    case 'board': {
      const id = session.currentPickerId;
      const who = nameOf(id);
      return who && id ? { text: `${who} picks the next clue`, seats: [id], seatsText: 'Your pick! Tell the host which clue' } : null;
    }
    case 'final': {
      const f = currentFinal(session, game);
      const n = f ? finalName(f) : 'Final';
      // Its category is on screen from the wagers on, so the phones say it too.
      const cat = f?.category?.trim();
      if (cat) return { text: `${n} · ${cat}` };
      // (During the wagers each phone in it shows its wager box under this, which says so.)
      return { text: n };
    }
    case 'rpg':
    case 'boardgame':
    case 'slides':
      return round ? { text: roundName(round, session.currentRound) } : null;
    case 'tiebreaker':
      return { text: 'Tiebreaker!' };
    case 'end':
      return { text: 'Game over: thanks for playing!' };
  }
  return null;
}

/**
 * A 🤝 partner clue's line for the phones (partner-clues spec §19.4, with a room that takes no cards): who plays which
 * part, under each player's name, then how it went once it's judged. The picker's phone and the giver's say what's
 * theirs. Never what's on a card.
 */
function partnerStatus(game: Game, session: Session, s: PartnerState): HostState['status'] {
  const clue = currentClueInfo(session, game)?.clue;
  const rules = partnerRules(clue ?? {});
  const team = teamsOn(game.settings);
  const nameOf = (id?: Id) => (id ? session.players.find((p) => p.id === id)?.name : undefined);
  const here = (id?: Id): id is Id => !!nameOf(id);
  const line = (t: string) => clip(t, 120);
  const picker = here(s.pickerId) ? s.pickerId : undefined;
  if (!picker) return { text: '🤝 Partner clue!' };
  const { giver, guesser, solo } = partnerRoles(s);
  const paired = here(s.partnerId);
  if (s.stage === 'pick') {
    if (!paired) return { text: line(`🤝 Partner clue: ${nameOf(picker)} needs a partner…`), seats: [picker], seatsText: line(`🤝 ${team ? 'Your team’s' : 'Your'} partner clue! Spinning for your partner…`) };
    if (solo) return { text: line(`🤝 Partner clue: ${nameOf(picker)} plays it alone`), seats: [picker], seatsText: line(`🤝 ${team ? 'Your team plays' : 'You play'} this one alone!`) };
    return { text: line(`🤝 Partner clue: ${nameOf(picker)} + ${nameOf(s.partnerId)}`), seats: [picker, s.partnerId!], seatsText: line(`🤝 ${team ? 'Your team plays' : 'You two play'} this one!`) };
  }
  if (!paired) return { text: line(`🤝 Partner clue: ${nameOf(picker)}`) };
  const names = { giver: nameOf(giver), guesser: nameOf(guesser), solo };
  // Judged (both marked since the tile opened), until the answer shows: how it went, for everyone.
  const marks = clueMarks(session, s.clue, s.at ?? 0);
  if (!session.revealed && partnerVerdict(s, marks).judged) return { text: line(resultLine(s, marks, (id) => nameOf(id) ?? '?', game.settings.currencySymbol)) };
  const text = line(`🤝 ${partsLine(rules, names, { past: session.revealed })}`);
  if (session.revealed || solo || !here(giver)) return { text };
  return { text, seats: [giver], seatsText: line(giverLine(rules, team)) };
}

/** What each part is doing, for the guesser's phone: "Bob is describing", "Bob is drawing". */
const DOING_NOW: Record<keyof typeof PARTNER_GAMES, string> = {
  describe: 'is describing',
  draw: 'is drawing',
  act: 'is acting it out',
  help: 'is helping',
  split: 'has half A',
  custom: 'is giving the clues',
};

/**
 * A 🤝 partner clue's lines for a room that takes cards (partner-clues spec §8.2, §19.4): every phone's button greyed
 * (off) from the tile opening until it closes, with who plays which part as the big line and what's going on as the
 * small one; the picker's phone (then the two, then the guesser's) says what's theirs. Never what's on a card: a card
 * goes to its phones as a card (HostState.cards).
 */
function partnerStatusOff(game: Game, session: Session, s: PartnerState): HostState['status'] {
  const clue = currentClueInfo(session, game)?.clue;
  const rules = partnerRules(clue ?? {});
  const team = teamsOn(game.settings);
  const nameOf = (id?: Id) => (id ? session.players.find((p) => p.id === id)?.name : undefined);
  const here = (id?: Id): id is Id => !!nameOf(id);
  const line = (t: string) => clip(t, 120);
  const off = (text: string, sub?: string, seats?: { ids: Id[]; text: string; sub?: string }): HostState['status'] => ({
    text: line(text),
    off: true,
    ...(sub ? { sub: line(sub) } : {}),
    ...(seats ? { seats: seats.ids, seatsText: line(seats.text), ...(seats.sub ? { seatsSub: line(seats.sub) } : {}) } : {}),
  });
  const picker = here(s.pickerId) ? s.pickerId : undefined;
  if (!picker) return off('🤝 Partner clue!', 'Nobody buzzes on this one');
  const { giver, guesser, solo } = partnerRoles(s);
  const paired = here(s.partnerId);
  // Teams: one person on the picker's team describes to the rest (spec §10.2). The team's line goes to every phone on
  // it, the describer's too, so it says who describes; their part is on their cards.
  const m = team ? describer(s) : undefined;
  if (m) {
    const names = { giver: m.name, guesser: nameOf(picker) };
    const marks = clueMarks(session, s.clue, s.at ?? 0);
    if (s.stage !== 'pick' && !session.revealed && partnerVerdict(s, marks).judged) return off(resultLine(s, marks, (id) => nameOf(id) ?? '?', game.settings.currencySymbol));
    const text = `🤝 ${partsLine(rules, names, { past: session.revealed })}`;
    if (session.revealed) return off(text);
    const then = s.stage === 'pick' ? 'wait for the question' : rules.typeGuess ? 'type your guess' : 'say it out loud';
    return off(text, 'Nobody buzzes on this one', { ids: [picker], text: '🤝 Your team plays this one!', sub: `${m.name} ${DOING_NOW[rules.game]}: ${then}` });
  }
  if (s.stage === 'pick') {
    if (!paired) return off('🤝 Partner clue', `${nameOf(picker)} needs a partner…`, { ids: [picker], text: `🤝 ${team ? 'Your team’s' : 'Your'} partner clue!`, sub: 'Spinning for your partner…' });
    // (Teams: the picker's own team plays it, one of them describing once the host has chosen who: §10.2.)
    if (solo && team) return off('🤝 Partner clue', `${nameOf(picker)} plays it`, { ids: [picker], text: '🤝 Your team plays this one!', sub: 'Wait for the question' });
    if (solo) return off('🤝 Partner clue', `${nameOf(picker)} plays it alone`, { ids: [picker], text: '🤝 You play this one alone!', sub: 'Wait for the question' });
    return off(`🤝 ${nameOf(picker)} + ${nameOf(s.partnerId)}`, 'Partner clue: nobody buzzes', { ids: [picker, s.partnerId!], text: `🤝 ${team ? 'Your team plays' : 'You two play'} this one!`, sub: 'Wait for the question' });
  }
  if (!paired) return off(`🤝 Partner clue: ${nameOf(picker)}`, 'Nobody buzzes on this one');
  const names = { giver: nameOf(giver), guesser: nameOf(guesser), solo };
  const marks = clueMarks(session, s.clue, s.at ?? 0);
  if (!session.revealed && partnerVerdict(s, marks).judged) return off(resultLine(s, marks, (id) => nameOf(id) ?? '?', game.settings.currencySymbol));
  const text = `🤝 ${partsLine(rules, names, { past: session.revealed })}`;
  if (session.revealed) return off(text);
  if (solo || !here(guesser) || !here(giver)) return off(text, 'Nobody buzzes on this one');
  const typed = !!rules.typeGuess;
  return off(text, 'Nobody buzzes on this one', {
    ids: [guesser],
    text: `🎯 ${team ? 'Your team is' : 'You’re'} guessing!`,
    sub: `${nameOf(giver)} ${DOING_NOW[rules.game]}: ${typed ? 'type your guess' : 'say it out loud'}`,
  });
}

/**
 * The open 🤝 partner clue's cards as the buzzer room gets them (partner-clues spec §14.9, §19.1): built only from what
 * the host sent (session.partner.sent), to exactly its recipients still in the game. Never the clue's cards by
 * themselves. A send whose card was edited since (its hash) is left out, so a phone never shows what the host didn't
 * send. One card per send, or, for a send to more than one part (the describer and someone else, say), one per part
 * with its own lines (its id `<send>~g`, `~q`, `~o` or `~p`: sendOf), each marked shared; which a phone has stays as it
 * was sent (CardTo.part). While one person on the picker's team describes to the rest, the rest of the team gets a
 * line with the describer's card and nothing of it (`<send>~t`). Open (not "The answer's on screen") until the answer
 * shows. `room`: the files the room holds (null: it takes none). Null when nothing is out.
 */
export function partnerCards(game: Game, session: Session, room: PhoneCan): HostCard[] | null {
  const s = session.partner;
  const clue = session.phase === 'clue' ? currentClueInfo(session, game)?.clue : undefined;
  if (!s?.sent?.length || !clue || clue.id !== s.clue) return null;
  const rules = partnerRules(clue);
  const nameOf = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  const wire = (t: CardTo): HostCard['to'][number] => ({ seat: t.seat, ...(t.member ? { member: t.member.id } : t.except?.length ? { except: [...t.except] } : {}) });
  const out: HostCard[] = [];
  /** The describer's card went out, and the rest of their team has had no card of this clue: their line goes with it. */
  let roleFor: { send: CardSend; to: CardTo } | null = null;
  let restHas = false;
  for (const send of s.sent) {
    const card = cardSlides(clue).find((c) => c.id === send.card);
    if (!card || cardHash(card) !== send.hash) continue;
    const to = send.to.filter((t) => session.players.some((p) => p.id === t.seat));
    if (!to.length) continue;
    const pc = phoneCard(game, card, room);
    const id = cardId(clue.id, send);
    const groups: { part: CardPart; to: CardTo[] }[] = [];
    for (const t of to) {
      const part = t.part ?? partOfTo(s, t);
      const g = groups.find((x) => x.part === part);
      if (g) g.to.push(t);
      else groups.push({ part, to: [t] });
    }
    for (const g of groups)
      out.push({
        id: groups.length > 1 ? `${id}~${PART_ID[g.part]}` : id,
        to: g.to.map(wire),
        open: !session.revealed,
        ...cardLines(rules, s, card, g.to, nameOf),
        ...(groups.length > 1 ? { shared: true } : {}),
        ...(pc.title ? { title: pc.title } : {}),
        ...(pc.text ? { text: pc.text } : {}),
        ...(pc.media.length ? { media: pc.media } : {}),
      });
    const one = to.find((t) => t.member && t.seat === s.pickerId);
    if (one && !roleFor) roleFor = { send, to: one };
    if (to.some((t) => !t.member && t.seat === s.pickerId)) restHas = true;
  }
  if (roleFor && !restHas && roleFor.to.member) {
    const m = roleFor.to.member;
    out.push({
      id: `${cardId(clue.id, roleFor.send)}~t`,
      to: [{ seat: roleFor.to.seat, except: [m.id] }],
      open: !session.revealed,
      role: partWords(rules).guesser,
      hint: clip(`🎯 Your team is guessing! ${m.name} ${DOING_NOW[rules.game]}`, CARD_HINT_MAX),
      tap: false,
    });
  }
  return out.length ? fitCards(out.slice(-CARDS_MAX)) : null;
}

/**
 * The 🤫 cards the host sent with 🤫 Send a card… or from a tile's panel (Session.cards, partner-clues spec §12) as the
 * buzzer room gets them: those still out, to exactly their recipients still in the game. A tile's card edited in the
 * editor since it went is left out (its hash), so a phone never shows what the host didn't send. One on a tile says
 * "The answer's on screen" once the answer shows. `room`: the files the room holds (null: it takes none). Null when
 * none are out.
 */
export function sessionCards(game: Game, session: Session, room: PhoneCan): HostCard[] | null {
  const out: HostCard[] = [];
  for (const c of cardsOut(game, session)) {
    const slide = sentSlide(game, c);
    if (!slide || cardHash(slide) !== c.hash) continue;
    const to = c.to.filter((t) => session.players.some((p) => p.id === t.seat));
    if (!to.length) continue;
    const pc = phoneCard(game, slide, room);
    out.push({
      id: sentCardId(c),
      to: to.map((t) => ({ seat: t.seat, ...(t.member ? { member: t.member.id } : t.except?.length ? { except: [...t.except] } : {}) })),
      open: c.until !== 'tile' || !session.revealed,
      ...(pc.title ? { title: pc.title } : {}),
      ...(pc.text ? { text: pc.text } : {}),
      ...(pc.media.length ? { media: pc.media } : {}),
    });
  }
  return out.length ? out : null;
}

/**
 * Every 🤫 card the buzzer room gets now: the open partner clue's sends (partnerCards) and the cards sent with
 * 🤫 Send a card… or from a tile's panel (sessionCards), at most CARDS_MAX (the newest) in CARDS_BYTES. Null when none
 * are out.
 */
export function hostCards(game: Game, session: Session, room: PhoneCan): HostCard[] | null {
  const all = [...(partnerCards(game, session, room) ?? []), ...(sessionCards(game, session, room) ?? [])];
  return all.length ? fitCards(all.slice(-CARDS_MAX)) : null;
}

/** How many 🤫 cards the buzzer room is told now: the open partner clue's (one per part of a send) and the cards out. */
export function roomCardCount(game: Game, session: Session): number {
  return (partnerCards(game, session, { files: {} })?.length ?? 0) + (sessionCards(game, session, { files: {} })?.length ?? 0);
}

/**
 * The room is told CARDS_MAX cards at most, so a send that would take it past that is refused, never made by leaving
 * an older card off the phones: that card would come back under its old id once another went, and the room, which
 * forgot it meanwhile, would give it to a phone that came after it was sent (the late rule, partner-clues spec §14.4).
 * `go`: the send, made on a copy of the session (a partner clue's send can be one card per part); without it, one card.
 * A send that adds nothing (↻ Send again) is never refused.
 */
export function roomCardsFull(game: Game, session: Session, go?: (trial: Session) => void): boolean {
  const now = roomCardCount(game, session);
  if (!go) return now + 1 > CARDS_MAX;
  const trial: Session = { ...session, partner: session.partner ? JSON.parse(JSON.stringify(session.partner)) : session.partner, cards: session.cards ? [...session.cards] : session.cards };
  go(trial);
  const after = roomCardCount(game, trial);
  return after > CARDS_MAX && after > now;
}

/** Why a send is refused when the room has all the cards it takes (the button's title, and the toast). */
export const CARDS_FULL = `${CARDS_MAX} cards are out on the phones: ✖ Take one back first`;

/** The last bit of a card's id on the wire for each part, when a send goes as one card per part (partnerCards). */
const PART_ID: Record<CardPart, string> = { giver: 'g', guesser: 'q', other: 'o', solo: 'p' };

/** The send a card on the wire is (cardId): one per part (`~g`…) and the team's line (`~t`) are parts of their send's. */
export const sendOf = (wireId: string): string => wireId.replace(/~[gqopt]$/, '');

const jsonBytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/**
 * Cards that fit the room's CARDS_BYTES: over it, media go first (from the newest send back: { missing }, "the host
 * will show you this"), then words are cut, then the newest cards are left out. (The room does the same; doing it here
 * keeps the oldest sends whole.)
 */
export function fitCards(cards: HostCard[]): HostCard[] {
  const out = cards.map((c) => ({ ...c, ...(c.media ? { media: [...c.media] } : {}) }));
  for (let i = out.length - 1; i >= 0 && jsonBytes(out) > CARDS_BYTES; i--) {
    const media = out[i].media ?? [];
    for (let j = media.length - 1; j >= 0 && jsonBytes(out) > CARDS_BYTES; j--) media[j] = { kind: media[j].kind === 'embed' ? 'video' : (media[j].kind as 'image' | 'video' | 'audio'), missing: true };
  }
  for (let i = out.length - 1; i >= 0 && jsonBytes(out) > CARDS_BYTES; i--) if (out[i].text) out[i].text = clip(out[i].text!, 200);
  while (out.length && jsonBytes(out) > CARDS_BYTES) out.pop();
  return out;
}

/**
 * A partner clue's typed guesses are one round per play of the tile (when it opened), not per clue: a tile put back or
 * reopened and played again starts with no guess (partner-clues spec §15.1). Undo and a reload keep it.
 */
export const partnerAnswerId = (s: Pick<PartnerState, 'clue' | 'at'>): string => `${s.clue}@${s.at ?? 0}`;

/**
 * The guesser's ✍ box on a partner clue whose guesser types their guess (PartnerRules.typeGuess): their seat only, from
 * the question on (never during PARTNER UP!, so the question's words reach phones no earlier than the stream shows
 * them), until the answer shows or it's judged. `got`: the guesses the host took (Session.remote.answers).
 */
export function partnerAnswerAsk(game: Game, session: Session, got: Record<Id, { n: number }> = {}): AnswerAsk | null {
  const s = session.partner;
  const clue = session.phase === 'clue' ? currentClueInfo(session, game)?.clue : undefined;
  if (!s || !clue || clue.id !== s.clue || s.stage === 'pick' || !partnerRules(clue).typeGuess) return null;
  const { guesser } = partnerRoles(s);
  if (!guesser || !session.players.some((p) => p.id === guesser)) return null;
  const judged = partnerVerdict(s, clueMarks(session, s.clue, s.at ?? 0)).judged;
  return { id: partnerAnswerId(s), open: !session.revealed && !judged, seats: [{ id: guesser, ...(got[guesser] ? { got: got[guesser].n } : {}) }] };
}

/**
 * The wagers phones may send now (HostState.wager), or null: a Daily Double's player before the question shows (locked
 * once it's up), the Final's players on its wager screen (locked through the question and the answer). Each with their
 * max (held to it only when the host turned the limits on: `limitsOff` false), the wager the host has for them, and
 * `got`: the last phone wager the host took for each (Session.remote.wagerGot), `gotAmounts` how much it was.
 */
export function wagerAsk(
  game: Game,
  session: Session,
  limitsOff: boolean,
  got: Record<Id, number> = {},
  gotAmounts: Record<Id, number> = {},
): WagerAsk | null {
  const here = (id: Id | undefined): id is Id => !!id && session.players.some((p) => p.id === id);
  const cap = (n: number) => Math.max(0, Math.min(WAGER_MAX, Math.floor(n)));
  const seat = (id: Id, max: number, amount: number | undefined, fromHost: boolean) => ({
    id,
    max: cap(max),
    ...(typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && amount <= WAGER_MAX ? { amount, ...(fromHost ? { fromHost: true } : {}) } : {}),
    ...(got[id] ? { got: got[id] } : {}),
  });
  const limit = limitsOff ? {} : { limit: true };
  if (session.phase === 'clue' && session.dd) {
    const dd = session.dd;
    const clue = currentClueInfo(session, game)?.clue.id;
    if (!clue || !here(dd.playerId)) return null;
    const open = dd.stage === 'splash';
    const amount = open ? dd.draft : dd.wager;
    return { id: `dd:${clue}:${dd.playerId}`, kind: 'dd', open, ...limit, seats: [seat(dd.playerId, ddCap(session, game, dd.playerId), amount, dd.draftFrom !== 'phone')] };
  }
  const f = session.final;
  const r = currentFinal(session, game);
  if (session.phase === 'final' && f && r && f.roundId === r.id && session.intro?.stage !== 'title') {
    const step = session.finalStep ?? 'wagers';
    if (step !== 'wagers' && step !== 'question' && step !== 'answer') return null;
    const ids = f.players.filter(here);
    // A phone's wager put back by an Undo (not the last one it sent): the host's, as the phone should say.
    const host = (id: Id) => !wagerFromPhone(f, id) || (gotAmounts[id] !== undefined && f.wagers[id] !== gotAmounts[id]);
    return { id: `final:${r.id}`, kind: 'final', open: step === 'wagers' && !f.phonesLocked, ...limit, seats: ids.map((id) => seat(id, finalWagerCap(session, id), f.wagers[id], host(id))) };
  }
  return null;
}

/** A player's name as the phones get it (the room takes 40 characters at most). */
export const SEAT_NAME_MAX = 40;

/**
 * What the buzzer room gets: the players, scores and the buzzers' state, and while a clue is open its question's words
 * and caption (the question slide on screen). Built here only, from a whitelist: never answers, host notes, media or
 * the game's other content, except the cards the host sent (hostCards: built only from session.partner.sent and
 * session.cards, which only the host's presses add to). A card holds whatever the host put on it. `extra`: the phones' status line (phoneStatus), 🔒 locked seats, the wagers
 * and answers phones may send, and those cards (only for a room that takes them).
 */
export function hostState(
  game: Game,
  session: Session,
  b: BuzzState,
  earlyLockMs: number,
  extra: { status?: HostState['status']; locked?: boolean; wager?: WagerAsk | null; answers?: AnswerAsk | null; cards?: HostCard[] | null } = {},
): HostState {
  const info = (b.phase !== 'lobby' || extra.answers) && session.phase === 'clue' ? currentClueInfo(session, game) : null;
  const seats = session.players.map((p) => ({ id: p.id, name: clip(p.name.trim(), SEAT_NAME_MAX), color: p.color }));
  return {
    title: clip(game.title, 200),
    seats,
    // Teams: phones join a team the host made (no new players from phones).
    allowNew: !!game.settings.phoneJoin && !teamsOn(game.settings),
    phase: b.phase,
    armId: b.armId,
    clue: info ? { text: questionText(shownQuestionSlide(session, info.clue)), caption: `${categoryLabel(info.category)} · ${formatPoints(info.value, game.settings.currencySymbol)}` } : null,
    answering: b.phase === 'answering' ? b.answering : null,
    ...(b.phase === 'answering' && b.rollOrder?.length ? { rollOrder: b.rollOrder.filter((id) => seats.some((s) => s.id === id)) } : {}),
    lockedOut: b.phase === 'lobby' ? [] : b.lockedOut.filter((id) => seats.some((s) => s.id === id)),
    earlyLockMs,
    scores: Object.fromEntries(session.players.map((p) => [p.id, score(session, p.id)])),
    // Added later (an older room drops them).
    ...(b.phase === 'closed' && b.done ? { done: { by: b.doneBy && seats.some((s) => s.id === b.doneBy) ? b.doneBy : null } } : {}),
    ...(extra.status?.text ? { status: extra.status } : {}),
    ...(game.settings.currencySymbol ? { currency: game.settings.currencySymbol } : {}),
    ...(extra.locked ? { locked: true } : {}),
    ...(teamsOn(game.settings) ? { teams: true } : {}),
    ...(extra.wager ? { wager: extra.wager } : {}),
    ...(extra.answers ? { answers: extra.answers } : {}),
    ...(extra.cards?.length ? { cards: extra.cards } : {}),
    // (With a tie for first the tiebreaker settled, its winner: the phones rank the players as the end screen does.)
    ...(session.phase === 'end' ? { over: true, ...(session.rollOffWinner && tiedForFirst(session).some((p) => p.id === session.rollOffWinner) ? { winner: session.rollOffWinner } : {}) } : {}),
    ...(!game.settings.phoneColorsOff && !teamsOn(game.settings) ? { colorPick: true } : {}),
    ...(info && session.revealed ? { answerShown: true } : {}),
  };
}

/**
 * The room's state while the host is back in the editor with the room left open (after a reload there, when there's no
 * game on to build it from): the pre-game players in the lobby, and "The host is setting up — hang on".
 */
export function setupState(game: Game, players: Session['players'], armId: number, earlyLockMs: number, locked = false): HostState {
  return {
    title: clip(game.title, 200),
    seats: players.map((p) => ({ id: p.id, name: clip(p.name.trim(), SEAT_NAME_MAX), color: p.color })),
    allowNew: !!game.settings.phoneJoin && !teamsOn(game.settings),
    phase: 'lobby',
    armId,
    clue: null,
    answering: null,
    lockedOut: [],
    earlyLockMs,
    scores: Object.fromEntries(players.map((p) => [p.id, p.startScore ?? 0])),
    status: { text: SETTING_UP },
    ...(game.settings.currencySymbol ? { currency: game.settings.currencySymbol } : {}),
    ...(locked ? { locked: true } : {}),
    ...(teamsOn(game.settings) ? { teams: true } : {}),
  };
}
