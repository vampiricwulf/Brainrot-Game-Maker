import { describe, expect, it } from 'vitest';
import { prefs, prefsUnkept, savePrefs, serverAddress } from './prefs.svelte';

describe('settings', () => {
  it('a number box emptied (to type another) keeps its number instead of saving 0 or 1', () => {
    prefs.autosaveMinutes = 7;
    prefs.autosaveKeep = 12;
    savePrefs();
    (prefs as unknown as Record<string, unknown>).autosaveMinutes = null;
    (prefs as unknown as Record<string, unknown>).autosaveKeep = '';
    savePrefs();
    expect([prefs.autosaveMinutes, prefs.autosaveKeep]).toEqual([7, 12]);
    // A number typed is kept (within its limits), 0 minutes too (autosave off).
    prefs.autosaveMinutes = 0;
    prefs.autosaveKeep = 99;
    savePrefs();
    expect([prefs.autosaveMinutes, prefs.autosaveKeep]).toEqual([0, 50]);
  });

  it('a buzzer server typed without https:// (as Cloudflare shows it) is saved with it', () => {
    prefs.buzzerServer = ' buzz.example.workers.dev/ ';
    savePrefs();
    expect(prefs.buzzerServer).toBe('https://buzz.example.workers.dev');
    expect(serverAddress('http://localhost:8787')).toBe('http://localhost:8787');
    expect(serverAddress('HTTPS://Buzz.example.workers.dev//')).toBe('https://Buzz.example.workers.dev');
    expect(serverAddress('  ')).toBe('');
  });

  it("settings the browser can't keep are flagged, and the flag goes once they're kept", () => {
    const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const kept = new Map<string, string>();
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k: string) => kept.get(k) ?? null,
          setItem: () => {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          },
        },
      });
      savePrefs();
      expect(prefsUnkept.on).toBe(true);
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
      });
      savePrefs();
      expect(prefsUnkept.on).toBe(false);
    } finally {
      if (was) Object.defineProperty(globalThis, 'localStorage', was);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it('the color picker shows Hex unless RGB was chosen', () => {
    expect(prefs.colorFormat).toBe('hex');
    prefs.colorFormat = 'rgb';
    savePrefs();
    expect(prefs.colorFormat).toBe('rgb');
    (prefs as unknown as Record<string, unknown>).colorFormat = 'hsl';
    savePrefs();
    expect(prefs.colorFormat).toBe('hex');
  });
});
