<!-- 🔊 Sounds: the cues played on stream at key moments. (Players and the game rules are set on the ▶ Play screen.) -->
<script lang="ts">
  import SoundSlots from './SoundSlots.svelte';
</script>

<section>
  <h2>Sounds</h2>
  <p class="muted">Played on stream at key moments: short built-in sounds, or your own audio files. Untick one to switch it off.</p>
  <SoundSlots />
  <p class="muted small">Players and the game rules (buzzers, timers, the round intro) are set on the ▶ Play screen, before the game starts.</p>
</section>

<style>
  section {
    max-width: 860px;
    margin-bottom: 28px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  p {
    margin: 0 0 12px;
  }
  .small {
    font-size: 12px;
    margin-top: 16px;
  }
</style>
