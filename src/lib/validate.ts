// Pre-game checklist for the editor (spec §5.2 validation panel).
import { canPlay, mediaUrls } from './media.svelte';
import { linkLifetime } from './links';
import { normalizeColor } from './colors';
import { dailyDoublesPlaced, isBoardGame, isFinal, isRpg, isSlides, playableClues, questionSlides, roundName, type Action, type BoardRound, type Game } from './model';
import { rpgProblems } from './rpg';
import { boardGameProblems } from './boardgame';
import { mediaUsage, onlineCount, slideHasContent } from './usage';
import { toolChosen } from './tools';
import type { Place } from './historylabel';
import { categoryTooLong } from './boardfit';
import { statsProblems } from './toolset';
import { actionProblem } from './refs';

export interface Problem {
  text: string;
  /** Where to fix it: an editor tab ('tiebreaker' | 'media' | 'sounds' | 'tools' | 'stats' | round index), or 'play' (the pre-game screen). */
  tab: 'play' | 'tiebreaker' | 'media' | 'sounds' | 'tools' | 'stats' | number;
  level: 'warn' | 'info';
  /** Where in the round it is (the screen, the space…), for the checklist to go to. */
  place?: Place;
  /** What it means in a player-only file, which can't add or swap files (none: the same text). */
  player?: string;
}

