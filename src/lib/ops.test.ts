import { describe, expect, it } from 'vitest';
import { newGame, newRound, type TextEl } from './model';
import { restyle, textStyleTargets } from './ops';

const mainText = (s: { elements: { kind: string }[] }) => s.elements.find((e) => e.kind === 'text') as TextEl;

describe('use this style elsewhere', () => {
  it('finds the main text of the chosen slides, never the source itself', () => {
    const game = newGame();
    game.rounds.push(newRound('Double', 2, [400, 800]));
    const round = game.rounds[0];
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
    const game = newGame();
    const round = game.rounds[0];
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
});
