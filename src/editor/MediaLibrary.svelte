<!-- Every file in the game, with usage counts and cleanup (spec §5.5), and everything that plays from the internet. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { ACCEPT, addMediaFile, canPlay, formatBytes, imgFallback, mediaUrls, missingMedia, relinkMissing, replaceMediaFile, stashMedia } from '../lib/media.svelte';
  import { attachBlobSwap, step, stepAsync } from '../lib/history.svelte';
  import { uniqueMediaName } from '../lib/medianame';
  import { hasFiles } from '../lib/mediadrop';
  import { allEmbeds, mediaUsage } from '../lib/usage';
  import { openMediaPopup } from '../lib/mediactl.svelte';
  import { probeLink } from '../lib/download';
  import { embedName, embedOpenUrl, formatWhen, linkHost, linkLifetime } from '../lib/links';
  import type { MediaRef } from '../lib/model';
  import LinkField from './LinkField.svelte';
  import SaveCopyButton from './SaveCopyButton.svelte';

  const game = $derived(app.game);
  const usage = $derived(mediaUsage(game));
  // Live links aren't stored, so they take no space.
  const stored = $derived(game.media.filter((m) => !m.url));
  const total = $derived(stored.reduce((a, m) => a + m.size, 0));
  const links = $derived(game.media.length - stored.length);
  const unused = $derived(game.media.filter((m) => !usage.get(m.id)));
  const embeds = $derived(allEmbeds(game));
  const missing = $derived(missingMedia(game));
  const icon = { image: '🖼', video: '🎬', audio: '🔊', font: '🔤' } as const;
  const EMBED_ICON: Record<string, string> = { youtube: '▶️', drive: '🎞', streamable: '🎞' };

  /** "Check link" results by media id. */
  let checks = $state<Record<string, 'checking' | 'ok' | 'failed'>>({});
  async function check(m: MediaRef): Promise<void> {
    if (!m.url) return;
    checks[m.id] = 'checking';
    const kind = await probeLink(m.url, m.kind === 'font' ? undefined : m.kind);
    checks[m.id] = kind ? 'ok' : 'failed';
  }

  function expiry(m: MediaRef): string {
    const life = linkLifetime(m);
    if (life === 'expired') return m.expiresAt ? `expired ${formatWhen(m.expiresAt)}` : 'expired';
    if (life === 'temporary') return m.expiresAt ? `expires ${formatWhen(m.expiresAt)}` : 'temporary link';
    return '';
  }

  /** Done at once: the note at the bottom offers Undo (the files stay stored while a step can bring them back). */
  function remove(ids: string[], label: string): void {
    step(label, () => (game.media = game.media.filter((m) => !ids.includes(m.id))), { notify: true });
    picked = picked.filter((id) => !ids.includes(id));
  }

  // ---------- Selecting several cards (Ctrl+click toggles one, Shift+click takes the run from the last one) ----------
  let picked = $state<string[]>([]);
  let anchor: string | null = null;
  const pickedRefs = $derived(game.media.filter((m) => picked.includes(m.id)));
  function pick(e: MouseEvent, m: MediaRef): void {
    // Not a click on the card's own buttons, player or name box.
    if ((e.target as HTMLElement).closest('button, input, audio, video, a')) return;
    if (e.shiftKey && anchor && game.media.some((x) => x.id === anchor)) {
      const ids = game.media.map((x) => x.id);
      const [a, b] = [ids.indexOf(anchor), ids.indexOf(m.id)].sort((x, y) => x - y);
      picked = [...new Set([...picked, ...ids.slice(a, b + 1)])];
    } else if (e.ctrlKey || e.metaKey) {
      picked = picked.includes(m.id) ? picked.filter((id) => id !== m.id) : [...picked, m.id];
      anchor = m.id;
    } else {
      picked = picked.length === 1 && picked[0] === m.id ? [] : [m.id];
      anchor = m.id;
    }
  }
  function removePicked(): void {
    const refs = pickedRefs;
    if (!refs.length) return;
    const n = usage.get(refs[0].id) ?? 0;
    const used = refs.filter((m) => usage.get(m.id)).length;
    const label = refs.length === 1 ? `Removed file “${refs[0].name}”${n ? ` (used ${n}×)` : ''}` : `Removed ${refs.length} files${used ? ` (${used} in use)` : ''}`;
    remove(refs.map((m) => m.id), label);
  }
  let library = $state<HTMLDivElement>();
  function onkey(e: KeyboardEvent): void {
    if (!picked.length || e.defaultPrevented || (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    // (Not with a window or a menu open, nor for something else in focus: a round's tab, the header's buttons…)
    const at = document.activeElement;
    if (document.querySelector('[role="dialog"], [role="menu"]') || (at && at !== document.body && !library?.contains(at))) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removePicked();
    } else if (e.key === 'Escape') picked = [];
  }

  // ---------- Renaming a file in place (double-click or F2 on its name) ----------
  let renaming = $state<string | null>(null);
  function rename(m: MediaRef, name: string): void {
    renaming = null;
    const want = name.trim();
    if (want && want !== m.name) {
      const to = uniqueMediaName(game.media.filter((x) => x.id !== m.id).map((x) => x.name), want);
      step(`Renamed file “${m.name}” to “${to}”`, () => (m.name = to));
    }
    void tick().then(() => document.querySelector<HTMLElement>(`[data-media-name="${m.id}"]`)?.focus());
  }
  const focusAll = (el: HTMLInputElement) => {
    el.focus();
    // The name without its extension, which usually stays.
    const dot = el.value.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  };

  function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      input.accept = accept;
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  /** Put a new file in place of this one (every use of it follows). Undo puts the old one back. */
  async function replace(m: MediaRef): Promise<void> {
    const [f] = await pickFiles(ACCEPT[m.kind], false);
    if (f) await replaceWith(m, f);
  }

  /** Replace…, or a file dropped on the card. A file of another kind is refused (a toast says why). */
  async function replaceWith(m: MediaRef, f: File): Promise<void> {
    try {
      await stepAsync(`Replaced file “${m.name}” with “${f.name}”`, async () => {
        const before = await stashMedia(m.id);
        await replaceMediaFile(game, m.id, f);
        attachBlobSwap({ id: m.id, before, after: await stashMedia(m.id) });
      });
      toast(`"${f.name}" is in place: everything that used this file shows it now`);
    } catch (e) {
      toast((e as Error).message, 6000);
    }
  }

  /** Pick several files at once; each missing file with the same name gets reconnected. */
  async function findMissing(): Promise<void> {
    const files = await pickFiles(`${ACCEPT.any},${ACCEPT.font}`, true);
    if (!files.length) return;
    const r = await relinkMissing(game, files);
    const rest = r.stillMissing.length ? ` Still missing: ${r.stillMissing.join(', ')} (use 🔗 Replace file… on each).` : '';
    toast(`Reconnected ${r.fixed} file${r.fixed === 1 ? '' : 's'}.${rest}${r.errors.length ? ' ' + r.errors.join(' ') : ''}`, r.stillMissing.length || r.errors.length ? 9000 : 4000);
  }

  /** Add files to the game (⬆ Add files…, or dropped on this page). */
  async function addFiles(files: File[]): Promise<void> {
    for (const f of files) {
      try {
        const ref = await addMediaFile(game, f);
        if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime)) toast(`⚠ This browser may not play "${ref.name}"`, 6000);
      } catch (e) {
        toast((e as Error).message, 5000);
      }
    }
  }

  async function upload(): Promise<void> {
    await addFiles(await pickFiles(`${ACCEPT.any},${ACCEPT.font}`, true));
  }

  /** Files are being dragged over the page. */
  let dropping = $state(false);
  function over(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropping = true;
  }
  function drop(e: DragEvent): void {
    dropping = false;
    // A game file isn't media: the editor opens it, as when it's dropped anywhere else.
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => !/\.(brainrot|jbr|json)$/i.test(f.name));
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  }

  /** The card a file is being dragged over (dropping it there replaces that file). */
  let dropOn = $state<string | null>(null);
  function cardOver(e: DragEvent, m: MediaRef): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dropping = false;
    dropOn = m.id;
  }
  function cardDrop(e: DragEvent, m: MediaRef): void {
    dropOn = null;
    const f = e.dataTransfer?.files[0];
    if (!hasFiles(e) || !f) return;
    e.preventDefault();
    e.stopPropagation();
    void replaceWith(m, f);
  }
