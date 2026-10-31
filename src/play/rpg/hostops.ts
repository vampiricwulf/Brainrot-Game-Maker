// The RPG host's moves, shared by the host panel and the keyboard shortcuts. Every change is one undoable step.
import {
  isRpg, newId, newImageEl, newTextEl, SLIDE_H, SLIDE_W, type Action, type Dir8, type Game, type InventoryEntry, type Position, type Screen, type ScreenRef, type Session,
  type SlideElement, type World, type WorldState,
} from '../../lib/model';
import {
  activeParty, allElements, audienceSees, avatarBoxes, classLabel, DIR_NAME, DIR_VEC, DIRS, exitOf, findIn, focusRef, joinParty, moveTo, neverShown, overlaps, override, partyOn, partyScreen, regroup,
  screenElements, splitParty, step, worldById,
} from '../../lib/rpg';
import { bounds, catchable, type Box } from '../../lib/layers';
import { nameList } from '../../lib/session';
import { addStat, currencyFields, entryName, formatStat, giveItem, inventory, itemDef, logged, statFields, statRoom, transferEntry } from '../../lib/toolset';
import { addMediaFile } from '../../lib/media.svelte';
import { app, toast } from '../../lib/app.svelte';
import { describeAction, needsPlayers, runAction, type RunContext } from '../../lib/actions';
import { offerIn } from '../host/offered.svelte';
import { blip } from '../../lib/live';
import { announce } from '../../lib/announce';
import { menuOf, type MenuEntry, type MenuItem } from '../../lib/menustate.svelte';
import { objectsWhere } from '../../lib/refs';
import { newAudioEl, newVideoEl } from '../../lib/model';

/** The RPG round being played, its world and the world's state (all undefined outside an RPG round). */
export function rpgNow(game: Game, session: Session) {
  const round = game.rounds[session.currentRound];
  if (session.phase !== 'rpg' || !isRpg(round)) return {};
  const world = worldById(game, round.world);
  // goToRound set the state up (reading only: this runs inside derived values).
  const st = world ? session.worlds?.[world.id] : undefined;
  return { round, world, st };
}

/**
 * A name or some text the RPG host panel is asking for, inline (a browser dialog would show on stream): a new screen
 * that way, a new look for this screen, text for the screen (`at`: where the stage was right-clicked), or a party's
 * new name.
 */
export type RpgAsk = { what: 'screen'; dir: Dir8 } | { what: 'look' } | { what: 'text'; at?: StagePoint } | { what: 'party'; party: string };

/** Where on the stage the host clicked (1920×1080), and on which screen in split view. */
export type StagePoint = { x: number; y: number; screen?: ScreenRef };

/** Said when a move would happen unseen under the round's title card. */
export const START_FIRST = 'Start the round first (N, or click the title card)';

/** Step the active party. Returns what to tell the host when it couldn't. */
export function stepParty(game: Game, session: Session, dir: Dir8): string | null {
  // (Not under the round's title card: nobody would see the party move, and the step sound would play over it.)
  if (session.intro) return START_FIRST;
  const { world, st } = rpgNow(game, session);
  if (!world || !st) return 'No world to move in';
  let why: string | null = null;
  // Which party, once there are several.
  const who = st.parties.length > 1 ? (activeParty(st)?.name ?? 'Party') : 'Party';
  logged(session, `${who} ${DIR_NAME[dir].toLowerCase()}`, () => (why = step(game, st, world, dir)));
  // A step, through a way that leads somewhere else, or no way at all.
  blip(app.live, why ? 'blocked' : st.lastMove?.dir === 'warp' ? 'doorway' : 'step');
  // Where they are now, for screen readers (it shows on the stage and in the panel, not in the status line).
  const at = why ? null : focusRef(st);
  const here = at && findIn(world, at);
  if (here) announce(`${who} moved to ${here.screen.name}`);
  return why;
}

/** Everyone back in one party: where the followed party is, or with `partyId` where that party is. */
export function regroupAll(game: Game, session: Session, partyId?: string): void {
  const { world, st } = rpgNow(game, session);
  if (!world || !st) return;
  const with_ = st.parties.find((p) => p.id === partyId) ?? activeParty(st);
  logged(session, with_ ? `Regroup with ${with_.name}` : 'Regroup', () => {
    if (with_) st.active = with_.id;
    regroup(game, st, world, session.players.map((p) => p.id));
  });
  // Where everyone is now, for screen readers (as after a step).
  const at = focusRef(st);
  const here = at && findIn(world, at);
  if (here) announce(`Everyone is together in ${here.screen.name}`);
}

export function splitOff(game: Game, session: Session, ids: string[]): string | null {
  const { st } = rpgNow(game, session);
  if (!st) return 'No world';
  if (!ids.length) return 'Select the players who split off first (1–9)';
  // Everyone, or players standing in different places, would make one party in two places.
  if (ids.length === session.players.length) return st.parties.length === 1 ? 'That’s everyone: select only the ones who split off' : 'That’s everyone: 🤝 Regroup (G) brings everyone together';
  const screens = new Set(ids.map((id) => st.positions[id]?.screen));
  if (screens.size > 1) return 'They aren’t all in one place: split off players standing together (or move them together first)';
  logged(session, `Split off ${names(session, ids)}`, () => splitParty(st, ids));
  return null;
}

export function toggleMap(game: Game, session: Session): void {
  const { st } = rpgNow(game, session);
  if (st) st.mapShown = !st.mapShown;
}

