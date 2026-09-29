<!-- Host-only view of what's going on, including the answer before it's revealed (dual-window mode). -->
<script lang="ts">
  import { formatPoints, slideText, type Game, type Session } from '../lib/model';
  import { currentClueInfo, standings } from '../lib/session';

  let { game, session }: { game: Game; session: Session } = $props();
  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const picker = $derived(session.players.find((p) => p.id === session.currentPickerId));
</script>

<div class="info">
  {#if session.phase === 'clue' && info}
    <div class="meta">
      <span class="cat">{info.category.title}</span>
      <span class="val">{formatPoints(info.value, sym)}</span>
    </div>
    <div class="label">Question {session.revealed ? '' : '(on screen)'}</div>
    <div class="q">{slideText(info.clue.questionSlide) || '—'}</div>
    <div class="label">Answer {session.revealed ? '(on screen)' : '(hidden from viewers)'}</div>
    <div class="a">{slideText(info.clue.answerSlide) || '—'}</div>
    {#if info.clue.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{info.clue.hostNotes}</div>
    {/if}
  {:else if session.phase === 'final'}
    <div class="meta"><span class="cat">Final Jeopardy · {game.final.category}</span></div>
    <div class="label">Question</div>
    <div class="q">{slideText(game.final.questionSlide) || '—'}</div>
    <div class="label">Answer</div>
    <div class="a">{slideText(game.final.answerSlide) || '—'}</div>
  {:else}
    <div class="meta"><span class="cat">{game.rounds[session.currentRound]?.name ?? ''}</span></div>
    <div class="label">Picking next</div>
    <div class="q">{picker ? picker.name : 'Nobody set (press P then a number, or click a name plate)'}</div>
    <div class="label">Standings</div>
    <ol>
      {#each standings(session) as { player, score } (player.id)}
        <li><span class="dot" style:background={player.color}></span>{player.name} <b>{formatPoints(score, sym)}</b></li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .info {
    height: 100%;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--panel);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .val {
    color: var(--value);
  }
  .label {
    margin-top: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .q {
    font-size: 15px;
  }
  .a {
    font-size: 18px;
    font-weight: 700;
    color: var(--good);
  }
  .notes {
    background: var(--panel-2);
    padding: 6px 8px;
    border-radius: 6px;
    white-space: pre-wrap;
  }
  ol {
    margin: 0;
    padding-left: 20px;
  }
  li {
    margin: 2px 0;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 6px;
  }
</style>
