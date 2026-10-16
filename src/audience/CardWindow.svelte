<!--
  🪟 The card window (#cards, partner-clues spec §13.6): one player's 🤫 cards, full size, the host's own files
  included, for that player alone (the host shares just this window with them, turns the laptop round, or puts it on a
  second screen). It shows only what the host page that opened it posts to it ('private-…' messages, never the game),
  and listens to nothing else: no BroadcastChannel, no other window. "Nothing private right now" between cards. Cards
  and files are kept in memory only, and dropped when they go.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { bigWords } from '../lib/buzzproto';
  import type { CardWinMsg, CardWinReply, WindowCard, WindowItem } from '../lib/cardwindow';
  import { playerFor, youtubeId, youtubePlayerUrl, youtubeStart } from '../lib/links';
  import { syncTarget } from '../lib/sync.svelte';

  let name = $state('');
  let cards = $state<WindowCard[]>([]);
  let status = $state<'waiting' | 'connected' | 'no-host' | 'host-left'>('waiting');
  /** The host's files, as blob: addresses here, by media id. */
  let urls = $state<Record<string, string>>({});

  /** Files no card shows any more go (their addresses are let go). */
  function keepOnly(ids: Set<string>): void {
    const next: Record<string, string> = {};
    for (const [id, u] of Object.entries(urls)) {
      if (ids.has(id)) next[id] = u;
      else URL.revokeObjectURL(u);
    }
    urls = next;
  }
  const usedFiles = (list: WindowCard[]) => new Set(list.flatMap((c) => c.media.flatMap((m) => ('file' in m ? [m.file] : []))));

  onMount(() => {
    const host = window.opener as Window | null;
    if (!host) {
      status = 'no-host';
      return;
    }
    const onmsg = (e: MessageEvent<CardWinMsg>) => {
      const m = e.data;
      // The host page's goodbye, sent as it unloads (a reload, or closed), reaches this window once that page has gone:
      // it then comes from no window at all (source null). Taken from there too: it only lets go of the cards.
      if (e.source !== host && !(e.source === null && m?.type === 'private-bye')) return;
      switch (m?.type) {
        case 'private-cards':
          name = m.name;
          cards = m.cards;
          status = 'connected';
          keepOnly(usedFiles(m.cards));
          break;
        case 'private-files':
          for (const it of m.items) {
            if (urls[it.id]) URL.revokeObjectURL(urls[it.id]);
            urls = { ...urls, [it.id]: URL.createObjectURL(it.blob) };
          }
          break;
        case 'private-bye':
          cards = [];
          keepOnly(new Set());
          status = 'host-left';
          break;
        case 'private-close':
          cards = [];
          keepOnly(new Set());
          status = 'host-left';
          window.close();
          break;
      }
    };
    window.addEventListener('message', onmsg);
    try {
      host.postMessage({ type: 'private-hello' } satisfies CardWinReply, syncTarget());
    } catch {
      status = 'no-host';
    }
    return () => {
      window.removeEventListener('message', onmsg);
      keepOnly(new Set());
    };
  });

  $effect(() => {
    document.title = name ? `🤫 For ${name} only` : '🤫 Card window';
  });

  const ICON = { image: '🖼', video: '🎞', audio: '🔊' } as const;
  const WORD = { image: 'picture', video: 'video', audio: 'sound' } as const;
  /** Where a picture, video or sound plays from: the host's file, or its link. */
  const src = (m: WindowItem): string | undefined => ('file' in m ? urls[m.file] : 'url' in m ? m.url : undefined);
  /** An embed's player: YouTube's no-cookie player, Drive's preview, Streamable's (as the app frames them on a slide). */
  function player(m: Extract<WindowItem, { kind: 'embed' }>): string | null {
    if (m.site === 'youtube') {
      const id = youtubeId(m.url);
      return id ? youtubePlayerUrl(id, { start: m.start ?? youtubeStart(m.url), end: m.end }) : null;
    }
    return playerFor(m.site, m.url)?.src ?? null;
  }
  /** A video or sound starts where the card says. */
  function startAt(el: HTMLMediaElement, start: number | undefined): void {
    if (start && start > 0) el.addEventListener('loadedmetadata', () => (el.currentTime = start), { once: true });
  }
</script>

<main class="cw">
  {#if status === 'no-host'}
    <p class="note">Open this from the host’s panel: 🪟 Card window.</p>
  {:else if status === 'host-left'}
    <p class="note">The host’s page closed: open the card window again from the host’s panel.</p>
  {:else if status === 'waiting'}
    <p class="note">Waiting for the host…</p>
  {:else}
    <div class="head">🤫 For {name} only</div>
    {#each cards as c (c.id)}
      <section class="card" aria-label="Card">
        {#if !c.open}<div class="closed">The answer’s on screen</div>{/if}
        {#if c.role}<div class="role">You’re the {c.role}</div>{/if}
        {#if c.hint}<div class="hint-line">{c.hint}</div>{/if}
        {#if c.title}<div class="title" dir="auto" class:huge={bigWords(c.title)}>{c.title}</div>{/if}
        {#if c.text}<div class="words" dir="auto" class:huge={!c.title && bigWords(c.text)}>{c.text}</div>{/if}
        {#each c.media as m, i (i)}
          {#if m.kind === 'embed'}
            {@const p = player(m)}
            {#if p}
              <iframe
                src={p}
                title="Video"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowfullscreen
                sandbox="allow-scripts allow-same-origin allow-presentation"
              ></iframe>
            {:else}
              <div class="box">🎞 The host will show you this video</div>
            {/if}
          {:else if 'missing' in m}
            <div class="box">{ICON[m.kind]} The host will show you this {WORD[m.kind]}</div>
          {:else}
            {@const s = src(m)}
            {#if !s}
              <div class="box">{ICON[m.kind]} {WORD[m.kind].charAt(0).toUpperCase() + WORD[m.kind].slice(1)} coming…</div>
            {:else if m.kind === 'image'}
              <img src={s} alt={m.name ?? 'Picture'} referrerpolicy="no-referrer" />
            {:else if m.kind === 'video'}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video src={s} controls playsinline aria-label={m.name ?? 'Video'} use:startAt={m.start}></video>
            {:else}
              <audio src={s} controls aria-label={m.name ?? 'Sound'} use:startAt={m.start}></audio>
            {/if}
          {/if}
        {/each}
      </section>
    {:else}
      <p class="note" data-nothing>Nothing private right now</p>
    {/each}
  {/if}
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: #101014;
  }
  .cw {
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    color: #f2f2f2;
    font-family: var(--font, system-ui, sans-serif);
  }
  .head {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    color: #9fd8b5;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border-radius: 16px;
    background: #1b1b22;
  }
  .closed {
    text-align: center;
    color: #f5c46b;
    font-weight: 700;
  }
  .role {
    font-size: 22px;
    font-weight: 800;
    text-align: center;
  }
  .hint-line {
    font-size: 18px;
    color: #c9c9d1;
    text-align: center;
  }
  .title {
    font-size: 40px;
    font-weight: 900;
    line-height: 1.05;
    text-align: center;
  }
  .words {
    font-size: 26px;
    white-space: pre-wrap;
    text-align: center;
  }
  .huge {
    font-size: min(14vw, 120px);
  }
  img,
  video,
  iframe {
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
    border: 0;
    border-radius: 10px;
    background: #000;
  }
  iframe {
    aspect-ratio: 16 / 9;
    height: auto;
  }
  audio {
    width: 100%;
  }
  .box {
    padding: 14px;
    border-radius: 10px;
    background: #26262e;
    text-align: center;
  }
  .note {
    margin: auto;
    font-size: 22px;
    color: #c9c9d1;
    text-align: center;
  }
</style>
