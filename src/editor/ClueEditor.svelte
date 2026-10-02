<script lang="ts">
  import { modal } from '../lib/modal';
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { addClueSlide, deleteClueSlide, duplicateClueSlide, moveClueSlide, neighbourClue, setClueType, stepClue, textStyleTargets } from '../lib/ops';
  import { categoryLabel, clueCountdown, clueValueTyped, formatPoints, PLAYER_WHEEL, questionSlides, type ClueType, setSlideText, slideText, type BoardRound, type TextEl } from '../lib/model';
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
  /** The tile as the board shows it ("Memes $400"), for the history. */
  const tileName = () => `${categoryLabel(cat)} ${formatPoints(clue.value ?? round.values[pos.row] ?? 0, sym)}`;
  /** The tile's type (one step, with the ⭐ Daily Doubles count it raises). */
  function setType(type: ClueType): void {
    record(`Made ${tileName()} ${TYPE_WORDS[type]}`, () => setClueType(round, clue, type));
  }
  let side = $state<'q' | 'a'>('q');

  // ---------- Question slides ----------
  // A clue can have several question slides (a lead-in, then more information…), shown in order before the answer.
  // Most have one: then it's the "Question slide" tab with a quiet ＋ Add slide beside it.
  /** The question slide open (0: the first), kept while the Answer tab is open. */
  let qi = $state(0);
  const qslides = $derived(clue ? questionSlides(clue) : []);
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));
  const qslide = $derived(qslides[at]);
  /**
   * What tells the open slide apart, so the slide editor starts afresh on another one (moving, deleting or undoing can
   * put another slide in the same place, and the first one has no id).
   */
  const slideNo = new WeakMap<object, number>();
  let slideCount = 0;
  const slideKey = $derived.by(() => {
    if (side === 'a' || !qslide) return 'a';
    if (!slideNo.has(qslide)) slideNo.set(qslide, ++slideCount);
    return `q${slideNo.get(qslide)}`;
  });

  /** A change to the question slides as one named step; the slide it returns opens. */
  function slides(label: string, fn: () => number): void {
    const to = record(label, fn);
    side = 'q';
    qi = to;
  }
  /** A new question slide after the one open (on the Answer tab: after the last one), its text box ready to type in. */
  function addSlide(): void {
    const after = side === 'a' ? qslides.length - 1 : at;
    slides(`Added question slide ${after + 2} to ${tileName()}`, () => addClueSlide(clue, after));
    focusQuestion();
  }
  function duplicateSlide(): void {
    slides(`Duplicated question slide ${at + 1} of ${tileName()}`, () => duplicateClueSlide(clue, at));
    focusQuestion();
  }
  const deleteSlide = () => slides(`Deleted question slide ${at + 1} of ${tileName()}`, () => deleteClueSlide(clue, at));
  const moveSlide = (d: -1 | 1) => slides(`Moved question slide ${at + 1} of ${tileName()} ${d < 0 ? 'earlier' : 'later'}`, () => moveClueSlide(clue, at, d));
  let facePicker = $state(false);
  let questionField = $state<HTMLTextAreaElement>();
  let answerField = $state<HTMLTextAreaElement>();
  let emptyBox = $state<HTMLInputElement>();

  /** The wheel or dice open over the clue (one made from the list, or ✎ Edit). */
  let tool = $state<{ kind: 'wheel' | 'dice'; id: string } | null>(null);
  const NEW = 'new';

  /** A wheel or dice picked for the tile; ＋ New… makes one (with the tile using it: one step) and opens it. */
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
    if (part?.kind !== 'clue' || !part.side || part.clue !== untrack(() => clue?.id)) return;
    side = part.side;
    // (On one of its extra question slides: that one.)
    if (part.side === 'q') qi = part.slide ? (untrack(() => clue?.extraSlides)?.findIndex((s) => s.id === part.slide) ?? -1) + 1 : 0;
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
    qi = 0;
    focusQuestion();
  }
  /** Ctrl+Enter / Ctrl+Shift+Enter: the next or previous clue; at the end of the board, a note says so. */
  function step(d: 1 | -1): void {
    const to = d > 0 ? next : prev;
    if (!to) return void toast(d > 0 ? 'That’s the last clue: Esc when you’re done' : 'That’s the first clue', 3000);
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
  <div class="backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit clue" use:modal>
      <header>
        <div>
          <div class="muted small">{round.name} · {cat.title || `Category ${pos.cat + 1}`}</div>
          <div class="value">{formatPoints(clue.value ?? round.values[pos.row] ?? 0, sym)}</div>
        </div>
        <span class="spacer"></span>
        <span class="muted small keys">Ctrl+Enter next clue · Alt+arrows: the clue above, below or beside</span>
        <button onclick={() => step(-1)} disabled={!prev} title="Shift+Ctrl+Enter">◀ Prev</button>
        <button onclick={() => step(1)} disabled={!next} title="Ctrl+Enter">Next ▶</button>
        <button class="primary" onclick={onclose}>Done</button>
        <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
      </header>

      <div class="opts row">
        <label class="check">
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
          <select value={clue.wheelId ?? ''} disabled={clue.empty} aria-label="Which wheel" onchange={(e) => pickTool('wheel', e.currentTarget)}>
            <option value="">Choose a wheel…</option>
            {#if clue.wheelId && clue.wheelId !== PLAYER_WHEEL && !app.game.wheels.some((w) => w.id === clue.wheelId)}
              <option value={clue.wheelId}>⚠ Deleted wheel — pick another</option>
            {/if}
            <option value={PLAYER_WHEEL}>🎯 Pick a player (built in)</option>
            {#each app.game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
            <option value={NEW}>＋ New wheel…</option>
          </select>
          {#if clue.wheelId && app.game.wheels.some((w) => w.id === clue.wheelId)}
            <button class="small ghost" disabled={clue.empty} onclick={() => (tool = { kind: 'wheel', id: clue.wheelId! })} title="Change this wheel's slices">✎ Edit wheel</button>
          {/if}
        {:else if clue.type === 'dice'}
          <select value={clue.diceId ?? ''} disabled={clue.empty} aria-label="Which dice" onchange={(e) => pickTool('dice', e.currentTarget)}>
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
            <option value={NEW}>＋ New dice…</option>
          </select>
          {#if clue.diceId && app.game.dice.some((d) => d.id === clue.diceId)}
            <button class="small ghost" disabled={clue.empty} onclick={() => (tool = { kind: 'dice', id: clue.diceId! })} title="Change these dice">✎ Edit dice</button>
          {/if}
        {/if}
        <label class="check"><input type="checkbox" bind:this={emptyBox} bind:checked={clue.empty} /> Empty tile (not playable)</label>
        <label class="check">
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
        <label class="check" title="Countdown when this clue opens. Blank = game default, 0 = no timer.">
          ⏱
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
            <button class="ghost small" onclick={() => (clue.tileFace = { ...clue.tileFace, image: undefined })} title="Remove tile image" aria-label="Remove tile image">−</button>
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
          <!-- (A clue with several question slides: the one open below.) -->
          <label class="field">
            {qslides.length > 1 ? `Question (slide ${at + 1} of ${qslides.length})` : 'Question'}
            <textarea
              bind:this={questionField}
              dir="auto"
              data-field="q"
              rows="2"
              placeholder={at ? 'Type what this slide adds…' : 'Type the question…'}
              value={slideText(qslide)}
              oninput={(e) => setSlideText(qslide, e.currentTarget.value)}
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
        <div class="tabs">
          <!-- The question slides in the order they show, then the answer. -->
          <div class="tablist" role="tablist" aria-label="Slides">
            {#each qslides as _, i (i)}
              <button
                role="tab"
                class:on={side === 'q' && at === i}
                aria-selected={side === 'q' && at === i}
                data-qslide={i + 1}
                onclick={() => ((side = 'q'), (qi = i))}
                title={qslides.length > 1 ? `Question slide ${i + 1} of ${qslides.length}: viewers see them in this order, then the answer` : undefined}
                >{qslides.length > 1 ? `Question ${i + 1}` : 'Question slide'}</button
              >
            {/each}
            <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer slide (hidden until revealed)</button>
          </div>
          <button
            class="ghost add"
            onclick={addSlide}
            title={side === 'a' ? 'Add a question slide before the answer' : 'Add a question slide after this one: lead in, then show more before the answer'}>＋ Add slide</button
          >
          {#if qslides.length > 1 && side === 'q'}
            <span class="spacer"></span>
            <div class="slidetools" role="group" aria-label="Question slide {at + 1} of {qslides.length}">
              <span class="muted small">Slide {at + 1} of {qslides.length}</span>
              <button class="ghost small" onclick={() => moveSlide(-1)} disabled={at === 0} title="Move this slide earlier" aria-label="Move slide earlier">◀</button>
              <button class="ghost small" onclick={() => moveSlide(1)} disabled={at === qslides.length - 1} title="Move this slide later" aria-label="Move slide later">▶</button>
              <button class="ghost small" onclick={duplicateSlide} title="A copy of this slide, right after it">⧉ Duplicate</button>
              <button class="ghost small" onclick={deleteSlide} title="Delete this question slide (Ctrl+Z brings it back)">🗑 Delete slide</button>
            </div>
          {/if}
        </div>
        {#key `${clue.id}-${slideKey}`}
          <SlideEditor
            slide={side === 'q' ? qslide : clue.answerSlide}
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
    align-items: flex-end;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
  }
  .tablist {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  /* ＋ Add slide sits quietly after the tabs. */
  .tabs .add {
    font-size: 12px;
    opacity: 0.8;
  }
  .slidetools {
    display: flex;
    gap: 4px;
    align-items: center;
    padding-bottom: 3px;
  }
  .slidetools button {
    border-radius: 6px;
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
