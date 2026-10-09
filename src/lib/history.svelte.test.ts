import { prefs } from './prefs.svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arriving,
  attachBlobSwap,
  begin,
  clear,
  commit,
  heldMedia,
  history,
  joinTyping,
  jumpTo,
  listen,
  mark,
  maxSteps,
  keepLimits,
  nameStep,
  onApplied,
  onNotify,
  redo,
  savedSinceChange,
  savePoint,
  startHistory,
  step,
  stepAsync,
  toSave,
  undo,
  wholeHistory,
} from './history.svelte';
import { watchGame, type GameWatch } from './watch.svelte';
import { getBlob, registerBlob, stashMedia } from './media.svelte';
import type { BoardRound, Game, TextEl } from './model';
import { jeopardyGame } from './testgame';
import { newRpgRound, newScreen } from './rpg';

function sample(): Game {
  const g = jeopardyGame();
  g.title = 'Brainrot Night';
  g.rounds.push(newRpgRound(g));
  g.worlds![0].maps[0].screens.push(newScreen(1, 0, 'Town'), newScreen(2, 0, 'Cave'));
  return g;
}

/** The game as the editor has it ($state). */
function live(game: Game): Game {
  const s = $state(game);
  return s;
}

const board = (g: Game) => g.rounds[0] as BoardRound;
const question = (g: Game, cat = 0, row = 0) => board(g).categories[cat].clues[row].questionSlide.elements[0] as TextEl;
/** Let the watcher tell the history (it does so a moment after each change). */
const seen = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

/** Stands in for the window: listeners by type, fired by hand. */
function fakeWindow() {
  const fns = new Map<string, (e: Event) => void>();
  return {
    addEventListener: (type: string, fn: (e: Event) => void) => fns.set(type, fn),
    removeEventListener: (type: string) => fns.delete(type),
    fire: (type: string, target: unknown = null) => fns.get(type)?.({ type, target } as unknown as Event),
  };
}
const field = (name: string) => ({ tagName: 'INPUT', type: 'text', name }) as unknown as Element;
const doc = { activeElement: null as Element | null };
/** Focus moves to `el` (as the browser would say it). */
function focus(win: ReturnType<typeof fakeWindow>, el: Element | null): void {
  doc.activeElement = el;
  win.fire('focusin', el);
}

let g: Game;
let w: GameWatch;
let win: ReturnType<typeof fakeWindow>;
let unlisten = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { document?: unknown }).document = doc;
  doc.activeElement = null;
  g = live(sample());
  w = watchGame(g);
  arriving({ kind: 'opened', label: 'Opened “Brainrot Night”' });
  startHistory(g, w);
  win = fakeWindow();
  unlisten = listen(win);
});
afterEach(() => {
  unlisten();
  w.destroy();
  vi.useRealTimers();
  delete (globalThis as { document?: unknown }).document;
});

