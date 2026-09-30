import { describe, expect, it } from 'vitest';
import { copyActions, copyItem, copyName, copySegment, copyShop, copyStat, faceLines, moveTo } from './listedit';
import { textSlide, type Action, type ItemDef, type WheelSegment } from './model';

describe('list editing', () => {
  it('moves an entry to its new place, the others closing up', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moveTo(list, 0, 2)).toBe(true);
    expect(list).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(list, 3, 0)).toBe(true);
    expect(list).toEqual(['d', 'b', 'c', 'a']);
    expect(moveTo(list, 1, 1)).toBe(false);
    expect(moveTo(list, 0, -1)).toBe(false);
    expect(moveTo(list, 3, 4)).toBe(false);
    expect(list).toEqual(['d', 'b', 'c', 'a']);
  });

  it('names copies after the original, numbering them when a copy is there already', () => {
    expect(copyName('Potion', ['Potion'])).toBe('Potion (copy)');
    expect(copyName('Potion', ['Potion', 'Potion (copy)'])).toBe('Potion (copy 2)');
    expect(copyName('Potion', ['Potion', 'Potion (copy)', 'Potion (copy 2)'])).toBe('Potion (copy 3)');
  });

  it('copies buttons with fresh ids, their slides too', () => {
    const list: Action[] = [
      { id: 'a1', do: 'popup', slide: textSlide('Boo') },
      { id: 'a2', do: 'question', question: textSlide('Q'), answer: textSlide('A') },
      { id: 'a3', do: 'note', text: 'hi' },
    ];
    const copies = copyActions(list);
    expect(copies.map((a) => a.do)).toEqual(['popup', 'question', 'note']);
    for (const [i, a] of copies.entries()) expect(a.id).not.toBe(list[i].id);
    const [p, q] = copies as [Extract<Action, { do: 'popup' }>, Extract<Action, { do: 'question' }>];
    const orig = list as [Extract<Action, { do: 'popup' }>, Extract<Action, { do: 'question' }>];
    expect(p.slide.elements[0].id).not.toBe(orig[0].slide.elements[0].id);
    expect(q.question.elements[0].id).not.toBe(orig[1].question.elements[0].id);
    expect(q.answer.elements[0].id).not.toBe(orig[1].answer.elements[0].id);
    // Editing the copy leaves the original.
    p.slide.elements.length = 0;
    expect(orig[0].slide.elements).toHaveLength(1);
  });

  it('copies an item, a shop, a stat and a slice under new ids', () => {
    const it: ItemDef = { id: 'i1', name: 'Potion', stackable: true, onUse: [{ id: 'u1', do: 'note', text: 'glug' }] };
    const c = copyItem(it, ['Potion']);
    expect(c).toMatchObject({ name: 'Potion (copy)', stackable: true });
    expect(c.id).not.toBe('i1');
    expect(c.onUse?.[0].id).not.toBe('u1');

    const shop = copyShop({ id: 's1', name: 'Shop', stock: [{ item: 'i1', qty: 3 }] }, ['Shop']);
    expect(shop).toMatchObject({ name: 'Shop (copy)', stock: [{ item: 'i1', qty: 3 }] });
    expect(shop.id).not.toBe('s1');

    const stat = copyStat({ id: 'f1', name: 'HP', type: 'number', start: 10, audience: 'hud' }, ['HP']);
    expect(stat).toMatchObject({ name: 'HP (copy)', start: 10 });
    expect(stat.id).not.toBe('f1');

    const seg: WheelSegment = { id: 'g1', label: 'Dare', color: '#f00', weight: 1, actions: [{ id: 'x', do: 'score', amount: 5 }] };
    const sc = copySegment(seg);
    expect(sc).toMatchObject({ label: 'Dare', color: '#f00' });
    expect(sc.id).not.toBe('g1');
    expect(sc.actions?.[0].id).not.toBe('x');
  });

  it('reads a pasted list of faces one a line, without blank lines, at most 100', () => {
    expect(faceLines(' Sip \r\n\nDare\n  \nSing\n')).toEqual(['Sip', 'Dare', 'Sing']);
    expect(faceLines(Array.from({ length: 120 }, (_, i) => `F${i}`).join('\n'))).toHaveLength(100);
  });
});
