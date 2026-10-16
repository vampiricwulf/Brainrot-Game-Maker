import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { gameRules, newFinalRound, newImageEl, newRound, setSlideText, slideText, textSlide, type Clue, type FinalRound, type TextEl, type BoardRound, type Game } from './model';
import { clueSlides, followClueText } from './cluetext';
import { addCard, setPartnerGame } from './partner';

const board = (g: Game, i: number = 0) => g.rounds[i] as BoardRound;
import {
  addCategory,
  cardFromAnswer,
  categoryHasContent,
  clearClue,
  clone,
  clueHasContent,
  copyClue,
  deleteRow,
  insertRow,
  moveRow,
  neighbourClue,
  ownTextTargets,
  reidRound,
  restyle,
  rowStep,
  setClueType,
  followDailyDoubles,
  setRowCount,
  stepClue,
  swapClues,
  textStyleTargets,
} from './ops';

const mainText = (s: { elements: { kind: string }[] }) => s.elements.find((e) => e.kind === 'text') as TextEl;

describe('use this style elsewhere', () => {
  it('finds the main text of the chosen slides, never the source itself', () => {
    const game = jeopardyGame();
    game.rounds.push(newRound('Double', 2, [400, 800]));
    const round = board(game, 0);
    const from = mainText(round.categories[0].clues[0].questionSlide);
    expect(textStyleTargets(game, round, from, 'round-q')).toHaveLength(6 * 5 - 1);
    expect(textStyleTargets(game, round, from, 'round-qa')).toHaveLength(6 * 5 * 2 - 1);
    // Whole game: both rounds plus the final.
    expect(textStyleTargets(game, round, from, 'game-a')).toHaveLength(30 + 4 + 1);
    expect(textStyleTargets(game, null, from, 'game-q')).toHaveLength(30 + 4 + 1 - 1);
    // This category: its 5 clues (another category's clues are left alone).
    const cat = round.categories[0];
    expect(textStyleTargets(game, round, from, 'cat-q', cat)).toHaveLength(5 - 1);
    expect(textStyleTargets(game, round, from, 'cat-a', cat)).toHaveLength(5);
    const both = textStyleTargets(game, round, from, 'cat-qa', cat);
    expect(both).toHaveLength(5 * 2 - 1);
    expect(both).not.toContain(mainText(round.categories[1].clues[0].questionSlide));
    expect(textStyleTargets(game, round, from, 'cat-q', null)).toHaveLength(0);
  });

  it('restyles the targets and can put their old styles back, keeping the words', () => {
    const game = jeopardyGame();
    const round = board(game, 0);
    const from = mainText(round.categories[0].clues[0].questionSlide);
    from.color = '#ff00ff';
    from.size = 64;
    const target = mainText(round.categories[1].clues[0].questionSlide);
    target.text = 'Keep me';
    const undo = restyle(from, [target]);
    expect([target.color, target.size, target.text]).toEqual(['#ff00ff', 64, 'Keep me']);
    undo();
    expect([target.color, target.size, target.text]).toEqual(['#ffffff', 110, 'Keep me']);
  });

  it("in a Final round or the tiebreaker, “this round” is its own slides, not every board clue", () => {
    const game = jeopardyGame();
    const final = game.rounds.find((r): r is FinalRound => r.mode === 'final')!;
    final.extraSlides = [{ ...textSlide('More'), id: 'x1' }];
    const from = mainText(final.questionSlide);
    expect(ownTextTargets(final, from, 'round-q')).toEqual([mainText(final.extraSlides[0])]);
    expect(ownTextTargets(final, from, 'round-a')).toEqual([mainText(final.answerSlide)]);
    expect(ownTextTargets(final, from, 'round-qa')).toHaveLength(2);
    final.extraSlides = undefined;
    expect(ownTextTargets(final, from, 'round-q')).toHaveLength(0);
  });
});

