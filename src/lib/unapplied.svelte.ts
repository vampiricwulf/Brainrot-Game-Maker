/**
 * Windows holding work not in the game yet: a drawing not inserted, image edits or a trim not applied. Closing or
 * reloading the tab would lose it without a word (it's in no draft), so the browser asks first while one is open
 * (App.svelte's beforeunload), as their own Cancel asks "Discard …?". So does the desktop app's window (flushOnClose),
 * and another tab before it takes over editing, which would close it (markBusy).
 */
import { untrack } from 'svelte';

/** (State: what says this tab's busy to another one follows it.) */
const work = $state({ held: 0 });

/** This window holds unapplied work until the returned function is called (a $effect's cleanup). */
export function holdUnapplied(): () => void {
  // (Not a dependency of the effect that holds it: that would run it again.)
  untrack(() => work.held++);
  let done = false;
  return () => {
    if (!done) untrack(() => work.held--);
    done = true;
  };
}

/** Some window holds work that closing the tab, or another tab taking over, would lose. */
export const unapplied = (): boolean => work.held > 0;
