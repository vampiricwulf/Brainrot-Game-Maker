// 🤝 Partner clues placed at random (docs/PARTNER-CLUES-SPEC.md §21, P4), like Daily Doubles: a board's count, 🔀 Randomize
// and Start game for the ones missing put them on tiles with a written question and answer, never on a Daily Double,
// spread over the categories; each keeps its own rules and cards, or gets the round's game and a copy of its answer.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { cardSlides, migrateGame, newImageEl, partnerTilesPlaced, setSlideText, slideText, type BoardRound, type Game } from './model';
import { addCard, newCard, partnerSpot, setPartnerGame } from './partner';
import { answerCardDue, copyClue, followDailyDoubles, pastedCardDue, pastedPartnerCard, placePartner, randomizePartnerTiles, setClueType } from './ops';
import { randomizeDailyDoubles } from './session';
import { dailyDoublesLine, partnersLine, partnerTilesMost, partnerTilesOver, partnerTilesShort, placedLine, validate } from './validate';
import { answerCardAt, checklistLines } from './checklist';

/** A seeded random: the same picks every run. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** A board of 6 × 5 tiles, every one written ("Q c.r" / "A c.r"), no Daily Doubles placed. */
function board(): { g: Game; r: BoardRound } {
  const g = jeopardyGame();
  const r = g.rounds[0] as BoardRound;
  r.dailyDoubleCount = 0;
  r.categories.forEach((c, ci) =>
    c.clues.forEach((cl, row) => {
      cl.type = 'standard';
      setSlideText(cl.questionSlide, `Q ${ci}.${row}`);
      setSlideText(cl.answerSlide, `A ${ci}.${row}`);
    }),
  );
  // (Named, as a finished board is: a default "Category N" is a note of its own.)
  r.categories.forEach((c, ci) => (c.title = `Topic ${ci + 1}`));
  return { g, r };
}

const partners = (r: BoardRound) => r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'partner'));

describe('where one can go (partnerSpot)', () => {
  it('a standard tile that plays, with a written question and answer: never a Daily Double, a wheel, an empty tile or ✍', () => {
    const { r } = board();
    const [a, b, c, d, e] = r.categories[0].clues;
    expect(partnerSpot(a)).toBe(true);
    b.type = 'dailyDouble';
    c.type = 'wheel';
    d.empty = true;
    e.everyone = true;
    for (const cl of [b, c, d, e]) expect(partnerSpot(cl)).toBe(false);
    const f = r.categories[1].clues[0];
    setSlideText(f.answerSlide, '');
    expect(partnerSpot(f)).toBe(false);
    const q = r.categories[1].clues[1];
    setSlideText(q.questionSlide, '');
    expect(partnerSpot(q)).toBe(false);
  });
});

