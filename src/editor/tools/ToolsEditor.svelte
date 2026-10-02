<!--
  Editor tab: saved wheels and dice (spec §5.6). Their order is the order everywhere they're picked (Move by, wheel
  and dice tiles, the host's menus): drag them in the list, or right-click for more.
-->
<script lang="ts">
  import PageHeader from '../PageHeader.svelte';
  import { tick } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { take } from '../../lib/nav.svelte';
  import { step } from '../../lib/history.svelte';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { copyActions, copySegment, moveTo } from '../../lib/listedit';
  import { dropMenu, showMenu } from '../../lib/menustate.svelte';
  import { uniqueName } from '../../lib/roundcopy';
  import { WHEEL_TEMPLATES, wheelFromTemplate, type WheelTemplate } from '../../lib/wheeltemplates';
  import { newId, type DicePreset, type WheelPreset } from '../../lib/model';
  import { newDice, newWheel } from '../../lib/tools';
  import WheelEditor from './WheelEditor.svelte';
  import DiceEditor from './DiceEditor.svelte';

  const game = $derived(app.game);
  let sel = $state<string | null>(null);
  // An undo or redo here opens the wheel or dice it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab === 'tools' && (place.wheel || place.dice)) sel = place.wheel ?? place.dice ?? null;
  });
  const wheel = $derived(game.wheels.find((w) => w.id === sel));
  const dice = $derived(game.dice.find((d) => d.id === sel));

  type Tool = WheelPreset | DicePreset;
  type Kind = 'wheel' | 'dice';
  const listOf = (kind: Kind): Tool[] => (kind === 'wheel' ? game.wheels : game.dice);

  /** Put the focus back on a wheel's or dice's button in the list (after it moved, or was renamed). */
  function focusItem(id: string): void {
    void tick().then(() => document.querySelector<HTMLElement>(`[data-tool="${id}"]`)?.focus());
  }

  /** A copy right after it, with its own slices (and their buttons) or dice. */
  function dup(kind: Kind, item: Tool): void {
    const list = listOf(kind);
    const copy = JSON.parse(JSON.stringify(item)) as Tool;
    copy.id = newId();
    copy.name += ' (copy)';
    if ('segments' in copy) copy.segments = copy.segments.map(copySegment);
    else
      for (const d of copy.dice) {
        d.id = newId();
        for (const f of d.customFaces ?? []) if (f.actions) f.actions = copyActions(f.actions);
      }
    step(`Duplicated ${kind} “${item.name}”`, () => list.splice(list.indexOf(item) + 1, 0, copy));
    sel = copy.id;
  }

  // Deleting is done at once: the note at the bottom offers Undo.
  function remove(kind: Kind, item: Tool): void {
    step(
      `Deleted ${kind} “${item.name}”`,
      () => {
        if (kind === 'wheel') game.wheels = game.wheels.filter((w) => w.id !== item.id);
        else game.dice = game.dice.filter((d) => d.id !== item.id);
      },
      { notify: true },
    );
    if (sel === item.id) sel = null;
  }

  function move(kind: Kind, from: number, to: number): void {
    const list = listOf(kind);
    const item = list[from];
    if (!item || to < 0 || to >= list.length || to === from) return;
    step(`Moved ${kind} “${item.name}” ${to < from ? 'up' : 'down'}`, () => moveTo(list, from, to));
    focusItem(item.id);
  }

  /** The wheel or dice being renamed in place. */
  let renaming = $state<string | null>(null);
  function rename(kind: Kind, item: Tool, name: string): void {
    renaming = null;
    const to = name.trim();
    if (to && to !== item.name) step(`Renamed ${kind} “${item.name}” to “${to}”`, () => (item.name = to));
    focusItem(item.id);
  }
  const focusAll = (el: HTMLInputElement) => {
    el.focus();
    el.select();
  };

  function menu(e: MouseEvent, kind: Kind, item: Tool, i: number): void {
    const n = listOf(kind).length;
    showMenu(e, [
      { heading: item.name },
      { label: '✎ Rename', onclick: () => (renaming = item.id), keys: 'F2' },
      { label: '⧉ Duplicate', onclick: () => dup(kind, item), keys: 'Ctrl+D' },
      { label: '▲ Move up', onclick: () => move(kind, i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => move(kind, i, i + 1), disabled: i === n - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: `🗑 Delete ${kind}`, danger: true, onclick: () => remove(kind, item), keys: 'Delete' },
    ]);
  }

  /** On a wheel or dice in the list: F2 renames, Ctrl+D duplicates, Delete / Backspace deletes, Alt+↑/↓ moves it. */
  function itemKey(e: KeyboardEvent, kind: Kind, item: Tool, i: number): void {
    if (e.repeat && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.altKey) remove(kind, item);
    else if (e.key === 'F2') renaming = item.id;
    else if (mod && !e.altKey && e.key.toLowerCase() === 'd') dup(kind, item);
    else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) move(kind, i, i + (e.key === 'ArrowUp' ? -1 : 1));
    else return;
    e.preventDefault();
  }

  const drags: Record<Kind, DragOrder> = { wheel: new DragOrder(), dice: new DragOrder() };

  function add(kind: Kind): void {
    const item = kind === 'wheel' ? newWheel(`Wheel ${game.wheels.length + 1}`) : newDice(`Dice ${game.dice.length + 1}`);
    if (kind === 'wheel') game.wheels.push(item as WheelPreset);
    else game.dice.push(item as DicePreset);
    sel = item.id;
  }

  /** A built-in wheel picked in the list (shown so they're found; nothing to set up). */
  let builtin = $state<'players' | 'categories' | null>(null);
  $effect(() => {
    if (sel) builtin = null;
  });

  /** A ready-made wheel, added to the game (named after it, numbered when the game has one by that name). */
  function addTemplate(t: WheelTemplate): void {
    const w = wheelFromTemplate(t, game.settings.currencySymbol, uniqueName(game.wheels.map((x) => x.name), t.name, false));
    step(`Added wheel “${w.name}”`, () => game.wheels.push(w));
    sel = w.id;
    focusItem(w.id);
  }
  function templateMenu(e: MouseEvent): void {
    dropMenu(e, [
      { heading: 'Ready-made wheels (change anything after)' },
      ...WHEEL_TEMPLATES.map((t) => ({ label: `${t.icon} ${t.name} · ${t.hint}`, onclick: () => addTemplate(t) })),
    ]);
  }
