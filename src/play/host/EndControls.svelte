<!-- End of game: tie handling (spec §6.4 step 6), a way back, rematch and shareable results. -->
<script lang="ts">
  import { toast } from '../../lib/app.svelte';
  import { formatPoints, type Game, type Session } from '../../lib/model';
  import { standings, startTiebreaker, tiedLeaders } from '../../lib/session';

  let {
    game,
    session,
    onrolloff,
    onback,
    onrematch,
  }: {
    game: Game;
    session: Session;
    onrolloff?: (ids: string[]) => void;
    /** Back to the final reveals (or the board if there was no final round). */
    onback: () => void;
    /** New game with the same players, via the pre-game screen. */
    onrematch: () => void;
  } = $props();
  const ties = $derived(tiedLeaders(session));

  /** "🏆 Brainrot Night: 🥇 Sam $4,200 · 🥈 Alex $3,100 · 3. Jo $0" for chat or Discord. */
  function resultsText(): string {
    const medals = ['🥇', '🥈', '🥉'];
    const sym = game.settings.currencySymbol;
    const ranked = standings(session).map((r, i) => `${medals[i] ?? `${i + 1}.`} ${r.player.name} ${formatPoints(r.score, sym)}`);
    return `🏆 ${game.title}: ${ranked.join(' · ')}`;
  }

  async function copyResults(): Promise<void> {
    const text = resultsText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No async clipboard (older browsers, some file:// pages): fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) return toast("Couldn't copy the results");
    }
    toast('Results copied: paste them in chat');
  }
</script>

{#if ties.length && !session.coWinners}
  <div class="tie">
    <b>Tie for first:</b> {ties.map((p) => p.name).join(', ')}
    <div class="row">
      {#if onrolloff}<button onclick={() => onrolloff(ties.map((p) => p.id))}>🎲 Tiebreaker roll-off</button>{/if}
      <button onclick={() => startTiebreaker(session)} disabled={!game.tiebreaker} title={game.tiebreaker ? '' : 'Write one in the editor on the final round tab'}>
        ❓ Tiebreaker clue
      </button>
      <button onclick={() => (session.coWinners = true)}>🤝 Declare co-winners</button>
    </div>
  </div>
{:else if session.coWinners}
  <div class="row"><span class="muted">Co-winners declared.</span><button class="ghost small" onclick={() => (session.coWinners = false)}>Undo</button></div>
{/if}
<div class="row">
  <button class="ghost" onclick={onback}>
    {session.final && game.final.enabled ? '◀ Back to final reveals' : '◀ Back to board'}
  </button>
  <button onclick={copyResults} title="Copy the standings as one line of text">📋 Copy results</button>
  <button onclick={onrematch} title="Same players, scores back to 0, fresh board">🔁 Rematch</button>
</div>

<style>
  .tie {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .small {
    font-size: 12px;
  }
</style>
