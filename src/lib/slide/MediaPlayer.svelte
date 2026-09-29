<!-- <video>/<audio> element for local files or direct URLs, with trimming, looping and host control. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { AudioEl, EmbedEl, VideoEl } from '../model';
  import { localMedia, openMediaPopup, registerMedia, unregisterMedia, updateMedia, type MediaRole } from '../mediactl.svelte';
  import { mediaCommand } from '../sync.svelte';
  import { applySink } from '../audioout.svelte';

  let {
    el,
    src,
    mode,
    role,
    label,
  }: {
    el: VideoEl | AudioEl | EmbedEl;
    src: string | undefined;
    mode: 'edit' | 'play';
    role: MediaRole;
    label: string;
  } = $props();

  const isAudio = $derived(el.kind === 'audio' || (el.kind === 'embed' && el.embedKind === 'remoteAudio'));
  // Played from the internet: an old-style online item, or a file that's a live link (not a stored blob).
  const remote = $derived(el.kind === 'embed' || (!!src && !src.startsWith('blob:')));
  const openUrl = $derived(el.kind === 'embed' ? el.url : src);
  const fit = $derived('fit' in el ? el.fit : 'contain');
  const showIcon = $derived(isAudio && (mode === 'edit' || (el.kind === 'audio' ? el.visible : true)));
  /** Seen only by the host (the editor, or the host's copy of the stage), never by viewers. */
  const hostView = $derived(mode === 'edit' || role === 'mirror');
  /** In play, the host clicks a sound's icon or a video to play or pause it (not to reveal the answer). */
  const clickable = $derived(mode === 'play' && role !== 'audience');
  const playing = $derived(clickable && localMedia[el.id]?.paused === false);

  let node = $state<HTMLVideoElement | HTMLAudioElement>();
  let failed = $state(false);
  let loop = false;
  /** Routed to the chosen audio output (Game audio output) before it first plays. */
  let sinkReady: Promise<void> = Promise.resolve();

  function start(): number {
    return el.startAt ?? 0;
  }

  function tryPlay(): void {
    const n = node;
    if (!n) return;
    sinkReady.then(() => n.play()).catch((err: DOMException) => {
      // Autoplay with sound blocked: fall back to muted playback and tell the host.
      if (err?.name === 'NotAllowedError' && !n.muted) {
        n.muted = true;
        updateMedia(el.id, { blocked: true, muted: true });
        n.play().catch(() => updateMedia(el.id, { paused: true }));
      }
    });
  }

  onMount(() => {
    if (mode !== 'play' || !node) return;
    const n = node;
    loop = el.loop;
    n.volume = Math.max(0, Math.min(1, el.volume));
    n.muted = role === 'mirror' || el.muted;
    if (role !== 'mirror') sinkReady = applySink(n);
    registerMedia(
      el.id,
      role,
      {
        play: tryPlay,
        pause: () => n.pause(),
        seek: (t) => (n.currentTime = t),
        setVolume: (v) => (n.volume = Math.max(0, Math.min(1, v))),
        setMuted: (m) => (n.muted = m),
        setLoop: (l) => {
          loop = l;
          updateMedia(el.id, { loop: l });
        },
      },
      {
        label,
        kind: remote ? 'remote' : isAudio ? 'audio' : 'video',
        paused: true,
        time: 0,
        duration: 0,
        volume: n.volume,
        muted: n.muted,
        loop,
        openUrl: remote ? openUrl : undefined,
      },
      start(),
    );
    return () => {
      n.pause();
      unregisterMedia(el.id);
    };
  });

  function onmeta(): void {
    if (!node) return;
    if (start()) node.currentTime = start();
    if (mode === 'play') {
      updateMedia(el.id, { duration: node.duration });
      if (el.autoplay) tryPlay();
    }
  }

  function ontime(): void {
    if (!node || mode !== 'play') return;
    const end = el.endAt;
    if (end && node.currentTime >= end) {
      if (loop) node.currentTime = start();
      else node.pause();
    }
    updateMedia(el.id, { time: node.currentTime });
  }

  function onended(): void {
    if (mode === 'play' && loop && node) {
      node.currentTime = start();
      tryPlay();
    }
  }

  function onstate(): void {
    if (mode === 'play' && node) updateMedia(el.id, { paused: node.paused, volume: node.volume, muted: node.muted });
  }

  /** Played through the host's controls, so the audience window follows along. */
  function toggle(e: MouseEvent): void {
    e.stopPropagation();
    mediaCommand({ el: el.id, op: 'toggle' });
  }

  function onerror(): void {
    failed = true;
    if (mode === 'play') updateMedia(el.id, { failed: true });
  }
