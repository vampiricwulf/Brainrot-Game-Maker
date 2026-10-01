<!-- The question or message waiting in ask.svelte.ts: its question as the title, the safe answer (left) has the focus,
     Esc and ✕ give it. -->
<script lang="ts">
  import { answer, asks, splitAsk } from './ask.svelte';
  import { modal } from './modal';

  const a = $derived(asks[0]);
  const parts = $derived(a ? splitAsk(a) : null);
</script>

{#if a && parts}
  {#key a}
    <!-- Its keys are its own: none reach the editor's or the host's shortcuts underneath. -->
    <div class="modal-backdrop ask-backdrop" role="presentation" onkeydown={(e) => e.stopPropagation()}>
      <div
        class="modal sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ask-title"
        aria-describedby={parts.body ? 'ask-body' : undefined}
        data-undo="off"
        use:modal={{ esc: () => answer(false) }}
      >
        <div class="modal-head">
          <!-- (#ask-text: the whole message, title and all.) -->
          <div id="ask-text" class="text">
            <h2 class="modal-title" id="ask-title">{parts.title}</h2>
            {#if parts.body}<p id="ask-body">{parts.body}</p>{/if}
          </div>
          <button class="ghost modal-x" onclick={() => answer(false)} aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <div class="modal-foot">
          {#if a.cancel}
            <button class="ghost" onclick={() => answer(false)} data-autofocus>{a.cancel}</button>
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
  /* Over any window it was asked from. */
  .ask-backdrop {
    z-index: var(--z-ask);
  }
  .modal-head {
    align-items: flex-start;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2,
  p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.45;
  }
</style>