describe('the quick Question / Answer boxes', () => {
  it('bring a deleted text box back on top of the rest, in the clue text font and colour', () => {
    const game = jeopardyGame();
    game.theme.clueFont = "'Anton', Impact, sans-serif";
    game.theme.clueColor = '#ffcc00';
    const slide = board(game).categories[0].clues[0].questionSlide;
    const pic = newImageEl('m1');
    pic.zIndex = 3;
    slide.elements = [pic];
    const made = setSlideText(slide, 'Who painted the Mona Lisa?');
    expect(made?.zIndex).toBe(4);
    if (made) followClueText(game, [slide]);
    expect([made?.font, made?.color]).toEqual(["'Anton', Impact, sans-serif", '#ffcc00']);
    // Typing on in it changes its words only (a look given to it stays).
    made!.font = 'Arial, Helvetica, sans-serif';
    expect(setSlideText(slide, 'Who painted it?')).toBeUndefined();
    expect([slideText(slide), made!.font, slide.elements.length]).toEqual(['Who painted it?', 'Arial, Helvetica, sans-serif', 2]);
  });
});

describe('the clue editor walk (Prev / Next, Ctrl+Enter)', () => {
  it('goes down a category, then on to the next one, and stops at either end', () => {
    const round = newRound('R', 2, [100, 200]);
    expect(stepClue(round, { cat: 0, row: 0 }, 1)).toEqual({ cat: 0, row: 1 });
    expect(stepClue(round, { cat: 0, row: 1 }, 1)).toEqual({ cat: 1, row: 0 });
    expect(stepClue(round, { cat: 1, row: 0 }, -1)).toEqual({ cat: 0, row: 1 });
    expect(stepClue(round, { cat: 0, row: 0 }, -1)).toBeNull();
    expect(stepClue(round, { cat: 1, row: 1 }, 1)).toBeNull();
  });

  it('skips empty tiles, and has nowhere to go when only empty tiles are left that way', () => {
    const round = newRound('R', 2, [100, 200]);
    round.categories[0].clues[1].empty = true;
    expect(stepClue(round, { cat: 0, row: 0 }, 1)).toEqual({ cat: 1, row: 0 });
    expect(stepClue(round, { cat: 1, row: 0 }, -1)).toEqual({ cat: 0, row: 0 });
    round.categories[1].clues[0].empty = true;
    round.categories[1].clues[1].empty = true;
    expect(stepClue(round, { cat: 0, row: 0 }, 1)).toBeNull();
  });
});

describe("the clue editor's Alt+arrows", () => {
  it('go up and down a category and across a row, like the board, skipping empty tiles', () => {
    const round = newRound('R', 3, [100, 200, 300]);
    expect(neighbourClue(round, { cat: 0, row: 0 }, 0, 1)).toEqual({ cat: 0, row: 1 });
    expect(neighbourClue(round, { cat: 0, row: 0 }, 0, -1)).toBeNull();
    expect(neighbourClue(round, { cat: 0, row: 2 }, 1, 0)).toEqual({ cat: 1, row: 2 });
    round.categories[1].clues[2].empty = true;
    expect(neighbourClue(round, { cat: 0, row: 2 }, 1, 0)).toEqual({ cat: 2, row: 2 });
    expect(neighbourClue(round, { cat: 2, row: 2 }, 1, 0)).toBeNull();
    round.categories[2].clues[1].empty = true;
    expect(neighbourClue(round, { cat: 2, row: 0 }, 0, 1)).toEqual({ cat: 2, row: 2 });
  });
});

describe('moving clues around the board', () => {
  it('swaps two tiles with everything on them, and the row values stay', () => {
    const round = newRound('R', 2, [100, 200]);
    const a = round.categories[0].clues[0];
    const b = round.categories[1].clues[1];
    setSlideText(a.questionSlide, 'Who is Pepe?');
    a.type = 'dailyDouble';
    b.empty = true;
    swapClues(round, { cat: 0, row: 0 }, { cat: 1, row: 1 });
    expect(round.categories[1].clues[1]).toBe(a);
    expect(round.categories[0].clues[0]).toBe(b);
    expect(round.values).toEqual([100, 200]);
  });

  it('copies a clue with fresh ids, leaving the original alone', () => {
    const round = newRound('R', 2, [100, 200]);
    const a = round.categories[0].clues[0];
    setSlideText(a.answerSlide, 'Pepe');
    a.hostNotes = 'frog';
    const copy = copyClue(a);
    expect(copy.id).not.toBe(a.id);
    expect(copy.answerSlide.elements[0].id).not.toBe(a.answerSlide.elements[0].id);
    expect([slideText(copy.answerSlide), copy.hostNotes]).toEqual(['Pepe', 'frog']);
    copy.hostNotes = 'toad';
    expect(a.hostNotes).toBe('frog');
  });

  it('clears what was written on a clue, keeping its main text style, type and value', () => {
    const round = newRound('R', 1, [100]);
    const c = round.categories[0].clues[0];
    setSlideText(c.questionSlide, 'Q');
    const main = c.questionSlide.elements[0] as TextEl;
    main.color = '#ff0000';
    c.questionSlide.elements.push({ ...main, id: 'x', text: 'extra' });
    c.questionSlide.background = { color: '#123456' };
    setSlideText(c.answerSlide, 'A');
    c.hostNotes = 'n';
    c.tileFace = { text: 'face' };
    c.type = 'dailyDouble';
    c.value = 999;
    clearClue(c);
    expect(clueHasContent(c)).toBe(false);
    expect(c.questionSlide.elements).toHaveLength(1);
    expect((c.questionSlide.elements[0] as TextEl).color).toBe('#ff0000');
    expect([c.type, c.value, c.hostNotes, c.tileFace]).toEqual(['dailyDouble', 999, undefined, undefined]);
  });
});

