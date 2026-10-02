<!-- Host-only view of what's going on, including the answer before it's revealed (dual-window mode). -->
<script lang="ts">
  import { categoryLabel, finalName, formatPoints, questionSlides, slideText, type Game, type Session } from '../lib/model';
  import { clueSlideIndex, currentClueInfo, currentFinal, nameList, places, playerName, tiedLeaders } from '../lib/session';
  import { findIn, focusRef } from '../lib/rpg';
  import { currentPlayer, spaceById } from '../lib/boardgame';
  import { rpgNow } from './rpg/hostops';
  import { boardNow, busyZones } from './boardgame/bgops';

  let { game, session }: { game: Game; session: Session } = $props();
  const info = $derived(currentClueInfo(session, game));
  const finalRound = $derived(currentFinal(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const picker = $derived(session.players.find((p) => p.id === session.currentPickerId));
  const ties = $derived(session.phase === 'end' && !session.coWinners ? tiedLeaders(session) : []);
  // RPG and board-game rounds: where the party is, whose turn it is, and the notes that go with them.
  const rpg = $derived(rpgNow(game, session));
  const here = $derived(rpg.world && rpg.st ? findIn(rpg.world, focusRef(rpg.st) ?? { map: '', screen: '' }) : null);
  const board = $derived(boardNow(game, session));
  const landed = $derived(board.round && board.bs?.last?.landed ? spaceById(board.round, board.bs.last.landed) : undefined);
</script>

{#snippet hostNote(label: string, text: string | undefined)}
  {#if text}
    <div class="label">{label}</div>
    <div class="notes">{text}</div>
  {/if}
{/snippet}

{#snippet standingsList()}
  <div class="group">
    <div class="label">Standings</div>
    <ol>
      <!-- Equal scores share a place, as on stream. -->
      {#each places(session) as { player, score, place } (player.id)}
        <li value={place}><span class="dot" style:background={player.color}></span>{player.name} <b>{formatPoints(score, sym)}</b></li>
      {/each}
    </ol>
  </div>
{/snippet}

<div class="info">
  {#if session.phase === 'clue' && info}
    <div class="meta">
      <span class="cat">{categoryLabel(info.category)}</span>
      <span class="val">{formatPoints(info.value, sym)}</span>
    </div>
    {#if session.dd}
      <div class="dd">
        ⭐ Daily Double{session.dd.stage === 'question'
          ? ` · ${session.players.find((p) => p.id === session.dd?.playerId)?.name ?? ''} wagered ${formatPoints(session.dd.wager ?? 0, sym)}`
          : ' · waiting for the wager'}
      </div>
    {/if}
    <!-- A clue with several question slides: the one on screen, and the next one coming. -->
    {@const slides = questionSlides(info.clue)}
    {@const at = clueSlideIndex(session, info.clue)}
    <div class="label">Question{slides.length > 1 ? ` · slide ${at + 1} of ${slides.length}` : ''} {session.revealed ? '' : '(on screen)'}</div>
    <div class="q">{slideText(slides[at]) || '—'}</div>
    {#if !session.revealed && slides[at + 1]}
      <div class="label">Next slide</div>
      <div class="notes">{slideText(slides[at + 1]) || '—'}</div>
    {/if}
    <div class="label">Answer {session.revealed ? '(on screen)' : '(hidden from viewers)'}</div>
    <div class="a">{slideText(info.clue.answerSlide) || '—'}</div>
    {#if info.clue.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{info.clue.hostNotes}</div>
    {/if}
  {:else if session.phase === 'final' && finalRound}
    <div class="meta"><span class="cat">{finalName(finalRound)}{finalRound.category ? ` · ${finalRound.category}` : ''}</span></div>
    <div class="label">Question</div>
    <div class="q">{slideText(finalRound.questionSlide) || '—'}</div>
    <div class="label">Answer</div>
    <div class="a">{slideText(finalRound.answerSlide) || '—'}</div>
    {#if finalRound.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{finalRound.hostNotes}</div>
    {/if}
    {#if session.final}
      <!-- The heading and its list together (in columns, the heading never ends a column alone). -->
      <div class="group">
        <div class="label">Wagers</div>
        <ol>
          {#each session.final.order as id (id)}
            {@const p = session.players.find((x) => x.id === id)}
            <li>
              <span class="dot" style:background={p?.color}></span>{p?.name}
              <b>{session.final.wagers[id] !== undefined ? formatPoints(session.final.wagers[id], sym) : '—'}</b>{#if session.final.wagerFrom?.[id] === 'phone'}<span title="Sent from their phone"> 📱</span>{/if}
              {session.final.results[id] === 'right' ? '✔' : session.final.results[id] === 'wrong' ? '✘' : ''}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  {:else if session.phase === 'tiebreaker' && game.tiebreaker}
    <div class="meta"><span class="cat">Tiebreaker</span></div>
    <div class="label">Question</div>
    <div class="q">{slideText(game.tiebreaker.questionSlide) || '—'}</div>
    <div class="label">Answer</div>
    <div class="a">{slideText(game.tiebreaker.answerSlide) || '—'}</div>
  {:else if session.phase === 'rpg' && rpg.round}
    <div class="meta"><span class="cat">{rpg.round.name}</span></div>
    {#if here && rpg.st}
      <div class="label">On screen</div>
      <div class="q">🗺 {here.map.name} · {here.screen.name}</div>
      {@render hostNote('Screen notes', here.screen.hostNotes)}
      {#if rpg.st.parties.length > 1}
        <div class="label">Parties</div>
        <ul>
          {#each rpg.st.parties as pt (pt.id)}<li>{pt.name}: {nameList(pt.members.map((m) => playerName(session, m)))}</li>{/each}
        </ul>
      {/if}
    {/if}
    {@render hostNote('Round notes', rpg.round.hostNotes)}
    {@render standingsList()}
  {:else if session.phase === 'boardgame' && board.round && board.bs}
    {@const turn = currentPlayer(board.bs)}
    <div class="meta"><span class="cat">{board.round.name}</span></div>
    <div class="label">Turn</div>
    <div class="q">🎲 {turn ? playerName(session, turn) : 'Nobody'}</div>
    {#if landed}{@render hostNote(`Landed on ${landed.name}`, landed.hostNotes)}{/if}
    {#each busyZones(board.round, board.bs) as z (z.id)}{@render hostNote(`🌀 ${z.name}`, z.hostNotes)}{/each}
    {@render hostNote('Round notes', board.round.hostNotes)}
    {@render standingsList()}
  {:else}
    {#if session.phase === 'end'}
      <div class="meta"><span class="cat">Game over</span></div>
      {#if ties.length}
        <div class="label">Tie for first</div>
        <div class="q">{nameList(ties.map((p) => p.name))}: settle it in the panel below</div>
      {/if}
    {:else}
      <div class="meta"><span class="cat">{game.rounds[session.currentRound]?.name ?? ''}</span></div>
      {#if session.phase === 'board'}
        <div class="label">Picking next</div>
        <div class="q">{picker ? picker.name : 'Nobody set (press P then a number, or click a name plate)'}</div>
      {/if}
    {/if}
    {@render standingsList()}
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
  .group {
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
    font-size: 12px;
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
  ol,
  ul {
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
