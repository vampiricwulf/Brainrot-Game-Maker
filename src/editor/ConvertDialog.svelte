<!--
  🔄 Convert (card-files spec §4.12.5): videos and sounds that won't play in this browser (or play without their sound,
  or that phones' 🤫 cards can't open), a row each: why, what it would become and about how big. Converting puts a copy
  that plays in the file's place everywhere it's used, on stream too: repackaged in seconds with nothing lost when only
  the file type is the trouble, made again otherwise. One job and one Ctrl+Z step a file. Closed while it works, the
  work goes on (the header's pill shows how far it got). The editor isn't on stream, so files are named here.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { formatBytes, getBlob } from '../lib/media.svelte';
  import type { Id, MediaRef } from '../lib/model';
  import { convertFix, queueConvert, typeName } from '../lib/shrink/apply';
  import { checkSoon, dismissOffer, verdictOf } from '../lib/shrink/checks.svelte';
  import { readFacts, type MediaFacts } from '../lib/shrink/facts';
  import { jobFor, jobs, stopJob, watchJobs } from '../lib/shrink/jobs.svelte';
  import { lengthText, planConvert } from '../lib/shrink/plan';
  import { isLossless } from '../lib/shrink/playable';
  import { probe, type Can } from '../lib/shrink/probe';
  import { rowText } from '../lib/shrink/words';
  import JobProgress from './JobProgress.svelte';
  import { undoClosing } from './undoclose';

  let { ids, onclose }: { ids: Id[]; onclose: () => void } = $props();

  const game = $derived(app.game);
  interface Row {
    id: Id;
    /** The file as it was when the window opened (once converted, it's under another id). */
    was: Pick<MediaRef, 'name' | 'kind' | 'size'>;
    /** What's in it (null: still being read; box null: the app can't read it). */
    facts: MediaFacts | null;
    on: boolean;
    job: string | null;
  }
  // (The window is made again for other files: Editor's #key.)
  let rows = $state<Row[]>(
    untrack(() =>
      ids.flatMap((id) => {
        const m = app.game.media.find((x) => x.id === id);
        return m ? [{ id, was: { name: m.name, kind: m.kind, size: m.size }, facts: null, on: true, job: jobFor(id)?.id ?? null }] : [];
      }),
    ),
  );
  let can = $state<Can | null>(null);

  onMount(async () => {
    can = await probe();
    for (const r of rows) {
      // (Not worked out yet: soon.)
      if (verdictOf(r.id) === undefined) checkSoon(r.id, game);
      const blob = getBlob(r.id);
      r.facts = blob ? await readFacts(blob, { duration: 'compute' }) : { box: null, seconds: null, size: 0, video: null, audio: null, moreAudio: 0, subtitles: false };
    }
  });

  /** A row's fix and what it makes, once its file is read and checked. */
  const planOf = (r: Row) => {
    const m = game.media.find((x) => x.id === r.id);
    const c = convertFix(r.id);
    if (!m || !c || !can || !r.facts?.box) return null;
    return { fix: c.fix, plan: planConvert(r.facts, c.fix, can, m.kind === 'audio' ? 'audio' : 'video') };
  };
  const rowJobs = $derived(rows.flatMap((r) => (r.job ? [r.job] : [])));
  const working = $derived(rowJobs.some((j) => jobs.list.some((x) => x.id === j)));
  const picked = $derived(rows.filter((r) => r.on && !r.job && planOf(r)));
  const reading = $derived(rows.some((r) => !r.facts || verdictOf(r.id) === 'checking'));
  const quick = $derived(picked.length > 0 && picked.every((r) => isLossless(planOf(r)!.fix)));
  const one = untrack(() => rows.length === 1);
  const title = untrack(() => (one ? `🔄 Convert a ${rows[0].was.kind === 'audio' ? 'sound' : 'video'}` : `🔄 Convert ${rows.length} files`));
  const ICON = { image: '🖼', video: '🎬', audio: '🔊', font: '🔤' } as const;

  // Their ends are said here while it's open, else in toasts (several together: one toast for them all).
  $effect(() => watchJobs(rowJobs));
  onDestroy(() => watchJobs([]));

  function go(): void {
    const list = picked;
    const batch = list.length > 1 ? `convert-${Date.now()}` : undefined;
    for (const r of list) {
      r.job = queueConvert(game, r.id, batch);
      r.on = false;
    }
  }
  /** Not now: the note at the top goes too. */
  function later(): void {
    for (const r of rows) dismissOffer(r.id);
    onclose();
  }

  /** Once converted, with nothing still working, Ctrl+Z does what the window says: it closes, and the last one goes back. */
  function onkey(e: KeyboardEvent): void {
    if (!working && rowJobs.some((j) => 'done' in (jobs.ended[j] ?? {}))) undoClosing(e, onclose);
  }

  // The buttons at the foot change as it goes: when the one focused goes, the focus moves to the new ones.
  let foot = $state<HTMLElement>();
  const footFor = $derived(working ? 'working' : rowJobs.length ? 'ended' : 'pick');
  let footWas = untrack(() => footFor);
  $effect(() => {
    const now = footFor;
    if (now === footWas) return;
    footWas = now;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost) (foot?.querySelector<HTMLElement>('[data-stop]') ?? foot?.querySelector<HTMLElement>('button.primary'))?.focus();
  });
