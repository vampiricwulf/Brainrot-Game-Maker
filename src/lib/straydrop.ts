// What a file dropped where nothing in the editor takes it says (Editor.svelte's ondrop): pictures, videos, sounds and
// fonts go into 🖼 Media, games and themes open, and anything else gets one short line that names it. Pure:
// unit-tested in straydrop.test.ts.

/** A sheet of clues: it goes on a board's 📥 Import clues…, which reads it. */
export const isClueSheet = (name: string): boolean => /\.(csv|tsv)$/i.test(name);

/**
 * The toast for a stray drop: `added`, the names stored in 🖼 Media; `refused`, the names that are none of what the
 * game uses (a clue sheet says where it goes). Empty: nothing to say.
 */
export function strayDropLine(added: readonly string[], refused: readonly string[]): string {
  const q = (n: string) => `“${n}”`;
  const parts: string[] = [];
  if (added.length) parts.push(`Added ${added.length === 1 ? q(added[0]) : `${added.length} files`} to 🖼 Media`);
  const sheet = refused.find(isClueSheet);
  const other = refused.filter((n) => !isClueSheet(n));
  if (sheet) parts.push(`${q(sheet)} is a sheet of clues: drop it on a board’s 📥 Import clues…`);
  if (other.length) parts.push(`${other.length === 1 ? `${q(other[0])} isn’t` : `${other.length} files aren’t`} a picture, video, sound, clue sheet or game file`);
  return parts.join('. ');
}
