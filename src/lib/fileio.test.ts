import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseGame, safeFilename } from './fileio';
import { openGameFile } from './pack';
import { jeopardyGame } from './testgame';

describe('file names from titles', () => {
  it('keep letters of any language', () => {
    expect(safeFilename('My Game!')).toBe('My-Game');
    expect(safeFilename('Café Quiz')).toBe('Café-Quiz');
    expect(safeFilename('Ñoño & Friends!')).toBe('Ñoño-Friends');
    expect(safeFilename('ブレインロット')).toBe('ブレインロット');
    expect(safeFilename('Привет, мир')).toBe('Привет-мир');
  });

  it('drop what a file name can’t hold, and dashes left at the ends', () => {
    expect(safeFilename('💀 Brainrot Night')).toBe('Brainrot-Night');
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(safeFilename(' - Quiz - ')).toBe('Quiz');
    expect(safeFilename('💀💀')).toBe('game');
    expect(safeFilename('')).toBe('game');
  });

  it('are 60 letters at most, never cutting one in half', () => {
    expect(safeFilename('x'.repeat(80))).toHaveLength(60);
    const math = '𝒜'.repeat(70); // letters outside the basic range take two UTF-16 units each
    expect(Array.from(safeFilename(math))).toEqual(Array.from(math).slice(0, 60));
  });
});

describe('opening game files', () => {
  it('explains a damaged .json instead of showing the parser’s error', () => {
    expect(() => parseGame('{"version": 2, "title": "Cut o')).toThrow("This file isn't a readable game (.json)");
    expect(() => parseGame('PK not json at all')).toThrow("This file isn't a readable game (.json)");
    expect(() => parseGame('{"hello": 1}')).toThrow('This file is not a Brainrot Games Maker game.');
  });

  it('opens a pack that was named .json', async () => {
    const zip = new JSZip();
    zip.file('game.json', JSON.stringify({ ...jeopardyGame(), title: 'Packed' }));
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'Packed.json', { type: 'application/json' });
    expect((await openGameFile(file)).title).toBe('Packed');
  });

  it('opens a plain .json game', async () => {
    const file = new File([JSON.stringify({ ...jeopardyGame(), title: 'Plain' })], 'Plain.json');
    expect((await openGameFile(file)).title).toBe('Plain');
  });
});
