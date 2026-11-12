// A pretend game in progress, for the 🎨 Theme page's preview and an imported theme's.
import { isBoard, isFinal, newId, setSlideText, type Game, type Session, type Slide } from '../lib/model';
import { slideHasContent } from '../lib/usage';
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
    s.partner = null;
  }
  // A Final shows its question (the clue text).
  if (isFinal(r)) s.finalStep = 'question';
  return s;
}

/** The words a preview's clue shows while it has none of its own: a new clue's text box, styled as the game's clues are. */
export const SAMPLE_CLUE = 'This is how a clue looks on stream';

/**
 * `game` for the preview of round `at` (its first board's first clue, open, with `clue`, as themeDemo opens it): when the
 * clue's or the Final's question slide is still empty, a copy whose slide shows SAMPLE_CLUE in its text box (and a Final
 * with no category, "Sample category"), so the clue text's font and color can be seen and clicked. The game itself is
 * never touched: anything else is `game` as it is.
 */
export function withSampleClue(game: Game, at: number, clue = false): Game {
  const r = game.rounds[at];
  const filled = (slide: Slide): Slide => {
    const copy = JSON.parse(JSON.stringify(slide)) as Slide;
    setSlideText(copy, SAMPLE_CLUE);
    return copy;
  };
  const withRound = (round: Game['rounds'][number]): Game => ({ ...game, rounds: game.rounds.map((x, i) => (i === at ? round : x)) });
  if (isFinal(r)) {
    const empty = !slideHasContent(r.questionSlide);
    if (!empty && r.category.trim()) return game;
    return withRound({ ...r, category: r.category.trim() || 'Sample category', ...(empty ? { questionSlide: filled(r.questionSlide) } : {}) });
  }
  if (!isBoard(r) || !clue) return game;
  const cat = r.categories.findIndex((c) => c.clues.some((cl) => !cl.empty));
  if (cat < 0) return game;
  const row = r.categories[cat].clues.findIndex((cl) => !cl.empty);
  const open = r.categories[cat].clues[row];
  if (slideHasContent(open.questionSlide)) return game;
  return withRound({
    ...r,
    categories: r.categories.map((c, ci) => (ci === cat ? { ...c, clues: c.clues.map((cl, k) => (k === row ? { ...cl, questionSlide: filled(cl.questionSlide) } : cl)) } : c)),
  });
}
