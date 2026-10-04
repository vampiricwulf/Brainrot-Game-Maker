<!--
  Everything viewers see, in 1920×1080 stage coordinates. It never renders an answer until
  session.revealed / finalStep === 'answer' (spec §7). Reused by the audience window, the single-window
  stage and the host's mirror in dual mode.
-->
<script lang="ts">
  import { fade, fly, scale } from '../lib/motion.svelte';
  import { textOn } from '../lib/colors';
  import { categoryLabel, finalName, formatPoints, isBoard, isFinal, questionSlides, roundName, textSlide, type ClueRef, type Game, type Session } from '../lib/model';
  import { clueSlideIndex, currentClueInfo, currentFinal, nameList, shownQuestionSlide, places, score, standings, tiedLeaders } from '../lib/session';
  import { onMount, untrack } from 'svelte';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { mediaScope, type MediaRole } from '../lib/mediactl.svelte';
  import { autoPlay } from '../lib/audioout.svelte';
  import { cuesAfter, type Live, type SoundCue, type StageAction } from '../lib/live';
  import { plateCenter } from './flow';
  import { autofit } from '../lib/autofit';
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
  import { boardLayout, STAGE_KEYS, themeStyle } from '../lib/theme';
  import AnsweringPlate from './AnsweringPlate.svelte';
  import QrCode from '../lib/QrCode.svelte';
  import CuePlayer from './CuePlayer.svelte';
  import { soundUrl } from './cues';
  import { JOIN_ROOM, PILL_BAND, TIMER_BAND, TIMER_ROOM } from './stagefit';

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
    ongroupmove,
    ontoken,
    onspace,
    onshopbuy,
    selected = [],
    selectedObjects = [],
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
    /** RPG rounds, host only: an object on the stage was clicked (`toggle`: with Shift or Ctrl, to select it). */
    onobject?: (elId: string, toggle?: boolean) => void;
    /** RPG rounds, host only: an avatar was dragged (to a spot, another screen or a party), or clicked. */
    onavatar?: (playerId: string, drop?: AvatarDrop) => void;
    /** RPG rounds, host only: an object was dragged to a new spot. */
    onobjectmove?: (elId: string, at: { x: number; y: number }) => void;
    /** RPG rounds, host only: an item or currency object was dropped on a player. */
    onpickup?: (elId: string, playerId: string) => void;
    /** RPG rounds, host only: selected players and objects were dragged together to new spots. */
    ongroupmove?: (players: Record<string, { x: number; y: number }>, objects: Record<string, { x: number; y: number }>) => void;
    /** Board-game rounds, host only: a token was clicked, or dragged onto a space or a zone. */
    ontoken?: (playerId: string, to?: { space?: string; zone?: string }) => void;
    /** Board-game rounds, host only: a space was clicked. */
    onspace?: (spaceId: string) => void;
    /** Host only: a ware in the shop on screen was clicked. */
    onshopbuy?: (itemId: string) => void;
    /** Host only: the selected players (the host's copy in dual mode rings them). */
    selected?: string[];
    /** RPG rounds, host only: the objects selected on the stage. */
    selectedObjects?: string[];
  } = $props();
  const act = (a: StageAction) => onact?.(a);

  const info = $derived(currentClueInfo(session, game));
  const finalRound = $derived(currentFinal(session, game));
  /** The Final's category, in the theme's clue text (🎨 Theme → Clue text) like its question and answer. */
  const finalCategorySlide = $derived.by(() => {
    const slide = textSlide(finalRound ? finalRound.category || finalName(finalRound) : '');
    const t = slide.elements[0];
    if (t?.kind === 'text') {
      if (game.theme?.clueFont) t.font = game.theme.clueFont;
      if (game.theme?.clueColor) t.color = game.theme.clueColor;
    }
    return slide;
  });
  const finalLabel = $derived(finalRound ? finalName(finalRound).toUpperCase() : '');
  // With no category the big slide already says the Final's name: no second, smaller one over it.
  const finalLabelShown = $derived(!!finalRound?.category?.trim());
  /** The Final's players whose wager is in (a ✔ on their score plate while wagers are taken). */
  const wagersIn = $derived(
    session.phase === 'final' && session.finalStep === 'wagers' && session.final
      ? session.final.players.filter((id) => typeof session.final?.wagers[id] === 'number')
      : [],
  );
  const stream = $derived(game.settings.stream);
  /** The "Starting soon" countdown's clock (ticks only while there's one). */
  let clock = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => live.soonAt && (clock = Date.now()), 250);
    return () => clearInterval(id);
  });
  // A countdown just started: the clock catches up before it's drawn (not the time since the window opened, for a beat).
  $effect.pre(() => {
    if (live.soonAt) untrack(() => (clock = Date.now()));
  });
  const soonLeft = $derived(live.soonAt ? Math.max(0, Math.ceil((live.soonAt - clock) / 1000)) : null);
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
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
  /** On the board, score pops sit over the score bar. */
  const popsOnBar = $derived(session.phase === 'board' && !session.intro && layout.score ? layout.score : null);
  /** The score bar is at the top of the board: pops hang below the plates' names instead. */
  const barTop = $derived(!!popsOnBar && popsOnBar.top === 0);
  /** A player's pop over their plate (its centre, kept on the stage); null for a group's pop. */
  function popX(playerId: string | undefined): number | null {
    const i = playerId ? session.players.findIndex((p) => p.id === playerId) : -1;
    if (i < 0) return null;
    return Math.min(1920 - POP_HALF, Math.max(POP_HALF, plateCenter(session.players.length, i, barReserve)));
  }
  /** An anchored pop is at most this wide (its name gives way to "…"), so it stays on the stage. */
  const POP_HALF = 300;
  /** The clue's caption is up (bottom left): pops along the foot go above it. */
  const captionUp = $derived(!!stream?.clueCaption && session.phase === 'clue' && session.dd?.stage !== 'splash');
  const decorBehind = $derived((round?.decor ?? []).filter((d) => d.behind));
  const decorAbove = $derived((round?.decor ?? []).filter((d) => !d.behind));
  /** The round's title card, for an RPG, board-game or Final round (a board round has its own, before the tiles fill in). */
  const introName = $derived.by(() => {
    const r = game.rounds[session.currentRound];
    if (session.intro?.stage !== 'title' || session.phase === 'board' || !r) return null;
    return isFinal(r) ? finalName(r) : roundName(r, session.currentRound);
  });
  const answering = $derived(session.phase === 'clue' && !session.dd && live.buzz?.answering ? byId[live.buzz.answering] : undefined);
  /**
   * While the countdown, "Ann is answering" or the Daily Double badge is up over a question, the slide moves down into
   * the room under them (a top band), so they never cover its first line.
   */
  const band = $derived.by(() => {
    const onSlide =
      (session.phase === 'clue' && session.dd?.stage !== 'splash') ||
      (session.phase === 'final' && (session.finalStep === 'question' || session.finalStep === 'answer')) ||
      session.phase === 'tiebreaker';
    if (!onSlide) return 0;
    if (live.timer) return TIMER_BAND;
    return answering || (session.phase === 'clue' && session.dd?.stage === 'question' && ddPlayer) ? PILL_BAND : 0;
  });
  /**
   * A countdown on the board sits at the right end of the score bar (the plates and the join code make room), so it
   * never covers a category or a plate; with no score bar the board moves down under it.
   */
  const timerOnBoard = $derived(!!live.timer && session.phase === 'board' && session.intro?.stage !== 'title');
  const timerBar = $derived(timerOnBoard && layout.score ? layout.score : null);
  const boardDown = $derived(timerOnBoard && !layout.score ? Math.max(0, TIMER_BAND - layout.board.top) : 0);
  const bandScale = $derived(band ? (1080 - band) / 1080 : undefined);
  const keyColor = $derived(game.theme?.stageBg ? STAGE_KEYS[game.theme.stageBg] : undefined);
  // A sound cue plays once, when it arrives. One already old by then (this window was opened or reconnected since it
  // started) stays quiet: an audience window opened mid-game doesn't replay the round intro. Short cues overlap (a
  // right-answer sound isn't cut off by the reveal's), a few at most; the host stopping the sound stops them all. Under
  // the cover nothing new plays, and what's playing waits.
  let heard = '';
  let cues = $state<SoundCue[]>([]);
  $effect(() => {
    const c = live.sound;
    untrack(() => {
      if (!c) return void (cues.length && (cues = []));
      if (c.nonce === heard) return;
      heard = c.nonce;
      if ((c.at && Date.now() - c.at >= 4000) || live.cover) return void (c.cut && (cues = []));
      cues = cuesAfter(cues, c);
    });
  });
  const cueDone = (nonce: string) => (cues = cues.filter((c) => c.nonce !== nonce));
  /** A cue's sound at its volume (🔊 Sounds). */
  function loudness(node: HTMLMediaElement, v: number) {
    node.volume = v;
    return { update: (n: number) => (node.volume = n) };
  }
  /** A cue's sound waits under the cover and goes on after it. */
  function holdWhile(node: HTMLMediaElement, held: boolean) {
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
  // A clue's (or a Final's) media goes on where it was when its slide comes back (the answer hidden again).
  $effect.pre(() => {
    const c = session.currentClue;
    mediaScope(
      session.phase === 'clue' && c
        ? `clue:${c.round}.${c.cat}.${c.row}`
        : session.phase === 'final' || session.phase === 'tiebreaker'
          ? `${session.phase}:${session.currentRound}`
          : '',
    );
  });
  /**
   * Phone buzzers: the join code in a corner while the room is open (unless the host turned it off), kept off the board's
   * tiles: on the board it sits at the end of the score bar (none without one); on clue slides and title cards in the
   * bottom-right corner (the caption is bottom-left); not over a Final, RPG or board game round, a Daily Double (only
   * the player who found it plays it: nobody buzzes), a wheel, dice or roll-off on screen (it showed through their
   * backdrop), or the results.
   */
  const codeSpot = $derived.by((): 'bar' | 'corner' | null => {
    if (!live.room || stream?.hideJoinCode || live.pregame) return null;
    if (introName || (session.phase === 'board' && session.intro?.stage === 'title')) return 'corner';
    if (session.phase === 'board') return layout.score ? 'bar' : null;
    if (session.phase === 'clue') return session.dd ? null : 'corner';
    if (session.phase === 'tiebreaker') return 'corner';
    return null;
  });
  /** The host just opened the buzzers ("When I press U"): a cue on the clue's slide while they're open. */
  const buzzNow = $derived(
    !!live.room && game.settings.buzzArm === 'host' && session.phase === 'clue' && !session.dd && !session.revealed && live.buzz?.phase === 'armed' && !live.overlay,
  );
  /** Under a wheel, dice or roll-off the code goes (its room on the score bar stays: the plates don't move). */
  const codeShown = $derived(!!codeSpot && !live.overlay);
  /** Room kept free at the score bar's right end on the board: the join code's, the countdown's. */
  const barReserve = $derived((codeSpot === 'bar' ? JOIN_ROOM : 0) + (timerBar ? TIMER_ROOM : 0));
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
    <div class="soon" class:has-room={!!live.room}>
      {#if bannerUrl}<img class="card-img" src={bannerUrl} alt="" draggable="false" onerror={imgFallback} />{/if}
      <!-- A long title shrinks to two or three lines instead of pushing the join code off the stage. -->
      <div class="round-name" use:autofit={{ size: live.room ? 110 : 150, min: live.room ? 48 : 64, enabled: true, text: `${game.title}|${!!live.room}` }}>{game.title}</div>
      <div class="soon-text">{live.rematch ? 'Rematch! ' : ''}{stream?.soonText?.trim() || 'Starting soon…'}</div>
      {#if soonLeft !== null}<div class="soon-count">{soonLeft ? mmss(soonLeft) : 'Starting now!'}</div>{/if}
      {#if live.lineup?.length}
        <!-- Who's playing (teams: with the members who joined from their phones). -->
        <ul class="lineup" class:small={live.lineup.length > 6}>
          {#each live.lineup as p, i (i)}
            <li style:--c={p.color}>
              <span class="lineup-name">{p.name}</span>
              {#if p.members?.length}<span class="lineup-members">{p.members.join(', ')}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if live.room}
        <!-- Phone buzzers: viewers who play join from their phone. -->
        <div class="join">
          <QrCode text={live.room.link} size={240} label="QR code to join on your phone" />
          <div class="join-text">
            <div class="join-how">📱 Buzz from your phone</div>
            <div class="join-code">{live.room.code}</div>
            <div class="join-link">{live.room.link.replace(/^https?:\/\//, '')}</div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else if introName}
  <div
    class="full title-card"
    class:clickable={!!onact}
    onclick={() => act('intro')}
    role="presentation"
    in:scale={{ start: 0.3, duration: 600 }}
    out:fade={{ duration: 250 }}
  >
    <div class="round-name">{introName}</div>
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
      <div class="board-bg" style:top="{layout.bg.top}px" style:height="{layout.bg.height}px" style:background={game.theme?.boardImage ? undefined : keyColor}></div>
      {#if decorBehind.length}<div class="layer behind"><DecorLayer items={decorBehind} /></div>{/if}
      {#if layout.banner && bannerUrl}
        <div class="banner" style:top="{layout.banner.top}px" style:height="{layout.banner.height}px">
          <img src={bannerUrl} alt="" draggable="false" style:object-fit={game.theme.bannerFit ?? 'contain'} onerror={imgFallback} />
        </div>
      {/if}
      <div
        class="board-area bar-{bar}"
        class:clickable={!!onact && !!session.intro}
        style:top="{layout.board.top + boardDown}px"
        style:height="{layout.board.height - boardDown}px"
        onclick={() => session.intro && act('intro')}
        role="presentation"
      >
        <Board {game} {session} {onpick} {ontilemenu} />
      </div>
      {#if layout.score}
        <div class="score-area bar-{bar}" style:top="{layout.score.top}px" style:height="{layout.score.height}px">
          <ScoreBar {game} {session} {onpicker} host={!!onact} reserve={barReserve} />
        </div>
      {/if}
      {#if decorAbove.length}<div class="layer above"><DecorLayer items={decorAbove} /></div>{/if}
    </div>
  {/if}
{:else if session.phase === 'clue' && info}
  {#if session.dd?.stage === 'splash'}
    <!-- The background fills the stage at once; only what's on it spins in (no black corners). -->
    <div class="full dd">
      <div class="dd-in" in:scale={{ start: 0.05, duration: 700 }}>
        <div class="dd-text">DAILY<br />DOUBLE!</div>
        {#if ddPlayer}
          <div class="dd-player" style:background={ddPlayer.color} style:color={textOn(ddPlayer.color)}>{ddPlayer.name}</div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- A wheel or dice tile's question waits for its tool to close (it would show through), then comes in with its countdown. -->
    {@const waiting = live.overlay?.kind === info.clue.type && !session.revealed}
    <!-- The question slide the host is on (a clue can have several: the first one zooms in, the next ones come in quietly). -->
    {@const at = clueSlideIndex(session, info.clue)}
    {@const quiet = session.revealed || at > 0}
    {#key `${info.clue.id}-${session.revealed}-${waiting}-${at}`}
      <div
        class="full"
        class:clickable={!!onact}
        onclick={() => act(session.revealed ? 'back' : 'reveal')}
        role="presentation"
        data-slide={session.revealed ? 'answer' : at + 1}
        in:scale={{ start: quiet ? 0.98 : 0.15, duration: quiet ? 200 : 450 }}
      >
        {#if !waiting}<div class="slide-area" style:scale={bandScale}><SlideView slide={session.revealed ? info.clue.answerSlide : shownQuestionSlide(session, info.clue)} {role} /></div>{/if}
      </div>
    {/key}
    <!-- A clue with several question slides: where it is (● ● ○), so viewers know there's more to come. -->
    {@const of = questionSlides(info.clue).length}
    {#if of > 1 && !session.revealed && !waiting}
      <div class="pips" role="img" aria-label="Slide {at + 1} of {of}" data-slide-pips>
        {#each { length: of } as _, i (i)}<span class:on={i <= at}></span>{/each}
      </div>
    {/if}
    {#if stream?.clueCaption && !waiting}
      <!-- (With the slide pips showing, it stops short of them: 24px in, 22px padding a side, a 16px gap; with the join
           code in the corner, short of that, about 420px wide.) -->
      {@const pipsMax = of > 1 && !session.revealed ? 960 - (50 * of + 22) / 2 - 24 - 44 - 16 : 1500}
      {@const captionMax = `${Math.min(pipsMax, codeShown && live.room && codeSpot === 'corner' ? 1920 - 24 - 44 - 16 - 420 - 24 : 1500)}px`}
      <div class="caption" style:max-width={captionMax}>{categoryLabel(info.category)} · {session.dd ? 'Daily Double' : formatPoints(info.value, sym)}</div>
    {/if}
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
        session.finalStep === 'question' ? act('reveal') : session.finalStep === 'answer' ? act('final-next') : undefined}
      role="presentation"
      in:fade={{ duration: 400 }}
    >
      {#if session.finalStep === 'wagers'}
        {#if finalLabelShown}<div class="final-label">{finalLabel}</div>{/if}
        <SlideView slide={finalCategorySlide} />
        <div class="final-sub">Make your wagers…</div>
        <!-- The scores stay up while players decide what to wager (a ✔ once a wager is in). -->
        <div class="score-area"><ScoreBar {game} {session} host={!!onact} lit={null} ticks={wagersIn} /></div>
      {:else if session.finalStep === 'question'}
        {#if finalRound}
          {@const fAt = clueSlideIndex(session, finalRound)}
          {@const fOf = questionSlides(finalRound).length}
          <div class="slide-area" style:scale={bandScale} data-slide={fAt + 1}><SlideView slide={shownQuestionSlide(session, finalRound)} {role} /></div>
          <!-- Several question slides: where it is (● ○), as on a clue. -->
          {#if fOf > 1}
            <div class="pips" role="img" aria-label="Slide {fAt + 1} of {fOf}" data-slide-pips>
              {#each { length: fOf } as _, i (i)}<span class:on={i <= fAt}></span>{/each}
            </div>
          {/if}
        {/if}
      {:else if session.finalStep === 'answer'}
        {#if finalRound}<div class="slide-area" style:scale={bandScale}><SlideView slide={finalRound.answerSlide} {role} /></div>{/if}
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
                  <!-- (No wager in yet: it stays ??? until the host types it, never $0.) -->
                  {#if f.shown[spotlight.id] && typeof f.wagers[spotlight.id] === 'number'}
                    Wagered <b>{formatPoints(f.wagers[spotlight.id], sym)}</b>
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
          <ScoreBar {game} {session} onpicker={onspotlight} hint="Click to spotlight this player (right-click: judge them)" host={!!onact} lit={session.final?.current ?? null} />
        </div>
      {/if}
    </div>
  {/key}
{:else if session.phase === 'rpg'}
  <RpgStage {game} {session} {role} {selected} {selectedObjects} {onobject} {onavatar} {onobjectmove} {onpickup} {ongroupmove} />
{:else if session.phase === 'boardgame'}
  <BoardGameStage {game} {session} {role} {selected} {ontoken} {onspace} />
{:else if session.phase === 'tiebreaker' && game.tiebreaker}
  {@const tb = game.tiebreaker}
  {@const tbAt = clueSlideIndex(session, tb)}
  {@const tbOf = questionSlides(tb).length}
  {#key `${session.tiebreakerRevealed}-${tbAt}`}
    <div
      class="full"
      class:clickable={!!onact && !session.tiebreakerRevealed}
      onclick={() => !session.tiebreakerRevealed && act('reveal')}
      role="presentation"
      data-slide={session.tiebreakerRevealed ? 'answer' : tbAt + 1}
      in:fade={{ duration: 300 }}
    >
      <div class="slide-area" style:scale={bandScale}><SlideView slide={session.tiebreakerRevealed ? tb.answerSlide : shownQuestionSlide(session, tb)} {role} /></div>
      <div class="final-label small">TIEBREAKER</div>
    </div>
  {/key}
  <!-- Several question slides: where it is (● ● ○), as on a clue. -->
  {#if tbOf > 1 && !session.tiebreakerRevealed}
    <div class="pips" role="img" aria-label="Slide {tbAt + 1} of {tbOf}" data-slide-pips>
      {#each { length: tbOf } as _, i (i)}<span class:on={i <= tbAt}></span>{/each}
    </div>
  {/if}
{:else if session.phase === 'end'}
  {@const ranked = places(session)}
  <!-- Everything's at full size while it fits (6 places); with more, it shrinks just enough for the last one to show. -->
  {@const k = Math.min(1, 1040 / (300 + 120 * ranked.length))}
  {@const heading = tieOpen
    ? `Tie for first: ${nameList(winners.map((w) => w.name))}!`
    : winners.length > 1
      ? `It's a tie: ${nameList(winners.map((w) => w.name))}!`
      : winners.length
        ? `${winners[0].name} wins!`
        : 'Game over'}
  <div class="full end" in:fade={{ duration: 500 }} style:--k={k}>
    {#if !tieOpen}<Confetti colors={[...winners.map((w) => w.color), game.theme?.value ?? '#ffcc00', '#ffffff']} keepOut={{ left: 410, right: 1510 }} />{/if}
    <!-- Long names (a tie of two) shrink the heading instead of pushing the last places off the bottom. -->
    <h1 use:autofit={{ size: Math.round(110 * k), min: Math.round(44 * k), enabled: true, text: heading }}><span dir="auto">{heading}</span></h1>
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
  <TimerDisplay timer={live.timer} middle={timerBar ? timerBar.top + timerBar.height / 2 : undefined} />
{/if}

{#if answering}
  <AnsweringPlate player={answering} by={live.buzz?.by} />
{/if}

{#if live.overlay}
  <ToolOverlay o={live.overlay} {game} {session} {role} onclick={onact ? () => act('overlay') : undefined} {onshopbuy} />
{/if}

<!--
  On the board a player's pop sits on their plate's name, above its score (a group's in the middle of the bar);
  elsewhere they sit near the foot of the stage.
-->
<div
  class="pops"
  style:top={popsOnBar ? `${barTop ? popsOnBar.top + popsOnBar.height - 30 : popsOnBar.top + 30}px` : undefined}
  style:bottom={popsOnBar ? undefined : captionUp ? '130px' : '40px'}
  class:on-bar={!!popsOnBar}
  class:bar-top={barTop}
>
  {#each live.pops as p (p.id)}
    {@const at = popsOnBar ? popX(p.playerId) : null}
    <div
      class="pop"
      class:anchored={at !== null}
      style:left={at !== null ? `${at}px` : undefined}
      style:background={p.color}
      style:color={textOn(p.color)}
      in:fly={{ y: barTop ? -60 : 60, duration: 250 }}
      out:fade
    >
      {#if p.who}<span class="who">{p.who}</span> <span class="amt">{p.amount}</span>{:else}<span class="who">{p.text}</span>{/if}
    </div>
  {/each}
</div>

{#if codeShown && live.room}
  <div
    class="join-badge"
    class:on-bar={codeSpot === 'bar'}
    style:top={codeSpot === 'bar' && layout.score ? `${layout.score.top + layout.score.height / 2}px` : undefined}
    style:right={codeSpot === 'bar' && timerBar ? `${24 + TIMER_ROOM}px` : undefined}
  >
    <!-- Nobody new can join (seats locked, or all taken): it doesn't invite everyone watching, it's the players' code. -->
    <span class="jb-how">{live.room.closed ? '📱 Players’ buzzers' : '📱 Buzz in'}</span>
    <span class="jb-code">{live.room.code}</span>
    <!-- In the corner there's room for where to go, too. -->
    {#if codeSpot === 'corner' && !live.room.closed}<span class="jb-link">{live.room.link.replace(/^https?:\/\//, '').replace(/\/[^/]*$/, '')}</span>{/if}
  </div>
{/if}

<!-- Buzzers opened by the host (📱 Phone buzzers: "When I press U"): viewers see it, a light around the stage and a
     moment's "🔔 Buzz now!". -->
{#if buzzNow}
  <div class="buzz-now" data-buzz-now aria-hidden="true">
    {#key live.buzz?.armId}<div class="bn-pill" in:scale={{ start: 0.6, duration: 250 }}>🔔 Buzz now!</div>{/key}
  </div>
{/if}

<!-- Panic button: viewers see only the cover card (the host's copy shows it faded, to keep working underneath). -->
{#if live.cover}
  <div class="cover" class:host={role === 'mirror'}>
    <div class="cover-in">
      {#if bannerUrl}<img class="card-img" src={bannerUrl} alt="" draggable="false" onerror={imgFallback} />{/if}
      <div class="cover-card"><span class="pause" aria-hidden="true"></span>{stream?.coverText?.trim() || 'Be right back'}</div>
      {#if live.room && !stream?.hideJoinCode}
        <div class="cover-join">{live.room.closed ? '📱 Players’ buzzers' : '📱 Buzz from your phone'}: <b>{live.room.code}</b> · {live.room.link.replace(/^https?:\/\//, '')}</div>
      {/if}
    </div>
  </div>
{/if}

<!-- Game sound cues: played (and reported if the browser blocks it) where the sound belongs, never in the host's mirror. -->
{#if role !== 'mirror'}
  {#each cues as c (c.nonce)}
    {@const url = soundUrl(c.media) ?? soundUrl(c.fallback)}
    {#if url}
      <audio use:loudness={c.volume ?? 1} use:autoPlay={url} use:holdWhile={!!live.cover} onended={() => cueDone(c.nonce)}></audio>
    {/if}
  {/each}
{/if}
<!-- The dice, wheel and board-move sounds, timed with the animations. -->
{#if role !== 'mirror'}<CuePlayer {game} {session} {live} />{/if}
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
  .cover-join {
    font-family: var(--board-font);
    font-size: 44px;
    font-weight: 700;
    color: #fff;
    text-shadow: 3px 3px 0 #000;
  }
  .cover-join b {
    letter-spacing: 0.12em;
  }
  /* The join code, small, in a corner (or at the end of the score bar on the board). */
  .join-badge {
    position: absolute;
    right: 24px;
    bottom: 24px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 18px;
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    /* The board's fonts, as the clue caption across from it and the Starting soon card's code. */
    font-family: var(--board-font);
    line-height: 1.1;
    pointer-events: none;
  }
  .join-badge.on-bar {
    bottom: auto;
    transform: translateY(-50%);
  }
  .jb-how {
    font-size: 32px;
    font-weight: 700;
  }
  .jb-code {
    font-family: var(--value-font);
    font-size: 48px;
    letter-spacing: 0.12em;
    color: var(--value);
  }
  .jb-link {
    font-size: 22px;
    opacity: 0.85;
  }
  /* Buzzers open: a light around the stage, and "🔔 Buzz now!" for a moment (it fades, the light stays). */
  .buzz-now {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    box-shadow: inset 0 0 0 10px var(--value, #ffcc00), inset 0 0 60px 20px color-mix(in srgb, var(--value, #ffcc00) 55%, transparent);
    animation: bn-glow 1.4s ease-in-out infinite alternate;
  }
  .bn-pill {
    position: absolute;
    top: 30px;
    left: 50%;
    translate: -50% 0;
    padding: 10px 36px;
    border-radius: 999px;
    background: var(--value, #ffcc00);
    color: #000;
    font: 64px 'Anton', 'Oswald', sans-serif;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
    animation: bn-out 0.5s ease-in 2s forwards;
  }
  @keyframes bn-glow {
    from {
      opacity: 0.55;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes bn-out {
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .buzz-now {
      animation: none;
    }
  }
  .cover.host {
    opacity: 0.35;
    pointer-events: none;
  }
  .cover-in {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 50px;
  }
  .cover-card {
    display: flex;
    align-items: center;
    gap: 50px;
    padding: 0 60px;
    font: 120px 'Anton', 'Oswald', sans-serif;
    color: var(--value);
    text-align: center;
    text-shadow: 6px 6px 0 #000;
  }
  /* Two bars, drawn: the ⏸ character is thin or missing in many fonts. */
  .pause {
    flex: none;
    width: 90px;
    height: 110px;
    background: linear-gradient(to right, currentColor 0 34%, transparent 34% 66%, currentColor 66%);
    filter: drop-shadow(6px 6px 0 #000);
  }
  .card-img {
    max-width: 1400px;
    max-height: 300px;
    object-fit: contain;
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
    background: var(--board-image, none) center / cover no-repeat, var(--board-bg, var(--board-gap));
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
  /* A slide, moved down under a top band when there's something over its top (see band). */
  .slide-area {
    position: absolute;
    inset: 0;
    /* Its own layer: however high a slide item is stacked, it stays under the stream's join code, Buzz now! frame,
       caption, pops, tools and cover (as it does while shifted down). */
    isolation: isolate;
    transform-origin: 50% 100%;
    transition: scale 0.3s ease;
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
    max-width: 1800px;
    max-height: 330px;
    overflow: hidden;
    box-sizing: border-box;
  }
  .soon.has-room .round-name {
    max-height: 230px;
  }
  /* Everything else keeps its size; the banner gives way if it still doesn't fit the stage's height. */
  .soon {
    max-height: 1060px;
  }
  .soon > * {
    flex-shrink: 0;
  }
  .soon > .card-img {
    flex-shrink: 1;
    min-height: 0;
  }
  .soon.has-room {
    gap: 28px;
  }
  .soon.has-room .round-name {
    font-size: 110px;
  }
  .join {
    display: flex;
    align-items: center;
    gap: 40px;
    padding: 24px 36px;
    border-radius: 24px;
    background: rgba(0, 0, 0, 0.55);
  }
  .join-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #fff;
    font-family: var(--board-font);
  }
  .join-how {
    font-size: 44px;
    font-weight: 800;
  }
  .join-code {
    font-family: var(--value-font);
    font-size: 120px;
    letter-spacing: 0.12em;
    line-height: 1;
    color: var(--value);
  }
  .join-link {
    font-size: 36px;
  }
  .lineup {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 14px 18px;
    max-width: 1700px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lineup li {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 520px;
    padding: 8px 26px;
    border-radius: 14px;
    border-bottom: 6px solid var(--c);
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-family: var(--board-font);
  }
  .lineup-name {
    font-size: 44px;
    font-weight: 800;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lineup-members {
    font-size: 26px;
    opacity: 0.85;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lineup.small .lineup-name {
    font-size: 32px;
  }
  /* With the phones' join code too, everything fits the stage's height: a smaller banner and lineup, closer together. */
  .soon.has-room:has(.lineup) {
    gap: 20px;
  }
  .soon.has-room .card-img {
    max-height: 180px;
  }
  .soon.has-room .lineup li {
    padding: 4px 20px;
  }
  .soon.has-room .lineup-name {
    font-size: 32px;
  }
  .soon.has-room .lineup-members {
    font-size: 20px;
  }
  .soon-text,
  .soon-count {
    font-family: var(--board-font);
    font-size: 70px;
    font-weight: 800;
    color: var(--stage-text, #fff);
    text-align: center;
    padding: 0 60px;
    text-shadow: 5px 5px 0 #000;
  }
  .soon-count {
    font-family: var(--value-font);
    font-size: 110px;
    color: var(--value);
    font-variant-numeric: tabular-nums;
  }
  .dd {
    display: grid;
    place-items: center;
    background: radial-gradient(circle, #ff3dcb 0%, #7a00ff 35%, var(--tile) 70%);
  }
  .dd-in {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
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
    color: var(--dd-text, var(--value));
    text-align: center;
    text-shadow: 12px 12px 0 #000;
    -webkit-text-stroke: 5px #000;
    paint-order: stroke fill;
  }
  .dd-player {
    max-width: 1700px;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    /* Above the score bar. */
    bottom: 250px;
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
    /* Dark enough for white words on any tile color (Pastel's pink too), compressed. */
    background: rgba(0, 0, 0, 0.78);
    color: #fff;
    font-family: var(--board-font);
    min-width: 900px;
  }
  .spot-name {
    max-width: 1700px;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    /* In the middle of the stage (a game of two leaves no empty bottom half). */
    justify-content: safe center;
    padding: calc(50px * var(--k)) 0;
    box-sizing: border-box;
    color: #fff;
    background: radial-gradient(circle at 50% 30%, var(--tile-light), var(--tile) 45%, var(--tile-dark));
  }
  .end h1 {
    position: relative;
    z-index: 6;
    font-family: var(--value-font);
    font-size: calc(110px * var(--k));
    line-height: 1.15;
    /* One line at full size, or two smaller ones: never more. */
    height: calc(160px * var(--k));
    width: 1840px;
    flex: none;
    display: flex;
    align-items: center;
    overflow: hidden;
    margin: 0 0 calc(40px * var(--k));
    text-align: center;
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
  }
  .end h1 span {
    display: block;
    width: 100%;
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
    background: rgba(0, 0, 0, 0.72);
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
    /* A long name stays on one line (the rows are measured as one line each), cut with "…". */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sc {
    margin-left: auto;
    font-family: var(--value-font);
  }
  .pops {
    position: absolute;
    left: 0;
    right: 0;
    padding: 0 24px;
    display: flex;
    flex-wrap: wrap-reverse;
    gap: 20px;
    justify-content: center;
    pointer-events: none;
    /* Over the clue's caption, the timer's band and the answering plate's. */
    z-index: 17;
  }
  .pops.on-bar {
    transform: translateY(-100%);
    align-items: flex-end;
  }
  .pops.on-bar.bar-top {
    transform: none;
    align-items: flex-start;
  }
  /* Over its player's plate. */
  .pop.anchored {
    position: absolute;
    translate: -50% 0;
    max-width: 600px;
  }
  /* A long name gives way ("…"); the points always show. */
  .who {
    display: inline-block;
    max-width: 1400px;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }
  .anchored .who {
    max-width: 280px;
  }
  .on-bar .pop.anchored {
    bottom: 0;
  }
  .on-bar.bar-top .pop.anchored {
    top: 0;
    bottom: auto;
  }
  /* Big enough to count on a scaled-down stream; level with the caption beside it. */
  .pips {
    position: absolute;
    left: 50%;
    bottom: 31px;
    transform: translateX(-50%);
    z-index: 15;
    display: flex;
    gap: 18px;
    padding: 12px 20px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .pips span {
    width: 32px;
    height: 32px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 4px solid #fff;
    opacity: 0.8;
  }
  .pips span.on {
    background: #fff;
    opacity: 1;
  }
  .caption {
    position: absolute;
    left: 24px;
    bottom: 24px;
    z-index: 15;
    padding: 8px 22px;
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-family: var(--board-font);
    font-size: 44px;
    font-weight: 800;
    text-transform: uppercase;
    pointer-events: none;
    max-width: 1500px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pop {
    max-width: 100%;
    box-sizing: border-box;
    white-space: nowrap;
    font-family: var(--value-font);
    font-size: 60px;
    font-weight: 800;
    padding: 10px 34px;
    border-radius: 16px;
    border: 5px solid #fff;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }
</style>
