import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { BIG_FILE, GAME_FILES, isGameFile, OTHER_GAME_FILES, parseGame, readTextFile, safeFilename, savedWhere, saveTarget, usePicker } from './fileio';
import { base64Length, MAX_HTML_CHARS, MAX_PACK_CHARS, TOO_BIG_TO_OPEN, tooBigForHtml } from './export';
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
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-fg-h-i-j');
    // Words and numbers stay apart; quotes just go.
    expect(safeFilename('Part 1/2')).toBe('Part-1-2');
    expect(safeFilename('Round 1:2')).toBe('Round-1-2');
    expect(safeFilename('Bob’s Quiz')).toBe('Bobs-Quiz');
    expect(safeFilename('"Best" of 2024')).toBe('Best-of-2024');
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

  it('knows which folder each save is in', () => {
    const app = 'C:\\Games\\BrainrotSaves';
    const docs = 'C:\\Users\\Ann\\Documents\\BrainrotSaves';
    const owners = { [`${docs}\\Quiz (2).brainrot`]: 'g1', [`${app}\\Quiz.brainrot`]: 'g2' };
    // g1's save in Documents is "Quiz (2)"; next to the app, "Quiz.brainrot" is another game's.
    expect(saveTarget('Quiz.brainrot', 'g1', owners, ['Quiz.brainrot'], app, true)).toEqual({ name: 'Quiz.brainrot', mode: 'new' });
    expect(saveTarget('Quiz.brainrot', 'g1', owners, ['Quiz (2).brainrot'], docs)).toEqual({ name: 'Quiz (2).brainrot', mode: 'backup' });
    expect(saveTarget('Quiz.brainrot', 'g2', owners, ['Quiz.brainrot'], app.toLowerCase(), true)).toEqual({ name: 'Quiz.brainrot', mode: 'backup' });
    // Saves recorded by name only (before folders) count for the app's own folder.
    expect(saveTarget('Quiz.brainrot', 'g3', { 'Quiz.brainrot': 'g3' }, ['Quiz.brainrot'], app, true)).toEqual({ name: 'Quiz.brainrot', mode: 'backup' });
    expect(saveTarget('Quiz.brainrot', 'g3', { 'Quiz.brainrot': 'g3' }, ['Quiz.brainrot'], docs)).toEqual({ name: 'Quiz.brainrot', mode: 'new' });
  });
});

describe('opening game files', () => {
  it('explains a damaged .json instead of showing the parser’s error', () => {
    expect(() => parseGame('{"version": 2, "title": "Cut o')).toThrow("This file isn't a readable game (.json)");
    expect(() => parseGame('PK not json at all')).toThrow("This file isn't a readable game (.json)");
    expect(() => parseGame('{"hello": 1}')).toThrow('This file is not a Brainrot Games Maker game.');
    expect(() => parseGame('{"format": "brainrot-theme", "version": 1, "theme": {}}')).toThrow('This is a theme file, not a game');
  });

  it('opens a pack that was named .json', async () => {
    const zip = new JSZip();
    zip.file('game.json', JSON.stringify({ ...jeopardyGame(), title: 'Packed' }));
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'Packed.json', { type: 'application/json' });
    expect((await openGameFile(file)).title).toBe('Packed');
  });

  it('opens the game in a zip someone made of it, and says to unzip a zip of pictures', async () => {
    const pack = new JSZip();
    pack.file('game.json', JSON.stringify({ ...jeopardyGame(), title: 'Zipped' }));
    const zip = new JSZip();
    zip.file('My Game/Quiz.brainrot', await pack.generateAsync({ type: 'uint8array' }));
    // (What a Mac adds to a zip it makes is no second game.)
    zip.file('__MACOSX/My Game/._Quiz.brainrot', 'x');
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'Quiz.zip', { type: 'application/zip' });
    expect((await openGameFile(file)).title).toBe('Zipped');
    const pics = new JSZip();
    pics.file('cat.png', 'x');
    const memes = new File([await pics.generateAsync({ type: 'arraybuffer' })], 'memes.zip', { type: 'application/zip' });
    await expect(openGameFile(memes)).rejects.toThrow("This .zip doesn't hold a Brainrot game");
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

  it('opens an export that says its pack size and date, and refuses one cut off', async () => {
    const zip = new JSZip();
    zip.file('game.json', JSON.stringify({ ...jeopardyGame(), title: 'Sized' }));
    const b64 = await zip.generateAsync({ type: 'base64' });
    const page = (pack: string) =>
      `<!doctype html><html><body><script>const t = \`<script type="application/octet-stream" id="jb-pack" data-size="\${n}">\`;</script><script type="application/octet-stream" id="jb-pack" data-size="${b64.length}" data-exported="1700000000000">${pack}</script>\n</body></html>`;
    expect((await openGameFile(new File([page(b64)], 'Sized.html', { type: 'text/html' }))).title).toBe('Sized');
    await expect(openGameFile(new File([page(b64.slice(0, b64.length - 40))], 'Sized.html'))).rejects.toThrow('This file is incomplete');
  });

  it('opens a backup the desktop app kept', async () => {
    const file = new File([JSON.stringify({ ...jeopardyGame(), title: 'Older' })], 'Older.json.bak2');
    expect((await openGameFile(file)).title).toBe('Older');
    expect(isGameFile('Older.json.bak2') && isGameFile('Quiz.HTML') && isGameFile('Quiz.brainrot.bak')).toBe(true);
    expect(isGameFile('notes.txt') || isGameFile('photo.png.bak')).toBe(false);
    // A pack zipped by hand opens when dropped, as through Browse….
    expect(isGameFile('Quiz.zip')).toBe(true);
    // Open… and Import rounds… list the same game files, .htm pages too (a theme file holds no rounds).
    expect(OTHER_GAME_FILES.split(',')).toEqual(GAME_FILES.split(',').filter((t) => t !== '.brainrot-theme'));
    expect(GAME_FILES.split(',')).toContain('.htm');
  });

  it('says an exported game too long to read is too big, instead of failing to read it', async () => {
    const huge = { name: 'Huge.html', size: MAX_HTML_CHARS + 1, type: 'text/html', slice: () => new Blob(['<!']) } as unknown as File;
    Object.setPrototypeOf(huge, File.prototype);
    await expect(openGameFile(huge)).rejects.toThrow(TOO_BIG_TO_OPEN);
  });
});