describe('undo history: steps', () => {
  it('starts from where the game came from, with nothing to undo', () => {
    expect(history.origin).toMatchObject({ kind: 'opened', label: 'Opened “Brainrot Night”' });
    expect(history.entries).toEqual([]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('makes a step after a pause', async () => {
    g.title = 'Brainrot Night 2';
    await seen();
    expect(history.pending).toBe(true);
    expect(history.undoLabel).toBe('your latest changes');
    vi.advanceTimersByTime(699);
    expect(history.entries).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(history.pending).toBe(false);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ label: 'Renamed the game “Brainrot Night 2”', where: 'Game title', place: { tab: 'title' } });
    expect(history.undoLabel).toBe('Renamed the game “Brainrot Night 2”');
  });

  it('keeps a held pointer (a drag, a slider) one step, with the click after it', async () => {
    const el = question(g);
    win.fire('pointerdown');
    for (let i = 1; i <= 5; i++) {
      el.x += 10;
      await seen();
      vi.advanceTimersByTime(1000);
    }
    expect(history.entries).toHaveLength(0);
    win.fire('pointerup');
    el.y += 10;
    await seen();
    vi.advanceTimersByTime(1000);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].ops).toHaveLength(2);
    expect(history.entries[0].label).toBe('Moved text box “Empty text”');
  });

  it('starts a new step on every press', async () => {
    g.title = 'A';
    await seen();
    win.fire('pointerdown');
    expect(history.entries).toHaveLength(1);
    win.fire('pointerup');
    g.rounds[0].name = 'B';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries.map((e) => e.label)).toEqual(['Renamed the game “A”', 'Renamed round “B”']);
  });

  it('starts a new step on a key in another field, and when focus moves on', async () => {
    const [a, b] = [field('a'), field('b')];
    focus(win, a);
    g.title = 'Typed in a';
    await seen();
    win.fire('keydown', a);
    expect(history.entries).toHaveLength(0);
    win.fire('keydown', b);
    expect(history.entries).toHaveLength(1);
    focus(win, b);
    g.rounds[0].name = 'Typed in b';
    await seen();
    focus(win, a);
    vi.advanceTimersByTime(250);
    expect(history.entries).toHaveLength(2);
  });

  it('starts a new step when another field changes (a colour picker, no key or click seen), not while one goes on', async () => {
    const [a, b] = [field('a'), field('b')];
    win.fire('input', a);
    g.title = 'Colour 1';
    await seen();
    win.fire('input', a);
    g.title = 'Colour 2';
    await seen();
    expect(history.entries).toHaveLength(0);
    win.fire('input', b);
    expect(history.entries).toHaveLength(1);
    g.rounds[0].name = 'Other';
    await seen();
    vi.advanceTimersByTime(1000);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].label).not.toMatch(/changes/);
  });

  it('joins typing in one field across pauses, and drops it when the text is back', async () => {
    const box = field('question');
    focus(win, box);
    const el = question(g);
    el.text = 'Who is';
    await seen();
    vi.advanceTimersByTime(700);
    el.text = 'Who is Pepe?';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].label).toBe('Edited question “Who is Pepe?”');
    expect(history.entries[0].ops).toEqual([expect.objectContaining({ b: '', a: 'Who is Pepe?' })]);
    // The field's own undo takes it all back: no step left.
    el.text = '';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(0);
  });

  it('joins a player added (Enter in a name) and then named in their new box: one step, with the name typed', async () => {
    const first = field('p1');
    focus(win, first);
    g.players = [{ id: 'p1', name: 'Player 1', color: '#e6194b' }];
    await seen();
    vi.advanceTimersByTime(700);
    g.players[0].name = 'Bo';
    await seen();
    // Enter: the name typed so far is its own step, then the next player is added and their box takes the focus.
    commit();
    g.players.push({ id: 'p2', name: 'Player 2', color: '#3cb44b' });
    await seen();
    const second = field('p2');
    focus(win, second);
    joinTyping(second);
    vi.advanceTimersByTime(300);
    g.players[1].name = 'C';
    await seen();
    vi.advanceTimersByTime(200);
    g.players[1].name = 'Cy';
    await seen();
    vi.advanceTimersByTime(700);
    // (Bo, named in the box they were added with, is one step too.)
    expect(history.entries.map((e) => e.label)).toEqual(['Added player “Bo”', 'Added player “Cy”']);
    // One undo takes the added player away, and Bo stays.
    undo();
    expect(g.players.map((p) => p.name)).toEqual(['Bo']);
  });

  it("doesn't join typing after focus left the field, after an undo, or a minute later", async () => {
    const box = field('title');
    focus(win, box);
    g.title = 'A';
    await seen();
    vi.advanceTimersByTime(3000);
    focus(win, null);
    focus(win, box);
    g.title = 'AB';
    await seen();
    vi.advanceTimersByTime(2000);
    expect(history.entries).toHaveLength(2);

    undo();
    g.title = 'AC';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries.map((e) => e.label)).toEqual(['Renamed the game “A”', 'Renamed the game “AC”']);

    g.title = 'ACD';
    await seen();
    vi.advanceTimersByTime(61_000);
    g.title = 'ACDE';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(3);
  });

  it("doesn't count a checkbox filling in an unset option as false", async () => {
    board(g).categories[0].clues[0].empty = false;
    await seen();
    // Not even a change going on (an undo's note would close at once when the clue it opened fills it in).
    expect(history.pending).toBe(false);
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(0);
    board(g).categories[0].clues[1].empty = false;
    question(g, 0, 1).text = 'Typed';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].ops).toEqual([expect.objectContaining({ k: 'text' })]);
  });

  it('joins quick changes to the same values (nudges), not slower ones', async () => {
    const el = question(g);
    for (let i = 0; i < 3; i++) {
      win.fire('keydown', null);
      el.x += 1;
      await seen();
      vi.advanceTimersByTime(700);
    }
    expect(history.entries).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    el.x += 1;
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(2);
  });
});

