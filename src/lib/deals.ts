// 🎭 Deals (partner-clues spec §11, §12.2): secret parts for everyone (🕵 Odd one out, 🐺 Secret roles, 🧢 Team
// captain, 🧠 Everyone's own prompt). The host deals one from 🎭 Deal… in the tools row: each player gets one part, at
// random or as the host picked, and a part's card can show a slice drawn from a saved wheel (each player their own, or
// one shared by everyone but the odd one out). Nothing goes anywhere until the host presses 📤 Send: then each player's
// card goes as a card of its own (Session.cards, one id each), through the same path as 🤫 Send a card… (the late
// rule, files, the card window, the copy buttons). Who got which stays on the host's computer: one window's panel only
// counts the parts, and viewers get nothing of it until the host shows Who was who. No Svelte state: tested in
// deals.test.ts.
import {
  DEAL_PART_MAX,
  DEAL_PARTS_MAX,
  newId,
  newTextEl,
  SLIDE_W,
  textSlide,
  type CardTo,
  type DealHand,
  type DealPart,
  type DealPreset,
  type DealState,
  type Game,
  type Id,
  type SentCard,
  type Session,
  type Slide,
  type WheelSegment,
} from './model';
import type { PhoneInfo } from './buzzproto';
import { cardHash, toKey } from './partner';
import { cardLinks, cardWords } from './phonecard';
import { cardsOut, cleanTo, fileItem, roundNow, sendCardAgain, takeBackCard, type CardGame } from './sentcards';
import { isRespin, random, weightedIndex } from './tools';

// ---------- Ready-made deals ----------

export interface DealTemplate {
  key: string;
  icon: string;
  name: string;
  /** What it's for, in the menus. */
  hint: string;
  /** The ready-made wheel (wheeltemplates.ts) its cards draw from: added to the game with it when it has none like it. */
  wheel?: string;
  perTeam?: boolean;
  parts: { name: string; count: number | 'rest'; words: string; draw?: DealPart['draw'] }[];
}

export const DEAL_TEMPLATES: DealTemplate[] = [
  {
    key: 'spy',
    icon: '🕵',
    name: 'Odd one out',
    hint: 'One spy; everyone else knows the location',
    wheel: 'locations',
    parts: [
      { name: 'Spy', count: 1, words: 'You’re the spy! Work out the location from what the others say, without giving yourself away.' },
      { name: 'Villager', count: 'rest', words: 'The location:', draw: 'shared' },
    ],
  },
  {
    key: 'roles',
    icon: '🐺',
    name: 'Secret roles',
    hint: 'A wolf, a seer, and villagers',
    parts: [
      { name: 'Wolf', count: 1, words: 'You’re the wolf! Each night, choose someone to eat. Don’t get caught.' },
      { name: 'Seer', count: 1, words: 'You’re the seer! Each night, ask the host about one player.' },
      { name: 'Villager', count: 'rest', words: 'You’re a villager. Find the wolf!' },
    ],
  },
  {
    key: 'captain',
    icon: '🧢',
    name: 'Team captain',
    hint: 'One captain on each team, with a secret brief',
    perTeam: true,
    parts: [{ name: 'Captain', count: 1, words: 'You’re the captain! Your secret brief: your team only answers when you say so.' }],
  },
  {
    key: 'prompt',
    icon: '🧠',
    name: 'Everyone’s own prompt',
    hint: 'Each player draws their own slice of a wheel',
    wheel: 'prompts',
    parts: [{ name: 'Player', count: 'rest', words: 'Your secret prompt:', draw: 'own' }],
  },
];

/** A ready-made deal as the game keeps it (its wheel: `wheel`, the game's own one for it, if any). */
export function dealFromTemplate(t: DealTemplate, name = t.name, wheel?: Id): DealPreset {
  return {
    id: newId(),
    name,
    parts: t.parts.map((p) => ({ id: newId(), name: p.name, count: p.count, card: textSlide(p.words), ...(p.draw ? { draw: p.draw } : {}) })),
    ...(wheel ? { wheel } : {}),
    ...(t.perTeam ? { perTeam: true } : {}),
  };
}

/** A new part ("Part 3"), one player, with an empty card. */
export function newDealPart(n: number): DealPart {
  return { id: newId(), name: `Part ${n}`, count: 1, card: textSlide('') };
}

