<!--
  YouTube embed driven by the IFrame player's postMessage protocol (no external API script needed).
  YouTube may refuse to play on pages opened from disk (no referrer → error 153), so failure is detected
  (onError, or no reply within a few seconds) and a clear "Open on YouTube" card replaces the player
  (spec §5.5 YouTube fallback).
  Sound only (el.soundOnly): the player loads and plays as ever, but unseen (see-through, not removed or shrunk to
  nothing, which can stop it), and viewers get nothing, a 🔊 speaker, or the speaker and a time bar in its place; never
  its picture or the fallback card (the host's copy alone shows that).
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { EmbedEl } from '../model';
  import { playRange } from '../editing';
  import { mediaCommand } from '../sync.svelte';
  import { isSoundOnly, rangeProgress, soundShows, timeText } from '../soundonly';
  import {
    localMedia, openMediaPopup, registerMedia, setMediaRole, unregisterMedia, updateMedia, youtubeId, youtubeStart, youtubeThumb, youtubeWatchUrl,
    type MediaRole,
  } from '../mediactl.svelte';

  let { el, mode, role, label }: { el: EmbedEl; mode: 'edit' | 'play'; role: MediaRole; label: string } = $props();

  const vid = $derived(youtubeId(el.url) ?? '');
  // (A Stop at that isn't after the start is no stop: it plays to the end.)
  const range = $derived(playRange(el.startAt ?? youtubeStart(el.url), el.endAt));
  const startAt = $derived(range.start);
  const watchUrl = $derived(youtubeWatchUrl(vid, startAt));

  const soundOnly = $derived(isSoundOnly(el));
  const shows = $derived(soundShows(el));
  /** Seen only by the host (the editor, or the host's copy of the stage), never by viewers. */
  const hostView = $derived(mode === 'edit' || role === 'mirror');
  /** In play, the host clicks a Sound only item's speaker to play or pause it (as a sound's). */
  const clickable = $derived(mode === 'play' && role !== 'audience');
  const st = $derived(mode === 'play' ? localMedia[el.id] : undefined);
  const playing = $derived(st?.paused === false);
  /** How far into the part it plays (once its length is known). */
  const progress = $derived(st ? rangeProgress(st.time, st.duration, startAt, range.end) : null);

  let iframe = $state<HTMLIFrameElement>();
  let failed = $state(false);
  let ready = false;
  let loop = false;
  let lastTime = 0;
  let duration = 0;
  /** An autoplay with an entrance delay waits for the item to show, so the player is told when, not the link. */
  const later = $derived(mode === 'play' && el.autoplay && !!el.entrance?.delay);
  let mountedAt = 0;
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  /** Told to play or pause (by the host, or its slide coming back): an autoplay still waiting leaves it alone. */
  let told = false;
  /** Its autoplay hasn't started it yet: its slide coming back, or the audience window reloading, starts it afresh. */
  let waiting = false;
  /** Started by itself, or told to play or pause: no more waiting. */
  function stopWaiting(): void {
    clearTimeout(autoTimer);
    if (waiting) updateMedia(el.id, { waiting: (waiting = false) });
  }

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
      autoplay: el.autoplay && !later ? '1' : '0',
      mute: role === 'mirror' || el.muted ? '1' : '0',
    });
    if (startAt) p.set('start', String(Math.floor(startAt)));
    if (range.end) p.set('end', String(Math.floor(range.end)));
    return `${ORIGIN}/embed/${vid}?${p}`;
  });

  // The audience window opened or closed with the slide up: the host's controls go to the copy with the sound.
  $effect(() => {
    const r = role;
    if (mode === 'play') untrack(() => setMediaRole(el.id, r));
  });

  /** Once the player is ready: it starts as the item shows (at once when motion is reduced: app.css). */
  function autoplay(): void {
    if (!later || told || autoTimer !== undefined) return;
    const box = iframe?.closest('.el');
    const delay = box ? (parseFloat(getComputedStyle(box).animationDelay) || 0) * 1000 : 0;
    const go = () => {
      stopWaiting();
      cmd('playVideo');
    };
    autoTimer = setTimeout(() => !told && go(), Math.max(0, delay - (performance.now() - mountedAt)));
  }

  function fail(): void {
    if (failed) return;
    failed = true;
    updateMedia(el.id, { failed: true, paused: true });
  }

  onMount(() => {
    if (mode !== 'play' || !vid) return;
    mountedAt = performance.now();
    loop = el.loop;
    waiting = later;
    registerMedia(
      el.id,
      role,
      {
        play: () => {
          told = true;
          stopWaiting();
          cmd('playVideo');
        },
        pause: () => {
          told = true;
          stopWaiting();
          cmd('pauseVideo');
        },
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
        paused: !el.autoplay || later,
        time: startAt,
        duration: 0,
        volume: el.volume,
        muted: role === 'mirror' || el.muted,
        loop,
        silent: el.loop && el.muted,
        waiting,
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
        autoplay();
      }
      if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
        ready = true;
        autoplay();
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
        const end = range.end ?? duration;
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
      clearTimeout(autoTimer);
      unregisterMedia(el.id);
    };
  });

  /** Played through the host's controls, so the audience window follows along. */
  function toggle(e: MouseEvent): void {
    e.stopPropagation();
    mediaCommand({ el: el.id, op: 'toggle' });
  }

  function onload(): void {
    // Ask the player to start sending events to this window.
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: el.id, channel: 'widget' }), ORIGIN);
    for (const ev of ['onReady', 'onStateChange', 'onError']) cmd('addEventListener', [ev]);
  }
