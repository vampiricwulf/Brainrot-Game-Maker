import { describe, expect, it } from 'vitest';
import { contrast } from './colors';
import { presetEdited, presetTheme, stageText, themeStyle } from './theme';

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

  it('a game from before it was a theme color: its preset’s, or black / white by its own tiles', () => {
    const { stageText: _, ...old } = presetTheme('pastel');
    expect(stageText(old)).toBe('#4a3b5c');
    expect(presetEdited(old)).toBe(false);
    expect(stageText({ ...old, tile: '#ffffcc' })).toBe('#000000');
    expect(stageText({ ...old, tile: '#202020' })).toBe('#ffffff');
  });
});
