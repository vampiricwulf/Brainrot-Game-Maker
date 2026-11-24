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
 * the space whose ⚙ Buttons… window is open (in one window it goes over the host panel). `also`: the other spaces
 * selected with the picked one (Shift+click, as in the editor): they move and delete together; the panel shows the
 * picked one. `several`: ☑ Select several is on (a touch screen's Shift): a tap on a space adds it or leaves it out.
 */
export const boardEdit = $state<{
  on: boolean;
  sel: string | null;
  also: string[];
  link: LinkRef | null;
  adding: boolean;
  connecting: boolean;
  buttons: string | null;
  several: boolean;
}>({
  on: false,
  sel: null,
  also: [],
  link: null,
  adding: false,
  connecting: false,
  buttons: null,
  several: false,
});

/** Clear what's picked and waiting (edit mode stays as it is). */
export function editIdle(): void {
  boardEdit.sel = null;
  boardEdit.also = [];
  boardEdit.link = null;
  boardEdit.adding = false;
  boardEdit.connecting = false;
}

/** Edit mode on or off (off: nothing stays picked, nor a ⚙ Buttons… window open). */
export function setEditing(on: boolean): void {
  editIdle();
  boardEdit.several = false;
  if (!on) boardEdit.buttons = null;
  boardEdit.on = on;
}

/** The spaces selected: the picked one last. */
export function editPicked(): string[] {
  return boardEdit.sel ? [...boardEdit.also.filter((id) => id !== boardEdit.sel), boardEdit.sel] : [];
}

/** Pick just this space (or none): the others selected with it let go. */
export function editPick(id: string | null): void {
  boardEdit.sel = id;
  boardEdit.also = [];
}

/**
 * A right-click on a space: it's picked, so its menu's ✎ Rename and 🔗 Connect to… (and the panel) act on it. One of
 * several selected stays with them, so Delete still deletes them all; any other is picked alone.
 */
export function editFocus(id: string): void {
  const all = editPicked();
  if (!all.includes(id)) return editPick(id);
  boardEdit.sel = id;
  boardEdit.also = all.filter((x) => x !== id);
}

/**
 * Shift+click on a space: it joins the selection (picked, so the panel shows it), or leaves it when it's in it already
 * (the one picked before it is picked again).
 */
export function editToggle(id: string): void {
  const all = editPicked();
  const now = all.includes(id) ? all.filter((x) => x !== id) : [...all, id];
  boardEdit.sel = now.at(-1) ?? null;
  boardEdit.also = now.slice(0, -1);
  boardEdit.link = null;
  boardEdit.adding = false;
  boardEdit.connecting = false;
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
  edit(
    game,
    session,
    (h) => `Added space “${name}”${after ? ` after ${nm(game, session, after, h)}` : ''}`,
    () => (id = addLiveSpace(round, at, after).id),
  );
  boardEdit.adding = false;
  boardEdit.link = null;
  editPick(id);
}

/**
 * Start dragging a space (or several selected together, `count`): everything until the returned end() is one step,
 * “Moved space …” or “Moved 3 spaces” (nothing if it didn't move).
 */
export function editDrag(game: Game, session: Session, id: string, count = 1): () => void {
  const { round } = boardNow(game, session);
  const done = startStep(session, game);
  const label = (h: boolean) => (count > 1 ? `Moved ${count} spaces` : `Moved space ${nm(game, session, round && spaceById(round, id), h)}`);
  return () => done(label(false), label(true));
}

export function editDelete(game: Game, session: Session, id: string, hide = false): void {
  const { round, bs } = boardNow(game, session);
  if (!round) return;
  if (round.spaces.length <= 1) return void toast('A board needs a space: add another before deleting this one');
  const res: { done?: Deleted } = {};
  edit(
    game,
    session,
    (h) => `Deleted space ${nm(game, session, spaceById(round, id), h)}`,
    () => (res.done = deleteLiveSpace(session, round, bs, id, (s) => said(game, session, s, true)) ?? undefined),
  );
  // (The log says who moved where: the step's own name is fixed before it runs, so it's said here too.)
  const last = session.actionLog?.at(-1);
  const { done } = res;
  if (last && done) {
    last.text = done.text;
    if (done.quiet !== done.text) last.quiet = done.quiet;
    else delete last.quiet;
  }
  if (boardEdit.sel === id) editPick(null);
  boardEdit.link = null;
  if (done) toast(hide ? done.quiet : done.text, 4000);
}

/**
 * Delete several spaces as one step, “Deleted 3 spaces” (the log says who moved where). A board keeps one space: with
 * every space selected, nothing is deleted.
 */
export function editDeleteAll(game: Game, session: Session, ids: string[], hide = false): void {
  const { round, bs } = boardNow(game, session);
  if (!round) return;
  ids = ids.filter((id) => spaceById(round, id));
  if (ids.length === 1) return editDelete(game, session, ids[0], hide);
  if (!ids.length) return;
  if (round.spaces.length <= ids.length) return void toast('A board needs a space: leave one out of the selection (Shift+click it)');
  const done: Deleted[] = [];
  logged(
    session,
    `Deleted ${ids.length} spaces`,
    () => {
      for (const id of ids) {
        const d = deleteLiveSpace(session, round, bs, id, (s) => said(game, session, s, true));
        if (d) done.push(d);
      }
    },
    game,
  );
  // (The log says who moved where, as one space's delete does: each player moved, where they ended up.)
  const moved = [...new Set(done.flatMap((d) => d.moved.map((m) => m.playerId)))].filter((pid) => session.players.some((p) => p.id === pid));
  const line = (h: boolean) => {
    const m = moved.map(
      (pid) => `${session.players.find((p) => p.id === pid)?.name ?? '?'} moved to ${said(game, session, spaceById(round, bs?.positions[pid]?.space), h)}`,
    );
    return `Deleted ${ids.length} spaces${m.length ? ` (${m.join('; ')})` : ''}`;
  };
  const [text, quiet] = [line(false), line(true)];
  const last = session.actionLog?.at(-1);
  if (last && last.text === `Deleted ${ids.length} spaces`) {
    last.text = text;
    if (quiet !== text) last.quiet = quiet;
    else delete last.quiet;
  }
  editPick(null);
  boardEdit.link = null;
  toast(hide ? quiet : text, 4000);
}

/** Connect the space picked to another (one way, from → to). */
export function editConnect(game: Game, session: Session, from: string, to: string, hide = false): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  boardEdit.connecting = false;
  if (from === to) return;
  const [a, b] = [spaceById(round, from), spaceById(round, to)];
  if (a?.next.includes(to)) return void toast(`${nm(game, session, a, hide)} already leads to ${nm(game, session, b, hide)}`);
  edit(
    game,
    session,
    (h) => `Connected ${said(game, session, a, h)} → ${said(game, session, b, h)}`,
    () => connectSpaces(round, from, to),
  );
  editPick(null);
  boardEdit.link = { from, to };
}

