import { describe, expect, it } from 'vitest';
import { hasWork, MAX_RECENT, MAX_RECENT_BYTES, planRecent, signature, type RecentEntry } from './recent';
import { newGame, newRound } from './model';

let n = 0;
function entry(gameId: string, sig: string, sizes: Record<string, number> = {}): RecentEntry {
  n++;
  return { key: `k${n}`, gameId, title: `${gameId} ${n}`, rounds: 1, closedAt: n, media: Object.keys(sizes), sig, sizes };
}

describe('Recent games', () => {
  it('keeps both versions of a game, and lets only the very same copy give way', () => {
    const saved = entry('g', 'v1');
    const other = entry('h', 'x');
    // The edited version is kept beside the saved one.
    const edited = entry('g', 'v2');
    let { list, gone } = planRecent([other, saved], edited);
    expect(list).toEqual([edited, other, saved]);
    expect(gone).toEqual([]);
    // The same game exactly as kept before: the older copy gives way.
    const again = entry('g', 'v1');
    ({ list, gone } = planRecent(list, again));
    expect(list).toEqual([again, edited, other]);
    expect(gone).toEqual([saved]);
  });

  it(`keeps ${MAX_RECENT} games, dropping the oldest, but never the one being reopened`, () => {
    const old = Array.from({ length: MAX_RECENT }, (_, i) => entry(`g${i}`, 's'));
    const { list, gone } = planRecent(old, entry('new', 's'));
    expect(list).toHaveLength(MAX_RECENT);
    expect(gone).toEqual([old[MAX_RECENT - 1]]);
    const spare = old[MAX_RECENT - 1].key;
    const kept = planRecent(old, entry('new', 's'), spare);
    expect(kept.list.map((e) => e.key)).toContain(spare);
    // (It's taken off the list as it reopens.)
    expect(kept.gone).toEqual([]);
  });

  it('keeps the files of the kept games within a size, counting a file they share once; the newest stays anyway', () => {
    const half = MAX_RECENT_BYTES / 2;
    const a = entry('a', 's', { big: half });
    const b = entry('b', 's', { big: half, other: half / 2 });
    const c = entry('c', 's', { third: half });
    // b shares a's file: together they take 1.5 halves; c's file doesn't fit any more.
    const { list, gone } = planRecent([a, c], b);
    expect(list).toEqual([b, a]);
    expect(gone).toEqual([c]);
    const huge = entry('d', 's', { huge: MAX_RECENT_BYTES * 2 });
    expect(planRecent([a], huge).list).toEqual([huge]);
  });

  it('tells the very same game by its signature', () => {
    const g = newGame();
    const copy = JSON.parse(JSON.stringify(g));
    expect(signature(copy)).toBe(signature(g));
    copy.title = 'Other';
    expect(signature(copy)).not.toBe(signature(g));
  });

  it('a game just as New makes it is a scratch game; a title, a theme or a rule is work', () => {
    const g = newGame();
    g.title = '  ';
    expect(hasWork(g)).toBe(false);
    // A checkbox shown fills in an option as false: still nothing changed.
    (g.settings as unknown as Record<string, unknown>).someOption = false;
    expect(hasWork(g)).toBe(false);
    g.title = 'My quiz';
    expect(hasWork(g)).toBe(true);
    const themed = newGame();
    themed.theme.tile = '#ff0000';
    expect(hasWork(themed)).toBe(true);
    const ruled = newGame();
    ruled.settings.currencySymbol = '€';
    expect(hasWork(ruled)).toBe(true);
    const sounds = newGame();
    sounds.soundsOff = { dailyDouble: true };
    expect(hasWork(sounds)).toBe(true);
    const round = newGame();
    round.rounds.push(newRound('R', 1));
    expect(hasWork(round)).toBe(true);
  });
});
