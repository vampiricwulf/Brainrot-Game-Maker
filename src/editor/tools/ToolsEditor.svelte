<!--
  Editor tab: saved wheels and dice (spec §5.6), and 🎭 deals (partner-clues spec §11). Their order is the order
  everywhere they're picked (Move by, wheel and dice tiles, the host's menus): drag them in the list, or right-click for
  more.
-->
<script lang="ts">
  import PageHeader from '../PageHeader.svelte';
  import { tick } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { announce } from '../../lib/announce';
  import { take } from '../../lib/nav.svelte';
  import { step } from '../../lib/history.svelte';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { copyActions, copyName, copySegment, moveTo } from '../../lib/listedit';
  import { freeName } from './ToolPopup.svelte';
  import { dropMenu, showMenu } from '../../lib/menustate.svelte';
  import { uniqueName } from '../../lib/roundcopy';
  import { WHEEL_TEMPLATES, wheelFromTemplate, type WheelTemplate } from '../../lib/wheeltemplates';
  import { newId, type DealPreset, type DicePreset, type WheelPreset } from '../../lib/model';
  import { DEAL_TEMPLATES, dealFromTemplate, newDeal, type DealTemplate } from '../../lib/deals';
  import { newDice, newWheel } from '../../lib/tools';
  import WheelEditor from './WheelEditor.svelte';
  import DiceEditor from './DiceEditor.svelte';
  import DealEditor from './DealEditor.svelte';

  const game = $derived(app.game);
  let sel = $state<string | null>(null);
  // An undo or redo here opens the wheel or dice it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab === 'tools' && (place.wheel || place.dice || place.deal)) sel = place.wheel ?? place.dice ?? place.deal ?? null;
  });
  const wheel = $derived(game.wheels.find((w) => w.id === sel));
  const dice = $derived(game.dice.find((d) => d.id === sel));
  const deal = $derived(game.deals?.find((d) => d.id === sel));

  type Tool = WheelPreset | DicePreset | DealPreset;
  type Kind = 'wheel' | 'dice' | 'deal';
  const listOf = (kind: Kind): Tool[] => (kind === 'wheel' ? game.wheels : kind === 'dice' ? game.dice : (game.deals ?? []));

  /** Put the focus back on a wheel's or dice's button in the list (after it moved, or was renamed). */
  function focusItem(id: string): void {
    void tick().then(() => document.querySelector<HTMLElement>(`[data-tool="${id}"]`)?.focus());
  }

  /** A copy right after it, with its own slices (and their buttons) or dice. */
  function dup(kind: Kind, item: Tool): void {
    const list = listOf(kind);
    const copy = JSON.parse(JSON.stringify(item)) as Tool;
    copy.id = newId();
    copy.name = copyName(item.name, list.map((x) => x.name));
    if ('segments' in copy) copy.segments = copy.segments.map(copySegment);
    else if ('parts' in copy)
      for (const p of copy.parts) {
        p.id = newId();
        for (const e of p.card.elements) e.id = newId();
      }
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
        else if (kind === 'dice') game.dice = game.dice.filter((d) => d.id !== item.id);
        else if (game.deals) {
          game.deals = game.deals.filter((d) => d.id !== item.id);
          if (!game.deals.length) delete game.deals;
        }
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
    announce(`${kind[0].toUpperCase()}${kind.slice(1)} “${item.name}” moved to ${to + 1} of ${list.length}`);
    focusItem(item.id);
  }

  /**
   * The wheel or dice being renamed in place. Its row takes the focus back (Enter, Esc, a click on nothing), but not from
   * a field or another row clicked: the next key goes there, not to the row, where Backspace would delete it.
   */
  let renaming = $state<string | null>(null);
  function rename(kind: Kind, item: Tool, name: string, refocus = true): void {
    renaming = null;
    const to = name.trim();
    if (to && to !== item.name) step(`Renamed ${kind} “${item.name}” to “${to}”`, () => (item.name = to));
    if (refocus) focusItem(item.id);
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

  const drags: Record<Kind, DragOrder> = { wheel: new DragOrder(), dice: new DragOrder(), deal: new DragOrder() };

  /** A deal into the game (its list made on the first one). */
  function pushDeal(d: DealPreset): void {
    if (!game.deals) game.deals = [];
    game.deals.push(d);
  }

  function add(kind: Kind): void {
    if (kind === 'deal') {
      const d = newDeal(freeName('Deal', game.deals ?? []));
      step(`Added deal “${d.name}”`, () => pushDeal(d));
      sel = d.id;
      return;
    }
    const item = kind === 'wheel' ? newWheel(freeName('Wheel', game.wheels)) : newDice(freeName('Dice', game.dice));
    if (kind === 'wheel') game.wheels.push(item as WheelPreset);
    else game.dice.push(item as DicePreset);
    sel = item.id;
  }

  /**
   * A ready-made deal, added to the game. One that draws from a wheel gets the game's wheel of that name, or the
   * ready-made wheel added with it (Locations for 🕵 Odd one out, Secret prompts for 🧠 Everyone's own prompt).
   */
  function addDealTemplate(t: DealTemplate): void {
    const wt = WHEEL_TEMPLATES.find((x) => x.key === t.wheel);
    const have = wt ? game.wheels.find((w) => w.name.trim().toLowerCase() === wt.name.toLowerCase()) : undefined;
    const wheelNew = wt && !have ? wheelFromTemplate(wt, game.settings.currencySymbol, uniqueName(game.wheels.map((x) => x.name), wt.name, false)) : undefined;
    const d = dealFromTemplate(t, uniqueName((game.deals ?? []).map((x) => x.name), t.name, false), have?.id ?? wheelNew?.id);
    step(`Added deal “${d.name}”${wheelNew ? ` and wheel “${wheelNew.name}”` : ''}`, () => {
      if (wheelNew) game.wheels.push(wheelNew);
      pushDeal(d);
    });
    sel = d.id;
    focusItem(d.id);
  }
  function dealTemplateMenu(e: MouseEvent): void {
    dropMenu(e, [{ heading: 'Ready-made deals (change anything after)' }, ...DEAL_TEMPLATES.map((t) => ({ label: `${t.icon} ${t.name}`, hint: t.hint, onclick: () => addDealTemplate(t) }))]);
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
      ...WHEEL_TEMPLATES.map((t) => ({ label: `${t.icon} ${t.name}`, hint: t.hint, onclick: () => addTemplate(t) })),
    ]);
  }
