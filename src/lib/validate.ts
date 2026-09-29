// Pre-game checklist for the editor (spec §5.2 validation panel).
import { canPlay, mediaUrls } from './media.svelte';
import { normalizeColor } from './colors';
import { finalName, playableClues, type Game } from './model';
import { allEmbeds, mediaUsage, slideHasContent } from './usage';

export interface Problem {
  text: string;
  /** Editor tab that fixes it: 'setup' | 'final' | 'media' | 'tools' | round index. */
  tab: 'setup' | 'final' | 'media' | 'tools' | number;
  level: 'warn' | 'info';
}

export function validate(game: Game): Problem[] {
  const out: Problem[] = [];
  if (!game.players.length) out.push({ text: 'No players yet (you can also add them before starting)', tab: 'setup', level: 'info' });
  const colors = game.players.map((p) => normalizeColor(p.color));
  if (new Set(colors).size !== colors.length) out.push({ text: 'Two players share a color', tab: 'setup', level: 'warn' });

  game.rounds.forEach((r, i) => {
    const playable = playableClues(r);
    if (!playable.length) out.push({ text: `${r.name}: no playable tiles`, tab: i, level: 'warn' });
    const unnamed = r.categories.filter((c) => !c.title.trim()).length;
    if (unnamed) out.push({ text: `${r.name}: ${unnamed} category name(s) blank`, tab: i, level: 'warn' });
    const tools = playable.filter((c) => c.type === 'wheel' || c.type === 'dice');
    const noQ = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.questionSlide)).length;
    const noA = playable.filter((c) => !tools.includes(c) && !slideHasContent(c.answerSlide)).length;
    if (noQ) out.push({ text: `${r.name}: ${noQ} clue(s) with no question`, tab: i, level: 'warn' });
    if (noA) out.push({ text: `${r.name}: ${noA} clue(s) with no answer`, tab: i, level: 'warn' });
    const broken = tools.filter((c) =>
      c.type === 'wheel' ? !game.wheels.some((w) => w.id === c.wheelId) : !game.dice.some((d) => d.id === c.diceId),
    ).length;
    if (broken) out.push({ text: `${r.name}: ${broken} wheel/dice tile(s) with nothing chosen`, tab: i, level: 'warn' });
  });

  if (game.final.enabled) {
    if (!slideHasContent(game.final.questionSlide)) out.push({ text: `${finalName(game)} has no question`, tab: 'final', level: 'warn' });
    if (!slideHasContent(game.final.answerSlide)) out.push({ text: `${finalName(game)} has no answer`, tab: 'final', level: 'warn' });
  }

  const known = new Set(game.media.map((m) => m.id));
  const missingRefs = [...mediaUsage(game).keys()].filter((id) => !known.has(id)).length;
  const missingFiles = game.media.filter((m) => !mediaUrls[m.id]).length;
  if (missingRefs || missingFiles) out.push({ text: `${missingRefs + missingFiles} media file(s) missing`, tab: 'media', level: 'warn' });
  const unplayable = game.media.filter((m) => (m.kind === 'video' || m.kind === 'audio') && !canPlay(m.mime)).length;
  if (unplayable) out.push({ text: `${unplayable} video/audio file(s) this browser may not play`, tab: 'media', level: 'warn' });

  const online = allEmbeds(game).length;
  if (online) out.push({ text: `${online} online media link(s): need internet during the game`, tab: 'media', level: 'info' });
  return out;
}
