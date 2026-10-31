<!--
  Phone buzzers' options, saved with the game: when the buzzers open, new players from phones, colors on phones, the
  early-buzz wait. On ▶ Play's 📱 card they're folded, "▸ Buzzer options · Buzzers open with the clue · new players: no…"
  (this computer remembers whether it was left open), opening by itself only for a problem (an option this buzzer
  server can't do). In the game (`compact`) only when the buzzers open, with no fold.
-->
<script lang="ts" module>
  import type { GameSettings } from '../lib/model';

  export type BuzzSettingKey = 'buzzer' | 'buzzArm' | 'phoneJoin' | 'phoneColorsOff' | 'earlyBuzzLock' | 'buzzTeams';
  /** Changes one buzzer setting (here and in the editor's copy of the game, undoable there). */
  export type SetBuzzSetting = <K extends BuzzSettingKey>(key: K, value: GameSettings[K], label: string) => void;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { buzzerGist } from './phonewords';

  let {
    settings,
    onset,
    compact = false,
    problem = '',
  }: {
    settings: GameSettings;
    onset: SetBuzzSetting;
    compact?: boolean;
    /** An option this buzzer server can't do, in words: the fold opens by itself to say so. */
    problem?: string;
  } = $props();

  const OPEN_KEY = 'jb.buzzerOptionsOpen';
  /** Whether the host last left the fold open (this computer remembers); opened by itself for a problem, until closed. */
  let kept = $state(readOpen());
  let here = $state<boolean | null>(null);
  function readOpen(): boolean {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  }
  $effect(() => {
    if (problem) untrack(() => (here ??= true));
  });
  const open = $derived(here ?? kept);
  function setOpen(v: boolean): void {
    if (v === open) return;
    here = v;
    // (Closed over a problem: this time only.)
    if (problem && !v) return;
    kept = v;
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      // Storage may be off (private mode): it opens closed next time.
    }
  }
</script>

{#snippet arm()}
  <label>
    <span>Open the buzzers</span>
    <select value={settings.buzzArm ?? 'open'} onchange={(e) => onset('buzzArm', e.currentTarget.value === 'host' ? 'host' : undefined, 'When the buzzers open')}>
      <option value="open">When the clue opens</option>
      <option value="host">When I press U (after reading it)</option>
    </select>
  </label>
{/snippet}

{#if compact}
  <div class="opts compact">{@render arm()}</div>
{:else}
  <details class="fold" bind:open={() => open, setOpen} data-buzzer-options>
    <summary><b>Buzzer options</b> <span class="muted small" class:warn={!!problem}>· {buzzerGist(settings)}</span></summary>
    <div class="opts">
      {@render arm()}
      <label class="check" title={settings.buzzTeams ? 'With teams, people join a team you made (＋ Add team in 👥 Teams)' : undefined}>
        <input
          type="checkbox"
          checked={!!settings.phoneJoin && !settings.buzzTeams}
          disabled={!!settings.buzzTeams}
          onchange={(e) => onset('phoneJoin', e.currentTarget.checked || undefined, 'New players from their phone')}
        />
        Let new players join from their phone (you add them)
      </label>
      <label class="check" title={settings.buzzTeams ? 'A team’s color is yours to pick (👥 Teams)' : 'From the colors no other player has'}>
        <input
          type="checkbox"
          checked={!settings.phoneColorsOff && !settings.buzzTeams}
          disabled={!!settings.buzzTeams}
          onchange={(e) => onset('phoneColorsOff', e.currentTarget.checked ? undefined : true, 'Players pick their color on their phone')}
        />
        Players can pick their color on their phone
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
    </div>
    {#if problem}<p class="warn small" role="status">⚠ {problem}</p>{/if}
  </details>
{/if}

<style>
  .fold summary {
    cursor: pointer;
  }
  .fold summary b {
    font-weight: 600;
    font-size: 14px;
  }
  .fold .opts {
    padding-top: 6px;
  }
  .fold p {
    margin: 6px 0 0;
  }
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
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
</style>