/** Players' names for the log and the host ("Ann, Bob & Cy"). */
export const names = (session: Session, ids: string[]) => nameList(ids.map((id) => session.players.find((p) => p.id === id)?.name ?? '?'));

/**
 * Send players to a screen as one step (not their whole party, unless they're all of it): they join a party already
 * standing there, else make one of their own, and viewers follow them. `at`: where they stand on it (dropped on a
 * split-view pane); `via`: the side they walked out of; `label`: who they are in the log (a party's name). Returns what
 * to tell the host.
 */
export function sendPlayers(
  game: Game,
  session: Session,
  ids: string[],
  to: ScreenRef,
  { at, via = null, label }: { at?: { x: number; y: number }; via?: Dir8 | null; label?: string } = {},
): string | null {
  const { world, st } = rpgNow(game, session);
  const found = world && findIn(world, to);
  if (!world || !st || !found || !ids.length) return null;
  const text = `${label ?? names(session, ids)} → ${found.screen.name}`;
  logged(session, text, () => {
    moveTo(game, st, world, to, { players: ids, via });
    // Side by side where they were dropped.
    if (at) ids.forEach((id, i) => Object.assign(st.positions[id], avatarSpot(at.x + (i - (ids.length - 1) / 2) * 170, at.y)));
  });
  return text;
}

/**
 * The players on a map screen were dragged onto another (the minimap's or the full map's dots): every party standing
 * there goes, as the dots dragged showed them all. (Not a party whose avatars are all hidden: it had no dot to drag.
 * A party with a dot goes whole, hidden members too.) Returns what to tell the host.
 */
export function sendPartiesOn(game: Game, session: Session, from: ScreenRef, to: ScreenRef): string | null {
  if (session.intro) return START_FIRST;
  const { st } = rpgNow(game, session);
  if (!st) return null;
  const dot = (m: string) => st.positions[m]?.screen === from.screen && !st.positions[m].hidden;
  const parties = st.parties.filter((p) => partyScreen(st, p)?.screen === from.screen && p.members.some(dot));
  return sendPlayers(game, session, parties.flatMap((p) => p.members), to, { label: parties.length === 1 ? parties[0].name : undefined });
}

/** Players join a party (dropped on its chip, or from their menu): they go to where it is. Returns what to tell the host. */
export function joinPartyNow(game: Game, session: Session, ids: string[], partyId: string): string | null {
  const { world, st } = rpgNow(game, session);
  const party = st?.parties.find((p) => p.id === partyId);
  const who = ids.filter((id) => !party?.members.includes(id));
  if (!world || !st || !party || !who.length) return null;
  const text = `${names(session, who)} ${who.length > 1 ? 'join' : 'joins'} ${party.name}`;
  logged(session, text, () => joinParty(game, st, world, who, party.id));
  return text;
}

/**
 * Who a map's right-click menu can move to a screen: the followed party, the selected players, each other party, or
 * everyone. `go` moves them (no players: the followed party), with who they are for the log.
 */
export function moveChoices(session: Session, st: WorldState, selected: string[], go: (players?: string[], label?: string) => void): MenuItem[] {
  const party = activeParty(st);
  return [
    { label: `▶ Move ${party?.name ?? 'the party'} here`, onclick: () => go() },
    { label: `Only the selected (${selected.length})`, disabled: !selected.length, onclick: () => go(selected, `${selected.length} selected`) },
    ...st.parties.filter((pt) => pt.id !== party?.id).map((pt) => ({ label: `Move ${pt.name} here`, onclick: () => go(pt.members, pt.name) })),
    ...(st.parties.length > 1 ? [{ label: 'Everyone here', onclick: () => go(session.players.map((p) => p.id), 'Everyone') }] : []),
  ];
}

/**
 * Where the host dropped a dragged avatar: a spot on its own screen, another screen (`at`: a spot on it, dropped on a
 * split-view pane; `via`: walked off that side of its own), or a party.
 */
export type AvatarDrop = { spot: { x: number; y: number } } | { to: ScreenRef; at?: { x: number; y: number }; via?: Dir8 | null } | { party: string };

/**
 * A box drawn on the RPG stage (by the host): the players and objects inside it now, whether it adds to what was
 * selected when the press began (Shift, Ctrl or ⌘ held, or a touch), and how far it's got: 'move' while it's drawn,
 * 'end' when let go (a click on an empty spot is an 'end' with nothing in it), 'cancel' (Esc, or the browser took the
 * pointer): the selection goes back to what it was.
 */
export type BandPick = { players: string[]; objects: string[]; add: boolean; phase: 'move' | 'end' | 'cancel' };

/**
 * An avatar dropped past an edge of its screen (at x, y on it): the way out on that side, when there's one (an open
 * side, or a way sent somewhere else), as the pad would take it.
 */
export function wayOffEdge(world: World, from: ScreenRef, x: number, y: number): { to: ScreenRef; via: Dir8 | null } | null {
  const dx = x < 0 ? -1 : x > SLIDE_W ? 1 : 0;
  const dy = y < 0 ? -1 : y > SLIDE_H ? 1 : 0;
  const dir = DIRS.find((d) => DIR_VEC[d][0] === dx && DIR_VEC[d][1] === dy);
  const found = dir && findIn(world, from);
  if (!dir || !found) return null;
  const e = exitOf(found.map, found.screen, dir);
  return (e.kind === 'open' || e.kind === 'warp') && findIn(world, e.to) ? { to: e.to, via: e.kind === 'open' ? dir : null } : null;
}

