<!--
  Everything viewers see, in 1920×1080 stage coordinates. It never renders an answer until
  session.revealed / finalStep === 'answer' (spec §7). Reused by the audience window, the single-window
  stage and the host's mirror in dual mode.
-->
<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { textOn } from '../lib/colors';
  import { finalName, formatPoints, isBoard, textSlide, type ClueRef, type Game, type Session } from '../lib/model';
  import { currentClueInfo, currentFinal, nameList, places, score, standings, tiedLeaders } from '../lib/session';
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
  import RpgStage from './rpg/RpgStage.svelte';
  import BoardGameStage from './boardgame/BoardGameStage.svelte';
  import DecorLayer from './DecorLayer.svelte';
  import type { AvatarDrop } from './rpg/hostops';
  import { boardLayout, themeStyle } from '../lib/theme';

  let {
    game,
    session,
    live,
    role = 'single',
    onpick,
    ontilemenu,
    onpicker,
    onspotlight,
    onact,
    onobject,
    onavatar,
    onobjectmove,
    onpickup,
    ontoken,
    onspace,
    onshopbuy,
    selected = [],
  }: {
    game: Game;
    session: Session;
    live: Live;
    /** single: one-window mode · mirror: host's copy in dual mode (muted) · audience: the stream window */
    role?: MediaRole;
    onpick?: (ref: ClueRef) => void;
    /** Host only: a tile was right-clicked (its menu: open it, skip it, put it back). */
    ontilemenu?: (e: MouseEvent, ref: ClueRef) => void;
    onpicker?: (id: string) => void;
    /** Host only, in the Final reveals: a score plate was clicked (spotlight that player). */
    onspotlight?: (id: string) => void;
    /** Host clicked the stage (only passed in the host's window, never the audience window). */
    onact?: (a: StageAction) => void;
    /** RPG rounds, host only: an object on the stage was clicked. */
    onobject?: (elId: string) => void;
    /** RPG rounds, host only: an avatar was dragged (to a spot, another screen or a party), or clicked. */
    onavatar?: (playerId: string, drop?: AvatarDrop) => void;
    /** RPG rounds, host only: an object was dragged to a new spot. */
    onobjectmove?: (elId: string, at: { x: number; y: number }) => void;
    /** RPG rounds, host only: an item or currency object was dropped on a player. */
    onpickup?: (elId: string, playerId: string) => void;
    /** Board-game rounds, host only: a token was clicked, or dragged onto a space or a zone. */
    ontoken?: (playerId: string, to?: { space?: string; zone?: string }) => void;
    /** Board-game rounds, host only: a space was clicked. */
    onspace?: (spaceId: string) => void;
    /** Host only: a ware in the shop on screen was clicked. */
    onshopbuy?: (itemId: string) => void;
    /** Host only: the selected players (the host's copy in dual mode rings them). */
    selected?: string[];
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
  const ties = $derived(tiedLeaders(session));
  /** A tie for first the host hasn't settled yet (roll-off, tiebreaker clue or co-winners): nobody has won so far. */
  const tieOpen = $derived(!!ties.length && !session.coWinners);
  const winners = $derived.by(() => {
    if (ties.length) return ties;
    const top = standings(session)[0];
    return top ? [top.player] : [];
  });
</script>

<div class="theme" style={themeCss}>
{#if live.pregame}
  <!-- The host is still on the pre-game screen. -->
  <div class="full title-card" in:fade={{ duration: 300 }}>
    <div class="soon">
      <div class="round-name">{game.title}</div>
      <div class="soon-text">Starting soon…</div>
    </div>
  </div>
{:else if session.phase === 'board'}
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
        <Board {game} {session} {onpick} {ontilemenu} />
      </div>
      {#if layout.score}
        <div class="score-area bar-{bar}" style:top="{layout.score.top}px" style:height="{layout.score.height}px"><ScoreBar {game} {session} {onpicker} host={!!onact} /></div>
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
    <!-- A wheel or dice tile's question waits for its tool to close (it would show through), then comes in with its countdown. -->
    {@const waiting = live.overlay?.kind === info.clue.type && !session.revealed}
    {#key `${info.clue.id}-${session.revealed}-${waiting}`}
      <div
        class="full"
        class:clickable={!!onact}
        onclick={() => act(session.revealed ? 'back' : 'reveal')}
        role="presentation"
        in:scale={{ start: session.revealed ? 0.98 : 0.15, duration: session.revealed ? 200 : 450 }}
      >
        {#if !waiting}<SlideView slide={session.revealed ? info.clue.answerSlide : info.clue.questionSlide} {role} />{/if}
      </div>
    {/key}
    {#if session.dd?.stage === 'question' && ddPlayer}
      <div class="dd-badge" style:border-color={ddPlayer.color}>
        <span style:color={ddPlayer.color}>{ddPlayer.name}</span> · Daily Double{#if session.dd.shown}{` · ${formatPoints(session.dd.wager ?? 0, sym)}`}{/if}
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
        <div class="score-area">
          <ScoreBar {game} {session} onpicker={onspotlight} hint="Click to spotlight this player (right-click: judge them)" host={!!onact} />
        </div>
      {/if}
    </div>
  {/key}
{:else if session.phase === 'rpg'}
  <RpgStage {game} {session} {role} {selected} {onobject} {onavatar} {onobjectmove} {onpickup} />
{:else if session.phase === 'boardgame'}
  <BoardGameStage {game} {session} {role} {selected} {ontoken} {onspace} />
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
  {@const ranked = places(session)}
  <!-- The tiebreaker line takes a row's room. -->
  <div class="full end" in:fade={{ duration: 500 }} style:--n={ranked.length + (tieOpen ? 1 : 0)}>
    {#if !tieOpen}<Confetti colors={[...winners.map((w) => w.color), game.theme?.value ?? '#ffcc00', '#ffffff']} />{/if}
    <h1>
      {#if tieOpen}
        Tie for first: {nameList(winners.map((w) => w.name))}!
      {:else if winners.length > 1}
        It's a tie: {nameList(winners.map((w) => w.name))}!
      {:else if winners.length}
        {winners[0].name} wins!
      {:else}
        Game over
      {/if}
    </h1>
    {#if tieOpen}<div class="end-sub">Tiebreaker coming up…</div>{/if}
    <ol>
      {#each ranked as { player, score: s, place }, i (player.id)}
        <li style:--c={player.color} in:fly={{ y: 60, delay: 300 + (ranked.length - i) * 250, duration: 500 }}>
          <span class="rank">{place}</span>
          <span class="nm" style:background={player.color} style:color={textOn(player.color)}>{player.name}</span>
          <span class="sc">{formatPoints(s, sym)}</span>
        </li>
      {/each}
    </ol>
  </div>
{/if}

{#if live.timer && (session.phase === 'clue' || session.phase === 'final' || session.phase === 'tiebreaker' || session.phase === 'board' || session.phase === 'rpg' || session.phase === 'boardgame')}
  <TimerDisplay timer={live.timer} />
{/if}

{#if live.overlay}
  <ToolOverlay o={live.overlay} {game} {session} {role} onclick={onact ? () => act('overlay') : undefined} {onshopbuy} />
{/if}

<div class="pops" style:bottom={session.phase === 'board' ? '270px' : '40px'}>
  {#each live.pops as p (p.id)}
    <div class="pop" style:background={p.color} style:color={textOn(p.color)} in:fly={{ y: 80, duration: 250 }} out:fade>
      {p.text}
    </div>
  {/each}
</div>

<!-- Panic button: viewers see only the cover card (the host's copy shows it faded, to keep working underneath). -->
{#if live.cover}
  <div class="cover" class:host={role === 'mirror'}>
    <div class="cover-card">⏸ Be right back</div>
  </div>
{/if}

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
    /* The theme's tile color, lighter and darker: the glow behind title cards, reveals and the end screen. */
    --tile-light: color-mix(in srgb, var(--tile) 88%, white);
    --tile-dark: color-mix(in srgb, var(--tile) 35%, black);
  }
  .cover {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: radial-gradient(circle, var(--tile-light), #000);
  }
  .cover.host {
    opacity: 0.35;
    pointer-events: none;
  }
  .cover-card {
    font: 120px 'Anton', 'Oswald', sans-serif;
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
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
    background: radial-gradient(circle at 50% 45%, var(--tile-light), var(--tile) 50%, var(--tile-dark));
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
  .soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 50px;
  }
  .soon .round-name {
    font-size: 150px;
  }
  .soon-text {
    font-family: var(--board-font);
    font-size: 70px;
    font-weight: 800;
    color: var(--stage-text, #fff);
    text-shadow: 5px 5px 0 #000;
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
    color: var(--stage-text, #fff);
    font-family: var(--board-font);
  }
  .reveal {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 850px;
    /* Room for the round's label above the spotlight card. */
    padding-top: 110px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 50% 40%, var(--tile-light), var(--tile) 55%, var(--tile-dark));
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
    /* Up to 6 players fit at full size; with more, everything shrinks so the last one stays on screen. */
    --k: min(1, calc(6 / var(--n, 1)));
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: calc(70px * var(--k));
    color: #fff;
    background: radial-gradient(circle at 50% 30%, var(--tile-light), var(--tile) 45%, var(--tile-dark));
  }
  .end h1 {
    position: relative;
    z-index: 6;
    font-family: var(--value-font);
    font-size: calc(110px * var(--k));
    margin: 0 40px calc(40px * var(--k));
    text-align: center;
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
  }
  .end-sub {
    position: relative;
    z-index: 6;
    margin: calc(-20px * var(--k)) 0 calc(30px * var(--k));
    font-family: var(--board-font);
    font-size: calc(56px * var(--k));
    font-weight: 800;
    text-shadow: 4px 4px 0 #000;
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
    gap: calc(16px * var(--k));
  }
  .end li {
    display: flex;
    align-items: center;
    gap: 24px;
    font-size: calc(56px * var(--k));
    font-weight: 800;
    font-family: var(--board-font);
    background: rgba(0, 0, 0, 0.35);
    border-left: 14px solid var(--c);
    padding: calc(10px * var(--k)) 24px;
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
