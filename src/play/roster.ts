// The game's players as the pre-game screen keeps them (Play.svelte's keepRoster): the list there, with what only the
// game's own copy has (stats) kept. Pure: unit-tested in roster.test.ts.
import type { PlayerTemplate } from '../lib/model';

/** A player as the pre-game list has them. */
export type RosterRow = Pick<PlayerTemplate, 'id' | 'name' | 'color' | 'avatar'>;

/**
 * The game's players (`old`) made like the pre-game `list`: its order, names, colors and pictures. A picture stays
 * unless it was taken off there: a player whose row had one in `before` (the list as it was) and has none now. A row
 * without a picture that never had one there (a rematch from an older copy, a game resumed) keeps the game's.
 */
export function keptRoster(old: readonly PlayerTemplate[], list: readonly RosterRow[], before: readonly RosterRow[] = []): PlayerTemplate[] {
  const had = new Map(old.map((p) => [p.id, p]));
  const was = new Map(before.map((p) => [p.id, p]));
  return list.map((p) => {
    const t: PlayerTemplate = { ...structuredClone(had.get(p.id) ?? {}), id: p.id, name: p.name, color: p.color };
    if (p.avatar) t.avatar = p.avatar;
    else if (was.get(p.id)?.avatar) delete t.avatar;
    return t;
  });
}
