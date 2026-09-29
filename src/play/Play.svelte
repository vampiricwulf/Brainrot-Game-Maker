<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { newId, type ClueRef } from '../lib/model';
  import {
    applyScore, backToBoard, clueReason, currentClueInfo, finalNext, goToRound, openClue, redo, reveal, undo,
  } from '../lib/session';
  import Stage from '../lib/Stage.svelte';
  import PlayerList from '../editor/PlayerList.svelte';
  import AudienceView from './AudienceView.svelte';
  import HostPanel from './HostPanel.svelte';
  import ScoreLog from './ScoreLog.svelte';
  import HostInfo from './HostInfo.svelte';
  import { audience, closeAudienceWindow, openAudienceWindow, pushGame, pushLive, pushSession } from '../lib/sync.svelte';

  let { onexit }: { onexit: () => void } = $props();

  // Play is only mounted when these exist.
  const game = $derived(app.playGame!);
  const session = $derived(app.session!);

  let selected = $state<string[]>([]);
  let amount = $state<number | null>(null);
  let showLog = $state(false);
  let showPlayers = $state(false);
  let hideControls = $state(false);
  let pickerPending = false;

  const sym = $derived(game.settings.currencySymbol);
  const dual = $derived(audience.open);

  // Mirror state to the audience window whenever it changes.
  $effect(() => {
    const g = $state.snapshot(game);
    if (audience.open) pushGame(g);
  });
  $effect(() => {
    const s = $state.snapshot(session);
    if (audience.open) pushSession(s);
  });
  $effect(() => {
    const l = $state.snapshot(app.live);
    if (audience.open) pushLive(l);
  });

  function toggleAudience(): void {
    if (audience.open) closeAudienceWindow();
    else if (!openAudienceWindow()) toast('The browser blocked the popup. Allow popups for this file and try again.', 5000);
  }

  function pop(text: string, color: string): void {
    const p = { id: newId(), text, color };
    app.live.pops.push(p);
    setTimeout(() => (app.live.pops = app.live.pops.filter((x) => x.id !== p.id)), 2200);
  }

  function reasonNow(): string {
    if (session.phase === 'clue' && session.currentClue) return clueReason(game, session.currentClue);
    if (session.phase === 'final') return 'Final Jeopardy';
    return 'Adjustment';
  }

  function award(sign: 1 | -1, ids = selected, amt = amount): void {
    if (!ids.length || !amt) return;
    const events = applyScore(session, game, ids, sign * Math.abs(amt), reasonNow(), info?.clue.id);
    for (const e of events) {
      const p = session.players.find((x) => x.id === e.playerId);
      if (p) pop(`${p.name} ${e.delta > 0 ? '+' : '−'}${sym}${Math.abs(e.delta).toLocaleString()}`, p.color);
    }
    // Awarding control of the board follows TV rules: the last correct player picks next.
    if (game.settings.pickerFollowsAward !== false && sign > 0 && ids.length === 1) session.currentPickerId = ids[0];
    selected = [];
  }

  const info = $derived(currentClueInfo(session, game));

  function pick(ref: ClueRef): void {
    openClue(session, ref);
    selected = [];
    amount = currentClueInfo(session, game)?.value ?? null;
  }

  function back(): void {
    backToBoard(session, game);
    selected = [];
    amount = null;
  }

  function doUndo(): void {
    const e = undo(session);
    if (e) toast(`Undid ${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)} (${session.players.find((p) => p.id === e.playerId)?.name ?? '?'})`);
  }

  function doRedo(): void {
    if (redo(session)) toast('Redone');
  }

  function start(): void {
    if (!session.players.length) {
      toast('Add at least one player');
      return;
    }
    app.pregame = false;
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  function onkey(e: KeyboardEvent): void {
    if (app.pregame || showPlayers) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      doRedo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^[1-9]$/.test(e.key)) {
      const p = session.players[+e.key - 1];
      if (!p) return;
      if (pickerPending) session.currentPickerId = p.id;
      else selected = selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id];
      pickerPending = false;
      return;
    }
    pickerPending = false;

    switch (k) {
      case 'enter':
        award(e.shiftKey ? -1 : 1);
        break;
      case 'r':
        reveal(session);
        break;
      case 'escape':
      case 'b':
        if (showLog) showLog = false;
        else if (session.phase === 'clue') back();
        break;
      case 'n':
        if (session.phase === 'final') finalNext(session);
        break;
      case 'p':
        pickerPending = true;
        break;
      case 'l':
        showLog = !showLog;
        break;
      case 'h':
        hideControls = !hideControls;
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'a':
        toggleAudience();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onkey} />

