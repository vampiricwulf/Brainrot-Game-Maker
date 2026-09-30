<!-- Popover: pick a file already in the game, upload a new one, or paste a link to one online. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { toast, editedGame } from '../../lib/app.svelte';
  import { ACCEPT, addMediaFile, canPlay, formatBytes, imgFallback, mediaUrls } from '../../lib/media.svelte';
  import { pickFile } from '../../lib/fileio';
  import { linkHost } from '../../lib/links';
  import type { MediaKind } from '../../lib/model';
  import LinkField from '../LinkField.svelte';

  let {
    kind,
    anchor,
    onpick,
    onclose,
  }: {
    kind: MediaKind;
    /** What it drops from (by default the element it's placed in, which holds the button that opened it). */
    anchor?: HTMLElement;
    onpick: (id: string) => void;
    onclose: () => void;
  } = $props();
  const items = $derived(editedGame().media.filter((m) => m.kind === kind));

  // Fixed to the window, so no scrolling panel or dialog edge cuts it off: under the button (over it when
  // there's more room above), and moved in from the window's edges.
  let box = $state<HTMLDivElement>();
  let place = $state<{ left: number; top?: number; bottom?: number; maxHeight: number }>();
  function position(): void {
    const a = (anchor ?? box?.parentElement)?.getBoundingClientRect();
    if (!a || !box) return;
    const left = Math.max(8, Math.min(a.left, innerWidth - box.offsetWidth - 8));
    const below = innerHeight - a.bottom - 12;
    const above = a.top - 12;
    place =
      below >= Math.min(box.scrollHeight, 420) || below >= above
        ? { left, top: a.bottom + 4, maxHeight: Math.min(420, below) }
        : { left, bottom: innerHeight - a.top + 4, maxHeight: Math.min(420, above) };
  }
  onMount(position);
  const px = (n?: number) => (n === undefined ? undefined : `${n}px`);

  async function upload(): Promise<void> {
    const file = await pickFile(ACCEPT[kind]);
    if (!file) return;
    try {
      const ref = await addMediaFile(editedGame(), file);
      if (ref.kind !== kind) toast(`That's ${ref.kind === 'image' ? 'an' : 'a'} ${ref.kind} file; added it anyway.`);
      if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime))
        toast(`⚠ This browser may not play "${ref.name}" (${ref.mime}). Try converting it to MP4 (H.264) or MP3.`, 7000);
      onpick(ref.id);
    } catch (e) {
      toast((e as Error).message, 5000);
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} onresize={position} />

<div class="backdrop" onclick={onclose} role="presentation"></div>
<div
  class="picker"
  class:placed={!!place}
  bind:this={box}
  style:left={px(place?.left)}
  style:top={px(place?.top)}
  style:bottom={px(place?.bottom)}
  style:max-height={px(place?.maxHeight)}
  role="dialog"
  aria-label="Choose {kind}"
>
  <button class="primary" onclick={upload}>⬆ Upload {kind} file…</button>
  <!-- Fonts need the file itself (a font can't be used from a link without the site's permission). -->
  {#if kind !== 'font'}
    <div class="muted small">Or paste a link to one online:</div>
    <LinkField want={kind} onmedia={(ref) => onpick(ref.id)} />
  {/if}
  {#if items.length}
    <div class="muted small">Or reuse one from this game:</div>
    <div class="list">
      {#each items as m (m.id)}
        <button class="item" onclick={() => onpick(m.id)} title={m.name}>
          {#if kind === 'image' && mediaUrls[m.id]}
            <img src={mediaUrls[m.id]} alt="" onerror={imgFallback} />
          {:else}
            <span class="ic">{kind === 'video' ? '🎬' : kind === 'audio' ? '🔊' : '🔤'}</span>
          {/if}
          <span class="nm">{m.name}</span>
          <span class="muted small" title={m.url ? 'Plays from the internet' : undefined}>{m.url ? `🌐 ${linkHost(m.url)}` : formatBytes(m.size)}</span>
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
    position: fixed;
    z-index: 201;
    width: min(320px, calc(100vw - 16px));
    max-height: 420px;
    overflow: auto;
    /* Hidden for the moment before it's placed. */
    visibility: hidden;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .picker.placed {
    visibility: visible;
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
  .item .muted {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
