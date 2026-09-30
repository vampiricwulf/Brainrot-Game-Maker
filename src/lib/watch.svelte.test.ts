import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { watchGame, type GameWatch } from './watch.svelte';
import { applyOps, diff } from './historyops';
import { newTextEl, type BoardRound, type Game, type TextEl } from './model';
import { jeopardyGame } from './testgame';
import { newRpgRound, newScreen, newWorldMap } from './rpg';
import { newBoardGameRound } from './boardgame';
import { newWheel } from './tools';

/** A board, a Final, an RPG world with three screens, a board game, a wheel and a file. */
function sample(): Game {
  const g = jeopardyGame();
  g.rounds.push(newRpgRound(g), newBoardGameRound());
  g.worlds![0].maps[0].screens.push(newScreen(1, 0, 'Town'), newScreen(2, 0, 'Cave'));
  g.worlds![0].maps[0].screens[1].slide.elements.push(newTextEl('Welcome'));
  g.wheels.push(newWheel('Punishments'));
  g.media.push({ id: 'm1', name: 'a.png', mime: 'image/png', size: 10, kind: 'image' });
  return g;
}

const board = (g: Game) => g.rounds[0] as BoardRound;
const question = (g: Game, cat = 0, row = 0) => board(g).categories[cat].clues[row].questionSlide.elements[0] as TextEl;
const tick = () => new Promise((r) => setTimeout(r, 0));

let watches: GameWatch[] = [];
function watched(): { g: Game; w: GameWatch; same: () => void } {
  const g = $state(sample());
  const w = watchGame(g);
  watches.push(w);
  return { g, w, same: () => expect(JSON.stringify(w.value())).toBe(JSON.stringify($state.snapshot(g))) };
}
afterEach(() => {
  for (const w of watches) w.destroy();
  watches = [];
  vi.restoreAllMocks();
});

