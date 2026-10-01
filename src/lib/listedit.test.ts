import { describe, expect, it } from 'vitest';
import { clearOffset, copyActions, copyItem, copyName, copySegment, copyShop, copySpaces, copyStat, copyZone, faceLines, moveTo } from './listedit';
import { newBoardGameRound } from './boardgame';
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

  it('copies a zone with its own screen', () => {
    const z = { id: 'z1', name: 'Shadow Realm', slide: textSlide('Stuck'), hostNotes: 'Roll a 6' };
    const c = copyZone(z, ['Shadow Realm']);
    expect(c).toMatchObject({ name: 'Shadow Realm (copy)', hostNotes: 'Roll a 6' });
    expect(c.id).not.toBe('z1');
    expect(c.slide.elements[0].id).not.toBe(z.slide.elements[0].id);
    c.slide.elements.length = 0;
    expect(z.slide.elements).toHaveLength(1);
  });

  it('reads a pasted list of faces one a line, without blank lines, at most 100', () => {
    expect(faceLines(' Sip \r\n\nDare\n  \nSing\n')).toEqual(['Sip', 'Dare', 'Sing']);
    expect(faceLines(Array.from({ length: 120 }, (_, i) => `F${i}`).join('\n'))).toHaveLength(100);
  });
});

describe('copying board spaces', () => {
  it('keeps the links between the copies, gives them names of their own and their own buttons', () => {
    const round = newBoardGameRound('Board');
    round.zones.push({ id: 'z', name: 'Shadow Realm', slide: textSlide('') });
    const [a, b, c] = round.spaces;
    a.name = 'Start';
    b.onLand = [
      { id: 'g1', do: 'goto', space: a.id, who: 'ask' },
      { id: 'g2', do: 'goto', space: c.id, who: 'ask' },
      { id: 'g3', do: 'goto', zone: 'z', who: 'ask' },
    ];
    const copies = copySpaces(round, [a, b], 40, 40);
    expect(copies.map((x) => x.name)).toEqual(['Space 13', 'Space 14']);
    expect(copies.map((x) => [x.x - [a, b][copies.indexOf(x)].x, x.y - [a, b][copies.indexOf(x)].y])).toEqual([[40, 40], [40, 40]]);
    // a → b is kept (between the copies); b → c (left behind) isn't.
    expect(copies[0].next).toEqual([copies[1].id]);
    expect(copies[1].next).toEqual([]);
    expect(copies.every((x) => !round.spaces.some((y) => y.id === x.id))).toBe(true);
    const [g1, g2, g3] = copies[1].onLand!;
    expect(g1.id).not.toBe('g1');
    // A Send to a copied space goes to its copy; to one left behind on this board it stays; a zone here stays.
    expect([g1.do === 'goto' && g1.space, g2.do === 'goto' && g2.space, g3.do === 'goto' && g3.zone]).toEqual([copies[0].id, c.id, 'z']);
  });

  it('leaves Send to buttons for spaces and zones another board hasn’t got with nothing chosen, and keeps unique names', () => {
    const from = newBoardGameRound('A');
    from.spaces[0].name = 'Lava';
    from.spaces[0].onPass = [
      { id: 'g', do: 'goto', space: from.spaces[5].id, who: 'ask' },
      { id: 'h', do: 'goto', zone: 'elsewhere', who: 'ask' },
    ];
    const to = newBoardGameRound('B');
    const [copy] = copySpaces(to, [from.spaces[0]], 0, 0);
    expect(copy.name).toBe('Lava');
    const [g, h] = copy.onPass!;
    expect([g.do === 'goto' && g.space, h.do === 'goto' && h.zone]).toEqual([undefined, undefined]);
  });

  it('keeps the copies on the board, in shape', () => {
    const round = newBoardGameRound('Board');
    const right = round.spaces.reduce((m, s) => (s.x > m.x ? s : m));
    const left = round.spaces.reduce((m, s) => (s.x < m.x ? s : m));
    const copies = copySpaces(round, [left, right], 5000, 0);
    expect(copies[1].x).toBe(1880);
    expect(copies[1].x - copies[0].x).toBe(right.x - left.x);
  });

  it('moves copies clear of the spaces already there', () => {
    const round = newBoardGameRound('Board');
    const s = round.spaces[0];
    expect(clearOffset(round, [s])).toBe(40);
    round.spaces.push({ ...s, id: 'c1', x: s.x + 40, y: s.y + 40 });
    expect(clearOffset(round, [s])).toBe(80);
  });
});