/** Half an avatar (its token and nameplate): a dropped avatar stays this far inside its screen. */
const HALF = 75;

/** Where a dragged avatar may stand: all of it on its screen, and between `top` and `bottom` (clear of the stats strip). */
export function avatarSpot(x: number, y: number, top = 0, bottom = SLIDE_H): { x: number; y: number } {
  const fit = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(Math.max(lo, hi), v)));
  return { x: fit(x, HALF, SLIDE_W - HALF), y: fit(y, top + HALF, bottom - HALF) };
}

/** Something dragged along in a group: where it is, and the range its own x and y may go in (to stay on its screen). */
export type GroupItem = { x: number; y: number; minX: number; maxX: number; minY: number; maxY: number };

/** The range an avatar standing on a screen may go in: all of it on the screen, between `top` and `bottom`. */
export const avatarRange = (x: number, y: number, top = 0, bottom = SLIDE_H): GroupItem => ({
  x, y, minX: HALF, maxX: SLIDE_W - HALF, minY: top + HALF, maxY: Math.max(top + HALF, bottom - HALF),
});

/** The range an object (its box, `w`×`h` at x, y) may go in: all of it on the screen. */
export const objectRange = (x: number, y: number, w: number, h: number): GroupItem => ({ x, y, minX: 0, maxX: SLIDE_W - w, minY: 0, maxY: SLIDE_H - h });

/**
 * How far a group dragged by (dx, dy) moves: the same for everything in it (they keep their places), but no further than
 * keeps every one of them on its screen. One already past an edge isn't pulled back (it only can't go further out).
 */
export function groupDelta(items: GroupItem[], dx: number, dy: number): { dx: number; dy: number } {
  const axis = (d: number, at: (i: GroupItem) => number, lo: (i: GroupItem) => number, hi: (i: GroupItem) => number) => {
    let min = -Infinity;
    let max = Infinity;
    for (const i of items) {
      min = Math.max(min, Math.min(0, lo(i) - at(i)));
      max = Math.min(max, Math.max(0, hi(i) - at(i)));
    }
    return Math.round(Math.max(min, Math.min(max, d)));
  };
  return { dx: axis(dx, (i) => i.x, (i) => i.minX, (i) => i.maxX), dy: axis(dy, (i) => i.y, (i) => i.minY, (i) => i.maxY) };
}

/** Names in a step's label, kept short: "Ann, Bob & Cy", or past four "Ann, Bob, Cy & 5 more". */
export function shortList(names: string[], max = 4): string {
  return names.length <= max ? nameList(names) : `${names.slice(0, max - 1).join(', ')} & ${names.length - max + 1} more`;
}

/** What a step says for objects viewers don't see, in place of their names ("a hidden object", "2 hidden objects"). */
const hiddenCount = (n: number) => (n === 1 ? 'a hidden object' : `${n} hidden objects`);

/**
 * Players and objects on the stage dragged together to new spots (by id), as one undo step named after them ("Move Ann,
 * Bob & Chest"; past four, "Move Ann, Bob, Cy & 5 more"). An object viewers don't see is "a hidden object" in the step's
 * words for one window. Nothing that moves (a group held at an edge): no step. Returns its name.
 */
export function moveGroup(game: Game, session: Session, players: Record<string, { x: number; y: number }>, objects: Record<string, { x: number; y: number }>): string | null {
  const { st } = rpgNow(game, session);
  if (!st) return null;
  const who = Object.keys(players).filter((id) => {
    const p = st.positions[id];
    return p && (p.x !== players[id].x || p.y !== players[id].y);
  });
  const what = Object.keys(objects).flatMap((id) => {
    const found = objectAt(game, session, id);
    const o = st.objects[id];
    if (!found || ((o?.x ?? found.el.x) === objects[id].x && (o?.y ?? found.el.y) === objects[id].y)) return [];
    return [{ id, name: objectName(found.el), seen: audienceSees(found.el, o) }];
  });
  if (!who.length && !what.length) return null;
  const pl = who.map((id) => session.players.find((p) => p.id === id)?.name ?? '?');
  const text = `Move ${shortList([...pl, ...what.map((o) => o.name)])}`;
  const hidden = what.filter((o) => !o.seen).length;
  const quiet = hidden ? `Move ${shortList([...pl, ...what.filter((o) => o.seen).map((o) => o.name), hiddenCount(hidden)])}` : undefined;
  logged(
    session,
    text,
    () => {
      for (const id of who) Object.assign(st.positions[id], players[id]);
      for (const o of what) Object.assign(override(st, o.id), objects[o.id]);
    },
    undefined,
    quiet,
  );
  return text;
}

/**
 * An object dragged on its own to a new spot on its screen, as one step ("Move Lava"; one viewers don't see is "Move a
 * hidden object" in one window). Dropped where it was: no step. True when it moved.
 */
export function moveObject(game: Game, session: Session, elId: string, at: { x: number; y: number }): boolean {
  const found = objectAt(game, session, elId);
  const o = found?.st.objects[elId];
  if (!found || ((o?.x ?? found.el.x) === at.x && (o?.y ?? found.el.y) === at.y)) return false;
  logged(session, `Move ${objectName(found.el)}`, () => Object.assign(override(found.st, elId), at), undefined, audienceSees(found.el, o) ? undefined : `Move ${hiddenCount(1)}`);
  return true;
}

/** An object as big as its screen (a picture behind everything): a press on it draws a box, as on an empty spot. */
export function fillsScreen(el: Box): boolean {
  const b = bounds(el);
  return b.x <= 0 && b.y <= 0 && b.x + b.w >= SLIDE_W && b.y + b.h >= SLIDE_H;
}

