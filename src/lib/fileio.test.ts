import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { isGameFile, parseGame, safeFilename, saveTarget } from './fileio';
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

  it('never use a name Windows keeps for a device', () => {
    expect(safeFilename('Con')).toBe('_Con');
    expect(safeFilename('LPT1!')).toBe('_LPT1');
    expect(safeFilename('Console')).toBe('Console');
    expect(safeFilename('COM10')).toBe('COM10');
  });
});

describe('Save in the desktop app (replacing the last save)', () => {
  it('replaces this game’s own save, with a backup', () => {
    expect(saveTarget('Quiz.brainrot', 'g1', {}, [])).toEqual({ name: 'Quiz.brainrot', mode: 'backup' });
    expect(saveTarget('Quiz.brainrot', 'g1', { 'Quiz.brainrot': 'g1' }, ['Quiz.brainrot'])).toEqual({ name: 'Quiz.brainrot', mode: 'backup' });
  });

  it('never replaces another game’s save of the same name, or a file it doesn’t know', () => {
    expect(saveTarget('Quiz.brainrot', 'g2', { 'Quiz.brainrot': 'g1' }, ['Quiz.brainrot'])).toEqual({ name: 'Quiz.brainrot', mode: 'new' });
    expect(saveTarget('Quiz.brainrot', 'g2', {}, ['quiz.brainrot'])).toEqual({ name: 'Quiz.brainrot', mode: 'new' });
    // That game's next Save goes to the file it got then.
    expect(saveTarget('Quiz.brainrot', 'g2', { 'Quiz.brainrot': 'g1', 'Quiz (2).brainrot': 'g2' }, ['Quiz.brainrot', 'Quiz (2).brainrot'])).toEqual({
      name: 'Quiz (2).brainrot',
      mode: 'backup',
    });
    // The same game's export is another file.
    expect(saveTarget('Quiz.html', 'g2', { 'Quiz (2).brainrot': 'g2' }, [])).toEqual({ name: 'Quiz.html', mode: 'backup' });
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

  it('opens the game in an exported .html', async () => {
    const zip = new JSZip();
    zip.file('game.json', JSON.stringify({ ...jeopardyGame(), title: 'Exported' }));
    const b64 = await zip.generateAsync({ type: 'base64' });
    // The app's own code mentions the pack's element too; the pack itself comes last.
    const html = `<!doctype html><html><body><script>const id = 'jb-pack'; x.innerHTML = '<script id="jb-pack">';</script><div id="app"></div><script type="application/octet-stream" id="jb-pack">${b64}</script>\n</body></html>`;
    expect((await openGameFile(new File([html], 'Exported.html', { type: 'text/html' }))).title).toBe('Exported');
    await expect(openGameFile(new File(['<!doctype html><p>hi</p>'], 'Page.html'))).rejects.toThrow('This page has no game inside');
  });

  it('opens a backup the desktop app kept', async () => {
    const file = new File([JSON.stringify({ ...jeopardyGame(), title: 'Older' })], 'Older.json.bak2');
    expect((await openGameFile(file)).title).toBe('Older');
    expect(isGameFile('Older.json.bak2') && isGameFile('Quiz.HTML') && isGameFile('Quiz.brainrot.bak')).toBe(true);
    expect(isGameFile('notes.txt') || isGameFile('photo.png.bak')).toBe(false);
  });
});
