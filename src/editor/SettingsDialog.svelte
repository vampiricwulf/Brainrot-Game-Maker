<!-- ⚙ Settings: this computer’s preferences (autosaves, how Save names files, how much undo to remember). Kept in this browser / app, not the game. -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import { inTauri } from '../lib/platform';
  import { keepLimits } from '../lib/history.svelte';
  import { DEFAULT_PREFS, prefs, savePrefs, UNDO_STEPS } from '../lib/prefs.svelte';
  import { DEFAULT_BUZZER_URL, testServer } from '../lib/remote.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const desktop = inTauri();
  /** What ⚙ Test found at the buzzer server. */
  let tested = $state('');
  let testing = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Settings" use:modal data-undo="off">
    <div class="row">
      <h2 class="modal-title">⚙ Settings</h2>
      <span class="spacer"></span>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>

    <h3>Saving</h3>
    {#if desktop}
      <label class="check">
        <input type="checkbox" bind:checked={prefs.overwriteSave} onchange={savePrefs} />
        Save replaces the game’s last save
      </label>
      <p class="muted small">
        On: Save writes Game.brainrot again and keeps the two before it as Game.brainrot.bak and .bak2 (Open… › Browse… opens
        them). Another game with the same name never gets replaced: it saves as Game (2).brainrot. Off: every Save makes a new
        file (Game (2).brainrot, Game (3).brainrot…).
      </p>
    {:else}
      <p class="muted small">
        In a browser, Save downloads the game as a .brainrot file, and the browser names it. How Save names files is a desktop
        app setting.
      </p>
    {/if}

    <h3>Autosave</h3>
    {#if desktop}
      <label class="field inline">
        Save a copy of the game every
        <input type="number" min="0" max="240" class="n" bind:value={prefs.autosaveMinutes} onchange={savePrefs} aria-label="Autosave every (minutes)" />
        minutes (0: off)
      </label>
      <label class="field inline">
        Keep
        <input type="number" min="1" max="50" class="n" bind:value={prefs.autosaveKeep} onchange={savePrefs} aria-label="Autosaves to keep" />
        autosaves per game (the oldest is replaced)
      </label>
      <p class="muted small">
        Autosaves go in BrainrotSaves next to the app as “Game (autosave 1, 3f9a1c).brainrot”, “(autosave 2, …)”… (the letters
        tell games with the same name apart). Only when the game changed since the last one; after you lower the number, the
        next autosave deletes the extra ones. Open… lists them with your saves.
      </p>
    {:else}
      <p class="muted small">
        In a browser the game is autosaved inside the browser after every change (Resume game). Autosave files in a folder are
        a desktop app feature.
      </p>
    {/if}

    <h3>Undo</h3>
    <label class="field inline">
      Remember the last
      <input
        type="number"
        min={UNDO_STEPS.min}
        max={UNDO_STEPS.max}
        class="n"
        bind:value={prefs.undoSteps}
        onchange={() => (savePrefs(), keepLimits())}
        aria-label="Undo steps to remember"
      />
      changes ({UNDO_STEPS.min}–{UNDO_STEPS.max})
    </label>
    <p class="muted small">How far Ctrl+Z and the 🕘 History tab can go back. The oldest changes are forgotten first.</p>

    <h3>Motion</h3>
    <label class="check">
      <input type="checkbox" bind:checked={prefs.reduceMotion} onchange={savePrefs} />
      Reduce motion on stream
    </label>
    <p class="muted small">
      Viewers get no pop-ins, fly-ins, board fill-in or falling confetti: things just appear. The wheel and the dice still
      spin. The editor and the host’s controls follow your computer’s “reduce motion” setting.
    </p>

    <h3>Phone buzzers</h3>
    <label class="field inline">
      Buzzer server
      <input
        class="url"
        type="url"
        bind:value={prefs.buzzerServer}
        onchange={() => ((tested = ''), savePrefs())}
        placeholder={DEFAULT_BUZZER_URL || 'https://…'}
        aria-label="Buzzer server"
      />
      <button
        class="small"
        disabled={testing || !(prefs.buzzerServer || DEFAULT_BUZZER_URL)}
        onclick={async () => {
          testing = true;
          tested = await testServer(prefs.buzzerServer || DEFAULT_BUZZER_URL);
          testing = false;
        }}>{testing ? 'Testing…' : 'Test'}</button
      >
    </label>
    {#if tested}<p class="small" role="status">{tested}</p>{/if}
    <p class="muted small">
      Advanced: where phone buzzer rooms are made (Setup › Rules › Players buzz from: their phones too).
      {DEFAULT_BUZZER_URL ? 'Leave it blank for the one this copy comes with.' : "This copy comes without one: phone buzzers need an address here."}
    </p>

    <div class="row">
      <button
        class="ghost small"
        onclick={() => {
          Object.assign(prefs, DEFAULT_PREFS);
          savePrefs();
          keepLimits();
        }}>Back to the defaults</button
      >
      <span class="spacer"></span>
      <button class="primary" onclick={onclose}>Done</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(560px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h3 {
    margin-top: 8px;
    font-size: 14px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .inline {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .n {
    width: 70px;
  }
  .url {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 12px;
  }
</style>
