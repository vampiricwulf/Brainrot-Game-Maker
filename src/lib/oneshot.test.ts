import { describe, expect, it } from 'vitest';
import { judgePart, ONE_SHOT_MS, restOfPress } from './oneshot';

describe('a double-click counts once (oneshot)', () => {
  it('takes a double-click’s second click (or a triple-click’s third) as the rest of the press, about half a second on', () => {
    expect(ONE_SHOT_MS).toBe(500);
    expect(restOfPress(1000, 1150, 2)).toBe(true);
    expect(restOfPress(1000, 1300, 3)).toBe(true);
    expect(restOfPress(1000, 1500, 2)).toBe(false);
    // The host panel's timings stay its own.
    expect(restOfPress(1000, 1550, 2, 600)).toBe(true);
  });

  it('never takes a first click for one', () => {
    expect(restOfPress(1000, 1010, 1)).toBe(false);
    expect(restOfPress(1000, 1010, 0)).toBe(false);
  });

  const shot = { at: 1000, x: 200, y: 100 };
  const ev = (type: string, detail: number, x = 200, y = 100, mouse = true) => ({ type, detail, x, y, mouse });

  it('drops the rest of the press, wherever it lands on the new screen', () => {
    expect(judgePart(shot, ev('mousedown', 2), 1120)).toBe('drop');
    expect(judgePart(shot, ev('mouseup', 2, 900, 700), 1130)).toBe('drop');
    expect(judgePart(shot, ev('click', 2), 1140)).toBe('drop');
    expect(judgePart(shot, ev('dblclick', 2), 1140)).toBe('drop');
  });

  it('drops a mouse’s pointer press at the click’s place (pointer events carry no count); one elsewhere, or a finger’s, is a fresh press', () => {
    expect(judgePart(shot, ev('pointerdown', 0, 205, 96), 1100)).toBe('drop');
    expect(judgePart(shot, ev('pointerup', 0, 200, 100), 1110)).toBe('drop');
    // (Its mousedown, which says so, may never come: the slide editor cancels it.)
    expect(judgePart(shot, ev('pointerdown', 0, 260, 100), 1100)).toBe('end');
    expect(judgePart(shot, ev('pointerdown', 0, 200, 100, false), 1100)).toBe('end');
    expect(judgePart(shot, ev('pointerup', 0, 260, 100), 1100)).toBe('pass');
  });

  it('ends at a fresh press, or once the press is over: a fresh click always goes through', () => {
    expect(judgePart(shot, ev('mousedown', 1, 600, 400), 1100)).toBe('end');
    expect(judgePart(shot, ev('click', 2), 1000 + ONE_SHOT_MS)).toBe('end');
    expect(judgePart(shot, ev('click', 1), 1100)).toBe('pass');
  });
});
