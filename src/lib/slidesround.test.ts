// A slides round: slides shown in order (an introduction), nothing to answer.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { gameProblem, isFinal, migrateGame, newSlidesRound, questionSlides, setSlideText, slideText, type Game, type SlidesRound } from './model';
import { addClueSlide, clone, reidRound, textStyleTargets } from './ops';
import { clueSlides } from './cluetext';
import { randomizeDailyDoubles } from './session';
import type { BoardRound, TextEl } from './model';
import { backToLastRound, clueSlideIndex, goToRound, newSession, rebaseSession, shownQuestionSlide, slidePosition, stepSlide } from './session';
import { allSlides } from './usage';
import { validate } from './validate';
import { findAll } from './find';
import { placeAt } from './historylabel';

/** A game that starts with a 3-slide introduction: "Welcome", "Rules", "Let's go". */
function withIntro(): { game: Game; intro: SlidesRound } {
  const game = jeopardyGame();
  const intro = newSlidesRound();
  setSlideText(intro.questionSlide, 'Welcome');
  addClueSlide(intro, 0);
  setSlideText(questionSlides(intro)[1], 'Rules');
  addClueSlide(intro, 1);
  setSlideText(questionSlides(intro)[2], 'Let’s go');
  game.rounds.unshift(intro);
  return { game, intro };
}

