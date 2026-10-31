import { describe, expect, it } from 'vitest';
import { RememberedFold } from './fold.svelte';

// (No browser storage here: an in-memory one, as a browser's.)
const kept = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, String(v)) },
});

describe('a remembered fold', () => {
  it('opens and closes as the host leaves it, remembered on this computer', () => {
    const f = new RememberedFold('jb.test.fold1');
    expect(f.open).toBe(false);
    f.set(true);
    expect(f.open).toBe(true);
    expect(new RememberedFold('jb.test.fold1').open).toBe(true);
    f.set(false);
    expect(new RememberedFold('jb.test.fold1').open).toBe(false);
  });

  it('opens by itself for what must show, and stays open after (nothing folds away under the pointer)', () => {
    const f = new RememberedFold('jb.test.fold2');
    f.need(true);
    expect(f.open).toBe(true);
    f.need(false);
    expect(f.open).toBe(true);
    // (Opened by itself: not remembered as opened by the host.)
    expect(new RememberedFold('jb.test.fold2').open).toBe(false);
  });

  it('closed over what must show: this time only', () => {
    localStorage.setItem('jb.test.fold3', '1');
    const f = new RememberedFold('jb.test.fold3');
    f.need(true);
    f.set(false);
    expect(f.open).toBe(false);
    expect(new RememberedFold('jb.test.fold3').open).toBe(true);
  });
});
