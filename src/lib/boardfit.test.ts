import { describe, expect, it } from 'vitest';
import { CAT_MIN, categoryBox, categoryTooLong, linesAt } from './boardfit';
import { newRound, type Game } from './model';
import { jeopardyGame } from './testgame';
import { validate } from './validate';

describe('category names on the board', () => {
  it('never go below a size that reads at 480p', () => {
    expect(CAT_MIN).toBeGreaterThanOrEqual(28);
  });

  it('counts lines with words kept whole, a too-long word on lines of its own', () => {
    expect(linesAt('Rizz', 30, 160)).toBe(1);
    expect(linesAt('Anime Openings', 30, 160)).toBe(2);
    // 9 characters a line at 30px in 160px.
    expect(linesAt('Supercalifragilisticexpialidocious', 30, 160)).toBe(4);
  });

  it('have less room with more columns', () => {
    expect(categoryBox(10, 5).w).toBeLessThan(categoryBox(6, 5).w);
    expect(categoryBox(6, 10).h).toBeLessThan(categoryBox(6, 5).h);
  });

  it('warn when a name won’t fit its cell even at the smallest size', () => {
    expect(categoryTooLong('Memes', 10, 5)).toBe(false);
    expect(categoryTooLong('Famous Internet Personalities of the 2010s and the Memes They Made Famous', 10, 5)).toBe(true);
    expect(categoryTooLong('Famous Internet Personalities of the 2010s and the Memes They Made Famous', 3, 5)).toBe(false);
  });

  it('show in the editor’s checklist', () => {
    const game: Game = jeopardyGame();
    const r = newRound('Big board', 10);
    r.categories[0].title = 'Famous Internet Personalities of the 2010s and the Memes They Made Famous';
    game.rounds.push(r);
    const lines = validate(game).filter((p) => /too long to read/.test(p.text));
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe('info');
    expect(lines[0].tab).toBe(game.rounds.length - 1);
  });
});
