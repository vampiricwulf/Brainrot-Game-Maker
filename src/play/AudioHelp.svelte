<!--
  Streaming the game's sound (Discord, OBS): where it plays, a Test sound button, the Game audio output
  picker, the desktop app's Discord audio fix, and step-by-step help per platform.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { inTauri } from '../lib/platform';
  import { chooseAudioOut, sound, testSound } from '../lib/sync.svelte';
  import { audioOut, hasOutputPicker, listOutputs, pickOutput, sinkSupported } from '../lib/audioout.svelte';
  import { DEFAULT_OUTPUT, matchOutput, type AudioOutput } from '../lib/audio';
  import { captureProblem, desktop, restartApp, setAudioFix } from '../lib/desktop.svelte';

  let { dual, onclose }: { dual: boolean; onclose: () => void } = $props();

  const exe = inTauri();
  const capture = captureProblem();
  const canRoute = sinkSupported();
  // Firefox has its own speaker picker; Chrome, Edge and the desktop app list the speakers here.
  const ownPicker = hasOutputPicker();
  const appName = exe ? 'Jeopardy Builder' : 'your browser';

  /** The speakers, once listed (null: not asked yet). */
  let outputs = $state<AudioOutput[] | null>(null);
  let listing = $state(false);
  let fixError = $state('');
  let restarting = $state(false);

  const where = $derived(dual ? 'the audience window' : 'this window');
  const missing = $derived(dual ? sound.outputMissing : audioOut.missing);
  /** The saved device when it isn't in the list (not listed yet, or unplugged). */
  const savedExtra = $derived(audioOut.deviceId && !outputs?.some((d) => d.deviceId === audioOut.deviceId) ? audioOut : null);

  const test = $derived(sound.test);
  const testText = $derived.by(() => {
    if (!test) return '';
    const place = test.where === 'audience' ? 'the audience window' : 'this window';
    switch (test.state) {
      case 'waiting':
        return 'Playing…';
      case 'ok':
        return `✔ Sound played in ${place}. If viewers don't hear it, see "No sound for viewers?" below.`;
      case 'blocked':
        return test.where === 'audience'
          ? '✘ Blocked: click the audience window once, then press Test sound again.'
          : '✘ Blocked: click anywhere in this window once, then press Test sound again.';
      case 'no-answer':
        return "✘ The audience window didn't answer. Close it and open it again.";
      default:
        return `✘ The sound couldn't play in ${place}.`;
    }
  });

  /** `ask`: allow the microphone prompt that names the speakers (a click on "List my speakers"). */
  async function showOutputs(ask: boolean): Promise<void> {
    listing = true;
    const list = await listOutputs(ask);
    listing = false;
    // Without asking, an empty list only means "not allowed yet": keep offering the button.
    if (!ask && !list.length) return;
    outputs = list;
    // Device ids can change: find the saved one again by its name.
    const found = matchOutput(audioOut, list);
    if (found && found.deviceId !== audioOut.deviceId) chooseAudioOut(found);
  }

  // Once the speakers were listed before (the browser remembers the permission), list them right away.
  onMount(() => {
    if (canRoute && !ownPicker) void showOutputs(false);
  });

  function choose(id: string): void {
    const out = id ? (outputs?.find((d) => d.deviceId === id) ?? (id === audioOut.deviceId ? audioOut : null)) : DEFAULT_OUTPUT;
    if (out) chooseAudioOut({ deviceId: out.deviceId, label: out.label });
  }

  async function chooseFirefox(): Promise<void> {
    const out = await pickOutput();
    if (out) chooseAudioOut(out);
  }

  async function toggleFix(on: boolean): Promise<void> {
    fixError = (await setAudioFix(on)) ?? '';
  }

  async function restart(): Promise<void> {
    if (!confirm('Restart Jeopardy Builder now? Everything is saved: a game in progress can be resumed from the editor.')) return;
    restarting = true;
    try {
      await restartApp();
    } catch {
      restarting = false;
      fixError = "Couldn't restart. Close Jeopardy Builder and open it again.";
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      onclose();
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Streaming the sound">
    <div class="row">
      <h2>🔊 Streaming the sound</h2>
      <span class="spacer"></span>
      <button class="ghost small" onclick={onclose} aria-label="Close">✕</button>
    </div>

    {#if capture}
      <p class="alert" role="alert">
        ⚠ Jeopardy Builder is running as administrator (or in compatibility mode). Discord and OBS may stream no game sound. Close it
        and start it normally.
      </p>
    {/if}

    <p>
      The game's sound plays in <b>{where}</b>{dual ? ' (this window stays silent)' : ''}. Press Test sound: you should hear a chime.
    </p>
    <div class="row">
      <button class="primary" onclick={testSound}>▶ Test sound</button>
      {#if test}
        <span class="result" class:ok={test.state === 'ok'} class:bad={test.state !== 'ok' && test.state !== 'waiting'} role="status">{testText}</span>
      {/if}
    </div>

    {#if canRoute}
      <section class="box">
        <div class="row">
          <b>Game audio output</b>
          {#if ownPicker}
            <span>{audioOut.deviceId ? audioOut.label || 'Chosen speaker' : 'Default (system)'}</span>
            <button class="small" onclick={chooseFirefox}>Choose speaker…</button>
            {#if audioOut.deviceId}<button class="small ghost" onclick={() => choose('')}>Use default</button>{/if}
          {:else}
            <select aria-label="Game audio output" value={audioOut.deviceId} onchange={(e) => choose(e.currentTarget.value)}>
              <option value="">Default (system)</option>
              {#if savedExtra}
                <option value={savedExtra.deviceId}>{savedExtra.label || 'Chosen speaker'}{outputs ? ' (not connected)' : ''}</option>
              {/if}
              {#each outputs ?? [] as d (d.deviceId)}
                <option value={d.deviceId}>{d.label}</option>
              {/each}
            </select>
            <button class="small" onclick={() => showOutputs(true)} disabled={listing}>{listing ? 'Looking…' : 'List my speakers'}</button>
          {/if}
        </div>
        {#if outputs && !outputs.length}
          <p class="warn small">
            No speakers found. {exe ? 'Jeopardy Builder' : 'Your browser'} only lists them after you allow microphone access (nothing is
            recorded).
          </p>
        {/if}
        {#if missing}
          <p class="warn small">
            ⚠ {dual ? 'The audience window' : 'This window'} couldn't use "{audioOut.label || 'the chosen speaker'}", so the game plays on the
            default device. Plug it in and choose it again.
          </p>
        {/if}
        <p class="muted small">
          Sends the game's sound to another device, e.g. a virtual cable (VB-CABLE) for OBS. YouTube videos and "Open link" pop-ups
          can't be moved: they always play on the default device.
        </p>
      </section>
    {/if}

    {#if exe}
      <section class="box">
        <label class="check">
          <input type="checkbox" checked={desktop.fixSaved} onchange={(e) => toggleFix(e.currentTarget.checked)} />
          <b>Discord audio fix</b> <span class="tag">experimental</span>
        </label>
        <p class="muted small">
          Try this if Discord or OBS stream no game sound: it plays the sound from Jeopardy Builder's own process. Takes effect after a
          restart.
        </p>
        {#if desktop.fixSaved !== desktop.fixActive}
          <div class="row">
            <span class="warn small">Restart Jeopardy Builder to turn it {desktop.fixSaved ? 'on' : 'off'}.</span>
            <button class="small" onclick={restart} disabled={restarting}>{restarting ? 'Restarting…' : '↻ Restart now'}</button>
          </div>
        {/if}
        {#if fixError}<p class="bad small">{fixError}</p>{/if}
      </section>
    {/if}

    <details open>
      <summary>Discord on Windows</summary>
      <ol>
        {#if exe}
          <li>Use the Discord desktop app, not Discord in a web browser.</li>
          <li>
            Start Jeopardy Builder normally: not with "Run as administrator", and with nothing ticked under its Properties › Compatibility.
            Open it only once. (Running Discord as administrator doesn't help.)
          </li>
          <li>Open the audience window and press <b>Test sound</b>.</li>
          <li>In your voice channel: <b>Share Your Screen › Applications › "Jeopardy Builder · Audience"</b>. Turn <b>Sound</b> on, then Go Live.</li>
        {:else}
          <li>Use the Discord desktop app. Discord in a web browser can't send a window's sound (in Firefox, none at all).</li>
          <li>Open the audience window, click once inside it, then press <b>Test sound</b>.</li>
          <li>
            In your voice channel: <b>Share Your Screen › Applications</b> › the browser window showing the audience view. Turn <b>Sound</b>
            on, then Go Live. Discord sends the sound of every tab in that browser: close or mute the others.
          </li>
        {/if}
        <li>Press Test sound again and ask a viewer if they heard it. Viewers can mute a stream by accident: hover it and check its volume.</li>
      </ol>
      <p><b>No sound for viewers?</b></p>
      <ol start={exe ? 6 : 5}>
        <li>
          Stop the stream. In Discord, <b>User Settings › Voice & Video › Screen Share</b>: flip "Use an experimental method to capture
          audio from applications" (on if it was off, off if it was on). Quit Discord completely (tray icon › Quit Discord), open it
          again and go live again.
        </li>
        {#if exe}
          <li>
            Close Jeopardy Builder, check in Task Manager that no "Jeopardy Builder" or "Microsoft Edge WebView2" entries are left, start it
            again and retry. Then try the <b>Discord audio fix</b> above.
          </li>
          <li>
            Still silent: share your whole screen with Sound on (viewers hear everything your PC plays, including your call: use
            headphones), or run the show in Chrome or Edge: <b>Save</b> the game (.jbr), open <code>jeopardy-builder.html</code> in the
            browser, <b>Open…</b> the pack and share that browser window.
          </li>
        {:else}
          <li>
            Still silent: share your whole screen with Sound on. Viewers hear everything your PC plays, including your call: use
            headphones and mute other apps.
          </li>
        {/if}
      </ol>
    </details>

    <details>
      <summary>OBS</summary>
      <ul>
        <li>
          Window Capture of the audience window: tick <b>Capture Audio (BETA)</b>, or add an <b>Application Audio Capture</b> for {appName}.
        </li>
        <li>
          Still silent: send the game's sound to a separate device such as VB-CABLE
          {#if canRoute}(<b>Game audio output</b> above){:else}(Windows: Settings › System › Sound › Volume mixer){/if}, add an
          <b>Audio Output Capture</b> for that device, and set it to "Monitor and Output" to hear it yourself.
        </li>
        <li>OBS Virtual Camera has no sound.</li>
        <li>YouTube videos and "Open link" pop-ups always play on your default speakers.</li>
      </ul>
    </details>

    {#if !exe}
      <details>
        <summary>Mac</summary>
        <ol>
          <li>Use the Discord desktop app on macOS 13 or newer.</li>
          <li>
            <b>System Settings › Privacy & Security › Screen & System Audio Recording</b> (older macOS: Screen Recording): turn Discord on,
            then quit and reopen Discord.
          </li>
          <li>Share the browser window showing the audience view with Sound on, and press Test sound.</li>
          <li>Still silent: share your entire screen with sound, or use a virtual audio device such as BlackHole.</li>
        </ol>
      </details>

      <details>
        <summary>Linux</summary>
        <ol>
          <li>The official Discord app sends sound only on Wayland (Discord 0.0.76 or newer), from apps playing through PulseAudio or PipeWire.</li>
          <li>Share the browser window showing the audience view with Sound on, and press Test sound.</li>
          <li>On X11, or if it's still silent, use Vesktop and share the same window with "Stream audio" on.</li>
        </ol>
      </details>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    /* A viewport-sized track so the modal's max-height/height: 100% resolves against the window. */
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 16px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: min(720px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2,
  p {
    margin: 0;
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--panel-2);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .bad {
    color: var(--bad);
  }
  .result.ok {
    color: var(--good);
  }
  .alert {
    border: 1px solid var(--bad);
    border-radius: 8px;
    padding: 8px 10px;
    color: var(--bad);
  }
  .tag {
    background: var(--warn);
    color: #000;
    border-radius: 6px;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 700;
  }
  details {
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  ol,
  ul {
    margin: 6px 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  code {
    background: var(--bg);
    border-radius: 4px;
    padding: 0 4px;
  }
</style>
