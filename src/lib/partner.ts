// 🤝 Partner clues (docs/PARTNER-CLUES-SPEC.md): a clue's rules worked out from its game, what each part gets on a
// tile, its 🤫 cards as the editor makes them, and who plays which part and gets which card while it's played. No Svelte
// state: unit-tested in partner.test.ts.
import {
  cardSlides,
  formatPoints,
  gameRules,
  MAX_CARDS,
  MAX_SHARE,
  newId,
  newTextEl,
  PART_WORD_MAX,
  PARTNER_GAMES,
  wholePoints,
  type CardGoesTo,
  type CardSend,
  type CardTo,
  type Clue,
  type ClueCard,
  type Game,
  type Id,
  type PartnerGame,
  type PartnerPoints,
  type PartnerRole,
  type PartnerRules,
  type PartnerState,
  type Player,
  type Session,
  type Slide,
} from './model';
import { cardItems, cardLinks, cardWords, filesToSend, phoneCard, type CardItem, type LeftOut } from './phonecard';
import { slideHasContent } from './usage';

export { cardSlides, PARTNER_GAMES };

/** The clue's rules (a partner clue saved without any plays Describe it). */
export function partnerRules(clue: Pick<Clue, 'partner'>): PartnerRules {
  return clue.partner ?? gameRules('describe');
}

/** The parts' words: the ones typed for the clue, else its game's ("Describer", "Guesser"). */
export function partWords(rules: PartnerRules): Record<PartnerRole, string> {
  const g = PARTNER_GAMES[rules.game];
  return { giver: rules.words?.giver?.trim() || g.giver, guesser: rules.words?.guesser?.trim() || g.guesser };
}

/** A part's word inside a sentence: "the describer", "the half A". */
export const lowerWord = (w: string): string => w.charAt(0).toLowerCase() + w.slice(1);

/** Who plays the part by default: "the partner" or "the picker". */
export function partWho(rules: PartnerRules, role: PartnerRole): 'the partner' | 'the picker' {
  return (role === 'giver') === (rules.giver === 'partner') ? 'the partner' : 'the picker';
}

/** The part the partner plays (the giver, unless the clue says the picker gives). */
export const partnerPart = (rules: PartnerRules): PartnerRole => (rules.giver === 'partner' ? 'giver' : 'guesser');

/** The game's own got and missed shares, or those the Points choice makes of them (Custom: the numbers as they are). */
function choiceShares(rules: PartnerRules, choice: PartnerPoints): Pick<PartnerRules, 'got' | 'missed'> {
  const g = PARTNER_GAMES[rules.game];
  // (A Custom game has no points of its own: its "got" numbers stay.)
  const got = rules.game === 'custom' ? { ...rules.got } : { ...g.got };
  if (choice === 'none') return { got, missed: { giver: 0, guesser: 0 } };
  if (choice === 'all') return { got, missed: { giver: 0, guesser: -100 } };
  if (choice === 'game' && rules.game !== 'custom') return { got, missed: { ...g.missed } };
  return { got: { ...rules.got }, missed: { ...rules.missed } };
}

const sameShares = (a: Pick<PartnerRules, 'got' | 'missed'>, b: Pick<PartnerRules, 'got' | 'missed'>) =>
  a.got.giver === b.got.giver && a.got.guesser === b.got.guesser && a.missed.giver === b.missed.giver && a.missed.guesser === b.missed.guesser;

/** The Points choice the numbers come from: the one saved, else the ready-made one they match, else Custom. */
export function pointsChoice(rules: PartnerRules): PartnerPoints {
  if (rules.points) return rules.points;
  const ready: PartnerPoints[] = rules.game === 'custom' ? ['none', 'all'] : ['game', 'none', 'all'];
  return ready.find((c) => sameShares(choiceShares(rules, c), rules)) ?? 'custom';
}

/** The Points choices for the clue's game, with their names ("Describe it's", "No penalty"…). */
export function pointsChoices(game: PartnerGame): { value: PartnerPoints; label: string }[] {
  const own = game === 'custom' ? [] : [{ value: 'game' as const, label: `${PARTNER_GAMES[game].label}’s` }];
  return [...own, { value: 'none', label: 'No penalty' }, { value: 'all', label: 'The guesser loses it all' }, { value: 'custom', label: 'Custom' }];
}

/** A share typed in a box: a whole number within ±MAX_SHARE% (null: not a number). */
export function typedShare(text: string): number | null {
  const n = Number(text.replace(/[−–]/g, '-'));
  return text.trim() === '' || !Number.isFinite(n) ? null : Math.min(MAX_SHARE, Math.max(-MAX_SHARE, Math.round(n)));
}

