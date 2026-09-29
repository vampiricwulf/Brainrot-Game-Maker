<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Round } from '../lib/model';
  import SlideTextEditor from './SlideTextEditor.svelte';

  let { round, pos = $bindable(), onclose }: { round: Round; pos: { cat: number; row: number }; onclose: () => void } = $props();

  const cat = $derived(round.categories[pos.cat]);
  const clue = $derived(cat?.clues[pos.row]);
  const sym = $derived(app.game.settings.currencySymbol);
  const rows = $derived(round.values.length);
  const cats = $derived(round.categories.length);

  // Walk clues column by column (down a category, then on to the next one).
  function step(d: number): void {
    const idx = pos.cat * rows + pos.row + d;
    if (idx < 0 || idx >= rows * cats) return;
    pos = { cat: Math.floor(idx / rows), row: idx % rows };
  }

  function onkey(e: KeyboardEvent): void {
    if (e.key === 'Escape') onclose();
    if (e.altKey && e.key === 'ArrowRight') step(1);
    if (e.altKey && e.key === 'ArrowLeft') step(-1);
  }
</script>

<svelte:window onkeydown={onkey} />

{#if clue}
  <div class="backdrop" onclick={(e) => e.target === e.currentTarget && onclose()} role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit clue">
      <header>
        <div>
          <div class="muted small">{round.name} · {cat.title || `Category ${pos.cat + 1}`}</div>
          <div class="value">{sym}{clue.value ?? round.values[pos.row]}</div>
        </div>
        <span class="spacer"></span>
        <button onclick={() => step(-1)} disabled={pos.cat === 0 && pos.row === 0} title="Alt+←">◀ Prev</button>
        <button onclick={() => step(1)} disabled={pos.cat === cats - 1 && pos.row === rows - 1} title="Alt+→">Next ▶</button>
        <button class="primary" onclick={onclose}>Done</button>
      </header>

      <div class="opts row">
        <label class="check"><input type="checkbox" bind:checked={clue.empty} /> Empty tile (not playable)</label>
        <label class="check">
          Value
          <input
            type="number"
            placeholder={String(round.values[pos.row])}
            value={clue.value ?? ''}
            oninput={(e) => (clue.value = e.currentTarget.value === '' ? null : +e.currentTarget.value)}
          />
          <span class="muted small">blank = row default</span>
        </label>
      </div>

      {#if !clue.empty}
        {#key clue.id}
          <div class="slides">
            <SlideTextEditor slide={clue.questionSlide} label="Question (shown to players)" placeholder="This meme was born in 2016…" />
            <SlideTextEditor slide={clue.answerSlide} label="Answer (hidden until you reveal it)" placeholder="What is…?" />
          </div>
          <label class="field notes">
            Host notes (never shown on stream)
            <textarea rows="2" value={clue.hostNotes ?? ''} oninput={(e) => (clue.hostNotes = e.currentTarget.value)}></textarea>
          </label>
        {/key}
      {/if}
    </div>
  </div>
{/if}

<style>
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
    width: min(1100px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .value {
    font-size: 22px;
    font-weight: 800;
    color: var(--value);
  }
  .small {
    font-size: 12px;
  }
  .opts input[type='number'] {
    width: 100px;
  }
  .slides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 760px) {
    .slides {
      grid-template-columns: 1fr;
    }
  }
</style>
