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
    return kind === 'wheel' ? newWheel(freeName('Wheel', app.game.wheels)) : newDice(freeName('Dice', app.game.dice));
  }

  /** "Wheel 4": the first number from the count up that no wheel (or dice) has yet (one deleted mustn't make a twin). */
  export function freeName(word: string, list: readonly { name: string }[]): string {
    const names = new Set(list.map((x) => x.name));
    let n = list.length + 1;
    while (names.has(`${word} ${n}`)) n++;
    return `${word} ${n}`;
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

<div class="modal-backdrop tool-backdrop" role="presentation">
  <div class="modal lg" role="dialog" aria-modal="true" aria-label={kind === 'wheel' ? 'Wheel' : 'Dice'} bind:this={box} tabindex="-1" use:modal {onkeydown}>
    <header class="modal-head">
      <h2 class="modal-title">{kind === 'wheel' ? '🎡 Wheel' : '🎲 Dice'} <span class="hint">Also in the 🎡 Wheels & Dice tab, for every tile and board that uses it.</span></h2>
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
  /* Over the clue editor it was opened from. */
  .tool-backdrop {
    z-index: calc(var(--z-modal) + 10);
  }
  .hint {
    font-weight: 400;
    margin-left: 8px;
  }
</style>
