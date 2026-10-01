<!--
  Says what an undo or redo did ("↶ Undid Renamed category “Memes” · Round 1 › Memes" with ↷ Redo), and the steps an
  editor asks to announce ("Deleted screen “Cave”" with Undo). At the bottom of the editor (under any open window: a
  toast there says it instead), until a few seconds pass or the next change.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { history, onApplied, onNotify, redo, undo, type HistoryEntry } from '../lib/history.svelte';
  import { goTo } from '../lib/nav.svelte';
  import { announce } from '../lib/announce';
  import { toast } from '../lib/app.svelte';

  /** The History tab is showing: it shows the steps itself. */
  let { quiet = false }: { quiet?: boolean } = $props();

  type Kind = 'undid' | 'redid' | 'made';
  let notice = $state<{ kind: Kind; entry: HistoryEntry; index: number } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(kind: Kind, entry: HistoryEntry, ms: number): void {
    // (Once the page has caught up: a window that made the step as it closes, like Import clues, is gone by then.)
    const index = history.index;
    setTimeout(() => {
      if (history.index !== index) return;
      const said = [kind === 'made' ? entry.label : `${kind === 'undid' ? 'Undid' : 'Redid'} ${entry.label}`, entry.where].filter(Boolean).join(' · ');
      // A window is open (the clue editor): the note would be under it, so a toast above it says what happened.
      if (document.querySelector('[aria-modal="true"]')) return toast(`${kind === 'undid' ? '↶ ' : kind === 'redid' ? '↷ ' : ''}${said}`);
      place(kind, entry, ms, said);
    });
  }

  function place(kind: Kind, entry: HistoryEntry, ms: number, said: string): void {
    notice = { kind, entry, index: history.index };
    // Read out from the page's live region (one that appears with its words isn't always read).
    announce(said);
    clearTimeout(timer);
    timer = setTimeout(() => (notice = null), ms);
  }

  onMount(() => {
    // A jump from the History list shows in the list itself.
    const offApplied = onApplied((e, dir, via) => via !== 'list' && !quiet && show(dir < 0 ? 'undid' : 'redid', e, 4000));
    const offNotify = onNotify((e) => !quiet && show('made', e, 6000));
    return () => {
      offApplied();
      offNotify();
      clearTimeout(timer);
    };
  });

  // Gone at the next change, so its button always means that step.
  $effect(() => {
    if (notice && (history.pending || history.index !== notice.index)) notice = null;
  });

  /** Undo the step the notice announced, if it's still the latest. */
  function undoMade(): void {
    if (notice && history.top === notice.entry.id) undo('button');
    else notice = null;
  }

  function showHistory(): void {
    notice = null;
    goTo({ tab: 'history' });
  }
</script>

{#if notice && !quiet}
  {@const { kind, entry } = notice}
  <div class="history-notice note-pill" role="region" aria-label="Last change" title={[entry.label, entry.where].filter(Boolean).join(' · ')}>
    <span class="text">
      {#if kind === 'made'}
        {entry.label}
      {:else}
        {kind === 'undid' ? '↶ Undid' : '↷ Redid'} <b>{entry.label}</b>
      {/if}
      {#if entry.where}<span class="muted">· {entry.where}</span>{/if}
    </span>
    {#if kind === 'undid'}
      <button class="small" onclick={() => redo('button')}>↷ Redo</button>
    {:else if kind === 'redid'}
      <button class="small" onclick={() => undo('button')}>↶ Undo</button>
    {:else}
      <button class="small" onclick={undoMade}>↶ Undo</button>
    {/if}
    <button class="small ghost" onclick={showHistory} title="Every change to this game">🕘 History</button>
  </div>
{/if}

<style>
  .history-notice {
    /* Under windows' backdrops (--z-modal): it never covers a window's buttons. */
    z-index: var(--z-notice);
    padding: 4px 6px 4px 16px;
    /* Only its buttons take the mouse: a drag or a click beside them reaches the page underneath. */
    pointer-events: none;
  }
  .history-notice :global(button) {
    pointer-events: auto;
  }
  .text {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button {
    flex-shrink: 0;
  }
</style>
