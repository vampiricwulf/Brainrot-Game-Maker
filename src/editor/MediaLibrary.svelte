<!-- Every file stored with the game, with usage counts and cleanup (spec §5.5). -->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { ACCEPT, addMediaFile, canPlay, formatBytes, mediaUrls } from '../lib/media.svelte';
  import { allEmbeds, mediaUsage } from '../lib/usage';
  import { openMediaPopup, youtubeId, youtubeWatchUrl } from '../lib/mediactl.svelte';

  const game = $derived(app.game);
  const usage = $derived(mediaUsage(game));
  const total = $derived(game.media.reduce((a, m) => a + m.size, 0));
  const unused = $derived(game.media.filter((m) => !usage.get(m.id)));
  const embeds = $derived(allEmbeds(game));
  const icon = { image: '🖼', video: '🎬', audio: '🔊', font: '🔤' } as const;

  function remove(ids: string[]): void {
    game.media = game.media.filter((m) => !ids.includes(m.id));
  }

  async function upload(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = `${ACCEPT.any},${ACCEPT.font}`;
    input.onchange = async () => {
      for (const f of Array.from(input.files ?? [])) {
        try {
          const ref = await addMediaFile(game, f);
          if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime)) toast(`⚠ This browser may not play "${ref.name}"`, 6000);
        } catch (e) {
          toast((e as Error).message, 5000);
        }
      }
    };
    input.click();
  }
</script>

<h2>Media</h2>
<p class="muted">
  Files stored with this game: {game.media.length} · {formatBytes(total)}.
  {#if total > 100 * 1024 ** 2}<span class="warn">Large games are fine as .jbr packs but make big standalone HTML exports.</span>{/if}
</p>
<div class="row">
  <button onclick={upload}>⬆ Add files…</button>
  <button disabled={!unused.length} onclick={() => confirm(`Remove ${unused.length} unused file(s)?`) && remove(unused.map((m) => m.id))}>
    🧹 Remove unused ({unused.length})
  </button>
</div>

<div class="grid">
  {#each game.media as m (m.id)}
    {@const n = usage.get(m.id) ?? 0}
    <div class="card" class:unused={!n}>
      <div class="thumb">
        {#if m.kind === 'image' && mediaUrls[m.id]}
          <img src={mediaUrls[m.id]} alt="" />
        {:else if m.kind === 'video' && mediaUrls[m.id]}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={mediaUrls[m.id]} preload="metadata" muted></video>
        {:else}
          <span class="ic">{icon[m.kind]}</span>
        {/if}
        {#if !mediaUrls[m.id]}<span class="missing">missing</span>{/if}
      </div>
      <div class="nm" title={m.name}>{m.name}</div>
      <div class="meta muted">
        {formatBytes(m.size)} · {n ? `used ${n}×` : 'unused'}
        {#if (m.kind === 'video' || m.kind === 'audio') && !canPlay(m.mime)}<span class="warn" title={m.mime}> · may not play</span>{/if}
      </div>
      <button class="ghost small" onclick={() => (!n || confirm(`"${m.name}" is used ${n}×. Remove it anyway?`)) && remove([m.id])}>Remove</button>
    </div>
  {/each}
</div>

{#if embeds.length}
  <h3>🌐 Online media (needs internet during the game)</h3>
  <p class="muted">YouTube may refuse to play inside a file opened from disk. The host always gets an "Open on YouTube" button for these.</p>
  <table>
    <tbody>
      {#each embeds as { el, where }}
        <tr>
          <td>{el.embedKind === 'youtube' ? '▶️' : '🌐'}</td>
          <td class="url" title={el.url}>{el.url}</td>
          <td class="muted">{where}</td>
          <td><button class="small" onclick={() => { const id = youtubeId(el.url); openMediaPopup(id ? youtubeWatchUrl(id, el.startAt) : el.url); }}>Check ↗</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h2 {
    margin: 0 0 4px;
  }
  h3 {
    margin: 24px 0 4px;
  }
  p {
    margin: 0 0 12px;
  }
  .warn {
    color: var(--warn);
  }
  .grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .card.unused {
    border-style: dashed;
  }
  .thumb {
    position: relative;
    height: 100px;
    background: #000;
    border-radius: 4px;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .thumb img,
  .thumb video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ic {
    font-size: 40px;
  }
  .missing {
    position: absolute;
    bottom: 4px;
    font-size: 11px;
    color: var(--bad);
  }
  .nm {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 11px;
  }
  .small {
    font-size: 12px;
    align-self: flex-start;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 1000px;
  }
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .url {
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
