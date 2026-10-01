<!-- Host countdown controls; usable any time (spec §6.6). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { addTime, startTimer, timerRemaining, toggleTimer } from '../../lib/live';

  /** custom: the seconds typed in the box (bound, so T uses them too). */
  let { defaultSeconds, custom = $bindable(null) }: { defaultSeconds: number; custom?: number | null } = $props();
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(id);
  });
  const t = $derived(app.live.timer);
  const left = $derived(t ? Math.ceil(timerRemaining(t, now)) : 0);
</script>

<div class="tc row">
  <span class="muted">⏱</span>
  {#if t}
    <b class="left" class:done={t.expired}>{t.expired ? "Time's up" : `${left}s`}</b>
    <button class="small" onclick={() => toggleTimer(app.live)} disabled={t.expired} title="T" aria-label={t.startedAt === null ? 'Start timer' : 'Pause timer'}>{t.startedAt === null ? '▶' : '⏸'}</button>
    <!-- Change the time left without starting over. -->
    <button class="small ghost" onclick={() => addTime(app.live, -10)} disabled={t.expired} title="10 seconds less">−10</button>
    <button class="small ghost" onclick={() => addTime(app.live, 10)} title="10 seconds more (Shift+T)">+10</button>
    <button class="small ghost" onclick={() => startTimer(app.live, t.total)} title="Restart" aria-label="Restart timer">↺</button>
    <button class="small ghost" onclick={() => (app.live.timer = null)} title="Hide timer" aria-label="Hide timer">✕</button>
  {:else}
    <button class="small" onclick={() => startTimer(app.live, custom || defaultSeconds)} title="T">Start {custom || defaultSeconds}s</button>
  {/if}
  <!-- Enter starts that countdown; Enter and Esc give the keys back to the shortcuts, as the Amount box does. -->
  <input
    type="number"
    min="1"
    max="3600"
    placeholder="secs"
    bind:value={custom}
    aria-label="Timer seconds"
    onkeydown={(e) => {
      if (e.key === 'Enter') startTimer(app.live, custom || defaultSeconds);
      if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
    }}
  />
</div>

<style>
  .tc {
    gap: 4px;
  }
  .left {
    font-variant-numeric: tabular-nums;
    min-width: 44px;
  }
  .done {
    color: var(--bad);
  }
  .small {
    font-size: 12px;
    padding: 3px 8px;
  }
  input {
    width: 64px;
    padding: 3px 6px;
  }
</style>
