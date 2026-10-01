// The editor's ways to add whole rounds besides a blank one: a template, the sample game, a copied round, or the
// rounds of another .brainrot game. Each is one undoable step; they return where the new round is, to show it.
import { toast } from '../lib/app.svelte';
import { tell } from '../lib/ask.svelte';
import { clipboard } from '../lib/clipboard.svelte';
import { pickFile } from '../lib/fileio';
import { step } from '../lib/history.svelte';
import { ROUND_MODES } from '../lib/modes';
import { roundName, type Game } from '../lib/model';
import { openGameFile } from '../lib/pack';
import { addBundledRound, copyRound, placeFor } from '../lib/roundcopy';
import { addSampleGame, TEMPLATES, type Template } from '../lib/samples';
import { validate } from '../lib/validate';
import type { MenuEntry } from '../lib/menustate.svelte';

export function addTemplate(game: Game, t: Template): number {
  return step(`Added round “${t.label}”`, () => {
    const round = t.make(game);
    const at = placeFor(game, round);
    game.rounds.splice(at, 0, round);
    return at;
  });
}

export function addSample(game: Game): number {
  const at = step('Added the sample game', () => addSampleGame(game));
  toast('Added a sample game: press ▶ Play to try it, or change anything', 5000);
  return at;
}

/** Copy round (from a round tab's menu). */
export function copyRoundOf(game: Game, i: number): void {
  copyRound(game, game.rounds[i]);
  toast(`Copied “${roundName(game.rounds[i], i)}”: paste it from ＋ Add round or a round’s menu (in this game or another)`, 4000);
}

/** Paste round: after round `after`, or where a new round goes. Returns its place, or null with nothing copied. */
export function pasteRound(game: Game, after?: number): number | null {
  const b = clipboard.round;
  if (!b) return null;
  return step(`Pasted round “${roundName(b.round)}”`, () => {
    const at = after === undefined ? placeFor(game, b.round) : after + 1;
    const r = addBundledRound(game, b, at);
    return game.rounds.indexOf(r);
  });
}

/** Ask for a .brainrot (or .json) game and open it to take things from. Null when cancelled or it can't be read. */
export async function pickOtherGame(): Promise<Game | null> {
  const file = await pickFile('.brainrot,.jbr,.zip,.json,application/json,application/zip');
  if (!file) return null;
  try {
    const g = await openGameFile(file);
    validate(g);
    return g;
  } catch (e) {
    void tell(`“${file.name}” couldn’t be read: ${(e as Error).message}`);
    return null;
  }
}

/** The ＋ Add round menu: the blank modes, the templates, then a round from elsewhere. */
export function addRoundItems(game: Game, add: (mode: keyof typeof ROUND_MODES) => void, shown: (at: number) => void, importRounds: () => void): MenuEntry[] {
  const b = clipboard.round;
  return [
    ...Object.entries(ROUND_MODES).map(([mode, m]) => ({ label: `${m.icon} ${m.label}`, hint: m.hint, onclick: () => add(mode as keyof typeof ROUND_MODES) })),
    { sep: true },
    { heading: 'Start from a template' },
    ...TEMPLATES.map((t) => ({ label: `${ROUND_MODES[t.mode].icon} ${t.label}`, hint: t.hint, onclick: () => shown(addTemplate(game, t)) })),
    { sep: true },
    { label: '📂 Import round from a .brainrot…', hint: 'Bring in rounds of another game, with their worlds, wheels, items and files', onclick: importRounds },
    {
      label: b ? `📋 Paste round “${roundName(b.round)}”` : '📋 Paste round',
      hint: b ? undefined : 'Copy a round first (right-click its tab)',
      disabled: !b,
      onclick: () => {
        const at = pasteRound(game);
        if (at !== null) shown(at);
      },
    },
  ];
}