</script>

{#if !vid}
  <!-- Only the host is told; the screen viewers watch shows nothing. -->
  {#if hostView}<div class="card"><span>Not a valid YouTube link</span></div>{/if}
{:else if mode === 'edit'}
  <!-- Sound only: its picture dimmed under what viewers will see, and a badge saying so. -->
  <button class="card" class:dim={soundOnly} style:background-image="url({youtubeThumb(vid)})" onclick={(e) => e.stopPropagation()} title={el.url} tabindex="-1">
    {#if soundOnly}
      <span class="badge">🔊 Sound only</span>
      <span class="so">{@render face(true)}</span>
    {:else}
      <span class="yt">▶</span>
      <span class="msg">YouTube · needs internet</span>
    {/if}
  </button>
{:else if failed}
  <!-- A Sound only item's card is the host's alone: viewers never get its picture (the host's controls offer the link). -->
  {#if !soundOnly || role === 'mirror'}
    <button
      class="card"
      style:background-image="url({youtubeThumb(vid)})"
      onclick={(e) => {
        e.stopPropagation();
        openMediaPopup(watchUrl);
      }}
      title="Open on YouTube in a popup window"
    >
      <span class="yt">▶</span>
      <span class="msg">Open on YouTube</span>
    </button>
  {/if}
{:else if soundOnly}
  <div class="so" data-sound-only={shows}>
    <iframe
      class="unseen"
      bind:this={iframe}
      {src}
      title={label}
      {onload}
      aria-hidden="true"
      tabindex="-1"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    {@render face(false)}
  </div>
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

<!-- What viewers see of a Sound only item (`preview`: the editor's, before it has played). -->
{#snippet face(preview: boolean)}
  {@const len = range.end !== undefined ? range.end - startAt : undefined}
  {@const p = preview ? { at: 0, length: len ?? 0, frac: 0 } : progress}
  {@const words = preview && len === undefined ? '0:00 / –:––' : p ? timeText(p) : ''}
  {@const icon = playing && role === 'mirror' ? '⏸' : '🔊'}
  {@const name = `${playing ? 'Pause' : 'Play'} ${label}`}
  {#if shows === 'time' && p}
    {#if clickable}
      <button class="bar" class:playing onpointerdown={(e) => e.stopPropagation()} onclick={toggle} title={name} aria-label="{name}, {words}">
        {@render barInside(icon, p.frac, words)}
      </button>
    {:else}
      <span class="bar" role="img" aria-label="Sound, {words}">{@render barInside(icon, p.frac, words)}</span>
    {/if}
  {:else if shows !== 'nothing'}
    {#if clickable}
      <button class="spk" class:playing onpointerdown={(e) => e.stopPropagation()} onclick={toggle} title={name} aria-label={name}>{icon}</button>
    {:else}
      <span class="spk" title={label}>🔊</span>
    {/if}
  {:else if mode === 'edit'}
    <span class="none">Players see nothing</span>
  {:else if hostView}
    <!-- The host's copy: a faint speaker where it is (viewers see nothing there). -->
    <button class="spk ghost" class:playing onpointerdown={(e) => e.stopPropagation()} onclick={toggle} title={name} aria-label={name}>{icon}</button>
  {/if}
{/snippet}

{#snippet barInside(icon: string, frac: number, words: string)}
  <span class="bi">{icon}</span>
  <span class="track"><span class="fill" style:width="{Math.round(frac * 1000) / 10}%"></span></span>
  <span class="t">{words}</span>
{/snippet}

<style>
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  /* Sound only: still there and playing (not display: none or no size, which can stop it), just never seen. */
  iframe.unseen {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }
  .so {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    container-type: size;
    color: #fff;
  }
  .card.dim {
    position: relative;
    container-type: size;
  }
  /* The editor: its picture dimmed, as a reminder viewers won't see it. */
  .card.dim::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
  }
  .card.dim .so {
    position: absolute;
    inset: 0;
  }
  .badge {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 1;
    font-size: min(40px, 12cqmin);
    padding: 4px 16px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.75);
    border: 2px solid rgba(255, 255, 255, 0.7);
    text-shadow: none;
  }
  .spk {
    --s: min(100cqmin, 280px);
    width: var(--s);
    height: var(--s);
    display: grid;
    place-items: center;
    font-size: calc(var(--s) * 0.6);
    line-height: 1;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 50%;
    padding: 0;
    border: none;
    color: inherit;
    text-shadow: none;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5em;
    box-sizing: border-box;
    width: min(100cqw, 20em);
    font-size: min(40cqh, 6cqw, 56px);
    padding: 0.3em 0.8em 0.3em 0.4em;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 999px;
    color: #fff;
    text-shadow: none;
  }
  .bi {
    font-size: 1.4em;
    line-height: 1;
  }
  .track {
    flex: 1;
    min-width: 2em;
    height: 0.35em;
    border-radius: 0.2em;
    background: rgba(255, 255, 255, 0.3);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: #fff;
  }
  .t {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  button.spk,
  button.bar {
    cursor: pointer;
  }
  button.spk:hover {
    background: rgba(0, 0, 0, 0.65);
  }
  button.spk.playing,
  button.bar.playing {
    outline: 4px solid rgba(255, 255, 255, 0.7);
  }
  .spk.ghost {
    opacity: 0.5;
    outline: 4px dashed rgba(255, 255, 255, 0.6);
  }
  .none {
    font-size: min(40px, 10cqmin);
    background: rgba(0, 0, 0, 0.65);
    padding: 6px 20px;
    border-radius: 10px;
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