describe('undo history: named steps', () => {
  it('makes step() one named step that never joins another', async () => {
    const screens = g.worlds![0].maps[0].screens;
    const cave = screens[2];
    step(`Deleted screen “${cave.name}”`, () => {
      g.worlds![0].maps[0].screens = screens.filter((s) => s !== cave);
    });
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ label: 'Deleted screen “Cave”', explicit: true, sealed: true, icon: '🗺' });
    expect(history.entries[0].undoPlace).toMatchObject({ tab: 'world', screen: cave.id });
    // Its label from the ops when there's none.
    step(null, () => (g.worlds![0].maps[0].screens[1].col = 3));
    expect(history.entries[1].label).toBe('Moved screen “Town” to D1');
    step(null, () => (g.worlds![0].maps[0].screens[1].col = 4));
    expect(history.entries).toHaveLength(3);
  });

  it('makes what was pending its own step first', async () => {
    g.title = 'Typed';
    await seen();
    step('Renamed a round', () => (g.rounds[0].name = 'X'));
    expect(history.entries.map((e) => e.label)).toEqual(['Renamed the game “Typed”', 'Renamed a round']);
  });

  it('keeps nested groups and async steps one step', async () => {
    const end = begin('Pasted two screens');
    const inner = begin('Inner name loses');
    g.worlds![0].maps[0].screens.push(newScreen(0, 1, 'P1'));
    inner();
    inner();
    await seen();
    vi.advanceTimersByTime(5000);
    commit();
    expect(history.entries).toHaveLength(0);
    g.worlds![0].maps[0].screens.push(newScreen(0, 2, 'P2'));
    end();
    expect(history.entries.map((e) => e.label)).toEqual(['Pasted two screens']);

    const done = stepAsync(null, async () => {
      g.rounds[0].name = 'Waited';
      await Promise.resolve();
      g.rounds[0].name = 'Waited for';
    });
    await done;
    expect(history.entries.map((e) => e.label)).toEqual(['Pasted two screens', 'Renamed round “Waited for”']);
  });

  it('names the next step with nameStep()', async () => {
    g.theme.preset = 'neon';
    nameStep('Theme preset: Neon', { notify: true });
    const told = vi.fn();
    const off = onNotify(told);
    await seen();
    vi.advanceTimersByTime(700);
    off();
    expect(history.entries[0]).toMatchObject({ label: 'Theme preset: Neon', explicit: true });
    expect(told).toHaveBeenCalledWith(history.entries[0]);
  });
});