{#if app.pregame}
  <div class="pregame">
    <h1>{game.title}</h1>
    <p class="muted">Confirm who's playing. Names, colors, and starting scores can be changed here or during the game.</p>
    <PlayerList bind:players={session.players} max={game.settings.maxPlayers} showScores />
    <div class="row actions">
      <button class="ghost" onclick={onexit}>◀ Back to editor</button>
      <button class="primary big" onclick={start}>Start game ▶</button>
    </div>
    <div class="modes">
      <button class="mode" class:on={!dual} onclick={() => dual && closeAudienceWindow()}>
        <b>Single window</b>
        <span class="muted">Viewers see this window. Press H to hide the host controls.</span>
      </button>
      <button class="mode" class:on={dual} onclick={() => !dual && toggleAudience()}>
        <b>📺 Separate audience window</b>
        <span class="muted">Capture the audience window in OBS. This window shows answers and controls, for your eyes only.</span>
      </button>
    </div>
  </div>
{:else}
  <div class="play" class:hidden={hideControls}>
    <div class="stage-area" class:dual>
      <div class="stage-box">
        <Stage>
          <AudienceView
            {game}
            {session}
            live={app.live}
            role={dual ? 'mirror' : 'single'}
            onpick={pick}
            onpicker={(id) => (session.currentPickerId = session.currentPickerId === id ? undefined : id)}
          />
        </Stage>
      </div>
      {#if dual}
        <HostInfo {game} {session} />
      {/if}
    </div>
    {#if hideControls}
      <button class="show-controls" onclick={() => (hideControls = false)} title="H">Show controls</button>
    {:else}
      <HostPanel
        {game}
        {session}
        bind:selected
        bind:amount
        onaward={(s) => award(s)}
        onwrong={(id) => award(-1, [id], info?.value ?? 0)}
        onreveal={() => reveal(session)}
        onback={back}
        onundo={doUndo}
        onredo={doRedo}
        onnextround={() => goToRound(session, game, session.currentRound + 1)}
        onprevround={() => goToRound(session, game, session.currentRound - 1)}
        onfinalnext={() => finalNext(session)}
        onlog={() => (showLog = !showLog)}
        onplayers={() => (showPlayers = true)}
        {dual}
        onaudience={toggleAudience}
        onhide={() => (hideControls = true)}
        onexit={() => confirm('Leave this game? Progress is kept until you start a new game.') && onexit()}
      />
    {/if}
  </div>
  {#if showLog}
    <ScoreLog {session} {sym} onclose={() => (showLog = false)} />
  {/if}
  {#if showPlayers}
    <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (showPlayers = false)}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Players">
        <h2>Players</h2>
        <p class="muted">Add, remove, rename or recolor players. To change a score, click it in the host panel.</p>
        <PlayerList bind:players={session.players} max={game.settings.maxPlayers} />
        <div class="row"><span class="spacer"></span><button class="primary" onclick={() => (showPlayers = false)}>Done</button></div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .pregame {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .pregame h1 {
    margin: 0;
  }
  .pregame p {
    margin: 0;
  }
  .actions {
    margin-top: 12px;
  }
  .big {
    font-size: 16px;
    padding: 10px 22px;
  }
  .play {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .stage-area {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .stage-box {
    flex: 1;
    min-width: 0;
  }
  .stage-area.dual > :global(.info) {
    width: min(360px, 35vw);
    flex-shrink: 0;
  }
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 8px;
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    white-space: normal;
    padding: 12px;
  }
  .mode.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  @media (max-width: 640px) {
    .modes {
      grid-template-columns: 1fr;
    }
  }
  .show-controls {
    position: fixed;
    right: 8px;
    bottom: 8px;
    opacity: 0.15;
    font-size: 11px;
  }
  .show-controls:hover {
    opacity: 1;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: 100;
    padding: 16px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: min(760px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .modal h2,
  .modal p {
    margin: 0;
  }
</style>
