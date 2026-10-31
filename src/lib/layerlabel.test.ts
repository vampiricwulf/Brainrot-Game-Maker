import { describe, expect, it } from 'vitest';
import { editWords, itemsNamed } from './layerlabel';
import { newAudioEl, newEmbedEl, newGame, newImageEl, newShapeEl, newTextEl, newVideoEl } from './model';

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

describe('editWords', () => {
  it('names what opens each kind of item, as the menu and the bar say it', () => {
    expect(editWords(newTextEl('Hi'))).toBe('✎ Edit text');
    expect(editWords(newImageEl('m1', 100, 100))).toBe('✎ Edit image…');
    expect(editWords(newVideoEl('v1'), 'on')).toBe('✎ Edit video…');
    expect(editWords(newAudioEl('a1'), 'busy')).toBe('✎ Edit sound…');
    expect(editWords(newVideoEl('v1'))).toBe('✎ Edit start and stop');
    expect(editWords(newEmbedEl('https://youtu.be/x', 'youtube'))).toBe('✎ Edit link');
    expect(editWords(newShapeEl('rect'))).toBe('✎ Edit fill');
    expect(editWords(newShapeEl('arrow'))).toBe('✎ Edit color');
    expect(editWords({ ...newShapeEl('path'), points: [] })).toBe('✎ Edit color');
    expect(editWords({ ...newShapeEl('path'), points: [], closed: true })).toBe('✎ Edit fill');
    expect(editWords({ ...newShapeEl('rect'), hotspot: true })).toBeNull();
  });
});
