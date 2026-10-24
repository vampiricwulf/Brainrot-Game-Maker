<!--
  The scores-only window (#audience-scores): the score plates and the countdown on a 1920×260 strip, scaled to the
  window and kept at its bottom, for a lower-third capture in OBS. With a chroma-key stage background, everything
  around the plates is that flat color.
-->
<script lang="ts">
  import type { Live } from '../lib/live';
  import type { Game, Session } from '../lib/model';
  import { rightFill, STAGE_KEYS, themeStyle } from '../lib/theme';
  import ScoreBar from './ScoreBar.svelte';
  import TimerDisplay from './TimerDisplay.svelte';
  import { platesClear, wagersIn } from './flow';

  let { game, session, live }: { game: Game; session: Session | null; live: Live } = $props();

  const W = 1920;
  const H = 260;
  let w = $state(0);
  let h = $state(0);
  const scale = $derived(Math.min(w / W, h / H) || 0);
  const keyColor = $derived(game.theme?.stageBg ? STAGE_KEYS[game.theme.stageBg] : undefined);
  /** The countdown's slot, at the right end. */
  const CLOCK = 280;
  /** The plates fit clear of the countdown's slot as they are: they stay put when it comes and goes. */
  const clear = $derived(platesClear(session?.players.length ?? 0, CLOCK));
</script>

<!-- data-stage: viewers see it, so ⚙ Settings › Reduce motion on stream calms it like the stage (app.css). -->
<div class="frame" data-stage bind:clientWidth={w} bind:clientHeight={h} style:background={keyColor ?? '#000'}>
  <!-- Nothing before the game starts (the host is on the pre-game screen), nor under the cover (scores changing behind
       it would give the judging away). -->
  {#if session && !live.pregame && !live.cover && session.players.length}
    <!-- (A wager's ✔ in the blue OBS keeps on a green key, as on the stage.) -->
    <div class="strip" class:keyed={!!keyColor} style={themeStyle(game.theme)} style:--right={rightFill(game.theme?.stageBg)} style:width="{W}px" style:height="{H}px" style:transform="translateX(-50%) scale({scale})">
      <!-- In a Final nobody picks: the spotlit player in its reveals is lit, else nobody (as on the stage); nor on the
           results or the tiebreaker. Plates too many to fit clear of the countdown make room for it while it's up (their
           scores shortened to fit). The ✔ of a Final wager that's in, as on the stage. -->
      <div class="plates">
        <ScoreBar
          {game}
          {session}
          reserve={live.timer && !clear ? CLOCK : 0}
          ticks={wagersIn(session)}
          phones={live.phones}
          lit={session.phase === 'final'
            ? session.finalStep === 'reveal'
              ? (session.final?.current ?? null)
              : null
            : session.phase === 'end' || session.phase === 'tiebreaker'
              ? null
              : undefined}
        />
      </div>
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
    /* On stream: the theme's colors (and its key color) whatever the host's contrast theme. */
    forced-color-adjust: none;
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
    background: linear-gradient(var(--scorebar-bg, #050835), var(--scorebar-end, #000));
  }
  .plates :global(.bar) {
    background: none;
  }
  .clock {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 280px;
    height: 230px;
  }
  /* Over the key, the countdown's box is solid: see-through, it would blend with the key's color, and OBS take it out. */
  .strip.keyed .clock :global(.timer) {
    background: #000;
  }
  .clock :global(.timesup) {
    font-size: 64px;
    -webkit-text-stroke: 3px #000;
  }
</style>