describe('🔀 Randomize (randomizePartnerTiles)', () => {
  it('places the count asked for, spread over the categories, only on written tiles, never on a Daily Double', () => {
    const { r } = board();
    r.categories[0].clues[2].type = 'dailyDouble';
    setSlideText(r.categories[1].clues[0].answerSlide, '');
    expect(randomizePartnerTiles(r, 6, seeded())).toBe(6);
    expect(partnerTilesPlaced(r)).toBe(6);
    // Six categories, six partner clues: one in each.
    expect(r.categories.map((c) => c.clues.filter((cl) => cl.type === 'partner').length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.categories[0].clues[2].type).toBe('dailyDouble');
    expect(r.categories[1].clues[0].type).toBe('standard');
  });

  it('the same seed, the same tiles; again, they move (the ones placed go back to standard tiles)', () => {
    const one = board();
    const two = board();
    randomizePartnerTiles(one.r, 3, seeded(1));
    randomizePartnerTiles(two.r, 3, seeded(1));
    const where = (r: BoardRound) => r.categories.flatMap((c, ci) => c.clues.flatMap((cl, row) => (cl.type === 'partner' ? [`${ci}.${row}`] : [])));
    expect(where(one.r)).toEqual(where(two.r));
    randomizePartnerTiles(one.r, 2, seeded(99));
    expect(partnerTilesPlaced(one.r)).toBe(2);
  });

  it('every tile gets one fairly over many tries', () => {
    const hits = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const { r } = board();
      randomizePartnerTiles(r, 6, seeded(i + 1));
      for (const [ci, c] of r.categories.entries()) c.clues.forEach((cl, row) => cl.type === 'partner' && hits.set(`${ci}.${row}`, (hits.get(`${ci}.${row}`) ?? 0) + 1));
    }
    // 30 tiles, one a category each time: each about 600 / 5 = 120 times.
    expect(hits.size).toBe(30);
    for (const n of hits.values()) expect(n).toBeGreaterThan(60);
  });

  it('pressed again, the tiles it moves off are standard tiles as before: no countdown, card or rules of their own', () => {
    for (const cardFrom of ['answer', 'empty'] as const) {
      const { r } = board();
      if (cardFrom === 'empty') r.partnerCardFrom = 'empty';
      const before = new Map(r.categories.flatMap((c) => c.clues.map((cl) => [cl.id, JSON.stringify(cl)] as const)));
      randomizePartnerTiles(r, 6, seeded(1));
      randomizePartnerTiles(r, 6, seeded(2));
      const standard = r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'standard'));
      expect(standard).toHaveLength(24);
      for (const cl of standard) expect(JSON.stringify(cl)).toBe(before.get(cl.id));
      // (And none of the checks' "card 1 is empty" about a tile that isn't a partner clue.)
      expect(standard.some((cl) => cl.cards || cl.partner || cl.timerSeconds !== undefined)).toBe(false);
    }
  });

  it('answers that are only pictures: a card that copied one goes too, with its countdown', () => {
    const { r } = board();
    r.categories.forEach((c, ci) => c.clues.forEach((cl, row) => (cl.answerSlide.elements = [newImageEl(`pic-${ci}.${row}`)])));
    const before = new Map(r.categories.flatMap((c) => c.clues.map((cl) => [cl.id, JSON.stringify(cl)] as const)));
    randomizePartnerTiles(r, 3, seeded(1));
    randomizePartnerTiles(r, 3, seeded(2));
    const standard = r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'standard'));
    for (const cl of standard) expect(JSON.stringify(cl)).toBe(before.get(cl.id));
  });

  it('a card the host wrote and rules they changed stay with a tile it moves off; a copy of an old answer never does', () => {
    const { r } = board();
    randomizePartnerTiles(r, 3, seeded(4));
    const [mine, rules, plain] = partners(r);
    setSlideText(cardSlides(mine)[0], 'My own words');
    rules.partner!.got.giver = 80;
    randomizePartnerTiles(r, 0, seeded(5));
    expect(partners(r)).toHaveLength(0);
    expect(cardSlides(mine).map(slideText)).toEqual(['My own words']);
    expect(mine.partner?.game).toBe('describe');
    expect(rules.partner?.got.giver).toBe(80);
    expect(rules.timerSeconds).toBe(45);
    // (Its card was only a copy of its answer: it goes, and the rules it was given with it.)
    expect(cardSlides(rules)).toEqual([]);
    expect([plain.cards, plain.partner, plain.timerSeconds]).toEqual([undefined, undefined, undefined]);
    // The host changes that tile's answer: placed again, its card is the new answer, never the old one.
    setSlideText(plain.answerSlide, 'NEW answer');
    placePartner(r, plain);
    expect(cardSlides(plain).map(slideText)).toEqual(['NEW answer']);
    expect(plain.timerSeconds).toBe(45);
    // A countdown the tile had of its own stays.
    const timed = r.categories[5].clues[4];
    timed.timerSeconds = 20;
    placePartner(r, timed);
    randomizePartnerTiles(r, 0, seeded(6));
    expect([timed.type, timed.timerSeconds, timed.partner, timed.cards]).toEqual(['standard', 20, undefined, undefined]);
  });

  it('a card the host named stays with a tile it moves off, even a copy of its answer; placed again, it keeps it', () => {
    const { r } = board();
    randomizePartnerTiles(r, 3, seeded(4));
    const [named, empty] = partners(r);
    cardSlides(named)[0].name = 'Clue tip';
    setSlideText(cardSlides(empty)[0], '');
    cardSlides(empty)[0].name = 'Tip 2';
    const answer = slideText(named.answerSlide);
    randomizePartnerTiles(r, 0, seeded(5));
    expect([named.type, cardSlides(named).map((c) => [c.name, slideText(c)])]).toEqual(['standard', [['Clue tip', answer]]]);
    expect(cardSlides(empty).map((c) => [c.name, slideText(c)])).toEqual([['Tip 2', '']]);
    // (A named card, even an empty one, is the tile's own: placing it again gives it no other.)
    placePartner(r, empty);
    expect(cardSlides(empty).map((c) => [c.name, slideText(c)])).toEqual([['Tip 2', '']]);
  });

  it('one moved to Help a friend or Split clue (no countdown of their own) goes back without the 45 s it was placed with', () => {
    for (const game of ['help', 'split'] as const) {
      const { r } = board();
      const cl = r.categories[0].clues[0];
      placePartner(r, cl);
      setPartnerGame(cl, game);
      expect(cl.timerSeconds).toBe(45);
      randomizePartnerTiles(r, 0);
      expect([cl.type, cl.cards, cl.partner, cl.timerSeconds]).toEqual(['standard', undefined, undefined, undefined]);
    }
  });

  it('in a round of Help a friend or Split clue, a 45 s countdown the host gave a tile stays with it (placing it gave none)', () => {
    for (const game of ['help', 'split'] as const) {
      const { r } = board();
      r.partnerGame = game;
      const cl = r.categories[0].clues[0];
      cl.timerSeconds = 45;
      placePartner(r, cl);
      expect(cl.partner?.game).toBe(game);
      randomizePartnerTiles(r, 0);
      expect([cl.type, cl.cards, cl.partner, cl.timerSeconds]).toEqual(['standard', undefined, undefined, 45]);
    }
  });

  it('Start game’s card is a copy of the answer whatever the round says (cardFrom): an empty one couldn’t be filled in', () => {
    const { r } = board();
    r.partnerCardFrom = 'empty';
    randomizePartnerTiles(r, 2, seeded(3), { keepExisting: true, cardFrom: 'answer' });
    expect(partners(r).every((cl) => cardSlides(cl).map(slideText)[0] === slideText(cl.answerSlide))).toBe(true);
    // (🔀 Randomize in the editor follows the round: an empty card, for the host to fill in.)
    randomizePartnerTiles(r, 2, seeded(3));
    expect(partners(r).every((cl) => cardSlides(cl).map(slideText)[0] === '')).toBe(true);
  });

  it('keepExisting (Start game) keeps the ones on the board and only adds the missing ones', () => {
    const { r } = board();
    const mine = r.categories[2].clues[4];
    placePartner(r, mine);
    expect(randomizePartnerTiles(r, 3, seeded(), { keepExisting: true })).toBe(2);
    expect(mine.type).toBe('partner');
    expect(partnerTilesPlaced(r)).toBe(3);
    expect(randomizePartnerTiles(r, 3, seeded(), { keepExisting: true })).toBe(0);
  });

  it('no more than there are written tiles for', () => {
    const { r } = board();
    r.categories.forEach((c, ci) => ci > 0 && c.clues.forEach((cl) => setSlideText(cl.questionSlide, '')));
    expect(randomizePartnerTiles(r, 9, seeded())).toBe(5);
  });

  it('Daily Doubles placed afterwards never land on one', () => {
    for (let i = 0; i < 50; i++) {
      const { r } = board();
      randomizePartnerTiles(r, 6, seeded(i + 3));
      const ids = partners(r).map((cl) => cl.id);
      expect(randomizeDailyDoubles(r, 6, seeded(i + 11), { keepExisting: true })).toBe(6);
      expect(partners(r).map((cl) => cl.id)).toEqual(ids);
      // And partner clues placed after them never land on one.
      const dds = r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').map((cl) => cl.id));
      randomizePartnerTiles(r, 12, seeded(i + 5));
      expect(r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').map((cl) => cl.id))).toEqual(dds);
      expect(partnerTilesPlaced(r)).toBe(12);
    }
  });
});

