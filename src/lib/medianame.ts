// Media file names are labels (files are stored by id), but they're how people tell files apart in the
// pickers, the Media tab and the layers list, so every file in a game gets a distinct name.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomTag(n = 6): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** `name`, or a randomized variant ("image.png" → "image-k3f9x2.png") if a file in `taken` already uses it. */
export function uniqueMediaName(taken: Iterable<string>, name: string): string {
  const used = new Set(Array.from(taken, (t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let out: string;
  do out = `${base}-${randomTag()}${ext}`;
  while (used.has(out.toLowerCase()));
  return out;
}

/** Rename later duplicates in place (for games saved before names were kept unique). */
export function dedupeMediaNames(media: { name: string }[]): void {
  const seen: string[] = [];
  for (const m of media) {
    m.name = uniqueMediaName(seen, m.name);
    seen.push(m.name);
  }
}
