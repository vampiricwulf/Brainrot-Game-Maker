import { describe, expect, it } from 'vitest';
import { gameRules, MAX_CARDS, newClue, newFinalRound, newImageEl, PARTNER_GAMES, setSlideText, textSlide, type Clue, type PartnerGame, type PartnerRules } from './model';
import {
  addCard,
  cardCopyText,
  cardHash,
  cardKept,
  cardsToFinish,
  deleteCard,
  FINAL_GOES_TO,
  finalGoesToLabel,
  goesToLabel,
  missCosts,
  partnerRules,
  partWho,
  partWords,
  pointsChoice,
  pointsChoices,
  sameAsAnswer,
  setPartnerGame,
  setPartnerPoints,
  setCardName,
  setPartnerShare,
  setPartWord,
  startingCards,
  tilePoints,
  typedShare,
} from './partner';
import { cardFromAnswer } from './ops';
import { slideHasContent } from './usage';

const GAMES = Object.keys(PARTNER_GAMES) as PartnerGame[];

function partnerClue(game: PartnerGame = 'describe'): Clue {
  const clue = { ...newClue(), type: 'partner' as const };
  setPartnerGame(clue, game);
  return clue;
}

describe('partner clue rules', () => {
  it('has the ready-made games of the spec: the partner gives, and a miss costs the guesser half', () => {
    const d = gameRules('describe');
    expect(d).toEqual({ game: 'describe', giver: 'partner', got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true, points: 'game' });
    expect(gameRules('help')).toMatchObject({ got: { giver: 50, guesser: 100 }, missed: { giver: 0, guesser: -50 } });
    expect(gameRules('split')).toMatchObject({ got: { giver: 100, guesser: 100 }, missed: { giver: 0, guesser: -50 } });
    expect(partWords(gameRules('help'))).toEqual({ giver: 'Helper', guesser: 'Answerer' });
    // A fresh copy every time: changing one clue's rules never changes the game's.
    gameRules('describe').got.giver = 7;
    expect(PARTNER_GAMES.describe.got.giver).toBe(100);
  });

  it('plays Describe it when a clue has no rules saved', () => {
    expect(partnerRules({})).toEqual(gameRules('describe'));
  });

  it('no ready-made Points choice in any game costs the partner, whoever gives', () => {
    for (const g of GAMES)
      for (const { value } of pointsChoices(g).filter((c) => c.value !== 'custom'))
        for (const giver of ['partner', 'picker'] as const) {
          const clue = partnerClue(g);
          clue.partner!.giver = giver;
          setPartnerPoints(clue, value);
          const r = clue.partner!;
          const partner = giver === 'partner' ? 'giver' : 'guesser';
          // (The game's own shares never cost the giver; with the picker giving, the partner is kept at 0 or more.)
          expect(tilePoints(r, 400, false)[partner]).toBeGreaterThanOrEqual(0);
          expect(tilePoints(r, 400, true)[partner]).toBeGreaterThanOrEqual(0);
        }
  });

  it('works out the points of §9.3 on a $400 tile', () => {
    const at = (r: PartnerRules, got: boolean) => tilePoints(r, 400, got);
    const d = gameRules('describe');
    expect([at(d, true), at(d, false)]).toEqual([
      { giver: 400, guesser: 200 },
      { giver: 0, guesser: -200 },
    ]);
    // After ⇄ Swap (the picker describes): the partner guesses, and never loses points.
    const swapped = { ...d, giver: 'picker' as const };
    expect(at(swapped, false)).toEqual({ giver: 0, guesser: 0 });
    // "No penalty" and "The guesser loses it all".
    const none = partnerClue();
    setPartnerPoints(none, 'none');
    expect([at(none.partner!, true), at(none.partner!, false)]).toEqual([
      { giver: 400, guesser: 200 },
      { giver: 0, guesser: 0 },
    ]);
    const all = partnerClue();
    setPartnerPoints(all, 'all');
    expect(at(all.partner!, false)).toEqual({ giver: 0, guesser: -400 });
    // Custom: 150% / 0% if got, −25% / −25% if missed, the tick off, then on.
    const custom: PartnerRules = { ...d, got: { giver: 150, guesser: 0 }, missed: { giver: -25, guesser: -25 }, partnerSafe: false, points: 'custom' };
    expect([at(custom, true), at(custom, false)]).toEqual([
      { giver: 600, guesser: 0 },
      { giver: -100, guesser: -100 },
    ]);
    expect(at({ ...custom, partnerSafe: true }, false)).toEqual({ giver: 0, guesser: -100 });
    // Help a friend and a split clue.
    expect(at(gameRules('help'), true)).toEqual({ giver: 200, guesser: 400 });
    expect(at(gameRules('split'), true)).toEqual({ giver: 400, guesser: 400 });
    // Whole points: half of $25 rounds; no "−0".
    expect(tilePoints(d, 25, true)).toEqual({ giver: 25, guesser: 13 });
    expect(Object.is(tilePoints(d, 0, false).guesser, 0)).toBe(true);
  });

  it('says whether a miss costs anyone', () => {
    expect(missCosts(gameRules('describe'))).toBe(true);
    const none = partnerClue();
    setPartnerPoints(none, 'none');
    expect(missCosts(none.partner!)).toBe(false);
    // Swapped, the game's own points cost nobody (the partner guesses, and never loses points).
    expect(missCosts({ ...gameRules('describe'), giver: 'picker' })).toBe(false);
  });

  it('says who plays each part, in the game’s words', () => {
    const r = gameRules('describe');
    expect([partWho(r, 'giver'), partWho(r, 'guesser')]).toEqual(['the partner', 'the picker']);
    expect([partWho({ ...r, giver: 'picker' }, 'giver')]).toEqual(['the picker']);
    expect(goesToLabel(r, 'giver')).toBe('the describer (the partner)');
    expect(goesToLabel(r, 'guesser', false)).toBe('the guesser');
    expect(goesToLabel(r, 'nobody')).toBe('nobody (I’ll choose when playing)');
    expect(goesToLabel(gameRules('split'), 'giver')).toBe('the half A (the partner)');
  });
});

