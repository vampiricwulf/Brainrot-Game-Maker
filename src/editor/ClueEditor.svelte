<script lang="ts">
  import { modal } from '../lib/modal';
  import { onMount, tick, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { neighbourClue, stepClue, textStyleTargets } from '../lib/ops';
  import { PLAYER_WHEEL, setSlideText, slideText, type BoardRound, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';

  let {
    round,
    pos = $bindable(),
    onclose,
  }: {
    round: BoardRound;
    pos: { cat: number; row: number };
    onclose: () => void;
  } = $props();

  const cat = $derived(round.categories[pos.cat]);
  const clue = $derived(cat?.clues[pos.row]);
  const sym = $derived(app.game.settings.currencySymbol);
  let side = $state<'q' | 'a'>('q');
  let facePicker = $state(false);
  let questionField = $state<HTMLTextAreaElement>();
  let emptyBox = $state<HTMLInputElement>();

  // An undo or redo on this clue shows the side it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    const part = place?.tab === 'round' ? place.part : undefined;
    if (part?.kind === 'clue' && part.side && part.clue === untrack(() => clue?.id)) side = part.side;
  });

  // Keyboard-first entry: the Question field has focus when the clue opens and after Prev/Next (on an
  // empty tile, the Empty tile box that brings it back).
  const focusQuestion = () => tick().then(() => (questionField ?? emptyBox)?.focus());
  onMount(() => void focusQuestion());

  // Prev / Next walk clues column by column (down a category, then on to the next one), past empty tiles.
  const prev = $derived(stepClue(round, pos, -1));
  const next = $derived(stepClue(round, pos, 1));
  function go(to: { cat: number; row: number } | null): void {
    if (!to) return;
    pos = to;
    side = 'q';
    focusQuestion();
  }
  const step = (d: 1 | -1) => go(d > 0 ? next : prev);

  /** Alt+arrows go like the board: up and down the category, or across to the same row of the next one. */
  const ALT_ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  function typing(e: Event): boolean {
    return !!(e.target as HTMLElement)?.closest?.('input:not([type="checkbox"]), textarea, select');
  }

  function onkey(e: KeyboardEvent): void {
    // Esc closes from anywhere but the slide editor's own fields (the quick fields save as you type).
    const quick = !!(e.target as HTMLElement)?.closest?.('.quick');
    if (e.key === 'Escape' && (!typing(e) || quick) && !facePicker) onclose();
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && ALT_ARROWS[e.key] && !e.defaultPrevented) {
      // Alt+← is the browser's Back button on Windows.
      e.preventDefault();
      go(neighbourClue(round, pos, ...ALT_ARROWS[e.key]));
    }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if clue}
  <div class="backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit clue" use:modal>
      <header>
        <div>
          <div class="muted small">{round.name} · {cat.title || `Category ${pos.cat + 1}`}</div>
          <div class="value">{sym}{clue.value ?? round.values[pos.row]}</div>
        </div>
        <span class="spacer"></span>
        <span class="muted small keys">Ctrl+Enter next clue · Alt+arrows: the clue above, below or beside</span>
        <button onclick={() => step(-1)} disabled={!prev} title="Shift+Ctrl+Enter">◀ Prev</button>
        <button onclick={() => step(1)} disabled={!next} title="Ctrl+Enter">Next ▶</button>
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
          <select bind:value={clue.wheelId} disabled={clue.empty} aria-label="Which wheel">
            <option value={undefined}>Choose a wheel…</option>
            {#if clue.wheelId && clue.wheelId !== PLAYER_WHEEL && !app.game.wheels.some((w) => w.id === clue.wheelId)}
              <option value={clue.wheelId}>⚠ Deleted wheel — pick another</option>
            {/if}
            <option value={PLAYER_WHEEL}>🎯 Pick a player (built in)</option>
            {#each app.game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
          </select>
          {#if !app.game.wheels.length}<span class="muted small">Make your own in the 🎡 Wheels & Dice tab</span>{/if}
        {:else if clue.type === 'dice'}
          <select bind:value={clue.diceId} disabled={clue.empty} aria-label="Which dice">
            <option value={undefined}>Choose dice…</option>
            {#if clue.diceId && !app.game.dice.some((d) => d.id === clue.diceId)}<option value={clue.diceId}>⚠ Deleted dice — pick another</option>{/if}
            {#each app.game.dice as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
          </select>
          {#if !app.game.dice.length}<span class="muted small">Make some in the 🎡 Wheels & Dice tab</span>{/if}
        {/if}
        <label class="check"><input type="checkbox" bind:this={emptyBox} bind:checked={clue.empty} /> Empty tile (not playable)</label>
        <label class="check">
          Value
          <input
            type="number"
            disabled={clue.empty}
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
            disabled={clue.empty}
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
            disabled={clue.empty}
            placeholder="the value"
            value={clue.tileFace?.text ?? ''}
            oninput={(e) => (clue.tileFace = { ...clue.tileFace, text: e.currentTarget.value || undefined })}
          />
        </label>
        <div class="pop">
          {#if clue.tileFace?.image}
            <img class="thumb" src={mediaUrls[clue.tileFace.image]} alt="Tile" onerror={imgFallback} />
            <button class="ghost small" onclick={() => (clue.tileFace = { ...clue.tileFace, image: undefined })} title="Remove tile image">✕</button>
          {:else}
            <button
              class="small"
              onclick={() => (facePicker = true)}
              use:mediaDrop={{ kind: 'image', disabled: clue.empty, onpick: (id) => (clue.tileFace = { ...clue.tileFace, image: id }) }}
              disabled={clue.empty}
              title="Show an image on the tile (or drop one here)">🖼 Tile image</button
            >
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

      {#if !clue.empty && (clue.type === 'wheel' || clue.type === 'dice')}
        <p class="muted small hint">
          When this tile is picked, the {clue.type} appears full-screen for the host to {clue.type === 'wheel' ? 'spin' : 'roll'}. The question slide
          below is optional; it shows after the {clue.type} is closed.
        </p>
      {/if}
      {#if clue.empty}
        <p class="muted empty-note">⬚ This tile is left empty on the board. Untick <b>Empty tile</b> to use it.</p>
      {:else}
        <!-- Quick text: the main text of each slide, so plain clues never need the canvas. Tab moves along. -->
        <div class="quick">
          <label class="field">
            Question
            <textarea
              bind:this={questionField}
              rows="2"
              placeholder="Type the question…"
              value={slideText(clue.questionSlide)}
              oninput={(e) => setSlideText(clue.questionSlide, e.currentTarget.value)}
            ></textarea>
          </label>
          <label class="field">
            Answer (hidden until revealed)
            <textarea
              rows="2"
              placeholder="Type the answer…"
              value={slideText(clue.answerSlide)}
              oninput={(e) => setSlideText(clue.answerSlide, e.currentTarget.value)}
            ></textarea>
          </label>
          <label class="field">
            Host notes (never shown on stream)
            <textarea rows="2" value={clue.hostNotes ?? ''} oninput={(e) => (clue.hostNotes = e.currentTarget.value)}></textarea>
          </label>
        </div>
        <div class="tabs" role="tablist">
          <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question slide</button>
          <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer slide (hidden until revealed)</button>
        </div>
        {#key `${clue.id}-${side}`}
          <SlideEditor
            slide={side === 'q' ? clue.questionSlide : clue.answerSlide}
            styletargets={(el: TextEl, scope: string) => textStyleTargets(app.game, round, el, scope, cat)}
            stylecategory
            placeholder={side === 'q' ? 'Click to type the question' : 'Click to type the answer'}
            badge={side === 'a' ? 'ANSWER' : undefined}
            fill
          />
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
    width: min(1800px, 100%);
    /* A fixed-height column: the slide editor takes whatever height the fields above leave. */
    height: 100%;
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* Only the slide editor shrinks; everything else keeps its height (the modal scrolls if it must). */
  .modal > * {
    flex-shrink: 0;
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
  .keys {
    margin-right: 4px;
  }
  .opts input[type='number'] {
    width: 100px;
  }
  /* An empty tile has no type, value, timer or face. */
  .opts :is(input, select):disabled {
    opacity: 0.45;
  }
  .hint {
    margin: 0;
  }
  .empty-note {
    margin: 24px 0;
    text-align: center;
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
  .quick {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 10px;
  }
  .quick textarea {
    resize: none;
    field-sizing: content;
    min-height: calc(2lh + 14px);
    max-height: calc(4lh + 14px);
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
  @media (max-width: 900px) {
    .quick {
      grid-template-columns: 1fr;
    }
    .keys {
      display: none;
    }
  }
</style>