describe('game watcher', () => {
  it('copies the game as plain JSON', () => {
    const { w, same } = watched();
    same();
    expect(() => structuredClone(w.value())).not.toThrow();
    expect(w.value()).toBe(w.value());
  });

  it('sees changes in every kind of chunk', () => {
    const { g, same } = watched();
    const edits: ((g: Game) => void)[] = [
      (g) => (g.title += '!'),
      (g) => (g.settings.maxPlayers = 3),
      (g) => (g.rounds[0].name = 'Memes round'),
      (g) => (board(g).values[1] = 500),
      (g) => (board(g).categories[2].title = 'Memes'),
      (g) => (question(g, 1, 2).text = 'Who is Pepe?'),
      (g) => (board(g).decor = [{ ...newTextEl(), kind: 'image', media: 'm1', fit: 'contain' } as never]),
      (g) => ((g.rounds[1] as { questionSlide: { elements: TextEl[] } }).questionSlide.elements[0].text = 'Final?'),
      (g) => (g.worlds![0].name = 'Adventure land'),
      (g) => (g.worlds![0].maps[0].name = 'Overworld 2'),
      (g) => (g.worlds![0].maps[0].screens[1].name = 'Old town'),
      (g) => ((g.worlds![0].maps[0].screens[1].slide.elements[0] as TextEl).text = 'Welcome to town'),
      (g) => (g.media[0].name = 'b.png'),
      (g) => (g.theme.tile = '#ff0000'),
      (g) => (g.wheels[0].segments[0].label = 'Sing'),
      (g) => ((g.rounds[3] as { spaces: { name: string }[] }).spaces[2].name = 'Lava'),
      (g) => (g.tiebreaker = { questionSlide: { background: {}, elements: [] }, answerSlide: { background: {}, elements: [] } }),
      (g) => g.tiebreaker!.questionSlide.elements.push(newTextEl('Tie?')),
      (g) => delete g.tiebreaker,
      (g) => g.players.push({ id: 'p1', name: 'Alex', color: '#fff' }),
      (g) => (g.statFields = [{ id: 'hp', name: 'HP', type: 'number', audience: 'hud' }]),
    ];
    for (const edit of edits) {
      edit(g);
      same();
    }
  });

  it('follows rounds, categories and screens added, removed and moved', () => {
    const { g, same } = watched();
    board(g).categories.splice(1, 1);
    same();
    const [r] = g.rounds.splice(0, 1);
    g.rounds.push(r);
    same();
    const screens = g.worlds![0].maps[0].screens;
    screens.push(newScreen(3, 0, 'Castle'));
    same();
    screens.splice(0, 0, ...screens.splice(2, 1));
    same();
    (screens[3].slide.elements as TextEl[]).push(newTextEl('A new castle'));
    same();
    g.worlds![0].maps.push(newWorldMap('Dungeon', 3, 3, false));
    g.worlds![0].maps[1].screens.push(newScreen(1, 1, 'Pit'));
    same();
    g.worlds![0].maps[1].screens[1].name = 'Deep pit';
    same();
  });

  it('follows elements replaced by new objects and lists reassigned', () => {
    const { g, same } = watched();
    g.rounds[0] = { ...$state.snapshot(g.rounds[0]), name: 'Copy' };
    same();
    board(g).categories[0].title = 'Changed in the new object';
    same();
    g.media = g.media.filter(() => false);
    same();
    g.rounds = [...g.rounds].reverse();
    same();
    g.worlds![0].maps[0].screens = g.worlds![0].maps[0].screens.map((s) => ({ ...$state.snapshot(s), name: s.name + '!' }));
    same();
    g.worlds![0].maps[0].screens[0].col = 3;
    same();
  });

  it('copies lists with missing or repeated ids as fields, and splits them again once fixed', () => {
    const { g, same } = watched();
    const cats = board(g).categories;
    cats.push({ title: 'No id', clues: [] } as never);
    same();
    (cats[cats.length - 1] as { title: string }).title = 'Still no id';
    same();
    (cats[cats.length - 1] as { id: string }).id = 'fixed';
    same();
    cats[cats.length - 1].title = 'Fixed';
    same();
    cats.push({ ...$state.snapshot(cats[0]) });
    same();
    cats[0].title = 'One of two';
    same();
    cats.pop();
    cats[0].title = 'Only one';
    same();
  });

  it('keeps the identity of everything a change did not touch', () => {
    const { g, w } = watched();
    const v1 = w.value();
    question(g, 1).text += ' more';
    const v2 = w.value();
    expect(v2).not.toBe(v1);
    const [b1, b2] = [v1.rounds[0] as BoardRound, v2.rounds[0] as BoardRound];
    expect(b2.categories[0]).toBe(b1.categories[0]);
    expect(b2.categories[1]).not.toBe(b1.categories[1]);
    expect(v2.rounds[1]).toBe(v1.rounds[1]);
    expect(v2.worlds).toBe(v1.worlds);
    expect(v2.media).toBe(v1.media);
    expect(v2.theme).toBe(v1.theme);
    // One op to say what changed.
    expect(diff(v1, v2)).toEqual([expect.objectContaining({ t: 'set', k: 'text' })]);
  });

  it('reads only the chunk that changed', () => {
    const { g, w } = watched();
    const game = JSON.stringify($state.snapshot(g)).length;
    const category = JSON.stringify($state.snapshot(board(g).categories[1])).length;
    w.value();
    const spy = vi.spyOn(JSON, 'stringify');
    question(g, 1).text += 'x';
    w.sync();
    // One read, of that category (a seventh of this small game).
    expect(spy.mock.results.map((r) => r.value.length)).toEqual([category + 1]);
    expect(category).toBeLessThan(game / 5);
  });

  it('sees a chunk added right after its parent ran again', () => {
    const { g, w, same } = watched();
    for (let i = 0; i < 3; i++) {
      g.title += 'z';
      flushSync();
    }
    w.value();
    g.worlds![0].maps[0].screens.push({ ...$state.snapshot(g.worlds![0].maps[0].screens[0]), id: 'new-screen', col: 3 });
    flushSync();
    same();
    g.worlds![0].maps[0].screens[3].name = 'Typed in the new screen';
    same();
  });

  it('tells subscribers once per burst, outside effects, and counts changes', async () => {
    const { g, w } = watched();
    await tick();
    const calls: boolean[] = [];
    w.subscribe(() => calls.push($effect.tracking()));
    const rev = w.rev;
    g.title = 'A';
    g.rounds[0].name = 'B';
    question(g).text = 'C';
    await tick();
    expect(calls).toEqual([false]);
    expect(w.rev).toBeGreaterThan(rev);
    // Nothing changed: nobody is told.
    g.title = 'A';
    await tick();
    expect(calls).toHaveLength(1);
  });

  it('stops when destroyed', async () => {
    const { g, w } = watched();
    const fn = vi.fn();
    w.subscribe(fn);
    await tick();
    fn.mockClear();
    const rev = w.rev;
    w.destroy();
    g.title = 'After';
    question(g).text = 'After';
    await tick();
    expect(fn).not.toHaveBeenCalled();
    expect(w.rev).toBe(rev);
  });

  it('refuses to be read inside an effect', () => {
    const { w } = watched();
    let error: unknown;
    const stop = $effect.root(() => {
      $effect(() => {
        try {
          w.value();
        } catch (e) {
          error = e;
        }
      });
    });
    flushSync();
    stop();
    expect(String(error)).toMatch(/inside an effect/);
  });

  it('gives undo ops the live game to change in place', () => {
    const { g, w, same } = watched();
    const before = w.value();
    const keep = g.rounds[1];
    const round = board(g);
    const cat = round.categories[2];
    round.categories.splice(0, 1);
    const [r] = g.rounds.splice(0, 1);
    g.rounds.splice(2, 0, r);
    g.worlds![0].maps[0].screens.push(newScreen(3, 1, 'Castle'));
    (cat.clues[0].questionSlide.elements[0] as TextEl).text = 'Moved and edited';
    const ops = diff(before, w.value());
    applyOps(g, ops, -1);
    expect(JSON.stringify(w.value())).toBe(JSON.stringify(before));
    same();
    expect(g.rounds[1]).toBe(keep);
    expect(board(g)).toBe(round);
    expect(round.categories[2]).toBe(cat);
    applyOps(g, ops, 1);
    same();
    expect(round.categories[1]).toBe(cat);
  });
});
