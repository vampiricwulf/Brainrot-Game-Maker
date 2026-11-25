import { describe, expect, it, vi } from 'vitest';
import { RENAMED } from '../lib/keylist';
import { markMovedSeen, movedNew, movedStamp, noSettings, renames, WHAT_MOVED } from './whatmoved.svelte';

describe('what moved lately', () => {
  it('is new until its part’s list was shown, and again for a later list', () => {
    expect(movedNew('game', null)).toBe(true);
    expect(movedNew('game', movedStamp(WHAT_MOVED.game, RENAMED))).toBe(false);
    // (What was kept before the stamps, a version: the lines added since are new to that host.)
    expect(movedNew('game', '2.38.0')).toBe(true);
    // (A part with nothing moved shows no dot.)
    expect(movedNew('editor', null, [])).toBe(false);
    markMovedSeen('game');
    expect(movedNew('game')).toBe(false);
    // A line added after the list was shown, or one reworded, or a new name: new again, nothing to bump by hand.
    expect(movedNew('game', undefined, [...WHAT_MOVED.game, 'Something moved since.'])).toBe(true);
    expect(movedNew('game', undefined, [...WHAT_MOVED.game.slice(0, -1), WHAT_MOVED.game.at(-1) + ' And more.'])).toBe(true);
    expect(movedStamp(WHAT_MOVED.game, [...RENAMED, ['New', 'Old']])).not.toBe(movedStamp(WHAT_MOVED.game, RENAMED));
    expect(movedStamp(WHAT_MOVED.editor)).toMatch(/^m[0-9a-z]+$/);
  });

  it('says where things went in plain lines, the renames from the keys filter’s list', () => {
    const game = WHAT_MOVED.game.join('\n');
    for (const w of [
      '↩ Put back (keep tile)',
      '🔊 Sound',
      'Shift+click',
      '🎲 Roll for it (O)',
      '▸ Buzzer options',
      '✅ Before you start',
      '⏱️ Start the countdown',
      '⋯ Tools',
      '700 px tall',
    ])
      expect(game).toContain(w);
    for (const l of WHAT_MOVED.game) expect(l.trim(), l).toBe(l);
    expect(renames()).toHaveLength(RENAMED.length);
    expect(renames()).toContain('📊 Scores → 📊 Scoreboard');
    expect(renames([['↻ Spin again', 'Spin again']])).toEqual(['Spin again → ↻ Spin again']);
    // The editor's part: its menus' one order, the lists' ⋯, and its new names.
    const editor = WHAT_MOVED.editor.join('\n');
    for (const w of [
      'one order',
      'Row 2 · $400',
      '⋯',
      '🏁 Make it the start',
      '↺ Built-in',
      '📋 Paste over this slide',
      '✓ Done cropping',
      'Replace everywhere…',
      'Plays from',
      '🔊 Sound',
      '⧉ Same as the answer',
      '▸ More rules',
      '＋ Add tiebreaker',
      '＋ Add space',
      'Ways out',
      'ℹ See where',
      '💾 Save •',
      'Ctrl+O',
      '▸ Share or bring in a theme',
      '📥 Import rounds…',
      'Start new anyway',
    ])
      expect(editor).toContain(w);
    expect(movedNew('editor', null)).toBe(true);
  });

  it('counts as seen on a first run only: no settings kept and no game from before', async () => {
    const store = (...keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });
    expect(noSettings(store())).toBe(true);
    expect(noSettings(store('other.site'))).toBe(true);
    expect(noSettings(store('other.site', 'jb.prefs'))).toBe(false);
    expect(noSettings(null)).toBe(false);
    // A browser refusing site data throws on reading it: not a first run, and never a crash.
    const refused = {
      get length(): number {
        throw new DOMException('denied', 'SecurityError');
      },
      key: () => null,
    };
    expect(noSettings(refused)).toBe(false);
    // A fresh start: nothing shown yet on this computer.
    vi.resetModules();
    const fresh = await import('./whatmoved.svelte');
    // A host coming back (a setting kept, or a game kept from before) still gets the dot and the list.
    fresh.firstRunSeen(false, false);
    fresh.firstRunSeen(true, true);
    expect([fresh.movedNew('game'), fresh.movedNew('editor')]).toEqual([true, true]);
    fresh.firstRunSeen(false, true);
    expect([fresh.movedNew('game'), fresh.movedNew('editor')]).toEqual([false, false]);
  });
});