/** A quarter of its screen or more: dragged on its own, the first time in a game, a hint says how to box over it. */
export const bigObject = (el: { w: number; h: number }): boolean => el.w * el.h >= (SLIDE_W * SLIDE_H) / 4;

/** Can a box on the stage catch this object (the things that move in play, unlocked, that viewers can be shown)? */
export const boxCatches = (el: SlideElement): boolean => catchable({ class: el.role?.class, locked: el.locked, neverShown: neverShown(el) });

/**
 * Select everything here (the stage's menu): the players standing on a screen (not hidden) and the objects on it a box
 * would catch (in one window, only those viewers see: the others aren't on the stage).
 */
export function everythingOn(game: Game, session: Session, ref: ScreenRef, oneWindow: boolean): { players: string[]; objects: string[] } {
  const { world, st } = rpgNow(game, session);
  const found = world && findIn(world, ref);
  if (!st || !found) return { players: [], objects: [] };
  return {
    players: session.players.filter((p) => st.positions[p.id]?.screen === ref.screen && !st.positions[p.id].hidden).map((p) => p.id),
    objects: screenElements(st, found.screen, oneWindow).filter(boxCatches).map((el) => el.id),
  };
}

/**
 * One window (viewers see the host panel): what it calls each secret object on a screen, in place of its name ("🙈
 * Hidden object 1"…). Not what viewers never see anyway (an arrival point), nor what the host put there during the show
 * (they made it in front of viewers): those keep their names.
 */
export function hiddenNames(st: WorldState | undefined, screen: Screen): Map<string, string> {
  const out = new Map<string, string>();
  const added = new Set((st?.added[screen.id] ?? []).map((e) => e.id));
  for (const el of screenElements(st, screen, false)) if (el.secret && !neverShown(el) && !added.has(el.id) && (el.role || el.name)) out.set(el.id, `🙈 Hidden object ${out.size + 1}`);
  return out;
}

/**
 * Players sent to another screen go without the objects selected (they stay on their screen): what the toast adds,
 * "Sword stays on Start", "Sword & Gold pile stay on Start" ('' with none). One window never names a hidden one.
 */
export function staysWords(game: Game, session: Session, objects: string[], oneWindow: boolean): string {
  const { st } = rpgNow(game, session);
  const found = objects.flatMap((id) => objectAt(game, session, id) ?? []).filter((f) => !st?.objects[f.el.id]?.taken);
  if (!found.length) return '';
  const shown = found.filter((f) => !oneWindow || audienceSees(f.el, st?.objects[f.el.id])).map((f) => objectName(f.el));
  const hidden = found.length - shown.length;
  const what = shortList([...shown, ...(hidden ? [hiddenCount(hidden)] : [])]);
  const one = found.length === 1;
  return new Set(found.map((f) => f.screen.id)).size === 1 ? `${what} ${one ? 'stays' : 'stay'} on ${found[0].screen.name}` : `${what} stay where they are`;
}

/**
 * The RPG box's selection line: who and what is selected ("Ann, Bob · Sword, Gold pile"). In one window an object
 * viewers don't see is counted, never named ("Ann · 1 hidden object"). Empty: nothing is.
 */
export function selectionWords(game: Game, session: Session, players: string[], objects: string[], oneWindow: boolean): string {
  const { st } = rpgNow(game, session);
  const who = players.flatMap((id) => session.players.find((p) => p.id === id)?.name ?? []);
  const shown: string[] = [];
  let hidden = 0;
  for (const id of objects) {
    const found = objectAt(game, session, id);
    if (!found) continue;
    if (oneWindow && !audienceSees(found.el, st?.objects[id])) hidden++;
    else shown.push(objectName(found.el));
  }
  const things = [...shown, ...(hidden ? [`${hidden} hidden object${hidden === 1 ? '' : 's'}`] : [])];
  return [who.join(', '), things.join(', ')].filter(Boolean).join(' · ');
}

/** What an object is called on its card, in menus and in the log. */
export const objectName = (el: SlideElement) => el.name || (el.role ? classLabel(el.role.class) : 'Object');

/**
 * Take an object off its screen (undoable). Returns what to tell the host: in one window (`oneWindow`) one viewers don't
 * see isn't named ("Removed a hidden object"), nor is it in the step's words there.
 */
export function removeObject(game: Game, session: Session, elId: string, oneWindow = false): string | null {
  const found = objectAt(game, session, elId);
  if (!found) return null;
  const name = objectName(found.el);
  const seen = audienceSees(found.el, found.st.objects[elId]);
  logged(session, `Remove ${name}`, () => (override(found.st, elId).taken = true), undefined, seen ? undefined : `Remove ${hiddenCount(1)}`);
  return `Removed ${oneWindow && !seen ? hiddenCount(1) : name} · Ctrl+Z brings it back`;
}

/**
 * An object whose name one window never says (see hiddenNames): a secret one, made in the editor, viewers don't see. Not
 * what viewers never see anyway, nor what the host put there during the show (they made it in front of viewers).
 */
export function nameSecret(st: WorldState, screen: Screen, el: SlideElement): boolean {
  return !audienceSees(el, st.objects[el.id]) && !neverShown(el) && !(st.added[screen.id] ?? []).some((e) => e.id === el.id);
}

/**
 * A step about an object, said two ways: with its name, and for one window ("a hidden object") while its name is a
 * secret (`secret`: nameSecret), so a step made with the audience window open never names it there later
 * (ActionEvent.quiet).
 */
