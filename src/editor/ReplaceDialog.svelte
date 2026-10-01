<!-- Asked before New, Open… or a recent game replaces a game with changes that aren't saved to a file. -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import type { ReplaceChoice } from '../lib/recent';

  let { heading, title, onchoice }: { heading: string; title: string; onchoice: (c: ReplaceChoice) => void } = $props();
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onchoice('cancel');
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onchoice('cancel')}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="replace-heading" use:modal data-undo="off">
    <div class="row">
      <h2 class="modal-title" id="replace-heading">{heading}</h2>
      <span class="spacer"></span>
      <button class="ghost modal-x" onclick={() => onchoice('cancel')} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <p>“{title}” has changes that aren't saved to a file.</p>
    <p class="muted small">Discard keeps it in this browser for a while: Open… → Recent games brings it back.</p>
    <div class="row end">
      <button class="primary" data-autofocus onclick={() => onchoice('save')}>Save first</button>
      <button onclick={() => onchoice('discard')}>Discard</button>
      <button class="ghost" onclick={() => onchoice('cancel')}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 160;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(460px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .end {
    justify-content: flex-end;
  }
</style>