describe('rows anywhere', () => {
  const names = (round: BoardRound) => round.categories.map((cat) => cat.clues.map((c) => slideText(c.questionSlide) || '-').join(''));
  const board3 = () => {
    const round = newRound('R', 2, [100, 200, 300]);
    round.categories.forEach((cat, ci) => cat.clues.forEach((c, r) => setSlideText(c.questionSlide, String.fromCharCode(97 + ci * 3 + r))));
    return round;
  };

  it('inserts a row: the clues below move down, and the values stay by position with one more at the bottom', () => {
    const round = board3();
    expect(insertRow(round, 1)).toBe(true);
    expect(names(round)).toEqual(['a-bc', 'd-ef']);
    expect(round.values).toEqual([100, 200, 300, 400]);
    while (round.values.length < 10) insertRow(round, 0);
    expect(insertRow(round, 0)).toBe(false);
  });

  it('deletes a row: the clues below move up, and the bottom value goes', () => {
    const round = board3();
    expect(deleteRow(round, 0)).toBe(true);
    expect(names(round)).toEqual(['bc', 'ef']);
    expect(round.values).toEqual([100, 200]);
    deleteRow(round, 0);
    expect(deleteRow(round, 0)).toBe(false);
  });

  it('moves a row of clues, the values stay', () => {
    const round = board3();
    expect(moveRow(round, 2, 0)).toBe(true);
    expect(names(round)).toEqual(['cab', 'fde']);
    expect(round.values).toEqual([100, 200, 300]);
    expect(moveRow(round, 0, 3)).toBe(false);
  });
});

describe('what shrinking a board would lose', () => {
  it('counts written clues, notes, tile faces, images and names of your own, not a fresh category', () => {
    const round = newRound('R', 2, [100, 200]);
    const [a, b] = round.categories;
    expect(categoryHasContent(a)).toBe(false);
    expect(clueHasContent(a.clues[0])).toBe(false);
    mainText(a.clues[1].answerSlide).text = 'An answer';
    expect(clueHasContent(a.clues[1])).toBe(true);
    expect(categoryHasContent(a)).toBe(true);
    b.clues[0].hostNotes = 'say it slowly';
    expect(clueHasContent(b.clues[0])).toBe(true);
    b.clues[0].hostNotes = undefined;
    b.clues[0].tileFace = { image: 'img1' };
    expect(clueHasContent(b.clues[0])).toBe(true);
    b.clues[0].tileFace = undefined;
    expect(categoryHasContent(b)).toBe(false);
    b.title = 'Movies';
    expect(categoryHasContent(b)).toBe(true);
    b.title = '';
    b.image = 'img2';
    expect(categoryHasContent(b)).toBe(true);
  });
});

