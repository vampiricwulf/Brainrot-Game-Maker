<!-- Desktop app: Open… lists the games in BrainrotSaves (newest first), with Browse… for a file anywhere else. -->
<script lang="ts">
  import { formatBytes } from '../lib/media.svelte';
  import { openDataFolder, type SaveEntry } from '../lib/desktop.svelte';

  let {
    saves,
    onpick,
    onbrowse,
    onclose,
  }: { saves: SaveEntry[]; onpick: (s: SaveEntry) => void; onbrowse: () => void; onclose: () => void } = $props();
  const when = (ms: number) => (ms ? new Date(ms).toLocaleString() : '');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-label="Open a game">
    <div class="row">
      <b>Open a game</b>
      <span class="spacer"></span>
      <button class="ghost small" onclick={() => openDataFolder('saves')} title="Show the BrainrotSaves folder">📂 Saves folder</button>
      <button onclick={onbrowse}>Browse…</button>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>
    <p class="muted small">Your saves in BrainrotSaves (next to the app). Browse… opens a game from anywhere else.</p>
    <div class="list">
      {#each saves as s (s.place + s.name)}
        <button class="save" onclick={() => onpick(s)}>
          <b>{s.name}</b>
          <span class="muted small">{when(s.modified)} · {formatBytes(s.size)}{s.place === 'documents' ? ' · in Documents' : ''}</span>
        </button>
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
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
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
  .save {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
  }
  .small {
    font-size: 12px;
  }
</style>
