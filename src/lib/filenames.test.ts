import { describe, expect, it } from 'vitest';

describe('source file names', () => {
  // Windows (where the desktop app is built) doesn't tell names apart by case, and an import leaves out `.ts`: so
  // './cardoffers.svelte' found CardOffers.svelte there instead of cardoffers.svelte.ts, and the build failed.
  it('no two files in one folder import the same way on a case-blind disk', () => {
    const files = Object.keys(import.meta.glob('/src/**/*.{ts,svelte,js,css}'));
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of files) {
      const key = f.replace(/\.ts$/, '').toLowerCase();
      const other = seen.get(key);
      if (other) clashes.push(`${other} ↔ ${f}`);
      else seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });
});
