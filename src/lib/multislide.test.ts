// Clues with several question slides (a lead-in, then more information, then the answer): the model, the editor's slide
// operations, playing through them, and everything that walks a clue's slides.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { migrateGame, newFinalRound, newId, newImageEl, questionSlides, setSlideText, slideText, slidesOfClue, textSlide, type BoardRound, type Clue, type Game, type TextEl } from './model';
import { addClueSlide, clearClue, clone, clueHasContent, copyClue, deleteClueSlide, duplicateClueSlide, moveClueSlide, reidRound, textStyleTargets } from './ops';
import { backToBoard, clueSlideIndex, finalNext, newSession, openClue, reveal, shownQuestionSlide, slidePosition, startTiebreaker, stepSlide, toolOnlyClue, unreveal } from './session';
import { allSlides, mediaUsage } from './usage';
import { diff } from './historyops';
import { describe as describeStep, itemPlace, placeAt } from './historylabel';
import { hostState, newBuzz } from './buzz';
import { findAll } from './find';

const board = (g: Game) => g.rounds[0] as BoardRound;
const texts = (c: Clue) => questionSlides(c).map(slideText);

/** A game whose first clue has three question slides: "Lead-in", "More", "Last". */
function threeSlides(): { game: Game; clue: Clue } {
  const game = jeopardyGame();
  const clue = board(game).categories[0].clues[0];
  setSlideText(clue.questionSlide, 'Lead-in');
  setSlideText(clue.answerSlide, 'The answer');
  addClueSlide(clue, 0);
  setSlideText(questionSlides(clue)[1], 'More');
  addClueSlide(clue, 1);
  setSlideText(questionSlides(clue)[2], 'Last');
  return { game, clue };
}

describe('question slides in the model', () => {
  it('a clue has one question slide until more are added', () => {
    const clue = board(jeopardyGame()).categories[0].clues[0];
    expect(questionSlides(clue)).toEqual([clue.questionSlide]);
    expect(slidesOfClue(clue)).toEqual([clue.questionSlide, clue.answerSlide]);
    expect(clue.extraSlides).toBeUndefined();
  });

  it('lists them in order, the answer last', () => {
    const { clue } = threeSlides();
    expect(texts(clue)).toEqual(['Lead-in', 'More', 'Last']);
    expect(slidesOfClue(clue).map(slideText)).toEqual(['Lead-in', 'More', 'Last', 'The answer']);
    // The extra ones carry ids; the first one never does.
    expect(clue.extraSlides!.every((s) => typeof s.id === 'string' && s.id)).toBe(true);
    expect('id' in clue.questionSlide).toBe(false);
  });

  it('an older game (one question slide) loads exactly as it was', () => {
    const game = jeopardyGame();
    setSlideText(board(game).categories[0].clues[0].questionSlide, 'Old question');
    const before = JSON.stringify(game);
    const loaded = migrateGame(JSON.parse(before));
    expect(JSON.stringify(loaded)).toBe(before);
    expect(questionSlides(board(loaded).categories[0].clues[0]).map(slideText)).toEqual(['Old question']);
  });

  it('a game with extra slides loads with them, and a hand-broken list is mended', () => {
    const { game } = threeSlides();
    const loaded = migrateGame(JSON.parse(JSON.stringify(game)));
    expect(texts(board(loaded).categories[0].clues[0])).toEqual(['Lead-in', 'More', 'Last']);

    const broken = JSON.parse(JSON.stringify(game));
    const cl = broken.rounds[0].categories[0].clues;
    cl[0].extraSlides = [{ elements: [{ kind: 'text', text: 7 }] }, 'junk', null];
    cl[1].extraSlides = 'nope';
    cl[2].extraSlides = [];
    const fixed = migrateGame(broken);
    const [a, b, c] = board(fixed).categories[0].clues;
    expect(a.extraSlides).toHaveLength(1);
    expect(a.extraSlides![0].id).toBeTruthy();
    expect(a.extraSlides![0].background).toEqual({});
    expect(slideText(a.extraSlides![0])).toBe('7');
    expect(b.extraSlides).toBeUndefined();
    expect(c.extraSlides).toBeUndefined();
  });
});

