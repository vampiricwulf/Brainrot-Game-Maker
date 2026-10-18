<!--
  🗜 Make a smaller copy for phones (card-files spec §4.8): a 🤫 card's GIF made into a small looping video that phones
  get instead, while the show keeps the GIF as it is. It says what it will make and about how big, makes it (Stop
  leaves nothing), then says how big it came out (Ctrl+Z takes it back). Closed while it works, the work goes on (the
  header's pill shows how far it got). The editor isn't on stream, so the file is named here.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { formatBytes, getBlob, mediaUrls } from '../lib/media.svelte';
  import type { Id } from '../lib/model';
  import { phoneCopyOf } from '../lib/phonecard';
  import { queuePhoneCopy, shrinkable } from '../lib/shrink/apply';
  import { gifInfo } from '../lib/shrink/gif';
  import { jobFor, jobs, progressText, stopJob, watchJob } from '../lib/shrink/jobs.svelte';
  import { formatLine, gifSize, planGif, type GifInfo, type GifPlan } from '../lib/shrink/plan';
  import { encodersFor, probe } from '../lib/shrink/probe';

  let { id, onclose }: { id: Id; onclose: () => void } = $props();

  const game = $derived(app.game);
  const ref = $derived(game.media.find((m) => m.id === id));
  const copy = $derived(ref ? phoneCopyOf(game, ref) : undefined);

  let info = $state<GifInfo | null>(null);
  let plan = $state<GifPlan | { refuse: string } | null>(null);
  /** Why nothing can be made (this browser, or the file). */
  let cant = $state('');
  // (A job already working on it: shown as it goes. The window is made again for another file: Editor's #key.)
  let jobId = $state<string | null>(untrack(() => jobFor(id)?.id ?? null));
  const job = $derived(jobId ? jobs.list.find((j) => j.id === jobId) : undefined);
  const ended = $derived(jobId ? jobs.ended[jobId] : undefined);
  /** The copy made, playing under the result. */
  let watching = $state(false);

  onMount(async () => {
    const can = await probe();
    if (!can.ok) return void (cant = can.why ?? '');
    const blob = getBlob(id);
    if (!ref || !shrinkable(ref) || !blob) return void (cant = 'That file isn’t stored in this browser.');
    try {
      info = gifInfo(new Uint8Array(await blob.arrayBuffer()));
    } catch {
      return void (cant = 'The app can’t read this GIF.');
    }
    const size = gifSize(info.width, info.height);
    plan = planGif(info, await encodersFor(size.width, size.height));
  });
  // Its end is said here while it's open, else in a toast.
  $effect(() => watchJob(jobId));
  onDestroy(() => watchJob(null));

  function make(): void {
    watching = false;
    jobId = queuePhoneCopy(id);
  }

  /** "4.2 s", "1:32". */
  function length(s: number): string {
    if (s < 60) return `${s.toFixed(1)} s`;
    const t = Math.round(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
  const phaseText = (p: string): string => (p === 'waiting' ? 'Waiting for the other file to finish…' : p === 'checking' ? 'Checking it plays…' : p === 'storing' ? 'Storing it in the game…' : 'Making it…');
  const madeRef = $derived(ended && 'done' in ended && ended.media ? game.media.find((m) => m.id === ended.media) : undefined);
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="shrink-title" use:modal={{ esc: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="shrink-title">🗜 Make a smaller copy for phones</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title={job ? 'Close: it carries on (the header shows how far it got)' : 'Close (Esc)'}>✕</button>
    </div>
    {#if !ref}
      <p>That file is no longer in the game.</p>
    {:else}
      <p class="what">
        <b>{ref.name}</b> · {formatBytes(ref.size)}{#if info}{' '}· {length(info.seconds)} · {info.width}×{info.height}{/if}
      </p>
      <p class="muted">Phones get the copy; the show keeps this file as it is.</p>
      {#if copy}<p class="muted">📱 Phones get its smaller copy now ({formatBytes(copy.size)}): making it again puts a new one in its place.</p>{/if}

      {#if job}
        <p role="status" data-shrink-progress>
          {phaseText(job.phase)} <span aria-hidden="true">{progressText(job)}</span>
        </p>
        <progress max="1" value={job.progress} aria-label="How far it got"></progress>
      {:else if ended && 'done' in ended}
        <p role="status" class="good" data-shrink-done>
          {madeRef ? `${formatBytes(madeRef.size)} (was ${formatBytes(ref.size)}). Phones get this copy (Ctrl+Z takes it back).` : 'Done.'}
        </p>
        {#if watching && madeRef && mediaUrls[madeRef.id]}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video class="watch" src={mediaUrls[madeRef.id]} autoplay loop muted playsinline aria-label="The copy for phones"></video>
        {/if}
      {:else if ended && 'failed' in ended}
        <p role="status" class="warn" data-shrink-failed>{ended.failed}</p>
      {:else if ended}
        <p role="status" data-shrink-stopped>Stopped: nothing was changed.</p>
      {/if}

      {#if !job && !(ended && 'done' in ended)}
        {#if cant}
          <p class="warn">{cant}</p>
        {:else if plan && 'refuse' in plan}
          <p class="warn">{plan.refuse}.</p>
        {:else if plan}
          <p>A small looping video, {plan.width}×{plan.height}: about {formatBytes(plan.estimate)}. Phones show it like the GIF.</p>
          <p class="muted">{formatLine(plan)}</p>
        {:else}
          <p class="muted" role="status">Reading the file…</p>
        {/if}
      {/if}
    {/if}

    <div class="modal-foot">
      {#if job}
        <button class="ghost" onclick={onclose} title="Close this window: it carries on (the header shows how far it got)">Keep working</button>
        <button onclick={() => stopJob(job.id)} title="Stop it: nothing is changed">Stop</button>
      {:else if ended && 'done' in ended}
        {#if madeRef}<button class="ghost" onclick={() => (watching = !watching)}>{watching ? '⏹ Stop watching' : '▶ Watch it'}</button>{/if}
        <button class="primary" onclick={onclose}>Close</button>
      {:else}
        <button class="ghost" onclick={onclose}>Cancel</button>
        <button class="primary" onclick={make} disabled={!plan || 'refuse' in plan || !!cant}>{ended || copy ? 'Make it again' : 'Make it'}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .what {
    overflow-wrap: anywhere;
  }
  progress {
    width: 100%;
  }
  .watch {
    width: 100%;
    max-height: 300px;
    border-radius: 6px;
    background: #000;
  }
  .good {
    color: var(--good);
  }
  .warn {
    color: var(--warn);
  }
</style>
