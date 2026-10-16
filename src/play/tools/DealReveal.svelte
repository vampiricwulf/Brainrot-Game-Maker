<!--
  🎭 Who was who (partner-clues spec §11), over the stage: each player of the deal and the part they had (and the slice
  they drew), once the host shows it. Only names and parts come here (dealReveal): never what was on a card.
-->
<script lang="ts">
  import { fade, fly } from '../../lib/motion.svelte';
  import { textOn } from '../../lib/colors';
  import type { RevealLine } from '../../lib/deals';

  let { name, lines }: { name: string; lines: RevealLine[] } = $props();
  /** Two columns past 8 lines; everything shrinks so the last one stays on screen. */
  const cols = $derived(lines.length > 8 ? 2 : 1);
  const rows = $derived(Math.ceil(lines.length / cols));
</script>

<div class="reveal" data-who-was-who style:--k={Math.min(1, 7 / Math.max(1, rows))} transition:fade={{ duration: 250 }}>
  <h1>Who was who</h1>
  <div class="sub" dir="auto">🎭 {name}</div>
  <div class="grid" style:--cols={cols}>
    {#each lines as l, i (i)}
      <div class="line" style:--c={l.color} in:fly={{ y: 40, delay: 200 + i * 120, duration: 400 }}>
        <span class="nm" style:background={l.color} style:color={textOn(l.color)} dir="auto">{l.name}{#if l.team}{' '}<small>· {l.team}</small>{/if}</span>
        <span class="part" dir="auto">{l.part}{#if l.slice}{' '}<span class="slice">· {l.slice}</span>{/if}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .reveal {
    position: absolute;
    inset: 0;
    z-index: 39;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: calc(50px * var(--k));
    background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--tile) 45%, rgb(0 0 0 / 0.9)), rgba(0, 0, 20, 0.97));
  }
  h1 {
    margin: 0;
    font-family: var(--value-font);
    font-size: calc(96px * var(--k));
    color: var(--value-on-dark, var(--value));
    text-shadow: 6px 6px 0 #000;
    text-transform: uppercase;
  }
  .sub {
    margin-bottom: calc(24px * var(--k));
    font-family: var(--board-font);
    font-size: calc(40px * var(--k));
    color: #fff;
    opacity: 0.85;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: calc(14px * var(--k)) 40px;
    width: min(1700px, calc(var(--cols) * 820px));
  }
  .line {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
    font-family: var(--board-font);
    font-size: calc(52px * var(--k));
    font-weight: 800;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    border-left: 14px solid var(--c);
    border-radius: 12px;
    padding: calc(8px * var(--k)) 20px;
  }
  .nm {
    flex-shrink: 0;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 18px;
    border-radius: 10px;
  }
  .nm small {
    font-size: 0.6em;
  }
  .part {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slice {
    font-weight: 600;
    opacity: 0.85;
  }
</style>
