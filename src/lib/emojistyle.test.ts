// Lint over the app's and the phone page's sources: a sign that's text by default (🖼️ Media, 🗺️ RPG, ♟️, 🕵️, 🗣️, ✏️,
// ⏱️, 🎞️ video) is written with U+FE0F after it, so a system whose first font draws it as text (DejaVu Sans on Linux) shows the
// colour emoji like the icons around it, not a grey outline: the same icon looks the same everywhere.
import { describe, expect, it } from 'vitest';

/** Every source a person's words or icons come from, by its path. */
const sources = {
  ...import.meta.glob<string>('/src/**/*.{svelte,ts}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('/buzzer/phone/**/*.{ts,html}', { query: '?raw', import: 'default', eager: true }),
};

/** The signs, as code points (this file's own text stays out of the search). */
const SIGNS = [0x1f5bc, 0x1f5fa, 0x265f, 0x1f575, 0x1f5e3, 0x270f, 0x23f1, 0x1f39e].map((c) => String.fromCodePoint(c));

/** Each place a sign has no U+FE0F (nor U+FE0E, text on purpose) after it: "path:line ✏". */
function bareSigns(path: string, src: string): string[] {
  const out: string[] = [];
  src.split('\n').forEach((line, i) => {
    const chars = Array.from(line);
    chars.forEach((c, j) => {
      if (SIGNS.includes(c) && chars[j + 1] !== '\uFE0F' && chars[j + 1] !== '\uFE0E') out.push(`${path}:${i + 1} ${c}`);
    });
  });
  return out;
}

describe('text-by-default signs have U+FE0F', () => {
  it('finds the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(Object.keys(sources).some((p) => p.startsWith('/buzzer/phone/'))).toBe(true);
  });

  it('flags a bare sign and passes one with U+FE0F', () => {
    expect(bareSigns('x', `a ${SIGNS[0]} Media\nb ${SIGNS[0]}\uFE0F Media`)).toEqual([`x:1 ${SIGNS[0]}`]);
  });

  it('no source has a bare one', () => {
    expect(Object.entries(sources).flatMap(([p, s]) => bareSigns(p, s))).toEqual([]);
  });
});
