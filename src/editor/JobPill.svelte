<!--
  The editor header's pill while a file job runs (card-files spec §4.13.5): what it's doing, how far it got and how many
  wait, with Stop. It never names the file (the header can be on stream while the host shares the screen), and a
  screen reader hears when it starts and ends, not every percent.
-->
<script lang="ts">
  import { jobs, pillText, stopJob } from '../lib/shrink/jobs.svelte';
  import { leftText } from '../lib/shrink/plan';

  /** Laid over the autosave note, in its place (Editor.svelte): the header's buttons don't move as jobs come and go. */
  let { over = false }: { over?: boolean } = $props();

  const job = $derived(jobs.current);
  const waiting = $derived(jobs.list.length - (job ? 1 : 0));
  const said = $derived(job ? pillText(job) : '');
  // ("✂ Saving a video’s edit…": its sign, then its words.)
  const sign = $derived(said.split(' ')[0]);
  const words = $derived(said.slice(sign.length + 1));
  const working = $derived(!!job && job.phase === 'working' && job.progress > 0);
  const pct = $derived(working ? `${Math.floor(job!.progress * 100)}%` : '');
  const more = $derived(
    [working && job!.left !== null && job!.progress < 1 ? ` (${leftText(job!.left)})` : '', waiting ? ` (+${waiting} waiting)` : ''].join(''),
  );
</script>

{#if job}
  <span class="pill" class:over data-job-pill title={`${said}${pct ? ` ${pct}` : ''}${more}`}>
    <span class="sr-only" role="status">{said}</span>
    <!-- (Short of room, the words end in "…", then go: the sign, the percentage and Stop stay.) -->
    <span class="sign" aria-hidden="true">{sign}</span>
    <span class="pct" aria-hidden="true" data-job-pct>{pct}</span>
    <span class="words" aria-hidden="true">{words}{more}</span>
    <button class="small ghost" onclick={() => stopJob(job.id)} title="Stop it: nothing is changed">Stop</button>
  </span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 2px 4px 2px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 12px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
  }
  /* (Its own width at most, the note's at most, at the note's right: next to 🔍 Find, where the note ends.) */
  .over {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    max-width: 100%;
    box-sizing: border-box;
    background: var(--panel);
  }
  /* (On one line, where the note is the short one, and on a phone, its words would be a letter and "…": the tooltip
     has them.) */
  @media (max-width: 700px), (min-width: 901px) and (max-width: 1449px) {
    .over .words {
      display: none;
    }
  }
  .pct:empty {
    display: none;
  }
  .words {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sign,
  .pct,
  button {
    flex-shrink: 0;
  }
</style>
