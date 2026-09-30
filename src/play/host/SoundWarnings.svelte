<!-- Why the stream may have no game sound: shown to the host whenever it applies (not only when a slide has media). -->
<script lang="ts">
  import { audience, sound } from '../../lib/sync.svelte';
  import { audioOut } from '../../lib/audioout.svelte';
  import { captureProblem, desktop, RESTART_ASK, restartApp } from '../../lib/desktop.svelte';
  import InlineAsk from './InlineAsk.svelte';

  let { dual, onhelp }: { dual: boolean; onhelp: () => void } = $props();

  const capture = captureProblem();
  const missing = $derived(dual ? sound.outputMissing : audioOut.missing);
  let retryError = $state('');
  /** "Try it again" was pressed: it asks inline (a browser dialog would show on stream). */
  let askRetry = $state(false);

  async function retry(): Promise<void> {
    askRetry = false;
    retryError = (await restartApp(true)) ?? '';
  }
</script>

{#if capture}
  <div class="w bad" role="alert" title={capture.compat ? `Compatibility setting: ${capture.compat}` : undefined}>
    ⚠ Brainrot Games Maker is running as administrator (or in compatibility mode). Discord and OBS may stream no game sound. Close it and
    start it normally.
    <button class="small ghost" onclick={onhelp}>🔊 Help</button>
  </div>
{/if}
<!-- The desktop app's Discord audio fix is switched on but not running: like the above, Discord may get no sound. -->
{#if desktop.fixSaved && desktop.fixCrashed}
  <div class="w bad" role="alert">
    ⚠ The Discord audio fix was turned off for this run because WebView2 crashed with it, so Discord may stream no game sound.
    {#if askRetry && !desktop.restarting}
      <InlineAsk text={RESTART_ASK} ok="↻ Restart" onok={retry} oncancel={() => (askRetry = false)} />
    {:else}
      <button class="small ghost" onclick={() => (askRetry = true)} disabled={desktop.restarting}>
        {desktop.restarting ? 'Restarting…' : '↻ Try it again'}
      </button>
    {/if}
    <button class="small ghost" onclick={onhelp}>🔊 Help</button>
    {#if retryError}<span>{retryError}</span>{/if}
  </div>
{:else if desktop.fixSaved && desktop.fixFailed}
  <div class="w bad" role="alert">
    ⚠ The Discord audio fix didn't start this time, so Discord may stream no game sound. Restart Brainrot Games Maker to try again.
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
