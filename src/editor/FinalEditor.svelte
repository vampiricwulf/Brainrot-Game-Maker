<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { applyTextStyle } from '../lib/ops';
  import type { SlideElement, TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';

  let { oneditimage }: { oneditimage?: (el: SlideElement) => void } = $props();
  const final = $derived(app.game.final);
  let side = $state<'q' | 'a'>('q');

  function applyStyle(el: TextEl, scope: string): void {
    const n = applyTextStyle(app.game, null, el, scope.replace('round', 'game'));
    toast(`Style applied to ${n} slide${n === 1 ? '' : 's'}`);
  }
</script>

<h2>Final Jeopardy</h2>
<label class="check"><input type="checkbox" bind:checked={final.enabled} /> Include Final Jeopardy</label>

{#if final.enabled}
  <div class="grid">
    <label class="field">Category<input bind:value={final.category} placeholder="e.g. Internet History" /></label>
    <label class="field">Think time (seconds)<input type="number" min="5" bind:value={final.timerSeconds} /></label>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question</button>
    <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer</button>
  </div>
  {#key side}
    <SlideEditor slide={side === 'q' ? final.questionSlide : final.answerSlide} onapplystyle={applyStyle} {oneditimage} />
  {/key}
{/if}

<style>
  h2 {
    margin: 0 0 8px;
  }
  .grid {
    display: flex;
    gap: 12px;
    margin: 16px 0;
    flex-wrap: wrap;
  }
  .grid input {
    width: 280px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 10px;
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
