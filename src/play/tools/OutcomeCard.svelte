<!-- Big reveal of a wheel slice / die face: label, optional details, image/GIF/video/audio. -->
<script lang="ts">
  import { scale } from '../../lib/motion.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import type { AudioEl, Game, Outcome, VideoEl } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import MediaPlayer from '../../lib/slide/MediaPlayer.svelte';

  /**
   * `fallback`: the name shown for an outcome left blank ("Slice 3"). `mediaId`: its video's or sound's own id on the
   * host's controls, for this landing (two wheels up at once don't share one).
   */
  let {
    outcome,
    game,
    role,
    mediaId,
    color = 'var(--value)',
    fallback = '',
  }: { outcome: Outcome; game: Game; role: MediaRole; mediaId: string; color?: string; fallback?: string } = $props();
  const ref = $derived(outcome.media ? game.media.find((m) => m.id === outcome.media) : undefined);
  const url = $derived(outcome.media ? mediaUrls[outcome.media] : undefined);
  /**
   * Its video or sound plays as a slide's does, so the host's media row, Space, M and the cover (K) reach it, and the
   * host's copy stays silent in dual mode. (A video loops, as a GIF would: 🔁 or M quiets one with sound.)
   */
  const clip = $derived.by((): VideoEl | AudioEl | undefined => {
    if (ref?.kind !== 'video' && ref?.kind !== 'audio') return undefined;
    const base = { id: mediaId, media: ref.id, x: 0, y: 0, w: 1100, h: 480, rotation: 0, opacity: 1, zIndex: 1, autoplay: true, muted: false, volume: 1 };
    return ref.kind === 'video' ? { ...base, kind: 'video', loop: true, fit: 'contain' } : { ...base, kind: 'audio', loop: false, visible: false };
  });
</script>

<div class="card" style:--c={color} in:scale={{ start: 0.4, duration: 450 }}>
  <div class="label">{outcome.label.trim() || fallback}</div>
  {#if url && ref}
    {#if ref.kind === 'image'}
      <img src={url} alt="" />
    {:else if clip?.kind === 'video'}
      <div class="clip"><MediaPlayer el={clip} src={url} mode="play" {role} label="Video" /></div>
    {:else if clip}
      <MediaPlayer el={clip} src={url} mode="play" {role} label="Audio" />
    {/if}
  {/if}
  {#if outcome.details}<div class="details">{outcome.details}</div>{/if}
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    max-width: 1500px;
    max-height: 900px;
    padding: 40px 70px;
    border-radius: 36px;
    border: 10px solid var(--c);
    background: rgba(0, 0, 0, 0.82);
    color: #fff;
    text-align: center;
    box-shadow: 0 0 80px var(--c);
  }
  .label {
    font-family: var(--value-font);
    font-size: 110px;
    font-weight: 900;
    line-height: 1.05;
    text-shadow: 6px 6px 0 #000;
  }
  .details {
    font-family: var(--board-font);
    font-size: 54px;
    line-height: 1.2;
    white-space: pre-wrap;
  }
  img {
    max-width: 1100px;
    max-height: 480px;
    border-radius: 16px;
  }
  .clip {
    width: 1100px;
    height: 480px;
    border-radius: 16px;
    overflow: hidden;
  }
</style>
