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
  type ObjectOverride,
  type Position,
  type RpgRound,
  type Screen,
  type ScreenRef,
  type Session,
  type SlideElement,
  type World,
  type WorldMap,
  type WorldState,
} from './model';

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

function startRef(world: World, round: RpgRound): ScreenRef | null {
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
  const els = [...screen.slide.elements, ...(st.added[screen.id] ?? [])];
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
  st.lastMove = { dir: via ?? 'warp', at: Date.now() };
}

/** Step the active party one screen in a direction. Returns why it couldn't, or null. */
export function step(game: Game, st: WorldState, world: World, dir: Dir8): string | null {
  const at = focusRef(st);
  const found = at && findIn(world, at);
  if (!found) return 'The party isn’t on a screen';
  const e = exitOf(found.map, found.screen, dir);
  if (e.kind === 'blocked') return e.note ? `Blocked: ${e.note}` : 'That way is blocked';
  if (e.kind === 'none') return `Nothing to the ${DIR_NAME[dir].toLowerCase()}`;
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
  for (const el of [...screen.slide.elements, ...(st?.added[screen.id] ?? [])]) {
    const o = st?.objects[el.id];
    if (o?.taken) continue;
    const seen = audienceSees(el, o);
    if (audience && !seen) continue;
    out.push({ ...el, x: o?.x ?? el.x, y: o?.y ?? el.y, secret: !seen || undefined } as SlideElement);
  }
  return out;
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
  let loose = 0;
  for (const m of world.maps)
    for (const s of m.screens)
      for (const el of s.slide.elements) {
        const r = el.role;
        if (r?.class === 'doorway' && !(r.to && findIn(world, r.to))) loose++;
      }
  if (loose) out.push({ text: `${name}: ${loose} doorway(s) lead nowhere`, tab, level: 'warn' });
  return out;
}

export function rpgRounds(game: Game): RpgRound[] {
  return game.rounds.filter(isRpg);
}
