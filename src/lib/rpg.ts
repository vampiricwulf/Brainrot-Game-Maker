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
  type Party,
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
import { nameList, objectPointsNowhere, objectsWhere } from './refs';
import type { Problem } from './validate';
import type { Place } from './historylabel';

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

/** A map's screens by grid cell ("col,row"), for looking up many cells at once: screenAt alone goes through them all. */
export type ScreenGrid = ReadonlyMap<string, Screen>;

export function screenGrid(map: WorldMap): ScreenGrid {
  return new Map(map.screens.map((s) => [`${s.col},${s.row}`, s]));
}

export function screenAt(map: WorldMap, col: number, row: number, grid?: ScreenGrid): Screen | undefined {
  return grid ? grid.get(`${col},${row}`) : map.screens.find((s) => s.col === col && s.row === row);
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
 * a screen's own exit rules block a side or send it somewhere else (another map included). `grid`: the map's cells, for
 * many lookups at once.
 */
export function exitOf(map: WorldMap, screen: Screen, dir: Dir8, grid?: ScreenGrid): Exit {
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
  const next = screenAt(map, col, row, grid);
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

/** Where the party starts: the round's start screen, else the primary map's first screen (else the first map's with any). */
export function startRef(world: World, round: RpgRound): ScreenRef | null {
  if (round.start && world.maps.some((m) => m.id === round.start!.map && m.screens.some((s) => s.id === round.start!.screen))) return round.start;
  const map = world.maps[0]?.screens.length ? world.maps[0] : world.maps.find((m) => m.screens.length);
  const first = map?.screens[0];
  return map && first ? { map: map.id, screen: first.id } : null;
}

/**
 * Resuming with the editor's changes: players stand on their screen wherever it is now (screens keep their ids when
 * they move, to another map too). Players whose screen was deleted go to the start.
 */
export function refindPositions(session: Session, game: Game): void {
  for (const [id, st] of Object.entries(session.worlds ?? {})) {
    const world = worldById(game, id);
    if (!world) continue;
    const round = game.rounds.find((r): r is RpgRound => isRpg(r) && r.world === id);
    const start = round ? startRef(world, round) : null;
    for (const p of Object.values(st.positions)) {
      const map = world.maps.find((m) => m.screens.some((s) => s.id === p.screen));
      const to = map ? { map: map.id, screen: p.screen } : start;
      if (to) Object.assign(p, to);
    }
  }
}

/**
 * Players added or removed mid-game: newcomers (and players put back) join the active party where it stands. A party
 * whose players all left goes: viewers then follow the first party, and with one party left there's no split view.
 */
function syncPlayers(session: Session, game: Game, st: WorldState, world: World): void {
  const ids = session.players.map((p) => p.id);
  for (const party of st.parties) party.members = party.members.filter((m) => ids.includes(m));
  if (st.parties.some((p) => !p.members.length)) {
    st.parties = st.parties.filter((p) => p.members.length);
    if (!st.parties.some((p) => p.id === st.active) && st.parties[0]) st.active = st.parties[0].id;
    if (st.parties.length < 2) st.split = false;
    renameParties(st);
  }
  const missing = ids.filter((id) => !st.parties.some((p) => p.members.includes(id)));
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

/** The party standing on a screen: the followed one if it's there, else the first one there. */
export function partyOn(st: WorldState, screenId: string): Party | undefined {
  const on = (p: Party | undefined) => partyScreen(st, p)?.screen === screenId;
  const followed = activeParty(st);
  return on(followed) ? followed : st.parties.find(on);
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

/** Room an avatar needs around where it stands: its token above, its nameplate below. */
const AV_UP = 80;
const AV_DOWN = 90;
const AV_SIDE = 90;
/** About how much of a screen the stats strip covers, and a pane's caption (split view, "📍 Village") at the other edge. */
const STRIP_H = 150;
const CAPTION_H = 110;

/** Where avatars can stand on a screen: on it, clear of the stats strip and of a pane's caption. */
export function standArea(game: Game): { left: number; right: number; top: number; bottom: number } {
  const bar = game.theme?.scoreBar ?? 'bottom';
  const top = bar === 'top' ? STRIP_H : CAPTION_H;
  const bottom = bar === 'bottom' ? STRIP_H : bar === 'top' ? CAPTION_H : 0;
  return { left: AV_SIDE, right: SLIDE_W - AV_SIDE, top: top + AV_UP, bottom: SLIDE_H - bottom - AV_DOWN };
}

/**
 * Put players on a screen. Coming in from a side, they enter from the opposite edge; through a doorway, at its
 * arrival object (or the screen's first spawn point); otherwise in the middle. They stand side by side so no one
 * overlaps, all of them clear of the stats strip: a line that would run off the screen slides back onto it, and one
 * too long for it goes on in a second line, further in.
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
  const area = standArea(game);
  const fit = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(Math.max(lo, hi), v)));
  cx = fit(cx, area.left, area.right);
  cy = fit(cy, area.top, area.bottom);
  const n = players.length;
  const gap = AVATAR + 20;
  // Along the edge they came in from (a column for east/west, a row otherwise).
  const vertical = via === 'e' || via === 'w';
  const [lo, hi] = vertical ? [area.top, area.bottom] : [area.left, area.right];
  const perLine = Math.max(1, Math.floor((hi - lo) / gap) + 1);
  // Further lines go towards the middle of the screen.
  const inward = vertical ? (cx > SLIDE_W / 2 ? -1 : 1) : cy > SLIDE_H / 2 ? -1 : 1;
  const spots = (shift: number) => {
    const out: { x: number; y: number }[] = [];
    for (let first = 0, line = 0; first < n; first += perLine, line++) {
      const count = Math.min(perLine, n - first);
      let along = Array.from({ length: count }, (_, k) => (vertical ? cy : cx) + (k - (count - 1) / 2) * gap + shift);
      // Off an edge: the whole line slides back on (not each one pushed onto the edge, on top of each other).
      const over = Math.max(...along) - hi;
      const under = lo - Math.min(...along);
      if (over > 0) along = along.map((a) => a - over);
      else if (under > 0) along = along.map((a) => a + under);
      const across = (vertical ? cx : cy) + line * gap * inward;
      for (const a of along)
        out.push(vertical ? { x: fit(across, area.left, area.right), y: fit(a, lo, hi) } : { x: fit(a, lo, hi), y: fit(across, area.top, area.bottom) });
    }
    return out;
  };
  // Not on top of anyone already standing there (joining their party, say): the line moves along, one way or the other.
  const others = Object.entries(st.positions)
    .filter(([id, p]) => p.screen === to.screen && !p.hidden && !players.includes(id))
    .map(([, p]) => p);
  const clear = (row: { x: number; y: number }[]) => row.every((a) => others.every((o) => Math.abs(a.x - o.x) >= AVATAR || Math.abs(a.y - o.y) >= AVATAR));
  let row = spots(0);
  for (let k = 1; k <= 12 && !clear(row); k++) {
    const next = spots((k % 2 ? 1 : -1) * Math.ceil(k / 2) * gap);
    if (clear(next)) row = next;
  }
  players.forEach((id, i) => (st.positions[id] = { ...st.positions[id], map: to.map, screen: to.screen, ...row[i] }));
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
  if (!keep.named) keep.name = 'Party';
  if (at) {
    const away = allPlayers.filter((id) => !sameRef(st.positions[id], at));
    if (away.length) place(game, st, world, away, at, null);
  }
}

/** Parties are numbered (a lone one is just "Party"), except the ones the host named. */
function renameParties(st: WorldState): void {
  st.parties.forEach((p, i) => {
    if (!p.named) p.name = st.parties.length === 1 ? 'Party' : `Party ${i + 1}`;
  });
}

/** The host names a party ("Red team"): it keeps that name. */
export function nameParty(st: WorldState, partyId: string, name: string): void {
  const party = st.parties.find((p) => p.id === partyId);
  if (!party) return;
  party.name = name;
  party.named = true;
}

/**
 * Players join a party: the ones standing elsewhere go to its screen, all of them leave their own party (which goes
 * once it's empty) and the audience follows the party they joined.
 */
export function joinParty(game: Game, st: WorldState, world: World, players: string[], partyId: string): void {
  const party = st.parties.find((p) => p.id === partyId);
  const at = partyScreen(st, party);
  const who = players.filter((id) => !party?.members.includes(id));
  if (!party || !at || !who.length) return;
  const to = { map: at.map, screen: at.screen };
  const away = who.filter((id) => !sameRef(st.positions[id], to));
  if (away.length) {
    place(game, st, world, away, to, null);
    discover(st, world, to);
    st.lastMove = { dir: 'warp', at: Date.now() };
  }
  for (const p of st.parties) p.members = p.members.filter((m) => !who.includes(m));
  party.members.push(...who);
  st.parties = st.parties.filter((p) => p.members.length);
  st.active = party.id;
  if (st.parties.length < 2) st.split = false;
  renameParties(st);
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

/** A class as the host reads it, without its icon ("Character", not "npc"); "" is scenery. */
export function classLabel(c: ObjectClass | '' | undefined): string {
  const l = OBJECT_CLASSES.find(([v]) => v === (c ?? ''))?.[1];
  return l ? l.replace(/^\S+\s/, '') : String(c ?? '');
}

/** A class's icon (🧙 for a character), for lists that name objects. */
export function classIcon(c: ObjectClass | '' | undefined): string | undefined {
  return c ? OBJECT_CLASSES.find(([v]) => v === c)?.[1].split(' ')[0] : undefined;
}

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
  // Into every look of the screen, not only the one being edited: a sword Bob dropped stays there when the host
  // switches back from "On fire" (one object, the same id: picked up in one look, it's gone from all of them).
  const slides = [...new Set([slide, screen.slide, ...(screen.variants ?? []).map((v) => v.slide)])];
  for (const sl of slides) {
    const ids = new Set(sl.elements.map((e) => e.id));
    const top = Math.max(0, ...sl.elements.map((e) => e.zIndex));
    added.forEach((e, i) => {
      if (ids.has(e.id)) return;
      // Where it was dragged to in play is where it goes.
      const o = st.objects[e.id];
      sl.elements.push({ ...JSON.parse(JSON.stringify(e)), x: o?.x ?? e.x, y: o?.y ?? e.y, zIndex: Math.max(e.zIndex, top + 1 + i) } as SlideElement);
    });
  }
  for (const e of added) {
    const o = st.objects[e.id];
    if (o) {
      delete o.x;
      delete o.y;
    }
  }
  delete st.added[screen.id];
}

/** The look a screen has now: the variant the host switched to, else its own slide. */
export function screenSlide(st: WorldState | undefined, screen: Screen): Slide {
  const v = st?.variant?.[screen.id];
  return (v && screen.variants?.find((x) => x.id === v)?.slide) || screen.slide;
}

/** A new look for a screen, copied from the one showing now. */
export function newVariant(st: WorldState | undefined, screen: Screen, name: string): ScreenVariant {
  return copyLook(st, screen, name).look;
}

/** A new look, and each copied object's new id by its old one (see carryObjects). */
export function copyLook(st: WorldState | undefined, screen: Screen, name: string): { look: ScreenVariant; ids: Map<string, string> } {
  const look: ScreenVariant = { id: newId(), name, slide: JSON.parse(JSON.stringify(screenSlide(st, screen))) };
  return { look, ids: freshObjectIds([look.slide]) };
}

/**
 * A look made during play: its copies of the objects start as the originals are by now (a Key already picked up stays
 * picked up, a moved chest where it was moved), not as the game was made.
 */
export function carryObjects(st: WorldState, ids: Map<string, string>): void {
  for (const [from, to] of ids) if (st.objects[from]) st.objects[to] = JSON.parse(JSON.stringify(st.objects[from]));
}

/**
 * Copied objects (a new look, a duplicated screen) get fresh ids, so taking or moving one doesn't change the
 * original, and Reveal / Hide buttons among the copies point at the copies. Doorways' arrival objects are on the
 * screen they lead to, so they stay as they are. Returns the new id of each old one.
 */
export function freshObjectIds(slides: Slide[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const el of slides.flatMap((sl) => sl.elements)) {
    // (Looks from older saves can share an object with the screen's own slide: the copies share theirs.)
    if (!ids.has(el.id)) ids.set(el.id, newId());
    el.id = ids.get(el.id)!;
  }
  for (const el of slides.flatMap((sl) => sl.elements))
    for (const a of el.role?.actions ?? []) if ((a.do === 'reveal' || a.do === 'hide') && a.object) a.object = ids.get(a.object) ?? a.object;
  return ids;
}

/** An empty screen next to `at` in direction `dir`, if that cell is free and on the grid. */
export function addScreenBeside(map: WorldMap, at: Screen, dir: Dir8, name?: string): Screen | null {
  const [dx, dy] = DIR_VEC[dir];
  const col = at.col + dx;
  const row = at.row + dy;
  // (Within the editor's 16 × 16 grid: a wider map couldn't be edited after.)
  if (col < 0 || row < 0 || col >= 16 || row >= 16 || screenAt(map, col, row)) return null;
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
  // Moved in the editor meanwhile (another cell, another map): it's kept where it is there.
  const there = tw.maps.find((m) => m.screens.some((s) => s.id === ref.screen));
  let tm = there ?? tw.maps.find((m) => m.id === found.map.id);
  if (!tm) {
    tm = { ...clone(found.map), screens: [] };
    tw.maps.push(tm);
  }
  if (!there) {
    tm.cols = Math.max(tm.cols, found.map.cols);
    tm.rows = Math.max(tm.rows, found.map.rows);
  }
  const copy = clone(found.screen);
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
  if (i >= 0) {
    copy.col = tm.screens[i].col;
    copy.row = tm.screens[i].row;
  }
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

/**
 * The part of a map the viewers' map shows: the screens they know of, with one cell around them (where an arrow says
 * a way leads), kept on the grid. A big world mostly unexplored stays readable. Null when they know of none.
 */
export function mapCrop(st: WorldState | undefined, map: WorldMap): { col: number; row: number; cols: number; rows: number } | null {
  const known = map.screens.filter((s) => mapState(st, map, s));
  if (!known.length) return null;
  const cols = known.map((s) => s.col);
  const rows = known.map((s) => s.row);
  const col = Math.max(0, Math.min(...cols) - 1);
  const row = Math.max(0, Math.min(...rows) - 1);
  const lastCol = Math.min(map.cols - 1, Math.max(...cols) + 1);
  const lastRow = Math.min(map.rows - 1, Math.max(...rows) + 1);
  return { col, row, cols: lastCol - col + 1, rows: lastRow - row + 1 };
}

// ---------- Checklist ----------

export function rpgProblems(game: Game, round: RpgRound, name: string, tab: number): Problem[] {
  const out: Problem[] = [];
  const world = worldById(game, round.world);
  if (!world) return [{ text: `${name}: no world chosen`, tab, level: 'warn', place: { tab: 'round', round: round.id } }];
  const place = (at: { map: WorldMap; screen: Screen; look?: string; el?: SlideElement }): Place =>
    at.el
      ? { tab: 'world', world: world.id, map: at.map.id, screen: at.screen.id, look: at.look, inSlide: true, element: at.el.id }
      : { tab: 'world', world: world.id, map: at.map.id, screen: at.screen.id };
  if (!world.maps.some((m) => m.screens.length)) out.push({ text: `${name}: ${world.name} has no screens`, tab, level: 'warn', place: { tab: 'world', world: world.id } });
  const objects = objectsWhere(world);
  const loose = objects.filter(({ el }) => el.role?.class === 'doorway' && !(el.role.to && findIn(world, el.role.to)));
  if (loose.length) {
    const on = nameList(loose.map((o) => o.screen.name));
    const text = loose.length === 1 ? `the doorway on ${on} leads nowhere` : `${loose.length} doorways lead nowhere (on ${on})`;
    out.push({ text: `${name}: ${text}`, tab, level: 'warn', place: place(loose[0]) });
  }
  // Sides sent to a screen that was deleted since.
  const ways = world.maps.flatMap((map) => map.screens.flatMap((screen) => DIRS.filter((d) => screen.exits?.[d]?.kind === 'warp' && !findIn(world, (screen.exits[d] as { to: ScreenRef }).to)).map(() => ({ map, screen }))));
  if (ways.length) {
    const from = nameList(ways.map((w) => w.screen.name));
    const text = ways.length === 1 ? `a way out of ${from} leads nowhere` : `${ways.length} ways out lead nowhere (from ${from})`;
    out.push({ text: `${name}: ${text}`, tab, level: 'warn', place: place(ways[0]) });
  }
  const nowhere = objects.filter(({ el }) => objectPointsNowhere(game, el, world));
  if (nowhere.length) {
    const first = nowhere[0];
    const what = first.el.name?.trim() ? `“${first.el.name.trim()}”` : 'an object';
    const text =
      nowhere.length === 1
        ? `${what} on “${first.screen.name}” has a button or setting that points nowhere`
        : `${nowhere.length} objects have a button or setting that points nowhere (on ${nameList(nowhere.map((o) => o.screen.name))})`;
    out.push({ text: `${name}: ${text}`, tab, level: 'warn', place: place(first) });
  }
  return out;
}

export function rpgRounds(game: Game): RpgRound[] {
  return game.rounds.filter(isRpg);
}
