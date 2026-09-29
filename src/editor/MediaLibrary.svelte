<!-- Every file in the game, with usage counts and cleanup (spec §5.5), and everything that plays from the internet. -->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { ACCEPT, addMediaFile, canPlay, formatBytes, imgFallback, mediaUrls, missingMedia, relinkMissing, replaceMediaFile } from '../lib/media.svelte';
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

  function remove(ids: string[]): void {
    game.media = game.media.filter((m) => !ids.includes(m.id));
  }

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

  /** Put a new file in place of this one (every use of it follows). */
  async function replace(m: MediaRef): Promise<void> {
    const [f] = await pickFiles(ACCEPT[m.kind], false);
    if (!f) return;
    try {
      await replaceMediaFile(game, m.id, f);
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

  async function upload(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = `${ACCEPT.any},${ACCEPT.font}`;
    input.onchange = async () => {
      for (const f of Array.from(input.files ?? [])) {
        try {
          const ref = await addMediaFile(game, f);
          if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime)) toast(`⚠ This browser may not play "${ref.name}"`, 6000);
        } catch (e) {
          toast((e as Error).message, 5000);
        }
      }
    };
    input.click();
  }
</script>

<h2>Media</h2>
<p class="muted">
  Files stored with this game: {stored.length} · {formatBytes(total)}.
  {#if links}🌐 {links} more play{links === 1 ? 's' : ''} from the internet.{/if}
  {#if total > 100 * 1024 ** 2}<span class="warn">Large games are fine as .jbr packs but make big standalone HTML exports.</span>{/if}
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
  <button disabled={!unused.length} onclick={() => confirm(`Remove ${unused.length} unused file(s)?`) && remove(unused.map((m) => m.id))}>
    🧹 Remove unused ({unused.length})
  </button>
</div>

<div class="grid">
  {#each game.media as m (m.id)}
    {@const n = usage.get(m.id) ?? 0}
    <div class="card" class:unused={!n}>
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
      <div class="nm" title={m.name}>{m.name}</div>
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
        <button class="ghost small" onclick={() => (!n || confirm(`"${m.name}" is used ${n}×. Remove it anyway?`)) && remove([m.id])}>Remove</button>
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

<style>
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
