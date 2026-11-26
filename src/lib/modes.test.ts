// The round modes' icons mean the mode and nothing else.
import { describe, expect, it } from 'vitest';
import { ROUND_MODES } from './modes';

describe('ROUND_MODES', () => {
  const icons = Object.values(ROUND_MODES).map((m) => m.icon);

  it('gives each mode its own icon', () => {
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('keeps 🖼️ for pictures and 🖼️ Media: a Slides round is 📽️', () => {
    expect(ROUND_MODES.slides.icon).toBe('📽️');
    for (const icon of icons) expect(icon.codePointAt(0)).not.toBe(0x1f5bc);
  });

  it('asks for the colour emoji after a sign that is text by default', () => {
    for (const mode of ['rpg', 'boardgame', 'slides'] as const) expect(ROUND_MODES[mode].icon.endsWith('️')).toBe(true);
  });
});
