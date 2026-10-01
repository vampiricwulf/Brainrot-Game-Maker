<!-- One RPG screen: the slide editor with an Object section for classes, plus arrival points and catalog items. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { app, editedGame } from '../../lib/app.svelte';
  import { dropMenu } from '../../lib/menustate.svelte';
  import { step } from '../../lib/history.svelte';
  import { goTo } from '../../lib/nav.svelte';
  import { newId, newImageEl, newShapeEl, newTextEl, type ItemDef, type Screen, type Slide, type SlideElement, type World } from '../../lib/model';
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

  /** A doorway or a character to place: a big emoji (swap it for a picture, or class any item with Class). */
  function placeholder(cls: 'doorway' | 'npc'): SlideElement {
    const door = cls === 'doorway';
    const el: SlideElement = { ...newTextEl(door ? '🚪' : '🧙', { x: door ? 1500 : 1180, y: 600, w: 260, h: 300 }), size: 200, uppercase: false };
    el.name = door ? 'Doorway' : 'Character';
    el.role = { class: cls };
    return el;
  }

  /** A doorway goes on to where it leads: the panel's screen list has the focus. */
  async function addDoorway(add: (el: SlideElement) => void): Promise<void> {
    add(placeholder('doorway'));
    await tick();
    document.querySelector<HTMLSelectElement>('select[aria-label="Leads to: screen"]')?.focus();
  }

  /** A character goes on to its name, typed over (“Character” is selected). */
  async function addCharacter(add: (el: SlideElement) => void): Promise<void> {
    add(placeholder('npc'));
    await tick();
    const name = document.querySelector<HTMLInputElement>('input[data-field="object-name"]');
    name?.focus();
    name?.select();
  }

  /** A new item in the catalog (“Item 1”), put on this screen in one step: its name and price are set in 📊 Stats & Items. */
  function newItemHere(add: (el: SlideElement) => void): void {
    const it: ItemDef = { id: newId(), name: `Item ${(game.items?.length ?? 0) + 1}`, stackable: true, price: 1 };
    const make = () => {
      game.items = [...(game.items ?? []), it];
      add(itemObject(it.id));
    };
    // (Live in play, the game being edited isn't the editor's: no step of its history.)
    if (app.editGame) make();
    else step(`Added item “${it.name}” to the catalog and this screen`, make);
  }

  /**
   * The catalog's items, under the button (a second click, Esc or a click elsewhere closes it). With none yet, it
   * makes one here, or goes to 📊 Stats & Items.
   */
  function itemMenu(e: MouseEvent, add: (el: SlideElement) => void): void {
    const items = game.items ?? [];
    dropMenu(
      e,
      items.length
        ? [
            ...items.map((it) => ({ label: it.name, onclick: () => add(itemObject(it.id)) })),
            { sep: true as const },
            { label: '＋ Add new item…', hint: 'Into the catalog (📊 Stats & Items) and onto this screen', onclick: () => newItemHere(add) },
          ]
        : [
            { heading: 'No items yet' },
            { label: '＋ Add new item here', hint: 'Into the catalog (📊 Stats & Items) and onto this screen', onclick: () => newItemHere(add) },
            ...(app.editGame ? [] : [{ label: '📊 Go to Stats & Items', onclick: () => void goTo({ tab: 'stats' }) }]),
          ],
    );
  }
</script>

<SlideEditor slide={slide ?? screen.slide} placeholder="Click to type" fill>
  {#snippet objectsection(el: SlideElement)}
    <ObjectPanel {el} {world} slide={slide ?? screen.slide} />
  {/snippet}
  {#snippet tools(add: (el: SlideElement) => void)}
    <button onclick={() => addDoorway(add)} title="Leads to another screen (any map): pick where in its settings">🚪 Doorway</button>
    <button onclick={() => addCharacter(add)} title="Someone to talk to: dialogue, own stats, maybe a shop">🧙 Character</button>
    <button onclick={() => add(spawnPoint())} title="Where players appear when they arrive on this screen (never shown to viewers)">🚩 Arrival</button>
    <button onclick={(e) => itemMenu(e, add)} aria-haspopup="menu" title="Put an item from the catalog on this screen">📦 Item ▾</button>
  {/snippet}
</SlideEditor>
