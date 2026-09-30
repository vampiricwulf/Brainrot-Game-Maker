import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arriving,
  begin,
  clear,
  commit,
  history,
  jumpTo,
  listen,
  mark,
  MAX_STEPS,
  nameStep,
  onApplied,
  onNotify,
  redo,
  startHistory,
  step,
  stepAsync,
  undo,
} from './history.svelte';
import { watchGame, type GameWatch } from './watch.svelte';
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
  it(`keeps the last ${MAX_STEPS} steps`, () => {
    for (let i = 0; i <= MAX_STEPS + 2; i++) step(null, () => (g.title = `T${i}`));
    expect(history.entries).toHaveLength(MAX_STEPS);
    expect(history.trimmed).toBe(3);
    expect(history.origin.label).toBe("Older steps weren't kept");
    expect(history.entries[0].label).toBe('Renamed the game “T3”');
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
