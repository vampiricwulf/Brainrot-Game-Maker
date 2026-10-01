// Screen-reader announcements: one polite live region, always on the page (a region that mounts with its message is
// often not read), fed through announce(). Messages that come close together are said together, once each, so a burst
// of changes (an award to three players, buzzes) is one short sentence instead of a stream of interruptions.

/** Messages within this long of each other are said together (ms). */
export const ANNOUNCE_WAIT = 400;

/** Collects messages and hands them on together after a quiet moment (timers are passed in, for the tests). */
export class Announcer {
  private queue: string[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private say: (text: string) => void,
    private wait = ANNOUNCE_WAIT,
    private timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
  ) {}

  push(message: string): void {
    const m = message.replace(/\s+/g, ' ').trim();
    if (!m || this.queue.includes(m)) return;
    this.queue.push(m);
    this.timers.clear(this.timer);
    this.timer = this.timers.set(() => this.flush(), this.wait);
  }

  flush(): void {
    this.timers.clear(this.timer);
    this.timer = undefined;
    if (!this.queue.length) return;
    const text = this.queue.map((m) => (/[.!?…]$/.test(m) ? m : `${m}.`)).join(' ');
    this.queue = [];
    this.say(text);
  }
}

let region: HTMLElement | null = null;

/** The page's live region (made the first time it's needed, and at start-up from main.ts). */
export function liveRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (region?.isConnected) return region;
  region = document.getElementById('live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'live-region';
    region.className = 'sr-only';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  return region;
}

const announcer = new Announcer((text) => {
  const r = liveRegion();
  if (!r) return;
  // Emptied first, so the same words said twice in a row are read twice.
  r.textContent = '';
  setTimeout(() => (r.textContent = text), 30);
});

/** Say this to screen-reader users (politely: after what they're hearing now). */
export function announce(message: string): void {
  announcer.push(message);
}

/**
 * Svelte action: announce an element's words whenever they change (buttons and menus in it left out), e.g. the host
 * panel's status line. Changes in quick succession are said once, as they end up.
 */
export function announceChanges(node: HTMLElement, wait = 600) {
  let last = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const words = () => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('button, select, input, [aria-hidden="true"], .hint').forEach((e) => e.remove());
    return (copy.textContent ?? '').replace(/\s+/g, ' ').replace(/\s·\s*$/, '').trim();
  };
  const check = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const now = words();
      if (now && now !== last) announce(now);
      last = now;
    }, wait);
  };
  last = words();
  const mo = new MutationObserver(check);
  mo.observe(node, { childList: true, characterData: true, subtree: true });
  return {
    destroy() {
      mo.disconnect();
      clearTimeout(timer);
    },
  };
}