</script>

{#snippet group(kind: Kind, list: Tool[])}
  {@const rows = drags[kind]}
  <div class="group" role="list" aria-label={kind === 'wheel' ? 'Wheels' : kind === 'dice' ? 'Dice' : 'Deals'}>
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
            aria-label="{kind === 'wheel' ? 'Wheel' : kind === 'dice' ? 'Dice' : 'Deal'} name"
            use:focusAll
            onkeydown={(e) => {
              if (e.key === 'Enter') rename(kind, item, e.currentTarget.value);
              else if (e.key === 'Escape') {
                e.stopPropagation();
                rename(kind, item, item.name);
              }
            }}
            onblur={(e) => renaming === item.id && rename(kind, item, e.currentTarget.value, !e.relatedTarget)}
          />
        {:else}
          <button
            class:active={sel === item.id}
            aria-current={sel === item.id ? 'true' : undefined}
            data-place="{kind}:{item.id}"
            data-tool={item.id}
            draggable="true"
            title="Drag to reorder · double-click or F2 to rename · right-click for more"
            onclick={(e) => {
              sel = item.id;
              // (Safari and Firefox on a Mac don't focus a clicked button: it takes the keys, not a row renamed.)
              e.currentTarget.focus();
            }}
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
<PageHeader title="Wheels, Dice & Deals" sub="Saved with the game: the host spins or rolls any of them during play, and a tile can be a wheel or dice tile. 🎭 Deals hand everyone a secret part." />

<div class="layout">
  <!-- Not a second nav and main: the editor's own are around it. -->
  <section class="list" aria-label="Wheels, dice and deals">
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
    <div class="head muted">🎭 Deals</div>
    {@render group('deal', game.deals ?? [])}
    <button class="ghost" onclick={() => add('deal')}>＋ Add deal</button>
    <button class="ghost" onclick={dealTemplateMenu} aria-haspopup="menu" title="Odd one out, Secret roles, Team captain, Everyone’s own prompt">📋 Ready-made deal…</button>
  </section>

  <section aria-label="Wheel, dice or deal">
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
    {:else if deal}
      <div class="row top">
        <span class="spacer"></span>
        <button class="ghost" onclick={() => dup('deal', deal)} title="A copy of this deal, right after it (Ctrl+D)">⧉ Duplicate</button>
        <button class="ghost danger" onclick={() => remove('deal', deal)} title="Delete this deal (Undo brings it back)">🗑 Delete deal</button>
      </div>
      {#key deal.id}<DealEditor {deal} />{/key}
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
        Pick a wheel, dice or deal on the left, add one, or start from a <b>📋 Ready-made wheel…</b> or <b>📋 Ready-made deal…</b>. Standard dice (d4–d100, 2d6, any "NdS") and the built-in
        <b>🎯 Pick a player</b> and <b>🗂 Pick a category</b> wheels are always there during play, without setting anything up.
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