export function editDisconnect(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  edit(
    game,
    session,
    (h) => `Disconnected ${arrow(game, session, l, h)}`,
    () => disconnectSpaces(round, l.from, l.to),
  );
  boardEdit.link = null;
}

export function editBothWays(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  const both = !!spaceById(round, l.to)?.next.includes(l.from);
  edit(
    game,
    session,
    (h) => `Made ${arrow(game, session, l, h)} ${both ? 'one way' : 'both ways'}`,
    () => toggleBothWays(round, l.from, l.to),
  );
}

export function editReverse(game: Game, session: Session, l: LinkRef): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  edit(
    game,
    session,
    (h) => `Reversed ${arrow(game, session, l, h)}`,
    () => reverseLink(round, l.from, l.to),
  );
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
  edit(
    game,
    session,
    (h) => nameShownLabel({ name: said(game, session, s, h) }, on),
    () => setNameShown(s, on),
  );
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
  edit(
    game,
    session,
    (h) => `Made ${nm(game, session, s, h)} Start`,
    () => (round.start = id),
  );
}

/**
 * 💾 Keep in game: the board as it is now goes into the game in the editor, so it's there next time (a step of the
 * editor's history, as the RPG's Keep in game is).
 */
export function editKeep(game: Game, session: Session): void {
  const { round } = boardNow(game, session);
  if (!round) return;
  if (app.game.id !== game.id) return void toast('The editor has a different game open, so there’s nowhere to keep it');
  toast(
    step(`Kept the board of “${round.name}” from the show`, () => keepBoard(game, app.game, round.id), { during: 'play' }),
    4000,
  );
}
