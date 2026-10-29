import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('./app.svelte', async (orig) => ({ ...(await orig<typeof import('./app.svelte')>()), toast: vi.fn() }));

const { canPickFromScreen, pickScreenColor } = await import('./screencolor');
const { toast } = await import('./app.svelte');

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
  vi.mocked(toast).mockClear();
});

/** A browser's eyedropper that picks `color` (null: Esc). */
const dropper = (color: string | null) =>
  class {
    open = () => (color ? Promise.resolve({ sRGBHex: color }) : Promise.reject(new DOMException('Cancelled', 'AbortError')));
  };

describe("the color picker's 💧", () => {
  it('is there in the desktop app, and in a browser with an eyedropper', () => {
    expect(canPickFromScreen()).toBe(false);
    vi.stubGlobal('window', {});
    expect(canPickFromScreen()).toBe(false);
    vi.stubGlobal('window', { EyeDropper: dropper(null) });
    expect(canPickFromScreen()).toBe(true);
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(canPickFromScreen()).toBe(true);
  });

  it("uses the browser's eyedropper outside the desktop app", async () => {
    vi.stubGlobal('window', { EyeDropper: dropper('#12AB34') });
    expect(await pickScreenColor()).toBe('#12ab34');
    vi.stubGlobal('window', { EyeDropper: dropper(null) });
    expect(await pickScreenColor()).toBeNull();
    vi.stubGlobal('window', {});
    expect(await pickScreenColor()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('pickScreenColor in the desktop app', () => {
  beforeEach(() => vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, EyeDropper: dropper('#ffffff') }));

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
