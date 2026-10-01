import { describe, expect, it, vi } from 'vitest';
import { retryWrites, unstored, watchWrites, write } from './persist';

vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('writes while storage is full', () => {
  it('tries failed writes again, and says autosave works only once they all went through', async () => {
    const heard: (string | null)[] = [];
    watchWrites((err) => heard.push(err ? 'failed' : null));
    let full = true;
    const stored: string[] = [];
    const put = (what: string) => async () => {
      if (full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      stored.push(what);
    };
    expect(await write('media:a', put('a'))).toBe(false);
    expect(await write('editor', put('draft 1'))).toBe(false);
    expect(unstored('media:a') && unstored('editor')).toBe(true);
    // Still full: trying again changes nothing.
    expect(await retryWrites()).toBe(false);
    full = false;
    // A newer write of the draft replaces the failed one; the file is written again too, then all is well.
    expect(await write('editor', put('draft 2'))).toBe(true);
    expect(stored).toEqual(['draft 2', 'a']);
    expect(unstored('media:a') || unstored('editor')).toBe(false);
    expect(heard).toEqual(['failed', 'failed', 'failed', null]);
    // Nothing left to try: nothing to say.
    expect(await retryWrites()).toBe(true);
    expect(heard).toHaveLength(4);
    watchWrites(() => {});
  });
});