describe('editing question slides', () => {
  it('adds a slide after the one open, in its look but empty', () => {
    const clue = board(jeopardyGame()).categories[0].clues[0];
    setSlideText(clue.questionSlide, 'Lead-in');
    const main = clue.questionSlide.elements[0] as TextEl;
    main.color = '#ff00ff';
    main.y = 123;
    clue.questionSlide.background = { color: '#112233' };
    expect(addClueSlide(clue, 0)).toBe(1);
    const added = clue.extraSlides![0];
    expect(slideText(added)).toBe('');
    expect(added.background).toEqual({ color: '#112233' });
    expect((added.elements[0] as TextEl).color).toBe('#ff00ff');
    expect((added.elements[0] as TextEl).y).toBe(123);
    // Its own items (not the first slide's).
    expect(added.elements[0].id).not.toBe(main.id);
    // In the middle: right after the one open.
    setSlideText(added, 'Last');
    expect(addClueSlide(clue, 0)).toBe(1);
    expect(texts(clue)).toEqual(['Lead-in', '', 'Last']);
  });

  it('duplicates with fresh ids', () => {
    const { clue } = threeSlides();
    clue.extraSlides![0].elements.push(newImageEl('m1'));
    expect(duplicateClueSlide(clue, 1)).toBe(2);
    expect(texts(clue)).toEqual(['Lead-in', 'More', 'More', 'Last']);
    const [a, b] = [clue.extraSlides![0], clue.extraSlides![1]];
    expect(b.id).not.toBe(a.id);
    expect(b.elements.map((e) => e.id)).not.toEqual(expect.arrayContaining(a.elements.map((e) => e.id)));
    // The first one too (its copy becomes an extra slide).
    expect(duplicateClueSlide(clue, 0)).toBe(1);
    expect(texts(clue)).toEqual(['Lead-in', 'Lead-in', 'More', 'More', 'Last']);
    expect(clue.extraSlides![0].id).toBeTruthy();
  });

  it('moves slides, the first one included', () => {
    const { clue } = threeSlides();
    expect(moveClueSlide(clue, 2, -1)).toBe(1);
    expect(texts(clue)).toEqual(['Lead-in', 'Last', 'More']);
    expect(moveClueSlide(clue, 0, 1)).toBe(1);
    expect(texts(clue)).toEqual(['Last', 'Lead-in', 'More']);
    expect('id' in clue.questionSlide).toBe(false);
    expect(clue.extraSlides!.every((s) => !!s.id)).toBe(true);
    // Past either end: nothing.
    expect(moveClueSlide(clue, 0, -1)).toBe(0);
    expect(moveClueSlide(clue, 2, 1)).toBe(2);
    expect(texts(clue)).toEqual(['Last', 'Lead-in', 'More']);
  });

  it('deletes slides but never the only one', () => {
    const { clue } = threeSlides();
    expect(deleteClueSlide(clue, 1)).toBe(1);
    expect(texts(clue)).toEqual(['Lead-in', 'Last']);
    expect(deleteClueSlide(clue, 0)).toBe(0);
    expect(texts(clue)).toEqual(['Last']);
    // Back to a plain clue.
    expect(clue.extraSlides).toBeUndefined();
    expect('id' in clue.questionSlide).toBe(false);
    expect(deleteClueSlide(clue, 0)).toBe(0);
    expect(texts(clue)).toEqual(['Last']);
  });

  it('copying, clearing and re-iding a clue cover its extra slides', () => {
    const { game, clue } = threeSlides();
    const copy = copyClue(clue);
    expect(texts(copy)).toEqual(['Lead-in', 'More', 'Last']);
    expect(copy.extraSlides![0].id).not.toBe(clue.extraSlides![0].id);
    expect(copy.extraSlides![0].elements[0].id).not.toBe(clue.extraSlides![0].elements[0].id);

    const round = reidRound(clone(board(game)));
    const again = round.categories[0].clues[0];
    expect(again.extraSlides![1].id).not.toBe(clue.extraSlides![1].id);

    const other = board(game).categories[1].clues[0];
    other.extraSlides = [{ ...textSlide('only on slide 2'), id: newId() }];
    expect(clueHasContent(other)).toBe(true);
    clearClue(other);
    expect(other.extraSlides).toBeUndefined();
    expect(clueHasContent(other)).toBe(false);
  });

  it('“Use this style elsewhere” reaches the extra question slides', () => {
    const { game, clue } = threeSlides();
    const from = board(game).categories[1].clues[0].questionSlide.elements[0] as TextEl;
    const targets = textStyleTargets(game, board(game), from, 'cat-q', board(game).categories[0]);
    expect(targets).toContain(clue.extraSlides![1].elements[0]);
    expect(textStyleTargets(game, board(game), from, 'cat-a', board(game).categories[0])).not.toContain(clue.extraSlides![1].elements[0]);
  });

  it('“Everything in the whole game” includes the tiebreaker', () => {
    const { game } = threeSlides();
    game.tiebreaker = { questionSlide: textSlide('tb q'), answerSlide: textSlide('tb a') };
    const from = board(game).categories[1].clues[0].questionSlide.elements[0] as TextEl;
    const targets = textStyleTargets(game, board(game), from, 'game-qa');
    expect(targets).toContain(game.tiebreaker.questionSlide.elements[0]);
    expect(targets).toContain(game.tiebreaker.answerSlide.elements[0]);
  });
});

