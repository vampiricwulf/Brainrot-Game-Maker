<!--
  The note at the top of the editor about videos and sounds just added that won't play in this browser, or play
  without their sound (card-files spec §4.12.4): why, and 🔄 Convert. A quick fix (nothing re-encoded) runs at once and
  shows how far it got here; one that makes the file again opens its window first, saying what it costs. Several files
  get one line. Never a window that pops up while the host works; the editor isn't on stream, so files are named here.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { flash } from '../lib/nav.svelte';
  import { queueConvert } from '../lib/shrink/apply';
  import { checks, dismissOffer, verdictOf } from '../lib/shrink/checks.svelte';
  import { openMediaDialog } from '../lib/shrink/dialog.svelte';
  import { jobFor, progressText, stopJob } from '../lib/shrink/jobs.svelte';
  import { isLossless, type Verdict } from '../lib/shrink/playable';
  import { advice, severalText, whyText } from '../lib/shrink/words';
  import type { MediaRef } from '../lib/model';

  let { onshow }: { onshow: () => void } = $props();

  const game = $derived(app.game);
  /** The files just added that won't play here, still in the game with the bytes they were checked with. */
  const list = $derived(
    checks.offers.flatMap((id) => {
      const m = game.media.find((x) => x.id === id && !x.phoneCopy);
      const v = verdictOf(id);
      return m && typeof v === 'object' && (v.is === 'fails' || v.is === 'silent') ? [{ m, v }] : [];
    }),
  );
  const fixOf = (v: Verdict) => (v.is === 'fails' || v.is === 'silent' ? v.fix : null);

  function show(refs: MediaRef[]): void {
    onshow();
    for (const m of refs) flash(`media:${m.id}`);
  }

  // The note's buttons change as it goes (🔄, then Stop), and it goes once done: when the focus was in it and is lost,
  // it moves to the button in its place (Stop), or to the editor's tab.
  let note = $state<HTMLElement>();
  let had = false;
  const shown = $derived(`${list.length}:${list.map((x) => jobFor(x.m.id)?.id ?? '').join()}`);
  $effect(() => {
    void shown;
    void tick().then(() => {
      const a = document.activeElement;
      if (!had || (a && a !== document.body)) return;
      const to = note?.querySelector<HTMLElement>('[data-stop]') ?? note?.querySelector<HTMLElement>('button') ?? document.querySelector<HTMLElement>('.editor nav [aria-current="page"]');
      had = !!note && !!to && note.contains(to);
      to?.focus();
    });
  });
  const focusIn = () => (had = true);
  const focusOut = (e: FocusEvent) => {
    // (Gone to something else: not when it was taken away with its button.)
    if (e.relatedTarget instanceof Node && !note?.contains(e.relatedTarget)) had = false;
  };
</script>

{#if list.length === 1}
  {@const { m, v } = list[0]}
  {@const fix = fixOf(v)}
  {@const job = jobFor(m.id)}
  <div class="data-notice" role="status" data-convert-notice bind:this={note} onfocusin={focusIn} onfocusout={focusOut}>
    <span>⚠ “{m.name}” {v.is === 'silent' ? 'plays without its sound' : 'won’t play'} in this browser: {whyText(v)}.{advice(v)}</span>
    {#if job}
      <span class="muted">🔄 {job.copying ? 'Repackaging' : 'Converting'}… <span aria-hidden="true">{progressText(job)}</span></span>
      <button class="small ghost" onclick={() => stopJob(job.id)} title="Stop it: nothing is changed" data-stop>Stop</button>
    {:else if fix}
      {#if isLossless(fix)}
        <button class="small primary" onclick={() => queueConvert(game, m.id)} title="Put a copy that plays here in its place, everywhere it's used (Ctrl+Z puts the old one back)"
          >{fix.audio === 'drop' ? '🔄 Convert it without its sound (quick)' : '🔄 Convert it (quick, nothing lost)'}</button
        >
      {:else}
        <button class="small primary" onclick={() => openMediaDialog({ mode: 'convert', ids: [m.id] })} title="See what converting it takes first">🔄 Convert it…</button>
      {/if}
      <button class="small ghost" onclick={() => dismissOffer(m.id)}>Keep it as it is</button>
    {:else}
      <button class="small ghost" onclick={() => dismissOffer(m.id)}>OK</button>
    {/if}
  </div>
{:else if list.length > 1}
  <div class="data-notice" role="status" data-convert-notice bind:this={note} onfocusin={focusIn} onfocusout={focusOut}>
    <span>⚠ {severalText(list.map((x) => (x.v.is === 'silent' ? 'silent' : 'fails')))}.</span>
    {#if list.some((x) => fixOf(x.v))}
      <button class="small primary" onclick={() => openMediaDialog({ mode: 'convert', ids: list.map((x) => x.m.id) })}>🔄 Convert them…</button>
    {/if}
    <button class="small" onclick={() => show(list.map((x) => x.m))}>Show them in 🖼 Media</button>
    <button class="small ghost" onclick={() => list.forEach((x) => dismissOffer(x.m.id))} aria-label="Dismiss">✕</button>
  </div>
{/if}
