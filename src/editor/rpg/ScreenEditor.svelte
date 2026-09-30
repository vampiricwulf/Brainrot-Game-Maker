<!-- One RPG screen: the slide editor with an Object section for classes, plus arrival points and catalog items. -->
<script lang="ts">
  import { editedGame } from '../../lib/app.svelte';
  import { newImageEl, newShapeEl, newTextEl, type Screen, type Slide, type SlideElement, type World } from '../../lib/model';
  import SlideEditor from '../slide/SlideEditor.svelte';
  import ObjectPanel from './ObjectPanel.svelte';

  /** `slide`: one of the screen's other looks, edited instead of its own slide. */
  let { world, screen, slide }: { world: World; screen: Screen; slide?: Slide } = $props();
  const game = $derived(editedGame());
  let itemsOpen = $state(false);

  function spawnPoint(): SlideElement {
    const el = newShapeEl('ellipse');
    Object.assign(el, { x: 900, y: 700, w: 120, h: 120, hotspot: true, fill: 'transparent', strokeWidth: 0, name: 'Arrival point', role: { class: 'spawn' } });
    return el;
  }

  /** A catalog item placed on the screen: its icon (or its name as text), ready to be picked up. */
  function itemObject(itemId: string): SlideElement {
    const it = game.items?.find((i) => i.id === itemId);
    const el: SlideElement = it?.icon
      ? newImageEl(it.icon, 200, 200)
      : { ...newTextEl(`📦 ${it?.name ?? 'Item'}`), x: 760, y: 480, w: 400, h: 120, size: 60 };
    el.name = it?.name ?? 'Item';
    el.role = { class: 'item', item: itemId, qty: 1 };
    return el;
  }
</script>

<SlideEditor slide={slide ?? screen.slide} placeholder="Click to type" fill>
  {#snippet objectsection(el: SlideElement)}
    <ObjectPanel {el} {world} {screen} />
  {/snippet}
  {#snippet tools(add: (el: SlideElement) => void)}
    <button onclick={() => add(spawnPoint())} title="Where players appear when they arrive on this screen (never shown to viewers)">🚩 Arrival</button>
    <div class="pop">
      <button onclick={() => (itemsOpen = !itemsOpen)} title="Put an item from the catalog on this screen">📦 Item ▾</button>
      {#if itemsOpen}
        <div class="menu">
          {#each game.items ?? [] as it (it.id)}
            <button onclick={() => ((itemsOpen = false), add(itemObject(it.id)))}>{it.name}</button>
          {:else}
            <span class="muted small">No items yet: add them in 📊 Stats & Items.</span>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</SlideEditor>

<style>
  .pop {
    position: relative;
  }
  .menu {
    position: absolute;
    z-index: 70;
    top: 100%;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    min-width: 180px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .menu button {
    text-align: left;
  }
  .small {
    font-size: 12px;
  }
</style>
