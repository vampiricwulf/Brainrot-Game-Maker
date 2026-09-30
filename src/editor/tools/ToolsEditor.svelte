<!-- Editor tab: saved wheels and dice (spec §5.6). -->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { take } from '../../lib/nav.svelte';
  import { step } from '../../lib/history.svelte';
  import { newId } from '../../lib/model';
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

  function dup<T extends { id: string; name: string }>(list: T[], item: T, noun: string): void {
    const copy = JSON.parse(JSON.stringify(item)) as T & { segments?: { id: string }[]; dice?: { id: string }[] };
    copy.id = newId();
    copy.name += ' (copy)';
    copy.segments?.forEach((s) => (s.id = newId()));
    copy.dice?.forEach((d) => (d.id = newId()));
    step(`Duplicated ${noun} “${item.name}”`, () => list.push(copy));
    sel = copy.id;
  }

  /** Delete on a wheel or dice in the list deletes it (the note at the bottom offers Undo). */
  function onDelete(e: KeyboardEvent, remove: () => void): void {
    if (e.key !== 'Delete' || e.repeat) return;
    e.preventDefault();
    remove();
  }

  // Deleting is done at once: the note at the bottom offers Undo.
  function removeWheel(id: string, name: string): void {
    step(`Deleted wheel “${name}”`, () => (game.wheels = game.wheels.filter((w) => w.id !== id)), { notify: true });
    sel = null;
  }
  function removeDice(id: string, name: string): void {
    step(`Deleted dice “${name}”`, () => (game.dice = game.dice.filter((d) => d.id !== id)), { notify: true });
    sel = null;
  }
</script>

<h2>Wheels & Dice</h2>
<p class="muted">
  Saved with the game. The host can spin or roll any of them during play, and a tile can be a wheel or dice tile.
  There's also a built-in <b>🎯 Pick a player</b> wheel with a slice for each player, in their colors.
</p>

<div class="layout">
  <nav>
    <div class="head muted">🎡 Wheels</div>
    {#each game.wheels as w (w.id)}
      <button class:active={sel === w.id} data-place="wheel:{w.id}" onclick={() => (sel = w.id)} onkeydown={(e) => onDelete(e, () => removeWheel(w.id, w.name))}>
        {w.name}
      </button>
    {/each}
    <button
      class="ghost"
      onclick={() => {
        const w = newWheel(`Wheel ${game.wheels.length + 1}`);
        game.wheels.push(w);
        sel = w.id;
      }}>＋ New wheel</button>
    <div class="head muted">🎲 Dice</div>
    {#each game.dice as d (d.id)}
      <button class:active={sel === d.id} data-place="dice:{d.id}" onclick={() => (sel = d.id)} onkeydown={(e) => onDelete(e, () => removeDice(d.id, d.name))}>
        {d.name}
      </button>
    {/each}
    <button
      class="ghost"
      onclick={() => {
        const d = newDice(`Dice ${game.dice.length + 1}`);
        game.dice.push(d);
        sel = d.id;
      }}>＋ New dice</button>
  </nav>

  <main>
    {#if wheel}
      <div class="row top">
        <span class="spacer"></span>
        <button class="small" onclick={() => dup(game.wheels, wheel, 'wheel')}>Duplicate</button>
        <button class="small bad" onclick={() => removeWheel(wheel.id, wheel.name)}>Delete</button>
      </div>
      {#key wheel.id}<WheelEditor {wheel} />{/key}
    {:else if dice}
      <div class="row top">
        <span class="spacer"></span>
        <button class="small" onclick={() => dup(game.dice, dice, 'dice')}>Duplicate</button>
        <button class="small bad" onclick={() => removeDice(dice.id, dice.name)}>Delete</button>
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
  nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
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