describe('undo history: undo, redo, jump', () => {
  async function three(): Promise<void> {
    for (const t of ['One', 'Two', 'Three']) {
      step(null, () => (g.title = t));
    }
  }

  it('undoes and redoes in place, telling who asks', async () => {
    const applied = vi.fn();
    const off = onApplied(applied);
    const round = g.rounds[1];
    await three();
    expect(undo('key')?.label).toBe('Renamed the game “Three”');
    expect(g.title).toBe('Two');
    expect(applied).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Renamed the game “Three”' }), -1, 'key');
    expect(history.redoLabel).toBe('Renamed the game “Three”');
    undo();
    expect(g.title).toBe('One');
    expect(redo('button')?.label).toBe('Renamed the game “Two”');
    expect(g.title).toBe('Two');
    expect(applied).toHaveBeenLastCalledWith(expect.anything(), 1, 'button');
    expect(g.rounds[1]).toBe(round);
    off();
    // Its own changes to the game aren't a step.
    await seen();
    vi.advanceTimersByTime(1000);
    expect(history.pending).toBe(false);
    expect(history.entries).toHaveLength(3);
    expect(history.index).toBe(2);
  });

  it('undoes what was pending first, and nothing past the start', async () => {
    await three();
    g.title = 'Four';
    await seen();
    expect(undo()?.label).toBe('Renamed the game “Four”');
    expect(g.title).toBe('Three');
    undo();
    undo();
    undo();
    expect(g.title).toBe('Brainrot Night');
    expect(undo()).toBeNull();
    expect(history.canUndo).toBe(false);
  });

  it('drops what was undone once something new is done', async () => {
    await three();
    undo();
    undo();
    expect(history.canRedo).toBe(true);
    step(null, () => (g.rounds[0].name = 'New'));
    expect(history.canRedo).toBe(false);
    expect(history.entries.map((e) => e.label)).toEqual(['Renamed the game “One”', 'Renamed round “New”']);
  });

  it('ignores undo while a pointer is held', async () => {
    await three();
    win.fire('pointerdown');
    expect(undo()).toBeNull();
    win.fire('pointerup');
    expect(undo()).not.toBeNull();
  });

  it('jumps back and forward several steps at once', async () => {
    await three();
    const applied = vi.fn();
    const off = onApplied(applied);
    expect(jumpTo(0)).toBe(-3);
    expect(g.title).toBe('Brainrot Night');
    expect(applied).toHaveBeenCalledTimes(1);
    expect(applied).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Renamed the game “One”' }), -1, 'list');
    expect(jumpTo(2)).toBe(2);
    expect(g.title).toBe('Two');
    expect(jumpTo(99)).toBe(1);
    expect(g.title).toBe('Three');
    off();
  });

  it('starts again when a step can no longer be undone', async () => {
    await three();
    (history.entries[2].ops[0] as { p: unknown[] }).p = ['gone'];
    expect(undo()).toBeNull();
    expect(history.entries).toEqual([]);
    expect(history.origin.label).toBe("History restarted: a step couldn't be undone");
    expect(g.title).toBe('Three');
  });
});

describe('undo history: limits and marks', () => {
  it(`keeps the last ${maxSteps()} steps`, () => {
    for (let i = 0; i <= maxSteps() + 2; i++) step(null, () => (g.title = `T${i}`));
    expect(history.entries).toHaveLength(maxSteps());
    expect(history.trimmed).toBe(3);
    expect(history.origin.label).toBe("Older steps weren't kept");
    expect(history.entries[0].label).toBe('Renamed the game “T3”');
  });

  it('forgets older steps at once when the setting goes down, but never a redo', () => {
    const before = prefs.undoSteps;
    try {
      for (let i = 0; i < 30; i++) step(null, () => (g.title = `T${i}`));
      undo();
      undo();
      prefs.undoSteps = 20;
      keepLimits();
      expect(history.entries).toHaveLength(20);
      expect(history.index).toBe(18);
      expect(history.entries[0].label).toBe('Renamed the game “T10”');
      expect(redo()?.label).toBe('Renamed the game “T28”');
    } finally {
      prefs.undoSteps = before;
    }
  });

  it('keeps within its memory budget, but always the newest 20', () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    for (let i = 0; i < 25; i++) step(null, () => (question(g).text = big + i));
    expect(history.entries).toHaveLength(20);
    expect(history.trimmed).toBe(5);
  });

  it('marks where the game was saved or played, and seals the step before', async () => {
    const box = field('title');
    focus(win, box);
    g.title = 'A';
    await seen();
    vi.advanceTimersByTime(700);
    mark('saved', 'Saved “A.brainrot”');
    g.title = 'AB';
    await seen();
    vi.advanceTimersByTime(700);
    expect(history.entries).toHaveLength(2);
    expect(history.marks).toEqual([expect.objectContaining({ kind: 'saved', at: 1 })]);
    // A new step after going back past a mark drops the mark.
    undo();
    undo();
    step(null, () => (g.title = 'Other'));
    expect(history.marks).toEqual([]);
  });

  it('marks a save where the game was when it started: changes made while it was written stay unsaved', async () => {
    const box = field('title');
    focus(win, box);
    g.title = 'A';
    await seen();
    // Typing not yet a step when Save starts becomes one, and the save point is after it.
    const point = savePoint();
    expect(history.entries).toHaveLength(1);
    // Typed on while the file is written: a step of its own (not joined to the saved one).
    g.title = 'AB';
    await seen();
    vi.advanceTimersByTime(700);
    mark('saved', 'Saved “A.brainrot”', point);
    expect(history.entries).toHaveLength(2);
    expect(history.marks).toEqual([expect.objectContaining({ kind: 'saved', at: 1 })]);
    expect(savedSinceChange()).toBe(false);
    // Back to what was saved: saved.
    undo();
    expect(savedSinceChange()).toBe(true);
  });

  it('a save whose step was undone and replaced while it was written leaves no mark', () => {
    step(null, () => (g.title = 'A'));
    const point = savePoint();
    undo();
    step(null, () => (g.title = 'B'));
    mark('saved', 'Saved', point);
    expect(history.marks).toEqual([]);
    expect(savedSinceChange()).toBe(false);
  });

  it('forgets everything on clear() and on a new game', () => {
    step(null, () => (g.title = 'X'));
    clear();
    expect(history.entries).toEqual([]);
    expect(history.origin.kind).toBe('cleared');
    step(null, () => (g.title = 'Y'));
    const other = live(sample());
    const w2 = watchGame(other);
    arriving({ kind: 'new', label: 'New game' });
    startHistory(other, w2);
    expect(history.entries).toEqual([]);
    expect(history.origin).toMatchObject({ kind: 'new', label: 'New game' });
    // The old game isn't watched any more.
    g.title = 'Old game';
    commit();
    expect(history.entries).toEqual([]);
    w2.destroy();
  });

  it('shows the latest changes as what Undo takes back', async () => {
    step(null, () => (board(g).categories[0].title = 'Memes'));
    expect(history.undoLabel).toBe('Renamed category “Memes”');
    question(g, 0, 1).text = 'Who?';
    await seen();
    expect(history.undoLabel).toBe('your latest changes');
    expect(history.canRedo).toBe(false);
  });
});

