<!--
  Phone buzzers' options, saved with the game: when the buzzers open, teams, new players from phones, the early-buzz
  wait.
-->
<script lang="ts" module>
  import type { GameSettings } from '../lib/model';

  export type BuzzSettingKey = 'buzzer' | 'buzzArm' | 'phoneJoin' | 'phoneColorsOff' | 'earlyBuzzLock' | 'buzzTeams';
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
        onchange={(e) => {
          // The box follows the setting: with phones in the room the 📱 card asks first, and "Keep" leaves it as it was.
          const on = e.currentTarget.checked;
          e.currentTarget.checked = !!settings.buzzTeams;
          onset('buzzTeams', on || undefined, 'Teams');
        }}
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
    <label class="check" title={settings.buzzTeams ? 'A team’s colour is yours to pick (👥 Teams)' : 'From the colours no other player has'}>
      <input
        type="checkbox"
        checked={!settings.phoneColorsOff && !settings.buzzTeams}
        disabled={!!settings.buzzTeams}
        onchange={(e) => onset('phoneColorsOff', e.currentTarget.checked ? undefined : true, 'Players pick their colour on their phone')}
      />
      Players can pick their colour on their phone
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
          // Emptied (to type another): the wait stays as it was.
          if (!e.currentTarget.value.trim()) return void (e.currentTarget.value = String(settings.earlyBuzzLock ?? 1));
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
