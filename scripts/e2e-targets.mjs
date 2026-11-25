// The pure parts of scripts/e2e-shard.mjs, kept apart so the unit tests (scripts/e2e-targets.test.ts) can load them
// without starting a run.

/**
 * What the arguments (with --jobs and --quiet already taken out) ask to run. One argument that is `--check`, `all`,
 * `buzzer`, `rest` or a shard's key means that; otherwise every argument must be an e2e file's name, given as `name`,
 * `name.mjs` or `tests/e2e/name.mjs` (repeats are run once, in the order given).
 * @param {string[]} args
 * @param {{ all: string[], shards: string[], notTests: Set<string> }} known the e2e files' names, the shards' keys, and
 *   the names in tests/e2e/ that aren't tests
 * @returns {{ check: true } | { target: string } | { files: string[] } | { error: string }}
 */
export function parseTargets(args, { all, shards, notTests }) {
  if (args.length === 1) {
    const [a] = args;
    if (a === '--check') return { check: true };
    if (a === 'all' || a === 'buzzer' || a === 'rest' || shards.includes(a)) return { target: a };
  }
  if (!args.length) return { error: '' };
  const files = [];
  for (const a of args) {
    const f = a
      .replace(/\\/g, '/')
      .replace(/^(\.\/)?tests\/e2e\//, '')
      .replace(/\.mjs$/, '');
    if (!all.includes(f) || notTests.has(f)) return { error: `not an e2e file: ${a}` };
    if (!files.includes(f)) files.push(f);
  }
  return { files };
}

/**
 * The failure pictures and trace that an earlier run of e2e file `f` may have left among `names` (a folder's
 * listing): `f-failure.png`, `f-<label>-failure.png` (one per page) and `f-trace.zip`, as failureShots() in
 * tests/e2e/helpers.mjs and smoke.mjs name them. No e2e file's name has a hyphen, so `f-` can't take another file's.
 * Exports and anything else are left.
 * @param {string} f
 * @param {string[]} names
 */
export function leftoversOf(f, names) {
  return names.filter((n) => n === `${f}-failure.png` || n === `${f}-trace.zip` || (n.startsWith(`${f}-`) && n.endsWith('-failure.png')));
}
