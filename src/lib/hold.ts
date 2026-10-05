// Media that waits under the cover (K) and goes on after it: a cue's sound, a wheel slice's or die face's video.
import { getContext, setContext } from 'svelte';

/** Svelte action: pause `node` while `held`, and play it again after (only if it was playing). */
export function holdWhile(node: HTMLMediaElement, held: boolean) {
  let paused = false;
  const set = (h: boolean) => {
    if (h && !node.paused) {
      paused = true;
      node.pause();
    } else if (!h && paused) {
      paused = false;
      void node.play().catch(() => {});
    }
  };
  set(held);
  return { update: set };
}

const COVER = Symbol('cover');
/** The stage says whether the cover is up, for what's drawn on it (a tool's result card). */
export const provideCover = (covered: () => boolean): void => void setContext(COVER, covered);
export const coverUp = (): (() => boolean) => getContext<(() => boolean) | undefined>(COVER) ?? (() => false);
