// Motion on the stream: ⚙ Settings › "Reduce motion on stream" (prefs.reduceMotion) calms what viewers see. The
// stage's pop-ins, fly-ins and confetti go, its CSS animations end at once (app.css: html.reduce-stream [data-stage]).
// The host's own controls follow the computer's "reduce motion" setting instead (app.css, prefers-reduced-motion).
// The wheel and the dice still spin: their spin is the game.
import {
  fade as svelteFade,
  fly as svelteFly,
  scale as svelteScale,
  type FadeParams,
  type FlyParams,
  type ScaleParams,
  type TransitionConfig,
} from 'svelte/transition';
import { prefs } from './prefs.svelte';

const KEY = 'jb.prefs';

/** True while the stream's motion is reduced. */
export function calmStream(): boolean {
  return !!prefs.reduceMotion;
}

const still: TransitionConfig = { duration: 0 };

export function fade(node: Element, params?: FadeParams): TransitionConfig {
  return calmStream() ? still : svelteFade(node, params);
}
export function fly(node: Element, params?: FlyParams): TransitionConfig {
  return calmStream() ? still : svelteFly(node, params);
}
export function scale(node: Element, params?: ScaleParams): TransitionConfig {
  return calmStream() ? still : svelteScale(node, params);
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