</script>

<svelte:window onkeydowncapture={onkey} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="convert-title" use:modal={{ esc: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="convert-title">{title}</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title={working ? 'Close: it carries on (the header shows how far it got)' : 'Close (Esc)'}>✕</button>
    </div>
    <ul class="rows">
      {#each rows as r (r.id)}
        {@const m = game.media.find((x) => x.id === r.id) ?? r.was}
        {@const v = verdictOf(r.id)}
        {@const p = planOf(r)}
        {#if r.job || game.media.some((x) => x.id === r.id)}
          <li data-convert-row={r.id}>
            <label>
              {#if p && !r.job}<input type="checkbox" bind:checked={r.on} aria-label="Convert {m.name}" />{/if}
              <span>{ICON[m.kind]} <b>{m.name}</b>{#if r.facts?.seconds}{' '}· {lengthText(r.facts.seconds)}{/if} · {formatBytes(m.size)}</span>
            </label>
            {#if r.job}
              <div><JobProgress job={r.job} compact /></div>
            {:else if !r.facts || v === 'checking' || v === undefined}
              <div class="muted">Reading the file…</div>
            {:else if typeof v === 'object'}
              {#if v.is === 'plays' && !v.repack}
                <div class="muted">It plays in this browser as it is: nothing to convert.</div>
              {:else if v.is === 'unknown'}
                <div class="muted">The app can’t read this file, so it can’t convert it.</div>
              {:else}
                <div>{rowText(v, typeName(m))}</div>
                {#if p}
                  <div class="muted">About {formatBytes(p.plan.estimate)} · {p.plan.format}</div>
                  {#each p.plan.notes as n (n)}<div class="muted">{n}</div>{/each}
                {/if}
              {/if}
            {/if}
          </li>
        {/if}
      {/each}
    </ul>
    <p class="muted">Every place that uses a file gets the converted one, on stream too. Ctrl+Z puts the old one back (one step a file).</p>

    <div class="modal-foot" bind:this={foot}>
      {#if working}
        <button class="ghost" onclick={onclose} title="Close this window: it carries on (the header shows how far it got)">Keep working</button>
        <button data-stop onclick={() => rowJobs.forEach((j) => stopJob(j))} title="Stop: nothing more is changed">Stop all</button>
      {:else if rowJobs.length}
        <button class="primary" onclick={onclose}>Close</button>
      {:else}
        <button class="ghost" onclick={later} title="Leave {one ? 'it' : 'them'} as {one ? 'it is' : 'they are'} (the note at the top goes)">Not now</button>
        <button class="primary" onclick={go} disabled={reading || !picked.length}
          >{quick ? 'Repackage' : 'Convert'}{picked.length > 1 ? ` ${picked.length} files` : ''}</button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  .rows {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 55vh;
    overflow-y: auto;
  }
  .rows li {
    overflow-wrap: anywhere;
  }
  .rows label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rows li > div {
    margin-left: 24px;
    font-size: 13px;
  }
</style>
