<!-- Popover: pick a file already in the game, or upload a new one. -->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { ACCEPT, addMediaFile, canPlay, formatBytes, mediaUrls } from '../../lib/media.svelte';
  import { pickFile } from '../../lib/fileio';
  import type { MediaKind } from '../../lib/model';

  let { kind, onpick, onclose }: { kind: MediaKind; onpick: (id: string) => void; onclose: () => void } = $props();
  const items = $derived(app.game.media.filter((m) => m.kind === kind));

  async function upload(): Promise<void> {
    const file = await pickFile(ACCEPT[kind]);
    if (!file) return;
    try {
      const ref = await addMediaFile(app.game, file);
      if (ref.kind !== kind) toast(`That's ${ref.kind === 'image' ? 'an' : 'a'} ${ref.kind} file; added it anyway.`);
      if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime))
        toast(`⚠ This browser may not play "${ref.name}" (${ref.mime}). Try converting it to MP4 (H.264) or MP3.`, 7000);
      onpick(ref.id);
    } catch (e) {
      toast((e as Error).message, 5000);
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" onclick={onclose} role="presentation"></div>
<div class="picker" role="dialog" aria-label="Choose {kind}">
  <button class="primary" onclick={upload}>⬆ Upload {kind} file…</button>
  {#if items.length}
    <div class="muted small">Or reuse one from this game:</div>
    <div class="list">
      {#each items as m (m.id)}
        <button class="item" onclick={() => onpick(m.id)} title={m.name}>
          {#if kind === 'image' && mediaUrls[m.id]}
            <img src={mediaUrls[m.id]} alt="" />
          {:else}
            <span class="ic">{kind === 'video' ? '🎬' : kind === 'audio' ? '🔊' : '🔤'}</span>
          {/if}
          <span class="nm">{m.name}</span>
          <span class="muted small">{formatBytes(m.size)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
  }
  .picker {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    z-index: 201;
    width: 320px;
    max-height: 420px;
    overflow: auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px;
    white-space: normal;
    min-width: 0;
  }
  .item img {
    width: 100%;
    height: 70px;
    object-fit: contain;
    background: #000;
  }
  .ic {
    font-size: 32px;
    height: 70px;
    display: grid;
    place-items: center;
  }
  .nm {
    font-size: 11px;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .small {
    font-size: 11px;
  }
</style>
