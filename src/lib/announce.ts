// Screen-reader announcements: one polite live region, always on the page (a region that mounts with its message is
// often not read), fed through announce(). Messages that come close together are said together, once each, so a burst
// of changes (an award to three players, buzzes) is one short sentence instead of a stream of interruptions.

/** Messages within this long of each other are said together (ms). */
export const ANNOUNCE_WAIT = 400;

/** Collects messages and hands them on together after a quiet moment (timers are passed in, for the tests). */
export class Announcer {
  private queue: { text: string; key?: string }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private say: (text: string) => void,
    private wait = ANNOUNCE_WAIT,
  ) {}
  /** (Called through these, never as methods of another object: browsers' timers must be called on the window.) */
  private timers = {
    set: (f: () => void, ms: number) => setTimeout(f, ms),
    clear: (t: ReturnType<typeof setTimeout> | undefined) => clearTimeout(t),
  };

  /** `key`: a message that's out of date once another with the same key comes (the buzz order): that one takes its place. */
  push(message: string, key?: string): void {
    const m = message.replace(/\s+/g, ' ').trim();
    if (!m) return;
    const same = key === undefined ? undefined : this.queue.find((q) => q.key === key);
    if (same) same.text = m;
    else if (this.queue.some((q) => q.text === m)) return;
    else this.queue.push({ text: m, key });
    this.timers.clear(this.timer);
    this.timer = this.timers.set(() => this.flush(), this.wait);
  }

  flush(): void {
    this.timers.clear(this.timer);
    this.timer = undefined;
    if (!this.queue.length) return;
    const text = this.queue.map(({ text: m }) => (/[.!?…]$/.test(m) ? m : `${m}.`)).join(' ');
    this.queue = [];
    this.say(text);
  }
}

let host: HTMLElement | null = null;
let region: HTMLElement | null = null;

/**
 * The page's live region (made the first time it's needed, and at start-up from main.ts). It sits in a closed shadow
 * root: screen readers read it, but page searches (and the browser tests' text lookups) don't find a second copy of
 * every toast in it. Its host carries the last words said in `data-said` (for the tests).
 */
export function liveRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (host?.isConnected && region) return region;
  host = document.createElement('div');
  host.id = 'live-region';
  host.className = 'sr-only';
  host.dataset.live = 'polite';
  // (Left out of what a window makes inert: what's said while one is open must still be read.)
  host.setAttribute('data-over-modal', '');
  const root = host.attachShadow({ mode: 'closed' });
  region = document.createElement('div');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  root.appendChild(region);
  document.body.appendChild(host);
  return region;
}

const announcer = new Announcer((text) => {
  const r = liveRegion();
  if (!r) return;
  // Emptied first, so the same words said twice in a row are read twice.
  r.textContent = '';
  setTimeout(() => {
    r.textContent = text;
    if (host) host.dataset.said = text;
  }, 30);
});

/**
 * Say this to screen-reader users (politely: after what they're hearing now). `key`: it replaces a message with the same
 * key still waiting to be said (the buzz order as it ends up, not each one on the way).
 */
export function announce(message: string, key?: string): void {
  announcer.push(message, key);
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
    // (`data-quiet`: parts that speak for themselves or change all the time, a running countdown, the phones' popover.)
    copy.querySelectorAll('button, select, input, [aria-hidden="true"], .hint, [data-quiet]').forEach((e) => e.remove());
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
