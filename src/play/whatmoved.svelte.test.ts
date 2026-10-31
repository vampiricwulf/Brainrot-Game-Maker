import { describe, expect, it } from 'vitest';
import { RENAMED } from '../lib/keylist';
import { markMovedSeen, MOVED_SINCE, movedNew, movedSeen, renames, WHAT_MOVED } from './whatmoved.svelte';

describe('what moved in this version', () => {
  it('is new until its part’s list was shown, and again for a later list', () => {
    expect(movedNew('game', null)).toBe(true);
    expect(movedNew('game', MOVED_SINCE)).toBe(false);
    expect(movedNew('game', '2.37.0')).toBe(true);
    // (A part with nothing moved shows no dot.)
    expect(movedNew('editor', null, [])).toBe(false);
    markMovedSeen('game');
    expect([movedSeen.game, movedNew('game')]).toEqual([MOVED_SINCE, false]);
  });

  it('says where things went in plain lines, the renames from the keys filter’s list', () => {
    const game = WHAT_MOVED.game.join('\n');
    for (const w of ['↩ Put back (keep tile)', '🔊 Sound', 'Shift+click', '🎲 Roll for it (O)', '▸ Buzzer options', '✅ Before you start']) expect(game).toContain(w);
    for (const l of WHAT_MOVED.game) expect(l.trim(), l).toBe(l);
    expect(renames()).toHaveLength(RENAMED.length);
    expect(renames()).toContain('📊 Scores → 📊 Scoreboard');
    expect(renames([['↻ Spin again', 'Spin again']])).toEqual(['Spin again → ↻ Spin again']);
  });
});
