// Versions (Semantic Versioning: MAJOR.MINOR.PATCH), shared by the app (is a newer release out?) and the release
// script (scripts/version.mjs: which version a push to main is released as). Plain TypeScript with nothing that needs
// compiling away, so Node runs it as it is.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** "dev.3" in 1.2.0-dev.3: before 1.2.0. Empty for a release. */
  pre: string;
}

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** "1.2.3", "v1.2.3", "1.2.3-dev.1+abc": null when it isn't a version. */
export function parseVersion(text: string): Version | null {
  const m = RE.exec(text.trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? '' };
}

export const formatVersion = (v: Version): string => `${v.major}.${v.minor}.${v.patch}${v.pre ? `-${v.pre}` : ''}`;

/** Negative when a comes before b, 0 when the same, positive after (SemVer precedence; build metadata ignored). */
export function compareVersions(a: Version, b: Version): number {
  const d = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (d) return d;
  // A pre-release comes before its release; two pre-releases compare part by part, numbers as numbers.
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  const x = a.pre.split('.');
  const y = b.pre.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const nx = /^\d+$/.test(x[i]);
    const ny = /^\d+$/.test(y[i]);
    if (nx && ny) {
      const n = +x[i] - +y[i];
      if (n) return n;
    } else if (nx !== ny) return nx ? -1 : 1;
    else if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** Is `latest` a newer version than `current`? (False when either isn't a version.) */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  return !!a && !!b && compareVersions(a, b) > 0;
}

/** What a release changes, from its changelog lines: it sets how big a step its version takes. */
export type Bump = 'major' | 'minor' | 'patch';

export function bumpVersion(v: Version, bump: Bump): Version {
  if (bump === 'major') return { major: v.major + 1, minor: 0, patch: 0, pre: '' };
  if (bump === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0, pre: '' };
  return { major: v.major, minor: v.minor, patch: v.patch + 1, pre: '' };
}

/** A changelog entry added since the last release, under its section (Added / Changed / Fixed / Removed). */
export interface ChangeEntry {
  section: string;
  text: string;
}

/**
 * How big a step the changes take: a line marked **Breaking** (e.g. a save file older versions can't open) is a major
 * step; anything added, changed or removed, a minor one; only fixes (or nothing in the changelog), a patch.
 */
export function bumpFor(entries: readonly ChangeEntry[]): Bump {
  if (entries.some((e) => /\*\*breaking\*\*|\bBREAKING\b/i.test(e.text))) return 'major';
  if (entries.some((e) => e.section !== 'Fixed')) return 'minor';
  return 'patch';
}

/**
 * The version a release is published as: the last release's, stepped up by what changed since (none yet: `base`).
 * `base` (package.json's version) is a floor: raising it there by hand makes the next release at least that (a
 * deliberate major step, say).
 */
export function nextVersion(last: string | null, base: string, entries: readonly ChangeEntry[]): string {
  const floor = parseVersion(base);
  if (!floor) throw new Error(`Not a version: ${base}`);
  const prev = last ? parseVersion(last) : null;
  if (!prev) return formatVersion({ ...floor, pre: '' });
  const next = bumpVersion(prev, bumpFor(entries));
  return formatVersion(compareVersions(floor, next) > 0 ? { ...floor, pre: '' } : next);
}

/**
 * The changelog entries a diff of CHANGELOG.md adds: `lines` is the file as it is now, `added` the (1-based) numbers
 * of the lines the diff adds. Each added "- " bullet (with the lines that continue it) is filed under the "### "
 * heading above it; the "Notes on the history" table and anything outside a section are left out.
 */
export function addedEntries(lines: readonly string[], added: ReadonlySet<number>): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  let section = '';
  let current: ChangeEntry | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      section = '';
      current = null;
      if (/^## Notes on the history/.test(line)) break;
    } else if (line.startsWith('### ')) {
      section = line.slice(4).trim();
      current = null;
    } else if (line.startsWith('- ')) {
      current = section && added.has(i + 1) ? { section, text: line } : null;
      if (current) out.push(current);
    } else if (current && /^\s+\S/.test(line)) current.text += '\n' + line;
    else current = null;
  }
  return out;
}

/** Release notes from the entries: one list per section, in the changelog's order. */
export function releaseNotes(entries: readonly ChangeEntry[]): string {
  const order = ['Added', 'Changed', 'Fixed', 'Removed'];
  const rank = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length);
  const sections = [...new Set(entries.map((e) => e.section))].sort((a, b) => rank(a) - rank(b));
  return sections.map((s) => `### ${s}\n${entries.filter((e) => e.section === s).map((e) => e.text).join('\n')}`).join('\n\n');
}
