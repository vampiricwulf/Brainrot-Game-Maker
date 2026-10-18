// After ✎ Edit trims or crops a file (card-files spec §4.11.5): items keep playing the same moments, one whose part was
// cut out plays the whole file, and a video's box takes the picture's new shape when it had the old one.
import { describe, expect, it } from 'vitest';
import { newBoardGameRound, newBoardSpace } from '../boardgame';
import { isBoard, newAudioEl, newVideoEl, type AudioEl, type Game, type VideoEl } from '../model';
import { newRpgRound } from '../rpg';
import { jeopardyGame } from '../testgame';
import { cutLeavesOut, itemsPlaying, refitBoxes, retimeUses, timedItems } from './retime';

const at = (media: string, startAt?: number, endAt?: number, id = `v${Math.random()}`): VideoEl => ({
  ...newVideoEl(media),
  id,
  ...(startAt !== undefined ? { startAt } : {}),
  ...(endAt !== undefined ? { endAt } : {}),
});
/** A game whose first tile's question plays these. */
function withItems(...els: (VideoEl | AudioEl)[]): Game {
  const game = jeopardyGame();
  const board = game.rounds[0];
  if (!isBoard(board)) throw new Error('not a board');
  board.categories[0].clues[0].questionSlide.elements.push(...els);
  return game;
}
const times = (el: VideoEl | AudioEl) => [el.startAt, el.endAt];
// Kept 1.2 s to 3 s of a 4 s file.
const CUT = { from: 1.2, to: 3, length: 4 };

