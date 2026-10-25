// Pre-game checklist for the editor (spec §5.2 validation panel).
import { canPlay, formatBytes, mediaUrls } from './media.svelte';
import { article, linkLifetime } from './links';
import { normalizeColor } from './colors';
import {
  boardRounds,
  cardSlides,
  categoryLabel,
  clueCardName,
  clueCardWords,
  clueValue,
  dailyDoublesPlaced,
  formatPoints,
  isBoardGame,
  isFinal,
  isRpg,
  isSlides,
  MAX_CARDS,
  PARTNER_GAMES,
  partnerTilesPlaced,
  playableClues,
  questionSlides,
  roundName,
  savedCardName,
  slidesOfClue,
  type Action,
  type BoardRound,
  type Choice,
  type ClueCard,
  type FinalRound,
  type Game,
  type Id,
  type MediaRef,
  type Slide,
} from './model';
import { lowerWord, partnerRules, partnerSpot, partWords, stealOn } from './partner';
import { ANY_SERVER, cardItems, cardWords, phoneCard, sendsOf } from './phonecard';
import { CARD_TEXT_MAX, CHOICE_MAX, cleanName, DEFAULT_FILE_LIMITS } from './buzzproto';
import { rightChoice, usableChoices } from './choices';
import { rpgProblems, worldById } from './rpg';
import { boardGameProblems } from './boardgame';
import { mediaPath, mediaUsage, onlineCount, slideHasContent, slideMediaIds } from './usage';
import { toolChosen } from './tools';
import { placeAt, type Place } from './historylabel';
import { categoryTooLong } from './boardfit';
import { statsProblems } from './toolset';
import { actionProblem, objectsWhere } from './refs';
import { dealSetupProblems, partName } from './deals';
import type { Verdict } from './shrink/playable';
import { aOrAn, fixBoxName } from './shrink/words';

export interface Problem {
  text: string;
  /**
   * Where to fix it: an editor tab ('tiebreaker' | 'media' | 'sounds' | 'tools' | 'cards' | 'stats' | round index), or
   * 'play' (the pre-game screen).
   */
  tab: 'play' | 'tiebreaker' | 'media' | 'sounds' | 'tools' | 'cards' | 'stats' | number;
  level: 'warn' | 'info';
  /** Where in the round it is (the screen, the space…), for the checklist to go to. */
  place?: Place;
  /** What it means in a player-only file, which can't add or swap files (none: the same text). */
  player?: string;
  /** 🗜: the file to make a smaller copy of for phones (the editor's checklist line gets a button for it). */
  shrink?: Id;
  /** 🔄: the files to convert, so they play here (or ↻: so phones can open them); the editor's line gets a button. */
  convert?: Id[];
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
  const want = Math.min(round.dailyDoubleCount ?? 1, dailyDoublesMost(round));
  return placed < want ? { want, placed } : null;
}

/**
 * The most Daily Doubles a board can have once the rest are placed: those on it, and no more than placing them can
 * add (one a category, on a standard tile, in a category without one yet).
 */
export function dailyDoublesMost(round: BoardRound): number {
  const room = round.categories.filter(
    (c) => !c.clues.some((cl) => cl.type === 'dailyDouble' && !cl.empty) && c.clues.some((cl) => !cl.empty && cl.type === 'standard'),
  ).length;
  return Math.min(playableClues(round).length, dailyDoublesPlaced(round) + room);
}

/** A board with more Daily Doubles placed than its ⭐ Daily Doubles box says (lowered after placing them): both. */
export function dailyDoublesOver(round: BoardRound): { want: number; placed: number } | null {
  const want = round.dailyDoubleCount ?? 1;
  const placed = dailyDoublesPlaced(round);
  return placed > want ? { want, placed } : null;
}

/**
 * A board with fewer 🤝 partner clues on it than its 🤝 Partner clues box asks for (🔀 Randomize, or Start game, places
 * the rest): how many it wants (no more than there are tiles to put them on: a written question and answer), has, and
 * can have at most. Null with no count, or when it has them all.
 */
export function partnerTilesShort(round: BoardRound): { want: number; placed: number; most: number } | null {
  if (!round.partnerCount) return null;
  const placed = partnerTilesPlaced(round);
  const most = placed + round.categories.reduce((n, c) => n + c.clues.filter(partnerSpot).length, 0);
  const want = Math.min(round.partnerCount, most);
  return placed < want || most < round.partnerCount ? { want, placed, most } : null;
}

