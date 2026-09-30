<!-- Edit a slide in a dialog (pop-up slides, dialogue, question and answer slides of actions). -->
<script lang="ts">
  import type { Slide } from '../../lib/model';
  import SlideEditor from '../slide/SlideEditor.svelte';

  let { slide, title, onclose }: { slide: Slide; title: string; onclose: () => void } = $props();
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-label={title}>
    <div class="row">
      <b>{title}</b>
      <span class="spacer"></span>
      <button class="primary" onclick={onclose}>Done</button>
    </div>
    <div class="body"><SlideEditor {slide} fill placeholder="Click to type" /></div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(1400px, 100%);
    height: min(860px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
