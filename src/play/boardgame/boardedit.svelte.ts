// ✎ Edit board: the host changes the board of the board game being played (the game being played, never the one in
// the editor until 💾 Keep in game). Shared by the host panel, the host's stage and the keyboard. Every change is one
// named undo step (the board goes back with it). `hide`: one window (the panel is on stream): a secret space not
// revealed yet is “? (secret)” in what an edit says (its undo step, the 📜 Log, a toast).
import { app, toast } from '../../lib/app.svelte';
import { connectSpaces, deleteLiveSpace, disconnectSpaces, keepBoard, reverseLink, toggleBothWays, addLiveSpace } from '../../lib/boardedit';
import { allNamesLabel, nameShownLabel, nextSpaceName, setAllNamesShown, setNameShown, spaceById, spaceSaid } from '../../lib/boardgame';
import { step } from '../../lib/history.svelte';
import type { BoardSpace, Game, Session } from '../../lib/model';
import { logged, startStep } from '../../lib/toolset';
import { boardNow } from './bgops';

export type LinkRef = { from: string; to: string };

/**
 * Edit mode, and what's picked in it: a space or a link; ＋ Space waits for a click; Connect to… waits for the other space;
 * the space whose ⚙ Buttons… window is open (in one window it goes over the host panel).
 */
export const boardEdit = $state<{ on: boolean; sel: string | null; link: LinkRef | null; adding: boolean; connecting: boolean; buttons: string | null }>({
  on: false,
  sel: null,
  link: null,
  adding: false,
  connecting: false,
  buttons: null,
});

/** Clear what's picked and waiting (edit mode stays as it is). */
export function editIdle(): void {
  boardEdit.sel = null;
  boardEdit.link = null;
  boardEdit.adding = false;
  boardEdit.connecting = false;
}

/** Edit mode on or off (off: nothing stays picked, nor a ⚙ Buttons… window open). */
export function setEditing(on: boolean): void {
  editIdle();
  if (!on) boardEdit.buttons = null;
  boardEdit.on = on;
}

/** A space's name as an edit says it (`hide`: one window, a secret one not revealed yet is “? (secret)”). */
function said(game: Game, session: Session, s: BoardSpace | undefined, hide: boolean): string {
  const { bs } = boardNow(game, session);
  return bs ? spaceSaid(bs, s, hide) : (s?.name ?? '?');
}
const nm = (game: Game, session: Session, s: BoardSpace | undefined, hide: boolean) => `“${said(game, session, s, hide)}”`;
const arrow = (game: Game, session: Session, l: LinkRef, hide: boolean) => {
  const { round } = boardNow(game, session);
  const a = round && spaceById(round, l.from);
  const b = round && spaceById(round, l.to);
  return `${said(game, session, a, hide)} ${b?.next.includes(l.from) ? '↔' : '→'} ${said(game, session, b, hide)}`;
};

/** A new space at a point of the board, after the space picked (if any). It's picked then. */
export function editAdd(game: Game, session: Session, at: { x: number; y: number }, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const after = spaceById(round, boardEdit.sel ?? undefined);
  const name = nextSpaceName(round);
  let id = '';
  logged(session, `Added space “${name}”${after ? ` after ${nm(game, session, after, hide)}` : ''}`, () => (id = addLiveSpace(round, at, after).id), game);
  boardEdit.adding = false;
  boardEdit.link = null;
  boardEdit.sel = id;
}

/** Start dragging a space: everything until the returned end() is one step, “Moved space …” (nothing if it didn't move). */
export function editDrag(game: Game, session: Session, id: string, hide = false): () => void {
  const { round } = boardNow(game, session);
  const done = startStep(session, game);
  return () => done(`Moved space ${nm(game, session, round && spaceById(round, id), hide)}`);
}

export function editDelete(game: Game, session: Session, id: string, hide = false): void {
  const { round, bs } = boardNow(game, session);
  if (!round) return;
  if (round.spaces.length <= 1) return void toast('A board needs a space: add another before deleting this one');
  let text = '';
  const say = (s: BoardSpace) => said(game, session, s, hide);
  logged(session, `Deleted space ${nm(game, session, spaceById(round, id), hide)}`, () => (text = deleteLiveSpace(session, round, bs, id, say)?.text ?? ''), game);
  // (The log says who moved where: the step's own name is fixed before it runs, so it's said here too.)
  const last = session.actionLog?.at(-1);
  if (last && text) last.text = text;
  if (boardEdit.sel === id) boardEdit.sel = null;
  boardEdit.link = null;
  if (text) toast(text, 4000);
}

/** Connect the space picked to another (one way, from → to). */
export function editConnect(game: Game, session: Session, from: string, to: string, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  boardEdit.connecting = false;
  if (from === to) return;
  const [a, b] = [spaceById(round, from), spaceById(round, to)];
  if (a?.next.includes(to)) return void toast(`${nm(game, session, a, hide)} already leads to ${nm(game, session, b, hide)}`);
  logged(session, `Connected ${said(game, session, a, hide)} → ${said(game, session, b, hide)}`, () => connectSpaces(round, from, to), game);
  boardEdit.sel = null;
  boardEdit.link = { from, to };
}

export function editDisconnect(game: Game, session: Session, l: LinkRef, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  logged(session, `Disconnected ${arrow(game, session, l, hide)}`, () => disconnectSpaces(round, l.from, l.to), game);
  boardEdit.link = null;
}

export function editBothWays(game: Game, session: Session, l: LinkRef, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const both = !!spaceById(round, l.to)?.next.includes(l.from);
  logged(session, `Made ${arrow(game, session, l, hide)} ${both ? 'one way' : 'both ways'}`, () => toggleBothWays(round, l.from, l.to), game);
}

export function editReverse(game: Game, session: Session, l: LinkRef, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  logged(session, `Reversed ${arrow(game, session, l, hide)}`, () => reverseLink(round, l.from, l.to), game);
  boardEdit.link = { from: l.to, to: l.from };
}

/** A change to one space (its name, color, secret, notes, Start), as one step called `text` (said as `hide` says). */
export function editSpace(game: Game, session: Session, id: string, text: string, fn: (s: BoardSpace) => void): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  logged(session, text, () => fn(s), game);
}

/** Show or hide a space's name on the board (viewers see it only when it's shown). */
export function editShowName(game: Game, session: Session, id: string, on: boolean, hide = false): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  logged(session, nameShownLabel({ name: said(game, session, s, hide) }, on), () => setNameShown(s, on), game);
}

/** Show or hide every space's name. */
export function editAllNames(game: Game, session: Session, on: boolean): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  logged(session, allNamesLabel(on), () => setAllNamesShown(round, on), game);
}

export function editStart(game: Game, session: Session, id: string, hide = false): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  logged(session, `Made ${nm(game, session, s, hide)} Start`, () => (round.start = id), game);
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
