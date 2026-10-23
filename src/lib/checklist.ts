// The editor's checklist in the sidebar: the problems validate() finds, one line a round, and where a click on it goes.
import { isBoard, roundName, type BoardRound, type Game, type Id } from './model';
import type { Place } from './historylabel';
import { toolChosen } from './tools';
import { cardsToFinish } from './partner';
import { slideHasContent } from './usage';
import type { Problem } from './validate';

export interface ChecklistLine {
  text: string;
  level: 'warn' | 'info';
  tab: Problem['tab'];
  /** Every problem it stands for (its tooltip). */
  details: string[];
  /** A round's line: the round's id (it's found by that, as rounds may have moved since the line was worked out). */
  round?: string;
  /** The first thing to finish in it (a board's first unfinished tile, an RPG's screen, a board game's space). */
  place?: Place;
  /** 🗜: files a smaller copy for phones would help (Problem.shrink): the line gets a button for the first. */
  shrink?: Id[];
  /** 🔄: files to convert (Problem.convert): the line gets a button for them all. */
  convert?: Id[];
}

/**
 * A tile that still needs something: a question and an answer, or for a wheel or dice tile, its wheel or dice. A partner
 * clue needs its 🤫 cards filled in too.
 */
function unfinished(game: Game, round: BoardRound, firstOnly = false) {
  const out: { category: string; clue: string }[] = [];
  // Column by column, like the clue editor's Next.
  for (const cat of round.categories)
    for (const c of cat.clues) {
      if (c.empty) continue;
      const tool = c.type === 'wheel' || c.type === 'dice';
      const done = tool ? toolChosen(game, c) : slideHasContent(c.questionSlide) && slideHasContent(c.answerSlide) && cardsToFinish(c) === null;
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
    const shrink = { ...(p.shrink ? { shrink: [p.shrink] } : {}), ...(p.convert?.length ? { convert: [...p.convert] } : {}) };
    if (!round) {
      lines.push({ text: p.text, level: p.level, tab: p.tab, details: [p.text], place: p.place, ...shrink });
      continue;
    }
    const line = byRound.get(p.tab as number);
    if (line) {
      line.details.push(p.text);
      if (p.shrink && !line.shrink?.includes(p.shrink)) line.shrink = [...(line.shrink ?? []), p.shrink];
      for (const id of p.convert ?? []) if (!line.convert?.includes(id)) line.convert = [...(line.convert ?? []), id];
      // (The first warning's place: the first thing worth fixing.)
      if (p.level === 'warn' && line.level !== 'warn' && p.place) line.place = p.place;
      if (p.level === 'warn') line.level = 'warn';
    } else {
      // An RPG's or a board game's problem says where it is (the screen, the space): the line goes there.
      const fresh: ChecklistLine = { text: p.text, level: p.level, tab: p.tab, details: [p.text], round: round.id, place: p.place ?? { tab: 'round', round: round.id }, ...shrink };
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
        const others =
          line.details.length -
          line.details.filter((d) =>
            /clues? with no (question|answer)|wheel\/dice tile|Daily Doubles? not placed yet|partner clues? not placed yet|a written question and answer for one|: card (\d+|“.*”) is empty:|partner clue with no card:/.test(d),
          ).length;
        // (What Start game places: said as it is, not "0 things to fix", with a count of the notes besides, e.g. 🤝 Partner
        // clues asking for more than fits.)
        const unplaced = line.details.map((d) => /: (\d+ (?:Daily Doubles?|partner clues?)) not placed yet/.exec(d)?.[1]).filter((u) => u !== undefined);
        const n = unplaced.reduce((a, u) => a + parseInt(u), 0);
        const besides = line.details.length - unplaced.length;
        line.text = todo.length
          ? `${name}: ${plural(todo.length, 'clue')} to finish${others ? `, ${others} more to fix` : ''}`
          : others
            ? `${name}: ${plural(others, 'thing')} to fix`
            : unplaced.length
              ? `${name}: ${unplaced.join(' and ')} not placed yet (Start game places ${n === 1 ? 'it' : 'them'})${besides ? ` · ${plural(besides, 'more note')}` : ''}`
              : `${name}: ${plural(line.details.length, 'note')}`;
      }
    } else if (line.details.length > 1) line.text = `${name}: ${plural(line.details.length, 'thing')} to fix`;
  }
  return lines;
}
