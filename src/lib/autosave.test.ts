import { describe, expect, it } from 'vitest';
import { autosaveName, autosaveTag, planAutosave } from './autosave';
import type { SaveEntry } from './desktop.svelte';
import { MAX_PACK_READ } from './pack';

const save = (name: string, modified: number, place: SaveEntry['place'] = 'app', size = 1): SaveEntry => ({ name, size, modified, place });
const game = { title: 'My Game!', id: '3F9A1C2B-0000-4000-8000-000000000000' };
const slot = (n: number, g: { title: string; id: string } = game) => autosaveName(g, n);

describe('autosave slots', () => {
  it('fill the free slots first, then replace the oldest', () => {
    expect(autosaveName(game, 2)).toBe('My-Game (autosave 2, 3f9a1c).brainrot');
    expect(planAutosave(game, [], 3).name).toBe(slot(1));
    const saves = [save(slot(1), 100), save(slot(2), 50)];
    expect(planAutosave(game, saves, 3).name).toBe(slot(3));
    saves.push(save(slot(3), 200));
    expect(planAutosave(game, saves, 3)).toEqual({ name: slot(2), drop: [] });
  });

  it('are per game: another game with the same title has its own', () => {
    const other = { title: game.title, id: 'aa11bb22-0000-4000-8000-000000000000' };
    const saves = [save(slot(1), 100), save(slot(2), 50), save(slot(3), 200)];
    expect(planAutosave(other, saves, 3)).toEqual({ name: slot(1, other), drop: [] });
    // Autosaves from before the tag (title only) belong to no game in particular: they're left alone.
    expect(planAutosave(game, [save('My-Game (autosave 1).brainrot', 1)], 3)).toEqual({ name: slot(1), drop: [] });
  });

  it('keep their slots when the title changes, replacing the slot’s copy under the old title', () => {
    const renamed = { ...game, title: 'Better Name' };
    const saves = [save(slot(1), 100), save(slot(2), 300)];
    const plan = planAutosave(renamed, saves, 2);
    expect(plan.name).toBe('Better-Name (autosave 1, 3f9a1c).brainrot');
    expect(plan.drop.map((s) => s.name)).toEqual([slot(1)]);
  });

  it('a title changed only in case keeps its slot file (Windows sees one name, not an old copy to delete)', () => {
    const lower = { ...game, title: 'my game!' };
    const plan = planAutosave(game, [save(slot(1, lower), 100)], 1);
    expect(plan).toEqual({ name: slot(1), drop: [] });
  });

  it('past the number kept are deleted (when it was lowered)', () => {
    const saves = [1, 2, 3, 4].map((n) => save(slot(n), n * 100));
    const plan = planAutosave(game, saves, 2);
    expect(plan.name).toBe(slot(1));
    expect(plan.drop.map((s) => s.name)).toEqual([slot(3), slot(4)]);
  });

  it('too big to be opened again: go in a slot holding one of those, keeping the ones that still open', () => {
    const saves = [save(slot(1), 100), save(slot(2), 50), save(slot(3), 200)];
    // None too big yet: the oldest, as ever.
    expect(planAutosave(game, saves, 3, true).name).toBe(slot(2));
    saves[1] = save(slot(2), 300, 'app', MAX_PACK_READ);
    expect(planAutosave(game, saves, 3, true).name).toBe(slot(2));
    // (One that opens goes in the oldest slot, as ever: that's the too big one now.)
    saves[1] = save(slot(2), 50, 'app', MAX_PACK_READ);
    expect(planAutosave(game, saves, 3).name).toBe(slot(2));
    // A slot whose newest copy opens isn't one of those.
    expect(planAutosave(game, [...saves, save(slot(2), 400, 'documents')], 3, true).name).toBe(slot(1));
  });

  it('rotate in Documents too (where saves go when the app’s folder can’t be written)', () => {
    const docs = [1, 2, 3].map((n) => save(slot(n), [300, 100, 200][n - 1], 'documents'));
    expect(planAutosave(game, docs, 3).name).toBe(slot(2));
    // A slot in both folders counts as written when its newest copy was.
    expect(planAutosave(game, [...docs, save(slot(2), 400)], 3).name).toBe(slot(3));
  });

  it('keep the title’s letters in any language', () => {
    expect(autosaveName({ title: 'Café Quiz', id: 'abc' }, 1)).toBe('Café-Quiz (autosave 1, abc).brainrot');
    const jp = { title: 'ブレインロット', id: 'x1' };
    expect(planAutosave(jp, [save(autosaveName(jp, 1), 1)], 3).name).toBe(autosaveName(jp, 2));
    expect(autosaveTag('---')).toBe('game');
  });
});
