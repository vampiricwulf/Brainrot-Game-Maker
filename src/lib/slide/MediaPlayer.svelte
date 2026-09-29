<!-- <video>/<audio> element for local files or direct URLs, with trimming, looping and host control. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { AudioEl, EmbedEl, VideoEl } from '../model';
  import { openMediaPopup, registerMedia, unregisterMedia, updateMedia, type MediaRole } from '../mediactl.svelte';
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
  const remote = $derived(el.kind === 'embed');
  const fit = $derived('fit' in el ? el.fit : 'contain');
  const showIcon = $derived(isAudio && (mode === 'edit' || (el.kind === 'audio' ? el.visible : true)));

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
        openUrl: remote ? (el as EmbedEl).url : undefined,
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

  function onerror(): void {
    failed = true;
    if (mode === 'play') updateMedia(el.id, { failed: true });
  }
</script>

{#if failed && remote}
  <button
    class="fallback"
    onclick={(e) => {
      e.stopPropagation();
      openMediaPopup((el as EmbedEl).url);
    }}
    title="Open the link in its own window"
  >
    <span class="big">▶</span>
    <span>Media couldn't load here. Click to open the link.</span>
  </button>
{:else if isAudio}
  <audio bind:this={node} {src} preload="auto" onloadedmetadata={onmeta} ontimeupdate={ontime} onended={onended}
    onplay={onstate} onpause={onstate} onvolumechange={onstate} onerror={onerror}></audio>
  {#if showIcon}
    <div class="icon" class:ghost={mode === 'edit' && el.kind === 'audio' && !el.visible} title={label}>🔊</div>
  {/if}
{:else}
  <!-- svelte-ignore a11y_media_has_caption -->
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
  ></video>
{/if}

<style>
  video {
    width: 100%;
    height: 100%;
    display: block;
    background: transparent;
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
    font-size: 40px;
    color: #fff;
    background: #111;
    border: 4px solid #fff;
    border-radius: 12px;
    white-space: normal;
  }
  .big {
    font-size: 140px;
    line-height: 1;
  }
</style>
