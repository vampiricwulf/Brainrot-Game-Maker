// What a screen reader hears of the stage (stagewords.ts): the question and answer as they're on stream, never sooner.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from '../lib/testgame';
import { newTextEl, setSlideText, textSlide, type BoardRound, type FinalRound, type Slide } from '../lib/model';
import { goToRound, newSession, openClue, startTiebreaker } from '../lib/session';
import { newLive } from '../lib/live';
import { openWheel } from '../lib/overlay';
import { newWheel } from '../lib/tools';
import { slideWords, stageWords } from './stagewords';

const REF = { round: 0, cat: 0, row: 1 };

function setup() {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b'][i] }));
  const clue = (g.rounds[0] as BoardRound).categories[0].clues[1];
  setSlideText(clue.questionSlide, '“Never gonna give you up” is the song of this prank');
  setSlideText(clue.answerSlide, 'Rickroll');
  const s = newSession(g);
  s.intro = null;
  return { g, s, clue, live: newLive() };
}

describe('the words on stream, for screen readers', () => {
  it('a slide’s text boxes, top to bottom, each a sentence; never a secret one', () => {
    const slide: Slide = textSlide('Top');
    const low = newTextEl('Below it');
    low.y = slide.elements[0].y + 200;
    const secret = newTextEl('Only the host sees this');
    secret.secret = true;
    const clear = newTextEl('Not seen');
    clear.opacity = 0;
    slide.elements.unshift(low, secret, clear);
    expect(slideWords(slide)).toBe('Top. Below it.');
    expect(slideWords(textSlide('Who is it?'))).toBe('Who is it?');
    expect(slideWords(textSlide('   '))).toBe('');
  });

  it('a clue: its question as it opens, its answer only once revealed; its next slide is said again', () => {
    const { g, s, clue, live } = setup();
    expect(stageWords(s, g, live)).toBeNull();
    openClue(s, REF, g);
    expect(stageWords(s, g, live)).toEqual({ key: `clue ${clue.id} 0`, words: '“Never gonna give you up” is the song of this prank.' });
    expect(stageWords(s, g, live)?.words).not.toContain('Rickroll');
    clue.extraSlides = [{ id: 'x2', ...textSlide('A second slide') }];
    s.slide = 1;
    expect(stageWords(s, g, live)).toEqual({ key: `clue ${clue.id} 1`, words: 'A second slide.' });
    s.revealed = true;
    expect(stageWords(s, g, live)).toEqual({ key: `clue ${clue.id} answer`, words: 'Rickroll.' });
  });

  it('nothing while the stage doesn’t show it: the cover, a Daily Double’s splash, PARTNER UP!, a tile’s own wheel, an empty slide', () => {
    const { g, s, clue, live } = setup();
    openClue(s, REF, g);
    live.cover = true;
    expect(stageWords(s, g, live)).toBeNull();
    live.cover = false;
    s.dd = { stage: 'splash', playerId: 'a' };
    expect(stageWords(s, g, live)).toBeNull();
    s.dd = { stage: 'question', playerId: 'a', wager: 200 };
    expect(stageWords(s, g, live)?.words).toContain('Never gonna');
    s.dd = null;
    s.partner = { stage: 'pick' } as NonNullable<typeof s.partner>;
    expect(stageWords(s, g, live)).toBeNull();
    s.partner = null;
    clue.type = 'wheel';
    openWheel(live, s, newWheel('Spin'));
    live.toolTile = clue.id;
    expect(stageWords(s, g, live)).toBeNull();
    live.overlay = null;
    expect(stageWords(s, g, live)?.words).toContain('Never gonna');
    setSlideText(clue.questionSlide, '');
    expect(stageWords(s, g, live)).toBeNull();
  });

  it('the Final: its question, then its answer; nothing at its title card or wagers; the tiebreaker the same', () => {
    const { g, s, live } = setup();
    const f = g.rounds[1] as FinalRound;
    setSlideText(f.questionSlide, 'The first video');
    setSlideText(f.answerSlide, 'Me at the zoo');
    goToRound(s, g, 1);
    s.intro = { stage: 'title', revealed: 0 };
    expect(stageWords(s, g, live)).toBeNull();
    s.intro = null;
    s.finalStep = 'wagers';
    expect(stageWords(s, g, live)).toBeNull();
    s.finalStep = 'question';
    expect(stageWords(s, g, live)).toEqual({ key: `final ${f.id} 0`, words: 'The first video.' });
    s.finalStep = 'answer';
    expect(stageWords(s, g, live)).toEqual({ key: `final ${f.id} answer`, words: 'Me at the zoo.' });
    s.finalStep = 'reveal';
    expect(stageWords(s, g, live)).toBeNull();
    g.tiebreaker = { questionSlide: textSlide('Closest to 100'), answerSlide: textSlide('97') };
    startTiebreaker(s);
    expect(stageWords(s, g, live)).toEqual({ key: 'tiebreaker 0', words: 'Closest to 100.' });
    s.tiebreakerRevealed = true;
    expect(stageWords(s, g, live)).toEqual({ key: 'tiebreaker answer', words: '97.' });
  });
});
