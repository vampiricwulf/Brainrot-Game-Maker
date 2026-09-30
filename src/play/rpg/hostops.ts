// The RPG host's moves, shared by the host panel and the keyboard shortcuts. Every change is one undoable step.
import { isRpg, newImageEl, newTextEl, type Dir8, type Game, type InventoryEntry, type ScreenRef, type Session, type SlideElement } from '../../lib/model';
import { DIR_NAME, findIn, focusRef, regroup, splitParty, step, worldById } from '../../lib/rpg';
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

/** An item dropped on a screen (drop-to-add): its icon, or a label, with the item class so it can be picked up. */
export function droppedObject(game: Game, e: InventoryEntry, at: { x: number; y: number }): SlideElement {
  const def = itemDef(game, e.item);
  const size = 160;
  const el: SlideElement = def?.icon
    ? newImageEl(def.icon, size, size)
    : { ...newTextEl(`📦 ${entryName(game, e)}`), size: 44, uppercase: false, autoFit: true, w: 340, h: 90 };
  el.x = Math.round(at.x - el.w / 2);
  el.y = Math.round(at.y - el.h / 2);
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
      const el = screen.slide.elements.find((e) => e.id === elId) ?? st.added[screen.id]?.find((e) => e.id === elId);
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

/** Text typed onto the stage. */
export function liveText(text: string): SlideElement {
  const el = { ...newTextEl(text), size: 72, w: 1200, h: 200, x: 360, y: 440 };
  el.name = text.length > 24 ? `${text.slice(0, 24)}…` : text;
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