/**
 * What each part gets on a tile worth `value` when it's got or missed: its share of the value, in whole points. With
 * ☑ The partner never loses points (on unless unticked), the partner's points are at least 0, whichever part they play.
 */
export function tilePoints(rules: PartnerRules, value: number, got: boolean): Record<PartnerRole, number> {
  const share = got ? rules.got : rules.missed;
  const pts = (role: PartnerRole) => wholePoints((value * share[role]) / 100) || 0;
  const out = { giver: pts('giver'), guesser: pts('guesser') };
  const p = partnerPart(rules);
  if (rules.partnerSafe !== false && out[p] < 0) out[p] = 0;
  return out;
}

/** A miss can cost someone points (the clue's own points, after ☑ The partner never loses points). */
export const missCosts = (rules: PartnerRules): boolean => Object.values(tilePoints(rules, 100, false)).some((n) => n < 0);

// ---------- Changing the rules ----------

/**
 * Choose a game: it fills in the rules (the partner gives, the game's points and words, the partner never loses
 * points), adds its starting cards when the clue has none, and for Describe it, Draw it and Act it out a 45 s countdown
 * when the clue has none. Custom keeps the rules as they are (and the words they had), to change by hand.
 */
export function setPartnerGame(clue: Clue, game: PartnerGame): void {
  // (A plain copy: the rules may be the editor's live state.)
  const was: PartnerRules = JSON.parse(JSON.stringify(partnerRules(clue)));
  if (game === 'custom') clue.partner = { ...was, game, points: 'custom', words: partWords(was) };
  else {
    // (Not the game's to set: whether the picker is on the wheel, and the later options.)
    const kept = (['includePicker', 'typeGuess', 'steal'] as const).flatMap((k) => (was[k] === undefined ? [] : [[k, was[k]]]));
    clue.partner = { ...gameRules(game), ...Object.fromEntries(kept) };
  }
  if (!clue.cards?.length) {
    const cards = startingCards(game);
    if (cards.length) clue.cards = cards;
    else delete clue.cards;
  }
  if ((game === 'describe' || game === 'draw' || game === 'act') && clue.timerSeconds == null) clue.timerSeconds = 45;
}

/** Choose Points: the game's own, no penalty, the guesser loses it all, or Custom (the numbers as they are). */
export function setPartnerPoints(clue: Clue, choice: PartnerPoints): void {
  const rules = (clue.partner ??= gameRules('describe'));
  const { got, missed } = choiceShares(rules, choice);
  rules.got = got;
  rules.missed = missed;
  rules.points = choice;
}

/** One of the four boxes typed in: that share, and the Points choice is Custom. */
export function setPartnerShare(clue: Clue, when: 'got' | 'missed', role: PartnerRole, share: number): void {
  const rules = (clue.partner ??= gameRules('describe'));
  rules[when][role] = Math.min(MAX_SHARE, Math.max(-MAX_SHARE, Math.round(share)));
  rules.points = 'custom';
}

/** A part word typed (blank: the game's word again). */
export function setPartWord(clue: Clue, role: PartnerRole, word: string): void {
  const rules = (clue.partner ??= gameRules('describe'));
  const w = word.slice(0, PART_WORD_MAX);
  if (w.trim()) (rules.words ??= {})[role] = w;
  else if (rules.words) {
    delete rules.words[role];
    if (!rules.words.giver && !rules.words.guesser) delete rules.words;
  }
}

// ---------- 🤫 Cards ----------

/** A new, empty card (its words box ready to type in) that goes to `to`. */
export function newCard(to: CardGoesTo): ClueCard {
  return { id: newId(), background: {}, elements: [newTextEl('')], to };
}

/** The cards a game starts a clue with: empty, for the host to fill in. */
export function startingCards(game: PartnerGame): ClueCard[] {
  return PARTNER_GAMES[game].cards.map(newCard);
}

/** ＋ Card: one more card at the end (it goes to the giver, as a game's first card does). Returns it, or null at MAX_CARDS. */
export function addCard(clue: Clue): ClueCard | null {
  if (cardSlides(clue).length >= MAX_CARDS) return null;
  const card = newCard('giver');
  (clue.cards ??= []).push(card);
  return card;
}

/** 🗑 Delete card: the cards after it move up a number (their ids don't change). Returns the card to show then (-1: none left). */
export function deleteCard(clue: Clue, at: number): number {
  const cards = cardSlides(clue);
  if (!cards[at]) return Math.min(at, cards.length - 1);
  cards.splice(at, 1);
  if (!cards.length) delete clue.cards;
  return Math.min(at, cards.length - 1);
}

