<!-- 🔊 Sounds: the cues played on stream at key moments. (Players and the game rules are set on the ▶ Play screen.) -->
<script lang="ts">
  import SoundSlots from './SoundSlots.svelte';

  let { onplay, canPlay = true }: { /** ▶ Play: the pre-game screen, where the players and rules are. */ onplay?: () => void; canPlay?: boolean } = $props();
</script>

<section>
  <h2>Sounds</h2>
  <div class="elsewhere" role="note">
    <span>Looking for the players, the 📋 Game rules (timers, the round intro) or the phone buzzers? They're set on the ▶ Play screen, before the game starts.</span>
    {#if onplay}
      <button class="small" onclick={onplay} disabled={!canPlay} title={canPlay ? '' : 'Add a round first'}>▶ Play</button>
    {/if}
  </div>
  <p class="muted">Played on stream at key moments: short built-in sounds, or your own audio files. Untick one to switch it off.</p>
  <SoundSlots />
</section>

<style>
  section {
    max-width: 860px;
    margin-bottom: 28px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  p {
    margin: 0 0 12px;
  }
  .elsewhere {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
    padding: 8px 10px 8px 12px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--panel-2);
    font-size: 13px;
  }
  .elsewhere span {
    flex: 1;
  }
  .elsewhere button {
    flex: none;
  }
</style>
