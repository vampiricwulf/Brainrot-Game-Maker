<!--
  Everything viewers see, in 1920×1080 stage coordinates. It never renders an answer until
  session.revealed / finalStep === 'answer' (spec §7). Reused by the audience window, the single-window
  stage and the host's mirror in dual mode.
-->
<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { textOn } from '../lib/colors';
  import { finalName, formatPoints, isBoard, textSlide, type ClueRef, type Game, type Session } from '../lib/model';
  import { currentClueInfo, currentFinal, score, standings, tiedLeaders } from '../lib/session';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import type { MediaRole } from '../lib/mediactl.svelte';
  import { autoPlay } from '../lib/audioout.svelte';
  import type { Live, StageAction } from '../lib/live';
  import SlideView from '../lib/slide/SlideView.svelte';
  import Board from './Board.svelte';
  import ScoreBar from './ScoreBar.svelte';
  import TimerDisplay from './TimerDisplay.svelte';
  import Confetti from './Confetti.svelte';
  import ToolOverlay from './tools/ToolOverlay.svelte';
  import DecorLayer from './DecorLayer.svelte';
  import { boardLayout, themeStyle } from '../lib/theme';

  let {
    game,
    session,
    live,
    role = 'single',
    onpick,
    onunmark,
    onpicker,
    onact,
  }: {
    game: Game;
    session: Session;
    live: Live;
    /** single: one-window mode · mirror: host's copy in dual mode (muted) · audience: the stream window */
    role?: MediaRole;
    onpick?: (ref: ClueRef) => void;
    /** Host only: put a used tile back on the board (right-click). */
    onunmark?: (ref: ClueRef) => void;
    onpicker?: (id: string) => void;
    /** Host clicked the stage (only passed in the host's window, never the audience window). */
    onact?: (a: StageAction) => void;
  } = $props();
  const act = (a: StageAction) => onact?.(a);

  const info = $derived(currentClueInfo(session, game));
  const finalRound = $derived(currentFinal(session, game));
  const finalCategorySlide = $derived(textSlide(finalRound ? finalRound.category || finalName(finalRound) : ''));
  const finalLabel = $derived(finalRound ? finalName(finalRound).toUpperCase() : '');
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived.by(() => {
    const r = game.rounds[session.currentRound];
    return isBoard(r) ? r : undefined;
  });
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  const ddPlayer = $derived(session.dd?.playerId ? byId[session.dd.playerId] : undefined);
  const spotlight = $derived(session.final?.current ? byId[session.final.current] : undefined);
  const themeCss = $derived(themeStyle(game.theme, game.theme?.boardImage ? mediaUrls[game.theme.boardImage] : undefined));
  const bar = $derived(game.theme?.scoreBar ?? 'bottom');
  const bannerUrl = $derived(game.theme?.banner ? mediaUrls[game.theme.banner] : undefined);
  const layout = $derived(boardLayout(game.theme, !!bannerUrl));
  const decorBehind = $derived((round?.decor ?? []).filter((d) => d.behind));
  const decorAbove = $derived((round?.decor ?? []).filter((d) => !d.behind));
  const winners = $derived.by(() => {
    const ties = tiedLeaders(session);
    if (ties.length && session.coWinners) return ties;
    const top = standings(session)[0];
    return top ? [top.player] : [];
  });
</script>

