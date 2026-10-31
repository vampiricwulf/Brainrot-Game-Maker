<!--
  The check before going on (goon.ts, docs/SPEC.md §6.6): the blue button was pressed with something left. Inside the
  host panel, anchored bottom right over its buttons, never over the stage (the one-window stage keeps its size) nor
  the status line and the fixed bar. It says what's left, a button per fix, Not yet and a quiet "… anyway"; "First:" in
  the panel's frame when what's left is the box's next step, "Before you go on" in the warning frame when going on would
  lose something. Where the blue button was it holds no button, only the step's name: a nervous second click there
  presses nothing. Play holds its state and its keys; this draws it. Its buttons take no click while it's new
  (checkHeld), and a done item keeps its line, ticked, its buttons inert, so nothing moves under the pointer.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { CHECK_GUARD_MS, checkHeld } from './guard';
  import { anywayLabel, enterQuick, headingOf, mainQuick, quietKinds, teachLine, todo, type Check, type LeftItem, type QuietKind, type Quick } from './goon';
  import { CHECK } from './verbs';

  let {
    check,
    side = false,
    lit = null,
    flash = 0,
    onquick,
    onanyway,
    onstep,
    onnotyet,
    onquiet,
    onflash,
  }: {
    check: Check;
    /** The panel is the column beside the stage: the blue button's spot is a line at the card's foot. */
    side?: boolean;
    /** A press the guard held back: what it will press (its words), lit up a moment. */
    lit?: string | null;
    /** Goes up to flash the card (a stage click, a key with nothing to do here). */
    flash?: number;
    onquick: (q: Quick) => void;
    onanyway: () => void;
    onstep: () => void;
    onnotyet: () => void;
    onquiet: (kind: QuietKind) => void;
    /** A click on its empty parts or the blue button's spot. */
    onflash: () => void;
  } = $props();

  let el = $state<HTMLElement>();
  const heading = $derived(headingOf(check.items));
  const left = $derived(todo(check.items));
  const must = $derived(left.some((i) => i.must));
  const enter = $derived(enterQuick(check.items));
  const strong = $derived(mainQuick(check.items));
  const anyway = $derived(anywayLabel(check));
  const teach = $derived(teachLine(check));
  const ticks = $derived(quietKinds(check.items));
  /** The fixes of an item, by player where there are several ("Ann [＋ Award $200] [− Deduct]"). */
  const linesOf = (item: LeftItem): { who?: string; quick: Quick[] }[] => {
    const out: { who?: string; quick: Quick[] }[] = [];
    for (const q of item.quick) {
      const last = out.at(-1);
      if (last && last.who === q.line) last.quick.push(q);
      else out.push({ who: q.line, quick: [q] });
    }
    return out;
  };

  /**
   * Where it goes: from the status line's foot to the fixed bar's top, right-aligned, up to 720px wide (the column's
   * width beside the stage), as tall as it needs but reaching over the blue button; and that button's rectangle,
   * measured as it opened, kept free of buttons.
   */
  let place = $state<{ right: number; bottom: number; width: number; maxH: number; minH: number; spot: { right: number; bottom: number; width: number; height: number } | null; pad: number }>();
  function measure(): void {
    const panel = el?.closest<HTMLElement>('.panel');
    if (!el || !panel) return;
    const pr = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const top = panel.querySelector(':scope > .status')?.getBoundingClientRect().bottom ?? pr.top;
    const foot = panel.querySelector(':scope > .fixed')?.getBoundingClientRect().top ?? pr.bottom;
    const width = side ? pr.width - padL - padR : Math.min(pr.width - padL - padR, 720);
    const right = padR;
    const bottom = pr.bottom - foot + 4;
    const cardRight = pr.right - right;
    const cardBottom = foot - 4;
    const main = mainAt;
    const spot = main ? { right: Math.max(0, cardRight - main.right - 4), bottom: Math.max(0, cardBottom - main.bottom - 4), width: main.width + 8, height: main.height + 8 } : null;
    place = {
      right,
      bottom,
      width,
      maxH: Math.max(120, foot - top - 10),
      minH: main ? Math.max(0, cardBottom - main.top + 10) : 0,
      spot,
      pad: main ? (side ? cardBottom - main.top + 8 : cardRight - main.left + 8) : 0,
    };
  }
  /** The blue button's rectangle as the check opened (it may be gone under the card since). */
  let mainAt: DOMRect | null = null;
  /** Its guard is over: keys and clicks on it count (data-ready, for screen tests to wait on). */
  let ready = $state(false);
  onMount(() => {
    const t = setTimeout(() => (ready = true), Math.max(0, check.at + CHECK_GUARD_MS - Date.now()));
    const main = el?.closest('.panel')?.querySelector<HTMLElement>('[data-next]');
    mainAt = main ? main.getBoundingClientRect() : null;
    measure();
    // The keys go to the check itself (not one of its buttons): screen readers read its heading and what's left.
    void tick().then(() => el?.focus({ preventScroll: true }));
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  });

  // A flash: the card's outline, once (app.css .goon-flash: none with Reduce motion, the status line says it).
  $effect(() => {
    if (!flash || !el) return;
    el.classList.remove('goon-flash');
    void el.offsetWidth;
    el.classList.add('goon-flash');
  });

  /** A click on one of its buttons, held back while it's new or the press that opened it goes on. */
  const held = (e: MouseEvent, since = check.at) => checkHeld(since, Date.now(), e.detail);
  function quick(e: MouseEvent, q: Quick, item: LeftItem): void {
    if (held(e) || item.done) return;
    onquick(q);
  }
  /** Its empty parts and the blue button's spot: a click there only flashes it. */
  function away(e: MouseEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('button, label, input')) return;
    onflash();
  }
  /** Tab and Shift+Tab go round its buttons and its tick. */
  function wrap(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || !el) return;
    const all = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (!all.length) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : at === all.length - 1 || at < 0 ? 0 : at + 1;
    e.preventDefault();
    all[to].focus();
  }
  const caps = (q: Quick) => [q.key, q === enter ? '⏎' : ''].filter(Boolean);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="goon"
  id="goon-check"
  class:loss={heading === 'loss'}
  class:side
  data-goon={heading}
  data-ready={ready || undefined}
  role="alertdialog"
  aria-labelledby="goon-head"
  aria-describedby="goon-items"
  tabindex="-1"
  bind:this={el}
  onclick={away}
  onkeydown={wrap}
  style:right={place ? `${place.right}px` : undefined}
  style:bottom={place ? `${place.bottom}px` : undefined}
  style:width={place ? `${place.width}px` : undefined}
  style:max-height={place ? `${place.maxH}px` : undefined}
  style:min-height={place ? `${Math.min(place.minH, place.maxH)}px` : undefined}
  style:--pad-right={place && !side ? `${place.pad}px` : '0px'}
  style:--pad-bottom={place && side ? `${place.pad}px` : '0px'}
