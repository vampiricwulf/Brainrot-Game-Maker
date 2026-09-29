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
    {#if session.dd}
      <div class="dd">
        ⭐ Daily Double{session.dd.stage === 'question'
          ? ` · ${session.players.find((p) => p.id === session.dd?.playerId)?.name ?? ''} wagered ${formatPoints(session.dd.wager ?? 0, sym)}`
          : ' · waiting for the wager'}
      </div>
    {/if}
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
    {#if session.final}
      <div class="label">Wagers</div>
      <ol>
        {#each session.final.order as id (id)}
          {@const p = session.players.find((x) => x.id === id)}
          <li>
            <span class="dot" style:background={p?.color}></span>{p?.name}
            <b>{session.final.wagers[id] !== undefined ? formatPoints(session.final.wagers[id], sym) : '—'}</b>
            {session.final.results[id] === 'right' ? '✔' : session.final.results[id] === 'wrong' ? '✘' : ''}
          </li>
        {/each}
      </ol>
    {/if}
  {:else if session.phase === 'tiebreaker' && game.tiebreaker}
    <div class="meta"><span class="cat">Tiebreaker</span></div>
    <div class="label">Question</div>
    <div class="q">{slideText(game.tiebreaker.questionSlide) || '—'}</div>
    <div class="label">Answer</div>
    <div class="a">{slideText(game.tiebreaker.answerSlide) || '—'}</div>
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
  .dd {
    background: #7a00ff;
    color: #fff;
    border-radius: 6px;
    padding: 4px 8px;
    font-weight: 600;
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
