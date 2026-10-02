<!--
  Phone buzzers' options, saved with the game: when the buzzers open, teams, new players from phones, the early-buzz
  wait.
-->
<script lang="ts" module>
  import type { GameSettings } from '../lib/model';

  export type BuzzSettingKey = 'buzzer' | 'buzzArm' | 'phoneJoin' | 'earlyBuzzLock' | 'buzzTeams';
  /** Changes one buzzer setting (here and in the editor's copy of the game, undoable there). */
  export type SetBuzzSetting = <K extends BuzzSettingKey>(key: K, value: GameSettings[K], label: string) => void;
</script>

<script lang="ts">
  let { settings, onset, compact = false }: { settings: GameSettings; onset: SetBuzzSetting; compact?: boolean } = $props();
</script>

<div class="opts" class:compact>
  <label>
    <span>Open the buzzers</span>
    <select value={settings.buzzArm ?? 'open'} onchange={(e) => onset('buzzArm', e.currentTarget.value === 'host' ? 'host' : undefined, 'When the buzzers open')}>
      <option value="open">When the clue opens</option>
      <option value="host">When I press U (after reading it)</option>
    </select>
  </label>
  {#if !compact}
    <label class="check" title="Each row of the list becomes a team (👥 Teams). On their phone people pick a team and type their own name; whoever on the team buzzes first answers for it, and a wrong answer locks out the whole team.">
      <input
        type="checkbox"
        checked={!!settings.buzzTeams}
        onchange={(e) => onset('buzzTeams', e.currentTarget.checked || undefined, 'Teams')}
      />
      Teams: people join a team, anyone on it can buzz for it
    </label>
    <label class="check" title={settings.buzzTeams ? 'With teams, people join a team you made (＋ Add team in 👥 Teams)' : undefined}>
      <input
        type="checkbox"
        checked={!!settings.phoneJoin && !settings.buzzTeams}
        disabled={!!settings.buzzTeams}
        onchange={(e) => onset('phoneJoin', e.currentTarget.checked || undefined, 'New players from their phone')}
      />
      Let new players join from their phone (you add them)
    </label>
    <label>
      <span>A phone that buzzes too early waits (seconds)</span>
      <input
        type="number"
        min="0"
        max="5"
        step="0.25"
        value={settings.earlyBuzzLock ?? 1}
        onchange={(e) => {
          const n = Math.max(0, Math.min(5, Number(e.currentTarget.value)));
          onset('earlyBuzzLock', Number.isFinite(n) && n !== 1 ? n : undefined, 'Early buzz wait');
          e.currentTarget.value = String(settings.earlyBuzzLock ?? 1);
        }}
      />
    </label>
  {/if}
</div>

<style>
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    font-size: 14px;
  }
  .opts > label:not(.check) {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .opts input[type='number'] {
    width: 5em;
  }
  .compact {
    font-size: 12px;
  }
</style>