/** A new deal: two parts, one of each and the rest. */
export function newDeal(name = 'New deal'): DealPreset {
  // (Names that read after "You're the": the phone's title.)
  return { id: newId(), name, parts: [{ ...newDealPart(1), name: 'Outsider' }, { ...newDealPart(2), name: 'Insider', count: 'rest' }] };
}

/** A part's name as the phone and the reveal say it ("Part 2" for one left blank). */
export const partName = (p: Pick<DealPart, 'name'>, i: number): string => p.name.trim().slice(0, DEAL_PART_MAX) || `Part ${i + 1}`;

/** "×1", "× the rest". */
export const countText = (count: DealPart['count']): string => (count === 'rest' ? '× the rest' : `×${count}`);

// ---------- Dealing ----------

/** A shuffled copy (Fisher–Yates). */
function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Each once, in order. */
function once(pool: CardTo[]): CardTo[] {
  const seen = new Set<string>();
  return pool.filter((t) => !seen.has(toKey(t)) && !!seen.add(toKey(t)));
}

/** The groups a deal is dealt in: everyone together, or each team on its own (perTeam). */
function groupsOf(pool: CardTo[], perTeam: boolean): CardTo[][] {
  if (!perTeam) return [pool];
  const seats = [...new Set(pool.map((t) => t.seat))];
  return seats.map((s) => pool.filter((t) => t.seat === s));
}

/** The slices a deal's cards can draw: the wheel's, but Spin again. */
function drawable(game: Pick<Game, 'wheels'>, deal: Pick<DealPreset, 'wheel'>): WheelSegment[] {
  const w = deal.wheel ? game.wheels.find((x) => x.id === deal.wheel) : undefined;
  return w ? w.segments.filter((s) => !isRespin(s)) : [];
}

/**
 * What's wrong with a deal as saved, whoever plays it (the editor says it): no part, too many, two parts for "the
 * rest", or a part that draws from a wheel that isn't there or has no slices.
 */
export function dealSetupProblems(game: Pick<Game, 'wheels'>, deal: Pick<DealPreset, 'parts' | 'wheel'>): string[] {
  const out: string[] = [];
  if (!deal.parts.length) out.push('it has no parts');
  if (deal.parts.length > DEAL_PARTS_MAX) out.push(`it has more than ${DEAL_PARTS_MAX} parts`);
  if (deal.parts.filter((p) => p.count === 'rest').length > 1) out.push('only one part can go to “the rest”');
  const draws = deal.parts.filter((p) => p.draw).map((p) => partName(p, deal.parts.indexOf(p)));
  if (draws.length && !drawable(game, deal).length)
    out.push(
      deal.wheel && game.wheels.some((w) => w.id === deal.wheel)
        ? 'its wheel has no slices to draw'
        : `${draws.join(' and ')} ${draws.length > 1 ? 'draw' : 'draws'} from a wheel, but none is chosen`,
    );
  return out;
}

export interface DealOptions {
  /** The host's own picks, by part: those players get that part (a part with a number then goes only to them). */
  picks?: Record<Id, CardTo[]>;
  /** Each team on its own (people on the teams, a captain for each). */
  perTeam?: boolean;
  rand?: () => number;
}

/**
 * Why a deal can't be dealt to `pool` now (plain words), or ''. The parts' numbers (or the host's picks) must fit in
 * the players dealt in (on each team, dealt per team), only one part goes to "the rest", and a part that draws needs a
 * wheel with slices.
 */
