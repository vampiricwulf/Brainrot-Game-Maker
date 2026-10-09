import { describe, expect, it } from 'vitest';
import { contrast } from './colors';
import { altTile, EXTRA_LOOKS, headerBackground, isThemeColor, isThemeFont, lookNumber, presetEdited, presetTheme, stageText, themeReadability, themeStyle, tileBackground, type Theme } from './theme';
import { migrateGame, newGame } from './model';
import { categoryBox } from './boardfit';

describe('theme presets', () => {
  it("notices when the colors or fonts no longer match the theme's preset", () => {
    const t = presetTheme('dark');
    expect(presetEdited(t)).toBe(false);
    // Where the score bar goes and the images aren't part of a preset.
    expect(presetEdited({ ...t, scoreBar: 'top', banner: 'img1' })).toBe(false);
    // A color picker may write the same color in capitals.
    expect(presetEdited({ ...t, tile: t.tile.toUpperCase() })).toBe(false);
    expect(presetEdited({ ...t, value: '#ff0000' })).toBe(true);
    expect(presetEdited({ ...t, boardFont: "'Anton', Impact, sans-serif" })).toBe(true);
  });
});

describe('stage text', () => {
  it('is readable on every preset’s tiles (4.5:1 or better)', () => {
    for (const p of ['classic', 'dark', 'neon', 'pastel'] as const) {
      const t = presetTheme(p);
      expect(contrast(stageText(t), t.tile)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('Pastel uses dark text', () => {
    expect(stageText(presetTheme('pastel'))).toBe('#4a3b5c');
    expect(themeStyle(presetTheme('pastel'))).toContain('--stage-text: #4a3b5c');
  });

  it('the room code on its dark box: the value color, or white where that is too close to the box (Pastel’s purple)', () => {
    expect(themeStyle(presetTheme('pastel'))).toContain('--value-on-dark: #ffffff');
    for (const p of ['classic', 'dark', 'neon'] as const) expect(themeStyle(presetTheme(p))).toContain(`--value-on-dark: ${presetTheme(p).value}`);
  });

  it('a game from before it was a theme color: its preset’s, or black / white by its own tiles', () => {
    const { stageText: _, ...old } = presetTheme('pastel');
    expect(stageText(old)).toBe('#4a3b5c');
    expect(presetEdited(old)).toBe(false);
    expect(stageText({ ...old, tile: '#ffffcc' })).toBe('#000000');
    expect(stageText({ ...old, tile: '#202020' })).toBe('#ffffff');
  });
});

/** A theme's CSS variables as a map. */
const vars = (t: Theme) => Object.fromEntries(themeStyle(t).split('; ').map((kv) => kv.split(/: (.*)/s).slice(0, 2)));

describe('more looks', () => {
  it('a game without them draws exactly as before', () => {
    for (const p of ['classic', 'dark', 'neon', 'pastel'] as const) {
      const t = presetTheme(p);
      const v = vars(t);
      // What the board, the headers and the plates had before the new looks (Board.svelte, ScoreBar.svelte, AudienceView.svelte).
      expect(v).toMatchObject({
        '--tile': t.tile,
        '--tile-used': t.tileUsed,
        '--board-gap': t.boardGap,
        '--glow-size': t.glow === 'none' ? '0px' : '18px',
        '--tile-bg': t.tile,
        '--tile-bg-2': t.tile,
        '--tile-used-bg': t.tileUsed,
        '--tile-border-width': '3px',
        '--tile-border-color': 'rgba(0, 0, 0, 0.35)',
        '--tile-radius': '0px',
        '--tile-drop': '0 0 0 transparent',
        '--tile-gap': '10px',
        '--value-shadow': '5px 5px 0 var(--tile-shadow, #000)',
        '--header-bg': t.tile,
        '--header-bg-2': t.tile,
        '--header-line': '6px solid #000',
        '--plate-radius': '14px',
        '--board-bg': t.boardGap,
      });
      expect(presetEdited(t)).toBe(false);
    }
  });

  it('an older saved game keeps its theme and its look through loading', () => {
    const old = newGame();
    const { stageText: _s, ...theme } = presetTheme('neon');
    const before = themeStyle(theme);
    const loaded = migrateGame(JSON.parse(JSON.stringify({ ...old, theme })));
    expect(loaded.theme).toMatchObject(theme);
    expect(themeStyle(loaded.theme)).toBe(before);
    for (const k of EXTRA_LOOKS) expect(k in loaded.theme).toBe(false);
  });

  it('alternating tiles: checkerboard, rows or columns', () => {
    const at = (p: Theme['tilePattern']) => [0, 1].map((r) => [0, 1, 2].map((c) => (altTile(p, r, c) ? 1 : 0)).join('')).join('/');
    expect(at('checker')).toBe('010/101');
    expect(at('rows')).toBe('000/111');
    expect(at('columns')).toBe('010/010');
    expect(at(undefined)).toBe('000/000');
    const t: Theme = { ...presetTheme('classic'), tilePattern: 'checker', tile2: '#ff0000' };
    expect([tileBackground(t, 0, 0), tileBackground(t, 0, 1)]).toEqual([t.tile, '#ff0000']);
    expect(vars(t)['--tile-bg-2']).toBe('#ff0000');
    expect(presetEdited(t)).toBe(true);
  });

  it('gradients, borders, corners, glow, shadows, played tiles, headers, plates and the background', () => {
    const t: Theme = {
      ...presetTheme('neon'),
      tileGradient: '#000000',
      tileAngle: 90,
      tileBorder: '#ffffff',
      tileBorderWidth: 6,
      tileRadius: 20,
      glowSize: 40,
      tileShadow: true,
      valueShadow: 'none',
      usedLook: 'hidden',
      tileGap: 4,
      headerBg: '#123456',
      header2: '#654321',
      headerLine: '#ff0000',
      plateShape: 'square',
      bgGradient: '#333333',
      bgAngle: 45,
    };
    expect(vars(t)).toMatchObject({
      '--tile-bg': `linear-gradient(90deg, ${t.tile}, #000000)`,
      '--tile-border-width': '6px',
      '--tile-border-color': '#ffffff',
      '--tile-radius': '20px',
      '--glow-size': '40px',
      '--tile-drop': '0 10px 18px rgba(0, 0, 0, 0.6)',
      '--value-shadow': 'none',
      '--tile-used-bg': 'transparent',
      '--tile-gap': '4px',
      '--header-bg': '#123456',
      '--header-bg-2': '#654321',
      '--header-line': '6px solid #ff0000',
      '--plate-radius': '0px',
      '--board-bg': `linear-gradient(45deg, ${t.boardGap}, #333333)`,
    });
    expect([headerBackground(t, 0), headerBackground(t, 1)]).toEqual(['#123456', '#654321']);
    expect(vars({ ...t, headerLine: 'none' })['--header-line']).toBe('0 solid transparent');
  });

  it('numbers stay in range, and a bad color never reaches a style', () => {
    expect(lookNumber({ tileGap: 999 }, 'tileGap')).toBe(40);
    expect(lookNumber({ tileGap: Number.NaN }, 'tileGap')).toBe(10);
    const v = vars({ ...presetTheme('classic'), tile2: 'red;}', tilePattern: 'rows', tileGradient: 'url(x)', headerLine: 'x)' });
    expect(v['--tile-bg-2']).toBe(presetTheme('classic').tile);
    expect(v['--tile-bg']).toBe(presetTheme('classic').tile);
    expect(v['--header-line']).toBe('6px solid #000');
    expect(isThemeColor('#abc')).toBe(true);
    expect(isThemeColor('rgba(0, 0, 0, 0.5)')).toBe(true);
    expect(isThemeColor('red; color: blue')).toBe(false);
    expect(isThemeFont("'Comic Neue', cursive")).toBe(true);
    expect(isThemeFont('a; b{}')).toBe(false);
  });

  it('the space between tiles changes how much room a category name has', () => {
    expect(categoryBox(6, 5, { ...presetTheme('classic'), tileGap: 0 }).w).toBeGreaterThan(categoryBox(6, 5, presetTheme('classic')).w);
    expect(categoryBox(6, 5, presetTheme('classic'))).toEqual(categoryBox(6, 5));
  });
});

describe('readability', () => {
  it('checks the values on every tile color and the names on every category color', () => {
    const t = presetTheme('classic');
    const plain = themeReadability(t);
    expect(plain.values!).toBeGreaterThan(3);
    expect(plain.names!).toBeGreaterThan(3);
    // A second tile color close to the yellow values: the worst one counts.
    expect(themeReadability({ ...t, tilePattern: 'rows', tile2: '#ffdd33' }).values!).toBeLessThan(1.5);
    // (Only while tiles alternate.)
    expect(themeReadability({ ...t, tile2: '#ffdd33' }).values!).toBeGreaterThan(3);
    expect(themeReadability({ ...t, tileGradient: 'rgb(255, 210, 0)' }).values!).toBeLessThan(1.5);
    expect(themeReadability({ ...t, header2: '#f0f0f0' }).names!).toBeLessThan(1.5);
    expect(themeReadability({ ...t, headerBg: '#eeeeee' }).names!).toBeLessThan(1.5);
    expect(themeReadability({ ...t, value: 'none' }).values).toBeNull();
  });

  it('checks the Clue text color the clues are drawn in, kept when another theme is put on', () => {
    const pastel = presetTheme('pastel');
    expect(themeReadability(presetTheme('classic')).clue).toBeNull();
    expect(themeReadability({ ...presetTheme('classic'), clueColor: '#ffcc00' }).clue!).toBeGreaterThan(3);
    // Yellow clues kept on Pastel's pink tiles.
    expect(themeReadability({ ...pastel, clueColor: '#ffcc00' }).clue!).toBeLessThan(1.5);
    // Plain white is drawn in the slides' text color, which `text` checks.
    expect(themeReadability({ ...pastel, clueColor: '#FFFFFF' }).clue).toBeNull();
  });
});
