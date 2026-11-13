import { describe, expect, it } from 'vitest';
import { isClueSheet, strayDropLine } from './straydrop';

describe('strayDropLine', () => {
  it('says a picture went into 🖼 Media, by name', () => {
    expect(strayDropLine(['pic.png'], [])).toBe('Added “pic.png” to 🖼 Media');
    expect(strayDropLine(['a.png', 'b.mp3'], [])).toBe('Added 2 files to 🖼 Media');
  });
  it('names a file it can’t use, in one line', () => {
    expect(strayDropLine([], ['notes.txt'])).toBe('“notes.txt” isn’t a picture, video, sound, clue sheet or game file');
    expect(strayDropLine([], ['a.txt', 'b.doc'])).toBe('2 files aren’t a picture, video, sound, clue sheet or game file');
  });
  it('says where a clue sheet goes', () => {
    expect(strayDropLine([], ['clues.csv'])).toBe('“clues.csv” is a sheet of clues: drop it on a board’s 📥 Import clues…');
    expect(isClueSheet('a.TSV')).toBe(true);
    expect(isClueSheet('a.txt')).toBe(false);
  });
  it('says both when some were added and some weren’t', () => {
    expect(strayDropLine(['pic.png'], ['notes.txt'])).toBe('Added “pic.png” to 🖼 Media. “notes.txt” isn’t a picture, video, sound, clue sheet or game file');
  });
  it('says nothing for nothing', () => expect(strayDropLine([], [])).toBe(''));
});
