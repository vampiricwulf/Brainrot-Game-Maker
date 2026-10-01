<!--
  Right-click menu on the slide canvas (and the board images): pick any item stacked under the pointer (even one hidden
  under a bigger one or locked), then cut, copy, restack, align, lock, hide or delete the selection. On an empty spot:
  paste there, select all, and in the slide editor paste a whole slide, add a text box there or pick the background.
-->
<script lang="ts">
  import { mediaUrls } from '../../lib/media.svelte';
  import type { Game, SlideElement } from '../../lib/model';
  import { LAYER_ICON, layerLabel, type Align, type LayerAction } from '../../lib/layerlabel';

  let {
    x,
    y,
    stack,
    selected,
    game,
    hovered = $bindable(null),
    canPaste,
    slideExtras,
    onpick,
    onaction,
    onclose,
  }: {
    /** Where the menu opens (viewport px). */
    x: number;
    y: number;
    /** Items under the pointer, top-most first. */
    stack: SlideElement[];
    selected: SlideElement[];
    game: Game;
    hovered?: string | null;
    /** There are copied items to paste. */
    canPaste: boolean;
    /** The slide editor's: Paste slide (when one is copied), ＋ Text here and Background…. */
    slideExtras?: { canPasteSlide: boolean };
    onpick: (id: string) => void;
    onaction: (a: LayerAction) => void;
    onclose: () => void;
  } = $props();

  let w = $state(0);
  let h = $state(0);
  // Keep the whole menu on screen.
  const left = $derived(Math.max(4, Math.min(x, window.innerWidth - w - 4)));
  const top = $derived(Math.max(4, Math.min(y, window.innerHeight - h - 4)));
  const anyLocked = $derived(selected.some((e) => e.locked));
  const anyUnlocked = $derived(selected.some((e) => !e.locked));
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const oneImage = $derived(selected.length === 1 && selected[0].kind === 'image');
  const ALIGNS: [Align, string][] = [['left', 'Left'], ['hcenter', 'Center'], ['right', 'Right'], ['top', 'Top'], ['vcenter', 'Middle'], ['bottom', 'Bottom']];
  /** Align ▸ is open. */
  let aligning = $state(false);

  function act(a: LayerAction): void {
    onaction(a);
    onclose();
  }

  function onkey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydowncapture={onkey} onblur={onclose} />

<div
  class="backdrop"
  onpointerdown={onclose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onclose();
  }}
  role="presentation"
></div>
<div class="menu" style:left="{left}px" style:top="{top}px" bind:clientWidth={w} bind:clientHeight={h} role="menu" aria-label="Slide item menu">
  {#if stack.length > 1}
    <div class="head">Select an item here</div>
    {#each stack as el (el.id)}
      {@const thumb = el.kind === 'image' ? mediaUrls[el.editedMedia ?? el.media] : undefined}
      <button
        class="pick"
        class:on={selected.some((s) => s.id === el.id)}
        role="menuitemradio"
        aria-checked={selected.some((s) => s.id === el.id)}
        onclick={() => (onpick(el.id), onclose())}
        onpointerenter={() => (hovered = el.id)}
        onpointerleave={() => hovered === el.id && (hovered = null)}
      >
        {#if thumb}<img src={thumb} alt="" />{:else}<span class="ic">{LAYER_ICON[el.kind]}</span>{/if}
        <span class="txt">{layerLabel(el, game)}</span>
        {#if el.locked}<span class="muted">🔒</span>{/if}
      </button>
    {/each}
    {#if selected.length}<hr />{/if}
  {/if}
  {#if selected.length}
    <button role="menuitem" onclick={() => act('cut')} disabled={!anyUnlocked}>✂ Cut<kbd>{mod}X</kbd></button>
    <button role="menuitem" onclick={() => act('copy')}>📋 Copy<kbd>{mod}C</kbd></button>
    <button role="menuitem" onclick={() => act('paste')} disabled={!canPaste}>Paste<kbd>{mod}V</kbd></button>
    <hr />
    <button role="menuitem" onclick={() => act('front')}>Bring to front<kbd>{mod}Shift+]</kbd></button>
    <button role="menuitem" onclick={() => act('forward')}>Bring forward<kbd>{mod}]</kbd></button>
    <button role="menuitem" onclick={() => act('backward')}>Send backward<kbd>{mod}[</kbd></button>
    <button role="menuitem" onclick={() => act('back')}>Send to back<kbd>{mod}Shift+[</kbd></button>
    <hr />
    <button role="menuitem" onclick={() => act('duplicate')}>Duplicate<kbd>{mod}D</kbd></button>
    {#if oneImage}<button role="menuitem" onclick={() => act('edit-image')}>✎ Edit image…<kbd>Double-click</kbd></button>{/if}
    <button role="menuitem" aria-haspopup="true" aria-expanded={aligning} onclick={() => (aligning = !aligning)} disabled={!anyUnlocked}>
      Align<kbd>{aligning ? '▾' : '▸'}</kbd>
    </button>
    {#if aligning}
      <div class="aligns" role="group" aria-label="Align to the slide">
        {#each ALIGNS as [how, label] (how)}<button role="menuitem" onclick={() => act(`align-${how}`)}>{label}</button>{/each}
      </div>
    {/if}
    {#if anyUnlocked}<button role="menuitem" onclick={() => act('lock')}>🔒 Lock</button>{/if}
    {#if anyLocked}<button role="menuitem" onclick={() => act('unlock')}>🔓 Unlock</button>{/if}
    <button role="menuitem" onclick={() => act('hide')}>Hide while editing</button>
    <hr />
    <button role="menuitem" class="bad" onclick={() => act('delete')} disabled={!anyUnlocked}>Delete<kbd>Del</kbd></button>
  {:else}
    <button role="menuitem" onclick={() => act('paste')} disabled={!canPaste}>Paste here<kbd>{mod}V</kbd></button>
    {#if slideExtras}<button role="menuitem" onclick={() => act('paste-slide')} disabled={!slideExtras.canPasteSlide}>Paste slide</button>{/if}
    <button role="menuitem" onclick={() => act('select-all')}>Select all<kbd>{mod}A</kbd></button>
    {#if slideExtras}
      <hr />
      <button role="menuitem" onclick={() => act('add-text')}>＋ Text here</button>
      <button role="menuitem" onclick={() => act('background')}>🖼 Background…</button>
    {/if}
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 290;
  }
  .menu {
    position: fixed;
    z-index: 300;
    min-width: 220px;
    max-width: 320px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .head {
    padding: 4px 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: none;
    border: none;
    border-radius: 5px;
    text-align: left;
    font-size: 13px;
  }
  button:hover:not(:disabled) {
    background: var(--panel-2);
  }
  button.on {
    color: var(--accent);
    font-weight: 600;
  }
  button.bad {
    color: var(--bad);
  }
  kbd {
    margin-left: auto;
    padding-left: 16px;
    font-family: inherit;
    font-size: 12px;
    color: var(--muted);
  }
  .aligns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 0 0 2px 16px;
  }
  .aligns button {
    justify-content: center;
    font-size: 12px;
  }
  .pick img {
    width: 28px;
    height: 18px;
    object-fit: cover;
    border-radius: 3px;
    flex: none;
  }
  .ic {
    width: 28px;
    text-align: center;
    flex: none;
  }
  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }
</style>
