// ✎ Edit board: the host changes the board of the board game being played (the game being played, never the one in
// the editor until 💾 Keep in game). Shared by the host panel, the host's stage and the keyboard. Every change is one
// named undo step (the board goes back with it).
import { app, toast } from '../../lib/app.svelte';
import { connectSpaces, deleteLiveSpace, disconnectSpaces, keepBoard, reverseLink, toggleBothWays, addLiveSpace } from '../../lib/boardedit';
import { allNamesLabel, nameShownLabel, nextSpaceName, setAllNamesShown, setNameShown, spaceById } from '../../lib/boardgame';
import { step } from '../../lib/history.svelte';
import type { BoardSpace, Game, Session } from '../../lib/model';
import { logged, startStep } from '../../lib/toolset';
import { boardNow } from './bgops';

export type LinkRef = { from: string; to: string };

/** Edit mode, and what's picked in it: a space or a link; ＋ Space waits for a click; Connect to… waits for the other space. */
export const boardEdit = $state<{ on: boolean; sel: string | null; link: LinkRef | null; adding: boolean; connecting: boolean }>({
  on: false,
  sel: null,
  link: null,
  adding: false,
  connecting: false,
});

/** Clear what's picked and waiting (edit mode stays as it is). */
export function editIdle(): void {
  boardEdit.sel = null;
  boardEdit.link = null;
  boardEdit.adding = false;
  boardEdit.connecting = false;
}

/** Edit mode on or off (off: nothing stays picked). */
export function setEditing(on: boolean): void {
  editIdle();
  boardEdit.on = on;
}

const nm = (s: BoardSpace | undefined) => `“${s?.name ?? '?'}”`;
const arrow = (game: Game, session: Session, l: LinkRef) => {
  const { round } = boardNow(game, session);
  const a = round && spaceById(round, l.from);
  const b = round && spaceById(round, l.to);
  return `${a?.name ?? '?'} ${b?.next.includes(l.from) ? '↔' : '→'} ${b?.name ?? '?'}`;
};

/** A new space at a point of the board, after the space picked (if any). It's picked then. */
export function editAdd(game: Game, session: Session, at: { x: number; y: number }): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const after = spaceById(round, boardEdit.sel ?? undefined);
  const name = nextSpaceName(round);
  let id = '';
  logged(session, `Added space “${name}”${after ? ` after ${nm(after)}` : ''}`, () => (id = addLiveSpace(round, at, after).id), game);
  boardEdit.adding = false;
  boardEdit.link = null;
  boardEdit.sel = id;
}

/** Start dragging a space: everything until the returned end() is one step, “Moved space …” (nothing if it didn't move). */
export function editDrag(game: Game, session: Session, id: string): () => void {
  const { round } = boardNow(game, session);
  const done = startStep(session, game);
  return () => done(`Moved space ${nm(round && spaceById(round, id))}`);
}

export function editDelete(game: Game, session: Session, id: string): void {
  const { round, bs } = boardNow(game, session);
  if (!round) return;
  if (round.spaces.length <= 1) return void toast('A board needs a space: add another before deleting this one');
  let text = '';
  logged(session, `Deleted space ${nm(spaceById(round, id))}`, () => (text = deleteLiveSpace(session, round, bs, id)?.text ?? ''), game);
  // (The log says who moved where: the step's own name is fixed before it runs, so it's said here too.)
  const last = session.actionLog?.at(-1);
  if (last && text) last.text = text;
  if (boardEdit.sel === id) boardEdit.sel = null;
  boardEdit.link = null;
  if (text) toast(text, 4000);
}

/** Connect the space picked to another (one way, from → to). */
export function editConnect(game: Game, session: Session, from: string, to: string): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  boardEdit.connecting = false;
  if (from === to) return;
  if (spaceById(round, from)?.next.includes(to)) return void toast(`${nm(spaceById(round, from))} already leads to ${nm(spaceById(round, to))}`);
  logged(session, `Connected ${spaceById(round, from)?.name} → ${spaceById(round, to)?.name}`, () => connectSpaces(round, from, to), game);
  boardEdit.sel = null;
  boardEdit.link = { from, to };
}

export function editDisconnect(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  logged(session, `Disconnected ${arrow(game, session, l)}`, () => disconnectSpaces(round, l.from, l.to), game);
  boardEdit.link = null;
}

export function editBothWays(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const both = !!spaceById(round, l.to)?.next.includes(l.from);
  logged(session, `Made ${arrow(game, session, l)} ${both ? 'one way' : 'both ways'}`, () => toggleBothWays(round, l.from, l.to), game);
}

export function editReverse(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  logged(session, `Reversed ${arrow(game, session, l)}`, () => reverseLink(round, l.from, l.to), game);
  boardEdit.link = { from: l.to, to: l.from };
}

/** A change to one space (its name, color, secret, notes, Start), as one step called `text`. */
export function editSpace(game: Game, session: Session, id: string, text: string, fn: (s: BoardSpace) => void): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  logged(session, text, () => fn(s), game);
}

/** Show or hide a space's name on the board (viewers see it only when it's shown). */
export function editShowName(game: Game, session: Session, id: string, on: boolean): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  logged(session, nameShownLabel(s, on), () => setNameShown(s, on), game);
}

/** Show or hide every space's name. */
export function editAllNames(game: Game, session: Session, on: boolean): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  logged(session, allNamesLabel(on), () => setAllNamesShown(round, on), game);
}

export function editStart(game: Game, session: Session, id: string): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  logged(session, `Made ${nm(s)} Start`, () => (round.start = id), game);
}

/**
 * 💾 Keep in game: the board as it is now goes into the game in the editor, so it's there next time (a step of the
 * editor's history, as the RPG's Keep in game is).
 */
export function editKeep(game: Game, session: Session): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  if (app.game.id !== game.id) return void toast('The editor has a different game open, so there’s nowhere to keep it');
  toast(step(`Kept the board of “${round.name}” from the show`, () => keepBoard(game, app.game, round.id), { during: 'play' }), 4000);
}
