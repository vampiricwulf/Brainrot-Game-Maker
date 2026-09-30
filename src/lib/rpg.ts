// RPG mode (games-maker spec §7): worlds made of maps of screens, parties of avatars moving between them, and what
// the audience may see. Pure functions over Game + Session; the host's UI wraps changes in toolset.logged().
import {
  isRpg,
  newId,
  SLIDE_H,
  SLIDE_W,
  textSlide,
  type Dir8,
  type Game,
  type ObjectClass,
  type ObjectOverride,
  type Position,
  type RpgRound,
  type Screen,
  type ScreenRef,
  type ScreenVariant,
  type Session,
  type Slide,
  type SlideElement,
  type World,
  type WorldMap,
  type WorldState,
} from './model';
import { objectPointsNowhere, worldObjects } from './refs';

// ---------- Building worlds ----------

export function newScreen(col: number, row: number, name = `Screen ${String.fromCharCode(65 + (col % 26))}${row + 1}`): Screen {
  const slide = textSlide('');
  slide.elements = [];
  slide.background = { color: '#2f6b3a' };
  return { id: newId(), name, col, row, slide };
}

export function newWorldMap(name: string, cols = 4, rows = 3, primary = true): WorldMap {
  return {
    id: newId(),
    name,
    cols,
    rows,
    screens: primary ? [newScreen(0, 0, 'Start')] : [newScreen(0, 0, name)],
    visibility: primary ? 'discovered' : 'hidden',
    showExits: true,
    revealNeighbors: false,
    diagonals: true,
    wrap: false,
    transition: 'slide',
  };
}

export function newWorld(name = 'New world'): World {
  return { id: newId(), name, maps: [newWorldMap('Overworld')] };
}

export function newRpgRound(game: Game, name = 'Adventure'): RpgRound {
  let world = game.worlds?.[0];
  if (!world) {
    world = newWorld('World 1');
    game.worlds = [...(game.worlds ?? []), world];
  }
  return { id: newId(), name, mode: 'rpg', world: world.id };
}

// ---------- Finding things ----------

export function worldById(game: Game, id: string | undefined): World | undefined {
  return id ? game.worlds?.find((w) => w.id === id) : undefined;
}

export function findScreen(game: Game, worldId: string, ref: ScreenRef | undefined | null): { world: World; map: WorldMap; screen: Screen } | null {
  const world = worldById(game, worldId);
  const map = world?.maps.find((m) => m.id === ref?.map);
  const screen = map?.screens.find((s) => s.id === ref?.screen);
  return world && map && screen ? { world, map, screen } : null;
}

export function screenAt(map: WorldMap, col: number, row: number): Screen | undefined {
  return map.screens.find((s) => s.col === col && s.row === row);
}

export const sameRef = (a: ScreenRef | null | undefined, b: ScreenRef | null | undefined) => !!a && !!b && a.map === b.map && a.screen === b.screen;

// ---------- Directions and exits ----------