describe('changing a partner clue’s rules', () => {
  it('choosing a game fills in its rules, its starting cards when there are none, and a 45 s countdown', () => {
    const clue = partnerClue('split');
    expect(clue.partner).toEqual(gameRules('split'));
    expect(clue.cards!.map((c) => c.to)).toEqual(['giver', 'guesser']);
    expect(clue.timerSeconds).toBeUndefined();
    // Cards already there stay as they are.
    setSlideText(clue.cards![0], 'Half of it');
    clue.partner!.includePicker = true;
    clue.partner!.giver = 'picker';
    setPartnerGame(clue, 'draw');
    expect(clue.partner).toEqual({ ...gameRules('draw'), includePicker: true });
    expect(clue.cards).toHaveLength(2);
    expect(clue.timerSeconds).toBe(45);
    // A countdown of its own is kept.
    const timed = { ...newClue(), timerSeconds: 20 };
    setPartnerGame(timed, 'act');
    expect(timed.timerSeconds).toBe(20);
    // Help a friend and a split clue don't fill one in.
    const help = { ...newClue() };
    setPartnerGame(help, 'help');
    expect(help.timerSeconds).toBeUndefined();
  });

  it('Custom keeps the rules as they were, with the words they had, and starts with no card', () => {
    const clue = partnerClue('help');
    clue.partner!.got.giver = 75;
    setPartnerGame(clue, 'custom');
    expect(clue.partner).toMatchObject({ game: 'custom', points: 'custom', got: { giver: 75, guesser: 100 }, words: { giver: 'Helper', guesser: 'Answerer' } });
    expect(clue.cards).toHaveLength(1);
    const bare = { ...newClue() };
    setPartnerGame(bare, 'custom');
    expect(bare.cards).toBeUndefined();
  });

  it('the last game’s starting cards, still empty, give way to the new game’s: Split clue gets a card for each half', () => {
    const clue = partnerClue('describe');
    setPartnerGame(clue, 'split');
    expect(clue.cards!.map((c) => c.to)).toEqual(['giver', 'guesser']);
    setPartnerGame(clue, 'help');
    expect(clue.cards!.map((c) => c.to)).toEqual(['giver']);
    // A card sent elsewhere stays, and so does one with something on it.
    clue.cards![0].to = 'both';
    setPartnerGame(clue, 'split');
    expect(clue.cards!.map((c) => c.to)).toEqual(['both']);
    clue.cards![0].to = 'giver';
    setSlideText(clue.cards![0], 'Half of it');
    setPartnerGame(clue, 'describe');
    setPartnerGame(clue, 'split');
    expect(clue.cards!.map((c) => [c.to, slideHasContent(c)])).toEqual([['giver', true]]);
    // Custom keeps the empty ones.
    const custom = partnerClue('split');
    setPartnerGame(custom, 'custom');
    expect(custom.cards).toHaveLength(2);
  });

  it('a starting card the host named stays, even empty (an unnamed one still gives way)', () => {
    const clue = partnerClue('describe');
    const first = clue.cards![0];
    setCardName(first, 'Clue tip');
    setPartnerGame(clue, 'split');
    expect(clue.cards).toEqual([first]);
    // (Back on Describe it, its one card is its starting card again: unnamed, Split clue's replace it.)
    setCardName(first, '');
    setPartnerGame(clue, 'describe');
    expect(clue.cards).toEqual([first]);
    setPartnerGame(clue, 'split');
    expect(clue.cards!.map((c) => c.to)).toEqual(['giver', 'guesser']);
    expect(clue.cards![0]).not.toBe(first);
  });

  it('a Points choice sets the numbers, and typing one makes it Custom', () => {
    const clue = partnerClue();
    expect(pointsChoice(clue.partner!)).toBe('game');
    setPartnerShare(clue, 'missed', 'guesser', -75);
    expect(clue.partner).toMatchObject({ missed: { giver: 0, guesser: -75 }, points: 'custom' });
    setPartnerShare(clue, 'got', 'giver', 5000);
    expect(clue.partner!.got.giver).toBe(1000);
    setPartnerPoints(clue, 'game');
    expect(clue.partner).toMatchObject({ got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, points: 'game' });
    // Saved without a choice (a hand-edited game): the one the numbers match.
    const { points: _p, ...bare } = clue.partner!;
    expect(pointsChoice(bare)).toBe('game');
    expect(pointsChoice({ ...bare, missed: { giver: 0, guesser: 0 } })).toBe('none');
    expect(pointsChoice({ ...bare, missed: { giver: 0, guesser: -100 } })).toBe('all');
    expect(pointsChoice({ ...bare, missed: { giver: 0, guesser: -30 } })).toBe('custom');
    expect(pointsChoices('custom').map((c) => c.value)).toEqual(['none', 'all', 'custom']);
    expect(pointsChoices('describe')[0].label).toBe('Describe it’s');
    // In the clue's own part words.
    expect(pointsChoices('describe').find((c) => c.value === 'all')?.label).toBe('The guesser loses it all');
    expect(pointsChoices('help', partWords(gameRules('help')).guesser).find((c) => c.value === 'all')?.label).toBe('The answerer loses it all');
  });

  it('reads a typed share within ±1000%', () => {
    expect([typedShare('50'), typedShare('−50'), typedShare('12.6'), typedShare('99999'), typedShare(''), typedShare('x')]).toEqual([50, -50, 13, 1000, null, null]);
  });

  it('keeps typed part words (blank: the game’s again), at most 24 characters', () => {
    const clue = partnerClue();
    setPartWord(clue, 'giver', 'Spy');
    expect(partWords(clue.partner!)).toEqual({ giver: 'Spy', guesser: 'Guesser' });
    setPartWord(clue, 'guesser', 'x'.repeat(30));
    expect(clue.partner!.words!.guesser).toHaveLength(24);
    setPartWord(clue, 'giver', ' ');
    setPartWord(clue, 'guesser', '');
    expect(clue.partner!.words).toBeUndefined();
  });
});