describe('what one placed at random plays (placePartner)', () => {
  it('the round’s game (Describe it by default), a 45 s countdown, and a copy of the tile’s answer for the giver', () => {
    const { r } = board();
    const cl = r.categories[0].clues[1];
    placePartner(r, cl);
    expect(cl.type).toBe('partner');
    expect(cl.partner?.game).toBe('describe');
    expect(cl.timerSeconds).toBe(45);
    const cards = cardSlides(cl);
    expect(cards).toHaveLength(1);
    expect(cards[0].to).toBe('giver');
    expect(slideText(cards[0])).toBe('A 0.1');
    // A copy, with its own ids: changing the answer afterwards leaves the card as it was.
    expect(cards[0].elements[0].id).not.toBe(cl.answerSlide.elements[0].id);
    setSlideText(cl.answerSlide, 'Changed');
    expect(slideText(cards[0])).toBe('A 0.1');
  });

  it('the round can say another game, and an empty card to fill in', () => {
    const { r } = board();
    r.partnerGame = 'split';
    r.partnerCardFrom = 'empty';
    const cl = r.categories[0].clues[1];
    placePartner(r, cl);
    expect(cl.partner?.game).toBe('split');
    expect(cl.timerSeconds ?? null).toBeNull();
    expect(cardSlides(cl).map((c) => [c.to, slideText(c)])).toEqual([
      ['giver', ''],
      ['guesser', ''],
    ]);
    // Split clue with the answer: the first half is the answer, the second still to fill in.
    delete r.partnerCardFrom;
    const two = r.categories[0].clues[2];
    placePartner(r, two);
    expect(cardSlides(two).map((c) => slideText(c))).toEqual(['A 0.2', '']);
    // Custom has no starting card: the copy goes to its giver.
    r.partnerGame = 'custom';
    const three = r.categories[0].clues[3];
    placePartner(r, three);
    expect(cardSlides(three).map((c) => [c.to, slideText(c)])).toEqual([['giver', 'A 0.3']]);
  });

  it('a tile that was a partner clue keeps its own rules and cards', () => {
    const { r } = board();
    const cl = r.categories[0].clues[1];
    placePartner(r, cl);
    cl.partner!.game = 'help';
    setSlideText(cardSlides(cl)[0], 'My own hint');
    cl.type = 'standard';
    r.partnerGame = 'draw';
    placePartner(r, cl);
    expect(cl.partner?.game).toBe('help');
    expect(cardSlides(cl).map(slideText)).toEqual(['My own hint']);
    // Its cards empty (a game's starting card never filled in): the round's card instead.
    setSlideText(cardSlides(cl)[0], '');
    placePartner(r, cl);
    expect(cardSlides(cl).map(slideText)).toEqual(['A 0.1']);
  });
});

