// The editor's ways to add whole rounds besides a blank one: a template, the sample game, a copied round, or the
// rounds of another .brainrot game. Each is one undoable step; they return where the new round is, to show it.
import { toast } from '../lib/app.svelte';
import { tell } from '../lib/ask.svelte';
import { clipboard } from '../lib/clipboard.svelte';
import { clueSlides, followClueText } from '../lib/cluetext';
import { pickFile } from '../lib/fileio';
import { nameStep, step } from '../lib/history.svelte';
import { ROUND_MODES } from '../lib/modes';
import { roundName, type Game } from '../lib/model';
import { readGameFile, storeFiles } from '../lib/pack';
import { addBundledRound, bundleName, copiesMessage, copyRound, placeFor, uniqueName } from '../lib/roundcopy';
import { addSampleGame, TEMPLATES, type Template } from '../lib/samples';
import { validate } from '../lib/validate';
import type { MenuEntry } from '../lib/menustate.svelte';

/** A game's first slides round is its introduction, so it goes first: said, as it isn't where new rounds usually go. */
function saidIfFirst(game: Game, at: number): void {
  if (at === 0 && game.rounds.length > 1 && game.rounds[0].mode === 'slides')
    toast(`Added “${roundName(game.rounds[0], 0)}” at the start of the game: drag its tab to move it`);
}

/** A round from a template: its step is named after the round it makes ("Added round “Jeopardy!”"), not the template. */
export function addTemplate(game: Game, t: Template): number {
  const at = step(null, () => {
    const round = t.make(game);
    // Its clues take the theme's clue text, as a blank round's do.
    followClueText(game, clueSlides({ ...game, rounds: [round], tiebreaker: undefined }));
    // A second "Jeopardy!" is "Jeopardy! (2)".
    if (round.name) round.name = uniqueName(game.rounds.map((r, i) => roundName(r, i)), round.name, false);
    const at = placeFor(game, round);
    game.rounds.splice(at, 0, round);
    nameStep(`Added round “${roundName(round, at)}” (${t.label})`);
    return at;
  });
  saidIfFirst(game, at);
  return at;
}

export function addSample(game: Game): number {
  const at = step('Added the sample game', () => {
    const at = addSampleGame(game);
    // Its clues take the theme's clue text (only the new rounds': a clue already here keeps the look it has).
    followClueText(game, clueSlides({ ...game, rounds: game.rounds.slice(at), tiebreaker: undefined }));
    // Added to a game with rounds: a second "Jeopardy!" is "Jeopardy! (2)", as for a template.
    const names = game.rounds.slice(0, at).map((r, i) => roundName(r, i));
    for (const r of game.rounds.slice(at)) names.push((r.name = uniqueName(names, r.name, false)));
    return at;
  });
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
  const at = step(null, () => {
    const at = after === undefined ? placeFor(game, b.round) : after + 1;
    const r = addBundledRound(game, b, at, copied);
    const i = game.rounds.indexOf(r);
    // Named after the round it adds ("Jeopardy! (copy)"), so two pastes are told apart.
    nameStep(`Pasted round “${roundName(r, i)}”`);
    return i;
  });
  if (copied.length) toast(copiesMessage(copied, 'the copied round'));
  else saidIfFirst(game, at);
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
 * Ask for another game (a .brainrot or .json, the web page it was exported as, or a backup the desktop app kept) and
 * open it to take things from. Its files are stored, except where this browser already has the same file; one with the
 * id of a file here but other bytes (another copy of this game, changed since) comes in under a new id (see
 * copiedFiles). Null when cancelled or it can't be read.
 */
export async function pickOtherGame(): Promise<Game | null> {
  // (What Open… takes, but theme files: they hold no game.)
  const file = await pickFile('.brainrot,.jbr,.zip,.json,.html,.htm,.bak,.bak2,application/json,application/zip,text/html');
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
  // (Its introduction comes only in an empty game: see addSampleGame.)
  const sampleHint = game.rounds.length
    ? 'A filled-in board, adventure, board game and Final, added at the end: to see how they play'
    : 'An introduction, a board, an adventure, a board game and a Final, all filled in: to see how they play';
  return [
    ...Object.entries(ROUND_MODES).map(([mode, m]) => ({ label: `${m.icon} ${m.label}`, hint: m.hint, onclick: () => add(mode as keyof typeof ROUND_MODES) })),
    { sep: true },
    { heading: 'Start from a template' },
    ...TEMPLATES.map((t) => ({ label: `${ROUND_MODES[t.mode].icon} ${t.label}`, hint: t.hint, onclick: () => shown(addTemplate(game, t)) })),
    ...(sample ? [{ label: '🎁 The sample game', hint: sampleHint, onclick: sample }] : []),
    { sep: true },
    { label: '📂 Import rounds…', hint: 'From another game’s .brainrot file (or its exported web page), with their worlds, wheels, items and files', onclick: importRounds },
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
