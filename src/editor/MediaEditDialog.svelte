<!--
  ✎ Edit video / ✎ Edit sound (card-files spec §4.11.3): trim a video or sound to the part wanted, and crop or shrink a
  video, with a preview, the size it will come out at and what it's saved as. Apply puts the edited file in its place
  everywhere it's used, on stream too (slide items' Start at / Stop at move with the trim, so they play the same
  moments); Save as a new file keeps both, and Only this item edits it for the slide item it was opened from. The
  work is a job (the header's pill shows how far it got, Stop leaves nothing), then one Ctrl+Z step. The window's own
  changes undo with Ctrl+Z while it's open. The editor isn't on stream, so the file is named here.
-->
<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { fileType, mbText, SLOW_FILE_BYTES } from '../lib/buzzproto';
  import { playRange, SnapshotHistory, type Box } from '../lib/editing';
  import { fitCrop } from '../lib/imageedit';
  import { formatBytes, getBlob, mediaUrls } from '../lib/media.svelte';
  import { modal } from '../lib/modal';
  import type { AudioEl, Id, VideoEl } from '../lib/model';
  import { phoneCopyOf } from '../lib/phonecard';
  import { fileLimitsNow } from '../lib/serverlimits.svelte';
  import { queueFileEdit } from '../lib/shrink/apply';
  import { verdictOf } from '../lib/shrink/checks.svelte';
  import { keyBefore, readFacts, type MediaFacts } from '../lib/shrink/facts';
  import { jobs, stopJob, watchJob } from '../lib/shrink/jobs.svelte';
  import {
    CANT_READ_EDIT,
    cantReencode,
    clockTenths,
    cropPixels,
    isNoEdit,
    lengthText,
    needsKey,
    noEdit,
    NO_REENCODE_HERE,
    outputSize,
    parseClock,
    planEdit,
    quickTrimAt,
    SIZES,
    type FileEdit,
    type How,
    type Short,
  } from '../lib/shrink/plan';
  import { encodersFor, probe, type Can, type Encoders } from '../lib/shrink/probe';
  import { cutLeavesOut, itemsPlaying, timedItems } from '../lib/shrink/retime';
  import { codecName } from '../lib/shrink/words';
  import { isTextField } from '../lib/undokeys';
  import { allCardSlides, mediaUsage, slideMediaIds } from '../lib/usage';
  import InlineAsk from '../play/host/InlineAsk.svelte';
  import CropBox from './CropBox.svelte';
  import JobProgress from './JobProgress.svelte';
  import TrimBar from './TrimBar.svelte';

  let { id, item, onclose }: { id: Id; item?: VideoEl | AudioEl; onclose: () => void } = $props();

  const game = $derived(app.game);
  const ref = $derived(game.media.find((m) => m.id === id));
  // The file as it was when the window opened (once the edit is in, it's under another id). (Editor's #key makes the
  // window again for another file.)
  const was = untrack(() => {
    const m = app.game.media.find((x) => x.id === id);
    return { name: m?.name ?? '', size: m?.size ?? 0, kind: m?.kind === 'audio' ? ('audio' as const) : ('video' as const) };
  });
  const kind = was.kind;
  const what = kind === 'audio' ? 'sound' : 'video';
  const blob = untrack(() => getBlob(id));
  /** Its sound won't play here (🖼 Media says so): it's left out of anything made. */
  const silent = untrack(() => {
    const v = verdictOf(id);
    return typeof v === 'object' && v.is === 'silent' ? v : null;
  });
  const NONE: Encoders = { avc: false, vp9: false, vp8: false };
  /** The keys went nowhere: to the page, or with a part of this window made inert. */
  const focusLost = (): boolean => {
    const a = document.activeElement;
    return !a || a === document.body || !!a.closest('[inert]');
  };

  let facts = $state<MediaFacts | null>(null);
  let can = $state<Can | null>(null);
  let cant = $state('');
  let edit = $state<FileEdit>({ start: 0, end: 0, quick: false, crop: null, short: null, sound: false });
  /** The edit as the window opened (Esc and ✕ ask before throwing away anything else). */
  let opened = '';
  /** The encoders there are here at each size the picture could come out at ("1280×720"), as they're asked. */
  let encs = $state<Record<string, Encoders>>({});
  /** The key frame at or before a trim's start (`at`), for a WebM: where it can be cut as it is. */
  let key = $state<{ at: number; key: number | null } | null>(null);

  const length = $derived(facts?.seconds ?? 0);
  const picture = $derived(kind === 'video' && !!facts?.video);
  const W = $derived(facts?.video?.width ?? 16);
  const H = $derived(facts?.video?.height ?? 9);

  onMount(async () => {
    if (!blob) return void (cant = 'That file isn’t stored in this browser.');
    const f = await readFacts(blob, { duration: 'compute', fps: kind === 'video' });
    if (!f.box || (!f.video && !f.audio)) return void (cant = CANT_READ_EDIT);
    const c = await probe();
    if (f.video && c.ok) encs[`${f.video.width}×${f.video.height}`] = await encodersFor(f.video.width, f.video.height);
    can = c;
    edit = noEdit(f, !!silent);
    opened = JSON.stringify(edit);
    hist = new SnapshotHistory(opened, 60);
    facts = f;
  });

  // ---------- The window's own undo: one step a change (a drag or a burst of keys is one) ----------
  let hist = null as SnapshotHistory | null;
  let histTick = $state(0);
  let burst: ReturnType<typeof setTimeout> | undefined;
  /** Whatever changed so far is a step of its own. */
  function flush(): void {
    clearTimeout(burst);
    if (hist?.commit(JSON.stringify(edit))) histTick++;
  }
  /** A change made at once (a button): a step of its own. */
  function change(fn: () => void): void {
    flush();
    fn();
    flush();
  }
  $effect(() => {
    const now = JSON.stringify(edit);
    untrack(() => {
      clearTimeout(burst);
      burst = setTimeout(() => hist?.commit(now) && histTick++, 600);
    });
  });
  const canUndo = $derived((void histTick, !!hist && (hist.undoStack.length > 0 || JSON.stringify(edit) !== hist.last)));
  const canRedo = $derived((void histTick, !!hist && hist.redoStack.length > 0 && JSON.stringify(edit) === hist.last));
  function undo(): void {
    clearTimeout(burst);
    const prev = hist?.undo(JSON.stringify(edit));
    if (prev) edit = JSON.parse(prev);
    histTick++;
  }
  function redo(): void {
    clearTimeout(burst);
    const next = hist?.redo(JSON.stringify(edit));
    if (next) edit = JSON.parse(next);
    histTick++;
  }
  function reset(): void {
    if (!facts) return;
    const f = facts;
    change(() => (edit = noEdit(f, !!silent)));
    cropping = false;
    cropAspect = 'free';
  }

  // ---------- What it would make ----------
  const outSize = $derived(facts && picture ? outputSize(facts, edit) : null);
  // (The encoders at the size it would come out at, asked once a size.)
  $effect(() => {
    const s = outSize;
    if (!s || !can?.ok) return;
    const k = `${s.w}×${s.h}`;
    if (untrack(() => encs[k])) return;
    void encodersFor(s.w, s.h).then((e) => (encs[k] = e));
  });
  const encNow = $derived(outSize ? (encs[`${outSize.w}×${outSize.h}`] ?? encs[`${W}×${H}`] ?? NONE) : NONE);
  const decodes = $derived(!!facts?.video?.decodes);
  /** The picture can be made again here (a crop, a new size, an exact WebM trim). */
  const reencodes = $derived(!!can?.ok && decodes && (encNow.avc || encNow.vp9 || encNow.vp8));
  // A WebM's trim waits for the key frame before its start, once the start stops moving.
  const wantsKey = $derived(!!facts && !!can && needsKey(facts, edit, kind, can));
  $effect(() => {
    const s = edit.start;
    if (!wantsKey || !blob || untrack(() => key?.at === s)) return;
    const t = setTimeout(async () => {
      const k = await keyBefore(blob, s);
      key = { at: s, key: k };
    }, 200);
    return () => clearTimeout(t);
  });
  const keyNow = $derived(key && key.at === edit.start ? key.key : null);
  const keyPending = $derived(wantsKey && key?.at !== edit.start);
  const quickAt = $derived(facts && can ? quickTrimAt(facts, edit, keyNow, kind, can) : null);
  // (No re-encoding here: a WebM's trim is quick, from its key frame.)
  const planned = $derived<FileEdit>({ ...edit, quick: edit.quick || (quickAt !== null && !reencodes) });
  const plan = $derived(facts && can ? planEdit(facts, planned, can, encNow, keyNow, kind) : null);
  const ok = $derived(plan && !('refuse' in plan) ? plan : null);
  const nothing = $derived(!facts || isNoEdit(edit, facts, !!silent));
  const changed = $derived(!!facts && JSON.stringify(edit) !== opened);

  // ---------- Where it's used ----------
  const uses = $derived(mediaUsage(game).get(id) ?? 0);
  const items = $derived(itemsPlaying(game, id).length);
  const timed = $derived(timedItems(game, id));
  const leftOut = $derived(ok?.cut ? cutLeavesOut(game, id, ok.cut) : []);
  const onCards = $derived(allCardSlides(game).some(({ slide }) => slideMediaIds(slide).includes(id)));
  const copy = $derived(ref ? phoneCopyOf(game, ref) : undefined);
  const fileBytes = $derived(fileLimitsNow().limits.fileBytes);
  /** 📱 Make its smaller copy again (null: as it starts, ticked unless it comes out small, of a type phones take). */
  let remake = $state<boolean | null>(null);
  const remakeOn = $derived(remake ?? !(ok && ok.estimate < SLOW_FILE_BYTES && !!fileType(ok.mime)?.startsWith(`${kind}/`)));
  /** Opened from a slide item whose file has other uses: Only this item, or all of them. */
  const oneOf = $derived(!!item && uses > 1);
  const itemRange = $derived(item && ((item.startAt ?? 0) > 0 || (item.endAt !== undefined && item.endAt > (item.startAt ?? 0))) ? playRange(item.startAt, item.endAt) : null);

  // ---------- The preview ----------
  let media = $state<HTMLVideoElement | HTMLAudioElement>();
  let at = $state(0);
  let playing = $state(false);
  let stopAt: number | null = null;
  let raf = 0;
  /** The new file plays in the preview (▶ Watch it, once done). */
  let watching = $state<Id | null>(null);
  const src = $derived(mediaUrls[watching ?? id]);
  function follow(): void {
    if (!media) return;
    at = media.currentTime;
    if (stopAt !== null && at >= stopAt) {
      media.pause();
      stopAt = null;
    }
    if (!media.paused) raf = requestAnimationFrame(follow);
  }
  function seek(t: number): void {
    at = t;
    if (media) media.currentTime = t;
  }
  function toggle(): void {
    if (!media) return;
    if (media.paused) {
      stopAt = null;
      void media.play().catch(() => {});
    } else media.pause();
  }
  /** ▶ Play the trim: from its start, stopping at its end. */
  function playTrim(): void {
    if (!media) return;
    const r = playRange(edit.start, edit.end < length - 0.05 ? edit.end : undefined);
    seek(r.start);
    stopAt = r.end ?? null;
    void media.play().catch(() => {});
  }
  onDestroy(() => cancelAnimationFrame(raf));

  let stageW = $state(0);
  let stageH = $state(0);
  /** The picture's box in the stage, its own shape (the crop box lies over it exactly). */
  const fit = $derived.by(() => {
    const k = Math.min(stageW / W, stageH / H);
    return k > 0 && Number.isFinite(k) ? { w: Math.round(W * k), h: Math.round(H * k) } : null;
  });

  // ---------- Trim ----------
  const tenth = (t: number) => Math.round(t * 10) / 10;
  /** A handle moved: the preview shows where it is (unless it's playing). */
  function setTrim(start: number, end: number): void {
    const moved = start !== edit.start ? Math.max(0, start) : end !== edit.end ? Math.min(length, end) : null;
    edit.start = Math.max(0, start);
    edit.end = Math.min(length, end);
    if (moved !== null && media?.paused) seek(moved);
  }
  function typed(e: Event, which: 'start' | 'end'): void {
    const box = e.currentTarget as HTMLInputElement;
    const t = parseClock(box.value);
    const fine = t !== null && (which === 'start' ? t >= 0 && t < edit.end - 0.05 : t > edit.start + 0.05 && t <= length + 0.05);
    if (!fine) return void (box.value = clockTenths(which === 'start' ? edit.start : edit.end, true));
    change(() => (which === 'start' ? (edit.start = tenth(t!)) : (edit.end = Math.min(length, tenth(t!)))));
  }
  const startHere = () => change(() => (edit.start = Math.max(0, Math.min(tenth(at), edit.end - 0.1))));
  const endHere = () => change(() => (edit.end = Math.min(length, Math.max(tenth(at), edit.start + 0.1))));

  // ---------- Crop and size ----------
  let cropping = $state(false);
  let cropAspect = $state<'free' | number>('free');
  const ASPECTS: ['free' | number, string][] = [['free', 'Free'], [16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1'], [9 / 16, '9:16']];
  const cropPx = $derived(facts ? cropPixels(facts, edit) : null);
  const cw = $derived(cropPx?.width ?? W);
  const ch = $derived(cropPx?.height ?? H);
  const sizes = $derived(SIZES.filter((s) => s < Math.min(cw, ch)));
  const shortNow = $derived(edit.short !== null && edit.short < Math.min(cw, ch) ? edit.short : null);
  function startCrop(): void {
    if (!edit.crop) {
      change(() => (edit.crop = { x: 0, y: 0, w: 1, h: 1 }));
      cropAspect = 'free';
    }
    cropping = true;
  }
  function setAspect(a: 'free' | number): void {
    cropAspect = a;
    if (a !== 'free') change(() => (edit.crop = fitCrop(a, W, H)));
  }
  let cropButton = $state<HTMLButtonElement>();
  function removeCrop(): void {
    change(() => (edit.crop = null));
    cropAspect = 'free';
    cropping = false;
    // (Its button goes with the crop: the keys go to ✂ Crop.)
    void tick().then(() => focusLost() && cropButton?.focus());
  }
  const setShort = (s: Short | null) => change(() => (edit.short = s));

  // ---------- Applying ----------
  let jobId = $state<string | null>(null);
  let how = $state<How>('all');
  /** What was asked of the edit put in (for the line once it's done). */
  let asked = $state<{ seconds: number | null; w?: number; h?: number } | null>(null);
  const job = $derived(jobId ? jobs.list.find((j) => j.id === jobId) : undefined);
  const ended = $derived(jobId ? jobs.ended[jobId] : undefined);
  const done = $derived(!!ended && 'done' in ended);
  const working = $derived(!!job);
  const madeRef = $derived(ended && 'done' in ended && ended.media ? game.media.find((m) => m.id === ended.media) : undefined);
  // Its end is said here while it's open (no toast), else in a toast.
  $effect(() => watchJob(jobId));
  onDestroy(() => watchJob(null));

  function apply(h: How): void {
    if (!ok || nothing || keyPending || working || done) return;
    how = h;
    watching = null;
    media?.pause();
    asked = { seconds: ok.out.seconds, ...(picture && ok.aspect ? { w: ok.out.width, h: ok.out.height } : {}) };
    jobId = queueFileEdit(game, id, ok, h, item, h === 'all' && !!copy && remakeOn);
  }
  // Asked from the keys: once a WebM's key frame is found (the start was just typed), it applies.
  let applyAsked = $state<How | null>(null);
  $effect(() => {
    if (!applyAsked || keyPending) return;
    const h = applyAsked;
    applyAsked = null;
    untrack(() => apply(h));
  });
  const doneText = $derived.by(() => {
    if (!done || !madeRef) return '';
    if (how === 'new') return `✓ Saved as “${madeRef.name}”: the original is unchanged.`;
    if (how === 'item') return '✓ This item plays its own edited copy now.';
    const bits = [...(asked?.seconds ? [lengthText(asked.seconds)] : []), ...(asked?.w ? [`${asked.w}×${asked.h}`] : []), `${formatBytes(madeRef.size)} (was ${formatBytes(was.size)})`];
    return `✓ ${bits.join(' · ')}. Ctrl+Z puts the old one back.`;
  });

  // The buttons at the foot change as it goes (Apply, then Stop, then Close): when the one focused goes, or is in a
  // part made inert while it works, the focus moves to the new ones.
  let foot = $state<HTMLElement>();
  const footFor = $derived(cant || !facts ? 'reading' : working ? 'working' : done ? 'ended' : 'pick');
  let footWas = untrack(() => footFor);
  $effect(() => {
    const now = footFor;
    if (now === footWas) return;
    footWas = now;
    if (focusLost())
      (foot?.querySelector<HTMLElement>('[data-stop]') ?? foot?.querySelector<HTMLElement>('button.primary:not(:disabled)') ?? foot?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  });

  // ---------- Closing ----------
  let discarding = $state(false);
  let box = $state<HTMLElement>();
  /** Esc, ✕, Cancel: while it works, the work goes on; edits not applied are asked about first. */
  function close(): void {
    if (working || done || !changed) return onclose();
    discarding = true;
  }

  function onkey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    // (Only for this window: not a question asked over it.)
    if (!box || !(t === document.body || (t && box.contains(t)))) return;
    const inField = !!t?.closest?.('input, textarea, select');
    const typing = isTextField(t);
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (inField && !discarding) t!.blur();
      else if (discarding) discarding = false;
      else close();
      return;
    }
    if (e.altKey && e.key.startsWith('Arrow')) return void e.stopImmediatePropagation();
    if (working || done || !facts) return;
    if (mod && k === 'enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      // (A time typed in Start or End counts, as when leaving the box: it's left first, then it applies.)
      if (t?.matches?.('[data-trim-start], [data-trim-end]')) t.blur();
      void tick().then(() => (applyAsked = 'all'));
    } else if (mod && ((k === 'z' && e.shiftKey) || k === 'y') && !typing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      redo();
    } else if (mod && k === 'z' && !typing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      undo();
    } else if (!mod && !e.altKey && !typing && length > 0) {
      if (e.key === ' ' && !t?.closest?.('button, input, select, textarea, a')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
      } else if (k === 'i' || k === 'o') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (k === 'i') startHere();
        else endHere();
      }
    }
  }

  const reach = $derived(
    `${uses ? `Changes the file everywhere it’s used (${uses} place${uses === 1 ? '' : 's'}), on stream too.` : 'Changes the file.'} Ctrl+Z puts the old one back.${was.size > 500 * 1024 * 1024 ? ' The old file stays in this browser’s storage while Undo can bring it back.' : ''}`,
  );
  const hint = $derived(
    [was.name, ...(length ? [lengthText(length)] : []), ...(picture ? [`${W}×${H}`] : []), formatBytes(was.size)].join(' · '),
  );
  const nothingYet = $derived(picture ? 'Nothing to change yet: trim, crop or resize it first.' : 'Nothing to change yet: trim it first.');
  const silentWhy = silent ? (codecName(silent.why.sound) ?? 'its sound’s format') : '';
