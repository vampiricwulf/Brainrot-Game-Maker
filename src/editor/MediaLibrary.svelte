<!-- Every file in the game, with usage counts and cleanup (spec §5.5), and everything that plays from the internet. -->
<script lang="ts">
  import PageHeader from './PageHeader.svelte';
  import { tick } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { ACCEPT, addMediaFile, canPlay, formatBytes, imgFallback, mediaUrls, missingMedia, relinkMissing, replaceMediaFile, stashMedia } from '../lib/media.svelte';
  import { attachBlobSwap, nameStep, step, stepAsync } from '../lib/history.svelte';
  import { uniqueMediaName } from '../lib/medianame';
  import { hasFiles, warnIfUnplayable } from '../lib/mediadrop';
  import { allEmbeds, allSlides, mediaUsage } from '../lib/usage';
  import { redoEdits } from '../lib/reedit';
  import { openMediaPopup } from '../lib/mediactl.svelte';
  import { probeLink } from '../lib/download';
  import { embedName, embedOpenUrl, formatWhen, linkHost, linkLifetime } from '../lib/links';
  import { categoryLabel, isBoard, roundName, type MediaRef } from '../lib/model';
  import LinkField from './LinkField.svelte';
  import SaveCopyButton from './SaveCopyButton.svelte';

  const game = $derived(app.game);
  const usage = $derived(mediaUsage(game));
  // Live links aren't stored, so they take no space.
  // (A missing file isn't stored here: it's counted apart.)
  const stored = $derived(game.media.filter((m) => !m.url && mediaUrls[m.id]));
  const total = $derived(stored.reduce((a, m) => a + m.size, 0));
  const links = $derived(game.media.filter((m) => m.url).length);
  const unused = $derived(game.media.filter((m) => !usage.get(m.id)));
  const embeds = $derived(allEmbeds(game));
  /** The slides each file shows on ("Jeopardy! · Memes #2 (question)"), for its "used 3×" tooltip. */
  const places = $derived.by(() => {
    const at = new Map<string, string[]>();
    const put = (id: string | undefined, where: string) => {
      if (!id) return;
      const list = at.get(id) ?? [];
      if (!list.includes(where)) list.push(where);
      at.set(id, list);
    };
    for (const { slide, where } of allSlides(game)) {
      put(slide.background.image, `${where}, background`);
      for (const el of slide.elements)
        if (el.kind === 'image' || el.kind === 'video' || el.kind === 'audio') {
          put(el.media, where);
          if (el.kind === 'image') put(el.editedMedia, where);
        }
    }
    // The commonest places off the slides (the count has them all).
    for (const id of Object.values(game.audio ?? {})) put(id ?? undefined, '🔊 Sounds');
    put(game.theme?.boardImage, '🎨 Theme: background picture');
    put(game.theme?.banner, '🎨 Theme: banner');
    game.rounds.forEach((r, ri) => {
      if (!isBoard(r)) return;
      const name = roundName(r, ri);
      for (const c of r.categories) {
        put(c.image, `${name} · ${categoryLabel(c)} (category picture)`);
        c.clues.forEach((cl, i) => put(cl.tileFace?.image, `${name} · ${categoryLabel(c)} #${i + 1} (tile picture)`));
      }
      for (const d of r.decor ?? []) {
        put(d.media, `${name} (board image)`);
        put(d.editedMedia, `${name} (board image)`);
      }
    });
    return at;
  });
  function usedWhere(m: MediaRef): string | undefined {
    const list = places.get(m.id);
    if (!list?.length) return undefined;
    const more = list.length > 10 ? `\n…and ${list.length - 10} more` : '';
    return `Used in:\n${list.slice(0, 10).join('\n')}${more}`;
  }
  const missing = $derived(missingMedia(game));
  /** The filter box: files whose name (or kind: "audio", "font"…) has every word typed. */
  let filter = $state('');
  const shown = $derived.by(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? game.media.filter((m) => words.every((w) => `${m.name} ${m.kind}`.toLowerCase().includes(w))) : game.media;
  });
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
    const label = refs.length === 1 ? `Deleted file “${refs[0].name}”${n ? ` (used ${n}×)` : ''}` : `Deleted ${refs.length} files${used ? ` (${used} in use)` : ''}`;
    remove(refs.map((m) => m.id), label);
  }
  let library = $state<HTMLDivElement>();
  function onkey(e: KeyboardEvent): void {
    // (A card's "Select" checkbox isn't typing: Delete and Esc act on the selection there too.)
    if (!picked.length || e.defaultPrevented || (e.target as HTMLElement).closest?.('input:not([type="checkbox"]), textarea, select, [contenteditable]')) return;
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
      let edited = { redone: 0, plain: 0 };
      await stepAsync(`Replaced file “${m.name}” with “${f.name}”`, async () => {
        const before = await stashMedia(m.id);
        await replaceMediaFile(game, m.id, f);
        attachBlobSwap({ id: m.id, before, after: await stashMedia(m.id) });
        // Pictures showing an edited copy of the old file get their edits again, on the new one.
        edited = await redoEdits(game, m.id);
      });
      const n = edited.redone + edited.plain;
      const note = !n
        ? ''
        : edited.plain
          ? ` (${n} edited picture${n === 1 ? '' : 's'}: ${edited.plain} show${edited.plain === 1 ? 's' : ''} it without the edits)`
          : ` (with the edits of ${n} edited picture${n === 1 ? '' : 's'} done again)`;
      toast(`"${f.name}" is in place: everything that used this file shows it now${note}`);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  /** Pick several files at once; each missing file with the same name gets reconnected (one step: Undo takes them out again). */
  async function findMissing(): Promise<void> {
    const files = await pickFiles(`${ACCEPT.any},${ACCEPT.font}`, true);
    if (!files.length) return;
    const r = await stepAsync(null, async () => {
      const r = await relinkMissing(game, files, attachBlobSwap);
      if (r.fixed) nameStep(`Reconnected ${r.fixed} file${r.fixed === 1 ? '' : 's'}`, { place: { tab: 'media' } });
      return r;
    });
    const rest = r.stillMissing.length ? ` Still missing: ${r.stillMissing.join(', ')} (use 🔗 Replace file… on each).` : '';
    toast(`Reconnected ${r.fixed} file${r.fixed === 1 ? '' : 's'}.${rest}${r.errors.length ? ' ' + r.errors.join(' ') : ''}`);
  }

  /** Add files to the game (＋ Add files…, or dropped on this page). */
  async function addFiles(files: File[]): Promise<void> {
    for (const f of files) {
      try {
        const ref = await addMediaFile(game, f);
        warnIfUnplayable(ref);
      } catch (e) {
        toast((e as Error).message);
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
  <PageHeader title="Media">
    {#snippet sub()}
      Files stored with this game: {stored.length} · {formatBytes(total)}{#if missing.length}{' '}({missing.length} more missing){/if}.
      {#if links}🌐 {links} more play{links === 1 ? 's' : ''} from the internet.{/if}
      {#if total > 100 * 1024 ** 2}<span class="warn">Large games are fine as .brainrot packs but make big standalone HTML exports.</span>{/if}
    {/snippet}
  </PageHeader>
  {#if missing.length}
    <div class="missing-box" role="alert">
      ⚠ {missing.length} file{missing.length === 1 ? ' is' : 's are'} missing from this browser (e.g. after opening a .json export, which
      has no media). Pick the files again to put them back:
      <button class="small" onclick={findMissing}>🔗 Find missing files…</button>
      <span class="hint">(matched by file name; or use 🔗 Replace file… on each one below)</span>
    </div>
  {/if}
  <div class="row top">
    <button onclick={upload}>＋ Add files…</button>
    <div class="link">
      <LinkField
        autofocus={false}
        onmedia={() => {}}
        hint="Add from a link: the game saves a copy when the site allows it, e.g. https://files.catbox.moe/abc123.mp3"
      />
    </div>
    <button
      class="ghost danger"
      disabled={!unused.length}
      onclick={() => remove(unused.map((m) => m.id), `Deleted ${unused.length} unused file${unused.length === 1 ? '' : 's'}`)}
      title="Delete the files nothing in the game uses (Undo brings them back)">🗑 Delete unused ({unused.length})</button
    >
  </div>
  {#if game.media.length}
    <div class="row picking">
      {#if picked.length}
        <span>{picked.length} selected</span>
        <button class="small ghost danger" onclick={removePicked} title="Delete the selected files (Delete key; Undo brings them back)">🗑 Delete selected ({picked.length})</button>
        <button class="small ghost" onclick={() => (picked = [])} title="Esc">Clear selection</button>
      {:else}
        <span class="hint">
          Click a card to select it, Ctrl+click or Shift+click for more. Double-click a name (or F2) to rename it. Drop a file on a card to
          replace it everywhere it's used.
        </span>
      {/if}
      <span class="spacer"></span>
      <input class="filter" type="search" bind:value={filter} placeholder="🔍 Filter by name or kind" aria-label="Filter files" />
      {#if filter.trim()}<span class="hint">{shown.length} of {game.media.length}</span>{/if}
    </div>
  {/if}

  {#if !game.media.length}
    <div class="empty muted">
      <span class="ic" aria-hidden="true">🖼</span>
      No files yet. Drop pictures, videos, sounds or fonts here, or use ＋ Add files…
    </div>
  {/if}

  <div class="grid">
    {#each shown as m (m.id)}
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
          {m.url ? `🌐 ${linkHost(m.url)}` : formatBytes(m.size)} · <span class:where={!!usedWhere(m)} title={usedWhere(m)}>{n ? `used ${n}×` : 'unused'}</span>
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
          <button
            class="ghost small danger"
            onclick={() => remove([m.id], `Deleted file “${m.name}”${n ? ` (used ${n}×)` : ''}`)}
            aria-label="Delete {m.name}"
            title="Delete this file (Undo brings it back)">🗑 Delete</button
          >
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
    max-width: 1200px;
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
  h3 {
    margin: 24px 0 4px;
    font-size: 16px;
  }
  p {
    margin: 0 0 12px;
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
    /* Wide enough for Replace… and 🗑 Delete side by side. */
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
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
  .filter {
    width: 220px;
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
    font-size: 12px;
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
    font-size: 12px;
  }
  /* "used 3×": the tooltip says where. */
  .where {
    text-decoration: underline dotted;
    text-underline-offset: 2px;
    cursor: help;
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