/** A board with more partner clues than its 🤝 Partner clues box says (made by hand, or the box lowered): both. */
export function partnerTilesOver(round: BoardRound): { want: number; placed: number } | null {
  if (!round.partnerCount) return null;
  const placed = partnerTilesPlaced(round);
  return placed > round.partnerCount ? { want: round.partnerCount, placed } : null;
}

/**
 * What the buzzer server in use takes, for what of a 🤫 card won't reach a phone. `filesOff`: the room open now puts
 * cards on phones but takes no files (its server is off them, or out of budget for now), or the server said it takes
 * none: a card's file from this computer won't reach a phone. `fileBytes`: the biggest file it takes
 * (serverlimits.svelte.ts fileLimitsNow; DEFAULT_FILE_LIMITS when not given). `stored` and `gifs`: which 🗜 copies for
 * phones go (PhoneCan). `canShrink`: 🗜 can make a smaller copy of this file here (the editor's checklist only): its
 * lines say so, and get a button.
 */
export interface CardRoom {
  filesOff?: boolean;
  fileBytes?: number;
  stored?: (id: Id) => boolean;
  gifs?: boolean;
  canShrink?: (ref: MediaRef) => boolean;
  /**
   * Whether a stored video or sound plays in this browser, as worked out from what's inside it (checks.svelte.ts
   * knownVerdict; undefined: not yet, and its type says). A file phones can't open that ↻ can repackage gets
   * Problem.convert.
   */
  plays?: (m: MediaRef) => Verdict | undefined;
  /** False where there's no ↻ (in play): a file phones can't open that ↻ would repackage gets 🗜's words instead. */
  repack?: boolean;
}

/** What validate goes by: the buzzer server in use, and whether files play here (CardRoom). */
export type Checking = CardRoom;