describe('reading a CSV or text file', () => {
  it('reads UTF-8, UTF-16 by its BOM, and Excel’s Windows-1252 CSV', async () => {
    const words = 'This Pokémon is yellow,She sang “Halo”,Who is Beyoncé?';
    expect(await readTextFile(new Blob([words]))).toBe(words);
    expect(await readTextFile(new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), words]))).toBe(words);
    const utf16 = new Uint8Array(2 + words.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < words.length; i++) utf16.set([words.charCodeAt(i) & 0xff, words.charCodeAt(i) >> 8], 2 + i * 2);
    expect(await readTextFile(new Blob([utf16]))).toBe(words);
    // (As Excel's "CSV (Comma delimited)" saves it on Windows: é = E9, “ = 93, ” = 94.)
    const ansi = new Uint8Array([...'Pok'].map((c) => c.charCodeAt(0)).concat(0xe9, 0x2c, 0x93, 0x48, 0x94));
    expect(await readTextFile(new Blob([ansi]))).toBe('Poké,“H”');
  });
});

describe('exported HTML size', () => {
  it('refuses a pack the browser could not read back out of the page', () => {
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
    const limit = (MAX_PACK_CHARS / 4) * 3;
    expect(tooBigForHtml(limit)).toBe(false);
    expect(tooBigForHtml(limit + 3)).toBe(true);
    // About 375 MB of game.
    expect(Math.round(limit / 1e6)).toBe(375);
  });
});

describe('saving in a browser', () => {
  it('asks where to save only a big file, and only where the browser can', () => {
    expect(usePicker(BIG_FILE, true)).toBe(true);
    expect(usePicker(BIG_FILE - 1, true)).toBe(false);
    expect(usePicker(BIG_FILE * 3, false)).toBe(false);
  });

  it('says a download started, not that it is done', () => {
    expect(savedWhere(null, 'Quiz.brainrot')).toBe('Download started: Quiz.brainrot');
    expect(savedWhere({ path: 'Quiz.brainrot', fallback: false, picked: true }, 'Quiz.brainrot')).toBe('Saved Quiz.brainrot');
    expect(savedWhere({ path: 'C:\\Games\\BrainrotSaves\\Quiz.brainrot', fallback: false }, 'Quiz.brainrot')).toBe('Saved to C:\\Games\\BrainrotSaves\\Quiz.brainrot');
  });
});
