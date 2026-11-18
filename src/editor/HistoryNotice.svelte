<!--
  Says what an undo or redo did ("↶ Undid Renamed category “Memes” · Round 1 › Memes" with ↷ Redo), and the steps an
  editor asks to announce ("Deleted screen “Cave”" with Undo). At the bottom of the editor (under any open window: a
  toast there says it instead), until a few seconds pass or the next change.
  Also a new change that dropped undone steps ("Dropped 4 undone steps" with ↶ Undo, which brings them back): over an
  open window too, in the room a toast has at its top (an edit in the clue editor is the usual one), and kept while the
  typing goes on in that step.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { bringBackDropped, canBringBack, history, onApplied, onDropped, onNotify, redo, undo, type HistoryEntry } from '../lib/history.svelte';
  import { goTo } from '../lib/nav.svelte';
  import { announce } from '../lib/announce';
  import { toast } from '../lib/app.svelte';

  /** The History tab is showing: it shows the steps itself. */
  let { quiet = false }: { quiet?: boolean } = $props();

  type Kind = 'undid' | 'redid' | 'made' | 'dropped';
  /**
   * `count`: the undone steps a new step dropped (`entry`, that step); `named`: that step is one an editor announces
   * ("Deleted category “Memes”"), said in the same note, whose ↶ Undo brings the dropped steps back too.
   */
  let notice = $state<{ kind: Kind; entry: HistoryEntry; index: number; count?: number; named?: boolean } | null>(null);
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

  function place(kind: Kind, entry: HistoryEntry, ms: number, said: string, count?: number): void {
    notice = { kind, entry, index: history.index, count };
    // Read out from the page's live region (one that appears with its words isn't always read).
    announce(said);
    clearTimeout(timer);
    timer = setTimeout(() => (notice = null), ms);
  }

  onMount(() => {
    // A jump from the History list shows in the list itself (and says so there). On the History tab an undo or redo
    // shows only as the list's "● Now" moving: it's still said.
    const offApplied = onApplied((e, dir, via) => {
      // (↶ Undo on dropped steps: its own toast says what it did.)
      if (via === 'list' || via === 'dropped') return;
      if (!quiet) show(dir < 0 ? 'undid' : 'redid', e, 4000);
      else announce([`${dir < 0 ? 'Undid' : 'Redid'} ${e.label}`, e.where].filter(Boolean).join(' · '));
    });
    // (A step announced that also dropped undone steps: its note says both, so its ↶ Undo never loses them unsaid.)
    const offNotify = onNotify((e) => {
      if (quiet) return;
      if (notice?.kind === 'dropped' && notice.entry.id === e.id) notice = { ...notice, named: true };
      else show('made', e, 6000);
    });
    const offDropped = onDropped((count, e) => {
      const said = `Dropped ${count} undone ${count === 1 ? 'step' : 'steps'}`;
      // (Said with the way back: the note's ↶ Undo, which Tab reaches over a window too.)
      if (!quiet) place('dropped', e, 8000, `${said}: ↶ Undo on its note brings ${count === 1 ? 'it' : 'them'} back`, count);
      else announce(said);
    });
    return () => {
      offApplied();
      offNotify();
      offDropped();
      clearTimeout(timer);
    };
  });

  // Gone at the next change, so its button always means that step. (Dropped steps' note stays while the typing that
  // dropped them goes on: that's still the same step.)
  $effect(() => {
    if (!notice) return;
    if (notice.kind === 'dropped' ? history.top !== notice.entry.id : history.pending || history.index !== notice.index) notice = null;
  });

  /** Undo the step the notice announced, if it's still the latest. */
  function undoMade(): void {
    if (notice && history.top === notice.entry.id) undo('button');
    else notice = null;
  }

  /** ↶ Undo on dropped steps: the new step goes, and they're back (still undone, for ↷ Redo). */
  function bringBack(): void {
    const n = notice?.count ?? 0;
    const undid = notice?.named ? `↶ Undid ${notice.entry.label}, and brought back` : '↶ Brought back';
    const ok = !!notice && canBringBack(notice.entry.id) && bringBackDropped();
    notice = null;
    if (ok) toast(`${undid} ${n} undone ${n === 1 ? 'step' : 'steps'}: ↷ Redo redoes them`);
  }

  /**
   * Over a window the Tab cycle takes in the note's buttons (modal.ts, [data-tab-over-modal]). When the note goes with
   * the focus on one of them, the focus goes back where it came from in the window, not lost to the page.
   */
  function giveBack(node: HTMLElement) {
    // (Where the focus came from while it's on the note; cleared once it moves on to something else.)
    let from: HTMLElement | null = null;
    const onfocusin = (e: FocusEvent) => {
      const t = e.relatedTarget;
      if (t instanceof HTMLElement && !node.contains(t)) from = t;
    };
    const onfocusout = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && !node.contains(e.relatedTarget)) from = null;
    };
    node.addEventListener('focusin', onfocusin);
    node.addEventListener('focusout', onfocusout);
    return {
      destroy() {
        // (By now the note may be out of the page already, the focus with it.)
        const lost = node.contains(document.activeElement) || !document.activeElement || document.activeElement === document.body;
        if (!from || !lost) return;
        const win = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].at(-1);
        const to = from.isConnected && !from.closest('[inert]') ? from : win;
        queueMicrotask(() => {
          if (to?.isConnected && (!document.activeElement || document.activeElement === document.body)) to.focus({ preventScroll: true });
        });
      },
    };
  }

  function showHistory(): void {
    notice = null;
    goTo({ tab: 'history' });
  }
</script>

{#if notice && !quiet}
  {@const { kind, entry } = notice}
  <!-- (A note of its own for dropped steps: one shown before a window opened is inert under it, and this one is over it.) -->
  {#key kind === 'dropped'}
  <div
    class="history-notice note-pill"
    class:over={kind === 'dropped'}
    data-over-modal={kind === 'dropped' || undefined}
    data-tab-over-modal={kind === 'dropped' || undefined}
    use:giveBack
    role="region"
    aria-label="Last change"
    title={kind === 'dropped' ? 'A new change drops the steps you undid (↷): Undo takes it back and brings them back (over a window, Tab reaches it)' : [entry.label, entry.where].filter(Boolean).join(' · ')}
  >
    <span class="text">
      {#if kind === 'dropped'}
        {#if notice.named}{entry.label} ·{/if}
        {notice.named ? 'dropped' : 'Dropped'} {notice.count} undone {notice.count === 1 ? 'step' : 'steps'}
      {:else if kind === 'made'}
        {entry.label}
      {:else}
        {kind === 'undid' ? '↶ Undid' : '↷ Redid'} <b>{entry.label}</b>
      {/if}
      {#if entry.where && kind !== 'dropped'}<span class="muted">· {entry.where}</span>{/if}
    </span>
    {#if kind === 'dropped'}
      <button class="small" onclick={bringBack} data-bring-back>↶ Undo</button>
    {:else if kind === 'undid'}
      <button class="small" onclick={() => redo('button')}>↷ Redo</button>
    {:else if kind === 'redid'}
      <button class="small" onclick={() => undo('button')}>↶ Undo</button>
    {:else}
      <button class="small" onclick={undoMade}>↶ Undo</button>
    {/if}
    <button class="small ghost" onclick={showHistory} title="Every change to this game">🕘 History</button>
  </div>
  {/key}
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
  /* Dropped steps' note, with a window open: over it, at its top (the room every window leaves for a toast). */
  :global(body:has([aria-modal='true'])) .history-notice.over {
    z-index: var(--z-toast);
    top: 8px;
    bottom: auto;
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
