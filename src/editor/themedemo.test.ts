import { describe, expect, it } from 'vitest';
import { setSlideText, type BoardRound, type FinalRound, type TextEl } from '../lib/model';
import { jeopardyGame } from '../lib/testgame';
import { SAMPLE_CLUE, withSampleClue } from './themedemo';

const words = (s: { elements: { kind: string }[] }) => s.elements.filter((e): e is TextEl => e.kind === 'text').map((e) => e.text);

describe('the Theme preview’s sample clue', () => {
  it('shows sample words on a copy of a clue or Final with nothing written, and never touches the game', () => {
    const game = jeopardyGame();
    const board = game.rounds[0] as BoardRound;
    const fi = game.rounds.findIndex((r) => r.mode === 'final');
    const final = game.rounds[fi] as FinalRound;
    final.category = '';
    const before = JSON.stringify(game);
    // ❓ A clue: the first board's first clue, open.
    const shown = withSampleClue(game, 0, true);
    expect(words((shown.rounds[0] as BoardRound).categories[0].clues[0].questionSlide)).toEqual([SAMPLE_CLUE]);
    // The Final: its question, and a category.
    const f = withSampleClue(game, fi).rounds[fi] as FinalRound;
    expect([words(f.questionSlide), f.category]).toEqual([[SAMPLE_CLUE], 'Sample category']);
    expect(JSON.stringify(game)).toBe(before);
    // The board itself (not a clue), or a clue with words of its own: the game as it is.
    expect(withSampleClue(game, 0)).toBe(game);
    setSlideText(board.categories[0].clues[0].questionSlide, 'Who is Shrek?');
    expect(withSampleClue(game, 0, true)).toBe(game);
    final.category = 'Memes';
    setSlideText(final.questionSlide, 'Q');
    expect(withSampleClue(game, fi)).toBe(game);
  });
});
