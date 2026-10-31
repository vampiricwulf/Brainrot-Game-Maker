import { describe, expect, it } from 'vitest';
import { filterKeys, macKeys, RENAMED, rowCount, type KeyGroup } from './keylist';
import { BLUE, hostKeys, silencedRows } from '../play/hostkeys';

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

  it('knows the game screen’s renamed buttons by their old names, each once, the new name different', () => {
    const olds = RENAMED.map(([, was]) => was);
    expect(olds.filter((w, i) => olds.indexOf(w) !== i)).toEqual([]);
    expect(RENAMED.filter(([now, was]) => !now.trim() || !was.trim() || now === was)).toEqual([]);
    expect(Object.fromEntries(RENAMED.map(([now, was]) => [was, now]))).toMatchObject({
      '↩ Cancel (keep tile)': '↩ Put back (keep tile)',
      '📊 Scores': '📊 Scoreboard',
      '📤 Distribute': '📤 Hand out the cards',
      '◀ Prev round': '◀ Previous round',
    });
    // The game's keys: S is found by "scores", and says it was 📊 Scores.
    const s = filterKeys(hostKeys(false), 'scores').flatMap((g) => g.rows).find((r) => r.keys === 'S');
    expect(s).toMatchObject({ words: '📊 Scoreboard on screen, or off it again', was: '📊 Scores' });
  });
});

describe('the game’s keys: the blue button and the check', () => {
  const game = hostKeys(false);
  /** The rows the filter finds for `words`, as "keys: words". */
  const found = (words: string) => filterKeys(game, words).flatMap((g) => g.rows.map((r) => `${r.keys}: ${r.words}`));
  /** The row the filter finds for the keys `k` typed in it. */
  const row = (k: string) => found(k).find((r) => r.startsWith(`${k}:`));

  it('come right after Everywhere, N first: Next or Reveal, asking first, N again anyway except into an answer', () => {
    expect(game.map((g) => g.title).indexOf(BLUE)).toBe(game.map((g) => g.title).indexOf('Everywhere') + 1);
    const blue = game.find((g) => g.title === BLUE)!.keys;
    expect(blue[0][0]).toBe('N');
    expect(blue[0][1]).toMatch(/Next or Reveal.*asks first.*N again goes on anyway, except into an answer \(R does that\)/);
    // (It never does a box's job.)
    expect(blue[0][1]).toContain('never spins, rolls, sends cards, opens the buzzers, gives points or judges');
  });

  it('say Shift+click, Enter where it means Next, O in a buzzer tie, and the check’s keys', () => {
    expect(row('Shift+click on the blue button')).toMatch(/Its step at once, without asking/);
    expect(found('enter wager box').some((r) => r.startsWith('Enter: Next only on a round’s title card'))).toBe(true);
    expect(row('O in a buzzer tie')).toMatch(/🎲 Roll for it/);
    for (const k of ['Enter in the check', 'Shift+Enter in the check', 'N in the check', 'R in the check', 'Esc in the check', 'A double press']) expect(row(k), k).toBeTruthy();
    // (Esc's bounce, and Enter never "anyway".)
    expect(row('Esc in the check')).toContain('a second Esc right after does nothing');
    expect(row('Enter in the check')).toContain('never “… anyway”');
  });

  it('what the check doesn’t ask about this game: each kind once, in its tick’s words, with Ask again', () => {
    expect(silencedRows(undefined)).toEqual([]);
    expect(silencedRows(['roll', 'landing', 'roll'])).toEqual([
      { kind: 'roll', words: 'rolling', again: 'Ask again: rolling' },
      { kind: 'landing', words: 'landings', again: 'Ask again: landings' },
    ]);
    // (The keys window says the tick lists them there.)
    expect(row('Don’t ask about … again this game')).toMatch(/The check’s tick, for landings, rolling, opening the buzzers.*with Ask again$/);
  });
});