</script>

<svelte:window onkeydowncapture={onkey} />

<div class="modal-backdrop edit-backdrop" role="presentation">
  <!-- (data-undo: Ctrl+Z here undoes the window's own changes, never the game's underneath.) -->
  <div class="modal lg edit-modal" role="dialog" aria-modal="true" aria-label="Edit {what}" use:modal data-undo="off" bind:this={box} data-media-edit>
    <header class="row">
      <h2 class="modal-title">✎ Edit {what}</h2>
      {#if discarding}
        <InlineAsk text="Discard your edits to this {what}?" ok="Discard" cancel="Keep editing" danger onok={onclose} oncancel={() => (discarding = false)} />
      {:else}
        <span class="hint name" data-edit-hint>{hint}</span>
      {/if}
      <span class="spacer"></span>
      {#if !working && !done}
        <button class="ghost" onclick={undo} disabled={!canUndo} title="Ctrl+Z">↶ Undo</button>
        <button class="ghost" onclick={redo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">↷ Redo</button>
        <button class="ghost" onclick={reset} disabled={!facts || nothing}>Reset</button>
        <button class="ghost" onclick={close} title="Esc">Cancel</button>
      {/if}
      <button class="ghost modal-x" onclick={close} aria-label="Close" title={working ? 'Close: the edit carries on (the header shows how far it got)' : 'Close (Esc)'}>✕</button>
    </header>
    {#if !done}<p class="muted small" data-edit-reach>{reach}</p>{/if}

    {#if cant}
      <p class="warn">{cant}</p>
    {:else if !facts}
      <p class="muted" role="status">Reading the file…</p>
    {:else}
      <div class="body" class:sound={!picture} class:whole={done}>
        <div class="left">
          <div class="stage" class:sound={!picture} bind:clientWidth={stageW} bind:clientHeight={stageH}>
            <div class="picture" style:width={picture && fit ? `${fit.w}px` : undefined} style:height={picture && fit ? `${fit.h}px` : undefined}>
              {#if picture}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                  bind:this={media}
                  {src}
                  preload="auto"
                  playsinline
                  controls={!!watching}
                  onplay={() => ((playing = true), follow())}
                  onpause={() => ((playing = false), cancelAnimationFrame(raf))}
                  onseeked={() => media && (at = media.currentTime)}
                  aria-label={watching ? 'The edited video' : 'The video'}
                ></video>
                {#if !watching && !done && edit.crop && (cropping || cropPx)}
                  <CropBox crop={edit.crop as Box} aspect={cropAspect} ratio={W / H} still={!cropping || working} onbegin={flush} onchange={(c) => (edit.crop = c)} />
                {/if}
              {:else}
                <span class="ic" aria-hidden="true">🔊</span>
                <audio
                  bind:this={media}
                  {src}
                  preload="auto"
                  controls={!!watching}
                  onplay={() => ((playing = true), follow())}
                  onpause={() => ((playing = false), cancelAnimationFrame(raf))}
                  onseeked={() => media && (at = media.currentTime)}
                  aria-label={watching ? 'The edited sound' : 'The sound'}
                ></audio>
              {/if}
            </div>
          </div>

          {#if !done}
            <div class="controls" inert={working}>
              <div class="row">
                <button class="small" onclick={toggle} title="Space" aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
                <button class="small" onclick={playTrim} disabled={!length}>▶ Play the trim</button>
                <span class="muted small" aria-hidden="true">{clockTenths(at, true)} / {clockTenths(length, true)}</span>
              </div>
              {#if length}
                <h4>✂ Trim</h4>
                <TrimBar {length} start={edit.start} end={edit.end} {at} keys={quickAt !== null ? [quickAt] : undefined} onseek={seek} onchange={setTrim} />
                <div class="row trimrow">
                  <label class="field">Start<input value={clockTenths(edit.start, true)} onchange={(e) => typed(e, 'start')} aria-label="Start" data-trim-start /></label>
                  <button class="small" onclick={startHere} title="I">⇤ Start here</button>
                  <button class="small" onclick={endHere} title="O">End here ⇥</button>
                  <label class="field">End<input value={clockTenths(edit.end, true)} onchange={(e) => typed(e, 'end')} aria-label="End" data-trim-end /></label>
                  <span class="muted small" data-trim-keeps>Keeps {lengthText(ok?.out.seconds ?? edit.end - edit.start)} of {lengthText(length)}.</span>
                </div>
                {#if itemRange}
                  {@const r = itemRange}
                  <button class="small" onclick={() => change(() => ((edit.start = r.start), (edit.end = r.end ?? length)))}
                    >✂ Keep just what this item plays ({clockTenths(r.start)}–{clockTenths(r.end ?? length)})</button
                  >
                {/if}
                {#if quickAt !== null}
                  <fieldset class="choice" data-trim-choice>
                    <legend class="small muted">How it’s cut</legend>
                    <label class="check small">
                      <input type="radio" name="trim-how" checked={!planned.quick} disabled={!reencodes} onchange={() => change(() => (edit.quick = false))} />
                      {reencodes ? 'Exact trim (re-encodes the video: a little less sharp, and slower)' : `Exact trim (this browser can’t re-encode ${codecName(facts.video?.codec) ?? 'this video'})`}
                    </label>
                    <label class="check small">
                      <input type="radio" name="trim-how" checked={planned.quick} onchange={() => change(() => (edit.quick = true))} />
                      Quick trim, nothing re-encoded: it starts at {clockTenths(quickAt, true)}, the nearest point before {clockTenths(edit.start, true)} where this video can be cut as
                      it is
                    </label>
                  </fieldset>
                {/if}
              {:else}
                <p class="warn small">The app can’t tell how long it is, so it can’t trim it.</p>
              {/if}
            </div>
          {/if}
        </div>

        {#if !done}
          <aside inert={working}>
            {#if picture}
              <h4>🖼 Frame</h4>
              {#if !can?.ok}
                <p class="warn small">{NO_REENCODE_HERE}</p>
              {:else if !decodes}
                <p class="warn small">{cantReencode(facts.video?.codec ?? null)}</p>
              {/if}
              <div class="row">
                <button class="small" class:on={cropping} aria-pressed={cropping} onclick={() => (cropping ? (cropping = false) : startCrop())} disabled={!reencodes} bind:this={cropButton}
                  >✂ Crop</button
                >
                {#if cropping || edit.crop}
                  {#each ASPECTS as [a, l] (l)}
                    <button class="small" class:on={cropAspect === a} aria-pressed={cropAspect === a} onclick={() => setAspect(a)} disabled={!reencodes}>{l}</button>
                  {/each}
                  <button class="small" onclick={removeCrop}>Remove crop</button>
                {/if}
              </div>
              {#if cropPx}<p class="small accent" data-crop-size>crop {cropPx.width}×{cropPx.height}</p>{/if}

              <h4>📐 Size</h4>
              <div class="row" role="group" aria-label="Size">
                <button class="small" class:on={shortNow === null} aria-pressed={shortNow === null} onclick={() => setShort(null)} disabled={!reencodes && shortNow === null}>Keep ({cw}×{ch})</button>
                {#each sizes as s (s)}
                  {@const o = outputSize(facts, { ...edit, short: s })}
                  <button class="small" class:on={shortNow === s} aria-pressed={shortNow === s} title="{o.w}×{o.h}" onclick={() => setShort(s)} disabled={!reencodes}>{s}p</button>
                {/each}
              </div>

              {#if facts.audio}
                <h4>🔊 Sound</h4>
                <label class="check small">
                  <input type="checkbox" checked={edit.sound} disabled={!!silent} onchange={(e) => change(() => (edit.sound = e.currentTarget.checked))} />
                  Keep its sound{#if silent}{' '}({silentWhy}: this browser can’t play it){/if}
                </label>
                {#if !edit.sound && !silent}<p class="muted small">The video will be silent.</p>{/if}
              {/if}
            {/if}

            <h4>Result</h4>
            {#if nothing}
              <p class="muted small">Nothing changed yet: {picture ? 'trim, crop or resize it' : 'trim it'}.</p>
            {:else if ok}
              <p class="small" data-edit-estimate>
                About {formatBytes(ok.estimate)} (now {formatBytes(was.size)}) · {ok.copied
                  ? 'quick: nothing is re-encoded'
                  : ok.run.video?.codec
                    ? 're-encodes the video, which takes a while for a long clip'
                    : 're-encodes its sound'}
              </p>
              <p class="muted small" data-edit-format>Saved as {ok.format}</p>
              {#each ok.notes as n (n)}<p class="muted small">{n}</p>{/each}
            {:else if plan && 'refuse' in plan}
              <p class="warn small" data-edit-refuse>{plan.refuse}</p>
            {/if}

            {#if ok?.cut}
              {#if timed}
                <p class="small" data-edit-timed>
                  {timed === 1
                    ? '1 slide item plays part of it: its Start at and Stop at move with the trim, so it plays the same moments.'
                    : `${timed} slide items play parts of it: their Start at and Stop at move with the trim, so they play the same moments.`}
                </p>
              {/if}
              {#each leftOut.slice(0, 3) as l (l.where)}
                <p class="warn small" data-edit-left-out>
                  ⚠ {l.where} plays {clockTenths(l.start)}–{clockTenths(l.end)}, which this trim leaves out: it will play the whole trimmed clip instead.
                </p>
              {/each}
              {#if leftOut.length > 3}<p class="warn small">and {leftOut.length - 3} more</p>{/if}
              {#if uses > items}
                <p class="muted small">🔊 Sounds, wheels, dice and RPG music that use it have no Start/Stop of their own: they’ll play the trimmed file.</p>
              {/if}
            {/if}

            {#if onCards && ok}
              {#if ok.estimate > fileBytes}
                <p class="warn small" data-edit-phones>📱 Over this buzzer server’s {mbText(fileBytes)}: phones need a smaller copy (🗜) or a shorter trim</p>
              {:else if ok.estimate > SLOW_FILE_BYTES}
                <p class="small" data-edit-phones>📱 About {formatBytes(ok.estimate)}: phones on mobile data may wait for it (🗜 can make a smaller copy for phones after)</p>
              {/if}
              {#if copy}
                <label class="check small">
                  <input type="checkbox" checked={remakeOn} onchange={(e) => (remake = e.currentTarget.checked)} data-edit-remake />
                  📱 Make its smaller copy for phones again
                </label>
                <p class="muted small">(the old copy was made from the file as it is now)</p>
              {/if}
            {/if}
          </aside>
        {/if}
      </div>
    {/if}

    {#if ended && 'failed' in ended && !working}
      <p class="warn" role="status" data-edit-failed>{ended.failed}</p>
    {:else if ended && 'stopped' in ended && !working}
      <p class="muted" role="status" data-edit-stopped>Stopped: nothing was changed.</p>
    {:else if done}
      <p class="good" role="status" data-edit-done>{doneText}</p>
    {/if}

    <div class="modal-foot" bind:this={foot}>
      {#if cant || !facts}
        <button class={cant ? 'primary' : 'ghost'} onclick={onclose}>{cant ? 'Close' : 'Cancel'}</button>
      {:else if working && jobId}
        <JobProgress job={jobId} />
        <span class="spacer"></span>
        <button class="ghost" onclick={onclose} title="Close this window: the edit carries on (the header shows how far it got)">Keep working</button>
        <button data-stop onclick={() => stopJob(jobId!)} title="Stop it: nothing is changed">Stop</button>
      {:else if done}
        {#if madeRef && mediaUrls[madeRef.id]}
          <button class="ghost" onclick={() => (watching = watching ? null : madeRef!.id)}>{watching ? '⏹ Stop watching' : '▶ Watch it'}</button>
        {/if}
        <button class="primary" onclick={onclose}>Close</button>
      {:else}
        <span class="hint foot-hint"
          >{oneOf
            ? 'Ctrl+Z (or 🕘 History) puts the old file back. Only this item keeps the original for the other places (both are saved with the game).'
            : 'Ctrl+Z (or 🕘 History) puts the old file back. Save as a new file keeps both (both are saved with the game).'}</span
        >
        <button class="ghost" onclick={close}>Cancel</button>
        {#if oneOf}
          <button onclick={() => apply('item')} disabled={!ok || nothing || keyPending} title={nothing ? nothingYet : 'Only the item this was opened from gets the edited file'}
            >Only this item</button
          >
        {:else if !item}
          <button onclick={() => apply('new')} disabled={!ok || nothing || keyPending} title={nothing ? nothingYet : 'Keep this file as it is, and add the edited one beside it in 🖼 Media'}
            >Save as a new file</button
          >
        {/if}
        <button class="primary" onclick={() => apply('all')} disabled={!ok || nothing || keyPending} title={nothing ? nothingYet : 'Ctrl+Enter'}
          >{oneOf ? `Apply to all ${uses}` : 'Apply'}</button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  /* Over the clue editor, or the slide's window it was opened from. */
  .edit-backdrop {
    z-index: calc(var(--z-modal) + 20);
    padding-inline: 12px;
    padding-bottom: 12px;
  }
  .edit-modal {
    position: relative;
  }
  header {
    flex-wrap: nowrap;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 14px;
    min-height: 0;
  }
  .body.sound {
    grid-template-columns: minmax(0, 1fr) 240px;
  }
  .body.whole {
    grid-template-columns: minmax(0, 1fr);
  }
  .stage {
    height: min(46vh, 420px);
    display: grid;
    place-items: center;
    background: #000;
    border-radius: 6px;
    overflow: hidden;
  }
  .stage.sound {
    height: 90px;
  }
  .picture {
    position: relative;
    line-height: 0;
  }
  .picture video {
    width: 100%;
    height: 100%;
    object-fit: fill;
    display: block;
  }
  .ic {
    font-size: 40px;
    line-height: 1;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .trimrow input {
    width: 84px;
  }
  .trimrow .field {
    flex-direction: row;
    align-items: center;
  }
  .choice {
    margin: 0;
    padding: 4px 10px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }
  h4 {
    margin: 6px 0 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .accent {
    color: var(--accent);
  }
  .good {
    color: var(--good);
  }
  .foot-hint {
    margin-right: auto;
  }
  @media (max-width: 800px) {
    .body,
    .body.sound {
      grid-template-columns: 1fr;
    }
  }
</style>
