import { createSubscriber } from 'svelte/reactivity';

/**
 * One "now" for every countdown this window shows: the stage's clock, the status line's and the go-on check's "(26 s
 * left)" read the same moment, so they never disagree by a second (each ticking on its own beat, they did for a
 * moment near each second's turn). It ticks every 100 ms while something shows it.
 */
let now = Date.now();
let shown = 0;
const subscribe = createSubscriber((update) => {
  shown++;
  now = Date.now();
  const id = setInterval(() => {
    now = Date.now();
    update();
  }, 100);
  return () => {
    shown--;
    clearInterval(id);
  };
});

/** The time now, as the countdowns on screen show it (read where nothing shows one, it's the clock's own). */
export function clockNow(): number {
  subscribe();
  return shown ? now : Date.now();
}
