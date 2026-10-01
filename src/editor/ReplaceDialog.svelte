<!-- Asked before New, Open… or a recent game replaces a game with changes that aren't saved to a file. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ReplaceChoice } from '../lib/recent';

  let { heading, title, onchoice }: { heading: string; title: string; onchoice: (c: ReplaceChoice) => void } = $props();
  let first = $state<HTMLButtonElement>();
  onMount(() => first?.focus());
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onchoice('cancel');
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onchoice('cancel')}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="replace-heading" data-undo="off">
    <h2 id="replace-heading">{heading}</h2>
    <p>“{title}” has changes that aren't saved to a file.</p>
    <p class="muted small">Discard keeps it in this browser for a while: Open… → Recent games brings it back.</p>
    <div class="row end">
      <button class="primary" bind:this={first} onclick={() => onchoice('save')}>Save first</button>
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
  h2 {
    margin: 0;
    font-size: 18px;
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
