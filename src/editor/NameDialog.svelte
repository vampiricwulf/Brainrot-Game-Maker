<!-- The first Save of an untitled game asks for its name (it names the file too). -->
<script lang="ts">
  let { onname }: { onname: (name: string | null) => void } = $props();
  let name = $state('');
  const pick = (el: HTMLInputElement) => el.focus();
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onname(null);
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onname(null)}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="name-heading" data-undo="off">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        onname(name.trim() || 'Untitled Game');
      }}
    >
      <h2 id="name-heading">Name your game</h2>
      <label class="field">
        Game title (the file is named after it)
        <input bind:value={name} placeholder="Untitled Game" maxlength="120" use:pick />
      </label>
      <div class="row end">
        <button class="primary" type="submit">Save</button>
        <button class="ghost" type="button" onclick={() => onname(null)}>Cancel</button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 170;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(420px, 100%);
    padding: 18px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
  .end {
    justify-content: flex-end;
  }
</style>