export function dealProblem(game: Pick<Game, 'wheels'>, deal: Pick<DealPreset, 'parts' | 'wheel'>, pool: CardTo[], opts: Omit<DealOptions, 'rand'> = {}): string {
  if (!deal.parts.length) return 'Add a part first';
  if (deal.parts.length > DEAL_PARTS_MAX) return `A deal has ${DEAL_PARTS_MAX} parts at most`;
  if (deal.parts.filter((p) => p.count === 'rest').length > 1) return 'Only one part can go to “the rest”';
  const all = once(pool);
  if (!all.length) return 'Choose who’s dealt in first';
  for (const group of groupsOf(all, !!opts.perTeam)) {
    const keys = new Set(group.map(toKey));
    const taken = new Set<string>();
    let need = 0;
    for (const part of deal.parts) {
      const mine = (opts.picks?.[part.id] ?? []).filter((t) => keys.has(toKey(t)) && !taken.has(toKey(t)) && !!taken.add(toKey(t)));
      // (Those picked for "the rest" take a place too.)
      need += part.count === 'rest' || mine.length ? mine.length : part.count;
    }
    if (need > group.length) return `The parts need ${need} player${need === 1 ? '' : 's'}${opts.perTeam ? ' on each team' : ''}: ${group.length} ${group.length === 1 ? 'is' : 'are'} dealt in`;
  }
  const draws = deal.parts.find((p) => p.draw);
  if (draws && !drawable(game, deal).length) {
    const i = deal.parts.indexOf(draws);
    return deal.wheel && game.wheels.some((w) => w.id === deal.wheel) ? 'Its wheel has no slices to draw' : `Choose a wheel for ${partName(draws, i)}’s cards to draw from`;
  }
  return '';
}

/**
 * A part's card as one player gets it: the part's card, then the slice it drew (its words, a little longer text, and
 * its picture, video or sound), in that order on a phone. The slice's words are the biggest on it, so they're the
 * card's big line (phonecard.ts takes the largest short line as the title): the secret to read at arm's length, not
 * "The location:". A copy: changing the deal or the wheel afterwards changes nothing that was dealt.
 */
export function handSlide(game: Pick<Game, 'media'>, card: Slide, slice?: Pick<WheelSegment, 'label' | 'details' | 'media'>): Slide {
  const out: Slide = JSON.parse(JSON.stringify(card));
  if (!slice) return out;
  // (Under everything on the card: a phone shows words by where they sit, then the items.)
  const below = Math.max(0, ...out.elements.map((e) => e.y)) + 1;
  const first = out.elements.find((e) => e.kind === 'text');
  const size = first?.kind === 'text' ? first.size : 110;
  const top = Math.max(size, ...out.elements.map((e) => (e.kind === 'text' ? e.size : 0)));
  const label = slice.label.trim();
  if (label) out.elements.push({ ...newTextEl(label, { x: 120, y: below, w: SLIDE_W - 240, h: 160 }), size: Math.round(top * 1.25) });
  const details = slice.details?.trim();
  if (details) out.elements.push({ ...newTextEl(details, { x: 120, y: below + 1, w: SLIDE_W - 240, h: 160 }), size: Math.min(size, 60), uppercase: false });
  const ref = slice.media ? game.media.find((m) => m.id === slice.media) : undefined;
  const item = ref ? fileItem(ref) : null;
  if (item) out.elements.push({ ...item, y: below + 2 });
  return out;
}

/** A recipient as a deal keeps it (a seat, or a person on a team: their id and name only). */
const plainTo = (t: CardTo): CardTo => (t.member ? { seat: t.seat, member: { id: t.member.id, name: t.member.name } } : { seat: t.seat });

/**
 * 🎭 Deal: who gets which part. The host's picks first, then each part with a number gets that many at random from
 * those left, and the part for "the rest" everyone still left (without one, they get nothing). Nobody ever gets two
 * parts. A part that draws gets a slice of the deal's wheel: 'shared' the one slice drawn for the whole deal, 'own' one
 * each (none twice while there are enough). Hands in the order of `pool` (the players' order), each with its card;
 * `dealtIn` is everyone dealt in, with a part or not (one window lists them all, never only those who got one).
 */
