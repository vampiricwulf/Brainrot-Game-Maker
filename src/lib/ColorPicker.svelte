<!--
  The app's color picker, for the color box that opened it (ColorBox.svelte, pickerstate.svelte.ts), in place of the
  browser's own (whose way of typing a color can't be set, and whose eyedropper does nothing in the desktop app on some
  PCs). Top to bottom: a square (more color to the right, darker down) and the hue bar, both dragged or moved with the
  arrow keys; Hex or RGB, both always showing, to type it in (the last one used comes back); 💧 to pick it from the
  screen; and the color it was beside the new one. Under its box (or over it), kept in the window and over windows (in a
  single window, in the host panel: not over the stage viewers see).
  ✓ Done (top right, as in the app's big editors), Enter, a click elsewhere or Tab past its end keep the color; Esc
  puts back the one it had.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { anchored } from './anchored';
  import { closeColorPicker, colorPicker, pickColor, type PickerSession } from './pickerstate.svelte';
  import { textOn } from './colors';
  import { barAt, fromBar, fromSquare, hexSoFar, hexToHsv, hsvToHex, hsvToRgb, nudge, readChannel, readHex, rgbToHex, rgbToHsv, squareAt, type Hsv, type Rgb } from './colormath';
  import { tabbables } from './modal';
  import { prefs, savePrefs } from './prefs.svelte';
  import { canPickFromScreen, pickScreenColor } from './screencolor';

  const fromScreen = canPickFromScreen();
  const s = $derived(colorPicker.open);
  let panel = $state<HTMLDivElement>();
  let square = $state<HTMLDivElement>();
  let bar = $state<HTMLDivElement>();
  let hsv = $state<Hsv>({ h: 0, s: 0, v: 0 });
  const hex = $derived(hsvToHex(hsv));
  const rgb = $derived(hsvToRgb(hsv));
  const dot = $derived(squareAt(hsv));
  /** The Hex box and the R, G, B boxes as typed (null: showing the color). */
  let hexText = $state<string | null>(null);
  let rgbText = $state<(string | null)[]>([null, null, null]);
  /** Entries that aren't a color, shown as such (and not used). */
  let hexBad = $state(false);
  let rgbBad = $state([false, false, false]);
  /** How the last press or key came: a box opened from the keyboard puts the keys in its Hex (or R) box. */
  let byKeys = false;

  // Opened for a box: from its color.
  let shown = 0;
  $effect(() => {
    const now = s;
    if (!now || now.id === shown) return;
    shown = now.id;
    untrack(() => {
      hsv = hexToHsv(now.start) ?? { h: 0, s: 0, v: 0 };
      typedOff();
      const keys = byKeys;
      void tick().then(() => {
        if (colorPicker.open !== now) return;
        const field = keys ? panel?.querySelector('input') : null;
        // (Its text selected: what's typed takes its place.)
        if (field) (field.focus({ preventScroll: true }), field.select());
        else square?.focus({ preventScroll: true });
      });
    });
  });

  function typedOff(): void {
    hexText = null;
    rgbText = [null, null, null];
    hexBad = false;
    rgbBad = [false, false, false];
  }

  /** A color from the square, the bar or the keys: the boxes show it, and it goes in the color box. */
  function set(next: Hsv): void {
    hsv = next;
    typedOff();
    pickColor(hsvToHex(next));
  }
  /** A color as #rrggbb (typed, picked from the screen, the one it was). */
  function setHex(h: string): void {
    set(hexToHsv(h, hsv) ?? hsv);
  }

  /**
   * The Hex box as it's typed: six digits go in at once, as does a color pasted; three wait for Enter or the next box
   * (they're also the start of six).
   */
  function typeHex(text: string, pasted = false): void {
    hexText = text;
    const h = readHex(text);
    hexBad = !h && !hexSoFar(text);
    if (h && (pasted || text.replace(/[#\s]/g, '').length === 6)) useHex(h);
  }
  function useHex(h: string): void {
    hsv = hexToHsv(h, hsv) ?? hsv;
    pickColor(h);
  }
  function typeChannel(i: number, text: string): void {
    rgbText[i] = text;
    const n = readChannel(text);
    rgbBad[i] = n === null && text.trim() !== '';
    if (n === null) return;
    const next = [...rgb] as Rgb;
    next[i] = n;
    hsv = rgbToHsv(next, hsv);
    pickColor(rgbToHex(next));
  }
  /** Is what's typed a color (or untouched)? If not, it's shown as a mistake. */
  function typedOk(): boolean {
    const h = hexText === null ? null : readHex(hexText);
    if (h) useHex(h);
    else if (hexText !== null) hexBad = true;
    rgbText.forEach((t, i) => t !== null && readChannel(t) === null && (rgbBad[i] = true));
    return !hexBad && !rgbBad.some(Boolean);
  }

  function format(f: 'hex' | 'rgb'): void {
    prefs.colorFormat = f;
    savePrefs();
    typedOff();
  }

  // ---------- The square and the bar: dragged by mouse, pen or touch ----------
  let dragging: HTMLElement | null = null;
  function at(el: HTMLElement, e: PointerEvent): void {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    set(el === square ? fromSquare(hsv, x, (e.clientY - r.top) / r.height) : fromBar(hsv, x));
  }
  function down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    e.preventDefault();
    el.focus({ preventScroll: true });
    el.setPointerCapture?.(e.pointerId);
    dragging = el;
    at(el, e);
  }
  const move = (e: PointerEvent) => dragging && dragging === e.currentTarget && at(dragging, e);
  const up = () => (dragging = null);

  /** 💧 under way (the screen shown to pick from). */
  let picking = $state(false);
  async function fromTheScreen(e: MouseEvent): Promise<void> {
    const button = e.currentTarget as HTMLButtonElement;
    const was = s;
    picking = true;
    const c = await pickScreenColor().finally(() => (picking = false));
    if (!was || colorPicker.open !== was) return;
    if (c) setHex(c);
    button.focus({ preventScroll: true });
  }

  // ---------- Keys: the picker's own, none reach the page under it ----------
  function key(e: KeyboardEvent): void {
    byKeys = true;
    const now = colorPicker.open;
    if (!now || !panel) return;
    const t = e.target as HTMLElement;
    if (!panel.contains(t)) {
      // (The keys lost to the page: Esc still closes it.)
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeColorPicker('back');
      }
      return;
    }
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      return closeColorPicker('back');
    }
    if (e.key === 'Tab') {
      // Off either end: closed, keeping the color, and the keys are on the color box again.
      const list = tabbables(panel);
      const i = list.indexOf(t);
      if (e.shiftKey ? i <= 0 : i === list.length - 1) {
        e.preventDefault();
        closeColorPicker();
      }
      return;
    }
    if (t === square || t === bar) {
      const next = nudge(hsv, t === square ? 'square' : 'bar', e.key, e.shiftKey);
      if (next) {
        e.preventDefault();
        set(next);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        closeColorPicker();
      } else if (e.key === ' ') e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && t instanceof HTMLInputElement) {
      e.preventDefault();
      if (typedOk()) closeColorPicker();
    }
  }
  /** A copy, cut or paste in the picker is its own, not the page's (a slide editor's Ctrl+V pastes there). */
  function own(e: Event): void {
    if (colorPicker.open && panel?.contains(e.target as Node)) e.stopImmediatePropagation();
  }
  /** A color pasted where there's no box to type in (the square): it's put in, if it's one. */
  function paste(e: ClipboardEvent): void {
    own(e);
    const t = e.target as HTMLElement;
    if (!colorPicker.open || !panel?.contains(t) || t instanceof HTMLInputElement) return;
    const h = readHex(e.clipboardData?.getData('text') ?? '');
    if (h) {
      e.preventDefault();
      setHex(h);
    }
  }

  /** Is this press on the picker's own box, or the words of its label? Then the box's click closes it (or opens it). */
  function onItsBox(now: PickerSession, t: Element): boolean {
    if (t === now.box) return true;
    return [...(now.box.labels ?? [])].some((l) => l.contains(t)) && !t.closest('button, input, select, textarea, a');
  }
  function press(e: PointerEvent): void {
    byKeys = false;
    const now = colorPicker.open;
    if (!now || panel?.contains(e.target as Node) || (e.target instanceof Element && onItsBox(now, e.target))) return;
    // A press anywhere else keeps the color, as the browser's picker does.
    closeColorPicker();
  }
  function focusOut(e: FocusEvent): void {
    const now = colorPicker.open;
    const to = e.relatedTarget;
    // The keys gone somewhere else on the page (not lost with the window, nor to its own box, whose click handles it).
    if (now && to instanceof Element && !panel?.contains(to) && !onItsBox(now, to)) closeColorPicker('keep', false);
  }
</script>

<svelte:window onkeydowncapture={key} oncopycapture={own} oncutcapture={own} onpastecapture={paste} onpointerdowncapture={press} />

{#if s}
  {@const rgbOn = prefs.colorFormat === 'rgb'}
  <div
    class="cp"
    role="dialog"
    aria-label="Color picker: {s.name}"
    tabindex="-1"
    data-over-modal
    data-color-picker
    bind:this={panel}
    use:anchored={{ anchor: s.box, gap: 4, within: s.box.closest<HTMLElement>('.panel:not(.dual)') }}
    onfocusout={focusOut}
    style:--hue="hsl({hsv.h} 100% 50%)"
  >
    <div class="head">
      <h3 class="title" title={s.name}>{s.name}</h3>
      <button class="small primary" onclick={() => closeColorPicker()} title="Keep this color (Enter)">✓ Done</button>
    </div>
    <div
      class="square"
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s * 100)}
      aria-valuetext="Saturation {Math.round(hsv.s * 100)}%, brightness {Math.round(hsv.v * 100)}%"
      title="More color to the right, darker down (or the arrow keys)"
      bind:this={square}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onlostpointercapture={up}
    >
      <span class="dot" style:left="{dot.x * 100}%" style:top="{dot.y * 100}%" style:background={hex}></span>
    </div>
    <div
      class="hue"
      role="slider"
      tabindex="0"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext="{Math.round(hsv.h)}°"
      title="The color (or the arrow keys)"
      bind:this={bar}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onlostpointercapture={up}
    >
      <span class="knob" style:left="{barAt(hsv) * 100}%"></span>
    </div>
    <div class="formats" role="group" aria-label="Type it as">
      <button class="small" class:on={!rgbOn} aria-pressed={!rgbOn} onclick={() => format('hex')} title="One box: #rrggbb">Hex</button>
      <button class="small" class:on={rgbOn} aria-pressed={rgbOn} onclick={() => format('rgb')} title="Red, green and blue, each 0–255">RGB</button>
    </div>
    {#if rgbOn}
      <div class="rgb">
        {#each ['R', 'G', 'B'] as c, i (c)}
          <label class="chan" title={['Red', 'Green', 'Blue'][i] + ', 0–255'}>
            <span aria-hidden="true">{c}</span>
            <input
              type="number"
              min="0"
              max="255"
              step="1"
              inputmode="numeric"
              aria-label={['Red', 'Green', 'Blue'][i]}
              aria-invalid={rgbBad[i] || undefined}
              class:bad={rgbBad[i]}
              value={rgbText[i] ?? String(rgb[i])}
              oninput={(e) => typeChannel(i, e.currentTarget.value)}
              onblur={() => colorPicker.open && typedOk()}
            />
          </label>
        {/each}
      </div>
      {#if rgbBad.some(Boolean)}<p class="bad-note" role="alert">Each one is a number from 0 to 255.</p>{/if}
    {:else}
      <input
        class="hexbox"
        class:bad={hexBad}
        aria-label="Hex color"
        aria-invalid={hexBad || undefined}
        spellcheck="false"
        autocomplete="off"
        maxlength="12"
        value={hexText ?? hex}
        oninput={(e) => typeHex(e.currentTarget.value, e instanceof InputEvent && e.inputType === 'insertFromPaste')}
        onblur={() => colorPicker.open && typedOk()}
      />
      {#if hexBad}<p class="bad-note" role="alert">Not a color: 6 characters from 0–9 and a–f, like #ff00e6.</p>{/if}
    {/if}
    <div class="foot">
      {#if fromScreen}
        <button class="small" onclick={fromTheScreen} aria-busy={picking} title="Then click anywhere on the screen to take its color">💧 Pick from the screen</button>
      {/if}
      <span class="was-now">
        <button class="was" style:background={s.start} style:color={textOn(s.start)} onclick={() => setHex(s.start)} aria-label="Put back the color it was, {s.start}" title="Put back the color it was ({s.start})">↺</button>
        <span class="now" style:background={hex} role="img" aria-label="New color, {hex}" title="New color ({hex})"></span>
      </span>
    </div>
  </div>
{/if}

<style>
  /* Placed by anchored.ts: fixed to the window, over windows, scrolling inside on a short one. */
  .cp {
    width: 252px;
    max-height: calc(100vh - 16px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px 10px 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    font-size: 13px;
  }
  /* Short of room, the square gets shorter (to a point) before anything has to scroll. */
  .cp > * {
    flex: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The colors themselves: kept as they are with forced colors (they're what's being picked). */
  .square,
  .hue,
  .was,
  .now {
    forced-color-adjust: none;
  }
  .cp > .square {
    position: relative;
    flex: 0 1 150px;
    min-height: 56px;
    border-radius: 6px;
    background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), var(--hue);
    cursor: crosshair;
    touch-action: none;
  }
  .dot {
    position: absolute;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.7),
      inset 0 0 0 1px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  .hue {
    position: relative;
    height: 14px;
    margin: 2px 0;
    border-radius: 7px;
    background: linear-gradient(to right, #f00, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00);
    cursor: pointer;
    touch-action: none;
  }
  /* (A bigger place to press than it looks, for a finger.) */
  .hue::before {
    content: '';
    position: absolute;
    inset: -7px 0;
  }
  .knob {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 10px;
    margin-left: -5px;
    border: 2px solid #fff;
    border-radius: 4px;
    background: var(--hue);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
  /* Hex | RGB: both showing, the one in use filled in. */
  .formats {
    display: flex;
  }
  .formats button {
    flex: 1;
    padding: 4px 8px;
    border-radius: 0;
  }
  .formats button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .formats button:last-child {
    margin-left: -1px;
    border-radius: 0 6px 6px 0;
  }
  .formats button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .formats button:focus-visible {
    position: relative;
  }
  .hexbox {
    width: 100%;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .rgb {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .chan {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .chan input {
    width: 100%;
    min-width: 0;
    padding: 5px 4px 5px 6px;
    color: var(--text);
  }
  input.bad {
    border-color: var(--bad);
  }
  .bad-note {
    margin: -2px 0 0;
    font-size: 12px;
    color: var(--warn);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  /* The color it was (a click puts it back) beside the new one. */
  .was-now {
    display: flex;
    margin-left: auto;
    border: 1px solid var(--control-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .was,
  .now {
    width: 34px;
    height: 26px;
  }
  .was {
    padding: 0;
    border: none;
    border-radius: 0;
    font-size: 13px;
  }
  .was:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  .was:focus-visible {
    outline-offset: -3px;
  }
  @media (forced-colors: active) {
    .cp {
      border-color: CanvasText;
    }
    .dot,
    .knob {
      border-color: Canvas;
      outline: 1px solid CanvasText;
    }
    input.bad {
      border-color: Mark;
    }
  }
</style>