/** The checklist's problems for `game`, as the buzzer server in use (`room`) would have them. */
export function validate(game: Game, room: Checking = {}): Problem[] {
  const out: Problem[] = [];
  // Its title shows on stream (the title card, the audience window): a game never named says "Untitled Game" there.
  if (!game.title.trim() || game.title.trim() === 'Untitled Game')
    out.push({ text: 'The game is still called “Untitled Game”: name it (the title shows on stream)', tab: 'play', level: 'info', place: { tab: 'title' } });
  // (Phone buzzer teams: each one is a team.)
  const who = game.settings.buzzer && game.settings.buzzTeams ? 'teams' : 'players';
  if (!game.players.length) out.push({ text: `No ${who} yet: add them when you press Play`, tab: 'play', level: 'info' });
  const colors = game.players.map((p) => normalizeColor(p.color));
  if (new Set(colors).size !== colors.length) out.push({ text: `Two ${who} share a color`, tab: 'play', level: 'warn' });

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
      out.push(...finalCardProblems(game, round, name, i, room));
      out.push(...finalChoiceProblems(round, name, i));
      return;
    }
    if (isRpg(round)) {
      out.push(...rpgProblems(game, round, name, i));
      // (Its objects' 🤫 Send a card buttons. A screen's looks have copies of its objects, with the same names: each line
      // is said once, going to the first, the screen's own.)
      const world = worldById(game, round.world);
      const said = new Set<string>();
      if (world)
        for (const { el, map, screen, look } of objectsWhere(world)) {
          const what = el.name?.trim() ? `“${el.name.trim()}”` : 'an object';
          const place: Place = { tab: 'world', world: world.id, map: map.id, screen: screen.id, look, inSlide: true, element: el.id };
          for (const p of cardLines(game, cardsIn(el.role?.actions), `${name}: a 🤫 card on ${what} on “${screen.name}”`, i, place, room)) {
            if (said.has(p.text)) continue;
            said.add(p.text);
            out.push(p);
          }
        }
      return;
    }
    if (isBoardGame(round)) {
      out.push(...boardGameProblems(game, round, name, i));
      for (const s of round.spaces)
        out.push(...cardLines(game, cardsIn(s.onLand, s.onPass), `${name}: a 🤫 card on “${s.name}”`, i, { tab: 'round', round: round.id, part: { kind: 'space', space: s.id } }, room));
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
        text: `${r.name}: ${over.placed} Daily Double${over.placed === 1 ? '' : 's'} placed, but ⭐ Daily Doubles says ${over.want} (${over.placed === 1 ? 'it plays' : `all ${over.placed} play`})`,
        tab: i,
        level: 'info',
      });
    const pts = partnerTilesShort(round);
    // Not a problem either: Start game puts the rest on the board at random, where there are written clues for them.
    if (pts && pts.placed < pts.want) {
      const n = pts.want - pts.placed;
      out.push({
        text: `${r.name}: ${n} partner clue${n === 1 ? '' : 's'} not placed yet (Start game puts ${n === 1 ? 'it' : 'them'} on the board at random)`,
        tab: i,
        level: 'info',
      });
    }
    if (pts && pts.most < (round.partnerCount ?? 0))
      out.push({
        text: `${r.name}: 🤝 Partner clues says ${round.partnerCount}, but only ${pts.most} tile${pts.most === 1 ? ' has' : 's have'} a written question and answer for one (partner clues never go on a Daily Double)`,
        tab: i,
        level: 'info',
      });
    const ptOver = partnerTilesOver(round);
    if (ptOver)
      out.push({
        text: `${r.name}: ${ptOver.placed} partner clue${ptOver.placed === 1 ? '' : 's'} placed, but 🤝 Partner clues says ${ptOver.want} (${ptOver.placed === 1 ? 'it plays' : `all ${ptOver.placed} play`})`,
        tab: i,
        level: 'info',
      });
    out.push(...partnerProblems(game, round, i, room));
    out.push(...boardChoiceProblems(round, r.name, i));
  });
  // The tiebreaker once ticked on: a tie at the end offers it as the main button, so an empty one puts a blank slide on stream.
  const tb = game.tiebreaker;
  if (tb) {
    if (!questionSlides(tb).some(slideHasContent))
      out.push({ text: 'The tiebreaker has no question', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'q' } });
    if (!slideHasContent(tb.answerSlide))
      out.push({ text: 'The tiebreaker has no answer', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'a' } });
  }

  out.push(...statsProblems(game), ...toolButtonProblems(game, room), ...savedCardProblems(game, room));

  const known = new Set(game.media.map((m) => m.id));
  const usage = mediaUsage(game);
  // Files only 🤫 cards use: an older copy's 🗑 Delete unused doesn't see cards, so it would delete them.
  const onCards = new Map<string, number>();
  for (const r of boardRounds(game))
    for (const c of r.categories)
      for (const cl of c.clues) for (const card of cardSlides(cl)) for (const id of slideMediaIds(card)) onCards.set(id, (onCards.get(id) ?? 0) + 1);
  // (A Final's too.)
  for (const r of game.rounds)
    if (isFinal(r)) for (const card of cardSlides(r)) for (const id of slideMediaIds(card)) onCards.set(id, (onCards.get(id) ?? 0) + 1);
  for (const c of game.cards ?? []) for (const id of slideMediaIds(c)) onCards.set(id, (onCards.get(id) ?? 0) + 1);
  const cardOnly = [...onCards].filter(([id, n]) => known.has(id) && usage.get(id) === n).length;
  if (cardOnly)
    out.push({
      text: `${plural(cardOnly, 'file')} ${cardOnly === 1 ? 'is' : 'are'} used only on 🤫 cards. Older copies of the app don't know about cards: in one of them, 🖼 Media › 🗑 Delete unused would delete ${cardOnly === 1 ? 'it' : 'them'}. Open the game in an up-to-date copy before deleting unused files`,
      tab: 'media',
      level: 'info',
    });
  const partners = boardRounds(game).flatMap((r) => playableClues(r).filter((c) => c.type === 'partner'));
  if (partners.length && !game.settings.buzzer)
    out.push({ text: 'Partner clues: without phone buzzers you copy the cards to the players yourself', tab: 'play', level: 'info' });
  // Multiple choice with nobody on phones: the choices still show on stream, under the question.
  const choices =
    boardRounds(game).some((r) => playableClues(r).some((c) => c.type === 'standard' && c.everyone && usableChoices(c.choices).length)) ||
    game.rounds.some((r) => isFinal(r) && !r.phoneAnswersOff && usableChoices(r.choices).length);
  if (choices && !game.settings.buzzer)
    out.push({ text: 'Multiple choice: without phone buzzers, the choices show on stream and players say the letter', tab: 'play', level: 'info' });
  // Steal on a miss with nobody buzzing: the host picks who steals.
  const steals = partners.filter((c) => stealOn(partnerRules(c), game.settings)).length;
  if (steals && !game.settings.buzzer)
    out.push({
      text: `${plural(steals, 'partner clue')} let${steals === 1 ? 's' : ''} the others steal on a miss: without phone buzzers you pick who steals (their number, then Enter)`,
      tab: 'play',
      level: 'info',
    });
  // A file's uses other than as a 🔊 Sounds cue (on slides, tiles, wheels…): those lines say where; the cue's says 🔊 Sounds.
  const cueUses = (id: string) => Object.values(game.audio ?? {}).filter((x) => x === id).length;
  const otherUses = (id: string) => (usage.get(id) ?? 0) - cueUses(id);
  // Deleted from 🖼 Media but still on slides: they show nothing (and aren't saved with the game).
  const deleted = [...usage.keys()].filter((id) => !known.has(id) && otherUses(id) > 0);
  if (deleted.length) {
    // Where the first is still used ("Introduction › Slide 1 › Image"): named, and the line goes there.
    const path = mediaPath(game, deleted[0]);
    const at = path ? placeAt(game, path) : null;
    const uses = deleted.reduce((n, id) => n + otherUses(id), 0);
    const where = at?.crumbs.length ? ` on ${at.crumbs.join(' › ')}${uses > 1 ? ` and ${plural(uses - 1, 'more place')}` : ''}` : ` (${plural(uses, 'place')})`;
    out.push({
      text: `${plural(deleted.length, 'deleted file')} still used${where}: not saved with the game. Undo the delete in History, or take ${deleted.length === 1 ? 'it' : 'them'} off ${uses === 1 ? 'there' : 'those slides'}`,
      tab: 'media',
      level: 'warn',
      ...(at?.place ? { place: at.place } : {}),
      player: `${plural(deleted.length, 'file')} used on slides but missing from this game: ask whoever made it for a new copy`,
    });
  }
  // (A 🗜 copy for phones whose bytes are missing isn't: phones get its file.)
  const missing = new Set([...[...usage.keys()].filter((id) => !known.has(id) && !deleted.includes(id)), ...game.media.filter((m) => !m.phoneCopy && !mediaUrls[m.id]).map((m) => m.id)]);
  // A sound's missing (or deleted) file is said on its own, pointing to 🔊 Sounds (the built-in sound plays meanwhile).
  const cues = new Set(Object.values(game.audio ?? {}).filter((id): id is string => !!id && (missing.has(id) || deleted.includes(id))));
  if (cues.size)
    out.push({
      text: `${plural(cues.size, 'sound file')} missing: see 🔊 Sounds`,
      tab: 'sounds',
      level: 'warn',
      player: `${plural(cues.size, 'sound file')} missing from this game (the built-in sound plays instead)`,
    });
  // (A cue's file used on a slide too: that slide shows nothing, so it's said here as well.)
  const others = [...missing].filter((id) => !cues.has(id) || otherUses(id) > 0);
  if (others.length) {
    // (A player-only file has no 🖼 Media: it names where the first one used was, which shows nothing now.)
    const path = others.map((id) => mediaPath(game, id)).find((p) => !!p);
    const crumbs = path ? placeAt(game, path).crumbs : [];
    const on = crumbs.length ? ` (${others.length === 1 ? 'on' : 'one on'} ${crumbs.join(' › ')})` : '';
    out.push({
      text: `${plural(others.length, 'media file')} missing`,
      tab: 'media',
      level: 'warn',
      player: `${plural(others.length, 'media file')} missing from this game${on}: ask whoever made it for a new copy`,
    });
  }
  // Videos and sounds this browser won't play, or plays without their sound: as worked out from what's inside them
  // (`room.plays`), else as their type says. (A live link already played when it was added; its type is often unknown
  // from the address.)
  // (🔄 Convert can fix some: the line says so and gets a button; for the others, 🖼 Media says why.)
  const convert: Id[] = [];
  let fails = 0;
  let silent = 0;
  let unsure = 0;
  for (const m of game.media) {
    if (m.url || m.phoneCopy || (m.kind !== 'video' && m.kind !== 'audio')) continue;
    const v = room.plays?.(m);
    if (v?.is === 'fails' && v.fix) convert.push(m.id);
    else if (v?.is === 'fails') fails++;
    else if (v?.is === 'silent') silent++;
    else if ((!v || v.is === 'unknown') && !canPlay(m.mime)) unsure++;
  }
  const them = (n: number) => (n === 1 ? 'it' : 'them');
  if (convert.length)
    out.push({ text: `${plural(convert.length, 'video/audio file')} won’t play in this browser: 🔄 Convert ${them(convert.length)} in 🖼 Media`, tab: 'media', level: 'warn', convert });
  if (fails) out.push({ text: `${plural(fails, 'video/audio file')} won’t play in this browser, and it can’t convert ${them(fails)}: 🖼 Media says why`, tab: 'media', level: 'warn' });
  if (silent)
    out.push({ text: `${plural(silent, 'video')} play${silent === 1 ? 's' : ''} without ${silent === 1 ? 'its' : 'their'} sound in this browser (🖼 Media says why)`, tab: 'media', level: 'warn' });
  if (unsure) out.push({ text: `${plural(unsure, 'video/audio file')} this browser may not play`, tab: 'media', level: 'warn' });

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
 * A board's 🤫 cards (partner-clues spec §5.6): a ready-made 🤝 partner game with no card (the giver has nothing to go
 * on); on any tile, an empty card, more cards than a clue holds, a card's online link that has stopped working or soon
 * will, what of a card won't reach a phone (`room`: what the buzzer server in use takes), and its name
 * (cardNameProblems). Each goes to its card.
 */
