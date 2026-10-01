<!--
  A wheel or dice made right where it's picked (a wheel or dice tile, the board game's Move by), edited over that
  window without leaving it. It's the same wheel or dice as in the 🎡 Wheels & Dice tab.
-->
<script lang="ts" module>
  import { app } from '../../lib/app.svelte';
  import { modal } from '../../lib/modal';
  import type { DicePreset, WheelPreset } from '../../lib/model';
  import { newDice, newWheel } from '../../lib/tools';

  /** A new wheel or dice for the game, named like the tab names them (add it in a step). */
  export function newTool(kind: 'wheel'): WheelPreset;
  export function newTool(kind: 'dice'): DicePreset;
  export function newTool(kind: 'wheel' | 'dice'): WheelPreset | DicePreset {
    return kind === 'wheel' ? newWheel(`Wheel ${app.game.wheels.length + 1}`) : newDice(`Dice ${app.game.dice.length + 1}`);
  }
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import WheelEditor from './WheelEditor.svelte';
  import DiceEditor from './DiceEditor.svelte';

  let { kind, id, onclose }: { kind: 'wheel' | 'dice'; id: string; onclose: () => void } = $props();
  const wheel = $derived(kind === 'wheel' ? app.game.wheels.find((w) => w.id === id) : undefined);
  const dice = $derived(kind === 'dice' ? app.game.dice.find((d) => d.id === id) : undefined);
  let box = $state<HTMLElement>();

  // Its name is ready to type; Done gives the focus back to what was in focus before (the list it was picked in).
  const back = document.activeElement as HTMLElement | null;
  onMount(() => void tick().then(() => box?.querySelector<HTMLInputElement>('input')?.select()));
  function done(): void {
    onclose();
    back?.focus();
  }

  // An undo that takes it away again closes it.
  $effect(() => {
    if (!wheel && !dice) done();
  });

  function onkeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    done();
  }
</script>

<div class="backdrop" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label={kind === 'wheel' ? 'Wheel' : 'Dice'} bind:this={box} tabindex="-1" use:modal {onkeydown}>
    <header>
      <b class="modal-title">{kind === 'wheel' ? '🎡 Wheel' : '🎲 Dice'}</b>
      <span class="muted small">Also in the 🎡 Wheels & Dice tab, for every tile and board that uses it.</span>
      <span class="spacer"></span>
      <button class="primary" onclick={done}>Done</button>
      <button class="ghost modal-x" onclick={done} aria-label="Close" title="Close (Esc)">✕</button>
    </header>
    {#if wheel}
      <WheelEditor {wheel} />
    {:else if dice}
      <DiceEditor preset={dice} />
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: 110;
    padding: 16px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: min(1100px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .small {
    font-size: 12px;
  }
</style>
