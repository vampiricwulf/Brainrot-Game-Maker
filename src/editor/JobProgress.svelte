<!--
  How a file job is going, in a line (card-files spec §4.12.5): waiting its turn, how far it got making the file (the
  percent kept from screen readers, which hear the start and the end), checking it, storing it, then what it made or
  why it couldn't. Shared by 🔄 Convert's rows; it never names the file, so it can sit anywhere.
-->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { formatBytes } from '../lib/media.svelte';
  import { jobs, progressText, type Job } from '../lib/shrink/jobs.svelte';
  import { typeWord } from '../lib/shrink/plan';

  let { job: id, compact = false }: { job: string; compact?: boolean } = $props();

  const job = $derived(jobs.list.find((j) => j.id === id));
  const end = $derived(jobs.ended[id]);
  const made = $derived(end && 'done' in end && end.media ? app.game.media.find((m) => m.id === end.media) : undefined);

  /** "Repackaging…", "Converting…", "Making it…". */
  function doing(j: Job): string {
    if (j.phase === 'waiting') return compact ? 'Waiting…' : 'Waiting for the other file to finish…';
    if (j.phase === 'reading') return 'Reading the file…';
    if (j.phase === 'checking') return 'Checking it plays…';
    if (j.phase === 'storing') return 'Storing it in the game…';
    if (j.kind === 'convert') return j.copying ? 'Repackaging…' : 'Converting…';
    if (j.kind === 'edit') return j.copying ? 'Trimming…' : 'Re-encoding…';
    return 'Making it…';
  }
</script>

{#if job}
  <span class="muted" role="status" data-job-progress={job.phase}>{doing(job)}{#if progressText(job)}{' '}<span aria-hidden="true">{progressText(job)}</span>{/if}</span>
{:else if end && 'done' in end}
  <span class="good" role="status" data-job-progress="done">✓ {made ? `${typeWord(made.mime)} · ${formatBytes(made.size)}` : 'Done'}</span>
{:else if end && 'failed' in end}
  <span class="warn" role="status" data-job-progress="failed">⚠ {end.failed}</span>
{:else if end}
  <span class="muted" role="status" data-job-progress="stopped">Stopped: nothing was changed.</span>
{/if}

<style>
  .good {
    color: var(--good);
  }
  .warn {
    color: var(--warn);
  }
</style>
