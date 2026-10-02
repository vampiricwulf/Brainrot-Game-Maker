import { describe, expect, it } from 'vitest';
import { itemsNamed } from './layerlabel';
import { newGame, newShapeEl, newTextEl } from './model';

describe('itemsNamed', () => {
  const game = newGame();
  it('names one item by its kind and label', () => {
    expect(itemsNamed([newShapeEl('ellipse')], game)).toBe('shape “Ellipse”');
    expect(itemsNamed([newTextEl('Who is this?\nsecond line')], game)).toBe('text box “Who is this?”');
  });
  it('counts several of a kind, and calls a mix items', () => {
    expect(itemsNamed([newShapeEl('rect'), newShapeEl('line')], game)).toBe('2 shapes');
    expect(itemsNamed([newTextEl('A'), newShapeEl('rect'), newShapeEl('line')], game)).toBe('3 items');
  });
});