</script>

<svelte:window onkeydown={onkey} />

<div
  class="library"
  bind:this={library}
  class:dropping
  ondragover={over}
  ondragleave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && (dropping = false)}
  ondrop={drop}
  role="region"
  aria-label="Media. Drop files here to add them."
>
  <h2>Media</h2>
  <p class="muted">
    Files stored with this game: {stored.length} · {formatBytes(total)}.
    {#if links}🌐 {links} more play{links === 1 ? 's' : ''} from the internet.{/if}
    {#if total > 100 * 1024 ** 2}<span class="warn">Large games are fine as .brainrot packs but make big standalone HTML exports.</span>{/if}
  </p>
  {#if missing.length}
    <div class="missing-box" role="alert">
      ⚠ {missing.length} file{missing.length === 1 ? ' is' : 's are'} missing from this browser (e.g. after opening a .json export, which
      has no media). Pick the files again to put them back:
      <button class="small" onclick={findMissing}>🔗 Find missing files…</button>
      <span class="muted small">(matched by file name; or use 🔗 Replace file… on each one below)</span>
    </div>
  {/if}
  <div class="row top">
    <button onclick={upload}>⬆ Add files…</button>
    <div class="link">
      <LinkField
        autofocus={false}
        onmedia={() => {}}
        hint="Add from a link: the game saves a copy when the site allows it, e.g. https://files.catbox.moe/abc123.mp3"
      />
    </div>
    <button disabled={!unused.length} onclick={() => remove(unused.map((m) => m.id), `Removed ${unused.length} unused file${unused.length === 1 ? '' : 's'}`)}>
      🧹 Remove unused ({unused.length})
    </button>
  </div>
  {#if game.media.length}
    <div class="row picking">
      {#if picked.length}
        <span>{picked.length} selected</span>
        <button class="small bad" onclick={removePicked} title="Remove the selected files (Delete)">Remove selected ({picked.length})</button>
        <button class="small ghost" onclick={() => (picked = [])} title="Esc">Clear</button>
      {:else}
        <span class="muted small">
          Click a card to select it, Ctrl+click or Shift+click for more. Double-click a name (or F2) to rename it. Drop a file on a card to
          replace it everywhere it's used.
        </span>
      {/if}
    </div>
  {/if}

  {#if !game.media.length}
    <div class="empty muted">
      <span class="ic" aria-hidden="true">🖼</span>
      No files yet. Drop pictures, videos, sounds or fonts here, or use ⬆ Add files…
    </div>
  {/if}

  <div class="grid">
    {#each game.media as m (m.id)}
      {@const n = usage.get(m.id) ?? 0}
      <!-- The keyboard selects with the checkbox. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <div
        class="card"
        class:unused={!n}
        class:picked={picked.includes(m.id)}
        class:media-drop={dropOn === m.id}
        data-place="media:{m.id}"
        onclick={(e) => pick(e, m)}
        ondragover={(e) => cardOver(e, m)}
        ondragleave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && dropOn === m.id && (dropOn = null)}
        ondrop={(e) => cardDrop(e, m)}
        role="group"
        aria-label={m.name}
      >
        <div class="thumb">
          {#if m.kind === 'image' && mediaUrls[m.id]}
            <img src={mediaUrls[m.id]} alt="" onerror={imgFallback} />
          {:else if m.kind === 'video' && mediaUrls[m.id]}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={mediaUrls[m.id]} preload="metadata" controls></video>
          {:else}
            <span class="ic">{icon[m.kind]}</span>
          {/if}
          {#if !mediaUrls[m.id]}<span class="missing">missing</span>{/if}
          {#if m.url}<span class="badge" title="Plays from the internet: {m.url}">🌐</span>{/if}
        </div>
        {#if m.kind === 'audio' && mediaUrls[m.id]}
          <audio class="listen" src={mediaUrls[m.id]} preload="none" controls aria-label="Play {m.name}"></audio>
        {/if}
        {#if renaming === m.id}
          <input
            class="nm"
            value={m.name}
            aria-label="File name"
            use:focusAll
            onkeydown={(e) => {
              if (e.key === 'Enter') rename(m, e.currentTarget.value);
              else if (e.key === 'Escape') (e.stopPropagation(), rename(m, m.name));
            }}
            onblur={(e) => renaming === m.id && rename(m, e.currentTarget.value)}
          />
        {:else}
          <div class="name-row">
            <input
              type="checkbox"
              checked={picked.includes(m.id)}
              onchange={() => (picked = picked.includes(m.id) ? picked.filter((id) => id !== m.id) : [...picked, m.id])}
              aria-label="Select {m.name}"
            />
            <button
              class="nm"
              data-media-name={m.id}
              title="{m.name} · double-click or F2 to rename"
              ondblclick={() => (renaming = m.id)}
              onkeydown={(e) => e.key === 'F2' && (e.preventDefault(), (renaming = m.id))}
            >{m.name}</button>
          </div>
        {/if}
        <div class="meta muted">
          {m.url ? `🌐 ${linkHost(m.url)}` : formatBytes(m.size)} · {n ? `used ${n}×` : 'unused'}
          {#if !m.url && (m.kind === 'video' || m.kind === 'audio') && !canPlay(m.mime)}<span class="warn" title={m.mime}> · may not play</span>{/if}
        </div>
        {#if m.url}
          {@const exp = expiry(m)}
          {#if exp}<div class="meta warn">⏳ {exp}</div>{/if}
          <div class="acts">
            <SaveCopyButton id={m.id} />
            <button class="ghost small" onclick={() => check(m)} disabled={checks[m.id] === 'checking'} title="Does the link still play?">
              {checks[m.id] === 'checking' ? 'Checking…' : 'Check link'}
            </button>
          </div>
          {#if checks[m.id] === 'ok'}<div class="meta good">✓ The link works</div>{/if}
          {#if checks[m.id] === 'failed'}<div class="meta warn">⚠ The link didn't load</div>{/if}
        {:else if m.source}
          <div class="meta muted" title={m.source}>Saved from {linkHost(m.source)}</div>
        {/if}
        <div class="acts">
          {#if !m.url && !mediaUrls[m.id]}
            <button class="small primary" onclick={() => replace(m)} title="Pick the file again (or another one) to fix every place it's used">🔗 Replace file…</button>
          {:else}
            <button class="ghost small" onclick={() => replace(m)} title="Swap in another file; every place it's used follows">Replace…</button>
          {/if}
          <button class="ghost small" onclick={() => remove([m.id], `Removed file “${m.name}”${n ? ` (used ${n}×)` : ''}`)}>Remove</button>
        </div>
      </div>
    {/each}
  </div>

  {#if embeds.length}
    <h3>🌐 Online players on slides (need internet during the game)</h3>
    <p class="muted">
      YouTube may refuse to play inside a file opened from disk; the host always gets an "Open on YouTube" button for it. Google
      Drive's and Streamable's players show on the audience screen, where you click ▶ inside them.
    </p>
    <table>
      <tbody>
        {#each embeds as { el, where }}
          <tr>
            <td>{EMBED_ICON[el.embedKind] ?? '🌐'}</td>
            <td>{embedName(el.embedKind, el.url)}</td>
            <td class="url" title={el.url}>{el.url}</td>
            <td class="muted">{where}</td>
            <td><button class="small" onclick={() => openMediaPopup(embedOpenUrl(el.embedKind, el.url, el.startAt))}>Check ↗</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .library {
    min-height: 100%;
    border-radius: 8px;
  }
  .library.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: 6px;
  }
  .empty {
    margin-top: 14px;
    padding: 28px 16px;
    border: 2px dashed var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  h2 {
    margin: 0 0 4px;
  }
  h3 {
    margin: 24px 0 4px;
  }
  p {
    margin: 0 0 12px;
  }
  .warn {
    color: var(--warn);
  }
  .good {
    color: var(--good);
  }
  .top {
    align-items: flex-start;
  }
  .link {
    flex: 1;
    max-width: 560px;
  }
  .badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 14px;
  }
  .acts {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .card.unused {
    border-style: dashed;
  }
  .card.picked {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .picking {
    margin-top: 10px;
    min-height: 28px;
    align-items: center;
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .name-row input {
    margin: 0;
  }
  .thumb {
    position: relative;
    height: 100px;
    background: #000;
    border-radius: 4px;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .thumb img,
  .thumb video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .listen {
    width: 100%;
    height: 32px;
  }
  .ic {
    font-size: 40px;
  }
  .missing {
    position: absolute;
    bottom: 4px;
    font-size: 11px;
    color: var(--bad);
  }
  .nm {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  button.nm {
    flex: 1;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: text;
  }
  input.nm {
    width: 100%;
    padding: 1px 4px;
  }
  .meta {
    font-size: 11px;
  }
  .small {
    font-size: 12px;
    align-self: flex-start;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 1000px;
  }
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .url {
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .missing-box {
    margin: 0 0 12px;
    padding: 8px 12px;
    border: 1px solid var(--warn);
    border-radius: 8px;
    background: color-mix(in srgb, var(--warn) 12%, transparent);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>