export function dealHands(
  game: Pick<Game, 'wheels' | 'media'>,
  deal: Pick<DealPreset, 'parts' | 'wheel'>,
  pool: CardTo[],
  opts: DealOptions = {},
): { hands: DealHand[]; dealtIn: CardTo[] } | { problem: string } {
  const problem = dealProblem(game, deal, pool, opts);
  if (problem) return { problem };
  const rand = opts.rand ?? random;
  const all = once(pool);
  const partOf = new Map<string, DealPart>();
  for (const group of groupsOf(all, !!opts.perTeam)) {
    const keys = new Set(group.map(toKey));
    // The host's picks (the first part a player was picked for: never two).
    const picked = new Set<Id>();
    for (const part of deal.parts)
      for (const t of opts.picks?.[part.id] ?? []) {
        const k = toKey(t);
        if (!keys.has(k) || partOf.has(k)) continue;
        partOf.set(k, part);
        picked.add(part.id);
      }
    // Then the numbers, at random among those left.
    const free = shuffle(
      group.filter((t) => !partOf.has(toKey(t))),
      rand,
    );
    for (const part of deal.parts) {
      if (part.count === 'rest' || picked.has(part.id)) continue;
      for (const t of free.splice(0, part.count)) partOf.set(toKey(t), part);
    }
    const rest = deal.parts.find((p) => p.count === 'rest');
    if (rest) for (const t of free) partOf.set(toKey(t), rest);
  }
  const dealt = all.filter((t) => partOf.has(toKey(t)));
  // The wheel: one slice for every part that shares it, and one each for the parts that draw their own.
  const slices = drawable(game, deal);
  const pick = (from: WheelSegment[]) => from[weightedIndex(from.map((s) => s.weight), rand)];
  const shared = dealt.some((t) => partOf.get(toKey(t))!.draw === 'shared') ? pick(slices) : undefined;
  const fresh = () => (slices.length > 1 && shared ? slices.filter((s) => s !== shared) : [...slices]);
  let bag = fresh();
  const label = (s: WheelSegment) => s.label.trim() || `Slice ${slices.indexOf(s) + 1}`;
  // The phones say the part ("You're the Spy") unless everyone dealt in got the same one.
  const role = new Set(dealt.map((t) => partOf.get(toKey(t))!.id)).size > 1 || dealt.length < all.length;
  const hands = dealt.map((t): DealHand => {
    const part = partOf.get(toKey(t))!;
    let slice: WheelSegment | undefined;
    if (part.draw === 'shared') slice = shared;
    else if (part.draw === 'own') {
      if (!bag.length) bag = fresh();
      slice = pick(bag);
      bag = bag.filter((s) => s !== slice);
    }
    const name = partName(part, deal.parts.indexOf(part));
    return { to: plainTo(t), part: name, ...(slice ? { slice: label(slice) } : {}), slide: handSlide(game, part.card, slice ? { ...slice, label: label(slice) } : undefined), ...(role ? { role: true } : {}) };
  });
  return { hands, dealtIn: all.map(plainTo) };
}

/**
 * The deal on the table: who got which, not sent yet (the host checks it, then 📤 Send), and everyone dealt in. A deal
 * whose cards are out is replaced: its cards are taken back with it (one deal at a time).
 */
export function startDeal(session: Session, deal: Pick<DealPreset, 'name' | 'parts'>, hands: DealHand[], dealtIn: CardTo[], now = Date.now()): DealState {
  const d: DealState = { id: newId(), name: deal.name.trim() || 'Deal', at: now, parts: deal.parts.map(partName), hands, in: dealtIn.map(plainTo), stage: 'dealt' };
  takeBackDealCards(session);
  session.deal = d;
  return d;
}

/** ✖ Put the deal away: its cards are taken back, and nobody can see who had which any more. */
export function clearDeal(session: Session): void {
  takeBackDealCards(session);
  session.deal = null;
}

/**
 * Everyone dealt in, a part or not, in the players' order (a deal saved before they were kept: those with a part). A
 * player taken out since stays in it (their part too), so the counts never change as someone leaves: dealtHere lists
 * those still in the game.
 */
export const dealtIn = (d: Pick<DealState, 'hands' | 'in'>): CardTo[] => d.in ?? d.hands.map((h) => h.to);

/** Those dealt in still in the game (the rows to copy from, and who has no phone): one taken out is kept for a restore. */
export const dealtHere = (d: Pick<DealState, 'hands' | 'in'>, session: Pick<Session, 'players'>): CardTo[] =>
  dealtIn(d).filter((t) => session.players.some((p) => p.id === t.seat));

/** "Spy ×1, Villager ×4": the parts dealt, counted in the deal's order (never the players' order: that would say who). */
export function dealCounts(d: Pick<DealState, 'parts' | 'hands'>): string {
  const n = (name: string) => d.hands.filter((h) => h.part === name).length;
  const names = [...new Set([...d.parts, ...[...new Set(d.hands.map((h) => h.part))].sort()])];
  return names.flatMap((name) => (n(name) ? [`${name} ×${n(name)}`] : [])).join(', ');
}

/**
 * The deal's count once sent: "✓ seen by 2 of 4", or "Sent to 4". `out` cards are out, `seen` of them opened. One window
 * counts the deal as dealt, never the cards out (a player taken out takes theirs along: a count that dropped would say
 * they had a part), and has no seen count when some dealt in have no part (it would tick as one with a part opened it).
 */
