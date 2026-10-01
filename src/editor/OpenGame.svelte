<!-- Open…: the games New and Open… replaced lately (kept in this browser, with their undo history), and Browse… for a
     game file (an exported .html too; in the desktop app, a .bak backup). In the desktop app, BrainrotSaves… lists the
     saves and exported games (OpenSaves). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { RecentEntry } from '../lib/recent';
  import { inTauri } from '../lib/platform';

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
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onclose();
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="open-heading" data-undo="off">
    <div class="row">
      <b id="open-heading">Open a game</b>
      <span class="spacer"></span>
      {#if saves}<button onclick={onsaves}>BrainrotSaves…</button>{/if}
      <button onclick={onbrowse}>Browse…</button>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>
    <p class="muted small">
      Recent games: the last {recent.length === 1 ? 'game' : `${recent.length} games`} New or Open… replaced, with their undo
      history. They're kept in this browser only, so use Save for a copy that lasts.
    </p>
    <p class="muted small">
      Browse… opens a game file: a .brainrot, or an exported .html game{inTauri() ? ', or an older version Save kept (Game.brainrot.bak)' : ''}.{saves
        ? ' BrainrotSaves… lists your saves and exported games.'
        : ''}
    </p>
    <div class="list" bind:this={list}>
      {#each recent as e (e.key)}
        <div class="game">
          <button class="pick" onclick={() => onreopen(e)}>
            <b>{e.title}</b>
            <span class="muted small">{e.rounds} round{e.rounds === 1 ? '' : 's'} · replaced {when(e.closedAt)}</span>
          </button>
          <button class="ghost small" onclick={() => onforget(e)} title="Stop keeping this game (its files are cleaned up)">Forget</button>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(620px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  p {
    margin: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: auto;
    max-height: 60vh;
  }
  .game {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .pick {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
  }
  .small {
    font-size: 12px;
  }
</style>