export function partnerProblems(game: Game, round: BoardRound, tab: number, room: CardRoom = {}): Problem[] {
  const out: Problem[] = [];
  const sym = game.settings.currencySymbol;
  for (const c of round.categories)
    c.clues.forEach((cl, row) => {
      // (Any tile's cards: a partner clue's, or a standard or Daily Double tile's own.)
      if (cl.empty || (cl.type !== 'partner' && !cardSlides(cl).length)) return;
      const tile = `${categoryLabel(c)} ${formatPoints(clueValue(round, row, cl), sym)}`;
      const at = (card?: ClueCard): Problem['place'] => ({
        tab: 'round',
        round: round.id,
        part: { kind: 'clue', category: c.id, clue: cl.id, ...(card ? { side: 'card' as const, slide: card.id } : {}) },
      });
      const warn = (text: string, card?: ClueCard) => out.push({ text, tab, level: 'warn', place: at(card) });
      const rules = partnerRules(cl);
      const cards = cardSlides(cl);
      // (A Custom game's cards are up to the host.)
      if (cl.type === 'partner' && !cards.length && rules.game !== 'custom') {
        const g = PARTNER_GAMES[rules.game];
        warn(`${tile} is ${article(g.label)} ${g.label} partner clue with no card: the ${lowerWord(partWords(rules).giver)} has nothing to ${g.task}`);
      }
      if (cards.length > MAX_CARDS) warn(`${tile} has ${cards.length} cards: a clue holds ${MAX_CARDS} (＋ Card adds no more)`, cards[MAX_CARDS]);
      cards.forEach((card, n) => {
        if (!slideHasContent(card)) warn(`${tile}: ${clueCardWords(card, n)} is empty: there's nothing on it to send`, card);
        out.push(...cardLines(game, [card], `${tile}: ${clueCardWords(card, n)}`, tab, at(card)!, room));
      });
      out.push(...cardNameProblems(game, cards, slidesOfClue(cl), tile, tab, (card) => at(card)!));
    });
  return out;
}