export function objectSay(el: SlideElement, secret: boolean, say: (name: string) => string): [text: string, quiet: string | undefined] {
  const quiet = say(hiddenCount(1));
  return [say(objectName(el)), secret ? quiet.charAt(0).toUpperCase() + quiet.slice(1) : undefined];
}

/** Show or hide an object for viewers, as one step (a Reveal never names a secret one in one window's history). */
export function setObjectShown(game: Game, session: Session, elId: string, shown: boolean): void {
  const found = objectAt(game, session, elId);
  if (!found) return;
  const { st, screen, el } = found;
  const [text, quiet] = objectSay(el, nameSecret(st, screen, el), (n) => `${shown ? 'Reveal' : 'Hide'} ${n}`);
  logged(session, text, () => (override(st, elId).shown = shown), undefined, quiet);
}

/** What an object's card's buttons run with (the round's run context, without who they're for). */
export type ObjectRun = Pick<RunContext, 'live' | 'selected' | 'teams'>;

/**
 * One of an object's card's buttons, in the card's words and order: its card and its menu show the same list. `run`
 * does it and says what to tell the host (`close`: the card closes after). `asks`: it asks something first, so its
 * menu item opens the card instead ('who': nobody to run it for; 'locked': a locked doorway asks before going through).
 */
export interface ObjectAct {
  id: string;
  label: string;
  run: () => { text?: string; close?: boolean };
  asks?: 'who' | 'locked';
  disabled?: boolean;
  title?: string;
  /** A small button on its card (🔒 Lock, ▶ Run all). */
  small?: boolean;
}

/**
 * A Reveal or Hide action pointing at an object whose name one window never says (nameSecret): the screen it's on and
 * what the host panel calls it there (hiddenNames: "🙈 Hidden object 1", when it has one). Null for any other action.
 */
export function secretTarget(game: Game, session: Session, a: Action): { screen: string; alias?: string } | null {
  if ((a.do !== 'reveal' && a.do !== 'hide') || !a.object) return null;
  const t = objectAt(game, session, a.object);
  if (t) return nameSecret(t.st, t.screen, t.el) ? { screen: t.screen.name, alias: hiddenNames(t.st, t.screen).get(t.el.id) } : null;
  // (On a look of its screen not up now: secret as its author made it.)
  const o = game.worlds?.flatMap(objectsWhere).find((x) => x.el.id === a.object);
  return o?.el.secret && !neverShown(o.el) ? { screen: o.screen.name } : null;
}

/**
 * An object's card's buttons (ObjectCard draws them; its menu lists them first). `picked`: the players picked on the
 * card (or selected), null for nobody, so they're for everyone standing there. `oneWindow`: viewers see them, so a
 * Reveal or Hide of a secret object never names it (secretTarget), nor does what a button tells the host.
 */