describe('the checks', () => {
  it('no count, no checks; short (Start places them), over, and more than there are written tiles for', () => {
    const { g, r } = board();
    expect(partnerTilesShort(r)).toBeNull();
    r.partnerCount = 2;
    expect(partnerTilesShort(r)).toEqual({ want: 2, placed: 0, most: 30 });
    const texts = () => validate(g).filter((p) => p.tab === 0).map((p) => p.text);
    expect(texts()).toContain('Jeopardy!: 2 partner clues not placed yet (Start game puts them on the board at random)');
    randomizePartnerTiles(r, 2, seeded());
    expect(partnerTilesShort(r)).toBeNull();
    placePartner(r, r.categories.flatMap((c) => c.clues).find((cl) => cl.type === 'standard')!);
    expect(partnerTilesOver(r)).toEqual({ want: 2, placed: 3 });
    expect(texts()).toContain('Jeopardy!: 3 partner clues placed, but 🤝 Partner clues says 2 (all 3 play)');
    r.partnerCount = 40;
    expect(texts()).toContain('Jeopardy!: 🤝 Partner clues says 40, but only 30 tiles have a written question and answer for one (partner clues never go on a Daily Double)');
  });

  it('the checklist counts them as clues to write, not things to fix', () => {
    const { g, r } = board();
    r.partnerCount = 2;
    const line = checklistLines(g, validate(g)).find((l) => l.tab === 0);
    expect(line?.level).toBe('info');
    expect(line?.text).toBe('Jeopardy!: 2 partner clues not placed yet (Start game puts them on the board at random)');
  });

  it('a hand-edited count, game or card the app can’t use goes', () => {
    const { g, r } = board();
    r.partnerCount = 3;
    r.partnerGame = 'act';
    r.partnerCardFrom = 'empty';
    const back = migrateGame(JSON.parse(JSON.stringify(g))).rounds[0] as BoardRound;
    expect([back.partnerCount, back.partnerGame, back.partnerCardFrom]).toEqual([3, 'act', 'empty']);
    const bad = JSON.parse(JSON.stringify(g));
    Object.assign(bad.rounds[0], { partnerCount: 'lots', partnerGame: 'chess', partnerCardFrom: 'the question' });
    const fixed = migrateGame(bad).rounds[0] as BoardRound;
    expect([fixed.partnerCount, fixed.partnerGame, fixed.partnerCardFrom]).toEqual([undefined, undefined, undefined]);
    const big = JSON.parse(JSON.stringify(g));
    big.rounds[0].partnerCount = 1e6 + 0.5;
    expect((migrateGame(big).rounds[0] as BoardRound).partnerCount).toBe(100);
    const none = JSON.parse(JSON.stringify(g));
    none.rounds[0].partnerCount = 0;
    expect((migrateGame(none).rounds[0] as BoardRound).partnerCount).toBeUndefined();
  });
});

