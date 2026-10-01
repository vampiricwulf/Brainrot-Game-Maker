<!-- How the game is shown: one window, or a separate audience window to capture (the pre-game screen, and Resume). -->
<script lang="ts">
  let {
    dual = null,
    onsingle,
    onaudience,
  }: {
    /** The mode now (null: none picked yet, as when resuming). */
    dual?: boolean | null;
    onsingle: () => void;
    onaudience: () => void;
  } = $props();
</script>

<div class="modes">
  <button class="mode" class:on={dual === false} aria-pressed={dual === null ? undefined : !dual} onclick={onsingle}>
    <b>Single window</b>
    <span class="muted">Viewers see this window, everything on it. Press H to hide the host controls.</span>
  </button>
  <button class="mode" class:on={dual === true} aria-pressed={dual === null ? undefined : dual} onclick={onaudience}>
    <b>📺 Separate audience window</b>
    <span class="muted">Capture the audience window in OBS. This window shows answers and controls, for your eyes only.</span>
  </button>
</div>

<style>
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    white-space: normal;
    padding: 12px;
  }
  .mode.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  @media (max-width: 640px) {
    .modes {
      grid-template-columns: 1fr;
    }
  }
</style>
