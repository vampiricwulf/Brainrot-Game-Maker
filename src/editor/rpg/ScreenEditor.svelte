<!-- One RPG screen: the slide editor with an Object section for classes, plus arrival points and catalog items. -->
<script lang="ts">
  import { editedGame } from '../../lib/app.svelte';
  import { showMenu } from '../../lib/menustate.svelte';
  import { newImageEl, newShapeEl, newTextEl, type Screen, type Slide, type SlideElement, type World } from '../../lib/model';
  import SlideEditor from '../slide/SlideEditor.svelte';
  import ObjectPanel from './ObjectPanel.svelte';

  /** `slide`: one of the screen's other looks, edited instead of its own slide. */
  let { world, screen, slide }: { world: World; screen: Screen; slide?: Slide } = $props();
  const game = $derived(editedGame());

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

  /** The catalog's items, under the button (kept on screen, closed by Esc or a click elsewhere, like a right-click menu). */
  function itemMenu(e: MouseEvent, add: (el: SlideElement) => void): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items = game.items ?? [];
    showMenu(
      new MouseEvent('click', { clientX: r.left, clientY: r.bottom + 2 }),
      items.length
        ? items.map((it) => ({ label: it.name, onclick: () => add(itemObject(it.id)) }))
        : [{ label: 'No items yet: add them in 📊 Stats & Items', onclick: () => {}, disabled: true }],
    );
  }
</script>

<SlideEditor slide={slide ?? screen.slide} placeholder="Click to type" fill>
  {#snippet objectsection(el: SlideElement)}
    <ObjectPanel {el} {world} slide={slide ?? screen.slide} />
  {/snippet}
  {#snippet tools(add: (el: SlideElement) => void)}
    <button onclick={() => add(spawnPoint())} title="Where players appear when they arrive on this screen (never shown to viewers)">🚩 Arrival</button>
    <button onclick={(e) => itemMenu(e, add)} aria-haspopup="menu" title="Put an item from the catalog on this screen">📦 Item ▾</button>
  {/snippet}
</SlideEditor>
