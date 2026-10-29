<!--
  A color box (<input type="color">). In the desktop app a 💧 beside it picks a color from anywhere on the screen, as
  the color popup's own eyedropper does nothing there on some PCs (screencolor.ts). In a browser it's only the box, as
  it always was. Everything but the value goes onto the box itself (its handlers, name, title, data-*, disabled).
-->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { canPickFromScreen, labelWords, pickLabel, pickScreenColor } from './screencolor';

  let { value = $bindable(), ...rest }: Omit<HTMLInputAttributes, 'type' | 'value'> & { value?: string } = $props();

  const fromScreen = canPickFromScreen();
  let box = $state<HTMLInputElement>();
  let drop = $state<HTMLButtonElement>();
  const name = $derived(pickLabel(rest['aria-label']));

  // A box named by the <label> around it would have the 💧's name read as part of its own ("Pick a color from the
  // screen Values"): it's named with the label's other words instead (kept up as they change).
  $effect(() => {
    const label = box?.closest('label');
    const own = box?.parentElement;
    if (!box || !label || !own || rest['aria-label'] || rest['aria-labelledby']) return;
    const named = box;
    const rename = () => {
      const words = labelWords(label, own);
      if (words) named.setAttribute('aria-label', words);
      else named.removeAttribute('aria-label');
    };
    rename();
    const watch = new MutationObserver(rename);
    watch.observe(label, { childList: true, characterData: true, subtree: true });
    return () => watch.disconnect();
  });

  async function pick() {
    const color = await pickScreenColor();
    if (color && box && !box.disabled) {
      box.value = color;
      // As if picked in the box: its own handlers (and their undo steps) run as they always do.
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    drop?.focus();
  }
</script>

{#if fromScreen}
  <span class="colorbox">
    <input type="color" bind:this={box} bind:value {...rest} />
    <button class="tiny ghost" bind:this={drop} onclick={pick} disabled={rest.disabled} title={name} aria-label={name}>💧</button>
  </span>
{:else}
  <input type="color" bind:value {...rest} />
{/if}

<style>
  /* (One box with its 💧, so a row or a grid cell keeps the shape it had.) */
  .colorbox {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
</style>
