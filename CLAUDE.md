# Working on this repo

- Keep `CHANGELOG.md` up to date: every change that users would notice gets a line in plain words, under Added /
  Changed / Fixed / Removed, under the day it's pushed (Pacific time, PST/PDT). In practice:
  1. Commit the change (or the merge that brings it in) with its line under **Unreleased** at the top.
  2. A commit can't hold its own hash, so once the hashes are known, add them to the line, e.g. `(abc1234)`.
  3. When you push, first run `node scripts/version.mjs stamp`. It moves the Unreleased lines under today's Pacific
     date, merging them into that day's sections if it has a heading already. Commit the hashes and the move together
     as `Changelog: …`, and push it with the rest.

  If a commit or merge lands with a title that doesn't say what it is, add it to the changelog's "Notes on the history"
  table instead of rewriting pushed history.
