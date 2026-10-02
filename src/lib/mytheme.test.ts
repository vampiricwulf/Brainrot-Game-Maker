import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMyTheme, changeMyTheme, deleteMyTheme, freshThemeName, loadMyThemes, missingFonts, themeMedia, usesUploadedFonts, withMyTheme, type SavedTheme } from './mytheme';
import type { Theme } from './theme';
import { uploadedFamily } from './fonts';
import { newGame } from './model';
import { presetTheme } from './theme';

/** The old one-theme helpers, on the list: save as the only theme, load the first. */
const saveMyTheme = (t: Theme): boolean => !!addMyTheme([], 'Mine', t);
const loadMyTheme = (): SavedTheme | null => loadMyThemes()[0]?.theme ?? null;

describe('my theme', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('keeps colors, fonts and layout but not the pictures', () => {
    expect(loadMyTheme()).toBeNull();
    const t = { ...presetTheme('neon'), boardImage: 'img', banner: 'ban', scoreBar: 'top' as const };
    expect(saveMyTheme(t)).toBe(true);
    const mine = loadMyTheme()!;
    expect(mine.tile).toBe(t.tile);
    expect('boardImage' in mine || 'banner' in mine).toBe(false);
    // On another game: its own pictures stay.
    const other = { ...presetTheme('classic'), banner: 'mine' };
    expect(withMyTheme(other, mine)).toMatchObject({ tile: t.tile, scoreBar: 'top', banner: 'mine', boardImage: undefined });
  });

  it('keeps the clue text look and the OBS stage background', () => {
    const t = { ...presetTheme('neon'), clueFont: 'Georgia, serif', clueColor: '#ffeeaa', stageBg: 'green' as const };
    expect(saveMyTheme(t)).toBe(true);
    const mine = loadMyTheme()!;
    expect(mine).toMatchObject({ clueFont: 'Georgia, serif', clueColor: '#ffeeaa', stageBg: 'green' });
    const other = { ...presetTheme('classic'), clueFont: 'Impact', stageBg: 'magenta' as const };
    expect(withMyTheme(other, mine)).toMatchObject({ clueFont: 'Georgia, serif', clueColor: '#ffeeaa', stageBg: 'green' });
    // A saved theme without them takes them off (the game's own don't linger).
    saveMyTheme(presetTheme('dark'));
    const plain = withMyTheme(other, loadMyTheme()!);
    expect([plain.clueFont, plain.clueColor, plain.stageBg]).toEqual([undefined, undefined, undefined]);
  });

  it('keeps the text on slides & scores, and takes off a game’s own when it has none', () => {
    saveMyTheme({ ...presetTheme('neon'), stageText: '#ffee00' });
    const other = { ...presetTheme('classic'), stageText: '#123456' };
    expect(withMyTheme(other, loadMyTheme()!).stageText).toBe('#ffee00');
    const { stageText: _s, ...older } = presetTheme('dark');
    saveMyTheme(older);
    expect(withMyTheme(other, loadMyTheme()!).stageText).toBeUndefined();
  });

  it('says so when the browser won’t store it', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(saveMyTheme(presetTheme('dark'))).toBe(false);
    expect(loadMyTheme()).toBeNull();
  });

  it('a theme from another game brings its pictures and uploaded fonts', () => {
    const g = newGame();
    g.media.push(
      { id: 'bg', name: 'bg.png', mime: 'image/png', size: 1, kind: 'image' },
      { id: 'font12345678', name: 'f.ttf', mime: 'font/ttf', size: 1, kind: 'font' },
      { id: 'other', name: 'o.png', mime: 'image/png', size: 1, kind: 'image' },
    );
    g.theme.boardImage = 'bg';
    g.theme.boardFont = `'${uploadedFamily('font12345678')}', sans-serif`;
    expect(themeMedia(g).map((m) => m.id)).toEqual(['bg', 'font12345678']);
    // An uploaded font used only for the clue text comes along too.
    g.theme.boardFont = 'serif';
    g.theme.clueFont = `'${uploadedFamily('font12345678')}', sans-serif`;
    expect(themeMedia(g).map((m) => m.id)).toEqual(['bg', 'font12345678']);
  });

  it('a font uploaded to another game: this game keeps its own font for that text', () => {
    const font = { id: 'font12345678', name: 'f.ttf', mime: 'font/ttf', size: 1, kind: 'font' as const };
    const t = { ...presetTheme('neon'), boardFont: `'${uploadedFamily(font.id)}', sans-serif` };
    expect(usesUploadedFonts(t)).toBe(true);
    expect(usesUploadedFonts(presetTheme('neon'))).toBe(false);
    saveMyTheme(t);
    const mine = loadMyTheme()!;
    const here = presetTheme('classic');
    expect(missingFonts(mine, [])).toEqual(['boardFont']);
    expect(withMyTheme(here, mine, []).boardFont).toBe(here.boardFont);
    expect(withMyTheme(here, mine, []).tile).toBe(t.tile);
    // In a game that has that font, it's used.
    expect(missingFonts(mine, [font])).toEqual([]);
    expect(withMyTheme(here, mine, [font]).boardFont).toBe(t.boardFont);
  });
});

