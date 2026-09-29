<script lang="ts">
  import { app } from '../lib/app.svelte';
  import PlayerList from './PlayerList.svelte';

  const s = $derived(app.game.settings);
</script>

<section>
  <h2>Players</h2>
  <p class="muted">The default roster. You can still change players before and during a game.</p>
  <PlayerList bind:players={app.game.players} max={s.maxPlayers} />
</section>

<section>
  <h2>Rules</h2>
  <div class="grid">
    <label class="check"><input type="checkbox" bind:checked={s.allowNegativeScores} /> Allow negative scores</label>
    <label class="check">
      <input type="checkbox" bind:checked={s.deductOnWrong} /> Show quick "Wrong (−value)" buttons
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={s.pickerFollowsAward} /> Player who gets points picks next
    </label>
    <label class="field">
      Points symbol
      <input bind:value={s.currencySymbol} placeholder="$, pts, 🧠, or blank" maxlength="6" />
    </label>
  </div>
</section>

<style>
  section {
    max-width: 820px;
    margin-bottom: 28px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  p {
    margin: 0 0 12px;
  }
  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    align-items: end;
  }
</style>
