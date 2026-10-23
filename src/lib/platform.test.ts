import { afterEach, describe, expect, it, vi } from 'vitest';
import { keptHere, popupBlocked } from './platform';

describe('words for where the app runs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('say “this browser” and its popups in a browser', () => {
    expect([keptHere(), popupBlocked()]).toEqual(['in this browser', 'The browser blocked the popup. Allow popups for this file and try again.']);
  });

  it('say “this PC”, and no browser, in the desktop app', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect([keptHere(), popupBlocked()]).toEqual(['on this PC', "Couldn't open the window. Try again."]);
  });
});
