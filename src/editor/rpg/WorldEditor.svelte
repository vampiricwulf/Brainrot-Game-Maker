<!--
  An RPG world: its maps (the primary map and the others, joined by doorways), each a grid of screens. Click an
  empty cell to add a screen, click a screen for its settings (name, exits in 8 directions, music, notes), and
  ✎ Edit screen to lay out its picture and objects. Screens drag to another cell (swapping with a screen there), to
  another map's tab, or past the map's edge (it grows); the grid keys like a spreadsheet.
-->
<script lang="ts">
  import Tips from '../Tips.svelte';
  import { tick, untrack } from 'svelte';
  import { showMenu, type MenuEntry } from '../../lib/menustate.svelte';
  import { take } from '../../lib/nav.svelte';
  import Stage from '../../lib/Stage.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { adoptUsedBy, clipboard, holdUsedBy } from '../../lib/clipboard.svelte';
  import { copyIsTheBrowsers } from '../../lib/undokeys';
  import { nameStep, step, stepAsync } from '../../lib/history.svelte';
  import { addMediaFile } from '../../lib/media.svelte';
  import { type Dir8, type Screen, type ScreenRef, type ScreenVariant, type World, type WorldMap } from '../../lib/model';
  import { clone } from '../../lib/ops';
  import { DIR_ARROW, DIR_NAME, DIRS, exitOf, newScreen, newVariant, newWorldMap, sameRef, screenAt, screenGrid } from '../../lib/rpg';
  import {
    copyScreen,
    deleteLine,
    duplicateLook,
    duplicateMap,
    freeCells,
    gridNeighbour,
    insertLine,
    makeMainLook,
    MAX_GRID,
    moveLook,
    moveScreens,
    moveToMap,
    refsText,
    refsTo,
    seamBlocked,
    toggleSeam,
  } from '../../lib/worldedit';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import { mediaDrop } from '../../lib/mediadrop';
  import ScreenEditor from './ScreenEditor.svelte';
  import ScreenPicker from './ScreenPicker.svelte';

  let {
    world,
    editing = $bindable(false),
    start,
    onstart,
  }: {
    world: World;
    /** A screen is open in the screen editor (the round's settings above step aside for it). */
    editing?: boolean;
    /** Where the party starts, and making a screen the start. */
    start?: ScreenRef | null;
    onstart?: (ref: ScreenRef) => void;
  } = $props();
  const game = $derived(app.game);
  let mapId = $state<string | null>(null);
  /** The selected screens (Shift/Ctrl+click or a box drawn on the map picks several). */
  let selIds = $state<string[]>([]);
  /** Which look of the screen is being edited (null: its own slide). */
  let lookId = $state<string | null>(null);
  let musicFor = $state<'map' | 'screen' | null>(null);
  /** The cell with the keyboard focus: the grid is one tab stop, and the arrows move it. */
  let cursor = $state<[number, number]>([0, 0]);

  // An undo or redo in this world shows its map with the screen selected, or the screen (or look) being edited.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'world' || place.world !== untrack(() => world.id) || !place.map) return;
    mapId = place.map;
    if (place.screen) selIds = [place.screen];
    const s = untrack(() => world.maps.find((m) => m.id === place.map)?.screens.find((x) => x.id === place.screen));
    if (s) cursor = [s.col, s.row];
    lookId = place.inSlide ? (place.look ?? null) : lookId;
    editing = !!(place.inSlide && place.screen);
  });

  const map = $derived(world.maps.find((m) => m.id === mapId) ?? world.maps[0]);
  /** Its screens by cell: the grid below looks every cell up on each render (a search per cell made big maps slow). */
  const grid = $derived(screenGrid(map));
  const picked = $derived(map ? map.screens.filter((s) => selIds.includes(s.id)) : []);
  const sel = $derived(picked.length === 1 ? picked[0] : undefined);
  const look = $derived(sel?.variants?.find((v) => v.id === lookId));
  const cur = $derived<[number, number]>(map ? [Math.min(cursor[0], map.cols - 1), Math.min(cursor[1], map.rows - 1)] : [0, 0]);

  function selectOnly(s: Screen | null): void {
    selIds = s ? [s.id] : [];
    if (s) cursor = [s.col, s.row];
  }

  function showMap(m: WorldMap): void {
    mapId = m.id;
    selIds = [];
  }

  // ---------- Maps ----------

  function addMap(): void {
    const m = newWorldMap(`Area ${world.maps.length}`, 3, 3, false);
    world.maps.push(m);
    mapId = m.id;
    selectOnly(m.screens[0]);
  }

  // Deleting is done at once: the note at the bottom offers Undo.
  function removeMap(m: WorldMap): void {
    if (world.maps.length <= 1) return;
    step(`Deleted map “${m.name}”`, () => (world.maps = world.maps.filter((x) => x.id !== m.id)), { notify: true });
    mapId = world.maps[0].id;
    selIds = [];
  }

  function copyMap(m: WorldMap): void {
    const copy = step(`Duplicated map “${m.name}”`, () => duplicateMap(world, m));
    showMap(copy);
  }

  /** The first map is the main one: the party starts on its first screen unless the round says otherwise. */
  function moveMap(from: number, to: number): void {
    const m = world.maps[from];
    if (!m || to < 0 || to >= world.maps.length || to === from) return;
    const main = world.maps[0];
    step(`Moved map “${m.name}” ${to < from ? 'earlier' : 'later'}`, () => {
      const list = [...world.maps];
      list.splice(from, 1);
      list.splice(to, 0, m);
      world.maps = list;
    });
    if (world.maps[0] !== main) toast(`${world.maps[0].name} is now the main map (the party starts on its first screen unless a start is set)`);
  }

  /** The map view (tabs, grid and the selected screen's panel): its keys work while the focus is in it. */
  let mapView = $state<HTMLDivElement>();

  /** The map tab being renamed in place. */
  let renaming = $state<string | null>(null);
  function rename(m: WorldMap, name: string): void {
    renaming = null;
    if (name.trim() && name !== m.name) m.name = name.trim();
    void tick().then(() => document.querySelector<HTMLElement>(`[data-map-tab="${m.id}"]`)?.focus());
  }
  const focusAll = (el: HTMLInputElement) => {
    el.focus();
    el.select();
  };

  function mapMenu(e: MouseEvent, m: WorldMap, i: number): void {
    showMenu(e, [
      { heading: m.name },
      { label: '✎ Rename', onclick: () => (renaming = m.id), keys: 'F2 or double-click' },
      { label: '⧉ Duplicate map', onclick: () => copyMap(m), keys: 'Ctrl+D' },
      { label: '◀ Move earlier', onclick: () => moveMap(i, i - 1), disabled: i === 0, keys: 'Alt+←' },
      { label: '▶ Move later', onclick: () => moveMap(i, i + 1), disabled: i === world.maps.length - 1, keys: 'Alt+→' },
      { sep: true },
      { label: '🗑 Delete map', danger: true, onclick: () => removeMap(m), disabled: world.maps.length <= 1, keys: 'Delete' },
    ]);
  }

  const focusMapTab = (id: string | undefined) => void tick().then(() => id && document.querySelector<HTMLElement>(`[data-map-tab="${id}"]`)?.focus());

  /**
   * On a map's tab, as on a round's: F2 renames it, Alt+←/→ moves it, Ctrl+D duplicates it and Delete / Backspace
   * deletes it (with Undo at the bottom). Never the selected screens'.
   */
  function mapTabKey(e: KeyboardEvent, m: WorldMap, i: number): void {
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (k === 'f2') renaming = m.id;
    else if (e.altKey && !mod && (k === 'arrowleft' || k === 'arrowright')) {
      moveMap(i, i + (k === 'arrowleft' ? -1 : 1));
      focusMapTab(m.id);
    } else if (mod && !e.altKey && k === 'd') {
      copyMap(m);
      focusMapTab(map?.id);
    } else if ((k === 'delete' || k === 'backspace') && !mod && !e.altKey) {
      removeMap(m);
      focusMapTab(map?.id);
    } else return;
    e.preventDefault();
  }

  // Map tabs drag to reorder (a line shows where it goes).
  let tabDrag = $state<string | null>(null);
  let tabDrop = $state<{ id: string; after: boolean } | null>(null);
  function tabOver(e: DragEvent, m: WorldMap): void {
    if (!tabDrag) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tabDrop = { id: m.id, after: e.clientX > r.left + r.width / 2 };
  }
  function tabDropped(e: DragEvent): void {
    e.preventDefault();
    const from = world.maps.findIndex((m) => m.id === tabDrag);
    const at = world.maps.findIndex((m) => m.id === tabDrop?.id);
    if (from >= 0 && at >= 0 && tabDrop) {
      const to = at + (tabDrop.after ? 1 : 0);
      moveMap(from, to > from ? to - 1 : to);
    }
    tabDrag = null;
    tabDrop = null;
  }

  // ---------- Screens ----------

  /** A new screen in this cell, selected, with the focus on it (the cell's ＋ button it replaced is gone). */
  function addScreen(col: number, row: number): void {
    const s = newScreen(col, row);
    map.screens.push(s);
    selectOnly(s);
    void tick().then(() => focusCell(col, row, true));
  }

  /**
   * Done at once (the note at the bottom offers Undo), and it says when the party now starts elsewhere or something
   * led there.
   */
  function removeScreens(list: Screen[]): void {
    if (!list.length) return;
    const ids = new Set(list.map((s) => s.id));
    const wasStart = list.some(isStart);
    const focused = !!gridEl?.contains(document.activeElement);
    const what = list.length === 1 ? `screen “${list[0].name}”` : `${list.length} screens`;
    step(null, () => {
      map.screens = map.screens.filter((s) => !ids.has(s.id));
      const first = wasStart ? world.maps[0]?.screens[0] : undefined;
      const loose = refsText(refsTo(game, world, ids));
      const notes = [`Deleted ${what}`, first && `the party now starts at ${first.name}`, loose && `${loose} now lead${loose.startsWith('1 ') && !loose.includes(' and ') ? 's' : ''} nowhere`];
      nameStep(notes.filter(Boolean).join(' · '), { notify: true });
    });
    selIds = [];
    editing = false;
    void tick().then(() => focused && focusCell(...cur, true));
  }

  /** Where copies of screens go: the same shape in the first place it fits (after them), else any free cells. */
  function spotsFor(list: Screen[]): [number, number][] {
    const anchor = list[0];
    const cells = map.cols * map.rows;
    const from = anchor.row * map.cols + anchor.col;
    for (let k = 1; k < cells; k++) {
      const i = (from + k) % cells;
      const [dc, dr] = [(i % map.cols) - anchor.col, Math.floor(i / map.cols) - anchor.row];
      const spots = list.map((s): [number, number] => [s.col + dc, s.row + dr]);
      if (spots.every(([c, r]) => c >= 0 && r >= 0 && c < map.cols && r < map.rows && !screenAt(map, c, r))) return spots;
    }
    return freeCells(map, list.length, anchor.col, anchor.row);
  }

  function duplicateScreens(list: Screen[]): void {
    if (!list.length) return;
    if (map.screens.length + list.length > MAX_GRID * MAX_GRID) return void toast(`${map.name} is full (16×16 is the most)`);
    // Their own objects and looks: taking the copy's Potion leaves the original's, and its Chest reveals its own Potion.
    const copies = list.map((s) => copyScreen($state.snapshot(s) as Screen));
    step(list.length === 1 ? `Duplicated screen “${list[0].name}”` : `Duplicated ${list.length} screens`, () => {
      const spots = spotsFor(list);
      copies.forEach((c, i) => {
        [c.col, c.row] = spots[i];
        map.screens.push(c);
      });
    });
    selIds = copies.map((c) => c.id);
    cursor = [copies[0].col, copies[0].row];
  }

  /** Move screens on this map (the one moved onto another swaps with it). Past the edge, the map grows. */
  function moveOnGrid(list: Screen[], dc: number, dr: number): void {
    const size = `${map.cols}×${map.rows}`;
    const moved = step(null, () => {
      const ok = moveScreens(map, list.map((s) => s.id), dc, dr, true);
      if (ok && `${map.cols}×${map.rows}` !== size) nameStep(`${list.length === 1 ? `Moved screen “${list[0].name}”` : `Moved ${list.length} screens`} (the map grew to ${map.cols}×${map.rows})`);
      // (Several: the ones moved, not the ones swapped out of their way too.)
      else if (ok && list.length > 1) nameStep(`Moved ${list.length} screens`);
      return ok;
    });
    if (!moved) return;
    selIds = list.map((s) => s.id);
    cursor = [list[0].col, list[0].row];
    if (list.length === 1 && DIRS.some((d) => blockedSide(list[0], d))) toast(`${list[0].name}’s blocked sides went with it`);
  }

  /** Move screens to another map: to these cells, or the first free ones. What pointed at them follows. */
  function moveAcross(list: Screen[], from: WorldMap, to: WorldMap, cells?: [number, number][]): void {
    if (to.screens.length + list.length > MAX_GRID * MAX_GRID) return void toast(`${to.name} is full (16×16 is the most)`);
    const what = list.length === 1 ? `screen “${list[0].name}”` : `${list.length} screens`;
    step(`Moved ${what} to map “${to.name}”`, () => list.forEach((s, i) => moveToMap(game, world, s, from, to, cells?.[i])));
    mapId = to.id;
    selIds = list.map((s) => s.id);
    cursor = [list[0].col, list[0].row];
  }

  /** No room left for one more screen (16×16 is the most). */
  function full(m: WorldMap): boolean {
    if (m.screens.length < MAX_GRID * MAX_GRID) return false;
    toast(`${m.name} is full (16×16 is the most)`);
    return true;
  }

  function copyAcross(s: Screen, to: WorldMap): void {
    if (full(to)) return;
    const copy = copyScreen($state.snapshot(s) as Screen, s.name);
    step(`Copied screen “${s.name}” to map “${to.name}”`, () => {
      [[copy.col, copy.row]] = freeCells(to, 1);
      to.screens.push(copy);
    });
    toast(`Copied ${s.name} to ${to.name}`);
  }

  /** Nudge the selected screens one cell (a screen in the way swaps with them). */
  function nudge(list: Screen[], dc: number, dr: number): void {
    if (!list.length) return;
    const focused = !!gridEl?.contains(document.activeElement);
    const moved = step(null, () => {
      const ok = moveScreens(map, list.map((s) => s.id), dc, dr);
      // (Several: the ones moved, not the ones swapped out of their way too.)
      if (ok && list.length > 1) nameStep(`Moved ${list.length} screens`);
      return ok;
    });
    if (!moved) return;
    cursor = [cursor[0] + dc, cursor[1] + dr];
    if (list.length === 1) cursor = [list[0].col, list[0].row];
    // (The screen is another cell's button now: the focus goes with it.)
    if (focused) void tick().then(() => focusCell(...cur, true));
  }

  // ---------- Copy and paste ----------

  function copyToClipboard(s: Screen): void {
    clipboard.screen = clone($state.snapshot(s) as Screen);
    // Its files come along, so it pastes into another game (see pruneMedia).
    holdUsedBy(game, clipboard.screen);
    toast(`Copied ${s.name}: paste it on any map (Ctrl+V)`);
  }

  /** Paste the copied screen into this cell (else the first free one), with fresh ids and the grid's ways out. */
  function paste(cell?: [number, number]): void {
    const src = clipboard.screen;
    if (!src) return void toast('Copy a screen first (right-click it, or Ctrl+C)');
    if (full(map)) return;
    const copy = copyScreen(src, src.name);
    step(`Pasted screen “${copy.name}”`, () => {
      adoptUsedBy(game, copy);
      [[copy.col, copy.row]] = cell && !screenAt(map, ...cell) ? [cell] : freeCells(map, 1);
      map.screens.push(copy);
    });
    selectOnly(copy);
  }

  // ---------- Rows and columns ----------

  const colName = (c: number) => String.fromCharCode(65 + (c % 26));

  function insert(axis: 'col' | 'row', at: number): void {
    const what = axis === 'col' ? 'column' : 'row';
    const ok = step(`Inserted a ${what} in map “${map.name}”`, () => insertLine(map, axis, at));
    if (!ok) toast(`This map has the most ${what}s (16)`);
  }

  function removeLine(axis: 'col' | 'row', at: number): void {
    const gone = map.screens.filter((s) => s[axis] === at).length;
    const with_ = gone ? ` with ${gone} screen${gone === 1 ? '' : 's'}` : '';
    step(`Deleted ${axis === 'col' ? `column ${colName(at)}` : `row ${at + 1}`} of map “${map.name}”${with_}`, () => deleteLine(map, axis, at), { notify: true });
    selIds = selIds.filter((id) => map.screens.some((s) => s.id === id));
  }

  function lineItems(c: number, r: number): MenuEntry[] {
    return [
      { sep: true },
      { label: '＋ Insert column left', onclick: () => insert('col', c), disabled: map.cols >= MAX_GRID },
      { label: '＋ Insert column right', onclick: () => insert('col', c + 1), disabled: map.cols >= MAX_GRID },
      { label: '＋ Insert row above', onclick: () => insert('row', r), disabled: map.rows >= MAX_GRID },
      { label: '＋ Insert row below', onclick: () => insert('row', r + 1), disabled: map.rows >= MAX_GRID },
      { label: `🗑 Delete column ${colName(c)}`, onclick: () => removeLine('col', c), disabled: map.cols <= 1 },
      { label: `🗑 Delete row ${r + 1}`, onclick: () => removeLine('row', r), disabled: map.rows <= 1 },
    ];
  }

  function screenMenu(e: MouseEvent, s: Screen): void {
    if (!selIds.includes(s.id)) selectOnly(s);
    const several = picked.length > 1 ? picked : null;
    const others = world.maps.filter((m) => m.id !== map.id);
    showMenu(e, [
      { heading: several ? `${several.length} screens` : s.name },
      ...(several
        ? [{ label: '⧉ Duplicate them', onclick: () => duplicateScreens(several), keys: 'Ctrl+D' }]
        : [
            { label: '✎ Edit screen', onclick: () => ((lookId = null), (editing = true)), keys: 'Enter' },
            { label: '⧉ Duplicate', onclick: () => duplicateScreens([s]), keys: 'Ctrl+D' },
            { label: '📋 Copy screen', onclick: () => copyToClipboard(s), keys: 'Ctrl+C' },
            ...(onstart ? [{ label: '🏁 Make it the start', onclick: () => onstart({ map: map.id, screen: s.id }), disabled: isStart(s) }] : []),
            { label: '＋ Add look (a copy)', onclick: () => addLook(s) },
          ]),
      ...(others.length ? [{ sep: true } as const] : []),
      ...others.map((m) => ({ label: `→ Move to ${m.name}`, onclick: () => moveAcross(several ?? [s], map, m) })),
      ...(several ? [] : others.map((m) => ({ label: `⧉ Copy to ${m.name}`, onclick: () => copyAcross(s, m) }))),
      ...lineItems(s.col, s.row),
      { sep: true },
      { label: several ? `🗑 Delete ${several.length} screens` : '🗑 Delete screen', danger: true, onclick: () => removeScreens(several ?? [s]), keys: 'Delete' },
    ]);
  }

  function emptyMenu(e: MouseEvent, c: number, r: number): void {
    cursor = [c, r];
    showMenu(e, [
      { label: '＋ Add a screen here', onclick: () => addScreen(c, r) },
      { label: clipboard.screen ? `📋 Paste “${clipboard.screen.name}” here` : '📋 Paste screen here', onclick: () => paste([c, r]), disabled: !clipboard.screen, keys: 'Ctrl+V' },
      ...(sel ? [{ label: `⇄ Move ${sel.name} here`, onclick: () => moveOnGrid([sel], c - sel.col, r - sel.row) }] : []),
      ...lineItems(c, r),
    ]);
  }

  // ---------- Walls and warps ----------

  /** Right and down: each passage between two screens once. */
  const SEAMS: Dir8[] = ['e', 's'];

  function toggleWall(s: Screen, d: Dir8): void {
    const n = gridNeighbour(map, s, d);
    if (!n) return;
    const shut = seamBlocked(map, s, d);
    step(`${shut ? 'Opened' : 'Blocked'} the way between “${s.name}” and “${n.name}”`, () => toggleSeam(map, s, d));
  }

  function setExit(s: Screen, d: Dir8, kind: string): void {
    const exits = { ...(s.exits ?? {}) };
    if (kind === 'auto') delete exits[d];
    else if (kind === 'blocked') exits[d] = { kind: 'blocked' };
    else if (kind === 'warp') {
      const first = world.maps.find((m) => m.id !== map.id)?.screens[0] ?? map.screens.find((x) => x.id !== s.id);
      const m = world.maps.find((mm) => mm.screens.includes(first!));
      if (!first || !m) return void toast('Add another screen first');
      exits[d] = { kind: 'warp', to: { map: m.id, screen: first.id } };
    }
    s.exits = Object.keys(exits).length ? exits : undefined;
  }

  /** '🎯 Pick on the map': the next screen clicked (any map) is where that side leads. */
  let picking = $state<{ map: string; screen: string; dir: Dir8 } | null>(null);
  const pickFrom = $derived(picking && world.maps.find((m) => m.id === picking!.map)?.screens.find((s) => s.id === picking!.screen));

  function pickTarget(to: Screen): void {
    const p = picking;
    const from = pickFrom;
    if (from && to.id === from.id) return void toast('Pick another screen (or Esc)');
    picking = null;
    if (!p || !from) return;
    step(`${DIR_NAME[p.dir]} of “${from.name}” leads to “${to.name}”`, () => (from.exits = { ...(from.exits ?? {}), [p.dir]: { kind: 'warp', to: { map: map.id, screen: to.id } } }));
    mapId = p.map;
    selectOnly(from);
  }

  // ---------- Looks ----------

  function addLook(s: Screen, from?: ScreenVariant): ScreenVariant {
    const name = `Look ${(s.variants?.length ?? 0) + 2}`;
    if (from) {
      const copy = duplicateLook(s, from);
      copy.name = name;
      return copy;
    }
    const v = newVariant(undefined, s, name);
    s.variants = [...(s.variants ?? []), v];
    return v;
  }

  function removeLook(s: Screen, v: ScreenVariant): void {
    step(`Deleted look “${v.name}” of ${s.name}`, () => (s.variants = s.variants?.filter((x) => x.id !== v.id)), { notify: true });
    if (lookId === v.id) lookId = null;
  }

  function lookMenu(e: MouseEvent, s: Screen, v: ScreenVariant, i: number): void {
    const n = s.variants?.length ?? 0;
    showMenu(e, [
      { heading: v.name },
      { label: '✎ Edit this look', onclick: () => ((lookId = v.id), (editing = true)) },
      { label: '⧉ Duplicate this look', onclick: () => step(`Duplicated look “${v.name}” of ${s.name}`, () => duplicateLook(s, v)) },
      { label: '⇄ Make it the main look', onclick: () => step(`Made “${v.name}” the main look of ${s.name}`, () => makeMainLook(s, v)), hint: 'Its own picture takes its place' },
      { label: '◀ Move earlier', onclick: () => step(`Moved look “${v.name}” earlier`, () => moveLook(s, i, i - 1)), disabled: i === 0 },
      { label: '▶ Move later', onclick: () => step(`Moved look “${v.name}” later`, () => moveLook(s, i, i + 1)), disabled: i === n - 1 },
      { sep: true },
      { label: '🗑 Delete', danger: true, onclick: () => removeLook(s, v) },
    ]);
  }

  // Looks drag to reorder by their grip.
  let lookDrag = $state<string | null>(null);
  let lookDrop = $state<{ id: string; after: boolean } | null>(null);
  function lookOver(e: DragEvent, v: ScreenVariant): void {
    if (!lookDrag) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    lookDrop = { id: v.id, after: e.clientX > r.left + r.width / 2 };
  }
  function lookDropped(e: DragEvent, s: Screen): void {
    e.preventDefault();
    const list = s.variants ?? [];
    const from = list.findIndex((v) => v.id === lookDrag);
    const at = list.findIndex((v) => v.id === lookDrop?.id);
    if (from >= 0 && at >= 0 && lookDrop) {
      const to = at + (lookDrop.after ? 1 : 0);
      step(`Moved look “${list[from].name}”`, () => moveLook(s, from, to > from ? to - 1 : to));
    }
    lookDrag = null;
    lookDrop = null;
  }

  /**
   * A Columns or Rows box changed: a whole number from 1 to 16, or (emptied, or not a number) nothing at all, and the
   * box shows the size again. Clearing it to type a new one never deletes screens.
   */
  function sizeTyped(input: HTMLInputElement, now: number): number | null {
    const n = Math.round(Number(input.value));
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(now);
      return null;
    }
    const v = Math.max(1, Math.min(16, n));
    input.value = String(v);
    return v === now ? null : v;
  }

  /** Map resize: screens outside the new size are deleted with it (the note at the bottom offers Undo). */
  function resize(cols: number, rows: number): void {
    const outside = map.screens.filter((s) => s.col >= cols || s.row >= rows).length;
    const gone = outside ? ` (deleted ${outside} screen${outside === 1 ? '' : 's'})` : '';
    step(
      `Resized map “${map.name}” to ${cols}×${rows}${gone}`,
      () => {
        map.screens = map.screens.filter((s) => s.col < cols && s.row < rows);
        map.cols = cols;
        map.rows = rows;
      },
      { notify: !!outside },
    );
  }

  // ---------- Pictures dropped on the map ----------

  let dropCell = $state<string | null>(null);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  function fileOver(e: DragEvent, c: number, r: number): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropCell = `${c},${r}`;
  }

  /**
   * A picture dropped on a screen becomes its background; on an empty cell, a new screen named after the file.
   * Several fill that cell and the next free ones. One step with the files.
   */
  function dropFiles(e: DragEvent, c: number, r: number): Promise<void> {
    e.preventDefault();
    dropCell = null;
    const files = Array.from(e.dataTransfer?.files ?? []);
    const m = map;
    return stepAsync(null, async () => {
      const pics: { id: string; name: string }[] = [];
      for (const file of files) {
        try {
          const ref = await addMediaFile(game, file);
          if (ref.kind === 'image') pics.push({ id: ref.id, name: file.name.replace(/\.[^.]+$/, '') || 'Screen' });
          else toast(`"${ref.name}" isn't an image`);
        } catch (err) {
          toast((err as Error).message);
        }
      }
      const there = screenAt(m, c, r);
      if (there && pics.length) {
        there.slide.background = { ...there.slide.background, image: pics.shift()!.id };
        if (!pics.length) nameStep(`Set the picture of “${there.name}”`);
      }
      const made = freeCells(m, pics.length, c, r).map(([col, row], i) => {
        const s = newScreen(col, row, pics[i].name);
        s.slide.background = { image: pics[i].id, fit: 'cover' };
        m.screens.push(s);
        return s;
      });
      if (!made.length) return;
      const label = made.length === 1 ? `Added screen “${made[0].name}” from a picture` : `Made ${made.length} screens from your pictures`;
      nameStep(label);
      if (made.length > 1) toast(label);
      mapId = m.id;
      selIds = made.map((s) => s.id);
    });
  }

  // ---------- Dragging screens, and drawing a box around them ----------

  /** The grid's gap between cells (px). */
  const GAP = 6;
  let gridEl = $state<HTMLDivElement>();

  /** Where a cell sits over the grid (col/row may be past the edges), as CSS lengths. */
  const along = (i: number, n: number, extra = 0) => `calc((100% - ${(n - 1) * GAP}px) / ${n} * ${i} + ${i * GAP + extra}px)`;
  const span = (n: number) => `calc((100% - ${(n - 1) * GAP}px) / ${n})`;

  /** The cell under a point (or one past the edges, with `ring`), or null. */
  function cellAt(x: number, y: number, ring = 0): [number, number] | null {
    if (!gridEl) return null;
    const r = gridEl.getBoundingClientRect();
    const c = Math.floor((x - r.left + GAP / 2) / ((r.width + GAP) / map.cols));
    const row = Math.floor((y - r.top + GAP / 2) / ((r.height + GAP) / map.rows));
    return c >= -ring && row >= -ring && c < map.cols + ring && row < map.rows + ring ? [c, row] : null;
  }

  type Drag = { ids: string[]; anchor: string; from: string; x0: number; y0: number; x: number; y: number; on: boolean };
  let drag = $state<Drag | null>(null);
  let over = $state<{ kind: 'cell'; col: number; row: number } | { kind: 'tab'; map: string } | null>(null);
  /** The click that ends a drag or a box isn't a click on a cell. */
  let swallow = false;
  let tabTimer: ReturnType<typeof setTimeout> | undefined;
  let box = $state<{ x0: number; y0: number; x: number; y: number; on: boolean; base: string[] } | null>(null);

  const dragFrom = $derived(drag ? world.maps.find((m) => m.id === drag!.from) : undefined);
  const dragging = $derived(drag?.on && dragFrom ? dragFrom.screens.filter((s) => drag!.ids.includes(s.id)) : []);

  /** Where the dragged screens would land, whether they can, and what it says. */
  const plan = $derived.by(() => {
    const anchor = dragging.find((s) => s.id === drag?.anchor);
    if (!anchor || over?.kind !== 'cell' || !dragFrom) return null;
    const [dc, dr] = [over.col - anchor.col, over.row - anchor.row];
    if (!dc && !dr && dragFrom.id === map.id) return null;
    const cells = dragging.map((s): [number, number] => [s.col + dc, s.row + dr]);
    const inside = ([c, r]: [number, number]) => c >= 0 && r >= 0 && c < map.cols && r < map.rows;
    const cs = cells.map(([c]) => c);
    const rs = cells.map(([, r]) => r);
    const fits =
      cells.every(([c, r]) => c >= -1 && r >= -1 && c <= map.cols && r <= map.rows) &&
      Math.max(map.cols, Math.max(...cs) + 1) + Math.max(0, -Math.min(...cs)) <= MAX_GRID &&
      Math.max(map.rows, Math.max(...rs) + 1) + Math.max(0, -Math.min(...rs)) <= MAX_GRID;
    const grows = !cells.every(inside);
    const n = dragging.length;
    if (dragFrom.id !== map.id) {
      const ok = fits && cells.every(([c, r]) => c >= 0 && r >= 0 && !screenAt(map, c, r));
      return { cells, ok, text: ok ? `Move to ${map.name}` : cells.some(([c, r]) => screenAt(map, c, r)) ? 'That cell is taken' : 'Off the map', dc, dr };
    }
    const other = screenAt(map, over.col, over.row);
    const ok = fits;
    const text = !fits
      ? 'Off the map'
      : n > 1
        ? `Move ${n} screens here`
        : other && other.id !== anchor.id
          ? `⇄ Swap with ${other.name}`
          : grows
            ? 'Move here (the map grows)'
            : 'Move here';
    return { cells, ok, text, dc, dr };
  });

  /** The cells past the right or bottom edge the pointer is over (a column, a row, or both), if the map can grow. */
  function ring(col: number, row: number): [number, number][] {
    const out: [number, number][] = [];
    const pastCol = col === map.cols && map.cols < MAX_GRID;
    const pastRow = row === map.rows && map.rows < MAX_GRID;
    if (pastCol) for (let r = 0; r < map.rows + (pastRow ? 1 : 0); r++) out.push([col, r]);
    if (pastRow) for (let c = 0; c < map.cols; c++) out.push([c, row]);
    return out;
  }

  function screenDown(e: PointerEvent, s: Screen): void {
    swallow = false;
    e.stopPropagation();
    if (e.button !== 0 || picking) return;
    // Alt+drag draws a box from anywhere, on a map full of screens too (as in the slide editor).
    if (e.altKey) return boxFrom(e);
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    const ids = selIds.includes(s.id) ? picked.map((x) => x.id) : [s.id];
    drag = { ids, anchor: s.id, from: map.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false };
  }

  /** A press on an empty cell or between cells: a box, if it's dragged, picks the screens it touches. */
  function gridDown(e: PointerEvent): void {
    swallow = false;
    if (e.button !== 0 || picking) return;
    boxFrom(e);
  }

  /** Start a box at the pointer (Shift or Ctrl keeps the screens selected now). */
  function boxFrom(e: PointerEvent): void {
    // (Alt+drag mustn't drag the screen's picture, or select text.)
    if (e.altKey) e.preventDefault();
    box = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false, base: e.shiftKey || e.ctrlKey || e.metaKey ? [...selIds] : [] };
  }

  function pointerMove(e: PointerEvent): void {
    if (box) {
      box.x = e.clientX;
      box.y = e.clientY;
      if (!box.on && Math.hypot(box.x - box.x0, box.y - box.y0) < 4) return;
      box.on = true;
      const a = cellAt(Math.min(box.x0, box.x), Math.min(box.y0, box.y), MAX_GRID);
      const b = cellAt(Math.max(box.x0, box.x), Math.max(box.y0, box.y), MAX_GRID);
      if (!a || !b) return;
      const inBox = map.screens.filter((s) => s.col >= a[0] && s.col <= b[0] && s.row >= a[1] && s.row <= b[1]).map((s) => s.id);
      selIds = [...new Set([...box.base, ...inBox])];
      return;
    }
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.on && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 4) return;
    drag.on = true;
    const tab = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-map-tab]')?.dataset.mapTab;
    const was = over?.kind === 'tab' ? over.map : null;
    if (tab) over = { kind: 'tab', map: tab };
    else {
      const c = cellAt(e.clientX, e.clientY, 1);
      over = c ? { kind: 'cell', col: c[0], row: c[1] } : null;
    }
    // Held over another map's tab a moment, that map opens (to drop on a cell of it).
    if (tab !== was) {
      clearTimeout(tabTimer);
      if (tab && tab !== map.id) tabTimer = setTimeout(() => (mapId = tab), 500);
    }
  }

  function pointerUp(): void {
    clearTimeout(tabTimer);
    if (box) {
      if (box.on) swallow = true;
      box = null;
    }
    if (!drag) return;
    if (drag.on) {
      swallow = true;
      drop();
    }
    drag = null;
    over = null;
  }

  function cancelDrag(): void {
    clearTimeout(tabTimer);
    if (drag?.on || box?.on) swallow = true;
    drag = null;
    box = null;
    over = null;
  }

  function drop(): void {
    const from = dragFrom;
    const list = dragging;
    if (!from || !list.length || !over) return;
    if (over.kind === 'tab') {
      const to = world.maps.find((m) => m.id === (over as { map: string }).map);
      if (to && to !== from) moveAcross(list, from, to);
      else if (to) mapId = to.id;
    } else if (plan?.ok) {
      if (from === map) moveOnGrid(list, plan.dc, plan.dr);
      else moveAcross(list, from, map, plan.cells);
    }
  }

  function screenClick(e: MouseEvent, s: Screen): void {
    if (swallow) return void (swallow = false);
    if (picking) return pickTarget(s);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      selIds = selIds.includes(s.id) ? selIds.filter((x) => x !== s.id) : [...picked.map((x) => x.id), s.id];
      cursor = [s.col, s.row];
    } else selectOnly(s);
  }

  function emptyClick(c: number, r: number): void {
    if (swallow) return void (swallow = false);
    if (picking) return;
    addScreen(c, r);
  }

  // ---------- Keys ----------

  let screenEl = $state<HTMLElement>();
  // A screen's editor opened (Enter on its cell, ✎ Edit screen…): the cell is gone, so the focus would fall to the
  // page. It goes to the canvas, where Tab picks the screen's objects (unless something there has it already).
  $effect(() => {
    if (!screenEl) return;
    void tick().then(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) screenEl?.querySelector<HTMLElement>('[data-keys-home]')?.focus({ preventScroll: true });
    });
  });

  /** Focus a cell's button (`always`: even when the focus isn't on the grid now). */
  function focusCell(c: number, r: number, always = false): void {
    if (!always && !gridEl?.contains(document.activeElement)) return;
    gridEl?.querySelector<HTMLElement>(`[data-cell="${c},${r}"]`)?.focus();
  }

  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const ARROW_DIR: Record<string, Dir8> = { ArrowLeft: 'w', ArrowRight: 'e', ArrowUp: 'n', ArrowDown: 's' };
  let nameField = $state<HTMLInputElement>();

  /** On the grid: arrows move between cells (the screen there is selected), Enter edits a screen or adds one. */
  function gridKey(e: KeyboardEvent): void {
    const v = ARROWS[e.key];
    if (v && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const c = Math.max(0, Math.min(map.cols - 1, cur[0] + v[0]));
      const r = Math.max(0, Math.min(map.rows - 1, cur[1] + v[1]));
      cursor = [c, r];
      const s = screenAt(map, c, r);
      if (e.shiftKey && s) selIds = [...new Set([...picked.map((x) => x.id), s.id])];
      else selIds = s ? [s.id] : [];
      focusCell(c, r);
    } else if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const s = screenAt(map, ...cur);
      if (!s) return addScreen(...cur);
      selectOnly(s);
      lookId = null;
      editing = true;
    }
  }

  /**
   * On the map: Delete / Backspace deletes the selected screens, Esc deselects, Alt+arrows move them, Ctrl+D
   * duplicates, Ctrl+C / Ctrl+V copy and paste, F2 renames. In the screen editor: Esc (with nothing selected there)
   * goes back to the map and Alt+arrows open the screen next door. Not while typing in a field, nor with a dialog or
   * a menu open.
   */
  function key(e: KeyboardEvent): void {
    if ((drag?.on || box?.on) && e.key === 'Escape') {
      e.preventDefault();
      return cancelDrag();
    }
    if (e.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (editing) {
      if (k === 'escape') {
        editing = false;
        void tick().then(() => sel && focusCell(sel.col, sel.row, true));
      } else if (e.altKey && ARROW_DIR[e.key]) {
        e.preventDefault();
        goNext(ARROW_DIR[e.key]);
      }
      return;
    }
    if (picking && k === 'escape') {
      picking = null;
      return;
    }
    // (Not a key meant for something else in focus: a round's tab, the header's buttons…)
    const at = document.activeElement;
    if (at && at !== document.body && !mapView?.contains(at)) return;
    if (e.altKey && ARROWS[e.key] && picked.length) {
      // (Alt+← is the browser's Back button on Windows.)
      e.preventDefault();
      nudge(picked, ...ARROWS[e.key]);
    } else if ((k === 'delete' || k === 'backspace') && picked.length) {
      e.preventDefault();
      removeScreens(picked);
    } else if (k === 'escape' && selIds.length) selIds = [];
    else if (mod && k === 'd' && picked.length) {
      e.preventDefault();
      duplicateScreens(picked);
    } else if (mod && k === 'c' && sel && !copyIsTheBrowsers(document.activeElement, window.getSelection())) {
      e.preventDefault();
      copyToClipboard(sel);
    } else if (mod && k === 'v' && clipboard.screen) {
      e.preventDefault();
      paste(screenAt(map, ...cur) ? undefined : cur);
    } else if (k === 'f2' && sel) {
      e.preventDefault();
      nameField?.focus();
      nameField?.select();
    }
  }

  /** The screen editor's ◀ ▲ ▼ ▶: the screen next door on the grid (its own look). */
  function goNext(d: Dir8): void {
    const n = sel && gridNeighbour(map, sel, d);
    if (!n) return;
    selectOnly(n);
    lookId = null;
  }

  const blockedSide = (s: Screen, d: Dir8) => s.exits?.[d]?.kind === 'blocked';
  const warpSide = (s: Screen, d: Dir8) => s.exits?.[d]?.kind === 'warp';
  const doorways = (s: Screen) => s.slide.elements.filter((e) => e.role?.class === 'doorway');
  const isStart = (s: Screen) => sameRef(start, { map: map.id, screen: s.id });
  const screenName = (ref?: { map: string; screen: string }) => {
    const m = world.maps.find((x) => x.id === ref?.map);
    const s = m?.screens.find((x) => x.id === ref?.screen);
    return s ? `${m!.name} · ${s.name}` : 'nowhere';
  };
  const NEXT: [Dir8, string][] = [
    ['w', '◀'],
    ['n', '▲'],
    ['s', '▼'],
    ['e', '▶'],
  ];
</script>

<svelte:window onkeydown={key} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={cancelDrag} />

{#if editing && sel}
  <div class="screen-edit" bind:this={screenEl}>
    <div class="row se-head">
      <button onclick={() => (editing = false)} title="Esc">◀ Back to the map</button>
      <span class="muted small">{map.name} ·</span>
      <input class="se-name" bind:value={sel.name} aria-label="Screen name" />
      <label class="small se-look">
        Look
        <select
          value={lookId ?? ''}
          aria-label="Look"
          onchange={(e) => {
            const v = e.currentTarget.value;
            lookId = v === '+' ? addLook(sel, look).id : v || null;
          }}
        >
          <option value="">Own look</option>
          {#each sel.variants ?? [] as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
          <option value="+">＋ Add look (a copy)</option>
        </select>
      </label>
      <span class="spacer"></span>
      <span class="muted small">Alt+arrows: the screen next door</span>
      <span class="next" role="group" aria-label="Screens next door">
        {#each NEXT as [d, arrow] (d)}
          {@const n = gridNeighbour(map, sel, d)}
          <button class="ghost small" onclick={() => goNext(d)} disabled={!n} aria-label="Edit the screen {DIR_NAME[d].toLowerCase()}" title={n ? `${n.name} (Alt+${arrow})` : `Nothing to the ${DIR_NAME[d].toLowerCase()}`}>
            {arrow}
          </button>
        {/each}
      </span>
    </div>
    {#key `${sel.id}:${lookId}`}<div class="se-wrap"><ScreenEditor {world} screen={sel} slide={look?.slide} /></div>{/key}
  </div>
{:else}
  <div class="we" bind:this={mapView}>
    <!-- (＋ Add map is beside the tab list, not in it: only tabs belong there.) -->
    <div class="tabs">
      <div class="tablist" role="tablist" aria-label="Maps">
      {#each world.maps as m, i (m.id)}
        {#if renaming === m.id}
          <input
            class="tab-name"
            value={m.name}
            aria-label="Map name"
            use:focusAll
            onkeydown={(e) => {
              if (e.key === 'Enter') rename(m, e.currentTarget.value);
              else if (e.key === 'Escape') rename(m, m.name);
            }}
            onblur={(e) => renaming === m.id && rename(m, e.currentTarget.value)}
          />
        {:else}
          <button
            role="tab"
            class:on={m.id === map?.id}
            class:drop-before={tabDrop?.id === m.id && !tabDrop.after}
            class:drop-after={tabDrop?.id === m.id && tabDrop.after}
            class:drop-on={drag?.on && over?.kind === 'tab' && over.map === m.id}
            aria-selected={m.id === map?.id}
            data-place="map:{m.id}"
            data-map-tab={m.id}
            draggable="true"
            title={i === 0 ? 'The main map · double-click to rename, drag to reorder, right-click for more' : 'Double-click to rename, drag to reorder, right-click for more'}
            onclick={() => showMap(m)}
            ondblclick={() => (renaming = m.id)}
            onkeydown={(e) => mapTabKey(e, m, i)}
            oncontextmenu={(e) => mapMenu(e, m, i)}
            ondragstart={(e) => {
              tabDrag = m.id;
              e.dataTransfer?.setData('text/x-map', m.id);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            }}
            ondragover={(e) => tabOver(e, m)}
            ondrop={tabDropped}
            ondragend={() => ((tabDrag = null), (tabDrop = null))}
          >
            {i === 0 ? '🗺' : '🏠'} {m.name}
          </button>
        {/if}
      {/each}
      </div>
      <button class="ghost" onclick={addMap} title="A dungeon, a shop, an interior, the Shadow Realm… joined to the rest by doorways">＋ Add map</button>
    </div>

    {#if map}
      <details class="settings">
        <summary>Map settings: {map.name} ({map.cols}×{map.rows})</summary>
        <div class="grid">
          <label class="field">Name<input bind:value={map.name} /></label>
          <label class="field">
            Columns<input type="number" min="1" max="16" value={map.cols} onchange={(e) => {
                const n = sizeTyped(e.currentTarget, map.cols);
                if (n) resize(n, map.rows);
              }} />
          </label>
          <label class="field">
            Rows<input type="number" min="1" max="16" value={map.rows} onchange={(e) => {
                const n = sizeTyped(e.currentTarget, map.rows);
                if (n) resize(map.cols, n);
              }} />
          </label>
          <label class="field">
            Audience sees
            <select bind:value={map.visibility} aria-label="Audience sees">
              <option value="discovered">Only screens they've discovered</option>
              <option value="full">The whole map</option>
              <option value="hidden">Nothing (a secret map)</option>
            </select>
          </label>
          <label class="field">
            Moving between screens
            <select bind:value={map.transition} aria-label="Transition">
              <option value="slide">Flip-screen slide</option>
              <option value="fade">Fade</option>
              <option value="cut">Cut</option>
            </select>
          </label>
        </div>
        <div class="row wrap">
          <label class="check"><input type="checkbox" bind:checked={map.showExits} /> Show open directions on the audience map (not where they lead)</label>
          <label class="check"><input type="checkbox" bind:checked={map.revealNeighbors} /> Arriving somewhere discovers the screens next to it</label>
          <label class="check"><input type="checkbox" bind:checked={map.diagonals} /> Diagonal moves</label>
          <label class="check"><input type="checkbox" bind:checked={map.wrap} /> Edges wrap around</label>
        </div>
        <div class="row">
          <div class="pop">
            <button class="small" onclick={() => (musicFor = 'map')} use:mediaDrop={{ kind: 'audio', onpick: (id) => (map.music = id) }}>🎵 {map.music ? 'Change map music' : 'Map music…'}</button>
            {#if musicFor === 'map'}<MediaPicker kind="audio" onpick={(id) => ((map.music = id), (musicFor = null))} onclose={() => (musicFor = null)} />{/if}
          </div>
          {#if map.music}<button class="ghost small" onclick={() => (map.music = undefined)}>No music</button>{/if}
          <span class="spacer"></span>
          {#if world.maps.length > 1}<button class="ghost small danger" onclick={() => removeMap(map)} title="Delete this map and its screens (Undo brings them back)">🗑 Delete map</button>{/if}
        </div>
      </details>

      {#if picking && pickFrom}
        <div class="picking-note" role="status">
          <span>🎯 Click the screen {DIR_NAME[picking.dir].toLowerCase()} of <b>{pickFrom.name}</b> leads to (any map) · Esc cancels</span>
          <button class="ghost small" onclick={() => (picking = null)}>Cancel</button>
        </div>
      {/if}

      <div class="layout">
        <div class="grid-wrap" class:picking class:dragging={drag?.on} role="presentation" onpointerdown={gridDown}>
          <div
            class="grid-map"
            bind:this={gridEl}
            style:grid-template-columns="repeat({map.cols}, minmax(0, 1fr))"
            role="grid"
            aria-label="{map.name} grid"
            aria-rowcount={map.rows}
            aria-colcount={map.cols}
            aria-multiselectable="true"
            tabindex="-1"
            onkeydown={gridKey}
          >
            {#each Array.from({ length: map.rows }, (_, r) => r) as r (r)}
              <div class="gr" role="row">
                {#each Array.from({ length: map.cols }, (_, c) => c) as c (c)}
                  {@const s = grid.get(`${c},${r}`)}
                  {@const here = cur[0] === c && cur[1] === r}
                  <div class="gc" role="gridcell" aria-selected={!!s && selIds.includes(s.id)}>
                    {#if s}
                      {@const code = /^Screen ([A-Z]\d+)$/.exec(s.name)?.[1]}
                      <button
                        class="cell screen"
                        class:sel={selIds.includes(s.id)}
                        class:lifted={dragging.includes(s)}
                        class:drop={dropCell === `${c},${r}`}
                        data-place="screen:{s.id}"
                        data-cell="{c},{r}"
                        tabindex={here ? 0 : -1}
                        class:bn={blockedSide(s, 'n')}
                        class:be={blockedSide(s, 'e')}
                        class:bs={blockedSide(s, 's')}
                        class:bw={blockedSide(s, 'w')}
                        onpointerdown={(e) => screenDown(e, s)}
                        onclick={(e) => screenClick(e, s)}
                        ondblclick={() => !picking && (selectOnly(s), (lookId = null), (editing = true))}
                        oncontextmenu={(e) => screenMenu(e, s)}
                        ondragstart={(e) => e.preventDefault()}
                        ondragover={(e) => fileOver(e, c, r)}
                        ondragleave={() => dropCell === `${c},${r}` && (dropCell = null)}
                        ondrop={(e) => hasFiles(e) && dropFiles(e, c, r)}
                        onfocus={() => (cursor = [c, r])}
                        aria-label="Screen {s.name}"
                        title={picking ? `Lead there: ${s.name}` : `${s.name}: click for settings, double-click to edit, drag to move`}
                      >
                        <div class="thumb"><Stage><SlideView slide={s.slide} mode="edit" /></Stage></div>
                        <span class="nm">{#if code}<span class="long">Screen </span>{code}{:else}{s.name}{/if}</span>
                        {#if isStart(s)}<span class="start" title="The party starts here">🏁</span>{/if}
                        {#if doorways(s).length || DIRS.some((d) => warpSide(s, d))}<span class="door" title="Has doorways or warps">🚪</span>{/if}
                      </button>
                    {:else}
                      <button
                        class="cell empty"
                        class:drop={dropCell === `${c},${r}`}
                        data-cell="{c},{r}"
                        tabindex={here ? 0 : -1}
                        onclick={() => emptyClick(c, r)}
                        oncontextmenu={(e) => emptyMenu(e, c, r)}
                        ondragover={(e) => fileOver(e, c, r)}
                        ondragleave={() => dropCell === `${c},${r}` && (dropCell = null)}
                        ondrop={(e) => hasFiles(e) && dropFiles(e, c, r)}
                        onfocus={() => (cursor = [c, r])}
                        aria-label="Add a screen at column {c + 1}, row {r + 1}">＋</button
                      >
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}
          </div>

          <!-- Over the grid: the walls between screens, and while dragging, where the screens would land. -->
          <div class="over">
            {#if drag?.on}
              {#if dragFrom?.id === map.id && over?.kind === 'cell'}
                <!-- Near the right or bottom edge, a column (or row) past it to drop on: the map grows. -->
                {#each ring(over.col, over.row) as [c, r] (`${c},${r}`)}
                  <div class="ghost-cell" style:left={along(c, map.cols)} style:top={along(r, map.rows)} style:width={span(map.cols)} style:height={span(map.rows)}></div>
                {/each}
              {/if}
              {#if plan}
                <!-- Past the left or top edge (no room there to show a cell): a bar along it. -->
                {#each plan.cells as [c, r], i (i)}
                  <div
                    class="drop-cell"
                    class:bad={!plan.ok}
                    class:edge={c < 0 || r < 0}
                    style:left={c < 0 ? `-${GAP + 3}px` : along(c, map.cols)}
                    style:top={r < 0 ? `-${GAP + 3}px` : along(r, map.rows)}
                    style:width={c < 0 ? '6px' : span(map.cols)}
                    style:height={r < 0 ? '6px' : span(map.rows)}
                  >
                    {#if dragging[i]?.id === drag.anchor && c >= 0 && r >= 0}<span>{plan.text}</span>{/if}
                  </div>
                {/each}
              {/if}
            {:else}
              {#each map.screens as s (s.id)}
                {#each SEAMS as d (d)}
                  {@const n = gridNeighbour(map, s, d, grid)}
                  {#if n}
                    {@const shut = seamBlocked(map, s, d, grid)}
                    <button
                      class="seam"
                      class:shut
                      style:left={d === 'e' ? along(s.col + 1, map.cols, -GAP / 2) : along(s.col + 0.5, map.cols, -GAP / 2)}
                      style:top={d === 's' ? along(s.row + 1, map.rows, -GAP / 2) : along(s.row + 0.5, map.rows, -GAP / 2)}
                      tabindex="-1"
                      onpointerdown={(e) => e.stopPropagation()}
                      onclick={() => toggleWall(s, d)}
                      aria-label="{shut ? 'Open' : 'Block'} the way between {s.name} and {n.name}"
                      title="{shut ? 'Blocked: click to open' : 'Click to block'} the way between {s.name} and {n.name}">⛔</button
                    >
                  {/if}
                {/each}
              {/each}
            {/if}
          </div>
        </div>

        <aside class="side">
          {#if sel}
            <h4>Screen</h4>
            <label class="field">Name<input bind:value={sel.name} bind:this={nameField} /></label>
            <div class="row">
              <button class="small primary" onclick={() => ((lookId = null), (editing = true))} title="Enter">✎ Edit screen</button>
              <button class="small" onclick={() => duplicateScreens([sel])} title="Ctrl+D">⧉ Duplicate</button>
              <button class="ghost small danger" onclick={() => removeScreens([sel])} title="Delete key; Undo brings it back">🗑 Delete</button>
            </div>
            {#if onstart}
              <div class="row">
                <button class="small" onclick={() => onstart({ map: map.id, screen: sel.id })} disabled={isStart(sel)}>
                  🏁 {isStart(sel) ? 'The party starts here' : 'Make it the start'}
                </button>
              </div>
            {/if}
            <div class="looks" role="list" aria-label="Other looks">
              <span class="muted small" title="Other looks for the same place, switched in play (the village, on fire)">Other looks:</span>
              {#each sel.variants ?? [] as v, i (v.id)}
                <span
                  class="look"
                  class:drop-before={lookDrop?.id === v.id && !lookDrop.after}
                  class:drop-after={lookDrop?.id === v.id && lookDrop.after}
                  role="listitem"
                  oncontextmenu={(e) => lookMenu(e, sel, v, i)}
                  ondragover={(e) => lookOver(e, v)}
                  ondrop={(e) => lookDropped(e, sel)}
                >
                  <span
                    class="grip"
                    draggable="true"
                    role="presentation"
                    title="Drag to reorder"
                    ondragstart={(e) => {
                      lookDrag = v.id;
                      e.dataTransfer?.setData('text/x-look', v.id);
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                    }}
                    ondragend={() => ((lookDrag = null), (lookDrop = null))}>⠿</span
                  >
                  <input bind:value={v.name} aria-label="Look name" />
                  <button class="small" onclick={() => ((lookId = v.id), (editing = true))} aria-label="Edit look {v.name}" title="Edit this look">✎</button>
                  <button class="ghost small" onclick={(e) => lookMenu(e, sel, v, i)} aria-label="More for look {v.name}" aria-haspopup="menu" title="Duplicate, make it the main look, move, delete">⋯</button>
                </span>
              {/each}
              <button class="small" onclick={() => addLook(sel)}>＋ Add look (a copy)</button>
            </div>
            <div class="row nudge">
              <span class="muted small" title="Alt+arrows, or drag the screen">Move:</span>
              <button class="ghost small" onclick={() => nudge([sel], -1, 0)} aria-label="Move left">◀</button>
              <button class="ghost small" onclick={() => nudge([sel], 0, -1)} aria-label="Move up">▲</button>
              <button class="ghost small" onclick={() => nudge([sel], 0, 1)} aria-label="Move down">▼</button>
              <button class="ghost small" onclick={() => nudge([sel], 1, 0)} aria-label="Move right">▶</button>
              <span class="muted small">(swaps with a screen in the way)</span>
            </div>
            <h4>Ways out</h4>
            <p class="muted small">
              By default each side leads to the screen next to it on the grid. Block a side (or click ⛔ between two screens on the map), or
              send it anywhere (another map too).
            </p>
            <table class="exits">
              <tbody>
                {#each DIRS as d (d)}
                  {@const rule = sel.exits?.[d]}
                  {@const e = exitOf(map, sel, d)}
                  <tr>
                    <td title={DIR_NAME[d]}>{DIR_ARROW[d]}</td>
                    <td>
                      <select value={rule?.kind ?? 'auto'} onchange={(ev) => setExit(sel, d, ev.currentTarget.value)} aria-label="{DIR_NAME[d]} exit">
                        <option value="auto">{e.kind === 'open' ? `→ ${screenName(e.to)}` : e.kind === 'none' ? '— nothing there' : 'Grid'}</option>
                        <option value="blocked">Blocked</option>
                        <option value="warp">Leads somewhere else…</option>
                      </select>
                      {#if rule?.kind === 'warp'}
                        <ScreenPicker {world} value={rule.to} label="to" onchange={(ref) => ref && (rule.to = ref)} />
                        <button class="ghost small" class:on={picking?.screen === sel.id && picking.dir === d} aria-pressed={picking?.screen === sel.id && picking.dir === d} onclick={() => (picking = { map: map.id, screen: sel.id, dir: d })}>
                          🎯 Pick on the map
                        </button>
                      {:else if rule?.kind === 'blocked'}
                        <input class="note" bind:value={rule.note} placeholder="Why (e.g. a river)" aria-label="{DIR_NAME[d]} blocked because" />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if doorways(sel).length}
              <h4>Doorways</h4>
              <ul class="small">
                {#each doorways(sel) as dw (dw.id)}<li>{dw.name || 'Doorway'} → {screenName(dw.role?.to)}</li>{/each}
              </ul>
            {/if}
            <div class="row">
              <div class="pop">
                <button class="small" onclick={() => (musicFor = 'screen')} use:mediaDrop={{ kind: 'audio', onpick: (id) => sel && (sel.music = id) }}>🎵 {sel.music ? 'Change screen music' : 'Screen music…'}</button>
                {#if musicFor === 'screen'}<MediaPicker kind="audio" onpick={(id) => ((sel.music = id), (musicFor = null))} onclose={() => (musicFor = null)} />{/if}
              </div>
              {#if sel.music}<button class="ghost small" onclick={() => (sel.music = undefined)}>No music</button>{/if}
            </div>
            <label class="field">
              Host notes (never shown on stream)
              <textarea rows="3" value={sel.hostNotes ?? ''} oninput={(e) => (sel.hostNotes = e.currentTarget.value || undefined)}></textarea>
            </label>
          {:else if picked.length > 1}
            <h4>{picked.length} screens selected</h4>
            <p class="muted small">Drag one of them to move them all (Alt+arrows too). Shift/Ctrl+click adds or takes one away; Alt+drag draws a box.</p>
            <div class="row">
              <button class="small" onclick={() => duplicateScreens(picked)} title="Ctrl+D">⧉ Duplicate</button>
              <button class="ghost small danger" onclick={() => removeScreens(picked)} title="Delete them (Delete key; Undo brings them back)">🗑 Delete</button>
            </div>
          {:else}
            <Tips id="rpg-map" hint="Click an empty cell (＋) to add a screen, click a screen for its settings, double-click it to edit its picture and objects.">
              <ul>
                <li>Drag a screen to move it (onto another to swap them, onto a map's tab to move it there). Drop pictures on the map to make screens.</li>
                <li>
                  Screens next to each other are connected: click ⛔ between two to block the way, or send sides elsewhere in <b>Ways out</b>.
                  Add dungeons, shops and interiors as more maps (＋ Add map) and join them with doorways (<b>🚪 Doorway</b> on a screen).
                </li>
                <li>
                  Keys: arrows move around the grid, Enter edits (or adds), Alt+arrows move the screen, Delete deletes it, Ctrl+D
                  duplicates, Ctrl+C / Ctrl+V copy and paste it, F2 renames, Esc deselects.
                </li>
                <li>Shift/Ctrl+click or draw a box to pick several (from an empty cell, or Alt+drag from anywhere).</li>
              </ul>
            </Tips>
          {/if}
        </aside>
      </div>
    {/if}
  </div>
{/if}

{#if drag?.on && dragging.length}
  {@const lead = dragging.find((s) => s.id === drag?.anchor) ?? dragging[0]}
  <div class="drag-ghost" style:left="{drag.x + 12}px" style:top="{drag.y + 12}px" aria-hidden="true">
    <div class="thumb"><Stage><SlideView slide={lead.slide} mode="edit" /></Stage></div>
    <span class="nm">{lead.name}{dragging.length > 1 ? ` +${dragging.length - 1}` : ''}</span>
    {#if over?.kind === 'tab'}
      {@const to = world.maps.find((m) => m.id === (over as { map: string }).map)}
      <span class="tip">{to && to.id !== dragFrom?.id ? `Move to ${to.name}` : 'Drop on a cell'}</span>
    {:else if plan && (over?.kind === 'cell' && (over.col < 0 || over.row < 0))}
      <span class="tip" class:bad={!plan.ok}>{plan.text}</span>
    {/if}
  </div>
{/if}
{#if box?.on}
  <div
    class="box"
    style:left="{Math.min(box.x0, box.x)}px"
    style:top="{Math.min(box.y0, box.y)}px"
    style:width="{Math.abs(box.x - box.x0)}px"
    style:height="{Math.abs(box.y - box.y0)}px"
  ></div>
{/if}

<style>
  .looks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .look {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .look input {
    width: 110px;
  }
  .look.drop-before::before,
  .look.drop-after::after,
  .tabs button.drop-before::before,
  .tabs button.drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
  }
  .look.drop-before::before,
  .tabs button.drop-before::before {
    left: -3px;
  }
  .look.drop-after::after,
  .tabs button.drop-after::after {
    right: -3px;
  }
  .grip {
    cursor: grab;
    color: var(--muted);
    font-size: 12px;
    padding: 0 2px;
  }
  .we {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
  }
  .tablist {
    display: contents;
  }
  .tabs button {
    position: relative;
    border-radius: 6px 6px 0 0;
  }
  .tabs button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .tabs button.drop-on {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  .tab-name {
    width: 160px;
  }
  .settings summary {
    cursor: pointer;
    font-weight: 600;
  }
  .grid {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  .grid input[type='number'] {
    width: 70px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row.wrap {
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .picking-note {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    border: 1px dashed var(--accent);
    border-radius: 6px;
  }
  /* The help and the screen's settings sit beside the map, which stops growing at 1100px (not at the window's edge). */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1100px) 330px;
    gap: 14px;
    align-items: start;
  }
  .grid-wrap {
    position: relative;
    user-select: none;
  }
  .grid-map {
    display: grid;
    gap: 6px;
  }
  .grid-map:focus {
    outline: none;
  }
  /* Rows and cells are for screen readers: the buttons are the grid's items. */
  .gr,
  .gc {
    display: contents;
  }
  .cell {
    position: relative;
    aspect-ratio: 16 / 9;
    padding: 0;
    border-radius: 6px;
    overflow: hidden;
    /* (Its name's size follows the cell's: a 16-wide map's cells are narrow.) */
    container-type: inline-size;
  }
  .cell.empty {
    border: 2px dashed var(--border);
    background: transparent;
    color: var(--muted);
    font-size: 22px;
  }
  .cell.screen {
    border: 3px solid var(--border);
  }
  .cell.screen.sel {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .cell.lifted {
    opacity: 0.4;
  }
  .cell.drop {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  .picking .cell.screen {
    cursor: crosshair;
  }
  .picking .cell.screen:hover {
    border-color: var(--accent);
  }
  .cell.bn {
    border-top-color: #e6194b;
  }
  .cell.be {
    border-right-color: #e6194b;
  }
  .cell.bs {
    border-bottom-color: #e6194b;
  }
  .cell.bw {
    border-left-color: #e6194b;
  }
  .thumb {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .nm {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 12px;
    max-width: calc(100% - 8px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A narrow cell: the name over two lines, and a default name is just its cell ("B3"). */
  @container (max-width: 110px) {
    .cell .nm {
      left: 2px;
      bottom: 2px;
      padding: 0 3px;
      max-width: calc(100% - 4px);
      line-height: 1.15;
      white-space: normal;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .cell .nm .long {
      display: none;
    }
  }
  .door {
    position: absolute;
    right: 4px;
    top: 4px;
    font-size: 14px;
  }
  .start {
    position: absolute;
    left: 4px;
    top: 4px;
    font-size: 14px;
  }
  /* Over the grid (and past its edges while dragging). */
  .over {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .seam {
    position: absolute;
    translate: -50% -50%;
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    font-size: 12px;
    line-height: 1;
    pointer-events: auto;
    opacity: 0;
    background: var(--panel-2);
    transition: opacity 0.12s;
  }
  .grid-wrap:hover .seam {
    opacity: 0.35;
  }
  .grid-wrap .seam:hover,
  .seam:focus-visible,
  .seam.shut {
    opacity: 1;
  }
  .seam.shut {
    border-color: #e6194b;
  }
  .ghost-cell,
  .drop-cell {
    position: absolute;
    border-radius: 6px;
  }
  .ghost-cell {
    border: 2px dashed var(--muted);
    opacity: 0.5;
  }
  .drop-cell {
    border: 3px dashed var(--accent);
    background: rgba(79, 124, 255, 0.15);
    display: grid;
    place-items: center;
  }
  .drop-cell.edge {
    border: 0;
    border-radius: 3px;
    background: var(--accent);
  }
  .drop-cell.bad {
    border-color: #e6194b;
    background: rgba(230, 25, 75, 0.12);
  }
  .drop-cell.edge.bad {
    background: #e6194b;
  }
  .drop-cell span {
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-size: 12px;
    white-space: nowrap;
  }
  .drag-ghost {
    position: fixed;
    z-index: var(--z-menu);
    width: 160px;
    aspect-ratio: 16 / 9;
    border: 2px solid var(--accent);
    border-radius: 6px;
    pointer-events: none;
    opacity: 0.85;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  .drag-ghost .tip.bad {
    background: #e6194b;
  }
  .drag-ghost .thumb {
    overflow: hidden;
    border-radius: 4px;
  }
  .drag-ghost .tip {
    position: absolute;
    left: 0;
    bottom: calc(100% + 4px);
    white-space: nowrap;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--accent-fill);
    color: #fff;
    font-size: 12px;
  }
  .box {
    position: fixed;
    z-index: var(--z-menu);
    border: 1px dashed var(--accent);
    background: rgba(79, 124, 255, 0.12);
    pointer-events: none;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h4 {
    margin: 6px 0 0;
  }
  .exits td {
    padding: 2px 4px;
    vertical-align: top;
  }
  .exits select {
    max-width: 220px;
  }
  .note {
    width: 200px;
    margin-top: 2px;
  }
  .on {
    border-color: var(--accent);
  }
  .pop {
    position: relative;
  }
  /* The window's height below the header and the round's row of buttons (the round's settings step aside). */
  .screen-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: calc(100vh - 130px);
  }
  .se-head {
    flex-wrap: wrap;
  }
  .se-name {
    width: 180px;
    font-weight: 600;
  }
  .se-look select {
    max-width: 200px;
  }
  .next {
    display: inline-flex;
    gap: 2px;
  }
  .se-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
