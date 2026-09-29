<!-- The audience window (#audience): a clean, control-free view for OBS window capture. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { registerBlob } from '../lib/media.svelte';
  import type { Game, Session } from '../lib/model';
  import { newLive, type Live } from '../lib/live';
  import type { AudienceMsg, HostMsg } from '../lib/sync.svelte';
  import { applyLocal, onLocalMediaChange } from '../lib/mediactl.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import Stage from '../lib/Stage.svelte';
  import AudienceView from '../play/AudienceView.svelte';

  let game = $state<Game | null>(null);
  let session = $state<Session | null>(null);
  let live = $state<Live>(newLive());
  let status = $state<'waiting' | 'connected' | 'no-host' | 'host-left'>('waiting');
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  // Browsers only allow sound autoplay after the user has clicked this window once.
  let activated = $state(!!navigator.userActivation?.hasBeenActive);

  function send(msg: AudienceMsg): void {
    window.opener?.postMessage(msg, '*');
  }

  onMount(() => {
    if (!window.opener) {
      status = 'no-host';
      return;
    }
    const onmsg = (e: MessageEvent<HostMsg>) => {
      if (e.source !== window.opener) return;
      const m = e.data;
      switch (m?.type) {
        case 'game':
          game = m.game;
          registerGameFonts(m.game);
          document.title = `${m.game.title} · Audience`;
          status = 'connected';
          break;
        case 'session':
          session = m.session;
          break;
        case 'live':
          live = m.live;
          break;
        case 'media':
          for (const it of m.items) registerBlob(it.id, it.blob);
          if (game) registerGameFonts(game);
          break;
        case 'media-cmd':
          applyLocal(m.cmd);
          break;
        case 'bye':
          status = 'host-left';
          break;
      }
    };
    window.addEventListener('message', onmsg);
    const offMedia = onLocalMediaChange((id, state) =>
      send({ type: 'audience-event', event: { kind: 'media', id, state: state ? $state.snapshot(state) : null } }),
    );
    send({ type: 'hello' });
    send({ type: 'audience-event', event: { kind: 'activation', active: activated } });
    poke();
    return () => {
      window.removeEventListener('message', onmsg);
      offMedia();
    };
  });

  // Hide the cursor when the mouse is still so it never shows up on stream.
  function poke(): void {
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (idle = true), 1500);
  }

  function activate(): void {
    if (activated) return;
    activated = true;
    send({ type: 'audience-event', event: { kind: 'activation', active: true } });
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
</script>

<svelte:window onmousemove={poke} onkeydown={(e) => e.key.toLowerCase() === 'f' && toggleFullscreen()} />

<div class="aud" class:idle ondblclick={toggleFullscreen} onpointerdown={activate} role="presentation">
  {#if game && session}
    <Stage>
      <AudienceView {game} {session} {live} role="audience" />
    </Stage>
  {:else}
    <div class="msg">
      {#if status === 'no-host'}
        <h1>Audience window</h1>
        <p>Open this from the host's <b>📺 Audience window</b> button in Play mode.</p>
      {:else}
        <p>Waiting for the host…</p>
      {/if}
    </div>
  {/if}
  {#if !activated && status === 'connected'}
    <div class="activate">Click anywhere in this window once so it can play sound</div>
  {/if}
  {#if status === 'host-left'}
    <div class="banner">Host window closed. Reopen the audience window from the host to reconnect.</div>
  {/if}
</div>

<style>
  .aud {
    position: fixed;
    inset: 0;
    background: #000;
  }
  .aud.idle {
    cursor: none;
  }
  .msg {
    display: grid;
    place-items: center;
    height: 100%;
    color: #aaa;
    text-align: center;
  }
  .activate {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 14px;
    border-radius: 8px;
    background: rgba(245, 165, 36, 0.95);
    color: #000;
    font-size: 13px;
    font-weight: 600;
  }
  .banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 6px;
    background: rgba(229, 72, 77, 0.9);
    color: #fff;
    text-align: center;
    font-size: 13px;
  }
</style>