/** What's off with a ✍ clue's multiple choices: one with no words, only one, two the same, none marked ✔ Right. */
export function choiceFaults(list: readonly Choice[]): { empty: boolean; one: boolean; same: boolean; noRight: boolean } {
  const words = list.map((c) => cleanName(c.text, CHOICE_MAX).toLowerCase());
  const said = words.filter(Boolean);
  const usable = usableChoices(list);
  return { empty: said.length < words.length, one: list.length === 1, same: new Set(said).size < said.length, noRight: usable.length >= 2 && !rightChoice(usable) };
}

/**
 * A board's ✍ clues with multiple choices (standard tiles with ✍ ticked: other tiles don't use them) that have an
 * empty choice, only one, two the same (warnings), or none marked ✔ Right (only a note: the host judges each answer).
 * Each goes to the first such tile.
 */
function boardChoiceProblems(round: BoardRound, name: string, tab: number): Problem[] {
  const found = { empty: [] as Place[], one: [] as Place[], same: [] as Place[], noRight: [] as Place[] };
  for (const c of round.categories)
    for (const cl of c.clues) {
      if (cl.empty || cl.type !== 'standard' || !cl.everyone || !cl.choices?.length) continue;
      const f = choiceFaults(cl.choices);
      const place: Place = { tab: 'round', round: round.id, part: { kind: 'clue', category: c.id, clue: cl.id } };
      for (const k of ['empty', 'one', 'same', 'noRight'] as const) if (f[k]) found[k].push(place);
    }
  const line = (k: keyof typeof found, words: string, level: Problem['level']): Problem[] =>
    found[k].length ? [{ text: `${name}: ${plural(found[k].length, '✍ clue')} with ${words}`, tab, level, place: found[k][0] }] : [];
  return [
    ...line('empty', 'an empty choice', 'warn'),
    ...line('one', 'only one choice (add another, or take it off)', 'warn'),
    ...line('same', 'two choices the same', 'warn'),
    ...line('noRight', 'choices but none marked ✔ Right (you judge each answer)', 'info'),
  ];
}

