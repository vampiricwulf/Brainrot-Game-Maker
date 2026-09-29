<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { mediaUrls } from '../lib/media.svelte';
  import { applyTextStyle } from '../lib/ops';
  import type { Round, TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';

  let {
    round,
    pos = $bindable(),
    onclose,
  }: {
    round: Round;
    pos: { cat: number; row: number };
    onclose: () => void;
  } = $props();

  const cat = $derived(round.categories[pos.cat]);
  const clue = $derived(cat?.clues[pos.row]);
  const sym = $derived(app.game.settings.currencySymbol);
  const rows = $derived(round.values.length);
  const cats = $derived(round.categories.length);
  let side = $state<'q' | 'a'>('q');
  let facePicker = $state(false);

  // Walk clues column by column (down a category, then on to the next one).
  function step(d: number): void {
    const idx = pos.cat * rows + pos.row + d;
    if (idx < 0 || idx >= rows * cats) return;
    pos = { cat: Math.floor(idx / rows), row: idx % rows };
  }

  function typing(e: Event): boolean {
    return !!(e.target as HTMLElement)?.closest?.('input, textarea, select');
  }

  function onkey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && !typing(e) && !facePicker) onclose();
    if (e.altKey && e.key === 'ArrowRight') step(1);
    if (e.altKey && e.key === 'ArrowLeft') step(-1);
  }

  function applyStyle(el: TextEl, scope: string): void {
    const n = applyTextStyle(app.game, round, el, scope);
    toast(`Style applied to ${n} slide${n === 1 ? '' : 's'}`);
  }
</script>

<svelte:window onkeydown={onkey} />

{#if clue}
  <div class="backdrop" role="presentation">
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
        <label class="check">
          Type
          <select bind:value={clue.type} disabled={clue.empty}>
            <option value="standard">Standard</option>
            <option value="dailyDouble">⭐ Daily Double</option>
            <option value="wheel">🎡 Wheel</option>
            <option value="dice">🎲 Dice</option>
          </select>
        </label>
        {#if clue.type === 'wheel'}
          <select bind:value={clue.wheelId} aria-label="Which wheel">
            <option value={undefined}>Choose a wheel…</option>
            {#each app.game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
          </select>
          {#if !app.game.wheels.length}<span class="muted small">Make one in the 🎡 Wheels & Dice tab</span>{/if}
        {:else if clue.type === 'dice'}
          <select bind:value={clue.diceId} aria-label="Which dice">
            <option value={undefined}>Choose dice…</option>
            {#each app.game.dice as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
          </select>
          {#if !app.game.dice.length}<span class="muted small">Make some in the 🎡 Wheels & Dice tab</span>{/if}
        {/if}
        <label class="check"><input type="checkbox" bind:checked={clue.empty} /> Empty tile (not playable)</label>
        <label class="check">
          Value
          <input
            type="number"
            placeholder={String(round.values[pos.row])}
            value={clue.value ?? ''}
            oninput={(e) => (clue.value = e.currentTarget.value === '' ? null : +e.currentTarget.value)}
          />
        </label>
        <label class="check" title="Countdown when this clue opens. Blank = game default, 0 = no timer.">
          ⏱
          <input
            type="number"
            min="0"
            class="secs"
            placeholder={app.game.settings.defaultTimerSeconds ? String(app.game.settings.defaultTimerSeconds) : 'none'}
            value={clue.timerSeconds ?? ''}
            oninput={(e) => (clue.timerSeconds = e.currentTarget.value === '' ? null : +e.currentTarget.value)}
          />
          s
        </label>
        <label class="check" title="Show this on the board tile instead of the value">
          Tile shows
          <input
            class="face"
            placeholder="the value"
            value={clue.tileFace?.text ?? ''}
            oninput={(e) => (clue.tileFace = { ...clue.tileFace, text: e.currentTarget.value || undefined })}
          />
        </label>
        <div class="pop">
          {#if clue.tileFace?.image}
            <img class="thumb" src={mediaUrls[clue.tileFace.image]} alt="Tile" />
            <button class="ghost small" onclick={() => (clue.tileFace = { ...clue.tileFace, image: undefined })} title="Remove tile image">✕</button>
          {:else}
            <button class="small" onclick={() => (facePicker = true)} title="Show an image on the tile">🖼 Tile image</button>
          {/if}
          {#if facePicker}
            <MediaPicker
              kind="image"
              onpick={(id) => ((clue.tileFace = { ...clue.tileFace, image: id }), (facePicker = false))}
              onclose={() => (facePicker = false)}
            />
          {/if}
        </div>
      </div>

      {#if clue.type === 'wheel' || clue.type === 'dice'}
        <p class="muted small hint">
          When this tile is picked, the {clue.type} appears full-screen for the host to {clue.type === 'wheel' ? 'spin' : 'roll'}. The question slide
          below is optional; it shows after the {clue.type} is closed.
        </p>
      {/if}
      {#if !clue.empty}
        <div class="tabs" role="tablist">
          <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question (shown to players)</button>
          <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer (hidden until revealed)</button>
        </div>
        {#key `${clue.id}-${side}`}
          <SlideEditor slide={side === 'q' ? clue.questionSlide : clue.answerSlide} onapplystyle={applyStyle} />
        {/key}
        <label class="field notes">
          Host notes (never shown on stream)
          <textarea rows="2" value={clue.hostNotes ?? ''} oninput={(e) => (clue.hostNotes = e.currentTarget.value)}></textarea>
        </label>
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
    /* A viewport-sized track so the modal's max-height/height: 100% resolves against the window. */
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    z-index: 100;
    padding: 12px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: min(1400px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .hint {
    margin: 0;
  }
  .secs {
    width: 70px;
  }
  .face {
    width: 140px;
  }
  .pop {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .thumb {
    height: 30px;
    border-radius: 4px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  .tabs button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
