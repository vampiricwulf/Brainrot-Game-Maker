import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMyTheme, saveMyTheme, themeMedia, withMyTheme } from './mytheme';
import { uploadedFamily } from './fonts';
import { newGame } from './model';
import { presetTheme } from './theme';

describe('my theme', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
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
});
