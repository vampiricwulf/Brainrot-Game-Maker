<!-- Open…: the games New and Open… replaced lately (kept in this browser, with their undo history), and under "Saved
     files", Browse… for a game file (an exported .html too; in the desktop app, a .bak backup). In the desktop app,
     BrainrotSaves… lists the saves and exported games (OpenSaves). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { modal } from '../lib/modal';
  import type { RecentEntry } from '../lib/recent';

  let {
    recent,
    saves = 0,
    onreopen,
    onforget,
    onbrowse,
    onsaves,
    onclose,
  }: {
    recent: RecentEntry[];
    /** Desktop app: how many saves BrainrotSaves holds. */
    saves?: number;
    onreopen: (e: RecentEntry) => void;
    onforget: (e: RecentEntry) => void;
    onbrowse: () => void;
    onsaves: () => void;
    onclose: () => void;
  } = $props();
  let list = $state<HTMLElement>();
  onMount(() => list?.querySelector<HTMLElement>('button')?.focus());
  const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  /** An earlier version of a game also listed (newer) above it: two kept copies of one game are told apart. */
  const earlier = (e: RecentEntry) => recent.some((x) => x !== e && x.gameId === e.gameId && x.closedAt > e.closedAt);
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <!-- Esc closes it when it's the window on top (Delete's question over it takes Esc first). -->
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="open-heading" use:modal={{ esc: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="open-heading">📂 Open a game</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <h3 class="sec" id="open-recent">Recent games</h3>
    <p class="hint">
      The last {recent.length === 1 ? 'game' : `${recent.length} games`} New or Open… replaced, with their undo history. They're
      kept in this browser only (not your saved files), so use Save for a copy that lasts.
    </p>
    <div class="list" role="group" aria-labelledby="open-recent" bind:this={list}>
      {#each recent as e (e.key)}
        <div class="game">
          <button class="pick" onclick={() => onreopen(e)}>
            <b>{e.title}</b>
            <span class="hint"
              >{earlier(e) ? 'earlier version · ' : ''}{e.rounds} round{e.rounds === 1 ? '' : 's'} · kept {when(e.closedAt)}</span
            >
          </button>
          <button
            class="ghost small danger"
            onclick={() => onforget(e)}
            aria-label="Delete “{e.title}” from Recent games"
            title="Stop keeping this game in this browser (asks first: its files are cleaned up)">🗑 Delete</button
          >
        </div>
      {/each}
    </div>
    <h3 class="sec" id="open-files">Saved files</h3>
    <div class="files" role="group" aria-labelledby="open-files">
      <p class="hint">
        A game you saved or were sent: a .brainrot, a .json, an exported .html game, or an older version the desktop app's Save
        kept (Game.brainrot.bak).{saves ? ' BrainrotSaves… lists your saves and exported games.' : ''}
      </p>
      {#if saves}<button onclick={onsaves}>BrainrotSaves…</button>{/if}
      <button onclick={onbrowse} title="Pick a game file on this computer">Browse…</button>
    </div>
    <div class="modal-foot">
      <button class="ghost" onclick={onclose}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: auto;
    max-height: 60vh;
  }
  .game {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sec {
    margin: 12px 0 2px;
    font-size: 1rem;
  }
  .files {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .files .hint {
    flex: 1;
    margin: 0;
  }
  .files button {
    flex: none;
  }
  .pick {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
  }
</style>