describe('🤫 cards', () => {
  it('starts each game’s cards empty, for the host to fill in', () => {
    for (const g of GAMES) {
      const cards = startingCards(g);
      expect(cards.map((c) => c.to)).toEqual(PARTNER_GAMES[g].cards);
      for (const c of cards) expect(c.elements.map((e) => (e.kind === 'text' ? e.text : e.kind))).toEqual(['']);
    }
    expect(new Set(startingCards('split').map((c) => c.id)).size).toBe(2);
  });

  it('adds up to six, and deleting one moves the next up without changing ids', () => {
    const clue = partnerClue();
    while (addCard(clue));
    expect(clue.cards).toHaveLength(MAX_CARDS);
    expect(addCard(clue)).toBeNull();
    const second = clue.cards![1].id;
    expect(deleteCard(clue, 0)).toBe(0);
    expect(clue.cards![0].id).toBe(second);
    while (clue.cards) deleteCard(clue, 0);
    expect(clue.cards).toBeUndefined();
  });

  it('a Final’s: ＋ Card starts one with everyone playing it, up to six; deleting the last takes the list away', () => {
    const final = newFinalRound();
    const first = addCard(final, 'playing');
    expect(first?.to).toBe('playing');
    expect(final.cards).toEqual([first]);
    while (addCard(final, 'playing'));
    expect(final.cards).toHaveLength(MAX_CARDS);
    expect(addCard(final, 'playing')).toBeNull();
    expect(final.cards!.every((c) => c.to === 'playing')).toBe(true);
    while (final.cards) deleteCard(final, 0);
    expect('cards' in final).toBe(false);
    // (A tile's still go to its giver or its picker.)
    expect(addCard(partnerClue())?.to).toBe('giver');
    expect(addCard(newClue())?.to).toBe('picker');
  });

  it('says who a Final’s card starts with: everyone playing it, or nobody', () => {
    expect(FINAL_GOES_TO).toEqual(['playing', 'nobody']);
    expect(FINAL_GOES_TO.map((to) => finalGoesToLabel(to))).toEqual(['everyone playing it (ticked on the wager screen)', 'nobody (I’ll choose when playing)']);
    expect(FINAL_GOES_TO.map((to) => finalGoesToLabel(to, false))).toEqual(['everyone playing', 'nobody']);
    // (Never on a clue, but every Goes to has words.)
    expect(goesToLabel(gameRules('describe'), 'playing')).toBe('everyone playing');
  });

  it('keeps a name as typed, at most 60 characters; blank, it has none ("Card 2" again)', () => {
    const card = startingCards('describe')[0];
    setCardName(card, 'Clue tip');
    expect(card.name).toBe('Clue tip');
    setCardName(card, ' Leader hint ');
    expect(card.name).toBe(' Leader hint ');
    setCardName(card, '  ');
    expect('name' in card).toBe(false);
    setCardName(card, 'x');
    setCardName(card, '');
    expect('name' in card).toBe(false);
    setCardName(card, 'N'.repeat(70));
    expect(card.name).toBe('N'.repeat(60));
  });

  it('a card with words or files on it, or a name, is the host’s', () => {
    const card = startingCards('describe')[0];
    expect(cardKept(card)).toBe(false);
    card.name = '  ';
    expect(cardKept(card)).toBe(false);
    card.name = 'Clue tip';
    expect(cardKept(card)).toBe(true);
    delete card.name;
    setSlideText(card, 'Shrek');
    expect(cardKept(card)).toBe(true);
  });

  it('a name is never sent: not in the card’s hash, nor in its copied words', () => {
    const card = { ...startingCards('describe')[0], ...textSlide('Shrek') };
    const was = cardHash(card);
    setCardName(card, 'Clue tip');
    expect(cardHash(card)).toBe(was);
    const copied = cardCopyText({ media: [] }, card, 1, 'Movies $400', ['Ann']);
    expect(copied).toBe('🤫 For Ann only (Movies $400, card 1): Shrek');
    expect(copied).not.toContain('Clue tip');
    // A Final's, by the Final's name and its place.
    const hint = { ...addCard(newFinalRound(), 'playing')!, ...textSlide('Go big') };
    setCardName(hint, 'Leader hint');
    const fromFinal = cardCopyText({ media: [] }, hint, 1, 'Final Jeopardy!', ['Ann', 'Bob']);
    expect(fromFinal).toBe('🤫 For Ann and Bob only (Final Jeopardy!, card 1): Go big');
    expect(fromFinal).not.toContain('Leader hint');
  });

  it('says what a tile’s cards still need', () => {
    const clue = partnerClue();
    expect(cardsToFinish(clue)).toBe(1);
    setSlideText(clue.cards![0], 'Shrek');
    expect(cardsToFinish(clue)).toBeNull();
    addCard(clue);
    expect(cardsToFinish(clue)).toBe(2);
    delete clue.cards;
    expect(cardsToFinish(clue)).toBe('none');
    // A Custom game's cards are up to the host. Any other tile's cards are its own extra (cards anywhere, P3): none is
    // fine, an empty one is still to fill in.
    clue.partner!.game = 'custom';
    expect(cardsToFinish(clue)).toBeNull();
    expect(cardsToFinish({ ...partnerClue(), type: 'standard' })).toBe(1);
    expect(cardsToFinish({ ...partnerClue(), type: 'dailyDouble', cards: undefined })).toBeNull();
  });

  it('⧉ Same as the answer copies it once, with fresh ids: changing the answer afterwards leaves the card', () => {
    const clue = partnerClue();
    setSlideText(clue.answerSlide, 'Shrek');
    clue.answerSlide.elements.push(newImageEl('pic'));
    clue.answerSlide.background = { color: '#123456' };
    const card = clue.cards![0];
    expect(sameAsAnswer(clue, card)).toBe(false);
    cardFromAnswer(clue, card);
    expect(card.elements.map((e) => e.kind)).toEqual(['text', 'image']);
    expect(card.background).toEqual({ color: '#123456' });
    expect(card.elements.some((e) => clue.answerSlide.elements.some((a) => a.id === e.id))).toBe(false);
    expect(sameAsAnswer(clue, card)).toBe(true);
    // (Case and spacing aside.)
    setSlideText(card, '  shrek ');
    expect(sameAsAnswer(clue, card)).toBe(true);
    setSlideText(clue.answerSlide, 'Shrek 2');
    expect(card.elements[0].kind === 'text' && card.elements[0].text).toBe('  shrek ');
    expect(sameAsAnswer(clue, card)).toBe(false);
    // No words on either: not "the same".
    expect(sameAsAnswer({ answerSlide: { background: {}, elements: [] } }, { background: {}, elements: [] })).toBe(false);
  });

  it('an answer that is only a picture: a card with that picture and no words of its own shows the answer', () => {
    const clue = partnerClue();
    clue.answerSlide.elements = [newImageEl('pic')];
    const card = clue.cards![0];
    expect(sameAsAnswer(clue, card)).toBe(false);
    cardFromAnswer(clue, card);
    expect(sameAsAnswer(clue, card)).toBe(true);
    // Words of its own, or another picture: the host's card.
    setSlideText(card, 'A hint');
    expect(sameAsAnswer(clue, card)).toBe(false);
    card.elements = [newImageEl('other')];
    expect(sameAsAnswer(clue, card)).toBe(false);
  });
});

describe('what viewers see', () => {
  // The stream draws a clue's question and answer slides only: a 🤫 card must never reach it by accident.
  const viewers = import.meta.glob<string>(['/src/play/AudienceView.svelte', '/src/play/tools/ToolOverlay.svelte', '/src/play/ScoresView.svelte'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('the audience and scores windows and the tool overlay never touch cards (`.cards`, cardSlides, ClueCard or SentCard)', () => {
    expect(Object.keys(viewers)).toHaveLength(3);
    for (const [path, src] of Object.entries(viewers)) expect(/\.cards\b|cardSlides|ClueCard|SentCard|sentcards/.test(src), path).toBe(false);
  });
});
