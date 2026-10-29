import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('./app.svelte', async (orig) => ({ ...(await orig<typeof import('./app.svelte')>()), toast: vi.fn() }));

const { canPickFromScreen, labelWords, pickLabel, pickScreenColor } = await import('./screencolor');
const { toast } = await import('./app.svelte');

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
  vi.mocked(toast).mockClear();
});

describe('the 💧 beside color boxes', () => {
  it('is only there in the desktop app', () => {
    expect(canPickFromScreen()).toBe(false);
    vi.stubGlobal('window', {});
    expect(canPickFromScreen()).toBe(false);
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(canPickFromScreen()).toBe(true);
  });

  it('says which color it picks', () => {
    expect(pickLabel('Tile glow color')).toBe('Pick the Tile glow color from the screen');
    expect(pickLabel('Color for Ann')).toBe('Pick the color for Ann from the screen');
    expect(pickLabel('HP color')).toBe('Pick the HP color from the screen');
    expect(pickLabel(undefined)).toBe('Pick a color from the screen');
    expect(pickLabel(' ')).toBe('Pick a color from the screen');
  });
});

describe('labelWords', () => {
  // (Just what labelWords reads of a DOM node.)
  const text = (t: string) => ({ nodeType: 3, textContent: t }) as unknown as Node;
  const el = (kids: Node[], attrs: Record<string, string> = {}) =>
    ({ nodeType: 1, childNodes: kids, getAttribute: (k: string) => attrs[k] ?? null }) as unknown as Node;

  it("names a color box with its label's words, without the 💧", () => {
    const box = el([el([]), el([text('💧')], { 'aria-label': 'Pick a color from the screen' })]);
    expect(labelWords(el([box, text(' Values ')]), box)).toBe('Values');
    // A hint in the label is read too, a ↺ button by its name, and what's hidden from screen readers isn't.
    const label = el([
      box,
      el([text('Used tiles '), el([text('(not shown: Played tiles is Dimmed)')])]),
      el([text('↺')], { 'aria-label': 'Back to the plain one' }),
      el([text('🎨')], { 'aria-hidden': 'true' }),
    ]);
    expect(labelWords(label, box)).toBe('Used tiles (not shown: Played tiles is Dimmed) Back to the plain one');
    expect(labelWords(el([text('Color'), box]), box)).toBe('Color');
    expect(labelWords(el([box]), box)).toBe('');
  });
});

describe('pickScreenColor', () => {
  it('gives the color picked, or null when cancelled', async () => {
    invoke.mockResolvedValueOnce('#12AB34');
    expect(await pickScreenColor()).toBe('#12ab34');
    expect(invoke).toHaveBeenCalledWith('pick_screen_color');
    invoke.mockResolvedValueOnce(null);
    expect(await pickScreenColor()).toBeNull();
    // (Anything but #rrggbb is no color.)
    invoke.mockResolvedValueOnce('red');
    expect(await pickScreenColor()).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("says why when the picker can't open", async () => {
    invoke.mockRejectedValueOnce('The color picker is already open.');
    expect(await pickScreenColor()).toBeNull();
    expect(toast).toHaveBeenLastCalledWith('The color picker is already open.');
    invoke.mockRejectedValueOnce(new Error('ipc'));
    expect(await pickScreenColor()).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("Couldn't pick a color from the screen.");
  });

  it('opens one picker at a time', async () => {
    let done: (v: string) => void = () => {};
    invoke.mockReturnValueOnce(new Promise((r) => (done = r)));
    const first = pickScreenColor();
    expect(await pickScreenColor()).toBeNull();
    done('#000000');
    expect(await first).toBe('#000000');
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValueOnce('#ffffff');
    expect(await pickScreenColor()).toBe('#ffffff');
  });
});
