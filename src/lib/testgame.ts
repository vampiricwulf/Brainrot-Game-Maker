// For tests: a game with the rounds a classic Jeopardy game has (a board, then Final Jeopardy).
import { newFinalRound, newGame, newRound, type Game } from './model';

export function jeopardyGame(): Game {
  const g = newGame();
  g.rounds = [newRound('Jeopardy!'), newFinalRound()];
  return g;
}
