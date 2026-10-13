// 🤝 Partner clues (docs/PARTNER-CLUES-SPEC.md): a clue's rules worked out from its game, what each part gets on a
// tile, and its 🤫 cards as the editor makes them. No Svelte state: unit-tested in partner.test.ts.
import {
  cardSlides,
  gameRules,
  MAX_CARDS,
  MAX_SHARE,
  newId,
  newTextEl,
  PART_WORD_MAX,
  PARTNER_GAMES,
  wholePoints,
  type CardGoesTo,
  type Clue,
  type ClueCard,
  type PartnerGame,
  type PartnerPoints,
  type PartnerRole,
  type PartnerRules,
  type Slide,
} from './model';
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
