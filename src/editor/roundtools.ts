// The editor's ways to add whole rounds besides a blank one: a template, the sample game, a copied round, or the
// rounds of another .brainrot game. Each is one undoable step; they return where the new round is, to show it.
import { toast } from '../lib/app.svelte';
import { tell } from '../lib/ask.svelte';
import { clipboard } from '../lib/clipboard.svelte';
import { pickFile } from '../lib/fileio';
import { nameStep, step } from '../lib/history.svelte';
import { ROUND_MODES } from '../lib/modes';
import { roundName, type Game } from '../lib/model';
import { readGameFile, storeFiles } from '../lib/pack';
import { addBundledRound, bundleName, copiesMessage, copyRound, placeFor, uniqueName } from '../lib/roundcopy';
import { addSampleGame, TEMPLATES, type Template } from '../lib/samples';
import { validate } from '../lib/validate';
import type { MenuEntry } from '../lib/menustate.svelte';

/** A round from a template: its step is named after the round it makes ("Added round “Jeopardy!”"), not the template. */
export function addTemplate(game: Game, t: Template): number {
  return step(null, () => {
    const round = t.make(game);
    // A second "Jeopardy!" is "Jeopardy! (2)".
    if (round.name) round.name = uniqueName(game.rounds.map((r, i) => roundName(r, i)), round.name, false);
    const at = placeFor(game, round);
    game.rounds.splice(at, 0, round);
    nameStep(`Added round “${roundName(round, at)}” (${t.label})`);
    return at;
  });
}

export function addSample(game: Game): number {
  const at = step('Added the sample game', () => addSampleGame(game));
  toast('Added a sample game: press ▶ Play to try it, or change anything');
  return at;
}

/** Copy round (from a round tab's menu). */
export function copyRoundOf(game: Game, i: number): void {
  copyRound(game, game.rounds[i]);
  toast(`Copied “${roundName(game.rounds[i], i)}”: paste it from ＋ Add round or a round’s menu (in this game or another)`);
}

/** Paste round: after round `after`, or where a new round goes. Returns its place, or null with nothing copied. */
export function pasteRound(game: Game, after?: number): number | null {
  const b = clipboard.round;
  if (!b) return null;
  const copied: string[] = [];
  const at = step(`Pasted round “${bundleName(b)}”`, () => {
    const at = after === undefined ? placeFor(game, b.round) : after + 1;
    const r = addBundledRound(game, b, at, copied);
    return game.rounds.indexOf(r);
  });
  if (copied.length) toast(copiesMessage(copied, 'the copied round'));
  return at;
}

/** The files of a game opened by pickOtherGame that came in as copies (another version of one of this game's). */
const fileCopies = new WeakMap<Game, Set<string>>();
/** Names of the files among `ids` that came in from `source` as copies. */
export function copiedFiles(source: Game, refs: readonly { id: string; name: string }[]): string[] {
  const c = fileCopies.get(source);
  return c ? refs.filter((m) => c.has(m.id)).map((m) => `“${m.name}” file`) : [];
}

/**
 * Ask for a .brainrot (or .json) game and open it to take things from. Its files are stored, except where this browser
 * already has the same file; one with the id of a file here but other bytes (another copy of this game, changed since)
 * comes in under a new id (see copiedFiles). Null when cancelled or it can't be read.
 */
export async function pickOtherGame(): Promise<Game | null> {
  const file = await pickFile('.brainrot,.jbr,.zip,.json,application/json,application/zip');
  if (!file) return null;
  try {
    const read = await readGameFile(file);
    validate(read.game);
    await storeFiles(read);
    const g = read.game;
    fileCopies.set(g, read.copies);
    return g;
  } catch (e) {
    void tell(`“${file.name}” couldn’t be read: ${(e as Error).message}`);
    return null;
  }
}

/** The ＋ Add round menu: the blank modes, the templates, then a round from elsewhere. */
export function addRoundItems(game: Game, add: (mode: keyof typeof ROUND_MODES) => void, shown: (at: number) => void, importRounds: () => void, sample?: () => void): MenuEntry[] {
  const b = clipboard.round;
  return [
    ...Object.entries(ROUND_MODES).map(([mode, m]) => ({ label: `${m.icon} ${m.label}`, hint: m.hint, onclick: () => add(mode as keyof typeof ROUND_MODES) })),
    { sep: true },
    { heading: 'Start from a template' },
    ...TEMPLATES.map((t) => ({ label: `${ROUND_MODES[t.mode].icon} ${t.label}`, hint: t.hint, onclick: () => shown(addTemplate(game, t)) })),
    ...(sample ? [{ label: '🎁 The sample game', hint: 'A filled-in round of each kind, added at the end: to see how they play', onclick: sample }] : []),
    { sep: true },
    { label: '📂 Import rounds…', hint: 'From another game’s .brainrot file, with their worlds, wheels, items and files', onclick: importRounds },
    {
      label: b ? `📋 Paste round “${bundleName(b)}”` : '📋 Paste round',
      hint: b ? undefined : 'Copy a round first (right-click its tab)',
      disabled: !b,
      onclick: () => {
        const at = pasteRound(game);
        if (at !== null) shown(at);
      },
    },
  ];
}
