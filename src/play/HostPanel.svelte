<!-- Host-only controls (scoring, reveal, navigation). Never part of the audience view. -->
<script lang="ts">
  import { textOn } from '../lib/colors';
  import { formatPoints, type Game, type Session } from '../lib/model';
  import { currentClueInfo, roundComplete, score, setScore } from '../lib/session';
  import MediaControls from './MediaControls.svelte';

  let {
    game,
    session,
    selected = $bindable(),
    amount = $bindable(),
    onaward,
    onwrong,
    onreveal,
    onback,
    onundo,
    onredo,
    onnextround,
    onprevround,
    onfinalnext,
    onlog,
    onplayers,
    onhide,
    onexit,
    dual,
    onaudience,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    amount: number | null;
    onaward: (sign: 1 | -1) => void;
    onwrong: (playerId: string) => void;
    onreveal: () => void;
    onback: () => void;
    onundo: () => void;
    onredo: () => void;
    onnextround: () => void;
    onprevround: () => void;
    onfinalnext: () => void;
    onlog: () => void;
    onplayers: () => void;
    onhide: () => void;
    onexit: () => void;
    dual: boolean;
    onaudience: () => void;
  } = $props();

  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived(game.rounds[session.currentRound]);
  const done = $derived(session.phase === 'board' && roundComplete(session, game));
  const canUndo = $derived(session.scoreLog.some((e) => !e.undone));
  const isLastRound = $derived(session.currentRound >= game.rounds.length - 1);
  const scoring = $derived(session.phase === 'clue' || session.phase === 'final' || session.phase === 'board');

  let editingScore = $state<string | null>(null);

  function toggle(id: string): void {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  function commitScore(id: string, value: string): void {
    const n = Number(value);
    if (value.trim() !== '' && Number.isFinite(n)) setScore(session, id, n);
    editingScore = null;
  }

  const finalLabels = { category: 'Show question ▶', question: 'Reveal answer ▶', answer: 'Finish game ▶' } as const;
</script>

<div class="panel">
  <div class="status row">
    {#if session.phase === 'board'}
      <b>{round?.name}</b>
      <span class="muted">Pick a tile on the board.</span>
      {#if done}<span class="done">Round complete!</span>{/if}
    {:else if session.phase === 'clue' && info}
      <b>{info.category.title}</b>
      <span class="val">{sym}{info.value}</span>
      <span class="muted">·</span>
      {#if session.revealed}
        <span class="revealed">Answer is showing</span>
      {:else}
        <span class="muted">Answer hidden</span>
      {/if}
      {#if info.clue.hostNotes}<span class="notes" title="Host notes">📝 {info.clue.hostNotes}</span>{/if}
    {:else if session.phase === 'final'}
      <b>Final Jeopardy</b>
      <span class="muted">Step: {session.finalStep}. Enter each player's result below using the amount + Award/Deduct.</span>
    {:else}
      <b>Game over</b>
    {/if}
  </div>

  <MediaControls {dual} />

  {#if scoring}
    <div class="players">
      {#each session.players as p, i (p.id)}
        {@const on = selected.includes(p.id)}
        <div class="p" class:on style:--c={p.color}>
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
            <button class="small wrong" onclick={() => onwrong(p.id)} title="Deduct the clue value">✘ −{info.value}</button>
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
    {#if session.phase === 'clue'}
      <button class="primary" onclick={onreveal} disabled={session.revealed} title="R">👁 Reveal answer</button>
      <button onclick={onback} title="Esc">▦ Back to board</button>
    {:else if session.phase === 'board'}
      <button onclick={onprevround} disabled={session.currentRound === 0}>◀ Prev round</button>
      <button class:primary={done} onclick={onnextround}>
        {isLastRound ? (game.final.enabled ? 'Final Jeopardy ▶' : 'End game ▶') : 'Next round ▶'}
      </button>
    {:else if session.phase === 'final'}
      <button class="primary" onclick={onfinalnext} title="N">{finalLabels[session.finalStep ?? 'category']}</button>
    {/if}
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
  }
  .val {
    color: var(--value);
    font-weight: 800;
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
  .award input {
    width: 110px;
  }
</style>
