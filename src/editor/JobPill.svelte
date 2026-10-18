<!--
  The editor header's pill while a file job runs (card-files spec §4.13.5): what it's doing, how far it got and how many
  wait, with Stop. It never names the file (the header can be on stream while the host shares the screen), and a
  screen reader hears when it starts and ends, not every percent.
-->
<script lang="ts">
  import { jobs, pillText, progressText, stopJob } from '../lib/shrink/jobs.svelte';

  const job = $derived(jobs.current);
  const waiting = $derived(jobs.list.length - (job ? 1 : 0));
</script>

{#if job}
  <span class="pill" data-job-pill>
    <span role="status">{pillText(job)}</span>
    <span aria-hidden="true">{progressText(job)}{waiting ? ` (+${waiting} waiting)` : ''}</span>
    <button class="small ghost" onclick={() => stopJob(job.id)} title="Stop it: nothing is changed">Stop</button>
  </span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 2px 4px 2px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
  }
</style>
