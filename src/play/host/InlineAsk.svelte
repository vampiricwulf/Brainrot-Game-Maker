<!--
  A question asked right in the host panel, where a browser dialog (prompt, confirm) would show on stream: the
  question, a text box when it wants a name or some text, then Cancel (the safe answer, on the left) and the answer
  button (rightmost, filled red when it can't easily be taken back). In the box, Enter answers and Esc cancels.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';

  let {
    text,
    field,
    value = '',
    ok,
    cancel = 'Cancel',
    danger = false,
    focusCancel = false,
    alt,
    onalt,
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
    /**
     * With no text box: the focus goes to Cancel, so Enter or Space presses the harmless choice (never the host's
     * Enter = Award), and Esc there cancels.
     */
    focusCancel?: boolean;
    /** A second answer, between Cancel and the answer button (Leave: "Discard & leave" beside "Keep & leave"). */
    alt?: string;
    onalt?: () => void;
    /** Answered (with the text typed, trimmed). */
    onok: (text: string) => void;
    oncancel: () => void;
  } = $props();

  let typed = $state(untrack(() => value));
  let box = $state<HTMLInputElement>();
  let cancelBtn = $state<HTMLButtonElement>();
  /** What had the keys when it asked (🚪 Exit, Next round ▶…): Cancel gives them back there. */
  let opener: HTMLElement | null = null;
  // Into the box, with the text it starts with selected so typing replaces it. (Not `autofocus`: that leaves the focus
  // on the button that asked, where typing would reach the host's shortcuts.)
  onMount(() => {
    const a = document.activeElement;
    // (Not another question's Cancel: a question asked again in its place keeps the first one's opener out of reach.)
    opener = a instanceof HTMLElement && a !== document.body && !a.closest('.ia') ? a : null;
    if (box) box.select();
    else if (focusCancel) cancelBtn?.focus();
  });
  /**
   * Cancelled: the keys go back to what asked, not to the first button of the panel around (which may be one that
   * changes the game), unless the cancel put them somewhere itself.
   */
  function cancelled(): void {
    const back = opener;
    oncancel();
    void tick().then(() => {
      const at = document.activeElement;
      if (at && at !== document.body && at.isConnected) return;
      if (back?.isConnected && !back.closest('[inert]') && !back.matches(':disabled')) back.focus({ preventScroll: true });
    });
  }
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
    <input
      bind:this={box}
      bind:value={typed}
      placeholder={field}
      aria-label={field}
      onkeydown={(e) => {
        if (e.key === 'Enter') answer();
        else if (e.key === 'Escape') cancelled();
      }}
    />
  {/if}
  <button
    class="small ghost"
    bind:this={cancelBtn}
    onclick={cancelled}
    onkeydown={(e) => {
      // The keys stay here: Enter or Space presses Cancel, Esc cancels (neither reaches the host's shortcuts).
      if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      else if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        cancelled();
      }
    }}>{cancel}</button
  >
  {#if alt && onalt}
    <button class="small ghost" onclick={() => Date.now() - shownAt > 400 && onalt()}>{alt}</button>
  {/if}
  <button class="small {danger ? 'bad' : 'primary'}" disabled={blank} onclick={() => Date.now() - shownAt > 400 && answer()}>{ok}</button>
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
