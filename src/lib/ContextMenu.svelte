<!-- The open right-click menu (see contextmenu.svelte.ts): kept on screen, closed by a click elsewhere, Esc or scrolling. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { closeMenu, contextMenu } from './contextmenu.svelte';

  let box = $state<HTMLDivElement>();
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
    closeMenu();
    fn();
  }

  function key(e: KeyboardEvent): void {
    if (!contextMenu.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return closeMenu();
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(box?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
</script>

<svelte:window
  onkeydowncapture={key}
  onpointerdown={(e) => contextMenu.open && !box?.contains(e.target as Node) && closeMenu()}
  onblur={closeMenu}
  onresize={closeMenu}
  onwheel={() => contextMenu.open && closeMenu()}
/>

{#if contextMenu.open}
  <div class="cm" role="menu" tabindex="-1" bind:this={box} style:left="{pos.x}px" style:top="{pos.y}px" oncontextmenu={(e) => e.preventDefault()}>
    {#each contextMenu.open.items as item, i (i)}
      {#if 'sep' in item}
        <div class="sep" role="separator"></div>
      {:else if 'heading' in item}
        <div class="heading">{item.heading}</div>
      {:else}
        <button role="menuitem" class:danger={item.danger} disabled={item.disabled} title={item.hint} onclick={() => run(item.onclick)}>
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .cm {
    position: fixed;
    z-index: 1000;
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
    text-align: left;
    border: none;
    background: transparent;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: rgba(79, 124, 255, 0.25);
    outline: none;
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
    font-size: 11px;
    font-weight: 700;
    opacity: 0.7;
  }
</style>
