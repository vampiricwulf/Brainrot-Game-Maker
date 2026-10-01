<!--
  The audience window (#audience): a clean, control-free view for OBS window capture. With `scores`, the scores-only
  window (#audience-scores): just the score plates and the countdown, for a lower third (no sound plays there).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { registerBlob, registerLinks } from '../lib/media.svelte';
  import type { Game, Session } from '../lib/model';
  import { newLive, type Live } from '../lib/live';
  import { newSession } from '../lib/session';
  import { CHANNEL_NAME, audienceTitle, type AudienceMsg, type ChannelMsg, type HostMsg } from '../lib/sync.svelte';
  import { inTauri, toggleFullscreen } from '../lib/platform';
  import { applyLocal, onLocalMediaChange } from '../lib/mediactl.svelte';
  import { onSoundReport, playChime, setAudioOut, watchSinks } from '../lib/audioout.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import Stage from '../lib/Stage.svelte';
  import AudienceView from '../play/AudienceView.svelte';
  import ScoresView from '../play/ScoresView.svelte';
  import { STAGE_KEYS } from '../lib/theme';

  let { scores = false }: { scores?: boolean } = $props();

  let game = $state<Game | null>(null);
  let session = $state<Session | null>(null);
  let live = $state<Live>(newLive());
  let status = $state<'waiting' | 'connected' | 'no-host' | 'host-left'>('waiting');
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  // Browsers only allow sound autoplay after the user has clicked this window once. The desktop app
  // starts its windows with autoplay allowed (WebView2's --autoplay-policy=no-user-gesture-required).
  let activated = $state(inTauri() || !!navigator.userActivation?.hasBeenActive);
  /** A game sound was blocked since this window last told the host it may play sound. */
  let blockedSince = false;

  // Talk to the host through window.opener when there is one; otherwise (e.g. a window the desktop app
  // created itself) through a BroadcastChannel. Only one link is used so nothing is handled twice.
  let channel: BroadcastChannel | null = null;
  function send(msg: AudienceMsg): void {
    if (window.opener) window.opener.postMessage(msg, '*');
    else channel?.postMessage({ from: 'audience', msg } satisfies ChannelMsg);
  }

  onMount(() => {
    const viaOpener = !!window.opener;
    // The scores window only talks to the host that opened it (on the channel, the host would take it for the audience window).
    if (!viaOpener && scores) {
      status = 'no-host';
      return;
    }
    if (!viaOpener) {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
      } catch {
        channel = null;
      }
      if (!channel) {
        status = 'no-host';
        return;
      }
    }
    const handle = (m: HostMsg) => {
      switch (m?.type) {
        case 'game':
          game = m.game;
          // Files that play from their link never arrive as blobs.
          registerLinks(m.game);
          registerGameFonts(m.game);
          document.title = scores ? audienceTitle(m.game).replace(/Audience$/, 'Scores') : audienceTitle(m.game);
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
        case 'test-sound':
          playChime(m.nonce);
          break;
        case 'audio-out':
          setAudioOut(m, false);
          break;
        case 'bye':
          status = 'host-left';
          break;
      }
    };
    const onmsg = (e: MessageEvent<HostMsg>) => {
      if (e.source === window.opener) handle(e.data);
    };
    const onchannel = (e: MessageEvent<ChannelMsg>) => {
      if (e.data?.from === 'host') handle(e.data.msg);
    };
    if (viaOpener) window.addEventListener('message', onmsg);
    else channel!.addEventListener('message', onchannel);
    // No host answered on the channel: this window wasn't opened by a host.
    const noHost = setTimeout(() => status === 'waiting' && (status = 'no-host'), 4000);
    const onunload = () => send({ type: 'bye' });
    window.addEventListener('beforeunload', onunload);
    const offMedia = onLocalMediaChange((id, state) =>
      send({ type: 'audience-event', event: { kind: 'media', id, state: state ? $state.snapshot(state) : null } }),
    );
    // Sounds played or blocked here, and a missing output device: the host shows them.
    const offSound = onSoundReport((event) => {
      // A sound that played means this window may play sound (a browser can allow that before any click).
      if (event.kind === 'sound' && event.ok) {
        activated = true;
        blockedSince = false;
      } else if (event.kind === 'sound' && event.reason === 'blocked') blockedSince = true;
      send({ type: 'audience-event', event });
    });
    const offSinks = watchSinks();
    send({ type: 'hello' });
    send({ type: 'audience-event', event: { kind: 'activation', active: activated } });
    poke();
    return () => {
      window.removeEventListener('message', onmsg);
      window.removeEventListener('beforeunload', onunload);
      channel?.close();
      clearTimeout(noHost);
      offMedia();
      offSound();
      offSinks();
    };
  });

  // Hide the cursor when the mouse is still so it never shows up on stream.
  function poke(): void {
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (idle = true), 1500);
  }

  // Keys that don't count as a click (browsers ignore Esc and modifier keys).
  const NO_GESTURE = ['Escape', 'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock'];

  /** The browser counted this click or key press, so this window may now play sound. */
  function allowsSound(e: Event): boolean {
    const ua = navigator.userActivation;
    if (ua) return ua.hasBeenActive;
    // Older browsers can't be asked: every other key counts.
    return !(e instanceof KeyboardEvent && NO_GESTURE.includes(e.key));
  }

  function activate(e: Event): void {
    if (!allowsSound(e)) return;
    // Already said so, unless a sound was blocked since (the host then asks for a click again).
    if (activated && !blockedSince) return;
    activated = true;
    blockedSince = false;
    send({ type: 'audience-event', event: { kind: 'activation', active: true } });
  }

  /**
   * Every other key goes to the host, so the shortcuts (N, R, Ctrl+Z…) keep working after the host clicked this window.
   * Nothing shows here, and the browser's own keys stay out of the way (Alt+← going back, Space scrolling).
   */
  function forwardKey(e: KeyboardEvent): void {
    if (NO_GESTURE.includes(e.key) && e.key !== 'Escape') return;
    // Buzzer mode's buzz-in keys (Setup): during a clue, the Nth key buzzes player N in; otherwise they do nothing here.
    const buzz = game?.settings.buzzer && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 ? buzzKey(e.key) : 0;
    if (buzz) {
      e.preventDefault();
      if (session?.phase === 'clue' && !session.dd) send({ type: 'key', key: { key: String(buzz), code: `Digit${buzz}`, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false } });
      return;
    }
    const { key, code, shiftKey, ctrlKey, altKey, metaKey } = e;
    send({ type: 'key', key: { key, code, shiftKey, ctrlKey, altKey, metaKey } });
    if (!ctrlKey && !metaKey && !/^F\d+$/.test(key)) e.preventDefault();
  }

  /** Which player (1–9) a buzz-in key is for, or 0. */
  function buzzKey(key: string): number {
    const at = (game?.settings.buzzKeys ?? '').toUpperCase().slice(0, 9).indexOf(key.toUpperCase());
    return at < 0 || key === ' ' ? 0 : at + 1;
  }

  const keyColor = $derived(game?.theme?.stageBg ? STAGE_KEYS[game.theme.stageBg] : undefined);

  /** A file dropped on this window is ignored: the browser would open it in place of the stream. */
  function ignoreFiles(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }
