import { describe, expect, it } from 'vitest';
import { clampTo, liveNumber, numberFieldValue } from './numfield';
import { isBoard, migrateGame, newTextEl, textSlide, type Game, type TextEl } from './model';
import { jeopardyGame } from './testgame';

describe('Inspector number fields', () => {
  it('an empty or broken field keeps the last value', () => {
    expect(numberFieldValue('', 90, 8, 600)).toBe(90);
    expect(numberFieldValue('  ', 1.2)).toBe(1.2);
    expect(numberFieldValue('abc', 40)).toBe(40);
  });
  it('a typed number is pulled into range', () => {
    expect(numberFieldValue('3', 90, 8, 600)).toBe(8);
    expect(numberFieldValue('9000', 90, 8, 600)).toBe(600);
    expect(numberFieldValue('-30', 0, -20, 60)).toBe(-20);
    expect(numberFieldValue('72', 90, 8, 600)).toBe(72);
  });
  it('a last value that is null too gives the fallback', () => {
    expect(numberFieldValue('', null, 8, 600, 110)).toBe(110);
    expect(numberFieldValue('', NaN, undefined, undefined, 1.2)).toBe(1.2);
  });
  it('while typing, only numbers in range count', () => {
    expect(liveNumber('1', 8, 600)).toBeNull();
    expect(liveNumber('100', 8, 600)).toBe(100);
    expect(liveNumber('', 8, 600)).toBeNull();
    expect(liveNumber('-', 8, 600)).toBeNull();
    expect(liveNumber('0.5')).toBe(0.5);
  });
  it('clampTo leaves missing bounds open', () => {
    expect(clampTo(-5)).toBe(-5);
    expect(clampTo(5, 0)).toBe(5);
    expect(clampTo(5, undefined, 3)).toBe(3);
  });
});

describe('a game saved with an emptied number field', () => {
  it('opens with the defaults back in place of null', () => {
    const g = jeopardyGame() as Game;
    const round = g.rounds.find(isBoard)!;
    const t = newTextEl('Hi');
    const broken = t as unknown as Record<string, unknown>;
    broken.size = null;
    broken.lineHeight = null;
    broken.w = null;
    t.stroke = { color: '#000', width: null as unknown as number };
    round.categories[0].clues[0].questionSlide = { background: {}, elements: [t] };
    const out = migrateGame(JSON.parse(JSON.stringify(g)));
    const el = out.rounds.find(isBoard)!.categories[0].clues[0].questionSlide.elements[0] as TextEl;
    expect(el.size).toBe(110);
    expect(el.lineHeight).toBe(1.2);
    expect(el.w).toBe(100);
    expect(el.stroke?.width).toBe(6);
    expect(el.letterSpacing).toBe(0);
  });
  it('leaves an optional setting that is missing alone', () => {
    const g = jeopardyGame() as Game;
    const slide = textSlide('x');
    g.rounds.find(isBoard)!.categories[0].clues[0].questionSlide = slide;
    const out = migrateGame(JSON.parse(JSON.stringify(g)));
    const el = out.rounds.find(isBoard)!.categories[0].clues[0].questionSlide.elements[0] as TextEl;
    expect(el.glow).toBeUndefined();
    expect(el.entrance).toBeUndefined();
  });
});