export function objectActs(game: Game, session: Session, elId: string, run: ObjectRun, picked: string[] | null, oneWindow = false): ObjectAct[] {
  const found = objectAt(game, session, elId);
  if (!found) return [];
  const { world, st, screen, el } = found;
  const o = st.objects[el.id];
  const role = el.role;
  const secret = nameSecret(st, screen, el);
  const title = objectName(el);
  const here = session.players.filter((p) => st.positions[p.id]?.screen === screen.id).map((p) => p.id);
  const who = picked ?? here;
  const whoNames = names(session, who) || 'nobody';
  const teams = !!run.teams;
  const ctx: RunContext = { game, session, live: run.live, world, st, selected: run.selected, teams, chosen: who, at: screen.id, offerCard: offerIn(session, `object:${el.id}`), hide: oneWindow };
  /**
   * An action's words: one window's (`quiet`) never name a secret object it reveals or hides, saying "a hidden object"
   * (a button: what the host panel calls it, `alias`, so two of them can be told apart).
   */
  const words = (a: Action, quiet: boolean, alias = false) => {
    const t = quiet && secretTarget(game, session, a);
    return t ? `${a.do === 'reveal' ? 'Reveal' : 'Hide'} ${(alias && t.alias) || hiddenCount(1)} (${t.screen})` : describeAction(game, a, undefined, teams);
  };
  /** A step's two texts (ActionEvent.quiet): one window's names neither this object nor what it reveals while they're secret. */
  const say = (what: (quiet: boolean) => string): [text: string, quiet: string | undefined] => {
    const text = `${title}: ${what(false)}`;
    const quiet = `${secret ? 'A hidden object' : title}: ${what(true)}`;
    return [text, quiet === text ? undefined : quiet];
  };
  const said = (a: Action) => say((q) => words(a, q));
  const acts: ObjectAct[] = [];
  if (role?.class === 'doorway') {
    const locked = o?.locked ?? role.locked ?? false;
    const through = (players?: string[]) => () => goThrough(game, session, el.id, players, here);
    acts.push({ id: 'go', label: '🚪 Go through (party)', run: through(), ...(locked ? { asks: 'locked' as const } : {}) });
    if (picked?.length) acts.push({ id: 'go-only', label: `🚪 Only ${whoNames}`, run: through(who), ...(locked ? { asks: 'locked' as const } : {}) });
    acts.push({
      id: 'lock',
      label: locked ? '🔓 Unlock' : '🔒 Lock',
      small: true,
      run: () => {
        const [text, quiet] = objectSay(el, secret, (n) => `${locked ? 'Unlock' : 'Lock'} ${n}`);
        logged(session, text, () => (override(st, el.id).locked = !locked), undefined, quiet);
        return {};
      },
    });
  } else if (role?.class === 'item' || role?.class === 'currency') {
    // Who picks it up: the first one picked (it goes to one player); with nobody picked, a pile goes to the first one here
    // with room for it.
    const f = role.class === 'currency' ? (statFields(game).find((x) => x.id === role.field) ?? currencyFields(game)[0]) : undefined;
    const picker = !picked && f ? (who.find((id) => statRoom(game, session, id, f) > 0) ?? who[0]) : who[0];
    const pickerName = session.players.find((p) => p.id === picker)?.name ?? 'Nobody';
    const left = pileAmount(st, el);
    // (Only what fits under their max, "🪙15 of 🪙30"; the rest stays on the screen.)
    const fits = f && picker ? Math.min(left, statRoom(game, session, picker, f)) : left;
    const what =
      role.class === 'item' ? count(role.qty ?? 1, itemDef(game, role.item)?.name ?? title) : f ? (fits > 0 && fits < left ? `${formatStat(f, fits)} of ${formatStat(f, left)}` : formatStat(f, left)) : String(left);
    acts.push({
      id: 'pick',
      label: `✋ ${pickerName} picks up ${what}`,
      ...(role.class === 'currency' && !f ? { disabled: true, title: 'Add a currency in 📊 Stats & Items first' } : {}),
      run: () => {
        if (!picker) return { text: 'Pick who picks it up' };
        const before = session.actionLog?.at(-1)?.id;
        const text = pickUp(game, session, st, el, picker);
        // (Only once it was picked up: "can't carry any more" keeps the card open to pick someone else.)
        return { text, close: session.actionLog?.at(-1)?.id !== before };
      },
    });
  }
  if (role?.dialogue) {
    const dialogue = role.dialogue;
    acts.push({ id: 'talk', label: '💬 Talk', run: () => ((run.live.overlay = { kind: 'popup', nonce: newId(), slide: JSON.parse(JSON.stringify(dialogue)), title }), {}) });
  }
  if (role?.shop) {
    const id = role.shop;
    const exists = !!game.shops?.some((x) => x.id === id);
    acts.push({
      id: 'shop',
      label: '🛒 Shop',
      ...(exists ? {} : { disabled: true, title: 'That shop no longer exists: pick another with ✎ Edit' }),
      run: () => (exists ? ((run.live.overlay = { kind: 'shop', nonce: newId(), shopId: id, buyer: who[0] }), {}) : { text: 'That shop no longer exists: pick another with ✎ Edit' }),
    });
  }
  const list = role?.actions ?? [];
  for (const a of list)
    acts.push({
      id: `a:${a.id}`,
      label: words(a, oneWindow, true),
      ...(needsPlayers(a) && !who.length ? { asks: 'who' as const } : {}),
      run: () => (needsPlayers(a) && !who.length ? { text: 'Pick who it’s for first' } : { text: runAction(ctx, a, ...said(a)) }),
    });
  if (list.length > 1)
    acts.push({
      id: 'all',
      label: '▶ Run all',
      small: true,
      title: 'Every action above, in order',
      ...(list.some(needsPlayers) && !who.length ? { asks: 'who' as const } : {}),
      run: () => {
        if (list.some(needsPlayers) && !who.length) return { text: 'Pick who it’s for first' };
        let out: string[] = [];
        // One undoable step for all of them.
        const [text, quiet] = say((q) => list.map((a) => words(a, q)).join(', '));
        logged(session, text, () => (out = list.map((a) => runAction(ctx, a, ...said(a)))), undefined, quiet);
        return { text: out.join(' · ') };
      },
    });
  return acts;
}

/**
 * Go through a doorway object (the party standing at it, or `players`), as one step: they arrive where it leads. `here`:
 * the players on its screen. Returns what to tell the host, and closes its card.
 */
export function goThrough(game: Game, session: Session, elId: string, players: string[] | undefined, here: string[]): { text?: string; close?: boolean } {
  const found = objectAt(game, session, elId);
  const role = found?.el.role;
  const to = role?.to;
  if (!found || !to || !findIn(found.world, to)) return { text: 'This doorway leads nowhere yet' };
  const { world, st, screen, el } = found;
  // "The party" is whoever stands at this doorway (the followed party may be somewhere else).
  const active = activeParty(st)?.members ?? [];
  const partyHere = active.some((m) => here.includes(m));
  const movers = players ?? (partyHere ? undefined : here);
  const label = players ? names(session, players) : 'Party';
  const [text, quiet] = objectSay(el, nameSecret(st, screen, el), (n) => `${label} through ${n}`);
  logged(session, text, () => moveTo(game, st, world, to, { players: movers, arriveAt: role?.arrive }), undefined, quiet);
  blip(app.live, 'doorway');
  announce(`${label} went through ${objectName(el)} to ${findIn(world, to)?.screen.name}`);
  return { close: true };
}

/**
 * An object's right-click menu, on the stage or in the host panel's list: its card's buttons first, in the card's words
 * and order (one that asks something first opens the card), then 🗂 Open its card, ✎ Edit, reveal or hide it, then
 * remove it (`removed` gets what to tell the host; `closed` closes its card once a button says so). `oneWindow`: viewers
 * see the menu, so a secret object with an `alias` (see hiddenNames: "🙈 Hidden object 1") is headed by that, never its
 * name, and its buttons and ✎ Edit wait on its card (behind 👁 Show, as there); nor does a button name a secret object it
 * reveals.
 */
