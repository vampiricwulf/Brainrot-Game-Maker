import { describe, expect, it } from 'vitest';
import { fileKind, fittingFile, isGameDrop, kindWords, notMedia, refusal, wrongFile } from './mediadrop';

const f = (name: string, type = '') => new File(['x'], name, { type });

describe('media drops', () => {
  it('names what a slot takes', () => {
    expect(kindWords(['image'])).toBe('a picture file');
    expect(kindWords(['image', 'video', 'audio'])).toBe('a picture, video or sound file');
  });
  it('knows a file by its type or its name', () => {
    expect(fileKind(f('cat.png', 'image/png'))).toBe('image');
    expect(fileKind(f('song.mp3'))).toBe('audio');
    expect(fileKind(f('notes.txt', 'text/plain'))).toBeNull();
  });
  it('leaves a game or theme file to the editor, which opens it', () => {
    expect(['Quiz.brainrot', 'Quiz.html', 'Quiz.zip', 'game.json', 'Neon.brainrot-theme'].every((n) => notMedia(f(n)))).toBe(true);
    expect(notMedia(f('cat.png', 'image/png'))).toBe(false);
    const drop = (...names: string[]) => ({ dataTransfer: { files: names.map((n) => f(n)) } }) as unknown as DragEvent;
    expect(isGameDrop(drop('cat.png', 'Quiz.brainrot'))).toBe(true);
    expect(isGameDrop(drop('cat.png'))).toBe(false);
  });
  it('says why a file is refused', () => {
    expect(refusal(f('cat.png', 'image/png'), 'image')).toBeNull();
    // (As ＋ Add files… says it: curly quotes, the same words.)
    expect(refusal(f('cat.png', 'image/png'), 'audio')).toBe('“cat.png” isn’t a sound file.');
    expect(refusal(f('notes.txt', 'text/plain'), ['image', 'video'])).toBe('“notes.txt” isn’t a picture or video file.');
    expect(wrongFile('song.mp3', 'image')).toBe('“song.mp3” isn’t a picture file.');
  });
  it('takes the first file that fits, else the first (whose refusal says why)', () => {
    const files = [f('a.txt', 'text/plain'), f('b.png', 'image/png')];
    expect(fittingFile(files, 'image')?.name).toBe('b.png');
    expect(fittingFile(files, 'audio')?.name).toBe('a.txt');
    expect(fittingFile([], 'audio')).toBeUndefined();
  });
});
