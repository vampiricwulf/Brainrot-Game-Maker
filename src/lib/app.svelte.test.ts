import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { app, hint, sceneFrom, toast } from './app.svelte';
import { newSession } from './session';
import { jeopardyGame } from './testgame';

/** A game on its board, a moment after the last toast (so the change isn't taken as said along with it). */
function playing() {
  const game = jeopardyGame();
  app.playGame = game;
  app.session = newSession(game);
  app.screen = 'play';
  app.pregame = false;
  flushSync();
  return app.session!;
}
const later = () => {
  vi.advanceTimersByTime(600);
  flushSync();
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  app.toast = '';
  app.session = null;
  app.screen = 'editor';
  flushSync();
  vi.useRealTimers();
});

describe('hints', () => {
  it('go once the host does what they asked', () => {
    const s = playing();
    s.phase = 'tiebreaker';
    flushSync();
    hint('Select the one player who won the tiebreaker');
    later();
    expect(app.toast).toBe('Select the one player who won the tiebreaker');
    s.rollOffWinner = s.players[0]?.id ?? 'p1';
    flushSync();
    expect(app.toast).toBe('');
  });

  it('go on to the next moment too, even at once (N twice)', () => {
    const s = playing();
    s.phase = 'clue';
    s.currentClue = { round: 0, cat: 0, row: 0 };
    flushSync();
    hint('Ann is picked with no points given: Enter awards, Shift+Enter marks wrong, or N again closes without points', 5000);
    s.phase = 'board';
    s.currentClue = null;
    flushSync();
    expect(app.toast).toBe('');
  });

  it('stay while nothing moves on, then time out as any toast', () => {
    const s = playing();
    s.phase = 'boardgame';
    flushSync();
    hint('Roll first (D), or type the steps');
    later();
    expect(app.toast).toBe('Roll first (D), or type the steps');
    vi.advanceTimersByTime(5000);
    expect(app.toast).toBe('');
  });

  it('go once the dice roll (D after "Roll first")', () => {
    const s = playing();
    s.phase = 'boardgame';
    flushSync();
    hint('Roll first (D), or type the steps');
    later();
    s.rollLog = [{ id: 'r1', ts: 0, source: 'dice', name: 'd6', result: '4' }];
    flushSync();
    expect(app.toast).toBe('');
  });

  it('go once the game screen picks someone or types an amount, not when it says the same again', () => {
    playing();
    const pick = $state({ selected: [] as string[], amount: null as number | null });
    const stop = sceneFrom(() => `${pick.selected.join()}|${pick.amount}`);
    try {
      // (Picked in the same moment the hint is said: it stays.)
      pick.amount = 200;
      hint('Select a player first (press 1–3 or click a name)');
      later();
      pick.selected = [];
      flushSync();
      expect(app.toast).toBe('Select a player first (press 1–3 or click a name)');
      pick.selected = ['p1'];
      flushSync();
      expect(app.toast).toBe('');
      hint('Enter an amount first');
      later();
      pick.amount = 400;
      flushSync();
      expect(app.toast).toBe('');
    } finally {
      stop();
    }
  });

  it('leave other toasts alone when the game moves on', () => {
    const s = playing();
    toast('📱 Zed wants to join: click the 📱 chip', 5000);
    later();
    s.scoreLog.push({ id: 'e1', ts: 0, playerId: 'p1', delta: 200, reason: 'Memes $200', round: 0 });
    s.phase = 'clue';
    flushSync();
    expect(app.toast).toBe('📱 Zed wants to join: click the 📱 chip');
  });
});
