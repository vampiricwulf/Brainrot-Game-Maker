<!-- Countdown clock + TIME'S UP banner, drawn in stage coordinates. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { timerRemaining, type TimerState } from '../lib/live';

  let {
    timer,
    middle,
  }: {
    timer: TimerState;
    /** On the board: the clock is centred on this line (the score bar's), at its right end, not in the top corner. */
    middle?: number;
  } = $props();
  let now = $state(Date.now());

  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 100);
    return () => clearInterval(id);
  });

  const left = $derived(timerRemaining(timer, now));
  const frac = $derived(timer.total ? left / timer.total : 0);
  const done = $derived(timer.expired || left <= 0);
  const urgent = $derived(!done && left <= 5);
  /**
   * TIME'S UP's moment (its slam and fade, or reduced motion's 3 s): a window opened or reloaded later doesn't play it
   * again over the question. (Not marked yet: this window's own 0, a moment before the host's, shows it at once.)
   */
  const fresh = $derived(timer.expiredAt === undefined ? !timer.expired : now - timer.expiredAt < 3200);
</script>

<div
  class="timer"
  class:urgent
  class:done
  class:paused={timer.startedAt === null && !done}
  class:on-bar={middle !== undefined}
  style:top={middle !== undefined ? `${middle}px` : undefined}
>
  <div class="num">{Math.ceil(left)}</div>
  <div class="bar"><div class="fill" style:width="{frac * 100}%"></div></div>
</div>
{#if done && fresh}
  <div class="timesup">TIME'S UP!</div>
{/if}

<style>
  .timer {
    position: absolute;
    top: 30px;
    right: 30px;
    width: 220px;
    padding: 12px 16px;
    border-radius: 18px;
    background: rgba(0, 0, 0, 0.7);
    border: 4px solid #fff;
    color: #fff;
    text-align: center;
    z-index: 45; /* over a tool or pop-up on screen (it was hidden under them), under the cover */
    font-family: var(--value-font);
  }
  .timer.on-bar {
    translate: 0 -50%;
  }
  .num {
    font-size: 90px;
    line-height: 1;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 14px;
    margin-top: 8px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 7px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--value);
    transition: width 0.1s linear;
  }
  .urgent {
    border-color: #ff3b3b;
    animation: pulse 0.5s ease-in-out infinite alternate;
  }
  .urgent .fill {
    background: #ff3b3b;
  }
  .paused {
    opacity: 0.6;
  }
  .timesup {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--value-font);
    font-size: 220px;
    font-weight: 900;
    color: #fff;
    -webkit-text-stroke: 10px #000;
    paint-order: stroke fill;
    text-shadow: 0 0 60px #ff0000;
    z-index: 50;
    /* Then it gets out of the way, so viewers can read the question again (the red clock at 0 stays). */
    animation: slam 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) both, shake 0.4s 0.5s linear 2, fade-out 0.5s 2.5s forwards;
    pointer-events: none;
  }
  .done {
    border-color: #ff3b3b;
  }
  @keyframes pulse {
    to {
      scale: 1.08;
    }
  }
  @keyframes slam {
    from {
      scale: 3;
      opacity: 0;
    }
  }
  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }
  @keyframes shake {
    25% {
      translate: -20px 0;
    }
    75% {
      translate: 20px 0;
    }
  }
</style>
