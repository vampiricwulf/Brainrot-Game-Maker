/**
 * Windows holding work not in the game yet: a drawing not inserted, image edits or a trim not applied. Closing or
 * reloading the tab would lose it without a word (it's in no draft), so the browser asks first while one is open
 * (App.svelte's beforeunload), as their own Cancel asks "Discard …?".
 */
let held = 0;

/** This window holds unapplied work until the returned function is called (a $effect's cleanup). */
export function holdUnapplied(): () => void {
  held++;
  let done = false;
  return () => {
    if (!done) held--;
    done = true;
  };
}

/** Some window holds work that closing the tab would lose. */
export const unapplied = (): boolean => held > 0;
