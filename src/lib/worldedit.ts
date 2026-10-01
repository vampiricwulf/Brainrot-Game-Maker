// Rearranging an RPG world in the editor: moving and swapping screens on a map's grid, between maps, whole rows
// and columns, copies of screens, maps and looks, and the walls between screens. Screens keep their ids when they
// move, so everything that points at one (the start, warps, doorways, 'move' buttons, a saved game's party) still
// does; only a move to another map rewrites where they look for it.
import { isRpg, newId, type Dir8, type Game, type Screen, type ScreenRef, type ScreenVariant, type SlideElement, type World, type WorldMap } from './model';
import { allActions, worldObjects } from './refs';
import { DIR_VEC, DIRS, freshObjectIds, OPPOSITE, screenAt, type ScreenGrid } from './rpg';

/** The most columns (and rows) a map has. */
export const MAX_GRID = 16;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const key = (col: number, row: number) => `${col},${row}`;

/**
 * Move screens by (dc, dr), keeping their shape. Screens in the way take the cells the moved ones leave (one screen
 * moved onto another swaps them). `grow`: the map grows to take screens moved past its edges (past the left or top
 * edge, everything shifts along); otherwise that refuses. Returns whether they moved.
 */
export function moveScreens(map: WorldMap, ids: readonly string[], dc: number, dr: number, grow = false): boolean {
  const moving = map.screens.filter((s) => ids.includes(s.id));
  if (!moving.length || (!dc && !dr)) return false;
  const cs = moving.map((s) => s.col + dc);
  const rs = moving.map((s) => s.row + dr);
  const left = Math.max(0, -Math.min(...cs));
  const top = Math.max(0, -Math.min(...rs));
  const cols = Math.max(map.cols, Math.max(...cs) + 1) + left;
  const rows = Math.max(map.rows, Math.max(...rs) + 1) + top;
  if (cols !== map.cols || rows !== map.rows) {
    if (!grow || cols > MAX_GRID || rows > MAX_GRID) return false;
    for (const s of map.screens) {
      s.col += left;
      s.row += top;
    }
    map.cols = cols;
    map.rows = rows;
  }
  const from = new Set(moving.map((s) => key(s.col, s.row)));
  const to = new Set(moving.map((s) => key(s.col + dc, s.row + dr)));
  // Each screen in the way goes back along the move until it's past the moved ones: a cell they left.
  const others = map.screens.filter((s) => !ids.includes(s.id) && to.has(key(s.col, s.row)));
  const spots = others.map((s) => {
    let [c, r] = [s.col - dc, s.row - dr];
    while (to.has(key(c, r)) && from.has(key(c, r))) [c, r] = [c - dc, r - dr];
    return [c, r];
  });
  others.forEach((s, i) => ([s.col, s.row] = spots[i]));
  for (const s of moving) {
    s.col += dc;
    s.row += dr;
  }
  return true;
}

/**
 * `n` free cells in reading order, from (col, row) on and then from the top. A full map grows a row (or, at the
 * most rows, a column) at a time; a map at its largest gives fewer.
 */
export function freeCells(map: WorldMap, n: number, col = 0, row = 0): [number, number][] {
  const out: [number, number][] = [];
  const taken = (c: number, r: number) => !!screenAt(map, c, r) || out.some(([x, y]) => x === c && y === r);
  const scan = (from: number) => {
    for (let i = from; i < map.cols * map.rows && out.length < n; i++) {
      const [c, r] = [i % map.cols, Math.floor(i / map.cols)];
      if (!taken(c, r)) out.push([c, r]);
    }
  };
  scan(row * map.cols + col);
  scan(0);
  while (out.length < n && (map.rows < MAX_GRID || map.cols < MAX_GRID)) {
    const start = map.rows < MAX_GRID ? map.rows * map.cols : 0;
    if (map.rows < MAX_GRID) map.rows++;
    else map.cols++;
    scan(start);
  }
  return out;
}

/**
 * A copy of a screen (a plain one: take a snapshot of the game's first), with fresh ids for it, its looks and its
 * objects, so taking the copy's Potion leaves the original's. Its ways out are the grid's again.
 */