</script>

{#if failed && remote}
  <!-- Only the editor and the host's copy say so: the screen viewers watch (and OBS captures) shows nothing,
       and the host's media controls already offer the link. -->
  {#if hostView}
    <button
      class="fallback"
      onclick={(e) => {
        e.stopPropagation();
        if (openUrl) openMediaPopup(openUrl);
      }}
      title="Open the link in its own window"
    >
      <span class="big">▶</span>
      <span class="msg">Media couldn't load here. Click to open the link.</span>
    </button>
  {/if}
{:else if isAudio}
  <audio bind:this={node} {src} preload="auto" onloadedmetadata={onmeta} ontimeupdate={ontime} onended={onended}
    onplay={onstate} onpause={onstate} onvolumechange={onstate} onerror={onerror}></audio>
  {#if showIcon && clickable}
    <button
      class="icon"
      class:playing
      onpointerdown={(e) => e.stopPropagation()}
      onclick={toggle}
      title={`${playing ? 'Pause' : 'Play'} ${label}`}
      aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
    >{playing && role === 'mirror' ? '⏸' : '🔊'}</button>
  {:else if showIcon}
    <div class="icon" class:ghost={mode === 'edit' && el.kind === 'audio' && !el.visible} title={label}>🔊</div>
  {/if}
{:else}
  <!-- The host's media controls (and Space) do the same as a click, so no key handler here. -->
  <!-- svelte-ignore a11y_media_has_caption, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <video
    bind:this={node}
    {src}
    style:object-fit={fit}
    playsinline
    preload={mode === 'edit' ? 'metadata' : 'auto'}
    muted={mode === 'edit' || role === 'mirror' || el.muted}
    onloadedmetadata={onmeta}
    ontimeupdate={ontime}
    onended={onended}
    onplay={onstate}
    onpause={onstate}
    onvolumechange={onstate}
    onerror={onerror}
    class:clickable
    onpointerdown={clickable ? (e) => e.stopPropagation() : undefined}
    onclick={clickable ? toggle : undefined}
    title={clickable ? `${playing ? 'Pause' : 'Play'} ${label}` : undefined}
  ></video>
{/if}

<style>
  video {
    width: 100%;
    height: 100%;
    display: block;
    background: transparent;
  }
  video.clickable {
    cursor: pointer;
  }
  .icon {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 90px;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 50%;
  }
  button.icon {
    padding: 0;
    border: none;
    color: inherit;
    cursor: pointer;
  }
  button.icon:hover {
    background: rgba(0, 0, 0, 0.65);
  }
  button.icon.playing {
    outline: 4px solid rgba(255, 255, 255, 0.7);
  }
  .icon.ghost {
    opacity: 0.5;
    outline: 4px dashed rgba(255, 255, 255, 0.6);
  }
  .fallback {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    /* Its text is sized to the box, so a small sound icon's box still fits the message. */
    container-type: size;
    overflow: hidden;
    color: #fff;
    background: #111;
    border: 4px solid #fff;
    border-radius: 12px;
    white-space: normal;
  }
  .big {
    font-size: min(140px, 30cqmin);
    line-height: 1;
  }
  .msg {
    font-size: min(40px, 11cqmin);
  }
</style>