describe('slides round', () => {
  it('plays its slides in order: N steps on, Shift+N back, never past either end', () => {
    const { game, intro } = withIntro();
    const s = newSession(game);
    goToRound(s, game, 0);
    expect(s.phase).toBe('slides');
    expect(s.intro).toBeNull();
    expect(slideText(shownQuestionSlide(s, intro))).toBe('Welcome');
    expect(slidePosition(s, game)).toEqual({ at: 1, of: 3 });
    expect(stepSlide(s, game, -1)).toBe(false);
    expect(stepSlide(s, game, 1)).toBe(true);
    expect(stepSlide(s, game, 1)).toBe(true);
    expect(slideText(shownQuestionSlide(s, intro))).toBe('Let’s go');
    expect(stepSlide(s, game, 1)).toBe(false);
    // On to the board, then back: on its last slide.
    goToRound(s, game, 1);
    expect(s.phase).toBe('board');
    expect(s.slide).toBeUndefined();
    goToRound(s, game, 0);
    expect(clueSlideIndex(s, intro)).toBe(2);
  });

  it('as the last round, the end screen comes back to its last slide', () => {
    const { game, intro } = withIntro();
    game.rounds.push(game.rounds.shift()!);
    const s = newSession(game);
    goToRound(s, game, game.rounds.length);
    backToLastRound(s, game);
    expect(s.phase).toBe('slides');
    expect(clueSlideIndex(s, intro)).toBe(2);
  });

  it('stays on through an edit of the game mid-show', () => {
    const { game } = withIntro();
    const s = newSession(game);
    goToRound(s, game, 0);
    stepSlide(s, game, 1);
    const edited = clone(game);
    rebaseSession(s, game, edited);
    expect([s.phase, s.slide]).toEqual(['slides', 1]);
  });

  it('Resume with my edits keeps the slide on screen when slides were added or taken out before it', () => {
    const { game } = withIntro();
    const s = newSession(game);
    goToRound(s, game, 0);
    stepSlide(s, game, 1);
    stepSlide(s, game, 1);
    // A slide added after the first: "Let’s go" is now the 4th.
    const added = clone(game);
    addClueSlide(added.rounds[0] as SlidesRound, 0);
    rebaseSession(s, game, added);
    expect(slideText(shownQuestionSlide(s, added.rounds[0] as SlidesRound))).toBe('Let’s go');
    expect(s.slide).toBe(3);
    // "Rules" taken out again: back to the 3rd.
    const fewer = clone(added);
    const intro = fewer.rounds[0] as SlidesRound;
    intro.extraSlides = intro.extraSlides!.filter((x) => slideText(x) !== 'Rules');
    rebaseSession(s, added, fewer);
    expect(slideText(shownQuestionSlide(s, intro))).toBe('Let’s go');
    expect(s.slide).toBe(2);
  });

  it('as the closing Final with a slides outro after it, the end screen goes back to the Final’s reveals', () => {
    const { game, intro } = withIntro();
    game.rounds.push(game.rounds.splice(game.rounds.indexOf(intro), 1)[0]);
    const fi = game.rounds.findIndex(isFinal);
    expect(fi).toBe(game.rounds.length - 2);
    const s = newSession(game);
    goToRound(s, game, fi);
    // (Played to its reveals, then on through the outro to the results.)
    s.finalStep = 'reveal';
    goToRound(s, game, fi + 1);
    goToRound(s, game, game.rounds.length);
    backToLastRound(s, game, fi);
    expect([s.phase, s.currentRound, s.finalStep]).toEqual(['final', fi, 'reveal']);
    // (Without an index: the last round, the outro on its last slide.)
    backToLastRound(s, game);
    expect([s.phase, s.currentRound, s.slide]).toEqual(['slides', game.rounds.length - 1, 2]);
  });

  it('is a kind of round a file can have, and its slides are walked (media, find, history)', () => {
    const { game, intro } = withIntro();
    expect(gameProblem(migrateGame(clone(game)))).toBeNull();
    expect(allSlides(game).filter((r) => r.where.startsWith('Introduction')).map((r) => r.where)).toEqual(['Introduction (slide 1)', 'Introduction (slide 2)', 'Introduction (slide 3)']);
    const hit = findAll(game, 'Rules').find((h) => h.icon === '🖼');
    expect(hit?.place).toEqual({ tab: 'round', round: intro.id, part: { kind: 'slides', slide: intro.extraSlides![0].id } });
    expect(placeAt(game, ['rounds', intro.id, 'extraSlides', intro.extraSlides![1].id]).place).toEqual({ tab: 'round', round: intro.id, part: { kind: 'slides', slide: intro.extraSlides![1].id } });
  });

  it('the checklist names an empty slide (and nothing else about it)', () => {
    const { game, intro } = withIntro();
    const mine = () => validate(game).filter((m) => m.tab === 0);
    expect(mine()).toEqual([]);
    setSlideText(questionSlides(intro)[1], '');
    expect(mine().map((m) => m.text)).toEqual(['Introduction: slide 2 is empty']);
    // Its line goes to that slide.
    expect(mine()[0].place).toEqual({ tab: 'round', round: intro.id, part: { kind: 'slides', slide: intro.extraSlides![0].id } });
    setSlideText(questionSlides(intro)[0], '');
    expect(mine()[0].place).toEqual({ tab: 'round', round: intro.id, part: { kind: 'slides' } });
  });

  it('a copy gets fresh ids for its slides', () => {
    const { intro } = withIntro();
    const copy = reidRound(clone(intro));
    expect(copy.id).not.toBe(intro.id);
    expect(copy.extraSlides!.map((s) => s.id)).not.toContain(intro.extraSlides![0].id);
    expect(questionSlides(copy).map(slideText)).toEqual(['Welcome', 'Rules', 'Let’s go']);
  });

  it('“Use this style elsewhere” on one of its slides: this round is its own slides; the game, every question and slide', () => {
    const { game, intro } = withIntro();
    const from = questionSlides(intro)[0].elements[0] as TextEl;
    const own = textStyleTargets(game, null, from, 'round-q', null, intro);
    expect(own).toHaveLength(2);
    const all = textStyleTargets(game, null, from, 'game-q');
    expect(all.length).toBeGreaterThan(2);
    expect(all).toEqual(expect.arrayContaining(own));
  });

  it('follows the theme’s clue text (its slides are among the clue slides)', () => {
    const { game, intro } = withIntro();
    expect(clueSlides(game)).toEqual(expect.arrayContaining(questionSlides(intro)));
  });
});

describe('✍ clues', () => {
  it('random Daily Doubles never land on one', () => {
    const game = jeopardyGame();
    const r = game.rounds[0] as BoardRound;
    for (const c of r.categories) for (const cl of c.clues) cl.everyone = true;
    r.categories[0].clues[0].everyone = undefined;
    expect(randomizeDailyDoubles(r, 3)).toBe(1);
    expect(r.categories[0].clues[0].type).toBe('dailyDouble');
  });
});