export function copyScreen(s: Screen, name = `${s.name} (copy)`): Screen {
  const copy = clone(s);
  copy.id = newId();
  copy.name = name;
  copy.exits = undefined;
  for (const v of copy.variants ?? []) v.id = newId();
  freshObjectIds([copy.slide, ...(copy.variants ?? []).map((v) => v.slide)]);
  return copy;
}

/** Everything in the game that points at the screens `ids`: doorways, ways out (warps) and 'move' buttons. */
export function refsTo(game: Game, world: World, ids: ReadonlySet<string>): { doorways: SlideElement[]; ways: ScreenRef[]; buttons: ScreenRef[] } {
  const doorways = worldObjects(world).filter((el) => el.role?.class === 'doorway' && el.role.to && ids.has(el.role.to.screen));
  const ways = world.maps
    .flatMap((m) => m.screens.flatMap((s) => DIRS.map((d) => s.exits?.[d])))
    .flatMap((r) => (r?.kind === 'warp' && ids.has(r.to.screen) ? [r.to] : []));
  const buttons = allActions(game).flatMap((a) => (a.do === 'move' && ids.has(a.to.screen) ? [a.to] : []));
  return { doorways, ways, buttons };
}

/** "2 doorways and 1 way out" pointing at those screens, or '' for none. */
export function refsText(r: ReturnType<typeof refsTo>): string {
  const n = (k: number, one: string, many: string) => (k ? [`${k} ${k === 1 ? one : many}`] : []);
  const parts = [...n(r.doorways.length, 'doorway', 'doorways'), ...n(r.ways.length, 'way out', 'ways out'), ...n(r.buttons.length, 'button', 'buttons')];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/**
 * Move a screen to another map of its world, to (col, row) or the first free cell (growing the map). What pointed at
 * it points at it there: the start of the rounds playing this world, ways out, doorways and 'move' buttons. Returns
 * false when that cell is taken.
 */
export function moveToMap(game: Game, world: World, s: Screen, from: WorldMap, to: WorldMap, cell?: [number, number]): boolean {
  if (from === to) return false;
  const [col, row] = cell ?? freeCells(to, 1)[0] ?? [-1, -1];
  if (col < 0 || screenAt(to, col, row)) return false;
  to.cols = Math.max(to.cols, col + 1);
  to.rows = Math.max(to.rows, row + 1);
  from.screens = from.screens.filter((x) => x.id !== s.id);
  s.col = col;
  s.row = row;
  to.screens.push(s);
  const refs = refsTo(game, world, new Set([s.id]));
  for (const r of [...refs.doorways.map((el) => el.role!.to!), ...refs.ways, ...refs.buttons]) r.map = to.id;
  for (const r of game.rounds) if (isRpg(r) && r.world === world.id && r.start?.screen === s.id) r.start.map = to.id;
  return true;
}

/** Insert an empty column (or row) before `at`: the screens from there on move along. False at the largest size. */
export function insertLine(map: WorldMap, axis: 'col' | 'row', at: number): boolean {
  const size = axis === 'col' ? 'cols' : 'rows';
  if (map[size] >= MAX_GRID) return false;
  map[size]++;
  for (const s of map.screens) if (s[axis] >= at) s[axis]++;
  return true;
}

/** Delete a column (or row) with its screens: the ones after it close the gap. Returns the screens deleted. */
export function deleteLine(map: WorldMap, axis: 'col' | 'row', at: number): Screen[] {
  const size = axis === 'col' ? 'cols' : 'rows';
  if (map[size] <= 1) return [];
  const gone = map.screens.filter((s) => s[axis] === at);
  map.screens = map.screens.filter((s) => s[axis] !== at);
  for (const s of map.screens) if (s[axis] > at) s[axis]--;
  map[size]--;
  return gone;
}

/** The screen next to `s` on the grid in direction `d` (the grid's own neighbour: edges don't wrap). */
export function gridNeighbour(map: WorldMap, s: Screen, d: Dir8, grid?: ScreenGrid): Screen | undefined {
  const [dx, dy] = DIR_VEC[d];
  return screenAt(map, s.col + dx, s.row + dy, grid);
}

/** Is the passage between `s` and its neighbour in direction `d` blocked (from either side)? */
export function seamBlocked(map: WorldMap, s: Screen, d: Dir8, grid?: ScreenGrid): boolean {
  const n = gridNeighbour(map, s, d, grid);
  return s.exits?.[d]?.kind === 'blocked' || n?.exits?.[OPPOSITE[d]]?.kind === 'blocked';
}

/**
 * Block the passage between `s` and its neighbour in direction `d` on both sides (a note already there stays), or
 * open it again. Sides that lead somewhere else (warps) are left as they are. Returns whether it's blocked now, or null
 * with no neighbour there.
 */
export function toggleSeam(map: WorldMap, s: Screen, d: Dir8): boolean | null {
  const n = gridNeighbour(map, s, d);
  if (!n) return null;
  const block = !seamBlocked(map, s, d);
  for (const [x, side] of [[s, d], [n, OPPOSITE[d]]] as const) {
    const exits = { ...(x.exits ?? {}) };
    const rule = exits[side];
    if (rule?.kind === 'warp') continue;
    if (block) exits[side] = rule ?? { kind: 'blocked' };
    else delete exits[side];
    x.exits = Object.keys(exits).length ? exits : undefined;
  }
  return block;
}

/**
 * A copy of a map, put right after it: fresh ids for its screens, their looks and objects. Its ways out, doorways and
 * 'move' buttons that led to its own screens lead to the copies (doorways arrive at the copied arrival points).
 */
export function duplicateMap(world: World, m: WorldMap): WorldMap {
  const copy = clone(m);
  copy.id = newId();
  copy.name = `${m.name} (copy)`;
  const screens = new Map<string, string>();
  for (const s of copy.screens) {
    screens.set(s.id, newId());
    s.id = screens.get(s.id)!;
    for (const v of s.variants ?? []) v.id = newId();
  }
  const objects = freshObjectIds(copy.screens.flatMap((s) => [s.slide, ...(s.variants ?? []).map((v) => v.slide)]));
  const repoint = (r: ScreenRef) => {
    if (r.map !== m.id || !screens.has(r.screen)) return;
    r.map = copy.id;
    r.screen = screens.get(r.screen)!;
  };
  const copied = { ...world, maps: [copy] };
  for (const s of copy.screens) for (const d of DIRS) if (s.exits?.[d]?.kind === 'warp') repoint(s.exits[d].to);
  for (const el of worldObjects(copied)) {
    const role = el.role;
    if (role?.class === 'doorway' && role.to) {
      const inside = role.to.map === m.id && screens.has(role.to.screen);
      repoint(role.to);
      if (inside && role.arrive) role.arrive = objects.get(role.arrive) ?? role.arrive;
    }
    for (const a of role?.actions ?? []) if (a.do === 'move') repoint(a.to);
  }
  world.maps.splice(world.maps.indexOf(m) + 1, 0, copy);
  return copy;
}

/** A copy of one of a screen's looks, right after it (its objects get fresh ids). */
export function duplicateLook(s: Screen, v: ScreenVariant): ScreenVariant {
  const copy: ScreenVariant = { id: newId(), name: `${v.name} (copy)`, slide: clone(v.slide) };
  freshObjectIds([copy.slide]);
  const list = s.variants ?? [];
  list.splice(list.indexOf(v) + 1, 0, copy);
  s.variants = list;
  return copy;
}

/** The look becomes the screen's own picture; what was its own picture takes the look's place in the list. */
export function makeMainLook(s: Screen, v: ScreenVariant): void {
  const own = s.slide;
  s.slide = v.slide;
  v.slide = own;
  v.name = 'Old main look';
}

/** Move a look to another place in the list (the order the host's look switcher lists them in). */
export function moveLook(s: Screen, from: number, to: number): void {
  const list = [...(s.variants ?? [])];
  if (from === to || !list[from] || to < 0 || to >= list.length) return;
  const [v] = list.splice(from, 1);
  list.splice(to, 0, v);
  s.variants = list;
}
