// Moving CHANGELOG.md's Unreleased lines under the day they're pushed (scripts/version.mjs stamp). Plain TypeScript
// with nothing that needs compiling away, so Node runs it as it is, and with no imports, so Node needn't resolve any.

/** The sections a day's lines go under, in the order the changelog lists them. */
const SECTIONS = ['Added', 'Changed', 'Fixed', 'Removed'];

/** Today's date in Pacific time (PST/PDT), as YYYY-MM-DD: the changelog's days are the days pushes land there. */
export function pacificDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** A "## " block of the changelog: its heading line's index, the index just past its last line, and its sections. */
interface Block {
  start: number;
  end: number;
  sections: Map<string, string[]>;
}

/** Where each "## " heading's block starts and ends (the file's end, or the next "## " heading). */
function blockEnd(lines: readonly string[], start: number): number {
  let i = start + 1;
  while (i < lines.length && !lines[i].startsWith('## ')) i++;
  return i;
}

/**
 * A day's or Unreleased's sections: each "### " heading's lines, without the blank lines around them. Anything else
 * (text before the first section, a section the changelog doesn't use) is a mistake to fix by hand, never something to
 * drop quietly.
 */
function readBlock(lines: readonly string[], start: number): Block {
  const end = blockEnd(lines, start);
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      const name = line.slice(4).trim();
      if (!SECTIONS.includes(name)) throw new Error(`${lines[start]} has a section ### ${name}: use ${SECTIONS.join(', ')}`);
      current = sections.get(name) ?? [];
      sections.set(name, current);
    } else if (current) current.push(line);
    else if (line.trim()) throw new Error(`${lines[start]} has text outside a section: ${line}`);
  }
  for (const [name, body] of sections) {
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    if (!body.length) sections.delete(name);
  }
  return { start, end, sections };
}

/** A block's lines: its heading, then each section that has lines, in the changelog's order, then a blank line. */
function writeBlock(heading: string, sections: Map<string, string[]>): string[] {
  const out = [heading, ''];
  for (const name of SECTIONS) {
    const body = sections.get(name);
    if (body?.length) out.push(`### ${name}`, '', ...body, '');
  }
  return out;
}

export interface Stamped {
  /** The changelog with the Unreleased lines under the day. */
  text: string;
  /** How many entries ("- " lines) moved. */
  moved: number;
  /** The day already had a heading, so they were merged into it. */
  merged: boolean;
}

/**
 * Moves the lines under "## Unreleased" under "## <date>": into that day's heading if it has one (each section's moved
 * lines above the ones it already had, newest first as in the rest of the file), or else under a new heading where
 * Unreleased was. The Unreleased heading goes. Null when there's nothing under Unreleased (or no Unreleased heading).
 * Keeps the file's line ends (\r\n on a Windows checkout).
 */
export function stampChangelog(text: string, date: string): Stamped | null {
  // A real day, so a typo such as 2026-11-31 or 2026-22-11 can't make a heading for a day that doesn't exist.
  const asDate = new Date(`${date}T00:00:00Z`);
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(asDate.getTime()) && asDate.toISOString().startsWith(date);
  if (!real) throw new Error(`Not a date (YYYY-MM-DD): ${date}`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^## Unreleased\s*$/i.test(l));
  if (at < 0) return null;
  const unreleased = readBlock(lines, at);
  const moved = [...unreleased.sections.values()].flat().filter((l) => l.startsWith('- ')).length;
  if (!unreleased.sections.size) return null;

  const dayAt = lines.findIndex((l) => l.trim() === `## ${date}`);
  let out: string[];
  if (dayAt >= 0) {
    const day = readBlock(lines, dayAt);
    const sections = new Map<string, string[]>();
    for (const name of SECTIONS) {
      const both = [...(unreleased.sections.get(name) ?? []), ...(day.sections.get(name) ?? [])];
      if (both.length) sections.set(name, both);
    }
    const merged = writeBlock(lines[dayAt], sections);
    // Splice the later block first, so the earlier one's indexes still hold.
    const [first, second] = at < dayAt ? [unreleased, day] : [day, unreleased];
    out = [
      ...lines.slice(0, first.start),
      ...(first === day ? merged : []),
      ...lines.slice(first.end, second.start),
      ...(second === day ? merged : []),
      ...lines.slice(second.end),
    ];
  } else {
    out = [...lines.slice(0, at), ...writeBlock(`## ${date}`, unreleased.sections), ...lines.slice(unreleased.end)];
  }
  // Every line of words must still be there, as many times as before: only headings and blank lines move or go.
  const words = (ls: readonly string[]) =>
    ls
      .filter((l) => l.trim() && !/^#{2,3} /.test(l))
      .sort()
      .join('\n');
  if (words(out) !== words(lines)) throw new Error('Stamping the changelog would lose or add lines: nothing was changed');
  return { text: out.join(eol), moved, merged: dayAt >= 0 };
}
