<!--
  ⌨ Keyboard shortcuts: one window for the editor's keys and the host's during the game (spec §6.8), a switch at its
  top between the two, and a filter for both (it also finds a renamed button by its old name). The editor's ? opens it
  on Editor; ? and ❔ Help on the game screen open it on During the game, the round's keys first (in a single window,
  over the host panel: viewers see that window, so the stage stays clear). Each part starts with what moved in this
  version (open while it's new on this computer, folded after: see whatmoved.svelte.ts). There, what the check before
  going on was told not to ask about this game is listed first, each with Ask again. Its foot has the hosting guide and
  💡 Show all tips again.
-->
<script lang="ts">
  import { modal } from '../lib/modal';
  import { app } from '../lib/app.svelte';
  import { filterKeys, rowCount } from '../lib/keylist';
  import { HOSTING_GUIDE, openSite } from '../lib/sitelinks';
  import { inTauri } from '../lib/platform';
  import { showTipsAgain } from '../lib/tips';
  import { EDITOR_KEYS } from '../editor/editorkeys';
  import { BEFORE, hostKeys, silencedRows, type Silenced } from './hostkeys';
  import { markMovedSeen, movedNew, renames, WHAT_MOVED, type MovedPart } from './whatmoved.svelte';
  import { untrack } from 'svelte';

  type Part = 'editor' | 'game';
  let {
    onclose,
    from = 'play',
    start,
    area = null,
    first,
    silenced = [],
    onaskagain,
  }: {
    onclose: () => void;
    /** Where it was opened: it's named for it, and starts on that part (the editor's, or the game's). */
    from?: 'editor' | 'play';
    /** The part it starts on, if not that one (the editor's 🎮 Keys during the game). */
    start?: 'editor' | 'game';
    /** Single window: the host panel's box, where the list stays (viewers see this window: the stage stays clear). */
    area?: { top: number; left: number; width: number; height: number } | null;
    /** The group shown first: the round being played's (or the pre-game screen's, the only place it shows). */
    first?: string;
    /** During the game: what the check doesn't ask about this game ("Don't ask about … again this game"). */
    silenced?: readonly Silenced[];
    /** Ask again: the check asks about that kind again. */
    onaskagain?: (kind: Silenced) => void;
  } = $props();
  const quiet = $derived(onaskagain ? silencedRows(silenced) : []);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  // (Opened on one part, the window keeps to the one picked after.)
  // svelte-ignore state_referenced_locally
  let part = $state<Part>(start ?? (from === 'editor' ? 'editor' : 'game'));
  const PARTS: Record<Part, string> = { editor: 'Editor', game: 'During the game' };

  /** The game's keys: the pre-game screen's only there; the group asked for first, then the rest. */
  const gameKeys = $derived.by(() => {
    const groups = hostKeys(app.playerOnly).filter((g) => g.title !== BEFORE || first === BEFORE);
    return [...groups.filter((g) => g.title === first), ...groups.filter((g) => g.title !== first)];
  });
  let filter = $state('');
  const lists = $derived({ editor: filterKeys(EDITOR_KEYS, filter, mac), game: filterKeys(gameKeys, filter, mac) });
  const shown = $derived(lists[part]);
  const other: Part = $derived(part === 'editor' ? 'game' : 'editor');
  /** Filtering: how many rows match in the other part (a key looked up in the wrong one is a click away). */
  const elsewhere = $derived(filter.trim() ? rowCount(lists[other]) : 0);

  /** What moved in this version, in the part shown: open while it's new on this computer (as the window opened). */
  const moved = $derived(WHAT_MOVED[part]);
  const movedOpen = $state<Record<MovedPart, boolean>>(untrack(() => ({ game: movedNew('game'), editor: movedNew('editor') })));
  // (Shown: ❔ Help's dot goes.)
  $effect(() => {
    if (moved.length) markMovedSeen(part);
  });

  let tipsShown = $state(false);
  // In a browser in one window, the guide's new tab would be what the capture shows.
  const guideTitle = $derived(`The guide on GitHub: hosting, phone buzzers, 🤫 cards, 🎭 deals, teams${inTauri() ? ' (in your browser)' : area ? ' (a new tab: in a single window viewers see it while it’s in front)' : ''}`);
</script>

<svelte:window
  onkeydown={(e) => {
    // '?' typed into a text field (the filter too) is just a question mark. Esc in the filter clears it first.
    const typing = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]');
    if ((e.key === 'Escape' && !e.defaultPrevented) || (e.key === '?' && !typing)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      onclose();
    }
  }}
/>

<div
  class="modal-backdrop"
  class:in-panel={!!area}
  style:top={area ? `${area.top}px` : undefined}
  style:left={area ? `${area.left}px` : undefined}
  style:width={area ? `${area.width}px` : undefined}
  style:height={area ? `${area.height}px` : undefined}
  onclick={(e) => e.target === e.currentTarget && onclose()}
  role="presentation"
