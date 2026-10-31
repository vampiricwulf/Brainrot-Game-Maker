<!--
  Open…, always this one window (Ctrl+O, the first screen's 📂 Open a game…, Game over › ▶ Next game…): Recent games (the
  games New and Open… replaced lately, kept in this browser or on this PC with their undo history), in the desktop app
  Your saves (BrainrotSaves: saves and play-only web pages, newest first), and Browse for a game file… (a .brainrot, a
  .json, a play-only web page's .html; in the desktop app a .bak backup too). A game file dropped on the editor opens
  too. The rows: ↑ / ↓ (Home / End) between them, Enter opens, Delete on a recent game deletes it (asks first), a
  right-click or Shift+F10 gives its menu.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { focusRescue } from '../lib/focusrescue';
  import { modal } from '../lib/modal';
  import type { RecentEntry } from '../lib/recent';
  import { keptHere } from '../lib/platform';
  import { oneShot } from '../lib/oneshot';
  import { keyMenu, menuItem, menuOf, showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import { toast } from '../lib/app.svelte';
  import { formatBytes } from '../lib/media.svelte';
  import { openDataFolder, type SaveEntry } from '../lib/desktop.svelte';
  import { nextRow, savesWhere } from '../lib/openlist';

  let {
    recent,
    saves = [],
    desktop = false,
    onreopen,
    onforget,
    onpick,
    onbrowse,
    onclose,
  }: {
    recent: RecentEntry[];
    /** Desktop app: the saves in BrainrotSaves, newest first. */
    saves?: SaveEntry[];
    /** The desktop app (it has BrainrotSaves). */
    desktop?: boolean;
    onreopen: (e: RecentEntry) => void;
    onforget: (e: RecentEntry) => void;
    onpick: (s: SaveEntry) => void;
    onbrowse: () => void;
    onclose: () => void;
  } = $props();

  let lists = $state<HTMLElement>();
  let browseBtn = $state<HTMLButtonElement>();
  // The keys on the first game listed (Enter opens it), else on Browse for a game file….
  onMount(() => (lists?.querySelector<HTMLElement>('[data-row]') ?? browseBtn)?.focus());
  const when = (ms: number) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
  /** An earlier version of a game also listed (newer) above it: two kept copies of one game are told apart. */
  const earlier = (e: RecentEntry) => recent.some((x) => x !== e && x.gameId === e.gameId && x.closedAt > e.closedAt);
  /** A play-only web page (an exported .html): Open… edits the game inside it. */
  const exported = (s: SaveEntry) => /\.html?$/i.test(s.name);
  const nothing = $derived(!recent.length && !saves.length);

  async function showFolder(s?: SaveEntry): Promise<void> {
    // Saves go to Documents when the app's folder can't be written: the newest save's folder, or this one's.
    const err = await openDataFolder((s ?? saves[0])?.place === 'documents' ? 'saves-documents' : 'saves');
    if (err) toast(err);
  }

  const recentMenu = (e: RecentEntry): MenuEntry[] =>
    menuOf({
      heading: e.title,
      open: [{ label: '▶ Open', keys: 'Enter', onclick: () => onreopen(e) }],
      delete: menuItem.delete('from Recent games…', () => onforget(e)),
    });
  const saveMenu = (s: SaveEntry): MenuEntry[] =>
    menuOf({
      heading: s.name,
      open: [{ label: '▶ Open', keys: 'Enter', onclick: () => onpick(s) }],
      extras: [{ label: '📁 Show in folder', onclick: () => void showFolder(s) }],
    });

  /** The rows' keys: the arrows go from row to row across both lists, Delete deletes a recent game, Shift+F10 its menu. */
  function rowKey(e: KeyboardEvent, items: () => MenuEntry[], forget?: () => void): void {
    if (keyMenu(e, items())) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key === 'Delete' && forget) {
      e.preventDefault();
      return forget();
    }
    const rows = [...(lists?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
    const to = nextRow(e.key, rows.indexOf(e.currentTarget as HTMLElement), rows.length);
    if (to === null) return;
    e.preventDefault();
    rows[to].focus();
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <!-- Esc closes it when it's the window on top (Delete's question over it takes Esc first). -->
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="open-heading" use:modal={{ esc: onclose }} use:focusRescue data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="open-heading">📂 Open a game</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="lists" bind:this={lists}>
      <h3 class="sec" id="open-recent">Recent games</h3>
      <p class="hint">Games you had open here lately, with their undo history. Kept {keptHere()} only: 💾 Save makes a file that lasts.</p>
      {#if recent.length}
        <div class="list" role="group" aria-labelledby="open-recent">
          {#each recent as e (e.key)}
            <div class="row" oncontextmenu={(ev) => showMenu(ev, recentMenu(e))} role="presentation">
              <button class="pick" data-row use:oneShot onclick={() => onreopen(e)} onkeydown={(ev) => rowKey(ev, () => recentMenu(e), () => onforget(e))}>
                <b>{e.title}</b>
                <span class="hint"
                  >{earlier(e) ? 'earlier version · ' : ''}{e.rounds} round{e.rounds === 1 ? '' : 's'} · kept {when(e.closedAt)}</span
                >
              </button>
              <!-- (Apart, at the row's far end: it asks first, then the kept copy and its files go for good.) -->
              <button
                class="ghost small danger del"
                onclick={() => onforget(e)}
                aria-label="Delete “{e.title}” from Recent games"
                title="Delete from Recent games: stop keeping this game {keptHere()} (asks first: its files are cleaned up) · Delete">🗑</button
              >
            </div>
          {/each}
        </div>
      {:else}
        <p class="none muted">None yet: a game New or Open… replaces is kept here.</p>
      {/if}
      {#if desktop}
        <div class="sec-row">
          <h3 class="sec" id="open-saves">Your saves (BrainrotSaves)</h3>
          <button class="small ghost" onclick={() => showFolder()} title="Show the BrainrotSaves folder">📂 Saves folder</button>
        </div>
        {#if saves.length}
          <p class="hint">Your saves and play-only web pages, newest first ({savesWhere(saves.map((s) => s.place))}).</p>
          <div class="list" role="group" aria-labelledby="open-saves">
            {#each saves as s (s.place + s.name)}
              <button
                class="save"
                data-row
                use:oneShot
                onclick={() => onpick(s)}
                onkeydown={(ev) => rowKey(ev, () => saveMenu(s))}
                oncontextmenu={(ev) => showMenu(ev, saveMenu(s))}
              >
                <b>{s.name}</b>
                <span class="hint"
                  >{exported(s) ? 'Play-only web page · ' : ''}{when(s.modified)} · {formatBytes(s.size)}{s.place === 'documents' ? ' · in Documents' : ''}</span
                >
              </button>
            {/each}
          </div>
        {:else}
          <p class="none muted">None yet: 💾 Save puts your games here.</p>
        {/if}
      {/if}
    </div>
    <div class="modal-foot">
      <button class="ghost" onclick={onclose}>Cancel</button>
      <span class="spacer"></span>
      <button
        class:primary={nothing}
        bind:this={browseBtn}
        onclick={onbrowse}
        title="A game you saved or were sent: a .brainrot, a .json or a play-only web page (.html){desktop ? ', or an older version Save kept (Game.brainrot.bak)' : ''}"
        >Browse for a game file…</button
      >
      <span class="hint drop">or drop a game file anywhere on the editor</span>
    </div>
  </div>
</div>

<style>
  .lists {
    overflow: auto;
    max-height: 64vh;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sec {
    margin: 12px 0 2px;
    font-size: 1rem;
  }
  .sec-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .none {
    margin: 2px 0;
    font-size: 13px;
  }
  .pick {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
  }
  /* Apart from the game's own button, at the row's far end. */
  .del {
    margin-left: 4px;
    flex: none;
  }
  /* A long name (an autosave's) wraps, and its date and size go under it rather than out of the button. */
  .save {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 0;
    text-align: left;
  }
  .save > b {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .save > .hint {
    margin-left: auto;
  }
  .drop {
    margin: 0;
  }
</style>
