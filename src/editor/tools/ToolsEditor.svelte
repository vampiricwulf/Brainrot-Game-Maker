<!-- Editor tab: saved wheels and dice (spec §5.6). -->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { newId } from '../../lib/model';
  import { newDice, newWheel } from '../../lib/tools';
  import WheelEditor from './WheelEditor.svelte';
  import DiceEditor from './DiceEditor.svelte';

  const game = $derived(app.game);
  let sel = $state<string | null>(null);
  const wheel = $derived(game.wheels.find((w) => w.id === sel));
  const dice = $derived(game.dice.find((d) => d.id === sel));

  function dup<T extends { id: string; name: string }>(list: T[], item: T): void {
    const copy = JSON.parse(JSON.stringify(item)) as T & { segments?: { id: string }[]; dice?: { id: string }[] };
    copy.id = newId();
    copy.name += ' (copy)';
    copy.segments?.forEach((s) => (s.id = newId()));
    copy.dice?.forEach((d) => (d.id = newId()));
    list.push(copy);
    sel = copy.id;
  }
</script>

<h2>Wheels & Dice</h2>
<p class="muted">Saved with the game. The host can spin or roll any of them during play, and a tile can be a wheel or dice tile.</p>

<div class="layout">
  <nav>
    <div class="head muted">🎡 Wheels</div>
    {#each game.wheels as w (w.id)}
      <button class:active={sel === w.id} onclick={() => (sel = w.id)}>{w.name}</button>
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
      <button class:active={sel === d.id} onclick={() => (sel = d.id)}>{d.name}</button>
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
        <button class="small" onclick={() => dup(game.wheels, wheel)}>Duplicate</button>
        <button class="small bad" onclick={() => confirm(`Delete "${wheel.name}"?`) && ((game.wheels = game.wheels.filter((w) => w.id !== wheel.id)), (sel = null))}>Delete</button>
      </div>
      {#key wheel.id}<WheelEditor {wheel} />{/key}
    {:else if dice}
      <div class="row top">
        <span class="spacer"></span>
        <button class="small" onclick={() => dup(game.dice, dice)}>Duplicate</button>
        <button class="small bad" onclick={() => confirm(`Delete "${dice.name}"?`) && ((game.dice = game.dice.filter((d) => d.id !== dice.id)), (sel = null))}>Delete</button>
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
