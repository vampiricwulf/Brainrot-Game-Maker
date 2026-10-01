<!-- Desktop app: Open… lists the games in BrainrotSaves (newest first), with Browse… for a file anywhere else. -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import { toast } from '../lib/app.svelte';
  import { formatBytes } from '../lib/media.svelte';
  import { openDataFolder, type SaveEntry } from '../lib/desktop.svelte';

  let {
    saves,
    onpick,
    onbrowse,
    onrecent,
    onclose,
  }: {
    saves: SaveEntry[];
    onpick: (s: SaveEntry) => void;
    onbrowse: () => void;
    /** Back to Open…'s Recent games (only when there are some). */
    onrecent?: () => void;
    onclose: () => void;
  } = $props();
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
    if (err) toast(err);
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <!-- Esc closes it when it's the window on top (a question over it takes Esc first). -->
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="saves-heading" use:modal={{ esc: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="saves-heading">📂 Open a game</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <p class="hint">
      Your saves and exported games in BrainrotSaves ({where}). Browse… opens a game file from anywhere else (.brainrot, .json
      or an exported .html), or an older version Save kept (Game.brainrot.bak).
    </p>
    <div class="list">
      {#each saves as s (s.place + s.name)}
        <button class="save" onclick={() => onpick(s)}>
          <b>{s.name}</b>
          <span class="hint"
            >{exported(s) ? 'Exported game · ' : ''}{when(s.modified)} · {formatBytes(s.size)}{s.place === 'documents' ? ' · in Documents' : ''}</span
          >
        </button>
      {/each}
    </div>
    <div class="modal-foot">
      <button class="ghost" onclick={onclose}>Cancel</button>
      <button class="ghost" onclick={showFolder} title="Show the BrainrotSaves folder">📂 Saves folder</button>
      <span class="spacer"></span>
      {#if onrecent}<button onclick={onrecent}>Recent games…</button>{/if}
      <button onclick={onbrowse}>Browse…</button>
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
  .save {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
  }
</style>
