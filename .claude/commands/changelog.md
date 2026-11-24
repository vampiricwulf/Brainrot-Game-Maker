---
description: Write CHANGELOG.md lines for the commits not pushed yet, add their hashes, and stamp the date at push
---

Bring `CHANGELOG.md` up to date for what's committed but not pushed. $ARGUMENTS

The rule is in `CLAUDE.md` ("Commits and CHANGELOG.md"); these are its steps.

1. **Lines.** `git log --format='%h %s' origin/main..HEAD` lists the commits not pushed yet. For each change that
   people who make or host games would notice, make sure there's a line under **Unreleased** at the top of
   `CHANGELOG.md`, in **Added**, **Changed**, **Fixed** or **Removed** (only Fixed lines make a patch release; a line
   marked **Breaking** makes a major one). Write it in plain words for them, as the lines around it are written: what
   they see or do now, and what was wrong before for a fix. Behind-the-scenes changes (tests, docs, tooling) get no
   line. Ideally each line went in with its change; add any that are missing.
2. **Hashes.** Add the short hashes of the commits each line covers at its end, e.g. `(abc1234)` or
   `(abc1234, def5678)`. A commit can't hold its own hash, so this always comes after.
3. **Titles that say nothing.** A commit whose title doesn't say what it is goes in the "Notes on the history" table
   at the bottom. Never rewrite pushed history.
4. **Stamp, only when pushing now.** If the commits are about to be pushed, run `node scripts/version.mjs stamp`. It
   moves the Unreleased lines under today's date in Pacific time, merging them into that day's sections if it has a
   heading already, and says what it moved (or that Unreleased was empty). Don't stamp lines that aren't being pushed:
   they stay under Unreleased.
5. Run `node scripts/version.mjs check`, then commit `CHANGELOG.md` alone as `Changelog: …` (e.g.
   `Changelog: the Final's silent-player fixes under 2026-11-22`). Don't push unless asked.
