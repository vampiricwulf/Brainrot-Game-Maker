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
    // Other games, other folders and slots past the number kept don't count.
    expect(nextSlot('Other', saves, 3)).toBe(1);
    expect(nextSlot('My Game!', [save('My-Game (autosave 1).brainrot', 1, 'documents')], 3)).toBe(1);
    expect(nextSlot('My Game!', saves, 2)).toBe(2);
  });
});
