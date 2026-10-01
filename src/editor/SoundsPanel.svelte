<!-- 🔊 Sounds: the cues played on stream at key moments. (Players and the game rules are set on the ▶ Play screen.) -->
<script lang="ts">
  import SoundSlots from './SoundSlots.svelte';
  import PageHeader from './PageHeader.svelte';

  let { onplay, canPlay = true }: { /** ▶ Play: the pre-game screen, where the players and rules are. */ onplay?: () => void; canPlay?: boolean } = $props();
</script>

<section class="page">
  <PageHeader title="Sounds" sub="Played on stream at key moments: short built-in sounds, or your own audio files. Untick one to switch it off." />
  <div class="elsewhere" role="note">
    <span>Looking for the players, the ⚖ Game rules (timers, the round intro) or the phone buzzers? They're set on the ▶ Play screen, before the game starts.</span>
    {#if onplay}
      <!-- (Named apart from the header's ▶ Play, which starts the same screen.) -->
      <button class="small" onclick={onplay} disabled={!canPlay} aria-label="Open the Play screen" title={canPlay ? 'Open the Play screen' : 'Add a round first'}>▶ Play</button>
    {/if}
  </div>
  <SoundSlots />
</section>

<style>
  section {
    margin-bottom: 24px;
  }
  .elsewhere {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
    padding: 8px 8px 8px 12px;
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
