// What a file dropped where nothing in the editor takes it says (Editor.svelte's ondrop): pictures, videos, sounds and
// fonts go into 🖼 Media, games and themes open, and anything else gets one short line that names it; and what
// several files added together in 🖼 Media say. Pure: unit-tested in straydrop.test.ts.

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

/**
 * The one toast for several files added together in 🖼 Media (＋ Add files…, or dropped on its page), so no file's
 * news hides another's: `added`, the names stored; `twins`, files whose bytes were in the game already (`as`: that
 * file's name), which is used instead; `refused`, why the others weren't added (each its own sentence). All simply
 * added: nothing to say (each card flashes as it comes).
 */
export function addedLine(added: readonly string[], twins: readonly { name: string; as: string }[], refused: readonly string[]): string {
  if (!twins.length && !refused.length) return '';
  const q = (n: string) => `“${n}”`;
  const parts: string[] = [];
  if (added.length) parts.push(`Added ${added.length === 1 ? q(added[0]) : `${added.length} files`}.`);
  for (const t of twins) parts.push(`${q(t.name)} is already in 🖼 Media${t.as === t.name ? '' : ` as ${q(t.as)}`}: using that one.`);
  parts.push(...refused);
  return parts.join(' ');
}
