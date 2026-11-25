// Motion on the stream: ⚙ Settings › "Reduce motion on stream" (prefs.reduceMotion) calms what viewers see. The
// stage's pop-ins, fly-ins and confetti go, its CSS animations end at once (app.css: html.reduce-stream [data-stage]).
// The host's own controls, and the host's own copies of the stage (no [data-stage]), follow the computer's "reduce
// motion" setting as well (app.css, prefers-reduced-motion). The wheel and the dice still spin: their spin is the game.
import {
  fade as svelteFade,
  fly as svelteFly,
  scale as svelteScale,
  type FadeParams,
  type FlyParams,
  type ScaleParams,
  type TransitionConfig,
} from 'svelte/transition';
import { MediaQuery } from 'svelte/reactivity';
import { prefs } from './prefs.svelte';

const KEY = 'jb.prefs';

/** True while the stream's motion is reduced. */
export function calmStream(): boolean {
  return !!prefs.reduceMotion;
}

const still: TransitionConfig = { duration: 0 };

// (Not where there's no matchMedia: the unit tests.)
const osQuery = typeof matchMedia !== 'undefined' ? new MediaQuery('(prefers-reduced-motion: reduce)') : null;
/**
 * The computer asks for less motion while the stream's isn't reduced: the stage viewers see (the host's too, in one
 * window) still moves, so ⚙ Settings and ▶ Play's 📺 On stream say so beside Reduce motion on stream. Only a hint: the
 * stream's motion stays the host's own choice. (Reactive: it follows either setting as it changes.)
 */
export function streamMovesThoughAsked(): boolean {
  return !!osQuery?.current && !calmStream();
}
/** Its words, under the Reduce motion on stream box. */
export const STREAM_MOVES_HINT = 'Your computer asks for less motion, but the stage (what viewers see) still moves until you tick this.';

const osReduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** No motion here: the stream's is calmed, or this isn't what viewers see and the computer asks for less. (Svelte asks
 * once the node is in the page, so closest() finds its stage.) */
const calm = (node: Element) => calmStream() || (!node.closest('[data-stage]') && osReduce());
/** How the host's jump buttons scroll (scrollIntoView's behavior, which beats app.css's scroll-behavior): at once when
 * the computer asks for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return osReduce() ? 'auto' : 'smooth';
}

export function fade(node: Element, params?: FadeParams): TransitionConfig {
  return calm(node) ? still : svelteFade(node, params);
}
export function fly(node: Element, params?: FlyParams): TransitionConfig {
  return calm(node) ? still : svelteFly(node, params);
}
export function scale(node: Element, params?: ScaleParams): TransitionConfig {
  return calm(node) ? still : svelteScale(node, params);
}

// The audience window is a window of its own: it follows the setting when the host changes it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      prefs.reduceMotion = !!(JSON.parse(e.newValue) as { reduceMotion?: boolean }).reduceMotion;
    } catch {
      // Not ours to fix.
    }
  });
  $effect.root(() => {
    $effect(() => {
      document.documentElement.classList.toggle('reduce-stream', calmStream());
    });
  });
}
