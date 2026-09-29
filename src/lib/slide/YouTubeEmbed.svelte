<!--
  YouTube embed driven by the IFrame player's postMessage protocol (no external API script needed).
  YouTube may refuse to play on pages opened from disk (no referrer → error 153), so failure is detected
  (onError, or no reply within a few seconds) and a clear "Open on YouTube" card replaces the player
  (spec §5.5 YouTube fallback).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { EmbedEl } from '../model';
  import {
    openMediaPopup, registerMedia, unregisterMedia, updateMedia, youtubeId, youtubeStart, youtubeThumb, youtubeWatchUrl,
    type MediaRole,
  } from '../mediactl.svelte';

  let { el, mode, role, label }: { el: EmbedEl; mode: 'edit' | 'play'; role: MediaRole; label: string } = $props();

  const vid = $derived(youtubeId(el.url) ?? '');
  const startAt = $derived(el.startAt ?? youtubeStart(el.url) ?? 0);
  const watchUrl = $derived(youtubeWatchUrl(vid, startAt));

  let iframe = $state<HTMLIFrameElement>();
  let failed = $state(false);
  let ready = false;
  let loop = false;
  let lastTime = 0;
  let duration = 0;

  const ORIGIN = 'https://www.youtube.com';

  function cmd(func: string, args: unknown[] = []): void {
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN);
  }

  const src = $derived.by(() => {
    const p = new URLSearchParams({
      enablejsapi: '1',
      controls: '0',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      iv_load_policy: '3',
      autoplay: el.autoplay ? '1' : '0',
      mute: role === 'mirror' || el.muted ? '1' : '0',
    });
    if (startAt) p.set('start', String(Math.floor(startAt)));
    if (el.endAt) p.set('end', String(Math.floor(el.endAt)));
    return `${ORIGIN}/embed/${vid}?${p}`;
  });

  function fail(): void {
    if (failed) return;
    failed = true;
    updateMedia(el.id, { failed: true, paused: true });
  }

  onMount(() => {
    if (mode !== 'play' || !vid) return;
    loop = el.loop;
    registerMedia(
      el.id,
      role,
      {
        play: () => cmd('playVideo'),
        pause: () => cmd('pauseVideo'),
        seek: (t) => cmd('seekTo', [t, true]),
        setVolume: (v) => cmd('setVolume', [Math.round(v * 100)]),
        setMuted: (m) => cmd(m ? 'mute' : 'unMute'),
        setLoop: (l) => {
          loop = l;
          updateMedia(el.id, { loop: l });
        },
      },
      {
        label,
        kind: 'youtube',
        paused: !el.autoplay,
        time: startAt,
        duration: 0,
        volume: el.volume,
        muted: role === 'mirror' || el.muted,
        loop,
        openUrl: youtubeWatchUrl(vid, startAt),
      },
      startAt,
    );

    const onmsg = (e: MessageEvent) => {
      if (e.source !== iframe?.contentWindow || typeof e.data !== 'string') return;
      let data: { event?: string; info?: Record<string, number> | number };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event === 'onError') return fail();
      if (data.event === 'onReady' || data.event === 'initialDelivery') {
        if (!ready) {
          ready = true;
          cmd('setVolume', [Math.round(el.volume * 100)]);
        }
      }
      if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
        ready = true;
        const info = data.info;
        const patch: Record<string, unknown> = {};
        if (typeof info.currentTime === 'number') patch.time = lastTime = info.currentTime;
        if (typeof info.duration === 'number' && info.duration > 0) patch.duration = duration = info.duration;
        if (typeof info.volume === 'number') patch.volume = info.volume / 100;
        if (typeof info.muted === 'boolean') patch.muted = info.muted;
        if (typeof info.playerState === 'number') {
          patch.paused = info.playerState !== 1 && info.playerState !== 3;
          // 0 = ended
          if (info.playerState === 0 && loop) {
            cmd('seekTo', [startAt, true]);
            cmd('playVideo');
          }
        }
        const end = el.endAt ?? duration;
        if (loop && end && lastTime >= end - 0.3) {
          cmd('seekTo', [startAt, true]);
        }
        updateMedia(el.id, patch);
      }
    };
    window.addEventListener('message', onmsg);
    // No reply at all within a few seconds (blocked, offline, embed refused): show the fallback.
    const timeout = setTimeout(() => !ready && fail(), 7000);
    return () => {
      window.removeEventListener('message', onmsg);
      clearTimeout(timeout);
      unregisterMedia(el.id);
    };
  });

  function onload(): void {
    // Ask the player to start sending events to this window.
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: el.id, channel: 'widget' }), ORIGIN);
    for (const ev of ['onReady', 'onStateChange', 'onError']) cmd('addEventListener', [ev]);
  }
</script>

{#if !vid}
  <div class="card"><span>Not a valid YouTube link</span></div>
{:else if mode === 'edit' || failed}
  <button
    class="card"
    style:background-image="url({youtubeThumb(vid)})"
    onclick={(e) => {
      e.stopPropagation();
      if (mode === 'play') openMediaPopup(watchUrl);
    }}
    title={mode === 'play' ? 'Open on YouTube in a popup window' : el.url}
    tabindex={mode === 'play' ? 0 : -1}
  >
    <span class="yt">▶</span>
    {#if mode === 'play'}<span class="msg">Open on YouTube</span>{:else}<span class="msg">YouTube · needs internet</span>{/if}
  </button>
{:else}
  <iframe
    bind:this={iframe}
    {src}
    title={label}
    {onload}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
{/if}

<style>
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: #111 center / cover no-repeat;
    color: #fff;
    font-size: 44px;
    font-weight: 700;
    text-shadow: 0 3px 10px #000;
  }
  .yt {
    display: grid;
    place-items: center;
    width: 200px;
    height: 140px;
    border-radius: 36px;
    background: #ff0000;
    font-size: 80px;
    text-shadow: none;
  }
  .msg {
    background: rgba(0, 0, 0, 0.65);
    padding: 6px 20px;
    border-radius: 10px;
  }
</style>