describe('playing through the slides', () => {
  function play() {
    const { game, clue } = threeSlides();
    const session = newSession(game);
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    return { game, clue, session };
  }

  it('opens on the first slide and steps through them, then the answer', () => {
    const { game, clue, session } = play();
    expect(slideText(shownQuestionSlide(session, clue))).toBe('Lead-in');
    expect(slidePosition(session, game)).toEqual({ at: 1, of: 3 });
    expect(stepSlide(session, game, -1)).toBe(false);
    expect(stepSlide(session, game, 1)).toBe(true);
    expect(slideText(shownQuestionSlide(session, clue))).toBe('More');
    expect(stepSlide(session, game, 1)).toBe(true);
    expect(slidePosition(session, game)).toEqual({ at: 3, of: 3 });
    expect(stepSlide(session, game, 1)).toBe(false);
    reveal(session);
    // With the answer up, the slides stay where they are.
    expect(stepSlide(session, game, -1)).toBe(false);
    unreveal(session);
    expect(slideText(shownQuestionSlide(session, clue))).toBe('Last');
    expect(stepSlide(session, game, -1)).toBe(true);
    expect(slideText(shownQuestionSlide(session, clue))).toBe('More');
  });

  it('starts again at the first slide on the next clue', () => {
    const { game, session } = play();
    stepSlide(session, game, 1);
    backToBoard(session, game);
    expect(session.slide).toBeUndefined();
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    expect(clueSlideIndex(session, board(game).categories[0].clues[0])).toBe(0);
  });

  it('a one-slide clue has no slides to step through', () => {
    const { game, session } = play();
    backToBoard(session, game, { markUsed: false });
    openClue(session, { round: 0, cat: 1, row: 0 }, game);
    expect(slidePosition(session, game)).toBeNull();
    expect(stepSlide(session, game, 1)).toBe(false);
  });

  it('a Daily Double steps through them after the wager, not on its splash', () => {
    const { game, clue, session } = play();
    backToBoard(session, game, { markUsed: false });
    clue.type = 'dailyDouble';
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    expect(session.dd?.stage).toBe('splash');
    expect(stepSlide(session, game, 1)).toBe(false);
    session.dd = { stage: 'question', wager: 100 };
    expect(stepSlide(session, game, 1)).toBe(true);
    expect(slideText(shownQuestionSlide(session, clue))).toBe('More');
  });

  it('keeps to the slides the clue has (one deleted while it was open)', () => {
    const { game, clue, session } = play();
    stepSlide(session, game, 1);
    stepSlide(session, game, 1);
    deleteClueSlide(clue, 2);
    expect(clueSlideIndex(session, clue)).toBe(1);
    expect(slideText(shownQuestionSlide(session, clue))).toBe('More');
    session.slide = 1.5;
    expect(clueSlideIndex(session, clue)).toBe(0);
  });

  it('the phones get the words of the slide on screen (never the answer), the buzzers left as they are', () => {
    const { game, session } = play();
    const armed = { ...newBuzz(), phase: 'armed' as const, armId: 3 };
    expect(hostState(game, session, armed, 0).clue?.text).toBe('Lead-in');
    stepSlide(session, game, 1);
    const s = hostState(game, session, armed, 0);
    expect(s.clue?.text).toBe('More');
    expect(s.phase).toBe('armed');
    expect(s.armId).toBe(3);
    stepSlide(session, game, 1);
    reveal(session);
    expect(hostState(game, session, armed, 0).clue?.text).toBe('Last');
  });

  it('a wheel tile with words only on a later slide still has a question', () => {
    const { clue } = threeSlides();
    clue.type = 'wheel';
    setSlideText(clue.questionSlide, '');
    setSlideText(clue.answerSlide, '');
    expect(toolOnlyClue(clue)).toBe(false);
    for (const s of clue.extraSlides!) setSlideText(s, '');
    expect(toolOnlyClue(clue)).toBe(true);
  });
});

