import { describe, expect, it } from 'vitest';
import { prefs, savePrefs, serverAddress } from './prefs.svelte';

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
});