export function dealSentLine(d: Pick<DealState, 'hands' | 'in'>, out: number, seen: number, dual: boolean): string {
  const of = dual ? out : d.hands.length;
  return seen && (dual || d.hands.length === dealtIn(d).length) ? `✓ seen by ${seen} of ${of}` : `Sent to ${of}`;
}

// ---------- Sending ----------

/** A deal's cards' label (the 📋 copy says it): its name. */
export const dealLabel = (d: Pick<DealState, 'name'>): string => `🎭 ${d.name.slice(0, 40)}`;

/**
 * Each player's card as it goes: one card each (its own id, so the late rule counts each), to that player alone (a
 * whole team, or one person on it), with their part as the card's top line (under Tap to see on a phone). Null when it
 * can't go: nobody left in the game, or no round on for cards that last the round.
 */
export function dealCards(game: CardGame, session: Session, d: DealState, until: 'round' | 'host', now = Date.now()): SentCard[] | null {
  const round = until === 'round' ? roundNow(game, session) : undefined;
  if (until === 'round' && !round) return null;
  const cards = d.hands.flatMap((h): SentCard[] => {
    const to = cleanTo(session, [h.to]);
    if (!to.length) return [];
    return [
      {
        id: newId(),
        at: now,
        label: dealLabel(d),
        to,
        content: { slide: JSON.parse(JSON.stringify(h.slide)) },
        hash: cardHash(h.slide),
        until,
        ...(round ? { round } : {}),
        deal: d.id,
        ...(h.role ? { role: h.part } : {}),
      },
    ];
  });
  return cards.length ? cards : null;
}

/**
 * The deal's cards that are out now (on the phones, in the card window), in the players' order. Only the host column
 * (two windows) says which is whose: one window's panel only counts them.
 */
export function dealOut(game: CardGame, session: Pick<Session, 'cards' | 'currentRound' | 'phase' | 'currentClue' | 'players' | 'deal'>): SentCard[] {
  const id = session.deal?.id;
  return id ? cardsOut(game, session).filter((c) => c.deal === id) : [];
}

/** The cards of any deal go (a new deal replaces them). */
function takeBackDealCards(session: Session): SentCard[] {
  const gone = (session.cards ?? []).filter((c) => c.deal);
  for (const c of gone) takeBackCard(session, c.id);
  return gone;
}

/**
 * 📤 Send (the host confirmed the deal): each player's card goes now, lasting `until`. `full`: the buzzer room has no
 * room for them all (roomCardsFull with dealTrial): nothing goes, never some of them. Returns the cards sent.
 */
export function sendDeal(game: CardGame, session: Session, until: 'round' | 'host', now = Date.now(), full = false): SentCard[] {
  const d = session.deal;
  if (!d || full) return [];
  const cards = dealCards(game, session, d, until, now);
  if (!cards) return [];
  // (Any card of a deal still out goes first: one deal at a time.)
  takeBackDealCards(session);
  session.cards = [...(session.cards ?? []), ...cards];
  d.stage = 'sent';
  d.until = until;
  const round = until === 'round' ? roundNow(game, session) : undefined;
  if (round) d.round = round;
  else delete d.round;
  return cards;
}

/** The send, on a copy of the session (roomCardsFull's `go`): would the room take them all? */
export function dealTrial(game: CardGame, d: DealState, until: 'round' | 'host'): (trial: Session) => void {
  return (t) => {
    const cards = dealCards(game, t, d, until) ?? [];
    t.cards = [...(t.cards ?? []).filter((c) => !c.deal), ...cards];
  };
}

/**
 * ↻ Send again: each of the deal's cards out goes again under a new id (a phone that came late gets it, as a player put
 * back with ↩ Restore is: the room let their seat go), and a hand with no card out gets its own again (one taken back
 * with a player taken out, by an older version). How many went.
 */
export function sendDealAgain(game: CardGame, session: Session, now = Date.now()): number {
  const d = session.deal;
  const out = dealOut(game, session);
  const n = out.filter((c) => sendCardAgain(game, session, c.id, now)).length;
  if (!d?.until || !out.length) return n;
  const have = new Set(out.flatMap((c) => c.to.map(toKey)));
  const back = dealCards(game, session, { ...d, hands: d.hands.filter((h) => !have.has(toKey(h.to))) }, d.until, now) ?? [];
  session.cards = [...(session.cards ?? []), ...back];
  return n + back.length;
}

