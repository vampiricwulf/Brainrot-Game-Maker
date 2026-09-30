import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeMenu, contextMenu, dropMenu, showMenu, type MenuEntry } from './menustate.svelte';

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
