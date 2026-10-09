<script lang="ts">
  import { focusRescue } from '../lib/focusrescue';
  import { modal } from '../lib/modal';
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { take, type Place, type RoundPart, type Side } from '../lib/nav.svelte';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { addClueSlide, deleteClueSlide, duplicateClueSlide, followDailyDoubles, moveClueSlide, neighbourClue, setClueType, stepClue, textStyleTargets } from '../lib/ops';
  import { categoryLabel, clueCountdown, clueValueTyped, formatPoints, PLAYER_WHEEL, questionSlides, type ClueType, setSlideText, slideText, type BoardRound, type ExtraSlide, type Slide, type TextEl } from '../lib/model';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';
  import { commit as commitHistory, step as record } from '../lib/history.svelte';
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

  /** The clue at its question slide `s` (the first one has no id) or at its answer: where a slide change shows. */
  function slidePart(s: Slide | undefined, sd: Side = 'q'): RoundPart {
    return { kind: 'clue', category: cat.id, clue: clue.id, side: sd, slide: sd === 'q' ? (s as Partial<ExtraSlide> | undefined)?.id : undefined };
  }
  /**
   * A change to the question slides as one named step; the slide it returns opens. Undone, the slide open before shows
   * again (an undo brings the slides back with their ids); redone, the one it opened.
   */
  function slides(label: string, fn: () => number, notify = false): void {
    const undoPlace: Place = { tab: 'round', round: round.id, part: side === 'a' ? slidePart(undefined, 'a') : slidePart(qslide) };
    const place = { tab: 'round' as const, round: round.id, part: slidePart(qslide) };
    const to = record(
      label,
      () => {
        const i = fn();
        // (Filled in once it's made: the history reads the place after.)
        place.part = slidePart(questionSlides(clue)[i]);
        return i;
      },
      { place, undoPlace, notify },
    );
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
  const deleteSlide = () => slides(`Deleted question slide ${at + 1} of ${tileName()}`, () => deleteClueSlide(clue, at), true);
  const moveSlide = (d: -1 | 1) => slides(`Moved question slide ${at + 1} of ${tileName()} ${d < 0 ? 'earlier' : 'later'}`, () => moveClueSlide(clue, at, d));

  // ---------- The slide tabs' keys ----------
  /** Many question slides: short tab names (Q1, Q2…), so the tabs stay on one line. */
  const SHORT_TABS = 4;
  let tablist = $state<HTMLElement>();
  /** The focus on the open slide's tab (after a key changed the tabs). */
  const focusTab = () => tick().then(() => tablist?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  /**
   * On a tab: ←/→ (Home/End) open the slide beside it (the first, the last), the answer last. On a question slide's
   * tab, Ctrl+D duplicates it (even the only one), and when there are several: Alt+←/→ move it (like Alt+↑/↓ on a
   * list's rows), Delete deletes it.
   */
  function tabKey(e: KeyboardEvent): void {
    const n = qslides.length;
    // The tabs in order: 0…n-1 the question slides, n the answer.
    const now = side === 'a' ? n : at;
    const mod = e.ctrlKey || e.metaKey;
    const open = (i: number) => {
      e.preventDefault();
      if (i >= n) side = 'a';
      else ((side = 'q'), (qi = i));
      focusTab();
    };
    if (!mod && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') return open(Math.max(0, now - 1));
      if (e.key === 'ArrowRight') return open(Math.min(n, now + 1));
      if (e.key === 'Home') return open(0);
      if (e.key === 'End') return open(n);
    }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      // (Never the browser's Bookmark this page, on the Answer tab either.)
      e.preventDefault();
      if (side === 'q') {
        slides(`Duplicated question slide ${at + 1} of ${tileName()}`, () => duplicateClueSlide(clue, at));
        focusTab();
      }
      return;
    }
    if (side === 'a' || n < 2) return;
    if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // (Not the next clue, as Alt+arrows are elsewhere in the clue.)
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (at + d >= 0 && at + d < n) moveSlide(d);
      focusTab();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.altKey) {
      e.preventDefault();
      deleteSlide();
      focusTab();
    }
  }
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
    record(
      `Added ${kind} “${item.name}”`,
      () => {
        if ('segments' in item) game.wheels.push(item);
        else game.dice.push(item);
        c[key] = item.id;
      },
      // (Undone or redone, it shows on the clue it was made from, not on the Wheels & Dice tab.)
      { place: { tab: 'round', round: round.id, part: { kind: 'clue', category: cat.id, clue: c.id } } },
    );
    tool = { kind, id: item.id };
  }

  // Another clue (a Find hit, an undo on another tile): it opens at its first question slide, not the last one's number.
  // (Before the effect below, which can still pick one of its slides.)
  let qiClue = untrack(() => clue?.id);
  $effect(() => {
    const id = clue?.id;
    if (id === qiClue) return;
    qiClue = id;
    qi = 0;
  });

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
    // The clue typed in is a step of its own, and the box the keys are in starts afresh with the next clue's text
    // (the same box shows it: without leaving it, Ctrl+Z would go to the box's own undo, which has nothing).
    commitHistory();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    pos = to;
    side = 'q';
    qi = 0;
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

  /**
   * Where Alt+arrows have a job of their own, they keep it: a dropdown (Alt+↓ opens it on Windows), and on a Mac, a
   * text box (Option+arrows move the cursor by word or line).
   */
  function ownAltArrows(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('select')) return true;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    return mac && !!t?.closest?.('input:not([type="checkbox"]), textarea, [contenteditable="true"]');
  }

  function onkey(e: KeyboardEvent): void {
    // Esc closes from anywhere but the slide editor's own fields (the quick fields, and the Type, Value, Countdown and
    // Tile shows row, save as you type).
    const quick = !!(e.target as HTMLElement)?.closest?.('.quick, .opts');
    // (A wheel or dice open over the clue has the keys, and so does the tile image picker: a picture picked after
    // moving on would go on the next clue.)
    if (tool || facePicker) return;
    if (e.key === 'Escape' && (!typing(e) || quick)) onclose();
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && ALT_ARROWS[e.key] && !e.defaultPrevented && !ownAltArrows(e)) {
      // Alt+← is the browser's Back button on Windows.
      e.preventDefault();
      go(neighbourClue(round, pos, ...ALT_ARROWS[e.key]));
    }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if clue}
  <div class="modal-backdrop clue-backdrop" role="presentation">
    <div class="modal clue" role="dialog" aria-modal="true" aria-label="Edit clue" use:modal use:focusRescue>
      <header>
        <div>
          <div class="hint">{round.name} · {cat.title || `Category ${pos.cat + 1}`}</div>
          <h2 class="modal-title value">{formatPoints(clue.value ?? round.values[pos.row] ?? 0, sym)}</h2>
        </div>
        <span class="spacer"></span>
        <span class="hint keys">Ctrl+Enter next clue · Alt+arrows: the clue above, below or beside</span>
        <button onclick={() => step(-1)} disabled={!prev} title="Shift+Ctrl+Enter">◀ Prev</button>
        <!-- (On the last clue, Next ▶ becomes Done ✓: there's no next one to go to.) -->
        {#if next}
          <button onclick={() => step(1)} title="Ctrl+Enter">Next ▶</button>
          <button class="primary" onclick={onclose}>Done</button>
        {:else}
          <button class="primary" onclick={onclose} title="That’s the last clue: close it (Esc)">Done <span aria-hidden="true">✓</span></button>
        {/if}
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
        <label class="check"><input
            type="checkbox"
            bind:this={emptyBox}
            bind:checked={() => !!clue.empty, (v) => ((clue.empty = v), !v && followDailyDoubles(round))}
          /> Empty tile (not playable)</label>
        {#if clue.type === 'standard'}
          <label
            class="check"
            title="With phone buzzers: nobody buzzes; every player types an answer on their phone, only you see them, and you mark each right or wrong. Without phones it plays as usual."
            ><input type="checkbox" disabled={clue.empty} bind:checked={() => !!clue.everyone, (v) => (v ? (clue.everyone = true) : delete clue.everyone)} /> ✍ Everyone answers (in secret, on their phones)</label
          >
        {/if}
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
            data-field="tile-face"
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
              oninput={(e) => setSlideText(qslide, e.currentTarget.value) && followClueText(app.game, [qslide])}
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
              oninput={(e) => setSlideText(clue.answerSlide, e.currentTarget.value) && followClueText(app.game, [clue.answerSlide])}
            ></textarea>
          </label>
          <label class="field">
            Host notes (never shown on stream)
            <textarea rows="2" data-field="notes" value={clue.hostNotes ?? ''} oninput={(e) => (clue.hostNotes = e.currentTarget.value)}></textarea>
          </label>
        </div>
        <div class="tabs">
          <!-- The question slides in the order they show, then the answer. -->
          <!-- (One Tab stop, the open slide's: ←/→ go along, see tabKey.) -->
          <div class="tablist" role="tablist" aria-label="Slides" tabindex="-1" bind:this={tablist} onkeydown={tabKey}>
            {#each qslides as _, i (i)}
              {@const on = side === 'q' && at === i}
              <button
                role="tab"
                class:on
                aria-selected={on}
                tabindex={on ? 0 : -1}
                data-qslide={i + 1}
                aria-label={qslides.length > SHORT_TABS ? `Question ${i + 1}` : undefined}
                onclick={() => ((side = 'q'), (qi = i))}
                title={qslides.length > 1
                  ? `Question slide ${i + 1} of ${qslides.length}: viewers see them in this order, then the answer. On the tab: Alt+←/→ move it, Ctrl+D duplicates it, Delete deletes it`
                  : undefined}
                >{qslides.length > SHORT_TABS ? `Q${i + 1}` : qslides.length > 1 ? `Question ${i + 1}` : 'Question slide'}</button
              >
            {/each}
            <button
              role="tab"
              class:on={side === 'a'}
              aria-selected={side === 'a'}
              tabindex={side === 'a' ? 0 : -1}
              onclick={() => (side = 'a')}
              title={qslides.length > 1 ? 'The answer slide: hidden until revealed' : undefined}>{qslides.length > 1 ? 'Answer' : 'Answer slide (hidden until revealed)'}</button
            >
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
              <button class="ghost small" onclick={() => moveSlide(-1)} disabled={at === 0} title="Move this slide earlier" aria-label="Move slide earlier">◀ Earlier</button>
              <button class="ghost small" onclick={() => moveSlide(1)} disabled={at === qslides.length - 1} title="Move this slide later" aria-label="Move slide later">Later ▶</button>
              <button class="ghost small" onclick={duplicateSlide} title="A copy of this slide, right after it">⧉ Duplicate</button>
              <button class="ghost small danger" onclick={deleteSlide} title="Delete this question slide (Ctrl+Z brings it back)">🗑 Delete slide</button>
            </div>
          {/if}
        </div>
        {#key `${clue.id}-${slideKey}`}
          <SlideEditor
            slide={side === 'q' ? qslide : clue.answerSlide}
            styletargets={(el: TextEl, scope: string) => textStyleTargets(app.game, round, el, scope, cat)}
            stylecategory
            quickfield={side}
            placeholder={side === 'a' ? 'Click to type the answer' : at ? 'Click to type what this slide adds' : 'Click to type the question'}
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
    align-items: flex-end;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
  }
  /* One line however many slides (short names past four; it scrolls if it must). */
  .tablist {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tablist button {
    flex: none;
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
