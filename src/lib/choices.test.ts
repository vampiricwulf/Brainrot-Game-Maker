import { describe, expect, it } from 'vitest';
import { choiceCounts, countsLine, judgeAllPlan, letter, matchChoice, pickLabel, pickOf, rightChoice, usableChoices } from './choices';
import type { Choice } from './model';

const four = (): Choice[] => [
  { id: 'a', text: 'Paris' },
  { id: 'b', text: 'Stockholm', right: true },
  { id: 'c', text: 'Oslo' },
  { id: 'd', text: 'Bern' },
];

describe('multiple choice', () => {
  it('letters by place among the usable choices: one with no words (or only invisible ones) or a long id is left out', () => {
    expect([0, 1, 5].map(letter)).toEqual(['A', 'B', 'F']);
    const list: Choice[] = [{ id: 'a', text: 'Paris' }, { id: 'e', text: '  ' }, { id: 'z', text: '​‮' }, { id: 'x'.repeat(65), text: 'Long id' }, { id: 'b', text: ' Stockholm   city ' }, { id: 'c', text: 'Oslo' }];
    const u = usableChoices(list);
    expect(u.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    // (Their words as the room keeps them.)
    expect(u[1].text).toBe('Stockholm city');
    expect(pickLabel(u, 'c')).toBe('C · Oslo');
    expect(pickLabel(u, 'e')).toBeUndefined();
    // Fewer than 2 left: no multiple choice.
    expect(usableChoices([{ id: 'a', text: 'Paris' }, { id: 'b', text: '' }])).toEqual([]);
    expect(usableChoices(undefined)).toEqual([]);
    // At most 6, each id once.
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i % 7}`, text: `Choice ${i}` }));
    expect(usableChoices(many).map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('the right one: ✔ on a choice with no words counts as none, and Judge all then marks nobody', () => {
    expect(rightChoice(usableChoices(four()))?.id).toBe('b');
    const list = [{ id: 'a', text: 'Paris' }, { id: 'x', text: '', right: true as const }, { id: 'b', text: 'Oslo' }];
    const u = usableChoices(list);
    expect(rightChoice(u)).toBeUndefined();
    expect(judgeAllPlan(['p1'], { p1: { text: 'Paris', pick: 'a' } }, u)).toEqual({ right: [], wrong: [] });
  });

  it('typed words name a choice by its words alone, or by its letter (with a sign or in brackets)', () => {
    const u = usableChoices(four());
    for (const t of ['b', 'B', ' B) ', '(b)', '[b]', 'b.', 'b:', 'b-', 'b. stockholm', 'B) Stockholm', 'stockholm', '  STOCKHOLM ']) expect(matchChoice(t, u), t).toBe('b');
    expect(matchChoice('d', u)).toBe('d');
    // A letter past the last choice, a word starting with one, or nothing like a choice: none.
    for (const t of ['e', 'e)', 'bern city', 'banana', 'a stockholm', '']) expect(matchChoice(t, u), t).toBeNull();
    // The same words twice: they name neither.
    const twice = usableChoices([{ id: 'a', text: 'Oslo' }, { id: 'b', text: 'oslo' }, { id: 'c', text: 'Bern' }]);
    expect(matchChoice('Oslo', twice)).toBeNull();
    expect(matchChoice('bern', twice)).toBe('c');
    // A choice's own words that start like a letter and a sign are that choice; the letter forms still work.
    const authors = usableChoices([{ id: 'a', text: 'Mark Twain' }, { id: 'b', text: 'F. Scott Fitzgerald' }, { id: 'c', text: 'Ernest Hemingway' }, { id: 'd', text: 'C.S. Lewis' }]);
    expect(matchChoice('C.S. Lewis', authors)).toBe('d');
    expect(matchChoice('c.s. lewis', authors)).toBe('d');
    expect(matchChoice('F. Scott Fitzgerald', authors)).toBe('b');
    expect(matchChoice('c', authors)).toBe('c');
    expect(matchChoice('d) C.S. Lewis', authors)).toBe('d');
    expect(matchChoice('A-ha', usableChoices([{ id: 'q', text: 'Queen' }, { id: 'ab', text: 'Abba' }, { id: 'ah', text: 'A-ha' }]))).toBe('ah');
    // A pick goes by its id while it's still a choice, else by its words.
    expect(pickOf({ text: 'Paris', pick: 'c' }, u)).toBe('c');
    expect(pickOf({ text: 'Oslo', pick: 'gone' }, u)).toBe('c');
  });

  it('counts each pick by its letter, with typed words that name none as other', () => {
    const list = [{ id: 'x', text: '' }, ...four()];
    const u = usableChoices(list);
    const answers = { p1: { text: 'Stockholm', pick: 'b' }, p2: { text: 'b' }, p3: { text: 'Paris', pick: 'a' }, p4: { text: 'banana' } };
    const c = choiceCounts(['p1', 'p2', 'p3', 'p4', 'p5'], answers, u);
    expect(c).toEqual({ counts: [1, 2, 0, 0], other: 1 });
    expect(countsLine(c)).toBe('A 1 · B 2 · C 0 · D 0 · other 1');
    expect(countsLine(choiceCounts([], {}, u))).toBe('A 0 · B 0 · C 0 · D 0');
  });

  it('Judge all: the right choice right, any other choice wrong, only those not judged yet; no answer or none named left out', () => {
    const u = usableChoices(four());
    const answers = { p1: { text: 'Stockholm', pick: 'b' }, p2: { text: 'Paris', pick: 'a' }, p3: { text: 'b. stockholm' }, p4: { text: 'banana' }, p5: { text: 'oslo' }, p6: { text: 'Bern', pick: 'd' } };
    expect(judgeAllPlan(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], answers, u, { p6: 1 })).toEqual({ right: ['p1', 'p3'], wrong: ['p2', 'p5'] });
  });
});
