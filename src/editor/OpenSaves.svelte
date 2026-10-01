<!-- Desktop app: Open… lists the games in BrainrotSaves (newest first), with Browse… for a file anywhere else. -->
<script lang="ts">
  import { toast } from '../lib/app.svelte';
  import { formatBytes } from '../lib/media.svelte';
  import { openDataFolder, type SaveEntry } from '../lib/desktop.svelte';

  let {
    saves,
    onpick,
    onbrowse,
    onclose,
  }: { saves: SaveEntry[]; onpick: (s: SaveEntry) => void; onbrowse: () => void; onclose: () => void } = $props();
  const when = (ms: number) => (ms ? new Date(ms).toLocaleString() : '');
  /** An exported .html: Open… edits the game inside it. */
  const exported = (s: SaveEntry) => /\.html?$/i.test(s.name);
  // Saves go to Documents when the app's folder can't be written: 📂 shows the folder the newest save is in.
  const newest = $derived(saves.reduce<SaveEntry | undefined>((a, b) => (!a || b.modified > a.modified ? b : a), undefined));
  const inDocuments = $derived(saves.filter((s) => s.place === 'documents').length);
  const where = $derived(
    !inDocuments ? 'next to the app' : inDocuments === saves.length ? 'in Documents' : 'next to the app, and in Documents',
  );

  async function showFolder(): Promise<void> {
    const err = await openDataFolder(newest?.place === 'documents' ? 'saves-documents' : 'saves');
    if (err) toast(err, 6000);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Open a game" data-undo="off">
    <div class="row">
      <b>Open a game</b>
      <span class="spacer"></span>
      <button class="ghost small" onclick={showFolder} title="Show the BrainrotSaves folder">📂 Saves folder</button>
      <button onclick={onbrowse}>Browse…</button>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>
    <p class="muted small">
      Your saves and exported games in BrainrotSaves ({where}). Browse… opens a game from anywhere else, or an older version
      Save kept (Game.brainrot.bak).
    </p>
    <div class="list">
      {#each saves as s (s.place + s.name)}
        <button class="save" onclick={() => onpick(s)}>
          <b>{s.name}</b>
          <span class="muted small"
            >{exported(s) ? 'Exported game · ' : ''}{when(s.modified)} · {formatBytes(s.size)}{s.place === 'documents' ? ' · in Documents' : ''}</span
          >
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
