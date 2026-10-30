import { describe, expect, it } from 'vitest';
import { filterKeys, macKeys, rowCount, type KeyGroup } from './keylist';

const groups: KeyGroup[] = [
  {
    title: 'Everywhere',
    keys: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+F', 'Find anything in the game'],
    ],
  },
  {
    title: 'Jeopardy board',
    keys: [
      ['R', 'Reveal the answer'],
      ['Enter on a partner clue', 'Show the question, then 📤 Distribute the cards'],
    ],
  },
];

describe('the keys filter', () => {
  it('keeps every row with nothing typed', () => {
    expect(rowCount(filterKeys(groups, ''))).toBe(4);
    expect(rowCount(filterKeys(groups, '   '))).toBe(4);
  });

  it('keeps the rows with every word typed, in their keys or words, any case', () => {
    const shown = filterKeys(groups, 'ctrl+f');
    expect(shown.map((g) => g.title)).toEqual(['Everywhere']);
    expect(shown[0].rows.map((r) => r.keys)).toEqual(['Ctrl+F']);
    expect(rowCount(filterKeys(groups, 'the answer'))).toBe(1);
    expect(rowCount(filterKeys(groups, 'answer undo'))).toBe(0);
  });

  it('shows a whole group whose name is typed', () => {
    const shown = filterKeys(groups, 'jeopardy');
    expect(shown).toHaveLength(1);
    expect(shown[0].rows).toHaveLength(2);
  });

  it('writes Ctrl as ⌘ on a Mac, and finds a row by either', () => {
    expect(macKeys('Ctrl+Shift+Z / Ctrl+Y', true)).toBe('⌘Shift+Z / ⌘Y');
    expect(macKeys('Ctrl+Z', false)).toBe('Ctrl+Z');
    expect(filterKeys(groups, '⌘z', true)[0].rows[0].keys).toBe('⌘Z');
    expect(rowCount(filterKeys(groups, 'ctrl+z', true))).toBe(1);
  });

  it('finds a renamed button by its old name, and says so', () => {
    const renamed: [string, string][] = [['📤 Distribute', 'Hand out']];
    const shown = filterKeys(groups, 'hand out', false, renamed);
    expect(shown.map((g) => g.title)).toEqual(['Jeopardy board']);
    expect(shown[0].rows).toEqual([{ keys: 'Enter on a partner clue', words: 'Show the question, then 📤 Distribute the cards', was: 'Hand out' }]);
    // (Found by the name it has now: nothing to say.)
    expect(filterKeys(groups, 'distribute', false, renamed)[0].rows[0].was).toBeUndefined();
    // (An old name alone doesn't find rows that never had it.)
    expect(rowCount(filterKeys(groups, 'hand out', false, []))).toBe(0);
  });
});
