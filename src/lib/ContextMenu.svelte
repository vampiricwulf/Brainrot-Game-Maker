<!-- The open right-click menu (see menustate.svelte.ts): kept on screen, closed by a click elsewhere, Esc or scrolling. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { placePopup } from './anchored';
  import { closeMenu, contextMenu } from './menustate.svelte';

  let box = $state<HTMLDivElement>();
  /** "Ctrl+" reads "⌘" on a Mac. */
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keysText = (k: string) => (mac ? k.replaceAll('Ctrl+', '⌘') : k);
  let pos = $state<{ x: number; y: number; maxHeight?: number }>({ x: 0, y: 0 });

  $effect(() => {
    const m = contextMenu.open;
    if (!m) return;
    // (Measured at the window's left first: by the right edge it would wrap narrower.)
    pos = { x: 0, y: m.y };
    tick().then(() => {
      if (!box) return;
      // Under the pointer, or a dropped menu under its button; over it when there's more room above (see anchored.ts),
      // moved in from the window's sides, and scrolling inside on a short window.
      const r = m.from?.getBoundingClientRect();
      const p = placePopup({
        anchor: r ?? { left: m.x, top: m.y, right: m.x, bottom: m.y },
        width: box.offsetWidth,
        height: box.scrollHeight + box.offsetHeight - box.clientHeight,
        view: { width: innerWidth, height: innerHeight },
        gap: r ? 2 : 0,
        margin: 4,
      });
      pos = { x: p.left, y: p.top, maxHeight: p.maxHeight };
      box.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  });

  function run(fn: () => void): void {
    // The focus goes back first (a dropped menu's button, else what had it or was right-clicked), so a window the item
    // opens returns it there on close, and the keys go on working there after.
    const back = contextMenu.open?.back;
    closeMenu();
    if (back?.isConnected) back.focus({ preventScroll: true });
    fn();
    // A move to a later place (▶ Move right, ▼ Move down) takes that button out of the page and back, which drops the
    // focus: it goes back again once drawn (unless the item put it somewhere, a window it opened).
    void tick().then(() => {
      if (back?.isConnected && (!document.activeElement || document.activeElement === document.body)) back.focus({ preventScroll: true });
    });
  }

  function key(e: KeyboardEvent): void {
    if (!contextMenu.open) return;
    // Tab closes the menu too (the focus goes back to where it came from), so it can't stay open behind the focus.
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const back = contextMenu.open.back;
      closeMenu();
      // The focus goes back (to a dropped menu's button, or what had it or was right-clicked).
      if (back?.isConnected) back.focus({ preventScroll: true });
      return;
    }
    // Every other key is the menu's too: Delete, Ctrl+Z and the like never reach what's under it (the arrows aren't a
    // nudge for what's selected in a slide editor). Enter and Space do their usual job on the focused item.
    e.stopImmediatePropagation();
    if (e.key === 'Enter' || e.key === ' ') return;
    e.preventDefault();
    const buttons = [...(box?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (e.key === 'Home' || e.key === 'End') return void buttons[e.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
</script>

<!--
  A press elsewhere closes the menu first, so a board space or slide item that keeps its presses to itself can't leave
  it open. A press on the button a menu dropped from leaves it to that button's click, which closes it (see dropMenu).
  The focus leaving it for anything else closes it too, so it never stays open behind the keys.
-->
<svelte:window
  onkeydowncapture={key}
  onpointerdowncapture={(e) => contextMenu.open && !box?.contains(e.target as Node) && !contextMenu.open.from?.contains(e.target as Node) && closeMenu()}
  onblur={closeMenu}
  onresize={closeMenu}
  onwheel={() => contextMenu.open && closeMenu()}
/>

{#if contextMenu.open}
  <div class="cm" role="menu" data-over-modal tabindex="-1" bind:this={box} style:left="{pos.x}px" style:top="{pos.y}px" style:max-height={pos.maxHeight === undefined ? undefined : `${pos.maxHeight}px`} oncontextmenu={(e) => e.preventDefault()}
    onfocusout={(e) => e.relatedTarget instanceof Node && !box?.contains(e.relatedTarget) && !contextMenu.open?.from?.contains(e.relatedTarget) && closeMenu()}>
    {#each contextMenu.open.items as item, i (i)}
      {#if 'sep' in item}
        <div class="sep" role="separator"></div>
      {:else if 'heading' in item}
        <div class="heading">{item.heading}</div>
      {:else}
        <button role="menuitem" class:danger={item.danger} disabled={item.disabled} title={item.hint} onclick={() => run(item.onclick)}>
          <span class="label">{item.label}</span>{#if item.keys}<kbd aria-hidden="true">{keysText(item.keys)}</kbd>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .cm {
    position: fixed;
    /* Over any window (a right-click in the clue editor). */
    z-index: var(--z-menu);
    min-width: 190px;
    max-width: 320px;
    overflow-y: auto;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  button {
    display: flex;
    align-items: center;
    text-align: left;
    border: none;
    background: transparent;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 13px;
    white-space: nowrap;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  kbd {
    margin-left: auto;
    padding-left: 16px;
    font-family: inherit;
    font-size: 12px;
    color: var(--muted);
  }
  button:hover:not(:disabled) {
    background: rgba(79, 124, 255, 0.25);
  }
  /* The item in focus: a clear ring, not only a tint (keyboard users follow it). */
  button:focus-visible {
    background: rgba(79, 124, 255, 0.25);
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .danger {
    color: var(--bad);
  }
  .sep {
    height: 1px;
    margin: 4px 2px;
    background: var(--border);
  }
  .heading {
    padding: 4px 10px 2px;
    font-size: 12px;
    font-weight: 700;
    opacity: 0.7;
  }
</style>
