<!-- The question or message waiting in ask.svelte.ts: the safe answer has the focus, Esc and ✕ give it. -->
<script lang="ts">
  import { answer, asks } from './ask.svelte';
  import { modal } from './modal';

  const a = $derived(asks[0]);
</script>

{#if a}
  {#key a}
    <!-- Its keys are its own: none reach the editor's or the host's shortcuts underneath. -->
    <div class="backdrop" role="presentation" onkeydown={(e) => e.stopPropagation()}>
      <div class="modal" role="alertdialog" aria-labelledby="ask-text" data-undo="off" use:modal={{ esc: () => answer(false) }}>
        <div class="row">
          <p id="ask-text">{a.text}</p>
          <button class="ghost close" onclick={() => answer(false)} aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <div class="row end">
          {#if a.cancel}
            <button onclick={() => answer(false)} data-autofocus>{a.cancel}</button>
            <button class={a.danger ? 'bad' : 'primary'} onclick={() => answer(true)}>{a.ok}</button>
          {:else}
            <button class="primary" onclick={() => answer(true)} data-autofocus>{a.ok}</button>
          {/if}
        </div>
      </div>
    </div>
  {/key}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(520px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .end {
    justify-content: flex-end;
  }
  p {
    flex: 1;
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.45;
  }
  .close {
    padding: 2px 8px;
  }
</style>
