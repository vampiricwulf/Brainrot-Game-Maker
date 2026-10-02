// Whether two copies of a game hold the same things, whatever order their keys were written in (a setting changed on
// the pre-game screen comes last in one copy and in its place in the other).

/** JSON with every object's keys sorted (undefined values left out, as JSON.stringify does). */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

/** The two hold the same things. */
export const sameGame = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);
