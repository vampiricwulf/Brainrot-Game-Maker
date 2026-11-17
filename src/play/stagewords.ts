// What a screen reader hears of the stage: the words of a clue's question as it shows, and of its answer once it's
// revealed (the Final's and the tiebreaker's too). Only what's on stream, as it's on stream: never a slide still behind
// a Daily Double's splash, PARTNER UP!, a wheel, dice, the scores or a pop-up over the stage (a tile's own too), the
// cover or a title card, nor the host's secret
// text boxes, so it holds in one window too (viewers see the panel there). Pure: stagewords.test.ts.
import type { Game, Session, Slide, TextEl } from '../lib/model';
import { clueSlideIndex, currentClueInfo, currentFinal, shownQuestionSlide } from '../lib/session';
import type { Live } from '../lib/live';

/** A slide's words as viewers see them: its text boxes (not a secret or see-through one), top to bottom, left to right. */
export function slideWords(slide: Slide): string {
  return slide.elements
    .filter((e): e is TextEl => e.kind === 'text' && !e.secret && e.opacity > 0 && !!e.text.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((e) => e.text.replace(/\s+/g, ' ').trim())
    .map((t) => (/[.!?…:;,]$/.test(t) ? t : `${t}.`))
    .join(' ');
}

/**
 * The words of the question or answer slide on stream now, keyed by which one it is (a clue's next slide, or its
 * answer, is another); null: none (no such slide up, it's hidden for now, or it has no words).
 */
export function stageWords(session: Session, game: Game, live: Live): { key: string; words: string } | null {
  // (Anything over the stage hides its slide: a wheel, dice, a roll-off, the scores, a sheet, a shop, a pop-up.)
  if (live.pregame || live.cover || live.overlay) return null;
  // (A round's title card, over everything but a board's.)
  if (session.intro?.stage === 'title' && session.phase !== 'board') return null;
  let key: string;
  let slide: Slide;
  if (session.phase === 'clue') {
    const clue = currentClueInfo(session, game)?.clue;
    if (!clue || session.dd?.stage === 'splash' || session.partner?.stage === 'pick') return null;
    key = `clue ${clue.id} ${session.revealed ? 'answer' : clueSlideIndex(session, clue)}`;
    slide = session.revealed ? clue.answerSlide : shownQuestionSlide(session, clue);
  } else if (session.phase === 'final' && (session.finalStep === 'question' || session.finalStep === 'answer')) {
    const f = currentFinal(session, game);
    if (!f) return null;
    const answer = session.finalStep === 'answer';
    key = `final ${f.id} ${answer ? 'answer' : clueSlideIndex(session, f)}`;
    slide = answer ? f.answerSlide : shownQuestionSlide(session, f);
  } else if (session.phase === 'tiebreaker' && game.tiebreaker) {
    const t = game.tiebreaker;
    key = `tiebreaker ${session.tiebreakerRevealed ? 'answer' : clueSlideIndex(session, t)}`;
    slide = session.tiebreakerRevealed ? t.answerSlide : shownQuestionSlide(session, t);
  } else return null;
  const words = slideWords(slide);
  return words ? { key, words } : null;
}
