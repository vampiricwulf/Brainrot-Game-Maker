import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { setSlideText, type BoardRound } from './model';
import { validate } from './validate';

describe('the checklist', () => {
  it('counts in words: "1 clue", "30 clues", "2 categories"', () => {
    const game = jeopardyGame();
    const round = game.rounds[0] as BoardRound;
    const texts = () => validate(game).map((p) => p.text);
    expect(texts()).toContain('Jeopardy!: 30 clues with no question');
    for (const c of round.categories) for (const cl of c.clues) setSlideText(cl.questionSlide, 'Q?');
    round.categories[0].clues[0].questionSlide.elements = [];
    round.categories[0].title = '';
    round.categories[1].title = ' ';
    expect(texts()).toContain('Jeopardy!: 1 clue with no question');
    expect(texts()).toContain('Jeopardy!: 2 categories with no name');
    expect(texts().some((t) => t.includes('(s)'))).toBe(false);
  });

  it('says when more Daily Doubles are placed than the ⭐ box says (not a warning: they all play)', () => {
    const game = jeopardyGame();
    const round = game.rounds[0] as BoardRound;
    round.dailyDoubleCount = 1;
    for (const c of round.categories.slice(0, 3)) c.clues[2].type = 'dailyDouble';
    expect(validate(game).find((p) => p.text.includes('Daily Doubles placed'))).toEqual({
      text: 'Jeopardy!: 3 Daily Doubles placed, but ⭐ Daily Doubles says 1 (all 3 play)',
      tab: 0,
      level: 'info',
    });
    round.dailyDoubleCount = 3;
    expect(validate(game).some((p) => p.text.includes('Daily Double'))).toBe(false);
  });

  it('sends a sound whose file is missing to 🔊 Sounds, other missing files to Media', () => {
    const game = jeopardyGame();
    game.audio.right = 'gone';
    game.audio.wrong = 'gone';
    expect(validate(game).filter((p) => p.text.includes('missing'))).toEqual([
      { text: '1 sound file missing: see 🔊 Sounds', tab: 'sounds', level: 'warn' },
    ]);
    game.media.push({ id: 'm2', name: 'pic.png', kind: 'image' } as never);
    expect(validate(game).find((p) => p.text === '1 media file missing')).toMatchObject({ tab: 'media' });
  });

  it('sends player problems to the Play screen, where players are set', () => {
    const game = jeopardyGame();
    game.players = [];
    expect(validate(game).find((p) => p.text.startsWith('No players yet'))).toMatchObject({ tab: 'play', level: 'info' });
    game.players = [
      { id: 'a', name: 'A', color: '#ff0000' },
      { id: 'b', name: 'B', color: '#FF0000' },
    ];
    expect(validate(game).find((p) => p.text === 'Two players share a color')).toMatchObject({ tab: 'play', level: 'warn' });
  });
});
