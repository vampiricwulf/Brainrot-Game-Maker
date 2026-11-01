// The keys window's lists (the editor's in editor/editorkeys.ts, the game screen's in play/hostkeys.ts): groups of
// [keys, what they do], and the filter both parts share.

/** One group of keys: where they work, then each [keys, what they do]. */
export type KeyGroup = { title: string; keys: [string, string][] };

/**
 * Buttons renamed lately, as [the name now, the name before]: for a release or two the filter finds a row by the old
 * name too, so a host who knows a button by its old name still finds it. Each rename adds its line here.
 */
export const RENAMED: [string, string][] = [
  ['↩ Put back (keep tile)', '↩ Cancel (keep tile)'],
  ['🎡 Spin!', 'Spin!'],
  ['🎲 Roll!', 'Roll!'],
  ['↻ Spin again', 'Spin again'],
  ['↻ Roll again', 'Roll again'],
  ['📊 Scoreboard', '📊 Scores'],
  ['▭ Scores window', '▭'],
  ['📤 Hand out the cards', '📤 Distribute'],
  ['Someone else picked it ▾', 'change ▾'],
  ['Another partner ▾', 'change partner ▾'],
  ['◀ Previous round', '◀ Prev round'],
  ['↺ Reset slices', '↺ Undo edits'],
  ['✎ Edit deal', '✎ Change it'],
  ['Who was it for?', 'This was for'],
  ['↶ Reopen this tile', '↶ Put it back on the board'],
  ['👁 Reveal answer', 'Reveal answer ▶'],
  ['💾 Replace “…”…', 'Overwrite “…”'],
  ['🎭 Show who was who', '🎭 Who was who'],
  ['↩ Take the cards back', '✖ Take back (🎭 Deal…)'],
  ['↩ Take back', '✖ Take back'],
  ['✕ Close the card window', '✖ Close the card window'],
  ['🗑 End this deal', '✖ Put it away'],
  ['✕ Close (± Adjust score)', 'Done (± Adjust score)'],
  ['Finish now…', 'Finish game ▶ (finish early)'],
  ['⛔ Kick all', '✕ All'],
  ['❔ Help', '⌨'],
  ['🔊 Test the sound…', '🔊 Sound for Discord / OBS…'],
  ['⏹ Close the room…', '✕ Close the room'],
];

/** "Ctrl+" reads "⌘" on a Mac. */
export const macKeys = (k: string, mac: boolean): string => (mac ? k.replaceAll('Ctrl+', '⌘') : k);

/** A row the filter kept: its keys (as this computer writes them), its words, and the old name it was found by. */
export type KeyRow = { keys: string; words: string; was?: string };

/** A name's words, without the sign in front ("📤 Distribute" → "distribute"). */
const plain = (name: string): string =>
  name
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .toLowerCase();

/**
 * The groups with the rows that hold every word typed in `filter` (in their keys or words; a group whose name holds them
 * all shows whole), the groups with none left out. A row whose words name a renamed button is found by its old name
 * too, and says so (`was`).
 */
export function filterKeys(groups: readonly KeyGroup[], filter: string, mac = false, renamed: readonly [string, string][] = RENAMED): { title: string; rows: KeyRow[] }[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (t: string) => words.every((w) => t.includes(w));
  const out: { title: string; rows: KeyRow[] }[] = [];
  for (const g of groups) {
    const all = !words.length || has(g.title.toLowerCase());
    const rows: KeyRow[] = [];
    for (const [k, d] of g.keys) {
      const row: KeyRow = { keys: macKeys(k, mac), words: d };
      const text = `${row.keys} ${k} ${d}`.toLowerCase();
      if (all || has(text)) {
        rows.push(row);
        continue;
      }
      // Found by an old name: the renames whose new name this row says.
      const olds = renamed.filter(([now]) => plain(now) && text.includes(plain(now))).map(([, was]) => was);
      if (!olds.length || !has(`${text} ${olds.join(' ').toLowerCase()}`)) continue;
      // (Said by the old names a typed word was found in.)
      const by = olds.filter((was) => words.some((w) => !text.includes(w) && was.toLowerCase().includes(w)));
      rows.push({ ...row, was: by.join(', ') });
    }
    if (rows.length) out.push({ title: g.title, rows });
  }
  return out;
}

/** How many rows a filtered list has. */
export const rowCount = (groups: readonly { rows: readonly unknown[] }[]): number => groups.reduce((n, g) => n + g.rows.length, 0);
