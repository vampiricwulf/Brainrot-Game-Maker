<!-- The open right-click menu (see menustate.svelte.ts): kept on screen, closed by a click elsewhere, Esc or scrolling. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { closeMenu, contextMenu } from './menustate.svelte';

  let box = $state<HTMLDivElement>();
  /** "Ctrl+" reads "⌘" on a Mac. */
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keysText = (k: string) => (mac ? k.replaceAll('Ctrl+', '⌘') : k);
  let pos = $state({ x: 0, y: 0 });

  $effect(() => {
    const m = contextMenu.open;
    if (!m) return;
    pos = { x: m.x, y: m.y };
    tick().then(() => {
      if (!box) return;
      const r = box.getBoundingClientRect();
      pos = { x: Math.max(4, Math.min(m.x, innerWidth - r.width - 4)), y: Math.max(4, Math.min(m.y, innerHeight - r.height - 4)) };
      box.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  });

  function run(fn: () => void): void {
    // A dropped menu gives its button the focus back first, so a window the item opens returns it there on close.
    const from = contextMenu.open?.from;
    closeMenu();
    from?.focus();
    fn();
  }

  function key(e: KeyboardEvent): void {
    if (!contextMenu.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const from = contextMenu.open.from;
      closeMenu();
      // A menu dropped from a button gives it the focus back.
      return from?.focus();
    }
    // Every other key is the menu's too: Delete, Ctrl+Z and the like never reach what's under it (the arrows aren't a
    // nudge for what's selected in a slide editor). Tab, Enter and Space do their usual job on the focused item.
    e.stopImmediatePropagation();
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') return;
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
-->
<svelte:window
  onkeydowncapture={key}
  onpointerdowncapture={(e) => contextMenu.open && !box?.contains(e.target as Node) && !contextMenu.open.from?.contains(e.target as Node) && closeMenu()}
  onblur={closeMenu}
  onresize={closeMenu}
  onwheel={() => contextMenu.open && closeMenu()}
/>

{#if contextMenu.open}
  <div class="cm" role="menu" data-over-modal tabindex="-1" bind:this={box} style:left="{pos.x}px" style:top="{pos.y}px" oncontextmenu={(e) => e.preventDefault()}>
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