>
  <div class="modal lg" role="dialog" aria-modal="true" aria-label={from === 'editor' ? 'Editor keyboard shortcuts' : 'Keyboard shortcuts'} use:modal={{ enter: onclose }} data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title">⌨ Keyboard shortcuts</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="row bar">
      <!-- Both parts always showing, the one shown filled in (the color picker's Hex | RGB). -->
      <div class="parts" role="group" aria-label="Keys for">
        {#each ['editor', 'game'] as const as p (p)}
          <button class="small" class:on={part === p} aria-pressed={part === p} onclick={() => (part = p)}>{PARTS[p]}</button>
        {/each}
      </div>
      <span class="spacer"></span>
      <input
        class="filter"
        type="search"
        bind:value={filter}
        placeholder="🔍 Filter: a key or a word"
        aria-label="Filter shortcuts"
        onkeydown={(e) => e.key === 'Escape' && filter && (e.preventDefault(), (filter = ''))}
      />
    </div>
    {#if !shown.length || elsewhere}
      <p class="muted found">
        {#if !shown.length}Nothing matches “{filter}” here.{/if}
        {#if elsewhere}<button class="small ghost" onclick={() => (part = other)}>{elsewhere} in {PARTS[other]} ▸</button>{/if}
      </p>
    {/if}
    {#if moved.length && !filter.trim()}
      <!-- For a host who knows the old places: where things went, and the new names (the filter finds the old ones). -->
      <details class="moved" data-what-moved bind:open={movedOpen[part]}>
        <summary>🆕 What moved in this version <span class="muted">· {moved.length} changes, and new names</span></summary>
        <ul>
          {#each moved as line (line)}<li>{line}</li>{/each}
        </ul>
        {#if part === 'game'}<p class="muted renamed"><b>Renamed:</b> {renames().join(' · ')}</p>{/if}
      </details>
    {/if}
    {#if part === 'game' && quiet.length}
      <!-- What's ticked off this game (the check's "Don't ask about … again this game"), each a click from asking again. -->
      <section class="quiet" data-quiet aria-labelledby="keys-quiet">
        <h3 id="keys-quiet">Not asked about this game</h3>
        <p class="muted">The check before going on doesn’t ask about these any more (you ticked “Don’t ask … again this game”):</p>
        <ul>
          {#each quiet as q (q.kind)}
            <li>{q.words} <button class="small ghost" aria-label={q.again} onclick={() => onaskagain?.(q.kind)}>Ask again</button></li>
          {/each}
        </ul>
      </section>
    {/if}
    <div class="groups">
      {#each shown as g (g.title)}
        <section>
          <h3>{g.title}</h3>
          <table>
            <tbody>
              {#each g.rows as r, i (i)}
                <tr
                  ><td><kbd>{r.keys}</kbd></td><td
                    >{r.words}{#if r.was}{' '}<span class="muted was">(was “{r.was}”)</span>{/if}</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    </div>
    {#if part === 'game'}<p class="muted">The keys work in the audience window too (F there makes it full-screen).</p>{/if}
    <div class="modal-foot">
      <button class="ghost" onclick={() => openSite(HOSTING_GUIDE)} title={guideTitle}>📖 How to host ↗</button>
      <button
        class="ghost"
        onclick={() => (showTipsAgain(), (tipsShown = true))}
        disabled={tipsShown}
        title="The editor’s 💡 Tips open again, and the game screen’s first-time notes show again (🙈 Hide’s, the Final’s how-to)"
        >{tipsShown ? '✓ Tips will show again' : '💡 Show all tips again'}</button
      >
      <span class="spacer"></span>
      <button class="primary" onclick={onclose}>Done</button>
    </div>
  </div>
</div>

<style>
  /* What moved in this version: a quiet fold above the keys. */
  .moved {
    margin: 4px 0 8px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .moved > summary {
    cursor: pointer;
    font-weight: 600;
  }
  .moved ul {
    margin: 6px 0;
    padding-left: 20px;
  }
  .moved li + li {
    margin-top: 3px;
  }
  .renamed {
    margin: 4px 0 0;
  }
  /* Single window: over the host panel only, never the stage viewers see. */
  .modal-backdrop.in-panel {
    inset: auto;
    padding: 8px;
  }
  .in-panel .modal {
    height: 100%;
  }
  .bar {
    flex-wrap: nowrap;
  }
  /* Editor | During the game: both showing, the one shown filled in. */
  .parts {
    display: flex;
    flex-shrink: 0;
  }
  .parts button {
    padding: 4px 12px;
    border-radius: 0;
  }
  .parts button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .parts button:last-child {
    margin-left: -1px;
    border-radius: 0 6px 6px 0;
  }
  .parts button:focus-visible {
    position: relative;
  }
  .filter {
    width: 220px;
    min-width: 0;
  }
  .found {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .groups {
    columns: 2 440px;
    column-gap: 28px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 12px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td {
    padding: 3px 10px 3px 0;
    vertical-align: top;
    font-size: 13px;
  }
  td:first-child {
    width: 38%;
  }
  kbd {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-family: inherit;
    font-size: 12px;
  }
  .was {
    font-size: 12px;
  }
  .quiet {
    margin-bottom: 12px;
  }
  .quiet p {
    margin: 0 0 4px;
    font-size: 13px;
  }
  .quiet ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 13px;
  }
</style>