describe('undo history: files', () => {
  const file = (id: string) => ({ id, name: `${id}.png`, mime: 'image/png', size: 3, kind: 'image' as const });

  it('holds the files its steps can bring back, both ways, until the steps go', () => {
    step(null, () => g.media.push(file('a')));
    step(null, () => g.media.push(file('b')));
    step('Removed file “a.png”', () => (g.media = g.media.filter((m) => m.id !== 'a')));
    expect(history.entries.map((e) => e.media)).toEqual([['a'], ['b'], ['a']]);
    expect(heldMedia()).toEqual(new Set(['a', 'b']));
    // Undone steps (redo brings the file back) still hold theirs, until something new drops them.
    undo();
    undo();
    expect(heldMedia()).toEqual(new Set(['a', 'b']));
    step(null, () => (g.title = 'New'));
    expect(heldMedia()).toEqual(new Set(['a']));
    clear();
    expect(heldMedia()).toEqual(new Set());
  });

  it('swaps a replaced file’s bytes back on undo, and forward on redo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = new Blob(['old']);
    const fresh = new Blob(['new']);
    step(null, () => g.media.push(file('pic')));
    registerBlob('pic', old);
    const end = begin('Replaced file “pic.png” with “pic2.png”');
    const before = await stashMedia('pic');
    registerBlob('pic', fresh);
    g.media[0].name = 'pic2.png';
    attachBlobSwap({ id: 'pic', before, after: await stashMedia('pic') });
    end();
    const e = history.entries[1];
    expect(e.label).toBe('Replaced file “pic.png” with “pic2.png”');
    expect(e.blobs).toHaveLength(1);
    expect(heldMedia().has(before!)).toBe(true);
    undo();
    expect(getBlob('pic')).toBe(old);
    expect(g.media[0].name).toBe('pic.png');
    redo();
    expect(getBlob('pic')).toBe(fresh);
    // Bytes alone (same name and size) still make a step.
    const end2 = begin('Replaced file “pic2.png” with “pic2.png”');
    const again = await stashMedia('pic');
    registerBlob('pic', new Blob(['new']));
    attachBlobSwap({ id: 'pic', before: again, after: await stashMedia('pic') });
    end2();
    expect(history.entries[2]).toMatchObject({ ops: [], place: { tab: 'media', media: 'pic' } });
    undo();
    expect(getBlob('pic')).toBe(fresh);
  });
});

