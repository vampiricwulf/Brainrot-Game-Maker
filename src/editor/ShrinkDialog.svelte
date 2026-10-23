<!--
  🗜 Make a smaller copy for phones (card-files spec §4.8): a copy of a 🤫 card's file that phones get instead, while the
  show keeps the file as it is. A GIF becomes a small looping video; a video gets a smaller picture (720p, 480p or
  360p), a sound is made again, and either can hold only the part the cards play. A file phones can't play (a .mov, a
  FLAC) gets a copy they can. It says what it will make and about how big, makes it (Stop leaves nothing), then says
  how big it came out (Ctrl+Z takes it back). Several files at once (🖼 Media's "big for phones") get a row each, one
  copy and one step a file. Closed while it works, the work goes on (the header's pill shows how far it got). The
  editor isn't on stream, so files are named here.
  In play (the host panel's 🗜 Make smaller, the pre-game checklist, the two-window host column: §4.9) it's for the game
  being played, a row a file with its own default copy, and it warns that the stream may stutter. In one window
  (`secret`: the host's window is on stream) a row is only its kind and size: no name, no preview.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { formatBytes, getBlob, mediaUrls } from '../lib/media.svelte';
  import type { Id, MediaRef } from '../lib/model';
  import { phoneCopyOf } from '../lib/phonecard';
  import { cardUses } from '../lib/phonecopies';
  import { fileLimitsNow } from '../lib/serverlimits.svelte';
  import { copyOfWhat, isGifRef, phonesTake, queuePhoneCopy, readForCopy, shrinkable } from '../lib/shrink/apply';
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
  import { undoClosing } from './undoclose';

  let {
    ids,
    onclose,
    secret = false,
  }: {
    ids: Id[];
    onclose: () => void;
    /** In play, in one window: the host's window is on stream, so no file is named or shown. */
    secret?: boolean;
  } = $props();

  /** Opened in play (the pre-game screen too): for the game being played, a row a file. */
  const play = untrack(() => app.screen === 'play' && !!app.playGame);
  const game = $derived(play ? (app.playGame ?? app.game) : app.game);
  // (The window is made again for other files: Editor's and Play's #key.)
  const many = untrack(() => ids.length > 1);
  /** A row a file (several, or in play: each its own default copy). */
  const listed = untrack(() => many || play);
  /** In play, the editor's copy of this game keeps the copies too (a step each there). */
  const kept = untrack(() => play && !app.playerOnly && app.game.id === app.playGame?.id);
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
  let jobId = $state<string | null>(untrack(() => (listed ? null : (jobFor(id)?.id ?? null))));
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
  let rows = $state<Row[]>(untrack(() => (listed ? ids.map((id) => ({ id, plan: null, on: false, job: jobFor(id)?.id ?? null })) : [])));
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
    if (listed) {
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
  $effect(() => watchJobs(listed ? rowJobs : jobId ? [jobId] : []));
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

  // The buttons at the foot change as it goes (Make it, then Stop, then Close): when the one focused goes, the focus
  // moves to the new ones (Stop, or Close) instead of falling to the page, where a keyboard or screen-reader user would
  // lose their place.
  let foot = $state<HTMLElement>();
  const footFor = $derived(listed ? (working ? 'working' : rowJobs.length ? 'ended' : 'pick') : job ? 'working' : ended ? 'ended' : 'pick');
  let footWas = untrack(() => footFor);
  $effect(() => {
    const now = footFor;
    if (now === footWas) return;
    footWas = now;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost) (foot?.querySelector<HTMLElement>('[data-stop]') ?? foot?.querySelector<HTMLElement>('button.primary'))?.focus();
  });

  function makeAll(): void {
    for (const r of picked) {
      const m = game.media.find((x) => x.id === r.id);
      if (!m || !r.plan || 'refuse' in r.plan) continue;
      // (In play, on the graphics chip where it can be: the stream stutters less.)
      r.job = queuePhoneCopy(r.id, isGifRef(m) ? undefined : (r.plan as CopyPlan), { hardware: play });
      r.on = false;
    }
  }

  /** What it made is in (a copy; in a list, one or more), with nothing still working. */
  const madeIn = $derived(listed ? !working && rowJobs.some((j) => 'done' in (jobs.ended[j] ?? {})) : !job && !!ended && 'done' in ended);
  /** In the editor, once it's made, Ctrl+Z does what the window says: it closes, and the copy goes (in a list, the last). */
  function onkey(e: KeyboardEvent): void {
    if (!play && madeIn) undoClosing(e, onclose);
  }

  const phaseText = (p: string): string => (p === 'waiting' ? 'Waiting for the other file to finish…' : p === 'checking' ? 'Checking it plays…' : p === 'storing' ? 'Storing it in the game…' : 'Making it…');
  const madeRef = $derived(ended && 'done' in ended && ended.media ? game.media.find((m) => m.id === ended.media) : undefined);
  const ICON = { image: '🖼', video: '🎬', audio: '🔊', font: '🔤' } as const;
  /** Where it shows how far it got once this window is closed: the editor's header, or in play the 🗜 button. */
  const goesOn = play ? 'its 🗜 button shows how far it got' : 'the header shows how far it got';

  /**
   * A row's copy in a few words: "about 9.8 MB (854×480, 0:12–0:45 only)". In one window in play, its size only ("about
   * 9.8 MB, only the part the cards play"): nothing of what the file is.
   */
  function rowPlan(p: CopyPlan | GifPlan): string {
    if (!('run' in p)) return `about ${formatBytes(p.estimate)} (a looping video${secret ? '' : `, ${p.width}×${p.height}`})`;
    const size = p.estimate ? `about ${formatBytes(p.estimate)}` : 'a copy';
    if (secret) return `${size}${p.range ? ', only the part the cards play' : ''}`;
    const part = p.range ? `${clockTenths(p.range.from)}–${p.range.to === null ? 'the end' : clockTenths(p.range.to)} only` : '';
    const bits = [p.out.width ? `${p.out.width}×${p.out.height}` : typeWord(p.mime), ...(part ? [part] : [])];
    return `${size} (${bits.join(', ')})`;
  }
  /** A row's file: its name and size, or in one window in play, what it is and its size only ("a video · 148.2 MB"). */
  const rowName = (m: MediaRef): string => (secret ? `a ${copyOfWhat(m)}` : m.name);
  /** How a row's job is doing (`pct`: how far it got, kept apart so a screen reader doesn't read it out every percent). */
  function rowState(r: Row): { text: string; pct?: string; cls: string } | null {
    if (!r.job) return null;
    const j = jobs.list.find((x) => x.id === r.job);
    if (j) return { text: j.phase === 'waiting' ? 'Waiting…' : phaseText(j.phase), pct: progressText(j), cls: 'muted' };
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

<svelte:window onkeydowncapture={onkey} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="shrink-title" use:modal={{ esc: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="shrink-title">🗜 {many ? `Make smaller copies for phones` : 'Make a smaller copy for phones'}</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title={job || working ? `Close: it carries on (${goesOn})` : 'Close (Esc)'}>✕</button>
    </div>
    {#if listed}
      {#if !play}
        <p class="muted">Phones get the copies; the show keeps the files as they are. Ctrl+Z takes them back, one at a time.</p>
      {:else}
        <p class="muted">
          {many ? 'Phones get the copies; the show keeps the files as they are.' : 'Phones get the copy; the show keeps the file as it is.'}
          {#if app.playerOnly}{many ? 'These copies are for this game only: the file can’t keep them.' : 'This copy is for this game only: the file can’t keep it.'}
          {:else if kept && app.pregame}Ctrl+Z takes {many ? 'them back, one at a time' : 'it back'}.{/if}
        </p>
        <p class="warn" data-shrink-stutter>This works your computer hard for a minute or two; your stream may stutter. Best done in the editor before the show.</p>
      {/if}
      {#if cant}<p class="warn">{cant}</p>{/if}
      <ul class="rows">
        {#each rows as r (r.id)}
          {@const m = game.media.find((x) => x.id === r.id)}
          {@const st = rowState(r)}
          {#if m}
            <li data-shrink-row={r.id}>
              <label>
                {#if r.plan && !('refuse' in r.plan) && !r.job}
                  <input type="checkbox" bind:checked={r.on} aria-label={secret ? `Make a copy of ${rowName(m)} (${formatBytes(m.size)})` : `Make a copy of ${m.name}`} />
                {/if}
                <span>{ICON[m.kind]} {#if secret}{rowName(m)}{:else}<b>{m.name}</b>{/if} · {formatBytes(m.size)}</span>
              </label>
              {#if st}<div class={st.cls} role="status">{st.text}{#if st.pct}{' '}<span aria-hidden="true">{st.pct}</span>{/if}</div>
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

    <div class="modal-foot" bind:this={foot}>
      {#if listed}
        {#if working}
          <button class="ghost" onclick={onclose} title="Close this window: {many ? 'they carry on' : 'it carries on'} ({goesOn})">Keep working</button>
          <button data-stop onclick={() => rowJobs.forEach((j) => stopJob(j))} title="Stop them: nothing more is changed">Stop all</button>
        {:else if rowJobs.length}
          <button class="primary" onclick={onclose}>Close</button>
        {:else}
          <button class="ghost" onclick={onclose}>Cancel</button>
          <button class="primary" onclick={makeAll} disabled={reading || !picked.length || !!cant}>Make {picked.length === 1 ? 'a copy' : `${picked.length} copies`}</button>
        {/if}
      {:else if job}
        <button class="ghost" onclick={onclose} title="Close this window: it carries on (the header shows how far it got)">Keep working</button>
        <button data-stop onclick={() => stopJob(job.id)} title="Stop it: nothing is changed">Stop</button>
      {:else if ended && 'done' in ended}
        {#if madeRef}<button class="ghost" onclick={() => (watching = !watching)}>{watching ? '⏹ Stop watching' : '▶ Watch it'}</button>{/if}
        <button class="primary" onclick={onclose}>Close</button>
      {:else}
        <button class="ghost" onclick={onclose}>Cancel</button>
        <button
          class="primary"
          onclick={make}
          disabled={!!cant || (ref && isGifRef(ref) ? !gifPlan || 'refuse' in gifPlan : !avp || 'refuse' in avp || (!!opts && 'refuse' in opts))}
          >{copy ? 'Make it again' : ended && 'failed' in ended ? 'Try again' : 'Make it'}</button
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
