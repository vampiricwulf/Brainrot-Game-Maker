import { describe, expect, it } from 'vitest';
import { sameGame, stableJson } from './samegame';

describe('sameGame', () => {
  it('ignores the order keys were written in, at any depth', () => {
    expect(sameGame({ a: 1, s: { x: 1, y: [{ p: 1, q: 2 }] } }, { s: { y: [{ q: 2, p: 1 }], x: 1 }, a: 1 })).toBe(true);
  });
  it('sees a changed value, an added key and a reordered list', () => {
    expect(sameGame({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameGame({ a: 1 }, { a: 1, b: 0 })).toBe(false);
    expect(sameGame({ l: [1, 2] }, { l: [2, 1] })).toBe(false);
  });
  it('leaves undefined values out, like JSON', () => {
    expect(sameGame({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(stableJson({ b: 1, a: [null] })).toBe('{"a":[null],"b":1}');
  });
});
