<!-- Asked before New, Open… or a recent game replaces a game with changes that aren't saved to a file. -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import type { ReplaceChoice } from '../lib/recent';

  /**
   * go: what goes on without saving ("Open", "Reopen", "Start new"), as in "Open anyway". full: this browser's storage
   * is full or blocked, so the game can't be kept in Recent games (going on loses it).
   */
  let {
    heading,
    title,
    go = 'Continue',
    full = false,
    onchoice,
  }: { heading: string; title: string; go?: string; full?: boolean; onchoice: (c: ReplaceChoice) => void } = $props();
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
    <p>“{title}” has changes that aren't saved to a file yet.</p>
    {#if full}
      <p class="warn small">This browser's storage is full, so “{title}” can't be kept here: {go} anyway loses it. Save first to keep it.</p>
    {:else}
      <p class="hint">Either way “{title}” isn't lost: {go} anyway keeps it in this browser, and Open… → Recent games brings it back.</p>
    {/if}
    <div class="modal-foot">
      <button class="ghost" onclick={() => onchoice('cancel')}>Cancel</button>
      <span class="spacer"></span>
      <button
        onclick={() => onchoice('discard')}
        title={full ? `${go} without saving “${title}” (it's lost)` : `${go} without saving “${title}” to a file (it stays in Recent games)`}>{go} anyway</button
      >
      <button class="primary" data-autofocus onclick={() => onchoice('save')} title="Save “{title}” to a file, then go on">Save first</button>
    </div>
  </div>
</div>
