<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import PlayerList from './PlayerList.svelte';
  import SoundSlots from './SoundSlots.svelte';

  const s = $derived(app.game.settings);
  /** Most players a game can have (the stats strip and the player list stay readable). */
  const MAX_PLAYERS = 20;
</script>

<section>
  <h2>Players</h2>
  <p class="muted">The default roster. You can still change players before and during a game.</p>
  <!-- Deleting is done at once: the note at the bottom offers Undo. -->
  <PlayerList
    bind:players={app.game.players}
    max={s.maxPlayers}
    avatars
    rowMenu
    record={(label, fn) => step(label, fn)}
    onremove={(id) => {
      const p = app.game.players.find((x) => x.id === id);
      if (p) step(`Deleted player “${p.name}”`, () => (app.game.players = app.game.players.filter((x) => x.id !== id)), { notify: true });
    }}
  />
</section>

<section>
  <h2>Rules</h2>
  <div class="grid">
    <label class="check"><input type="checkbox" bind:checked={s.allowNegativeScores} /> Allow negative scores</label>
    <label class="check">
      <input type="checkbox" bind:checked={s.deductOnWrong} /> Show quick ✔/✘ buttons (one click for right or wrong)
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={s.pickerFollowsAward} /> Player who gets points picks next
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={s.buzzer} /> Buzzer mode: the first number pressed in a clue answers, the rest are locked out
    </label>
    {#if s.buzzer}
      <label class="field">
        Buzz-in keys in the audience window (player 1, 2, 3…)
        <input
          value={s.buzzKeys ?? ''}
          oninput={(e) => (s.buzzKeys = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9) || undefined)}
          placeholder="e.g. QPZM (blank: none)"
          maxlength="9"
        />
      </label>
    {/if}
    <label class="field">
      Points symbol
      <input bind:value={s.currencySymbol} placeholder="$, pts, 🧠, or blank" maxlength="6" />
    </label>
    <label class="field">
      Most players
      <input
        type="number"
        min={Math.max(1, app.game.players.length)}
        max={MAX_PLAYERS}
        value={s.maxPlayers}
        onchange={(e) => {
          // Never fewer than the players already listed.
          const n = Math.max(1, app.game.players.length, Math.min(MAX_PLAYERS, Math.round(+e.currentTarget.value) || 0));
          if (n !== s.maxPlayers) s.maxPlayers = n;
          e.currentTarget.value = String(s.maxPlayers);
        }}
      />
    </label>
  </div>
  {#if s.maxPlayers > 9}
    <p class="muted small">While hosting, the number keys 1–9 pick only the first 9 players: click the others.</p>
  {:else}
    <p class="muted small">While hosting, the number keys 1–{s.maxPlayers} pick players.</p>
  {/if}
</section>

<section>
  <h2>Timers</h2>
  <div class="grid">
    <label class="field">
      Default clue countdown (seconds, blank = none)
      <input
        type="number"
        min="0"
        value={s.defaultTimerSeconds ?? ''}
        oninput={(e) => (s.defaultTimerSeconds = e.currentTarget.value === '' || +e.currentTarget.value === 0 ? null : +e.currentTarget.value)}
      />
    </label>
    <label class="check"><input type="checkbox" bind:checked={s.timerAutoStart} /> Start the countdown automatically when a clue opens</label>
  </div>
  <p class="muted small">The host can also start a timer any time with <b>T</b>, and set any clue's own time in the clue editor.</p>
</section>

<section>
  <h2>Round intro</h2>
  <div class="grid">
    <label class="check"><input type="checkbox" bind:checked={s.roundIntro.titleCard} /> Show each round's title card</label>
    <label class="check"><input type="checkbox" bind:checked={s.roundIntro.tileFill} /> Tiles fill in with an animation</label>
    <label class="field">
      Reveal categories
      <select bind:value={s.roundIntro.categoryReveal}>
        <option value="click">One at a time when I click (N)</option>
        <option value="auto">One at a time automatically</option>
        <option value="off">All at once</option>
      </select>
    </label>
  </div>
</section>

<section>
  <h2>Sounds</h2>
  <p class="muted">Played on stream at key moments: short built-in sounds, or your own audio files. Untick one to switch it off.</p>
  <SoundSlots />
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
  }
  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    align-items: end;
  }
  /* A label that wraps keeps its checkbox full size. */
  .check input[type='checkbox'] {
    flex: none;
  }
</style>