/** "1 clue", "3 clues" ("category" → "categories"). */
function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`;
}

/**
 * A board with fewer Daily Doubles on it than its ⭐ Daily Doubles box asks for (🎲 Randomize, or the pre-game
 * screen, places the rest): how many it wants and has. Null when it has them all.
 */
export function dailyDoublesShort(round: BoardRound): { want: number; placed: number } | null {
  const placed = dailyDoublesPlaced(round);
  // No more than placing them can add: one a category, on a standard tile, in a category without one yet.
  const room = round.categories.filter(
    (c) => !c.clues.some((cl) => cl.type === 'dailyDouble' && !cl.empty) && c.clues.some((cl) => !cl.empty && cl.type === 'standard'),
  ).length;
  const want = Math.min(round.dailyDoubleCount ?? 1, playableClues(round).length, placed + room);
  return placed < want ? { want, placed } : null;
}

/** A board with more Daily Doubles placed than its ⭐ Daily Doubles box says (lowered after placing them): both. */
export function dailyDoublesOver(round: BoardRound): { want: number; placed: number } | null {
  const want = round.dailyDoubleCount ?? 1;
  const placed = dailyDoublesPlaced(round);
  return placed > want ? { want, placed } : null;
}

export function validate(game: Game): Problem[] {
  const out: Problem[] = [];
  // Its title shows on stream (the title card, the audience window): a game never named says "Untitled Game" there.
  if (!game.title.trim() || game.title.trim() === 'Untitled Game')
    out.push({ text: 'The game is still called “Untitled Game”: name it (the title shows on stream)', tab: 'play', level: 'info', place: { tab: 'title' } });
  if (!game.players.length) out.push({ text: 'No players yet: add them when you press Play', tab: 'play', level: 'info' });
  const colors = game.players.map((p) => normalizeColor(p.color));
  if (new Set(colors).size !== colors.length) out.push({ text: 'Two players share a color', tab: 'play', level: 'warn' });

  if (!game.rounds.length) out.push({ text: 'No rounds yet: add one to play', tab: 0, level: 'warn' });
  game.rounds.forEach((round, i) => {
    const name = roundName(round, i);
    if (isFinal(round)) {
      // (Each goes to its side.)
      const onSide = (side: 'q' | 'a'): Place => ({ tab: 'round', round: round.id, part: { kind: 'final', side } });
      if (!slideHasContent(round.questionSlide)) out.push({ text: `${name} has no question`, tab: i, level: 'warn', place: onSide('q') });
      if (!slideHasContent(round.answerSlide)) out.push({ text: `${name} has no answer`, tab: i, level: 'warn', place: onSide('a') });
      if (round.wasOff)
        out.push({
          text: `${name} was switched off in the old game: kept because something is written in it, and plays last. Delete the round if it shouldn't play`,
          tab: i,
          level: 'info',
        });
      return;
    }
    if (isRpg(round)) {
      out.push(...rpgProblems(game, round, name, i));
      return;
    }
    if (isBoardGame(round)) {
      out.push(...boardGameProblems(game, round, name, i));
      return;
    }
    if (isSlides(round)) {
      const blank = questionSlides(round).flatMap((s, n) => (slideHasContent(s) ? [] : [n + 1]));
      // (It goes to the first empty one.)
      if (blank.length)
        out.push({
          text: `${name}: slide${blank.length > 1 ? 's' : ''} ${blank.join(', ')} ${blank.length > 1 ? 'are' : 'is'} empty`,
          tab: i,
          level: 'warn',
          place: { tab: 'round', round: round.id, part: { kind: 'slides', ...(blank[0] > 1 ? { slide: round.extraSlides![blank[0] - 2].id } : {}) } },
        });
      return;
    }
    const r = { ...round, name };
    const playable = playableClues(r);
    if (!playable.length) out.push({ text: `${r.name}: no playable tiles`, tab: i, level: 'warn' });
    const unnamed = r.categories.filter((c) => !c.title.trim() && !c.image).length;
    if (unnamed) out.push({ text: `${r.name}: ${plural(unnamed, 'category')} with no name`, tab: i, level: 'warn' });
    // Only a name drawn as text (an image category's caption is smaller and optional).
    const long = r.categories.filter((c) => !c.image && categoryTooLong(c.title, r.categories.length, r.values.length, game.theme));
    if (long.length)
      out.push({
        text: `${r.name}: ${long.length === 1 ? `"${long[0].title.trim()}" is` : `${long.length} category names are`} too long to read on the board (shorten ${long.length === 1 ? 'it' : 'them'})`,
        tab: i,
        level: 'info',
      });
    const tools = playable.filter((c) => c.type === 'wheel' || c.type === 'dice');
    const noQ = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.questionSlide)).length;
    const noA = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.answerSlide)).length;
    if (noQ) out.push({ text: `${r.name}: ${plural(noQ, 'clue')} with no question`, tab: i, level: 'warn' });
    if (noA) out.push({ text: `${r.name}: ${plural(noA, 'clue')} with no answer`, tab: i, level: 'warn' });
    // (The board editor says so on the tile, by the same rule.)
    const broken = tools.filter((c) => !toolChosen(game, c)).length;
    if (broken) out.push({ text: `${r.name}: ${plural(broken, 'wheel/dice tile')} with nothing chosen`, tab: i, level: 'warn' });
    const dds = dailyDoublesShort(round);
    // Not a problem: Start game puts the rest on the board at random (a new board wants 1 and has none).
    if (dds) {
      const n = dds.want - dds.placed;
      out.push({
        text: `${r.name}: ${n} Daily Double${n === 1 ? '' : 's'} not placed yet (Start game puts ${n === 1 ? 'it' : 'them'} on the board at random)`,
        tab: i,
        level: 'info',
      });
    }
    const over = dailyDoublesOver(round);
    if (over)
      out.push({
        text: `${r.name}: ${over.placed} Daily Doubles placed, but ⭐ Daily Doubles says ${over.want} (all ${over.placed} play)`,
        tab: i,
        level: 'info',
      });
  });
  // The tiebreaker once ticked on: a tie at the end offers it as the main button, so an empty one puts a blank slide on stream.
  const tb = game.tiebreaker;
  if (tb) {
    if (!questionSlides(tb).some(slideHasContent))
      out.push({ text: 'The tiebreaker has no question', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'q' } });
    if (!slideHasContent(tb.answerSlide))
      out.push({ text: 'The tiebreaker has no answer', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'a' } });
  }

  out.push(...statsProblems(game), ...toolButtonProblems(game));

  const known = new Set(game.media.map((m) => m.id));
  const usage = mediaUsage(game);
  // Deleted from 🖼 Media but still on slides: they show nothing (and aren't saved with the game).
  const deleted = [...usage.keys()].filter((id) => !known.has(id) && !Object.values(game.audio ?? {}).includes(id));
  if (deleted.length)
    out.push({
      text: `${plural(deleted.length, 'deleted file')} still used (${plural(deleted.reduce((n, id) => n + (usage.get(id) ?? 0), 0), 'place')}): not saved with the game. Undo the delete, or take ${deleted.length === 1 ? 'it' : 'them'} off those slides`,
      tab: 'media',
      level: 'warn',
      player: `${plural(deleted.length, 'file')} used on slides but missing from this game: ask whoever made it for a new copy`,
    });
  const missing = new Set([...[...usage.keys()].filter((id) => !known.has(id) && !deleted.includes(id)), ...game.media.filter((m) => !mediaUrls[m.id]).map((m) => m.id)]);
  // A sound's missing file is said on its own, pointing to 🔊 Sounds (the built-in sound plays meanwhile).
  const cues = new Set(Object.values(game.audio ?? {}).filter((id): id is string => !!id && missing.has(id)));
  if (cues.size)
    out.push({
      text: `${plural(cues.size, 'sound file')} missing: see 🔊 Sounds`,
      tab: 'sounds',
      level: 'warn',
      player: `${plural(cues.size, 'sound file')} missing from this game (the built-in sound plays instead)`,
    });
  const others = [...missing].filter((id) => !cues.has(id)).length;
  if (others)
    out.push({
      text: `${plural(others, 'media file')} missing`,
      tab: 'media',
      level: 'warn',
      player: `${plural(others, 'media file')} missing from this game: ask whoever made it for a new copy`,
    });
  // (A live link already played when it was added; its type is often unknown from the address.)
  const unplayable = game.media.filter((m) => !m.url && (m.kind === 'video' || m.kind === 'audio') && !canPlay(m.mime)).length;
  if (unplayable) out.push({ text: `${plural(unplayable, 'video/audio file')} this browser may not play`, tab: 'media', level: 'warn' });

  const links = game.media.filter((m) => m.url);
  const online = onlineCount(game);
  if (online) out.push({ text: `${online} item${online === 1 ? ' plays' : 's play'} from the internet: need internet during the game`, tab: 'media', level: 'info' });
  const life = links.map((m) => linkLifetime(m));
  const expired = life.filter((l) => l === 'expired').length;
  const temporary = life.filter((l) => l === 'temporary').length;
  if (expired)
    out.push({
      text: `${plural(expired, 'online link')} expired: add ${expired === 1 ? 'that file' : 'those files'} again`,
      tab: 'media',
      level: 'warn',
      player: `${plural(expired, 'online link')} expired: ask whoever made this game for a new copy`,
    });
  if (temporary)
    out.push({
      text: `${plural(temporary, 'online link')} ${temporary === 1 ? 'stops' : 'stop'} working soon (temporary upload sites): save a copy or add the files`,
      tab: 'media',
      level: 'warn',
      player: `${plural(temporary, 'online link')} ${temporary === 1 ? 'stops' : 'stop'} working soon (temporary upload sites)`,
    });
  return out;
}