export const DIRS: Dir8[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
export const DIR_VEC: Record<Dir8, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};
export const DIR_ARROW: Record<Dir8, string> = { n: '↑', ne: '↗', e: '→', se: '↘', s: '↓', sw: '↙', w: '←', nw: '↖' };
export const DIR_NAME: Record<Dir8, string> = { n: 'North', ne: 'North-east', e: 'East', se: 'South-east', s: 'South', sw: 'South-west', w: 'West', nw: 'North-west' };
export const OPPOSITE: Record<Dir8, Dir8> = { n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', nw: 'se' };
const diagonal = (d: Dir8) => d.length === 2;

export type Exit = { kind: 'open' | 'warp'; to: ScreenRef } | { kind: 'blocked'; note?: string } | { kind: 'none' };

/**
 * Where leaving `screen` in direction `dir` goes. Neighbors come from the grid (the screen at col+dx, row+dy);
 * a screen's own exit rules block a side or send it somewhere else (another map included).
 */
export function exitOf(map: WorldMap, screen: Screen, dir: Dir8): Exit {
  const rule = screen.exits?.[dir];
  if (rule?.kind === 'blocked') return { kind: 'blocked', note: rule.note };
  if (rule?.kind === 'warp') return { kind: 'warp', to: rule.to };
  if (diagonal(dir) && !map.diagonals) return { kind: 'none' };
  const [dx, dy] = DIR_VEC[dir];
  let col = screen.col + dx;
  let row = screen.row + dy;
  if (map.wrap) {
    col = (col + map.cols) % map.cols;
    row = (row + map.rows) % map.rows;
  }
  const next = screenAt(map, col, row);
  if (!next || next === screen) return { kind: 'none' };
  // A diagonal step needs a way through: not both of the sides it cuts past blocked.
  if (diagonal(dir)) {
    const [a, b] = [dir[0] as Dir8, dir[1] as Dir8];
    if (screen.exits?.[a]?.kind === 'blocked' && screen.exits?.[b]?.kind === 'blocked') return { kind: 'blocked', note: 'Both ways are blocked' };
  }
  return { kind: 'open', to: { map: map.id, screen: next.id } };
}

export function exitsOf(map: WorldMap, screen: Screen): Record<Dir8, Exit> {
  return Object.fromEntries(DIRS.map((d) => [d, exitOf(map, screen, d)])) as Record<Dir8, Exit>;
}

// ---------- World state ----------

const AVATAR = 150;

/** The world state for a round, created on first use: everyone in one party at the start screen. */
export function ensureWorld(session: Session, game: Game, round: RpgRound): WorldState | null {
  const world = worldById(game, round.world);
  if (!world) return null;
  session.worlds ??= {};
  if (!session.worlds[world.id]) {
    const start = startRef(world, round);
    if (!start) return null;
    const party = { id: newId(), name: 'Party', members: session.players.map((p) => p.id) };
    session.worlds[world.id] = { positions: {}, parties: [party], active: party.id, knowledge: {}, objects: {}, added: {}, mapShown: false };
    const st = session.worlds[world.id];
    place(game, st, world, session.players.map((p) => p.id), start, null);
    discover(st, world, start);
  }
  const st = session.worlds[world.id];
  syncPlayers(session, game, st, world);
  return st;
}

/** Where the party starts: the round's start screen, else the primary map's first screen. */
export function startRef(world: World, round: RpgRound): ScreenRef | null {
  if (round.start && world.maps.some((m) => m.id === round.start!.map && m.screens.some((s) => s.id === round.start!.screen))) return round.start;
  const map = world.maps[0];
  const first = map?.screens[0];
  return map && first ? { map: map.id, screen: first.id } : null;
}

/** Players added or removed mid-game: newcomers join the active party where it stands. */
function syncPlayers(session: Session, game: Game, st: WorldState, world: World): void {
  const ids = session.players.map((p) => p.id);
  for (const party of st.parties) party.members = party.members.filter((m) => ids.includes(m));
  const missing = ids.filter((id) => !st.positions[id]);
  if (!missing.length) return;
  let active = st.parties.find((p) => p.id === st.active) ?? st.parties[0];
  if (!active) {
    active = { id: newId(), name: 'Party', members: [] };
    st.parties.push(active);
    st.active = active.id;
  }
  const at = partyScreen(st, active) ?? Object.values(st.positions)[0];
  active.members.push(...missing);
  if (at) place(game, st, world, missing, { map: at.map, screen: at.screen }, null);
}

/** Where a party is (its first member's screen). */
export function partyScreen(st: WorldState, party: { members: string[] } | undefined): Position | undefined {
  return party?.members.map((m) => st.positions[m]).find(Boolean);
}

export function activeParty(st: WorldState) {
  return st.parties.find((p) => p.id === st.active) ?? st.parties[0];
}

/** The screen the audience follows: the active party's. */
export function focusRef(st: WorldState): ScreenRef | null {
  const p = partyScreen(st, activeParty(st));
  return p ? { map: p.map, screen: p.screen } : null;
}

/** Mark a screen visited, and its open neighbors discovered when the map says so. */
export function discover(st: WorldState, world: World, ref: ScreenRef): void {
  st.knowledge[ref.screen] = 'visited';
  const map = world.maps.find((m) => m.id === ref.map);
  const screen = map?.screens.find((s) => s.id === ref.screen);
  if (!map || !screen || !map.revealNeighbors) return;
  for (const d of DIRS) {
    const e = exitOf(map, screen, d);
    if ((e.kind === 'open' || e.kind === 'warp') && e.to.map === map.id && !st.knowledge[e.to.screen]) st.knowledge[e.to.screen] = 'discovered';
  }
}

/**
 * Put players on a screen. Coming in from a side, they enter from the opposite edge; through a doorway, at its
 * arrival object (or the screen's first spawn point); otherwise in the middle. They fan out so no one overlaps.
 */
export function place(game: Game, st: WorldState, world: World, players: string[], to: ScreenRef, via: Dir8 | null, arriveAt?: string): void {
  const map = world.maps.find((m) => m.id === to.map);
  const screen = map?.screens.find((s) => s.id === to.screen);
  if (!screen) return;
  const els = allElements(st, screen);
  const anchor =
    (arriveAt && els.find((e) => e.id === arriveAt)) || (!via ? els.find((e) => e.role?.class === 'spawn') : undefined);
  let cx = SLIDE_W / 2;
  let cy = SLIDE_H / 2 + 120;
  if (anchor) {
    cx = anchor.x + anchor.w / 2;
    cy = anchor.y + anchor.h / 2;
  } else if (via) {
    const [dx, dy] = DIR_VEC[OPPOSITE[via]];
    cx = SLIDE_W / 2 + dx * (SLIDE_W / 2 - AVATAR);
    cy = SLIDE_H / 2 + dy * (SLIDE_H / 2 - AVATAR);
  }
  const n = players.length;
  // Along the edge they came in from (a column for east/west, a row otherwise).
  const vertical = via === 'e' || via === 'w';
  players.forEach((id, i) => {
    const off = (i - (n - 1) / 2) * (AVATAR + 20);
    const x = vertical ? cx : cx + off;
    const y = vertical ? cy + off : cy;
    const prev = st.positions[id];
    st.positions[id] = {
      ...prev,
      map: to.map,
      screen: to.screen,
      x: Math.round(Math.max(AVATAR / 2, Math.min(SLIDE_W - AVATAR / 2, x))),
      y: Math.round(Math.max(AVATAR / 2, Math.min(SLIDE_H - AVATAR / 2, y))),
    };
  });
}

/** Move players (default: the active party) to a screen, by a side or a warp/doorway. */
export function moveTo(
  game: Game,
  st: WorldState,
  world: World,
  to: ScreenRef,
  { players, via = null, arriveAt }: { players?: string[]; via?: Dir8 | null; arriveAt?: string } = {},
): void {
  const who = players ?? activeParty(st)?.members ?? [];
  if (!who.length) return;
  place(game, st, world, who, to, via, arriveAt);
  discover(st, world, to);
  if (players) regroupAfterMove(st, who, to);
  st.lastMove = { dir: via ?? 'warp', at: Date.now() };
}

/**
 * Some players went somewhere on their own (a doorway, a jump, an action): they leave any party they only partly
 * made up, join a party already standing where they arrived, or else become a party of their own. The audience
 * follows them. Parties that moved whole are kept as they are.
 */
function regroupAfterMove(st: WorldState, moved: string[], to: ScreenRef): void {
  const set = new Set(moved);
  const whole = st.parties.find((p) => p.members.length && p.members.every((m) => set.has(m)) && moved.every((m) => p.members.includes(m)));
  for (const p of st.parties) if (p !== whole) p.members = p.members.filter((m) => !set.has(m));
  // A party (other than theirs) standing where they arrived takes them in.
  const there = st.parties.find((p) => p !== whole && p.members.length && p.members.every((m) => sameRef(st.positions[m], to)));
  let target = whole;
  if (there) {
    there.members.push(...moved.filter((m) => !there.members.includes(m)));
    if (whole) whole.members = [];
    target = there;
  } else if (!whole) {
    target = { id: newId(), name: 'Party', members: [...moved] };
    st.parties.push(target);
  }
  st.parties = st.parties.filter((p) => p.members.length);
  if (target) st.active = target.id;
  if (st.parties.length === 1) st.split = false;
  renameParties(st);
}

/** Step the active party one screen in a direction. Returns why it couldn't, or null. */
export function step(game: Game, st: WorldState, world: World, dir: Dir8): string | null {
  const at = focusRef(st);
  const found = at && findIn(world, at);
  if (!found) return 'The party isn’t on a screen';
  const e = exitOf(found.map, found.screen, dir);
  if (e.kind === 'blocked') return e.note ? `Blocked: ${e.note}` : 'That way is blocked';
  if (e.kind === 'none') return `Nothing to the ${DIR_NAME[dir].toLowerCase()}`;
  if (e.kind === 'warp' && !findIn(world, e.to)) return 'That way leads nowhere (its screen was deleted)';
  moveTo(game, st, world, e.to, { via: e.kind === 'open' ? dir : null });
  return null;
}

export function findIn(world: World, ref: ScreenRef): { map: WorldMap; screen: Screen } | null {
  const map = world.maps.find((m) => m.id === ref.map);
  const screen = map?.screens.find((s) => s.id === ref.screen);
  return map && screen ? { map, screen } : null;
}

// ---------- Parties ----------

/** Split `members` off into a new party that becomes active (they stay where they are). */
export function splitParty(st: WorldState, members: string[]): void {
  if (!members.length) return;
  for (const p of st.parties) p.members = p.members.filter((m) => !members.includes(m));
  st.parties = st.parties.filter((p) => p.members.length);
  const party = { id: newId(), name: `Party ${st.parties.length + 1}`, members: [...members] };
  st.parties.push(party);
  st.active = party.id;
  renameParties(st);
}

/** Everyone back in one party on the active party's screen. */
export function regroup(game: Game, st: WorldState, world: World, allPlayers: string[]): void {
  const at = focusRef(st);
  const keep = activeParty(st) ?? { id: newId(), name: 'Party', members: [] };
  keep.members = [...allPlayers];
  st.parties = [keep];
  st.active = keep.id;
  st.split = false;
  keep.name = 'Party';
  if (at) {
    const away = allPlayers.filter((id) => !sameRef(st.positions[id], at));
    if (away.length) place(game, st, world, away, at, null);
  }
}

function renameParties(st: WorldState): void {
  if (st.parties.length === 1) st.parties[0].name = 'Party';
  else st.parties.forEach((p, i) => (p.name = `Party ${i + 1}`));
}

/** Each distinct screen with players on it (for split view), active party first. */
export function occupiedScreens(st: WorldState): ScreenRef[] {
  const out: ScreenRef[] = [];
  const add = (p?: Position) => p && !out.some((r) => sameRef(r, p)) && out.push({ map: p.map, screen: p.screen });
  add(partyScreen(st, activeParty(st)));
  for (const party of st.parties) for (const m of party.members) add(st.positions[m]);
  return out;
}

// ---------- Objects on screens ----------

/** The classes an object can have, for pickers: value, label, what it's for. */
export const OBJECT_CLASSES: [ObjectClass | '', string, string][] = [
  ['', 'Scenery', 'Just part of the picture'],
  ['doorway', '🚪 Doorway', 'Leads to another screen (any map)'],
  ['item', '📦 Item', 'Can be picked up'],
  ['currency', '🪙 Currency', 'A pile of gold (or any currency stat)'],
  ['npc', '🧙 Character', 'Someone to talk to: dialogue, own stats, maybe a shop'],
  ['shop', '🛒 Shop', 'Opens a shop'],
  ['hazard', '⚠ Hazard', 'A trap, a pit, a Bad Wheel space…'],
  ['zone', '🟩 Zone', 'An area (a forest, lava, a safe spot) with buttons of its own'],
  ['interactable', '✋ Interactable', 'Anything with buttons of its own'],
  ['spawn', '🚩 Arrival point', 'Where players appear when they come in (never shown)'],
  ['blocker', '⛔ No-go area', 'Arriving players aren’t placed here (never shown)'],
];

/** Visible to viewers? Secret objects, hotspots, spawn points and blockers are host-only unless revealed. */
export function audienceSees(el: SlideElement, o: ObjectOverride | undefined): boolean {
  if (o?.taken) return false;
  if (el.kind === 'shape' && el.hotspot) return false;
  if (el.role?.class === 'spawn' || el.role?.class === 'blocker') return false;
  if (o?.shown !== undefined) return o.shown;
  return !el.secret;
}

/**
 * A screen's elements as they are now: authored ones with the game's changes (moved, taken, revealed) plus objects
 * the host added. `audience`: only what viewers may see. Otherwise hidden things come back marked `secret` so the
 * host view can show them faded.
 */
export function screenElements(st: WorldState | undefined, screen: Screen, audience: boolean): SlideElement[] {
  const out: SlideElement[] = [];
  for (const el of allElements(st, screen)) {
    const o = st?.objects[el.id];
    if (o?.taken) continue;
    const seen = audienceSees(el, o);
    if (audience && !seen) continue;
    out.push({ ...el, x: o?.x ?? el.x, y: o?.y ?? el.y, secret: !seen || undefined } as SlideElement);
  }
  return out;
}

/**
 * A screen's elements now: its look's, plus objects added during play. An added object that has since been moved
 * into the screen itself (the live editor does that) counts once.
 */
export function allElements(st: WorldState | undefined, screen: Screen): SlideElement[] {
  const base = screenSlide(st, screen).elements;
  const added = st?.added[screen.id] ?? [];
  if (!added.length) return base;
  const ids = new Set(base.map((e) => e.id));
  return [...base, ...added.filter((e) => !ids.has(e.id))];
}

/**
 * Before the live editor opens a look, objects added during play move into it, so they can be moved, resized and
 * edited like the rest (their reveal state and other changes are kept by id).
 */
export function adoptAdded(st: WorldState, screen: Screen, slide: Slide): void {
  const added = st.added[screen.id];
  if (!added?.length) return;
  const ids = new Set(slide.elements.map((e) => e.id));
  const top = Math.max(0, ...slide.elements.map((e) => e.zIndex));
  added.forEach((e, i) => {
    if (ids.has(e.id)) return;
    // Where it was dragged to in play is where it goes.
    const o = st.objects[e.id];
    slide.elements.push({ ...e, x: o?.x ?? e.x, y: o?.y ?? e.y, zIndex: Math.max(e.zIndex, top + 1 + i) } as SlideElement);
    if (o) {
      delete o.x;
      delete o.y;
    }
  });
  delete st.added[screen.id];
}

/** The look a screen has now: the variant the host switched to, else its own slide. */
export function screenSlide(st: WorldState | undefined, screen: Screen): Slide {
  const v = st?.variant?.[screen.id];
  return (v && screen.variants?.find((x) => x.id === v)?.slide) || screen.slide;
}

/** A new look for a screen, copied from the one showing now. */
export function newVariant(st: WorldState | undefined, screen: Screen, name: string): ScreenVariant {
  const v: ScreenVariant = { id: newId(), name, slide: JSON.parse(JSON.stringify(screenSlide(st, screen))) };
  freshObjectIds([v.slide]);
  return v;
}

/**
 * Copied objects (a new look, a duplicated screen) get fresh ids, so taking or moving one doesn't change the
 * original, and Reveal / Hide buttons among the copies point at the copies. Doorways' arrival objects are on the
 * screen they lead to, so they stay as they are.
 */
export function freshObjectIds(slides: Slide[]): void {
  const ids = new Map<string, string>();
  for (const el of slides.flatMap((sl) => sl.elements)) {
    // (Looks from older saves can share an object with the screen's own slide: the copies share theirs.)
    if (!ids.has(el.id)) ids.set(el.id, newId());
    el.id = ids.get(el.id)!;
  }
  for (const el of slides.flatMap((sl) => sl.elements))
    for (const a of el.role?.actions ?? []) if ((a.do === 'reveal' || a.do === 'hide') && a.object) a.object = ids.get(a.object) ?? a.object;
}

/** An empty screen next to `at` in direction `dir`, if that cell is free and on the grid. */
export function addScreenBeside(map: WorldMap, at: Screen, dir: Dir8, name?: string): Screen | null {
  const [dx, dy] = DIR_VEC[dir];
  const col = at.col + dx;
  const row = at.row + dy;
  if (col < 0 || row < 0 || screenAt(map, col, row)) return null;
  // Grow the map when the new screen is past its edge.
  map.cols = Math.max(map.cols, col + 1);
  map.rows = Math.max(map.rows, row + 1);
  const s = newScreen(col, row, name);
  s.slide.background = { ...at.slide.background };
  map.screens.push(s);
  return s;
}

/**
 * "Keep in game": copy a screen as it is in the game being played (its looks, and the objects added during play)
 * into another copy of the game, adding its world or map there if they're missing. Returns what it did.
 */
export function keepScreen(from: Game, to: Game, worldId: string, ref: ScreenRef, st: WorldState | undefined): string {
  const w = from.worlds?.find((x) => x.id === worldId);
  const found = w && findIn(w, ref);
  if (!w || !found) return 'That screen is gone';
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  to.worlds ??= [];
  let tw = to.worlds.find((x) => x.id === w.id);
  if (!tw) {
    tw = { ...clone(w), maps: [] };
    to.worlds.push(tw);
  }
  let tm = tw.maps.find((m) => m.id === found.map.id);
  if (!tm) {
    tm = { ...clone(found.map), screens: [] };
    tw.maps.push(tm);
  }
  tm.cols = Math.max(tm.cols, found.map.cols);
  tm.rows = Math.max(tm.rows, found.map.rows);
  const copy = clone(found.screen);
  // Objects added during play become part of the look showing now.
  // Objects added during play (not ones picked up since) become part of the look showing now.
  const added = clone(st?.added[found.screen.id] ?? []).filter((e) => !st?.objects[e.id]?.taken);
  const v = st?.variant?.[found.screen.id];
  const look = (v && copy.variants?.find((x) => x.id === v)?.slide) || copy.slide;
  look.elements.push(...added.filter((e) => !look.elements.some((x) => x.id === e.id)));
  // Each object as it is now: where it was dragged to, and whether viewers see it.
  for (const el of look.elements) {
    const o = st?.objects[el.id];
    if (!o) continue;
    if (o.x !== undefined) el.x = o.x;
    if (o.y !== undefined) el.y = o.y;
    if (o.shown !== undefined) el.secret = !o.shown || undefined;
  }
  const i = tm.screens.findIndex((s) => s.id === copy.id);
  // A different screen already in that cell (added in the editor meanwhile) keeps it: this one is not copied.
  const clash = tm.screens.find((s) => s.col === copy.col && s.row === copy.row && s.id !== copy.id);
  if (clash) return `${tm.name} already has “${clash.name}” in that spot in the editor`;
  if (i >= 0) tm.screens[i] = copy;
  else tm.screens.push(copy);
  return `Kept “${copy.name}” in the game`;
}

export function override(st: WorldState, id: string): ObjectOverride {
  st.objects[id] ??= {};
  return st.objects[id];
}

// ---------- Map knowledge for the audience ----------

/** What the audience's map shows of a screen: 'visited', 'discovered', or null (hidden). */
export function mapState(st: WorldState | undefined, map: WorldMap, screen: Screen): 'visited' | 'discovered' | null {
  if (map.visibility === 'hidden') return null;
  const k = st?.knowledge[screen.id] ?? null;
  if (map.visibility === 'full') return k ?? 'discovered';
  return k;
}

/** Is a map worth showing to viewers at all? */
export function mapVisible(st: WorldState | undefined, map: WorldMap): boolean {
  return map.visibility !== 'hidden' && (map.visibility === 'full' || map.screens.some((s) => st?.knowledge[s.id]));
}

// ---------- Checklist ----------

export function rpgProblems(game: Game, round: RpgRound, name: string, tab: number): { text: string; tab: number; level: 'warn' | 'info' }[] {
  const out: { text: string; tab: number; level: 'warn' | 'info' }[] = [];
  const world = worldById(game, round.world);
  if (!world) return [{ text: `${name}: no world chosen`, tab, level: 'warn' }];
  if (!world.maps.some((m) => m.screens.length)) out.push({ text: `${name}: ${world.name} has no screens`, tab, level: 'warn' });
  const objects = worldObjects(world);
  const loose = objects.filter((el) => el.role?.class === 'doorway' && !(el.role.to && findIn(world, el.role.to))).length;
  if (loose) out.push({ text: `${name}: ${loose} doorway(s) lead nowhere`, tab, level: 'warn' });
  // Sides sent to a screen that was deleted since.
  const ways = world.maps.flatMap((m) => m.screens.flatMap((s) => DIRS.map((d) => s.exits?.[d]))).filter((r) => r?.kind === 'warp' && !findIn(world, r.to)).length;
  if (ways) out.push({ text: `${name}: ${ways} way(s) out lead nowhere`, tab, level: 'warn' });
  const nowhere = objects.filter((el) => objectPointsNowhere(game, el, world)).length;
  if (nowhere) out.push({ text: `${name}: ${nowhere} object(s) with a button or setting that points nowhere`, tab, level: 'warn' });
  return out;
}

export function rpgRounds(game: Game): RpgRound[] {
  return game.rounds.filter(isRpg);
}