describe('undo history: saved with the draft', () => {
  it('stores each step once, again when typing goes on in it, and deletes the ones gone', async () => {
    toSave('r0');
    const box = field('title');
    focus(win, box);
    g.title = 'A';
    await seen();
    vi.advanceTimersByTime(700);
    step(null, () => (g.rounds[0].name = 'R'));
    let s = toSave('r1');
    expect(s.steps.map((e) => e.label)).toEqual(['Renamed the game “A”', 'Renamed round “R”']);
    expect(s.history).toMatchObject({ v: 1, gameId: g.id, rev: 'r1', index: 2, ids: history.entries.map((e) => e.id) });
    // Nothing on this page (the field typed in) is stored.
    expect(s.steps.every((e) => !('target' in e))).toBe(true);
    expect(toSave('r2').steps).toEqual([]);
    undo();
    step(null, () => (g.rounds[0].name = 'Q'));
    s = toSave('r3');
    expect(s.steps.map((e) => e.label)).toEqual(['Renamed round “Q”']);
    expect(s.dropped).toHaveLength(1);
    clear();
    expect(toSave('r4').dropped).toHaveLength(2);
  });

  it('writes the steps of a failed write with the next one', () => {
    toSave('r0');
    step(null, () => (g.title = 'One'));
    const s = toSave('r1');
    expect(s.steps).toHaveLength(1);
    // Storage was full: the step waits for the next write, with the one made since.
    s.failed();
    step(null, () => (g.title = 'Two'));
    expect(toSave('r2').steps.map((e) => e.label)).toEqual(['Renamed the game “One”', 'Renamed the game “Two”']);
  });

  it('says whether the game was saved to a file since its last change', () => {
    expect(savedSinceChange()).toBe(true);
    step(null, () => (g.title = 'One'));
    expect(savedSinceChange()).toBe(false);
    mark('exported', 'Exported JSON');
    expect(savedSinceChange()).toBe(false);
    mark('saved', 'Saved');
    expect(savedSinceChange()).toBe(true);
    step(null, () => (g.title = 'Two'));
    expect(savedSinceChange()).toBe(false);
  });

  it("doesn't count clearing the history as saving the game", () => {
    step(null, () => (g.title = 'One'));
    clear();
    expect(savedSinceChange()).toBe(false);
    // Saved just before: still saved, and a change after that isn't.
    step(null, () => (g.title = 'Two'));
    mark('saved', 'Saved');
    clear();
    expect(history.marks).toEqual([expect.objectContaining({ kind: 'saved', at: 0 })]);
    expect(savedSinceChange()).toBe(true);
    step(null, () => (g.title = 'Three'));
    expect(savedSinceChange()).toBe(false);
  });

  it('keeps the whole history for a recent game, and writes its steps when it comes back', () => {
    step(null, () => (g.title = 'One'));
    step(null, () => (g.title = 'Two'));
    toSave('r0');
    const kept = wholeHistory();
    expect(kept.steps.map((e) => e.label)).toEqual(['Renamed the game “One”', 'Renamed the game “Two”']);
    const again = live(JSON.parse(JSON.stringify($state.snapshot(g))));
    const w2 = watchGame(again);
    arriving({ kind: 'reopened', label: 'Reopened “Two”' }, kept, true);
    startHistory(again, w2);
    const s = toSave('r1');
    expect(s.steps).toHaveLength(2);
    expect(s.dropped).toEqual([]);
    undo();
    expect(again.title).toBe('One');
    w2.destroy();
  });

  it('goes on with a saved history when the game arrives with it', () => {
    step(null, () => (g.title = 'One'));
    step(null, () => (g.title = 'Two'));
    mark('saved', 'Saved');
    undo();
    const { history: saved } = toSave('rev');
    const steps = history.entries.map(({ target: _t, focusSession: _f, ...e }) => ({ ...e, sealed: false }));
    // After a reload: the same game, from the draft written with that history.
    const again = live(JSON.parse(JSON.stringify($state.snapshot(g))));
    const w2 = watchGame(again);
    arriving({ kind: 'reopened', label: 'Reopened “One”' }, { saved, steps });
    startHistory(again, w2);
    expect(history.entries.map((e) => e.label)).toEqual(['Renamed the game “One”', 'Renamed the game “Two”']);
    expect(history.entries.every((e) => e.sealed)).toBe(true);
    expect(history.index).toBe(1);
    expect(history.origin).toMatchObject({ kind: 'opened' });
    expect(history.marks).toHaveLength(1);
    redo();
    expect(again.title).toBe('Two');
    undo();
    undo();
    expect(again.title).toBe('Brainrot Night');
    w2.destroy();
  });
});
