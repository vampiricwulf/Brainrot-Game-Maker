<!-- Host playback controls for media on the current slide (spec §6.7). -->
<script lang="ts">
  import { fmtTime, keyTarget, localMedia, openMediaPopup, popupFailed, remoteMedia, type MediaState } from '../lib/mediactl.svelte';
  import { mediaCommand } from '../lib/sync.svelte';
  import { toast } from '../lib/app.svelte';

  let { dual }: { dual: boolean } = $props();

  // In dual mode the audience window's copies are the real (audible) ones.
  const items = $derived<[string, MediaState][]>(dual ? Object.entries(remoteMedia) : Object.entries(localMedia).filter(([, s]) => s.role !== 'mirror'));

  const icon = { video: '🎬', audio: '🔊', youtube: '▶️', remote: '🌐', external: '🎞' } as const;
  /** The row the keys reach (Space, ← →, M, Y): only its tooltips name them. */
  const keyed = $derived(keyTarget(items)?.[0]);
  /** A key's name in the tooltip of row `id`'s button ("Mute (M)"), on the row the keys reach. */
  const key = (id: string, k: string): string => (id === keyed ? ` (${k})` : '');

  /**
   * What each row is called: its label ("Video"), numbered when two rows share one ("Video 1", "Video 2"), and then its
   * number shows after its icon (two clips' rows looked the same). Never a file's name: the panel can be on stream.
   */
  const names = $derived.by(() => {
    const seen = new Map<string, number>();
    return items.map(([, m]) => {
      const n = (seen.get(m.label) ?? 0) + 1;
      seen.set(m.label, n);
      return items.filter(([, x]) => x.label === m.label).length > 1 ? `${m.label} ${n}` : m.label;
    });
  });

  function open(url?: string): void {
    if (url && !openMediaPopup(url)) toast(popupFailed(), 5000);
  }
</script>

{#if items.length}
  <div class="mc" class:many={items.length > 1}>
    <!-- "Click the audience window once" is in SoundWarnings: it applies to every sound, not only slide media. -->
    {#each items as [id, m], i (id)}
      <div class="item" class:failed={m.failed} role="group" aria-label={names[i]}>
        <span class="ic" title={names[i]}>{icon[m.kind]}</span>
        {#if names[i] !== m.label}<span class="nm" aria-hidden="true">{names[i].slice(m.label.length + 1)}</span>{/if}
        {#if m.missing}
          <!-- (A file missing from this computer: nothing to open. The editor's 🔗 Replace file… fixes it, after the show.) -->
          <span class="msg">{m.kind === 'audio' ? 'This sound’s' : 'This video’s'} file is missing from this computer.</span>
        {:else if m.failed}
          <span class="msg">{m.kind === 'youtube' ? "YouTube won't play embedded here." : "Couldn't load this media."}</span>
          <!-- (Plain: the panel's one blue is its blue button.) -->
          <button class="small" onclick={() => open(m.openUrl)} title={id === keyed ? 'Y' : undefined}
            >▶ Open {m.kind === 'youtube' ? 'on YouTube' : 'link'} ↗</button
          >
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
          <button class="small ghost" onclick={() => open(m.openUrl)} title="Open the player in its own window{key(id, 'Y')}">Open player window ↗</button>
        {:else}
          <button
            class="small"
            onclick={() => mediaCommand({ el: id, op: 'toggle' })}
            title={id === keyed ? 'Space' : m.paused ? 'Play' : 'Pause'}
            aria-label={m.paused ? 'Play' : 'Pause'}>{m.paused ? '▶' : '⏸'}</button
          >
          <button class="small ghost" onclick={() => mediaCommand({ el: id, op: 'restart' })} title="Restart" aria-label="Restart">⏮</button>
          <button
            class="small ghost"
            onclick={() => mediaCommand({ el: id, op: 'seekBy', value: -5 })}
            title="Back 5s{key(id, '←')}"
            aria-label="Back 5 seconds">−5</button
          >
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
            aria-valuetext="{fmtTime(m.time)} of {fmtTime(m.duration)}"
          />
          <button
            class="small ghost"
            onclick={() => mediaCommand({ el: id, op: 'seekBy', value: 5 })}
            title="Forward 5s{key(id, '→')}"
            aria-label="Forward 5 seconds">+5</button
          >
          <span class="time">{fmtTime(m.time)} / {fmtTime(m.duration)}</span>
          <button
            class="small ghost"
            onclick={() => mediaCommand({ el: id, op: 'muted', value: !m.muted })}
            title="Mute{key(id, 'M')}"
            aria-label="Mute"
            aria-pressed={m.muted}
          >
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
            aria-valuetext="{Math.round(m.volume * 100)}%"
          />
          <button class="small ghost" onclick={() => mediaCommand({ el: id, op: 'loop', value: !m.loop })} title="Loop" aria-label="Loop" aria-pressed={m.loop}
            >🔁</button
          >
          {#if m.openUrl}
            <button class="small ghost" onclick={() => open(m.openUrl)} title="Open in its own window{key(id, 'Y')}" aria-label="Open in its own window"
              >↗</button
            >
          {/if}
          {#if m.blocked}<span class="blocked" title="The browser blocked autoplay with sound, so it's playing muted. Click the unmute button."
              >autoplay muted</span
            >{/if}
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
  /* Several clips: thinner rows, so three of them leave the fixed bar in sight on a laptop (with the tools row folded:
     see HostPanel's mediaFold). */
  .mc.many {
    gap: 2px;
  }
  .mc.many > .item {
    padding-block: 1px;
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
  /* (Which of two clips with the same icon: its number.) */
  .nm {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    margin-left: -4px;
  }
  .time {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--muted);
  }
  .msg,
  .blocked {
    color: var(--warn);
    font-size: 12px;
  }
</style>
