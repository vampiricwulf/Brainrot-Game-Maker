// The RPG host's moves, shared by the host panel and the keyboard shortcuts. Every change is one undoable step.
import {
  isRpg, newImageEl, newTextEl, SLIDE_H, SLIDE_W, type Dir8, type Game, type InventoryEntry, type Position, type ScreenRef, type Session, type SlideElement,
  type WorldState,
} from '../../lib/model';
import { allElements, DIR_NAME, findIn, focusRef, regroup, splitParty, step, worldById } from '../../lib/rpg';
import { entryName, itemDef, logged } from '../../lib/toolset';
import { addMediaFile } from '../../lib/media.svelte';
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
 * that way, a new look for this screen, or text for the screen (`at`: where the stage was right-clicked).
 */
export type RpgAsk = { what: 'screen'; dir: Dir8 } | { what: 'look' } | { what: 'text'; at?: { x: number; y: number } };

/** Step the active party. Returns what to tell the host when it couldn't. */
export function stepParty(game: Game, session: Session, dir: Dir8): string | null {
  const { world, st } = rpgNow(game, session);
  if (!world || !st) return 'No world to move in';
  let why: string | null = null;
  logged(session, `Party ${DIR_NAME[dir].toLowerCase()}`, () => (why = step(game, st, world, dir)));
  return why;
}

export function regroupAll(game: Game, session: Session): void {
  const { world, st } = rpgNow(game, session);
  if (!world || !st) return;
  logged(session, 'Regroup', () => regroup(game, st, world, session.players.map((p) => p.id)));
}

export function splitOff(game: Game, session: Session, ids: string[]): string | null {
  const { st } = rpgNow(game, session);
  if (!st) return 'No world';
  if (!ids.length) return 'Select the players who split off first (1–9)';
  if (ids.length === session.players.length && st.parties.length === 1) return 'That’s everyone: select only the ones who split off';
  logged(session, `Split off ${ids.map((id) => session.players.find((p) => p.id === id)?.name).join(', ')}`, () => splitParty(st, ids));
  return null;
}

export function toggleMap(game: Game, session: Session): void {
  const { st } = rpgNow(game, session);
  if (st) st.mapShown = !st.mapShown;
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

/** Put an improvised object on the screen the audience follows. It starts hidden (the host reveals it). */
export function addLive(game: Game, session: Session, el: SlideElement, text: string): boolean {
  const { st } = rpgNow(game, session);
  const at = st && focusRef(st);
  if (!st || !at) return false;
  el.secret = true;
  logged(session, text, () => {
    st.added[at.screen] ??= [];
    st.added[at.screen].push(el);
  });
  return true;
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
  if (el.kind !== 'audio') {
    el.x = Math.round(at.x - el.w / 2);
    el.y = Math.round(at.y - el.h / 2);
  }
  el.name = ref.name;
  return el;
}

export { findIn, focusRef };
