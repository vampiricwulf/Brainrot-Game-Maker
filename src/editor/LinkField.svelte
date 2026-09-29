<!--
  "Paste a link": turns an online link into game media (spec §5.5). The file is downloaded into the game
  when the site allows it, or else added as a live link; progress, Cancel and the outcome show here and in
  a toast. On a slide (`onembed`), YouTube, Streamable and Google Drive's player become online players.
  Google Drive in the browser can't be downloaded, so it asks what the file is and offers the ways that work.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { ACCEPT, addMediaFile, addMediaLink, canPlay, formatBytes, type LinkAdded } from '../lib/media.svelte';
  import { isAbort, LinkError } from '../lib/download';
  import { DRIVE_SHARE_HINT, driveUrls, isLinkProblem, linkMessages, parseMediaLink, type LinkKind, type MediaLink } from '../lib/links';
  import { inTauri } from '../lib/platform';
  import { pickFile } from '../lib/fileio';
  import type { EmbedKind, MediaRef } from '../lib/model';

  let {
    want,
    onmedia,
    onembed,
    initial = '',
    hint = 'Direct file link, e.g. https://files.catbox.moe/abc123.mp3',
    autofocus = true,
  }: {
    /** What the spot needs; leave out on a slide (anything goes there). */
    want?: LinkKind;
    /** The link became game media (`added` is null for a file added by hand after "Download from Drive"). */
    onmedia: (ref: MediaRef, added: LinkAdded | null) => void;
    /** On a slide: play YouTube, Streamable or Google Drive's player there. */
    onembed?: (url: string, kind: EmbedKind) => void;
    /** Start with this link right away (pasted or dropped on a slide). */
    initial?: string;
    hint?: string;
    /** Put the cursor in the field when it appears (a picker that was just opened). */
    autofocus?: boolean;
  } = $props();

  const desktop = inTauri();
  let text = $state(untrack(() => initial));
  let busy = $state<{ loaded: number; total?: number } | null>(null);
  let error = $state('');
  /** A Google Drive link waiting for a choice: what it is (ask), or how to play a video/sound. */
  let drive = $state<{ link: MediaLink; step: 'ask' | 'video' } | null>(null);
  let fetched = $state(false);
  let controller: AbortController | null = null;
  let input = $state<HTMLInputElement>();

  onMount(() => {
    if (untrack(() => initial)) go();
    else if (untrack(() => autofocus)) input?.focus();
    return () => controller?.abort();
  });

  function go(kind?: LinkKind): void {
    error = '';
    const link = parseMediaLink(text, want);
    if (!link) return void (error = text.trim() ? linkMessages.notLink : '');
    if (isLinkProblem(link)) return void (error = link.message);
    if (link.embed) {
      if (!onembed) return void (error = link.embed === 'youtube' ? linkMessages.youtubeOnly : linkMessages.streamableOnly);
      onembed(link.source, link.embed);
      text = '';
      return;
    }
    // Google refuses Drive files to web pages: pictures show from Drive's image link; video and sound can't.
    if (link.drive && !desktop) {
      const k = kind ?? want;
      if (k !== 'image') {
        drive = { link, step: k ? 'video' : 'ask' };
        return;
      }
    }
    void run(link, kind ?? want);
  }

  async function run(link: MediaLink, kind?: LinkKind): Promise<void> {
    controller?.abort();
    const ctl = (controller = new AbortController());
    busy = { loaded: 0 };
    try {
      const added = await addMediaLink(app.game, link, kind, {
        signal: ctl.signal,
        onprogress: (loaded, total) => (busy = { loaded, total }),
        confirmBig: (bytes, known) =>
          confirm(
            `This file is ${known ? '' : 'over '}${formatBytes(bytes)}. Save a copy in the game?\n\n` +
              'Big files make big game packs. Cancel plays it from the link instead (needs internet during the show).',
          ),
      });
      text = '';
      drive = null;
      toast(`${added.warn ? '⚠' : added.saved ? '✓' : '🌐'} ${added.message}`, added.saved ? 4000 : 9000);
      const r = added.ref;
      if (added.saved && (r.kind === 'video' || r.kind === 'audio') && !canPlay(r.mime))
        toast(`⚠ This browser may not play "${r.name}" (${r.mime}). Try converting it to MP4 (H.264) or MP3.`, 7000);
      onmedia(r, added);
    } catch (e) {
      if (isAbort(e)) return;
      error = e instanceof LinkError || e instanceof Error ? e.message : String(e);
      // A Drive file the desktop app couldn't download may still play in Drive's own player; otherwise just say why.
      if (link.drive && onembed && e instanceof LinkError && /drive-(quota|no-download|page)/.test(e.problem.problem)) drive = { link, step: 'video' };
      else drive = null;
    } finally {
      if (controller === ctl) {
        controller = null;
        busy = null;
      }
    }
  }

  function cancel(): void {
    controller?.abort();
    controller = null;
    busy = null;
    toast('Cancelled');
  }

  /** A top-level visit to the file downloads it: the one way Google lets a browser have a Drive file. */
  function downloadFromDrive(): void {
    if (!drive?.link.drive) return;
    // (noopener: the download tab gets no handle on this page.)
    window.open(driveUrls.download(drive.link.drive), '_blank', 'noopener');
    fetched = true;
  }

  async function addDownloaded(): Promise<void> {
    const file = await pickFile(ACCEPT[want ?? 'any']);
    if (!file) return;
    try {
      const ref = await addMediaFile(app.game, file, file.name, { source: drive?.link.source });
      drive = null;
      text = '';
      onmedia(ref, null);
    } catch (e) {
      toast((e as Error).message, 5000);
    }
  }
