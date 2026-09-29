<!-- Host-only controls (scoring, reveal, navigation). Never part of the audience view. -->
<script lang="ts">
  import { textOn } from '../lib/colors';
  import { formatPoints, type Game, type Session } from '../lib/model';
  import { currentClueInfo, roundComplete, score, setScore } from '../lib/session';
  import MediaControls from './MediaControls.svelte';
  import TimerControls from './host/TimerControls.svelte';
  import DDControls from './host/DDControls.svelte';
  import FinalControls from './host/FinalControls.svelte';
  import EndControls from './host/EndControls.svelte';
  import type { Snippet } from 'svelte';

  let {
    game,
    session,
    selected = $bindable(),
    amount = $bindable(),
    dual,
    tools,
    onaward,
    onwrong,
    onreveal,
    onback,
    onundo,
    onredo,
    onnextround,
    onprevround,
    onintronext,
    onskipintro,
    onddshow,
    onfinalstep,
    ontiebreakerdone,
    onrolloff,
    onlog,
    onplayers,
    onhide,
    onexit,
    onaudience,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    amount: number | null;
    dual: boolean;
    /** Extra tool buttons (dice, wheel…) rendered in the nav row. */
    tools?: Snippet;
    onaward: (sign: 1 | -1) => void;
    onwrong: (playerId: string) => void;
    onreveal: () => void;
    onback: () => void;
    onundo: () => void;
    onredo: () => void;
    onnextround: () => void;
    onprevround: () => void;
    onintronext: () => void;
    onskipintro: () => void;
    onddshow: (playerId: string, wager: number) => void;
    onfinalstep: () => void;
    ontiebreakerdone: () => void;
    onrolloff?: (ids: string[]) => void;
    onlog: () => void;
    onplayers: () => void;
    onhide: () => void;
    onexit: () => void;
    onaudience: () => void;
  } = $props();

  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived(game.rounds[session.currentRound]);
  const done = $derived(session.phase === 'board' && !session.intro && roundComplete(session, game));
  const canUndo = $derived(session.scoreLog.some((e) => !e.undone));
  const isLastRound = $derived(session.currentRound >= game.rounds.length - 1);
  const ddWager = $derived(session.phase === 'clue' && session.dd?.stage === 'splash');
  const scoring = $derived(
    !ddWager &&
      (session.phase === 'clue' ||
        session.phase === 'board' ||
        session.phase === 'tiebreaker' ||
        (session.phase === 'final' && session.finalStep !== 'reveal')),
  );
  const introLabel = $derived(
    session.intro?.stage === 'title'
      ? 'Show board ▶'
      : session.intro?.stage === 'fill'
        ? 'Reveal categories ▶'
        : `Reveal category ${(session.intro?.revealed ?? 0) + 1} of ${round?.categories.length ?? 0} ▶`,
  );
  const timerDefault = $derived(info?.clue.timerSeconds || game.settings.defaultTimerSeconds || 30);

  let editingScore = $state<string | null>(null);

  function toggle(id: string): void {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  function commitScore(id: string, value: string): void {
    const n = Number(value);
    if (value.trim() !== '' && Number.isFinite(n)) setScore(session, id, n);
    editingScore = null;
  }
</script>

<div class="panel">
  <div class="status row">
    {#if session.phase === 'board'}
      <b>{round?.name}</b>
      {#if session.intro}
        <span class="muted">Round intro…</span>
      {:else}
        <span class="muted">Pick a tile on the board.</span>
      {/if}
      {#if done}<span class="done">Round complete!</span>{/if}
    {:else if session.phase === 'clue' && info}
      <b>{info.category.title}</b>
      <span class="val">{formatPoints(info.value, sym)}</span>
      {#if session.dd?.stage === 'question'}<span class="ddtag">DD {formatPoints(session.dd.wager ?? 0, sym)}</span>{/if}
      <span class="muted">·</span>
      {#if session.revealed}
        <span class="revealed">Answer is showing</span>
      {:else}
        <span class="muted">Answer hidden</span>
      {/if}
      {#if info.clue.hostNotes && !dual}<span class="notes" title="Host notes">📝 {info.clue.hostNotes}</span>{/if}
    {:else if session.phase === 'final'}
      <b>Final Jeopardy</b>
      <span class="muted">{session.finalStep}</span>
    {:else if session.phase === 'tiebreaker'}
      <b>Tiebreaker</b>
      <span class="muted">Award the winner with the scoring buttons, then go back to the results.</span>
    {:else}
      <b>Game over</b>
    {/if}
    <span class="spacer"></span>
    <TimerControls defaultSeconds={timerDefault} />
  </div>

  <MediaControls {dual} />

  {#if session.phase === 'board' && session.intro}
    <div class="row">
      <button class="primary" onclick={onintronext} title="N">{introLabel}</button>
      <button class="ghost" onclick={onskipintro}>Skip intro</button>
    </div>
  {/if}

  {#if ddWager}
    {#key info?.clue.id}
      <DDControls {game} {session} onshow={onddshow} />
    {/key}
  {/if}

  {#if session.phase === 'final'}
    <FinalControls {game} {session} onstep={onfinalstep} />
  {/if}

  {#if session.phase === 'end'}
    <EndControls {game} {session} {onrolloff} />
  {/if}

  {#if scoring}
    <div class="players">
      {#each session.players as p, i (p.id)}
        {@const on = selected.includes(p.id)}
        <div class="p" class:on class:picker={session.currentPickerId === p.id} style:--c={p.color}>
          <button
            class="sel"
            onclick={() => toggle(p.id)}
            style:background={on ? p.color : undefined}
            style:color={on ? textOn(p.color) : undefined}
            aria-pressed={on}
            title="Toggle (key {i + 1})"
          >
            <span class="key">{i + 1}</span>
            {p.name}
          </button>
          {#if editingScore === p.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="score-edit"
              type="number"
              autofocus
              value={score(session, p.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitScore(p.id, e.currentTarget.value);
                if (e.key === 'Escape') editingScore = null;
              }}
              onblur={(e) => commitScore(p.id, e.currentTarget.value)}
            />
          {:else}
            <button class="score ghost" onclick={() => (editingScore = p.id)} title="Click to set this score">
              {formatPoints(score(session, p.id), sym)}
            </button>
          {/if}
          {#if game.settings.deductOnWrong && session.phase === 'clue' && info}
            <button class="small wrong" onclick={() => onwrong(p.id)} title="Deduct the clue value">
              ✘ −{session.dd?.wager ?? info.value}
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="row award">
      <label class="check">
        Amount
        <input
          type="number"
          bind:value={amount}
          onkeydown={(e) => {
            if (e.key === 'Enter') onaward(e.shiftKey ? -1 : 1);
          }}
        />
      </label>
      <button class="good" disabled={!selected.length || !amount} onclick={() => onaward(1)} title="Enter">
        ＋ Award {selected.length ? `(${selected.length})` : ''}
      </button>
      <button class="bad" disabled={!selected.length || !amount} onclick={() => onaward(-1)} title="Shift+Enter">
        − Deduct
      </button>
      <button class="ghost" disabled={!selected.length} onclick={() => (selected = [])}>Clear selection</button>
      <span class="spacer"></span>
      <button onclick={onundo} disabled={!canUndo} title="Ctrl+Z">↶ Undo</button>
      <button onclick={onredo} disabled={!session.redoStack.length} title="Ctrl+Shift+Z">↷ Redo</button>
    </div>
  {/if}

  <div class="row nav">
    {#if session.phase === 'clue' && !ddWager}
      <button class="primary" onclick={onreveal} disabled={session.revealed} title="R">👁 Reveal answer</button>
      <button onclick={onback} title="Esc">▦ Back to board</button>
    {:else if session.phase === 'clue'}
      <button onclick={onback} title="Esc">▦ Back to board</button>
    {:else if session.phase === 'board'}
      <button onclick={onprevround} disabled={session.currentRound === 0}>◀ Prev round</button>
      <button class:primary={done} onclick={onnextround}>
        {isLastRound ? (game.final.enabled ? 'Final Jeopardy ▶' : 'End game ▶') : 'Next round ▶'}
      </button>
    {:else if session.phase === 'tiebreaker'}
      <button class="primary" onclick={onreveal} disabled={session.tiebreakerRevealed} title="R">👁 Reveal answer</button>
      <button onclick={ontiebreakerdone}>🏁 Back to results</button>
    {/if}
    {@render tools?.()}
    <span class="spacer"></span>
    <button onclick={onaudience} class:on={dual} title="A">{dual ? '📺 Close audience window' : '📺 Audience window'}</button>
    <button onclick={onlog} title="L">📜 Log</button>
    <button onclick={onplayers}>👥 Players</button>
    <button onclick={onhide} title="H">Hide controls</button>
    <button class="ghost" onclick={onexit}>Exit</button>
  </div>
</div>

<style>
  .panel {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 55vh;
    overflow-y: auto;
  }
  .val {
    color: var(--value);
    font-weight: 800;
  }
  .ddtag {
    background: #7a00ff;
    color: #fff;
    border-radius: 6px;
    padding: 1px 8px;
    font-weight: 700;
    font-size: 12px;
  }
  .done,
  .revealed {
    color: var(--good);
    font-weight: 600;
  }
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 2px solid var(--c);
    border-radius: 8px;
    padding: 3px;
  }
  .p.on {
    box-shadow: 0 0 0 2px var(--c);
  }
  .p.picker .sel::after {
    content: ' ★';
  }
  .sel {
    font-weight: 700;
    border: none;
  }
  .key {
    font-size: 10px;
    opacity: 0.7;
    margin-right: 4px;
  }
  .score {
    font-weight: 700;
    min-width: 70px;
    border: none;
  }
  .score-edit {
    width: 100px;
  }
  .wrong {
    color: var(--bad);
  }
  .small {
    font-size: 12px;
  }
  .award input {
    width: 110px;
  }
</style>
