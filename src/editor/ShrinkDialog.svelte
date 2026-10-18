<!--
  🗜 Make a smaller copy for phones (card-files spec §4.8): a copy of a 🤫 card's file that phones get instead, while the
  show keeps the file as it is. A GIF becomes a small looping video; a video gets a smaller picture (720p, 480p or
  360p), a sound is made again, and either can hold only the part the cards play. A file phones can't play (a .mov, a
  FLAC) gets a copy they can. It says what it will make and about how big, makes it (Stop leaves nothing), then says
  how big it came out (Ctrl+Z takes it back). Several files at once (🖼 Media's "big for phones") get a row each, one
  copy and one step a file. Closed while it works, the work goes on (the header's pill shows how far it got). The
  editor isn't on stream, so files are named here.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { formatBytes, getBlob, mediaUrls } from '../lib/media.svelte';
  import type { Id } from '../lib/model';
  import { phoneCopyOf } from '../lib/phonecard';
  import { cardUses } from '../lib/phonecopies';
  import { fileLimitsNow } from '../lib/serverlimits.svelte';
  import { isGifRef, phonesTake, queuePhoneCopy, readForCopy, shrinkable } from '../lib/shrink/apply';
  import { gifInfo } from '../lib/shrink/gif';
  import { jobFor, jobs, progressText, stopJob, watchJobs } from '../lib/shrink/jobs.svelte';
  import {
    avDefault,
    avOptions,
    avPlan,
    clockTenths,
    formatLine,
    gifSize,
    lengthText,
    planGif,
    spanText,
    STILL_TOO_BIG,
    typeWord,
    type AvRead,
    type CopyPlan,
    type GifInfo,
    type GifPlan,
  } from '../lib/shrink/plan';
  import { encodersFor, probe } from '../lib/shrink/probe';

  let { ids, onclose }: { ids: Id[]; onclose: () => void } = $props();

  const game = $derived(app.game);
  // (The window is made again for other files: Editor's #key.)
  const many = untrack(() => ids.length > 1);
  const id = untrack(() => ids[0]);
  const ref = $derived(game.media.find((m) => m.id === id));
  const copy = $derived(ref ? phoneCopyOf(game, ref) : undefined);
  const fileBytes = $derived(fileLimitsNow().limits.fileBytes);

  // ---------- One file ----------
  let info = $state<GifInfo | null>(null);
  let gifPlan = $state<GifPlan | { refuse: string } | null>(null);
  /** A video or a sound: what's in it, and the choices made in the window. */
  let av = $state<AvRead | null>(null);
  let trim = $state(false);
  let sel = $state(0);
  const opts = $derived(av ? avOptions(av, trim, fileBytes) : null);
  const choice = $derived(opts && !('refuse' in opts) ? (opts.choices[Math.min(sel, opts.choices.length - 1)] ?? null) : null);
  const avp = $derived(av ? avPlan(av, trim, choice) : null);
  /** Why nothing can be made (this browser, or the file). */
  let cant = $state('');
  // (A job already working on it: shown as it goes.)
  let jobId = $state<string | null>(untrack(() => (many ? null : (jobFor(id)?.id ?? null))));
  const job = $derived(jobId ? jobs.list.find((j) => j.id === jobId) : undefined);
  const ended = $derived(jobId ? jobs.ended[jobId] : undefined);
  /** The copy made, playing under the result. */
  let watching = $state(false);

  // ---------- Several files: a row each ----------
  interface Row {
    id: Id;
    /** The copy it gets (null: still being read). */
    plan: CopyPlan | GifPlan | { refuse: string } | null;
    on: boolean;
    job: string | null;
  }
  let rows = $state<Row[]>(untrack(() => (many ? ids.map((id) => ({ id, plan: null, on: false, job: jobFor(id)?.id ?? null })) : [])));
  const reading = $derived(rows.some((r) => !r.plan));
  const picked = $derived(rows.filter((r) => r.on && !r.job && r.plan && !('refuse' in r.plan)));
  const rowJobs = $derived(rows.flatMap((r) => (r.job ? [r.job] : [])));
  const working = $derived(rowJobs.some((j) => jobs.list.some((x) => x.id === j)));

  /** A GIF's copy, as it would be made. */
  async function readGif(blob: Blob): Promise<{ info: GifInfo; plan: GifPlan | { refuse: string } }> {
    const info = gifInfo(new Uint8Array(await blob.arrayBuffer()));
    const size = gifSize(info.width, info.height);
    return { info, plan: planGif(info, await encodersFor(size.width, size.height)) };
  }

  onMount(async () => {
    const can = await probe();
    if (!can.ok) return void (cant = can.why ?? '');
    if (many) {
      for (const row of rows) {
        const m = game.media.find((x) => x.id === row.id);
        const blob = getBlob(row.id);
        try {
          if (!m || !shrinkable(m) || !blob) row.plan = { refuse: 'That file isn’t stored in this browser' };
          else if (isGifRef(m)) row.plan = (await readGif(blob)).plan;
          else row.plan = avDefault(await readForCopy(m, blob, cardUses(game, row.id)), fileBytes);
        } catch {
          row.plan = { refuse: 'The app can’t read this file' };
        }
        row.on = !row.job && !('refuse' in row.plan);
      }
      return;
    }
    const blob = getBlob(id);
    if (!ref || !shrinkable(ref) || !blob) return void (cant = 'That file isn’t stored in this browser.');
    if (isGifRef(ref)) {
      try {
        ({ info, plan: gifPlan } = await readGif(blob));
      } catch {
        cant = 'The app can’t read this GIF.';
      }
      return;
    }
    const read = await readForCopy(ref, blob, cardUses(game, id));
    trim = read.span?.ticked ?? false;
    const o = avOptions(read, trim, fileBytes);
    sel = 'refuse' in o ? 0 : o.pick;
    av = read;
  });
  // Their ends are said here while it's open, else in toasts.
  $effect(() => watchJobs(many ? rowJobs : jobId ? [jobId] : []));
  onDestroy(() => watchJobs([]));

  function toggleTrim(): void {
    if (!av) return;
    trim = !trim;
    const o = avOptions(av, trim, fileBytes);
    sel = 'refuse' in o ? 0 : o.pick;
  }

  function make(): void {
    watching = false;
    if (ref && isGifRef(ref)) jobId = queuePhoneCopy(id);
    else if (avp && !('refuse' in avp)) jobId = queuePhoneCopy(id, avp);
  }

  function makeAll(): void {
    for (const r of picked) {
      const m = game.media.find((x) => x.id === r.id);
      if (!m || !r.plan || 'refuse' in r.plan) continue;
      r.job = isGifRef(m) ? queuePhoneCopy(r.id) : queuePhoneCopy(r.id, r.plan as CopyPlan);
      r.on = false;
    }
  }

  const phaseText = (p: string): string => (p === 'waiting' ? 'Waiting for the other file to finish…' : p === 'checking' ? 'Checking it plays…' : p === 'storing' ? 'Storing it in the game…' : 'Making it…');
  const madeRef = $derived(ended && 'done' in ended && ended.media ? game.media.find((m) => m.id === ended.media) : undefined);
  const ICON = { image: '🖼', video: '🎬', audio: '🔊', font: '🔤' } as const;

  /** A row's copy in a few words: "about 9.8 MB (854×480, 0:12–0:45 only)". */
  function rowPlan(p: CopyPlan | GifPlan): string {
    if (!('run' in p)) return `about ${formatBytes(p.estimate)} (a looping video, ${p.width}×${p.height})`;
    const part = p.range ? `${clockTenths(p.range.from)}–${p.range.to === null ? 'the end' : clockTenths(p.range.to)} only` : '';
    const bits = [p.out.width ? `${p.out.width}×${p.out.height}` : typeWord(p.mime), ...(part ? [part] : [])];
    return `${p.estimate ? `about ${formatBytes(p.estimate)}` : 'a copy'} (${bits.join(', ')})`;
  }
  /** How a row's job is doing. */
  function rowState(r: Row): { text: string; cls: string } | null {
    if (!r.job) return null;
    const j = jobs.list.find((x) => x.id === r.job);
    if (j) return { text: j.phase === 'waiting' ? 'Waiting…' : `${phaseText(j.phase)} ${progressText(j)}`, cls: 'muted' };
    const e = jobs.ended[r.job];
    if (!e) return null;
    if ('done' in e) {
      const made = e.media ? game.media.find((m) => m.id === e.media) : undefined;
      return { text: `✓ ${made ? formatBytes(made.size) : 'Done'}`, cls: 'good' };
    }
    if ('failed' in e) return { text: `⚠ ${e.failed}`, cls: 'warn' };
    return { text: 'Stopped: nothing was changed.', cls: 'muted' };
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="shrink-title" use:modal={{ esc: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="shrink-title">🗜 {many ? `Make smaller copies for phones` : 'Make a smaller copy for phones'}</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title={job || working ? 'Close: it carries on (the header shows how far it got)' : 'Close (Esc)'}>✕</button>
    </div>
    {#if many}
      <p class="muted">Phones get the copies; the show keeps the files as they are. Ctrl+Z takes them back, one at a time.</p>
      {#if cant}<p class="warn">{cant}</p>{/if}
      <ul class="rows">
        {#each rows as r (r.id)}
          {@const m = game.media.find((x) => x.id === r.id)}
          {@const st = rowState(r)}
          {#if m}
            <li data-shrink-row={r.id}>
              <label>
                {#if r.plan && !('refuse' in r.plan) && !r.job}
                  <input type="checkbox" bind:checked={r.on} aria-label="Make a copy of {m.name}" />
                {/if}
                <span>{ICON[m.kind]} <b>{m.name}</b> · {formatBytes(m.size)}</span>
              </label>
              {#if st}<div class={st.cls} role="status">{st.text}</div>
              {:else if !r.plan}{#if !cant}<div class="muted">Reading the file…</div>{/if}
              {:else if 'refuse' in r.plan}<div class="warn">{r.plan.refuse}.</div>
              {:else}<div class="muted">→ {rowPlan(r.plan)}</div>{/if}
            </li>
          {/if}
        {/each}
      </ul>
    {:else if !ref}
      <p>That file is no longer in the game.</p>
    {:else}
      <p class="what">
        <b>{ref.name}</b> · {formatBytes(ref.size)}{#if info}{' '}· {lengthText(info.seconds)} · {info.width}×{info.height}{/if}{#if av?.facts.seconds}{' '}· {lengthText(av.facts.seconds)}{/if}{#if av?.facts.video}{' '}· {av.facts.video.width}×{av.facts.video.height}{/if}
      </p>
      <p class="muted">Phones get the copy; the show keeps this file as it is.</p>
      {#if av && !av.playable}<p class="muted">Phones can’t play this kind of file as it is: the copy is one they can.</p>{/if}
      {#if copy}
        <p class="muted">📱 Phones get {ref && !phonesTake(ref) ? 'a copy they can play' : 'its smaller copy'} now ({formatBytes(copy.size)}): making it again puts a new one in its place.</p>
      {/if}

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
          {#if madeRef.kind === 'audio'}
            <audio class="watch" src={mediaUrls[madeRef.id]} autoplay controls aria-label="The copy for phones"></audio>
          {:else if isGifRef(ref)}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="watch" src={mediaUrls[madeRef.id]} autoplay loop muted playsinline aria-label="The copy for phones"></video>
          {:else}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="watch" src={mediaUrls[madeRef.id]} autoplay controls playsinline aria-label="The copy for phones"></video>
          {/if}
        {/if}
      {:else if ended && 'failed' in ended}
        <p role="status" class="warn" data-shrink-failed>{ended.failed}</p>
      {:else if ended}
        <p role="status" data-shrink-stopped>Stopped: nothing was changed.</p>
      {/if}

      {#if !job && !(ended && 'done' in ended)}
        {#if cant}
          <p class="warn">{cant}</p>
        {:else if gifPlan && 'refuse' in gifPlan}
          <p class="warn">{gifPlan.refuse}.</p>
        {:else if gifPlan}
          <p>A small looping video, {gifPlan.width}×{gifPlan.height}: about {formatBytes(gifPlan.estimate)}. Phones show it like the GIF.</p>
          <p class="muted">{formatLine(gifPlan)}</p>
        {:else if av && opts && avp}
          {#if 'refuse' in opts}
            <p class="warn">{opts.refuse}.</p>
          {:else if opts.choices.length}
            <fieldset class="choices">
              <legend>How big a picture phones get</legend>
              {#each opts.choices as c, i (c.name)}
                <label><input type="radio" name="shrink-size" checked={i === sel} onchange={() => (sel = i)} /> {c.name} · {c.width}×{c.height} · about {formatBytes(c.estimate)}</label>
              {/each}
            </fieldset>
          {:else if !('refuse' in avp)}
            <p>A sound for phones{avp.estimate ? `: about ${formatBytes(avp.estimate)}` : ''}.</p>
          {/if}
          {#if av.span}
            <label class="trim">
              <input type="checkbox" checked={trim} onchange={toggleTrim} />
              Only the part the cards play: {spanText(av.span.span, av.facts.seconds)}
            </label>
            <p class="muted small">(Only phones get the copy, so the show still has all of it.)</p>
          {/if}
          {#if !('refuse' in opts)}
            {#if 'refuse' in avp}
              <p class="warn">{avp.refuse}.</p>
            {:else}
              <p class="muted">{avp.format}</p>
              {#if avp.estimate > fileBytes}<p class="warn">{STILL_TOO_BIG}</p>{/if}
            {/if}
          {/if}
        {:else}
          <p class="muted" role="status">Reading the file…</p>
        {/if}
      {/if}
    {/if}

    <div class="modal-foot">
      {#if many}
        {#if working}
          <button class="ghost" onclick={onclose} title="Close this window: they carry on (the header shows how far they got)">Keep working</button>
          <button onclick={() => rowJobs.forEach((j) => stopJob(j))} title="Stop them: nothing more is changed">Stop all</button>
        {:else if rowJobs.length}
          <button class="primary" onclick={onclose}>Close</button>
        {:else}
          <button class="ghost" onclick={onclose}>Cancel</button>
          <button class="primary" onclick={makeAll} disabled={reading || !picked.length || !!cant}>Make {picked.length === 1 ? 'a copy' : `${picked.length} copies`}</button>
        {/if}
      {:else if job}
        <button class="ghost" onclick={onclose} title="Close this window: it carries on (the header shows how far it got)">Keep working</button>
        <button onclick={() => stopJob(job.id)} title="Stop it: nothing is changed">Stop</button>
      {:else if ended && 'done' in ended}
        {#if madeRef}<button class="ghost" onclick={() => (watching = !watching)}>{watching ? '⏹ Stop watching' : '▶ Watch it'}</button>{/if}
        <button class="primary" onclick={onclose}>Close</button>
      {:else}
        <button class="ghost" onclick={onclose}>Cancel</button>
        <button
          class="primary"
          onclick={make}
          disabled={!!cant || (ref && isGifRef(ref) ? !gifPlan || 'refuse' in gifPlan : !avp || 'refuse' in avp || (!!opts && 'refuse' in opts))}
          >{ended || copy ? 'Make it again' : 'Make it'}</button
        >
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
  audio.watch {
    background: none;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0 0 8px;
    padding: 6px 10px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .choices legend {
    padding: 0 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .trim {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .small {
    font-size: 12px;
    margin-top: 2px;
  }
  .rows {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 50vh;
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
  .good {
    color: var(--good);
  }
  .warn {
    color: var(--warn);
  }
</style>