export function objectMenu(
  game: Game,
  session: Session,
  elId: string,
  {
    open,
    removed,
    closed,
    edit,
    run,
    oneWindow = false,
    alias,
  }: { open: () => void; removed: (text: string) => void; closed?: () => void; edit?: () => void; run?: ObjectRun; oneWindow?: boolean; alias?: string },
): MenuEntry[] {
  const found = objectAt(game, session, elId);
  if (!found) return [];
  const { st, el } = found;
  const name = objectName(el);
  const shown = audienceSees(el, st.objects[elId]);
  const masked = oneWindow && !shown && !!alias;
  const acts = run && !masked ? objectActs(game, session, elId, run, run.selected.length ? run.selected : null, oneWindow) : [];
  const press = (a: ObjectAct) => () => {
    if (a.asks) return open();
    const r = a.run();
    if (r.text) toast(r.text, 3000);
    if (r.close) closed?.();
  };
  return menuOf({
    heading: masked ? alias : name,
    now: acts.map((a) => ({ label: a.label, disabled: a.disabled, hint: a.asks === 'who' ? 'Pick who it’s for on its card' : a.asks === 'locked' ? 'It’s locked: its card asks first' : a.title, onclick: press(a) })),
    open: [
      { label: '🗂 Open its card', onclick: open },
      // (Not while it's masked: the live editor lists it by name, on stream. Its card's ✎ Edit waits behind 👁 Show too.)
      ...(edit && !masked ? [{ label: '✎ Edit', hint: 'Its screen in the live editor: move, resize, restyle, or give it actions and dialogue', onclick: edit }] : []),
    ],
    // (Not for hotspots, arrival points and no-go areas: viewers never see them, so a Reveal would do nothing.)
    verbs: neverShown(el) ? [] : [{ label: shown ? '🙈 Hide from viewers' : '👁 Reveal to viewers', onclick: () => setObjectShown(game, session, elId, !shown) }],
    // (Off its screen, for this game: the editor's object stays.)
    delete: { label: '🗑 Remove', keys: 'Delete', onclick: () => removed(removeObject(game, session, elId, oneWindow) ?? '') },
  });
}

/** How much is in a pile of currency now (some may have been picked up already). */
export function pileAmount(st: WorldState | undefined, el: SlideElement): number {
  return st?.objects[el.id]?.amount ?? el.role?.amount ?? 0;
}

/** A player picks up an item or a pile of currency lying on a screen: it's theirs, and gone from the screen. Returns the log line. */
export function pickUp(game: Game, session: Session, st: WorldState, el: SlideElement, playerId: string): string {
  const role = el.role;
  // Currency: only what fits under the player's max; the rest stays on the screen.
  const f = role?.class === 'currency' ? (statFields(game).find((x) => x.id === role.field) ?? currencyFields(game)[0]) : undefined;
  // (No currency in the game: nothing to give, so the pile stays where it is.)
  if (role?.class === 'currency' && !f) return `${objectName(el)} gives no currency: add one in 📊 Stats & Items`;
  const amount = pileAmount(st, el);
  const fits = f ? Math.min(amount, statRoom(game, session, playerId, f)) : amount;
  // What they got ("3 × Potion", "🪙10"), and the object's name when it says something else ("(Treasure)").
  const got = f ? formatStat(f, amount) : role?.class === 'item' ? count(role.qty ?? 1, itemDef(game, role.item)?.name ?? objectName(el)) : objectName(el);
  let text = `${names(session, [playerId])} picks up ${got}${got === objectName(el) ? '' : ` (${objectName(el)})`}`;
  if (f && amount > 0 && fits <= 0) return `${names(session, [playerId])} can’t carry any more ${f.name} (at most ${formatStat(f, f.max ?? 0)})`;
  if (f && fits < amount) text = `${names(session, [playerId])} picks up ${formatStat(f, fits)} of ${objectName(el)} (the most they can carry): ${formatStat(f, amount - fits)} left`;
  logged(session, text, () => {
    if (role?.class === 'item') giveItem(game, session, playerId, role.item ?? null, role.qty ?? 1, role.item ? undefined : objectName(el));
    else if (f) addStat(game, session, playerId, f, fits);
    if (f && fits < amount) override(st, el.id).amount = amount - fits;
    else override(st, el.id).taken = true;
  });
  blip(app.live, 'pickUp');
  return text;
}

/** "2 × Potion", or just "Potion". */
export const count = (n: number, what: string) => (n > 1 ? `${n} × ${what}` : what);

/** A player gives `n` of an inventory entry to another player, as one step. Returns the log line. */
export function giveEntry(game: Game, session: Session, from: string, to: string, entryId: string, n: number): string | null {
  const e = inventory(session, from).find((x) => x.id === entryId);
  if (!e || from === to || !session.players.some((p) => p.id === to)) return null;
  const text = `${names(session, [from])} gives ${count(n, entryName(game, e))} to ${names(session, [to])}`;
  logged(session, text, () => transferEntry(session, from, to, entryId, n, game));
  return text;
}

/**
 * A player drops `n` of an inventory entry on the stage, as one step (it can be picked up again): at a spot on the
 * screen under it (dragged there), else next to them. Returns the log line.
 */
