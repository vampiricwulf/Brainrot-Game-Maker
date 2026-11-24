---
description: Run every check CI runs (npm run gate) in the background and report what failed
---

Run the whole gate and report what failed. $ARGUMENTS

1. If the shell hasn't got them yet, link the packages into this checkout (a worktree has none of its own):
   `ln -s <main checkout>/node_modules node_modules` and the same for `buzzer/node_modules`. Skip this in the main
   checkout.
2. Start `npm run gate` **in the background** (it takes far longer than 10 minutes: the version check, svelte-check,
   the unit tests, the buzzer check, the shard check, the build, then every e2e file 3 at a time with quiet output).
   Send its output to a file, e.g. `npm run gate > gate.log 2>&1`. Don't start it twice, and don't run the e2e suite
   in the foreground.
3. While it runs, do nothing that rebuilds `dist/` or edits `src/`: the e2e files would test a different build.
4. When it ends, read the summary at the end of the log, not the whole log. It says which step or which e2e files
   failed. For each failed e2e file, read only its part of the log (search for the file's name, `FAIL` and
   `Assertion failed`) and the pictures it left in `test-results/`.
5. Report: passed, or each failure with the step or file, the failing check's message, and the likely cause in one
   line. Say which failures look like flakes (a timeout that passes when you run `node tests/e2e/<name>.mjs` once on
   its own) and which are real. Don't fix anything unless asked.
