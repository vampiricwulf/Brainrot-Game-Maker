import { describe, expect, it } from 'vitest';
import { nextRow, savesWhere } from './openlist';

describe('Open…’s one window', () => {
  it('says where the saves are', () => {
    expect(savesWhere(['app', 'app'])).toBe('next to the app');
    expect(savesWhere(['documents'])).toBe('in Documents');
    expect(savesWhere(['app', 'documents'])).toBe('next to the app, and in Documents');
    expect(savesWhere([])).toBe('next to the app');
  });

  it('moves between the rows with the arrows, Home and End, stopping at the ends', () => {
    expect(nextRow('ArrowDown', 0, 3)).toBe(1);
    expect(nextRow('ArrowDown', 2, 3)).toBe(2);
    expect(nextRow('ArrowUp', 0, 3)).toBe(0);
    expect(nextRow('ArrowUp', 2, 3)).toBe(1);
    expect([nextRow('Home', 2, 3), nextRow('End', 0, 3)]).toEqual([0, 2]);
    // (Not on a row yet: ↓ goes to the first.)
    expect(nextRow('ArrowDown', -1, 3)).toBe(0);
    expect(nextRow('Enter', 0, 3)).toBeNull();
    expect(nextRow('ArrowDown', 0, 0)).toBeNull();
  });
});
