<!-- Big reveal of a wheel slice / die face: label, optional details, image/GIF/video/audio. -->
<script lang="ts">
  import { scale } from '../../lib/motion.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import type { Game, Outcome } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { autoPlay } from '../../lib/audioout.svelte';

  let { outcome, game, role, color = 'var(--value)' }: { outcome: Outcome; game: Game; role: MediaRole; color?: string } = $props();
  const ref = $derived(outcome.media ? game.media.find((m) => m.id === outcome.media) : undefined);
  const url = $derived(outcome.media ? mediaUrls[outcome.media] : undefined);
</script>

<div class="card" style:--c={color} in:scale={{ start: 0.4, duration: 450 }}>
  <div class="label">{outcome.label}</div>
  {#if url && ref}
    {#if ref.kind === 'image'}
      <img src={url} alt="" />
    {:else if ref.kind === 'video' && role === 'mirror'}
      <!-- The host's silent copy in dual mode. -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={url} autoplay loop muted playsinline></video>
    {:else if ref.kind === 'video'}
      <!-- Plays with sound, or muted if the browser blocks that (the host is told either way). -->
      <!-- svelte-ignore a11y_media_has_caption -->
      <video use:autoPlay={url} loop playsinline></video>
    {:else if ref.kind === 'audio' && role !== 'mirror'}
      <audio use:autoPlay={url}></audio>
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
  img,
  video {
    max-width: 1100px;
    max-height: 480px;
    border-radius: 16px;
  }
</style>