</script>

<!-- A right-click (the host clicking to allow sound) never opens the browser's menu over the stream either. -->
<svelte:window
  ondragover={ignoreFiles}
  ondrop={ignoreFiles}
  oncontextmenu={(e) => e.preventDefault()}
  onmousemove={poke}
  onkeydown={(e) => {
    // A key press (not Shift, Ctrl, Alt or Esc) counts as the click that allows sound, too.
    activate(e);
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) return toggleFullscreen();
    forwardKey(e);
  }}
/>

<!-- A touch only counts once the finger lifts, hence pointerup too. -->
<div
  class="aud"
  class:idle
  style:background={keyColor}
  style:--letterbox={keyColor}
  ondblclick={toggleFullscreen}
  onpointerdown={activate}
  onpointerup={activate}
  role="presentation"
>
  {#if game && scores}
    <ScoresView {game} {session} {live} />
  {:else if game && (session || live.pregame)}
    <Stage>
      <!-- Before Start the host sends no session yet: AudienceView shows its "Starting soon" card. -->
      <AudienceView {game} session={session ?? newSession(game)} {live} role="audience" />
    </Stage>
  {:else}
    <div class="msg">
      {#if status === 'no-host'}
        <h1>{scores ? 'Scores window' : 'Audience window'}</h1>
        <p>Open this from the host's <b>{scores ? '▭ Scores window' : '📺 Audience window'}</b> button in Play mode.</p>
      {:else}
        <p>Waiting for the host…</p>
      {/if}
    </div>
  {/if}
  <!-- Only while the mouse is over the window, so it stays off the stream (the host panel warns too). -->
  {#if !activated && !scores && status === 'connected' && !idle}
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
