<!--
  ✎ Edit's trim bar (card-files spec §4.11.3): the whole file as a bar, the part kept lit and the rest shaded, a line
  where the preview is, and a handle at each end of the part kept. Drag a handle (or use the keys on it: ← / → a tenth
  of a second, Shift a second, Page Up / Down five, Home / End), or click the bar to go there. `keys`: where the
  picture can be cut as it is (a quick trim starts there), marked on the bar.
-->
<script lang="ts">
  import { clockTenths } from '../lib/shrink/plan';

  let {
    length,
    start,
    end,
    at,
    keys,
    disabled = false,
    onseek,
    onchange,
  }: {
    /** The file's length (seconds). */
    length: number;
    start: number;
    end: number;
    /** Where the preview is. */
    at: number;
    keys?: number[];
    disabled?: boolean;
    onseek: (t: number) => void;
    onchange: (start: number, end: number) => void;
  } = $props();

  const HANDLES = [
    ['start', 'Start of the trim'],
    ['end', 'End of the trim'],
  ] as const;
  /** The shortest part kept (seconds). */
  const MIN = 0.1;
  let bar = $state<HTMLDivElement>();
  let drag = $state<'start' | 'end' | 'seek' | null>(null);
  const pct = (t: number) => (length > 0 ? Math.min(100, Math.max(0, (t / length) * 100)) : 0);
  const tenth = (t: number) => Math.round(t * 10) / 10;
  const clamp = (t: number) => Math.min(length, Math.max(0, t));

  function timeAt(x: number): number {
    const r = bar!.getBoundingClientRect();
    return clamp(((x - r.left) / Math.max(1, r.width)) * length);
  }
  function set(which: 'start' | 'end', t: number): void {
    if (which === 'start') onchange(Math.max(0, Math.min(tenth(t), end - MIN)), end);
    else onchange(start, Math.min(length, Math.max(tenth(t), start + MIN)));
  }
  function down(e: PointerEvent, which: 'start' | 'end' | 'seek'): void {
    if (disabled || e.button !== 0 || !bar) return;
    e.stopPropagation();
    bar.setPointerCapture(e.pointerId);
    drag = which;
    if (which === 'seek') onseek(timeAt(e.clientX));
  }
  function move(e: PointerEvent): void {
    if (!drag || !bar) return;
    const t = timeAt(e.clientX);
    if (drag === 'seek') onseek(t);
    else set(drag, t);
  }
  function key(e: KeyboardEvent, which: 'start' | 'end'): void {
    if (disabled) return;
    const now = which === 'start' ? start : end;
    const step = e.shiftKey ? 1 : 0.1;
    const to: Record<string, number> = {
      ArrowLeft: now - step,
      ArrowDown: now - step,
      ArrowRight: now + step,
      ArrowUp: now + step,
      PageDown: now - 5,
      PageUp: now + 5,
      Home: 0,
      End: length,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    e.stopPropagation();
    set(which, to[e.key]);
  }
</script>

<div
  class="trimbar"
  class:disabled
  bind:this={bar}
  onpointerdown={(e) => down(e, 'seek')}
  onpointermove={move}
  onpointerup={() => (drag = null)}
  onpointercancel={() => (drag = null)}
  role="presentation"
  data-trimbar
>
  <div class="shade" style:left="0" style:width="{pct(start)}%"></div>
  <div class="kept" style:left="{pct(start)}%" style:width="{pct(end) - pct(start)}%"></div>
  <div class="shade" style:left="{pct(end)}%" style:right="0"></div>
  {#each keys ?? [] as k (k)}<div class="key" style:left="{pct(k)}%" title="The picture can be cut as it is here ({clockTenths(k, true)})"></div>{/each}
  <div class="head" style:left="{pct(at)}%"></div>
  {#each HANDLES as [which, label] (which)}
    {@const t = which === 'start' ? start : end}
    <div
      class="handle {which}"
      style:left="{pct(t)}%"
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(length * 10) / 10}
      aria-valuenow={Math.round(t * 10) / 10}
      aria-valuetext={clockTenths(t, true)}
      aria-disabled={disabled}
      onpointerdown={(e) => down(e, which)}
      onkeydown={(e) => key(e, which)}
    ></div>
  {/each}
</div>

<style>
  .trimbar {
    position: relative;
    height: 34px;
    margin: 6px 9px;
    border-radius: 4px;
    background: var(--panel);
    cursor: pointer;
    touch-action: none;
  }
  .trimbar.disabled {
    opacity: 0.6;
    cursor: default;
  }
  .kept {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--accent) 35%, transparent);
    border-top: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    box-sizing: border-box;
  }
  .shade {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.45);
  }
  .key {
    position: absolute;
    top: 0;
    width: 2px;
    height: 8px;
    translate: -50% 0;
    background: var(--muted);
    pointer-events: none;
  }
  .head {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    translate: -50% 0;
    background: #fff;
    pointer-events: none;
  }
  .handle {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 12px;
    translate: -50% 0;
    border-radius: 3px;
    background: var(--accent);
    border: 2px solid #fff;
    cursor: ew-resize;
    box-sizing: border-box;
  }
  .handle:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 1px;
  }
</style>
