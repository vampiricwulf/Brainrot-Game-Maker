// Open…'s one window: where the desktop app's saves are, and the rows' arrow keys.

/** Where the saves listed are: BrainrotSaves next to the app, in Documents (when the app's folder can't be written), or both. */
export function savesWhere(places: readonly string[]): string {
  const inDocuments = places.filter((p) => p === 'documents').length;
  return !inDocuments ? 'next to the app' : inDocuments === places.length ? 'in Documents' : 'next to the app, and in Documents';
}

/** The row an arrow key (or Home / End) goes to from row `at` of `count`, or null for another key. It stops at the ends. */
export function nextRow(key: string, at: number, count: number): number | null {
  if (!count) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return Math.min(count - 1, at + 1);
  if (key === 'ArrowUp') return Math.max(0, at - 1);
  return null;
}