describe('what walks a game’s slides', () => {
  it('counts media on the extra slides (so it is never cleaned up as unused)', () => {
    const { game, clue } = threeSlides();
    game.media.push({ id: 'm1', name: 'a.png', mime: 'image/png', size: 1, kind: 'image' });
    clue.extraSlides![1].elements.push(newImageEl('m1'));
    clue.extraSlides![0].background.image = 'm1';
    expect(mediaUsage(game).get('m1')).toBe(2);
    expect(allSlides(game).map((s) => s.where)).toContainEqual(expect.stringMatching(/#1 \(question slide 3\)$/));
  });

  it('Find looks in them and goes to that slide', () => {
    const { game, clue } = threeSlides();
    const hit = findAll(game, 'More').find((h) => h.icon === '❓');
    expect(hit?.where).toMatch(/› Question 2$/);
    expect(hit?.place).toMatchObject({ tab: 'round', part: { kind: 'clue', side: 'q', slide: clue.extraSlides![0].id } });
    // The first slide, as its tab says: Question 1.
    expect(findAll(game, 'Lead-in').find((h) => h.icon === '❓')?.where).toMatch(/› Question 1$/);
  });

  it('the undo history names and places a change on an extra slide', () => {
    const { game } = threeSlides();
    const after = structuredClone(game);
    const c = board(after).categories[0].clues[0];
    setSlideText(c.extraSlides![1], 'Last, changed');
    const d = describeStep(diff(game, after), game, after);
    expect(d.label).toBe('Edited question “Last, changed”');
    expect(d.where).toMatch(/› Question 3$/);
    // (And on the first slide: Question 1.)
    const first = structuredClone(game);
    setSlideText(board(first).categories[0].clues[0].questionSlide, 'Lead-in, changed');
    expect(describeStep(diff(game, first), game, first).where).toMatch(/› Question 1$/);
    expect(d.place).toMatchObject({ part: { kind: 'clue', side: 'q', slide: c.extraSlides![1].id, element: c.extraSlides![1].elements[0].id } });

    // Its background, as a slide's (not a text box's).
    const bg = structuredClone(game);
    board(bg).categories[0].clues[0].extraSlides![0].background.color = '#123456';
    expect(describeStep(diff(game, bg), game, bg).label).toBe('Slide background color #123456');

    const el = c.extraSlides![1].elements[0].id;
    expect(itemPlace(after, el)).toMatchObject({ part: { slide: c.extraSlides![1].id, element: el } });
    const at = placeAt(after, ['rounds', after.rounds[0].id, 'categories', board(after).categories[0].id, 'clues', c.id, 'extraSlides', 'gone']);
    expect(at.place).toMatchObject({ part: { kind: 'clue', side: 'q' } });
  });

  it('a step that adds or takes out a slide is undone back to the clue', () => {
    const { game } = threeSlides();
    const after = structuredClone(game);
    deleteClueSlide(board(after).categories[0].clues[0], 2);
    const d = describeStep(diff(game, after), game, after, 'Deleted question slide 3');
    expect(d.label).toBe('Deleted question slide 3');
    expect(d.undoPlace).toMatchObject({ tab: 'round', part: { kind: 'clue', clue: board(game).categories[0].clues[0].id } });
  });
});

describe('a copied board-game round', () => {
  it('gets its own zones: its Send to buttons point at them, so a zone renamed in the copy is named so there', async () => {
    const { newBoardGameRound } = await import('./boardgame');
    const round = newBoardGameRound('Board');
    round.zones.push({ id: 'jail', name: 'Jail', slide: textSlide('Jail') });
    round.spaces[0].onLand = [{ id: newId(), do: 'goto', zone: 'jail' }];
    const copy = reidRound(clone(round));
    expect(copy.zones[0].id).not.toBe('jail');
    expect(copy.spaces[0].onLand?.[0]).toMatchObject({ do: 'goto', zone: copy.zones[0].id });
    expect(round.spaces[0].onLand?.[0]).toMatchObject({ zone: 'jail' });
  });
});

describe('the tiebreaker’s question slides', () => {
  function tiebreakerGame() {
    const game = jeopardyGame();
    game.tiebreaker = { questionSlide: textSlide('Lead-in'), answerSlide: textSlide('Answer') };
    addClueSlide(game.tiebreaker, 0);
    setSlideText(questionSlides(game.tiebreaker)[1], 'The question');
    return { game, tb: game.tiebreaker };
  }

  it('are stepped through in play like a clue’s, then the answer', () => {
    const { game, tb } = tiebreakerGame();
    const session = newSession(game);
    session.slide = 1;
    startTiebreaker(session);
    expect(slideText(shownQuestionSlide(session, tb))).toBe('Lead-in');
    expect(slidePosition(session, game)).toEqual({ at: 1, of: 2 });
    expect(stepSlide(session, game, 1)).toBe(true);
    expect(slideText(shownQuestionSlide(session, tb))).toBe('The question');
    expect(stepSlide(session, game, 1)).toBe(false);
    reveal(session);
    expect(stepSlide(session, game, -1)).toBe(false);
  });

  it('are kept by a saved game, found by Find and counted for media and the clue text', () => {
    const { game, tb } = tiebreakerGame();
    const back = migrateGame(JSON.parse(JSON.stringify(game))) as Game;
    expect(questionSlides(back.tiebreaker!).map(slideText)).toEqual(['Lead-in', 'The question']);
    expect(allSlides(game).some((s) => s.where === 'Tiebreaker (question 2)')).toBe(true);
    expect(findAll(game, 'the question').some((h) => h.where === 'Tiebreaker › Question 2')).toBe(true);
    const id = tb.extraSlides![0].elements[0].id;
    expect(itemPlace(game, id)).toMatchObject({ tab: 'tiebreaker', side: 'q', slide: tb.extraSlides![0].id });
  });
});

describe('a Final’s question slides', () => {
  it('are stepped through while its question is up, from the first each time; a copied round gets its own ids', () => {
    const game = jeopardyGame();
    const final = newFinalRound();
    setSlideText(final.questionSlide, 'Lead-in');
    addClueSlide(final, 0);
    setSlideText(questionSlides(final)[1], 'The question');
    game.rounds.push(final);
    const session = newSession(game);
    session.currentRound = game.rounds.length - 1;
    session.phase = 'final';
    session.finalStep = 'wagers';
    session.final = { roundId: final.id, players: [], wagers: {}, order: [], shown: {}, results: {} };
    session.slide = 1;
    // On the wager screen the slides don't move.
    expect(stepSlide(session, game, 1)).toBe(false);
    session.final.players = ['p1'];
    session.final.wagers = { p1: 0 };
    finalNext(session, game);
    expect(session.finalStep).toBe('question');
    expect(slideText(shownQuestionSlide(session, final))).toBe('Lead-in');
    expect(slidePosition(session, game)).toEqual({ at: 1, of: 2 });
    expect(stepSlide(session, game, 1)).toBe(true);
    expect(slideText(shownQuestionSlide(session, final))).toBe('The question');
    expect(stepSlide(session, game, 1)).toBe(false);
    const copy = reidRound(clone(final));
    expect(copy.extraSlides![0].id).not.toBe(final.extraSlides![0].id);
    expect(allSlides(game).some((s) => s.where.endsWith('(question slide 2)'))).toBe(true);
  });
});

