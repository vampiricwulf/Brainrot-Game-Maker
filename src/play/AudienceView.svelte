<!--
  Everything viewers see, in 1920×1080 stage coordinates. It never renders an answer until
  session.revealed / finalStep === 'answer' (spec §7). Reused as-is by the separate audience window in M2.
-->
<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { textOn } from '../lib/colors';
  import { formatPoints, textSlide, type ClueRef, type Game, type Session } from '../lib/model';
  import { currentClueInfo, standings } from '../lib/session';
  import SlideView from '../lib/slide/SlideView.svelte';
  import Board from './Board.svelte';
  import ScoreBar from './ScoreBar.svelte';
  import type { Live } from '../lib/live';

  let {
    game,
    session,
    live,
    role = 'single',
    onpick,
    onpicker,
  }: {
    game: Game;
    session: Session;
    live: Live;
    /** single: one-window mode · mirror: host's copy in dual mode (muted) · audience: the stream window */
    role?: 'single' | 'mirror' | 'audience';
    onpick?: (ref: ClueRef) => void;
    onpicker?: (id: string) => void;
  } = $props();

  const info = $derived(currentClueInfo(session, game));
  const finalCategorySlide = $derived(textSlide(game.final.category || 'Final Jeopardy'));
  const sym = $derived(game.settings.currencySymbol);
</script>

{#if session.phase === 'board'}
  <div class="board-area" in:fade={{ duration: 200 }}>
    <Board {game} {session} {onpick} />
  </div>
  <div class="score-area"><ScoreBar {game} {session} {onpicker} /></div>
{:else if session.phase === 'clue' && info}
  {#key `${info.clue.id}-${session.revealed}`}
    <div class="full" in:scale={{ start: session.revealed ? 0.98 : 0.15, duration: session.revealed ? 200 : 450 }}>
      <SlideView slide={session.revealed ? info.clue.answerSlide : info.clue.questionSlide} {role} />
    </div>
  {/key}
{:else if session.phase === 'final'}
  {#key session.finalStep}
    <div class="full" in:fade={{ duration: 400 }}>
      {#if session.finalStep === 'category'}
        <div class="final-label">FINAL JEOPARDY!</div>
        <SlideView slide={finalCategorySlide} />
      {:else if session.finalStep === 'question'}
        <SlideView slide={game.final.questionSlide} {role} />
      {:else}
        <SlideView slide={game.final.answerSlide} {role} />
      {/if}
    </div>
  {/key}
{:else if session.phase === 'end'}
  {@const ranked = standings(session)}
  <div class="full end" in:fade={{ duration: 500 }}>
    <h1>{ranked.length ? `${ranked[0].player.name} wins!` : 'Game over'}</h1>
    <ol>
      {#each ranked as { player, score }, i (player.id)}
        <li style:--c={player.color} in:fly={{ y: 60, delay: 300 + (ranked.length - i) * 250, duration: 500 }}>
          <span class="rank">{i + 1}</span>
          <span class="nm" style:background={player.color} style:color={textOn(player.color)}>{player.name}</span>
          <span class="sc">{formatPoints(score, sym)}</span>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<div class="pops" style:bottom={session.phase === 'board' ? '270px' : '40px'}>
  {#each live.pops as p (p.id)}
    <div class="pop" style:background={p.color} style:color={textOn(p.color)} in:fly={{ y: 80, duration: 250 }} out:fade>
      {p.text}
    </div>
  {/each}
</div>

<style>
  .board-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 850px;
  }
  .score-area {
    position: absolute;
    left: 0;
    top: 850px;
    width: 1920px;
    height: 230px;
  }
  .full {
    position: absolute;
    inset: 0;
    background: var(--tile);
  }
  .final-label {
    position: absolute;
    top: 60px;
    width: 100%;
    text-align: center;
    font-family: var(--value-font);
    font-size: 80px;
    color: var(--value);
    text-shadow: 5px 5px 0 #000;
    z-index: 1;
  }
  .end {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 70px;
    color: #fff;
    background: radial-gradient(circle at 50% 30%, #1b27ff, var(--tile) 45%, #020550);
  }
  .end h1 {
    font-family: var(--value-font);
    font-size: 110px;
    margin: 0 0 40px;
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
  }
  .end ol {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 1100px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .end li {
    display: flex;
    align-items: center;
    gap: 24px;
    font-size: 56px;
    font-weight: 800;
    font-family: var(--board-font);
    background: rgba(0, 0, 0, 0.35);
    border-left: 14px solid var(--c);
    padding: 10px 24px;
    border-radius: 10px;
  }
  .rank {
    width: 60px;
    color: var(--value);
  }
  .nm {
    padding: 2px 20px;
    border-radius: 8px;
  }
  .sc {
    margin-left: auto;
    font-family: var(--value-font);
  }
  .pops {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 40px;
    display: flex;
    gap: 20px;
    justify-content: center;
    pointer-events: none;
    z-index: 10;
  }
  .pop {
    font-family: var(--value-font);
    font-size: 60px;
    font-weight: 800;
    padding: 10px 34px;
    border-radius: 16px;
    border: 5px solid #fff;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }
</style>