export function dropEntry(game: Game, session: Session, playerId: string, entryId: string, n: number, at?: StagePoint): string | null {
  const { st } = rpgNow(game, session);
  const by = st?.positions[playerId];
  const e = inventory(session, playerId).find((x) => x.id === entryId);
  if (!st || !by || !e) return null;
  const text = `${names(session, [playerId])} drops ${count(n, entryName(game, e))}`;
  logged(session, text, () => {
    const el = droppedObject(game, { ...e, qty: n }, st, by);
    if (at) Object.assign(el, centredOn(at, el.w, el.h));
    const screen = at?.screen?.screen ?? by.screen;
    st.added[screen] ??= [];
    st.added[screen].push(el);
    const list = session.inventories?.[playerId];
    const i = list?.findIndex((x) => x.id === entryId) ?? -1;
    if (list && i >= 0) {
      if (list[i].qty > n) list[i].qty -= n;
      else list.splice(i, 1);
    }
  });
  return text;
}

/** Make a party the one the audience follows and the pad moves. */
export function focusParty(game: Game, session: Session, partyId: string): void {
  const { st } = rpgNow(game, session);
  if (st) st.active = partyId;
}

/** Where something `w`×`h` goes next to a player (below, above, right, left of them) without covering anyone. */
function spotNear(st: WorldState, by: Position, w: number, h: number): { x: number; y: number } {
  const fit = (x: number, y: number) => ({ x: Math.round(Math.max(0, Math.min(SLIDE_W - w, x))), y: Math.round(Math.max(0, Math.min(SLIDE_H - h, y))) });
  const spots = [fit(by.x - w / 2, by.y + 90), fit(by.x - w / 2, by.y - 90 - h), fit(by.x + 100, by.y - h / 2), fit(by.x - 100 - w, by.y - h / 2)];
  const boxes = avatarBoxes(st, by.screen);
  return spots.find((s) => !boxes.some((b) => overlaps({ ...s, w, h }, b))) ?? spots[0];
}

/**
 * An item a player drops on their screen (drop-to-add): its icon, or a label, with the item class so it can be
 * picked up. It lands next to them, clear of the avatars.
 */
export function droppedObject(game: Game, e: InventoryEntry, st: WorldState, by: Position): SlideElement {
  const def = itemDef(game, e.item);
  const size = 160;
  const el: SlideElement = def?.icon
    ? newImageEl(def.icon, size, size)
    : { ...newTextEl(`📦 ${entryName(game, e)}`), size: 44, uppercase: false, autoFit: true, w: 340, h: 90 };
  Object.assign(el, spotNear(st, by, el.w, el.h));
  el.name = entryName(game, e);
  el.role = { class: 'item', item: e.item ?? undefined, qty: e.qty };
  return el;
}

/** Where a player stands, as a screen ref. */
export function whereIs(session: Session, game: Game, playerId: string): ScreenRef | null {
  const { st } = rpgNow(game, session);
  const p = st?.positions[playerId];
  return p ? { map: p.map, screen: p.screen } : null;
}

/** The screen an object is on (authored or added) in the current world. */
export function objectAt(game: Game, session: Session, elId: string) {
  const { world, st } = rpgNow(game, session);
  if (!world || !st) return null;
  for (const map of world.maps)
    for (const screen of map.screens) {
      const el = allElements(st, screen).find((e) => e.id === elId) ?? screen.slide.elements.find((e) => e.id === elId);
      if (el) return { world, st, map, screen, el };
    }
  return null;
}

/** Put an improvised object on a screen (by default the one the audience follows). It starts hidden (the host reveals it). */
export function addLive(game: Game, session: Session, el: SlideElement, text: string, where?: ScreenRef): boolean {
  const { st } = rpgNow(game, session);
  const at = st && (where ?? focusRef(st));
  if (!st || !at) return false;
  el.secret = true;
  logged(session, text, () => {
    st.added[at.screen] ??= [];
    st.added[at.screen].push(el);
  });
  return true;
}

/** Where something `w`×`h` centred on a point of the stage goes, kept on the stage. */
export function centredOn(at: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  return { x: Math.round(Math.max(0, Math.min(SLIDE_W - w, at.x - w / 2))), y: Math.round(Math.max(0, Math.min(SLIDE_H - h, at.y - h / 2))) };
}

/** Text typed onto the stage: a wide band near the top, or lower down where no avatar stands on the screen on air. */
export function liveText(game: Game, session: Session, text: string): SlideElement {
  const el = { ...newTextEl(text), size: 72, w: 1200, h: 200, x: 360, y: 60 };
  el.name = text.length > 24 ? `${text.slice(0, 24)}…` : text;
  const { st } = rpgNow(game, session);
  const at = st && focusRef(st);
  const boxes = st && at ? avatarBoxes(st, at.screen) : [];
  // Below the stats strip when it's at the top.
  const top = game.theme?.scoreBar === 'top' ? 170 : 60;
  el.y = [top, top + 240, top + 480].find((y) => !boxes.some((b) => overlaps({ ...el, y }, b))) ?? top;
  return el;
}

/** A file dropped on the stage: added to the game being played, then shown where it was dropped. */
export async function droppedFile(game: Game, file: File, at: { x: number; y: number }): Promise<SlideElement> {
  const ref = await addMediaFile(game, file);
  const el = ref.kind === 'image' ? newImageEl(ref.id, 480, 480) : ref.kind === 'video' ? newVideoEl(ref.id) : ref.kind === 'audio' ? newAudioEl(ref.id) : null;
  if (!el) throw new Error(`“${file.name}” can’t go on a screen`);
  if (el.kind !== 'audio') Object.assign(el, centredOn(at, el.w, el.h));
  el.name = ref.name;
  return el;
}

export { findIn, focusRef, partyOn };