/**
 * A Final's multiple choices, while its players type their answers on their phones (unticked, they're kept, unused): as
 * a ✍ clue's, each said once.
 */
function finalChoiceProblems(round: FinalRound, name: string, tab: number): Problem[] {
  if (round.phoneAnswersOff || !round.choices?.length) return [];
  const f = choiceFaults(round.choices);
  const place: Place = { tab: 'round', round: round.id };
  const lines: [keyof typeof f, string, Problem['level']][] = [
    ['empty', 'has an empty choice', 'warn'],
    ['one', 'has only one choice (add another, or take it off)', 'warn'],
    ['same', 'has two choices the same', 'warn'],
    ['noRight', 'has choices but none marked ✔ Right (the reveals won’t say whose pick is right)', 'info'],
  ];
  return lines.flatMap(([k, words, level]) => (f[k] ? [{ text: `${name} ${words}`, tab, level, place }] : []));
}

/**
 * A Final's 🤫 cards (`name`: the round's, "Final Jeopardy!"): more than MAX_CARDS, an empty one, what of one won't reach
 * a phone (`room`: what the buzzer server in use takes), and their names (cardNameProblems). Each goes to its card.
 */
export function finalCardProblems(game: Game, round: FinalRound, name: string, tab: number, room: CardRoom = {}): Problem[] {
  const out: Problem[] = [];
  const cards = cardSlides(round);
  const at = (card: ClueCard): Place => ({ tab: 'round', round: round.id, part: { kind: 'final', side: 'card', slide: card.id } });
  const warn = (text: string, card: ClueCard) => out.push({ text, tab, level: 'warn', place: at(card) });
  if (cards.length > MAX_CARDS) warn(`${name} has ${cards.length} cards: a Final holds ${MAX_CARDS} (＋ Card adds no more)`, cards[MAX_CARDS]);
  cards.forEach((card, n) => {
    if (!slideHasContent(card)) warn(`${name}: ${clueCardWords(card, n)} is empty: there's nothing on it to send`, card);
    out.push(...cardLines(game, [card], `${name}: ${clueCardWords(card, n)}`, tab, at(card), room));
  });
  out.push(...cardNameProblems(game, cards, slidesOfClue(round), name, tab, at));
  return out;
}

/**
 * A tile's or a Final's card names (`where`: "Movies $200", "Final Jeopardy!"): one that repeats what's on its card or
 * on `secret` (the tile's or the Final's question and answer slides: a Final's cards, and a Daily Double's, are in the
 * panel before its question is shown), and two cards that read alike (one with no name is "Card 2"; said once, going
 * to the second). Info only.
 */
function cardNameProblems(game: Game, cards: ClueCard[], secret: Slide[], where: string, tab: number, at: (c: ClueCard) => Place): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  const told = new Set<string>();
  cards.forEach((c, i) => {
    if (nameGivesAway(game, c, secret))
      out.push({ text: `${where}: the name of ${clueCardWords(c, i)} repeats what’s on it, the question or the answer, and in one window viewers can read a card’s name in the host panel`, tab, level: 'info', place: at(c) });
    const key = clueCardName(c, i).toLowerCase();
    if (seen.has(key) && !told.has(key)) {
      told.add(key);
      out.push({ text: `${where} has two cards called “${clueCardName(c, i)}”: in the host panel you can’t tell them apart`, tab, level: 'info', place: at(c) });
    }
    seen.add(key);
  });
  return out;
}

/** What phoneCard's kinds of thing are called in the checklist. */
const KIND = { picture: 'picture', gif: 'GIF', video: 'video', sound: 'sound', embed: 'online video' } as const;

/** One of cardFileProblems' lines, "… has <text>": a warning, or a note ('info': the editor's checklist only). */
interface CardFileProblem {
  text: string;
  level: 'warn' | 'info';
  /** What it means in a player-only file, which can't add or swap files (none: the same text). */
  player?: string;
  /** 🗜: the file a smaller copy for phones would help (Problem.shrink). */
  shrink?: Id;
  /** ↻: the file to repackage for phones (Problem.convert). */
  convert?: Id[];
}

