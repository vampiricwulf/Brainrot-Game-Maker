import { describe, expect, it } from 'vitest';
import { unusedNote } from './export';
import type { MediaRef } from './model';
import { jeopardyGame } from './testgame';

const MB = 1024 ** 2;
const file = (id: string, size: number, more: Partial<MediaRef> = {}): MediaRef => ({ id, name: `${id}.wav`, mime: 'audio/wav', size, kind: 'audio', ...more });

describe('the export’s size questions', () => {
  it('say how much of the file is files nothing in the game uses', () => {
    const game = jeopardyGame();
    game.media.push(file('big', 118 * MB), file('song', 3 * MB));
    game.audio = { ...game.audio, tileOpen: 'song' };
    expect(unusedNote(game)).toBe('\n\n118.0 MB of it is files nothing in the game uses: 🖼 Media › 🗑 Delete unused leaves them out.');
  });

  it('say nothing for a few MB, files the game uses, or live links', () => {
    const game = jeopardyGame();
    game.media.push(file('small', 4 * MB), file('used', 200 * MB), file('link', 500 * MB, { url: 'https://example.com/a.wav' }));
    game.audio = { ...game.audio, tileOpen: 'used' };
    expect(unusedNote(game)).toBe('');
  });
});
