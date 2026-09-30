import { describe, expect, it } from 'vitest';
import { dropMove } from './dragorder.svelte';

describe('drag to reorder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves the dragged item to just before or after the one it was dropped on', () => {
    expect(dropMove(ids, 'a', 'c', true)).toEqual({ from: 0, to: 2 });
    expect(dropMove(ids, 'a', 'c', false)).toEqual({ from: 0, to: 1 });
    expect(dropMove(ids, 'd', 'b', false)).toEqual({ from: 3, to: 1 });
    expect(dropMove(ids, 'd', 'a', false)).toEqual({ from: 3, to: 0 });
    expect(dropMove(ids, 'b', 'd', true)).toEqual({ from: 1, to: 3 });
  });

  it('is no move when it lands where it already is', () => {
    expect(dropMove(ids, 'b', 'b', true)).toBeNull();
    expect(dropMove(ids, 'b', 'c', false)).toBeNull();
    expect(dropMove(ids, 'b', 'a', true)).toBeNull();
    expect(dropMove(ids, 'x', 'a', true)).toBeNull();
  });
});
