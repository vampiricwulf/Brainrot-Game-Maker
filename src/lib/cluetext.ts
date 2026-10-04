// The game's clue text default (🎨 Theme → Clue text): the font and colour of the main text of every question and
// answer slide (board clues, Final rounds, the tiebreaker). A clue whose text was given a look of its own keeps it.
import { isBoard, isFinal, isSlides, newTextEl, questionSlides, slidesOfClue, type Game, type Slide, type TextEl } from './model';
import type { Theme } from './theme';

const FACTORY = newTextEl();
/** The font and colour a new text box has. */
export const FACTORY_FONT = FACTORY.font;
export const FACTORY_COLOR = FACTORY.color;

/** The question and answer slides of the game: board clues, Final rounds, the tiebreaker. */
export function clueSlides(game: Game): Slide[] {
  const out: Slide[] = [];
  for (const r of game.rounds) {
    if (isBoard(r)) for (const c of r.categories) for (const cl of c.clues) out.push(...slidesOfClue(cl));
    else if (isFinal(r)) out.push(...slidesOfClue(r));
    else if (isSlides(r)) out.push(...questionSlides(r));
  }
  if (game.tiebreaker) out.push(...slidesOfClue(game.tiebreaker));
  return out;
}

const mainText = (s: Slide) => s.elements.find((e): e is TextEl => e.kind === 'text');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Change the default: every main text with the old default (or a new text box's look) takes the new one. Returns how
 * many changed. `to` undefined: back to a new text box's look.
 */
export function setClueText(game: Game, key: 'font' | 'color', to: string | undefined): number {
  const field = key === 'font' ? 'clueFont' : 'clueColor';
  const factory = key === 'font' ? FACTORY_FONT : FACTORY_COLOR;
  const was = game.theme[field] ?? factory;
  const now = to ?? factory;
  game.theme[field] = to;
  let n = 0;
  for (const s of clueSlides(game)) {
    const t = mainText(s);
    if (t && (same(t[key], was) || same(t[key], factory)) && !same(t[key], now)) {
      t[key] = now;
      n++;
    }
  }
  return n;
}

/** New question and answer slides take the default (their main text still has a new text box's look). */
export function followClueText(game: Game, slides: Slide[] = clueSlides(game)): void {
  const { clueFont, clueColor } = game.theme;
  if (!clueFont && !clueColor) return;
  for (const s of slides) {
    const t = mainText(s);
    if (!t) continue;
    if (clueFont && same(t.font, FACTORY_FONT)) t.font = clueFont;
    if (clueColor && same(t.color, FACTORY_COLOR)) t.color = clueColor;
  }
}

/**
 * A whole theme for the game (a preset, a saved or shared theme, another game's): its clue text font and color
 * restyle the questions and answers as the Clue text box would (the ones still with the old default's look).
 */
export function setTheme(game: Game, next: Theme): void {
  const { clueFont, clueColor } = next;
  game.theme = { ...next, clueFont: game.theme.clueFont, clueColor: game.theme.clueColor };
  setClueText(game, 'font', clueFont);
  setClueText(game, 'color', clueColor);
}
