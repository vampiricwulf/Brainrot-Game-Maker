<script lang="ts">
  import { modal } from '../lib/modal';
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { neighbourClue, setClueType, stepClue, textStyleTargets } from '../lib/ops';
  import { categoryLabel, clueCountdown, clueValueTyped, formatPoints, PLAYER_WHEEL, type ClueType, setSlideText, slideText, type BoardRound, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';
  import { step as record } from '../lib/history.svelte';
  import { QUICK_DICE, STD_DICE, tileDice } from '../lib/tools';
  import ToolPopup, { newTool } from './tools/ToolPopup.svelte';

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

  const TYPE_WORDS: Record<ClueType, string> = { standard: 'a standard tile', dailyDouble: 'a Daily Double', wheel: 'a wheel tile', dice: 'a dice tile' };
  /** The tile's type (one step, with the ⭐ Daily Doubles count it raises). */
  function setType(type: ClueType): void {
    const tile = `${categoryLabel(cat)} ${formatPoints(clue.value ?? round.values[pos.row] ?? 0, sym)}`;
    record(`Made ${tile} ${TYPE_WORDS[type]}`, () => setClueType(round, clue, type));
  }
  let side = $state<'q' | 'a'>('q');
  let facePicker = $state(false);
  let questionField = $state<HTMLTextAreaElement>();
  let answerField = $state<HTMLTextAreaElement>();
  let emptyBox = $state<HTMLInputElement>();

  /** The wheel or dice open over the clue (one made from the list, or ✎ Edit). */
  let tool = $state<{ kind: 'wheel' | 'dice'; id: string } | null>(null);
  const NEW = 'new';

  /** A wheel or dice picked for the tile; ＋ Add… makes one (with the tile using it: one step) and opens it. */
  function pickTool(kind: 'wheel' | 'dice', sel: HTMLSelectElement): void {
    const c = clue;
    if (!c) return;
    const key = kind === 'wheel' ? 'wheelId' : 'diceId';
    if (sel.value !== NEW) return void (c[key] = sel.value || undefined);
    const game = app.game;
    const item = kind === 'wheel' ? newTool('wheel') : newTool('dice');
    record(`Added ${kind} “${item.name}”`, () => {
      if ('segments' in item) game.wheels.push(item);
      else game.dice.push(item);
      c[key] = item.id;
    });
    tool = { kind, id: item.id };
  }

  // An undo or redo on this clue shows the side it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    const part = place?.tab === 'round' ? place.part : undefined;
    if (part?.kind === 'clue' && part.side && part.clue === untrack(() => clue?.id)) side = part.side;
  });

  // Keyboard-first entry: the Question field has focus when the clue opens and after Prev/Next (on an
  // empty tile, the Empty tile box that brings it back).
  // (Opened at its answer, by Find or an undo: the Answer field.)
  const focusQuestion = () => tick().then(() => ((side === 'a' ? answerField : questionField) ?? emptyBox)?.focus());
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
  /** Ctrl+Enter / Ctrl+Shift+Enter: the next or previous clue; at the end of the board, a note says so. */
  function step(d: 1 | -1): void {
    const to = d > 0 ? next : prev;
    if (!to) return void toast(d > 0 ? 'That’s the last clue: Esc when you’re done' : 'That’s the first clue');
    go(to);
  }

  /** Alt+arrows go like the board: up and down the category, or across to the same row of the next one. */
  const ALT_ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  /**
   * In a field Esc belongs to. A checkbox of the clue's own (Daily Double…) isn't one, but one in the slide editor's
   * Inspector is: there Esc first leaves the field, as in its other fields (SlideEditor's own keys).
   */
  function typing(e: Event): boolean {
    const t = e.target as HTMLElement;
    return !!t?.closest?.('input:not([type="checkbox"]), textarea, select') || !!t?.closest?.('.se input[type="checkbox"]');
  }

  function onkey(e: KeyboardEvent): void {
    // Esc closes from anywhere but the slide editor's own fields (the quick fields save as you type).
    const quick = !!(e.target as HTMLElement)?.closest?.('.quick');
    // (A wheel or dice open over the clue has the keys.)
    if (tool) return;
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
  <div class="modal-backdrop clue-backdrop" role="presentation">
    <div class="modal clue" role="dialog" aria-modal="true" aria-label="Edit clue" use:modal>
      <header>
        <div>
          <div class="hint">{round.name} · {cat.title || `Category ${pos.cat + 1}`}</div>
          <h2 class="modal-title value">{formatPoints(clue.value ?? round.values[pos.row] ?? 0, sym)}</h2>
        </div>
        <span class="spacer"></span>
        <span class="hint keys">Ctrl+Enter next clue · Alt+arrows: the clue above, below or beside</span>
        <button onclick={() => step(-1)} disabled={!prev} title="Shift+Ctrl+Enter">◀ Prev</button>
        <button onclick={() => step(1)} disabled={!next} title="Ctrl+Enter">Next ▶</button>
        <button class="primary" onclick={onclose}>Done</button>
        <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
      </header>

      <div class="opts row">
        <label class="field">
          Type
          <!-- (Making it a Daily Double raises the board's ⭐ Daily Doubles count when it's more than that.) -->
          <select value={clue.type} disabled={clue.empty} onchange={(e) => setType(e.currentTarget.value as ClueType)}>
            <option value="standard">Standard</option>
            <option value="dailyDouble">⭐ Daily Double</option>
            <option value="wheel">🎡 Wheel</option>
            <option value="dice">🎲 Dice</option>
          </select>
        </label>
        {#if clue.type === 'wheel'}
          <label class="field">
            Which wheel
          <select value={clue.wheelId ?? ''} disabled={clue.empty} onchange={(e) => pickTool('wheel', e.currentTarget)}>
            <option value="">Choose a wheel…</option>
            {#if clue.wheelId && clue.wheelId !== PLAYER_WHEEL && !app.game.wheels.some((w) => w.id === clue.wheelId)}
              <option value={clue.wheelId}>⚠ Deleted wheel — pick another</option>
            {/if}
            <option value={PLAYER_WHEEL}>🎯 Pick a player (built in)</option>
            {#each app.game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
            <option value={NEW}>＋ Add wheel…</option>
          </select>
          </label>
          {#if clue.wheelId && app.game.wheels.some((w) => w.id === clue.wheelId)}
            <button disabled={clue.empty} onclick={() => (tool = { kind: 'wheel', id: clue.wheelId! })} title="Change this wheel's slices">✎ Edit wheel</button>
          {/if}
        {:else if clue.type === 'dice'}
          <label class="field">
            Which dice
          <select value={clue.diceId ?? ''} disabled={clue.empty} onchange={(e) => pickTool('dice', e.currentTarget)}>
            <option value="">Choose dice…</option>
            {#if clue.diceId && !tileDice(app.game, clue.diceId)}<option value={clue.diceId}>⚠ Deleted dice — pick another</option>{/if}
            {#if app.game.dice.length}
              <optgroup label="This game's dice">
                {#each app.game.dice as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
              </optgroup>
            {/if}
            <optgroup label="Standard dice">
              {#each QUICK_DICE as d (d.label)}<option value="{STD_DICE}{d.label}">🎲 {d.label}</option>{/each}
            </optgroup>
            <option value={NEW}>＋ Add dice…</option>
          </select>
          </label>
          {#if clue.diceId && app.game.dice.some((d) => d.id === clue.diceId)}
            <button disabled={clue.empty} onclick={() => (tool = { kind: 'dice', id: clue.diceId! })} title="Change these dice">✎ Edit dice</button>
          {/if}
        {/if}
        <label class="check"><input type="checkbox" bind:this={emptyBox} bind:checked={clue.empty} /> Empty tile (not playable)</label>
        <label class="field">
          Value
          <!-- Whole points, never below 0 (blank: the row's value). -->
          <input
            type="number"
            min="0"
            step="1"
            disabled={clue.empty}
            placeholder={String(round.values[pos.row])}
            value={clue.value ?? ''}
            oninput={(e) => (clue.value = clueValueTyped(e.currentTarget.value))}
            onchange={(e) => (e.currentTarget.value = clue.value === null ? '' : String(clue.value))}
          />
        </label>
        <label class="field" title="Countdown when this clue opens. Blank = game default, 0 = no timer.">
          ⏱ Countdown (s)
          <!-- Whole seconds, at least 1 (blank: the game's default, 0: none). -->
          <input
            type="number"
            min="0"
            step="1"
            class="secs"
            disabled={clue.empty}
            placeholder={app.game.settings.defaultTimerSeconds ? String(app.game.settings.defaultTimerSeconds) : 'none'}
            value={clue.timerSeconds ?? ''}
            oninput={(e) => (clue.timerSeconds = clueCountdown(e.currentTarget.value))}
            onchange={(e) => (e.currentTarget.value = clue.timerSeconds === null || clue.timerSeconds === undefined ? '' : String(clue.timerSeconds))}
          />
        </label>
        <label class="field" title="Show this on the board tile instead of the value">
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
            <button class="ghost tiny" onclick={() => (clue.tileFace = { ...clue.tileFace, image: undefined })} title="Remove tile image" aria-label="Remove tile image">✕</button>
          {:else}
            <button
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
        <p class="hint">
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
              dir="auto"
              data-field="q"
              rows="2"
              placeholder="Type the question…"
              value={slideText(clue.questionSlide)}
              oninput={(e) => setSlideText(clue.questionSlide, e.currentTarget.value)}
            ></textarea>
          </label>
          <label class="field">
            Answer (hidden until revealed)
            <textarea
              bind:this={answerField}
              dir="auto"
              data-field="a"
              rows="2"
              placeholder="Type the answer…"
              value={slideText(clue.answerSlide)}
              oninput={(e) => setSlideText(clue.answerSlide, e.currentTarget.value)}
            ></textarea>
          </label>
          <label class="field">
            Host notes (never shown on stream)
            <textarea rows="2" data-field="notes" value={clue.hostNotes ?? ''} oninput={(e) => (clue.hostNotes = e.currentTarget.value)}></textarea>
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
  {#if tool}<ToolPopup kind={tool.kind} id={tool.id} onclose={() => (tool = null)} />{/if}
{/if}

<style>
  .clue-backdrop {
    padding-inline: 12px;
    padding-bottom: 12px;
  }
  .clue {
    width: min(1800px, 100%);
    /* A fixed-height column: the slide editor takes whatever height the fields above leave. */
    height: 100%;
  }
  /* Only the slide editor shrinks; everything else keeps its height (the modal scrolls if it must). */
  .clue > * {
    flex-shrink: 0;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .value {
    font-size: 20px;
    font-weight: 800;
    color: var(--value);
  }
  .keys {
    margin-right: 4px;
  }
  .opts {
    align-items: flex-end;
    gap: 12px;
  }
  /* Ticks and buttons line up with the fields (under their labels). */
  .opts .check {
    min-height: 31px;
  }
  .opts input[type='number'] {
    width: 100px;
  }
  /* An empty tile has no type, value, timer or face. */
  .opts :is(input, select):disabled {
    opacity: 0.45;
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
    height: 31px;
    border-radius: 4px;
  }
  .quick {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 12px;
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
    background: var(--accent-fill);
    border-color: var(--accent-fill);
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
