<!-- Asked before New, Open… or a recent game replaces a game with changes that aren't saved to a file. -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import type { ReplaceChoice } from '../lib/recent';

  /** full: this browser's storage is full or blocked, so a discarded game can't be kept in Recent games. */
  let { heading, title, full = false, onchoice }: { heading: string; title: string; full?: boolean; onchoice: (c: ReplaceChoice) => void } = $props();
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onchoice('cancel');
  }}
/>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onchoice('cancel')}>
  <div class="modal sm" role="dialog" aria-modal="true" aria-labelledby="replace-heading" use:modal data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="replace-heading">{heading}</h2>
      <button class="ghost modal-x" onclick={() => onchoice('cancel')} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <p>“{title}” has changes that aren't saved to a file.</p>
    {#if full}
      <p class="warn small">This browser's storage is full, so Discard loses it: Save first to keep it.</p>
    {:else}
      <p class="hint">Discard keeps it in this browser with the last few games replaced: Open… → Recent games brings it back.</p>
    {/if}
    <div class="modal-foot">
      <button class="ghost" onclick={() => onchoice('cancel')}>Cancel</button>
      <span class="spacer"></span>
      <button onclick={() => onchoice('discard')}>Discard</button>
      <button class="primary" data-autofocus onclick={() => onchoice('save')}>Save first</button>
    </div>
  </div>
</div>
