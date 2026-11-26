import { describe, expect, it } from 'vitest';
import { CAT_MIN, categoryBox, categoryTooLong, linesAt, oneWord } from './boardfit';
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

  it('warn about a name that goes smaller to keep its words whole, not one whose long word is hyphenated', () => {
    // 10 columns: about 133px a line, 8 letters at 30px. "Speedrunning" (12) fits whole only below 30px.
    expect(categoryTooLong('Speedrunning Facts', 10, 5)).toBe(true);
    // A word too long even at the floor (34 letters): hyphenated at 30px, readable.
    expect(categoryTooLong('Supercalifragilisticexpialidocious', 6, 5)).toBe(false);
  });

  it('take a name that is one long word as hyphenated at CAT_MIN, whatever the font (no warning when that fits)', () => {
    expect(oneWord('Antidisestablishmentarianism')).toBe(true);
    expect(oneWord('Speedrunning Facts')).toBe(false);
    expect(oneWord('Rizz')).toBe(false);
    // 10 columns: "Speedrunning" alone would be whole only below 30px; hyphenated at 30 it fits.
    expect(categoryTooLong('Speedrunning', 10, 5)).toBe(false);
    expect(categoryTooLong('Antidisestablishmentarianism', 6, 5)).toBe(false);
    // Too long even hyphenated at 30: still a warning.
    expect(categoryTooLong('Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(3), 10, 5)).toBe(true);
    // A name of several words keeps the rule: whole words first, down to the floor (a warning).
    expect(categoryTooLong('Speedrunning Facts', 10, 5)).toBe(true);
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
