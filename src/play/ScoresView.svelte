<!--
  The scores-only window (#audience-scores): the score plates and the countdown on a 1920×260 strip, scaled to the
  window and kept at its bottom, for a lower-third capture in OBS. With a chroma-key stage background, everything
  around the plates is that flat color.
-->
<script lang="ts">
  import type { Live } from '../lib/live';
  import type { Game, Session } from '../lib/model';
  import { STAGE_KEYS, themeStyle } from '../lib/theme';
  import ScoreBar from './ScoreBar.svelte';
  import TimerDisplay from './TimerDisplay.svelte';

  let { game, session, live }: { game: Game; session: Session | null; live: Live } = $props();

  const W = 1920;
  const H = 260;
  let w = $state(0);
  let h = $state(0);
  const scale = $derived(Math.min(w / W, h / H) || 0);
  const keyColor = $derived(game.theme?.stageBg ? STAGE_KEYS[game.theme.stageBg] : undefined);
</script>

<div class="frame" bind:clientWidth={w} bind:clientHeight={h} style:background={keyColor ?? '#000'}>
  <!-- Nothing before the game starts (the host is on the pre-game screen). -->
  {#if session && !live.pregame && session.players.length}
    <div class="strip" class:keyed={!!keyColor} style={themeStyle(game.theme)} style:width="{W}px" style:height="{H}px" style:transform="translateX(-50%) scale({scale})">
      <div class="plates"><ScoreBar {game} {session} /></div>
      {#if live.timer}
        <div class="clock"><TimerDisplay timer={live.timer} /></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .frame {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }
  .strip {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform-origin: bottom center;
    display: flex;
    align-items: flex-end;
  }
  .plates {
    position: relative;
    flex: 1;
    height: 230px;
  }
  /* One background for the whole strip (the plates' and the clock's): the score bar's, or nothing over the key color. */
  .strip:not(.keyed) {
    background: linear-gradient(var(--scorebar-bg, #050835), #000);
  }
  .plates :global(.bar) {
    background: none;
  }
  .clock {
    position: relative;
    width: 280px;
    height: 230px;
    flex-shrink: 0;
  }
  .clock :global(.timesup) {
    font-size: 64px;
    -webkit-text-stroke: 3px #000;
  }
</style>
