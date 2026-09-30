<!--
  A question asked right in the host panel, where a browser dialog (prompt, confirm) would show on stream: the
  question, a text box when it wants a name or some text, and the answer and Cancel buttons. In the box, Enter
  answers and Esc cancels.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  let {
    text,
    field,
    value = '',
    ok,
    cancel = 'Cancel',
    danger = false,
    onok,
    oncancel,
  }: {
    /** The question (a text box can do without one when its placeholder says it all). */
    text?: string;
    /** It wants some text: the box's placeholder and name. */
    field?: string;
    /** The text the box starts with. */
    value?: string;
    /** The answer button. */
    ok: string;
    cancel?: string;
    /** The answer can't be taken back easily (leaving the game): a red button. */
    danger?: boolean;
    /** Answered (with the text typed, trimmed). */
    onok: (text: string) => void;
    oncancel: () => void;
  } = $props();

  let typed = $state(untrack(() => value));
  const blank = $derived(field !== undefined && !typed.trim());
  // A click right after the question shows (the second half of the double-click that asked it) isn't the answer.
  const shownAt = Date.now();

  function answer(): void {
    if (!blank) onok(typed.trim());
  }
</script>

<div class="ia" role="group" aria-label={text ?? field}>
  {#if text}<span class="ask">{text}</span>{/if}
  {#if field !== undefined}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={typed}
      placeholder={field}
      aria-label={field}
      autofocus
      onkeydown={(e) => {
        if (e.key === 'Enter') answer();
        else if (e.key === 'Escape') oncancel();
      }}
    />
  {/if}
  <button class="small {danger ? 'bad' : 'primary'}" disabled={blank} onclick={() => Date.now() - shownAt > 400 && answer()}>{ok}</button>
  <button class="small" onclick={oncancel}>{cancel}</button>
</div>

<style>
  .ia {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .ask {
    color: var(--warn);
    font-weight: 600;
    font-size: 12px;
  }
  input {
    flex: 1 1 160px;
    min-width: 100px;
    max-width: 320px;
    padding: 2px 6px;
  }
</style>
