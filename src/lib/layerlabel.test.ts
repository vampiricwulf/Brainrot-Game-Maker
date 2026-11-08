import { describe, expect, it } from 'vitest';
import { editWords, itemsNamed, layerLabel } from './layerlabel';
import { newAudioEl, newEmbedEl, newGame, newImageEl, newShapeEl, newTextEl, newVideoEl, type ShapeEl } from './model';

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

describe('a freehand line', () => {
  const game = newGame();
  it('is “Freehand line” (closed, “Freehand shape”), never “Drawing”, which a Drawpad picture is', () => {
    const line: ShapeEl = { ...newShapeEl('path'), points: [[0, 0], [1, 1]] };
    expect(layerLabel(line, game)).toBe('Freehand line');
    expect(layerLabel({ ...line, closed: true }, game)).toBe('Freehand shape');
    expect(itemsNamed([line], game)).toBe('shape “Freehand line”');
    expect(layerLabel({ ...newImageEl('m1', 100, 100), name: 'Drawing' }, game)).toBe('Drawing');
  });
});

describe('a YouTube video set to Sound only', () => {
  it('says so in its layer name', () => {
    const game = newGame();
    const yt = newEmbedEl('https://youtu.be/dQw4w9WgXcQ', 'youtube');
    expect(layerLabel(yt, game)).toBe('YouTube');
    expect(layerLabel({ ...yt, soundOnly: true }, game)).toBe('YouTube (sound only)');
    // On a 🤫 card it isn't used (a phone plays it in YouTube's own player), so it doesn't say so there.
    expect(layerLabel({ ...yt, soundOnly: true }, game, true)).toBe('YouTube');
  });
});

describe('editWords', () => {
  it('names what opens each kind of item, as the menu and the bar say it', () => {
    expect(editWords(newTextEl('Hi'))).toBe('✎ Edit text');
    expect(editWords(newImageEl('m1', 100, 100))).toBe('✎ Edit image…');
    expect(editWords(newVideoEl('v1'), 'on')).toBe('✎ Edit video…');
    expect(editWords(newAudioEl('a1'), 'busy')).toBe('✎ Edit sound…');
    expect(editWords(newVideoEl('v1'))).toBe('✎ Edit the part it plays');
    expect(editWords(newEmbedEl('https://youtu.be/x', 'youtube'))).toBe('✎ Edit link');
    expect(editWords(newShapeEl('rect'))).toBe('✎ Edit fill');
    expect(editWords(newShapeEl('arrow'))).toBe('✎ Edit color');
    expect(editWords({ ...newShapeEl('path'), points: [] })).toBe('✎ Edit color');
    expect(editWords({ ...newShapeEl('path'), points: [], closed: true })).toBe('✎ Edit fill');
    expect(editWords({ ...newShapeEl('rect'), hotspot: true })).toBeNull();
  });
});
