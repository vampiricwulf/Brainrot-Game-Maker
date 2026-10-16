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
  type Action,
  type BoardRound,
  type ClueCard,
  type Game,
  type Slide,
} from './model';
import { lowerWord, partnerRules, partnerSpot, partWords, stealOn } from './partner';
import { cardItems, cardWords, phoneCard } from './phonecard';
import { CARD_TEXT_MAX, FILE_MAX_BYTES } from './buzzproto';
import { rpgProblems, worldById } from './rpg';
import { boardGameProblems } from './boardgame';
import { mediaUsage, onlineCount, slideHasContent, slideMediaIds } from './usage';
import { toolChosen } from './tools';
import type { Place } from './historylabel';
import { categoryTooLong } from './boardfit';
import { statsProblems } from './toolset';
import { actionProblem, objectsWhere } from './refs';
import { dealSetupProblems, partName } from './deals';

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
 * `room.filesOff`: the buzzer room open now puts cards on phones but takes no files (its server is off them, or out for
 * today): a card's file from this computer won't reach a phone.
 */
export function validate(game: Game, room: { filesOff?: boolean } = {}): Problem[] {
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
      // (Its objects' 🤫 Send a card buttons. A screen's looks have copies of its objects, with the same names: each line
      // is said once, going to the first, the screen's own.)
      const world = worldById(game, round.world);
      const said = new Set<string>();
      if (world)
        for (const { el, map, screen, look } of objectsWhere(world)) {
          const what = el.name?.trim() ? `“${el.name.trim()}”` : 'an object';
          const place: Place = { tab: 'world', world: world.id, map: map.id, screen: screen.id, look, inSlide: true, element: el.id };
          for (const p of cardLines(game, cardsIn(el.role?.actions), `${name}: a 🤫 card on ${what} on “${screen.name}”`, i, place, !!room.filesOff)) {
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
        out.push(...cardLines(game, cardsIn(s.onLand, s.onPass), `${name}: a 🤫 card on “${s.name}”`, i, { tab: 'round', round: round.id, part: { kind: 'space', space: s.id } }, !!room.filesOff));
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
        text: `${r.name}: ${ptOver.placed} partner clues placed, but 🤝 Partner clues says ${ptOver.want} (all ${ptOver.placed} play)`,
        tab: i,
        level: 'info',
      });
    out.push(...partnerProblems(game, round, i, !!room.filesOff));
  });
  // The tiebreaker once ticked on: a tie at the end offers it as the main button, so an empty one puts a blank slide on stream.
  const tb = game.tiebreaker;
  if (tb) {
    if (!questionSlides(tb).some(slideHasContent))
      out.push({ text: 'The tiebreaker has no question', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'q' } });
    if (!slideHasContent(tb.answerSlide))
      out.push({ text: 'The tiebreaker has no answer', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'a' } });
  }

  out.push(...statsProblems(game), ...toolButtonProblems(game, !!room.filesOff), ...savedCardProblems(game, !!room.filesOff));

  const known = new Set(game.media.map((m) => m.id));
  const usage = mediaUsage(game);
  // Files only 🤫 cards use: an older copy's 🗑 Delete unused doesn't see cards, so it would delete them.
  const onCards = new Map<string, number>();
  for (const r of boardRounds(game))
    for (const c of r.categories)
      for (const cl of c.clues) for (const card of cardSlides(cl)) for (const id of slideMediaIds(card)) onCards.set(id, (onCards.get(id) ?? 0) + 1);
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
  // Steal on a miss with nobody buzzing: the host picks who steals.
  const steals = partners.filter((c) => stealOn(partnerRules(c), game.settings)).length;
  if (steals && !game.settings.buzzer)
    out.push({
      text: `${plural(steals, 'partner clue')} let${steals === 1 ? 's' : ''} the others steal on a miss: without phone buzzers you pick who steals (their number, then Enter)`,
      tab: 'play',
      level: 'info',
    });
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
 * A board's 🤫 cards (partner-clues spec §5.6): a ready-made 🤝 partner game with no card (the giver has nothing to go
 * on); on any tile, an empty card, more cards than a clue holds, a card's online link that has stopped working or soon
 * will, what of a card won't reach a phone (`filesOff`: the buzzer server in use takes no files), and its name
 * (cardNameProblems). Each goes to its card.
 */