describe('retimeUses', () => {
  it('moves an item inside the part kept back by what was cut off the start', () => {
    const el = at('clip', 1.5, 2.5);
    expect(retimeUses(withItems(el), 'clip', CUT)).toEqual({ kept: 1, clipped: 0, whole: 0 });
    expect(times(el)).toEqual([0.3, 1.3]);
  });

  it('one straddling the start starts at the new start; one straddling the end loses its Stop at', () => {
    const a = at('clip', 0.5, 2);
    const b = at('clip', 1.5, 3.5);
    expect(retimeUses(withItems(a, b), 'clip', CUT)).toEqual({ kept: 0, clipped: 2, whole: 0 });
    expect(times(a)).toEqual([undefined, 0.8]);
    expect(times(b)).toEqual([0.3, undefined]);
  });

  it('one outside the part kept loses its times (it plays the whole trimmed file), and is counted', () => {
    const before = at('clip', 0.2, 0.8);
    const after = at('clip', 3.2);
    expect(retimeUses(withItems(before, after), 'clip', CUT)).toEqual({ kept: 0, clipped: 0, whole: 2 });
    expect([times(before), times(after)]).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });

  it('one with no times plays from the new start (clipped when the end was cut too); a Stop at not after Start at is none', () => {
    const none = at('clip');
    const bad = at('clip', 2, 1);
    expect(retimeUses(withItems(none, bad), 'clip', CUT)).toEqual({ kept: 0, clipped: 2, whole: 0 });
    expect([times(none), times(bad)]).toEqual([
      [undefined, undefined],
      [0.8, undefined],
    ]);
    // Only the end cut: an item with no times keeps none, and isn't clipped at its start.
    const plain = at('clip');
    expect(retimeUses(withItems(plain), 'clip', { from: 0, to: 3, length: 4 })).toEqual({ kept: 0, clipped: 1, whole: 0 });
    expect(times(plain)).toEqual([undefined, undefined]);
  });

  it('a Stop at within 0.05 s of the new end goes: it plays to the end', () => {
    const el = at('clip', 1.5, 2.97);
    expect(retimeUses(withItems(el), 'clip', CUT)).toEqual({ kept: 1, clipped: 0, whole: 0 });
    expect(times(el)).toEqual([0.3, undefined]);
    const before = at('clip', 1.5, 2.9);
    retimeUses(withItems(before), 'clip', CUT);
    expect(times(before)).toEqual([0.3, 1.7]);
  });

  it('rounds to hundredths, and drops a Start at of almost nothing', () => {
    const el = at('clip', 1.288, 2.6666);
    retimeUses(withItems(el), 'clip', CUT);
    expect(times(el)).toEqual([0.09, 1.47]);
    const near = at('clip', 1.22, 2);
    retimeUses(withItems(near), 'clip', CUT);
    expect(times(near)).toEqual([undefined, 0.8]);
  });

  it('leaves another file’s items alone, and with `only`, every item but that one', () => {
    const other = at('other', 1.5, 2.5);
    const a = at('clip', 1.5, 2.5, 'a');
    const b = at('clip', 1.5, 2.5, 'b');
    const game = withItems(other, a, b);
    expect(retimeUses(game, 'clip', CUT, b)).toEqual({ kept: 1, clipped: 0, whole: 0 });
    expect([times(other), times(a), times(b)]).toEqual([
      [1.5, 2.5],
      [1.5, 2.5],
      [0.3, 1.3],
    ]);
  });

  it('finds items anywhere: a tile’s slide, a 🤫 card, a saved card, an RPG look, a board space’s slide, a sound', () => {
    const game = jeopardyGame();
    const board = game.rounds[0];
    if (!isBoard(board)) throw new Error('not a board');
    const els = [at('clip', 2), at('clip', 2), at('clip', 2), at('clip', 2), at('clip', 2), { ...newAudioEl('clip'), id: 's', startAt: 2 }];
    board.categories[0].clues[0].questionSlide.elements.push(els[0]);
    board.categories[0].clues[1].cards = [{ id: 'tc', background: {}, elements: [els[1]], to: 'giver' }];
    game.cards = [{ id: 'sc', name: 'Tip', background: {}, elements: [els[2]] }];
    const rpg = newRpgRound(game, 'Quest');
    game.rounds.push(rpg);
    game.worlds![0].maps[0].screens[0].variants = [{ id: 'night', name: 'Night', slide: { background: {}, elements: [els[3]] } }];
    const bg = newBoardGameRound('Race');
    const space = newBoardSpace(0, 0, 'Bonus');
    space.onLand = [{ id: 'p', do: 'popup', slide: { background: {}, elements: [els[4]] } }];
    bg.spaces = [space];
    game.rounds.push(bg);
    game.rounds[0].name = 'Round';
    board.categories[0].clues[2].questionSlide.elements.push(els[5]);
    expect(itemsPlaying(game, 'clip')).toHaveLength(6);
    expect(retimeUses(game, 'clip', CUT)).toEqual({ kept: 0, clipped: 6, whole: 0 });
    expect(els.map((e) => e.startAt)).toEqual([0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
  });
});

describe('cutLeavesOut and timedItems', () => {
  it('say where an item plays only a part cut out, and how many items have times', () => {
    const game = withItems(at('clip', 0.2, 0.8), at('clip', 1.5, 3.5), at('clip'));
    expect(cutLeavesOut(game, 'clip', CUT)).toEqual([{ where: 'Jeopardy! · Category 1 #1 (question)', start: 0.2, end: 0.8 }]);
    expect(timedItems(game, 'clip')).toBe(2);
  });

  it('agree with retimeUses where an item ends just as the part kept starts, or starts just as it ends', () => {
    const items = [at('clip', 0.2, 1.2), at('clip', 3, 3.5)];
    const game = withItems(...items);
    expect(cutLeavesOut(game, 'clip', CUT).map((u) => [u.start, u.end])).toEqual([
      [0.2, 1.2],
      [3, 3.5],
    ]);
    expect(retimeUses(game, 'clip', CUT)).toEqual({ kept: 0, clipped: 0, whole: 2 });
    expect(items.map(times)).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });
});

describe('refitBoxes', () => {
  it('gives a box that had the picture’s old shape (within 2%) its new one, about as big, whatever its fit', () => {
    const wide = { ...at('clip'), x: 240, y: 135, w: 1440, h: 810, fit: 'cover' as const };
    const near = { ...at('clip'), x: 0, y: 0, w: 1600, h: 890, fit: 'fill' as const };
    const four = { ...at('clip'), x: 0, y: 0, w: 800, h: 600 };
    const game = withItems(wide, near, four);
    expect(refitBoxes(game, 'clip', 16 / 9, 1)).toBe(2);
    expect([wide.w, wide.h]).toEqual([1080, 1080]);
    expect(wide.x + wide.w / 2).toBe(960);
    expect(near.w).toBe(near.h);
    expect([four.w, four.h]).toEqual([800, 600]);
  });

  it('leaves a box 3% off the old shape as it is', () => {
    const off = { ...at('clip'), x: 0, y: 0, w: 1483, h: 810 };
    expect(Math.abs(off.w / off.h - 16 / 9) / (16 / 9)).toBeGreaterThan(0.02);
    expect(refitBoxes(withItems(off), 'clip', 16 / 9, 1)).toBe(0);
    expect([off.w, off.h]).toEqual([1483, 810]);
  });

  it('with `only`, that box alone; and nothing when the shape didn’t change', () => {
    const a = { ...at('clip'), w: 1440, h: 810 };
    const b = { ...at('clip'), w: 1440, h: 810 };
    const game = withItems(a, b);
    expect(refitBoxes(game, 'clip', 16 / 9, 16 / 9)).toBe(0);
    expect(refitBoxes(game, 'clip', 16 / 9, 1, b)).toBe(1);
    expect([a.w, b.w === b.h]).toEqual([1440, true]);
  });
});
