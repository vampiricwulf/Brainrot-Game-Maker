// Pre-game checklist for the editor (spec §5.2 validation panel).
import { canPlay, mediaUrls } from './media.svelte';
import { linkLifetime } from './links';
import { normalizeColor } from './colors';
import { isBoardGame, isFinal, isRpg, playableClues, PLAYER_WHEEL, roundName, type Game } from './model';
import { rpgProblems } from './rpg';
import { boardGameProblems } from './boardgame';
import { mediaUsage, onlineCount, slideHasContent } from './usage';
import { tileDice } from './tools';

export interface Problem {
  text: string;
  /** Editor tab that fixes it: 'setup' | 'tiebreaker' | 'media' | 'tools' | round index. */
  tab: 'setup' | 'tiebreaker' | 'media' | 'tools' | number;
  level: 'warn' | 'info';
}

/** "1 clue", "3 clues" ("category" → "categories"). */
function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`}`;
}

export function validate(game: Game): Problem[] {
  const out: Problem[] = [];
  if (!game.players.length) out.push({ text: 'No players yet (you can also add them before starting)', tab: 'setup', level: 'info' });
  const colors = game.players.map((p) => normalizeColor(p.color));
  if (new Set(colors).size !== colors.length) out.push({ text: 'Two players share a color', tab: 'setup', level: 'warn' });

  if (!game.rounds.length) out.push({ text: 'No rounds yet: add one to play', tab: 0, level: 'warn' });
  game.rounds.forEach((round, i) => {
    const name = roundName(round, i);
    if (isFinal(round)) {
      if (!slideHasContent(round.questionSlide)) out.push({ text: `${name} has no question`, tab: i, level: 'warn' });
      if (!slideHasContent(round.answerSlide)) out.push({ text: `${name} has no answer`, tab: i, level: 'warn' });
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
    const r = { ...round, name };
    const playable = playableClues(r);
    if (!playable.length) out.push({ text: `${r.name}: no playable tiles`, tab: i, level: 'warn' });
    const unnamed = r.categories.filter((c) => !c.title.trim() && !c.image).length;
    if (unnamed) out.push({ text: `${r.name}: ${plural(unnamed, 'category')} with no name`, tab: i, level: 'warn' });
    const tools = playable.filter((c) => c.type === 'wheel' || c.type === 'dice');
    const noQ = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.questionSlide)).length;
    const noA = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.answerSlide)).length;
    if (noQ) out.push({ text: `${r.name}: ${plural(noQ, 'clue')} with no question`, tab: i, level: 'warn' });
    if (noA) out.push({ text: `${r.name}: ${plural(noA, 'clue')} with no answer`, tab: i, level: 'warn' });
    const broken = tools.filter((c) =>
      c.type === 'wheel' ? c.wheelId !== PLAYER_WHEEL && !game.wheels.some((w) => w.id === c.wheelId) : !tileDice(game, c.diceId),
    ).length;
    if (broken) out.push({ text: `${r.name}: ${plural(broken, 'wheel/dice tile')} with nothing chosen`, tab: i, level: 'warn' });
  });


  const known = new Set(game.media.map((m) => m.id));
  const missingRefs = [...mediaUsage(game).keys()].filter((id) => !known.has(id)).length;
  const missingFiles = game.media.filter((m) => !mediaUrls[m.id]).length;
  if (missingRefs || missingFiles) out.push({ text: `${plural(missingRefs + missingFiles, 'media file')} missing`, tab: 'media', level: 'warn' });
  // (A live link already played when it was added; its type is often unknown from the address.)
  const unplayable = game.media.filter((m) => !m.url && (m.kind === 'video' || m.kind === 'audio') && !canPlay(m.mime)).length;
  if (unplayable) out.push({ text: `${plural(unplayable, 'video/audio file')} this browser may not play`, tab: 'media', level: 'warn' });

  const links = game.media.filter((m) => m.url);
  const online = onlineCount(game);
  if (online) out.push({ text: `${online} item${online === 1 ? ' plays' : 's play'} from the internet: need internet during the game`, tab: 'media', level: 'info' });
  const life = links.map((m) => linkLifetime(m));
  const expired = life.filter((l) => l === 'expired').length;
  const temporary = life.filter((l) => l === 'temporary').length;
  if (expired) out.push({ text: `${plural(expired, 'online link')} expired: add ${expired === 1 ? 'that file' : 'those files'} again`, tab: 'media', level: 'warn' });
  if (temporary) out.push({ text: `${plural(temporary, 'online link')} ${temporary === 1 ? 'stops' : 'stop'} working soon (temporary upload sites): save a copy or add the files`, tab: 'media', level: 'warn' });
  return out;
}
