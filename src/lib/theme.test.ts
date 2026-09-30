import { describe, expect, it } from 'vitest';
import { presetEdited, presetTheme } from './theme';

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