describe('made by hand, the 🤝 count follows (as ⭐ Daily Doubles does)', () => {
  it('making one raises the box to the number on the board; making it a standard tile again leaves the box', () => {
    const { r } = board();
    expect(r.partnerCount).toBeUndefined();
    setClueType(r, r.categories[0].clues[0], 'partner');
    expect(r.partnerCount).toBe(1);
    setClueType(r, r.categories[1].clues[0], 'partner');
    expect(r.partnerCount).toBe(2);
    setClueType(r, r.categories[1].clues[0], 'standard');
    expect(r.partnerCount).toBe(2);
    // A bigger box stays: Start places the rest.
    r.partnerCount = 5;
    setClueType(r, r.categories[2].clues[0], 'partner');
    expect(r.partnerCount).toBe(5);
  });

  it('a pasted one counts, and an empty tile doesn’t', () => {
    const { r } = board();
    const c = r.categories[0].clues[0];
    setClueType(r, c, 'partner');
    r.categories[3].clues[2] = copyClue(c);
    followDailyDoubles(r);
    expect(r.partnerCount).toBe(2);
    r.categories[4].clues[2] = { ...copyClue(c), empty: true };
    followDailyDoubles(r);
    expect(r.partnerCount).toBe(2);
  });
});

describe('made by hand, Card 1 is a copy of the answer (as one placed at random)', () => {
  it('a tile with an answer: its card copies it, once; the round’s “empty, to fill in” keeps it empty', () => {
    const { r } = board();
    const c = r.categories[0].clues[1];
    expect(answerCardDue(r, c)).toBe(true);
    expect(setClueType(r, c, 'partner')).toBe(true);
    expect(cardSlides(c).map((k) => [slideText(k), k.to])).toEqual([['A 0.1', 'giver']]);
    // (A copy, not a link: its own ids.)
    expect(c.cards![0].elements[0].id).not.toBe(c.answerSlide.elements[0].id);
    setSlideText(c.answerSlide, 'Shrek');
    expect(slideText(c.cards![0])).toBe('A 0.1');
    const e = r.categories[1].clues[1];
    r.partnerCardFrom = 'empty';
    expect(answerCardDue(r, e)).toBe(false);
    expect(setClueType(r, e, 'partner')).toBe(false);
    expect(cardSlides(e).map(slideText)).toEqual(['']);
  });

  it('no answer yet, a card written on or named, or a partner clue already: nothing copied', () => {
    const { r } = board();
    const [a, b, c] = r.categories[2].clues;
    setSlideText(a.answerSlide, '');
    expect(setClueType(r, a, 'partner')).toBe(false);
    expect(cardSlides(a).map(slideText)).toEqual(['']);
    // A card of its own (made on the standard tile) stays as it was.
    setSlideText(addCard(b)!, 'Tip');
    expect(setClueType(r, b, 'partner')).toBe(false);
    expect(cardSlides(b).map(slideText)).toEqual(['Tip']);
    addCard(c)!.name = 'Hint';
    expect(setClueType(r, c, 'partner')).toBe(false);
    expect(cardSlides(c).map((k) => k.name)).toEqual(['Hint']);
    // Made a partner clue again: its own card, as it was.
    const d = r.categories[2].clues[3];
    setClueType(r, d, 'partner');
    setSlideText(d.cards![0], 'Mine');
    setClueType(r, d, 'standard');
    expect(setClueType(r, d, 'partner')).toBe(false);
    expect(cardSlides(d).map(slideText)).toEqual(['Mine']);
  });

  it('an empty card the host added on a standard tile gives way to the copy, as the starting cards do', () => {
    const { r } = board();
    const c = r.categories[3].clues[0];
    addCard(c);
    expect(setClueType(r, c, 'partner')).toBe(true);
    expect(cardSlides(c).map((k) => [slideText(k), k.to])).toEqual([['A 3.0', 'giver']]);
  });

  it('pasted or copied: a partner clue with an empty card gets the copy; one with its card written keeps it', () => {
    const { r } = board();
    const c = r.categories[0].clues[0];
    r.partnerCardFrom = 'empty';
    setClueType(r, c, 'partner');
    r.partnerCardFrom = 'answer';
    const pasted = copyClue(c);
    expect(pastedPartnerCard(r, pasted)).toBe(true);
    expect(cardSlides(pasted).map(slideText)).toEqual(['A 0.0']);
    expect(pastedPartnerCard(r, pasted)).toBe(false);
    // A standard tile, an empty one, or a round that keeps cards empty: nothing.
    expect(pastedPartnerCard(r, copyClue(r.categories[1].clues[0]))).toBe(false);
    expect(pastedPartnerCard(r, { ...copyClue(c), empty: true })).toBe(false);
    r.partnerCardFrom = 'empty';
    expect(pastedPartnerCard(r, copyClue(c))).toBe(false);
  });

  it('pasted: the cards a partner clue was set up with stay, the copy on Card 1 only when it goes to the giver', () => {
    const { r } = board();
    const c = r.categories[0].clues[0];
    r.partnerCardFrom = 'empty';
    setClueType(r, c, 'partner');
    r.partnerCardFrom = 'answer';
    const cards = () => cardSlides(pasted).map((k) => [slideText(k), k.to, k.hint ?? '']);
    // Card 1 to the giver with its own phone line, Card 2 to the guesser with one: the copy goes on Card 1, all else stays.
    c.cards = [{ ...newCard('giver'), hint: 'Read it to {guesser}' }, { ...newCard('guesser'), hint: 'Listen' }];
    let pasted = copyClue(c);
    expect(pastedCardDue(r, pasted)).toBe(true);
    expect(pastedPartnerCard(r, pasted)).toBe(true);
    expect(cards()).toEqual([
      ['A 0.0', 'giver', 'Read it to {guesser}'],
      ['', 'guesser', 'Listen'],
    ]);
    // Card 1 set up for the guesser (a ⚙ Custom clue): no copy there, and every card stays as it was.
    c.cards = [{ ...newCard('guesser'), hint: 'Read this aloud to {giver}' }, { ...newCard('others'), hint: 'Everyone else: buzz in' }, newCard('giver')];
    pasted = copyClue(c);
    expect(pastedCardDue(r, pasted)).toBe(false);
    expect(pastedPartnerCard(r, pasted)).toBe(false);
    expect(cards()).toEqual([
      ['', 'guesser', 'Read this aloud to {giver}'],
      ['', 'others', 'Everyone else: buzz in'],
      ['', 'giver', ''],
    ]);
    // No cards at all: its game's starting cards, the first a copy of the answer.
    delete c.cards;
    pasted = copyClue(c);
    expect(pastedPartnerCard(r, pasted)).toBe(true);
    expect(cardSlides(pasted)[0].to).toBe('giver');
    expect(slideText(cardSlides(pasted)[0])).toBe('A 0.0');
  });

  it('the checklist’s ⧉ finds the empty card, with its name for the history; gone once it has something', () => {
    const { g, r } = board();
    g.settings.buzzer = true;
    r.partnerCardFrom = 'empty';
    const c = r.categories[0].clues[1];
    setClueType(r, c, 'partner');
    const line = checklistLines(g, validate(g)).find((l) => l.round === r.id)!;
    expect(line.answerCard).toEqual({ tab: 'round', round: r.id, part: { kind: 'clue', category: r.categories[0].id, clue: c.id, side: 'card', slide: c.cards![0].id } });
    const hit = answerCardAt(g, line.answerCard!)!;
    expect([hit.card, hit.name]).toEqual([c.cards![0], `card 1 of ${r.categories[0].title} $${r.values[1]}`]);
    setSlideText(c.cards![0], 'Ogre');
    expect(answerCardAt(g, line.answerCard!)).toBeNull();
  });
});

