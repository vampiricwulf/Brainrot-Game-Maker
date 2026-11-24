import { describe, expect, it } from 'vitest';
import { addSample, addTemplate, templateStep } from './roundtools';
import { clueSlides, FACTORY_FONT } from '../lib/cluetext';
import { newGame, newRound, type Game, type TextEl } from '../lib/model';
import { TEMPLATES } from '../lib/samples';

const fontsOf = (game: Game, from: number) =>
  clueSlides({ ...game, rounds: game.rounds.slice(from) }).map((s) => s.elements.find((e): e is TextEl => e.kind === 'text')?.font);

describe('rounds from a template or the sample game', () => {
  it('take the theme’s clue text, as a blank round does', () => {
    const game = newGame();
    game.theme.clueFont = 'Bangers';
    for (const label of ['Classic board, 6 × 5', 'Welcome and rules'])
      addTemplate(
        game,
        TEMPLATES.find((t) => t.label === label)!,
      );
    const at = addSample(game);
    const fonts = fontsOf(game, 0);
    expect(at).toBe(2);
    expect(fonts.length).toBeGreaterThan(40);
    expect(new Set(fonts)).toEqual(new Set(['Bangers']));
  });

  it('leave the rounds already there as they are', () => {
    const game = newGame();
    // A board whose clues were set back to a new text box's look by hand, after the default was chosen.
    game.rounds.push(newRound('Mine', 2));
    game.theme.clueFont = 'Bangers';
    addSample(game);
    expect(new Set(fontsOf(game, 0).slice(0, 2 * 5 * 2))).toEqual(new Set([FACTORY_FONT]));
    expect(new Set(fontsOf(game, 1))).toEqual(new Set(['Bangers']));
  });
});

describe('a template round’s undo step', () => {
  it('names the template only when the round’s name doesn’t already say it', () => {
    expect(templateStep('Jeopardy!', 'Classic board, 6 × 5')).toBe('Added round “Jeopardy!” (Classic board, 6 × 5)');
    expect(templateStep('Race', 'Race to the finish')).toBe('Added round “Race” (Race to the finish)');
    expect(templateStep('Mini quest', 'Mini quest')).toBe('Added round “Mini quest”');
    expect(templateStep('Mini quest (2)', 'Mini quest')).toBe('Added round “Mini quest (2)”');
  });
});
