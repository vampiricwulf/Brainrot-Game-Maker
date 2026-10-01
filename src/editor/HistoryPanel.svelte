<!--
  🕘 History: every step of the game's undo history, newest first, grouped by minute, with the steps undone on top
  (dimmed) above "● Now". Click a step to go back (or forward) to just after it; Go there shows where it changed.
-->
<script lang="ts">
  import PageHeader from './PageHeader.svelte';
  import { untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { clear, heldMedia, history, jumpTo, maxSteps, redo, undo, type HistoryEntry, type Mark, type Origin } from '../lib/history.svelte';
  import { formatBytes, getBlob } from '../lib/media.svelte';
  import { focusPlace, goTo, placeKey } from '../lib/nav.svelte';
  import InlineAsk from '../play/host/InlineAsk.svelte';

  const ICON: Record<Origin['kind'], string> = {
    opened: '📂',
    new: '📄',
    saved: '💾',
    exported: '⬇',
    played: '▶',
    autosaved: '🕒',
    reopened: '🔄',
    older: '⋯',
    restarted: '⚠',
    cleared: '🧹',
    rescued: '🛟',
  };
  /** Jumps longer than this ask first. */
  const ASK_OVER = 20;

  type Row =
    | { kind: 'step'; key: string; e: HistoryEntry; i: number }
    | { kind: 'now'; key: string }
    | { kind: 'head'; key: string; text: string; day?: boolean }
    | { kind: 'mark'; key: string; m: Mark };

  // (Made once: 500 steps' times are a lot of formatting.)
  const MINUTE = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
  const SECOND = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const DAY = new Intl.DateTimeFormat([], { weekday: 'short', day: 'numeric', month: 'short' });
  const minute = (ts: number) => MINUTE.format(ts);
  const second = (ts: number) => SECOND.format(ts);
  /** '' today, else "Yesterday" or "Mon 28 Sep". */
  function dayOf(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return '';
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    return d.toDateString() === yesterday.toDateString() ? 'Yesterday' : DAY.format(d);
  }

  // Newest first: the undone steps, "● Now", then the steps that are in the game, under a header whenever the minute
  // (or the day) changes. Saves, plays and the like sit between the steps they came between.
  const rows = $derived.by(() => {
    const { entries, index, marks } = history;
    const out: Row[] = [];
    const marksAt = (at: number) =>
      marks
        .map((m, n) => ({ kind: 'mark', key: `m${n}`, m }) as const)
        .filter((r) => r.m.at === at)
        .reverse();
    let shownMinute = '';
    let shownDay = '';
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (i === index - 1 && index < entries.length) out.push({ kind: 'now', key: 'now' });
      if (i < index) {
        const day = dayOf(e.ts);
        if (day && day !== shownDay) out.push({ kind: 'head', key: `d${i}`, text: day, day: true });
        if (minute(e.ts) !== shownMinute || day !== shownDay) out.push({ kind: 'head', key: `h${i}`, text: minute(e.ts) });
        shownDay = day;
        shownMinute = minute(e.ts);
      }
      out.push(...marksAt(i + 1), { kind: 'step', key: e.id, e, i });
    }
    if (index === 0 && entries.length) out.push({ kind: 'now', key: 'now' });
    out.push(...marksAt(0));
    return out;
  });

  // Stored files that are no longer in the game, kept only so their steps can be undone (freed with the steps).
  const kept = $derived.by(() => {
    // (Counted by their bytes: a replaced file's copies of its bytes are those of a file, in the game or not.)
    const inGame = new Set(app.game.media.flatMap((m) => getBlob(m.id) ?? []));
    const blobs = new Set([...heldMedia(history.entries)].flatMap((id) => getBlob(id) ?? []).filter((b) => !inGame.has(b)));
    return { n: blobs.size, bytes: [...blobs].reduce((a, b) => a + b.size, 0) };
  });

  /** A jump is waiting for "Go back 34 steps?" to be answered (asked under the step clicked). */
  let asking = $state<{ n: number; text: string; ok: string } | null>(null);
  let clearing = $state(false);

  /** Go to the game as it was just after entries[n - 1] (0: where the history starts). */
  function pick(n: number): void {
    asking = null;
    const moved = n - history.index;
    if (Math.abs(moved) <= ASK_OVER) return void jumpTo(n);
    const when = minute(n ? history.entries[n - 1].end : history.origin.ts);
    asking =
      moved < 0
        ? { n, text: `Go back ${-moved} steps, to ${when}?`, ok: `Go back ${-moved} steps` }
        : { n, text: `Redo ${moved} steps, up to ${when}?`, ok: `Redo ${moved} steps` };
  }

  // (A question about a jump goes once the history moves some other way: its count would be wrong.)
  $effect(() => {
    void [history.index, history.entries];
    untrack(() => (asking = null));
  });

  /** The question shows in full, under the step clicked (the list can be long). */
  const inView = (el: HTMLElement) => el.scrollIntoView({ block: 'nearest' });

  function jumpAsked(): void {
    if (!asking) return;
    const { n } = asking;
    asking = null;
    jumpTo(n);
  }

  /** Show where a step changed things, as the game is now. */
  function goThere(e: HistoryEntry, applied: boolean): void {
    const place = applied ? e.place : e.undoPlace;
    if (!place) return;
    const to = goTo(place);
    if (to !== place) toast(to ? 'Part of it was deleted since: showing what’s left' : 'It was deleted since');
    // The focus goes there too, not to the page (this list is gone once its tab is).
    if (to) focusPlace(placeKey(to), list);
  }

  let list = $state<HTMLDivElement>();
  /** ↑/↓ move between steps, G shows where the focused one changed things (Enter picks it, as a click). */
  function onkey(e: KeyboardEvent): void {
    const picks = [...(list?.querySelectorAll<HTMLButtonElement>('.pick') ?? [])];
    const at = picks.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      picks[at + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (e.key.toLowerCase() === 'g') {
      e.preventDefault();
      picks[at].parentElement?.querySelector<HTMLButtonElement>('.gobtn')?.click();
    }
  }
</script>

<div class="hist">
  <PageHeader
    title="History"
    sub={history.entries.length
      ? 'Every change to this game, newest first. Click a step to go back to just after it (↷ steps were undone: click one to redo up to it). Go there › shows where it changed. Ctrl+Z / Ctrl+Y step one at a time.'
      : 'No changes yet. Everything you change in this game shows up here, and you can go back to any point. Ctrl+Z undoes, Ctrl+Y redoes.'}
  >
    {#snippet actions()}
      <button onclick={() => undo('list')} disabled={!history.canUndo} title={history.undoTitle}>↶ Undo</button>
      <button onclick={() => redo('list')} disabled={!history.canRedo} title={history.redoTitle}>↷ Redo</button>
      <button class="ghost danger" onclick={() => (clearing = true)} disabled={!history.entries.length} title="Clear every step (asks first)">🗑 Clear history…</button>
    {/snippet}
  </PageHeader>
  {#if clearing}
    <div class="ask">
      <InlineAsk
        text={`Clear all ${history.entries.length} step${history.entries.length === 1 ? '' : 's'}? You can't undo them afterwards.`}
        ok="Clear history"
        danger
        onok={() => ((clearing = false), clear())}
        oncancel={() => (clearing = false)}
      />
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="list" bind:this={list} onkeydown={onkey}>
    {#snippet ask(n: number)}
      {#if asking?.n === n}
        <div class="ask at" use:inView>
          <InlineAsk text={asking.text} ok={asking.ok} onok={jumpAsked} oncancel={() => (asking = null)} />
        </div>
      {/if}
    {/snippet}
    {#each rows as r (r.key)}
      {#if r.kind === 'now'}
        <div class="now"><span>● Now</span></div>
      {:else if r.kind === 'head'}
        <div class="head" class:day={r.day}>{r.text}</div>
      {:else if r.kind === 'mark'}
        <div class="mark" title={second(r.m.ts)}>{ICON[r.m.kind]} {r.m.label}</div>
      {:else}
        {@const e = r.e}
        {@const applied = r.i < history.index}
        {@const current = r.i === history.index - 1}
        <div class="hr" class:undone={!applied} class:current>
          <!-- (One Tab stop for the list, on the step the game is at: ↑/↓ move between them.) -->
          <button
            class="pick"
            tabindex={current ? 0 : -1}
            onclick={() => pick(r.i + 1)}
            aria-current={current ? 'step' : undefined}
            title="{e.label}{e.where ? `\n${e.where}` : ''}\n{second(e.ts)} · {applied ? 'Go back to just after this step' : 'Redo up to this step'}"
          >
            <span class="ic" aria-hidden="true">{applied ? e.icon : '↷'}</span>
            <span class="lb">{e.label}{#if e.during}<span class="play" title="Made during a game">▶</span>{/if}</span>
            <span class="wh muted">{e.where}</span>
          </button>
          <span class="go">
            {#if current}<span class="pill">Now</span>{/if}
            {#if applied ? e.place : e.undoPlace}
              <button class="gobtn ghost small" tabindex="-1" onclick={() => goThere(e, applied)}>Go there ›</button>
            {/if}
          </span>
        </div>
        {@render ask(r.i + 1)}
      {/if}
    {/each}
    <div class="hr origin" class:current={history.index === 0}>
      <button class="pick" tabindex={history.index === 0 ? 0 : -1} onclick={() => pick(0)} aria-current={history.index === 0 ? 'step' : undefined} title="Undo everything back to here">
        <span class="ic" aria-hidden="true">◌</span>
        <span class="lb">{ICON[history.origin.kind]} {history.origin.label}</span>
        <span class="wh muted">{history.entries.length ? 'Undo everything back to here' : ''}</span>
      </button>
      <span class="go">
        {#if history.index === 0 && history.entries.length}<span class="pill">Now</span>{/if}
        <span class="muted small">{minute(history.origin.ts)}</span>
      </span>
    </div>
    {@render ask(0)}
  </div>
  <p class="foot muted">
    {history.trimmed ? `Older steps weren't kept (the history keeps the last ${maxSteps()} steps).` : `The history keeps the last ${maxSteps()} steps and survives a reload.`}
    {#if kept.n}
      {kept.n === 1 ? 'A removed file' : `${kept.n} removed files`} ({formatBytes(kept.bytes)}) {kept.n === 1 ? 'is' : 'are'} kept so
      {kept.n === 1 ? 'its step' : 'their steps'} can be undone.
    {/if}
  </p>
</div>

<style>
  .hist {
    max-width: 1200px;
  }
  .ask {
    margin: 0 0 10px;
  }
  .ask.at {
    margin: 2px 0 6px 46px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .head {
    margin: 10px 0 2px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .head.day {
    margin-top: 16px;
    color: var(--text);
  }
  .hr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px;
    align-items: center;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .hr:hover,
  .hr:focus-within {
    background: var(--panel-2);
    border-color: var(--border);
  }
  .pick {
    display: grid;
    grid-template-columns: 26px minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    text-align: left;
    background: transparent;
    border: none;
  }
  .ic {
    text-align: center;
  }
  .lb,
  .wh {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wh {
    font-size: 12px;
  }
  .play {
    margin-left: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .go {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
    padding-right: 10px;
    font-size: 12px;
  }
  .gobtn {
    visibility: hidden;
    /* Lighter than the accent: 4.5:1 on a highlighted row too. */
    color: color-mix(in srgb, var(--accent) 65%, #fff);
    border: none;
  }
  .hr:hover .gobtn,
  .hr:focus-within .gobtn,
  .hr.current .gobtn {
    visibility: visible;
  }
  .hr.undone .pick {
    opacity: 0.55;
    font-style: italic;
  }
  .hr.current {
    background: rgba(79, 124, 255, 0.15);
    border-color: var(--accent);
  }
  .pill {
    padding: 0 8px;
    border-radius: 10px;
    background: var(--accent-fill);
    color: #fff;
    font-size: 12px;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
    font-size: 12px;
    color: var(--accent);
  }
  .now::before,
  .now::after {
    content: '';
    flex: 1;
    border-top: 1px dashed var(--accent);
  }
  .mark {
    padding: 2px 10px 2px 46px;
    font-size: 12px;
    color: var(--good);
  }
  .origin .pick {
    color: var(--muted);
  }
  .foot {
    margin-top: 12px;
    font-size: 12px;
  }
</style>