/**
 * What of a 🤫 card won't reach a phone or will stop working, as "… has <this>": an online link that has expired or soon
 * will, and (spec §5.6, §13.5) a file too big for the buzzer server in use (`room.fileBytes`) or of a kind phones
 * can't play, a file from this computer when that server takes none (`room.filesOff`), words past CARD_TEXT_MAX. A
 * file that goes but is big (phoneCard's `slow`) is a note: phones on mobile data may wait for it.
 */
function cardFileProblems(game: Game, card: Slide, room: CardRoom): CardFileProblem[] {
  const out: CardFileProblem[] = [];
  const warn = (text: string, player?: string) => out.push({ text, level: 'warn', ...(player ? { player } : {}) });
  const life = slideMediaIds(card).flatMap((id) => {
    const m = game.media.find((x) => x.id === id);
    return m?.url ? [linkLifetime(m)] : [];
  });
  if (life.includes('expired')) warn('an online link that has expired: add that file again');
  else if (life.includes('temporary')) warn('an online link that stops working soon: save a copy or add the file');
  const fileBytes = room.fileBytes ?? DEFAULT_FILE_LIMITS.fileBytes;
  for (const it of phoneCard(game, card, { files: room.filesOff ? null : {}, fileBytes, stored: room.stored, gifs: room.gifs }).items) {
    // (The size of what goes: its 🗜 copy when that's it.)
    const size = formatBytes(game.media.find((m) => m.id === sendsOf(it))?.size ?? 0);
    const ref = game.media.find((m) => m.id === it.media);
    const shrink = ref && room.canShrink?.(ref) ? { shrink: ref.id } : {};
    if (it.why === 'big') {
      const big = `a ${KIND[it.kind]} too big to send to phones (${size}; this buzzer server takes files up to ${formatBytes(fileBytes)})`;
      out.push({
        text: `${big}: ${shrink.shrink ? 'make a smaller copy for phones (🗜) or add it from a link' : 'add it from a link instead'}`,
        level: 'warn',
        player: `${big}: the host shows it on stream instead`,
        ...shrink,
      });
    } else if (it.why === 'kind' && it.file) {
      const types = 'add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link';
      // (The same video and sound in a type phones open, nothing lost: one file, so no copy is needed.)
      const v = ref ? room.plays?.(ref) : undefined;
      const repack = v?.is === 'plays' && room.repack !== false ? v.repack : null;
      if (ref && repack) out.push({ text: `a ${KIND[it.kind]} phones can't open: repackage it as ${aOrAn(fixBoxName(repack.box))} (↻, nothing lost), or ${types}`, level: 'warn', convert: [ref.id] });
      else out.push({ text: `a ${KIND[it.kind]} phones can't play: ${shrink.shrink ? `make a copy they can play (🗜), or ${types}` : types}`, level: 'warn', ...shrink });
    }
    else if (it.why === 'nofiles') warn(`a ${KIND[it.kind]} that's a file on this computer, and this buzzer server isn't taking files: phones get the words and links only (📋 Copy picture)`);
    else if (it.slow) out.push({ text: `a ${KIND[it.kind]} of ${size}: phones on mobile data may wait a while for it (WiFi is fine)`, level: 'info', ...shrink });
  }
  if ([...cardWords(card)].length > CARD_TEXT_MAX) warn(`more than ${CARD_TEXT_MAX} characters of words: phones get the first ${CARD_TEXT_MAX}`);
  return out;
}

/** The cards of the 🤫 Send a card buttons in some lists of buttons. */
const cardsIn = (...lists: (Action[] | undefined)[]): Slide[] => lists.flatMap((l) => l ?? []).flatMap((a) => (a.do === 'card' ? [a.slide] : []));

/** The cardFileProblems of some cards, each said once: "<says> has <this>", going to `place`, each at its own level. */
function cardLines(game: Game, cards: Slide[], says: string, tab: Problem['tab'], place: Place, room: CardRoom): Problem[] {
  const seen = new Set<string>();
  return cards
    .flatMap((c) => cardFileProblems(game, c, room))
    .filter((p) => !seen.has(p.text) && !!seen.add(p.text))
    .map((p) => ({
      text: `${says} has ${p.text}`,
      tab,
      level: p.level,
      place,
      ...(p.player ? { player: `${says} has ${p.player}` } : {}),
      ...(p.shrink ? { shrink: p.shrink } : {}),
      ...(p.convert ? { convert: p.convert } : {}),
    }));
}

/**
 * Items' Use buttons, wheel slices' and dice's buttons that point at something deleted (a shop, a stat, an item, a
 * wheel) or at nothing: in play they only say why they can't. Also their 🤫 cards, and 🎭 deals' parts' cards, that
 * won't reach a phone as they are (cardFileProblems; `room`: what the buzzer server in use takes). (RPG objects' and
 * board spaces' are their rounds'.)
 */