>
  <div class="scroll">
    <h3 id="goon-head">{heading === 'loss' ? CHECK.loss : heading === 'nothing' ? CHECK.nothing : CHECK.first}</h3>
    <div id="goon-items" class="items">
      {#each check.items as item (item.id)}
        <div class="item" class:done={!!item.done} data-goon-item={item.id}>
          <p class="text">{#if item.done}<span class="tick">{item.done}</span> {/if}{item.text}</p>
          {#each linesOf(item) as line, li (li)}
            <div class="quick" inert={!!item.done}>
              {#if line.who}<span class="who">{line.who}</span>{/if}
              {#each line.quick as q, qi (qi)}
                <button
                  class:good={q.tone === 'good'}
                  class:bad={q.tone === 'bad'}
                  class:ring={((q === strong && q.tone !== 'good') || !!q.ring) && !item.done}
                  class:strong={q === strong}
                  class:lit={lit === q.label}
                  disabled={!!item.done || !!q.why}
                  title={q.why ?? q.aria}
                  aria-label={q.aria}
                  data-quick
                  onclick={(e) => quick(e, q, item)}
                  >{q.label}{#each caps(q) as k (k)} <kbd aria-hidden="true">{k}</kbd>{/each}</button
                >
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
  <div class="foot">
    <div class="row">
      <button class="ghost" data-notyet onclick={onnotyet}>{CHECK.notYet} <kbd aria-hidden="true">Esc</kbd></button>
      {#if !left.length}
        <!-- Nothing left: its step, plain (a moment's wait first: this button changed its meaning in place). -->
        <button data-goon-step class:lit={lit === check.step.verb.label} onclick={(e) => !held(e, check.nothingAt ?? check.at) && onstep()}
          >{check.step.verb.label} <kbd aria-hidden="true">N</kbd></button
        >
      {:else if !must}
        <button class="ghost anyway" class:bad={!!check.step.reveals} class:lit={lit === anyway} data-anyway onclick={(e) => !held(e) && onanyway()}
          >{anyway} <kbd aria-hidden="true">{check.step.reveals ? 'R' : 'N again'}</kbd></button
        >
      {/if}
    </div>
    {#if teach && left.length}<p class="teach">{teach}</p>{/if}
    {#each ticks as kind (kind)}
      <label class="check tick-row"><input type="checkbox" onchange={(e) => e.currentTarget.checked && onquiet(kind)} /> {CHECK.dontAsk(CHECK.quiet[kind])}</label>
    {/each}
  </div>
  {#if place?.spot}
    <!-- Where the blue button was: its step's name, never a button. -->
    <div class="spot" aria-hidden="true" style:right="{place.spot.right}px" style:bottom="{place.spot.bottom}px" style:min-width="{place.spot.width}px" style:min-height="{place.spot.height}px">
      <span class="step">{check.step.verb.label}</span>
      <small>{must ? CHECK.comesOnce : left.length ? CHECK.waits : ''}</small>
    </div>
  {/if}
</div>

<style>
  .goon {
    position: absolute;
    z-index: 4;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    padding: 10px 12px;
    box-sizing: border-box;
    gap: 8px;
  }
  .goon.loss {
    border-color: var(--warn);
  }
  .goon :is(.scroll, .foot) {
    padding-right: var(--pad-right);
  }
  .goon.side .foot {
    padding-bottom: var(--pad-bottom);
  }
  /* (Taller than its room: what's left scrolls, the foot stays.) */
  .scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .foot {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }
  .loss h3 {
    color: var(--warn);
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .text {
    margin: 0 0 4px;
  }
  .item.done {
    opacity: 0.55;
  }
  .tick {
    font-weight: 700;
  }
  .row,
  .quick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .who {
    font-weight: 700;
    min-width: 6em;
  }
  .teach {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .tick-row {
    font-size: 12px;
  }
  kbd {
    font: 11px/1 ui-monospace, monospace;
    padding: 1px 4px;
    margin-left: 4px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.75;
  }
  /* The step "… anyway" takes: quiet, red where it would show an answer. */
  .anyway.bad {
    background: transparent;
    color: var(--bad);
    border-color: var(--bad);
  }
  /* A press the guard held back: what it will do lights up. */
  .lit kbd {
    opacity: 1;
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  /* The blue button's place: its step's name, muted, no button. */
  .spot {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    color: var(--muted);
    font-size: 13px;
    text-align: right;
    box-sizing: border-box;
    padding: 4px 6px;
  }
  .spot small {
    font-size: 12px;
  }
</style>
