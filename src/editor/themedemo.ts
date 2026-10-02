// A pretend game in progress, for the 🎨 Theme page's preview and an imported theme's.
import { isBoard, isFinal, newId, type Game, type Session } from '../lib/model';
import { goToRound, newSession, openClue } from '../lib/session';

/**
 * A session on round `at` of `game` (or its first board's first clue, open, with `clue`): three players with scores if
 * the game has none, every other category's first tile played.
 */
export function themeDemo(game: Game, at: number, clue = false): Session {
  const s = newSession(game);
  if (!s.players.length)
    s.players = ['Alex', 'Sam', 'Jordan'].map((name, i) => ({ id: newId(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: [1200, 400, -200][i] }));
  s.currentPickerId = s.players[0]?.id;
  goToRound(s, game, at);
  s.intro = null;
  const r = game.rounds[at];
  if (isBoard(r)) r.categories.forEach((c, ci) => ci % 2 === 0 && c.clues[0] && (s.used[c.clues[0].id] = true));
  if (isBoard(r) && clue) {
    const cat = r.categories.findIndex((c) => c.clues.some((cl) => !cl.empty));
    if (cat >= 0) openClue(s, { round: at, cat, row: r.categories[cat].clues.findIndex((cl) => !cl.empty) });
    s.dd = null;
  }
  // A Final shows its question (the clue text).
  if (isFinal(r)) s.finalStep = 'question';
  return s;
}
