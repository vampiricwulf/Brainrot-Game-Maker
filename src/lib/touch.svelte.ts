/**
 * A touch screen with no mouse (a phone, a tablet): `(hover: none)`, the same test `app.css` hides the keys on buttons
 * and in menus by. The host's status lines and how-tos then name the buttons to tap, not keys there are none of. A
 * touch laptop (a mouse too) keeps the keys. Follows the device as it changes (a mouse plugged in).
 */
const query = typeof matchMedia === 'function' ? matchMedia('(hover: none)') : null;
let on = $state(query?.matches ?? false);
query?.addEventListener?.('change', (e) => (on = e.matches));

export const touchScreen = {
  /** No mouse, no keys: say the buttons. */
  get on(): boolean {
    return on;
  },
};

/**
 * A key after a button's name, " (N)", with a keyboard; nothing on a touch screen (the button is there to tap). `or`:
 * inside words already in brackets, ", or N" ("the blue button, or N").
 */
export const keyNote = (key: string, or?: string): string => (on ? '' : or !== undefined ? `${or}${key}` : ` (${key})`);

/** "click" with a mouse, "tap" on a touch screen. */
export const clickWord = (): string => (on ? 'tap' : 'click');