describe('new rows and categories', () => {
  it("a new row adds the board's most common step, whether inserted or from the Rows box", () => {
    expect(rowStep([200, 400, 600, 800, 1000])).toBe(200);
    // One odd gap doesn't decide it, at either end.
    expect(rowStep([100, 300, 400, 500])).toBe(100);
    expect(rowStep([100, 200, 300, 500])).toBe(100);
    expect(rowStep([300])).toBe(300);
    expect(rowStep([])).toBe(100);
    const a = newRound('R', 2, [100, 300, 400, 500]);
    const b = newRound('R', 2, [100, 300, 400, 500]);
    insertRow(a, 0);
    setRowCount(b, 5);
    expect(a.values).toEqual([100, 300, 400, 500, 600]);
    expect(b.values).toEqual(a.values);
  });

  it('names a new category by where it goes: the next number at the end, "New category" between others', () => {
    const round = newRound('R', 6);
    addCategory(round);
    expect(round.categories[6].title).toBe('Category 7');
    addCategory(round, 0);
    expect(round.categories[0].title).toBe('New category');
    addCategory(round, 3);
    expect(round.categories[3].title).toBe('New category 2');
    round.categories[8].title = 'Category 10';
    addCategory(round);
    expect(round.categories.map((c) => c.title).slice(-2)).toEqual(['Category 10', 'Category 11']);
  });

  it('a Daily Double placed by hand raises the ⭐ count when the board has more than it says', () => {
    const round = newRound('R', 3);
    setClueType(round, round.categories[0].clues[0], 'dailyDouble');
    expect(round.dailyDoubleCount ?? 1).toBe(1);
    setClueType(round, round.categories[1].clues[0], 'dailyDouble');
    expect(round.dailyDoubleCount).toBe(2);
    // Taking one off leaves the count as it is.
    setClueType(round, round.categories[1].clues[0], 'standard');
    expect(round.dailyDoubleCount).toBe(2);
  });

  it('a Daily Double copied or pasted onto another tile raises the ⭐ count too', () => {
    const round = newRound('R', 3);
    setClueType(round, round.categories[0].clues[0], 'dailyDouble');
    round.categories[2].clues[1] = copyClue(round.categories[0].clues[0]);
    followDailyDoubles(round);
    expect(round.dailyDoubleCount).toBe(2);
  });
});

describe('🤝 partner clues on the board', () => {
  const partnerTile = () => {
    const round = newRound('R', 2, [200, 400]);
    const clue = round.categories[0].clues[0];
    setClueType(round, clue, 'partner');
    return { round, clue };
  };

  it('a tile made a partner clue starts as Describe it with one empty card and a 45 s countdown', () => {
    const { round, clue } = partnerTile();
    expect(clue.partner).toEqual(gameRules('describe'));
    expect(clue.cards!.map((c) => c.to)).toEqual(['giver']);
    expect(clue.timerSeconds).toBe(45);
    // Never a Daily Double.
    expect(round.dailyDoubleCount).toBeUndefined();
  });

  it('changing the type away keeps the rules and cards, so changing back restores them', () => {
    const { round, clue } = partnerTile();
    clue.partner!.giver = 'picker';
    setSlideText(clue.cards![0], 'Shrek');
    clue.timerSeconds = null;
    setClueType(round, clue, 'standard');
    expect([clue.partner?.giver, slideText(clue.cards![0])]).toEqual(['picker', 'Shrek']);
    setClueType(round, clue, 'partner');
    expect([clue.partner?.giver, slideText(clue.cards![0]), clue.timerSeconds]).toEqual(['picker', 'Shrek', null]);
  });

  it('a partner clue only tried goes back without its empty card, the game’s own rules and their countdown', () => {
    const { round, clue } = partnerTile();
    setClueType(round, clue, 'standard');
    expect([clue.cards, clue.partner, clue.timerSeconds]).toEqual([undefined, undefined, undefined]);
    // Rules the host changed stay (and their countdown), though the card is empty.
    setClueType(round, clue, 'partner');
    clue.partner!.giver = 'picker';
    setClueType(round, clue, 'dailyDouble');
    expect([clue.cards, clue.partner?.giver, clue.timerSeconds]).toEqual([undefined, 'picker', 45]);
    // Made one again, it gets its rules back and a new starting card.
    setClueType(round, clue, 'partner');
    expect([clue.cards?.length, clue.partner?.giver]).toEqual([1, 'picker']);
  });

  it('one only tried with another game (no countdown of its own) loses the 45 s it got as Describe it too', () => {
    for (const game of ['help', 'split'] as const) {
      const { round, clue } = partnerTile();
      setPartnerGame(clue, game);
      expect(clue.timerSeconds).toBe(45);
      setClueType(round, clue, 'standard');
      expect([clue.cards, clue.partner, clue.timerSeconds]).toEqual([undefined, undefined, undefined]);
    }
  });

  it('a tile whose only content is a card has content (Clear, drags and imports see it)', () => {
    const { clue } = partnerTile();
    expect(clueHasContent(clue)).toBe(false);
    setSlideText(clue.cards![0], 'Shrek');
    expect(clueHasContent(clue)).toBe(true);
    // A card's name only: the host's work too.
    const named = partnerTile().clue;
    named.cards![0].name = 'Clue tip';
    expect(clueHasContent(named)).toBe(true);
  });

  it('a partner clue whose empty card the host named keeps it, and its rules, when its type changes away', () => {
    const { round, clue } = partnerTile();
    clue.cards![0].name = 'Clue tip';
    setClueType(round, clue, 'standard');
    expect(clue.cards!.map((c) => c.name)).toEqual(['Clue tip']);
    expect(clue.partner).toEqual(gameRules('describe'));
    setClueType(round, clue, 'partner');
    expect(clue.cards!.map((c) => c.name)).toEqual(['Clue tip']);
  });

  it('clearing empties the cards but keeps them, who they go to and the rules', () => {
    const { clue } = partnerTile();
    clue.cards![0].to = 'both';
    setSlideText(clue.cards![0], 'Shrek');
    clue.cards![0].elements.push(newImageEl('pic'));
    clue.cards![0].name = 'Clue tip';
    const id = clue.cards![0].id;
    clearClue(clue);
    expect(clue.cards).toHaveLength(1);
    expect([clue.cards![0].id, clue.cards![0].to, slideText(clue.cards![0]), clue.cards![0].elements.length, clue.cards![0].name]).toEqual([id, 'both', '', 1, 'Clue tip']);
    expect(clue.type).toBe('partner');
    expect(clue.partner).toEqual(gameRules('describe'));
  });

  it('a copied clue, or a copied round, gets fresh ids for its cards and their items', () => {
    const { round, clue } = partnerTile();
    clue.cards![0].elements.push(newImageEl('pic'));
    const ids = (c: Clue) => c.cards!.flatMap((card) => [card.id, ...card.elements.map((e) => e.id)]);
    clue.cards![0].name = 'Clue tip';
    const copy = copyClue(clue);
    expect(copy.cards![0].elements[1]).toMatchObject({ kind: 'image', media: 'pic' });
    expect(copy.cards![0].name).toBe('Clue tip');
    expect(ids(copy).some((id) => ids(clue).includes(id))).toBe(false);
    const again = reidRound(clone(round));
    expect(ids(again.categories[0].clues[0]).some((id) => ids(clue).includes(id))).toBe(false);
    expect(again.categories[0].clues[0].cards![0].to).toBe('giver');
  });
});

