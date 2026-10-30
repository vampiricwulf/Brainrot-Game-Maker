// A long press on a touch screen opens what a right-click opens (a player's menu, the stage's): `use:longPress` on the
// part of the page that has menus. A finger held still that long sends a right-click where it is, and the tap that ends
// the press is dropped, so it never presses what the menu opened over. (Where the browser sends its own right-click for
// a long press, that one goes and this one doesn't.)

/** How long a finger is held still for a menu. */
export const LONG_PRESS_MS = 550;
/** How far it may slip and still be held still (a drag or a scroll is no long press). */
export const STILL_PX = 10;

export function longPress(node: HTMLElement): { destroy: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number; id: number } | null = null;
  /** This press opened a menu: the click that ends it is dropped. */
  let opened = false;

  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
    start = null;
  }
  /** Any press anywhere (a menu's item too) is a new one: only the tap that ended the long press is dropped. */
  function anyDown(): void {
    stop();
    opened = false;
  }
  function down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    const { clientX, clientY } = e;
    timer = setTimeout(() => {
      stop();
      if (!target.isConnected) return;
      opened = true;
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY, button: 2 }));
    }, LONG_PRESS_MS);
  }
  function move(e: PointerEvent): void {
    if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > STILL_PX) stop();
  }
  function end(e: PointerEvent): void {
    if (start && e.pointerId === start.id) stop();
  }
  /** The browser's own right-click for this long press: it goes instead of ours (its tap is dropped too). */
  function native(e: MouseEvent): void {
    if (!e.isTrusted) return;
    if (timer) {
      stop();
      opened = true;
    } else if (opened) {
      // (Ours went already: one menu for one press.)
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function click(e: MouseEvent): void {
    if (!opened) return;
    opened = false;
    e.preventDefault();
    e.stopPropagation();
  }
  // (The window's first: it runs before the press here starts its count.)
  addEventListener('pointerdown', anyDown, true);
  node.addEventListener('pointerdown', down, true);
  addEventListener('pointermove', move, true);
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  node.addEventListener('contextmenu', native, true);
  // (On the window: the menu may have opened under the finger, outside this part of the page.)
  addEventListener('click', click, true);
  return {
    destroy() {
      stop();
      removeEventListener('pointerdown', anyDown, true);
      node.removeEventListener('pointerdown', down, true);
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', end, true);
      removeEventListener('pointercancel', end, true);
      node.removeEventListener('contextmenu', native, true);
      removeEventListener('click', click, true);
    },
  };
}
