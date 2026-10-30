// ✎ Edit board: the host changes the board of the board game being played (the game being played, never the one in
// the editor until 💾 Keep in game). Shared by the host panel, the host's stage and the keyboard. Every change is one
// named undo step (the board goes back with it). A step says a secret space not revealed yet two ways: by its name,
// and as “? (secret)” for a single window, where the panel is on stream (see edit()). `hide`: one window now, for a
// toast.
import { app, toast } from '../../lib/app.svelte';
import { connectSpaces, deleteLiveSpace, disconnectSpaces, keepBoard, reverseLink, toggleBothWays, addLiveSpace, type Deleted } from '../../lib/boardedit';
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

/**
 * One named step. `label` names it with the spaces' names, and again (`hide`) with a secret one not revealed yet as
 * “? (secret)”: the step keeps both, and a single window shows the second, whichever window it was taken in (the Undo
 * tooltip, the last step's line, 📜 Log).
 */
function edit(game: Game, session: Session, label: (hide: boolean) => string, change: () => void): void {
  logged(session, label(false), change, game, label(true));
}
const nm = (game: Game, session: Session, s: BoardSpace | undefined, hide: boolean) => `“${said(game, session, s, hide)}”`;
const arrow = (game: Game, session: Session, l: LinkRef, hide: boolean) => {
  const { round } = boardNow(game, session);
  const a = round && spaceById(round, l.from);
  const b = round && spaceById(round, l.to);
  return `${said(game, session, a, hide)} ${b?.next.includes(l.from) ? '↔' : '→'} ${said(game, session, b, hide)}`;
};

/** A new space at a point of the board, after the space picked (if any). It's picked then. */
export function editAdd(game: Game, session: Session, at: { x: number; y: number }): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const after = spaceById(round, boardEdit.sel ?? undefined);
  const name = nextSpaceName(round);
  let id = '';
  edit(game, session, (h) => `Added space “${name}”${after ? ` after ${nm(game, session, after, h)}` : ''}`, () => (id = addLiveSpace(round, at, after).id));
  boardEdit.adding = false;
  boardEdit.link = null;
  boardEdit.sel = id;
}

/** Start dragging a space: everything until the returned end() is one step, “Moved space …” (nothing if it didn't move). */
export function editDrag(game: Game, session: Session, id: string): () => void {
  const { round } = boardNow(game, session);
  const done = startStep(session, game);
  const label = (h: boolean) => `Moved space ${nm(game, session, round && spaceById(round, id), h)}`;
  return () => done(label(false), label(true));
}

export function editDelete(game: Game, session: Session, id: string, hide = false): void {
  const { round, bs } = boardNow(game, session);
  if (!round) return;
  if (round.spaces.length <= 1) return void toast('A board needs a space: add another before deleting this one');
  const res: { done?: Deleted } = {};
  edit(game, session, (h) => `Deleted space ${nm(game, session, spaceById(round, id), h)}`, () => (res.done = deleteLiveSpace(session, round, bs, id, (s) => said(game, session, s, true)) ?? undefined));
  // (The log says who moved where: the step's own name is fixed before it runs, so it's said here too.)
  const last = session.actionLog?.at(-1);
  const { done } = res;
  if (last && done) {
    last.text = done.text;
    if (done.quiet !== done.text) last.quiet = done.quiet;
    else delete last.quiet;
  }
  if (boardEdit.sel === id) boardEdit.sel = null;
  boardEdit.link = null;
  if (done) toast(hide ? done.quiet : done.text, 4000);
}

/** Connect the space picked to another (one way, from → to). */
export function editConnect(game: Game, session: Session, from: string, to: string, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  boardEdit.connecting = false;
  if (from === to) return;
  const [a, b] = [spaceById(round, from), spaceById(round, to)];
  if (a?.next.includes(to)) return void toast(`${nm(game, session, a, hide)} already leads to ${nm(game, session, b, hide)}`);
  edit(game, session, (h) => `Connected ${said(game, session, a, h)} → ${said(game, session, b, h)}`, () => connectSpaces(round, from, to));
  boardEdit.sel = null;
  boardEdit.link = { from, to };
}

export function editDisconnect(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  edit(game, session, (h) => `Disconnected ${arrow(game, session, l, h)}`, () => disconnectSpaces(round, l.from, l.to));
  boardEdit.link = null;
}

export function editBothWays(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const both = !!spaceById(round, l.to)?.next.includes(l.from);
  edit(game, session, (h) => `Made ${arrow(game, session, l, h)} ${both ? 'one way' : 'both ways'}`, () => toggleBothWays(round, l.from, l.to));
}

export function editReverse(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  edit(game, session, (h) => `Reversed ${arrow(game, session, l, h)}`, () => reverseLink(round, l.from, l.to));
  boardEdit.link = { from: l.to, to: l.from };
}

/**
 * A change to one space (its name, color, secret, notes, Start), as one step called `label` (with `hide`, as a single
 * window says it: see edit()).
 */
export function editSpace(game: Game, session: Session, id: string, label: string | ((hide: boolean) => string), fn: (s: BoardSpace) => void): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  edit(game, session, typeof label === 'string' ? () => label : label, () => fn(s));
}

/** Show or hide a space's name on the board (viewers see it only when it's shown). */
export function editShowName(game: Game, session: Session, id: string, on: boolean): void {
  const { round } = boardNow(game, session);
  const s = round && spaceById(round, id);
  if (!round || !s) return;
  edit(game, session, (h) => nameShownLabel({ name: said(game, session, s, h) }, on), () => setNameShown(s, on));
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
  edit(game, session, (h) => `Made ${nm(game, session, s, h)} Start`, () => (round.start = id));
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
