<!-- A saved theme's name: asked when saving one (💾 Save as my theme…) or renaming it. -->
<script lang="ts">
  import { modal } from '../lib/modal';

  let {
    title,
    value = '',
    ok,
    onname,
  }: {
    title: string;
    value?: string;
    /** The answer button ("Save", "Rename"). */
    ok: string;
    /** The name (trimmed, never empty), or null when cancelled. */
    onname: (name: string | null) => void;
  } = $props();
  // (The name given when it opened, edited from there.)
  // svelte-ignore state_referenced_locally
  let name = $state(value);
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onname(null);
  }}
/>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onname(null)}>
  <div class="modal sm" role="dialog" aria-modal="true" aria-labelledby="theme-name-heading" use:modal data-undo="off">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onname(name.trim());
      }}
    >
      <div class="modal-head">
        <h2 class="modal-title" id="theme-name-heading">{title}</h2>
        <button type="button" class="ghost modal-x" onclick={() => onname(null)} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      <label class="field">
        Theme name
        <input bind:value={name} maxlength="60" data-autofocus />
      </label>
      <p class="hint">Kept on this computer, for any game. Its colors, fonts and layout are kept; pictures stay with their game.</p>
      <div class="modal-foot">
        <button class="ghost" type="button" onclick={() => onname(null)}>Cancel</button>
        <button class="primary" type="submit" disabled={!name.trim()}>{ok}</button>
      </div>
    </form>
  </div>
</div>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
