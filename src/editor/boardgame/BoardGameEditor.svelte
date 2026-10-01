<!--
  A board-game round (games-maker spec §7.13): the spaces on the board and their links (a loop or a path, forks
  allowed), what each space does when passed or landed on, the backdrop, off-board zones, how a turn's move is
  decided, and how to win. The board is one tab stop: the arrow keys go from space to space, and the keys work like
  the RPG map's (Alt+arrows move the selected spaces, Ctrl+C / Ctrl+V, Ctrl+D, F2, Delete).
-->
<script lang="ts">
  import Tips from '../Tips.svelte';
  import { onDestroy, tick, untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { take } from '../../lib/nav.svelte';
  import { begin, step } from '../../lib/history.svelte';
  import { adoptUsedBy, clipboard, holdUsedBy } from '../../lib/clipboard.svelte';
  import { DragOrder, rowKeys } from '../../lib/dragorder.svelte';
  import { clearOffset, copyActions, copySpaces, copyZone, moveTo } from '../../lib/listedit';
  import { showMenu } from '../../lib/menustate.svelte';
  import { copyIsTheBrowsers, isTextField } from '../../lib/undokeys';
  import { clampToBoard, moverDiceGone, moverPreset, newBoardSpace, nextSpaceName, previousOf, SPACE_COLORS, spaceById, spaceToward } from '../../lib/boardgame';
  import BoardSpaces from '../../lib/boardgame/BoardSpaces.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import { newId, SLIDE_H, SLIDE_W, textSlide, type BoardGameRound, type BoardSpace, type BoardZone } from '../../lib/model';
  import { clone } from '../../lib/ops';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import ActionListEditor from '../rpg/ActionListEditor.svelte';
  import SlideModal from '../rpg/SlideModal.svelte';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import { fittingFile, hasFiles, mediaDrop, useFile } from '../../lib/mediadrop';
  import SlideEditor from '../slide/SlideEditor.svelte';
  import ToolPopup, { newTool } from '../tools/ToolPopup.svelte';

  let { round }: { round: BoardGameRound } = $props();
  const game = $derived(app.game);

  /** The wheel a turn's move spins, if it does. */
  const moverWheel = $derived(round.mover.kind === 'wheel' ? round.mover.wheel : null);

  /** The saved dice a turn's move rolls, if it does (linked by id: renaming them keeps them). */
  const moverDice = $derived(moverPreset(game, round));
  /** What Move by shows: the wheel's id, or the kind of move. */
  const moverValue = () => (round.mover.kind === 'wheel' ? round.mover.wheel : round.mover.kind);

  /** Dice typed in Move by: saved dice when it's their name, else standard dice ("2d6"). */
  function setMoverDice(text: string): void {
    const m = round.mover;
    if (m.kind !== 'dice') return;
    const d = game.dice.find((x) => x.name === text.trim());
    m.dice = text;
    if (d) m.diceId = d.id;
    else delete m.diceId;
  }
  /** The wheel or dice open over the board (one made from Move by, or ✎ Edit). */
  let tool = $state<{ kind: 'wheel' | 'dice'; id: string } | null>(null);
  const NEW_WHEEL = 'new-wheel';
  const NEW_DICE = 'new-dice';
  /** ＋ Add wheel… / ＋ Add dice… in Move by: make one, move by it (one step), and open it. */
  function newMover(kind: 'wheel' | 'dice'): void {
    if (kind === 'wheel') {
      const w = newTool('wheel');
      step(`Move by: new wheel “${w.name}”`, () => {
        game.wheels.push(w);
        round.mover = { kind: 'wheel', wheel: w.id };
      });
      tool = { kind, id: w.id };
    } else {
      const d = newTool('dice');
      step(`Move by: new dice “${d.name}”`, () => {
        game.dice.push(d);
        round.mover = { kind: 'dice', dice: d.name, diceId: d.id };
      });
      tool = { kind, id: d.id };
    }
  }

  let view = $state<'spaces' | 'backdrop' | 'zones'>('spaces');
  /** The selected spaces (Shift+click or a box adds more), the last one picked last. */
  let selIds = $state<string[]>([]);
  const picked = $derived(selIds.map((id) => spaceById(round, id)).filter((s): s is BoardSpace => !!s));
  /** The one space selected, whose settings the side panel shows. */
  const sel = $derived(picked.length === 1 ? picked[0] : undefined);
  const selectOnly = (id: string | null) => (selIds = id ? [id] : []);
  /** The next space clicked is linked from (or unlinked from) the selected one. */
  let linking = $state(false);
  let pickingIcon = $state(false);
  let zoneSlide = $state<string | null>(null);

  // An undo or redo here shows the view it changed: the space selected, the backdrop, the zone (and its screen).
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'round' || place.round !== untrack(() => round.id) || !place.part) return;
    const part = place.part;
    if (part.kind === 'space') {
      view = 'spaces';
      selectOnly(part.space);
    } else if (part.kind === 'backdrop') view = 'backdrop';
    else if (part.kind === 'zone') {
      view = 'zones';
      if (part.inSlide) zoneSlide = part.zone;
    }
  });

  let boxW = $state(0);
  const scale = $derived(boxW / SLIDE_W || 1);
  /** Spaces being dragged: where the press began, and where each of them was then. */
  let drag: { from: { x: number; y: number }; at: Map<string, { x: number; y: number }>; moved: boolean; only: string } | null = null;
  /** A link being drawn from a space (Alt+drag, or its ⊕ handle), to where the pointer is. */
  let wire = $state<{ from: string; x: number; y: number } | null>(null);
  /** A selection box being dragged on the empty board (`add`: Shift keeps the ones selected). */
  let box = $state<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  let canvas = $state<HTMLDivElement>();
  let root = $state<HTMLDivElement>();

  // ---------- Undo: the game's history (Ctrl+Z / Ctrl+Shift+Z are the editor's) ----------
  // A drag is one step, and so is a delete.
  let endDrag: (() => void) | null = null;
  onDestroy(() => endDrag?.());

  // ---------- The keyboard: the board is one tab stop ----------
  // One space at a time can take the focus by Tab (the last one selected, else the last one in focus, else Start); the
  // arrow keys go from space to space, and Tab goes on to the space's settings.

  /** The space last in focus. */
  let focusId = $state<string | null>(null);
  /** The space Tab goes to on the board. */
  const rover = $derived.by(() => {
    const has = (id: string | null | undefined) => !!id && round.spaces.some((s) => s.id === id);
    const last = selIds[selIds.length - 1];
    return has(last) ? last : has(focusId) ? focusId : (spaceById(round, round.start) ?? round.spaces[0])?.id;
  });
  /** A press with the pointer, or the focus moved by the arrows: the focus coming to a space doesn't select it then. */
  let pressing = false;
  let quiet = false;
  let nameField = $state<HTMLInputElement>();
  let side = $state<HTMLElement>();

  const spaceEl = (id: string) => canvas?.querySelector<HTMLElement>(`[data-space="${CSS.escape(id)}"]`);
  /** Put the focus on a space (or on the board itself), without selecting anything. */
  function focusSpace(id: string | null | undefined): void {
    quiet = true;
    (id ? spaceEl(id) : canvas)?.focus({ preventScroll: true });
    quiet = false;
  }
  /** After a change that redraws the spaces: the focus on this one, if the focus was on the board. */
  function refocus(id: string | null | undefined, always = false): void {
    if (!always && !canvas?.contains(document.activeElement)) return;
    void tick().then(() => focusSpace(id));
  }
  /** Tab came to a space: it's selected, so its settings show beside the board (Tab goes on to them). */
  function boardFocus(e: FocusEvent): void {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-space]')?.dataset.space;
    if (!id) return;
    focusId = id;
    if (!quiet && !pressing && !selIds.includes(id)) selectOnly(id);
  }

  function toBoard(e: PointerEvent): { x: number; y: number } {
    const r = canvas!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  function capture(e: PointerEvent): void {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer (tests, some pens) can't be captured: dragging still works while over the board.
    }
  }

  const SPACE_R = 58;

  /** The space under a point of the board (the topmost). */
  function spaceAt(p: { x: number; y: number }): BoardSpace | undefined {
    return [...round.spaces].reverse().find((s) => Math.hypot(s.x - p.x, s.y - p.y) <= SPACE_R);
  }

  /** Link `from` to `to`, or unlink them when it already leads there. */
  function toggleLink(from: BoardSpace, to: BoardSpace): void {
    const on = from.next.includes(to.id);
    step(on ? `Unlinked “${from.name}” from “${to.name}”` : `Linked “${from.name}” to “${to.name}”`, () => {
      from.next = on ? from.next.filter((n) => n !== to.id) : [...from.next, to.id];
    });
  }

  function spaceDown(e: PointerEvent, s: BoardSpace): void {
    e.stopPropagation();
    pressing = true;
    if (e.button !== 0) return;
    if (linking && sel && sel.id !== s.id) {
      toggleLink(sel, s);
      linking = false;
      return;
    }
    if (e.altKey) return void startWire(e, s);
    if (e.shiftKey) {
      selIds = selIds.includes(s.id) ? selIds.filter((x) => x !== s.id) : [...selIds, s.id];
      return;
    }
    if (!selIds.includes(s.id)) selectOnly(s.id);
    drag = { from: toBoard(e), at: new Map(picked.map((x) => [x.id, { x: x.x, y: x.y }])), moved: false, only: s.id };
    endDrag?.();
    endDrag = begin(picked.length > 1 ? `Moved ${picked.length} spaces` : `Moved space “${s.name}”`);
    capture(e);
  }

  /** Start drawing a link from a space (it's made where the pointer is let go). */
  function startWire(e: PointerEvent, s: BoardSpace): void {
    e.stopPropagation();
    e.preventDefault();
    selectOnly(s.id);
    wire = { from: s.id, ...toBoard(e) };
    capture(e);
  }

  function boardMove(e: PointerEvent): void {
    if (wire) return void Object.assign(wire, toBoard(e));
    if (box) {
      const p = toBoard(e);
      box.x1 = p.x;
      box.y1 = p.y;
      return;
    }
    if (!drag) return;
    const p = toBoard(e);
    if (Math.abs(p.x - drag.from.x) + Math.abs(p.y - drag.from.y) > 2) drag.moved = true;
    shift(drag.at, p.x - drag.from.x, p.y - drag.from.y);
  }

  /** Move spaces from where they were by as much of (dx, dy) as keeps all of them on the board (in shape). */
  function shift(at: Map<string, { x: number; y: number }>, dx: number, dy: number): void {
    const was = [...at.values()];
    const lo = clampToBoard(-Infinity, -Infinity);
    const hi = clampToBoard(Infinity, Infinity);
    dx = Math.round(Math.max(lo.x - Math.min(...was.map((w) => w.x)), Math.min(hi.x - Math.max(...was.map((w) => w.x)), dx)));
    dy = Math.round(Math.max(lo.y - Math.min(...was.map((w) => w.y)), Math.min(hi.y - Math.max(...was.map((w) => w.y)), dy)));
    for (const [id, w] of at) {
      const s = spaceById(round, id);
      if (!s) continue;
      s.x = w.x + dx;
      s.y = w.y + dy;
    }
  }

  /** The pointer let go: a drag is one step, a link is made, a box selects what's in it. */
  function pointerUp(e: PointerEvent): void {
    pressing = false;
    endDrag?.();
    endDrag = null;
    // A click (no drag) on one of several selected spaces picks just that one.
    if (drag && !drag.moved && drag.at.size > 1) selectOnly(drag.only);
    drag = null;
    if (wire) {
      const from = spaceById(round, wire.from);
      const to = canvas && spaceAt(toBoard(e));
      wire = null;
      if (from && to && to.id !== from.id) toggleLink(from, to);
    }
    if (box) {
      const b = box;
      box = null;
      const [x0, x1] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)];
      const [y0, y1] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
      // (A click without a drag only deselects.)
      const inside = x1 - x0 + (y1 - y0) < 8 ? [] : round.spaces.filter((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1).map((s) => s.id);
      selIds = b.add ? [...selIds, ...inside.filter((id) => !selIds.includes(id))] : inside;
    }
  }

  /**
   * Ctrl+click (⌘+click) on the board adds a space after the selected one; a drag on the empty board draws a box
   * that selects the spaces in it (a plain click deselects).
   */
  function boardDown(e: PointerEvent): void {
    pressing = true;
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (e.target !== e.currentTarget && !el.closest('.backdrop') && !el.closest('[data-link]')) return;
    linking = false;
    if (e.ctrlKey || e.metaKey) return addSpaceAt(toBoard(e));
    const p = toBoard(e);
    box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey };
    capture(e);
  }

  function addSpaceAt(at: { x: number; y: number }): void {
    const p = clampToBoard(at.x, at.y);
    const s = newBoardSpace(p.x, p.y, nextSpaceName(round), SPACE_COLORS[round.spaces.length % SPACE_COLORS.length]);
    // Inserted after the selected space: it takes over the selected space's links (so a loop stays a loop).
    if (sel) {
      s.next = [...sel.next];
      sel.next = [s.id];
    }
    round.spaces.push(s);
    selectOnly(s.id);
    refocus(s.id);
  }

  /** A copy of a space (its look, buttons, secret and notes), next to it and after it on the path. */
  function duplicateSpace(s: BoardSpace): void {
    const at = clampToBoard(s.x + 160, s.y);
    const copy: BoardSpace = { ...$state.snapshot(s), id: newId(), name: nextSpaceName(round), x: at.x, y: at.y, next: [...s.next] };
    if (s.onPass) copy.onPass = copyActions(s.onPass);
    if (s.onLand) copy.onLand = copyActions(s.onLand);
    step(`Duplicated space “${s.name}”`, () => {
      s.next = [copy.id];
      round.spaces.splice(round.spaces.indexOf(s) + 1, 0, copy);
    });
    selectOnly(copy.id);
    refocus(copy.id);
  }

  /**
   * Ctrl+D: one space is copied after it on the path; several are copied together (the links between them too),
   * a little down and right, and the copies are selected.
   */
  function duplicateSpaces(list: BoardSpace[]): void {
    if (list.length === 1) return duplicateSpace(list[0]);
    if (!list.length) return;
    const src = $state.snapshot(list) as BoardSpace[];
    const d = clearOffset(round, src);
    const copies = copySpaces(round, src, d, d);
    step(`Duplicated ${list.length} spaces`, () => round.spaces.push(...copies));
    selIds = copies.map((c) => c.id);
    refocus(copies.at(-1)?.id);
  }

  // ---------- Copy and paste (in this board, another board, or another game) ----------

  function copySpacesToClipboard(list: BoardSpace[]): void {
    if (!list.length) return;
    clipboard.spaces = clone($state.snapshot(list) as BoardSpace[]);
    // Their buttons' wheels, dice and files come along, so they paste into another game.
    holdUsedBy(game, clipboard.spaces);
    const what = list.length === 1 ? list[0].name : `${list.length} spaces`;
    toast(`Copied ${what}: paste on any board (Ctrl+V)`);
  }

  /** Paste the copied spaces: where they were (a little down and right if that's taken), or with the first at `at`. */
  function pasteSpaces(at?: { x: number; y: number }): void {
    const src = clipboard.spaces;
    if (!src.length) return void toast('Copy a space first (right-click it, or Ctrl+C)');
    const d = clearOffset(round, src);
    const copies = copySpaces(round, src, at ? at.x - src[0].x : d, at ? at.y - src[0].y : d);
    step(copies.length === 1 ? `Pasted space “${copies[0].name}”` : `Pasted ${copies.length} spaces`, () => {
      adoptUsedBy(game, copies);
      round.spaces.push(...copies);
    });
    selIds = copies.map((c) => c.id);
    refocus(copies.at(-1)?.id, true);
  }

  /** F2 or Enter: the settings beside the board (F2: the name, selected to type over). */
  function openPanel(rename: boolean): void {
    void tick().then(() => {
      const field = sel ? nameField : side?.querySelector<HTMLElement>('input, select, textarea, button');
      field?.focus();
      if (rename && field instanceof HTMLInputElement) field.select();
    });
  }

  /** A link's menu (right-click its line): both ways or one, reversed, or gone. */
  function linkMenu(e: MouseEvent, a: BoardSpace, b: BoardSpace): void {
    const both = b.next.includes(a.id);
    const title = `“${a.name}” ${both ? '↔' : '→'} “${b.name}”`;
    showMenu(e, [
      { heading: `${a.name} ${both ? '↔' : '→'} ${b.name}` },
      both
        ? { label: `→ One way (${a.name} → ${b.name})`, onclick: () => step(`Made ${title} one way`, () => (b.next = b.next.filter((n) => n !== a.id))) }
        : { label: '⇄ Both ways', onclick: () => step(`Made ${title} both ways`, () => (b.next = [...b.next, a.id])) },
      {
        label: '↺ Reverse',
        disabled: both,
        onclick: () =>
          step(`Reversed ${title}`, () => {
            a.next = a.next.filter((n) => n !== b.id);
            b.next = [...b.next, a.id];
          }),
      },
      { sep: true },
      {
        label: '− Unlink',
        danger: true,
        onclick: () =>
          step(
            `Unlinked ${title}`,
            () => {
              a.next = a.next.filter((n) => n !== b.id);
              b.next = b.next.filter((n) => n !== a.id);
            },
            { notify: true },
          ),
      },
    ]);
  }

  /** Right-click: a space's menu, or the board's (add a space there). */
  function boardMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-space]');
    const s = el ? spaceById(round, el.dataset.space) : undefined;
    const link = target.closest<Element>('[data-link]')?.getAttribute('data-link')?.split('>');
    const [la, lb] = link ? [spaceById(round, link[0]), spaceById(round, link[1])] : [];
    const at = toBoard(e as PointerEvent);
    const pasteItem = {
      label: clipboard.spaces.length > 1 ? `📋 Paste ${clipboard.spaces.length} spaces here` : clipboard.spaces.length ? `📋 Paste “${clipboard.spaces[0].name}” here` : '📋 Paste here',
      onclick: () => pasteSpaces(at),
      disabled: !clipboard.spaces.length,
      hint: clipboard.spaces.length ? undefined : 'Copy a space first (right-click it, or Ctrl+C)',
      keys: 'Ctrl+V',
    };
    if (s && picked.length > 1 && selIds.includes(s.id)) {
      const list = picked;
      showMenu(e, [
        { heading: `${list.length} spaces` },
        { label: '⧉ Duplicate them', onclick: () => duplicateSpaces(list), keys: 'Ctrl+D' },
        { label: `📋 Copy ${list.length} spaces`, onclick: () => copySpacesToClipboard(list), keys: 'Ctrl+C' },
        {
          label: list.every((x) => x.secret) ? '👁 Not secret' : '❓ Make them secret',
          onclick: () => {
            const on = !list.every((x) => x.secret);
            setAll(on ? 'Secret' : 'Not secret', (x) => (x.secret = on || undefined));
          },
        },
        { sep: true },
        { label: `🗑 Delete ${list.length} spaces`, danger: true, onclick: () => removeSpaces(list), keys: 'Delete' },
      ]);
    } else if (s) {
      selectOnly(s.id);
      showMenu(e, [
        { heading: s.name },
        { label: '✎ Rename', onclick: () => openPanel(true), keys: 'F2' },
        { label: '🏁 Make it Start', onclick: () => (round.start = s.id), disabled: (round.start ?? round.spaces[0]?.id) === s.id },
        { label: '🔗 Link it to…', onclick: () => (linking = true), hint: 'Then click the space it leads to (or Alt+drag from it)' },
        { label: '＋ Add a space after it', onclick: () => addSpaceAt({ x: s.x + 160, y: s.y }) },
        { label: '⧉ Duplicate space', onclick: () => duplicateSpace(s), keys: 'Ctrl+D' },
        { label: '📋 Copy space', onclick: () => copySpacesToClipboard([s]), keys: 'Ctrl+C' },
        { sep: true },
        { label: '🗑 Delete space', danger: true, onclick: () => removeSpace(s), keys: 'Delete' },
      ]);
    } else if (la && lb) linkMenu(e, la, lb);
    else
      showMenu(e, [
        { label: sel ? `＋ Add a space here (after ${sel.name})` : '＋ Add a space here', onclick: () => addSpaceAt(at) },
        pasteItem,
        { sep: true },
        { label: 'Select all', onclick: () => (selIds = round.spaces.map((x) => x.id)), keys: 'Ctrl+A' },
        { label: 'Deselect', onclick: () => selectOnly(null), disabled: !selIds.length, keys: 'Esc' },
      ]);
  }

  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  /**
   * On the board (a space or the board itself in focus), the keys work like the RPG map's: the arrows go to the
   * nearest space that way (Shift: adding it to the selection; while linking, only the focus moves and Enter links),
   * Alt+arrows move the selected spaces (Shift+Alt: further), Enter opens the selected space's settings (on an empty
   * board it adds a space), F2 renames, Ctrl+C / Ctrl+V copy and paste, Ctrl+D duplicates, Ctrl+A selects them all,
   * Delete / Backspace deletes, Esc deselects. Tab always leaves the board. Not while a dialog or menu is open.
   */
  function key(e: KeyboardEvent): void {
    if (e.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const v = ARROWS[e.key];
    const here = spaceById(round, (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('[data-space]')?.dataset.space);
    if (v && e.altKey && !mod) {
      // (Alt+← is the browser's Back button on Windows.) Joined into one step with the next nudges.
      e.preventDefault();
      if (!picked.length) return;
      const d = e.shiftKey ? 50 : 10;
      shift(new Map(picked.map((x) => [x.id, { x: x.x, y: x.y }])), v[0] * d, v[1] * d);
    } else if (v && !mod) {
      e.preventDefault();
      const from = here ?? spaceById(round, rover ?? undefined);
      const to = here || !from ? (from && spaceToward(round, from, ...v)) : from;
      if (!to) return;
      if (!linking) selIds = e.shiftKey ? [...selIds.filter((id) => id !== to.id), to.id] : [to.id];
      focusSpace(to.id);
    } else if (k === 'enter' && !mod && !e.altKey) {
      e.preventDefault();
      if (linking && sel && here && here.id !== sel.id) {
        toggleLink(sel, here);
        linking = false;
      } else if (!round.spaces.length) addSpaceAt({ x: SLIDE_W / 2, y: SLIDE_H / 2 });
      else if (picked.length) openPanel(false);
    } else if (k === 'f2' && sel) {
      e.preventDefault();
      openPanel(true);
    } else if (mod && !e.altKey && k === 'a') {
      e.preventDefault();
      selIds = round.spaces.map((s) => s.id);
    } else if (mod && !e.altKey && k === 'c') {
      if (!picked.length || copyIsTheBrowsers(document.activeElement, window.getSelection())) return;
      e.preventDefault();
      copySpacesToClipboard(picked);
    } else if (mod && !e.altKey && k === 'v') {
      if (!clipboard.spaces.length) return;
      e.preventDefault();
      pasteSpaces();
    } else if (mod && !e.altKey && k === 'd') {
      e.preventDefault();
      duplicateSpaces(picked);
    } else if ((k === 'delete' || k === 'backspace') && !mod && !e.altKey && picked.length) {
      e.preventDefault();
      removeSpaces(picked);
    } else if (k === 'escape' && (linking || wire || selIds.length)) {
      e.preventDefault();
      if (linking || wire) {
        linking = false;
        wire = null;
      } else selectOnly(null);
    }
  }

  // A picture dropped on a space is its icon; dropped on the empty board, it's the backdrop's background picture.
  /** Where a dragged file would go: a space's id, or 'board'. */
  let fileOver = $state<string | null>(null);
  const spaceUnder = (e: DragEvent) => spaceById(round, (e.target as HTMLElement).closest<HTMLElement>('[data-space]')?.dataset.space);
  function fileDragOver(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    fileOver = spaceUnder(e)?.id ?? 'board';
  }
  function fileDrop(e: DragEvent): void {
    fileOver = null;
    const file = fittingFile(Array.from(e.dataTransfer?.files ?? []), 'image');
    if (!hasFiles(e) || !file) return;
    e.preventDefault();
    const s = spaceUnder(e);
    if (s) selectOnly(s.id);
    void useFile(file, { kind: 'image', onpick: (id) => (s ? (s.icon = id) : (round.slide.background.image = id)) });
  }

  /** Buttons that sent players to a deleted space or zone point nowhere now (the checklist says so). */
  function unlinkGotos(to: { space?: string; zone?: string }): void {
    for (const x of round.spaces)
      for (const a of [...(x.onPass ?? []), ...(x.onLand ?? [])]) {
        if (a.do !== 'goto') continue;
        if (to.space && a.space === to.space) a.space = undefined;
        if (to.zone && a.zone === to.zone) a.zone = undefined;
      }
  }

  function removeSpace(s: BoardSpace): void {
    removeSpaces([s]);
  }

  /** Delete spaces in one step, the path closing up over each (in the list's order, so a run of them bridges too). */
  function removeSpaces(list: BoardSpace[]): void {
    if (!list.length) return;
    const what = list.length === 1 ? list[0].name : `${list.length} spaces`;
    const focused = !!canvas?.contains(document.activeElement);
    // Done at once: the note at the bottom offers Undo.
    step(list.length === 1 ? `Deleted space “${what}”` : `Deleted ${what}`, () => {
      for (const s of list) {
        // Spaces that led here now lead where it led (when it had one way on).
        for (const p of previousOf(round, s.id)) {
          p.next = p.next.filter((n) => n !== s.id);
          if (s.next.length === 1 && s.next[0] !== p.id && !p.next.includes(s.next[0])) p.next.push(s.next[0]);
        }
        round.spaces = round.spaces.filter((x) => x.id !== s.id);
        if (round.start === s.id) round.start = undefined;
        unlinkGotos({ space: s.id });
      }
    }, { notify: true });
    selectOnly(null);
    // (The board keeps the focus, for the next key.)
    if (focused) refocus(null, true);
  }

  /** The same colour, or secret or not, for all the selected spaces. */
  function setAll(what: string, fn: (s: BoardSpace) => void): void {
    step(`${what} for ${picked.length} spaces`, () => picked.forEach(fn));
  }

  function addZone(): void {
    const name = round.zones.length ? `Zone ${round.zones.length + 1}` : 'Shadow Realm';
    const slide = textSlide(name);
    slide.background = { color: '#2a0845' };
    const id = newId();
    round.zones = [...round.zones, { id, name, slide }];
    void tick().then(() => {
      const field = document.querySelector<HTMLInputElement>(`[data-place="zone:${id}"] input[aria-label="Zone name"]`);
      field?.focus();
      field?.select();
    });
  }

  /** Done at once (with its screen): the note at the bottom offers Undo. */
  function removeZone(z: BoardZone): void {
    step(
      `Deleted zone “${z.name}”`,
      () => {
        round.zones = round.zones.filter((x) => x.id !== z.id);
        unlinkGotos({ zone: z.id });
      },
      { notify: true },
    );
  }

  const zone = $derived(round.zones.find((z) => z.id === zoneSlide));

  /** Zones reorder (the order of the host's Send to list) by a drag or Alt+↑/↓. */
  const zoneRows = new DragOrder();
  function moveZone(from: number, to: number): void {
    const z = round.zones[from];
    if (!z || to < 0 || to >= round.zones.length || to === from) return;
    step(`Moved zone “${z.name}” ${to < from ? 'up' : 'down'}`, () => moveTo(round.zones, from, to));
  }

  /** A copy right after it, with its own screen. */
  function duplicateZone(z: BoardZone): void {
    const copy = copyZone(z, round.zones.map((x) => x.name));
    step(`Duplicated zone “${z.name}”`, () => round.zones.splice(round.zones.indexOf(z) + 1, 0, copy));
  }

  /** Right-click a zone (not in its text boxes, which keep the browser's own menu). */
  function zoneMenu(e: MouseEvent, z: BoardZone, i: number): void {
    if (isTextField(e.target)) return;
    showMenu(e, [
      { heading: z.name },
      { label: '✎ Edit its screen…', onclick: () => (zoneSlide = z.id) },
      { label: '⧉ Duplicate', onclick: () => duplicateZone(z), keys: 'Ctrl+D' },
      { label: '▲ Move up', onclick: () => moveZone(i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => moveZone(i, i + 1), disabled: i === round.zones.length - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: '🗑 Delete zone', danger: true, onclick: () => removeZone(z) },
    ]);
  }
</script>

<!-- A drag ends wherever the pointer is let go (it's one undo step). -->
<svelte:window onpointerup={pointerUp} onpointercancel={pointerUp} />

<div class="bge" bind:this={root}>
  <div class="row settings">
    <label class="field">Round name<input bind:value={round.name} data-round-name /></label>
    <label class="field">
      Move by
      <select
        aria-label="Move by"
        value={moverValue()}
        onchange={(e) => {
          const v = e.currentTarget.value;
          if (v === NEW_WHEEL || v === NEW_DICE) {
            newMover(v === NEW_WHEEL ? 'wheel' : 'dice');
            // (Moving by dice already, the box wouldn't change by itself: it would go on saying "＋ Add dice…".)
            e.currentTarget.value = moverValue();
            return;
          }
          step(`Move by: ${e.currentTarget.selectedOptions[0]?.text}`, () => {
            round.mover = v === 'dice' ? { kind: 'dice', dice: 'd6' } : v === 'step' ? { kind: 'step' } : { kind: 'wheel', wheel: v };
          });
        }}
      >
        {#if moverWheel && !game.wheels.some((w) => w.id === moverWheel)}<option value={moverWheel}>⚠ Deleted wheel — pick another</option>{/if}
        <option value="dice">🎲 Dice</option>
        <option value="step">👣 One space a turn (pick the way)</option>
        {#each game.wheels as w (w.id)}<option value={w.id}>🎡 {w.name}</option>{/each}
        <option value={NEW_WHEEL}>＋ Add wheel…</option>
        <option value={NEW_DICE}>＋ Add dice…</option>
      </select>
    </label>
    {#if moverWheel && game.wheels.some((w) => w.id === moverWheel)}
      <button class="small ghost" onclick={() => (tool = { kind: 'wheel', id: moverWheel })} title="Change this wheel's slices">✎ Edit wheel</button>
    {/if}
    {#if round.mover.kind === 'dice'}
      <label class="field">
        Dice<input
          class="n"
          value={moverDice?.name ?? round.mover.dice}
          oninput={(e) => setMoverDice(e.currentTarget.value)}
          placeholder="d6, 2d6"
          list="bg-dice"
          title="Standard dice (d6, 2d6…), or the name of dice saved in 🎡 Wheels & Dice"
        />
      </label>
      <datalist id="bg-dice">{#each game.dice as d (d.id)}<option value={d.name}></option>{/each}</datalist>
      {#if moverDice}
        <button class="small ghost" onclick={() => (tool = { kind: 'dice', id: moverDice.id })} title="Change these dice">✎ Edit dice</button>
      {:else if moverDiceGone(game, round)}
        <span class="warn small" role="status">⚠ These dice were deleted: pick others</span>
      {/if}
    {/if}
    <label class="field">
      Start
      <select bind:value={round.start} aria-label="Start space">
        <option value={undefined}>— first space —</option>
        {#each round.spaces as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      </select>
    </label>
  </div>
  <div class="row settings">
    <label class="field grow">How to win<input bind:value={round.winNotes} placeholder="e.g. Own 3 Flamingos and get back to Start" /></label>
    <label class="check small"><input type="checkbox" bind:checked={round.winPublic} /> Show it on the board</label>
    <label class="field grow">Host notes (never shown on stream)<input bind:value={round.hostNotes} data-field="round-notes" /></label>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={view === 'spaces'} class:on={view === 'spaces'} onclick={() => (view = 'spaces')}>⬤ Spaces ({round.spaces.length})</button>
    <button role="tab" aria-selected={view === 'backdrop'} class:on={view === 'backdrop'} onclick={() => (view = 'backdrop')}>🖼 Board backdrop</button>
    <button role="tab" aria-selected={view === 'zones'} class:on={view === 'zones'} onclick={() => (view = 'zones')}>🌀 Off-board zones ({round.zones.length})</button>
  </div>


  {#if view === 'spaces'}
    <div class="row tools">
      {#if linking}
        <span class="warn small" role="status">Click the space {sel?.name} should lead to (again to unlink), or go to it with the arrow keys and press Enter…</span>
      {:else}
        <span class="hint">Ctrl+click adds a space (after the selected one) · Alt+drag or ⊕ links · Shift+click or a box selects several · right-click for more</span>
      {/if}
    </div>
    <div class="main">
      <div class="canvas-box" class:media-drop={fileOver === 'board'} bind:clientWidth={boxW} style:height="{SLIDE_H * scale}px">
        <!-- The board is an application role with roving focus: its spaces are the buttons the arrow keys go between. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          class="canvas"
          bind:this={canvas}
          style:transform="scale({scale})"
          onpointerdown={boardDown}
          oncontextmenu={boardMenu}
          onpointermove={boardMove}
          onkeydown={key}
          onfocusin={boardFocus}
          ondragover={fileDragOver}
          ondragleave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && (fileOver = null)}
          ondrop={fileDrop}
          role="application"
          aria-label="Board: arrow keys go from space to space, Enter opens its settings"
          aria-roledescription="board"
          tabindex={round.spaces.length ? -1 : 0}
        >
          <div class="backdrop"><SlideView slide={round.slide} mode="edit" fallbackBg="#1d5e3a" /></div>
          <BoardSpaces {round} selected={selIds} marked={fileOver && fileOver !== 'board' ? [fileOver] : []} ondown={spaceDown} tabStop={rover} />
          {#if sel && !wire}
            <!-- Drag from it to the space this one should lead to. -->
            <div
              class="link-handle"
              style:left="{sel.x + SPACE_R * 0.72}px"
              style:top="{sel.y - SPACE_R * 0.72}px"
              onpointerdown={(e) => startWire(e, sel)}
              role="button"
              tabindex="-1"
              aria-label="Link {sel.name} to…"
              title="Drag to the space it leads to (onto a linked one to unlink)"
            >
              ⊕
            </div>
          {/if}
          {#if wire}
            {@const from = spaceById(round, wire.from)}
            {#if from}
              <svg class="overlay" viewBox="0 0 {SLIDE_W} {SLIDE_H}" aria-hidden="true">
                <line x1={from.x} y1={from.y} x2={wire.x} y2={wire.y} class="wire" />
              </svg>
            {/if}
          {/if}
          {#if box}
            <div
              class="box"
              style:left="{Math.min(box.x0, box.x1)}px"
              style:top="{Math.min(box.y0, box.y1)}px"
              style:width="{Math.abs(box.x1 - box.x0)}px"
              style:height="{Math.abs(box.y1 - box.y0)}px"
            ></div>
          {/if}
        </div>
      </div>
      <aside class="side" bind:this={side}>
        {#if picked.length > 1}
          {@const colors = new Set(picked.map((x) => x.color))}
          {@const secret = picked.filter((x) => x.secret).length}
          <h4>{picked.length} spaces selected</h4>
          <p class="muted small">Drag one to move them all, or nudge them with Alt+arrows. Shift+click a space to add or leave it out.</p>
          <label class="check small">
            Color
            <input
              type="color"
              value={colors.size === 1 ? picked[0].color : '#888888'}
              onchange={(e) => {
                const c = e.currentTarget.value;
                setAll('Color', (x) => (x.color = c));
              }}
              aria-label="Color of the selected spaces"
            />
            {#if colors.size > 1}<span class="muted">(mixed)</span>{/if}
          </label>
          <label class="check small">
            <input
              type="checkbox"
              checked={secret === picked.length}
              indeterminate={secret > 0 && secret < picked.length}
              onchange={(e) => {
                const on = e.currentTarget.checked;
                setAll(on ? 'Secret' : 'Not secret', (x) => (x.secret = on || undefined));
              }}
            />
            Secret (viewers see “?” until you reveal them)
          </label>
          <div class="row">
            <span class="spacer"></span>
            <button class="small" onclick={() => duplicateSpaces(picked)} title="Ctrl+D">⧉ Duplicate</button>
            <button class="small" onclick={() => copySpacesToClipboard(picked)} title="Ctrl+C">📋 Copy</button>
            <button class="ghost small" onclick={() => removeSpaces(picked)}>Delete {picked.length} spaces</button>
          </div>
        {:else if sel}
          <h4>Space</h4>
          <label class="field">Name<input bind:value={sel.name} bind:this={nameField} aria-label="Space name" /></label>
          <div class="row">
            <label class="check small">Color <input type="color" bind:value={sel.color} aria-label="Space color" /></label>
            <div class="pop">
              <button class="small" onclick={() => (pickingIcon = !pickingIcon)} use:mediaDrop={{ kind: 'image', onpick: (id) => sel && (sel.icon = id) }}>
                {#if sel.icon && mediaUrls[sel.icon]}<img class="ic" src={mediaUrls[sel.icon]} alt="" />{:else}🖼{/if} Icon
              </button>
              {#if pickingIcon}
                <MediaPicker kind="image" onpick={(id) => ((sel.icon = id), (pickingIcon = false))} onclose={() => (pickingIcon = false)} />
              {/if}
            </div>
            {#if sel.icon}<button class="ghost small" onclick={() => (sel.icon = undefined)}>No icon</button>{/if}
          </div>
          <div class="row">
            <span class="muted small">Leads to:</span>
            {#each sel.next as n (n)}
              {@const other = spaceById(round, n)}
              {@const both = !!other?.next.includes(sel.id)}
              <span class="chip">
                {both ? '↔' : '→'} {other?.name ?? '?'}
                <button
                  class="ghost tiny"
                  class:on={both}
                  aria-pressed={both}
                  onclick={() => other && (other.next = both ? other.next.filter((x) => x !== sel.id) : [...other.next, sel.id])}
                  aria-label="Both ways with {other?.name}"
                  title={both ? 'Both ways: click for one way only' : 'Make it both ways (back and forth)'}>⇄</button
                >
                <button class="ghost tiny" onclick={() => other && toggleLink(sel, other)} aria-label="Unlink" title="Unlink">−</button>
              </span>
            {:else}
              <span class="muted small">nothing (the path ends)</span>
            {/each}
            <button class="small" class:on={linking} aria-pressed={!!linking} onclick={() => (linking = !linking)} title="Then click the space it leads to; two or more ways make a fork">🔗 Link to…</button>
          </div>
          {#if sel.next.length > 1}<div class="muted small">A fork: the host picks the way in play.</div>{/if}
          <h5>When passed <span class="muted small">(e.g. Start: +2 gold)</span></h5>
          <ActionListEditor bind:actions={sel.onPass} board={round} />
          <h5>When landed on</h5>
          <ActionListEditor bind:actions={sel.onLand} board={round} />
          <label class="check small"><input type="checkbox" bind:checked={sel.secret} /> Secret (viewers see “?” until you reveal it)</label>
          <label class="field">Host notes (never shown on stream)<textarea rows="2" data-field="space-notes" bind:value={sel.hostNotes}></textarea></label>
          <div class="row">
            <button class="small" onclick={() => (round.start = sel.id)} disabled={(round.start ?? round.spaces[0]?.id) === sel.id}>🏁 Make it Start</button>
            <button class="small" onclick={() => duplicateSpace(sel)} title="A copy after it on the path (Ctrl+D)">⧉ Duplicate space</button>
            <span class="spacer"></span>
            <button class="ghost small danger" onclick={() => removeSpace(sel)} title="Delete this space (Undo brings it back)">🗑 Delete space</button>
          </div>
        {:else}
          <Tips id="board-game" hint="Click a space to set it up. Ctrl+click (⌘+click) the board to add one, or right-click → Add a space here.">
            <ul>
              <li>New spaces go after the selected space, so you can draw the path in order.</li>
              <li>Drag spaces (or Alt+arrows) to move them. Drop a picture on a space for its icon, or on the board for its backdrop.</li>
              <li>
                Keys: Tab to the board, then the arrows go from space to space, Enter opens its settings, Alt+arrows move it, F2 renames,
                Ctrl+D duplicates, Ctrl+C / Ctrl+V copy and paste, Delete deletes, Esc deselects. Shift+arrows, Shift+click or a box
                picks several.
              </li>
            </ul>
          </Tips>
        {/if}
      </aside>
    </div>
  {:else if view === 'backdrop'}
    <div class="se-wrap"><SlideEditor slide={round.slide} placeholder="Click to type" fill /></div>
  {:else}
    <div class="zones">
      <div class="row">
        <p class="muted small grow">
          Places off the board (the Shadow Realm) where players get sent until they escape. Send players there from a space's buttons or the host
          panel. Drag ⋮⋮ (or Alt+↑/↓) to reorder: the host's Send to list follows. Right-click a zone for more.
        </p>
        </div>
      <div class="zone-list" role="list" aria-label="Zones">
        {#each round.zones as z, i (z.id)}
          {@const line = zoneRows.lineAt(z.id)}
          <div
            class="row zone drag-row"
            class:drop-before={line === 'before'}
            class:drop-after={line === 'after'}
            class:dragging={zoneRows.dragging === z.id}
            data-place="zone:{z.id}"
            role="listitem"
            ondragover={(e) => zoneRows.over(e, z.id)}
            ondrop={(e) => {
              const m = zoneRows.drop(e, round.zones.map((x) => x.id));
              if (m) moveZone(m.from, m.to);
            }}
            oncontextmenu={(e) => zoneMenu(e, z, i)}
            use:rowKeys={{ move: (d) => moveZone(i, i + d), duplicate: () => duplicateZone(z) }}
          >
            <span
              class="drag-grip"
              draggable="true"
              ondragstart={(e) => zoneRows.start(e, z.id, (e.currentTarget as HTMLElement).parentElement)}
              ondragend={() => zoneRows.end()}
              aria-hidden="true"
              title="Drag to reorder (or Alt+↑/↓)">⋮⋮</span
            >
            <input bind:value={z.name} aria-label="Zone name" />
            <input class="grow" bind:value={z.hostNotes} placeholder="Host notes (how to escape…)" aria-label="{z.name} notes" />
            <button class="small" onclick={() => (zoneSlide = z.id)}>Edit its screen…</button>
            <button class="ghost small" onclick={() => duplicateZone(z)} aria-label="Duplicate zone {z.name}" title="Duplicate, with its screen (Ctrl+D)">⧉</button>
            <button class="ghost small" onclick={() => removeZone(z)} aria-label="Delete zone {z.name}" title="Delete zone">🗑</button>
          </div>
        {/each}
      </div>
      <div class="row"><button onclick={addZone}>＋ Add zone</button></div>
    </div>
  {/if}
</div>
{#if tool}<ToolPopup kind={tool.kind} id={tool.id} onclose={() => (tool = null)} />{/if}
{#if zone}
  <SlideModal slide={zone.slide} title={zone.name} onclose={() => (zoneSlide = null)} />
{/if}

<style>
  .bge {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .settings .field {
    min-width: 120px;
  }
  .grow {
    flex: 1;
  }
  .n {
    width: 80px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  .tabs button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.2);
  }
  .main {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-height: 0;
  }
  .canvas-box {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .canvas {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 1080px;
    transform-origin: 0 0;
    cursor: crosshair;
    /* (Shift+click picks spaces: it mustn't select their names' text, which would then drag as text.) */
    user-select: none;
  }
  .canvas:focus-visible {
    outline: 6px solid var(--accent);
    outline-offset: -6px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
  }
  /* (Board px: the canvas is scaled.) */
  .link-handle {
    position: absolute;
    width: 56px;
    height: 56px;
    margin: -28px 0 0 -28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #ffcc00;
    color: #000;
    border: 4px solid #000;
    font-size: 38px;
    line-height: 1;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .wire {
    stroke: #ffcc00;
    stroke-width: 8;
    stroke-dasharray: 20 12;
  }
  .box {
    position: absolute;
    border: 4px dashed #ffcc00;
    background: rgba(255, 204, 0, 0.12);
    pointer-events: none;
  }
  .side {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 70vh;
    overflow: auto;
  }
  h4,
  h5 {
    margin: 4px 0 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
  }
  .ic {
    width: 18px;
    height: 18px;
    object-fit: contain;
    vertical-align: middle;
  }
  .pop {
    position: relative;
  }
  .se-wrap {
    flex: 1;
    min-height: 480px;
    display: flex;
    flex-direction: column;
  }
  .zones,
  .zone-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
