import { describe, expect, it } from 'vitest';
import { contrast, obsKeyed } from './colors';
import { altTile, EXTRA_LOOKS, headerBackground, isThemeColor, isThemeFont, keyedRoundColors, keyedThemeColors, lookNumber, otherStageKey, presetEdited, presetTheme, rightFill, roundStageColors, splashColors, STAGE_KEYS, stageText, themeReadability, themeStyle, tileBackground, type Theme } from './theme';
import { migrateGame, newGame } from './model';
import { categoryBox } from './boardfit';
import { newBoardGameRound } from './boardgame';
import { newRpgRound } from './rpg';

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

  it('outlines a category name over its picture by the names’ own color: black round light ones, a light halo round dark ones', () => {
    const pastel = presetTheme('pastel');
    expect(themeStyle(pastel)).toContain('--name-shadow: rgba(255, 255, 255, 0.75)');
    // White names on dark headers, still on Pastel's light tiles.
    expect(themeStyle({ ...pastel, headerBg: '#4a3b5c', boardText: '#ffffff' })).toContain('--name-shadow: #000;');
    for (const p of ['classic', 'dark', 'neon'] as const) expect(themeStyle(presetTheme(p))).toContain('--name-shadow: #000;');
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

describe('colors OBS would key out', () => {
  it('names the theme colors a chroma-key stage background makes see-through', () => {
    const neon = presetTheme('neon');
    expect(keyedThemeColors(neon)).toEqual([]);
    // Neon's green values on the green key (its cyan names go partly see-through), its magenta glow on the magenta one.
    expect(keyedThemeColors({ ...neon, stageBg: 'green' })).toEqual(['Values', 'Category names']);
    expect(keyedThemeColors({ ...neon, stageBg: 'magenta' })).toEqual(['Tiles & slide background', 'Tile glow']);
    expect(keyedThemeColors(presetTheme('classic'), 'green')).toEqual([]);
    // (Classic's blue tiles are less than half there on a magenta key.)
    expect(keyedThemeColors(presetTheme('classic'), 'magenta')).toEqual(['Tiles & slide background', 'Used tiles']);
    expect(keyedThemeColors(presetTheme('dark'), 'green')).toEqual([]);
    expect(keyedThemeColors(presetTheme('dark'), 'magenta')).toEqual([]);
  });

  it('only the looks that show: played tiles in their color, a glow, alternating tiles, a line under the categories', () => {
    const t: Theme = { ...presetTheme('dark'), stageBg: 'green', tileUsed: '#00ff00', glow: '#00ff00', tile2: '#00ff00', headerLine: '#00ff00' };
    expect(keyedThemeColors(t)).toEqual(['Used tiles', 'Tile glow', 'Line under the categories']);
    expect(keyedThemeColors({ ...t, usedLook: 'dim', glow: 'none', tilePattern: 'rows', headerLine: 'none' })).toEqual(['Second tile color']);
    expect(keyedThemeColors({ ...t, tileUsed: 'rgb(0, 200, 0)', clueColor: '#33ee33' }, 'green')).toEqual(['Used tiles', 'Tile glow', 'Clue text color', 'Line under the categories']);
    // A glow or a border of size 0 doesn't show.
    const sized: Theme = { ...presetTheme('dark'), stageBg: 'magenta', glow: '#ff00e6', tileBorder: '#ff00ff' };
    expect(keyedThemeColors(sized)).toEqual(['Tile glow', 'Border color']);
    expect(keyedThemeColors({ ...sized, glowSize: 0, tileBorderWidth: 0 })).toEqual([]);
    expect(otherStageKey({ ...sized, stageBg: 'green', glowSize: 0, tileBorderWidth: 0 })).toBe('magenta');
  });

  it('a gradient whose middle the key takes, though both its ends are clear', () => {
    const t: Theme = { ...presetTheme('dark'), stageBg: 'magenta', tile: '#ff4000', tileGradient: '#3050ff' };
    expect(keyedThemeColors(t)).toEqual(['Tile gradient']);
    expect(keyedThemeColors({ ...t, tileGradient: '#ffcc00' })).toEqual([]);
    expect(keyedThemeColors({ ...t, tileGradient: undefined, headerBg: '#3050ff', headerGradient: '#ff4000' })).toEqual(['Category gradient']);
    // From the second tile color too; a start color the key takes is named on its own.
    expect(keyedThemeColors({ ...t, tile: '#ffcc00', tilePattern: 'checker', tile2: '#ff4000' })).toEqual(['Tile gradient']);
    expect(keyedThemeColors({ ...t, tile: '#ff00ff', tileGradient: '#ffcc00' })).toEqual(['Tiles & slide background']);
  });

  it('a game with no Jeopardy board: only the colors its rounds show', () => {
    const neon = presetTheme('neon');
    expect(keyedThemeColors(neon, 'green', false)).toEqual(['Values']);
    expect(keyedThemeColors(neon, 'magenta', false)).toEqual(['Tiles & slide background']);
    const t: Theme = { ...presetTheme('dark'), stageBg: 'green', tileUsed: '#00ff00', glow: '#00ff00', tilePattern: 'rows', tile2: '#00ff00', tileGradient: '#00ff00', tileBorder: '#00ff00' };
    expect(keyedThemeColors({ ...t, boardText: '#00ff00', headerBg: '#00ff00', header2: '#00ff00', headerGradient: '#00ff00', headerLine: '#00ff00' }, 'green', false)).toEqual([]);
    expect(keyedThemeColors({ ...t, scoreBarBg: '#00ff00', clueColor: '#00ff00' }, 'green', false)).toEqual(['Score bar', 'Clue text color']);
  });

  it('offers the other key only when it leaves the theme’s colors and the players’ alone', () => {
    const neon = presetTheme('neon');
    expect(otherStageKey(neon)).toBeUndefined();
    // Neon's tiles go on magenta (and its glow), its values on green.
    expect(otherStageKey({ ...neon, stageBg: 'green' })).toBeUndefined();
    expect(otherStageKey({ ...neon, stageBg: 'green' }, [], false)).toBeUndefined();
    expect(otherStageKey({ ...neon, stageBg: 'magenta' }, [], false)).toBeUndefined();
    const dark: Theme = { ...presetTheme('dark'), stageBg: 'green', value: '#39ff14' };
    expect(otherStageKey(dark)).toBe('magenta');
    expect(otherStageKey(dark, ['#00c000', '#4363d8'])).toBe('magenta');
    // A magenta player would be keyed out there.
    expect(otherStageKey(dark, ['#4363d8', '#f032e6'])).toBeUndefined();
    // So would the palette's red, by OBS's sums (though it isn't pink).
    expect(otherStageKey(dark, ['#e6194b'])).toBeUndefined();
    expect(otherStageKey({ ...dark, stageBg: 'magenta' }, ['#00c000'])).toBeUndefined();
    // Classic's blue tiles go on magenta.
    expect(otherStageKey({ ...presetTheme('classic'), stageBg: 'green' })).toBeUndefined();
    // A pink glow goes on magenta, but only a board has one.
    const glow: Theme = { ...neon, stageBg: 'green', tile: '#202020', glow: '#ff00e6' };
    expect(keyedThemeColors(glow, 'magenta')).toEqual(['Tile glow']);
    expect(otherStageKey(glow)).toBeUndefined();
    expect(otherStageKey(glow, [], false)).toBe('magenta');
  });

  it('names what board games and RPG screens show behind everything, as they come, that the key takes out', () => {
    const game = newGame();
    const board = newBoardGameRound();
    game.rounds = [board];
    // The board's green backdrop, and its green and cyan spaces, on green; its red, purple and magenta spaces on magenta.
    expect(keyedRoundColors(roundStageColors(game), 'green')).toEqual(['the board game’s backdrop', 'board spaces']);
    expect(keyedRoundColors(roundStageColors(game), 'magenta')).toEqual(['board spaces']);
    expect(keyedRoundColors(roundStageColors(game), undefined)).toEqual([]);
    board.spaces.forEach((sp) => (sp.color = '#f58231'));
    expect(keyedRoundColors(roundStageColors(game), 'magenta')).toEqual([]);
    // An off-board zone left as it comes is purple, partly gone on magenta.
    board.zones.push({ id: 'z1', name: 'Shadow Realm', slide: { background: {}, elements: [] } });
    expect(keyedRoundColors(roundStageColors(game), 'magenta')).toEqual(['an off-board zone']);
    // A backdrop under a picture or a gradient isn't counted.
    board.slide.background = { color: '#1d5e3a', image: 'm1' };
    expect(keyedRoundColors(roundStageColors(game), 'green')).toEqual([]);
    board.slide.background = { gradient: 'linear-gradient(#00ff00, #00ff00)' };
    expect(keyedRoundColors(roundStageColors(game), 'green')).toEqual([]);
    // RPG screens: green as they come, and their other looks.
    const rpg = newRpgRound(game);
    game.rounds = [rpg];
    expect(keyedRoundColors(roundStageColors(game), 'green')).toEqual(['RPG screens']);
    const start = game.worlds![0].maps[0].screens[0];
    start.slide.background = { color: '#2b2b38' };
    expect(keyedRoundColors(roundStageColors(game), 'green')).toEqual([]);
    start.variants = [{ id: 'v1', name: 'On fire', slide: { background: {}, elements: [] } }];
    expect(keyedRoundColors(roundStageColors(game), 'green')).toEqual(['RPG screens']);
  });

  it('doesn’t offer the other key where it would take out a board game’s or RPG screen’s own colors', () => {
    const dark: Theme = { ...presetTheme('dark'), stageBg: 'magenta' };
    expect(otherStageKey(dark)).toBe('green');
    const game = newGame();
    game.rounds = [newRpgRound(game)];
    expect(otherStageKey(dark, roundStageColors(game).map(([, c]) => c))).toBeUndefined();
    game.worlds![0].maps[0].screens[0].slide.background = { color: '#2b2b38' };
    expect(otherStageKey(dark, roundStageColors(game).map(([, c]) => c))).toBe('green');
  });

  it('the Daily Double and PARTNER UP! splashes swap colors where the key would take their own', () => {
    const pink = ['#ff3dcb', '#7a00ff'];
    const greens = ['#3dffb0', '#00a86b'];
    expect(splashColors(undefined)).toEqual({ dd: pink, partner: greens });
    expect(splashColors('magenta')).toEqual({ dd: greens, partner: greens });
    expect(splashColors('green')).toEqual({ dd: pink, partner: pink });
    for (const key of ['green', 'magenta'] as const) {
      const { dd, partner } = splashColors(key);
      expect([...dd, ...partner].some((c) => obsKeyed(c, STAGE_KEYS[key]))).toBe(false);
    }
  });

  it('the green for what is right on stream turns blue where the key would take it', () => {
    expect(rightFill(undefined)).toBe('#1f9d55');
    expect(rightFill('magenta')).toBe('#1f9d55');
    expect(rightFill('green')).toBe('#1f6fd1');
    for (const key of ['green', 'magenta'] as const) expect(obsKeyed(rightFill(key), STAGE_KEYS[key])).toBe(false);
  });
});
