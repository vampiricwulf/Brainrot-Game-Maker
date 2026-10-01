<!-- Edit a slide in a dialog (pop-up slides, dialogue, question and answer slides of actions). -->
<script lang="ts">
  import { modal } from '../../lib/modal';
  import type { Slide } from '../../lib/model';
  import SlideEditor from '../slide/SlideEditor.svelte';

  let { slide, title, onclose }: { slide: Slide; title: string; onclose: () => void } = $props();
  let box = $state<HTMLDivElement>();

  /** Esc closes it (the slide editor takes an Esc that deselects first), unless it's for a picker open inside. */
  function key(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || (e.target as HTMLElement).closest?.('input, textarea, select')) return;
    const dialogs = document.querySelectorAll('[role="dialog"]');
    if (dialogs[dialogs.length - 1] !== box) return;
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal slide-modal" role="dialog" aria-modal="true" aria-label={title} use:modal bind:this={box}>
    <div class="modal-head">
      <h2 class="modal-title">✎ {title}</h2>
      <button class="primary" onclick={onclose}>Done</button>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="body"><SlideEditor {slide} fill placeholder="Click to type" /></div>
  </div>
</div>

<style>
  .slide-modal {
    width: min(1400px, 100%);
    height: min(860px, 100%);
    overflow: hidden;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