describe('my themes (several, named)', () => {
  let store: Map<string, string>;
  let full = false;
  beforeEach(() => {
    store = new Map();
    full = false;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new DOMException('full', 'QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('saves, renames, updates and deletes, kept across loads', () => {
    let list = addMyTheme([], 'Neon night', presetTheme('neon'))!;
    list = addMyTheme(list, '  Pastel   party ', { ...presetTheme('pastel'), tilePattern: 'checker', tile2: '#ffffff' })!;
    expect(loadMyThemes().map((m) => m.name)).toEqual(['Neon night', 'Pastel party']);
    expect(loadMyThemes()[1].theme).toMatchObject({ tilePattern: 'checker', tile2: '#ffffff' });
    list = changeMyTheme(list, list[0].id, { name: 'Neon' })!;
    list = changeMyTheme(list, list[0].id, { theme: presetTheme('dark') })!;
    expect(loadMyThemes()[0]).toMatchObject({ name: 'Neon', theme: { tile: presetTheme('dark').tile } });
    list = deleteMyTheme(list, list[1].id)!;
    expect(loadMyThemes().map((m) => m.name)).toEqual(['Neon']);
  });

  it('never keeps the pictures', () => {
    addMyTheme([], 'Pics', { ...presetTheme('neon'), boardImage: 'img', banner: 'ban' });
    const mine = loadMyThemes()[0].theme;
    expect('boardImage' in mine || 'banner' in mine).toBe(false);
  });

  it('a full or blocked storage says so and changes nothing', () => {
    const list = addMyTheme([], 'One', presetTheme('neon'))!;
    full = true;
    expect(addMyTheme(list, 'Two', presetTheme('dark'))).toBeNull();
    expect(changeMyTheme(list, list[0].id, { name: 'X' })).toBeNull();
    expect(deleteMyTheme(list, list[0].id)).toBeNull();
    expect(loadMyThemes().map((m) => m.name)).toEqual(['One']);
  });

  it('the one “my theme” from before becomes the first saved theme', () => {
    const { boardImage: _b, ...old } = { ...presetTheme('neon'), boardImage: 'x', value: '#123456' };
    store.set('brainrot.myTheme', JSON.stringify(old));
    const list = loadMyThemes();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'My theme', theme: { value: '#123456', tile: old.tile } });
    expect(store.has('brainrot.myTheme')).toBe(false);
    // (Moved once: the same one next time.)
    expect(loadMyThemes()[0].id).toBe(list[0].id);
  });

  it('damaged entries are left out, the rest load', () => {
    store.set('brainrot.myThemes', JSON.stringify([{ id: 'a', name: 'ok', theme: presetTheme('dark') }, { id: 'b', theme: { tile: 'red; background: url(x)' } }, 'junk', null]));
    expect(loadMyThemes().map((m) => m.name)).toEqual(['ok']);
    store.set('brainrot.myThemes', '{not json');
    expect(loadMyThemes()).toEqual([]);
  });

  it('a new name none has yet', () => {
    const list = addMyTheme(addMyTheme([], 'Neon', presetTheme('neon'))!, 'Neon 2', presetTheme('neon'))!;
    expect(freshThemeName(list, 'neon')).toBe('neon 3');
    expect(freshThemeName(list, 'Fresh')).toBe('Fresh');
  });

  it('a saved theme brings its own looks, or takes the game’s off', () => {
    const game = { ...presetTheme('classic'), tilePattern: 'rows' as const, tile2: '#111111', leaderGlow: true };
    const plain = withMyTheme(game, presetTheme('dark'));
    expect([plain.tilePattern, plain.tile2, plain.leaderGlow]).toEqual([undefined, undefined, undefined]);
    const fancy = withMyTheme(presetTheme('classic'), { ...presetTheme('dark'), tilePattern: 'checker', tile2: '#222222', tileRadius: 12 });
    expect(fancy).toMatchObject({ tilePattern: 'checker', tile2: '#222222', tileRadius: 12 });
  });
});
