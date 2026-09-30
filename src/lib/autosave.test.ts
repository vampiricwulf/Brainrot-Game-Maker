import { describe, expect, it } from 'vitest';
import { autosaveName, nextSlot } from './autosave';
import type { SaveEntry } from './desktop.svelte';

const save = (name: string, modified: number, place: SaveEntry['place'] = 'app'): SaveEntry => ({ name, size: 1, modified, place });

describe('autosave slots', () => {
  it('fill the free slots first, then replace the oldest', () => {
    expect(autosaveName('My Game!', 2)).toBe('My-Game (autosave 2).brainrot');
    expect(nextSlot('My Game!', [], 3)).toBe(1);
    const saves = [save('My-Game (autosave 1).brainrot', 100), save('My-Game (autosave 2).brainrot', 50)];
    expect(nextSlot('My Game!', saves, 3)).toBe(3);
    saves.push(save('My-Game (autosave 3).brainrot', 200));
    expect(nextSlot('My Game!', saves, 3)).toBe(2);
    // Other games and slots past the number kept don't count.
    expect(nextSlot('Other', saves, 3)).toBe(1);
    expect(nextSlot('My Game!', saves, 2)).toBe(2);
  });

  it('rotate in Documents too (where saves go when the app’s folder can’t be written)', () => {
    const docs = [1, 2, 3].map((n) => save(`My-Game (autosave ${n}).brainrot`, [300, 100, 200][n - 1], 'documents'));
    expect(nextSlot('My Game!', docs, 3)).toBe(2);
    // A slot in both folders counts as written when its newest copy was.
    expect(nextSlot('My Game!', [...docs, save('My-Game (autosave 2).brainrot', 400)], 3)).toBe(3);
  });

  it('keep the title’s letters in any language', () => {
    expect(autosaveName('Café Quiz', 1)).toBe('Café-Quiz (autosave 1).brainrot');
    expect(nextSlot('ブレインロット', [save('ブレインロット (autosave 1).brainrot', 1)], 3)).toBe(2);
    expect(nextSlot('Привет', [save('ブレインロット (autosave 1).brainrot', 1)], 3)).toBe(1);
  });
});
