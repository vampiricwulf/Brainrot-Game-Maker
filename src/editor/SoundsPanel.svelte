<!-- 🔊 Sounds: the cues played on stream at key moments. (Players and the game rules are set on the ▶ Play screen.) -->
<script lang="ts">
  import SoundSlots from './SoundSlots.svelte';
  import PageHeader from './PageHeader.svelte';
</script>

<section class="page">
  <PageHeader title="Sounds" sub="Played on stream at key moments: short built-in sounds, or your own audio files. Untick one to switch it off." />
  <!-- (One line: 👥 Players & rules ▶ in the sidebar opens that screen.) -->
  <p class="elsewhere" role="note">The players, ⚖ Game rules and phone buzzers are on the ▶ Play screen: 👥 Players & rules ▶, at the top of the Game list.</p>
  <SoundSlots />
</section>

<style>
  section {
    margin-bottom: 24px;
  }
  .elsewhere {
    margin: 0 0 16px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--panel-2);
    font-size: 13px;
  }
</style>
