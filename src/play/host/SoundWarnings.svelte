<!-- Why the stream may have no game sound: shown to the host whenever it applies (not only when a slide has media). -->
<script lang="ts">
  import { audience, sound } from '../../lib/sync.svelte';
  import { audioOut } from '../../lib/audioout.svelte';
  import { captureProblem } from '../../lib/desktop.svelte';

  let { dual, onhelp }: { dual: boolean; onhelp: () => void } = $props();

  const capture = captureProblem();
  const missing = $derived(dual ? sound.outputMissing : audioOut.missing);
</script>

{#if capture}
  <div class="w bad" role="alert" title={capture.compat ? `Compatibility setting: ${capture.compat}` : undefined}>
    ⚠ Jeopardy Builder is running as administrator (or in compatibility mode). Discord and OBS may stream no game sound. Close it and
    start it normally.
    <button class="small ghost" onclick={onhelp}>🔊 Help</button>
  </div>
{/if}
{#if dual && (!audience.activated || sound.cueBlocked)}
  <div class="w" role="status">
    ⚠ {sound.cueBlocked ? 'The audience window blocked a sound: click' : 'Click'} the audience window once so it can play sound.
  </div>
{/if}
{#if missing}
  <div class="w" role="status">
    ⚠ The game audio output "{audioOut.label || 'chosen speaker'}" wasn't found, so the sound plays on the default device.
    <button class="small ghost" onclick={onhelp}>🔊 Choose again</button>
  </div>
{/if}

<style>
  .w {
    color: var(--warn);
    font-size: 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .w.bad {
    color: var(--bad);
    font-weight: 600;
  }
</style>