/**
 * Items' Use buttons, wheel slices' and dice's buttons that point at something deleted (a shop, a stat, an item, a
 * wheel) or at nothing: in play they only say why they can't. (RPG objects' and board spaces' are their rounds'.)
 */
export function toolButtonProblems(game: Game): Problem[] {
  const out: Problem[] = [];
  const why = (list: (Action[] | undefined)[]): string | null => {
    for (const a of list.flatMap((l) => l ?? [])) {
      const p = actionProblem(game, a);
      if (p) return p.replace(/^That /, 'its ').replace(/^No /, 'no ');
    }
    return null;
  };
  for (const it of game.items ?? []) {
    const p = why([it.onUse]);
    if (p) out.push({ text: `Item “${it.name}”: a Use button points nowhere (${p})`, tab: 'stats', level: 'warn', place: { tab: 'stats', item: it.id } });
  }
  for (const w of game.wheels) {
    const p = why(w.segments.map((s) => s.actions));
    if (p) out.push({ text: `Wheel “${w.name}”: a slice's button points nowhere (${p})`, tab: 'tools', level: 'warn', place: { tab: 'tools', wheel: w.id } });
  }
  for (const d of game.dice) {
    const p = why([...d.dice.flatMap((x) => (x.customFaces ?? []).map((f) => f.actions)), ...(d.totalOutcomes ?? []).map((t) => t.outcome.actions)]);
    if (p) out.push({ text: `Dice “${d.name}”: a button points nowhere (${p})`, tab: 'tools', level: 'warn', place: { tab: 'tools', dice: d.id } });
  }
  return out;
}
