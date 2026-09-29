<!--
  A site's own video player in a frame: Google Drive's player (the one way the browser version can play a
  Drive video or sound) or Streamable's. The app can't see or control anything inside it (not even mute it),
  so it only goes on the screen viewers watch: the audience window, or the stage in single-window mode (and
  the slide editor's preview with sound on). The host's copy and the editor show a card instead, so the
  sound never plays twice. The host can restart it, stop it (take it off the screen) or open it in its own
  window. Failures inside it (sign-in, "you need access"…) can't be detected, so nothing swaps automatically.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { EmbedEl } from '../model';
  import { playerFor } from '../links';
  import { registerMedia, unregisterMedia, updateMedia, type MediaRole } from '../mediactl.svelte';

  let { el, mode, role, label }: { el: EmbedEl; mode: 'edit' | 'play'; role: MediaRole; label: string } = $props();

  const player = $derived(playerFor(el.embedKind, el.url));
  const onScreen = $derived(mode === 'play' && role !== 'mirror');
  let shown = $state(true);
  /** Bumped to load the player again from the start. */
  let round = $state(0);

  onMount(() => {
    const p = player;
    if (mode !== 'play' || !p) return;
    const show = (v: boolean) => {
      shown = v;
      updateMedia(el.id, { shown: v, paused: !v });
    };
    const none = () => {};
    registerMedia(
      el.id,
      role,
      {
        play: () => show(true),
        // Pausing, seeking, volume and mute happen inside the site's player only.
        pause: none,
        seek: none,
        setVolume: none,
        setMuted: none,
        setLoop: none,
        reload: () => {
          show(true);
          round++;
        },
        stop: () => show(false),
      },
      { label, kind: 'external', paused: false, shown: true, time: 0, duration: 0, volume: el.volume, muted: false, loop: false, openUrl: p.openUrl },
    );
    return () => unregisterMedia(el.id);
  });
</script>

{#if !player}
  <div class="card"><span class="msg">This {label} link doesn't point to a file</span></div>
{:else if onScreen}
  {#if shown}
    {#key round}
      <iframe
        src={player.src}
        title={label}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    {/key}
  {/if}
{:else}
  <div class="card" title={el.url}>
    <span class="play">▶</span>
    <span class="msg">{player.name} · {mode === 'play' && !shown ? 'stopped' : 'click ▶ in the audience window'}</span>
  </div>
{/if}

<style>
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: #000;
  }
  .card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    background: #111;
    color: #fff;
    font-size: 40px;
    font-weight: 700;
    text-align: center;
    overflow: hidden;
  }
  .play {
    display: grid;
    place-items: center;
    width: 180px;
    height: 130px;
    border-radius: 32px;
    background: #1a73e8;
    font-size: 72px;
  }
  .msg {
    background: rgba(0, 0, 0, 0.65);
    padding: 6px 20px;
    border-radius: 10px;
  }
</style>