describe('the lines beside the boxes, one shape', () => {
  it('placedLine: on the board, what Start places, or all placed (nothing for a box of 0), and notes', () => {
    expect(placedLine(1, 2, 3)).toBe('1 on the board · Start places 2 at random');
    expect(placedLine(3, 0, 3)).toBe('3 on the board · all placed');
    expect(placedLine(0, 0, 0)).toBe('0 on the board');
    expect(placedLine(0, 6, 6, ['one a category, 6 at most', ''])).toBe('0 on the board · Start places 6 at random (one a category, 6 at most)');
    // Short of it with nothing more to place: why the rest can't go, never “all placed”.
    expect(placedLine(0, 0, 3, ['on written tiles, 0 at most'], 'write a question and answer on more tiles first')).toBe('0 on the board · 3 can’t go yet: write a question and answer on more tiles first');
    expect(placedLine(3, 0, 3, [], 'never said')).toBe('3 on the board · all placed');
  });

  it('⭐ Daily Doubles and 🤝 Partner clues say it alike', () => {
    const { r } = board();
    r.dailyDoubleCount = 2;
    expect(dailyDoublesLine(r)).toBe('0 on the board · Start places 2 at random');
    r.dailyDoubleCount = 8;
    expect(dailyDoublesLine(r)).toBe('0 on the board · Start places 6 at random (one a category, 6 at most)');
    r.partnerCount = 2;
    setClueType(r, r.categories[0].clues[0], 'partner');
    expect(partnersLine(r)).toBe('1 on the board · Start places 1 at random');
    r.partnerCardFrom = 'empty';
    expect(partnersLine(r)).toBe('1 on the board · Start places 1 at random (each with a copy of its answer as its card)');
    setClueType(r, r.categories[1].clues[0], 'partner');
    expect(partnersLine(r)).toBe('2 on the board · all placed');
    r.partnerCount = 40;
    expect(partnersLine(r)).toBe('2 on the board · Start places 28 at random (on written tiles, 30 at most; each with a copy of its answer as its card)');
  });

  it('a box asking for more than can go says why, not “all placed”', () => {
    const { r } = board();
    // No tile written yet: none of the 3 can go.
    for (const c of r.categories) for (const cl of c.clues) cl.answerSlide = { background: {}, elements: [] };
    r.partnerCount = 3;
    expect(partnerTilesMost(r)).toBe(0);
    expect(partnersLine(r)).toBe('0 on the board · 3 can’t go yet: write a question and answer on more tiles first');
    // ⭐ Daily Doubles past one a category: on the board, the rest can't go.
    const { r: b } = board();
    b.dailyDoubleCount = 8;
    b.categories.forEach((c) => (c.clues[0].type = 'dailyDouble'));
    expect(dailyDoublesLine(b)).toBe('6 on the board · 2 can’t go yet: one a category, 6 at most');
  });
});
