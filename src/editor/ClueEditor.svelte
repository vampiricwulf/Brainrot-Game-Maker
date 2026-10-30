<script lang="ts">
  import { focusRescue } from '../lib/focusrescue';
  import { modal, topModal } from '../lib/modal';
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { announce } from '../lib/announce';
  import { take, type ClueSide, type Place, type RoundPart } from '../lib/nav.svelte';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { addClueSlide, cardFromAnswer, deleteClueSlide, duplicateClueSlide, followDailyDoubles, moveClueSlide, neighbourClue, setClueType, stepClue, textStyleTargets } from '../lib/ops';
  import {
    cardSlides,
    categoryLabel,
    clueCardName,
    clueCardWords,
    clueCountdown,
    clueValueTyped,
    formatPoints,
    MAX_CARDS,
    PLAYER_WHEEL,
    questionSlides,
    roundName,
    type ClueType,
    setSlideText,
    slideText,
    type BoardRound,
    type CardGoesTo,
    type ClueCard,
    type ExtraSlide,
    type Slide,
    type TextEl,
  } from '../lib/model';
  import { addCard, deleteCard, GOES_TO, goesToLabel, partnerRules, TILE_GOES_TO, tileGoesToLabel } from '../lib/partner';
  import { clip } from '../lib/buzzproto';
  import CardBar from './CardBar.svelte';
  import PartnerSettings from './PartnerSettings.svelte';
  import ChoicesEditor from './ChoicesEditor.svelte';
  import PhoneCardPreview from './PhoneCardPreview.svelte';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import { NARROW_CARDS } from './SlideTabs.svelte';
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

  const TYPE_WORDS: Record<ClueType, string> = { standard: 'a standard tile', dailyDouble: 'a Daily Double', wheel: 'a wheel tile', dice: 'a dice tile', partner: 'a partner clue' };
  /** The tile as the board shows it ("Memes $400"), for the history. */
  const tileName = () => `${categoryLabel(cat)} ${formatPoints(clue.value ?? round.values[pos.row] ?? 0, sym)}`;
  /** The tile's type (one step, with the ⭐ Daily Doubles count it raises). */
  function setType(type: ClueType): void {
    record(`Made ${tileName()} ${TYPE_WORDS[type]}`, () => {
      setClueType(round, clue, type);
      // (A partner clue's starting cards take the theme's clue text, as new clues do.)
      if (type === 'partner') followClueText(app.game, cardSlides(clue));
    });
  }
  /** The tab open: a question slide, the answer, or one of a partner clue's 🤫 cards. */
  let side = $state<ClueSide>('q');

  // ---------- Question slides ----------
  // A clue can have several question slides (a lead-in, then more information…), shown in order before the answer.
  // Most have one: then it's the "Question slide" tab with a quiet ＋ Add slide beside it.
  /** The question slide open (0: the first), kept while the Answer tab is open. */
  let qi = $state(0);
  const qslides = $derived(clue ? questionSlides(clue) : []);
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));
  const qslide = $derived(qslides[at]);

  // ---------- 🤫 Cards ----------
  // A tile's cards: slides only the players the host sends them to see (a partner clue hands them out in its Distribute
  // step; any other tile offers them in its panel: 🤫 Just you, 💡 Insider tip). Their tabs come after the question
  // slides (Question 1…n · 🤫 Card 1…k, or their names · Answer), in the order things happen.
  /** The card open (0: Card 1), kept while another tab is open. */
  let ci = $state(0);
  /** 📱 On their phone: the open card as a phone gets it, beside the slide (kept on while moving between cards). */
  let phoneView = $state(false);
  const cards = $derived(clue && !clue.empty ? cardSlides(clue) : []);
  /** Who a card starts with, in words: a partner clue's parts ("the describer"), or on any other tile "the picker"… */
  const goesTo = (to: CardGoesTo, long = true): string => (clue.type === 'partner' ? goesToLabel(partnerRules(clue), to, long) : tileGoesToLabel(clue.type, to, long));
  const cardAt = $derived(Math.min(ci, Math.max(0, cards.length - 1)));
  const card = $derived<ClueCard | undefined>(cards[cardAt]);
  /**
   * The Goes to choices for the open card's tile. (A partner clue's card kept on another tile goes to nobody there, and
   * says so; one made on another tile that goes to the picker keeps that on a partner clue.)
   */
  const goesList = $derived(clue?.type === 'partner' ? (card?.to === 'picker' ? [...GOES_TO, 'picker' as const] : GOES_TO) : TILE_GOES_TO);
  /** The tab shown: a card's when there's one to show (its type changed, it was deleted: the question). */
  const shown = $derived<ClueSide>(side === 'card' && !card ? 'q' : side);
  /** Short card tab names (🤫 1, 🤫 2…) when there are many tabs; named ones cut shorter from four cards. */
  const shortCards = $derived(qslides.length + cards.length > 6);
  const narrow = $derived(cards.length >= NARROW_CARDS);
  /** The open card's bar (its Card name box: F2 or a double-click on its tab). */
  let bar = $state<ReturnType<typeof CardBar>>();
  const focusName = () => tick().then(() => bar?.focusName());
  /** The clue at one of its cards. */
  const cardPart = (c: ClueCard): RoundPart => ({ kind: 'clue', category: cat.id, clue: clue.id, side: 'card', slide: c.id });
  /** Where the tab open is (where a change made from it shows when undone). */
  const openPart = (): RoundPart => (shown === 'card' && card ? cardPart(card) : shown === 'a' ? slidePart(undefined, 'a') : slidePart(qslide));
  /**
   * A change to the cards as one named step; the card it returns opens (-1: none left, the question opens). Undone, the
   * tab open before shows again; redone, the card it opened.
   */
  function cardStep(label: string, fn: () => number, notify = false): void {
    const undoPlace: Place = { tab: 'round', round: round.id, part: openPart() };
    const place = { tab: 'round' as const, round: round.id, part: openPart() };
    const to = record(
      label,
      () => {
        const i = fn();
        const c = cardSlides(clue)[i];
        // (Filled in once it's made: the history reads the place after.)
        place.part = c ? cardPart(c) : slidePart(questionSlides(clue)[0]);
        return i;
      },
      { place, undoPlace, notify },
    );
    if (to < 0) side = 'q';
    else ((side = 'card'), (ci = to));
  }
  /** ＋ Card: a new card at the end, its words box ready to type in. */
  function newCardTab(): void {
    cardStep(`Added card ${cards.length + 1} to ${tileName()}`, () => {
      const c = addCard(clue);
      if (c) followClueText(app.game, [c]);
      return cardSlides(clue).length - 1;
    });
    focusQuestion();
  }
  function deleteCardTab(): void {
    cardStep(`Deleted ${clueCardWords(card!, cardAt)} of ${tileName()}`, () => deleteCard(clue, cardAt), true);
    // (The last one: its bar goes with the button pressed, so the keys go on from the question's tab.)
    if (!cardSlides(clue).length) void focusTab();
  }
  /** Who the open card starts with when the cards are handed out. */
  function setGoesTo(to: CardGoesTo): void {
    const c = card;
    if (!c) return;
    record(`${clueCardWords(c, cardAt, true)} of ${tileName()} goes to ${goesTo(to, false)}`, () => (c.to = to), {
      place: { tab: 'round', round: round.id, part: cardPart(c) },
    });
  }
  /** ⧉ Same as the answer: a copy of the answer slide on the open (empty) card, once. */
  function copyAnswer(): void {
    const c = card;
    if (!c) return;
    record(`Copied the answer onto ${clueCardWords(c, cardAt)} of ${tileName()}`, () => cardFromAnswer(clue, c), {
      place: { tab: 'round', round: round.id, part: cardPart(c) },
    });
  }

  /**
   * What tells the open slide apart, so the slide editor starts afresh on another one (moving, deleting or undoing can
   * put another slide in the same place, and the first one has no id).
   */
  const slideNo = new WeakMap<object, number>();
  let slideCount = 0;
  const slideKey = $derived.by(() => {
    const s = shown === 'card' ? card : shown === 'q' ? qslide : undefined;
    if (!s) return 'a';
    if (!slideNo.has(s)) slideNo.set(s, ++slideCount);
    return `${shown === 'card' ? 'c' : 'q'}${slideNo.get(s)}`;
  });

  /** The clue at its question slide `s` (the first one has no id) or at its answer: where a slide change shows. */
  function slidePart(s: Slide | undefined, sd: 'q' | 'a' = 'q'): RoundPart {
    return { kind: 'clue', category: cat.id, clue: clue.id, side: sd, slide: sd === 'q' ? (s as Partial<ExtraSlide> | undefined)?.id : undefined };
  }
  /**
   * A change to the question slides as one named step; the slide it returns opens. Undone, the slide open before shows
   * again (an undo brings the slides back with their ids); redone, the one it opened.
   */
  function slides(label: string, fn: () => number, notify = false): void {
    const undoPlace: Place = { tab: 'round', round: round.id, part: openPart() };
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
  /** A new question slide after the one open (on the Answer or a card's tab: after the last one), its text box ready to type in. */
  function addSlide(): void {
    const after = shown === 'q' ? at : qslides.length - 1;
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
   * list's rows), Delete deletes it. (Not on a card's tab, as not on the answer's.) On a card's tab, F2 goes to its
   * Card name.
   */
  function tabKey(e: KeyboardEvent): void {
    const n = qslides.length;
    const k = cards.length;
    // The tabs in order: 0…n-1 the question slides, n…n+k-1 the cards, n+k the answer.
    const now = shown === 'a' ? n + k : shown === 'card' ? n + cardAt : at;
    const mod = e.ctrlKey || e.metaKey;
    const open = (i: number) => {
      e.preventDefault();
      if (i >= n + k) side = 'a';
      else if (i >= n) ((side = 'card'), (ci = i - n));
      else ((side = 'q'), (qi = i));
      focusTab();
    };
    if (!mod && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') return open(Math.max(0, now - 1));
      if (e.key === 'ArrowRight') return open(Math.min(n + k, now + 1));
      if (e.key === 'Home') return open(0);
      if (e.key === 'End') return open(n + k);
      if (e.key === 'F2' && shown === 'card') {
        e.preventDefault();
        return void focusName();
      }
    }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      // (Never the browser's Bookmark this page, on the Answer tab either.)
      e.preventDefault();
      if (shown === 'q') {
        slides(`Duplicated question slide ${at + 1} of ${tileName()}`, () => duplicateClueSlide(clue, at));
        focusTab();
      }
      return;
    }
    if (shown !== 'q' || n < 2) return;
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
  let cardField = $state<HTMLTextAreaElement>();
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
      // (Undone or redone, it shows on the clue it was made from, not on the Wheels, Dice & Deals tab.)
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
    ci = 0;
  });

  // An undo or redo on this clue shows the side it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    const part = place?.tab === 'round' ? place.part : undefined;
    if (part?.kind !== 'clue' || !part.side || part.clue !== untrack(() => clue?.id)) return;
    side = part.side;
    // (On one of its extra question slides, or one of its cards: that one.)
    if (part.side === 'q') qi = part.slide ? (untrack(() => clue?.extraSlides)?.findIndex((s) => s.id === part.slide) ?? -1) + 1 : 0;
    if (part.side === 'card') ci = Math.max(0, untrack(() => clue?.cards)?.findIndex((s) => s.id === part.slide) ?? 0);
  });

  // Keyboard-first entry: the Question field has focus when the clue opens and after Prev/Next (on an
  // empty tile, the Empty tile box that brings it back).
  // (Opened at its answer or a card, by Find or an undo: the Answer or the card's field.)
  const focusQuestion = () => tick().then(() => ((shown === 'a' ? answerField : shown === 'card' ? cardField : questionField) ?? emptyBox)?.focus());
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
    ci = 0;
    focusQuestion();
    // (A screen reader hears only "Question, edit text" again: it's told which tile this is, the last one when keys come fast.)
    announce(tileName(), 'clue-editor-tile');
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

  let clueBox = $state<HTMLElement>();
  function onkey(e: KeyboardEvent): void {
    // Esc closes from anywhere but the slide editor's own fields (the quick fields, the Type, Value, Countdown and Tile
    // shows row, and the multiple choices, save as you type).
    const quick = !!(e.target as HTMLElement)?.closest?.('.quick, .opts, .partner-opts, .choice-opts, .cardbar');
    // (A wheel or dice open over the clue has the keys, and so does the tile image picker: a picture picked after
    // moving on would go on the next clue. So does any window over it, such as ✎ Edit video.)
    if (tool || facePicker) return;
    const top = topModal();
    if (top && top !== clueBox) return;
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
    <div class="modal clue" role="dialog" aria-modal="true" aria-label="Edit clue" use:modal use:focusRescue bind:this={clueBox}>
      <header>
        <div>
          <div class="hint">{roundName(round, app.game.rounds.indexOf(round))} · {cat.title || `Category ${pos.cat + 1}`}</div>
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
            <option value="partner">🤝 Partner clue</option>
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
            <img class="thumb" src={mediaUrls[clue.tileFace.image]} alt="Tile" onerror={imgFallback} draggable="false" />
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

      {#if !clue.empty && clue.type === 'partner'}
        <PartnerSettings {clue} value={clue.value ?? round.values[pos.row] ?? 0} tile={tileName} />
      {/if}
      {#if !clue.empty && clue.type === 'standard' && clue.everyone}
        <!-- (In a box of its own: with the choices taken off, the keys land on ＋ Multiple choice, not the header's Next ▶.) -->
        <div><ChoicesEditor owner={clue} where={tileName} /></div>
      {/if}
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
        <div class="quick" class:four={!!card}>
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
          {#if card}
            <!-- (The card open, else the last one opened: Card 1 at first. A long name is cut: the modal's height is
                 fixed.) -->
            <label class="field">
              🤫 {clip(clueCardName(card, cardAt), 24)} words (only who you send it to sees them)
              <textarea
                bind:this={cardField}
                dir="auto"
                data-field="card"
                rows="2"
                placeholder="Type what they’ll see…"
                value={slideText(card)}
                oninput={(e) => setSlideText(card, e.currentTarget.value) && followClueText(app.game, [card])}
              ></textarea>
            </label>
          {/if}
          <label class="field">
            Host notes (off stream, except in a single window)
            <textarea rows="2" data-field="notes" value={clue.hostNotes ?? ''} oninput={(e) => (clue.hostNotes = e.currentTarget.value)}></textarea>
          </label>
        </div>
        <div class="tabs">
          <!-- The question slides in the order they show, then the answer. -->
          <!-- (One Tab stop, the open slide's: ←/→ go along, see tabKey.) -->
          <div class="tablist" role="tablist" aria-label="Slides" tabindex="-1" bind:this={tablist} onkeydown={tabKey}>
            {#each qslides as _, i (i)}
              {@const on = shown === 'q' && at === i}
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
            {#each cards as c, i (c.id)}
              {@const on = shown === 'card' && cardAt === i}
              <button
                role="tab"
                class="card-tab"
                class:on
                class:narrow
                aria-selected={on}
                tabindex={on ? 0 : -1}
                data-card={i + 1}
                aria-label={shortCards ? (c.name?.trim() ? `Card ${i + 1}: ${c.name.trim()}` : `Card ${i + 1}`) : undefined}
                onclick={() => ((side = 'card'), (ci = i))}
                ondblclick={() => ((side = 'card'), (ci = i), focusName())}
                title="🤫 {clueCardName(c, i)}: only the players you hand it to see it, never on stream. It starts with {goesTo(c.to, false)}. F2: rename it"
                >{shortCards ? `🤫 ${i + 1}` : `🤫 ${clueCardName(c, i)}`}</button
              >
            {/each}
            <button
              role="tab"
              class:on={shown === 'a'}
              aria-selected={shown === 'a'}
              tabindex={shown === 'a' ? 0 : -1}
              onclick={() => (side = 'a')}
              title={qslides.length > 1 || cards.length ? 'The answer slide: hidden until revealed' : undefined}
              >{qslides.length > 1 || cards.length ? 'Answer' : 'Answer slide (hidden until revealed)'}</button
            >
          </div>
          <button
            class="ghost add"
            onclick={addSlide}
            title={shown === 'q' ? 'Add a question slide after this one: lead in, then show more before the answer' : 'Add a question slide before the answer'}>＋ Add slide</button
          >
          <button
            class="ghost add"
            onclick={newCardTab}
            disabled={cards.length >= MAX_CARDS}
            title={cards.length >= MAX_CARDS
              ? `A clue holds ${MAX_CARDS} cards`
              : clue.type === 'partner'
                ? 'Add a 🤫 card: a slide only the players you hand it to see (never on stream)'
                : 'Add a 🤫 card: a slide only the players you send it to see (never on stream), offered in the host panel when this tile is played (a private question, a tip before a Daily Double’s wager…)'}>＋ Card</button
          >
          {#if qslides.length > 1 && shown === 'q'}
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
        {#if shown === 'card' && card}
          <CardBar
            bind:this={bar}
            {card}
            index={cardAt}
            {goesList}
            {goesTo}
            goesTitle="Who this card starts with when you hand the cards out: you can give it to anyone then"
            question={qslides}
            answer={clue.answerSlide}
            bind:phoneView
            ongoes={setGoesTo}
            oncopy={copyAnswer}
            ondelete={deleteCardTab}
            ondone={focusTab}
          />
        {/if}
        <!-- (📱 On their phone sits beside the slide editor, never over its toolbar or inspector.) -->
        <div class="card-edit">
          {#key `${clue.id}-${slideKey}`}
            <SlideEditor
              slide={shown === 'card' && card ? card : shown === 'q' ? qslide : clue.answerSlide}
              styletargets={(el: TextEl, scope: string) => textStyleTargets(app.game, round, el, scope, cat)}
              stylecategory
              quickfield={shown}
              placeholder={shown === 'card' ? 'Click to type what they’ll see' : shown === 'a' ? 'Click to type the answer' : at ? 'Click to type what this slide adds' : 'Click to type the question'}
              badge={shown === 'card' && card ? `🤫 ${clip(clueCardName(card, cardAt), 16).toUpperCase()} · ONLY WHO YOU SEND IT TO SEES IT` : shown === 'a' ? 'ANSWER' : undefined}
              fill
            />
          {/key}
          {#if shown === 'card' && card && phoneView}<PhoneCardPreview game={app.game} {clue} {card} />{/if}
        </div>
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
    /* (The boxes line up at the bottom whatever their labels wrap to: a card's is long.) */
    align-items: end;
  }
  .quick.four {
    grid-template-columns: 1.2fr 1fr 1fr 1fr;
  }
  /* The slide editor takes the height the fields above leave (and the width 📱 On their phone leaves). */
  .clue > .card-edit {
    display: flex;
    gap: 8px;
    flex: 1 1 0;
    min-height: 300px;
    min-width: 0;
  }
  .card-edit > :global(.se) {
    min-width: 0;
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
  /* A long card name is cut on its tab (the tab's tooltip and the card's bar have it whole). */
  .card-tab {
    max-width: 18ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-tab.narrow {
    max-width: 12ch;
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
    .quick,
    .quick.four {
      grid-template-columns: 1fr;
    }
    .clue > .card-edit {
      flex-direction: column;
      flex: none;
    }
    .keys {
      display: none;
    }
  }
</style>
