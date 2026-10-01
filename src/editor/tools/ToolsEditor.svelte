<!--
  Editor tab: saved wheels and dice (spec §5.6). Their order is the order everywhere they're picked (Move by, wheel
  and dice tiles, the host's menus): drag them in the list, or right-click for more.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { take } from '../../lib/nav.svelte';
  import { step } from '../../lib/history.svelte';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { copyActions, copySegment, moveTo } from '../../lib/listedit';
  import { showMenu } from '../../lib/menustate.svelte';
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
      { label: '🗑 Delete', danger: true, onclick: () => remove(kind, item), keys: 'Delete' },
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

<h2>Wheels & Dice</h2>
<p class="muted">
  Saved with the game. The host can spin or roll any of them during play, and a tile can be a wheel or dice tile.
  There's also a built-in <b>🎯 Pick a player</b> wheel with a slice for each player, in their colors.
</p>

<div class="layout">
  <nav>
    <div class="head muted">🎡 Wheels</div>
    {@render group('wheel', game.wheels)}
    <button class="ghost" onclick={() => add('wheel')}>＋ New wheel</button>
    <div class="head muted">🎲 Dice</div>
    {@render group('dice', game.dice)}
    <button class="ghost" onclick={() => add('dice')}>＋ New dice</button>
  </nav>

  <main>
    {#if wheel}
      <div class="row top">
        <span class="spacer"></span>
        <button class="small" onclick={() => dup('wheel', wheel)}>Duplicate</button>
        <button class="small bad" onclick={() => remove('wheel', wheel)}>Delete</button>
      </div>
      {#key wheel.id}<WheelEditor {wheel} />{/key}
    {:else if dice}
      <div class="row top">
        <span class="spacer"></span>
        <button class="small" onclick={() => dup('dice', dice)}>Duplicate</button>
        <button class="small bad" onclick={() => remove('dice', dice)}>Delete</button>
      </div>
      {#key dice.id}<DiceEditor preset={dice} />{/key}
    {:else}
      <p class="muted">Pick a wheel or dice on the left, or make a new one. Standard dice (d4–d100, 2d6, any "NdS") are always available during play without setting anything up.</p>
    {/if}
  </main>
</div>

<style>
  h2 {
    margin: 0 0 4px;
  }
  p {
    margin: 0 0 12px;
  }
  .layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 16px;
  }
  nav,
  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group > div {
    display: flex;
    flex-direction: column;
  }
  nav button {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  nav button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .rename {
    min-width: 0;
  }
  .head {
    margin-top: 8px;
    font-size: 12px;
  }
  .top {
    margin-bottom: 8px;
  }
  .small {
    font-size: 12px;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
