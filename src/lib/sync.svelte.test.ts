// The viewers' windows get only what changed in the game (pushGame): worked out from two of the watcher's copies, and
// set in place in the audience window's copy.
import { afterEach, describe, expect, it } from 'vitest';
import { newTextEl, type BoardGameRound, type Game } from './model';
import { jeopardyGame } from './testgame';
import { newRpgRound, newScreen } from './rpg';
import { newBoardGameRound } from './boardgame';
import { watchGame, type GameWatch } from './watch.svelte';
import { applyGamePatch, gamePatch, hideFromViewers, viewersGame } from './sync.svelte';

/** A board, a Final, an RPG world with a screen holding a text, and a board game. */
function sample(): Game {
  const g = jeopardyGame();
  g.rounds.push(newRpgRound(g), newBoardGameRound());
  g.worlds![0].maps[0].screens.push(newScreen(1, 0, 'Town'));
  g.worlds![0].maps[0].screens[1].slide.elements.push(newTextEl('Welcome'));
  return g;
}
const spaces = (g: Game) => (g.rounds[3] as BoardGameRound).spaces;

let watches: GameWatch[] = [];
function watched(): { g: Game; w: GameWatch } {
  const g = $state(sample());
  const w = watchGame(g);
  watches.push(w);
  return { g, w };
}
afterEach(() => {
  for (const w of watches) w.destroy();
  watches = [];
});

/** What the audience window has after the patch: its copy of `before` (a $state game) with the patch set in it. */
function applied(before: Game, ops: NonNullable<ReturnType<typeof gamePatch>>): Game {
  const copy = $state(structuredClone(before));
  applyGamePatch(copy, structuredClone(ops));
  return $state.snapshot(copy) as Game;
}

describe('the game patch for the viewers’ windows', () => {
  it('a space dragged in ✎ Edit board: its x and y only, and the audience window ends up with the same game', () => {
    const { g, w } = watched();
    const v1 = w.value();
    spaces(g)[2].x += 40;
    spaces(g)[2].y -= 25;
    const v2 = w.value();
    const ops = gamePatch(v1, v2)!;
    expect(ops.map(([p]) => p.join('/'))).toEqual(['rounds/3/spaces/2/x', 'rounds/3/spaces/2/y']);
    expect(applied(v1, ops)).toEqual(v2);
  });

  it('a text moved on an RPG screen, a space added, a name typed: small patches that give the same game', () => {
    const { g, w } = watched();
    const edits: ((g: Game) => void)[] = [
      (g) => (g.worlds![0].maps[0].screens[1].slide.elements[0].x += 100),
      (g) => spaces(g).push({ ...spaces(g)[0], id: 'new', name: 'Lava' }),
      (g) => (g.title = 'Live edit'),
      (g) => (g.players = [{ id: 'p1', name: 'Ann', color: '#e6194b' }]),
    ];
    for (const edit of edits) {
      const v1 = w.value();
      edit(g);
      const v2 = w.value();
      const ops = gamePatch(v1, v2)!;
      expect(ops.length).toBeGreaterThan(0);
      expect(ops.length).toBeLessThanOrEqual(2);
      expect(applied(v1, ops)).toEqual(v2);
    }
  });

  it('nothing changed: nothing to send', () => {
    const { w } = watched();
    expect(gamePatch(w.value(), w.value())).toEqual([]);
  });

  it('the whole game instead when its own keys change, or a lot does', () => {
    const { g, w } = watched();
    const v1 = w.value();
    g.tiebreaker = { questionSlide: { background: {}, elements: [] }, answerSlide: { background: {}, elements: [] } };
    expect(gamePatch(v1, w.value())).toBeNull();
    // (Another game: every id differs.)
    expect(gamePatch(sample(), sample())).toBeNull();
  });
});

describe('the game the viewers’ windows get', () => {
  it('never has a 🤫 card’s own files, nor 🗜 copies for phones (that one exists would tell which file is on a card)', () => {
    const g = sample();
    g.media.push(
      { id: 'pic', name: 'pic.png', mime: 'image/png', size: 1, kind: 'image' },
      { id: 'gif', name: 'dance.gif', mime: 'image/gif', size: 9, kind: 'image' },
      { id: 'gifc', name: 'dance (phones).webm', mime: 'video/webm', size: 1, kind: 'video', phoneCopy: { of: 'gif' } },
      { id: 'quick', name: 'secret.png', mime: 'image/png', size: 1, kind: 'image' },
    );
    hideFromViewers(['quick']);
    expect(viewersGame(g).media.map((m) => m.id)).toEqual(['pic', 'gif']);
    // (Nothing to leave out: the game itself.)
    const plain = sample();
    expect(viewersGame(plain)).toBe(plain);
  });
});
