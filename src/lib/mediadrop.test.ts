import { describe, expect, it } from 'vitest';
import { fileKind, fittingFile, kindWords, refusal } from './mediadrop';

const f = (name: string, type = '') => new File(['x'], name, { type });

describe('media drops', () => {
  it('names what a slot takes', () => {
    expect(kindWords(['image'])).toBe('a picture');
    expect(kindWords(['image', 'video', 'audio'])).toBe('a picture, a video or a sound');
  });
  it('knows a file by its type or its name', () => {
    expect(fileKind(f('cat.png', 'image/png'))).toBe('image');
    expect(fileKind(f('song.mp3'))).toBe('audio');
    expect(fileKind(f('notes.txt', 'text/plain'))).toBeNull();
  });
  it('says why a file is refused', () => {
    expect(refusal(f('cat.png', 'image/png'), 'image')).toBeNull();
    expect(refusal(f('cat.png', 'image/png'), 'audio')).toBe('"cat.png" isn\'t a sound');
    expect(refusal(f('notes.txt', 'text/plain'), ['image', 'video'])).toBe('"notes.txt" isn\'t a picture or a video the game can use');
  });
  it('takes the first file that fits, else the first (whose refusal says why)', () => {
    const files = [f('a.txt', 'text/plain'), f('b.png', 'image/png')];
    expect(fittingFile(files, 'image')?.name).toBe('b.png');
    expect(fittingFile(files, 'audio')?.name).toBe('a.txt');
    expect(fittingFile([], 'audio')).toBeUndefined();
  });
});