describe('a Final’s 🤫 cards', () => {
  it('a copied Final (Duplicate round, Paste, Import) gets fresh ids for its cards and their items, names kept', () => {
    const final = newFinalRound();
    const card = addCard(final, 'playing')!;
    card.name = 'Leader hint';
    card.elements.push(newImageEl('pic'));
    const ids = (r: FinalRound) => (r.cards ?? []).flatMap((c) => [c.id, ...c.elements.map((e) => e.id)]);
    const copy = reidRound(clone(final));
    expect(ids(copy)).toHaveLength(3);
    expect(ids(copy).some((id) => ids(final).includes(id))).toBe(false);
    expect(copy.cards![0]).toMatchObject({ name: 'Leader hint', to: 'playing' });
    expect(copy.cards![0].elements[1]).toMatchObject({ kind: 'image', media: 'pic' });
  });

  it('⧉ Same as the answer copies the Final’s answer onto its card, once', () => {
    const final = newFinalRound();
    setSlideText(final.answerSlide, 'Shrek');
    const card = addCard(final, 'playing')!;
    cardFromAnswer(final, card);
    expect(slideText(card)).toBe('Shrek');
    expect(card.elements[0].id).not.toBe(final.answerSlide.elements[0].id);
    setSlideText(final.answerSlide, 'Donkey');
    expect(slideText(card)).toBe('Shrek');
  });

  it('take the game’s clue text, as a tile’s do', () => {
    const g = jeopardyGame();
    const final = g.rounds[1] as FinalRound;
    const card = addCard(final, 'playing')!;
    expect(clueSlides(g)).toContain(card);
    g.theme.clueFont = 'Comic Neue';
    followClueText(g);
    expect(mainText(card).font).toBe('Comic Neue');
  });
});
