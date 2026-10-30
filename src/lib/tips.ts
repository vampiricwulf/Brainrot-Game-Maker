// The help that shows once on this computer: the editor's 💡 Tips folds (open the first time a place is seen: see
// editor/Tips.svelte), the note 🙈 Hide gives the first time, and the Final's how-to in the reveals. 💡 Show all tips
// again forgets that they were seen.

/** The once-only notes on the game screen (the 💡 Tips folds are every `jb.tips.…`). */
const ONCE = ['jb.hideHintSeen', 'jb.finalHowSeen'];

/** Every tip shows again, as the first time (each the next time its place comes up). */
export function showTipsAgain(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
    for (const k of keys) if (k.startsWith('jb.tips.') || ONCE.includes(k)) localStorage.removeItem(k);
  } catch {
    // Storage is off (private mode): nothing was kept, so they show anyway.
  }
}