</script>

<div class="lf">
  <div class="row">
    <input
      bind:this={input}
      type="url"
      bind:value={text}
      placeholder="Paste a link…"
      aria-label="Paste a link"
      disabled={!!busy}
      oninput={() => ((drive = null), (error = ''), (fetched = false))}
      onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), go())}
    />
    <button class="small" onclick={() => go()} disabled={!!busy || !text.trim()}>Add</button>
  </div>
  {#if busy}
    <div class="busy" role="status">
      <span class="small">
        {busy.loaded ? `Downloading… ${formatBytes(busy.loaded)}${busy.total ? ` of ${formatBytes(busy.total)}` : ''}` : 'Checking the link…'}
      </span>
      {#if busy.total}<progress max={busy.total} value={busy.loaded}></progress>{:else}<progress></progress>{/if}
      <button class="small" onclick={cancel}>Cancel</button>
    </div>
  {:else if drive}
    <div class="drive">
      {#if drive.step === 'ask'}
        <p class="small">Is this Google Drive file a picture, or a video or sound?</p>
        <div class="row">
          <button class="small" onclick={() => go('image')}>🖼 Picture</button>
          <button class="small" onclick={() => drive && (drive = { ...drive, step: 'video' })}>🎬 Video or sound</button>
        </div>
      {:else}
        <p class="small">
          {#if error}{error}{:else if onembed}Drive videos and sounds can't play directly inside the browser version.{:else}{linkMessages.driveBrowser}{/if}
        </p>
        <div class="row">
          {#if onembed}
            <button class="small primary" onclick={() => drive && onembed(drive.link.source, 'drive')}>▶ Use Google Drive's player</button>
          {/if}
          {#if !desktop}<button class="small" onclick={downloadFromDrive}>⬇ Download from Drive</button>{/if}
          {#if fetched}<button class="small" onclick={addDownloaded}>⬆ Add the downloaded file…</button>{/if}
        </div>
        {#if onembed}
          <p class="muted small">Drive's player shows on the audience screen; click ▶ inside it there. The host can restart or stop it, but not pause or seek it.</p>
        {/if}
        {#if fetched}<p class="muted small">When the download has finished, add the file here.</p>{/if}
      {/if}
      <p class="muted small">{DRIVE_SHARE_HINT}</p>
    </div>
  {:else if error}
    <p class="error small" role="alert">⚠ {error}</p>
  {:else}
    <p class="muted small">{hint}</p>
  {/if}
</div>

<style>
  .lf {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    flex-wrap: nowrap;
    gap: 6px;
  }
  .drive .row {
    flex-wrap: wrap;
  }
  input {
    flex: 1;
    min-width: 0;
  }
  .busy {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  progress {
    flex: 1;
    min-width: 40px;
  }
  p {
    margin: 0;
    white-space: normal;
  }
  .small {
    font-size: 12px;
  }
  .error {
    color: var(--warn);
  }
  .drive {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel-2);
  }
</style>