<div class="theme" style={themeCss}>
{#if session.phase === 'board'}
  {#if session.intro?.stage === 'title'}
    <div
      class="full title-card"
      class:clickable={!!onact}
      onclick={() => act('intro')}
      role="presentation"
      in:scale={{ start: 0.3, duration: 600 }}
      out:fade={{ duration: 250 }}
    >
      <div class="round-name">{round?.name}</div>
    </div>
  {:else}
    <div class="board-screen" in:fade={{ duration: 200 }}>
      <div class="board-bg" style:top="{layout.bg.top}px" style:height="{layout.bg.height}px"></div>
      {#if decorBehind.length}<div class="layer behind"><DecorLayer items={decorBehind} /></div>{/if}
      {#if layout.banner && bannerUrl}
        <div class="banner" style:top="{layout.banner.top}px" style:height="{layout.banner.height}px">
          <img src={bannerUrl} alt="" draggable="false" style:object-fit={game.theme.bannerFit ?? 'contain'} onerror={imgFallback} />
        </div>
      {/if}
      <div
        class="board-area bar-{bar}"
        class:clickable={!!onact && !!session.intro}
        style:top="{layout.board.top}px"
        style:height="{layout.board.height}px"
        onclick={() => session.intro && act('intro')}
        role="presentation"
      >
        <Board {game} {session} {onpick} {onunmark} />
      </div>
      {#if layout.score}
        <div class="score-area bar-{bar}" style:top="{layout.score.top}px" style:height="{layout.score.height}px"><ScoreBar {game} {session} {onpicker} /></div>
      {/if}
      {#if decorAbove.length}<div class="layer above"><DecorLayer items={decorAbove} /></div>{/if}
    </div>
  {/if}
{:else if session.phase === 'clue' && info}
  {#if session.dd?.stage === 'splash'}
    <div class="full dd" in:scale={{ start: 0.05, duration: 700 }}>
      <div class="dd-text">DAILY<br />DOUBLE!</div>
      {#if ddPlayer}
        <div class="dd-player" style:background={ddPlayer.color} style:color={textOn(ddPlayer.color)}>{ddPlayer.name}</div>
      {/if}
    </div>
  {:else}
    {#key `${info.clue.id}-${session.revealed}`}
      <div
        class="full"
        class:clickable={!!onact}
        onclick={() => act(session.revealed ? 'back' : 'reveal')}
        role="presentation"
        in:scale={{ start: session.revealed ? 0.98 : 0.15, duration: session.revealed ? 200 : 450 }}
      >
        <SlideView slide={session.revealed ? info.clue.answerSlide : info.clue.questionSlide} {role} />
      </div>
    {/key}
    {#if session.dd?.stage === 'question' && ddPlayer}
      <div class="dd-badge" style:border-color={ddPlayer.color}>
        <span style:color={ddPlayer.color}>{ddPlayer.name}</span> · Daily Double · {formatPoints(session.dd.wager ?? 0, sym)}
      </div>
    {/if}
  {/if}
{:else if session.phase === 'final'}
  {#key session.finalStep}
    <div
      class="full"
      class:clickable={!!onact && session.finalStep !== 'wagers' && session.finalStep !== 'reveal'}
      onclick={() =>
        session.finalStep === 'question' ? act('reveal') : session.finalStep === 'category' || session.finalStep === 'answer' ? act('final-next') : undefined}
      role="presentation"
      in:fade={{ duration: 400 }}
    >
      {#if session.finalStep === 'category' || session.finalStep === 'wagers'}
        <div class="final-label">{finalLabel}</div>
        <SlideView slide={finalCategorySlide} />
        {#if session.finalStep === 'wagers'}<div class="final-sub">Make your wagers…</div>{/if}
      {:else if session.finalStep === 'question'}
        {#if finalRound}<SlideView slide={finalRound.questionSlide} {role} />{/if}
      {:else if session.finalStep === 'answer'}
        {#if finalRound}<SlideView slide={finalRound.answerSlide} {role} />{/if}
      {:else if session.finalStep === 'reveal'}
        <div class="reveal">
          <div class="final-label small">{finalLabel}</div>
          {#if spotlight && session.final}
            {@const f = session.final}
            {@const res = f.results[spotlight.id]}
            {#key spotlight.id}
              <div class="spot" in:fly={{ y: 80, duration: 400 }} style:--c={spotlight.color}>
                <div class="spot-name" style:background={spotlight.color} style:color={textOn(spotlight.color)}>{spotlight.name}</div>
                <div class="spot-wager">
                  {#if f.shown[spotlight.id]}
                    Wagered <b>{formatPoints(f.wagers[spotlight.id] ?? 0, sym)}</b>
                  {:else}
                    Wager: ???
                  {/if}
                </div>
                {#if res}
                  <div class="spot-result {res}" in:scale={{ start: 2, duration: 350 }}>{res === 'right' ? '✔ CORRECT' : '✘ WRONG'}</div>
                {/if}
                <div class="spot-score">{formatPoints(score(session, spotlight.id), sym)}</div>
              </div>
            {/key}
          {/if}
        </div>
        <div class="score-area"><ScoreBar {game} {session} /></div>
      {/if}
    </div>
  {/key}
{:else if session.phase === 'tiebreaker' && game.tiebreaker}
  {#key session.tiebreakerRevealed}
    <div
      class="full"
      class:clickable={!!onact && !session.tiebreakerRevealed}
      onclick={() => !session.tiebreakerRevealed && act('reveal')}
      role="presentation"
      in:fade={{ duration: 300 }}
    >
      <SlideView slide={session.tiebreakerRevealed ? game.tiebreaker.answerSlide : game.tiebreaker.questionSlide} {role} />
      <div class="final-label small">TIEBREAKER</div>
    </div>
  {/key}
{:else if session.phase === 'end'}
  {@const ranked = standings(session)}
  <div class="full end" in:fade={{ duration: 500 }}>
    <Confetti colors={[...winners.map((w) => w.color), '#ffcc00', '#ffffff']} />
    <h1>
      {#if winners.length > 1}
        It's a tie: {winners.map((w) => w.name).join(' & ')}!
      {:else if winners.length}
        {winners[0].name} wins!
      {:else}
        Game over
      {/if}
    </h1>
    <ol>
      {#each ranked as { player, score: s }, i (player.id)}
        <li style:--c={player.color} in:fly={{ y: 60, delay: 300 + (ranked.length - i) * 250, duration: 500 }}>
          <span class="rank">{i + 1}</span>
          <span class="nm" style:background={player.color} style:color={textOn(player.color)}>{player.name}</span>
          <span class="sc">{formatPoints(s, sym)}</span>
        </li>
      {/each}
    </ol>
  </div>
{/if}

{#if live.timer && (session.phase === 'clue' || session.phase === 'final' || session.phase === 'tiebreaker' || session.phase === 'board')}
  <TimerDisplay timer={live.timer} />
{/if}

{#if live.overlay}
  <ToolOverlay o={live.overlay} {game} {session} {role} onclick={onact ? () => act('overlay') : undefined} />
{/if}

<div class="pops" style:bottom={session.phase === 'board' ? '270px' : '40px'}>
  {#each live.pops as p (p.id)}
    <div class="pop" style:background={p.color} style:color={textOn(p.color)} in:fly={{ y: 80, duration: 250 }} out:fade>
      {p.text}
    </div>
  {/each}
</div>

<!-- Game sound cue: played (and reported if the browser blocks it) where the sound belongs, never in the host's mirror. -->
{#if role !== 'mirror' && live.sound && mediaUrls[live.sound.media]}
  {#key live.sound.nonce}
    <audio use:autoPlay={mediaUrls[live.sound.media]}></audio>
  {/key}
{/if}
</div>

<style>
  .theme {
    display: contents;
  }
  /* Board screen, back to front: background, images behind the tiles, banner + board, score bar, images on top. */
  .board-screen {
    position: absolute;
    inset: 0;
  }
  .board-bg {
    position: absolute;
    left: 0;
    width: 1920px;
    z-index: 0;
    background: var(--board-image, none) center / cover no-repeat, var(--board-gap);
  }
  .layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .layer.behind {
    z-index: 1;
  }
  .layer.above {
    z-index: 4;
  }
  .banner {
    position: absolute;
    left: 0;
    width: 1920px;
    z-index: 2;
    padding: 10px 10px 0;
    box-sizing: border-box;
  }
  .banner img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
  }
  .board-area {
    position: absolute;
    left: 0;
    width: 1920px;
    z-index: 2;
  }
  .board-screen .score-area {
    z-index: 3;
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
  .clickable {
    cursor: pointer;
  }
  .title-card {
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 50% 45%, #2a36ff, var(--tile) 50%, #020550);
  }
  .round-name {
    font-family: var(--value-font);
    font-size: 200px;
    font-weight: 900;
    color: var(--value);
    text-align: center;
    text-shadow: 10px 10px 0 #000;
    -webkit-text-stroke: 4px #000;
    paint-order: stroke fill;
    padding: 0 60px;
    line-height: 1;
  }
  .dd {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    background: radial-gradient(circle, #ff3dcb 0%, #7a00ff 35%, var(--tile) 70%);
    animation: dd-spin 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes dd-spin {
    from {
      rotate: -540deg;
    }
  }
  .dd-text {
    font-family: var(--value-font);
    font-size: 230px;
    line-height: 0.95;
    font-weight: 900;
    color: var(--value);
    text-align: center;
    text-shadow: 12px 12px 0 #000;
    -webkit-text-stroke: 5px #000;
    paint-order: stroke fill;
  }
  .dd-player {
    font-family: var(--board-font);
    font-size: 70px;
    font-weight: 800;
    padding: 8px 40px;
    border-radius: 20px;
    border: 6px solid #fff;
  }
  .dd-badge {
    position: absolute;
    top: 24px;
    left: 24px;
    padding: 10px 24px;
    font-family: var(--board-font);
    font-size: 40px;
    font-weight: 800;
    color: #fff;
    background: rgba(0, 0, 0, 0.7);
    border: 5px solid;
    border-radius: 16px;
    z-index: 15;
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
  .final-label.small {
    top: 24px;
    font-size: 54px;
  }
  .final-sub {
    position: absolute;
    bottom: 80px;
    width: 100%;
    text-align: center;
    font-size: 60px;
    color: #fff;
    font-family: var(--board-font);
    opacity: 0.85;
  }
  .reveal {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 850px;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 50% 40%, #1b27ff, var(--tile) 55%, #020550);
  }
  .spot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    padding: 40px 80px;
    border-radius: 30px;
    border: 8px solid var(--c);
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-family: var(--board-font);
    min-width: 900px;
  }
  .spot-name {
    font-size: 90px;
    font-weight: 900;
    padding: 6px 40px;
    border-radius: 18px;
  }
  .spot-wager {
    font-size: 64px;
  }
  .spot-wager b {
    color: var(--value);
  }
  .spot-result {
    font-size: 90px;
    font-weight: 900;
    padding: 4px 30px;
    border-radius: 14px;
  }
  .spot-result.right {
    background: #1f9d55;
  }
  .spot-result.wrong {
    background: #c53030;
  }
  .spot-score {
    font-family: var(--value-font);
    font-size: 110px;
    font-weight: 900;
    text-shadow: 6px 6px 0 #000;
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
    position: relative;
    z-index: 6;
    font-family: var(--value-font);
    font-size: 110px;
    margin: 0 40px 40px;
    text-align: center;
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
  }
  .end ol {
    position: relative;
    z-index: 6;
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
