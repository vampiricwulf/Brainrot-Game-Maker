<!-- The first Save of an untitled game asks for its name (it names the file too). -->
<script lang="ts">
  import { modal } from '../lib/modal';
  let { onname }: { onname: (name: string | null) => void } = $props();
  let name = $state('');
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onname(null);
  }}
/>

<div class="modal-backdrop name-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onname(null)}>
  <div class="modal sm" role="dialog" aria-modal="true" aria-labelledby="name-heading" use:modal data-undo="off">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        onname(name.trim() || 'Untitled Game');
      }}
    >
      <div class="modal-head">
        <h2 class="modal-title" id="name-heading">💾 Name your game</h2>
        <button type="button" class="ghost modal-x" onclick={() => onname(null)} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      <label class="field">
        Game title (the file is named after it)
        <input bind:value={name} placeholder="Untitled Game" maxlength="120" data-autofocus />
      </label>
      <div class="modal-foot">
        <button class="ghost" type="button" onclick={() => onname(null)}>Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>
  </div>
</div>

<style>
  /* Over Start a new game?'s window (its Save first asks for the name). */
  .name-backdrop {
    z-index: calc(var(--z-modal) + 10);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
