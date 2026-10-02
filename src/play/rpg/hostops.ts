// The RPG host's moves, shared by the host panel and the keyboard shortcuts. Every change is one undoable step.
import {
  isRpg, newImageEl, newTextEl, SLIDE_H, SLIDE_W, type Dir8, type Game, type InventoryEntry, type Position, type ScreenRef, type Session,
  type SlideElement, type World, type WorldState,
} from '../../lib/model';
import {
  activeParty, allElements, audienceSees, classLabel, DIR_NAME, DIR_VEC, DIRS, exitOf, findIn, focusRef, joinParty, moveTo, override, partyOn, regroup, splitParty,
  step, worldById,
} from '../../lib/rpg';
import { nameList } from '../../lib/session';
import { addStat, currencyFields, entryName, giveItem, inventory, itemDef, logged, statFields, transferEntry } from '../../lib/toolset';
import { addMediaFile } from '../../lib/media.svelte';
import { app } from '../../lib/app.svelte';
import { blip } from '../../lib/live';
import type { MenuEntry } from '../../lib/menustate.svelte';
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

/** Step the active party. Returns what to tell the host when it couldn't. */
export function stepParty(game: Game, session: Session, dir: Dir8): string | null {
  const { world, st } = rpgNow(game, session);
  if (!world || !st) return 'No world to move in';
  let why: string | null = null;
  // Which party, once there are several.
  const who = st.parties.length > 1 ? (activeParty(st)?.name ?? 'Party') : 'Party';
  logged(session, `${who} ${DIR_NAME[dir].toLowerCase()}`, () => (why = step(game, st, world, dir)));
  // A step, through a way that leads somewhere else, or no way at all.
  blip(app.live, why ? 'blocked' : st.lastMove?.dir === 'warp' ? 'doorway' : 'step');
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
export function moveChoices(session: Session, st: WorldState, selected: string[], go: (players?: string[], label?: string) => void): MenuEntry[] {
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

/**
 * Players and objects on the stage dragged together to new spots (by id), as one undo step named after them all
 * ("Move Ann, Bob & Chest"). Returns that name.
 */
export function moveGroup(game: Game, session: Session, players: Record<string, { x: number; y: number }>, objects: Record<string, { x: number; y: number }>): string | null {
  const { st } = rpgNow(game, session);
  if (!st) return null;
  const who = Object.keys(players).filter((id) => st.positions[id]);
  const what = Object.keys(objects).flatMap((id) => {
    const found = objectAt(game, session, id);
    return found ? [{ id, name: objectName(found.el) }] : [];
  });
  if (!who.length && !what.length) return null;
  const text = `Move ${nameList([...who.map((id) => session.players.find((p) => p.id === id)?.name ?? '?'), ...what.map((o) => o.name)])}`;
  logged(session, text, () => {
    for (const id of who) Object.assign(st.positions[id], players[id]);
    for (const o of what) Object.assign(override(st, o.id), objects[o.id]);
  });
  return text;
}

/** What an object is called on its card, in menus and in the log. */
export const objectName = (el: SlideElement) => el.name || (el.role ? classLabel(el.role.class) : 'Object');

/** Take an object off its screen (undoable). Returns what to tell the host. */
export function removeObject(game: Game, session: Session, elId: string): string | null {
  const found = objectAt(game, session, elId);
  if (!found) return null;
  const name = objectName(found.el);
  logged(session, `Remove ${name}`, () => (override(found.st, elId).taken = true));
  return `Removed ${name} · Ctrl+Z brings it back`;
}

/**
 * An object's right-click menu, on the stage or in the host panel's list: open its card, reveal or hide it, remove it
 * (`removed` gets what to tell the host).
 */
export function objectMenu(game: Game, session: Session, elId: string, { open, removed }: { open: () => void; removed: (text: string) => void }): MenuEntry[] {
  const found = objectAt(game, session, elId);
  if (!found) return [];
  const { st, el } = found;
  const name = objectName(el);
  const shown = audienceSees(el, st.objects[elId]);
  return [
    { heading: name },
    { label: '🗂 Open its card', onclick: open },
    { label: shown ? '🙈 Hide from viewers' : '👁 Reveal to viewers', onclick: () => logged(session, `${shown ? 'Hide' : 'Reveal'} ${name}`, () => (override(st, elId).shown = !shown)) },
    { sep: true },
    { label: '🗑 Remove', danger: true, onclick: () => removed(removeObject(game, session, elId) ?? '') },
  ];
}

/** A player picks up an item or a pile of currency lying on a screen: it's theirs, and gone from the screen. Returns the log line. */
export function pickUp(game: Game, session: Session, st: WorldState, el: SlideElement, playerId: string): string {
  const role = el.role;
  const text = `${names(session, [playerId])} picks up ${objectName(el)}`;
  logged(session, text, () => {
    if (role?.class === 'item') giveItem(game, session, playerId, role.item ?? null, role.qty ?? 1, role.item ? undefined : objectName(el));
    else if (role?.class === 'currency') {
      const f = statFields(game).find((x) => x.id === role.field) ?? currencyFields(game)[0];
      if (f) addStat(game, session, playerId, f, role.amount ?? 0);
    }
    override(st, el.id).taken = true;
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
  logged(session, text, () => transferEntry(session, from, to, entryId, n));
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

type Box = { x: number; y: number; w: number; h: number };

/** Each avatar standing on a screen, as the box its token and nameplate cover. */
function avatarBoxes(st: WorldState, screenId: string): Box[] {
  return Object.values(st.positions)
    .filter((p) => p.screen === screenId && !p.hidden)
    .map((p) => ({ x: p.x - 90, y: p.y - 80, w: 180, h: 170 }));
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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
