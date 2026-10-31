import { describe, expect, it } from 'vitest';
import { jeopardyGame } from '../../lib/testgame';
import { newSession, applyScore, startTiebreaker } from '../../lib/session';
import { endLine, tiebreakLine } from './endlines';

function setup() {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
  const s = newSession(g);
  s.phase = 'end';
  return { g, s };
}

describe('the status line at the end and in the tiebreaker', () => {
  it('the results: a tie says where to settle it; else who won and that the show is over, with what’s left to do', () => {
    const { g, s } = setup();
    applyScore(s, g, ['a', 'b'], 500, 'x');
    expect(endLine(s)).toBe('Tie for first: settle it in the tie box below');
    // Co-winners declared, a roll-off or the clue won, or one ahead.
    s.coWinners = ['a', 'b'];
    expect(endLine(s)).toBe('🤝 Ann & Bob win · the show is over: 📋 Copy standings for chat, or 🚪 Exit');
    s.coWinners = undefined;
    Object.assign(s, { rollOffWinner: 'b', tieAmong: ['a', 'b'] });
    expect(endLine(s)).toBe('🏆 Bob wins · the show is over: 📋 Copy standings for chat, or 🚪 Exit');
    applyScore(s, g, ['a'], 100, 'x');
    expect(endLine(s)).toBe('🏆 Ann wins · the show is over: 📋 Copy standings for chat, or 🚪 Exit');
    s.players = [];
    expect(endLine(s)).toBe('The show is over: 📋 Copy standings for chat, or 🚪 Exit');
  });

  it('the tiebreaker clue: who won by their 🏆 (or a number, then Enter), then back to the results', () => {
    const { g, s } = setup();
    applyScore(s, g, ['a', 'b'], 500, 'x');
    startTiebreaker(s);
    expect(tiebreakLine(s)).toBe('Who won the tiebreaker? Click their 🏆, or press their number then Enter');
    // (A roll-off's win isn't the clue's.)
    Object.assign(s, { rollOffWinner: 'a', tieAmong: ['a', 'b'] });
    expect(tiebreakLine(s)).toBe('Who won the tiebreaker? Click their 🏆, or press their number then Enter');
    s.tiebreakClue = true;
    expect(tiebreakLine(s)).toBe('🏆 Ann won · 🏁 Back to results (N)');
    // Points given there settled it.
    applyScore(s, g, ['b'], 100, 'x');
    expect(tiebreakLine(s)).toBe('Nobody is tied for first any more: 🏁 Back to results (N)');
  });
});