/** A phone's place as the buzzer room says it: its seat, or `seat/member` for a person on a team. */
const placeOf = (seat: Id, member?: string): string => (member ? `${seat}/${member}` : seat);

/**
 * The buzzer room's phones on a place dealt in (a whole seat, or that person on a team), as placeOf says it: those here
 * now with `here`, else away ones too (a phone back with its token isn't late: the room keeps its time).
 * DealState.phonesAt is this as the cards go.
 */
export function dealPhones(d: Pick<DealState, 'hands' | 'in'>, phones: PhoneInfo[], here = false): string[] {
  const dealt = dealtIn(d);
  const on = phones.filter((p) => p.seatId && (p.connected || !here) && dealt.some((t) => t.seat === p.seatId && (!t.member || t.member.id === p.member)));
  return [...new Set(on.map((p) => placeOf(p.seatId!, p.member)))];
}

/**
 * One window's count of the phones that came after the deal's cards went (↻ Send again reaches them), blind to parts.
 * Only those with a part have a card to be late for, so the room's late phones, counted or named, would say who got
 * one as each phone came. So it counts every phone here now on a place dealt in that isn't in phonesAt, a part or not:
 * one that wasn't in the room when they went, or one on a place that left it since (dropGonePhones: a new phone for
 * its seat). A deal sent before phonesAt was kept counts none (the phone itself says to ask the host).
 */
export function dealPhonesLate(d: Pick<DealState, 'hands' | 'in' | 'phonesAt'>, phones: PhoneInfo[]): number {
  const was = d.phonesAt;
  return was ? dealPhones(d, phones, true).filter((k) => !was.includes(k)).length : 0;
}

/**
 * The places in phonesAt the buzzer room no longer lists at all, not even away, go from it: the seat was freed (the
 * host freed or kicked it, or its phone pressed Change player) or the person left their team or was moved off it. A
 * phone there next is new to the room, late for the cards, so dealPhonesLate counts it, a part or not. True when any
 * went. Only with the room's own list (one it sent since its welcome).
 */
export function dropGonePhones(d: Pick<DealState, 'phonesAt'>, phones: PhoneInfo[]): boolean {
  const was = d.phonesAt;
  if (!was) return false;
  const listed = new Set(phones.flatMap((p) => (p.seatId ? [placeOf(p.seatId, p.member)] : [])));
  const kept = was.filter((k) => listed.has(k));
  if (kept.length === was.length) return false;
  d.phonesAt = kept;
  return true;
}

/** ✖ Take back: the deal's cards go from every phone (the deal stays, for Who was who). Returns the cards taken back. */
export function takeBackDeal(game: CardGame, session: Session): SentCard[] {
  const out = dealOut(game, session);
  for (const c of out) takeBackCard(session, c.id);
  if (session.deal) delete session.deal.round;
  return out;
}

/**
 * 📋 A player's card in words, for a DM: "🤫 For Ann only (🎭 Odd one out): You're the Spy …" (never on screen). One
 * dealt in with no part gets a note that says so, through the same button: every row of the list looks the same.
 */
export function dealCopyText(game: Pick<Game, 'media'>, session: Pick<Session, 'players'>, d: Pick<DealState, 'name' | 'hands'>, to: CardTo): string {
  const who = to.member?.name ?? session.players.find((p) => p.id === to.seat)?.name ?? 'you';
  const h = d.hands.find((x) => toKey(x.to) === toKey(to));
  const body = h ? [h.role ? `You’re the ${h.part}` : '', cardWords(h.slide), ...cardLinks(game, h.slide)].filter(Boolean).join('\n') : 'no part for you this time';
  return `🤫 For ${who} only (${dealLabel(d)}): ${body}`;
}

// ---------- Who was who ----------

export interface RevealLine {
  /** The player (or the person on a team). */
  name: string;
  /** Their team, for a person on one. */
  team?: string;
  color: string;
  part: string;
  slice?: string;
}

/**
 * What Who was who shows on stream: each player's name and part (and the slice they drew), in the players' order. Null
 * until the host shows it (DealState.shown, a step), and for a deal not sent: nothing of it is ever drawn before that.
 */
