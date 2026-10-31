import { describe, expect, it } from 'vitest';
import { slideTabMenu, slideTabTitle, type SlideTabActs } from './slidetabs';
import type { MenuEntry } from './menustate.svelte';

const acts = (): SlideTabActs & { done: string[] } => {
  const done: string[] = [];
  return {
    done,
    duplicate: () => done.push('duplicate'),
    copy: () => done.push('copy'),
    paste: (over) => done.push(over ? 'paste over' : 'paste new'),
    move: (d) => done.push(`move ${d}`),
    remove: () => done.push('remove'),
    add: () => done.push('add'),
    rename: () => done.push('rename'),
    sameAsAnswer: () => done.push('same'),
    phone: () => done.push('phone'),
  };
};
/** The items as shown: "label [key]", greyed ones marked "(off)". */
const shown = (m: MenuEntry[]) => m.map((e) => ('heading' in e ? `# ${e.heading}` : 'sep' in e ? '—' : `${e.label}${e.keys ? ` [${e.keys}]` : ''}${e.disabled ? ' (off)' : ''}`));
const item = (m: MenuEntry[], label: string) => m.find((e) => 'label' in e && e.label === label) as Extract<MenuEntry, { label: string }>;

describe("a slide tab's menu", () => {
  it('a question slide: duplicate, copy, the safe paste first, then the moves and delete', () => {
    const a = acts();
    const m = slideTabMenu({ tab: 'q', name: 'Question 2', at: 1, count: 3, copied: true }, a);
    expect(shown(m)).toEqual([
      '# Question 2',
      '⧉ Duplicate slide [Ctrl+D]',
      '📋 Copy slide [Ctrl+C]',
      '📋 Paste as a new slide after it [Ctrl+V]',
      '📋 Paste over it',
      '—',
      '◀ Move earlier [Alt+←]',
      '▶ Move later [Alt+→]',
      '—',
      '🗑 Delete slide [Delete]',
    ]);
    item(m, '📋 Paste as a new slide after it').onclick();
    item(m, '📋 Paste over it').onclick();
    item(m, '◀ Move earlier').onclick();
    expect(a.done).toEqual(['paste new', 'paste over', 'move -1']);
  });
  it('greys what can’t be done: pasting with nothing copied, moving past an end, deleting the only one', () => {
    const m = slideTabMenu({ tab: 'q', name: 'Question slide', at: 0, count: 1, copied: false }, acts());
    expect(shown(m).filter((l) => l.endsWith('(off)'))).toEqual([
      '📋 Paste as a new slide after it [Ctrl+V] (off)',
      '📋 Paste over it (off)',
      '◀ Move earlier [Alt+←] (off)',
      '▶ Move later [Alt+→] (off)',
      '🗑 Delete slide [Delete] (off)',
    ]);
  });
  it('shows Ctrl+V on the paste as a new slide only while the slide is what was copied last', () => {
    // (Items copied since: Ctrl+V on the tab pastes those onto the slide.)
    for (const tab of ['q', 'a'] as const) {
      const label = tab === 'q' ? '📋 Paste as a new slide after it' : '📋 Paste as a new slide before it';
      const since = item(slideTabMenu({ tab, name: 'Tab', at: 0, count: 2, copied: true, newest: false }, acts()), label);
      expect(since.keys).toBeUndefined();
      expect(since.disabled).toBeFalsy();
      expect(since.hint).toMatch(/Ctrl\+V on the tab pastes the items/);
      expect(item(slideTabMenu({ tab, name: 'Tab', at: 0, count: 2, copied: true, newest: true }, acts()), label).keys).toBe('Ctrl+V');
    }
  });
  it('the answer: copy, its pastes and a question slide before it', () => {
    const m = slideTabMenu({ tab: 'a', name: 'Answer slide', at: 0, count: 1, copied: true }, acts());
    expect(shown(m)).toEqual(['# Answer slide', '📋 Copy slide [Ctrl+C]', '📋 Paste as a new slide before it [Ctrl+V]', '📋 Paste over it', '—', '＋ Add a question slide before it']);
  });
  it('a 🤫 card: its own verbs, rename, duplicate, copy, the moves and delete, no paste', () => {
    const a = acts();
    const m = slideTabMenu({ tab: 'card', name: '🤫 Clue tip', at: 0, count: 2, copied: true, card: { empty: true, answer: true, phone: true, full: false } }, a);
    expect(shown(m)).toEqual([
      '# 🤫 Clue tip',
      '⧉ Same as the answer',
      '✓ 📱 On their phone',
      '—',
      '✎ Rename [F2]',
      '⧉ Duplicate card [Ctrl+D]',
      '📋 Copy slide [Ctrl+C]',
      '—',
      '◀ Move earlier [Alt+←] (off)',
      '▶ Move later [Alt+→]',
      '—',
      '🗑 Delete card',
    ]);
    item(m, '⧉ Same as the answer').onclick();
    item(m, '🗑 Delete card').onclick();
    expect(a.done).toEqual(['same', 'remove']);
    const full = slideTabMenu({ tab: 'card', name: 'Card 1', at: 0, count: 6, copied: false, card: { empty: false, answer: true, phone: false, full: true } }, acts());
    expect(item(full, '⧉ Same as the answer').disabled && item(full, '⧉ Duplicate card').disabled).toBe(true);
  });
  it('a slides round says slide, never question slide', () => {
    const m = slideTabMenu({ tab: 'q', name: 'Slide 1', at: 0, count: 1, plain: true, copied: false }, acts());
    expect(item(m, '🗑 Delete slide').hint).toBe('The only slide stays (empty it instead)');
  });
});

describe("a slide tab's tooltip", () => {
  it("gives the slide's first words", () => {
    expect(slideTabTitle('S3', 'House rules\nNo phones')).toBe('S3 · “House rules”');
    expect(slideTabTitle('Answer', '', 'Hidden until revealed')).toBe('Answer · (no words yet)\nHidden until revealed');
  });
});
