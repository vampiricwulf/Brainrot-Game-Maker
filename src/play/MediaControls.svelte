<!-- Host playback controls for media on the current slide (spec §6.7). -->
<script lang="ts">
  import { fmtTime, localMedia, openMediaPopup, POPUP_FAILED, remoteMedia, type MediaState } from '../lib/mediactl.svelte';
  import { mediaCommand } from '../lib/sync.svelte';
  import { toast } from '../lib/app.svelte';

  let { dual }: { dual: boolean } = $props();

  // In dual mode the audience window's copies are the real (audible) ones.
  const items = $derived<[string, MediaState][]>(
    dual ? Object.entries(remoteMedia) : Object.entries(localMedia).filter(([, s]) => s.role !== 'mirror'),
  );

  const icon = { video: '🎬', audio: '🔊', youtube: '▶️', remote: '🌐', external: '🎞' } as const;

  function open(url?: string): void {
    if (url && !openMediaPopup(url)) toast(POPUP_FAILED, 5000);
  }
</script>

{#if items.length}
  <div class="mc">
    <!-- "Click the audience window once" is in SoundWarnings: it applies to every sound, not only slide media. -->
    {#each items as [id, m] (id)}
      <div class="item" class:failed={m.failed}>
        <span class="ic" title={m.label}>{icon[m.kind]}</span>
        {#if m.failed}
          <span class="msg">{m.kind === 'youtube' ? "YouTube won't play embedded here." : "Couldn't load this media."}</span>
          <button class="primary small" onclick={() => open(m.openUrl)} title="Y">▶ Open {m.kind === 'youtube' ? 'on YouTube' : 'link'} ↗</button>
        {:else if m.kind === 'external'}
          <!-- A site's own player (Google Drive, Streamable): only showing, restarting and stopping it work from here. -->
          <span class="msg">
            {m.label}{m.shown === false ? ' is stopped.' : `: click ▶ inside it ${dual ? 'in the audience window' : 'on the stage'}.`}
            It can't be paused or sought from here.
          </span>
          {#if m.shown === false}
            <button class="small" onclick={() => mediaCommand({ el: id, op: 'play' })}>▶ Show player</button>
          {:else}
            <button class="small" onclick={() => mediaCommand({ el: id, op: 'restart' })} title="Load the player again from the start">⟲ Restart</button>
            <button class="small" onclick={() => mediaCommand({ el: id, op: 'stop' })} title="Take the player off the screen (stops its sound)">■ Stop</button>
          {/if}
          <button class="small ghost" onclick={() => open(m.openUrl)} title="Open the player in its own window (Y)">Open player window ↗</button>
        {:else}
          <button class="small" onclick={() => mediaCommand({ el: id, op: 'toggle' })} title="Space" aria-label={m.paused ? 'Play' : 'Pause'}>{m.paused ? '▶' : '⏸'}</button>
          <button class="small ghost" onclick={() => mediaCommand({ el: id, op: 'restart' })} title="Restart" aria-label="Restart">⏮</button>
          <button class="small ghost" onclick={() => mediaCommand({ el: id, op: 'seekBy', value: -5 })} title="Back 5s (←)">−5</button>
          <input
            class="seek"
            type="range"
            min="0"
            max={m.duration || 0}
            step="0.1"
            value={m.time}
            disabled={!m.duration}
            onchange={(e) => mediaCommand({ el: id, op: 'seek', value: +e.currentTarget.value })}
            aria-label="Seek"
          />
          <button class="small ghost" onclick={() => mediaCommand({ el: id, op: 'seekBy', value: 5 })} title="Forward 5s (→)">+5</button>
          <span class="time">{fmtTime(m.time)} / {fmtTime(m.duration)}</span>
          <button class="small ghost" onclick={() => mediaCommand({ el: id, op: 'muted', value: !m.muted })} title="Mute (M)" aria-label="Mute" aria-pressed={m.muted}>
            {m.muted ? '🔇' : '🔈'}
          </button>
          <input
            class="vol"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={m.volume}
            oninput={(e) => mediaCommand({ el: id, op: 'volume', value: +e.currentTarget.value })}
            aria-label="Volume"
          />
          <button class="small ghost" class:on={m.loop} onclick={() => mediaCommand({ el: id, op: 'loop', value: !m.loop })} title="Loop" aria-label="Loop" aria-pressed={m.loop}>🔁</button>
          {#if m.openUrl}
            <button class="small ghost" onclick={() => open(m.openUrl)} title="Open in its own window (Y)" aria-label="Open in its own window">↗</button>
          {/if}
          {#if m.blocked}<span class="blocked" title="The browser blocked autoplay with sound, so it's playing muted. Click the unmute button.">autoplay muted</span>{/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .mc {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    background: var(--panel-2);
    border-radius: 8px;
    padding: 4px 8px;
  }
  .item.failed {
    border: 1px solid var(--warn);
  }
  .small {
    font-size: 12px;
    padding: 3px 8px;
  }
  .seek {
    flex: 1;
    min-width: 120px;
  }
  .vol {
    width: 80px;
  }
  .time {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--muted);
  }
  .on {
    background: var(--accent-fill) !important;
    color: #fff;
  }
  .msg,
  .blocked {
    color: var(--warn);
    font-size: 12px;
  }
</style>
