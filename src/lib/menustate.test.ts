import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeMenu, contextMenu, dropMenu, menuItem, menuKeys, menuOf, showMenu, typingIn, type MenuEntry } from './menustate.svelte';

// No DOM here: a button is just something with a place on the screen, and a click is the event it gets.
class FakeMouseEvent extends Event {
  clientX: number;
  clientY: number;
  constructor(type: string, init: MouseEventInit = {}) {
    super(type);
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}
vi.stubGlobal('MouseEvent', FakeMouseEvent);
class FakeButton {
  constructor(
    private left: number,
    private bottom: number,
  ) {}
  getBoundingClientRect() {
    return { left: this.left, bottom: this.bottom };
  }
}
const button = (left: number, bottom: number) => new FakeButton(left, bottom) as unknown as HTMLElement;
const click = (b: HTMLElement) => ({ currentTarget: b }) as unknown as MouseEvent;
const items: MenuEntry[] = [{ label: '📊 Change a stat', onclick: () => {} }];

afterEach(closeMenu);

describe('menus dropped from a button', () => {
  it('open under the button, and a second click on it closes the menu', () => {
    const add = button(40, 100);
    dropMenu(click(add), items);
    expect(contextMenu.open).toMatchObject({ x: 40, y: 102 });
    expect(contextMenu.open?.from).toBe(add);
    dropMenu(click(add), items);
    expect(contextMenu.open).toBeNull();
  });

  it("another button's click opens that button's menu instead", () => {
    const first = button(40, 100);
    const second = button(40, 300);
    dropMenu(click(first), items);
    dropMenu(click(second), items);
    expect(contextMenu.open?.from).toBe(second);
    expect(contextMenu.open?.y).toBe(302);
  });

  it('replace a right-click menu that is open (it came from no button)', () => {
    showMenu(new FakeMouseEvent('contextmenu', { clientX: 5, clientY: 5 }) as MouseEvent, items);
    expect(contextMenu.open?.from).toBeUndefined();
    const add = button(40, 100);
    dropMenu(click(add), items);
    expect(contextMenu.open?.from).toBe(add);
  });
});

const names = (m: MenuEntry[]) => m.map((i) => ('label' in i ? i.label : 'heading' in i ? `[${i.heading}]` : '—'));
const go = () => {};

describe('a thing’s menu (menuOf)', () => {
  it('goes in the one order, whatever order its parts are given in', () => {
    const m = menuOf({
      delete: menuItem.delete('row', go),
      extras: [{ label: '🖼 Image…', onclick: go }],
      clear: menuItem.clear(go, { label: '⌫ Clear its clues' }),
      insert: [{ label: '＋ Insert left', onclick: go }],
      move: [menuItem.left(go), menuItem.right(go)],
      paste: menuItem.paste(go),
      copy: menuItem.copy(go),
      cut: menuItem.cut(go),
      duplicate: menuItem.duplicate(go),
      rename: menuItem.rename(go),
      kinds: { heading: 'Make it a…', items: [{ label: '✓ Standard', onclick: go }] },
      verbs: [{ label: '▶ Test it', onclick: go }],
      open: [menuItem.edit(go)],
      lines: [{ heading: 'Row 2 · $400', delete: menuItem.delete('row 2', go), insert: [{ label: '＋ Insert row below', onclick: go }], move: [menuItem.up(go)] }],
      heading: 'Memes',
    });
    expect(names(m)).toEqual([
      '[Memes]',
      '✎ Edit',
      '—',
      '▶ Test it',
      '[Make it a…]',
      '✓ Standard',
      '—',
      '✎ Rename',
      '⧉ Duplicate',
      '✂ Cut',
      '📋 Copy',
      '📋 Paste',
      '—',
      '◀ Move left',
      '▶ Move right',
      '＋ Insert left',
      '—',
      '🖼 Image…',
      '—',
      '[Row 2 · $400]',
      '▲ Move up',
      '＋ Insert row below',
      '🗑 Delete row 2',
      '—',
      '⌫ Clear its clues',
      '🗑 Delete row',
    ]);
  });

  it('puts what play asks first, before opening it', () => {
    const m = menuOf({ heading: 'Potion', delete: { label: '🗑 Remove', onclick: go }, open: [{ label: '🗂 Open its card', onclick: go }], now: [{ label: '✋ Ann picks up Potion', onclick: go }] });
    expect(names(m)).toEqual(['[Potion]', '✋ Ann picks up Potion', '—', '🗂 Open its card', '—', '🗑 Remove']);
  });

  it('makes the deletes red, the line’s and the thing’s, and leaves other items as they are', () => {
    const m = menuOf({ rename: menuItem.rename(go), lines: [{ heading: 'Column B', delete: menuItem.delete('column B', go) }], delete: menuItem.delete('screen', go), clear: menuItem.clear(go) });
    const red = m.filter((i) => 'label' in i && i.danger).map((i) => ('label' in i ? i.label : ''));
    expect(red).toEqual(['🗑 Delete column B', '⌫ Clear', '🗑 Delete screen']);
    expect(m.find((i) => 'label' in i && i.label === '✎ Rename')).not.toHaveProperty('danger');
  });

  it('leaves out a part with nothing in it, and keeps a greyed item in its place', () => {
    const m = menuOf({ heading: 'Wheel', open: [], verbs: [], kinds: { heading: 'Make it a…', items: [] }, lines: [], rename: menuItem.rename(go), move: [menuItem.up(go, { disabled: true }), menuItem.down(go)] });
    expect(names(m)).toEqual(['[Wheel]', '✎ Rename', '—', '▲ Move up', '▼ Move down']);
    expect(m[3]).toMatchObject({ disabled: true });
    // (No heading: no line before the first part either.)
    expect(names(menuOf({ paste: menuItem.paste(go), delete: menuItem.delete('it', go) }))).toEqual(['📋 Paste', '—', '🗑 Delete it']);
  });

  it('gives every standard item its one name and key, unless told otherwise', () => {
    const keyed = [
      menuItem.edit(go),
      menuItem.rename(go),
      menuItem.duplicate(go),
      menuItem.cut(go),
      menuItem.copy(go),
      menuItem.paste(go),
      menuItem.up(go),
      menuItem.down(go),
      menuItem.left(go),
      menuItem.right(go),
      menuItem.clear(go),
      menuItem.delete('slice', go),
    ];
    expect(keyed.map((i) => `${i.label} ${i.keys}`)).toEqual([
      '✎ Edit Enter',
      '✎ Rename F2',
      '⧉ Duplicate Ctrl+D',
      '✂ Cut Ctrl+X',
      '📋 Copy Ctrl+C',
      '📋 Paste Ctrl+V',
      '▲ Move up Alt+↑',
      '▼ Move down Alt+↓',
      '◀ Move left Alt+←',
      '▶ Move right Alt+→',
      '⌫ Clear Delete',
      '🗑 Delete slice Delete',
    ]);
    // Its own words, a key of its own, or none where the key doesn't work there.
    expect(menuItem.copy(go, { label: '📋 Copy clue' })).toMatchObject({ label: '📋 Copy clue', keys: 'Ctrl+C' });
    expect(menuItem.rename(go, { keys: 'F2 or double-click' }).keys).toBe('F2 or double-click');
    expect(menuItem.delete('stat', go, { keys: false })).not.toHaveProperty('keys');
  });

  it('writes the keys the Mac way on a Mac', () => {
    expect(menuKeys('Alt+↑', true)).toBe('⌥↑');
    expect(menuKeys('Ctrl+Shift+]', true)).toBe('⌘⇧]');
    expect(menuKeys('Ctrl+D', false)).toBe('Ctrl+D');
    expect(menuKeys('Delete', true)).toBe('Delete');
  });
});

describe('a right-click in a name box', () => {
  const box = (from: number | null, to: number | null) => ({ tagName: 'TEXTAREA', selectionStart: from, selectionEnd: to });
  const on = (target: unknown) => ({ target }) as unknown as MouseEvent;

  it('opens the thing’s menu, unless the box is being typed in or has words selected', () => {
    const name = box(3, 3);
    expect(typingIn(on(name), false, null)).toBe(false);
    // It had the keys before the click: the browser's cut, copy and paste.
    expect(typingIn(on(name), false, name as unknown as Element)).toBe(true);
    expect(typingIn(on(box(0, 4)), false, null)).toBe(true);
    // A menu just gave it the keys back: not typing yet.
    expect(typingIn(on(name), false, name as unknown as Element, name as unknown as Element)).toBe(false);
    // Words it selected itself when it got the keys (a made-up name) don't count.
    expect(typingIn(on(box(0, 4)), true, null)).toBe(false);
    // Not a box to type in (a tile, a button).
    expect(typingIn(on({ tagName: 'BUTTON' }), false, null)).toBe(false);
  });
});