</script>

{#snippet group(kind: Kind, list: Tool[])}
  {@const rows = drags[kind]}
  <div class="group" role="list" aria-label={kind === 'wheel' ? 'Wheels' : 'Dice'}>
    {#each list as item, i (item.id)}
      {@const line = rows.lineAt(item.id)}
      <div
        class="drag-row"
        class:drop-before={line === 'before'}
        class:drop-after={line === 'after'}
        class:dragging={rows.dragging === item.id}
        role="listitem"
        ondragover={(e) => rows.over(e, item.id)}
        ondrop={(e) => {
          const m = rows.drop(e, list.map((x) => x.id));
          if (m) move(kind, m.from, m.to);
        }}
      >
        {#if renaming === item.id}
          <input
            class="rename"
            value={item.name}
            aria-label="{kind === 'wheel' ? 'Wheel' : 'Dice'} name"
            use:focusAll
            onkeydown={(e) => {
              if (e.key === 'Enter') rename(kind, item, e.currentTarget.value);
              else if (e.key === 'Escape') {
                e.stopPropagation();
                rename(kind, item, item.name);
              }
            }}
            onblur={(e) => renaming === item.id && rename(kind, item, e.currentTarget.value)}
          />
        {:else}
          <button
            class:active={sel === item.id}
            data-place="{kind}:{item.id}"
            data-tool={item.id}
            draggable="true"
            title="Drag to reorder · double-click or F2 to rename · right-click for more"
            onclick={() => (sel = item.id)}
            ondblclick={() => (renaming = item.id)}
            oncontextmenu={(e) => menu(e, kind, item, i)}
            onkeydown={(e) => itemKey(e, kind, item, i)}
            ondragstart={(e) => rows.start(e, item.id)}
            ondragend={() => rows.end()}
          >
            {item.name}
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<div class="page">
<PageHeader title="Wheels & Dice" sub="Saved with the game: the host spins or rolls any of them during play, and a tile can be a wheel or dice tile." />

<div class="layout">
  <!-- Not a second nav and main: the editor's own are around it. -->
  <section class="list" aria-label="Wheels and dice">
    <div class="head muted">🎡 Wheels</div>
    <!-- Always there in play: listed so it's found. -->
    <button
      class="builtin"
      class:active={builtin === 'players'}
      onclick={() => ((sel = null), (builtin = 'players'))}
      title="Built in: a slice for each player, in their colors (nothing to set up)">🎯 Pick a player <span class="muted small">built in</span></button
    >
    <button
      class="builtin"
      class:active={builtin === 'categories'}
      onclick={() => ((sel = null), (builtin = 'categories'))}
      title="Built in: a slice for each category on the board with clues left (nothing to set up)">🗂 Pick a category <span class="muted small">built in</span></button
    >
    {@render group('wheel', game.wheels)}
    <button class="ghost" onclick={() => add('wheel')}>＋ Add wheel</button>
    <button class="ghost" onclick={templateMenu} aria-haspopup="menu" title="Coin flip, Yes or no, a point wheel, punishments…">📋 Ready-made wheel…</button>
    <div class="head muted">🎲 Dice</div>
    {@render group('dice', game.dice)}
    <button class="ghost" onclick={() => add('dice')}>＋ Add dice</button>
  </section>

  <section aria-label="Wheel or dice">
    {#if wheel}
      <div class="row top">
        <span class="spacer"></span>
        <button class="ghost" onclick={() => dup('wheel', wheel)} title="A copy of this wheel, right after it (Ctrl+D)">⧉ Duplicate</button>
        <button class="ghost danger" onclick={() => remove('wheel', wheel)} title="Delete this wheel (Undo brings it back)">🗑 Delete wheel</button>
      </div>
      {#key wheel.id}<WheelEditor {wheel} />{/key}
    {:else if dice}
      <div class="row top">
        <span class="spacer"></span>
        <button class="ghost" onclick={() => dup('dice', dice)} title="A copy of these dice, right after them (Ctrl+D)">⧉ Duplicate</button>
        <button class="ghost danger" onclick={() => remove('dice', dice)} title="Delete these dice (Undo brings them back)">🗑 Delete dice</button>
      </div>
      {#key dice.id}<DiceEditor preset={dice} />{/key}
    {:else if builtin === 'categories'}
      <h3>🗂 Pick a category</h3>
      <p>
        Built into every game: on a Jeopardy board, a slice for each category that still has clues to play, so it shrinks
        as the board empties. Spin it from <b>🎡 Wheel</b> during play to pick the next category (its ✎ leaves categories
        out or changes their chances for a spin).
      </p>
    {:else if builtin === 'players'}
      <h3>🎯 Pick a player</h3>
      <p>
        Built into every game: a slice for each player, in their colors, so the players who join or leave are always on
        it. Spin it from <b>🎡 Wheel</b> during play (its ✎ leaves players out or changes their chances for a spin), make a
        tile a wheel tile with it, or spin it from a board game space or an RPG object's buttons.
      </p>
    {:else}
      <p class="muted">
        Pick a wheel or dice on the left, add one, or start from a <b>📋 Ready-made wheel</b>. Standard dice (d4–d100, 2d6, any "NdS") and a <b>🎯 Pick a player</b> wheel
        (a slice for each player, in their colors) are always there during play, without setting anything up.
      </p>
    {/if}
  </section>
</div>
</div>

<style>
  p {
    margin: 0 0 12px;
    max-width: 720px;
  }
  .layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 16px;
  }
  .list,
  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group > div {
    display: flex;
    flex-direction: column;
  }
  .list button {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .list button.active {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .rename {
    min-width: 0;
  }
  .list button.active .muted {
    color: inherit;
  }
  .head {
    margin-top: 8px;
    font-size: 12px;
  }
  .top {
    margin-bottom: 8px;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