export function partnerProblems(game: Game, round: BoardRound, tab: number, filesOff = false): Problem[] {
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
        for (const t of cardFileProblems(game, card, filesOff)) warn(`${tile}: ${clueCardWords(card, n)} has ${t}`, card);
      });
      out.push(...cardNameProblems(game, cards, cl.answerSlide, tile, tab, (card) => at(card)!));
    });
  return out;
}

/**
 * A tile's card names (`where`: "Movies $200"): one that repeats what's on its card or the answer, and two cards that
 * read alike (one with no name is "Card 2"; said once, going to the second). Info only.
 */
function cardNameProblems(game: Game, cards: ClueCard[], answer: Slide, where: string, tab: number, at: (c: ClueCard) => Place): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  const told = new Set<string>();
  cards.forEach((c, i) => {
    if (nameGivesAway(game, c, [answer]))
      out.push({ text: `${where}: the name of ${clueCardWords(c, i)} repeats what’s on it or the answer, and in one window viewers can read a card’s name in the host panel`, tab, level: 'info', place: at(c) });
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

/**
 * What of a 🤫 card won't reach a phone or will stop working, as "… has <this>": an online link that has expired or soon
 * will, and (spec §5.6, §13.5) a file too big or of a kind phones can't play, a file from this computer when the buzzer
 * server in use takes none (`filesOff`), words past CARD_TEXT_MAX.
 */
function cardFileProblems(game: Game, card: Slide, filesOff: boolean): string[] {
  const out: string[] = [];
  const life = slideMediaIds(card).flatMap((id) => {
    const m = game.media.find((x) => x.id === id);
    return m?.url ? [linkLifetime(m)] : [];
  });
  if (life.includes('expired')) out.push('an online link that has expired: add that file again');
  else if (life.includes('temporary')) out.push('an online link that stops working soon: save a copy or add the file');
  for (const it of phoneCard(game, card, { files: filesOff ? null : {} }).items) {
    const size = game.media.find((m) => m.id === it.media)?.size ?? 0;
    if (it.why === 'big') out.push(`a ${KIND[it.kind]} too big for phones (${formatBytes(size)}; phones get files up to ${formatBytes(FILE_MAX_BYTES)})`);
    else if (it.why === 'kind' && it.file) out.push(`a ${KIND[it.kind]} phones can't play: add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link`);
    else if (it.why === 'nofiles') out.push(`a ${KIND[it.kind]} that's a file on this computer, and this buzzer server isn't taking files: phones get the words and links only (📋 Copy picture)`);
  }
  if ([...cardWords(card)].length > CARD_TEXT_MAX) out.push(`more than ${CARD_TEXT_MAX} characters of words: phones get the first ${CARD_TEXT_MAX}`);
  return out;
}

/** The cards of the 🤫 Send a card buttons in some lists of buttons. */
const cardsIn = (...lists: (Action[] | undefined)[]): Slide[] => lists.flatMap((l) => l ?? []).flatMap((a) => (a.do === 'card' ? [a.slide] : []));

/** The cardFileProblems of some cards, each said once: "<says> has <this>", going to `place`. */
function cardLines(game: Game, cards: Slide[], says: string, tab: Problem['tab'], place: Place, filesOff: boolean): Problem[] {
  return [...new Set(cards.flatMap((c) => cardFileProblems(game, c, filesOff)))].map((t) => ({ text: `${says} has ${t}`, tab, level: 'warn', place }));
}

/**
 * Items' Use buttons, wheel slices' and dice's buttons that point at something deleted (a shop, a stat, an item, a
 * wheel) or at nothing: in play they only say why they can't. Also their 🤫 cards, and 🎭 deals' parts' cards, that
 * won't reach a phone as they are (cardFileProblems; `filesOff`: the buzzer server in use takes no files). (RPG
 * objects' and board spaces' are their rounds'.)
 */
export function toolButtonProblems(game: Game, filesOff = false): Problem[] {
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
    out.push(...cardLines(game, cardsIn(it.onUse), `Item “${it.name}”: a Use button’s 🤫 card`, 'stats', place, filesOff));
  }
  for (const w of game.wheels) {
    const p = why(w.segments.map((s) => s.actions));
    const place: Place = { tab: 'tools', wheel: w.id };
    if (p) out.push({ text: `Wheel “${w.name}”: a slice's button points nowhere (${p})`, tab: 'tools', level: 'warn', place });
    out.push(...cardLines(game, cardsIn(...w.segments.map((s) => s.actions)), `Wheel “${w.name}”: a slice’s 🤫 card`, 'tools', place, filesOff));
  }
  for (const d of game.dice) {
    const lists = [...d.dice.flatMap((x) => (x.customFaces ?? []).map((f) => f.actions)), ...(d.totalOutcomes ?? []).map((t) => t.outcome.actions)];
    const p = why(lists);
    const place: Place = { tab: 'tools', dice: d.id };
    if (p) out.push({ text: `Dice “${d.name}”: a button points nowhere (${p})`, tab: 'tools', level: 'warn', place });
    out.push(...cardLines(game, cardsIn(...lists), `Dice “${d.name}”: a 🤫 card`, 'tools', place, filesOff));
  }
  // 🎭 Deals that can't be dealt as they are, and parts' cards that won't reach a phone as they are.
  for (const dl of game.deals ?? []) {
    const place: Place = { tab: 'tools', deal: dl.id };
    for (const p of dealSetupProblems(game, dl)) out.push({ text: `Deal “${dl.name}”: ${p}`, tab: 'tools', level: 'warn', place });
    dl.parts.forEach((part, i) => out.push(...cardLines(game, [part.card], `Deal “${dl.name}”: ${partName(part, i)}’s card`, 'tools', place, filesOff)));
  }
  return out;
}

/** Words to compare, as a name says them: lower case, anything but letters and digits a single space. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * A 🤫 card's name repeats what's on it (its words, its phone title, or a file's name, at least 3 letters) or what's in
 * `also` (a tile's answer): in one window viewers read a card's name in the host panel and 🤫 Send a card…. ("Mission 1"
 * on "Your mission: …" doesn't.)
 */
export function nameGivesAway(game: Game, c: Slide & { name?: string }, also: Slide[] = []): boolean {
  const name = norm(c.name ?? '');
  if (!name) return false;
  const bits = [
    cardWords(c),
    phoneCard(game, c, { files: {} }).title ?? '',
    ...cardItems(game, c).map((it) => it.name.replace(/\.[a-z0-9]{1,5}$/i, '')),
    ...also.flatMap((s) => [cardWords(s), phoneCard(game, s, { files: {} }).title ?? '']),
  ];
  return bits.map(norm).some((b) => b.length >= 3 && name.includes(b));
}

/**
 * 🤫 Cards (the editor's tab): an empty one, what of one won't reach a phone (`filesOff`: the buzzer server in use takes
 * no files), a name that repeats what's on it, two with one name. Each goes to its card.
 */
export function savedCardProblems(game: Game, filesOff = false): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  const told = new Set<string>();
  (game.cards ?? []).forEach((c, i) => {
    const name = savedCardName(c, i);
    const says = `🤫 Card “${name}”`;
    const place: Place = { tab: 'cards', card: c.id };
    if (!slideHasContent(c)) out.push({ text: `${says} is empty: there's nothing on it to send`, tab: 'cards', level: 'warn', place });
    out.push(...cardLines(game, [c], says, 'cards', place, filesOff));
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