export function toolButtonProblems(game: Game, room: CardRoom = {}): Problem[] {
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
    const place: Place = { tab: 'stats', item: it.id };
    if (p) out.push({ text: `Item “${it.name}”: a Use button points nowhere (${p})`, tab: 'stats', level: 'warn', place });
    out.push(...cardLines(game, cardsIn(it.onUse), `Item “${it.name}”: a Use button’s 🤫 card`, 'stats', place, room));
  }
  for (const w of game.wheels) {
    const p = why(w.segments.map((s) => s.actions));
    const place: Place = { tab: 'tools', wheel: w.id };
    if (p) out.push({ text: `Wheel “${w.name}”: a slice's button points nowhere (${p})`, tab: 'tools', level: 'warn', place });
    out.push(...cardLines(game, cardsIn(...w.segments.map((s) => s.actions)), `Wheel “${w.name}”: a slice’s 🤫 card`, 'tools', place, room));
  }
  for (const d of game.dice) {
    const lists = [...d.dice.flatMap((x) => (x.customFaces ?? []).map((f) => f.actions)), ...(d.totalOutcomes ?? []).map((t) => t.outcome.actions)];
    const p = why(lists);
    const place: Place = { tab: 'tools', dice: d.id };
    if (p) out.push({ text: `Dice “${d.name}”: a button points nowhere (${p})`, tab: 'tools', level: 'warn', place });
    out.push(...cardLines(game, cardsIn(...lists), `Dice “${d.name}”: a 🤫 card`, 'tools', place, room));
  }
  // 🎭 Deals that can't be dealt as they are, and parts' cards that won't reach a phone as they are.
  for (const dl of game.deals ?? []) {
    const place: Place = { tab: 'tools', deal: dl.id };
    for (const p of dealSetupProblems(game, dl)) out.push({ text: `Deal “${dl.name}”: ${p}`, tab: 'tools', level: 'warn', place });
    dl.parts.forEach((part, i) => out.push(...cardLines(game, [part.card], `Deal “${dl.name}”: ${partName(part, i)}’s card`, 'tools', place, room)));
  }
  return out;
}

/** Words to compare, as a name says them: lower case, anything but letters and digits a single space. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * A 🤫 card's name repeats what's on it (its words, its phone title, or a file's name, at least 3 letters) or what's in
 * `also` (a tile's or a Final's question and answer slides): in one window viewers read a card's name in the host panel
 * and 🤫 Send a card…. ("Mission 1" on "Your mission: …" doesn't.)
 */
export function nameGivesAway(game: Game, c: Slide & { name?: string }, also: Slide[] = []): boolean {
  const name = norm(c.name ?? '');
  if (!name) return false;
  const bits = [
    cardWords(c),
    phoneCard(game, c, ANY_SERVER).title ?? '',
    ...cardItems(game, c).map((it) => it.name.replace(/\.[a-z0-9]{1,5}$/i, '')),
    ...also.flatMap((s) => [cardWords(s), phoneCard(game, s, ANY_SERVER).title ?? '']),
  ];
  return bits.map(norm).some((b) => b.length >= 3 && name.includes(b));
}

/**
 * 🤫 Cards (the editor's tab): an empty one, what of one won't reach a phone (`room`: what the buzzer server in use
 * takes), a name that repeats what's on it, two with one name. Each goes to its card.
 */
export function savedCardProblems(game: Game, room: CardRoom = {}): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  const told = new Set<string>();
  (game.cards ?? []).forEach((c, i) => {
    const name = savedCardName(c, i);
    const says = `🤫 Card “${name}”`;
    const place: Place = { tab: 'cards', card: c.id };
    if (!slideHasContent(c)) out.push({ text: `${says} is empty: there's nothing on it to send`, tab: 'cards', level: 'warn', place });
    out.push(...cardLines(game, [c], says, 'cards', place, room));
    if (nameGivesAway(game, c))
      out.push({ text: `${says}: its name repeats what’s on it, and in one window viewers read a card’s name in 🤫 Send a card…`, tab: 'cards', level: 'info', place });
    // (Said once for each name, going to the second card with it.)
    const key = name.toLowerCase();
    if (seen.has(key) && !told.has(key)) {
      told.add(key);
      out.push({ text: `Two 🤫 cards are called “${name}”: in 🤫 Send a card… you can’t tell them apart`, tab: 'cards', level: 'info', place });
    }
    seen.add(key);
  });
  return out;
}
