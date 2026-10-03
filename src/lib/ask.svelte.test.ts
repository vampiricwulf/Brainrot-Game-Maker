import { describe, expect, it } from 'vitest';
import { splitAsk } from './ask.svelte';

describe('splitAsk', () => {
  it('titles a question with the sentence that asks', () => {
    expect(splitAsk({ text: 'Forget “Quiz”? It’s removed from this browser, and can’t be brought back.' })).toEqual({
      title: 'Forget “Quiz”?',
      body: 'It’s removed from this browser, and can’t be brought back.',
    });
    expect(splitAsk({ text: 'This file will be about 80 MB. Big files are slow.\n\nFor big games, a pack is better. Export anyway?' })).toEqual({
      title: 'Export anyway?',
      body: 'This file will be about 80 MB. Big files are slow.\n\nFor big games, a pack is better.',
    });
    expect(splitAsk({ text: 'A game (“Quiz”, saved 3.5 h ago) can be resumed. Start a new game anyway?\n\nThe saved game is replaced.' })).toEqual({
      title: 'Start a new game anyway?',
      body: 'A game (“Quiz”, saved 3.5 h ago) can be resumed.\n\nThe saved game is replaced.',
    });
  });
  it('keeps a quoted name whole, dots and all', () => {
    expect(splitAsk({ text: 'Forget “St. Patrick’s Day”? It’s removed from this browser.' })).toEqual({
      title: 'Forget “St. Patrick’s Day”?',
      body: 'It’s removed from this browser.',
    });
    expect(splitAsk({ text: 'Delete “Vol. 2! Dr. Who”? Undo brings it back.' }).title).toBe('Delete “Vol. 2! Dr. Who”?');
  });
  it('titles a message with its first sentence or line', () => {
    expect(splitAsk({ text: 'Save failed: the disk is full' })).toEqual({ title: 'Save failed: the disk is full', body: '' });
    expect(splitAsk({ text: 'Saved.\n\nThese files were missing:\na.png\nb.png' })).toEqual({ title: 'Saved.', body: 'These files were missing:\na.png\nb.png' });
  });
  it('keeps a given title, with all the text below it', () => {
    expect(splitAsk({ title: 'Delete it?', text: 'Gone for good.' })).toEqual({ title: 'Delete it?', body: 'Gone for good.' });
  });
});
