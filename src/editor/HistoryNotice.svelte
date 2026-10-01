<!--
  Says what an undo or redo did ("↶ Undid Renamed category “Memes” · Round 1 › Memes" with ↷ Redo), and the steps an
  editor asks to announce ("Deleted screen “Cave”" with Undo). At the bottom of the editor, over the clue editor and
  slide dialogs, until a few seconds pass or the next change.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { history, onApplied, onNotify, redo, undo, type HistoryEntry } from '../lib/history.svelte';
  import { goTo } from '../lib/nav.svelte';
  import { announce } from '../lib/announce';

  /** The History tab is showing: it shows the steps itself. */
  let { quiet = false }: { quiet?: boolean } = $props();

  type Kind = 'undid' | 'redid' | 'made';
  let notice = $state<{ kind: Kind; entry: HistoryEntry; index: number } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(kind: Kind, entry: HistoryEntry, ms: number): void {
    notice = { kind, entry, index: history.index };
    // Read out from the page's live region (one that appears with its words isn't always read).
    announce([kind === 'made' ? entry.label : `${kind === 'undid' ? 'Undid' : 'Redid'} ${entry.label}`, entry.where].filter(Boolean).join(' · '));
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
  <div class="history-notice" data-over-modal title={[entry.label, entry.where].filter(Boolean).join(' · ')}>
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
    position: fixed;
    left: 50%;
    bottom: 18px;
    translate: -50% 0;
    /* Over the clue editor (100) and the slide editor's dialogs (150). */
    z-index: 400;
    display: flex;
    gap: 10px;
    align-items: center;
    max-width: min(720px, calc(100vw - 32px));
    padding: 8px 10px 8px 14px;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    font-size: 13px;
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
