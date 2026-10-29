<!--
  A color box (<input type="color">) that opens the app's own color picker (ColorPicker.svelte) instead of the
  browser's: Hex or RGB to type it in, and a 💧 that works in the desktop app too. Everything but the value goes onto
  the box itself (its handlers, name, title, data-*, disabled), and the picker sends it the input and change events the
  browser's would.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { closeColorPicker, colorPicker, openColorPicker } from './pickerstate.svelte';

  let { value = $bindable(), onchange, onclick, ...rest }: Omit<HTMLInputAttributes, 'type' | 'value'> & { value?: string } = $props();
  /** Its own change handler, then the box keeps what that left in it (a color it turned down goes back). */
  const changed: HTMLInputAttributes['onchange'] = (e) => {
    onchange?.(e);
    value = e.currentTarget.value;
  };
  /** A click, or Enter or Space on it, or a click on its label: the app's picker, never the browser's (a second one closes it). */
  const clicked: HTMLInputAttributes['onclick'] = (e) => {
    onclick?.(e);
    e.preventDefault();
    const box = e.currentTarget;
    if (colorPicker.open?.box === box) closeColorPicker();
    else if (!box.disabled) openColorPicker(box);
  };

  let box = $state<HTMLInputElement>();
  // Taken away with its picker open (its look switched off, its row deleted): the picker goes too (once it's gone).
  $effect(() => {
    const el = box;
    return () => queueMicrotask(() => el && !el.isConnected && colorPicker.open?.box === el && closeColorPicker('gone'));
  });
</script>

<input type="color" bind:this={box} bind:value {...rest} onchange={changed} onclick={clicked} data-picking={(box && colorPicker.open?.box === box) || undefined} />
