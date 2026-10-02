// The editor's checklist in the sidebar: the problems validate() finds, one line a round, and where a click on it goes.
import { isBoard, PLAYER_WHEEL, roundName, type BoardRound, type Game } from './model';
import type { Place } from './historylabel';
import { tileDice } from './tools';
import { slideHasContent } from './usage';
import type { Problem } from './validate';

export interface ChecklistLine {
  text: string;
  level: 'warn' | 'info';
  tab: Problem['tab'];
  /** Every problem it stands for (its tooltip). */
  details: string[];
  /** The first thing to finish in it (a board's first unfinished tile, an RPG's screen, a board game's space). */
  place?: Place;
}

/** A tile that still needs something: a question and an answer, or for a wheel or dice tile, its wheel or dice. */
function unfinished(game: Game, round: BoardRound, firstOnly = false) {
  const out: { category: string; clue: string }[] = [];
  // Column by column, like the clue editor's Next.
  for (const cat of round.categories)
    for (const c of cat.clues) {
      if (c.empty) continue;
      const tool = c.type === 'wheel' || c.type === 'dice';
      const done = tool
        ? c.type === 'wheel'
          ? c.wheelId === PLAYER_WHEEL || game.wheels.some((w) => w.id === c.wheelId)
          : !!tileDice(game, c.diceId)
        : slideHasContent(c.questionSlide) && slideHasContent(c.answerSlide);
      if (!done) out.push({ category: cat.id, clue: c.id });
      if (firstOnly && out.length) return out;
    }
  return out;
}

/** Where a board's checklist line goes: its first unfinished tile, else its first nameless category (none: undefined). */
export function boardPlace(game: Game, round: BoardRound): Place | undefined {
  const first = unfinished(game, round, true)[0];
  const nameless = round.categories.find((c) => !c.title.trim() && !c.image);
  if (first) return { tab: 'round', round: round.id, part: { kind: 'clue', ...first, onBoard: true } };
  if (nameless) return { tab: 'round', round: round.id, part: { kind: 'category', category: nameless.id } };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The checklist's lines: a round's problems make one line ("Jeopardy!: 30 clues to finish"), the rest one each. A
 * board's line goes to its first unfinished tile (else its first nameless category).
 */
export function checklistLines(game: Game, problems: Problem[]): ChecklistLine[] {
  const lines: ChecklistLine[] = [];
  const byRound = new Map<number, ChecklistLine>();
  for (const p of problems) {
    const round = typeof p.tab === 'number' ? game.rounds[p.tab] : undefined;
    if (!round) {
      lines.push({ text: p.text, level: p.level, tab: p.tab, details: [p.text], place: p.place });
      continue;
    }
    const line = byRound.get(p.tab as number);
    if (line) {
      line.details.push(p.text);
      // (The first warning's place: the first thing worth fixing.)
      if (p.level === 'warn' && line.level !== 'warn' && p.place) line.place = p.place;
      if (p.level === 'warn') line.level = 'warn';
    } else {
      // An RPG's or a board game's problem says where it is (the screen, the space): the line goes there.
      const fresh: ChecklistLine = { text: p.text, level: p.level, tab: p.tab, details: [p.text], place: p.place ?? { tab: 'round', round: round.id } };
      byRound.set(p.tab as number, fresh);
      lines.push(fresh);
    }
  }
  for (const [i, line] of byRound) {
    const round = game.rounds[i];
    const name = roundName(round, i);
    if (isBoard(round)) {
      const todo = unfinished(game, round);
      line.place = boardPlace(game, round) ?? line.place;
      if (line.details.length > 1) {
        // (Daily Doubles not placed yet aren't to fix: Start game places them. A new board says only its clues to finish.)
        const others = line.details.length - line.details.filter((d) => /clues? with no (question|answer)|wheel\/dice tile|Daily Doubles? not placed yet/.test(d)).length;
        line.text = !todo.length
          ? `${name}: ${plural(others, 'thing')} to fix`
          : `${name}: ${plural(todo.length, 'clue')} to finish${others ? `, ${others} more to fix` : ''}`;
      }
    } else if (line.details.length > 1) line.text = `${name}: ${plural(line.details.length, 'thing')} to fix`;
  }
  return lines;
}
