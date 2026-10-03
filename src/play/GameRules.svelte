<!--
  ⚖ Game rules (scoring, most players, timers, the round intro; the buzzers are on the 📱 Phone buzzers card). On the
  pre-game screen, folded away until opened (this computer remembers whether it was open); mid-game, the same rules
  open in a window from the host panel (`folded={false}`). Saved with the game: the play screen keeps the editor's copy
  of it in step (an undoable change in its history).
-->
<script lang="ts">
  import { countdownSeconds, MAX_PLAYERS, mostPlayers, type GameSettings } from '../lib/model';

  let {
    s,
    players,
    folded = true,
  }: {
    s: GameSettings;
    /** Players in the game now ("Most players" never goes below it). */
    players: number;
    /** On the pre-game screen: a fold with its heading (mid-game, the window around it has the heading). */
    folded?: boolean;
  } = $props();

  const OPEN_KEY = 'jb.rulesOpen';

  let open = $state(readOpen());
  function readOpen(): boolean {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  }
  // The fold's own state, bound both ways (a handler that copies it after the toggle event could lag a redraw and
  // close it again); remembered on this computer.
  $effect(() => {
    const v = open ? '1' : '0';
    try {
      if (localStorage.getItem(OPEN_KEY) !== v) localStorage.setItem(OPEN_KEY, v);
    } catch {
      // Storage may be off (private mode): it opens closed next time.
    }
  });

  /** The rules at a glance, on the closed fold. */
  const gist = $derived(
    [
      s.defaultTimerSeconds ? `${s.defaultTimerSeconds} s countdown` : 'No countdown',
      `${s.maxPlayers} players at most`,
      s.allowNegativeScores ? 'Negative scores' : 'No negative scores',
    ].join(' · '),
  );
</script>

{#snippet body()}
  <div class="body">
    <h3>Scoring and players</h3>
    <div class="grid">
      <label class="check"><input type="checkbox" bind:checked={s.allowNegativeScores} /> Allow negative scores</label>
      <label class="check">
        <input type="checkbox" bind:checked={s.deductOnWrong} /> Show quick ✔/✘ buttons (one click for right or wrong)
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={s.pickerFollowsAward} /> Player who gets points picks next
      </label>
      <label class="field">
        Points symbol
        <input bind:value={s.currencySymbol} placeholder="$, pts, 🧠, or blank" maxlength="6" title="A word (pts, coins) goes after the number: 200 pts. $, € or 🧠 goes in front: $200" />
      </label>
      <label class="field">
        Most players
        <input
          type="number"
          min={Math.max(1, players)}
          max={MAX_PLAYERS}
          value={s.maxPlayers}
          onchange={(e) => {
            // Never fewer than the players already listed; emptied (or not a number), it keeps the last value.
            const v = e.currentTarget.value.trim() === '' ? NaN : +e.currentTarget.value;
            const n = Number.isFinite(v) ? mostPlayers(Math.round(v), players) : s.maxPlayers;
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

    <h3>Timers</h3>
    <div class="grid">
      <label class="field">
        Default clue countdown (seconds, blank = none)
        <input
          type="number"
          min="0"
          step="1"
          value={s.defaultTimerSeconds ?? ''}
          onchange={(e) => {
            // Whole seconds, at least 1 (blank or 0: no countdown).
            const n = countdownSeconds(e.currentTarget.value);
            if (n !== s.defaultTimerSeconds) s.defaultTimerSeconds = n;
            e.currentTarget.value = n === null ? '' : String(n);
          }}
        />
      </label>
      <label class="check"><input type="checkbox" bind:checked={s.timerAutoStart} /> Start the countdown automatically when a clue opens</label>
    </div>
    <p class="muted small">You can also start a timer any time with <b>T</b>, and set any clue's own time in the clue editor.</p>

    <h3>Round intro</h3>
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
  </div>
{/snippet}

{#if folded}
  <details class="rules" bind:open data-place="play:rules">
    <!-- A heading of its own, so the rules' sections aren't read as part of the card above. -->
    <summary><h2>⚖ Game rules</h2> <span class="muted small">{gist}</span></summary>
    {@render body()}
  </details>
{:else}
  {@render body()}
{/if}

<style>
  .rules {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
  }
  summary {
    cursor: pointer;
  }
  summary h2 {
    display: inline;
    margin: 0;
    font-size: 15px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }
  h3 {
    margin: 8px 0 0;
    font-size: 14px;
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .grid {
    display: grid;
    gap: 10px 12px;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    /* A field (its label above its box) lines up with the checkboxes beside it, middle to middle. */
    align-items: center;
  }
  /* A label that wraps keeps its checkbox full size. */
  .check input[type='checkbox'] {
    flex: none;
  }
</style>
