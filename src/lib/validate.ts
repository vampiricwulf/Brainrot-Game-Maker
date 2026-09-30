// Pre-game checklist for the editor (spec §5.2 validation panel).
import { canPlay, mediaUrls } from './media.svelte';
import { linkLifetime } from './links';
import { normalizeColor } from './colors';
import { isFinal, playableClues, PLAYER_WHEEL, roundName, type Game } from './model';
import { mediaUsage, onlineCount, slideHasContent } from './usage';

export interface Problem {
  text: string;
  /** Editor tab that fixes it: 'setup' | 'tiebreaker' | 'media' | 'tools' | round index. */
  tab: 'setup' | 'tiebreaker' | 'media' | 'tools' | number;
  level: 'warn' | 'info';
}

export function validate(game: Game): Problem[] {
  const out: Problem[] = [];
  if (!game.players.length) out.push({ text: 'No players yet (you can also add them before starting)', tab: 'setup', level: 'info' });
  const colors = game.players.map((p) => normalizeColor(p.color));
  if (new Set(colors).size !== colors.length) out.push({ text: 'Two players share a color', tab: 'setup', level: 'warn' });

  if (!game.rounds.length) out.push({ text: 'No rounds yet', tab: 'setup', level: 'warn' });
  game.rounds.forEach((round, i) => {
    const name = roundName(round, i);
    if (isFinal(round)) {
      if (!slideHasContent(round.questionSlide)) out.push({ text: `${name} has no question`, tab: i, level: 'warn' });
      if (!slideHasContent(round.answerSlide)) out.push({ text: `${name} has no answer`, tab: i, level: 'warn' });
      return;
    }
    const r = { ...round, name };
    const playable = playableClues(r);
    if (!playable.length) out.push({ text: `${r.name}: no playable tiles`, tab: i, level: 'warn' });
    const unnamed = r.categories.filter((c) => !c.title.trim() && !c.image).length;
    if (unnamed) out.push({ text: `${r.name}: ${unnamed} category name(s) blank`, tab: i, level: 'warn' });
    const tools = playable.filter((c) => c.type === 'wheel' || c.type === 'dice');
    const noQ = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.questionSlide)).length;
    const noA = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.answerSlide)).length;
    if (noQ) out.push({ text: `${r.name}: ${noQ} clue(s) with no question`, tab: i, level: 'warn' });
    if (noA) out.push({ text: `${r.name}: ${noA} clue(s) with no answer`, tab: i, level: 'warn' });
    const broken = tools.filter((c) =>
      c.type === 'wheel' ? c.wheelId !== PLAYER_WHEEL && !game.wheels.some((w) => w.id === c.wheelId) : !game.dice.some((d) => d.id === c.diceId),
    ).length;
    if (broken) out.push({ text: `${r.name}: ${broken} wheel/dice tile(s) with nothing chosen`, tab: i, level: 'warn' });
  });


  const known = new Set(game.media.map((m) => m.id));
  const missingRefs = [...mediaUsage(game).keys()].filter((id) => !known.has(id)).length;
  const missingFiles = game.media.filter((m) => !mediaUrls[m.id]).length;
  if (missingRefs || missingFiles) out.push({ text: `${missingRefs + missingFiles} media file(s) missing`, tab: 'media', level: 'warn' });
  // (A live link already played when it was added; its type is often unknown from the address.)
  const unplayable = game.media.filter((m) => !m.url && (m.kind === 'video' || m.kind === 'audio') && !canPlay(m.mime)).length;
  if (unplayable) out.push({ text: `${unplayable} video/audio file(s) this browser may not play`, tab: 'media', level: 'warn' });

  const links = game.media.filter((m) => m.url);
  const online = onlineCount(game);
  if (online) out.push({ text: `${online} item${online === 1 ? ' plays' : 's play'} from the internet: need internet during the game`, tab: 'media', level: 'info' });
  const life = links.map((m) => linkLifetime(m));
  const expired = life.filter((l) => l === 'expired').length;
  const temporary = life.filter((l) => l === 'temporary').length;
  if (expired) out.push({ text: `${expired} online link(s) expired: add those files again`, tab: 'media', level: 'warn' });
  if (temporary) out.push({ text: `${temporary} online link(s) stop working soon (temporary upload sites): save a copy or add the files`, tab: 'media', level: 'warn' });
  return out;
}
