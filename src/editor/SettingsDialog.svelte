<!-- ⚙ Settings: this computer’s preferences (autosaves, how Save names files, how much undo to remember). Kept in this browser / app, not the game. -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import { inTauri } from '../lib/platform';
  import { keepLimits } from '../lib/history.svelte';
  import { DEFAULT_PREFS, prefs, savePrefs, UNDO_STEPS } from '../lib/prefs.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const desktop = inTauri();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Settings" use:modal data-undo="off">
    <div class="row">
      <h2>⚙ Settings</h2>
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>

    <h3>Saving</h3>
    {#if desktop}
      <label class="check">
        <input type="checkbox" bind:checked={prefs.overwriteSave} onchange={savePrefs} />
        Save replaces the game’s last save
      </label>
      <p class="muted small">
        Off: every Save keeps the older saves and makes a new file (Game.brainrot, then Game (2).brainrot, Game (3).brainrot…).
        On: Save always writes Game.brainrot.
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
        Autosaves go in BrainrotSaves next to the app as “Game (autosave 1).brainrot”, “(autosave 2)”… Only when the game
        changed since the last one. Open… lists them with your saves.
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
  .small {
    font-size: 12px;
  }
</style>