export function dealReveal(session: Pick<Session, 'deal' | 'players'>): { name: string; lines: RevealLine[] } | null {
  const d = session.deal;
  if (!d?.shown || d.stage !== 'sent') return null;
  // (Everyone the same part, each with a slice, as 🧠 Everyone's own prompt: the slice is what tells them apart, so it
  // takes the part's place, not "Player" on every line with the prompt cut short after it.)
  const same = new Set(d.hands.map((h) => h.part)).size === 1 && d.hands.every((h) => h.slice);
  const lines = d.hands.flatMap((h): RevealLine[] => {
    const p = session.players.find((x) => x.id === h.to.seat);
    if (!p) return [];
    return [{ name: h.to.member?.name ?? p.name, ...(h.to.member ? { team: p.name } : {}), color: p.color, part: same ? h.slice! : h.part, ...(h.slice && !same ? { slice: h.slice } : {}) }];
  });
  return { name: d.name, lines };
}

/** The deal as viewers' windows get it: nothing until Who was who is on stream, then only names and parts. */
export function dealForViewers(d: DealState | null | undefined): DealState | undefined {
  if (!d?.shown || d.stage !== 'sent') return undefined;
  const blank: Slide = { background: {}, elements: [] };
  return {
    id: d.id,
    name: d.name,
    at: d.at,
    parts: [...d.parts],
    stage: d.stage,
    shown: true,
    hands: d.hands.map((h) => ({
      to: h.to.member ? { seat: h.to.seat, member: { id: h.to.member.id, name: h.to.member.name } } : { seat: h.to.seat },
      part: h.part,
      ...(h.slice ? { slice: h.slice } : {}),
      slide: blank,
    })),
  };
}

// ---------- Loading a save ----------

/**
 * A saved deal that isn't well-formed is put away (never widened), and so are a deal's cards that aren't the deal's on
 * the table: a damaged save sends nothing it didn't send.
 */
export function repairDeal(session: Session): void {
  const d = session.deal as unknown as Record<string, unknown> | null | undefined;
  if (d !== undefined && d !== null) {
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    const okTo = (t: unknown) =>
      isObj(t) && typeof t.seat === 'string' && (t.member === undefined || (isObj(t.member) && typeof t.member.id === 'string' && typeof t.member.name === 'string'));
    const okHand = (h: unknown): h is DealHand =>
      isObj(h) &&
      okTo(h.to) &&
      typeof h.part === 'string' &&
      (h.slice === undefined || typeof h.slice === 'string') &&
      (h.role === undefined || typeof h.role === 'boolean') &&
      isObj(h.slide) &&
      Array.isArray(h.slide.elements);
    const hands = Array.isArray(d.hands) ? d.hands.filter(okHand) : [];
    const ok =
      isObj(d) &&
      typeof d.id === 'string' &&
      typeof d.name === 'string' &&
      Number.isFinite(d.at) &&
      (d.stage === 'dealt' || d.stage === 'sent') &&
      (d.until === undefined || d.until === 'round' || d.until === 'host') &&
      hands.length > 0;
    if (!ok) session.deal = null;
    else {
      const deal = session.deal!;
      if (hands.length !== (d.hands as unknown[]).length) deal.hands = hands;
      // (Everyone dealt in: kept only whole, with everyone who has a part. Without it the list is those with a part.)
      const keys = Array.isArray(d.in) && d.in.every(okTo) ? new Set((d.in as CardTo[]).map(toKey)) : null;
      if (d.in !== undefined && !(keys && deal.hands.every((h) => keys.has(toKey(h.to))))) delete deal.in;
      if (!Array.isArray(d.parts) || !d.parts.every((x) => typeof x === 'string')) deal.parts = [...new Set(hands.map((h) => h.part))].sort();
      if (deal.shown !== undefined && deal.shown !== true) delete deal.shown;
      if (d.phonesAt !== undefined && !(Array.isArray(d.phonesAt) && d.phonesAt.every((x) => typeof x === 'string'))) delete deal.phonesAt;
      if (d.round !== undefined && typeof d.round !== 'string') delete deal.round;
    }
  }
  const id = session.deal?.id;
  for (const c of (session.cards ?? []).filter((x) => x.deal && x.deal !== id)) takeBackCard(session, c.id);
}