/**
 * Who a card goes to, as its Goes to says it ("the describer (the partner)", "both of them", "nobody (I'll choose when
 * playing)"); `long` false: just who ("the describer", "nobody").
 */
export function goesToLabel(rules: PartnerRules, to: CardGoesTo, long = true): string {
  const words = partWords(rules);
  if (to === 'giver' || to === 'guesser') return `the ${lowerWord(words[to])}${long ? ` (${partWho(rules, to)})` : ''}`;
  return { both: 'both of them', others: 'everyone else', nobody: long ? 'nobody (I’ll choose when playing)' : 'nobody' }[to];
}

/** Every Goes to choice, in the order the editor lists them. */
export const GOES_TO: CardGoesTo[] = ['giver', 'guesser', 'both', 'others', 'nobody'];

/** The words on a slide (every text box), as one line to compare: its case and spacing don't count. */
function words(slide: Slide): string {
  return slide.elements
    .flatMap((e) => (e.kind === 'text' ? [e.text] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The card's words are the answer's: "This card shows the answer: whoever you send it to sees it". */
export function sameAsAnswer(clue: Pick<Clue, 'answerSlide'>, card: Slide): boolean {
  const a = words(clue.answerSlide);
  return !!a && words(card) === a;
}

/**
 * What a partner clue's cards still need, for the board and the checklist: 'none' (a ready-made game with no card: the
 * giver has nothing to go on), the number of the first empty card, or null when they're done.
 */
export function cardsToFinish(clue: Clue): 'none' | number | null {
  if (clue.type !== 'partner') return null;
  const cards = cardSlides(clue);
  if (!cards.length) return partnerRules(clue).game === 'custom' ? null : 'none';
  const empty = cards.findIndex((c) => !slideHasContent(c));
  return empty < 0 ? null : empty + 1;
}

// ---------- Playing it (partner-clues spec §6, §7) ----------
// The state of a partner clue being played (PartnerState) holds who plays which part, who the host gives each card to,
// and what the host sent to phones. Only the host's presses send (sendCards and the others below); opening the tile,
// the wheel and Show question send nothing.

/** The players a partner clue is played among (the session's, or a test's). */
type Seats = Pick<Session, 'players'>;

/**
 * A partner clue opening (at `now`): whoever was marked to pick picked it; its parts come from the clue's rules. Sends
 * nothing.
 */
export function startPartner(session: Pick<Session, 'players' | 'currentPickerId'>, clue: Clue, now = Date.now()): PartnerState {
  const rules = partnerRules(clue);
  const s: PartnerState = { clue: clue.id, at: now, stage: 'pick', giver: rules.giver, ...(rules.includePicker ? { includePicker: true } : {}) };
  if (session.players.some((p) => p.id === session.currentPickerId)) s.pickerId = session.currentPickerId;
  pairOnly(session, s);
  return s;
}

/** Who can be the partner: every player but the picker (the picker too while they can be on the wheel). */
export function partnerCandidates(session: Seats, s: PartnerState): Player[] {
  return session.players.filter((p) => p.id !== s.pickerId || !!s.includePicker);
}

/** With the picker known and only one player who could be their partner, that's the partner at once (no wheel). */
export function pairOnly(session: Seats, s: PartnerState): void {
  if (s.stage !== 'pick' || !s.pickerId || s.partnerId) return;
  const can = partnerCandidates(session, s);
  if (can.length !== 1) return;
  s.partnerId = can[0].id;
  s.how = 'only';
}

/**
 * The partner, chosen by the wheel's landing or the host (a chip, 1–9). The picker only from the wheel (the host put
 * them on it) or while they can be on it: that's Solo. Returns whether it took.
 */
export function setPartner(session: Seats, s: PartnerState, id: Id, how: 'wheel' | 'host'): boolean {
  if (!session.players.some((p) => p.id === id)) return false;
  if (id === s.pickerId && how === 'host' && !s.includePicker) return false;
  s.partnerId = id;
  s.how = how;
  return true;
}

/** The host changed who picked it: a new picker who was the partner leaves no partner (and an only one may take it). */
export function setPartnerPicker(session: Seats, s: PartnerState, id: Id): void {
  if (!session.players.some((p) => p.id === id) || s.pickerId === id) return;
  s.pickerId = id;
  if (s.partnerId === id) {
    delete s.partnerId;
    delete s.how;
  }
  pairOnly(session, s);
}

/** Who plays which part now: the giver and the guesser (Solo: the picker, alone, guesses). */
export function partnerRoles(s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>): { giver?: Id; guesser?: Id; solo: boolean } {
  if (s.partnerId && s.partnerId === s.pickerId) return { guesser: s.pickerId, solo: true };
  return s.giver === 'partner' ? { giver: s.partnerId, guesser: s.pickerId, solo: false } : { giver: s.pickerId, guesser: s.partnerId, solo: false };
}

/** ⇄ Swap: the parts turn round. The cards that follow a part ("the describer") go with it; the points follow too. */
export function swapParts(s: PartnerState): void {
  s.giver = s.giver === 'partner' ? 'picker' : 'partner';
}

/**
 * Who a card set to `to` goes to by default, from the parts now: "everyone else" is every player but the two. Solo:
 * only a card for the guesser goes to the picker; any other starts with nobody (it usually holds what they guess).
 */
export function defaultRecipients(session: Seats, s: PartnerState, to: CardGoesTo): CardTo[] {
  const { giver, guesser, solo } = partnerRoles(s);
  let ids: (Id | undefined)[];
  if (solo) ids = to === 'guesser' ? [guesser] : [];
  else if (to === 'giver') ids = [giver];
  else if (to === 'guesser') ids = [guesser];
  else if (to === 'both') ids = [giver, guesser];
  else if (to === 'others') ids = session.players.map((p) => p.id).filter((id) => id !== s.pickerId && id !== s.partnerId);
  else ids = [];
  return session.players.filter((p) => ids.includes(p.id)).map((p) => ({ seat: p.id }));
}

/** Who a card goes to now: whoever the host chose for it, else its Goes to worked out from the parts now. */
export function cardRecipients(session: Seats, s: PartnerState, card: Pick<ClueCard, 'id' | 'to'>): CardTo[] {
  const dealt = s.deal?.[card.id];
  if (!dealt) return defaultRecipients(session, s, card.to);
  return session.players.filter((p) => dealt.some((t) => t.seat === p.id)).map((p) => ({ seat: p.id }));
}

/**
 * The host chose who a card goes to (`seats`, in any order). The same players as its default isn't a change: the row
 * follows the parts again (⇄ Swap or a new partner moves it).
 */
export function setRecipients(session: Seats, s: PartnerState, card: Pick<ClueCard, 'id' | 'to'>, seats: Id[]): void {
  const ids = session.players.map((p) => p.id).filter((id) => seats.includes(id));
  const def = defaultRecipients(session, s, card.to).map((t) => t.seat);
  if (ids.length === def.length && ids.every((id) => def.includes(id))) return resetRecipients(s, card.id);
  (s.deal ??= {})[card.id] = ids.map((seat) => ({ seat }));
}

/** A player's part word now, for their chip or a card's line ("describer"; Solo: ''), '' for anyone else. */
export function partWordOf(rules: PartnerRules, s: PartnerState, id: Id): string {
  const r = partnerRoles(s);
  if (r.solo) return '';
  const words = partWords(rules);
  return id === r.giver ? lowerWord(words.giver) : id === r.guesser ? lowerWord(words.guesser) : '';
}

/**
 * Who a card goes to now, in words: "Bob (describer)", "Cat, Dan", "nobody yet"; before the partner is known, its Goes
 * to ("the describer"). Names and parts only: never what's on the card.
 */
export function recipientsText(session: Seats, s: PartnerState, rules: PartnerRules, card: Pick<ClueCard, 'id' | 'to'>): string {
  if (!s.partnerId) return goesToLabel(rules, card.to, false);
  const to = cardRecipients(session, s, card);
  if (!to.length) return 'nobody yet';
  const name = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  return to.map(({ seat }) => (partWordOf(rules, s, seat) ? `${name(seat)} (${partWordOf(rules, s, seat)})` : name(seat))).join(', ');
}

/** ↺: the card goes back to its default (its Goes to). */
export function resetRecipients(s: PartnerState, cardId: Id): void {
  if (!s.deal?.[cardId]) return;
  delete s.deal[cardId];
  if (!Object.keys(s.deal).length) delete s.deal;
}

/** What each part does, in the game's words: "describing" (the phones' "You're describing!") and "described". */
const DOING: Record<PartnerGame, { doing: string; did: string; guessed: string }> = {
  describe: { doing: 'describing', did: 'described', guessed: 'guessed' },
  draw: { doing: 'drawing', did: 'drew', guessed: 'guessed' },
  act: { doing: 'acting it out', did: 'acted it out', guessed: 'guessed' },
  help: { doing: 'helping', did: 'helped', guessed: 'answered' },
  split: { doing: 'sharing half A', did: 'had half A', guessed: 'had half B' },
  custom: { doing: 'giving the clues', did: 'gave the clues', guessed: 'answered' },
};

/**
 * Who plays which part, as one line: "Bob describes → Ann guesses" (`icons`: "🗣 Bob describes → 🎯 Ann guesses";
 * `past`: "Bob described → Ann guessed"). Solo: "Ann · Solo!".
 */
export function partsLine(rules: PartnerRules, names: { giver?: string; guesser?: string; solo?: boolean }, { icons = false, past = false } = {}): string {
  if (names.solo) return `${names.guesser ?? '?'} · Solo!`;
  const g = PARTNER_GAMES[rules.game];
  const [giverIcon, guesserIcon] = icons ? [`${g.icon} `, '🎯 '] : ['', ''];
  const [does, guesses] = past ? [DOING[rules.game].did, DOING[rules.game].guessed] : [g.verb, g.guessVerb];
  return `${giverIcon}${names.giver ?? '?'} ${does} → ${guesserIcon}${names.guesser ?? '?'} ${guesses}`;
}

/** What the giver's phone says: "🗣 You're describing!" (teams: "🗣 Your team is describing!"). */
export function giverLine(rules: PartnerRules, team = false): string {
  return `${PARTNER_GAMES[rules.game].icon} ${team ? 'Your team is' : 'You’re'} ${DOING[rules.game].doing}!`;
}

// ---------- Judging (partner-clues spec §6.6, §9) ----------
// ✔ Got it and ✘ Missed score the two in one step (judgePartner in session.ts). Whether it's judged isn't stored: it's
// each of the two having a mark on the clue since the tile opened, so an Undo of the step opens it all again.

/** A player's mark on a clue (clueMarks): marked right or wrong, and the points it came to. */
type Mark = { right: boolean; delta: number };

/** Who plays it now, the giver first: the two parts (Solo: the picker alone). Nobody before the pair is known. */
export function partnerPlayers(s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>): { id: Id; role: PartnerRole | 'solo' }[] {
  if (!s.pickerId || !s.partnerId) return [];
  const r = partnerRoles(s);
  if (r.solo) return [{ id: s.pickerId, role: 'solo' }];
  return [
    { id: r.giver!, role: 'giver' },
    { id: r.guesser!, role: 'guesser' },
  ];
}

/**
 * What ✔ Got it (`got`) or ✘ Missed gives each of the two on a tile worth `value`: their part's share, in whole points,
 * with the parts as they're played now (after ⇄ Swap the partner may be the guesser). ☑ The partner never loses points
 * keeps the partner at 0 or more. Solo: the bigger of the two "got" shares, or the guesser's "missed" share. Anyone in
 * `marked` (already scored on this clue, by hand say) is left out.
 */
export function partnerShares(
  value: number,
  rules: PartnerRules,
  s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>,
  got: boolean,
  marked: Record<Id, unknown> = {},
): { id: Id; role: PartnerRole | 'solo'; points: number }[] {
  const parts = tilePoints({ ...rules, giver: s.giver }, value, got);
  const solo = wholePoints((value * (got ? Math.max(rules.got.giver, rules.got.guesser) : rules.missed.guesser)) / 100) || 0;
  return partnerPlayers(s)
    .filter((p) => !marked[p.id])
    .map((p) => ({ ...p, points: p.role === 'solo' ? solo : parts[p.role] }));
}

/**
 * How the two stand on the clue, from their marks since it opened (by hand, or ✔ Got it / ✘ Missed): judged once each of
 * them has one; got when the guesser's is ✔ (Solo: the picker's).
 */
export function partnerVerdict(s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>, marks: Record<Id, Mark>): { judged: boolean; got: boolean } {
  const players = partnerPlayers(s);
  const guesser = players.find((p) => p.role !== 'giver');
  return { judged: players.length > 0 && players.every((p) => !!marks[p.id]), got: !!guesser && !!marks[guesser.id]?.right };
}

/** "+$400", "−$200", "$0". */
const signed = (n: number, sym: string) => `${n > 0 ? '+' : ''}${formatPoints(n, sym)}`;

/** What ✔ Got it or ✘ Missed gives, by its button: "Bob +$400 · Ann +$200" (a 0 left out; none at all: "no points"). */
export function sharesText(shares: { id: Id; points: number }[], name: (id: Id) => string, sym: string): string {
  return (
    shares
      .filter((x) => x.points)
      .map((x) => `${name(x.id)} ${signed(x.points, sym)}`)
      .join(' · ') || 'no points'
  );
}

/** The two's marks, the giver first: "Bob ✔ +$400 · Ann ✔ +$200", "Ann ✘ −$200 · Bob ✘ 0". */
export function marksText(s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>, marks: Record<Id, Mark>, name: (id: Id) => string, sym: string): string {
  return partnerPlayers(s)
    .flatMap(({ id }) => {
      const m = marks[id];
      return m ? [`${name(id)} ${m.right ? '✔' : '✘'} ${m.delta ? signed(m.delta, sym) : '0'}`] : [];
    })
    .join(' · ');
}

/** The phones' line once it's judged: "✔ Got it! Bob +$400 · Ann +$200", "✘ Missed: Ann −$200" (no points: just that). */
export function resultLine(s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>, marks: Record<Id, Mark>, name: (id: Id) => string, sym: string): string {
  const pts = partnerPlayers(s)
    .flatMap(({ id }) => (marks[id]?.delta ? [`${name(id)} ${signed(marks[id].delta, sym)}`] : []))
    .join(' · ');
  return partnerVerdict(s, marks).got ? `✔ Got it!${pts ? ` ${pts}` : ''}` : `✘ Missed${pts ? `: ${pts}` : ''}`;
}

/** The score log's words after the tile's name: "partner clue: Bob described, Ann guessed" (Solo: "Ann played it alone"). */
export function partnerReason(rules: PartnerRules, names: { giver?: string; guesser?: string; solo?: boolean }): string {
  if (names.solo) return `partner clue: ${names.guesser ?? '?'} played it alone`;
  const d = DOING[rules.game];
  return `partner clue: ${names.giver ?? '?'} ${d.did}, ${names.guesser ?? '?'} ${d.guessed}`;
}

const ITEM_WORDS: Record<CardItem['kind'], [string, string]> = {
  picture: ['picture', 'pictures'],
  gif: ['GIF', 'GIFs'],
  video: ['video', 'videos'],
  sound: ['sound', 'sounds'],
  embed: ['online video', 'online videos'],
};

/** Items counted by kind, never named: "1 picture", "2 pictures and 1 video", "1 picture, 1 GIF and 1 sound". */
export function countItems(kinds: CardItem['kind'][]): string {
  const out = (Object.keys(ITEM_WORDS) as CardItem['kind'][]).flatMap((kind) => {
    const n = kinds.filter((k) => k === kind).length;
    return n ? [`${n} ${ITEM_WORDS[kind][n === 1 ? 0 : 1]}`] : [];
  });
  return out.length > 1 ? `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}` : (out[0] ?? '');
}

/**
 * What's on a card, counted, never said: "1 line of words, 1 picture" (or "nothing on it"). The partner panel shows it,
 * and in one window that panel is on stream: never the words, never an item's name (a file name is often the answer).
 */
export function cardSummary(game: Pick<Game, 'media'>, slide: Slide): string {
  const lines = cardWords(slide).split('\n').filter((l) => l.trim()).length;
  const items = cardItems(game, slide);
  const out = lines ? [`${lines} line${lines === 1 ? '' : 's'} of words`] : [];
  for (const kind of Object.keys(ITEM_WORDS) as CardItem['kind'][]) {
    const n = items.filter((i) => i.kind === kind).length;
    if (n) out.push(`${n} ${ITEM_WORDS[kind][n === 1 ? 0 : 1]}`);
  }
  return out.join(', ') || 'nothing on it';
}

/** Names as one says who something is for: "Bob", "Bob and Cat", "Ann, Bob and Cat". */
const forNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? ''));

/**
 * 📋 Copy words: "🤫 For Bob only (Movies $400, card 1): Shrek", with the card's links after its words, to paste to them
 * in a DM. Never shown on screen.
 */
export function cardCopyText(game: Pick<Game, 'media'>, card: Slide, n: number, where: string, names: string[]): string {
  const body = [cardWords(card), ...cardLinks(game, card)].filter(Boolean).join('\n');
  return `🤫 For ${forNames(names) || 'you'} only (${where}, card ${n}): ${body}`;
}

// ---------- Sending the cards to phones (partner-clues spec §6.5, §14.4) ----------
// Each send is one card on the wire, with its own id (cardId), so the room's late rule counts from it: a phone that
// took the seat or joined the team after it went out doesn't get it. Only these functions change `sent`, and only the
// host's presses call them.

/** A send's id on the wire: `pc:<clue>:<card>:<when>`. */
export const cardId = (clue: Id, send: Pick<CardSend, 'card' | 'at'>): string => `pc:${clue}:${send.card}:${send.at}`;

/** Object keys in order, so the same content always reads the same. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/**
 * A short hash of what a phone gets from a card (partner-clues spec §15.4): its words, its items (which file or link,
 * where it starts and ends) in their order, and its line. Where things sit or how they look doesn't count.
 */
export function cardHash(card: Pick<ClueCard, 'elements' | 'hint'>): string {
  const parts = [...card.elements]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .flatMap((e) => {
      if (e.kind === 'text') return e.text.trim() ? [['t', e.text.trim()]] : [];
      if (e.kind === 'image') return [['i', e.editedMedia ?? e.media, e.name ?? '']];
      if (e.kind === 'video' || e.kind === 'audio') return [[e.kind, e.media, e.startAt, e.endAt, e.name ?? '']];
      if (e.kind === 'embed') return [['e', e.embedKind, e.url, e.startAt, e.endAt, e.name ?? '']];
      return [];
    });
  const text = stable([parts, card.hint ?? '']);
  // FNV-1a, 32 bits.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

/** A card's sends now. */
export const cardSends = (s: Pick<PartnerState, 'sent'>, card: Id): CardSend[] => (s.sent ?? []).filter((x) => x.card === card);

/** Every seat a card was sent to (and not taken back), in the order of the players. */
export function sentSeats(session: Seats, s: Pick<PartnerState, 'sent'>, card: Id): Id[] {
  const seats = new Set(cardSends(s, card).flatMap((x) => x.to.map((t) => t.seat)));
  return session.players.map((p) => p.id).filter((id) => seats.has(id));
}

/** The new send's time: `now`, after any earlier send of the card (each send of it has its own id). */
function sendAt(s: Pick<PartnerState, 'sent'>, card: Id, now: number): number {
  return Math.max(now, ...cardSends(s, card).map((x) => x.at + 1));
}

/**
 * 📤 Send, 📤 Send and start: each card not sent yet goes to its recipients now (cardRecipients), as one send. A card
 * with nobody to go to stays where it is. Returns the cards sent.
 */
export function sendCards(session: Seats, s: PartnerState, cards: ClueCard[], now = Date.now()): ClueCard[] {
  const out: ClueCard[] = [];
  for (const card of cards) {
    if (cardSends(s, card.id).length) continue;
    const to = cardRecipients(session, s, card);
    if (!to.length) continue;
    // (A new list, not a push: `s` may be the app's live state, which sees an assignment.)
    s.sent = [...(s.sent ?? []), { card: card.id, to, at: sendAt(s, card.id, now), hash: cardHash(card) }];
    out.push(card);
  }
  return out;
}

/** ✖ Take back: the card goes from every phone it was sent to (all its sends). */
export function takeBack(s: PartnerState, card: Id): void {
  if (!s.sent) return;
  s.sent = s.sent.filter((x) => x.card !== card);
  if (!s.sent.length) delete s.sent;
}

/**
 * ↻ Send again: the card goes again, under a new id, to everyone it's out to now (a phone late for the old one gets
 * it), with what's on it now. Returns whether it went.
 */
export function sendAgain(session: Seats, s: PartnerState, card: ClueCard, now = Date.now()): boolean {
  const seats = sentSeats(session, s, card.id);
  if (!seats.length) return false;
  const at = sendAt(s, card.id, now);
  takeBack(s, card.id);
  s.sent = [...(s.sent ?? []), { card: card.id, to: seats.map((seat) => ({ seat })), at, hash: cardHash(card) }];
  return true;
}

/**
 * 📤 Send changes: the card goes to whoever was added (under a new id) and is taken back from whoever was taken off
 * (dropped from its earlier sends, which keep their ids: a recipient is only ever dropped from an old id, never added).
 */
export function sendChanges(session: Seats, s: PartnerState, card: ClueCard, now = Date.now()): void {
  const want = cardRecipients(session, s, card).map((t) => t.seat);
  const had = sentSeats(session, s, card.id);
  const at = sendAt(s, card.id, now);
  if (s.sent) {
    s.sent = s.sent.flatMap((x) => (x.card !== card.id ? [x] : x.to.some((t) => want.includes(t.seat)) ? [{ ...x, to: x.to.filter((t) => want.includes(t.seat)) }] : []));
    if (!s.sent.length) delete s.sent;
  }
  const added = want.filter((id) => !had.includes(id));
  if (added.length) s.sent = [...(s.sent ?? []), { card: card.id, to: added.map((seat) => ({ seat })), at, hash: cardHash(card) }];
}

/**
 * How a card's row stands: not sent; sent; sent but its chips now say other players ('changed': 📤 Send changes); or
 * edited in the editor since (Resume with my edits: it's off the phones until ↻ Send again).
 */
export function sendState(session: Seats, s: PartnerState, card: ClueCard): 'unsent' | 'sent' | 'changed' | 'edited' {
  const sends = cardSends(s, card.id);
  if (!sends.length) return 'unsent';
  if (sends.some((x) => x.hash !== cardHash(card))) return 'edited';
  const had = sentSeats(session, s, card.id);
  const want = cardRecipients(session, s, card).map((t) => t.seat);
  return had.length === want.length && had.every((id) => want.includes(id)) ? 'sent' : 'changed';
}

/** ⇡ Get it ready: the card's files go up now, for no phone yet (only this press adds to `ready`). */
export function markReady(s: PartnerState, cards: Id[]): void {
  const ready = new Set([...(s.ready ?? []), ...cards]);
  if (ready.size) s.ready = [...ready];
}

/** A player taken out: they're dropped from every send (one sent only to them is taken back). */
export function dropFromSends(s: PartnerState, seat: Id): void {
  if (!s.sent) return;
  s.sent = s.sent.flatMap((x) => (x.to.some((t) => t.seat === seat) ? (x.to.length > 1 ? [{ ...x, to: x.to.filter((t) => t.seat !== seat) }] : []) : [x]));
  if (!s.sent.length) delete s.sent;
}

/** The game's line for a card on its part's phone, {giver} and {guesser} its players' names. */
const HINTS: Record<PartnerGame, Partial<Record<PartnerRole, string>>> = {
  describe: { giver: 'Describe it to {guesser}: don’t say what’s on it!' },
  draw: { giver: 'Draw it for {guesser}: no words or letters!' },
  act: { giver: 'Act it out for {guesser}: no talking!' },
  help: { giver: 'Help {guesser} with this: don’t just read it out!' },
  split: { giver: 'Your half: share it with {guesser} and work it out together!', guesser: 'Your half: share it with {giver} and work it out together!' },
  custom: {},
};

/**
 * The lines above a card on a phone: its part ("Describer") when everyone it goes to plays that part, and its line
 * (the card's own, else the game's for that part), {giver} and {guesser} filled in with names. Never what's on it.
 */
export function cardLines(
  rules: PartnerRules,
  s: Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'>,
  card: Pick<ClueCard, 'hint'>,
  to: Id[],
  name: (id: Id) => string,
): { role?: string; hint?: string } {
  const r = partnerRoles(s);
  const parts = new Set(to.map((id) => (r.solo ? '' : id === r.giver ? 'giver' : id === r.guesser ? 'guesser' : '')));
  const part = parts.size === 1 ? ([...parts][0] as PartnerRole | '') : '';
  const fill = (t: string) => t.replace(/\{(giver|guesser)\}/g, (_, k: PartnerRole) => (r[k] ? name(r[k]!) : 'your partner'));
  const own = card.hint?.trim();
  const hint = own ? fill(own) : part && !r.solo ? fill(HINTS[rules.game][part] ?? '') : '';
  return { ...(part ? { role: partWords(rules)[part] } : {}), ...(hint ? { hint } : {}) };
}

/**
 * The card files to put in the buzzer room now, by media id (partner-clues spec §13.5, §15.2): those of the cards the
 * host sent (and didn't edit since) that the room doesn't hold (`held`: its ids for what it holds now), and those of the
 * cards got ready (⇡) that were never put in this room (`put`: every file put there, Session.remote.files). Never a
 * card's that wasn't sent or got ready, so a reload only finishes what a press started. `failed`: not tried again.
 */
export function filesWanted(
  game: Pick<Game, 'media'>,
  clue: Pick<Clue, 'cards'>,
  s: Pick<PartnerState, 'sent' | 'ready'>,
  held: Record<Id, string>,
  put: Record<Id, string>,
  failed: Record<Id, LeftOut> = {},
): Id[] {
  const out = new Set<Id>();
  for (const card of cardSlides(clue)) {
    const sends = cardSends(s, card.id);
    const sent = sends.length > 0 && sends.every((x) => x.hash === cardHash(card));
    if (sent) for (const id of filesToSend(phoneCard(game, card, { files: held, failed }))) out.add(id);
    else if (s.ready?.includes(card.id)) for (const id of filesToSend(phoneCard(game, card, { files: put, failed }))) out.add(id);
  }
  return [...out];
}
